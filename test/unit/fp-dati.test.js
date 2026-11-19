// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Banche dati FP (3.1): coerenza con xraylib. I valori di riferimento sono in test/fixtures/xraylib-ref.json, scritti da scripts/check-fp-data.py
// con xraylib (versione nel file), a energie lontane dagli spigoli.
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'); const C=require('./load-core.js');
const REF=JSON.parse(fs.readFileSync(path.join(__dirname,'..','fixtures','xraylib-ref.json'),'utf8'));
test('sezione fotoelettrica τ: entro lo 0,5% di xraylib', ()=>{
  let worst=0; for (const [s,E,v] of REF.tau){ const d=Math.abs(C.fpTau(s,E)/v-1); worst=Math.max(worst,d); assert.ok(d<0.005, `${s} ${E} keV: ${C.fpTau(s,E)} invece di ${v}`); }
  assert.ok(REF.tau.length>100, 'riferimenti sufficienti');
});
test('produzione delle righe della 3.0 (un valore per tratto fra due spigoli): mediana sotto l\'1%, 95° percentile sotto l\'11% (elementi leggeri e Lγ lontano dagli spigoli: vedi docs/SCIENZA.md)', ()=>{
  const e=[]; for (const [s,l,E,v] of REF.sigma){ if (!C.FP.el[s].ln[l]) continue; e.push(Math.abs(C.fpSigma(s,l,E)/v-1)); }
  e.sort((x,y)=>x-y); assert.ok(e.length>200, 'righe controllate: '+e.length);
  assert.ok(e[e.length>>1]<0.01, 'mediana '+e[e.length>>1]); assert.ok(e[Math.floor(0.95*e.length)]<0.11, '95° percentile '+e[Math.floor(0.95*e.length)]);
  for (const s of ['Sn','Ba','W','Au','Pb','Bi','U']) assert.ok(C.FP.el[s].ln.Lg, s+' Lγ');
  for (const s of ['Au','Hg','Pb','Bi','U']) assert.ok(C.FP.el[s].ln.Ma, s+' Mα');
});
test('rese di fluorescenza ω e Coster–Kronig da xraylib', ()=>{
  for (const [s,k,w] of REF.w) assert.ok(Math.abs(C.FP.el[s].w[k]/w-1)<1e-3, `${s} ω_${k}`);
  assert.ok(C.FP.el.Pb.ck.f13>0.5 && C.FP.el.Pb.ck.f13<0.7, 'Pb f13');
  const W=C.FP.el.W.tl; assert.ok(W.some(q=>q[0]==='La1' && q[2]==='L3') && W.some(q=>q[0]==='Lb1' && q[2]==='L2'), 'righe di W per sottoguscio');
});
test('le chiavi della 3.0 sono invariate (valori campione)', ()=>{
  assert.equal(C.fpLineE('Cu','Ka'), 8.0411); assert.equal(C.fpLineE('Sn','Lb'), 3.7112); assert.equal(C.FP.el.Pb.ln.La.E, 10.5408);
});
test('produzione fine del modello 3.1: più vicina a xraylib (95° percentile sotto il 4%, Lγ compresa)', ()=>{
  const e30=[], e31=[]; for (const [s,l,E,v] of REF.sigma){ if (!C.FP.el[s].ln[l] || !C.FP.el[s].ln[l].q) continue; e30.push(Math.abs(C.fpSigma(s,l,E)/v-1)); e31.push(Math.abs(C.fpSigma(s,l,E,true)/v-1)); }
  const p95=a=>a.slice().sort((x,y)=>x-y)[Math.floor(0.95*a.length)], med=a=>a.slice().sort((x,y)=>x-y)[a.length>>1];
  assert.ok(p95(e31)<0.04, '95° percentile 3.1: '+p95(e31)); assert.ok(p95(e31)<p95(e30) && med(e31)<=med(e30), `3.0 ${p95(e30)} / 3.1 ${p95(e31)}`);
});
