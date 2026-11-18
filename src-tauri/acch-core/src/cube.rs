// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
//! Mappe e dati iperspettrali (tappa I10): gemello di app/map-core.js. Il JS è la specifica: lettori (.wdf, ENVI, testo a mappa,
//! serie OPUS) e calcoli (immagini di banda, spettro di un pixel, spettro medio di una regione, accorpamento) fanno le stesse
//! operazioni nello stesso ordine, quindi danno gli stessi numeri bit per bit (test/unit/dual-mappe.test.js con acch-core-cli --cube).
//! In più, per i cubi grandi del desktop: il cubo può restare sul disco (`Store::File`) e si legge a pezzi, senza tenerlo in memoria,
//! e si scrive/rilegge il file affiancato `.acchcube` dei progetti (DECISIONE I10, vedi docs/FORMATO-ACCHSPETTRI.md).
use crate::js;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

/// Pixel × canali oltre i quali il lettore JS rifiuta (MAXPIX di map-core.js); qui vale solo per i cubi in memoria.
pub const MAXPIX: usize = 1 << 26;
/// Nel desktop (cubi del Rust) il limite in memoria è più alto: oltre, il .wdf si legge dal disco
pub const MAXPIX_NATIVE: usize = 1 << 29;

#[derive(Debug, PartialEq)]
pub struct MapErr(pub String);
fn err<T>(s: &str) -> Result<T, MapErr> {
    Err(MapErr(s.to_string()))
}

#[derive(Clone, Default)]
pub struct Axis {
    pub values: Vec<f64>,
    pub unit: String,
    pub quantity: String,
}
pub enum Data {
    F32(Vec<f32>),
    F64(Vec<f64>),
}
/// Cubo sul disco: spettri (f32 o f64 little-endian) uno dopo l'altro da `offset`; `pix[i]` è il pixel dello spettro i.
pub struct FileSrc {
    pub path: PathBuf,
    pub offset: u64,
    pub f64: bool,
    pub pix: Vec<u32>,
    /// pixel → spettro (−1 se non misurato)
    pub inv: Vec<i32>,
}
pub enum Store {
    Mem(Data),
    File(FileSrc),
}
pub struct Cube {
    pub nx: usize,
    pub ny: usize,
    pub nc: usize,
    pub store: Store,
    pub x: Axis,
    pub px: Axis,
    pub py: Axis,
    pub yq: String,
    /// oggetto JSON con i metadati (stessi campi di map-core.js)
    pub meta: String,
}

fn u32le(u: &[u8], o: usize) -> u32 {
    u32::from_le_bytes([u[o], u[o + 1], u[o + 2], u[o + 3]])
}
fn i32le(u: &[u8], o: usize) -> i32 {
    u32le(u, o) as i32
}
fn u64le(u: &[u8], o: usize) -> f64 {
    // come u64() del JS: due metà u32 in f64
    u32le(u, o) as f64 + u32le(u, o + 4) as f64 * 4294967296.0
}
fn f32le(u: &[u8], o: usize) -> f32 {
    f32::from_le_bytes([u[o], u[o + 1], u[o + 2], u[o + 3]])
}
fn f64le(u: &[u8], o: usize) -> f64 {
    let mut b = [0u8; 8];
    b.copy_from_slice(&u[o..o + 8]);
    f64::from_le_bytes(b)
}
/// `ascii()` del JS: caratteri fino al primo zero
fn ascii(u: &[u8], a: usize, b: usize) -> String {
    let mut s = String::new();
    for &c in u.iter().take(b.min(u.len())).skip(a) {
        if c == 0 {
            break;
        }
        s.push(c as char);
    }
    s
}
fn utf8z(u: &[u8], a: usize, b: usize) -> String {
    let mut e = a;
    while e < b && e < u.len() && u[e] != 0 {
        e += 1;
    }
    String::from_utf8_lossy(&u[a.min(u.len())..e]).into_owned()
}
fn jstr(s: &str) -> String {
    let mut o = String::new();
    js::json_str(&mut o, s);
    o
}

