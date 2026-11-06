// R5 (browser): ogni file del corpus nell'app vera, con assess(). Dichiara 0 errori silenziosi e 0 ⛔ falsi.
// Uso: PW_CHANNEL=chrome node --test test/validation/r5-corpus-ui.test.js   (Chrome in un'istanza propria; senza PW_CHANNEL usa Chromium di Playwright)
// Scrive il riepilogo in test/validation/out/corpus-ui.json (per il golden R8 e per il rapporto).
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path');
const L=require('./corpus-lib.js'), U=require('./corpus-ui.js'), G=require('./golden.js');

function rowsFrom(records){
  return Object.entries(L.ATTESO.file).map(([rel,exp])=>{ const rec=records[rel]||{scartato:'non eseguito'};
    const warns=(rec.assess||[]).filter(a=>a.lv==='warn'||a.lv==='bad').map(a=>a.t).concat(rec.importBad||[], rec.scartato?[rec.scartato]:[]);
    return {rel, categoria:exp.categoria, avverso:exp.avverso, ...L.evaluate(rec, exp, {stops:U.stopsOf(rec), warns}), errori:rec.errori||[]}; });
}
// riduzione per il golden R8: ciò che l'utente vede (tecnica, punti, avvisi con il livello, picchi)
const r6=v=>v==null||!Number.isFinite(+v)?v:+(+v).toPrecision(6);
function goldenOf(records){ const o={}; for (const [k,r] of Object.entries(records)) o[k]=r.scartato ? {scartato:r.scartato} :
  {instr:r.instr, n:r.n, xMax:r6(r.xMax), yMax:r6(r.yMax), avvisi:(r.assess||[]).filter(a=>a.lv!=='ok').map(a=>a.lv+': '+a.t), picchi:(r.peaks||[]).map(q=>[q.x,q.y,q.area])}; return o; }
module.exports={rowsFrom, goldenOf};

if (require.main===module){
  let rows=null, records=null;
  test.before(async ()=>{ records=await U.runCorpus(Object.keys(L.ATTESO.file)); rows=rowsFrom(records);
    fs.mkdirSync(path.join(__dirname,'out'),{recursive:true}); fs.writeFileSync(path.join(__dirname,'out','corpus-ui.json'), JSON.stringify({records, rows},null,1)); }, {timeout:30*60*1000});
  const list=(k)=>rows.filter(r=>r.esito===k).map(r=>`${r.rel}: ${r.motivi.join('; ')}`);
  test('R5 browser: 0 errori silenziosi (valori sbagliati senza alcun avviso)', ()=>{ assert.deepStrictEqual(list('silenzioso'), []); });
  test('R5 browser: valori sbagliati con solo ⚠ (serve ⛔)', ()=>{ assert.deepStrictEqual(list('solo_avviso'), []); });
  test('R5 browser: 0 ⛔ falsi sui file puliti', ()=>{ assert.deepStrictEqual(list('stop_falso'), []); });
  test('R5 browser: avvisi obbligatori presenti', ()=>{ assert.deepStrictEqual(list('avviso_mancante'), []); });
  test('R5 browser: file da rifiutare rifiutati', ()=>{ assert.deepStrictEqual(list('scarto_mancante'), []); });
  test('R8 golden del corpus nel browser (avvisi, picchi, aree)', ()=>{ assert.deepStrictEqual(G.compare('corpus-ui', goldenOf(records)), []); });
  test('R5 browser: nessun errore JavaScript nella pagina', ()=>{ assert.deepStrictEqual(rows.filter(r=>r.errori.length).map(r=>`${r.rel}: ${r.errori[0].slice(0,200)}`), []); });
}
