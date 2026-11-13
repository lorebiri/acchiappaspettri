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

// ---- aggiunte del committente (stesso pacchetto, secondo giro) ----
const epr=(lo,hi,c,n)=>{ const L=['Field (mT)\tIntensity']; for (let i=0;i<n;i++){ const b=lo+(hi-lo)*i/(n-1), t=(b-c)/0.5; L.push(b.toFixed(5)+'\t'+(-2*t/(1+t*t)**2/0.5+0.1).toFixed(9)); } return L.join('\n'); };
// singolare e asse «rapporto area» (inglese, desktop)
test('I1 bis, singolare e asse del grafico piccolo in inglese', {timeout:5*60*1000}, async ()=>{
  const server=await B.startServer(), br=await B.launch();
  try{
    { const {ctx, p, errors}=await B.openPage(br, server, {lang:'en', desk:true});
      await load(p, dirFiles('hplc-taratura-sintetico').filter(([n])=>/06_STD6/.test(n)), 'en');
      const q=await p.evaluate(async ()=>{ await new Promise(r=>setTimeout(r,300)); return assess(files[0], viewOf(files[0])).map(o=>o.t); });
      assert.ok(q.some(t=>/^Un segnale sopra il rumore non è nell'elenco/.test(t)) && !q.some(t=>/^1 segnali/.test(t)), 'singolare: '+q.join(' | '));
      const en=await p.evaluate(()=>AcchI18n.tr(assess(files[0], viewOf(files[0])).find(o=>/^Un segnale/.test(o.t)).t));
      assert.match(en, /^One signal above the noise is not in the peak list/, en);
      await load(p, dirFiles('ftir-polietilene-sintetico'), 'en');
      const lab=await p.evaluate(async ()=>{ const seen=[], ft=CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText=function(t){ if (this.canvas && this.canvas.id==='trendCv') seen.push(String(t)); return ft.apply(this, arguments); };
        const c=mvCfg('ftir'), pr=BAND_PRESETS.ftir[0]; c.a=pr[1]; c.b=pr[2]; c.c=pr[3]; c.d=pr[4]; c.meas=pr[5]; c.preset=0; c.model='trend'; c.unit='h'; mvSave(); openTab('multi'); $('#mvInstr').value='ftir';
        mvFiles('ftir',c).forEach((f,i)=>anSet(f,'conc',[0,100,250,500,750,1000][i])); renderMulti(); await new Promise(r=>setTimeout(r,300)); return seen; });
      assert.ok(lab.includes('area ratio') && !lab.some(t=>/rapporto/.test(t)), 'asse del grafico piccolo: '+lab.join(' | '));
      assert.deepEqual(errors, []); await ctx.close(); }
  } finally { await br.close(); server.close(); }
});

// spalle ripetute: 13C a un decimale, due bande a 77,07 e 77,11 tolte dall'elenco dei picchi → stesso valore scritto «77,1»
test('I1 bis, spalle ripetute contate una volta', {timeout:5*60*1000}, async ()=>{
  const server=await B.startServer(), br=await B.launch();
  try{
    { const {ctx, p, errors}=await B.openPage(br, server, {lang:'it'});
      const L=['ppm\tIntensity']; let s=3; const r=()=>{ s=(s*16807)%2147483647; return s/2147483647-0.5; };
      for (let i=0;i<15000;i++){ const x=90-i*0.002, lz=(c,ww,hh)=>hh/(1+((x-c)/ww)**2); L.push(x.toFixed(4)+'\t'+(lz(77,0.04,100)+lz(77.07,0.01,15)+lz(77.11,0.01,15)+lz(70,0.02,50)+0.02*r()).toFixed(5)); }
      await load(p, [['cdcl3_13C.txt', L.join('\n')]]);
      const m=await p.evaluate(()=>{ const f=files[0]; f.removed=viewOf(f).peaks.filter(q=>q.x>77.05&&q.x<77.2).map(q=>q.x); f._pk=null; f._autoKey=null; return assess(f, viewOf(f)).map(o=>o.t).find(t=>/derivata seconda/.test(t))||''; });
      const at=(/ a (.*?)[…:]/.exec(m)||[])[1]||'', vals=at.split(', ');
      assert.ok(vals.length>=2 && vals.includes('77,1'), 'il caso non prova nulla: '+m);
      assert.equal(new Set(vals).size, vals.length, 'valore ripetuto: '+m);
      assert.match(m, new RegExp(vals.length===1?'una banda nascosta':vals.length+' bande nascoste'), 'conteggio diverso dai valori: '+m);
      assert.deepEqual(errors, []); await ctx.close(); }
  } finally { await br.close(); server.close(); }
});

// EPR: zone di fondo scelte, provenienza a schermo, nel CSV e nel PDF; ali della riga segnalate
test('I1 bis, EPR: zone di fondo scelte, provenienza, ali della riga', {timeout:5*60*1000}, async ()=>{
  const server=await B.startServer(), br=await B.launch();
  try{
    { const {ctx, p, errors}=await B.openPage(br, server, {lang:'it'});
      await load(p, [['riga_fuori_centro.txt', epr(300,700,340,20000)], ['riga_stretta.txt', epr(330,340,335,4096)]]);
      const r=await p.evaluate(async ()=>{ files.forEach(f=>{ f.instr='epr'; f.kind=kindOf(f); f._pk=null; }); const f=files[0], g=files[1]; cur=0; go(2); openTab('an'); refreshAll(); await new Promise(r=>setTimeout(r,300));
        const before=assess(f, viewOf(f)).map(o=>o.t), wing=assess(g, viewOf(g)).map(o=>o.t);
        anSet(f,'eprZ1a',680); anSet(f,'eprZ1b',700); refreshAll(); renderAnalysis(); await new Promise(r=>setTimeout(r,300));
        const o=techMetrics(f, viewOf(f)), after=assess(f, viewOf(f)).map(o=>o.t);
        Object.assign(S,{outPdf:true, outAnalysis:true}); const u=new Uint8Array(await (await buildPdf()).arrayBuffer());
        return {before, wing, after, head:o.head, row:o.rows.find(x=>/riga_fuori/.test(x[0])), tech:$('#anTech').innerText, csv:(analysisFiles().find(([n])=>/parametri_per_tecnica/.test(n))||['',''])[1], pdf:Array.from(u), di:eprDoubleIntegral(processed(f).xs, processed(f).ys, eprZonesOf(f)).di/(Math.PI*0.5)}; });
      assert.ok(r.before.some(t=>/ali della riga/.test(t)), 'riga fuori centro: ali non segnalate: '+r.before.join(' | '));
      assert.ok(r.wing.some(t=>/ali della riga \(forma lorentziana\) arrivano nelle finestre/.test(t)), 'lorentziana a ±10 semilarghezze: '+r.wing.join(' | '));
      assert.ok(!r.after.some(t=>/ali della riga/.test(t)), 'con la zona lontana l\'avviso deve sparire');
      assert.ok(Math.abs(r.di-1)<0.01, 'doppio integrale con la zona scelta: '+r.di);
      assert.ok(r.head.includes('Base') && /zone di fondo scelte 680,00–700,00 mT/.test(r.row[4]), JSON.stringify(r.row));
      assert.match(r.tech, /Zona di fondo 1/); assert.match(r.csv, /zone di fondo scelte 680,00–700,00 mT/);
      assert.match(pdfText(Buffer.from(r.pdf)).join(' '), /base: zone di fondo scelte 680,00–700,00 mT/);
      assert.deepEqual(errors, []); await ctx.close(); }
  } finally { await br.close(); server.close(); }
});

// XRF desktop: ⚠️ delle note della stima FP nel pannello, nel CSV e nel PDF
test('I1 bis, XRF desktop: ⚠️ delle note nel pannello, nel CSV e nel PDF', {timeout:5*60*1000}, async ()=>{
  const server=await B.startServer(), br=await B.launch();
  try{
    { const {ctx, p, errors}=await B.openPage(br, server, {lang:'it', desk:true});
      await load(p, [['B.mca', rd(path.join(EX,'xrf-lega-sintetico','BRONZO_SIMULATO_Rh40kV_SINTETICO.mca'))]]);
      const r=await p.evaluate(async ()=>{ go(2); openTab('an'); $('#secCult').open=true; const f=files[0], c=fpCfg(f); c.els=['Sn','Cu','Pb','Zn','As','S']; fpSaveCfg(f,c); refreshAll(); await new Promise(r=>setTimeout(r,800));
        const w=[...document.querySelectorAll('#anCult .fpwarn')].map(d=>({t:d.textContent, fw:getComputedStyle(d).fontWeight}));
        Object.assign(S,{outPdf:true, outAnalysis:true}); const u=new Uint8Array(await (await buildPdf()).arrayBuffer());
        return {w, raw:fpNotes(f, fpRun(f)).filter(t=>/⚠️/.test(t)).length, csv:fpCsvRows([f]).map(x=>x[x.length-1]).join(' | '), pdf:Array.from(u)}; });
      assert.ok(r.raw>=2 && r.w.length===r.raw, `note con ⚠️ ${r.raw}, nel pannello ${r.w.length}`);
      r.w.forEach(x=>{ assert.ok(/^\s*[⚠△]/.test(x.t), "segno perso nel pannello (nel desktop ⚠ diventa △): "+x.t); assert.ok(+x.fw>=600, 'avviso senza risalto'); });
      assert.ok((r.csv.match(/(^|\| )! /g)||[]).length>=r.raw-1, 'avvisi senza segno nel CSV: '+r.csv);
      assert.ok(pdfText(Buffer.from(r.pdf)).filter(l=>/^(! |AVVISO: |WARNING: )/.test(l)).length>=r.raw, 'avvisi senza segno nel PDF');
      assert.deepEqual(errors, []); await ctx.close(); }

  } finally { await br.close(); server.close(); }
});

test('PDF con font Unicode: caricato solo se serve, mai all\'avvio; č, ł, greco, ², ³ e ⁻¹ nel PDF', {timeout:5*60*1000}, async t=>{
  const server=await B.startServer(), br=await B.launch();
  try{
    const {ctx, p, errors}=await B.openPage(br, server, {lang:'it'}), asked=[]; p.on('request', q=>{ if (/DejaVuSans/.test(q.url())) asked.push(q.url()); });
    await p.reload(); await p.waitForFunction(()=>window.AcchProject && window.AcchUi); await p.evaluate(()=>{ try{ endTour(); }catch(e){} document.querySelectorAll('dialog[open]').forEach(d=>d.close()); });
    assert.deepEqual(asked, [], 'font caricato all\'avvio');
    await load(p, dirFiles('ftir-polietilene-sintetico').slice(0,1));
    await p.evaluate(async ()=>{ Object.assign(S,{outPdf:true, outAnalysis:false}); await buildPdf(); });
    assert.deepEqual(asked, [], 'font caricato per un PDF con soli caratteri WinAnsi');
    const have=fs.existsSync(path.join(B.ROOT,'vendor','fonts','DejaVuSans.ttf'));
    const r=await p.evaluate(async ()=>{ files[0].title='Vzorek č ł αβ x² y³ cm⁻¹'; Object.assign(S,{outPdf:true, outAnalysis:false, summary:true}); const u=new Uint8Array(await (await buildPdf()).arrayBuffer()); let s=''; for (let i=0;i<u.length;i+=0x8000) s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000)); return s; });
    assert.equal(asked.length, 1, 'il font va chiesto una volta, per il PDF che ne ha bisogno');
    if (!have){ t.skip('vendor/fonts/DejaVuSans.ttf assente: va aggiunto al repository (serve l\'approvazione per scaricarlo)'); return; }
    assert.match(r, /\/FontFile2/, 'font non incorporato');
    for (const cp of ['010D','0142','03B1','00B2','00B3','207B']) assert.ok(new RegExp('<'+cp+'>','i').test(r), 'manca U+'+cp+' nella mappa ToUnicode');
    assert.deepEqual(errors, []); await ctx.close();
  } finally { await br.close(); server.close(); }
});
