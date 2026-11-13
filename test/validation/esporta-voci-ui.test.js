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
const {describe, it, before, after}=require('node:test'), assert=require('node:assert'), path=require('path'), fs=require('fs'), crypto=require('crypto');
const B=require('./browser.js'), {openDesk}=require('./tauri-mock.js'), {pdfText}=require('./pdf-text.js');
const JSZip=require(path.join(B.ROOT,'node_modules','jszip'));

const ftir=k=>'Wavenumber (cm-1),Absorbance\n'+Array.from({length:400},(_,i)=>(4000-i*8)+','+(0.1+Math.exp(-Math.pow((i-150-k)/9,2))+0.5*Math.exp(-Math.pow((i-260)/6,2))).toFixed(4)).join('\n');
const SPECTRA=[['a.csv',ftir(0)],['b.csv',ftir(20)],['c.csv',ftir(40)]];
const NONE={outPdf:false,outPng:false,outSvg:false,csvPeaks:false,csvData:false,csvRaw:false,outOrig:false,outAnalysis:false,outTrace:false,outOrigin:false,outProject:false,zipAll:false,expSub:false,expScope:'sel',expNames:{}};
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
      const raw=Object.entries(M.disk).find(([k])=>/dati_originali/.test(k)); const L=raw && new TextDecoder('utf-8',{ignoreBOM:true}).decode(Uint8Array.from(raw[1])).split('\r\n'); res.raw=L && [L[0], L.length, L[1], L[400]];
      const pj=Object.entries(M.disk).find(([k])=>/\.acchspettri$/.test(k)); res.proj=pj && (await AcchFormat.decode(Uint8Array.from(pj[1]), JSZip)).spectra.length; return res; });
    await done(o);
    assert.deepStrictEqual([r.sel, r.all, r.one], [2, 3, 1]);
    assert.strictEqual(r.files.length, 2, r.files.join(', ')); assert.ok(r.files.some(k=>/dati_originali\/a\.csv$/.test(k)), r.files.join(', '));
    assert.deepStrictEqual(r.raw, ['﻿Wavenumber (cm-1);Absorbance', 401, '4000;0,1', '808;0,1'], 'BOM, nomi delle colonne del file, 400 punti nell\'ordine del file (4000 → 808)');
    assert.strictEqual(r.proj, 3, 'il progetto contiene tutti gli spettri');
  });
  it('dati originali: ordine delle righe del file e valori scritti, anche quando l\'app converte l\'asse (eV → nm)', async ()=>{
    // SINTETICO: asse in eV crescente (l'app lo converte in nm e lo riordina), valori con molte cifre
    const ev='Energy (eV),Absorbance\n'+Array.from({length:60},(_,i)=>(1.5+i*0.025).toFixed(3)+','+(0.123456789012+i*1e-7).toFixed(12)).join('\n');
    const o=await desk({csvRaw:true});
    const r=await o.p.evaluate(async t=>{ await addEntries([{file:new File([t],'uv_ev.csv'), path:'uv_ev.csv'}]); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
      cur=files.findIndex(f=>f.name==='uv_ev.csv'); S.expScope='one'; await runExport();
      const k=Object.keys(window.__mock.disk).find(x=>/uv_ev\.csv$/.test(x)); const f=files[cur];
      return {lines:new TextDecoder('utf-8',{ignoreBOM:true}).decode(Uint8Array.from(window.__mock.disk[k])).split('\r\n'), shownFirst:f.xs[0], shownLast:f.xs[f.xs.length-1]}; }, ev);
    await done(o);
    const src=ev.split('\n');
    assert.ok(r.shownFirst<r.shownLast && r.shownFirst>400, `l'app mostra l'asse convertito in nm (${r.shownFirst}…${r.shownLast})`);
    assert.strictEqual(r.lines[0], '﻿Energy (eV);Absorbance');
    assert.deepStrictEqual(r.lines.slice(1).map(l=>l.split(';').map(v=>+v.replace(',','.'))), src.slice(1).map(l=>l.split(',').map(Number)), 'stessi valori, stesso ordine del file');
  });
  it('conflitti file per file: senza la spunta si chiede per ogni file; con «Applica a tutti i file rimanenti» una volta sola', async ()=>{
    const o=await desk({csvPeaks:true, outTrace:true});
    const prep=()=>o.p.evaluate(()=>{ const M=window.__mock; M.disk={'/out/scelta/elenco_picchi.csv':[1],'/out/scelta/tracciabilita.csv':[1,2]}; window.__asked=[]; });
    const ask=(btn, all)=>o.p.waitForFunction(()=>$('#dlgConfirm').open, null, {timeout:20000}).then(()=>o.p.evaluate(([btn,all])=>{ const box=document.querySelector('.cfall input'); window.__asked.push({msg:$('#cfMsg').textContent, box:!!box, boxText:box&&box.parentElement.textContent});
      if (all) box.checked=true; [...document.querySelectorAll('#cfBtns button')].find(b=>b.textContent.trim()===btn).click(); }, [btn, all]));
    const state=()=>o.p.evaluate(()=>({disk:Object.fromEntries(Object.entries(window.__mock.disk).map(([k,v])=>[k.slice(12), v.length])), asked:window.__asked}));
    await prep(); let run=o.p.evaluate(()=>runExport()); await ask('Rinomina'); await ask('Salta'); await run; const a=await state();
    await prep(); run=o.p.evaluate(()=>runExport()); await ask('Sostituisci', true); await run; const b=await state();
    await prep(); run=o.p.evaluate(()=>runExport()); await ask('Sostituisci'); await ask('Annulla'); await run; const c=await state();
    await done(o);
    assert.strictEqual(a.asked.length, 2, 'una domanda per file'); assert.match(a.asked[0].msg, /«scelta».*«tracciabilita\.csv»/); assert.ok(a.asked[0].box && /rimanenti \(1\)/.test(a.asked[0].boxText)); assert.strictEqual(a.asked[1].box, false, 'all\'ultimo file la casella non serve');
    assert.deepStrictEqual(a.disk, {'elenco_picchi.csv':1, 'tracciabilita.csv':2, 'tracciabilita_2.csv':a.disk['tracciabilita_2.csv']}); assert.ok(a.disk['tracciabilita_2.csv']>2);
    assert.strictEqual(b.asked.length, 1, 'con la spunta una sola domanda'); assert.ok(b.disk['elenco_picchi.csv']>1 && b.disk['tracciabilita.csv']>2, 'tutti sostituiti');
    assert.deepStrictEqual(c.disk, {'elenco_picchi.csv':1, 'tracciabilita.csv':2}, 'Annulla al secondo file: niente scritto, nemmeno il primo');
  });
  it('nomi validi su Windows: punto o spazio finale, nomi riservati, caratteri vietati, percorsi lunghi; avviso chiaro', async ()=>{
    const o=await desk({csvPeaks:true, outTrace:true, csvData:true, expNames:{trace:'CON', data:'dati<1>?'}});
    const r=await o.p.evaluate(async ()=>{ const M=window.__mock; files[0].title='NUL'; files[1].title='prova. '; files[2].title='COM3.dati'; [0,1,2].forEach(i=>persist(files[i]));
      const el=$('[data-nm="peaks"]'); el.value='picchi: finale. '; el.dispatchEvent(new Event('change')); const note=el.parentElement.querySelector('.nmwarn');
      await runExport();
      const longP=winPath('a'.repeat(100)+'/'+'b'.repeat(150)+'.csv');
      M.disk={}; M.pick.pick_export_dir={path:'/'+'x'.repeat(250), name:'lunga'}; await runExport();
      return {note:note&&!note.hidden&&note.textContent, names:[expName('peaks'), expName('trace'), expName('data')], disk:Object.keys(window.__mock.disk),
        long:[longP.length, /\.csv$/.test(longP)], done:$('#expDone').innerText, status:$('#status').textContent,
        res:['CON','con.txt','lpt1','COM9.csv','a.','b ','x<y>|z?*"','COM10','console'].map(winSeg)}; });
    await done(o);
    assert.match(r.note||'', /Nome corretto in «picchi_ finale\.csv»: caratteri non ammessi da Windows.*punto o spazio finale/);
    assert.deepStrictEqual(r.names, ['picchi_ finale.csv', '_CON.csv', 'dati_1_']);
    assert.deepStrictEqual(r.res, ['_CON','_con.txt','_lpt1','_COM9.csv','a','b','x_y__z___','COM10','console']);
    assert.ok(r.long[0]<=180 && r.long[1], 'percorso relativo accorciato con l\'estensione: '+r.long);
    assert.strictEqual(r.disk.length, 0, 'su Windows nulla oltre 260 caratteri');
    assert.match(r.status, /incompleta/); assert.match(r.done, /Percorso troppo lungo per Windows/);
  });
  it('nomi proposti dai titoli degli spettri: corretti per Windows e dichiarati', async ()=>{
    const o=await desk({csvData:true});
    const r=await o.p.evaluate(async ()=>{ files[0].title='NUL'; files[1].title='prova. '; files[2].title='a|b'; [0,1,2].forEach(i=>persist(files[i])); await runExport();
      return {disk:Object.keys(window.__mock.disk).map(k=>k.slice(12)).sort(), done:$('#expDone').innerText}; });
    await done(o);
    assert.deepStrictEqual(r.disk, ['dati_elaborati/_NUL.csv','dati_elaborati/a_b.csv','dati_elaborati/prova..csv']);
    assert.match(r.done, /Nomi corretti per Windows[\s\S]*NUL\.csv → dati_elaborati\/_NUL\.csv/);
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

// «Copia identica del file originale»: i byte caricati, con nome ed estensione, per un binario (.spa), un JCAMP, un MCA e un CSV (dati SINTETICI e del corpus)
function spaBytes(){ const n=200, buf=new ArrayBuffer(2000), dv=new DataView(buf); 'campione'.split('').forEach((c,i)=>dv.setUint8(30+i,c.charCodeAt(0)));
  dv.setUint8(304,2); dv.setUint32(306,600,true); dv.setUint8(320,3); dv.setUint32(322,800,true); dv.setUint32(326,4*n,true); dv.setUint8(336,0);
  dv.setUint32(604,n,true); dv.setUint32(608,1,true); dv.setUint32(612,17,true); dv.setFloat32(616,4000,true); dv.setFloat32(620,400,true);
  for (let i=0;i<n;i++) dv.setFloat32(800+4*i, 0.1+Math.exp(-Math.pow((i-80)/6,2)), true); return Buffer.from(buf); }
const JDX=['##TITLE=prova SINTETICA','##JCAMP-DX=5.01','##DATA TYPE=INFRARED SPECTRUM','##XUNITS=1/CM','##YUNITS=ABSORBANCE','##XFACTOR=1','##YFACTOR=1','##NPOINTS=120','##XYPOINTS=(XY..XY)']
  .concat(Array.from({length:120},(_,i)=>(1000+i*10)+', '+(0.1+Math.exp(-Math.pow((i-60)/5,2))).toFixed(5))).concat(['##END=']).join('\r\n');
const ORIG=[['campione.spa', spaBytes()], ['prova.jdx', Buffer.from(JDX,'latin1')], ['A08_bronzo_senzacal.mca', fs.readFileSync(path.join(B.ROOT,'test','corpus','xrf','A08_bronzo_senzacal.mca'))], ['dati;con spazi.csv', Buffer.from('﻿'+ftir(5).replace(/\n/g,'\r\n'),'utf8')]];
const sha=b=>crypto.createHash('sha256').update(Buffer.from(b)).digest('hex');
async function loadOrig(p){ return p.evaluate(async L=>{ const ents=L.map(([n,b])=>({file:new File([Uint8Array.from(atob(b),c=>c.charCodeAt(0))],n), path:n})); files.length=0; cur=-1; await addEntries(ents); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
  S.expScope='all'; S.outOrig=true; saveS(); syncControls(); renderSummary(); return files.map(f=>[f.name, f.instr, !!f.rawBin]); }, ORIG.map(([n,b])=>[n, b.toString('base64')])); }
describe('Copia identica del file originale', {timeout:10*60*1000}, ()=>{
  it('desktop: binario, JCAMP, MCA e CSV identici byte per byte (SHA-256), con nome ed estensione', async ()=>{
    const o=await desk({}); const loaded=await loadOrig(o.p);
    const r=await o.p.evaluate(async ()=>{ await runExport(); return Object.entries(window.__mock.disk).map(([k,v])=>[k, v]); });
    await done(o);
    assert.strictEqual(loaded.length, 4, 'spettri letti: '+JSON.stringify(loaded)); assert.ok(loaded.some(x=>x[2]), 'il .spa è letto come binario');
    const got=Object.fromEntries(r.map(([k,v])=>[k.slice('/out/scelta/'.length), sha(Uint8Array.from(v))]));
    assert.deepStrictEqual(got, Object.fromEntries(ORIG.map(([n,b])=>['file_originali/'+n, sha(b)])));
  });
  it('online: la voce sola con uno spettro scarica un solo file, identico', async ()=>{
    const o=await B.openPage(br, server, {}); await load(o.p, {}); await loadOrig(o.p);
    const r=await o.p.evaluate(async ()=>{ window.__dl=[]; window.download=(b,n)=>window.__dl.push([n,b]); S.expScope='one'; cur=files.findIndex(f=>/\.jdx$/.test(f.name)); await runExport(); await new Promise(r=>setTimeout(r,1500));
      return Promise.all(window.__dl.map(async ([n,b])=>[n, Array.from(new Uint8Array(await b.arrayBuffer()))])); });
    await done(o);
    assert.strictEqual(r.length, 1); assert.strictEqual(r[0][0], 'file_originali_prova.jdx'); assert.strictEqual(sha(Uint8Array.from(r[0][1])), sha(ORIG[1][1]));
  });
  it('senza i byte originali (progetto vecchio) la voce è spenta e dice perché; con alcuni mancanti li elenca', async ()=>{
    const o=await desk({outOrig:true, expScope:'all'});
    const r=await o.p.evaluate(async ()=>{ delete files[0].raw; renderSummary(); const part={note:$('#origNote').textContent, dis:$('[data-k="outOrig"]').disabled};
      files.forEach(f=>{ delete f.raw; }); renderSummary(); const all={note:$('#origNote').textContent, dis:$('[data-k="outOrig"]').disabled, btn:$('#doDl').disabled};
      return {part, all}; });
    await done(o);
    assert.strictEqual(r.part.dis, false); assert.match(r.part.note, /Senza file originale, viene saltato: a\.csv/);
    assert.strictEqual(r.all.dis, true); assert.match(r.all.note, /Non disponibile: il progetto non contiene i file originali/);
    assert.strictEqual(r.all.btn, true, 'con la sola voce non disponibile non si esporta niente');
  });
});
