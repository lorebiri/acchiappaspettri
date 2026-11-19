// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I6, finestre aggiuntive del desktop (dati SINTETICI). Il finto Tauri collega la pagina principale e vista.html (stesso contesto del
// browser) al posto degli eventi tra finestre: view_open, view_put, view_take ed emitTo come in src-tauri/src/viste.rs.
// - «Confronto» in sola lettura: si apre, mostra il confronto, segue le modifiche della principale; il suo zoom non tocca la principale;
//   non scrive l'archivio; si usa da tastiera e con un lettore di schermo (descrizione del grafico, annuncio della zona vista).
// - «Stacca il grafico»: lo zoom è lo stesso nelle due finestre.
// - Il disegno mandato alla finestra conserva il minimo e il massimo di ogni pixel (nessun picco stretto perso) ed è piccolo.
// - Menu nativo: la voce «Finestra» e tutte le scorciatoie della scheda «Scorciatoie da tastiera».
// - Online: niente finestre aggiuntive.
'use strict';
const test=require('node:test'), assert=require('node:assert');
const B=require('./browser.js'), {openDesk}=require('./tauri-mock.js'), {I6_SETUP}=require('./grafico-dati.js');
const {coreModules}=require('../../scripts/core-extract.js'), fs=require('fs'), path=require('path');

let server, br;
test.before(async()=>{ server=await B.startServer(); br=await B.launch(); });
test.after(async()=>{ await br.close(); server.close(); });
const base=()=>`http://127.0.0.1:${server.address().port}`;
async function vista(o, k){ const v=await o.ctx.newPage(); const errors=[]; v.on('pageerror',e=>errors.push(String(e))); await v.goto(base()+'/vista.html?k='+k);
  await v.waitForFunction(()=>window.AcchVistaDecode && document.getElementById('vcv')); return {v, errors}; }
const drawn=(v, re)=>v.waitForFunction(r=>getComputedStyle(document.getElementById('msg')).display==='none' && new RegExp(r).test(document.getElementById('vcv').getAttribute('aria-label')), re.source, {timeout:30000});

test('vista.html carica tutti i moduli del nucleo, nell\'ordine della pagina', ()=>{
  const h=fs.readFileSync(path.join(__dirname,'..','..','app','vista.html'),'utf8'), mods=coreModules(fs.readFileSync(path.join(__dirname,'..','..','index.html')));
  const got=[...h.matchAll(/<script src="(app\/[\w-]+-core\.js)"><\/script>/g)].map(m=>m[1]); assert.deepEqual(got, mods);
  assert.ok(h.indexOf('core.js"')<h.indexOf('plot.js"'), 'il nucleo prima del disegno');
});

test('«Confronto» in sola lettura: si apre, segue la principale, zoom proprio, nessuna scrittura, tastiera e lettore di schermo', async()=>{
  const o=await openDesk(B, br, server); await o.p.evaluate(I6_SETUP);
  await o.p.evaluate(async()=>{ const L=await I6.load(3, 200000); I6.compare(L); await I6.frames(); __mock.storeWrites.length=0; });
  const lab=await o.p.evaluate(()=>AcchViste.open('confronto'));
  assert.equal(lab, 'vista-confronto');
  const {v, errors}=await vista(o, 'confronto');
  await o.p.evaluate(()=>AcchViste.schedule());
  await drawn(v, /3 spettri/);
  let s=await v.evaluate(()=>({tit:document.title, h:document.getElementById('vtit').textContent, ro:!document.getElementById('vro').hidden, role:document.getElementById('vcv').getAttribute('role'),
    lab:document.getElementById('vcv').getAttribute('aria-label'), btn:[...document.querySelectorAll('header button')].map(b=>b.textContent), gl:!!document.getElementById('pvgl'), host:typeof window.AcchHost, writes:__mock.storeWrites.length}));
  assert.match(s.tit, /Confronto/); assert.ok(s.ro, 'sola lettura indicata'); assert.equal(s.role, 'img'); assert.match(s.lab, /vista intera/);
  assert.deepEqual(s.btn, ['Ingrandisci','Riduci','Mostra tutto']); assert.equal(s.host, 'undefined', 'la vista non ha l\'archivio'); assert.equal(s.writes, 0);
  // la principale cambia il nome del confronto: la vista lo segue
  await o.p.evaluate(()=>{ const c=curCmp(); c.name='Prova di allineamento'; saveCmps(); renderPreview(); });
  await v.waitForFunction(()=>/Prova di allineamento/.test(document.getElementById('vtit').textContent), null, {timeout:30000});
  // zoom da tastiera nella vista: la vista annuncia la zona, la principale non cambia
  await v.focus('#vcv'); await v.keyboard.press('+');
  await v.waitForFunction(()=>/Zona vista/.test(document.getElementById('stato').textContent), null, {timeout:30000});
  assert.equal(await o.p.evaluate(()=>curCmp()._zoom), null, 'lo zoom della vista non tocca la principale');
  await v.keyboard.press('0'); await v.waitForFunction(()=>/Tutto lo spettro/.test(document.getElementById('stato').textContent), null, {timeout:30000});
  assert.equal(await o.p.evaluate(()=>__mock.storeWrites.filter(w=>Object.keys(w).some(k=>k!=='acch.viste')).length), 0, 'la principale scrive solo le dimensioni delle finestre');
  assert.deepEqual(errors, []); assert.deepEqual(o.errors, []); await o.ctx.close();
});

