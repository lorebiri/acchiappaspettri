// R8: riferimenti golden. Se un benchmark o la lettura del corpus cambiano, il test fallisce finché il golden non è
// aggiornato di proposito (AGGIORNA_GOLDEN=1). I benchmark sono deterministici con N=20 (verificato: uscita identica fra esecuzioni).
// Uso: node --test test/validation/r8-golden.test.js   (BENCH_XRF=1 include anche xrf-fp-benchmark, lento)
'use strict';
const test=require('node:test'), assert=require('node:assert'), path=require('path'), {execFileSync}=require('child_process');
const G=require('./golden.js'), C=require('./core.js'), L=require('./corpus-lib.js');
const ROOT=path.join(__dirname,'..','..');
const BENCH=['peak-benchmark.js','area-benchmark.js','analysis-benchmark.js','format-test.js'].concat(process.env.BENCH_XRF==='1'?['xrf-fp-benchmark.js']:[]);

function runBench(f){
  // ACCH_INDEX non vale per i benchmark (leggono index.html della propria cartella): per una copia sabotata si usa BENCH_ROOT
  const dir=process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : ROOT;
  const out=execFileSync(process.execPath, [path.join(dir,'test',f)], {encoding:'utf8', maxBuffer:1<<26, env:Object.assign({}, process.env, {N:'20'}), stdio:['ignore','pipe','pipe'], timeout:20*60*1000});
  return out.split('\n').map(l=>l.replace(/\s+$/,'')).filter(l=>l && !/ExperimentalWarning|--trace-warnings/.test(l));
}
const r6=v=>v==null||!Number.isFinite(+v)?v:+(+v).toPrecision(6);
function corpusNode(){
  const o={};
  for (const rel of Object.keys(L.ATTESO.file)){ let r; try{ r=L.importNode(C, rel); }catch(e){ r={eccezione:e.message}; }
    o[rel]=r.scartato||r.eccezione ? {scartato:r.scartato||r.eccezione} : {instr:r.instr, kind:r.kind, n:r.n, x0:r6(r.x0), xN:r6(r.xN), xMax:r6(r.xMax), yMax:r6(r.yMax), xMin:r6(r.xMin), yMin:r6(r.yMin),
      stop:r.stopImport, importBad:r.importBad.length, importIssue:r.importIssue}; }
  return o;
}
module.exports={corpusNode};

if (require.main===module){
  for (const f of BENCH) test(`R8 golden del benchmark ${f} (N=20)`, {timeout:25*60*1000}, ()=>{ assert.deepStrictEqual(G.compare('bench-'+f.replace(/\.js$/,''), runBench(f)), []); });
  test('R8 golden della lettura del corpus (Node: tecnica, punti, estremi, massimo, avvisi di lettura)', ()=>{ assert.deepStrictEqual(G.compare('corpus-node', corpusNode()), []); });
}
