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
// .deb solo per le stabili: per dpkg «2.2.0-rc.N» è più nuova di «2.2.0» (rc letta come revisione Debian), e chi la installasse
// vedrebbe la stabile come una retrocessione. Le pre-release escono senza .deb (release.yml), e qui un .deb le ferma.
const need=[[/^librerie-linux-ubuntu-22\.04\.tsv$/,'elenco delle librerie dell\'AppImage (offerta LGPL)'],[/x64-setup\.exe$/,'Windows .exe'],[/aarch64\.dmg$/,'macOS Apple Silicon .dmg'],[/x64\.dmg$/,'macOS Intel .dmg'],[/\.AppImage$/,'Linux AppImage'],...(beta?[]:[[/\.deb$/,'Linux .deb']]),[/^latest\.json$/,'latest.json']];
const miss=need.filter(([re])=>!names.some(n=>re.test(n))).map(x=>x[1]); if (miss.length) fail('Mancano: '+miss.join(', '));
if (beta && names.some(n=>/\.deb$/.test(n))) fail('Pre-release con un .deb: per dpkg '+ver+' sarebbe più nuova della '+ver.split('-')[0]+' stabile. Va tolto dalla bozza');
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
// pagina della release: quale file scaricare, avvisi del primo avvio, guida completa con un collegamento vero (sul tag)
const file=re=>names.find(n=>re.test(n)), deb=file(/\.deb$/), doc=`https://github.com/${repo}/blob/${tag}/docs/INSTALLAZIONE.md`;
const page=notes+`\n\n---\n\n### Quale file scaricare · Which file to download
- **Windows 10/11** → \`${file(/x64-setup\.exe$/)}\`
- **Mac Apple Silicon** (M1, M2, M3, M4…) → \`${file(/aarch64\.dmg$/)}\`
- **Mac Intel** → \`${file(/x64\.dmg$/)}\`
- **Linux** → \`${file(/\.AppImage$/)}\``+(deb ? ` o · or \`${deb}\` (Debian, Ubuntu)` : ' (le versioni di prova non hanno il .deb · no .deb for pre-releases)')+`

Gli altri file (\`.sig\`, \`.app.tar.gz\`, \`latest.json\`, \`.tsv\`) servono agli aggiornamenti automatici e alla licenza: non vanno scaricati. The other files are used by automatic updates and for licensing: you do not need them.

Istruzioni passo passo · Step-by-step instructions: [docs/INSTALLAZIONE.md](${doc})

### Avvisi al primo avvio · First-launch warnings
I pacchetti non hanno firma Apple/Microsoft, quindi il sistema avvisa al primo avvio; gli aggiornamenti invece sono firmati e verificati dall'app.
- **Windows (SmartScreen)**: nella finestra blu di Microsoft Defender SmartScreen fai clic su «Ulteriori informazioni» e poi su «Esegui comunque». · *More info → Run anyway*.
- **macOS (Gatekeeper)**: se il Mac dice che l'app non si può aprire, vai in Impostazioni di Sistema → Privacy e sicurezza e scegli «Apri comunque». · *System Settings → Privacy & Security → Open Anyway*.`
  // solo per la 2.2.0: le rc.1–rc.3 sono uscite anche come .deb, e per dpkg sono più nuove della 2.2.0
  +(ver==='2.2.0' && deb ? `\n\n### Chi ha installato una versione di prova (rc) dal .deb · If you installed a release candidate from the .deb
Per il gestore pacchetti le versioni di prova 2.2.0-rc risultano più nuove della 2.2.0: installala dal terminale, nella cartella del file scaricato, con · Your package manager sees the 2.2.0 release candidates as newer than 2.2.0: install it from a terminal with
\`\`\`
sudo apt install --allow-downgrades ./${deb}
\`\`\`` : '');
if (localDir){ if (notesOut) fs.writeFileSync(notesOut, page+'\n'); console.log('Controllo superato (nessuna pubblicazione: --check-only)'); process.exit(0); }
j.notes=notes; fs.writeFileSync(path.join(dir,'latest.json'),JSON.stringify(j,null,1)); gh('release','upload',tag,path.join(dir,'latest.json'),'--clobber');
fs.writeFileSync(path.join(dir,'notes.md'),page+'\n\nLicenza: GPL-3.0-or-later (LICENSE); componenti di terze parti in THIRD-PARTY-NOTICES.md.\n\n**Offerta del codice sorgente (AppImage).** L\'AppImage per Linux include librerie di Ubuntu 22.04 distribuite con licenze LGPL e GPL; l\'elenco con le versioni esatte è nel file `librerie-linux-ubuntu-22.04.tsv` di questa release. Per almeno tre anni dalla pubblicazione chiunque può chiedere il codice sorgente corrispondente scrivendo all\'autore (lorenzo.birindelli@cnr.it); il codice è anche disponibile dagli archivi pubblici di Ubuntu (`apt-get source <pacchetto>=<versione>`). The Linux AppImage includes LGPL/GPL libraries from Ubuntu 22.04: the exact versions are listed in `librerie-linux-ubuntu-22.04.tsv`; for at least three years anyone may request the corresponding source code from the author.\n');
gh('release','edit',tag,'--notes-file',path.join(dir,'notes.md'),'--draft=false',...(beta?['--prerelease']:['--latest']));
console.log('Pubblicata',tag,beta?'(beta: non proposta agli utenti stabili)':'(stabile)');
