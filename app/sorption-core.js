// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Fisisorbimento e chemisorbimento (Anton Paar Autosorb 6300, Kaomi for Autosorb, ASiQwin): parte pura, senza DOM.
   Fa parte del nucleo scientifico: gira nel browser, nel desktop (anche in un worker) e in Node per i test.
   Specifica: ~/build/c27/autosorb/SPEC.md. Le unità interne sono fisse: quantità in cm³ STP/g (273,15 K, 101,325 kPa),
   pressioni in Pa, spessori e raggi in Å, aree in m²/g, volumi di liquido in cm³/g, energie in kJ/mol.
   Etichette nei commenti: DEDOTTO = non confermato da file reali di Kaomi. */
(function(root, factory){
  if (typeof module==='object' && module.exports) module.exports=factory();
  else root.SorpCore=factory();
})(typeof globalThis!=='undefined' ? globalThis : this, function(){
  'use strict';
  const NA=6.02214076e23, R=8.314462618;
  // volume molare dei gas ideali in condizioni STP: Kaomi usa 273,15 K e 1 atm (verificato sul report pubblico, SPEC §1)
  const VMOL={stp:22414.0, iupac:22710.95};
  const P_UNITS={pa:1, kpa:1e3, mpa:1e6, bar:1e5, mbar:100, torr:101325/760, mmhg:133.322387415, atm:101325, psi:6894.757293168};

  /* ---------------- adsorbati: valori predefiniti, sempre sostituiti da quelli del file o dell'utente ----------------
     σ in nm², densità del liquido in g/cm³, tensione superficiale in mN/m (= erg/cm²), temperatura in K. */
  const ADSORBATES={
    N2:{name:'N₂', M:28.0134, sigma:0.162, rhoL:0.806, gamma:8.85, T:77.35, src:'ISO 9277:2022 (σ); ρ e γ come nel report pubblico di Kaomi 2.02'},
    Ar:{name:'Ar', M:39.948, sigma:0.142, rhoL:1.40, gamma:12.6, T:87.27, src:'ISO 9277:2022 (σ); ρ come ASiQwin 3.0; γ DEDOTTO dalla letteratura, da verificare'},
    Kr:{name:'Kr', M:83.798, sigma:0.202, rhoL:null, gamma:null, T:77.35, src:'ISO 9277:2022 (σ); solo BET'},
    CO2:{name:'CO₂', M:44.0095, sigma:0.210, rhoL:0.928, gamma:4.6, T:273.15, beta:0.35, src:'σ, γ e β DEDOTTI dalla letteratura (Dubinin): da verificare'},
    O2:{name:'O₂', M:31.998, sigma:0.141, rhoL:1.14, gamma:null, T:90.19, src:'DEDOTTO, da verificare'}
  };
  function gasKey(s){
    const t=String(s||'').toLowerCase().replace(/^\s*\d+\s*:\s*/,'').replace(/[\s_-]/g,'');
    if (/^n2|nitrog|azoto|stickstoff|azote|nitr[oó]geno/.test(t)) return 'N2';
    if (/^ar(87|gon|gon87)?\b|^ar$|argon/.test(t)) return 'Ar';
    if (/^kr|krypt|kripto/.test(t)) return 'Kr';
    if (/^co2|carbondioxide|anidridecarbonica|biossidodicarbonio|kohlendioxid/.test(t)) return 'CO2';
    if (/^o2|oxygen|ossigeno/.test(t)) return 'O2';
    return null;
  }

  /* ---------------- utilità numeriche ---------------- */
  const fin=v=>typeof v==='number' && Number.isFinite(v);
  function linfit(X, Y){   // minimi quadrati con somme centrate: errori standard, r
    const n=X.length; if (n<2) return null; let mx=0, my=0; for (let i=0;i<n;i++){ mx+=X[i]; my+=Y[i]; } mx/=n; my/=n;
    let sxx=0, sxy=0, syy=0; for (let i=0;i<n;i++){ const dx=X[i]-mx, dy=Y[i]-my; sxx+=dx*dx; sxy+=dx*dy; syy+=dy*dy; }
    if (!(sxx>0)) return null;
    const slope=sxy/sxx, icpt=my-slope*mx; let sse=0; for (let i=0;i<n;i++){ const e=Y[i]-icpt-slope*X[i]; sse+=e*e; }
    const s2=n>2?sse/(n-2):NaN, seS=Math.sqrt(s2/sxx), seI=Math.sqrt(s2*(1/n+mx*mx/sxx));
    const r=syy>0?sxy/Math.sqrt(sxx*syy):1;
    return {slope, icpt, r, r2:r*r, seS, seI, n, sse, mx, sxx};
  }
  function solve(A, b){   // Gauss con pivot parziale, A quadrata (copiata)
    const n=b.length, M=A.map((r,i)=>r.slice().concat([b[i]]));
    for (let c=0;c<n;c++){ let p=c; for (let r=c+1;r<n;r++) if (Math.abs(M[r][c])>Math.abs(M[p][c])) p=r; if (!(Math.abs(M[p][c])>1e-300)) return null;
      [M[c],M[p]]=[M[p],M[c]]; for (let r=0;r<n;r++){ if (r===c) continue; const k=M[r][c]/M[c][c]; if (k) for (let q=c;q<=n;q++) M[r][q]-=k*M[c][q]; } }
    return M.map((r,i)=>r[n]/r[i]);
  }
  function invert(A){ const n=A.length, out=[]; for (let j=0;j<n;j++){ const e=new Array(n).fill(0); e[j]=1; const c=solve(A,e); if (!c) return null; out.push(c); } return A.map((_,i)=>out.map(c=>c[i])); }
  function lsq(rows, y){   // minimi quadrati generici: rows = vettori dei regressori; covarianza dei coefficienti
    const p=rows[0].length, A=Array.from({length:p},()=>new Array(p).fill(0)), b=new Array(p).fill(0);
    rows.forEach((r,i)=>{ for (let a=0;a<p;a++){ b[a]+=r[a]*y[i]; for (let c=0;c<p;c++) A[a][c]+=r[a]*r[c]; } });
    const coef=solve(A,b); if (!coef) return null; let sse=0; rows.forEach((r,i)=>{ let v=0; for (let a=0;a<p;a++) v+=r[a]*coef[a]; sse+=(y[i]-v)**2; });
    const dof=rows.length-p, s2=dof>0?sse/dof:NaN, Ai=invert(A), cov=Ai?Ai.map(r=>r.map(v=>v*s2)):null;
    return {coef, cov, sse, dof};
  }
  function interp(xs, ys, x){   // xs crescenti
    const n=xs.length; if (!n) return NaN; if (x<=xs[0]) return n>1&&x<xs[0]?NaN:ys[0]; if (x>=xs[n-1]) return x>xs[n-1]?NaN:ys[n-1];
    let a=0, b=n-1; while (b-a>1){ const m=(a+b)>>1; if (xs[m]<=x) a=m; else b=m; }
    const t=(x-xs[a])/(xs[b]-xs[a]); return ys[a]+t*(ys[b]-ys[a]);
  }
  function sortedPairs(x, y){ const idx=x.map((_,i)=>i).filter(i=>fin(x[i])&&fin(y[i])).sort((a,b)=>x[a]-x[b]); return {x:idx.map(i=>x[i]), y:idx.map(i=>y[i])}; }
  function nnls(A, b, maxIter){   // Lawson–Hanson (1974); A: colonne
    const p=A.length, m=b.length, x=new Float64Array(p), inP=new Array(p).fill(false);
    const dot=(u,v)=>{ let s=0; for (let i=0;i<m;i++) s+=u[i]*v[i]; return s; };
    const resid=()=>{ const r=Float64Array.from(b); for (let j=0;j<p;j++) if (x[j]) for (let i=0;i<m;i++) r[i]-=x[j]*A[j][i]; return r; };
    const tol=1e-12*Math.sqrt(dot(b,b)||1)*Math.max(1,...A.map(c=>Math.sqrt(dot(c,c))));
    const ls=idx=>solve(idx.map(a=>idx.map(c=>dot(A[a],A[c])+(a===c?1e-14*dot(A[a],A[a]):0))), idx.map(a=>dot(A[a],b)));
    for (let outer=0; outer<(maxIter||3*p+20); outer++){
      const r=resid(), w=A.map(c=>dot(c,r)); let j=-1, wm=tol;
      for (let q=0;q<p;q++) if (!inP[q] && w[q]>wm){ wm=w[q]; j=q; }
      if (j<0) break; inP[j]=true;
      for (let inner=0; inner<3*p+20; inner++){
        const idx=[]; for (let q=0;q<p;q++) if (inP[q]) idx.push(q);
        const s=ls(idx); if (!s){ inP[j]=false; break; }
        if (s.every(v=>v>0)){ idx.forEach((q,i)=>x[q]=s[i]); break; }
        let alpha=1; idx.forEach((q,i)=>{ if (s[i]<=0){ const a=x[q]/((x[q]-s[i])||1e-300); if (a<alpha) alpha=a; } });
        idx.forEach((q,i)=>{ x[q]+=alpha*(s[i]-x[q]); if (x[q]<=1e-15){ x[q]=0; inP[q]=false; } });
      }
    }
    const r=resid(); let ss=0; for (const v of r) ss+=v*v; return {x:Array.from(x), ssr:ss};
  }
  function golden(f, a, b, tol){ const g=(Math.sqrt(5)-1)/2; let c=b-g*(b-a), d=a+g*(b-a), fc=f(c), fd=f(d);
    for (let i=0;i<200 && Math.abs(b-a)>(tol||1e-10)*(1+Math.abs(a)+Math.abs(b));i++){ if (fc<fd){ b=d; d=c; fd=fc; c=b-g*(b-a); fc=f(c); } else { a=c; c=d; fc=fd; d=a+g*(b-a); fd=f(d); } }
    return (a+b)/2; }

  /* ---------------- parametri di riduzione: file > libreria > utente > predefiniti ---------------- */
  function params(iso, over){
    const m=(iso&&iso.meta)||{}, o=over||{}, gk=o.gas||m.gasKey||gasKey(m.gas)||null, d=gk?ADSORBATES[gk]:null, src={};
    const pick=(k, fileV, defV)=>{ if (o[k]!=null && fin(+o[k])){ src[k]='utente'; return +o[k]; } if (fileV!=null && fin(+fileV)){ src[k]='file'; return +fileV; } if (defV!=null){ src[k]='predefinito'; return defV; } src[k]='mancante'; return null; };
    const P={gas:gk, gasName:d?d.name:(m.gas||''),
      sigma:pick('sigma', m.sigma, d&&d.sigma), M:pick('M', m.M, d&&d.M), rhoL:pick('rhoL', m.rhoL, d&&d.rhoL),
      gamma:pick('gamma', m.gamma, d&&d.gamma), T:pick('T', m.T, d&&d.T), theta:pick('theta', m.theta, 0),
      vmol:o.stp==='iupac'?VMOL.iupac:VMOL.stp, stp:o.stp==='iupac'?'iupac':'stp', thick:o.thick||m.thick||'harkins-jura', beta:pick('beta', null, d&&d.beta||null)};
    if (!o.thick && m.thick) src.thick='file'; else if (o.thick) src.thick='utente'; else src.thick='predefinito';
    P.src=src; P.liqPerStp=P.M&&P.rhoL?P.M/(P.vmol*P.rhoL):null;   // cm³ di liquido per cm³ STP
    P.Vm=P.M&&P.rhoL?P.M/P.rhoL:null;   // volume molare del liquido, cm³/mol
    return P;
  }

  /* ---------------- spessore statistico t(x) in Å ---------------- */
  const THICK={
    'harkins-jura':{name:'Harkins–Jura', f:x=>Math.sqrt(13.99/(0.034-Math.log10(x)))},
    'de-boer':{name:'de Boer (forma di Harkins–Jura)', f:x=>Math.sqrt(13.99/(0.034-Math.log10(x)))},   // DEDOTTO: le tabelle di de Boer si usano di solito nella forma HJ
    'halsey':{name:'Halsey', f:x=>3.54*Math.pow(5/Math.log(1/x), 1/3)},
    'carbon-black':{name:'Carbon Black / STSA (ASTM D6556)', f:x=>0.88*x*x+6.45*x+2.98},
    'kjs':{name:'Kruk–Jaroniec–Sayari', f:x=>Math.pow(60.65/(0.03071-Math.log10(x)), 0.3968)}
  };
  function thicknessKey(s){ const t=String(s||'').toLowerCase(); if (/carbon|stsa|astm/.test(t)) return 'carbon-black'; if (/halsey/.test(t)) return 'halsey'; if (/boer/.test(t)) return 'de-boer'; if (/kjs|kruk/.test(t)) return 'kjs'; if (/harkins|jura|hj/.test(t)) return 'harkins-jura'; return null; }
  function tOf(x, key){ const m=THICK[key]||THICK['harkins-jura']; return m.f(x); }
  // raggio di Kelvin (Å), menisco emisferico, angolo di contatto θ (desorbimento); 'cyl' = menisco cilindrico (Cohan) per l'adsorbimento
  function kelvinR(x, P, meniscus){ const k=(meniscus==='cyl'?1:2)*P.gamma*1e-3*P.Vm*1e-6*Math.cos((P.theta||0)*Math.PI/180)/(R*P.T*Math.log(1/x)); return k*1e10; }

  /* ---------------- isoterma: rami, conversioni ---------------- */
  // Divide una sequenza di misura nei due rami: si cambia ramo dove la pressione relativa inverte il verso (il massimo).
  // Il punto più alto chiude l'adsorbimento e apre il desorbimento, come nelle tabelle BJH di Kaomi (SPEC §1, ESEGUITO sul report pubblico).
  function splitBranches(x, n, marks){
    const N=x.length, ads=[], des=[];
    if (marks && marks.some(m=>m==='des')){ for (let i=0;i<N;i++) (marks[i]==='des'?des:ads).push(i); if (ads.length && des.length){ let top=ads[0]; for (const i of ads) if (x[i]>x[top]) top=i; if (x[des[0]]<x[top]) des.unshift(top); } return {ads, des, top:ads.length?ads[ads.length-1]:-1}; }
    let top=0; for (let i=1;i<N;i++) if (x[i]>x[top]) top=i;
    for (let i=0;i<=top;i++) ads.push(i);
    if (top<N-1) for (let i=top;i<N;i++) des.push(i);
    return {ads, des, top};
  }
  /* f.iso nel formato di progetto 2 (docs/FORMATO-ACCHSPETTRI.md, «iso»): p (Pa, oppure p/p₀ se unit.p è «p/p0»), p0 per punto o null,
     n in cm³ STP/g, t = temperatura in K, branches = intervalli di indici [inizio, fine). I rami in x e n si ricavano qui, con una cache. */
  const BR=typeof WeakMap!=='undefined' ? new WeakMap() : null;
  function relOf(iso){ const rel=String(iso.unit&&iso.unit.p||'')==='p/p0'; return iso.p.map((v,i)=>rel?v:(iso.p0&&fin(iso.p0[i])&&iso.p0[i]>0?v/iso.p0[i]:NaN)); }
  function branchOf(iso, which){ if (!iso || !iso.branches) return {x:[],n:[],idx:[]};
    let c=BR&&BR.get(iso); if (!c || c.p!==iso.p || c.n!==iso.n){ c={p:iso.p, n:iso.n, x:relOf(iso)}; if (BR) BR.set(iso,c); }
    if (c[which]) return c[which]; const r=iso.branches[which], idx=[]; if (Array.isArray(r)) for (let i=r[0];i<r[1];i++) idx.push(i);
    return (c[which]={x:idx.map(i=>c.x[i]), n:idx.map(i=>iso.n[i]), idx}); }
  /* costruisce f.iso da colonne grezze. q: {x?, p?, p0?, n, t?, marks?, nUnit, pUnit, mass_g, meta} */
  function buildIso(q){
    const N=q.n.length, meta=Object.assign({}, q.meta||{}), problems=[];
    const pk=P_UNITS[(q.pUnit||'').toLowerCase()]||null;
    let p=q.p?q.p.map(v=>fin(v)&&pk?v*pk:NaN):null, p0=q.p0?q.p0.map(v=>fin(v)&&pk?v*pk:NaN):null;
    if (!p0 && fin(meta.p0Pa)) p0=new Array(N).fill(meta.p0Pa);
    let x=q.x?q.x.slice():null;
    if (!x && p && p0) x=p.map((v,i)=>v/p0[i]);
    if (!x){ problems.push({lv:'stop', k:'p0', t:'Manca p₀: con la sola pressione assoluta la pressione relativa non si può calcolare'}); }
    if (x && !p && p0) p=x.map((v,i)=>v*p0[i]);
    // quantità → cm³ STP/g
    const u=String(q.nUnit||'').toLowerCase().replace(/\s+/g,'').replace(/³/g,'3').replace(/@/g,'');
    let k=null, perMass=true;
    if (/^(cm3|cc|ml)(stp)?\/g(stp)?$|^cm3\/gstp$|^cm3stp\/g$|^ccstp\/g$|^cc\/g$|^ml\/g$|^ml\(stp\)\/g$/.test(u)) k=1;
    else if (/^mmol\/g$/.test(u)) k=VMOL.stp/1000; else if (/^mol\/g$/.test(u)) k=VMOL.stp; else if (/^(µ|u)mol\/g$/.test(u)) k=VMOL.stp/1e6;
    else if (/^mol\/kg$/.test(u)) k=VMOL.stp/1000;
    else if (/^(cm3|cc|ml)(stp)?$/.test(u)){ k=1; perMass=false; } else if (/^mmol$/.test(u)){ k=VMOL.stp/1000; perMass=false; }
    else if (/^mg\/g$/.test(u) && q.M){ k=VMOL.stp/q.M/1000; }
    let n=q.n.slice();
    if (k==null){ problems.push({lv:'stop', k:'unit', t:'Unità della quantità adsorbita ambigua o sconosciuta'+(q.nUnit?` («${q.nUnit}»)`:'')}); }
    else if (!perMass){ if (fin(q.mass_g) && q.mass_g>0) n=n.map(v=>v*k/q.mass_g); else { problems.push({lv:'stop', k:'mass', t:'Manca la massa del campione: le quantità non sono normalizzate per grammo'}); n=n.map(v=>v*k); } }
    else n=n.map(v=>v*k);
    if (fin(q.mass_g)) meta.mass_g=q.mass_g;
    meta.nUnitFile=q.nUnit||''; meta.pUnitFile=q.pUnit||'';
    // solo i punti leggibili (numeri finiti); i rami diventano due blocchi contigui, adsorbimento poi desorbimento
    const xs=x||new Array(N).fill(NaN), keep=[]; for (let i=0;i<N;i++) if (fin(xs[i]) && fin(n[i])) keep.push(i);
    if (keep.length<N && x) problems.push({lv:'warn', k:'skip', t:`${N-keep.length} righe senza p/p₀ o quantità leggibili sono state ignorate`});
    const kx=keep.map(i=>xs[i]), kn=keep.map(i=>n[i]), km=q.marks?keep.map(i=>q.marks[i]):null, sp=splitBranches(kx, kn, km);
    const last=sp.ads[sp.ads.length-1], shared=sp.des.length>0 && sp.des[0]===last, dRest=shared?sp.des.slice(1):sp.des, order=sp.ads.concat(dRest).map(k=>keep[k]), A=sp.ads.length;
    const absP=!!(p && p0), time=q.t&&q.t.length===N?order.map(i=>q.t[i]):null;
    if (time) meta.time=time;
    const iso={p:order.map(i=>absP?p[i]:xs[i]), p0:absP?order.map(i=>p0[i]):null, n:order.map(i=>n[i]), t:fin(meta.T)?+meta.T:null,
      branches:{ads:A?[0,A]:null, des:dRest.length?[shared?A-1:A, A+dRest.length]:null}, unit:{p:absP?'Pa':'p/p0', p0:'Pa', n:'cm3 STP/g', t:'K'}, meta, problems};
    if (meta.gas && !meta.gasKey) meta.gasKey=gasKey(meta.gas);
    return iso;
  }
  const toMmol=v=>v/VMOL.stp*1000;

  /* ---------------- BET (ISO 9277:2022) e criteri di Rouquerol ---------------- */
  function betFit(x, n, i0, i1){
    const X=[], Y=[]; for (let i=i0;i<=i1;i++){ X.push(x[i]); Y.push(x[i]/(n[i]*(1-x[i]))); }
    const L=linfit(X, Y); if (!L) return null;
    const nm=1/(L.slope+L.icpt), C=1+L.slope/L.icpt;
    return {i0, i1, npts:i1-i0+1, x0:x[i0], x1:x[i1], slope:L.slope, icpt:L.icpt, r:L.r, seS:L.seS, seI:L.seI, nm, C, xm:C>0?1/(Math.sqrt(C)+1):NaN, X, Y};
  }
  function betArea(nm, P){ return P&&P.sigma ? nm/P.vmol*NA*P.sigma*1e-18 : NaN; }
  // x in cui l'isoterma vale n_m (interpolazione lineare sul ramo di adsorbimento)
  function xAtN(x, n, target){ for (let i=1;i<n.length;i++) if ((n[i-1]-target)*(n[i]-target)<=0 && n[i]!==n[i-1]) return x[i-1]+(target-n[i-1])*(x[i]-x[i-1])/(n[i]-n[i-1]); return NaN; }
  function rouquerolCheck(fit, x, n){
    const c={};
    let mono=true; for (let i=fit.i0+1;i<=fit.i1;i++) if (n[i]*(1-x[i])<=n[i-1]*(1-x[i-1])) mono=false;
    c.a=mono; c.b=fit.C>0 && fit.icpt>0;
    c.c=c.b && fit.xm>=fit.x0 && fit.xm<=fit.x1;
    const xn=c.b?xAtN(x, n, fit.nm):NaN; c.xAtNm=xn; c.d=c.b && fin(xn) && Math.abs(xn-fit.xm)<=0.1*fit.xm;
    c.ok=c.a&&c.b&&c.c&&c.d; return c;
  }
  /* scelta automatica: tutte le finestre di punti consecutivi; vince la più ampia, a pari merito r maggiore (come BETSI) */
  function betAuto(iso, opt){
    opt=opt||{}; const A=branchOf(iso,'ads'), minP=opt.minPts||3, all=[], valid=[];
    const idx=A.x.map((_,i)=>i).filter(i=>A.x[i]>0 && A.x[i]<1 && A.n[i]>0 && (opt.xmax==null || A.x[i]<=opt.xmax));
    if (idx.length<minP) return {err:'pochi', fits:[], valid:[]};
    const x=idx.map(i=>A.x[i]), n=idx.map(i=>A.n[i]);
    for (let i0=0;i0<x.length;i0++) for (let i1=i0+minP-1;i1<x.length;i1++){ const F=betFit(x,n,i0,i1); if (!F) continue; F.crit=rouquerolCheck(F,x,n); all.push(F); if (F.crit.ok) valid.push(F); }
    valid.sort((a,b)=>b.npts-a.npts || b.r-a.r || a.x0-b.x0);
    const best=valid[0]||null; if (best){ best.i0=idx[best.i0]; best.i1=idx[best.i1]; }
    return {best, valid, nAll:all.length, x, n};
  }
  function betAt(iso, x0, x1, P){   // BET su un intervallo dato (strumento o utente)
    const A=branchOf(iso,'ads'), idx=A.x.map((_,i)=>i).filter(i=>A.x[i]>=x0-1e-9 && A.x[i]<=x1+1e-9 && A.n[i]>0);
    if (idx.length<2) return null; const x=idx.map(i=>A.x[i]), n=idx.map(i=>A.n[i]), F=betFit(x,n,0,x.length-1); if (!F) return null;
    F.crit=rouquerolCheck(F,x,n); F.area=betArea(F.nm,P); F.i0=idx[0]; F.i1=idx[idx.length-1]; return F;
  }
  function bet(iso, P, opt){
    opt=opt||{}; const out={P, warn:[]};
    const au=betAuto(iso, opt); out.auto=au.best; out.alternatives=(au.valid||[]).slice(1,6);
    if (au.best) au.best.area=betArea(au.best.nm,P); (out.alternatives||[]).forEach(F=>F.area=betArea(F.nm,P));
    if (opt.range) out.user=betAt(iso, opt.range[0], opt.range[1], P);
    const ib=iso.meta && iso.meta.instrBET; if (ib && fin(ib.x0) && fin(ib.x1)) out.instr=betAt(iso, ib.x0, ib.x1, P);
    out.used=out.user||out.auto||null;
    if (out.used && out.instr && out.instr.area>0) out.diffInstrPct=100*(out.used.area-out.instr.area)/out.instr.area;
    return out;
  }

  /* ---------------- Langmuir (lineare e non lineare) ---------------- */
  function langmuir(iso, P, range){
    const A=branchOf(iso,'ads'), r=range||[0.05,0.3], idx=A.x.map((_,i)=>i).filter(i=>A.x[i]>=r[0] && A.x[i]<=r[1] && A.n[i]>0 && A.x[i]>0);
    if (idx.length<3) return {err:'pochi'};
    const x=idx.map(i=>A.x[i]), n=idx.map(i=>A.n[i]), L=linfit(x, x.map((v,i)=>v/n[i])); if (!L) return {err:'fit'};
    const nmL=1/L.slope, KL=L.slope/L.icpt;
    // non lineare: Gauss–Newton con smorzamento di Levenberg–Marquardt su n = nm K x/(1+Kx)
    let nm=nmL, K=KL>0?KL:1, lam=1e-3, sse=Infinity; const f=(a,b)=>{ let s=0; for (let i=0;i<x.length;i++){ const e=n[i]-a*b*x[i]/(1+b*x[i]); s+=e*e; } return s; };
    sse=f(nm,K);
    for (let it=0; it<200; it++){
      let J11=0,J12=0,J22=0,g1=0,g2=0; for (let i=0;i<x.length;i++){ const d=1+K*x[i], m=nm*K*x[i]/d, e=n[i]-m, j1=K*x[i]/d, j2=nm*x[i]/(d*d); J11+=j1*j1; J12+=j1*j2; J22+=j2*j2; g1+=j1*e; g2+=j2*e; }
      const a11=J11*(1+lam), a22=J22*(1+lam), det=a11*a22-J12*J12; if (!(Math.abs(det)>0)) break;
      const d1=(g1*a22-g2*J12)/det, d2=(a11*g2-J12*g1)/det, s2=f(nm+d1, K+d2);
      if (s2<sse){ const conv=Math.abs(d1)<1e-13*Math.abs(nm) && Math.abs(d2)<1e-13*Math.abs(K); nm+=d1; K+=d2; sse=s2; lam/=10; if (conv) break; } else { lam*=10; if (lam>1e12) break; }
    }
    return {range:r, npts:idx.length, lin:{slope:L.slope, icpt:L.icpt, r:L.r, nm:nmL, K:KL, area:betArea(nmL,P)}, nl:{nm, K, sse, area:betArea(nm,P)}};
  }

  /* ---------------- volume totale dei pori (Gurvich) e diametro medio ---------------- */
  function totalPoreVolume(iso, P, xTarget, mode){
    const A=branchOf(iso,'ads'), xt=xTarget||0.99; if (!A.x.length || !P.liqPerStp) return {err:P.liqPerStp?'vuota':'densita'};
    let x, n;
    if (mode==='interp'){ const s=sortedPairs(A.x, A.n); n=interp(s.x, s.y, xt); x=xt; }
    else { let b=0; for (let i=1;i<A.x.length;i++) if (Math.abs(A.x[i]-xt)<Math.abs(A.x[b]-xt)) b=i; x=A.x[b]; n=A.n[b]; }   // come Kaomi: il punto misurato più vicino
    if (!fin(n)) return {err:'fuori'};
    const V=n*P.liqPerStp, dmax=P.gamma&&P.Vm&&x<1 ? 2*(kelvinR(x,P)+tOf(x,P.thick)) : NaN;
    return {x, n, V, dmax};
  }
  const avgPoreDiameter=(V, S)=>S>0 ? 4*V*1e-6/S*1e10 : NaN;   // Å

  /* ---------------- t-plot e αs ---------------- */
  function tPlot(iso, P, range, model){
    const A=branchOf(iso,'ads'), key=model||P.thick||'harkins-jura', pts=A.x.map((x,i)=>({x, n:A.n[i], t:x>0&&x<1?tOf(x,key):NaN})).filter(o=>fin(o.t));
    const r=range||{x:[0.2,0.5]}; const sel=pts.filter(o=>r.t ? o.t>=r.t[0]&&o.t<=r.t[1] : o.x>=r.x[0]&&o.x<=r.x[1]);
    if (sel.length<3) return {err:'pochi', pts, model:key};
    const L=linfit(sel.map(o=>o.t), sel.map(o=>o.n)); if (!L) return {err:'fit', pts, model:key};
    const k=P.liqPerStp; return {model:key, modelName:THICK[key].name, pts, npts:sel.length, range:r, slope:L.slope, icpt:L.icpt, r:L.r,
      Sext:k?L.slope*k*1e4:NaN, Vmicro:k?L.icpt*k:NaN, nMicro:L.icpt};
  }
  function alphaS(iso, P, ref, range){   // ref: {x:[], n:[] (cm³ STP/g), S: area BET del riferimento}
    const A=branchOf(iso,'ads'), s=sortedPairs(ref.x, ref.n), n04=interp(s.x, s.y, 0.4); if (!fin(n04)||n04<=0) return {err:'riferimento'};
    const pts=A.x.map((x,i)=>({x, n:A.n[i], a:interp(s.x, s.y, x)/n04})).filter(o=>fin(o.a));
    const r=range||{a:[0.5,1.2]}, sel=pts.filter(o=>o.a>=r.a[0] && o.a<=r.a[1]); if (sel.length<3) return {err:'pochi', pts};
    const L=linfit(sel.map(o=>o.a), sel.map(o=>o.n)); if (!L) return {err:'fit', pts};
    return {pts, npts:sel.length, range:r, slope:L.slope, icpt:L.icpt, r:L.r, Sext:fin(ref.S)?L.slope*ref.S/n04:NaN, Vmicro:P.liqPerStp?L.icpt*P.liqPerStp:NaN, n04};
  }

  /* ---------------- BJH (Barrett–Joyner–Halenda 1951) e Dollimore–Heal (1964) ----------------
     Pori cilindrici, menisco emisferico, angolo di contatto θ; spessore con il modello scelto. Si parte dal punto più alto e si scende. */
  function bjh(iso, P, opt){
    opt=opt||{}; const which=opt.branch||'des', method=opt.method||'bjh', B=branchOf(iso, which), lo=opt.xmin!=null?opt.xmin:0.35, hi=opt.xmax!=null?opt.xmax:1;
    if (!P.liqPerStp || !P.gamma) return {err:'parametri'};
    let pts=B.x.map((x,i)=>({x, V:B.n[i]*P.liqPerStp})).filter(o=>o.x>=lo && o.x<hi && fin(o.V));
    if (which==='ads') pts=pts.sort((a,b)=>b.x-a.x);   // si scende dal punto più alto anche sul ramo di adsorbimento
    if (pts.length<3) return {err:'pochi'};
    const key=opt.thick||P.thick, rk=pts.map(o=>kelvinR(o.x,P)), t=pts.map(o=>tOf(o.x,key)), rp=rk.map((v,i)=>v+t[i]);
    const out=[]; let sumA=0, sumC=0, sumL=0;
    for (let j=1;j<pts.length;j++){
      const dV=pts[j-1].V-pts[j].V, dt=t[j-1]-t[j], rpm=(rp[j-1]+rp[j])/2, rkm=(rk[j-1]+rk[j])/2, tm=(t[j-1]+t[j])/2;
      let Vp;
      if (method==='dh'){   // Dollimore–Heal: ΔVp = R (ΔV − Δt ΣA + 2π t̄ Δt ΣL), R = (r̄p/(r̄k+Δt))²
        const Rf=(rpm/(rkm+dt))**2; Vp=Rf*(dV - dt*sumA*1e-4 + 2*Math.PI*tm*dt*sumL*1e-4);
      } else {              // BJH: ΔVp = R (ΔV − Δt Σ c A), c = (r̄p − t)/r̄p, R = (r̄p/(r̄k+Δt/2))²
        let sc=0; for (const o of out) if (o.Vp>0) sc+=(o.rp-t[j])/o.rp*o.A;
        const Rf=(rpm/(rkm+dt/2))**2; Vp=Rf*(dV - dt*sc*1e-4);
      }
      const ok=Vp>0; if (!ok) Vp=0;
      const A=2e4*Vp/rpm, d0=2*rp[j-1], d1=2*rp[j];   // A in m²/g con V in cm³/g e r in Å
      sumA+=A; sumL+=A/(2*Math.PI*rpm);   // lunghezza ∝ A/(2π r): con le stesse unità di ΣA
      out.push({d:2*rpm, rp:rpm, dmax:d0, dmin:d1, Vp, A, dVdd:Vp/(d0-d1), dVdlogd:Vp/Math.log10(d0/d1), neg:!ok, x0:pts[j-1].x, x1:pts[j].x});
    }
    // dal poro più piccolo al più grande, con i cumulati (come le tabelle di Kaomi)
    const asc=out.slice().reverse(); let cv=0, ca=0; asc.forEach(o=>{ cv+=o.Vp; ca+=o.A; o.cumV=cv; o.cumA=ca; });
    let mode=asc[0]; for (const o of asc) if (o.dVdd>mode.dVdd) mode=o;
    return {branch:which, method, thick:key, rows:asc, Vtot:cv, Atot:ca, mode:mode?mode.d:NaN, modeLog:asc.reduce((m,o)=>o.dVdlogd>m.dVdlogd?o:m, asc[0]).d, nNeg:out.filter(o=>o.neg).length};
  }

  /* ---------------- Dubinin–Radushkevich e Dubinin–Astakhov ---------------- */
  function drda(iso, P, range, kind){
    const A=branchOf(iso,'ads'), r=range||[1e-6,0.1], k=P.liqPerStp; if (!k || !P.T) return {err:'parametri'};
    const pts=A.x.map((x,i)=>({x, W:A.n[i]*k})).filter(o=>o.x>=r[0] && o.x<=r[1] && o.x>0 && o.x<1 && o.W>0);
    if (pts.length<3) return {err:'pochi'};
    const Aj=pts.map(o=>R*P.T*Math.log(1/o.x)/1000), lnW=pts.map(o=>Math.log(o.W));   // potenziale di adsorbimento in kJ/mol
    const fitN=nn=>{ const L=linfit(Aj.map(a=>Math.pow(a,nn)), lnW); return L; };
    const res=nn=>{ const L=fitN(nn); return L?L.sse:Infinity; };
    const nn=kind==='da' ? golden(res, 1, 6, 1e-12) : 2, L=fitN(nn); if (!L || !(L.slope<0)) return {err:'fit'};
    const E=Math.pow(-1/L.slope, 1/nn), W0=Math.exp(L.icpt), out={kind:kind||'dr', range:r, npts:pts.length, W0, E, n:nn, r:L.r, pts:pts.map((o,i)=>({x:o.x, W:o.W, A:Aj[i]}))};
    if (P.beta){ out.E0=E/P.beta; if (out.E0>=20 && out.E0<=42) out.L=10.8/(out.E0-11.4); }   // Stoeckli: larghezza media delle fenditure (nm), valida per E0 20–42 kJ/mol
    // forma lineare di DR (log10 W contro log10²(p0/p)), per il grafico
    if (nn===2) out.D=R*R*P.T*P.T*Math.LN10/(E*E*1e6);
    return out;
  }

  /* ---------------- calore isosterico ----------------
     isos: [{T (K), p (Pa, assolute), n (cm³ STP/g)}], solo ramo di adsorbimento. Clausius–Clapeyron a quantità costante
     (interpolazione di ln p contro n) oppure fit viriale ln p = ln n + (1/T) Σ aᵢ nⁱ + Σ bⱼ nʲ. */
  function isosteric(isos, opt){
    opt=opt||{}; const L=isos.filter(o=>o && fin(o.T) && o.p && o.n && o.p.length>=2).map(o=>{ const s=sortedPairs(o.n, o.p.map(v=>Math.log(v))); return {T:o.T, n:s.x, lnp:s.y}; });
    if (L.length<2) return {err:'temperature'};
    if (new Set(L.map(o=>o.T)).size<L.length) return {err:'stessaT'};
    const lo=Math.max(...L.map(o=>o.n[0])), hi=Math.min(...L.map(o=>o.n[o.n.length-1])); if (!(hi>lo)) return {err:'sovrapposizione'};
    const N=opt.nGrid||20, grid=opt.grid||Array.from({length:N},(_,i)=>lo+(hi-lo)*(i+0.5)/N), relP=opt.relP!=null?opt.relP:0.005, rows=[];
    for (const n of grid){
      const X=L.map(o=>1/o.T), Y=L.map(o=>interp(o.n, o.lnp, n)); if (Y.some(v=>!fin(v))) continue;
      const F=linfit(X, Y); if (!F) continue; const Q=-R*F.slope/1000;
      // incertezza: con ≥ 3 temperature dall'errore standard della pendenza; con 2 dall'incertezza relativa delle pressioni (relP)
      const u=L.length>=3 ? R*F.seS/1000 : R*Math.SQRT2*relP/Math.abs(X[0]-X[1])/1000;
      rows.push({n, Q, u, r:F.r});
    }
    const out={method:'cc', nT:L.length, T:L.map(o=>o.T), rows};
    if (opt.virial){ const m=opt.virial.m||3, k=opt.virial.k||2, R_=[], Y=[];
      L.forEach(o=>o.n.forEach((n,i)=>{ if (!(n>0)) return; const row=[]; for (let a=0;a<=m;a++) row.push(Math.pow(n,a)/o.T); for (let b=0;b<=k;b++) row.push(Math.pow(n,b)); R_.push(row); Y.push(o.lnp[i]-Math.log(n)); }));
      const F=R_.length>m+k+2 ? lsq(R_, Y) : null;
      if (F){ out.virial={m, k, a:F.coef.slice(0,m+1), b:F.coef.slice(m+1), rows:grid.map(n=>{ const g=[]; for (let a=0;a<=m;a++) g.push(Math.pow(n,a)); let s=0, v=0; g.forEach((gi,i)=>s+=gi*F.coef[i]); if (F.cov) for (let i=0;i<=m;i++) for (let j=0;j<=m;j++) v+=g[i]*g[j]*F.cov[i][j]; return {n, Q:-R*s/1000, u:R*Math.sqrt(Math.max(0,v))/1000}; })}; }
    }
    return out;
  }

  /* ---------------- DFT ----------------
     (a) PSD esportata da Kaomi: solo lettura e disegno (parseDFTExport). (b) Kernel dell'utente: NNLS regolarizzato (Tikhonov).
     kernel: {x:[p/p0], w:[larghezze], K:[[valore per x_i e w_j]]} con K in cm³ STP per cm³ di poro; fit n = K·v, v ≥ 0 (cm³/g). */
  function dftFit(iso, kernel, opt){
    opt=opt||{}; const A=branchOf(iso,'ads'), lam=opt.lambda!=null?opt.lambda:0, kx=kernel.x;
    const pts=A.x.map((x,i)=>({x, n:A.n[i]})).filter(o=>o.x>=kx[0] && o.x<=kx[kx.length-1] && fin(o.n));
    if (pts.length<3) return {err:'fuori'};
    const lx=kx.map(v=>Math.log(v)), cols=kernel.w.map((_,j)=>pts.map(o=>interp(lx, kernel.K.map(r=>r[j]), Math.log(o.x))));
    if (cols.some(c=>c.some(v=>!fin(v)))) return {err:'kernel'};
    const m=pts.length, b=pts.map(o=>o.n), sc=Math.max(...b)||1;
    let Acols=cols, bb=b;
    if (lam>0){ const s=Math.sqrt(lam)*sc/ (Math.max(...cols.map(c=>Math.max(...c)))||1); Acols=cols.map((c,j)=>c.concat(kernel.w.map((_,q)=>q===j?s*Math.max(...c):0))); bb=b.concat(new Array(kernel.w.length).fill(0)); }
    const F=nnls(Acols, bb); const v=F.x; let ss=0; const fit=pts.map((o,i)=>{ let s=0; for (let j=0;j<v.length;j++) s+=cols[j][i]*v[j]; ss+=(o.n-s)**2; return s; });
    let cum=0; const rows=kernel.w.map((w,j)=>{ cum+=v[j]; return {w, dV:v[j], cumV:cum}; });
    return {rows, Vtot:cum, rms:Math.sqrt(ss/m), fit, pts, lambda:lam, label:'kernel dell\'utente'+(kernel.name?': '+kernel.name:'')};
  }

  /* ---------------- tipo IUPAC e isteresi: solo suggerimenti motivati (Thommes et al. 2015) ---------------- */
  function hysteresis(iso){
    const A=branchOf(iso,'ads'), D=branchOf(iso,'des'); if (D.x.length<3) return {has:false};
    const sa=sortedPairs(A.x, A.n), sd=sortedPairs(D.x, D.n); let maxGap=0, xGap=NaN, close=NaN, nMax=Math.max(...A.n);
    const grid=[]; for (let x=Math.max(sa.x[0], sd.x[0]); x<=Math.min(sa.x[sa.x.length-1], sd.x[sd.x.length-1]); x+=0.005) grid.push(x);
    const gap=grid.map(x=>interp(sd.x, sd.y, x)-interp(sa.x, sa.y, x));
    gap.forEach((g,i)=>{ if (g>maxGap){ maxGap=g; xGap=grid[i]; } });
    const thr=0.02*nMax, thrC=Math.max(thr, 0.05*maxGap); for (let i=0;i<grid.length;i++) if (gap[i]>thrC){ close=grid[i]; break; }
    // isteresi aperta a bassa pressione: il desorbimento resta sopra l'adsorbimento oltre il 2% a p/p0 < 0,35
    const open=grid.some((x,i)=>x<0.35 && gap[i]>thr);
    return {has:maxGap>thr, maxGap, xGap, close, open};
  }
  function iupacSuggest(iso, P, betRes){
    const A=branchOf(iso,'ads'), s=sortedPairs(A.x, A.n); if (s.x.length<5) return null;
    const nAt=x=>interp(s.x, s.y, x), nTop=s.y[s.y.length-1], n01=nAt(0.1), n05=nAt(0.5), n09=nAt(Math.min(0.9, s.x[s.x.length-1])), H=hysteresis(iso), C=betRes&&betRes.used?betRes.used.C:null;
    const why=[]; let type='II', hyst=null;
    if (fin(n01) && n01>0.7*nTop && (!fin(n09) || n09<1.15*n05)){ type=fin(nAt(0.01)) && nAt(0.01)>0.6*nTop ? 'I(a)' : 'I(b)'; why.push('quasi tutta la quantità è adsorbita sotto p/p₀ = 0,1 e poi c\'è un plateau'); }
    else if (C!=null && C<2){ type=H.has?'V':'III'; why.push(`C del BET basso (${C.toFixed(2)}): interazione debole con la superficie`); }
    else if (H.has){ type='IV(a)'; why.push('ciclo di isteresi nella zona della condensazione capillare'); }
    else if (fin(n05)&&fin(n09)&&n09>1.5*n05&&nAt(0.95)<1.1*n09){ type='IV(b)'; why.push('condensazione capillare senza isteresi'); }
    else why.push('salita continua senza plateau e senza isteresi');
    if (H.has){
      if (P && P.gas==='N2' && fin(H.close) && H.close>=0.40 && H.close<=0.50){ hyst='H2(a) o H3/H4 con chiusura forzata'; why.push(`chiusura a ${H.close.toFixed(2)}: per l'N₂ a 77 K è la chiusura forzata (cavitazione, TSE)`); }
      else if (fin(nTop) && fin(nAt(0.95)) && nAt(0.95)<1.03*n09){ hyst='H1'; why.push('rami ripidi e quasi paralleli con plateau finale'); }
      else { hyst='H3'; why.push('nessun plateau vicino a p/p₀ = 1'); }
    }
    return {type, hyst, why, H};
  }

  /* ---------------- avvisi della SPEC §4 (⛔ = stop, ⚠ = warn) ---------------- */
  function warnings(iso, P, R0){
    const W=[], add=(lv,k,t)=>W.push({lv,k,t}), Rr=R0||{};
    (iso.problems||[]).forEach(p=>add(p.lv, p.k, p.t));
    const A=branchOf(iso,'ads'), D=branchOf(iso,'des');
    if (!P.sigma) add('stop','sigma','Adsorbato o sezione molecolare sconosciuti: l\'area non si può calcolare');
    if (A.x.length<3) add('stop','pts','Meno di 3 punti nel ramo di adsorbimento');
    for (let i=1;i<A.x.length;i++) if (A.x[i]<A.x[i-1] || A.n[i]<A.n[i-1]-1e-9*Math.abs(A.n[i-1])){ add('warn','mono','Adsorbimento non monotono: la pressione o la quantità tornano indietro nel ramo di adsorbimento'); break; }
    const B=Rr.bet;
    if (B){ const u=B.used;
      if (!u) add('stop','bet','Nessun intervallo BET rispetta i criteri di Rouquerol (ISO 9277)');
      else { const c=u.crit||{};
        if (u.npts<3) add('stop','bet3','Meno di 3 punti nell\'intervallo BET');
        if (!(u.C>0)) add('stop','betC','C del BET ≤ 0: l\'intervallo non ha significato');
        else if (!c.ok) ['a','b','c','d'].filter(k=>!c[k]).forEach(k=>add('stop','betR',`L'intervallo BET viola il criterio di Rouquerol (${k}): `+({a:'n(1−p/p₀) non sempre crescente', b:'C o intercetta non positivi', c:'p/p₀ del monostrato fuori dall\'intervallo', d:'1/(√C+1) diverso di oltre il 10% dalla p/p₀ a cui n = nₘ'})[k]));
        if (u.r<0.999) add('warn','betr',`Coefficiente di correlazione BET r = ${u.r.toFixed(5)} < 0,999`);
        if (u.npts<5 && u.npts>=3) add('warn','bet5','Intervallo BET con meno di 5 punti: ISO 9277 ne raccomanda almeno 5'); }
      if (u && fin(u.area) && fin(iso.meta.mass_g)){ const tot=u.area*iso.meta.mass_g; if (tot<(Rr.minArea||1)) add('warn','cell',`Area totale nella cella ${tot.toPrecision(3)} m²: sotto la soglia di ${(Rr.minArea||1)} m² (soglia da concordare)`); }
    }
    const H=hysteresis(iso); if (H.open) add('warn','close','L\'isoterma non chiude: il desorbimento resta sopra l\'adsorbimento oltre il 2% a p/p₀ < 0,35');
    if (Rr.bjh && Rr.bjh.branch==='des' && P.gas==='N2' && fin(H.close) && H.close>=0.40 && H.close<=0.50) add('warn','tse','Chiusura forzata dell\'isteresi (p/p₀ ≈ 0,42–0,45 con N₂ a 77 K): il picco BJH del desorbimento verso 3,8–4 nm è un artefatto. Usa il ramo di adsorbimento');
    if (P.stp==='iupac' && iso.meta.software) add('warn','stp','STP diversa da quella del file: qui 0 °C e 100 kPa (22 711 cm³/mol), Kaomi usa 0 °C e 1 atm (22 414 cm³/mol); le aree cambiano dell\'1,3%');
    if (Rr.langmuir && Rr.iupac && /^(II|IV)/.test(Rr.iupac.type)) add('warn','lang','Langmuir su un\'isoterma di tipo '+Rr.iupac.type+': il modello non ha significato fisico, il numero è solo un indice');
    if (Rr.iupac && /^I/.test(Rr.iupac.type) && !/V/.test(Rr.iupac.type) && P.gas==='N2') add('warn','n2micro','Campione microporoso misurato con N₂ a 77 K: per i micropori è più affidabile Ar a 87 K (IUPAC 2015)');
    if (!fin(iso.meta.mass_g) && iso.meta.nUnitFile && /\/g/.test(iso.meta.nUnitFile)) {/* già normalizzato */}
    return W;
  }

  /* ---------------- tutto insieme, per l'interfaccia e le esportazioni ---------------- */
  function analyze(iso, over, opt){
    opt=opt||{}; const P=params(iso, over), out={P};
    try{ out.bet=bet(iso, P, {range:opt.betRange, minPts:opt.minPts}); }catch(e){ out.bet={err:String(e)}; }
    try{ out.langmuir=langmuir(iso, P, opt.langRange); }catch(e){ out.langmuir={err:String(e)}; }
    try{ out.tpv=totalPoreVolume(iso, P, opt.tpvX||0.99, opt.tpvMode); if (out.tpv && out.bet.used && fin(out.tpv.V)) out.tpv.dAvg=avgPoreDiameter(out.tpv.V, out.bet.used.area); }catch(e){ out.tpv={err:String(e)}; }
    try{ out.tplot=tPlot(iso, P, opt.tRange, opt.tModel); }catch(e){ out.tplot={err:String(e)}; }
    if (opt.alphaRef) try{ out.alpha=alphaS(iso, P, opt.alphaRef, opt.alphaRange); }catch(e){ out.alpha={err:String(e)}; }
    const H=hysteresis(iso), defBranch=opt.bjhBranch || (P.gas==='N2' && fin(H.close) && H.close>=0.40 && H.close<=0.50 ? 'ads' : (branchOf(iso,'des').x.length>=3?'des':'ads'));
    try{ out.bjh=bjh(iso, P, {branch:defBranch, method:'bjh', thick:opt.bjhThick}); out.dh=bjh(iso, P, {branch:defBranch, method:'dh', thick:opt.bjhThick}); }catch(e){ out.bjh={err:String(e)}; }
    try{ out.dr=drda(iso, P, opt.drRange, 'dr'); out.da=drda(iso, P, opt.drRange, 'da'); }catch(e){ out.dr={err:String(e)}; }
    if (opt.kernel) try{ out.dft=dftFit(iso, opt.kernel, {lambda:opt.lambda}); }catch(e){ out.dft={err:String(e)}; }
    out.iupac=iupacSuggest(iso, P, out.bet);
    out.warnings=warnings(iso, P, {bet:out.bet, bjh:out.bjh&&!out.bjh.err?out.bjh:null, langmuir:out.langmuir, iupac:out.iupac, minArea:opt.minArea});
    return out;
  }

  /* =====================================================================================================
     LETTORI (DEDOTTO: nessun file reale di Kaomi disponibile). Tolleranti verso lingua, separatori, unità.
     parseSorption(text, name) → null (non è un'isoterma) | {iso, sure:true, reason, fmt} | {guided:true, why, table}
     ===================================================================================================== */
  const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/₀/g,'0').replace(/³/g,'3').replace(/²/g,'2');
  const squash=s=>norm(s).replace(/[\s_]+/g,'');
  // parole chiave in più lingue (Kaomi ha otto lingue d'interfaccia: DEDOTTO)
  const KW={
    rel:/relativepressure|pressionerelativa|relativerdruck|pressionrelative|presionrelativa|pressaorelativa|^p\/p0$|p\/p0|p\/po\b|^pp0$|^prel$|relpress/,
    p0:/^p0$|^p0\(|^po$|^p0[\[(]|saturationpressure|pressionedisaturazione|pressionedivapore|sattigungsdampfdruck|sattigungsdruck|pressiondesaturation|presiondesaturacion|^p0\s/,
    press:/^pressure|^pressione|^druck|^pression|^presion|^pressao|^absolutepressure|^p\(|^p\[|^p$|^ptorr|^pabs/,
    amount:/amountadsorbed|quantityadsorbed|volumeadsorbed|quantitaadsorbita|volumeadsorbito|quantitadsorbita|adsorbiertemenge|adsorbiertesvolumen|quantiteadsorbee|volumeadsorbe|cantidadadsorbida|volumenadsorbido|quantidadeadsorvida|volume@stp|volumestp|^volume|^uptake|^loading|^amount|^quantita|^n\(|^vads|^vstp|^adsorbed/,
    time:/^time|^tempo|^zeit|^temps|^tiempo|^elapsed/,
    branch:/^branch|^ramo|^zweig|^branche|^rama|^ads\/des|^segment/
  };
  function colKind(name){ const s=squash(name); if (!s) return null; if (KW.branch.test(s)) return 'branch'; if (KW.rel.test(s)) return 'rel'; if (KW.p0.test(s)) return 'p0'; if (KW.amount.test(s)) return 'amount'; if (KW.time.test(s)) return 'time'; if (KW.press.test(s)) return 'press'; return null; }
  function unitOf(s){ const t=norm(s).replace(/\s+/g,' ');
    let m=/(cm3|cc|ml)\s*(\(?stp\)?)?\s*\/\s*g(\s*stp)?|mmol\s*\/\s*g|µmol\s*\/\s*g|umol\s*\/\s*g|mol\s*\/\s*kg|mol\s*\/\s*g|mg\s*\/\s*g/.exec(t); if (m) return {kind:'amount', u:m[0].replace(/\s+/g,'')};
    m=/\b(cm3|cc|ml)\s*(\(?stp\)?)?(?![\/\w])|\bmmol\b(?!\s*\/)/.exec(t); if (m) return {kind:'amount', u:m[0].replace(/\s+/g,'')};
    m=/\b(torr|mmhg|kpa|mpa|mbar|bar|pa|atm|psi)\b/.exec(t); if (m) return {kind:'press', u:m[1]};
    m=/\b(min|s|sec|h|hr)\b/.exec(t); if (m) return {kind:'time', u:m[1]};
    return null; }
  function toNumber(s){ s=String(s).trim().replace(/^"|"$/g,''); if (!s) return NaN;
    if (/^[-+]?\d+,\d+([eE][-+]?\d+)?$/.test(s)) s=s.replace(',','.');   // decimale con la virgola (interfaccia italiana: DEDOTTO)
    if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return NaN; return +s; }
  function csvSplit(l){ const out=[]; let cur='', q=false; for (const ch of l){ if (ch==='"'){ q=!q; continue; } if (ch===','&&!q){ out.push(cur); cur=''; } else cur+=ch; } out.push(cur); return out; }
  function cellsOf(line, sep){ if (sep==='\t') return line.split('\t'); if (sep===';') return line.split(';'); if (sep===',') return csvSplit(line); return line.trim().split(/\s{2,}|\t/); }
  function guessSep(lines){ const L=lines.slice(0,400).filter(l=>l.trim()), c={'\t':0, ';':0, ',':0}; L.forEach(l=>{ for (const k in c) if (l.includes(k)) c[k]++; });
    if (c['\t']>=c[';'] && c['\t']>0.3*L.length) return '\t'; if (c[';']>0.3*L.length) return ';'; if (c[',']>0.5*L.length) return ','; return null; }
  function numericCells(line, sep){
    let c=cellsOf(line, sep).map(s=>s.trim());
    if (!sep){ c=line.trim().split(/\s+/); }
    const v=c.filter(s=>s!=='').map(toNumber); return v.length>=2 && v.every(fin) ? v : null;
  }
  // campi d'intestazione «Nome: valore unità» o «Nome<TAB>valore», anche più di uno per riga (ASiQwin)
  const HEAD_KEYS=[
    ['sampleId', /(?:sample\s*id|id\s*campione|campione|proben?-?id|identifiant)\s*[:\t,;]\s*([^\t]+?)(?=\s{2,}|\t|$)|sample\s*id\s{1,}([^\t]+?)(?=\s{2,}|$)/i],
    ['mass', /(?:sample\s*w\s?eight|sample\s*mass|peso\s*(?:del\s*)?campione|massa\s*(?:del\s*)?campione|probengewicht|probenmasse|masse\s*de\s*l.echantillon|peso\s*de\s*la\s*muestra|_adsnt_sample_mass)\s*[:\t=,;]?\s*([-+]?\d+[.,]?\d*(?:[eE][-+]?\d+)?)\s*(mg|g|kg)?/i],
    ['gas', /(?:analysis\s*gas|adsorbate|adsorbato|gas\s*di\s*analisi|messgas|adsorptiv|gaz\s*d.analyse|gas\s*de\s*analisis|_exptl_adsorptive)\s*[:\t=,;]?\s*((?:\d+\s*:\s*)?[A-Za-z][A-Za-z0-9₂ ]*?)(?=\s{2,}|[\t,;]|$)/im],
    ['T', /(?:analysis\s*t\s?emp\.?(?:erature)?|bath\s*temp\.?|temperatura\s*(?:di\s*)?analisi|temperatura\s*del\s*bagno|analysentemperatur|badtemperatur|temperature\s*d.analyse|_exptl_temperature)\s*[:\t=,;]?\s*([-+]?\d+[.,]?\d*)\s*(K|°C|C)?/i],
    ['instrument', /(?:^|\s)(?:instrument|strumento|ger[aä]t|_exptl_instrument)\s*[:\t=,;]?\s*([^\t]+?)(?=\s{2,}|\t|$)/im],
    ['station', /(?:station|stazione|porta|port)\s*[:\t=,;]?\s*(\d+)/i],
    ['sigma', /(?:cross\s*sec\s?(?:tion(?:al)?)?(?:\s*area)?|sezione\s*(?:trasversale|molecolare)|querschnitt(?:sfl[aä]che)?)\s*[:\t=,;]?\s*([-+]?\d+[.,]?\d*)\s*(nm2|nm²|Å2|Å²|A2|A²|Ã…Â²|Å~2)?/i],
    ['rhoL', /(?:liquid\s*density|densit[aà]\s*(?:del\s*)?liquid[oa]|fl[uü]ssigkeitsdichte)\s*[:\t=,;]?\s*([-+]?\d+[.,]?\d*)/i],
    ['gamma', /(?:surfac\s?e\s*t\s?ension|tensione\s*superficiale|oberfl[aä]chenspannung)\s*[:\t=,;]?\s*([-+]?\d+[.,]?\d*)/i],
    ['M', /(?:molec\s?ular\s*w\s?eight|molec\.\s*wt\.|peso\s*molecolare|massa\s*molare|molmasse)\s*[:\t=,;]?\s*([-+]?\d+[.,]?\d*)/i],
    ['theta', /(?:contac\s?t\s*angle|angolo\s*di\s*contatto|kontaktwinkel)\s*[:\t=,;]?\s*([-+]?\d+[.,]?\d*)/i],
    ['thick', /(?:statistic\s?al\s*t\s?hic\s?k\s?ness\s*model|thickness\s*model|modello\s*(?:di\s*)?spessore|schichtdickenmodell)\s*[:\t=,;]?\s*([A-Za-z][A-Za-z \-–]+?)(?=\s{2,}|\t|$)/im],
    ['p0Override', /p0\s*ov\s?erride\s*[:\t=,;]?\s*(yes|no|si|sì|on|off|ja|nein)/i],
    ['p0', /(?:^|\s)(?:p0|saturation\s*pressure|pressione\s*di\s*saturazione)\s*[:\t=]\s*([-+]?\d+[.,]?\d*)\s*(torr|mmhg|kpa|pa|mbar|bar)?/im],
    ['date', /(?:analysis\s*date|data\s*(?:dell.)?analisi|messdatum|_exptl_date)\s*[:\t=,;]?\s*([0-9][0-9\/.\- ]+[0-9])/i],
    ['operator', /(?:^|\s)(?:operator|operatore|bediener|_exptl_operator)\s*[:\t=,;]?\s*([^\t]+?)(?=\s{2,}|\t|$)/im]
  ];
  // testo estratto da PDF: parole spezzate da uno spazio («W eight», «T emp», «Surfac e»)
  const unbreak=t=>t.replace(/\b([A-Z]) (?=[a-z]{2,})/g,'$1').replace(/\b([a-z]{3,}) ([a-z]{1,2})\b(?= |$)/gm,'$1$2');
  function readHeader(text){
    const t=unbreak(String(text).replace(/₀/g,'0')), m={}; const num=v=>toNumber(String(v).replace(',','.'));
    for (const [k,re] of HEAD_KEYS){ const r=re.exec(t); if (!r) continue; const v=(r[1]!=null?r[1]:r[2]||'').trim();
      if (k==='mass'){ const x=num(v); if (fin(x)) m.mass_g=x*(/^mg$/i.test(r[2]||'')?1e-3:/^kg$/i.test(r[2]||'')?1e3:1); }
      else if (k==='T'){ const x=num(v); if (fin(x)) m.T=/c/i.test(r[2]||'')?x+273.15:x; }
      else if (k==='sigma'){ const x=num(v); if (fin(x)) m.sigma=/nm/i.test(r[2]||'')||x<1?x:x/100; }   // Å² → nm²
      else if (['rhoL','gamma','M','theta'].includes(k)){ const x=num(v); if (fin(x)) m[k]=x; }
      else if (k==='thick'){ const q=thicknessKey(v); if (q) m.thick=q; m.thickName=v; }
      else if (k==='p0'){ const x=num(v), u=(r[2]||'torr').toLowerCase(); if (fin(x) && P_UNITS[u]) m.p0Pa=x*P_UNITS[u]; }
      else if (k==='p0Override') m.p0Override=/yes|si|sì|on|ja/i.test(v);
      else if (k==='gas'){ m.gas=v.replace(/^\d+\s*:\s*/,''); m.gasKey=gasKey(m.gas); if (/argon87/i.test(v) && !m.T) m.T=87.27; }
      else m[k]=v.replace(/\s+/g,' ');
    }
    const sw=/kaomi(?:\s+for\s+autosorb)?[^\n]*?(?:version\s*([\d.]+))?/i.exec(t), aq=/asiqwin[^\n]*?(?:version\s*([\d.]+))?|quantachrome/i.exec(t);
    if (sw) m.software='Kaomi for Autosorb'+(sw[1]?' '+sw[1]:''); else if (aq) m.software='ASiQwin'+(aq[1]?' '+aq[1]:'');
    else if (/anton\s*paar|autosorb/i.test(t)) m.software='Anton Paar (software non indicato)';
    { const v=/version\s+([\d.]+)/i.exec(t.slice(0,600)); if (v && m.software && !/\d/.test(m.software)) m.software+=' '+v[1]; }
    return m;
  }
  /* blocchi di righe numeriche con le righe di testo che li precedono */
  function blocksOf(lines, sep){
    const out=[]; let head=[], cur=null;
    for (const raw of lines){ const l=raw.replace(/\s+$/,''); if (!l.trim()){ continue; }
      const v=numericCells(l, sep);
      if (v){ if (!cur || cur.k!==v.length){ if (cur) out.push(cur); cur={k:v.length, rows:[], head:head.slice(-6), headAll:head.slice()}; head=[]; } cur.rows.push(v); }
      else { if (cur){ out.push(cur); cur=null; } head.push(l); }
    }
    if (cur) out.push(cur); return out;
  }
  // unità scritte su righe proprie, nell'ordine delle colonne, anche con gli spazi spezzati del testo estratto da PDF («c m³ ST P/ g»)
  function assignUnits(kinds, units, lines){
    const ul=[]; lines.forEach(h=>{ const s=norm(h).replace(/c\s*m\s*3/g,'cm3').replace(/s\s*t\s*p/g,'stp').replace(/t\s*orr/g,'torr').replace(/\/\s+/g,'/').replace(/\s+\//g,'/');
      const re=/(cm3|cc|ml)\s*(stp)?\s*\/\s*g(\s*stp)?|(cm3|cc|ml)\s*\(?stp\)?|mmol\/g|mol\/kg|mol\/g|\b(torr|mmhg|kpa|mbar|pa|bar|atm)\b|\b(min|hr|h)\b/g; let r; while ((r=re.exec(s))){ const uu=unitOf(r[0]); if (uu) ul.push(uu); } });
    const pool={press:[], amount:[], time:[]}; ul.forEach(u=>pool[u.kind].push(u));
    kinds.forEach((kd,q)=>{ if (units[q]) return; const P=kd==='press'||kd==='p0'?pool.press:kd==='amount'?pool.amount:kd==='time'?pool.time:null; if (P && P.length) units[q]=P.shift(); });
  }
  // nomi e unità delle colonne di un blocco: dalla riga dei nomi (stesse celle dei dati) o, nel testo a colonne, in ordine di apparizione
  function columnsOf(block, sep){
    const k=block.k, H=block.head; let names=null, units=new Array(k).fill(null);
    let after=[];
    for (let i=H.length-1;i>=0 && !names;i--){ const c=cellsOf(H[i], sep).map(s=>s.trim()).filter(s=>s!==''); if (c.length===k && c.some(colKind)){ names=c; after=H.slice(i+1); for (const h of after){ const u=cellsOf(h, sep).map(s=>s.trim()).filter(s=>s!==''); if (u.length===k) u.forEach((s,q)=>{ const uu=unitOf(s); if (uu) units[q]=uu; }); } } }
    let kinds;
    if (names){ kinds=names.map(colKind); names.forEach((s,q)=>{ const uu=unitOf(s); if (uu && !units[q]) units[q]=uu; }); assignUnits(kinds, units, after); }
    else {   // testo a larghezza fissa o estratto da PDF: si cercano le parole chiave nell'ordine in cui compaiono
      const all=squash(H.join(' ')), found=[];
      const pats=[['rel',/relativepressure|pressionerelativa|relativerdruck|pressionrelative|presionrelativa|relativ.?epressure|p\/p0/g],['p0',/p0(?!\))|saturationpressure|pressionedisaturazione/g],['amount',/amountadsorbed|quantitaadsorbita|volumeadsorbito|volume@stp|volumeadsorbed|quantityadsorbed|adsorbiertemenge/g],['time',/time|tempo|zeit/g],['press',/pressure|pressione|druck/g]];
      for (const [kd,re] of pats){ let r; while ((r=re.exec(all))) found.push({kd, at:r.index, len:r[0].length}); }
      found.sort((a,b)=>a.at-b.at||b.len-a.len); const taken=[]; for (const f of found){ if (taken.some(t=>f.at<t.at+t.len && t.at<f.at+f.len)) continue; taken.push(f); }
      taken.sort((a,b)=>a.at-b.at);
      // «p/p0» sotto «Relative Pressure» o «Pressure» dentro «Relative Pressure»: una sola colonna
      const seq=[]; taken.forEach(t=>{ if (t.kd==='rel' && seq.includes('rel')) return; if (t.kd==='p0' && seq.length && seq[seq.length-1]==='rel') return; seq.push(t.kd); });
      kinds=seq.length===k ? seq : null;
      if (kinds) assignUnits(kinds, units, H);
      names=kinds?kinds.slice():null;
    }
    return {names, kinds:kinds||null, units};
  }
  function looksSorption(text){ const t=squash(text.slice(0,20000)); return /kaomi|asiqwin|quantachrome|autosorb|isotherm|isoterma|relativepressure|pressionerelativa|p\/p0|volume@stp|cm3stp\/g|amountadsorbed|quantitaadsorbita|_adsorp_pressure/.test(t); }
  function sureBrand(text){ return /kaomi|asiqwin|quantachrome|autosorb|anton\s*paar/i.test(text.slice(0,20000)) || /_adsorp_(pressure|p0|amount)/.test(text); }

  /* AIF (Adsorption Information File, Evans et al., Langmuir 37, 2021): formato pubblico basato su CIF, con i rami separati */
  function parseAIF(text){
    if (!/_adsorp_pressure|_adsorp_amount/.test(text)) return null;
    const lines=text.split(/\r\n|\n|\r/), kv={}, loops=[]; let i=0;
    const unq=s=>String(s).trim().replace(/^'(.*)'$/,'$1').replace(/^"(.*)"$/,'$1');
    while (i<lines.length){ const l=lines[i].trim();
      if (/^loop_/.test(l)){ const keys=[]; i++; while (i<lines.length && /^_/.test(lines[i].trim())){ keys.push(lines[i].trim()); i++; } const rows=[]; while (i<lines.length){ const s=lines[i].trim(); if (!s || /^(_|loop_|data_|#)/.test(s)) break; const v=s.split(/\s+/).map(toNumber); if (v.length===keys.length) rows.push(v); i++; } loops.push({keys, rows}); continue; }
      const m=/^(_\S+)\s+(.+)$/.exec(l); if (m) kv[m[1]]=unq(m[2]); i++; }
    const pick=(pref)=>{ const L=loops.find(o=>o.keys.includes(pref+'_pressure') || o.keys.includes(pref+'_p0')); if (!L) return null; const col=n=>{ const j=L.keys.indexOf(pref+'_'+n); return j<0?null:L.rows.map(r=>r[j]); }; return {p:col('pressure'), p0:col('p0'), n:col('amount')}; };
    const a=pick('_adsorp'), d=pick('_desorp'); if (!a || !a.n) return null;
    const pU=(kv._units_pressure||'').toLowerCase(), lU=(kv._units_loading||'').toLowerCase(), mU=(kv._units_mass||'g').toLowerCase();
    const meta={gas:kv._exptl_adsorptive||'', T:+kv._exptl_temperature||null, sampleId:kv._adsnt_sample_id||kv._adsnt_sample_name||'', instrument:kv._exptl_instrument||'', operator:kv._exptl_operator||'', date:kv._exptl_date||'', software:kv._exptl_software||'AIF'};
    if (/c/.test(kv._units_temperature||'') && meta.T) meta.T+=273.15;
    meta.gasKey=gasKey(meta.gas);
    const mass=kv._adsnt_sample_mass!=null ? +kv._adsnt_sample_mass*(mU==='mg'?1e-3:1) : null;
    const cat=(k)=>(a[k]||[]).concat(d&&d[k]?d[k]:[]), marks=(a.n||[]).map(()=>'ads').concat(d&&d.n?d.n.map(()=>'des'):[]);
    const relP=/relative|p\/p0|^$/.test(pU) && !a.p0 && (a.p||[]).every(v=>v<=1.5);
    const lu=lU.replace(/cm3|cm\^3/,'cm3').replace(/\(stp\)|stp/,'').replace(/\s+/g,'');
    const nUnit=/mmol\/g/.test(lu)?'mmol/g':/mol\/kg/.test(lu)?'mol/kg':/mol\/g/.test(lu)?'mol/g':/cm3\/g|cc\/g|ml\/g/.test(lu)?'cm3/g':/cm3|cc|ml/.test(lu)?'cm3':lu;
    const q={n:cat('n'), marks, nUnit, mass_g:mass, meta, pUnit:pU==='mbar'?'mbar':pU};
    if (relP) q.x=cat('p'); else { q.p=cat('p'); q.p0=a.p0?cat('p0'):null; }
    return {iso:buildIso(q), fmt:'AIF', sure:true};
  }

  function parseSorption(text, name){
    if (typeof text!=='string' || text.length<20) return null;
    const aif=parseAIF(text); if (aif){ aif.reason='isoterma di adsorbimento, formato AIF'+(aif.iso.meta.software&&aif.iso.meta.software!=='AIF'?' ('+aif.iso.meta.software+')':''); return aif; }
    if (!looksSorption(text) && !/\.(aif)$/i.test(name||'')) return null;
    if (CHEM_KW.test(text.slice(0,6000))) return null;   // chemisorbimento: altro lettore (parseChem)
    const lines=text.split(/\r\n|\n|\r/), sep=guessSep(lines), meta=readHeader(text), blocks=blocksOf(lines, sep);
    const pdfText=/report\s*id|page\s+\d+\s+of\s+\d+|pagina\s+\d+\s+di\s+\d+/i.test(text);
    // blocchi dell'isoterma: tutti quelli con nomi riconosciuti come pressione + quantità e non di un risultato (BET, BJH, DFT, t-plot…)
    const RES=/bet\b|bjh|dft|dollimore|t-?plot|dubinin|langmuir|summary|results|risultati/i;
    const cand=[]; let instrBET=null, dft=null, lastIso=null;
    for (const b of blocks){ const h=b.head.join(' '), C=columnsOf(b, sep);
      if (/multi.?point\s*bet|bet\s*method|metodo\s*bet|bet\s*multipunto/i.test(h) && b.k>=2){ const xs=b.rows.map(r=>r[0]).filter(v=>v>0&&v<1); if (xs.length>=3) instrBET={x0:Math.min(...xs), x1:Math.max(...xs), n:xs.length}; continue; }
      if (/dft|nldft|qsdft/i.test(h)){ dft=dft||{block:b, head:h}; continue; }
      if (C.kinds && C.kinds.includes('amount') && (C.kinds.includes('rel') || C.kinds.includes('press')) && !(RES.test(b.head.slice(-3).join(' ')) && !/isotherm|isoterma/i.test(h))){ cand.push({b, C}); lastIso=cand[cand.length-1]; }
      else if (lastIso && b.k===lastIso.b.k && /continued|continua|segue|fortsetzung/i.test(h)) cand.push({b, C:lastIso.C});
      else if (lastIso && b.k===lastIso.b.k && !C.kinds && !RES.test(h) && b.rows.length>=3) cand.push({b, C:lastIso.C, cont:true});
    }
    // ASiQwin grezzo: due colonne senza riga dei nomi completa («Relative / Pressure», «Volume @ STP», «cc/g»)
    if (!cand.length && /asiqwin|quantachrome/i.test(text)){ const b=blocks.filter(q=>q.k===2).sort((u,v)=>v.rows.length-u.rows.length)[0]; if (b && /relative/i.test(b.headAll.join(' ')) && /volume\s*@\s*stp|volume/i.test(b.headAll.join(' '))){ const uu=unitOf(b.headAll.join(' ').match(/cc\/g|cm3\/g|cm³\/g|mmol\/g/i)?.[0]||''); cand.push({b, C:{kinds:['rel','amount'], units:[null, uu], names:['Relative Pressure','Volume @ STP']}}); } }
    if (!cand.length){
      // c'è un'isoterma ma le colonne non si riconoscono con certezza: importazione guidata, senza indovinare
      const big=blocks.filter(b=>b.k>=2).sort((u,v)=>v.rows.length-u.rows.length)[0];
      if (!big || big.rows.length<3 || !(sureBrand(text) || /isotherm|isoterma|isotherme|isoterma/i.test(text.slice(0,20000)))) return null;
      const C=columnsOf(big, sep);
      return {guided:true, why:'Sembra un\'isoterma di adsorbimento ('+(meta.software||'intestazione')+'), ma non riconosco con certezza le colonne di pressione e quantità', table:{names:C.names||big.head.slice(-1)[0]?.split(sep||/\s{2,}/)||[], k:big.k, rows:big.rows, units:C.units.map(u=>u&&u.u||'')}, meta};
    }
    const C=cand[0].C, rows=[].concat(...cand.filter(c=>c.b.k===cand[0].b.k).map(c=>c.b.rows)), col=kd=>{ const j=C.kinds.indexOf(kd); return j<0?null:{j, u:C.units[j]}; };
    const cR=col('rel'), cP=col('press'), cP0=col('p0'), cA=C.kinds.map((k,j)=>k==='amount'?j:-1).filter(j=>j>=0), cT=col('time'), cB=col('branch');
    // quantità: per grammo se c'è, altrimenti assoluta con la massa
    const aInfo=cA.map(j=>({j, u:C.units[j]})), aPer=aInfo.find(a=>a.u && /\/g|\/kg/.test(a.u.u)), aAbs=aInfo.find(a=>a.u && !/\//.test(a.u.u)), aUse=aPer||aAbs||aInfo[0];
    if (!aUse || !aUse.u){ return {guided:true, why:'Unità della quantità adsorbita non indicata nel file: va scelta a mano', table:{names:C.names||[], k:cand[0].b.k, rows, units:C.units.map(u=>u&&u.u||'')}, meta}; }
    const pU=(cP&&cP.u&&cP.u.u)||(cP0&&cP0.u&&cP0.u.u)||'';
    const q={n:rows.map(r=>r[aUse.j]), nUnit:aUse.u.u, mass_g:meta.mass_g, meta, pUnit:pU, t:cT?rows.map(r=>r[cT.j]):[]};
    if (cR) q.x=rows.map(r=>r[cR.j]);
    if (cP && pU) q.p=rows.map(r=>r[cP.j]);
    if (cP0 && pU) q.p0=rows.map(r=>r[cP0.j]);
    if (!cR && cP && !pU) return {guided:true, why:'Unità della pressione non indicata nel file', table:{names:C.names||[], k:cand[0].b.k, rows, units:C.units.map(u=>u&&u.u||'')}, meta};
    if (cB) q.marks=rows.map(r=>r[cB.j]===2||r[cB.j]<0?'des':'ads');
    // rami dichiarati da righe di testo «Desorption» fra due blocchi
    if (!cB && cand.length>1){ const marks=[]; cand.filter(c=>c.b.k===cand[0].b.k).forEach(c=>{ const d=/desorp|desorb/i.test(c.b.head.join(' ')) && !/adsorp.*desorp/i.test(c.b.head.join(' ')); c.b.rows.forEach(()=>marks.push(d?'des':'ads')); }); if (marks.includes('des')) q.marks=marks; }
    if (instrBET) meta.instrBET=instrBET;
    // risultati dello strumento nel file (BET), per il confronto: solo se scritti in chiaro
    { const t=text.replace(/\s+/g,' '); const a=/spec\s?ific\s*surfac\s?e\s*area\s*([\d.]+)\s*m|area\s*superficiale\s*specifica\s*([\d.,]+)/i.exec(t), c=/bet\s*constant\s*\[?c\]?\s*([\d.]+)/i.exec(t), v=/t\s?otal\s*pore\s*volume\s*([\d.]+)\s*cm/i.exec(t);
      if (a) meta.instrResults=Object.assign(meta.instrResults||{}, {area:toNumber((a[1]||a[2]).replace(',','.'))}); if (c) meta.instrResults=Object.assign(meta.instrResults||{}, {C:+c[1]}); if (v) meta.instrResults=Object.assign(meta.instrResults||{}, {Vtot:+v[1]}); }
    if (dft) meta.dftExport=parseDFTBlock(dft.block, dft.head, sep, text);
    meta.fromPdfText=pdfText;
    const iso=buildIso(q);
    if (iso.n.length<3) return {guided:true, why:iso.problems.length?iso.problems.map(x=>x.t).join('; '):'Meno di 3 punti leggibili', table:{names:C.names||[], k:cand[0].b.k, rows, units:C.units.map(u=>u&&u.u||'')}, meta};
    const fmt=/kaomi/i.test(meta.software||'')?'Kaomi for Autosorb':/asiqwin/i.test(meta.software||'')?'ASiQwin':'tabella di isoterma';
    if (pdfText) iso.problems.push({lv:'warn', k:'pdf', t:'Dati letti dal testo di un report PDF: è un ripiego, controlla i numeri con il report (meglio l\'esportazione tabellare)'});
    return {iso, sure:sureBrand(text) || !!(cR && aUse.u), fmt, reason:'isoterma di adsorbimento ('+fmt+(meta.gas?', '+meta.gas:'')+(meta.T?` a ${(+meta.T).toFixed(2)} K`:'')+')'};
  }
  // PSD DFT esportata da Kaomi (DEDOTTO): larghezza (nm o Å) e volume cumulato / dV(w)
  function parseDFTBlock(b, head, sep, text){
    const h=norm(head), k=b.k, kernel=(/(?:kernel|calculation\s*model|modello\s*di\s*calcolo|dft\s*method)\s*[:\t]?\s*([^\n\t]+)/i.exec(text)||[])[1]||'';
    const inA=/\ba\b|å|angstrom/.test(h) && !/nm/.test(h), half=/half/.test(h);
    const rows=b.rows.map(r=>({w:(inA?r[0]/10:r[0])*(half?2:1), cumV:k>=2?r[1]:NaN, dV:k>=3?r[2]:NaN}));
    return {rows, kernel:kernel.trim(), label:'calcolata da Kaomi'+(kernel?', kernel '+kernel.trim():''), unitW:'nm'};
  }
  // kernel dell'utente (CSV): prima riga «p/p0; w1; w2; …» (larghezze in nm), poi le righe
  function parseKernel(text, name){
    const lines=text.split(/\r\n|\n|\r/).filter(l=>l.trim()), sep=guessSep(lines)||null;
    let hi=lines.findIndex(l=>/p\/p0|p\/p₀|relative/i.test(l)); if (hi<0) hi=0;
    const head=(sep?lines[hi].split(sep):lines[hi].trim().split(/\s+/)).map(s=>s.trim()); const w=head.slice(1).map(s=>toNumber(s.replace(/[^\d.,eE+-]/g,'')));
    if (w.length<2 || !w.every(fin)) return {err:'Intestazione del kernel non valida: serve «p/p0» seguito dalle larghezze dei pori in nm'};
    const x=[], K=[]; for (const l of lines.slice(hi+1)){ const v=(sep?l.split(sep):l.trim().split(/\s+/)).map(toNumber); if (v.length===w.length+1 && v.every(fin)){ x.push(v[0]); K.push(v.slice(1)); } }
    if (x.length<5) return {err:'Kernel con meno di 5 pressioni'};
    for (let i=1;i<x.length;i++) if (!(x[i]>x[i-1])) return {err:'Le pressioni del kernel devono crescere'};
    return {x, w, K, name:String(name||'').replace(/\.[^.]+$/,'')};
  }
  /* conversione in AIF dell'importazione guidata: il file nuovo si rilegge con lo stesso lettore */
  function toAIF(o){   // o: {x? | p,p0, n, nUnit, pUnit, marks?, mass_g, gas, T, sampleId}
    const L=['data_acchiappaspettri_importazione_guidata', `_exptl_adsorptive ${JSON.stringify(o.gas||'')}`, `_exptl_temperature ${o.T||''}`, `_units_temperature K`, `_adsnt_sample_name ${JSON.stringify(o.sampleId||'')}`, `_exptl_software 'importazione guidata'`];
    if (fin(o.mass_g)) L.push(`_adsnt_sample_mass ${o.mass_g}`, '_units_mass g');
    L.push(`_units_loading ${JSON.stringify(o.nUnit)}`, `_units_pressure ${o.x?'relative':JSON.stringify(o.pUnit)}`);
    const sp=splitBranches(o.x||o.p.map((v,i)=>v/o.p0[i]), o.n, o.marks), emit=(pref, idx)=>{ if (!idx.length) return; L.push('loop_', `${pref}_pressure`); if (!o.x) L.push(`${pref}_p0`); L.push(`${pref}_amount`); idx.forEach(i=>L.push(o.x?`${o.x[i]} ${o.n[i]}`:`${o.p[i]} ${o.p0[i]} ${o.n[i]}`)); };
    emit('_adsorp', sp.ads); emit('_desorp', sp.des.slice(1));
    return L.join('\n')+'\n';
  }

  /* ---------------- CSV dei risultati (dati, rami, parametri, avvisi) ---------------- */
  function csvRows(iso, A, en){
    const T=(it,e)=>en?e:it, rows=[], P=A.P, g=v=>v==null||!fin(v)?'':+(+v).toPrecision(8);
    rows.push([T('Sezione','Section'), T('Grandezza','Quantity'), T('Valore','Value'), T('Unità','Unit'), T('Fonte o nota','Source or note')]);
    const par=(k,lab,u,v)=>rows.push([T('Parametri','Parameters'), lab, g(v), u, P.src[k]||'']);
    rows.push([T('Parametri','Parameters'), T('Adsorbato','Adsorbate'), P.gasName||'', '', P.src.sigma||'']);
    par('sigma', T('Sezione molecolare','Cross-sectional area'), 'nm²', P.sigma); par('T', T('Temperatura','Temperature'), 'K', P.T); par('rhoL', T('Densità del liquido','Liquid density'), 'g/cm³', P.rhoL); par('gamma', T('Tensione superficiale','Surface tension'), 'mN/m', P.gamma); par('M', T('Massa molare','Molar mass'), 'g/mol', P.M);
    rows.push([T('Parametri','Parameters'), 'STP', P.vmol, 'cm³/mol', P.stp==='iupac'?'0 °C, 100 kPa':'0 °C, 101,325 kPa (Kaomi)']);
    rows.push([T('Parametri','Parameters'), T('Modello di spessore','Thickness model'), THICK[P.thick]?THICK[P.thick].name:P.thick, '', P.src.thick||'']);
    const B=A.bet&&A.bet.used; if (B) rows.push(['BET', T('Area specifica','Specific surface area'), g(B.area), 'm²/g', `p/p₀ ${g(B.x0)}–${g(B.x1)}, ${B.npts} ${T('punti','points')}`], ['BET','C', g(B.C), '', ''], ['BET', 'nₘ', g(B.nm), 'cm³ STP/g', ''], ['BET', T('Pendenza','Slope'), g(B.slope), '', ''], ['BET', T('Intercetta','Intercept'), g(B.icpt), '', ''], ['BET', 'r', g(B.r), '', T('criteri di Rouquerol','Rouquerol criteria')+': '+['a','b','c','d'].map(k=>k+(B.crit&&B.crit[k]?'✓':'✗')).join(' ')]);
    if (A.bet && A.bet.instr) rows.push(['BET', T('Area con l\'intervallo dello strumento','Area with the instrument range'), g(A.bet.instr.area), 'm²/g', `p/p₀ ${g(A.bet.instr.x0)}–${g(A.bet.instr.x1)}; ${T('differenza','difference')} ${g(A.bet.diffInstrPct)} %`]);
    const Lg=A.langmuir; if (Lg && !Lg.err) rows.push(['Langmuir', T('Area (lineare)','Area (linear)'), g(Lg.lin.area), 'm²/g', `p/p₀ ${Lg.range.join('–')}`], ['Langmuir', T('Area (non lineare)','Area (non-linear)'), g(Lg.nl.area), 'm²/g', ''], ['Langmuir','K', g(Lg.nl.K), '', '']);
    const V=A.tpv; if (V && !V.err) rows.push([T('Pori','Pores'), T('Volume totale dei pori','Total pore volume'), g(V.V), 'cm³/g', `p/p₀ ${g(V.x)}; d < ${g(V.dmax)} Å`], [T('Pori','Pores'), T('Diametro medio 4V/S','Average diameter 4V/S'), g(V.dAvg), 'Å', '']);
    const t=A.tplot; if (t && !t.err) rows.push(['t-plot', T('Area esterna','External area'), g(t.Sext), 'm²/g', t.modelName], ['t-plot', T('Volume dei micropori','Micropore volume'), g(t.Vmicro), 'cm³/g', 'r '+g(t.r)]);
    for (const [k,lab] of [['bjh','BJH'],['dh','DH']]){ const b=A[k]; if (b && !b.err) rows.push([lab, T('Volume cumulato','Cumulative volume'), g(b.Vtot), 'cm³/g', T('ramo','branch')+' '+b.branch], [lab, T('Area cumulata','Cumulative area'), g(b.Atot), 'm²/g', ''], [lab, T('Moda dV(d)','Mode dV(d)'), g(b.mode), 'Å', '']); }
    for (const [k,lab] of [['dr','DR'],['da','DA']]){ const d=A[k]; if (d && !d.err) rows.push([lab, 'W₀', g(d.W0), 'cm³/g', `p/p₀ ${g(d.range[0])}–${g(d.range[1])}`], [lab, 'E', g(d.E), 'kJ/mol', ''], [lab, 'n', g(d.n), '', '']); }
    if (A.dft && !A.dft.err) rows.push(['DFT', T('Volume','Volume'), g(A.dft.Vtot), 'cm³/g', A.dft.label]);
    if (A.iupac) rows.push([T('Isoterma','Isotherm'), T('Tipo IUPAC (suggerimento)','IUPAC type (suggestion)'), A.iupac.type+(A.iupac.hyst?' · '+A.iupac.hyst:''), '', A.iupac.why.join('; ')]);
    (A.warnings||[]).forEach(w=>rows.push([T('Avvisi','Warnings'), w.lv==='stop'?T('grave','serious'):T('attenzione','warning'), '', '', w.t]));
    rows.push([]); rows.push([T('Ramo','Branch'), 'p/p₀', T('Quantità','Amount'), 'cm³ STP/g', 'mmol/g']);
    for (const br of ['ads','des']){ const b=branchOf(iso, br); b.x.forEach((x,i)=>rows.push([br, g(x), g(b.n[i]), g(b.n[i]), g(toMmol(b.n[i]))])); }
    return rows;
  }

  /* =====================================================================================================
     CHEMISORBIMENTO (SPEC §6). Formati Kaomi non noti: i calcoli lavorano su dati già letti.
     ===================================================================================================== */
  const METALS={   // M g/mol, ρ g/cm³, a_m nm² per atomo superficiale (valori tipici; Bergeret & Gallezot 2008): DEDOTTI, sempre modificabili
    Pt:{M:195.084, rho:21.45, am:0.08}, Pd:{M:106.42, rho:12.02, am:0.0787}, Ni:{M:58.693, rho:8.90, am:0.0649}, Rh:{M:102.906, rho:12.41, am:0.0752},
    Ru:{M:101.07, rho:12.45, am:0.0613}, Ir:{M:192.217, rho:22.56, am:0.0769}, Cu:{M:63.546, rho:8.96, am:0.068}, Co:{M:58.933, rho:8.90, am:0.0662},
    Ag:{M:107.868, rho:10.49, am:0.087}, Au:{M:196.967, rho:19.30, am:0.0875}, Fe:{M:55.845, rho:7.87, am:0.0614}
  };
  /* dalla quantità adsorbita al metallo. uptake in µmol di gas per g di campione; SF = atomi di metallo per molecola (H₂ su Pt: 2) */
  function metalDispersion(o){
    const W=[], M=Object.assign({}, METALS[o.metal]||{}, o.M!=null?{M:o.M}:{}, o.rho!=null?{rho:o.rho}:{}, o.am!=null?{am:o.am}:{});
    if (!(o.loading>0)) W.push({lv:'stop', t:'Dispersione senza carico metallico'});
    if (!(o.SF>0)) W.push({lv:'stop', t:'Dispersione senza stechiometria'});
    if (!(o.uptake>=0)) W.push({lv:'stop', t:'Quantità adsorbita mancante'});
    if (W.length) return {err:'dati', warn:W};
    const Ns=o.uptake*1e-6*NA*o.SF, wmet=o.loading/100, D=Ns*M.M/(NA*wmet);   // atomi superficiali per g di campione; dispersione (frazione)
    const vm=M.M&&M.rho?M.M/(M.rho*NA)*1e21:NaN, f=o.shape||6;   // nm³ per atomo
    const areaS=M.am?Ns*M.am*1e-18:NaN, areaM=areaS/wmet, d=fin(vm)&&M.am?f*vm/(M.am*D):NaN;
    if (D>1) W.push({lv:'warn', t:'Dispersione oltre il 100%: spillover, stechiometria o carico sbagliati'});
    W.push({lv:'warn', t:f===6?'Diametro valido solo per la forma ipotizzata (fattore 6, sfera o cubo con una faccia sul supporto)':`Diametro valido solo per la forma ipotizzata (fattore ${f})`});
    return {Ns, D, Dpct:100*D, areaSample:areaS, areaMetal:areaM, d, vm, am:M.am, M:M.M, shape:f, warn:W};
  }
  /* impulsi: aree per impulso, volume del loop (cm³) a T (K) e p (kPa), frazione del gas attivo nella miscela */
  function pulseUptake(o){
    const A=o.areas||[], W=[]; if (!(o.loopVol>0)) W.push({lv:'stop', t:'Quantità assoluta senza volume del loop'});
    if (A.length<3) W.push({lv:'stop', t:'Servono almeno 3 impulsi'}); if (W.length) return {err:'dati', warn:W};
    const k=o.nSat||3, tol=o.tol!=null?o.tol:0.02, last=A.slice(-k), mean=last.reduce((s,v)=>s+v,0)/last.length;
    const sat=last.every(v=>Math.abs(v-mean)<=tol*mean); if (!sat) W.push({lv:'stop', t:`Impulsi non saturati: gli ultimi ${k} differiscono più del ${(tol*100).toFixed(0)}%`});
    const Asat=o.Asat>0?o.Asat:mean, T=o.T||298.15, p=o.p||101.325, fr=o.frac!=null?o.frac:1;
    const vStp=o.loopVol*(p/101.325)*(273.15/T)*fr, molPerPulse=vStp/VMOL.stp;   // mol di gas attivo per impulso
    let frac=0; const per=A.map(a=>{ const u=Math.max(0,(Asat-a)/Asat); frac+=u; return u; });
    const umol=frac*molPerPulse*1e6, perG=o.mass_g>0?umol/o.mass_g:NaN;
    return {Asat, saturated:sat, per, uptakeUmol:umol, uptakeUmolPerG:perG, vStpPulse:vStp, warn:W};
  }
  /* statico (ASTM D3908): combinata − ripetuta, estrapolate a p = 0 con una retta nel tratto lineare [pa, pb] */
  function staticChem(comb, rep, opt){
    opt=opt||{}; const pa=opt.pa!=null?opt.pa:-Infinity, pb=opt.pb!=null?opt.pb:Infinity, sel=s=>{ const i=s.p.map((_,k)=>k).filter(k=>s.p[k]>=pa && s.p[k]<=pb); return {p:i.map(k=>s.p[k]), n:i.map(k=>s.n[k])}; };
    const c=sel(comb), r=rep?sel(rep):null, Lc=linfit(c.p, c.n); if (!Lc) return {err:'pochi'};
    const Lr=r && r.p.length>=2 ? linfit(r.p, r.n) : null;
    return {total:Lc.icpt, weak:Lr?Lr.icpt:null, strong:Lr?Lc.icpt-Lr.icpt:Lc.icpt, Lc, Lr, method:'estrapolazione lineare a p = 0 (ASTM D3908)'};
  }
  /* TPR, TPO, TPD: segnale contro temperatura MISURATA. t in min (facoltativo), T in °C o K, s = segnale TCD.
     Base lineare tra le finestre agli estremi; area nel tempo (s·min) se c'è il tempo, altrimenti nella temperatura diviso per β. */
  function tpx(o){
    const T=o.T, s=o.s, n=T.length, W=[]; if (n<10) return {err:'pochi'};
    const t=o.t&&o.t.length===n?o.t:null, wf=o.edge||0.05, e=Math.max(2,Math.round(n*wf));
    const ix=[...Array(e).keys()].concat([...Array(e).keys()].map(k=>n-1-k)), L=linfit(ix.map(i=>t?t[i]:T[i]), ix.map(i=>s[i]));
    const base=i=>L?L.icpt+L.slope*(t?t[i]:T[i]):0, y=s.map((v,i)=>v-base(i));
    // rampa: lineare se T contro t non si scosta più dell'1% dell'escursione
    let beta=o.beta||null; if (t){ const F=linfit(t, T); if (F){ beta=F.slope; let mx=0; for (let i=0;i<n;i++) mx=Math.max(mx, Math.abs(T[i]-F.icpt-F.slope*t[i])); if (mx>0.01*Math.abs(T[n-1]-T[0])) W.push({lv:'warn', t:'Rampa non lineare: controlla la temperatura misurata'}); } }
    else W.push({lv:'warn', t:'Senza il tempo l\'area si calcola con la rampa nominale: controlla che T sia quella misurata'});
    let area=0; for (let i=1;i<n;i++){ const dx=t?t[i]-t[i-1]:(T[i]-T[i-1])/(beta||1); area+=(y[i]+y[i-1])/2*dx; }
    let pk=0; for (let i=1;i<n;i++) if (y[i]>y[pk]) pk=i;
    // massimi locali significativi
    const hmax=y[pk], peaks=[]; for (let i=2;i<n-2;i++) if (y[i]>y[i-1] && y[i]>=y[i+1] && y[i]>0.1*hmax){ if (!peaks.length || Math.abs(T[i]-T[peaks[peaks.length-1]])>5) peaks.push(i); else if (y[i]>y[peaks[peaks.length-1]]) peaks[peaks.length-1]=i; }
    const drift=L?Math.abs(L.slope*((t?t[n-1]:T[n-1])-(t?t[0]:T[0]))):0; if (hmax>0 && drift>0.05*hmax) W.push({lv:'warn', t:`Deriva della linea di base ${(100*drift/hmax).toFixed(1)}% dell'altezza del picco (oltre il 5%)`});
    const out={area, y, base:s.map((_,i)=>base(i)), Tm:T[pk], peaks:peaks.map(i=>({T:T[i], h:y[i]})), beta, warn:W};
    if (o.factor>0){ out.umol=area*o.factor; if (o.mass_g>0) out.umolPerG=out.umol/o.mass_g; if (o.theo>0) out.reduction=out.umol/o.theo; }
    else W.push({lv:'stop', t:'Quantità assoluta senza fattore TCD tarato: il risultato è solo qualitativo'});
    return out;
  }
  /* fattore TCD da uno standard: µmol di gas consumato per unità d'area (CuO → Cu: 1 H₂ per CuO) */
  function tcdFactor(o){ const mol=o.mass_mg/1000/(o.Mstd||79.545)*(o.stoich||1)*1e6; return {factor:mol/o.area, umol:mol, std:o.std||'CuO', lot:o.lot||'', date:o.date||''}; }
  function kissinger(list){   // list: [{beta (K/min), Tm (K)}]
    if (!list || list.length<3) return {err:'rampe', warn:[{lv:'stop', t:'Kissinger con meno di 3 rampe'}]};
    const F=linfit(list.map(o=>1/o.Tm), list.map(o=>Math.log(o.beta/(o.Tm*o.Tm)))); if (!F) return {err:'fit'};
    return {E:-F.slope*R/1000, uE:F.seS*R/1000, r:F.r, A:Math.exp(F.icpt)*(-F.slope), warn:[]};
  }
  function redhead(Tm, beta, nu){ const v=nu||1e13, b=beta/60; return {E:R*Tm*(Math.log(v*Tm/b)-3.64)/1000, nu:v, warn:[{lv:'warn', t:`Redhead con ν supposto (${v.toExponential(0)} s⁻¹): il valore dipende da questa ipotesi`}]}; }
  // Monti–Baiker: K = S0/(V*·C0), S0 µmol di specie riducibile, V* flusso totale cm³/s (STP), C0 µmol/cm³ di H₂; 55–140 s
  function montiBaiker(o){ const C0=o.c0!=null?o.c0:o.frac*1e6/VMOL.stp, K=o.S0/(o.flow*C0), P=o.beta!=null?K*o.beta/60:null; return {K, P, warn:K<55||K>140?[{lv:'warn', t:`Parametro di Monti–Baiker K = ${K.toFixed(0)} s fuori da 55–140 s`}]:[]}; }
  /* simulazione Polanyi–Wigner (solo per i test e la didattica): dθ/dt = −ν θⁿ exp(−E/RT), T = T0 + β t */
  function polanyiWigner(o){ const E=o.E*1000, nu=o.nu, b=o.beta/60, n=o.order||1, dt=o.dt||0.01; let th=1, T=o.T0, tt=0; const Ts=[], r=[];
    while (th>1e-8 && T<o.T1){ const k=th>0?nu*Math.pow(th,n)*Math.exp(-E/(R*T)):0; const k1=k, th2=Math.max(0,th-k1*dt/2), T2=T+b*dt/2, k2=nu*Math.pow(th2,n)*Math.exp(-E/(R*T2)); th=Math.max(0,th-k2*dt); T+=b*dt; tt+=dt; Ts.push(T); r.push(k2); }
    return {T:Ts, rate:r}; }
  /* lettore TPx tollerante (DEDOTTO): colonne tempo, temperatura, segnale TCD (eventuali m/z) */
  function parseTPx(text){
    const lines=text.split(/\r\n|\n|\r/), sep=guessSep(lines), B=blocksOf(lines, sep).sort((a,b)=>b.rows.length-a.rows.length)[0]; if (!B || B.rows.length<10) return null;
    const h=B.head.slice(-2).join(' '), cells=cellsOf(B.head[B.head.length-1]||'', sep).map(norm);
    const find=re=>cells.findIndex(c=>re.test(c)); let it=find(/time|tempo|zeit/), iT=find(/temp/), iS=find(/tcd|signal|segnale|detector|rivelatore/);
    if (iT<0 || iS<0) return {guided:true, why:'Non riconosco con certezza le colonne di temperatura e segnale'};
    const kind=/tpr/i.test(text)?'TPR':/tpo/i.test(text)?'TPO':/tpd/i.test(text)?'TPD':'TPx', inC=/°c|degc|\bc\b/i.test(h)||!/\bk\b/i.test(h);
    return {kind, t:it>=0?B.rows.map(r=>r[it]):null, T:B.rows.map(r=>r[iT]+(inC?273.15:0)), s:B.rows.map(r=>r[iS]), meta:readHeader(text)};
  }

  /* ---------------- chemisorbimento: lettore unico (DEDOTTO: nessun esempio pubblico dei file di Kaomi React) ----------------
     parseChem(text) → null | {chem:{kind, …}, reason} | {guided:true, why, table}. kind: TPR, TPO, TPD, TPSR, TPx, pulse, static */
  const CHEM_KW=/\b(TPR|TPO|TPD|TPSR)\b|temperature.?programmed|programmata in temperatura|pulse\s*(chemisorption|titration|no\.?|number)|titolazione a impulsi|impulsi|chemisorption|chemisorbimento|chemisorbtion|combined isotherm|repeat isotherm|isoterma combinata|isoterma ripetuta|acchiappaspettri chem/i;
  function chemHeader(text){
    const t=unbreak(String(text)), m=readHeader(text), num=v=>toNumber(String(v).replace(',','.'));
    const get=(re, conv)=>{ const r=re.exec(t); return r ? (conv?conv(r):num(r[1])) : null; };
    const loop=get(/(?:loop\s*vol(?:ume)?|volume\s*(?:del\s*)?loop|schleifenvolumen)\s*[:\t=,;]?\s*([-+]?\d+[.,]?\d*)\s*(µl|ul|ml|cm3|cm³|cc)?/i, r=>num(r[1])*(/µl|ul/i.test(r[2]||'')?1e-3:1));
    const flow=get(/(?:flow(?:\s*rate)?|portata|fluss)\s*[:\t=,;]?\s*([-+]?\d+[.,]?\d*)\s*(cm3|cm³|ml|sccm)/i);
    const ramp=get(/(?:ramp(?:\s*rate)?|rampa|heating\s*rate|velocit[aà]\s*di\s*riscaldamento|heizrate)\s*[:\t=,;]?\s*([-+]?\d+[.,]?\d*)\s*(?:°c|k|c)\s*\/\s*min/i);
    const frac=get(/(\d+[.,]?\d*)\s*%\s*(H2|CO|O2|NH3|N2O)\b/i, r=>num(r[1])/100);
    const loopT=get(/(?:loop\s*temp(?:erature)?|temperatura\s*(?:del\s*)?loop)\s*[:\t=,;]?\s*([-+]?\d+[.,]?\d*)\s*(°c|k|c)?/i, r=>num(r[1])+(/k/i.test(r[2]||'')?0:273.15));
    const metal=(/(?:metal|metallo|active\s*metal)\s*[:\t=,;]?\s*(Pt|Pd|Ni|Rh|Ru|Ir|Cu|Co|Ag|Au|Fe)\b/i.exec(t)||[])[1]||null;
    const loading=get(/(?:metal\s*loading|loading|carico\s*(?:metallico|di\s*metallo)?)\s*[:\t=,;]?\s*([-+]?\d+[.,]?\d*)\s*(?:%|wt)/i);
    const SF=get(/(?:stoichiometry(?:\s*factor)?|stechiometria|stoichiometric\s*factor)\s*[:\t=,;]?\s*([-+]?\d+[.,]?\d*)/i);
    const gas=(/(?:gas|analysis\s*gas|probe\s*gas|gas\s*sonda|adsorbate)\s*[:\t=,;]?\s*(?:\d+[.,]?\d*\s*%\s*)?(H2|CO|O2|NH3|N2O|CO2)\b/i.exec(t)||[])[1]||null;
    return Object.assign(m, {loopVol:loop, flow, ramp, frac, loopT, metal, loading, SF, probe:gas});
  }
  function parseChem(text, name){
    if (typeof text!=='string' || text.length<20) return null;
    const head=text.slice(0,6000); if (!CHEM_KW.test(head)) return null;
    const lines=text.split(/\r\n|\n|\r/), sep=guessSep(lines), blocks=blocksOf(lines, sep).filter(b=>b.rows.length>=3), meta=chemHeader(text);
    const canon=/acchiappaspettri chem v1;\s*kind=(\w+)/i.exec(head);
    const isPulse=canon?canon[1]==='pulse':/pulse|impuls/i.test(head) && !/\b(TPR|TPO|TPD|TPSR)\b/.test(head), isStatic=canon?canon[1]==='static':/combined|repeat|combinata|ripetuta|static\s*chemisorption|chemisorbimento\s*statico/i.test(head);
    const cellNames=b=>cellsOf(b.head[b.head.length-1]||'', sep).map(c=>norm(c).trim()).filter(Boolean);
    const guided=why=>{ const b=blocks.sort((u,v)=>v.rows.length-u.rows.length)[0]; return b ? {guided:true, chemGuided:true, why, table:{names:cellNames(b), k:b.k, rows:b.rows, units:[]}, meta} : null; };
    if (isPulse){
      const b=blocks.sort((u,v)=>v.rows.length-u.rows.length)[0]; if (!b) return null; const c=cellNames(b), iA=c.findIndex(x=>/area|integral|signal|segnale/.test(x)); if (iA<0 || c.length!==b.k) return guided('Titolazione a impulsi: non riconosco con certezza la colonna delle aree');
      return {chem:{kind:'pulse', areas:b.rows.map(r=>r[iA]), meta}, reason:'chemisorbimento a impulsi'+(meta.probe?' ('+meta.probe+')':'')};
    }
    if (isStatic){
      const isoB=blocks.filter(b=>{ const c=cellNames(b); return c.length===b.k && c.some(x=>/press/.test(x)) && c.some(x=>/vol|amount|quantit|uptake/.test(x)); });
      if (!isoB.length) return guided('Chemisorbimento statico: non riconosco con certezza le colonne di pressione e quantità');
      const tag=b=>/repeat|ripetuta|second|weak|debole/i.test(b.head.join(' '))?'rep':'comb', P={};
      for (const b of isoB){ const c=cellNames(b), ip=c.findIndex(x=>/press/.test(x)), iv=c.findIndex(x=>/vol|amount|quantit|uptake/.test(x)), pu=(unitOf(c[ip])||{}).u||'', nu=(unitOf(c[iv])||{}).u||'';
        if (!pu || !nu) return guided('Chemisorbimento statico: unità di pressione o quantità non indicate');
        const k=tag(b); if (P[k]) continue; const pk=P_UNITS[pu]; const nk=/mmol\/g/.test(nu)?VMOL.stp/1000:/umol\/g|µmol\/g/.test(nu)?VMOL.stp/1e6:/\/g/.test(nu)?1:null; if (!pk || nk==null) return guided('Chemisorbimento statico: unità non riconosciute');
        P[k]={p:b.rows.map(r=>r[ip]*pk/1000), n:b.rows.map(r=>r[iv]*nk)}; }   // p in kPa, n in cm³ STP/g
      if (!P.comb) return guided('Chemisorbimento statico: manca l\'isoterma combinata');
      return {chem:{kind:'static', comb:P.comb, rep:P.rep||null, meta}, reason:'chemisorbimento statico'+(meta.probe?' ('+meta.probe+')':'')};
    }
    const t=parseTPx(text); if (!t) return null; if (t.guided) return guided('TPx: '+t.why.charAt(0).toLowerCase()+t.why.slice(1));
    if (canon) t.kind=canon[1];
    return {chem:{kind:t.kind, t:t.t, T:t.T, s:t.s, meta:Object.assign(meta, t.meta)}, reason:'curva '+t.kind+' (temperatura misurata, segnale TCD)'};
  }
  // importazione guidata del chemisorbimento: testo canonico riletto da parseChem
  function toChemText(o){ const L=['Acchiappaspettri chem v1; kind='+o.kind];
    if (o.mass_g>0) L.push('Sample Weight: '+o.mass_g+' g'); if (o.loopVol>0) L.push('Loop Volume: '+o.loopVol+' cm3'); if (o.ramp>0) L.push('Ramp: '+o.ramp+' °C/min');
    if (o.kind==='pulse'){ L.push('Pulse;Area'); o.y.forEach((v,i)=>L.push((i+1)+';'+v)); }
    else if (o.kind==='static'){ L.push('Combined isotherm','Pressure (kPa);Volume (cm3 STP/g)'); o.x.forEach((v,i)=>L.push(v+';'+o.y[i])); }
    else { L.push('Time (min);Temperature (°C);TCD Signal'); o.x.forEach((v,i)=>L.push((o.t?o.t[i]:i)+';'+v+';'+o.y[i])); }
    return L.join('\n')+'\n'; }
  function chemAnalyze(c, o){ o=o||{}; const out={warn:[]}, m=c.meta||{};
    if (c.kind==='pulse'){ out.pulse=pulseUptake({areas:c.areas, loopVol:o.loopVol!=null?o.loopVol:m.loopVol, T:o.loopT||m.loopT||298.15, p:o.p||101.325, frac:o.frac!=null?o.frac:(m.frac!=null?m.frac:1), nSat:o.nSat, tol:o.tol, mass_g:o.mass_g!=null?o.mass_g:m.mass_g}); out.uptake=out.pulse.uptakeUmolPerG; out.warn.push(...(out.pulse.warn||[])); }
    else if (c.kind==='static'){ out.stat=staticChem(c.comb, c.rep, {pa:o.pa, pb:o.pb}); if (!out.stat.err){ out.uptake=out.stat.strong/VMOL.stp*1e6; if (!c.rep) out.warn.push({lv:'warn', t:'Senza isoterma ripetuta: l\'uptake è quello totale (forte + debole)'}); } }
    else { const b=o.beta||m.ramp||null; out.tpx=tpx({t:c.t, T:c.T.map(v=>v), s:c.s, beta:b, factor:o.factor, mass_g:o.mass_g!=null?o.mass_g:m.mass_g, theo:o.theo}); out.warn.push(...(out.tpx.warn||[]));
      if (out.tpx && fin(out.tpx.Tm)){ out.redhead=redhead(out.tpx.Tm, out.tpx.beta||b||10, o.nu); out.warn.push(...out.redhead.warn); }
      if (o.S0>0 && o.flow>0 && (o.frac>0 || m.frac>0)){ out.mb=montiBaiker({S0:o.S0, flow:o.flow/60, frac:o.frac||m.frac, beta:out.tpx.beta}); out.warn.push(...out.mb.warn); }
      if (c.kind==='TPR' && !o.coldTrap) out.warn.push({lv:'warn', t:'Acqua nel TCD: senza trappola fredda il segnale del TPR comprende l\'acqua prodotta'}); }
    if (o.disp){ const d=Object.assign({}, o.disp); if (d.uptake==null && out.uptake!=null) d.uptake=out.uptake; if (d.metal==null) d.metal=m.metal; if (d.loading==null) d.loading=m.loading; if (d.SF==null) d.SF=m.SF; out.disp=metalDispersion(d); out.warn.push(...(out.disp.warn||[])); }
    return out; }
  function chemCsvRows(c, A, en){ const T=(it,e)=>en?e:it, g=v=>v==null||!fin(v)?'':+(+v).toPrecision(8), rows=[[T('Sezione','Section'),T('Grandezza','Quantity'),T('Valore','Value'),T('Unità','Unit'),T('Nota','Note')]];
    rows.push([T('Misura','Measurement'), T('Tipo','Kind'), c.kind, '', '']);
    if (A.tpx){ rows.push(['TPx', T('Area (base lineare)','Area (linear baseline)'), g(A.tpx.area), T('segnale·min','signal·min'), A.tpx.beta?`β ${g(A.tpx.beta)} K/min`:''], ['TPx','Tm', g(A.tpx.Tm), 'K', ''], ['TPx', T('Quantità','Amount'), g(A.tpx.umol), 'µmol', A.tpx.umol==null?T('senza fattore TCD','without TCD factor'):''], ['TPx', T('Grado di riduzione','Degree of reduction'), g(A.tpx.reduction), '', '']); (A.tpx.peaks||[]).forEach((q,i)=>rows.push(['TPx', T('Picco ','Peak ')+(i+1), g(q.T), 'K', ''])); }
    if (A.redhead) rows.push(['Redhead','E', g(A.redhead.E), 'kJ/mol', 'ν '+A.redhead.nu.toExponential(0)+' s⁻¹ ('+T('supposto','assumed')+')']);
    if (A.mb) rows.push(['Monti–Baiker','K', g(A.mb.K), 's', '55–140 s']);
    if (A.pulse && !A.pulse.err) rows.push([T('Impulsi','Pulses'), 'A_sat', g(A.pulse.Asat), '', A.pulse.saturated?T('saturati','saturated'):T('non saturati','not saturated')], [T('Impulsi','Pulses'), 'uptake', g(A.pulse.uptakeUmol), 'µmol', ''], [T('Impulsi','Pulses'), 'uptake', g(A.pulse.uptakeUmolPerG), 'µmol/g', '']);
    if (A.stat && !A.stat.err) rows.push([T('Statico','Static'), T('totale','total'), g(A.stat.total), 'cm³ STP/g', A.stat.method], [T('Statico','Static'), T('debole','weak'), g(A.stat.weak), 'cm³ STP/g', ''], [T('Statico','Static'), T('forte','strong'), g(A.stat.strong), 'cm³ STP/g', '']);
    if (A.disp && !A.disp.err) rows.push([T('Metallo','Metal'), T('Dispersione','Dispersion'), g(A.disp.Dpct), '%', ''], [T('Metallo','Metal'), T('Area metallica','Metal area'), g(A.disp.areaSample), T('m²/g campione','m²/g sample'), ''], [T('Metallo','Metal'), T('Area metallica','Metal area'), g(A.disp.areaMetal), T('m²/g metallo','m²/g metal'), ''], [T('Metallo','Metal'), T('Diametro medio','Mean diameter'), g(A.disp.d), 'nm', T('fattore di forma ','shape factor ')+A.disp.shape]);
    (A.warn||[]).forEach(w=>rows.push([T('Avvisi','Warnings'), w.lv==='stop'?T('grave','serious'):T('attenzione','warning'), '', '', w.t]));
    return rows; }
  /* impostazioni salvate nel progetto (memoria dello spettro, an.sorp e an.chem): solo valori controllati, nessun campo sconosciuto */
  function cleanOpt(kind, v){
    if (!v || typeof v!=='object' || Array.isArray(v)) return null; const o={}, num=x=>typeof x==='number' && Number.isFinite(x), pair=x=>Array.isArray(x) && x.length===2 && x.every(num) && x[0]<x[1];
    const str=(x,re)=>typeof x==='string' && x.length<=40 && re.test(x);
    if (kind==='sorp'){
      if (v.over && typeof v.over==='object'){ const w={}; for (const k of ['sigma','T','rhoL','gamma','M','theta']) if (num(v.over[k]) && v.over[k]>=0) w[k]=v.over[k]; if (ADSORBATES[v.over.gas]) w.gas=v.over.gas; if (['stp','iupac'].includes(v.over.stp)) w.stp=v.over.stp; if (THICK[v.over.thick]) w.thick=v.over.thick; if (Object.keys(w).length) o.over=w; }
      for (const k of ['betRange','langRange','drRange']) if (pair(v[k]) && v[k][0]>=0 && v[k][1]<=1) o[k]=v[k].slice();
      if (v.tRange && pair(v.tRange.x)) o.tRange={x:v.tRange.x.slice()};
      if (THICK[v.tModel]) o.tModel=v.tModel; if (THICK[v.bjhThick]) o.bjhThick=v.bjhThick; if (['ads','des'].includes(v.bjhBranch)) o.bjhBranch=v.bjhBranch; if (v.tpvMode==='interp') o.tpvMode='interp';
      if (num(v.tpvX) && v.tpvX>0 && v.tpvX<1) o.tpvX=v.tpvX; if (num(v.lambda) && v.lambda>=0) o.lambda=v.lambda; if (num(v.alphaS) && v.alphaS>0) o.alphaS=v.alphaS;
      if (typeof v.alphaRefKey==='string' && v.alphaRefKey.length<=300) o.alphaRefKey=v.alphaRefKey; if (v.mmol===true) o.mmol=true; if (v.logx===true) o.logx=true;
      if (Array.isArray(v.qstKeys)) o.qstKeys=v.qstKeys.filter(x=>typeof x==='string' && x.length<=300).slice(0,20);
      const K=v.kernel; if (K && Array.isArray(K.x) && Array.isArray(K.w) && Array.isArray(K.K) && K.x.length>=5 && K.x.length<=400 && K.w.length>=2 && K.w.length<=200 && K.K.length===K.x.length && K.x.every(num) && K.w.every(num) && K.K.every(r=>Array.isArray(r) && r.length===K.w.length && r.every(num))) o.kernel={name:String(K.name||'').slice(0,80), x:K.x.slice(), w:K.w.slice(), K:K.K.map(r=>r.slice())};
    } else if (kind==='chem'){
      for (const k of ['factor','mass_g','theo','beta','nu','loopVol','loopT','p','frac','nSat','tol','pa','pb','S0','flow']) if (num(v[k]) && v[k]>=0) o[k]=v[k];
      if (v.coldTrap===true) o.coldTrap=true;
      if (v.disp && typeof v.disp==='object'){ const d={}; for (const k of ['loading','SF','uptake','M','rho','am','shape']) if (num(v.disp[k]) && v.disp[k]>=0) d[k]=v.disp[k]; if (METALS[v.disp.metal]) d.metal=v.disp.metal; if (Object.keys(d).length) o.disp=d; }
      if (Array.isArray(v.kissKeys)) o.kissKeys=v.kissKeys.filter(x=>typeof x==='string' && x.length<=300).slice(0,20);
    } else return null;
    return Object.keys(o).length ? o : null;
  }
  /* XLSX (Office Open XML): testo con tabulazioni dai fogli, senza DOM (regex sugli XML). DEDOTTO: le cartelle di lavoro di Kaomi non sono documentate */
  function xmlText(s){ return s.replace(/<[^>]+>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(_,d)=>String.fromCharCode(+d)).replace(/&#x([0-9a-f]+);/gi,(_,h)=>String.fromCharCode(parseInt(h,16))).replace(/&amp;/g,'&'); }
  function xlsxToText(o){   // o: {shared: xml|null, sheets:[{name, xml}]}
    const ss=[]; if (o.shared){ const re=/<si>([\s\S]*?)<\/si>/g; let m; while ((m=re.exec(o.shared))) ss.push(xmlText((m[1].match(/<t[^>]*>[\s\S]*?<\/t>/g)||[]).join(''))); }
    const colIx=r=>{ const L=/^([A-Z]+)/.exec(r); let n=0; if (L) for (const ch of L[1]) n=n*26+ch.charCodeAt(0)-64; return n-1; };
    const out=[]; for (const sh of o.sheets||[]){ const rows=[]; const re=/<row[^>]*>([\s\S]*?)<\/row>/g; let m;
      while ((m=re.exec(sh.xml))){ const cells=[]; const rc=/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g; let c; let auto=0;
        while ((c=rc.exec(m[1]))){ const attr=c[1], body=c[2]||'', ref=(/\br="([A-Z]+\d+)"/.exec(attr)||[])[1], t=(/\bt="(\w+)"/.exec(attr)||[])[1], ix=ref?colIx(ref):auto; auto=ix+1;
          let v=''; if (t==='s'){ const k=+((/<v>([\s\S]*?)<\/v>/.exec(body)||[])[1]); v=ss[k]!=null?ss[k]:''; } else if (t==='inlineStr') v=xmlText((body.match(/<t[^>]*>[\s\S]*?<\/t>/g)||[]).join('')); else { const vv=(/<v>([\s\S]*?)<\/v>/.exec(body)||[])[1]; v=vv!=null?xmlText(vv):''; }
          cells[ix]=String(v).replace(/[\t\r\n]+/g,' '); }
        rows.push(Array.from(cells, x=>x==null?'':x).join('\t').replace(/\t+$/,'')); }
      if (rows.some(r=>r.trim())) out.push((o.sheets.length>1?'# '+sh.name+'\n':'')+rows.join('\n')); }
    return out.join('\n\n')+'\n';
  }

  return {VERSION:'1.0.0', NA, R, VMOL, P_UNITS, ADSORBATES, THICK, METALS, gasKey, thicknessKey, tOf, kelvinR, params, linfit, interp, nnls,
    splitBranches, buildIso, branch:branchOf, relOf, toMmol, betFit, betArea, betAuto, betAt, bet, rouquerolCheck, xAtN, langmuir, totalPoreVolume, avgPoreDiameter, tPlot, alphaS, bjh, drda, isosteric, dftFit,
    hysteresis, iupacSuggest, warnings, analyze, parseSorption, parseAIF, readHeader, parseKernel, toAIF, csvRows, colKind, unitOf, toNumber,
    metalDispersion, pulseUptake, staticChem, tpx, tcdFactor, kissinger, redhead, montiBaiker, polanyiWigner, parseTPx, parseChem, chemHeader, chemAnalyze, chemCsvRows, toChemText, cleanOpt, xlsxToText};
});
