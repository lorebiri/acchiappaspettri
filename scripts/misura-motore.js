// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I5, misure del motore nell'app vera (Windows, macOS, Linux). Serve l'app di collaudo:
//   ACCH_E2E_PAGE=1 npx tauri build --features e2e --no-bundle        (release: i tempi del Rust in debug non valgono)
//   node scripts/misura-motore.js src-tauri/target/release/acchiappaspettri[.exe] [--runs 3] [--grafico] [--solo rust|js] [--file grande-1M.txt] [--out misure.json]
// Per ogni file grande (1M punti, DAD .uv da 50 MB, Shimadzu da 50 MB) e per ogni motore (Rust, worker JS con ACCH_RUST=0) avvia l'app
// una volta per misura e scrive: tempo di lettura, blocco più lungo della finestra, memoria di picco (app + WebView), e con --grafico
// anche clic → grafico disegnato. Dati sintetici (test/unit/motore-dati.js), mai dati di laboratorio.
// Isolamento: HOME (e su macOS CFFIXED_USER_HOME) in una cartella temporanea, così archivio e WebView non toccano i dati dell'utente.
// Su Windows la cartella dei dati dell'app la dà il sistema (non le variabili d'ambiente): usare un utente di prova o il PC di riferimento
// senza dati da conservare; lo script lo ricorda prima di partire.
'use strict';
const {spawn, execFileSync}=require('child_process'), fs=require('fs'), os=require('os'), path=require('path');
const D=require('../test/unit/motore-dati.js');
const args=process.argv.slice(2), exe=args[0]; if (!exe || !fs.existsSync(exe)){ console.error('uso: node scripts/misura-motore.js <eseguibile e2e> [--runs 3] [--grafico] [--solo rust|js] [--out file]'); process.exit(2); }
const opt=k=>{ const i=args.indexOf(k); return i>=0 ? args[i+1] : null; }, RUNS=+(opt('--runs')||3), GRAFICO=args.includes('--grafico'), SOLO=opt('--solo'), OUT=opt('--out');
const base=fs.mkdtempSync(path.join(os.tmpdir(),'acch-misura-')), home=path.join(base,'home'), dir=path.join(base,'dati'); fs.mkdirSync(home); fs.mkdirSync(dir);
if (process.platform==='win32') console.log('ATTENZIONE (Windows): l\'app di collaudo usa la cartella dei dati dell\'utente corrente. Usa un utente di prova.');
const files=D.files(); for (const [n,b] of Object.entries(files)) if (!/decrescente/.test(n)) fs.writeFileSync(path.join(dir,n), b);
const names=Object.keys(files).filter(n=>!/decrescente/.test(n) && (!opt('--file') || n===opt('--file')));

// memoria: somma dei processi dell'app e delle WebView nate durante la misura (su macOS i processi WebKit non sono figli dell'app)
function procs(){ try{
  if (process.platform==='win32'){ const t=execFileSync('powershell',['-NoProfile','-Command','Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId) $($_.WorkingSetSize) $($_.Name)" }'],{encoding:'utf8'});
    return t.trim().split(/\r?\n/).map(l=>{ const [pid,ppid,ws,...n]=l.trim().split(' '); return {pid:+pid, ppid:+ppid, kb:(+ws)/1024, name:n.join(' ')}; }); }
  const t=execFileSync('ps',['-A','-o','pid=,ppid=,rss=,comm='],{encoding:'utf8'});
  return t.trim().split('\n').map(l=>{ const m=/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(l); return m ? {pid:+m[1], ppid:+m[2], kb:+m[3], name:m[4]} : null; }).filter(Boolean); }catch(e){ return []; } }
function treeKb(L, root, before){ const kids=new Map(); for (const p of L){ if (!kids.has(p.ppid)) kids.set(p.ppid,[]); kids.get(p.ppid).push(p); }
  const seen=new Set(), st=[root]; let kb=0; while (st.length){ const id=st.pop(); for (const c of kids.get(id)||[]){ if (seen.has(c.pid)) continue; seen.add(c.pid); kb+=c.kb; st.push(c.pid); } }
  const me=L.find(p=>p.pid===root); if (me) kb+=me.kb;
  for (const p of L) if (!seen.has(p.pid) && p.pid!==root && !before.has(p.pid) && /WebKit|WebContent|msedgewebview2/i.test(p.name)) kb+=p.kb;   // WebView nate durante la misura
  return kb; }

