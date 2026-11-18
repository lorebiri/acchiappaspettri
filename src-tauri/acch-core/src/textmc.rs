// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
//! Waters Empower .arw e Shimadzu LabSolutions ASCII: la parte lunga della lettura (righe e numeri), come `scanArw` e
//! `scanShimadzu` di app/channels-core.js. La descrizione dei canali (parseChannel, finish) la fa sempre il JS sul risultato:
//! una sola implementazione, quindi nessuna differenza possibile.
use crate::js::{is_lt, is_ws, lines, num, trim, trim_end};

/// `l.split('\t').map(x=>x.trim().replace(/^"(.*)"$/,'$1').trim())`
fn tsv_q(l: &str) -> Vec<String> {
    l.split('\t')
        .map(|x| {
            let t = trim(x);
            let inner = if t.len() >= 2 && t.starts_with('"') && t.ends_with('"') && !t[1..t.len() - 1].chars().any(is_lt) { &t[1..t.len() - 1] } else { t };
            trim(inner).to_string()
        })
        .collect()
}

/// `t.split(/\t|;|\s+(?=[-+\d.])/).filter(Boolean)`, solo i primi due pezzi non vuoti (numRow usa solo quelli e il loro numero ≥ 2).
/// Senza allocazioni: scorre i caratteri una volta.
fn first_two(t: &str) -> Option<(&str, &str)> {
    let b = t.as_bytes();
    let mut out: [&str; 2] = ["", ""];
    let mut got = 0;
    let mut p = 0usize;
    let mut q = 0usize;
    while q < b.len() {
        let c = b[q];
        let (is_sep, e) = if c == b'\t' || c == b';' {
            (true, q + 1)
        } else if c < 0x80 && !matches!(c, b' ' | 0x0B | 0x0C | b'\n' | b'\r') {
            (false, 0)
        } else {
            // spazio (anche Unicode): \s+ goloso, valido solo se dopo c'è [-+\d.]
            let ch = t[q..].chars().next().unwrap();
            if !crate::js::is_ws(ch) {
                (false, 0)
            } else {
                let mut r = q;
                while r < b.len() {
                    let c2 = t[r..].chars().next().unwrap();
                    if !crate::js::is_ws(c2) {
                        break;
                    }
                    r += c2.len_utf8();
                }
                if r < b.len() && matches!(b[r], b'-' | b'+' | b'.' | b'0'..=b'9') {
                    (true, r)
                } else {
                    (false, 0)
                }
            }
        };
        if is_sep {
            let piece = &t[p..q];
            if !piece.is_empty() {
                out[got] = piece;
                got += 1;
                if got == 2 {
                    return Some((out[0], out[1]));
                }
            }
            p = e;
            q = e;
        } else {
            q += if c < 0x80 { 1 } else { t[q..].chars().next().unwrap().len_utf8() };
        }
    }
    let piece = &t[p..];
    if !piece.is_empty() && got == 1 {
        return Some((out[0], piece));
    }
    None
}
/// `/^[-+]?[\d.,]+(e[-+]?\d+)?$/i`
fn num_form(s: &str) -> bool {
    let b = s.as_bytes();
    let mut i = 0;
    if i < b.len() && (b[i] == b'+' || b[i] == b'-') {
        i += 1;
    }
    let d0 = i;
    while i < b.len() && (b[i].is_ascii_digit() || b[i] == b'.' || b[i] == b',') {
        i += 1;
    }
    if i == d0 {
        return false;
    }
    if i == b.len() {
        return true;
    }
    // [\d.,]+ è goloso ma può restituire: la «e» non è fra i suoi caratteri, quindi qui basta controllare il resto
    if b[i] != b'e' && b[i] != b'E' {
        return false;
    }
    i += 1;
    if i < b.len() && (b[i] == b'+' || b[i] == b'-') {
        i += 1;
    }
    let e0 = i;
    while i < b.len() && b[i].is_ascii_digit() {
        i += 1;
    }
    i > e0 && i == b.len()
}
/// `numRow` di channels-core.js
pub fn num_row(l: &str) -> Option<(f64, f64)> {
    let t = trim(l);
    if t.is_empty() || t.starts_with('"') {
        return None;
    }
    let (c0, c1) = first_two(t)?;
    match (num(c0), num(c1)) {
        (Some(a), Some(b)) if num_form(trim(c0)) => Some((a, b)),
        _ => None,
    }
}

