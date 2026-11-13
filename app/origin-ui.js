// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Progetti Origin nell'interfaccia: finestra «Contenuto del progetto Origin» (scelta degli spettri da importare)
   e voce di esportazione .opj/.opju. La lettura e la scrittura sono in app/origin-core.js. Testi senza emoji: valgono
   anche per il desktop. Usa le funzioni globali di index.html (addEntries, toast, download, included, processed…). */
(function(){
  'use strict';
  if (!window.AcchOrigin) return;
  const O=window.AcchOrigin;
  const en=()=>typeof uiEn==='function' && uiEn();
  const tx=(it,e)=>en()?e:it;
  const h=s=>(typeof esc==='function'?esc:String)(s);
  const fmt=n=>Number(n).toLocaleString(en()?'en-GB':'it-IT');
  let dlg=null, queue=[], cur=null;

  function ensureDialog(){
    if (dlg) return dlg;
    dlg=document.createElement('dialog'); dlg.id='dlgOrigin'; dlg.className='wide'; dlg.setAttribute('aria-labelledby','orTitle');
    dlg.innerHTML='<div class="dlg"><h2 id="orTitle"></h2><p class="why" id="orWhy" style="margin:4px 0 8px"></p>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 8px"><button class="btn small" type="button" id="orAll" style="width:auto"></button><button class="btn small" type="button" id="orNone" style="width:auto"></button><span id="orGraphs" style="display:flex;gap:6px;flex-wrap:wrap"></span></div>'+
      '<div id="orList" style="max-height:52vh;overflow:auto;border:1px solid var(--line,#ccc);border-radius:8px;padding:6px 10px"></div>'+
      '<p class="why" id="orNote" style="margin:8px 0 0"></p>'+
      '<div class="actions"><button class="btn" type="button" id="orCancel"></button><button class="btn primary" type="button" id="orOk"></button></div></div>';
    document.body.appendChild(dlg);
    dlg.querySelector('#orCancel').onclick=()=>{ dlg.close(); next(); };
    dlg.querySelector('#orOk').onclick=()=>importChosen();
    dlg.querySelector('#orAll').onclick=()=>setAll(true);
    dlg.querySelector('#orNone').onclick=()=>setAll(false);
    dlg.addEventListener('cancel', ()=>setTimeout(next,0));
    return dlg;
  }
  const boxes=()=>[...dlg.querySelectorAll('input[data-sp]')];
  function setAll(v){ boxes().forEach(b=>{ if (!b.disabled) b.checked=v; }); count(); }
  function count(){ const n=boxes().filter(b=>b.checked).length; const ok=dlg.querySelector('#orOk'); ok.disabled=!n; ok.textContent=n?tx(`Importa ${n} ${n===1?'spettro':'spettri'}`,`Import ${n} ${n===1?'spectrum':'spectra'}`):tx('Scegli almeno uno spettro','Choose at least one spectrum'); }

  function why(sp){
    const L=[];
    if (sp.error==='no-x') return tx('nessuna colonna X nel foglio','no X column in the sheet');
    if (sp.error) return tx('non letto: ','not read: ')+O.message(sp.error, en());
    if (sp.assumedX) L.push(tx(`nessuna colonna è designata X nel foglio: come X uso la colonna ${sp.x}`,`no column is designated X in the sheet: column ${sp.x} is used as X`));
    if (sp.typeUnknown) L.push(tx('designazione della colonna non trovata','column designation not found'));
    const v=O.pairValues(sp); if (v.dropped) L.push(tx(`${fmt(v.dropped)} righe senza numero saltate`,`${fmt(v.dropped)} rows without a number skipped`));
    return L.join('; ');
  }
  function colTxt(c){ if (!c) return ''; const bits=[c.longName, c.units?'('+c.units+')':''].filter(Boolean).join(' '); return c.name+(bits?' · '+bits:''); }

  function show(item){
    cur=item; ensureDialog();
    const {name, model, spectra}=item;
    dlg.querySelector('#orTitle').textContent=tx('Contenuto del progetto Origin','Origin project contents');
    dlg.querySelector('#orWhy').textContent=tx(`${name}: ${model.books.length} ${model.books.length===1?'cartella':'cartelle'} di lavoro, ${spectra.length} ${spectra.length===1?'spettro':'spettri'} (coppie X/Y). Scegli quali importare: ognuno diventa uno spettro.`,
      `${name}: ${model.books.length} ${model.books.length===1?'workbook':'workbooks'}, ${spectra.length} ${spectra.length===1?'spectrum':'spectra'} (X/Y pairs). Choose which to import: each one becomes a spectrum.`);
    dlg.querySelector('#orAll').textContent=tx('Seleziona tutti','Select all');
    dlg.querySelector('#orNone').textContent=tx('Nessuno','None');
    dlg.querySelector('#orCancel').textContent=tx('Annulla','Cancel');
    const rows=[];
    for (const B of model.books){
      rows.push(`<div style="font-weight:600;margin:8px 0 2px">${h(B.label&&B.label!==B.name?B.label+' ['+B.name+']':B.name)}</div>`);
      for (const S of B.sheets){
        const list=spectra.filter(s=>s.book===B.name && s.sheet===S.index); if (!list.length) continue;
        rows.push(`<div style="margin:4px 0 2px 8px;opacity:.85">${h(tx('Foglio','Sheet')+' '+S.index)}</div>`);
        for (const sp of list){
          const i=spectra.indexOf(sp), w=why(sp), bad=!!sp.error || !sp.n;
          rows.push(`<label style="display:flex;gap:8px;align-items:flex-start;margin:2px 0 2px 16px"><input type="checkbox" data-sp="${i}" ${bad?'disabled':'checked'}><span><b>${h(sp.label)}</b> <small>· ${fmt(sp.n)} ${tx('punti','points')}</small><br><small>X: ${h(colTxt(sp.xCol)||'—')} · Y: ${h(colTxt(sp.yCol))}${sp.yCol.comments&&sp.yCol.comments!==sp.label?' · '+h(sp.yCol.comments):''}</small>${w?`<br><small class="${bad?'err':'warn'}">${h(w)}</small>`:''}</span></label>`);
        }
      }
    }
    dlg.querySelector('#orList').innerHTML=rows.join('');
    const g=dlg.querySelector('#orGraphs');
    g.innerHTML=model.graphs.map((G,k)=>`<button class="btn small ghost" type="button" data-g="${k}">${h(tx('Solo le curve di ','Only the curves of ')+(G.label||G.name))}</button>`).join('');
    g.querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>{ const G=model.graphs[+b.dataset.g];
      boxes().forEach(x=>{ const sp=spectra[+x.dataset.sp]; x.checked=!x.disabled && G.curves.some(c=>c.y.book===sp.book && c.y.sheet===sp.sheet && c.y.col===sp.y); }); count(); });
    const warn=model.format==='opj' && !O.VERIFIED.readOpj;
    dlg.querySelector('#orNote').textContent=(warn?tx('Lettura dei progetti .opj non ancora verificata su progetti reali: confronta i valori con l\'originale. ','Reading of .opj projects not yet verified on real projects: compare the values with the original. '):'')+
      tx('Si importano solo i valori numerici dei fogli; grafici, analisi e formule di Origin non si importano.','Only the numeric worksheet values are imported; Origin graphs, analyses and formulas are not imported.');
    boxes().forEach(b=>b.onchange=count); count();
    if (!dlg.open) dlg.showModal();
  }
  /* testo a tabulazioni con i numeri alla precisione piena (String() è reversibile): lo legge il normale percorso di importazione */
  function asText(sp){
    const v=O.pairValues(sp), xn=[sp.xCol.longName||sp.xCol.name, sp.xCol.units?'('+sp.xCol.units+')':''].filter(Boolean).join(' '),
      yn=[sp.label, sp.yCol.units?'('+sp.yCol.units+')':''].filter(Boolean).join(' ');
    const clean=s=>String(s).replace(/[\t\r\n]+/g,' ');
    const L=[clean(xn)+'\t'+clean(yn)];
    for (let i=0;i<v.xs.length;i++) L.push(String(v.xs[i])+'\t'+String(v.ys[i]));
    return L.join('\r\n');
  }
  async function importChosen(){
    const {name, path, spectra}=cur, chosen=boxes().filter(b=>b.checked).map(b=>spectra[+b.dataset.sp]);
    dlg.close();
    const base=String(name).replace(/\.opju?$/i,''), safe=s=>String(s).replace(/[\\/:*?"<>|]+/g,'_').slice(0,120);
    const entries=chosen.map(sp=>{ const fn=safe(`${sp.label} [${base} ${sp.book} ${sp.sheet} ${sp.y}]`)+'.txt';
      return {file:new File([asText(sp)], fn, {type:'text/plain'}), path:(path||name)+' › '+sp.book+' '+tx('foglio','sheet')+' '+sp.sheet+' '+sp.y}; });
    if (entries.length && typeof addEntries==='function') await addEntries(entries);
    next();
  }
  async function next(){
    const it=queue.shift(); if (!it) return;
    let buf; try{ buf=new Uint8Array(await it.file.arrayBuffer()); }catch(e){ toastErr(it.path, tx('il file non si apre','the file cannot be opened')); return next(); }
    let model;
    try{ model=O.read(buf); }
    catch(e){ toastErr(it.path, O.message(e.code, en())); return next(); }
    const spectra=O.spectra(model);
    if (!spectra.length){ toastErr(it.path, tx('nel progetto non ci sono coppie di colonne X/Y con numeri','the project contains no X/Y numeric column pairs')); return next(); }
    show({name:it.file.name, path:it.path, model, spectra});
  }
  function toastErr(p, m){ if (typeof toast==='function') toast('⛔ '+tx('Progetto Origin non letto','Origin project not read')+' («'+p+'»): '+m); }
  function ask(list){ queue.push(...list); if (!dlg || !dlg.open) next(); }

  /* ---------------- esportazione ---------------- */
  function exportSpecs(){
    const inc=typeof included==='function'?included():[], raw=typeof S!=='undefined' && S.originData==='raw', L=(typeof L10N!=='undefined'&&L10N.it)||{x:{},y:{}};
    return inc.map(f=>{ const P=processed(f), u=typeof originUnits==='function'?originUnits(f, raw?{kind:f.kind}:P):{xu:'',yu:''}, nm=dispTitle(f);
      const xs=raw?f.xs:P.xs, ys=raw?f.ys:P.ys, keep=[]; for (let i=0;i<xs.length;i++) if (Number.isFinite(xs[i])&&Number.isFinite(ys[i])) keep.push(i);
      return {xs:keep.map(i=>xs[i]), ys:keep.map(i=>ys[i]), name:nm,
        x:{longName:String((L.x&&L.x[f.instr])||'X').replace(/\s*\(.*\)$/,''), units:u.xu||''},
        y:{units:u.yu||'', comments:[f.desc, raw?tx('dati originali del file','original file data'):'' , f.path].filter(Boolean).join(' · ')}}; });
  }
  async function doExport(){
    const fmtSel=document.getElementById('opjFmt'), modeSel=document.getElementById('opjMode'), note=document.getElementById('opjMsg');
    const f=fmtSel?fmtSel.value:'opj', mode=modeSel?modeSel.value:'each';
    try{
      const specs=exportSpecs(); if (!specs.length){ note.textContent=tx('Nessuno spettro spuntato.','No spectra ticked.'); return; }
      const bytes=f==='opju'?O.writeOpju(specs,{mode}):O.writeOpj(specs,{mode});
      const chk=O.read(bytes), back=O.spectra(chk);   // si rilegge subito: ciò che non torna identico non si consegna
      const same=back.length===specs.length && back.every((s,i)=>{ const v=O.pairValues(s); return v.xs.length===specs[i].xs.length && v.xs.every((x,k)=>x===specs[i].xs[k]) && v.ys.every((y,k)=>y===specs[i].ys[k]); });
      if (!same) throw new Error(tx('il file scritto non si rilegge identico','the written file does not read back identically'));
      const base=(typeof safeName==='function'?safeName((S&&S.docTitle)||'spettri'):'spettri').replace(/\s+/g,'_');
      const r=await download(new Blob([bytes],{type:'application/octet-stream'}), base+'.'+f);
      note.textContent = r===false ? '' : tx(`Scritto: ${specs.length} ${specs.length===1?'spettro':'spettri'}, valori riletti identici.`+(O.VERIFIED['write'+(f==='opju'?'Opju':'Opj')]?'':' Apertura in Origin non ancora verificata.'),`Written: ${specs.length} ${specs.length===1?'spectrum':'spectra'}, values read back identically.`+(O.VERIFIED['write'+(f==='opju'?'Opju':'Opj')]?'':' Opening in Origin not yet verified.'));
    }catch(e){ console.error(e); note.textContent=tx('Esportazione non riuscita: ','Export failed: ')+(e.code?O.message(e.code,en()):e.message); }
  }
  function mountExport(){
    if (document.getElementById('opjCard')) return;
    const ref=document.querySelector('.outcard[data-out="outOrigin"]'); if (!ref) return;
    const c=document.createElement('div'); c.className='outcard'; c.id='opjCard';
    c.innerHTML=`<div class="ohead"><span></span><span><b>${h(tx('Progetto Origin (.opj, .opju)','Origin project (.opj, .opju)'))}</b><small>${h(tx('un progetto Origin con una cartella per spettro o un foglio con tutte le coppie X/Y; nome lungo, unità e commento nelle colonne, valori esatti','an Origin project with one workbook per spectrum or one sheet with all X/Y pairs; long name, units and comment in the columns, exact values'))}</small></span></div>`+
      `<div class="obody" style="display:block"><div class="field"><label>${h(tx('Formato','Format'))}</label><select id="opjFmt"><option value="opj">.opj</option><option value="opju">.opju</option></select></div>`+
      `<div class="field"><label>${h(tx('Organizzazione','Layout'))}</label><select id="opjMode"><option value="each">${h(tx('una cartella per spettro','one workbook per spectrum'))}</option><option value="one">${h(tx('un foglio con tutte le coppie X/Y','one sheet with all X/Y pairs'))}</option></select></div>`+
      (O.VERIFIED.writeOpj && O.VERIFIED.writeOpju ? '' : `<p class="why" style="margin:6px 0 0"><b>${h(tx('Non ancora verificato in Origin.','Not yet verified in Origin.'))}</b> ${h(tx('Il file viene riletto e controllato da Acchiappaspettri, ma la sua apertura in Origin non è stata ancora provata: per un lavoro da consegnare usa la cartella Excel per Origin qui sopra. Dati come scelto qui sopra (come nel grafico o originali).','The file is read back and checked by Acchiappaspettri, but opening it in Origin has not been tested yet: for work to be delivered use the Excel workbook for Origin above. Data as chosen above (as plotted or original).'))}</p>`)+
      `<div class="actions" style="justify-content:flex-start"><button class="btn small" type="button" id="opjGo">${h(tx('Esporta il progetto Origin','Export the Origin project'))}</button></div><p class="why" id="opjMsg" style="margin:4px 0 0"></p></div>`;
    ref.insertAdjacentElement('afterend', c);
    c.querySelector('#opjGo').onclick=doExport;
  }
  window.AcchOriginUI={ask, exportSpecs, mountExport, asText};
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', mountExport); else mountExport();
})();