function once(name, engine){ return new Promise(res=>{ const run=fs.mkdtempSync(path.join(base,'run-')), before=new Set(procs().map(p=>p.pid));
  const env=Object.assign({}, process.env, {HOME:home, CFFIXED_USER_HOME:home, XDG_DATA_HOME:path.join(home,'.local','share'), XDG_CONFIG_HOME:path.join(home,'.config'),
    ACCH_E2E_DIR:dir, ACCH_E2E_SCENARIO:'misura', ACCH_E2E_UPDATE_URL:name+(GRAFICO?',grafico':''), ACCH_RUST:engine==='js'?'0':'1'});
  fs.rmSync(path.join(dir,'e2e-report.json'),{force:true});
  const c=spawn(exe,[],{env, stdio:'ignore'}); let peak=0; const iv=setInterval(()=>{ peak=Math.max(peak, treeKb(procs(), c.pid, before)); }, process.platform==='win32'?1500:300);
  const to=setTimeout(()=>{ c.kill(); }, 900000);
  c.on('exit', ()=>{ clearInterval(iv); clearTimeout(to); let r=null; try{ r=JSON.parse(fs.readFileSync(path.join(dir,'e2e-report.json'),'utf8')); }catch(e){}
    fs.rmSync(run,{recursive:true,force:true}); const m=r && r.misure && r.misure[0]; res(m ? Object.assign(m, {peakMB:Math.round(peak/1024), asked:engine, os:r.os}) : {file:name, asked:engine, error:r ? (r.exception||JSON.stringify(r.checks)) : 'nessun rapporto'}); }); }); }

(async()=>{ const out=[];
  for (const engine of ['rust','js'].filter(e=>!SOLO || e===SOLO)) for (const n of names) for (let k=0;k<RUNS;k++){ const m=await once(n, engine); m.run=k+1; out.push(m); console.log(JSON.stringify(m)); }
  const med=a=>{ const s=a.filter(Number.isFinite).sort((x,y)=>x-y); return s.length ? s[Math.floor(s.length/2)] : null; };
  console.log('\nmediane ('+RUNS+' prove) — '+os.platform()+' '+os.arch()+', '+Math.round(os.totalmem()/2**30)+' GB, '+os.cpus()[0].model);
  console.log('motore\tfile\tMB\tletto da\tlettura ms\tritardo max del timer ms\tblocco lungo max ms\tclic→grafico ms\tpicco MB');
  for (const engine of ['rust','js']) for (const n of names){ const L=out.filter(m=>m.asked===engine && m.file===n && !m.error); if (!L.length) continue;
    console.log([engine, n, L[0].MB, [...new Set(L.map(m=>m.engine))].join('/'), med(L.map(m=>m.readMs)), med(L.map(m=>m.worstStallMs)), L[0].longTaskMaxMs==null?'n.d.':med(L.map(m=>m.longTaskMaxMs)), GRAFICO?med(L.map(m=>m.clickToGraphMs)):'-', med(L.map(m=>m.peakMB))].join('\t')); }
  // criteri della 3.0.0 (PROGETTO-DESKTOP §5): 1M punti dal clic al grafico ≤ 5 s, multicanale da 50 MB ≤ 5 s, nessun blocco oltre 50 ms
  console.log('\ncriteri (mediane):');
  for (const engine of ['rust','js']) for (const n of names){ const L=out.filter(m=>m.asked===engine && m.file===n && !m.error); if (!L.length) continue;
    const g=med(L.map(m=>m.clickToGraphMs)), r=med(L.map(m=>m.readMs)), lt=L[0].longTaskMaxMs==null ? null : med(L.map(m=>m.longTaskMaxMs));
    const t=GRAFICO ? ['clic→grafico ≤ 5 s', g!=null && g<=5000, g] : ['lettura ≤ 5 s (usa --grafico per clic→grafico)', r<=5000, r];
    console.log(`${engine}\t${n}\t${t[0]}: ${t[1]?'OK':'NO'} (${t[2]} ms)\tblocco lungo ≤ 50 ms: ${lt==null?'n.d. (WebView senza API, es. macOS)':(lt<=50?'OK':'NO')+' ('+lt+' ms)'}`); }
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(out,null,1));
  fs.rmSync(base,{recursive:true,force:true});
})();
