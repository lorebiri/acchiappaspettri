// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Finestra di esportazione per voci (requisito del committente per la 3.0.0): niente ZIP unico, l'utente sceglie che cosa e dove.
// Desktop (finto __TAURI__ di tauri-mock.js): 3 voci → esattamente 3 file nella cartella scelta; conflitto → richiesta (rinomina,
// salta, sostituisci, annulla); annullamento → nessun file e nessun successo; «Mostra nella cartella» → comando nativo;
// sottocartella, ZIP solo su richiesta, spettri inclusi, errori elencati, voce singola dai menu, preimpostazioni.
// Online: una voce → un solo file; ZIP richiesto → uno ZIP con le voci scelte; oltre 3 file si propone lo ZIP, rifiutabile.
// Contenuto: i file scritti sono identici a quelli dentro buildZip() (cambia il contenitore, non i numeri). Dati SINTETICI.
// Uso: PW_CHANNEL=chrome node --test test/validation/esporta-voci-ui.test.js
'use strict';
const {describe, it, before, after}=require('node:test'), assert=require('node:assert'), path=require('path');
const B=require('./browser.js'), {openDesk}=require('./tauri-mock.js'), {pdfText}=require('./pdf-text.js');
const JSZip=require(path.join(B.ROOT,'node_modules','jszip'));

