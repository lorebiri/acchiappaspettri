// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
//! Picchi e aree (tappa I7): le stesse funzioni del nucleo JS di index.html, riscritte con le stesse operazioni nello stesso ordine.
//! Il JS è la specifica: ogni funzione qui ha la sua gemella in JS (nome tra parentesi) e i test incrociati (test/unit/dual-calc.test.js)
//! le confrontano su tutto il corpus. Solo aritmetica IEEE (+ − × ÷ e radice quadrata, arrotondate correttamente in entrambi i
//! linguaggi), niente funzioni trascendenti: per questo i risultati sono identici bit per bit, non solo vicini.
//! Rust non fonde moltiplicazioni e somme (niente FMA implicite), come JavaScript.

/// `Math.round`: metà verso +∞ (in Rust `round` va lontano da zero)
pub fn js_round(x: f64) -> f64 {
    if !x.is_finite() {
        return x;
    }
    let f = x.floor();
    if x - f >= 0.5 {
        f + 1.0
    } else {
        f
    }
}
/// `Math.max(a, b)`: NaN se uno dei due è NaN, +0 sopra −0 (f64::max ignora i NaN)
pub fn js_max(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        return f64::NAN;
    }
    if a > b {
        a
    } else if b > a {
        b
    } else if a == 0.0 && a.is_sign_negative() {
        b
    } else {
        a
    }
}
/// `Math.min(a, b)`
pub fn js_min(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        return f64::NAN;
    }
    if a < b {
        a
    } else if b < a {
        b
    } else if a == 0.0 && a.is_sign_positive() {
        b
    } else {
        a
    }
}
/// `d || 1` per un numero: 0, −0 e NaN valgono 1
fn or1(d: f64) -> f64 {
    if d == 0.0 || d.is_nan() {
        1.0
    } else {
        d
    }
}

/// (numsOk) numeri tutti finiti, non enormi, non tutti minuscoli
pub fn nums_ok(a: &[f64]) -> bool {
    let mut mx: f64 = 0.0;
    for &v in a {
        if !v.is_finite() || v.abs() > 1e150 {
            return false;
        }
        if v.abs() > mx {
            mx = v.abs();
        }
    }
    a.is_empty() || mx == 0.0 || mx > 1e-150
}

pub const DERIV_EXACT_M: usize = 64;
pub const DERIV_BLOCK: usize = 128;

/// (sgSmooth) Savitzky–Golay quadratico. `None` = il JS restituisce il vettore stesso (qui: una copia, stessi numeri)
pub fn sg_smooth(ys: &[f64], win: usize) -> Vec<f64> {
    let n = ys.len();
    if win < 5 || n < win + 2 {
        return ys.to_vec();
    }
    let m = (win - 1) >> 1;
    let mf = m as f64;
    let den = (2.0 * mf + 3.0) * (2.0 * mf + 1.0) * (2.0 * mf - 1.0);
    if m > DERIV_EXACT_M && n > 4 * DERIV_BLOCK && nums_ok(ys) {
        return sg_fast(ys, n, m, den);
    }
    let mi = m as i64;
    let c: Vec<f64> = (-mi..=mi).map(|i| 3.0 * (3.0 * mf * mf + 3.0 * mf - 1.0 - 5.0 * (i as f64) * (i as f64)) / den).collect();
    let mut out = ys.to_vec();
    for i in m..n - m {
        let mut s = 0.0;
        for j in 0..=2 * m {
            s += c[j] * ys[i + j - m];
        }
        out[i] = s;
    }
    out
}
/// (sgFast) somme scorrevoli ancorate, ricalcolate ogni DERIV_BLOCK punti
fn sg_fast(ys: &[f64], n: usize, m: usize, den: f64) -> Vec<f64> {
    let mut out = ys.to_vec();
    let mf = m as f64;
    let a = 3.0 * (3.0 * mf * mf + 3.0 * mf - 1.0);
    let m1 = mf + 1.0;
    let mut i0 = m;
    while i0 < n - m {
        let i1 = (n - m).min(i0 + DERIV_BLOCK);
        let y0 = ys[i0];
        let (mut s0, mut s1, mut s2) = (0.0f64, 0.0f64, 0.0f64);
        for jj in 0..=2 * m {
            let j = jj as f64 - mf;
            let v = ys[i0 + jj - m] - y0;
            s0 += v;
            s1 += j * v;
            s2 += j * j * v;
        }
        for i in i0..i1 {
            if i > i0 {
                let vo = ys[i - 1 - m] - y0;
                let vi = ys[i + m] - y0;
                let s0n = s0 - vo + vi;
                let t1 = s1 + mf * vo + m1 * vi;
                s2 = s2 - mf * mf * vo + m1 * m1 * vi - 2.0 * t1 + s0n;
                s1 = t1 - s0n;
                s0 = s0n;
            }
            out[i] = y0 + (a * s0 - 15.0 * s2) / den;
        }
        i0 += DERIV_BLOCK;
    }
    out
}

