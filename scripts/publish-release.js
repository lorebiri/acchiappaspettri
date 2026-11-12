// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Ultimo passo della pipeline: pubblica la bozza solo se contiene tutti i pacchetti e un latest.json che l'app può davvero usare
// (ogni firma verificata con la chiave pubblica di tauri.conf.json sul file scaricato), poi scrive le note da CHANGELOG.md.
// Uso: node scripts/publish-release.js vX.Y.Z [--check-only DIR [--notes-out FILE]]
//   DIR: cartella con latest.json e i pacchetti, per provarlo senza GitHub; FILE: dove scrivere le note che verrebbero pubblicate
const {execFileSync}=require('child_process'), fs=require('fs'), path=require('path'), os=require('os'), {verify, trustedComment}=require('./minisign-verify');
const tag=process.argv[2], ci=process.argv.indexOf('--check-only'), localDir=ci>0?process.argv[ci+1]:null, no=process.argv.indexOf('--notes-out'), notesOut=no>0?process.argv[no+1]:null;
const gh=(...a)=>execFileSync('gh',a,{encoding:'utf8', maxBuffer:1<<26}); const beta=tag.includes('-'), ver=tag.replace(/^v/,'');
const conf=JSON.parse(fs.readFileSync(path.join(__dirname,'..','src-tauri','tauri.conf.json'),'utf8')), repo=(process.env.GITHUB_REPOSITORY||'lorebiri/acchiappaspettri');
const fail=m=>{ console.error('✗ '+m); process.exit(1); };
const assets = localDir ? fs.readdirSync(localDir).map(n=>({name:n, size:fs.statSync(path.join(localDir,n)).size})) : JSON.parse(gh('release','view',tag,'--json','assets')).assets, names=assets.map(a=>a.name);
// .deb anche per le prove, ma con la versione Debian «X~rc.N» (scripts/deb-version.js): con «X-rc.N» dpkg la crederebbe più
// nuova della stabile. La versione scritta dentro il .deb si controlla più sotto, sul file scaricato.
const D=require('./deb-version');
const need=[[/^librerie-linux-ubuntu-22\.04\.tsv$/,'elenco delle librerie dell\'AppImage (offerta LGPL)'],[/x64-setup\.exe$/,'Windows .exe'],[/aarch64\.dmg$/,'macOS Apple Silicon .dmg'],[/x64\.dmg$/,'macOS Intel .dmg'],[/\.AppImage$/,'Linux AppImage'],[/\.deb$/,'Linux .deb'],[/^latest\.json$/,'latest.json']];
const miss=need.filter(([re])=>!names.some(n=>re.test(n))).map(x=>x[1]); if (miss.length) fail('Mancano: '+miss.join(', '));
// un solo pacchetto per piattaforma: due .exe (o due .dmg Intel) vorrebbero dire una bozza sporca, e l'utente scaricherebbe quello sbagliato
const dup=need.map(([re,what])=>[what,names.filter(n=>re.test(n))]).filter(([,l])=>l.length>1); if (dup.length) fail('Più di un file per: '+dup.map(([w,l])=>w+' ('+l.join(', ')+')').join('; '));
const empty=assets.filter(a=>!(a.size>0)).map(a=>a.name); if (empty.length) fail('File vuoti nella release: '+empty.join(', '));
const wrongVer=names.filter(n=>/\.(exe|dmg|deb|AppImage)$/.test(n) && !n.includes('_'+ver+'_')); if (wrongVer.length) fail('Pacchetti con una versione diversa da '+ver+': '+wrongVer.join(', '));
const dir=localDir || fs.mkdtempSync(path.join(os.tmpdir(),'rel-')); if (!localDir) gh('release','download',tag,'-p','latest.json','-D',dir);
const j=JSON.parse(fs.readFileSync(path.join(dir,'latest.json'),'utf8'));
if (String(j.version||'').replace(/^v/,'')!==ver) fail('versione di latest.json diversa dal tag');
// voci di base (obbligatorie) e voci con il tipo di installer (l'updater le prova per prime: se ci sono devono essere valide)
const expect={'windows-x86_64':/x64-setup\.exe$/, 'darwin-aarch64':/aarch64\.app\.tar\.gz$/, 'darwin-x86_64':/x64\.app\.tar\.gz$/, 'linux-x86_64':/\.AppImage$/};
const suffix={'windows-x86_64':'nsis','darwin-aarch64':'app','darwin-x86_64':'app','linux-x86_64':'appimage'};
// il .deb si aggiorna a mano (docs/AGGIORNAMENTI.md): la voce che tauri-action aggiunge per lui si toglie, così l'updater non installa mai un .deb da solo
if (j.platforms && j.platforms['linux-x86_64-deb']){ delete j.platforms['linux-x86_64-deb']; console.log('· tolta la voce linux-x86_64-deb da latest.json (il .deb si aggiorna a mano)'); }
const P=j.platforms||{}, prefix=`https://github.com/${repo}/releases/download/${tag}/`, fetched={};
const asset=n=>{ const p=path.join(dir,n); if (!fs.existsSync(p)){ if (localDir) fail('manca il file '+n); gh('release','download',tag,'-p',n,'-D',dir); } return fs.readFileSync(p); };
const checkEntry=(key, re)=>{ const e=P[key]; if (!e || !e.url || !e.signature) return `${key}: voce vuota o incompleta`;
  if (!e.url.startsWith(prefix)) return `${key}: indirizzo fuori dalla release ${tag} (${e.url})`;
  const n=decodeURIComponent(e.url.slice(prefix.length)); if (!re.test(n)) return `${key}: pacchetto sbagliato per questa piattaforma (${n})`;
  if (!names.includes(n)) return `${key}: il pacchetto ${n} non è nella release`;
  const why=verify(conf.plugins.updater.pubkey, e.signature, fetched[n]||(fetched[n]=asset(n))); if (why) return `${key}: ${why} (${n})`;
  // i .app.tar.gz non hanno la versione nel nome: la si legge nel commento firmato (version:…), che vale per tutti i pacchetti
  const v=/(?:^|\t)version:([^\t]+)/.exec(trustedComment(e.signature)||''); if (!v || v[1].trim()!==ver) return `${key}: pacchetto della versione ${v?v[1].trim():'(non indicata nella firma)'}, non ${ver} (${n})`;
  return null; };
{ const n=names.find(x=>/\.deb$/.test(x)), v=D.field(asset(n),'Version'); if (v!==D.debVersion(ver)) fail(`${n}: versione Debian «${v}», attesa «${D.debVersion(ver)}»`+(beta?' (con il trattino dpkg crederebbe la prova più nuova della stabile)':''));
  console.log('✓ .deb con la versione Debian '+v); }
