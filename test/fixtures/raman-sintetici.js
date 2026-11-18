// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Spettri Raman SINTETICI con verità nota per la rimozione del fondo: picchi (lorentziani, gaussiani e misti, FWHM 6–36 cm⁻¹)
// sopra un fondo di fluorescenza noto (gobba gaussiana larga, polinomio di 3° grado o decadimento esponenziale), più rumore gaussiano.
// Generatore deterministico (LCG): gli stessi semi danno sempre gli stessi spettri, sul Mac, in CI e qui.
'use strict';
function rng(s){ return ()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; }; }
function gauss(r){ let u=0; while(!u) u=r(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*r()); }
/* seme → {x, y, base, peaks, P, kind}; opt.n punti (1500), opt.noise deviazione standard del rumore in unità del picco più alto (0,01),
   opt.amp ampiezza del fondo in unità di picco (2–8) */
function raman(seed, opt){
  opt=opt||{}; const r=rng(seed), n=opt.n||1500, noise=opt.noise==null?0.01:opt.noise;
  const x=new Float64Array(n), y=new Float64Array(n), base=new Float64Array(n), peaks=new Float64Array(n);
  for (let i=0;i<n;i++) x[i]=200+3000*i/(n-1);
  const np=4+Math.floor(r()*6), P=[]; for (let k=0;k<np;k++) P.push({c:300+r()*2800, w:6+r()*30, h:0.2+r()*0.8, lor:r()});
  const H=Math.max(...P.map(p=>p.h)); P.forEach(p=>{ p.h/=H; });   // il picco più alto vale 1
  const kind=Math.floor(r()*3), A=2+r()*6, c0=800+r()*2000, s0=800+r()*1500;
  for (let i=0;i<n;i++){ const t=(x[i]-1700)/1500;
    const b = kind===0 ? A*Math.exp(-(((x[i]-c0)/s0)**2)) : kind===1 ? A*(0.5+0.4*t-0.3*t*t+0.2*t*t*t) : A*Math.exp(-(x[i]-200)/1000)+0.5;
    let p=0; for (const q of P){ const d=(x[i]-q.c)/(q.w/2); p+=q.h*(q.lor/(1+d*d)+(1-q.lor)*Math.exp(-Math.LN2*d*d)); }
    base[i]=b; peaks[i]=p; y[i]=b+p+noise*gauss(r); }
  return {x, y, base, peaks, P, kind};
}
/* errore del fondo stimato rispetto a quello vero, in % del picco più alto: rmse e massimo */
function err(est, truth){ let q=0, M=0; for (let i=0;i<truth.length;i++){ const d=est[i]-truth[i]; q+=d*d; if (Math.abs(d)>M) M=Math.abs(d); } return {rmse:100*Math.sqrt(q/truth.length), max:100*M}; }
const quant=(a,p)=>{ const s=a.slice().sort((u,v)=>u-v); return s[Math.min(s.length-1, Math.floor(p*s.length))]; };
module.exports={raman, err, quant, rng, gauss};
