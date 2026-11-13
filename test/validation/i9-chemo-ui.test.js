// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I9 nella pagina vera (online e desktop, IT ed EN): serie da spettri SINTETICI (cinetica A → B → C nel tempo, tempo dal nome del file),
// MCR-ALS con MCR-BANDS, cinetica globale e confronto dei modelli, tono del desktop, esportazioni (tabelle di analisi, PDF),
// salvataggio e riapertura del progetto, nessun blocco oltre 50 ms su una serie 200 × 1000.
'use strict';
const test=require('node:test'), assert=require('node:assert'), B=require('./browser.js'), {pdfText}=require('./pdf-text.js');
const EMOJI=/[\p{Extended_Pictographic}]/u;
// spettri UV-Vis sintetici: A → B → C, k₁ = 0,05 s⁻¹, k₂ = 0,01 s⁻¹, bande gaussiane a 350, 480 e 600 nm
function kineticFiles(){ const out=[], k1=0.05, k2=0.01, g=(x,c,w)=>Math.exp(-0.5*((x-c)/w)**2);
  for (const t of [0,10,20,30,45,60,90,120,160,200,250,300,400,500]){ const a=Math.exp(-k1*t), b=k1/(k2-k1)*(Math.exp(-k1*t)-Math.exp(-k2*t)), c=1-a-b, L=['Wavelength (nm),Absorbance'];
    for (let x=300;x<=700;x+=2) L.push(x+','+(a*g(x,350,30)+b*g(x,480,40)+c*g(x,600,35)).toFixed(8)); out.push([`cinetica_t=${t}s.csv`, L.join('\n')]); }
  return out; }