pub struct ArwBlock {
    /// assegnazioni `rec[key]=valore` nell'ordine del file: il JS le ripete e ottiene lo stesso oggetto
    pub rec: Vec<(String, String)>,
    pub meta: Vec<String>,
    pub xs: Vec<f64>,
    pub ys: Vec<f64>,
}
/// `scanArw`: None se il file non ha la forma di un .arw (stesse condizioni del JS)
pub fn scan_arw(text: &str) -> Option<Vec<ArwBlock>> {
    let ls = lines(text);
    if !ls.iter().take(3).any(|l| trim(l).starts_with('"')) {
        return None;
    }
    let mut blocks = Vec::new();
    let mut i = 0;
    while i < ls.len() {
        if !trim(ls[i]).starts_with('"') {
            i += 1;
            continue;
        }
        let mut q: Vec<Vec<String>> = Vec::new();
        while i < ls.len() && trim(ls[i]).starts_with('"') {
            q.push(tsv_q(ls[i]));
            i += 1;
        }
        let mut rec = Vec::new();
        let mut k = 0;
        while k + 1 < q.len() {
            for (j, key) in q[k].iter().enumerate() {
                if !key.is_empty() {
                    rec.push((key.clone(), q[k + 1].get(j).cloned().unwrap_or_default()));
                }
            }
            k += 2;
        }
        let (mut xs, mut ys) = (Vec::new(), Vec::new());
        while i < ls.len() && !trim(ls[i]).starts_with('"') {
            if let Some((a, b)) = num_row(ls[i]) {
                xs.push(a);
                ys.push(b);
            }
            i += 1;
        }
        blocks.push(ArwBlock { rec, meta: q.iter().map(|r| r.join("\t")).collect(), xs, ys });
    }
    if blocks.is_empty() || !blocks.iter().any(|b| b.xs.len() >= 5) {
        return None;
    }
    Some(blocks)
}

/// `/^"?Sample\s*Name"?\t/i` sui primi 200 caratteri (unità UTF-16)
pub fn arw_head(text: &str) -> bool {
    let head = prefix_u16(text, 200);
    let mut s = head.as_str();
    if s.starts_with('"') {
        s = &s[1..];
    }
    let low = |s: &str, w: &str| s.len() >= w.len() && s.is_char_boundary(w.len()) && s[..w.len()].eq_ignore_ascii_case(w);
    if !low(s, "sample") {
        return false;
    }
    s = s[6..].trim_start_matches(is_ws);
    if !low(s, "name") {
        return false;
    }
    s = &s[4..];
    if s.starts_with('"') {
        s = &s[1..];
    }
    s.starts_with('\t')
}
/// `text.slice(0, n)` in unità UTF-16; una coppia di surrogati tagliata a metà diventa un carattere che non è uno spazio
fn prefix_u16(text: &str, n: usize) -> String {
    let mut out = String::new();
    let mut u = 0;
    for c in text.chars() {
        let w = c.len_utf16();
        if u + w > n {
            if u < n {
                out.push('\u{FFFF}');
            }
            break;
        }
        out.push(c);
        u += w;
    }
    out
}
/// righe per `^`/`$` con il flag m: divise da \n, \r, U+2028, U+2029
fn m_lines(s: &str) -> impl Iterator<Item = &str> {
    s.split(is_lt)
}
/// `/^\[Header\]\s*$/m` sui primi 20000 caratteri e `/^\[[^\]\n]*Chromatogram[^\]\n]*\]\s*$/mi` sul testo
pub fn shimadzu_head(text: &str) -> bool {
    let head = prefix_u16(text, 20000);
    if !m_lines(&head).any(|l| l.starts_with("[Header]") && l[8..].chars().all(is_ws)) {
        return false;
    }
    // il secondo: «[» a inizio riga, poi fino alla prima «]» (senza \n, ma \r e U+2028 ammessi), «chromatogram» dentro, poi solo spazi fino a fine riga
    let b = text.as_bytes();
    let mut start = 0usize;
    loop {
        let at_line_start = start == 0 || {
            let prev = text[..start].chars().next_back().unwrap();
            is_lt(prev)
        };
        if at_line_start && b.get(start) == Some(&b'[') {
            let rest = &text[start + 1..];
            if let Some(close) = rest.find(|c| c == ']' || c == '\n') {
                if rest.as_bytes()[close] == b']' {
                    let mid = &rest[..close];
                    let after = &rest[close + 1..];
                    let tail_ok = after.chars().take_while(|&c| !is_lt(c)).all(is_ws);
                    if tail_ok && mid.to_ascii_lowercase().contains("chromatogram") {
                        return true;
                    }
                }
            }
        }
        // prossimo inizio riga
        match text[start..].find(is_lt) {
            Some(k) => {
                let c = text[start + k..].chars().next().unwrap();
                start = start + k + c.len_utf8();
                if start > text.len() {
                    return false;
                }
            }
            None => return false,
        }
    }
}

