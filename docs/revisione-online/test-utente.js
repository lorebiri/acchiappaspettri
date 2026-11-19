// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Test d'uso reale della versione online (docs/revisione-online/TEST-UTENTE.md).
// Un utente appena uscito da una misura FTIR apre l'app per la prima volta e vuole il grafico: Playwright fa solo quello che farebbe una persona
// (clic sui pulsanti visibili, scelta del file nella finestra del sistema), da browser e da telefono, e cronometra ogni passo.
// Pagina: la radice del ramo servita così com'è, come la pubblica GitHub Pages. Nessuna preferenza salvata: prima visita vera.
// File: l'esempio FTIR del repository (examples/ftir-polietilene-sintetico, dati SINTETICI) come CSV e lo stesso spettro esportato in JCAMP-DX,
// più un export «da strumento» del corpus di prova (tabulazioni, intestazione, ordine decrescente) e uno in trasmittanza.
// Uso: node docs/revisione-online/test-utente.js [cartella-di-uscita]   → risultati.json e schermate PNG
'use strict';
const fs=require('fs'), path=require('path');
const ROOT=process.env.ACCH_ROOT ? path.resolve(process.env.ACCH_ROOT) : path.join(__dirname,'..','..');
const B=require(path.join(ROOT,'test/validation/browser.js'));
const OUT=path.resolve(process.argv[2]||path.join(__dirname,'test-utente')); fs.mkdirSync(OUT,{recursive:true});
const TMP=fs.mkdtempSync(path.join(require('os').tmpdir(),'acch-utente-'));

// lo spettro d'esempio come lo scriverebbe uno strumento in JCAMP-DX (AFFN, una coppia X Y per riga)
function jcamp(csv){ const rows=csv.split(/\r?\n/).filter(l=>/^\d/.test(l)).map(l=>l.split(',').map(Number));
  const xs=rows.map(r=>r[0]), ys=rows.map(r=>r[1]);
  return ['##TITLE=PE_0000h_SINTETICO (dati sintetici)','##JCAMP-DX=4.24','##DATA TYPE=INFRARED SPECTRUM','##ORIGIN=esempio sintetico di Acchiappaspettri','##OWNER=public domain',
    '##XUNITS=1/CM','##YUNITS=ABSORBANCE','##XFACTOR=1','##YFACTOR=1','##FIRSTX='+xs[0],'##LASTX='+xs[xs.length-1],'##NPOINTS='+xs.length,'##FIRSTY='+ys[0],'##XYPOINTS=(XY..XY)',
    ...rows.map(r=>r[0]+', '+r[1]),'##END='].join('\n')+'\n'; }
const csvPath=path.join(ROOT,'examples/ftir-polietilene-sintetico/PE_0000h_SINTETICO.csv');
const FILES={
  'CSV (esempio del repository)': csvPath,
  'JCAMP-DX (stesso spettro)': (()=>{ const p=path.join(TMP,'PE_0000h_SINTETICO.jdx'); fs.writeFileSync(p, jcamp(fs.readFileSync(csvPath,'utf8'))); return p; })(),
  'TXT con tabulazioni (corpus)': path.join(ROOT,'test/corpus/c/01_ftir_tab_desc.txt'),
  'CSV in trasmittanza (corpus)': path.join(ROOT,'test/corpus/c/05_ftir_T_header.csv'),
};
const DEV={ browser:{viewport:{width:1440,height:900}}, telefono:{viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:1} };