/* ---------------- Renishaw .wdf ---------------- */
pub struct WdfInfo {
    pub pps: usize,
    pub capacity: usize,
    pub count: usize,
    pub accumulations: i32,
    pub norigin: i32,
    pub app: String,
    pub version: String,
    pub scan: i32,
    pub measurement: i32,
    pub data_unit: i32,
    pub laser: f32,
    pub title: String,
    pub data_pos: usize,
    pub xlst_pos: usize,
    pub x_unit: i32,
    pub orgn: [Option<Vec<f64>>; 3],
    pub wmap: Option<(u32, f32, f32, f32, f32, i32, i32)>,
}
/// blocchi: nome → (inizio, lunghezza) della prima occorrenza
fn wdf_blocks(u: &[u8]) -> Vec<(String, usize, f64)> {
    let mut out: Vec<(String, usize, f64)> = Vec::new();
    let mut p = 0usize;
    while p + 16 <= u.len() {
        let size = u64le(u, p + 8);
        if !(size >= 16.0) || !u[p..p + 4].iter().all(|&c| (0x20..=0x7e).contains(&c)) {
            break;
        }
        let name = ascii(u, p, p + 4);
        out.push((name, p, size));
        let np = p as f64 + size;
        if np > u.len() as f64 + 16.0 {
            break;
        }
        p = np as usize;
    }
    out
}
pub fn wdf_info(u: &[u8]) -> Result<WdfInfo, MapErr> {
    wdf_info_ext(u, None)
}
/// `ext`: (inizio del blocco DATA nel file, lunghezza del file) quando `u` contiene il file senza i dati (lettura dal disco)
pub fn wdf_info_ext(u: &[u8], ext: Option<(usize, u64)>) -> Result<WdfInfo, MapErr> {
    if u.len() < 512 || &u[0..4] != b"WDF1" {
        return err("not-wdf");
    }
    let bl = wdf_blocks(u);
    let find = |n: &str| bl.iter().find(|b| b.0 == n).map(|b| (b.1, b.2));
    let (Some(data), Some(xlst)) = (find("DATA"), find("XLST")) else { return err("wdf-blocks") };
    let pps = i32le(u, 0x3c);
    let capacity = u64le(u, 0x40);
    let count = u64le(u, 0x48);
    let xlen = i32le(u, 0x58);
    if !(pps > 0) || !(count > 0.0) || count > capacity || xlen != pps {
        return err("wdf-header");
    }
    let (pps, capacity, count) = (pps as usize, capacity as usize, count as usize);
    let (dpos, flen) = match ext {
        Some((p, l)) => (p, l as f64),
        None => (data.0, u.len() as f64),
    };
    if (dpos + 16) as f64 + 4.0 * count as f64 * pps as f64 > flen {
        return err("truncated");
    }
    let xl = xlst.0 + 16;
    if xl + 8 + 4 * pps > u.len() {
        return err("truncated");
    }
    let norigin = i32le(u, 0x5c);
    let mut orgn: [Option<Vec<f64>>; 3] = [None, None, None];
    if let Some((op, os)) = find("ORGN") {
        if norigin > 0 {
            let step = 0x18 + 8 * capacity;
            let mut c = op + 0x14;
            let mut k = 0;
            while k < norigin && c + step <= op + os as usize && c + step <= u.len() {
                let dt = u32le(u, c) & 0x7fff_ffff;
                if (3..=5).contains(&dt) {
                    let v: Vec<f64> = (0..count).map(|i| f64le(u, c + 24 + 8 * i)).collect();
                    let slot = (dt - 3) as usize;
                    if orgn[slot].is_none() {
                        orgn[slot] = Some(v);
                    } else {
                        orgn[slot] = Some(v);
                    }
                }
                k += 1;
                c += step;
            }
        }
    }
    let wmap = find("WMAP").filter(|w| w.1 >= 56.0 && w.0 + 0x38 <= u.len()).map(|(w, _)| {
        (u32le(u, w + 0x10), f32le(u, w + 0x18), f32le(u, w + 0x1c), f32le(u, w + 0x24), f32le(u, w + 0x28), i32le(u, w + 0x30), i32le(u, w + 0x34))
    });
    let version = (0..4).map(|k| u16::from_le_bytes([u[0x78 + 2 * k], u[0x79 + 2 * k]]).to_string()).collect::<Vec<_>>().join(".");
    Ok(WdfInfo {
        pps,
        capacity,
        count,
        accumulations: i32le(u, 0x50),
        norigin,
        app: ascii(u, 0x60, 0x78),
        version,
        scan: i32le(u, 0x80),
        measurement: i32le(u, 0x84),
        data_unit: i32le(u, 0x98),
        laser: f32le(u, 0x9c),
        title: utf8z(u, 0xf0, 0x200),
        data_pos: dpos + 16,
        xlst_pos: xl,
        x_unit: i32le(u, xl + 4),
        orgn,
        wmap,
    })
}
/// (wdfPlace) nx, ny, pixel di ogni spettro, come, x0 e y0 (se dalle coordinate)
pub fn wdf_place(i: &WdfInfo) -> (usize, usize, Vec<u32>, &'static str, Option<(f64, f64)>) {
    let n = i.count;
    let ident = || (0..n as u32).collect::<Vec<u32>>();
    if let Some((_, _, _, dx, dy, w, h)) = i.wmap {
        if w > 0 && h > 0 && (w as usize) * (h as usize) == i.capacity && w > 1 && h > 1 {
            let (nx, ny) = (w as usize, h as usize);
            if let (Some(xv), Some(yv)) = (&i.orgn[0], &i.orgn[1]) {
                if dx > 0.0 && dy > 0.0 {
                    let (dx, dy) = (dx as f64, dy as f64);
                    let (mut x0, mut y0) = (f64::INFINITY, f64::INFINITY);
                    for k in 0..n {
                        if xv[k] < x0 {
                            x0 = xv[k];
                        }
                        if yv[k] < y0 {
                            y0 = yv[k];
                        }
                    }
                    let mut idx = vec![0u32; n];
                    let mut seen = vec![false; nx * ny];
                    let mut ok = true;
                    for k in 0..n {
                        let ix = crate::calc::js_round((xv[k] - x0) / dx);
                        let iy = crate::calc::js_round((yv[k] - y0) / dy);
                        if !(ix >= 0.0 && ix < nx as f64 && iy >= 0.0 && iy < ny as f64) {
                            ok = false;
                            break;
                        }
                        let p = iy as usize * nx + ix as usize;
                        if seen[p] {
                            ok = false;
                            break;
                        }
                        seen[p] = true;
                        idx[k] = p as u32;
                    }
                    if ok {
                        return (nx, ny, idx, "position", Some((x0, y0)));
                    }
                }
            }
            return (nx, ny, ident(), "raster", None);
        }
    }
    (i.capacity, 1, ident(), "line", None)
}
fn wdf_unit(u: i32) -> &'static str {
    match u {
        1 | 2 => "cm-1",
        3 => "nm",
        4 => "eV",
        5 => "µm",
        8 => "mm",
        9 => "m",
        12 => "s",
        13 => "ms",
        16 => "px",
        _ => "",
    }
}
/// (readWdf) `file`: se c'è, il cubo resta sul disco (cubi grandi del desktop), altrimenti in memoria come nel JS
/// .wdf grande letto dal disco: si leggono intestazione e blocchi tranne DATA (la RAM non cresce con il cubo)
pub fn read_wdf_disk(path: &Path) -> Result<Cube, MapErr> {
    let io = |e: std::io::Error| MapErr(format!("read-failed: {}", e.kind()));
    let mut f = File::open(path).map_err(io)?;
    let total = f.metadata().map_err(io)?.len();
    let mut compact: Vec<u8> = Vec::new();
    let mut pos: u64 = 0;
    let mut data: Option<usize> = None;
    while pos + 16 <= total {
        let mut h = [0u8; 16];
        f.seek(SeekFrom::Start(pos)).map_err(io)?;
        f.read_exact(&mut h).map_err(io)?;
        let size = u64le(&h, 8);
        if !(size >= 16.0) || !h[0..4].iter().all(|&c| (0x20..=0x7e).contains(&c)) {
            break;
        }
        let size = size as u64;
        if &h[0..4] == b"DATA" && data.is_none() {
            data = Some(pos as usize);
            let mut hh = h;
            hh[8..16].copy_from_slice(&16u64.to_le_bytes());
            compact.extend_from_slice(&hh);
        } else {
            if size > 1 << 30 {
                return err("wdf-blocks");
            }
            let n = size.min(total - pos) as usize;
            let mut b = vec![0u8; n];
            f.seek(SeekFrom::Start(pos)).map_err(io)?;
            f.read_exact(&mut b).map_err(io)?;
            compact.extend_from_slice(&b);
        }
        pos += size;
    }
    let Some(dp) = data else { return err("wdf-blocks") };
    let i = wdf_info_ext(&compact, Some((dp, total)))?;
    wdf_cube(&compact, i, Some(path))
}
pub fn read_wdf(u: &[u8], file: Option<&Path>) -> Result<Cube, MapErr> {
    let i = wdf_info(u)?;
    wdf_cube(u, i, file)
}
fn wdf_cube(u: &[u8], i: WdfInfo, file: Option<&Path>) -> Result<Cube, MapErr> {
    let (nx, ny, idx, how, xy0) = wdf_place(&i);
    let nc = i.pps;
    let np = nx * ny;
    let x: Vec<f64> = (0..nc).map(|j| f32le(u, i.xlst_pos + 8 + 4 * j) as f64).collect();
    let store = match file {
        Some(p) => {
            let mut inv = vec![-1i32; np];
            for (k, &q) in idx.iter().enumerate() {
                inv[q as usize] = k as i32;
            }
            Store::File(FileSrc { path: p.to_path_buf(), offset: i.data_pos as u64, f64: false, pix: idx.clone(), inv })
        }
        None => {
            if np * nc > MAXPIX {
                return Err(MapErr(format!("too-large: {}", np * nc)));
            }
            let mut data = vec![f32::NAN; np * nc];
            for k in 0..i.count {
                let q = idx[k] as usize;
                for j in 0..nc {
                    data[q * nc + j] = f32le(u, i.data_pos + 4 * (k * nc + j));
                }
            }
            Store::Mem(Data::F32(data))
        }
    };
    let (mut px, mut py, mut pu) = (vec![0.0; nx], vec![0.0; ny], "µm");
    if ny > 1 {
        let w = i.wmap.unwrap();
        let (x0, y0) = match xy0 {
            Some(v) => v,
            None => (i.orgn[0].as_ref().map(|v| v[0]).unwrap_or(0.0), i.orgn[1].as_ref().map(|v| v[0]).unwrap_or(0.0)),
        };
        for k in 0..nx {
            px[k] = x0 + k as f64 * w.3 as f64;
        }
        for k in 0..ny {
            py[k] = y0 + k as f64 * w.4 as f64;
        }
    } else {
        py = vec![0.0];
        match (&i.orgn[0], &i.orgn[1], &i.orgn[2]) {
            (Some(xv), Some(yv), _) => {
                for k in 1..i.count {
                    let a = xv[k] - xv[k - 1];
                    let b = yv[k] - yv[k - 1];
                    px[k] = px[k - 1] + (a * a + b * b).sqrt();
                }
                for k in i.count.max(1)..nx {
                    px[k] = px[k - 1] + 1.0;
                }
            }
            (_, _, Some(z)) => {
                for k in 0..nx {
                    px[k] = if k < i.count { z[k] } else { px[k - 1] + 1.0 };
                }
            }
            _ => {
                pu = "";
                for (k, v) in px.iter_mut().enumerate() {
                    *v = k as f64;
                }
            }
        }
    }
    let laser = if i.laser > 0.0 { format!("{}", ((1e7 / i.laser as f64) * 1000.0).round() / 1000.0) } else { "null".into() };
    let meta = format!(
        "{{\"format\":\"wdf\",\"title\":{},\"app\":{},\"laserNm\":{},\"accumulations\":{},\"measurement\":{},\"scan\":{},\"spectra\":{},\"capacity\":{},\"placement\":\"{}\",\"complete\":{}}}",
        jstr(&i.title),
        jstr(format!("{} {}", i.app, i.version).trim()),
        laser,
        i.accumulations,
        i.measurement,
        i.scan,
        i.count,
        i.capacity,
        how,
        i.count == i.capacity
    );
    Ok(Cube {
        nx,
        ny,
        nc,
        store,
        x: Axis { values: x, unit: wdf_unit(i.x_unit).into(), quantity: if i.x_unit == 1 { "Raman shift".into() } else { String::new() } },
        px: Axis { values: px, unit: pu.into(), quantity: String::new() },
        py: Axis { values: py, unit: pu.into(), quantity: String::new() },
        yq: if i.data_unit == 6 { "counts".into() } else { "intensity".into() },
        meta,
    })
}

