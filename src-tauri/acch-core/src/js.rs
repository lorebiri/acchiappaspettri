// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
//! Le regole di JavaScript che servono per avere gli stessi numeri del nucleo JS: spazi di `trim()` e di `\s`,
//! `parseFloat`, `Number()` sulla grammatica ristretta, divisione in righe come `split(/\r\n|\n|\r/)`, testo JSON.

/// `\s` e `trim()` di JavaScript: WhiteSpace e LineTerminator di ECMAScript.
pub fn is_ws(c: char) -> bool {
    matches!(
        c,
        '\u{0009}' | '\u{000A}' | '\u{000B}' | '\u{000C}' | '\u{000D}' | '\u{0020}' | '\u{00A0}' | '\u{1680}' | '\u{2000}'
            ..='\u{200A}' | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}'
    )
}
/// Fine riga per `^`/`$` con il flag m e per il punto `.` (che non li attraversa).
pub fn is_lt(c: char) -> bool {
    matches!(c, '\n' | '\r' | '\u{2028}' | '\u{2029}')
}
pub fn trim(s: &str) -> &str {
    s.trim_matches(is_ws)
}
pub fn trim_end(s: &str) -> &str {
    s.trim_end_matches(is_ws)
}
/// `text.split(/\r\n|\n|\r/)`
pub fn lines(text: &str) -> Vec<&str> {
    let b = text.as_bytes();
    let mut out = Vec::new();
    let (mut a, mut i) = (0, 0);
    while i < b.len() {
        match b[i] {
            b'\r' => {
                out.push(&text[a..i]);
                i += if i + 1 < b.len() && b[i + 1] == b'\n' { 2 } else { 1 };
                a = i;
            }
            b'\n' => {
                out.push(&text[a..i]);
                i += 1;
                a = i;
            }
            _ => i += 1,
        }
    }
    out.push(&text[a..]);
    out
}
/// `parseFloat(s)`: spazi iniziali, poi il prefisso più lungo che è un numero decimale (o «Infinity»). None = NaN.
pub fn parse_float(s: &str) -> Option<f64> {
    let t = s.trim_start_matches(is_ws);
    let b = t.as_bytes();
    let mut i = 0;
    if i < b.len() && (b[i] == b'+' || b[i] == b'-') {
        i += 1;
    }
    if t[i..].starts_with("Infinity") {
        return Some(if b.first() == Some(&b'-') { f64::NEG_INFINITY } else { f64::INFINITY });
    }
    let d0 = i;
    while i < b.len() && b[i].is_ascii_digit() {
        i += 1;
    }
    let int_digits = i - d0;
    let mut frac_digits = 0;
    if i < b.len() && b[i] == b'.' {
        let j0 = i + 1;
        let mut j = j0;
        while j < b.len() && b[j].is_ascii_digit() {
            j += 1;
        }
        frac_digits = j - j0;
        if int_digits > 0 || frac_digits > 0 {
            i = j;
        }
    }
    if int_digits == 0 && frac_digits == 0 {
        return None;
    }
    if i < b.len() && (b[i] == b'e' || b[i] == b'E') {
        let mut j = i + 1;
        if j < b.len() && (b[j] == b'+' || b[j] == b'-') {
            j += 1;
        }
        let e0 = j;
        while j < b.len() && b[j].is_ascii_digit() {
            j += 1;
        }
        if j > e0 {
            i = j;
        }
    }
    t[..i].parse::<f64>().ok()
}
/// `num()` di channels-core.js: `parseFloat(String(s).replace(',','.'))`, solo se finito.
pub fn num(s: &str) -> Option<f64> {
    let r = s.replacen(',', ".", 1);
    parse_float(&r).filter(|v| v.is_finite())
}

/// Testo JSON: le unità UTF-16 fuori dall'ASCII si scrivono come \uXXXX, così passano anche i surrogati isolati di JS.
pub fn json_u16(out: &mut String, s: &[u16]) {
    out.push('"');
    for &u in s {
        match u {
            0x22 => out.push_str("\\\""),
            0x5C => out.push_str("\\\\"),
            0x20..=0x7E => out.push(u as u8 as char),
            _ => out.push_str(&format!("\\u{:04x}", u)),
        }
    }
    out.push('"');
}
pub fn json_str(out: &mut String, s: &str) {
    let v: Vec<u16> = s.encode_utf16().collect();
    json_u16(out, &v);
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parse_float_like_js() {
        assert_eq!(parse_float("  1.5abc"), Some(1.5));
        assert_eq!(parse_float("1e"), Some(1.0));
        assert_eq!(parse_float("1e+"), Some(1.0));
        assert_eq!(parse_float(".5"), Some(0.5));
        assert_eq!(parse_float("5."), Some(5.0));
        assert_eq!(parse_float("."), None);
        assert_eq!(parse_float("-.e5"), None);
        assert_eq!(parse_float("-Infinityx"), Some(f64::NEG_INFINITY));
        assert_eq!(parse_float("1.2.3"), Some(1.2));
        assert_eq!(parse_float("\u{a0}7"), Some(7.0));
        assert!(parse_float("-0").unwrap().is_sign_negative());
        assert_eq!(num("1,5"), Some(1.5));
        assert_eq!(num("1e400"), None);
    }
    #[test]
    fn lines_like_js() {
        assert_eq!(lines("a\r\nb\rc\n\nd"), vec!["a", "b", "c", "", "d"]);
        assert_eq!(lines(""), vec![""]);
        assert_eq!(lines("a\n"), vec!["a", ""]);
    }
}
