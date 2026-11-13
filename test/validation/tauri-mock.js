// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Finto window.__TAURI__ per provare nel browser il ponte desktop (app/desktop.js) senza l'app vera.
// I comandi nativi rispondono con i dati preparati nel test (window.__mock) e ogni chiamata resta registrata.
// Esportazione in cartella: M.disk è il disco finto ({percorso: byte}); pick_export_dir concede la cartella di M.pick.pick_export_dir.
'use strict';
function tauriMock(){
  const M=window.__mock={calls:[], listeners:{}, drag:[], menu:null, files:{}, pick:{}, writes:[], store:{}, storeWrites:[], writeDelay:0, shown:0, disk:{}, dirs:new Set(), failRel:null, reveals:[], libfs:{}, libUser:'/app/librerie', libShared:[], libDirErr:{}, libWrites:[], onLibWrite:null,
    emit(name, payload){ (M.listeners[name]||[]).forEach(cb=>cb({event:name, payload})); },
    dragEvent(payload){ M.drag.forEach(cb=>cb({event:'tauri://drag', payload})); } };
  const enc=s=>new TextEncoder().encode(s);
  async function invoke(cmd, args, opt){
    const h=k=>decodeURIComponent(opt.headers[k]);
    M.calls.push({cmd, t:performance.now(), args: cmd==='write_file' ? {size:args.length, path:h('x-acch-path')} : cmd==='save_report_shot' ? {size:args.length, name:opt.headers['x-acch-name'], dest:opt.headers['x-acch-dest'], png:Array.from(args.slice(0,8))} : cmd==='write_in_dir' ? {size:args.length, dir:h('x-acch-dir'), rel:h('x-acch-rel')} : JSON.parse(JSON.stringify(args||{}))});
    const join=(d,r)=>d.replace(/\/+$/,'')+'/'+r, granted=d=>{ if (!M.dirs.has(d)) throw 'not-allowed'; };
    switch (cmd){
      case 'install_info': return {os:'windows', kind:'nsis', arch:'x86_64', e2e:true};
      case 'installer_language': return null;
      case 'take_pending_open': { const L=M.pending||[]; M.pending=[]; return L; }   // file passati dal sistema operativo (I3: anche i grezzi)
      case 'app_ready': M.shown++; return null;
      case 'pick_many': case 'pick_folder': return M.pick[cmd] || [];
      case 'pick_open': case 'pick_save': return M.pick[cmd]===undefined ? null : M.pick[cmd];
      case 'read_file': { const t=M.files[args.path]; if (t==null) throw 'read-failed: NotFound'; return Array.from(typeof t==='string' ? enc(t) : t); }
      case 'write_file': { if (M.writeDelay) await new Promise(r=>setTimeout(r,M.writeDelay)); if (M.writeFail) throw 'write-failed: PermissionDenied'; M.writes.push({path:decodeURIComponent(opt.headers['x-acch-path']), size:args.length, t:performance.now(), bytes:M.keepBytes?Array.from(args):undefined}); return null; }
      case 'pick_export_dir': { const p=M.pick.pick_export_dir; if (!p) return null; M.dirs.add(p.path); return p; }
      case 'export_existing': granted(args.dir); return args.rels.filter(r=>Object.prototype.hasOwnProperty.call(M.disk, join(args.dir,r)));
      case 'write_in_dir': { const d=h('x-acch-dir'), r=h('x-acch-rel'); granted(d); if (/(^|\/)\.\.?(\/|$)|^\/|\\/.test(r)) throw 'unsafe-path';
        if (M.writeDelay) await new Promise(res=>setTimeout(res,M.writeDelay)); if (M.failRel && M.failRel.test(r)) throw 'write-failed: PermissionDenied';
        M.disk[join(d,r)]=args.slice(); M.writes.push({path:join(d,r), size:args.length, t:performance.now()}); return null; }
      case 'reveal_in_dir': granted(args.dir); M.reveals.push(args.rel ? join(args.dir,args.rel) : args.dir); return null;
      case 'store_write': { M.storeWrites.push(args.items); for (const [k,v] of Object.entries(args.items)){ if (v==null) delete M.store[k]; else M.store[k]=v; } return null; }   // archivio su file (lib.rs, store.rs)
      case 'save_report_shot': { M.shots=(M.shots||[]); M.shots.push(args); return (opt.headers['x-acch-dest']==='temp'?'C:\\Temp\\Acchiappaspettri\\':'C:\\Users\\Prova\\Downloads\\')+opt.headers['x-acch-name']; }
      case 'send_report_mapi': if (M.mapi instanceof Error || typeof M.mapi==='string' && /^mapi-/.test(M.mapi)) throw String(M.mapi.message||M.mapi); return M.mapi||'sent';
      // librerie dei picchi (libs.rs): un piccolo disco in memoria, con la cartella dell'utente e le cartelle condivise registrate
      case 'lib_list': { const dirs=[M.libUser].concat(M.libShared); return {user:M.libUser, dirs:dirs.map(d=>M.libDirErr[d] ? {path:d, kind:d===M.libUser?'user':'shared', ok:false, error:M.libDirErr[d], files:[]} : {path:d, kind:d===M.libUser?'user':'shared', ok:true, error:null,
          files:Object.keys(M.libfs).filter(p=>p.startsWith(d+'/') && !p.slice(d.length+1).includes('/') && /\.acchlib(\.json)?$/i.test(p)).sort().map(p=>({name:p.slice(d.length+1), path:p, text:M.libfs[p], sha256:window.AcchLib.sha256(M.libfs[p])}))})}; }
      case 'lib_write': { const dir=args.path.replace(/\/[^/]*$/,''); if (dir!==M.libUser && !M.libShared.includes(dir)) throw 'not-allowed';
        if (M.onLibWrite){ const f=M.onLibWrite; M.onLibWrite=null; f(args); }   // un altro computer scrive proprio adesso
        const cur=M.libfs[args.path], now=cur==null?null:window.AcchLib.sha256(cur);
        if ((now||null)!==(args.expect||null)) return {ok:false, sha256:now||'', text:cur==null?'':cur};
        if (cur!=null && dir===M.libUser) M.libfs[M.libUser+'/versioni/'+args.path.slice(dir.length+1)+'.'+now.slice(0,12)]=cur;
        M.libfs[args.path]=args.text; M.libWrites.push(args.path); return {ok:true, sha256:window.AcchLib.sha256(args.text), text:null}; }
      case 'lib_remove': { if (!args.path.startsWith(M.libUser+'/')) throw 'not-allowed'; M.libfs[M.libUser+'/versioni/'+args.path.slice(M.libUser.length+1)+'.tolta']=M.libfs[args.path]; delete M.libfs[args.path]; return null; }
      case 'lib_shared_add': { const d=M.pick.lib_shared_add; if (!d) return null; if (!M.libShared.includes(d)) M.libShared.push(d); return d; }
      case 'lib_shared_remove': { M.libShared=M.libShared.filter(d=>d!==args.path); return null; }
      default: throw 'mock: comando sconosciuto '+cmd;
    }
  }
  const win={ onCloseRequested(){ return Promise.resolve(()=>{}); }, setTitle(){ return Promise.resolve(); }, destroy(){ return Promise.resolve(); }, close(){ return Promise.resolve(); }, show(){ M.shown++; return Promise.resolve(); } };
  const item=o=>Promise.resolve(Object.assign({kind:'item'},o));
  window.__TAURI__={
    core:{invoke},
    event:{listen(name, cb){ (M.listeners[name]=M.listeners[name]||[]).push(cb); return Promise.resolve(()=>{}); }},
    window:{getCurrentWindow:()=>win},
    webview:{getCurrentWebview:()=>({onDragDropEvent(cb){ M.drag.push(cb); return Promise.resolve(()=>{}); }})},
    menu:{MenuItem:{new:item}, PredefinedMenuItem:{new:item}, Submenu:{new:o=>Promise.resolve({kind:'sub', text:o.text, items:o.items})}, Menu:{new:o=>Promise.resolve({items:o.items, setAsAppMenu(){ M.menu=o.items; return Promise.resolve(); }})}},
    opener:{openUrl(u){ M.calls.push({cmd:'openUrl', args:{u}}); return M.openFail ? Promise.reject('no handler') : Promise.resolve(); }, revealItemInDir(p){ M.calls.push({cmd:'revealItemInDir', args:{p}}); return Promise.resolve(); }},
    updater:{check(){ return Promise.resolve(null); }},
    process:{relaunch(){ return Promise.resolve(); }}
  };
}
// apre la pagina come l'app desktop, con il finto Tauri e un registro dei selettori di file del browser (non devono mai aprirsi)
async function openDesk(B, br, server, opt){
  opt=opt||{}; const o=await B.openPage(br, server, Object.assign({}, opt, {desk:true, init:[tauriMock].concat(opt.init||[])}));
  o.choosers=0; o.p.on('filechooser', fc=>{ o.choosers++; });
  return o;
}
module.exports={tauriMock, openDesk};
