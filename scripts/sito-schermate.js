// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Schermate VERE del programma per il sito di presentazione (scarica/img/*.webp), rigenerate in modo riproducibile con Playwright.
// Pagina online (test/validation/browser.js) e anteprima dell'app desktop con il finto Tauri dei test (test/validation/tauri-mock.js).
// Solo dati SINTETICI o del corpus di prova già nel repository: examples/, test/corpus/, test/fixtures/, test/validation/chemo.
// Le PNG di Playwright diventano WebP (qualità 0,8) disegnandole su un canvas: nessuna dipendenza in più.
// Uso: node scripts/sito-schermate.js [nome …]   (senza nomi le rifà tutte; PW_CHANNEL=chrome usa Chrome installato,
//      PW_CHROMIUM=/percorso/chromium un Chromium già presente)
'use strict';
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..'), B=require(path.join(ROOT,'test/validation/browser.js')), TM=require(path.join(ROOT,'test/validation/tauri-mock.js'));
const OUT=path.join(ROOT,'scarica','img'), W=1440, H=900, Q=0.8, MAXKB=160;
const rd=(...p)=>fs.readFileSync(path.join(ROOT,...p),'utf8');
const dir=(d,re)=>fs.readdirSync(path.join(ROOT,d)).filter(n=>re.test(n)).sort().map(n=>[n, rd(d,n)]);
const FTIR=()=>dir('examples/ftir-polietilene-sintetico',/\.csv$/), HPLC=()=>dir('examples/hplc-taratura-sintetico',/\.csv$/);
const corpus=n=>[n, rd('test/corpus/c',n)];
const {raman}=require(path.join(ROOT,'test/fixtures/raman-sintetici.js'));
// Raman con fluorescenza: picchi a 282, 712 e 1086 cm⁻¹ sopra la fluorescenza (come in fondo-picchi-ui.test.js; seme 17: gobba larga)
const ramanFluo=seed=>{ const s=raman(seed||17,{noise:0.004}); let t='Raman Shift (cm-1)\tIntensity\n'; const x=s.x, base=s.base;
  for (let i=0;i<x.length;i++){ const v=x[i], pk=1/(1+((v-1086)/4)**2)+0.6/(1+((v-712)/5)**2)+0.3/(1+((v-282)/6)**2); t+=v.toFixed(3)+'\t'+(1000*(base[i]+pk)+4*Math.sin(i*1.7)).toFixed(3)+'\n'; } return t; };

// nella pagina: carica i file, chiude le finestre, passo 2 sul primo spettro
async function load(p, list, opt){
  opt=opt||{};
  await p.evaluate(async ([list, step])=>{ await addEntries(list.map(([n,t,b])=>({file:new File([b ? Uint8Array.from(atob(t),c=>c.charCodeAt(0)) : t], n), path:n})));
    document.querySelectorAll('dialog[open]').forEach(d=>d.close()); go(step); cur=0; refreshAll(); }, [list, opt.step||2]);
  await p.waitForTimeout(opt.wait||900);
}
const closeDialogs=p=>p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));

