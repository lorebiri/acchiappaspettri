// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// R6: forma dei file esportati (ciclo 25). CSV rapidi con il separatore della lingua, nessuna formula di Excel dai titoli,
// numeri grezzi in parametri_per_tecnica.csv, PDF con apostrofi e simboli tipografici (anche nel titolo dei metadati),
// FTIR in trasmittanza 0–1 senza indice, «> 100.000» nel formato della lingua.
// Uso: PW_CHANNEL=chrome node --test test/validation/r6-formato-esportazioni.test.js
'use strict';
const {describe, it, before}=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path');
const B=require('./browser.js'), {pdfText, pdfInfoTitle}=require('./pdf-text.js');
const JSZip=require(path.join(B.ROOT,'node_modules','jszip'));

// dati SINTETICI: cromatogramma con un picco stretto (N > 10 000) e senza rumore (S/N oltre 100 000)
const T=Array.from({length:3000},(_,i)=>i*0.004);
const chrom=h=>'Time (min),Signal (mAU)\n'+T.map(t=>t.toFixed(4)+','+(0.5+h*Math.exp(-0.5*Math.pow((t-5)/0.03,2))).toFixed(4)).join('\n');
const FTIR_T=fs.readFileSync(path.join(B.ROOT,'test','corpus','c','64_ftir_T_fraction.txt')).toString('base64');
const DOC='Relazione dell’affresco “Sala” – 5 € • 3‰ … m² cm³ ±°µ è';   // solo WinAnsi: i caratteri fuori WinAnsi (č, greco, CJK) caricano un font Unicode e hanno i loro test (i1-analisi-ui, i1-cjk-ui)
const DOC_PDF=DOC;
const toStr=b64=>Buffer.from(b64,'base64');

function parseCsv(text, sep){ const rows=[]; let row=[], cell='', q=false; for (let i=0;i<text.length;i++){ const c=text[i];
  if (q){ if (c==='"'){ if (text[i+1]==='"'){ cell+='"'; i++; } else q=false; } else cell+=c; continue; }
  if (c==='"') q=true; else if (c===sep){ row.push(cell); cell=''; } else if (c==='\r'){} else if (c==='\n'){ row.push(cell); rows.push(row); row=[]; cell=''; } else cell+=c; }
  if (cell||row.length){ row.push(cell); rows.push(row); } return rows; }

async function run(lang){
  const server=await B.startServer(), br=await B.launch();
  try{
    const {ctx, p, errors}=await B.openPage(br, server, {lang});
    const L=[['STD1.csv',chrom(40),1],['STD2.csv',chrom(80),2],['STD3.csv',chrom(120),3],['INC.csv',chrom(60),null]];
    const r=await p.evaluate(async ([L, ftirT, DOC])=>{
      const wait=ms=>new Promise(r=>setTimeout(r,ms)), b64=async b=>{ const u=new Uint8Array(await b.arrayBuffer()); let s=''; for (let i=0;i<u.length;i+=0x8000) s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000)); return btoa(s); };
      const ft=Uint8Array.from(atob(ftirT),c=>c.charCodeAt(0));
      await addEntries(L.map(([n,t])=>({file:new File([t],n),path:n})).concat(['T1.txt','T2.txt','T3.txt'].map(n=>({file:new File([ft],n),path:n}))));
      document.querySelectorAll('dialog[open]').forEach(d=>d.close());
      const c=mvCfg('hplc'); c.a=4.8; c.b=5.2; c.meas='area'; mvSave(); L.forEach(([n,,conc])=>{ const f=files.find(g=>g.name===n); if (f&&conc!=null) anSet(f,'conc',conc); });
      // titoli che Excel eseguirebbe come formule (anche da un progetto ricevuto)
      const hp=files.filter(f=>f.instr==='hplc'); hp[0].title='=HYPERLINK("http://x.invalid","clic")'; hp[1].title='@SUM(A1:A2)'; hp[2].title='+1+2'; hp[3].title='-3+4'; hp.forEach(persist);
      // ⬇️ CSV rapido della scheda «Più campioni»
      let got=null; const oldDl=window.download; window.download=(blob,name)=>{ got={blob,name}; };
      go(2); cur=files.indexOf(hp[0]); openTab('multi'); $('#secMulti').open=true; $('#mvInstr').value='hplc'; renderMulti(); await wait(150);
      $('#mvCsv').click(); window.download=oldDl;
      const quick={name:got&&got.name, text:got?(await got.blob.text()).replace(/^﻿/,''):''};
      // FTIR in trasmittanza 0–1 letta come assorbanza: nessun valore, avviso esplicito
      const cf=mvCfg('ftir'); cf.a=1650; cf.b=1800; cf.meas='area'; mvSave();
      const ftir=(mvTable('ftir')||[]).map(o=>({y:o.y, flag:o.flag}));
      Object.assign(S,{outPdf:true, csvPeaks:true, outAnalysis:true, summary:true, showPeaks:true}); S.docTitle=DOC; saveS();
      const zip=await buildZip(), pdf=await buildPdf();
      files.forEach((f,i)=>{ f.include=i===0; }); const pdf1=await buildPdf();
      return {LANG, quick, ftir, sym:pdfText('a ≠ b ≈ c ≥ d ≤ e'), sn:fmtSN(1e7), zip:await b64(zip), pdf:await b64(pdf), pdf1:await b64(pdf1), cells:[csvCell('-12,5',';'), csvCell('-1.5e-3',','), csvCell('=1+1',';'), csvCell('\tx',';'), csvCell('-',';'), csvCell('a\rb',';')]};
    }, [L, FTIR_T, DOC]);
    await ctx.close();
    const Z=await JSZip.loadAsync(toStr(r.zip)), csv={};
    for (const k of Object.keys(Z.files)) if (/\.csv$/.test(k)) csv[k.split('/').slice(1).join('/')]=(await Z.file(k).async('string')).replace(/^﻿/,'');
    return {...r, csv, errors};
  } finally { await br.close(); server.close(); }
}

