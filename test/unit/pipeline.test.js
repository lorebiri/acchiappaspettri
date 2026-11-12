// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Script della pipeline di rilascio provati in locale, senza GitHub: ogni script si copia in una cartella temporanea con i suoi
// dintorni finti (CLI di tauri, server HTTP al posto di github.com e api.github.com, chiave di firma di prova).
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), os=require('os'), crypto=require('crypto'), http=require('http');
const {execFile}=require('child_process');
const root=path.join(__dirname,'..','..');
const tmp=p=>fs.mkdtempSync(path.join(os.tmpdir(),p));
const run=(args,opt)=>new Promise(res=>execFile(process.execPath,args,Object.assign({encoding:'utf8',timeout:60000},opt||{}),(e,out,err)=>res({code:e?(e.code==null?1:e.code):0,out:out+err})));
// copia uno script del progetto sostituendo alcune stringhe (indirizzi, attese): ogni sostituzione deve trovare il suo testo
function copyScript(rel, dest, subs){ let s=fs.readFileSync(path.join(root,rel),'utf8');
  for (const [a,b] of subs||[]){ assert.ok(s.includes(a),`${rel}: non trovo «${a}»`); s=s.split(a).join(b); }
  fs.mkdirSync(path.dirname(path.join(dest,rel)),{recursive:true}); fs.writeFileSync(path.join(dest,rel),s); }

/* ---------- tauri-build.js: si ripete solo se l'errore FINALE è passeggero ---------- */
function buildTree(stderr){ const d=tmp('tb-'); copyScript('.github/scripts/tauri-build.js', d, [['WAIT=[30,90]','WAIT=[0,0]']]);
  const cli=path.join(d,'node_modules/@tauri-apps/cli'); fs.mkdirSync(cli,{recursive:true});
  fs.writeFileSync(path.join(cli,'tauri.js'), `const fs=require('fs'),f=__dirname+'/count';fs.writeFileSync(f,String((fs.existsSync(f)?+fs.readFileSync(f):0)+1));
process.stderr.write(${JSON.stringify(stderr)});process.exit(1);`);
  return {d, count:()=>+fs.readFileSync(path.join(cli,'count'),'utf8')}; }
const busy='Unmounting disk image...\nhdiutil: detach failed - Resource busy\nWait a moment...\n"disk4" ejected.\n';
const tbCases=[
  // simulazione dell'ingegnere di rilascio (c25/rilascio/sim): «Resource busy» superato da bundle_dmg.sh, poi un errore vero
  ['«Resource busy» superato, poi la chiave di firma mancante: nessun nuovo tentativo', busy+'    Error failed to bundle project: A public key has been found, but no private key. Make sure to set `TAURI_SIGNING_PRIVATE_KEY` environment variable.\n', 1, null],
  ['«Resource busy» e poi un errore di compilazione: nessun nuovo tentativo', busy+'error[E0425]: cannot find value `x` in this scope\nerror: could not compile `acchiappaspettri`\n', 1, null],
  ['il .dmg fallisce davvero per «Resource busy»: 3 tentativi', 'hdiutil: create failed - Resource busy\n    Error failed to bundle project: error running bundle_dmg.sh: `failed to run bundle_dmg.sh`\n', 3, /hdiutil «Resource busy» anche al tentativo 3/],
  ['il .dmg fallisce per un altro motivo dopo un «Resource busy» superato: nessun nuovo tentativo', busy+'hdiutil: create failed - No space left on device\n    Error failed to bundle project: error running bundle_dmg.sh\n', 1, null],
  ['download del bundler in 503 come errore finale: 3 tentativi', busy+'    Error failed to bundle project: `http status: 503`\n', 3, /errore HTTP passeggero anche al tentativo 3/],
];
for (const [name, stderr, n, re] of tbCases) test('tauri-build: '+name, async()=>{ const t=buildTree(stderr), r=await run([path.join(t.d,'.github/scripts/tauri-build.js'),'build'],{cwd:t.d});
  assert.equal(r.code,1); assert.equal(t.count(), n, r.out); if (re) assert.match(r.out, re); else assert.ok(!/::warning::|::error::/.test(r.out), r.out); });