let br, server, conv;
// PNG → WebP con il canvas di una pagina vuota; se supera MAXKB abbassa la qualità
async function toWebp(png, name){
  const b64=png.toString('base64'); let q=Q, buf;
  for (;;){ const url=await conv.evaluate(async ([b64,q])=>{ const im=new Image(); im.src='data:image/png;base64,'+b64; await im.decode();
      const c=document.createElement('canvas'); c.width=im.naturalWidth; c.height=im.naturalHeight; c.getContext('2d').drawImage(im,0,0); return c.toDataURL('image/webp', q); }, [b64,q]);
    buf=Buffer.from(url.split(',')[1],'base64'); if (buf.length<=MAXKB*1024 || q<=0.5) break; q-=0.05; }
  fs.writeFileSync(path.join(OUT,name), buf); return {q, kb:Math.round(buf.length/1024)};
}
async function shoot(o, name, clip, keepToast){
  if (!keepToast) await hideToast(o.p);
  await o.p.waitForTimeout(300);
  const toast=await o.p.evaluate(()=>{ const t=document.querySelector('#toast'); return t && t.classList.contains('on') && t.classList.contains('err') ? t.textContent : ''; });
  if (toast) throw new Error(name+': avviso di errore sullo schermo: '+toast);
  if (o.errors.length) throw new Error(name+': errori nella pagina: '+o.errors[0]);
  const png=await o.p.screenshot(clip ? {clip} : {}); const r=await toWebp(png, name);
  const vp=clip||o.p.viewportSize(); console.log(`${name}\t${Math.round(vp.width*(o.dpr||1))}×${Math.round(vp.height*(o.dpr||1))}\t${r.kb} KB\tq=${r.q.toFixed(2)}`);
}
async function online(opt){ const o=await B.openPage(br, server, opt||{}); await o.p.setViewportSize({width:W, height:H}); return o; }
async function desk(opt){ const o=await TM.openDesk(B, br, server, opt||{}); await o.p.setViewportSize({width:W, height:H}); await o.p.waitForFunction(()=>window.__mock && window.__mock.menu); return o; }

// dati sintetici aggiuntivi, calcolati qui (nessuna misura reale)
const lor=(x,c,w)=>1/(1+((x-c)/(w/2))**2), gau=(x,c,w)=>Math.exp(-Math.LN2*((x-c)/(w/2))**2);
function lcg(s){ return ()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296-0.5; }; }
// tre bande sovrapposte (Raman), da separare con la deconvoluzione
function bandeSovrapposte(){ const r=lcg(7); let t='# DATI SINTETICI - non è una misura reale\nRaman Shift (cm-1)\tIntensity\n';
  for (let x=900;x<=1250;x+=0.5){ const y=1000*(0.9*lor(x,1046,22)+1.0*gau(x,1068,20)+0.55*lor(x,1093,18))+120+0.15*(x-900)+6*r(); t+=x.toFixed(1)+'\t'+y.toFixed(2)+'\n'; } return t; }
// due riferimenti puri e una miscela 65:35 (Raman)
const compA=x=>1.0*lor(x,1086,9)+0.35*lor(x,712,8)+0.25*lor(x,282,10)+0.15*lor(x,156,8);
const compB=x=>0.8*lor(x,1001,7)+0.45*lor(x,1602,10)+0.3*lor(x,620,9)+0.2*lor(x,3054,14);
function ramanTxtOf(fn, seed, noise){ const r=lcg(seed); let t='# DATI SINTETICI - non è una misura reale\nRaman Shift (cm-1)\tIntensity\n';
  for (let x=100;x<=3200;x+=2) t+=x+'\t'+(1000*fn(x)+50+(noise||8)*r()).toFixed(2)+'\n'; return t; }
// tre gruppi di campioni Raman (5 ciascuno) per la PCA
function gruppiPCA(){ const out=[]; [['A',[1,0.3,0.2]],['B',[0.6,0.7,0.2]],['C',[0.4,0.3,0.8]]].forEach(([g,w],k)=>{ for (let i=1;i<=5;i++){ const r=lcg(100*k+i), j=()=>1+0.5*r();
    const a=w[0]*j(), b=w[1]*j(), c=w[2]*j(); out.push([`campione_${g}${i}_SINTETICO.txt`, ramanTxtOf(x=>a*lor(x,1086,10)+b*lor(x,1001,8)+c*lor(x,1602,12)+0.2*lor(x,712,9), 900+10*k+i, 12)]); } }); return out; }
