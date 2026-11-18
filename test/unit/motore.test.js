// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I5, motore senza Rust: core-worker.js caricato con tutti i moduli app/*-core.js della pagina (anche quelli aggiunti dopo) e core.js;
// il worker legge come la pagina; la risposta del Rust si usa solo se è quella giusta (byte, intestazione, sonda), altrimenti si torna al JS.
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), os=require('os'), vm=require('vm');
const ROOT=path.join(__dirname,'..','..'), X=require('../../scripts/core-extract.js'), D=require('./motore-dati.js');

test('core-worker.js: tutti i moduli app/*-core.js della pagina, poi core.js e app/worker.js; un modulo nuovo entra da solo', ()=>{
  const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8'), src=X.workerSource(html), mods=X.coreModules(html);
  assert.ok(mods.includes('app/read-core.js') && mods.includes('app/channels-core.js'));
  assert.ok(src.includes('importScripts('+mods.concat(['core.js']).map(m=>JSON.stringify(m)).join(', ')+');'), src);
  assert.ok(src.trim().endsWith('importScripts("app/worker.js");'));
  const more=html.replace('<script src="app/read-core.js"></script>','<script src="app/read-core.js"></script>\n<script src="app/mcr-core.js"></script>');
  assert.ok(X.workerSource(more).includes('"app/mcr-core.js"'), 'un modulo nuovo del nucleo deve entrare nel worker senza toccare il worker');
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'acch-dist-'));
  try{ const prep=require('../../scripts/prepare-desktop.js'), log=console.log; console.log=()=>{}; try{ prep.main(out); } finally { console.log=log; }
    assert.equal(fs.readFileSync(path.join(out,'core-worker.js'),'utf8'), src);
    for (const f of ['app/worker.js','app/engine.js','app/read-core.js','core.js']) assert.ok(fs.existsSync(path.join(out,f)), f);
    assert.ok(/<script src="app\/engine\.js"><\/script>/.test(fs.readFileSync(path.join(out,'index.html'),'utf8')));
  } finally { fs.rmSync(out,{recursive:true,force:true}); }
});

// il worker in Node: importScripts e postMessage finti, stessi file di dist-desktop
function worker(){ const html=fs.readFileSync(path.join(ROOT,'index.html')), sent=[];
  const ctx={console, TextDecoder, TextEncoder, postMessage:(m)=>sent.push(m)}; vm.createContext(ctx); vm.runInContext('var self=globalThis;', ctx);
  ctx.importScripts=(...L)=>{ for (const f of L) vm.runInContext(f==='core.js' ? X.extractCore(html).toString('utf8') : fs.readFileSync(path.join(ROOT,f),'utf8'), ctx, {filename:f}); };
  vm.runInContext(X.workerSource(html.toString('utf8')), ctx);
  return {ctx, ask(m){ sent.length=0; ctx.onmessage({data:m}); return sent[0]; }}; }
const ab=b=>b.buffer.slice(b.byteOffset, b.byteOffset+b.length);
// risposta wire costruita a mano, come la scrive acch-core (src-tauri/acch-core/src/lib.rs)
function wire(obj, arrays){ const nums=[], J=JSON.parse(JSON.stringify(obj)); for (const [k,v] of Object.entries(arrays||{})){ J[k]={$f:[nums.length, v.length]}; nums.push(...v); }
  const j=Buffer.from(JSON.stringify(J)), head=8+j.length, pad=(8-head%8)%8, out=Buffer.alloc(head+pad+8*nums.length); out.write('ACW1',0,'latin1'); out.writeUInt32LE(j.length,4); j.copy(out,8);
  nums.forEach((v,i)=>out.writeDoubleLE(v, head+pad+8*i)); return ab(out); }

