// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// R14: fit globale delle cinetiche (app/kinetics-core.js, SPEC-AVANZATE §3). NIST StRD non lineari (valori certificati pubblici, LRE),
// sintetici con k note, copertura dell'intervallo al 95% con 1000 ripetizioni Monte Carlo, confronto tra modelli, prestazioni.
'use strict';
const test=require('node:test'), assert=require('node:assert');
const M=require('../../app/mcr-core.js'), K=require('../../app/kinetics-core.js'), STRD=require('./chemo/strd-nls.js'), SY=require('./chemo/sintetici.js');
const lre=(a,c)=>a===c?15:Math.min(15,-Math.log10(Math.abs(a-c)/Math.abs(c)));
// BoxBOD dalla partenza 1 (b = 1, 1): il LM finisce sul pianoro b₂ → ∞ (modello costante, SSR 9771,5) come molti programmi; dichiarato in VALIDAZIONE
const NOTO={'BoxBOD#1':true};

test('R14 NIST StRD non lineari: parametri, errori standard e somma dei quadrati con LRE ≥ 6', ()=>{
  const rows=[];
  for (const [nm,d] of Object.entries(STRD)) d.start.forEach((st,si)=>{ const r=K.fitCurve(d.f,d.x,d.y,st,{grad:d.g, maxIter:5000});
    const L={b:Math.min(...r.p.map((v,i)=>lre(v,d.b[i]))), sd:r.se?Math.min(...r.se.map((v,i)=>lre(v,d.sd[i]))):0, ssr:lre(r.ssr,d.ssr), sres:lre(r.sres,d.sres)}; rows.push([nm+'#'+(si+1), L]);
    if (NOTO[nm+'#'+(si+1)]){ assert.ok(L.ssr<1, 'il caso noto non deve passare per caso'); return; }
    for (const k of ['b','sd','ssr','sres']) assert.ok(L[k]>=6, `${nm} partenza ${si+1}: LRE ${k} = ${L[k].toFixed(2)}`); assert.strictEqual(r.dof, d.dof); });
  assert.strictEqual(rows.length, 8);
});

test('R14 sintetici senza rumore: k entro 1e-6 relativo per ogni modello', ()=>{
  const casi=[['ord1',[0.3]],['consec',[0.5,0.12]],['ord2',[0.4]],['ord0',[0.1]],['par',[0.8,0.1],{nExp:2}],['par',[0.8,0.1,0.02],{nExp:3, offset:true}],['rev',[0.3],{K:2}],['rev',[0.3],{}]];
  for (const [model,k,o] of casi){ const se=SY.serieCinetica(model,k,o,50,80,0), r=K.fit(se,Object.assign({model},o||{}));
    const got=r.params.map(p=>p.value).sort((a,b)=>b-a), want=k.slice().sort((a,b)=>b-a);
    want.forEach((v,i)=>assert.ok(Math.abs(got[i]-v)/v<1e-6, `${model} ${JSON.stringify(o||{})}: ${got[i]} invece di ${v}`)); }
  // SAS ritrovati (consecutive, senza rumore)
  const se=SY.serieCinetica('consec',[0.5,0.12],{},50,80,0), r=K.fit(se,{model:'consec'});
  for (let c=0;c<3;c++) for (let j=0;j<80;j++) assert.ok(Math.abs(r.S.a[c*80+j]-se.S[c][j])<1e-7, 'SAS '+c);
  // A ⇌ B con K: k_f e k_b; senza K solo k_obs e avviso
  const rv=K.fit(SY.serieCinetica('rev',[0.3],{K:2},40,30,0),{model:'rev', K:2}); assert.ok(Math.abs(rv.derived[0].value-0.2)<1e-7 && Math.abs(rv.derived[1].value-0.1)<1e-7);
  assert.ok(K.fit(SY.serieCinetica('rev',[0.3],{},40,30,0),{model:'rev'}).warnings.some(w=>w.code==='noK'));
  // ordine 0 senza arrivare a zero: k non determinata, e lo dice
  assert.ok(K.fit(SY.serieCinetica('ord0',[0.02],{},40,30,0),{model:'ord0'}).warnings.some(w=>w.code==='ord0lin'));
  // secondo ordine con [A]₀: k = k'/[A]₀
  const o2=K.fit(SY.serieCinetica('ord2',[0.4],{},40,30,0),{model:'ord2', A0:0.002}); assert.ok(Math.abs(o2.derived[0].value-200)<1e-4);
});

