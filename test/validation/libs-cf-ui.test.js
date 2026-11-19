// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// CF-LIBS sperimentale nel programma vero: uno spettro LIBS SINTETICO (bronzo, app/libs-cf-core.js synth) caricato come CSV,
// pannello «CF-LIBS (sperimentale)» nelle ipotesi, calcolo con n_e da Hα, risultati e avvisi, in italiano e in inglese.
// Uso: PW_CHANNEL=chrome node --test test/validation/libs-cf-ui.test.js
'use strict';
const test=require('node:test'), assert=require('node:assert');
const B=require('./browser.js'), C=require('../../app/libs-cf-core.js'), D=require('../../app/libs-data.js');

function csv(){ const S=C.synth(D,{comp:{Cu:85, Sn:8, Zn:4, Pb:3}, T:10000, ne:1e17, ambient:{H:2e17}, peakCounts:1e6, seed:3, wl:[240,700], step:0.02});
  return '# LIBS laser-induced breakdown, spettro SINTETICO\nwavelength_nm,counts\n'+Array.from(S.x).map((x,i)=>x.toFixed(2)+','+S.y[i]).join('\n')+'\n'; }

for (const lang of ['it','en']) test('CF-LIBS nel pannello delle ipotesi ('+lang+')', async ()=>{
  const server=await B.startServer(), br=await B.launch();
  try{
    const {p, errors}=await B.openPage(br, server, {lang});
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
        wt:res&&res.ok?Object.fromEntries(res.elements.map(e=>[e.el, e.wt])):null, svg:!!box.querySelector('.libscf svg'), rows:box.querySelectorAll('.libscf table tbody tr').length};
    }, [csv()]);
    assert.strictEqual(out.instr, 'libs'); assert.ok(!out.noPanel, 'manca il pannello CF-LIBS');
    assert.match(out.head, lang==='en' ? /experimental/ : /sperimentale/);
    assert.match(out.head, lang==='en' ? /only on synthetic spectra/ : /solo su spettri sintetici/); assert.ok(!out.sb, 'Sb (nessuna riga in banca dati) non va offerto');
    assert.ok(out.ok, JSON.stringify(out).slice(0,500)); assert.strictEqual(out.src, 'Halpha');
    assert.ok(Math.abs(out.T/1e4-1)<0.05, 'T '+out.T); assert.ok(Math.abs(out.ne/1e17-1)<0.15, 'n_e '+out.ne);
    // qui conta il pannello, non l'accuratezza (passo di 0,02 nm, righe di risonanza escluse come da impostazione): tolleranze larghe
    for (const [e,v] of Object.entries({Cu:0.85, Sn:0.08, Zn:0.04, Pb:0.03})) assert.ok(Math.abs(out.wt[e]/v-1)<(v>0.05?0.1:0.3), e+' '+out.wt[e]);
    assert.ok(out.svg && out.rows>5);
    assert.match(out.text, lang==='en' ? /spectral response/ : /risposta spettrale/);
    assert.match(out.text, lang==='en' ? /necessary, not sufficient/ : /necessaria e non sufficiente/);
    assert.deepStrictEqual(errors, []);
  } finally { await br.close(); server.close(); }
});
