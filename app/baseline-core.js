// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Rimozione del fondo (linea di base) con parametri: modulo puro, senza interfaccia. Funziona nel browser, nell'app desktop
   (pagina e worker) e in Node (test/unit/fondo.test.js, test/validation/fondo-sintetici.test.js).
   Pensato soprattutto per il Raman, dove la fluorescenza dà un fondo largo e curvo; vale per ogni spettro a picchi in su.
   Metodi:
     als       minimi quadrati asimmetrici (Eilers & Boelens 2005): smoother di Whittaker con pesi p sopra la base e 1−p sotto
     arpls     minimi quadrati penalizzati a pesi asimmetrici ripesati (Baek et al. 2015)
     modpoly   polinomio modificato (Lieber & Mahadevan-Jansen 2003): il dato si abbassa a ogni passo fino al polinomio
     imodpoly  polinomio modificato migliorato (Zhao et al. 2007): come modpoly, con la deviazione standard del residuo
     snip      clipping iterativo a finestra decrescente (Ryan et al. 1988; Morháč et al. 1997), con o senza trasformazione LLS
     rball     «rolling ball» (Kneen & Annegarn 1996): apertura morfologica (minimo poi massimo su una finestra) e media mobile
     anchor    punti di ancoraggio scelti a mano, uniti da un'interpolazione monotona a tratti (PCHIP, Fritsch & Carlson 1980) o da rette
   Tutte le funzioni ricevono y già orientato con i picchi verso l'alto e restituiscono un Float64Array della stessa lunghezza.
   Costo: O(n) per passo per Whittaker e rolling ball, O(n·finestra) per SNIP (oltre 3·10⁸ operazioni lavora a blocchi); O(n·g) per i polinomi di grado g. Oltre MAXN punti ALS e arPLS
   lavorano su una griglia a blocchi con λ riscalato (la penalità sulle differenze seconde scala come k⁴) e interpolano il risultato. */