/* ---------------- ENVI ---------------- */
pub struct EnviHdr {
    pub samples: usize,
    pub lines: usize,
    pub bands: usize,
    pub data_type: i64,
    pub offset: usize,
    pub interleave: String,
    pub byte_order: i64,
    pub wavelength: Option<Vec<f64>>,
    pub wl_units: String,
    pub map_info: Option<Vec<String>>,
    pub ignore: Option<f64>,
    pub description: String,
}
/// `parseInt(s, 10)`
fn parse_int(s: &str) -> Option<i64> {
    let t = s.trim_start_matches(js::is_ws);
    let b = t.as_bytes();
    let mut i = 0;
    if i < b.len() && (b[i] == b'+' || b[i] == b'-') {
        i += 1;
    }
    let d0 = i;
    while i < b.len() && b[i].is_ascii_digit() {
        i += 1;
    }
    if i == d0 {
        return None;
    }
    t[..i].parse::<f64>().ok().map(|v| v as i64)
}
/// `Number(s)` per i valori numerici dell'intestazione (spazi ai lati; vuoto = 0)
fn js_number(s: &str) -> f64 {
    let t = js::trim(s);
    if t.is_empty() {
        return 0.0;
    }
    match t.parse::<f64>() {
        Ok(v) if !t.contains(|c: char| c.is_alphabetic() && c != 'e' && c != 'E') || t.ends_with("Infinity") => v,
        _ => f64::NAN,
    }
}
pub fn parse_envi_header(text: &str) -> Result<EnviHdr, MapErr> {
    let s = text.strip_prefix('\u{FEFF}').unwrap_or(text);
    let st = s.trim_start_matches(js::is_ws);
    if !st.starts_with("ENVI") || st[4..].chars().next().map(|c| c.is_alphanumeric() || c == '_').unwrap_or(false) {
        return err("not-envi");
    }
    // /^\s*([^=\n\r{}]+?)\s*=\s*(\{[\s\S]*?\}|[^\r\n]*)/gm
    let mut h: Vec<(String, Result<String, Vec<String>>)> = Vec::new();
    let b: Vec<char> = s.chars().collect();
    let mut pos = 0usize;
    let line_start = |p: usize| p == 0 || matches!(b[p - 1], '\n' | '\r' | '\u{2028}' | '\u{2029}');
    'outer: while pos < b.len() {
        // prossima posizione d'inizio riga da cui la regola combacia
        let mut st = pos;
        loop {
            if st > b.len() {
                break 'outer;
            }
            if st == b.len() {
                break 'outer;
            }
            if line_start(st) {
                if let Some((k, v, end)) = envi_match(&b, st) {
                    h.push((k, v));
                    pos = if end > st { end } else { st + 1 };
                    continue 'outer;
                }
            }
            st += 1;
        }
    }
    let get = |k: &str| h.iter().rev().find(|e| e.0 == k).map(|e| &e.1);
    let int = |k: &str| match get(k) {
        Some(Ok(v)) => parse_int(v),
        Some(Err(l)) => parse_int(&l.join(",")),
        None => None,
    };
    let (sa, li, ba, dt) = (int("samples"), int("lines"), int("bands"), int("data type"));
    let (Some(sa), Some(li), Some(ba), Some(dt)) = (sa, li, ba, dt) else { return err("envi-header") };
    if !(sa > 0 && li > 0 && ba > 0) {
        return err("envi-header");
    }
    let wavelength = match get("wavelength") {
        Some(Err(l)) => {
            let v: Vec<f64> = l.iter().map(|t| js_number(t)).collect();
            if v.len() == ba as usize && v.iter().all(|x| x.is_finite()) {
                Some(v)
            } else {
                None
            }
        }
        _ => None,
    };
    let sv = |k: &str| match get(k) {
        Some(Ok(v)) => v.clone(),
        _ => String::new(),
    };
    let ignore = match get("data ignore value") {
        Some(Ok(v)) => {
            let n = js_number(v);
            if n.is_finite() {
                Some(n)
            } else {
                None
            }
        }
        _ => None,
    };
    let interleave = match get("interleave") {
        Some(Ok(v)) => v.to_lowercase(),
        Some(Err(l)) => l.join(",").to_lowercase(),
        None => "bsq".into(),
    };
    let interleave = if interleave.is_empty() { "bsq".to_string() } else { interleave };
    Ok(EnviHdr {
        samples: sa as usize,
        lines: li as usize,
        bands: ba as usize,
        data_type: dt,
        offset: int("header offset").unwrap_or(0).max(0) as usize,
        interleave,
        byte_order: int("byte order").unwrap_or(0),
        wavelength,
        wl_units: sv("wavelength units"),
        map_info: match get("map info") {
            Some(Err(l)) => Some(l.clone()),
            _ => None,
        },
        ignore,
        description: match get("description") {
            Some(Err(l)) => l.join(", "),
            Some(Ok(v)) => v.clone(),
            None => String::new(),
        },
    })
}
fn envi_match(b: &[char], st: usize) -> Option<(String, Result<String, Vec<String>>, usize)> {
    let ws = |c: char| js::is_ws(c);
    let mut p = st;
    while p < b.len() && ws(b[p]) {
        p += 1;
    }
    // chiave: almeno un carattere fra quelli ammessi, il più corto possibile prima di \s*=
    let k0 = p;
    let mut q = p;
    while q < b.len() && !matches!(b[q], '=' | '\n' | '\r' | '{' | '}') {
        q += 1;
    }
    if q == k0 || q >= b.len() || b[q] != '=' {
        // il \s* iniziale può aver consumato a vuoto: con [^=\n\r{}] che ammette spazi la regola equivale
        return None;
    }
    let key: String = b[k0..q].iter().collect::<String>();
    let key = js::trim(&key).to_lowercase();
    if key.is_empty() {
        return None;
    }
    let mut v = q + 1;
    while v < b.len() && ws(b[v]) {
        v += 1;
    }
    if v < b.len() && b[v] == '{' {
        if let Some(e) = (v + 1..b.len()).find(|&i| b[i] == '}') {
            let inner: String = b[v + 1..e].iter().collect();
            let list: Vec<String> = inner.split(',').map(|t| js::trim(t).to_string()).filter(|t| !t.is_empty()).collect();
            return Some((key, Err(list), e + 1));
        }
    }
    let mut e = v;
    while e < b.len() && b[e] != '\r' && b[e] != '\n' {
        e += 1;
    }
    let val: String = b[v..e].iter().collect();
    let val = js::trim(&val).to_string();
    // come il JS: un valore che comincia con «{» senza chiusura diventa comunque una lista (senza il primo e l'ultimo carattere)
    if val.starts_with('{') {
        let u: Vec<u16> = val.encode_utf16().collect();
        let inner = String::from_utf16_lossy(&u[1..u.len().saturating_sub(1).max(1)]);
        let list: Vec<String> = inner.split(',').map(|t| js::trim(t).to_string()).filter(|t| !t.is_empty()).collect();
        return Some((key, Err(list), e));
    }
    Some((key, Ok(val), e))
}
fn envi_unit(u: &str) -> String {
    let s = u.to_lowercase();
    if s.contains("nanomet") || s == "nm" {
        "nm".into()
    } else if s.contains("micromet") || s.contains("micron") || s == "um" || s == "µm" {
        "µm".into()
    } else if s.contains("wavenumber") || s.contains("cm-1") || s.contains("1/cm") {
        "cm-1".into()
    } else {
        u.to_string()
    }
}
pub fn read_envi(h: &EnviHdr, u: &[u8]) -> Result<Cube, MapErr> {
    let bz: usize = match h.data_type {
        1 => 1,
        2 | 12 => 2,
        3 | 4 | 13 => 4,
        5 | 14 | 15 => 8,
        _ => return Err(MapErr(format!("envi-type: {}", h.data_type))),
    };
    let (s, l, bn) = (h.samples, h.lines, h.bands);
    if !matches!(h.interleave.as_str(), "bsq" | "bil" | "bip") {
        return Err(MapErr(format!("envi-interleave: {}", h.interleave)));
    }
    let n = s * l * bn;
    if n > MAXPIX {
        return Err(MapErr(format!("too-large: {}", n)));
    }
    let o = h.offset;
    if o + n * bz > u.len() {
        return err("truncated");
    }
    let le = h.byte_order != 1;
    let rd = |i: usize| -> f64 {
        let a = o + i * bz;
        let mut b8 = [0u8; 8];
        b8[..bz].copy_from_slice(&u[a..a + bz]);
        if !le {
            b8[..bz].reverse();
        }
        match h.data_type {
            1 => b8[0] as f64,
            2 => i16::from_le_bytes([b8[0], b8[1]]) as f64,
            12 => u16::from_le_bytes([b8[0], b8[1]]) as f64,
            3 => i32::from_le_bytes([b8[0], b8[1], b8[2], b8[3]]) as f64,
            13 => u32::from_le_bytes([b8[0], b8[1], b8[2], b8[3]]) as f64,
            4 => f32::from_le_bytes([b8[0], b8[1], b8[2], b8[3]]) as f64,
            5 => f64::from_le_bytes(b8),
            14 => i64::from_le_bytes(b8) as f64,
            _ => u64::from_le_bytes(b8) as f64,
        }
    };
    let at = |si: usize, li: usize, b: usize| match h.interleave.as_str() {
        "bsq" => (b * l + li) * s + si,
        "bil" => (li * bn + b) * s + si,
        _ => (li * s + si) * bn + b,
    };
    let f32t = matches!(h.data_type, 1 | 2 | 4 | 12);
    let mut v32 = if f32t { Vec::with_capacity(n) } else { Vec::new() };
    let mut v64 = if f32t { Vec::new() } else { Vec::with_capacity(n) };
    for li in 0..l {
        for si in 0..s {
            for b in 0..bn {
                let mut v = rd(at(si, li, b));
                if let Some(ig) = h.ignore {
                    if v == ig {
                        v = f64::NAN;
                    }
                }
                if f32t {
                    v32.push(v as f32);
                } else {
                    v64.push(v);
                }
            }
        }
    }
    let mut px: Vec<f64> = (0..s).map(|i| i as f64).collect();
    let mut py: Vec<f64> = (0..l).map(|i| i as f64).collect();
    let mut pu = "px".to_string();
    if let Some(m) = &h.map_info {
        if m.len() >= 7 {
            let g = |k: usize| js_number(&m[k]);
            let (ex, nn, dx, dy, rx, ry) = (g(3), g(4), g(5), g(6), g(1), g(2));
            if [ex, nn, dx, dy, rx, ry].iter().all(|v| v.is_finite()) && dx > 0.0 && dy > 0.0 {
                px = (0..s).map(|i| ex + ((i + 1) as f64 - rx) * dx).collect();
                py = (0..l).map(|i| nn - ((i + 1) as f64 - ry) * dy).collect();
                pu = m
                    .iter()
                    .find(|t| {
                        let tl = t.trim_start_matches(js::is_ws).to_lowercase();
                        tl.starts_with("units") && tl[5..].trim_start_matches(js::is_ws).starts_with('=')
                    })
                    .map(|t| js::trim(t.split('=').nth(1).unwrap_or("")).to_string())
                    .unwrap_or_default();
            }
        }
    }
    let (x, xu, xq) = match &h.wavelength {
        Some(w) => (w.clone(), envi_unit(&h.wl_units), "wavelength"),
        None => ((1..=bn).map(|i| i as f64).collect(), String::new(), "band"),
    };
    let desc: String = h.description.encode_utf16().take(300).collect::<Vec<u16>>().iter().map(|&c| char::from_u32(c as u32).unwrap_or('\u{FFFD}')).collect();
    let meta = format!(
        "{{\"format\":\"envi\",\"interleave\":{},\"dataType\":{},\"byteOrder\":{},\"description\":{}}}",
        jstr(&h.interleave),
        h.data_type,
        h.byte_order,
        jstr(&desc)
    );
    Ok(Cube {
        nx: s,
        ny: l,
        nc: bn,
        store: Store::Mem(if f32t { Data::F32(v32) } else { Data::F64(v64) }),
        x: Axis { values: x, unit: xu, quantity: xq.into() },
        px: Axis { values: px, unit: pu.clone(), quantity: String::new() },
        py: Axis { values: py, unit: pu, quantity: String::new() },
        yq: "intensity".into(),
        meta,
    })
}