/// (derivPoint)
fn deriv_point(xs: &[f64], ys: &[f64], n: usize, m: usize, i: usize) -> f64 {
    let a = i.saturating_sub(m);
    let b = (n - 1).min(i + m);
    let (mut sx, mut sy, mut c) = (0.0f64, 0.0f64, 0.0f64);
    for k in a..=b {
        sx += xs[k];
        sy += ys[k];
        c += 1.0;
    }
    let mx = sx / c;
    let my = sy / c;
    let (mut sxx, mut sxy) = (0.0f64, 0.0f64);
    for k in a..=b {
        let dx = xs[k] - mx;
        sxx += dx * dx;
        sxy += dx * (ys[k] - my);
    }
    if sxx > 0.0 {
        sxy / sxx
    } else {
        0.0
    }
}
/// (derivFast)
fn deriv_fast(xs: &[f64], ys: &[f64], n: usize, m: usize, out: &mut [f64]) {
    let mut i0 = 0;
    while i0 < n {
        let i1 = n.min(i0 + DERIV_BLOCK);
        let x0 = xs[i0];
        let y0 = ys[i0];
        let mut a = i0.saturating_sub(m);
        let mut b = (n - 1).min(i0 + m);
        let (mut c, mut sx, mut sy, mut sxx_, mut sxy_) = (0.0f64, 0.0f64, 0.0f64, 0.0f64, 0.0f64);
        for k in a..=b {
            let dx = xs[k] - x0;
            let dy = ys[k] - y0;
            sx += dx;
            sy += dy;
            sxx_ += dx * dx;
            sxy_ += dx * dy;
            c += 1.0;
        }
        for i in i0..i1 {
            if i > i0 {
                let na = i.saturating_sub(m);
                let nb = (n - 1).min(i + m);
                while b < nb {
                    b += 1;
                    let dx = xs[b] - x0;
                    let dy = ys[b] - y0;
                    sx += dx;
                    sy += dy;
                    sxx_ += dx * dx;
                    sxy_ += dx * dy;
                    c += 1.0;
                }
                while a < na {
                    let dx = xs[a] - x0;
                    let dy = ys[a] - y0;
                    sx -= dx;
                    sy -= dy;
                    sxx_ -= dx * dx;
                    sxy_ -= dx * dy;
                    c -= 1.0;
                    a += 1;
                }
            }
            let mx = sx / c;
            let my = sy / c;
            let sxx = sxx_ - c * mx * mx;
            let sxy = sxy_ - c * mx * my;
            out[i] = if sxx > 1e-9 * sxx_ && sxy.is_finite() { sxy / sxx } else { deriv_point(xs, ys, n, m, i) };
        }
        i0 += DERIV_BLOCK;
    }
}
/// (derivLS) xs e ys della stessa lunghezza
pub fn deriv_ls(xs: &[f64], ys: &[f64], m: usize) -> Vec<f64> {
    let n = ys.len();
    let mut out = vec![0.0; n];
    if m > DERIV_EXACT_M && n > 4 * DERIV_BLOCK && nums_ok(xs) && nums_ok(ys) {
        deriv_fast(xs, ys, n, m, &mut out);
        return out;
    }
    for (i, o) in out.iter_mut().enumerate() {
        *o = deriv_point(xs, ys, n, m, i);
    }
    out
}

