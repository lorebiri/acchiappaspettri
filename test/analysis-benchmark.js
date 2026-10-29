// Benchmark degli strumenti di analisi di Acchiappaspettri: dati sintetici con verità nota.
// Deconvoluzione (Levenberg–Marquardt, pseudo-Voigt), linee di base arPLS e SNIP, rimozione dei raggi cosmici,
// calibrazione (copertura degli intervalli di confidenza, LOD, test di Mandel), PCA + cluster di Ward, miscele (NNLS),
// figure di merito cromatografiche, band gap di Tauc, onset DSC, doppio integrale EPR.
// Uso:  node test/analysis-benchmark.js        (oppure N=100 node test/analysis-benchmark.js)
const fs=require('fs'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
eval(html.slice(html.indexOf('/*CORE-START*/'), html.indexOf('/*CORE-END*/'))+';global.C={fitPeaks,deconvolve,fitEval,peakAreas,findPeaks,baselineArPLS,baselineSNIP,baselineOf,despike,calibrate,pcaNipals,preprocessRows,hcaWard,cutTree,suggestK,nnls,chromMetrics,taucGap,tangentOnset,eprDoubleIntegral,bandMeasure,median,plsCV,pigmentMatches,RAMAN_PIGMENTS,baselineArPLS,amideI,xrfIntensities,xrfQuantFit}');
function rng(seed){ let s=seed>>>0||1; return ()=>{ s^=s<<13; s>>>=0; s^=s>>>17; s^=s<<5; s>>>=0; return s/4294967296; }; }
function gauss(r){ let u=0,v=0; while(!u)u=r(); while(!v)v=r(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }
function poisson(r, l){ if (l>30) return Math.max(0, Math.round(l+Math.sqrt(l)*gauss(r))); let L=Math.exp(-l), k=0, p=1; do { k++; p*=r(); } while (p>L); return k-1; }
const G=(x,c,w,h)=>h*Math.exp(-4*Math.LN2*((x-c)/w)**2), Lz=(x,c,w,h)=>h/(1+4*((x-c)/w)**2);
const areaG=(w,h)=>h*w*Math.sqrt(Math.PI/(4*Math.LN2)), areaL=(w,h)=>h*w*Math.PI/2;
const N=+process.env.N||200;
const q=(a,f)=>{ const s=a.slice().sort((x,y)=>x-y); return s[Math.min(s.length-1, Math.floor(s.length*f))]; };
const pct=v=>(v>=0?'+':'')+v.toFixed(2)+'%';
const line=(label, txt)=>console.log(label.padEnd(52)+txt);

console.log('\n== Area dei picchi: integrazione valle-valle contro deconvoluzione (fit pseudo-Voigt) ==');
for (const [label, shape, opt] of [['Gaussiani isolati, rumore 0,5%','gauss',{noise:0.005}],['Lorentziani isolati (code lunghe)','lor',{noise:0.005}],
    ['Misti (pseudo-Voigt)','voigt',{noise:0.005}],['Misti, base curva (fit con base quadratica)','voigt',{noise:0.005,curve:true,base:'quad'}],['Gaussiani, rumore 2%','gauss',{noise:0.02}]]){
  const eInt=[], eFit=[];
  for (let s=1;s<=N;s++){ const r=rng(s*104729+label.length), n=2000;
    const k=1+Math.floor(r()*3), peaks=[]; for (let j=0;j<k;j++){ let c, t=0; do { c=10+r()*80; t++; } while (peaks.some(p=>Math.abs(p.c-c)<14) && t<50);
      peaks.push({c, w:0.6+r()*3, h:0.2+r(), eta: shape==='voigt'? r() : shape==='lor'?1:0}); }
    const xs=new Float64Array(n), ys=new Float64Array(n), sl=(r()-0.5)*0.01, b0=r()*0.3;
    for (let i=0;i<n;i++){ const x=100*i/(n-1); xs[i]=x; let y=b0+sl*x+(opt.curve?0.3*Math.sin(x/40):0); for (const p of peaks) y+=p.eta*Lz(x,p.c,p.w,p.h)+(1-p.eta)*G(x,p.c,p.w,p.h); ys[i]=y+gauss(r)*opt.noise*(0.5+r()); }
    const ar=C.peakAreas(xs, ys, peaks.map(p=>p.c));
    peaks.forEach((p,j)=>{ const A=p.eta*areaL(p.w,p.h)+(1-p.eta)*areaG(p.w,p.h); eInt.push((ar[j].area-A)/A*100);
      // fit su una finestra di ±8 FWHM attorno al picco, come quando si seleziona una zona del grafico
      const lo=p.c-8*p.w, hi=p.c+8*p.w, a=xs.findIndex(x=>x>=lo), b=xs.length-1-[...xs].reverse().findIndex(x=>x<=hi);
      const sx=xs.subarray(a,b+1), sy=ys.subarray(a,b+1), others=peaks.filter(o=>o!==p && o.c>lo && o.c<hi);
      const fit=C.fitPeaks(sx, sy, [p].concat(others).map(o=>({x:o.c+(r()-0.5)*0.3*o.w, w:o.w*(0.7+0.6*r())})), {profile:'pv', base:opt.base||'lin'});
      if (fit) eFit.push((fit.peaks[0].area-A)/A*100); });
  }
  line(label, `valle-valle ${pct(q(eInt,0.5))} (90% ±${q(eInt.map(Math.abs),0.9).toFixed(1)}%)   ·   fit ${pct(q(eFit,0.5))} (90% ±${q(eFit.map(Math.abs),0.9).toFixed(1)}%)`);
}

console.log('\n== Deconvoluzione automatica di bande sovrapposte (separazione 0,7–1,5 FWHM, nessun massimo locale richiesto) ==');
{ let okN=0, tot=0; const eA=[], eC=[];
  for (let s=1;s<=N;s++){ const r=rng(s*7717), n=1200, w=4+r()*4, sep=w*(0.7+0.8*r()), c1=50-sep/2, c2=50+sep/2, h1=0.5+r()*0.5, h2=(0.3+0.7*r())*h1, eta=r()*0.6;
    const xs=new Float64Array(n), ys=new Float64Array(n); for (let i=0;i<n;i++){ const x=100*i/(n-1); xs[i]=x; ys[i]=0.05+0.001*x+[ [c1,h1],[c2,h2] ].reduce((t,[c,h])=>t+eta*Lz(x,c,w,h)+(1-eta)*G(x,c,w,h),0)+gauss(r)*0.004; }
    const fp=C.findPeaks(xs, ys, 1, 5, 10).map(p=>p.x), fit=C.deconvolve(xs, ys, {seeds:fp, profile:'pv'}); tot++;
    if (fit && fit.peaks.length===2){ okN++; const A=[[c1,h1],[c2,h2]].map(([c,h])=>eta*areaL(w,h)+(1-eta)*areaG(w,h));
      fit.peaks.forEach((p,j)=>{ eA.push((p.area-A[j])/A[j]*100); eC.push(Math.abs(p.c-[c1,c2][j])/w); }); }
  }
  line('Numero di componenti corretto', `${okN}/${tot} (${(100*okN/tot).toFixed(1)}%)`);
  line('Errore sull\'area (componenti trovate)', `mediano ${pct(q(eA,0.5))}, 90% entro ±${q(eA.map(Math.abs),0.9).toFixed(1)}%`);
  line('Errore sulla posizione (in FWHM)', `mediano ${q(eC,0.5).toFixed(3)}, 95% entro ${q(eC,0.95).toFixed(3)}`);
}

console.log('\n== Linea di base sotto una forte fluorescenza (Raman): arPLS contro inviluppo convesso ==');
{ const eArp=[], eRub=[];
  for (let s=1;s<=N;s++){ const r=rng(s*31337), n=1200, xs=new Float64Array(n), ys=new Float64Array(n), bg=new Float64Array(n), peaks=[];
    for (let j=0;j<4+Math.floor(r()*6);j++) peaks.push({c:250+r()*1500, w:6+r()*20, h:0.05+r()});
    const A=1+r()*3, t0=300+r()*900, cv=(r()-0.5)*1.5;
    for (let i=0;i<n;i++){ const x=200+1600*i/(n-1), t=(x-200)/1600; xs[i]=x; bg[i]=A*Math.exp(-(((x-t0)/900)**2))+cv*t*t+0.3*t; ys[i]=bg[i]+peaks.reduce((v,p)=>v+Lz(x,p.c,p.w,p.h),0)+gauss(r)*0.006; }
    const hmax=Math.max(...peaks.map(p=>p.h)), ba=C.baselineArPLS(xs, ys), br=C.baselineOf(xs, ys, 'rubber', false);
    let ra=0, rr=0; for (let i=0;i<n;i++){ ra+=(ba[i]-bg[i])**2; rr+=(br[i]-bg[i])**2; } eArp.push(Math.sqrt(ra/n)/hmax*100); eRub.push(Math.sqrt(rr/n)/hmax*100); }
  line('Errore RMS della base (% del picco più alto)', `arPLS mediano ${q(eArp,0.5).toFixed(2)}% (90%: ${q(eArp,0.9).toFixed(2)}%) · inviluppo ${q(eRub,0.5).toFixed(2)}% (90%: ${q(eRub,0.9).toFixed(2)}%)`);
}

console.log('\n== XRF: fondo SNIP su conteggi di Poisson, aree nette ==');
{ const e=[];
  for (let s=1;s<=N;s++){ const r=rng(s*99991), n=2048, xs=new Float64Array(n), ys=new Float64Array(n), cont=new Float64Array(n), peaks=[];
    for (let j=0;j<3+Math.floor(r()*5);j++){ let c, t=0; do { c=2+r()*20; t++; } while (peaks.some(p=>Math.abs(p.c-c)<0.8) && t<60); peaks.push({c, h:50+r()*3000}); }
    for (let i=0;i<n;i++){ const E=0.01*i+0.05, w=0.11+0.006*E; xs[i]=E; cont[i]=200*Math.exp(-(((E-14)/9)**2))+20; const mu=cont[i]+peaks.reduce((v,p)=>v+G(E,p.c,w*Math.sqrt(1+p.c/10),p.h),0); ys[i]=poisson(r, mu); }
    const bk=C.baselineSNIP(ys, 0, true);
    for (const p of peaks){ const w=(0.11+0.006*p.c)*Math.sqrt(1+p.c/10), a=Math.round((p.c-2*w-0.05)/0.01), b=Math.round((p.c+2*w-0.05)/0.01); if (a<5||b>n-5) continue;
      let net=0, tru=0; for (let i=a;i<=b;i++){ net+=ys[i]-bk[i]; tru+=G(xs[i],p.c,w,p.h); } e.push((net-tru)/tru*100); } }
  line('Area netta entro ±2 FWHM', `errore mediano ${pct(q(e,0.5))}, 90% entro ±${q(e.map(Math.abs),0.9).toFixed(1)}%`);
}

console.log('\n== Raggi cosmici (Whitaker & Hayes) ==');
{ let found=0, tot=0, falseAlarm=0; const dA=[];
  for (let s=1;s<=N;s++){ const r=rng(s*4242), n=1024, xs=new Float64Array(n), clean=new Float64Array(n), peaks=[];
    for (let j=0;j<5;j++) peaks.push({c:60+r()*900, w:5+r()*12, h:0.2+r()});
    for (let i=0;i<n;i++){ xs[i]=i; clean[i]=0.1+peaks.reduce((v,p)=>v+Lz(i,p.c,p.w,p.h),0)+gauss(r)*0.01; }
    const ys=Float64Array.from(clean), sp=[]; for (let j=0;j<1+Math.floor(r()*4);j++){ const i=20+Math.floor(r()*(n-40)), wd=1+Math.floor(r()*2), h=0.3+r()*3; for (let k=0;k<wd;k++) ys[i+k]+=h*(k?0.5:1); sp.push(i); }
    const d=C.despike(ys); tot+=sp.length; found+=sp.filter(i=>d.at.some(a=>Math.abs(a-i)<=2)).length;
    falseAlarm+=d.at.filter(a=>!sp.some(i=>Math.abs(a-i)<=2)).length;
    for (const p of peaks){ let a0=0, a1=0; for (let i=Math.max(0,Math.round(p.c-3*p.w)); i<=Math.min(n-1,Math.round(p.c+3*p.w)); i++){ if (sp.some(k=>Math.abs(k-i)<=3)) continue; a0+=clean[i]; a1+=d.ys[i]; } dA.push(Math.abs(a1-a0)/a0*100); } }
  line('Raggi cosmici rimossi', `${found}/${tot} (${(100*found/tot).toFixed(1)}%), falsi allarmi ${falseAlarm} su ${N} spettri`);
  line('Variazione dell\'area dei picchi veri', `mediana ${q(dA,0.5).toFixed(3)}%, massima ${q(dA,1).toFixed(3)}%`);
}

console.log('\n== Calibrazione: copertura degli intervalli al 95% e test di linearità di Mandel ==');
{ let covB=0, covX=0, tot=0, mandelLin=0, mandelQuad=0;
  for (let s=1;s<=N*5;s++){ const r=rng(s*271), a=r(), b=0.5+r()*2, sd=0.02+0.05*r(), xs=[0,1,2,3,4,5,6,7].map(v=>v*(1+r()*0.02));
    const pts=xs.map(x=>({x, y:a+b*x+gauss(r)*sd})), cal=C.calibrate(pts); tot++;
    if (cal.ciB[0]<=b && b<=cal.ciB[1]) covB++;
    const x0=1+r()*5, y0=a+b*x0+gauss(r)*sd, pr=cal.predict(y0,1); if (Math.abs(pr.x-x0)<=pr.ci) covX++;
    if (cal.mandel && cal.mandel.nonlinear) mandelLin++;
    const pq=xs.map(x=>({x, y:a+b*x-0.04*b*x*x+gauss(r)*sd*0.5})), cq=C.calibrate(pq); if (cq.mandel && cq.mandel.nonlinear) mandelQuad++; }
  line('IC della pendenza che contiene il valore vero', `${(100*covB/tot).toFixed(1)}% (atteso 95%)`);
  line('IC della concentrazione predetta (Miller & Miller)', `${(100*covX/tot).toFixed(1)}% (atteso 95%)`);
  line('Mandel: rette dichiarate non lineari', `${(100*mandelLin/tot).toFixed(1)}% (atteso ≈1%)`);
  line('Mandel: curvatura del 4% riconosciuta', `${(100*mandelQuad/tot).toFixed(1)}%`);
}

console.log('\n== PCA (SNV) + cluster di Ward su 3 gruppi con effetto di scattering ==');
{ let pure=0, kOk=0; const T=Math.max(20, N/4|0);
  for (let s=1;s<=T;s++){ const r=rng(s*1009), grid=Float64Array.from({length:400},(_,i)=>i), rows=[], lab=[];
    const proto=[0,1,2].map(g=>[{c:80,h:1},{c:200,h:g===1?0.55:1},{c:320,h:g===2?0.6:1},{c:260,h:0.3}]);
    for (let g=0;g<3;g++) for (let k=0;k<6;k++){ const mul=0.6+0.8*r(), add=(r()-0.5)*0.3; rows.push(Float64Array.from(grid, x=>add+mul*proto[g].reduce((v,p)=>v+G(x,p.c,18,p.h*(1+0.04*gauss(r))),0)+gauss(r)*0.01)); lab.push(g); }
    const X=C.preprocessRows(rows, grid, 'snv'), P=C.pcaNipals(X, 4, 'mean'), tree=C.hcaWard(P.scores.map(v=>v.slice(0,3))), k=C.suggestK(tree), cl=C.cutTree(tree, 3);
    if (k===3) kOk++;
    const ok=[0,1,2].every(g=>{ const c=cl.filter((_,i)=>lab[i]===g); return c.every(v=>v===c[0]); }) && new Set(cl).size===3; if (ok) pure++; }
  line('Gruppi ritrovati senza errori (taglio a 3)', `${pure}/${T}`);
  line('Numero di gruppi suggerito = 3', `${kOk}/${T}`);
}

console.log('\n== Miscele: contributi dei riferimenti con NNLS ==');
{ const e=[]; let wrong=0;
  for (let s=1;s<=N;s++){ const r=rng(s*5557), m=500, refs=[];
    for (let j=0;j<6;j++){ const pk=[0,1,2].map(()=>({c:20+r()*460, w:8+r()*25, h:0.3+r()})); const v=Float64Array.from({length:m},(_,i)=>pk.reduce((t,p)=>t+G(i,p.c,p.w,p.h),0)); const a=v.reduce((t,x)=>t+x,0); refs.push(v.map(x=>x/a)); }
    const used=[0,1,2,3,4,5].sort(()=>r()-0.5).slice(0,2+Math.floor(r()*2)), fr=used.map(()=>0.2+r()), sf=fr.reduce((a,b)=>a+b,0);
    const b=Float64Array.from({length:m},(_,i)=>used.reduce((t,j,k)=>t+fr[k]/sf*refs[j][i],0)*(1+0.0*r())+gauss(r)*0.00005);
    const res=C.nnls(refs, b), tot=res.x.reduce((a,c)=>a+c,0);
    for (let j=0;j<6;j++){ const tru=used.includes(j) ? fr[used.indexOf(j)]/sf : 0, est=res.x[j]/tot; e.push(Math.abs(est-tru)*100); if (!used.includes(j) && est>0.03) wrong++; } }
  line('Errore sulla frazione di ogni riferimento', `mediano ${q(e,0.5).toFixed(2)} punti %, 95% entro ${q(e,0.95).toFixed(2)}`);
  line('Riferimenti assenti stimati > 3%', `${wrong} su ${N*6-0}`);
}

console.log('\n== Cromatografia: piatti teorici, coda, risoluzione ==');
{ const eN=[], eT=[], eR=[];
  for (let s=1;s<=N;s++){ const r=rng(s*313), n=6000, xs=new Float64Array(n), ys=new Float64Array(n), t1=5+r()*5, sd=0.03+r()*0.05, t2=t1+sd*(4+r()*6);
    for (let i=0;i<n;i++){ const t=20*i/(n-1); xs[i]=t; ys[i]=2+100*Math.exp(-0.5*((t-t1)/sd)**2)+60*Math.exp(-0.5*((t-t2)/sd)**2)+gauss(r)*0.05; }
    const m=C.chromMetrics(xs, ys, [{x:t1},{x:t2}]); eN.push((m[0].N-(t1/sd)**2)/(t1/sd)**2*100); if (m[0].tailing!=null) eT.push(m[0].tailing-1); eR.push((m[1].rs-(t2-t1)/(4*sd))/((t2-t1)/(4*sd))*100); }
  line('Piatti teorici N (gaussiana: N = (tR/σ)²)', `errore mediano ${pct(q(eN,0.5))}, 90% entro ±${q(eN.map(Math.abs),0.9).toFixed(2)}%`);
  line('Fattore di coda USP (atteso 1,00)', `scarto mediano ${q(eT,0.5).toFixed(3)}, 90% entro ±${q(eT.map(Math.abs),0.9).toFixed(3)} (${eT.length}/${N}; gli altri non tornano al 5% prima del picco vicino)`);
  line('Risoluzione Rs (atteso Δt / 4σ)', `errore mediano ${pct(q(eR,0.5))}, 90% entro ±${q(eR.map(Math.abs),0.9).toFixed(2)}%`);
}

console.log('\n== UV-Vis: band gap di Tauc (transizione diretta, coda di Urbach) ==');
{ const e=[];
  for (let s=1;s<=N;s++){ const r=rng(s*8888), Eg=1.8+r()*1.6, Eu=0.03+r()*0.05, nm=[], A=[];
    for (let l=250;l<=900;l+=1){ const E=1239.84/l; let a = E>Eg ? Math.sqrt(E-Eg)/E : 0; a += 0.02*Math.exp((E-Eg)/Eu)*(E>Eg?Math.exp(-(E-Eg)/Eu):1)/E; nm.push(l); A.push(0.05+a*1.5+gauss(r)*0.002); }
    const t=C.taucGap(nm, A, {trans:'direct', data:'abs'}); if (t) e.push(t.Eg-Eg); }
  line('Errore su Eg', `mediano ${(q(e,0.5)*1000).toFixed(0)} meV, 90% entro ±${(q(e.map(Math.abs),0.9)*1000).toFixed(0)} meV (${e.length}/${N} riusciti)`);
}

console.log('\n== DSC: temperatura di onset estrapolata (picco triangolare, onset noto) ==');
{ const e=[];
  for (let s=1;s<=N;s++){ const r=rng(s*6007), n=1500, xs=new Float64Array(n), ys=new Float64Array(n), T0=100+r()*100, Tp=T0+3+r()*8, Te=Tp+1+r()*3, h=1+r()*4;
    for (let i=0;i<n;i++){ const T=T0-40+120*i/(n-1); xs[i]=T; const v = T<T0||T>Te ? 0 : T<=Tp ? h*(T-T0)/(Tp-T0) : h*(Te-T)/(Te-Tp); ys[i]=0.5+0.002*T+v+gauss(r)*0.002; }
    const o=C.tangentOnset(xs, ys, T0-8, Tp, Te+8); if (o && o.onset!=null) e.push(o.onset-T0); }
  line('Errore sull\'onset', `mediano ${q(e,0.5).toFixed(2)} °C, 90% entro ±${q(e.map(Math.abs),0.9).toFixed(2)} °C`);
}

console.log('\n== EPR: doppio integrale proporzionale al numero di spin ==');
{ const e=[];
  for (let s=1;s<=N;s++){ const r=rng(s*1201), n=2048, B=Float64Array.from({length:n},(_,i)=>330+20*i/(n-1)), dB=0.3+r()*1.2, c=340+(r()-0.5)*4;
    const mk=k=>Float64Array.from(B, b=>{ const t=(b-c)/(dB/2); return -k*2*t/(1+t*t)**2+gauss(r)*0.002*k+0.01; });
    const a=0.5+r(), b2=a*(0.2+r()*3), d1=C.eprDoubleIntegral(B, mk(a)), d2=C.eprDoubleIntegral(B, mk(b2)); e.push((d2.di/d1.di)/(b2/a)*100-100); }
  line('Doppio integrale (atteso: rapporto degli spin)', `errore mediano ${pct(q(e,0.5))}, 90% entro ±${q(e.map(Math.abs),0.9).toFixed(1)}%`);
}

console.log('\n== Taratura multivariata PLS: analita con bande sovrapposte a un interferente variabile ==');
{ const eP=[], eL=[]; let q2s=[];
  for (let s=1;s<=Math.max(20,N/5|0);s++){ const r=rng(s*4441), m=300, X=Float64Array.from({length:m},(_,i)=>i);
    const make=(ca, ci)=>Float64Array.from(X, x=>ca*G(x,140,30,1)+ci*G(x,155,40,0.9)+0.3*G(x,60,20,1)+gauss(r)*0.004);
    const tr=[], yt=[]; for (let k=0;k<12;k++){ const ca=0.2+0.8*r(), ci=r(); tr.push(make(ca,ci)); yt.push(ca); }
    const cv=C.plsCV(tr, yt, 6); q2s.push(cv.q2);
    const h=tr.map(v=>v[140]), xm=h.reduce((a,b)=>a+b)/12, ym=yt.reduce((a,b)=>a+b)/12; let sxy=0,sxx=0; h.forEach((v,i)=>{ sxy+=(v-xm)*(yt[i]-ym); sxx+=(v-xm)**2; }); const b=sxy/sxx, a=ym-b*xm;
    for (let k=0;k<10;k++){ const ca=0.2+0.8*r(), ci=r(), v=make(ca,ci); eP.push(Math.abs(cv.model.predict(v)-ca)); eL.push(Math.abs(a+b*v[140]-ca)); } }
  line('Q² in validazione incrociata (mediana)', q(q2s,0.5).toFixed(3));
  line('Errore di previsione (conc. 0,2–1)', `PLS mediano ${q(eP,0.5).toFixed(4)} · una banda ${q(eL,0.5).toFixed(4)}`);
}

console.log('\n== Pigmenti Raman: riconoscimento su spettri simulati dalla banca dati (verifica di coerenza, non validazione indipendente) ==');
{ let top1=0, top3=0, tot=0; const miss=[];
  for (let s=0;s<C.RAMAN_PIGMENTS.length*3;s++){ const pg=C.RAMAN_PIGMENTS[s%C.RAMAN_PIGMENTS.length], r=rng(s*733+11);
    const x0=100, x1=pg[3].some(b=>b>1800) ? 3200 : 1800, n=x1-x0+1, xs=Float64Array.from({length:n},(_,i)=>x0+i);
    const ys=Float64Array.from(xs, x=>pg[3].reduce((t,b,i)=>t+Lz(x,b+(r()-0.5)*4,8,1/(1+0.6*i)),0)+0.8*Math.exp(-(((x-900)/900)**2))+gauss(r)*0.01);
    const bl=C.baselineArPLS(xs, ys), yc=Float64Array.from(ys,(v,i)=>v-bl[i]);
    const pk=C.findPeaks(xs, yc, 1, 3, 25), mp=Math.max(...pk.map(p=>p.prom));
    const res=C.pigmentMatches(pk.map(p=>({x:p.x, rel:p.prom/mp})), x0, x1); tot++;
    const names=res.map(o=>o.it); if (names[0]===pg[0]) top1++; else if (s<C.RAMAN_PIGMENTS.length) miss.push(pg[0]+' → '+(names[0]||'—')); if (names.slice(0,3).includes(pg[0])) top3++; }
  line('Pigmento giusto al primo posto / tra i primi tre', `${top1}/${tot} · ${top3}/${tot}`);
  if (miss.length) console.log('  scambi: '+miss.join('; '));
}

console.log('\n== Proteine: struttura secondaria dall\'ammide I (frazioni note) ==');
{ const e=[]; let ok=0, T=0;
  for (let s=1;s<=Math.max(20,N/4|0);s++){ const r=rng(s*929), xs=Float64Array.from({length:401},(_,i)=>1500+i*0.75);
    const f=[0.2+0.4*r(), 0.1+0.4*r(), 0.05+0.2*r(), 0.05+0.15*r()], sf=f.reduce((a,b)=>a+b), comp=[[1630,18],[1655,16],[1675,16],[1690,12]];
    const y=Float64Array.from(xs, x=>comp.reduce((t,[c,w],k)=>t+f[k]/sf*G(x,c,w,1)/(w*1.0645),0)*20+0.6*G(x,1545,30,0.4)+0.002*(x-1500)/100+gauss(r)*0.002);
    const R=C.amideI(xs, y); if (!R) continue; T++;
    const want={'foglietto β':f[0]/sf,'α-elica':f[1]/sf,'ripiegamenti (turn)':f[2]/sf,'foglietto β antiparallelo / aggregati':f[3]/sf};
    for (const c of R.cls) if (c.it in want){ e.push(Math.abs((c.pct||0)-100*want[c.it])); } if (R.fit.peaks.length===4) ok++; }
  line('Componenti trovate = 4', `${ok}/${T}`);
  line('Errore sulle percentuali di struttura', `mediano ${q(e,0.5).toFixed(1)} punti, 90% entro ${q(e,0.9).toFixed(1)}`);
}

console.log('\n== XRF quantitativo: leghe di rame simulate (Cu, Zn, Sn, Pb) con effetti di matrice, 12 standard, 30 incogniti ==');
{ const els=['Cu','Zn','Sn','Pb'], E={Cu:[8.047,8.905],Zn:[8.639,9.572],Sn:[25.271,28.486],Pb:[10.551,12.614]}, S={Cu:1,Zn:1.25,Sn:0.55,Pb:0.9};
  const MU={Cu:{Cu:1,Zn:1.6,Sn:2.4,Pb:2.8},Zn:{Cu:0.8,Zn:1,Sn:2.2,Pb:2.6},Sn:{Cu:1,Zn:1,Sn:1,Pb:1.3},Pb:{Cu:1.1,Zn:1.2,Sn:1.6,Pb:1}};   // assorbimento della matrice (unità arbitrarie)
  const errL={}, errT={}, err100={}; els.forEach(e=>{ errL[e]=[]; errT[e]=[]; err100[e]=[]; });
  const T=Math.max(8, N/20|0);
  for (let s=1;s<=T;s++){ const r=rng(s*3571);
    const mk=()=>{ let c={Cu:60+35*r(), Zn:r()<0.6?r()*25:0, Sn:r()<0.7?r()*14:0, Pb:r()<0.6?r()*10:0}; const sum=Object.values(c).reduce((a,b)=>a+b); for (const e of els) c[e]*=100/sum; return c; };
    const spec=c=>{ const g=0.7+0.6*r(), n=2048, xs=new Float64Array(n), ys=new Float64Array(n), I={};
      for (const e of els){ const mat=els.reduce((t,j)=>t+MU[e][j]*c[j],0)/100; I[e]=60000*g*S[e]*c[e]/100/mat; }
      const comp=9000*g/(els.reduce((t,j)=>t+(j==='Pb'?1.4:j==='Sn'?1.2:1)*c[j],0)/100);
      for (let i=0;i<n;i++){ const x=0.02*i; xs[i]=x; let mu=30*Math.exp(-(((x-17)/8)**2))+3+G(x,19.0,0.55,comp/(0.55*1.0645*50))+G(x,20.2,0.25,comp*0.3/(0.25*1.0645*50));
        for (const e of els){ const [a,b]=E[e]; mu+=G(x,a,(0.12+0.004*a),I[e]/((0.12+0.004*a)*1.0645*50))+G(x,b,(0.12+0.004*b),0.17*I[e]/((0.12+0.004*b)*1.0645*50)); }
        ys[i]=poisson(r, mu); }
      return C.xrfIntensities(xs, ys, els, {tube:'Rh'}); };
    const stds=[], unk=[]; for (let k=0;k<12;k++){ const c=mk(); stds.push({C:c, I:spec(c).I}); } for (let k=0;k<30;k++){ const c=mk(); unk.push({C:c, I:spec(c).I}); }
    const fL=C.xrfQuantFit(stds, els, 'linear'), fT=C.xrfQuantFit(stds, els, 'ltp');
    for (const u of unk){ let tot=0; const pT={}; for (const e of els){ pT[e]=fT[e].predict(u); tot+=Math.max(0,pT[e]||0); }
      for (const e of els){ errL[e].push(Math.abs(fL[e].predict(u)-u.C[e])); errT[e].push(Math.abs(pT[e]-u.C[e])); err100[e].push(Math.abs(Math.max(0,pT[e])*100/tot-u.C[e])); } } }
  for (const e of els) line(`${e}: errore assoluto (% in peso)`, `lineare ${q(errL[e],0.5).toFixed(2)} · Lucas-Tooth & Price ${q(errT[e],0.5).toFixed(2)} · LT&P normalizzato al 100% ${q(err100[e],0.5).toFixed(2)} (mediane; 90%: ${q(err100[e],0.9).toFixed(2)})`);
}
