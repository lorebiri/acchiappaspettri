// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Strumenti che il bundler di Tauri scarica da github.com durante «tauri build» (NSIS su Windows; AppRun, linuxdeploy, il suo
// plugin AppImage e il runtime che il plugin scarica a sua volta su Linux). Il bundler li scarica una volta sola, senza riprovare: un 504 di github.com fa fallire la build
// (release 42464743191, 8 novembre 2026). Qui li mettiamo noi nella cartella dove il bundler li cerca, verificati, con più
// tentativi distribuiti su ~15 minuti e, se github.com non risponde, dall'API delle release (api.github.com), che resta
// raggiungibile anche quando le pagine di download non lo sono. La cartella va poi in actions/cache.
//
// Percorsi, nomi e hash letti dal sorgente di tauri-bundler 2.10.4 (incluso in @tauri-apps/cli 2.12.4):
//   crates/tauri-bundler/src/bundle/windows/nsis/mod.rs   -> dirs::cache_dir()/tauri/NSIS (Windows: %LOCALAPPDATA%\tauri)
//   crates/tauri-bundler/src/bundle/linux/appimage/linuxdeploy.rs -> dirs::cache_dir()/tauri (Linux: $XDG_CACHE_HOME o ~/.cache)
// Se cambia la versione della CLI questo elenco va riletto dal sorgente nuovo: lo script si ferma finché non lo si fa.
//
// Uso: node .github/scripts/tauri-tools.js dir|fetch [--platform linux|windows] [--dir CARTELLA]
const fs=require('fs'), path=require('path'), os=require('os'), crypto=require('crypto'), {execFileSync}=require('child_process');
const CLI='2.12.4';
const argv=process.argv.slice(2), opt=k=>{ const i=argv.indexOf(k); return i>=0?argv[i+1]:null; }, mode=argv[0];
const platform=opt('--platform') || (process.platform==='win32'?'windows':process.platform==='linux'?'linux':'other');
const warn=m=>console.log('::warning::'+m), die=m=>{ console.log('::error::'+m); process.exit(1); };

function toolsDir(){
  if (opt('--dir')) return path.resolve(opt('--dir'));
  if (platform==='windows') return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(),'AppData','Local'), 'tauri');
  const x=process.env.XDG_CACHE_HOME; return path.join(x && path.isAbsolute(x) ? x : path.join(os.homedir(),'.cache'), 'tauri');
}
const hash=(alg,buf)=>crypto.createHash(alg).update(buf).digest('hex');
// il bundler azzera i byte 8-10 di linuxdeploy (il marchio AppImage) dopo ogni uso: l'hash si confronta con quei byte a zero
const zero8=buf=>{ const b=Buffer.from(buf); if (b.length>11) b[8]=b[9]=b[10]=0; return b; };

const TOOLS={
  linux:[
    {file:'AppRun-x86_64', repo:'tauri-apps/binary-releases', tag:'apprun-old', asset:'AppRun-x86_64', sha256:'f30140a43a0a59e46db21bdefdf749b9e9f2c6946e92afabbacf98b8ae73fb4f'},
    {file:'linuxdeploy-07333c6-x86_64.AppImage', repo:'tauri-apps/binary-releases', tag:'linuxdeploy-07333c6', asset:'linuxdeploy-x86_64.AppImage', sha256z:'bd9521cd5ff3ca351fecb78cd9b236a4e37b3621014ac05cac0c2d767ffa0474'},
    // «continuous»: cambia nel tempo, non ha un hash fisso; si verifica con l'hash che GitHub pubblica per l'asset, se raggiungibile
    {file:'linuxdeploy-plugin-appimage.AppImage', repo:'linuxdeploy/linuxdeploy-plugin-appimage', tag:'continuous', asset:'linuxdeploy-plugin-appimage-x86_64.AppImage', elf:1048576},
    // l'appimagetool dentro il plugin scarica a ogni build il runtime dell'AppImage da github.com (src/appimagetool_fetch_runtime.cpp):
    // con github.com in 504 è il «failed to run linuxdeploy» di run 42464743191 e 42468588488. Il plugin passa --runtime-file
    // ad appimagetool se c'è LDAI_RUNTIME_FILE (src/main.cpp); APPIMAGETOOL_RUNTIME_FILE vale per gli appimagetool dal 4/10/2026
    {file:'runtime-x86_64', repo:'AppImage/type2-runtime', tag:'continuous', asset:'runtime-x86_64', elf:262144, env:['LDAI_RUNTIME_FILE','APPIMAGETOOL_RUNTIME_FILE']},
  ],
  windows:[
    {file:'NSIS', repo:'tauri-apps/binary-releases', tag:'nsis-3.13', asset:'nsis-3.13.zip', sha1:'db14f8af2ea346b786c6ae19343f61aaf5e09b8e', zip:'nsis-3.13',
     inner:{'NSIS.exe':'6d45d4e8ccf18fe1fdac9164058f356102a2ecf2'},
     required:['makensis.exe','Bin/makensis.exe','Stubs/lzma-x86-unicode','Stubs/lzma_solid-x86-unicode','Include/MUI2.nsh','Include/FileFunc.nsh','Include/x64.nsh','Include/nsDialogs.nsh','Include/WinMessages.nsh','Include/Win/COM.nsh','Include/Win/Propkey.nsh','Include/Win/RestartManager.nsh']},
    {file:'NSIS/Plugins/x86-unicode/additional/nsis_tauri_utils.dll', repo:'tauri-apps/nsis-tauri-utils', tag:'nsis_tauri_utils-v0.5.3', asset:'nsis_tauri_utils.dll', sha1:'75197fee3c6a814fe035788d1c34ead39349b860'},
  ],
};

