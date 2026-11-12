// R8: riferimenti golden. Se un benchmark o la lettura del corpus cambiano, il test fallisce finché il golden non è
// aggiornato di proposito (AGGIORNA_GOLDEN=1). I benchmark sono deterministici con N=20 (verificato: uscita identica fra esecuzioni).
// Uso: node --test test/validation/r8-golden.test.js   (BENCH_XRF=1 include anche xrf-fp-benchmark, lento)
'use strict';
const test=require('node:test'), assert=require('node:assert'), path=require('path'), os=require('os'), {spawn}=require('child_process');
const G=require('./golden.js'), C=require('./core.js'), L=require('./corpus-lib.js');
const ROOT=path.join(__dirname,'..','..');
const BENCH=['peak-benchmark.js','area-benchmark.js','analysis-benchmark.js','format-test.js'].concat(process.env.BENCH_XRF==='1'?['xrf-fp-benchmark.js']:[]);

// Il benchmark gira in un processo figlio asincrono: con execFileSync e 20 minuti fissi, sul Mac condiviso e carico (I1)
// analysis-benchmark finiva in ETIMEDOUT, e il blocco del ciclo degli eventi impediva anche al timeout del test di agire.
// Limite di sicurezza alto e regolabile (R8_LIMITE_MIN, minuti); se scatta, il messaggio dice da quanto girava e il carico.
const LIMITE_MIN=+process.env.R8_LIMITE_MIN || 90;
function runBench(f, opt){
  opt=opt||{};
  // ACCH_INDEX non vale per i benchmark (leggono index.html della propria cartella): per una copia sabotata si usa BENCH_ROOT
  const dir=process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : ROOT, script=opt.script || path.join(dir,'test',f), lim=(opt.limitMin!=null?opt.limitMin:LIMITE_MIN)*60*1000, t0=Date.now();
  return new Promise((res, rej)=>{
    const c=spawn(process.execPath, [script], {env:Object.assign({}, process.env, {N:'20'}), stdio:['ignore','pipe','pipe']}); let out='', err='';
    c.stdout.setEncoding('utf8'); c.stderr.setEncoding('utf8'); c.stdout.on('data', d=>{ out+=d; }); c.stderr.on('data', d=>{ err+=d; });
    const t=setTimeout(()=>{ c.kill(); rej(new Error(`${f}: fermato dopo ${((Date.now()-t0)/60000).toFixed(1)} minuti (limite R8_LIMITE_MIN=${lim/60000}); carico medio della macchina ${os.loadavg().map(x=>x.toFixed(1)).join(' / ')} su ${os.cpus().length} processori`)); }, lim);
    c.on('error', e=>{ clearTimeout(t); rej(e); });
    c.on('close', code=>{ clearTimeout(t); if (code!==0) return rej(new Error(`${f}: uscito con codice ${code}\n${err.slice(-2000)}`));
      res(out.split('\n').map(l=>l.replace(/\s+$/,'')).filter(l=>l && !/ExperimentalWarning|--trace-warnings/.test(l))); });
  });
}
const r6=v=>v==null||!Number.isFinite(+v)?v:+(+v).toPrecision(6);
function corpusNode(){
  const o={};
  for (const rel of Object.keys(L.ATTESO.file)){ let r; try{ r=L.importNode(C, rel); }catch(e){ r={eccezione:e.message}; }
    o[rel]=r.scartato||r.eccezione ? {scartato:r.scartato||r.eccezione} : {instr:r.instr, kind:r.kind, n:r.n, x0:r6(r.x0), xN:r6(r.xN), xMax:r6(r.xMax), yMax:r6(r.yMax), xMin:r6(r.xMin), yMin:r6(r.yMin),
      stop:r.stopImport, importBad:r.importBad.length, importIssue:r.importIssue}; }
  return o;
}
module.exports={corpusNode, runBench, LIMITE_MIN};

if (require.main===module){
  for (const f of BENCH) test(`R8 golden del benchmark ${f} (N=20)`, {timeout:(LIMITE_MIN+5)*60*1000}, async ()=>{ assert.deepStrictEqual(G.compare('bench-'+f.replace(/\.js$/,''), await runBench(f)), []); });
  test('R8 golden della lettura del corpus (Node: tecnica, punti, estremi, massimo, avvisi di lettura)', ()=>{ assert.deepStrictEqual(G.compare('corpus-node', corpusNode()), []); });
}
