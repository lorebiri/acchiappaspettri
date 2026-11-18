// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
//! Mappe nel desktop (tappa I10): i comandi che app/map-ui.js usa per i cubi in Rust (acch-core/src/cube.rs).
//! Il cubo resta qui (in memoria o, per i .wdf grandi, sul disco letto a pezzi): alla pagina vanno solo immagini e spettri scelti.
//! Tutti i comandi sono asincroni (fuori dal thread della finestra); avanzamento e annullamento come per la lettura dei file.
//! Il file affiancato `.acchcube` dei progetti si scrive e si rilegge solo accanto a un progetto concesso, con l'impronta SHA-256.
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

use acch_core::cube::{self, Cube};
use sha2::{Digest, Sha256};
use tauri::ipc::{Channel, InvokeBody, Request, Response};
use tauri::State;

use crate::{url_decode, Grants};

/// sopra questa dimensione un .wdf aperto da un percorso resta sul disco (letto a pezzi): la RAM non cresce con il cubo
const DISK_MIN: u64 = 256 << 20;

#[derive(Default)]
pub struct Cubes {
    next: AtomicU32,
    list: Mutex<HashMap<u32, Arc<Cube>>>,
    cancel: Mutex<HashMap<u32, Arc<AtomicBool>>>,
    watch: Mutex<HashMap<u32, Channel<serde_json::Value>>>,
}
impl Cubes {
    fn put(&self, c: Cube) -> u32 {
        let id = self.next.fetch_add(1, Ordering::SeqCst) + 1;
        self.list.lock().unwrap().insert(id, Arc::new(c));
        id
    }
    fn get(&self, id: u32) -> Result<Arc<Cube>, String> {
        self.list.lock().unwrap().get(&id).cloned().ok_or_else(|| "cube-unknown".to_string())
    }
    fn flag(&self, job: u32) -> Arc<AtomicBool> {
        self.cancel.lock().unwrap().entry(job).or_default().clone()
    }
    fn done(&self, job: u32) {
        self.cancel.lock().unwrap().remove(&job);
        self.watch.lock().unwrap().remove(&job);
    }
}
fn e2s(e: cube::MapErr) -> String {
    e.0
}
fn granted(g: &State<'_, Grants>, p: &Path) -> bool {
    g.paths.lock().unwrap().contains(p)
}
fn head_wire(id: u32, c: &Cube, extra: &mut dyn FnMut(&mut acch_core::Wire)) -> Result<Vec<u8>, String> {
    let mut w = acch_core::Wire::new_pub();
    w.raw_pub("{").key_pub("id").num_pub(id as usize).key_pub("disk").raw_pub(if matches!(c.store, cube::Store::File(_)) { "true" } else { "false" });
    cube::wire_head(&mut w, c, false).map_err(e2s)?;
    extra(&mut w);
    w.raw_pub("}");
    Ok(w.bytes())
}
fn f64_bytes(v: &[f64]) -> Vec<u8> {
    let mut out = Vec::with_capacity(v.len() * 8);
    for x in v {
        out.extend_from_slice(&x.to_le_bytes());
    }
    out
}

#[tauri::command]
pub fn acch_cube_watch(cs: State<'_, Cubes>, job: u32, on_event: Channel<serde_json::Value>) {
    cs.watch.lock().unwrap().insert(job, on_event);
}
#[tauri::command]
pub fn acch_cube_cancel(cs: State<'_, Cubes>, job: u32) {
    cs.flag(job).store(true, Ordering::SeqCst);
}

