;; SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
;; SPDX-License-Identifier: GPL-3.0-or-later
;; Estensione d'esempio in WebAssembly: formato binario «AWB1» inventato per l'esempio (docs/ESTENSIONI.md).
;;   byte 0-3 «AWB1», byte 4-7 n (u32 little-endian), poi n valori x (f32) e n valori y (f32).
;; Questo è il sorgente leggibile: il binario reader.wasm lo produce genera.js, istruzione per istruzione, senza altri strumenti.
(module
  (memory (export "memory") 1 256)                 ;; da 64 KiB a 16 MiB: il massimo dichiarato è obbligatorio
  (data (i32.const 16) "{\"channels\":[\"Intensità\"],\"technique\":\"raman\",\"meta\":[\"Formato AWB1 (esempio WebAssembly)\"]}")
  (data (i32.const 512) "{\"error\":\"file troncato: mancano punti / truncated file\"}")
  ;; l'ingresso va sempre a 1024; la memoria cresce quanto basta per ingresso e risultato
  (func (export "acch_alloc") (param $len i32) (result i32) (local $need i32)
    (local.set $need (i32.add (i32.shr_u (i32.add (i32.mul (local.get $len) (i32.const 3)) (i32.const 1088)) (i32.const 16)) (i32.const 1)))
    (if (i32.gt_u (local.get $need) (memory.size))
      (then (if (i32.eq (memory.grow (i32.sub (local.get $need) (memory.size))) (i32.const -1)) (then (return (i32.const -1))))))
    (i32.const 1024))
  ;; risultato dopo l'ingresso: stato, canali, punti, x[], y[], lunghezza del JSON, JSON
  (func (export "acch_read") (param $p i32) (param $len i32) (result i32) (local $out i32) (local $n i32) (local $i i32) (local $q i32)
    (local.set $out (i32.and (i32.add (i32.add (local.get $p) (local.get $len)) (i32.const 7)) (i32.const -8)))
    (if (i32.lt_u (local.get $len) (i32.const 8)) (then (i32.store (local.get $out) (i32.const 1)) (return (local.get $out))))
    (if (i32.ne (i32.load (local.get $p)) (i32.const 0x31425741)) (then (i32.store (local.get $out) (i32.const 1)) (return (local.get $out))))
    (local.set $n (i32.load offset=4 (local.get $p)))
    (if (i32.gt_u (local.get $n) (i32.shr_u (i32.sub (local.get $len) (i32.const 8)) (i32.const 3)))
      (then (i32.store (local.get $out) (i32.const 2)) (i32.store offset=4 (local.get $out) (i32.const 0)) (i32.store offset=8 (local.get $out) (i32.const 0))
            (i32.store offset=12 (local.get $out) (i32.const 57)) ;; poi copia del testo da 512 a out+16 (ciclo di byte)
            (return (local.get $out))))
    (i32.store (local.get $out) (i32.const 0)) (i32.store offset=4 (local.get $out) (i32.const 1)) (i32.store offset=8 (local.get $out) (local.get $n))
    ;; x[i] = f32 → f64, y[i] = f32 → f64
    (loop $l (if (i32.lt_u (local.get $i) (local.get $n)) (then
      (f64.store offset=12 (i32.add (local.get $out) (i32.shl (local.get $i) (i32.const 3))) (f64.promote_f32 (f32.load offset=8 (i32.add (local.get $p) (i32.shl (local.get $i) (i32.const 2))))))
      (f64.store offset=12 (i32.add (i32.add (local.get $out) (i32.shl (local.get $n) (i32.const 3))) (i32.shl (local.get $i) (i32.const 3)))
                 (f64.promote_f32 (f32.load offset=8 (i32.add (i32.add (local.get $p) (i32.shl (local.get $n) (i32.const 2))) (i32.shl (local.get $i) (i32.const 2))))))
      (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $l))))
    (local.set $q (i32.add (i32.add (local.get $out) (i32.const 12)) (i32.shl (local.get $n) (i32.const 4))))
    (i32.store (local.get $q) (i32.const 93))   ;; poi copia del JSON da 16 a q+4 (ciclo di byte)
    (local.get $out)))
