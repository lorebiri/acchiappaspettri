// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Isoterme sintetiche con parametri noti (dati sintetici, dichiarati come tali): servono ai test R10 e alle fixture.
'use strict';
// BET esatto: n = nm C x / ((1−x)(1+(C−1)x))
const betN=(x, nm, C)=>nm*C*x/((1-x)*(1+(C-1)*x));
// mesoporoso plausibile: GAB (k < 1) più condensazione capillare logistica; il desorbimento condensa a pressione più bassa (isteresi)
function meso(x, o, des){ o=o||{}; const nm=o.nm||45, C=o.C||120, k=o.k||0.72, V=o.Vcap||300, xc=des?(o.xd||0.66):(o.xa||0.75), w=des&&o.wd?o.wd:(o.w||0.025);
  return nm*C*k*x/((1-k*x)*(1+(C-1)*k*x)) + V/(1+Math.exp(-(x-xc)/w)); }
// microporoso (tipo I): Langmuir più un poco di multistrato esterno
const micro=(x, o)=>{ o=o||{}; return (o.nL||250)*(o.K||4000)*x/(1+(o.K||4000)*x) + (o.ext||20)*x/(1-0.8*x); };
// Langmuir–Freundlich con b(T) = b0 exp(Q/RT): a quantità costante ln p è lineare in 1/T con pendenza −Q/R (calore isosterico esatto)
function lf(p, T, o){ const R=8.314462618, b=o.b0*Math.exp(o.Q*1000/(R*T)), q=Math.pow(b*p, o.t); return o.nm*q/(1+q); }
function grid(a, b, n, log){ const out=[]; for (let i=0;i<n;i++){ const f=i/(n-1); out.push(log? Math.exp(Math.log(a)+f*(Math.log(b)-Math.log(a))) : a+f*(b-a)); } return out; }
module.exports={betN, meso, micro, lf, grid};
