// R5 (parte Node): lettura e riconoscimento di ogni file del corpus come in addEntries, contro test/corpus/atteso.json.
// assess() vive fuori dal nucleo (usa lo stato dell'interfaccia): i ⛔ di assess si controllano in r5-corpus-ui.test.js (browser).
'use strict';
const test=require('node:test'), assert=require('node:assert');
const C=require('./core.js'), L=require('./corpus-lib.js');

function nodeRows(){
  return Object.entries(L.ATTESO.file).map(([rel,exp])=>{ let rec; try{ rec=L.importNode(C, rel); }catch(e){ rec={scartato:'ECCEZIONE '+e.message}; }
    const warns=[].concat(rec.importBad||[], rec.importNotes||[]); const ev=L.evaluate(rec, exp, {node:true, stops:rec.stopImport, warns});
    return {rel, categoria:exp.categoria, avverso:exp.avverso, rec, ...ev}; });
}
module.exports={nodeRows};

if (require.main===module){
  const rows=nodeRows();
  test(`R5 corpus: ${rows.length} file (${rows.filter(r=>r.avverso).length} avversi), almeno 60 avversi`, ()=>{ assert.ok(rows.filter(r=>r.avverso).length>=60); });
  test('R5 corpus (Node): file puliti letti e riconosciuti bene, senza ⛔ di lettura', ()=>{
    const bad=rows.filter(r=>r.categoria==='pulito' && !r.ok); assert.deepStrictEqual(bad.map(r=>`${r.rel}: ${r.esito} ${r.motivi.join('; ')}`), []); });
  test('R5 corpus (Node): file da rifiutare rifiutati', ()=>{
    const bad=rows.filter(r=>r.categoria==='scarto' && !r.ok); assert.deepStrictEqual(bad.map(r=>`${r.rel}: ${r.motivi.join('; ')}`), []); });
  test('R5 corpus (Node): nessuna eccezione in lettura', ()=>{
    const bad=rows.filter(r=>/ECCEZIONE/.test(r.rec.scartato||'')); assert.deepStrictEqual(bad.map(r=>`${r.rel}: ${r.rec.scartato}`), []); });
  test('R5 corpus (Node): elenco dei casi rinviati al controllo nel browser (informativo)', (t)=>{
    const d=rows.filter(r=>r.esito==='rinviato'); t.diagnostic(`${d.length} file decisi solo da assess: ${d.map(r=>r.rel).join(', ')}`); });
}
