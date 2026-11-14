// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I5, motore del desktop: le letture girano nel worker del nucleo (core-worker.js) e danno lo stesso risultato della pagina;
// con il lettore Rust (risposte vere di acch-core-cli) il risultato è identico; se il Rust dà errore o una risposta che non torna
// si legge con il JS e lo si scrive nel registro; ACCH_DUAL scopre una differenza che la sonda non vede; la finestra non si blocca
// oltre 50 ms durante la lettura di 1M punti; «Annulla la lettura»; trascinamento nativo senza copie; l'online resta com'era.
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), os=require('os'), {execFileSync}=require('child_process');
const B=require('./browser.js'), {openDesk}=require('./tauri-mock.js'), D=require('../unit/motore-dati.js');
const ROOT=path.join(__dirname,'..','..'), TAURI=path.join(ROOT,'src-tauri');

// file serviti alla pagina da /__dati/<nome> (niente base64 per decine di MB)
const DATA=new Map();
const add=(name, buf)=>{ DATA.set(name, Buffer.from(buf)); return name; };
for (const rel of ['canali/STD1.D/DAD1A.ch','canali/waters-2canali.arw','canali/shimadzu-2canali.txt']) add(path.basename(rel), fs.readFileSync(path.join(ROOT,'test','fixtures',rel)));
for (const [n,b] of Object.entries(D.files())) if (!/50MB/.test(n)) add(n, b);
add('dad.uv', D.uv(3000)); add('medio.txt', D.spectrum(30000)); add('shimadzu-2x1M.txt', D.shimadzu(1e6, ['Detector A-Ch1','Detector B-Ch1']));
add('corpus.txt', fs.readFileSync(path.join(ROOT,'test','corpus','generale','ft_A.csv')));
// risposte vere del lettore Rust (acch-core-cli), se cargo c'è
let WIRES=null;
function wires(){ if (WIRES) return WIRES; WIRES=new Map();
  try{ execFileSync('cargo',['build','--release','-q','-p','acch-core','--bin','acch-core-cli'],{cwd:TAURI, stdio:'ignore'}); }catch(e){ return WIRES; }
  const exe=path.join(TAURI,'target','release','acch-core-cli'+(process.platform==='win32'?'.exe':'')), tmp=fs.mkdtempSync(path.join(os.tmpdir(),'acch-i5-'));
  try{ const names=[...DATA.keys()], inp=names.map(n=>{ const p=path.join(tmp,n); fs.writeFileSync(p, DATA.get(n)); return p; }); execFileSync(exe,[path.join(tmp,'out')].concat(inp));
    names.forEach((n,i)=>WIRES.set(n, fs.readFileSync(path.join(tmp,'out',i+'.acw')))); }
  finally{ fs.rmSync(tmp,{recursive:true,force:true}); }
  return WIRES; }

async function page(br, server, desk){ const o=desk ? await openDesk(B, br, server) : await B.openPage(br, server);
  await o.p.route('**/__dati/**', r=>{ const n=decodeURIComponent(r.request().url().split('/__dati/')[1]); const b=DATA.get(n)||(n.startsWith('wire/')&&WIRES&&WIRES.get(n.slice(5))); return b ? r.fulfill({body:b, contentType:'application/octet-stream'}) : r.fulfill({status:404, body:''}); });
  await o.p.evaluate(()=>{ window.I5={ get:n=>fetch('/__dati/'+encodeURIComponent(n)).then(r=>{ if (!r.ok) throw new Error('404 '+n); return r.arrayBuffer(); }),
    // il lettore Rust finto risponde con la risposta vera di acch-core-cli per quel file
    rustFromCli(){ __mock.engine={rust:true, dual:false}; __mock.rustRead=async(body, h)=>{ const n=decodeURIComponent(h['x-acch-name']); const r=await fetch('/__dati/wire/'+encodeURIComponent(n)); if (!r.ok) throw 'decline-test'; return await r.arrayBuffer(); }; },
    longTasks(){ const L=[]; const ob=new PerformanceObserver(l=>l.getEntries().forEach(e=>L.push(Math.round(e.duration)))); ob.observe({type:'longtask'}); return ()=>{ ob.disconnect(); return L; }; },
    log(){ return AcchSegnalaCore.log.list().map(e=>e.msg); } }; });
  return o; }

