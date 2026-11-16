// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Indice min/max dei vettori grandi per il disegno del grafico (tappa I6). Modulo puro, senza interfaccia.
   - Ogni vettore (anche le sue viste con subarray, per esempio durante lo zoom) ha una piramide di minimi e massimi a blocchi di 16:
     il minimo e il massimo di un tratto qualsiasi costano O(log n) invece di O(n).
   - groups(): i gruppi di punti consecutivi che cadono nella stessa colonna di pixel, con primo, minimo, massimo e ultimo valore.
     Sono esattamente quelli che trova il ciclo di traceLine in index.html (stessi valori, stesso ordine): il disegno non cambia,
     cambia solo il tempo. Vale quando X è lineare (operazioni IEEE monotone) e le X crescono; negli altri casi ready() dice no
     e si usa il ciclo di sempre.
   - envelope(): l'inviluppo della curva per colonne che drawPlot usa per mettere le etichette, con lo stesso risultato del ciclo.
   - stats(): minimo, massimo, minimo positivo e primo X positivo di una serie.
   - Il minimo e il massimo di ogni colonna sono sempre nel disegno: un picco stretto di un solo punto non sparisce mai (G3).
   I vettori non si modificano mai dopo la creazione (vedi index.html); per prudenza ogni indice tiene un'impronta di 17 valori
   e si ricostruisce se il vettore è cambiato. */