/* ---------------- testo a mappa ---------------- */
/// /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/
fn is_num(t: &str) -> bool {
    let b = t.as_bytes();
    let mut i = 0;
    if i < b.len() && (b[i] == b'+' || b[i] == b'-') {
        i += 1;
    }
    let d0 = i;
    while i < b.len() && b[i].is_ascii_digit() {
        i += 1;
    }
    if i > d0 {
        if i < b.len() && b[i] == b'.' {
            i += 1;
            while i < b.len() && b[i].is_ascii_digit() {
                i += 1;
            }
        }
    } else {
        if !(i < b.len() && b[i] == b'.') {
            return false;
        }
        i += 1;
        let f0 = i;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
        if i == f0 {
            return false;
        }
    }
    if i < b.len() && (b[i] == b'e' || b[i] == b'E') {
        i += 1;
        if i < b.len() && (b[i] == b'+' || b[i] == b'-') {
            i += 1;
        }
        let e0 = i;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
        if i == e0 {
            return false;
        }
    }
    i == b.len()
}
fn num_cell(t: &str, comma: bool) -> Option<f64> {
    let s = if comma { t.replacen(',', ".", 1) } else { t.to_string() };
    if is_num(&s) {
        js::parse_float(&s)
    } else {
        None
    }
}
#[derive(Clone, Copy, PartialEq)]
enum Sep {
    Ch(char),
    Ws,
}
fn split_cells(line: &str, sep: Sep) -> Vec<String> {
    match sep {
        Sep::Ws => {
            let t = js::trim(line);
            if t.is_empty() {
                return vec![String::new()];
            }
            t.split(js::is_ws).filter(|x| !x.is_empty()).map(|x| x.to_string()).collect()
        }
        Sep::Ch(c) => line.split(c).map(|x| js::trim(x).to_string()).collect(),
    }
}
fn sep_of(line: &str) -> Sep {
    if line.contains('\t') {
        Sep::Ch('\t')
    } else if line.contains(';') {
        Sep::Ch(';')
    } else if line.contains(',') {
        Sep::Ch(',')
    } else {
        Sep::Ws
    }
}
fn blank(s: &str) -> bool {
    s.chars().all(js::is_ws)
}
/// /^\s*#/ ma non /^\s*#\s*x\b/i
fn comment(s: &str) -> bool {
    let t = s.trim_start_matches(js::is_ws);
    if !t.starts_with('#') {
        return false;
    }
    let r = t[1..].trim_start_matches(js::is_ws);
    let mut ch = r.chars();
    match ch.next() {
        Some('x') | Some('X') => {
            let nx = ch.next();
            nx.map(|c| c.is_ascii_alphanumeric() || c == '_').unwrap_or(false)
        }
        _ => true,
    }
}
pub fn read_map_text(text: &str) -> Result<Option<Cube>, MapErr> {
    let lines = js::lines(text);
    let mut k = 0;
    while k < lines.len() && (blank(lines[k]) || comment(lines[k])) {
        k += 1;
    }
    if k >= lines.len() {
        return Ok(None);
    }
    let first = lines[k];
    let sep = sep_of(first);
    let comma = matches!(sep, Sep::Ch('\t') | Sep::Ch(';'));
    if sep != Sep::Ws {
        let c = split_cells(first, sep);
        if c.len() >= 7 && c[0].is_empty() && c[1].is_empty() {
            let mut x = Vec::new();
            for j in 2..c.len() {
                if c[j].is_empty() && j == c.len() - 1 {
                    break;
                }
                match num_cell(&c[j], comma) {
                    Some(v) => x.push(v),
                    None => return Ok(None),
                }
            }
            let nc = x.len();
            let (mut xs, mut ys, mut rows) = (Vec::new(), Vec::new(), Vec::new());
            for l in lines.iter().skip(k + 1) {
                if blank(l) {
                    continue;
                }
                let mut r = split_cells(l, sep);
                if r.len() > 2 + nc && r.last().map(|s| s.is_empty()).unwrap_or(false) {
                    r.truncate(2 + nc);
                }
                if r.len() != 2 + nc {
                    return Ok(None);
                }
                let (Some(xv), Some(yv)) = (num_cell(&r[0], comma), num_cell(&r[1], comma)) else { return Ok(None) };
                let mut v = Vec::with_capacity(nc);
                for j in 0..nc {
                    match num_cell(&r[2 + j], comma) {
                        Some(q) => v.push(q),
                        None => return Ok(None),
                    }
                }
                xs.push(xv);
                ys.push(yv);
                rows.push(v);
            }
            if rows.len() < 2 {
                return Ok(None);
            }
            return grid_cube(x, &xs, &ys, &rows, "grid").map(Some);
        }
    }
    let mut start = k;
    let c0 = split_cells(first, sep);
    let has = |ch: char| first.chars().any(|c| c.to_ascii_lowercase() == ch);
    if num_cell(c0.first().map(|s| s.as_str()).unwrap_or(""), comma).is_none() && has('x') && has('y') {
        start = k + 1;
    }
    let (mut xs, mut ys, mut rows): (Vec<f64>, Vec<f64>, Vec<Vec<f64>>) = (Vec::new(), Vec::new(), Vec::new());
    let mut wave: Option<Vec<f64>> = None;
    let (mut cur_x, mut cur_y): (Option<f64>, Option<f64>) = (None, None);
    let (mut cw, mut cv): (Vec<f64>, Vec<f64>) = (Vec::new(), Vec::new());
    let mut flush = |cw: &mut Vec<f64>, cv: &mut Vec<f64>, cx: Option<f64>, cy: Option<f64>, xs: &mut Vec<f64>, ys: &mut Vec<f64>, rows: &mut Vec<Vec<f64>>| -> bool {
        if cv.is_empty() {
            return true;
        }
        match &wave {
            None => wave = Some(cw.clone()),
            Some(w) => {
                if cw.len() != w.len() || cw.iter().zip(w.iter()).any(|(a, b)| a != b) {
                    return false;
                }
            }
        }
        xs.push(cx.unwrap());
        ys.push(cy.unwrap());
        rows.push(std::mem::take(cv));
        cw.clear();
        true
    };
    for l in lines.iter().skip(start) {
        if blank(l) {
            continue;
        }
        let r = split_cells(l, sep);
        if r.len() != 4 {
            return Ok(None);
        }
        let v: Vec<Option<f64>> = r.iter().map(|t| num_cell(t, comma)).collect();
        if v.iter().any(|q| q.is_none()) {
            return Ok(None);
        }
        let v: Vec<f64> = v.into_iter().map(|q| q.unwrap()).collect();
        if Some(v[0]) != cur_x || Some(v[1]) != cur_y || cur_x.is_none() {
            if !flush(&mut cw, &mut cv, cur_x, cur_y, &mut xs, &mut ys, &mut rows) {
                return Ok(None);
            }
            cur_x = Some(v[0]);
            cur_y = Some(v[1]);
        }
        cw.push(v[2]);
        cv.push(v[3]);
    }
    if !flush(&mut cw, &mut cv, cur_x, cur_y, &mut xs, &mut ys, &mut rows) {
        return Ok(None);
    }
    let w = match wave {
        Some(w) if rows.len() >= 2 && w.len() >= 5 => w,
        _ => return Ok(None),
    };
    grid_cube(w, &xs, &ys, &rows, "columns").map(Some)
}
/// `[...new Set(v)].sort((a,b)=>a-b)`: valori distinti nell'ordine di arrivo (−0 e 0 sono lo stesso), poi ordinamento stabile
fn uniq_sorted(v: &[f64]) -> Vec<f64> {
    let mut out: Vec<f64> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for &a in v {
        if seen.insert((a + 0.0).to_bits()) {
            out.push(a);
        }
    }
    out.sort_by(|a, b| a.partial_cmp(b).unwrap());
    out
}
fn grid_cube(x: Vec<f64>, xs: &[f64], ys: &[f64], rows: &[Vec<f64>], how0: &str) -> Result<Cube, MapErr> {
    let nc = x.len();
    let (ux, uy) = (uniq_sorted(xs), uniq_sorted(ys));
    let n = rows.len();
    let (mut nx, mut ny) = (ux.len(), uy.len());
    let (pxv, pyv, place, how): (Vec<f64>, Vec<f64>, Vec<usize>, String);
    if nx * ny <= (4 * n).max(n + 16) {
        let mx: std::collections::HashMap<u64, usize> = ux.iter().enumerate().map(|(i, v)| ((v + 0.0).to_bits(), i)).collect();
        let my: std::collections::HashMap<u64, usize> = uy.iter().enumerate().map(|(i, v)| ((v + 0.0).to_bits(), i)).collect();
        place = (0..n).map(|i| my[&(ys[i] + 0.0).to_bits()] * nx + mx[&(xs[i] + 0.0).to_bits()]).collect();
        pxv = ux;
        pyv = uy;
        how = how0.to_string();
    } else {
        nx = n;
        ny = 1;
        pxv = (0..n).map(|i| i as f64).collect();
        pyv = vec![0.0];
        place = (0..n).collect();
        how = format!("{}-line", how0);
    }
    if nx * ny * nc > MAXPIX {
        return Err(MapErr(format!("too-large: {}", nx * ny * nc)));
    }
    let mut data = vec![f32::NAN; nx * ny * nc];
    let mut seen = vec![false; nx * ny];
    for i in 0..n {
        let p = place[i];
        if seen[p] {
            return err("map-duplicate");
        }
        seen[p] = true;
        for j in 0..nc {
            data[p * nc + j] = rows[i][j] as f32;
        }
    }
    let filled = n == nx * ny;
    Ok(Cube {
        nx,
        ny,
        nc,
        store: Store::Mem(Data::F32(data)),
        x: Axis { values: x, unit: String::new(), quantity: String::new() },
        px: Axis { values: pxv, unit: String::new(), quantity: String::new() },
        py: Axis { values: pyv, unit: String::new(), quantity: String::new() },
        yq: "intensity".into(),
        meta: format!("{{\"format\":\"text\",\"layout\":\"{}\",\"complete\":{}}}", how, filled),
    })
}

