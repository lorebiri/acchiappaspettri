// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Controlla i pacchetti appena costruiti: esistono, hanno la versione e l'architettura giuste, contengono l'app e le risorse;
// su Windows installa e disinstalla davvero, aspettando che la disinstallazione sia finita.
// Cerca in src-tauri/target/release/bundle e in src-tauri/target/<architettura>/release/bundle (build della pubblicazione).
const fs=require('fs'), path=require('path'), os=require('os'), {execFileSync}=require('child_process');
const tgt=path.join(__dirname,'..','src-tauri','target'), ver=require('../package.json').version;
const roots=[path.join(tgt,'release','bundle'), ...(fs.existsSync(tgt)?fs.readdirSync(tgt).map(d=>path.join(tgt,d,'release','bundle')):[])].filter((p,i,a)=>fs.existsSync(p)&&a.indexOf(p)===i);
const run=(c,a,o)=>execFileSync(c,a,Object.assign({encoding:'utf8',stdio:'pipe'},o||{}));
const list=(d,re)=>roots.flatMap(r=>{ const p=path.join(r,d); return fs.existsSync(p) ? fs.readdirSync(p).filter(f=>re.test(f)).map(f=>path.join(p,f)) : []; });
const need=(c,m)=>{ if (!c){ console.error('✗ '+m); process.exitCode=1; } else console.log('✓ '+m); return !!c; };
const big=(f,mb)=>fs.statSync(f).size>mb*1048576, hasVer=f=>path.basename(f).includes('_'+ver+'_');
const sleep=ms=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);
const until=(ok,s)=>{ for (let i=0;i<s*2;i++){ if (ok()) return true; sleep(500); } return ok(); };
if (!need(roots.length,'cartella dei pacchetti trovata')) process.exit(1);

if (process.platform==='win32'){ const exes=list('nsis',/-setup\.exe$/); need(exes.length===1,'un solo installer .exe ('+exes.length+')'); const exe=exes[0];
  need(exe && big(exe,1) && hasVer(exe),'installer .exe della versione '+ver); need(fs.existsSync(exe+'.sig')||!process.env.TAURI_SIGNING_PRIVATE_KEY,'firma per l\'updater');
  const dir=path.join(process.env.LOCALAPPDATA,'Acchiappaspettri'), app=['acchiappaspettri.exe','Acchiappaspettri.exe'].map(n=>path.join(dir,n)), un=path.join(dir,'uninstall.exe');
  const lnkDirs=[path.join(process.env.APPDATA,'Microsoft','Windows','Start Menu','Programs'), path.join(process.env.ProgramData||'C:\\ProgramData','Microsoft','Windows','Start Menu','Programs')];
  const lnk=()=>lnkDirs.some(d=>{ try{ return fs.readdirSync(d,{recursive:true}).some(f=>/Acchiappaspettri.*\.lnk$/i.test(String(f))); }catch(e){ return false; } });
  // prima dell'installazione non deve esserci niente: altrimenti i controlli qui sotto passerebbero per caso
  if (!need(!app.some(fs.existsSync) && !lnk(),'nessuna installazione precedente (programma o voce del menu Start)')) process.exit(1);
  run(exe,['/S'],{timeout:180000});
  need(until(()=>app.some(fs.existsSync),30),'installato senza privilegi di amministratore in '+dir);
  need(fs.existsSync(path.join(dir,'installer-language.txt')),'lingua dell\'installer registrata');
  need(['LICENSE','THIRD-PARTY-NOTICES.md','LICENSE.txt','THIRD-PARTY-NOTICES.txt'].every(f=>fs.existsSync(path.join(dir,f))),'licenza e avvisi di terze parti installati (anche in .txt)');
  need(until(lnk,30),'voce nel menu Start');
  need(fs.existsSync(un),'disinstallazione presente');
  // _?= fa girare il disinstallatore sul posto e attendere la sua fine (senza, NSIS si copia altrove e torna subito)
  run(un,['/S','_?='+dir],{timeout:180000});
  need(until(()=>!app.some(fs.existsSync),30),'programma rimosso');
  need(until(()=>!lnk(),30),'voce del menu Start rimossa');
  try{ fs.rmSync(dir,{recursive:true,force:true}); }catch(e){} }

