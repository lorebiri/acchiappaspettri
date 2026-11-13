// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Fixture SINTETICHE dei file HPLC multicanale (tappa I3), costruite secondo la disposizione descritta in app/channels-core.js.
// DEDOTTO: i binari Agilent (.ch, .uv) seguono le descrizioni pubbliche delle librerie libere (rainbow-api, Aston), non file veri.
// Uso: node test/fixtures/gen-canali.js  → scrive test/fixtures/canali/ (lo usano i test e il collaudo e2e «apri-grezzi»).
'use strict';
const fs=require('fs'), path=require('path');

// cromatogramma sintetico: picchi gaussiani [tempo, altezza, sigma] su una base piatta, rumore deterministico
function chrom(n, dt, peaks, base, seed){ let s=seed||7; const rnd=()=>{ s=(s*16807)%2147483647; return s/2147483647-0.5; };
  const xs=[], ys=[]; for (let i=0;i<n;i++){ const t=i*dt; let y=(base||0.5)+0.02*rnd(); for (const [c,h,w] of peaks) y+=h*Math.exp(-0.5*((t-c)/w)**2); xs.push(t); ys.push(y); } return {xs, ys}; }

/* --- Agilent .ch --- */
function pascal(buf, off, str, wide){ const s=String(str||''); buf[off]=s.length; for (let i=0;i<s.length;i++){ if (wide){ buf[off+1+2*i]=s.charCodeAt(i)&255; buf[off+2+2*i]=s.charCodeAt(i)>>8; } else buf[off+1+i]=s.charCodeAt(i)&255; } }
function deltaEncode(ints, le){ const out=[]; let prev=0, seg=[]; const flush=()=>{ if (!seg.length) return; out.push(0x10, seg.length); for (const b of seg) out.push(...b); seg=[]; };
  const i16=v=>{ const b=Buffer.alloc(2); le?b.writeInt16LE(v):b.writeInt16BE(v); return [...b]; }, i32=v=>{ const b=Buffer.alloc(4); le?b.writeInt32LE(v):b.writeInt32BE(v); return [...b]; };
  for (const v of ints){ const d=v-prev; seg.push(d>-32768 && d<=32767 ? i16(d) : [...i16(-32768), ...i32(v)]); prev=v; if (seg.length===255) flush(); }
  flush(); return out; }
// version '179' (testi UTF-16) o '130' (ASCII); encoding 'delta' (interi × scala) o 'double'
function writeCh(o){ const ver=o.version||'179', wide=ver==='179', dataOff={179:0x1800,130:0x1000,30:0x400}[ver], scaleOff=ver==='179'?0x127C:0x284;
  const S=wide?{sample:0x35A, operator:0x758, date:0x957, method:0xA0E, units:0x104C, signal:0x1075}:{sample:0x18, operator:0x94, date:0xB2, method:0xE4, units:0x244, signal:0x254};
  const scale=o.scale||1e-3, ys=o.ys; let body;
  if ((o.encoding||'delta')==='delta'){ const ints=ys.map(v=>Math.round(v/scale)); body=Buffer.from(deltaEncode(ints,false)); }
  else { body=Buffer.alloc(8*ys.length); ys.forEach((v,i)=>body.writeDoubleLE(v,8*i)); }
  const head=Buffer.alloc(dataOff); head[0]=ver.length; head.write(ver,1,'latin1');
  head.writeInt32BE(ys.length,0x116); head.writeInt32BE(Math.round(o.t0*60000),0x11A); head.writeInt32BE(Math.round(o.t1*60000),0x11E);
  for (const k in S) pascal(head, S[k], o[k]||'', wide);
  head.writeDoubleBE((o.encoding||'delta')==='delta'?scale:1, scaleOff);
  return Buffer.concat([head, body]); }

/* --- Agilent .uv (131): spettri nel tempo --- */
function writeUv(o){ const n=o.times.length, head=Buffer.alloc(0x1002); head[0]=3; head.write('131',1,'latin1'); head.writeInt32BE(n,0x116); pascal(head,0x35A,o.sample||'',true);
  const parts=[head];
  for (let i=0;i<n;i++){ const v=o.spectra[i].map(x=>Math.round(x*2000)), enc=[]; let prev=0; for (const x of v){ const d=x-prev; if (d>-32768 && d<=32767){ const b=Buffer.alloc(2); b.writeInt16LE(d); enc.push(b); } else { const b=Buffer.alloc(6); b.writeInt16LE(-32768); b.writeInt32LE(x,2); enc.push(b); } prev=x; }
    const data=Buffer.concat(enc), h=Buffer.alloc(20); h.writeUInt16LE(20+data.length,0); h.writeUInt32LE(Math.round(o.times[i]*60000),2); h.writeUInt16LE(Math.round(o.a*20),6); h.writeUInt16LE(Math.round(o.b*20),8); h.writeUInt16LE(Math.round(o.s*20),10);
    parts.push(h, data); }
  return Buffer.concat(parts); }