let server, br;
test.before(async()=>{ server=await B.startServer(); br=await B.launch(); });
test.after(async()=>{ await br.close(); server.close(); });

test('desktop: ogni lettura passa dal worker del nucleo e dà lo stesso risultato della pagina, bit per bit', async()=>{
  const o=await page(br, server, true);
  const r=await o.p.evaluate(async names=>{ const out=[]; for (const n of names){ const b=await I5.get(n); const A=await AcchEngine.read(b.slice(0), n, {}), J=AcchRead.read(b.slice(0), n, {}); out.push([n, A.kind, AcchRead.same(A,J)]); }
    const m=await AcchEngine.call('findPeaks', Float64Array.from([0,1,2,3,4,5,6,7,8,9,10,11]), Float64Array.from([0,0,1,3,9,3,1,0,0,0,0,0]), 1, 2, 5);
    return {out, stats:AcchEngine.stats, call:m.length, ok:AcchRead.same({kind:'x', v:m},{kind:'x', v:findPeaks(Float64Array.from([0,1,2,3,4,5,6,7,8,9,10,11]), Float64Array.from([0,0,1,3,9,3,1,0,0,0,0,0]), 1, 2, 5)})}; }, ['DAD1A.ch','waters-2canali.arw','shimadzu-2canali.txt','dad.uv','corpus.txt','grande-1M.txt']);
  for (const [n,k,d] of r.out) assert.equal(d, null, n+' ('+k+'): '+d);
  assert.equal(r.stats.worker, 6, JSON.stringify(r.stats)); assert.equal(r.stats.main, 0);
  assert.equal(r.ok, null, 'una funzione del nucleo nel worker dà lo stesso risultato');
  // il confronto vede davvero una differenza
  assert.ok(await o.p.evaluate(()=>AcchRead.same({kind:'p', p:{xs:Float64Array.from([1,2])}}, {kind:'p', p:{xs:Float64Array.from([1,2.0000000000000004])}})));
  assert.deepEqual(o.errors, []); await o.ctx.close();
});

test('lettore Rust (risposte vere di acch-core-cli): letto dal Rust, stesso risultato del JS, byte presi dal percorso se c\'è', async t=>{
  if (!wires().size){ t.skip('cargo non disponibile'); return; }
  const o=await page(br, server, true);
  const r=await o.p.evaluate(async names=>{ I5.rustFromCli(); const out=[]; for (const n of names){ const b=await I5.get(n); const A=await AcchEngine.read(b.slice(0), n, {}, {acchPath:'/dati/'+n}), J=AcchRead.read(b.slice(0), n, {}); out.push([n, A.kind, AcchRead.same(A,J), AcchEngine.stats.last.engine]); }
    const calls=__mock.calls.filter(c=>c.cmd==='acch_read').map(c=>c.args);
    // .uv: più veloce nel worker JS (misure I5), il Rust non si chiama
    const u=await I5.get('dad.uv'), U=await AcchEngine.read(u.slice(0),'dad.uv',{}); const uv=[AcchRead.same(U, AcchRead.read(u.slice(0),'dad.uv',{})), AcchEngine.stats.last.engine, __mock.calls.filter(c=>c.cmd==='acch_read').length===calls.length];
    return {out, stats:AcchEngine.stats, calls, uv}; }, ['DAD1A.ch','waters-2canali.arw','shimadzu-2canali.txt','grande-1M.txt','grande-1M-decrescente.csv']);
  for (const [n,k,d,e] of r.out){ assert.equal(d, null, n+' ('+k+'): '+d); assert.equal(e, 'rust', n+' non letto dal Rust'); }
  assert.ok(r.calls.every(c=>c.path && c.path.startsWith('/dati/') && c.size===0), 'i byte non passano dalla pagina: '+JSON.stringify(r.calls.slice(0,2)));
  assert.deepEqual(r.uv, [null, 'js', true], '.uv letto nel worker JS, senza chiamare il Rust');
  assert.equal(r.stats.rustErrors, 0); await o.ctx.close();
});

