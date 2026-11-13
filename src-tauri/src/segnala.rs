// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
//! «Segnala un problema»: il programma non spedisce nulla e non fa chiamate di rete.
//! Su Windows passa il messaggio già compilato al programma di posta con Simple MAPI (`MAPISendMailW`), con lo screenshot allegato:
//! la finestra di composizione si apre e l'utente preme «Invia». Altrove (o se MAPI manca) la pagina usa un `mailto:`
//! e lo screenshot si salva in Download, da allegare a mano.
use std::path::{Path, PathBuf};

/// Nome dello screenshot accettato dalla pagina: solo lettere, cifre, `-`, `_`, un punto e l'estensione `.png`.
/// Qualsiasi altra cosa (percorsi, `..`, estensioni diverse) diventa il nome predefinito.
pub fn safe_shot_name(name: &str) -> String {
    let ok = name.len() <= 120
        && name.to_ascii_lowercase().ends_with(".png")
        && name.matches('.').count() == 1
        && !name.starts_with('.')
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.');
    if ok { name.to_string() } else { "Acchiappaspettri-segnalazione.png".to_string() }
}

/// Percorso libero nella cartella: se il nome esiste già si aggiunge «-2», «-3»… (mai sovrascrivere un file dell'utente).
pub fn free_path(dir: &Path, name: &str) -> PathBuf {
    let p = dir.join(name);
    if !p.exists() {
        return p;
    }
    let stem = name.trim_end_matches(".png").trim_end_matches(".PNG");
    (2..1000).map(|i| dir.join(format!("{stem}-{i}.png"))).find(|p| !p.exists()).unwrap_or(p)
}

/// Scrive lo screenshot (PNG) e restituisce il percorso. Solo byte che iniziano con la firma PNG.
pub fn write_shot(dir: &Path, name: &str, bytes: &[u8]) -> Result<PathBuf, String> {
    const SIG: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
    if bytes.len() < 8 || bytes[..8] != SIG {
        return Err("not-png".into());
    }
    std::fs::create_dir_all(dir).map_err(|e| format!("write-failed: {}", e.kind()))?;
    let p = free_path(dir, &safe_shot_name(name));
    std::fs::write(&p, bytes).map_err(|e| format!("write-failed: {}", e.kind()))?;
    Ok(p)
}

/// Esito di `MAPISendMailW` per la pagina: «sent» (consegnato al programma di posta), «aborted» (l'utente ha chiuso), altrimenti errore.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn mapi_outcome(code: u32) -> Result<&'static str, String> {
    match code {
        0 => Ok("sent"),     // SUCCESS_SUCCESS
        1 => Ok("aborted"),  // MAPI_USER_ABORT
        _ => Err(format!("mapi-failed: {code}")),
    }
}

/// Testo per MAPI: a capo come CRLF.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn crlf(s: &str) -> String {
    s.replace("\r\n", "\n").replace('\n', "\r\n")
}

/// Stringa UTF-16 terminata da zero, come vuole l'API «W».
#[cfg_attr(not(windows), allow(dead_code))]
pub fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(windows)]
pub mod mapi {
    //! Simple MAPI, versione Unicode (Windows 8 e successivi). Caricata a runtime da MAPI32.DLL: se manca, la pagina passa al mailto.
    use super::{crlf, wide};
    use std::ffi::c_void;
    use std::path::Path;

    #[repr(C)]
    pub struct MapiRecipDescW {
        pub ul_reserved: u32,
        pub ul_recip_class: u32,
        pub lpsz_name: *mut u16,
        pub lpsz_address: *mut u16,
        pub ul_eid_size: u32,
        pub lp_entry_id: *mut c_void,
    }
    #[repr(C)]
    pub struct MapiFileDescW {
        pub ul_reserved: u32,
        pub fl_flags: u32,
        pub n_position: u32,
        pub lpsz_path_name: *mut u16,
        pub lpsz_file_name: *mut u16,
        pub lp_file_type: *mut c_void,
    }
    #[repr(C)]
    pub struct MapiMessageW {
        pub ul_reserved: u32,
        pub lpsz_subject: *mut u16,
        pub lpsz_note_text: *mut u16,
        pub lpsz_message_type: *mut u16,
        pub lpsz_date_received: *mut u16,
        pub lpsz_conversation_id: *mut u16,
        pub fl_flags: u32,
        pub lp_originator: *mut MapiRecipDescW,
        pub n_recip_count: u32,
        pub lp_recips: *mut MapiRecipDescW,
        pub n_file_count: u32,
        pub lp_files: *mut MapiFileDescW,
    }
    pub const MAPI_TO: u32 = 1;
    pub const MAPI_LOGON_UI: u32 = 0x1;
    pub const MAPI_DIALOG: u32 = 0x8;
    type SendMailW = unsafe extern "system" fn(usize, usize, *mut MapiMessageW, u32, u32) -> u32;

    #[link(name = "kernel32")]
    extern "system" {
        fn LoadLibraryW(name: *const u16) -> *mut c_void;
        fn GetProcAddress(module: *mut c_void, name: *const u8) -> *mut c_void;
        fn FreeLibrary(module: *mut c_void) -> i32;
    }
    #[link(name = "ole32")]
    extern "system" {
        fn CoInitializeEx(reserved: *mut c_void, coinit: u32) -> i32;
        fn CoUninitialize();
    }

