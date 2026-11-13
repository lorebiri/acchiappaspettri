// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Prepara vendor/fonts/WenQuanYiMicroHei.ttf dall'archivio ufficiale wqy-microhei-0.2.0-beta.tar.gz (wqy-microhei.ttc):
// 1. estrae la prima faccia del TTC (WenQuanYi Micro Hei, proporzionale): jsPDF non legge i TTC;
// 2. copia nella tabella hmtx l'avanzamento dei glifi composti marcati USE_MY_METRICS (gli hangul): i lettori PDF
//    e i programmi lo prendono dal componente, jsPDF no, e senza questa copia i caratteri coreani si sovrappongono.
// I contorni (glyf) e tutte le altre tabelle restano identici byte per byte.
// Uso: node scripts/font-cjk.js <wqy-microhei.ttc> vendor/fonts/WenQuanYiMicroHei.ttf
'use strict';
const fs=require('fs'); const [src,dst]=process.argv.slice(2); const b=fs.readFileSync(src);
if (b.toString('latin1',0,4)!=='ttcf') throw new Error('non è un TTC');
const off=b.readUInt32BE(12), n=b.readUInt16BE(off+4), tabs=[];
for (let i=0;i<n;i++){ const o=off+12+i*16; tabs.push({tag:b.toString('latin1',o,o+4), off:b.readUInt32BE(o+8), len:b.readUInt32BE(o+12)}); }
const T=Object.fromEntries(tabs.map(t=>[t.tag, Buffer.from(b.subarray(t.off, t.off+t.len))]));
const nh=T.hhea.readUInt16BE(34), ng=T.maxp.readUInt16BE(4), longLoca=T.head.readInt16BE(50)===1;
const loca=g=>longLoca ? T.loca.readUInt32BE(4*g) : 2*T.loca.readUInt16BE(2*g);
let fixed=0;
for (let g=0; g<Math.min(ng, nh); g++){
  let p=loca(g); if (loca(g+1)===p || T.glyf.readInt16BE(p)>=0) continue;   // vuoto o semplice
  p+=10; for (;;){ const fl=T.glyf.readUInt16BE(p), c=T.glyf.readUInt16BE(p+2);
    if (fl & 0x0200){ if (c<nh){ const a=T.hmtx.readUInt16BE(4*c), l=T.hmtx.readInt16BE(4*c+2); if (T.hmtx.readUInt16BE(4*g)!==a){ T.hmtx.writeUInt16BE(a,4*g); T.hmtx.writeInt16BE(l,4*g+2); fixed++; } } break; }
    if (!(fl & 0x0020)) break;
    p+=4+((fl & 0x0001)?4:2)+((fl & 0x0008)?2:(fl & 0x0040)?4:(fl & 0x0080)?8:0); } }
const sum=buf=>{ const q=Buffer.concat([buf, Buffer.alloc((4-buf.length%4)%4)]); let s=0; for (let i=0;i<q.length;i+=4) s=(s+q.readUInt32BE(i))>>>0; return s; };
T.head.writeUInt32BE(0,8);
const tags=Object.keys(T).sort(), hdr=Buffer.alloc(12+16*tags.length); b.copy(hdr,0,off,off+12);
let pos=hdr.length; const parts=[hdr], at={};
tags.forEach((t,i)=>{ const d=T[t], o=12+i*16; hdr.write(t,o,'latin1'); hdr.writeUInt32BE(sum(d),o+4); hdr.writeUInt32BE(pos,o+8); hdr.writeUInt32BE(d.length,o+12); at[t]=pos; const pd=Buffer.concat([d, Buffer.alloc((4-d.length%4)%4)]); parts.push(pd); pos+=pd.length; });
const out=Buffer.concat(parts); out.writeUInt32BE((0xB1B0AFBA-sum(out))>>>0, at.head+8);
fs.writeFileSync(dst,out); console.log(`${dst}: ${out.length} byte, ${ng} glifi, avanzamento copiato dal componente in ${fixed} glifi composti`);
