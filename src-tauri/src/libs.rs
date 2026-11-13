// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
//! Librerie dei picchi su file (tappa I4, app/library-store.js).
//! - utente: `app_data_dir()/librerie/*.acchlib` (si leggono anche i `.acchlib.json`), scritte in modo atomico; la versione precedente resta in `librerie/versioni/`;
//! - condivise: cartelle scelte dall'utente (anche OneDrive o rete), registrate per percorso in `librerie/condivise.json`.
//! Prima di scrivere si confronta l'impronta SHA-256 del file con quella letta dalla pagina (DECISIONE-PO §7): se è cambiato
//! non si scrive e si restituisce il contenuto nuovo, che la pagina unisce voce per voce. Mai sovrascrivere in silenzio.
//! La pagina può leggere e scrivere solo file `.acchlib` o `.acchlib.json` direttamente dentro queste cartelle.
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};

pub const DIR: &str = "librerie";
const SHARED: &str = "condivise.json";
const VERSIONS: &str = "versioni";
const MAX_FILE: u64 = 20 * 1024 * 1024;
const KEEP_VERSIONS: usize = 20;

pub fn sha256_hex(b: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(b);
    h.finalize().iter().map(|x| format!("{:02x}", x)).collect()
}

/// Nome senza l'estensione della libreria (.acchlib, o .acchlib.json della prima versione).
fn lib_stem(name: &str) -> String {
    let l = name.to_ascii_lowercase();
    let cut = if l.ends_with(".acchlib.json") { 13 } else if l.ends_with(".acchlib") { 8 } else { 0 };
    name[..name.len() - cut].to_string()
}

pub fn is_lib_name(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    (n.ends_with(".acchlib") || n.ends_with(".acchlib.json")) && !name.starts_with('.') && !name.contains(['/', '\\']) && !name.contains("..")
}

#[derive(serde::Serialize, Debug)]
pub struct LibFile {
    pub name: String,
    pub path: String,
    pub text: String,
    pub sha256: String,
}

#[derive(serde::Serialize, Debug)]
pub struct LibDir {
    pub path: String,
    pub kind: String,
    pub ok: bool,
    pub error: Option<String>,
    pub files: Vec<LibFile>,
}

/// Cartelle condivise registrate (percorsi assoluti), nell'ordine in cui sono state aggiunte.
pub fn shared_dirs(user: &Path) -> Vec<PathBuf> {
    fs::read_to_string(user.join(SHARED))
        .ok()
        .and_then(|t| serde_json::from_str::<Vec<String>>(&t).ok())
        .unwrap_or_default()
        .into_iter()
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .collect()
}

pub fn set_shared(user: &Path, dirs: &[PathBuf]) -> Result<(), String> {
    fs::create_dir_all(user).map_err(|e| format!("write-failed: {}", e.kind()))?;
    let v: Vec<String> = dirs.iter().map(|p| p.to_string_lossy().into_owned()).collect();
    let j = serde_json::to_vec_pretty(&v).map_err(|_| "write-failed: json")?;
    super::write_atomic(&user.join(SHARED), &j, false)
}

/// Legge una cartella: solo i file `.acchlib` e `.acchlib.json` del primo livello. Una cartella che non risponde (rete staccata) non è un errore fatale.
pub fn read_dir(dir: &Path, kind: &str) -> LibDir {
    let mut out = LibDir { path: dir.to_string_lossy().into_owned(), kind: kind.into(), ok: true, error: None, files: Vec::new() };
    let rd = match fs::read_dir(dir) {
        Ok(r) => r,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound && kind == "user" => return out,
        Err(e) => {
            out.ok = false;
            out.error = Some(format!("{:?}", e.kind()));
            return out;
        }
    };
    let mut v: Vec<LibFile> = Vec::new();
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        if !is_lib_name(&name) {
            continue;
        }
        let p = e.path();
        if fs::metadata(&p).map(|m| !m.is_file() || m.len() > MAX_FILE).unwrap_or(true) {
            continue;
        }
        let Ok(b) = fs::read(&p) else { continue };
        let sha256 = sha256_hex(&b);
        v.push(LibFile { name, path: p.to_string_lossy().into_owned(), text: String::from_utf8_lossy(&b).into_owned(), sha256 });
    }
    v.sort_by(|a, b| a.name.cmp(&b.name));
    out.files = v;
    out
}

/// Il percorso è un file di libreria direttamente dentro la cartella dell'utente o una cartella condivisa registrata?
pub fn allowed(user: &Path, path: &Path) -> Option<&'static str> {
    let name = path.file_name()?.to_string_lossy().into_owned();
    if !is_lib_name(&name) {
        return None;
    }
    let parent = path.parent()?;
    let same = |a: &Path, b: &Path| a == b || (fs::canonicalize(a).ok().is_some() && fs::canonicalize(a).ok() == fs::canonicalize(b).ok());
    if same(parent, user) {
        return Some("user");
    }
    if shared_dirs(user).iter().any(|d| same(parent, d)) {
        return Some("shared");
    }
    None
}

