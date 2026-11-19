// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I7: fit e XRF FP non raggiungono l'identità in Rust, quindi nel desktop girano in JS nel worker del nucleo (decisione del Capo
// Progetto, punto 4): deconvoluzione, fit su più spettri, stima a parametri fondamentali (pannello, sensibilità, taratura XRF con
// modello FP) non si calcolano più nella pagina, e i numeri sono identici bit per bit a quelli calcolati nella pagina. Online tutto resta
// nella pagina come prima. Spettri SINTETICI (test/fixtures/xrf-c25, picchi generati qui).
// Uso: PW_CHANNEL=chrome node --test test/validation/i7-rust-ui.test.js
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path');
const B=require('./browser.js'), {openDesk}=require('./tauri-mock.js');
const XRF=fs.readFileSync(path.join(B.ROOT,'test','fixtures','xrf-c25','C_Ag_s2.mca'),'utf8');
// quattro bande pseudo-Voigt sovrapposte con rumore, come in R3
const SYN=(()=>{ let s=5; const r=()=>{ s=(s*16807)%2147483647; return s/2147483647-0.5; }, SQ=Math.sqrt(Math.LN2/Math.PI);
  const pv=(x,c,w,e)=>{ const t=(x-c)/w; return e*2/(Math.PI*w)/(1+4*t*t)+(1-e)*2*SQ/w*Math.exp(-4*Math.LN2*t*t); }, P=[[1030,8,300,0.3],[1040,8,200,0.6],[1055,10,400,0.5],[1066,8,250,0.4]];
  const L=['Raman shift (cm-1),Intensity']; for (let i=0;i<=1000;i++){ const x=1000+i*0.1; L.push(x.toFixed(2)+','+(P.reduce((a,p)=>a+p[2]*pv(x,p[0],p[1],p[3]),0)+0.3*r()).toFixed(5)); } return L.join('\n'); })();

// conta le chiamate nella pagina delle funzioni del nucleo che devono andare nel worker
const SPY=()=>{ window.I7={page:{}}; for (const fn of ['deconvolve','fitPeaks','xrfFP']){ const o=window[fn]; window[fn]=function(...a){ I7.page[fn]=(I7.page[fn]||0)+1; return o.apply(this,a); }; window[fn].orig=o; } };
async function setup(p){ await p.evaluate(SPY); }

let server, br;
test.before(async()=>{ server=await B.startServer(); br=await B.launch(); });
test.after(async()=>{ await br.close(); server.close(); });

test('I7 desktop: deconvoluzione e fit su più spettri nel worker, stessi numeri della pagina', async()=>{
  const {p}=await openDesk(B, br, server); await setup(p);
  const r=await p.evaluate(async (syn)=>{ files.length=0; await addEntries([{file:new File([syn],'a.csv'), path:'a.csv'}, {file:new File([syn.replace(/,(\d+\.\d+)$/gm,(m,v)=>','+(+v*1.5).toFixed(5))],'b.csv'), path:'b.csv'}]);
    document.querySelectorAll('dialog[open]').forEach(d=>d.close()); cur=0; const f=files[0]; openTab('an'); $('#fitMode').value='auto'; $('#fitA').value='1010'; $('#fitB').value='1090';
    I7.page={}; await runFitUI(false); const pageCalls=Object.assign({}, I7.page);
    // riferimento: lo stesso calcolo nella pagina (funzione originale)
    const P=processed(f), U=upData(P), rg=fitRange(f); let a=0; while (a<P.xs.length && P.xs[a]<rg[0]) a++; let b=P.xs.length-1; while (b>=0 && P.xs[b]>rg[1]) b--;
    const seeds=viewOf(f).peaks.map(q=>q.x).filter(x=>x>=rg[0]&&x<=rg[1]), ref=deconvolve.orig(P.xs.subarray(a,b+1), U.y.subarray(a,b+1), {seeds, profile:$('#fitProf').value, base:$('#fitBase').value, fixed:false});
    const same=!!f.fit && f.fit.peaks.length===ref.peaks.length && f.fit.peaks.every((q,j)=>['c','w','eta','area','h','sc','sw','sarea'].every(k=>Object.is(q[k], ref.peaks[j][k]))) && Object.is(f.fit.r2, ref.r2) && Object.is(f.fit.bic, ref.bic);
    // «applica a tutti gli spettri»: il fit dell'altro spettro nel worker
    I7.page={}; const btn=$('#fitAllSp'); let all=null;
    if (btn){ await btn.onclick(); const g=files[1], Q=processed(g), V=upData(Q); let a2=0; while (a2<Q.xs.length && Q.xs[a2]<f.fit.range[0]) a2++; let b2=Q.xs.length-1; while (b2>=0 && Q.xs[b2]>f.fit.range[1]) b2--;
      const ref2=fitPeaks.orig(Q.xs.subarray(a2,b2+1), V.y.subarray(a2,b2+1), f.fit.peaks.map(q=>({x:q.c, w:q.w})), {profile:f.fit.profile, base:f.fit.bm});
      all={pageCalls:Object.assign({}, I7.page), same:!!g.fit && g.fit.peaks.every((q,j)=>['c','w','area','sc'].every(k=>Object.is(q[k], ref2.peaks[j][k])))}; }
    return {pageCalls, same, peaks:f.fit&&f.fit.peaks.length, worker:AcchEngine.stats, all, msg:$('#fitMsg').hidden}; }, SYN);
  assert.ok(r.peaks>=2, 'deconvoluzione fatta: '+r.peaks);
  assert.ok(!r.pageCalls.deconvolve && !r.pageCalls.fitPeaks, 'la deconvoluzione non deve girare nella pagina: '+JSON.stringify(r.pageCalls));
  assert.ok(r.same, 'stessi numeri del calcolo nella pagina');
  assert.ok(r.msg, 'messaggio «in corso» tolto alla fine');
  assert.ok(r.all, 'pulsante «applica a tutti»'); assert.ok(!r.all.pageCalls.fitPeaks, 'fit degli altri spettri nella pagina: '+JSON.stringify(r.all.pageCalls)); assert.ok(r.all.same, 'fit dell\'altro spettro: stessi numeri');
});

