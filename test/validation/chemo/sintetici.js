// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Dati SINTETICI con soluzione nota per R13 (MCR-ALS) e R14 (cinetiche): nessun dato reale. Generatore casuale con seme fisso.
'use strict';
const M=require('../../../app/mcr-core.js'), K=require('../../../app/kinetics-core.js');
const bump=(x,c,w)=>Math.abs(x-c)<w?Math.cos(Math.PI/2*(x-c)/w)**2:0;   // supporto compatto: zone selettive vere
const gaussS=(x,c,w)=>Math.exp(-0.5*((x-c)/w)**2);
function rng(seed){ let s=seed>>>0||1; const u=()=>{ s=(Math.imul(s,1664525)+1013904223)>>>0; return (s+0.5)/4294967296; }; return {u, g:()=>{ const a=u(), b=u(); return Math.sqrt(-2*Math.log(a))*Math.cos(2*Math.PI*b); }}; }
function compose(Ct, St, noise, seed){ const m=Ct.length, n=St[0].length, k=St.length, D=M.mat(m,n), R=rng(seed||1);
  for (let i=0;i<m;i++) for (let j=0;j<n;j++){ let v=0; for (let c=0;c<k;c++) v+=Ct[i][c]*St[c][j]; D.a[i*n+j]=v+(noise?noise*R.g():0); } return D; }
// HPLC-DAD: tre picchi coeluiti, ognuno con una finestra di tempo e una zona spettrale propria (soluzione unica)
function dad(noise, seed){ const m=80, n=150, Ct=Array.from({length:m},(_,i)=>[bump(i,22,14),bump(i,38,14),bump(i,56,16)]);
  const St=[0,1,2].map(c=>Array.from({length:n},(_,j)=>bump(j,[30,75,118][c],[35,30,35][c]))); return {Ct, St, D:compose(Ct,St,noise,seed)}; }
// ordine zero con chiusura: A puro all'inizio, P puro dopo t = 25
function chiusura(){ const m=40, n=100, Ct=Array.from({length:m},(_,i)=>{ const a=Math.max(0,1-i/25); return [a,1-a]; });
  const St=[0,1].map(c=>Array.from({length:n},(_,j)=>bump(j,[30,70][c],30))); return {Ct, St, D:compose(Ct,St,0)}; }
// A → B → C con spettri sovrapposti: soluzione MCR NON unica (ambiguità rotazionale), utile per MCR-BANDS
function consecutiva(){ const m=60, n=120, t=Array.from({length:m},(_,i)=>i/(m-1)*10), k1=0.6, k2=0.25;
  const Ct=t.map(tt=>{ const a=Math.exp(-k1*tt), b=k1/(k2-k1)*(Math.exp(-k1*tt)-Math.exp(-k2*tt)); return [a,b,1-a-b]; });
  const St=[0,1,2].map(c=>Array.from({length:n},(_,j)=>bump(j,[25,60,95][c],[30,25,30][c]))); return {Ct, St, D:compose(Ct,St,0)}; }
// serie cinetica per un modello di KinCore con k note
function serieCinetica(model, k, opt, m, n, noise, seed, tmax){ opt=opt||{}; tmax=tmax||20; const t=Array.from({length:m},(_,i)=>i*(tmax/(m-1))), x=Array.from({length:n},(_,j)=>400+j*(300/(n-1)));
  const info=K.modelInfo(model,opt), ns=info.species.length, C=K.profiles(K.MODELS[model], info, t, k, 0, opt);
  const S=Array.from({length:ns},(_,c)=>x.map(v=>gaussS(v,450+c*90,30+c*5)+0.1*gaussS(v,650-c*60,20)));
  const R=rng(seed||1), data=new Float64Array(m*n);
  for (let i=0;i<m;i++) for (let j=0;j<n;j++){ let v=0; for (let c=0;c<ns;c++) v+=C[i*ns+c]*S[c][j]; data[i*n+j]=v+(noise?noise*R.g():0); }
  return {t:{values:t, quantity:'tempo', unit:'s'}, x:{values:Float64Array.from(x), unit:'nm'}, y:{}, shape:[m,n], dtype:'f64', data, S, C}; }
// abbina le colonne stimate a quelle vere (correlazione) e dà l'errore massimo relativo dopo la scala ai minimi quadrati
function errProfili(Ct, Cest, fixedScale){ const m=Ct.length, k=Ct[0].length; let worst=0; const used=new Set();
  for (let c=0;c<k;c++){ let best=-2, bk=-1; for (let q=0;q<k;q++){ if (used.has(q)) continue; const a=Ct.map(r=>r[c]), b=Array.from(M.col(Cest,q)); let ab=0,aa=0,bb=0; for (let i=0;i<m;i++){ ab+=a[i]*b[i]; aa+=a[i]*a[i]; bb+=b[i]*b[i]; } const r=ab/Math.sqrt(aa*bb||1e-300); if (r>best){ best=r; bk=q; } }
    used.add(bk); const a=Ct.map(r=>r[c]), b=Array.from(M.col(Cest,bk)); let sc=1; if (!fixedScale){ let ab=0, bb=0; for (let i=0;i<m;i++){ ab+=a[i]*b[i]; bb+=b[i]*b[i]; } sc=ab/bb; }
    let md=0, am=0; for (let i=0;i<m;i++){ md=Math.max(md,Math.abs(a[i]-sc*b[i])); am=Math.max(am,Math.abs(a[i])); } worst=Math.max(worst, md/am); }
  return worst; }
module.exports={bump, rng, compose, dad, chiusura, consecutiva, serieCinetica, errProfili};
