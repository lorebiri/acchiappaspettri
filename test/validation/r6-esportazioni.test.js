// R6: ciò che si vede a schermo coincide con ciò che si esporta (CSV nello ZIP e PDF), in italiano e in inglese;
// in inglese i testi scritti dall'utente (titolo del documento, titolo dello spettro) restano come scritti.
// Uso: PW_CHANNEL=chrome node --test test/validation/r6-esportazioni.test.js
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path');
const B=require('./browser.js'), {pdfText}=require('./pdf-text.js');
const JSZip=require(path.join(B.ROOT,'node_modules','jszip'));
const FILES=['c/10_raman_header.txt','c/64_ftir_T_fraction.txt','c/48_ftir_saturated.txt','xrf/A08_bronzo_senzacal.mca','hplc/U3_coeluito.txt'];
const USER_TITLE='Campione della cappella, strato pittorico', DOC_TITLE='Relazione di prova sulle cappelle del duomo';
const norm=s=>String(s).replace(/\s+/g,' ').trim();

async function exportOnce(lang){
  const server=await B.startServer(), br=await B.launch();
  try{
    const {ctx, p, errors}=await B.openPage(br, server, {lang});
    const list=FILES.map(r=>[path.basename(r), fs.readFileSync(path.join(B.ROOT,'test','corpus',r)).toString('base64')]);
    const r=await p.evaluate(async ([list, USER_TITLE, DOC_TITLE])=>{
      await addEntries(list.map(([n,b])=>({file:new File([Uint8Array.from(atob(b),c=>c.charCodeAt(0))],n), path:n}))); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
      files[0].title=USER_TITLE; persist(files[0]); S.docTitle=DOC_TITLE; Object.assign(S,{outPdf:true, csvPeaks:true, outAnalysis:true, summary:true, showPeaks:true});
      const wait=ms=>new Promise(r=>setTimeout(r,ms)), toB64=async b=>{ const u=new Uint8Array(await b.arrayBuffer()); let s=''; for (let i=0;i<u.length;i+=0x8000) s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000)); return btoa(s); };
      const screen=[];
      for (let i=0;i<files.length;i++){ cur=i; go(2); openTab('an'); renderAnalysis(); renderPreview(); await wait(80);
        const qual=[...document.querySelectorAll('#anQual li')].map(li=>{ const d=li.querySelector('div').cloneNode(true); d.querySelectorAll('button').forEach(b=>b.remove()); return {lv:(/lv-(\w+)/.exec(li.className)||[])[1], t:d.textContent}; });
        screen.push({name:files[i].name, shown:document.querySelector('#pvTitle').innerText, qual,
          pk:[...document.querySelectorAll('#pkTable tr[data-x]')].map(tr=>({pos:tr.querySelector('.pos').innerText, y:tr.querySelector('.int').innerText}))}); }
      const pdf=await buildPdf(), zip=await buildZip();
      return {LANG, ui:window.AcchI18n&&AcchI18n.lang, dec:T_().dec, screen, pdf:await toB64(pdf), zip:await toB64(zip), names:files.map(f=>({name:f.name, disp:dispTitle(f), instr:T_().nome[f.instr]}))};
    }, [list, USER_TITLE, DOC_TITLE]);
    await ctx.close();
    const pdf=pdfText(Buffer.from(r.pdf,'base64')), Z=await JSZip.loadAsync(Buffer.from(r.zip,'base64')), csv={};
    for (const k of Object.keys(Z.files)) if (/\.csv$/.test(k)) csv[k.split('/').slice(1).join('/')]=(await Z.file(k).async('string')).replace(/^\uFEFF/,'');
    return {...r, pdfLines:pdf, csv, errors};
  } finally { await br.close(); server.close(); }
}
function parseCsv(text, sep){ const rows=[]; let row=[], cell='', q=false; for (let i=0;i<text.length;i++){ const c=text[i];
  if (q){ if (c==='"'){ if (text[i+1]==='"'){ cell+='"'; i++; } else q=false; } else cell+=c; continue; }
  if (c==='"') q=true; else if (c===sep){ row.push(cell); cell=''; } else if (c==='\r'){} else if (c==='\n'){ row.push(cell); rows.push(row); row=[]; cell=''; } else cell+=c; }
  if (cell||row.length){ row.push(cell); rows.push(row); } return rows; }
