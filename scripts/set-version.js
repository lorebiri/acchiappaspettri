// Porta tutti i file alla stessa versione: node scripts/set-version.js 2.3.0   (oppure 2.3.0-beta.1)
const fs=require('fs'), path=require('path'), root=path.join(__dirname,'..'), v=process.argv[2];
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(v||'')) { console.error('Uso: node scripts/set-version.js X.Y.Z[-beta.N]'); process.exit(1); }
const edit=(f,fn)=>{ const p=path.join(root,f); fs.writeFileSync(p, fn(fs.readFileSync(p,'utf8'))); };
edit('package.json', s=>s.replace(/"version": "[^"]+"/, `"version": "${v}"`));
edit('src-tauri/tauri.conf.json', s=>s.replace(/"version": "[^"]+"/, `"version": "${v}"`));
edit('src-tauri/Cargo.toml', s=>s.replace(/^version = "[^"]+"/m, `version = "${v}"`));
const short=v.split('-')[0].split('.').slice(0,2).join('.');
edit('index.html', s=>s.replace(/const APP_VERSION='[^']+';/, `const APP_VERSION='${short}';`).replace(/const APP_VERSION_FULL=\(\)=>'[^']+';/, `const APP_VERSION_FULL=()=>'${v}';`));
console.log('versione',v,'— ricorda la voce in NOVITA (index.html) e CHANGELOG.md');
