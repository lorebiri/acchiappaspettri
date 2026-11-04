// Ultimo passo della pipeline: se la bozza contiene tutti i pacchetti e un latest.json valido per ogni piattaforma, la pubblica con le note di CHANGELOG.md.
const {execFileSync}=require('child_process'), fs=require('fs'), path=require('path'), os=require('os');
const tag=process.argv[2], gh=(...a)=>execFileSync('gh',a,{encoding:'utf8'}); const beta=tag.includes('-');
const rel=JSON.parse(gh('release','view',tag,'--json','assets,isDraft,isPrerelease')), names=rel.assets.map(a=>a.name);
const need=[[/x64-setup\.exe$/,'Windows .exe'],[/aarch64\.dmg$/,'macOS Apple Silicon .dmg'],[/x64\.dmg$/,'macOS Intel .dmg'],[/\.AppImage$/,'Linux AppImage'],[/\.deb$/,'Linux .deb'],[/^latest\.json$/,'latest.json']];
const miss=need.filter(([re])=>!names.some(n=>re.test(n))).map(x=>x[1]); if (miss.length){ console.error('Mancano: '+miss.join(', ')); process.exit(1); }
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rel-')); gh('release','download',tag,'-p','latest.json','-D',dir); const j=JSON.parse(fs.readFileSync(path.join(dir,'latest.json'),'utf8'));
const plats=['windows-x86_64','darwin-aarch64','darwin-x86_64','linux-x86_64'], badP=plats.filter(p=>!j.platforms||!j.platforms[p]||!j.platforms[p].signature||!j.platforms[p].url); if (badP.length){ console.error('latest.json incompleto: '+badP.join(', ')); process.exit(1); }
if (j.version.replace(/^v/,'')!==tag.replace(/^v/,'')){ console.error('versione di latest.json diversa dal tag'); process.exit(1); }
// note: la sezione di questa versione in CHANGELOG.md; latest.json porta le stesse note agli utenti
const ver=tag.replace(/^v/,''), cl=fs.readFileSync(path.join(__dirname,'..','CHANGELOG.md'),'utf8'), m=new RegExp('^## '+ver.replace(/[.]/g,'\\.')+'\\b[^\\n]*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))','m').exec(cl);
if (!m || !m[1].trim()){ console.error('Manca la sezione '+ver+' in CHANGELOG.md'); process.exit(1); }
const notes=m[1].trim(); j.notes=notes; fs.writeFileSync(path.join(dir,'latest.json'),JSON.stringify(j,null,1)); gh('release','upload',tag,path.join(dir,'latest.json'),'--clobber');
fs.writeFileSync(path.join(dir,'notes.md'),notes+'\n\nInstallazione: docs/INSTALLAZIONE.md. I pacchetti non hanno firma Apple/Microsoft: il sistema può mostrare un avviso al primo avvio.\n');
gh('release','edit',tag,'--notes-file',path.join(dir,'notes.md'),'--draft=false',...(beta?['--prerelease']:['--latest']));
console.log('Pubblicata',tag,beta?'(beta: non proposta agli utenti stabili)':'(stabile)');
