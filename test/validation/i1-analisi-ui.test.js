// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Tappa I1, pacchetto «analisi» (BASSI del ciclo 26 e voci 2.2.1): pendenza con l'unità di x, riga di Mandel, pagine del PDF,
// CSV della retta, LOD = 0, S/N, piatti teorici, riepilogo inglese, EPR/NMR, XRF, PDF (cm⁻¹, ∞, √).
// Tutti i dati sono SINTETICI (examples/, test/fixtures/xrf-c27, spettri costruiti qui).
// Uso: PW_CHANNEL=chrome node --test test/validation/i1-analisi-ui.test.js
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path');
const B=require('./browser.js'), {pdfText}=require('./pdf-text.js');
const EX=path.join(B.ROOT,'examples'), rd=p=>fs.readFileSync(p,'utf8');
const dirFiles=d=>fs.readdirSync(path.join(EX,d)).sort().map(n=>[n, rd(path.join(EX,d,n))]);
const pages=u8=>(Buffer.from(u8).toString('latin1').match(/\/Type\s*\/Page\b(?!s)/g)||[]).length;

async function load(p, list, lang){
  await p.evaluate(async ([L, lang])=>{ files.length=0; if (lang){ S.lang=lang; saveS(); } await addEntries(L.map(([n,t])=>({file:new File([t],n), path:n}))); document.querySelectorAll('dialog[open]').forEach(d=>d.close()); }, [list, lang||null]);
}
// tutorial 1: indice di carbonile, ore e unità «h»
async function tutorial1(p){
  return p.evaluate(async ()=>{ const c=mvCfg('ftir'), pr=BAND_PRESETS.ftir[0]; c.a=pr[1]; c.b=pr[2]; c.c=pr[3]; c.d=pr[4]; c.meas=pr[5]; c.preset=0; c.model='trend'; c.unit='h'; mvSave(); if (window.AcchWebShow) AcchWebShow(); openTab('multi'); $('#mvInstr').value='ftir';
    mvFiles('ftir',c).forEach((f,i)=>anSet(f,'conc',[0,100,250,500,750,1000][i])); renderMulti(); await new Promise(r=>setTimeout(r,200));
    Object.assign(S,{outPdf:true, outAnalysis:true, summary:true}); renderSummary(); await new Promise(r=>setTimeout(r,200));   // il traduttore lavora dopo le modifiche del DOM
    const sum=$('#sumList').innerText, est=+(/(\d+) (pagine|pages)/.exec(sum)||[])[1];
    const u=new Uint8Array(await (await buildPdf()).arrayBuffer());
    return {screen:$('#mvOut').innerText, csv:mvCsvRows('ftir').map(r=>r.join('|')).join('\n'), sum, est, pdf:Array.from(u)}; });
}
// tutorial 2: taratura HPLC
async function tutorial2(p){
  return p.evaluate(async ()=>{ const c=mvCfg('hplc'); c.a=3.9; c.b=4.5; c.meas='area'; c.model='line'; c.unit='mg/L'; mvSave(); if (window.AcchWebShow) AcchWebShow(); openTab('multi'); $('#mvInstr').value='hplc';
    mvFiles('hplc',c).forEach((f,i)=>{ if (i<6) anSet(f,'conc',[0.5,1,2,5,10,20][i]); if (i===6) anSet(f,'role','blank'); if (i===7){ anSet(f,'role','qc'); anSet(f,'conc',8); } }); renderMulti(); await new Promise(r=>setTimeout(r,200));
    Object.assign(S,{outPdf:true, outAnalysis:true, summary:true}); renderSummary(); await new Promise(r=>setTimeout(r,200));   // il traduttore lavora dopo le modifiche del DOM
    const sum=$('#sumList').innerText, est=+(/(\d+) (pagine|pages)/.exec(sum)||[])[1];
    const u=new Uint8Array(await (await buildPdf()).arrayBuffer());
    return {screen:$('#mvOut').innerText, csv:mvCsvRows('hplc'), sum, est, pages:(new TextDecoder('latin1').decode(u).match(/\/Type\s*\/Page\b(?!s)/g)||[]).length}; });
}

