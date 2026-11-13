// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Tappa I4 nella pagina vera, online e desktop (finto Tauri): librerie dei picchi per strumento e tipo di campione con le pendenze HPLC.
// Percorso del committente ×3 (importa la libreria da file, carica un cromatogramma Agilent 1260, libreria proposta, concentrazioni
// marcate «senza controllo del giorno», CSV e PDF dalla finestra Esporta con la provenienza), libreria di un altro strumento mai usata
// senza avviso, pendenze salvate dopo una taratura, «Aggiungi alla libreria», progetto con la libreria incorporata, cartelle condivise,
// scritture contemporanee e copie di conflitto. Cromatogrammi SINTETICI (test/validation/i4-dati.js).
// Uso: PW_CHANNEL=chrome node --test test/validation/i4-librerie-ui.test.js
'use strict';
const {describe, it, before, after}=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path');
const B=require('./browser.js'), {openDesk}=require('./tauri-mock.js'), D=require('./i4-dati.js'), {pdfText}=require('./pdf-text.js');
const JSZip=require(path.join(B.ROOT,'node_modules','jszip'));
const BOZZA=path.join(B.ROOT,'examples','librerie','saliva-hplc-dad220.bozza.json');
const LIBNAME='Agilent 1260 Infinity · DAD — saliva';
// concentrazioni vere (mM) e pendenze della bozza (mAU·s per mM): creatinina, acido urico, tirosina
const TRUE={Creatinine:[3.561, 9876, 0.0227], 'Uric acid':[5.358, 12773, 0.15], Tyrosine:[7.476, 16717, 0.05]};
const sal=(o)=>D.chrom(Object.assign({sample:'SAL_03', method:'C:\\Chem32\\1\\METHODS\\ICCOM-SAL-RP220.M', peaks:Object.values(TRUE).map(([t,b,c])=>({t, area:b*c}))}, o||{}));
const AcchChannelsWl=t=>require(path.join(B.ROOT,'app','channels-core.js')).parseChannel(t).wl;
const closeAll=p=>p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));

async function importBozza(o, desk){
  if (desk){ await o.p.evaluate(t=>{ window.__mock.files['/utente/Documenti/saliva-hplc-dad220.bozza.json']=t; window.__mock.pick.pick_open={path:'/utente/Documenti/saliva-hplc-dad220.bozza.json', name:'saliva-hplc-dad220.bozza.json'}; }, fs.readFileSync(BOZZA,'utf8')); }
  await o.p.evaluate(()=>AcchLibUi.openManager());
  await o.p.waitForSelector('#lmImport');
  if (desk) await o.p.click('#lmImport'); else await o.p.setInputFiles('#lmFile', BOZZA);
  await o.p.waitForFunction(n=>AcchLibUi.items.some(it=>it.lib && it.lib.name===n), LIBNAME);
  await closeAll(o.p);
}
// finestra al caricamento: tipo di campione e conferma (l'evento «close» arriva dopo il clic)
async function confirmLoad(o, st, name){ if (st!=null){ await o.p.fill('#lpSt', st); await o.p.dispatchEvent('#lpSt', 'input'); } await o.p.click('#lpOk');
  await o.p.waitForFunction(n=>{ const f=files.find(g=>g.name===n); return f && f.an && f.an.lib && f.an.lib.insOk; }, name); }
async function load(o, name, text){ await o.p.evaluate(async ([n,t])=>{ await addEntries([{file:new File([t],n), path:n}]); await new Promise(r=>setTimeout(r,250)); }, [name, text]); }
async function exportZip(o, desk){
  await o.p.evaluate(()=>{ S.outPdf=true; S.outAnalysis=true; S.oneFile=true; saveS(); go(3); });
  if (desk){ await o.p.evaluate(()=>{ window.__mock.keepBytes=true; window.__mock.writes.length=0; window.__mock.pick.pick_save={path:'/utente/Documenti/risultati.zip', name:'risultati.zip'}; });
    await o.p.click('#doDl'); await o.p.waitForFunction(()=>window.__mock.writes.some(w=>/\.zip$/.test(w.path)), null, {timeout:60000});
    return Buffer.from(await o.p.evaluate(()=>window.__mock.writes.find(w=>/\.zip$/.test(w.path)).bytes)); }
  const [dl]=await Promise.all([o.p.waitForEvent('download',{timeout:60000}), o.p.click('#doDl')]);
  return fs.readFileSync(await dl.path());
}

