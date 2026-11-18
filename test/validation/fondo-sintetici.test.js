// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Validazione della rimozione del fondo su spettri Raman SINTETICI con verità nota (test/fixtures/raman-sintetici.js):
// 100 spettri per livello di rumore, picchi noti sopra un fondo di fluorescenza noto (2–8 volte il picco più alto).
// Per ogni metodo, con i parametri preimpostati del programma (baseDefaults in index.html):
//   - errore del fondo recuperato (RMS e massimo, in % del picco più alto): mediana e 95° percentile;
//   - picchi veri ritrovati dopo la correzione (entro 3 cm⁻¹) e picchi falsi, con la ricerca dei picchi del programma;
//   - tempo medio per spettro.
// Le soglie sono il criterio di accettazione riportato in docs/VALIDAZIONE.md e in CONCLUSIONE-REPORT.md.
// Uso: node --test test/validation/fondo-sintetici.test.js   (FONDO_TABELLA=1 stampa la tabella)
const test=require('node:test'), assert=require('node:assert');
const B=require('../../app/baseline-core.js'), C=require('../unit/load-core.js'), {raman, err, quant}=require('../fixtures/raman-sintetici.js');
const METHODS=['arpls','als','imodpoly','modpoly','snip','rball'];
// soglie: mediana e 95° percentile dell'errore RMS del fondo (% del picco più alto) con rumore 1%
const LIM={arpls:[1.5,4], als:[2.5,4.5], imodpoly:[1.5,8], modpoly:[2,10], snip:[2.5,6], rball:[4.5,8]};
function run(noise, N){
  const out={};
  for (const m of METHODS) out[m]={rmse:[], max:[], found:0, total:0, fake:0, ms:0};
  for (let s=1;s<=N;s++){ const sp=raman(1000*noise+s, {noise});
    for (const m of METHODS){ const o=C.baseDefaults(m, sp.x, sp.y, 'raman'), t0=process.hrtime.bigint(), b=B.compute(m, sp.x, sp.y, o), R=out[m];
      R.ms+=Number(process.hrtime.bigint()-t0)/1e6; const e=err(b, sp.base); R.rmse.push(e.rmse); R.max.push(e.max);
      const y=Float64Array.from(sp.y, (v,i)=>v-b[i]), pk=C.findPeaks(sp.x, y, 1, 5, 30);
      // picchi veri visibili: alti almeno 5 volte il rumore e non coperti da un vicino più alto entro mezza larghezza
      const vis=sp.P.filter(p=>p.h>5*noise && !sp.P.some(q=>q!==p && q.h>p.h && Math.abs(q.c-p.c)<0.5*(p.w+q.w)));
      R.total+=vis.length; R.found+=vis.filter(p=>pk.some(q=>Math.abs(q.x-p.c)<=3)).length;
      R.fake+=pk.filter(q=>!sp.P.some(p=>Math.abs(q.x-p.c)<=Math.max(3, p.w))).length; } }
  const tab={}; for (const m of METHODS){ const R=out[m]; tab[m]={rmseMed:quant(R.rmse,0.5), rmseP95:quant(R.rmse,0.95), maxMed:quant(R.max,0.5), maxP95:quant(R.max,0.95), recall:100*R.found/R.total, fakePerSpectrum:R.fake/N, msPerSpectrum:R.ms/N}; }
  return tab;
}
module.exports={run, METHODS, LIM};
const fmt=t=>Object.entries(t).map(([m,r])=>`${m.padEnd(9)} RMS med ${r.rmseMed.toFixed(2)}%  p95 ${r.rmseP95.toFixed(2)}%  | max med ${r.maxMed.toFixed(2)}%  p95 ${r.maxP95.toFixed(2)}%  | picchi ritrovati ${r.recall.toFixed(1)}%  falsi/spettro ${r.fakePerSpectrum.toFixed(2)}  | ${r.msPerSpectrum.toFixed(1)} ms`).join('\n');

test('fondo sintetico, rumore 1% del picco: errore del fondo entro le soglie, picchi veri ritrovati', ()=>{
  const t=run(0.01, 100); if (process.env.FONDO_TABELLA) console.log('rumore 1%\n'+fmt(t));
  for (const m of METHODS){ const r=t[m];
    assert.ok(r.rmseMed<LIM[m][0], `${m}: RMS mediano ${r.rmseMed.toFixed(2)}% ≥ ${LIM[m][0]}%`);
    assert.ok(r.rmseP95<LIM[m][1], `${m}: RMS al 95° percentile ${r.rmseP95.toFixed(2)}% ≥ ${LIM[m][1]}%`);
    assert.ok(r.recall>=90, `${m}: picchi ritrovati ${r.recall.toFixed(1)}%`); }
  // i due metodi consigliati per il Raman (arPLS, IModPoly): picchi falsi rari
  assert.ok(t.arpls.fakePerSpectrum<0.5 && t.imodpoly.fakePerSpectrum<1, JSON.stringify([t.arpls.fakePerSpectrum, t.imodpoly.fakePerSpectrum]));
});
test('fondo sintetico, rumore 0,05%, 0,2% e 3%: IModPoly sotto il 2% e ALS sotto il 3% di errore RMS mediano', ()=>{
  for (const noise of [0.0005, 0.002, 0.03]){ const t=run(noise, 40); if (process.env.FONDO_TABELLA) console.log(`rumore ${noise*100}%\n`+fmt(t));
    assert.ok(t.imodpoly.rmseMed<2 && t.imodpoly.rmseP95<5, `rumore ${noise}: IModPoly ${t.imodpoly.rmseMed.toFixed(2)}% / ${t.imodpoly.rmseP95.toFixed(2)}%`);
    assert.ok(t.als.rmseMed<3 && t.als.rmseP95<4, `rumore ${noise}: ALS ${t.als.rmseMed.toFixed(2)}% / ${t.als.rmseP95.toFixed(2)}%`);
    if (noise>=0.01) assert.ok(t.arpls.rmseMed<1.5, `rumore ${noise}: arPLS ${t.arpls.rmseMed.toFixed(2)}%`); }
});
/* LIMITE NOTO (docs/LIMITAZIONI.md, decisione aperta per il committente): arPLS con la rigidità automatica storica (al più 8 «onde»,
   λ = (n/(2π·8))⁴, la stessa della 2.x) non segue una fluorescenza ripida quando il rumore è molto basso: con rumore 0,2% del picco
   l'errore RMS mediano supera il 5%. Il test lo registra; quando la scelta sarà presa (per esempio rigidità adattiva o IModPoly come
   metodo consigliato per il Raman) questa asserzione andrà invertita. */
test('LIMITE NOTO: arPLS automatico sugli spettri molto puliti (rumore 0,2%)', ()=>{
  const t=run(0.002, 40); assert.ok(t.arpls.rmseMed>5, 'se arPLS ora va bene anche qui, aggiorna docs/LIMITAZIONI.md e questo test: '+t.arpls.rmseMed.toFixed(2));
  assert.ok(t.imodpoly.rmseMed<1.5, 'IModPoly, l\'alternativa indicata, resta accurato: '+t.imodpoly.rmseMed.toFixed(2));
});
