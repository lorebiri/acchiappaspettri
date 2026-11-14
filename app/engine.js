// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* AcchEngine (desktop, tappa I5): chi legge i file.
   - Il lettore di riferimento è il JS (AcchRead, app/read-core.js) e gira in un Web Worker (core-worker.js), così la finestra non si blocca.
   - Se il lettore Rust è attivo (src-tauri/acch-core, comando acch_read) legge lui la parte lunga; il worker trasforma la risposta
     nello stesso risultato del JS (AcchRead.fromWire) e, se qualcosa non torna, rilegge con il JS. Se il Rust dà errore si torna al JS
     con un avviso nel registro di «Segnala un problema». Nessuna funzione esiste solo in Rust.
   - ACCH_DUAL=1 (variabile d'ambiente dell'app): ogni file si legge con i due motori e si confrontano numeri e picchi.
   Nella pagina online window.__TAURI__ non c'è e questo file non fa nulla: lì AcchRead.read gira come prima. */
(function(win){
  'use strict';
  const T=win.__TAURI__; if (!T) return;
  const inv=T.core.invoke, tr=s=>win.AcchI18n && win.AcchI18n.lang==='en' ? win.AcchI18n.tr(s) : s;
  // .uv (spettri DAD): il risultato sono decine di milioni di numeri; il JS nel worker li costruisce dove servono, il Rust dovrebbe
  // mandarli attraverso l'IPC e risulta più lento (misure I5: 50 MB, 0,6 s in JS contro 2,2 s). Il lettore Rust del .uv resta nei test incrociati.
  const JS_FASTER=/\.uv$/i;
  let cfg=null, worker=null, wid=0, job=0, stopBatch=false, current=null;
  const pending=new Map(), stats={rust:0, js:0, fallback:0, rustErrors:0, dualSame:0, dualDiff:0, worker:0, main:0, last:null};
  function warn(msg){ console.warn('[motore] '+msg); }   // console.warn entra nel registro di «Segnala un problema» (app/segnala-core.js)
  async function config(){ if (cfg) return cfg;
    try{ const c=await inv('engine_config'); cfg={rust:!!(c && c.rust), dual:!!(c && c.dual)}; }catch(e){ cfg={rust:false, dual:false}; }   // app senza il comando (o anteprima nel browser): solo il worker JS
    return cfg; }
  function startWorker(){ if (worker) return worker;
    try{ worker=new Worker('core-worker.js'); }catch(e){ warn('worker non avviato: '+e); worker=null; return null; }
    worker.onmessage=e=>{ const m=e.data, p=pending.get(m.id); if (!p) return; pending.delete(m.id); if (m.ok) p.res(m); else p.rej(new Error(m.err)); };
    worker.onerror=e=>{ warn('worker: '+(e.message||'errore')); kill(new Error('worker')); };
    return worker; }
  function kill(err){ if (worker){ try{ worker.terminate(); }catch(e){} worker=null; } for (const [,p] of pending) p.rej(err); pending.clear(); }
  function call(msg, transfer){ const w=startWorker(); if (!w) return Promise.reject(new Error('worker non disponibile'));
    return new Promise((res,rej)=>{ const id=++wid; pending.set(id,{res,rej}); w.postMessage(Object.assign({id}, msg), transfer||[]); }); }

  // lettore Rust: i byte dal percorso concesso (nessuna copia dalla pagina) o, se il file non ha percorso, nel corpo della richiesta
  async function rust(buf, name, opt, file){ const id=++job; current={id, rust:true};
    const headers={'x-acch-name':encodeURIComponent(name), 'x-acch-job':String(id), 'x-acch-legacy':opt.legacy?'1':'0'};
    if (T.core.Channel && opt.onProgress){ try{ const ch=new T.core.Channel(); ch.onmessage=m=>{ if (m && m.total) opt.onProgress(Math.min(1, m.done/m.total)); }; await inv('acch_watch', {job:id, onEvent:ch}); }catch(e){} }
    let body=new Uint8Array(buf);
    if (file && file.acchPath){ headers['x-acch-path']=encodeURIComponent(file.acchPath); body=new Uint8Array(0); }
    const b=await inv('acch_read', body, {headers});
    return b instanceof ArrayBuffer ? b : new Uint8Array(b).buffer; }

  const AcchEngine={
    stats, config,
    // inizio e fine di un lotto di addEntries: «Annulla la lettura» vale per tutti i file rimasti
    begin(){ stopBatch=false; },
    end(){ stopBatch=false; showCancel(false); },
    async cancel(){ stopBatch=true; const c=current; if (c && c.rust) try{ await inv('acch_cancel', {job:c.id}); }catch(e){} kill(new Error('cancelled')); },
    /* stesso risultato di AcchRead.read(buf, name, opt); opt.onProgress(q) facoltativo; file.acchPath se il file ha un percorso concesso */
    async read(buf, name, opt, file){ opt=Object.assign({}, opt||{}); const onProgress=opt.onProgress; delete opt.onProgress;
      if (stopBatch) return {kind:'cancelled'};
      const c=await config(); let wire=null; const t0=performance.now();
      const shown=setTimeout(()=>showCancel(true), 800);
      try{
        let tR=0, tW=0; if (c.rust && !JS_FASTER.test(name)){ try{ const q=performance.now(); wire=await rust(buf, name, Object.assign({onProgress}, opt), file); tR=performance.now()-q; }
          catch(e){ if (stopBatch || /cancelled/.test(String(e))) return {kind:'cancelled'}; stats.rustErrors++; warn('lettore Rust non riuscito su un file ('+String(e).slice(0,120)+'): uso il lettore JS di riferimento'); } }
        let m;
        // copia dei byte per il worker (la pagina tiene i suoi per il progetto); la risposta del Rust si trasferisce
        try{ const q=performance.now(); m=await call({op:'read', buf, name, opt, wire, dual:c.dual}, wire ? [wire] : []); tW=performance.now()-q; stats.worker++; }
        catch(e){ if (stopBatch || /cancelled/.test(String(e))) return {kind:'cancelled'}; warn('lettura nel worker non riuscita ('+String(e).slice(0,120)+'): leggo nella pagina'); stats.main++; return win.AcchRead.read(buf, name, opt); }
        if (m.fnv!=null && buf && typeof buf==='object') try{ QH_MEMO.set(buf, (m.fnv>>>0).toString(16)); }catch(e){}   // impronta per quickHash, già calcolata nel worker
        if (m.engine==='rust') stats.rust++; else stats.js++;
        win.ACCH_ENGINE_LAST=m.dual||null;
        if (wire && m.engine!=='rust' && m.why && !/^(text|binary|decline|channels|ycol)$/.test(m.why)){ stats.fallback++; warn('risposta del lettore Rust non usata ('+m.why+'): letto con il JS'); }
        if (m.dual){ if (m.dual==='identici') stats.dualSame++; else { stats.dualDiff++; warn('ACCH_DUAL: i due motori danno risultati diversi ('+m.dual.slice(0,200)+'): uso il JS'); } }
        stats.last={name, engine:m.engine, why:m.why||null, ms:Math.round(performance.now()-t0), rustMs:Math.round(tR), workerMs:Math.round(tW)};
        return m.r;
      } finally { clearTimeout(shown); current=null; }
    },
    // una funzione del nucleo nel worker (per le tappe successive: fit, XRF FP), con gli stessi argomenti e lo stesso risultato
    call(fn, ...args){ return call({op:'call', fn, args}).then(m=>m.r); }
  };
  // «Annulla la lettura» nel riquadro di avanzamento, solo quando una lettura dura
  function showCancel(on){ const L=document.getElementById('loader'); if (!L) return; let b=document.getElementById('ldCancel');
    if (!on){ if (b) b.hidden=true; return; }
    if (!b){ b=document.createElement('button'); b.id='ldCancel'; b.type='button'; b.className='btn small ghost'; b.addEventListener('click', ()=>AcchEngine.cancel()); L.appendChild(b); }
    b.textContent=tr('Annulla la lettura'); b.hidden=false; }
  /* ---------- calcoli pesanti del nucleo nel worker (I5, decisione del Capo Progetto) ----------
     Le funzioni del nucleo che con gli spettri grandi costano centinaia di ms (HEAVY) si eseguono nel worker: stessa funzione, stessi
     argomenti (copiati bit per bit), stesso risultato. Il codice della pagina che le usa (assess, viewOf…) resta sincrono e invariato:
     prefetch(run) lo esegue «in prova»; ogni chiamata pesante non ancora pronta viene annotata e interrompe la prova, il worker la calcola,
     e si riprova finché tutte le chiamate trovano il risultato pronto. Così la pagina lavora a pezzi brevi, mai per secondi interi.
     Fuori da prefetch le funzioni si comportano come sempre. */
  // I6: anche i calcoli EPR del controllo del dato (con 1M punti 0,1–0,4 s ciascuno)
  const HEAVY=['sortedAt','findPeaks','hiddenBands','signalQuality','noiseRobust','noiseSigma','peakWidthPts','derivLS','sgSmooth','chromMetrics','peakAreas','baselineArPLS','baselineSNIP','whittaker','despike','smoothMA','peakCandidates',
    'eprIsAbsorption','eprEdgeSignal','eprDoubleIntegral','eprWings','eprLines','peakFwhmPts','axisGaps'];
  const BIG=200000, NEED={need:true}, MAXE=24;
  let probe=false, needs=[];
  const cache=[];   // [{fn, args, fps, res}], i più recenti in fondo
  const isBig=a=>ArrayBuffer.isView(a) && !(a instanceof DataView) && a.length>=BIG;
  // impronta veloce di un vettore (lunghezza e 256 campioni) per scartare subito i candidati; l'uguaglianza vera si controlla elemento per elemento
  function fp(a){ if (!ArrayBuffer.isView(a)) return JSON.stringify(a); if (a._acchFp!==undefined) return a._acchFp; let h=a.length>>>0; const st=Math.max(1, Math.floor(a.length/256)), f=new Float64Array(1), u=new Uint32Array(f.buffer);
    for (let i=0;i<a.length;i+=st){ f[0]=a[i]; h=Math.imul(h^u[0], 16777619)>>>0; h=Math.imul(h^u[1], 16777619)>>>0; } return a.constructor.name+a.length+':'+h; }
  function sameArr(a, b){ if (a===b) return true; if (!b || a.length!==b.length || a.constructor!==b.constructor) return false; for (let i=0;i<a.length;i++){ const x=a[i], y=b[i]; if (x!==y && !(x!==x && y!==y) ) return false; if (x===0 && !Object.is(x,y)) return false; } return true; }
  // argomenti copiabili bit per bit: numeri, testi, vettori numerici e piccoli elenchi, anche di coppie (le zone di fondo EPR [[a,b],…])
  const prim=v=>v==null || ['number','string','boolean'].includes(typeof v);
  const plainArgs=A=>A.every(a=>prim(a) || ArrayBuffer.isView(a) || (Array.isArray(a) && a.length<1000 && a.every(v=>prim(v) || (Array.isArray(v) && v.length<16 && v.every(prim)))));
  const copy=r=>ArrayBuffer.isView(r) ? r.slice() : (r && typeof r==='object') ? structuredClone(r) : r;   // chi riceve può modificare il risultato
  function lookup(fn, A){ const F=A.map(fp);
    for (let k=cache.length-1;k>=0;k--){ const e=cache[k]; if (e.fn!==fn || e.args.length!==A.length || e.fps.some((x,i)=>x!==F[i])) continue;
      if (A.every((a,i)=>ArrayBuffer.isView(a) ? sameArr(a, e.args[i]) : true)){ cache.splice(k,1); cache.push(e); return e; } }
    return null; }
  function store(fn, A, res){ cache.push({fn, args:A, fps:A.map(fp), res}); while (cache.length>MAXE) cache.shift(); }
  for (const fn of HEAVY){ const orig=win[fn]; if (typeof orig!=='function') continue;
    win[fn]=function(...A){
      if (!A.some(isBig) || !plainArgs(A)) return orig.apply(this, A);
      const e=lookup(fn, A); if (e) return copy(e.res);   // già calcolato (nel worker) con gli stessi argomenti, bit per bit
      if (probe){ needs.push({fn, args:A}); throw NEED; }
      return orig.apply(this, A); }; }
  const pause=()=>new Promise(r=>setTimeout(r,0));
  /* run: funzione sincrona della pagina. Restituisce il suo risultato, calcolato con i risultati pesanti già pronti dal worker.
     I risultati restano in memoria (al massimo MAXE, controllati elemento per elemento), così chi chiede di nuovo lo stesso calcolo lo trova.
     Al massimo 40 giri; se il worker non risponde si calcola nella pagina come prima */
  let chain=Promise.resolve();
  AcchEngine.prefetch=function(run){ const job=chain.then(async ()=>{
      await pause();   // I6: ogni lavoro parte in un compito suo; prima il secondo partiva subito dopo il primo e i due giri facevano un blocco solo
      for (let k=0;k<40;k++){ needs=[]; probe=true; let out, err=null;
        try{ out=run(); }catch(e){ err=e; } finally{ probe=false; }
        const got=needs; needs=[];
        if (!got.length){ if (err) throw err; return out; }   // nessuna chiamata mancante: è il risultato vero, identico a quello sincrono
        for (const n of got){ if (lookup(n.fn, n.args)) continue;
          let r; try{ r=await AcchEngine.call(n.fn, ...n.args); }catch(e){ r=win[n.fn].apply(null, n.args); }   // worker non disponibile: nella pagina
          store(n.fn, n.args, r); }
        await pause(); }
      return run(); });
    chain=job.catch(()=>{}); return job; };
  AcchEngine.heavyCache=()=>cache.map(e=>e.fn);
  win.AcchEngine=AcchEngine;
})(window);
