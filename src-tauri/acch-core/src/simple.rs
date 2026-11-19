// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
//! Lettura veloce dei file di testo semplici: righe di intestazione di solo testo, poi soltanto righe «numero separatore numero»
//! con lo stesso separatore, asse X strettamente monotono, nessuna forma che il nucleo JS potrebbe leggere come migliaia
//! (niente virgole nei numeri, niente «1.234»). Per questi file `parseText0` di index.html dà un solo blocco, ordinato per X,
//! con i numeri di `Number()`, che arrotonda correttamente come `str::parse::<f64>`.
//!
//! Tutto il resto (intestazione, unità, riconoscimento della tecnica) lo decide sempre il JS: riceve la «sonda», cioè
//! l'intestazione con le prime e le ultime righe di dati, la legge con parseText e accetta i numeri del Rust solo se la
//! sonda dà un file semplice e i suoi numeri coincidono bit per bit con quelli del Rust (app/read-core.js, fromWire).
//! Se una qualsiasi condizione manca, la lettura passa al JS: mai un risultato diverso.
use crate::decode::{which, Enc};
use crate::js::trim;

/// righe di dati della sonda all'inizio e alla fine
pub const PROBE: usize = 1000;
/// la sonda contiene almeno questi byte dall'inizio: i riconoscitori del nucleo guardano i primi 20000 caratteri
const PROBE_HEAD_BYTES: usize = 65536;
const MAX_HEAD_LINES: usize = 2000;

pub struct Simple {
    /// testo della sonda (UTF-8): intestazione e prime righe, poi le ultime righe, con le fini riga originali
    pub probe: String,
    /// punti nell'ordine finale (X crescente)
    pub xs: Vec<f64>,
    pub ys: Vec<f64>,
    /// righe di dati iniziali nella sonda (le altre PROBE sono le ultime)
    pub head_n: usize,
}

#[derive(PartialEq, Clone, Copy)]
enum Sep {
    Tab,
    Semi,
    Comma,
    Space,
}

/// numero della grammatica di `toNum` senza virgole e senza la forma DOT3 («1.234», che il nucleo conta come possibili migliaia)
fn number(b: &[u8]) -> Option<(f64, Kind)> {
    let mut i = 0;
    if i < b.len() && (b[i] == b'+' || b[i] == b'-') {
        i += 1;
    }
    let d0 = i;
    while i < b.len() && b[i].is_ascii_digit() {
        i += 1;
    }
    let nint = i - d0;
    let mut nfrac = 0;
    let mut dot = false;
    if i < b.len() && b[i] == b'.' {
        dot = true;
        i += 1;
        let f0 = i;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
        nfrac = i - f0;
    }
    if nint == 0 && nfrac == 0 {
        return None;
    }
    let mut exp = false;
    if i < b.len() && (b[i] == b'e' || b[i] == b'E') {
        exp = true;
        i += 1;
        if i < b.len() && (b[i] == b'+' || b[i] == b'-') {
            i += 1;
        }
        let e0 = i;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
        if i == e0 {
            return None;
        }
    }
    if i != b.len() {
        return None;
    }
    // classi delle colonne di parseText0: DOT3 «[1-9]\d{0,2}\.\d{3}», intero di almeno tre cifre, altro con il punto
    let kind = if dot && !exp && nfrac == 3 && (1..=3).contains(&nint) && b[d0] != b'0' {
        Kind::Dot3
    } else if !dot && !exp && nint >= 3 {
        Kind::Int3
    } else if dot {
        Kind::Other
    } else {
        Kind::Plain
    };
    let s = std::str::from_utf8(b).ok()?;
    let v: f64 = s.parse().ok()?;
    v.is_finite().then_some((v, kind))
}
#[derive(Clone, Copy, PartialEq, Debug)]
enum Kind {
    Dot3,
    Int3,
    Other,
    Plain,
}
/// conteggi per colonna come `cur.cols` di parseText0: con «1.234» e interi lunghi ma nessun altro decimale il nucleo
/// sospetta le migliaia, quindi il file va al JS
#[derive(Default)]
struct Cols {
    dot: usize,
    int: usize,
    other: usize,
}
impl Cols {
    fn add(&mut self, k: Kind) {
        match k {
            Kind::Dot3 => self.dot += 1,
            Kind::Int3 => self.int += 1,
            Kind::Other => self.other += 1,
            Kind::Plain => {}
        }
    }
    fn thousands(&self) -> bool {
        self.dot > 0 && self.int > 0 && self.other == 0
    }
}

