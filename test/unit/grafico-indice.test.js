// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I6: indice min/max del grafico (app/plot-index.js). Il percorso veloce deve dare gli stessi comandi di disegno, lo stesso inviluppo
// e gli stessi estremi del ciclo su tutti i punti (copiato qui da index.html, d091313/c34dba7), su dati sintetici avversi.
'use strict';
const test=require('node:test'), assert=require('node:assert'), path=require('path');
const P=require(path.join(__dirname,'..','..','app','plot-index.js'));

function rnd(seed){ let s=seed||7; return ()=>{ s=(s*16807)%2147483647; return s/2147483647; }; }
// dati: X crescenti (anche con valori ripetuti e passo irregolare), Y con rumore, picchi stretti di 1 punto, zeri con segno
function data(n, seed, opt){ opt=opt||{}; const r=rnd(seed), xs=new Float64Array(n), ys=new Float64Array(n); let x=opt.x0||0;
  for (let i=0;i<n;i++){ x += opt.dup && r()<0.05 ? 0 : (opt.irr ? r()*2 : 1); xs[i]=x; ys[i]=Math.sin(i/500)*3+r()-0.5+(r()<0.001 ? (r()<0.5?-40:40) : 0); if (r()<0.001) ys[i]=r()<0.5?0:-0; }
  return {xs, ys}; }
// mappe come in drawPlot
function maps(xs, ys, W, inv, z){ const px0=7.3, pw=W, py0=3.1, ph=61.7; let xmin=xs[0], xmax=xs[xs.length-1]; if (z){ xmin=z[0]; xmax=z[1]; }
  let lo=Infinity, hi=-Infinity; for (const v of ys){ if (v<lo) lo=v; if (v>hi) hi=v; } lo-=0.3; hi+=0.2;
  const X=x=>inv ? px0+(xmax-x)/(xmax-xmin)*pw : px0+(x-xmin)/(xmax-xmin)*pw, Y=y=>py0+(hi-y)/((hi-lo)||1)*ph; X.lin=true; Y.lin=true; return {X, Y, px0, pw, py0, ph}; }
// traceLine di riferimento (ramo decimato), registra i comandi
function refTrace(xs, ys, X, Y, px0, pw, cols, inv){ const n=xs.length, L=[]; let lastCol=-1, cmin=0, cmax=0, cfirst=0, clast=0, started=false;
  const flush=c=>{ const x=px0+(c+0.5)/cols*pw; L.push([started?'L':'M', x, Y(cfirst)]); started=true; L.push(['L',x,Y(cmin)],['L',x,Y(cmax)],['L',x,Y(clast)]); };
  for (let t=0;t<n;t++){ const i=inv ? n-1-t : t; const c=Math.min(cols-1, Math.max(0, Math.floor((X(xs[i])-px0)/pw*cols)));
    if (c!==lastCol){ if (lastCol>=0) flush(lastCol); lastCol=c; cmin=cmax=cfirst=clast=ys[i]; } else { if (ys[i]<cmin) cmin=ys[i]; if (ys[i]>cmax) cmax=ys[i]; clast=ys[i]; } }
  if (lastCol>=0) flush(lastCol); return L; }
function fastTrace(R, xs, ys, X, Y, px0, pw, cols, inv){ const L=[]; let started=false;
  P.groups(R, ys, i=>Math.min(cols-1, Math.max(0, Math.floor((X(xs[i])-px0)/pw*cols))), inv, (c,f,mn,mx,l)=>{ const x=px0+(c+0.5)/cols*pw; L.push([started?'L':'M',x,Y(f)]); started=true; L.push(['L',x,Y(mn)],['L',x,Y(mx)],['L',x,Y(l)]); });
  return L; }
// addEnv di riferimento
function refEnv(xs, ys, X, YY, px0, pw, py0, ph, nc){ const eT=new Float64Array(nc).fill(Infinity), eB=new Float64Array(nc).fill(-Infinity), colOf=x=>Math.min(nc-1, Math.max(0, Math.floor((x-px0)/pw*nc)));
  let pc=-1, pyv=0; for (let i=0;i<xs.length;i++){ const x=X(xs[i]); if (x<px0-1e-6 || x>px0+pw+1e-6 || !isFinite(x)){ pc=-1; continue; }
    const y=Math.min(py0+ph, Math.max(py0, YY(ys[i]))), c=colOf(x); const a=pc<0?c:Math.min(c,pc), b=pc<0?c:Math.max(c,pc), ya=pc<0?y:Math.min(y,pyv), yb=pc<0?y:Math.max(y,pyv);
    for (let q=a;q<=b;q++){ if (ya<eT[q]) eT[q]=ya; if (yb>eB[q]) eB[q]=yb; } pc=c; pyv=y; }
  return [eT, eB]; }
