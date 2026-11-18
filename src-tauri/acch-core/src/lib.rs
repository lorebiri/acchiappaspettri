// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
//! acch-core: lettura veloce dei file di Acchiappaspettri, senza Tauri (la usano l'app e `acch-core-cli`).
//!
//! Il JS di index.html e di app/*-core.js è la specifica: qui si rifà solo la parte lunga (byte, righe, numeri) con le
//! stesse operazioni, e il risultato si consegna in un formato binario (`wire`) che app/read-core.js trasforma nello
//! stesso oggetto che darebbe il JS. Quando un file non rientra nei casi coperti la risposta è «decline» e legge il JS.
//! Nessuna funzione esiste solo qui.
pub mod agilent;
pub mod calc;
pub mod cube;
pub mod decode;
pub mod js;
pub mod simple;
pub mod textmc;
pub mod zip;

use js::{json_str, json_u16};

/// Formato della risposta: «ACW1», lunghezza del JSON (u32 LE), JSON, zeri fino a un multiplo di 8, poi i numeri (f64 LE).
/// Nel JSON un vettore di numeri è `{"$f":[inizio,lunghezza]}` (in numeri, non in byte).
pub struct Wire {
    json: String,
    data: Vec<f64>,
}
impl Wire {
    fn new() -> Self {
        Wire { json: String::new(), data: Vec::new() }
    }
    fn raw(&mut self, s: &str) -> &mut Self {
        self.json.push_str(s);
        self
    }
    fn key(&mut self, k: &str) -> &mut Self {
        if !self.json.ends_with('{') && !self.json.ends_with('[') {
            self.json.push(',');
        }
        json_str(&mut self.json, k);
        self.json.push(':');
        self
    }
    fn str(&mut self, s: &str) -> &mut Self {
        json_str(&mut self.json, s);
        self
    }
    fn u16s(&mut self, s: &[u16]) -> &mut Self {
        json_u16(&mut self.json, s);
        self
    }
    fn num(&mut self, v: usize) -> &mut Self {
        self.json.push_str(&v.to_string());
        self
    }
    fn arr(&mut self, v: &[f64]) -> &mut Self {
        let off = self.data.len();
        self.data.extend_from_slice(v);
        self.json.push_str(&format!("{{\"$f\":[{},{}]}}", off, v.len()));
        self
    }
    fn strs(&mut self, v: &[String]) -> &mut Self {
        self.json.push('[');
        for (i, s) in v.iter().enumerate() {
            if i > 0 {
                self.json.push(',');
            }
            json_str(&mut self.json, s);
        }
        self.json.push(']');
        self
    }
    fn pairs(&mut self, v: &[(String, String)]) -> &mut Self {
        self.json.push('[');
        for (i, (a, b)) in v.iter().enumerate() {
            if i > 0 {
                self.json.push(',');
            }
            self.json.push('[');
            json_str(&mut self.json, a);
            self.json.push(',');
            json_str(&mut self.json, b);
            self.json.push(']');
        }
        self.json.push(']');
        self
    }
    fn sep(&mut self) -> &mut Self {
        self.json.push(',');
        self
    }
    // I10: le stesse operazioni per chi usa il crate da fuori (acch-core-cli, comandi dell'app per le mappe)
    pub fn new_pub() -> Self {
        Self::new()
    }
    pub fn raw_pub(&mut self, s: &str) -> &mut Self {
        self.raw(s)
    }
    pub fn key_pub(&mut self, k: &str) -> &mut Self {
        self.key(k)
    }
    pub fn str_pub(&mut self, s: &str) -> &mut Self {
        self.str(s)
    }
    pub fn num_pub(&mut self, v: usize) -> &mut Self {
        self.num(v)
    }
    pub fn arr_pub(&mut self, v: &[f64]) -> &mut Self {
        self.arr(v)
    }
    pub fn bytes(&self) -> Vec<u8> {
        let j = self.json.as_bytes();
        let head = 8 + j.len();
        let pad = (8 - head % 8) % 8;
        let mut out = Vec::with_capacity(head + pad + 8 * self.data.len());
        out.extend_from_slice(b"ACW1");
        out.extend_from_slice(&(j.len() as u32).to_le_bytes());
        out.extend_from_slice(j);
        out.resize(head + pad, 0);
        for v in &self.data {
            out.extend_from_slice(&v.to_le_bytes());
        }
        out
    }
}

/// Opzioni della lettura, le stesse di AcchRead.read in app/read-core.js
#[derive(Default, Clone)]
pub struct Opt {
    /// progetto della versione 1 o spettro salvato senza canale: niente lettura dei canali dei file di testo
    pub legacy: bool,
}

fn head_obj(w: &mut Wire, head: &[(&str, Vec<u16>)]) {
    w.raw("{");
    for (k, v) in head {
        w.key(k).u16s(v);
    }
    w.raw("}");
}

