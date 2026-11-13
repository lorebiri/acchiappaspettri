// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Collaudo dentro l'app vera (solo con la feature «e2e», mai negli installer pubblicati): usa i veri comandi nativi per scrivere e leggere i file */
/* I3: la finestra «Canali trovati» può aprirsi già all'avvio, se il sistema ha passato file grezzi (scenario «apri-grezzi»): si registra e si conferma */
window.ACCH_E2E_CANALI=[];
setInterval(()=>{ const d=document.getElementById('dlgChan'); if (d && d.open){ window.ACCH_E2E_CANALI.push({rows:[...d.querySelectorAll('tbody th.chrow label')].map(l=>l.textContent.trim()), cols:[...d.querySelectorAll('thead th label')].map(l=>l.textContent.trim()), text:d.innerText}); document.getElementById('chOk').click(); } }, 100);
window.AcchE2E=async function(info){
  const T=window.__TAURI__, inv=T.core.invoke, res={os:info.os, kind:info.kind, version:APP_VERSION_FULL(), checks:{}}; let ok=true;
  const pageErrors=[]; window.addEventListener('error',e=>pageErrors.push(String(e.message))); window.addEventListener('unhandledrejection',e=>pageErrors.push(String(e.reason)));
  const check=(n,v,d)=>{ res.checks[n]=v?'ok':('FALLITO '+(d||'')); if (!v) ok=false; };
  try{
    const cfg=await inv('e2e_config'), sep=info.os==='windows'?'\\':'/', dir=cfg.dir, sleep=ms=>new Promise(r=>setTimeout(r,ms)), until=async(f,ms=5000)=>{ for (let t=0;t<ms;t+=50){ try{ if (f()) return true; }catch(e){} await sleep(50); } return !!f(); };
    window.ACCH_TEST=true;
    // I3: doppio clic e «Apri con» sui file grezzi: run-e2e.js passa i file sulla riga di comando, come fanno Windows e Linux (macOS, doppio clic dal Finder: RunEvent::Opened, prova a mano nel collaudo I3)
    if (cfg.scenario==='apri-grezzi'){ await until(()=>files.length>=6, 20000);
      const L=files.map(f=>(f.path+' '+(f.channel||'')).trim()); res.files=L; res.dialogs=window.ACCH_E2E_CANALI.map(d=>({rows:d.rows, cols:d.cols}));
      check('file grezzi aperti dal sistema: tutti i canali', files.length===6, L.join(' | '));
      check('cartella .D: i due segnali dello stesso campione sulla stessa riga', res.dialogs.length===1 && JSON.stringify(res.dialogs[0].rows)===JSON.stringify(['STD1','MIX1','MIX1']), JSON.stringify(res.dialogs));
      check('canali Agilent riconosciuti', L.includes('STD1.D/DAD1A.ch DAD1A 254/4 nm ref 360/100 nm') && L.includes('STD1.D/DAD1B.ch DAD1B 280/4 nm ref 360/100 nm'));
      check('finestra dei canali sobria', res.dialogs.length===1 && !/Gino|!|[\u{1F300}-\u{1FAFF}]/u.test(window.ACCH_E2E_CANALI[0].text));
      const path=dir+sep+'grezzi.acchspettri'; await inv('e2e_grant',{path}); const host=AcchProject.host, oldPick=host.pickSave; host.pickSave=async ()=>({path, name:'grezzi.acchspettri'});
      check('salva i canali nel progetto', await AcchProject.saveAs()); host.pickSave=oldPick; await AcchProject.closeProject();
      check('riapre: stessi canali, senza finestra', await AcchDesktop.openPath(path,'grezzi.acchspettri') && files.length===6 && window.ACCH_E2E_CANALI.length===1, files.length+' spettri, '+window.ACCH_E2E_CANALI.length+' finestre');
    }
    if (cfg.scenario==='version'){ res.reported=APP_VERSION_FULL(); check('versione',true); }
    if (cfg.scenario==='update-bad' || cfg.scenario==='update-good' || cfg.scenario==='update-none'){
      try{ const r=await inv('e2e_check_update',{url:cfg.updateUrl, install:cfg.scenario==='update-good'}); res.update=r;
        if (cfg.scenario==='update-none') check('nessun aggiornamento se non c\'è una versione più nuova', r.available===false, JSON.stringify(r));
        if (cfg.scenario==='update-bad') check('firma non valida: deve fallire', false, JSON.stringify(r));
        if (cfg.scenario==='update-good') check('aggiornamento scaricato, firma verificata, installato', r.available&&r.verified&&r.installed, JSON.stringify(r)); }
      catch(e){ res.updateError=String(e); check('firma non valida rifiutata', cfg.scenario==='update-bad', String(e)); }
    }
    if (cfg.scenario==='update-ui'){
      res.version=APP_VERSION_FULL();
      const was=localStorage.getItem('e2e.phase'); if (was && was!==APP_VERSION_FULL()){ localStorage.removeItem('e2e.phase'); res.afterRelaunch=true; check('riavviata dopo l\'aggiornamento', true); await inv('e2e_finish',{report:JSON.stringify(res,null,1), ok}); return; }
      localStorage.setItem('e2e.phase',APP_VERSION_FULL()); await AcchDesktop.checkUpdate(true); check('finestra di aggiornamento', document.querySelector('#dlgUpdate').open); res.lastError=AcchDesktop.lastError||null;
      res.shown={cur:document.querySelector('#upCur').textContent, next:document.querySelector('#upNew').textContent, notes:document.querySelector('#upNotes').textContent};
      document.querySelector('#upGo').click(); await sleep(60000); check('riavvio mai avvenuto', false, document.querySelector('#upMsg').textContent);
    }
    if (!cfg.scenario || cfg.scenario==='full'){
      for (const [n,f] of [['updater.check',T.updater&&T.updater.check],['process.relaunch',T.process&&T.process.relaunch],['opener.openUrl',T.opener&&T.opener.openUrl],['menu.Menu',T.menu&&T.menu.Menu]]) check('API '+n, typeof f==='function');
      await T.window.getCurrentWindow().setTitle('Prova').then(()=>check('titolo finestra',true),e=>check('titolo finestra',false,String(e)));
      const up=await T.updater.check({timeout:15000}).then(r=>'ok',e=>String(e)); check('permesso di controllare gli aggiornamenti', !/not allowed|permission/i.test(up), up); res.updateCheck=up;
      check('jsPDF non caricato all\'avvio', !window.jspdf); await ensurePdfLib().catch(e=>{}); check('librerie locali', !!window.jspdf && !!window.JSZip);
      check('menu nativo costruito', AcchDesktop.menuBuilt===true);
      // spettri: XRF sintetico
      let txt='# Tube Anode: Rh\n# Tube Voltage: 40\n# Incident beam angle: 68\n# Fluorescence beam: 63,5\n# Calibration1: 0 0\n# Calibration2: 2047 40,94\n#\n'; for (let i=0;i<2048;i++){ const E=i*0.02; txt+=Math.round(20+5000*Math.exp(-0.5*((E-8.04)/0.07)**2)+700*Math.exp(-0.5*((E-8.9)/0.07)**2))+'\n'; }
      await addEntries([{file:new File([txt],'e2e.mca'),path:'e2e.mca'}]); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
      check('importazione', files.length===1 && files[0].instr==='xrf', files.length+'');
      files[0].title='Prova è'; persist(files[0]); await sleep(50);
      check('modifiche non salvate', AcchProject.isDirty());
      // salvataggio vero su disco, con il comando nativo
      const path=dir+sep+'prova e2e è.acchspettri'; await inv('e2e_grant',{path});
      const host=AcchProject.host, oldPick=host.pickSave; host.pickSave=async ()=>({path, name:'prova e2e è.acchspettri'});   // il dialogo nativo non si può guidare: il percorso è già concesso
      check('salva', await AcchProject.saveAs()); host.pickSave=oldPick; check('nessuna modifica dopo il salvataggio', !AcchProject.isDirty());
      files[0].title='Prova 2'; persist(files[0]); check('salva di nuovo sullo stesso file', await AcchProject.save());
      await AcchProject.closeProject(); check('chiudi', files.length===0);
      check('riapri dal disco', await AcchDesktop.openPath(path,'prova e2e è.acchspettri')); check('stato ritrovato', files[0] && files[0].title==='Prova 2' && files[0].instr==='xrf', files[0]&&files[0].title);
      const denied=await inv('read_file',{path:info.os==='windows'?'C:\\Windows\\win.ini':'/etc/hosts'}).then(()=>false,()=>true); check('accesso negato ai file non scelti', denied);
      const denied2=await inv('write_file', new Uint8Array([1]), {headers:{'x-acch-path':encodeURIComponent(dir+sep+'altro.txt')}}).then(()=>false,()=>true); check('scrittura negata ai percorsi non scelti', denied2);
      // calcolo: PDF e FP
      const R=fpRun(files[0]); check('calcolo FP', R && R.Q && R.Q.res && R.Q.res.Cu && R.Q.res.Cu.w>50, JSON.stringify(R&&R.Q&&R.Q.res));
      const doc=await buildPdf().catch(e=>{ throw new Error('pdf '+e); }); check('PDF', !!doc);
      // chiusura con modifiche non salvate: si chiede, e «Annulla» lascia tutto com'è
      files[0].title='Non salvato'; persist(files[0]); await T.window.getCurrentWindow().close(); check('chiusura: domanda se salvare', await until(()=>document.querySelector('#dlgConfirm').open)); const cancel=[...document.querySelectorAll('#cfBtns button')].find(b=>/Annulla/.test(b.textContent)); cancel&&cancel.click(); await sleep(200); check('chiusura annullata: lavoro intatto', files[0].title==='Non salvato');
      files[0].title='Prova 2'; persist(files[0]); await AcchProject.save();
      // collegamento a un file appena prodotto (blob): passa dal salvataggio nativo
      { const orig=window.download; let got=null; window.download=(b,n)=>{ got=n; }; setReady([{name:'prova.txt',blob:new Blob(['x'])}]); document.querySelector('#readyList a').click(); await sleep(500); window.download=orig; check('file pronti: salvataggio dal collegamento (CSP blob)', got==='prova.txt', String(got)); setReady([]); }
      // barra degli strumenti e comandi principali
      for (const id of ['tbExport','tbZfit','cmdBtn','tbLeft','tbLeft','tbFocus','tbFocus']){ document.querySelector('#'+id).click(); await sleep(100); document.querySelectorAll('dialog[open]').forEach(d=>d.close()); } go(2);
      AcchUi.openSettings(); await sleep(50); check('impostazioni: sezione aggiornamenti', !document.querySelector('#stDesktop').hidden); document.querySelector('#dlgSettings').close();
      await AcchDesktop.checkUpdate(true); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
      // lingua e menu
      AcchUi.setLang('en'); check('inglese', await until(()=>/Settings/.test(document.querySelector('#settingsBtn').textContent))); AcchUi.setLang('it'); check('italiano', await until(()=>/Impostazioni/.test(document.querySelector('#settingsBtn').textContent)));
      check('barra degli strumenti', !!document.querySelector('#tbSave'));
      const cs=getComputedStyle(document.querySelector('.btn')); check('fogli di stile applicati (CSP)', getComputedStyle(document.querySelector('#shTool')).position==='fixed', cs.borderRadius); check('spazio di lavoro desktop attivo', document.documentElement.classList.contains('shell') && document.querySelector('#pv').clientWidth>500, String(document.querySelector('#pv').clientWidth)); check('carattere locale caricato', await document.fonts.load('16px Nunito').then(l=>l.length>0));
      const st=document.createElement('div'); st.innerHTML='<span id="cspS" style="color:rgb(1,2,3)"></span>'; document.body.appendChild(st); check('stili in linea permessi', getComputedStyle(document.querySelector('#cspS')).color==='rgb(1, 2, 3)'); st.remove();
      window.__xss=0; const im=document.createElement('div'); im.innerHTML='<img src=x onerror="window.__xss=1">'; document.body.appendChild(im); await sleep(300); check('gestori inline bloccati (CSP)', window.__xss===0); im.remove();
      const conn=await fetch('https://example.com/').then(()=>true,()=>false); check('nessuna connessione libera (CSP)', !conn);
    }
    if (pageErrors.length) check('nessun errore nella pagina', false, pageErrors.slice(0,5).join(' | '));
  }catch(e){ res.exception=String(e&&e.stack||e); ok=false; }
  await inv('e2e_finish',{report:JSON.stringify(res,null,1), ok});
};
