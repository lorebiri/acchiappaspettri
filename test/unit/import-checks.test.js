// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Importazione e controlli aggiunti dopo il ciclo finale di collaudo: ogni caso è un errore che prima passava in silenzio
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), vm=require('vm');
const html=fs.readFileSync(path.join(__dirname,'..','..','index.html'),'utf8'), src=html.slice(html.indexOf('/*CORE-START*/'), html.indexOf('/*CORE-END*/'));
const C={console, Float64Array, Math, TextDecoder, Uint8Array, DataView, ArrayBuffer}; vm.createContext(C);
vm.runInContext(src+';globalThis.T={parseText,detectInstrument,eprIsAbsorption,eprDoubleIntegral,fpSetup,fpMat,fpParseComp,fpLayerSolve};', C); const T=C.T;
const R=(a,b,s)=>{ const o=[]; for (let x=a; x<=b+1e-9; x+=s) o.push(+x.toFixed(6)); return o; }, G=(x,c,w,h)=>h*Math.exp(-(((x-c)/w)**2)/2);
const maxAt=p=>{ let k=0; for (let i=1;i<p.ys.length;i++) if (p.ys[i]>p.ys[k]) k=i; return p.xs[k]; };

test('virgola come separatore delle migliaia: segnalata come il punto', ()=>{
  const rows=R(200,1800,1).map(x=>{ const y=Math.round(200+G(x,1086,6,5372)); return `${x}\t${y>=1000?Math.floor(y/1000)+','+String(y%1000).padStart(3,'0'):y}`; });
  const p=T.parseText('Raman shift\tIntensity\n'+rows.join('\n')); assert.ok(p.importIssue && p.importIssue.thou>0, 'nessun avviso sulle migliaia');
  // una virgola decimale vera (valori con decimali diversi da 3) non deve far scattare l'avviso
  const q=T.parseText('x;y\n'+R(200,1800,1).map(x=>`${x};${(1+G(x,1086,6,2.5)).toFixed(2).replace('.',',')}`).join('\n')); assert.ok(!q.importIssue || !q.importIssue.thou);
});
test('intestazione che inizia con una cifra non conta come riga persa', ()=>{
  for (const h of ['2Theta (deg)\tIntensity','13C shift;Intensity','4-nitrofenolo,A']){ const sep=h.includes('\t')?'\t':h.includes(';')?';':','; const p=T.parseText(h+'\n'+R(10,80,0.1).map(x=>x+sep+(100+G(x,30,0.2,900)).toFixed(1)).join('\n')); assert.ok(!p.importIssue || !p.importIssue.dropped, h); }
});
test('JCAMP: punti mancanti non spostano l\'asse e il file dichiarato più lungo è segnalato', ()=>{
  const n=1000, x0=10, x1=0, st=(x1-x0)/(n-1), y=i=>Math.round(1000*G(x0+i*st,2,0.02,1)+10); const lines=[];
  for (let i=0;i<n;i+=10){ if (i>=400 && i<440) continue; const xs=x0+i*st; lines.push(`${(xs/0.001).toFixed(0)} ${[...Array(10)].map((_,k)=>y(i+k)).join(' ')}`); }
  const txt=`##TITLE=SINTETICO\n##JCAMP-DX=5.01\n##XUNITS=PPM\n##XFACTOR=0.001\n##YFACTOR=1\n##FIRSTX=${x0}\n##LASTX=${x1}\n##NPOINTS=${n}\n##XYDATA=(X++(Y..Y))\n${lines.join('\n')}\n##END=`;
  const p=T.parseText(txt); assert.ok(Math.abs(maxAt(p)-2)<0.02, 'picco spostato: '+maxAt(p)); assert.ok((p.importBad||[]).some(m=>/NPOINTS/.test(m)), 'NPOINTS non controllato');
  assert.ok(T.parseText(txt.replace(/##FIRSTX=.*\n/,'')).reject, 'JCAMP senza FIRSTX accettato');
});
test('unità dell\'asse X dichiarate: eV, µm, Raman in nm', ()=>{
  const ev=T.parseText('Energy (eV),Absorbance\n'+R(200,800,1).reverse().map(x=>(1239.84/x).toFixed(5)+','+G(x,420,30,0.5).toFixed(5)).join('\n'));
  assert.equal(T.detectInstrument(ev,'a.csv').instr,'uv'); assert.ok(Math.abs(maxAt(ev)-420)<1.5);
  const um=T.parseText('Wavelength (µm),Absorbance\n'+R(600,4000,2).reverse().map(x=>(1e4/x).toFixed(5)+','+G(x,1715,10,0.8).toFixed(5)).join('\n'));
  assert.equal(T.detectInstrument(um,'a.csv').instr,'ftir'); assert.ok(Math.abs(maxAt(um)-1715)<3);
  const body=R(800,1000,0.1).map(x=>x.toFixed(2)+','+(200+G(1e7/785-1e7/x,1001,6,800)).toFixed(2)).join('\n');
  const rl=T.parseText('Raman spectrum, laser 785 nm\nWavelength (nm),Intensity\n'+body); assert.equal(T.detectInstrument(rl,'r.csv').instr,'raman'); assert.ok(Math.abs(maxAt(rl)-1001)<2);
  const rn=T.parseText('Raman spectrum\nWavelength (nm),Intensity\n'+body); assert.ok((rn.importBad||[]).length, 'Raman in nm senza laser non segnalato');
});
test('EPR in assorbimento riconosciuto, derivata no', ()=>{
  const B=Float64Array.from(R(330,350,0.02)), ab=Float64Array.from(B,b=>G(b,340,0.8,1)), de=Float64Array.from(B,b=>-(b-340)/0.64*G(b,340,0.8,1));
  assert.equal(T.eprIsAbsorption(B,ab), true); assert.equal(T.eprIsAbsorption(B,de), false);
});
test('spessore: cinabro su biacca non risulta «strato assente»', ()=>{
  const S=T.fpSetup({anode:'Rh',kv:40,psi1:45,psi2:45}), r=T.fpLayerSolve({S, cover:T.fpMat('cinabro'), sub:{comp:T.fpParseComp('PbCO3')}, el:'Pb', lines:['La','Lb'], method:'ratio', R:1.686, sR:0.02, R0meas:1.41});
  assert.ok(r && !r.below && r.mgcm2>0.5 && r.mgcm2<20, JSON.stringify(r&&{mg:r.mgcm2,below:r.below}));
});
