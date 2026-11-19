// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* CF-LIBS (LIBS senza taratura), SPERIMENTALE: parte pura, senza DOM (vale nel browser, nel worker e in node).
   Metodo CF-LIBS (Ciucci et al., 1999, doi:10.1366/0003702991947612; brevetto US 6,657,721 B1), come riassunto in
   docs/studi/XRF-PYMCA-CFLIBS.md §3.3 e §3.5
   e descritto in docs/CF-LIBS.md. Ipotesi: plasma omogeneo, otticamente sottile (salvo la correzione dell'autoassorbimento),
   in equilibrio termodinamico locale (LTE), risposta spettrale dello strumento costante (F uguale per tutte le righe).
   Dati atomici: app/libs-data.js (NIST ASD). Deterministico: i numeri casuali (incertezze Monte Carlo, rumore degli spettri
   sintetici) vengono da un generatore con seme.
   Dove la fonte è incerta (WS nello studio, o «da verificare»), il commento lo dice: non sono valori inventati né verificati. */
(function(root, factory){
  if (typeof module==='object' && module.exports) module.exports=factory();
  else root.LibsCf=factory();
})(typeof globalThis!=='undefined' ? globalThis : this, function(){
  'use strict';
  const VERSION='libs-cf-1';
  const KB=8.617333262e-5;                 // costante di Boltzmann, eV/K (CODATA 2018)
  const SAHA_K=2.4146830e15;               // (2π m_e k_B T / h²)^{3/2} / T^{3/2}, in cm⁻³ K^{-3/2} (CODATA 2018)
  const H_SI=6.62607015e-34, C_SI=2.99792458e8, K_SI=1.380649e-23, ATM=101325;
  const fin=v=>typeof v==='number' && Number.isFinite(v);

  /* ---------------- numeri casuali con seme (Mulberry32) e distribuzioni ---------------- */
  function rng(seed){ let a=(seed>>>0)||0x9e3779b9; const u=()=>{ a=(a+0x6D2B79F5)>>>0; let t=a; t=Math.imul(t^(t>>>15), t|1); t^=t+Math.imul(t^(t>>>7), t|61); return ((t^(t>>>14))>>>0)/4294967296; };
    let spare=null; const normal=()=>{ if (spare!=null){ const s=spare; spare=null; return s; } let x=0, y=0, r=0; do { x=2*u()-1; y=2*u()-1; r=x*x+y*y; } while (r>=1 || r===0); const f=Math.sqrt(-2*Math.log(r)/r); spare=y*f; return x*f; };
    const poisson=l=>{ if (!(l>0)) return 0; if (l>30) return Math.max(0, Math.round(l+Math.sqrt(l)*normal())); const L=Math.exp(-l); let k=0, p=1; do { k++; p*=u(); } while (p>L); return k-1; };
    return {u, normal, poisson}; }

  /* ---------------- algebra lineare minima ---------------- */
  function solve(A, b, n){ const M=A.slice(), x=b.slice();   // eliminazione di Gauss con pivot parziale; A riga per riga (n×n)
    for (let c=0;c<n;c++){ let p=c, mx=Math.abs(M[c*n+c]); for (let r=c+1;r<n;r++){ const v=Math.abs(M[r*n+c]); if (v>mx){ mx=v; p=r; } }
      if (!(mx>1e-300)) return null;
      if (p!==c){ for (let k=0;k<n;k++){ const t=M[c*n+k]; M[c*n+k]=M[p*n+k]; M[p*n+k]=t; } const t=x[c]; x[c]=x[p]; x[p]=t; }
      for (let r=c+1;r<n;r++){ const f=M[r*n+c]/M[c*n+c]; if (!f) continue; for (let k=c;k<n;k++) M[r*n+k]-=f*M[c*n+k]; x[r]-=f*x[c]; } }
    for (let r=n-1;r>=0;r--){ let s=x[r]; for (let k=r+1;k<n;k++) s-=M[r*n+k]*x[k]; x[r]=s/M[r*n+r]; } return x; }
  function inverse(A, n){ const out=new Array(n*n); for (let c=0;c<n;c++){ const e=new Array(n).fill(0); e[c]=1; const x=solve(A, e, n); if (!x) return null; for (let r=0;r<n;r++) out[r*n+c]=x[r]; } return out; }
  function cholesky(A, n){ const L=new Array(n*n).fill(0); for (let i=0;i<n;i++) for (let j=0;j<=i;j++){ let s=A[i*n+j]; for (let k=0;k<j;k++) s-=L[i*n+k]*L[j*n+k];
    if (i===j){ if (s<=0) s=1e-300; L[i*n+i]=Math.sqrt(s); } else L[i*n+j]=s/L[j*n+j]; } return L; }

  /* ---------------- dati atomici (app/libs-data.js) ---------------- */
  function species(D, el, st){ return D && D.species ? D.species[el+' '+st]||null : null; }
  // U(T) per interpolazione lineare sulla griglia di libs-data.js (500 K); fuori griglia: valore all'estremo (avviso nel risultato)
  function partition(D, el, st, T){ const sp=species(D, el, st); if (!sp){ return (el==='H' && st==='II') ? 1 : null; }
    const G=D.Tgrid, U=sp.U; if (T<=G[0]) return U[0]; if (T>=G[G.length-1]) return U[U.length-1];
    let i=Math.floor((T-G[0])/(G[1]-G[0])); i=Math.min(Math.max(i,0), G.length-2); const f=(T-G[i])/(G[i+1]-G[i]); return U[i]+(U[i+1]-U[i])*f; }
  function lineObj(el, st, r){ return {el, st, wl:r[0], A:r[1], acc:r[2], Ei:r[3], Ek:r[4], gi:r[5], gk:r[6], key:el+' '+st+' '+r[0].toFixed(2)}; }
  function linesOf(D, el, st){ const sp=species(D, el, st); return sp ? sp.lines.map(r=>lineObj(el, st, r)) : []; }
  function elementsIn(D){ return D && D.species ? [...new Set(Object.values(D.species).map(s=>s.el))] : []; }
  const accRel=(D, acc)=>D && D.accRel && D.accRel[acc]!=null ? D.accRel[acc] : 0.5;

  /* ---------------- equazione di Saha–Eggert ----------------
     n_e·n_II/n_I = 2·(U_II/U_I)·(2π m_e k_B T/h²)^{3/2}·exp(−E_ion/k_B T)
     (10.3390/app10144973 eq. 1-2; brevetto US 6,657,721 eq. 1, forma 6.0·10²¹·T_eV^{3/2}: 2·SAHA_K·11604.5^{1.5} = 6.04·10²¹).
     Solo il primo stadio: gli stadi superiori sono trascurati (il brevetto li dà < 10⁻³ alle T di analisi). */
  function sahaRatio(D, el, T, ne){ const sI=species(D, el, 'I'); if (!sI || !fin(sI.Eion) || !(ne>0)) return null;
    const UI=partition(D, el, 'I', T), UII=partition(D, el, 'II', T)||1;
    return 2*SAHA_K*Math.pow(T,1.5)*(UII/UI)*Math.exp(-sI.Eion/(KB*T))/ne; }

  /* ---------------- profili ----------------
     Voigt con la funzione di Faddeeva w(z) nell'approssimazione di Humlíček (JQSRT 27, 1982, 437, doi:10.1016/0022-4073(82)90078-4,
     algoritmo W4, errore relativo ~10⁻⁴). V(x) = Re w((x + iγ)/(σ√2)) / (σ√(2π)), γ = metà larghezza Lorentziana, σ della Gaussiana. */
  const cm=(a,b)=>[a[0]*b[0]-a[1]*b[1], a[0]*b[1]+a[1]*b[0]], cd=(a,b)=>{ const d=b[0]*b[0]+b[1]*b[1]; return [(a[0]*b[0]+a[1]*b[1])/d, (a[1]*b[0]-a[0]*b[1])/d]; };
  const ca=(a,b)=>[a[0]+b[0], a[1]+b[1]], cs=(a,b)=>[a[0]-b[0], a[1]-b[1]], cr=(a,r)=>[a[0]*r, a[1]*r], cp=(a,r)=>[a[0]+r, a[1]];
  function poly(t, c){ let s=[c[c.length-1],0]; for (let i=c.length-2;i>=0;i--) s=cp(cm(s,t), c[i]); return s; }
  function humlicek(x, y){ const t=[y,-x], s=Math.abs(x)+y;
    if (s>=15) return cd(cr(t,0.5641896), cp(cm(t,t),0.5))[0];
    if (s>=5.5){ const u=cm(t,t); return cd(cm(t, cp(cr(u,0.5641896),1.410474)), cp(cm(u, cp(u,3)),0.75))[0]; }
    if (y>=0.195*Math.abs(x)-0.176) return cd(poly(t,[16.4955,20.20933,11.96482,3.778987,0.5642236]), poly(t,[16.4955,38.82363,39.27121,21.69274,6.699398,1]))[0];
    const u=cm(t,t), e=Math.exp(u[0]), ex=[e*Math.cos(u[1]), e*Math.sin(u[1])];
    const num=poly(u,[36183.31,-3321.9905,1540.787,-219.0313,35.76683,-1.320522,0.56419]), den=poly(u,[32066.6,-24322.84,9022.228,-2186.181,364.2191,-61.57037,1.841439,-1]);
    return cs(ex, cd(cm(t,num),den))[0]; }
  const SQ2=Math.SQRT2, SQ2PI=Math.sqrt(2*Math.PI), F2S=2*Math.sqrt(2*Math.LN2);
  // profilo di Voigt ad area 1 (in unità di x), con le FWHM Gaussiana fG e Lorentziana fL
  function voigt(dx, fG, fL){ const g=fL/2; if (!(fG>1e-12)) return g/Math.PI/(dx*dx+g*g); const s=fG/F2S; if (!(g>1e-12)) return Math.exp(-dx*dx/(2*s*s))/(s*SQ2PI);
    return humlicek(dx/(s*SQ2), g/(s*SQ2))/(s*SQ2PI); }
  /* FWHM della Voigt (Olivero e Longbothum, JQSRT 17, 1977, 233, doi:10.1016/0022-4073(77)90161-3; ±0,02 % nella forma standard,
     ripresa come eq. 19 in 10.3390/app10144973, dove il testo estratto dal PDF è disordinato: si usa la forma standard, vedi lo studio §3.3):
     f_V = 0,5346 f_L + √(0,2166 f_L² + f_G²) */
  function oliveroFwhm(fL, fG){ return 0.5346*fL+Math.sqrt(0.2166*fL*fL+fG*fG); }
  // inversione esatta della formula di Olivero per la componente Lorentziana (radice minore dell'equazione di secondo grado)
  function lorentzFromVoigt(fV, fG){ if (!(fV>0)) return 0; if (!(fG>0)) return fV; if (fG>=fV) return 0;
    const a=0.5346*0.5346-0.2166, b=-2*0.5346*fV, c=fV*fV-fG*fG, disc=b*b-4*a*c;   // (0,5346²−0,2166) f_L² − 1,0692 f_V f_L + (f_V²−f_G²) = 0
    return (-b-Math.sqrt(Math.max(0,disc)))/(2*a); }

  /* ---------------- fit locale delle righe: Voigt + fondo lineare ----------------
     Parametri non lineari (centro, f_L di ogni riga, f_G comune se la larghezza strumentale non è dichiarata) con Levenberg–Marquardt;
     aree e fondo lineari, risolti esattamente a ogni passo (proiezione variabile: Golub e Pereyra, SIAM J. Numer. Anal. 10, 1973, 413).
     Righe vicine (entro opt.join FWHM) si adattano insieme. L'area è l'integrale della Voigt, in unità di y × nm. */
  function fitGroup(xs, ys, i0, i1, cent, opt){
    const k=cent.length, fixG=opt.fwhmG>0, maxS=opt.maxShift, n=i1-i0+1, xm=(xs[i0]+xs[i1])/2, nl=k+2;
    const np=2*k+(fixG?0:1), p0=new Array(np);
    for (let j=0;j<k;j++){ p0[j]=0; p0[k+j]=Math.log(opt.fL0||Math.max(0.02, 0.5*(opt.fwhmG||0.05))); }
    if (!fixG) p0[2*k]=Math.log(opt.fG0||0.05);
    const fLmax=opt.fLmax||2, lnMax=Math.log(1.05*fLmax);
    const unpack=p=>({c:cent.map((c,j)=>c+maxS*Math.tanh(p[j])), fL:cent.map((c,j)=>Math.exp(Math.min(Math.max(p[k+j],-11),lnMax))), fG:fixG?opt.fwhmG:Math.exp(Math.min(Math.max(p[2*k],-9),0.5))});
    function project(p){ const q=unpack(p), Phi=new Float64Array(n*nl);
      for (let i=0;i<n;i++){ const x=xs[i0+i]; for (let j=0;j<k;j++) Phi[i*nl+j]=voigt(x-q.c[j], q.fG, q.fL[j]); Phi[i*nl+k]=1; Phi[i*nl+k+1]=x-xm; }
      const A=new Array(nl*nl).fill(0), b=new Array(nl).fill(0);
      for (let i=0;i<n;i++){ const y=ys[i0+i], o=i*nl; for (let a=0;a<nl;a++){ b[a]+=Phi[o+a]*y; for (let c=0;c<=a;c++) A[a*nl+c]+=Phi[o+a]*Phi[o+c]; } }
      for (let a=0;a<nl;a++) for (let c=0;c<a;c++) A[c*nl+a]=A[a*nl+c];
      const coef=solve(A, b, nl); if (!coef) return null; const r=new Float64Array(n);
      for (let i=0;i<n;i++){ let s=0; for (let a=0;a<nl;a++) s+=Phi[i*nl+a]*coef[a]; r[i]=ys[i0+i]-s; }
      return {q, coef, r, A}; }
    const ssr=r=>{ let s=0; for (let i=0;i<r.length;i++) s+=r[i]*r[i]; return s; };
    let p=p0.slice(), P=project(p); if (!P) return null; let f=ssr(P.r), lam=1e-2, it=0;
    for (it=0; it<80; it++){
      const J=new Float64Array(n*np);
      for (let a=0;a<np;a++){ const h=1e-4*Math.max(1,Math.abs(p[a])), pa=p.slice(); pa[a]+=h; const Pa=project(pa); if (!Pa) return null; for (let i=0;i<n;i++) J[i*np+a]=(Pa.r[i]-P.r[i])/h; }
      const JtJ=new Array(np*np).fill(0), g=new Array(np).fill(0);
      for (let i=0;i<n;i++){ const o=i*np; for (let a=0;a<np;a++){ g[a]+=J[o+a]*P.r[i]; for (let b=0;b<np;b++) JtJ[a*np+b]+=J[o+a]*J[o+b]; } }
      let ok=false;
      for (let tr=0; tr<20; tr++){ const B=JtJ.slice(); for (let a=0;a<np;a++) B[a*np+a]+=lam*(JtJ[a*np+a]||1e-12);
        const d=solve(B, g.map(v=>-v), np); if (!d){ lam*=10; continue; }
        const pn=p.map((v,a)=>v+d[a]), Pn=project(pn); const fn=Pn?ssr(Pn.r):Infinity;
        if (fn<f){ const rel=(f-fn)/(f||1); p=pn; P=Pn; f=fn; lam=Math.max(lam/5,1e-9); ok=true; if (rel<1e-10) it=1e9; break; }
        lam*=8; }
      if (!ok) break; }
    // incertezze: σ² dai residui; aree dalla parte lineare, f_L dalla parte non lineare (approssimazione della proiezione variabile)
    const dof=Math.max(1, n-nl-np), s2=f/dof, Ainv=inverse(P.A, nl);
    const J=new Float64Array(n*np); for (let a=0;a<np;a++){ const h=1e-4*Math.max(1,Math.abs(p[a])), pa=p.slice(); pa[a]+=h; const Pa=project(pa); for (let i=0;i<n;i++) J[i*np+a]=(Pa.r[i]-P.r[i])/h; }
    const JtJ=new Array(np*np).fill(0); for (let i=0;i<n;i++) for (let a=0;a<np;a++) for (let b=0;b<np;b++) JtJ[a*np+b]+=J[i*np+a]*J[i*np+b];
    const Jinv=inverse(JtJ, np), q=P.q;
    return cent.map((c0,j)=>{ const area=P.coef[j], sArea=Ainv?Math.sqrt(Math.max(0,s2*Ainv[j*nl+j])):NaN, sv=Jinv?Math.sqrt(Math.max(0,s2*Jinv[(k+j)*np+k+j])):NaN;
      return {wl0:c0, center:q.c[j], area, sArea, snr:sArea>0?area/sArea:0, fL:q.fL[j], sfL:q.fL[j]*sv, fG:q.fG, fV:oliveroFwhm(q.fL[j], q.fG), atBound:(q.fL[j]<2e-5||q.fL[j]>0.95*fLmax)||Math.abs(q.c[j]-c0)>0.98*maxS,
        bg:P.coef[k]+P.coef[k+1]*(c0-xm), rms:Math.sqrt(s2), n, joint:k}; }); }
  function idxAt(xs, x){ let lo=0, hi=xs.length-1; if (xs[0]>xs[hi]) throw new Error('asse X decrescente: ordinare prima'); while (hi-lo>1){ const m=(lo+hi)>>1; if (xs[m]<x) lo=m; else hi=m; } return Math.abs(xs[lo]-x)<=Math.abs(xs[hi]-x)?lo:hi; }
  /* fitLines(xs, ys, centri, opt): opt.fwhmG = FWHM strumentale in nm (se manca si adatta), opt.win = semiampiezza della finestra (nm),
     opt.maxShift = scostamento massimo del centro (nm), opt.join = distanza per il fit congiunto (nm). Restituisce un risultato per centro. */
  function fitLines(xs, ys, centers, opt){ opt=Object.assign({maxShift:0.05}, opt||{}); const wTot=(opt.fwhmG||0.05)+(opt.fL0||0.05);
    const win=opt.win||Math.max(5*wTot, 0.2), join=opt.join||3*wTot;
    const order=centers.map((c,i)=>[c,i]).sort((a,b)=>a[0]-b[0]), out=new Array(centers.length).fill(null);
    for (let s=0; s<order.length;){ let e=s; while (e+1<order.length && order[e+1][0]-order[e][0]<join) e++;
      const G=order.slice(s,e+1), lo=G[0][0]-win, hi=G[G.length-1][0]+win;
      if (lo>=xs[0] && hi<=xs[xs.length-1]){ const i0=idxAt(xs, lo), i1=idxAt(xs, hi);
        if (i1-i0+1 >= 2*G.length+6){ const r=fitGroup(xs, ys, i0, i1, G.map(g=>g[0]), opt); if (r) G.forEach((g,j)=>{ out[g[1]]=r[j]; }); } }
      s=e+1; }
    return out; }

  /* ---------------- densità elettronica ----------------
     Riga non idrogenoide con coefficiente Stark w noto (contributo ionico trascurato): Δλ_L = 2w·n_e/10¹⁶
     (10.3390/app10144973 eq. 13, con eq. 11-12 per la forma completa) ⇒ n_e = Δλ_L·10¹⁶/(2w), w e Δλ nella stessa unità. */
  function neFromStark(fL, w){ return fL>0 && w>0 ? fL*1e16/(2*w) : null; }
  /* Hα (656,28 nm) e Hβ (486,13 nm). Forma di 10.3390/app10144973: Δλ_S = γ_α n_e^{2/3} (eq. 14, da Pardini et al. 2013,
     doi:10.1016/j.sab.2013.05.030) e Δλ_S = γ_β n_e^{0,68116} (eq. 15, Gigosos 2014, doi:10.1088/0022-3727/47/34/343001);
     γ_α e γ_β NON sono dati nell'articolo. Coefficienti numerici usati qui: Gigosos, González, Cardeñoso, Spectrochim. Acta B 58
     (2003) 1489, doi:10.1016/S0584-8547(03)00097-1, FWHM: Hβ 4,800 nm·(n_e/10¹⁷ cm⁻³)^0,68116 e Hα 1,098 nm·(n_e/10¹⁷ cm⁻³)^0,67965.
     VERIFICA: l'articolo del 2003 non è stato letto (chiuso); i due coefficienti sono confermati solo da fonti secondarie trovate con
     ricerche web (WS). Formula di El Sherbini et al. 2005 (doi:10.1016/j.sab.2005.10.011, eq. 13: n_e = C(λ,T)·Δλ^{3/2}): non
     implementata, perché la tabella C(λ,T) di Griem non è disponibile qui. Con H abbondante Hα è autoassorbita: meglio Hβ. */
  const H_ALPHA=656.28, H_BETA=486.13;
  function neHalpha(fwhmS_nm){ return fwhmS_nm>0 ? 1e17*Math.pow(fwhmS_nm/1.098, 1/0.67965) : null; }
  function neHbeta(fwhmS_nm){ return fwhmS_nm>0 ? 1e17*Math.pow(fwhmS_nm/4.800, 1/0.68116) : null; }
  function fwhmHalpha(ne){ return 1.098*Math.pow(ne/1e17, 0.67965); }
  function fwhmHbeta(ne){ return 4.800*Math.pow(ne/1e17, 0.68116); }
  // fit della riga dell'idrogeno: la componente Lorentziana (Olivero) si prende come larghezza Stark (approssimazione: i profili di
  // Balmer non sono Lorentziani, e Hβ ha un avvallamento centrale)
  function neFromHydrogen(xs, ys, which, opt){ opt=opt||{}; const c=which==='beta'?H_BETA:H_ALPHA;
    const fit=win=>fitLines(xs, ys, [c], {fwhmG:opt.fwhmG, win, maxShift:opt.maxShift||0.3, fL0:which==='beta'?1:0.3, fLmax:20})[0];
    let r=fit(opt.win||(which==='beta'?6:3));
    // le ali Lorentziane larghe finiscono nel fondo lineare se la finestra è stretta: secondo passo con ±6 FWHM
    if (!opt.win && r && r.area>0 && r.fV>0){ const w2=Math.min(Math.max(6*r.fV, 3), 25), r2=fit(w2); if (r2 && r2.area>0) r=r2; }
    if (!r || !(r.area>0) || r.snr<3 || r.atBound) return {ok:false, line:which, fit:r};
    const ne=which==='beta'?neHbeta(r.fL):neHalpha(r.fL), p=which==='beta'?0.68116:0.67965, sne=ne*(r.sfL/r.fL)/p;
    return {ok:fin(ne), ne, sne, line:which, fit:r}; }

  /* ---------------- autoassorbimento ----------------
     El Sherbini et al. 2005 (doi:10.1016/j.sab.2005.10.011, eq. 6, 8, 12): SA = I(λ0)/I0(λ0); Δλ = Δλ0·SA^α con α = −0,54;
     Ī = Ī0·SA^β con β = 0,46; SA = (Δλ/(2 w_s n_e/10¹⁶))^{1/α}. Nel PDF il segno di α è perso nell'estrazione (studio §3.3): α < 0
     perché la riga autoassorbita è più larga. NB: in 10.3390/app10144973 eq. 26-27 il testo estratto dà gli esponenti scambiati
     (I = SA^{−0,54}·I0, Δλ = SA^{0,46}·Δλ0); la loro combinazione, eq. 28, è comunque la stessa: I = (Δλ/Δλ0)^{−0,85}·I0.
     Formula pratica (Spectroscopy 2022, doi:10.56530/spectroscopy.xq8876v9, eq. 6): I0 ≈ I·(Δλ/Δλ0)^{0,85}, valida anche per
     autoassorbimento forte (plasma omogeneo in LTE). Le due sono la stessa relazione (0,46/0,54 = 0,85). Serve w della riga. */
  const SA_ALPHA=-0.54, SA_BETA=0.46, SA_EXP=0.85;
  function saFromWidth(fL, w, ne){ const d0=2*w*ne/1e16; if (!(fL>0 && d0>0)) return null; return Math.min(1, Math.pow(fL/d0, 1/SA_ALPHA)); }
  function selfAbsCorrect(I, fL, w, ne, method){ const d0=2*w*ne/1e16; if (!(I>0 && fL>0 && d0>0)) return null; const ratio=Math.max(1, fL/d0);
    if (method==='elsherbini'){ const SA=Math.pow(ratio, 1/SA_ALPHA); return {I0:I/Math.pow(SA, SA_BETA), SA, ratio, d0}; }
    return {I0:I*Math.pow(ratio, SA_EXP), SA:Math.pow(ratio, 1/SA_ALPHA), ratio, d0}; }

  /* ---------------- grafico di Boltzmann e regressione pesata ----------------
     ln(Ī/(g_k A_ki)) = −E_k/(k_B T) + ln(F C_s/U_s(T)) (brevetto US 6,657,721 eq. 5-6; 10.3390/app10144973 eq. 3).
     Con intensità in energia (spettro tarato in radianza) si usa ln(Ī λ/(g_k A_ki)), perché Ī ∝ hν·g_k A_ki…
     Regressione congiunta: una pendenza comune (stessa T per tutte le specie), un'intercetta per gruppo; pesi 1/σ_y². */
  function jointFit(pts){ const groups=[...new Set(pts.map(p=>p.g))], G=groups.length, n=1+G; if (pts.length<2 || pts.length<n+1) return null;
    const gi=new Map(groups.map((g,i)=>[g,i])), A=new Array(n*n).fill(0), b=new Array(n).fill(0);
    for (const p of pts){ const w=1/(p.sy*p.sy), j=1+gi.get(p.g); A[0]+=w*p.x*p.x; A[j]+=w*p.x; A[j*n]+=w*p.x; A[j*n+j]+=w; b[0]+=w*p.x*p.y; b[j]+=w*p.y; }
    const sol=solve(A, b, n); if (!sol) return null; let chi2=0; for (const p of pts){ const r=p.y-(sol[0]*p.x+sol[1+gi.get(p.g)]); chi2+=r*r/(p.sy*p.sy); }
    const dof=pts.length-n, chi2r=dof>0?chi2/dof:NaN, cov0=inverse(A, n); if (!cov0) return null; const sc=Math.max(1, fin(chi2r)?chi2r:1), cov=cov0.map(v=>v*sc);
    // la pendenza è determinata solo se c'è un intervallo di E_k in almeno un gruppo
    const spread=groups.map(g=>{ const xx=pts.filter(p=>p.g===g).map(p=>p.x); return Math.max(...xx)-Math.min(...xx); });
    return {m:sol[0], q:Object.fromEntries(groups.map((g,i)=>[g,sol[1+i]])), groups, cov, chi2r, dof, scaled:sc>1, spread:Math.max(...spread)}; }
  function boltzmannPlot(lines, opt){ opt=opt||{}; const pts=lines.filter(l=>l.I>0).map(l=>({g:l.g||(l.el+' '+l.st), x:l.Ek, y:Math.log(l.I*(opt.intensity==='energy'?l.wl:1)/(l.gk*l.A)), sy:l.sy||0.1, line:l})).filter(p=>fin(p.x) && fin(p.y));
    const f=jointFit(pts); if (!f) return null; const T=-1/(KB*f.m), sT=Math.sqrt(f.cov[0])/(KB*f.m*f.m); return Object.assign(f, {T, sT, points:pts}); }

  /* ---------------- CF-LIBS ----------------
     meas: righe misurate {el, st, wl, A, acc, Ei, Ek, gi, gk, area, sArea, fL?} (per esempio da analyze).
     opt.mode: 'saha-boltzmann' (predefinito: le righe ioniche portate sulla scala neutra, una retta per elemento) o 'boltzmann'
       (una retta per specie, pendenza comune).
     opt.ne: densità elettronica nota (cm⁻³), per esempio da Stark; se manca, iterazione con la neutralità di carica e la pressione
       opt.pressure (atm, predefinita 1): n_e = Σ N_II, N_tot = p/(k_B T). Il brevetto descrive l'iterazione chiusura → n_e = Σ N_ioni →
       Saha a partire da n_e ≈ 10¹⁸ cm⁻³ (studio §3.3, passo A iii); l'ipotesi della pressione per fissare la scala assoluta è
       di questo programma e va verificata sul testo del brevetto (DA VERIFICARE).
     opt.closure: 'sum' (ΣC = 100 %, brevetto eq. 7-8) oppure {el, wt} (standard interno, frazione in peso nota).
     opt.selfAbs: {method:'potenza'|'elsherbini', w:{chiave riga: w in nm} o funzione(line)→w, ne}: correzione con la larghezza.
     opt.intensity: 'photons' (conteggi, predefinito) o 'energy' (spettro tarato in radianza). */
  function cf(D, meas, opt){ opt=Object.assign({mode:'saha-boltzmann', pressure:1, closure:'sum', intensity:'photons', mc:300, seed:12345}, opt||{});
    const warns=[], sb=opt.mode!=='boltzmann';
    const wOf=l=>{ const s=opt.selfAbs; if (!s || !s.w) return null; return typeof s.w==='function' ? s.w(l) : s.w[l.key]; };
    const neSA=opt.selfAbs ? (opt.selfAbs.ne||opt.ne) : null;
    let L=[]; for (const m0 of meas){ const m=Object.assign({}, m0); if (!(m.area>0) || !species(D, m.el, m.st)) continue; m.key=m.key||(m.el+' '+m.st+' '+(+m.wl).toFixed(2));
      if (!fin(Math.log(m.area*(opt.intensity==='energy'?m.wl:1)/(m.gk*m.A))) || !fin(m.Ek)) continue;   // λ, g·A o E_k mancanti: la riga non può stare sul grafico (prima un solo NaN rendeva indeterminata la pendenza)
      m.I=m.area; m.resonance=m.Ei===0; m.lowLevel=m.Ei>0 && m.Ei<0.5;
      if (opt.selfAbs){ const w=wOf(m); if (w>0 && neSA>0 && m.fL>0){ const r=selfAbsCorrect(m.area, m.fL, w, neSA, opt.selfAbs.method); if (r){ m.I=r.I0; m.SA=r.SA; } } else m.noW=true; }
      const rel=accRel(D, m.acc), sI=m.sArea>0 ? m.sArea/m.area : 0; m.sy=Math.sqrt(sI*sI+rel*rel+Math.pow(opt.sysRel||0,2)); if (!(m.sy>0)) m.sy=0.05;
      L.push(m); }
    if (opt.closure && typeof opt.closure==='object' && !L.some(l=>l.el===opt.closure.el)) warns.push({code:'closureRefMissing', el:opt.closure.el});   // standard interno senza righe misurate: si torna alla somma a 100% e lo si dice (revisione 3.1)
    if (opt.excludeResonance){ const keep=L.filter(l=>!l.resonance); if (keep.length<L.length) warns.push({code:'resonanceExcluded', n:L.length-keep.length}); L=keep; }
    else if (L.some(l=>l.resonance)) warns.push({code:'resonance', lines:L.filter(l=>l.resonance).map(l=>l.key)});
    if (opt.selfAbs && L.some(l=>l.noW)) warns.push({code:'selfAbsNoW', lines:L.filter(l=>l.noW).map(l=>l.key)});
    if (opt.selfAbs && opt.selfAbs.minSA){ const bad=L.filter(l=>l.SA!=null && l.SA<opt.selfAbs.minSA); if (bad.length){ warns.push({code:'lowSA', lines:bad.map(l=>l.key)}); L=L.filter(l=>!bad.includes(l)); } }
    const els=[...new Set(L.map(l=>l.el))];
    if (L.length<3 || !els.length) return {ok:false, why:'poche righe', warnings:warns};
    const neFixed=opt.ne>0; let ne=neFixed?opt.ne:(opt.ne0||1e18), T=opt.T0||10000, fit=null, conc=null, iter=0, conv=false;
    const project=(T, ne)=>L.map(l=>{ let x=l.Ek, y=Math.log(l.I*(opt.intensity==='energy'?l.wl:1)/(l.gk*l.A));
      if (sb && l.st==='II'){ const Ei=species(D, l.el, 'I').Eion; x+=Ei; y-=Math.log(2*SAHA_K*Math.pow(T,1.5)/ne); }
      return {g:sb?l.el:(l.el+' '+l.st), x, y, sy:l.sy, line:l}; });
    function concentrations(q, T, ne){ const out={};
      for (const el of els){ const R=sahaRatio(D, el, T, ne); let FI=null, FII=null;
        if (sb){ if (q[el]==null) continue; FI=partition(D, el, 'I', T)*Math.exp(q[el]); FII=R!=null?FI*R:0; }
        else { if (q[el+' I']!=null) FI=partition(D, el, 'I', T)*Math.exp(q[el+' I']); if (q[el+' II']!=null) FII=partition(D, el, 'II', T)*Math.exp(q[el+' II']);
          if (FI==null && FII!=null) FI=R>0?FII/R:0; if (FII==null && FI!=null) FII=R!=null?FI*R:0; }
        out[el]={FI, FII, F:FI+FII, ionFrac:(FI+FII)>0?FII/(FI+FII):0}; }
      return out; }
    function closure(c){ const tot=Object.values(c).reduce((s,v)=>s+v.F,0), M=D.mass||{}; const mol={}, wt={};
      for (const el of Object.keys(c)) mol[el]=c[el].F/tot;
      if (opt.closure && typeof opt.closure==='object' && c[opt.closure.el]){ const r=opt.closure.el, Mr=M[r]||1; for (const el of Object.keys(c)) wt[el]=opt.closure.wt*(c[el].F*(M[el]||1))/(c[r].F*Mr);
        const sw=Object.values(wt).reduce((s,v)=>s+v,0); return {mol, wt, sumWt:sw}; }
      const sm=Object.keys(c).reduce((s,el)=>s+mol[el]*(M[el]||1),0); for (const el of Object.keys(c)) wt[el]=mol[el]*(M[el]||1)/sm; return {mol, wt, sumWt:1}; }
    for (iter=0; iter<200; iter++){
      const pts=project(T, ne); fit=jointFit(pts); if (!fit || !(fit.m<0)) return {ok:false, why:'pendenza del grafico di Boltzmann non negativa o indeterminata', warnings:warns, points:pts};
      const Tn=-1/(KB*fit.m); if (!(Tn>1500 && Tn<1e5)) return {ok:false, why:'temperatura fuori intervallo ('+Math.round(Tn)+' K)', warnings:warns, points:pts};
      conc=concentrations(fit.q, Tn, ne); let neN=ne;
      if (!neFixed){ const cl=closure(conc), Ntot=opt.pressure*ATM/(K_SI*Tn)*1e-6; let X=0; for (const el of Object.keys(conc)) X+=cl.mol[el]*conc[el].ionFrac; neN=Math.max(1e12, Ntot*X/(1+X)); }
      const dT=Math.abs(Tn-T)/T, dn=Math.abs(neN-ne)/ne; T=sb||!neFixed?0.5*T+0.5*Tn:Tn; if (!neFixed) ne=Math.sqrt(ne*neN);
      if (dT<1e-7 && dn<1e-6){ T=Tn; conv=true; break; } }
    if (!conv) warns.push({code:'noConvergence'});
    const pts=project(T, ne); fit=jointFit(pts); if (!fit || !(fit.m<0)) return {ok:false, why:'pendenza del grafico di Boltzmann non negativa alla fine delle iterazioni', warnings:warns, points:pts};   // revisione 3.1: T negativa impossibile
    T=-1/(KB*fit.m); conc=concentrations(fit.q, T, ne); const cl=closure(conc);
    const sT=Math.sqrt(fit.cov[0])/(KB*fit.m*fit.m);
    if (fit.spread<1) warns.push({code:'narrowEk', spread:fit.spread});
    if (T<(D.Tgrid?D.Tgrid[0]:3000) || T>(D.Tgrid?D.Tgrid[D.Tgrid.length-1]:30000)) warns.push({code:'Toutside'});
    // incertezze: Monte Carlo sui parametri della regressione (pendenza e intercette, con la loro covarianza) e, se dichiarata, su n_e
    const R=rng(opt.seed), np=1+fit.groups.length, Lc=cholesky(fit.cov, np), mean=[fit.m].concat(fit.groups.map(g=>fit.q[g])), acc={};
    for (const el of Object.keys(conc)) acc[el]={m:[], w:[]};
    const Ts=[];
    for (let s=0; s<opt.mc; s++){ const z=Array.from({length:np}, ()=>R.normal()), th=mean.map((v,i)=>{ let d=0; for (let j=0;j<=i;j++) d+=Lc[i*np+j]*z[j]; return v+d; });
      if (!(th[0]<0)) continue; const Ts1=-1/(KB*th[0]), ne1=opt.sne>0 ? Math.max(1e12, ne*(1+opt.sne/ne*R.normal())) : ne; const q={}; fit.groups.forEach((g,i)=>{ q[g]=th[1+i]; });
      const c=concentrations(q, Ts1, ne1), k=closure(c); Ts.push(Ts1); for (const el of Object.keys(acc)) if (k.mol[el]!=null){ acc[el].m.push(k.mol[el]); acc[el].w.push(k.wt[el]); } }
    const sd=a=>{ if (a.length<2) return NaN; const m=a.reduce((s,v)=>s+v,0)/a.length; return Math.sqrt(a.reduce((s,v)=>s+(v-m)*(v-m),0)/(a.length-1)); };
    const elements=Object.keys(conc).map(el=>({el, mol:cl.mol[el], sMol:sd(acc[el].m), wt:cl.wt[el], sWt:sd(acc[el].w), FI:conc[el].FI, FII:conc[el].FII, ionFrac:conc[el].ionFrac,
      species:[...new Set(L.filter(l=>l.el===el).map(l=>l.st))], nLines:L.filter(l=>l.el===el).length})).sort((a,b)=>b.wt-a.wt);
    // n_e dall'equilibrio di Saha, dove un elemento ha righe di entrambi gli stadi (solo nel grafico di Boltzmann per specie)
    const neSaha=[]; if (!sb) for (const el of els) if (fit.q[el+' I']!=null && fit.q[el+' II']!=null){ const FI=partition(D, el, 'I', T)*Math.exp(fit.q[el+' I']), FII=partition(D, el, 'II', T)*Math.exp(fit.q[el+' II']);
      const S=sahaRatio(D, el, T, 1); neSaha.push({el, ne:S*FI/FII}); }
    for (const e of elements) if (e.species.length===1) warns.push({code:'oneStage', el:e.el, st:e.species[0]});
    for (const e of elements) if (e.nLines<2) warns.push({code:'oneLine', el:e.el});
    const pointsOut=pts.map(p=>({g:p.g, el:p.line.el, st:p.line.st, wl:p.line.wl, key:p.line.key, Ek:p.line.Ek, Ei:p.line.Ei, x:p.x, y:p.y, sy:p.sy, yFit:fit.m*p.x+fit.q[p.g], res:p.y-(fit.m*p.x+fit.q[p.g]), resonance:p.line.resonance, SA:p.line.SA}));
    const mw=mcWhirter(D, elements.flatMap(e=>e.species.map(st=>[e.el, st])), T, ne);
    if (opt.closure==='sum') warns.push({code:'closure'});
    warns.push({code:'response'}); if (!mw.ok) warns.push({code:'mcwhirterFail', neMin:mw.neMin}); else warns.push({code:'mcwhirterOnlyNecessary'});
    return {ok:true, version:VERSION, mode:sb?'saha-boltzmann':'boltzmann', T, sT, ne, neSource:neFixed?(opt.neSource||'given'):'iterated', neFixed, iterations:iter, converged:conv,
      fit:{m:fit.m, q:fit.q, cov:fit.cov, chi2r:fit.chi2r, dof:fit.dof, scaled:fit.scaled, spread:fit.spread}, points:pointsOut, elements, sumWt:cl.sumWt, neSaha, mcWhirter:mw, warnings:warns, Tmc:sd(Ts)}; }

  /* Criterio di McWhirter: n_e (cm⁻³) > 1,6·10¹²·T^{1/2}·ΔE³ (T in K, ΔE in eV: gap massimo fra livelli adiacenti, di solito
     fondamentale → primo eccitato). Cristoforetti et al. 2010, doi:10.1016/j.sab.2009.11.005, eq. 12: condizione NECESSARIA ma
     NON SUFFICIENTE (plasma stazionario e omogeneo); gli autori raccomandano di non usarlo da solo. ΔE da libs-data.js (dEmax). */
  function mcWhirter(D, list, T, ne){ let dE=0, who=null; for (const [el,st] of list){ const sp=species(D, el, st); if (sp && sp.dEmax>dE){ dE=sp.dEmax; who=el+' '+st; } }
    const neMin=1.6e12*Math.sqrt(T)*dE*dE*dE; return {ok:ne>neMin, neMin, dE, species:who, ne, T}; }

  /* ---------------- scelta delle righe e analisi completa di uno spettro ----------------
     Righe candidate: quelle di libs-data.js degli elementi scelti (stadi I e II) nell'intervallo misurato. Si scartano le coppie
     più vicine di opt.sepMin (non separabili), si adattano le altre e si tengono quelle con SNR ≥ opt.snrMin e centro entro opt.maxShift. */
  function candidates(D, elements, x0, x1, opt){ opt=opt||{}; const out=[]; const pad=0.5;
    for (const el of elements) for (const st of ['I','II']) for (const l of linesOf(D, el, st)) if (l.wl>x0+pad && l.wl<x1-pad && (!opt.minAcc || accRel(D,l.acc)<=accRel(D,opt.minAcc))) out.push(l);
    out.sort((a,b)=>a.wl-b.wl); const sep=opt.sepMin!=null?opt.sepMin:Math.max(0.6*((opt.fwhmG||0.05)+(opt.fL0||0.03)), 0.02), bad=new Set();
    // multipletti non risolti della stessa specie (Zn I 330,26/330,29; 334,50/334,56/334,59…): una riga sola con g·A sommato ed E_k medio pesato con g·A,
    // pratica comune in CF-LIBS; solo se i livelli superiori differiscono meno di 0,1 eV (così l'errore sul grafico di Boltzmann resta sotto il 10% a 1 eV).
    // Prima venivano scartati come sovrapposti e lo Zn risultava 0 senza avviso (validazione sui bronzi, 3.1)
    if (opt.mergeMultiplets!==false) for (let i=1;i<out.length;i++){ const a=out[i-1], b=out[i];
      if (b.wl-a.wl<sep && a.el===b.el && a.st===b.st && Math.abs(a.Ek-b.Ek)<0.1){ const ga=a.gk*a.A, gb=b.gk*b.A, g=ga+gb;
        out.splice(i-1, 2, Object.assign({}, a, {wl:(a.wl*ga+b.wl*gb)/g, Ek:(a.Ek*ga+b.Ek*gb)/g, gk:1, A:g, parts:(a.parts||[a]).concat(b.parts||[b]), merged:true, acc:accRel(D,a.acc)>=accRel(D,b.acc)?a.acc:b.acc})); i--; } }
    for (let i=1;i<out.length;i++) if (out[i].wl-out[i-1].wl<sep){ bad.add(i); bad.add(i-1); }
    return {lines:out.filter((l,i)=>!bad.has(i)), blended:out.filter((l,i)=>bad.has(i))}; }
  function analyze(D, xs, ys, opt){ opt=Object.assign({snrMin:8, maxShift:0.03, mode:'saha-boltzmann'}, opt||{}); const t0=Date.now();
    if (xs.length>1 && xs[0]>xs[xs.length-1]){ xs=Array.from(xs).reverse(); ys=Array.from(ys).reverse(); }
    const els=(opt.elements||[]).filter(e=>e!=='H' && species(D, e, 'I'));
    const C=candidates(D, els, xs[0], xs[xs.length-1], opt), fits=fitLines(xs, ys, C.lines.map(l=>l.wl), {fwhmG:opt.fwhmG, maxShift:opt.maxShift, win:opt.win, fL0:opt.fL0});
    const meas=[], rejected=[];
    C.lines.forEach((l,i)=>{ const f=fits[i]; const m=Object.assign({}, l, f||{}); if (!f || !(f.area>0) || f.snr<opt.snrMin || f.atBound){ m.why=!f?'fit':f.atBound?'bound':'snr'; rejected.push(m); } else meas.push(m); });
    // righe molto più larghe della mediana: di solito una riga non elencata sotto il profilo (o un fit sbagliato), si scartano
    { const med=meas.map(m=>m.fL).sort((a,b)=>a-b)[meas.length>>1]||0; for (let i=meas.length-1;i>=0;i--) if (med>0 && meas[i].fL>(opt.wideFactor||4)*med+0.01){ meas[i].why='wide'; rejected.push(meas[i]); meas.splice(i,1); } }
    const neBad=opt.ne!=null && !(opt.ne>0); if (neBad) opt=Object.assign({}, opt, {ne:null});   // n_e data ma non positiva: si ignora e lo si dice
    let ne=opt.ne||null, sne=opt.sne||null, neInfo=null, neSource=opt.ne?'given':null;
    if (!ne && (opt.neFrom==='Halpha' || opt.neFrom==='Hbeta')){ neInfo=neFromHydrogen(xs, ys, opt.neFrom==='Hbeta'?'beta':'alpha', {fwhmG:opt.fwhmG}); if (neInfo.ok){ ne=neInfo.ne; sne=neInfo.sne; neSource=opt.neFrom; } }
    if (!ne && opt.neFrom==='line' && opt.neLine){ const f=fitLines(xs, ys, [opt.neLine.wl], {fwhmG:opt.fwhmG, maxShift:opt.maxShift})[0]; if (f && f.area>0){ ne=neFromStark(f.fL, opt.neLine.w); sne=ne*(f.sfL/f.fL); neSource='line'; neInfo={ok:true, ne, sne, line:opt.neLine, fit:f}; } }
    const selfAbs=opt.selfAbs ? Object.assign({}, opt.selfAbs, {ne:opt.selfAbs.ne||ne}) : null;
    const res=cf(D, meas, Object.assign({}, opt, {ne, sne, neSource, selfAbs}));
    if (neBad){ res.warnings=res.warnings||[]; res.warnings.push({code:'neInvalid'}); }
    { const noL=(opt.elements||[]).filter(e=>e!=='H' && !meas.some(m=>m.el===e)); if (noL.length){ res.warnings=res.warnings||[]; res.warnings.push({code:'noLines', els:noL, noData:noL.filter(e=>!species(D, e, 'I') || !linesOf(D, e, 'I').concat(linesOf(D, e, 'II')).length)}); } }
    return Object.assign(res, {lines:meas, rejected, blended:C.blended, neInfo, ms:Date.now()-t0}); }

  /* ---------------- spettri LIBS sintetici (stesso modello) ----------------
     Plasma omogeneo in LTE: Saha (stadi I e II) e Boltzmann; profili Lorentziani di Stark (Δλ = 2w n_e/10¹⁶; per Hα e Hβ le FWHM di
     Gigosos 2003, vedi sopra) convoluti con la Gaussiana strumentale; Doppler trascurato. Con opt.L (cm) trasporto radiativo in una
     lastra omogenea: I(λ) = B(λ,T)·(1 − e^{−τ(λ)}), τ = Σ κ L, κ = λ⁴/(8πc)·(g_k/g_i)·A_ki·N_i·(1 − e^{−hc/λkT})·φ(λ); senza L
     plasma otticamente sottile (I = Σ ε φ). Intensità in fotoni (conteggi). Rumore di Poisson con seme.
     Coefficienti Stark w: NON sono dati misurati; se opt.stark non è dato si usa una regola sintetica (w = 0,003 nm per I e
     0,006 nm per II a 400 nm, ∝ λ²) che serve solo ai test. */
  function syntheticW(l){ return (l.st==='I'?0.003:0.006)*Math.pow(l.wl/400, 2); }
  function synth(D, opt){ opt=Object.assign({wl:[200,900], step:0.01, oversample:4, fwhmG:0.05, T:10000, ne:1e17, pressure:1, peakCounts:5e4, background:50, noise:true, seed:1, basis:'weight'}, opt||{});
    const T=opt.T, kT=KB*T, comp=opt.comp, M=D.mass||{};
    let tot=0; const mol={}; for (const el of Object.keys(comp)){ const v=opt.basis==='weight'?comp[el]/(M[el]||1):comp[el]; mol[el]=v; tot+=v; } for (const el of Object.keys(mol)) mol[el]/=tot;
    const wt={}; { let s=0; for (const el of Object.keys(mol)) s+=mol[el]*(M[el]||1); for (const el of Object.keys(mol)) wt[el]=mol[el]*(M[el]||1)/s; }
    // opt.ne==='lte': n_e coerente con la neutralità di carica alla pressione opt.pressure (stessa ipotesi dell'iterazione di cf)
    let ne=opt.ne; if (ne==='lte'){ const Nall=opt.pressure*ATM/(K_SI*T)*1e-6; ne=1e17; for (let i=0;i<200;i++){ let X=0; for (const el of Object.keys(mol)){ const R=sahaRatio(D, el, T, ne)||0; X+=mol[el]*R/(1+R); } const n2=Nall*X/(1+X); if (Math.abs(n2-ne)<1e-9*ne){ ne=n2; break; } ne=Math.sqrt(ne*n2); } }
    const Ntot=opt.Ntot||Math.max(1, opt.pressure*ATM/(K_SI*T)*1e-6-ne);   // particelle pesanti per cm³
    const dens={}; for (const el of Object.keys(mol)) dens[el]=Ntot*mol[el]; if (opt.ambient) for (const el of Object.keys(opt.ambient)) dens[el]=(dens[el]||0)+opt.ambient[el];
    const lines=[];
    for (const el of Object.keys(dens)){ const R=sahaRatio(D, el, T, ne)||0, NI=dens[el]/(1+R), NII=dens[el]*R/(1+R);
      for (const st of ['I','II']){ const N=st==='I'?NI:NII, U=partition(D, el, st, T); if (!U) continue;
        for (const l of linesOf(D, el, st)){ if (l.wl<opt.wl[0]-2 || l.wl>opt.wl[1]+2) continue;
          let fL; if (el==='H' && Math.abs(l.wl-H_ALPHA)<0.1) fL=fwhmHalpha(ne); else if (el==='H' && Math.abs(l.wl-H_BETA)<0.1) fL=fwhmHbeta(ne); else if (el==='H') continue;
          else { const w=opt.stark ? (typeof opt.stark==='function'?opt.stark(l):opt.stark[l.key]) : syntheticW(l); fL=2*(w>0?w:syntheticW(l))*ne/1e16; l.w=w>0?w:syntheticW(l); }
          const Ni=N*l.gi*Math.exp(-l.Ei/kT)/U, eps=l.A*l.gk*N*Math.exp(-l.Ek/kT)/U/(4*Math.PI);   // fotoni s⁻¹ cm⁻³ sr⁻¹
          const lam=l.wl*1e-7, x=H_SI*C_SI/(lam*1e-2*K_SI*T), kap=Math.pow(lam,4)/(8*Math.PI*C_SI*100)*(l.gk/l.gi)*l.A*Ni*(1-Math.exp(-x));   // cm⁻¹ · cm (× φ in cm⁻¹)
          lines.push(Object.assign(l, {fL, eps, kap, N})); } } }
    const h=opt.step/opt.oversample, x0=opt.wl[0], nOut=Math.round((opt.wl[1]-opt.wl[0])/opt.step)+1, pad=Math.ceil(4*opt.fwhmG/h)+2, nF=(nOut-1)*opt.oversample+1+2*pad;
    const xf=new Float64Array(nF); for (let i=0;i<nF;i++) xf[i]=x0+(i-pad)*h;
    const thick=opt.L>0, Lc=thick?opt.L:1, acc=new Float64Array(nF);   // τ (spesso) oppure Σ ε φ (sottile), φ in nm⁻¹
    for (const l of lines){ const g=l.fL/2, W=Math.min(Math.max(400*g, 1), 8), a=Math.max(0, Math.floor((l.wl-W-xf[0])/h)), b=Math.min(nF-1, Math.ceil((l.wl+W-xf[0])/h));
      const amp=thick ? l.kap*Lc*1e7 : l.eps;   // φ in nm⁻¹ → per κ serve cm⁻¹: ×10⁷
      for (let i=a;i<=b;i++){ const d=xf[i]-l.wl; acc[i]+=amp*(g/Math.PI)/(d*d+g*g); }
      l.areaThin=l.eps*Lc; }   // fotoni s⁻¹ cm⁻² sr⁻¹ (integrale sul profilo, sottile)
    const I=new Float64Array(nF);
    if (thick) for (let i=0;i<nF;i++){ const lam=xf[i]*1e-7, x=H_SI*C_SI/(lam*1e-2*K_SI*T), Bp=2*C_SI*100/Math.pow(lam,4)/(Math.exp(x)-1)*1e-7; I[i]=Bp*(1-Math.exp(-acc[i])); }   // fotoni s⁻¹ cm⁻² sr⁻¹ nm⁻¹
    else for (let i=0;i<nF;i++) I[i]=acc[i];
    // convoluzione con la Gaussiana strumentale (area 1)
    const s=opt.fwhmG/F2S, kh=Math.ceil(4*s/h), ker=new Float64Array(2*kh+1); let ks=0; for (let j=-kh;j<=kh;j++){ ker[j+kh]=Math.exp(-(j*h)*(j*h)/(2*s*s)); ks+=ker[j+kh]; } for (let j=0;j<ker.length;j++) ker[j]/=ks;
    const xs=new Float64Array(nOut), clean=new Float64Array(nOut);
    for (let o=0;o<nOut;o++){ const i=pad+o*opt.oversample; let v=0; for (let j=-kh;j<=kh;j++){ const t=i+j; if (t>=0 && t<nF) v+=ker[j+kh]*I[t]; } xs[o]=x0+o*opt.step; clean[o]=v*(opt.response?opt.response(xs[o]):1); }
    let mx=0; for (let o=0;o<nOut;o++) if (clean[o]>mx) mx=clean[o]; const scale=opt.scale||(mx>0?opt.peakCounts/mx:1);
    const R=rng(opt.seed), ys=new Float64Array(nOut);
    for (let o=0;o<nOut;o++){ const lam=clean[o]*scale+opt.background; ys[o]=opt.noise?R.poisson(lam):lam; }
    const truthLines=lines.filter(l=>l.wl>=opt.wl[0] && l.wl<=opt.wl[1]).map(l=>({key:l.key, el:l.el, st:l.st, wl:l.wl, fL:l.fL, w:l.w, areaThin:l.areaThin*scale*(opt.response?opt.response(l.wl):1), Ei:l.Ei, tau0:thick?l.kap*Lc*1e7*(2/(Math.PI*l.fL)):0}));
    return {x:xs, y:ys, scale, truth:{T, ne, mol, wt, Ntot, L:opt.L||0, fwhmG:opt.fwhmG, lines:truthLines}}; }

  return {VERSION, KB, SAHA_K, rng, solve, inverse, species, partition, linesOf, elementsIn, sahaRatio, voigt, humlicek, oliveroFwhm, lorentzFromVoigt,
    fitLines, neFromStark, neHalpha, neHbeta, fwhmHalpha, fwhmHbeta, neFromHydrogen, H_ALPHA, H_BETA, saFromWidth, selfAbsCorrect, SA_ALPHA, SA_BETA, SA_EXP,
    jointFit, boltzmannPlot, cf, mcWhirter, candidates, analyze, syntheticW, synth};
});