/* ---------- tauri-tools.js: hash degli strumenti «continuous» sempre dall'API, salvato in cache e ricontrollato ---------- */
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const elf=(n,seed)=>{ const b=Buffer.alloc(n); crypto.createHash('sha512').update(seed).digest().copy(b,16); b.write('\x7fELF',0,'latin1'); return b; };
const FILES={ 'AppRun-x86_64':Buffer.from('apprun di prova'), 'linuxdeploy-x86_64.AppImage':Buffer.from('linuxdeploy di prova, abbastanza lungo'),
  'linuxdeploy-plugin-appimage-x86_64.AppImage':elf(1048576+10,'plugin'), 'runtime-x86_64':elf(262144+10,'runtime') };
const zero8=b=>{ const c=Buffer.from(b); c[8]=c[9]=c[10]=0; return c; };
// server al posto di github.com (download) e api.github.com (metadati con il digest, asset per id)
async function ghServer(){ const st={files:Object.assign({},FILES), digest:{}, noDigest:new Set(), api:0, dl:0, apiDown:false};
  for (const [k,v] of Object.entries(FILES)) st.digest[k]=sha(v);
  const names=Object.keys(FILES);
  const srv=http.createServer((q,r)=>{ const u=decodeURIComponent(q.url);
    if (u.startsWith('/api/')){ st.api++; if (st.apiDown){ r.statusCode=503; return r.end(); }
      let m=/releases\/assets\/(\d+)$/.exec(u); if (m) return r.end(st.files[names[+m[1]]]);
      m=/^\/api\/repos\/(.+)\/releases\/tags\/(.+)$/.exec(u); if (m){ r.setHeader('content-type','application/json');
        return r.end(JSON.stringify({assets:names.map((n,i)=>Object.assign({name:n,id:i}, st.noDigest.has(n)?{}:{digest:'sha256:'+st.digest[n]}))})); } }
    if (u.startsWith('/dl/')){ st.dl++; const n=u.split('/').pop(); if (st.files[n]) return r.end(st.files[n]); }
    r.statusCode=404; r.end(); });
  await new Promise(ok=>srv.listen(0,'127.0.0.1',ok)); st.port=srv.address().port; st.close=()=>srv.close(); return st; }
function toolsTree(st){ const d=tmp('tt-');
  copyScript('.github/scripts/tauri-tools.js', d, [
    ['https://api.github.com/',`http://127.0.0.1:${st.port}/api/`], ['https://github.com/${',`http://127.0.0.1:${st.port}/dl/\${`],
    ['f30140a43a0a59e46db21bdefdf749b9e9f2c6946e92afabbacf98b8ae73fb4f', sha(FILES['AppRun-x86_64'])],
    ['bd9521cd5ff3ca351fecb78cd9b236a4e37b3621014ac05cac0c2d767ffa0474', sha(zero8(FILES['linuxdeploy-x86_64.AppImage']))],
    ['const DELAYS=[15,30,60,120,180,240,300]','const DELAYS=[0,0]']]);
  fs.writeFileSync(path.join(d,'package-lock.json'), JSON.stringify({packages:{'node_modules/@tauri-apps/cli':{version:'2.12.4'}}}));
  return d; }
const fetchTools=(d)=>run([path.join(d,'.github/scripts/tauri-tools.js'),'fetch','--platform','linux','--dir',path.join(d,'cache')],{cwd:d,env:Object.assign({},process.env,{GH_TOKEN:'',GITHUB_TOKEN:'',GITHUB_ENV:''})});
const RT='runtime-x86_64', PL='linuxdeploy-plugin-appimage.AppImage';
async function withCache(fn){ const st=await ghServer(); try{ const d=toolsTree(st), c=path.join(d,'cache'); const first=await fetchTools(d); assert.equal(first.code,0,first.out); await fn(st,d,c); } finally{ st.close(); } }

test('tauri-tools: primo download, l\'hash pubblicato da GitHub resta accanto al file in cache', ()=>withCache(async(st,d,c)=>{
  for (const [f,a] of [[RT,'runtime-x86_64'],[PL,'linuxdeploy-plugin-appimage-x86_64.AppImage']]) assert.equal(fs.readFileSync(path.join(c,f+'.sha256'),'utf8').trim(), st.digest[a], f); }));
