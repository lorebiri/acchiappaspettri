// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// CF-LIBS sperimentale nel programma vero: uno spettro LIBS SINTETICO (bronzo, app/libs-cf-core.js synth) caricato come CSV,
// pannello «CF-LIBS (sperimentale)» nelle ipotesi, calcolo con n_e da Hα, risultati e avvisi, in italiano e in inglese; scaricamento dei dati atomici
// dal NIST (risposte simulate con un campione SINTETICO, test/fixtures/libs/nist-sintetico.js), errori di rete e CORS, uso senza rete dopo.
// Uso: PW_CHANNEL=chrome node --test test/validation/libs-cf-ui.test.js
'use strict';
const test=require('node:test'), assert=require('node:assert');
const B=require('./browser.js'), C=require('../../app/libs-cf-core.js'), D=require('../libs-dati-locali.js');

function csv(){ const S=C.synth(D,{comp:{Cu:85, Sn:8, Zn:4, Pb:3}, T:10000, ne:1e17, ambient:{H:2e17}, peakCounts:1e6, seed:3, wl:[240,700], step:0.02});
  return '# LIBS laser-induced breakdown, spettro SINTETICO\nwavelength_nm,counts\n'+Array.from(S.x).map((x,i)=>x.toFixed(2)+','+S.y[i]).join('\n')+'\n'; }

for (const lang of ['it','en']) test('CF-LIBS nel pannello delle ipotesi ('+lang+')', async ()=>{
  const server=await B.startServer(), br=await B.launch();
  try{
    const {p, errors}=await B.openPage(br, server, {lang});
    // dati atomici del NIST (preparati da scripts/gen-libs-data.py, non distribuiti) messi nell'archivio della pagina come dopo lo scaricamento
    await p.evaluate(D=>{ AcchLibsNist.save(D); }, JSON.parse(JSON.stringify(D)));
    const out=await p.evaluate(async ([text])=>{
      files.length=0; await addEntries([{file:new File([text],'bronzo-libs.csv'), path:'bronzo-libs.csv'}]); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
      const f=files[files.length-1]; cur=files.length-1; if (f.instr!=='libs') return {instr:f.instr};
      renderAnHyp(f, viewOf(f)); const box=document.querySelector('#anHyp'), wrap=box.querySelector('.libscf'); if (!wrap) return {instr:f.instr, noPanel:true};
      const head=wrap.textContent; wrap.querySelector('[data-cf="open"]').click();
      const w2=box.querySelector('.libscf'); const sb=!!w2.querySelector('[data-cfel="Sb"]'); w2.querySelector('[data-cf="fwhm"]').value='0.05'; w2.querySelector('[data-cf="fwhm"]').dispatchEvent(new Event('change'));
      for (const e of ['Cu','Sn','Zn','Pb']){ const b=w2.querySelector('[data-cfel="'+e+'"]'); if (b && !b.classList.contains('on')) b.click(); }
      const w3=box.querySelector('.libscf'); for (const b of w3.querySelectorAll('[data-cfel].on')) if (!['Cu','Sn','Zn','Pb'].includes(b.dataset.cfel)) b.click();
      box.querySelector('.libscf [data-cf="run"]').click(); await new Promise(r=>setTimeout(r, 3000));
      const res=f._cf.res; return {sb, instr:f.instr, head, text:box.querySelector('.libscf').textContent, ok:res&&res.ok, T:res&&res.T, ne:res&&res.ne, src:res&&res.neSource,
        wt:res&&res.ok?Object.fromEntries(res.elements.map(e=>[e.el, e.wt])):null, svg:!!box.querySelector('.libscf svg'), wrapped:box.querySelectorAll('.libscf .areawrap > table').length, rows:box.querySelectorAll('.libscf table tbody tr').length};
    }, [csv()]);
    assert.strictEqual(out.instr, 'libs'); assert.ok(!out.noPanel, 'manca il pannello CF-LIBS');
    assert.match(out.head, lang==='en' ? /experimental/ : /sperimentale/);
    assert.match(out.head, lang==='en' ? /only on synthetic spectra/ : /solo su spettri sintetici/); assert.ok(!out.sb, 'Sb (nessuna riga in banca dati) non va offerto');
    assert.ok(out.ok, JSON.stringify(out).slice(0,500)); assert.strictEqual(out.src, 'Halpha');
    assert.ok(Math.abs(out.T/1e4-1)<0.05, 'T '+out.T); assert.ok(Math.abs(out.ne/1e17-1)<0.15, 'n_e '+out.ne);
    // qui conta il pannello, non l'accuratezza (passo di 0,02 nm, righe di risonanza escluse come da impostazione): tolleranze larghe
    for (const [e,v] of Object.entries({Cu:0.85, Sn:0.08, Zn:0.04, Pb:0.03})) assert.ok(Math.abs(out.wt[e]/v-1)<(v>0.05?0.1:0.3), e+' '+out.wt[e]);
    assert.ok(out.svg && out.rows>5); assert.equal(out.wrapped, 2, 'tabelle scorrevoli sugli schermi stretti');
    assert.match(out.text, lang==='en' ? /spectral response/ : /risposta spettrale/);
    assert.match(out.text, lang==='en' ? /necessary, not sufficient/ : /necessaria e non sufficiente/);
    assert.deepStrictEqual(errors, []);
  } finally { await br.close(); server.close(); }
});

