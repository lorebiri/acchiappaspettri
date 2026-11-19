// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I5, test incrociati JS ↔ Rust (ACCH_DUAL=1): acch-core-cli legge il corpus di test e i file grandi sintetici, AcchRead.fromWire
// ne ricava il risultato e lo si confronta con il lettore JS di riferimento (AcchRead.read): numeri bit per bit, stesse chiavi,
// picchi entro 1e-12. Senza ACCH_DUAL=1 il test si salta (serve cargo); la CI lo esegue sui tre sistemi (.github/workflows/ci.yml).
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), os=require('os'), vm=require('vm'), {execFileSync}=require('child_process');
const ROOT=path.join(__dirname,'..','..'), TAURI=path.join(ROOT,'src-tauri');
const ON=process.env.ACCH_DUAL==='1';
const {coreModules, extractCore}=require('../../scripts/core-extract.js');
const big=require('./motore-dati.js');

// nucleo come nel worker: moduli app/*-core.js, poi core.js
function core(){ const html=fs.readFileSync(path.join(ROOT,'index.html')), ctx={console, Float64Array, Float32Array, Uint8Array, Int16Array, Int32Array, Uint16Array, Uint32Array, DataView, ArrayBuffer, TextDecoder, TextEncoder, Math, Map, Set, JSON};
  vm.createContext(ctx); for (const m of coreModules(html)) vm.runInContext(fs.readFileSync(path.join(ROOT,m),'utf8'), ctx, {filename:m}); vm.runInContext(extractCore(html).toString('utf8'), ctx, {filename:'core.js'}); return ctx; }
function cli(){ const exe=path.join(TAURI,'target','release','acch-core-cli'+(process.platform==='win32'?'.exe':''));
  execFileSync('cargo',['build','--release','-q','-p','acch-core','--bin','acch-core-cli'],{cwd:TAURI, stdio:'inherit'}); return exe; }
const SKIP=/\.(json|js|py|acchspettri|opju?|xlsx|md|png|gz)$/i;
function corpus(){ const out=[]; const walk=d=>{ for (const n of fs.readdirSync(d).sort()){ const p=path.join(d,n), st=fs.statSync(p); if (st.isDirectory()) walk(p); else if (!SKIP.test(n)) out.push(p); } };
  walk(path.join(ROOT,'test','corpus')); walk(path.join(ROOT,'test','fixtures')); return out; }

