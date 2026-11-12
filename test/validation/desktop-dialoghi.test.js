// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Dialoghi e file nel desktop (3.0.0, tappa I1): nessun selettore di file della webview, salvataggi attesi davvero,
// cartella iniziale per tipo, «Preimpostazioni», finestra mostrata al primo disegno, Novità senza download, doppio
// caricamento, trascinamento nativo. Il desktop è simulato con un finto window.__TAURI__ (tauri-mock.js).
// Uso: PW_CHANNEL=chrome node --test test/validation/desktop-dialoghi.test.js
'use strict';
const {describe, it, before, after}=require('node:test'), assert=require('node:assert');
const fs=require('fs'), path=require('path');
const B=require('./browser.js'), {openDesk}=require('./tauri-mock.js');

// dati SINTETICI
const ftir=(k=0)=>'Wavenumber (cm-1),Absorbance\n'+Array.from({length:400},(_,i)=>(4000-i*8)+','+(0.1+Math.exp(-Math.pow((i-150-k)/9,2))).toFixed(4)).join('\n');
// ogni attivazione di un <input type=file> non intercettata aprirebbe il selettore della webview: si contano
const countActivations=()=>{ window.__fileActs=[];
  window.addEventListener('click', e=>{ const t=e.target; if (t instanceof HTMLInputElement && t.type==='file') setTimeout(()=>{ if (!e.defaultPrevented) window.__fileActs.push(t.id||'?'); },0); }, true);
  const oc=HTMLInputElement.prototype.click; HTMLInputElement.prototype.click=function(){ if (this.type==='file' && !this.isConnected) window.__fileActs.push(this.id||'?'); return oc.call(this); }; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const close=async o=>{ const e=o.errors.slice(); await o.ctx.close(); return e; };

let server, br;
before(async ()=>{ server=await B.startServer(); br=await B.launch(); });
after(async ()=>{ await br.close(); server.close(); });
async function desk(opt){ const o=await openDesk(B, br, server, Object.assign({init:countActivations}, opt||{})); await o.p.waitForFunction(()=>window.__mock && window.__mock.menu); await o.p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close())); return o; }

