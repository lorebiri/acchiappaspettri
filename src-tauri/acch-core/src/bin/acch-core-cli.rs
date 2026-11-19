// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
//! acch-core-cli: la stessa lettura dell'app, senza Tauri, per i test incrociati con il JS (test/unit/dual.test.js).
//! Uso: acch-core-cli <cartella-di-uscita> [--legacy] <file>...  → per ogni file scrive <uscita>/<n>.acw (formato wire)
//! e stampa una riga «n<TAB>tipo<TAB>millisecondi<TAB>file».
use std::time::Instant;
fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.is_empty() {
        eprintln!("uso: acch-core-cli <cartella-di-uscita> [--legacy] <file>...");
        std::process::exit(2);
    }
    // I7: acch-core-cli --calc <cartella-di-uscita> <richiesta>... → <uscita>/<n>.acw, la risposta di acch_calc (picchi, aree…)
    if args[0] == "--calc" && args.len() >= 2 {
        let out = std::path::PathBuf::from(&args[1]);
        std::fs::create_dir_all(&out).expect("cartella di uscita");
        let mut code = 0;
        for (i, f) in args[2..].iter().enumerate() {
            let b = std::fs::read(f).expect("richiesta");
            let t = Instant::now();
            match acch_core::calc::parse_req(&b) {
                Ok(r) => {
                    let w = acch_core::calc::run(&r).bytes();
                    let ms = t.elapsed().as_secs_f64() * 1000.0;
                    std::fs::write(out.join(format!("{i}.acw")), &w).expect("scrittura");
                    println!("{i}\t{}\t{ms:.3}\t{f}", r.name);
                }
                Err(e) => {
                    println!("{i}\terror:{e}\t0\t{f}");
                    code = 1;
                }
            }
        }
        std::process::exit(code);
    }
    // I7: acch-core-cli --zip <uscita.zip> <richiesta ACZ1> → l'archivio di acch_zip; stampa i millisecondi
    if args[0] == "--zip" && args.len() == 3 {
        let b = std::fs::read(&args[2]).expect("richiesta");
        let t = Instant::now();
        let z = acch_core::zip::parse(&b).and_then(|e| acch_core::zip::write(&e, &|| false, &mut |_, _| {}));
        match z {
            Ok(z) => {
                println!("{:.1}", t.elapsed().as_secs_f64() * 1000.0);
                std::fs::write(&args[1], z).expect("scrittura");
            }
            Err(e) => {
                println!("error:{e}");
                std::process::exit(1);
            }
        }
        return;
    }
    let out = std::path::PathBuf::from(&args[0]);
    std::fs::create_dir_all(&out).expect("cartella di uscita");
    let opt = acch_core::Opt { legacy: args.iter().any(|a| a == "--legacy") };
    let mut code = 0;
    for (i, f) in args[1..].iter().filter(|a| *a != "--legacy").enumerate() {
        let name = std::path::Path::new(f).file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
        let t = Instant::now();
        let res = std::fs::read(f).map_err(|e| e.to_string()).and_then(|b| acch_core::read(&b, &name, &opt, &|| false, &mut |_| {}));
        match res {
            Ok(w) => {
                let b = w.bytes();
                std::fs::write(out.join(format!("{i}.acw")), &b).expect("scrittura");
                let jl = u32::from_le_bytes([b[4], b[5], b[6], b[7]]) as usize;
                let json = String::from_utf8_lossy(&b[8..8 + jl.min(4000)]);
                let kind = json.split("\"kind\":\"").nth(1).and_then(|s| s.split('"').next()).unwrap_or("?").to_string();
                println!("{i}\t{kind}\t{:.1}\t{f}", t.elapsed().as_secs_f64() * 1000.0);
            }
            Err(e) => {
                println!("{i}\terror:{e}\t0\t{f}");
                code = 1;
            }
        }
    }
    std::process::exit(code);
}
