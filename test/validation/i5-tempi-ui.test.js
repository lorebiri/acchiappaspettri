// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I5, tempi d'orologio (dal caricamento al grafico ≤ 5 s): si esegue da solo (npm run test:validation:tempi), fuori da test:validation:ui,
// perché un tempo d'orologio dipende dal carico della macchina; il criterio vero si misura nell'app con scripts/misura-motore.js.
// I5, motore del desktop: le letture girano nel worker del nucleo (core-worker.js) e danno lo stesso risultato della pagina;
// con il lettore Rust (risposte vere di acch-core-cli) il risultato è identico; se il Rust dà errore o una risposta che non torna
// si legge con il JS e lo si scrive nel registro; ACCH_DUAL scopre una differenza che la sonda non vede; la finestra non si blocca
// oltre 50 ms durante la lettura di 1M punti; «Annulla la lettura»; trascinamento nativo senza copie; l'online resta com'era.
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), os=require('os'), {execFileSync}=require('child_process');
const B=require('./browser.js'), {openDesk}=require('./tauri-mock.js'), D=require('../unit/motore-dati.js');
const ROOT=path.join(__dirname,'..','..'), TAURI=path.join(ROOT,'src-tauri');

// file serviti alla pagina da /__dati/<nome> (niente base64 per decine di MB)
const DATA=new Map();
const add=(name, buf)=>{ DATA.set(name, Buffer.from(buf)); return name; };
for (const rel of ['canali/STD1.D/DAD1A.ch','canali/waters-2canali.arw','canali/shimadzu-2canali.txt']) add(path.basename(rel), fs.readFileSync(path.join(ROOT,'test','fixtures',rel)));
for (const [n,b] of Object.entries(D.files())) if (!/50MB/.test(n)) add(n, b);
add('dad.uv', D.uv(3000)); add('medio.txt', D.spectrum(30000)); add('shimadzu-2x1M.txt', D.shimadzu(1e6, ['Detector A-Ch1','Detector B-Ch1']));
add('corpus.txt', fs.readFileSync(path.join(ROOT,'test','corpus','generale','ft_A.csv')));
// risposte vere del lettore Rust (acch-core-cli), se cargo c'è
let WIRES=null;
function wires(){ if (WIRES) return WIRES; WIRES=new Map();
  try{ execFileSync('cargo',['build','--release','-q','-p','acch-core','--bin','acch-core-cli'],{cwd:TAURI, stdio:'ignore'}); }catch(e){ return WIRES; }
  const exe=path.join(TAURI,'target','release','acch-core-cli'+(process.platform==='win32'?'.exe':'')), tmp=fs.mkdtempSync(path.join(os.tmpdir(),'acch-i5-'));
  try{ const names=[...DATA.keys()], inp=names.map(n=>{ const p=path.join(tmp,n); fs.writeFileSync(p, DATA.get(n)); return p; }); execFileSync(exe,[path.join(tmp,'out')].concat(inp));
    names.forEach((n,i)=>WIRES.set(n, fs.readFileSync(path.join(tmp,'out',i+'.acw')))); }
  finally{ fs.rmSync(tmp,{recursive:true,force:true}); }
  return WIRES; }

async function page(br, server, desk){ const o=desk ? await openDesk(B, br, server) : await B.openPage(br, server);
  await o.p.route('**/__dati/**', r=>{ const n=decodeURIComponent(r.request().url().split('/__dati/')[1]); const b=DATA.get(n)||(n.startsWith('wire/')&&WIRES&&WIRES.get(n.slice(5))); return b ? r.fulfill({body:b, contentType:'application/octet-stream'}) : r.fulfill({status:404, body:''}); });
  await o.p.evaluate(()=>{ window.I5={ get:n=>fetch('/__dati/'+encodeURIComponent(n)).then(r=>{ if (!r.ok) throw new Error('404 '+n); return r.arrayBuffer(); }),
    // il lettore Rust finto risponde con la risposta vera di acch-core-cli per quel file
    rustFromCli(){ __mock.engine={rust:true, dual:false}; __mock.rustRead=async(body, h)=>{ const n=decodeURIComponent(h['x-acch-name']); const r=await fetch('/__dati/wire/'+encodeURIComponent(n)); if (!r.ok) throw 'decline-test'; return await r.arrayBuffer(); }; },
    longTasks(){ const L=[]; const ob=new PerformanceObserver(l=>l.getEntries().forEach(e=>L.push(Math.round(e.duration)))); ob.observe({type:'longtask'}); return ()=>{ ob.disconnect(); return L; }; },
    log(){ return AcchSegnalaCore.log.list().map(e=>e.msg); } }; });
  return o; }