// cinetica A → B → C (UV-Vis), come in i9-chemo-ui.test.js, con un po' di rumore
function cinetica(){ const out=[], k1=0.05, k2=0.01, g=(x,c,w)=>Math.exp(-0.5*((x-c)/w)**2);
  for (const t of [0,10,20,30,45,60,90,120,160,200,250,300,400,500]){ const a=Math.exp(-k1*t), b=k1/(k2-k1)*(Math.exp(-k1*t)-Math.exp(-k2*t)), c=1-a-b, L=['Wavelength (nm),Absorbance'];
    const r=lcg(t+1); for (let x=300;x<=700;x+=2) L.push(x+','+(a*g(x,350,30)+b*g(x,480,40)+c*g(x,600,35)+0.004*r()).toFixed(6)); out.push([`cinetica_t=${t}s.csv`, L.join('\n')]); }
  return out; }
const until=async (p, fn, arg, ms)=>p.waitForFunction(fn, arg, {timeout:ms||30000});
// nella pagina: aspetta che un pulsante sia pronto e lo preme
const clk=(p, q)=>p.evaluate(async q=>{ for (let i=0;i<1200;i++){ const e=document.querySelector(q); if (e && !e.disabled){ e.click(); return; } await new Promise(r=>setTimeout(r,25)); } throw new Error('elemento non pronto: '+q); }, q);
const hideToast=p=>p.evaluate(()=>{ const b=document.querySelector('#toastX'); if (b && document.querySelector('#toast.on')) b.click(); });
const accept=p=>p.evaluate(()=>{ const a=document.querySelector('#acceptAll'); if (a && !a.disabled) a.click(); });

// desktop: larghezza (o altezza) dei riquadri, come se l'utente li avesse trascinati
const panes=(p, sz)=>p.evaluate(async sz=>{ for (const [k,v] of Object.entries(sz)) AcchHost.store.setItem('acch.sh.'+k, JSON.stringify(v)); window.dispatchEvent(new Event('resize')); await new Promise(r=>setTimeout(r,200)); }, sz);

