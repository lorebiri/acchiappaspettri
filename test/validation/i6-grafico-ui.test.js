// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I6, grafico veloce (dati SINTETICI, test/validation/grafico-dati.js):
// - le esportazioni PNG e SVG sono identiche byte per byte con e senza l'indice min/max (app/plot-index.js), e l'indice si usa davvero;
// - G3: a schermo (WebGL e ripiego Canvas 2D) le cime sono quelle del disegno pieno (tutti i punti), colonna per colonna, alle risoluzioni
//   di prova, e i picchi stretti di un punto ci sono tutti;
// - G1/G2 nel browser: 20 spettri da 1M punti, primo disegno del confronto ≤ 3 s; costo di ogni ridisegno proporzionale alle colonne
//   (contato, non cronometrato); i tempi (≥ 50 fps, nessun ridisegno oltre 50 ms) si controllano qui solo se il Mac non è sovraccarico,
//   altrimenti NON VERIFICATO nel registro: valgono le misure dell'app vera (scripts/misura-motore.js --grafico-g).
// - nell'online niente WebGL: il grafico resta su un solo canvas.
'use strict';
const test=require('node:test'), assert=require('node:assert'), os=require('os');
const B=require('./browser.js'), {openDesk}=require('./tauri-mock.js'), {I6_SETUP}=require('./grafico-dati.js');

let server, br;
test.before(async()=>{ server=await B.startServer(); br=await B.launch(); });
test.after(async()=>{ await br.close(); server.close(); });
async function desk(){ const o=await openDesk(B, br, server); await o.p.evaluate(I6_SETUP); return o; }

test('esportazioni PNG e SVG identiche con e senza l\'indice min/max (spettro, riquadro ingrandito, confronto); l\'indice si usa', async()=>{
  const o=await desk();
  const r=await o.p.evaluate(async()=>{ const L=await I6.load(3, 300000); const f=L[0];
    const views=()=>{ const v=viewOf(f); v.title='Uno'; const w=viewOf(f); w.inset={x:[1400,2700], y:[0,1], auto:true}; const c=overlayView(f.instr, L, 'stack', 1.1, 'Confronto'); const c2=overlayView(f.instr, L, 'over', 1.1, 'Confronto'); return [v,w,c,c2]; };
    const out=V=>V.map(v=>[renderSvg(Object.assign({},v), 160, 100, 9), renderCanvas(Object.assign({},v), 160, 100, 150, 9).toDataURL(), renderCanvas(Object.assign({},v), 80, 50, 600, 9).toDataURL()]);
    const b0=AcchPlot.info().groups; const fast=out(views()), used=AcchPlot.info().groups-b0;
    const keep=window.AcchPlot; window.AcchPlot=undefined; let slow; try{ slow=out(views()); } finally { window.AcchPlot=keep; }
    return {same:fast.map((a,i)=>a.map((x,j)=>x===slow[i][j])), used, len:fast[0][0].length}; });
  assert.ok(r.used>1000, 'l\'indice min/max deve essere usato nelle esportazioni: gruppi '+r.used);
  assert.deepEqual(r.same, [[true,true,true],[true,true,true],[true,true,true],[true,true,true]], 'SVG, PNG 150 dpi, PNG 600 dpi');
  assert.ok(r.len>10000);
  assert.deepEqual(o.errors, []); await o.ctx.close();
});

test('G3: a schermo (WebGL e Canvas 2D) le cime di ogni colonna sono quelle del disegno pieno, alle risoluzioni di prova; nessun picco stretto si perde', async()=>{
  const o=await desk();
  const r=await o.p.evaluate(()=>I6.g3());
  const nv=r.find(x=>x.gl==='ingenua'); assert.ok(nv && (nv.spk>3 || nv.worst>3), 'la prova deve scoprire un disegno che perde i picchi: '+JSON.stringify(nv));
  for (const x of r.filter(x=>x.gl!=='ingenua')){ if (x.skip){ console.log('NON VERIFICATO WebGL a '+x.cw+' px: '+x.skip); continue; }
    assert.equal(x.miss, 0, JSON.stringify(x)+': colonne con traccia diverse');
    assert.ok(x.worst<=1, JSON.stringify(x)+': cima o fondo di una colonna oltre 1 px dal disegno pieno');
    assert.ok(x.spk<=1, JSON.stringify(x)+': cima di un picco stretto oltre 1 px'); }
  assert.ok(r.some(x=>x.gl && !x.skip), 'WebGL provato almeno a una risoluzione');
  assert.deepEqual(o.errors, []); await o.ctx.close();
});