test('I9: serie, MCR-ALS, cinetica globale, esportazioni e progetto', {timeout:15*60*1000}, async ()=>{
  const server=await B.startServer(), br=await B.launch();
  try{
    for (const [lang, desk] of [['it',false],['en',true],['it',true],['en',false]]){
      const {ctx, p, errors}=await B.openPage(br, server, {lang, desk}), tag=`${lang}${desk?' desktop':' online'}`;
      const r1=await p.evaluate(async L=>{ files.length=0; await addEntries(L.map(([n,t])=>({file:new File([t],n), path:n}))); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
        go(2); const d=$('#secChemo'); d.open=true; AcchChemo.render(); await new Promise(r=>setTimeout(r,50));
        const vals=[...document.querySelectorAll('#chemoBox [data-tv]')].map(e=>e.value), title=$('#chemoTitle').textContent, txt=$('#chemoBox').innerText;
        $('#chSMake').click(); await new Promise(r=>setTimeout(r,100));
        const sf=files.filter(f=>f.series); return {n:files.length, instr:[...new Set(files.map(f=>f.instr))], vals, title, txt, series:sf.length, shape:sf[0]&&sf[0].series.shape, t:sf[0]&&sf[0].series.t.values.slice(0,4), unit:sf[0]&&sf[0].series.t.unit}; }, kineticFiles());
      assert.strictEqual(r1.series, 1, tag+': serie creata'); assert.deepStrictEqual(r1.shape, [14,201]); assert.deepStrictEqual(r1.t, [0,10,20,30]); assert.strictEqual(r1.unit,'s', tag+': unità dal nome');
      assert.strictEqual(r1.vals.length, 14, tag+': un tempo per spettro'); assert.strictEqual(r1.instr.length, 1, tag+': stessa tecnica');
      if (desk) assert.ok(!EMOJI.test(r1.title+r1.txt), tag+': nessuna emoji nel desktop'); else assert.ok(/🧪/.test(r1.title), tag+': tono online');
      if (lang==='en') assert.ok(/Series, MCR-ALS and global kinetics/.test(r1.title) && /Build/.test(r1.txt), tag+': testi in inglese'); else assert.ok(/Serie, MCR-ALS e cinetica globale/.test(r1.title));

      // MCR-ALS: 3 componenti con chiusura, poi MCR-BANDS
      const r2=await p.evaluate(async ()=>{ const wait=async c=>{ for (let i=0;i<400 && !c();i++) await new Promise(r=>setTimeout(r,25)); return c(); };
        AcchChemo._rt.tab='mcr'; AcchChemo.render(); await wait(()=>$('#chMRun'));
        const f=AcchChemo.sel(); f.an=Object.assign(f.an||{}, {mcr:{nc:3, closure:1, init:'efa', initOn:'C'}}); AcchChemo.render(); $('#chMRun').click();
        await wait(()=>$('#chMBands')); const t1=$('#chemoBox').innerText, svg=document.querySelectorAll('#chemoBox svg.chemochart').length; $('#chMBands').click();
        await wait(()=>/MCR-BANDS/.test(($('#chMOut')||{}).innerText||'') && $('#chMOut table:nth-of-type(2)')); const res=f._chemo.mcr.res;
        return {t1, svg, lof:res.lof, bands:f._chemo.bands&&f._chemo.bands.res.width, t2:$('#chemoBox').innerText, warn:[...document.querySelectorAll('#chemoBox .chemowarn li')].map(l=>l.innerText)}; });
      assert.ok(r2.svg>=5, tag+': grafici di valori singolari, C, S e residui'); assert.ok(r2.lof<0.1, tag+': mancanza di adattamento '+r2.lof);
      assert.ok(r2.bands>0.01, tag+': MCR-BANDS segnala l\'ambiguità '+r2.bands);
      if (desk){ assert.ok(!EMOJI.test(r2.t2), tag+': nessuna emoji'); assert.ok(r2.warn.every(t=>/^△/.test(t)), tag+': segni del desktop'); } else assert.ok(r2.warn.every(t=>/^⚠️/.test(t)));
      if (lang==='en') assert.ok(/Lack of fit/.test(r2.t2) && !/Mancanza/.test(r2.t2), tag+': risultati in inglese');

      // cinetica globale A → B → C e confronto dei modelli
      const r3=await p.evaluate(async ()=>{ const wait=async c=>{ for (let i=0;i<600 && !c();i++) await new Promise(r=>setTimeout(r,25)); return c(); };
        const f=AcchChemo.sel(); AcchChemo._rt.tab='kin'; f.an.kin={model:'consec'}; AcchChemo.render(); $('#chKRun').click(); await wait(()=>$('#chKCsv'));
        const k=f._chemo.kin.res.params.map(p=>p.value); $('#chKCmp').click(); await wait(()=>f._chemo.cmp); await new Promise(r=>setTimeout(r,50));
        const best=f._chemo.cmp.res.rows.slice().sort((a,b)=>a.aic-b.aic)[0].label; return {k, best, txt:$('#chemoBox').innerText, svg:document.querySelectorAll('#chemoBox svg.chemochart').length}; });
      assert.ok(Math.abs(r3.k[0]-0.05)<1e-4 && Math.abs(r3.k[1]-0.01)<1e-4, tag+': k₁, k₂ '+r3.k); assert.ok(r3.svg>=4); assert.strictEqual(r3.best,'consec', tag+': AIC sceglie A → B → C');
      if (desk) assert.ok(!EMOJI.test(r3.txt), tag+': nessuna emoji nella cinetica');

      // esportazioni: tabelle di analisi e PDF
      const ex=await p.evaluate(async ()=>{ files.forEach(f=>f.include=!!f.series); const af=analysisFiles(); Object.assign(S,{outPdf:true, outAnalysis:true, summary:true});
        const u=new Uint8Array(await (await buildPdf()).arrayBuffer()); files.forEach(f=>f.include=true); return {af:af.map(a=>[a[0], a[1].slice(0,3000)]), pdf:Array.from(u)}; });
      const mc=ex.af.find(a=>/^mcr_als_/.test(a[0])), kc=ex.af.find(a=>/^(cinetica_globale|global_kinetics)_/.test(a[0]));
      assert.ok(mc && /MCR-ALS/.test(mc[1]) && /C3/.test(mc[1]), tag+': CSV di MCR-ALS'); assert.ok(kc && /k1/.test(kc[1]) && /AIC/.test(kc[1]), tag+': CSV della cinetica');
      if (lang==='en') assert.ok(/Lack of fit/.test(mc[1]) && /Sum of squares/.test(kc[1])); else assert.ok(/Mancanza di adattamento/.test(mc[1]) && /;/.test(kc[1]));
      const txt=pdfText(Buffer.from(ex.pdf)).join('\n'); assert.ok(/MCR-ALS/.test(txt) && /(Cinetica globale|Global kinetics)/.test(txt), tag+': PDF con i risultati');

      // progetto: la serie e le impostazioni si salvano e tornano
      const pr=await p.evaluate(async ()=>{ const b=await AcchProject.buildBytes(); files.length=0; refreshAll(); const ok=await AcchProject.openBytes(b,'i9.acchspettri',null);
        const f=files.find(q=>q.series); return {ok, n:files.length, shape:f&&f.series.shape, an:f&&f.an, t:f&&Array.from(f.series.t.values).slice(-2), d:f&&f.series.data[5]}; });
      assert.ok(pr.ok, tag+': progetto riaperto'); assert.strictEqual(pr.n, 15); assert.deepStrictEqual(pr.shape, [14,201]); assert.deepStrictEqual(pr.t, [400,500]);
      assert.deepStrictEqual(pr.an.mcr, {nc:3, init:'efa', initOn:'C', closure:1}); assert.deepStrictEqual(pr.an.kin, {model:'consec'});
      assert.deepStrictEqual(errors, [], tag+': nessun errore nella pagina');
      await ctx.close();
    }
  } finally { await br.close(); server.close(); }
});