const errs=[]; for (const [k,re] of Object.entries(expect)){ const a=checkEntry(k,re); if (a) errs.push(a); const ks=k+'-'+suffix[k]; if (P[ks]){ const b=checkEntry(ks,re); if (b) errs.push(b); } }
for (const k of Object.keys(P)) if (!expect[k] && !Object.keys(expect).some(b=>k===b+'-'+suffix[b])) errs.push(`${k}: piattaforma inattesa in latest.json`);
if (P['darwin-aarch64'] && P['darwin-x86_64'] && P['darwin-aarch64'].url===P['darwin-x86_64'].url) errs.push('i due Mac puntano allo stesso pacchetto');
if (errs.length) fail('latest.json non utilizzabile:\n  '+errs.join('\n  '));
console.log('✓ latest.json: '+Object.keys(P).length+' voci, firme verificate con la chiave pubblica dell\'app');
// note: la sezione di questa versione in CHANGELOG.md; latest.json porta le stesse note agli utenti
const cl=fs.readFileSync(path.join(__dirname,'..','CHANGELOG.md'),'utf8');
// (?![\w.+-]): «## 2.2.0» non deve prendere «## 2.2.0-rc.1», che nel CHANGELOG sta sopra
const section=v=>{ const m=new RegExp('^## '+v.replace(/[.+]/g,'\\$&')+'(?![\\w.+-])[^\\n]*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))','m').exec(cl); return m && m[1].trim(); };
const own=section(ver); if (!own) fail('Manca la sezione '+ver+' in CHANGELOG.md');
// una release candidate rimanda alle novità della stabile: le si mette davvero sotto, non solo nominate
const base=ver.split('-')[0], baseNotes=beta ? section(base) : null; if (beta && !baseNotes) fail('Manca la sezione '+base+' in CHANGELOG.md (le novità della versione di prova)');
const notes=own+(baseNotes ? `\n\n### Novità della ${base} · What's new in ${base}\n\n`+baseNotes : '');
console.log('✓ note di rilascio dalla sezione '+ver+(baseNotes?' e dalla '+base:'')+' di CHANGELOG.md');
// pagina della release (ciclo 26, ricercatore senior su Windows): prima il file da scaricare, poi gli avvisi del browser e del PC
// nell'ordine in cui compaiono, poi le novità. Le note di latest.json (finestra dell'app) restano solo le novità.
const file=re=>names.find(n=>re.test(n)), deb=file(/\.deb$/), doc=`https://github.com/${repo}/blob/${tag}/docs/INSTALLAZIONE.md`;
const page=`### Quale file scaricare · Which file to download
- **Windows 10/11** → \`${file(/x64-setup\.exe$/)}\`
- **Mac Apple Silicon** (M1, M2, M3, M4…) → \`${file(/aarch64\.dmg$/)}\`
- **Mac Intel** → \`${file(/x64\.dmg$/)}\`
- **Linux** → \`${file(/\.AppImage$/)}\` o · or \`${deb}\` (Debian, Ubuntu)

I file si trovano più sotto, in **Assets**. Gli altri (\`.sig\`, \`.app.tar.gz\`, \`latest.json\`, \`.tsv\`) servono agli aggiornamenti automatici e alla licenza; «Source code (zip)» e «Source code (tar.gz)», aggiunti da GitHub, sono il codice sorgente: nessuno di questi serve per usare il programma. · The files are below, under **Assets**. The others are for automatic updates and licensing; «Source code» archives are added by GitHub: you do not need them to use the program.

Istruzioni passo passo · Step-by-step instructions: [docs/INSTALLAZIONE.md](${doc})

### Avvisi del browser e del PC · Browser and PC warnings
I pacchetti non hanno firma Apple/Microsoft, quindi browser e sistema avvisano; gli aggiornamenti invece sono firmati e verificati dall'app. Su Windows gli avvisi arrivano in quest'ordine:
1. **Edge** (download): «non viene scaricato comunemente» → ⋯ accanto al download → «Mantieni» → «Mostra altro» → «Mantieni comunque». In Chrome: «Conserva». · *Edge: … → Keep → Show more → Keep anyway; Chrome: Keep*.
2. **SmartScreen** (finestra blu «Windows ha protetto il PC»): «Ulteriori informazioni» → «Esegui comunque». · *More info → Run anyway*.
3. **Avviso di sicurezza** (Autore sconosciuto): «Esegui». · *Security Warning, Unknown publisher: Run*.
- **Smart App Control** (Windows 11): se è attivo può bloccare l'installer senza «Esegui comunque». Usa la versione online o chiedi al servizio informatico; vedi la guida. · *Windows 11 Smart App Control may block the unsigned installer with no Run anyway: use the online version or ask IT; see the guide*.
- **Avast / AVG**: l'app non firmata può partire nella sandbox dell'antivirus; si risolve con un'eccezione per \`%LOCALAPPDATA%\\Acchiappaspettri\\acchiappaspettri.exe\` (guida). · *Avast/AVG may run the unsigned app in their sandbox: add an exception for that path (see the guide)*.
- **macOS (Gatekeeper)**: se il Mac dice che l'app non si può aprire, vai in Impostazioni di Sistema → Privacy e sicurezza e scegli «Apri comunque». · *System Settings → Privacy & Security → Open Anyway*.`
  // solo per la 2.2.0: le rc.1–rc.3 sono uscite anche come .deb, e per dpkg sono più nuove della 2.2.0
  +(ver==='2.2.0' && deb ? `\n\n### Chi ha installato una versione di prova (rc) dal .deb · If you installed a release candidate from the .deb
Per il gestore pacchetti le versioni di prova 2.2.0-rc risultano più nuove della 2.2.0: installala dal terminale, nella cartella del file scaricato, con · Your package manager sees the 2.2.0 release candidates as newer than 2.2.0: install it from a terminal with
\`\`\`
sudo apt install --allow-downgrades ./${deb}
\`\`\`` : '')
  +`\n\n---\n\n### Novità · What's new\n\n`+notes;
