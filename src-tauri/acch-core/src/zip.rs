// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
//! ZIP (tappa I7): lo stesso archivio che scrive JSZip 3.10 (vendor/jszip.min.js, lib/generate/ZipFileWorker.js), campo per campo:
//! intestazioni locali e centrali, versione 10, «made by» DOS 2.0, flag 0x0800 e campo Info-ZIP Unicode Path (0x7075) per i nomi
//! non ASCII, attributo 0x10 per le cartelle, nessun data descriptor, nessun commento. Nomi, ordine, date e metodo di compressione
//! li decide il JS (app/calc-core.js li prende dall'oggetto JSZip): qui si scrivono e basta.
//! - STORE: archivio identico byte per byte a quello di JSZip.
//! - DEFLATE: stessi file, stessi byte decompressi, stesso CRC-32; i byte compressi sono di miniz_oxide (livello 6) e non di pako,
//!   quindi le dimensioni compresse e gli scostamenti cambiano (test/unit/dual-zip.test.js lo verifica e lo spiega).

/// richiesta «ACZ1»: u32 numero di voci; per voce u32 lunghezza del nome, nome UTF-8, u8 cartella, u8 metodo (0 o 8), u16 ora DOS,
/// u16 data DOS, u32 lunghezza dei dati; poi i dati delle voci, uno dopo l'altro
pub struct Entry<'a> {
    pub name: &'a [u8],
    pub dir: bool,
    pub method: u16,
    pub time: u16,
    pub date: u16,
    pub data: &'a [u8],
}
pub fn parse(b: &[u8]) -> Result<Vec<Entry<'_>>, String> {
    let short = || "zip-short".to_string();
    let u32at = |o: usize| -> Result<u32, String> { b.get(o..o + 4).map(|s| u32::from_le_bytes([s[0], s[1], s[2], s[3]])).ok_or_else(short) };
    let u16at = |o: usize| -> Result<u16, String> { b.get(o..o + 2).map(|s| u16::from_le_bytes([s[0], s[1]])).ok_or_else(short) };
    if b.len() < 8 || &b[0..4] != b"ACZ1" {
        return Err("zip-magic".into());
    }
    let n = u32at(4)? as usize;
    if n > 65535 {
        return Err("zip-entries".into());
    }
    let mut o = 8;
    let mut heads = Vec::with_capacity(n);
    for _ in 0..n {
        let nl = u32at(o)? as usize;
        if nl > 65535 {
            return Err("zip-name".into());
        }
        let name = b.get(o + 4..o + 4 + nl).ok_or_else(short)?;
        o += 4 + nl;
        let dir = *b.get(o).ok_or_else(short)? != 0;
        let method = *b.get(o + 1).ok_or_else(short)? as u16;
        if method != 0 && method != 8 {
            return Err("zip-method".into());
        }
        let time = u16at(o + 2)?;
        let date = u16at(o + 4)?;
        let len = u32at(o + 6)? as usize;
        o += 10;
        heads.push((name, dir, method, time, date, len));
    }
    let mut out = Vec::with_capacity(n);
    for (name, dir, method, time, date, len) in heads {
        let data = b.get(o..o + len).ok_or_else(short)?;
        o += len;
        out.push(Entry { name, dir, method, time, date, data });
    }
    if o != b.len() {
        return Err("zip-size".into());
    }
    Ok(out)
}