/// Apre una mappa. Intestazioni: x-acch-kind (wdf, envi, opus-series, text), x-acch-path (file concesso) oppure i byte nel corpo,
/// per ENVI x-acch-hdr (testo dell'intestazione, codificato URL), x-acch-job. Risposta wire: id, dimensioni, assi, metadati,
/// spettro medio (mean, n), byte e SHA-256 della sorgente.
#[tauri::command(async)]
pub fn acch_cube_open(g: State<'_, Grants>, cs: State<'_, Cubes>, request: Request<'_>) -> Result<Response, String> {
    let h = |k: &str| request.headers().get(k).and_then(|v| v.to_str().ok()).map(|s| s.to_string());
    let kind = h("x-acch-kind").unwrap_or_default();
    let job: u32 = h("x-acch-job").and_then(|s| s.parse().ok()).unwrap_or(0);
    let hdr = match h("x-acch-hdr") {
        Some(t) => Some(url_decode(&t)?),
        None => None,
    };
    let owned;
    let mut path: Option<PathBuf> = None;
    let mut flen: u64 = 0;
    if let Some(p) = h("x-acch-path") {
        let p = PathBuf::from(url_decode(&p)?);
        if !granted(&g, &p) {
            return Err("not-allowed".into());
        }
        flen = std::fs::metadata(&p).map_err(|e| format!("read-failed: {}", e.kind()))?.len();
        path = Some(p);
    }
    // il .wdf grande resta sul disco: si leggono solo intestazione e blocchi piccoli (la RAM non cresce con il cubo)
    let disk = kind == "wdf" && path.is_some() && flen >= DISK_MIN;
    let bytes: &[u8] = match (&path, disk) {
        (Some(_), true) => &[],
        (Some(p), false) => {
            owned = std::fs::read(p).map_err(|e| format!("read-failed: {}", e.kind()))?;
            &owned
        }
        (None, _) => match request.body() {
            InvokeBody::Raw(b) => b,
            _ => return Err("invalid-body".into()),
        },
    };
    let flag = cs.flag(job);
    // impronta della sorgente (provenienza nei metadati); per i .wdf letti dal disco non si calcola all'apertura (vuota)
    let sha = if disk { String::new() } else { hex(&Sha256::digest(bytes)) };
    let size = if disk { flen as usize } else { bytes.len() };
    let c = cube::read(&kind, bytes, hdr.as_deref(), if disk { path.as_deref() } else { None }).map_err(e2s)?;
    let Some(c) = c else { return Err("not-a-map".into()) };
    let watch = cs.watch.lock().unwrap().get(&job).cloned();
    let np = c.npix();
    let prog = |k: usize| {
        if let Some(ch) = watch.as_ref() {
            let _ = ch.send(serde_json::json!({ "done": k, "total": np }));
        }
    };
    prog(0);
    if flag.load(Ordering::Relaxed) {
        cs.done(job);
        return Err("cancelled".into());
    }
    let all = (0..np as i64).collect::<Vec<i64>>();
    let mean = cube::roi_mean(&c, None, &all).map_err(e2s);
    cs.done(job);
    let (mean, n) = mean?;
    let id = cs.put(c);
    let c = cs.get(id)?;
    head_wire(id, &c, &mut |w| {
        w.key_pub("mean").arr_pub(&mean).key_pub("n").num_pub(n).key_pub("bytes").num_pub(size).key_pub("sha256").str_pub(&sha);
    })
    .map(Response::new)
}
fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{:02x}", x)).collect()
}