if (localDir){ if (notesOut) fs.writeFileSync(notesOut, page+'\n'); console.log('Controllo superato (nessuna pubblicazione: --check-only)'); process.exit(0); }
j.notes=notes; fs.writeFileSync(path.join(dir,'latest.json'),JSON.stringify(j,null,1)); gh('release','upload',tag,path.join(dir,'latest.json'),'--clobber');
fs.writeFileSync(path.join(dir,'notes.md'),page+'\n\nLicenza: GPL-3.0-or-later (LICENSE); componenti di terze parti in THIRD-PARTY-NOTICES.md (nei pacchetti anche LICENSE.txt e THIRD-PARTY-NOTICES.txt).\n\n**Offerta del codice sorgente (AppImage).** L\'AppImage per Linux include librerie di Ubuntu 22.04 distribuite con licenze LGPL e GPL; l\'elenco dei pacchetti da cui vengono, con le versioni esatte, è nel file `librerie-linux-ubuntu-22.04.tsv` di questa release. Per almeno tre anni dalla pubblicazione chiunque può chiedere il codice sorgente corrispondente scrivendo all\'autore (lorenzo.birindelli@cnr.it); il codice è anche disponibile dagli archivi pubblici di Ubuntu (`apt-get source <pacchetto>=<versione>`). The Linux AppImage includes LGPL/GPL libraries from Ubuntu 22.04: the exact versions are listed in `librerie-linux-ubuntu-22.04.tsv`; for at least three years anyone may request the corresponding source code from the author.\n');
gh('release','edit',tag,'--notes-file',path.join(dir,'notes.md'),'--draft=false',...(beta?['--prerelease']:['--latest']));
console.log('Pubblicata',tag,beta?'(beta: non proposta agli utenti stabili)':'(stabile)');