test('tauri-tools: in cache, l\'hash si richiede all\'API a ogni uso e il file non si riscarica', ()=>withCache(async(st,d,c)=>{
  st.api=0; st.dl=0; const r=await fetchTools(d); assert.equal(r.code,0,r.out); assert.ok(st.api>=2,'API interrogata '+st.api); assert.equal(st.dl,0); }));
test('tauri-tools: runtime alterato in cache → fallisce', ()=>withCache(async(st,d,c)=>{
  const p=path.join(c,RT), b=fs.readFileSync(p); b[5000]^=0xff; fs.writeFileSync(p,b);
  const r=await fetchTools(d); assert.notEqual(r.code,0,r.out); assert.match(r.out,/::error::.*runtime-x86_64/); }));
test('tauri-tools: plugin sostituito in cache da un altro ELF valido → fallisce', ()=>withCache(async(st,d,c)=>{
  fs.writeFileSync(path.join(c,PL), elf(1048576+10,'altro'));
  const r=await fetchTools(d); assert.notEqual(r.code,0,r.out); assert.match(r.out,/::error::.*linuxdeploy-plugin-appimage/); }));
test('tauri-tools: hash salvato alterato → fallisce', ()=>withCache(async(st,d,c)=>{
  fs.writeFileSync(path.join(c,RT+'.sha256'), sha(Buffer.from('x'))+'\n');
  const r=await fetchTools(d); assert.notEqual(r.code,0,r.out); assert.match(r.out,/::error::.*runtime-x86_64/); }));
test('tauri-tools: nuova build «continuous» pubblicata a monte → si riscarica e si verifica', ()=>withCache(async(st,d,c)=>{
  const nuovo=elf(262144+20,'runtime nuovo'); st.files['runtime-x86_64']=nuovo; st.digest['runtime-x86_64']=sha(nuovo);
  const r=await fetchTools(d); assert.equal(r.code,0,r.out); assert.ok(fs.readFileSync(path.join(c,RT)).equals(nuovo));
  assert.equal(fs.readFileSync(path.join(c,RT+'.sha256'),'utf8').trim(), sha(nuovo)); }));
test('tauri-tools: file scaricato diverso dall\'hash pubblicato → fallisce', async()=>{ const st=await ghServer(); try{
  st.files['runtime-x86_64']=elf(262144+10,'manomesso'); const r=await fetchTools(toolsTree(st));
  assert.notEqual(r.code,0,r.out); assert.match(r.out,/SHA-256 diverso da quello pubblicato da GitHub/); } finally{ st.close(); } });
test('tauri-tools: GitHub non pubblica l\'hash → fallisce (l\'hash è obbligatorio)', async()=>{ const st=await ghServer(); try{
  st.noDigest.add('runtime-x86_64'); const r=await fetchTools(toolsTree(st));
  assert.notEqual(r.code,0,r.out); assert.match(r.out,/::error::.*runtime-x86_64/); } finally{ st.close(); } });
test('tauri-tools: API irraggiungibile con il file in cache → fallisce (senza hash non si usa)', ()=>withCache(async(st,d,c)=>{
  st.apiDown=true; const r=await fetchTools(d); assert.notEqual(r.code,0,r.out); assert.match(r.out,/::error::/); }));

/* ---------- publish-release.js: pacchetti, versioni, .deb e note della release ---------- */
const b64=s=>Buffer.from(s).toString('base64');
function keyPair(){ const {publicKey, privateKey}=crypto.generateKeyPairSync('ed25519'), id=crypto.randomBytes(8), raw=Buffer.from(publicKey.export({format:'jwk'}).x,'base64url');
  return {id, privateKey, pub:b64('untrusted comment: minisign public key\n'+Buffer.concat([Buffer.from('Ed'),id,raw]).toString('base64')+'\n')}; }