describe('Desktop: dialoghi e file', {timeout:10*60*1000}, ()=>{
  it('1 · «Aggiungi spettri» e ogni input di file vanno ai dialoghi nativi, mai al selettore della webview', async ()=>{
    const o=await desk();
    await o.p.evaluate(t=>{ const M=window.__mock; M.files['/dati/a.csv']=t; M.files['/dati/cartella/sub/b.csv']=t.replace('0.1','0.2'); M.files['/dati/cartella/note.bin']='x';
      M.pick.pick_many=[{path:'/dati/a.csv', name:'a.csv'}];
      M.pick.pick_folder=[{path:'/dati/cartella/sub/b.csv', name:'b.csv', rel:'cartella/sub/b.csv'},{path:'/dati/cartella/note.bin', name:'note.bin', rel:'cartella/note.bin'}]; }, ftir());
    await o.p.click('#tbLoad');   // clic vero: è il pulsante che su Windows bloccava la finestra
    await sleep(300); if (o.choosers){ await close(o); assert.fail(`«Aggiungi spettri» ha aperto il selettore di file della webview (${o.choosers})`); }
    await o.p.waitForFunction(()=>files.length===1, null, {timeout:15000});
    await o.p.evaluate(()=>{ files.length=0; cur=-1; refreshAll(); go(1); });
    await o.p.evaluate(()=>{ $('#pickFolder').click(); });
    await o.p.waitForFunction(()=>files.length===1, null, {timeout:15000});
    const folder=await o.p.evaluate(()=>files.map(f=>f.path));
    // gli altri: riferimenti, importazioni, preimpostazioni, progetto, foto
    await o.p.evaluate(async ()=>{ const M=window.__mock, w=()=>new Promise(r=>setTimeout(r,150)); M.pick.pick_open=null; M.pick.pick_many=[];
      for (const id of ['refFiles','refImport','openProjIn','imVis','imIR','imUV']){ const i=$('#'+id), l=i.closest('label'); (l||i).click(); await w(); }
      $('#presetImport').click(); await w(); $('#inFiles').click(); await w(); });
    const exported=await o.p.evaluate(()=>typeof (window.AcchDesktop||{}).addSpectra);
    const acts=await o.p.evaluate(()=>window.__fileActs), picks=await o.p.evaluate(()=>window.__mock.calls.filter(c=>/^pick_/.test(c.cmd)).map(c=>c.cmd+':'+(c.args.kind||'')+':'+((c.args.extensions||[]).join('|'))));
    const errs=await close(o);
    assert.deepStrictEqual(errs, []);
    assert.strictEqual(o.choosers, 0, 'selettori di file della webview aperti: '+o.choosers);
    assert.deepStrictEqual(acts, [], 'input di file attivati: '+acts.join(', '));
    assert.deepStrictEqual(folder, ['cartella/sub/b.csv'], 'percorso relativo della cartella come nella pagina online');
    assert.strictEqual(exported, 'function', 'AcchDesktop.addSpectra esportato');
    for (const want of ['pick_many:spectra:', 'pick_folder:spectra:', 'pick_open:settings:json', 'pick_open:images:jpg']) assert.ok(picks.some(p=>p.startsWith(want)), `manca ${want} in ${picks.join(', ')}`);
    assert.ok(picks.some(p=>p.startsWith('pick_open:project:acchspettri')), 'progetto con il dialogo dei progetti: '+picks.join(', '));
  });

  it('2 · esportazione: «Fatto» solo dopo la scrittura; annullando nessun successo; niente «File pronti»', async ()=>{
    const o=await desk();
    const r=await o.p.evaluate(async t=>{ await addEntries([{file:new File([t],'a.csv'),path:'a.csv'}]); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
      Object.assign(S,{outPdf:true,outPng:false,outSvg:false,csvPeaks:false,csvData:false,outAnalysis:false,outOrigin:false}); go(3);
      const M=window.__mock, seen=[]; new MutationObserver(()=>seen.push({t:performance.now(), s:$('#status').textContent})).observe($('#status'),{childList:true,characterData:true,subtree:true});
      M.pick.pick_save={path:'/out/r.pdf', name:'r.pdf'}; M.writeDelay=1200;
      await runExport(); const after1={writes:M.writes.length, wt:M.writes[0]&&M.writes[0].t, before:seen.filter(x=>M.writes[0] && x.t<M.writes[0].t).map(x=>x.s), status:$('#status').textContent, ready:!$('#readyBox').hidden};
      M.writes.length=0; M.pick.pick_save=null; seen.length=0;
      await runExport(); await new Promise(r=>setTimeout(r,2500));
      return {after1, cancel:{status:$('#status').textContent, writes:M.writes.length, ready:!$('#readyBox').hidden}, kind:M.calls.filter(c=>c.cmd==='pick_save').map(c=>c.args.kind)}; }, ftir());
    const errs=await close(o);
    assert.deepStrictEqual(errs, []);
    assert.strictEqual(r.after1.writes, 1, 'runExport finito prima della scrittura del file');
    assert.ok(r.after1.status && !r.after1.before.includes(r.after1.status), `messaggio di fine «${r.after1.status}» comparso prima della scrittura`);
    assert.strictEqual(r.after1.ready, false, '«File pronti» visibile nel desktop');
    assert.strictEqual(r.cancel.writes, 0);
    assert.strictEqual(r.cancel.status, '', 'annullato ma con messaggio: '+r.cancel.status);
    assert.strictEqual(r.cancel.ready, false);
    assert.ok(r.kind.every(k=>k==='export'), 'cartella delle esportazioni: '+r.kind);
  });

  it('3 · progetto: l\'attesa del salvataggio parte dopo la scelta del percorso', async ()=>{
    const o=await desk();
    const r=await o.p.evaluate(async t=>{ await addEntries([{file:new File([t],'a.csv'),path:'a.csv'}]); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
      const M=window.__mock, shown=[], oL=window.loader; window.loader=function(show){ if (show) shown.push(M.calls.filter(c=>c.cmd==='pick_save').length); return oL.apply(this,arguments); };   // quanti dialoghi erano già stati aperti
      M.pick.pick_save=null; const okCancel=await AcchProject.saveAs(); const cancelShown=shown.length;
      shown.length=0; M.pick.pick_save={path:'/p/x.acchspettri', name:'x.acchspettri'}; const okSave=await AcchProject.saveAs();
      const pick=M.calls.filter(c=>c.cmd==='pick_save').pop(); return {okCancel, cancelShown, okSave, pickT:pick.t, kind:pick.args.kind, shown:shown.slice(), writes:M.writes.map(w=>w.path)}; }, ftir());
    const errs=await close(o);
    assert.deepStrictEqual(errs, []);
    assert.strictEqual(r.okCancel, false); assert.strictEqual(r.cancelShown, 0, 'attesa mostrata anche se il salvataggio è stato annullato');
    assert.strictEqual(r.okSave, true); assert.deepStrictEqual(r.writes, ['/p/x.acchspettri']);
    assert.ok(r.shown.length && r.shown.every(x=>x===2), 'attesa mostrata prima del dialogo: '+JSON.stringify(r));
    assert.strictEqual(r.kind, 'project');
  });

  it('5 · Analisi → «Preimpostazioni» apre davvero la sezione', async ()=>{
    const o=await desk();
    const r=await o.p.evaluate(async t=>{ await addEntries([{file:new File([t],'a.csv'),path:'a.csv'}]); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
      const walk=L=>{ for (const x of L||[]){ if (x.text==='Preimpostazioni') return x; const r=x.items&&walk(x.items); if (r) return r; } return null; };
      walk(window.__mock.menu).action(); await new Promise(r=>setTimeout(r,500));
      const d=$('#presetFile').closest('details'), b=d.getBoundingClientRect(); return {open:d.open, top:b.top, ih:innerHeight, vis:d.offsetParent!==null}; }, ftir());
    const errs=await close(o);
    assert.deepStrictEqual(errs, []);
    assert.ok(r.open && r.vis && r.top>=0 && r.top<r.ih, JSON.stringify(r));
  });

  it('6 · finestra mostrata al primo disegno; jsPDF caricato solo quando serve', async ()=>{
    const {desktopHtml}=require('../../scripts/prepare-desktop.js');
    const html=desktopHtml(fs.readFileSync(B.INDEX,'utf8'));
    const o=await desk({html});
    const r=await o.p.evaluate(async t=>{ const before=!!window.jspdf, shown=window.__mock.shown; await addEntries([{file:new File([t],'a.csv'),path:'a.csv'}]); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
      const doc=await buildPdf(); return {before, shown, pdf:!!doc, after:!!window.jspdf}; }, ftir());
    const errs=await close(o);
    assert.deepStrictEqual(errs, []);
    assert.ok(r.shown>=1, 'la finestra non viene mai mostrata');
    assert.deepStrictEqual([r.before, r.pdf, r.after], [false, true, true], JSON.stringify(r));
  });

  it('7 · checkNews nel desktop: nessun «Mostrami» apre la finestra di download', async ()=>{
    const o=await desk();
    const r=await o.p.evaluate(async ()=>{ localStorage.setItem('acch.seenVersion', JSON.stringify('2.1')); checkNews(); await new Promise(r=>setTimeout(r,1200));
      const opened=$('#dlgNews').open, n=document.querySelectorAll('#nwList [data-nv]').length, bad=[];
      for (let i=0;i<n;i++){ document.querySelectorAll('dialog[open]').forEach(d=>d.close()); showNews(NOVITA.filter(v=>v.v==='2.2')); const b=document.querySelectorAll('#nwList [data-nv]')[i]; const t=b.closest('.nv').querySelector('b').textContent; b.click(); await new Promise(r=>setTimeout(r,100)); if ($('#dlgDownload').open) bad.push(t); }
      return {opened, n, bad}; });
    const errs=await close(o);
    assert.deepStrictEqual(errs, []);
    assert.ok(r.opened && r.n>0, JSON.stringify(r));
    assert.deepStrictEqual(r.bad, [], 'aprono il download: '+r.bad.join(', '));
  });

  for (const mode of ['web','desk']) it(`8 · ${mode}: lo stesso file caricato due volte insieme entra una volta sola`, async ()=>{
    const o=mode==='desk' ? await desk() : await B.openPage(br, server, {});
    const n=await o.p.evaluate(async t=>{ const f=new File([t],'a.csv'); await Promise.all([addEntries([{file:f,path:'a.csv'}]), addEntries([{file:f,path:'a.csv'}])]); return files.length; }, ftir());
    const errs=await close(o);
    assert.deepStrictEqual(errs, []);
    assert.strictEqual(n, 1);
  });

  it('9 · trascinamento nativo: stesso risultato del trascinamento della pagina', async ()=>{
    const o=await desk();
    const r=await o.p.evaluate(async t=>{ const M=window.__mock; M.files['/d/a.csv']=t; M.files['/d/dir/b.csv']=t.replace('0.1','0.3');
      M.dragEvent({type:'enter', paths:['/d/a.csv'], position:{x:10,y:10}}); const over=$('#drop').classList.contains('over');
      M.dragEvent({type:'leave'}); const left=!$('#drop').classList.contains('over');
      M.dragEvent({type:'enter', paths:['/d/a.csv','/d/dir'], position:{x:10,y:10}}); M.dragEvent({type:'drop', paths:['/d/a.csv','/d/dir'], position:{x:10,y:10}});
      M.emit('acch-dropped', [{path:'/d/a.csv', name:'a.csv', rel:'a.csv'},{path:'/d/dir/b.csv', name:'b.csv', rel:'dir/b.csv'}]);
      for (let i=0;i<100 && files.length<2;i++) await new Promise(r=>setTimeout(r,100));
      return {over, left, paths:files.map(f=>f.path), cls:$('#drop').classList.contains('over'), listen:!!(M.listeners['acch-dropped']||[]).length}; }, ftir());
    const errs=await close(o);
    assert.deepStrictEqual(errs, []);
    assert.ok(r.listen, 'nessun ascoltatore del trascinamento nativo');
    assert.deepStrictEqual(r.paths, ['a.csv','dir/b.csv']);
    assert.ok(r.over && r.left && !r.cls, JSON.stringify(r));
  });
});