const same=(a,b)=>a.length===b.length && a.every((v,i)=>Array.isArray(v) ? v.every((w,j)=>Object.is(w,b[i][j]) || w===b[i][j]) : (v===b[i] || (v!==v && b[i]!==b[i])));

test('traceLine: stessi comandi del ciclo su tutti i punti (dimensioni, passi irregolari, X ripetute, X invertite, viste di zoom)', ()=>{
  let cases=0;
  for (const [n,seed,opt] of [[5000,1,{}],[100003,2,{irr:true}],[250000,3,{dup:true}],[1e6,4,{}],[65536,5,{irr:true,dup:true}]]){
    const {xs, ys}=data(n, seed, opt);
    for (const inv of [false,true]) for (const cols of [50, 777, 2400]){
      const m=maps(xs, ys, 120.4, inv); const R=P.ready(xs, ys); assert.ok(R, 'pronto');
      assert.ok(same(fastTrace(R, xs, ys, m.X, m.Y, m.px0, m.pw, cols, inv), refTrace(xs, ys, m.X, m.Y, m.px0, m.pw, cols, inv)), `n=${n} inv=${inv} cols=${cols}`); cases++;
      // vista di zoom (subarray, come zoomSlice): usa l'indice del vettore intero
      if (n<20000) continue;
      const a=Math.floor(n*0.31), b=Math.floor(n*0.77), sx=xs.subarray(a,b), sy=ys.subarray(a,b), mz=maps(sx, sy, 99.9, inv), Rz=P.ready(sx, sy);
      assert.ok(Rz && Rz.gy.off===a, 'vista con l\'indice del vettore intero');
      assert.ok(same(fastTrace(Rz, sx, sy, mz.X, mz.Y, mz.px0, mz.pw, cols, inv), refTrace(sx, sy, mz.X, mz.Y, mz.px0, mz.pw, cols, inv)), `zoom n=${n} inv=${inv} cols=${cols}`); cases++; } }
  assert.ok(cases>=50, 'casi: '+cases);
});

test('inviluppo delle etichette e estremi: identici al ciclo (anche con una parte dei punti fuori dal grafico)', ()=>{
  for (const [n,seed,opt] of [[8192,6,{}],[300000,7,{irr:true,dup:true}],[1e6,8,{}]]){ const {xs, ys}=data(n, seed, opt), R=P.ready(xs, ys);
    for (const inv of [false,true]) for (const nc of [60, 1013, 2400]) for (const z of [null, [xs[Math.floor(n*0.2)]+0.3, xs[Math.floor(n*0.6)]-0.1]]){
      const m=maps(xs, ys, 140.2, inv, z), [rT,rB]=refEnv(xs, ys, m.X, m.Y, m.px0, m.pw, m.py0, m.ph, nc);
      const eT=new Float64Array(nc).fill(Infinity), eB=new Float64Array(nc).fill(-Infinity), colOf=x=>Math.min(nc-1, Math.max(0, Math.floor((x-m.px0)/m.pw*nc)));
      m.X.key=[m.px0,m.pw,nc,inv,!!z].join('|'); P.envelope(R, xs, ys, m.X, m.Y, m.px0, m.pw, m.py0, m.ph, colOf, eT, eB, inv, nc);
      // la traccia con lo stesso numero di colonne riusa i gruppi dell'inviluppo e dà gli stessi comandi
      if (!z){ const G=P.groupsArr(R, ys, i=>Math.min(nc-1, Math.max(0, Math.floor((m.X(xs[i])-m.px0)/m.pw*nc))), inv, m.X.key+'|'+nc+'|x'+R.gx.I.id+'@'+R.gx.off), L=[]; let st=false;
        for (let j=0;j<G.m;j++){ const x=m.px0+(G.c[j]+0.5)/nc*m.pw; L.push([st?'L':'M',x,m.Y(G.f[j])]); st=true; L.push(['L',x,m.Y(G.mn[j])],['L',x,m.Y(G.mx[j])],['L',x,m.Y(G.l[j])]); }
        assert.ok(same(L, refTrace(xs, ys, m.X, m.Y, m.px0, m.pw, nc, inv)), 'gruppi riusati'); }
      assert.ok(same(Array.from(eT), Array.from(rT)) && same(Array.from(eB), Array.from(rB)), `inviluppo n=${n} inv=${inv} nc=${nc} zoom=${!!z}`); }
    let mn=Infinity, mx=-Infinity, mp=Infinity, xp=Infinity; for (let i=0;i<n;i++){ const v=ys[i]; if (v<mn) mn=v; if (v>mx) mx=v; if (v>0 && v<mp) mp=v; const x=xs[i]; if (x>0 && x<xp) xp=x; }
    const q=P.stats(R, xs, true, true); assert.deepEqual([q.min,q.max,q.mp,q.xpos], [mn,mx,mp,xp]); }
});