/* --- testi --- */
const tsv=c=>c.xs.map((t,i)=>t.toFixed(4)+'\t'+c.ys[i].toFixed(5)).join('\r\n');
function writeArw(blocks){ return blocks.map(b=>'"SampleName"\t"Channel"\t"Vial"\t"Injection"\t"Sample Set Name"\r\n"'+b.sample+'"\t"'+b.channel+'"\t"1"\t"1"\t"Sintetico"\r\n'+tsv(b)).join('\r\n')+'\r\n'; }
function writeShimadzu(samples){ return samples.map(s=>['[Header]','Application Name\tLabSolutions','Version\t5.97','Data File Name\tC:\\LabSolutions\\Data\\'+s.sample+'.lcd','Output Date\t13/11/2026','',
    '[Sample Information]','Operator\tSintetico','Sample Name\t'+s.sample,'Sample ID\t'+s.sample,'',
    '[Peak Table(Detector A-Ch1)]','# of Peaks\t1','Peak#\tR.Time\tI.Time\tF.Time\tArea\tHeight','1\t5.000\t4.800\t5.200\t1234\t567','',
    ...(s.status?['[LC Status Trace(Pump A Pressure)]','Interval(msec)\t500','# of Points\t3','R.Time (min)\tIntensity','0.0\t12.1','0.1\t12.2','0.2\t12.3','']:[]),
    ...s.channels.flatMap(c=>['[LC Chromatogram('+c.name+')]','Interval(msec)\t'+Math.round((c.xs[1]-c.xs[0])*60000),'# of Points\t'+(c.declare!=null?c.declare:c.xs.length),'Start Time(min)\t'+c.xs[0].toFixed(3),'End Time(min)\t'+c.xs[c.xs.length-1].toFixed(3),'Intensity Units\tuV','Intensity Multiplier\t'+(c.mult||1),...(c.wl?['Wavelength(nm)\t'+c.wl]:[]),'R.Time (min)\tIntensity',
      c.xs.map((t,i)=>t.toFixed(5)+'\t'+Math.round(c.ys[i]/(c.mult||1))).join('\r\n'),''])].join('\r\n')).join('\r\n'); }
// ChemStation / OpenLab, CSV con un segnale per colonna
function writeCsvCols(names, chans){ return 'Time (min),'+names.map(n=>'"'+n+'"').join(',')+'\r\n'+chans[0].xs.map((t,i)=>t.toFixed(4)+','+chans.map(c=>c.ys[i].toFixed(5)).join(',')).join('\r\n')+'\r\n'; }
// ChemStation, segnali uno dopo l'altro con la loro intestazione
function writeCsvBlocks(heads, chans){ return chans.map((c,k)=>heads[k]+'\r\nTime (min),Value (mAU)\r\n'+c.xs.map((t,i)=>t.toFixed(4)+','+c.ys[i].toFixed(5)).join('\r\n')).join('\r\n\r\n')+'\r\n'; }

// il caso del committente: Agilent 1260, DAD G4212B, due segnali per campione (254 e 280 nm) in cartelle .D
function corpus(){ const out={}, T=(h,seed)=>chrom(3001, 0.004, [[5,40*h,0.05],[8,15*h,0.06]], 0.5, seed);
  [['STD1',1],['STD2',2],['STD3',3],['INC',1.5]].forEach(([n,c],k)=>{
    const A=T(c,11+k), B=T(c/3,31+k);
    out[n+'.D/DAD1A.ch']=writeCh({sample:n, signal:'DAD1 A, Sig=254,4 Ref=360,100', units:'mAU', method:'SALIVA.M', t0:A.xs[0], t1:A.xs[A.xs.length-1], ys:A.ys});
    out[n+'.D/DAD1B.ch']=writeCh({sample:n, signal:'DAD1 B, Sig=280,4 Ref=360,100', units:'mAU', method:'SALIVA.M', t0:B.xs[0], t1:B.xs[B.xs.length-1], ys:B.ys}); });
  const A=chrom(1201,0.00833,[[5,20000,0.05]],100,3), B=chrom(1201,0.00833,[[5,7000,0.05]],100,5);
  out['shimadzu-2canali.txt']=writeShimadzu([{sample:'MIX1', status:true, channels:[Object.assign({name:'Detector A-Ch1', wl:254},A), Object.assign({name:'Detector A-Ch2', wl:280},B)]}]);
  out['waters-2canali.arw']=writeArw([Object.assign({sample:'MIX1', channel:'PDA Ch1 254nm@1.2nm'},chrom(1001,0.01,[[4,0.3,0.05]],0.001,9)), Object.assign({sample:'MIX1', channel:'PDA Ch2 280nm@1.2nm'},chrom(1001,0.01,[[4,0.1,0.05]],0.001,10))]);
  return out; }
module.exports={chrom, writeCh, writeUv, writeArw, writeShimadzu, writeCsvCols, writeCsvBlocks, deltaEncode, corpus};
if (require.main===module){ const dir=path.join(__dirname,'canali'); for (const [rel,data] of Object.entries(corpus())){ const p=path.join(dir,rel); fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,data); } console.log('fixture sintetiche in', dir); }