#[derive(serde::Deserialize)]
pub struct OpIn {
    kind: String,
    #[serde(default)]
    a: f64,
    #[serde(default)]
    b: f64,
    #[serde(default)]
    a2: f64,
    #[serde(default)]
    b2: f64,
    #[serde(default)]
    at: f64,
    #[serde(default)]
    base: String,
}
/// Immagine di banda: nx·ny numeri f64 little-endian (riga per riga)
#[tauri::command(async)]
pub fn acch_cube_image(cs: State<'_, Cubes>, id: u32, op: OpIn, job: Option<u32>) -> Result<Response, String> {
    let c = cs.get(id)?;
    let job = job.unwrap_or(0);
    let flag = cs.flag(job);
    let watch = cs.watch.lock().unwrap().get(&job).cloned();
    let np = c.npix();
    let op = cube::Op { kind: op.kind, a: op.a, b: op.b, a2: op.a2, b2: op.b2, at: op.at, base: op.base };
    let r = cube::band_image(&c, &op, &|| flag.load(Ordering::Relaxed), &mut |k| {
        if let Some(ch) = watch.as_ref() {
            let _ = ch.send(serde_json::json!({ "done": k, "total": np }));
        }
    });
    cs.done(job);
    r.map(|img| Response::new(f64_bytes(&img))).map_err(e2s)
}
/// Spettro di un pixel (f64)
#[tauri::command(async)]
pub fn acch_cube_pixel(cs: State<'_, Cubes>, id: u32, ix: usize, iy: usize) -> Result<Response, String> {
    let c = cs.get(id)?;
    if ix >= c.nx || iy >= c.ny {
        return Err("pixel".into());
    }
    let mut s = vec![0.0; c.nc];
    c.pixel(iy * c.nx + ix, &mut s).map_err(e2s)?;
    Ok(Response::new(f64_bytes(&s)))
}
/// Spettro medio di un rettangolo (estremi compresi) o di un elenco di pixel: n (u32 LE, 8 byte) poi la media (f64)
#[tauri::command(async)]
pub fn acch_cube_roi(cs: State<'_, Cubes>, id: u32, rect: Option<[i64; 4]>, pixels: Option<Vec<i64>>) -> Result<Response, String> {
    let c = cs.get(id)?;
    let (m, n) = cube::roi_mean(&c, rect.map(|r| (r[0], r[1], r[2], r[3])), pixels.as_deref().unwrap_or(&[])).map_err(e2s)?;
    let mut out = (n as u64).to_le_bytes().to_vec();
    out.extend_from_slice(&f64_bytes(&m));
    Ok(Response::new(out))
}
/// Accorpamento f × f: un nuovo cubo (in memoria), risposta come acch_cube_open senza spettro medio
#[tauri::command(async)]
pub fn acch_cube_bin(cs: State<'_, Cubes>, id: u32, f: usize) -> Result<Response, String> {
    let c = cs.get(id)?;
    let b = cube::bin(&c, f, &|| false).map_err(e2s)?;
    let nid = cs.put(b);
    let b = cs.get(nid)?;
    head_wire(nid, &b, &mut |_| {}).map(Response::new)
}
/// Dati di n pixel dal pixel p0, nel tipo del cubo (f32 o f64 little-endian): per portare nella pagina i cubi piccoli
#[tauri::command(async)]
pub fn acch_cube_take(cs: State<'_, Cubes>, id: u32, p0: usize, n: usize) -> Result<Response, String> {
    let c = cs.get(id)?;
    let end = (p0 + n).min(c.npix());
    let f64t = c.is_f64();
    let mut out = Vec::with_capacity((end.saturating_sub(p0)) * c.nc * if f64t { 8 } else { 4 });
    let mut s = vec![0.0; c.nc];
    for p in p0..end {
        c.pixel(p, &mut s).map_err(e2s)?;
        for v in &s {
            if f64t {
                out.extend_from_slice(&v.to_le_bytes());
            } else {
                out.extend_from_slice(&(*v as f32).to_le_bytes());
            }
        }
    }
    Ok(Response::new(out))
}
/// Dimensione di un file concesso (le mappe grandi non passano dalla pagina: si decide prima di leggerle)
#[tauri::command]
pub fn acch_cube_stat(g: State<'_, Grants>, path: String) -> Result<u64, String> {
    let p = PathBuf::from(path);
    if !granted(&g, &p) {
        return Err("not-allowed".into());
    }
    std::fs::metadata(&p).map(|m| m.len()).map_err(|e| format!("read-failed: {}", e.kind()))
}
#[tauri::command]
pub fn acch_cube_close(cs: State<'_, Cubes>, id: u32) {
    cs.list.lock().unwrap().remove(&id);
}