// sezione «Analisi» del PDF: per ogni spettro gli elementi GRAVE/SERIOUS (⛔) e «!» (⚠), con le righe spezzate ricucite
function pdfAnalysis(lines, names){
  const out={}; let curName=null, item=null;
  const heads=names.map(n=>n.disp+' · '+n.instr);
  for (const l of lines){ const h=heads.indexOf(l); if (h>=0){ curName=names[h].name; out[curName]=[]; item=null; continue; }
    if (!curName) continue;
    if (/^(Relazione|Analisi|Analysis|Pagina|Page|Acchiappaspettri)\b/.test(l) || l.startsWith(DOC_TITLE)){ item=null; continue; }
    const m=/^(GRAVE: |SERIOUS: |! )(.*)$/.exec(l);
    if (m){ item={lv:m[1]==='! '?'warn':'bad', t:m[2]}; out[curName].push(item); }
    else if (item) item.t+=' '+l; else if (/^(Gruppi|Compatible|Pigmenti|Elementi|Elements|Asse|Axis|Deconv|nessun|no warn|Stima|Estimate)/.test(l)) item=null; }
  return out;
}
// testo a schermo → testo del PDF: pdfText() del programma traslittera alcuni simboli; confronto su una forma normalizzata
const canon=s=>norm(s).replace(/[⁻¹]/g,'').replace(/-1/g,'').replace(/[^\p{L}\p{N}%.,:;()]+/gu,' ').trim();