test('G1/G2 nel browser: 20 spettri da 1M punti; primo disegno del confronto ≤ 3 s; ridisegni proporzionali alle colonne; tempi se il Mac lo permette', async t=>{
  const o=await desk();
  const r=await o.p.evaluate(()=>I6.g12(20, 1e6));
  console.log('I6 G1/G2 (browser): '+JSON.stringify(r)+' carico '+os.loadavg()[0].toFixed(1));
  assert.ok(r.g2<=3000, 'G2: primo disegno del confronto 20×1M in '+Math.round(r.g2)+' ms');
  // per ridisegno: al più 2 passate per spettro (inviluppo e traccia), ciascuna con al più una colonna per pixel
  assert.ok(r.groups<=20*2*r.cols*1.05, 'gruppi per ridisegno '+Math.round(r.groups)+' con '+r.cols+' colonne');
  assert.ok(r.gl, 'tracce con WebGL nel desktop');
  if (os.loadavg()[0] > os.cpus().length){ t.diagnostic('NON VERIFICATO a tempo: Mac carico ('+os.loadavg()[0].toFixed(0)+')'); }
  else { assert.ok(r.fps>=50, 'G1: '+r.fps.toFixed(0)+' fps'); assert.ok(r.drawP95<=50, '95° percentile dei ridisegni '+Math.round(r.drawP95)+' ms (il massimo, '+Math.round(r.drawMax)+' ms, può contenere una pausa del raccoglitore della memoria: il criterio si misura nell\'app, misura-motore --grafico-g)'); }
  assert.deepEqual(o.errors, []); await o.ctx.close();
});

test('controllo del dato di XRF, NMR ed EPR con spettri grandi, letti come dall\'utente: dopo il grafico nessun blocco oltre 50 ms, risultato identico al calcolo sincrono', async()=>{
  // NMR ed EPR con 1M punti; XRF in conteggi con 200 000 canali: con 1M la linea di base SNIP del limite di Currie (nucleo) costa O(n²)
  // e il worker lavora ~10 min (vedi rapporto I6, punto aperto); la finestra però non si blocca nemmeno lì (prova a mano, 1 giro)
  for (const [instr, n] of [['nmr',1e6],['epr',1e6],['xrf',200000]]){ const o=await desk();
    const r=await o.p.evaluate(async([instr, n])=>{ const {xs, ys}=I6.spectrumFor(instr, n, 0), L=new Array(n);
      for (let i=0;i<n;i++) L[i]=xs[i].toFixed(6)+'\t'+(instr==='xrf' ? String(ys[i]) : ys[i].toExponential(8));
      const head={xrf:'Energy (keV)\tCounts', nmr:'ppm\tIntensity', epr:'Field (G)\tdI/dB'}[instr], name='grande-'+instr+'.txt';
      const file=new File([head+'\n'+L.join('\n')+'\n'], name); await AcchEngine.read(new ArrayBuffer(8),'riscalda.txt',{});
      const LT=[]; const ob=new PerformanceObserver(l=>l.getEntries().forEach(e=>LT.push({t:e.startTime, d:e.duration}))); ob.observe({type:'longtask'});
      const draws=[], orp=window.renderPreview; window.renderPreview=function(){ const a=performance.now(); try{ return orp.apply(this,arguments); } finally { draws.push([a, performance.now()]); } };
      await addEntries([{file, path:name}]); const f=files[0]; if (f.instr!==instr){ f.instr=instr; f.kind=kindOf(f); refreshAll(); }
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); const tg=performance.now();
      for (let i=0;i<2400 && !QBAD.has(f.id);i++) await new Promise(r=>setTimeout(r,50));
      await new Promise(r=>setTimeout(r,300)); ob.disconnect(); window.renderPreview=orp; const drawing=x=>draws.some(([a,b])=>a<x.t+x.d && b>x.t);
      const done=QBAD.has(f.id), asyncBad=done ? QBAD.get(f.id).bad : null; QBAD.clear(); const syncBad=badItems(f);
      return {instr:f.instr, n:f.xs.length, done, long:LT.filter(x=>x.t>=tg && !drawing(x)).map(x=>Math.round(x.d)), same:JSON.stringify(asyncBad)===JSON.stringify(syncBad), worker:AcchEngine.heavyCache().length}; }, [instr, n]);
    assert.equal(r.n, n, instr); assert.ok(r.done, instr+': controllo del dato non finito');
    assert.deepEqual(r.long.filter(d=>d>50), [], instr+': blocchi dopo il grafico '+JSON.stringify(r.long));
    assert.ok(r.same, instr+': il controllo fatto a pezzi deve essere identico a quello sincrono');
    assert.ok(r.worker>0, instr+': calcoli pesanti nel worker');
    assert.deepEqual(o.errors, []); await o.ctx.close(); }
});