test('«Stacca il grafico»: stesso grafico e stesso zoom nelle due finestre; l\'inglese segue la principale', async()=>{
  const o=await openDesk(B, br, server, {lang:'en'}); await o.p.evaluate(I6_SETUP);
  await o.p.evaluate(async()=>{ await I6.load(1, 300000); await I6.frames(); });
  await o.p.evaluate(()=>AcchViste.open('grafico'));
  const {v, errors}=await vista(o, 'grafico'); await o.p.evaluate(()=>AcchViste.schedule());
  await drawn(v, /Graph: /);
  assert.equal(await v.evaluate(()=>document.getElementById('vzin').textContent), 'Zoom in');
  await v.click('#vzin');
  await o.p.waitForFunction(()=>!!files[cur]._zoom, null, {timeout:30000});
  await v.waitForFunction(()=>/Visible range/.test(document.getElementById('stato').textContent), null, {timeout:30000});
  await o.p.evaluate(()=>{ files[cur]._zoom=null; renderPreview(); });
  await v.waitForFunction(()=>/Whole spectrum/.test(document.getElementById('stato').textContent), null, {timeout:30000});
  assert.deepEqual(errors, []); assert.deepEqual(o.errors, []); await o.ctx.close();
});

test('il disegno mandato alla finestra conserva minimo e massimo di ogni pixel, con al più 8 punti per pixel', async()=>{
  const o=await openDesk(B, br, server); await o.p.evaluate(I6_SETUP);
  const r=await o.p.evaluate(async()=>{ await I6.load(1, 1e6); await I6.frames(); await AcchViste.open('grafico'); const st=AcchViste._views.get('vista-grafico'); st.w=800; st.h=500; st.dpr=1;
    const b=AcchViste.payload('vista-grafico'), ab=b.buffer.slice(b.byteOffset, b.byteOffset+b.byteLength), dv=new DataView(ab), jl=dv.getUint32(4,true), meta=JSON.parse(new TextDecoder().decode(new Uint8Array(ab,8,jl)));
    let off=8+jl; off+=(8-off%8)%8; const n=meta.d.series[0].n, X=new Float64Array(ab,off,n), Y=new Float64Array(ab,off+8*n,n), f=files[cur], P=processed(f);
    // per ogni pixel di 800 (in X): estremi dei dati veri e di quelli mandati
    const x0=P.xs[0], x1=P.xs[P.xs.length-1], px=x=>Math.min(799, Math.floor((x-x0)/(x1-x0)*800)), A=new Map(), C=new Map();
    const put=(M,x,y)=>{ const k=px(x), e=M.get(k)||[Infinity,-Infinity]; e[0]=Math.min(e[0],y); e[1]=Math.max(e[1],y); M.set(k,e); };
    for (let i=0;i<P.xs.length;i++) put(A, P.xs[i], P.ys[i]); for (let i=0;i<n;i++) put(C, X[i], Y[i]);
    let bad=0; for (const [k,e] of A){ const g=C.get(k); if (!g || g[0]!==e[0] || g[1]!==e[1]) bad++; }
    let sorted=true; for (let i=1;i<n;i++) if (X[i]<X[i-1]) sorted=false;
    return {n, bytes:b.length, bad, sorted, pix:A.size}; });
  assert.equal(r.bad, 0, 'pixel con estremi diversi: '+r.bad+' su '+r.pix);
  assert.ok(r.n<=8*800, 'punti mandati: '+r.n); assert.ok(r.sorted, 'X crescenti'); assert.ok(r.bytes<200000, 'byte: '+r.bytes);
  await o.ctx.close();
});

