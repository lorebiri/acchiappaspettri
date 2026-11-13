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
  function skippedTxt(m){ const k=m.skipped||{}, L=[];
    if (k.matrices) L.push(tx(`${k.matrices} ${k.matrices===1?'matrice':'matrici'}`,`${k.matrices} ${k.matrices===1?'matrix':'matrices'}`));
    if (k.derived) L.push(tx(`${k.derived} ${k.derived===1?'dataset derivato':'dataset derivati'} (curve calcolate da Origin)`,`${k.derived} derived ${k.derived===1?'dataset':'datasets'} (curves computed by Origin)`));
    if (k.other) L.push(tx(`${k.other} altri dataset`,`${k.other} other datasets`));
    return L.length ? ' '+tx('Non si importano: ','Not imported: ')+L.join(', ')+'.' : ''; }
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
        rows.push(`<div style="margin:4px 0 2px 8px;opacity:.85">${h(tx('Foglio','Sheet')+' '+S.index+(S.name && S.name!=='Sheet'+S.index?' · '+S.name:''))}</div>`);
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
      tx('Si importano solo i valori numerici dei fogli; grafici, analisi e formule di Origin non si importano.','Only the numeric worksheet values are imported; Origin graphs, analyses and formulas are not imported.')+skippedTxt(model);
    boxes().forEach(b=>b.onchange=count); count();
    if (!dlg.open) dlg.showModal();
  }
  /* uno spettro scelto viaggia come il file Origin originale più la scelta nel percorso («…#origin:libro|foglio|colonna»):
     così il progetto .acchspettri salva i byte originali una volta sola e alla riapertura si rilegge lo stesso spettro */
  const selPath=(path, sp)=>path+'#origin:'+encodeURIComponent(sp.book)+'|'+sp.sheet+'|'+encodeURIComponent(sp.y);
  const cache=[];   // ultimo progetto letto: più spettri dallo stesso file non lo rileggono ogni volta
  function fnv(u){ let h=2166136261; for (let i=0;i<u.length;i++){ h^=u[i]; h=Math.imul(h,16777619); } return (h>>>0)+':'+u.length; }
  function modelOf(u){ const k=fnv(u), c=cache.find(x=>x.k===k); if (c) return c.m; const m=O.read(u); cache.unshift({k,m}); cache.length=Math.min(cache.length,2); return m; }
  function parseSel(buf, sel){
    const u=buf instanceof Uint8Array?buf:new Uint8Array(buf), parts=String(sel).split('|');
    if (parts.length!==3) return {reject:tx('scelta dello spettro Origin non valida','invalid Origin spectrum selection')};
    const book=decodeURIComponent(parts[0]), sheet=+parts[1], col=decodeURIComponent(parts[2]);
    let m; try{ m=modelOf(u); }catch(e){ return {reject:O.message(e.code||'corrupt', en())}; }
    const sp=O.spectra(m).find(s=>s.book===book && s.sheet===sheet && s.y===col);
    if (!sp) return {reject:tx(`nel progetto Origin non c'è più la colonna ${col} del foglio ${sheet} di ${book}`,`the Origin project no longer contains column ${col} of sheet ${sheet} of ${book}`)};
    if (sp.error) return {reject:O.message(sp.error, en())};
    const v=O.pairValues(sp), idx=Array.from(v.xs.keys()).sort((a,b)=>v.xs[a]-v.xs[b]);   // asse crescente, come gli altri lettori
    const xn=[sp.xCol.longName||sp.xCol.name, sp.xCol.units?'('+sp.xCol.units+')':''].filter(Boolean).join(' '), yn=[sp.label, sp.yCol.units?'('+sp.yCol.units+')':''].filter(Boolean).join(' ');
    const notes=[]; if (sp.assumedX) notes.push(tx(`Nel progetto Origin nessuna colonna del foglio è designata X: come X è usata la colonna ${sp.x}`,`In the Origin project no column of the sheet is designated X: column ${sp.x} is used as X`));
    if (v.dropped) notes.push(tx(`${v.dropped} righe senza numero nel foglio Origin non sono state lette`,`${v.dropped} rows without a number in the Origin sheet were not read`));
    return {xs:Float64Array.from(idx,i=>v.xs[i]), ys:Float64Array.from(idx,i=>v.ys[i]), meta:[], colNames:[xn,yn], nCols:2, importNotes:notes.length?notes:null, origin:{book, sheet, col}};
  }
  async function importChosen(){
    const {name, path, spectra, buf}=cur, chosen=boxes().filter(b=>b.checked).map(b=>spectra[+b.dataset.sp]);
    dlg.close();
    const ext=(/\.(opju?)$/i.exec(name)||[,'opju'])[1], safe=s=>String(s).replace(/[\\/:*?"<>|#]+/g,'_').slice(0,120);
    const entries=chosen.map(sp=>({file:new File([buf], safe(`${sp.label} [${sp.book} ${sp.sheet} ${sp.y}]`)+'.'+ext), path:selPath(path||name, sp)}));
    if (entries.length && typeof addEntries==='function') await addEntries(entries);
    next();
  }
  async function next(){
    const it=queue.shift(); if (!it) return;
    let buf; try{ buf=new Uint8Array(await it.file.arrayBuffer()); }catch(e){ toastErr(it.path, tx('il file non si apre','the file cannot be opened')); return next(); }
    let model;
    try{ model=modelOf(buf); }
    catch(e){ toastErr(it.path, O.message(e.code, en())); return next(); }
    const spectra=O.spectra(model);
    if (!spectra.length){ toastErr(it.path, tx('nel progetto non ci sono coppie di colonne X/Y con numeri','the project contains no X/Y numeric column pairs')); return next(); }
    show({name:it.file.name, path:it.path, model, spectra, buf});
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
  /* bytes del progetto Origin per la voce di Esporta: si rilegge subito, e ciò che non torna identico non si consegna */
  function buildProject(fmt, mode){
    const specs=exportSpecs(); if (!specs.length) throw new O.OriginError('nothing-to-write');
    const bytes=fmt==='opju'?O.writeOpju(specs,{mode}):O.writeOpj(specs,{mode});
    const back=O.spectra(O.read(bytes));
    const same=back.length===specs.length && back.every((s,i)=>{ const v=O.pairValues(s); return v.xs.length===specs[i].xs.length && v.xs.every((x,k)=>x===specs[i].xs[k]) && v.ys.every((y,k)=>y===specs[i].ys[k]); });
    if (!same) throw new Error(tx('il progetto Origin scritto non si rilegge identico: non è stato esportato','the written Origin project does not read back identically: it was not exported'));
    return bytes;
  }
  /* l'avviso «non verificato» resta finché la prova in Origin non è stata fatta (VERIFIED in origin-core.js) */
  function mountExport(){
    document.querySelectorAll('.opjWarn').forEach(el=>{ el.hidden=!!O.VERIFIED[el.dataset.fmt==='opju'?'writeOpju':'writeOpj']; });
  }
  window.AcchOriginUI={ask, exportSpecs, buildProject, mountExport, parseSel, selPath};
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', mountExport); else mountExport();
})();
