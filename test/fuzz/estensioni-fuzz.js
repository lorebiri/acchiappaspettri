// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Fuzzing delle estensioni (I11, R16): pacchetti .acchplugin, lettori dichiarativi (manifesto e interprete), moduli WebAssembly,
   controllo dell'uscita. Ogni caso nasce da un seme ed è riproducibile: --replay <seme-del-caso>.
   Che cosa è un difetto (crash):
   - un'eccezione diversa da PluginError nei controlli della pagina (parsePackage, validateReaderSpec, checkWasm, validateOutput, compareExpected);
   - un'eccezione dell'interprete dichiarativo DECL: è codice dell'app e deve sempre rispondere null, {error} o dati;
   - un'uscita accettata da validateOutput con numeri non finiti, lunghezze diverse o oltre i limiti.
   Non sono difetti, ma si contano: le eccezioni di un modulo WebAssembly mutato (nell'app diventano «errore dell'estensione»)
   e i casi oltre il tempo per caso (nell'app li ferma il tempo massimo del worker).
   Uso: node test/fuzz/estensioni-fuzz.js --seconds 3600 [--seed 1] [--workers 2] [--out cartella] [--timeout-ms 5000]
        node test/fuzz/estensioni-fuzz.js --replay <seme>    (rifà un caso e stampa l'errore)
   Le 24 ore della SPEC: più processi con semi diversi (vedi .github/workflows/fuzz-estensioni.yml). */
'use strict';
const {Worker, isMainThread, parentPort, workerData}=require('worker_threads');
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..','..');
const C=require(path.join(ROOT,'app','plugins-base.js'));
const TARGETS=['pkg','decl','wasm','out'];

/* ---------- generatori ---------- */
function rng(seed){ let s=(seed>>>0)||1; return ()=>{ s^=s<<13; s>>>=0; s^=s>>>17; s^=s<<5; s>>>=0; return s/4294967296; }; }
const caseSeed=(seed, i)=>{ let h=(seed*2654435761+i*40503)>>>0; h^=h>>>16; h=Math.imul(h,0x85ebca6b)>>>0; h^=h>>>13; return h>>>0 || 1; };
const EX=['colonne-fisse','punto-e-virgola','binario-wasm'].map(d=>{ const dir=path.join(ROOT,'examples','plugins',d), pkg=fs.readFileSync(path.join(dir,d+'.acchplugin'));
  const sample=fs.readdirSync(dir).find(n=>/^esempio-/.test(n) && !/\.json$/.test(n)); return {d, pkg, json:JSON.parse(pkg), sample:fs.readFileSync(path.join(dir,sample))}; });
const WASM=new Uint8Array(fs.readFileSync(path.join(ROOT,'examples','plugins','binario-wasm','reader.wasm')));
const SPECS=[EX[1].json.reader,
  {kind:'text', delimiter:'whitespace', comment:'#', skipLines:1, headerLine:1, x:{column:1, unit:'s'}, channels:[{column:2, name:'A'}, {column:3}], onBadLine:'skip', meta:[{name:'m', regex:'^#\\s*(.+)'}]},
  {kind:'text', delimiter:'fixed', columns:[{start:1,end:10},{start:11,end:22},{start:23,end:34}], x:{column:1}, channels:'all', signature:{regex:'^# ACCH', lines:3}},
  {kind:'binary', endian:'little', signature:{offset:0, ascii:'AWB1'}, count:{offset:4, type:'u32'}, data:{offset:8, type:'f32', columns:2, layout:'sequential'}, x:{column:1}, channels:[{column:2, name:'y'}]},
  {kind:'binary', endian:'big', count:{value:16}, data:{offset:{offset:0, type:'u16'}, type:'i16', columns:3, scale:0.01}, x:{start:{offset:2, type:'f32'}, step:1}, channels:[{column:1},{column:2},{column:3}]}];
const VALS=[null, true, false, 0, -1, 1, 2, 7, 255, 256, 65535, 65536, 2147483647, -2147483648, 4294967295, 2e6, 2e6+1, 8e6+1, 1e308, -1e308, 5e-324, 0.5,
  '', 'a', 'x'.repeat(300), '__proto__', 'constructor', '‮', '\u0000', 'fixed', 'whitespace', ',', ';', 'text', 'binary', 'f64', 'u32', 'i8', 'little', 'big', 'all', 'uv', 'interleaved', 'sequential',
  '(a+)+$', '^(a|a)*$', '.*', '\\', '[', '(?=a)', '\\1', 'import', [], [1], {}, {column:1}, {value:3}, {offset:0, type:'u8'}];
const pick=(r,a)=>a[Math.floor(r()*a.length)];
function mutBytes(r, u){ let a=Array.from(u); const n=1+Math.floor(r()*8);
  for (let k=0;k<n;k++){ const op=Math.floor(r()*6), i=Math.floor(r()*(a.length+1));
    if (op===0 && a.length) a[i%a.length]^=1<<Math.floor(r()*8);
    else if (op===1) a.splice(i,0,Math.floor(r()*256));
    else if (op===2 && a.length) a.splice(i, Math.floor(r()*Math.min(64,a.length)));
    else if (op===3 && a.length) a.splice(i,0,...a.slice(i, i+Math.floor(r()*64)));
    else if (op===4) a.splice(i,0,...Buffer.from(String(pick(r,VALS))));
    else if (a.length) a[i%a.length]=pick(r,[0,0xff,0x7f,0x80,0x22,0x5c,0x7b,0x7d]); }
  return new Uint8Array(a); }
function mutJson(r, v, depth){ depth=depth||0;
  if (r()<0.08 || depth>6) return JSON.parse(JSON.stringify(pick(r,VALS)===undefined?null:pick(r,VALS)));
  if (Array.isArray(v)){ const a=v.map(x=>r()<0.3?mutJson(r,x,depth+1):x); if (r()<0.1) a.push(mutJson(r,pick(r,VALS),depth+1)); if (r()<0.1) a.splice(Math.floor(r()*a.length),1); if (r()<0.03) return Array.from({length:70},()=>a[0]); return a; }
  if (v && typeof v==='object'){ const o={}; for (const k of Object.keys(v)){ if (r()<0.05) continue; o[k]=r()<0.35?mutJson(r,v[k],depth+1):v[k]; }
    if (r()<0.08) o[pick(r,['extra','kind','x','channels','count','data','__proto__','signature'])]=mutJson(r,pick(r,VALS),depth+1); return o; }
  if (typeof v==='number') return pick(r,[v+1, v-1, -v, v*1000, Math.floor(r()*1e6), pick(r,VALS)]);
  if (typeof v==='string') return r()<0.5 ? pick(r,VALS) : v.slice(0, Math.floor(r()*v.length))+String(pick(r,VALS));
  return pick(r,VALS); }
function randBytes(r, base){ if (base && r()<0.7) return mutBytes(r, base); const n=Math.floor(r()*r()*4096), u=new Uint8Array(n); for (let i=0;i<n;i++) u[i]=Math.floor(r()*256); return u; }
function randOut(r){ const t=Math.floor(r()*5);
  if (t===0) return mutJson(r, {x:[1,2,3,4,5], y:[1,2,3,4,5], meta:['a']});
  const n=Math.floor(r()*12), ch=Math.floor(r()*4);
  const arr=()=>{ const a=r()<0.3?new Float64Array(n):new Array(n); for (let i=0;i<n;i++) a[i]=r()<0.02?pick(r,[NaN,Infinity,-Infinity,'1',null,undefined,{}]):r()*100; return r()<0.05?{length:pick(r,[n,-1,1e9,NaN])}:a; };
  return {channels:Array.from({length:ch},()=>({name:r()<0.5?pick(r,VALS):'c', x:arr(), y:r()<0.1?Array.from({length:n+1},()=>1):arr(), meta:r()<0.5?[pick(r,VALS)]:pick(r,VALS)})), technique:pick(r,VALS), sample:pick(r,VALS), meta:pick(r,VALS)}; }

/* ---------- controlli ---------- */
class Crash extends Error{}
const allowed=e=>e instanceof C.PluginError;
function checkValidated(v){ if (v.none || v.error!=null){ if (v.error!=null && typeof v.error!=='string') throw new Crash('error non stringa'); return; }
  if (!Array.isArray(v.channels) || !v.channels.length || v.channels.length>C.LIMITS.channels) throw new Crash('canali accettati non validi');
  let tot=0; for (const c of v.channels){ if (!(c.xs instanceof Float64Array) || !(c.ys instanceof Float64Array) || c.xs.length!==c.ys.length || c.xs.length<C.LIMITS.minPoints) throw new Crash('lunghezze accettate non valide');
    tot+=c.xs.length; for (let i=0;i<c.xs.length;i++) if (!Number.isFinite(c.xs[i]) || !Number.isFinite(c.ys[i])) throw new Crash('numero non finito accettato'); }
  if (tot>C.LIMITS.points) throw new Crash('troppi punti accettati'); }
function page(fn){ try{ return {ok:true, v:fn()}; }catch(e){ if (allowed(e)) return {ok:false}; throw e; } }
function validated(raw){ const r=page(()=>C.validateOutput(raw, {techniques:['uv','raman','ftir','gen']})); if (r.ok) checkValidated(r.v); return r; }
/* un caso: restituisce {target, accepted, handled} oppure lancia (difetto) */
function runCase(seed){ const r=rng(seed), target=TARGETS[seed%TARGETS.length], st={target, accepted:false, handled:0};
  if (target==='pkg'){ const ex=pick(r,EX); let input;
    if (r()<0.5) input=mutBytes(r, ex.pkg); else { const j=mutJson(r, JSON.parse(JSON.stringify(ex.json))); input=new TextEncoder().encode(JSON.stringify(j)); }
    const p=page(()=>C.parsePackage(input)); if (!p.ok) return st; st.accepted=true; const P=p.v;
    if (!['js','declarative','wasm'].includes(P.kind) || typeof P.code!=='string' || P.manifest.extensions.some(e=>C.RESERVED.has(e))) throw new Crash('pacchetto accettato non valido');
    if (P.kind==='declarative'){ const raw=C.DECL(P.reader, randBytes(r, ex.sample), 'x'); validated(raw); }
    for (const x of P.examples) page(()=>C.compareExpected({channels:[{name:'', xs:new Float64Array(5), ys:new Float64Array(5)}], technique:null}, x.expected));
    return st; }
  if (target==='decl'){ const spec=mutJson(r, JSON.parse(JSON.stringify(pick(r,SPECS)))), s=page(()=>C.validateReaderSpec(spec)); if (!s.ok) return st; st.accepted=true;
    const base=pick(r,EX).sample; for (let k=0;k<3;k++){ const raw=C.DECL(s.v, randBytes(r, base), 'x'); validated(raw); } return st; }
  if (target==='wasm'){ const u=mutBytes(r, WASM), w=page(()=>C.checkWasm(u)); if (!w.ok || !WebAssembly.validate(u)) return st; st.accepted=true;
    let raw; try{ raw=C.WASMRUN(Buffer.from(u).toString('base64'), C.LIMITS.wasmMaxPages, randBytes(r, EX[2].sample)); }catch(e){ st.handled=1; return st; }
    validated(raw); return st; }
  const v=validated(randOut(r)); st.accepted=v.ok; return st; }

/* ---------- processo principale e worker ---------- */
if (!isMainThread){
  const {seed, start, stride, shared}=workerData, A=new Int32Array(shared);   // A: [0] caso in corso (+1), [1] casi fatti, poi per target: casi, accettati, gestiti
  for (let i=start;;i+=stride){ const cs=caseSeed(seed, i); Atomics.store(A,0,i+1);
    try{ const s=runCase(cs), t=TARGETS.indexOf(s.target); Atomics.add(A,2+3*t,1); if (s.accepted) Atomics.add(A,3+3*t,1); if (s.handled) Atomics.add(A,4+3*t,1); }
    catch(e){ parentPort.postMessage({crash:true, i, caseSeed:cs, target:TARGETS[cs%TARGETS.length], error:String(e && e.stack || e).slice(0,2000)}); }
    Atomics.add(A,1,1); }
}
else if (require.main===module){
  const arg=(k,d)=>{ const i=process.argv.indexOf(k); return i>0 ? process.argv[i+1] : d; };
  if (process.argv.includes('--replay')){ const s=+arg('--replay'); try{ console.log(runCase(s)); }catch(e){ console.error(e); process.exit(1); } process.exit(0); }
  const SECONDS=+arg('--seconds',60), SEED=+arg('--seed',1), W=Math.max(1, +arg('--workers',1)), OUT=path.resolve(arg('--out', path.join(ROOT,'test','fuzz','esiti'))), TMO=+arg('--timeout-ms',5000);
  fs.mkdirSync(OUT, {recursive:true});
  const t0=Date.now(), crashes=[], timeouts=[], slots=[];
  const start=(k, from)=>{ const shared=new SharedArrayBuffer(4*(2+3*TARGETS.length)), w=new Worker(__filename, {workerData:{seed:SEED, start:from, stride:W, shared}});
    const s={k, w, A:new Int32Array(shared), last:-1, since:Date.now(), base:slots[k] ? slots[k].done() : {cases:0, per:TARGETS.map(()=>[0,0,0])}};
    s.done=()=>({cases:s.base.cases+Atomics.load(s.A,1), per:TARGETS.map((_,t)=>[0,1,2].map(j=>s.base.per[t][j]+Atomics.load(s.A,2+3*t+j)))});
    w.on('message', m=>{ if (m.crash && crashes.length<200){ crashes.push(m); fs.writeFileSync(path.join(OUT,'crash-'+m.caseSeed+'.json'), JSON.stringify(m,null,1)); } });
    w.on('error', e=>{ crashes.push({crash:true, error:'worker: '+String(e && e.stack || e)}); });
    slots[k]=s; return s; };
  for (let k=0;k<W;k++) start(k, k);
  const iv=setInterval(()=>{ const now=Date.now();
    for (const s of slots){ const cur=Atomics.load(s.A,0)-1; if (cur!==s.last){ s.last=cur; s.since=now; continue; }
      if (now-s.since>TMO){ const cs=caseSeed(SEED, cur); timeouts.push({i:cur, caseSeed:cs, target:TARGETS[cs%TARGETS.length]}); s.w.terminate(); start(s.k, cur+W); } }
    if (now-t0>=SECONDS*1000){ clearInterval(iv); finish(); } }, 250);
  async function finish(){ const tot=slots.map(s=>s.done()); for (const s of slots) await s.w.terminate();
    const per={}; TARGETS.forEach((t,j)=>{ per[t]={cases:0, accepted:0, handled:0}; for (const d of tot){ per[t].cases+=d.per[j][0]; per[t].accepted+=d.per[j][1]; per[t].handled+=d.per[j][2]; } });
    const rep={tool:'test/fuzz/estensioni-fuzz.js', startedAt:new Date(t0).toISOString(), seconds:Math.round((Date.now()-t0)/1000), seed:SEED, workers:W, node:process.version,
      cases:tot.reduce((a,d)=>a+d.cases,0), perTarget:per, crashes:crashes.length, timeouts:timeouts.length, timeoutCases:timeouts.slice(0,50), crashCases:crashes.slice(0,20).map(c=>({caseSeed:c.caseSeed, target:c.target, error:String(c.error).split('\n')[0]}))};
    fs.writeFileSync(path.join(OUT,'rapporto-'+SEED+'.json'), JSON.stringify(rep,null,1)+'\n'); console.log(JSON.stringify(rep,null,1)); process.exit(crashes.length?1:0); }
}
module.exports={runCase, caseSeed, TARGETS};
