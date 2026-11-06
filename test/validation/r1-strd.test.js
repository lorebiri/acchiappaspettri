// R1: NIST StRD con le funzioni reali del nucleo. LRE = −log10(|calc − cert|/|cert|), al massimo 15.
'use strict';
const test=require('node:test'), assert=require('node:assert');
const C=require('./core.js'), S=require('../strd/strd.js');

// soglie richieste (R1). Per la media dei dati di difficoltà media e alta R1 non fissa una soglia: uso 13 (scelta dichiarata).
const UNIV=[
  ['Lew','bassa',14,13], ['Lottery','bassa',14,13], ['Mavro','bassa',14,13], ['Michelso','bassa',14,13], ['PiDigits','bassa',14,13], ['NumAcc1','bassa',14,13],
  ['NumAcc2','media',13,9], ['NumAcc3','media',13,9], ['NumAcc4','alta',13,8],
];
function univRows(){
  return UNIV.map(([name, diff, tMean, tSd])=>{ const d=S.univariate(name), r=C.meanSd(d.y), lr=C.linReg(d.y.map((_,i)=>i+1), d.y);
    return {name, diff, n:d.y.length, cert:d.cert, calc:{mean:r.mean, sd:r.sd, linRegMean:lr.ym}, lre:{mean:S.lre(r.mean,d.cert.mean), sd:S.lre(r.sd,d.cert.sd), linRegMean:S.lre(lr.ym,d.cert.mean)}, soglie:{mean:tMean, sd:tSd}}; });
}
function norrisRows(){
  const d=S.linear('Norris'), r=C.linReg(d.x, d.y), B=d.cert.B;
  return [['a (intercetta)',r.a,B[0].est],['b (pendenza)',r.b,B[1].est],['sa',r.sa,B[0].sd],['sb',r.sb,B[1].sd],['s residua',r.syx,d.cert.s],['R²',r.r2,d.cert.r2]]
    .map(([k,calc,cert])=>({dataset:'Norris', funzione:'linReg', parametro:k, cert, calc, lre:S.lre(calc,cert), soglia:12}));
}
function pontiusRows(){
  const d=S.linear('Pontius'), q=C.quadReg(d.x, d.y), B=d.cert.B;
  if (!q) return [{dataset:'Pontius', funzione:'quadReg', parametro:'(nessun risultato)', cert:NaN, calc:null, lre:0, soglia:9}];
  return [['B0',q.c[0],B[0].est],['B1',q.c[1],B[1].est],['B2',q.c[2],B[2].est],['s residua',q.s,d.cert.s]]
    .map(([k,calc,cert])=>({dataset:'Pontius', funzione:'quadReg', parametro:k, cert, calc, lre:S.lre(calc,cert), soglia:9}));
}
module.exports={univRows, norrisRows, pontiusRows};

if (require.main===module){
  test('R1 univariata: media e deviazione standard (formula in linea di mixResponse/fpCalibrate)', ()=>{
    for (const r of univRows()){
      assert.ok(r.lre.mean>=r.soglie.mean, `${r.name}: LRE media ${r.lre.mean.toFixed(2)} < ${r.soglie.mean} (calc ${r.calc.mean}, cert ${r.cert.mean})`);
      assert.ok(r.lre.sd>=r.soglie.sd, `${r.name}: LRE sd ${r.lre.sd.toFixed(2)} < ${r.soglie.sd} (calc ${r.calc.sd}, cert ${r.cert.sd})`);
    }
  });
  test('R1 univariata: la media interna di linReg (ym) coincide col valore certificato', ()=>{
    for (const r of univRows()) assert.ok(r.lre.linRegMean>=r.soglie.mean, `${r.name}: LRE ${r.lre.linRegMean.toFixed(2)}`);
  });
  test('R1 Norris (linReg): a, b, sa, sb, s, R² con LRE ≥ 12', ()=>{
    for (const r of norrisRows()) assert.ok(r.lre>=r.soglia, `${r.parametro}: LRE ${r.lre.toFixed(2)} (calc ${r.calc}, cert ${r.cert})`);
  });
  test('R1 Pontius (quadReg): coefficienti e s residua con LRE ≥ 9', ()=>{
    for (const r of pontiusRows()) assert.ok(r.lre>=r.soglia, `${r.parametro}: LRE ${r.lre.toFixed(2)} (calc ${r.calc}, cert ${r.cert})`);
  });
  test('R1 NoInt1–2: non applicabili finché il programma non offre la retta per l\'origine', ()=>{
    // la scelta del modello di taratura è il menu #mvW: se compare un'opzione nuova (per esempio «per l'origine») questo test fallisce
    const fs=require('fs'), html=fs.readFileSync(C.INDEX,'utf8'), m=/<select id="mvW">([\s\S]*?)<\/select>/.exec(html);
    assert.ok(m, 'menu del modello di taratura (#mvW) non trovato');
    const vals=[...m[1].matchAll(/<option value="([^"]*)"/g)].map(x=>x[1]);
    assert.deepStrictEqual(vals, ['', '1/x', '1/x2'], 'nuovo modello di taratura: aggiungere NoInt1–2 al test R1');
  });
  for (const n of ['Filip (polinomio di grado 10)','Wampler1–5 (polinomio di grado 5)','Longley (regressione multipla)'])
    test(`R1 ${n}`, {skip:'non applicabile: modello non offerto dal programma'}, ()=>{});
}