/// CRC-32 (IEEE 802.3, come crc32 di JSZip), a tabelle «slicing by 8»
pub fn crc32(data: &[u8]) -> u32 {
    static T: std::sync::OnceLock<[[u32; 256]; 8]> = std::sync::OnceLock::new();
    let t = T.get_or_init(|| {
        let mut t = [[0u32; 256]; 8];
        for i in 0..256u32 {
            let mut c = i;
            for _ in 0..8 {
                c = if c & 1 != 0 { 0xEDB8_8320 ^ (c >> 1) } else { c >> 1 };
            }
            t[0][i as usize] = c;
        }
        for i in 0..256 {
            for k in 1..8 {
                let p = t[k - 1][i];
                t[k][i] = (p >> 8) ^ t[0][(p & 0xFF) as usize];
            }
        }
        t
    });
    let mut c: u32 = !0;
    let mut ch = data.chunks_exact(8);
    for b in &mut ch {
        let lo = c ^ u32::from_le_bytes([b[0], b[1], b[2], b[3]]);
        c = t[7][(lo & 0xFF) as usize]
            ^ t[6][((lo >> 8) & 0xFF) as usize]
            ^ t[5][((lo >> 16) & 0xFF) as usize]
            ^ t[4][(lo >> 24) as usize]
            ^ t[3][b[4] as usize]
            ^ t[2][b[5] as usize]
            ^ t[1][b[6] as usize]
            ^ t[0][b[7] as usize];
    }
    for &x in ch.remainder() {
        c = t[0][((c ^ x as u32) & 0xFF) as usize] ^ (c >> 8);
    }
    !c
}

/// voci DEFLATE compresse su più thread (al massimo uno per core), le più grandi per prime
fn deflate_all(entries: &[Entry], cancel: &dyn Fn() -> bool) -> Result<Vec<Option<Vec<u8>>>, String> {
    let mut idx: Vec<usize> = (0..entries.len()).filter(|&k| entries[k].method == 8).collect();
    idx.sort_by_key(|&k| std::cmp::Reverse(entries[k].data.len()));
    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1).clamp(1, 8);
    let next = std::sync::atomic::AtomicUsize::new(0);
    let mut out: Vec<Option<Vec<u8>>> = vec![None; entries.len()];
    let done: Vec<(usize, Vec<u8>)> = std::thread::scope(|sc| {
        let hs: Vec<_> = (0..threads.min(idx.len()))
            .map(|_| {
                sc.spawn(|| {
                    let mut mine = Vec::new();
                    loop {
                        let j = next.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                        if j >= idx.len() {
                            break;
                        }
                        let k = idx[j];
                        mine.push((k, miniz_oxide::deflate::compress_to_vec(entries[k].data, 6)));
                    }
                    mine
                })
            })
            .collect();
        hs.into_iter().flat_map(|h| h.join().unwrap_or_default()).collect()
    });
    if cancel() {
        return Err("cancelled".into());
    }
    for (k, v) in done {
        out[k] = Some(v);
    }
    if idx.iter().any(|&k| out[k].is_none()) {
        return Err("zip-deflate".into());
    }
    Ok(out)
}

fn put16(o: &mut Vec<u8>, v: u16) {
    o.extend_from_slice(&v.to_le_bytes());
}
fn put32(o: &mut Vec<u8>, v: u32) {
    o.extend_from_slice(&v.to_le_bytes());
}

