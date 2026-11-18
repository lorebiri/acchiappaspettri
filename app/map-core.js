// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Mappe e dati iperspettrali (tappa I10, SPEC-AVANZATE §1): parte pura, senza DOM. Gira nella pagina, nel worker del desktop e in Node.
   Il cubo è {nx, ny, nc, data, x, px, py, y, meta}: data (Float32Array o Float64Array) in ordine «yxc» come f.cube del formato 2
   (il canale c del pixel ix, iy è data[(iy*nx+ix)*nc+c]); x è l'asse spettrale, px e py le coordinate dei pixel.
   Lettori: Renishaw .wdf, ENVI (.hdr + binario), testo a mappa (griglia LabSpec e colonne X Y onda intensità), serie OPUS (DEDOTTO).
   Calcoli: immagini di banda (area, altezza, rapporto, posizione del picco), spettro di un pixel, spettro medio di una regione,
   accorpamento dei pixel, cubo srotolato per MCR-ALS. Il Rust (src-tauri/acch-core/src/cube.rs) rifà le stesse operazioni nello stesso
   ordine e i test incrociati (test/unit/dual-mappe.test.js) li confrontano bit per bit: qui solo + − × ÷ e confronti, nessuna funzione
   trascendente nei numeri che vanno confrontati. I calcoli lunghi sono generatori (l'interfaccia li fa avanzare a fette). */
(function(root, factory){
  if (typeof module==='object' && module.exports) module.exports=factory();
  else root.AcchMap=factory();
})(typeof self!=='undefined' ? self : this, function(){
  'use strict';
  const VERSION='map-1';
  class MapError extends Error{ constructor(code, detail){ super(code+(detail?': '+detail:'')); this.name='MapError'; this.code=code; this.detail=detail||''; } }
  const LE=new Uint8Array(new Uint16Array([1]).buffer)[0]===1;
  function drain(g){ let r; do { r=g.next(); } while (!r.done); return r.value; }
  const u8of=b=>b instanceof Uint8Array ? b : ArrayBuffer.isView(b) ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : new Uint8Array(b);
  const dvOf=u=>new DataView(u.buffer, u.byteOffset, u.byteLength);
  function ascii(u, a, b){ let s=''; for (let i=a;i<b && i<u.length;i++){ const c=u[i]; if (!c) break; s+=String.fromCharCode(c); } return s; }
  function utf8z(u, a, b){ let e=a; while (e<b && e<u.length && u[e]) e++; try{ return new TextDecoder('utf-8').decode(u.subarray(a,e)); }catch(_){ return ascii(u,a,e); } }
  const u64=(dv,o)=>dv.getUint32(o,true)+dv.getUint32(o+4,true)*4294967296;
  // f32 little-endian dai byte, senza dipendere dall'allineamento
  function f32At(u, off, n){ if (off+4*n>u.length) throw new MapError('truncated'); const out=new Float32Array(n);
    if (LE && ((u.byteOffset+off)&3)===0) out.set(new Float32Array(u.buffer, u.byteOffset+off, n)); else new Uint8Array(out.buffer).set(u.subarray(off, off+4*n));
    if (!LE){ const dv=dvOf(u); for (let i=0;i<n;i++) out[i]=dv.getFloat32(off+4*i,true); }
    return out; }
  const MAXPIX=1<<26;   // pixel × canali oltre i quali il lettore JS rifiuta (la pagina non regge cubi così grandi: li legge il Rust)

  /* ---------------- Renishaw WiRE .wdf ----------------
     Struttura pubblica ricavata per ingegneria inversa (py-wdf-reader, MIT; costanti dal progetto Gwyddion): blocchi con intestazione di
     16 byte (nome di 4 caratteri, uid i32, lunghezza u64 compresa l'intestazione). WDF1 (512 byte) ha i campi della misura; DATA gli spettri
     f32 uno dopo l'altro nell'ordine di acquisizione; XLST l'asse spettrale; ORGN le coordinate (f64) di ogni spettro; WMAP la griglia.
     Validato su file pubblici (vedi docs/VALIDAZIONE.md, R12): nessun file proprio del committente. */
  const WDF_UNIT={1:'cm-1', 2:'cm-1', 3:'nm', 4:'eV', 5:'µm', 8:'mm', 9:'m', 12:'s', 13:'ms', 16:'px'};
  function wdfBlocks(u){ const dv=dvOf(u), B={}, list=[]; let p=0;
    while (p+16<=u.length){ const name=ascii(u,p,p+4), size=u64(dv,p+8); if (!(size>=16) || !/^[\x20-\x7e]{4}$/.test(String.fromCharCode(u[p],u[p+1],u[p+2],u[p+3]))) break;
      list.push({name, pos:p, size}); if (!B[name]) B[name]={pos:p, size}; p+=size; }
    return {B, list}; }
  function wdfInfo(u){ const dv=dvOf(u); if (u.length<512 || ascii(u,0,4)!=='WDF1') throw new MapError('not-wdf');
    const {B}=wdfBlocks(u); if (!B.DATA || !B.XLST) throw new MapError('wdf-blocks');
    const I={pps:dv.getInt32(0x3c,true), capacity:u64(dv,0x40), count:u64(dv,0x48), accumulations:dv.getInt32(0x50,true), ylen:dv.getInt32(0x54,true), xlen:dv.getInt32(0x58,true),
      norigin:dv.getInt32(0x5c,true), app:ascii(u,0x60,0x78), version:[0,1,2,3].map(k=>dv.getUint16(0x78+2*k,true)).join('.'), scan:dv.getInt32(0x80,true), measurement:dv.getInt32(0x84,true),
      dataUnit:dv.getInt32(0x98,true), laser:dv.getFloat32(0x9c,true), user:utf8z(u,0xd0,0xf0), title:utf8z(u,0xf0,0x200), B};
    if (!(I.pps>0) || !(I.count>0) || I.count>I.capacity || I.xlen!==I.pps) throw new MapError('wdf-header');
    if (B.DATA.pos+16+4*I.count*I.pps>u.length) throw new MapError('truncated');
    const xl=B.XLST.pos+16; if (xl+8+4*I.pps>u.length) throw new MapError('truncated'); I.xType=dv.getInt32(xl,true); I.xUnit=dv.getInt32(xl+4,true);
    // coordinate di ogni spettro (ORGN): tipo 3 X, 4 Y, 5 Z, 11 tempo (interi da 100 ns)
    I.orgn={}; if (B.ORGN && I.norigin>0){ let c=B.ORGN.pos+0x14; const step=0x18+8*I.capacity;
      for (let k=0;k<I.norigin && c+step<=B.ORGN.pos+B.ORGN.size && c+step<=u.length;k++, c+=step){ const p1=dv.getUint32(c,true), dt=p1&0x7fffffff, unit=dv.getInt32(c+4,true), label=ascii(u,c+8,c+24);
        if (dt===3 || dt===4 || dt===5){ const v=new Float64Array(I.count); for (let i=0;i<I.count;i++) v[i]=dv.getFloat64(c+24+8*i,true); I.orgn[dt]={v, unit, label}; } } }
    if (B.WMAP && B.WMAP.size>=0x38 && B.WMAP.pos+0x38<=u.length){ const w=B.WMAP.pos; I.wmap={flags:dv.getUint32(w+0x10,true), x0:dv.getFloat32(w+0x18,true), y0:dv.getFloat32(w+0x1c,true), dx:dv.getFloat32(w+0x24,true), dy:dv.getFloat32(w+0x28,true), w:dv.getInt32(w+0x30,true), h:dv.getInt32(w+0x34,true)}; }
    return I; }
  /* posto di ogni spettro nella griglia: dalle coordinate X, Y se tornano con il passo di WMAP (vale anche per le scansioni per colonne
     o a serpentina), altrimenti nell'ordine di acquisizione riga per riga. Restituisce {nx, ny, idx (spettro → pixel), how} */
  function wdfPlace(I){ const n=I.count, W=I.wmap, X=I.orgn[3], Y=I.orgn[4];
    if (W && W.w>0 && W.h>0 && W.w*W.h===I.capacity && W.w>1 && W.h>1){ const nx=W.w, ny=W.h;
      if (X && Y && W.dx>0 && W.dy>0){ let x0=Infinity, y0=Infinity; for (let i=0;i<n;i++){ if (X.v[i]<x0) x0=X.v[i]; if (Y.v[i]<y0) y0=Y.v[i]; }
        const idx=new Int32Array(n), seen=new Uint8Array(nx*ny); let ok=true;
        for (let i=0;i<n && ok;i++){ const ix=Math.round((X.v[i]-x0)/W.dx), iy=Math.round((Y.v[i]-y0)/W.dy); if (!(ix>=0 && ix<nx && iy>=0 && iy<ny) || seen[iy*nx+ix]){ ok=false; break; } seen[iy*nx+ix]=1; idx[i]=iy*nx+ix; }
        if (ok) return {nx, ny, idx, how:'position', x0, y0}; }
      const idx=new Int32Array(n); for (let i=0;i<n;i++) idx[i]=i; return {nx, ny, idx, how:'raster'}; }
    const idx=new Int32Array(n); for (let i=0;i<n;i++) idx[i]=i; return {nx:I.capacity, ny:1, idx, how:'line'}; }
  // copia degli spettri al loro posto, a fette (cubi di centinaia di MB senza bloccare la pagina)
  function* placeGen(u, off, count, nc, idx, np){ const data=new Float32Array(np*nc); if (count<np) data.fill(NaN); const db=new Uint8Array(data.buffer), dv=dvOf(u); let w=0;
    for (let i=0;i<count;i++){ const a=off+4*i*nc, q=idx[i]*nc; if (LE) db.set(u.subarray(a, a+4*nc), 4*q); else for (let j=0;j<nc;j++) data[q+j]=dv.getFloat32(a+4*j,true);
      if ((w+=nc)>=SLICE*16){ w=0; yield {phase:'read', frac:i/count}; } }
    return data; }
  function* readWdfGen(buf){ const u=u8of(buf), I=wdfInfo(u), P=wdfPlace(I), nc=I.pps, np=P.nx*P.ny;
    if (np*nc>MAXPIX) throw new MapError('too-large', String(np*nc));
    const x=Float64Array.from(f32At(u, I.B.XLST.pos+24, nc)), data=yield* placeGen(u, I.B.DATA.pos+16, I.count, nc, P.idx, np);
    // coordinate dei pixel: passo di WMAP (µm) dalla posizione minima; linee e serie: distanza percorsa (o Z per le profondità)
    let px, py, pu='µm'; const X=I.orgn[3], Y=I.orgn[4], Z=I.orgn[5];
    if (P.ny>1){ const W=I.wmap, x0=P.x0!=null?P.x0:(X?X.v[0]:0), y0=P.y0!=null?P.y0:(Y?Y.v[0]:0); px=Float64Array.from({length:P.nx},(_,i)=>x0+i*W.dx); py=Float64Array.from({length:P.ny},(_,i)=>y0+i*W.dy); }
    else { py=Float64Array.of(0); px=new Float64Array(P.nx);
      if (X && Y){ for (let i=1;i<I.count;i++){ const a=X.v[i]-X.v[i-1], b=Y.v[i]-Y.v[i-1]; px[i]=px[i-1]+Math.sqrt(a*a+b*b); } for (let i=I.count;i<P.nx;i++) px[i]=px[i-1]+1; }
      else if (Z){ for (let i=0;i<P.nx;i++) px[i]=i<I.count?Z.v[i]:px[i-1]+1; }
      else { pu=''; for (let i=0;i<P.nx;i++) px[i]=i; } }
    const meta={format:'wdf', title:I.title, app:(I.app+' '+I.version).trim(), laserNm:I.laser>0?+(1e7/I.laser).toFixed(3):null, accumulations:I.accumulations, measurement:I.measurement, scan:I.scan,
      spectra:I.count, capacity:I.capacity, placement:P.how, complete:I.count===I.capacity};
    yield {phase:'read', frac:1};
    return {nx:P.nx, ny:P.ny, nc, data, x:{values:x, unit:WDF_UNIT[I.xUnit]||'', quantity:I.xUnit===1?'Raman shift':''}, px:{values:px, unit:pu}, py:{values:py, unit:pu}, y:{quantity:I.dataUnit===6?'counts':'intensity'}, meta}; }

  /* ---------------- ENVI (.hdr + binario) ----------------
     Intestazione testuale «ENVI» con chiave = valore (liste fra graffe anche su più righe): samples, lines, bands, header offset, data type
     (1 u8, 2 i16, 3 i32, 4 f32, 5 f64, 12 u16, 13 u32, 14 i64, 15 u64), interleave (bsq, bil, bip), byte order, wavelength, map info.
     Riferimento: documentazione ENVI e SPy (spectral, MIT). */
  function parseEnviHeader(text){ const s=String(text).replace(/^﻿/,''); if (!/^\s*ENVI\b/.test(s)) throw new MapError('not-envi');
    const H={}, re=/^\s*([^=\n\r{}]+?)\s*=\s*(\{[\s\S]*?\}|[^\r\n]*)/gm; let m;
    while ((m=re.exec(s))){ const k=m[1].trim().toLowerCase(); let v=m[2].trim(); if (v[0]==='{') v=v.slice(1,-1).split(',').map(t=>t.trim()).filter(t=>t!==''); H[k]=v; }
    const int=k=>{ const v=parseInt(H[k],10); return Number.isFinite(v)?v:null; };
    const S=int('samples'), L=int('lines'), Bn=int('bands'), dt=int('data type');
    if (!(S>0) || !(L>0) || !(Bn>0) || dt==null) throw new MapError('envi-header');
    const wl=Array.isArray(H.wavelength) ? H.wavelength.map(Number) : null;
    return {samples:S, lines:L, bands:Bn, dataType:dt, offset:int('header offset')||0, interleave:String(H.interleave||'bsq').toLowerCase(), byteOrder:int('byte order')||0,
      wavelength:wl && wl.length===Bn && wl.every(Number.isFinite) ? wl : null, wavelengthUnits:typeof H['wavelength units']==='string'?H['wavelength units']:'',
      mapInfo:Array.isArray(H['map info'])?H['map info']:null, ignore:H['data ignore value']!=null && Number.isFinite(+H['data ignore value']) ? +H['data ignore value'] : null,
      description:Array.isArray(H.description)?H.description.join(', '):(typeof H.description==='string'?H.description:''), fileType:typeof H['file type']==='string'?H['file type']:''}; }
  const ENVI_T={1:[1,'u8'], 2:[2,'i16'], 3:[4,'i32'], 4:[4,'f32'], 5:[8,'f64'], 12:[2,'u16'], 13:[4,'u32'], 14:[8,'i64'], 15:[8,'u64']};
  // i tipi che stanno esatti in f32 (interi fino a 2^24) restano f32; gli altri in f64
  const enviF32=dt=>dt===1 || dt===2 || dt===4 || dt===12;
  function enviUnit(u){ const s=String(u||'').toLowerCase(); return /nanomet|^nm$/.test(s)?'nm':/micromet|micron|^um$|^µm$/.test(s)?'µm':/wavenumber|cm-1|1\/cm/.test(s)?'cm-1':s?u:''; }
  function* readEnviGen(hdr, buf){ const H=typeof hdr==='string'?parseEnviHeader(hdr):hdr, T=ENVI_T[H.dataType]; if (!T) throw new MapError('envi-type', String(H.dataType));
    const [Bz, kind]=T, S=H.samples, L=H.lines, B=H.bands, n=S*L*B, u=u8of(buf), le=H.byteOrder!==1;
    if (!['bsq','bil','bip'].includes(H.interleave)) throw new MapError('envi-interleave', H.interleave);
    if (n>MAXPIX) throw new MapError('too-large', String(n));
    if (H.offset+n*Bz>u.length) throw new MapError('truncated');
    const dv=dvOf(u), out=enviF32(H.dataType)?new Float32Array(n):new Float64Array(n), o=H.offset;
    const get=kind==='u8'?(i=>u[o+i]):kind==='i16'?(i=>dv.getInt16(o+2*i,le)):kind==='u16'?(i=>dv.getUint16(o+2*i,le)):kind==='i32'?(i=>dv.getInt32(o+4*i,le)):kind==='u32'?(i=>dv.getUint32(o+4*i,le))
      :kind==='f32'?(i=>dv.getFloat32(o+4*i,le)):kind==='f64'?(i=>dv.getFloat64(o+8*i,le)):kind==='i64'?(i=>Number(dv.getBigInt64(o+8*i,le))):(i=>Number(dv.getBigUint64(o+8*i,le)));
    // indice nel file del canale b del pixel (s, l), per ogni disposizione
    const at=H.interleave==='bsq'?((s,l,b)=>(b*L+l)*S+s):H.interleave==='bil'?((s,l,b)=>(l*B+b)*S+s):((s,l,b)=>(l*S+s)*B+b);
    let q=0; for (let l=0;l<L;l++){ for (let s=0;s<S;s++) for (let b=0;b<B;b++){ let v=get(at(s,l,b)); if (H.ignore!=null && v===H.ignore) v=NaN; out[q++]=v; } if ((l&7)===7) yield {phase:'read', frac:l/L}; }
    // coordinate: «map info» = {proiezione, rif. x, rif. y, est, nord, passo x, passo y, …, units=…}
    let px=Float64Array.from({length:S},(_,i)=>i), py=Float64Array.from({length:L},(_,i)=>i), pu='px';
    const M=H.mapInfo; if (M && M.length>=7){ const ex=+M[3], ny_=+M[4], dx=+M[5], dy=+M[6], rx=+M[1], ry=+M[2]; if ([ex,ny_,dx,dy,rx,ry].every(Number.isFinite) && dx>0 && dy>0){ px=Float64Array.from({length:S},(_,i)=>ex+(i+1-rx)*dx); py=Float64Array.from({length:L},(_,i)=>ny_-(i+1-ry)*dy); const un=M.find(t=>/^units\s*=/i.test(t)); pu=un?un.split('=')[1].trim():''; } }
    const x=H.wavelength ? Float64Array.from(H.wavelength) : Float64Array.from({length:B},(_,i)=>i+1);
    return {nx:S, ny:L, nc:B, data:out, x:{values:x, unit:H.wavelength?enviUnit(H.wavelengthUnits):'', quantity:H.wavelength?'wavelength':'band'}, px:{values:px, unit:pu}, py:{values:py, unit:pu}, y:{quantity:'intensity'},
      meta:{format:'envi', interleave:H.interleave, dataType:H.dataType, byteOrder:H.byteOrder, description:H.description.slice(0,300)}}; }

  const readWdf=buf=>drain(readWdfGen(buf)), readEnvi=(hdr, buf)=>drain(readEnviGen(hdr, buf));

  /* ---------------- testo a mappa ----------------
     - griglia (esportazione di LabSpec, Horiba): prima riga con l'asse spettrale preceduto da due celle vuote, poi una riga per pixel
       «x, y, intensità…»;
     - colonne (esportazione di WiRE e di altri): «X, Y, onda, intensità», uno spettro dopo l'altro.
     Numeri con il punto decimale (con la virgola solo se il separatore è il tabulatore o il punto e virgola). null se il testo non è una mappa. */
  const NUM=/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
  function splitCells(line, sep){ const c=sep==='ws' ? line.trim().split(/\s+/) : line.split(sep).map(t=>t.trim()); return c; }
  function numCell(t, comma){ if (comma) t=t.replace(',', '.'); return NUM.test(t) ? parseFloat(t) : null; }
  function sepOf(line){ return line.indexOf('\t')>=0 ? '\t' : line.indexOf(';')>=0 ? ';' : line.indexOf(',')>=0 ? ',' : 'ws'; }
  function readMapText(text){ const s=String(text), lines=s.split(/\r\n|\n|\r/); let k=0;
    while (k<lines.length && (/^\s*$/.test(lines[k]) || /^\s*#/.test(lines[k]) && !/^\s*#\s*x\b/i.test(lines[k]))) k++;
    if (k>=lines.length) return null;
    const first=lines[k], sep=sepOf(first), comma=sep==='\t' || sep===';';
    // griglia: due celle vuote (o solo spazi iniziali con separatore tab) e poi l'asse
    if (sep!=='ws'){ const c=splitCells(first, sep);
      if (c.length>=7 && c[0]==='' && c[1]==='' ){ const x=[]; for (let j=2;j<c.length;j++){ if (c[j]==='' && j===c.length-1) break; const v=numCell(c[j],comma); if (v===null) return null; x.push(v); }
        const nc=x.length, X=[], Y=[], rows=[]; for (let i=k+1;i<lines.length;i++){ const L=lines[i]; if (/^\s*$/.test(L)) continue; const r=splitCells(L, sep); if (r.length>2+nc && r[r.length-1]==='') r.length=2+nc; if (r.length!==2+nc) return null;
          const xv=numCell(r[0],comma), yv=numCell(r[1],comma); if (xv===null || yv===null) return null; const v=new Float64Array(nc); for (let j=0;j<nc;j++){ const q=numCell(r[2+j],comma); if (q===null) return null; v[j]=q; } X.push(xv); Y.push(yv); rows.push(v); }
        if (rows.length<2) return null; return gridCube(Float64Array.from(x), X, Y, rows, 'grid'); } }
    // colonne X Y onda intensità
    let start=k; if (numCell(splitCells(first,sep)[0]||'', comma)===null && /x/i.test(first) && /y/i.test(first)) start=k+1;
    const X=[], Y=[], rows=[]; let wave=null, curX=null, curY=null, cw=[], cv=[];
    const flush=()=>{ if (!cv.length) return true; if (!wave) wave=Float64Array.from(cw); else if (cw.length!==wave.length || cw.some((v,j)=>v!==wave[j])) return false; X.push(curX); Y.push(curY); rows.push(Float64Array.from(cv)); cw=[]; cv=[]; return true; };
    for (let i=start;i<lines.length;i++){ const L=lines[i]; if (/^\s*$/.test(L)) continue; const r=splitCells(L, sep); if (r.length!==4) return null; const v=r.map(t=>numCell(t,comma)); if (v.some(q=>q===null)) return null;
      if (v[0]!==curX || v[1]!==curY){ if (!flush()) return null; curX=v[0]; curY=v[1]; } cw.push(v[2]); cv.push(v[3]); }
    if (!flush() || rows.length<2 || !wave || wave.length<5) return null;
    return gridCube(wave, X, Y, rows, 'columns'); }
  // spettri con le loro coordinate → cubo: x e y distinti in ordine crescente; pixel mancanti NaN; se la griglia non torna, una linea
  function gridCube(x, X, Y, rows, how){ const nc=x.length, ux=[...new Set(X)].sort((a,b)=>a-b), uy=[...new Set(Y)].sort((a,b)=>a-b);
    let nx=ux.length, ny=uy.length, pxv=ux, pyv=uy, place;
    if (nx*ny<=Math.max(4*rows.length, rows.length+16)){ const mx=new Map(ux.map((v,i)=>[v,i])), my=new Map(uy.map((v,i)=>[v,i])); place=i=>my.get(Y[i])*nx+mx.get(X[i]); }
    else { nx=rows.length; ny=1; pxv=rows.map((_,i)=>i); pyv=[0]; place=i=>i; how+='-line'; }
    if (nx*ny*nc>MAXPIX) throw new MapError('too-large', String(nx*ny*nc));
    const data=new Float32Array(nx*ny*nc).fill(NaN), seen=new Uint8Array(nx*ny);
    for (let i=0;i<rows.length;i++){ const p=place(i); if (seen[p]) throw new MapError('map-duplicate'); seen[p]=1; data.set(rows[i], p*nc); }
    const filled=rows.length===nx*ny;
    return {nx, ny, nc, data, x:{values:x, unit:'', quantity:''}, px:{values:Float64Array.from(pxv), unit:''}, py:{values:Float64Array.from(pyv), unit:''}, y:{quantity:'intensity'}, meta:{format:'text', layout:how, complete:filled}}; }
  // il Rust e la pagina devono leggere gli stessi float32: per i testi il cubo è f32 (Math.fround), come scrive la riga data.set

  /* ---------------- serie di spettri Bruker OPUS (blocco «3D») ----------------
     DEDOTTO dalla descrizione di brukeropus (MIT): nessun file reale disponibile. Il blocco dati della serie inizia con 6 interi
     (versione, spettri, inizio, byte per spettro, byte di informazioni, righe della tabella); poi ogni spettro (f32) seguito dalle sue
     informazioni. Asse da FXV, LXV, NPT del blocco di stato. La disposizione spaziale non è nel blocco: il cubo è una linea (n × 1)
     e l'utente indica le colonne (reshape). */
  function opusDir(u){ const dv=dvOf(u), n=u.length, out=[]; if (n<600 || dv.getUint32(0,true)!==0xFEFE0A0A) return null;
    for (let c=24;c+12<=Math.min(n,504);c+=12){ const t=dv.getUint32(c,true), len=dv.getInt32(c+4,true)*4, off=dv.getInt32(c+8,true); if (off<=0) break; out.push({t, len, off}); } return out; }
  const opusSeries=b=>((b.t>>>4)&0x3f)===0 && ![0,13].includes((b.t>>>10)&0x7f) && ((b.t>>>19)&7)===2;
  function opusParams(u, b){ const dv=dvOf(u), P={}; let p=b.off; const end=Math.min(u.length, b.off+b.len);
    while (p+8<=end){ const name=ascii(u,p,p+3); if (name==='END' || !/^[A-Z0-9]{3}$/.test(name)) break; const t=dv.getUint16(p+4,true), sz=dv.getUint16(p+6,true)*2, v=p+8; if (v+sz>u.length) break;
      if (t===0) P[name]=dv.getInt32(v,true); else if (t===1) P[name]=dv.getFloat64(v,true); else P[name]=ascii(u,v,v+sz); p=v+sz; } return P; }
  function isOpusSeries(buf){ const u=u8of(buf), D=opusDir(u); return !!(D && D.some(opusSeries)); }
  function readOpusSeries(buf){ const u=u8of(buf), dv=dvOf(u), D=opusDir(u); if (!D) throw new MapError('not-opus');
    const S=D.filter(opusSeries); if (!S.length) throw new MapError('opus-no-series');
    const pri=[15,7,11], d=S.slice().sort((a,b)=>{ const ia=pri.indexOf(a.t&0xff), ib=pri.indexOf(b.t&0xff); return (ia<0?9:ia)-(ib<0?9:ib); })[0];
    const st=D.find(b=>((b.t>>>4)&0x3f)===1 && (b.t&~(0x3f<<4))===(d.t&~(0x3f<<4))); if (!st) throw new MapError('opus-status');
    const P=opusParams(u, st), np=P.NPT, fx=P.FXV, lx=P.LXV, csf=P.CSF||1, dpf=P.DPF||1;
    if (!(np>4) || !Number.isFinite(fx) || !Number.isFinite(lx) || d.off+24>u.length) throw new MapError('opus-params');
    const h=[0,1,2,3,4,5].map(k=>dv.getInt32(d.off+4*k,true)), nb=h[1], first=h[2], dsz=h[3], isz=h[4];
    if (!(nb>0) || !(dsz>=4*np) || isz<0 || first<24) throw new MapError('opus-series-header');
    const rows=[]; let o=d.off+first; for (let i=0;i<nb;i++){ if (o+4*np>u.length || o+4*np>d.off+d.len) break; const v=new Float64Array(np);
      for (let j=0;j<np;j++) v[j]=(dpf===2?dv.getInt32(o+4*j,true):dv.getFloat32(o+4*j,true))*csf; rows.push(v); o+=dsz+isz; }
    if (rows.length<2) throw new MapError('opus-series-short');
    const n=rows.length, x=new Float64Array(np); for (let i=0;i<np;i++) x[i]=fx+(lx-fx)*i/(np-1);
    const data=new Float64Array(n*np); rows.forEach((r,i)=>data.set(r, i*np));
    const dxu=String(P.DXU||'');
    return {nx:n, ny:1, nc:np, data, x:{values:x, unit:/WN/i.test(dxu)||!dxu?'cm-1':dxu, quantity:'wavenumber'}, px:{values:Float64Array.from({length:n},(_,i)=>i), unit:''}, py:{values:Float64Array.of(0), unit:''}, y:{quantity:(d.t&0xff)===15?'absorbance':'intensity'},
      meta:{format:'opus-series', layout:'unknown', spectra:n, declared:nb}}; }

  /* riconoscimento: che lettore usare per questo file (null: non è una mappa) */
  function sniff(name, buf){ const u=u8of(buf), n=String(name||'');
    if (u.length>=16 && ascii(u,0,4)==='WDF1') return 'wdf';
    if (/\.hdr$/i.test(n) && /^\s*ENVI/.test(ascii(u,0,Math.min(u.length,16)))) return 'envi';
    if (u.length>600 && dvOf(u).getUint32(0,true)===0xFEFE0A0A && isOpusSeries(u)) return 'opus-series';
    return null; }
  // stessi numeri dei due lettori del testo: il cubo del testo è sempre f32 (come quello del Rust)
  function* readGen(kind, buf, extra){
    if (kind==='wdf') return yield* readWdfGen(buf);
    if (kind==='envi') return yield* readEnviGen(typeof extra==='string' ? extra : new TextDecoder('latin1').decode(u8of(extra)), buf);
    if (kind==='opus-series') return readOpusSeries(buf);
    if (kind==='text') return readMapText(typeof buf==='string'?buf:new TextDecoder('utf-8').decode(u8of(buf)));
    throw new MapError('kind', kind); }
  // read('envi', binario, intestazione): come readEnvi(intestazione, binario)
  const read=(kind, buf, extra)=>drain(readGen(kind, buf, extra));

  /* ---------------- calcoli sul cubo ----------------
     Ogni pixel si calcola con i suoi numeri in f64 (i f32 del cubo si convertono senza arrotondare). Gli intervalli sono sull'asse x
     (anche decrescente): i canali con x fra min(a,b) e max(a,b), estremi compresi. Un pixel non misurato (NaN) dà NaN. */
  function chanRange(x, a, b){ const lo=Math.min(a,b), hi=Math.max(a,b); let i0=-1, i1=-1; for (let i=0;i<x.length;i++){ const v=x[i]; if (v>=lo && v<=hi){ if (i0<0) i0=i; i1=i; } } return i0<0 ? null : [i0,i1]; }
  function nearest(x, at){ let k=0, d=Infinity; for (let i=0;i<x.length;i++){ const e=Math.abs(x[i]-at); if (e<d){ d=e; k=i; } } return k; }
  // area con la regola dei trapezi (positiva anche sull'asse decrescente), meno il trapezio sotto la retta fra gli estremi se base è «linear»
  function area(d, o, x, i0, i1, lin){ if (i1<=i0) return 0; let s=0; for (let k=i0;k<i1;k++) s+=(x[k+1]-x[k])*(d[o+k]+d[o+k+1])*0.5; if (x[i1]<x[i0]) s=-s;
    if (lin){ let b=(x[i1]-x[i0])*(d[o+i0]+d[o+i1])*0.5; if (x[i1]<x[i0]) b=-b; s=s-b; } return s; }
  function height(d, o, x, i0, i1, lin){ let m=-Infinity, k=-1; const y0=d[o+i0], dy=d[o+i1]-y0, dx=x[i1]-x[i0];
    for (let q=i0;q<=i1;q++){ let v=d[o+q]; if (lin && i1>i0) v=v-(y0+dy*((x[q]-x[i0])/dx)); if (v>m){ m=v; k=q; } } return k<0 ? NaN : m; }
  // posizione del massimo, rifinita con la parabola per i tre punti attorno (se il massimo non è a un estremo dell'intervallo)
  function peakPos(d, o, x, i0, i1){ let m=-Infinity, k=-1; for (let q=i0;q<=i1;q++){ const v=d[o+q]; if (v>m){ m=v; k=q; } } if (k<0) return NaN;
    if (k>i0 && k<i1){ const a=d[o+k-1], b=d[o+k], c=d[o+k+1], den=a-2*b+c; if (den<0){ const t=0.5*(a-c)/den; return x[k]+t*((x[k+1]-x[k-1])*0.5); } } return x[k]; }
  /* operazione di un'immagine: {kind:'area'|'height'|'ratio'|'peak'|'intensity', a, b, a2, b2, at, base:'none'|'linear'}; normalizzata (canali già trovati) */
  function opPlan(cube, op){ const x=cube.x.values, lin=op.base==='linear', k=op.kind;
    if (k==='intensity'){ const i=nearest(x, +op.at); return {k:'height', i0:i, i1:i, lin:false}; }
    const r=chanRange(x, +op.a, +op.b); if (!r) throw new MapError('range');
    if (k==='ratio'){ const r2=chanRange(x, +op.a2, +op.b2); if (!r2) throw new MapError('range'); return {k, i0:r[0], i1:r[1], j0:r2[0], j1:r2[1], lin}; }
    if (!['area','height','peak'].includes(k)) throw new MapError('op', k);
    return {k, i0:r[0], i1:r[1], lin}; }
  function pixelValue(d, o, x, P){ switch (P.k){
      case 'area': return area(d,o,x,P.i0,P.i1,P.lin);
      case 'height': return height(d,o,x,P.i0,P.i1,P.lin);
      case 'peak': return peakPos(d,o,x,P.i0,P.i1);
      case 'ratio': { const a=area(d,o,x,P.i0,P.i1,P.lin), b=area(d,o,x,P.j0,P.j1,P.lin); return b===0 ? NaN : a/b; } } }
  const SLICE=1<<16;   // canali per fetta (circa 1 ms)
  function* bandImageGen(cube, op){ const P=opPlan(cube, op), {nx,ny,nc,data}=cube, x=cube.x.values, n=nx*ny, img=new Float64Array(n); let w=0;
    for (let p=0;p<n;p++){ img[p]=pixelValue(data, p*nc, x, P); if ((w+=nc)>=SLICE){ w=0; yield {phase:'image', frac:p/n}; } }
    return img; }
  const bandImage=(cube, op)=>drain(bandImageGen(cube, op));
  function pixelSpectrum(cube, ix, iy){ const {nx,nc,data}=cube, o=(iy*nx+ix)*nc; return Float64Array.from(data.subarray(o, o+nc)); }
  /* spettro medio dei pixel misurati in una regione: rettangolo {x0,y0,x1,y1} (estremi compresi) oppure elenco di pixel; {mean, n} */
  function* roiMeanGen(cube, roi){ const {nx,ny,nc,data}=cube, s=new Float64Array(nc); let cnt=0, w=0;
    const pix=Array.isArray(roi) || ArrayBuffer.isView(roi) ? roi : null, X0=pix?0:Math.max(0,Math.min(roi.x0,roi.x1)), X1=pix?-1:Math.min(nx-1,Math.max(roi.x0,roi.x1)), Y0=pix?0:Math.max(0,Math.min(roi.y0,roi.y1)), Y1=pix?-1:Math.min(ny-1,Math.max(roi.y0,roi.y1));
    const add=p=>{ const o=p*nc; for (let c=0;c<nc;c++) if (data[o+c]!==data[o+c]) return; for (let c=0;c<nc;c++) s[c]+=data[o+c]; cnt++; };
    if (pix){ for (const p of pix){ if (p>=0 && p<nx*ny) add(p); if ((w+=nc)>=SLICE){ w=0; yield {phase:'roi'}; } } }
    else for (let iy=Y0;iy<=Y1;iy++) for (let ix=X0;ix<=X1;ix++){ add(iy*nx+ix); if ((w+=nc)>=SLICE){ w=0; yield {phase:'roi'}; } }
    const mean=new Float64Array(nc); if (cnt) for (let c=0;c<nc;c++) mean[c]=s[c]/cnt; else mean.fill(NaN);
    return {mean, n:cnt}; }
  const roiMean=(cube, roi)=>drain(roiMeanGen(cube, roi));
  const meanSpectrum=cube=>roiMean(cube, {x0:0, y0:0, x1:cube.nx-1, y1:cube.ny-1});
  /* accorpamento f × f dei pixel (decimazione spaziale): media dei pixel misurati del blocco, canale per canale; il risultato è f32 */
  function* binGen(cube, f){ f=Math.max(1, Math.floor(f)); const {nx,ny,nc,data}=cube, mx=Math.ceil(nx/f), my=Math.ceil(ny/f), out=new Float32Array(mx*my*nc), s=new Float64Array(nc); let w=0;
    for (let by=0;by<my;by++) for (let bx=0;bx<mx;bx++){ s.fill(0); let cnt=0;
      for (let iy=by*f;iy<Math.min(ny,by*f+f);iy++) for (let ix=bx*f;ix<Math.min(nx,bx*f+f);ix++){ const o=(iy*nx+ix)*nc; let ok=true; for (let c=0;c<nc;c++) if (data[o+c]!==data[o+c]){ ok=false; break; } if (!ok) continue; for (let c=0;c<nc;c++) s[c]+=data[o+c]; cnt++; }
      const q=(by*mx+bx)*nc; for (let c=0;c<nc;c++) out[q+c]=cnt ? s[c]/cnt : NaN;
      if ((w+=nc*f*f)>=SLICE){ w=0; yield {phase:'bin'}; } }
    const pmean=(v,n)=>{ const r=new Float64Array(Math.ceil(v.length/f)); for (let i=0;i<r.length;i++){ let a=0, k=0; for (let j=i*f;j<Math.min(v.length,i*f+f);j++){ a+=v[j]; k++; } r[i]=a/k; } return r; };
    return Object.assign({}, cube, {nx:mx, ny:my, data:out, px:Object.assign({}, cube.px, {values:pmean(cube.px.values)}), py:Object.assign({}, cube.py, {values:pmean(cube.py.values)}), meta:Object.assign({}, cube.meta, {binned:f})}); }
  const bin=(cube, f)=>drain(binGen(cube, f));
  // nuova disposizione di una linea di n spettri in nx colonne (serie OPUS, testi senza coordinate): stessi dati, nessuna copia
  function reshape(cube, nx){ const n=cube.nx*cube.ny; nx=Math.floor(nx); if (!(nx>0) || n%nx) throw new MapError('reshape'); const ny=n/nx;
    return Object.assign({}, cube, {nx, ny, px:{values:Float64Array.from({length:nx},(_,i)=>i), unit:''}, py:{values:Float64Array.from({length:ny},(_,i)=>i), unit:''}, meta:Object.assign({}, cube.meta, {reshaped:[nx,ny]})}); }

  /* ---------------- MCR-ALS sulla mappa: cubo srotolato ----------------
     righe = pixel misurati (al più maxRows, accorpando i pixel), colonne = canali dell'intervallo; pix = pixel di ogni riga */
  function unfold(cube, opt){ opt=opt||{}; let c=cube; const maxRows=opt.maxRows||40000, maxVals=opt.maxValues||8e6; const r=opt.range ? chanRange(c.x.values, opt.range[0], opt.range[1]) : [0, c.nc-1]; if (!r) throw new MapError('range');
    const n=r[1]-r[0]+1; let f=1; while (Math.ceil(c.nx/f)*Math.ceil(c.ny/f)>maxRows || Math.ceil(c.nx/f)*Math.ceil(c.ny/f)*n>maxVals) f++;
    if (f>1) c=bin(c, f);
    const P=c.nx*c.ny, rows=[]; for (let p=0;p<P;p++){ const o=p*c.nc; let ok=true; for (let j=r[0];j<=r[1];j++) if (c.data[o+j]!==c.data[o+j]){ ok=false; break; } if (ok) rows.push(p); }
    const a=new Float64Array(rows.length*n); rows.forEach((p,i)=>{ const o=p*c.nc+r[0]; for (let j=0;j<n;j++) a[i*n+j]=c.data[o+j]; });
    return {D:{m:rows.length, n, a}, pix:Int32Array.from(rows), nx:c.nx, ny:c.ny, bin:f, x:c.x.values.slice(r[0], r[1]+1), px:c.px.values, py:c.py.values}; }
  // colonna k della matrice C (m × nc) → immagine nx × ny (NaN dove il pixel non era nella matrice)
  function refold(C, k, pix, nx, ny){ const img=new Float64Array(nx*ny).fill(NaN); for (let i=0;i<pix.length;i++) img[pix[i]]=C.a[i*C.n+k]; return img; }

  /* ---------------- scala dei colori ----------------
     viridis e cividis (matplotlib; viridis CC0, cividis di Nuñez, Anderton, Renslow 2018): uniformi nella percezione e leggibili
     anche con deficit della visione dei colori (cividis in particolare); 256 colori. */
  const CMAP_HEX={
    viridis:'44015444025645045745055946075a46085c460a5d460b5e470d60470e6147106347116447136548146748166848176948186a481a6c481b6d481c6e481d6f481f70482071482173482374482475482576482677482878482979472a7a472c7a472d7b472e7c472f7d46307e46327e46337f463480453581453781453882443983443a83443b84433d84433e85423f854240864241864142874144874045884046883f47883f48893e49893e4a893e4c8a3d4d8a3d4e8a3c4f8a3c508b3b518b3b528b3a538b3a548c39558c39568c38588c38598c375a8c375b8d365c8d365d8d355e8d355f8d34608d34618d33628d33638d32648e32658e31668e31678e31688e30698e306a8e2f6b8e2f6c8e2e6d8e2e6e8e2e6f8e2d708e2d718e2c718e2c728e2c738e2b748e2b758e2a768e2a778e2a788e29798e297a8e297b8e287c8e287d8e277e8e277f8e27808e26818e26828e26828e25838e25848e25858e24868e24878e23888e23898e238a8d228b8d228c8d228d8d218e8d218f8d21908d21918c20928c20928c20938c1f948c1f958b1f968b1f978b1f988b1f998a1f9a8a1e9b8a1e9c891e9d891f9e891f9f881fa0881fa1881fa1871fa28720a38620a48621a58521a68522a78522a88423a98324aa8325ab8225ac8226ad8127ad8128ae8029af7f2ab07f2cb17e2db27d2eb37c2fb47c31b57b32b67a34b67935b77937b87838b9773aba763bbb753dbc743fbc7340bd7242be7144bf7046c06f48c16e4ac16d4cc26c4ec36b50c46a52c56954c56856c66758c7655ac8645cc8635ec96260ca6063cb5f65cb5e67cc5c69cd5b6ccd5a6ece5870cf5773d05675d05477d1537ad1517cd2507fd34e81d34d84d44b86d54989d5488bd6468ed64590d74393d74195d84098d83e9bd93c9dd93ba0da39a2da37a5db36a8db34aadc32addc30b0dd2fb2dd2db5de2bb8de29bade28bddf26c0df25c2df23c5e021c8e020cae11fcde11dd0e11cd2e21bd5e21ad8e219dae319dde318dfe318e2e418e5e419e7e419eae51aece51befe51cf1e51df4e61ef6e620f8e621fbe723fde725',
    cividis:'00224e00234f002451002553002554002656002758002859002858002959002a5a002b5b002b5c002c5d002d5e002e60002f610030620030640031650032670033680034690034690035690135690236690437690638690838690a39690b3a6a0d3b6a0f3c6a113d6b123e6b143f6b153f6b16406b18416b19426b1a436b1b446b1d456c1e456c1f466c20476c21486c22496c234a6c244b6d254b6d264c6d274d6d284e6d294f6d2a4f6d2b506d2c516d2d526e2e536e2f546e30546e31556e31566e32576e33586e34596e355a6e36596e375a6e375b6e385c6e395d6e3a5e6f3b5f6f3c5f6f3d606f3e616f3f626f40636f40636f41646f42656f43666f44666f45676f45686f46696f476a6f486b70496c704a6c704b6d704c6e704d6f704d70704e70714f7171507271517371527472537572537573547673557773567874577974587a74597a745a7b745b7c745b7d755c7e755d7f755e80755f8075608175618275628375638475648575658576668676678776688876698976698a76698b766a8c766b8d766c8e766d8f766e90766f907670917671927672937573947574957575967576977577987578997579997b7a9a7a7b9b797b9c787c9d787d9e777e9f767f9f7580a07581a17482a27383a37284a47285a57186a67087a76f88a86e88a96e89aa6d8aab6c8bac6b8cad6a8dae698eaf688fb06790b16691b26592b36493b46494b56395b66196b76097b85f98b95e99ba5d9abb5c9bbc5a9cbd599dbe589ebf579fc056a0c155a1c253a2c352a3c451a4c54fa6c64ea7c74da8c84ba9ca4aaacb48abcc47accd45adce44aecf42afd040b0d13fb1d23db3d33bb4d43ab5d538b6d636b7d734b8d832b9d930bad92ebbda2cbcdb2abddc28bfdd25c0de23c1df21c2df1fc3e01cc4e119c5e216c6e312c8e40ec9e50acae607cbe704cce702cde801cee900cfea00d1eb00d2ec00d3ec00d4ed00d5ee00d6ef00d7f000d9f000daf100dbf200dcf300ddf300def400dff500e1f600e2f600e3f700e4f800e5f900e6f900e8fa00e9fb00eafb00ebfc00ecfd00edfd00effe00f0fe00f1fe00f2fe00f3fe00f4fe00f5fe00f6fe00f8fe00f9fe00fafe00fbfe00fcfe00fdfe00fefe00fffe00ffe838fee838'};
  const LUT={}; function lut(name){ if (LUT[name]) return LUT[name]; const h=CMAP_HEX[name]||CMAP_HEX.viridis, t=new Uint8Array(768); for (let i=0;i<768;i++) t[i]=parseInt(h.substr(2*i,2),16); return (LUT[name]=t); }
  /* estremi della scala: percentili 1 e 99 dei valori finiti (o min e max); null se non ce ne sono */
  function range(img, mode){ const v=[]; for (let i=0;i<img.length;i++) if (Number.isFinite(img[i])) v.push(img[i]); if (!v.length) return null; v.sort((a,b)=>a-b);
    if (mode==='minmax') return [v[0], v[v.length-1]]; const q=p=>v[Math.min(v.length-1, Math.max(0, Math.round(p*(v.length-1))))]; let lo=q(0.01), hi=q(0.99); if (!(hi>lo)){ lo=v[0]; hi=v[v.length-1]; } if (!(hi>lo)) hi=lo+1; return [lo,hi]; }
  // immagine → RGBA (pixel senza valore trasparenti)
  function colorize(img, lo, hi, name){ const L=lut(name), out=new Uint8ClampedArray(img.length*4), span=hi-lo||1;
    for (let i=0;i<img.length;i++){ const v=img[i]; if (!Number.isFinite(v)){ out[4*i+3]=0; continue; } let k=Math.round((v-lo)/span*255); k=k<0?0:k>255?255:k; out[4*i]=L[3*k]; out[4*i+1]=L[3*k+1]; out[4*i+2]=L[3*k+2]; out[4*i+3]=255; }
    return out; }
  const cssColor=(name, t)=>{ const L=lut(name), k=Math.max(0, Math.min(255, Math.round(t*255))); return 'rgb('+L[3*k]+','+L[3*k+1]+','+L[3*k+2]+')'; };

  /* ---------------- formato del progetto (f.cube) ---------------- */
  function toRecord(cube){ return {nx:cube.nx, ny:cube.ny, nc:cube.nc, x:{values:Array.from(cube.x.values), unit:cube.x.unit||'', quantity:cube.x.quantity||''}, px:{values:Array.from(cube.px.values), unit:cube.px.unit||''}, py:{values:Array.from(cube.py.values), unit:cube.py.unit||''},
    y:{quantity:(cube.y&&cube.y.quantity)||'', unit:(cube.y&&cube.y.unit)||''}, data:cube.data, meta:Object.assign({version:VERSION}, cube.meta||{})}; }
  function fromRecord(rec){ if (!rec || !(rec.nx>0) || !(rec.ny>0) || !(rec.nc>0) || !rec.data || rec.data.length!==rec.nx*rec.ny*rec.nc) return null;
    return {nx:rec.nx, ny:rec.ny, nc:rec.nc, data:rec.data, x:{values:Float64Array.from(rec.x.values), unit:rec.x.unit||'', quantity:rec.x.quantity||''}, px:{values:Float64Array.from(rec.px.values), unit:rec.px.unit||''}, py:{values:Float64Array.from(rec.py.values), unit:rec.py.unit||''}, y:rec.y||{}, meta:rec.meta||{}}; }
  const bytesOf=cube=>cube.nx*cube.ny*cube.nc*(cube.data instanceof Float64Array?8:4);

  /* ---------------- soglie (DECISIONE I10, motivate in ~/build/c27/dev-mappe.md) ----------------
     PAGE_BYTES: cubo nella pagina (online e desktop senza Rust). Oltre, online: «usa l'app desktop»; desktop: il cubo resta nel Rust.
     PROJECT_BYTES: oltre, nel progetto il cubo va in un file affiancato .acchcube (il progetto ZIP resta sotto LIMITS.archiveBytes).
     Sono uguali: un cubo che sta nella pagina va nello ZIP; uno che sta nel Rust va nel file affiancato, senza passare dalla pagina. */
  const LIMITS={PAGE_BYTES:256*1024*1024, PROJECT_BYTES:256*1024*1024};

  return {VERSION, MapError, LIMITS, MAXPIX, drain, sniff, read, readGen, readWdf, readWdfGen, readEnviGen, wdfInfo, wdfBlocks, wdfPlace, parseEnviHeader, readEnvi, readMapText, isOpusSeries, readOpusSeries,
    chanRange, nearest, opPlan, pixelValue, bandImageGen, bandImage, pixelSpectrum, roiMeanGen, roiMean, meanSpectrum, binGen, bin, reshape, unfold, refold,
    lut, range, colorize, cssColor, toRecord, fromRecord, bytesOf};
});