function sign(k, data, file, ver){ const sig=crypto.sign(null, crypto.createHash('blake2b512').update(data).digest(), k.privateKey), tc=`timestamp:1\tfile:${file}\tversion:${ver}`;
  const g=crypto.sign(null, Buffer.concat([sig,Buffer.from(tc)]), k.privateKey);
  return b64('untrusted comment: signature from tauri secret key\n'+Buffer.concat([Buffer.from('ED'),k.id,sig]).toString('base64')+'\ntrusted comment: '+tc+'\n'+g.toString('base64')+'\n'); }
const CHANGELOG='# Novità delle versioni\n\n## 2.2.1\n\n- Correzioni.\n\n## 2.2.0-rc.4\n\nVersione di prova della 2.2.0, con le stesse novità elencate sotto.\n\n## 2.2.0\n\n- Novità della stabile: app desktop.\n\n## 2.1.0\n\n- Vecchia.\n';
// .deb minimo (ar + control.tar.gz con il solo file control) con la versione Debian data
function fakeDeb(v){ const D=require(path.join(root,'scripts/deb-version.js')), zlib=require('zlib');
  const th=n=>{ const h=Buffer.alloc(512); h.write(n,0,'latin1'); h.write('0000644\0',100,'latin1'); h.write('0000000\0',108,'latin1'); h.write('0000000\0',116,'latin1'); h.write('00000000000\0',136,'latin1'); h.write('0',156,'latin1'); h.write('ustar\0',257,'latin1'); h.write('00',263,'latin1'); return h; };
  const ctl=zlib.gzipSync(D.writeTar([{h:th('./control'), data:Buffer.from(`Package: acchiappaspettri\nVersion: ${v}\nArchitecture: amd64\n`)}]));
  const ah=n=>{ const b=Buffer.alloc(60,0x20); b.write(n,0,'latin1'); b.write('`\n',58,'latin1'); return b; };
  return D.writeAr([['debian-binary',Buffer.from('2.0\n')],['control.tar.gz',ctl],['data.tar.gz',zlib.gzipSync(Buffer.alloc(1024))]].map(([n,data])=>({h:ah(n),data}))); }
// una release finta completa: k firma i pacchetti; opt.deb aggiunge il .deb (opt.debVer: versione Debian scritta dentro); opt.macVer firma i .app.tar.gz con un'altra versione
function release(k, ver, opt={}){ const d=tmp('rel-'), tag='v'+ver, pre=`https://github.com/lorebiri/acchiappaspettri/releases/download/${tag}/`, P={};
  const put=(n,body)=>{ fs.writeFileSync(path.join(d,n), body||crypto.randomBytes(64)); return fs.readFileSync(path.join(d,n)); };
  put('librerie-linux-ubuntu-22.04.tsv','# x\na\t1\n'); put(`Acchiappaspettri_${ver}_aarch64.dmg`); put(`Acchiappaspettri_${ver}_x64.dmg`);
  if (opt.deb) put(`Acchiappaspettri_${ver}_amd64.deb`, fakeDeb(opt.debVer||ver.replace('-','~')));
  const entry=(keys,n,v)=>{ const s=sign(k, put(n), n, v||ver); for (const key of keys) P[key]={url:pre+n, signature:s}; };
  entry(['windows-x86_64','windows-x86_64-nsis'], `Acchiappaspettri_${ver}_x64-setup.exe`);
  entry(['darwin-aarch64','darwin-aarch64-app'], 'Acchiappaspettri_aarch64.app.tar.gz', opt.macVer);
  entry(['darwin-x86_64','darwin-x86_64-app'], 'Acchiappaspettri_x64.app.tar.gz', opt.macVer);
  entry(['linux-x86_64','linux-x86_64-appimage'], `Acchiappaspettri_${ver}_amd64.AppImage`);
  fs.writeFileSync(path.join(d,'latest.json'), JSON.stringify({version:ver, platforms:P}));
  return {d, tag}; }
function publishTree(k){ const d=tmp('pub-'); copyScript('scripts/publish-release.js', d); copyScript('scripts/minisign-verify.js', d); copyScript('scripts/deb-version.js', d);
  fs.mkdirSync(path.join(d,'src-tauri')); fs.writeFileSync(path.join(d,'src-tauri/tauri.conf.json'), JSON.stringify({plugins:{updater:{pubkey:k.pub}}}));
  fs.writeFileSync(path.join(d,'CHANGELOG.md'), CHANGELOG); return d; }
