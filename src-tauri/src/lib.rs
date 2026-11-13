// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
//! Lato nativo di Acchiappaspettri: finestre di dialogo per i file, lettura e scrittura sicure dei file che l'utente ha scelto,
//! apertura dal sistema operativo dei progetti e dei file grezzi leggibili. Tutta la scienza resta nella pagina web, identica a quella online.
//! La pagina può leggere o scrivere solo i percorsi scelti dall'utente in una finestra di dialogo (o passati dal sistema operativo),
//! più i progetti `.acchspettri` dell'elenco «recenti»: nessun accesso libero al disco.
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::{DialogExt, FilePath};

mod segnala;
mod libs;
mod store;

/// Archivio dell'app su file (store.rs): cartella e serratura, così due lotti non si scrivono mai insieme.
#[derive(Default)]
struct Store {
    dir: Mutex<Option<PathBuf>>,
}

/// Cartella delle librerie dell'utente (libs.rs): `app_data_dir()/librerie`.
#[derive(Default)]
struct LibDirState {
    dir: Mutex<Option<PathBuf>>,
}

#[derive(Default)]
struct Grants {
    paths: Mutex<HashSet<PathBuf>>,
    pending: Mutex<Vec<PathBuf>>,
    /// Cartelle scelte nel dialogo «Esporta»: dentro si possono scrivere file (anche in sottocartelle), mai fuori.
    dirs: Mutex<HashSet<PathBuf>>,
}

#[derive(serde::Serialize)]
struct Picked {
    path: String,
    name: String,
}

/// File di una cartella scelta o trascinata: `rel` è il percorso dentro la cartella, come `webkitRelativePath` nella pagina online.
#[derive(serde::Serialize, Clone, Debug, PartialEq)]
struct PickedRel {
    path: String,
    name: String,
    rel: String,
}

/// Ultima cartella usata nei dialoghi, separata per tipo (spettri, progetti, esportazioni…), salvata in `dialog-dirs.json`.
#[derive(Default)]
struct Dirs {
    map: Mutex<HashMap<String, PathBuf>>,
    file: Mutex<Option<PathBuf>>,
}
const KINDS: [&str; 5] = ["spectra", "project", "export", "images", "settings"];
fn kind_of(k: Option<&str>) -> &'static str {
    KINDS.iter().find(|x| Some(**x) == k).copied().unwrap_or("other")
}
/// Cartella iniziale: l'ultima usata per quel tipo, se esiste ancora; altrimenti Documenti.
fn start_dir(map: &HashMap<String, PathBuf>, kind: &str, docs: Option<PathBuf>) -> Option<PathBuf> {
    map.get(kind).filter(|p| p.is_dir()).cloned().or(docs)
}
fn parse_dirs(txt: &str) -> HashMap<String, PathBuf> {
    serde_json::from_str::<HashMap<String, String>>(txt)
        .map(|m| m.into_iter().map(|(k, v)| (k, PathBuf::from(v))).collect())
        .unwrap_or_default()
}
fn dialog_dir(app: &AppHandle, kind: &str) -> Option<PathBuf> {
    let d = app.state::<Dirs>();
    let m = d.map.lock().unwrap();
    start_dir(&m, kind, app.path().document_dir().ok())
}
fn remember_dir(app: &AppHandle, kind: &str, dir: Option<&Path>) {
    let Some(dir) = dir else { return };
    let d = app.state::<Dirs>();
    let mut m = d.map.lock().unwrap();
    m.insert(kind.to_string(), dir.to_path_buf());
    let file = d.file.lock().unwrap().clone();
    if let Some(f) = file.as_ref() {
        let out: HashMap<&String, String> = m.iter().map(|(k, v)| (k, v.to_string_lossy().into_owned())).collect();
        if let (Ok(j), Some(parent)) = (serde_json::to_vec_pretty(&out), f.parent()) {
            let _ = fs::create_dir_all(parent);
            let _ = write_atomic(f, &j, false);
        }
    }
}

