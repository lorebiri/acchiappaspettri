// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Progetti Origin nell'interfaccia, online e desktop: finestra «Contenuto del progetto Origin», importazione esatta,
// voce di esportazione. Dati SINTETICI (test/fixtures/origin). Uso: PW_CHANNEL=chrome node --test test/validation/origin-ui.test.js
// Prova del prima: su d091313 i .opju vengono saltati come formato non riconosciuto e il test fallisce.
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path');
const B=require('./browser.js'), G=require(path.join(B.ROOT,'scripts','gen-origin-fixtures.js'));
const FIX=path.join(B.ROOT,'test','fixtures','origin');
let server, browser;
test.before(async ()=>{ server=await B.startServer(); browser=await B.launch(); });
test.after(async ()=>{ await browser.close(); server.close(); });

for (const desk of [false, true]){ const W=desk?'desktop':'online';
  for (const f of ['sintetico-each.opju','sintetico-one.opj']){
    test(`${W}: ${f}: la finestra elenca gli spettri e l'importazione li porta identici`, async ()=>{
      const {ctx,p,errors}=await B.openPage(browser, server, {desk});
      const bytes=[...fs.readFileSync(path.join(FIX,f))];
      await p.evaluate(async ([bytes,name])=>{ addEntries([{file:new File([new Uint8Array(bytes)],name), path:name}]); }, [bytes,f]);
      await p.waitForSelector('#dlgOrigin[open]');
      const d=await p.evaluate(()=>({title:document.querySelector('#orTitle').textContent, rows:[...document.querySelectorAll('#dlgOrigin input[data-sp]')].map(b=>b.checked), text:document.querySelector('#dlgOrigin').innerText}));
      assert.strictEqual(d.title, 'Contenuto del progetto Origin');
      assert.deepStrictEqual(d.rows, [true,true,true]);
      assert.match(d.text, /FTIR sintetico/); assert.match(d.text, /cm⁻¹/);
      if (desk) assert.doesNotMatch(d.text, /[\u{1F300}-\u{1FAFF}☀-➿]|!/u, 'testi del desktop senza emoji né esclamazioni');
      await p.click('#orOk');
      await p.waitForFunction(()=>files.length===3);
      const got=await p.evaluate(()=>files.map(f=>({name:f.name, xs:Array.from(f.xs), ys:Array.from(f.ys), cols:f.colNames})));
      const S=G.specs();
      got.forEach((g,i)=>{ const m=new Map(S[i].xs.map((x,k)=>[x,S[i].ys[k]]));
        assert.strictEqual(g.xs.length, S[i].xs.length, g.name);
        assert.ok(g.xs.every((x,k)=>Object.is(m.get(x),g.ys[k]) || m.get(x)===g.ys[k]), 'valori diversi in '+g.name); });
      assert.match(got[0].name, /^FTIR sintetico/);
      assert.deepStrictEqual(errors, []); await ctx.close(); });
  }
  test(`${W}: un .opju danneggiato si rifiuta con un messaggio, senza spettri`, async ()=>{
    const {ctx,p,errors}=await B.openPage(browser, server, {desk});
    const u=[...fs.readFileSync(path.join(FIX,'sintetico-each.opju'))].slice(0,300);
    const r=await p.evaluate(async (u)=>{ const T=[]; const ot=window.toast; window.toast=t=>{ T.push(String(t)); return ot(t); };
      await addEntries([{file:new File([new Uint8Array(u)],'rotto.opju'), path:'rotto.opju'}]); await new Promise(r=>setTimeout(r,300));
      return {n:files.length, toasts:T, open:!!document.querySelector('#dlgOrigin[open]')}; }, u);
    assert.strictEqual(r.n, 0); assert.strictEqual(r.open, false);
    assert.ok(r.toasts.some(t=>/Progetto Origin non letto \(«rotto\.opju»\)/.test(t)), r.toasts.join(' | '));
    assert.deepStrictEqual(errors, []); await ctx.close(); });
  test(`${W}: voci .opj e .opju della finestra Esporta: progetto riletto identico, avviso finché non è verificato`, async ()=>{
    const {ctx,p,errors}=await B.openPage(browser, server, {desk});
    const txt='Wavenumber (cm-1)\tA\r\n'+Array.from({length:400},(_,i)=>(4000-i*2)+'\t'+(Math.sin(i/9)/7)).join('\r\n');
    const r=await p.evaluate(async (txt)=>{ await addEntries([{file:new File([txt],'s.txt'), path:'s.txt'}]); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
      const card=k=>document.querySelector(`.outcard[data-out="${k}"]`), warn=k=>{ const w=card(k)&&card(k).querySelector('.opjWarn'); return !!w && !w.hidden; };
      const out={cards:!!card('outOpj') && !!card('outOpju'), warn:warn('outOpj') && warn('outOpju'), oldButton:!!document.getElementById('opjGo')};
      Object.assign(S,{outPdf:false,outPng:false,outSvg:false,csvPeaks:false,csvData:false,csvRaw:false,outOrig:false,outAnalysis:false,outTrace:false,outOrigin:false,outProject:false,zipAll:false,outOpj:true,outOpju:true,opjMode:'one'});
      const ents=await exportEntries(expSel(), true); out.names=ents.map(e=>e.path);
      const sp=AcchOriginUI.exportSpecs();
      for (const e of ents){ const m=AcchOrigin.read(e.data instanceof Uint8Array?e.data:new Uint8Array(await e.data.arrayBuffer())), v=AcchOrigin.pairValues(AcchOrigin.spectra(m)[0]);
        out[e.path]=v.xs.length===sp[0].xs.length && Array.from(v.xs).every((x,k)=>x===sp[0].xs[k]) && Array.from(v.ys).every((y,k)=>y===sp[0].ys[k]); }
      return out; }, txt);
    assert.ok(r.cards, 'voci .opj e .opju nella finestra Esporta'); assert.ok(r.warn, 'avviso «Non ancora verificato in Origin»'); assert.ok(!r.oldButton, 'niente pulsante a parte');
    assert.deepStrictEqual(r.names.sort(), ['per_Origin.opj','per_Origin.opju']);
    assert.ok(r['per_Origin.opj'] && r['per_Origin.opju'], JSON.stringify(r));
    assert.deepStrictEqual(errors, []); await ctx.close(); });
  test(`${W}: progetto .acchspettri: il file Origin si salva una volta e gli spettri tornano con origin`, async ()=>{
    const {ctx,p,errors}=await B.openPage(browser, server, {desk});
    const bytes=[...fs.readFileSync(path.join(FIX,'sintetico-each.opju'))];
    const r=await p.evaluate(async ([bytes])=>{
      addEntries([{file:new File([new Uint8Array(bytes)],'prova.opju'), path:'dati/prova.opju'}]);
      for (let i=0;i<100 && !document.querySelector('#dlgOrigin[open]');i++) await new Promise(r=>setTimeout(r,50));
      document.querySelector('#orOk').click(); for (let i=0;i<100 && files.length<3;i++) await new Promise(r=>setTimeout(r,50));
      const before=files.map(f=>({xs:Array.from(f.xs), ys:Array.from(f.ys), origin:f.origin}));
      const b=await AcchProject.buildBytes(); const P=await AcchFormat.decode(b, JSZip);
      return {bytes:Array.from(b), sources:P.sources.length, origins:P.spectra.map(s=>s.origin), before}; }, [bytes]);
    const q=await B.openPage(browser, server, {desk});   // riapertura in una pagina nuova, come un altro avvio dell'app
    const after=await q.p.evaluate(async (b)=>{ const ok=await AcchProject.openBytes(new Uint8Array(b),'prova.acchspettri',null); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
      return {ok, files:files.map(f=>({xs:Array.from(f.xs), ys:Array.from(f.ys), origin:f.origin}))}; }, r.bytes);
    r.ok=after.ok; r.after=after.files; assert.deepStrictEqual(q.errors, []); await q.ctx.close();
    assert.ok(r.ok); assert.strictEqual(r.sources, 1, 'byte originali una volta sola');
    assert.deepStrictEqual(r.origins, [{book:'FTIRsintet',sheet:1,col:'B'},{book:'Ramansinte',sheet:1,col:'B'},{book:'Valoriestr',sheet:1,col:'B'}]);
    assert.deepStrictEqual(r.after, r.before);
    assert.deepStrictEqual(errors, []); await ctx.close(); });
  test(`${W}: 40 spettri dallo stesso file Origin: un solo buffer in memoria e una sola copia identica esportata`, async ()=>{
    const {ctx,p,errors}=await B.openPage(browser, server, {desk});
    const r=await p.evaluate(async ()=>{
      const xs=Array.from({length:300},(_,i)=>4000-i*10), specs=Array.from({length:40},(_,k)=>({xs, ys:xs.map(x=>Math.sin(x/(50+k))), name:'S'+(k+1)}));
      const orig=AcchOrigin.writeOpju(specs,{mode:'one'});
      addEntries([{file:new File([orig],'quaranta.opju'), path:'quaranta.opju'}]);
      for (let i=0;i<100 && !document.querySelector('#dlgOrigin[open]');i++) await new Promise(r=>setTimeout(r,50));
      document.querySelector('#orOk').click(); for (let i=0;i<300 && files.length<40;i++) await new Promise(r=>setTimeout(r,50));
      Object.assign(S,{outPdf:false,outPng:false,outSvg:false,csvPeaks:false,csvData:false,csvRaw:false,outOrig:true,outAnalysis:false,outTrace:false,outOrigin:false,outOpj:false,outOpju:false,outProject:false,zipAll:false,expScope:'all'});
      EXP_SCOPE='all'; let ents; try{ ents=await exportEntries(expSel(), true); } finally { EXP_SCOPE=null; }
      const e=ents[0], b=e && (e.data instanceof Uint8Array ? e.data : new Uint8Array(await new Response(e.data).arrayBuffer()));
      return {n:files.length, buffers:new Set(files.map(f=>f.raw)).size, copies:ents.length, name:e&&e.path, same:!!b && b.length===orig.length && b.every((x,i)=>x===orig[i])}; });
    assert.strictEqual(r.n, 40); assert.strictEqual(r.buffers, 1, 'un solo buffer');
    assert.strictEqual(r.copies, 1, 'una sola copia identica'); assert.match(r.name, /quaranta\.opju$/); assert.ok(r.same, 'copia identica ai byte del file');
    assert.deepStrictEqual(errors, []); await ctx.close(); });
}
