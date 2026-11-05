//! Lato nativo di Acchiappaspettri: finestre di dialogo per i file, lettura e scrittura sicure dei file che l'utente ha scelto,
//! apertura dei progetti dal sistema operativo. Tutta la scienza resta nella pagina web, identica a quella online.
//! La pagina può leggere o scrivere solo i percorsi scelti dall'utente in una finestra di dialogo (o passati dal sistema operativo),
//! più i progetti `.acchspettri` dell'elenco «recenti»: nessun accesso libero al disco.
use std::collections::HashSet;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::{DialogExt, FilePath};

#[derive(Default)]
struct Grants {
    paths: Mutex<HashSet<PathBuf>>,
    pending: Mutex<Vec<PathBuf>>,
}

#[derive(serde::Serialize)]
struct Picked {
    path: String,
    name: String,
}

fn is_project(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("acchspettri"))
        .unwrap_or(false)
}
fn is_legacy_project(p: &Path) -> bool {
    p.file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.to_ascii_lowercase().ends_with(".acchiappa.json"))
        .unwrap_or(false)
}
fn file_name(p: &Path) -> String {
    p.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file")
        .to_string()
}
fn fp(f: FilePath) -> Result<PathBuf, String> {
    f.into_path().map_err(|_| "invalid-path".to_string())
}
fn grant(g: &State<Grants>, p: &Path) {
    g.paths.lock().unwrap().insert(p.to_path_buf());
}

/// Scrittura atomica: file temporaneo nella stessa cartella, svuotato su disco, poi rinominato.
/// Se qualcosa va storto il file precedente resta intatto; la versione precedente del progetto si conserva come `.bak`.
fn write_atomic(path: &Path, bytes: &[u8], keep_backup: bool) -> Result<(), String> {
    let dir = path.parent().ok_or("invalid-path")?;
    let tmp = dir.join(format!(".{}.tmp{}", file_name(path), std::process::id()));
    let res = (|| -> std::io::Result<()> {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
        drop(f);
        if keep_backup && path.exists() {
            let mut bak = path.as_os_str().to_owned();
            bak.push(".bak");
            fs::copy(path, PathBuf::from(bak))?;
        }
        fs::rename(&tmp, path)
    })();
    if res.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    res.map_err(|e| format!("write-failed: {}", e.kind()))
}

#[tauri::command(async)]
fn pick_open(
    app: AppHandle,
    g: State<'_, Grants>,
    title: String,
    filter_name: String,
    extensions: Vec<String>,
) -> Result<Option<Picked>, String> {
    let ext: Vec<&str> = extensions.iter().map(|s| s.as_str()).collect();
    let mut d = app.dialog().file().set_title(title);
    if !ext.is_empty() {
        d = d.add_filter(filter_name, &ext);
    }
    match d.blocking_pick_file() {
        None => Ok(None),
        Some(f) => {
            let p = fp(f)?;
            grant(&g, &p);
            Ok(Some(Picked { name: file_name(&p), path: p.to_string_lossy().into_owned() }))
        }
    }
}

#[tauri::command(async)]
fn pick_many(app: AppHandle, g: State<'_, Grants>, title: String) -> Result<Vec<Picked>, String> {
    let mut out = Vec::new();
    if let Some(list) = app.dialog().file().set_title(title).blocking_pick_files() {
        for f in list {
            let p = fp(f)?;
            grant(&g, &p);
            out.push(Picked { name: file_name(&p), path: p.to_string_lossy().into_owned() });
        }
    }
    Ok(out)
}

#[tauri::command(async)]
fn pick_save(
    app: AppHandle,
    g: State<'_, Grants>,
    title: String,
    suggested: String,
    filter_name: Option<String>,
    extensions: Option<Vec<String>>,
) -> Result<Option<Picked>, String> {
    let mut d = app.dialog().file().set_title(title).set_file_name(suggested);
    if let (Some(n), Some(e)) = (filter_name, extensions.as_ref()) {
        let ext: Vec<&str> = e.iter().map(|s| s.as_str()).collect();
        d = d.add_filter(n, &ext);
    }
    match d.blocking_save_file() {
        None => Ok(None),
        Some(f) => {
            let mut p = fp(f)?;
            // alcuni sistemi non aggiungono l'estensione scelta
            if let (Some(e), None) = (extensions.as_ref().and_then(|e| e.first()), p.extension()) {
                p.set_extension(e);
            }
            grant(&g, &p);
            Ok(Some(Picked { name: file_name(&p), path: p.to_string_lossy().into_owned() }))
        }
    }
}