/// Elenco dei file sotto una cartella (ordinati, senza seguire i collegamenti simbolici), con un tetto per non bloccare l'app.
const MAX_FILES: usize = 20000;
const MAX_DEPTH: usize = 16;
fn list_tree(dir: &Path, base: &str, out: &mut Vec<(PathBuf, String)>, depth: usize) {
    if depth > MAX_DEPTH || out.len() >= MAX_FILES {
        return;
    }
    let Ok(rd) = fs::read_dir(dir) else { return };
    let mut ents: Vec<_> = rd.filter_map(|e| e.ok()).collect();
    ents.sort_by_key(|e| e.file_name());
    for e in ents {
        if out.len() >= MAX_FILES {
            return;
        }
        let Ok(ft) = e.file_type() else { continue };
        let rel = format!("{}{}", base, e.file_name().to_string_lossy());
        if ft.is_dir() {
            list_tree(&e.path(), &format!("{rel}/"), out, depth + 1);
        } else if ft.is_file() {
            out.push((e.path(), rel));
        }
    }
}
/// File e cartelle scelti o trascinati → file con il percorso relativo («cartella/sotto/file.csv»).
fn expand(paths: &[PathBuf]) -> Vec<(PathBuf, String)> {
    let mut out = Vec::new();
    for p in paths {
        if p.is_dir() {
            list_tree(p, &format!("{}/", file_name(p)), &mut out, 0);
        } else if p.is_file() {
            out.push((p.clone(), file_name(p)));
        }
    }
    out
}
fn grant_all(g: &State<Grants>, list: &[(PathBuf, String)]) -> Vec<PickedRel> {
    list.iter()
        .map(|(p, rel)| {
            grant(g, p);
            PickedRel { path: p.to_string_lossy().into_owned(), name: file_name(p), rel: rel.clone() }
        })
        .collect()
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
/// Spettri e cromatogrammi che la pagina sa leggere (lo stesso elenco di ACCEPT in index.html, più le estensioni numeriche):
/// si accettano anche dal sistema operativo, con il doppio clic o «Apri con».
const RAW_EXT: [&str; 22] = [
    "txt", "asc", "csv", "dat", "dpt", "prn", "xy", "tsv", "arw", "mca", "spt", "spe", "sp", "exp", "jdx", "dx", "jcamp", "spa", "aif", "xlsx", "ch", "uv",
];
fn is_raw(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| {
            let e = e.to_ascii_lowercase();
            RAW_EXT.contains(&e.as_str()) || (!e.is_empty() && e.len() <= 3 && e.bytes().all(|b| b.is_ascii_digit()))
        })
        .unwrap_or(false)
}
/// Librerie dei picchi (tappa I4): `.acchlib` (programma predefinito) e, con «Apri con», i `.json` (`.acchlib.json` compresi):
/// la pagina controlla il contenuto prima di importarlo.
fn is_library(p: &Path) -> bool {
    p.file_name().and_then(|n| n.to_str()).map(|n| { let n = n.to_ascii_lowercase(); n.ends_with(".acchlib") || (n.ends_with(".json") && !n.ends_with(".acchiappa.json")) }).unwrap_or(false)
}
/// Ciò che il sistema operativo può far aprire all'app: progetti, file grezzi leggibili e librerie, solo se sono file veri.
fn is_openable(p: &Path) -> bool {
    (is_project(p) || is_legacy_project(p) || is_raw(p) || is_library(p)) && p.is_file()
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
    kind: Option<String>,
) -> Result<Option<Picked>, String> {
    let kind = kind_of(kind.as_deref());
    let ext: Vec<&str> = extensions.iter().map(|s| s.as_str()).collect();
    let mut d = app.dialog().file().set_title(title);
    if let Some(dir) = dialog_dir(&app, kind) {
        d = d.set_directory(dir);
    }
    if !ext.is_empty() {
        d = d.add_filter(filter_name, &ext);
    }
    match d.blocking_pick_file() {
        None => Ok(None),
        Some(f) => {
            let p = fp(f)?;
            grant(&g, &p);
            remember_dir(&app, kind, p.parent());
            Ok(Some(Picked { name: file_name(&p), path: p.to_string_lossy().into_owned() }))
        }
    }
}

