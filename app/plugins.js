// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Estensioni per nuovi formati (tappa I11): elenco installato, esecuzione isolata, installazione e Impostazioni → Estensioni.
   - Ogni lettura gira in un Web Worker dedicato, nuovo per ogni file e chiuso subito dopo (o al tempo massimo): nessuno stato
     resta fra un file e l'altro. È separato dal worker del nucleo (app/engine.js, I5): non condividono codice né messaggi.
   - Archivio: online IndexedDB («acch-plugins»), nel desktop l'archivio dell'app (AcchHost, chiave acch.plugins).
   - La parte pura (pacchetto, controlli, testo della sandbox) è in app/plugins-base.js. Guida: docs/ESTENSIONI.md. */
(function(win){
  'use strict';
  const C=win.AcchPluginsCore, doc=win.document;
  const en=()=>!!(win.AcchI18n && win.AcchI18n.lang==='en');
  const T=(it, e)=>en() ? e : it;
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const appVersion=()=>{ try{ return win.APP_VERSION_FULL ? win.APP_VERSION_FULL() : (typeof APP_VERSION_FULL==='function' ? APP_VERSION_FULL() : '0.0.0'); }catch(e){ return '0.0.0'; } };
  const toast=m=>{ if (typeof win.toast==='function') win.toast(m); };

  /* ---------- archivio ---------- */
  function idbStore(){ const DB='acch-plugins', ST='p';
    const open=()=>new Promise((res,rej)=>{ const q=win.indexedDB.open(DB,1); q.onupgradeneeded=()=>q.result.createObjectStore(ST,{keyPath:'id'}); q.onsuccess=()=>res(q.result); q.onerror=()=>rej(q.error); });
    const tx=async (mode, fn)=>{ const d=await open(); try{ return await new Promise((res,rej)=>{ const t=d.transaction(ST,mode), r=fn(t.objectStore(ST)); t.oncomplete=()=>res(r && r.result); t.onerror=()=>rej(t.error); t.onabort=()=>rej(t.error); }); } finally{ d.close(); } };
    return { kind:'indexeddb', list:()=>tx('readonly', s=>s.getAll()).then(v=>v||[]), put:rec=>tx('readwrite', s=>s.put(rec)), del:id=>tx('readwrite', s=>s.delete(id)) }; }
  function hostStore(){ const K='acch.plugins', S=win.AcchHost.store, get=()=>{ try{ const v=JSON.parse(S.getItem(K)); return Array.isArray(v)?v:[]; }catch(e){ return []; } };
    return { kind:'host', list:async ()=>get(), put:async rec=>{ const L=get().filter(r=>r.id!==rec.id); L.push(rec); S.setItem(K, JSON.stringify(L)); }, del:async id=>{ S.setItem(K, JSON.stringify(get().filter(r=>r.id!==id))); } }; }
  function memStore(){ const m=new Map(); return { kind:'memory', list:async ()=>[...m.values()], put:async r=>{ m.set(r.id,r); }, del:async id=>{ m.delete(id); } }; }
  const store=(win.AcchHost && win.AcchHost.kind==='desktop') ? hostStore() : (win.indexedDB ? idbStore() : memStore());

  /* ---------- elenco ---------- */
  const reg=new Map();   // id → {id, manifest, code, sha256, size, enabled, installedAt, compatible}
  function entryOf(rec){ const p=C.parsePackage(rec.text); if (p.manifest.id!==rec.id) throw new C.PluginError('manifest','id');
    return {id:rec.id, manifest:p.manifest, kind:p.kind, code:p.code, sha256:p.sha256, size:p.size, text:rec.text, enabled:rec.enabled!==false, installedAt:rec.installedAt||'', compatible:C.appSatisfies(p.manifest.minAppVersion, appVersion())}; }
  const broken=[];   // voci dell'archivio che non si leggono più: si mostrano per poterle togliere
  async function load(){ reg.clear(); broken.length=0; let L=[]; try{ L=await store.list(); }catch(e){ console.error('estensioni', e); }
    const recs=L.slice().sort((a,b)=>String(a.installedAt||'').localeCompare(String(b.installedAt||'')));
    for (const r of recs){ try{ const e=entryOf(r); reg.set(e.id, e); }catch(err){ console.warn('estensione non valida', r && r.id, err); if (r && typeof r.id==='string') broken.push(r.id); } }
    render(); }
  const ready=load();
  const usable=e=>!!e && e.enabled && e.compatible;
  const list=()=>[...reg.values()];
  const get=id=>reg.get(id)||null;
  const available=id=>usable(reg.get(id));
  // estensioni che leggono questo nome di file, nell'ordine di installazione
  const forName=name=>list().filter(e=>usable(e) && C.handles(e.manifest, name)).map(e=>e.id);
  const handlesName=name=>forName(name).length>0;
  /* quali estensioni provare per una voce di addEntries: all'apertura di un progetto solo quella che aveva letto il file
     (i file letti dall'app restano dell'app, anche se un'estensione dichiara la stessa estensione) */
  function candidates(name, ent){ ent=ent||{};
    if (ent.plugin) return available(ent.plugin) ? [ent.plugin] : [];
    if (Array.isArray(ent.want)) return [];
    return forName(name); }

  /* ---------- limite dei file in ingresso: controllo preventivo, prima di leggere il file (Impostazioni → Estensioni) ---------- */
  const MAX_KEY='acch.plugins.maxMB', MB=1048576;
  function maxMB(){ let v=null; try{ v=JSON.parse(win.AcchHost.store.getItem(MAX_KEY)); }catch(e){} v=Math.round(+v); return v>=1 && v<=1024 ? v : Math.round(C.LIMITS.inputBytes/MB); }
  function setMaxMB(v){ v=Math.round(+v); if (!(v>=1 && v<=1024)) return false; try{ win.AcchHost.store.setItem(MAX_KEY, JSON.stringify(v)); }catch(e){ return false; } return true; }
  const maxBytes=()=>maxMB()*MB;
  const tooBigText=size=>T(`file troppo grande per le estensioni (${(size/MB).toFixed(1)} MB, limite ${maxMB()} MB: si cambia in Impostazioni → Estensioni)`,`file too large for extensions (${(size/MB).toFixed(1)} MB, limit ${maxMB()} MB: change it in Settings → Extensions)`);

  /* ---------- esecuzione isolata ---------- */
  function run(e, buf, name, opt){ opt=opt||{};
    return new Promise(res=>{
      if (typeof win.Worker!=='function' || !win.Blob || !win.URL || !win.URL.createObjectURL) return res({ok:false, code:'worker'});
      if (buf.byteLength>(opt.maxBytes||maxBytes())) return res({ok:false, code:'input-too-large', msg:buf.byteLength});
      const url=win.URL.createObjectURL(new win.Blob([C.sandboxSource(e.code, opt.limits)], {type:'text/javascript'}));
      let w, over=false, t=null;
      const done=r=>{ if (over) return; over=true; clearTimeout(t); try{ w && w.terminate(); }catch(x){} win.URL.revokeObjectURL(url); res(r); };
      try{ w=new win.Worker(url, {name:'acch-estensione'}); }catch(x){ return done({ok:false, code:'worker', msg:String(x && x.message || x)}); }
      t=setTimeout(()=>done({ok:false, code:'timeout'}), opt.timeoutMs || C.LIMITS.timeoutMs);
      w.onmessage=ev=>done(ev.data && typeof ev.data==='object' ? ev.data : {ok:false, code:'bad-output', msg:'message'});
      w.onerror=ev=>{ if (ev && ev.preventDefault) ev.preventDefault(); done({ok:false, code:'crashed', msg:String(ev && ev.message || '')}); };
      w.onmessageerror=()=>done({ok:false, code:'bad-output', msg:'message'});
      const copy=buf.slice(0); w.postMessage({bytes:copy, name:String(name||'')}, [copy]); }); }
  const label=e=>'«'+e.manifest.name+'» '+e.manifest.version;
  function failText(e, code, msg, ms){ const n=label(e), sec=Math.round((ms||C.LIMITS.timeoutMs)/100)/10;
    const M={timeout:[`l'estensione ${n} non ha finito entro ${sec} s ed è stata fermata`, `the extension ${n} did not finish within ${sec} s and was stopped`],
      crashed:[`l'estensione ${n} si è interrotta (errore nel codice o memoria esaurita)`, `the extension ${n} stopped (code error or out of memory)`],
      threw:[`errore dell'estensione ${n}: ${msg||'?'}`, `error in the extension ${n}: ${msg||'?'}`],
      'no-reader':[`l'estensione ${n} non ha registrato un lettore (registerReader)`, `the extension ${n} did not register a reader (registerReader)`],
      async:[`l'estensione ${n} deve restituire il risultato subito, non una promessa`, `the extension ${n} must return its result directly, not a promise`],
      'not-finite':[`l'estensione ${n} ha restituito valori non numerici (NaN o infiniti): ${msg||''}`, `the extension ${n} returned non-numeric values (NaN or infinite): ${msg||''}`],
      'too-large':[`l'estensione ${n} ha restituito troppi dati (${msg||''}; al massimo ${C.LIMITS.channels} canali e ${C.LIMITS.points} punti)`, `the extension ${n} returned too much data (${msg||''}; at most ${C.LIMITS.channels} channels and ${C.LIMITS.points} points)`],
      'too-few':[`l'estensione ${n} ha restituito meno di ${C.LIMITS.minPoints} punti (${msg||''})`, `the extension ${n} returned fewer than ${C.LIMITS.minPoints} points (${msg||''})`],
      length:[`l'estensione ${n} ha restituito x e y di lunghezze diverse (${msg||''})`, `the extension ${n} returned x and y of different lengths (${msg||''})`],

      worker:[`questo browser non permette di eseguire le estensioni isolate`, `this browser cannot run extensions in isolation`]};
    if (code==='input-too-large') return tooBigText(+msg||0);
    const m=M[code]||[`l'estensione ${n} ha restituito dati non validi (${msg||code})`, `the extension ${n} returned invalid data (${msg||code})`];
    return T(m[0], m[1]); }
  /* lettura: {none:true} (non è un file di questa estensione), {error:testo} oppure {channels, meta, sample, technique, plugin} */
  async function read(id, buf, name, opt){ const e=reg.get(id); if (!usable(e)) return {error:T('estensione non disponibile: ','extension not available: ')+id}; return readWith(e, buf, name, opt); }
  async function readWith(e, buf, name, opt){
    const r=await run(e, buf, name, opt);
    if (!r.ok) return {error:failText(e, r.code, r.msg, opt && opt.timeoutMs)};
    let out; try{ out=C.validateOutput(r.out, {techniques:opt && opt.techniques}); }catch(err){ return {error:failText(e, err.code||'bad-output', err.detail||'')}; }
    if (out.none) return out;
    if (out.error) return {error:label(e)+': '+out.error};
    out.plugin={id:e.id, version:e.manifest.version, name:e.manifest.name, sha256:e.sha256};
    return out; }

  /* ---------- installazione ---------- */
  function errText(err){ const c=err && err.code, d=err && err.detail || '';
    const M={'not-a-package':['Il file non è un pacchetto di estensione di Acchiappaspettri (.acchplugin).','This file is not an Acchiappaspettri extension package (.acchplugin).'],
      'newer-package':['Il pacchetto usa una versione più recente del formato delle estensioni: aggiorna l\'applicazione.','The package uses a newer extension format: update the application.'],
      manifest:[`Il manifesto dell'estensione non è valido (campo «${d}»).`,`The extension manifest is not valid (field «${d}»).`],
      'reserved-ext':[`L'estensione vuole leggere i file .${d}, che Acchiappaspettri usa per sé: non si può installare.`,`The extension wants to read .${d} files, which Acchiappaspettri uses itself: it cannot be installed.`],
      permissions:[`L'estensione chiede permessi che Acchiappaspettri non concede (${d}): non si può installare.`,`The extension asks for permissions that Acchiappaspettri does not grant (${d}): it cannot be installed.`],
      'forbidden-code':['Il codice dell\'estensione usa «import»: le estensioni non possono caricare altro codice. Non si può installare.','The extension code uses «import»: extensions cannot load other code. It cannot be installed.'],
      'no-code':['Il pacchetto non contiene il codice del lettore.','The package does not contain the reader code.'],
      'too-large':['Il pacchetto è troppo grande (al massimo 2 MB).','The package is too large (at most 2 MB).'],
      empty:['Il file del pacchetto è vuoto.','The package file is empty.'],
      'min-app':[`L'estensione richiede Acchiappaspettri ${d} o successiva.`,`The extension requires Acchiappaspettri ${d} or later.`],
      reader:[`Il lettore dichiarativo non è valido (campo «${d}»).`,`The declarative reader is not valid (field «${d}»).`],
      kind:['Il pacchetto deve contenere un solo lettore: dichiarativo, WebAssembly o JavaScript.','The package must contain one reader only: declarative, WebAssembly or JavaScript.'],
      wasm:[`Il modulo WebAssembly non è valido (${d}).`,`The WebAssembly module is not valid (${d}).`],
      'wasm-imports':['Il modulo WebAssembly importa funzioni dall\'esterno: le estensioni non possono avere importazioni. Non si può installare.','The WebAssembly module imports external functions: extensions cannot have imports. It cannot be installed.'],
      'wasm-memory':['Il modulo WebAssembly deve dichiarare una memoria massima di 256 MB al più (4096 pagine).','The WebAssembly module must declare a maximum memory of at most 256 MB (4096 pages).'],
      base64:['Il pacchetto contiene dati base64 non validi.','The package contains invalid base64 data.'],
      examples:[`I file d'esempio del pacchetto non sono validi (${d}).`,`The package example files are not valid (${d}).`],
      'examples-fail':[`L'estensione non legge come atteso il suo file d'esempio ${d}: non è stata installata.`,`The extension does not read its example file ${d} as expected: it was not installed.`]};
    const m=M[c]||['Il pacchetto dell\'estensione non si può installare.','The extension package cannot be installed.']; return T(m[0], m[1]); }
  function inspect(bytes){ const p=C.parsePackage(bytes); if (!C.appSatisfies(p.manifest.minAppVersion, appVersion())) throw new C.PluginError('min-app', p.manifest.minAppVersion); return p; }
  async function install(p, opt){ opt=opt||{}; const old=reg.get(p.manifest.id);
    const rec={id:p.manifest.id, text:p.text, sha256:p.sha256, enabled:true, installedAt:old ? old.installedAt : new Date().toISOString()};
    await store.put(rec); await load(); return reg.get(rec.id); }
  async function remove(id){ await store.del(id); await load(); }
  async function setEnabled(id, v){ const e=reg.get(id); if (!e) return; await store.put({id, text:e.text, sha256:e.sha256, enabled:!!v, installedAt:e.installedAt}); await load(); }
  /* dal file scelto o trascinato: controlla, mostra l'avviso con autore, permessi e impronta, installa solo se l'utente conferma */
  /* file d'esempio del pacchetto: si leggono nel worker isolato e si confrontano con l'atteso prima di attivare l'estensione */
  async function verifyExamples(p){ const e={id:p.manifest.id, manifest:p.manifest, code:p.code, sha256:p.sha256};
    for (const x of p.examples){ const r=await readWith(e, x.bytes.slice().buffer, x.name, {techniques:TECH()});
      const out=r.error ? {error:r.error} : r; const c=C.compareExpected(out, x.expected);
      if (!c.ok) throw new C.PluginError('examples-fail', '«'+x.name+'» ('+c.why+')'); }
    return p.examples.length; }
  const TECH=()=>{ try{ return typeof INSTR!=='undefined' ? Object.keys(INSTR) : null; }catch(e){ return null; } };
  async function installFile(file){ await ready; let p;
    try{ p=inspect(new Uint8Array(await file.arrayBuffer())); p.verified=await verifyExamples(p); }catch(err){ console.warn(err); toast(errText(err)); return null; }
    const old=reg.get(p.manifest.id);
    if (old && old.sha256===p.sha256 && old.enabled){ toast(T(`L'estensione ${label(old)} è già installata (stessa impronta).`,`The extension ${label(old)} is already installed (same fingerprint).`)); return old; }
    if (!await confirmInstall(p)) return null;
    const e=await install(p);
    toast(T(`Estensione ${label(e)} installata: i file ${e.manifest.extensions.map(x=>'.'+x).join(', ')} si aprono con questa estensione.`,`Extension ${label(e)} installed: ${e.manifest.extensions.map(x=>'.'+x).join(', ')} files now open with this extension.`));
    return e; }

  /* ---------- finestre ---------- */
  const coreAccepts=ext=>{ try{ return typeof ACCEPT!=='undefined' && ACCEPT.test('x.'+ext); }catch(e){ return false; } };
  function permsHtml(m){ const ex=m.extensions.map(x=>'.'+x).join(', ');
    return '<ul class="plperm">'
      +`<li>${esc(T(`Legge i byte dei file ${ex} che apri tu, uno alla volta.`,`Reads the bytes of the ${ex} files you open, one at a time.`))}</li>`
      +`<li>${esc(T('Restituisce soltanto numeri (x, y), nomi dei canali e righe di informazioni: Acchiappaspettri li controlla prima di usarli.','Returns only numbers (x, y), channel names and information lines: Acchiappaspettri checks them before using them.'))}</li>`
      +`<li>${esc(T('Non ha accesso a rete, altri file, archivio dell\'app, progetti e interfaccia.','Has no access to the network, other files, the app storage, projects or the interface.'))}</li>`
      +`<li>${esc(T(`Ogni lettura ha un tempo massimo di ${Math.round(C.LIMITS.timeoutMs/1000)} s e un limite ai dati restituiti.`,`Each read has a time limit of ${Math.round(C.LIMITS.timeoutMs/1000)} s and a limit on the data returned.`))}</li></ul>`; }
  function dialog(){ let d=doc.getElementById('dlgPlugin'); if (d) return d;
    d=doc.createElement('dialog'); d.id='dlgPlugin'; d.className='wide'; d.setAttribute('aria-labelledby','plTitle');
    d.innerHTML='<div class="dlg" data-noi18n><h2 id="plTitle"></h2><div id="plBody"></div><div class="actions"><button class="btn ghost" type="button" id="plCancel"></button><button class="btn primary" type="button" id="plOk"></button></div></div>';
    doc.body.appendChild(d); return d; }
  function confirmInstall(p){ const d=dialog(), m=p.manifest, old=reg.get(m.id), desc=en() ? m.description.en : m.description.it;
    const rows=[[T('Nome','Name'), m.name], [T('Versione','Version'), m.version], [T('Autore','Author'), m.author], [T('Licenza','Licence'), m.license], ['ID', m.id],
      [T('Formati','Formats'), m.extensions.map(x=>'.'+x).join(', ')], [T('Richiede','Requires'), 'Acchiappaspettri '+m.minAppVersion], [T('Tipo','Type'), kindText(p.kind)],
      [T('Verifica','Check'), p.verified ? T(`letti come atteso ${p.verified} file d'esempio del pacchetto`,`${p.verified} example files of the package read as expected`) : T('il pacchetto non contiene file d\'esempio','the package contains no example files')]];
    if (m.homepage) rows.push([T('Sito','Website'), m.homepage]);
    const notes=[];
    if (old) notes.push(T(`Sostituisce la versione ${old.manifest.version} già installata.`,`Replaces the installed version ${old.manifest.version}.`));
    const shared=m.extensions.filter(coreAccepts); if (shared.length) notes.push(T(`I file ${shared.map(x=>'.'+x).join(', ')} li legge anche Acchiappaspettri: si prova prima l'estensione e, se dice che il file non è suo, lo legge l'app.`,`Acchiappaspettri also reads ${shared.map(x=>'.'+x).join(', ')} files: the extension is tried first and, if it says the file is not its own, the app reads it.`));
    for (const o of list()) if (o.id!==m.id && o.manifest.extensions.some(x=>m.extensions.includes(x))) notes.push(T(`Anche ${label(o)} legge i file ${o.manifest.extensions.filter(x=>m.extensions.includes(x)).map(x=>'.'+x).join(', ')}: si prova prima quella installata prima.`,`${label(o)} also reads ${o.manifest.extensions.filter(x=>m.extensions.includes(x)).map(x=>'.'+x).join(', ')} files: the one installed first is tried first.`));
    $('#plTitle', d).textContent=T('Installare questa estensione?','Install this extension?');
    $('#plBody', d).innerHTML=`<p class="plwarn"><b>${esc(T('Un\'estensione è codice scritto da altri e non è firmata.','An extension is code written by others and is not signed.'))}</b> ${esc(T('Installala solo se ti fidi dell\'autore e se l\'impronta qui sotto coincide con quella pubblicata dall\'autore.','Install it only if you trust the author and the fingerprint below matches the one the author published.'))}</p>`
      +'<table class="pltab">'+rows.map(([k,v])=>`<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')+'</table>'
      +(desc?`<p class="why">${esc(desc)}</p>`:'')
      +`<h4 class="anh">${esc(T('Permessi','Permissions'))}</h4>`+permsHtml(m)
      +`<h4 class="anh">${esc(T('Impronta SHA-256 del pacchetto','SHA-256 fingerprint of the package'))}</h4><p><code id="plSha" class="plsha">${esc(C.fingerprint(p.sha256))}</code></p>`
      +notes.map(n=>`<p class="why">${esc(n)}</p>`).join('');
    $('#plCancel', d).textContent=T('Annulla','Cancel'); $('#plOk', d).textContent=old ? T('Aggiorna','Update') : T('Installa','Install');
    return new Promise(res=>{ const finish=v=>{ d.removeEventListener('cancel', onCancel); d.close(); res(v); }, onCancel=ev=>{ ev.preventDefault(); finish(false); };
      $('#plCancel', d).onclick=()=>finish(false); $('#plOk', d).onclick=()=>finish(true);
      d.addEventListener('cancel', onCancel); if (!d.open) d.showModal(); $('#plCancel', d).focus(); }); }
  function $(s, r){ return (r||doc).querySelector(s); }
  function kindText(k){ return k==='declarative' ? T('dichiarativo (nessun codice: lo interpreta l\'app)','declarative (no code: the app interprets it)') : k==='wasm' ? T('modulo WebAssembly senza importazioni','WebAssembly module without imports') : T('codice JavaScript','JavaScript code'); }

  /* Impostazioni → Estensioni: si inserisce prima di «Informazioni» e si ridisegna a ogni apertura */
  function section(){ const st=doc.getElementById('dlgSettings'); if (!st) return null; let box=doc.getElementById('stPlugins'); if (box) return box;
    const info=[...st.querySelectorAll('h4.anh')].pop(), wrap=doc.createElement('div'); wrap.id='stPlugWrap'; wrap.setAttribute('data-noi18n','');
    wrap.innerHTML='<h4 class="anh" id="stPlugTitle"></h4><p class="why" id="stPlugWhy"></p><div id="stPlugins"></div><div class="row"><button class="btn small" type="button" id="stPlugAdd"></button><input type="file" id="plugIn" accept=".acchplugin" hidden></div><label class="ibf" style="margin-top:8px"><span id="stPlugMaxLab"></span><input type="number" id="stPlugMax" min="1" max="1024" step="1" style="width:7em"></label>';
    if (info) st.querySelector('.dlg').insertBefore(wrap, info); else st.querySelector('.dlg').appendChild(wrap);
    $('#stPlugAdd').onclick=()=>$('#plugIn').click();
    $('#stPlugMax').onchange=ev=>{ if (!setMaxMB(ev.target.value)) toast(T('Il limite va da 1 a 1024 MB.','The limit ranges from 1 to 1024 MB.')); ev.target.value=maxMB(); };
    $('#plugIn').onchange=async ev=>{ const f=ev.target.files && ev.target.files[0]; ev.target.value=''; if (f) await installFile(f); };
    const box2=$('#stPlugins');
    box2.addEventListener('change', async ev=>{ const t=ev.target; if (t.dataset && t.dataset.plen){ await setEnabled(t.dataset.plen, t.checked); toast(t.checked ? T('Estensione attivata.','Extension enabled.') : T('Estensione disattivata: i suoi formati non si aprono finché non la riattivi.','Extension disabled: its formats do not open until you enable it again.')); } });
    box2.addEventListener('click', async ev=>{ const b=ev.target.closest && ev.target.closest('button[data-plrm]'); if (!b) return; const id=b.dataset.plrm, e=reg.get(id);
      const msg=T(`Rimuovere l'estensione ${e?label(e):id}? I progetti che contengono file letti da lei si aprono ancora e conservano i file, ma quegli spettri non si vedono finché non la reinstalli.`,`Remove the extension ${e?label(e):id}? Projects with files read by it still open and keep the files, but those spectra are not shown until you reinstall it.`);
      const ok=win.AcchUi ? (await win.AcchUi.choice(msg, [['no',T('Annulla','Cancel'),'ghost'],['yes',T('Rimuovi','Remove'),'primary']]))==='yes' : true;
      if (!ok) return; await remove(id); toast(T('Estensione rimossa.','Extension removed.')); });
    return box2; }
  function render(){ const box=section(); if (!box) return;
    $('#stPlugTitle').textContent=T('Estensioni','Extensions');
    $('#stPlugWhy').textContent=T('Un\'estensione aggiunge la lettura di un formato di file. Gira isolata, senza rete né accesso ai tuoi dati, e riceve solo i file che apri.','An extension adds a file format reader. It runs in isolation, without network or access to your data, and receives only the files you open.');
    $('#stPlugAdd').textContent=T('Installa un\'estensione…','Install an extension…');
    $('#stPlugMaxLab').textContent=T('Dimensione massima dei file letti dalle estensioni (MB)','Maximum size of files read by extensions (MB)'); $('#stPlugMax').value=maxMB();
    const L=list();
    let h=L.length ? '' : `<p class="why" id="stPlugNone">${esc(T('Nessuna estensione installata.','No extensions installed.'))}</p>`;
    for (const e of L){ const m=e.manifest;
      h+=`<div class="plitem" data-plid="${esc(e.id)}"><div><b>${esc(m.name)}</b> <span data-noi18n>${esc(m.version)}</span> · ${esc(m.author)} · ${esc(m.license)}`
        +`<br><small>${esc(kindText(e.kind))} · ${esc(m.extensions.map(x=>'.'+x).join(', '))} · SHA-256 <code>${esc(e.sha256.slice(0,16))}…</code>${e.compatible?'':' · '+esc(T('richiede Acchiappaspettri ','requires Acchiappaspettri ')+m.minAppVersion)}</small></div>`
        +`<label class="check"><input type="checkbox" data-plen="${esc(e.id)}"${e.enabled?' checked':''}${e.compatible?'':' disabled'}> ${esc(T('Attiva','Enabled'))}</label>`
        +`<button class="btn small ghost" type="button" data-plrm="${esc(e.id)}">${esc(T('Rimuovi','Remove'))}</button></div>`; }
    for (const id of broken) h+=`<div class="plitem" data-plid="${esc(id)}"><div><b>${esc(id)}</b><br><small>${esc(T('pacchetto non più valido','package no longer valid'))}</small></div><button class="btn small ghost" type="button" data-plrm="${esc(id)}">${esc(T('Rimuovi','Remove'))}</button></div>`;
    box.innerHTML=h; }
  function hook(){ const st=doc.getElementById('dlgSettings'); if (!st) return; render();
    new win.MutationObserver(()=>{ if (st.open) render(); }).observe(st, {attributes:true, attributeFilter:['open']});
    win.addEventListener('acch-lang', render);
    if (!doc.getElementById('plugCss')){ const s=doc.createElement('style'); s.id='plugCss';
      s.textContent='.plitem{display:flex;gap:10px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line,#ddd)}.plitem>div{flex:1}.pltab{border-collapse:collapse;margin:6px 0}.pltab th{text-align:left;padding:2px 12px 2px 0;font-weight:600;vertical-align:top}.pltab td{padding:2px 0;word-break:break-word}.plsha{font-family:ui-monospace,Menlo,Consolas,monospace;word-break:break-all;user-select:all}.plperm{margin:4px 0 8px 18px;padding:0}.plwarn{padding:8px 10px;border-left:3px solid #c77700;background:rgba(199,119,0,.08)}';
      doc.head.appendChild(s); } }
  if (doc.readyState==='loading') doc.addEventListener('DOMContentLoaded', hook); else hook();

  win.AcchPlugins={ready, list, get, available, forName, handlesName, candidates, read, run, inspect, verifyExamples, maxMB, setMaxMB, maxBytes, tooBigText, install, installFile, remove, setEnabled, reload:load, errText, store};
})(window);
