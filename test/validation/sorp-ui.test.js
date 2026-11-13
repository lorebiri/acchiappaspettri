// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Fisisorbimento nella pagina vera (online e desktop, IT ed EN): riconoscimento, schede della SPEC §4, avvisi, importazione guidata,
// esportazioni (tabelle di analisi e PDF). Fixture SINTETICHE in test/fixtures/sorption (formati Kaomi DEDOTTI).
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), B=require('./browser.js'), {pdfText}=require('./pdf-text.js');
const FX=path.join(__dirname,'..','fixtures','sorption'), rd=n=>fs.readFileSync(path.join(FX,n),'utf8');
const EMOJI=/[\p{Extended_Pictographic}]/u;

test('fisisorbimento: lettura, schede, avvisi, importazione guidata ed esportazioni', {timeout:10*60*1000}, async ()=>{
  const server=await B.startServer(), br=await B.launch();
  try{
    for (const [lang, desk] of [['it',false],['it',true],['en',true],['en',false]]){
      const {ctx, p, errors}=await B.openPage(br, server, {lang, desk}), tag=`${lang}${desk?' desktop':' online'}`;
      const names=['kaomi-tabella-it.txt','kaomi-tabella-en.csv','isoterma.aif','asiqwin-grezzo.txt','kaomi-report-testo.txt','co2-273K.csv','co2-298K.csv'];
      const got=await p.evaluate(async L=>{ files.length=0; await addEntries(L.map(([n,t])=>({file:new File([t],n), path:n}))); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
        return files.map(f=>({n:f.name, instr:f.instr, ads:f.iso&&f.iso.branches.ads.x.length, des:f.iso&&f.iso.branches.des.x.length})); }, names.map(n=>[n, rd(n)]));
      for (const n of names){ const f=got.find(g=>g.n===n); assert.ok(f, `${tag}: ${n} caricato`); assert.strictEqual(f.instr, 'sorp', `${tag}: ${n} riconosciuto come fisisorbimento`); }
      assert.deepStrictEqual([got.find(g=>g.n==='kaomi-tabella-it.txt').ads, got.find(g=>g.n==='kaomi-tabella-it.txt').des], [28, 23], tag+': rami separati');

      // schede: ognuna disegna senza errori; i grafici ci sono dove servono
      const tabs=await p.evaluate(async ()=>{ cur=files.findIndex(f=>f.name==='kaomi-tabella-it.txt'); go(2); renderAnalysis(); const box=$('#anTech'), out={};
        for (const k of ['iso','bet','lang','t','pori','micro','dft','qst','cmp']){ box.querySelector(`[data-tab="${k}"]`).click(); out[k]={svg:box.querySelectorAll('svg.sorpchart').length, text:box.innerText}; }
        cur=files.findIndex(f=>f.name==='co2-273K.csv'); renderAnalysis(); box.querySelector('[data-tab="qst"]').click(); out.qstCO2={svg:box.querySelectorAll('svg.sorpchart').length, text:box.innerText};
        return out; });
      for (const k of ['iso','bet','t','pori','micro','cmp']) assert.ok(tabs[k].svg>=1, `${tag}: grafico nella scheda ${k}`);
      assert.ok(/Rouquerol/.test(tabs.bet.text), tag+': criteri mostrati');
      assert.ok(tabs.qstCO2.svg>=1, tag+': calore isosterico con due temperature di CO₂');
      assert.ok(/28/.test(tabs.qstCO2.text), tag+': Qst vicino a 28 kJ/mol');
      assert.ok(/(Kaomi|kernel)/.test(tabs.dft.text), tag+': DFT onesta (nessun kernel incluso)');

      // avvisi: simboli professionali nel desktop, emoji solo online; in inglese tradotti
      const w=await p.evaluate(async ()=>{ cur=files.findIndex(f=>f.name==='kaomi-tabella-it.txt'); renderAnalysis(); $('#anTech [data-tab="lang"]').click(); await new Promise(r=>setTimeout(r,150)); const box=$('#anTech'); return {html:box.innerText, li:[...box.querySelectorAll('.sorpwarn li')].map(l=>l.innerText)}; });
      assert.ok(w.li.length>=1, tag+': almeno un avviso (Langmuir su tipo II/IV)');
      if (desk){ assert.ok(!EMOJI.test(w.html), tag+': nessuna emoji nel desktop: '+(w.html.match(EMOJI)||[])[0]); assert.ok(w.li.every(t=>/^[△⊘]/.test(t)), tag+': segni △/⊘'); }
      else assert.ok(w.li.every(t=>/^(⚠️|⛔)/.test(t)), tag+': segni online');
      if (lang==='en') assert.ok(!/Langmuir su un'isoterma|il modello non ha/.test(w.html), tag+': avvisi tradotti');

      // importazione guidata: annulla → nessun file; scelta delle colonne → isoterma letta
      await p.evaluate(async t=>{ await addEntries([{file:new File([t],'ignote.txt'), path:'ignote.txt'}]); }, rd('kaomi-colonne-ignote.txt'));
      await p.waitForSelector('dialog.sorpguided[open]', {timeout:5000});
      await p.click('dialog.sorpguided button[value="cancel"]'); await p.waitForTimeout(300);
      assert.strictEqual(await p.evaluate(()=>files.filter(f=>/ignote/.test(f.name)).length), 0, tag+': annullata, nessun file');
      await p.evaluate(async t=>{ await addEntries([{file:new File([t],'ignote2.txt'), path:'ignote2.txt'}]); }, rd('kaomi-colonne-ignote.txt'));
      await p.waitForSelector('dialog.sorpguided[open]', {timeout:5000});
      await p.click('dialog.sorpguided button[value="ok"]');   // senza scelte: deve rifiutare
      assert.ok(await p.isVisible('dialog.sorpguided .sorpgerr'), tag+': errore se manca la quantità');
      await p.selectOption('dialog.sorpguided select[name="n"]', '2'); await p.selectOption('dialog.sorpguided select[name="rel"]', '1');
      await p.click('dialog.sorpguided button[value="ok"]');
      assert.ok(await p.isVisible('dialog.sorpguided .sorpgerr'), tag+': errore se manca l\'unità');
      await p.selectOption('dialog.sorpguided select[name="nu"]', 'cm3STP/g'); await p.click('dialog.sorpguided button[value="ok"]');
      await p.waitForFunction(()=>files.some(f=>/ignote2\.guidata\.aif$/.test(f.name)), null, {timeout:5000});
      const gd=await p.evaluate(()=>{ const f=files.find(f=>/ignote2\.guidata/.test(f.name)); return [f.instr, f.iso.branches.ads.x.length, f.iso.branches.des.x.length, +f.iso.branches.ads.n[5].toFixed(3)]; });
      assert.deepStrictEqual(gd.slice(0,3), ['sorp', 28, 23], tag+': importazione guidata');

      // esportazioni: tabelle di analisi (la finestra Esporta le usa) e PDF con i risultati
      const ex=await p.evaluate(async ()=>{ files.forEach(f=>f.include=f.name==='kaomi-tabella-it.txt'); const af=analysisFiles(); Object.assign(S,{outPdf:true, outAnalysis:true, summary:true});
        const u=new Uint8Array(await (await buildPdf()).arrayBuffer()); files.forEach(f=>f.include=true); return {af:af.map(a=>[a[0], a[1].slice(0,4000)]), pdf:Array.from(u)}; });
      const so=ex.af.find(a=>/^(fisisorbimento|physisorption)_kaomi-tabella-it\.csv$/.test(a[0])); assert.ok(so, tag+': CSV del fisisorbimento tra le tabelle di analisi');
      assert.ok(/BET/.test(so[1]) && /Rouquerol/.test(so[1]), tag+': CSV con BET e criteri');
      assert.ok(ex.af.some(a=>/metodi|methods/.test(a[0]) && /ISO 9277/.test(a[1])), tag+': bibliografia con ISO 9277');
      const txt=pdfText(Buffer.from(ex.pdf)).join('\n'); assert.ok(/BET/.test(txt), tag+': PDF con il BET');
      assert.deepStrictEqual(errors, [], tag+': nessun errore nella pagina');
      await ctx.close();
    }
  } finally { await br.close(); server.close(); }
});
