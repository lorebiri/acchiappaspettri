// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I10: mappe SINTETICHE con verità nota e i loro file nei formati letti da app/map-core.js (.wdf, ENVI, testo a griglia e a colonne,
// serie OPUS). Nessun dato reale: le strutture dei file seguono la descrizione pubblica dei formati (vedi i commenti di map-core.js).
'use strict';
// cubo: tre componenti gaussiane con mappe di concentrazione note, fondo lineare, posizione della prima banda che si sposta con x
function truth(opt){ opt=Object.assign({nx:12, ny:9, nc:701, x0:1800, x1:400, noise:0, seed:7, base:true, shift:true}, opt||{});
  const {nx,ny,nc}=opt, x=Float64Array.from({length:nc},(_,i)=>opt.x0+(opt.x1-opt.x0)*i/(nc-1));
  const bands=[{c:1000, s:8, A:100}, {c:1350, s:12, A:60}, {c:1600, s:10, A:80}];
  const conc=bands.map((_,k)=>{ const m=new Float64Array(nx*ny); for (let iy=0;iy<ny;iy++) for (let ix=0;ix<nx;ix++){ const u=ix/(nx-1), v=iy/(ny-1);
    m[iy*nx+ix]=opt.selective ? (k===0 ? Math.max(0,1-2*u) : k===1 ? Math.max(0,2*u-1) : Math.max(0,2*v-1))   // ogni componente ha pixel in cui è sola (MCR senza ambiguità)
      : k===0 ? 0.2+0.8*u : k===1 ? 0.1+0.9*v : 0.3+0.7*Math.exp(-((u-0.5)**2+(v-0.5)**2)/0.08); } return m; });
  const shift=new Float64Array(nx*ny); for (let iy=0;iy<ny;iy++) for (let ix=0;ix<nx;ix++) shift[iy*nx+ix]=opt.shift ? 3*ix/(nx-1)-1.5 : 0;   // −1,5 … +1,5 cm⁻¹
  let seed=opt.seed; const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647-0.5; };
  const data=new Float32Array(nx*ny*nc);
  for (let p=0;p<nx*ny;p++) for (let j=0;j<nc;j++){ let y=opt.base ? 5+0.002*(x[j]-400) : 0;   // fondo lineare
    bands.forEach((b,k)=>{ const c=k===0 ? b.c+shift[p] : b.c; y+=conc[k][p]*b.A*Math.exp(-0.5*((x[j]-c)/b.s)**2); });
    data[p*nc+j]=y+opt.noise*rnd(); }
  const cube={nx, ny, nc, data, x:{values:x, unit:'cm-1', quantity:'Raman shift'}, px:{values:Float64Array.from({length:nx},(_,i)=>10+0.5*i), unit:'µm'}, py:{values:Float64Array.from({length:ny},(_,i)=>-20+0.5*i), unit:'µm'}, y:{quantity:'counts'}, meta:{}};
  return {cube, conc, bands, shift}; }