/// nome del file affiancato: solo un nome (niente cartelle), estensione .acchcube
pub fn side_name_ok(n: &str) -> bool {
    !n.is_empty() && n.len() < 200 && n.ends_with(".acchcube") && !n.contains(['/', '\\', ':', '\0']) && !n.starts_with('.')
}
fn side_path(g: &State<'_, Grants>, project: &str, name: &str, write: bool) -> Result<PathBuf, String> {
    let p = PathBuf::from(project);
    // scrittura solo accanto a un progetto concesso (scelto nel dialogo); lettura anche accanto a un progetto aperto (come read_file)
    if !crate::is_project_path(&p) || (write && !granted(g, &p)) {
        return Err("not-allowed".into());
    }
    if !side_name_ok(name) {
        return Err("invalid-name".into());
    }
    Ok(p.parent().ok_or("invalid-path")?.join(name))
}
/// Scrive il cubo `id` nel file affiancato `name`, nella cartella del progetto `project` (percorso concesso). Risposta {bytes, sha256}.
#[tauri::command(async)]
pub fn acch_cube_side_write(g: State<'_, Grants>, cs: State<'_, Cubes>, id: u32, project: String, name: String, job: Option<u32>) -> Result<serde_json::Value, String> {
    let c = cs.get(id)?;
    let path = side_path(&g, &project, &name, true)?;
    let job = job.unwrap_or(0);
    let flag = cs.flag(job);
    let mut sh = Sha256::new();
    let n = cube::write_side(&c, &path, &mut |b| sh.update(b), &|| flag.load(Ordering::Relaxed)).map_err(e2s);
    cs.done(job);
    let n = n?;
    Ok(serde_json::json!({ "bytes": n, "sha256": hex(&sh.finalize()) }))
}
#[derive(serde::Deserialize)]
pub struct AxisIn {
    values: Vec<f64>,
    #[serde(default)]
    unit: String,
    #[serde(default)]
    quantity: String,
}
fn axis(a: AxisIn) -> cube::Axis {
    cube::Axis { values: a.values, unit: a.unit, quantity: a.quantity }
}
/// Riapre il file affiancato di un progetto: dimensione e impronta SHA-256 devono essere quelle salvate nel progetto.
/// Il cubo resta sul disco. Risposta come acch_cube_open (senza spettro medio: lo dà il progetto).
#[tauri::command(async)]
#[allow(clippy::too_many_arguments)]
pub fn acch_cube_side_open(g: State<'_, Grants>, cs: State<'_, Cubes>, project: String, name: String, bytes: u64, sha256: String, x: AxisIn, px: AxisIn, py: AxisIn, job: Option<u32>) -> Result<Response, String> {
    let path = side_path(&g, &project, &name, false)?;
    let len = std::fs::metadata(&path).map_err(|e| format!("side-missing: {}", e.kind()))?.len();
    if len != bytes {
        return Err("side-size".into());
    }
    let job = job.unwrap_or(0);
    let flag = cs.flag(job);
    let watch = cs.watch.lock().unwrap().get(&job).cloned();
    let got = sha_file(&path, &|| flag.load(Ordering::Relaxed), &mut |k| {
        if let Some(ch) = watch.as_ref() {
            let _ = ch.send(serde_json::json!({ "done": k, "total": len }));
        }
    });
    cs.done(job);
    if got? != sha256.to_ascii_lowercase() {
        return Err("side-integrity".into());
    }
    let c = cube::side_cube(&path, axis(x), axis(px), axis(py), "{\"format\":\"acchcube\"}".into()).map_err(e2s)?;
    let id = cs.put(c);
    let c = cs.get(id)?;
    head_wire(id, &c, &mut |_| {}).map(Response::new)
}
fn sha_file(p: &Path, cancel: &dyn Fn() -> bool, progress: &mut dyn FnMut(u64)) -> Result<String, String> {
    use std::io::Read;
    let mut f = std::fs::File::open(p).map_err(|e| format!("side-missing: {}", e.kind()))?;
    let mut sh = Sha256::new();
    let mut buf = vec![0u8; 8 << 20];
    let mut done = 0u64;
    loop {
        let n = f.read(&mut buf).map_err(|e| format!("read-failed: {}", e.kind()))?;
        if n == 0 {
            break;
        }
        sh.update(&buf[..n]);
        done += n as u64;
        progress(done);
        if cancel() {
            return Err("cancelled".into());
        }
    }
    Ok(hex(&sh.finalize()))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn side_names() {
        assert!(side_name_ok("progetto.1.acchcube"));
        for n in ["../x.acchcube", "a/b.acchcube", "x.bin", ".acchcube", "c:x.acchcube"] {
            assert!(!side_name_ok(n), "{n}");
        }
    }
}
