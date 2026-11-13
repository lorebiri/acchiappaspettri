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
  test(`${W}: voce di esportazione: il progetto scritto si rilegge identico ed è dichiarato non verificato`, async ()=>{
    const {ctx,p,errors}=await B.openPage(browser, server, {desk});
    const txt='Wavenumber (cm-1)\tA\r\n'+Array.from({length:400},(_,i)=>(4000-i*2)+'\t'+(Math.sin(i/9)/7)).join('\r\n');
    const r=await p.evaluate(async (txt)=>{ await addEntries([{file:new File([txt],'s.txt'), path:'s.txt'}]); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
      const card=document.getElementById('opjCard'); const sp=AcchOriginUI.exportSpecs(); const out={card:!!card, text:card?card.innerText:''};
      for (const w of ['writeOpj','writeOpju']){ const m=AcchOrigin.read(AcchOrigin[w](sp,{mode:'each'})), v=AcchOrigin.pairValues(AcchOrigin.spectra(m)[0]);
        out[w]=v.xs.length===sp[0].xs.length && Array.from(v.xs).every((x,k)=>x===sp[0].xs[k]) && Array.from(v.ys).every((y,k)=>y===sp[0].ys[k]); }
      return out; }, txt);
    assert.ok(r.card, 'voce .opj/.opju nella finestra Esporta'); assert.match(r.text, /Non ancora verificato in Origin/);
    assert.ok(r.writeOpj && r.writeOpju);
    assert.deepStrictEqual(errors, []); await ctx.close(); });
}
