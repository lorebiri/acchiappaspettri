// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Fit globale delle cinetiche: parte pura, senza DOM (SPEC-AVANZATE §3). Usa McrCore (app/mcr-core.js) per SVD e NNLS.
   D (m tempi × n canali) = C(k) Sᵀ + E. Per k date gli spettri associati alle specie (SAS) si ricavano linearmente: proiezione variabile
   (Golub e Pereyra, SIAM J. Numer. Anal. 10, 1973, 413; van Stokkum et al., BBA 1657, 2004, 82). Le k si stimano in log k con
   Levenberg–Marquardt; i dati si comprimono senza perdita con la SVD (D V = U Σ, stessa somma dei quadrati per ogni proiezione).
   Concentrazioni relative: [A]₀ = 1. Deterministico. */
(function(root, factory){
  if (typeof module==='object' && module.exports) module.exports=factory(require('./mcr-core.js'));
  else root.KinCore=factory(root.McrCore);
})(typeof globalThis!=='undefined' ? globalThis : this, function(M){
  'use strict';
  const VERSION='kin-1';
  const fin=v=>typeof v==='number' && Number.isFinite(v);
  const drain=M.drain;

  /* ---------------- Levenberg–Marquardt generico (con lo Jacobiano analitico se c'è) ----------------
     res(p) → Float64Array dei residui; jac(p) → righe del Jacobiano (facoltativo: altrimenti differenze centrali). */
  function* lmGen(res, p0, opt){ opt=opt||{}; const np=p0.length, maxIter=opt.maxIter||1000;
    let p=Float64Array.from(p0), r=res(p); if (!r) throw new Error('residui non calcolabili nel punto di partenza');
    let f=M.sumSq(r), nu=2, lam=null, it=0, conv=false, why='maxIter', nev=1; const dsc=new Float64Array(np);   // scala di Moré: il massimo raggiunto da ogni diagonale
    // differenze centrali; generatore: con gli spettri NNLS ogni valutazione costa qualche millisecondo, si cede il passo dopo ognuna
    function* jac(p){ if (opt.jac){ const rows=opt.jac(p), N=rows.length, J=new Float64Array(N*np); for (let i=0;i<N;i++) for (let k=0;k<np;k++) J[i*np+k]=rows[i][k]; return J; }
      const N=r.length, J=new Float64Array(N*np);
      for (let k=0;k<np;k++){ const h=(opt.h||1e-6)*Math.max(Math.abs(p[k]), opt.hmin||1e-3), a=Float64Array.from(p), b=Float64Array.from(p); a[k]+=h; b[k]-=h; const ra=res(a); if (opt.slow) yield null; const rb=res(b); nev+=2; if (opt.slow) yield null;
        if (!ra || !rb) return null; for (let i=0;i<N;i++) J[i*np+k]=(ra[i]-rb[i])/(2*h); } return J; }
    let J=yield* jac(p);
    for (it=1; it<=maxIter; it++){
      if (!J) { why='jac'; break; }
      const N=r.length, A=new Float64Array(np*np), g=new Float64Array(np);
      for (let i=0;i<N;i++){ const ri=r[i], o=i*np; for (let a=0;a<np;a++){ const ja=J[o+a]; if (!ja) continue; g[a]+=ja*ri; for (let b=0;b<=a;b++) A[a*np+b]+=ja*J[o+b]; } }
      for (let a=0;a<np;a++) for (let b=0;b<a;b++) A[b*np+a]=A[a*np+b];
      let dmax=0; for (let a=0;a<np;a++) dmax=Math.max(dmax, A[a*np+a]);
      for (let a=0;a<np;a++) dsc[a]=Math.max(dsc[a], A[a*np+a], 1e-12*(dmax||1));
      if (lam==null) lam=1e-3;
      let gmax=0; for (let a=0;a<np;a++) gmax=Math.max(gmax, Math.abs(g[a])*Math.sqrt(1/(A[a*np+a]||1e-300)));
      if (gmax<=1e-15*Math.sqrt(f||1e-300) || f===0){ conv=true; why='grad'; break; }
      let accepted=false;
      for (let tries=0; tries<60; tries++){
        const B=Float64Array.from(A); for (let a=0;a<np;a++) B[a*np+a]+=lam*dsc[a];
        const ng=Float64Array.from(g,v=>-v), d=M.solveSPD(B,np,ng), pn=Float64Array.from(p,(v,i)=>v+d[i]);
        const rn=res(pn); nev++; if (opt.slow) yield null;
        const fn=rn?M.sumSq(rn):Infinity;
        if (fn<f){ let pred=0; for (let a=0;a<np;a++) pred+=d[a]*(lam*dsc[a]*d[a]-g[a]); const rho=(f-fn)/(pred||1e-300);
          lam*=Math.max(1/3, 1-Math.pow(2*rho-1,3)); nu=2;
          let small=true; for (let a=0;a<np;a++) if (Math.abs(d[a])>1e-12*(Math.abs(p[a])+1e-12)) small=false;
          const df=(f-fn)/(f||1e-300); p=pn; r=rn; f=fn; accepted=true;
          if (small || df<1e-16){ conv=true; why=small?'step':'ssr'; }
          break; }
        lam*=nu; nu*=2; if (!fin(lam) || lam>1e300) break;
      }
      if (!accepted){ conv=true; why='nostep'; break; }
      yield {phase:'lm', iter:it, ssr:f};
      J=yield* jac(p);
      if (conv) break;
    }
    return {p, r, ssr:f, J, iter:it, converged:conv, reason:why, nev};
  }
  const lm=(res,p0,o)=>drain(lmGen(res,p0,o));
  // covarianza dei parametri: s² (JᵀJ)⁻¹ con s² = SSR / gradi di libertà
  function covariance(J, N, np, s2){ const A=new Float64Array(np*np); for (let i=0;i<N;i++) for (let a=0;a<np;a++){ const ja=J[i*np+a]; if (ja) for (let b=0;b<np;b++) A[a*np+b]+=ja*J[i*np+b]; }
    const Ai=M.inverse(A,np); if (!Ai) return null; return Float64Array.from(Ai, v=>v*s2); }
  // curva y = f(x, p) con LM: errori standard e somma dei quadrati, come nei NIST StRD
  /* pianoro: un parametro che cresce (o cala) senza limite rende nulla la sua colonna dello Jacobiano; la somma dei quadrati non cambia più
     e LM si ferma lì (NIST BoxBOD dalla partenza 1: b₂ → ∞, modello costante). Colonna relativa (scalata sul valore) sotto 1e-7 della più grande. */
  function plateauCols(J, N, np, p, logScale){ const nrm=new Float64Array(np); for (let i=0;i<N;i++) for (let k=0;k<np;k++){ const v=J[i*np+k]; nrm[k]+=v*v; }
    for (let k=0;k<np;k++) nrm[k]=Math.sqrt(nrm[k])*(logScale?1:Math.max(Math.abs(p[k]),1e-300)); const mx=Math.max(...nrm);
    const out=[]; for (let k=0;k<np;k++) if (!(nrm[k]>1e-7*mx)) out.push(k); return mx>0?out:[]; }
  // curva y = f(x, p) con LM: errori standard e somma dei quadrati, come nei NIST StRD.
  // Se si finisce su un pianoro si riparte con quel parametro al valore iniziale (×1, ÷10, ×10) e gli altri al valore trovato; se resta, si dice
  function fitCurve(f, x, y, p0, opt){ opt=opt||{}; const n=x.length, np=p0.length;
    const res=p=>{ const r=new Float64Array(n); for (let i=0;i<n;i++){ const v=f(x[i],p); if (!fin(v)) return null; r[i]=y[i]-v; } return r; };
    const jac=opt.grad ? (p=>x.map(xi=>opt.grad(xi,p).map(v=>-v))) : null;
    const run=st=>lm(res, st, Object.assign({}, opt, {jac}));
    let R=run(p0), flat=plateauCols(R.J, n, np, R.p), restarts=0;
    if (flat.length && opt.restart!==false){ for (const k of flat) for (const fac of [1,0.1,10]){ const st=Float64Array.from(R.p); st[k]=p0[k]*fac; if (!(p0[k]*fac)) continue; let Q; try{ Q=run(st); }catch(e){ continue; } restarts++;
        const fq=plateauCols(Q.J, n, np, Q.p); if (Q.ssr<R.ssr*(1-1e-12) || (fq.length<flat.length && Q.ssr<=R.ssr*(1+1e-12))){ R=Q; flat=fq; } if (!flat.length) break; } }
    const dof=n-np, s2=R.ssr/dof, cov=flat.length?null:covariance(R.J, n, np, s2);
    return {p:Array.from(R.p), se:cov?Array.from({length:np},(_,i)=>Math.sqrt(cov[i*np+i])):null, ssr:R.ssr, sres:Math.sqrt(s2), dof, iter:R.iter, converged:R.converged&&!flat.length, reason:flat.length?'plateau':R.reason, plateau:flat, restarts}; }

  /* ---------------- modelli: profili di concentrazione relativi, [A]₀ = 1 ----------------
     tt = max(0, t − t₀): prima di t₀ la reazione non è cominciata. */
  const ex=x=>Math.exp(-x);
  // (1 − e^(−x))/x stabile anche per x → 0
  const phi=x=>Math.abs(x)<1e-8 ? 1-x/2 : -Math.expm1(-x)/x;
  const MODELS={
    ord0:{species:['A','P'], params:['k'], exp:null, prof:(t,k)=>{ const a=Math.max(0,1-k[0]*t); return [a,1-a]; },
      note:['Ordine 0: [A] = [A]₀ − k t fino a zero; k\' = k/[A]₀ (1/tempo).','Zero order: [A] = [A]₀ − k t down to zero; k\' = k/[A]₀ (1/time).']},
    ord1:{species:['A','B'], params:['k'], exp:[1,1], prof:(t,k)=>{ const a=ex(k[0]*t); return [a,1-a]; },
      note:['Primo ordine A → B: [A] = [A]₀ e^(−k t).','First order A → B: [A] = [A]₀ e^(−k t).']},
    ord2:{species:['A','P'], params:['k'], exp:null, prof:(t,k)=>{ const a=1/(1+k[0]*t); return [a,1-a]; },
      note:['Secondo ordine (2A → P, oppure A + B → P con [A]₀ = [B]₀), con −d[A]/dt = k[A]²: si stima k\' = k[A]₀; con [A]₀ si ricava k.','Second order (2A → P, or A + B → P with [A]₀ = [B]₀), with −d[A]/dt = k[A]²: the fit gives k\' = k[A]₀; with [A]₀ it gives k.']},
    consec:{species:['A','B','C'], params:['k1','k2'], exp:[2,1], prof:(t,k)=>{ const a=ex(k[0]*t), d=k[1]-k[0], b=k[0]*t*ex(k[0]*t)*phi(d*t); return [a,b,Math.max(-1,1-a-b)]; },
      note:['Consecutive A → B → C (Bateman); con k₁ = k₂ si usa il limite [B] = k t e^(−k t).','Consecutive A → B → C (Bateman); for k₁ = k₂ the limit [B] = k t e^(−k t) is used.']},
    rev:{species:['A','B'], params:['kobs'], exp:[1,1], prof:(t,k,o)=>{ const K=o&&fin(o.K)&&o.K>0?o.K:null; const e=ex(k[0]*t); if (K==null) return [1, e]; const kf=k[0]*K/(1+K), kb=k[0]/(1+K), a=(kb+kf*e)/k[0]; return [a,1-a]; },
      note:['Equilibrio A ⇌ B: dalla forma si ricava solo k_obs = k_f + k_b. Con la costante di equilibrio K = k_f/k_b (scritta dall\'utente) si separano k_f e k_b e si calcolano i SAS.','Equilibrium A ⇌ B: the shape only gives k_obs = k_f + k_b. With the equilibrium constant K = k_f/k_b (entered by the user) k_f and k_b are separated and the SAS computed.']},
    par:{species:null, params:null, exp:'par', prof:(t,k,o)=>{ const out=k.map(v=>ex(v*t)); if (o&&o.offset) out.push(1); return out; },
      note:['Decadimenti paralleli e indipendenti: somma di esponenziali, con gli spettri associati ai decadimenti (DAS).','Parallel independent decays: sum of exponentials, with decay-associated spectra (DAS).']}
  };
  function modelInfo(id, o){ const md=MODELS[id]; if (!md) throw new Error('modello sconosciuto: '+id); o=o||{};
    if (id==='par'){ const nE=Math.max(1,Math.min(5,Math.round(+o.nExp)||1)); const sp=Array.from({length:nE},(_,i)=>'τ'+(i+1)); if (o.offset) sp.push('∞');
      return {id, species:sp, params:Array.from({length:nE},(_,i)=>'k'+(i+1)), exp:[nE, o.offset?1:0], das:true}; }
    if (id==='rev' && !(fin(o.K)&&o.K>0)) return {id, species:['∞','τ1'], params:md.params, exp:md.exp, das:true, noK:true};
    return {id, species:md.species, params:md.params, exp:md.exp}; }

  /* ---------------- algebra della proiezione variabile ----------------
     Q: base ortonormale delle colonne di C (Gram–Schmidt modificato con riortogonalizzazione); colonne quasi dipendenti si scartano. */
  function qr(C, m, ns){ const Q=[], keep=[]; let cmax=0; const cols=[]; for (let c=0;c<ns;c++){ const v=new Float64Array(m); for (let i=0;i<m;i++) v[i]=C[i*ns+c]; cols.push(v); cmax=Math.max(cmax, Math.sqrt(M.sumSq(v))); }
    for (let c=0;c<ns;c++){ const v=Float64Array.from(cols[c]); const n0=Math.sqrt(M.sumSq(v));
      for (let pass=0;pass<2;pass++) for (const q of Q){ let d=0; for (let i=0;i<m;i++) d+=q[i]*v[i]; for (let i=0;i<m;i++) v[i]-=d*q[i]; }
      const nv=Math.sqrt(M.sumSq(v)); if (nv>1e-10*Math.max(n0, cmax*1e-3) && nv>0){ for (let i=0;i<m;i++) v[i]/=nv; Q.push(v); keep.push(c); } }
    return {Q, keep}; }
  function projResid(Q, Y, m, q){ const R=Float64Array.from(Y); for (const u of Q){ for (let c=0;c<q;c++){ let d=0; for (let i=0;i<m;i++) d+=u[i]*Y[i*q+c]; for (let i=0;i<m;i++) R[i*q+c]-=d*u[i]; } } return R; }

  function profiles(md, info, t, k, t0, o){ const m=t.length, ns=info.species.length, C=new Float64Array(m*ns);
    for (let i=0;i<m;i++){ const tt=Math.max(0, t[i]-(t0||0)), pr=md.prof(tt, k, o); for (let c=0;c<ns;c++) C[i*ns+c]=pr[c]; } return C; }

  /* spettri lineari per C data: minimi quadrati (o NNLS per canale) sul D intero */
  function spectraFor(D, C, ns, nonneg){ const {m,n,a}=D, G=new Float64Array(ns*ns), S=new Float64Array(ns*n), h=new Float64Array(ns);
    for (let i=0;i<m;i++) for (let p=0;p<ns;p++){ const v=C[i*ns+p]; for (let q=0;q<ns;q++) G[p*ns+q]+=v*C[i*ns+q]; }
    // C quasi singolare (k₁ ≈ k₂, specie collineari): Cholesky regolarizzato, l'avviso arriva dalle correlazioni
    const CtD=new Float64Array(ns*n); for (let i=0;i<m;i++) for (let p=0;p<ns;p++){ const v=C[i*ns+p]; if (v){ const o=p*n, ro=i*n; for (let j=0;j<n;j++) CtD[o+j]+=v*a[ro+j]; } }
    const L=M.chol(G,ns), x=new Float64Array(ns);
    for (let j=0;j<n;j++){ for (let p=0;p<ns;p++) h[p]=CtD[p*n+j]; const s=nonneg?M.fnnls(G,h,ns,x):M.cholSolve(L,ns,h); for (let p=0;p<ns;p++) S[p*n+j]=s[p]; }
    return S; }

  function options(o){ o=o||{}; const id=MODELS[o.model]?o.model:'ord1';
    return {model:id, nExp:Math.max(1,Math.min(5,Math.round(+o.nExp)||1)), offset:id==='par'&&!!o.offset, t0fit:!!o.t0fit, t0:fin(o.t0)?o.t0:0, K:fin(o.K)&&o.K>0?o.K:null, A0:fin(o.A0)&&o.A0>0?o.A0:null,
      nonnegS:!!o.nonnegS, rank:Number.isInteger(o.rank)&&o.rank>0?o.rank:null, k0:Array.isArray(o.k0)?o.k0.filter(v=>fin(v)&&v>0):null, maxIter:Math.max(5,Math.min(2000,Math.round(+o.maxIter)||300))}; }

  /* ---------------- fit globale ----------------
     se: {t:{values}, x:{values}, shape:[m,n], data}; restituisce k ± errore standard, correlazioni, C, SAS (o DAS), residui, AIC, BIC, avvisi. */
  function* fitGen(se, opt){
    const o=options(opt), md=MODELS[o.model], info=modelInfo(o.model, o), D=M.seriesMatrix(se), {m,n}=D, t=Array.from(se.t.values), ns=info.species.length, nk=info.params.length;
    if (m<nk+ns+2) throw new Error('troppo pochi tempi per questo modello');
    if (!t.every(fin)) throw new Error('tempi non validi');
    const warn=[], W=(code,it,en)=>warn.push({code,it,en});
    // compressione senza perdita sul lato dei canali (o troncata al rango scelto); con NNLS degli spettri si lavora sul D intero
    let Y, q, sv=null;
    if (o.nonnegS){ Y=D.a; q=n; }
    else if (n>m || o.rank){ sv=yield* M.svdGen(D); q=o.rank?Math.min(o.rank, sv.q):sv.q; Y=new Float64Array(m*q); for (let i=0;i<m;i++) for (let c=0;c<q;c++) Y[i*q+c]=sv.U.a[i*sv.q+c]*sv.s[c]; }
    else { Y=D.a; q=n; }
    const useT0=o.t0fit, np=nk+(useT0?1:0);
    const unpack=p=>({k:Array.from({length:nk},(_,i)=>Math.exp(p[i])), t0:useT0?p[nk]:o.t0});
    const residFor=p=>{ const u=unpack(p); if (!u.k.every(v=>fin(v)&&v>0&&v<1e300)) return null; const C=profiles(md, info, t, u.k, u.t0, o);
      if (!C.every(fin)) return null;
      if (o.nonnegS){ const S=spectraFor(D, C, ns, true), R=new Float64Array(m*n); for (let i=0;i<m;i++) for (let j=0;j<n;j++){ let s=D.a[i*n+j]; for (let c=0;c<ns;c++) s-=C[i*ns+c]*S[c*n+j]; R[i*n+j]=s; } return R; }
      const {Q}=qr(C, m, ns); return projResid(Q, Y, m, q); };
    const ssrOf=p=>{ const r=residFor(p); return r?M.sumSq(r):Infinity; };
    // partenza: k dell'utente, altrimenti una griglia in log k sull'intervallo dei tempi
    const tpos=t.map(v=>v-(o.t0||0)).filter(v=>v>0), tmax=Math.max(...t)-Math.min(0,...t)||1, tmin=tpos.length?Math.min(...tpos):tmax/m;
    const lo=Math.log(0.05/tmax), hi=Math.log(20/Math.max(tmin, tmax/(10*m)));
    let p0=null;
    if (o.k0 && o.k0.length>=nk) p0=Float64Array.from(o.k0.slice(0,nk).map(Math.log).concat(useT0?[o.t0]:[]));
    else { const G=nk===1?28:nk===2?14:8, grid=Array.from({length:G},(_,i)=>lo+(hi-lo)*i/(G-1)); let best=Infinity;
      const tryP=ks=>{ const p=Float64Array.from(ks.concat(useT0?[o.t0]:[])), f=ssrOf(p); if (f<best){ best=f; p0=p; } }, slow=o.nonnegS;
      if (nk===1){ for (let i=0;i<G;i++){ tryP([grid[i]]); if (slow || (i&7)===7) yield {phase:'grid', frac:i/G}; } }
      else if (nk===2){ for (let i=0;i<G;i++){ for (let j=0;j<G;j++){ if (o.model==='consec' ? i!==j : j<i) tryP([grid[i],grid[j]]); if (slow) yield null; } yield {phase:'grid', frac:i/G}; } }
      else { // più esponenziali: combinazioni ordinate, distanziate
        const combos=[]; const rec=(start, acc)=>{ if (acc.length===nk){ combos.push(acc.slice()); return; } for (let i=start;i<G;i++){ acc.push(grid[i]); rec(i+1, acc); acc.pop(); } }; rec(0, []);
        for (let c=0;c<combos.length;c++){ tryP(combos[c].slice().reverse()); if (slow || (c&15)===15) yield {phase:'grid', frac:c/combos.length}; } }
      if (!p0) throw new Error('nessuna partenza valida'); }
    const R=yield* lmGen(residFor, p0, {maxIter:o.maxIter, h:1e-6, hmin:1e-2, slow:true});
    yield {phase:'final', frac:0};
    const u=unpack(R.p), C=profiles(md, info, t, u.k, u.t0, o);
    // spettri e residui sul D intero
    const S=spectraFor(D, C, ns, o.nonnegS), E=new Float64Array(m*n); let sse=0;
    yield null;
    for (let i=0;i<m;i++) for (let j=0;j<n;j++){ let s=D.a[i*n+j]; for (let c=0;c<ns;c++) s-=C[i*ns+c]*S[c*n+j]; E[i*n+j]=s; sse+=s*s; }
    yield null;
    const rankC=qr(C,m,ns).keep.length, N=m*n, P=np+rankC*n, dof=Math.max(1, N-P), s2=sse/dof;
    const NJ=R.r.length, flat=plateauCols(R.J, NJ, np, R.p, true), cov=flat.length?null:covariance(R.J, NJ, np, s2); yield null;
    const se_=cov?Array.from({length:np},(_,i)=>Math.sqrt(Math.max(0,cov[i*np+i]))):null;
    const corr=cov?Array.from({length:np},(_,i)=>Array.from({length:np},(_,j)=>cov[i*np+j]/Math.sqrt(cov[i*np+i]*cov[j*np+j]))):null;
    const params=info.params.map((nm,i)=>{ const k=u.k[i], sl=se_?se_[i]:NaN; return {name:nm, value:k, se:k*sl, seLog:sl, lo95:k*Math.exp(-1.96*sl), hi95:k*Math.exp(1.96*sl), tau:1/k}; });
    if (useT0) params.push({name:'t0', value:u.t0, se:se_?se_[nk]:NaN, lo95:u.t0-1.96*(se_?se_[nk]:NaN), hi95:u.t0+1.96*(se_?se_[nk]:NaN)});
    flat.forEach(i=>{ if (params[i]) params[i].undetermined=true; });
    const derived=[];
    if (o.model==='rev' && o.K){ const kf=u.k[0]*o.K/(1+o.K), kb=u.k[0]/(1+o.K), sl=se_?se_[0]:NaN; derived.push({name:'kf', value:kf, se:kf*sl}, {name:'kb', value:kb, se:kb*sl}); }
    if ((o.model==='ord2'||o.model==='ord0') && o.A0){ const f=o.model==='ord2'?1/o.A0:o.A0; derived.push({name:'k', value:u.k[0]*f, se:params[0].se*f, unit:o.model==='ord2'?'1/(conc·tempo)':'conc/tempo'}); }
    // avvisi
    if (rankC<ns) W('collinear', `Le colonne delle concentrazioni sono quasi dipendenti (${rankC} su ${ns}): i SAS non sono determinati.`, `The concentration columns are nearly dependent (${rankC} of ${ns}): the SAS are not determined.`);
    if (corr) for (let i=0;i<np;i++) for (let j=0;j<i;j++) if (Math.abs(corr[i][j])>0.95) W('corr', `Correlazione alta fra ${(i<nk?info.params[i]:'t0')} e ${(j<nk?info.params[j]:'t0')} (${corr[i][j].toFixed(3)}): i due parametri non si distinguono bene con questi dati.`, `High correlation between ${(i<nk?info.params[i]:'t0')} and ${(j<nk?info.params[j]:'t0')} (${corr[i][j].toFixed(3)}): the two parameters are poorly distinguished by these data.`);
    if (o.model==='consec'){ const d=Math.abs(R.p[0]-R.p[1]), sd=se_?Math.hypot(se_[0],se_[1]):Infinity;
      if (d<2*sd || d<0.05) W('k1k2', 'k₁ e k₂ sono quasi uguali: il caso k₁ = k₂ è trattato a parte (limite di Bateman) e le incertezze sono grandi.', 'k₁ and k₂ are nearly equal: the k₁ = k₂ case is handled separately (Bateman limit) and the uncertainties are large.');
      W('swap', 'Con spettri liberi le soluzioni (k₁, k₂) e (k₂, k₁) descrivono i dati allo stesso modo: si sceglie quella con i SAS meno negativi, ma va confermata con la chimica.', 'With free spectra the solutions (k₁, k₂) and (k₂, k₁) describe the data equally well: the one with the least negative SAS is chosen, but it must be confirmed by the chemistry.'); }
    if (o.model==='rev' && !o.K) W('noK', 'A ⇌ B senza costante di equilibrio: solo k_obs = k_f + k_b; gli spettri mostrati sono associati ai decadimenti (DAS), non alle specie.', 'A ⇌ B without an equilibrium constant: only k_obs = k_f + k_b; the spectra shown are decay-associated (DAS), not species-associated.');
    if (o.model==='ord2' && !o.A0) W('A0', 'Secondo ordine: il valore stimato è k\' = k[A]₀ (1/tempo). Scrivi [A]₀ per avere k.', 'Second order: the estimate is k\' = k[A]₀ (1/time). Enter [A]₀ to obtain k.');
    for (const pp of params.slice(0,nk)){ if (pp.value*tmax<0.05) W('slow', `${pp.name} è troppo lenta per l'intervallo dei tempi (k·t_max = ${(pp.value*tmax).toPrecision(2)}): stima poco affidabile.`, `${pp.name} is too slow for the time range (k·t_max = ${(pp.value*tmax).toPrecision(2)}): unreliable estimate.`);
      if (pp.value*tmin>20) W('fast', `${pp.name} è più veloce del primo intervallo di tempo: stima poco affidabile.`, `${pp.name} is faster than the first time interval: unreliable estimate.`); }
    if (o.model==='ord0' && u.k[0]*(Math.max(...t)-u.t0)<1) W('ord0lin', 'Ordine 0: [A] non arriva a zero nell\'intervallo dei tempi, quindi il profilo è una retta e con spettri liberi k non si determina (qualunque k dà lo stesso fit). Serve uno spettro noto o un intervallo più lungo.', 'Zero order: [A] does not reach zero within the time range, so the profile is a straight line and with free spectra k is not determined (any k gives the same fit). A known spectrum or a longer time range is needed.');
    if (flat.length) W('plateau', `${flat.map(i=>i<nk?info.params[i]:'t0').join(', ')}: il parametro cresce o cala senza limite (pianoro: la somma dei quadrati non cambia più). Non ha un valore determinato da questi dati: niente numero e niente incertezze. Prova un altro modello o delle k di partenza.`, `${flat.map(i=>i<nk?info.params[i]:'t0').join(', ')}: the parameter grows or shrinks without limit (plateau: the sum of squares no longer changes). It has no value determined by these data: no number and no uncertainties. Try another model or starting k values.`);
    if (!R.converged) W('lm', 'Il fit non ha raggiunto la convergenza nel numero massimo di iterazioni.', 'The fit did not converge within the maximum number of iterations.');
    // adeguatezza: confronto con la SVD troncata allo stesso numero di specie (limite inferiore della somma dei quadrati)
    if (!sv) sv=yield* M.svdGen(D);
    let svRest=0; for (let c=rankC;c<sv.s.length;c++) svRest+=sv.s[c]*sv.s[c];
    if (svRest>0 && sse>2*svRest && sse-svRest>1e-12*M.sumSq(D.a)) W('fit', `I residui sono ${(sse/svRest).toFixed(1)} volte quelli della SVD con ${rankC} componenti: il modello non descrive bene i dati (residui con struttura).`, `The residuals are ${(sse/svRest).toFixed(1)} times those of the SVD with ${rankC} components: the model does not describe the data well (structured residuals).`);
    let swap=null;
    if (o.model==='consec'){ // soluzione scambiata: stessa somma dei quadrati, spettri diversi
      yield null; const k2=[u.k[1],u.k[0]], C2=profiles(md, info, t, k2, u.t0, o), S2=spectraFor(D, C2, ns, o.nonnegS); yield null;
      const negS=SS=>{ let a=0, b=0; for (const v of SS){ b+=v*v; if (v<0) a+=v*v; } return a/(b||1); };
      const n1=negS(S), n2=negS(S2); swap={k:k2, neg:n2, negMain:n1};
      if (n2<n1-1e-9){ // conviene la scambiata: si riporta come principale
        params[0].value=k2[0]; params[1].value=k2[1]; [params[0].se, params[1].se]=[params[1].se*k2[0]/u.k[1], params[0].se*k2[1]/u.k[0]];
        params.forEach((pp,i)=>{ if (i<2){ pp.lo95=pp.value*Math.exp(-1.96*(pp.se/pp.value)); pp.hi95=pp.value*Math.exp(1.96*(pp.se/pp.value)); pp.tau=1/pp.value; pp.seLog=pp.se/pp.value; } });
        C.set(C2); S.set(S2); swap={k:u.k.slice(), neg:n1, negMain:n2, swapped:true}; } }
    const lnN=Math.log(N), aic=N*Math.log(sse/N)+2*P, bic=N*Math.log(sse/N)+P*lnN;
    const rmsRow=new Float64Array(m), rmsCol=new Float64Array(n); for (let i=0;i<m;i++){ let s=0; for (let j=0;j<n;j++){ const e=E[i*n+j]; s+=e*e; rmsCol[j]+=e*e; } rmsRow[i]=Math.sqrt(s/n); } for (let j=0;j<n;j++) rmsCol[j]=Math.sqrt(rmsCol[j]/m);
    return {version:VERSION, opt:o, model:o.model, info, species:info.species, params, derived, corr, cov:cov?Array.from(cov):null, C:M.mat(m,ns,C), S:M.mat(ns,n,S), E:M.mat(m,n,E),
      ssr:sse, sigma:Math.sqrt(s2), N, P, dof, aic, bic, iter:R.iter, converged:R.converged, singular:Array.from(sv.s), rankC, swap, warnings:warn, rmsRow, rmsCol, t, note:MODELS[o.model].note};
  }
  const fit=(se,o)=>drain(fitGen(se,o));

  /* ---------------- confronto tra modelli: AIC, BIC e test F per i modelli annidati ---------------- */
  function lgamma(x){ const g=7, c=[0.99999999999980993,676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-0.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];
    if (x<0.5) return Math.log(Math.PI/Math.abs(Math.sin(Math.PI*x)))-lgamma(1-x); x-=1; let a=c[0]; const t=x+g+0.5; for (let i=1;i<9;i++) a+=c[i]/(x+i); return 0.5*Math.log(2*Math.PI)+(x+0.5)*Math.log(t)-t+Math.log(a); }
  function betacf(a, b, x){ const FPMIN=1e-300; let qab=a+b, qap=a+1, qam=a-1, c=1, d=1-qab*x/qap; if (Math.abs(d)<FPMIN) d=FPMIN; d=1/d; let h=d;
    for (let m=1;m<=500;m++){ const m2=2*m; let aa=m*(b-m)*x/((qam+m2)*(a+m2)); d=1+aa*d; if (Math.abs(d)<FPMIN) d=FPMIN; c=1+aa/c; if (Math.abs(c)<FPMIN) c=FPMIN; d=1/d; h*=d*c;
      aa=-(a+m)*(qab+m)*x/((a+m2)*(qap+m2)); d=1+aa*d; if (Math.abs(d)<FPMIN) d=FPMIN; c=1+aa/c; if (Math.abs(c)<FPMIN) c=FPMIN; d=1/d; const del=d*c; h*=del; if (Math.abs(del-1)<3e-16) break; }
    return h; }
  function betainc(a, b, x){ if (x<=0) return 0; if (x>=1) return 1; const bt=Math.exp(lgamma(a+b)-lgamma(a)-lgamma(b)+a*Math.log(x)+b*Math.log(1-x));
    return x<(a+1)/(a+b+2) ? bt*betacf(a,b,x)/a : 1-bt*betacf(b,a,1-x)/b; }
  // P(F > f) con d1, d2 gradi di libertà
  function fSurvival(f, d1, d2){ if (!(f>0)) return 1; return betainc(d2/2, d1/2, d2/(d2+d1*f)); }
  function nested(a, b){ // a annidato in b: famiglia esponenziale (n esponenziali, costante)
    if (!a.info.exp || !b.info.exp) return false; return a.info.exp[0]<=b.info.exp[0] && a.info.exp[1]<=b.info.exp[1] && a.P<b.P; }
  function compare(results){ const ok=results.filter(r=>r && fin(r.ssr)); if (!ok.length) return {rows:[], tests:[]};
    const amin=Math.min(...ok.map(r=>r.aic)), bmin=Math.min(...ok.map(r=>r.bic));
    const rows=ok.map(r=>({model:r.model, label:r.label||r.model, ssr:r.ssr, P:r.P, aic:r.aic, bic:r.bic, dAIC:r.aic-amin, dBIC:r.bic-bmin, wAIC:0}));
    const z=rows.reduce((s,r)=>s+Math.exp(-r.dAIC/2),0); rows.forEach(r=>r.wAIC=Math.exp(-r.dAIC/2)/z);
    const tests=[]; for (const a of ok) for (const b of ok) if (a!==b && nested(a,b)){ const d1=b.P-a.P, d2=b.N-b.P, F=((a.ssr-b.ssr)/d1)/(b.ssr/d2); tests.push({simple:a.label||a.model, complex:b.label||b.model, F, d1, d2, p:fSurvival(F,d1,d2)}); }
    return {rows, tests}; }

  /* impostazioni salvate nel progetto (memory.an.kin) */
  function cleanOpt(v){ if (!v || typeof v!=='object' || Array.isArray(v)) return null; const o={};
    if (MODELS[v.model]) o.model=v.model; if (Number.isInteger(v.nExp) && v.nExp>=1 && v.nExp<=5) o.nExp=v.nExp;
    for (const k of ['offset','t0fit','nonnegS']) if (typeof v[k]==='boolean') o[k]=v[k];
    for (const k of ['t0']) if (fin(v[k])) o[k]=v[k];
    for (const k of ['K','A0']) if (fin(v[k]) && v[k]>0) o[k]=v[k];
    if (Number.isInteger(v.rank) && v.rank>=1 && v.rank<=50) o.rank=v.rank;
    if (Array.isArray(v.k0)){ const k=v.k0.filter(x=>fin(x)&&x>0).slice(0,5); if (k.length) o.k0=k; }
    return Object.keys(o).length?o:null; }

  return {VERSION, MODELS, modelInfo, lm, lmGen, fitCurve, covariance, fit, fitGen, profiles, spectraFor, compare, fSurvival, betainc, lgamma, cleanOpt, options};
});