(function(root, factory){
  if (typeof module==='object' && module.exports) module.exports=factory();
  else root.AcchPlot=factory();
})(typeof self!=='undefined' ? self : this, function(){
  'use strict';
  const F=16, MIN_N=4096;   // sotto i 4096 punti il ciclo semplice costa meno dell'indice
  const byBuf=new WeakMap(), byObj=new WeakMap(); let ids=0;
  const stats0={built:0, rebuilt:0, ms:0, groups:0, evals:0};
  const now=()=>(typeof performance!=='undefined' ? performance.now() : Date.now());

  function stamp(V){ const n=V.length, s=new Float64Array(17); if (!n) return s; for (let k=0;k<17;k++) s[k]=V[Math.floor(k*(n-1)/16)]; return s; }
  function sameStamp(V, s){ const n=V.length; if (!n) return true; for (let k=0;k<17;k++){ const v=V[Math.floor(k*(n-1)/16)], w=s[k]; if (!(v===w || (v!==v && w!==w))) return false; } return true; }

  function build(V){ const t0=now(), N=V.length, bad=[], desc=[];
    for (let j=0;j<N;j++){ const v=V[j]; if (!(v-v===0)) bad.push(j); if (j && !(v>=V[j-1])) desc.push(j); }   // v-v===0: finito
    const lv=[]; let mn=V, mx=V, len=N;
    while (len>F){ const m=Math.ceil(len/F), a=new Float64Array(m), b=new Float64Array(m);
      for (let j=0, k=0;j<m;j++){ let lo=Infinity, hi=-Infinity; const e=Math.min(len, k+F); for (;k<e;k++){ lo=Math.min(lo,mn[k]); hi=Math.max(hi,mx[k]); } a[j]=lo; b[j]=hi; }
      lv.push([a,b]); mn=a; mx=b; len=m; }
    stats0.built++; stats0.ms+=now()-t0;
    return {id:++ids, V, N, lv, pos:null, bad:Int32Array.from(bad), desc:Int32Array.from(desc), st:stamp(V)}; }
  // livelli del minimo positivo (servono solo con la scala logaritmica)
  function posLevels(I){ if (I.pos) return I.pos; const V=I.V, out=[]; let cur=null, len=I.N;
    { const m=Math.ceil(len/F), a=new Float64Array(m); for (let j=0;j<m;j++){ let lo=Infinity; const e=Math.min(len,(j+1)*F); for (let k=j*F;k<e;k++){ const v=V[k]; if (v>0 && v<lo) lo=v; } a[j]=lo; } out.push(a); cur=a; len=m; }
    while (len>F){ const m=Math.ceil(len/F), a=new Float64Array(m); for (let j=0;j<m;j++){ let lo=Infinity; const e=Math.min(len,(j+1)*F); for (let k=j*F;k<e;k++){ const v=cur[k]; if (v<lo) lo=v; } a[j]=lo; } out.push(a); cur=a; len=m; }
    return (I.pos=out); }

  /* indice di un vettore: {I, off}. Le viste (subarray) usano l'indice del vettore intero, se c'è o se la vista ne copre gran parte */
  function get(a){ if (!a || a.length<MIN_N) return null;
    if (ArrayBuffer.isView(a) && !(a instanceof DataView)){
      const C=a.constructor, bpe=a.BYTES_PER_ELEMENT, buf=a.buffer; let m=byBuf.get(buf);
      let I=m && m.get(C);
      const baseLen=Math.floor(buf.byteLength/bpe), off=a.byteOffset/bpe;
      if (I && !(I.N===baseLen && sameStamp(I.V, I.st))){ m.delete(C); I=null; stats0.rebuilt++; }
      if (!I && a.byteOffset%bpe===0 && a.length*4>=baseLen){ I=build(a.length===baseLen && a.byteOffset===0 ? a : new C(buf, 0, baseLen)); if (!m){ m=new Map(); byBuf.set(buf, m); } m.set(C, I); }
      if (I) return {I, off};
      let J=byObj.get(a); if (J && !sameStamp(a, J.st)){ J=null; stats0.rebuilt++; } if (!J){ J=build(a); byObj.set(a, J); } return {I:J, off:0}; }
    if (Array.isArray(a)){ let J=byObj.get(a); if (J && !(J.N===a.length && sameStamp(a, J.st))){ J=null; stats0.rebuilt++; } if (!J){ J=build(a); byObj.set(a, J); } return {I:J, off:0}; }
    return null; }
  const anyIn=(L, lo, hi)=>{ let a=0, b=L.length; while (a<b){ const m=(a+b)>>1; if (L[m]<lo) a=m+1; else b=m; } return a<L.length && L[a]<=hi; };

  // minimo e massimo esatti di V[lo..hi] (indici del vettore intero): bordi sui valori, il resto sui blocchi dei livelli
  function mm(I, lo, hi, out){ const V=I.V, lv=I.lv; let a=lo, b=hi+1, mn=Infinity, mx=-Infinity;
    if (b-a<=2*F || !lv.length){ for (let k=a;k<b;k++){ const v=V[k]; mn=Math.min(mn,v); mx=Math.max(mx,v); } out[0]=mn; out[1]=mx; return out; }
    { const e=Math.min(b, Math.ceil(a/F)*F); for (let k=a;k<e;k++){ const v=V[k]; mn=Math.min(mn,v); mx=Math.max(mx,v); } a=e;
      const s=Math.max(a, Math.floor(b/F)*F); for (let k=s;k<b;k++){ const v=V[k]; mn=Math.min(mn,v); mx=Math.max(mx,v); } b=s; }
    a/=F; b/=F;
    for (let L=0; a<b; L++){ const A=lv[L][0], B=lv[L][1];
      if (b-a<=2*F || L+1>=lv.length){ for (let k=a;k<b;k++){ mn=Math.min(mn,A[k]); mx=Math.max(mx,B[k]); } break; }
      const e=Math.ceil(a/F)*F; for (let k=a;k<e;k++){ mn=Math.min(mn,A[k]); mx=Math.max(mx,B[k]); }
      const s=Math.floor(b/F)*F; for (let k=s;k<b;k++){ mn=Math.min(mn,A[k]); mx=Math.max(mx,B[k]); }
      a=e/F; b=s/F; }
    out[0]=mn; out[1]=mx; return out; }
  function mpos(I, lo, hi){ const V=I.V, P=posLevels(I); let a=lo, b=hi+1, mn=Infinity, L=-1;
    for (;;){ if (L<0){ if (b-a<=2*F){ for (let k=a;k<b;k++){ const v=V[k]; if (v>0 && v<mn) mn=v; } break; }
        while (a%F && a<b){ const v=V[a]; if (v>0 && v<mn) mn=v; a++; } while (b%F && b>a){ b--; const v=V[b]; if (v>0 && v<mn) mn=v; }
        a/=F; b/=F; L=0; if (a>=b) break; continue; }
      const A=P[L]; if (b-a<=2*F || L+1>=P.length){ for (let k=a;k<b;k++){ const v=A[k]; if (v<mn) mn=v; } break; }
      while (a%F && a<b){ const v=A[a]; if (v<mn) mn=v; a++; } while (b%F && b>a){ b--; const v=A[b]; if (v<mn) mn=v; }
      a/=F; b/=F; L++; if (a>=b) break; }
    return mn; }

  // l'indice c'è già (senza costruirlo): per preparare i vettori a pezzi brevi prima del disegno
  function has(a){ if (!a || a.length<MIN_N) return true; if (ArrayBuffer.isView(a)){ const m=byBuf.get(a.buffer); if (m && m.get(a.constructor)) return true; } return byObj.has(a); }

  /* le condizioni del percorso veloce: X crescenti e finite, Y finite, almeno MIN_N punti. Restituisce gli indici o null */
  function ready(xs, ys){ if (!xs || !ys || xs.length!==ys.length || xs.length<MIN_N) return null;
    const gx=get(xs), gy=get(ys); if (!gx || !gy) return null; const n=xs.length;
    if (anyIn(gx.I.bad, gx.off, gx.off+n-1) || anyIn(gx.I.desc, gx.off+1, gx.off+n-1) || anyIn(gy.I.bad, gy.off, gy.off+n-1)) return null;
    return {gx, gy, n}; }

  /* X crescenti e finite (per le ricerche per bisezione), e il tratto [lo, hi] dello zoom come lo trovano i cicli di zoomSlice */
  function sortedX(xs){ const g=xs && xs.length>=MIN_N && get(xs); return !!g && !anyIn(g.I.bad, g.off, g.off+xs.length-1) && !anyIn(g.I.desc, g.off+1, g.off+xs.length-1); }
  function span(xs, z0, z1){ const n=xs.length; let a=0, b=n-1;
    while (a<b){ const m=(a+b)>>1; if (xs[m]<z0) a=m+1; else b=m; }   // primo con xs ≥ z0 (al massimo n−1)
    const lo=a; a=lo; b=n-1;
    while (a<b){ const m=(a+b+1)>>1; if (xs[m]>z1) b=m-1; else a=m; }   // ultimo con xs ≤ z1 (almeno lo)
    return [lo, a]; }

  /* gruppi di traceLine: col(i) è la colonna del punto i (la stessa espressione del ciclo), non decrescente nell'ordine di visita
     (i crescente, oppure decrescente con invert). cb(c, first, min, max, last, iFirst, iLast) per ogni gruppo, nell'ordine */
  function groups(R, ys, col, invert, cb){ const n=R.n, I=R.gy.I, o=R.gy.off, out=[0,0], b0=invert ? n-1 : 0, sg=invert ? -1 : 1;   // indice del t-esimo punto visitato: b0+sg*t
    let t=0, w=1;
    while (t<n){ const c=col(b0+sg*t); let lo=t, hi=n; stats0.groups++;
      // la fine del gruppo: si prova prima dove la mette la larghezza del gruppo precedente (punti quasi equispaziati: 2–3 valutazioni),
      // poi si cerca per raddoppi e bisezione; col è monotona, quindi il risultato è quello del ciclo punto per punto
      const e=Math.min(n-1, t+w-1);
      if (e>t){ if (col(b0+sg*e)===c) lo=e; else hi=e; }
      if (hi===n){ let step=1; while (lo+step<n){ if (col(b0+sg*(lo+step))===c){ lo+=step; step*=2; } else { hi=lo+step; break; } } }
      else if (hi-lo>1 && col(b0+sg*(hi-1))===c) lo=hi-1;
      while (hi-lo>1){ const m=(lo+hi)>>1; if (col(b0+sg*m)===c) lo=m; else hi=m; }
      w=lo-t+1;
      const ia=b0+sg*t, ib=b0+sg*lo, a=Math.min(ia,ib), b=Math.max(ia,ib);
      mm(I, o+a, o+b, out);
      cb(c, ys[ia], out[0], out[1], ys[ib], ia, ib);
      t=lo+1; }
  }
  /* colonna del punto i con una mappa X lineare descritta da par = {o, lo, hi, den, w, inv} (quella di drawPlot o del riquadro):
     le stesse operazioni, nello stesso ordine, della funzione X della pagina seguita da floor((X−o)/w·cols). Una sola funzione
     per tutti i chiamanti: il motore JS la ottimizza meglio delle chiusure diverse della pagina */
  function linCol(xs, off, par, cols){ const o=par.o, lo=par.lo, hi=par.hi, den=par.den, w=par.w, c1=cols-1;
    return par.inv ? (i=>Math.min(c1, Math.max(0, Math.floor(((o+(hi-xs[off+i])/den*w)-o)/w*cols))))
                   : (i=>Math.min(c1, Math.max(0, Math.floor(((o+(xs[off+i]-lo)/den*w)-o)/w*cols)))); }
  /* gruppi in vettori, con memoria: nello stesso disegno l'inviluppo e la traccia usano le stesse colonne (stessa espressione,
     stessa mappa X: key la descrive) e il secondo li trova pronti. Restituisce {m, c, f, mn, mx, l, ia, ib} */
  const GMEMO=new WeakMap();
  function groupsArr(R, ys, col, invert, key){ const vy=R.gy.I.V; let M=GMEMO.get(vy); const k=key==null ? null : key+'|'+R.gy.off+'|'+R.n+'|'+(invert?1:0);
    if (k!=null && M){ const e=M.get(k); if (e) return e; }
    let cap=256, m=0; let c=new Int32Array(cap), f=new Float64Array(cap), mn=new Float64Array(cap), mx=new Float64Array(cap), l=new Float64Array(cap), ia=new Int32Array(cap), ib=new Int32Array(cap);
    const grow=()=>{ cap*=2; const g=(A,T)=>{ const B=new T(cap); B.set(A); return B; }; c=g(c,Int32Array); f=g(f,Float64Array); mn=g(mn,Float64Array); mx=g(mx,Float64Array); l=g(l,Float64Array); ia=g(ia,Int32Array); ib=g(ib,Int32Array); };
    groups(R, ys, col, invert, (cc,ff,a,b,ll,i1,i2)=>{ if (m===cap) grow(); c[m]=cc; f[m]=ff; mn[m]=a; mx[m]=b; l[m]=ll; ia[m]=i1; ib[m]=i2; m++; });
    const e={m, c, f, mn, mx, l, ia, ib};
    if (k!=null){ if (!M){ M=new Map(); GMEMO.set(vy, M); } M.set(k, e); if (M.size>4) M.delete(M.keys().next().value); }
    return e; }

  /* I6 (G1), solo a schermo: colonne su una griglia fissa in X. La larghezza della colonna di griglia è una potenza di 2 (in unità di X)
     tra metà e tutta la larghezza di un pixel: ogni livello è una «piramide» di minimi e massimi per intervalli fissi di X, che non
     dipendono dalla vista. Così spostando il grafico le colonne già calcolate si riusano (si calcolano solo quelle nuove ai bordi) e,
     nello zoom, finché si resta nello stesso livello (un fattore 2) si riusano tutte. Ogni pixel prende le 1–2 colonne di griglia che
     cadono in lui: il minimo e il massimo di ogni pixel sono quelli dei dati, con lo scarto di al più una colonna (G3, ≤ 1 px).
     Le esportazioni non passano di qui: usano groupsArr, identico al ciclo su tutti i punti. */
  const SCR=new WeakMap(); const scrStats={hit:0, miss:0};
  const lowerB=(xs, a, b, v)=>{ while (a<b){ const m=(a+b)>>1; if (xs[m]<v) a=m+1; else b=m; } return a; };
  function screenGroups(R, xs, ys, par, cols, invert){ const n=R.n; if (n<2 || !(cols>0)) return null;
    const span=par.den, cwPix=span/cols; if (!(cwPix>0) || !isFinite(cwPix)) return null;
    const L=Math.floor(Math.log2(cwPix)), cw=Math.pow(2, L); if (!(cw>0) || !isFinite(cw)) return null;
    const I=R.gy.I, o=R.gy.off; let M=SCR.get(I); if (!M){ M=new Map(); SCR.set(I, M); }
    const key=R.gx.I.id+':'+(R.gx.off-R.gy.off)+':'+L; let C=M.get(key);
    // livello: finestra di CAP colonne di griglia in vettori (f, min, max, ultimo), ricentrata se la vista va oltre
    const CAP=65536; if (!C){ C={base:0, V:new Float64Array(4*CAP), ok:new Uint8Array(CAP), last:null, lastKey:''}; M.set(key, C); if (M.size>4) M.delete(M.keys().next().value); }
    const x0=xs[0], x1=xs[n-1], ga=Math.floor(x0/cw), gb=Math.floor(x1/cw), out=[0,0];
    if (gb-ga>8*cols+16 || gb-ga>=CAP/2) return null;   // vista molto più larga del previsto: calcolo normale
    // stessa vista nello stesso fotogramma (inviluppo e traccia): stesso risultato
    const fk=x0+'|'+x1+'|'+n+'|'+o+'|'+par.o+'|'+par.lo+'|'+par.hi+'|'+par.w+'|'+(par.inv?1:0)+'|'+cols+'|'+(invert?1:0);
    if (C.lastKey===fk) return C.last;
    if (ga<C.base || gb>=C.base+CAP){ C.base=ga-((CAP-(gb-ga))>>1); C.ok.fill(0); }
    const V=C.V, ok=C.ok, base=C.base, m0=cols+4;
    const G={m:0, c:new Int32Array(m0), f:new Float64Array(m0), mn:new Float64Array(m0), mx:new Float64Array(m0), l:new Float64Array(m0)};
    const k0=par.inv ? par.hi : par.lo, sg=par.inv ? -1 : 1, kx=cols/par.den;   // pixel della colonna di griglia: floor((x−lo)/den·cols), con il verso
    let p0=-1, f=0, mn=0, mx=0, l=0, hit=0, miss=0;
    const step=invert ? -1 : 1, g0=invert ? gb : ga, g1=invert ? ga : gb;
    for (let g=g0;; g+=step){ const k=g-base, edge=(g===ga || g===gb); let has=false;
      if (!edge && ok[k]) { has=true; hit++; }
      else { miss++; const a=lowerB(xs, 0, n, g*cw), b=lowerB(xs, a, n, (g+1)*cw)-1;
        if (a<=b){ mm(I, o+a, o+b, out); V[4*k]=ys[a]; V[4*k+1]=out[0]; V[4*k+2]=out[1]; V[4*k+3]=ys[b]; has=true; if (!edge) ok[k]=1; }
        else if (!edge){ ok[k]=1; V[4*k+1]=NaN; } }
      if (has && V[4*k+1]===V[4*k+1]){ let xg=(g+0.5)*cw; if (xg<x0) xg=x0; if (xg>x1) xg=x1;
        let p=Math.floor(sg*(xg-k0)*kx); if (p<0) p=0; if (p>cols-1) p=cols-1;
        const vf=invert ? V[4*k+3] : V[4*k], vl=invert ? V[4*k] : V[4*k+3], a1=V[4*k+1], a2=V[4*k+2];
        if (p!==p0){ if (p0>=0){ const j=G.m++; G.c[j]=p0; G.f[j]=f; G.mn[j]=mn; G.mx[j]=mx; G.l[j]=l; } p0=p; f=vf; mn=a1; mx=a2; l=vl; }
        else { if (a1<mn) mn=a1; if (a2>mx) mx=a2; l=vl; } }
      if (g===g1) break; }
    if (p0>=0){ const j=G.m++; G.c[j]=p0; G.f[j]=f; G.mn[j]=mn; G.mx[j]=mx; G.l[j]=l; }
    scrStats.hit+=hit; scrStats.miss+=miss; C.last=G; C.lastKey=fk;
    return G; }

  /* inviluppo di drawPlot (addEnv): stesso risultato del ciclo su tutti i punti. X e YY lineari; colOf(x) la colonna di un X già mappato */
  function envelope(R, xs, ys, X, YY, px0, pw, py0, ph, colOf, eT, eB, invert, nc){ const n=R.n;
    const inR=i=>{ const x=X(xs[i]); return !(x<px0-1e-6 || x>px0+pw+1e-6 || !isFinite(x)); };
    // i punti dentro il grafico sono un tratto solo: X è monotona
    let iA, iB;
    { const left=i=>{ const x=X(xs[i]); return invert ? x>px0+pw+1e-6 : x<px0-1e-6; };   // fuori, dalla parte degli indici bassi
      let a=0, b=n; while (a<b){ const m=(a+b)>>1; if (left(m)) a=m+1; else b=m; } iA=a;
      a=iA; b=n; while (a<b){ const m=(a+b)>>1; if (inR(m)) a=m+1; else b=m; } iB=a-1; }
    if (iB<iA) return;
    const clampY=v=>Math.min(py0+ph, Math.max(py0, YY(v))), m=iB-iA+1, sub={n:m, gy:{I:R.gy.I, off:R.gy.off+iA}};
    let pc=-1, pyv=0;
    const put=(a,b,ya,yb)=>{ for (let q=a;q<=b;q++){ if (ya<eT[q]) eT[q]=ya; if (yb>eB[q]) eB[q]=yb; } };
    // tutti i punti dentro (il caso normale): le colonne sono quelle della traccia (stessa espressione con nc colonne), riusate da traceLine
    const key = iA===0 && iB===n-1 && X.key!=null && nc ? X.key+'|'+nc : null;
    const all=iA===0 && iB===n-1, ysub=all ? ys : (ys.subarray ? ys.subarray(iA, iB+1) : ys.slice(iA, iB+1));
    const par=X.par && X.par.o===px0 && X.par.w===pw ? X.par : null;
    const G=(X.scr && par && all && screenGroups(R, xs, ys, par, nc, invert)) || groupsArr(all ? R : sub, ysub, par ? linCol(xs, iA, par, nc) : (k=>colOf(X(xs[iA+k]))), invert, key==null ? null : key+'|x'+R.gx.I.id+'@'+R.gx.off);
    for (let j=0;j<G.m;j++){ const c=G.c[j];
      const yf=clampY(G.f[j]), yl=clampY(G.l[j]), y1=clampY(G.mn[j]), y2=clampY(G.mx[j]);
      if (pc>=0){ const a=Math.min(c,pc), b=Math.max(c,pc); put(a, b, Math.min(yf,pyv), Math.max(yf,pyv)); }
      put(c, c, Math.min(y1,y2), Math.max(y1,y2));
      pc=c; pyv=yl; }
  }

  /* minimo, massimo (Y), minimo positivo (Y, solo se richiesto) e primo X positivo (solo se richiesto) di una serie pronta */
  function stats(R, xs, wantPos, wantX){ const n=R.n, out=[0,0]; mm(R.gy.I, R.gy.off, R.gy.off+n-1, out);
    const r={min:out[0], max:out[1], mp:Infinity, xpos:Infinity};
    if (wantPos) r.mp=mpos(R.gy.I, R.gy.off, R.gy.off+n-1);
    if (wantX){ let a=0, b=n; while (a<b){ const m=(a+b)>>1; if (xs[m]>0) b=m; else a=m+1; } if (a<n) r.xpos=xs[a]; }
    return r; }

  /* riscaldamento: le funzioni del disegno girano qualche volta su dati finti, a pezzi di pochi ms, così il compilatore del motore JS
     le ottimizza prima del primo confronto grande (senza: il primo disegno di 20×1M dura 3–4 volte di più). Una volta sola */
  let warmed=false;
  function warmup(){ if (warmed) return; warmed=true; const n=1<<17, xs=new Float64Array(n), ys=new Float64Array(n);
    for (let i=0;i<n;i++){ xs[i]=i; ys[i]=Math.sin(i*0.37)+((i*7919)%101)/101; }
    let k=0; const step=()=>{ const R=ready(xs, ys); if (!R) return; const cols=700+k*13, X=x=>3+(x-0)/(n-1)*150, Y=y=>2+(2-y)*20; X.lin=Y.lin=true; X.key='w'+k; X.par={o:3, lo:0, hi:n-1, den:n-1, w:150, inv:false};
      const eT=new Float64Array(cols).fill(Infinity), eB=new Float64Array(cols).fill(-Infinity), colOf=x=>Math.min(cols-1, Math.max(0, Math.floor((x-3)/150*cols)));
      envelope(R, xs, ys, X, Y, 3, 150, 2, 60, colOf, eT, eB, k%2===1, cols); groupsArr(R, ys, linCol(xs, 0, X.par, cols), k%2===1, null);
      if (++k<24) setTimeout(step, 4); };
    setTimeout(step, 0); }

  return { get, has, ready, warmup, linCol, screenGroups, scrStats:()=>Object.assign({}, scrStats), sortedX, span, groups, groupsArr, envelope, stats, mm, info:()=>Object.assign({}, stats0), MIN_N };
});