pub struct ShChan {
    pub name: String,
    pub paren: String,
    pub kv: Vec<(String, String)>,
    pub meta: Vec<String>,
    pub xs: Vec<f64>,
    pub ys: Vec<f64>,
}
pub struct ShSample {
    pub name: String,
    pub file: String,
    pub channels: Vec<ShChan>,
}
pub struct Shimadzu {
    pub declared: usize,
    pub status: Vec<String>,
    pub samples: Vec<ShSample>,
}
fn ci_contains(s: &str, w: &str) -> bool {
    s.to_ascii_lowercase().contains(w)
}
/// `/Status\s*Trace/i`
fn status_trace(s: &str) -> bool {
    let low = s.to_ascii_lowercase();
    let mut from = 0;
    while let Some(k) = low[from..].find("status") {
        let r = low[from + k + 6..].trim_start_matches(is_ws);
        if r.starts_with("trace") {
            return true;
        }
        from += k + 6;
    }
    false
}
/// `(/\((.*)\)/.exec(name)||[])[1]||name`
fn paren_of(name: &str) -> String {
    if let Some(a) = name.find('(') {
        let rest = &name[a + 1..];
        // .* non attraversa le fini riga: l'ultima «)» prima di una fine riga
        let line_end = rest.find(is_lt).unwrap_or(rest.len());
        if let Some(b) = rest[..line_end].rfind(')') {
            let inner = &rest[..b];
            if !inner.is_empty() {
                return inner.to_string();
            }
            return name.to_string();
        }
        // nessuna «)» sulla stessa riga dopo la prima «(»: il JS prova le «(» seguenti, che non hanno «)» dopo
    }
    name.to_string()
}
/// `kv`: `l.split(/\t|,(?=\S)/)`, prime due celle con trim
fn kv(l: &str) -> (String, String) {
    let cs: Vec<(usize, char)> = l.char_indices().collect();
    let mut cells: Vec<&str> = Vec::new();
    let mut p = 0usize;
    for (k, &(bi, c)) in cs.iter().enumerate() {
        let sep = c == '\t' || (c == ',' && k + 1 < cs.len() && !is_ws(cs[k + 1].1));
        if sep {
            cells.push(&l[p..bi]);
            p = bi + 1;
            if cells.len() >= 2 {
                break;
            }
        }
    }
    if cells.len() < 2 {
        cells.push(&l[p..]);
    }
    (trim(cells[0]).to_string(), trim(cells.get(1).copied().unwrap_or("")).to_string())
}
/// `/^\[(.+)\]$/` sulla riga già senza spazi ai lati
fn section(t: &str) -> Option<&str> {
    if t.len() >= 3 && t.starts_with('[') && t.ends_with(']') {
        let m = &t[1..t.len() - 1];
        if !m.chars().any(is_lt) {
            return Some(m);
        }
    }
    None
}
/// `/^Sample\s*Name$/i` e simili: due parole con spazi facoltativi in mezzo, nient'altro
fn two_words(k: &str, a: &str, b: &str) -> bool {
    let low = k.to_ascii_lowercase();
    if !low.starts_with(a) {
        return false;
    }
    let r = low[a.len()..].trim_start_matches(is_ws);
    r == b
}
fn data_file_name(k: &str) -> bool {
    let low = k.to_ascii_lowercase();
    if !low.starts_with("data") {
        return false;
    }
    let r = low[4..].trim_start_matches(is_ws);
    if !r.starts_with("file") {
        return false;
    }
    r[4..].trim_start_matches(is_ws) == "name"
}
/// `/^R\.?\s*Time/i`
fn rtime(t: &str) -> bool {
    let low = t.to_ascii_lowercase();
    let Some(r) = low.strip_prefix('r') else { return false };
    let r = r.strip_prefix('.').unwrap_or(r);
    r.trim_start_matches(is_ws).starts_with("time")
}

