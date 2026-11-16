// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I7, test incrociati JS ↔ Rust per picchi e aree (ACCH_DUAL=1): acch-core-cli --calc esegue findPeaks, peakAreas, sgSmooth, derivLS e
// noiseSigma di src-tauri/acch-core/src/calc.rs su tutto il corpus di test, sui file grandi sintetici e su casi limite; AcchCalc.decode
// ne ricava il valore e lo si confronta con il nucleo JS di riferimento. Criterio: stessi campi e numeri identici bit per bit
// (più stretto di 1e-12). Un «decline» del Rust (caso che calcola il JS) è ammesso solo per i motivi elencati in DECLINE_OK.
// Senza ACCH_DUAL=1 il test si salta (serve cargo); la CI lo esegue nel job native.
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), os=require('os'), vm=require('vm'), {execFileSync}=require('child_process');
const ROOT=path.join(__dirname,'..','..'), TAURI=path.join(ROOT,'src-tauri');
const ON=process.env.ACCH_DUAL==='1';
const {coreModules, extractCore}=require('../../scripts/core-extract.js');
const big=require('./motore-dati.js');

function core(){ const html=fs.readFileSync(path.join(ROOT,'index.html')), ctx={console, Float64Array, Float32Array, Uint8Array, Int16Array, Int32Array, Uint16Array, Uint32Array, DataView, ArrayBuffer, TextDecoder, TextEncoder, Math, Map, Set, JSON};
  vm.createContext(ctx); const mods=coreModules(html); if (!mods.includes('app/calc-core.js')) mods.push('app/calc-core.js');
  for (const m of mods) vm.runInContext(fs.readFileSync(path.join(ROOT,m),'utf8'), ctx, {filename:m}); vm.runInContext(extractCore(html).toString('utf8'), ctx, {filename:'core.js'}); return ctx; }
function cli(){ const exe=path.join(TAURI,'target','release','acch-core-cli'+(process.platform==='win32'?'.exe':''));
  execFileSync('cargo',['build','--release','-q','-p','acch-core','--bin','acch-core-cli'],{cwd:TAURI, stdio:'inherit'}); return exe; }
const SKIP=/\.(json|js|py|acchspettri|opju?|xlsx|md|png|gz)$/i;
function corpus(){ const out=[]; const walk=d=>{ for (const n of fs.readdirSync(d).sort()){ const p=path.join(d,n), st=fs.statSync(p); if (st.isDirectory()) walk(p); else if (!SKIP.test(n)) out.push(p); } };
  walk(path.join(ROOT,'test','corpus')); walk(path.join(ROOT,'test','fixtures')); return out; }
// motivi per cui il Rust lascia il calcolo al JS: argomenti che il JS tratta in modo particolare (NaN, vettori di lunghezze diverse…)
const DECLINE_OK=new Set(['args','nan']);

// lavori per uno spettro: le chiamate dell'analisi (vedi index.html) con sensibilità, numero di picchi, finestre e direzioni diverse
function jobs(C, xs, ys, label){ const J=[], n=ys.length; if (n<3) return J;
  const F=a=>a instanceof C.Float64Array ? a : C.Float64Array.from(a);
  xs=F(xs); ys=F(ys); const neg=C.Float64Array.from(ys, v=>-v);
  for (const dir of [1,-1]) for (const [sens,maxN] of [[2,20],[0.5,200],[5,12],[1,3]]) J.push({fn:'findPeaks', args:[xs, ys, dir, sens, maxN], label});
  const up=C.findPeaks(xs, ys, 1, 1, 60), dn=C.findPeaks(xs, ys, -1, 1, 60);
  if (up.length) J.push({fn:'peakAreas', args:[xs, ys, up.map(p=>p.x)], label}, {fn:'peakAreas', args:[xs, ys, [up[0].x]], label});
  if (dn.length) J.push({fn:'peakAreas', args:[xs, neg, dn.map(p=>p.x)], label});
  J.push({fn:'peakAreas', args:[xs, ys, [xs[0], xs[n>>1], xs[n-1]]], label});   // picchi indicati a mano, anche sui bordi
  for (const w of [5, 11, 25, 2*Math.min(200, Math.max(2, Math.round(n/40)))+1]) J.push({fn:'sgSmooth', args:[ys, w], label});
  for (const m of [1, 4, 20, Math.min(300, Math.max(65, Math.round(n/50)))]) J.push({fn:'derivLS', args:[xs, ys, m], label});
  J.push({fn:'noiseSigma', args:[ys], label});
  return J; }
