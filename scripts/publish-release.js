// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Ultimo passo della pipeline: pubblica la bozza solo se contiene tutti i pacchetti e un latest.json che l'app può davvero usare
// (ogni firma verificata con la chiave pubblica di tauri.conf.json sul file scaricato), poi scrive le note da CHANGELOG.md.
// Uso: node scripts/publish-release.js vX.Y.Z [--check-only DIR]  (DIR: cartella con latest.json e i pacchetti, per provarlo senza GitHub)
const {execFileSync}=require('child_process'), fs=require('fs'), path=require('path'), os=require('os'), {verify}=require('./minisign-verify');
const tag=process.argv[2], ci=process.argv.indexOf('--check-only'), localDir=ci>0?process.argv[ci+1]:null;
const gh=(...a)=>execFileSync('gh',a,{encoding:'utf8', maxBuffer:1<<26}); const beta=tag.includes('-'), ver=tag.replace(/^v/,'');
const conf=JSON.parse(fs.readFileSync(path.join(__dirname,'..','src-tauri','tauri.conf.json'),'utf8')), repo=(process.env.GITHUB_REPOSITORY||'lorebiri/acchiappaspettri');
const fail=m=>{ console.error('✗ '+m); process.exit(1); };
const names = localDir ? fs.readdirSync(localDir) : JSON.parse(gh('release','view',tag,'--json','assets')).assets.map(a=>a.name);
const need=[[/^librerie-linux-ubuntu-22\.04\.tsv$/,'elenco delle librerie dell\'AppImage (offerta LGPL)'],[/x64-setup\.exe$/,'Windows .exe'],[/aarch64\.dmg$/,'macOS Apple Silicon .dmg'],[/x64\.dmg$/,'macOS Intel .dmg'],[/\.AppImage$/,'Linux AppImage'],[/\.deb$/,'Linux .deb'],[/^latest\.json$/,'latest.json']];
const miss=need.filter(([re])=>!names.some(n=>re.test(n))).map(x=>x[1]); if (miss.length) fail('Mancano: '+miss.join(', '));
const wrongVer=names.filter(n=>/\.(exe|dmg|deb|AppImage)$/.test(n) && !n.includes('_'+ver+'_')); if (wrongVer.length) fail('Pacchetti con una versione diversa da '+ver+': '+wrongVer.join(', '));
const dir=localDir || fs.mkdtempSync(path.join(os.tmpdir(),'rel-')); if (!localDir) gh('release','download',tag,'-p','latest.json','-D',dir);
const j=JSON.parse(fs.readFileSync(path.join(dir,'latest.json'),'utf8'));
if (String(j.version||'').replace(/^v/,'')!==ver) fail('versione di latest.json diversa dal tag');
// voci di base (obbligatorie) e voci con il tipo di installer (l'updater le prova per prime: se ci sono devono essere valide)
const expect={'windows-x86_64':/x64-setup\.exe$/, 'darwin-aarch64':/aarch64\.app\.tar\.gz$/, 'darwin-x86_64':/x64\.app\.tar\.gz$/, 'linux-x86_64':/\.AppImage$/};
const suffix={'windows-x86_64':'nsis','darwin-aarch64':'app','darwin-x86_64':'app','linux-x86_64':'appimage'};
const P=j.platforms||{}, prefix=`https://github.com/${repo}/releases/download/${tag}/`, fetched={};
const asset=n=>{ const p=path.join(dir,n); if (!fs.existsSync(p)){ if (localDir) fail('manca il file '+n); gh('release','download',tag,'-p',n,'-D',dir); } return fs.readFileSync(p); };
const checkEntry=(key, re)=>{ const e=P[key]; if (!e || !e.url || !e.signature) return `${key}: voce vuota o incompleta`;
  if (!e.url.startsWith(prefix)) return `${key}: indirizzo fuori dalla release ${tag} (${e.url})`;
  const n=decodeURIComponent(e.url.slice(prefix.length)); if (!re.test(n)) return `${key}: pacchetto sbagliato per questa piattaforma (${n})`;
  if (!names.includes(n)) return `${key}: il pacchetto ${n} non è nella release`;
  const why=verify(conf.plugins.updater.pubkey, e.signature, fetched[n]||(fetched[n]=asset(n))); return why ? `${key}: ${why} (${n})` : null; };
const errs=[]; for (const [k,re] of Object.entries(expect)){ const a=checkEntry(k,re); if (a) errs.push(a); const ks=k+'-'+suffix[k]; if (P[ks]){ const b=checkEntry(ks,re); if (b) errs.push(b); } }
for (const k of Object.keys(P)) if (!expect[k] && !Object.keys(expect).some(b=>k===b+'-'+suffix[b])) errs.push(`${k}: piattaforma inattesa in latest.json`);
if (P['darwin-aarch64'] && P['darwin-x86_64'] && P['darwin-aarch64'].url===P['darwin-x86_64'].url) errs.push('i due Mac puntano allo stesso pacchetto');
if (errs.length) fail('latest.json non utilizzabile:\n  '+errs.join('\n  '));
console.log('✓ latest.json: '+Object.keys(P).length+' voci, firme verificate con la chiave pubblica dell\'app');
if (localDir){ console.log('Controllo superato (nessuna pubblicazione: --check-only)'); process.exit(0); }
// note: la sezione di questa versione in CHANGELOG.md; latest.json porta le stesse note agli utenti
const cl=fs.readFileSync(path.join(__dirname,'..','CHANGELOG.md'),'utf8'), m=new RegExp('^## '+ver.replace(/[.]/g,'\\.')+'\\b[^\\n]*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))','m').exec(cl);
if (!m || !m[1].trim()) fail('Manca la sezione '+ver+' in CHANGELOG.md');
const notes=m[1].trim(); j.notes=notes; fs.writeFileSync(path.join(dir,'latest.json'),JSON.stringify(j,null,1)); gh('release','upload',tag,path.join(dir,'latest.json'),'--clobber');
fs.writeFileSync(path.join(dir,'notes.md'),notes+'\n\nInstallazione: docs/INSTALLAZIONE.md. I pacchetti non hanno firma Apple/Microsoft: il sistema può mostrare un avviso al primo avvio.\n\nLicenza: GPL-3.0-or-later (LICENSE); componenti di terze parti in THIRD-PARTY-NOTICES.md.\n\n**Offerta del codice sorgente (AppImage).** L\'AppImage per Linux include librerie di Ubuntu 22.04 distribuite con licenze LGPL e GPL; l\'elenco con le versioni esatte è nel file `librerie-linux-ubuntu-22.04.tsv` di questa release. Per almeno tre anni dalla pubblicazione chiunque può chiedere il codice sorgente corrispondente scrivendo all\'autore (lorenzo.birindelli@cnr.it); il codice è anche disponibile dagli archivi pubblici di Ubuntu (`apt-get source <pacchetto>=<versione>`). The Linux AppImage includes LGPL/GPL libraries from Ubuntu 22.04: the exact versions are listed in `librerie-linux-ubuntu-22.04.tsv`; for at least three years anyone may request the corresponding source code from the author.\n');
gh('release','edit',tag,'--notes-file',path.join(dir,'notes.md'),'--draft=false',...(beta?['--prerelease']:['--latest']));
console.log('Pubblicata',tag,beta?'(beta: non proposta agli utenti stabili)':'(stabile)');