#[tauri::command(async)]
fn pick_many(
    app: AppHandle,
    g: State<'_, Grants>,
    title: String,
    filter_name: Option<String>,
    extensions: Option<Vec<String>>,
    kind: Option<String>,
) -> Result<Vec<Picked>, String> {
    let kind = kind_of(kind.as_deref());
    let mut d = app.dialog().file().set_title(title);
    if let Some(dir) = dialog_dir(&app, kind) {
        d = d.set_directory(dir);
    }
    if let (Some(n), Some(e)) = (filter_name, extensions.as_ref()) {
        let ext: Vec<&str> = e.iter().map(|s| s.as_str()).collect();
        if !ext.is_empty() {
            d = d.add_filter(n, &ext);
        }
    }
    let mut out = Vec::new();
    if let Some(list) = d.blocking_pick_files() {
        for f in list {
            let p = fp(f)?;
            grant(&g, &p);
            out.push(Picked { name: file_name(&p), path: p.to_string_lossy().into_owned() });
        }
        if let Some(first) = out.first() {
            remember_dir(&app, kind, PathBuf::from(&first.path).parent());
        }
    }
    Ok(out)
}

/// Cartella intera, come «Scegli cartella» della pagina online: tutti i file, con il percorso relativo.
#[tauri::command(async)]
fn pick_folder(app: AppHandle, g: State<'_, Grants>, title: String, kind: Option<String>) -> Result<Vec<PickedRel>, String> {
    let kind = kind_of(kind.as_deref());
    let mut d = app.dialog().file().set_title(title);
    if let Some(dir) = dialog_dir(&app, kind) {
        d = d.set_directory(dir);
    }
    let Some(f) = d.blocking_pick_folder() else { return Ok(Vec::new()) };
    let dir = fp(f)?;
    remember_dir(&app, kind, Some(&dir));
    Ok(grant_all(&g, &expand(&[dir])))
}

#[tauri::command(async)]
fn pick_save(
    app: AppHandle,
    g: State<'_, Grants>,
    title: String,
    suggested: String,
    filter_name: Option<String>,
    extensions: Option<Vec<String>>,
    kind: Option<String>,
) -> Result<Option<Picked>, String> {
    let kind = kind_of(kind.as_deref());
    let mut d = app.dialog().file().set_title(title).set_file_name(suggested);
    if let Some(dir) = dialog_dir(&app, kind) {
        d = d.set_directory(dir);
    }
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
            remember_dir(&app, kind, p.parent());
            Ok(Some(Picked { name: file_name(&p), path: p.to_string_lossy().into_owned() }))
        }
    }
}

/// Cartella di destinazione delle esportazioni: dialogo nativo, aperto nell'ultima cartella usata per le esportazioni.
#[tauri::command(async)]
fn pick_export_dir(app: AppHandle, g: State<'_, Grants>, title: String, kind: Option<String>) -> Result<Option<Picked>, String> {
    let kind = kind_of(kind.as_deref().or(Some("export")));
    let mut d = app.dialog().file().set_title(title);
    if let Some(dir) = dialog_dir(&app, kind) {
        d = d.set_directory(dir);
    }
    let Some(f) = d.blocking_pick_folder() else { return Ok(None) };
    let dir = fp(f)?;
    remember_dir(&app, kind, Some(&dir));
    g.dirs.lock().unwrap().insert(dir.clone());
    Ok(Some(Picked { name: file_name(&dir), path: dir.to_string_lossy().into_owned() }))
}

fn granted_dir(g: &State<Grants>, dir: &str) -> Result<PathBuf, String> {
    let d = PathBuf::from(dir);
    if g.dirs.lock().unwrap().contains(&d) {
        Ok(d)
    } else {
        Err("not-allowed".into())
    }
}

