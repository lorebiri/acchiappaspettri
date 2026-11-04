// Avvia l'app desktop compilata con la feature e2e e controlla il rapporto. Uso: node test/e2e/run-e2e.js <eseguibile> [scenario] [--update-url URL]
const {spawn}=require('child_process'), fs=require('fs'), os=require('os'), path=require('path');
const exe=process.argv[2], scenario=process.argv[3]||'full', url=process.argv[4]||''; const dir=fs.mkdtempSync(path.join(os.tmpdir(),'acch-e2e-'));
const env=Object.assign({},process.env,{ACCH_E2E_DIR:dir,ACCH_E2E_SCENARIO:scenario,ACCH_E2E_UPDATE_URL:url});
const c=spawn(exe,[],{env,stdio:'inherit'}); const t=setTimeout(()=>{ console.error('tempo scaduto'); c.kill(); process.exit(3); },+process.env.E2E_TIMEOUT||180000);
c.on('exit',code=>{ clearTimeout(t); const p=path.join(dir,'e2e-report.json'); if (fs.existsSync(p)) console.log(fs.readFileSync(p,'utf8')); else console.error('nessun rapporto'); process.exit(code==null?4:code); });