/// FNV-1a a 32 bit dei byte letti: il JS lo confronta con i byte che ha, così un file cambiato fra le due letture non passa
pub fn fnv(u: &[u8]) -> u32 {
    let mut h: u32 = 0x811c9dc5;
    for &b in u {
        h ^= b as u32;
        h = h.wrapping_mul(0x01000193);
    }
    h
}

/// Lettura nello stesso ordine di AcchRead.read: .uv, .ch, (SPA e OPUS al JS), testo multicanale, testo semplice.
pub fn read(u: &[u8], name: &str, opt: &Opt, cancel: &dyn Fn() -> bool, progress: &mut dyn FnMut(usize)) -> Result<Wire, String> {
    let mut w = Wire::new();
    w.raw("{");
    w.key("bytes").num(u.len()).key("fnv").num(fnv(u) as usize);
    let low = name.to_ascii_lowercase();
    if low.ends_with(".uv") {
        match agilent::read_uv(u, cancel)? {
            None => {
                w.key("kind").str("uv-null");
            }
            Some(uv) => {
                w.key("kind").str("uv").key("version").str(&uv.version).key("head");
                head_obj(&mut w, &uv.head);
                w.key("times").arr(&uv.times).key("a").arr(&uv.a).key("s").arr(&uv.s).key("len").arr(&uv.len).key("v").arr(&uv.v);
                w.key("wl").arr(&[uv.lo, uv.hi, uv.step]);
            }
        }
        w.raw("}");
        return Ok(w);
    }
    let ver = agilent::version(u);
    if low.ends_with(".ch") || matches!(ver.as_str(), "179" | "181" | "130" | "30") {
        if let Some(c) = agilent::read_ch(u) {
            w.key("kind").str("ch").key("version").str(&c.version).key("head");
            head_obj(&mut w, &c.head);
            w.key("xs").arr(&c.xs).key("ys").arr(&c.ys);
            w.raw("}");
            return Ok(w);
        }
    }
    // parseBinary: SPA e OPUS li legge il JS
    if low.ends_with(".spa") || (u.len() > 4 && u32::from_le_bytes([u[0], u[1], u[2], u[3]]) == 0xFEFE0A0A) {
        w.key("kind").str("decline").key("why").str("binary");
        w.raw("}");
        return Ok(w);
    }
    if !opt.legacy {
        // readText: .arw (per nome o per intestazione), poi Shimadzu; serve il testo decodificato come decodeBuffer
        let maybe_arw = low.ends_with(".arw");
        if maybe_arw || needs_text(u) {
            let text = decode::decode(u);
            if cancel() {
                return Err("cancelled".into());
            }
            if maybe_arw || textmc::arw_head(&text) {
                if let Some(blocks) = textmc::scan_arw(&text) {
                    w.key("kind").str("arw").key("blocks").raw("[");
                    for (i, b) in blocks.iter().enumerate() {
                        if i > 0 {
                            w.sep();
                        }
                        w.raw("{").key("rec").pairs(&b.rec).key("meta").strs(&b.meta).key("xs").arr(&b.xs).key("ys").arr(&b.ys).raw("}");
                    }
                    w.raw("]}");
                    return Ok(w);
                }
            }
            if let Some(s) = textmc::scan_shimadzu(&text) {
                w.key("kind").str("shimadzu").key("declared").num(s.declared).key("status").strs(&s.status).key("samples").raw("[");
                for (i, sm) in s.samples.iter().enumerate() {
                    if i > 0 {
                        w.sep();
                    }
                    w.raw("{").key("name").str(&sm.name).key("file").str(&sm.file).key("channels").raw("[");
                    for (j, c) in sm.channels.iter().enumerate() {
                        if j > 0 {
                            w.sep();
                        }
                        w.raw("{").key("name").str(&c.name).key("paren").str(&c.paren).key("kv").pairs(&c.kv).key("meta").strs(&c.meta);
                        w.key("xs").arr(&c.xs).key("ys").arr(&c.ys).raw("}");
                    }
                    w.raw("]}");
                }
                w.raw("]}");
                return Ok(w);
            }
        }
    }
    match simple::read(u, cancel, progress)? {
        Some(s) => {
            w.key("kind").str("simple").key("probe").str(&s.probe).key("headN").num(s.head_n).key("tailN").num(simple::PROBE);
            w.key("xs").arr(&s.xs).key("ys").arr(&s.ys);
        }
        None => {
            w.key("kind").str("decline").key("why").str("text");
        }
    }
    w.raw("}");
    Ok(w)
}
/// Filtro largo prima di decodificare tutto il testo: non scarta mai un file che readText riconoscerebbe
/// (l'intestazione Shimadzu sta nei primi 20000 caratteri, cioè entro 60000 byte in UTF-8; quella .arw all'inizio del testo).
fn needs_text(u: &[u8]) -> bool {
    if matches!(decode::which(u), decode::Enc::Utf16Le { .. } | decode::Enc::Utf16Be) {
        return true;
    }
    let h = &u[..u.len().min(80000)];
    h.windows(8).any(|w| w == b"[Header]") || u[..u.len().min(16)].windows(6).any(|w| w.eq_ignore_ascii_case(b"sample"))
}