async function check(ver, opt){ const k=keyPair(), t=publishTree(k), r=release(k, ver, opt), notes=path.join(r.d,'..',path.basename(r.d)+'-note.md');
  const out=await run([path.join(t,'scripts/publish-release.js'), r.tag, '--check-only', r.d, '--notes-out', notes],{env:Object.assign({},process.env,{GITHUB_REPOSITORY:'lorebiri/acchiappaspettri'})});
  out.notes=fs.existsSync(notes)?fs.readFileSync(notes,'utf8'):null; return out; }

test('publish-release: una pre-release con il .deb «X~rc.N» si pubblica; senza .deb si ferma', async()=>{ const r=await check('2.2.0-rc.4',{deb:true}); assert.equal(r.code,0,r.out); assert.match(r.out,/versione Debian 2\.2\.0~rc\.4/);
  const n=await check('2.2.0-rc.4'); assert.equal(n.code,1); assert.match(n.out,/Mancano: Linux \.deb/); });
test('publish-release: un .deb di prova con «X-rc.N» dentro (dpkg lo crederebbe più nuovo della stabile) si ferma', async()=>{ const r=await check('2.2.0-rc.4',{deb:true, debVer:'2.2.0-rc.4'}); assert.equal(r.code,1,r.out); assert.match(r.out,/versione Debian «2\.2\.0-rc\.4», attesa «2\.2\.0~rc\.4»/); });
test('publish-release: la stabile senza .deb si ferma, con il .deb si pubblica', async()=>{ const a=await check('2.2.0'); assert.equal(a.code,1); assert.match(a.out,/Mancano: Linux \.deb/);
  const b=await check('2.2.0',{deb:true}); assert.equal(b.code,0,b.out); });
test('publish-release: .app.tar.gz di un\'altra versione (commento firmato) → si ferma', async()=>{ const r=await check('2.2.0-rc.4',{deb:true, macVer:'2.2.0-rc.3'}); assert.equal(r.code,1,r.out);
  assert.match(r.out,/darwin-aarch64: pacchetto della versione 2\.2\.0-rc\.3, non 2\.2\.0-rc\.4/); });
test('publish-release: note della rc con le novità della stabile, file per sistema, guida e avvisi', async()=>{ const r=await check('2.2.0-rc.4',{deb:true}); assert.equal(r.code,0,r.out); const n=r.notes; assert.ok(n,'note scritte');
  assert.match(n,/stesse novità elencate sotto/); assert.match(n,/Novità della stabile: app desktop/); assert.ok(n.indexOf('elencate sotto')<n.indexOf('Novità della stabile'));
  assert.ok(!/Vecchia|Correzioni/.test(n),'solo le sezioni giuste');
  assert.match(n,/\[docs\/INSTALLAZIONE\.md\]\(https:\/\/github\.com\/lorebiri\/acchiappaspettri\/blob\/v2\.2\.0-rc\.4\/docs\/INSTALLAZIONE\.md\)/);
  assert.match(n,/Windows 10\/11\*\* → `Acchiappaspettri_2\.2\.0-rc\.4_x64-setup\.exe`/); assert.match(n,/Mac Apple Silicon\*\*.* → `Acchiappaspettri_2\.2\.0-rc\.4_aarch64\.dmg`/);
  assert.match(n,/Mac Intel\*\* → `Acchiappaspettri_2\.2\.0-rc\.4_x64\.dmg`/); assert.match(n,/Linux\*\* → `Acchiappaspettri_2\.2\.0-rc\.4_amd64\.AppImage` o · or `Acchiappaspettri_2\.2\.0-rc\.4_amd64\.deb`/);
  assert.match(n,/SmartScreen.*«Ulteriori informazioni».*«Esegui comunque»/); assert.match(n,/Gatekeeper.*«Apri comunque»/);
  assert.ok(!/allow-downgrades/.test(n));
  // ciclo 26: prima il file da scaricare, poi gli avvisi (Edge → SmartScreen → Avviso di sicurezza, Smart App Control, Avast/AVG), poi le novità
  const at=re=>{ const m=re.exec(n); assert.ok(m, 'manca '+re); return m.index; };
  assert.ok(n.startsWith('### Quale file scaricare'), 'la pagina non comincia dal file da scaricare'); assert.ok(at(/Quale file scaricare/)<at(/\*\*Edge\*\*/));
  assert.ok(at(/\*\*Edge\*\*/)<at(/\*\*SmartScreen\*\*/) && at(/\*\*SmartScreen\*\*/)<at(/\*\*Avviso di sicurezza\*\*/), 'ordine degli avvisi');
  assert.ok(at(/Smart App Control/)<at(/Novità · What's new/) && at(/Avast \/ AVG/)<at(/Novità · What's new/)); assert.ok(at(/Avviso di sicurezza/)<at(/stesse novità elencate sotto/));
  assert.match(n,/%LOCALAPPDATA%\\Acchiappaspettri\\acchiappaspettri\.exe/); assert.match(n,/Source code \(zip\)/); });
