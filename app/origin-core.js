// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Progetti Origin (.opj «CPYA» e .opju «CPYUA»): lettura e scrittura. Modulo puro, senza DOM: browser, desktop e Node.
   .opj: struttura dei blocchi e posizioni dei campi come documentate da liborigin (GPL-2.0-or-later, SciDAVis/LabPlot);
   il codice qui è scritto da zero in JS, nessuna riga copiata. .opju: formato chiuso, ricostruito sui campioni.
   Regola: ciò che non è riconosciuto si rifiuta con un messaggio, non si indovina.
   .opju in breve (versione 4.3721, verificata; 4.3425 e 4.3445 lette in parte):
   - riga «CPYUA x.y n\n»; poi strutture «rade» (varint lunghezza, byte: <0x80 letterali, 0x80+ zeri, 0xC0+ ripetizioni);
   - dataset: 0x80, struttura come l'intestazione CPYA (nome a 0x58, righe a 0x19), 0x18 + 24 byte (24, dimensione, controllo),
     dati «0a 05 [righe] ff ff [ultima] 00 [segmenti] ce», poi «fa [n][n byte] (0a) 00 00 00»; fine elenco «00 00 00 00 00 0a 00»;
   - segmento: varint t (dispari: (t>>1)+1 valori diversi; pari: t>>1 ripetizioni) e codifica: 0x0c FPC con tabelle 2^12,
     0x50 double grezzi, 0x00 celle di testo; righe vuote in coda «ff ff k 01, 2k 00»;
   - colonne dei fogli: struttura della curva CPYA (tipo a 0x11, nome a 0x12, indice del dataset a 0x04) e poi il testo
     «Long Name\r\nUnits\r\nComments»; curve dei grafici: Y a 0x04, X a 0x23 (come in CPYA). */
