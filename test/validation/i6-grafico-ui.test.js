// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I6, grafico veloce (dati SINTETICI, test/validation/grafico-dati.js):
// - le esportazioni PNG e SVG sono identiche byte per byte con e senza l'indice min/max (app/plot-index.js), e l'indice si usa davvero;
// - G3: a schermo (WebGL e ripiego Canvas 2D) le cime sono quelle del disegno pieno (tutti i punti), colonna per colonna, alle risoluzioni
//   di prova, e i picchi stretti di un punto ci sono tutti;
// - G1/G2 nel browser: 20 spettri da 1M punti, primo disegno del confronto ≤ 3 s; costo di ogni ridisegno proporzionale alle colonne
//   (contato, non cronometrato); i tempi (≥ 50 fps, nessun ridisegno oltre 50 ms) si controllano qui solo se il Mac non è sovraccarico,
//   altrimenti NON VERIFICATO nel registro: valgono le misure dell'app vera (scripts/misura-motore.js --grafico-g).
// - nell'online niente WebGL: il grafico resta su un solo canvas.
'use strict';
const test=require('node:test'), assert=require('node:assert'), os=require('os');
const B=require('./browser.js'), {openDesk}=require('./tauri-mock.js'), {I6_SETUP}=require('./grafico-dati.js');

let server, br;
test.before(async()=>{ server=await B.startServer(); br=await B.launch(); });
test.after(async()=>{ await br.close(); server.close(); });
async function desk(){ const o=await openDesk(B, br, server); await o.p.evaluate(I6_SETUP); return o; }

test('esportazioni PNG e SVG identiche con e senza l\'indice min/max (spettro, riquadro ingrandito, confronto); l\'indice si usa', async()=>{
  const o=await desk();
  const r=await o.p.evaluate(async()=>{ const L=await I6.load(3, 300000); const f=L[0];
    const views=()=>{ const v=viewOf(f); v.title='Uno'; const w=viewOf(f); w.inset={x:[1400,2700], y:[0,1], auto:true}; const c=overlayView(f.instr, L, 'stack', 1.1, 'Confronto'); const c2=overlayView(f.instr, L, 'over', 1.1, 'Confronto'); return [v,w,c,c2]; };
    const out=V=>V.map(v=>[renderSvg(Object.assign({},v), 160, 100, 9), renderCanvas(Object.assign({},v), 160, 100, 150, 9).toDataURL(), renderCanvas(Object.assign({},v), 80, 50, 600, 9).toDataURL()]);
    const b0=AcchPlot.info().groups; const fast=out(views()), used=AcchPlot.info().groups-b0;
    const keep=window.AcchPlot; window.AcchPlot=undefined; let slow; try{ slow=out(views()); } finally { window.AcchPlot=keep; }
    return {same:fast.map((a,i)=>a.map((x,j)=>x===slow[i][j])), used, len:fast[0][0].length}; });
  assert.ok(r.used>1000, 'l\'indice min/max deve essere usato nelle esportazioni: gruppi '+r.used);
  assert.deepEqual(r.same, [[true,true,true],[true,true,true],[true,true,true],[true,true,true]], 'SVG, PNG 150 dpi, PNG 600 dpi');
  assert.ok(r.len>10000);
  assert.deepEqual(o.errors, []); await o.ctx.close();
});