/// (noiseSigma) MAD delle differenze seconde. Solo con numeri senza NaN (lo garantisce chi chiama)
pub fn noise_sigma(ys: &[f64]) -> f64 {
    let n = ys.len();
    if n < 4 {
        return 0.0;
    }
    let mut a: Vec<f64> = (1..n - 1).map(|i| (ys[i + 1] - 2.0 * ys[i] + ys[i - 1]).abs()).collect();
    let k = a.len() >> 1;
    // stesso elemento dell'ordinamento (in JS sort o selezione, secondo la lunghezza): senza NaN il confronto è totale
    let (_, v, _) = a.select_nth_unstable_by(k, |x, y| x.partial_cmp(y).unwrap_or(std::cmp::Ordering::Equal));
    *v / 0.6745 / 6f64.sqrt()
}
/// (sgNoiseGain)
pub fn sg_noise_gain(m: usize) -> f64 {
    let mf = m as f64;
    let den = (2.0 * mf + 3.0) * (2.0 * mf + 1.0) * (2.0 * mf - 1.0);
    let mut c2 = 0.0;
    let mi = m as i64;
    for i in -mi..=mi {
        let fi = i as f64;
        let c = 3.0 * (3.0 * mf * mf + 3.0 * mf - 1.0 - 5.0 * fi * fi) / den;
        c2 += c * c;
    }
    c2.sqrt()
}
/// (peakCandidatesMin)
fn cand_min(sm: &[f64], rev: bool) -> Vec<f64> {
    let n = sm.len();
    let mut out = vec![0.0; n];
    let mut st: Vec<usize> = Vec::with_capacity(64);
    let mut sv: Vec<f64> = Vec::with_capacity(64);
    for t in 0..n {
        let i = if rev { n - 1 - t } else { t };
        let v = sm[i];
        let mut run = v;
        while let Some(&top) = st.last() {
            if !(sm[top] <= v) {
                break;
            }
            let m = *sv.last().unwrap();
            if m < run {
                run = m;
            }
            st.pop();
            sv.pop();
        }
        out[i] = run;
        st.push(i);
        sv.push(run);
    }
    out
}
#[derive(Clone, Copy, Debug)]
pub struct Cand {
    pub i: usize,
    pub prom: f64,
}
/// (peakCandidates)
pub fn peak_candidates(sm: &[f64]) -> Vec<Cand> {
    let n = sm.len();
    let mut out = Vec::new();
    if n < 3 {
        return out;
    }
    let l = cand_min(sm, false);
    let r = cand_min(sm, true);
    for i in 1..n - 1 {
        if !(sm[i] > sm[i - 1] && sm[i] >= sm[i + 1]) {
            continue;
        }
        out.push(Cand { i, prom: sm[i] - js_max(l[i], r[i]) });
    }
    out
}
/// (halfWidthPts)
fn half_width_pts(sm: &[f64], c: &Cand) -> usize {
    let half = sm[c.i] - c.prom / 2.0;
    let (mut a, mut b) = (c.i, c.i);
    while a > 0 && sm[a] > half {
        a -= 1;
    }
    while b < sm.len() - 1 && sm[b] > half {
        b += 1;
    }
    b - a
}
/// ordinamento di JS con comparatore b.prom − a.prom (stabile; i numeri qui sono finiti)
fn sort_prom_desc(v: &mut [Cand]) {
    v.sort_by(|a, b| b.prom.partial_cmp(&a.prom).unwrap_or(std::cmp::Ordering::Equal));
}
/// larghezza adattiva di findPeaks e peakAreas: m dai picchi più evidenti della lisciatura a 5 punti
fn adaptive_m(sm1: &[f64], sig_raw: f64, n: usize) -> usize {
    let g2 = sg_noise_gain(2);
    let mut strong: Vec<Cand> = peak_candidates(sm1).into_iter().filter(|c| c.prom > 10.0 * sig_raw * g2).collect();
    sort_prom_desc(&mut strong);
    strong.truncate(8);
    let wch = if !strong.is_empty() { strong.iter().map(|c| half_width_pts(sm1, c)).min().unwrap() as f64 } else { js_round(n as f64 / 200.0) };
    js_max(2.0, js_min(js_round(0.6 * wch / 2.0), js_round(n as f64 / 40.0))) as usize
}
/// (nearestIdx)
pub fn nearest_idx(xs: &[f64], x: f64) -> usize {
    let (mut lo, mut hi) = (0usize, xs.len() - 1);
    while hi - lo > 1 {
        let m = (lo + hi) >> 1;
        if xs[m] <= x {
            lo = m;
        } else {
            hi = m;
        }
    }
    if (xs[lo] - x).abs() <= (xs[hi] - x).abs() {
        lo
    } else {
        hi
    }
}
/// (interpY)
pub fn interp_y(xs: &[f64], ys: &[f64], x: f64) -> f64 {
    let (mut lo, mut hi) = (0usize, xs.len() - 1);
    if x <= xs[0] {
        return ys[0];
    }
    if x >= xs[hi] {
        return ys[hi];
    }
    while hi - lo > 1 {
        let m = (lo + hi) >> 1;
        if xs[m] <= x {
            lo = m;
        } else {
            hi = m;
        }
    }
    let t = (x - xs[lo]) / or1(xs[hi] - xs[lo]);
    ys[lo] + t * (ys[hi] - ys[lo])
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Peak {
    pub x: f64,
    pub y: f64,
    pub prom: f64,
}
/// (findPeaks) dir = ±1 (qualsiasi numero: si moltiplica come in JS), max_n come `slice(0, maxN)` (NaN → 0, ∞ → tutti)
pub fn find_peaks(xs: &[f64], ys: &[f64], dir: f64, sens: f64, max_n: f64) -> Vec<Peak> {
    if !nums_ok(xs) || !nums_ok(ys) {
        return vec![];
    }
    let n = ys.len();
    if n < 9 || max_n <= 0.0 {
        return vec![];
    }
    let s0: Vec<f64> = ys.iter().map(|&v| v * dir).collect();
    let sig_raw = noise_sigma(&s0);
    let sm1 = sg_smooth(&s0, 5);
    let m = adaptive_m(&sm1, sig_raw, n);
    let sm = sg_smooth(&s0, 2 * m + 1);
    let sig = sig_raw * sg_noise_gain(m);
    let edge = m.max(3);
    let cand: Vec<Cand> = peak_candidates(&sm).into_iter().filter(|c| c.i >= edge && c.i + edge < n).collect();
    if cand.is_empty() {
        return vec![];
    }
    let mut max_prom = f64::NEG_INFINITY;
    for c in &cand {
        if c.prom > max_prom {
            max_prom = c.prom;
        }
    }
    let thr = js_max(8.0 * sig, (sens / 100.0) * max_prom);
    let mut sel: Vec<Cand> = cand.into_iter().filter(|c| c.prom >= thr).collect();
    sort_prom_desc(&mut sel);
    let keep = if max_n.is_nan() { 0 } else if max_n >= sel.len() as f64 { sel.len() } else { max_n as usize };
    sel.truncate(keep);
    let mut out: Vec<Peak> = sel
        .iter()
        .map(|c| {
            let i = c.i;
            let mut x = xs[i];
            let (a, b, d) = (sm[i - 1], sm[i], sm[i + 1]);
            let q = a - 2.0 * b + d;
            if q < 0.0 {
                let off = 0.5 * (a - d) / q;
                if off.abs() < 1.0 {
                    x = xs[i] + off * (xs[i + 1] - xs[i - 1]) / 2.0;
                }
            }
            Peak { x, y: interp_y(xs, ys, x), prom: c.prom }
        })
        .collect();
    out.sort_by(|a, b| a.x.partial_cmp(&b.x).unwrap_or(std::cmp::Ordering::Equal));
    out
}

#[derive(Clone, Debug, PartialEq)]
pub struct Area {
    pub ia: usize,
    pub ib: usize,
    pub xa: f64,
    pub xb: f64,
    pub area: f64,
    pub base0: f64,
    pub base1: f64,
    pub hull: Vec<(usize, f64)>,
}
/// (peakAreas) solo con numeri accettati da nums_ok (altrimenti chi chiama usa il JS): picchi verso l'alto, pks = posizioni x
pub fn peak_areas(xs: &[f64], ys: &[f64], pks: &[f64]) -> Vec<Area> {
    let n = ys.len();
    if n < 9 || pks.is_empty() {
        return vec![];
    }
    let sig_raw = noise_sigma(ys);
    let sm1 = sg_smooth(ys, 5);
    let m = adaptive_m(&sm1, sig_raw, n);
    let sm = sg_smooth(ys, 2 * m + 1);
    let sig = js_max(sig_raw * sg_noise_gain(m), 1e-15);
    let tol = 3.0 * sig;
    let mut order: Vec<(usize, usize)> = pks.iter().enumerate().map(|(k, &x)| (k, nearest_idx(xs, x))).collect();
    order.sort_by(|a, b| a.1.cmp(&b.1));
    let mut out: Vec<Option<Area>> = vec![None; pks.len()];
    let ni = n as i64;
    for (r, &(ok, oi)) in order.iter().enumerate() {
        let left_stop = if r > 0 { order[r - 1].1 } else { 0 } as i64;
        let right_stop = if r < order.len() - 1 { order[r + 1].1 } else { n - 1 } as i64;
        let oi = oi as i64;
        let mut i = oi;
        let span = ((2 * m) as i64).max(3);
        let mut k = (left_stop + 1).max(oi - span);
        while k <= (right_stop - 1).min(oi + span) {
            if sm[k as usize] > sm[i as usize] {
                i = k;
            }
            k += 1;
        }
        let smi = sm[i as usize];
        let mut lmin = smi;
        let mut j = i - 1;
        while j >= left_stop && sm[j as usize] <= smi + tol {
            if sm[j as usize] < lmin {
                lmin = sm[j as usize];
            }
            j -= 1;
        }
        let mut rmin = smi;
        j = i + 1;
        while j <= right_stop && sm[j as usize] <= smi + tol {
            if sm[j as usize] < rmin {
                rmin = sm[j as usize];
            }
            j += 1;
        }
        let prom = js_max(smi - js_max(lmin, rmin), sig);
        let half = smi - prom / 2.0;
        let (mut a, mut b) = (i, i);
        while a > left_stop && sm[a as usize] > half {
            a -= 1;
        }
        while b < right_stop && sm[b as usize] > half {
            b += 1;
        }
        let w = (b - a).max(2);
        let rise = js_max(3.0 * sig, 0.03 * prom);
        let walk = |step: i64, stop: i64, floor: f64| -> i64 {
            let lim = if step < 0 { stop.max(i - 6 * w).max(0) } else { stop.min(i + 6 * w).min(ni - 1) };
            let (mut jj, mut best, mut bv) = (i, i, smi);
            while if step < 0 { jj > lim } else { jj < lim } {
                jj += step;
                let v = sm[jj as usize];
                if v < bv {
                    bv = v;
                    best = jj;
                }
                if v > bv + rise {
                    break;
                }
                if v <= floor {
                    best = jj;
                    break;
                }
            }
            best
        };
        let l = oi.min(walk(-1, left_stop, lmin + js_max(0.01 * prom, sig)));
        let rr = oi.max(walk(1, right_stop, rmin + js_max(0.01 * prom, sig)));
        let hw = (m as f64).max(js_round(w as f64 / 3.0)) as i64;
        let avg = |lo: i64, hi: i64| -> f64 {
            let lo = lo.max(0);
            let hi = hi.min(ni - 1);
            let (mut t, mut c) = (0.0f64, 0.0f64);
            let mut k = lo;
            while k <= hi {
                t += ys[k as usize];
                c += 1.0;
                k += 1;
            }
            if c != 0.0 {
                t / c
            } else {
                0.0
            }
        };
        let (lu, ru) = (l as usize, rr as usize);
        let y0 = if l > left_stop { js_min(sm[lu] + tol, avg(left_stop.max(l - hw), l)) } else { sm[lu] };
        let y1 = if rr < right_stop { js_min(sm[ru] + tol, avg(rr, right_stop.min(rr + hw))) } else { sm[ru] };
        let val = |k: usize| -> f64 {
            if k == lu {
                y0
            } else if k == ru {
                y1
            } else {
                sm[k]
            }
        };
        let mut pen = false;
        let dxl = or1(xs[ru] - xs[lu]);
        for k in lu + 1..ru {
            let ln = y0 + (y1 - y0) * (xs[k] - xs[lu]) / dxl;
            if sm[k] < ln - tol {
                pen = true;
                break;
            }
        }
        let mut hull: Vec<usize> = Vec::new();
        if !pen {
            hull.push(lu);
            hull.push(ru);
        } else {
            for k in lu..=ru {
                while hull.len() >= 2 {
                    let p1 = hull[hull.len() - 2];
                    let p2 = hull[hull.len() - 1];
                    if (xs[p2] - xs[p1]) * (val(k) - val(p1)) - (val(p2) - val(p1)) * (xs[k] - xs[p1]) <= 0.0 {
                        hull.pop();
                    } else {
                        break;
                    }
                }
                hull.push(k);
            }
        }
        let mut base = vec![0.0f64; ru - lu + 1];
        for h in 0..hull.len().saturating_sub(1) {
            let (p1, p2) = (hull[h], hull[h + 1]);
            let (v1, v2) = (val(p1), val(p2));
            let d = or1(xs[p2] - xs[p1]);
            for k in p1..=p2 {
                base[k - lu] = v1 + (v2 - v1) * (xs[k] - xs[p1]) / d;
            }
        }
        let mut area = 0.0f64;
        for k in lu..ru {
            area += 0.5 * ((ys[k] - base[k - lu]) + (ys[k + 1] - base[k + 1 - lu])) * (xs[k + 1] - xs[k]);
        }
        out[ok] = Some(Area {
            ia: lu,
            ib: ru,
            xa: xs[lu],
            xb: xs[ru],
            area: js_max(0.0, area),
            base0: y0,
            base1: y1,
            hull: hull.iter().map(|&k| (k, val(k))).collect(),
        });
    }
    out.into_iter().map(|a| a.unwrap()).collect()
}


/* ---------- richiesta binaria (app/calc-core.js la scrive, `acch_calc` e acch-core-cli la leggono) ----------
   «ACQ1», u32 lunghezza del nome, nome (ASCII), u32 numero di scalari, u32 numero di vettori, u32 lunghezza di ogni vettore,
   zeri fino a un multiplo di 8 dall'inizio, gli scalari (f64 LE), i vettori (f64 LE) uno dopo l'altro. */
pub struct Req {
    pub name: String,
    pub nums: Vec<f64>,
    pub arrs: Vec<Vec<f64>>,
}
pub fn parse_req(b: &[u8]) -> Result<Req, String> {
    let u32at = |o: usize| -> Result<usize, String> { b.get(o..o + 4).map(|s| u32::from_le_bytes([s[0], s[1], s[2], s[3]]) as usize).ok_or_else(|| "req-short".to_string()) };
    if b.len() < 8 || &b[0..4] != b"ACQ1" {
        return Err("req-magic".into());
    }
    let nl = u32at(4)?;
    let name = std::str::from_utf8(b.get(8..8 + nl).ok_or("req-short")?).map_err(|_| "req-name")?.to_string();
    let mut o = 8 + nl;
    let nn = u32at(o)?;
    let na = u32at(o + 4)?;
    o += 8;
    if na > 64 || nn > 64 {
        return Err("req-size".into());
    }
    let mut lens = Vec::with_capacity(na);
    for k in 0..na {
        lens.push(u32at(o + 4 * k)?);
    }
    o += 4 * na;
    o += (8 - o % 8) % 8;
    let f = |o: usize, n: usize| -> Result<Vec<f64>, String> {
        let s = b.get(o..o + 8 * n).ok_or("req-short")?;
        Ok(s.chunks_exact(8).map(|c| f64::from_le_bytes([c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7]])).collect())
    };
    let nums = f(o, nn)?;
    o += 8 * nn;
    let mut arrs = Vec::with_capacity(na);
    for &l in &lens {
        arrs.push(f(o, l)?);
        o += 8 * l;
    }
    if o != b.len() {
        return Err("req-size".into());
    }
    Ok(Req { name, nums, arrs })
}
/// intero non negativo esatto (finestra, metà finestra): altrimenti il JS
fn as_index(v: f64) -> Option<usize> {
    if v.is_finite() && v >= 0.0 && v.fract() == 0.0 && v < 1e9 {
        Some(v as usize)
    } else {
        None
    }
}
/// Esegue la richiesta. Risposta nel formato wire: {"fn":…, …vettori…} oppure {"decline":"motivo"} se il caso non è coperto
/// (argomenti che il JS tratterebbe in modo particolare): allora calcola il JS, mai un risultato diverso.
pub fn run(req: &Req) -> crate::Wire {
    let mut w = crate::Wire::new();
    w.raw("{");
    let decline = |w: &mut crate::Wire, why: &str| {
        w.key("decline").str(why);
    };
    let (a, s) = (&req.arrs, &req.nums);
    match (req.name.as_str(), a.len(), s.len()) {
        ("sgSmooth", 1, 1) => match as_index(s[0]) {
            Some(win) => {
                w.key("fn").str("sgSmooth").key("r").arr(&sg_smooth(&a[0], win));
            }
            None => decline(&mut w, "args"),
        },
        ("derivLS", 2, 1) => match as_index(s[0]) {
            Some(m) if a[0].len() == a[1].len() => {
                w.key("fn").str("derivLS").key("r").arr(&deriv_ls(&a[0], &a[1], m));
            }
            _ => decline(&mut w, "args"),
        },
        ("noiseSigma", 1, 0) => {
            if a[0].iter().any(|v| !v.is_finite()) {
                decline(&mut w, "nan");
            } else {
                w.key("fn").str("noiseSigma").key("r").arr(&[noise_sigma(&a[0])]);
            }
        }
        ("findPeaks", 2, 3) => {
            if a[0].len() != a[1].len() || !(s[0] == 1.0 || s[0] == -1.0) {
                decline(&mut w, "args");
            } else {
                let p = find_peaks(&a[0], &a[1], s[0], s[1], s[2]);
                let col = |f: fn(&Peak) -> f64| p.iter().map(f).collect::<Vec<f64>>();
                w.key("fn").str("findPeaks").key("x").arr(&col(|p| p.x)).key("y").arr(&col(|p| p.y)).key("prom").arr(&col(|p| p.prom));
            }
        }
        ("peakAreas", 3, 0) => {
            if a[0].len() != a[1].len() || !nums_ok(&a[0]) || !nums_ok(&a[1]) || a[2].iter().any(|v| v.is_nan()) {
                decline(&mut w, "args");
            } else {
                let r = peak_areas(&a[0], &a[1], &a[2]);
                let col = |f: &dyn Fn(&Area) -> f64| r.iter().map(f).collect::<Vec<f64>>();
                let (mut hk, mut hv, mut hn) = (Vec::new(), Vec::new(), Vec::new());
                for x in &r {
                    hn.push(x.hull.len() as f64);
                    for &(k, v) in &x.hull {
                        hk.push(k as f64);
                        hv.push(v);
                    }
                }
                w.key("fn").str("peakAreas").key("ia").arr(&col(&|x| x.ia as f64)).key("ib").arr(&col(&|x| x.ib as f64));
                w.key("xa").arr(&col(&|x| x.xa)).key("xb").arr(&col(&|x| x.xb)).key("area").arr(&col(&|x| x.area));
                w.key("base0").arr(&col(&|x| x.base0)).key("base1").arr(&col(&|x| x.base1));
                w.key("hn").arr(&hn).key("hk").arr(&hk).key("hv").arr(&hv);
            }
        }
        _ => decline(&mut w, "fn"),
    }
    w.raw("}");
    w
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn js_rules() {
        assert_eq!(js_round(2.5), 3.0);
        assert_eq!(js_round(-2.5), -2.0);
        assert_eq!(js_round(0.49999999999999994), 0.0);
        assert!(js_max(f64::NAN, 1.0).is_nan());
        assert!(js_max(-0.0, 0.0).is_sign_positive());
        assert!(js_min(-0.0, 0.0).is_sign_negative());
    }
    #[test]
    fn peaks_on_gaussians() {
        let n = 2000;
        let xs: Vec<f64> = (0..n).map(|i| i as f64 * 0.5).collect();
        let ys: Vec<f64> = xs.iter().map(|&x| (-0.5 * ((x - 300.0) / 4.0f64).powi(2)).exp() + 0.5 * (-0.5 * ((x - 700.0) / 6.0f64).powi(2)).exp()).collect();
        let p = find_peaks(&xs, &ys, 1.0, 5.0, 10.0);
        assert_eq!(p.len(), 2);
        assert!((p[0].x - 300.0).abs() < 0.5 && (p[1].x - 700.0).abs() < 0.5);
        let a = peak_areas(&xs, &ys, &[p[0].x, p[1].x]);
        assert!((a[0].area - 4.0 * (2.0 * std::f64::consts::PI).sqrt()).abs() < 0.2, "{}", a[0].area);
    }
}