test('Rust in errore o risposta che non torna: si legge con il JS e lo si scrive nel registro', async t=>{
  const o=await page(br, server, true);
  const r=await o.p.evaluate(async()=>{ __mock.engine={rust:true, dual:false}; __mock.rustRead=async()=>{ throw 'read-failed: panico simulato'; };
    const b=await I5.get('DAD1A.ch'); await addEntries([{file:new File([b],'DAD1A.ch'), path:'DAD1A.ch'}]);
    const one={files:files.length, log:I5.log().filter(m=>/\[motore\]/.test(m))};
    // risposta di un altro file (byte diversi): scartata
    __mock.rustRead=async()=>{ const w=await fetch('/__dati/wire/corpus.txt'); if (!w.ok) throw 'nessuna'; return await w.arrayBuffer(); };
    const b2=await I5.get('waters-2canali.arw'); const A=await AcchEngine.read(b2.slice(0),'waters-2canali.arw',{}), J=AcchRead.read(b2.slice(0),'waters-2canali.arw',{});
    return {one, same:AcchRead.same(A,J), last:AcchEngine.stats.last, stats:AcchEngine.stats}; });
  assert.equal(r.one.files, 1, 'il file è stato letto lo stesso');
  assert.ok(r.one.log.some(m=>/lettore Rust non riuscito/.test(m)), 'avviso nel registro: '+JSON.stringify(r.one.log));
  assert.equal(r.same, null); assert.equal(r.last.engine, 'js');
  if (wires().size) assert.equal(r.last.why, 'bytes', 'risposta di un altro file riconosciuta');
  assert.deepEqual(o.errors, []); await o.ctx.close();
});

test('ACCH_DUAL: una differenza nel mezzo del file (fuori dalla sonda) si scopre e vale il JS', async t=>{
  if (!wires().size){ t.skip('cargo non disponibile'); return; }
  const o=await page(br, server, true);
  const r=await o.p.evaluate(async()=>{ __mock.engine={rust:true, dual:true};
    __mock.rustRead=async()=>{ const ab=await (await fetch('/__dati/wire/grande-1M.txt')).arrayBuffer(), dv=new DataView(ab), jl=dv.getUint32(4,true), off=8+jl+((8-(8+jl)%8)%8);
      dv.setFloat64(off+8*500000, dv.getFloat64(off+8*500000,true)*(1+1e-15), true); return ab; };   // un X nel mezzo cambia dell'ultimo bit circa
    const b=await I5.get('grande-1M.txt'); const A=await AcchEngine.read(b.slice(0),'grande-1M.txt',{}), J=AcchRead.read(b.slice(0),'grande-1M.txt',{});
    // senza la differenza: identici
    I5.rustFromCli(); __mock.engine={rust:true, dual:true}; await AcchEngine.read(b.slice(0),'grande-1M.txt',{});
    return {same:AcchRead.same(A,J), stats:AcchEngine.stats, log:I5.log().filter(m=>/ACCH_DUAL/.test(m))}; });
  assert.equal(r.same, null, 'con una differenza la pagina riceve il risultato del JS');
  assert.equal(r.stats.dualDiff, 1, JSON.stringify(r.stats)); assert.equal(r.stats.dualSame, 1);
  assert.ok(r.log.length===1 && /xs\[500000\]/.test(r.log[0]), JSON.stringify(r.log));
  await o.ctx.close();
});

