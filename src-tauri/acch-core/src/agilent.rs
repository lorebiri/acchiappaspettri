// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
//! Agilent ChemStation / OpenLab .ch e .uv: la stessa lettura di `readCh` e `readUv` in app/channels-core.js (la specifica),
//! operazione per operazione, così i numeri sono identici bit per bit. Disposizione DEDOTTA (vedi channels-core.js).

pub struct Layout {
    pub wide: bool,
    pub data: usize,
    pub scale: usize,
    pub s: &'static [(&'static str, usize)],
}
const S179: &[(&str, usize)] =
    &[("sample", 0x35A), ("operator", 0x758), ("date", 0x957), ("method", 0xA0E), ("instrument", 0xC15), ("units", 0x104C), ("signal", 0x1075)];
const S130: &[(&str, usize)] = &[("sample", 0x18), ("operator", 0x94), ("date", 0xB2), ("method", 0xE4), ("units", 0x244), ("signal", 0x254)];
pub fn layout(ver: &str) -> Option<Layout> {
    match ver {
        "179" | "181" => Some(Layout { wide: true, data: 0x1800, scale: 0x127C, s: S179 }),
        "130" => Some(Layout { wide: false, data: 0x1000, scale: 0x284, s: S130 }),
        "30" => Some(Layout { wide: false, data: 0x400, scale: 0x284, s: S130 }),
        _ => None,
    }
}

pub fn version(u8s: &[u8]) -> String {
    if u8s.is_empty() {
        return String::new();
    }
    let n = u8s[0] as usize;
    if !(1..=3).contains(&n) || u8s.len() < 0x200 {
        return String::new();
    }
    let v: String = u8s[1..1 + n].iter().map(|&b| b as char).collect();
    if v.bytes().all(|b| b.is_ascii_digit()) {
        v
    } else {
        String::new()
    }
}

fn is_ws16(u: u16) -> bool {
    char::from_u32(u as u32).map(crate::js::is_ws).unwrap_or(false)
}
/// `pstr`: stringa con la lunghezza nel primo byte, Latin-1 o UTF-16LE; poi `.replace(/\0+$/,'').trim()`. Unità UTF-16, come in JS.
pub fn pstr(u: &[u8], off: usize, wide: bool) -> Vec<u16> {
    if off >= u.len() {
        return Vec::new();
    }
    let n = u[off] as usize;
    let mut s: Vec<u16> = Vec::new();
    if wide {
        for i in 0..n {
            let p = off + 1 + 2 * i;
            if p + 1 >= u.len() {
                break;
            }
            s.push(u[p] as u16 | ((u[p + 1] as u16) << 8));
        }
    } else {
        let (a, b) = (off + 1, off + 1 + n);
        let mut i = a;
        while i < b && i < u.len() {
            s.push(u[i] as u16);
            i += 1;
        }
    }
    while s.last() == Some(&0) {
        s.pop();
    }
    let a = s.iter().position(|&c| !is_ws16(c)).unwrap_or(s.len());
    let b = s.iter().rposition(|&c| !is_ws16(c)).map(|i| i + 1).unwrap_or(a);
    s[a..b.max(a)].to_vec()
}

fn i16be(u: &[u8], p: usize) -> i16 {
    i16::from_be_bytes([u[p], u[p + 1]])
}
fn i32be(u: &[u8], p: usize) -> i32 {
    i32::from_be_bytes([u[p], u[p + 1], u[p + 2], u[p + 3]])
}
fn f32be(u: &[u8], p: usize) -> f32 {
    f32::from_be_bytes([u[p], u[p + 1], u[p + 2], u[p + 3]])
}
fn f64be(u: &[u8], p: usize) -> f64 {
    f64::from_be_bytes(u[p..p + 8].try_into().unwrap())
}
fn f64le(u: &[u8], p: usize) -> f64 {
    f64::from_le_bytes(u[p..p + 8].try_into().unwrap())
}
fn u16le(u: &[u8], p: usize) -> u16 {
    u16::from_le_bytes([u[p], u[p + 1]])
}
fn i16le(u: &[u8], p: usize) -> i16 {
    i16::from_le_bytes([u[p], u[p + 1]])
}
fn i32le(u: &[u8], p: usize) -> i32 {
    i32::from_le_bytes([u[p], u[p + 1], u[p + 2], u[p + 3]])
}
fn u32le(u: &[u8], p: usize) -> u32 {
    u32::from_le_bytes([u[p], u[p + 1], u[p + 2], u[p + 3]])
}

/// `deltaDecode` in big-endian; l'accumulatore è un Number di JS (f64): niente traboccamenti.
fn delta_decode(u: &[u8], off: usize, end: usize) -> Vec<f64> {
    let mut out = Vec::new();
    let mut acc = 0f64;
    let mut p = off;
    while p + 2 <= end {
        let head = u[p];
        let cnt = u[p + 1];
        if head != 0x10 {
            break;
        }
        p += 2;
        for _ in 0..cnt {
            if p + 2 > end {
                return out;
            }
            let d = i16be(u, p);
            p += 2;
            if d == -32768 {
                if p + 4 > end {
                    return out;
                }
                acc = i32be(u, p) as f64;
                p += 4;
            } else {
                acc += d as f64;
            }
            out.push(acc);
        }
    }
    out
}

