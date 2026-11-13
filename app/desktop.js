// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Ponte con l'app desktop (Tauri): menu, file nativi, progetto, chiusura sicura, aggiornamenti firmati.
   Nella pagina online window.__TAURI__ non c'è e questo file non fa nulla. */
(function(win){
  'use strict';
  const T=win.__TAURI__; if (!T) return;
  const inv=T.core.invoke, tr=s=>win.AcchI18n.lang==='en' ? win.AcchI18n.tr(s) : s, $=s=>document.querySelector(s);
  const lsG=k=>{ try{ return JSON.parse(AcchHost.store.getItem(k)); }catch(e){ return null; } }, lsS=(k,v)=>{ try{ AcchHost.store.setItem(k,JSON.stringify(v)); }catch(e){} };
  const CHECK_EVERY=6*3600*1000, LATER_KEY='acch.update.later', RECENT='acch.recent';
  const PAGE='https://lorebiri.github.io/acchiappaspettri/';
  let info={os:'',kind:'',e2e:false}, curUpdate=null, closing=false, installing=false;
  // la finestra parte nascosta (tauri.conf.json, visible:false) e si mostra dopo il primo disegno: niente finestra bianca all'avvio
  requestAnimationFrame(()=>requestAnimationFrame(()=>inv('app_ready').catch(e=>console.warn(e))));   // il secondo frame arriva dopo il primo disegno

  async function writeTo(path, bytes){ await inv('write_file', bytes, {headers:{'x-acch-path':encodeURIComponent(path)}}); }
  async function readFrom(path){ const b=await inv('read_file',{path}); return new Uint8Array(b); }
  const errMsg=e=>{ const s=String(e||''); if (/not-allowed/.test(s)) return 'Accesso al percorso non consentito.'; if (/PermissionDenied/.test(s)) return 'Scrittura non consentita in questa cartella: scegline un\'altra.'; if (/NotFound/.test(s)) return 'Il file non esiste più.'; if (/StorageFull|QuotaExceeded/.test(s)) return 'Il disco è pieno.'; return 'Lettura o scrittura del file non riuscita.'; };

  /* salvataggi: finestra del sistema al posto del download del browser (che nelle webview non funziona) */
  // risponde true solo se il file è stato scritto; false se annullato o non riuscito
  win.download=async function(blob, name){
    try{ const ext=(/\.([\w]{1,10})$/.exec(name)||[])[1], p=await inv('pick_save',{title:tr('Salva file'), suggested:name, filterName:ext?ext.toUpperCase():null, extensions:ext?[ext]:null, kind:'export'}); if (!p) return false;
      await writeTo(p.path, new Uint8Array(await blob.arrayBuffer())); win.toast('💾 Salvato: '+p.name); return true; }
    catch(e){ console.error(e); win.toast('😕 '+tr(errMsg(e))); return false; } };
  // i collegamenti ai file appena prodotti (blob) e quelli esterni non si possono seguire nella webview
  document.addEventListener('click', async e=>{ const a=e.target.closest && e.target.closest('a[href]'); if (!a) return; const h=a.getAttribute('href');
    if (a.hasAttribute('download') && h.startsWith('blob:')){ e.preventDefault(); const name=a.getAttribute('download'); try{ const r=await new Promise((res,rej)=>{ const x=new XMLHttpRequest(); x.open('GET',h); x.responseType='blob'; x.onload=()=>res(x.response); x.onerror=rej; x.send(); }); win.download(r, name); }catch(err){ win.toast('😕 '+tr(errMsg(err))); } return; }
    if (/^(https?:|mailto:)/.test(h)){ e.preventDefault(); try{ await T.opener.openUrl(h); }catch(err){ console.warn(err); } } }, true);

  /* ricaricare la pagina perderebbe gli spettri: nell'app non si può, né da tastiera né dal menu di sistema della webview */
  document.addEventListener('keydown', e=>{ if (e.key==='F5' || ((e.ctrlKey||e.metaKey) && (e.key==='r'||e.key==='R'))){ e.preventDefault(); e.stopPropagation(); } }, true);
  document.addEventListener('contextmenu', e=>{ if (!e.target.closest('input,textarea')) e.preventDefault(); });
  /* progetto */
  function remember(path, name){ if (!path) return; const L=(lsG(RECENT)||[]).filter(x=>x.path!==path); L.unshift({path,name}); lsS(RECENT,L.slice(0,8)); buildMenu(); }
  Object.assign(win.AcchProject.host={}, {
    async pickSave(suggested){ const p=await inv('pick_save',{title:tr('Salva progetto con nome'), suggested, filterName:tr('Progetto di Acchiappaspettri'), extensions:['acchspettri'], kind:'project'}); return p ? {path:p.path, name:p.name} : null; },
    async writeTo(bytes, target){ await writeTo(target.path, bytes); return target; },
    async saveAs(bytes, suggested){ const t=await this.pickSave(suggested); return t ? this.writeTo(bytes, t) : null; },
    async overwrite(bytes, path){ await writeTo(path, bytes); return {path, name:path.split(/[\\/]/).pop()}; },
    ask(message){ return win.AcchUi.choice(message, [['cancel','Annulla','ghost'],['discard','Non salvare','ghost'],['save','Salva','primary']]); },
    remember
  });
  win.AcchProject.onError=(m,e)=>{ if (!m && e) win.toast('😕 '+tr(errMsg(e))); };
  async function openPath(path, name){ try{ const bytes=await readFrom(path); return await win.AcchProject.openBytes(bytes, name||path.split(/[\\/]/).pop(), path); }catch(e){ console.error(e); win.toast('😕 '+tr(errMsg(e))); const L=(lsG(RECENT)||[]).filter(x=>x.path!==path); lsS(RECENT,L); buildMenu(); return false; } }
  /* scelta dei file: nel desktop nessun <input type=file> apre il selettore della webview (su Windows si riduce a una barra «Apri» e blocca la finestra).
     Il clic va ai dialoghi nativi con i filtri di «accept»; i file scelti arrivano nell'input con DataTransfer ed evento change, così i gestori della pagina restano gli stessi. */
  const PICK_KIND={inFiles:'spectra', inFolder:'spectra', refFiles:'spectra', openProjIn:'project', refImport:'settings', presetFile:'settings', imVis:'images', imIR:'images', imUV:'images'};
  const IMG_EXT=['jpg','jpeg','png','tif','tiff','webp','bmp','heic','heif'];
  function acceptExt(input){ const out=[]; for (const a of String(input.accept||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean)){ if (a[0]==='.') out.push(a.slice(1)); else if (a==='image/*') out.push(...IMG_EXT); else if (a==='application/json') out.push('json'); else if (a==='application/zip') out.push('zip'); else return []; } return [...new Set(out)]; }
  // file di una cartella che la pagina scarta comunque per nome: non si leggono (restano nell'elenco dei saltati, come online)
  const wanted=name=>{ try{ return ACCEPT.test(name) || IMG_RE.test(name) || /\.(acchiappa\.json|acchspettri)$/i.test(name); }catch(e){ return true; } };
  async function readPicked(L, onlyWanted){ const out=[]; for (const p of L){ try{ const b=(onlyWanted && !wanted(p.name)) ? new Uint8Array(0) : await readFrom(p.path); out.push({p, file:new File([b], p.name)}); }catch(e){ console.error(e); win.toast('😕 '+tr(errMsg(e))); } } return out; }
  let picking=false;
  async function nativePick(input){
    if (picking) return; picking=true;   // un dialogo alla volta
    try{
      if (input.id==='openProjIn'){ await openDialog(); return; }   // così il progetto ricorda il suo percorso
      const folder=input.hasAttribute('webkitdirectory'), kind=PICK_KIND[input.id]||'other', ext=acceptExt(input), filt=ext.length?{filterName:ext.map(e=>e.toUpperCase()).join(', '), extensions:ext}:{};
      let L;
      if (folder) L=await inv('pick_folder',{title:tr('Scegli cartella'), kind}); if (folder) tooBig(L);
      else if (input.multiple) L=await inv('pick_many',Object.assign({title:tr('Scegli file'), kind},filt));
      else { const p=await inv('pick_open',Object.assign({title:tr('Scegli file'), kind, filterName:'', extensions:[]},filt)); L=p?[p]:[]; }
      if (!L || !L.length){ input.dispatchEvent(new Event('cancel')); return; }
      const got=await readPicked(L, folder); if (!got.length){ input.dispatchEvent(new Event('cancel')); return; }
      const dt=new DataTransfer(); got.forEach(g=>dt.items.add(g.file)); input.files=dt.files;
      // percorso dentro la cartella, come webkitRelativePath della pagina online
      if (folder) [...input.files].forEach((f,i)=>{ const rel=got[i] && got[i].p.rel; if (rel && f.webkitRelativePath!==rel) Object.defineProperty(f,'webkitRelativePath',{value:rel}); });
      input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true}));
    }catch(e){ console.error(e); win.toast('😕 '+tr(errMsg(e))); try{ input.dispatchEvent(new Event('cancel')); }catch(_){} }
    finally{ picking=false; }
  }
  const isFileInput=t=>t instanceof HTMLInputElement && t.type==='file';
  // clic dell'utente (anche su una <label>) e clic da programma: il selettore della webview non parte mai
  document.addEventListener('click', e=>{ if (isFileInput(e.target)){ e.preventDefault(); nativePick(e.target); } }, true);
  const oClick=HTMLInputElement.prototype.click, oShow=HTMLInputElement.prototype.showPicker;
  HTMLInputElement.prototype.click=function(){ if (this.type==='file'){ nativePick(this); return; } return oClick.call(this); };
  if (oShow) HTMLInputElement.prototype.showPicker=function(){ if (this.type==='file'){ nativePick(this); return; } return oShow.call(this); };
  function addSpectra(){ return nativePick($('#inFiles')); }
  async function openDialog(){ const p=await inv('pick_open',{title:tr('Apri progetto'), filterName:tr('Progetto di Acchiappaspettri'), extensions:['acchspettri','json'], kind:'project'}); if (p) await openPath(p.path, p.name); }
  let draining=Promise.resolve();   // i file aperti dal sistema si aprono uno alla volta
  // file grezzi aperti dal sistema (doppio clic, «Apri con»): il percorso relativo conserva la cartella .D di ChemStation, così i canali dello stesso campione stanno sulla stessa riga
  const relOf=path=>{ const P=String(path).split(/[\\/]/).filter(Boolean), n=P.pop()||path, d=P.pop(); return d && /\.d$/i.test(d) ? d+'/'+n : n; };
  const isProj=n=>/\.(acchspettri|acchiappa\.json)$/i.test(n), isLib=n=>/\.(acchlib|json)$/i.test(n) && !isProj(n);
  function drainPending(){ draining=draining.then(async ()=>{ while (win.AcchProject.busy) await new Promise(r=>setTimeout(r,200));
      await new Promise(r=>setTimeout(r,150));   // «Apri con» su più file: su Windows e Linux arrivano uno per volta, si aspettano gli altri per mostrarli insieme
      const L=await inv('take_pending_open'); for (const p of L.filter(p=>isProj(p.name))) await openPath(p.path, p.name);
      // librerie dei picchi (I4): si importano, con l'unione voce per voce e i conflitti espliciti
      for (const p of L.filter(p=>isLib(p.name))){ try{ const t=new TextDecoder().decode(await readFrom(p.path)); if (win.AcchLibUi) await win.AcchLibUi.importText(t, p.name); }catch(e){ console.error(e); win.toast(tr(errMsg(e))); } }
      const raw=L.filter(p=>!isProj(p.name) && !isLib(p.name)); if (!raw.length) return;
      // con un lavoro già aperto si chiede dove metterli (ROADMAP I3): nel progetto aperto o in uno nuovo
      if (files.length && !win.ACCH_TEST){ const ans=await win.AcchUi.choice(tr('Aggiungere {0} file al progetto aperto «{1}»?').replace('{0}',raw.length).replace('{1}',win.AcchProject.displayName()), [['cancel','Annulla','ghost'],['new','Nuovo progetto','ghost'],['add','Aggiungi','primary']]);
        if (ans==='cancel') return; if (ans==='new' && !await win.AcchProject.newProject()) return; }
      { const got=await readPicked(raw.map(p=>({path:p.path, name:p.name, rel:relOf(p.path)})), false); if (got.length) await win.addEntries(got.map(g=>({file:g.file, path:g.p.rel}))); }
    }).catch(e=>console.error(e)); return draining; }
  T.event.listen('acch-open-files', drainPending);

  /* Analisi → «Preimpostazioni»: la sezione è in fondo a Esporta, chiusa; si apre e si porta in vista */
  function openPresets(){ if (!files.length) return; win.go(3); const d=$('#presetFile') && $('#presetFile').closest('details'); if (!d) return; d.open=true;
    requestAnimationFrame(()=>{ d.scrollIntoView({block:'start'}); const s=d.querySelector('summary'); if (s) s.focus({preventScroll:true}); }); }

  /* trascinamento nativo (tauri.conf: dragDropEnabled): il lato nativo concede i percorsi trascinati, espande le cartelle
     ed emette «acch-dropped» con {path, name, rel}; qui si leggono e vanno a addEntries come nel trascinamento della pagina */
  const dropBox=()=>document.getElementById('drop');
  try{ T.webview.getCurrentWebview().onDragDropEvent(ev=>{ const t=ev.payload && ev.payload.type, d=dropBox(); if (!d) return;
    if (t==='enter' || t==='over') d.classList.add('over'); else d.classList.remove('over'); }); }catch(e){ console.warn(e); }
  const MAX_TREE=20000, tooBig=L=>{ if (L && L.length>=MAX_TREE) win.toast('⚠️ '+tr('Cartella troppo grande: caricati i primi {0} file (limite di 20 000 file e 16 livelli di sottocartelle). Trascina le sottocartelle restanti una alla volta.').replace('{0}', L.length)); };
  T.event.listen('acch-dropped', async ev=>{ const L=(ev && ev.payload)||[]; if (!L.length) return; tooBig(L);
    try{ loader(true, 'Gino sta guardando cosa hai trascinato…', '', null); await frame();
      const got=await readPicked(L, true);
      const ents=got.map(g=>({file:g.file, path:g.p.rel||g.p.name}));
      if (ents.length) await win.addEntries(ents); else loader(false); }
    catch(e){ console.error(e); loader(false); win.toast('😕 '+tr(errMsg(e))); } });

  /* chiusura: mai perdere il lavoro senza chiedere. Prima di chiudere si finiscono le scritture dell'archivio (al massimo 3 s) */
  const flushStore=()=>Promise.race([Promise.resolve(win.AcchHost && win.AcchHost.store.flush()).catch(()=>{}), new Promise(r=>setTimeout(r,3000))]);
  async function requestQuit(){ if (closing) return; if (!await win.AcchProject.guard()) return; closing=true; await flushStore(); await T.window.getCurrentWindow().destroy(); }
  T.window.getCurrentWindow().onCloseRequested(async ev=>{ if (closing) return; ev.preventDefault(); await requestQuit(); });

  /* titolo della finestra e barra degli strumenti */
  function title(i){ const t=(i.dirty?'• ':'')+i.name+' — Acchiappaspettri'; T.window.getCurrentWindow().setTitle(t).catch(()=>{}); }
  win.AcchProject.onChange(title);
  /* menu nativo, ricostruito quando cambia la lingua o l'elenco dei recenti */
  let menuBusy=false, menuAgain=false;
  async function buildMenu(){ if (menuBusy){ menuAgain=true; return; } menuBusy=true;
    try{ const M=T.menu, item=(text,action,accelerator)=>M.MenuItem.new({text:tr(text),action,accelerator}), sep=()=>M.PredefinedMenuItem.new({item:'Separator'}), pre=(k,text)=>M.PredefinedMenuItem.new(text?{item:k,text:tr(text)}:{item:k});
      const recent=lsG(RECENT)||[], recItems=recent.length ? await Promise.all(recent.map(r=>M.MenuItem.new({text:r.name,action:()=>openPath(r.path,r.name)}))) : [await M.MenuItem.new({text:tr('Nessun progetto recente'),enabled:false})];
      const sub=async (text,items)=>M.Submenu.new({text:tr(text),items:await Promise.all(items)});
      const file=await sub('File',[item('Nuovo progetto',()=>win.AcchProject.newProject(),'CmdOrCtrl+N'),item('Apri progetto…',openDialog,'CmdOrCtrl+O'),sub('Progetti recenti',recItems),sep(),item('Salva progetto',()=>win.AcchProject.save(),'CmdOrCtrl+S'),item('Salva progetto con nome…',()=>win.AcchProject.saveAs(),'CmdOrCtrl+Shift+S'),item('Chiudi progetto',()=>win.AcchProject.closeProject(),'CmdOrCtrl+W'),sep(),item('Aggiungi spettri…',addSpectra),item('Esporta (PDF, immagini, dati)…',()=>{ if (files.length) win.go(3); },'CmdOrCtrl+E'),...(info.os==='macos'?[]:[sep(),item('Esci',requestQuit,'CmdOrCtrl+Q')])]);
      const edit=await sub('Modifica',[pre('Undo','Annulla'),pre('Redo','Ripeti'),sep(),pre('Cut','Taglia'),pre('Copy','Copia'),pre('Paste','Incolla'),pre('SelectAll','Seleziona tutto')]);
      const Sh=win.AcchShell;
      const view=await sub('Vista',[item('Grafico',()=>{ if (files.length){ Sh.showDoc('graph'); } },'CmdOrCtrl+1'),item('Foglio dati',()=>{ if (files.length) Sh.showDoc('sheet'); },'CmdOrCtrl+2'),item('Più campioni',()=>{ if (files.length) win.openTab('multi'); },'CmdOrCtrl+3'),sep(),item('Pannello del progetto',()=>Sh.togglePane('left')),item('Ispettore',()=>Sh.togglePane('right')),item('Risultati',()=>Sh.togglePane('bottom')),item('Solo il grafico',()=>Sh.toggleFocus(),'F11'),sep(),item('Mostra tutto',()=>{ const z=$('#zReset'); if (z) z.click(); }),item('Testo più grande o più piccolo',()=>$('#zoomTxt').click()),item('Barra dei comandi',()=>win.openCmd(),'CmdOrCtrl+K'),item('Impostazioni…',()=>win.AcchUi.openSettings(),'CmdOrCtrl+,')]);
      const insp=t=>()=>{ if (files.length){ Sh.showDoc('graph'); win.openTab(t); } };
      const res=t=>()=>{ if (files.length){ Sh.showPane('bottom',true); Sh.showRes(t); } };
      const ana=await sub('Analisi',[item('Picchi',insp('peaks')),item('Elaborazione (linea di base, smoothing, derivate)',insp('proc')),item('Dati dello spettro e strumento',insp('zone')),item('Riferimenti e miscele',insp('refs')),sep(),item('Deconvoluzione e parametri',insp('an')),item('Controllo del dato',res('qual')),item('Ipotesi',res('hyp')),sep(),item('Confronta gli spettri',()=>{ if (files.length) win.setView('cmp'); }),item('Taratura, PLS, PCA, composizione',()=>{ if (files.length) win.openTab('multi'); }),item('Composizione XRF e spessori',()=>{ if (files.length){ Sh.showDoc('graph'); win.openTab('an'); const d=$('#secCult'); if (d){ d.open=true; d.scrollIntoView&&d.scrollIntoView({block:'start'}); } } }),item('Parametri per tecnica',res('tech')),item('Preimpostazioni',openPresets),item('Falso colore da foto',()=>$('#imgBtn').click())]);
      const help=await sub('Aiuto',[item('Guida rapida',()=>win.startTour&&win.startTour()),item('A cosa serve Acchiappaspettri',()=>$('#aboutBtn').click()),item('Scorciatoie da tastiera',()=>win.showKeys&&win.showKeys()),item('Novità di questa versione',()=>win.showNews&&win.showNews()),sep(),item('Controlla aggiornamenti…',()=>checkUpdate(true)),item('Documentazione',()=>T.opener.openUrl('https://github.com/lorebiri/acchiappaspettri#readme').catch(e=>console.warn(e))),sep(),item('Informazioni',()=>win.AcchUi.openSettings())]);
      const items=[file,edit,view,ana,help];
      if (info.os==='macos') items.unshift(await sub('Acchiappaspettri',[item('Informazioni su Acchiappaspettri',()=>win.AcchUi.openSettings()),item('Controlla aggiornamenti…',()=>checkUpdate(true)),item('Impostazioni…',()=>win.AcchUi.openSettings()),sep(),pre('Hide','Nascondi Acchiappaspettri'),pre('HideOthers','Nascondi gli altri'),sep(),item('Esci da Acchiappaspettri',requestQuit,'CmdOrCtrl+Q')]));
      const menu=await M.Menu.new({items}); await menu.setAsAppMenu(); win.AcchDesktop.menuBuilt=true;
    }catch(e){ console.error('menu',e); }
    menuBusy=false; if (menuAgain){ menuAgain=false; buildMenu(); }
  }
  win.addEventListener('acch-lang', buildMenu);

  /* aggiornamenti: si controlla il file pubblico latest.json dell'ultima release stabile; il pacchetto si installa solo dopo la verifica della firma */
  const SETTINGS_KEY='acch.update.auto';
  const autoOn=()=>lsG(SETTINGS_KEY)!==false;
  const canSelfUpdate=()=>info.kind!=='system-package';
  function showUpdate(version, notes, manual){ const d=$('#dlgUpdate'); $('#upCur').textContent=APP_VERSION_FULL(); $('#upNew').textContent=version; $('#upNotes').textContent=notes||''; $('#upMsg').textContent=manual?tr('Questa installazione (pacchetto di sistema) non si aggiorna da sola: installa il nuovo pacchetto dalla pagina delle versioni.'):''; $('#upBarBox').hidden=true; $('#upGo').disabled=false; $('#upGo').textContent=tr(manual?'Apri la pagina delle versioni':'Installa l\'aggiornamento'); $('#upLater').disabled=false;
    $('#upGo').onclick=manual ? ()=>{ T.opener.openUrl('https://github.com/lorebiri/acchiappaspettri/releases/latest'); d.close(); } : installUpdate;
    $('#upLater').onclick=()=>{ lsS(LATER_KEY,{v:version,t:Date.now()}); d.close(); }; if (!d.open) d.showModal(); }
  async function checkUpdate(manual){ const msg=$('#stCheckMsg'), say=t=>{ if (msg) msg.textContent=tr(t); if (manual) win.toast(tr(t)); };
    if (manual) say('Controllo in corso…');
    try{ const up=await T.updater.check({timeout:20000}); curUpdate=up||null;
      if (!up){ if (manual) say('Nessun aggiornamento disponibile: la versione installata è la più recente.'); return null; }
      if (msg) msg.textContent='';
      const later=lsG(LATER_KEY); if (!manual && later && later.v===up.version && Date.now()-later.t<24*3600*1000) return up;
      showUpdate(up.version, up.body, !canSelfUpdate()); return up;
    }catch(e){ console.warn('update check',e); win.AcchDesktop.lastError=String(e); // l'updater dà lo stesso errore per 404 (nessuna release stabile) e per 5xx/429 (GitHub non risponde): il messaggio copre i due casi
      if (manual) say(/valid release JSON|404/i.test(String(e)) ? 'Nessuna versione pubblicata trovata, oppure il sito degli aggiornamenti non è raggiungibile: riprova più tardi.' : 'Non riesco a controllare gli aggiornamenti: controlla la connessione e riprova.'); return null; } }
  async function installUpdate(){ const up=curUpdate; if (!up) return; const go=$('#upGo'), lt=$('#upLater'), box=$('#upBarBox'), bar=$('#upBar'), m=$('#upMsg');
    // prima di riavviare: l'utente salva o decide
    $('#dlgUpdate').close(); const okSave=await win.AcchProject.guard(); $('#dlgUpdate').showModal(); if (!okSave) return;
    installing=true; win.AcchProject.lock(true);   // da qui il lavoro è salvato o volutamente scartato: niente modifiche fino al riavvio
    go.disabled=true; lt.disabled=true; box.hidden=false; bar.style.width='0'; m.textContent=tr('Ricezione dell\'aggiornamento…'); let total=0, got=0;
    try{ await up.download(ev=>{ if (ev.event==='Started') total=ev.data.contentLength||0; else if (ev.event==='Progress'){ got+=ev.data.chunkLength; if (total) bar.style.width=Math.min(100,100*got/total)+'%'; } else if (ev.event==='Finished') bar.style.width='100%'; });
      m.textContent=tr('Firma verificata. Installo e riavvio…'); await flushStore(); await up.install(); closing=true; await T.process.relaunch();
    }catch(e){ console.error(e); m.textContent=tr('Aggiornamento non riuscito: il pacchetto non è stato installato e la versione attuale resta intatta. Riprova più tardi.'); go.disabled=false; lt.disabled=false; box.hidden=true; installing=false; win.AcchProject.lock(false); try{ curUpdate=await T.updater.check({timeout:20000}); }catch(_){} } }
  win.AcchDesktop={ syncSettings(){ const c=$('#stAuto'); c.checked=autoOn(); c.onchange=()=>lsS(SETTINGS_KEY,c.checked); $('#stCheck').onclick=()=>checkUpdate(true); $('#stCheckMsg').textContent=''; }, checkUpdate, get info(){ return info; }, openPath, openDialog, addSpectra };

  /* lingua al primo avvio: dall'installer di Windows se c'è, altrimenti si chiede */
  async function firstRunLanguage(){ if (win.AcchI18n.isChosen) return; const fromInstaller=await inv('installer_language').catch(()=>null);
    if (fromInstaller){ win.AcchUi.setLang(fromInstaller); return; }
    const welcome=$('#dlgWelcome'); if (welcome && welcome.open) welcome.close();
    const l=await win.AcchUi.choice('Scegli la lingua · Choose your language', [['en','English','ghost'],['it','Italiano','primary']]); win.AcchUi.setLang(l); }

  $('#dlgUpdate').addEventListener('cancel', e=>{ if (installing) e.preventDefault(); });
  win.ACCH_LANG_PENDING=!win.AcchI18n.isChosen;
  async function boot(){
    info=await inv('install_info');
    await buildMenu();
    if (!info.e2e) await firstRunLanguage();
    win.ACCH_LANG_PENDING=false;
    win.AcchProject.onChange(()=>{}); title({name:win.AcchProject.displayName(), dirty:false});
    await drainPending();
    if (info.e2e){ if (win.AcchE2E) win.AcchE2E(info); return; }
    if (autoOn()){ setTimeout(()=>checkUpdate(false), 8000); setInterval(()=>{ if (autoOn() && !$('#dlgUpdate').open) checkUpdate(false); }, CHECK_EVERY); }
  }
  boot().catch(e=>console.error(e));
})(window);
