// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Ponte con l'app desktop (Tauri): menu, file nativi, progetto, chiusura sicura, aggiornamenti firmati.
   Nella pagina online window.__TAURI__ non c'è e questo file non fa nulla. */
(function(win){
  'use strict';
  const T=win.__TAURI__; if (!T) return;
  const inv=T.core.invoke, tr=s=>win.AcchI18n.lang==='en' ? win.AcchI18n.tr(s) : s, $=s=>document.querySelector(s);
  const lsG=k=>{ try{ return JSON.parse(localStorage.getItem(k)); }catch(e){ return null; } }, lsS=(k,v)=>{ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} };
  const CHECK_EVERY=6*3600*1000, LATER_KEY='acch.update.later', RECENT='acch.recent';
  const PAGE='https://lorebiri.github.io/acchiappaspettri/';
  let info={os:'',kind:'',e2e:false}, curUpdate=null, closing=false, installing=false;

  async function writeTo(path, bytes){ await inv('write_file', bytes, {headers:{'x-acch-path':encodeURIComponent(path)}}); }
  async function readFrom(path){ const b=await inv('read_file',{path}); return new Uint8Array(b); }
  const errMsg=e=>{ const s=String(e||''); if (/not-allowed/.test(s)) return 'Non ho il permesso di usare questo percorso.'; if (/PermissionDenied/.test(s)) return 'Non ho il permesso di scrivere in questa cartella. Scegline un\'altra.'; if (/NotFound/.test(s)) return 'Il file non esiste più.'; if (/StorageFull|QuotaExceeded/.test(s)) return 'Il disco è pieno.'; return 'Non sono riuscito a leggere o scrivere il file.'; };

  /* salvataggi: finestra del sistema al posto del download del browser (che nelle webview non funziona) */
  win.download=async function(blob, name){
    try{ const ext=(/\.([\w]{1,10})$/.exec(name)||[])[1], p=await inv('pick_save',{title:tr('Salva file'), suggested:name, filterName:ext?ext.toUpperCase():null, extensions:ext?[ext]:null}); if (!p) return;
      await writeTo(p.path, new Uint8Array(await blob.arrayBuffer())); win.toast('💾 Salvato: '+p.name); }
    catch(e){ console.error(e); win.toast('😕 '+tr(errMsg(e))); } };
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
    async saveAs(bytes, suggested){ const p=await inv('pick_save',{title:tr('Salva progetto con nome'), suggested, filterName:tr('Progetto di Acchiappaspettri'), extensions:['acchspettri']}); if (!p) return null; await writeTo(p.path, bytes); return {path:p.path, name:p.name}; },
    async overwrite(bytes, path){ await writeTo(path, bytes); return {path, name:path.split(/[\\/]/).pop()}; },
    ask(message){ return win.AcchUi.choice(message, [['cancel','Annulla','ghost'],['discard','Non salvare','ghost'],['save','Salva','primary']]); },
    remember
  });
  win.AcchProject.onError=(m,e)=>{ if (!m && e) win.toast('😕 '+tr(errMsg(e))); };
  async function openPath(path, name){ try{ const bytes=await readFrom(path); return await win.AcchProject.openBytes(bytes, name||path.split(/[\\/]/).pop(), path); }catch(e){ console.error(e); win.toast('😕 '+tr(errMsg(e))); const L=(lsG(RECENT)||[]).filter(x=>x.path!==path); lsS(RECENT,L); buildMenu(); return false; } }
  async function addSpectra(){ const L=await inv('pick_many',{title:tr('Aggiungi spettri')}); if (!L || !L.length) return; const ents=[]; for (const p of L){ try{ const b=await readFrom(p.path); ents.push({file:new File([b],p.name),path:p.name}); }catch(e){ console.error(e); win.toast('😕 '+tr(errMsg(e))); } } if (ents.length) await win.addEntries(ents); }
  async function openDialog(){ const p=await inv('pick_open',{title:tr('Apri progetto'), filterName:tr('Progetto di Acchiappaspettri'), extensions:['acchspettri','json']}); if (p) await openPath(p.path, p.name); }
  let draining=Promise.resolve();   // i file aperti dal sistema si aprono uno alla volta
  function drainPending(){ draining=draining.then(async ()=>{ while (win.AcchProject.busy) await new Promise(r=>setTimeout(r,200)); const L=await inv('take_pending_open'); for (const p of L) await openPath(p.path, p.name); }).catch(e=>console.error(e)); return draining; }
  T.event.listen('acch-open-files', drainPending);

  /* chiusura: mai perdere il lavoro senza chiedere */
  async function requestQuit(){ if (closing) return; if (!await win.AcchProject.guard()) return; closing=true; await T.window.getCurrentWindow().destroy(); }
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
      const ana=await sub('Analisi',[item('Picchi',insp('peaks')),item('Elaborazione (linea di base, smoothing, derivate)',insp('proc')),item('Dati dello spettro e strumento',insp('zone')),item('Riferimenti e miscele',insp('refs')),sep(),item('Deconvoluzione e parametri',insp('an')),item('Controllo del dato',res('qual')),item('Ipotesi',res('hyp')),sep(),item('Confronta gli spettri',()=>{ if (files.length) win.setView('cmp'); }),item('Taratura, PLS, PCA, composizione',()=>{ if (files.length) win.openTab('multi'); }),item('Composizione XRF e spessori',()=>{ if (files.length){ Sh.showDoc('graph'); win.openTab('an'); const d=$('#secCult'); if (d){ d.open=true; d.scrollIntoView&&d.scrollIntoView({block:'start'}); } } }),item('Parametri per tecnica',res('tech')),item('Preimpostazioni',()=>{ if (files.length) win.go(3); }),item('Falso colore da foto',()=>$('#imgBtn').click())]);
      const help=await sub('Aiuto',[item('Giro guidato',()=>win.startTour&&win.startTour()),item('A cosa serve Acchiappaspettri',()=>$('#aboutBtn').click()),item('Scorciatoie da tastiera',()=>win.showKeys&&win.showKeys()),item('Novità di questa versione',()=>win.showNews&&win.showNews()),sep(),item('Controlla aggiornamenti…',()=>checkUpdate(true)),item('Documentazione',()=>T.opener.openUrl('https://github.com/lorebiri/acchiappaspettri#readme').catch(e=>console.warn(e))),sep(),item('Informazioni',()=>win.AcchUi.openSettings())]);
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
  function compare(a,b){ const p=s=>String(s).split('-')[0].split('.').map(Number); const A=p(a),B=p(b); for (let i=0;i<3;i++){ if ((A[i]||0)!==(B[i]||0)) return (A[i]||0)-(B[i]||0); } return 0; }
  function showUpdate(version, notes, manual){ const d=$('#dlgUpdate'); $('#upCur').textContent=APP_VERSION_FULL(); $('#upNew').textContent=version; $('#upNotes').textContent=notes||''; $('#upMsg').textContent=manual?tr('Questa installazione (pacchetto di sistema) non si aggiorna da sola: scarica il nuovo pacchetto dalla pagina ufficiale.'):''; $('#upBarBox').hidden=true; $('#upGo').disabled=false; $('#upGo').textContent=tr(manual?'Apri la pagina di download':'Scarica e aggiorna'); $('#upLater').disabled=false;
    $('#upGo').onclick=manual ? ()=>{ T.opener.openUrl('https://github.com/lorebiri/acchiappaspettri/releases/latest'); d.close(); } : installUpdate;
    $('#upLater').onclick=()=>{ lsS(LATER_KEY,{v:version,t:Date.now()}); d.close(); }; if (!d.open) d.showModal(); }
  async function checkUpdate(manual){ const msg=$('#stCheckMsg'), say=t=>{ if (msg) msg.textContent=tr(t); if (manual) win.toast(tr(t)); };
    if (manual) say('Controllo in corso…');
    try{ const up=await T.updater.check({timeout:20000}); curUpdate=up||null;
      if (!up){ if (manual) say('Hai già l\'ultima versione.'); return null; }
      if (msg) msg.textContent='';
      const later=lsG(LATER_KEY); if (!manual && later && later.v===up.version && Date.now()-later.t<24*3600*1000) return up;
      showUpdate(up.version, up.body, !canSelfUpdate()); return up;
    }catch(e){ console.warn('update check',e); win.AcchDesktop.lastError=String(e); if (manual) say(/valid release JSON|404/i.test(String(e)) ? 'Non c\'è ancora nessuna versione pubblicata da scaricare.' : 'Non riesco a controllare gli aggiornamenti: controlla la connessione e riprova.'); return null; } }
  async function installUpdate(){ const up=curUpdate; if (!up) return; const go=$('#upGo'), lt=$('#upLater'), box=$('#upBarBox'), bar=$('#upBar'), m=$('#upMsg');
    // prima di riavviare: l'utente salva o decide
    $('#dlgUpdate').close(); const okSave=await win.AcchProject.guard(); $('#dlgUpdate').showModal(); if (!okSave) return;
    installing=true; win.AcchProject.lock(true);   // da qui il lavoro è salvato o volutamente scartato: niente modifiche fino al riavvio
    go.disabled=true; lt.disabled=true; box.hidden=false; bar.style.width='0'; m.textContent=tr('Scarico l\'aggiornamento…'); let total=0, got=0;
    try{ await up.download(ev=>{ if (ev.event==='Started') total=ev.data.contentLength||0; else if (ev.event==='Progress'){ got+=ev.data.chunkLength; if (total) bar.style.width=Math.min(100,100*got/total)+'%'; } else if (ev.event==='Finished') bar.style.width='100%'; });
      m.textContent=tr('Firma verificata. Installo e riavvio…'); await up.install(); closing=true; await T.process.relaunch();
    }catch(e){ console.error(e); m.textContent=tr('Aggiornamento non riuscito: il pacchetto non è stato installato e la versione attuale resta intatta. Riprova più tardi.'); go.disabled=false; lt.disabled=false; box.hidden=true; installing=false; win.AcchProject.lock(false); try{ curUpdate=await T.updater.check({timeout:20000}); }catch(_){} } }
  win.AcchDesktop={ syncSettings(){ const c=$('#stAuto'); c.checked=autoOn(); c.onchange=()=>lsS(SETTINGS_KEY,c.checked); $('#stCheck').onclick=()=>checkUpdate(true); $('#stCheckMsg').textContent=''; }, checkUpdate, compare, get info(){ return info; }, openPath, openDialog };

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