/// riga di dati: spazi facoltativi, numero, separatore, numero, spazi o tabulazioni facoltativi in fondo
fn data_line(l: &[u8]) -> Option<((f64, Kind), (f64, Kind), Sep)> {
    let mut a = 0;
    while a < l.len() && l[a] == b' ' {
        a += 1;
    }
    let mut b = l.len();
    while b > a && (l[b - 1] == b' ' || l[b - 1] == b'\t') {
        b -= 1;
    }
    let s = &l[a..b];
    let first = s.iter().position(|&c| matches!(c, b'\t' | b';' | b',' | b' '))?;
    let (sep, rest) = match s[first] {
        b'\t' => (Sep::Tab, &s[first + 1..]),
        b';' => (Sep::Semi, &s[first + 1..]),
        b',' => (Sep::Comma, &s[first + 1..]),
        _ => {
            let mut k = first;
            while k < s.len() && s[k] == b' ' {
                k += 1;
            }
            (Sep::Space, &s[k..])
        }
    };
    if rest.iter().any(|&c| matches!(c, b'\t' | b';' | b',' | b' ')) {
        return None;
    }
    let x = number(&s[..first])?;
    let y = number(rest)?;
    Some((x, y, sep))
}

/// riga di testo per il nucleo: `/^"?[^\d+\-.",;\t]/` sulla riga senza spazi ai lati (mai un numero per parseLine)
fn text_line(t: &str) -> bool {
    let bad = |c: char| c.is_ascii_digit() || matches!(c, '+' | '-' | '.' | '"' | ',' | ';' | '\t');
    let mut it = t.chars();
    match it.next() {
        None => false,
        Some('"') => matches!(it.next(), Some(c) if !bad(c)),
        Some(c) => !bad(c),
    }
}

/// Inizi e fini delle righe come `split(/\r\n|\n|\r/)`: (inizio, fine del contenuto, inizio della riga dopo)
fn line_spans(b: &[u8], from: usize) -> Vec<(usize, usize, usize)> {
    let mut out = Vec::new();
    let (mut a, mut i) = (from, from);
    while i < b.len() {
        match b[i] {
            b'\r' => {
                let n = if i + 1 < b.len() && b[i + 1] == b'\n' { 2 } else { 1 };
                out.push((a, i, i + n));
                i += n;
                a = i;
            }
            b'\n' => {
                out.push((a, i, i + 1));
                i += 1;
                a = i;
            }
            _ => i += 1,
        }
    }
    out.push((a, b.len(), b.len()));
    out
}

