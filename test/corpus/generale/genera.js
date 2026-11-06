// SINTETICO: rigenera i file del gruppo «generale» del corpus, con le stesse formule di ~/build/acch-ga-fin/g_adv.js
// (agente «Generale e chimico analitico», ciclo finale) ma con un generatore di rumore a seme fisso. Uso: node test/corpus/generale/genera.js
'use strict';
const fs=require('fs'), path=require('path');
let s=20261106; const rnd=()=>{ s=(s*1103515245+12345)&0x7fffffff; return s/0x7fffffff; };
const g=()=>{ const u=rnd()||1e-9, v=rnd(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); };
const R=(a,b,st)=>{ const o=[]; for (let x=a; st>0?x<=b+1e-9:x>=b-1e-9; x+=st) o.push(+x.toFixed(6)); return o; };
const GF=(x,c,w,h)=>h*Math.exp(-4*Math.LN2*((x-c)/w)**2);
const wn=R(4000,400,-2);
const absAt=x=>0.05+GF(x,1720,20,0.8)+GF(x,2920,30,0.3)+GF(x,1100,40,0.5);
const ux=R(200,800,1), uvA=x=>GF(x,520,60,0.6)+GF(x,280,15,0.3), lex=785;
const F={
  'ft_A.csv':'# SINTETICO\nWavenumber (cm-1),Absorbance\n'+wn.map(x=>x+','+(absAt(x)+0.002*g()).toFixed(5)).join('\n')+'\n',
  'ft_T.csv':'# SINTETICO\nWavenumber (cm-1),Transmittance (%)\n'+wn.map(x=>x+','+(100*10**(-absAt(x))+0.05*g()).toFixed(4)).join('\n')+'\n',
  'ft_um.csv':'# SINTETICO\nWavelength (µm),Absorbance\n'+wn.slice().reverse().map(x=>(1e4/x).toFixed(5)+','+(absAt(x)+0.002*g()).toFixed(5)).join('\n')+'\n',
  'ft_umIR.csv':'# SINTETICO\n##TITLE=FTIR\nWavelength (um),Absorbance (IR)\n'+wn.slice().reverse().map(x=>(1e4/x).toFixed(5)+','+(absAt(x)+0.002*g()).toFixed(5)).join('\n')+'\n',
  'uv_nm.csv':'# SINTETICO\nWavelength (nm),Absorbance\n'+ux.map(x=>x+','+(uvA(x)+0.001*g()).toFixed(5)).join('\n')+'\n',
  'uv_eV.csv':'# SINTETICO\nEnergy (eV),Absorbance\n'+ux.slice().reverse().map(x=>(1239.84/x).toFixed(5)+','+(uvA(x)+0.001*g()).toFixed(5)).join('\n')+'\n',
  'uv_cm.csv':'# SINTETICO\nUV-Vis spectrum\nWavenumber (cm-1),Absorbance\n'+ux.slice().reverse().map(x=>(1e7/x).toFixed(2)+','+(uvA(x)+0.001*g()).toFixed(5)).join('\n')+'\n',
  'fl.csv':'# SINTETICO\nEmission spectrum\nWavelength (nm),Intensity (counts)\n'+R(350,750,1).map(x=>x+','+(GF(x,600,50,40000)+20*g()).toFixed(1)).join('\n')+'\n',
  'ram_nm.csv':'# SINTETICO\nRaman spectrum\nWavelength (nm),Intensity\n'+R(800,1000,0.1).map(x=>{ const sh=1e7/lex-1e7/x; return x.toFixed(2)+','+(200+GF(sh,1001,6,800)+GF(sh,1600,8,500)+5*g()).toFixed(2); }).join('\n')+'\n',
  'ram_cm.csv':'# SINTETICO\nRaman shift (cm-1),Intensity\n'+R(200,2000,1).map(sh=>sh+','+(200+GF(sh,1001,6,800)+GF(sh,1600,8,500)+5*g()).toFixed(2)).join('\n')+'\n',
};
for (const [n,t] of Object.entries(F)) fs.writeFileSync(path.join(__dirname,n), t);
console.log(Object.keys(F).length+' file scritti');