test('I9 prestazioni: serie 200 × 1000, MCR-ALS, MCR-BANDS e cinetica senza blocchi oltre 50 ms', {timeout:10*60*1000}, async ()=>{
  const server=await B.startServer(), br=await B.launch();
  try{ const {ctx, p, errors}=await B.openPage(br, server, {lang:'it', desk:true});
    // lavoro deterministico: il carico della macchina (suite in parallelo) può solo aggiungere compiti lunghi; conta il migliore di 3 tentativi
    let r=null; for (let attempt=0; attempt<3 && !(r && r.long.length===0); attempt++) r=await p.evaluate(async ()=>{ const wait=async (c,n)=>{ for (let i=0;i<(n||4000) && !c();i++) await new Promise(r=>setTimeout(r,25)); return c(); };
      const m=200, n=1000, t=Array.from({length:m},(_,i)=>i*0.1), x=Array.from({length:n},(_,j)=>300+j*0.4), data=new Float64Array(m*n), g=(v,c,w)=>Math.exp(-0.5*((v-c)/w)**2); let s=1;
      for (let i=0;i<m;i++){ const a=Math.exp(-0.5*t[i]), b=0.5/(0.1-0.5)*(Math.exp(-0.5*t[i])-Math.exp(-0.1*t[i])); for (let j=0;j<n;j++){ s=(s*16807)%2147483647; data[i*n+j]=a*g(x[j],400,30)+b*g(x[j],500,40)+(1-a-b)*g(x[j],620,35)+0.001*(s/2147483647-0.5); } }
      const se={kind:'kinetics', t:{values:t, quantity:'tempo', unit:'s'}, x:{values:Float64Array.from(x), quantity:'x', unit:'nm'}, y:{}, shape:[m,n], dtype:'f64', data, meta:{}};
      files.length=0; const f=AcchChemo.makeSeriesFile(se,{name:'grande', path:'serie/grande.series', instr:'uv'}); files.push(f); cur=0; go(2); refreshAll();
      await new Promise(r=>setTimeout(r,400)); const T0=performance.now(); window.MARK=[];   // la preparazione dei dati di prova (sopra) non conta
       const long=[]; const po=new PerformanceObserver(l=>l.getEntries().forEach(e=>long.push(Math.round(e.duration)+'@'+Math.round(e.startTime-T0)))); po.observe({entryTypes:['longtask']});
      $('#secChemo').open=true; AcchChemo._rt.sel='serie/grande.series'; AcchChemo._rt.tab='mcr'; f.an={mcr:{nc:3, closure:1}}; AcchChemo.render(); await wait(()=>$('#chMRun'));
      const t0=performance.now(); MARK.push('run@'+Math.round(t0-T0)); $('#chMRun').click(); await wait(()=>$('#chMBands')); const tM=performance.now()-t0; MARK.push('mcrdone@'+Math.round(performance.now()-T0)); $('#chMBands').click(); await wait(()=>f._chemo.bands); MARK.push('bands@'+Math.round(performance.now()-T0));
      AcchChemo._rt.tab='kin'; f.an.kin={model:'consec'}; AcchChemo.render(); const t1=performance.now(); $('#chKRun').click(); await wait(()=>f._chemo.kin); const tK=performance.now()-t1;
      await new Promise(r=>setTimeout(r,200)); po.disconnect(); MARK.push('end@'+Math.round(performance.now()-T0)); return {long, mark:MARK, tM, tK, k:f._chemo.kin.res.params.map(p=>p.value)}; });
    assert.ok(Math.abs(r.k[0]-0.5)<0.01 && Math.abs(r.k[1]-0.1)<0.002, 'k '+r.k);
    console.log(`# I9 200×1000: MCR-ALS ${Math.round(r.tM)} ms, cinetica ${Math.round(r.tK)} ms, compiti lunghi ${JSON.stringify(r.long)} ${JSON.stringify(r.mark)}`);
    assert.ok(r.long.every(d=>d<=50), 'compiti oltre 50 ms: '+JSON.stringify(r.long));
    assert.deepStrictEqual(errors, []); await ctx.close();
  } finally { await br.close(); server.close(); }
});

