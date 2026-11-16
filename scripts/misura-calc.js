// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I7: tempi dei calcoli di picchi e aree, JS (nucleo di index.html in V8) contro Rust (acch-core-cli --calc, solo il calcolo e la
// risposta wire, senza l'IPC dell'app). Spettro sintetico di 1M punti (test/unit/motore-dati.js). Uso: node scripts/misura-calc.js [--runs 3] [--n 1000000]
'use strict';
const fs=require('fs'), path=require('path'), os=require('os'), vm=require('vm'), {execFileSync}=require('child_process');
const ROOT=path.join(__dirname,'..'), TAURI=path.join(ROOT,'src-tauri'), arg=(k,d)=>{ const i=process.argv.indexOf(k); return i>0 ? +process.argv[i+1] : d; };
const RUNS=arg('--runs',3), N=arg('--n',1e6);
// --app <eseguibile e2e>: le stesse misure nell'app vera (scenario «calcolo» di test/e2e/e2e-page.js), IPC compreso, contro il worker JS
const APP=(()=>{ const i=process.argv.indexOf('--app'); return i>0 ? process.argv[i+1] : null; })();
if (APP){ const base=fs.mkdtempSync(path.join(os.tmpdir(),'acch-calc-app-')), home=path.join(base,'home'), dir=path.join(base,'dati'); fs.mkdirSync(home); fs.mkdirSync(dir);
  const env=Object.assign({}, process.env, {HOME:home, CFFIXED_USER_HOME:home, XDG_DATA_HOME:path.join(home,'.local','share'), XDG_CONFIG_HOME:path.join(home,'.config'), ACCH_E2E_DIR:dir, ACCH_E2E_SCENARIO:'calcolo', ACCH_RUST:'1'});
  const t=Date.now(); try{ execFileSync(APP, [], {env, stdio:'ignore', timeout:1800000}); }catch(e){}
  const r=JSON.parse(fs.readFileSync(path.join(dir,'e2e-report.json'),'utf8')); fs.rmSync(base,{recursive:true,force:true});
  console.log('app '+r.version+' ('+r.os+'), '+((Date.now()-t)/1000).toFixed(0)+' s, carico '+os.loadavg().map(v=>v.toFixed(1)).join(' ')+', controlli '+JSON.stringify(r.checks));
  console.log('funzione\targomenti\tRust+IPC ms (3 prove)\tworker JS ms (3 prove)\trisultati');
  for (const c of r.calcolo||[]) console.log([c.fn, c.args, c.rustMed+' ('+c.rustMs.join(' ')+')', c.workerMed+' ('+c.workerMs.join(' ')+')', c.same].join('\t'));
  for (const z of r.zip||[]) console.log(z.kind+': Rust '+z.rustMed+' ms ('+z.rustMs.join(' ')+'), blocco max '+z.rustWorstStallMs+' ms · JSZip '+z.jszipMed+' ms ('+z.jszipMs.join(' ')+'), blocco max '+z.jszipWorstStallMs+' ms');
  if (r.exception) console.log('eccezione', r.exception);
  process.exit(0); }
const {coreModules, extractCore}=require('./core-extract.js'), big=require('../test/unit/motore-dati.js');
const html=fs.readFileSync(path.join(ROOT,'index.html')), C={console, Float64Array, Math, TextEncoder, TextDecoder, DataView, ArrayBuffer, Uint8Array, Map, Set, JSON}; vm.createContext(C);
for (const m of coreModules(html).concat(['app/calc-core.js'])) vm.runInContext(fs.readFileSync(path.join(ROOT,m),'utf8'), C); vm.runInContext(extractCore(html).toString('utf8'), C);
const b=big.spectrum(N); C.__a=[b.buffer.slice(b.byteOffset, b.byteOffset+b.length), 'g.txt']; const s=vm.runInContext('AcchRead.spectra(AcchRead.read(__a[0], __a[1], {}))[0]', C);
const xs=s.xs, ys=s.ys; C.__s=[xs, ys];
// il JS si misura anche fuori dal vm (come nel worker: funzioni globali normali, V8 ottimizza meglio)
const F=new Function(extractCore(html).toString('utf8')+';return {findPeaks, peakAreas, sgSmooth, derivLS, noiseSigma};')();
const pk=vm.runInContext('findPeaks(__s[0], __s[1], 1, 1, 60).map(p=>p.x)', C), m=Math.round(N/200);
const J=[['findPeaks',[xs,ys,1,2,20]], ['peakAreas',[xs,ys,pk]], ['sgSmooth',[ys,2*Math.min(200,Math.round(N/400))+1]], ['sgSmooth',[ys,11]], ['derivLS',[xs,ys,m]], ['derivLS',[xs,ys,8]], ['noiseSigma',[ys]]];
execFileSync('cargo',['build','--release','-q','-p','acch-core','--bin','acch-core-cli'],{cwd:TAURI, stdio:'inherit'});
const exe=path.join(TAURI,'target','release','acch-core-cli'+(process.platform==='win32'?'.exe':'')), tmp=fs.mkdtempSync(path.join(os.tmpdir(),'acch-misura-'));
const med=a=>a.slice().sort((p,q)=>p-q)[a.length>>1];
console.log('n='+N+', '+RUNS+' prove, carico '+os.loadavg().map(v=>v.toFixed(1)).join(' '));
console.log('funzione\targomenti\tJS ms\tRust ms\trichiesta MB');
for (const [fn,args] of J){ C.__f=[fn,args]; const js=[], ru=[];
  for (let r=0;r<RUNS;r++){ const t=process.hrtime.bigint(); F[fn](...args); js.push(Number(process.hrtime.bigint()-t)/1e6); }
  const req=vm.runInContext('AcchCalc.encode(__f[0], __f[1])', C), q=path.join(tmp,'q.acq'); fs.writeFileSync(q, req);
  for (let r=0;r<RUNS;r++) ru.push(+execFileSync(exe,['--calc', path.join(tmp,'o'), q]).toString().split('\t')[2]);
  console.log(fn+'\t'+args.filter(a=>typeof a==='number').join(',')+'\t'+med(js).toFixed(1)+' ('+js.map(v=>v.toFixed(0)).join(' ')+')\t'+med(ru).toFixed(1)+' ('+ru.map(v=>v.toFixed(0)).join(' ')+')\t'+(req.length/1e6).toFixed(1)); }
fs.rmSync(tmp,{recursive:true,force:true});