test('lettura di 1M punti nel worker: la finestra non si blocca oltre 50 ms', async()=>{
  const o=await page(br, server, true);
  const r=await o.p.evaluate(async()=>{ const b=await I5.get('grande-1M.txt'); await AcchEngine.read(new ArrayBuffer(8),'riscalda.txt',{});
    const stop=I5.longTasks(); let ticks=0, worst=0, last=performance.now(); const iv=setInterval(()=>{ const t=performance.now(); worst=Math.max(worst,t-last); last=t; ticks++; }, 10);
    const t0=performance.now(), A=await AcchEngine.read(b, 'grande-1M.txt', {}), ms=performance.now()-t0; clearInterval(iv); await new Promise(r=>setTimeout(r,100));
    return {ms, n:A.p.xs.length, long:stop(), worst, ticks}; });
  assert.equal(r.n, 1e6);
  assert.ok(r.long.every(d=>d<=50), 'blocchi oltre 50 ms: '+JSON.stringify(r.long)+' (lettura '+Math.round(r.ms)+' ms)');
  assert.ok(r.worst<=60, 'il timer da 10 ms ha aspettato '+Math.round(r.worst)+' ms');
  await o.ctx.close();
});

test('1M punti dal caricamento al grafico disegnato in ≤ 5 s; il controllo del dato arriva dopo il grafico', async()=>{
  const o=await page(br, server, true);
  const r=await o.p.evaluate(async()=>{ const b=await I5.get('grande-1M.txt'); await AcchEngine.read(new ArrayBuffer(8),'riscalda.txt',{});
    let drawn=0; const od=window.drawPlot; window.drawPlot=function(){ const x=od.apply(this,arguments); if (!drawn) drawn=performance.now(); return x; };
    const t0=performance.now(), add=addEntries([{file:new File([b],'grande.txt'), path:'grande.txt'}]);
    const done=await Promise.race([add.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))))), new Promise(r=>setTimeout(()=>r(false), 60000))]);
    const ms=performance.now()-t0, early=QBAD.has(files[0]&&files[0].id);
    for (let i=0;i<200 && !(files[0] && QBAD.has(files[0].id));i++) await new Promise(r=>setTimeout(r,50));
    return {done, ms, drawn:drawn-t0, early, later:!!(files[0] && QBAD.has(files[0].id)), n:files[0]&&files[0].xs.length}; });
  assert.ok(r.done, 'oltre 60 s'); assert.equal(r.n, 1e6);
  assert.ok(r.ms<=5000, 'dal caricamento al grafico '+Math.round(r.ms)+' ms (primo disegno a '+Math.round(r.drawn)+' ms)');
  assert.equal(r.early, false, 'il controllo del dato non deve stare prima del grafico'); assert.ok(r.later, 'controllo del dato fatto dopo');
  await o.ctx.close();
});

test('dopo il grafico nessun blocco oltre 50 ms (API dei long task, Chromium come WebView2): il controllo del dato va al worker e dà lo stesso risultato', async()=>{
  const o=await page(br, server, true);
  for (const n of ['grande-1M.txt','shimadzu-2x1M.txt']){
    const r=await o.p.evaluate(async n=>{ files.length=0; QBAD.clear(); const b=await I5.get(n); await AcchEngine.read(new ArrayBuffer(8),'riscalda.txt',{});
      const L=[]; const ob=new PerformanceObserver(l=>l.getEntries().forEach(e=>L.push({t:e.startTime, d:e.duration}))); ob.observe({type:'longtask'});
      await addEntries([{file:new File([b],n), path:n}]); await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); const tg=performance.now();
      for (let i=0;i<600 && !files.every(f=>QBAD.has(f.id));i++) await new Promise(r=>setTimeout(r,50));
      await new Promise(r=>setTimeout(r,300)); ob.disconnect(); const done=files.every(f=>QBAD.has(f.id));
      const asyncBad=files.map(f=>QBAD.get(f.id).bad); QBAD.clear(); const syncBad=files.map(f=>badItems(f));
      return {n:files.length, done, after:L.filter(x=>x.t>=tg).map(x=>Math.round(x.d)), same:JSON.stringify(asyncBad)===JSON.stringify(syncBad)}; }, n);
    assert.ok(r.done, n+': controllo del dato non finito');
    assert.deepEqual(r.after.filter(d=>d>50), [], n+': blocchi dopo il grafico '+JSON.stringify(r.after));
    assert.ok(r.same, n+': il controllo fatto nel worker deve essere identico a quello sincrono'); }
  await o.ctx.close();
});

