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
