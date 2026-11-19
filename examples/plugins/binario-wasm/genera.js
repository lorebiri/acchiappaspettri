// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Produce reader.wasm (il modulo di reader.wat, scritto istruzione per istruzione, senza compilatori) e il file d'esempio SINTETICO
// esempio-SINTETICO.awb con il suo risultato atteso. Uso: node examples/plugins/binario-wasm/genera.js (risultato sempre uguale).
'use strict';
const fs=require('fs'), path=require('path');
const uleb=n=>{ const o=[]; do { let b=n&0x7f; n>>>=7; if (n) b|=0x80; o.push(b); } while (n); return o; };
const sleb=n=>{ const o=[]; for (;;){ const b=n&0x7f; n>>=7; if ((n===0 && !(b&0x40)) || (n===-1 && (b&0x40))){ o.push(b); return o; } o.push(b|0x80); } };
const str=s=>{ const b=[...Buffer.from(s,'utf8')]; return [...uleb(b.length), ...b]; };
const vec=L=>[...uleb(L.length), ...L.flat()];
const section=(id, body)=>[id, ...uleb(body.length), ...body];
// istruzioni (valori: https://webassembly.github.io/spec/core/binary/instructions.html)
const I={get:i=>[0x20,...uleb(i)], set:i=>[0x21,...uleb(i)], c:v=>[0x41,...sleb(v)], add:[0x6a], sub:[0x6b], mul:[0x6c], and:[0x71], shl:[0x74], shr_u:[0x76],
  lt_u:[0x49], gt_u:[0x4b], ne:[0x47], eq:[0x46], load:o=>[0x28,2,...uleb(o)], store:o=>[0x36,2,...uleb(o)], load8:o=>[0x2d,0,...uleb(o)], store8:o=>[0x3a,0,...uleb(o)],
  f32load:o=>[0x2a,2,...uleb(o)], f64store:o=>[0x39,3,...uleb(o)], promote:[0xbb], msize:[0x3f,0], mgrow:[0x40,0], if:[0x04,0x40], else:[0x05], loop:[0x03,0x40], end:[0x0b], br:d=>[0x0c,...uleb(d)], ret:[0x0f]};
const J_OK=Buffer.from('{"channels":["Intensità"],"technique":"raman","meta":["Formato AWB1 (esempio WebAssembly)"]}','utf8');
const J_ERR=Buffer.from('{"error":"file troncato: mancano punti / truncated file"}','utf8');
const P=0, LEN=1, OUT=2, N=3, IX=4, Q=5;   // parametri e variabili locali di acch_read
// copia L byte da src (costante) a dst (indirizzo in una variabile locale + 4), con il contatore IX
const copy=(src, dstLocal, L)=>[I.c(0), I.set(IX), I.loop, I.get(IX), I.c(L), I.lt_u, I.if,
  I.get(dstLocal), I.get(IX), I.add, I.get(IX), I.load8(src), I.store8(4), I.get(IX), I.c(1), I.add, I.set(IX), I.br(1), I.end, I.end].flat();
const alloc=[I.get(0), I.c(3), I.mul, I.c(1088), I.add, I.c(16), I.shr_u, I.c(1), I.add, I.set(1),
  I.get(1), I.msize, I.gt_u, I.if, I.get(1), I.msize, I.sub, I.mgrow, I.c(-1), I.eq, I.if, I.c(-1), I.ret, I.end, I.end, I.c(1024)].flat();