// controlla un file scaricato o già presente; restituisce null se va bene, altrimenti il motivo
function checkData(t, buf, digest){
  if (t.sha1 && hash('sha1',buf)!==t.sha1) return 'SHA-1 diverso da quello atteso dal bundler';
  if (t.sha256 && hash('sha256',buf)!==t.sha256) return 'SHA-256 diverso da quello fissato';
  if (t.sha256z && hash('sha256',zero8(buf))!==t.sha256z) return 'SHA-256 diverso da quello fissato';
  if (t.elf && (buf.length<t.elf || buf.slice(0,4).toString('latin1')!=='\x7fELF')) return 'non è un eseguibile ELF completo';
  if (digest && hash('sha256',buf)!==digest) return 'SHA-256 diverso da quello pubblicato da GitHub';
  return null;
}
function checkInstalled(t, dir){
  const p=path.join(dir,t.file); if (!fs.existsSync(p)) return 'assente';
  if (t.zip){ for (const r of [...t.required, ...Object.keys(t.inner)]) if (!fs.existsSync(path.join(p,r))) return 'manca '+r;
    for (const [f,h] of Object.entries(t.inner)) if (hash('sha1',fs.readFileSync(path.join(p,f)))!==h) return f+' con SHA-1 inatteso';
    return null; }
  return checkData(t, fs.readFileSync(p));
}

