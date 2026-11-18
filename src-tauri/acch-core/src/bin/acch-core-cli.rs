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
    // I10: acch-core-cli --cube <uscita.acw> <tipo> <file> [<intestazione ENVI>] [--ops <file>] [--disk]
    // → il cubo letto (dimensioni, assi, dati in f64) e i calcoli elencati in <file>, una riga ciascuno:
    // «area|height|peak a b base», «ratio a b a2 b2 base», «intensity at», «roi x0 y0 x1 y1», «bin f», «pixel ix iy».
    // --disk: il cubo .wdf resta sul file (lettura a pezzi, come per i cubi grandi del desktop). Stampa i millisecondi.
    if args[0] == "--cube" && args.len() >= 4 {
        std::process::exit(cube_cli(&args[1..]));
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

fn cube_cli(a: &[String]) -> i32 {
    use acch_core::cube;
    let (out, kind, main) = (&a[0], &a[1], &a[2]);
    let mut hdr: Option<String> = None;
    let mut ops: Vec<String> = Vec::new();
    let mut disk = false;
    let mut i = 3;
    while i < a.len() {
        match a[i].as_str() {
            "--ops" => {
                ops = std::fs::read_to_string(&a[i + 1]).expect("calcoli").lines().map(|s| s.to_string()).filter(|s| !s.trim().is_empty()).collect();
                i += 2;
            }
            "--disk" => {
                disk = true;
                i += 1;
            }
            p => {
                hdr = Some(String::from_utf8_lossy(&std::fs::read(p).expect("intestazione")).into_owned());
                i += 1;
            }
        }
    }
    let t = Instant::now();
    let bytes = std::fs::read(main).expect("file");
    let file = if disk { Some(std::path::Path::new(main)) } else { None };
    let mut w = acch_core::Wire::new_pub();
    let res = cube::read(kind, &bytes, hdr.as_deref(), file);
    let r = match res {
        Err(e) => {
            w.raw_pub("{").key_pub("error").str_pub(&e.0).raw_pub("}");
            None
        }
        Ok(None) => {
            w.raw_pub("{").key_pub("none").raw_pub("true}");
            None
        }
        Ok(Some(c)) => Some(c),
    };
    if let Some(c) = r {
        w.raw_pub("{");
        cube::wire_head(&mut w, &c, true).expect("dati");
        w.key_pub("results").raw_pub("[");
        for (k, line) in ops.iter().enumerate() {
            if k > 0 {
                w.raw_pub(",");
            }
            let f: Vec<&str> = line.split_whitespace().collect();
            let n = |j: usize| f[j].parse::<f64>().unwrap();
            w.raw_pub("{");
            match f[0] {
                "roi" => match cube::roi_mean(&c, Some((n(1) as i64, n(2) as i64, n(3) as i64, n(4) as i64)), &[]) {
                    Ok((m, cnt)) => {
                        w.key_pub("n").num_pub(cnt).key_pub("mean").arr_pub(&m);
                    }
                    Err(e) => {
                        w.key_pub("error").str_pub(&e.0);
                    }
                },
                "bin" => match cube::bin(&c, n(1) as usize, &|| false) {
                    Ok(b) => {
                        cube::wire_head(&mut w, &b, true).expect("dati");
                    }
                    Err(e) => {
                        w.key_pub("error").str_pub(&e.0);
                    }
                },
                "pixel" => {
                    let mut s = vec![0.0; c.nc];
                    c.pixel(n(2) as usize * c.nx + n(1) as usize, &mut s).expect("pixel");
                    w.key_pub("spectrum").arr_pub(&s);
                }
                k => {
                    let op = match k {
                        "intensity" => cube::Op { kind: k.into(), a: 0.0, b: 0.0, a2: 0.0, b2: 0.0, at: n(1), base: "none".into() },
                        "ratio" => cube::Op { kind: k.into(), a: n(1), b: n(2), a2: n(3), b2: n(4), at: 0.0, base: f[5].into() },
                        _ => cube::Op { kind: k.into(), a: n(1), b: n(2), a2: 0.0, b2: 0.0, at: 0.0, base: f[3].into() },
                    };
                    match cube::band_image(&c, &op, &|| false, &mut |_| {}) {
                        Ok(img) => {
                            w.key_pub("image").arr_pub(&img);
                        }
                        Err(e) => {
                            w.key_pub("error").str_pub(&e.0);
                        }
                    }
                }
            }
            w.raw_pub("}");
        }
        w.raw_pub("]}");
    }
    std::fs::write(out, w.bytes()).expect("scrittura");
    println!("{:.1}", t.elapsed().as_secs_f64() * 1000.0);
    0
}