test('generale: pendenza con l\'unità, Mandel, pagine del PDF, CSV della retta, riepilogo (online e desktop, IT ed EN)', {timeout:15*60*1000}, async ()=>{
  const server=await B.startServer(), br=await B.launch();
  try{
    for (const [lang, desk] of [['it',false],['en',true]]){
      const {ctx, p, errors}=await B.openPage(br, server, {lang, desk}), en=lang==='en', tag=`${lang}${desk?' desktop':''}`;
      await load(p, dirFiles('ftir-polietilene-sintetico'), lang);
      const t1=await tutorial1(p);
      assert.match(t1.screen, en?/Slope [^\n]* per h · R²/:/Pendenza [^\n]* per h · R²/, tag+': pendenza a schermo');
      assert.match(t1.csv, en?/Trend\|slope\|[^\n]*\|per h\|R²/:/Andamento\|pendenza\|[^\n]*\|per h\|R²/, tag+': unità di x nella pendenza del CSV');
      assert.equal(t1.est, pages(t1.pdf), `${tag}: pagine annunciate ${t1.est}, nel PDF ${pages(t1.pdf)} (${t1.sum})`);
      const txt=pdfText(Buffer.from(t1.pdf)).join(' ');
      if (en){ assert.ok(!/area negativa|Indice di carbonile/.test(txt), 'PDF inglese: note delle misure di banda in italiano'); assert.match(txt, /negative or zero area/); assert.match(txt, /Carbonyl index/); }
      assert.ok(txt.includes('per h'), tag+': PDF senza «per h»');

      await load(p, dirFiles('hplc-taratura-sintetico'), lang);
      const t2=await tutorial2(p);
      assert.equal(t2.est, t2.pages, `${tag}: pagine annunciate ${t2.est}, nel PDF ${t2.pages}`);
      if (en){ assert.match(t2.screen, /Mandel linearity test: PG = [\d.]+ vs F\(99%\) = [\d.]+ → .*the line is adequate/); assert.ok(!/Test di linearità|\bcontro\b|la retta è adeguata/.test(t2.screen), 'riga di Mandel in italiano');
        assert.match(t2.sum, /plots in English/); assert.ok(!/inglese|italiano/.test(t2.sum), 'lingua dei grafici in italiano nel riepilogo inglese'); }
      const line=t2.csv.find(r=>r[0]===(en?'Line':'Retta')), k=line.indexOf(en?'95% CI of a (intercept)':'IC95 di a (intercetta)');
      assert.ok(k>0 && /^-?[\d.,]+$/.test(String(line[k+1])) && /^-?[\d.,]+$/.test(String(line[k+2])), `${tag}: IC dell'intercetta non in due celle numeriche: ${line.slice(k,k+3)}`);
      const csvTxt=await p.evaluate(()=>mvCsvRows('hplc').map(r=>r.map(c=>csvCell(String(c),';')).join(';')).join('\n'));
      assert.ok(!/'-|\d \/ /.test(csvTxt), tag+': cella «\'-… / …» nel CSV');
      if (en) assert.ok(t2.csv.some(r=>/^control; recovery/.test(r[r.length-1]||'')) && !csvTxt.includes('controllo'), 'ruolo «controllo» non tradotto');
      assert.deepEqual(errors, [], tag);
      await ctx.close();
    }
  } finally { await br.close(); server.close(); }
});