test('casi in cui il percorso veloce non vale: X non crescenti, NaN, Infinity, vettori piccoli; vettore cambiato: indice rifatto', ()=>{
  const {xs, ys}=data(20000, 9, {});
  const u=xs.slice(); u[777]=u[776]-1; assert.equal(P.ready(u, ys), null, 'X non crescenti');
  const a=ys.slice(); a[123]=NaN; assert.equal(P.ready(xs, a), null, 'NaN in Y');
  const b=ys.slice(); b[5]=Infinity; assert.equal(P.ready(xs, b), null, 'Infinity in Y');
  const c=xs.slice(); c[19999]=NaN; assert.equal(P.ready(c, ys), null, 'NaN in X');
  assert.equal(P.ready(xs.subarray(0,1000), ys.subarray(0,1000)), null, 'piccolo: ciclo semplice');
  // la vista che esclude il punto cattivo è pronta
  assert.ok(P.ready(u.subarray(800), ys.subarray(800)), 'vista dopo il punto fuori ordine');
  const y2=ys.slice(); const R1=P.ready(xs, y2); const before=P.stats(R1, xs).max; y2[0]=1e9; const R2=P.ready(xs, y2);
  assert.equal(P.stats(R2, xs).max, 1e9, 'vettore cambiato: l\'indice si rifà'); assert.ok(before<1e9);
  // vettori normali (Array) e Float32Array
  const A=Array.from(xs), B=Array.from(ys); const RA=P.ready(A, B), m=maps(xs, ys, 80, false); assert.ok(RA);
  assert.ok(same(fastTrace(RA, A, B, m.X, m.Y, m.px0, m.pw, 300, false), refTrace(A, B, m.X, m.Y, m.px0, m.pw, 300, false)));
  const f32=Float32Array.from(ys), R3=P.ready(xs, f32); assert.ok(same(fastTrace(R3, xs, f32, m.X, m.Y, m.px0, m.pw, 300, true), refTrace(xs, f32, m.X, m.Y, m.px0, m.pw, 300, true)));
});

test('picchi stretti: in ogni colonna ci sono il minimo e il massimo veri, nessun picco di un punto si perde', ()=>{
  const n=1e6, xs=new Float64Array(n), ys=new Float64Array(n); for (let i=0;i<n;i++){ xs[i]=i; ys[i]=Math.sin(i/9000); }
  const spikes=[1234, 333333, 999998]; spikes.forEach((k,j)=>{ ys[k]= j===1 ? -50 : 50; });
  const R=P.ready(xs, ys); for (const cols of [400, 1920, 3840]) for (const inv of [false,true]){
    const m=maps(xs, ys, 100, inv), col=i=>Math.min(cols-1, Math.max(0, Math.floor((m.X(xs[i])-m.px0)/m.pw*cols)));
    const G=P.groupsArr(R, ys, col, inv, null), got=new Map(); for (let j=0;j<G.m;j++) got.set(G.c[j], [G.mn[j], G.mx[j]]);
    const ref=new Map(); for (let i=0;i<n;i++){ const c=col(i); const r=ref.get(c)||[Infinity,-Infinity]; r[0]=Math.min(r[0],ys[i]); r[1]=Math.max(r[1],ys[i]); ref.set(c,r); }
    for (const [c,r] of ref) assert.deepEqual(got.get(c), r, 'colonna '+c);
    for (const k of spikes){ const c=col(k); assert.ok(got.get(c)[0]===-50 || got.get(c)[1]===50, 'picco '+k); } }
});