for (const lang of ['it','en']) describe(`R6 forma delle esportazioni (${lang})`, {timeout:5*60*1000}, ()=>{
  const en=lang==='en', sep=en?',':';', dec=en?'.':','; let R;
  before(async ()=>{ R=await run(lang); }, {timeout:5*60*1000});
  it('nessun errore nella pagina, lingua dei documenti', ()=>{ assert.deepStrictEqual(R.errors, []); assert.strictEqual(R.LANG, lang); });
  it('CSV rapido: separatore e decimale della lingua, come nello ZIP', ()=>{
    const q=parseCsv(R.quick.text, sep);
    assert.ok(q.length>=5 && q[0].length>=8, `CSV rapido letto con «${sep}»: ${q.length} righe, ${q[0]&&q[0].length} colonne`);
    assert.ok(q.slice(1).some(row=>row.some(c=>new RegExp('^\\d+\\'+dec+'\\d+$').test(c))), 'numeri con il decimale della lingua');
    if (en) assert.match(R.quick.name, /^band_measurements_hplc\.csv$/); });
  it('formule: i titoli pericolosi hanno «\'» davanti, i numeri negativi no', ()=>{
    const pk=parseCsv(R.csv[en?'peak_list.csv':'elenco_picchi.csv'], sep), titles=new Set(pk.slice(1).map(row=>row[1]));
    for (const t of ['=HYPERLINK("http://x.invalid","clic")','@SUM(A1:A2)','+1+2','-3+4']) assert.ok(titles.has("'"+t), `titolo «${t}» senza protezione nel CSV dei picchi`);
    for (const [name, text] of Object.entries(R.csv)) for (const row of parseCsv(text, sep)) for (const c of row) assert.ok(!/^[=+@\t\r]/.test(c) && !/^-[^\d.,]/.test(c), `${name}: cella che Excel eseguirebbe: ${c.slice(0,40)}`);
    assert.deepStrictEqual(R.cells, ['-12,5','-1.5e-3',"'=1+1","'\tx",'-','"a\rb"']); });
  it('parametri_per_tecnica.csv: numeri senza separatore delle migliaia', ()=>{
    const tp=parseCsv(R.csv[en?'analysis/technique_parameters.csv':'analisi/parametri_per_tecnica.csv'], sep), hN=tp.findIndex(row=>row.includes('N')), iN=tp[hN].indexOf('N'), iSN=tp[hN].indexOf('S/N');
    const Ns=tp.slice(hN+1).filter(row=>row[0]==='' && row[iN]).map(row=>row[iN]);
    assert.ok(Ns.length>=4 && Ns.every(v=>/^\d+$/.test(v) && +v>10000), 'N grezzo e oltre 10 000: '+Ns.join(' | '));
    assert.ok(tp.slice(hN+1).some(row=>row[iSN]==='> 100000'), 'S/N oltre 100 000 scritto «> 100000»'); });
  it('«> 100.000» nel formato della lingua', ()=>assert.strictEqual(R.sn, en?'> 100,000':'> 100.000'));
  it('FTIR in trasmittanza 0–1: nessun indice, avviso che dice il motivo', ()=>assert.ok(R.ftir.length===3 && R.ftir.every(o=>o.y===null && /trasmittanza letta come assorbanza/.test(o.flag)), JSON.stringify(R.ftir)));
  it('PDF: caratteri tipografici nel testo', ()=>{ const lines=pdfText(toStr(R.pdf));
    assert.ok(lines.includes(DOC_PDF), 'titolo del documento con ’ “ ” – € • ‰ … ² ³ nel PDF: '+lines.find(l=>l.startsWith('Relazione'))+' · prime righe: '+JSON.stringify(lines.slice(0,8))); });   // ciclo 26: fallimento raro, le prime righe dicono se manca la pagina di riepilogo
  it('PDF: titolo intero nei metadati (/Title)', ()=>assert.strictEqual(pdfInfoTitle(toStr(R.pdf)), DOC));
  it('PDF: simboli fuori WinAnsi in forma leggibile («≠» non diventa «=»)', ()=>assert.strictEqual(R.sym, 'a != b ~ c >= d <= e'));   // ciclo 26
  it('PDF: «1 grafico» al singolare', ()=>assert.ok(pdfText(toStr(R.pdf1)).some(l=>l.startsWith(en?'1 plot ·':'1 grafico ·')), '«1 grafici» al plurale · prime righe: '+JSON.stringify(pdfText(toStr(R.pdf1)).slice(0,8))));
});
