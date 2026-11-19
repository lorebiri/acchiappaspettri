// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Schermate per la revisione grafica della versione online (docs/revisione-online/).
// Uso: node docs/revisione-online/schermate.js <prima|dopo>   (ACCH_ROOT=/percorso/di/una/copia/di/main per le schermate «prima»)
// Online: prima visita vera (nessuna preferenza salvata), poi con gli spettri FTIR di esempio caricati; browser 1440×900 e telefono 390×844.
// Desktop: anteprima dell'app con il finto Tauri dei test; le PNG di «prima» e «dopo» devono coincidere byte per byte.
// Solo dati SINTETICI già nel repository (examples/).
'use strict';
const fs=require('fs'), path=require('path');
const ROOT=process.env.ACCH_ROOT ? path.resolve(process.env.ACCH_ROOT) : path.join(__dirname,'..','..'), B=require(path.join(ROOT,'test/validation/browser.js')), TM=require(path.join(ROOT,'test/validation/tauri-mock.js'));
const fase=process.argv[2]; if (!/^(prima|dopo)$/.test(fase||'')) { console.error('uso: schermate.js prima|dopo'); process.exit(2); }
const OUT=path.join(__dirname,fase); fs.mkdirSync(OUT,{recursive:true});
const FTIR=fs.readdirSync(path.join(ROOT,'examples/ftir-polietilene-sintetico')).filter(n=>/\.csv$/.test(n)).sort().map(n=>[n, fs.readFileSync(path.join(ROOT,'examples/ftir-polietilene-sintetico',n),'utf8')]);
const PHONE={width:390,height:844}, TABLET={width:820,height:1180}, PC={width:1440,height:900};
async function carica(p){ await p.evaluate(async list=>{ await addEntries(list.map(([n,t])=>({file:new File([t],n),path:n}))); document.querySelectorAll('dialog[open]').forEach(d=>d.close()); }, FTIR); await p.waitForTimeout(1200); }
async function scatta(p,nome,full){ await p.evaluate(()=>{ const t=document.querySelector('#toast'); if (t) t.classList.remove('on'); }); await p.waitForTimeout(400); await p.screenshot({path:path.join(OUT,nome+'.png'), fullPage:!!full}); console.log(fase+'/'+nome+'.png'); }
// prima visita vera: niente benvenuto saltato, lingua italiana, nessun tema scelto
async function online(br, server, vp, mobile){
  const ctx=await br.newContext({locale:'it-IT', viewport:vp, deviceScaleFactor:1, isMobile:!!mobile, hasTouch:!!mobile, colorScheme:'light'});
  await ctx.route('**/*', r=>r.request().url().startsWith('http://127.0.0.1')||/^(data|blob):/.test(r.request().url()) ? r.continue() : r.abort());
  const p=await ctx.newPage(); const errors=[]; p.on('pageerror',e=>errors.push(String(e)));
  await p.goto(`http://127.0.0.1:${server.address().port}/index.html`); await p.waitForFunction(()=>window.AcchProject && window.AcchUi); await p.waitForTimeout(900);
  return {ctx,p,errors};
}
(async()=>{
  const server=await B.startServer(), br=await B.launch();
  try{
    for (const [tag,vp,mob] of [['browser',PC,false],['tablet',TABLET,true],['telefono',PHONE,true]]){
      const o=await online(br,server,vp,mob);
      await scatta(o.p,`online-${tag}-1-prima-visita`, mob);
      await o.p.evaluate(()=>{ document.querySelectorAll('dialog[open]').forEach(d=>d.close()); try{ endTour(); }catch(e){} });
      await scatta(o.p,`online-${tag}-2-pagina-vuota`, mob);
      await carica(o.p); await scatta(o.p,`online-${tag}-3-spettri-caricati`, mob);
      await o.p.evaluate(()=>{ try{ cur=0; openTab('an'); }catch(e){} }); await o.p.waitForTimeout(600); await scatta(o.p,`online-${tag}-4-analisi`, mob);
      if (o.errors.length) throw new Error('errori nella pagina: '+o.errors.join(' | '));
      await o.ctx.close();
    }
    const d=await TM.openDesk(B, br, server, {}); await d.p.setViewportSize(PC); await d.p.waitForFunction(()=>window.__mock && window.__mock.menu); await d.p.waitForTimeout(600);
    await scatta(d.p,'desktop-1-avvio'); await carica(d.p); await scatta(d.p,'desktop-2-spettri-caricati'); await d.p.evaluate(()=>{ try{ cur=0; openTab('an'); }catch(e){} }); await d.p.waitForTimeout(600); await scatta(d.p,'desktop-3-analisi');
    await d.ctx.close();
  } finally { await br.close(); server.close(); }
})().catch(e=>{ console.error(e); process.exit(1); });