const ftir=k=>'Wavenumber (cm-1),Absorbance\n'+Array.from({length:400},(_,i)=>(4000-i*8)+','+(0.1+Math.exp(-Math.pow((i-150-k)/9,2))+0.5*Math.exp(-Math.pow((i-260)/6,2))).toFixed(4)).join('\n');
const SPECTRA=[['a.csv',ftir(0)],['b.csv',ftir(20)],['c.csv',ftir(40)]];
const NONE={outPdf:false,outPng:false,outSvg:false,csvPeaks:false,csvData:false,csvRaw:false,outAnalysis:false,outTrace:false,outOrigin:false,outProject:false,zipAll:false,expSub:false,expScope:'sel',expNames:{}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

let server, br;
before(async ()=>{ server=await B.startServer(); br=await B.launch(); });
after(async ()=>{ await br.close(); server.close(); });
async function load(p, set){ await p.evaluate(async ([L, NONE, set])=>{ await addEntries(L.map(([n,t])=>({file:new File([t],n), path:n}))); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
  Object.assign(S, NONE, set||{}); S.docTitle='Prova'; saveS(); syncControls(); go(3); renderSummary(); }, [SPECTRA, NONE, set]); }
async function desk(set){ const o=await openDesk(B, br, server); await o.p.waitForFunction(()=>window.__mock && window.__mock.menu); await load(o.p, set);
  await o.p.evaluate(()=>{ window.__mock.pick.pick_export_dir={path:'/out/scelta', name:'scelta'}; }); return o; }
// clic su un pulsante della finestra di scelta della pagina, appena compare
const answer=(p, label)=>p.waitForFunction(()=>$('#dlgConfirm').open, null, {timeout:20000}).then(()=>p.evaluate(l=>{ const m=$('#cfMsg').textContent; [...document.querySelectorAll('#cfBtns button')].find(b=>b.textContent.trim()===l).click(); return m; }, label));
const disk=p=>p.evaluate(()=>Object.keys(window.__mock.disk).sort());
const done=async o=>{ const e=o.errors.slice(); await o.ctx.close(); assert.deepStrictEqual(e, []); };

describe('Esportazione per voci, desktop', {timeout:10*60*1000}, ()=>{
  it('3 voci (PDF, picchi, dati elaborati) → esattamente i loro file nella cartella scelta, nessuno ZIP; contenuto identico a quello dello ZIP', async ()=>{
    const o=await desk({outPdf:true, csvPeaks:true, csvData:true});
    const r=await o.p.evaluate(async ()=>{ const M=window.__mock, seen=[]; new MutationObserver(()=>seen.push({t:performance.now(), s:$('#status').textContent})).observe($('#status'),{childList:true,characterData:true,subtree:true});
      M.writeDelay=300; await runExport(); const last=M.writes.length ? Math.max(...M.writes.map(w=>w.t)) : 0, st=$('#status').textContent, dn=!$('#expDone').hidden && $('#expDone').innerText;
      const z=await buildZip(), zz=await JSZip.loadAsync(z), inZip={}; for (const k of Object.keys(zz.files)) if (!zz.files[k].dir) inZip[k.split('/').slice(1).join('/')]=Array.from(await zz.file(k).async('uint8array'));
      const pdf=Object.entries(M.disk).find(([k])=>/\.pdf$/.test(k));
      return {disk:Object.keys(M.disk).sort(), status:st, early:seen.filter(x=>x.t<last).map(x=>x.s).filter(s=>/completata/.test(s)),
        done:dn, kinds:M.calls.filter(c=>c.cmd==='pick_export_dir').map(c=>c.args.kind), saves:M.calls.filter(c=>c.cmd==='pick_save').length,
        same:Object.entries(M.disk).filter(([k])=>/\.csv$/.test(k)).map(([k,v])=>{ const rel=k.slice('/out/scelta/'.length), zb=inZip[rel]; return [rel, !!zb && zb.length===v.length && zb.every((b,i)=>b===v[i])]; }),
        pdf:pdf && (()=>{ let t=''; for (let i=0;i<pdf[1].length;i+=0x8000) t+=String.fromCharCode.apply(null,pdf[1].slice(i,i+0x8000)); return btoa(t); })(), names:{peaks:expName('peaks'), pdf:expName('pdf')}}; });
    await done(o);
    assert.strictEqual(r.disk.length, 5, 'file scritti: '+r.disk.join(', '));   // PDF, elenco dei picchi e un CSV di dati elaborati per ognuno dei 3 spettri
    assert.ok(r.disk.includes('/out/scelta/'+r.names.peaks) && r.disk.includes('/out/scelta/'+r.names.pdf), r.disk.join(', '));
    assert.deepStrictEqual(r.disk.filter(k=>/dati_elaborati\/[abc]\.csv$/.test(k)).length, 3, r.disk.join(', '));
    assert.ok(!r.disk.some(k=>/\.zip$/.test(k)), 'nessuno ZIP');
    assert.strictEqual(r.saves, 0, 'nessun dialogo di salvataggio per file: una sola cartella');
    assert.deepStrictEqual(r.kinds, ['export'], 'cartella ricordata per le esportazioni');
    assert.match(r.status, /Esportazione completata: 5 file in «scelta»/);
    assert.deepStrictEqual(r.early, [], 'messaggio di fine prima della scrittura');
    assert.ok(r.done && /5 file scritti/.test(r.done) && /\/out\/scelta/.test(r.done) && /Mostra nella cartella/.test(r.done), 'riepilogo: '+r.done);
    assert.ok(r.same.length===4 && r.same.every(x=>x[1]), 'CSV diversi da quelli dello ZIP: '+JSON.stringify(r.same));
    assert.ok(pdfText(Buffer.from(r.pdf,'base64')).includes('Prova'), 'PDF leggibile con il titolo');
  });
  it('esattamente 3 voci a file singolo → 3 file', async ()=>{
    const o=await desk({outPdf:true, csvPeaks:true, outTrace:true});
    await o.p.evaluate(()=>runExport()); const d=await disk(o.p); await done(o);
    assert.deepStrictEqual(d.map(k=>k.split('/').pop().replace(/_\d{8}_\d{4}/,'')), ['Prova.pdf','elenco_picchi.csv','tracciabilita.csv']);
  });
  it('conflitto con un file esistente → richiesta; «Rinomina», «Salta», «Sostituisci», «Annulla»', async ()=>{
    const o=await desk({csvPeaks:true, outTrace:true});
    const out={};
    for (const [btn, key] of [['Rinomina','ren'],['Salta','skip'],['Sostituisci','rep'],['Annulla','can']]){
      await o.p.evaluate(()=>{ const M=window.__mock; M.disk={'/out/scelta/elenco_picchi.csv':[1,2,3]}; M.writes.length=0; $('#status').textContent=''; });
      const run=o.p.evaluate(()=>runExport()), msg=await answer(o.p, btn); await run;
      out[key]=await o.p.evaluate(m=>({msg:m, disk:Object.keys(window.__mock.disk).sort(), old:window.__mock.disk['/out/scelta/elenco_picchi.csv'].length, status:$('#status').textContent, done:!$('#expDone').hidden}), msg);
    }
    await done(o);
    assert.match(out.ren.msg, /scelta.*elenco_picchi\.csv/);
    assert.deepStrictEqual(out.ren.disk, ['/out/scelta/elenco_picchi.csv','/out/scelta/elenco_picchi_2.csv','/out/scelta/tracciabilita.csv']); assert.strictEqual(out.ren.old, 3, 'il file esistente è rimasto intatto');
    assert.deepStrictEqual(out.skip.disk, ['/out/scelta/elenco_picchi.csv','/out/scelta/tracciabilita.csv']); assert.strictEqual(out.skip.old, 3); assert.match(out.skip.status, /1 file in/);
    assert.ok(out.rep.old>3, 'sostituito'); assert.strictEqual(out.rep.disk.length, 2);
    assert.deepStrictEqual(out.can.disk, ['/out/scelta/elenco_picchi.csv']); assert.strictEqual(out.can.status, ''); assert.strictEqual(out.can.done, false);
  });
  it('annullamento della cartella → nessun file, nessun messaggio di successo', async ()=>{
    const o=await desk({outPdf:true, csvPeaks:true});
    const r=await o.p.evaluate(async ()=>{ const M=window.__mock; M.pick.pick_export_dir=null; await runExport(); await new Promise(r=>setTimeout(r,800));
      return {writes:M.writes.length, disk:Object.keys(M.disk).length, status:$('#status').textContent, done:!$('#expDone').hidden, tip:$('#tip3').textContent}; });
    await done(o);
    assert.deepStrictEqual([r.writes, r.disk, r.status, r.done], [0, 0, '', false]);
    assert.doesNotMatch(r.tip, /completata/);
  });
  it('«Mostra nella cartella» chiama il comando nativo sulla cartella scelta', async ()=>{
    const o=await desk({csvPeaks:true});
    const r=await o.p.evaluate(async ()=>{ await runExport(); $('#expReveal').click(); await new Promise(r=>setTimeout(r,200)); return window.__mock.calls.filter(c=>c.cmd==='reveal_in_dir').map(c=>c.args); });
    await done(o);
    assert.deepStrictEqual(r, [{dir:'/out/scelta', rel:'elenco_picchi.csv'}]);
  });
  it('sottocartella facoltativa con il nome del progetto, nomi modificati, ZIP solo se chiesto', async ()=>{
    const o=await desk({csvPeaks:true, outTrace:true, expSub:true, expNames:{peaks:'picchi miei', sub:'Campagna/../2026'}});
    const a=await o.p.evaluate(async ()=>{ await runExport(); return Object.keys(window.__mock.disk).sort(); });
    const rv=await o.p.evaluate(async ()=>{ $('#expReveal').click(); await new Promise(r=>setTimeout(r,200)); return window.__mock.reveals; });
    const b=await o.p.evaluate(async ()=>{ const M=window.__mock; M.disk={}; Object.assign(S,{expSub:false, zipAll:true, expNames:{zip:'tutto'}}); await runExport(); return Object.keys(M.disk); });
    const z=await o.p.evaluate(async ()=>{ const u=window.__mock.disk['/out/scelta/tutto.zip']; const zz=await JSZip.loadAsync(Uint8Array.from(u)); return Object.keys(zz.files).filter(k=>!zz.files[k].dir).sort(); });
    await done(o);
    assert.deepStrictEqual(a, ['/out/scelta/Campagna/2026/picchi miei.csv','/out/scelta/Campagna/2026/tracciabilita.csv']);
    assert.deepStrictEqual(rv, ['/out/scelta/Campagna/2026/tracciabilita.csv'], '«Mostra nella cartella» dentro la sottocartella');
    assert.deepStrictEqual(b, ['/out/scelta/tutto.zip']);
    assert.deepStrictEqual(z, ['tutto/elenco_picchi.csv','tutto/tracciabilita.csv']);
  });
  it('spettri inclusi: tutti, spuntati, uno; dati originali; progetto', async ()=>{
    const o=await desk({outPng:true, cmpPng:false, pngDpi:300, pngW:6, pngH:4});
    const r=await o.p.evaluate(async ()=>{ const M=window.__mock, n=async sc=>{ M.disk={}; S.expScope=sc; await runExport(); return Object.keys(M.disk).filter(k=>/\.png$/.test(k)).length; };
      files[1].include=false; const res={sel:await n('sel'), all:await n('all'), one:await n('one')};
      Object.assign(S,{outPng:false, csvRaw:true, outProject:true, expScope:'one'}); M.disk={}; await runExport(); res.files=Object.keys(M.disk).sort();
      const raw=Object.entries(M.disk).find(([k])=>/dati_originali/.test(k)); const L=raw && new TextDecoder('utf-8',{ignoreBOM:true}).decode(Uint8Array.from(raw[1])).split('\r\n'); res.raw=L && [L[0], L.length, L.includes('4000;0,1')];
      const pj=Object.entries(M.disk).find(([k])=>/\.acchspettri$/.test(k)); res.proj=pj && (await AcchFormat.decode(Uint8Array.from(pj[1]), JSZip)).spectra.length; return res; });
    await done(o);
    assert.deepStrictEqual([r.sel, r.all, r.one], [2, 3, 1]);
    assert.strictEqual(r.files.length, 2, r.files.join(', ')); assert.ok(r.files.some(k=>/dati_originali\/a\.csv$/.test(k)), r.files.join(', '));
    assert.deepStrictEqual(r.raw, ['﻿Numero d\'onda (cm-1);Assorbanza', 401, true], 'BOM, intestazione e i 400 punti letti dal file');
    assert.strictEqual(r.proj, 3, 'il progetto contiene tutti gli spettri');
  });
  it('errore di scrittura: elenco dei file non scritti, nessun «completata»', async ()=>{
    const o=await desk({csvPeaks:true, outTrace:true});
    const r=await o.p.evaluate(async ()=>{ window.__mock.failRel=/elenco/; await runExport(); return {status:$('#status').textContent, done:$('#expDone').innerText, disk:Object.keys(window.__mock.disk)}; });
    await done(o);
    assert.match(r.status, /incompleta: 1 file non scritto/);
    assert.match(r.done, /File non scritti[\s\S]*elenco_picchi\.csv/);
    assert.deepStrictEqual(r.disk, ['/out/scelta/tracciabilita.csv']);
  });
  it('voce singola dai menu: «Questo grafico come PNG…» con il salvataggio nativo, un file', async ()=>{
    const o=await desk({});
    const r=await o.p.evaluate(async ()=>{ const M=window.__mock; cur=0; M.pick.pick_save={path:'/out/a.png', name:'a.png'};
      const file=M.menu.find(m=>m.text==='File'), sub=file.items.find(x=>x.text==='Esporta una voce'), png=sub.items.find(x=>/PNG/.test(x.text)); await png.action();
      M.pick.pick_save={path:'/out/a.csv', name:'a.csv'}; await sub.items.find(x=>/CSV/.test(x.text)).action();
      return {saves:M.calls.filter(c=>c.cmd==='pick_save').map(c=>[c.args.suggested, c.args.kind]), writes:M.writes.map(w=>w.path), labels:sub.items.map(x=>x.text)}; });
    await done(o);
    assert.deepStrictEqual(r.saves, [['a.png','export'],['a_elenco_picchi.csv','export']]);
    assert.deepStrictEqual(r.writes, ['/out/a.png','/out/a.csv']);
    assert.strictEqual(r.labels.length, 4);
  });
  it('preimpostazioni: l\'insieme di voci e i nomi si salvano e si richiamano; lo ZIP è spento di default', async ()=>{
    const o=await desk({});
    const r=await o.p.evaluate(()=>{ const def=DEFAULTS.zipAll; Object.assign(S,{outPdf:true, csvRaw:true, outTrace:false, expScope:'all', expNames:{pdf:'relazione'}}); saveS();
      $('#presetName').value='voci'; $('#presetSave').click(); Object.assign(S,{outPdf:false, csvRaw:false, outTrace:true, expScope:'sel', expNames:{}}); saveS();
      $('#presetSel').value='voci'; $('#presetLoad').click(); const old=merge(DEFAULTS,{oneFile:true});
      return {def, oldZip:old.zipAll, got:[S.outPdf, S.csvRaw, S.outTrace, S.expScope, expName('pdf')], box:$('[data-nm="pdf"]').value}; });
    await done(o);
    assert.strictEqual(r.def, false); assert.strictEqual(r.oldZip, false, 'le impostazioni salvate con «tutto in uno ZIP» non riaccendono lo ZIP');
    assert.deepStrictEqual(r.got, [true, true, false, 'all', 'relazione.pdf']);
    assert.strictEqual(r.box, 'relazione');
  });
});

describe('Esportazione per voci, online', {timeout:10*60*1000}, ()=>{
  async function web(set){ const o=await B.openPage(br, server, {}); await load(o.p, set); await o.p.evaluate(()=>{ window.__dl=[]; window.download=(b,n)=>window.__dl.push([n,b]); }); return o; }
  const got=p=>p.evaluate(async ()=>{ await new Promise(r=>setTimeout(r,(window.__dl.length+4)*700)); return window.__dl.map(x=>x[0]); });
  it('una voce → un solo file', async ()=>{
    const o=await web({csvPeaks:true});
    await o.p.evaluate(()=>runExport()); const n=await got(o.p); await done(o);
    assert.deepStrictEqual(n, ['elenco_picchi.csv']);
  });
  it('ZIP richiesto → uno ZIP con le sole voci scelte', async ()=>{
    const o=await web({csvPeaks:true, outPdf:true, zipAll:true});
    await o.p.evaluate(()=>runExport()); await got(o.p);
    const r=await o.p.evaluate(async ()=>{ const [n,b]=window.__dl[0]; const zz=await JSZip.loadAsync(b); return {n:window.__dl.map(x=>x[0]), list:Object.keys(zz.files).filter(k=>!zz.files[k].dir).map(k=>k.split('/').slice(1).join('/').replace(/_\d{8}_\d{4}/,''))}; });
    await done(o);
    assert.strictEqual(r.n.length, 1); assert.match(r.n[0], /^Prova_\d{8}_\d{4}\.zip$/);
    assert.deepStrictEqual(r.list.sort(), ['Prova.pdf','elenco_picchi.csv']);
  });
  it('più di 3 file → proposta dello ZIP; «No, uno per uno» la rifiuta', async ()=>{
    const o=await web({csvPeaks:true, csvData:true, outTrace:true});
    const run=o.p.evaluate(()=>runExport()), msg=await answer(o.p, 'No, uno per uno'); await run; const n=await got(o.p);
    await o.p.evaluate(()=>{ window.__dl=[]; }); const run2=o.p.evaluate(()=>runExport()); await answer(o.p, 'Sì, un file ZIP'); await run2; const z=await got(o.p);
    await done(o);
    assert.match(msg, /5 file/);
    assert.deepStrictEqual(n.sort(), ['dati_elaborati_a.csv','dati_elaborati_b.csv','dati_elaborati_c.csv','elenco_picchi.csv','tracciabilita.csv']);
    assert.strictEqual(z.length, 1); assert.match(z[0], /\.zip$/);
  });
});
