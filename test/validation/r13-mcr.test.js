// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// R13: MCR-ALS (app/mcr-core.js, SPEC-AVANZATE §2) su dati SINTETICI con soluzione nota, sull'algoritmo di pyMCR calcolato a mano
// (Camp, J. Res. NIST 124, 2019: regressione ordinaria e negativi a zero; nessun codice esterno eseguito) e sul NNLS del nucleo.
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), vm=require('vm');
const M=require('../../app/mcr-core.js'), SY=require('./chemo/sintetici.js');

test('R13 sintetici senza rumore: profili e spettri entro 1% (SPEC: ≤ 1%), con SIMPLISMA ed EFA', ()=>{
  const {Ct, St, D}=SY.dad(0);
  for (const init of ['simplisma','efa']) for (const uni of [[],[0,1,2]]){
    const R=M.als(D,{nc:3, init, unimodal:uni, tol:1e-12, maxIter:3000});
    const eC=SY.errProfili(Ct, R.C), eS=SY.errProfili(St[0].map((_,j)=>St.map(s=>s[j])), M.transpose(R.S));
    assert.ok(eC<0.01 && eS<0.01, `${init} uni=${uni}: C ${eC}, S ${eS}`);
    assert.ok(R.lof<1e-6, `${init}: mancanza di adattamento ${R.lof}`); assert.ok(R.r2>99.9999);
  }
  const Q=SY.chiusura(), R=M.als(Q.D,{nc:2, init:'efa', closure:1, tol:1e-12, maxIter:3000});
  assert.ok(SY.errProfili(Q.Ct, R.C, true)<0.01, 'chiusura: concentrazioni assolute');
  for (let i=0;i<R.C.m;i++) assert.ok(Math.abs(R.C.a[i*2]+R.C.a[i*2+1]-1)<1e-12, 'chiusura esatta riga '+i);
});

test('R13 con rumore: la mancanza di adattamento arriva al livello del rumore e al limite della PCA', ()=>{
  const {Ct, D}=SY.dad(0.002, 11), R=M.als(D,{nc:3});
  const sst=M.sumSq(D.a), noiseLof=100*0.002*Math.sqrt(D.m*D.n/sst);
  assert.ok(R.lof<1.2*noiseLof && R.lof>0.8*noiseLof, `lof ${R.lof} rumore ${noiseLof}`);
  assert.ok(R.lof>=R.lofPca-1e-9 && R.lof<R.lofPca*1.05, `lof ${R.lof} PCA ${R.lofPca}`);
  assert.ok(SY.errProfili(Ct, R.C)<0.02);
  assert.ok(R.warnings.some(w=>w.code==='rotation'), 'avviso sull\'ambiguità sempre presente');
});

test('R13 spettro noto (uguaglianza): resta esatto e non viene normalizzato', ()=>{
  const {St, D}=SY.dad(0), R=M.als(D,{nc:3, known:{1:St[1]}});
  for (let j=0;j<St[1].length;j++) assert.strictEqual(R.S.a[R.S.n+j], St[1][j]);
  assert.ok(R.lof<1e-6);
});