/// Legge un file scelto dall'utente oppure un progetto (per l'elenco dei recenti).
#[tauri::command(async)]
fn read_file(g: State<'_, Grants>, path: String) -> Result<Response, String> {
    let p = PathBuf::from(&path);
    let allowed = g.paths.lock().unwrap().contains(&p) || is_project(&p) || is_legacy_project(&p);
    if !allowed {
        return Err("not-allowed".into());
    }
    if is_project(&p) {
        grant(&g, &p);
    }
    let bytes = fs::read(&p).map_err(|e| format!("read-failed: {}", e.kind()))?;
    Ok(Response::new(bytes))
}

/// Scrive in un percorso già concesso. Corpo binario; percorso nell'intestazione (codificato URL).
#[tauri::command(async)]
fn write_file(g: State<'_, Grants>, request: Request<'_>) -> Result<(), String> {
    let enc = request
        .headers()
        .get("x-acch-path")
        .and_then(|h| h.to_str().ok())
        .ok_or("invalid-path")?;
    let path = PathBuf::from(url_decode(enc)?);
    if !g.paths.lock().unwrap().contains(&path) {
        return Err("not-allowed".into());
    }
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("invalid-body".into());
    };
    write_atomic(&path, bytes, is_project(&path))
}

fn url_decode(s: &str) -> Result<String, String> {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' {
            let h = s.get(i + 1..i + 3).ok_or("invalid-path")?;
            out.push(u8::from_str_radix(h, 16).map_err(|_| "invalid-path")?);
            i += 3;
        } else {
            out.push(b[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(|_| "invalid-path".to_string())
}

/// I file passati dal sistema operativo (doppio clic su un progetto) in attesa che la pagina sia pronta.
#[tauri::command]
fn take_pending_open(g: State<'_, Grants>) -> Vec<Picked> {
    let list: Vec<PathBuf> = g.pending.lock().unwrap().drain(..).collect();
    list.iter()
        .map(|p| {
            grant(&g, p);
            Picked { name: file_name(p), path: p.to_string_lossy().into_owned() }
        })
        .collect()
}

/// Come è stata installata l'app: serve a dire la verità sugli aggiornamenti (i pacchetti .deb si aggiornano a mano).
#[tauri::command]
fn install_info() -> serde_json::Value {
    let (os, kind) = if cfg!(target_os = "windows") {
        ("windows", "nsis")
    } else if cfg!(target_os = "macos") {
        ("macos", "app")
    } else if std::env::var_os("APPIMAGE").is_some() {
        ("linux", "appimage")
    } else {
        ("linux", "system-package")
    };
    serde_json::json!({ "os": os, "kind": kind, "arch": std::env::consts::ARCH, "e2e": cfg!(feature = "e2e") })
}

/// Lingua scelta nell'installer di Windows (il file lo scrive l'installer NSIS), se presente.
#[tauri::command]
fn installer_language() -> Option<String> {
    let exe = std::env::current_exe().ok()?;
    let txt = fs::read_to_string(exe.parent()?.join("installer-language.txt")).ok()?;
    match txt.trim() {
        "1040" => Some("it".into()),
        "1033" => Some("en".into()),
        _ => None,
    }
}

fn accept_args(args: impl IntoIterator<Item = String>) -> Vec<PathBuf> {
    args.into_iter()
        .skip(1)
        .map(PathBuf::from)
        .filter(|p| (is_project(p) || is_legacy_project(p)) && p.is_file())
        .collect()
}

fn queue_open(app: &AppHandle, list: Vec<PathBuf>) {
    if list.is_empty() {
        return;
    }
    let g = app.state::<Grants>();
    g.pending.lock().unwrap().extend(list);
    let _ = app.emit("acch-open-files", ());
}

#[cfg(feature = "e2e")]
mod e2e {
    /// Collaudo automatico: la pagina scrive il rapporto e l'app si chiude con il codice d'uscita. Non esiste negli installer pubblicati.
    #[tauri::command]
    pub fn e2e_config() -> serde_json::Value {
        serde_json::json!({
            "dir": std::env::var("ACCH_E2E_DIR").unwrap_or_default(),
            "updateUrl": std::env::var("ACCH_E2E_UPDATE_URL").unwrap_or_default(),
            "scenario": std::env::var("ACCH_E2E_SCENARIO").unwrap_or_default(),
        })
    }
    #[tauri::command]
    pub fn e2e_grant(g: tauri::State<'_, super::Grants>, path: String) {
        g.paths.lock().unwrap().insert(path.into());
    }
    #[tauri::command]
    pub fn e2e_finish(app: tauri::AppHandle, report: String, ok: bool) {
        let dir = std::env::var("ACCH_E2E_DIR").unwrap_or_else(|_| ".".into());
        let _ = std::fs::write(std::path::Path::new(&dir).join("e2e-report.json"), report);
        app.exit(if ok { 0 } else { 1 });
    }
    #[tauri::command]
    pub async fn e2e_check_update(app: tauri::AppHandle, url: String, install: bool) -> Result<serde_json::Value, String> {
        use tauri_plugin_updater::UpdaterExt;
        let u: tauri::Url = url.parse().map_err(|e| format!("{e:?}"))?;
        let updater = app
            .updater_builder()
            .endpoints(vec![u])
            .map_err(|e| e.to_string())?
            .build()
            .map_err(|e| e.to_string())?;
        match updater.check().await.map_err(|e| e.to_string())? {
            None => Ok(serde_json::json!({ "available": false })),
            Some(up) => {
                let version = up.version.clone();
                let bytes = up.download(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
                if install {
                    up.install(bytes).map_err(|e| e.to_string())?;
                }
                Ok(serde_json::json!({ "available": true, "version": version, "verified": true, "installed": install }))
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            queue_open(app, accept_args(args));
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Grants::default())
        .setup(|app| {
            queue_open(app.handle(), accept_args(std::env::args()));
            Ok(())
        });
    #[cfg(not(feature = "e2e"))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        pick_open, pick_many, pick_save, read_file, write_file, take_pending_open, install_info, installer_language
    ]);
    #[cfg(feature = "e2e")]
    let builder = builder.invoke_handler(tauri::generate_handler![
        pick_open, pick_many, pick_save, read_file, write_file, take_pending_open, install_info, installer_language,
        e2e::e2e_config, e2e::e2e_grant, e2e::e2e_finish, e2e::e2e_check_update
    ]);
    builder
        .build(tauri::generate_context!())
        .expect("error while building the application")
        .run(|_app, _event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = _event {
                let list = urls
                    .into_iter()
                    .filter_map(|u| u.to_file_path().ok())
                    .filter(|p| is_project(p) || is_legacy_project(p))
                    .collect();
                queue_open(_app, list);
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn atomic_write_keeps_backup_and_leaves_no_temp() {
        let dir = std::env::temp_dir().join(format!("acch-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let p = dir.join("a.acchspettri");
        write_atomic(&p, b"one", true).unwrap();
        write_atomic(&p, b"two", true).unwrap();
        assert_eq!(fs::read(&p).unwrap(), b"two");
        assert_eq!(fs::read(dir.join("a.acchspettri.bak")).unwrap(), b"one");
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 2);
        fs::remove_dir_all(&dir).unwrap();
    }
    #[test]
    fn only_projects_are_accepted_from_the_command_line() {
        assert!(is_project(Path::new("/x/y.ACCHSPETTRI")));
        assert!(is_legacy_project(Path::new("y.acchiappa.json")));
        assert!(!is_project(Path::new("/etc/passwd")));
        assert!(!is_legacy_project(Path::new("/x/y.json")));
    }
    #[test]
    fn url_decoding() {
        assert_eq!(url_decode("/a%20b/%C3%A8.txt").unwrap(), "/a b/è.txt");
        assert!(url_decode("%zz").is_err());
    }
}