const sleep=s=>new Promise(r=>setTimeout(r,s*1000));
const transientStatus=s=>s>=500 || s===429 || s===408;
class Fatal extends Error {}
async function get(url, headers){
  let r; try{ r=await fetch(url,{headers:Object.assign({'user-agent':'acchiappaspettri-ci'},headers||{}), redirect:'follow', signal:AbortSignal.timeout(180000)}); }
  catch(e){ throw new Error('rete: '+(e.cause&&e.cause.code || e.name || e.message)); }
  if (!r.ok){ const m='HTTP '+r.status+' da '+new URL(url).host; throw transientStatus(r.status) ? new Error(m) : new Fatal(m); }
  return Buffer.from(await r.arrayBuffer());
}
const api=(p,accept)=>{ const tok=process.env.GH_TOKEN||process.env.GITHUB_TOKEN, h={accept:accept||'application/vnd.github+json'}; if (tok) h.authorization='Bearer '+tok; return get('https://api.github.com/'+p, h); };
// due strade per lo stesso file: il download diretto da github.com e, in alternativa, l'asset tramite l'API
async function downloadOnce(t){
  const errs=[]; let fatal=0;
  try{ return {buf:await get(`https://github.com/${t.repo}/releases/download/${t.tag}/${t.asset}`)}; }catch(e){ errs.push(e.message); if (e instanceof Fatal) fatal++; }
  try{ const rel=JSON.parse(await api(`repos/${t.repo}/releases/tags/${t.tag}`)), a=(rel.assets||[]).find(x=>x.name===t.asset);
    if (!a) throw new Fatal(`l'asset ${t.asset} non c'è nella release ${t.tag}`);
    const digest=/^sha256:([0-9a-f]{64})$/.exec(a.digest||'');
    return {buf:await api(`repos/${t.repo}/releases/assets/${a.id}`,'application/octet-stream'), digest:digest&&digest[1], via:'API'}; }
  catch(e){ errs.push(e.message); if (e instanceof Fatal) fatal++; }
  const e=new Error(errs.join('; ')); e.fatal=fatal===2; throw e;
}
const DELAYS=[15,30,60,120,180,240,300];   // circa 16 minuti in tutto: abbastanza per un disturbo breve di github.com
async function download(t){
  for (let i=0;;i++){
    try{ const r=await downloadOnce(t), bad=checkData(t, r.buf, r.digest);
      if (bad) throw Object.assign(new Error(`${t.asset}: ${bad}`),{fatal:true});
      if (t.elf && !r.digest) warn(`${t.asset}: hash pubblicato da GitHub non disponibile, controllato solo che sia un ELF completo`);
      if (r.via) warn(`${t.asset}: github.com non risponde, scaricato tramite l'API delle release`);
      return r.buf; }
    catch(e){ if (e.fatal || i>=DELAYS.length) die(`${t.asset}: download non riuscito (${e.message})`);
      warn(`${t.asset}: download non riuscito (${e.message}); nuovo tentativo ${i+2} di ${DELAYS.length+1} fra ${DELAYS[i]} s`); await sleep(DELAYS[i]); }
  }
}
function install(t, dir, buf){
  const dest=path.join(dir,t.file), tmp=path.join(dir,'.tmp-'+process.pid+'-'+path.basename(t.file));
  fs.rmSync(tmp,{recursive:true,force:true});
  if (t.zip){ fs.mkdirSync(tmp,{recursive:true}); const z=path.join(tmp,'a.zip'); fs.writeFileSync(z,buf);
    // tar di sistema (bsdtar) legge gli zip, anche quello di Windows; il tar di Git Bash no
    const tar=process.platform==='win32' ? path.join(process.env.SystemRoot||'C:\\Windows','System32','tar.exe') : 'tar';
    execFileSync(tar,['-xf',z,'-C',tmp],{stdio:'inherit'});
    // l'eventuale dll già presente va rimessa dopo (la cartella NSIS viene sostituita intera)
    fs.rmSync(dest,{recursive:true,force:true}); fs.renameSync(path.join(tmp,t.zip),dest); fs.rmSync(tmp,{recursive:true,force:true}); }
  else { fs.mkdirSync(path.dirname(dest),{recursive:true}); fs.writeFileSync(tmp,buf,{mode:0o755}); fs.renameSync(tmp,dest); }
}

(async()=>{
  const dir=toolsDir();
  if (mode==='dir'){ console.log(dir); if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT,'dir='+dir+'\n'); return; }
  if (mode!=='fetch') die('uso: tauri-tools.js dir|fetch');
  const lock=JSON.parse(fs.readFileSync(path.join(__dirname,'..','..','package-lock.json'),'utf8')), v=((lock.packages||{})['node_modules/@tauri-apps/cli']||{}).version;
  if (v!==CLI) die(`@tauri-apps/cli è ${v}, questo elenco è per ${CLI}: rileggi percorsi, URL e hash nel sorgente di tauri-bundler della nuova versione e aggiorna .github/scripts/tauri-tools.js`);
  const list=TOOLS[platform]; if (!list){ console.log('nessuno strumento da scaricare su '+platform); return; }
  fs.mkdirSync(dir,{recursive:true});
  for (const t of list){
    const why=checkInstalled(t,dir);
    if (!why){ console.log('✓ '+t.file+' (già presente e verificato)'); continue; }
    if (why!=='assente') warn(`${t.file}: ${why}, lo riscarico`);
    install(t, dir, await download(t));
    const after=checkInstalled(t,dir); if (after) die(`${t.file}: dopo l'installazione ${after}`);
    console.log('✓ '+t.file+' scaricato e verificato');
  }
  // ultimo controllo dell'insieme: la dll sta dentro NSIS, che può essere stato appena sostituito
  for (const t of list){ const why=checkInstalled(t,dir); if (why) die(`${t.file}: ${why}`);
    for (const k of t.env||[]){ const v=path.join(dir,t.file); console.log(k+'='+v); if (process.env.GITHUB_ENV) fs.appendFileSync(process.env.GITHUB_ENV,k+'='+v+'\n'); } }
  console.log('Strumenti di Tauri pronti in '+dir);
})().catch(e=>die(e.stack||String(e)));