describe('Tappa I4: librerie per strumento e tipo di campione', {timeout:20*60*1000}, ()=>{
  let server, br; const errs=[];
  before(async ()=>{ server=await B.startServer(); br=await B.launch(); });
  after(async ()=>{ await br.close(); server.close(); assert.deepStrictEqual(errs, [], 'errori nella pagina'); });
  const done=async o=>{ errs.push(...o.errors); await o.ctx.close(); };
  const open=desk=>desk ? openDesk(B, br, server, {init:[()=>{ window.__ACCH_STORE__={version:1, items:{}}; }]}) : B.openPage(br, server, {});

  for (let rep=1; rep<=3; rep++) for (const desk of [false, true]) it(`percorso del committente, ${desk?'desktop':'online'}, ripetizione ${rep}: importa, carica, libreria proposta, concentrazioni marcate, CSV e PDF con la provenienza`, async ()=>{
    const o=await open(desk), w=desk?'desktop':'online';
    if (desk) assert.strictEqual(await o.p.evaluate(()=>AcchHost.libs.kind), 'desktop');
    await importBozza(o, desk);
    if (desk){ const fsx=await o.p.evaluate(()=>Object.keys(window.__mock.libfs)); assert.ok(fsx.some(p=>/^\/app\/librerie\/[^/]+\.acchlib$/.test(p)), w+': libreria scritta in app_data_dir/librerie'); }
    await load(o, 'SAL_03.csv', sal());
    // 2. finestra al caricamento: strumento dall'intestazione, tipo di campione, libreria proposta
    const dlg=await o.p.evaluate(()=>{ const d=document.querySelector('#dlgLibLoad'); return d && d.open ? d.innerText : null; });
    assert.ok(dlg, w+': la finestra della libreria si apre al caricamento'); assert.match(dlg, /Agilent 1260 Infinity · DAD G4212B/); assert.match(dlg, /G4212B DAD/);
    await o.p.fill('#lpSt', 'saliva'); await o.p.dispatchEvent('#lpSt', 'input');
    assert.match(await o.p.textContent('#lpPick'), new RegExp('Libreria proposta: '+LIBNAME));
    await confirmLoad(o, null, 'SAL_03.csv');
    // 3. concentrazioni dalla pendenza salvata, marcate, con la provenienza
    const sec=await o.p.evaluate(()=>{ go(2); openTab('an'); renderAnalysis(); const s=document.querySelector('#secLib'); s.open=true; const rows=[...s.querySelectorAll('#libQ tbody tr')].map(tr=>({e:tr.cells[0].textContent, x:(tr.querySelector('[data-libx]')||{}).textContent, t:tr.cells[5].textContent})); return {txt:s.innerText, rows, st:files[0].an.lib.st, ok:files[0].an.lib.insOk}; });
    assert.strictEqual(sec.st, 'saliva'); assert.strictEqual(sec.ok, true, w+': strumento confermato');
    for (const [n,[,,c]] of Object.entries(TRUE)){ const r=sec.rows.find(x=>x.e===n); assert.ok(r && r.x, `${w}: manca ${n}`); const v=+r.x.replace(',','.'); assert.ok(Math.abs(v/c-1)<0.03, `${w} ${n}: ${v} invece di ${c}`);
      assert.match(r.t, /senza controllo del giorno/); assert.match(r.t, new RegExp(`libreria «${LIBNAME}» rev\\. \\d+ · voce «${n}» rev\\. 1 · taratura del 01/01/20(20|22)`)); }
    assert.match(sec.txt, /senza controllo del giorno/);
    if (desk){ const t=await o.p.evaluate(()=>document.querySelector('#secLib').innerText+[...document.querySelectorAll('.libdlg')].map(d=>d.innerText).join(' ')); assert.ok(!/[\p{Extended_Pictographic}]/u.test(t) && !/!/.test(t) && !/Gino/.test(t), 'desktop: tono professionale'); }
    // 4. Esporta: CSV e PDF con la provenienza
    const zip=await JSZip.loadAsync(await exportZip(o, desk)), names=Object.keys(zip.files);
    const csvN=names.find(n=>/concentrazioni_da_libreria\.csv$/.test(n)); assert.ok(csvN, w+': CSV delle concentrazioni nello ZIP: '+names.join(', '));
    const csv=(await zip.file(csvN).async('string')).replace(/^\uFEFF/,''), L=csv.split(/\r\n/), H=L[0].split(';');
    for (const k of ['Concentrazione','U','Fattore di copertura','Segno','Profilo','Metodo di taratura','Libreria','Revisione libreria','Voce','Data taratura','Età (giorni)','Lotto standard','Strumento della libreria','Tipo di campione','Fonte']) assert.ok(H.includes(k), 'colonna '+k);
    const row=n=>L.find(l=>l.split(';')[2]===n).split(';'), cr=row('Creatinine');
    assert.strictEqual(cr[H.indexOf('Segno')], 'senza controllo del giorno'); assert.strictEqual(cr[H.indexOf('Libreria')], LIBNAME); assert.strictEqual(cr[H.indexOf('Metodo di taratura')], 'salvata senza controllo'); assert.strictEqual(cr[H.indexOf('Data taratura')], '2020-01-01'); assert.strictEqual(cr[H.indexOf('Profilo')], 'Ricerca');
    { const num=t=>+String(t).replace(',','.'), c=num(cr[H.indexOf('Concentrazione')]), sc=num(sec.rows.find(x=>x.e==='Creatinine').x); assert.strictEqual(+c.toPrecision(4), sc, w+': CSV uguale allo schermo (a schermo 4 cifre)'); }
    const met=await zip.file(names.find(n=>/metodi_e_bibliografia\.txt$/.test(n))).async('string'); assert.match(met, /senza controllo del giorno/); assert.match(met, new RegExp(LIBNAME));
    const pdfN=names.find(n=>/\.pdf$/.test(n)); assert.ok(pdfN, w+': PDF nello ZIP'); const P=pdfText(Buffer.from(await zip.file(pdfN).async('uint8array'))).join('\n');
    assert.match(P, /Concentrazioni dalla libreria dello strumento/); assert.match(P, /SENZA CONTROLLO DEL GIORNO/); assert.match(P, /voce «Creatinine»/); assert.match(P, /taratura del 01\/01\/2020/);
    await done(o);
  });

  it('libreria di un altro strumento: mai proposta, e scelta a mano non usa le pendenze senza avviso; due librerie con lo stesso composto restano distinte', async ()=>{
    for (const desk of [false, true]){ const o=await open(desk), w=desk?'desktop':'online';
      await importBozza(o, desk);
      // stessa coppia di composti, ma per un 1290 Infinity II e pendenze doppie: è una libreria distinta
      await o.p.evaluate(async ()=>{ const src=AcchLibUi.items.find(it=>it.lib).lib, L=AcchLib.create({instrument:{brand:'Agilent', model:'1290 Infinity II', detector:'DAD G7117B'}, sampleType:'saliva', technique:'hplc'});
        for (const e of AcchLib.liveEntries(src).filter(e=>e.cal)) AcchLib.upsert(L, Object.assign({}, e, {id:undefined, cal:Object.assign({}, e.cal, {slope:e.cal.slope*2})})); await AcchLibUi.saveLib({origin:'user'}, L); });
      const f1290=sal({sample:'SAL_04', model:'Agilent 1290 Infinity II', modules:'G7120A Pump, G7129B ALS, G7117B DAD'});
      await load(o, 'SAL_04_1290.csv', f1290); await o.p.fill('#lpSt','saliva'); await o.p.dispatchEvent('#lpSt','input'); assert.match(await o.p.textContent('#lpPick'), /1290 Infinity II/); await confirmLoad(o, null, 'SAL_04_1290.csv');
      await load(o, 'SAL_05_1260.csv', sal({sample:'SAL_05'})); await confirmLoad(o, 'saliva', 'SAL_05_1260.csv');
      const r=await o.p.evaluate(()=>{ const v=n=>{ const f=files.find(g=>g.name===n), q=AcchLibUi.quantRows(f), w=q.rows.find(x=>x.entry.name==='Creatinine'); return {lib:q.lib.instrument.model, x:w.res.x}; }; return {a:v('SAL_04_1290.csv'), b:v('SAL_05_1260.csv')}; });
      assert.strictEqual(r.a.lib, '1290 Infinity II'); assert.strictEqual(r.b.lib, '1260 Infinity'); assert.ok(Math.abs(r.a.x*2/r.b.x-1)<1e-9, w+': ogni file usa le pendenze della sua coppia');
      // un 1290 senza la sua libreria: nessuna proposta (si propone di crearla), e la 1260 scelta a mano dà l'avviso e nessun numero
      await o.p.evaluate(async ()=>{ const it=AcchLibUi.items.find(x=>x.lib && x.lib.instrument.model==='1290 Infinity II'); await AcchHost.libs.remove(it); await AcchLibUi.refresh(); });
      await load(o, 'SAL_06_1290.csv', sal({sample:'SAL_06', model:'Agilent 1290 Infinity II', modules:'G7117B DAD'}));
      await o.p.fill('#lpSt','saliva'); await o.p.dispatchEvent('#lpSt','input'); const pick=await o.p.textContent('#lpPick');
      assert.match(pick, /Non c'è una libreria per questa coppia/); assert.match(pick, /altro strumento e non viene usata/); assert.ok(await o.p.$('#lpCreate'), w+': propone di crearla'); await confirmLoad(o, null, 'SAL_06_1290.csv');
      const s=await o.p.evaluate(()=>{ cur=files.findIndex(f=>f.name==='SAL_06_1290.csv'); go(2); openTab('an'); renderAnalysis(); const miss=!!document.querySelector('#libMissing');
        const id=AcchLibUi.items.find(x=>x.lib && x.lib.instrument.model==='1260 Infinity').lib.id; const sel=document.querySelector('#libPick'); sel.value=id; sel.dispatchEvent(new Event('change'));
        const warn=document.querySelector('#libWrong'), q=AcchLibUi.quantRows(files[cur]); return {miss, warn:warn&&warn.textContent, ok:q.rows.filter(x=>x.res&&x.res.ok).length, codes:[...new Set(q.rows.filter(x=>x.res).map(x=>x.res.code))], txt:document.querySelector('#libQ').textContent}; });
      assert.ok(s.miss, w+': «manca la libreria» per il 1290'); assert.match(s.warn, /un altro strumento/); assert.strictEqual(s.ok, 0, w+': nessun numero con le pendenze di un altro strumento'); assert.deepStrictEqual(s.codes, ['instrument']); assert.match(s.txt, /strumento diverso da quello della taratura/);
      await done(o); }
  });

  it('«Salva le pendenze nella libreria» dopo una taratura e «Aggiungi alla libreria» dal clic destro; il progetto incorpora la libreria', async ()=>{
    for (const desk of [false, true]){ const o=await open(desk), w=desk?'desktop':'online';
      const STD=[1,2,5,10,20].map((c,i)=>[`STD${i+1}.csv`, D.chrom({sample:'STD'+(i+1), seed:20+i, method:'METODO-A.M', peaks:[{t:4.0, area:600*c}]}), c]);
      await o.p.evaluate(async L=>{ AcchHost.store.setItem('acch.lib.sampleType', JSON.stringify('alimenti')); const lib=AcchLib.create({instrument:{brand:'Agilent', model:'1260 Infinity', detector:'DAD G4212B'}, sampleType:'alimenti', technique:'hplc'}); await AcchLibUi.saveLib({origin:'user'}, lib);
        await addEntries(L.map(([n,t])=>({file:new File([t],n), path:n}))); await new Promise(r=>setTimeout(r,250)); }, STD);
      await confirmLoad(o, null, 'STD1.csv');
      const cal=await o.p.evaluate(async L=>{ if (window.AcchWebShow) AcchWebShow(); const c=mvCfg('hplc'); c.a=3.85; c.b=4.15; c.meas='area'; c.unit='mg/L'; mvSave(); L.forEach(([n,,v])=>anSet(files.find(f=>f.name===n),'conc',v));
        go(2); openTab('multi'); $('#secMulti').open=true; $('#mvInstr').value='hplc'; renderMulti(); await new Promise(r=>setTimeout(r,150)); const k=mvCalib(mvTable('hplc')); return {b:k.b, a:k.a, btn:!!document.querySelector('#libSaveSlope')}; }, STD);
      assert.ok(cal.btn, w+': il pulsante «Salva le pendenze» compare sotto la retta');
      await o.p.click('#libSaveSlope'); await o.p.fill('#lsName','Analita X'); await o.p.selectOption('#lsProf','ricerca'); await o.p.fill('#lsLot','LOTTO-42'); await o.p.click('#lsOk');
      await o.p.waitForFunction(()=>AcchLibUi.items.some(it=>it.lib && it.lib.entries.some(e=>e.name==='Analita X')));
      const e=await o.p.evaluate(()=>AcchLibUi.items.find(it=>it.lib && it.lib.sampleType==='alimenti').lib.entries.find(e=>e.name==='Analita X'));
      assert.ok(Math.abs(e.cal.slope/cal.b-1)<1e-12 && Math.abs(e.cal.intercept-cal.a)<1e-9, w+': pendenza e intercetta salvate'); assert.strictEqual(e.cal.standardLot,'LOTTO-42'); assert.strictEqual(e.profile,'ricerca'); assert.deepStrictEqual(e.cal.range,[1,20]); assert.strictEqual(AcchChannelsWl(e.channel),220); assert.ok(e.cal.srel>0);
      // un incognito di un altro giorno: la concentrazione dalla pendenza salvata è quella della retta (stessi numeri)
      await load(o, 'INC.csv', D.chrom({sample:'INC', seed:99, method:'METODO-A.M', peaks:[{t:4.0, area:600*7.3}]})); await closeAll(o.p);
      const q=await o.p.evaluate(()=>{ const f=files.find(g=>g.name==='INC.csv'), r=AcchLibUi.quantRows(f).rows.find(x=>x.entry.name==='Analita X'), k=mvCalib(mvTable('hplc')); const y=mvValue(f, 3.85, 4.15, 'area'); return {x:r.res.x, day:k.predict(y).x, mode:r.res.mode}; });
      assert.ok(Math.abs(q.x/q.day-1)<1e-9, `${w}: ${q.x} / ${q.day}`); assert.strictEqual(q.mode,'nocontrol');
      // clic destro su un picco: «Aggiungi alla libreria…»
      const items=await o.p.evaluate(()=>{ cur=files.findIndex(f=>f.name==='INC.csv'); go(2); openTab('peaks'); renderPreview(); const p=pvView.peaks[0]; openCtx(200,200,p,p.x,p.y);
        const B=[...document.querySelectorAll('#ctxMenu button')], t=B.map(b=>b.textContent), b=B.find(x=>/Aggiungi alla libreria/.test(x.textContent)); if (b) b.click(); return t; });
      assert.ok(items.some(t=>/Aggiungi alla libreria/.test(t)), w+': voce nel menu: '+items.join(' | '));
      await o.p.fill('#laName','Picco di prova'); await o.p.click('#laOk'); await o.p.waitForFunction(()=>AcchLibUi.items.some(it=>it.lib && it.lib.entries.some(e=>e.name==='Picco di prova')));
      // progetto: la libreria usata è incorporata; riaperto dove la libreria non c'è, i numeri restano
      const proj=await o.p.evaluate(async ()=>{ const b=(await AcchProject._build()).bytes, P=await AcchFormat.decode(b, JSZip); return {b:Array.from(b), libs:P.libraries.map(l=>({name:l.name, n:l.data.entries.length}))}; });
      assert.ok(proj.libs.some(l=>/alimenti/.test(l.name) && l.n===2), w+': libreria incorporata con le voci: '+JSON.stringify(proj.libs));
      await done(o);
      const o2=await open(desk);
      const re=await o2.p.evaluate(async b=>{ const ok=await AcchProject.openBytes(Uint8Array.from(b),'p.acchspettri',null); document.querySelectorAll('dialog[open]').forEach(d=>d.close()); await new Promise(r=>setTimeout(r,200));
        const f=files.find(g=>g.name==='INC.csv'); cur=files.indexOf(f); go(2); openTab('an'); renderAnalysis(); const r=AcchLibUi.quantRows(f).rows.find(x=>x.entry.name==='Analita X');
        return {ok, mine:AcchLibUi.items.filter(i=>i.lib).length, x:r&&r.res&&r.res.x, txt:document.querySelector('#secLib').textContent, st:f.an&&f.an.lib&&f.an.lib.st, an:JSON.stringify(f.an), names:files.map(g=>g.name)}; }, proj.b);
      assert.strictEqual(re.ok, true); assert.strictEqual(re.mine, 0, w+': nessuna libreria locale'); assert.ok(Math.abs(re.x/q.x-1)<1e-12, w+': stesso numero dal progetto '+JSON.stringify(re).slice(0,1500)); assert.match(re.txt, /incorporata nel progetto/); assert.strictEqual(re.st, 'alimenti', w+': tipo di campione ricordato nel progetto '+re.an+' '+re.names);
      await done(o2); }
  });

  it('desktop: cartella condivisa (OneDrive o rete), scrittura contemporanea unita voce per voce, conflitto scelto dall\'utente, copie di conflitto segnalate', async ()=>{
    for (let rep=0; rep<3; rep++){ const o=await open(true);
      const r=await o.p.evaluate(async ()=>{ const M=window.__mock, out={};
        M.pick.lib_shared_add='/OneDrive/Laboratorio/librerie'; await AcchLibUi.openManager(); document.querySelector('#lmShared').click(); await new Promise(r=>setTimeout(r,200)); out.shared=M.libShared.slice();
        // la libreria comune è già nella cartella condivisa, scritta da un collega
        const L=AcchLib.create({instrument:{brand:'Agilent', model:'1260 Infinity', detector:'DAD G4212B'}, sampleType:'ambientale', technique:'hplc'}); const mk=(n,x,b)=>({name:n, x, window:0.1, cal:{kind:'line', slope:b, intercept:0, syx:1, range:[1,10], areaUnit:'mAU·min', concUnit:'µg/L', date:'2026-11-01'}});
        AcchLib.upsert(L, mk('A',2,10)); AcchLib.upsert(L, mk('B',3,20)); const P='/OneDrive/Laboratorio/librerie/comune.acchlib.json'; M.libfs[P]=AcchLib.serialize(L);
        await AcchLibUi.refresh(); const it=AcchLibUi.items.find(x=>x.path===P); out.origin=it.origin;
        // noi cambiamo A e aggiungiamo C; intanto il collega cambia B: unione senza domande
        const mine=JSON.parse(JSON.stringify(it.lib)); AcchLib.upsert(mine, Object.assign({}, mine.entries[0], {cal:Object.assign({}, mine.entries[0].cal, {slope:11})})); AcchLib.upsert(mine, mk('C',4,30));
        M.onLibWrite=()=>{ const t=AcchLib.parse(M.libfs[P]); AcchLib.upsert(t, Object.assign({}, t.entries[1], {cal:Object.assign({}, t.entries[1].cal, {slope:21})})); M.libfs[P]=AcchLib.serialize(t); };
        let asked=0; window.AcchLibAsk=async m=>{ asked++; return null; };
        const s1=await AcchLibUi.saveLib(it, mine); const now=AcchLib.parse(M.libfs[P]); out.merged=AcchLib.liveEntries(now).map(e=>e.name+':'+e.cal.slope).sort(); out.asked1=asked;
        // stessa voce cambiata da entrambi: domanda; annullare non scrive
        const it2=AcchLibUi.items.find(x=>x.path===P), m2=JSON.parse(JSON.stringify(it2.lib)); AcchLib.upsert(m2, Object.assign({}, m2.entries[0], {cal:Object.assign({}, m2.entries[0].cal, {slope:12})}));
        M.onLibWrite=()=>{ const t=AcchLib.parse(M.libfs[P]); AcchLib.upsert(t, Object.assign({}, t.entries[0], {cal:Object.assign({}, t.entries[0].cal, {slope:13})})); M.libfs[P]=AcchLib.serialize(t); };
        const before=M.libfs[P].length; const s2=await AcchLibUi.saveLib(it2, m2); out.cancel={saved:!!s2, asked, slopeA:AcchLib.parse(M.libfs[P]).entries[0].cal.slope};
        // con la finestra vera: si sceglie «la tua versione»
        window.AcchLibAsk=null; await AcchLibUi.refresh(); const it3=AcchLibUi.items.find(x=>x.path===P), m3=JSON.parse(JSON.stringify(it3.lib)); AcchLib.upsert(m3, Object.assign({}, m3.entries[0], {cal:Object.assign({}, m3.entries[0].cal, {slope:14})}));
        M.onLibWrite=()=>{ const t=AcchLib.parse(M.libfs[P]); AcchLib.upsert(t, Object.assign({}, t.entries[0], {cal:Object.assign({}, t.entries[0].cal, {slope:15})})); M.libfs[P]=AcchLib.serialize(t); };
        const pr=AcchLibUi.saveLib(it3, m3); await new Promise(r=>setTimeout(r,200)); const dl=document.querySelector('#dlgLibConf'); out.dlg=dl&&dl.open?dl.innerText:null; document.querySelector('#dlgLibConf input[value="mine"]').checked=true; document.querySelector('#lcOk').click(); await pr;
        out.chosen=AcchLib.parse(M.libfs[P]).entries[0].cal.slope;
        // copia di conflitto di OneDrive nella stessa cartella: segnalata, mai usata al posto della libreria
        M.libfs['/OneDrive/Laboratorio/librerie/comune-PC-LAB2.acchlib.json']=M.libfs[P]; await AcchLibUi.refresh(); await AcchLibUi.openManager(); const cf=document.querySelector('#lmConflicts'); out.conf=cf&&cf.innerText; out.listed=[...document.querySelectorAll('#lmTable tr[data-id]')].length;
        // una cartella di rete staccata non blocca le altre
        M.libDirErr['/OneDrive/Laboratorio/librerie']='NotConnected'; await AcchLibUi.refresh(); out.unreach=AcchLibUi.items.filter(x=>x.error).length; delete M.libDirErr['/OneDrive/Laboratorio/librerie'];
        return out; });
      assert.deepStrictEqual(r.shared, ['/OneDrive/Laboratorio/librerie']); assert.strictEqual(r.origin, 'shared');
      assert.deepStrictEqual(r.merged, ['A:11','B:21','C:30'], 'le modifiche di entrambi ci sono'); assert.strictEqual(r.asked1, 0);
      assert.deepStrictEqual(r.cancel, {saved:false, asked:1, slopeA:13}, 'annullato: resta la versione del collega, niente sovrascritto');
      assert.match(r.dlg, /Modifiche contemporanee alla stessa libreria/); assert.strictEqual(r.chosen, 14);
      assert.match(r.conf, /comune-PC-LAB2\.acchlib\.json → comune\.acchlib\.json/); assert.strictEqual(r.listed, 1, 'la copia non compare come seconda libreria');
      assert.strictEqual(r.unreach, 1);
      await done(o); }
  });

  it('online: due schede sulla stessa libreria in IndexedDB non si sovrascrivono', async ()=>{
    const o=await open(false);
    const r=await o.p.evaluate(async ()=>{ const S=AcchHost.libs; const L=AcchLib.create({instrument:{brand:'Bruker', model:'ALPHA II', detector:'DTGS'}, sampleType:'polimeri', technique:'ftir'}); AcchLib.upsert(L,{name:'C=O', x:1715, window:15});
      const a=(await S.save({origin:'user'}, L)).item; const b=Object.assign({}, a); const la=JSON.parse(JSON.stringify(a.lib)), lb=JSON.parse(JSON.stringify(b.lib));
      AcchLib.upsert(la,{name:'C-H', x:2920, window:15}); AcchLib.upsert(lb,{name:'O-H', x:3400, window:30});
      await S.save(a, la); await S.save(b, lb, ()=>null); const now=(await S.list()).find(x=>x.lib && x.lib.id===L.id).lib; return {kind:S.kind, names:AcchLib.liveEntries(now).map(e=>e.name).sort()}; });
    assert.strictEqual(r.kind, 'web'); assert.deepStrictEqual(r.names, ['C-H','C=O','O-H']);
    await done(o);
  });

  it('decisioni del coordinatore: filtri, confronto con la retta del giorno, idoneità e manutenzioni, carta di controllo esportata, doppio clic su una libreria', async ()=>{
    for (const desk of [false, true]){ const o=await open(desk), w=desk?'desktop':'online';
      await importBozza(o, desk);
      // altre due librerie: FTIR e un HPLC per «alimenti» con un'altra λ
      await o.p.evaluate(async ()=>{ const a=AcchLib.create({technique:'ftir', instrument:{brand:'Bruker', model:'ALPHA II', detector:'DTGS'}, sampleType:'polimeri'}); AcchLib.upsert(a,{name:'C=O', x:1715, window:15}); await AcchLibUi.saveLib({origin:'user'}, a);
        const b=AcchLib.create({technique:'hplc', instrument:{brand:'Agilent', model:'1260 Infinity', detector:'DAD G4212B'}, sampleType:'alimenti', methods:[{id:'METODO-A.M'}]}); AcchLib.upsert(b,{name:'Caffeina', x:4, window:0.1, channel:'DAD1A 273/4 nm', method:'METODO-A.M'}); await AcchLibUi.saveLib({origin:'user'}, b); });
      // 3. filtri per tecnica, strumento, tipo di campione, metodo e canale
      const flt=await o.p.evaluate(async ()=>{ await AcchLibUi.openManager(); const n=()=>[...document.querySelectorAll('#lmTable tr[data-id]')].filter(t=>!t.hidden).length, set=(id,v)=>{ const e=document.querySelector('#'+id); e.value=v; e.dispatchEvent(new Event('input')); };
        const out={all:n()}; set('lfTech','ftir'); out.tech=n(); set('lfTech',''); set('lfIns','1260'); out.ins=n(); set('lfSt','alimenti'); out.st=n(); set('lfSt',''); set('lfMet','METODO-A'); out.met=n(); set('lfMet',''); set('lfCh','273'); out.ch=n(); set('lfCh','DAD1A 220 nm'); out.ch220=n(); set('lfIns',''); set('lfCh',''); document.querySelectorAll('dialog[open]').forEach(d=>d.close()); return out; });
      assert.deepStrictEqual(flt, {all:3, tech:1, ins:2, st:1, met:1, ch:1, ch220:1}, w+': filtri');
      // 4. profilo Dosaggio: nessun numero, ma la differenza in % rispetto alla retta del giorno
      const STD=[1,2,5,10].map((c,i)=>[`D${i+1}.csv`, D.chrom({sample:'D'+(i+1), seed:40+i, method:'METODO-A.M', signal:'DAD1 A, Sig=273,4 Ref=off', peaks:[{t:4.0, area:600*c*1.04}]}), c]);
      const cmp=await o.p.evaluate(async L=>{ const it=AcchLibUi.items.find(x=>x.lib&&x.lib.sampleType==='alimenti'), lib=JSON.parse(JSON.stringify(it.lib)), e=lib.entries[0];
        e.profile='dosaggio'; e.integration={a:3.85, b:4.15}; e.cal={kind:'line', slope:600/60*60, intercept:0, syx:1, range:[1,10], areaUnit:'mAU·s', concUnit:'mg/L', date:'2026-11-01'}; e.cal.slope=600*60/60; AcchLib.upsert(lib, e); await AcchLibUi.saveLib(it, lib);
        AcchHost.store.setItem('acch.lib.sampleType', JSON.stringify('alimenti'));
        await addEntries(L.map(([n,t])=>({file:new File([t],n), path:n}))); await new Promise(r=>setTimeout(r,250)); document.querySelector('#lpOk').click(); await new Promise(r=>setTimeout(r,100));
        if (window.AcchWebShow) AcchWebShow(); const c=mvCfg('hplc'); c.a=3.85; c.b=4.15; c.meas='area'; c.unit='mg/L'; mvSave(); L.forEach(([n,,v])=>anSet(files.find(f=>f.name===n),'conc',v));
        cur=files.findIndex(f=>f.name==='D2.csv'); go(2); openTab('an'); renderAnalysis(); const r=AcchLibUi.quantRows(files[cur]).rows.find(x=>x.entry.name==='Caffeina');
        return {code:r.res.code, x:r.res.x, diff:r.res.compare&&r.res.compare.diff, txt:document.querySelector('#libQ').textContent, csv:AcchLibUi.csvRows([files[cur]]).map(x=>x.join(';')).join('\n')}; }, STD);
      assert.strictEqual(cmp.code, 'profile'); assert.strictEqual(cmp.x, null); assert.ok(Math.abs(cmp.diff/100*60-0.04*60)<0.6/60*100 && Math.abs(cmp.diff-4)<1.5, w+': differenza '+cmp.diff);
      assert.match(cmp.txt, /Retta del giorno: pendenza \+\d,\d% rispetto a quella salvata/); assert.match(cmp.csv, /Retta del giorno: pendenza \+/);
      // 5. idoneità non superata oggi e manutenzione dopo la taratura, dalla finestra, con data e autore
      const lg=await o.p.evaluate(async ()=>{ const id=AcchLibUi.items.find(x=>x.lib&&x.lib.name==='Agilent 1260 Infinity · DAD — saliva').lib.id; await AcchLibUi.openManager(id);
        document.querySelector('#lmLog').click(); await new Promise(r=>setTimeout(r,50)); document.querySelector('#lgKind').value='suit-ko'; document.querySelector('#lgAuthor').value='Tecnico A'; document.querySelector('#lgOk').click();
        await new Promise(r=>setTimeout(r,400)); const L=AcchLibUi.items.find(x=>x.lib&&x.lib.id===id).lib; document.querySelectorAll('dialog[open]').forEach(d=>d.close()); return {s:L.suitability, sum:!!document.querySelector('#lmLogSum')}; });
      assert.strictEqual(lg.s.length, 1); assert.strictEqual(lg.s[0].ok, false); assert.strictEqual(lg.s[0].author, 'Tecnico A');
      await load(o, 'SAL_10.csv', sal({sample:'SAL_10'})); await confirmLoad(o, 'saliva', 'SAL_10.csv');
      const blk=await o.p.evaluate(()=>{ const f=files.find(g=>g.name==='SAL_10.csv'); return [...new Set(AcchLibUi.quantRows(f).rows.filter(x=>x.res).map(x=>x.res.code))]; });
      assert.deepStrictEqual(blk, ['suitability'], w+': idoneità non superata → nessun numero');
      const mt=await o.p.evaluate(async ()=>{ const it=AcchLibUi.items.find(x=>x.lib&&x.lib.name==='Agilent 1260 Infinity · DAD — saliva'), L=JSON.parse(JSON.stringify(it.lib)); L.suitability=[]; L.maintenance=[{date:'2021-03-01', kind:'lampada', author:'Tecnico B'}]; await AcchLibUi.saveLib(it, L);
        const f=files.find(g=>g.name==='SAL_10.csv'); return AcchLibUi.quantRows(f).rows.filter(x=>x.res).map(x=>x.res.code+':'+x.entry.name); });
      assert.ok(mt.includes('maintenance:Creatinine') && mt.includes('ok:Dihydrouracil')===false, w+': manutenzione dopo la taratura del 2020 la invalida: '+mt.join(','));
      // 6. carta di controllo: k registrato da un controllo del giorno, esportata da sola (PNG, SVG, CSV) e nello ZIP di Esporta
      const ch=await o.p.evaluate(async ()=>{ const it=AcchLibUi.items.find(x=>x.lib&&x.lib.name==='Agilent 1260 Infinity · DAD — saliva'), L=JSON.parse(JSON.stringify(it.lib)); L.maintenance=[]; const e=L.entries.find(x=>x.name==='Creatinine');
        e.chart=Array.from({length:10},(_,i)=>({date:'2026-10-'+String(i+10), k:1+0.004*Math.sin(i)})); AcchLib.upsert(L, e); await AcchLibUi.saveLib(it, L); return AcchLibUi.chartSvg(AcchLibUi.items.find(x=>x.lib&&x.lib.id===L.id).lib.entries.find(x=>x.name==='Creatinine'), L); });
      assert.match(ch, /^<svg[\s\S]*Carta di controllo · Creatinine[\s\S]*<circle/);
      await load(o, 'CTRL.csv', sal({sample:'CTRL', seed:3})); await confirmLoad(o, 'saliva', 'CTRL.csv');
      const rk=await o.p.evaluate(async ()=>{ const c=files.find(g=>g.name==='CTRL.csv'); anSet(c,'role','qc'); const id=AcchLibUi.quantRows(c).lib.entries.find(x=>x.name==='Creatinine').id; anSet(c,'libCtrl',{[id]:0.0227}); files.forEach(g=>g._libRes=null);
        cur=files.findIndex(g=>g.name==='SAL_10.csv'); go(2); openTab('an'); renderAnalysis(); const b=[...document.querySelectorAll('#libBody .libchart')].find(x=>x.dataset.e===id); if (!b) return {btn:false}; b.click(); await new Promise(r=>setTimeout(r,400));
        const e=AcchLibUi.items.find(x=>x.lib&&x.lib.entries.some(y=>y.id===id)).lib.entries.find(y=>y.id===id); return {btn:true, n:e.chart.length, last:e.chart[e.chart.length-1]}; });
      assert.ok(rk.btn, w+': pulsante «Registra il k»'); assert.strictEqual(rk.n, 11); assert.ok(Math.abs(rk.last.k-1)<0.05);
      if (!desk){ await o.p.evaluate(()=>{ const id=AcchLibUi.items.find(x=>x.lib&&x.lib.name==='Agilent 1260 Infinity · DAD — saliva').lib.id; return AcchLibUi.openManager(id); });
        for (const k of ['png','svg','csv']){ const [dl]=await Promise.all([o.p.waitForEvent('download'), o.p.click(`#lmEntries [data-chart][data-kind="${k}"]`)]); assert.match(dl.suggestedFilename(), new RegExp('creatinine\\.'+k+'$')); const b=fs.readFileSync(await dl.path()); if (k==='png') assert.strictEqual(b.slice(1,4).toString(),'PNG'); if (k==='csv') assert.match(b.toString(), /Serie[;,]Data[;,]k/); }
        await closeAll(o.p); }
      assert.ok(await o.p.evaluate(()=>{ go(3); return !!document.querySelector('#libOutCharts input') && document.querySelector('#libOutCharts input').checked; }), w+': opzione in Esporta');
      const zip=await JSZip.loadAsync(await exportZip(o, desk)), names=Object.keys(zip.files);
      for (const k of ['png','svg','csv']) assert.ok(names.some(n=>new RegExp('carte_di_controllo/.*creatinine\\.'+k+'$').test(n)), w+': carta '+k+' nello ZIP: '+names.join(', '));
      // 2. doppio clic su un .acchlib (desktop): importazione con l'unione e i conflitti espliciti
      if (desk){ const r=await o.p.evaluate(async ()=>{ const M=window.__mock, it=AcchLibUi.items.find(x=>x.lib&&x.lib.sampleType==='polimeri'), L=JSON.parse(JSON.stringify(it.lib));
          AcchLib.upsert(L, Object.assign({}, L.entries[0], {x:1720})); AcchLib.upsert(L, {name:'C-H', x:2920, window:15});
          const mine=JSON.parse(JSON.stringify(it.lib)); AcchLib.upsert(mine, Object.assign({}, mine.entries[0], {x:1710})); await AcchLibUi.saveLib(it, mine);
          M.files['/utente/Scaricati/polimeri.acchlib']=AcchLib.serialize(L); M.pending=[{path:'/utente/Scaricati/polimeri.acchlib', name:'polimeri.acchlib'}];
          let asked=null; window.AcchLibAsk=async m=>{ asked=m.conflicts.map(c=>c.name); return {[m.conflicts[0].id]:'theirs'}; };
          M.emit('acch-open-files'); for (let i=0;i<40 && !AcchLibUi.items.find(x=>x.lib&&x.lib.id===L.id&&x.lib.entries.length===2);i++) await new Promise(r=>setTimeout(r,100));
          window.AcchLibAsk=null; const now=AcchLibUi.items.find(x=>x.lib&&x.lib.id===L.id).lib; return {asked, names:AcchLib.liveEntries(now).map(e=>e.name+':'+e.x).sort(), n:AcchLibUi.items.filter(x=>x.lib&&x.lib.sampleType==='polimeri').length}; });
        assert.deepStrictEqual(r.asked, ['C=O'], 'conflitto esplicito'); assert.deepStrictEqual(r.names, ['C-H:2920','C=O:1720']); assert.strictEqual(r.n, 1, 'nessun doppione'); }
      await done(o); }
  });
});