test('worker: stessa lettura della pagina; risposta del Rust sbagliata o di un altro file → lettore JS, con il motivo', ()=>{
  const W=worker(), C=W.ctx, txt=fs.readFileSync(path.join(ROOT,'test','fixtures','canali','waters-2canali.arw'));
  const m=W.ask({id:1, op:'read', buf:ab(txt), name:'w.arw', opt:{}}); assert.ok(m.ok, m.err); assert.equal(m.engine, 'js');
  C.__a=[m.r, ab(txt)]; assert.equal(vm.runInContext('AcchRead.same(__a[0], AcchRead.read(__a[1], "w.arw", {}))', C), null);
  // byte diversi da quelli della pagina (file cambiato fra le due letture)
  const bad=W.ask({id:2, op:'read', buf:ab(txt), name:'w.arw', opt:{}, wire:wire({bytes:txt.length, fnv:1, kind:'arw', blocks:[]})}); assert.equal(bad.engine,'js'); assert.equal(bad.why,'bytes');
  const junk=W.ask({id:3, op:'read', buf:ab(txt), name:'w.arw', opt:{}, wire:new ArrayBuffer(16)}); assert.equal(junk.engine,'js'); assert.equal(junk.why,'wire');
  // file semplice: numeri del Rust diversi da quelli della sonda → si scartano
  const big=D.spectrum(5000), fnv=vm.runInContext('AcchRead.fnv', C)(ab(big)); C.__b=ab(big);
  const P=vm.runInContext('parseText(new TextDecoder().decode(__b))', C), xs=Array.from(P.xs), ys=Array.from(P.ys), text=big.toString('latin1'), L=text.split('\n');
  const probe=L.slice(0,1001).join('\n')+'\n'+L.slice(L.length-1001).join('\n');
  const good=W.ask({id:4, op:'read', buf:ab(big), name:'s.txt', opt:{}, wire:wire({bytes:big.length, fnv, kind:'simple', probe, headN:1000, tailN:1000}, {xs, ys})});
  assert.equal(good.engine,'rust', good.why); C.__a=[good.r, ab(big)]; assert.equal(vm.runInContext('AcchRead.same(__a[0], AcchRead.read(__a[1], "s.txt", {}))', C), null);
  const ys2=ys.slice(); ys2[3]+=1e-9;
  const wrong=W.ask({id:5, op:'read', buf:ab(big), name:'s.txt', opt:{}, wire:wire({bytes:big.length, fnv, kind:'simple', probe, headN:1000, tailN:1000}, {xs, ys:ys2})});
  assert.equal(wrong.engine,'js'); assert.equal(wrong.why,'probe-numbers');
  // ACCH_DUAL nel worker: differenza nel mezzo (fuori dalla sonda) scoperta, vale il JS
  const ys3=ys.slice(); ys3[2500]*=1+1e-15; if (ys3[2500]===ys[2500]) ys3[2500]=ys[2500]+1e-12;
  const dual=W.ask({id:6, op:'read', buf:ab(big), name:'s.txt', opt:{}, dual:true, wire:wire({bytes:big.length, fnv, kind:'simple', probe, headN:1000, tailN:1000}, {xs, ys:ys3})});
  assert.equal(dual.engine,'js'); assert.match(dual.dual, /ys\[2500\]/);
  const same=W.ask({id:7, op:'read', buf:ab(big), name:'s.txt', opt:{}, dual:true, wire:wire({bytes:big.length, fnv, kind:'simple', probe, headN:1000, tailN:1000}, {xs, ys})});
  assert.equal(same.engine,'rust'); assert.equal(same.dual,'identici');
  // una funzione del nucleo nel worker
  const fp=W.ask({id:8, op:'call', fn:'findPeaks', args:[P.xs, P.ys, 1, 2, 5]}); assert.ok(fp.ok && fp.r.length>=1, fp.err);
  const no=W.ask({id:9, op:'call', fn:'nonEsiste', args:[]}); assert.equal(no.ok, false);
});

test('index.html: addEntries legge con AcchRead (e AcchEngine nel desktop); textChannels sta in read-core.js', ()=>{
  const h=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
  assert.ok(/window\.AcchEngine \? await AcchEngine\.read\(buf, file\.name/.test(h));
  assert.ok(!/^function textChannels/m.test(h), 'una sola copia di textChannels');
  const i=h.indexOf('<script src="app/read-core.js"></script>'), c=h.indexOf('/*CORE-START*/'); assert.ok(i>0 && i<c, 'read-core.js prima del nucleo');
});