const NS=require('../fixtures/libs/nist-sintetico.js');
for (const lang of ['it','en']) test('CF-LIBS senza dati atomici: spiegazione, scaricamento dal NIST, errori, poi senza rete ('+lang+')', {timeout:5*60*1000}, async ()=>{
  const server=await B.startServer(), br=await B.launch();
  try{
    const {p, errors, external}=await B.openPage(br, server, {lang}); let calls=0, mode='abort';
    await p.route('https://physics.nist.gov/**', route=>{ calls++; if (mode==='abort') return route.abort('failed');
      if (mode==='html') return route.fulfill({status:200, body:'<html><body>Server error</body></html>', headers:{'access-control-allow-origin':'*'}});
      return route.fulfill({status:200, contentType:'text/plain; charset=UTF-8', body:NS.respond(route.request().url()), headers:{'access-control-allow-origin':'*'}}); });
    const open=async ()=>p.evaluate(async ([text])=>{ files.length=0; await addEntries([{file:new File([text],'bronzo-libs.csv'), path:'bronzo-libs.csv'}]); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
      const f=files[files.length-1]; cur=files.length-1; AcchLibsNist.delay=0; renderAnHyp(f, viewOf(f)); const w=document.querySelector('#anHyp .libscf'); return {text:w?w.textContent:'', get:!!(w&&w.querySelector('[data-cf="nist"]')), file:!!(w&&w.querySelector('[data-cf="nistFile"]')), ready:!!(w&&w.querySelector('[data-cf="open"]'))}; }, [csv()]);
    const click=async ()=>{ await p.evaluate(()=>document.querySelector('#anHyp [data-cf="nist"]').click()); await p.waitForFunction(()=>{ const m=document.querySelector('#anHyp [data-cf="nistMsg"]'); return !document.querySelector('#anHyp [data-cf="nist"]') || (m && /△/.test(m.textContent)); }, null, {timeout:60000});
      return p.evaluate(()=>{ const m=document.querySelector('#anHyp [data-cf="nistMsg"]'); return {msg:m?m.textContent:'', ready:!!document.querySelector('#anHyp .libscf [data-cf="open"]')}; }); };
    const a=await open(); assert.ok(a.get && a.file && !a.ready, JSON.stringify(a)); assert.match(a.text, lang==='en' ? /experimental/ : /sperimentale/);
    assert.match(a.text, /NIST/); assert.match(a.text, /doi:10\.18434\/T4W30F/); assert.match(a.text, lang==='en' ? /not distributed with the app/ : /Non sono distribuiti con l'app/);
    const b=await click(); assert.ok(!b.ready && /CORS|direct downloads|scaricamento diretto/.test(b.msg), 'NIST irraggiungibile: '+b.msg);
    mode='html'; const c=await click(); assert.ok(!c.ready && /NIST/.test(c.msg) && /(previsto|expected)/.test(c.msg), 'risposta inattesa: '+c.msg);
    await p.evaluate(()=>{ Object.defineProperty(navigator, 'onLine', {get:()=>false, configurable:true}); }); const d=await click(); assert.ok(/(Internet)/.test(d.msg), 'senza rete: '+d.msg);
    await p.evaluate(()=>{ Object.defineProperty(navigator, 'onLine', {get:()=>true, configurable:true}); });
    mode='ok'; calls=0; const e=await click(); assert.ok(e.ready, 'dopo lo scaricamento il pannello è pronto: '+e.msg); assert.equal(calls, 26+2*(2*26-1), 'richieste al NIST (energie di ionizzazione, righe e livelli di 51 specie)');
    const saved=await p.evaluate(k=>{ const t=localStorage.getItem(k); return t ? JSON.parse(t) : null; }, 'acch.libs.nist'); assert.ok(saved && saved.species['Cu I'] && saved.version==='libs-data-1', 'salvati nell\'archivio della pagina');
    // pagina riaperta senza rete: i dati restano e il pannello è pronto senza richieste
    mode='abort'; calls=0; await p.reload(); await p.waitForFunction(()=>window.AcchProject && window.AcchUi); await p.evaluate(()=>{ try{ endTour(); }catch(e){} });
    const g=await open(); assert.ok(g.ready && !g.get && calls===0, 'senza rete dopo lo scaricamento: '+JSON.stringify(g)+' richieste '+calls);
    assert.deepStrictEqual(errors, []); assert.deepStrictEqual(external.filter(u=>!/physics\.nist\.gov/.test(u)), []);
  } finally { await br.close(); server.close(); }
});
