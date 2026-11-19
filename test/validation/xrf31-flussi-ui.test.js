// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// XRF 3.1 nel programma vero, come un utente: modello predefinito, elementi aggiunti, export e re-import del .cfg di PyMca (anche uno ostile),
// progetto salvato e riaperto (stessi numeri, stesso modello), progetto della 3.0 riaperto (modello 3.0 con avviso), pannello in inglese.
// Spettro SINTETICO di examples/. Uso: PW_CHANNEL=chrome node --test test/validation/xrf31-flussi-ui.test.js
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), B=require('./browser.js');
const TUT=fs.readFileSync(path.join(B.ROOT,'examples','xrf-lega-sintetico','BRONZO_SIMULATO_Rh40kV_SINTETICO.mca'),'utf8');
const res=R=>R&&R.Q&&R.Q.res ? Object.fromEntries(Object.entries(R.Q.res).map(([e,o])=>[e,+o.w.toFixed(3)])) : null;

test('XRF 3.1: .cfg andata e ritorno, .cfg ostile, progetto salvato e riaperto, progetto della 3.0', {timeout:8*60*1000}, async ()=>{
  const server=await B.startServer(), br=await B.launch();
  try{
    const {ctx, p, errors}=await B.openPage(br, server, {lang:'it'});
    const r=await p.evaluate(async ([text])=>{ const o={}; const toasts=[]; const t0=window.toast; window.toast=m=>{ toasts.push(String(m)); try{ t0(m); }catch(e){} };
      const res=R=>R&&R.Q&&R.Q.res ? Object.fromEntries(Object.entries(R.Q.res).map(([e,v])=>[e,+v.w.toFixed(3)])) : null;
      files.length=0; await addEntries([{file:new File([text],'bronzo.mca'), path:'bronzo.mca'}]); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
      const f=files[0]; cur=0; o.model=fpCfg(f).model;
      const c=fpCfg(f); c.els=['Sn','Cu','Pb','Zn','As']; fpSaveCfg(f,c); f._fpKey=null; const R=fpRun(f); o.r1=res(R);
      document.querySelector('#secCult').open=true; renderCult(f); o.panel=!!document.querySelector('#fpModel') && !!document.querySelector('#fpCfgIn');
      // .cfg: esportato e reimportato su una copia delle impostazioni
      const ex=fpExportCfg(f, R); o.cfgLen=ex.text.length; const c2={}; fpImportCfg(c2, ex.text, 'esportato.cfg'); o.imp={anode:c2.S.anode, kv:c2.S.kv, psi1:c2.S.psi1, psi2:c2.S.psi2, model:c2.model, els:c2.els};
      // .cfg ostile: chiavi __proto__ e constructor, righe enormi, valori assurdi; nessun inquinamento del prototipo, nessun HTML eseguito
      const bad='[__proto__]\npolluted = 1\n[constructor]\nprototype = 2\n[detector]\nzero = 1e999\ngain = -5\ndetele = <img src=x onerror=window.__xss=1>\n[tube]\nanode = <script>\nvoltage = 99999\n[peaks]\nCu = K\n__proto__ = K\n[fit]\nenergy = '+'1, '.repeat(20000)+'\n';
      const c3=Object.assign({}, fpCfg(f)); let err=null; try{ fpImportCfg(c3, bad, '<b>ostile</b>.cfg'); }catch(e){ err=String(e.message||e); }
      o.bad={err, polluted:({}).polluted, proto:Object.prototype.polluted, anode:c3.S&&c3.S.anode};
      if (!err){ const g=files[0], keep=JSON.stringify(g.an.fp); fpSaveCfg(g, c3); g._fpKey=null; try{ fpRun(g); document.querySelector('#secCult').open=true; renderCult(g); }catch(e){ o.bad.run=String(e); } o.bad.xss=!!window.__xss; o.bad.html=document.querySelector('#anCult').innerHTML.includes('<b>ostile</b>'); g.an.fp=JSON.parse(keep); g._fpKey=null; }
      // progetto salvato e riaperto
      let saved=null; const h=AcchProject.host, old=h.saveAs; h.saveAs=async (b,s)=>{ saved=b; return {name:s,path:null}; }; await AcchProject.saveAs(); h.saveAs=old;
      await AcchProject.closeProject(); await AcchProject.openBytes(saved,'p.acchspettri',null); const F=files[0]; F._fpKey=null; o.reopen={model:fpCfg(F).model, r:res(fpRun(F))};
      // progetto «della 3.0»: senza il contrassegno xrfModel e con appVersion 3.0.0, spettro mai toccato nel pannello
      await AcchProject.closeProject(); files.length=0; await addEntries([{file:new File([text],'vecchio.mca'), path:'vecchio.mca'}]); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
      let b2=null; h.saveAs=async (b,s)=>{ b2=b; return {name:s,path:null}; }; await AcchProject.saveAs(); h.saveAs=old;
      const z=await JSZip.loadAsync(b2), st=JSON.parse(await z.file('project/state.json').async('string')); delete st.xrfModel;
      const P0=await AcchFormat.decode(b2, JSZip), enc=await AcchFormat.encode({appVersion:'3.0.0', title:'', state:st, spectra:P0.spectra, libraries:[], results:[]}, JSZip);
      await AcchProject.closeProject(); toasts.length=0; await AcchProject.openBytes(enc.bytes||enc,'vecchio.acchspettri',null);
      const V=files[0]; V._fpKey=null; o.old={model:fpCfg(V).model, was30:!!fpCfg(V).was30, r:res(fpRun(V)), toast:toasts.some(t=>/col modello 3\.0/.test(t)), note:fpNotes(V, V._fpRes).some(t=>/versione 3\.0/.test(t))};
      return o; }, [TUT]);
    assert.equal(r.model, 'hypermet', 'file nuovo: modello 3.1'); assert.ok(r.panel, 'controlli del modello e del .cfg nel pannello');
    for (const [e,w] of [['Cu',84],['Sn',8],['Pb',5],['Zn',2.5]]) assert.ok(Math.abs(r.r1[e]/w-1)<0.12, `3.1 ${e}: ${r.r1[e]}`);
    assert.deepEqual(r.imp, {anode:'Rh', kv:40, psi1:45, psi2:45, model:'hypermet', els:r.imp.els}, JSON.stringify(r.imp)); assert.ok(['Sn','Cu','Pb','Zn','As'].every(e=>r.imp.els.includes(e)), 'elementi dal .cfg');
    assert.ok(!r.bad.polluted && !r.bad.proto, 'prototipo inquinato'); assert.ok(!r.bad.xss && !r.bad.html, 'HTML del .cfg eseguito o non protetto'); assert.ok(!r.bad.run, 'calcolo con il .cfg ostile: '+r.bad.run);
    assert.equal(r.reopen.model, 'hypermet'); assert.deepEqual(r.reopen.r, r.r1, 'progetto riaperto: stessi numeri');
    assert.equal(r.old.model, 'gauss', 'progetto della 3.0: modello 3.0'); assert.ok(r.old.was30 && r.old.note, 'avviso nel pannello'); assert.ok(r.old.toast, 'avviso all\'apertura');
    assert.deepEqual(['Cu','Sn','Pb'].map(e=>r.old.r[e].toFixed(2)), ['86.28','8.34','5.38'], 'numeri della 3.0: '+JSON.stringify(r.old.r));
    assert.deepEqual(errors, []); await ctx.close();
  } finally { await br.close(); server.close(); }
});

test('XRF 3.1 in inglese: pannello, modello, note tradotte', {timeout:4*60*1000}, async ()=>{
  const server=await B.startServer(), br=await B.launch();
  try{
    const {ctx, p, errors}=await B.openPage(br, server, {lang:'en'});
    const r=await p.evaluate(async ([text])=>{ files.length=0; await addEntries([{file:new File([text],'bronze.mca'), path:'bronze.mca'}]); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
      const f=files[0]; cur=0; f._fpKey=null; fpRun(f); document.querySelector('#secCult').open=true; renderCult(f); await new Promise(r=>setTimeout(r,500)); const box=document.querySelector('#anCult');
      return {text:box.innerText, opt:[...document.querySelectorAll('#fpModel option')].map(o=>o.textContent)}; }, [TUT]);
    assert.ok(r.opt.some(t=>/3\.1: hypermet, escapes, sum peaks, Ebel tube/.test(t)), JSON.stringify(r.opt));
    assert.match(r.text, /3\.1 model: peaks with tails/); assert.doesNotMatch(r.text, /Modello 3\.1|picchi con code|Importa \.cfg/);
    assert.deepEqual(errors, []); await ctx.close();
  } finally { await br.close(); server.close(); }
});
