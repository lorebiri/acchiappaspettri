// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I6: dati SINTETICI per le prove del grafico nel browser (test/validation/i6-grafico-ui.test.js) e nell'app (test/e2e/e2e-page.js).
// page.evaluate(I6_SETUP) definisce window.I6 nella pagina: crea N spettri da n punti (FTIR sintetico con picchi stretti di un punto),
// li mette nell'elenco come se fossero stati letti, apre il confronto e misura i disegni.
'use strict';
function I6_SETUP(){
  if (window.I6) return;
  const rnd=seed=>{ let s=seed||7; return ()=>{ s=(s*16807)%2147483647; return s/2147483647-0.5; }; };
  const g=(x,c,w)=>Math.exp(-0.5*((x-c)/w)**2);
  // uno spettro: X crescenti, picchi larghi e un picco stretto di un solo punto ogni 100 000 punti (deve restare visibile, G3)
  function spectrum(n, k){ const r=rnd(11+k), xs=new Float64Array(n), ys=new Float64Array(n);
    for (let i=0;i<n;i++){ const x=400+i*3600/(n-1); xs[i]=x; ys[i]=0.05+g(x,1000+7*k,4)+0.6*g(x,2500-5*k,6)+0.4*g(x,3300,5)+0.01*r(); }
    for (let i=50000+137*k;i<n;i+=100000) ys[i]+=0.8;   // picchi stretti
    return {xs, ys}; }
  // spettri della tecnica (per il controllo del dato): XRF in conteggi interi con righe e fondo, NMR con picchi lorentziani, EPR in derivata
  function spectrumFor(instr, n, k){ if (!instr) return spectrum(n, k); const r=rnd(31+k), xs=new Float64Array(n), ys=new Float64Array(n), L=(x,c,w)=>1/(1+((x-c)/w)**2);
    for (let i=0;i<n;i++){
      if (instr==='xrf'){ const x=0.5+i*39.5/(n-1); xs[i]=x; ys[i]=Math.max(0, Math.round(40+600*g(x,6.40,0.07)+300*g(x,7.06,0.08)+250*g(x,8.05,0.08)+120*g(x,20.2,0.12)+8*Math.sqrt(40)*r())); }
      else if (instr==='nmr'){ const x=-1+i*13/(n-1); xs[i]=x; ys[i]=0.002*r()+L(x,1.2,0.004)+0.6*L(x,3.7,0.004)+0.3*L(x,7.26,0.003); }
      else if (instr==='epr'){ const x=3300+i*200/(n-1); xs[i]=x; const u=(x-3400)/3; ys[i]=-2*u/((1+u*u)**2)+0.002*r(); }
      else { xs[i]=i; ys[i]=r(); } }
    return {xs, ys}; }
  async function load(N, n, instr){ const ents=[]; for (let k=0;k<N;k++) ents.push(spectrumFor(instr, n, k));
    // lettura vera per il primo (stessa strada dell'utente); gli altri spettri copiano la sua struttura con i loro numeri
    const head='Wavenumber (cm-1)\tAbsorbance\n';
    const txt=head+Array.from(ents[0].xs.subarray(0,4096), (x,i)=>x.toFixed(4)+'\t'+ents[0].ys[i].toFixed(6)).join('\n')+'\n';
    await addEntries([{file:new File([txt],'sintetico-0.txt'), path:'sintetico-0.txt'}]);
    const f0=files[files.length-1];
    const made=[];
    for (let k=0;k<N;k++){ const f=k===0 ? f0 : Object.assign({}, f0, {id:++uid, removed:[], added:[], labels:{}, an:null, fit:null});
      f.name=f.path='sintetico-'+k+'.txt'; f.title='Sintetico '+(k+1); f.xs=f.xs0=ents[k].xs; f.ys=ents[k].ys; f._p=Object.assign({}, f0._p, {ys:ents[k].ys}); f.n0=n; f.hash='i6'+k; f.size=n*16;
      for (const key of Object.keys(f)) if (key[0]==='_' && key!=='_p') delete f[key];
      if (instr){ f.instr=f.autoInstr=instr; f.kind=kindOf(f); }
      if (k) files.push(f); made.push(f); }
    cur=files.indexOf(f0); refreshAll(); return made; }
  // confronto di tutti gli spettri caricati, nella vista «Sfalsati» (predefinita)
  function compare(list, mode){ const c=newCmp(list[0].instr, list); if (mode) c.mode=mode; go(2); setView('cmp'); return c; }
  const frames=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  // G1: zoom e spostamento animati, un passo per fotogramma; tempo di ogni passo (rendering della pagina e disegno) e intervalli tra fotogrammi
  async function animate(steps){ const t=zTarget(); const L=[], dt=[]; let last=performance.now();
    const [fa,fb]=t.range;
    for (let s=0;s<steps;s++){ await new Promise(r=>requestAnimationFrame(r)); const now=performance.now(); dt.push(now-last); last=now;
      const a=performance.now();
      if (s<steps/2){ const k=0.94; zoomBy(k, fa+(fb-fa)*0.37); }   // zoom verso un punto
      else { const z=t.o._zoom||[fa,fb], w=z[1]-z[0], sh=w*0.03*(s%20<10?1:-1); t.o._zoom=[Math.max(fa,z[0]+sh), Math.min(fb,z[1]+sh)]; (window.renderPlotOnly||renderPreview)(); }   // come il trascinamento   // spostamento
      L.push(performance.now()-a); }
    await new Promise(r=>requestAnimationFrame(r)); dt.push(performance.now()-last);
    return {work:L, frames:dt.slice(1)}; }
  // G3 (anche nell'app vera, test/e2e/e2e-page.js): disegno a schermo (WebGL e Canvas 2D) contro il disegno pieno di tutti i punti,
  // a quattro risoluzioni; più un disegno «ingenuo» (1 punto ogni 50) che la prova deve scoprire
  function g3(){ const n=1e6, {xs}=I6.spectrum(n,0), ys=new Float64Array(n);
    for (let i=0;i<n;i++) ys[i]=0.3+0.2*Math.sin(i/40000)+0.02*Math.sin(i*1.7);
    const spikes=[]; for (let i=31337;i<n;i+=97001){ ys[i]+= (spikes.length%3===2 ? -0.25 : 0.6); spikes.push(i); }   // picchi di un solo punto, in su e in giù
    const view={title:'G3', desc:'', instrName:'', series:[{xs, ys, color:'#0000ff', name:'s'}], dir:1, invertX:true, xLabel:'x', yLabel:'y', peaks:[], legend:false, xs, ys, fontPt:9};
    const SS=Object.assign({}, S, {grid:false, lineW:0.25});
    // inchiostro della traccia (blu) per colonna: riga più alta e più bassa dentro l'area dei dati
    const ink=(cv, g, k)=>{ const c=cv.getContext('2d'), x0=Math.ceil(g.px0*k)+2, x1=Math.floor((g.px0+g.pw)*k)-2, y0=Math.ceil(g.py0*k)+2, y1=Math.floor((g.py0+g.ph)*k)-2;
      const D=c.getImageData(0,0,cv.width,cv.height).data, top=[], bot=[];
      for (let x=x0;x<=x1;x++){ let t=-1, b=-1; for (let y=y0;y<=y1;y++){ const p=4*(y*cv.width+x); if (D[p+2]-D[p]>60 && D[p+2]-D[p+1]>60){ if (t<0) t=y; b=y; } } top.push(t); bot.push(b); }
      return {top, bot, x0}; };
    const full=(W,H,k)=>{ const cv=document.createElement('canvas'); cv.width=Math.round(W*k); cv.height=Math.round(H*k); const c=cv.getContext('2d');
      const g=drawPlot(c, W, H, k, Object.assign({}, view, {series:[Object.assign({}, view.series[0], {color:'rgba(0,0,0,0)'})]}), SS);   // stessi assi, traccia trasparente
      c.save(); c.setTransform(k,0,0,k,0,0); c.beginPath(); c.rect(g.px0,g.py0,g.pw,g.ph); c.clip(); c.strokeStyle='#0000ff'; c.lineWidth=SS.lineW; c.lineJoin='round'; c.lineCap='round'; c.beginPath();
      const X=x=>g.px0+(g.xmax-x)/(g.xmax-g.xmin)*g.pw, Y=y=>g.py0+(g.ymax-y)/(g.ymax-g.ymin)*g.ph;
      for (let i=0;i<n;i++){ if (i) c.lineTo(X(xs[i]),Y(ys[i])); else c.moveTo(X(xs[i]),Y(ys[i])); } c.stroke(); c.restore(); return {cv, g}; };
    const screen=(W,H,k,gl)=>{ const cv=document.createElement('canvas'); cv.width=Math.round(W*k); cv.height=Math.round(H*k); let L=null;
      if (gl){ const G=AcchPlotGL.create(null); if (!G.available) return {skip:G.reason}; G.size(cv.width, cv.height); L={gl:G, over:G.over.getContext('2d')}; }
      const g=drawPlot(cv.getContext('2d'), W, H, k, view, SS, L||{gl:null, over:null});   // a schermo senza WebGL: ripiego Canvas 2D
      if (L){ const c=cv.getContext('2d'); c.setTransform(1,0,0,1,0,0); c.drawImage(L.gl.canvas,0,0); c.drawImage(L.gl.over,0,0); }   // composizione dei livelli, come fa il browser
      return {cv, g, gl:!!L}; };
    const res=[];
    // controllo della prova: un disegno che tiene 1 punto ogni 50 (decimazione ingenua) deve risultare sbagliato
    const naive=(W,H,k)=>{ const m=Math.floor(n/50), sx=new Float64Array(m), sy=new Float64Array(m); for (let i=0;i<m;i++){ sx[i]=xs[i*50]; sy[i]=ys[i*50]; }
      const cv=document.createElement('canvas'); cv.width=Math.round(W*k); cv.height=Math.round(H*k); const c=cv.getContext('2d');
      const g=drawPlot(c, W, H, k, Object.assign({}, view, {series:[Object.assign({}, view.series[0], {color:'rgba(0,0,0,0)'})]}), SS);
      c.save(); c.setTransform(k,0,0,k,0,0); c.beginPath(); c.rect(g.px0,g.py0,g.pw,g.ph); c.clip(); c.strokeStyle='#0000ff'; c.lineWidth=SS.lineW; c.lineJoin='round'; c.lineCap='round'; c.beginPath();
      const X=x=>g.px0+(g.xmax-x)/(g.xmax-g.xmin)*g.pw, Y=y=>g.py0+(g.ymax-y)/(g.ymax-g.ymin)*g.ph; for (let i=0;i<m;i++){ if (i) c.lineTo(X(sx[i]),Y(sy[i])); else c.moveTo(X(sx[i]),Y(sy[i])); } c.stroke(); c.restore(); return {cv, g, gl:'ingenua'}; };
    for (const [cw,ch,dpr] of [[800,500,1],[1366,768,1.25],[1920,1080,1],[2560,1440,2]]){ const W=cw/5, H=ch/5, k=5*dpr;
      const F=full(W,H,k), A=ink(F.cv, F.g, k);
      for (const gl of [true,false,'ingenua']){ if (gl==='ingenua' && cw!==1366) continue; const Sx=gl==='ingenua' ? naive(W,H,k) : screen(W,H,k,gl); if (Sx.skip){ res.push({cw, gl, skip:Sx.skip}); continue; }
        // inviluppo superiore e inferiore uguali entro 1 pixel in verticale e 1 colonna in orizzontale, nei due versi:
        // nessuna cima persa (ogni cima del disegno pieno c'è anche a schermo) e nessuna cima finta (niente inchiostro più in alto del disegno pieno)
        const B2=ink(Sx.cv, Sx.g, k), N=A.top.length; let worst=0, miss=0;
        const near=(T, c, f)=>{ let v=f===Math.min ? Infinity : -Infinity; for (let d=-1;d<=1;d++){ const j=c+d; if (j>=0 && j<N && T[j]>=0) v=f(v, T[j]); } return v; };
        for (let i=0;i<N;i++){ if ((A.top[i]<0)!==(B2.top[i]<0)){ miss++; continue; } if (A.top[i]<0) continue;
          const e=Math.max(near(B2.top,i,Math.min)-A.top[i], near(A.top,i,Math.min)-B2.top[i], A.bot[i]-near(B2.bot,i,Math.max), B2.bot[i]-near(A.bot,i,Math.max));
          worst=Math.max(worst, e); }
        // cime dei picchi stretti: riga più alta (o più bassa) dell'inchiostro attorno al picco
        const g=Sx.g, colOf=x=>Math.round((g.px0+(g.xmax-x)/(g.xmax-g.xmin)*g.pw)*k)-A.x0; let spk=0;
        for (const [j,i] of spikes.entries()){ const c=colOf(xs[i]); const lo=Math.max(0,c-3), hi=Math.min(A.top.length-1,c+3); const up=j%3!==2;
          let a=up?Infinity:-Infinity, b=up?Infinity:-Infinity; for (let q=lo;q<=hi;q++){ if (up){ if (A.top[q]>=0) a=Math.min(a,A.top[q]); if (B2.top[q]>=0) b=Math.min(b,B2.top[q]); } else { a=Math.max(a,A.bot[q]); b=Math.max(b,B2.bot[q]); } }
          spk=Math.max(spk, Math.abs(a-b)); }
        res.push({cw, dpr, gl, cols:A.top.length, worst, miss, spk}); } }
    return res; }
  // G1 e G2: N spettri da n punti nel confronto; primo disegno, ridisegni durante zoom e spostamento (40 passi)
  async function g12(N, n){ const L=await I6.load(20, 1e6); await new Promise(r=>setTimeout(r,500));
    let drawn=0; const od=window.drawPlot, DP=[]; window.drawPlot=function(){ const q=performance.now(); const x=od.apply(this,arguments); const e=performance.now(); if (pvView && pvView.series && pvView.series.length===20){ if (!drawn) drawn=e; DP.push(e-q); } return x; };
    const a=performance.now(); I6.compare(L); for (let i=0;i<600 && !drawn;i++) await new Promise(r=>setTimeout(r,10)); const g2=drawn-a;
    await I6.frames(); const g0=AcchPlot.info().groups; const DP0=DP.length; const an=await I6.animate(40); const groups=(AcchPlot.info().groups-g0)/(DP.length-DP0);
    window.drawPlot=od; const med=x=>x.slice().sort((p,q)=>p-q)[Math.floor(x.length/2)];
    return {g2, groups, cols:Math.round(pv.width), gl:!!(PV_GL && PV_GL.available), draw:med(DP.slice(DP0)), drawMax:Math.max(...DP.slice(DP0)), drawP95:DP.slice(DP0).sort((a,b)=>a-b)[Math.floor(0.95*(DP.length-DP0))], fps:1000/med(an.frames)}; }
  window.I6={spectrum, spectrumFor, load, g3, g12, compare, frames, animate};
}
module.exports={I6_SETUP};