test('publish-release: solo la 2.2.0 stabile spiega l\'installazione sopra una rc dal .deb', async()=>{ const a=await check('2.2.0',{deb:true}); assert.equal(a.code,0,a.out);
  assert.match(a.notes,/sudo apt install --allow-downgrades \.\/Acchiappaspettri_2\.2\.0_amd64\.deb/); assert.match(a.notes,/Linux\*\* → `Acchiappaspettri_2\.2\.0_amd64\.AppImage` o · or `Acchiappaspettri_2\.2\.0_amd64\.deb`/);
  const b=await check('2.2.1',{deb:true}); assert.equal(b.code,0,b.out); assert.ok(!/allow-downgrades/.test(b.notes)); });

/* ---------- configurazione della pipeline ---------- */
const rd=f=>fs.readFileSync(path.join(root,f),'utf8');
test('release.yml: .deb anche per le prove, con la versione Debian riscritta in X~rc.N e la firma rifatta', ()=>{ const y=rd('.github/workflows/release.yml');
  assert.match(y,/ubuntu-22\.04, args: "--bundles appimage,deb" \}/); assert.doesNotMatch(y,/args_pre/);
  const i=y.indexOf('node scripts/deb-version.js "$deb" "$GITHUB_REF_NAME"'), j=y.indexOf('node scripts/check-packages.js'); assert.ok(i>0 && i<j, 'riscrittura prima del controllo dei pacchetti');
  assert.match(y,/npx tauri signer sign "\$deb"/); assert.match(y,/gh release upload "\$GITHUB_REF_NAME" "\$\{up\[@\]\}" --clobber/); });
test('release.yml: l\'elenco delle librerie Linux viene dalle librerie dell\'AppImage (dpkg -S), non da tutta la macchina', ()=>{ const y=rd('.github/workflows/release.yml');
  assert.match(y,/node scripts\/linux-libs-tsv\.js/); assert.doesNotMatch(y,/elenco completo/); });
test('ci.yml: una modifica a THIRD-PARTY-NOTICES.md (dentro i pacchetti) fa girare la CI', ()=>{ const y=rd('.github/workflows/ci.yml'), m=/paths: (\[.*\])/.exec(y);
  const p=JSON.parse(m[1]); assert.ok(p.indexOf('THIRD-PARTY-NOTICES.md')>p.indexOf('!**.md'), m[1]); });
test('desktop.js: con una risposta in errore dell\'updater non si dice che non c\'è nessuna versione, e niente compare() inutilizzata', ()=>{ const s=rd('app/desktop.js');
  assert.ok(!/Non c'è ancora nessuna versione pubblicata/.test(s)); assert.ok(!/function compare\(/.test(s));
  const msg=/say\(\/valid release JSON\|404\/i\.test\(String\(e\)\) \? '([^']+(?:\\'[^']*)*)'/.exec(s); assert.ok(msg,'messaggio per la risposta senza release');
  const it=msg[1].replace(/\\'/g,"'"); assert.match(it,/riprova/i); const en=JSON.parse(rd('i18n/en-app.json'))[it]; assert.ok(en && /try again/i.test(en), 'traduzione inglese'); });
