// XRF nel programma vero (ciclo 25, spettri SINTETICI dell'agente XRF in test/fixtures/xrf-c25):
// C5 anodo Ag su lega d'argento, A4 pochi conteggi, A5 stagno puro «spostato», CSV/PDF della stima FP, tabella FP nel pannello del desktop,
// A3 un milione di punti online e sul desktop. Il tutorial 3 deve dare gli stessi numeri di prima.
// Uso: PW_CHANNEL=chrome node --test test/validation/r5-xrf-ui.test.js
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path');
const B=require('./browser.js'), {pdfText}=require('./pdf-text.js');
const FX=path.join(B.ROOT,'test','fixtures','xrf-c25'), TUT=path.join(B.ROOT,'examples','xrf-lega-sintetico','BRONZO_SIMULATO_Rh40kV_SINTETICO.mca');
const rd=p=>fs.readFileSync(p,'utf8');

// carica un file e raccoglie ciò che vede l'utente: elementi, stima FP con gli avvisi, ipotesi, controllo del dato
async function inspect(p, name, text, setup){
  return p.evaluate(async ([name, text, setup])=>{
    files.length=0; await addEntries([{file:new File([text],name), path:name}]); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
    const f=files[files.length-1]; cur=files.length-1; if (setup){ const c=fpCfg(f); c.els=setup; fpSaveCfg(f,c); }
    const d=viewOf(f), H=xrfElements(f,d); f._fpKey=null; const R=fpRun(f);
    const strip=t=>String(t).replace(/<[^>]+>/g,'');
    const res=R&&R.Q&&R.Q.res ? Object.fromEntries(Object.entries(R.Q.res).map(([e,o])=>[e,{w:o.w, sw:o.sw, line:o.line}])) : null;
    const hy=hypotheses(f,d);
    return {els:H.els, shifted:!!H.shifted, res, notes:res?fpNotes(f,R).map(strip):[], hyp:(hy&&hy.list||[]).map(h=>h.it), qual:assess(f,d).map(o=>o.lv+': '+strip(o.t))};
  }, [name, text, setup||null]);
}

