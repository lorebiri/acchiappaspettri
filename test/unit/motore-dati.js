// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I5: file grandi sintetici per i test incrociati JS ↔ Rust e per le misure (scripts/misura-motore.js). Deterministici.
'use strict';
function rnd(seed){ let s=seed||7; return ()=>{ s=(s*16807)%2147483647; return s/2147483647-0.5; }; }
const gauss=(x,c,w)=>Math.exp(-0.5*((x-c)/w)**2);
// spettro da n punti, X crescente o decrescente, separatore e fine riga a scelta
function spectrum(n, opt){ opt=opt||{}; const r=rnd(opt.seed||3), sep=opt.sep||'\t', eol=opt.eol||'\n', L=new Array(n+1); L[0]=opt.head||('Wavenumber (cm-1)'+sep+'Absorbance');
  for (let i=0;i<n;i++){ const k=opt.down ? n-1-i : i, x=400+k*3600/(n-1); L[i+1]=x.toFixed(4)+sep+(gauss(x,1000,4)+0.6*gauss(x,2500,6)+0.4*gauss(x,3300,5)+0.01*r()).toFixed(6); }
  return Buffer.from(L.join(eol)+eol); }
// Agilent .uv (131) come test/fixtures/gen-canali.js, scritto a blocchi per arrivare a ~50 MB senza milioni di Buffer
function uv(nScans){ const a=190, b=600, s=2, m=(b-a)/s+1, head=Buffer.alloc(0x1002); head[0]=3; head.write('131',1,'latin1'); head.writeInt32BE(nScans,0x116);
  const name='Sintetico DAD'; head[0x35A]=name.length; for (let i=0;i<name.length;i++) head[0x35B+2*i]=name.charCodeAt(i);
  const len=20+2*m, out=Buffer.alloc(0x1002+nScans*len); head.copy(out,0); const r=rnd(5);
  for (let i=0;i<nScans;i++){ const p=0x1002+i*len, t=i*0.0005; out.writeUInt16LE(len,p); out.writeUInt32LE(Math.round(t*60000),p+2); out.writeUInt16LE(a*20,p+6); out.writeUInt16LE(b*20,p+8); out.writeUInt16LE(s*20,p+10);
    let prev=0; for (let j=0;j<m;j++){ const wl=a+s*j, y=200*gauss(t,8,0.15)*gauss(wl,260,25)+80*gauss(t,20,0.2)*gauss(wl,330,30)+0.5*r(), v=Math.round(y*2000); let d=v-prev; if (d<-32767) d=-32767; if (d>32767) d=32767; prev+=d; out.writeInt16LE(d,p+20+2*j); } }
  return out; }
// Shimadzu LabSolutions ASCII con più canali da n punti ciascuno
function shimadzu(n, chans){ const r=rnd(9), P=['[Header]','Application Name\tLabSolutions','Version\t5.97','Data File Name\tC:\\LabSolutions\\Data\\Grande.lcd','','[Sample Information]','Sample Name\tGrande',''];
  chans.forEach((c,k)=>{ P.push('[LC Chromatogram('+c+')]','Interval(msec)\t60','# of Points\t'+n,'Intensity Units\tuV','Intensity Multiplier\t1','Wavelength(nm)\t'+(254+26*k),'R.Time (min)\tIntensity');
    const L=new Array(n); for (let i=0;i<n;i++){ const t=i*0.001; L[i]=t.toFixed(4)+'\t'+Math.round(1e5*gauss(t,300+50*k,2)+50*r()); } P.push(L.join('\r\n'),''); });
  return Buffer.from(P.join('\r\n')); }
function files(){ return {
  'grande-1M.txt': spectrum(1e6),
  'grande-1M-decrescente.csv': spectrum(1e6, {down:true, sep:',', eol:'\r\n', head:'Wavenumber,Absorbance', seed:4}),
  'dad-50MB.uv': uv(120000),
  'shimadzu-50MB.txt': shimadzu(1e6, ['Detector A-Ch1','Detector A-Ch2','Detector B-Ch1']) }; }
module.exports={spectrum, uv, shimadzu, files};
