// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Lettura di un file (tappa I5): la stessa sequenza per l'online, per il worker del desktop e per i test.
   Modulo puro, senza interfaccia: usa le funzioni del nucleo (parseText, parseBinary, decodeBuffer, detectInstrument, findPeaks)
   e AcchChannels, che nella pagina, nel worker e nei test sono nello stesso ambito globale.
   - read(buf, name, opt): il lettore di riferimento, in JS (prima stava dentro addEntries in index.html, invariato).
   - fromWire(ab, buf, name, opt): lo stesso risultato a partire dalla risposta del lettore Rust (src-tauri/acch-core).
     Il Rust fa solo la parte lunga (byte, righe, numeri) con le stesse operazioni; nomi dei canali, unità e tecnica li decide
     sempre il JS. Se qualcosa non torna restituisce null e si legge con read: mai un risultato diverso.
   - same(a, b): confronto bit per bit di due risultati (ACCH_DUAL=1), con i picchi entro 1e-12. */
(function(root, factory){
  if (typeof module==='object' && module.exports) module.exports=factory(root);
  else root.AcchRead=factory(root);
})(typeof self!=='undefined' ? self : this, function(root){
  'use strict';
  const CH=()=>root.AcchChannels;

  /* canali di un file di testo ChemStation/OpenLab con più segnali, uno per colonna o un blocco per segnale.
     Ogni canale si rilegge con il nucleo come se fosse un file a sé (stesse regole e stessi controlli); null se il file ha un solo canale */
  function textChannels(text, p, name){ const C=CH(); if (!C || !p || p.reject) return null;
    if (!((p.nCols||2)>2) && !(p.chSpans && p.chSpans.length>1)) return null;   // un canale solo: stesso risultato, senza dividere il testo in righe
    const lines=text.split(/\r\n|\n|\r/), chs=[], notes=[]; let declared=0;
    if ((p.nCols||2)>2){ const k0=lines.findIndex(l=>/^\s*"?[-+]?\d/.test(l) && (l.match(/[-+]?\d+(?:[.,]\d+)?(?:e[-+]?\d+)?/gi)||[]).length>=2), names=k0>0 ? C.headerNames(lines.slice(Math.max(0,k0-8),k0), p.nCols) : null;
      if (names){ const cand=[]; for (let j=1;j<names.length;j++){ const info=C.parseChannel(names[j]); if (info.det || info.wl!=null) cand.push({j, info, name:names[j]}); }
        if (cand.length>=2 && new Set(cand.map(c=>C.formatChannel(c.info))).size>=2){ declared=cand.length;
          for (const c of cand){ const q=parseText(text,{ycol:c.j}); if (q && !q.reject && q.xs.length>=5) chs.push({info:c.info, raw:c.name, xs:q.xs, ys:q.ys, meta:q.meta, p:q, col:c.j}); }
          const other=names.slice(1).filter((n,j)=>!cand.some(c=>c.j===j+1)); if (other.length) notes.push({code:'cols-other', list:other}); } } }
    if (!chs.length && p.chSpans && p.chSpans.length>1){ declared=p.chSpans.length;
      const sig=new Set(lines.filter(l=>/\bSig\s*=|^\W*(Signal|Segnale)\s*\d+\s*[:=]/i.test(l)).map(l=>C.canon(l)).filter(Boolean)); declared=Math.max(declared, sig.size);
      p.chSpans.forEach((sp,k)=>{ const body=sp.hdr.concat(lines.slice(sp.l0, sp.l1+1)).join('\n'), q=parseText(body); if (!q || q.reject || q.xs.length<5) return;
        let info=null; for (let h=sp.hdr.length-1;h>=0;h--){ const o=C.parseChannel(sp.hdr[h]); if (o.det || o.wl!=null){ info=o; break; } }
        chs.push({info:info||{det:'', wl:null, bw:null, ref:null, ex:null, em:null, extracted:false}, raw:'', xs:q.xs, ys:q.ys, meta:q.meta, p:q, block:k}); }); }
    if (chs.length<2) return null;
    { const q=p.importIssue, tab=q && p.chSpans ? q.after-(p.afterCh||0) : 0; if (tab>0) notes.push({code:'tables', rows:tab}); }   // blocchi corti dopo i canali: tabelle riassuntive, dette e non lette
    return C.finish({format:'text', declared, notes, samples:[{sampleKey:null, name:'', channels:chs}]}); }

  /* dopo la lettura dei numeri: stessa coda di addEntries (rifiuto, troppo pochi punti, tecnica, canali dei file di testo) */
  function finishText(p, text, name, opt, pb){
    if (p.reject) return {kind:'reject', p};
    if (p.xs.length<5) return {kind:'error'};
    const det=detectInstrument(p, name);
    if (det.instr==='hplc' && !pb && !opt.legacy){ const tc=textChannels(text, p, name); if (tc) return {kind:'mc', mc:tc, bin:false, det}; }
    return {kind:'p', p, pb:!!pb, det}; }

  /* Lettore di riferimento. Risultato: {kind:'uv', uv} | {kind:'mc', mc, bin, det?} | {kind:'reject', p} | {kind:'p', p, pb, det} | {kind:'error'}.
     opt.legacy: progetto della versione 1 (o spettro salvato senza canale), si rilegge come allora, un solo spettro. Progetti Origin e
     cartelle di Excel non passano di qui (addEntries). */
  function read(buf, name, opt){ opt=opt||{}; const C=CH();
    if (C && /\.uv$/i.test(name)){ const uv=C.readUv(buf); return uv ? {kind:'uv', uv} : {kind:'error'}; }
    let mc=C ? C.readBinary(buf, name) : null, text=null, pb=null; const mbin=!!mc;
    if (!mc){ pb=parseBinary(buf, name); if (!pb){ text=decodeBuffer(buf); if (C && !opt.legacy) mc=C.readText(text, name); } }
    if (mc) return mc.read ? {kind:'mc', mc, bin:mbin} : {kind:'error'};
    return finishText(pb || parseText(text), text, name, opt, pb); }

  /* ---------- risposta del Rust ----------
     «ACW1», lunghezza del JSON (u32 LE), JSON, zeri fino a un multiplo di 8, numeri f64 LE; nel JSON {"$f":[inizio,lunghezza]} */
  function decodeWire(ab){ const u=new Uint8Array(ab); if (u.length<8 || String.fromCharCode(u[0],u[1],u[2],u[3])!=='ACW1') throw new Error('wire: intestazione');
    const jl=new DataView(ab).getUint32(4,true), json=new TextDecoder('utf-8',{fatal:true}).decode(u.subarray(8,8+jl)), off=8+jl+((8-(8+jl)%8)%8);
    const nums=new Float64Array(ab, off, (u.length-off)/8);
    return JSON.parse(json, (k,v)=>v && typeof v==='object' && Array.isArray(v.$f) ? nums.subarray(v.$f[0], v.$f[0]+v.$f[1]) : v); }
  // FNV-1a a 32 bit, come fnv() in acch-core: i byte letti dal Rust sono quelli che ha la pagina
  function fnv(buf){ const u=new Uint8Array(buf); let h=0x811c9dc5; for (let i=0;i<u.length;i++){ h^=u[i]; h=Math.imul(h,0x01000193)>>>0; } return h>>>0; }
  const SIMPLE_KEYS='xs,ys,meta,pe,peX,peY,extraCols,importIssue,afterCh,nCols,ycol,colNames,blockHead,blockIx,nBlocks,chIx,nChan,chSpans';
  const eqRun=(a, ai, b, bi, n)=>{ for (let k=0;k<n;k++) if (!Object.is(a[ai+k], b[bi+k])) return false; return true; };
  /* file di testo semplice: il JS legge la sonda (intestazione, prime e ultime righe); i numeri del Rust valgono solo se la sonda
     è un file semplice e i suoi punti coincidono bit per bit con quelli del Rust nelle stesse posizioni */
  function fromSimple(W, name, opt, why){
    if (opt.ycol!=null) return why('ycol');
    const P=parseText(W.probe), n=W.xs.length, m=W.headN+W.tailN;
    if (!P || P.reject || Object.keys(P).join(',')!==SIMPLE_KEYS) return why('probe-keys');
    if (P.importIssue!==null || P.pe!==false || P.extraCols!==0 || P.nBlocks!==1 || P.chSpans!==null || P.ycol!==1 || P.afterCh!==0 || P.nCols!==2 || P.xs.length!==m) return why('probe-shape');
    // file crescente: prime headN righe in testa; decrescente: le ultime tailN righe del file vanno in testa dopo l'ordinamento
    const ok=a=>eqRun(P.xs,0,W.xs,0,a) && eqRun(P.ys,0,W.ys,0,a) && eqRun(P.xs,a,W.xs,n-(m-a),m-a) && eqRun(P.ys,a,W.ys,n-(m-a),m-a);
    if (!ok(W.headN) && !ok(W.tailN)) return why('probe-numbers');
    P.xs=W.xs.slice(); P.ys=W.ys.slice();
    return finishText(P, null, name, opt, null); }
  function fromWire(ab, buf, name, opt, why){ opt=opt||{}; why=why||(()=>null); const C=CH(); let W;
    try{ W=decodeWire(ab); }catch(e){ return why('wire'); }
    if (W.bytes!==buf.byteLength || W.fnv!==fnv(buf)) return why('bytes');   // il file è cambiato fra le due letture
    const F=a=>a.slice();   // copia propria (memcpy): il risultato non tiene vivo tutto il buffer della risposta
    switch (W.kind){
      case 'uv-null': return C ? {kind:'error'} : why('channels');
      case 'uv': { if (!C) return why('channels'); const scans=[]; let o=0; const v=F(W.v);
        for (let i=0;i<W.times.length;i++){ const L=W.len[i]; scans.push({a:W.a[i], s:W.s[i], v:v.subarray(o,o+L)}); o+=L; }
        return {kind:'uv', uv:{format:'agilent-uv', version:W.version, head:W.head, times:F(W.times), scans, wl:{lo:W.wl[0], hi:W.wl[1], step:W.wl[2]}}}; }
      case 'ch': { if (!C) return why('channels'); const mc=C.readBinary(buf, name, {format:'agilent-ch', version:W.version, head:W.head, xs:F(W.xs), ys:F(W.ys)});
        return mc ? (mc.read ? {kind:'mc', mc, bin:true} : {kind:'error'}) : why('ch'); }
      case 'arw': { if (!C || opt.legacy) return why('channels');
        const blocks=W.blocks.map(b=>{ const rec={}; for (const [k,v] of b.rec) rec[k]=v; return {rec, meta:b.meta, xs:F(b.xs), ys:F(b.ys)}; });
        const mc=C.readText(null, name, {arw:blocks}); return mc ? (mc.read ? {kind:'mc', mc, bin:false} : {kind:'error'}) : why('arw'); }
      case 'shimadzu': { if (!C || opt.legacy) return why('channels');
        const samples=W.samples.map(s=>({name:s.name, file:s.file, channels:s.channels.map(c=>{ const kv={}; for (const [k,v] of c.kv) kv[k]=v; return {name:c.name, paren:c.paren, kv, xs:F(c.xs), ys:F(c.ys), data:true, meta:c.meta}; })}));
        const mc=C.readText(null, name, {shimadzu:{samples, declared:W.declared, status:W.status}}); return mc ? (mc.read ? {kind:'mc', mc, bin:false} : {kind:'error'}) : why('shimadzu'); }
      case 'simple': return fromSimple(W, name, opt, why);
      default: return why(W.why||'decline');
    } }

  /* ---------- confronto dei due motori (ACCH_DUAL=1) ----------
     numeri bit per bit (Object.is: anche -0 e NaN), stesse chiavi nello stesso ordine; un vettore tipizzato e un Array con gli stessi
     numeri sono uguali (gli spettri del .uv arrivano dal worker in Float64Array). Restituisce null o il primo punto diverso. */
  const isSeq=v=>Array.isArray(v) || ArrayBuffer.isView(v);
  function diff(a, b, path, seen){ path=path||'r';
    if (typeof a==='number' || typeof b==='number') return Object.is(a,b) ? null : path+': '+a+' ≠ '+b;
    if (a===b) return null;
    if (isSeq(a) && isSeq(b)){ if (a.length!==b.length) return path+'.length '+a.length+' ≠ '+b.length; for (let i=0;i<a.length;i++){ const d=diff(a[i], b[i], path+'['+i+']'); if (d) return d; } return null; }
    if (a && b && typeof a==='object' && typeof b==='object'){ if (a instanceof Map || b instanceof Map){ return diff([...a], [...b], path); }
      const ka=Object.keys(a), kb=Object.keys(b); if (ka.join(',')!==kb.join(',')) return path+' chiavi '+ka.join(',')+' ≠ '+kb.join(',');
      for (const k of ka){ const d=diff(a[k], b[k], path+'.'+k); if (d) return d; } return null; }
    return path+': '+String(a)+' ≠ '+String(b); }
  // spettri di un risultato, per confrontare anche i picchi
  function spectra(r){ if (!r) return []; if (r.kind==='p') return [r.p]; if (r.kind==='mc') return r.mc.samples.flatMap(s=>s.channels); if (r.kind==='uv'){ const C=CH(), w=C.uvSuggest(r.uv); return w.length ? [{xs:r.uv.times, ys:C.uvExtract(r.uv, w[0], 4)}] : []; } return []; }
  function peaksDiff(a, b){ const A=spectra(a), B=spectra(b); if (A.length!==B.length) return 'spettri '+A.length+' ≠ '+B.length;
    for (let i=0;i<A.length;i++){ if (!A[i].xs || A[i].xs.length<20) continue; const pa=findPeaks(A[i].xs, A[i].ys, 1, 2, 20), pb=findPeaks(B[i].xs, B[i].ys, 1, 2, 20);
      if (pa.length!==pb.length) return 'picchi '+pa.length+' ≠ '+pb.length;
      for (let k=0;k<pa.length;k++) for (const f of ['x','y']){ const u=pa[k][f], v=pb[k][f]; if (!(Math.abs(u-v)<=1e-12*Math.max(1,Math.abs(u),Math.abs(v)))) return 'picco '+k+'.'+f+': '+u+' ≠ '+v; } }
    return null; }
  function same(a, b){ return diff(a, b) || peaksDiff(a, b); }

  return {read, fromWire, decodeWire, fnv, textChannels, same, diff, spectra};
});
