// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// EPR: doppio integrale confrontato con il valore vero, riga al bordo, frequenza con la virgola, unità del campo (ciclo 25, agente NMR/EPR).
// Tutti i dati sono SINTETICI.
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), vm=require('vm');
const html=fs.readFileSync(path.join(__dirname,'..','..','index.html'),'utf8'), src=html.slice(html.indexOf('/*CORE-START*/'), html.indexOf('/*CORE-END*/'));
const C={console, Float64Array, Math, TextDecoder, Uint8Array, DataView, ArrayBuffer}; vm.createContext(C);
const names=['eprDoubleIntegral','eprEdgeSignal','eprFreqFromHead','eprFieldUnitK','eprLineField'];
vm.runInContext(src+';globalThis.T={'+names.map(n=>`${n}:typeof ${n}==='function'?${n}:null`).join(',')+'};', C); const T=C.T;
const fn=n=>{ assert.equal(typeof T[n], 'function', n+' manca nel nucleo'); return T[n]; };
let seed=11; const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; }, gs=()=>{ let s=0; for (let i=0;i<6;i++) s+=rnd(); return s-3; };
const mk=(n,lo,hi,f)=>{ const B=new Float64Array(n), y=new Float64Array(n); for (let i=0;i<n;i++){ B[i]=lo+(hi-lo)*i/(n-1); y[i]=f(B[i]); } return [B,y]; };
// derivata di un assorbimento con area nota: gaussiana (area s·√2π) e lorentziana (area π·w)
const gder=(b,c,s)=>{ const u=(b-c)/s; return -u/s*Math.exp(-0.5*u*u); }, lder=(b,c,w)=>{ const t=(b-c)/w; return -2*t/(1+t*t)**2/w; };

test('doppio integrale uguale al valore vero (area dell\'assorbimento), con deriva, offset e rumore', ()=>{
  const s=0.5, vero=s*Math.sqrt(2*Math.PI);
  for (const [dr,off,nz] of [[0,0,0],[0.05,0,0],[0,0.3,0],[0.05,0.3,0.01],[0.2,1,0.02]]){
    const [B,y]=mk(4096,330,340,b=>gder(b,335,s)+off+dr*(b-330)+nz*gs()), r=fn('eprDoubleIntegral')(B,y).di;
    assert.ok(Math.abs(r/vero-1)<0.01, `deriva ${dr}, offset ${off}, rumore ${nz}: DI ${r} contro ${vero}`);
  }
  // lorentziana in finestra ±40 HWHM: il troncamento delle code è il limite fisico dichiarato (≥ 95 %)
  const w=0.5, [B,y]=mk(8192,315,355,b=>lder(b,335,w)); const q=fn('eprDoubleIntegral')(B,y).di/(Math.PI*w); assert.ok(q>0.95 && q<1.001, 'lorentziana ±40 HWHM: '+q);
});

test('riga vicina al bordo (caso e23): il doppio integrale sbagliato è riconosciuto', ()=>{
  for (const c of [330.5,331,331.5]){ const [B,y]=mk(4096,330,340,b=>1000*gder(b,c,0.3)); const r=fn('eprDoubleIntegral')(B,y).di/(1000*0.3*Math.sqrt(2*Math.PI));
    assert.ok(Math.abs(r-1)>0.05, `centro ${c}: il DI era giusto (${r}), il caso non prova nulla`);
    assert.equal(fn('eprEdgeSignal')(B,y).edge, true, `centro ${c}: DI ${r.toFixed(2)}× il vero senza segnale agli estremi`); }
  // e23 della sonda: lorentziana a 331 mT nella finestra 330–340, DI negativo
  const [B,y]=mk(4096,330,340,b=>{ const t=(b-331)/0.3; return -2000*t/(1+t*t)**2; }); assert.ok(fn('eprDoubleIntegral')(B,y).di<0); assert.equal(fn('eprEdgeSignal')(B,y).edge, true);
  // riga centrata con deriva, offset o rumore forte: nessun allarme
  for (const [dr,off,nz] of [[0,0,0],[0.05,0.3,0.01],[0.2,1,0.02]]){ const [B3,y3]=mk(4096,330,340,b=>gder(b,335,0.5)+off+dr*(b-330)+nz*gs()); assert.equal(fn('eprEdgeSignal')(B3,y3).edge, false, `falso allarme (deriva ${dr}, rumore ${nz})`); }
  let fa=0; for (let k=0;k<50;k++){ const [B2,y2]=mk(2048,330,340,b=>gder(b,335,0.5)*0.3+0.05*gs()); if (fn('eprEdgeSignal')(B2,y2).edge) fa++; } assert.equal(fa, 0, 'falsi allarmi su 50 spettri rumorosi');
});

test('frequenza delle microonde: virgola decimale e unità', ()=>{
  const F=fn('eprFreqFromHead'), near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9, a+' ≠ '+b);
  near(F('MWFQ 9,400000e9'), 9.4); near(F('MWFQ 9.4e9'), 9.4); near(F('MWFQ=9,4e+09'), 9.4); near(F('MWFQ 9400000000'), 9.4); near(F('MWFQ,9400000000'), 9.4); near(F('MWFQ;9,4e9'), 9.4); near(F('MWFQ\t9.4e9'), 9.4);   // ciclo 26: separatore di Excel (virgola, punto e virgola) dopo MWFQ
  near(F('Microwave frequency: 9,4 GHz'), 9.4); near(F('Microwave frequency: 9400.0 MHz'), 9.4); near(F('Frequenza 34,0 GHz'), 34);
  assert.equal(F('EPR spectrum'), null);
});

test('unità del campo non dichiarata: decisa dalla frequenza sulla riga più intensa', ()=>{
  const U=fn('eprFieldUnitK'), NU=9.4, gB=g=>71.44773*NU/g, d=(b,c,w)=>{ const t=(b-c)/w; return -2*t/(1+t*t)**2; };
  // e17: 5–10 000 G con Fe(III) a g 4,3 e radicale a g 2,0036: al centro della scansione g sarebbe 1,34
  const [B,y]=mk(8192,5,10000,b=>1000*d(b,10*gB(4.3),30)+1000*d(b,10*gB(2.0036),15)); assert.deepEqual({...U(B,y,NU)}, {k:0.1, by:'freq'});
  const line=(lo,hi,c,w)=>mk(2048,lo,hi,b=>1000*d(b,c,w));
  assert.deepEqual({...U(...line(3252,3452,3352,4),NU)}, {k:0.1, by:'freq'}, 'gauss');
  assert.deepEqual({...U(...line(0.325,0.345,0.3352,0.0004),NU)}, {k:1000, by:'freq'}, 'tesla');
  assert.deepEqual({...U(...line(325,345,335.2,0.4),NU)}, {k:1, by:'freq'}, 'mT');
  // senza frequenza: si guarda la riga, non la fine della scansione (0–1400 mT con la riga a 335 resta in mT)
  assert.deepEqual({...U(...line(0,1400,335.2,1.5),0)}, {k:1, by:'range'}, 'mT larga');
  assert.deepEqual({...U(...line(3252,3452,3352,4),0)}, {k:0.1, by:'range'}, 'gauss senza frequenza');
});
