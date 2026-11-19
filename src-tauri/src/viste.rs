// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
//! Finestre aggiuntive (tappa I6): «Stacca il grafico» e «Confronto» in sola lettura (vista.html).
//! La finestra principale è l'unica che possiede i dati e le impostazioni: calcola il disegno per ogni finestra e lo consegna qui
//! in binario (view_put); la finestra lo ritira (view_take) quando riceve l'evento «acch-vista». Le finestre aggiuntive non scrivono
//! né l'archivio né i file: hanno solo i permessi di vista.json.
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Emitter, Manager, State, Webview};

#[derive(Default)]
pub struct Viste {
    data: Mutex<HashMap<String, Vec<u8>>>,
}

/// Etichetta della finestra per un tipo di vista; nessun'altra finestra si può creare da qui.
pub fn label_of(kind: &str) -> Option<&'static str> {
    match kind {
        "grafico" => Some("vista-grafico"),
        "confronto" => Some("vista-confronto"),
        _ => None,
    }
}

/// Apre (o porta in primo piano) la finestra di una vista. Asincrono: su Windows creare una finestra in un comando sincrono la blocca.
#[tauri::command(async)]
pub fn view_open(app: AppHandle, caller: Webview, kind: String, title: String, w: Option<f64>, h: Option<f64>) -> Result<String, String> {
    if caller.label() != "main" {
        return Err("not-allowed".into());
    }
    let label = label_of(&kind).ok_or("invalid-kind")?;
    if let Some(win) = app.get_webview_window(label) {
        let _ = win.set_title(&title);
        let _ = win.unminimize();
        let _ = win.set_focus();
        return Ok(label.into());
    }
    let url = tauri::WebviewUrl::App(format!("vista.html?k={kind}").into());
    let win = tauri::WebviewWindowBuilder::new(&app, label, url)
        .title(title)
        .inner_size(w.unwrap_or(960.0).clamp(420.0, 4000.0), h.unwrap_or(640.0).clamp(300.0, 3000.0))
        .min_inner_size(420.0, 300.0)
        .build()
        .map_err(|e| format!("open-failed: {e}"))?;
    // il menu dell'applicazione agisce sulla finestra principale: nelle viste (Windows, Linux) si toglie, valgono i tasti della vista
    #[cfg(not(target_os = "macos"))]
    let _ = win.remove_menu();
    let _ = win.set_focus();
    Ok(label.into())
}

/// La finestra principale consegna il disegno per una vista (corpo binario, etichetta nell'intestazione x-acch-view).
#[tauri::command]
pub fn view_put(app: AppHandle, caller: Webview, st: State<'_, Viste>, request: Request<'_>) -> Result<(), String> {
    if caller.label() != "main" {
        return Err("not-allowed".into());
    }
    let label = request.headers().get("x-acch-view").and_then(|h| h.to_str().ok()).ok_or("invalid-view")?.to_string();
    if !label.starts_with("vista-") || app.get_webview_window(&label).is_none() {
        return Err("no-view".into());
    }
    let InvokeBody::Raw(bytes) = request.body() else { return Err("invalid-body".into()) };
    st.data.lock().unwrap().insert(label.clone(), bytes.clone());
    app.emit_to(label.as_str(), "acch-vista", ()).map_err(|e| e.to_string())
}

/// La vista ritira il suo disegno: solo il proprio, una volta.
#[tauri::command]
pub fn view_take(caller: Webview, st: State<'_, Viste>) -> Response {
    Response::new(st.data.lock().unwrap().remove(caller.label()).unwrap_or_default())
}

/// Alla chiusura della finestra principale si chiudono anche le viste (non hanno senso senza i dati).
pub fn close_all(app: &AppHandle) {
    for (label, w) in app.webview_windows() {
        if label.starts_with("vista-") {
            let _ = w.destroy();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_known_views() {
        assert_eq!(label_of("grafico"), Some("vista-grafico"));
        assert_eq!(label_of("confronto"), Some("vista-confronto"));
        assert_eq!(label_of("main"), None);
        assert_eq!(label_of("../x"), None);
    }
}