/// Percorso relativo scritto dalla pagina («analisi/qc.csv») → percorso dentro la cartella concessa.
/// Rifiuta percorsi assoluti, «..», «.», parti vuote, separatori di Windows, unità («C:») e caratteri di controllo.
fn join_rel(dir: &Path, rel: &str) -> Result<PathBuf, String> {
    if rel.is_empty() || rel.len() > 1024 {
        return Err("unsafe-path".into());
    }
    let mut p = dir.to_path_buf();
    for part in rel.split('/') {
        let bad = part.is_empty()
            || part == "."
            || part == ".."
            || part.chars().any(|c| c == '\\' || c == ':' || c.is_control())
            || part.len() > 255
            || part.ends_with('.')
            || part.ends_with(' ')
            || reserved(part)
            || part.chars().any(|c| "<>\"|?*".contains(c));
        if bad {
            return Err("unsafe-path".into());
        }
        p.push(part);
    }
    Ok(p)
}

/// Nomi che Windows riserva ai dispositivi, anche con un'estensione («NUL.txt»).
fn reserved(part: &str) -> bool {
    let stem = part.split('.').next().unwrap_or("").trim_end().to_ascii_uppercase();
    matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ((stem.starts_with("COM") || stem.starts_with("LPT")) && stem.len() == 4 && matches!(stem.as_bytes()[3], b'1'..=b'9'))
}

/// Quali dei file da esportare esistono già nella cartella: la pagina chiede se sostituirli, rinominarli o saltarli.
fn existing(dir: &Path, rels: &[String]) -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    for r in rels {
        if fs::symlink_metadata(join_rel(dir, r)?).is_ok() {
            out.push(r.clone());
        }
    }
    Ok(out)
}
#[tauri::command(async)]
fn export_existing(g: State<'_, Grants>, dir: String, rels: Vec<String>) -> Result<Vec<String>, String> {
    existing(&granted_dir(&g, &dir)?, &rels)
}

/// Scrive un file dentro una cartella concessa, creando le sottocartelle; la destinazione non può uscire dalla cartella
/// (nemmeno attraverso un collegamento simbolico). Scrittura atomica: un file precedente resta intatto se qualcosa va storto.
fn write_into(dir: &Path, rel: &str, bytes: &[u8]) -> Result<(), String> {
    let path = join_rel(dir, rel)?;
    let parent = path.parent().ok_or("invalid-path")?;
    fs::create_dir_all(parent).map_err(|e| format!("write-failed: {}", e.kind()))?;
    let (root, real) = (
        fs::canonicalize(dir).map_err(|e| format!("write-failed: {}", e.kind()))?,
        fs::canonicalize(parent).map_err(|e| format!("write-failed: {}", e.kind()))?,
    );
    if !real.starts_with(&root) {
        return Err("not-allowed".into());
    }
    if fs::symlink_metadata(&path).map(|m| m.is_dir()).unwrap_or(false) {
        return Err("write-failed: IsADirectory".into());
    }
    write_atomic(&path, bytes, false)
}
/// Esportazione: un file per chiamata (corpo binario), cartella e percorso relativo nelle intestazioni (codificati URL).
#[tauri::command(async)]
fn write_in_dir(g: State<'_, Grants>, request: Request<'_>) -> Result<(), String> {
    let head = |k: &str| -> Result<String, String> { url_decode(request.headers().get(k).and_then(|h| h.to_str().ok()).ok_or("invalid-path")?) };
    let dir = granted_dir(&g, &head("x-acch-dir")?)?;
    let rel = head("x-acch-rel")?;
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("invalid-body".into());
    };
    write_into(&dir, &rel, bytes)
}