test('G3: a schermo (WebGL e Canvas 2D) le cime di ogni colonna sono quelle del disegno pieno, alle risoluzioni di prova; nessun picco stretto si perde', async()=>{
  const o=await desk();
  const r=await o.p.evaluate(async()=>{ const n=1e6, {xs}=I6.spectrum(n,0), ys=new Float64Array(n);
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
    return res; });
  const nv=r.find(x=>x.gl==='ingenua'); assert.ok(nv && (nv.spk>3 || nv.worst>3), 'la prova deve scoprire un disegno che perde i picchi: '+JSON.stringify(nv));
  for (const x of r.filter(x=>x.gl!=='ingenua')){ if (x.skip){ console.log('NON VERIFICATO WebGL a '+x.cw+' px: '+x.skip); continue; }
    assert.equal(x.miss, 0, JSON.stringify(x)+': colonne con traccia diverse');
    assert.ok(x.worst<=1, JSON.stringify(x)+': cima o fondo di una colonna oltre 1 px dal disegno pieno');
    assert.ok(x.spk<=1, JSON.stringify(x)+': cima di un picco stretto oltre 1 px'); }
  assert.ok(r.some(x=>x.gl && !x.skip), 'WebGL provato almeno a una risoluzione');
  assert.deepEqual(o.errors, []); await o.ctx.close();
});

test('G1/G2 nel browser: 20 spettri da 1M punti; primo disegno del confronto ≤ 3 s; ridisegni proporzionali alle colonne; tempi se il Mac lo permette', async t=>{
  const o=await desk();
  const r=await o.p.evaluate(async()=>{ const L=await I6.load(20, 1e6); await new Promise(r=>setTimeout(r,500));
    let drawn=0; const od=window.drawPlot, DP=[]; window.drawPlot=function(){ const q=performance.now(); const x=od.apply(this,arguments); const e=performance.now(); if (pvView && pvView.series && pvView.series.length===20){ if (!drawn) drawn=e; DP.push(e-q); } return x; };
    const a=performance.now(); I6.compare(L); for (let i=0;i<600 && !drawn;i++) await new Promise(r=>setTimeout(r,10)); const g2=drawn-a;
    await I6.frames(); const g0=AcchPlot.info().groups; const DP0=DP.length; const an=await I6.animate(40); const groups=(AcchPlot.info().groups-g0)/(DP.length-DP0);
    window.drawPlot=od; const med=x=>x.slice().sort((p,q)=>p-q)[Math.floor(x.length/2)];
    return {g2, groups, cols:Math.round(pv.width), gl:!!(PV_GL && PV_GL.available), draw:med(DP.slice(DP0)), drawMax:Math.max(...DP.slice(DP0)), fps:1000/med(an.frames)}; });
  console.log('I6 G1/G2 (browser): '+JSON.stringify(r)+' carico '+os.loadavg()[0].toFixed(1));
  assert.ok(r.g2<=3000, 'G2: primo disegno del confronto 20×1M in '+Math.round(r.g2)+' ms');
  // per ridisegno: al più 2 passate per spettro (inviluppo e traccia), ciascuna con al più una colonna per pixel
  assert.ok(r.groups<=20*2*r.cols*1.05, 'gruppi per ridisegno '+Math.round(r.groups)+' con '+r.cols+' colonne');
  assert.ok(r.gl, 'tracce con WebGL nel desktop');
  if (os.loadavg()[0] > os.cpus().length){ t.diagnostic('NON VERIFICATO a tempo: Mac carico ('+os.loadavg()[0].toFixed(0)+')'); }
  else { assert.ok(r.fps>=50, 'G1: '+r.fps.toFixed(0)+' fps'); assert.ok(r.drawMax<=50, 'ridisegno più lungo '+Math.round(r.drawMax)+' ms'); }
  assert.deepEqual(o.errors, []); await o.ctx.close();
});

test('online: niente livelli WebGL, il grafico resta su un solo canvas e si disegna come prima', async()=>{
  const o=await B.openPage(br, server); await o.p.evaluate(I6_SETUP);
  const r=await o.p.evaluate(async()=>{ await I6.load(1, 200000); await I6.frames(); return {layers:document.querySelectorAll('.pvlayer').length, gl:typeof PV_GL==='undefined' ? 'x' : PV_GL, plot:!!window.AcchPlot}; });
  assert.deepEqual(r, {layers:0, gl:null, plot:true});
  assert.deepEqual(o.errors, []); await o.ctx.close();
});
