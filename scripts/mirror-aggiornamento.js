// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Mirror locale per provare l'aggiornamento firmato prima di pubblicare (per esempio dalla 2.2.0 alla 3.0.0-rc.N).
// Serve su 127.0.0.1 un latest.json con gli indirizzi riscritti verso il mirror e i pacchetti della nuova versione, con le
// firme originali. Prima di partire verifica ogni firma con la chiave pubblica dell'app (src-tauri/tauri.conf.json) e la
// versione scritta nel commento firmato: un mirror che servisse pacchetti non verificabili proverebbe il nulla.
// L'app installata la si punta al mirror con la build di collaudo (feature e2e, comando e2e_check_update): guida in docs/AGGIORNAMENTI.md.
// Uso: node scripts/mirror-aggiornamento.js <cartella> [--porta 8790] [--solo-controllo]
//   <cartella>: latest.json e i pacchetti per l'updater (.exe, .app.tar.gz, .AppImage) della versione nuova, scaricati dalla bozza della release
'use strict';
const fs=require('fs'), path=require('path'), http=require('http'), {verify, trustedComment}=require('./minisign-verify');

function load(dir, pubkey){
  const j=JSON.parse(fs.readFileSync(path.join(dir,'latest.json'),'utf8')), ver=String(j.version||'').replace(/^v/,''), errs=[], files={};
  if (!ver) errs.push('latest.json senza versione');
  for (const [k,e] of Object.entries(j.platforms||{})){
    if (!e || !e.url || !e.signature){ errs.push(`${k}: voce incompleta`); continue; }
    const name=decodeURIComponent(String(e.url).split('/').pop()), p=path.join(dir,name);
    if (!fs.existsSync(p)){ errs.push(`${k}: manca il file ${name}`); continue; }
    const why=verify(pubkey, e.signature, files[name]||(files[name]=fs.readFileSync(p))); if (why){ errs.push(`${k}: ${why} (${name})`); continue; }
    const v=/(?:^|\t)version:([^\t]+)/.exec(trustedComment(e.signature)||''); if (!v || v[1].trim()!==ver) errs.push(`${k}: firma della versione ${v?v[1].trim():'(non indicata)'}, non ${ver}`);
  }
  if (!Object.keys(j.platforms||{}).length) errs.push('latest.json senza piattaforme');
  return {j, ver, errs, files}; }

function serve(dir, opt){ opt=opt||{};
  const pubkey=opt.pubkey || JSON.parse(fs.readFileSync(path.join(__dirname,'..','src-tauri','tauri.conf.json'),'utf8')).plugins.updater.pubkey;
  const L=load(dir, pubkey); if (L.errs.length) return Promise.reject(new Error('mirror non avviato:\n  '+L.errs.join('\n  ')));
  const log=opt.log||(m=>console.log(m));
  const srv=http.createServer((q,r)=>{ const u=decodeURIComponent(q.url.split('?')[0]).replace(/^\//,''), base=`http://127.0.0.1:${srv.address().port}/`;
    log(`${new Date().toISOString().slice(11,19)} ${q.method} /${u}`);
    if (u==='latest.json'){ const j=JSON.parse(JSON.stringify(L.j)); for (const e of Object.values(j.platforms)) e.url=base+encodeURIComponent(decodeURIComponent(e.url.split('/').pop()));
      r.writeHead(200,{'content-type':'application/json'}); return r.end(JSON.stringify(j,null,1)); }
    if (Object.prototype.hasOwnProperty.call(L.files,u)){ r.writeHead(200,{'content-type':'application/octet-stream','content-length':L.files[u].length}); return r.end(L.files[u]); }
    r.writeHead(404); r.end(); });
  return new Promise(res=>srv.listen(opt.port||0,'127.0.0.1',()=>res({srv, port:srv.address().port, version:L.ver, platforms:Object.keys(L.j.platforms)}))); }

module.exports={load, serve};

if (require.main===module){ const a=process.argv.slice(2), dir=a.find(x=>!x.startsWith('--') && a[a.indexOf(x)-1]!=='--porta'), pi=a.indexOf('--porta'), only=a.includes('--solo-controllo');
  if (!dir){ console.error('Uso: node scripts/mirror-aggiornamento.js <cartella> [--porta 8790] [--solo-controllo]'); process.exit(2); }
  const pubkey=JSON.parse(fs.readFileSync(path.join(__dirname,'..','src-tauri','tauri.conf.json'),'utf8')).plugins.updater.pubkey;
  if (only){ const L=load(dir, pubkey); if (L.errs.length){ console.error('✗ '+L.errs.join('\n✗ ')); process.exit(1); } console.log(`✓ ${L.ver}: ${Object.keys(L.j.platforms).length} voci, firme verificate`); process.exit(0); }
  serve(dir, {port:pi>=0?+a[pi+1]:8790, pubkey}).then(m=>{ const url=`http://127.0.0.1:${m.port}/latest.json`;
    console.log(`✓ mirror della ${m.version} su ${url} (firme verificate; piattaforme: ${m.platforms.join(', ')})`);
    console.log('Prova con la build di collaudo della versione installata (vedi docs/AGGIORNAMENTI.md):');
    console.log(`  ACCH_E2E_SCENARIO=update-good ACCH_E2E_UPDATE_URL=${url} ACCH_E2E_DIR=<cartella del rapporto> <eseguibile della versione vecchia>`);
    console.log('Ctrl+C per fermare.'); }, e=>{ console.error('✗ '+e.message); process.exit(1); }); }