if (process.platform==='darwin'){ const arch=process.env.EXPECT_ARCH || (process.arch==='arm64'?'arm64':'x86_64'), tag=arch==='arm64'?'aarch64':'x64';
  const dmgs=list('dmg',/\.dmg$/).filter(f=>path.basename(f).includes('_'+tag+'.')); need(dmgs.length===1,'un .dmg per '+arch+' ('+dmgs.length+')'); const dmg=dmgs[0];
  need(dmg && big(dmg,1) && hasVer(dmg),'immagine .dmg della versione '+ver);
  const mnt=fs.mkdtempSync(path.join(os.tmpdir(),'dmg-')); run('hdiutil',['attach',dmg,'-readonly','-nobrowse','-mountpoint',mnt]);
  try{ const app=path.join(mnt,'Acchiappaspettri.app'); need(fs.existsSync(path.join(app,'Contents/MacOS'))&&fs.existsSync(path.join(mnt,'Applications')),'la .app e il collegamento ad Applicazioni');
    const plist=fs.readFileSync(path.join(app,'Contents/Info.plist'),'utf8'); need(/acchspettri/.test(plist),'associazione dei file .acchspettri'); need(plist.includes('<string>'+ver+'</string>'),'versione '+ver+' in Info.plist');
    const bin=path.join(app,'Contents/MacOS',fs.readdirSync(path.join(app,'Contents/MacOS'))[0]), li=run('lipo',['-archs',bin]).trim(); need(li===arch,'architettura '+arch+' (trovata: '+li+')');
    need(['LICENSE','THIRD-PARTY-NOTICES.md','LICENSE.txt','THIRD-PARTY-NOTICES.txt'].every(f=>fs.existsSync(path.join(app,'Contents/Resources',f))),'licenza e avvisi di terze parti nella .app (anche in .txt)');
    run('codesign',['--verify','--deep',app]); console.log('✓ firma ad hoc coerente'); }
  finally{ run('hdiutil',['detach',mnt]); }
  if (process.env.TAURI_SIGNING_PRIVATE_KEY){ const t=list('macos',/\.app\.tar\.gz$/); need(t.length && fs.existsSync(t[0]+'.sig'),'pacchetto firmato per l\'updater'); } }

// pre-release (versione con «-»): il .deb c'è e dichiara la versione Debian «X~rc.N» (scripts/deb-version.js), che dpkg ordina prima della stabile
const pre=ver.includes('-'), D=require('./deb-version.js');
if (process.platform==='linux'){ const debs=list('deb',/\.deb$/), ais=list('appimage',/\.AppImage$/), [deb]=debs, [ai]=ais;
  need(ais.length===1 && debs.length===1,'una sola AppImage e un solo .deb ('+debs.length+', '+ais.length+')');
  if (process.env.TAURI_SIGNING_PRIVATE_KEY) need(ai && fs.existsSync(ai+'.sig'),'AppImage firmata per l\'updater');
  if (deb){ need(big(deb,1)&&hasVer(deb),'pacchetto .deb della versione '+ver); { const v=run('dpkg-deb',['-f',deb,'Version']).trim(); need(v===D.debVersion(ver),'versione Debian '+D.debVersion(ver)+' (trovata: '+v+')'+(pre?', prima della stabile per dpkg':'')); } const c=run('dpkg-deb',['-c',deb]);
  need(/usr\/bin\/acchiappaspettri/.test(c),'il .deb contiene il programma'); need(/usr\/share\/mime\/packages\/acchiappaspettri\.xml/.test(c),'il .deb dichiara il tipo dei progetti .acchspettri');
  need(/usr\/share\/doc\/acchiappaspettri\/copyright/.test(c) && /usr\/lib\/[^/\n]+\/LICENSE/.test(c) && /THIRD-PARTY-NOTICES\.md/.test(c) && /LICENSE\.txt/.test(c) && /THIRD-PARTY-NOTICES\.txt/.test(c),'il .deb contiene copyright, licenza e avvisi di terze parti');
  const x=fs.mkdtempSync(path.join(os.tmpdir(),'deb-')); run('dpkg-deb',['-x',deb,x]); const dd=path.join(x,'usr/share/applications'), df=fs.existsSync(dd)?fs.readdirSync(dd).find(f=>f.endsWith('.desktop')):null;
  const de=df?fs.readFileSync(path.join(dd,df),'utf8'):''; need(/^Exec=.*%[fFuU]/m.test(de),'la voce di menu passa i file al programma (doppio clic su un progetto)'); need(/^MimeType=.*acchiappaspettri/m.test(de),'la voce di menu apre i progetti .acchspettri');
  need(/Architecture: amd64/.test(run('dpkg-deb',['-f',deb])) || /amd64/.test(path.basename(deb)),'architettura amd64'); }
  need(ai&&big(ai,20)&&hasVer(ai),'AppImage della versione '+ver); const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ai-')); fs.chmodSync(ai,0o755); run(ai,['--appimage-extract'],{cwd:tmp,maxBuffer:1<<28});
  need(fs.existsSync(path.join(tmp,'squashfs-root/usr/bin/acchiappaspettri')),'l\'AppImage contiene il programma');
  { const lib=path.join(tmp,'squashfs-root/usr/lib'), has=fs.existsSync(lib) && fs.readdirSync(lib).some(d=>['LICENSE','THIRD-PARTY-NOTICES.md','LICENSE.txt','THIRD-PARTY-NOTICES.txt'].every(f=>fs.existsSync(path.join(lib,d,f)))); need(has,'l\'AppImage contiene licenza e avvisi di terze parti'); } }