/* ---------------- serie OPUS (DEDOTTO) ---------------- */
struct OBlock {
    t: u32,
    len: i64,
    off: i64,
}
fn opus_dir(u: &[u8]) -> Option<Vec<OBlock>> {
    if u.len() < 600 || u32le(u, 0) != 0xFEFE0A0A {
        return None;
    }
    let mut out = Vec::new();
    let mut c = 24;
    while c + 12 <= u.len().min(504) {
        let t = u32le(u, c);
        let len = i32le(u, c + 4) as i64 * 4;
        let off = i32le(u, c + 8) as i64;
        if off <= 0 {
            break;
        }
        out.push(OBlock { t, len, off });
        c += 12;
    }
    Some(out)
}
fn opus_series(b: &OBlock) -> bool {
    (b.t >> 4) & 0x3f == 0 && ![0, 13].contains(&((b.t >> 10) & 0x7f)) && (b.t >> 19) & 7 == 2
}
enum PVal {
    I(i32),
    F(f64),
    S(String),
}
fn opus_params(u: &[u8], b: &OBlock) -> Vec<(String, PVal)> {
    let mut out = Vec::new();
    let mut p = b.off.max(0) as usize;
    let end = (u.len() as i64).min(b.off + b.len).max(0) as usize;
    while p + 8 <= end {
        let name = ascii(u, p, p + 3);
        if name == "END" || name.len() != 3 || !name.bytes().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit()) {
            break;
        }
        let t = u16::from_le_bytes([u[p + 4], u[p + 5]]);
        let sz = u16::from_le_bytes([u[p + 6], u[p + 7]]) as usize * 2;
        let v = p + 8;
        if v + sz > u.len() {
            break;
        }
        let val = match t {
            0 => PVal::I(i32le(u, v)),
            1 => PVal::F(f64le(u, v)),
            _ => PVal::S(ascii(u, v, v + sz)),
        };
        out.retain(|e: &(String, PVal)| e.0 != name);
        out.push((name, val));
        p = v + sz;
    }
    out
}
pub fn is_opus_series(u: &[u8]) -> bool {
    opus_dir(u).map(|d| d.iter().any(opus_series)).unwrap_or(false)
}
pub fn read_opus_series(u: &[u8]) -> Result<Cube, MapErr> {
    let d = opus_dir(u).ok_or(MapErr("not-opus".into()))?;
    let s: Vec<&OBlock> = d.iter().filter(|b| opus_series(b)).collect();
    if s.is_empty() {
        return err("opus-no-series");
    }
    let pri = |t: u32| match t & 0xff {
        15 => 0,
        7 => 1,
        11 => 2,
        _ => 9,
    };
    let mut s2 = s.clone();
    s2.sort_by_key(|b| pri(b.t));
    let ds = s2[0];
    let mask = !(0x3fu32 << 4);
    let st = d.iter().find(|b| (b.t >> 4) & 0x3f == 1 && (b.t & mask) == (ds.t & mask)).ok_or(MapErr("opus-status".into()))?;
    let p = opus_params(u, st);
    let g = |k: &str| p.iter().find(|e| e.0 == k).map(|e| &e.1);
    let num = |k: &str| match g(k) {
        Some(PVal::I(v)) => Some(*v as f64),
        Some(PVal::F(v)) => Some(*v),
        _ => None,
    };
    let np = num("NPT");
    let (fx, lx) = (num("FXV"), num("LXV"));
    let csf = match num("CSF") {
        Some(v) if v != 0.0 && !v.is_nan() => v,
        _ => 1.0,
    };
    let dpf = match num("DPF") {
        Some(v) if v != 0.0 && !v.is_nan() => v,
        _ => 1.0,
    };
    let (Some(np), Some(fx), Some(lx)) = (np, fx, lx) else { return err("opus-params") };
    if !(np > 4.0) || !fx.is_finite() || !lx.is_finite() || ds.off as usize + 24 > u.len() {
        return err("opus-params");
    }
    let np = np as usize;
    let o0 = ds.off as usize;
    let h: Vec<i32> = (0..6).map(|k| i32le(u, o0 + 4 * k)).collect();
    let (nb, first, dsz, isz) = (h[1], h[2], h[3], h[4]);
    if !(nb > 0) || !(dsz as i64 >= 4 * np as i64) || isz < 0 || first < 24 {
        return err("opus-series-header");
    }
    let mut rows: Vec<Vec<f64>> = Vec::new();
    let mut o = o0 as i64 + first as i64;
    for _ in 0..nb {
        if o + 4 * np as i64 > u.len() as i64 || o + 4 * np as i64 > ds.off + ds.len {
            break;
        }
        let ou = o as usize;
        let v: Vec<f64> = (0..np).map(|j| (if dpf == 2.0 { i32le(u, ou + 4 * j) as f64 } else { f32le(u, ou + 4 * j) as f64 }) * csf).collect();
        rows.push(v);
        o += dsz as i64 + isz as i64;
    }
    if rows.len() < 2 {
        return err("opus-series-short");
    }
    let n = rows.len();
    let x: Vec<f64> = (0..np).map(|i| fx + (lx - fx) * i as f64 / (np - 1) as f64).collect();
    let mut data = Vec::with_capacity(n * np);
    for r in &rows {
        data.extend_from_slice(r);
    }
    let dxu = match g("DXU") {
        Some(PVal::S(s)) => s.clone(),
        _ => String::new(),
    };
    let xu = if dxu.is_empty() || dxu.to_lowercase().contains("wn") { "cm-1".to_string() } else { dxu };
    Ok(Cube {
        nx: n,
        ny: 1,
        nc: np,
        store: Store::Mem(Data::F64(data)),
        x: Axis { values: x, unit: xu, quantity: "wavenumber".into() },
        px: Axis { values: (0..n).map(|i| i as f64).collect(), unit: String::new(), quantity: String::new() },
        py: Axis { values: vec![0.0], unit: String::new(), quantity: String::new() },
        yq: if ds.t & 0xff == 15 { "absorbance".into() } else { "intensity".into() },
        meta: format!("{{\"format\":\"opus-series\",\"layout\":\"unknown\",\"spectra\":{},\"declared\":{}}}", n, nb),
    })
}