/// «Mostra nella cartella»: apre il gestore dei file sul file esportato (o sulla cartella), solo dentro una cartella concessa.
#[tauri::command(async)]
fn reveal_in_dir(g: State<'_, Grants>, dir: String, rel: Option<String>) -> Result<(), String> {
    let d = granted_dir(&g, &dir)?;
    let target = match rel.as_deref() {
        Some(r) if !r.is_empty() => join_rel(&d, r).ok().filter(|p| p.exists()).unwrap_or(d),
        _ => d,
    };
    tauri_plugin_opener::reveal_item_in_dir(&target).map_err(|e| format!("reveal-failed: {e}"))
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

/// «Segnala un problema»: unico destinatario possibile, l'indirizzo pubblico del progetto.
const REPORT_TO: &str = "lorenzo.birindelli@cnr.it";

/// Salva lo screenshot della segnalazione: in Download (da allegare a mano al mailto) o nella cartella temporanea (allegato MAPI).
/// Corpo binario (PNG); nome e destinazione nelle intestazioni. Il percorso scritto diventa leggibile per l'allegato.
#[tauri::command(async)]
fn save_report_shot(app: AppHandle, g: State<'_, Grants>, request: Request<'_>) -> Result<String, String> {
    let h = |k: &str| request.headers().get(k).and_then(|v| v.to_str().ok()).map(|s| s.to_string());
    let name = h("x-acch-name").unwrap_or_default();
    let dir = match h("x-acch-dest").as_deref() {
        Some("temp") => std::env::temp_dir().join("Acchiappaspettri"),
        _ => app.path().download_dir().unwrap_or_else(|_| std::env::temp_dir().join("Acchiappaspettri")),
    };
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("invalid-body".into());
    };
    let p = segnala::write_shot(&dir, &name, bytes)?;
    grant(&g, &p);
    Ok(p.to_string_lossy().into_owned())
}

