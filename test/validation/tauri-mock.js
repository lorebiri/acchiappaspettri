// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Finto window.__TAURI__ per provare nel browser il ponte desktop (app/desktop.js) senza l'app vera.
// I comandi nativi rispondono con i dati preparati nel test (window.__mock) e ogni chiamata resta registrata.
'use strict';
function tauriMock(){
  const M=window.__mock={calls:[], listeners:{}, drag:[], menu:null, files:{}, pick:{}, writes:[], writeDelay:0, shown:0,
    emit(name, payload){ (M.listeners[name]||[]).forEach(cb=>cb({event:name, payload})); },
    dragEvent(payload){ M.drag.forEach(cb=>cb({event:'tauri://drag', payload})); } };
  const enc=s=>new TextEncoder().encode(s);
  async function invoke(cmd, args, opt){
    M.calls.push({cmd, t:performance.now(), args: cmd==='write_file' ? {size:args.length, path:decodeURIComponent(opt.headers['x-acch-path'])} : cmd==='save_report_shot' ? {size:args.length, name:opt.headers['x-acch-name'], dest:opt.headers['x-acch-dest'], png:Array.from(args.slice(0,8))} : JSON.parse(JSON.stringify(args||{}))});
    switch (cmd){
      case 'install_info': return {os:'windows', kind:'nsis', arch:'x86_64', e2e:true};
      case 'installer_language': return null;
      case 'take_pending_open': return [];
      case 'app_ready': M.shown++; return null;
      case 'pick_many': case 'pick_folder': return M.pick[cmd] || [];
      case 'pick_open': case 'pick_save': return M.pick[cmd]===undefined ? null : M.pick[cmd];
      case 'read_file': { const t=M.files[args.path]; if (t==null) throw 'read-failed: NotFound'; return Array.from(typeof t==='string' ? enc(t) : t); }
      case 'write_file': { if (M.writeDelay) await new Promise(r=>setTimeout(r,M.writeDelay)); if (M.writeFail) throw 'write-failed: PermissionDenied'; M.writes.push({path:decodeURIComponent(opt.headers['x-acch-path']), size:args.length, t:performance.now()}); return null; }
      case 'save_report_shot': { M.shots=(M.shots||[]); M.shots.push(args); return (opt.headers['x-acch-dest']==='temp'?'C:\\Temp\\Acchiappaspettri\\':'C:\\Users\\Prova\\Downloads\\')+opt.headers['x-acch-name']; }
      case 'send_report_mapi': if (M.mapi instanceof Error || typeof M.mapi==='string' && /^mapi-/.test(M.mapi)) throw String(M.mapi.message||M.mapi); return M.mapi||'sent';
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
