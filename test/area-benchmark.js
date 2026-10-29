// Benchmark dell'area dei picchi di Acchiappaspettri: picchi sintetici di area nota (gaussiani, lorentziani, misti),
// con rumore, linea di base inclinata o curva e picchi vicini. Uso:  node test/area-benchmark.js
const fs=require('fs'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
eval(html.slice(html.indexOf('/*CORE-START*/'), html.indexOf('/*CORE-END*/'))+';global.C={peakAreas,findPeaks}');
function rng(seed){ let s=seed>>>0||1; return ()=>{ s^=s<<13; s>>>=0; s^=s>>>17; s^=s<<5; s>>>=0; return s/4294967296; }; }
function gauss(r){ let u=0,v=0; while(!u)u=r(); while(!v)v=r(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }
const G=(x,c,w,h)=>h*Math.exp(-4*Math.LN2*((x-c)/w)**2), Lz=(x,c,w,h)=>h/(1+4*((x-c)/w)**2);
const areaG=(w,h)=>h*w*Math.sqrt(Math.PI/(4*Math.LN2)), areaL=(w,h)=>h*w*Math.PI/2;
function test(label, shape, opts){
  const errs=[]; const N=opts.N||300;
  for (let s=1;s<=N;s++){ const r=rng(s*104729+label.length); const n=opts.n, x0=0, x1=100;
    const k=1+Math.floor(r()*4), peaks=[];
    for (let j=0;j<k;j++){ let c, tries=0; do { c=8+r()*84; tries++; } while (peaks.some(p=>Math.abs(p.c-c)<(opts.minSep||12)) && tries<50);
      const eta = shape==='voigt'? r() : (shape==='lor'?1:0);
      peaks.push({c, w:0.6+r()*3, h:0.2+r(), eta}); }
    const xs=new Float64Array(n), ys=new Float64Array(n), sl=(r()-0.5)*0.01, b0=r()*0.3, noise=opts.noise*(0.5+r());
    for (let i=0;i<n;i++){ const x=x0+(x1-x0)*i/(n-1); xs[i]=x; let y=b0+sl*x+(opts.curve? 0.3*Math.sin(x/40):0);
      for (const p of peaks) y+= p.eta*Lz(x,p.c,p.w,p.h)+(1-p.eta)*G(x,p.c,p.w,p.h); ys[i]=y+gauss(r)*noise; }
    const res=C.peakAreas(xs, ys, peaks.map(p=>p.c));
    peaks.forEach((p,j)=>{ const trueA = p.eta*areaL(p.w,p.h)+(1-p.eta)*areaG(p.w,p.h); errs.push((res[j].area-trueA)/trueA*100); });
  }
  errs.sort((a,b)=>a-b); const q=f=>errs[Math.floor(errs.length*f)];
  const abs=errs.map(Math.abs).sort((a,b)=>a-b);
  console.log(label.padEnd(44), 'picchi',String(errs.length).padStart(4),'| errore mediano',q(0.5).toFixed(2)+'%','| 90% entro ±'+abs[Math.floor(abs.length*0.9)].toFixed(1)+'%','| peggiore',abs[abs.length-1].toFixed(1)+'%');
}
test('Gaussiani isolati, base inclinata, rumore 0,5%', 'gauss', {n:2000, noise:0.005});
test('Gaussiani isolati, rumore 2%', 'gauss', {n:2000, noise:0.02});
test('Gaussiani isolati, base curva', 'gauss', {n:2000, noise:0.005, curve:true});
test('Lorentziani isolati (code lunghe)', 'lor', {n:2000, noise:0.005});
test('Misti (pseudo-Voigt)', 'voigt', {n:2000, noise:0.005});
test('Gaussiani vicini (separazione ≥ 2 FWHM)', 'gauss', {n:2000, noise:0.005, minSep:5});