/* ---------- .wdf: WDF1 (512 byte), DATA, XLST, YLST, ORGN, WMAP ---------- */
function block(name, body){ const b=Buffer.alloc(16+body.length); b.write(name,0,'latin1'); b.writeInt32LE(0,4); b.writeBigUInt64LE(BigInt(16+body.length),8); body.copy(b,16); return b; }
function wdf(cube, opt){ opt=opt||{}; const {nx,ny,nc,data}=cube, cap=nx*ny, count=opt.count!=null?opt.count:cap, colmajor=opt.order==='colmajor', line=!!opt.line;
  const order=[]; if (colmajor) for (let ix=0;ix<nx;ix++) for (let iy=0;iy<ny;iy++) order.push(iy*nx+ix); else for (let p=0;p<cap;p++) order.push(p);
  const h=Buffer.alloc(512); h.write('WDF1',0,'latin1'); h.writeInt32LE(1,4); h.writeBigUInt64LE(512n,8);
  h.writeInt32LE(nc,0x3c); h.writeBigUInt64LE(BigInt(cap),0x40); h.writeBigUInt64LE(BigInt(count),0x48); h.writeInt32LE(1,0x50); h.writeInt32LE(1,0x54); h.writeInt32LE(nc,0x58); h.writeInt32LE(3,0x5c);
  h.write('WiRE',0x60,'latin1'); [4,2,0,5000].forEach((v,k)=>h.writeUInt16LE(v,0x78+2*k)); h.writeInt32LE(colmajor?6:7,0x80); h.writeInt32LE(line?3:3,0x84); h.writeInt32LE(6,0x98); h.writeFloatLE(1e7/532,0x9c);
  h.write('Mappa sintetica',0xf0,'utf8');
  const D=Buffer.alloc(4*count*nc); for (let i=0;i<count;i++) for (let j=0;j<nc;j++) D.writeFloatLE(data[order[i]*nc+j], 4*(i*nc+j));
  const X=Buffer.alloc(8+4*nc); X.writeInt32LE(1,0); X.writeInt32LE(1,4); for (let j=0;j<nc;j++) X.writeFloatLE(cube.x.values[j], 8+4*j);
  const Y=Buffer.alloc(12); Y.writeInt32LE(4,0); Y.writeInt32LE(16,4); Y.writeFloatLE(1,8);
  const O=Buffer.alloc(4+3*(0x18+8*cap)); O.writeInt32LE(3,0); let c=4;
  for (const [dt,label] of [[3,'X'],[4,'Y'],[11,'Time']]){ O.writeUInt32LE(((dt<11?1:0)<<31 | dt)>>>0, c); O.writeInt32LE(dt===11?24:5, c+4); O.write(label, c+8, 'latin1');
    for (let i=0;i<cap;i++){ const p=order[i], ix=p%nx, iy=Math.floor(p/nx); if (dt===11) O.writeBigInt64LE(BigInt(1000+i)*10000000n, c+24+8*i); else O.writeDoubleLE(dt===3?cube.px.values[ix]:cube.py.values[iy], c+24+8*i); }
    c+=0x18+8*cap; }
  const W=Buffer.alloc(48); W.writeUInt32LE(colmajor?2:0,0); W.writeFloatLE(cube.px.values[0],8); W.writeFloatLE(cube.py.values[0],12); W.writeFloatLE(0,16);
  W.writeFloatLE(nx>1?cube.px.values[1]-cube.px.values[0]:1,20); W.writeFloatLE(ny>1?cube.py.values[1]-cube.py.values[0]:1,24); W.writeFloatLE(1,28); W.writeInt32LE(line?cap:nx,32); W.writeInt32LE(line?1:ny,36); W.writeInt32LE(1,40);
  return Buffer.concat([h, block('DATA',D), block('YLST',Y), block('XLST',X), block('ORGN',O), block('WMAP',W), block('TEXT',Buffer.from('prova sintetica'))]); }

/* ---------- ENVI ---------- */
const ENVI_W={1:[1,(b,o,v)=>b.writeUInt8(v,o)], 2:[2,(b,o,v,be)=>be?b.writeInt16BE(v,o):b.writeInt16LE(v,o)], 3:[4,(b,o,v,be)=>be?b.writeInt32BE(v,o):b.writeInt32LE(v,o)], 4:[4,(b,o,v,be)=>be?b.writeFloatBE(v,o):b.writeFloatLE(v,o)],
  5:[8,(b,o,v,be)=>be?b.writeDoubleBE(v,o):b.writeDoubleLE(v,o)], 12:[2,(b,o,v,be)=>be?b.writeUInt16BE(v,o):b.writeUInt16LE(v,o)]};
function envi(cube, opt){ opt=Object.assign({interleave:'bsq', dataType:4, byteOrder:0, offset:0, scale:1}, opt||{}); const {nx:S,ny:L,nc:B,data}=cube, [Bz,wr]=ENVI_W[opt.dataType], be=opt.byteOrder===1;
  const bin=Buffer.alloc(opt.offset+S*L*B*Bz); const at=opt.interleave==='bsq'?((s,l,b)=>(b*L+l)*S+s):opt.interleave==='bil'?((s,l,b)=>(l*B+b)*S+s):((s,l,b)=>(l*S+s)*B+b);
  for (let l=0;l<L;l++) for (let s=0;s<S;s++) for (let b=0;b<B;b++){ let v=data[(l*S+s)*B+b]*opt.scale; if (opt.dataType!==4 && opt.dataType!==5) v=Math.round(v); wr(bin, opt.offset+at(s,l,b)*Bz, v, be); }
  const hdr=['ENVI','description = {Mappa sintetica, Acchiappaspettri, test}',`samples = ${S}`,`lines   = ${L}`,`bands   = ${B}`,`header offset = ${opt.offset}`,'file type = ENVI Standard',`data type = ${opt.dataType}`,`interleave = ${opt.interleave}`,`byte order = ${opt.byteOrder}`,
    'wavelength units = Nanometers','wavelength = {', Array.from(cube.x.values).map(v=>v.toFixed(4)).join(',\n '), '}'].join('\n')+'\n';
  return {hdr, bin}; }