/* ---------------- calcoli (gemelli di map-core.js) ---------------- */
pub fn chan_range(x: &[f64], a: f64, b: f64) -> Option<(usize, usize)> {
    let (lo, hi) = (crate::calc::js_min(a, b), crate::calc::js_max(a, b));
    let (mut i0, mut i1) = (None, 0);
    for (i, &v) in x.iter().enumerate() {
        if v >= lo && v <= hi {
            if i0.is_none() {
                i0 = Some(i);
            }
            i1 = i;
        }
    }
    i0.map(|a| (a, i1))
}
pub fn nearest(x: &[f64], at: f64) -> usize {
    let (mut k, mut d) = (0, f64::INFINITY);
    for (i, &v) in x.iter().enumerate() {
        let e = (v - at).abs();
        if e < d {
            d = e;
            k = i;
        }
    }
    k
}
fn area(d: &[f64], x: &[f64], i0: usize, i1: usize, lin: bool) -> f64 {
    if i1 <= i0 {
        return 0.0;
    }
    let mut s = 0.0;
    for k in i0..i1 {
        s += (x[k + 1] - x[k]) * (d[k] + d[k + 1]) * 0.5;
    }
    if x[i1] < x[i0] {
        s = -s;
    }
    if lin {
        let mut b = (x[i1] - x[i0]) * (d[i0] + d[i1]) * 0.5;
        if x[i1] < x[i0] {
            b = -b;
        }
        s -= b;
    }
    s
}
fn height(d: &[f64], x: &[f64], i0: usize, i1: usize, lin: bool) -> f64 {
    let (mut m, mut k) = (f64::NEG_INFINITY, None);
    let y0 = d[i0];
    let dy = d[i1] - y0;
    let dx = x[i1] - x[i0];
    for q in i0..=i1 {
        let mut v = d[q];
        if lin && i1 > i0 {
            v -= y0 + dy * ((x[q] - x[i0]) / dx);
        }
        if v > m {
            m = v;
            k = Some(q);
        }
    }
    if k.is_none() {
        f64::NAN
    } else {
        m
    }
}
fn peak_pos(d: &[f64], x: &[f64], i0: usize, i1: usize) -> f64 {
    let (mut m, mut k) = (f64::NEG_INFINITY, None);
    for q in i0..=i1 {
        if d[q] > m {
            m = d[q];
            k = Some(q);
        }
    }
    let Some(k) = k else { return f64::NAN };
    if k > i0 && k < i1 {
        let (a, b, c) = (d[k - 1], d[k], d[k + 1]);
        let den = a - 2.0 * b + c;
        if den < 0.0 {
            let t = 0.5 * (a - c) / den;
            return x[k] + t * ((x[k + 1] - x[k - 1]) * 0.5);
        }
    }
    x[k]
}
#[derive(Clone, Debug)]
pub struct Op {
    pub kind: String,
    pub a: f64,
    pub b: f64,
    pub a2: f64,
    pub b2: f64,
    pub at: f64,
    pub base: String,
}
#[derive(Clone, Copy)]
pub struct Plan {
    k: u8,
    i0: usize,
    i1: usize,
    j0: usize,
    j1: usize,
    lin: bool,
}
pub fn op_plan(x: &[f64], op: &Op) -> Result<Plan, MapErr> {
    let lin = op.base == "linear";
    if op.kind == "intensity" {
        let i = nearest(x, op.at);
        return Ok(Plan { k: 1, i0: i, i1: i, j0: 0, j1: 0, lin: false });
    }
    let r = chan_range(x, op.a, op.b).ok_or(MapErr("range".into()))?;
    match op.kind.as_str() {
        "ratio" => {
            let r2 = chan_range(x, op.a2, op.b2).ok_or(MapErr("range".into()))?;
            Ok(Plan { k: 3, i0: r.0, i1: r.1, j0: r2.0, j1: r2.1, lin })
        }
        "area" => Ok(Plan { k: 0, i0: r.0, i1: r.1, j0: 0, j1: 0, lin }),
        "height" => Ok(Plan { k: 1, i0: r.0, i1: r.1, j0: 0, j1: 0, lin }),
        "peak" => Ok(Plan { k: 2, i0: r.0, i1: r.1, j0: 0, j1: 0, lin }),
        k => Err(MapErr(format!("op: {}", k))),
    }
}
pub fn pixel_value(d: &[f64], x: &[f64], p: &Plan) -> f64 {
    match p.k {
        0 => area(d, x, p.i0, p.i1, p.lin),
        1 => height(d, x, p.i0, p.i1, p.lin),
        2 => peak_pos(d, x, p.i0, p.i1),
        _ => {
            let a = area(d, x, p.i0, p.i1, p.lin);
            let b = area(d, x, p.j0, p.j1, p.lin);
            if b == 0.0 {
                f64::NAN
            } else {
                a / b
            }
        }
    }
}

