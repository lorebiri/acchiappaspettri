// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// R5 (browser), tappa I1 di 3.0.0, pacchetto «import»: BASSI HPLC del ciclo 26 e testi del ciclo 25, online e desktop.
// Dati SINTETICI generati qui. Uso: PW_CHANNEL=chrome node --test test/validation/r5-import-i1-ui.test.js
// Prova del prima: ACCH_INDEX=<index.html di c3e22c4> deve fallire.
'use strict';
const test=require('node:test'), assert=require('node:assert'), path=require('path');
const B=require('./browser.js'), JSZip=require(path.join(B.ROOT,'node_modules','jszip'));
let s=5; const rnd=()=>{ s=(s*16807)%2147483647; return s/2147483647-0.5; };
const g=(t,c,w)=>Math.exp(-0.5*((t-c)/w)**2);
const T=Array.from({length:3000},(_,i)=>i*0.004);
const chrom=(hdr,k)=>hdr+'\n'+T.map(t=>t.toFixed(4)+','+(0.5+0.01*rnd()+k*g(t,5,0.05)).toFixed(4)).join('\n');
const F={
  dueSegnali: chrom('Signal 1: DAD1 A, Sig=254,4 Ref=360,100\nSignal 2: DAD1 B, Sig=280,4 Ref=360,100\nTime (min),Value (mAU)', 80),
  conflitto: chrom('DAD1 A, Sig=254,4 Ref=off\nTime (min),Value (mAU)', 80),
  canaliTabella: chrom('DAD1 A, Sig=254,4 Ref=off\nTime (min),Value (mAU)', 80)+'\n\n'+chrom('DAD1 B, Sig=280,4 Ref=off\nTime (min),Value (mAU)', 30)+'\n\nPeak table\nRT (min),Area\n'+[[2.1,120.5],[5.0,980.2],[8.0,433.9],[9.5,55.1],[11.2,12.3]].map(r=>r.join(',')).join('\n')+'\n',
  // un picco solo con coda: semiampiezza 0,03 min a sinistra, 0,15 a destra (fattore di coda circa 3)
  coda: 'Time (min),Signal (mAU)\n'+T.map(t=>t.toFixed(4)+','+(0.5+0.01*rnd()+80*(t<5?g(t,5,0.03):g(t,5,0.15))).toFixed(4)).join('\n'),
  ftirDue: (()=>{ const ir=Array.from({length:1801},(_,i)=>{ const x=4000-i*2; return [x, 0.05+0.8*g(x,1730,8)]; }); return ir.map(([x,y])=>x+'\t'+y.toFixed(5)).join('\n')+'\n\n'+ir.map(([x,y])=>x+'\t'+(y*0.5).toFixed(5)).join('\n')+'\n'; })(),
};
async function run(p, list, fn){
  return p.evaluate(async ([list, fn])=>{
    const T=[]; const ot=window.toast; window.toast=t=>{ T.push(String(t)); return ot(t); };
    await addEntries(list.map(([name,data,path])=>({file:new File([data],name), path:path||name}))); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
    const as=f=>assess(f, viewOf(f)).map(o=>o.lv+': '+String(o.t).replace(/<[^>]+>/g,''));
    return {toasts:T, files:files.map(f=>({path:f.path, disp:dispTitle(f), chan:chanOf(f), assess:as(f)})), extra: fn ? await (new Function('return ('+fn+')'))()() : null};
  }, [list, fn ? fn.toString() : null]);
}
let server, browser;
test.before(async ()=>{ server=await B.startServer(); browser=await B.launch(); });
test.after(async ()=>{ await browser.close(); server.close(); });

