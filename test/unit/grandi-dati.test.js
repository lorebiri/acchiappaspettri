// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// A3 (ciclo 25): con 1 milione di punti Math.max(...array) supera la pila (RangeError) e il grafico resta bianco.
// Ricerca picchi e lettura dei blocchi devono funzionare senza spread su array grandi.
const test=require('node:test'), assert=require('node:assert'); const C=require('./load-core.js');
const N=1_000_000;
function noisy(n, seed){ const xs=new Float64Array(n), ys=new Float64Array(n); let s=seed||7; const r=()=>{ s=(s*16807)%2147483647; return s/2147483647; };
  for (let i=0;i<n;i++){ xs[i]=400+3600*i/(n-1); const g=Math.sqrt(-2*Math.log(r()||1e-12))*Math.cos(6.2832*r());
    ys[i]=100*Math.exp(-0.5*((xs[i]-1000)/4)**2)+60*Math.exp(-0.5*((xs[i]-2500)/6)**2)+40*Math.exp(-0.5*((xs[i]-3300)/5)**2)+g; }
  return {xs, ys}; }
test('findPeaks con 1 milione di punti rumorosi: nessun RangeError, i tre picchi trovati', ()=>{
  const {xs, ys}=noisy(N), pk=C.findPeaks(xs, ys, 1, 2, 20);
  for (const c of [1000, 2500, 3300]) assert.ok(pk.some(p=>Math.abs(p.x-c)<2), `picco a ${c} non trovato: ${pk.map(p=>p.x.toFixed(1))}`);
});
test('file con 1 milione di righe e un secondo blocco lungo: lettura senza RangeError', ()=>{
  const n=N, m=300_000, L=new Array(n+m+2); let k=0; L[k++]='x y';
  for (let i=0;i<n;i++) L[k++]=(400+i*0.0036).toFixed(4)+' '+(Math.sin(i/5000)+2).toFixed(4);
  L[k++]='secondo canale';
  for (let i=0;i<m;i++) L[k++]=(400+i*0.006).toFixed(4)+' '+(Math.cos(i/5000)+2).toFixed(4);
  const P=C.parseText(L.join('\n'));
  assert.ok(P && P.xs.length>=n, 'punti letti '+(P&&P.xs.length));
});
