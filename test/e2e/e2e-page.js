/* Collaudo dentro l'app vera (solo con la feature «e2e», mai negli installer pubblicati): usa i veri comandi nativi per scrivere e leggere i file */
window.AcchE2E=async function(info){
  const T=window.__TAURI__, inv=T.core.invoke, res={os:info.os, kind:info.kind, version:APP_VERSION_FULL(), checks:{}}; let ok=true;
  const pageErrors=[]; window.addEventListener('error',e=>pageErrors.push(String(e.message))); window.addEventListener('unhandledrejection',e=>pageErrors.push(String(e.reason)));
  const check=(n,v,d)=>{ res.checks[n]=v?'ok':('FALLITO '+(d||'')); if (!v) ok=false; };
  try{
    const cfg=await inv('e2e_config'), sep=info.os==='windows'?'\\':'/', dir=cfg.dir, sleep=ms=>new Promise(r=>setTimeout(r,ms));
    window.ACCH_TEST=true;
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
      check('librerie locali', !!window.jspdf && !!window.JSZip);
      check('menu nativo costruito', AcchDesktop.menuBuilt===true);
      // spettri: XRF sintetico
      let txt='# Tube Anode: Rh\n# Tube Voltage: 40\n# Incident beam angle: 68\n# Fluorescence beam: 63,5\n# Calibration1: 0 0\n# Calibration2: 2047 40,94\n#\n'; for (let i=0;i<2048;i++){ const E=i*0.02; txt+=Math.round(20+5000*Math.exp(-0.5*((E-8.04)/0.07)**2)+700*Math.exp(-0.5*((E-8.9)/0.07)**2))+'\n'; }
      await addEntries([{file:new File([txt],'e2e.mca'),path:'e2e.mca'}]); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
      check('importazione', files.length===1 && files[0].instr==='xrf', files.length+'');
      files[0].title='Prova è'; persist(files[0]); await sleep(50);
      check('modifiche non salvate', AcchProject.isDirty());
      // salvataggio vero su disco, con il comando nativo
      const path=dir+sep+'prova e2e è.acchspettri'; await inv('e2e_grant',{path});
      const host=AcchProject.host, oldAs=host.saveAs; host.saveAs=async b=>{ await inv('write_file', b, {headers:{'x-acch-path':encodeURIComponent(path)}}); return {path, name:'prova e2e è.acchspettri'}; };
      check('salva', await AcchProject.saveAs()); host.saveAs=oldAs; check('nessuna modifica dopo il salvataggio', !AcchProject.isDirty());
      files[0].title='Prova 2'; persist(files[0]); check('salva di nuovo sullo stesso file', await AcchProject.save());
      await AcchProject.closeProject(); check('chiudi', files.length===0);
      check('riapri dal disco', await AcchDesktop.openPath(path,'prova e2e è.acchspettri')); check('stato ritrovato', files[0] && files[0].title==='Prova 2' && files[0].instr==='xrf', files[0]&&files[0].title);
      const denied=await inv('read_file',{path:info.os==='windows'?'C:\\Windows\\win.ini':'/etc/hosts'}).then(()=>false,()=>true); check('accesso negato ai file non scelti', denied);
      const denied2=await inv('write_file', new Uint8Array([1]), {headers:{'x-acch-path':encodeURIComponent(dir+sep+'altro.txt')}}).then(()=>false,()=>true); check('scrittura negata ai percorsi non scelti', denied2);
      // calcolo: PDF e FP
      const R=fpRun(files[0]); check('calcolo FP', R && R.Q && R.Q.res && R.Q.res.Cu && R.Q.res.Cu.w>50, JSON.stringify(R&&R.Q&&R.Q.res));
      const doc=await buildPdf().catch(e=>{ throw new Error('pdf '+e); }); check('PDF', !!doc);
      // chiusura con modifiche non salvate: si chiede, e «Annulla» lascia tutto com'è
      files[0].title='Non salvato'; persist(files[0]); await T.window.getCurrentWindow().close(); await sleep(400); check('chiusura: domanda se salvare', document.querySelector('#dlgConfirm').open); const cancel=[...document.querySelectorAll('#cfBtns button')].find(b=>/Annulla/.test(b.textContent)); cancel&&cancel.click(); await sleep(200); check('chiusura annullata: lavoro intatto', files[0].title==='Non salvato');
      files[0].title='Prova 2'; persist(files[0]); await AcchProject.save();
      // collegamento a un file appena prodotto (blob): passa dal salvataggio nativo
      { const orig=window.download; let got=null; window.download=(b,n)=>{ got=n; }; setReady([{name:'prova.txt',blob:new Blob(['x'])}]); document.querySelector('#readyList a').click(); await sleep(500); window.download=orig; check('file pronti: salvataggio dal collegamento (CSP blob)', got==='prova.txt', String(got)); setReady([]); }
      // barra degli strumenti e comandi principali
      for (const id of ['tbExport','tbZoom','tbCmd']){ document.querySelector('#'+id).click(); await sleep(100); document.querySelectorAll('dialog[open]').forEach(d=>d.close()); } go(2);
      AcchUi.openSettings(); await sleep(50); check('impostazioni: sezione aggiornamenti', !document.querySelector('#stDesktop').hidden); document.querySelector('#dlgSettings').close();
      await AcchDesktop.checkUpdate(true); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
      // lingua e menu
      AcchUi.setLang('en'); await sleep(300); check('inglese', /Settings/.test(document.querySelector('#settingsBtn').textContent)); AcchUi.setLang('it'); await sleep(300); check('italiano', /Impostazioni/.test(document.querySelector('#settingsBtn').textContent));
      check('barra degli strumenti', !!document.querySelector('#tbSave'));
      const cs=getComputedStyle(document.querySelector('.btn')); check('fogli di stile applicati (CSP)', parseInt(cs.borderRadius)>=8, cs.borderRadius); check('carattere locale caricato', await document.fonts.load('16px Nunito').then(l=>l.length>0));
      const st=document.createElement('div'); st.innerHTML='<span id="cspS" style="color:rgb(1,2,3)"></span>'; document.body.appendChild(st); check('stili in linea permessi', getComputedStyle(document.querySelector('#cspS')).color==='rgb(1, 2, 3)'); st.remove();
      window.__xss=0; const im=document.createElement('div'); im.innerHTML='<img src=x onerror="window.__xss=1">'; document.body.appendChild(im); await sleep(300); check('gestori inline bloccati (CSP)', window.__xss===0); im.remove();
      const conn=await fetch('https://example.com/').then(()=>true,()=>false); check('nessuna connessione libera (CSP)', !conn);
    }
    if (pageErrors.length) check('nessun errore nella pagina', false, pageErrors.slice(0,5).join(' | '));
  }catch(e){ res.exception=String(e&&e.stack||e); ok=false; }
  await inv('e2e_finish',{report:JSON.stringify(res,null,1), ok});
};
