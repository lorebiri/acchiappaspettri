// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Calcoli del nucleo in Rust (tappa I7): richiesta e risposta di `acch_calc` (src-tauri/acch-core/src/calc.rs).
   Modulo puro, senza interfaccia; lo usano app/engine.js nel desktop e i test incrociati (test/unit/dual-calc.test.js).
   - encode(fn, args): la richiesta binaria, oppure null se gli argomenti non sono del tipo coperto (allora calcola il JS).
   - decode(ab): lo stesso valore che restituirebbe la funzione JS (stessi campi, nello stesso ordine), oppure {decline}.
   - same(a, b, tol): null se i due risultati coincidono (numeri bit per bit, o entro tol relativo alla scala), altrimenti la differenza.
   Il JS resta il riferimento: il Rust rifà le stesse operazioni nello stesso ordine e risponde «decline» nei casi particolari. */
(function(root, factory){
  if (typeof module==='object' && module.exports) module.exports=factory();
  else root.AcchCalc=factory();
})(typeof self!=='undefined' ? self : this, function(){
  'use strict';
  // nome → [quanti vettori, quanti numeri]: gli argomenti in quest'ordine
  const SIG={sgSmooth:['a','n'], derivLS:['a','a','n'], noiseSigma:['a'], findPeaks:['a','a','n','n','n'], peakAreas:['a','a','a']};
  const isNumArr=a=>Array.isArray(a) && a.every(v=>typeof v==='number');
  function encode(fn, args){ const sig=SIG[fn]; if (!sig || !args || args.length!==sig.length) return null;
    const arrs=[], nums=[];
    for (let k=0;k<sig.length;k++){ const a=args[k];
      if (sig[k]==='n'){ if (typeof a!=='number') return null; nums.push(a); }
      else if (a instanceof Float64Array) arrs.push(a);
      else if (isNumArr(a)) arrs.push(Float64Array.from(a));
      else return null; }
    const name=new TextEncoder().encode(fn); let head=8+name.length+8+4*arrs.length; head+=(8-head%8)%8;
    let total=head+8*nums.length; for (const a of arrs) total+=8*a.length;
    const out=new Uint8Array(total), dv=new DataView(out.buffer);
    out.set([65,67,81,49],0); dv.setUint32(4,name.length,true); out.set(name,8); let o=8+name.length;
    dv.setUint32(o,nums.length,true); dv.setUint32(o+4,arrs.length,true); o+=8; for (const a of arrs){ dv.setUint32(o,a.length,true); o+=4; }
    o=head; const f=new Float64Array(out.buffer, head, (total-head)/8); let q=0;
    for (const v of nums) f[q++]=v; for (const a of arrs){ f.set(a,q); q+=a.length; }   // Float64Array: stessi bit (LE su tutti i sistemi supportati)
    return out; }
  function wire(ab){ const u=new Uint8Array(ab); if (u.length<8 || u[0]!==65 || u[1]!==67 || u[2]!==87 || u[3]!==49) throw new Error('calc: risposta non valida');
    const jl=new DataView(ab).getUint32(4,true), json=JSON.parse(new TextDecoder().decode(u.subarray(8,8+jl))); let off=8+jl; off+=(8-off%8)%8;
    const data=new Float64Array(ab.slice(off)), F=v=>v && v.$f ? data.slice(v.$f[0], v.$f[0]+v.$f[1]) : v;
    const o={}; for (const k of Object.keys(json)) o[k]=F(json[k]); return o; }
  function decode(ab){ const w=wire(ab); if (w.decline) return {decline:w.decline};
    switch (w.fn){
      case 'sgSmooth': case 'derivLS': return {r:w.r};
      case 'noiseSigma': return {r:w.r[0]};
      case 'findPeaks': return {r:Array.from(w.x, (x,i)=>({x, y:w.y[i], prom:w.prom[i]}))};
      case 'peakAreas': { let h=0; return {r:Array.from(w.ia, (ia,i)=>{ const hull=[]; for (let j=0;j<w.hn[i];j++, h++) hull.push([w.hk[h], w.hv[h]]);
        return {ia, ib:w.ib[i], xa:w.xa[i], xb:w.xb[i], area:w.area[i], base0:w.base0[i], base1:w.base1[i], hull}; })}; }
    }
    throw new Error('calc: funzione '+w.fn); }
  /* confronto: stessa forma, stesse chiavi nello stesso ordine, interi uguali, numeri bit per bit (tol=0) o entro tol·scala;
     la scala è il massimo |valore| dello stesso campo in tutto il risultato */
  function same(a, b, tol){ tol=tol||0; const nums=[]; let why=null;
    const walk=(x, y, p)=>{ if (why) return;
      if (typeof x==='number' || typeof y==='number'){ if (typeof x!==typeof y){ why=p+': tipo'; return; } nums.push([x,y,p.replace(/\[\d+\]/g,'[]')]); return; }
      if (ArrayBuffer.isView(x) || ArrayBuffer.isView(y)){ if (!x || !y || x.constructor!==y.constructor || x.length!==y.length){ why=p+': vettore'; return; } for (let i=0;i<x.length;i++) nums.push([x[i],y[i],p]); return; }
      if (Array.isArray(x)){ if (!Array.isArray(y) || x.length!==y.length){ why=p+': lunghezza '+(x&&x.length)+' / '+(y&&y.length); return; } x.forEach((v,i)=>walk(v,y[i],p+'['+i+']')); return; }
      if (x && typeof x==='object'){ const kx=Object.keys(x), ky=y && typeof y==='object' ? Object.keys(y) : null; if (!ky || kx.join()!==ky.join()){ why=p+': chiavi'; return; } for (const k of kx) walk(x[k], y[k], p+'.'+k); return; }
      if (x!==y) why=p+': '+x+' / '+y; };
    walk(a, b, '');
    if (why) return why;
    const scale=new Map(); for (const [x,,k] of nums) if (Number.isFinite(x)) scale.set(k, Math.max(scale.get(k)||0, Math.abs(x)));
    for (const [x,y,k] of nums){ if (Object.is(x,y)) continue; if (!tol || !Number.isFinite(x) || !Number.isFinite(y)) return k+': '+x+' / '+y;
      if (Math.abs(x-y)>tol*(scale.get(k)||0)) return k+': '+x+' / '+y+' (oltre '+tol+' della scala)'; }
    return null; }
  /* ---------- ZIP (acch_zip, src-tauri/acch-core/src/zip.rs) ----------
     zipRequest(zip, opts): la richiesta «ACZ1» con le voci di un oggetto JSZip, nello stesso ordine di generateAsync (zip.forEach),
     con i nomi, le date (ora e data DOS in UTC, la stessa formula di JSZip) e il metodo che userebbe JSZip: quello della voce
     (STORE per cartelle e file vuoti) oppure opts.compression. I byte sono quelli che JSZip scriverebbe (file.async: testo in UTF-8).
     Con opts.parts restituisce i pezzi della richiesta (intestazione, poi i dati delle voci) invece di un solo vettore. */
  function dos(d){ let t=d.getUTCHours(); t=t<<6; t=t|d.getUTCMinutes(); t=t<<5; t=t|d.getUTCSeconds()/2;
    let D=d.getUTCFullYear()-1980; D=D<<4; D=D|(d.getUTCMonth()+1); D=D<<5; D=D|d.getUTCDate(); return [t&0xFFFF, D&0xFFFF]; }
  async function zipRequest(zip, opts){ opts=opts||{}; const L=[]; zip.forEach((rel, f)=>L.push([rel, f]));
    const ents=[];
    for (const [rel, f] of L){ const comp=String(f.options.compression || opts.compression || 'STORE').toUpperCase(); if (comp!=='STORE' && comp!=='DEFLATE') return null;
      if (f.comment || f.unixPermissions || f.dosPermissions || opts.platform==='UNIX' || opts.comment || opts.streamFiles || opts.encodeFileName) return null;   // campi che qui non si scrivono: JSZip
      const level=(f.options.compressionOptions || opts.compressionOptions || {}).level; if (comp==='DEFLATE' && level!=null && level!==6) return null;
      const name=new TextEncoder().encode(rel), data=f.dir ? new Uint8Array(0) : await f.async('uint8array'), [t,d]=dos(f.date);
      ents.push({name, dir:!!f.dir, method:comp==='DEFLATE'?8:0, t, d, data}); }
    let hl=8; for (const e of ents) hl+=14+e.name.length;
    const head=new Uint8Array(hl), dv=new DataView(head.buffer); head.set([65,67,90,49],0); dv.setUint32(4,ents.length,true); let o=8;
    for (const e of ents){ dv.setUint32(o,e.name.length,true); head.set(e.name,o+4); o+=4+e.name.length; head[o]=e.dir?1:0; head[o+1]=e.method; dv.setUint16(o+2,e.t,true); dv.setUint16(o+4,e.d,true); dv.setUint32(o+6,e.data.length,true); o+=10; }
    // la richiesta è l'intestazione seguita dai dati: si consegna a pezzi (parts), così nessuno deve copiarla tutta in un blocco
    const parts=[head].concat(ents.map(e=>e.data).filter(d=>d.length));
    return opts.parts ? parts : concat(parts); }
  function concat(parts){ let n=0; for (const p of parts) n+=p.length; const out=new Uint8Array(n); let o=0; for (const p of parts){ out.set(p,o); o+=p.length; } return out; }
  return {FNS:Object.keys(SIG), encode, decode, same, zipRequest, dos};
});
