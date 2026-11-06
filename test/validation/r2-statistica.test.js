// R2: quantili t e F, retta pesata 1/x e 1/x² (calibrateW), statistica di Mandel, contro riferimenti scipy/mpmath
// (test/fixtures/validazione/gen_fixtures.py; versioni nei JSON).
'use strict';
const test=require('node:test'), assert=require('node:assert'), path=require('path');
const C=require('./core.js'), {lre}=require('../strd/strd.js');
const FX=path.join(__dirname,'..','fixtures','validazione');
const Q=require(path.join(FX,'quantili.json')), W=require(path.join(FX,'wls.json')), M=require(path.join(FX,'mandel.json'));

const relErr=(c,r)=>Number.isFinite(c) ? Math.abs(c-r)/Math.abs(r) : Infinity;
let _q=null;
function quantRows(){ if (_q) return _q;
  let tMax=0, tAt=null, fMax=0, fAt=null;
  for (const [df,p,v] of Q.t){ const c=C.tInv(p,df), e=relErr(c,v); if (!(e<=tMax)){ tMax=e; tAt={df,p,ref:v,calc:c}; } }
  for (const [d1,d2,p,v] of Q.f){ const c=C.fInv(p,d1,d2), e=relErr(c,v); if (!(e<=fMax)){ fMax=e; fAt={d1,d2,p,ref:v,calc:c}; } }
  return (_q={t:{n:Q.t.length, max:tMax, at:tAt}, f:{n:Q.f.length, max:fMax, at:fAt}});
}
const WKEYS=['a','b','sa','sb','syx','lod','loq','t'];
function wlsRows(){
  const out=[];
  for (const c of W.casi){ const r=C.calibrateW(c.punti, c.peso), R=c.rif;
    const add=(k,calc,cert)=>out.push({caso:c.nome, peso:c.peso, n:c.punti.length, parametro:k, cert, calc, lre:lre(calc,cert), soglia:10});
    if (!r){ add('(nessun risultato)', null, 1); continue; }
    for (const k of WKEYS) add(k, r[k], R[k]);
    add('IC a (basso)', r.ciA[0], R.ciA_lo); add('IC a (alto)', r.ciA[1], R.ciA_hi); add('IC b (basso)', r.ciB[0], R.ciB_lo); add('IC b (alto)', r.ciB[1], R.ciB_hi);
    R.predict.forEach((p,i)=>{ const q=r.predict(p.y0, p.m); add(`x0(y0=${p.y0})`, q.x, p.x); add(`s x0(y0=${p.y0})`, q.s, p.s); add(`IC x0(y0=${p.y0})`, q.ci, p.ci); });
  }
  return out;
}
function mandelRows(){
  return M.casi.flatMap(c=>{ const r=C.calibrate(c.punti), m=r&&r.mandel;
    return [{caso:c.nome, n:c.punti.length, parametro:'PG', cert:c.rif.PG, calc:m?m.PG:null, lre:lre(m?m.PG:null, c.rif.PG), soglia:9},
            {caso:c.nome, n:c.punti.length, parametro:'F(0,99; 1; n−3)', cert:c.rif.F99, calc:m?m.F:null, lre:lre(m?m.F:null, c.rif.F99), soglia:9},
            {caso:c.nome, n:c.punti.length, parametro:'decisione non lineare', cert:c.rif.PG>c.rif.F99, calc:m?m.nonlinear:null, lre:null, soglia:null}]; });
}
module.exports={quantRows, wlsRows, mandelRows, meta:{q:Q.meta, w:W.meta, m:M.meta}};

if (require.main===module){
  test(`R2 quantili t (tInv): ${Q.t.length} casi, df 1–200, errore relativo ≤ 1e-8`, ()=>{
    const r=quantRows().t; assert.ok(r.max<=1e-8, `errore massimo ${r.max} a ${JSON.stringify(r.at)}`);
  });
  test(`R2 quantili F (fInv): ${Q.f.length} casi, d2 1–200, errore relativo ≤ 1e-8`, ()=>{
    const r=quantRows().f; assert.ok(r.max<=1e-8, `errore massimo ${r.max} a ${JSON.stringify(r.at)}`);
  });
  test('R2 retta pesata 1/x e 1/x² (calibrateW): parametri, errori standard, LOD, LOQ, intervalli con LRE ≥ 10', ()=>{
    const bad=wlsRows().filter(r=>!(r.lre>=r.soglia));
    assert.deepStrictEqual(bad.map(r=>`${r.caso} ${r.peso} ${r.parametro}: LRE ${r.lre.toFixed(2)} (calc ${r.calc}, rif ${r.cert})`), []);
  });
  test('R2 calibrate con peso: passa davvero per calibrateW', ()=>{
    for (const c of W.casi){ const r=C.calibrate(c.punti,{weight:c.peso}); assert.equal(r.weight, c.peso); assert.ok(lre(r.b, c.rif.b)>=10); }
  });
  test('R2 statistica F di Mandel (PG) e valore critico con LRE ≥ 9; decisione coerente', ()=>{
    for (const r of mandelRows()){
      if (r.soglia==null){ assert.strictEqual(r.calc, r.cert, `${r.caso}: decisione ${r.calc}, attesa ${r.cert}`); continue; }
      assert.ok(r.lre>=r.soglia, `${r.caso} ${r.parametro}: LRE ${r.lre.toFixed(2)} (calc ${r.calc}, rif ${r.cert})`);
    }
  });
}
