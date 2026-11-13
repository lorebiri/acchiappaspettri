// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Tappa I1, pacchetto «cjk»: cinese, giapponese e coreano nel PDF con WenQuanYi Micro Hei (vendor/fonts/).
// Il font si chiede solo per i PDF con ideogrammi, kana o hangul: mai all'avvio, mai per i PDF solo latini.
// Uso: PW_CHANNEL=chrome node --test test/validation/i1-cjk-ui.test.js
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), zlib=require('zlib');
const B=require('./browser.js');
const EX=path.join(B.ROOT,'examples','ftir-polietilene-sintetico');
const TITLE='试样 サンプル 시료 Probe';

// testo del PDF più i flussi FlateDecode decompressi (la mappa ToUnicode è compressa)
function pdfAll(s){ const bin=Buffer.from(s,'latin1'); let all=s, i=0;
  for (;;){ const m=bin.indexOf('stream', i); if (m<0) break; let st=m+6; if (bin[st]===13) st++; if (bin[st]===10) st++; const e=bin.indexOf('endstream', st); if (e<0) break;
    try{ all+=zlib.inflateSync(bin.subarray(st, e)).toString('latin1'); }catch(err){ try{ all+=zlib.inflateSync(bin.subarray(st, e-1)).toString('latin1'); }catch(err2){} } i=e+9; }
  return all; }
const build=(p, title)=>p.evaluate(async t=>{ if (t!=null) files[0].title=t; Object.assign(S,{outPdf:true, outAnalysis:false, summary:true}); const u=new Uint8Array(await (await buildPdf()).arrayBuffer()); let s=''; for (let i=0;i<u.length;i+=0x8000) s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000)); return s; }, title);

test('PDF con cinese, giapponese e coreano: font CJK incorporato solo se serve (online e desktop)', {timeout:5*60*1000}, async ()=>{
  const server=await B.startServer(), br=await B.launch();
  try{
    for (const desk of [false, true]){
      const tag=desk?'desktop':'online', {ctx, p, errors}=await B.openPage(br, server, {lang:'it', desk}), asked=[];
      p.on('request', q=>{ if (/vendor\/fonts\/.*\.ttf/.test(q.url())) asked.push(q.url()); });
      await p.reload(); await p.waitForFunction(()=>window.AcchProject && window.AcchUi); await p.evaluate(()=>{ try{ endTour(); }catch(e){} document.querySelectorAll('dialog[open]').forEach(d=>d.close()); });
      assert.deepEqual(asked, [], tag+': font chiesto all\'avvio');
      const name=fs.readdirSync(EX).sort()[0];
      await p.evaluate(async ([n,t])=>{ files.length=0; await addEntries([{file:new File([t],n), path:n}]); document.querySelectorAll('dialog[open]').forEach(d=>d.close()); }, [name, fs.readFileSync(path.join(EX,name),'utf8')]);
      // PDF solo latino: nessun font chiesto, nessun font incorporato
      const lat=await build(p, 'Probe 1 polietilene');
      assert.deepEqual(asked, [], tag+': font chiesto per un PDF solo latino');
      assert.ok(!/FontFile2/.test(lat), tag+': font incorporato in un PDF solo latino');
      // PDF con CJK: un solo font, WenQuanYi, incorporato, con i codepoint nella mappa ToUnicode
      const all=pdfAll(await build(p, TITLE));
      assert.deepEqual(asked.map(u=>u.replace(/^.*\//,'')), ['WenQuanYiMicroHei.ttf'], tag+': font chiesti '+asked.join(', '));
      assert.match(all, /\/FontFile2/, tag+': font non incorporato');
      assert.match(all, /\/BaseFont\s*\/WenQuanYi/, tag+': WenQuanYi Micro Hei non è il font del PDF');
      for (const ch of TITLE.replace(/ /g,'')){ const cp=ch.codePointAt(0).toString(16).toUpperCase().padStart(4,'0'); assert.ok(new RegExp('<'+cp+'>','i').test(all), `${tag}: manca U+${cp} (${ch}) nella mappa ToUnicode`); }
      // dopo, un PDF solo latino torna al font standard
      const lat2=await build(p, 'Probe 2');
      assert.ok(!/FontFile2/.test(lat2), tag+': font CJK rimasto attivo nel PDF successivo');
      assert.equal(asked.length, 1, tag+': font chiesto di nuovo per il PDF solo latino');
      assert.deepEqual(errors, [], tag);
      await ctx.close();
    }
  } finally { await br.close(); server.close(); }
});

test('PDF CJK: unità e simboli scientifici restano leggibili (cm⁻¹, pedici, ±, °)', {timeout:5*60*1000}, async ()=>{
  const server=await B.startServer(), br=await B.launch();
  try{
    const {ctx, p, errors}=await B.openPage(br, server, {lang:'it'});
    const r=await p.evaluate(()=>{ const old=[PDF_UNI, PDF_CJK]; PDF_UNI=true; PDF_CJK=true; const out=pdfText('试样 1650 cm⁻¹ · H₂O · CO₂ · x⁰ · 25 °C ± 0,5 µm · č ł α'); [PDF_UNI, PDF_CJK]=old; return out; });
    assert.equal(r, '试样 1650 cm-¹ · H2O · CO2 · x0 · 25 °C ± 0,5 µm · č ł α');
    // larghezze per jsPDF: gli hangul sono glifi composti e senza la correzione di scripts/font-cjk.js avanzano di 1/8 di em (caratteri sovrapposti)
    const w=await p.evaluate(async ()=>{ await ensurePdfLib(); const doc=new window.jspdf.jsPDF({unit:'mm'}), u=new Uint8Array(await (await fetch(PDF_CJK_URL)).arrayBuffer()); let b=''; for (let i=0;i<u.length;i+=0x8000) b+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));
      doc.addFileToVFS('w.ttf', btoa(b)); doc.addFont('w.ttf','W','normal'); doc.setFont('W','normal'); return Object.fromEntries([...'试樣サンプル시료한국P'].map(c=>[c, doc.getStringUnitWidth(c)])); });
    for (const [c,x] of Object.entries(w)) assert.ok(c==='P' ? x>0.4 && x<0.8 : Math.abs(x-1)<0.01, `larghezza di ${c}: ${x} em`);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await br.close(); server.close(); }
});