#[derive(serde::Serialize, Debug, PartialEq)]
pub struct WriteResult {
    pub ok: bool,
    pub sha256: String,
    /// se il file è cambiato dopo la lettura: il contenuto trovato, da unire
    pub text: Option<String>,
}

/// Scrittura con confronto dell'impronta. `expect` = impronta letta (None = il file non deve esistere ancora).
/// Nelle librerie dell'utente la versione precedente si copia in `versioni/` (ultime 20 per file).
pub fn write(user: &Path, path: &Path, text: &str, expect: Option<&str>) -> Result<WriteResult, String> {
    let kind = allowed(user, path).ok_or("not-allowed")?;
    if kind == "user" {
        fs::create_dir_all(user).map_err(|e| format!("write-failed: {}", e.kind()))?;
    }
    let now = match fs::read(path) {
        Ok(b) => Some(b),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Err(e) => return Err(format!("read-failed: {}", e.kind())),
    };
    let now_sha = now.as_ref().map(|b| sha256_hex(b));
    if now_sha.as_deref() != expect {
        return Ok(WriteResult { ok: false, sha256: now_sha.unwrap_or_default(), text: Some(now.map(|b| String::from_utf8_lossy(&b).into_owned()).unwrap_or_default()) });
    }
    if kind == "user" {
        if let Some(old) = &now {
            let vd = user.join(VERSIONS);
            let _ = fs::create_dir_all(&vd);
            let stem = lib_stem(&path.file_name().unwrap().to_string_lossy());
            let _ = super::write_atomic(&vd.join(format!("{}.{}.acchlib", stem, &sha256_hex(old)[..12])), old, false);
            prune_versions(&vd, &stem);
        }
    }
    // scrittura in due tempi (decisione del coordinatore): prima il file temporaneo nella stessa cartella, poi si rilegge l'originale.
    // Se nel frattempo è cambiato (un altro computer su OneDrive o in rete) si annulla: la pagina unisce e riprova.
    // Rischio residuo: una scrittura altrui tra la rilettura e la rinomina (pochi millisecondi) si perderebbe; resta però nelle
    // copie di conflitto di OneDrive o, sulle cartelle dell'utente, in `versioni/`. Documentato in FORMATO-ACCHSPETTRI.md.
    let dir = path.parent().ok_or("invalid-path")?;
    let tmp = dir.join(format!(".{}.tmp{}", path.file_name().unwrap().to_string_lossy(), std::process::id()));
    let res = (|| -> Result<Option<WriteResult>, String> {
        {
            use std::io::Write;
            let mut f = fs::File::create(&tmp).map_err(|e| format!("write-failed: {}", e.kind()))?;
            f.write_all(text.as_bytes()).map_err(|e| format!("write-failed: {}", e.kind()))?;
            f.sync_all().map_err(|e| format!("write-failed: {}", e.kind()))?;
        }
        race_hook();
        let again = match fs::read(path) {
            Ok(b) => Some(b),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
            Err(e) => return Err(format!("read-failed: {}", e.kind())),
        };
        let again_sha = again.as_ref().map(|b| sha256_hex(b));
        if again_sha != now_sha {
            return Ok(Some(WriteResult { ok: false, sha256: again_sha.unwrap_or_default(), text: Some(again.map(|b| String::from_utf8_lossy(&b).into_owned()).unwrap_or_default()) }));
        }
        fs::rename(&tmp, path).map_err(|e| format!("write-failed: {}", e.kind()))?;
        Ok(None)
    })();
    if !matches!(res, Ok(None)) {
        let _ = fs::remove_file(&tmp);
    }
    if let Some(changed) = res? {
        return Ok(changed);
    }
    Ok(WriteResult { ok: true, sha256: sha256_hex(text.as_bytes()), text: None })
}

/// Solo per i test: come `write`, ma con una scrittura altrui simulata dopo il file temporaneo.
#[cfg(test)]
pub fn write_with_race(user: &Path, path: &Path, text: &str, expect: Option<&str>, other: &str) -> Result<WriteResult, String> {
    RACE.with(|r| *r.borrow_mut() = Some((path.to_path_buf(), other.to_string())));
    let out = write(user, path, text, expect);
    RACE.with(|r| *r.borrow_mut() = None);
    out
}
#[cfg(test)]
thread_local! { static RACE: std::cell::RefCell<Option<(PathBuf, String)>> = const { std::cell::RefCell::new(None) }; }
#[cfg(test)]
fn race_hook() {
    RACE.with(|r| {
        if let Some((p, t)) = r.borrow_mut().take() {
            let _ = fs::write(p, t);
        }
    });
}
#[cfg(not(test))]
fn race_hook() {}

fn prune_versions(vd: &Path, stem: &str) {
    let Ok(rd) = fs::read_dir(vd) else { return };
    let mut v: Vec<(std::time::SystemTime, PathBuf)> = rd
        .flatten()
        .filter(|e| {
            let n = e.file_name().to_string_lossy().into_owned();
            n.starts_with(&format!("{}.", stem)) && is_lib_name(&n)
        })
        .filter_map(|e| Some((e.metadata().ok()?.modified().ok()?, e.path())))
        .collect();
    v.sort();
    while v.len() > KEEP_VERSIONS {
        let (_, p) = v.remove(0);
        let _ = fs::remove_file(p);
    }
}

