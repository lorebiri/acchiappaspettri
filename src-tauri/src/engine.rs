// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
//! Lettore veloce (tappa I5): i comandi che app/engine.js usa per acch-core.
//! `acch_read` risponde in binario (`ipc::Response`, formato wire di acch-core); avanzamento su `ipc::Channel` (`acch_watch`),
//! annullamento con `acch_cancel`. Il lettore di riferimento resta il JS: la pagina rilegge con il JS se qui qualcosa va storto.
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tauri::ipc::{Channel, InvokeBody, Request, Response};
use tauri::State;

use crate::{url_decode, Grants};

#[derive(Default)]
pub struct Jobs {
    cancel: Mutex<HashMap<u32, Arc<AtomicBool>>>,
    watch: Mutex<HashMap<u32, Channel<serde_json::Value>>>,
}
impl Jobs {
    fn flag(&self, job: u32) -> Arc<AtomicBool> {
        self.cancel.lock().unwrap().entry(job).or_default().clone()
    }
    fn done(&self, job: u32) {
        self.cancel.lock().unwrap().remove(&job);
        self.watch.lock().unwrap().remove(&job);
    }
}

/// Configurazione del motore: ACCH_RUST=0 spegne il lettore Rust, ACCH_DUAL=1 fa confrontare i due motori su ogni file.
pub fn config_from(rust: Option<String>, dual: Option<String>) -> serde_json::Value {
    let off = matches!(rust.as_deref(), Some("0") | Some("off") | Some("false"));
    serde_json::json!({ "rust": !off, "dual": dual.as_deref() == Some("1") })
}
#[tauri::command]
pub fn engine_config() -> serde_json::Value {
    config_from(std::env::var("ACCH_RUST").ok(), std::env::var("ACCH_DUAL").ok())
}

#[tauri::command]
pub fn acch_watch(jobs: State<'_, Jobs>, job: u32, on_event: Channel<serde_json::Value>) {
    jobs.watch.lock().unwrap().insert(job, on_event);
}
#[tauri::command]
pub fn acch_cancel(jobs: State<'_, Jobs>, job: u32) {
    jobs.flag(job).store(true, Ordering::SeqCst);
}

/// Legge un file: dal percorso (intestazione x-acch-path, solo se concesso, come read_file) o dai byte del corpo.
/// Nome nell'intestazione x-acch-name, progetto vecchio in x-acch-legacy; risposta nel formato wire.
#[tauri::command(async)]
pub fn acch_read(g: State<'_, Grants>, jobs: State<'_, Jobs>, request: Request<'_>) -> Result<Response, String> {
    let h = |k: &str| request.headers().get(k).and_then(|v| v.to_str().ok()).map(|s| s.to_string());
    let name = url_decode(&h("x-acch-name").unwrap_or_default())?;
    let job: u32 = h("x-acch-job").and_then(|s| s.parse().ok()).unwrap_or(0);
    let opt = acch_core::Opt { legacy: h("x-acch-legacy").as_deref() == Some("1") };
    let owned;
    let bytes: &[u8] = match h("x-acch-path") {
        Some(p) => {
            let path = PathBuf::from(url_decode(&p)?);
            if !g.paths.lock().unwrap().contains(&path) {
                return Err("not-allowed".into());
            }
            owned = std::fs::read(&path).map_err(|e| format!("read-failed: {}", e.kind()))?;
            &owned
        }
        None => match request.body() {
            InvokeBody::Raw(b) => b,
            _ => return Err("invalid-body".into()),
        },
    };
    let flag = jobs.flag(job);
    let watch = jobs.watch.lock().unwrap().get(&job).cloned();
    let total = bytes.len();
    let res = acch_core::read(bytes, &name, &opt, &|| flag.load(Ordering::Relaxed), &mut |done| {
        if let Some(c) = watch.as_ref() {
            let _ = c.send(serde_json::json!({ "done": done, "total": total }));
        }
    });
    jobs.done(job);
    res.map(|w| Response::new(w.bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn config_switches() {
        assert_eq!(config_from(None, None), serde_json::json!({"rust": true, "dual": false}));
        assert_eq!(config_from(Some("0".into()), Some("1".into())), serde_json::json!({"rust": false, "dual": true}));
    }
}