/// Lettura veloce, oppure None (il file va al JS). Err solo se annullata.
pub fn read(u: &[u8], cancel: &dyn Fn() -> bool, progress: &mut dyn FnMut(usize)) -> Result<Option<Simple>, String> {
    let Enc::Utf8 { skip } = which(u) else { return Ok(None) };
    let b = &u[skip..];
    let spans = line_spans(b, 0);
    // intestazione: righe vuote o di testo, fino alla prima riga di dati
    let mut k = 0;
    let mut head_lines = 0;
    while k < spans.len() {
        let (s, e, _) = spans[k];
        let raw = &b[s..e];
        if data_line(raw).is_some() {
            break;
        }
        let Ok(st) = std::str::from_utf8(raw) else { return Ok(None) };
        let t = trim(st);
        if !t.is_empty() {
            if !text_line(t) {
                return Ok(None);
            }
            head_lines += 1;
            if head_lines > MAX_HEAD_LINES {
                return Ok(None);
            }
        }
        k += 1;
    }
    let first = k;
    let mut xs: Vec<f64> = Vec::with_capacity(spans.len() - first);
    let mut ys: Vec<f64> = Vec::with_capacity(spans.len() - first);
    let mut rows: Vec<usize> = Vec::with_capacity(spans.len() - first); // indice della riga di ogni punto
    let mut sep0: Option<Sep> = None;
    let mut dir = 0i8;
    let (mut cx, mut cy) = (Cols::default(), Cols::default());
    let mut next_report = 4 << 20;
    for (j, &(s, e, _)) in spans.iter().enumerate().skip(first) {
        if j % 65536 == 0 {
            if cancel() {
                return Err("cancelled".into());
            }
            if s >= next_report {
                progress(s);
                next_report = s + (4 << 20);
            }
        }
        let raw = &b[s..e];
        match data_line(raw) {
            Some(((x, kx), (y, ky), sep)) => {
                cx.add(kx);
                cy.add(ky);
                if *sep0.get_or_insert(sep) != sep {
                    return Ok(None);
                }
                if let Some(&last) = xs.last() {
                    let d = if x > last { 1 } else if x < last { -1 } else { 0 };
                    if d == 0 || (dir != 0 && d != dir) {
                        return Ok(None);
                    }
                    dir = d;
                }
                xs.push(x);
                ys.push(y);
                rows.push(j);
            }
            None => {
                // solo righe vuote per il trim() di JS (anche con spazi Unicode)
                let Ok(st) = std::str::from_utf8(raw) else { return Ok(None) };
                if !trim(st).is_empty() {
                    return Ok(None);
                }
            }
        }
    }
    let n = xs.len();
    if cx.thousands() || cy.thousands() || n < 2 * PROBE + 2 {
        return Ok(None);
    }
    // sonda: dall'inizio alla fine della riga del punto PROBE (almeno PROBE_HEAD_BYTES), poi dalla riga del punto n-PROBE alla fine
    let mut head_n = PROBE;
    while head_n < n - PROBE && spans[rows[head_n - 1]].2 < PROBE_HEAD_BYTES {
        head_n += 1;
    }
    if head_n + PROBE >= n {
        return Ok(None);
    }
    let cut_a = spans[rows[head_n - 1]].2;
    let cut_b = spans[rows[n - PROBE]].0;
    let mut probe = String::with_capacity(cut_a + (b.len() - cut_b));
    probe.push_str(std::str::from_utf8(&b[..cut_a]).map_err(|_| "utf8")?);
    probe.push_str(std::str::from_utf8(&b[cut_b..]).map_err(|_| "utf8")?);
    if dir < 0 {
        xs.reverse();
        ys.reverse();
    }
    Ok(Some(Simple { probe, xs, ys, head_n }))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn grammar() {
        assert_eq!(number(b"1.234"), Some((1.234, Kind::Dot3)));
        assert_eq!(number(b"0.234"), Some((0.234, Kind::Other)));
        assert_eq!(number(b"1234.567"), Some((1234.567, Kind::Other)));
        assert_eq!(number(b"5."), Some((5.0, Kind::Other)));
        assert_eq!(number(b"-123"), Some((-123.0, Kind::Int3)));
        assert_eq!(number(b".5e-3"), Some((0.0005, Kind::Other)));
        assert!(number(b"1,5").is_none());
        assert!(number(b"1e").is_none());
        assert!(number(b"1e999").is_none());
        assert!(data_line(b"1\t2\t3").is_none());
        assert!(data_line(b"\t1\t2").is_none());
        assert_eq!(data_line(b"  1   2  ").map(|r| (r.0 .0, r.1 .0)), Some((1.0, 2.0)));
        assert!(text_line("Time (min)\tmAU"));
        assert!(!text_line("\"1\""));
        assert!(!text_line("\""));
    }
    #[test]
    fn simple_file() {
        let mut t = String::from("Wavenumber\tAbs\n");
        for i in 0..20000 {
            t.push_str(&format!("{}\t{}\r\n", 4000 - i, (i as f64) * 0.5));
        }
        let s = read(t.as_bytes(), &|| false, &mut |_| {}).unwrap().unwrap();
        assert_eq!(s.xs.len(), 20000);
        assert_eq!(s.xs[0], -15999.0);
        assert!(s.probe.starts_with("Wavenumber\tAbs\n4000\t0\r\n"));
        assert!(s.probe.ends_with("-15999\t9999.5\r\n"));
        // asse non monotono: al JS
        let bad = t.replace("\n3000\t", "\n5000\t");
        assert!(read(bad.as_bytes(), &|| false, &mut |_| {}).unwrap().is_none());
    }
}