for (const desk of [false, true]){ const W=desk?'desktop':'online';
  test(`${W}: due segnali nell'intestazione e un solo blocco danno un avviso`, async ()=>{
    const {ctx,p,errors}=await B.openPage(browser, server, {desk}); const r=await run(p, [['STD1.csv',F.dueSegnali]]);
    assert.ok(r.files[0].assess.some(t=>/^warn: L'intestazione nomina 2 segnali \(«DAD1A 254 nm», «DAD1B 280 nm»\), ma nel file c'è un solo blocco/.test(t)), r.files[0].assess.join('\n'));
    assert.deepStrictEqual(errors, []); await ctx.close(); });
  test(`${W}: canale del nome diverso da quello dell'intestazione segnalato; nessun avviso se coincidono`, async ()=>{
    const {ctx,p,errors}=await B.openPage(browser, server, {desk}); const r=await run(p, [['STD1_DAD1B.csv',F.conflitto],['STD2_DAD1A.csv',F.conflitto]]);
    assert.ok(r.files[0].assess.some(t=>/^warn: Il nome del file indica il canale «DAD1B», l'intestazione «DAD1A 254 nm»/.test(t)), r.files[0].assess.join('\n'));
    assert.ok(!r.files[1].assess.some(t=>/Il nome del file indica/.test(t)), 'falso conflitto: '+r.files[1].assess.join('\n'));
    assert.deepStrictEqual(errors, []); await ctx.close(); });
  test(`${W}: nomi uguali in due sequenze distinti dalla cartella, non da (1)/(5)`, async ()=>{
    const {ctx,p,errors}=await B.openPage(browser, server, {desk}), d=chrom('Time (min),Signal (mAU)', 40);
    const L=['SEQ1/STD1.D/DAD1A.CSV','SEQ1/STD2.D/DAD1A.CSV','SEQ2/STD1.D/DAD1A.CSV','SEQ2/STD2.D/DAD1A.CSV','SEQ2/STD3.D/DAD1A.CSV'].map(q=>['DAD1A.CSV',d+'\n'+q.length,q]);
    const r=await run(p, L), disp=Object.fromEntries(r.files.map(f=>[f.path,f.disp]));
    assert.deepStrictEqual(disp, {'SEQ1/STD1.D/DAD1A.CSV':'DAD1A.CSV (SEQ1/STD1.D)','SEQ1/STD2.D/DAD1A.CSV':'DAD1A.CSV (SEQ1/STD2.D)','SEQ2/STD1.D/DAD1A.CSV':'DAD1A.CSV (SEQ2/STD1.D)','SEQ2/STD2.D/DAD1A.CSV':'DAD1A.CSV (SEQ2/STD2.D)','SEQ2/STD3.D/DAD1A.CSV':'DAD1A.CSV (STD3.D)'});
    assert.deepStrictEqual(errors, []); await ctx.close(); });
  test(`${W}: la tabella riassuntiva non è contata fra i canali (toast e «Controllo del dato»)`, async ()=>{
    const {ctx,p,errors}=await B.openPage(browser, server, {desk}); const r=await run(p, [['DAD.csv',F.canaliTabella]]);
    const tt=r.toasts.join(' | '); assert.match(tt, /contiene più di un canale: ho letto il canale «DAD1A 254 nm», altre 3000 righe/, tt);
    const a=r.files[0].assess.join('\n'); assert.match(a, /blocco 1 di 2, il più lungo\); gli altri blocchi \(3000 righe\)/, a); assert.match(a, /Altre 5 righe di numeri, più brevi dei canali/, a); assert.doesNotMatch(a, /fuori dal blocco principale/, a);
    assert.deepStrictEqual(errors, []); await ctx.close(); });
  test(`${W}: fattore di coda > 2 segnalato anche con un picco solo`, async ()=>{
    const {ctx,p,errors}=await B.openPage(browser, server, {desk}); const r=await run(p, [['CODA.csv',F.coda]], ()=>{ const f=files[0], v=viewOf(f), up=upData(processed(f)); return chromMetrics(processed(f).xs, up.y, v.peaks.map(q=>({x:q.x}))).map(c=>c.tailing); });
    assert.ok(r.extra.length===1 && r.extra[0]>2, 'il dato sintetico deve avere un picco con coda > 2: '+r.extra);
    assert.ok(r.files[0].assess.some(t=>/^warn: 1 picco con fattore di coda > 2/.test(t)), r.files[0].assess.join('\n'));
    assert.deepStrictEqual(errors, []); await ctx.close(); });
  test(`${W}: due scansioni FTIR: il «Controllo del dato» non parla di canale`, async ()=>{
    const {ctx,p,errors}=await B.openPage(browser, server, {desk}); const r=await run(p, [['FTIR.txt',F.ftirDue]]);
    const a=r.files[0].assess.join('\n'); assert.match(a, /secondo blocco di dati sullo stesso asse \(1801 righe\), per esempio un'altra scansione/, a); assert.doesNotMatch(a, /canale/, a); assert.doesNotMatch(a, /fuori dal blocco principale/, 'il secondo blocco contato anche come tabella: '+a);
    assert.deepStrictEqual(errors, []); await ctx.close(); });
}

test('CSV dei picchi: un nome dalla libreria personale («@cTEST1») non è «proposta dalla banca dati», in italiano e in inglese', async ()=>{
  for (const lang of ['it','en']){
    const {ctx,p,errors}=await B.openPage(browser, server, {lang});
    const b64=await p.evaluate(async d=>{ LIB.push({id:'cTEST1',i:'hplc',a:4.9,b:5.1,n:'Caffeina'}); saveLib();
      await addEntries([{file:new File([d],'STD1.csv'),path:'STD1.csv'}]); document.querySelectorAll('dialog[open]').forEach(q=>q.close());
      const f=files[0], v=viewOf(f), pk=v.peaks.find(q=>Math.abs(q.x-5)<0.05); f.labels[lblKey(pk.x)]='@cTEST1'; const p8=v.peaks.find(q=>Math.abs(q.x-5)>0.5); if (p8) f.labels[lblKey(p8.x)]='scritto da me'; persist(f); resetCaches();
      Object.assign(S,{csvPeaks:true, showPeaks:true}); const z=await buildZip(); const u=new Uint8Array(await z.arrayBuffer()); let s=''; for (let i=0;i<u.length;i+=0x8000) s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000)); return btoa(s); },
      chrom('Time (min),Signal (mAU)', 80).replace(/\n(\d)/g,(m,c)=>m));
    const Z=await JSZip.loadAsync(Buffer.from(b64,'base64')); let txt='';
    for (const k of Object.keys(Z.files)) if (/\.csv$/.test(k)){ const t=await Z.file(k).async('string'); if (/Caffeina/.test(t)) txt+=t; }
    const row=txt.split(/\r?\n/).find(l=>/Caffeina/.test(l))||'';
    assert.ok(row, lang+': manca la riga del picco con il nome della libreria');
    if (lang==='it'){ assert.match(row, /dalla libreria personale/, row); assert.doesNotMatch(row, /banca dati/, row); }
    else { assert.match(row, /from the personal library/, row); assert.doesNotMatch(row, /database/, row); }
    assert.doesNotMatch(txt, /@cTEST1|cTEST1/, 'codice interno della libreria nel CSV');
    assert.deepStrictEqual(errors, []); await ctx.close(); }
});

