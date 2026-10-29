// Benchmark della ricerca automatica dei picchi di Acchiappaspettri.
// Genera spettri sintetici con picchi noti (FTIR in A e %T, Raman con fluorescenza, HPLC con gamma dinamica 1:100, UV-Vis)
// e misura recall (picchi veri trovati), precisione (picchi segnalati che sono veri), spettri perfetti ed errore di posizione (in FWHM).
// Uso:  node test/peak-benchmark.js        (oppure N=500 SENS=5 node test/peak-benchmark.js)
// Un picco "deve" essere trovato se sporge almeno 6 volte il rumore e almeno max(3%, 1,3 × sensibilità) del picco più prominente.
const fs=require('fs'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const core=html.slice(html.indexOf('/*CORE-START*/'), html.indexOf('/*CORE-END*/'));
eval(core+';global.C={findPeaks,transformY}');
// generatore di spettri sintetici con verità nota
function rng(seed){ let s=seed>>>0||1; return ()=>{ s^=s<<13; s>>>=0; s^=s>>>17; s^=s<<5; s>>>=0; return s/4294967296; }; }
function gauss(r){ let u=0,v=0; while(!u)u=r(); while(!v)v=r(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }
function shape(x,c,w,h,eta){ // pseudo-Voigt, w = FWHM
  const g=Math.exp(-4*Math.LN2*((x-c)/w)**2), l=1/(1+4*((x-c)/w)**2); return h*(eta*l+(1-eta)*g); }
function make(type, seed){
  const r=rng(seed); let x0,x1,n,np,wmin,wmax,hmin,hmax,noise,base;
  if(type==='ftir'){ x0=600;x1=4000;n=3401;np=6+Math.floor(r()*10);wmin=8;wmax=70;hmin=0.04;hmax=1;noise=0.002+r()*0.006; }
  if(type==='raman'){ x0=200;x1=1800;n=1200;np=4+Math.floor(r()*8);wmin=6;wmax=25;hmin=0.05;hmax=1;noise=0.004+r()*0.012; }
  if(type==='hplc'){ x0=0;x1=55;n=33001;np=5+Math.floor(r()*12);wmin=0.04;wmax=0.4;hmin=0.01;hmax=1;noise=0.0005+r()*0.002; }
  if(type==='uv'){ x0=200;x1=900;n=1401;np=1+Math.floor(r()*4);wmin=15;wmax=60;hmin=0.1;hmax=1;noise=0.001+r()*0.004; }
  const xs=new Float64Array(n), ys=new Float64Array(n), clean=new Float64Array(n), peaks=[];
  for(let i=0;i<np;i++){ const w=wmin+r()*(wmax-wmin); let h=hmin+r()*(hmax-hmin); if(type==='hplc') h=Math.pow(10,-2*r()); // 1%..100% gamma dinamica
    const c=x0+(x1-x0)*(0.03+0.94*r()); peaks.push({c,w,h,eta:r()}); }
  // linea di base
  const b1=(r()-0.5)*0.4, b2=(r()-0.5)*0.3, fl = type==='raman' ? 0.5+r()*2 : 0;
  for(let i=0;i<n;i++){ const x=x0+(x1-x0)*i/(n-1); xs[i]=x; const t=(x-x0)/(x1-x0);
    let y=b1*t+b2*t*t + fl*Math.exp(-((x-x0)/((x1-x0)*0.7))) ;
    for(const p of peaks) y+=shape(x,p.c,p.w,p.h,p.eta);
    clean[i]=y; ys[i]=y+gauss(r)*noise; }
  // valori reali del picco (altezza sopra il proprio fondo) e risolvibilità
  peaks.sort((a,b)=>a.c-b.c);
  const maxh=Math.max(...peaks.map(p=>p.h));
  for(const p of peaks){
    p.snr=p.h/noise; p.rel=p.h/maxh;
    // risolto: il segnale combinato ha un massimo locale vicino al centro
    const f=x=>peaks.reduce((s,q)=>s+shape(x,q.c,q.w,q.h,q.eta),0);
    const dx=p.w/50; const c=p.c; let best=c, bv=f(c);
    for(let k=-25;k<=25;k++){ const xx=c+k*dx, v=f(xx); if(v>bv){bv=v;best=xx;} }
    p.resolved = f(best-dx)<bv && f(best+dx)<bv && Math.abs(best-c)<p.w*0.25;
    p.cTrue=best;
  }
  // picchi fusi: due massimi veri che cadono nello stesso punto sono un solo picco osservabile
  const order=[...peaks].sort((a,b)=>b.h-a.h);
  for (const p of order){ if(p.merged) continue;
    for (const q of peaks){ if(q===p||q.merged) continue; if (Math.abs(q.cTrue-p.cTrue) < 0.5*Math.min(p.w,q.w)) q.merged=true; } }
  for (const p of peaks) if (p.merged) p.resolved=false;
  // prominenza osservabile di ogni picco sul segnale pulito (quanto «sporge» davvero)
  function promAt(sig, idx){ let lmin=sig[idx], j=idx-1; while(j>=0&&sig[j]<=sig[idx]){ if(sig[j]<lmin)lmin=sig[j]; j--; } let rmin=sig[idx]; j=idx+1; while(j<n&&sig[j]<=sig[idx]){ if(sig[j]<rmin)rmin=sig[j]; j++; } return sig[idx]-Math.max(lmin,rmin); }
  function locmax(sig, c){ let i=Math.round((c-x0)/((x1-x0)/(n-1))); i=Math.max(1,Math.min(n-2,i)); for(let k=0;k<200;k++){ if(sig[i+1]>sig[i]) i++; else if(sig[i-1]>sig[i]) i--; else break; } return i; }
  const seenA=new Map(); for (const p of [...peaks].sort((a,b)=>b.h-a.h)){ const i=locmax(clean,p.cTrue); p.iA=i; p.promA = Math.abs(xs[i]-p.cTrue)<p.w*0.25 ? promAt(clean,i) : 0; if (seenA.has(i)) { p.merged=true; } else seenA.set(i,p); }
  // variante %T realistica: rumore aggiunto in trasmittanza (0,03–0,3 %T)
  const sigT = 0.03 + r()*0.27;
  const ysT = Float64Array.from(clean, v=>100*Math.pow(10,-v) + gauss(r)*sigT);
  for (const p of peaks){ const i=Math.round((p.cTrue-x0)/((x1-x0)/(n-1))); const base=clean[i]-p.h; p.depthT=100*Math.pow(10,-base)*(1-Math.pow(10,-p.h)); }
  const md=Math.max(...peaks.map(p=>p.depthT||0));
  const cT=Float64Array.from(clean, v=>-100*Math.pow(10,-v));
  const seenT=new Set(); for (const p of [...peaks].sort((a,b)=>b.h-a.h)){ const i=locmax(cT,p.cTrue); p.promT = Math.abs(xs[i]-p.cTrue)<p.w*0.25 ? promAt(cT,i) : 0; if (seenT.has(i)) p.mergedT=true; else seenT.add(i); }
  const mA=Math.max(...peaks.map(p=>p.promA)), mT=Math.max(...peaks.map(p=>p.promT));
  for (const p of peaks){ p.snrT=p.depthT/sigT; p.relT=p.depthT/md; const TR=(+process.env.TRUTHREL||3)/100; p.okA = !p.merged && p.promA>=6*noise && p.promA>=TR*mA; p.okT = !p.mergedT && p.promT>=6*sigT && p.promT>=TR*mT; }
  return {type, xs, ys, ysT, sigT, peaks, noise, step:(x1-x0)/(n-1)};
}



const ALG=null;
function evaluate(sens, N, label){
  const out={}; let worst=[];
  for (const type of ['ftir','raman','hplc','uv']){
    let tp=0, fn=0, fp=0, err=[], spectra=0, perfect=0;
    for (let s=1;s<=N;s++){
      const sp=make(type, s*7919+type.length);
      // FTIR in %T: picchi verso il basso
      let ys=sp.ys, dir=1;
      const isT = type==='ftir' && s%2===0; if (isT){ ys=sp.ysT; dir=-1; }
      const found = (ALG? ALG.findPeaks : C.findPeaks)(sp.xs, ys, dir, sens, 60);
      // verità "da trovare": risolto, SNR>=6, altezza >= 3% del massimo
      const must = sp.peaks.filter(p=> isT ? p.okT : p.okA);
      const allowed = sp.peaks;   // picchi veri ma piccoli: non contano come errore se trovati
      const used=new Set(); let ok=true;
      for (const p of must){
        const tol=Math.max(p.w*0.5, sp.step*3);
        let bi=-1,bd=Infinity; found.forEach((q,i)=>{ const d=Math.abs(q.x-p.cTrue); if(d<=tol && d<bd && !used.has(i)){bd=d;bi=i;} });
        if (bi>=0){ tp++; used.add(bi); err.push(bd/p.w); } else { fn++; ok=false; worst.push({type,s,miss:p.cTrue.toFixed(2),h:p.h.toFixed(3),snr:p.snr.toFixed(0),rel:p.rel.toFixed(3),w:p.w.toFixed(2)}); }
      }
      found.forEach((q,i)=>{ if(used.has(i)) return;
        const near = allowed.some(p=>Math.abs(q.x-p.c)<=Math.max(p.w*0.7, sp.step*3));
        if (!near){ fp++; ok=false; worst.push({type,s,fake:q.x.toFixed(2)}); } });
      spectra++; if(ok) perfect++;
    }
    err.sort((a,b)=>a-b);
    out[type]={recall:(100*tp/(tp+fn)).toFixed(1), precision:(100*tp/(tp+fp||1)).toFixed(1), perfect:`${perfect}/${spectra}`, errMed:(err[err.length>>1]||0).toFixed(3), err95:(err[Math.floor(err.length*0.95)]||0).toFixed(3), fn, fp};
  }
  console.log(`\n== ${label} (sens ${sens}) ==`); console.table(out);
  return worst;
}
const N=+process.env.N||200;
for (const sens of (process.env.SENS? [ +process.env.SENS ] : [3,5,10])){
  process.env.TRUTHREL = String(Math.max(3, sens*1.3));
  evaluate(sens, N, 'Acchiappaspettri');
}

