// Collaudo automatico dell'interfaccia di Acchiappaspettri: carica spettri sintetici di tutti gli strumenti (più eventuali file veri),
// esercita schede, elaborazioni, deconvoluzione, menu del clic destro, ricette, riferimenti, più campioni, confronti, esportazioni
// (PDF, ZIP con PNG/SVG/CSV, Excel per Origin, risultati delle analisi), rinomina, preset, modalità, falso colore, ogni comando della barra ⌘K,
// le scorciatoie, la selezione multipla, il salvataggio e la riapertura del progetto e la finestra delle novità, e registra ogni errore.
// Uso: servi la cartella del progetto (es. python3 -m http.server), apri la pagina e nella console del browser:
//   const s=document.createElement('script'); s.src='test/ui-collaudo.js'; document.head.appendChild(s);
//   // facoltativo: window.REALI=['percorso/file1.csv', …] (URL relativi alla pagina)
//   runHarness().then(r=>console.log(r));      // r.errs è vuoto se tutto va bene; dura alcuni minuti
//   runHarness({soloNuovo:true})                // solo barra dei comandi, scorciatoie, novità, selezione multipla e progetto
// I download sono disattivati durante il collaudo.
window.H = { errs:[], steps:0 };
const rec=(ctx,e)=>{ H.errs.push(ctx+' → '+(e&&e.stack?e.stack.split('\n').slice(0,3).join(' | '):String(e))); };
window.addEventListener('error', e=>rec('window.error', e.error||e.message));
window.addEventListener('unhandledrejection', e=>rec('promise', e.reason));
const T=async (ctx, fn)=>{ H.steps++; try{ await fn(); }catch(e){ rec(ctx,e); } };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function rng(seed){ let s=seed>>>0||1; return ()=>{ s^=s<<13; s>>>=0; s^=s>>>17; s^=s<<5; s>>>=0; return s/4294967296; }; }
const r=rng(42), gs=()=>{ let u=0,v=0; while(!u)u=r(); while(!v)v=r(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); };
const G=(x,c,w,h)=>h*Math.exp(-4*Math.LN2*((x-c)/w)**2), Lz=(x,c,w,h)=>h/(1+4*((x-c)/w)**2);
const mk=(x0,x1,n,fn,sep='\t')=>Array.from({length:n},(_,i)=>{ const x=x0+(x1-x0)*i/(n-1); return x.toFixed(4)+sep+fn(x).toFixed(5); }).join('\n');
window.synthFiles=()=>{ const F={};
  F['ftir_A.txt']=mk(4000,600,1701,x=>0.02+Lz(x,1730,20,0.8)+Lz(x,2920,25,0.3)+Lz(x,1160,30,0.5)+gs()*0.002);
  F['ftir_T.csv']=mk(4000,600,1701,x=>100*Math.pow(10,-(0.02+Lz(x,1650,30,0.6)+Lz(x,1550,25,0.4)+Lz(x,3290,80,0.3)))+gs()*0.1,';').replace(/\./g,',');
  F['raman_cr.txt']=mk(100,1800,1700,x=>500+2000*Math.exp(-(((x-900)/600)**2))+Lz(x,1086,6,1500)+Lz(x,712,7,300)+(Math.abs(x-555)<0.6?3000:0)+gs()*20);
  F['uv_abs.txt']=mk(250,800,551,x=>{ const E=1239.84/x; return 0.05+(E>3.2?Math.sqrt(E-3.2):0)+gs()*0.002; });
  F['fluo_em350.txt']=mk(360,700,341,x=>20+900*Math.exp(-(((x-460)/30)**2))+gs()*3);
  F['DAD1_hplc.txt']=mk(0,20,4001,t=>1+[[3,0.05,100],[5.1,0.07,60],[5.4,0.07,30]].reduce((s,[c,sd,h])=>s+h*Math.exp(-0.5*((t-c)/sd)**2),0)+gs()*0.05);
  F['libs_SciAps.txt']='SciAps LIBS\n'+mk(180,900,6000,x=>50+[[396.15,0.08,5000],[393.37,0.08,4000],[422.67,0.08,2000],[288.16,0.08,1500],[248.33,0.1,800],[279.55,0.08,1200],[280.27,0.08,900]].reduce((t,[c,w,h])=>t+G(x,c,w,h),0)+gs()*5);
  F['tga_cell.txt']='Time (min)\tTemperature (°C)\tWeight (mg)\n'+Array.from({length:800},(_,i)=>{ const T=30+i, m=10*(1-0.05/(1+Math.exp(-(T-90)/8))-0.6/(1+Math.exp(-(T-330)/12))); return (i*0.1).toFixed(2)+'\t'+T+'\t'+(m+gs()*0.002).toFixed(4); }).join('\n');
  F['dsc_pla.txt']='Time (min)\tTemperature (°C)\tHeat Flow (mW)\n'+Array.from({length:1500},(_,i)=>{ const T=20+i*0.12; return (i*0.012).toFixed(3)+'\t'+T.toFixed(2)+'\t'+(-0.5-0.002*T+0.3/(1+Math.exp(-(T-60)/1))-5*Math.exp(-0.5*((T-165)/2)**2)+gs()*0.01).toFixed(4); }).join('\n');
  F['epr_rad.txt']='MWFQ 9.4e9\nField (G)\tIntensity\n'+Array.from({length:1024},(_,i)=>{ const B=3300+200*i/1023, t=(B-3373)/4; return B.toFixed(2)+'\t'+(-1000*2*t/(1+t*t)**2+gs()*5).toFixed(2); }).join('\n');
  F['1H_nmr.txt']='# 1H NMR\nppm\tintensity\n'+mk(10,-1,4000,d=>[[7.26,0.004,30],[3.67,0.004,300],[1.26,0.004,100]].reduce((s,[c,w,h])=>s+h/(1+((d-c)/w)**2),0)+gs()*0.3);
  F['gen_dati.txt']=mk(0,1,200,x=>Math.sin(10*x)+gs()*0.05);
  F['xrf_counts.mca']=Array.from({length:1024},(_,i)=>Math.round(10+G(i,400,12,500)+G(i,450,12,90)+r()*5)).join('\n');   // senza calibrazione
  // casi limite
  F['vuoto.txt']=''; F['testo.txt']='solo parole\nnessun numero'; F['due_punti.txt']='1\t2\n2\t3';
  F['costante.txt']=mk(400,4000,500,x=>5); F['nan.txt']=mk(400,4000,300,x=>Math.sin(x/50))+'\n1000\tNaN\n2000\tinf';
  F['neg_log.txt']=mk(100,1800,300,x=>-50+Lz(x,1000,10,100));
  F['decrescente_dup.txt']=mk(3000,500,400,x=>Lz(x,1700,20,1)+0.01)+'\n1700\t0.5\n1700\t0.6';
  F['virgola_decimale.csv']='x;y\n'+Array.from({length:300},(_,i)=>`${(400+i*12).toString().replace('.',',')};${(Math.sin(i/9)+2).toFixed(4).replace('.',',')}`).join('\n');
  return F; };