test('I7 desktop: stima XRF FP, sensibilità e taratura con modello FP nel worker, stessi numeri della pagina', async()=>{
  const {p}=await openDesk(B, br, server); await setup(p);
  const r=await p.evaluate(async (xrf)=>{ files.length=0; await addEntries([{file:new File([xrf],'lega.mca'), path:'lega.mca'}]); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
    const f=files[0]; cur=0; const c=fpCfg(f); c.els=['Ag','Cu']; fpSaveCfg(f,c); f._fpKey=null; openTab('an'); const sec=$('#secCult'); sec.open=true;
    I7.page={}; renderCult(f); const placeholder=$('#anCult').textContent;
    for (let t=0;t<600 && !fpReady(f);t++) await new Promise(r=>setTimeout(r,50)); await new Promise(r=>setTimeout(r,50));
    const pageCalls=Object.assign({}, I7.page), W=f._fpRes, shown=$('#anCult').textContent;
    f._fpKey=null; const q=fpPlan(f), ref=xrfFP.orig(...q.args()); const same=JSON.stringify(Object.entries(W.Q.res))===JSON.stringify(Object.entries(ref.Q.res)) && Object.keys(W.Q.res).every(e=>Object.is(W.Q.res[e].w, ref.Q.res[e].w));
    fpStore(f, q, W);
    I7.page={}; const sens=await fpSensitivity(f), sensCalls=Object.assign({}, I7.page);
    // taratura XRF con il modello a parametri fondamentali (pannello dei confronti): righe calcolate nel worker
    const mc=mvCfg('xrf'), list=mvFiles('xrf', mc); mc.qModel='fp'; mc.qEls=['Ag','Cu']; list.forEach(g=>{ g._xqfKey=null; }); I7.page={};
    let xq=null; if ($('#xqBox')){ renderXrfQuant('xrf'); const ph=$('#xqBox').textContent; for (let t=0;t<600 && !xqfReady(list, mc.qEls);t++) await new Promise(r=>setTimeout(r,50)); await new Promise(r=>setTimeout(r,50));
      const g=list[0], ref=xrfFP.orig(fpData(g).xs, fpData(g).ys, mc.qEls, fpSetupOf(g), {mode:'norm'});
      xq={ph, calls:Object.assign({}, I7.page), n:list.length, same:JSON.stringify(g._xqf.meas)===JSON.stringify(ref.meas)}; }
    return {pageCalls, placeholder, shown:shown.length, same, sens:sens&&sens.n, sensCalls, ag:W.Q.res.Ag&&W.Q.res.Ag.w, xq}; }, XRF);
  assert.match(r.placeholder, /Calcolo della composizione in corso/);
  assert.ok(!r.pageCalls.xrfFP, 'la stima FP non deve girare nella pagina: '+JSON.stringify(r.pageCalls));
  assert.ok(r.shown>200, 'pannello disegnato dopo il calcolo'); assert.ok(r.same, 'stessi numeri del calcolo nella pagina'); assert.ok(r.ag>80, 'Ag '+r.ag);
  assert.equal(r.sens, 8); assert.ok(!r.sensCalls.xrfFP, 'sensibilità nella pagina: '+JSON.stringify(r.sensCalls));
  assert.ok(r.xq && r.xq.n>=1, 'pannello della taratura XRF'); assert.match(r.xq.ph, /Calcolo della composizione in corso/); assert.ok(!r.xq.calls.xrfFP, 'taratura FP nella pagina: '+JSON.stringify(r.xq.calls)); assert.ok(r.xq.same, 'taratura FP: stessi numeri');
});

test('I7 online: deconvoluzione e stima FP restano nella pagina, come prima', async()=>{
  const {p}=await B.openPage(br, server); await setup(p);
  const r=await p.evaluate(async (syn)=>{ files.length=0; await addEntries([{file:new File([syn],'a.csv'), path:'a.csv'}]); document.querySelectorAll('dialog[open]').forEach(d=>d.close()); cur=0; openTab('an');
    $('#fitMode').value='auto'; $('#fitA').value='1010'; $('#fitB').value='1090'; I7.page={}; await runFitUI(false); return {calls:I7.page, ok:!!files[0].fit, engine:typeof AcchEngine}; }, SYN);
  assert.equal(r.engine, 'undefined'); assert.ok(r.ok); assert.ok(r.calls.deconvolve>=1, JSON.stringify(r.calls));
});