test('R13 vincoli: NNLS di Bro–De Jong uguale al Lawson–Hanson del nucleo; chiusura; unimodalità', ()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','..','index.html'),'utf8'), src=html.slice(html.indexOf('/*CORE-START*/'), html.indexOf('/*CORE-END*/'));
  const ctx={console, Float64Array, Math}; vm.createContext(ctx); vm.runInContext(src+';globalThis.NN=nnls;', ctx);
  const R=SY.rng(5); let worst=0;
  for (let rep=0;rep<200;rep++){ const k=1+rep%6, m=12+rep%9, A=Array.from({length:k},()=>Array.from({length:m},()=>R.u())), b=Array.from({length:m},()=>R.u()*2-0.6);
    const x1=M.nnlsCols(A,b), x2=ctx.NN(A,b).x; for (let i=0;i<k;i++) worst=Math.max(worst, Math.abs(x1[i]-x2[i])); for (const v of x1) assert.ok(v>=0); }
  assert.ok(worst<1e-8, 'differenza massima '+worst);
  // chiusura: KKT di min ‖Zx − d‖ con x ≥ 0 e Σx = 1, verificate su casi casuali
  for (let rep=0;rep<100;rep++){ const k=2+rep%4, m=10, Z=Array.from({length:m},()=>Array.from({length:k},()=>R.u())), d=Array.from({length:m},()=>R.u());
    const G=new Float64Array(k*k), h=new Float64Array(k); for (let i=0;i<m;i++) for (let a=0;a<k;a++){ h[a]+=Z[i][a]*d[i]; for (let c=0;c<k;c++) G[a*k+c]+=Z[i][a]*Z[i][c]; }
    const x=M.closedLS(G,h,k,1,true); assert.ok(Math.abs(x.reduce((s,v)=>s+v,0)-1)<1e-12); const g=Array.from({length:k},(_,a)=>{ let s=h[a]; for (let c=0;c<k;c++) s-=G[a*k+c]*x[c]; return s; });
    const P=[...x.keys()].filter(i=>x[i]>0), mu=P.reduce((s,i)=>s+g[i],0)/P.length; P.forEach(i=>assert.ok(Math.abs(g[i]-mu)<1e-9)); for (let i=0;i<k;i++) if (!(x[i]>0)) assert.ok(g[i]-mu<=1e-9); }
  // unimodalità: risultato unimodale e mai peggiore di qualunque altro unimodale provato
  const y=[0,1,3,2,4,1,0.5,0.7,0], u=Array.from(M.unimodal(y)); assert.deepStrictEqual(u.map(v=>+v.toFixed(12)), [0,1,2.5,2.5,4,1,0.6,0.6,0]);
});

test('R13 algoritmo di pyMCR calcolato a mano (1 componente, OLS e negativi a zero)', ()=>{
  // D 3×3, partenza Sᵀ = [1 1 1]. Passo 1: C = (righe·s)/(s·s) = [2, 1/3, 2/3]; Sᵀ = CᵀD/CᵀC = [24, 42, 57]/41.
  // Passo 2: C = D s/(s·s) = [279, −9, 99]/41 · 1681/5589 → il −9 diventa 0: C = [1271, 0, 451]/621; Sᵀ = 621·[1271, 2993, 4264]/1818842.
  const D=M.fromRows([[1,2,3],[2,0,-1],[0,1,1]]), base={nc:1, S0:[[1,1,1]], pymcr:true, norm:'none'};
  const R1=M.als(D,Object.assign({maxIter:1},base)), R2=M.als(D,Object.assign({maxIter:2},base));
  const near=(a,b,msg)=>assert.ok(Math.abs(a-b)<=1e-14*Math.max(1,Math.abs(b)), `${msg}: ${a} invece di ${b}`);
  [2,1/3,2/3].forEach((v,i)=>near(R1.C.a[i],v,'C passo 1')); [24,42,57].forEach((v,i)=>near(R1.S.a[i],v/41,'S passo 1'));
  [1271/621,0,451/621].forEach((v,i)=>near(R2.C.a[i],v,'C passo 2')); [1271,2993,4264].forEach((v,i)=>near(R2.S.a[i],621*v/1818842,'S passo 2'));
  // con una componente il NNLS coincide con «OLS e negativi a zero»
  const R3=M.als(D,{nc:1, S0:[[1,1,1]], norm:'none', maxIter:2}); for (let i=0;i<3;i++) near(R3.C.a[i], R2.C.a[i], 'NNLS = pyMCR con 1 componente');
});

test('R13 MCR-BANDS: banda stretta con soluzione unica, larga con ambiguità rotazionale', ()=>{
  const U=SY.dad(0), RU=M.als(U.D,{nc:3}), BU=M.bands(RU);
  assert.ok(BU.width<1e-3, 'unica: larghezza '+BU.width);
  const A=SY.consecutiva(), RA=M.als(A.D,{nc:3, closure:1}), BA=M.bands(RA);
  assert.ok(BA.width>0.02, 'ambigua: larghezza '+BA.width);
  BA.f.forEach(r=>assert.ok(r.fmin<=r.fopt+1e-12 && r.fmax>=r.fopt-1e-12));
});

test('R13 deterministico: due esecuzioni identiche bit per bit', ()=>{
  const {D}=SY.dad(0.002, 3), a=M.als(D,{nc:3, init:'efa'}), b=M.als(D,{nc:3, init:'efa'});
  assert.deepStrictEqual(Array.from(a.C.a), Array.from(b.C.a)); assert.deepStrictEqual(Array.from(a.S.a), Array.from(b.S.a));
});
