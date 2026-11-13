// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
//! Archivio dell'app su file, al posto del localStorage della webview (che si perde con il profilo di WebView2 o una reinstallazione).
//! Una chiave = un file JSON `{"key":…, "value":…}` in `app_data_dir()/archivio`, scritto in modo atomico.
//! All'avvio l'archivio si legge tutto e si consegna alla pagina prima di ogni suo script (`window.__ACCH_STORE__`),
//! così le letture della pagina restano sincrone (app/host.js). La migrazione dal localStorage la fa la pagina, una volta sola.
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

pub const DIR: &str = "archivio";
const MAX_KEY: usize = 4096;
const MAX_VALUE: usize = 512 * 1024 * 1024;

#[derive(serde::Serialize, serde::Deserialize)]
struct Entry {
    key: String,
    value: String,
}

/// FNV-1a a 64 bit: nome di file stabile per qualsiasi chiave (anche percorsi lunghi con barre e lettere accentate).
fn fnv64(s: &str) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in s.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

/// Nome del file di una chiave: un prefisso leggibile (solo caratteri sicuri su tutti i sistemi) e l'impronta della chiave intera.
pub fn file_for(key: &str) -> String {
    let pre: String = key
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-' { c } else { '_' })
        .take(48)
        .collect();
    format!("{}-{:016x}.json", pre.trim_start_matches('.'), fnv64(key))
}

/// Legge tutto l'archivio. File illeggibili, temporanei o con un nome che non corrisponde alla chiave si ignorano (mai un errore all'avvio).
pub fn load(dir: &Path) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    let Ok(rd) = fs::read_dir(dir) else { return out };
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') || !name.ends_with(".json") {
            continue;
        }
        let Ok(txt) = fs::read_to_string(e.path()) else { continue };
        let Ok(en) = serde_json::from_str::<Entry>(&txt) else { continue };
        if file_for(&en.key) == name {
            out.insert(en.key, en.value);
        }
    }
    out
}

/// Scrive un lotto: `Some(valore)` scrive la chiave, `None` la toglie. Ogni file è scritto in modo atomico (super::write_atomic).
pub fn write(dir: &Path, items: &BTreeMap<String, Option<String>>) -> Result<(), String> {
    for (k, v) in items {
        if k.is_empty() || k.len() > MAX_KEY || v.as_ref().is_some_and(|v| v.len() > MAX_VALUE) {
            return Err("invalid-key".into());
        }
    }
    fs::create_dir_all(dir).map_err(|e| format!("write-failed: {}", e.kind()))?;
    for (k, v) in items {
        let p = dir.join(file_for(k));
        match v {
            Some(v) => {
                let j = serde_json::to_vec(&Entry { key: k.clone(), value: v.clone() }).map_err(|_| "write-failed: json")?;
                super::write_atomic(&p, &j, false)?;
            }
            None => match fs::remove_file(&p) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(format!("write-failed: {}", e.kind())),
            },
        }
    }
    Ok(())
}

/// Script eseguito nella pagina prima di ogni altro: consegna l'archivio letto. Il JSON è anche JavaScript valido.
pub fn boot_script(items: &BTreeMap<String, String>) -> String {
    let v = serde_json::json!({ "version": 1, "items": items });
    format!("window.__ACCH_STORE__={};", v)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn roundtrip_atomic_and_delete() {
        let dir = std::env::temp_dir().join(format!("acch-store-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let mut b = BTreeMap::new();
        b.insert("spectraplot.lib.v1".to_string(), Some("[{\"id\":\"c1\"}]".to_string()));
        b.insert("acch.f.cartella/è file.txt|1024".to_string(), Some("{\"title\":\"x\"}".to_string()));
        b.insert("acch.zoom".to_string(), Some("1.25".to_string()));
        write(&dir, &b).unwrap();
        let m = load(&dir);
        assert_eq!(m.len(), 3);
        assert_eq!(m["acch.f.cartella/è file.txt|1024"], "{\"title\":\"x\"}");
        // riscrittura e cancellazione: nessun file temporaneo resta nella cartella
        let mut c = BTreeMap::new();
        c.insert("acch.zoom".to_string(), None);
        c.insert("spectraplot.lib.v1".to_string(), Some("[]".to_string()));
        write(&dir, &c).unwrap();
        let m = load(&dir);
        assert_eq!(m.len(), 2);
        assert_eq!(m["spectraplot.lib.v1"], "[]");
        assert!(!m.contains_key("acch.zoom"));
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 2);
        // file estranei o rovinati: ignorati
        fs::write(dir.join("rotto.json"), "{non json").unwrap();
        fs::write(dir.join(file_for("altra")), "{\"key\":\"diversa\",\"value\":\"v\"}").unwrap();
        assert_eq!(load(&dir).len(), 2);
        fs::remove_dir_all(&dir).unwrap();
    }
    #[test]
    fn names_are_safe_and_distinct() {
        let a = file_for("../../etc/passwd");
        assert!(!a.contains('/') && !a.contains('\\') && !a.starts_with('.'));
        assert_ne!(file_for("a|1"), file_for("a|2"));
        assert!(file_for(&"x".repeat(5000)).len() < 80);
        assert!(write(Path::new("/nonesiste"), &BTreeMap::from([(String::new(), None)])).is_err());
    }
    #[test]
    fn boot_script_is_valid_json() {
        let s = boot_script(&BTreeMap::from([("k".to_string(), "\u{2028}</script>\"".to_string())]));
        let j: serde_json::Value = serde_json::from_str(s.trim_start_matches("window.__ACCH_STORE__=").trim_end_matches(';')).unwrap();
        assert_eq!(j["items"]["k"], "\u{2028}</script>\"");
    }
}
