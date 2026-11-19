// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Immagini del tutorial 1, passo 5 («Esporta»), rigenerate in modo riproducibile con Playwright:
//   docs/tutorial/img/t1-{it,en}-4-scarica.png          pagina online (con Gino), voci già spuntate
//   docs/tutorial/img/t1-{it,en}-4-esporta-desktop.png  anteprima dell'app desktop (finto Tauri dei test), dopo l'esportazione in una cartella
// Stato del tutorial: i sei spettri SINTETICI di examples/ftir-polietilene-sintetico/, indice di carbonile SAUB con le ore 0…1000.
// Uso: PW_CHANNEL=chrome node scripts/tutorial-esporta.js   (1366×768, come le altre immagini dei tutorial)
'use strict';
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..'), B=require(path.join(ROOT,'test/validation/browser.js')), {openDesk}=require(path.join(ROOT,'test/validation/tauri-mock.js'));
const DIR=path.join(ROOT,'examples','ftir-polietilene-sintetico'), OUT=path.join(ROOT,'docs','tutorial','img');
const HOURS=[0,100,250,500,750,1000];
const files=fs.readdirSync(DIR).filter(n=>/\.csv$/.test(n)).sort().map(n=>[n, fs.readFileSync(path.join(DIR,n),'utf8')]);

// nella pagina: carica, imposta l'indice come «Quanto è degradato?», scrive le ore, apre Esporta con le voci predefinite
async function tutorialState(p, lang){
  await p.evaluate(async ([L, H, lang])=>{
    await addEntries(L.map(([n,t])=>({file:new File([t],n), path:n}))); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
    const c=mvCfg('ftir'), pr=BAND_PRESETS.ftir[0]; c.a=pr[1]; c.b=pr[2]; c.c=pr[3]; c.d=pr[4]; c.meas=pr[5]; c.preset=0; c.model='trend'; c.unit='h'; mvSave();
    files.forEach((f,i)=>anSet(f,'conc',H[i]));
    S=merge(DEFAULTS,{lang}); S.docTitle=''; saveS(); syncControls(); cur=0; go(3); renderSummary();
    window.scrollTo(0,0);   // online: in alto Gino, il titolo «Cosa vuoi scaricare?» e le prime voci
    await new Promise(r=>setTimeout(r,400)); }, [files, HOURS, lang]);
}
(async ()=>{
  const server=await B.startServer(), br=await B.launch(), made=[];
  try{
    for (const lang of ['it','en']){
      // online, con Gino: la pagina «Scarica» con le voci e i nomi proposti
      { const o=await B.openPage(br, server, {lang}); await o.p.setViewportSize({width:1366, height:768}); await tutorialState(o.p, lang);
        const f=path.join(OUT,`t1-${lang}-4-scarica.png`); await o.p.screenshot({path:f}); made.push(f);
        if (o.errors.length) throw new Error('errori nella pagina: '+o.errors[0]); await o.ctx.close(); }
      // desktop: «Esporta nella cartella…» già premuto, riepilogo con «Mostra nella cartella»
      { const o=await openDesk(B, br, server, {lang}); await o.p.setViewportSize({width:1366, height:768}); await o.p.waitForFunction(()=>window.__mock && window.__mock.menu); await tutorialState(o.p, lang);
        await o.p.evaluate(async lang=>{ window.__mock.pick.pick_export_dir={path:lang==='en'?'C:\\Users\\lab\\Documents\\PE ageing':'C:\\Users\\lab\\Documenti\\Invecchiamento PE', name:lang==='en'?'PE ageing':'Invecchiamento PE'};
          await runExport(); await new Promise(r=>setTimeout(r,400)); const d=document.querySelector('#expDone'); if (d) d.scrollIntoView({block:'end'}); }, lang);
        const f=path.join(OUT,`t1-${lang}-4-esporta-desktop.png`); await o.p.screenshot({path:f}); made.push(f);
        if (o.errors.length) throw new Error('errori nella pagina: '+o.errors[0]); await o.ctx.close(); }
    }
  } finally { await br.close(); server.close(); }
  console.log(made.map(f=>path.relative(ROOT,f)).join('\n'));
})().catch(e=>{ console.error(e); process.exit(1); });