async function prova(br, server, dev, nome, file){
  const ctx=await br.newContext(Object.assign({locale:'it-IT', colorScheme:'light'}, DEV[dev]));
  await ctx.route('**/*', r=>/^http:\/\/127\.0\.0\.1|^(data|blob):/.test(r.request().url()) ? r.continue() : r.abort());
  const p=await ctx.newPage(), errors=[]; p.on('pageerror',e=>errors.push(String(e)));
  const T=[], t0=Date.now(); let last=t0; const passo=(s,nota)=>{ const n=Date.now(); T.push({passo:s, ms:n-last, totale:n-t0, nota:nota||''}); last=n; };
  const tap=async sel=>{ const l=p.locator(sel).first(); await l.scrollIntoViewIfNeeded(); if (dev==='telefono') await l.tap(); else await l.click(); };
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.locator('#pickFiles').waitFor(); passo('pagina aperta');
  const welcome=await p.locator('#dlgWelcome[open]').waitFor({timeout:3000}).then(()=>true,()=>false);
  if (welcome){ await p.screenshot({path:path.join(OUT,`${dev}-1-benvenuto.png`)}); await tap('#wcGo'); await p.locator('#dlgWelcome[open]').waitFor({state:'detached'}).catch(()=>{}); passo('benvenuto chiuso con «Iniziamo»'); }
  const btnTop=await p.locator('#pickFiles').evaluate(e=>{ const r=e.getBoundingClientRect(); return {visibile:r.bottom<=innerHeight && r.top>=0, y:Math.round(r.top)}; });
  await p.screenshot({path:path.join(OUT,`${dev}-2-pagina.png`)});
  const fc=p.waitForEvent('filechooser'); await tap('#pickFiles'); const chooser=await fc; passo('«Scegli file» premuto', btnTop.visibile?'pulsante già in vista':'serve scorrere: pulsante a '+btnTop.y+' px');
  await chooser.setFiles(file);
  await p.locator('#v2.view.on').waitFor({timeout:20000});
  await p.waitForFunction(()=>typeof files!=='undefined' && files.length>0 && document.querySelector('#v2 canvas'));
  await p.waitForTimeout(300); passo('file letto, si apre il passo 2');
  // il grafico «utile»: titolo, asse X con unità, asse Y, picchi con etichetta; in vista senza scorrere?
  const g=await p.evaluate(()=>{ const f=files[0], d=viewOf(f), c=document.querySelector('#pv')||document.querySelector('#v2 canvas'); const r=c.getBoundingClientRect();
    return {strumento:f.instr, nome:f.name, asseX:L10N.it.x[f.instr]||null, asseY:L10N.it.y[d.kind||f.kind]||null, picchi:d.peaks.length,
      primi:d.peaks.slice().sort((a,b)=>b.y-a.y).slice(0,4).map(q=>Math.round(q.x)), grafico:{alto:Math.round(r.top), basso:Math.round(r.bottom), largo:Math.round(r.width), inVista:r.top>=0 && r.bottom<=innerHeight+2} }; });
  if (!g.grafico.inVista){ await p.locator('#pv, #v2 canvas').first().scrollIntoViewIfNeeded(); }
  passo('grafico leggibile in vista', g.grafico.inVista ? 'già in vista' : 'serve scorrere fino al grafico');
  await p.screenshot({path:path.join(OUT,`${dev}-3-grafico-${nome.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}.png`)});
  await ctx.close();
  return {dispositivo:dev, file:nome, benvenuto:welcome, passi:T, grafico:g, errori:errors};
}
(async()=>{
  const server=await B.startServer(), br=await B.launch(), R=[];
  try{ for (const dev of Object.keys(DEV)) for (const [nome,file] of Object.entries(FILES)){ const r=await prova(br,server,dev,nome,file); R.push(r);
      console.log(`${dev}\t${nome}\t${(r.passi[r.passi.length-1].totale/1000).toFixed(1)} s\t${r.grafico.strumento}\tX: ${r.grafico.asseX}\tY: ${r.grafico.asseY}\tpicchi ${r.grafico.picchi} (${r.grafico.primi.join(', ')})\t${r.passi.map(x=>x.nota).filter(Boolean).join(' · ')}${r.errori.length?'\tERRORI '+r.errori.join(' | '):''}`); } }
  finally{ await br.close(); server.close(); fs.rmSync(TMP,{recursive:true,force:true}); }
  fs.writeFileSync(path.join(OUT,'risultati.json'), JSON.stringify(R,null,1)+'\n');
})().catch(e=>{ console.error(e); process.exit(1); });
