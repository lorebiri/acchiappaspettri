// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Serie di spettri e MCR-ALS: parte pura, senza DOM (SPEC-AVANZATE §2). Gira nel browser, nel desktop e in Node per i test.
   D (m × n) = C Sᵀ + E: m spettri (righe: tempi, dosi, campioni), n canali (λ, numeri d'onda); C (m × nc) concentrazioni, S (nc × n) spettri puri.
   Le matrici sono {m, n, a} con a Float64Array per righe. I calcoli lunghi sono generatori (function*): l'interfaccia li fa avanzare a fette
   (nessun blocco oltre 50 ms), i test li esauriscono con drain(). Deterministico: nessun numero casuale. */
(function(root, factory){
  if (typeof module==='object' && module.exports) module.exports=factory();
  else root.McrCore=factory();
})(typeof globalThis!=='undefined' ? globalThis : this, function(){
  'use strict';
  const VERSION='mcr-1';
  const fin=v=>typeof v==='number' && Number.isFinite(v);
  const mat=(m,n,a)=>({m, n, a:a||new Float64Array(m*n)});
  function drain(g){ let r; do { r=g.next(); } while (!r.done); return r.value; }
  function fromRows(rows){ const m=rows.length, n=m?rows[0].length:0, M=mat(m,n); for (let i=0;i<m;i++){ const r=rows[i]; if (r.length!==n) throw new Error('righe di lunghezza diversa'); for (let j=0;j<n;j++) M.a[i*n+j]=r[j]; } return M; }
  function toRows(M){ const out=[]; for (let i=0;i<M.m;i++) out.push(Array.from(M.a.subarray(i*M.n,(i+1)*M.n))); return out; }
  function transpose(M){ const T=mat(M.n,M.m); for (let i=0;i<M.m;i++) for (let j=0;j<M.n;j++) T.a[j*M.m+i]=M.a[i*M.n+j]; return T; }
  function col(M,j){ const v=new Float64Array(M.m); for (let i=0;i<M.m;i++) v[i]=M.a[i*M.n+j]; return v; }
  function row(M,i){ return M.a.slice(i*M.n,(i+1)*M.n); }
  function sumSq(a){ let s=0; for (let i=0;i<a.length;i++) s+=a[i]*a[i]; return s; }

  /* ---------------- algebra densa piccola (k × k) ---------------- */
  // Cholesky con un minimo di regolarizzazione relativa: le matrici di Gram di MCR possono essere quasi singolari
  function chol(A, k){ const L=new Float64Array(k*k); let dmax=0; for (let i=0;i<k;i++) dmax=Math.max(dmax, A[i*k+i]);
    const eps=1e-13*(dmax||1);
    for (let i=0;i<k;i++) for (let j=0;j<=i;j++){ let s=A[i*k+j]; for (let q=0;q<j;q++) s-=L[i*k+q]*L[j*k+q];
      if (i===j){ if (!(s>eps)) s=s>0?Math.max(s,eps):eps; L[i*k+i]=Math.sqrt(s); } else L[i*k+j]=s/L[j*k+j]; }
    return L; }
  function cholSolve(L, k, b){ const y=new Float64Array(k); for (let i=0;i<k;i++){ let s=b[i]; for (let q=0;q<i;q++) s-=L[i*k+q]*y[q]; y[i]=s/L[i*k+i]; }
    for (let i=k-1;i>=0;i--){ let s=y[i]; for (let q=i+1;q<k;q++) s-=L[q*k+i]*y[q]; y[i]=s/L[i*k+i]; } return y; }
  function solveSPD(A, k, b){ return cholSolve(chol(A,k), k, b); }
  // Gauss con pivot parziale (matrici quadrate generali, per le rotazioni di MCR-BANDS)
  function inverse(A, k){ const M=Float64Array.from(A), I=new Float64Array(k*k); for (let i=0;i<k;i++) I[i*k+i]=1;
    for (let c=0;c<k;c++){ let p=c; for (let r=c+1;r<k;r++) if (Math.abs(M[r*k+c])>Math.abs(M[p*k+c])) p=r;
      const piv=M[p*k+c]; if (!(Math.abs(piv)>1e-300)) return null;
      if (p!==c) for (let q=0;q<k;q++){ let t=M[c*k+q]; M[c*k+q]=M[p*k+q]; M[p*k+q]=t; t=I[c*k+q]; I[c*k+q]=I[p*k+q]; I[p*k+q]=t; }
      for (let q=0;q<k;q++){ M[c*k+q]/=piv; I[c*k+q]/=piv; } M[c*k+c]=1;
      for (let r=0;r<k;r++){ if (r===c) continue; const f=M[r*k+c]; if (f){ for (let q=0;q<k;q++){ M[r*k+q]-=f*M[c*k+q]; I[r*k+q]-=f*I[c*k+q]; } } } }
    return I; }
  function det(A, k){ const M=Float64Array.from(A); let d=1; for (let c=0;c<k;c++){ let p=c; for (let r=c+1;r<k;r++) if (Math.abs(M[r*k+c])>Math.abs(M[p*k+c])) p=r;
      if (M[p*k+c]===0) return 0; if (p!==c){ d=-d; for (let q=0;q<k;q++){ const t=M[c*k+q]; M[c*k+q]=M[p*k+q]; M[p*k+q]=t; } }
      d*=M[c*k+c]; for (let r=c+1;r<k;r++){ const f=M[r*k+c]/M[c*k+c]; for (let q=c;q<k;q++) M[r*k+q]-=f*M[c*k+q]; } } return d; }

  /* ---------------- autovalori simmetrici: Householder + QL implicito (JAMA, pubblico dominio) ----------------
     V: n righe Float64Array, simmetrica in ingresso; in uscita gli autovettori per colonne. Restituisce d in ordine decrescente. */
  function* eigSymGen(A, n){
    const V=[]; for (let i=0;i<n;i++) V.push(Float64Array.from(A.subarray ? A.subarray(i*n,(i+1)*n) : A.slice(i*n,(i+1)*n)));
    const d=new Float64Array(n), e=new Float64Array(n);
    for (let j=0;j<n;j++) d[j]=V[n-1][j];
    for (let i=n-1;i>0;i--){
      let scale=0, h=0; for (let k=0;k<i;k++) scale+=Math.abs(d[k]);
      if (scale===0){ e[i]=d[i-1]; for (let j=0;j<i;j++){ d[j]=V[i-1][j]; V[i][j]=0; V[j][i]=0; } }
      else {
        for (let k=0;k<i;k++){ d[k]/=scale; h+=d[k]*d[k]; }
        let f=d[i-1], g=Math.sqrt(h); if (f>0) g=-g;
        e[i]=scale*g; h-=f*g; d[i-1]=f-g; for (let j=0;j<i;j++) e[j]=0;
        for (let j=0;j<i;j++){ f=d[j]; V[j][i]=f; g=e[j]+V[j][j]*f; for (let k=j+1;k<=i-1;k++){ g+=V[k][j]*d[k]; e[k]+=V[k][j]*f; } e[j]=g; }
        f=0; for (let j=0;j<i;j++){ e[j]/=h; f+=e[j]*d[j]; }
        const hh=f/(h+h); for (let j=0;j<i;j++) e[j]-=hh*d[j];
        for (let j=0;j<i;j++){ f=d[j]; g=e[j]; for (let k=j;k<=i-1;k++) V[k][j]-=(f*e[k]+g*d[k]); d[j]=V[i-1][j]; V[i][j]=0; }
      }
      d[i]=h; if ((i&1)===0) yield {phase:'eig', frac:0.4*(n-i)/n};
    }
    for (let i=0;i<n-1;i++){
      V[n-1][i]=V[i][i]; V[i][i]=1; const h=d[i+1];
      if (h!==0){ for (let k=0;k<=i;k++) d[k]=V[k][i+1]/h;
        for (let j=0;j<=i;j++){ let g=0; for (let k=0;k<=i;k++) g+=V[k][i+1]*V[k][j]; for (let k=0;k<=i;k++) V[k][j]-=g*d[k]; } }
      for (let k=0;k<=i;k++) V[k][i+1]=0; if ((i&1)===0) yield {phase:'eig', frac:0.4+0.2*i/n};
    }
    for (let j=0;j<n;j++){ d[j]=V[n-1][j]; V[n-1][j]=0; } V[n-1][n-1]=1; e[0]=0;
    for (let i=1;i<n;i++) e[i-1]=e[i]; e[n-1]=0;
    let f=0, tst1=0; const eps=Math.pow(2,-52);
    for (let l=0;l<n;l++){
      tst1=Math.max(tst1, Math.abs(d[l])+Math.abs(e[l])); let m=l; while (m<n){ if (Math.abs(e[m])<=eps*tst1) break; m++; }
      if (m>l){ let iter=0;
        do { iter++;
          let g=d[l], p=(d[l+1]-g)/(2*e[l]), r=Math.hypot(p,1); if (p<0) r=-r;
          d[l]=e[l]/(p+r); d[l+1]=e[l]*(p+r); const dl1=d[l+1]; let h=g-d[l];
          for (let i=l+2;i<n;i++) d[i]-=h; f+=h;
          p=d[m]; let c=1, c2=c, c3=c; const el1=e[l+1]; let s=0, s2=0;
          for (let i=m-1;i>=l;i--){ c3=c2; c2=c; s2=s; g=c*e[i]; h=c*p; r=Math.hypot(p,e[i]); e[i+1]=s*r; s=e[i]/r; c=p/r; p=c*d[i]-s*g; d[i+1]=h+s*(c*g+s*d[i]);
            for (let k=0;k<n;k++){ h=V[k][i+1]; V[k][i+1]=s*V[k][i]+c*h; V[k][i]=c*V[k][i]-s*h; } }
          p=-s*s2*c3*el1*e[l]/dl1; e[l]=s*p; d[l]=c*p;
        } while (Math.abs(e[l])>eps*tst1 && iter<80);
      }
      d[l]+=f; e[l]=0; yield {phase:'eig', frac:0.6+0.4*l/n};
    }
    const ord=Array.from({length:n},(_,i)=>i).sort((a,b)=>d[b]-d[a]);
    const vals=Float64Array.from(ord, i=>d[i]), vecs=mat(n,n); for (let i=0;i<n;i++) for (let j=0;j<n;j++) vecs.a[i*n+j]=V[i][ord[j]];
    return {values:vals, vectors:vecs};
  }
  const eigSym=(A,n)=>drain(eigSymGen(A,n));

  /* ---------------- SVD dalla matrice di Gram del lato più piccolo ----------------
     Precisione: i valori singolari sotto √ε·s₁ (≈1e-8 relativo) sono il rumore numerico; per scegliere le componenti basta. */
  function* svdGen(D, q){
    const {m, n, a}=D, small=Math.min(m,n), rowsSide=m<=n, G=new Float64Array(small*small);
    if (rowsSide){ for (let i=0;i<m;i++){ const ri=a.subarray(i*n,(i+1)*n); for (let j=0;j<=i;j++){ const rj=a.subarray(j*n,(j+1)*n); let s=0; for (let k=0;k<n;k++) s+=ri[k]*rj[k]; G[i*m+j]=s; G[j*m+i]=s; } if ((i&3)===3) yield {phase:'gram', frac:i/m}; } }
    else { for (let k=0;k<m;k++){ const rk=a.subarray(k*n,(k+1)*n); for (let i=0;i<n;i++){ const v=rk[i]; if (v) for (let j=0;j<=i;j++) G[i*n+j]+=v*rk[j]; } if ((k&3)===3) yield {phase:'gram', frac:k/m}; }
      for (let i=0;i<n;i++) for (let j=0;j<i;j++) G[j*n+i]=G[i*n+j]; }
    const E=yield* eigSymGen(G, small);
    q=Math.max(1, Math.min(q||small, small));
    const s=new Float64Array(small); for (let i=0;i<small;i++) s[i]=Math.sqrt(Math.max(0,E.values[i]));
    const tol=s[0]*small*2.2e-16*1e4;
    // l'altro lato: U = D V / s oppure V = Dᵀ U / s; i vettori dei valori nulli restano a zero (non servono)
    const U=mat(m,q), V=mat(n,q);
    for (let c=0;c<q;c++){ const sc=s[c];
      if (rowsSide){ for (let i=0;i<m;i++) U.a[i*q+c]=E.vectors.a[i*small+c]; if (sc>tol) for (let j=0;j<n;j++){ let t=0; for (let i=0;i<m;i++) t+=a[i*n+j]*U.a[i*q+c]; V.a[j*q+c]=t/sc; } }
      else { for (let j=0;j<n;j++) V.a[j*q+c]=E.vectors.a[j*small+c]; if (sc>tol) for (let i=0;i<m;i++){ let t=0; const ri=i*n; for (let j=0;j<n;j++) t+=a[ri+j]*V.a[j*q+c]; U.a[i*q+c]=t/sc; } }
      yield {phase:'svd', frac:c/q}; }
    return {s, U, V, q};
  }
  const svd=(D,q)=>drain(svdGen(D,q));

  /* numero di componenti: lo decide l'utente; qui solo un'indicazione, la funzione IND di Malinowski (Anal. Chem. 49, 1977, 612) */
  function suggestRank(s, m, n){ const r=Math.min(m,n), lam=Array.from(s, v=>v*v); let best=1, bv=Infinity; const out=[];
    for (let k=1;k<r && k<=Math.min(15,r-1);k++){ let rest=0; for (let j=k;j<r;j++) rest+=lam[j]; const RE=Math.sqrt(rest/(Math.max(m,n)*(r-k))), IND=RE/((r-k)*(r-k)); out.push({k, RE, IND}); if (IND<bv){ bv=IND; best=k; } }
    return {k:best, table:out}; }
  // mancanza di adattamento minima con k componenti (PCA): il limite sotto il quale nessun MCR può scendere
  function lofPca(s, k, sst){ let rest=0; for (let j=k;j<s.length;j++) rest+=s[j]*s[j]; return 100*Math.sqrt(Math.max(0,rest)/(sst||1)); }

  /* ---------------- minimi quadrati non negativi: FNNLS di Bro e De Jong (J. Chemom. 11, 1997, 393) ----------------
     Sul sistema normale: G = ZᵀZ (k × k), h = Zᵀx. È l'algoritmo di Lawson e Hanson scritto sui prodotti incrociati. */
  function fnnls(G, h, k, out){
    const x=out||new Float64Array(k); x.fill(0); const P=new Uint8Array(k); let w=Float64Array.from(h);
    let hmax=0; for (let i=0;i<k;i++) hmax=Math.max(hmax, Math.abs(h[i])); let gmax=0; for (let i=0;i<k;i++) gmax=Math.max(gmax, G[i*k+i]);
    const tol=1e-12*Math.max(hmax, 1e-300)*Math.max(1, k);
    const solveP=()=>{ const idx=[]; for (let i=0;i<k;i++) if (P[i]) idx.push(i); const p=idx.length, A=new Float64Array(p*p), b=new Float64Array(p);
      for (let i=0;i<p;i++){ b[i]=h[idx[i]]; for (let j=0;j<p;j++) A[i*p+j]=G[idx[i]*k+idx[j]]; } const z=p?solveSPD(A,p,b):new Float64Array(0); const s=new Float64Array(k); idx.forEach((q,i)=>s[q]=z[i]); return s; };
    for (let outer=0; outer<3*k+10; outer++){
      let t=-1, wm=tol; for (let i=0;i<k;i++) if (!P[i] && w[i]>wm){ wm=w[i]; t=i; }
      if (t<0) break; P[t]=1;
      let s=solveP();
      for (let inner=0; inner<3*k+10; inner++){
        let neg=false; for (let i=0;i<k;i++) if (P[i] && s[i]<=0){ neg=true; break; }
        if (!neg) break;
        let alpha=Infinity; for (let i=0;i<k;i++) if (P[i] && s[i]<=0){ const a=x[i]/(x[i]-s[i]); if (a<alpha) alpha=a; }
        if (!fin(alpha)) alpha=0;
        for (let i=0;i<k;i++){ x[i]+=alpha*(s[i]-x[i]); if (P[i] && x[i]<=1e-15*Math.max(1,Math.abs(s[i]))){ P[i]=0; x[i]=0; } }
        s=solveP();
      }
      for (let i=0;i<k;i++) x[i]=P[i]?s[i]:0;
      for (let i=0;i<k;i++){ let v=h[i]; for (let j=0;j<k;j++) v-=G[i*k+j]*x[j]; w[i]=v; }
    }
    void gmax; return x;
  }
  // Lawson–Hanson classico su colonne, per i confronti con il NNLS del nucleo (stesso risultato di fnnls)
  function nnlsCols(A, b){ const k=A.length, m=b.length, G=new Float64Array(k*k), h=new Float64Array(k);
    for (let i=0;i<k;i++){ for (let j=0;j<=i;j++){ let s=0; for (let r=0;r<m;r++) s+=A[i][r]*A[j][r]; G[i*k+j]=G[j*k+i]=s; } let s=0; for (let r=0;r<m;r++) s+=A[i][r]*b[r]; h[i]=s; }
    return fnnls(G,h,k); }
  /* chiusura esatta: min ½xᵀGx − hᵀx con 1ᵀx = t (moltiplicatore di Lagrange) e, se nonneg, x ≥ 0 con lo stesso schema a insiemi attivi
     di Lawson e Hanson (il sottoproblema su P è a uguaglianza). Partenza ammissibile: tutto sulla componente migliore. */
  function eqLS(G, h, k, idx, t){ const p=idx.length, A=new Float64Array(p*p), b=new Float64Array(p), one=new Float64Array(p).fill(1);
    for (let i=0;i<p;i++){ b[i]=h[idx[i]]; for (let j=0;j<p;j++) A[i*p+j]=G[idx[i]*k+idx[j]]; }
    const L=chol(A,p), u=cholSolve(L,p,b), v=cholSolve(L,p,one); let su=0, sv=0; for (let i=0;i<p;i++){ su+=u[i]; sv+=v[i]; }
    const mu=(su-t)/(sv||1e-300), z=new Float64Array(p); for (let i=0;i<p;i++) z[i]=u[i]-mu*v[i]; return {z, mu}; }
  function closedLS(G, h, k, t, nonneg, out){ const x=out||new Float64Array(k); x.fill(0);
    if (!nonneg){ const r=eqLS(G,h,k,Array.from({length:k},(_,i)=>i),t); x.set(r.z); return x; }
    let j0=0, f0=Infinity; for (let j=0;j<k;j++){ const f=0.5*t*t*G[j*k+j]-t*h[j]; if (f<f0){ f0=f; j0=j; } }
    const P=new Uint8Array(k); P[j0]=1; x[j0]=t; let hmax=0; for (let i=0;i<k;i++) hmax=Math.max(hmax,Math.abs(h[i]));
    const tol=1e-12*Math.max(hmax,1e-300)*Math.max(1,k);
    for (let outer=0; outer<3*k+10; outer++){
      const idx=[]; for (let i=0;i<k;i++) if (P[i]) idx.push(i);
      let mu=0; for (const i of idx){ let g=h[i]; for (let j=0;j<k;j++) g-=G[i*k+j]*x[j]; mu+=g; } mu/=idx.length;
      let tt=-1, wm=tol; for (let i=0;i<k;i++) if (!P[i]){ let g=h[i]; for (let j=0;j<k;j++) g-=G[i*k+j]*x[j]; const w=g-mu; if (w>wm){ wm=w; tt=i; } }
      if (tt<0) break; P[tt]=1;
      for (let inner=0; inner<3*k+10; inner++){
        const id=[]; for (let i=0;i<k;i++) if (P[i]) id.push(i); const {z}=eqLS(G,h,k,id,t);
        if (z.every(v=>v>0)){ id.forEach((q,i)=>x[q]=z[i]); break; }
        let alpha=1; id.forEach((q,i)=>{ if (z[i]<=0){ const a=x[q]/((x[q]-z[i])||1e-300); if (a<alpha) alpha=a; } });
        id.forEach((q,i)=>{ x[q]+=alpha*(z[i]-x[q]); if (x[q]<=1e-15*Math.abs(t)){ x[q]=0; P[q]=0; } });
        if (!P.some(v=>v)){ P[j0]=1; x[j0]=t; break; }
      }
    }
    return x; }

  /* ---------------- unimodalità: minimi quadrati unimodali (Bro e Sidiropoulos, J. Chemom. 12, 1998, 223) ----------------
     Ogni funzione unimodale è una salita (isotona) seguita da una discesa: si prova ogni punto di cambio con la regressione isotona (PAVA). */
  function isoErrors(y, inc){   // per ogni prefisso [0..p], l'errore della migliore successione monotona (crescente se inc)
    const n=y.length, err=new Float64Array(n), val=[], wt=[], sse=[]; let tot=0;
    for (let p=0;p<n;p++){ let v=inc?y[p]:-y[p], w=1, e=0;
      while (val.length && val[val.length-1]>=v){ const v0=val.pop(), w0=wt.pop(), e0=sse.pop(); tot-=e0; const nv=(v0*w0+v*w)/(w0+w); e=e0+e+w0*(v0-nv)*(v0-nv)+w*(v-nv)*(v-nv); v=nv; w+=w0; }
      val.push(v); wt.push(w); sse.push(e); tot+=e; err[p]=tot; }
    return err; }
  function pava(y, inc){ const val=[], wt=[], len=[]; for (let p=0;p<y.length;p++){ let v=inc?y[p]:-y[p], w=1, l=1; while (val.length && val[val.length-1]>=v){ const v0=val.pop(), w0=wt.pop(), l0=len.pop(); v=(v0*w0+v*w)/(w0+w); w+=w0; l+=l0; } val.push(v); wt.push(w); len.push(l); }
    const out=new Float64Array(y.length); let q=0; for (let b=0;b<val.length;b++) for (let t=0;t<len[b];t++) out[q++]=inc?val[b]:-val[b]; return out; }
  function unimodal(y){ const n=y.length; if (n<3) return Float64Array.from(y);
    const L=isoErrors(y,true), rev=Float64Array.from(y).reverse(), R=isoErrors(rev,true);   // discesa a destra = salita letta al contrario
    let best=-2, bv=Infinity; for (let p=-1;p<n;p++){ const e=(p>=0?L[p]:0)+(p<n-1?R[n-2-p]:0); if (best<-1.5 || e<bv-1e-15*Math.abs(bv)){ bv=e; best=p; } }
    const out=new Float64Array(n); if (best>=0) out.set(pava(Array.from(y.subarray?y.subarray(0,best+1):y.slice(0,best+1)),true),0);
    if (best<n-1){ const tail=Array.from(y.subarray?y.subarray(best+1):y.slice(best+1)).reverse(); const t=pava(tail,true).reverse(); out.set(t,best+1); }
    return out; }

  /* ---------------- stime iniziali ---------------- */
  /* SIMPLISMA (Windig e Guilment, Anal. Chem. 63, 1991, 1425). mode 'rows': le righe più pure di D (spettri puri, partenza per S);
     'cols': le colonne più pure (variabili pure, partenza per C). offset in % della media massima (di solito 1–10). */
  function simplisma(D, nc, opt){ opt=opt||{}; const mode=opt.mode||'rows', off=fin(opt.offset)?opt.offset:5;
    const {m,n,a}=D, V=mode==='rows'?m:n, Rn=mode==='rows'?n:m, at=mode==='rows'?((v,r)=>a[v*n+r]):((v,r)=>a[r*n+v]);
    const mu=new Float64Array(V), sd=new Float64Array(V);
    for (let v=0;v<V;v++){ let s=0; for (let r=0;r<Rn;r++) s+=at(v,r); const mm=s/Rn; let q=0; for (let r=0;r<Rn;r++){ const d=at(v,r)-mm; q+=d*d; } mu[v]=mm; sd[v]=Math.sqrt(q/Rn); }
    let mmax=0; for (let v=0;v<V;v++) mmax=Math.max(mmax, mu[v]); const alpha=off/100*mmax;
    const lam=Float64Array.from(mu,(x,v)=>Math.sqrt(x*x+(sd[v]+alpha)*(sd[v]+alpha))||1e-300);
    const purity=Float64Array.from(sd,(x,v)=>x/(mu[v]+alpha||1e-300));
    const corr=(u,v)=>{ let s=0; for (let r=0;r<Rn;r++) s+=at(u,r)*at(v,r); return s/(Rn*lam[u]*lam[v]); };
    const sel=[], Rsel=[], diag=Float64Array.from({length:V},(_,v)=>corr(v,v)), weights=[];
    for (let k=0;k<Math.min(nc,V);k++){
      const cross=sel.map(p=>Float64Array.from({length:V},(_,v)=>corr(v,p))); Rsel.length=0;
      let best=-1, bv=-Infinity; const pk=new Float64Array(V);
      for (let v=0;v<V;v++){ if (sel.includes(v)) continue; const kk=sel.length+1, M=new Float64Array(kk*kk);
        M[0]=diag[v]; for (let i=0;i<sel.length;i++){ M[i+1]=M[(i+1)*kk]=cross[i][v]; for (let j=0;j<sel.length;j++) M[(i+1)*kk+j+1]=corr(sel[i],sel[j]); }
        const w=det(M,kk); pk[v]=w*purity[v]; if (pk[v]>bv){ bv=pk[v]; best=v; } }
      if (best<0) break; sel.push(best); weights.push(Array.from(pk)); }
    return {idx:sel, purity:Array.from(purity), spectra:weights, mode}; }

  /* EFA (Maeder, Anal. Chem. 59, 1987, 527; Keller e Massart, Anal. Chim. Acta 246, 1991, 379): valori singolari delle sottomatrici
     che crescono dall'inizio (avanti) e dalla fine (indietro). Per non rifare una SVD a ogni riga si lavora sulle q componenti principali
     della matrice intera (D V_q): i valori del segnale restano esatti, quelli del rumore sono approssimati (DEDOTTO, va bene per la partenza). */
  function* efaGen(D, nc, opt){ opt=opt||{}; const {m}=D, sv=opt.svd||(yield* svdGen(D)), q=Math.min(sv.q, Math.max(nc+4, 12)), n=D.n;
    const Y=new Float64Array(m*q); for (let i=0;i<m;i++) for (let c=0;c<q;c++){ let s=0; for (let j=0;j<n;j++) s+=D.a[i*n+j]*sv.V.a[j*sv.q+c]; Y[i*q+c]=s; }
    const run=(order)=>{ const G=new Float64Array(q*q), out=[]; for (let k=0;k<nc;k++) out.push(new Float64Array(m));
      for (const i of order){ for (let a=0;a<q;a++){ const ya=Y[i*q+a]; if (ya) for (let b=0;b<q;b++) G[a*q+b]+=ya*Y[i*q+b]; }
        const ev=eigSym(G,q).values; for (let k=0;k<nc;k++) out[k][i]=Math.sqrt(Math.max(0,ev[k]||0)); }
      return out; };
    const fw=run(Array.from({length:m},(_,i)=>i)); yield {phase:'efa', frac:0.5};
    const bw=run(Array.from({length:m},(_,i)=>m-1-i)); yield {phase:'efa', frac:1};
    // finestra della componente k: compare come k-esima in avanti e sparisce come (nc−1−k)-esima all'indietro
    const noise=sv.s[nc]||0, C=mat(m,nc);
    for (let k=0;k<nc;k++) for (let i=0;i<m;i++){ const v=Math.min(fw[k][i], bw[nc-1-k][i])-noise; C.a[i*nc+k]=v>0?v:0; }
    for (let k=0;k<nc;k++){ let mx=0; for (let i=0;i<m;i++) mx=Math.max(mx,C.a[i*nc+k]); if (mx>0) for (let i=0;i<m;i++) C.a[i*nc+k]/=mx; else for (let i=0;i<m;i++) C.a[i*nc+k]=1/m; }
    return {forward:fw.map(a=>Array.from(a)), backward:bw.map(a=>Array.from(a)), C, noise}; }
  const efa=(D,nc,o)=>drain(efaGen(D,nc,o));

  /* ---------------- passi ALS ---------------- */
  // C dato S: per ogni spettro min ‖dᵢ − cᵢ S‖ con i vincoli; S dato C: per ogni canale min ‖dⱼ − C sⱼ‖
  function gram(M, rowsAreVectors){ // G = M Mᵀ se le righe sono i vettori (S: nc × n), altrimenti Mᵀ M (C: m × nc)
    const k=rowsAreVectors?M.m:M.n, L=rowsAreVectors?M.n:M.m, G=new Float64Array(k*k);
    if (rowsAreVectors){ for (let i=0;i<k;i++) for (let j=0;j<=i;j++){ let s=0; for (let t=0;t<L;t++) s+=M.a[i*L+t]*M.a[j*L+t]; G[i*k+j]=G[j*k+i]=s; } }
    else { for (let t=0;t<L;t++) for (let i=0;i<k;i++){ const v=M.a[t*k+i]; if (v) for (let j=0;j<=i;j++) G[i*k+j]+=v*M.a[t*k+j]; } for (let i=0;i<k;i++) for (let j=0;j<i;j++) G[j*k+i]=G[i*k+j]; }
    return G; }
  function solveRow(G, h, k, nonneg, closure, out){
    if (closure!=null) return closedLS(G,h,k,closure,nonneg,out);   // chiusura esatta (Lagrange), con o senza non negatività
    if (nonneg) return fnnls(G,h,k,out);
    const x=solveSPD(G,k,h); if (out){ out.set(x); return out; } return x; }
  // pyMCR (Camp, J. Res. NIST 124, 2019): regressione ordinaria e poi i negativi messi a zero (ConstraintNonneg). Solo per il confronto
  function solveRowClip(G, h, k, nonneg, out){ const x=solveSPD(G,k,h); if (nonneg) for (let i=0;i<k;i++) if (x[i]<0) x[i]=0; if (out){ out.set(x); return out; } return x; }

  function* stepC(D, S, o){ const {m,n}=D, k=S.m, G=gram(S,true), C=mat(m,k), h=new Float64Array(k), x=new Float64Array(k);
    for (let i=0;i<m;i++){ const ri=i*n; for (let c=0;c<k;c++){ let s=0; const sc=c*n; for (let j=0;j<n;j++) s+=D.a[ri+j]*S.a[sc+j]; h[c]=s; }
      if (o.pymcr) solveRowClip(G,h,k,o.nonnegC,x); else solveRow(G,h,k,o.nonnegC,o.closure,x);
      C.a.set(x, i*k); if ((i&7)===7) yield null; }
    return C; }
  function* stepS(D, C, o, known){ const {m,n}=D, k=C.n, G=gram(C,false), S=mat(k,n), h=new Float64Array(k);
    const free=[], fix=[]; for (let c=0;c<k;c++) (known && known[c] ? fix : free).push(c);
    const kf=free.length, Gf=new Float64Array(kf*kf); for (let i=0;i<kf;i++) for (let j=0;j<kf;j++) Gf[i*kf+j]=G[free[i]*k+free[j]];
    const hf=new Float64Array(kf), xf=new Float64Array(kf), CtD=new Float64Array(k*n);
    for (let i=0;i<m;i++){ const ri=i*n; for (let c=0;c<k;c++){ const v=C.a[i*k+c]; if (v){ const sc=c*n; for (let j=0;j<n;j++) CtD[sc+j]+=v*D.a[ri+j]; } } if ((i&7)===7) yield null; }
    for (let j=0;j<n;j++){ for (let c=0;c<k;c++) h[c]=CtD[c*n+j];
      for (const c of fix) S.a[c*n+j]=known[c][j];
      // spettri noti (uguaglianza): si tolgono dal sistema, restano esatti
      for (let i=0;i<kf;i++){ let v=h[free[i]]; for (const c of fix) v-=G[free[i]*k+c]*known[c][j]; hf[i]=v; }
      if (kf){ if (o.pymcr) solveRowClip(Gf,hf,kf,o.nonnegS,xf); else solveRow(Gf,hf,kf,o.nonnegS,null,xf); for (let i=0;i<kf;i++) S.a[free[i]*n+j]=xf[i]; } if ((j&127)===127) yield null; }
    return S; }

  function residual(D, C, S){ const {m,n}=D, k=C.n, E=mat(m,n); for (let i=0;i<m;i++) for (let j=0;j<n;j++){ let s=D.a[i*n+j]; for (let c=0;c<k;c++) s-=C.a[i*k+c]*S.a[c*n+j]; E.a[i*n+j]=s; } return E; }
  function ssr(D, C, S){ return sumSq(residual(D,C,S).a); }

  /* opzioni di MCR-ALS, ripulite: anche quelle lette da un progetto passano da qui */
  function options(o){ o=o||{}; const nc=Math.max(1, Math.min(10, Math.round(+o.nc)||2));
    const uni=Array.isArray(o.unimodal)?[...new Set(o.unimodal.filter(k=>Number.isInteger(k)&&k>=0&&k<nc))]:[];
    return {nc, init:['simplisma','efa','given'].includes(o.init)?o.init:'simplisma', initOn:o.initOn==='C'?'C':'S', offset:fin(o.offset)&&o.offset>=0&&o.offset<=100?o.offset:5,
      nonnegC:o.nonnegC!==false, nonnegS:o.nonnegS!==false, closure:fin(o.closure)&&o.closure>0?o.closure:null, unimodal:uni,
      norm:['norm','max','none'].includes(o.norm)?o.norm:'norm', maxIter:Math.max(1,Math.min(5000, Math.round(+o.maxIter)||200)),
      tol:fin(o.tol)&&o.tol>0&&o.tol<1?o.tol:1e-3, patience:Math.max(1,Math.min(50,Math.round(+o.patience)||3)), pymcr:!!o.pymcr}; }

  /* MCR-ALS (Tauler, CILS 30, 1995, 133; Jaumot, de Juan, Tauler, CILS 140, 2015, 1). init: {S} o {C} di partenza, oppure SIMPLISMA/EFA.
     known: {k: spettro} spettri noti (uguaglianza). Restituisce C, S, residui, mancanza di adattamento, varianza spiegata, storia, avvisi. */
  function* alsGen(D, opt){
    const o=options(opt), nc=o.nc, {m,n}=D, warn=[]; let sst=sumSq(D.a); if (!(sst>0)) throw new Error('matrice nulla');
    if (nc>Math.min(m,n)) throw new Error('troppe componenti per le dimensioni dei dati');
    const known={}; let nKnown=0; if (opt && opt.known) for (const [k,v] of Object.entries(opt.known)){ const c=+k; if (Number.isInteger(c) && c>=0 && c<nc && v && v.length===n){ known[c]=Float64Array.from(v); nKnown++; } }
    let S=null, C=null, sv=opt&&opt.svd, info={};
    if (opt && opt.S0){ S=opt.S0.a ? mat(opt.S0.m, opt.S0.n, Float64Array.from(opt.S0.a)) : fromRows(opt.S0); info.init='given-S'; }
    else if (opt && opt.C0){ C=opt.C0.a ? mat(opt.C0.m, opt.C0.n, Float64Array.from(opt.C0.a)) : fromRows(opt.C0); info.init='given-C'; }
    else if (o.init==='efa'){ if (!sv) sv=yield* svdGen(D); const E=yield* efaGen(D, nc, {svd:sv}); C=E.C; info.init='efa'; info.efa={forward:E.forward, backward:E.backward}; }
    else { const P=simplisma(D, nc, {mode:o.initOn==='C'?'cols':'rows', offset:o.offset}); info.init='simplisma'; info.pure=P.idx;
      if (P.idx.length<nc) throw new Error('SIMPLISMA non trova abbastanza variabili pure');
      if (o.initOn==='C'){ C=mat(m,nc); P.idx.forEach((j,k)=>{ for (let i=0;i<m;i++) C.a[i*nc+k]=D.a[i*n+j]; }); }
      else { S=mat(nc,n); P.idx.forEach((i,k)=>S.a.set(D.a.subarray(i*n,(i+1)*n), k*n)); } }
    if (S && (S.m!==nc || S.n!==n)) throw new Error('dimensioni di S non valide'); if (C && (C.m!==m || C.n!==nc)) throw new Error('dimensioni di C non valide');
    // spettro noto al posto k: la partenza che gli somiglia di più va in quel posto (l'ordine di SIMPLISMA è arbitrario)
    if (S && nKnown && info.init==='simplisma'){ const done=new Set(); for (const k of Object.keys(known).map(Number)){ let best=-2, bq=k;
        for (let q=0;q<nc;q++){ if (done.has(q) || (known[q] && q!==k)) continue; let ab=0, aa=0, bb=0; for (let j=0;j<n;j++){ const a=S.a[q*n+j], b=known[k][j]; ab+=a*b; aa+=a*a; bb+=b*b; } const r=ab/Math.sqrt(aa*bb||1e-300); if (r>best){ best=r; bq=q; } }
        if (bq!==k){ const tmp=S.a.slice(k*n,(k+1)*n); S.a.copyWithin(k*n, bq*n, (bq+1)*n); S.a.set(tmp, bq*n); } done.add(k); } }
    if (S) for (const k in known) S.a.set(known[k], (+k)*n);
    if (o.closure!=null && opt && opt.norm && opt.norm!=='none'){ warn.push({code:'closure-norm', it:'Con la chiusura la scala è già fissata dalle concentrazioni: la normalizzazione degli spettri non si applica.', en:'With closure the scale is already fixed by the concentrations: spectra normalisation is not applied.'}); }
    const normS=o.closure==null && o.norm!=='none';
    const hist=[]; let lofPrev=null, calm=0, it=0, converged=false, reason='maxIter';
    const lofOf=(CC,SS)=>100*Math.sqrt(ssr(D,CC,SS)/sst);
    const postC=CC=>{ for (const k of o.unimodal){ const v=col(CC,k), u=unimodal(v); for (let i=0;i<m;i++) CC.a[i*nc+k]=u[i]; }
      if (o.closure!=null && o.unimodal.length){ for (let i=0;i<m;i++){ let s=0; for (let k=0;k<nc;k++) s+=CC.a[i*nc+k]; if (s>0) for (let k=0;k<nc;k++) CC.a[i*nc+k]*=o.closure/s; } } };
    const postS=(SS,CC)=>{ if (!normS) return; for (let k=0;k<nc;k++){ if (known[k]) continue; let f=0; if (o.norm==='max'){ for (let j=0;j<n;j++) f=Math.max(f,Math.abs(SS.a[k*n+j])); } else { for (let j=0;j<n;j++) f+=SS.a[k*n+j]*SS.a[k*n+j]; f=Math.sqrt(f); }
      if (f>0){ for (let j=0;j<n;j++) SS.a[k*n+j]/=f; if (CC) for (let i=0;i<m;i++) CC.a[i*nc+k]*=f; } } };
    if (S && !C) postS(S,null);
    for (it=1; it<=o.maxIter; it++){
      if (S || it>1){ C=yield* stepC(D, S, o); postC(C); }
      S=yield* stepS(D, C, o, nKnown?known:null); postS(S, C);
      yield null; const lof=lofOf(C,S); hist.push(lof);
      if (!fin(lof)){ reason='nan'; break; }
      if (lofPrev!=null){ const rel=Math.abs(lofPrev-lof)/(lofPrev||1); if (rel<o.tol || lof<1e-10){ calm++; if (calm>=o.patience || lof<1e-10){ converged=true; reason=lof<1e-10?'exact':'tol'; break; } } else calm=0; }
      lofPrev=lof; yield {phase:'als', iter:it, lof, frac:it/o.maxIter};
    }
    if (it>o.maxIter) it=o.maxIter;
    yield null; const E=residual(D,C,S), sse=sumSq(E.a), lof=100*Math.sqrt(sse/sst), r2=100*(1-sse/sst);
    if (!sv) sv=yield* svdGen(D, Math.min(m,n));
    const lofP=lofPca(sv.s, nc, sst);
    if (!converged) warn.push({code:'not-converged', it:`Nessuna convergenza in ${o.maxIter} iterazioni: la mancanza di adattamento cambia ancora più dello ${(o.tol*100).toLocaleString('it')}% a ogni passo.`, en:`No convergence in ${o.maxIter} iterations: the lack of fit still changes by more than ${o.tol*100}% per step.`});
    if (lof>lofP*1.5+0.5) warn.push({code:'lof-high', it:`La mancanza di adattamento (${lof.toFixed(2)}%) è molto più alta di quella della PCA con lo stesso numero di componenti (${lofP.toFixed(2)}%): vincoli troppo stretti o partenza sfavorevole.`, en:`The lack of fit (${lof.toFixed(2)}%) is much higher than PCA with the same number of components (${lofP.toFixed(2)}%): constraints too strict or a poor start.`});
    // ambiguità rotazionale: senza zone selettive la soluzione non è unica; MCR-BANDS ne misura l'ampiezza
    warn.push({code:'rotation', it:'La soluzione MCR-ALS in generale non è unica (ambiguità rotazionale): altri profili, compatibili con gli stessi vincoli, descrivono i dati altrettanto bene. Usa «Intervalli MCR-BANDS» per vedere quanto.', en:'The MCR-ALS solution is in general not unique (rotational ambiguity): other profiles, compatible with the same constraints, describe the data equally well. Use «MCR-BANDS ranges» to see how much.'});
    yield null; const rmsRow=new Float64Array(m), rmsCol=new Float64Array(n); for (let i=0;i<m;i++){ let s=0; for (let j=0;j<n;j++){ const e=E.a[i*n+j]; s+=e*e; rmsCol[j]+=e*e; } rmsRow[i]=Math.sqrt(s/n); } for (let j=0;j<n;j++) rmsCol[j]=Math.sqrt(rmsCol[j]/m);
    return {version:VERSION, opt:o, C, S, E, lof, r2, expVar:r2, lofPca:lofP, sigma:Math.sqrt(sse/(m*n)), sse, sst, iter:it, converged, reason, history:hist, warnings:warn, info, singular:Array.from(sv.s), rmsRow, rmsCol, known:Object.keys(known).map(Number)};
  }
  const als=(D,o)=>drain(alsGen(D,o));

  /* ---------------- MCR-BANDS (Jaumot e Tauler, CILS 103, 2010, 96) ----------------
     Per ogni componente k la funzione di contributo f_k = ‖c_k s_kᵀ‖ / ‖C Sᵀ‖ si porta al minimo e al massimo sulle rotazioni
     C T, T⁻¹ S che rispettano gli stessi vincoli (non negatività, chiusura, spettri noti, unimodalità come penalità).
     Ottimizzatore locale (Nelder–Mead con penalità crescente, più partenze): la banda trovata è interna a quella vera (DEDOTTO). */
  function* bandsGen(res, opt){ opt=opt||{}; const C=res.C, S=res.S, o=res.opt, k=C.n, m=C.m, n=S.n, known=new Set(res.known||[]);
    if (k<2) return {k, f:[{fopt:1, fmin:1, fmax:1}], width:0, feasible:true};
    let tot=0; { const R=mat(m,n); for (let i=0;i<m;i++) for (let j=0;j<n;j++){ let s=0; for (let c=0;c<k;c++) s+=C.a[i*k+c]*S.a[c*n+j]; R.a[i*n+j]=s; } tot=Math.sqrt(sumSq(R.a)); }
    const cn=new Float64Array(m*k), sn=new Float64Array(k*n); let nC=Math.sqrt(sumSq(C.a))||1, nS=Math.sqrt(sumSq(S.a))||1;
    const closure=o.closure!=null, np=k*(k-1);
    const Tof=p=>{ const T=new Float64Array(k*k); let q=0; for (let i=0;i<k;i++){ let s=0; for (let j=0;j<k;j++) if (i!==j){ T[i*k+j]=p[q++]; s+=T[i*k+j]; } T[i*k+i]=closure?1-s:1; } return T; };
    let evals=0;
    const evalT=p=>{ evals++; const T=Tof(p), Ti=inverse(T,k); if (!Ti) return null;
      for (let i=0;i<m;i++) for (let c=0;c<k;c++){ let s=0; for (let q=0;q<k;q++) s+=C.a[i*k+q]*T[q*k+c]; cn[i*k+c]=s; }
      for (let c=0;c<k;c++) for (let j=0;j<n;j++){ let s=0; for (let q=0;q<k;q++) s+=Ti[c*k+q]*S.a[q*n+j]; sn[c*n+j]=s; }
      let pen=0; if (o.nonnegC) for (let i=0;i<m*k;i++) if (cn[i]<0) pen+=cn[i]*cn[i]/(nC*nC);
      if (o.nonnegS) for (let i=0;i<k*n;i++) if (sn[i]<0) pen+=sn[i]*sn[i]/(nS*nS);
      for (const c of known){ for (let j=0;j<n;j++){ const d=sn[c*n+j]-S.a[c*n+j]; pen+=d*d/(nS*nS); } }
      for (const c of o.unimodal){ const v=new Float64Array(m); for (let i=0;i<m;i++) v[i]=cn[i*k+c]; const u=unimodal(v); for (let i=0;i<m;i++){ const d=u[i]-v[i]; pen+=d*d/(nC*nC); } }
      const f=new Float64Array(k); for (let c=0;c<k;c++){ let a=0, b=0; for (let i=0;i<m;i++) a+=cn[i*k+c]*cn[i*k+c]; for (let j=0;j<n;j++) b+=sn[c*n+j]*sn[c*n+j]; f[c]=Math.sqrt(a*b)/(tot||1); }
      return {f, pen}; };
    const p0=new Float64Array(np); if (closure) p0.fill(0);
    const base=evalT(p0), fopt=Array.from(base.f), FTOL=opt.feasTol||1e-8;
    const out=[]; const maxEval=opt.maxEval||1500;
    for (let c=0;c<k;c++){ const r={fopt:fopt[c], fmin:fopt[c], fmax:fopt[c]};
      for (const sgn of [1,-1]){ // +1: minimo, −1: massimo
        let bestFeas=fopt[c];
        const starts=[p0]; for (let q=0;q<np;q++){ const s=Float64Array.from(p0); s[q]+=0.05; starts.push(s); const s2=Float64Array.from(p0); s2[q]-=0.05; starts.push(s2); }
        for (const st of starts.slice(0, 1+Math.min(2*np, 6))){
          let x=Float64Array.from(st);
          for (const mu of [1e2,1e4,1e6,1e8]){
            const F=p=>{ const e=evalT(p); if (!e) return Infinity; if (e.pen<=FTOL){ const v=e.f[c]; if (sgn>0 ? v<bestFeas : v>bestFeas) bestFeas=v; } return sgn*e.f[c]+mu*e.pen; };
            x=yield* nelderMead(F, x, {maxEval:Math.round(maxEval/4), step:0.1});
          }
        }
        if (sgn>0) r.fmin=Math.min(r.fmin,bestFeas); else r.fmax=Math.max(r.fmax,bestFeas);
      }
      out.push(r); yield {phase:'bands', frac:(c+1)/k}; }
    const width=Math.max(...out.map(r=>r.fmax-r.fmin));
    return {k, f:out, width, evals, local:true}; }
  function* nelderMead(F, x0, opt){ const n=x0.length, step=opt.step||0.1, maxEval=opt.maxEval||500; let ev=0;
    const P=[Float64Array.from(x0)]; for (let i=0;i<n;i++){ const p=Float64Array.from(x0); p[i]+=step*(Math.abs(p[i])>0.5?Math.abs(p[i]):1); P.push(p); }
    let V=P.map(p=>{ ev++; return F(p); });
    while (ev<maxEval){ const ord=V.map((v,i)=>i).sort((a,b)=>V[a]-V[b]); const Ps=ord.map(i=>P[i]), Vs=ord.map(i=>V[i]); for (let i=0;i<=n;i++){ P[i]=Ps[i]; V[i]=Vs[i]; }
      if (Math.abs(V[n]-V[0])<=1e-13*(Math.abs(V[0])+1e-13)) break;
      const cen=new Float64Array(n); for (let i=0;i<n;i++) for (let j=0;j<n;j++) cen[j]+=P[i][j]/n;
      const at=t=>Float64Array.from(cen,(c,j)=>c+t*(P[n][j]-c));
      const xr=at(-1), fr=F(xr); ev++;
      if (fr<V[0]){ const xe=at(-2), fe=F(xe); ev++; if (fe<fr){ P[n]=xe; V[n]=fe; } else { P[n]=xr; V[n]=fr; } }
      else if (fr<V[n-1]){ P[n]=xr; V[n]=fr; }
      else { const xc=fr<V[n]?at(-0.5):at(0.5), fc=F(xc); ev++;
        if (fc<Math.min(fr,V[n])){ P[n]=xc; V[n]=fc; }
        else { for (let i=1;i<=n;i++){ P[i]=Float64Array.from(P[i],(v,j)=>P[0][j]+0.5*(v-P[0][j])); V[i]=F(P[i]); ev++; } } }
      if ((ev&15)<4) yield null; }
    let b=0; for (let i=1;i<=n;i++) if (V[i]<V[b]) b=i; return P[b]; }
  const bands=(r,o)=>drain(bandsGen(r,o));

  /* ---------------- serie di spettri ---------------- */
  const QUANT={tempo:['tempo','time'], dose:['dose','dose'], temperatura:['temperatura','temperature'], altro:['valore','value']};
  const TUNIT={s:1, min:60, h:3600, ms:1e-3, d:86400};
  /* asse dal nome del file: «t=30s», «_120min», «10 h», «dose 5 Gy», «25C», «T-80 °C» … Il primo trovato, con l'unità; null se niente */
  function axisFromName(name){ const s=String(name||'').replace(/\.[A-Za-z0-9]{1,5}$/,''); let m;
    const num=x=>+String(x).replace(',','.');
    if ((m=/(?:^|[^A-Za-z0-9])(?:dose|d)[\s_=-]*(\d+(?:[.,]\d+)?)\s*(Gy|kGy|mGy|J\/cm2|mJ\/cm2|kJ\/m2)(?![A-Za-z])/i.exec(s))||(m=/(\d+(?:[.,]\d+)?)\s*(kGy|mGy|Gy|mJ\/cm2|J\/cm2)(?![A-Za-z])/.exec(s))) return {value:num(m[1]), quantity:'dose', unit:m[2]};
    if ((m=/(?:^|[^A-Za-z0-9])T[\s_=-]*(-?\d+(?:[.,]\d+)?)\s*(?:°\s*)?(C|K)(?![A-Za-z])/.exec(s))||(m=/(-?\d+(?:[.,]\d+)?)\s*(?:°\s*)(C|K)(?![A-Za-z])/.exec(s))||(m=/(?:^|[^A-Za-z0-9.,])(-?\d+(?:[.,]\d+)?)(degC|gradi|°C)(?![A-Za-z])/i.exec(s))) return {value:num(m[1]), quantity:'temperatura', unit:/^k$/i.test(m[2])?'K':'°C'};
    if ((m=/(?:^|[^A-Za-z0-9])(?:t|time|tempo)?[\s_=-]*(\d+(?:[.,]\d+)?)\s*(ms|s|sec|secs|seconds|secondi|min|mins|minuti|minutes|h|hr|hrs|ore|hours|d|days|giorni)(?![A-Za-z])/i.exec(s))){ const u=m[2].toLowerCase(), unit=/^ms$/.test(u)?'ms':/^(s|sec|secs|seconds|secondi)$/.test(u)?'s':/^min/.test(u)?'min':/^(h|hr|hrs|ore|hours)$/.test(u)?'h':'d'; return {value:num(m[1]), quantity:'tempo', unit}; }
    if ((m=/(?:^|[^A-Za-z0-9])t[\s_=-]*(\d+(?:[.,]\d+)?)(?![\d.,])/i.exec(s))) return {value:num(m[1]), quantity:'tempo', unit:null};
    if ((m=/(?:^|[_\s-])(\d+(?:[.,]\d+)?)$/.exec(s))) return {value:num(m[1]), quantity:null, unit:null, weak:true};   // solo un numero finale: da confermare
    return null; }
  /* asse dai metadati: data e ora di acquisizione (secondi dall'epoca) o un campo «Time»/«Temperature» esplicito */
  const MONTHS={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11,gen:0,mag:4,giu:5,lug:6,ago:7,set:8,ott:9,dic:11};
  function axisFromMeta(lines){ const L=(lines||[]).slice(0,200).map(String); let m;
    for (const l of L){
      if ((m=/(?:temperature|temperatura|sample\s*temp)[^:=\d-]*[:=]?\s*(-?\d+(?:[.,]\d+)?)\s*(°?\s*C|K)\b/i.exec(l))) return {value:+m[1].replace(',','.'), quantity:'temperatura', unit:/K/.test(m[2])?'K':'°C', from:l.trim().slice(0,80)};
      if ((m=/(?:elapsed|time\s*since|tempo\s*trascorso|delay)[^:=\d]*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(ms|s|min|h)\b/i.exec(l))) return {value:+m[1].replace(',','.'), quantity:'tempo', unit:m[2], from:l.trim().slice(0,80)}; }
    for (const l of L){ if (!/date|time|acqui|data|ora|created|timestamp|collection/i.test(l)) continue;
      if ((m=/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})[T\s,]+(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?/.exec(l))) return {stamp:Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0))/1000+(m[7]?+('0.'+m[7]):0), quantity:'tempo', unit:'s', from:l.trim().slice(0,80)};
      if ((m=/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})[T\s,]+(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?\s*(AM|PM)?/i.exec(l))){ let h=+m[4]; if (m[8]){ if (/pm/i.test(m[8]) && h<12) h+=12; if (/am/i.test(m[8]) && h===12) h=0; } return {stamp:Date.UTC(+m[3],+m[2]-1,+m[1],h,+m[5],+(m[6]||0))/1000+(m[7]?+('0.'+m[7]):0), quantity:'tempo', unit:'s', from:l.trim().slice(0,80), dmy:true}; }
      if ((m=/(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*[-\s](\d{4})[T\s,]+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(l)) && MONTHS[m[2].toLowerCase()]!=null) return {stamp:Date.UTC(+m[3],MONTHS[m[2].toLowerCase()],+m[1],+m[4],+m[5],+(m[6]||0))/1000, quantity:'tempo', unit:'s', from:l.trim().slice(0,80)};
      if ((m=/(?:^|[^\d:])(\d{1,2}):(\d{2}):(\d{2})(?:[.,](\d+))?(?![\d:])/.exec(l))) return {stamp:(+m[1])*3600+(+m[2])*60+(+m[3])+(m[4]?+('0.'+m[4]):0), quantity:'tempo', unit:'s', from:l.trim().slice(0,80), clockOnly:true}; }
    return null; }
  /* proposta dell'asse per un insieme di spettri {name, meta}: prima i metadati coerenti, poi il nome; l'utente conferma sempre */
  function proposeAxis(items){ const meta=items.map(it=>axisFromMeta(it.meta)), nm=items.map(it=>axisFromName(it.name));
    const allOk=a=>a.length && a.every(o=>o && (fin(o.value)||fin(o.stamp)));
    if (allOk(meta) && new Set(meta.map(o=>o.quantity)).size===1){ const q=meta[0].quantity;
      if (meta.every(o=>fin(o.stamp))){ const t0=Math.min(...meta.map(o=>o.stamp)); let v=meta.map(o=>o.stamp-t0); const span=Math.max(...v);
        const unit=span>=3*86400?'h':span>=3*3600?'min':span>=180?'s':'s'; const k=TUNIT[unit]||1; if (meta.some(o=>o.clockOnly) && v.some(x=>x<0)) v=v.map(x=>x<0?x+86400:x);
        return {source:'meta', quantity:'tempo', unit, values:v.map(x=>x/k), from:meta.map(o=>o.from), note:meta.some(o=>o.clockOnly)?'clock':null}; }
      if (meta.every(o=>fin(o.value)) && new Set(meta.map(o=>o.unit)).size===1) return {source:'meta', quantity:q, unit:meta[0].unit, values:meta.map(o=>o.value), from:meta.map(o=>o.from)}; }
    if (allOk(nm)){ const qs=new Set(nm.map(o=>o.quantity)), us=new Set(nm.map(o=>o.unit));
      if (qs.size===1 && us.size===1) return {source:'name', quantity:nm[0].quantity||'tempo', unit:nm[0].unit, values:nm.map(o=>o.value), weak:nm.some(o=>o.weak||!o.unit)};
      // stessa grandezza, unità di tempo diverse (30 s, 2 min): si porta tutto alla più grande usata
      if (qs.size===1 && nm[0].quantity==='tempo' && nm.every(o=>TUNIT[o.unit])){ const u=[...us].sort((a,b)=>TUNIT[b]-TUNIT[a])[0]; return {source:'name', quantity:'tempo', unit:u, values:nm.map(o=>o.value*TUNIT[o.unit]/TUNIT[u]), mixed:true}; } }
    return {source:'manual', quantity:'tempo', unit:'s', values:items.map(()=>null)}; }

  /* costruzione della matrice: spettri {xs, ys} su un asse comune (quello del primo spettro nell'intervallo comune), interpolazione lineare.
     t: valori dell'asse (uno per spettro, finiti e tutti diversi); le righe si ordinano per t. */
  function buildSeries(spectra, t, opt){ opt=opt||{}; const k=spectra.length; if (k<3) throw new Error('servono almeno 3 spettri');
    if (!Array.isArray(t) || t.length!==k || !t.every(fin)) throw new Error('valori dell\'asse mancanti');
    if (new Set(t).size!==k) throw new Error('valori dell\'asse ripetuti');
    const asc=xs=>xs[0]<=xs[xs.length-1];
    let lo=-Infinity, hi=Infinity; for (const s of spectra){ const a=s.xs[0], b=s.xs[s.xs.length-1]; lo=Math.max(lo,Math.min(a,b)); hi=Math.min(hi,Math.max(a,b)); }
    if (fin(opt.xmin)) lo=Math.max(lo,opt.xmin); if (fin(opt.xmax)) hi=Math.min(hi,opt.xmax);
    if (!(hi>lo)) throw new Error('gli spettri non hanno un intervallo comune');
    const ref=spectra[0].xs, grid=[]; for (let i=0;i<ref.length;i++){ const x=ref[i]; if (x>=lo-1e-12*Math.abs(lo) && x<=hi+1e-12*Math.abs(hi)) grid.push(x); }
    let X=grid; const maxN=opt.maxN||4000; if (X.length>maxN){ const st=X.length/maxN; X=Array.from({length:maxN},(_,i)=>grid[Math.floor(i*st)]); }
    if (X.length<5) throw new Error('troppo pochi punti nell\'intervallo comune');
    const ord=t.map((v,i)=>i).sort((a,b)=>t[a]-t[b]), n=X.length, data=new Float64Array(k*n);
    let same=true;
    ord.forEach((si,r)=>{ const s=spectra[si], xs=s.xs, ys=s.ys, up=asc(xs), N=xs.length;
      if (xs.length!==ref.length || xs.some((v,i)=>v!==ref[i])) same=false;
      let q=0; for (let j=0;j<n;j++){ const x=X[j];
        if (up){ while (q<N-2 && xs[q+1]<x) q++; } else { q=0; let lo2=0, hi2=N-1; while (hi2-lo2>1){ const mid=(lo2+hi2)>>1; if (xs[mid]>=x) lo2=mid; else hi2=mid; } q=lo2; }
        const x0=xs[q], x1=xs[q+1], y0=ys[q], y1=ys[q+1], w=x1===x0?0:(x-x0)/(x1-x0); data[r*n+j]=y0+(y1-y0)*Math.min(1,Math.max(0,w)); } });
    if (!data.every(fin)) throw new Error('valori non numerici negli spettri');
    return {kind:opt.kind||'generic', t:{values:ord.map(i=>t[i]), quantity:opt.quantity||'tempo', unit:opt.tunit==null?'':String(opt.tunit)}, x:{values:Float64Array.from(X), quantity:opt.xq||'x', unit:opt.xunit||''}, y:{quantity:opt.yq||'', unit:opt.yunit||''},
      shape:[k,n], dtype:'f64', data, order:ord, resampled:!same, meta:{version:VERSION}}; }
  function seriesMatrix(se){ const [m,n]=se.shape; return mat(m,n, se.data instanceof Float64Array ? se.data : Float64Array.from(se.data)); }
  // controlli di una serie letta da un progetto: dimensioni e numeri finiti
  function validSeries(se){ try{ if (!se || !Array.isArray(se.shape) || se.shape.length!==2) return false; const [m,n]=se.shape; const tv=se.t&&se.t.values, xv=se.x&&se.x.values;
      return Number.isInteger(m) && Number.isInteger(n) && m>=2 && n>=2 && tv && xv && tv.length===m && xv.length===n && se.data && se.data.length===m*n && Array.prototype.every.call(tv,fin) && Array.prototype.every.call(xv,fin); }catch(e){ return false; } }

  /* impostazioni salvate nel progetto (memory.an.mcr): solo valori ammessi, dimensioni limitate */
  function cleanOpt(v){ if (!v || typeof v!=='object' || Array.isArray(v)) return null; const o={};
    if (Number.isInteger(v.nc) && v.nc>=1 && v.nc<=10) o.nc=v.nc;
    if (['simplisma','efa'].includes(v.init)) o.init=v.init; if (['S','C'].includes(v.initOn)) o.initOn=v.initOn;
    for (const k of ['nonnegC','nonnegS']) if (typeof v[k]==='boolean') o[k]=v[k];
    if (fin(v.closure) && v.closure>0 && v.closure<1e12) o.closure=v.closure;
    if (fin(v.offset) && v.offset>=0 && v.offset<=100) o.offset=v.offset;
    if (Array.isArray(v.unimodal)) { const u=v.unimodal.filter(k=>Number.isInteger(k)&&k>=0&&k<10).slice(0,10); if (u.length) o.unimodal=[...new Set(u)]; }
    if (['norm','max','none'].includes(v.norm)) o.norm=v.norm;
    if (Number.isInteger(v.maxIter) && v.maxIter>=1 && v.maxIter<=5000) o.maxIter=v.maxIter;
    if (fin(v.tol) && v.tol>0 && v.tol<1) o.tol=v.tol;
    if (v.known && typeof v.known==='object' && !Array.isArray(v.known)){ const kn={}; for (const [k,p] of Object.entries(v.known)) if (/^\d$/.test(k) && typeof p==='string' && p.length<=400) kn[k]=p; if (Object.keys(kn).length) o.known=kn; }
    if (fin(v.xmin)) o.xmin=v.xmin; if (fin(v.xmax)) o.xmax=v.xmax;
    return Object.keys(o).length?o:null; }

  return {VERSION, mat, fromRows, toRows, transpose, col, row, drain, sumSq, chol, cholSolve, solveSPD, inverse, det,
    eigSym, eigSymGen, svd, svdGen, suggestRank, lofPca, fnnls, nnlsCols, closedLS, unimodal, pava, simplisma, efa, efaGen,
    stepC, stepS, residual, ssr, options, als, alsGen, bands, bandsGen, nelderMead,
    axisFromName, axisFromMeta, proposeAxis, buildSeries, seriesMatrix, validSeries, cleanOpt, QUANT, TUNIT};
});