// casi limite sintetici: pochi punti, costanti, gradini, valori uguali, NaN, x non equispaziate o decrescenti, numeri enormi o minuscoli
function edge(C){ const out=[]; let s=5; const r=()=>{ s=(s*16807)%2147483647; return s/2147483647; }, g=(x,c,w)=>Math.exp(-0.5*((x-c)/w)**2);
  const mk=(n, fx, fy)=>{ const xs=new C.Float64Array(n), ys=new C.Float64Array(n); for (let i=0;i<n;i++){ xs[i]=fx(i); ys[i]=fy(i, xs[i]); } return [xs, ys]; };
  const cases={
    'pochi punti': mk(8, i=>i, i=>i%3), 'nove punti': mk(9, i=>i, i=>[0,1,0,2,0,5,0,1,0][i]), costante: mk(500, i=>i, ()=>3), zero: mk(500, i=>i, ()=>0),
    gradino: mk(800, i=>i*0.1, i=>i>400?1:0), interi: mk(3000, i=>i, ()=>Math.round(r()*4)), 'x irregolari': mk(4000, i=>i+0.9*r(), (i,x)=>10*g(x,1200,15)+5*g(x,2600,40)+0.05*r()),
    decrescente: mk(4000, i=>4000-i, (i,x)=>10*g(x,1200,15)+0.05*r()), enormi: mk(2000, i=>i, (i,x)=>1e140*g(x,700,9)+1e137*r()), minuscoli: mk(2000, i=>i*1e-9, (i,x)=>1e-140*g(x,7e-7,9e-9)+1e-143*r()),
    'oltre 1e150': mk(2000, i=>i, (i,x)=>1e151*g(x,700,9)), negativi: mk(3000, i=>i, (i,x)=>-50+10*g(x,1500,30)-8*g(x,500,10)+0.1*r()),
    'picchi stretti': mk(20000, i=>i*0.01, (i,x)=>[30,60,61,120,180].reduce((a,c)=>a+g(x,c,0.03),0)+0.001*r()),
    'x uguali': mk(1000, i=>Math.floor(i/10), (i,x)=>g(x,50,5)+0.01*r()) };
  for (const [k,[xs,ys]] of Object.entries(cases)) out.push(...jobs(C, xs, ys, 'caso '+k));
  const [xs,ys]=cases['x irregolari'], nan=Float64Array.from(ys); nan[100]=NaN; const inf=C.Float64Array.from(ys); inf[7]=Infinity;
  out.push({fn:'findPeaks', args:[xs, nan, 1, 2, 20], label:'NaN'}, {fn:'sgSmooth', args:[nan, 9], label:'NaN'}, {fn:'derivLS', args:[xs, inf, 70], label:'Infinity'}, {fn:'sgSmooth', args:[inf, 151], label:'Infinity'},
    {fn:'findPeaks', args:[xs, ys, 1, 2, NaN], label:'maxN NaN'}, {fn:'findPeaks', args:[xs, ys, 1, 2, 2.7], label:'maxN 2,7'}, {fn:'findPeaks', args:[xs, ys, 1, 2, Infinity], label:'maxN ∞'},
    {fn:'findPeaks', args:[xs, ys, 1, -5, 50], label:'sens negativa'}, {fn:'peakAreas', args:[xs, ys, []], label:'nessun picco'}, {fn:'peakAreas', args:[xs, ys, [1200, 1200, -1e9, 1e9]], label:'picchi ripetuti e fuori'},
    {fn:'sgSmooth', args:[ys, 4], label:'finestra pari'}, {fn:'sgSmooth', args:[ys, 3999], label:'finestra enorme'}, {fn:'derivLS', args:[xs, ys, 0], label:'m=0'}, {fn:'derivLS', args:[xs, ys, 5000], label:'m>n'});
  return out; }

function runAll(exe, C, J, tmp){ const res=[];
  for (let a=0;a<J.length;a+=400){ const part=J.slice(a,a+400), files=[];
    part.forEach((j,k)=>{ C.__a=[j.fn, j.args]; const req=vm.runInContext('AcchCalc.encode(__a[0], __a[1])', C); assert.ok(req, j.label+' '+j.fn+': richiesta non creata'); const p=path.join(tmp,'q'+(a+k)+'.acq'); fs.writeFileSync(p, req); files.push(p); });
    const out=path.join(tmp,'r'+a), lines=execFileSync(exe,['--calc', out].concat(files),{maxBuffer:1<<26}).toString().trim().split('\n');
    assert.equal(lines.length, part.length);
    part.forEach((j,k)=>{ const ms=+lines[k].split('\t')[2], w=fs.readFileSync(path.join(out,k+'.acw')); C.__w=w.buffer.slice(w.byteOffset, w.byteOffset+w.length);
      res.push({j, R:vm.runInContext('AcchCalc.decode(__w)', C), ms}); fs.rmSync(files[k]); }); fs.rmSync(out,{recursive:true}); }
  return res; }