test('XRF: anodo, pochi conteggi, stagno puro, asse spostato, tutorial 3 (online, italiano)', async ()=>{
  const server=await B.startServer(), br=await B.launch();
  try{
    const {ctx, p, errors}=await B.openPage(br, server, {lang:'it'});
    // C5: lega d'argento con tubo ad argento
    for (const [f, ag] of [['C_Ag925_Aganode.mca',92.5],['C_Ag_s2.mca',92.5],['C_Ag_s3.mca',92.5],['C_Ag_s4_Ag800.mca',80]]){
      const r=await inspect(p, f, rd(path.join(FX,f)));
      assert.ok(r.res && r.res.Ag, `${f}: Ag tolto dal calcolo (${JSON.stringify(r.res)})`);
      assert.ok(Math.abs(r.res.Ag.w-ag)<2 && Math.abs(r.res.Cu.w-(100-ag))<2, `${f}: ${JSON.stringify(r.res)}`);
      assert.ok(!r.res.Mg, `${f}: Mg (picco di fuga di Ag Lα) nel calcolo`);
      assert.ok(r.notes.some(t=>/Ag è anche l'anodo del tubo/.test(t)), `${f}: manca l'avviso sull'anodo`);
    }
    // A4: pochi conteggi (picco 300–1500): niente elementi falsi «certi», niente pigmenti datanti falsi, S/N finito
    const real=['Cu','Sn','Pb','Zn','As'];
    for (const f of ['Q_low_300.mca','Q_300_s3.mca','Q_low_1500.mca','Q_1500_s2.mca','N_lowcounts_bronze.mca']){
      const r=await inspect(p, f, rd(path.join(FX,f)));
      assert.deepEqual(r.els.filter(e=>!real.includes(e)), [], `${f}: elementi falsi ${r.els}`);
      // ciclo 26: con pochi conteggi As Kα e Pb Lα coincidono; senza As Kβ libera As non entra da solo nel calcolo al posto di Pb (bronzo con Pb 5%, As 0,5%)
      if (f==='N_lowcounts_bronze.mca') assert.ok(r.res && r.res.Pb && !r.res.As, `${f}: As al posto di Pb ${JSON.stringify(r.res)}`);
      assert.ok(r.els.includes('Cu'), `${f}: Cu non trovato`);
      assert.ok(!r.hyp.some(h=>/cadmio|cobalto|Scheele|manganese/.test(h)), `${f}: ipotesi false ${r.hyp}`);
      const sn=r.qual.find(t=>/S\/N/.test(t)); assert.ok(sn && !/100[.,]000/.test(sn), `${f}: ${sn}`);
    }
    // A5: stagno puro con asse giusto
    for (const f of ['P3_pureSn.mca','R1_Sn_seed2.mca','R2_Sn_seed3.mca','R6_Sn_35kV.mca']){
      const r=await inspect(p, f, rd(path.join(FX,f)));
      assert.ok(!r.shifted && !r.qual.some(t=>/spostata/.test(t)), `${f}: dichiarato spostato: ${r.qual.join(' | ')}`);
      assert.ok(r.els.includes('Sn') && r.res && r.res.Sn.w>95, `${f}: ${r.els} ${JSON.stringify(r.res)}`);
    }
    // gli spostamenti veri del corpus restano segnalati
    for (const f of ['A09_bronzo_gain+2pc.mca','A10_bronzo_off-150eV.mca','G_bronzo_gain-2pc.mca']){
      const r=await inspect(p, f, rd(path.join(B.ROOT,'test','corpus','xrf',f)));
      assert.ok(r.qual.some(t=>/calibrazione in energia è spostata/.test(t)), `${f}: spostamento non segnalato`);
    }
    // tutorial 3: stessi numeri (86,3 / 8,3 / 5,4; con Zn e As 84,0 / 8,1 / 4,7 / 2,5 / 0,64)
    const t0=await inspect(p, 'BRONZO_SIMULATO_Rh40kV_SINTETICO.mca', rd(TUT));
    assert.deepEqual(Object.keys(t0.res).sort(), ['Cu','Pb','Sn']);
    for (const [e,w] of [['Cu',86.3],['Sn',8.3],['Pb',5.4]]) assert.equal(t0.res[e].w.toFixed(1), w.toFixed(1), 'tutorial '+e);
    const t1=await inspect(p, 'BRONZO_SIMULATO_Rh40kV_SINTETICO.mca', rd(TUT), ['Sn','Cu','Pb','Zn','As']);
    for (const [e,w,d] of [['Cu',84.0,1],['Sn',8.1,1],['Pb',4.7,1],['Zn',2.5,1],['As',0.64,2]]) assert.equal(t1.res[e].w.toFixed(d), w.toFixed(d), 'tutorial con Zn e As '+e);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await br.close(); server.close(); }
});

// CSV della stima FP (pannello e ZIP usano fpCsvRows) e riga del PDF, in italiano e in inglese
async function fpExport(br, server, lang){
  const {ctx, p, errors}=await B.openPage(br, server, {lang});
  const r=await p.evaluate(async (text)=>{
    files.length=0; await addEntries([{file:new File([text],'BRONZO_SIMULATO_Rh40kV_SINTETICO.mca'), path:'BRONZO_SIMULATO_Rh40kV_SINTETICO.mca'}]); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
    const f=files[0]; cur=0; const c=fpCfg(f); c.els=['Sn','Cu','Pb','Zn','As']; fpSaveCfg(f,c); fpRun(f);
    const rows=fpCsvRows([f]).map(r=>r.map(c=>String(csvCell(c,';')).replace(/^"|"$/g,'')));
    Object.assign(S,{outPdf:true, outAnalysis:true}); const pdf=await buildPdf(); const u=new Uint8Array(await pdf.arrayBuffer()); let s=''; for (let i=0;i<u.length;i+=0x8000) s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));
    return {rows, pdf:btoa(s)};
  }, rd(TUT));
  await ctx.close(); return {...r, pdfLines:pdfText(Buffer.from(r.pdf,'base64')), errors};
}
test('XRF: CSV e PDF della stima FP (note per elemento, numeri, atmosfera) in italiano e in inglese', async ()=>{
  const server=await B.startServer(), br=await B.launch();
  try{
    for (const lang of ['it','en']){
      const en=lang==='en', R=await fpExport(br, server, lang), H=R.rows[0], row=e=>R.rows.find(r=>r[3]===e), col=k=>H.indexOf(k);
      const cNote=H.length-1, cAtm=col(en?'Atmosphere':'Atmosfera'), cBe=col(en?'Detector Be (um)':'Be rivelatore (um)'), cIn=col(en?'Incidence angle':'Angolo ingresso');
      assert.ok(cAtm>0 && cBe>0 && cIn>0, 'colonne '+H.join('|'));
      assert.ok(!/poco sicur|uncertain/.test(row('Pb')[cNote]), `${lang}: Pb segnato poco sicuro: «${row('Pb')[cNote]}»`);
      assert.ok((en?/uncertain because of overlapping lines/:/poco sicuro per righe sovrapposte/).test(row('As')[cNote]), `${lang}: nota di As «${row('As')[cNote]}»`);
      if (en) assert.ok(!/poco sicuro|non distinguibil|righe|elementi/.test(R.rows.slice(1).map(r=>r[cNote]).join(' ')), 'note in italiano nel CSV inglese: '+R.rows.slice(1).map(r=>r[cNote]).join(' / '));
      assert.equal(row('Cu')[cBe], en?'12.5':'12,5', lang+': Be del rivelatore');
      assert.equal(row('Cu')[cAtm], en?'air':'aria', lang+': atmosfera');
      const fpLine=R.pdfLines.join(' ');
      assert.ok(en ? / · air · /.test(fpLine) : / · aria · /.test(fpLine) && !/ · air · /.test(fpLine), lang+': atmosfera nel PDF');
      assert.deepEqual(R.errors, []);
    }
  } finally { await br.close(); server.close(); }
});