/* «Nessun blocco oltre 50 ms» si misura con il tempo di CPU del thread principale di ogni compito (traccia di Chromium, tdur di RunTask),
   non con il tempo dell'orologio: con il Mac carico dagli altri agenti un compito di 20 ms di calcolo può durare 60 ms d'orologio perché il
   sistema toglie la CPU al browser. Il tempo di CPU dice quanto lavoro fa la pagina in un colpo solo, che è ciò che il codice controlla;
   il criterio vero, in tempo d'orologio, si misura sul PC di riferimento (scripts/misura-motore.js). Segni nella pagina (performance.mark)
   indicano l'inizio della finestra misurata e i disegni del grafico, che si contano a parte (lavoro della I6). */
async function cpuTasks(o, run, arg){
  await br.startTracing(o.p, {categories:['devtools.timeline','disabled-by-default-devtools.timeline','blink.user_timing']});
  let out; try{ out=await o.p.evaluate(run, arg); } finally { var buf=await br.stopTracing(); }
  const ev=JSON.parse(buf.toString()).traceEvents, main=ev.filter(e=>e.name==='thread_name' && e.args && e.args.name==='CrRendererMain');
  const marks=ev.filter(e=>e.cat && e.cat.includes('blink.user_timing')), pid=marks.length ? marks[0].pid : main[0].pid, th=main.find(e=>e.pid===pid);
  const at=n=>marks.filter(e=>e.name===n).map(e=>e.ts).sort((a,b)=>a-b), t0=at('i5-da')[0], t1=at('i5-a')[0], da=at('i5-disegno'), db=at('i5-disegno-fine');
  const tasks=ev.filter(e=>e.pid===pid && e.tid===th.tid && e.name==='RunTask' && e.ph==='X' && e.ts>=t0 && e.ts<=t1)
    .map(e=>({ms:+(e.dur/1000).toFixed(1), cpu:+((e.tdur!=null?e.tdur:e.dur)/1000).toFixed(1), draw:da.some((a,i)=>a<e.ts+e.dur && db[i]>e.ts)}));
  if (!tasks.length) console.log('traccia:', {main:main.length, marks:marks.map(e=>e.name+'@'+e.pid).slice(0,8), pid, t0, t1, eventi:ev.length});
  return {out, tasks}; }

let server, br;
test.before(async()=>{ server=await B.startServer(); br=await B.launch(); });
test.after(async()=>{ await br.close(); server.close(); });

test('1M punti dal caricamento al grafico disegnato in ≤ 5 s; il controllo del dato arriva dopo il grafico', async()=>{
  const o=await page(br, server, true);
  const r=await o.p.evaluate(async()=>{ const b=await I5.get('grande-1M.txt'); await AcchEngine.read(new ArrayBuffer(8),'riscalda.txt',{});
    let drawn=0; const od=window.drawPlot; window.drawPlot=function(){ const x=od.apply(this,arguments); if (!drawn) drawn=performance.now(); return x; };
    const t0=performance.now(), add=addEntries([{file:new File([b],'grande.txt'), path:'grande.txt'}]);
    const done=await Promise.race([add.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))))), new Promise(r=>setTimeout(()=>r(false), 60000))]);
    const ms=performance.now()-t0, early=QBAD.has(files[0]&&files[0].id);
    for (let i=0;i<200 && !(files[0] && QBAD.has(files[0].id));i++) await new Promise(r=>setTimeout(r,50));
    return {done, ms, drawn:drawn-t0, early, later:!!(files[0] && QBAD.has(files[0].id)), n:files[0]&&files[0].xs.length}; });
  assert.ok(r.done, 'oltre 60 s'); assert.equal(r.n, 1e6);
  assert.ok(r.ms<=5000, 'dal caricamento al grafico '+Math.round(r.ms)+' ms (primo disegno a '+Math.round(r.drawn)+' ms)');
  assert.equal(r.early, false, 'il controllo del dato non deve stare prima del grafico'); assert.ok(r.later, 'controllo del dato fatto dopo');
  await o.ctx.close();
});