test('menu nativo: voce «Finestra» e tutte le scorciatoie della scheda «Scorciatoie da tastiera»', async()=>{
  const o=await openDesk(B, br, server);
  const r=await o.p.evaluate(async()=>{ for (let i=0;i<100 && !__mock.menu;i++) await new Promise(r=>setTimeout(r,20));
    const flat=[]; const walk=(L,p)=>L.forEach(x=>{ if (x.kind==='sub') walk(x.items, x.text); else flat.push({m:p, t:x.text||'', a:x.accelerator||''}); }); walk(__mock.menu, '');
    return flat; });
  const has=(t,a)=>r.some(x=>x.t.startsWith(t) && (a instanceof RegExp ? a.test(x.t+' '+x.a) : x.a===a));
  assert.ok(has('Stacca il grafico','CmdOrCtrl+Shift+G') && has('Apri il confronto in una finestra','CmdOrCtrl+Shift+M'), 'voce Finestra');
  for (const [t,a] of [['Ingrandisci il grafico','CmdOrCtrl+='],['Riduci il grafico','CmdOrCtrl+-'],['Mostra tutto','CmdOrCtrl+0'],['Barra dei comandi','CmdOrCtrl+K'],['Salva progetto','CmdOrCtrl+S'],['Apri progetto…','CmdOrCtrl+O']]) assert.ok(has(t,a), t);
  // tasti singoli della pagina (scheda «Scorciatoie»): indicati accanto alla voce (il mock dice Windows: colonna con la tabulazione)
  for (const [t,k] of [['Ingrandisci una zona','R'],['Grafico grande','F'],['Confronto / uno alla volta','C'],['Spettro precedente','←'],['Spettro successivo','→'],['Picchi','1'],['Elaborazione','2'],['Dati dello spettro','3'],['Riferimenti','4'],['Deconvoluzione e parametri','5'],['Accetta i nomi suggeriti','A'],['Deconvolvi la zona visibile','D'],['Togli il picco selezionato','Canc'],['Scorciatoie da tastiera','?']])
    assert.ok(r.some(x=>x.t.startsWith(t) && x.t.endsWith('\t'+k) && !x.a), t+' ('+k+'): '+JSON.stringify(r.filter(x=>x.t.startsWith(t))));
  assert.deepEqual(o.errors, []); await o.ctx.close();
});

test('impostazioni su file: si salvano in un JSON scelto dall\'utente e si ricaricano (solo chiavi note, con conferma); un file estraneo è rifiutato', async()=>{
  const o=await openDesk(B, br, server);
  const r=await o.p.evaluate(async()=>{ window.ACCH_TEST=true; __mock.keepBytes=true; AcchUi.openSettings(); await new Promise(r=>setTimeout(r,50));
    const wait=async re=>{ for (let i=0;i<100 && !re.test($('#stSetMsg').textContent);i++) await new Promise(r=>setTimeout(r,20)); return $('#stSetMsg').textContent; };
    S.lineW=0.4; saveS();
    __mock.pick.pick_save={path:'/d/imp.json', name:'imp.json'}; $('#stSetSave').click(); const m1=await wait(/salvate/);
    const w=__mock.writes.find(x=>x.path==='/d/imp.json'), saved=JSON.parse(new TextDecoder().decode(new Uint8Array(w.bytes)));
    S.lineW=0.25; saveS();
    const f=Object.assign({}, saved, {settings:Object.assign({}, saved.settings, {lineW:0.4, grid:false, inventata:'x', sens:'molti'})});
    __mock.files['/d/imp.json']=JSON.stringify(f); __mock.pick.pick_open={path:'/d/imp.json', name:'imp.json'}; $('#stSetLoad').click(); const m2=await wait(/caricate/);
    const after={lineW:S.lineW, grid:S.grid, inventata:S.inventata, sens:typeof S.sens, stored:JSON.parse(AcchHost.store.getItem('spectraplot.settings.v1')).lineW};
    __mock.files['/d/altro.json']='{"x":1}'; __mock.pick.pick_open={path:'/d/altro.json', name:'altro.json'}; $('#stSetLoad').click(); const m3=await wait(/non contiene/);
    return {m1, m2, m3, fmt:saved.format, after}; });
  assert.match(r.m1, /Impostazioni salvate in imp\.json/); assert.equal(r.fmt, 'acchiappaspettri-impostazioni');
  assert.match(r.m2, /Impostazioni caricate da imp\.json/);
  assert.deepEqual(r.after, {lineW:0.4, grid:false, inventata:undefined, sens:'number', stored:0.4});
  assert.match(r.m3, /non contiene impostazioni/);
  assert.deepEqual(o.errors, []); await o.ctx.close();
});

test('online: niente finestre aggiuntive', async()=>{
  const o=await B.openPage(br, server);
  assert.equal(await o.p.evaluate(()=>typeof window.AcchViste), 'undefined');
  assert.deepEqual(o.errors, []); await o.ctx.close();
});