test('XRF: la tabella della stima FP sta nel pannello del desktop (± e «(stima)» visibili)', async ()=>{
  const server=await B.startServer(), br=await B.launch();
  try{
    for (const width of [1093, 1366]){
      const {ctx, p}=await B.openPage(br, server, {desk:true});
      await p.setViewportSize({width, height:768});
      await p.evaluate(async t=>{ await addEntries([{file:new File([t],'B.mca'),path:'B.mca'}]); document.querySelectorAll('dialog[open]').forEach(d=>d.close()); go(2); openTab('an'); $('#secCult').open=true; const f=files[0], c=fpCfg(f); c.els=['Sn','Cu','Pb','Zn','As']; fpSaveCfg(f,c); refreshAll(); }, rd(TUT));
      await p.waitForSelector('#anCult .fptab');
      const r=await p.evaluate(()=>{ const w=document.querySelector('#anCult .fptab').closest('.areawrap'); return {cw:w.clientWidth, sw:w.scrollWidth}; });
      assert.ok(r.sw<=r.cw+1, `${width}px: tabella larga ${r.sw}px in ${r.cw}px`);
      await ctx.close();
    }
  } finally { await br.close(); server.close(); }
});

// cromatogramma SINTETICO con rumore, 1 milione di punti
function bigChrom(n){ let s=5; const rnd=()=>{ s=(s*16807)%2147483647; return s/2147483647-0.5; }; const L=['Time (min)\tSignal (mAU)'];
  for (let i=0;i<n;i++){ const t=20*i/(n-1); let y=0.5+0.05*rnd(); for (const [c,h,w] of [[3,50,0.01],[5,200,0.02],[12,80,0.05]]) y+=h*Math.exp(-0.5*((t-c)/w)**2); L.push(t.toFixed(6)+'\t'+y.toFixed(5)); }
  return L.join('\n'); }
test('A3: un milione di punti con rumore, online e desktop: picchi trovati, nessun errore', {timeout:600000}, async ()=>{
  const server=await B.startServer(), br=await B.launch(), text=bigChrom(1_000_000);
  try{
    for (const desk of [false, true]){
      const {ctx, p, errors}=await B.openPage(br, server, {desk});
      const r=await p.evaluate(async t=>{ let err=null; try{ await addEntries([{file:new File([t],'grande.txt'),path:'grande.txt'}]); document.querySelectorAll('dialog[open]').forEach(d=>d.close()); go(2); renderPreview(); }catch(e){ err=String(e); }
        const f=files[0]; return {err, n:f&&f.xs.length, peaks:f?viewOf(f).peaks.map(q=>q.x):[]}; }, text);
      assert.equal(r.err, null, (desk?'desktop':'online')+': '+r.err);
      assert.equal(r.n, 1_000_000);
      for (const c of [3,5,12]) assert.ok(r.peaks.some(x=>Math.abs(x-c)<0.05), `${desk?'desktop':'online'}: picco a ${c} non trovato (${r.peaks})`);
      assert.deepEqual(errors, [], (desk?'desktop':'online')+': errori nella pagina');
      await ctx.close();
    }
  } finally { await br.close(); server.close(); }
});
