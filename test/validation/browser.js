// Browser vero per R5 (assess) e R6 (esportazioni): server locale sul worktree (o su ACCH_INDEX) e Chrome/Chromium di Playwright.
// PW_CHANNEL=chrome usa Chrome installato in un'istanza propria (profilo temporaneo), non il Chrome personale.
'use strict';
const http=require('http'), fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..','..');
const INDEX=process.env.ACCH_INDEX ? path.resolve(process.env.ACCH_INDEX) : path.join(ROOT,'index.html');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.json':'application/json','.svg':'image/svg+xml'};
function startServer(){
  const server=http.createServer((q,r)=>{ const u=decodeURIComponent(q.url.split('?')[0]);
    const p=(u==='/'||u==='/index.html') ? INDEX : path.join(ROOT,u);
    if ((p!==INDEX && !p.startsWith(ROOT)) || !fs.existsSync(p) || fs.statSync(p).isDirectory()){ r.writeHead(404); r.end(); return; }
    r.writeHead(200,{'content-type':MIME[path.extname(p)]||'application/octet-stream'}); fs.createReadStream(p).pipe(r); });
  return new Promise(res=>server.listen(0,'127.0.0.1',()=>res(server)));
}
async function launch(){
  const {chromium}=require(path.join(ROOT,'node_modules','playwright'));
  return chromium.launch(process.env.PW_CHANNEL ? {channel:process.env.PW_CHANNEL} : {});
}
// pagina pronta: benvenuto, giro guidato e novità disattivati; desk=true → anteprima dell'app desktop
async function openPage(browser, server, opt){
  opt=opt||{};
  const ctx=await browser.newContext({locale:opt.lang==='en'?'en-GB':'it-IT', viewport:{width:1400,height:900}, acceptDownloads:true});
  for (const f of [].concat(opt.init||[])) await ctx.addInitScript(f);   // per esempio il finto Tauri di tauri-mock.js
  await ctx.addInitScript(({lang,desk,canali})=>{ try{ localStorage.setItem('acch.welcomeDone','true'); localStorage.setItem('acch.seenVersion',JSON.stringify('99')); localStorage.setItem('acch.tourDone','true'); localStorage.setItem('acch.ui.entryDone','1'); if (lang) localStorage.setItem('acch.ui.lang', JSON.stringify(lang)); }catch(e){} if (desk) window.ACCH_SHELL_PREVIEW=true; window.ACCH_CANALI=canali; }, {lang:opt.lang||null, desk:!!opt.desk, canali:opt.canali||'tutti'});   // canali: 'tutti' carica ogni canale senza finestra (I3), 'chiedi' mostra «Canali trovati»
  const external=[]; await ctx.route('**/*', route=>{ const u=route.request().url(); if (opt.html && /\/index\.html$/.test(u.split('?')[0])) return route.fulfill({body:opt.html, contentType:'text/html; charset=utf-8'}); if (u.startsWith('http://127.0.0.1')||u.startsWith('data:')||u.startsWith('blob:')) return route.continue(); external.push(u); return route.abort(); });
  const p=await ctx.newPage(); const errors=[]; p.on('pageerror',e=>errors.push(String(e.stack||e))); p.on('dialog',d=>d.accept().catch(()=>{}));
  await p.goto(`http://127.0.0.1:${server.address().port}/index.html`); await p.waitForFunction(()=>window.AcchProject && window.AcchUi);
  await p.evaluate(()=>{ try{ endTour(); }catch(e){} document.querySelectorAll('dialog[open]').forEach(d=>d.close()); });
  return {ctx, p, errors, external};
}
module.exports={startServer, launch, openPage, ROOT, INDEX};