/// `scanShimadzu`: None se mancano le sezioni
pub fn scan_shimadzu(text: &str) -> Option<Shimadzu> {
    if !shimadzu_head(text) {
        return None;
    }
    let ls = lines(text);
    let mut out = Shimadzu { declared: 0, status: Vec::new(), samples: Vec::new() };
    // sezione corrente: None, Some(None) = sezione «altra», Some(Some(i)) = canale i del campione corrente
    let mut sec: Option<Option<usize>> = None;
    let mut data = false;
    for raw in ls {
        let l = trim_end(raw);
        if let Some(m) = section(trim(l)) {
            let name = trim(m);
            if name.eq_ignore_ascii_case("header") || out.samples.is_empty() {
                out.samples.push(ShSample { name: String::new(), file: String::new(), channels: Vec::new() });
            }
            let cur = out.samples.last_mut().unwrap();
            if ci_contains(name, "chromatogram") && !status_trace(name) {
                out.declared += 1;
                cur.channels.push(ShChan { name: name.to_string(), paren: paren_of(name), kv: Vec::new(), meta: vec![trim(l).to_string()], xs: Vec::new(), ys: Vec::new() });
                sec = Some(Some(cur.channels.len() - 1));
                data = false;
            } else {
                if status_trace(name) {
                    out.status.push(paren_of(name));
                }
                sec = Some(None);
            }
            continue;
        }
        let Some(s) = sec else { continue };
        if trim(l).is_empty() {
            continue;
        }
        let cur = out.samples.last_mut().unwrap();
        let Some(ci) = s else {
            let (k, v) = kv(l);
            if two_words(&k, "sample", "name") {
                cur.name = v.clone();
            }
            if data_file_name(&k) {
                cur.file = v.rsplit(|c| c == '\\' || c == '/').next().unwrap_or("").to_string();
            }
            continue;
        };
        let ch = &mut cur.channels[ci];
        let r = if l.contains('\t') { num_row(l) } else { num_row(&l.replace(',', "\t")) };
        if data {
            if let Some((a, b)) = r {
                ch.xs.push(a);
                ch.ys.push(b);
                continue;
            }
        }
        if rtime(trim(l)) {
            data = true;
            ch.meta.push(trim(l).to_string());
            continue;
        }
        if !data {
            let (k, v) = kv(l);
            ch.kv.push((k, v));
            ch.meta.push(trim(l).to_string());
        }
    }
    // stessa condizione del JS: almeno un canale con 5 punti, se no il file non è (per questo lettore) uno Shimadzu
    if !out.samples.iter().any(|s| s.channels.iter().any(|c| c.xs.len() >= 5)) {
        return None;
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rows_and_splits() {
        assert_eq!(first_two("1.5  2"), Some(("1.5", "2")));
        assert_eq!(first_two("a  b 5"), Some(("a  b", "5")));
        assert_eq!(first_two("1\t;2"), Some(("1", "2")));
        assert_eq!(first_two("1\u{a0}-2\tx"), Some(("1", "-2")));
        assert_eq!(first_two("abc"), None);
        assert_eq!(num_row("0.5\t12.5mAU"), Some((0.5, 12.5)));
        assert_eq!(num_row("\"x\"\t1"), None);
        assert_eq!(num_row("1e5x 2"), None);
        assert!(num_form("1,000.5e-3"));
        assert_eq!(kv("a,b,c"), ("a".into(), "b".into()));
        assert_eq!(kv("a, b"), ("a, b".into(), "".into()));
        assert_eq!(paren_of("LC Chromatogram(Detector A-Ch1)"), "Detector A-Ch1");
        assert_eq!(paren_of("x()"), "x()");
        assert!(status_trace("Status Trace(Pump A Pressure)"));
        assert!(rtime("R.Time (min)\tIntensity"));
    }
}
