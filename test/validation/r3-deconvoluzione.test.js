// R3: deconvoluzione. (a) dati SINTETICI senza rumore, semi automatici di deconvolve: centri, FWHM e aree con LRE ≥ 6;
// (b) dati SINTETICI con rumore (fixture Python): errori standard di fitPeaks contro scipy curve_fit sugli stessi dati, LRE ≥ 2;
// (c) un fit fallito non deve risultare «riuscito».
'use strict';
const test=require('node:test'), assert=require('node:assert'), path=require('path');
const C=require('./core.js'), {lre}=require('../strd/strd.js');
const D=require(path.join(__dirname,'..','fixtures','validazione','deconv.json'));

const SQ=Math.sqrt(Math.LN2/Math.PI);
const pv=(x,c,w,e)=>{ const t=(x-c)/w; return e*2/(Math.PI*w)/(1+4*t*t)+(1-e)*2*SQ/w*Math.exp(-4*Math.LN2*t*t); };   // area unitaria, w = FWHM
const etaOf=(prof,p)=>prof==='pv'?p.eta:prof==='lor'?1:0;
const SEP=[{c:40,w:6,A:300,eta:0.3},{c:60,w:8,A:200,eta:0.7}];
const OVL=[{c:45,w:8,A:300,eta:0.5},{c:54,w:8,A:200,eta:0.5}];   // distanza ≈ 1,1 FWHM: spalla
const SEP4=[{c:20,w:5,A:300,eta:0.2},{c:35,w:6,A:200,eta:0.5},{c:55,w:7,A:400,eta:0.8},{c:75,w:5,A:150,eta:0.4}];
const OVL4=[{c:30,w:8,A:300,eta:0.3},{c:40,w:8,A:200,eta:0.6},{c:55,w:10,A:400,eta:0.5},{c:66,w:8,A:250,eta:0.4}];
const CASES=[];
for (const prof of ['gauss','lor','pv']) for (const [nm,P] of [['2 separati',SEP],['2 sovrapposti',OVL],['4 separati',SEP4],['4 sovrapposti',OVL4]]) CASES.push({prof, nm, P});

function cleanRows(){
  const out=[];
  for (const {prof,nm,P} of CASES){
    const xs=Float64Array.from({length:1001},(_,i)=>i*0.1), ys=Float64Array.from(xs,x=>P.reduce((s,p)=>s+p.A*pv(x,p.c,p.w,etaOf(prof,p)),0));
    const f=C.deconvolve(xs, ys, {profile:prof}), row={profilo:prof, caso:nm, attesi:P.length, trovati:f?f.peaks.length:0, iter:f?f.iter:null, minLRE:{c:15,w:15,area:15}, dettagli:[]};
    if (f && f.peaks.length===P.length) P.forEach((p,j)=>{ const q=f.peaks[j], L={c:lre(q.c,p.c), w:lre(q.w,p.w), area:lre(q.area,p.A)};
      for (const k in L) row.minLRE[k]=Math.min(row.minLRE[k], L[k]); row.dettagli.push({vero:p, calc:{c:q.c, w:q.w, area:q.area}, lre:L}); });
    else row.minLRE={c:0,w:0,area:0};
    out.push(row);
  }
  return out;
}
let _n=null;
function noisyRows(){ if (_n) return _n;
  return _n=D.casi.map(c=>{ const xs=Float64Array.from(c.x), ys=Float64Array.from(c.y);
    const f=C.fitPeaks(xs, ys, c.veri.map(p=>({x:p.c, w:p.w})), {profile:c.profilo}), auto=C.deconvolve(xs, ys, {profile:c.profilo});
    const comp=(fit)=>fit.peaks.map((q,j)=>{ const r=c.curve_fit.componenti[j]; const L={c:lre(q.c,r.c), w:lre(q.w,r.w), area:lre(q.area,r.area), s_c:lre(q.sc,r.s_c), s_w:lre(q.sw,r.s_w), s_area:lre(q.sarea,r.s_area)};
      if (r.s_eta!=null) L.s_eta=lre(q.seta,r.s_eta); return {calc:{c:q.c,w:q.w,area:q.area,sc:q.sc,sw:q.sw,sarea:q.sarea,seta:q.seta}, rif:r, lre:L}; });
    return {caso:c.nome, profilo:c.profilo, n:c.x.length, componenti:c.veri.length, ssr:{app:f.ssr, scipy:c.curve_fit.ssr}, semi:comp(f), auto:{trovati:auto.peaks.length, comp:auto.peaks.length===c.veri.length?comp(auto):[]}};
  });
}
// criterio dell'interfaccia (index.html, runFitUI: «poco affidabile» se R² < 0,9 o residuo ≥ 2 volte il rumore)
const uiWarns=(fit, sig)=> fit.r2<0.9 || (sig && fit.rmse/sig>=2);
module.exports={cleanRows, noisyRows};

