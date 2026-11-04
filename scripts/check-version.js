// Verifica che tutte le versioni coincidano (e con il tag, se dato): la pipeline si ferma se non è così.
const fs=require('fs'), path=require('path'), root=path.join(__dirname,'..'); const rd=f=>fs.readFileSync(path.join(root,f),'utf8');
const pkg=JSON.parse(rd('package.json')).version, conf=JSON.parse(rd('src-tauri/tauri.conf.json')).version, cargo=/^version = "([^"]+)"/m.exec(rd('src-tauri/Cargo.toml'))[1], html=rd('index.html'), full=/APP_VERSION_FULL=\(\)=>'([^']+)'/.exec(html)[1], short=/const APP_VERSION='([^']+)'/.exec(html)[1], news=/const NOVITA=\[\s*\{v:'([^']+)'/.exec(html)[1];
const tag=(process.argv[2]||'').replace(/^refs\/tags\//,'').replace(/^v/,''); const errs=[];
if (new Set([pkg,conf,cargo,full]).size!==1) errs.push(`versioni diverse: package ${pkg}, tauri ${conf}, cargo ${cargo}, pagina ${full}`);
if (!pkg.startsWith(short+'.')) errs.push(`APP_VERSION ${short} non corrisponde a ${pkg}`);
if (news!==short) errs.push(`manca la voce ${short} in cima a NOVITA (c'è ${news})`);
if (tag && tag!==pkg) errs.push(`il tag v${tag} non coincide con la versione ${pkg}`);
if (errs.length){ console.error(errs.join('\n')); process.exit(1); } console.log('versione coerente:',pkg);