test('XRF con più di 200 000 canali: avviso △ con il tempo stimato, calcolo nel worker, «Annulla il calcolo» senza bloccare la finestra', async()=>{
  const o=await desk();
  const r=await o.p.evaluate(async()=>{ const n=400000, {xs, ys}=I6.spectrumFor('xrf', n, 0), L=new Array(n); for (let i=0;i<n;i++) L[i]=xs[i].toFixed(6)+'\t'+ys[i];
    const file=new File(['Energy (keV)\tCounts\n'+L.join('\n')+'\n'], 'xrf-grande.txt');
    const orig=window.loader; const seen=[]; window.loader=function(show, t, sub){ if (show && sub && /△/.test(sub)) seen.push(sub); return orig.apply(this, arguments); };
    const LT=[]; const ob=new PerformanceObserver(l=>l.getEntries().forEach(e=>LT.push(Math.round(e.duration)))); ob.observe({type:'longtask'});
    const p=addEntries([{file, path:'xrf-grande.txt'}]); let btn=null;
    for (let i=0;i<1200 && !(btn=document.getElementById('ldCurrie')) ;i++) await new Promise(r=>setTimeout(r,25));
    const shown=!!btn && !btn.hidden, label=btn?btn.textContent:''; await new Promise(r=>setTimeout(r,300)); const t0=performance.now(); if (btn) btn.click(); await p; const ms=performance.now()-t0;
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); ob.disconnect(); window.loader=orig; const f=files[0];
    return {seen:seen[0]||'', shown, label, ms, skip:!!f._currieSkip, instr:f.instr, warn:assess(f, viewOf(f)).some(x=>/Currie non calcolato/.test(x.t)), drawn:!!geo, long:LT}; });
  assert.match(r.seen, /△ 400000 canali: il limite di Currie richiede circa \d+ min/); assert.ok(r.shown); assert.equal(r.label, 'Annulla il calcolo');
  assert.equal(r.instr, 'xrf'); assert.ok(r.skip && r.warn, 'annullato e detto nel controllo del dato'); assert.ok(r.drawn, 'grafico disegnato');
  assert.ok(r.ms<5000, 'dopo «Annulla» il grafico arriva subito: '+Math.round(r.ms)+' ms');
  assert.deepEqual(o.errors, []); await o.ctx.close();
});

test('online: niente livelli WebGL, il grafico resta su un solo canvas e si disegna come prima', async()=>{
  const o=await B.openPage(br, server); await o.p.evaluate(I6_SETUP);
  const r=await o.p.evaluate(async()=>{ await I6.load(1, 200000); await I6.frames(); return {layers:document.querySelectorAll('.pvlayer').length, gl:typeof PV_GL==='undefined' ? 'x' : PV_GL, plot:!!window.AcchPlot}; });
  assert.deepEqual(r, {layers:0, gl:null, plot:true});
  assert.deepEqual(o.errors, []); await o.ctx.close();
});