test('R14 copertura dell\'IC 95% con 1000 ripetizioni Monte Carlo (SPEC: tra 93% e 97%)', ()=>{
  for (const [model,k] of [['ord1',[0.25]],['consec',[0.6,0.15]]]){
    let hit=0, tot=0; const N=1000;
    for (let rep=0;rep<N;rep++){ const se=SY.serieCinetica(model,k,{},25,10,0.01,1000+rep), r=K.fit(se,{model, k0:k});
      r.params.forEach((p,i)=>{ const v=k.slice().sort((a,b)=>b-a)[i], q=r.params.map(x=>x.value).sort((a,b)=>b-a); const pp=r.params.find(x=>x.value===q[i]); tot++; if (v>=pp.lo95 && v<=pp.hi95) hit++; }); }
    const cov=hit/tot; assert.ok(cov>=0.93 && cov<=0.97, `${model}: copertura ${(100*cov).toFixed(1)}%`); }
});

test('R14 confronto tra modelli: AIC, BIC e test F scelgono il modello vero', ()=>{
  const se=SY.serieCinetica('consec',[0.5,0.12],{},50,80,0.002,7);
  const R=[['ord1',{model:'ord1'}],['consec',{model:'consec'}],['par3c',{model:'par', nExp:3, offset:true}]].map(([l,o])=>Object.assign(K.fit(se,o),{label:l}));
  const c=K.compare(R), best=c.rows.slice().sort((a,b)=>a.aic-b.aic)[0];
  assert.strictEqual(best.label,'consec'); assert.strictEqual(c.rows.slice().sort((a,b)=>a.bic-b.bic)[0].label,'consec');
  const t1=c.tests.find(t=>t.simple==='ord1' && t.complex==='consec'), t2=c.tests.find(t=>t.simple==='consec' && t.complex==='par3c');
  assert.ok(t1 && t1.p<1e-6, 'ord1 rifiutato'); assert.ok(t2 && t2.p>0.01, 'terza esponenziale non necessaria: p '+(t2&&t2.p));
  // distribuzione F: valori tabulati (F 0,95 con 1 e 10 gradi di libertà = 4,9646)
  assert.ok(Math.abs(K.fSurvival(4.9646,1,10)-0.05)<1e-4);
});

test('R14 prestazioni: serie 200 × 1000, nessuna fetta di calcolo oltre 50 ms', ()=>{
  // si misura il tempo di CPU del processo per fetta (process.cpuUsage), non l'orologio: sul Mac condiviso il processo può restare fermo
  // in attesa della CPU per centinaia di ms senza lavorare. Il lavoro è deterministico: si ripete fino a 3 volte e conta la migliore.
  const se=SY.serieCinetica('consec',[0.5,0.1],{},200,1000,0.001,2,10), D=M.seriesMatrix(se);
  const worst=mk=>{ let best=Infinity, val=null; for (let rep=0;rep<3 && best>=50;rep++){ const g=mk(); let mx=0, r; do { const c0=process.cpuUsage(); r=g.next(); const c=process.cpuUsage(c0); mx=Math.max(mx, (c.user+c.system)/1000); } while (!r.done); if (mx<best){ best=mx; val=r.value; } } return [best, val]; };
  const res={}; let R;
  [res.svd]=worst(()=>M.svdGen(D)); [res.als, R]=worst(()=>M.alsGen(D,{nc:3, closure:1})); [res.bands]=worst(()=>M.bandsGen(R, {maxEval:600})); [res.kin]=worst(()=>K.fitGen(se,{model:'consec'})); [res.kinNN]=worst(()=>K.fitGen(se,{model:'consec', nonnegS:true}));
  console.log('# R14 fetta più lunga (ms di CPU): '+Object.entries(res).map(([k,v])=>k+' '+v.toFixed(1)).join(', '));
  for (const [k,v] of Object.entries(res)) assert.ok(v<50, `${k}: ${v.toFixed(1)} ms`);
});
