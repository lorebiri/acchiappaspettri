// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// XRF 3.1: spettro del tubo di Ebel (1999) e fluorescenza terziaria del modello fisico «3.1». Riferimento: XRayTubeEbel.py di PyMca 5.9.7
// (valori salvati in test/fixtures/pymca/ebel-ref.json).
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'); const C=require('./load-core.js');
const REF=JSON.parse(fs.readFileSync(path.join(__dirname,'..','fixtures','pymca','ebel-ref.json'),'utf8')).dati;
const at=(T,e)=>{ let i=0, b=1e9; for (let k=0;k<T.E.length;k++){ const d=Math.abs(T.E[k]-e); if (d<b){ b=d; i=k; } } return T.N[i]; };
const lines=T=>{ const o=[]; for (let k=0;k<T.E.length;k++){ const f=T.E[k]*10-0.5; if (Math.abs(f-Math.round(f))>1e-6) o.push([T.E[k], T.N[k]]); } return o; };
test('continuo di Ebel: uguale a PyMca entro lo 0,5% (Rh, Ag, Mo, W; angoli e tensioni diversi)', ()=>{
  for (const [an,kv,ae,ax] of [['Rh',40,75,20],['Ag',30,90,90],['Mo',25,60,30],['W',45,75,20]]){
    const T=C.fpTube(C.fpSetup({anode:an, kv, phys:'3.1', ae, eps:ax, beT:125}));
    [3.05,8.05,15.05,24.05].forEach((e,i)=>{ const v=at(T,e)/0.1, r=REF[an].cont[i]; assert.ok(Math.abs(v/r-1)<0.005, `${an} ${e} keV: ${v} invece di ${r}`); });
  }
});
test('righe K dell\'anodo: intensità totale entro il 3% di PyMca; righe L calcolate anche per W (PyMca non le dà)', ()=>{
  for (const [an,kv,ae,ax] of [['Rh',40,75,20],['Ag',30,90,90],['Mo',25,60,30]]){
    const T=C.fpTube(C.fpSetup({anode:an, kv, phys:'3.1', ae, eps:ax, beT:125})), K=lines(T).filter(q=>q[0]>15).reduce((t,q)=>t+q[1],0), R=REF[an].lines.reduce((t,q)=>t+q[1],0);
    assert.ok(Math.abs(K/R-1)<0.03, `${an}: ${K} invece di ${R}`); }
  const W=lines(C.fpTube(C.fpSetup({anode:'W', kv:45, phys:'3.1'}))), la=W.find(q=>Math.abs(q[0]-8.3976)<1e-3), lb=W.find(q=>Math.abs(q[0]-9.6724)<1e-3);
  assert.ok(la && lb && la[1]>lb[1] && lb[1]>0, 'W Lα₁ e Lβ₁');
});
test('tubo a trasmissione e finestra: meno fotoni a bassa energia con più berillio; il modello 3.0 resta quello di prima', ()=>{
  const a=C.fpTube(C.fpSetup({anode:'Rh', kv:40, phys:'3.1', beT:75})), b=C.fpTube(C.fpSetup({anode:'Rh', kv:40, phys:'3.1', beT:500}));
  assert.ok(at(b,2.05)/at(a,2.05)<0.6 && at(b,20.05)/at(a,20.05)>0.97, 'finestra');
  const t=C.fpTube(C.fpSetup({anode:'Rh', kv:40, phys:'3.1', trans:true, tT:2})); assert.ok(at(t,10.05)>0 && Number.isFinite(at(t,5.05)), 'trasmissione');
  const old=C.fpSetup({anode:'Rh', kv:40}); assert.ok(!old.phys && !('ae' in old), 'condizioni della 3.0 invariate');
  assert.ok(C.fpTube(old).E.length!==a.E.length || at(C.fpTube(old),10.05)!==at(a,10.05), 'i due modelli sono distinti');
});
test('fluorescenza terziaria (3.1): rinforza Cr in un acciaio Fe–Cr–Ni di qualche decimo di punto percentuale', ()=>{
  const S=C.fpSetup({anode:'Ag', kv:16, exc:[[16,1,1]], phys:'3.1'}), c={Cr:0.18, Fe:0.70, Ni:0.12}, L=[['Cr','Ka']];
  const t=C.fpIntensities([{comp:c, t:Infinity}], S, L)['Cr Ka'], s=C.fpIntensities([{comp:c, t:Infinity}], S, L, {tert:false})['Cr Ka'];
  assert.ok(t>s && t/s-1>0.002 && t/s-1<0.05, 'rinforzo terziario '+(t/s-1));
  const two=C.fpIntensities([{comp:{Cr:0.2, Fe:0.8}, t:Infinity}], S, L), two0=C.fpIntensities([{comp:{Cr:0.2, Fe:0.8}, t:Infinity}], S, L, {tert:false});
  assert.equal(two['Cr Ka'], two0['Cr Ka'], 'con due elementi non c\'è terziaria');
});
test('revisione 3.1: tubo a trasmissione con anodo più sottile della profondità di generazione, intensità finite e limitate', ()=>{
  const thick=C.fpTube(C.fpSetup({anode:'Rh', kv:50, phys:'3.1'})), sum=T=>T.N.reduce((a,b)=>a+b,0);
  for (const [an,tT,eps] of [['Rh',1,90],['Rh',5,90],['Cu',0.5,90],['Cu',0.5,5],['W',1,20]]){
    const T=C.fpTube(C.fpSetup({anode:an, kv:50, phys:'3.1', trans:true, tT, eps})), s=sum(T);
    assert.ok(Number.isFinite(s) && T.N.every(v=>Number.isFinite(v) && v>=0), `${an} ${tT} µm: somma ${s}`); assert.ok(s<5*sum(thick), `${an} ${tT} µm: ${s} contro ${sum(thick)} del tubo spesso`); }
});
test('revisione 3.1: angoli e spessori impossibili tornano ai valori tipici (prima davano NaN)', ()=>{
  for (const o of [{eps:-10},{eps:200},{si:-10},{beT:-5},{beD:-1}]){ const S=C.fpSetup(Object.assign({anode:'Rh', kv:40, phys:'3.1'}, o));
    assert.ok(S.eps>3 && S.eps<=90 && S.si>0 && S.beT>=0 && S.beD>=0, JSON.stringify(o)+' → '+S.key);
    const I=C.fpIntensities([{comp:{Cu:0.9, Sn:0.1}, t:Infinity}], S, [['Cu','Ka'],['Sn','Ka']]); assert.ok(Number.isFinite(I['Cu Ka']) && Number.isFinite(I['Sn Ka']), JSON.stringify(o)); }
  assert.strictEqual(C.fpSetup({anode:'Rh', kv:40, eps:30}).eps, 30, 'un valore valido resta');
});