test('costo: con punti equispaziati bastano circa 3 valutazioni per colonna (non n), anche con 20 spettri da 1M punti', ()=>{
  // misura deterministica (numero di valutazioni), non a tempo: il Mac dei test è condiviso e carico
  let evals=0, groupsN=0;
  for (let k=0;k<20;k++){ const {xs, ys}=data(1e6, 20+k, {}), m=maps(xs, ys, 150, k%2===1), R=P.ready(xs, ys);
    P.groups(R, ys, i=>{ evals++; return Math.min(2399, Math.max(0, Math.floor((m.X(xs[i])-m.px0)/m.pw*2400))); }, k%2===1, ()=>{ groupsN++; }); }
  assert.equal(groupsN, 20*2400);
  assert.ok(evals/groupsN<=4, 'valutazioni per colonna: '+(evals/groupsN).toFixed(2));
  // passo irregolare: resta logaritmico
  const {xs, ys}=data(1e6, 99, {irr:true, dup:true}), m=maps(xs, ys, 150, false), R=P.ready(xs, ys); let e2=0, g2=0;
  P.groups(R, ys, i=>{ e2++; return Math.min(2399, Math.max(0, Math.floor((m.X(xs[i])-m.px0)/m.pw*2400))); }, false, ()=>{ g2++; });
  assert.ok(e2/g2<=24, 'passo irregolare: '+(e2/g2).toFixed(2));
});

test('zoom: il tratto trovato per bisezione è quello dei cicli di zoomSlice (estremi dentro, fuori, uguali, ripetuti)', ()=>{
  const ref=(xs,z0,z1)=>{ let lo=0, hi=xs.length-1; while (lo<hi && xs[lo]<z0) lo++; while (hi>lo && xs[hi]>z1) hi--; return [lo,hi]; };
  for (const opt of [{}, {dup:true, irr:true}]){ const {xs}=data(50000, 31, opt); assert.ok(P.sortedX(xs));
    const r=rnd(5), last=xs[xs.length-1];
    const Z=[[xs[0],last],[-5,1e9],[last+1,last+2],[-3,-1],[xs[100],xs[100]],[xs[2000],xs[1000]],[NaN,xs[500]],[xs[700],NaN]];
    for (let k=0;k<300;k++){ const a=r()*last*1.1-5, b=a+r()*last*0.3; Z.push([a,b]); }
    for (const [a,b] of Z) assert.deepEqual(P.span(xs,a,b), ref(xs,a,b), a+' '+b); }
  const u=data(50000, 32, {}).xs; u[9]=-1; assert.equal(P.sortedX(u), false);
});

test('linCol: la colonna calcolata dal modulo è identica a quella della funzione X della pagina (drawPlot e riquadro), anche invertita', ()=>{
  for (const [n,seed,opt] of [[200000,41,{irr:true}],[1e6,42,{dup:true}]]){ const {xs, ys}=data(n, seed, opt), R=P.ready(xs, ys);
    for (const inv of [false,true]) for (const cols of [333, 2400]){ const m=maps(xs, ys, 131.7, inv), xmin=xs[0], xmax=xs[n-1];
      const par={o:m.px0, lo:xmin, hi:xmax, den:xmax-xmin, w:m.pw, inv}, col=P.linCol(xs, 0, par, cols), ref=i=>Math.min(cols-1, Math.max(0, Math.floor((m.X(xs[i])-m.px0)/m.pw*cols)));
      for (let i=0;i<n;i+=97) assert.equal(col(i), ref(i));
      const G=P.groupsArr(R, ys, col, inv, null), L=[]; let st=false;
      for (let j=0;j<G.m;j++){ const x=m.px0+(G.c[j]+0.5)/cols*m.pw; L.push([st?'L':'M',x,m.Y(G.f[j])]); st=true; L.push(['L',x,m.Y(G.mn[j])],['L',x,m.Y(G.mx[j])],['L',x,m.Y(G.l[j])]); }
      assert.ok(same(L, refTrace(xs, ys, m.X, m.Y, m.px0, m.pw, cols, inv)), `n=${n} inv=${inv} cols=${cols}`); } }
});