/// Togliere una libreria dell'utente: il file va in `versioni/` (recuperabile), non si cancella.
pub fn remove(user: &Path, path: &Path) -> Result<(), String> {
    if allowed(user, path) != Some("user") {
        return Err("not-allowed".into());
    }
    let vd = user.join(VERSIONS);
    fs::create_dir_all(&vd).map_err(|e| format!("write-failed: {}", e.kind()))?;
    let name = path.file_name().unwrap().to_string_lossy().into_owned();
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    fs::rename(path, vd.join(format!("{}.tolta-{}.acchlib", lib_stem(&name), stamp))).map_err(|e| format!("write-failed: {}", e.kind()))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn tmp(n: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("acch-libs-{}-{}", n, std::process::id()));
        let _ = fs::remove_dir_all(&d);
        d
    }
    #[test]
    fn sha256_matches_known_vector() {
        assert_eq!(sha256_hex(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }
    #[test]
    fn write_checks_hash_and_keeps_versions() {
        let u = tmp("user");
        let p = u.join("a.acchlib");
        assert!(is_lib_name("vecchia.acchlib.json") && is_lib_name("nuova.ACCHLIB") && !is_lib_name("x.json"));
        // file nuovo: si scrive solo se non esiste ancora
        let r = write(&u, &p, "{\"v\":1}", None).unwrap();
        assert!(r.ok);
        let h1 = r.sha256.clone();
        assert_eq!(write(&u, &p, "{\"v\":9}", None).unwrap().ok, false, "esiste già: niente sovrascrittura");
        // impronta giusta: scrive e conserva la versione precedente
        let r2 = write(&u, &p, "{\"v\":2}", Some(&h1)).unwrap();
        assert!(r2.ok);
        assert_eq!(fs::read_dir(u.join(VERSIONS)).unwrap().count(), 1);
        // impronta vecchia: un altro ha scritto nel frattempo → nessuna scrittura, torna il contenuto nuovo
        let r3 = write(&u, &p, "{\"v\":3}", Some(&h1)).unwrap();
        assert!(!r3.ok);
        assert_eq!(r3.text.as_deref(), Some("{\"v\":2}"));
        assert_eq!(fs::read_to_string(&p).unwrap(), "{\"v\":2}");
        // percorsi fuori dalle cartelle o con un altro nome: rifiutati
        assert!(write(&u, &u.join("x.json"), "{}", None).is_err());
        assert!(write(&u, &std::env::temp_dir().join("fuori.acchlib.json"), "{}", None).is_err());
        let l = read_dir(&u, "user");
        assert_eq!(l.files.len(), 1);
        assert_eq!(l.files[0].sha256, r2.sha256);
        remove(&u, &p).unwrap();
        assert!(!p.exists());
        assert_eq!(read_dir(&u, "user").files.len(), 0);
        fs::remove_dir_all(&u).unwrap();
    }
    #[test]
    fn change_after_temp_file_cancels_the_write() {
        let u = tmp("race");
        let p = u.join("r.acchlib.json");
        let h = write(&u, &p, "{\"v\":1}", None).unwrap().sha256;
        // un altro computer scrive dopo il nostro file temporaneo e prima della rinomina: si annulla, il suo contenuto resta
        let r = write_with_race(&u, &p, "{\"v\":\"nostra\"}", Some(&h), "{\"v\":\"altrui\"}").unwrap();
        assert!(!r.ok);
        assert_eq!(r.text.as_deref(), Some("{\"v\":\"altrui\"}"));
        assert_eq!(fs::read_to_string(&p).unwrap(), "{\"v\":\"altrui\"}");
        assert!(fs::read_dir(&u).unwrap().flatten().all(|e| !e.file_name().to_string_lossy().contains(".tmp")), "nessun temporaneo rimasto");
        fs::remove_dir_all(&u).unwrap();
    }
    #[test]
    fn shared_folders_are_registered_by_path() {
        let u = tmp("u2");
        let s = tmp("shared");
        fs::create_dir_all(&s).unwrap();
        let p = s.join("comune.acchlib.json");
        assert!(write(&u, &p, "{}", None).is_err(), "cartella non registrata");
        set_shared(&u, &[s.clone()]).unwrap();
        assert_eq!(shared_dirs(&u), vec![s.clone()]);
        assert!(write(&u, &p, "{}", None).unwrap().ok);
        // nelle condivise nessuna cartella «versioni» (OneDrive la sincronizzerebbe a tutti)
        assert!(!s.join(VERSIONS).exists());
        assert!(remove(&u, &p).is_err());
        let d = read_dir(&tmp("assente"), "shared");
        assert!(!d.ok);
        fs::remove_dir_all(&u).unwrap();
        fs::remove_dir_all(&s).unwrap();
    }
}