impl Cube {
    pub fn npix(&self) -> usize {
        self.nx * self.ny
    }
    pub fn is_f64(&self) -> bool {
        match &self.store {
            Store::Mem(Data::F64(_)) => true,
            Store::Mem(Data::F32(_)) => false,
            Store::File(f) => f.f64,
        }
    }
    pub fn bytes(&self) -> u64 {
        (self.npix() * self.nc) as u64 * if self.is_f64() { 8 } else { 4 }
    }
    /// spettro del pixel p in f64 (NaN se non misurato)
    pub fn pixel(&self, p: usize, out: &mut [f64]) -> Result<(), MapErr> {
        let nc = self.nc;
        match &self.store {
            Store::Mem(Data::F32(v)) => {
                for (o, s) in out.iter_mut().zip(&v[p * nc..(p + 1) * nc]) {
                    *o = *s as f64;
                }
            }
            Store::Mem(Data::F64(v)) => out.copy_from_slice(&v[p * nc..(p + 1) * nc]),
            Store::File(f) => {
                let k = f.inv[p];
                if k < 0 {
                    out.fill(f64::NAN);
                    return Ok(());
                }
                let bz = if f.f64 { 8 } else { 4 };
                let mut buf = vec![0u8; nc * bz];
                let mut fh = File::open(&f.path).map_err(|e| MapErr(format!("read-failed: {}", e.kind())))?;
                fh.seek(SeekFrom::Start(f.offset + (k as u64) * (nc * bz) as u64)).map_err(|_| MapErr("read-failed".into()))?;
                fh.read_exact(&mut buf).map_err(|_| MapErr("read-failed".into()))?;
                conv(&buf, f.f64, out);
            }
        }
        Ok(())
    }
    /// visita tutti i pixel misurati (nell'ordine dei dati), per i calcoli pixel per pixel che non dipendono dall'ordine
    pub fn scan(&self, cancel: &dyn Fn() -> bool, progress: &mut dyn FnMut(usize), f: &mut dyn FnMut(usize, &[f64])) -> Result<(), MapErr> {
        let nc = self.nc;
        let mut buf = vec![0.0f64; nc];
        match &self.store {
            Store::Mem(_) => {
                for p in 0..self.npix() {
                    self.pixel(p, &mut buf)?;
                    f(p, &buf);
                    if p % 4096 == 0 {
                        if cancel() {
                            return err("cancelled");
                        }
                        progress(p);
                    }
                }
            }
            Store::File(src) => {
                let bz = if src.f64 { 8 } else { 4 };
                let mut fh = File::open(&src.path).map_err(|e| MapErr(format!("read-failed: {}", e.kind())))?;
                fh.seek(SeekFrom::Start(src.offset)).map_err(|_| MapErr("read-failed".into()))?;
                let per = ((32usize << 20) / (nc * bz)).max(1);
                let mut raw = vec![0u8; per * nc * bz];
                let mut k = 0;
                while k < src.pix.len() {
                    let m = per.min(src.pix.len() - k);
                    fh.read_exact(&mut raw[..m * nc * bz]).map_err(|_| MapErr("read-failed".into()))?;
                    for q in 0..m {
                        conv(&raw[q * nc * bz..(q + 1) * nc * bz], src.f64, &mut buf);
                        f(src.pix[k + q] as usize, &buf);
                    }
                    k += m;
                    if cancel() {
                        return err("cancelled");
                    }
                    progress(k);
                }
                // pixel non misurati: lo stesso calcolo su uno spettro di NaN (come nel JS)
                buf.fill(f64::NAN);
                for p in 0..self.npix() {
                    if src.inv[p] < 0 {
                        f(p, &buf);
                    }
                }
            }
        }
        Ok(())
    }
}
fn conv(raw: &[u8], f64t: bool, out: &mut [f64]) {
    if f64t {
        for (j, o) in out.iter_mut().enumerate() {
            *o = f64le(raw, 8 * j);
        }
    } else {
        for (j, o) in out.iter_mut().enumerate() {
            *o = f32le(raw, 4 * j) as f64;
        }
    }
}
pub fn band_image(c: &Cube, op: &Op, cancel: &dyn Fn() -> bool, progress: &mut dyn FnMut(usize)) -> Result<Vec<f64>, MapErr> {
    let plan = op_plan(&c.x.values, op)?;
    let x = &c.x.values;
    let mut img = vec![f64::NAN; c.npix()];
    c.scan(cancel, progress, &mut |p, d| img[p] = pixel_value(d, x, &plan))?;
    Ok(img)
}
/// (roiMean) rettangolo con estremi compresi, oppure elenco di pixel; pixel con un NaN esclusi; somma nell'ordine dei pixel
pub fn roi_mean(c: &Cube, rect: Option<(i64, i64, i64, i64)>, list: &[i64]) -> Result<(Vec<f64>, usize), MapErr> {
    let (nx, ny, nc) = (c.nx as i64, c.ny as i64, c.nc);
    let mut s = vec![0.0f64; nc];
    let mut cnt = 0usize;
    let mut buf = vec![0.0f64; nc];
    let mut add = |p: usize, s: &mut Vec<f64>, cnt: &mut usize| -> Result<(), MapErr> {
        c.pixel(p, &mut buf)?;
        if buf.iter().any(|v| v.is_nan()) {
            return Ok(());
        }
        for j in 0..nc {
            s[j] += buf[j];
        }
        *cnt += 1;
        Ok(())
    };
    match rect {
        Some((x0, y0, x1, y1)) => {
            let (xa, xb) = (0.max(x0.min(x1)), (nx - 1).min(x0.max(x1)));
            let (ya, yb) = (0.max(y0.min(y1)), (ny - 1).min(y0.max(y1)));
            let mut iy = ya;
            while iy <= yb {
                let mut ix = xa;
                while ix <= xb {
                    add((iy * nx + ix) as usize, &mut s, &mut cnt)?;
                    ix += 1;
                }
                iy += 1;
            }
        }
        None => {
            for &p in list {
                if p >= 0 && p < nx * ny {
                    add(p as usize, &mut s, &mut cnt)?;
                }
            }
        }
    }
    let mean = if cnt > 0 { s.iter().map(|v| v / cnt as f64).collect() } else { vec![f64::NAN; nc] };
    Ok((mean, cnt))
}
/// (bin) accorpamento f × f: cubo f32 in memoria
pub fn bin(c: &Cube, f: usize, cancel: &dyn Fn() -> bool) -> Result<Cube, MapErr> {
    let f = f.max(1);
    let (nx, ny, nc) = (c.nx, c.ny, c.nc);
    let (mx, my) = (nx.div_ceil(f), ny.div_ceil(f));
    let mut out = vec![0f32; mx * my * nc];
    let mut s = vec![0.0f64; nc];
    let mut buf = vec![0.0f64; nc];
    for by in 0..my {
        if cancel() {
            return err("cancelled");
        }
        for bx in 0..mx {
            s.fill(0.0);
            let mut cnt = 0usize;
            for iy in by * f..ny.min(by * f + f) {
                for ix in bx * f..nx.min(bx * f + f) {
                    c.pixel(iy * nx + ix, &mut buf)?;
                    if buf.iter().any(|v| v.is_nan()) {
                        continue;
                    }
                    for j in 0..nc {
                        s[j] += buf[j];
                    }
                    cnt += 1;
                }
            }
            let q = (by * mx + bx) * nc;
            for j in 0..nc {
                out[q + j] = if cnt > 0 { (s[j] / cnt as f64) as f32 } else { f32::NAN };
            }
        }
    }
    let pmean = |v: &[f64]| -> Vec<f64> {
        (0..v.len().div_ceil(f))
            .map(|i| {
                let (mut a, mut k) = (0.0, 0.0);
                for &w in &v[i * f..v.len().min(i * f + f)] {
                    a += w;
                    k += 1.0;
                }
                a / k
            })
            .collect()
    };
    let meta = format!("{},\"binned\":{}}}", c.meta.trim_end_matches('}'), f);
    Ok(Cube {
        nx: mx,
        ny: my,
        nc,
        store: Store::Mem(Data::F32(out)),
        x: c.x.clone(),
        px: Axis { values: pmean(&c.px.values), ..c.px.clone() },
        py: Axis { values: pmean(&c.py.values), ..c.py.clone() },
        yq: c.yq.clone(),
        meta,
    })
}

/* ---------------- file affiancato .acchcube (DECISIONE I10) ----------------
   «ACCHCUBE», versione u32 = 1, lunghezza del JSON u32, JSON {nx, ny, nc, order:"yxc", dtype}, zeri fino a un multiplo di 8, numeri
   little-endian in ordine yxc. Impronta: SHA-256 di tutto il file, salvata nel progetto (cube.external). */
