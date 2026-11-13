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
    'too-large':'Il file del progetto è troppo grande per essere aperto in sicurezza.', 'newer-format':'Questo progetto è stato salvato con una versione più recente di Acchiappaspettri: aggiorna l\'applicazione per aprirlo.', 'no-migration':'Non riesco a convertire questo progetto dalla sua versione del formato.', 'no-zip':'Manca la libreria per leggere i progetti: ricarica la pagina.',
    'no-spectra':'Il progetto è integro, ma nessuno dei suoi spettri si può leggere: i file originali che contiene non sono in un formato riconosciuto o hanno troppo pochi punti. I dati già caricati non sono stati toccati.'
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
  let prevResults=[], kept=[];
  async function build(){
    files.forEach(persist);
    // formato 2: canale (sampleKey, channel) e dati propri dello spettro (series, cube, iso) se il modulo che lo ha letto li ha messi su f
    const missing=files.filter(f=>!f.raw && !(f.series||f.cube||f.iso)), spectra=files.filter(f=>f.raw || f.series || f.cube || f.iso).map(f=>({name:f.name, path:f.path, bytes:f.raw?new Uint8Array(f.raw):null, binary:!!f.rawBin, memory:memoryOf(f), processedCsv:processedCsv(f), sampleKey:f.sampleKey||null, channel:f.channel||null, series:f.series||undefined, cube:f.cube||undefined, iso:f.iso||undefined}));
    // spettri del progetto aperto che questa versione non sa ricostruire (per esempio solo series/cube/iso): si riscrivono come erano
    for (const r of kept) spectra.push(r);
    let results=[]; try{ results=analysisFiles().map(([n,t])=>({name:n, text:t})); }catch(e){ console.warn(e); }
    { const have=new Set(results.map(r=>r.name)); for (const r of prevResults){ const nm=r.name.startsWith('precedenti/')?r.name:'precedenti/'+r.name; if (!have.has(r.name) && !have.has(nm)){ have.add(nm); results.push({name:nm,text:r.text}); } } }   // calcolati in una sessione precedente e non rifatti: non si perdono
    const bytes=await F().encode({appVersion:APP_VERSION_FULL(), title:S.docTitle||'', createdAt:createdAt||undefined, state:stateObj(), spectra, libraries:api.libraries, results}, win.JSZip);
    return {bytes, count:spectra.length, missing:missing.length};
  }
  /* dopo aver scritto, rilegge ciò che ha prodotto: un salvataggio non verificato non conta come salvato */
  async function buildVerified(){ const b=await build(); await F().decode(b.bytes, win.JSZip); return b; }
  const hostDefault={
    async save(bytes, suggested){ win.download(new Blob([bytes],{type:F().MIME}), suggested); return {name:suggested, path:null}; },
    saveAs(bytes, suggested){ return hostDefault.save(bytes, suggested); },
    ask(message){ if (win.ACCH_TEST) return Promise.resolve('discard'); return win.AcchUi.choice(message, [['cancel','Annulla','ghost'],['discard','Non salvare','ghost'],['save','Salva','primary']]); }
  };
  const api={ host:hostDefault, libraries:[] };
  async function doSave(as){
    if (!files.length){ toast('Non c\'è ancora niente da salvare: carica qualche spettro. 🙂'); return false; }
    if (busy){ toast('Sto già salvando il progetto: un momento…'); return false; } busy=true;
    try{ const suggested=stampName(), pick=as || !path || !api.host.overwrite;
      // desktop: prima si sceglie dove salvare, poi si prepara il file (l'attesa non compare dietro al dialogo, né se si annulla)
      let target=null; if (pick && api.host.pickSave){ target=await api.host.pickSave(suggested); if (!target) return false; }
      loader(true,'Gino sta salvando il progetto…','',0.5); await frame();
      const b=await buildVerified();
      const r=target ? await api.host.writeTo(b.bytes, target) : pick ? await api.host.saveAs(b.bytes, suggested) : await api.host.overwrite(b.bytes, path);
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
    name=null; path=null; createdAt=null; prevResults=[]; kept=[]; api.libraries=[];
  }
  /* copia di sicurezza in memoria: se l'apertura si interrompe dopo aver svuotato, il lavoro torna com'era */
  function snapshot(){ return {files:files.slice(), cur, comps:COMPS.slice(), mv:JSON.parse(JSON.stringify(MV)), S:JSON.parse(JSON.stringify(S)), name, path, createdAt, kept:kept.slice(), libraries:api.libraries.slice()}; }
  function restore(o){ files.length=0; files.push(...o.files); cur=o.cur; COMPS.length=0; COMPS.push(...o.comps); saveCmps(); for (const k of Object.keys(MV)) delete MV[k]; Object.assign(MV,o.mv); mvSave(); S=merge(DEFAULTS,o.S); saveS(); name=o.name; path=o.path; createdAt=o.createdAt; kept=o.kept||[]; api.libraries=o.libraries||[]; files.forEach(persist); syncControls(); resetCaches(); refreshAll(); }
  async function newProject(){ if (!await guard()) return false; clearAll(); S.docTitle=DEFAULTS.docTitle; saveS(); busy=true; refreshAll(); go(1); busy=false; markSaved(); return true; }
  const closeProject=newProject;
  /* i rimandi «@id» dei picchi seguono la voce della libreria anche quando l'unione le ha dato un altro id (libMerge, map) */
  function remapLabels(list, map){ if (!map || !Object.keys(map).length) return; const own=Object.prototype.hasOwnProperty;
    for (const s of list){ const L=s && s.memory && s.memory.labels; if (!L || typeof L!=='object') continue;
      for (const k of Object.keys(L)){ const v=L[k]; if (typeof v==='string' && v[0]==='@' && own.call(map, v.slice(1))) L[k]='@'+map[v.slice(1)]; } } }
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
      if (Array.isArray(st.LIB)){ const L=st.LIB.filter(e=>e && okId(e.id) && hasI(e.i)); if (typeof win.libMerge==='function'){ const r=win.libMerge(L); if (r.rinominate && typeof win.toast==='function') win.toast('⚠️ '+win.libMergeMsg(r)); remapLabels(P.spectra, r.map); } else { const have=new Set(LIB.map(e=>e.id)); L.filter(e=>!have.has(e.id) && typeof e.n==='string' && isFinite(+e.a) && isFinite(+e.b)).forEach(e=>LIB.push(e)); if (typeof saveLib==='function') saveLib(); } }
      if (Array.isArray(st.REFS)){ const have=new Set(REFS.map(r=>r.id)); const add=st.REFS.filter(r=>r && okId(r.id) && !have.has(r.id) && hasI(r.i) && typeof r.n==='string' && Array.isArray(r.x) && Array.isArray(r.y) && r.x.length===r.y.length && r.x.length<=200000 && r.x.every(Number.isFinite) && r.y.every(Number.isFinite)); if (add.length){ REFS=REFS.concat(add); saveRefs(); } }
      if (Array.isArray(st.COMPS)) st.COMPS.filter(c=>c && okId(c.id) && Array.isArray(c.keys) && c.keys.every(k=>typeof k==='string')).forEach(c=>COMPS.push(Object.assign({mode:'stack',gap:1.1,out:true},c))); saveCmps();
      // la memoria di ogni spettro torna prima di ricaricarlo; va riconosciuta anche se la chiave interna dipende dal numero di punti
      // formato 2: la memoria si cerca per percorso, e per percorso + sampleKey per i canali di un file multicanale
      win.ACCH_PENDING_MEM=new Map(); P.spectra.forEach(s=>{ if (!s.bytes) return; if (s.sampleKey!=null) win.ACCH_PENDING_MEM.set(s.path+'\u0000'+s.sampleKey, s.memory||null); if (s.sampleKey==null || !win.ACCH_PENDING_MEM.has(s.path)) win.ACCH_PENDING_MEM.set(s.path, s.memory||null); });
      // un file si rilegge una volta sola anche se ne derivano più spettri (canali): stessa sorgente e stesso percorso
      const seen=new Set(), ents=[]; for (const s of P.spectra){ if (!s.bytes) continue; const k=(s.source||'')+'\u0000'+s.path; if (seen.has(k)) continue; seen.add(k); ents.push({file:new File([s.bytes], s.name), path:s.path}); }
      // spettri senza file originale (solo series, cube o iso): li ricostruisce il modulo che li conosce, altrimenti si conservano intatti
      kept=P.spectra.filter(s=>!s.bytes).filter(s=>!(typeof api.restoreDerived==='function' && api.restoreDerived(s))).map(s=>({name:s.name, path:s.path, bytes:null, binary:!!s.binary, memory:s.memory||null, sampleKey:s.sampleKey||null, channel:s.channel||null, series:s.series, cube:s.cube, iso:s.iso}));
      api.libraries=(P.libraries||[]).slice();   // librerie incorporate: si conservano e si riscrivono al salvataggio (le usa la libreria dei picchi, I4)
      prevResults=(P.results||[]).filter(r=>r&&typeof r.name==='string'&&typeof r.text==='string');
      await addEntries(ents); win.ACCH_PENDING_MEM=null;
      // contenitore valido (impronte verificate) ma nessuno spettro leggibile: non è un file danneggiato, e il messaggio lo dice
      if (ents.length && !files.length && !kept.length) throw new (F().ProjectError)('no-spectra', ents.map(e=>e.path).join(', '));
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
  // esportazione con la voce «Progetto»: stessi byte verificati del salvataggio, senza cambiare nome, percorso o stato di «salvato»
  api.buildBytes=async ()=>(await buildVerified()).bytes; api.stampName=stampName;
  api.lock=v=>{ busy=!!v; };
  Object.defineProperty(api,'path',{get:()=>path}); Object.defineProperty(api,'busy',{get:()=>busy});
  win.AcchProject=api;
})(typeof self!=='undefined' ? self : this);
