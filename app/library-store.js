// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Archivio delle librerie dei picchi, dietro l'adattatore dell'host (AcchHost.libs):
   - online: IndexedDB del browser («acch-librerie»), con confronto dell'impronta e scrittura nella stessa transazione;
   - desktop: file .acchlib.json in app_data_dir()/librerie e nelle cartelle condivise registrate (src-tauri/src/libs.rs);
   - memoria: per i test in Node e se IndexedDB manca.
   Scritture contemporanee (DECISIONE-PO §7): si scrive solo se il file è ancora quello letto; altrimenti si unisce voce per voce
   (AcchLib.merge) e i conflitti li sceglie l'utente (ask). Mai sovrascrivere in silenzio.
   Le librerie di sistema sono quelle di app/librerie-sistema.js (nessuna di serie): sola lettura. */
(function(root, factory){
  const api=factory(root);
  if (typeof module==='object' && module.exports) module.exports=api;
  else { root.AcchLibStore=api; if (root.AcchHost) root.AcchHost.libs=api.create(root); }
})(typeof self!=='undefined' ? self : this, function(root){
  'use strict';
  const Lib=()=>(root && root.AcchLib) || (typeof require==='function' ? require('./library.js') : null);

  /* ---- backend in memoria: stesso contratto degli altri ---- */
  function memoryBackend(){ const m=new Map();
    return { kind:'memory',
      async list(){ return [...m.values()].map(r=>({origin:'user', key:r.key, text:r.text, hash:r.hash})); },
      async write(item, text, expect){ const key=item.key; const cur=m.get(key); const now=cur?cur.hash:null;
        if ((now||null)!==(expect||null)) return {ok:false, hash:now, text:cur?cur.text:null};
        const hash=Lib().sha256(text); m.set(key, {key, text, hash}); return {ok:true, hash}; },
      async remove(item){ m.delete(item.key); return true; },
      _raw:m };
  }
  /* ---- online: IndexedDB. Lettura e scrittura nella stessa transazione readwrite: due schede non si sovrascrivono ---- */
  function idbBackend(idb){ const DB='acch-librerie', T='libs';
    const open=()=>new Promise((res,rej)=>{ const q=idb.open(DB,1); q.onupgradeneeded=()=>q.result.createObjectStore(T,{keyPath:'key'}); q.onsuccess=()=>res(q.result); q.onerror=()=>rej(q.error); });
    async function tx(mode, fn){ const d=await open(); try{ return await new Promise((res,rej)=>{ const t=d.transaction(T,mode), st=t.objectStore(T); let out; Promise.resolve(fn(st, v=>{ out=v; })).catch(rej); t.oncomplete=()=>res(out); t.onerror=()=>rej(t.error); t.onabort=()=>rej(t.error||new Error('abort')); }); } finally { d.close(); } }
    const req=r=>new Promise((res,rej)=>{ r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); });
    return { kind:'web',
      async list(){ return tx('readonly', async (st,set)=>{ set((await req(st.getAll())).map(r=>({origin:'user', key:r.key, text:r.text, hash:r.hash}))); }); },
      async write(item, text, expect){ const hash=Lib().sha256(text);
        return tx('readwrite', (st,set)=>{ const g=st.get(item.key); g.onsuccess=()=>{ const cur=g.result, now=cur?cur.hash:null;
          if ((now||null)!==(expect||null)){ set({ok:false, hash:now, text:cur?cur.text:null}); return; }
          st.put({key:item.key, text, hash, savedAt:new Date().toISOString()}); set({ok:true, hash}); }; }); },
      async remove(item){ return tx('readwrite', st=>{ st.delete(item.key); }); } };
  }
  /* ---- desktop: comandi del lato nativo ---- */
  function tauriBackend(invoke){
    let userDir=null;
    return { kind:'desktop',
      async list(){ const r=await invoke('lib_list'); userDir=r.user; const out=[];
        for (const d of r.dirs||[]){ if (!d.ok){ out.push({origin:d.kind, folder:d.path, error:d.error||'unreachable'}); continue; }
          for (const f of d.files) out.push({origin:d.kind==='shared'?'shared':'user', key:f.path, path:f.path, name:f.name, folder:d.path, text:f.text, hash:f.sha256}); }
        return out; },
      async write(item, text, expect){ if (!item.path){ if (!userDir) await this.list(); item.path=item.key=joinPath(userDir, item.fileName); }
        const r=await invoke('lib_write', {path:item.path, text, expect:expect||null}); return r.ok ? {ok:true, hash:r.sha256} : {ok:false, hash:r.sha256||null, text:r.text||null}; },
      async remove(item){ await invoke('lib_remove', {path:item.path}); return true; },
      async addShared(title){ return invoke('lib_shared_add', {title}); },
      async removeShared(path){ return invoke('lib_shared_remove', {path}); },
      get userDir(){ return userDir; } };
  }
  const joinPath=(dir,name)=>dir+(/[\\/]$/.test(dir)?'':(dir.includes('\\')&&!dir.includes('/')?'\\':'/'))+name;

  /* ---- archivio: elenco, salvataggio con confronto dell'impronta, unione ---- */
  function make(backend, opt){
    opt=opt||{}; const system=()=>(opt.system ? opt.system() : []);
    /* elenco: [{lib, origin, key, path, folder, hash, base, error, conflictOf}] — base è la libreria com'era alla lettura (serve all'unione) */
    async function list(){
      const out=[];
      for (const [i, d] of system().entries()){ try{ const lib=Lib().normalize(JSON.parse(JSON.stringify(d))); out.push({lib, base:lib, origin:'system', key:'system:'+i, readOnly:true}); }catch(e){ console.warn('libreria di sistema non valida', e); } }
      let rows=[]; try{ rows=await backend.list(); }catch(e){ console.error(e); out.push({origin:'error', error:String(e)}); }
      const byFolder={};
      for (const r of rows){
        if (r.error){ out.push({origin:r.origin, folder:r.folder, error:r.error}); continue; }
        let lib=null, err=null; try{ lib=Lib().parse(r.text); }catch(e){ err=e.code||'invalid'; }
        const it={lib, base:lib, origin:r.origin, key:r.key, path:r.path||null, name:r.name||null, folder:r.folder||null, hash:r.hash, error:err};
        out.push(it); if (r.folder) (byFolder[r.folder]=byFolder[r.folder]||[]).push(it);
      }
      // copie di conflitto di OneDrive nella stessa cartella: segnalate, mai usate al posto dell'originale
      for (const L of Object.values(byFolder)){ const cc=Lib().conflictCopies(L.map(it=>({name:it.name, id:it.lib&&it.lib.id})));
        for (const c of cc){ const it=L.find(x=>x.name===c.name), of=L.find(x=>x.name===c.of); if (it){ it.conflictOf=c.of; it.conflictReason=c.reason; if (of) of.hasConflictCopy=(of.hasConflictCopy||[]).concat([c.name]); } } }
      return out;
    }
    /* salva: item = voce dell'elenco (o {origin:'user'} per una nuova), lib = contenuto da scrivere.
       ask(result) riceve {conflicts, merged, auto} e restituisce le scelte {id:'mine'|'theirs'} o null per annullare. */
    async function save(item, lib, ask){
      if (item && item.readOnly) throw Lib().libError('read-only');
      const it=Object.assign({origin:'user'}, item||{}); let mine=Lib().normalize(JSON.parse(JSON.stringify(lib))), base=it.base||null, expect=it.hash||null, merges=[];
      if (!it.key){ it.fileName=Lib().fileNameFor(mine); it.key=backend.kind==='desktop' ? null : 'lib:'+mine.id; }
      for (let tries=0; tries<6; tries++){
        const text=Lib().serialize(mine);
        const r=await backend.write(it, text, expect);
        if (r.ok){ const saved=Lib().parse(text); return {ok:true, item:Object.assign(it, {lib:saved, base:saved, hash:r.hash}), merges}; }
        // il file è cambiato (o è comparso) dopo la lettura: si unisce con ciò che c'è ora
        if (!r.text){ expect=null; base=null; continue; }   // tolto nel frattempo: lo si ricrea
        let theirs; try{ theirs=Lib().parse(r.text); }catch(e){ throw Lib().libError('changed-unreadable'); }
        if (theirs.id!==mine.id){   // un'altra libreria con lo stesso nome di file: si scrive accanto, senza toccarla
          if (backend.kind!=='desktop') throw Lib().libError('changed-other');
          it.path=null; it.key=null; it.fileName=Lib().fileNameFor(mine).replace(/\.acchlib\.json$/, '-'+mine.id.slice(-6)+'.acchlib.json'); expect=null; base=null; continue; }
        const m=Lib().merge(base, mine, theirs); merges.push({auto:m.auto, conflicts:m.conflicts.length});
        let next=m.merged;
        if (m.conflicts.length){ const ch=ask ? await ask(m) : null; if (!ch) return {ok:false, cancelled:true, conflicts:m.conflicts, theirs}; next=Lib().resolve(m, ch); }
        base=theirs; expect=r.hash; mine=next;
      }
      throw Lib().libError('busy');
    }
    async function remove(item){ if (item.readOnly || item.origin!=='user') throw Lib().libError('read-only'); return backend.remove(item); }
    return { kind:backend.kind, backend, list, save, remove, addShared:backend.addShared?backend.addShared.bind(backend):null, removeShared:backend.removeShared?backend.removeShared.bind(backend):null };
  }
  function create(win){
    const T=win.__TAURI__, sys=()=>Array.isArray(win.ACCH_SYSTEM_LIBS) ? win.ACCH_SYSTEM_LIBS : [];
    if (T && T.core && win.__ACCH_STORE__) return make(tauriBackend(T.core.invoke), {system:sys});
    let idb=null; try{ idb=win.indexedDB||null; }catch(e){ idb=null; }
    return make(idb ? idbBackend(idb) : memoryBackend(), {system:sys});
  }
  return { create, make, memoryBackend, idbBackend, tauriBackend };
});