(function(root, factory){
  if (typeof module==='object' && module.exports) module.exports=factory();
  else root.AcchBaseline=factory();
})(typeof self!=='undefined' ? self : this, function(){
  'use strict';
  const MAXN=100000;
  const isNum=v=>typeof v==='number' && Number.isFinite(v);
  const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));

  /* min Σ wᵢ(yᵢ−zᵢ)² + λ Σ(Δ²z)²: sistema pentadiagonale simmetrico risolto con LDLᵀ in O(n) */
  function whittaker(y, w, lam){
    const n=y.length; if (n<4) return Float64Array.from(y);
    const a0=new Float64Array(n), a1=new Float64Array(n), a2=new Float64Array(n);
    for (let i=0;i<n;i++) a0[i]=w[i]+lam*((i===0||i===n-1)?1:(i===1||i===n-2)?5:6);
    for (let i=0;i<n-1;i++) a1[i]=lam*((i===0||i===n-2)?-2:-4);
    for (let i=0;i<n-2;i++) a2[i]=lam;
    const D=new Float64Array(n), l1=new Float64Array(n), l2=new Float64Array(n);
    for (let i=0;i<n;i++){
      const L2 = i>=2 ? a2[i-2]/D[i-2] : 0;
      const L1 = i>=1 ? (a1[i-1] - (i>=2 ? L2*D[i-2]*l1[i-1] : 0))/D[i-1] : 0;
      D[i] = a0[i] - (i>=2 ? L2*L2*D[i-2] : 0) - (i>=1 ? L1*L1*D[i-1] : 0);
      l1[i]=L1; l2[i]=L2;
    }
    const z=new Float64Array(n);
    for (let i=0;i<n;i++) z[i]=w[i]*y[i] - (i>=1 ? l1[i]*z[i-1] : 0) - (i>=2 ? l2[i]*z[i-2] : 0);
    for (let i=0;i<n;i++) z[i]/=D[i];
    for (let i=n-1;i>=0;i--) z[i] -= (i+1<n ? l1[i+1]*z[i+1] : 0) + (i+2<n ? l2[i+2]*z[i+2] : 0);
    return z;
  }
  /* λ automatico: 1·10⁵ per 1000 punti, scalato con n⁴ perché la stessa curvatura in unità dell'asse resti uguale con più punti */
  function autoLam(n){ return 1e5*Math.pow(Math.max(n,8)/1000, 4); }
  /* blocchi per gli spettri molto lunghi: medie di k punti, λ/k⁴, poi interpolazione lineare sugli indici */
  function blocked(y, lam, fn){
    const n=y.length; if (n<=MAXN) return fn(y, lam);
    const k=Math.ceil(n/MAXN), m=Math.ceil(n/k), b=new Float64Array(m), c=new Float64Array(m);
    for (let j=0;j<m;j++){ let s=0, q=0; for (let i=j*k;i<Math.min(n,(j+1)*k);i++){ s+=y[i]; q++; } b[j]=s/q; c[j]=j*k+(q-1)/2; }
    const z=fn(b, lam/Math.pow(k,4)), out=new Float64Array(n);
    let j=0; for (let i=0;i<n;i++){ while (j<m-2 && c[j+1]<i) j++; const t=(i-c[j])/((c[j+1]-c[j])||1); out[i]=z[j]+(z[j+1]-z[j])*t; }
    return out;
  }
  function als(y, o){
    o=o||{}; const n=y.length; if (n<8) return Float64Array.from(y);
    const lam=isNum(o.lam)&&o.lam>0 ? o.lam : autoLam(n), p=isNum(o.p) ? clamp(o.p,1e-5,0.5) : 0.01, it=Math.round(clamp(isNum(o.iter)?o.iter:15,1,100));
    return blocked(y, lam, (Y, L)=>{ const N=Y.length; let w=new Float64Array(N).fill(1), z=Y;
      for (let k=0;k<it;k++){ z=whittaker(Y, w, L); let ch=0; for (let i=0;i<N;i++){ const nw=Y[i]>z[i]?p:1-p; if (nw!==w[i]){ ch++; w[i]=nw; } } if (!ch) break; }
      return z; });
  }
  function arpls(y, o){
    o=o||{}; const n=y.length; if (n<8) return Float64Array.from(y);
    const lam=isNum(o.lam)&&o.lam>0 ? o.lam : autoLam(n), ratio=isNum(o.ratio) ? clamp(o.ratio,1e-6,0.1) : 1e-3, it=Math.round(clamp(isNum(o.iter)?o.iter:60,1,200));
    return blocked(y, lam, (Y, L)=>{ const N=Y.length; let w=new Float64Array(N).fill(1), z=Y;
      for (let k=0;k<it;k++){
        z=whittaker(Y, w, L);
        let sm=0, c=0; for (let i=0;i<N;i++){ const d=Y[i]-z[i]; if (d<0){ sm+=d; c++; } }
        if (c<2) break;
        const m=sm/c; let sv=0; for (let i=0;i<N;i++){ const d=Y[i]-z[i]; if (d<0) sv+=(d-m)*(d-m); }
        const s=Math.sqrt(sv/(c-1))||1e-30, wn=new Float64Array(N); let num=0, den=0;
        for (let i=0;i<N;i++){ const d=Y[i]-z[i], e=Math.min(60, 2*(d-(2*s-m))/s); wn[i]=1/(1+Math.exp(e)); num+=(w[i]-wn[i])**2; den+=w[i]*w[i]; }
        w=wn; if (Math.sqrt(num/den)<ratio) break;
      }
      return z; });
  }

  /* ---- polinomi: base di Čebyšëv su x riportato in [−1, 1] (ben condizionata), equazioni normali con Cholesky ---- */
  function chebBasis(xs, g){
    const n=xs.length; let lo=Infinity, hi=-Infinity; for (let i=0;i<n;i++){ const v=isNum(xs[i])?xs[i]:i; if (v<lo) lo=v; if (v>hi) hi=v; }
    const c=(lo+hi)/2, h=((hi-lo)/2)||1, B=new Float64Array(n*(g+1));
    for (let i=0;i<n;i++){ const u=((isNum(xs[i])?xs[i]:i)-c)/h, o=i*(g+1); B[o]=1; if (g>=1) B[o+1]=u; for (let k=2;k<=g;k++) B[o+k]=2*u*B[o+k-1]-B[o+k-2]; }
    return B;
  }
  function cholesky(A, m){ const L=new Float64Array(m*m);
    for (let i=0;i<m;i++) for (let j=0;j<=i;j++){ let s=A[i*m+j]; for (let k=0;k<j;k++) s-=L[i*m+k]*L[j*m+k];
      if (i===j){ if (!(s>1e-300)) return null; L[i*m+i]=Math.sqrt(s); } else L[i*m+j]=s/L[j*m+j]; }
    return L; }
  function cholSolve(L, m, b){ const z=new Float64Array(m), x=new Float64Array(m);
    for (let i=0;i<m;i++){ let s=b[i]; for (let k=0;k<i;k++) s-=L[i*m+k]*z[k]; z[i]=s/L[i*m+i]; }
    for (let i=m-1;i>=0;i--){ let s=z[i]; for (let k=i+1;k<m;k++) s-=L[k*m+i]*x[k]; x[i]=s/L[i*m+i]; }
    return x; }
  function polyFitter(xs, g, mask){   // restituisce fit(y) → valori del polinomio sui punti; mask: punti esclusi (facoltativo)
    const n=xs.length, m=g+1, B=chebBasis(xs, g), A=new Float64Array(m*m);
    for (let i=0;i<n;i++){ if (mask && !mask[i]) continue; const o=i*m; for (let a=0;a<m;a++){ const v=B[o+a]; for (let b=0;b<=a;b++) A[a*m+b]+=v*B[o+b]; } }
    for (let a=0;a<m;a++) for (let b=a+1;b<m;b++) A[a*m+b]=A[b*m+a];
    for (let a=0;a<m;a++) A[a*m+a]*=1+1e-12;   // piccola regolarizzazione contro la singolarità con pochi punti
    const L=cholesky(A, m); if (!L) return null;
    return y=>{ const r=new Float64Array(m); for (let i=0;i<n;i++){ if (mask && !mask[i]) continue; const o=i*m, v=y[i]; for (let a=0;a<m;a++) r[a]+=B[o+a]*v; }
      const c=cholSolve(L, m, r), out=new Float64Array(n); for (let i=0;i<n;i++){ const o=i*m; let s=0; for (let a=0;a<m;a++) s+=c[a]*B[o+a]; out[i]=s; } return out; };
  }
  function polyOpts(y, o){ o=o||{}; const n=y.length;
    return {g:Math.round(clamp(isNum(o.deg)?o.deg:5, 1, Math.min(15, n-2))), it:Math.round(clamp(isNum(o.iter)?o.iter:100,1,1000)), tol:isNum(o.tol)?clamp(o.tol,1e-9,0.1):1e-3}; }
  function modpoly(xs, y, o){
    const n=y.length; if (n<8) return Float64Array.from(y);
    const {g,it,tol}=polyOpts(y,o), fit=polyFitter(xs, g); if (!fit) return Float64Array.from(y);
    let cur=Float64Array.from(y), p=fit(cur);
    for (let k=0;k<it;k++){ let num=0, den=0; for (let i=0;i<n;i++){ const v=Math.min(cur[i], p[i]); num+=(v-cur[i])**2; den+=cur[i]*cur[i]; cur[i]=v; }
      p=fit(cur); if (Math.sqrt(num/(den||1e-300))<tol) break; }
    return p;
  }
  function imodpoly(xs, y, o){
    const n=y.length; if (n<8) return Float64Array.from(y);
    const {g,it,tol}=polyOpts(y,o), fit=polyFitter(xs, g); if (!fit) return Float64Array.from(y);
    const std=(a,b)=>{ let s=0, q=0; for (let i=0;i<n;i++){ const r=a[i]-b[i]; s+=r; q+=r*r; } const m=s/n; return Math.sqrt(Math.max(0,q/n-m*m)); };
    // primo passo (Zhao 2007): si tolgono dal fit i punti sopra polinomio + DEV, cioè i picchi più grandi
    let p=fit(y), dev=std(y,p); const mask=new Uint8Array(n); let kept=0; for (let i=0;i<n;i++){ if (y[i]<=p[i]+dev){ mask[i]=1; kept++; } }
    if (kept>g+2){ const f1=polyFitter(xs, g, mask); if (f1){ const ym=Float64Array.from(y); p=f1(ym); } }
    let cur=Float64Array.from(y); for (let i=0;i<n;i++) if (cur[i]>p[i]+dev) cur[i]=p[i]+dev;
    for (let k=0;k<it;k++){
      p=fit(cur); const d2=std(cur,p);
      for (let i=0;i<n;i++) if (cur[i]>p[i]+d2) cur[i]=p[i]+d2;
      if (Math.abs(d2-dev)/(d2||1e-300)<tol){ dev=d2; break; } dev=d2;
    }
    return p;
  }

  /* ---- SNIP: finestra decrescente; lls=true per conteggi (trasformazione log-log-radice) ---- */
  const SNIP_OPS=3e8;   // costo massimo n × finestra: oltre, medie a blocchi di k punti (finestra/k) e interpolazione, come per ALS e arPLS
  function snip(y, o){
    o=o||{}; const n=y.length; if (n<8) return Float64Array.from(y);
    const m=Math.round(clamp(isNum(o.hw)?o.hw:Math.max(10, Math.round(n/40)), 1, Math.floor(n/2)));
    if (n*m>SNIP_OPS && !o._inner){ const k=Math.ceil(Math.sqrt(n*m/SNIP_OPS)), nb=Math.ceil(n/k), b=new Float64Array(nb), c=new Float64Array(nb);
      for (let j=0;j<nb;j++){ let s=0, q=0; for (let i=j*k;i<Math.min(n,(j+1)*k);i++){ s+=y[i]; q++; } b[j]=s/q; c[j]=j*k+(q-1)/2; }
      const z=snip(b, Object.assign({}, o, {hw:Math.max(1,Math.round(m/k)), pre:o.pre>=1?Math.max(1,Math.round(o.pre/k)):0, _inner:true})), out=new Float64Array(n);
      let j=0; for (let i=0;i<n;i++){ while (j<nb-2 && c[j+1]<i) j++; const t=(i-c[j])/((c[j+1]-c[j])||1); out[i]=z[j]+(z[j+1]-z[j])*Math.max(0,Math.min(1,t)); }
      return out; }
    let mn=Infinity; for (let i=0;i<n;i++) if (y[i]<mn) mn=y[i];
    if (isNum(o.pre) && o.pre>=1) y=movMean(y, Math.round(o.pre));   // lisciatura preliminare: il clipping non scende sui minimi del rumore
    const lls=!!o.lls, sh=lls ? 0 : -mn;
    const fw=v=> lls ? Math.log(Math.log(Math.sqrt(Math.max(v,0)+1)+1)+1) : v+sh, bw=v=> lls ? Math.pow(Math.exp(Math.exp(v)-1)-1,2)-1 : v-sh;
    const v=Float64Array.from(y, fw), t=new Float64Array(n);
    const order = o.increasing ? (q=>q) : (q=>m+1-q);
    for (let q=1;q<=m;q++){ const p=order(q);
      for (let i=0;i<n;i++){ if (i<p || i>=n-p){ t[i]=v[i]; continue; } const a=(v[i-p]+v[i+p])/2; t[i]=a<v[i]?a:v[i]; }
      v.set(t); }
    return Float64Array.from(v, bw);
  }

  /* ---- rolling ball (Kneen & Annegarn 1996): minimo, massimo e media su finestre di semiampiezza hw e sm; O(n) con le code monotone ---- */
  function runExt(a, hw, isMin){
    const n=a.length, out=new Float64Array(n), q=new Int32Array(n); let h=0, t=0, r=0;
    for (let i=0;i<n;i++){
      const hi=Math.min(n-1, i+hw), lo=Math.max(0, i-hw);
      while (r<=hi){ const v=a[r]; while (t>h && (isMin ? a[q[t-1]]>=v : a[q[t-1]]<=v)) t--; q[t++]=r; r++; }
      while (q[h]<lo) h++;
      out[i]=a[q[h]];
    }
    return out;
  }
  function movMean(a, w){ const n=a.length; if (w<1) return Float64Array.from(a); const ps=new Float64Array(n+1); for (let i=0;i<n;i++) ps[i+1]=ps[i]+a[i];
    const out=new Float64Array(n); for (let i=0;i<n;i++){ const lo=Math.max(0,i-w), hi=Math.min(n-1,i+w); out[i]=(ps[hi+1]-ps[lo])/(hi-lo+1); } return out; }
  function rball(y, o){
    o=o||{}; const n=y.length; if (n<8) return Float64Array.from(y);
    const hw=Math.round(clamp(isNum(o.hw)?o.hw:Math.max(10, Math.round(n/30)), 1, Math.floor(n/2))), sm=Math.round(clamp(isNum(o.sm)?o.sm:hw, 0, Math.floor(n/2)));
    if (isNum(o.pre) && o.pre>=1) y=movMean(y, Math.round(o.pre));
    return movMean(runExt(runExt(y, hw, true), hw, false), sm);
  }

  /* ---- punti di ancoraggio: y medio su ±hw punti attorno a ogni x, poi PCHIP (niente oscillazioni tra i punti) o rette ---- */
  function nearest(xs, x){ let lo=0, hi=xs.length-1; const up=xs[hi]>=xs[0];
    while (hi-lo>1){ const m=(lo+hi)>>1; if ((xs[m]<=x)===up) lo=m; else hi=m; }
    return Math.abs(xs[lo]-x)<=Math.abs(xs[hi]-x)?lo:hi; }
  function pchipSlopes(X, Y){ const k=X.length, d=new Float64Array(k), h=new Float64Array(k-1), s=new Float64Array(k-1);
    for (let i=0;i<k-1;i++){ h[i]=X[i+1]-X[i]; s[i]=(Y[i+1]-Y[i])/h[i]; }
    if (k===2){ d[0]=d[1]=s[0]; return d; }
    for (let i=1;i<k-1;i++){ if (s[i-1]*s[i]<=0) d[i]=0; else { const w1=2*h[i]+h[i-1], w2=h[i]+2*h[i-1]; d[i]=(w1+w2)/(w1/s[i-1]+w2/s[i]); } }
    const end=(h0,h1,s0,s1)=>{ let v=((2*h0+h1)*s0-h0*s1)/(h0+h1); if (Math.sign(v)!==Math.sign(s0)) v=0; else if (Math.sign(s0)!==Math.sign(s1) && Math.abs(v)>Math.abs(3*s0)) v=3*s0; return v; };
    d[0]=end(h[0],h[1],s[0],s[1]); d[k-1]=end(h[k-2],h[k-3],s[k-2],s[k-3]);
    return d; }
  function anchorPoints(xs, y, pts, hw){
    const n=y.length, w=Math.round(clamp(isNum(hw)?hw:2, 0, 50)), seen=new Set(), out=[];
    for (const x of (pts||[])){ if (!isNum(x)) continue; const i=nearest(xs, x); if (seen.has(i)) continue; seen.add(i);
      let s=0, c=0; for (let j=Math.max(0,i-w); j<=Math.min(n-1,i+w); j++){ s+=y[j]; c++; } out.push({i, x:xs[i], y:s/c}); }
    return out.sort((a,b)=>a.x-b.x);
  }
  function anchor(xs, y, o){
    o=o||{}; const n=y.length, A=anchorPoints(xs, y, o.pts, o.hw);
    if (!A.length) return new Float64Array(n).fill(NaN);
    if (A.length===1) return new Float64Array(n).fill(A[0].y);
    const X=A.map(a=>a.x), Y=A.map(a=>a.y), k=A.length, lin=o.interp==='linear', d=lin?null:pchipSlopes(X,Y), out=new Float64Array(n);
    for (let i=0;i<n;i++){ const x=xs[i];
      if (x<=X[0]){ out[i]=Y[0]; continue; } if (x>=X[k-1]){ out[i]=Y[k-1]; continue; }   // fuori dai punti: costante (niente estrapolazioni)
      let lo=0, hi=k-1; while (hi-lo>1){ const m=(lo+hi)>>1; if (X[m]<=x) lo=m; else hi=m; }
      const h=X[hi]-X[lo], t=(x-X[lo])/h;
      if (lin){ out[i]=Y[lo]+(Y[hi]-Y[lo])*t; continue; }
      const t2=t*t, t3=t2*t; out[i]=(2*t3-3*t2+1)*Y[lo]+(t3-2*t2+t)*h*d[lo]+(-2*t3+3*t2)*Y[hi]+(t3-t2)*h*d[hi]; }
    return out;
  }

  /* ---- descrizione dei metodi e dei parametri (unica fonte per interfaccia, metodi e controlli dei progetti) ---- */
  const METHODS={
    als:     {p:{lam:[1,1e13], p:[1e-5,0.5], iter:[1,100]}},
    arpls:   {p:{lam:[1,1e13], ratio:[1e-6,0.1], iter:[1,200]}},
    modpoly: {p:{deg:[1,15], iter:[1,1000], tol:[1e-9,0.1]}},
    imodpoly:{p:{deg:[1,15], iter:[1,1000], tol:[1e-9,0.1]}},
    snip:    {p:{hw:[1,1e6], pre:[0,1e5]}},
    rball:   {p:{hw:[1,1e6], sm:[0,1e6], pre:[0,1e5]}},
    anchor:  {p:{hw:[0,50]}}
  };
  /* parametri arrivati da un progetto o da un'impostazione salvata: solo i nomi noti, numeri finiti entro i limiti */
  function cleanParams(method, v){
    const M=METHODS[method]; if (!M || !v || typeof v!=='object' || Array.isArray(v)) return null; const o={};
    for (const [k,[lo,hi]] of Object.entries(M.p)) if (isNum(v[k]) && v[k]>=lo && v[k]<=hi) o[k]=v[k];
    if (method==='snip' && v.lls===true) o.lls=true;
    if (method==='anchor'){ if (Array.isArray(v.pts)){ const pts=[...new Set(v.pts.filter(isNum))].slice(0,200).sort((a,b)=>a-b); if (pts.length) o.pts=pts; } if (v.interp==='linear') o.interp='linear'; }
    return Object.keys(o).length ? o : null;
  }
  /* calcolo: m metodo, xs asse, y picchi in su, o parametri. Restituisce il fondo (Float64Array) */
  function compute(m, xs, y, o){
    switch (m){
      case 'als': return als(y, o);
      case 'arpls': return arpls(y, o);
      case 'modpoly': return modpoly(xs, y, o);
      case 'imodpoly': return imodpoly(xs, y, o);
      case 'snip': return snip(y, o);
      case 'rball': return rball(y, o);
      case 'anchor': return anchor(xs, y, o);
      default: return null;
    }
  }
  return {whittaker, autoLam, als, arpls, modpoly, imodpoly, snip, rball, anchor, anchorPoints, compute, cleanParams, METHODS, MAXN};
});