test('ACCH_DUAL: picchi, aree, lisciatura, derivata e rumore in Rust identici bit per bit al JS (corpus, file grandi, casi limite)', {skip:!ON && 'serve ACCH_DUAL=1 (e cargo)', timeout:1800000}, ()=>{
  const exe=cli(), C=core(), tmp=fs.mkdtempSync(path.join(os.tmpdir(),'acch-calc-'));
  try{
    const J=[]; let nSpec=0;
    for (const f of corpus()){ const b=fs.readFileSync(f); C.__a=[b.buffer.slice(b.byteOffset, b.byteOffset+b.length), path.basename(f)]; let r;
      try{ r=vm.runInContext('AcchRead.read(__a[0], __a[1], {})', C); }catch(e){ continue; }
      C.__r=r; const sp=vm.runInContext('AcchRead.spectra(__r)', C); for (const s of sp){ if (!s.xs || s.xs.length<3 || s.xs.length!==s.ys.length) continue; nSpec++; J.push(...jobs(C, s.xs, s.ys, path.relative(ROOT,f))); } }
    for (const [n,b] of Object.entries(big.files())) if (/\.txt$|\.csv$/.test(n)){ C.__a=[b.buffer.slice(b.byteOffset, b.byteOffset+b.length), n]; const r=vm.runInContext('AcchRead.read(__a[0], __a[1], {})', C); C.__r=r;
      for (const s of vm.runInContext('AcchRead.spectra(__r)', C)){ nSpec++; J.push(...jobs(C, s.xs, s.ys, n).filter((j,k)=>k%2===0 || j.fn!=='findPeaks')); } }
    J.push(...edge(C));
    const res=runAll(exe, C, J, tmp), stat={}, dec={};
    for (const {j, R} of res){ const key=j.fn; stat[key]=(stat[key]||0)+1;
      if (R.decline){ dec[key+':'+R.decline]=(dec[key+':'+R.decline]||0)+1; assert.ok(DECLINE_OK.has(R.decline), j.label+' '+j.fn+': decline '+R.decline); continue; }
      C.__f=[j.fn, j.args]; const ref=vm.runInContext('globalThis[__f[0]](...__f[1])', C); C.__c=[R.r, ref];
      const d=vm.runInContext('AcchCalc.same(__c[0], __c[1], 0)', C); assert.equal(d, null, j.label+' '+j.fn+'('+j.args.slice(2).join(', ')+'): '+d); }
    console.log('spettri', nSpec, '· confronti', JSON.stringify(stat), '· lasciati al JS', JSON.stringify(dec));
    // i casi lasciati al JS sono solo quelli con NaN/∞ o argomenti particolari, non il corpus
    assert.ok(Object.values(dec).reduce((a,b)=>a+b,0)<=10, 'troppi casi lasciati al JS: '+JSON.stringify(dec));
    assert.ok(nSpec>=150, 'spettri del corpus: '+nSpec);
  } finally { fs.rmSync(tmp,{recursive:true,force:true}); }
});

test('AcchCalc: richiesta rifiutata per argomenti non coperti, risposta «decline» riconosciuta', ()=>{
  const C=require('../../app/calc-core.js');
  assert.equal(C.encode('fitPeaks', [[1],[2]]), null);
  assert.equal(C.encode('findPeaks', [new Float64Array(3), [1,'a'], 1, 2, 3]), null);
  assert.equal(C.encode('sgSmooth', [new Float64Array(3)]), null, 'finestra mancante: il JS restituisce il vettore');
  const q=C.encode('findPeaks', [new Float64Array([1,2,3]), [4,5,6], 1, 2, 3]); assert.equal(String.fromCharCode(...q.subarray(0,4)), 'ACQ1'); assert.equal(q.length%8, 0);
  const j=Buffer.from('{"decline":"args"}'), w=new Uint8Array(8+j.length+((8-(8+j.length)%8)%8)); w.set([65,67,87,49]); new DataView(w.buffer).setUint32(4,j.length,true); w.set(j,8);
  assert.deepStrictEqual(C.decode(w.buffer), {decline:'args'});
  assert.equal(C.same([{x:1,y:-0}], [{x:1,y:0}], 0), '[].y: 0 / 0', 'bit per bit: −0 e +0 sono diversi');
  assert.equal(C.same([{x:1+1e-14}], [{x:1}], 1e-12), null);
});