// retta perfetta: picchi gaussiani senza rumore, area esattamente proporzionale alla concentrazione
const chrom=(h, noise)=>{ let s=7; const r=()=>{ s=(s*16807)%2147483647; return s/2147483647-0.5; }; const L=['Time (min),Signal (mAU)']; for (let i=0;i<=1500;i++){ const t=i*0.004; L.push(t.toFixed(3)+','+(h*Math.exp(-0.5*((t-3)/0.05)**2)+(noise?noise*r():0)).toFixed(9)); } return L.join('\n'); };
test('LOD = 0 con una retta perfetta: avviso a schermo, nel CSV e nel PDF; S/N senza «≈ >»; piatti teorici in inglese', {timeout:5*60*1000}, async ()=>{
  const server=await B.startServer(), br=await B.launch();
  try{
    for (const lang of ['it','en']){
      const {ctx, p, errors}=await B.openPage(br, server, {lang});
      await load(p, [1,2,4,8].map(k=>[`STD_${k}.csv`, chrom(10*k, 0)]), lang);
      const r=await p.evaluate(async ()=>{ const c=mvCfg('hplc'); c.a=2.6; c.b=3.4; c.meas='area'; c.model='line'; c.unit='mg/L'; mvSave(); if (window.AcchWebShow) AcchWebShow(); openTab('multi'); $('#mvInstr').value='hplc';
        mvFiles('hplc',c).forEach((f,i)=>anSet(f,'conc',[1,2,4,8][i])); renderMulti(); await new Promise(r=>setTimeout(r,200));
        const cal=mvCalib(mvTable('hplc')); cur=0; go(2); openTab('an'); refreshAll(); await new Promise(r=>setTimeout(r,300));
        return {lod:cal.lod, screen:$('#mvOut').innerText, csv:mvCsvRows('hplc').map(r=>r.map(c=>csvCell(String(c),'|')).join('|')).join('\n'), q:assess(files[0], viewOf(files[0])).map(o=>o.t), tech:$('#anTech').innerText}; });
      assert.ok(Math.abs(r.lod)<1e-6, 'il caso non è una retta perfetta: LOD '+r.lod);
      assert.match(r.screen, lang==='en'?/lie exactly on the line/:/stanno esattamente sulla retta/, lang+': nessun avviso a schermo');
      assert.match(r.csv, lang==='en'?/Warning\|The standards lie exactly/:/Avviso\|I punti degli standard/, lang+': nessun avviso nel CSV');
      assert.ok(!r.q.some(t=>/≈ >/.test(t)), 'S/N «≈ >»: '+r.q.join(' | '));
      if (lang==='en') assert.ok(!/Piatti teorici/.test(r.tech) && /Theoretical plates N = 5.54/.test(r.tech), 'piatti teorici non tradotti: '+r.tech.slice(0,200));
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  } finally { await br.close(); server.close(); }
});

// NMR SINTETICO: lorentziane in ppm, un picco negativo a 2,10 ppm
const nmr=(neg)=>{ const L=['ppm\tIntensity']; let s=3; const r=()=>{ s=(s*16807)%2147483647; return s/2147483647-0.5; };
  for (let i=0;i<8000;i++){ const x=10-i*0.00125, lz=(c,w,h)=>h/(1+((x-c)/w)**2); L.push(x.toFixed(5)+'\t'+(lz(7.26,0.004,100)+lz(3.5,0.004,60)+(neg?lz(2.10,0.004,-40):0)+0.05*r()).toFixed(5)); } return L.join('\n'); };
test('EPR, NMR, dati calcolati: picco negativo, «2H» nel nome, scala negativa (GIAO), bastoncini', {timeout:5*60*1000}, async ()=>{
  const server=await B.startServer(), br=await B.launch();
  try{
    const {ctx, p, errors}=await B.openPage(br, server, {lang:'it'});
    await load(p, [['campione_neg_1H.txt', nmr(true)], ['estratto_2H.txt', nmr(false)], ['campione_2H_NMR.txt', nmr(false)]]);
    const r=await p.evaluate(()=>files.map(f=>({n:f.name, instr:f.instr, nuc:f.nuc, q:assess(f, viewOf(f)).map(o=>o.lv+': '+o.t)})));
    const neg=r.find(o=>o.n==='campione_neg_1H.txt');
    assert.equal(neg.instr, 'nmr'); assert.ok(neg.q.some(t=>/^warn: Picco negativo a 2,10 ppm/.test(t)), 'picco negativo senza avviso: '+neg.q.join(' | '));
    assert.ok(!r.find(o=>o.n==='estratto_2H.txt').q.some(t=>/negativ/.test(t)), 'avviso di picco negativo senza picco negativo');
    assert.equal(r.find(o=>o.n==='estratto_2H.txt').nuc, '1H', '«2H» nel nome (durata) letto come deuterio');
    assert.equal(r.find(o=>o.n==='campione_2H_NMR.txt').nuc, '2H', '«2H NMR» nel nome non riconosciuto');
    // GIAO: schermature σ (ppm), δ = 31,8 − σ con la scala −1 (#axA è un campo numerico: il valore si assegna con il punto)
    const sig=['sigma\tI']; for (let i=0;i<3000;i++){ const x=20+i*0.004; sig.push(x.toFixed(4)+'\t'+(100/(1+((x-24.54)/0.01)**2)+50/(1+((x-28.3)/0.01)**2)).toFixed(5)); }
    await load(p, [['giao_sigma.txt', sig.join('\n')]]);
    const g=await p.evaluate(()=>{ const f=files[0]; f.instr='nmr'; cur=0; anSet(f,'calc',true); go(2); openTab('proc'); refreshAll(); $('#axB').value='-1'; $('#axA').value='31.8'; $('#axApply').click(); const P=processed(f), d=viewOf(f); return {ecal:f.ecal, lo:Math.min(P.xs[0],P.xs[P.xs.length-1]), hi:Math.max(P.xs[0],P.xs[P.xs.length-1]), pk:d.peaks.map(q=>+q.x.toFixed(2))}; });
    assert.deepEqual(g.ecal, {a:31.8, b:-1}, 'scala negativa rifiutata'); assert.ok(Math.abs(g.lo-(31.8-32))<0.01 && Math.abs(g.hi-11.8)<0.01, JSON.stringify(g));
    assert.ok(g.pk.includes(7.26) && g.pk.includes(3.5), 'picchi dopo δ = σref − σ: '+g.pk);
    // bastoncini DFT: 120 frequenze con passo irregolare, senza «Dato calcolato», e righe isolate tra zeri con 300 punti
    const st=['cm-1\tIR']; let s=5; const rr=()=>{ s=(s*16807)%2147483647; return s/2147483647; }; let x=400; for (let i=0;i<120;i++){ x+=rr()<0.3?rr()*200:rr()*15+0.5; st.push(x.toFixed(2)+'\t'+(rr()*300).toFixed(2)); }
    const tri=['cm-1\tIR']; for (let i=0;i<300;i++) tri.push((400+i*10)+'\t'+(i%3===1?(50+i).toFixed(1):'0'));
    await load(p, [['dft_freq.txt', st.join('\n')], ['dft_tri.txt', tri.join('\n')]]);
    const q=await p.evaluate(()=>files.map(f=>assess(f, viewOf(f)).map(o=>o.lv+': '+o.t)));
    q.forEach((a,i)=>assert.ok(a.some(t=>/^warn: Sembrano bastoncini/.test(t)), `bastoncini ${i} senza avviso: ${a.join(' | ')}`));
    // gli spettri veri degli esempi non sono bastoncini
    await load(p, dirFiles('ftir-polietilene-sintetico').slice(0,1).concat(dirFiles('hplc-taratura-sintetico').slice(0,1)));
    const q2=await p.evaluate(()=>files.map(f=>assess(f, viewOf(f)).map(o=>o.t)));
    q2.forEach(a=>assert.ok(!a.some(t=>/bastoncini/.test(t)), 'falso allarme bastoncini'));
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await br.close(); server.close(); }
});

test('XRF: As da solo con pochi conteggi, «1 warning», aria/elio/vuoto, PDF con cm⁻¹, ∞ e √', {timeout:5*60*1000}, async ()=>{
  const server=await B.startServer(), br=await B.launch();
  try{
    const {ctx, p, errors}=await B.openPage(br, server, {lang:'it'}), FX=path.join(B.ROOT,'test','fixtures');
    const note=async (name, text)=>{ await load(p, [[name, text]]); return p.evaluate(()=>{ const f=files[0]; cur=0; f._fpKey=null; const R=fpRun(f); return R ? fpNotes(f,R).join(' | ') : ''; }); };
    for (const n of ['B_300_s3.mca','B_300_s8.mca']) assert.match(await note(n, rd(path.join(FX,'xrf-c27',n))), /As non distinguibile da Pb/, n);
    assert.ok(!/non distinguibile da Pb/.test(await note('B.mca', rd(path.join(EX,'xrf-lega-sintetico','BRONZO_SIMULATO_Rh40kV_SINTETICO.mca')))), 'tutorial 3 (con Pb): avviso falso');
    assert.ok(!/non distinguibile da Pb/.test(await note('B_CuSnAs_noPb.mca', rd(path.join(FX,'xrf-c25','B_CuSnAs_noPb.mca')))), 'As con molti conteggi: avviso falso');
    // PDF: «cm⁻¹» con l'esponente vero, ∞ e √ leggibili
    const r=await p.evaluate(()=>{ const out={map:pdfText('σ = √(n + 2·f), ∞ · 1650 cm⁻¹')}; const doc=new window.jspdf.jsPDF({unit:'mm'}), calls=[]; const t0=doc.text.bind(doc); doc.text=function(t,x,y){ calls.push([t, doc.getFontSize(), y]); return t0(t,x,y); }; pdfSup(doc); doc.setFontSize(10); doc.text(pdfText('1650 cm⁻¹'), 10, 20); out.calls=calls; return out; });
    assert.ok(!r.map.includes('?') && /sqrt/.test(r.map) && /inf/.test(r.map), r.map);
    assert.ok(r.calls.some(([t,fs,y])=>t==='-1' && fs<10 && y<20) && r.calls.some(([t])=>t==='1650 cm'), 'esponente di cm⁻¹: '+JSON.stringify(r.calls));
    assert.deepEqual(errors, []);
    await ctx.close();
    // inglese, desktop: conteggio degli avvisi al singolare e atmosfera tradotta
    const D=await B.openPage(br, server, {lang:'en', desk:true});
    await load(D.p, [['B.mca', rd(path.join(EX,'xrf-lega-sintetico','BRONZO_SIMULATO_Rh40kV_SINTETICO.mca'))]]);
    const e=await D.p.evaluate(async ()=>{ go(2); openTab('an'); $('#secCult').open=true; const f=files[0], c=fpCfg(f); c.els=['Sn','Cu','Pb','Zn','As']; fpSaveCfg(f,c); refreshAll(); await new Promise(r=>setTimeout(r,800)); return {sq:$('#sumQual').textContent, atm:[...document.querySelectorAll('#fpAtm option')].map(o=>o.textContent)}; });
    assert.ok(!/1 warnings|1 problems/.test(e.sq), e.sq);
    assert.deepEqual(e.atm, ['air','helium','vacuum']);
    assert.deepEqual(D.errors, []);
    await D.ctx.close();
  } finally { await br.close(); server.close(); }
});