const read=[
  I.get(P), I.get(LEN), I.add, I.c(7), I.add, I.c(-8), I.and, I.set(OUT),
  I.get(LEN), I.c(8), I.lt_u, I.if, I.get(OUT), I.c(1), I.store(0), I.get(OUT), I.ret, I.end,
  I.get(P), I.load(0), I.c(0x31425741), I.ne, I.if, I.get(OUT), I.c(1), I.store(0), I.get(OUT), I.ret, I.end,
  I.get(P), I.load(4), I.set(N),
  I.get(N), I.get(LEN), I.c(8), I.sub, I.c(3), I.shr_u, I.gt_u, I.if,
    I.get(OUT), I.c(2), I.store(0), I.get(OUT), I.c(0), I.store(4), I.get(OUT), I.c(0), I.store(8), I.get(OUT), I.c(J_ERR.length), I.store(12),
    I.get(OUT), I.c(12), I.add, I.set(Q), copy(512, Q, J_ERR.length), I.get(OUT), I.ret, I.end,
  I.get(OUT), I.c(0), I.store(0), I.get(OUT), I.c(1), I.store(4), I.get(OUT), I.get(N), I.store(8),
  I.c(0), I.set(IX), I.loop, I.get(IX), I.get(N), I.lt_u, I.if,
    I.get(OUT), I.get(IX), I.c(3), I.shl, I.add, I.get(P), I.get(IX), I.c(2), I.shl, I.add, I.f32load(8), I.promote, I.f64store(12),
    I.get(OUT), I.get(N), I.c(3), I.shl, I.add, I.get(IX), I.c(3), I.shl, I.add, I.get(P), I.get(N), I.c(2), I.shl, I.add, I.get(IX), I.c(2), I.shl, I.add, I.f32load(8), I.promote, I.f64store(12),
    I.get(IX), I.c(1), I.add, I.set(IX), I.br(1), I.end, I.end,
  I.get(OUT), I.c(12), I.add, I.get(N), I.c(4), I.shl, I.add, I.set(Q), I.get(Q), I.c(J_OK.length), I.store(0),
  copy(16, Q, J_OK.length), I.get(OUT)].flat();
const body=(locals, code)=>{ const b=[...vec(locals.map(([n,t])=>[...uleb(n), t])), ...code, 0x0b]; return [...uleb(b.length), ...b]; };
const mod=[0x00,0x61,0x73,0x6d, 0x01,0,0,0,
  ...section(1, vec([[0x60, ...vec([[0x7f]]), ...vec([[0x7f]])], [0x60, ...vec([[0x7f],[0x7f]]), ...vec([[0x7f]])]])),   // (i32)→i32, (i32,i32)→i32
  ...section(3, vec([[0],[1]])),
  ...section(5, vec([[0x01, ...uleb(1), ...uleb(256)]])),
  ...section(7, vec([[...str('memory'), 0x02, 0], [...str('acch_alloc'), 0x00, 0], [...str('acch_read'), 0x00, 1]])),
  ...section(10, vec([body([[1,0x7f]], alloc), body([[4,0x7f]], read)])),
  ...section(11, vec([[0x00, ...I.c(16), 0x0b, ...uleb(J_OK.length), ...J_OK], [0x00, ...I.c(512), 0x0b, ...uleb(J_ERR.length), ...J_ERR]]))];
const wasm=Buffer.from(mod);
if (!WebAssembly.validate(wasm)) throw new Error('modulo non valido');
const dir=__dirname; fs.writeFileSync(path.join(dir,'reader.wasm'), wasm);
// esempio SINTETICO: 12 punti Raman (spostamento in cm-1), intensità esatte in f32
const xs=Array.from({length:12},(_,i)=>200+100*i), ys=[10,12,15,40,120,300,180,60,25,14,11,10];
const f=Buffer.alloc(8+8*xs.length); f.write('AWB1',0,'ascii'); f.writeUInt32LE(xs.length,4); xs.forEach((v,i)=>f.writeFloatLE(v,8+4*i)); ys.forEach((v,i)=>f.writeFloatLE(v,8+4*xs.length+4*i));
fs.writeFileSync(path.join(dir,'esempio-SINTETICO.awb'), f);
fs.writeFileSync(path.join(dir,'esempio-SINTETICO.awb.atteso.json'), JSON.stringify({technique:'raman', channels:[{name:'Intensità', x:xs, y:ys}]})+'\n');
console.log('reader.wasm', wasm.length, 'byte; esempio-SINTETICO.awb', f.length, 'byte');