test('«Annulla la lettura»: il file in corso e quelli rimasti del lotto non si leggono', async()=>{
  const o=await page(br, server, true);
  const r=await o.p.evaluate(async()=>{ const b=await I5.get('grande-1M.txt'), c=await I5.get('grande-1M-decrescente.csv');
    const pr=addEntries([{file:new File([b],'a.txt'), path:'a.txt'},{file:new File([c],'b.csv'), path:'b.csv'}]);
    for (let i=0;i<200 && !(document.getElementById('ldCancel') && !document.getElementById('ldCancel').hidden);i++) await new Promise(r=>setTimeout(r,25));
    const shown=!!document.getElementById('ldCancel') && !document.getElementById('ldCancel').hidden, label=shown?document.getElementById('ldCancel').textContent:'';
    if (shown) document.getElementById('ldCancel').click(); await pr;
    const after=await AcchEngine.read(await I5.get('corpus.txt'),'corpus.txt',{});   // il lotto dopo riparte
    return {shown, label, files:files.length, note:$('#skipNote').innerText, after:after.kind}; });
  assert.ok(r.shown, 'pulsante mostrato durante una lettura lunga'); assert.equal(r.label, 'Annulla la lettura');
  assert.equal(r.files, 0); assert.match(r.note, /Lettura annullata: 2 file non letti/);
  assert.notEqual(r.after, 'cancelled');
  await o.ctx.close();
});

test('trascinamento nativo: file e cartelle senza copie in File, con il percorso per il lettore Rust', async t=>{
  const o=await page(br, server, true);
  const r=await o.p.evaluate(async()=>{ const b=new Uint8Array(await I5.get('waters-2canali.arw')), c=new Uint8Array(await I5.get('medio.txt'));
    __mock.files['/d/cartella/w.arw']=b; __mock.files['/d/cartella/sotto/g.txt']=c;
    let seen=[]; const orig=window.addEntries; window.addEntries=ents=>{ seen=ents.map(e=>({name:e.file.name, isFile:e.file instanceof File, path:e.file.acchPath||null, size:e.file.size})); return orig(ents); };
    __mock.emit('acch-dropped', [{path:'/d/cartella/w.arw', name:'w.arw', rel:'cartella/w.arw'},{path:'/d/cartella/sotto/g.txt', name:'g.txt', rel:'cartella/sotto/g.txt'}]);
    for (let i=0;i<400 && files.length<3;i++) await new Promise(r=>setTimeout(r,25)); window.addEntries=orig;
    return {seen, files:files.map(f=>f.path+' '+(f.channel||'')+' '+f.xs.length)}; });
  assert.deepEqual(r.seen.map(s=>[s.name, s.isFile, s.path]), [['w.arw',false,'/d/cartella/w.arw'],['g.txt',false,'/d/cartella/sotto/g.txt']]);
  assert.ok(r.files.includes('cartella/sotto/g.txt  30000'), JSON.stringify(r.files));
  assert.equal(r.files.filter(f=>f.startsWith('cartella/w.arw')).length, 2, JSON.stringify(r.files));
  assert.deepEqual(o.errors, []); await o.ctx.close();
});

test('online: niente worker né Rust, la lettura resta nella pagina come prima', async()=>{
  const o=await page(br, server, false);
  const r=await o.p.evaluate(async()=>{ const b=await I5.get('waters-2canali.arw'); await addEntries([{file:new File([b],'w.arw'), path:'w.arw'}]); return {engine:typeof window.AcchEngine, read:typeof AcchRead.read, files:files.length}; });
  assert.deepEqual(r, {engine:'undefined', read:'function', files:2});
  assert.deepEqual(o.errors, []); await o.ctx.close();
});