fn ch_times(u: &[u8], n: usize) -> Option<Vec<f64>> {
    let (a, b) = (i32be(u, 0x11A) as f64, i32be(u, 0x11E) as f64);
    let (mut t0, mut t1) = (a / 60000.0, b / 60000.0);
    if !(b > a && b - a < 1e9) {
        let (fa, fb) = (f32be(u, 0x11A) as f64, f32be(u, 0x11E) as f64);
        if fa.is_finite() && fb.is_finite() && fb > fa {
            t0 = fa / 60000.0;
            t1 = fb / 60000.0;
        } else {
            return None;
        }
    }
    Some((0..n).map(|i| if n > 1 { t0 + (t1 - t0) * (i as f64) / ((n - 1) as f64) } else { t0 }).collect())
}

pub struct Ch {
    pub version: String,
    pub head: Vec<(&'static str, Vec<u16>)>,
    pub xs: Vec<f64>,
    pub ys: Vec<f64>,
}
/// `readCh`
pub fn read_ch(u: &[u8]) -> Option<Ch> {
    let ver = version(u);
    let l = layout(&ver)?;
    if u.len() <= l.data {
        return None;
    }
    let head = l.s.iter().map(|&(k, o)| (k, pstr(u, o, l.wide))).collect();
    let raw: Vec<f64> = if u[l.data] == 0x10 {
        delta_decode(u, l.data, u.len())
    } else {
        let n = (u.len() - l.data) / 8;
        (0..n).map(|i| f64le(u, l.data + 8 * i)).collect()
    };
    if raw.len() < 5 {
        return None;
    }
    let mut k = if u.len() >= l.scale + 8 { f64be(u, l.scale) } else { 1.0 };
    if !k.is_finite() || k == 0.0 || k.abs() > 1e12 {
        k = 1.0;
    }
    let ys: Vec<f64> = raw.iter().map(|v| v * k).collect();
    let xs = ch_times(u, ys.len())?;
    if !ys.iter().all(|v| v.is_finite()) {
        return None;
    }
    Some(Ch { version: ver, head, xs, ys })
}

pub struct Uv {
    pub version: String,
    pub head: Vec<(&'static str, Vec<u16>)>,
    pub times: Vec<f64>,
    pub a: Vec<f64>,
    pub s: Vec<f64>,
    /// valori di tutti gli spettri, uno dopo l'altro; `len[i]` valori per lo spettro i
    pub v: Vec<f64>,
    pub len: Vec<f64>,
    pub lo: f64,
    pub hi: f64,
    pub step: f64,
}
/// `readUv`
pub fn read_uv(u: &[u8], cancel: &dyn Fn() -> bool) -> Result<Option<Uv>, String> {
    let ver = version(u);
    if ver != "131" && ver != "31" {
        return Ok(None);
    }
    let wide = ver == "131";
    let n = i32be(u, 0x116);
    let start = if wide { 0x1002 } else { 0x202 };
    if !(n > 0 && (n as f64) < 1e7) {
        return Ok(None);
    }
    let n = n as usize;
    let mut out = Uv {
        version: ver.clone(),
        head: Vec::new(),
        times: Vec::with_capacity(n),
        a: Vec::with_capacity(n),
        s: Vec::with_capacity(n),
        v: Vec::new(),
        len: Vec::with_capacity(n),
        lo: f64::INFINITY,
        hi: f64::NEG_INFINITY,
        step: f64::INFINITY,
    };
    let mut pos = start;
    for i in 0..n {
        if i % 4096 == 0 && cancel() {
            return Err("cancelled".into());
        }
        if pos + 20 > u.len() {
            return Ok(None);
        }
        let len = u16le(u, pos) as usize;
        if len < 20 {
            return Ok(None);
        }
        let t = u32le(u, pos + 2) as f64 / 60000.0;
        let a = u16le(u, pos + 6) as f64 / 20.0;
        let b = u16le(u, pos + 8) as f64 / 20.0;
        let s = u16le(u, pos + 10) as f64 / 20.0;
        if !(s > 0.0) || !(b >= a) {
            return Ok(None);
        }
        let v0 = out.v.len();
        let mut p = pos + 20;
        let mut acc = 0f64;
        let end = u.len().min(pos + len);
        while p + 2 <= end {
            let d = i16le(u, p);
            p += 2;
            if d == -32768 {
                if p + 4 > end {
                    break;
                }
                acc = i32le(u, p) as f64;
                p += 4;
            } else {
                acc += d as f64;
            }
            out.v.push(acc / 2000.0);
        }
        let m = out.v.len() - v0;
        out.times.push(t);
        out.a.push(a);
        out.s.push(s);
        out.len.push(m as f64);
        // Math.min / Math.max: con valori finiti e mai -0 coincidono con f64::min / f64::max
        out.lo = out.lo.min(a);
        out.hi = out.hi.max(a + s * ((m as f64) - 1.0));
        out.step = out.step.min(s);
        pos += len;
    }
    let offs: [(&str, usize, usize); 4] = [("sample", 0x35A, 0x18), ("operator", 0x758, 0x94), ("date", 0x957, 0xB2), ("method", 0xA0E, 0xE4)];
    out.head = offs.iter().map(|&(k, w, nw)| (k, pstr(u, if wide { w } else { nw }, wide))).collect();
    Ok(Some(out))
}