/// Scrive l'archivio. `cancel` si controlla fra una voce e l'altra; `progress(fatto, totale)` in byte non compressi.
pub fn write(entries: &[Entry], cancel: &dyn Fn() -> bool, progress: &mut dyn FnMut(usize, usize)) -> Result<Vec<u8>, String> {
    let total: usize = entries.iter().map(|e| e.data.len()).sum();
    // DEFLATE delle voci in parallelo (ogni voce si comprime da sola: stesso risultato che in sequenza), poi l'archivio in ordine
    let packed = deflate_all(entries, cancel)?;
    let mut out: Vec<u8> = Vec::with_capacity(total / 2 + 4096);
    let mut central: Vec<u8> = Vec::new();
    let mut done = 0usize;
    for (k, e) in entries.iter().enumerate() {
        if cancel() {
            return Err("cancelled".into());
        }
        let offset = out.len();
        if offset > u32::MAX as usize {
            return Err("zip-too-large".into());
        }
        let crc = crc32(e.data);
        let body: &[u8] = if e.method == 8 { packed[k].as_deref().unwrap_or(&[]) } else { e.data };
        // nome: JSZip usa UTF-8 e, se il nome non è ASCII (lunghezza UTF-8 ≠ lunghezza in UTF-16), il flag 0x0800 e il campo 0x7075
        let utf16 = std::str::from_utf8(e.name).map_err(|_| "zip-name")?.encode_utf16().count();
        let unicode = e.name.len() != utf16;
        let mut extra: Vec<u8> = Vec::new();
        if unicode {
            extra.extend_from_slice(b"\x75\x70");
            put16(&mut extra, (1 + 4 + e.name.len()) as u16);
            extra.push(1);
            put32(&mut extra, crc32(e.name));
            extra.extend_from_slice(e.name);
        }
        let mut head: Vec<u8> = Vec::with_capacity(26);
        put16(&mut head, 10);
        put16(&mut head, if unicode { 0x0800 } else { 0 });
        put16(&mut head, e.method);
        put16(&mut head, e.time);
        put16(&mut head, e.date);
        put32(&mut head, crc);
        put32(&mut head, body.len() as u32);
        put32(&mut head, e.data.len() as u32);
        put16(&mut head, e.name.len() as u16);
        put16(&mut head, extra.len() as u16);
        out.extend_from_slice(b"PK\x03\x04");
        out.extend_from_slice(&head);
        out.extend_from_slice(e.name);
        out.extend_from_slice(&extra);
        out.extend_from_slice(body);
        central.extend_from_slice(b"PK\x01\x02");
        put16(&mut central, 0x0014);
        central.extend_from_slice(&head);
        put16(&mut central, 0); // commento
        put16(&mut central, 0); // disco
        put16(&mut central, 0); // attributi interni
        put32(&mut central, if e.dir { 0x10 } else { 0 });
        put32(&mut central, offset as u32);
        central.extend_from_slice(e.name);
        central.extend_from_slice(&extra);
        done += e.data.len();
        progress(done, total);
    }
    let cd_off = out.len();
    if cd_off + central.len() > u32::MAX as usize {
        return Err("zip-too-large".into());
    }
    out.extend_from_slice(&central);
    out.extend_from_slice(b"PK\x05\x06");
    put16(&mut out, 0);
    put16(&mut out, 0);
    put16(&mut out, entries.len() as u16);
    put16(&mut out, entries.len() as u16);
    put32(&mut out, central.len() as u32);
    put32(&mut out, cd_off as u32);
    put16(&mut out, 0);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn crc_known() {
        assert_eq!(crc32(b""), 0);
        assert_eq!(crc32(b"123456789"), 0xCBF4_3926);
        let long: Vec<u8> = (0..1000u32).map(|i| (i * 7) as u8).collect();
        let mut c: u32 = !0;
        for &x in &long {
            c ^= x as u32;
            for _ in 0..8 {
                c = if c & 1 != 0 { 0xEDB8_8320 ^ (c >> 1) } else { c >> 1 };
            }
        }
        assert_eq!(crc32(&long), !c);
    }
    #[test]
    fn deflate_roundtrip() {
        let data: Vec<u8> = (0..100000u32).map(|i| (i % 251) as u8).collect();
        let e = [Entry { name: "a/è.dat".as_bytes(), dir: false, method: 8, time: 0, date: 0, data: &data }];
        let z = write(&e, &|| false, &mut |_, _| {}).unwrap();
        assert_eq!(&z[0..4], b"PK\x03\x04");
        assert_eq!(u16::from_le_bytes([z[6], z[7]]), 0x0800);
        let csize = u32::from_le_bytes([z[18], z[19], z[20], z[21]]) as usize;
        let start = 30 + e[0].name.len() + 5 + 4 + e[0].name.len();
        let back = miniz_oxide::inflate::decompress_to_vec(&z[start..start + csize]).unwrap();
        assert_eq!(back, data);
    }
}
