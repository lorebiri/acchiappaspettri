// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Schermate reali dell'identità ibrida: app online, app desktop (con il finto Tauri dei test), sito scarica/ e pagina 404.
   Uso: node docs/brand/schermate.js   (PW_EXECUTABLE=/percorso/chromium se Playwright non trova il suo browser)
   Scrive docs/brand/schermate/*.png. Dati: file del corpus di test. */
'use strict';
const path=require('path'), fs=require('fs');
const B=require('../../test/validation/browser.js'), {tauriMock}=require('../../test/validation/tauri-mock.js');
const OUT=path.join(__dirname,'schermate'), CORPUS=path.join(B.ROOT,'test','corpus');
const FTIR=path.join(CORPUS,'c','01_ftir_tab_desc.txt');
const SOLO=process.argv[2];   // per rifare una sola schermata
async function main(){
  fs.mkdirSync(OUT,{recursive:true});
  const {chromium}=require(path.join(B.ROOT,'node_modules','playwright'));
  const br=await chromium.launch(process.env.PW_EXECUTABLE ? {executablePath:process.env.PW_EXECUTABLE} : {});
  const server=await B.startServer(), port=server.address().port;
  const shot=async (p,nome)=>{ if (SOLO && SOLO!==nome) return; await p.waitForTimeout(400); await p.screenshot({path:path.join(OUT,nome+'.png')}); console.log(nome); };
  const bad=path.join(require('os').tmpdir(),'misura.bin'); fs.writeFileSync(bad, Buffer.from([0,1,2,3,250,251,252,0,0,9,8,7]));

  // online. Gli avvisi in basso sono messaggi veri dell'app, mostrati con la sua funzione toast()
  { const {p,ctx}=await B.openPage(br, server, {}); await shot(p,'online-vuoto');
    await p.setInputFiles('#inFiles', bad); await p.waitForTimeout(1500); await shot(p,'online-errore-lettura');
    await p.setInputFiles('#inFiles', FTIR); await p.waitForTimeout(2500); await shot(p,'online-risultati');
    await p.evaluate(()=>toast('⚠️ Scrivi la posizione del picco.')); await shot(p,'online-avviso');
    await p.evaluate(()=>{ toastHide(); toast('Confronto creato con 2 spettri.'); }); await p.waitForTimeout(300); await shot(p,'online-successo');
    await p.evaluate(()=>{ document.querySelector('#soberBtn').click(); }); await p.waitForTimeout(300); await p.evaluate(()=>toast('⚠️ Scrivi la posizione del picco.')); await shot(p,'online-sobrio');
    await ctx.close(); }
  // desktop
  { const {p,ctx}=await B.openPage(br, server, {desk:true, init:[tauriMock]}); await shot(p,'desktop-vuoto');
    await p.setInputFiles('#inFiles', bad).catch(()=>{}); await p.waitForTimeout(1500); await shot(p,'desktop-errore');
    await p.setInputFiles('#inFiles', FTIR).catch(()=>{}); await p.waitForTimeout(2500); await shot(p,'desktop-risultati');
    await p.evaluate(()=>toast('⚠️ Scrivi la posizione del picco.')); await shot(p,'desktop-avviso');
    await ctx.close(); }
  // sito e 404
  { const ctx=await br.newContext({viewport:{width:1400,height:900}, locale:'it-IT'}), p=await ctx.newPage();
    await p.goto(`http://127.0.0.1:${port}/scarica/index.html`); await shot(p,'scarica');
    await p.goto(`http://127.0.0.1:${port}/scarica/en/index.html`); await shot(p,'scarica-en');
    await p.goto(`http://127.0.0.1:${port}/404.html`); await shot(p,'pagina-404');
    await ctx.close(); }
  await br.close(); server.close();
}
main().catch(e=>{ console.error(e); process.exit(1); });