const SHOTS={
  'desktop-spazio.webp': async ()=>{ const o=await desk(); await load(o.p, FTIR()); await o.p.evaluate(()=>{ cur=5; refreshAll(); }); await accept(o.p); await o.p.waitForTimeout(500); await shoot(o,'desktop-spazio.webp'); return o; },
  'desktop-scuro.webp': async ()=>{ const o=await desk(); await o.p.evaluate(()=>{ localStorage.setItem('acch.ui.theme', JSON.stringify('dark')); AcchUi.applyTheme(); });
    await load(o.p, FTIR()); await o.p.evaluate(()=>{ cur=3; refreshAll(); }); await accept(o.p); await o.p.waitForTimeout(600); await shoot(o,'desktop-scuro.webp'); return o; },
  'online.webp': async ()=>{ const o=await online(); await load(o.p, [corpus('10_raman_header.txt')]); await accept(o.p); await hideToast(o.p); await shoot(o,'online.webp'); return o; },
  'online-mobile.webp': async ()=>{
    // contesto da telefono: 390×844, densità 2, tocco (stesse preferenze iniziali di browser.js)
    const ctx=await br.newContext({locale:'it-IT', viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true});
    await ctx.addInitScript(()=>{ localStorage.setItem('acch.welcomeDone','true'); localStorage.setItem('acch.seenVersion',JSON.stringify('99')); localStorage.setItem('acch.tourDone','true'); localStorage.setItem('acch.ui.entryDone','1'); localStorage.setItem('acch.ui.lang',JSON.stringify('it')); window.ACCH_CANALI='tutti'; });
    const p=await ctx.newPage(), errors=[]; p.on('pageerror',e=>errors.push(String(e))); await p.goto(`http://127.0.0.1:${server.address().port}/index.html`); await p.waitForFunction(()=>window.AcchProject && window.AcchUi);
    await p.evaluate(()=>{ try{ endTour(); }catch(e){} }); const m={ctx, p, errors, dpr:2}; await load(p, [corpus('10_raman_header.txt')]); await accept(p); await hideToast(p);
    await p.evaluate(()=>{ const c=document.querySelector('#workCard')||document.querySelector('#pv'); if (c) c.scrollIntoView({block:'start'}); }); await shoot(m,'online-mobile.webp'); return m; },
  'passo-carica.webp': async ()=>{ const o=await online(); await o.p.evaluate(()=>go(1)); await o.p.waitForTimeout(600); await shoot(o,'passo-carica.webp'); return o; },
  'passo-controlla.webp': async ()=>{ const o=await online(); await load(o.p, [corpus('67_raman_cosmic.txt')]); await hideToast(o.p);
    await o.p.evaluate(()=>{ openTab('an'); renderAnalysis(); const s=document.querySelector('#secQual'); s.open=true; }); await o.p.waitForTimeout(600); await shoot(o,'passo-controlla.webp'); return o; },
  'passo-scarica.webp': async ()=>{ const o=await online(); await load(o.p, FTIR()); await o.p.evaluate(()=>{ go(3); renderSummary(); window.scrollTo(0,0); }); await hideToast(o.p); await o.p.waitForTimeout(600); await shoot(o,'passo-scarica.webp'); return o; },
  'picchi.webp': async ()=>{ const o=await desk(); await load(o.p, [['raman_fluorescenza_SINTETICO.txt', ramanFluo(5)]]);
    await o.p.evaluate(()=>{ S.base.raman='imodpoly'; files[0]._pk=null; refreshAll(); openTab('peaks'); const t=$('#pkAddTxt'); t.value='1086; 712 w=8 lor; 282'; t.dispatchEvent(new Event('input')); });
    await o.p.waitForTimeout(600); await shoot(o,'picchi.webp'); return o; },
  'fondo.webp': async ()=>{ const o=await desk(); await load(o.p, [['raman_fluorescenza_SINTETICO.txt', ramanFluo()]]);
    await o.p.evaluate(()=>{ openTab('proc'); const s=$('#bMeth'); s.value='als'; s.dispatchEvent(new Event('change')); $('#bShow').checked=true; $('#bShow').dispatchEvent(new Event('change')); document.querySelector('#baseBox').scrollIntoView({block:'start'}); });
    await o.p.waitForTimeout(800); await shoot(o,'fondo.webp'); return o; },
  'qualita.webp': async ()=>{ const o=await desk(); await load(o.p, [corpus('20_hplc_eu_thousands.csv')]); await panes(o.p, {bottom:330}); await o.p.evaluate(()=>{ AcchShell.showRes('qual'); }); await hideToast(o.p); await o.p.waitForTimeout(600); await shoot(o,'qualita.webp'); return o; },
  'deconvoluzione.webp': async ()=>{ const o=await desk(); await load(o.p, [['bande_sovrapposte_SINTETICO.txt', bandeSovrapposte()]]);
    await o.p.evaluate(async ()=>{ openTab('an'); $('#secFit').open=true; $('#fitMode').value='auto'; $('#fitA').value='980'; $('#fitB').value='1160'; await runFitUI(false); AcchShell.showRes('fit'); });
    await o.p.waitForTimeout(800); await shoot(o,'deconvoluzione.webp'); return o; },
  'taratura.webp': async ()=>{ const o=await desk(); await load(o.p, HPLC());
    await o.p.evaluate(()=>{ const c=mvCfg('hplc'); c.a=3.9; c.b=4.5; c.meas='area'; c.unit='mg/L'; c.model='lin'; mvSave(); const conc=[0.5,1,2,5,10,20];
      files.forEach((f,i)=>{ if (i<6) anSet(f,'conc',conc[i]); if (i===6) anSet(f,'role','blank'); if (i===7){ anSet(f,'conc',8); anSet(f,'role','qc'); } }); openTab('multi'); $('#mvInstr').value='hplc'; renderMulti(); });
    await o.p.waitForTimeout(600); await o.p.evaluate(()=>{ const t=[...document.querySelectorAll('#mvOut b, #mvOut div')].find(e=>/^Retta di taratura/.test(e.textContent)); (t||$('#mvOut')).scrollIntoView({block:'start'}); });
    await o.p.waitForTimeout(500); await shoot(o,'taratura.webp'); return o; },
  'riferimenti.webp': async ()=>{ const o=await desk(); await panes(o.p, {right:520}); await load(o.p, [['riferimento_A_SINTETICO.txt', ramanTxtOf(compA,1)], ['riferimento_B_SINTETICO.txt', ramanTxtOf(compB,2)]]);
    await o.p.evaluate(async ()=>{ openTab('refs'); $('#refAddAll').click(); await new Promise(r=>setTimeout(r,300)); });
    await o.p.evaluate(async t=>{ files.forEach(f=>f.include=false); await addEntries([{file:new File([t],'miscela_SINTETICO.txt'), path:'miscela_SINTETICO.txt'}]); document.querySelectorAll('dialog[open]').forEach(d=>d.close()); cur=files.length-1; refreshAll(); openTab('refs'); $('#mixRun').click(); await new Promise(r=>setTimeout(r,400)); $('#mixOut').scrollIntoView({block:'end'}); }, ramanTxtOf(x=>0.65*compA(x)+0.35*compB(x),3));
    await o.p.waitForTimeout(900); await shoot(o,'riferimenti.webp'); return o; },
  'pca.webp': async ()=>{ const o=await desk(); await load(o.p, gruppiPCA()); await o.p.evaluate(()=>{ openTab('multi'); $('#mvInstr').value='raman'; renderMulti(); runPCA('raman'); renderPCA('raman'); document.querySelector('#pcRun').scrollIntoView({block:'start'}); });
    await o.p.waitForTimeout(900); await shoot(o,'pca.webp'); return o; },
  'mcr.webp': async ()=>{ const o=await desk(); await load(o.p, cinetica());
    await o.p.evaluate(async ()=>{ AcchShell.showDoc('study'); const d=$('#secChemo'); d.open=true; AcchChemo.render(); });
    await clk(o.p,'#chSMake'); await o.p.waitForTimeout(300);
    await o.p.evaluate(async ()=>{ const wait=async c=>{ for (let i=0;i<800 && !c();i++) await new Promise(r=>setTimeout(r,25)); }; AcchChemo._rt.tab='mcr'; AcchChemo.render(); await wait(()=>$('#chMRun'));
      const f=AcchChemo.sel(); f.an=Object.assign(f.an||{}, {mcr:{nc:3, closure:1, init:'efa', initOn:'C'}}); AcchChemo.render(); });
    await clk(o.p,'#chMRun'); await until(o.p, ()=>{ const f=AcchChemo.sel(); return f && f._chemo && f._chemo.mcr && f._chemo.mcr.res; });
    // poi la cinetica globale A → B → C sugli stessi dati
    await o.p.evaluate(()=>{ const f=AcchChemo.sel(); AcchChemo._rt.tab='kin'; f.an.kin={model:'consec'}; AcchChemo.render(); }); await clk(o.p,'#chKRun'); await until(o.p, ()=>!!document.querySelector('#chKCsv'));
    await o.p.evaluate(()=>{ $('#secChemo').scrollIntoView({block:'start'}); }); await o.p.waitForTimeout(900); await shoot(o,'mcr.webp'); return o; },
  'xrf.webp': async ()=>{ const o=await desk(); await load(o.p, [['BRONZO_SIMULATO_Rh40kV_SINTETICO.mca', rd('examples/xrf-lega-sintetico/BRONZO_SIMULATO_Rh40kV_SINTETICO.mca')]]);
    await panes(o.p, {right:600});
    await o.p.evaluate(()=>{ openTab('an'); $('#secCult').open=true; const f=files[0], c=fpCfg(f); c.els=['Sn','Cu','Pb','Zn','As']; fpSaveCfg(f,c); refreshAll(); AcchShell.showRes('tech'); });
    await o.p.waitForSelector('#anCult .fptab'); await o.p.evaluate(()=>$('#secCult').scrollIntoView({block:'start'})); await o.p.waitForTimeout(900); await shoot(o,'xrf.webp'); return o; },
  'bet.webp': async ()=>{ const o=await desk(); await panes(o.p, {bottom:520}); await load(o.p, [['kaomi-tabella-it.txt', rd('test/fixtures/sorption/kaomi-tabella-it.txt')]]);
    await o.p.evaluate(()=>{ renderAnalysis(); AcchShell.showRes('tech'); $('#anTech [data-tab="bet"]').click(); }); await hideToast(o.p); await o.p.waitForTimeout(900); await shoot(o,'bet.webp'); return o; },
  'esporta.webp': async ()=>{ const o=await desk(); await load(o.p, FTIR()); await o.p.evaluate(()=>{ newCmp(files[0].instr, files); Object.assign(S,{outTrace:true, outProject:true, csvData:true}); saveS(); syncControls(); AcchShell.showDoc('export'); renderSummary(); }); await o.p.waitForTimeout(500);
    await o.p.evaluate(()=>{ const h=[...document.querySelectorAll('label.ohead b')].find(e=>/^Cartella Excel per Origin$/.test(e.textContent.trim())); if (h) h.closest('label').scrollIntoView({block:'start'}); }); await o.p.waitForTimeout(400); await shoot(o,'esporta.webp'); return o; },
  'confronto.webp': async ()=>{ const o=await desk(); await load(o.p, FTIR()); await o.p.evaluate(()=>{ newCmp(files[0].instr, files); go(2); setView('cmp'); }); await hideToast(o.p); await o.p.waitForTimeout(900); await shoot(o,'confronto.webp'); return o; },
  'progetto.webp': async ()=>{ const o=await desk(); await load(o.p, FTIR()); await accept(o.p);
    // salva il progetto, lo chiude e lo riapre: tornano spettri, nomi dei picchi e confronti
    await o.p.evaluate(async ()=>{ newCmp(files[0].instr, files); setView('one'); const P='/utente/Documenti/Invecchiamento PE.acchspettri', N='Invecchiamento PE.acchspettri';
      window.__mock.pick.pick_save={path:P, name:N}; await AcchProject.saveAs(); const b=await AcchProject.buildBytes(); await AcchProject.newProject(); await new Promise(r=>setTimeout(r,300));
      document.querySelectorAll('dialog[open]').forEach(d=>d.close()); await AcchProject.openBytes(b, N, P); cur=0; refreshAll(); });
    await o.p.waitForTimeout(700); await shoot(o,'progetto.webp'); return o; },
  'online-en.webp': async ()=>{ const o=await online({lang:'en'}); await load(o.p, FTIR()); await accept(o.p); await hideToast(o.p); await shoot(o,'online-en.webp'); return o; },
};

(async ()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const only=process.argv.slice(2).map(n=>/\.webp$/.test(n)?n:n+'.webp');
  server=await B.startServer();
  br=process.env.PW_CHROMIUM ? await require(path.join(ROOT,'node_modules','playwright')).chromium.launch({executablePath:process.env.PW_CHROMIUM}) : await B.launch();
  conv=await (await br.newContext()).newPage();
  let bad=0;
  try{
    for (const [name, fn] of Object.entries(SHOTS)){ if (only.length && !only.includes(name)) continue;
      try{ const o=await fn(); if (o) await o.ctx.close(); } catch(e){ bad++; console.error('✗ '+name+': '+(e.stack||e)); } }
  } finally { await br.close(); server.close(); }
  if (bad) process.exit(1);
})().catch(e=>{ console.error(e); process.exit(1); });