/// Windows: messaggio già compilato nel programma di posta via Simple MAPI, con l'allegato. Risponde «sent» o «aborted»;
/// «mapi-unavailable» (anche su macOS e Linux) o «mapi-failed: N» dicono alla pagina di passare al mailto.
#[tauri::command(async)]
fn send_report_mapi(g: State<'_, Grants>, to: String, subject: String, body: String, attachment: Option<String>) -> Result<String, String> {
    if to != REPORT_TO {
        return Err("not-allowed".into());
    }
    let att = attachment.map(PathBuf::from);
    if let Some(p) = att.as_ref() {
        if !g.paths.lock().unwrap().contains(p) {
            return Err("not-allowed".into());
        }
    }
    #[cfg(windows)]
    {
        if !segnala::mapi::available() {
            return Err("mapi-unavailable".into());
        }
        // thread proprio: la finestra di composizione blocca la chiamata finché resta aperta
        let code = std::thread::spawn(move || segnala::mapi::send(&to, &subject, &body, att.as_deref()))
            .join()
            .map_err(|_| "mapi-failed: panic".to_string())??;
        segnala::mapi_outcome(code).map(|s| s.to_string())
    }
    #[cfg(not(windows))]
    {
        let _ = (subject, body, att);
        Err("mapi-unavailable".into())
    }
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
        .filter(|p| is_openable(p))
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

/// Su schermi piccoli o ingranditi (per esempio 1366×768 al 125%) la finestra predefinita non entra:
/// in quel caso si apre ingrandita sull'area utile del monitor, senza superarne i bordi.
fn fit_to_screen(app: &tauri::AppHandle) {
    let Some(w) = app.get_webview_window("main") else { return };
    let (Ok(Some(m)), Ok(size)) = (w.current_monitor(), w.outer_size()) else { return };
    let area = m.work_area().size;
    if size.width > area.width || size.height > area.height {
        let _ = w.maximize();
    }
}

/// La finestra parte nascosta (tauri.conf.json, `visible: false`) e si mostra quando la pagina ha disegnato:
/// niente finestra bianca all'avvio. Se la pagina non risponde, la si mostra comunque dopo qualche secondo.
static SHOWN: AtomicBool = AtomicBool::new(false);
fn show_main(app: &AppHandle) {
    if SHOWN.swap(true, Ordering::SeqCst) {
        return;
    }
    fit_to_screen(app);
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}
/// Scrive un lotto dell'archivio (app/host.js): chiave → valore, oppure null per toglierla.
#[tauri::command(async)]
fn store_write(st: State<'_, Store>, items: std::collections::BTreeMap<String, Option<String>>) -> Result<(), String> {
    let dir = st.dir.lock().unwrap();
    let Some(d) = dir.as_ref() else { return Err("no-store".into()) };
    store::write(d, &items)
}
/* ---- librerie dei picchi (libs.rs): solo file .acchlib (o .acchlib.json) nella cartella dell'utente e nelle cartelle condivise registrate ---- */
fn lib_user(st: &State<'_, LibDirState>) -> Result<PathBuf, String> {
    st.dir.lock().unwrap().clone().ok_or_else(|| "no-store".into())
}
#[tauri::command(async)]
fn lib_list(st: State<'_, LibDirState>) -> Result<serde_json::Value, String> {
    let u = lib_user(&st)?;
    let mut dirs = vec![libs::read_dir(&u, "user")];
    for d in libs::shared_dirs(&u) {
        dirs.push(libs::read_dir(&d, "shared"));
    }
    Ok(serde_json::json!({ "user": u.to_string_lossy(), "dirs": dirs }))
}
#[tauri::command(async)]
fn lib_write(st: State<'_, LibDirState>, path: String, text: String, expect: Option<String>) -> Result<libs::WriteResult, String> {
    let u = lib_user(&st)?;
    libs::write(&u, Path::new(&path), &text, expect.as_deref().filter(|s| !s.is_empty()))
}
#[tauri::command(async)]
fn lib_remove(st: State<'_, LibDirState>, path: String) -> Result<(), String> {
    libs::remove(&lib_user(&st)?, Path::new(&path))
}
/// Registra una cartella condivisa scelta dall'utente in una finestra di dialogo (la pagina non può indicarne una qualsiasi).
#[tauri::command(async)]
fn lib_shared_add(app: AppHandle, st: State<'_, LibDirState>, title: String) -> Result<Option<String>, String> {
    let u = lib_user(&st)?;
    let Some(f) = app.dialog().file().set_title(title).blocking_pick_folder() else { return Ok(None) };
    let dir = fp(f)?;
    let mut list = libs::shared_dirs(&u);
    if !list.contains(&dir) {
        list.push(dir.clone());
    }
    libs::set_shared(&u, &list)?;
    Ok(Some(dir.to_string_lossy().into_owned()))
}
#[tauri::command(async)]
fn lib_shared_remove(st: State<'_, LibDirState>, path: String) -> Result<(), String> {
    let u = lib_user(&st)?;
    let list: Vec<PathBuf> = libs::shared_dirs(&u).into_iter().filter(|p| p != Path::new(&path)).collect();
    libs::set_shared(&u, &list)
}
#[tauri::command]
fn app_ready(app: AppHandle) {
    show_main(&app);
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
        .manage(Dirs::default())
        .manage(Store::default())
        .manage(LibDirState::default())
        .setup(|app| {
            queue_open(app.handle(), accept_args(std::env::args()));
            if let Ok(dir) = app.path().app_config_dir() {
                let f = dir.join("dialog-dirs.json");
                let d = app.state::<Dirs>();
                *d.map.lock().unwrap() = fs::read_to_string(&f).map(|t| parse_dirs(&t)).unwrap_or_default();
                *d.file.lock().unwrap() = Some(f);
            }
            // finestra principale creata qui (tauri.conf.json: create false) per consegnarle l'archivio prima di ogni script della pagina
            let items = match app.path().app_data_dir() {
                Ok(d) => {
                    *app.state::<LibDirState>().dir.lock().unwrap() = Some(d.join(libs::DIR));
                    let dir = d.join(store::DIR);
                    let items = store::load(&dir);
                    *app.state::<Store>().dir.lock().unwrap() = Some(dir);
                    items
                }
                Err(_) => Default::default(),
            };
            let cfg = app.config().app.windows.iter().find(|w| w.label == "main").cloned().ok_or("finestra main mancante")?;
            let mut wb = tauri::WebviewWindowBuilder::from_config(app.handle(), &cfg)?;
            if app.state::<Store>().dir.lock().unwrap().is_some() {
                wb = wb.initialization_script(store::boot_script(&items));
            }
            wb.build()?;
            let h = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(5));
                let h2 = h.clone();
                let _ = h.run_on_main_thread(move || show_main(&h2));
            });
            Ok(())
        })
        // trascinamento nativo: i percorsi trascinati (anche le cartelle, espanse) diventano leggibili, poi la pagina li riceve
        .on_window_event(|w, ev| {
            if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = ev {
                let app = w.app_handle().clone();
                let paths = paths.clone();
                std::thread::spawn(move || {
                    let list = expand(&paths);
                    let g = app.state::<Grants>();
                    let out = grant_all(&g, &list);
                    let _ = app.emit("acch-dropped", out);
                });
            }
        });
    #[cfg(not(feature = "e2e"))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        pick_open, pick_many, pick_folder, pick_save, read_file, write_file, take_pending_open, install_info, installer_language, app_ready,
        pick_export_dir, export_existing, write_in_dir, reveal_in_dir, store_write, save_report_shot, send_report_mapi,
        lib_list, lib_write, lib_remove, lib_shared_add, lib_shared_remove,
        lib_list, lib_write, lib_remove, lib_shared_add, lib_shared_remove
    ]);
    #[cfg(feature = "e2e")]
    let builder = builder.invoke_handler(tauri::generate_handler![
        pick_open, pick_many, pick_folder, pick_save, read_file, write_file, take_pending_open, install_info, installer_language, app_ready,
        pick_export_dir, export_existing, write_in_dir, reveal_in_dir, store_write, save_report_shot, send_report_mapi,
        lib_list, lib_write, lib_remove, lib_shared_add, lib_shared_remove,
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
                    .filter(|p| is_openable(p))
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
    fn libraries_are_accepted_from_the_system() {
        assert!(is_library(Path::new("/x/Agilent 1260 — alimenti.acchlib.json")));
        assert!(is_library(Path::new("C:\\x\\lib.ACCHLIB.JSON")));
        assert!(!is_library(Path::new("/x/vecchio.acchiappa.json")), "i vecchi progetti restano progetti");
        assert!(is_library(Path::new("/x/lib.acchlib")));
        assert!(!is_library(Path::new("/x/lib.acchspettri")));
    }
    #[test]
    fn projects_are_recognised() {
        assert!(is_project(Path::new("/x/y.ACCHSPETTRI")));
        assert!(is_legacy_project(Path::new("y.acchiappa.json")));
        assert!(!is_project(Path::new("/etc/passwd")));
        assert!(!is_legacy_project(Path::new("/x/y.json")));
    }
    #[test]
    fn raw_files_are_accepted_from_the_command_line() {
        let dir = std::env::temp_dir().join(format!("acch-args-{}", std::process::id()));
        fs::create_dir_all(dir.join("STD1.D")).unwrap();
        let ch = dir.join("STD1.D").join("DAD1A.ch");
        let txt = dir.join("lc.TXT");
        let num = dir.join("s.001");
        let exe = dir.join("x.exe");
        for p in [&ch, &txt, &num, &exe] {
            fs::write(p, "1").unwrap();
        }
        let args = ["app", ch.to_str().unwrap(), txt.to_str().unwrap(), num.to_str().unwrap(), exe.to_str().unwrap(), "/non/esiste.csv", dir.to_str().unwrap()]
            .map(String::from);
        assert_eq!(accept_args(args), vec![ch.clone(), txt.clone(), num.clone()]);
        assert!(is_raw(Path::new("a.UV")) && is_raw(Path::new("b.arw")) && !is_raw(Path::new("c.1234")) && !is_raw(Path::new("d")));
        fs::remove_dir_all(&dir).unwrap();
    }
    #[test]
    fn dialog_start_dir_per_kind() {
        let dir = std::env::temp_dir().join(format!("acch-dirs-{}", std::process::id()));
        let (spe, exp) = (dir.join("spettri"), dir.join("esportazioni"));
        fs::create_dir_all(&spe).unwrap();
        fs::create_dir_all(&exp).unwrap();
        let docs = Some(PathBuf::from("/Documenti"));
        let txt = serde_json::json!({ "spectra": spe, "export": exp, "project": dir.join("sparita") }).to_string();
        let m = parse_dirs(&txt);
        assert_eq!(start_dir(&m, "spectra", docs.clone()), Some(spe.clone()));
        assert_eq!(start_dir(&m, "export", docs.clone()), Some(exp.clone()));
        // cartella non più esistente o mai usata: Documenti
        assert_eq!(start_dir(&m, "project", docs.clone()), docs);
        assert_eq!(start_dir(&m, "images", docs.clone()), docs);
        assert_eq!(start_dir(&parse_dirs("non json"), "spectra", docs.clone()), docs);
        assert_eq!(kind_of(Some("export")), "export");
        assert_eq!(kind_of(Some("../x")), "other");
        assert_eq!(kind_of(None), "other");
        fs::remove_dir_all(&dir).unwrap();
    }
    #[test]
    fn folder_expansion_keeps_relative_paths() {
        let dir = std::env::temp_dir().join(format!("acch-tree-{}", std::process::id()));
        let root = dir.join("campioni");
        fs::create_dir_all(root.join("sub")).unwrap();
        fs::write(root.join("b.csv"), "1").unwrap();
        fs::write(root.join("sub").join("a.csv"), "1").unwrap();
        fs::write(dir.join("solo.txt"), "1").unwrap();
        let l = expand(&[root.clone(), dir.join("solo.txt"), dir.join("manca.csv")]);
        let rel: Vec<&str> = l.iter().map(|(_, r)| r.as_str()).collect();
        assert_eq!(rel, vec!["campioni/b.csv", "campioni/sub/a.csv", "solo.txt"]);
        assert_eq!(l[1].0, root.join("sub").join("a.csv"));
        fs::remove_dir_all(&dir).unwrap();
    }
    #[test]
    fn export_paths_stay_inside_the_chosen_folder() {
        let d = Path::new("/out");
        assert_eq!(join_rel(d, "analisi/qc.csv").unwrap(), d.join("analisi").join("qc.csv"));
        for ok in ["COM10.csv", "console.txt", "nul_2.csv", "_CON.csv", "a.b.c"] {
            assert!(join_rel(d, ok).is_ok(), "rifiutato: {ok:?}");
        }
        for bad in ["", "../x.csv", "a/../../x", "/etc/passwd", "a//b", "./a", "C:x", "a\\b.csv", "a\u{0}b", "a/", "x.", "x ", "NUL", "con.txt", "a/COM1.csv", "lpt9", "a<b", "a?b", "a*b", "a|b", "a\"b"] {
            assert!(join_rel(d, bad).is_err(), "accettato: {bad:?}");
        }
    }
    #[test]
    fn export_writes_files_and_reports_conflicts() {
        let dir = std::env::temp_dir().join(format!("acch-export-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        write_into(&dir, "report.pdf", b"pdf").unwrap();
        write_into(&dir, "Progetto/analisi/qc.csv", b"a;b").unwrap();
        assert_eq!(fs::read(dir.join("Progetto").join("analisi").join("qc.csv")).unwrap(), b"a;b");
        let rels = vec!["report.pdf".to_string(), "nuovo.csv".to_string(), "Progetto/analisi/qc.csv".to_string()];
        assert_eq!(existing(&dir, &rels).unwrap(), vec!["report.pdf".to_string(), "Progetto/analisi/qc.csv".to_string()]);
        // sostituzione atomica: il contenuto nuovo, nessun file temporaneo rimasto
        write_into(&dir, "report.pdf", b"pdf2").unwrap();
        assert_eq!(fs::read(dir.join("report.pdf")).unwrap(), b"pdf2");
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 2);
        assert!(write_into(&dir, "../fuori.csv", b"x").is_err());
        assert!(write_into(&dir, "Progetto", b"x").is_err(), "una cartella non diventa un file");
        #[cfg(unix)]
        {
            let out = std::env::temp_dir().join(format!("acch-export-out-{}", std::process::id()));
            fs::create_dir_all(&out).unwrap();
            std::os::unix::fs::symlink(&out, dir.join("link")).unwrap();
            assert_eq!(write_into(&dir, "link/x.csv", b"x"), Err("not-allowed".to_string()));
            assert!(!out.join("x.csv").exists());
            fs::remove_dir_all(&out).unwrap();
        }
        fs::remove_dir_all(&dir).unwrap();
    }
    #[test]
    fn url_decoding() {
        assert_eq!(url_decode("/a%20b/%C3%A8.txt").unwrap(), "/a b/è.txt");
        assert!(url_decode("%zz").is_err());
    }
}