test('I9 finestra Esporta per voci (desktop): «Risultati delle analisi» e PDF contengono MCR-ALS e cinetica', {timeout:10*60*1000}, async ()=>{
  const {openDesk}=require('./tauri-mock.js'), server=await B.startServer(), br=await B.launch();
  try{ const o=await openDesk(B, br, server); await o.p.waitForFunction(()=>window.__mock && window.__mock.menu);
    const r=await o.p.evaluate(async L=>{ const wait=async c=>{ for (let i=0;i<800 && !c();i++) await new Promise(r=>setTimeout(r,25)); return c(); };
      await addEntries(L.map(([n,t])=>({file:new File([t],n), path:n}))); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
      go(2); $('#secChemo').open=true; AcchChemo.render(); $('#chSMake').click(); await wait(()=>files.some(f=>f.series));
      const f=AcchChemo.sel(); f.an={mcr:{nc:3, closure:1}, kin:{model:'consec'}}; AcchChemo._rt.tab='mcr'; AcchChemo.render(); $('#chMRun').click(); await wait(()=>f._chemo&&f._chemo.mcr);
      AcchChemo._rt.tab='kin'; AcchChemo.render(); $('#chKRun').click(); await wait(()=>f._chemo.kin);
      Object.assign(S,{outPdf:true, outPng:false, outSvg:false, csvPeaks:false, csvData:false, csvRaw:false, outOrig:false, outAnalysis:true, outTrace:false, outOrigin:false, outProject:false, zipAll:false, expSub:false, expScope:'sel', expNames:{}, docTitle:'Serie'}); saveS(); syncControls(); go(3); renderSummary();
      window.__mock.pick.pick_export_dir={path:'/out/scelta', name:'scelta'}; await runExport();
      const D=window.__mock.disk, dec=u=>new TextDecoder().decode(u), pdf=Object.entries(D).find(([k])=>/\.pdf$/.test(k));
      let b=''; if (pdf) for (let i=0;i<pdf[1].length;i+=0x8000) b+=String.fromCharCode.apply(null,pdf[1].slice(i,i+0x8000));
      return {keys:Object.keys(D).sort(), mcr:Object.entries(D).filter(([k])=>/mcr_als_/.test(k)).map(([,v])=>dec(v).slice(0,2000)), kin:Object.entries(D).filter(([k])=>/cinetica_globale_/.test(k)).map(([,v])=>dec(v).slice(0,2000)), pdf:btoa(b)}; }, kineticFiles());
    assert.strictEqual(r.mcr.length, 1, 'CSV di MCR-ALS fra i risultati delle analisi: '+r.keys.join(', ')); assert.ok(/Mancanza di adattamento/.test(r.mcr[0]) && /C3/.test(r.mcr[0]));
    assert.strictEqual(r.kin.length, 1, 'CSV della cinetica: '+r.keys.join(', ')); assert.ok(/k1/.test(r.kin[0]) && /AIC/.test(r.kin[0]));
    assert.ok(r.keys.every(k=>k.startsWith('/out/scelta/')) && !r.keys.some(k=>/\.zip$/.test(k)), r.keys.join(', '));
    const txt=pdfText(Buffer.from(r.pdf,'base64')).join('\n'); assert.ok(/MCR-ALS/.test(txt) && /Cinetica globale/.test(txt), 'PDF con MCR-ALS e cinetica');
    assert.ok(!/[\p{Extended_Pictographic}]/u.test(r.mcr[0]+r.kin[0]), 'CSV del desktop senza emoji');
    const e=o.errors.slice(); await o.ctx.close(); assert.deepStrictEqual(e, []);
  } finally { await br.close(); server.close(); }
});