test('versione inglese: gli avvisi nuovi del «Controllo del dato» sono tradotti', async ()=>{
  const {ctx,p,errors}=await B.openPage(browser, server, {lang:'en'}), out=[];
  for (const [n,d] of [['STD1.csv',F.dueSegnali],['STD1_DAD1B.csv',F.conflitto],['DAD.csv',F.canaliTabella],['FTIR.txt',F.ftirDue]]){
    out.push(await p.evaluate(async ([n,d])=>{ files.length=0; cur=-1; await addEntries([{file:new File([d],n),path:n}]); document.querySelectorAll('dialog[open]').forEach(q=>q.close());
      cur=0; go(2); openTab('an'); renderAnalysis(); await new Promise(q=>setTimeout(q,400)); return document.querySelector('#anQual').innerText; }, [n,d])); }
  const t=out.join('\n');
  assert.match(t, /The header names 2 signals/); assert.match(t, /The file name indicates channel «DAD1B», the header «DAD1A 254 nm»/);
  assert.match(t, /Another 5 rows of numbers, shorter than the channels/); assert.match(t, /for example another scan or another measurement/);
  assert.doesNotMatch(t, /intestazione|segnali|righe di numeri|un'altra scansione/, 'resta testo italiano:\n'+t);
  assert.deepStrictEqual(errors, []); await ctx.close();
});