    /// C'è un `MAPISendMailW` da chiamare? (Non apre nulla.)
    pub fn available() -> bool {
        unsafe {
            let lib = LoadLibraryW(wide("MAPI32.DLL").as_ptr());
            if lib.is_null() {
                return false;
            }
            let f = GetProcAddress(lib, b"MAPISendMailW\0".as_ptr());
            FreeLibrary(lib);
            !f.is_null()
        }
    }

    /// Apre la finestra di composizione del programma di posta con destinatario, oggetto, corpo e allegato.
    /// Blocca finché la finestra è aperta: va chiamata da un thread proprio, mai da quello dell'interfaccia.
    pub fn send(to: &str, subject: &str, body: &str, attachment: Option<&Path>) -> Result<u32, String> {
        unsafe {
            let lib = LoadLibraryW(wide("MAPI32.DLL").as_ptr());
            if lib.is_null() {
                return Err("mapi-unavailable".into());
            }
            let f = GetProcAddress(lib, b"MAPISendMailW\0".as_ptr());
            if f.is_null() {
                FreeLibrary(lib);
                return Err("mapi-unavailable".into());
            }
            let send: SendMailW = std::mem::transmute(f);
            // i buffer restano vivi fino alla fine della chiamata
            let (mut w_name, mut w_addr) = (wide(to), wide(&format!("SMTP:{to}")));
            let (mut w_sub, mut w_body) = (wide(subject), wide(&crlf(body)));
            let mut recip = MapiRecipDescW {
                ul_reserved: 0,
                ul_recip_class: MAPI_TO,
                lpsz_name: w_name.as_mut_ptr(),
                lpsz_address: w_addr.as_mut_ptr(),
                ul_eid_size: 0,
                lp_entry_id: std::ptr::null_mut(),
            };
            let mut w_path = attachment.map(|p| wide(&p.to_string_lossy()));
            let mut w_file = attachment.map(|p| wide(&p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()));
            let mut file = MapiFileDescW {
                ul_reserved: 0,
                fl_flags: 0,
                n_position: u32::MAX,
                lpsz_path_name: w_path.as_mut().map(|v| v.as_mut_ptr()).unwrap_or(std::ptr::null_mut()),
                lpsz_file_name: w_file.as_mut().map(|v| v.as_mut_ptr()).unwrap_or(std::ptr::null_mut()),
                lp_file_type: std::ptr::null_mut(),
            };
            let mut msg = MapiMessageW {
                ul_reserved: 0,
                lpsz_subject: w_sub.as_mut_ptr(),
                lpsz_note_text: w_body.as_mut_ptr(),
                lpsz_message_type: std::ptr::null_mut(),
                lpsz_date_received: std::ptr::null_mut(),
                lpsz_conversation_id: std::ptr::null_mut(),
                fl_flags: 0,
                lp_originator: std::ptr::null_mut(),
                n_recip_count: 1,
                lp_recips: &mut recip,
                n_file_count: if attachment.is_some() { 1 } else { 0 },
                lp_files: if attachment.is_some() { &mut file } else { std::ptr::null_mut() },
            };
            // alcuni client (Outlook) usano COM: appartamento a thread singolo, come per un'interfaccia
            let co = CoInitializeEx(std::ptr::null_mut(), 0x2);
            let code = send(0, 0, &mut msg, MAPI_LOGON_UI | MAPI_DIALOG, 0);
            if co >= 0 {
                CoUninitialize();
            }
            FreeLibrary(lib);
            Ok(code)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shot_names_are_plain_png_names() {
        assert_eq!(safe_shot_name("Acchiappaspettri-segnalazione-2026-11-13-090507.png"), "Acchiappaspettri-segnalazione-2026-11-13-090507.png");
        for bad in ["../x.png", "a/b.png", "C:\\x.png", "x.exe", "x.png.exe", ".png", "a b.png", "x.tar.png"] {
            assert_eq!(safe_shot_name(bad), "Acchiappaspettri-segnalazione.png", "{bad}");
        }
    }
    #[test]
    fn shot_is_written_without_overwriting() {
        let dir = std::env::temp_dir().join(format!("acch-segnala-{}", std::process::id()));
        let png = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3];
        let a = write_shot(&dir, "s.png", &png).unwrap();
        let b = write_shot(&dir, "s.png", &png).unwrap();
        assert_eq!(a.file_name().unwrap(), "s.png");
        assert_eq!(b.file_name().unwrap(), "s-2.png");
        assert_eq!(std::fs::read(&b).unwrap(), png);
        assert!(write_shot(&dir, "t.png", b"GIF89a....").is_err());
        assert!(!dir.join("t.png").exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }
    #[test]
    fn mapi_codes_and_text() {
        assert_eq!(mapi_outcome(0), Ok("sent"));
        assert_eq!(mapi_outcome(1), Ok("aborted"));
        assert_eq!(mapi_outcome(3), Err("mapi-failed: 3".to_string()));
        assert_eq!(crlf("a\nb\r\nc"), "a\r\nb\r\nc");
        assert_eq!(wide("è"), vec![0xE8, 0]);
    }
    /// Solo su Windows: disposizione delle strutture come in MAPI.h (x64) e caricamento della DLL senza aprire nulla.
    #[cfg(all(windows, target_pointer_width = "64"))]
    #[test]
    fn mapi_layout_matches_mapi_h() {
        use std::mem::size_of;
        assert_eq!(size_of::<mapi::MapiRecipDescW>(), 40);
        assert_eq!(size_of::<mapi::MapiFileDescW>(), 40);
        assert_eq!(size_of::<mapi::MapiMessageW>(), 96);
        let _ = mapi::available();   // non deve andare in errore, ci sia o no un programma di posta
    }
}
