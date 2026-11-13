// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Avvia l'app desktop compilata con la feature e2e e controlla il rapporto. Uso: node test/e2e/run-e2e.js <eseguibile> [scenario] [--update-url URL]
const {spawn}=require('child_process'), fs=require('fs'), os=require('os'), path=require('path');
const exe=process.argv[2], scenario=process.argv[3]||'full', url=process.argv[4]||''; const dir=fs.mkdtempSync(path.join(os.tmpdir(),'acch-e2e-'));
const env=Object.assign({},process.env,{ACCH_E2E_DIR:dir,ACCH_E2E_SCENARIO:scenario,ACCH_E2E_UPDATE_URL:url});
// I3, «apri-grezzi»: file sintetici sulla riga di comando, come il doppio clic o «Apri con» su Windows e Linux
let args=[]; if (scenario==='apri-grezzi'){ const C=require('../fixtures/gen-canali.js').corpus(); for (const rel of ['STD1.D/DAD1A.ch','STD1.D/DAD1B.ch','shimadzu-2canali.txt','waters-2canali.arw']){ const p=path.join(dir,'dati grezzi è',...rel.split('/'));   // spazi e accenti nel percorso fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,C[rel]); args.push(p); } }
const c=spawn(exe,args,{env,stdio:'inherit'}); const t=setTimeout(()=>{ console.error('tempo scaduto'); c.kill(); process.exit(3); },+process.env.E2E_TIMEOUT||180000);
c.on('exit',code=>{ clearTimeout(t); const p=path.join(dir,'e2e-report.json'); if (!fs.existsSync(p)){ console.error('nessun rapporto: il collaudo non è arrivato in fondo'); process.exit(5); }
  const txt=fs.readFileSync(p,'utf8'); console.log(txt); let r=null; try{ r=JSON.parse(txt); }catch(e){ console.error('rapporto illeggibile'); process.exit(6); }
  const bad=r&&r.checks ? Object.entries(r.checks).filter(([,v])=>String(v).startsWith('FALLITO')) : []; if (!r || r.exception || bad.length || !r.checks || !Object.keys(r.checks).length){ console.error('collaudo fallito secondo il rapporto'); process.exit(7); }
  process.exit(code==null?4:code); });
