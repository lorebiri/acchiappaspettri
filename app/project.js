// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Ciclo di vita del progetto: nuovo, apri, salva, salva con nome, chiudi, modifiche non salvate.
   Vale per la pagina e per l'app desktop: cambia solo come si leggono e scrivono i byte (AcchProject.host). */
(function(win){
  'use strict';
  const F=()=>win.AcchFormat, tr=s=>win.AcchI18n ? (win.AcchI18n.lang==='en' ? win.AcchI18n.tr(s) : s) : s;
  const MSG={
    'not-a-project':'Questo file non è un progetto di Acchiappaspettri.', 'empty':'Il file del progetto è vuoto.', 'corrupted':'Il file del progetto è danneggiato e non si può aprire. I dati già caricati non sono stati toccati.',
    'integrity':'Il file del progetto è danneggiato: un dato non corrisponde alla sua impronta di controllo. Non l\'ho aperto per non mostrarti numeri sbagliati.', 'missing-entry':'Nel file del progetto manca una parte necessaria: è incompleto o danneggiato.',
    'invalid-json':'Il file del progetto contiene dati illeggibili.', 'invalid-schema':'Il file del progetto contiene dati non validi.', 'unsafe-path':'Il file contiene percorsi non sicuri e non è stato aperto.',
    'too-large':'Il file del progetto è troppo grande per essere aperto in sicurezza.', 'newer-format':'Questo progetto è stato salvato con una versione più recente di Acchiappaspettri: aggiorna l\'applicazione per aprirlo.', 'no-migration':'Non riesco a convertire questo progetto dalla sua versione del formato.', 'no-zip':'Manca la libreria per leggere i progetti: ricarica la pagina.'
  };
  let name=null, path=null, createdAt=null, baseline=null, busy=false, sigTimer=null;
  const listeners=[];
  /* stato del lavoro (senza i dati grezzi): serve a capire se ci sono modifiche non salvate */
  function memoryOf(f){ return win.fileMemory(f); }
  function stateObj(){ return {title:S.docTitle||'', S, MV, COMPS:COMPS.map(c=>({id:c.id,name:c.name,instr:c.instr,mode:c.mode,gap:c.gap,out:c.out,keys:c.keys,inset:c.inset||undefined})), REFS, LIB, curIndex:cur}; }
  function sig(){ const st=stateObj(), Sx=Object.assign({},st.S); delete Sx.lang; return JSON.stringify({S:Sx, MV:st.MV, C:st.COMPS, R:st.REFS.map(r=>r.id), L:st.LIB.map(e=>e.id), F:files.map(f=>[f.path, f.size, memoryOf(f)])}); }
  function markSaved(){ baseline=sig(); notify(); autosave.clear(); }
  /* copia di recupero: resta sul computer (IndexedDB), non va mai in rete. Si cancella quando il lavoro è salvato o scartato */
  const autosave=(()=>{ const DB='acch-autosave', T='p', open=()=>new Promise((res,rej)=>{ const q=win.indexedDB.open(DB,1); q.onupgradeneeded=()=>q.result.createObjectStore(T); q.onsuccess=()=>res(q.result); q.onerror=()=>rej(q.error); }),
      tx=async(mode,fn)=>{ const d=await open(); try{ return await new Promise((res,rej)=>{ const t=d.transaction(T,mode), r=fn(t.objectStore(T)); t.oncomplete=()=>res(r&&r.result); t.onerror=()=>rej(t.error); t.onabort=()=>rej(t.error); }); } finally { d.close(); } };
    return { async put(){ if (busy || !files.length || !isDirty()) return false; const b=await build(); if (b.bytes.length>200*1048576) return false; await tx('readwrite',s=>s.put({bytes:b.bytes, at:new Date().toISOString(), name:displayName(), lang:null},'last')); return true; },
      get(){ return tx('readonly',s=>s.get('last')).catch(()=>null); }, clear(){ try{ return tx('readwrite',s=>s.delete('last')).catch(()=>{}); }catch(e){ return Promise.resolve(); } } }; })();
  async function offerRecovery(){ const r=await autosave.get(); if (!r || !r.bytes || files.length) return false; if (win.ACCH_TEST) return false; const when=new Date(r.at).toLocaleString(); const ans=await win.AcchUi.choice(`C'è un lavoro non salvato del ${when} («${r.name}»). Vuoi recuperarlo?`,[['later','Più tardi','ghost'],['drop','Cancella la copia','ghost'],['yes','Recupera','primary']]); if (ans==='drop'){ await autosave.clear(); return false; } if (ans!=='yes') return false; const ok=await openBytes(r.bytes,'recuperato.acchspettri',null); if (ok){ name=null; path=null; baseline=null; notify(); await autosave.put(); const w=win.document.getElementById('dlgWelcome'); if (w&&w.open) w.close(); } return ok; }
  function isDirty(){ if (busy) return false; if (!files.length && !path) return false; return baseline==null || sig()!==baseline; }
  function notify(){ const d=isDirty(), info={name:displayName(), path, dirty:d, hasFiles:files.length>0}; listeners.forEach(fn=>{ try{ fn(info); }catch(e){} }); }
  function touch(){ clearTimeout(sigTimer); sigTimer=setTimeout(notify, 400); }
  function displayName(){ return name || tr('Progetto senza nome'); }
  function stampName(){ const base=(S.docTitle && S.docTitle.trim()) ? S.docTitle.trim() : 'progetto'; return safeName(name ? name.replace(/\.acchspettri$/i,'') : base).replace(/\s+/g,'_')+'.acchspettri'; }

  function processedCsv(f){ try{ const P=processed(f), I=INSTR[f.instr]||{}, n=P.xs.length, lines=[`# ${f.name}`, `# x: ${I.xPdf||''}`, `# y: ${P.kind||''}`, '# dati come visualizzati, con le elaborazioni scelte; gli originali sono in data/', 'x,y'];
      for (let i=0;i<n;i++) lines.push(P.xs[i]+','+P.ys[i]); return lines.join('\r\n'); }catch(e){ return null; } }
  let prevResults=[];
  async function build(){
    files.forEach(persist);
    const missing=files.filter(f=>!f.raw), spectra=files.filter(f=>f.raw).map(f=>({name:f.name, path:f.path, bytes:new Uint8Array(f.raw), binary:!!f.rawBin, memory:memoryOf(f), processedCsv:processedCsv(f)}));
    let results=[]; try{ results=analysisFiles().map(([n,t])=>({name:n, text:t})); }catch(e){ console.warn(e); }
    { const have=new Set(results.map(r=>r.name)); for (const r of prevResults){ const nm=r.name.startsWith('precedenti/')?r.name:'precedenti/'+r.name; if (!have.has(r.name) && !have.has(nm)){ have.add(nm); results.push({name:nm,text:r.text}); } } }   // calcolati in una sessione precedente e non rifatti: non si perdono
    const bytes=await F().encode({appVersion:APP_VERSION_FULL(), title:S.docTitle||'', createdAt:createdAt||undefined, state:stateObj(), spectra, results}, win.JSZip);
    return {bytes, count:spectra.length, missing:missing.length};
  }
  /* dopo aver scritto, rilegge ciò che ha prodotto: un salvataggio non verificato non conta come salvato */
  async function buildVerified(){ const b=await build(); await F().decode(b.bytes, win.JSZip); return b; }
  const hostDefault={
    async save(bytes, suggested){ win.download(new Blob([bytes],{type:F().MIME}), suggested); return {name:suggested, path:null}; },
    saveAs(bytes, suggested){ return hostDefault.save(bytes, suggested); },
    ask(message){ if (win.ACCH_TEST) return Promise.resolve('discard'); return win.AcchUi.choice(message, [['cancel','Annulla','ghost'],['discard','Non salvare','ghost'],['save','Salva','primary']]); }
  };
  const api={ host:hostDefault };
  async function doSave(as){
    if (!files.length){ toast('Non c\'è ancora niente da salvare: carica qualche spettro. 🙂'); return false; }
    if (busy){ toast('Sto già salvando il progetto: un momento…'); return false; } busy=true;
    try{ loader(true,'Gino sta salvando il progetto…','',0.5); await frame();
      const b=await buildVerified(), suggested=stampName();
      const r=(as || !path || !api.host.overwrite) ? await api.host.saveAs(b.bytes, suggested) : await api.host.overwrite(b.bytes, path);
      if (!r) return false;   // annullato
      name=r.name||suggested; path=r.path||null; createdAt=createdAt||new Date().toISOString();
      busy=false; markSaved();
      toast(`💾 Progetto salvato: ${b.count} spettri e tutto il lavoro, nel file «${name}».`);
      if (b.missing) toast(`⚠️ ${b.missing} spettri non hanno i dati originali e non sono nel progetto.`);
      if (api.host.remember) api.host.remember(path, name);
      return true;
    }catch(e){ console.error(e); showErr(e); return false; }
    finally{ busy=false; loader(false); notify(); }
  }
  function showErr(e){ api.lastError=e; const code=e && e.code, m=MSG[code]; toast('😕 '+(m || 'Non sono riuscito a completare l\'operazione sul progetto. I tuoi dati non sono stati toccati.')); if (api.onError) api.onError(m||null, e); }
  /* true se si può proseguire: nessuna modifica, oppure salvate o volutamente scartate */
  async function guard(){ if (busy){ toast('Un momento: sto finendo un\'operazione sul progetto.'); return false; } if (!isDirty()) return true; const ans=await api.host.ask(`Il progetto «${displayName()}» ha modifiche non salvate. Vuoi salvarle?`); if (ans==='cancel') return false; if (ans==='save') return doSave(false); autosave.clear(); return true; }
  function clearAll(){
    files.forEach(f=>{ try{ lsDel(fkey(f)); }catch(e){} });
    files.length=0; cur=-1; curCmpId=null; COMPS.length=0; saveCmps();
    for (const k of Object.keys(MV)) delete MV[k]; mvSave();
    for (const k of Object.keys(MVres||{})) delete MVres[k]; for (const k of Object.keys(MVpls||{})) delete MVpls[k];
    name=null; path=null; createdAt=null; prevResults=[];
  }
  /* copia di sicurezza in memoria: se l'apertura si interrompe dopo aver svuotato, il lavoro torna com'era */
  function snapshot(){ return {files:files.slice(), cur, comps:COMPS.slice(), mv:JSON.parse(JSON.stringify(MV)), S:JSON.parse(JSON.stringify(S)), name, path, createdAt}; }
  function restore(o){ files.length=0; files.push(...o.files); cur=o.cur; COMPS.length=0; COMPS.push(...o.comps); saveCmps(); for (const k of Object.keys(MV)) delete MV[k]; Object.assign(MV,o.mv); mvSave(); S=merge(DEFAULTS,o.S); saveS(); name=o.name; path=o.path; createdAt=o.createdAt; files.forEach(persist); syncControls(); resetCaches(); refreshAll(); }
  async function newProject(){ if (!await guard()) return false; clearAll(); S.docTitle=DEFAULTS.docTitle; saveS(); busy=true; refreshAll(); go(1); busy=false; markSaved(); return true; }
  const closeProject=newProject;
  /* apre byte già letti. Prima verifica tutto: se il file non è valido, il lavoro corrente resta com'è */
  async function openBytes(bytes, fileName, filePath){
    let P; const legacy=/\.json$/i.test(fileName||'') || (bytes[0]===0x7b);
    try{ P = legacy ? F().fromLegacyJson(new TextDecoder().decode(bytes)) : await F().decode(bytes, win.JSZip); }
    catch(e){ console.error(e); showErr(e); return false; }
    if (!await guard()) return false;
    busy=true; const before=snapshot();
    try{ loader(true,'Gino sta aprendo il progetto…','',0.3); await frame();
      clearAll();
      const st=P.state||{}, okId=x=>typeof x==='string' && x.length<200, hasI=i=>typeof i==='string' && Object.prototype.hasOwnProperty.call(INSTR,i);
      if (st.S){ S=merge(DEFAULTS, st.S); saveS(); }
      if (st.MV && typeof st.MV==='object'){ for (const k of Object.keys(st.MV)) if (hasI(k) && st.MV[k] && typeof st.MV[k]==='object') MV[k]=st.MV[k]; mvSave(); }
      if (Array.isArray(st.LIB)){ const L=st.LIB.filter(e=>e && okId(e.id) && hasI(e.i)); if (typeof win.libMerge==='function'){ const r=win.libMerge(L); if (r.rinominate && typeof win.toast==='function') win.toast('⚠️ '+win.libMergeMsg(r)); } else { const have=new Set(LIB.map(e=>e.id)); L.filter(e=>!have.has(e.id) && typeof e.n==='string' && isFinite(+e.a) && isFinite(+e.b)).forEach(e=>LIB.push(e)); if (typeof saveLib==='function') saveLib(); } }
      if (Array.isArray(st.REFS)){ const have=new Set(REFS.map(r=>r.id)); const add=st.REFS.filter(r=>r && okId(r.id) && !have.has(r.id) && hasI(r.i) && typeof r.n==='string' && Array.isArray(r.x) && Array.isArray(r.y) && r.x.length===r.y.length && r.x.length<=200000 && r.x.every(Number.isFinite) && r.y.every(Number.isFinite)); if (add.length){ REFS=REFS.concat(add); saveRefs(); } }
      if (Array.isArray(st.COMPS)) st.COMPS.filter(c=>c && okId(c.id) && Array.isArray(c.keys) && c.keys.every(k=>typeof k==='string')).forEach(c=>COMPS.push(Object.assign({mode:'stack',gap:1.1,out:true},c))); saveCmps();
      // la memoria di ogni spettro torna prima di ricaricarlo; va riconosciuta anche se la chiave interna dipende dal numero di punti
      win.ACCH_PENDING_MEM=new Map(); P.spectra.forEach(s=>win.ACCH_PENDING_MEM.set(s.path, s.memory||null));
      const ents=P.spectra.map(s=>({file:new File([s.bytes], s.name), path:s.path}));
      prevResults=(P.results||[]).filter(r=>r&&typeof r.name==='string'&&typeof r.text==='string');
      await addEntries(ents); win.ACCH_PENDING_MEM=null;
      if (ents.length && !files.length) throw new (F().ProjectError)('corrupted','nessuno spettro leggibile');
      const lost=ents.length-files.length;
      const k=Number.isInteger(st.curIndex)?st.curIndex: (st.curKey ? files.findIndex(f=>fkey(f)===st.curKey) : 0);
      if (files.length) cur=Math.max(0, Math.min(files.length-1, k));
      syncControls(); resetCaches(); refreshAll(); if (files.length) go(2);
      createdAt=P.manifest.createdAt||null;
      if (legacy){ name=null; path=null; } else { name=fileName||null; path=filePath||null; }
      busy=false; markSaved();
      toast(`📂 Progetto aperto: ${files.length} spettri.`);
      if (lost>0) toast(`⚠️ ${lost} file del progetto non sono stati riconosciuti.`);
      if (P.warnings.includes('newer-format-compatible')) toast('⚠️ Progetto salvato con una versione più recente: alcune informazioni potrebbero non essere mostrate. Aggiorna l\'applicazione.');
      if (legacy) toast('Progetto nel vecchio formato: con «Salva» diventerà un file .acchspettri; l\'originale resta intatto.');
      if (api.host.remember && path) api.host.remember(path, name);
      return true;
    }catch(e){ console.error(e); win.ACCH_PENDING_MEM=null; try{ restore(before); }catch(e2){ console.error(e2); } showErr(e); return false; }
    finally{ win.ACCH_PENDING_MEM=null; busy=false; loader(false); notify(); }
  }
  function init(){
    if (win.indexedDB && !win.ACCH_TEST){ let lastPut=null, nextAt=0; win.setInterval(()=>{ if (busy || !files.length || !isDirty() || Date.now()<nextAt) return; const q=sig(); if (q===lastPut) return; lastPut=q; const t0=Date.now(); autosave.put().catch(e=>console.error(e)).finally(()=>{ nextAt=Date.now()+20*(Date.now()-t0); }); },30000); win.setTimeout(()=>{ offerRecovery().catch(e=>console.error(e)); },800); }
    const hook=n=>{ const o=win[n]; if (typeof o==='function') win[n]=function(){ const r=o.apply(this,arguments); touch(); return r; }; };
    ['persist','saveS','mvSave','saveCmps','saveRefs'].forEach(hook);
    const ae=win.addEntries; win.addEntries=async function(){ const r=await ae.apply(this,arguments); touch(); return r; };
    baseline=sig();
    win.addEventListener('beforeunload', e=>{ if (api.host===hostDefault && isDirty()){ e.preventDefault(); e.returnValue=''; } });
  }
  Object.assign(api,{prevResults:()=>prevResults, autosave, offerRecovery, init, isDirty, guard, newProject, closeProject, save:()=>doSave(false), saveAs:()=>doSave(true), openBytes, async openFile(file){ return openBytes(new Uint8Array(await file.arrayBuffer()), file.name, null); }, onChange(fn){ listeners.push(fn); }, displayName, _build:build, _sig:sig, MSG});
  api.lock=v=>{ busy=!!v; };
  Object.defineProperty(api,'path',{get:()=>path}); Object.defineProperty(api,'busy',{get:()=>busy});
  win.AcchProject=api;
})(typeof self!=='undefined' ? self : this);
