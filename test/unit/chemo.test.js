// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I9: serie di spettri (asse da nome, metadati o utente), algebra di base di mcr-core, impostazioni salvate (an.mcr, an.kin), f.series nel formato 2.
'use strict';
const test=require('node:test'), assert=require('node:assert'), JSZip=require('jszip');
const M=require('../../app/mcr-core.js'), K=require('../../app/kinetics-core.js'), F=require('../../app/project-format.js');

test('asse dal nome del file', ()=>{
  const c=(n,v,q,u)=>{ const a=M.axisFromName(n); assert.ok(a, n); assert.strictEqual(a.value,v,n); if (q!==undefined) assert.strictEqual(a.quantity,q,n); if (u!==undefined) assert.strictEqual(a.unit,u,n); };
  c('cinetica_t=30s.csv',30,'tempo','s'); c('campione 12,5 min.txt',12.5,'tempo','min'); c('run_2h.csv',2,'tempo','h'); c('uv_dose 5 Gy.csv',5,'dose','Gy');
  c('ftir_T25C.csv',25,'temperatura','°C'); c('raman -80 °C.txt',-80,'temperatura','°C'); c('scan_120ms.csv',120,'tempo','ms'); c('spettro_007.csv',7,null,null);
  assert.strictEqual(M.axisFromName('bianco.csv'), null);
});
test('asse dai metadati e proposta per un insieme', ()=>{
  const a=M.axisFromMeta(['Title: x','Acquisition time: 2026-11-13 10:15:30']), b=M.axisFromMeta(['Date/Time: 13/11/2026 10:16:00']);
  assert.ok(a.stamp && b.stamp); assert.strictEqual(b.stamp-a.stamp, 30);
  assert.strictEqual(M.axisFromMeta(['Sample temperature: 35.5 °C']).value, 35.5);
  const P=M.proposeAxis([{name:'a.csv', meta:['Date: 2026-11-13 10:00:00']},{name:'b.csv', meta:['Date: 2026-11-13 10:05:00']},{name:'c.csv', meta:['Date: 2026-11-13 10:10:00']}]);
  assert.strictEqual(P.source,'meta'); assert.deepStrictEqual(P.values,[0,300,600]);
  const Q=M.proposeAxis([{name:'k_30s.csv'},{name:'k_2min.csv'},{name:'k_90s.csv'}]); assert.strictEqual(Q.source,'name'); assert.strictEqual(Q.unit,'min'); assert.deepStrictEqual(Q.values,[0.5,2,1.5]);
  assert.strictEqual(M.proposeAxis([{name:'a.csv'},{name:'b.csv'},{name:'c.csv'}]).source,'manual');
});
test('costruzione della serie: ordinata per t, asse comune, interpolazione, errori chiari', ()=>{
  const xs1=[1,2,3,4,5,6], xs2=[6,5,4,3,2,1], xs3=[0.5,1.5,2.5,3.5,4.5,5.5,6.5];
  const sp=[{xs:xs1, ys:xs1.map(x=>x)}, {xs:xs2, ys:xs2.map(x=>2*x)}, {xs:xs3, ys:xs3.map(x=>3*x)}];
  const se=M.buildSeries(sp,[10,0,5],{tunit:'s'});
  assert.deepStrictEqual(se.t.values,[0,5,10]); assert.deepStrictEqual(Array.from(se.x.values),[1,2,3,4,5,6]);
  assert.deepStrictEqual(se.shape,[3,6]); assert.ok(se.resampled);
  assert.deepStrictEqual(Array.from(se.data.slice(0,6)),[2,4,6,8,10,12]); assert.deepStrictEqual(Array.from(se.data.slice(6,12)),[3,6,9,12,15,18]); assert.deepStrictEqual(Array.from(se.data.slice(12)),[1,2,3,4,5,6]);
  assert.throws(()=>M.buildSeries(sp,[1,1,2]), /ripetuti/); assert.throws(()=>M.buildSeries(sp,[1,null,2]), /mancanti/); assert.throws(()=>M.buildSeries(sp.slice(0,2),[1,2]), /almeno 3/);
  assert.ok(M.validSeries(se)); assert.ok(!M.validSeries({shape:[2,2]}));
});
test('SVD e autovalori: ricostruzione e valori singolari noti', ()=>{
  const D=M.fromRows([[3,0,0,0],[0,2,0,0],[0,0,1,0]]), s=M.svd(D); assert.deepStrictEqual(Array.from(s.s).map(v=>+v.toFixed(12)),[3,2,1]);
  const R=[]; let z=7; for (let i=0;i<9;i++){ const r=[]; for (let j=0;j<14;j++){ z=(z*16807)%2147483647; r.push(z/2147483647); } R.push(r); }
  const A=M.fromRows(R), S=M.svd(A); let err=0; for (let i=0;i<9;i++) for (let j=0;j<14;j++){ let v=0; for (let c=0;c<S.q;c++) v+=S.U.a[i*S.q+c]*S.s[c]*S.V.a[j*S.q+c]; err=Math.max(err,Math.abs(v-R[i][j])); } assert.ok(err<1e-10, 'ricostruzione '+err);
});
test('impostazioni salvate: solo valori ammessi', ()=>{
  assert.deepStrictEqual(M.cleanOpt({nc:3, init:'efa', closure:1, unimodal:[0,2,2,'x',99], norm:'max', known:{'1':'a/b.csv', '__proto__':'x', 'xx':'y'}, evil:()=>1}), {nc:3, init:'efa', closure:1, unimodal:[0,2], norm:'max', known:{'1':'a/b.csv'}});
  assert.strictEqual(M.cleanOpt({nc:99}), null); assert.strictEqual(M.cleanOpt('x'), null);
  assert.deepStrictEqual(K.cleanOpt({model:'consec', K:-1, A0:0.1, k0:[0.5,'a',-2], t0fit:true}), {model:'consec', t0fit:true, A0:0.1, k0:[0.5]});
  assert.strictEqual(K.cleanOpt({model:'nessuno'}), null);
});
test('f.series nel formato 2: scritta in binario e riletta identica', async ()=>{
  const se=M.buildSeries([{xs:[1,2,3,4,5],ys:[1,2,3,4,5]},{xs:[1,2,3,4,5],ys:[2,3,4,5,6]},{xs:[1,2,3,4,5],ys:[0.1,0.2,0.3,0.4,0.5]}],[0,30,60],{tunit:'s', kind:'kinetics'});
  const rec={kind:se.kind, t:se.t, x:{values:Array.from(se.x.values), quantity:se.x.quantity, unit:se.x.unit}, y:se.y, shape:se.shape, dtype:'f64', data:se.data, meta:{version:M.VERSION}};
  const out=await F.encode({state:{}, spectra:[{name:'Serie.series', path:'serie/Serie', bytes:null, memory:{an:{mcr:{nc:2}, kin:{model:'ord1'}}}, series:rec}]}, JSZip);
  const P=await F.decode(out, JSZip), s=P.spectra[0];
  assert.strictEqual(s.source, null); assert.deepStrictEqual(Array.from(s.series.data), Array.from(se.data)); assert.deepStrictEqual(s.series.t.values, [0,30,60]);
  assert.deepStrictEqual(s.memory.an, {mcr:{nc:2}, kin:{model:'ord1'}}); assert.ok(M.validSeries(s.series));
});
test('memory.an.mcr e memory.an.kin: andata e ritorno con tutti i campi documentati, cleanOpt stabile', async ()=>{
  const mcr={nc:4, init:'efa', initOn:'C', nonnegC:true, nonnegS:false, closure:2.5, offset:7, unimodal:[0,3], norm:'max', maxIter:500, tol:1e-4, known:{'2':'cartella/riferimento.csv'}, xmin:300, xmax:650};
  const kin={model:'par', nExp:3, offset:true, t0fit:true, t0:1.5, K:2, A0:0.01, nonnegS:true, rank:6, k0:[0.5,0.05,0.005]};
  assert.deepStrictEqual(M.cleanOpt(mcr), mcr); assert.deepStrictEqual(K.cleanOpt(kin), kin);
  const se=M.buildSeries([{xs:[1,2,3,4,5],ys:[1,2,3,4,5]},{xs:[1,2,3,4,5],ys:[2,3,4,5,6]},{xs:[1,2,3,4,5],ys:[0,1,0,1,0]}],[0,1,2]);
  const out=await F.encode({state:{}, spectra:[{name:'S', path:'serie/S.series', bytes:null, memory:{an:{mcr, kin}}, series:{t:se.t, x:se.x, y:se.y, shape:se.shape, data:se.data}}]}, JSZip);
  const P=await F.decode(out, JSZip), an=P.spectra[0].memory.an;
  assert.deepStrictEqual(M.cleanOpt(an.mcr), mcr); assert.deepStrictEqual(K.cleanOpt(an.kin), kin);
});
