// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
//! Dati atomici per la CF-LIBS (sperimentale): la pagina (app/libs-nist.js) li chiede al NIST Atomic Spectra Database quando l'utente
//! preme «Scarica i dati atomici dal NIST». Non sono distribuiti con l'app (permesso del NIST da chiedere). La richiesta parte da qui
//! perché il sito del NIST non permette lo scaricamento diretto alle pagine di altri siti (CORS).
//! Solo `https://physics.nist.gov/cgi-bin/ASD/` e solo i tre moduli usati da scripts/gen-libs-data.py; niente reindirizzamenti,
//! tempo massimo 2 minuti, risposta al massimo 32 MB.
use std::time::Duration;

const BASE: &str = "https://physics.nist.gov/cgi-bin/ASD/";
const SCRIPTS: [&str; 3] = ["lines1.pl", "energy1.pl", "ie.pl"];
const MAX_BYTES: usize = 32 * 1024 * 1024;

/// Controlla modulo e parametri: solo caratteri di una query già codificata (lettere, cifre, `+ - . _ ~ % = &`).
pub fn url_for(script: &str, query: &str) -> Result<String, String> {
    if !SCRIPTS.contains(&script) {
        return Err("modulo del NIST non ammesso".into());
    }
    if query.is_empty() || query.len() > 4096 || !query.bytes().all(|b| b.is_ascii_alphanumeric() || b"+-._~%=&".contains(&b)) {
        return Err("richiesta non valida".into());
    }
    Ok(format!("{}{}?{}", BASE, script, query))
}

#[tauri::command]
pub async fn nist_get(script: String, query: String) -> Result<String, String> {
    let url = url_for(&script, &query)?;
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let client = reqwest::Client::builder()
        .user_agent(concat!("Acchiappaspettri/", env!("CARGO_PKG_VERSION"), " (scientific software; NIST ASD query)"))
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| format!("client: {e}"))?;
    let r = client.get(&url).send().await.map_err(|e| format!("rete: {e}"))?;
    if !r.status().is_success() {
        return Err(format!("il NIST ha risposto {}", r.status()));
    }
    let b = r.bytes().await.map_err(|e| format!("rete: {e}"))?;
    if b.len() > MAX_BYTES {
        return Err("risposta troppo grande".into());
    }
    Ok(String::from_utf8_lossy(&b).into_owned())
}

#[cfg(test)]
mod tests {
    use super::url_for;
    #[test]
    fn solo_nist_e_query_pulite() {
        assert!(url_for("lines1.pl", "spectra=Cu+I&low_w=200.0").unwrap().starts_with("https://physics.nist.gov/cgi-bin/ASD/lines1.pl?"));
        assert!(url_for("../x.pl", "a=1").is_err());
        assert!(url_for("ie.pl", "a=1#frag").is_err());
        assert!(url_for("ie.pl", "a=1/../../x").is_err());
        assert!(url_for("ie.pl", "a=1@evil.example").is_err());
        assert!(url_for("ie.pl", "").is_err());
    }
    /// con la rete: `cargo test --lib nist -- --ignored` (non in CI: dipende dal sito del NIST)
    #[test]
    #[ignore]
    fn scarica_dal_nist() {
        let t = tauri::async_runtime::block_on(super::nist_get("ie.pl".into(), "spectra=Cu+I-II&submit=Retrieve+Data&units=1&format=3&order=0&sp_name_out=on&e_out=0".into())).unwrap();
        assert!(t.contains("Cu I"), "{}", &t[..t.len().min(300)]);
    }
}
