// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Adattatore dell'host: l'unico punto da cui la pagina e il nucleo leggono e scrivono l'archivio delle impostazioni e del lavoro.
   - online: localStorage del browser (com'era), con un ripiego in memoria se il browser lo blocca;
   - desktop: un file per chiave in app_data_dir()/archivio, scritto in modo atomico dal lato nativo (lib.rs, store_write).
     All'avvio il lato nativo consegna l'archivio già letto in window.__ACCH_STORE__, prima di ogni altro script:
     così le letture restano sincrone e i numeri del nucleo non cambiano.
   Interfaccia come localStorage (getItem, setItem, removeItem, key, length) più keys() e flush().
   Va caricato per primo (prima di shell-boot.js). Funziona anche in Node, per i test. */
(function(root, factory){
  const api=factory();
  if (typeof module==='object' && module.exports) module.exports=api;
  else root.AcchHost=api.create(root);
})(typeof self!=='undefined' ? self : this, function(){
  'use strict';
  const MIGRATED='acch.store.migrated';
  /* archivio in memoria: se localStorage non c'è (worker, Node, browser che lo blocca) il lavoro della sessione non si rompe */
  function memoryStore(){ const m=new Map();
    return { kind:'memory', getItem:k=>m.has(String(k))?m.get(String(k)):null, setItem(k,v){ m.set(String(k),String(v)); }, removeItem(k){ m.delete(String(k)); },
      key:i=>[...m.keys()][i]??null, get length(){ return m.size; }, keys:()=>[...m.keys()], flush:()=>Promise.resolve(true) }; }
  function webStore(ls){
    return { kind:'web', getItem:k=>ls.getItem(k), setItem:(k,v)=>ls.setItem(k,v), removeItem:k=>ls.removeItem(k), key:i=>ls.key(i), get length(){ return ls.length; },
      keys(){ const out=[]; for (let i=0;i<ls.length;i++) out.push(ls.key(i)); return out; }, flush:()=>Promise.resolve(true) }; }
  /* desktop: le chiavi vivono in memoria e su file; ogni modifica va in coda e si scrive a lotti, uno alla volta e nell'ordine.
     boot = {items:{chiave:valore}} letto dal lato nativo; invoke = __TAURI__.core.invoke; ls = localStorage della webview (o null). */
  function fileStore(boot, invoke, ls, opt){
    opt=opt||{};
    const data=new Map(Object.entries((boot && boot.items) || {}).filter(([k,v])=>typeof v==='string'));
    let pending=new Map(), writing=Promise.resolve(true), scheduled=false;
    const st={ kind:'desktop', migration:null, lastError:null, writes:0 };
    function schedule(){ if (scheduled) return; scheduled=true; Promise.resolve().then(()=>{ scheduled=false; flush(); }); }
    function flush(){
      writing=writing.then(async ()=>{
        if (!pending.size) return true;
        const batch=pending; pending=new Map();
        const items={}; for (const [k,v] of batch) items[k]=v;
        try{ await invoke('store_write', {items}); st.writes++; st.lastError=null; return true; }
        catch(e){ // non si perde niente: il lotto torna in coda, sotto alle modifiche più recenti, e si riprova più tardi
          for (const [k,v] of batch) if (!pending.has(k)) pending.set(k,v);
          st.lastError=String(e); if (opt.onError) try{ opt.onError(e); }catch(_){}
          setTimeout(schedule, opt.retryMs||5000); return false; }
      });
      return writing;
    }
    function put(k,v){ k=String(k); if (v==null) data.delete(k); else data.set(k,String(v)); pending.set(k, v==null?null:String(v)); schedule();
      // copia di cortesia nella webview: una versione precedente dell'app (che legge solo localStorage) trova ancora il lavoro
      if (ls) try{ if (v==null) ls.removeItem(k); else ls.setItem(k,String(v)); }catch(e){} }
    /* migrazione dal localStorage delle versioni precedenti: una volta sola, senza cancellare niente.
       Il file vince sul localStorage: una chiave già nell'archivio non viene sovrascritta. */
    if (!data.has(MIGRATED)){
      const keys=[]; if (ls) try{ for (let i=0;i<ls.length;i++){ const k=ls.key(i); if (k!=null && k!==MIGRATED) keys.push(k); } }catch(e){}
      let copied=0; for (const k of keys){ if (data.has(k)) continue; let v=null; try{ v=ls.getItem(k); }catch(e){} if (v==null) continue; data.set(k,v); pending.set(k,v); copied++; }
      const mark=JSON.stringify({from:'localStorage', at:new Date().toISOString(), keys:copied});
      data.set(MIGRATED, mark); pending.set(MIGRATED, mark);   // il segno va nello stesso lotto delle chiavi copiate: o tutto o niente
      st.migration={copied, keys:keys.length}; schedule();
    }
    // getter veri (Object.assign copierebbe solo il valore del momento)
    return Object.defineProperties(Object.assign(st, {
      getItem:k=>{ k=String(k); return data.has(k)?data.get(k):null; },
      setItem:(k,v)=>put(k,v), removeItem:k=>put(k,null),
      key:i=>[...data.keys()][i]??null, keys:()=>[...data.keys()], flush }),
      { length:{get:()=>data.size}, pending:{get:()=>pending.size} });
  }
  function create(win){
    const T=win.__TAURI__, boot=win.__ACCH_STORE__;
    let ls=null; try{ ls=win.localStorage; ls.getItem('acch.probe'); }catch(e){ ls=null; }
    let store;
    // un solo avviso finché la scrittura non torna a funzionare: i tentativi successivi non ripetono il messaggio
    let told=false; const onError=e=>{ console.error('archivio', e); if (told) return; told=true; setTimeout(()=>{ told=false; }, 60000);
      const m='Impossibile scrivere l\'archivio dell\'applicazione: le modifiche restano in memoria e verranno riscritte.', I=win.AcchI18n; if (typeof win.toast==='function') win.toast(I && I.lang==='en' ? I.tr(m) : m); };
    if (T && T.core && boot && typeof boot==='object') store=fileStore(boot, T.core.invoke, ls, {onError});
    else store=ls ? webStore(ls) : memoryStore();
    return { kind: store.kind, store };
  }
  return { create, fileStore, webStore, memoryStore, MIGRATED };
});