if (require.main===module){
  test('R3 deconvoluzione senza rumore, semi automatici: centri, FWHM, aree con LRE ≥ 6 (Gauss, Lorentz, pseudo-Voigt; 2 e 4 componenti)', ()=>{
    const bad=cleanRows().filter(r=>r.trovati!==r.attesi || Math.min(r.minLRE.c,r.minLRE.w,r.minLRE.area)<6);
    assert.deepStrictEqual(bad.map(r=>`${r.profilo} ${r.caso}: ${r.trovati}/${r.attesi} componenti, LRE min c ${r.minLRE.c.toFixed(1)} w ${r.minLRE.w.toFixed(1)} area ${r.minLRE.area.toFixed(1)}`), []);
  });
  test('R3 con rumore: errori standard di fitPeaks come scipy curve_fit (LRE ≥ 2), stesso minimo', ()=>{
    for (const r of noisyRows()){
      assert.ok(Math.abs(r.ssr.app-r.ssr.scipy)/r.ssr.scipy<=1e-6, `${r.caso}: SSR ${r.ssr.app} contro ${r.ssr.scipy}`);
      for (const [j,q] of r.semi.entries()) for (const k of ['s_c','s_w','s_area','s_eta']) if (q.lre[k]!=null) assert.ok(q.lre[k]>=2, `${r.caso} comp. ${j+1} ${k}: LRE ${q.lre[k].toFixed(2)} (app ${JSON.stringify(q.calc)}, scipy ${JSON.stringify(q.rif)})`);
    }
  });
  test('R3 con rumore: la deconvoluzione automatica trova il numero giusto di componenti e le stesse incertezze', ()=>{
    for (const r of noisyRows()){ assert.equal(r.auto.trovati, r.componenti, r.caso);
      for (const q of r.auto.comp) for (const k of ['s_c','s_w','s_area']) assert.ok(q.lre[k]>=2, `${r.caso} ${k} ${q.lre[k]}`); }
  });
  test('R3 fit fallito (semi lontani dalle bande): l\'interfaccia lo segnala come poco affidabile', ()=>{
    const c=D.casi[1], xs=Float64Array.from(c.x), ys=Float64Array.from(c.y);
    const f=C.fitPeaks(xs, ys, [{x:xs[3], w:1}, {x:xs[xs.length-4], w:1}], {profile:'gauss'});
    assert.ok(!f || uiWarns(f, C.noiseSigma(ys)), `fit fallito presentato come riuscito: R² ${f&&f.r2}`);
  });
  test('R3 banda assente in modalità manuale: le altre componenti non possono avere errore standard 0', ()=>{
    // SINTETICO: due gaussiane (40 e 52) con rumore uniforme ±0,25; l'utente ha un picco anche a 75, dove non c'è banda
    // (succede con «Stessa deconvoluzione su tutti gli spettri» o con un picco aggiunto a mano). L'area del terzo va a 0 (limite),
    // JᵀJ diventa singolare e fitPeaks restituisce σ = 0 per TUTTE le componenti: l'interfaccia mostra «300 ± 0» con il ✅.
    const xs=Float64Array.from({length:1001},(_,i)=>i*0.1); let s=1; const rnd=()=>{ s=(s*16807)%2147483647; return s/2147483647-0.5; };
    const ys=Float64Array.from(xs,x=>300*pv(x,40,6,0)+200*pv(x,52,8,0)+rnd()*0.5);
    for (const prof of ['gauss','pv']){
      const f=C.deconvolve(xs, ys, {profile:prof, fixed:true, seeds:[40,52,75], base:'lin'}); assert.ok(f, 'nessun risultato');
      const zero=f.peaks.filter(q=>q.area>1 && !(q.sarea>0));
      assert.equal(zero.length, 0, `${prof}: ${zero.length} componenti con area > 0 ed errore standard 0 (${f.peaks.map(q=>q.area.toFixed(2)+' ± '+q.sarea).join('; ')}), R² ${f.r2.toFixed(5)}: incertezza nulla presentata come riuscita`);
    }
  });
  test('R3 parametri non determinabili (due semi identici): errori standard non possono valere 0', ()=>{
    const c=D.casi[1], xs=Float64Array.from(c.x), ys=Float64Array.from(c.y), p=c.veri;
    const f=C.fitPeaks(xs, ys, [{x:p[0].c,w:p[0].w},{x:p[0].c,w:p[0].w}].concat(p.slice(1).map(q=>({x:q.c,w:q.w}))), {profile:'gauss'});
    assert.ok(f, 'nessun risultato');
    const zero=f.peaks.filter(q=>q.sarea===0 || q.sc===0 || q.sw===0);
    assert.equal(zero.length, 0, `${zero.length} componenti su ${f.peaks.length} con errore standard esattamente 0 (covarianza singolare non segnalata)`);
  });
}