(function(root, factory){
  if (typeof module==='object' && module.exports) module.exports=factory();
  else root.AcchOrigin=factory();
})(typeof self!=='undefined' ? self : this, function(){
  'use strict';
  class OriginError extends Error{ constructor(code, detail){ super(code+(detail?': '+detail:'')); this.name='OriginError'; this.code=code; this.detail=detail||''; } }
  const LIMITS={bytes:1024*1024*1024, datasets:20000, rows:20000000, struct:65536};
  /* esito della verifica in un programma vero: finché è false l'interfaccia lo dichiara */
  const VERIFIED={readOpju:true, readOpj:false, writeOpj:false, writeOpju:false};
  const NANUM=-1.23456789e-300;   // valore mancante di Origin
  const TYPES={0:'Y',2:'YErr',3:'X',4:'Label',5:'Z',6:'XErr'};

  /* ---------- utilità binarie ---------- */
  function varint(u, p){
    let r=0, mul=1, b;
    do{ if (p>=u.length) throw new OriginError('truncated'); b=u[p++]; r+=(b&127)*mul; mul*=128; if (mul>2**49) throw new OriginError('bad-varint'); }while(b&128);
    return [r,p];
  }
  function encVarint(n){ const o=[]; do{ let b=n%128; n=Math.floor(n/128); if (n) b|=128; o.push(b); }while(n); return o; }
  /* struttura «rada» dei .opju: <0x80 = n byte letterali; 0x80–0xBF = (c&63)+3 zeri; 0xC0–0xFF = (c&63)+3 volte il byte seguente */
  function unsparse(u, p, end){
    const out=[];
    while (p<end){
      const c=u[p++];
      if (c<0x80){ if (p+c>end) return null; for (let i=0;i<c;i++) out.push(u[p+i]); p+=c; }
      else if (c<0xc0){ for (let i=0;i<(c&63)+3;i++) out.push(0); }
      else { if (p>=end) return null; const v=u[p++]; for (let i=0;i<(c&63)+3;i++) out.push(v); }
      if (out.length>LIMITS.struct) return null;
    }
    return Uint8Array.from(out);
  }
  function sparse(st){
    const o=[]; let i=0, lit=[];
    const flush=()=>{ while (lit.length){ const k=lit.splice(0,127); o.push(k.length, ...k); } };
    while (i<st.length){
      let j=i; while (j<st.length && st[j]===st[i] && j-i<66) j++;
      const n=j-i;
      if (n>=3){ flush(); if (st[i]===0) o.push(0x80|(n-3)); else o.push(0xc0|(n-3), st[i]); i=j; }
      else { lit.push(st[i]); i++; }
    }
    flush(); return o;
  }
  const u16=(u,p)=>u[p]|(u[p+1]<<8), u32=(u,p)=>(u[p]|(u[p+1]<<8)|(u[p+2]<<16))+u[p+3]*16777216;
  const u64n=(u,p)=>u32(u,p)+u32(u,p+4)*4294967296;
  const f64=(u,p)=>new DataView(u.buffer,u.byteOffset+p,8).getFloat64(0,true);
  function cstr(u, p, max, enc){ let e=p; while (e<u.length && e<p+max && u[e]) e++; return decode(u.subarray(p,e), enc); }
  function decode(b, enc){ try{ return new TextDecoder(enc||'utf-8',{fatal:false}).decode(b); }catch(e){ return String.fromCharCode(...b); } }
  const enc8=s=>new TextEncoder().encode(s);
  function latin1(s){ const o=new Uint8Array(s.length); for (let i=0;i<s.length;i++){ const c=s.charCodeAt(i); o[i]=c<256?c:63; } return o; }

  /* ---------- FPC (Burtscher e Ratanaworabhan, 2009): predittori FCM e DFCM, residuo XOR ---------- */
  const NB=[0,1,2,3,5,6,7,8];
  function fpcDecode(u, p, n, lg, out, o){
    const size=1<<lg, m=size-1, fcm=new BigUint64Array(size), dfcm=new BigUint64Array(size), M=(1n<<64n)-1n;
    const dv=new DataView(new ArrayBuffer(8));
    let h=0, dh=0, last=0n, k=0;
    while (k<n){
      if (p>=u.length) throw new OriginError('truncated');
      const hdr=u[p++];
      for (let s=0;s<2 && k<n;s++){
        const c=s?hdr>>4:hdr&15, nb=NB[c&7];
        if (p+nb>u.length) throw new OriginError('truncated');
        let x=0n; for (let i=nb-1;i>=0;i--) x=(x<<8n)|BigInt(u[p+i]); p+=nb;
        const v=x^((c&8) ? (last+dfcm[dh])&M : fcm[h]);
        fcm[h]=v; h=((h<<6)^Number(v>>48n))&m;
        const st=(v-last)&M; dfcm[dh]=st; dh=((dh<<2)^Number(st>>40n))&m; last=v;
        dv.setBigUint64(0,v,true); out[o+k++]=dv.getFloat64(0,true);
      }
    }
    return p;
  }
  function fpcEncode(vals, lg){
    const size=1<<lg, m=size-1, fcm=new BigUint64Array(size), dfcm=new BigUint64Array(size), M=(1n<<64n)-1n;
    const dv=new DataView(new ArrayBuffer(8)), out=[];
    let h=0, dh=0, last=0n;
    const codes=[], res=[];
    for (const f of vals){
      dv.setFloat64(0,f,true); const v=dv.getBigUint64(0,true);
      let x1=v^fcm[h]; fcm[h]=v; h=((h<<6)^Number(v>>48n))&m;
      const st=(v-last)&M, x2=v^((last+dfcm[dh])&M); dfcm[dh]=st; dh=((dh<<2)^Number(st>>40n))&m; last=v;
      let c=0; if (x1>x2){ c=8; x1=x2; }
      let nb=8; while (nb>0 && (x1>>BigInt(8*(nb-1)))===0n) nb--;
      if (nb===4) nb=5;
      c|=NB.indexOf(nb); codes.push(c);
      const r=[]; for (let i=0;i<nb;i++) r.push(Number((x1>>BigInt(8*i))&255n)); res.push(r);
    }
    for (let i=0;i<codes.length;i+=2){
      out.push(codes[i]|((i+1<codes.length?codes[i+1]:0)<<4)); out.push(...res[i]); if (i+1<codes.length) out.push(...res[i+1]);
    }
    return out;
  }

  /* ---------- testo delle colonne: «Long Name\r\nUnits\r\nComments» (convenzione di Origin, vedi LabPlot) ---------- */
  const SUP={'0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','-':'⁻','+':'⁺'}, SUB={'0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉','-':'₋','+':'₊'};
  function richText(s){   // \+(…) apice, \-(…) pedice, \g(…) greco: solo i casi che si rendono senza perdita
    return s.replace(/\\([+\-])\(([^()]*)\)/g,(all,k,t)=>{ const T=k==='+'?SUP:SUB; return [...t].every(ch=>T[ch]) ? [...t].map(ch=>T[ch]).join('') : (k==='+'?'^':'_')+'('+t+')'; })
            .replace(/\\g\(([a-zA-Z])\)/g,(all,c)=>{ const G='αβχδεφγηιφκλμνοπθρστυϖωξψζ', i='abcdefghijklmnopqrstuvwxyz'.indexOf(c.toLowerCase()); return i>=0?G[i]:c; });
  }
  function splitComment(raw){
    let s=raw; const at=s.indexOf('@${'); if (at>=0) s=s.slice(0,at);
    const parts=s.split(/\r\n|\n/);
    return {longName:richText(parts[0]||'').trim(), units:richText(parts[1]||'').trim(), comments:richText(parts.slice(2).join('\n')).trim()};
  }
  /* inverso di richText per la scrittura: apici, pedici e greche nella sintassi di Origin (serve anche ai .opj, solo Latin-1) */
  function originText(s){
    const inv=T=>Object.fromEntries(Object.entries(T).map(([k,v])=>[v,k])), iS=inv(SUP), iB=inv(SUB), Gr='αβχδεφγηιφκλμνοπθρστυϖωξψζ';
    return String(s).replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+/g,m=>'\\+('+[...m].map(c=>iS[c]).join('')+')').replace(/[₀₁₂₃₄₅₆₇₈₉₋₊]+/g,m=>'\\-('+[...m].map(c=>iB[c]).join('')+')')
      .replace(/[α-ω]/g,c=>{ const i=Gr.indexOf(c); return i>=0?'\\g('+'abcdefghijklmnopqrstuvwxyz'[i]+')':c; });
  }
  function joinComment(c){ const L=[c.longName||'', c.units||'', c.comments||''].map(originText); while (L.length>1 && !L[L.length-1]) L.pop(); return L.join('\r\n'); }

  /* nome del dataset → libro, colonna, foglio: «Book1_B@3» */
  function splitDataset(name){
    const m=/^(.+)_([A-Za-z0-9]+)(?:@(\d+))?$/.exec(name);
    return m ? {book:m[1], col:m[2], sheet:m[3]?+m[3]:1} : null;
  }
  function colOrder(a,b){ return a.length-b.length || (a<b?-1:a>b?1:0); }

  /* ---------- modello comune ---------- */
  function buildModel(format, version, datasets, colRecs, windows, curves, warnings){
    const books=new Map();
    datasets.forEach((ds,i)=>{
      const sp=splitDataset(ds.name); if (!sp){ if (ds.name) warnings.push({code:'non-sheet', name:ds.name}); return; }
      if (!books.has(sp.book)) books.set(sp.book,{name:sp.book, label:'', sheets:new Map()});
      const B=books.get(sp.book); if (!B.sheets.has(sp.sheet)) B.sheets.set(sp.sheet,{index:sp.sheet, name:'', columns:[]});
      B.sheets.get(sp.sheet).columns.push({name:sp.col, dataset:ds.name, dsIndex:i+1, type:null, longName:'', units:'', comments:'',
        values:ds.values, text:ds.text||0, error:ds.error||null, order:null});
    });
    const byIndex=new Map(); books.forEach(B=>B.sheets.forEach(S=>S.columns.forEach(c=>byIndex.set(c.dsIndex,{B,S,c}))));
    let ord=0;
    for (const r of colRecs){
      const e=byIndex.get(r.index); if (!e || e.c.name!==r.name) continue;
      if (e.c.type!=null) continue;
      e.c.type=TYPES[r.type]||'None'; e.c.order=ord++; Object.assign(e.c, splitComment(r.comment||''));
    }
    for (const w of windows){ const B=books.get(w.name); if (B && w.label) B.label=w.label; }
    const graphs=[];
    for (const g of curves){
      const y=byIndex.get(g.y), x=byIndex.get(g.x); if (!y) continue;
      let G=graphs.find(q=>q.name===g.graph); if (!G){ G={name:g.graph, label:g.graphLabel||'', curves:[]}; graphs.push(G); }
      G.curves.push({y:{book:y.B.name, sheet:y.S.index, col:y.c.name}, x:x?{book:x.B.name, sheet:x.S.index, col:x.c.name}:null});
    }
    const out=[];
    books.forEach(B=>{
      const sheets=[...B.sheets.values()].sort((a,b)=>a.index-b.index);
      sheets.forEach(S=>{ S.name=S.name||('Sheet'+S.index); S.columns.sort((a,b)=>(a.order==null?1e9:a.order)-(b.order==null?1e9:b.order) || colOrder(a.name,b.name)); });
      out.push({name:B.name, label:B.label, sheets});
    });
    return {format, version, books:out, graphs, warnings};
  }

  /* coppie X/Y proposte: regola di Origin (la X più vicina a sinistra); senza alcuna X si propone la prima colonna, dichiarandolo */
  function spectra(model){
    const L=[];
    for (const B of model.books) for (const S of B.sheets){
      const cols=S.columns, hasX=cols.some(c=>c.type==='X');
      cols.forEach((c,i)=>{
        if (c.type!=='Y' && c.type!==null) return;
        let x=null, assumed=false;
        for (let j=i-1;j>=0;j--) if (cols[j].type==='X'){ x=cols[j]; break; }
        if (!x && !hasX){ if (i===0) return; x=cols[0]; assumed=true; }
        const usable=!c.error && c.values && (!x || (!x.error && x.values));
        const n=usable ? countPairs(x?x.values:null, c.values) : 0;
        L.push({id:B.name+'|'+S.index+'|'+c.name, book:B.name, bookLabel:B.label, sheet:S.index, sheetName:S.name, x:x?x.name:null, y:c.name,
          xCol:x, yCol:c, assumedX:assumed, typeUnknown:c.type===null, n, error:c.error||(x&&x.error)||(!x?'no-x':null),
          label:c.longName||c.comments||(B.label||B.name)+' '+c.name});
      });
    }
    return L;
  }
  function countPairs(xs, ys){ let n=0; for (let i=0;i<ys.length;i++) if (Number.isFinite(ys[i]) && (!xs || (i<xs.length && Number.isFinite(xs[i])))) n++; return n; }
  /* valori di uno spettro: si tolgono solo le righe senza numero (celle vuote o di testo) e si dice quante */
  function pairValues(sp){
    const xs=[], ys=[]; let dropped=0;
    if (!sp.xCol || !sp.xCol.values || !sp.yCol || !sp.yCol.values) return {xs:new Float64Array(0), ys:new Float64Array(0), dropped:0};
    const X=sp.xCol.values, Y=sp.yCol.values, n=Math.max(X.length, Y.length);
    for (let i=0;i<n;i++){ const x=X[i], y=Y[i]; if (Number.isFinite(x) && Number.isFinite(y)){ xs.push(x); ys.push(y); } else dropped++; }
    return {xs:Float64Array.from(xs), ys:Float64Array.from(ys), dropped};
  }

  /* ======================================================= .opju ======================================================= */
  function readDatasetsOpju(u){
    // il primo dataset segue l'intestazione globale: si cerca la catena di record che si chiude con il marcatore noto
    let start=-1;
    for (let p=0x11; p<Math.min(u.length,4096); p++){ if (u[p]===0x0a && u[p+1]===0x80){ try{ walkOpju(u,p+1); start=p+1; break; }catch(e){} } }
    if (start<0) throw new OriginError('opju-no-datasets');
    return walkOpju(u,start);
  }
  /* intestazione di un record di dataset: 0x80, lunghezza, struttura rada, 0x18 + 24 byte (24, dimensione, controllo) */
  function dsHead(u, p){
    if (u[p]!==0x80) return null;
    let L, q; try{ [L,q]=varint(u,p+1); }catch(e){ return null; }
    if (L<8 || L>4096 || q+L+25>u.length) return null;
    const st=unsparse(u,q,q+L); if (!st || st.length<0x72) return null;
    q+=L; if (u[q]!==24 || u64n(u,q+1)!==24) return null;
    const size=u64n(u,q+9), blob=q+25; if (blob+size+1>u.length) return null;
    return {st, blob, end:blob+size};
  }
  function dsTail(u, end){   // dopo i dati: 0xfa, blocco facoltativo, tre zeri
    if (u[end-1]!==0xce || u[end]!==0xfa) return -1;
    let n, k; try{ [n,k]=varint(u,end+1); }catch(e){ return -1; } k+=n;
    if (n>0){ if (u[k]!==0x0a) return -1; k++; }
    if (u[k]||u[k+1]||u[k+2]) return -1;
    return k+3;
  }
  function walkOpju(u, p){
    const ds=[];
    while (u[p]===0x80){
      if (ds.length>=LIMITS.datasets) throw new OriginError('too-many');
      const h=dsHead(u,p); if (!h) throw new OriginError('opju-bad-header', 'dataset '+(ds.length+1));
      const st=h.st, name=cstr(st,0x58,st.length-0x58,'utf-8'), rows=u32(st,0x19);
      const d={name, rows, valuesize:st[0x3d], dataType:u16(st,0x16), values:null, text:0, error:null};
      let next=dsTail(u,h.end);
      if (next<0){
        // dataset di tipo non riconosciuto: si salta solo se il record successivo è certo e in mezzo non c'è altro record,
        // così la numerazione dei dataset (usata dalle colonne) resta giusta
        next=-1;
        const lim=Math.min(u.length-8, h.end+65536);
        for (let s=h.blob; s<lim; s++){
          if (u[s]===0x80 && dsHead(u,s)){ next=s; break; }
          if (u[s]===0 && u[s+1]===0 && u[s+2]===0 && u[s+3]===0 && u[s+4]===0 && u[s+5]===0x0a && u[s+6]===0 && u[s+7]===0x80 && s>=h.end){ next=s; break; }
        }
        if (next<0) throw new OriginError('opju-bad-frame', 'dataset '+(ds.length+1));
        d.error='opju-unknown-column';
      } else {
        try{ decodeColumnOpju(u,h.blob,h.end,d); }catch(e){ d.error=e.code||'opju-data'; d.values=null; }
      }
      ds.push(d); p=next;
    }
    if (!(u[p]===0 && u[p+1]===0 && u[p+2]===0 && u[p+3]===0 && u[p+4]===0 && u[p+5]===0x0a && u[p+6]===0)) throw new OriginError('opju-bad-frame','fine elenco');
    return {ds, end:p+7};
  }
  /* dati di una colonna: 0a 05 [righe] ff ff [ultima riga] 00, segmenti (varint t, codifica), ce */
  function decodeColumnOpju(u, b, end, d){
    if (u[b]!==0x0a || u[b+1]!==0x05) throw new OriginError('opju-unknown-column');
    let A, B, p; [A,p]=varint(u,b+2);
    if (u[p]!==0xff || u[p+1]!==0xff) throw new OriginError('opju-unknown-column'); p+=2;
    [B,p]=varint(u,p); if (u[p]!==0) throw new OriginError('opju-unknown-column'); p++;
    if (A>LIMITS.rows || B>A || A!==d.rows) throw new OriginError('opju-rows');
    const out=new Float64Array(A); let o=0;
    const stop=end-1;
    while (p<stop){
      if (o===B && u[p]===0xff && u[p+1]===0xff){
        // righe vuote dopo l'ultima con dati: ff ff [k] 01, poi [2k] 00 (osservato in tre versioni di Origin)
        let k, q, t2; [k,q]=varint(u,p+2);
        if (u[q]!==1) throw new OriginError('opju-unknown-column');
        [t2,q]=varint(u,q+1);
        if (t2!==2*k || u[q]!==0 || o+k!==A) throw new OriginError('opju-unknown-column');
        out.fill(NaN,o,A); o=A; p=q+1; continue;
      }
      let t; [t,p]=varint(u,p); const codec=u[p++];
      const n=(t&1)?(t>>>1)+1:(t>>>1);
      if (o+n>A) throw new OriginError('opju-rows');
      if (codec===0x0c && (t&1)){ p=fpcDecode(u,p,n,12,out,o); o+=n; }
      else if (codec===0x50){
        if (t&1){ for (let i=0;i<n;i++){ out[o++]=f64(u,p); p+=8; } }
        else { const v=f64(u,p); p+=8; out.fill(v,o,o+n); o+=n; }
      } else if (codec===0x00 && (t&1)){   // celle di testo: si contano, non diventano numeri
        for (let i=0;i<n;i++){ let l; [l,p]=varint(u,p); p+=l; out[o++]=NaN; d.text++; }
      } else throw new OriginError('opju-unknown-codec', '0x'+codec.toString(16));
      if (p>stop) throw new OriginError('opju-bad-frame');
    }
    if (p!==stop || o!==A) throw new OriginError('opju-rows');
    for (let i=0;i<A;i++) if (out[i]===NANUM) out[i]=NaN;
    let e=A; while (e>0 && Number.isNaN(out[e-1])) e--;   // celle vuote in coda: non sono righe
    d.values=out.subarray(0,e);
  }
  /* record di intestazione (finestre, colonne, curve): 0x80, lunghezza, struttura rada, coda; validati con l'indice del dataset */
  function scanRecordsOpju(u, from, datasets){
    const cols=[], windows=[], curves=[];
    let curWin=null;
    for (let p=from; p<u.length-2; p++){
      if (u[p]!==0x80 || (u[p-1]!==0 && u[p-1]!==0x0a)) continue;
      let L, q;
      try{ [L,q]=varint(u,p+1); }catch(e){ continue; }
      if (L<8 || L>4096 || q+L>u.length) continue;
      const st=unsparse(u,q,q+L); if (!st) continue;
      let n, r; try{ [n,r]=varint(u,q+L); }catch(e){ continue; }
      if (r+n>u.length) continue;
      if (st.length===0xc3){
        const nm=cstr(st,2,25,'utf-8');
        if (/^[A-Za-z][A-Za-z0-9_]{0,24}$/.test(nm)){ const lab=decode(u.subarray(r,r+n)).split('\0')[0].split(/\r\n/)[0]; curWin={name:nm, label:lab.trim()}; windows.push(curWin); }
        continue;
      }
      if (st.length<0x4e) continue;
      const nm=cstr(st,0x12,26,'utf-8'), idx=u16(st,4);
      const ds=datasets[idx-1];
      if (/^[A-Za-z][A-Za-z0-9]{0,23}$/.test(nm) && ds && curWin){
        const sp=splitDataset(ds.name);
        if (sp && sp.col===nm && sp.book===curWin.name){
          let e=r+n, comment='';
          if (u[e]===0x0a){ let m, s; [m,s]=varint(u,e+1); if (m>0){ let sl, s2; [sl,s2]=varint(u,s); if (s2+sl===s+m && sl>0 && u[s2+sl-1]===0) comment=cstr(u,s2,sl,'utf-8'); } }
          cols.push({index:idx, name:nm, type:st[0x11], comment});
        }
      } else if (!nm && curWin && st[0x11]===1){
        const x=u16(st,0x23);
        if (ds && datasets[x-1]) curves.push({graph:curWin.name, graphLabel:curWin.label, y:idx, x});
      }
    }
    return {cols, windows, curves};
  }
  function readOpju(u){
    const m=/^CPYUA (\d+\.\d+) (\d+)/.exec(decode(u.subarray(0,32),'latin1'));
    if (!m) throw new OriginError('not-origin');
    const {ds,end}=readDatasetsOpju(u), w=[];
    const {cols,windows,curves}=scanRecordsOpju(u,end,ds);
    return buildModel('opju', m[1], ds, cols, windows, curves, w);
  }

  /* ======================================================= .opj ======================================================= */
  function readOpj(u){
    const nl=u.indexOf(10); if (nl<0 || nl>64) throw new OriginError('not-origin');
    const line=decode(u.subarray(0,nl),'latin1'), m=/^CPYA (\d+\.\d+) (\d+)/.exec(line);
    if (!m) throw new OriginError('not-origin');
    let p=nl+1;
    const size=()=>{ if (p+5>u.length) throw new OriginError('truncated'); const s=u32(u,p); if (u[p+4]!==10) throw new OriginError('opj-bad-frame','0x'+p.toString(16)); p+=5; return s; };
    const block=s=>{ if (!s) return new Uint8Array(0); if (p+s+1>u.length) throw new OriginError('truncated'); const b=u.subarray(p,p+s); p+=s; if (u[p]!==10) throw new OriginError('opj-bad-frame','0x'+p.toString(16)); p++; return b; };
    const gh=block(size()); if (size()!==0) throw new OriginError('opj-bad-frame','global');
    let ver=0; if (gh.length>0x22){ const d=f64(gh,0x1b); ver=d>8.5?Math.trunc(d*100):10*Math.trunc(d*10); }
    if (ver===350) throw new OriginError('opj-old-version','3.5');
    const datasets=[];
    for (;;){
      const hs=size(); if (!hs) break;
      if (datasets.length>=LIMITS.datasets) throw new OriginError('too-many');
      const h=block(hs), data=block(size()); block(size());
      if (h.length<0x72) throw new OriginError('opj-bad-header');
      const d={name:cstr(h,0x58,25,'windows-1252'), dataType:u16(h,0x16), valuesize:h[0x3d]||8, rows:u32(h,0x19), values:null, text:0, error:null};
      decodeColumnOpj(d,data); datasets.push(d);
    }
    const cols=[], windows=[], curves=[];
    for (;;){
      const ws=size(); if (!ws) break;
      const wh=block(ws), wname=cstr(wh,2,25,'windows-1252');
      const win={name:wname, label:wh.length>0xc3?cstr(wh,0xc3,wh.length-0xc3,'windows-1252').split('@${')[0].trim():''}; windows.push(win);
      let layer=0;
      for (;;){
        const ls=size(); if (!ls) break;
        block(ls); layer++;
        annotations();
        for (;;){
          const cs=size(); if (!cs) break;
          const ch=block(cs), cd=block(size());
          if (ch.length<0x13) continue;
          const nm=cstr(ch,0x12,12,'windows-1252');
          const ix=findDataset(datasets, wname, nm, layer);
          if (ix>0) cols.push({index:ix, name:nm, type:ch[0x11], comment:cd.length?cstr(cd,0,cd.length,'windows-1252'):''});
          else if (ch.length>0x24){ const y=u16(ch,4), x=u16(ch,0x23); if (datasets[y-1]) curves.push({graph:wname, graphLabel:win.label, y, x}); }
        }
        for (const _ of [0,1,2,3]) for (;;){ const s=size(); if (!s) break; block(s); }   // interruzioni d'asse, parametri X, Y, Z
      }
    }
    function annotations(){
      for (;;){
        const hs=size(); if (!hs) return;
        block(hs); const s1=size(); block(s1); const s2=size();
        if ((s1===0x5e || s1===0x0a) && s2===4) annotations(); else block(s2);
        block(size());
      }
    }
    return buildModel('opj', m[1], datasets, cols, windows, curves, []);
  }
  function findDataset(ds, book, col, layer){
    const want=book+'_'+col+(layer>1?'@'+layer:'');
    const i=ds.findIndex(d=>d.name===want); return i+1;
  }
  function decodeColumnOpj(d, data){
    const vs=d.valuesize;
    if (vs<=8){
      if (vs!==8 || data.length%8) { d.error='opj-unknown-column'; return; }
      const n=data.length/8, v=new Float64Array(n); for (let i=0;i<n;i++){ const x=f64(data,i*8); v[i]=x===NANUM?NaN:x; } d.values=v;
    } else if (d.dataType & 0x100){
      if (data.length%vs){ d.error='opj-unknown-column'; return; }
      const n=data.length/vs, v=new Float64Array(n);
      for (let i=0;i<n;i++){ if (data[i*vs]!==1){ const x=f64(data,i*vs+2); v[i]=x===NANUM?NaN:x; } else { v[i]=NaN; d.text++; } }
      let e=n; while (e>0 && Number.isNaN(v[e-1])) e--; d.values=v.subarray(0,e);
    } else d.error='opj-text-column';
  }

  /* ======================================================= scrittura ======================================================= */
  /* modelli delle strutture (solo byte di formato: colori, dimensioni, opzioni; nessun nome, data o dato) */
  const T={
    ds:'2:01 6:fa a:a0 b:0f c:01 11:10 16:21 17:61 18:03 2b:f0 2c:3f 33:f0 34:3f 3d:0a 3e:14 71:c8 72:10',
    win:'1b:09 1d:09 1f:d4 20:02 21:28 22:02 23:80 24:07 25:38 26:04 29:04 2e:13 30:13 32:50 37:20 3e:05 40:04 42:02 43:11 44:11 45:4f 46:72 47:69 48:67 49:69 4a:6e 4f:2c 50:01 51:46 54:64 57:58 58:02 59:58 5a:02 67:01 69:13 87:c0 88:40 89:10 8a:08 8b:58 8c:02 8d:58 8e:02 8f:ff 90:ff 91:ff 92:ff 93:82 94:0a 97:11 9b:fc 9c:ff 9d:ff 9e:ff a0:39 b0:48 bf:ff c0:7f',
    layer:'2:5e 1d:1c 1e:40 25:f0 26:3f 27:08 2b:07 2d:40 2e:01 37:01 48:34 49:40 50:f0 51:3f 56:06 58:40 59:01 62:01 65:10 66:10 6d:0f 71:4c 73:50 75:a6 76:02 77:e3 78:01 81:20 82:28 83:4c 84:80 87:05 88:01 89:01 8a:07 91:f0 92:3f a4:1c a7:03 a8:12 a9:12 ae:80 b8:08 ba:04 c0:0a c1:d7 c2:a3 c3:3d c4:0a c5:d7 c6:a3 c7:3d c8:0a ca:14 d0:50 d1:64 f7:b8 f8:0b fb:02 fc:01 fd:0c fe:04 101:83 102:0a 105:12 109:fc 10a:ff 10b:ff 10c:ff 119:fc 11a:ff 11b:ff 11c:ff 121:fc 122:ff 123:ff 124:ff 129:06 131:07 13d:7b 13e:14 13f:ae 140:47 141:e1 142:7a 143:b4 144:3f 151:07 155:f7 156:ff 157:ff 158:ff 16a:ff 16b:01 16d:04',
    col:'0:10 6:0b 1e:09 25:21 26:61 33:01 39:20 4a:46 1d8:f0 1d9:3f 1e0:f0 1e1:3f 1e9:08'
  };
  const SZ={ds:147, win:195, layer:405, col:519};
  function tpl(k){ const b=new Uint8Array(SZ[k]); for (const e of T[k].split(' ')){ const [o,v]=e.split(':'); b[parseInt(o,16)]=parseInt(v,16); } return b; }
  const putU16=(b,p,v)=>{ b[p]=v&255; b[p+1]=(v>>8)&255; }, putU32=(b,p,v)=>{ for (let i=0;i<4;i++) b[p+i]=(v>>>(8*i))&255; };
  const putF64=(b,p,v)=>new DataView(b.buffer,b.byteOffset+p,8).setFloat64(0,v,true);
  function putStr(b,p,s,max,encf){ const e=encf(s).subarray(0,max-1); b.set(e,p); }

  /* nomi validi per Origin: libro ≤ 13 caratteri alfanumerici, unici */
  function bookNames(list){
    const used=new Set();
    return list.map((s,i)=>{ let b=String(s||'').replace(/[^A-Za-z0-9]/g,'').replace(/^[^A-Za-z]+/,'').slice(0,10)||'Book'; let n=b, k=1; while (used.has(n.toLowerCase())) n=b.slice(0,10)+(++k); used.add(n.toLowerCase()); return n; });
  }
  const colLetter=i=>{ let s=''; i++; while (i>0){ const r=(i-1)%26; s=String.fromCharCode(65+r)+s; i=Math.floor((i-1)/26); } return s; };
  /* spettri → libri: un libro per spettro, oppure un solo libro con le coppie X/Y affiancate */
  function layout(specs, mode){
    const items=specs.map(s=>({x:Float64Array.from(s.xs), y:Float64Array.from(s.ys), name:String(s.name||''), xc:s.x||{}, yc:s.y||{}}));
    if (mode==='one'){
      const cols=[]; items.forEach(it=>{ cols.push({type:3, v:it.x, c:it.xc}); cols.push({type:0, v:it.y, c:Object.assign({longName:it.name},it.yc)}); });
      return [{name:bookNames(['Spectra'])[0], label:'Acchiappaspettri', cols}];
    }
    const names=bookNames(items.map(it=>it.name));
    return items.map((it,i)=>({name:names[i], label:it.name, cols:[{type:3,v:it.x,c:it.xc},{type:0,v:it.y,c:Object.assign({longName:it.name},it.yc)}]}));
  }
  function checkSpecs(specs){
    if (!Array.isArray(specs) || !specs.length) throw new OriginError('nothing-to-write');
    for (const s of specs){ if (!s || !s.xs || !s.ys || s.xs.length!==s.ys.length || !s.xs.length) throw new OriginError('bad-spectrum'); for (let i=0;i<s.xs.length;i++) if (!Number.isFinite(s.xs[i])||!Number.isFinite(s.ys[i])) throw new OriginError('bad-spectrum','non finite'); }
  }
  function dsHeader(name, n, isX){
    const h=tpl('ds'); if (isX) h[0x17]=0x51;
    putU32(h,0x19,n); putU32(h,0x1d,0); putU32(h,0x21,n); putStr(h,0x58,name,25,latin1); return h;
  }
  function colHeader(name, idx, type){ const c=tpl('col'); putU16(c,4,idx); c[0x11]=type; if (type===3) c[0x26]=0x51; putStr(c,0x12,name,25,latin1); return c; }
  function winHeader(name){ const w=tpl('win'); putStr(w,2,name,25,latin1); return w; }

  /* .opj (CPYA): blocchi [u32][\n][dati][\n], fine elenco = blocco vuoto */
  function writeOpj(specs, opts){
    checkSpecs(specs); opts=opts||{};
    const books=layout(specs, opts.mode), out=[];
    const push=a=>{ for (const x of a) out.push(x); };
    const blk=b=>{ const s=[0,0,0,0]; for (let i=0;i<4;i++) s[i]=(b.length>>>(8*i))&255; push(s); out.push(10); if (b.length){ push(b); out.push(10); } };
    push(latin1('CPYA 4.3721 196#\n'));
    const gh=new Uint8Array(0x27); putF64(gh,0x1b,9.7); blk(gh); blk([]);
    let idx=0; const refs=[];
    for (const B of books) B.cols.forEach((c,i)=>{ const nm=B.name+'_'+colLetter(i); idx++; refs.push(idx);
      const vs=10, data=new Uint8Array(c.v.length*vs); c.v.forEach((v,k)=>putF64(data,k*vs+2,v));
      blk(dsHeader(nm,c.v.length,c.type===3)); blk(data); blk([]); });
    blk([]);
    idx=0;
    for (const B of books){
      const w=winHeader(B.name), lab=latin1(B.label||''), wh=new Uint8Array(0xc3+lab.length+1); wh.set(w); wh.set(lab,0xc3); blk(wh);
      blk(tpl('layer')); blk([]);
      B.cols.forEach((c,i)=>{ idx++; blk(colHeader(colLetter(i), idx, c.type)); const t=joinComment(c.c); blk(t?Uint8Array.from([...latin1(t),0]):[]); });
      blk([]); for (let k=0;k<4;k++) blk([]);
      blk([]);
    }
    blk([]);
    push([0,10]); blk([]);   // parametri: nome vuoto e fine elenco
    blk([]);                 // note
    return Uint8Array.from(out);
  }
  /* .opju (CPYUA): stessa organizzazione dei campioni, strutture rade, dati in FPC */
  function writeOpju(specs, opts){
    checkSpecs(specs); opts=opts||{};
    const books=layout(specs, opts.mode), out=[];
    const push=a=>{ for (const x of a) out.push(x); };
    push(latin1('CPYUA 4.3721 196\n'));
    const G='6c111111060000001400000040801201e404000000000000aaa88d0b00000000010000000003000000010000000004000000000000000100000000';
    const g=Uint8Array.from(G.match(/../g).map(h=>parseInt(h,16))), gs=sparse(g);
    push(encVarint(gs.length)); push(gs); push([10]); push(latin1('PrvwOPJU')); push([0,0,0,0,0,0,0,0]);
    push([0x90,0,0,0,10]);   // preambolo osservato prima dei dataset (contenuto non interpretato: NON VERIFICATO)
    push([10]);
    let idx=0;
    for (const B of books) B.cols.forEach((c,i)=>{
      const nm=B.name+'_'+colLetter(i); idx++;
      const st=sparse(dsHeader(nm,c.v.length,c.type===3));
      const body=[0x05, ...encVarint(c.v.length), 0xff, 0xff, ...encVarint(c.v.length), 0];
      const n=c.v.length, alt=opts._bodies && opts._bodies[idx-1];   // _bodies: solo per i test dei segmenti
      if (alt){ body.length=0; body.push(...alt); } else body.push(...encVarint((n-1)*2+1), 0x0c, ...fpcEncode(c.v,12));
      body.push(0xce);
      const blob=[0x0a, ...body];
      push([0x80, ...encVarint(st.length)]); push(st); push([24]);
      const meta=new Uint8Array(24); putU32(meta,0,24); putU32(meta,8,blob.length); push(meta);
      push(blob); push([0xfa,0,0,0,0]);
    });
    push([0,0,0,0,0,0x0a,0]);
    idx=0;
    for (const B of books){
      const ws=sparse(winHeader(B.name)), lab=enc8(B.label||'');
      push([0x80, ...encVarint(ws.length)]); push(ws); push(encVarint(lab.length+1)); push(lab); push([0]);
      push([0x0a]); const ls=sparse(tpl('layer')); push([0x80, ...encVarint(ls.length)]); push(ls); push([0]);
      B.cols.forEach((c,i)=>{
        idx++; const cs=sparse(colHeader(colLetter(i), idx, c.type));
        push([0x0a,0x80, ...encVarint(cs.length)]); push(cs); push([0]);
        const t=[...enc8(joinComment(c.c)),0], blk=[...encVarint(t.length), ...t];
        push([0x0a, ...encVarint(blk.length)]); push(blk); push([0x0a,0]);
      });
      push([0,0,0]);
    }
    push([0,0,0,0]);
    return Uint8Array.from(out);
  }

  function detect(u){
    const h=decode(u.subarray(0,8),'latin1');
    return h.startsWith('CPYUA ')?'opju':h.startsWith('CPYA ')?'opj':null;
  }
  function read(input){
    const u=input instanceof Uint8Array?input:new Uint8Array(input);
    if (u.length>LIMITS.bytes) throw new OriginError('too-big');
    const f=detect(u); if (!f) throw new OriginError('not-origin');
    try{ return f==='opju'?readOpju(u):readOpj(u); }
    catch(e){ if (e instanceof OriginError) throw e; throw new OriginError('corrupt', e && e.message); }
  }
  /* messaggi per l'utente (IT/EN), professionali */
  const MSG={
    'not-origin':['Il file non è un progetto Origin (.opj o .opju).','The file is not an Origin project (.opj or .opju).'],
    'opju-no-datasets':['Nel progetto .opju non ho riconosciuto i fogli di dati: la struttura non corrisponde a quelle verificate.','No worksheet data recognised in the .opju project: its structure does not match the verified ones.'],
    'opju-bad-header':['Struttura di un foglio non riconosciuta nel progetto .opju: il file non è stato letto.','Unrecognised worksheet structure in the .opju project: the file was not read.'],
    'opju-bad-frame':['Struttura del progetto .opju non riconosciuta: il file non è stato letto.','Unrecognised .opju project structure: the file was not read.'],
    'opj-bad-frame':['Struttura del progetto .opj non riconosciuta: il file non è stato letto.','Unrecognised .opj project structure: the file was not read.'],
    'opj-bad-header':['Struttura di un foglio non riconosciuta nel progetto .opj.','Unrecognised worksheet structure in the .opj project.'],
    'opj-old-version':['Progetto di Origin 3.5: versione non supportata.','Origin 3.5 project: version not supported.'],
    'truncated':['Il progetto Origin è incompleto (file troncato).','The Origin project is incomplete (truncated file).'],
    'too-big':['Il progetto Origin è troppo grande.','The Origin project is too large.'],
    'too-many':['Il progetto Origin contiene troppi fogli.','The Origin project contains too many worksheets.'],
    'corrupt':['Il progetto Origin è danneggiato o di un tipo non riconosciuto.','The Origin project is damaged or of an unrecognised kind.'],
    'opju-unknown-codec':['codifica dei valori non riconosciuta','unrecognised value encoding'],
    'opju-unknown-column':['struttura della colonna non riconosciuta','unrecognised column structure'],
    'opju-rows':['numero di righe incoerente','inconsistent number of rows'],
    'opj-unknown-column':['struttura della colonna non riconosciuta','unrecognised column structure'],
    'opj-text-column':['colonna di testo','text column'],
    'no-x':['nessuna colonna X','no X column'],
    'nothing-to-write':['Nessuno spettro da esportare.','No spectra to export.'],
    'bad-spectrum':['Uno spettro contiene valori non numerici.','A spectrum contains non-numeric values.']
  };
  function message(code, en){ const m=MSG[code]; return m?m[en?1:0]:(en?'Origin project not read.':'Progetto Origin non letto.'); }

  return {read, detect, spectra, pairValues, writeOpj, writeOpju, message, OriginError, VERIFIED,
    _:{varint, encVarint, unsparse, sparse, fpcDecode, fpcEncode, splitComment, joinComment, richText, splitDataset, readOpj, readOpju}};
});