test('ACCH_DUAL: lettore Rust e lettore JS identici sul corpus e sui file grandi', {skip:!ON && 'serve ACCH_DUAL=1 (e cargo)', timeout:900000}, ()=>{
  const exe=cli(), C=core(), tmp=fs.mkdtempSync(path.join(os.tmpdir(),'acch-dual-'));
  try{
    const files=corpus(); for (const [n,b] of Object.entries(big.files())){ const p=path.join(tmp,n); fs.writeFileSync(p,b); files.push(p); }
    const stat={rust:{}, js:{}}, used=new Set();
    for (const legacy of [false, true]){
      const outDir=path.join(tmp,'out'+(legacy?'L':'')); const lines=execFileSync(exe,[outDir].concat(legacy?['--legacy']:[]).concat(files),{maxBuffer:1<<26}).toString().trim().split('\n');
      assert.equal(lines.length, files.length);
      files.forEach((f,i)=>{ const buf=fs.readFileSync(f), ab=buf.buffer.slice(buf.byteOffset, buf.byteOffset+buf.length), name=path.basename(f), opt={legacy};
        const wire=fs.readFileSync(path.join(outDir,i+'.acw')), wab=wire.buffer.slice(wire.byteOffset, wire.byteOffset+wire.length);
        C.__a=[wab, ab.slice(0), name, opt]; let why=null; C.__why=w=>{ why=w; return null; };
        const R=vm.runInContext('AcchRead.fromWire(__a[0], __a[1], __a[2], __a[3], __why)', C);
        let J; C.__a=[ab.slice(0), name, opt]; try{ J=vm.runInContext('AcchRead.read(__a[0], __a[1], __a[2])', C); }catch(e){ J={threw:String(e)}; }
        const rel=path.relative(ROOT,f).replace(/\\/g,'/');
        if (R){ C.__r=[R,J]; const d=vm.runInContext('AcchRead.same(__r[0], __r[1])', C); assert.equal(d, null, rel+(legacy?' (legacy)':'')+': '+d); stat.rust[R.kind]=(stat.rust[R.kind]||0)+1; used.add(path.basename(f));
          assert.ok(!['bytes','wire','probe-numbers'].includes(why), rel+': '+why); }
        else { stat.js[why]=(stat.js[why]||0)+1;
          // una sonda rifiutata per i numeri o per i byte sarebbe una differenza vera fra i due lettori
          assert.ok(!['bytes','wire','probe-numbers'].includes(why), rel+': risposta del Rust scartata ('+why+')'); }
      }); }
    console.log('letti dal Rust', JSON.stringify(stat.rust), '· al JS', JSON.stringify(stat.js));
    // il Rust deve davvero lavorare: binari Agilent, testi multicanale e file semplici grandi
    for (const n of ['DAD1A.ch','waters-2canali.arw','shimadzu-2canali.txt','grande-1M.txt','grande-1M-decrescente.csv','dad-50MB.uv','shimadzu-50MB.txt']) assert.ok(used.has(n), n+' non letto dal Rust');
  } finally { fs.rmSync(tmp,{recursive:true,force:true}); }
});

test('ACCH_DUAL: file troncati o alterati non bloccano il lettore Rust e danno lo stesso risultato del JS', {skip:!ON && 'serve ACCH_DUAL=1 (e cargo)', timeout:600000}, ()=>{
  const exe=cli(), C=core(), tmp=fs.mkdtempSync(path.join(os.tmpdir(),'acch-dual-'));
  try{
    const src=corpus().filter(f=>/\.(ch|uv|arw|txt|csv)$/i.test(f)).slice(0,60), files=[]; let seed=11; const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; };
    src.forEach((f,i)=>{ const b=fs.readFileSync(f); for (const k of [0,1,2]){ const c=Buffer.from(b.subarray(0, Math.max(1, Math.floor(b.length*(k===0?0.5:k===1?0.97:1))))); if (k===2) for (let j=0;j<8;j++) c[Math.floor(rnd()*c.length)]^=0xFF;
      const p=path.join(tmp, i+'-'+k+'-'+path.basename(f)); fs.writeFileSync(p,c); files.push(p); } });
    const out=path.join(tmp,'out'), lines=execFileSync(exe,[out].concat(files),{maxBuffer:1<<26}).toString().trim().split('\n');
    assert.equal(lines.length, files.length, 'il lettore si è fermato');
    files.forEach((f,i)=>{ const buf=fs.readFileSync(f), ab=buf.buffer.slice(buf.byteOffset, buf.byteOffset+buf.length), name=path.basename(f).replace(/^\d+-\d-/,''), w=fs.readFileSync(path.join(out,i+'.acw'));
      C.__a=[w.buffer.slice(w.byteOffset, w.byteOffset+w.length), ab.slice(0), name, {}]; const R=vm.runInContext('AcchRead.fromWire(__a[0], __a[1], __a[2], __a[3])', C); if (!R) return;
      let J; C.__a=[ab.slice(0), name, {}]; try{ J=vm.runInContext('AcchRead.read(__a[0], __a[1], __a[2])', C); }catch(e){ J={threw:String(e)}; }
      C.__r=[R,J]; assert.equal(vm.runInContext('AcchRead.same(__r[0], __r[1])', C), null, path.basename(f)); });
  } finally { fs.rmSync(tmp,{recursive:true,force:true}); }
});
