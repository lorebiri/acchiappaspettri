// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Spettri XRF SINTETICI (ciclo 27): bronzo arsenicale senza piombo (Cu 90, Sn 8, As 2) con pochi conteggi, tubo Rh 40 kV.
// Stesso modello di examples/genera-esempi-sintetici.js. Uso: node test/fixtures/xrf-c27/genera.js
'use strict';
const fs=require('fs'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','..','..','index.html'),'utf8');
eval(html.slice(html.indexOf('/*CORE-START*/'), html.indexOf('/*CORE-END*/'))+';global.C={fpTau,fpCompton,fpSetup,fpIntensities,fpLineE,FP,xrfFWHM}');
function rng(seed){ let s=seed>>>0||1; return ()=>{ s^=s<<13; s>>>=0; s^=s>>>17; s^=s<<5; s>>>=0; return s/4294967296; }; }
function gauss(r){ let u=0,v=0; while(!u)u=r(); while(!v)v=r(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }
function poisson(r, l){ if (l>30) return Math.max(0, Math.round(l+Math.sqrt(l)*gauss(r))); let L=Math.exp(-l), k=0, p=1; do { k++; p*=r(); } while (p>L); return k-1; }
function spectrum(comp, peakCounts, seed){
  const escSi=E=>{ if (E<1.9) return 0; const mi=C.fpTau('Si',E), mk=C.fpTau('Si',1.74); return 0.5*0.047*(1-1/10.4)*(1-(mk/mi)*Math.log(1+mi/mk)); };
  const els=Object.keys(comp), r=rng(seed), S=C.fpSetup({anode:'Rh', kv:40, psi1:45, psi2:45, d1:1, d2:1}), layers=[{comp, t:Infinity}];
  const xs=new Float64Array(2048).map((_,i)=>0.02*i), ys=new Float64Array(xs.length), lines=[];
  els.forEach(e=>{ for (const l of ['Ka','Kb','La','Lb']) if (C.fpLineE(e,l)) lines.push([e,l]); });
  const I=C.fpIntensities(layers, S, lines);
  const add=(E, A, fw)=>{ const sg=fw/2.3548; for (let i=0;i<xs.length;i++){ const d=xs[i]-E; if (Math.abs(d)<5*sg) ys[i]+=A*0.02*Math.exp(-0.5*(d/sg)**2)/(sg*2.5066); } };
  const peaks=[];
  els.forEach(e=>{ const F=C.FP.el[e].fam;
    for (const fam of ['K','L']){ if (!F[fam]) continue; const main=fam==='K'?'Ka':'La', Imain=I[e+' '+main]||0; if (!Imain) continue; const relMain=F[fam].find(x=>x[0]===main)[2];
      F[fam].forEach(([nm,E,rel])=>{ let A=Imain*rel/relMain; if (nm==='Kb') A=I[e+' Kb']||A; if (nm==='Lb1'||nm==='Lb2'||nm==='Lg1'||nm==='Ln'){ const tb=F.L.filter(x=>x[0].startsWith('Lb')).reduce((t,x)=>t+x[2],0); A=(I[e+' Lb']||0)*rel/tb; }
        if (E>0.9) peaks.push([E,A]); }); } });
  const mx=Math.max(...peaks.map(p=>p[1])), sc=peakCounts/mx;
  peaks.forEach(([E,A])=>{ add(E, A*sc, C.xrfFWHM(E)); const es=escSi(E); if (es>0) add(E-1.74, A*sc*es, C.xrfFWHM(E-1.74)); });
  const T=C.FP.el[S.anode].fam.K, th=(S.psi1+S.psi2)*Math.PI/180, IC=C.fpCompton(comp, S)*sc, relKa=T.find(x=>x[0]==='Ka')[2];
  T.forEach(([nm,E,rel])=>{ add(E, IC*0.3*rel/relKa, C.xrfFWHM(E)); add(E/(1+E/511*(1-Math.cos(th))), IC*rel/relKa, Math.hypot(C.xrfFWHM(E), 0.35)); });
  for (let i=0;i<xs.length;i++){ const x=xs[i]; const b=peakCounts*2e-4*(x>1.5? Math.exp(-(((x-12)/9)**2))+0.3 : 0.2); ys[i]=i<20?0:poisson(r, ys[i]+b); }
  let s='# DATI SINTETICI / SYNTHETIC DATA - ciclo 27, bronzo arsenicale senza Pb (Cu 90, Sn 8, As 2), picco '+peakCounts+' conteggi, seme '+seed+'\n'
       +'# Tube Anode: Rh\n# Tube Voltage: 40\n# Incident beam angle: 45\n# Fluorescence beam: 45\n# MCA Channels: 2048\n# Calibration1: 0 0\n# Calibration2: 2047 40,94\n#\n';
  for (let i=0;i<2048;i++) s+=ys[i]+'\n'; return s; }
if (require.main===module){ const out=process.argv[2]||__dirname, seeds=(process.argv[3]||'10').split(',').map(Number), pc=+(process.argv[4]||300);
  for (const sd of seeds) fs.writeFileSync(path.join(out, `B_${pc}_s${sd}.mca`), spectrum({Cu:0.90, Sn:0.08, As:0.02}, pc, sd)); }
module.exports={spectrum};