/* ---------- testo ---------- */
const fmt=v=>String(Math.fround(v));
function gridText(cube, sep){ sep=sep||'\t'; const {nx,ny,nc,data}=cube, out=[sep+sep+Array.from(cube.x.values).map(v=>String(v)).join(sep)];
  for (let iy=0;iy<ny;iy++) for (let ix=0;ix<nx;ix++){ const o=(iy*nx+ix)*nc, r=[cube.px.values[ix], cube.py.values[iy]].map(String); for (let j=0;j<nc;j++) r.push(fmt(data[o+j])); out.push(r.join(sep)); }
  return out.join('\r\n')+'\r\n'; }
function columnsText(cube){ const {nx,ny,nc,data}=cube, out=['#X\t#Y\t#Wave\t#Intensity'];
  for (let iy=0;iy<ny;iy++) for (let ix=0;ix<nx;ix++){ const o=(iy*nx+ix)*nc; for (let j=0;j<nc;j++) out.push([cube.px.values[ix], cube.py.values[iy], cube.x.values[j]].map(String).concat([fmt(data[o+j])]).join('\t')); }
  return out.join('\n')+'\n'; }

/* ---------- serie OPUS (blocco 3D, struttura DEDOTTA da brukeropus) ---------- */
function opusSeries(cube){ const n=cube.nx*cube.ny, np=cube.nc, x=cube.x.values, info=200;
  const params=(list)=>{ const parts=[]; for (const [k,t,v] of list){ const h=Buffer.alloc(8); h.write(k,0,'latin1'); h.writeUInt16LE(t,4); let body;
      if (t===0){ body=Buffer.alloc(4); body.writeInt32LE(v,0); } else if (t===1){ body=Buffer.alloc(8); body.writeDoubleLE(v,0); } else { body=Buffer.alloc(Math.ceil((v.length+1)/2)*2); body.write(v,0,'latin1'); }
      h.writeUInt16LE(body.length/2,6); parts.push(h, body); } const e=Buffer.alloc(8); e.write('END',0,'latin1'); parts.push(e); return Buffer.concat(parts); };
  const st=params([['DPF',0,1],['NPT',0,np],['FXV',1,x[0]],['LXV',1,x[np-1]],['CSF',1,1],['DXU',2,'WN']]);
  const head=Buffer.alloc(24); [0,n,24,4*np,info,0].forEach((v,k)=>head.writeInt32LE(v,4*k));
  const body=[head]; for (let i=0;i<n;i++){ const d=Buffer.alloc(4*np); for (let j=0;j<np;j++) d.writeFloatLE(cube.data[i*np+j],4*j); body.push(d, Buffer.alloc(info)); }
  const ser=Buffer.concat(body);
  const tSer=(15 | (0<<4) | (1<<10) | (2<<19))>>>0, tSt=(15 | (1<<4) | (1<<10) | (2<<19))>>>0;   // tipo 15 (come parseOPUS), dati e stato della serie
  const off0=600, offSt=off0, offSer=offSt+st.length+(4-st.length%4)%4, total=offSer+ser.length;
  const b=Buffer.alloc(total); b.writeUInt32LE(0xFEFE0A0A,0); b.writeDoubleLE(920622,4); b.writeInt32LE(24,12); b.writeInt32LE(40,16); b.writeInt32LE(2,20);
  b.writeUInt32LE(tSt,24); b.writeInt32LE(st.length/4|0,28); b.writeInt32LE(offSt,32); b.writeUInt32LE(tSer,36); b.writeInt32LE(Math.ceil(ser.length/4),40); b.writeInt32LE(offSer,44);
  st.copy(b, offSt); ser.copy(b, offSer); return b; }

module.exports={truth, wdf, envi, gridText, columnsText, opusSeries};
