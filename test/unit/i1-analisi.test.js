// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Tappa I1, pacchetto «analisi»: EPR con base curva (R2 del ciclo 26). Una parabola comune alle due finestre non sposta il doppio
// integrale (la parte pari si annulla per simmetria), quindi non è «segnale agli estremi»; i veri positivi restano. Dati SINTETICI.
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), vm=require('vm');
const html=fs.readFileSync(path.join(__dirname,'..','..','index.html'),'utf8'), src=html.slice(html.indexOf('/*CORE-START*/'), html.indexOf('/*CORE-END*/'));
const C={console, Float64Array, Math, TextDecoder, Uint8Array, DataView, ArrayBuffer}; vm.createContext(C);
vm.runInContext(src+';globalThis.T={eprDoubleIntegral, eprEdgeSignal};', C); const {eprDoubleIntegral, eprEdgeSignal}=C.T;
const mk=(n,lo,hi,f)=>{ const B=new Float64Array(n), y=new Float64Array(n); for (let i=0;i<n;i++){ B[i]=lo+(hi-lo)*i/(n-1); y[i]=f(B[i]); } return [B,y]; };
const gder=(b,c,s)=>{ const u=(b-c)/s; return -u/s*Math.exp(-0.5*u*u); }, lder=(b,c,w)=>{ const t=(b-c)/w; return -2*t/(1+t*t)**2/w; };
let seed=3; const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; }, gs=()=>{ let s=0; for (let i=0;i<6;i++) s+=rnd(); return s-3; };

test('EPR: base curva simmetrica o con il vertice spostato: niente ⛔ e doppio integrale giusto', ()=>{
  const vero=0.5*Math.sqrt(2*Math.PI);
  for (const [nome, f] of [['simmetrica 0,5', b=>gder(b,335,0.5)+0.5*((b-335)/5)**2], ['simmetrica 0,2 con rumore', b=>gder(b,335,0.5)+0.2*((b-335)/5)**2+0.01*gs()], ['vertice a 333', b=>gder(b,335,0.5)+0.3*((b-333)/5)**2]]){
    const [B,y]=mk(4096,330,340,f);
    assert.ok(Math.abs(eprDoubleIntegral(B,y).di/vero-1)<0.02, nome+': DI '+eprDoubleIntegral(B,y).di/vero);
    assert.equal(eprEdgeSignal(B,y).edge, false, nome+': ⛔ falso con una base curva');
  }
});
test('EPR: i veri positivi restano (riga al bordo, anche su base curva; lorentziana stretta nella finestra; base cubica)', ()=>{
  for (const [nome, n, lo, hi, f] of [['gaussiana a 330,5', 4096,330,340, b=>1000*gder(b,330.5,0.3)], ['gaussiana a 331,5', 4096,330,340, b=>1000*gder(b,331.5,0.3)],
    ['riga a 331 su base curva', 4096,330,340, b=>gder(b,331,0.3)+0.3*((b-335)/5)**2], ['lorentziana ±5 semilarghezze', 8192,332.5,337.5, b=>lder(b,335,0.5)],
    ['lorentziana ±7 semilarghezze', 8192,331.5,338.5, b=>lder(b,335,0.5)], ['base cubica', 4096,330,340, b=>gder(b,335,0.5)+0.3*((b-335)/5)**3]]){
    const [B,y]=mk(n,lo,hi,f); assert.equal(eprEdgeSignal(B,y).edge, true, nome+': ⛔ perso'); }
});

// Doppio integrale con le zone di fondo scelte dall'utente e avviso sulle ali (I1, ROADMAP P1 n. 3). Lorentziane SINTETICHE: area vera π·w.
{ const T2={}; vm.runInContext('globalThis.T2={eprWings: typeof eprWings==="function"?eprWings:null};', C); Object.assign(T2, C.T2);
  const w=0.5, V=Math.PI*w;
  test('EPR: con le zone di fondo giuste il doppio integrale di una lorentziana torna entro l\'1% del vero', ()=>{
    const [B1,y1]=mk(60000,185,485,b=>lder(b,335,w)+0.0005*(b-335)+0.1);   // ±300 semilarghezze, deriva e offset, due zone agli estremi
    const r1=eprDoubleIntegral(B1,y1,[[185,190],[480,485]]).di/V; assert.ok(Math.abs(r1-1)<0.01, 'due zone: '+r1);
    const [B2,y2]=mk(80000,300,700,b=>lder(b,340,w)+0.1);   // riga fuori centro: le finestre del 5% cadono sulle sue ali
    const d=eprDoubleIntegral(B2,y2).di/V, z=eprDoubleIntegral(B2,y2,[[680,700]]).di/V;
    assert.ok(Math.abs(d-1)>0.1, 'il caso non prova nulla: finestre agli estremi '+d); assert.ok(Math.abs(z-1)<0.01, 'una zona lontana: '+z);
    assert.equal(eprDoubleIntegral(B2,y2,[[1,2]]).zones, undefined, 'zona fuori dallo spettro: deve restare il calcolo di sempre');
    const [B3,y3]=mk(4096,330,340,b=>gder(b,335,0.5)); assert.deepEqual(Array.from(eprDoubleIntegral(B3,y3).abs.slice(0,5)), Array.from(eprDoubleIntegral(B3,y3,null).abs.slice(0,5)), 'senza zone il calcolo non cambia');
  });
  test('EPR: avviso quando le ali della riga arrivano nella base; niente avviso per gaussiane, derive e scansioni larghe', ()=>{
    const W=T2.eprWings; assert.equal(typeof W, 'function', 'eprWings manca nel nucleo');
    for (const [nome, B, y, Z] of [['±10', ...mk(8192,330,340,b=>lder(b,335,w))], ['±40', ...mk(8192,315,355,b=>lder(b,335,w))], ['fuori centro', ...mk(60000,300,600,b=>lder(b,330,w)+0.1)], ['zona troppo vicina', ...mk(80000,300,700,b=>lder(b,340,w)), [[300,302],[680,700]]]])
      assert.equal(W(B,y,Z).warn, true, nome+': ali non segnalate');
    for (const [nome, B, y, Z] of [['±100', ...mk(20000,285,385,b=>lder(b,335,w))], ['gaussiana', ...mk(4096,330,340,b=>gder(b,335,0.5))], ['gaussiana con deriva', ...mk(4096,330,340,b=>gder(b,335,0.5)+0.2*(b-330)+1)],
      ['gaussiana con rumore', ...mk(4096,330,340,b=>gder(b,335,0.5)*0.3+0.05*gs())], ['zona lontana', ...mk(80000,300,700,b=>lder(b,340,w)), [[680,700]]]])
      assert.equal(W(B,y,Z).warn, false, nome+': avviso falso');
  });
}