window.runHarness=async (opt)=>{ opt=opt||{};
  H.errs=[]; H.steps=0;
  window.download=()=>{}; window.alert=()=>{}; window.confirm=()=>true;   // niente download né finestre durante il collaudo
  const ents=[]; for (const u of (window.REALI||[])){ try{ const res=await fetch(u); if (res.ok) ents.push({file:new File([await res.arrayBuffer()], u.split('/').pop()), path:'reali/'+u.split('/').pop()}); }catch(e){} }
  for (const [n,t] of Object.entries(synthFiles())) ents.push({file:new File([t], n), path:'sint/'+n});
  await T('addEntries', ()=>addEntries(ents));
  document.querySelectorAll('dialog[open]').forEach(d=>d.close()); go(2); try{ endTour(); }catch(e){}
  H.loaded=files.map(f=>f.name+':'+f.instr+'/'+f.kind+(f.uncal?'/uncal':''));
  const tabs=$$('#tabs .tab').map(t=>t.dataset.tab);
  if (!opt.soloNuovo) for (let i=0;i<files.length;i++){ const f=files[i], it=f.instr, ctx=f.name;
    cur=i; await T(ctx+' refresh', ()=>refreshAll());
    for (const t of tabs) await T(ctx+' tab '+t, ()=>openTab(t));
    await T(ctx+' sezioni', ()=>{ $$('#v2 details').forEach(d=>d.open=true); renderAnalysis(); renderMulti(); });
    await T(ctx+' ricette', async ()=>{ const n=$$('#recipes [data-r]').length; for (let k=0;k<n;k++){ cur=i; openTab('an'); const b=$$('#recipes [data-r]')[k]; if (b){ b.click(); await sleep(30); } } $('#dlgImg').open && $('#dlgImg').close(); });
    cur=i; refreshAll();
    // tutte le elaborazioni
    const conv=INSTR[it].conv, base=['none','rubber','linear','arpls','snip'];
    for (const cv of conv) for (const b of base) for (const sm of [0,15]) for (const dv of [0,2]){
      S.conv[it]=cv; S.base[it]=b; S.smooth[it]=sm; S.deriv[it]=dv; S.spike[it]=(sm===15); S.logY[it]=dv===0 && b==='none'; S.logX[it]=false;
      files.forEach(g=>{ g._pk=null; g._autoKey=null; g._areaKey=null; });
      await T(`${ctx} proc conv=${cv} base=${b} sm=${sm} der=${dv}`, ()=>{ renderPreview(); renderAnalysis(); viewOf(f); });
    }
    S.conv[it]='orig'; S.base[it]='none'; S.smooth[it]=0; S.deriv[it]=0; S.spike[it]=false; S.logY[it]=it==='xrf'; files.forEach(g=>{ g._pk=null; g._autoKey=null; g._areaKey=null; });
    await T(ctx+' logX', ()=>{ S.logX[it]=true; renderPreview(); S.logX[it]=false; renderPreview(); });
    await T(ctx+' aree', ()=>{ S.showArea=true; files.forEach(g=>g._areaKey=null); renderPreview(); renderAnalysis(); });
    await T(ctx+' deconvoluzione auto', ()=>{ openTab('an'); $('#fitA').value=''; $('#fitB').value=''; $('#fitMode').value='auto'; runFitUI(false); });
    await T(ctx+' deconvoluzione picchi segnati', ()=>{ $('#fitMode').value='fixed'; runFitUI(false); $('#fitMode').value='auto'; });
    await T(ctx+' deconvoluzione su tutti', ()=>{ const b=$('#fitAllSp'); if (b) b.click(); });
    await T(ctx+' tecnica', ()=>{ $$('#anTech [data-an]').forEach(el=>{ el.value='0.5'; el.onchange&&el.onchange(); }); $$('#anTech [data-ans]').forEach(el=>{ el.selectedIndex=el.options.length-1; el.onchange&&el.onchange(); }); });
    await T(ctx+' azioni assistente', ()=>{ $$('#anQual [data-act]').forEach(b=>b.click()); });
    await T(ctx+' colore XRF', ()=>{ const b=$('#anHyp [data-col="green"]'); if (b) b.click(); });
    if (it==='xrf' && !f.uncal) await T(ctx+' concentrazioni XRF', ()=>{ openTab('an'); $('#secCult').open=true; renderCult(f);
      for (const m of ['norm','oxides','compton']){ const c=fpCfg(f); c.mode=m; fpSaveCfg(f,c); renderCult(f); }
      const c=fpCfg(f); c.bal='custom'; c.balTxt='CaSO4·2H2O'; fpSaveCfg(f,c); renderCult(f); c.els=['Cu','Pb','Ca','Fe','S']; fpSaveCfg(f,c); renderCult(f);
      c.S={anode:'Rh', kv:35, psi1:60, psi2:50, d2:1.2, atm:'he'}; fpSaveCfg(f,c); renderCult(f); $('#fpSall').click();
      for (const meth of ['ratio','atten']) for (const cov of ['org','gesso','oro','custom']){ const c2=fpCfg(f); c2.layer={on:true, el:'Pb', method:meth, cover:cov, coverTxt:'C 60 H 8 O 32', coverRho:1.1, sub:'biacca', ref:(files.find(g=>g!==f && g.instr==='xrf' && !g.uncal)||{}).id}; fpSaveCfg(f,c2); renderCult(f); }
      const c3=fpCfg(f); c3.layer={on:true, el:'Cu', method:'ratio', cover:'oro', sub:'fp'}; c3.mode='norm'; delete c3.els; delete c3.S; fpSaveCfg(f,c3); renderCult(f); });
    await T(ctx+' menu destro', async ()=>{ renderPreview(); const g=geo, rc=pv.getBoundingClientRect(), sx=rc.width/PV_W;
      const pts=[g.hits[0] ? [g.hits[0].x, g.hits[0].y] : null, [g.px0+g.pw*0.5, g.py0+g.ph*0.5]].filter(Boolean);
      for (const [x,y] of pts){ pv.dispatchEvent(new MouseEvent('contextmenu',{clientX:rc.left+x*sx, clientY:rc.top+y*sx, bubbles:true, cancelable:true}));
        const items=$$('#ctxMenu button').map(b=>b.textContent); closeCtx();
        for (let k=0;k<items.length;k++){ cur=i; renderPreview(); const g2=geo; pv.dispatchEvent(new MouseEvent('contextmenu',{clientX:rc.left+x*sx, clientY:rc.top+y*sx, bubbles:true, cancelable:true}));
          const b=$$('#ctxMenu button')[k]; if (b && !/Ingrandisci una zona/.test(b.textContent)){ b.click(); await sleep(20); } closeCtx(); if (lassoOn) setLasso(false); } } });
    await T(ctx+' riferimenti', ()=>{ openTab('refs'); $('#refAddCur').click(); renderRefs(); const sb=$('#refMatches [data-show]'); if (sb) sb.click(); $('#mixRun').click(); });
    await T(ctx+' clic su picco e grafico', ()=>{ renderPreview(); const g=geo, rc=pv.getBoundingClientRect(), sx=rc.width/PV_W; pv.dispatchEvent(new MouseEvent('click',{clientX:rc.left+(g.px0+g.pw*0.3)*sx, clientY:rc.top+(g.py0+g.ph*0.4)*sx, bubbles:true})); closePop(); pkUndo(); });
    await T(ctx+' zoom', ()=>{ zoomBy(0.4); renderPreview(); zoomBy(3); });
  }
  S.showArea=false;
  // più campioni e chemiometria per ogni strumento
  if (!opt.soloNuovo) for (const it of [...new Set(files.map(f=>f.instr))]){
    await T('multi '+it, async ()=>{ openTab('multi'); $('#mvInstr').value=it; const c=mvCfg(it); c.which='all'; const P=processed(files.find(f=>f.instr===it)); c.a=P.xs[Math.floor(P.xs.length*0.3)]; c.b=P.xs[Math.floor(P.xs.length*0.6)]; mvSave();
      files.filter(f=>f.instr===it).forEach((f,k)=>anSet(f,'conc',k+1)); renderMulti();
      for (const m of ['height','area','value','centroid','fwhm']){ c.meas=m; renderMulti(); }
      c.c=c.a; c.d=c.b; renderMulti(); delete c.c; delete c.d;
      c.model='pls'; renderMulti(); c.model='line'; renderMulti();
      for (const pre of ['snv','msc','d1','d2','none']) for (const sc of ['mean','auto','pareto']){ c.pre=pre; c.scale=sc; runPCA(it); renderPCA(it); }
      if (it==='xrf'){ c.qEls=['Cu','Pb','Ag']; files.filter(f=>f.instr==='xrf').forEach((f,k)=>anSet(f,'std',{Cu:50+k, Pb:5, Ag:10})); renderMulti();
        c.qModel='fp'; renderMulti(); const xs=files.filter(f=>f.instr==='xrf'); xs.forEach((f,k)=>anSet(f,'std',k===0?{Cu:80, Pb:5, Ag:15}:null)); renderMulti(); c.q100=false; renderMulti(); c.q100=true; c.qModel='auto'; renderMulti(); }
      if (it==='raman' || it==='ftir'){ const g=files.find(f=>f.instr===it); if (g){ cur=files.indexOf(g); openTab('refs'); $('#mixRun').click(); const inp=$$('#mixOut .mixw'); inp.forEach((el,k)=>{ el.value=String(50+k*10); el.onchange(); }); $('#mixRun').click(); } } }); }
  // confronti
  if (!opt.soloNuovo) await T('confronti', ()=>{ setView('cmp'); $('#cmpAuto').click(); for (const c of COMPS){ curCmpId=c.id; for (const m of ['stack','over','norm']){ c.mode=m; renderCmp(); renderPreview(); } } setView('one'); });
  // esportazioni
  if (!opt.soloNuovo) for (const lang of ['it','en']) for (const pp of [1,9]) await T(`export ${lang} ${pp}/pag`, async ()=>{ S.lang=lang; LANG=lang; S.perPage=pp; S.outPdf=S.outPng=S.outSvg=S.outOrigin=S.csvPeaks=S.csvData=S.outAnalysis=true; S.pngDpi=300; S.pngW=8; S.pngH=6; saveS();
    const pdf=await buildPdf(); const z=await buildZip([{name:'r.pdf', blob:pdf}]); const zz=await JSZip.loadAsync(z); H['zip_'+lang+pp]=Object.keys(zz.files).length; const x=await buildOriginXlsx(); H['xlsx']=x.size; });
  S.lang='it'; LANG='it'; saveS();
  if (!opt.soloNuovo) await T('runExport', ()=>runExport());
  // rinomina, preset, modalità
  if (!opt.soloNuovo) await T('rinomina', ()=>{ openRename(); $('#rnTpl').value='Campione {N} – {strumento}'; renderRename(); applyRename(); $('#dlgRename').close(); });
  if (!opt.soloNuovo) await T('preset', ()=>{ $('#presetName').value='prova'; $('#presetSave').click(); $('#presetLoad').click(); $('#presetDel').click(); });
  if (!opt.soloNuovo) await T('sobrio/testo/esperto', ()=>{ S.expert=true; applyExpert(); $('#zoomTxt').click(); renderPreview(); $('#zoomTxt').click(); $('#zoomTxt').click(); S.sober=true; applySober(); renderAnalysis(); });
  if (!opt.soloNuovo) await T('giro', ()=>{ startTour(); for (let k=0;k<12;k++) $('#tNext') && $('#tNext').click(); endTour(); });
  if (!opt.soloNuovo) await T('falso colore', async ()=>{ const c=document.createElement('canvas'); c.width=300; c.height=200; const x=c.getContext('2d'); x.fillStyle='#2a4aa8'; x.fillRect(50,50,100,100); const b=await new Promise(rs=>c.toBlob(rs,'image/png'));
    await addEntries([{file:new File([b],'quadro_VIS.png'),path:'quadro_VIS.png'},{file:new File([b],'quadro_IR.png'),path:'quadro_IR.png'},{file:new File([b],'quadro_UVR.png'),path:'quadro_UVR.png'}]);
    await useAskedImages(); await sleep(300); for (const m of ['irfc','uvfc','mix','vis','ir']){ IM.mode=m; imCompose(); } $('#dlgImg').close(); });
  // barra dei comandi: ogni comando (tranne quelli che aprono il selettore di file o rifanno l'export completo)
  await T('comandi', async ()=>{ go(2); cur=0; refreshAll(); for (const q of ['arpls','deconv','pdf','calcite','novità','xyz qwe','']){ openCmd(); $('#cmdQ').value=q; cmdFilter(); $('#dlgCmd').close(); }
    const L=commands().filter(c=>!/Apri un progetto|Scarica adesso|Giro guidato|A cosa serve|Aspetto normale/.test(c.label));   // «Aspetto normale» ricarica la pagina
    for (const c of L){ try{ c.run(); }catch(e){ rec('comando «'+c.label+'»', e); } document.querySelectorAll('dialog[open]').forEach(d=>d.close()); if (typeof lassoOn!=='undefined' && lassoOn) setLasso(false); if ($('.preview').classList.contains('big')) setBig(false); await sleep(5); } H.cmds=L.length; });
  await T('scorciatoie', ()=>{ go(2); document.activeElement && document.activeElement.blur && document.activeElement.blur(); for (const k of ['1','2','3','4','5','6','a','d','f','f','c','c','?','e']){ document.dispatchEvent(new KeyboardEvent('keydown',{key:k, bubbles:true})); document.querySelectorAll('dialog[open]').forEach(d=>d.close()); go(2); } });
  await T('novità', ()=>{ showNews(); $('#dlgNews').close(); showNews(NOVITA); $('#nwOk').click(); });
  // selezione multipla: tutte le azioni sugli spettri dello stesso strumento
  await T('selezione multipla', async ()=>{ go(2); setView('one'); const it=files[0].instr; SEL.clear(); files.filter(f=>f.instr===it).slice(0,4).forEach(f=>SEL.add(f.id)); cur=files.findIndex(f=>SEL.has(f.id)); renderList();
    for (const b of ['exc','inc','ref','fit','pca']){ const el=$('#batchBar [data-b="'+b+'"]'); if (el){ el.click(); await sleep(20); go(2); setView('one'); renderList(); } }
    for (const sel of ['sample','instr']){ const el=$('#batchBar select[data-b="'+sel+'"]'); if (el){ el.selectedIndex=2; el.onchange(); renderList(); } }
    const c=$('#batchBar [data-b="cmp"]'); if (c){ c.click(); setView('one'); } });
  // progetto: salva, svuota, riapri, confronta
  await T('progetto', async ()=>{ let saved=null; const dl=window.download; window.download=(b,n)=>{ saved=b; }; saveProject(); window.download=dl; const txt=await saved.text(); const n=files.length, names=files.map(f=>f.name).sort().join('|');
    files.length=0; cur=-1; SEL.clear(); refreshAll(); await openProject(new File([txt],'p.acchiappa.json')); await sleep(200);
    if (files.length!==n || files.map(f=>f.name).sort().join('|')!==names) throw new Error(`progetto riaperto con ${files.length} spettri invece di ${n}`); H.proj=Math.round(txt.length/1024)+' kB'; });
  await T('togli dall\'elenco', ()=>{ SEL.clear(); files.slice(-2).forEach(f=>SEL.add(f.id)); renderList(); const n=files.length; $('#batchBar [data-b="del"]').click(); if (files.length!==n-2) throw new Error('rimozione non riuscita'); });
  return {steps:H.steps, errs:H.errs, loaded:H.loaded, zip:H.zip_it1, xlsx:H.xlsx, cmds:H.cmds, proj:H.proj};
};
