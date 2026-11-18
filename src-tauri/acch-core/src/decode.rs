// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
//! `decodeBuffer` di index.html: UTF-16 con BOM, UTF-16LE senza BOM (molti zeri nei byte dispari), UTF-8, altrimenti windows-1252.
//! Stesse regole del TextDecoder del browser (WHATWG): BOM tolto, sequenze non valide sostituite da U+FFFD.

/// Che decodifica sceglie decodeBuffer: serve alla lettura veloce, che lavora sui byte solo quando il testo è UTF-8.
#[derive(Debug, PartialEq, Clone, Copy)]
pub enum Enc {
    Utf16Le { skip: usize },
    Utf16Be,
    /// UTF-8 valido senza U+FFFD; `skip` byte di BOM da saltare
    Utf8 { skip: usize },
    Win1252,
}

pub fn which(u: &[u8]) -> Enc {
    if u.len() >= 2 && u[0] == 0xFF && u[1] == 0xFE {
        return Enc::Utf16Le { skip: 2 };
    }
    if u.len() >= 2 && u[0] == 0xFE && u[1] == 0xFF {
        return Enc::Utf16Be;
    }
    let n = u.len().min(400);
    let mut zeros = 0usize;
    let mut i = 1;
    while i < n {
        if u[i] == 0 {
            zeros += 1;
        }
        i += 2;
    }
    if n > 20 && (zeros as f64) > (n as f64) / 4.0 {
        return Enc::Utf16Le { skip: 0 };
    }
    // TextDecoder('utf-8') toglie un BOM; decodeBuffer ne toglie un secondo se c'è
    let mut skip = 0;
    if u.starts_with(&[0xEF, 0xBB, 0xBF]) {
        skip = 3;
        if u[3..].starts_with(&[0xEF, 0xBB, 0xBF]) {
            skip = 6;
        }
    }
    match std::str::from_utf8(&u[skip..]) {
        Ok(s) if !s.contains('\u{FFFD}') => Enc::Utf8 { skip },
        _ => Enc::Win1252,
    }
}

const W1252: [u16; 32] = [
    0x20AC, 0x0081, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0x008D, 0x017D, 0x008F, 0x0090, 0x2018,
    0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x009D, 0x017E, 0x0178,
];

fn utf16(u: &[u8], le: bool) -> String {
    // il TextDecoder toglie anche un BOM all'inizio dei byte che riceve
    let mut units: Vec<u16> = u.chunks_exact(2).map(|c| if le { u16::from_le_bytes([c[0], c[1]]) } else { u16::from_be_bytes([c[0], c[1]]) }).collect();
    if units.first() == Some(&0xFEFF) {
        units.remove(0);
    }
    let mut s: String = char::decode_utf16(units).map(|r| r.unwrap_or('\u{FFFD}')).collect();
    if u.len() % 2 == 1 {
        s.push('\u{FFFD}');
    }
    s
}

pub fn decode(u: &[u8]) -> String {
    match which(u) {
        Enc::Utf16Le { skip } => utf16(&u[skip..], true),
        Enc::Utf16Be => utf16(&u[2..], false),
        Enc::Utf8 { skip } => std::str::from_utf8(&u[skip..]).unwrap().to_string(),
        Enc::Win1252 => u
            .iter()
            .map(|&b| if (0x80..0xA0).contains(&b) { char::from_u32(W1252[(b - 0x80) as usize] as u32).unwrap() } else { b as char })
            .collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn decode_like_text_decoder() {
        assert_eq!(decode(b"\xEF\xBB\xBFab"), "ab");
        assert_eq!(decode(b"caf\xE9 \x80"), "café €");
        assert_eq!(decode(&[0xFF, 0xFE, b'a', 0, b'b', 0]), "ab");
        assert_eq!(decode(&[0xFE, 0xFF, 0, b'a']), "a");
        let mut le = Vec::new();
        for c in "abcdefghijklmnopqrstuvwxyz".bytes() {
            le.push(c);
            le.push(0);
        }
        assert_eq!(decode(&le), "abcdefghijklmnopqrstuvwxyz");
        assert_eq!(which(b"\xEF\xBF\xBD x"), Enc::Win1252);
    }
}