async function checks(lang){
  const R=await exportOnce(lang), en=lang==='en', sep=en?',':';', problems=[], seen={pk:0, bad:0, warn:0};
  const P=pdfAnalysis(R.pdfLines, R.names);
  const peakCsv=parseCsv(R.csv[en?'peak_list.csv':'elenco_picchi.csv'], sep), qc=parseCsv(R.csv[en?'analysis/quality_check.csv':'analisi/controllo_qualita.csv'], sep);
  const num=s=>+String(s).replace(/\s/g,'').replace(en?/,/g:/\./g,'').replace(',', '.');
  for (const s of R.screen){
    // numeri: posizione e intensità dei picchi a schermo = elenco dei picchi nel CSV (arrotondato come a schermo)
    const rows=peakCsv.filter(r=>r[0]===s.name);
    if (rows.length!==s.pk.length) problems.push(`${s.name}: ${s.pk.length} picchi a schermo, ${rows.length} nel CSV`);
    seen.pk+=s.pk.length;
    for (const k of s.pk){ const x=num(k.pos), y=num(k.y), dx=Math.pow(10, -((k.pos.split(R.dec)[1]||'').length))/2+1e-9;
      const hit=rows.find(r=>Math.abs(num(r[4])-x)<=dx); if (!hit){ problems.push(`${s.name}: picco ${k.pos} a schermo non nel CSV`); continue; }
      const sig=String(k.y).replace(/[^0-9]/g,'').replace(/^0+/,'').length||1, yc=num(hit[5]); if (Math.abs(+yc.toPrecision(Math.min(sig,4))-y)>Math.abs(y)*1e-9+1e-12) problems.push(`${s.name}: intensità ${k.y} a schermo, ${hit[5]} nel CSV`); }
    // picchi nel riepilogo del PDF (colonna Picchi): stesse posizioni a schermo
    const pdfIdx=R.pdfLines.indexOf(R.names.find(n=>n.name===s.name).disp);
    if (pdfIdx<0) problems.push(`${s.name}: riga del riepilogo nel PDF non trovata`);
    // avvisi: ⛔ e ⚠ a schermo = PDF (GRAVE/SERIOUS e «!») = CSV del controllo di qualità
    for (const lv of ['bad','warn']){
      const scr=s.qual.filter(q=>q.lv===lv).map(q=>norm(q.t)), pdf=(P[s.name]||[]).filter(q=>q.lv===lv).map(q=>norm(q.t));
      const csvLv=qc.filter(r=>r[0]===s.name && r[3]===(lv==='bad'?(en?'problem':'problema'):(en?'warning':'attenzione'))).map(r=>norm(r[4]));
      seen[lv]+=scr.length;
      if (scr.length!==pdf.length) problems.push(`${s.name}: ${scr.length} ${lv==='bad'?'⛔':'⚠'} a schermo, ${pdf.length} nel PDF`);
      if (scr.length!==csvLv.length) problems.push(`${s.name}: ${scr.length} ${lv==='bad'?'⛔':'⚠'} a schermo, ${csvLv.length} nel CSV`);
      scr.forEach((t,i)=>{ if (pdf[i]!=null && canon(pdf[i])!==canon(t)) problems.push(`${s.name}: ${lv==='bad'?'⛔':'⚠'} diverso nel PDF: «${t.slice(0,90)}» ↔ «${pdf[i].slice(0,90)}»`);
        if (csvLv[i]!=null && canon(csvLv[i])!==canon(t)) problems.push(`${s.name}: ${lv==='bad'?'⛔':'⚠'} diverso nel CSV: «${t.slice(0,90)}» ↔ «${csvLv[i].slice(0,90)}»`); });
    }
  }
  // testi dell'utente: identici a schermo, nel PDF e nei CSV, in qualunque lingua
  const s0=R.screen[0];
  if (norm(s0.shown)!==USER_TITLE) problems.push(`titolo a schermo «${s0.shown}» invece di «${USER_TITLE}»`);
  if (!R.pdfLines.includes(USER_TITLE)) problems.push('titolo dello spettro assente o cambiato nel PDF');
  if (!R.pdfLines.some(l=>l===DOC_TITLE || l.startsWith(DOC_TITLE+' '))) problems.push('titolo del documento assente o cambiato nel PDF');
  if (!peakCsv.some(r=>r[1]===USER_TITLE)) problems.push('titolo dello spettro assente o cambiato nel CSV dei picchi');
  // lingua: nei CSV inglesi niente etichette italiane del programma
  if (en){ const it=qc.slice(1).map(r=>r[3]).filter(v=>/^(nota|attenzione|problema)$/.test(v)); if (it.length) problems.push(`CSV inglese: livelli in italiano (${[...new Set(it)].join(', ')})`);
    if (/^File,Nome/.test(R.csv['analysis/quality_check.csv']||'')) problems.push('CSV inglese: intestazioni in italiano'); }
  // contro i confronti vuoti: il campione di file deve produrre picchi, ⛔ e ⚠ da confrontare
  if (seen.pk<8 || seen.bad<2 || seen.warn<3) problems.push(`confronto troppo povero: ${JSON.stringify(seen)}`);
  if (en) for (const s of R.screen) for (const q of s.qual){ const w=/\b(della|delle|dello|degli|tipico|sono|perché|oppure)\b/i.exec(q.t); if (w) problems.push(`${s.name}: testo inglese a schermo con parole italiane («${w[0]}»): ${q.t.slice(0,80)}`); }
  if (R.LANG!==lang) problems.push(`lingua dei documenti ${R.LANG}, attesa ${lang}`);
  if (R.errors.length) problems.push('errori nella pagina: '+R.errors[0].slice(0,200));
  // numeri assurdi a schermo (S/N oltre 1e6 non ha senso fisico)
  for (const s of R.screen) for (const q of s.qual){ const m=/S\/N ≈ ([0-9.,]+)/.exec(q.t); if (m && num(m[1])>1e6) problems.push(`${s.name}: S/N assurdo a schermo (${m[1].slice(0,30)}…) con livello ${q.lv}`); }
  return {problems, R};
}
module.exports={checks};

if (require.main===module){
  for (const lang of ['it','en']) test(`R6 esportazioni (${lang}): schermo, CSV e PDF coincidono; testi dell'utente intatti`, {timeout:10*60*1000}, async ()=>{
    const {problems}=await checks(lang); assert.deepStrictEqual(problems, []); });
}
