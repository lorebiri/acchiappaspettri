// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Rimozione del fondo (app/baseline-core.js e baseCurve/baseDefaults di index.html): correttezza di base, casi limite, parametri
// arrivati da un progetto, prestazioni con spettri lunghi. La validazione numerica estesa è in test/validation/fondo-sintetici.test.js.
const test=require('node:test'), assert=require('node:assert');
const B=require('../../app/baseline-core.js'), C=require('./load-core.js'), {raman, err}=require('../fixtures/raman-sintetici.js');

test('fondo: ogni metodo recupera il fondo di uno spettro Raman sintetico (errore RMS < 3% del picco più alto)', ()=>{
  const s=raman(7);
  for (const m of ['als','arpls','modpoly','imodpoly','snip','rball']){
    const o=C.baseDefaults(m, s.x, s.y, 'raman'), b=B.compute(m, s.x, s.y, o), e=err(b, s.base);
    assert.equal(b.length, s.y.length, m); assert.ok(b.every(Number.isFinite), m);
    assert.ok(e.rmse<3, `${m}: RMS ${e.rmse.toFixed(2)}%`);
  }
});
test('fondo: un fondo puramente polinomiale senza picchi è recuperato quasi esattamente da ModPoly/IModPoly', ()=>{
  const n=800, x=Float64Array.from({length:n},(_,i)=>i), y=Float64Array.from(x, v=>{ const t=v/n; return 3+2*t-5*t*t+4*t*t*t; });
  for (const m of ['modpoly','imodpoly']){ const b=B.compute(m, x, y, {deg:3}); assert.ok(err(b, y).max<1e-6, m); }
});
test('fondo: ALS e arPLS su una retta senza rumore restituiscono la retta', ()=>{
  const n=500, x=Float64Array.from({length:n},(_,i)=>i), y=Float64Array.from(x, v=>10+0.02*v);
  for (const m of ['als','arpls']){ const b=B.compute(m, x, y, {}); assert.ok(err(b, y).max<1e-4, m); }
});
test('fondo: punti di ancoraggio — il fondo passa per i punti, PCHIP non oscilla, costante fuori, lineare a richiesta', ()=>{
  const n=1000, x=Float64Array.from({length:n},(_,i)=>i), y=Float64Array.from(x, v=>v<500?v:500+0.0*v);
  const b=B.anchor(x, y, {pts:[100,400,600,900], hw:0});
  for (const p of [100,400,600,900]) assert.ok(Math.abs(b[p]-y[p])<1e-9, 'passa per '+p);
  for (let i=400;i<600;i++) assert.ok(b[i]>=400-1e-9 && b[i]<=500+1e-9, 'monotona tra 400 e 600');
  assert.equal(b[0], y[100]); assert.equal(b[n-1], y[900]);
  const L=B.anchor(x, y, {pts:[100,900], interp:'linear', hw:0}); assert.ok(Math.abs(L[500]-(100+(500-100)/800*(500-100)))<1e-9);
  assert.ok(B.anchor(x, y, {pts:[]}).every(Number.isNaN), 'senza punti nessun fondo');
  const one=B.anchor(x, y, {pts:[300], hw:0}); assert.ok(one.every(v=>v===300), 'un punto: costante');
});
test('fondo: asse decrescente (come FTIR o Raman esportati dal numero d\'onda più alto) e punti doppi', ()=>{
  const n=600, x=Float64Array.from({length:n},(_,i)=>3000-i*4), y=Float64Array.from(x, v=>0.001*v);
  const b=B.anchor(x, y, {pts:[2900, 2900.5, 1000, 2000], hw:0});
  for (const p of [2900, 1000, 2000]){ const i=Math.round((3000-p)/4); assert.ok(Math.abs(b[i]-y[i])<1e-9); }
  assert.equal(B.anchorPoints(x, y, [2900, 2900.5]).length, 1, 'due punti sullo stesso campione contano una volta');
  const p=B.compute('imodpoly', x, y, {deg:2}); assert.ok(err(p, y).max<1e-4);
});
test('fondo: spettri corti, costanti, con NaN di parametri o metodo sconosciuto non rompono nulla', ()=>{
  const x=Float64Array.from([1,2,3]), y=Float64Array.from([5,6,7]);
  for (const m of ['als','arpls','modpoly','imodpoly','snip','rball']) assert.deepEqual(Array.from(B.compute(m, x, y, {})), [5,6,7]);
  const n=200, X=Float64Array.from({length:n},(_,i)=>i), K=new Float64Array(n).fill(42);
  for (const m of ['als','arpls','modpoly','imodpoly','snip','rball']){ const b=B.compute(m, X, K, {lam:NaN, deg:NaN, hw:NaN, p:NaN}); assert.ok(err(b, K).max<1e-4, m); }
  assert.equal(B.compute('boh', X, K, {}), null);
});
test('fondo: parametri da un progetto — solo nomi noti, numeri finiti entro i limiti', ()=>{
  assert.deepEqual(B.cleanParams('als', {lam:1e6, p:0.01, iter:20, evil:'x', __proto__:{a:1}}), {lam:1e6, p:0.01, iter:20});
  assert.equal(B.cleanParams('als', {lam:-1, p:2, iter:1e9}), null);
  assert.equal(B.cleanParams('als', [1,2]), null); assert.equal(B.cleanParams('xyz', {lam:1}), null); assert.equal(B.cleanParams('als', 'lam'), null);
  assert.deepEqual(B.cleanParams('anchor', {pts:[3,1,2,2,'4',NaN,Infinity], interp:'linear', hw:3}), {hw:3, pts:[1,2,3], interp:'linear'});
  assert.equal(B.cleanParams('anchor', {pts:Array.from({length:500},(_,i)=>i)}).pts.length, 200, 'al più 200 punti');
  assert.deepEqual(B.cleanParams('snip', {hw:12, pre:3, lls:true}), {hw:12, pre:3, lls:true});
  assert.deepEqual(B.cleanParams('imodpoly', {deg:6.5, tol:1}), {deg:6.5});
});
test('fondo: arPLS e SNIP senza parametri restano identici alle versioni precedenti (nessun cambiamento ai risultati salvati)', ()=>{
  const s=raman(3), a=C.baseCurve('arpls', null, s.x, s.y, 'raman', 'I'), a0=C.baselineArPLS(s.x, s.y);
  assert.deepEqual(Array.from(a), Array.from(a0));
  const sx=C.baseCurve('snip', null, s.x, s.y, 'xrf', 'I'), sx0=C.baselineSNIP(s.y, 0, true); assert.deepEqual(Array.from(sx), Array.from(sx0));
});
test('fondo: in trasmittanza (%T) il fondo segue il bordo superiore e i parametri si applicano al rovescio', ()=>{
  const s=raman(11), T=Float64Array.from(s.y, v=>90-v), info={};
  const b=C.baseCurve('als', {lam:5e5}, s.x, T, 'ftir', 'T', info);
  const e=err(Float64Array.from(b, v=>90-v), s.base); assert.ok(e.rmse<4, 'RMS '+e.rmse.toFixed(2)); assert.equal(info.par.lam, 5e5);
});
test('fondo: prestazioni — 200 000 punti in pochi decimi di secondo, 2 milioni di punti senza esaurire la memoria', ()=>{
  const big=n=>{ const x=new Float64Array(n), y=new Float64Array(n); for (let i=0;i<n;i++){ x[i]=i; y[i]=5*Math.exp(-(((i-n/2)/(n/3))**2))+Math.exp(-(((i-n/3)/30)**2))+0.01*Math.sin(i*7.3); } return {x,y}; };
  const s=big(200000), t={};
  for (const m of ['als','arpls','modpoly','imodpoly','snip','rball']){ const t0=process.hrtime.bigint(); const b=B.compute(m, s.x, s.y, m==='snip'||m==='rball'?{hw:60}:{}); t[m]=Number(process.hrtime.bigint()-t0)/1e6; assert.equal(b.length, s.y.length); }
  for (const [m,ms] of Object.entries(t)) assert.ok(ms<4000, `${m}: ${ms.toFixed(0)} ms`);
  // SNIP costa n × finestra: con un milione di punti e una finestra larga prima servivano circa 29 s, ora lavora a blocchi
  { const M=big(1000000), t1=Date.now(), z=B.snip(M.y, {hw:6667, pre:5}); assert.ok(Date.now()-t1<6000, 'SNIP 10⁶ punti, finestra 6667: '+(Date.now()-t1)+' ms'); assert.ok(z.every(Number.isFinite)); }
  const L=big(2000000), t0=Date.now(), b=B.als(L.y, {}); assert.equal(b.length, 2000000); assert.ok(b.every(Number.isFinite)); assert.ok(Date.now()-t0<10000, 'ALS su 2·10⁶ punti: '+(Date.now()-t0)+' ms');
});
test('fondo: baseCurveR è pura e copiabile al worker del desktop (stesso risultato di baseCurve, parametri usati compresi)', ()=>{
  const s=raman(21), info={}, a=C.baseCurve('als', {lam:3e5}, s.x, s.y, 'raman', 'I', info), r=C.baseCurveR('als', {lam:3e5}, s.x, s.y, 'raman', 'I');
  assert.deepEqual(Array.from(r.bl), Array.from(a)); assert.deepEqual(r.par, info.par); assert.equal(r.par.lam, 3e5);
  const c=structuredClone(r); assert.deepEqual(Array.from(c.bl), Array.from(a));   // il worker restituisce il risultato per copia strutturata
  const y0=Float64Array.from(s.y); C.baseCurveR('imodpoly', null, s.x, s.y, 'raman', 'I'); assert.deepEqual(Array.from(s.y), Array.from(y0), 'non modifica i dati');
  assert.deepEqual(C.baseCurveR('anchor', {pts:[]}, s.x, s.y, 'raman', 'I'), {bl:null, par:null});
});