pub const SIDE_MAGIC: &[u8; 8] = b"ACCHCUBE";
pub fn side_header(c: &Cube) -> Vec<u8> {
    let j = format!("{{\"nx\":{},\"ny\":{},\"nc\":{},\"order\":\"yxc\",\"dtype\":\"{}\"}}", c.nx, c.ny, c.nc, if c.is_f64() { "f64" } else { "f32" });
    let mut h = Vec::new();
    h.extend_from_slice(SIDE_MAGIC);
    h.extend_from_slice(&1u32.to_le_bytes());
    h.extend_from_slice(&(j.len() as u32).to_le_bytes());
    h.extend_from_slice(j.as_bytes());
    while h.len() % 8 != 0 {
        h.push(0);
    }
    h
}
/// scrive il cubo nel file affiancato (prima in un file temporaneo, poi lo rinomina); `feed` riceve ogni pezzo scritto (per l'impronta)
pub fn write_side(c: &Cube, path: &Path, feed: &mut dyn FnMut(&[u8]), cancel: &dyn Fn() -> bool) -> Result<u64, MapErr> {
    let tmp = path.with_extension("acchcube.tmp");
    let io = |e: std::io::Error| MapErr(format!("write-failed: {}", e.kind()));
    let mut fh = std::io::BufWriter::with_capacity(8 << 20, File::create(&tmp).map_err(io)?);
    let h = side_header(c);
    fh.write_all(&h).map_err(io)?;
    feed(&h);
    let mut total = h.len() as u64;
    let nc = c.nc;
    let mut buf = vec![0.0f64; nc];
    let f64t = c.is_f64();
    let mut chunk: Vec<u8> = Vec::with_capacity(8 << 20);
    for p in 0..c.npix() {
        c.pixel(p, &mut buf)?;
        for &v in &buf {
            if f64t {
                chunk.extend_from_slice(&v.to_le_bytes());
            } else {
                chunk.extend_from_slice(&(v as f32).to_le_bytes());
            }
        }
        if chunk.len() >= 8 << 20 || p + 1 == c.npix() {
            fh.write_all(&chunk).map_err(io)?;
            feed(&chunk);
            total += chunk.len() as u64;
            chunk.clear();
            if cancel() {
                drop(fh);
                let _ = std::fs::remove_file(&tmp);
                return err("cancelled");
            }
        }
    }
    let f = fh.into_inner().map_err(|e| MapErr(format!("write-failed: {}", e.error().kind())))?;
    f.sync_all().map_err(io)?;
    drop(f);
    std::fs::rename(&tmp, path).map_err(io)?;
    Ok(total)
}
/// apre un file affiancato: intestazione controllata, cubo sul disco (nessuna copia in memoria); assi dal progetto
pub fn open_side(path: &Path) -> Result<(usize, usize, usize, bool, u64), MapErr> {
    let mut fh = File::open(path).map_err(|e| MapErr(format!("read-failed: {}", e.kind())))?;
    let mut h = [0u8; 16];
    fh.read_exact(&mut h).map_err(|_| MapErr("side-header".into()))?;
    if &h[0..8] != SIDE_MAGIC || u32le(&h, 8) != 1 {
        return err("side-header");
    }
    let jl = u32le(&h, 12) as usize;
    if jl > 4096 {
        return err("side-header");
    }
    let mut j = vec![0u8; jl];
    fh.read_exact(&mut j).map_err(|_| MapErr("side-header".into()))?;
    let j = String::from_utf8(j).map_err(|_| MapErr("side-header".into()))?;
    let grab = |k: &str| -> Option<usize> {
        let p = j.find(&format!("\"{}\":", k))? + k.len() + 3;
        j[p..].split(|c: char| !c.is_ascii_digit()).next()?.parse().ok()
    };
    let (Some(nx), Some(ny), Some(nc)) = (grab("nx"), grab("ny"), grab("nc")) else { return err("side-header") };
    let f64t = j.contains("\"dtype\":\"f64\"");
    if !j.contains("\"order\":\"yxc\"") || !(f64t || j.contains("\"dtype\":\"f32\"")) {
        return err("side-header");
    }
    let off = (16 + jl).div_ceil(8) * 8;
    let len = fh.metadata().map_err(|_| MapErr("read-failed".into()))?.len();
    let need = off as u64 + (nx * ny * nc) as u64 * if f64t { 8 } else { 4 };
    if len != need {
        return err("side-size");
    }
    Ok((nx, ny, nc, f64t, off as u64))
}
pub fn side_cube(path: &Path, x: Axis, px: Axis, py: Axis, meta: String) -> Result<Cube, MapErr> {
    let (nx, ny, nc, f64t, off) = open_side(path)?;
    if x.values.len() != nc || px.values.len() != nx || py.values.len() != ny {
        return err("side-axes");
    }
    let np = nx * ny;
    Ok(Cube {
        nx,
        ny,
        nc,
        store: Store::File(FileSrc { path: path.to_path_buf(), offset: off, f64: f64t, pix: (0..np as u32).collect(), inv: (0..np as i32).collect() }),
        x,
        px,
        py,
        yq: String::new(),
        meta,
    })
}

/* ---------------- risposta (formato wire) ---------------- */
fn axis_json(w: &mut crate::Wire, k: &str, a: &Axis) {
    w.key(k).raw("{").key("values").arr(&a.values).key("unit").str(&a.unit).key("quantity").str(&a.quantity).raw("}");
}
/// testa del cubo: dimensioni, assi, metadati (e i dati se `with_data`, in f64: conversione esatta dei f32)
pub fn wire_head(w: &mut crate::Wire, c: &Cube, with_data: bool) -> Result<(), MapErr> {
    w.key("nx").num(c.nx).key("ny").num(c.ny).key("nc").num(c.nc).key("dtype").str(if c.is_f64() { "f64" } else { "f32" });
    axis_json(w, "x", &c.x);
    axis_json(w, "px", &c.px);
    axis_json(w, "py", &c.py);
    w.key("yq").str(&c.yq).key("meta").raw(&c.meta);
    if with_data {
        let mut all = Vec::with_capacity(c.npix() * c.nc);
        let mut buf = vec![0.0; c.nc];
        for p in 0..c.npix() {
            c.pixel(p, &mut buf)?;
            all.extend_from_slice(&buf);
        }
        w.key("data").arr(&all);
    }
    Ok(())
}
/// lettura per tipo, come AcchMap.read: «wdf», «envi» (testo dell'intestazione + binario), «opus-series», «text»
pub fn read(kind: &str, main: &[u8], hdr: Option<&str>, file: Option<&Path>) -> Result<Option<Cube>, MapErr> {
    match kind {
        // con un percorso: dal disco, senza i dati in memoria (stessa lettura dei cubi grandi del desktop)
        "wdf" => match file {
            Some(p) => read_wdf_disk(p).map(Some),
            None => read_wdf(main, None).map(Some),
        },
        "envi" => {
            let h = parse_envi_header(hdr.ok_or(MapErr("envi-header".into()))?)?;
            read_envi(&h, main).map(Some)
        }
        "opus-series" => read_opus_series(main).map(Some),
        "text" => {
            let s = String::from_utf8_lossy(main);
            let t = s.strip_prefix('\u{FEFF}').unwrap_or(&s);
            read_map_text(t)
        }
        k => Err(MapErr(format!("kind: {}", k))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn numbers_like_js_regex() {
        for (t, ok) in [("1", true), ("-1.5e3", true), (".5", true), ("5.", true), ("+2", true), ("1e", false), ("e3", false), ("1.2.3", false), ("", false), (".", false), ("-.e1", false)] {
            assert_eq!(is_num(t), ok, "{t}");
        }
    }
    #[test]
    fn envi_header_lists_and_values() {
        let h = parse_envi_header("ENVI\nsamples = 3\nlines = 2\nbands = 4\ndata type = 4\ninterleave = BIP\nwavelength = {1, 2,\n 3, 4}\nbyte order = 1\n").unwrap();
        assert_eq!((h.samples, h.lines, h.bands, h.data_type, h.byte_order), (3, 2, 4, 4, 1));
        assert_eq!(h.interleave, "bip");
        assert_eq!(h.wavelength, Some(vec![1.0, 2.0, 3.0, 4.0]));
        assert!(parse_envi_header("samples = 3").is_err());
    }
    #[test]
    fn area_height_peak() {
        let x = [0.0, 1.0, 2.0, 3.0, 4.0];
        let d = [0.0, 1.0, 3.0, 1.0, 0.0];
        let p = op_plan(&x, &Op { kind: "area".into(), a: 0.0, b: 4.0, a2: 0.0, b2: 0.0, at: 0.0, base: "none".into() }).unwrap();
        assert_eq!(pixel_value(&d, &x, &p), 5.0);
        let p = op_plan(&x, &Op { kind: "peak".into(), a: 0.0, b: 4.0, a2: 0.0, b2: 0.0, at: 0.0, base: "none".into() }).unwrap();
        assert_eq!(pixel_value(&d, &x, &p), 2.0);
    }
    #[test]
    fn sidecar_roundtrip() {
        let dir = std::env::temp_dir().join(format!("acch-cube-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let c = Cube {
            nx: 3,
            ny: 2,
            nc: 4,
            store: Store::Mem(Data::F32((0..24).map(|v| v as f32 * 0.5).collect())),
            x: Axis { values: vec![1.0, 2.0, 3.0, 4.0], ..Default::default() },
            px: Axis { values: vec![0.0, 1.0, 2.0], ..Default::default() },
            py: Axis { values: vec![0.0, 1.0], ..Default::default() },
            yq: String::new(),
            meta: "{}".into(),
        };
        let p = dir.join("a.acchcube");
        let mut n = 0usize;
        write_side(&c, &p, &mut |b| n += b.len(), &|| false).unwrap();
        let back = side_cube(&p, c.x.clone(), c.px.clone(), c.py.clone(), "{}".into()).unwrap();
        let mut s = vec![0.0; 4];
        back.pixel(5, &mut s).unwrap();
        assert_eq!(s, vec![10.0, 10.5, 11.0, 11.5]);
        assert_eq!(n as u64, std::fs::metadata(&p).unwrap().len());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
