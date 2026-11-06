// R7: casi limite (n < 3, x costanti, y costante, NaN, Infinito, 1e-320, 1e300, righe duplicate).
// Regola: mai NaN o Infinito nei risultati; o un valore corretto, o un rifiuto (null, reject, meno di 5 punti scartati
// da addEntries in index.html) o un avviso esplicito. Tutti i dati sono SINTETICI.
'use strict';
const test=require('node:test'), assert=require('node:assert');
const C=require('./core.js');

// percorsi non finiti in un risultato (salta le funzioni, guarda dentro array tipizzati e oggetti)
function nonFinite(o, p='', seen=new Set()){
  if (o==null) return []; if (typeof o==='number') return Number.isFinite(o)?[]:[`${p}=${o}`];
  if (typeof o!=='object' || seen.has(o)) return []; seen.add(o);
  if (ArrayBuffer.isView(o)){ for (let i=0;i<o.length;i++) if (!Number.isFinite(o[i])) return [`${p}[${i}]=${o[i]}`]; return []; }
  let r=[]; for (const k of Object.keys(o)) if (typeof o[k]!=='function') r=r.concat(nonFinite(o[k], p+'.'+k, seen)); return r;
}
const run=fn=>{ try{ return {v:fn()}; }catch(e){ return {err:String(e.message||e)}; } };

const REG={
  'n=0':[[],[]], 'n=1':[[1],[2]], 'n=2':[[1,2],[2,4]],
  'x costanti':[[2,2,2,2,2],[1,2,3,4,5]], 'y costante':[[1,2,3,4,5],[3,3,3,3,3]],
  'NaN in x':[[1,2,NaN,4,5],[1,2,3,4,5]], 'NaN in y':[[1,2,3,4,5],[1,NaN,3,4,5]], 'Infinito in y':[[1,2,3,4,5],[1,2,Infinity,4,5]],
  'y 1e-320':[[1,2,3,4,5],[1e-320,2e-320,3e-320,4e-320,5.1e-320]], 'x 1e-320':[[1e-320,2e-320,3e-320,4e-320,5e-320],[1,2,3,4,5.1]],
  'y 1e300':[[1,2,3,4,5],[1e300,2e300,3e300,4e300,5.1e300]], 'x 1e300':[[1e300,2e300,3e300,4e300,5e300],[1,2,3,4,5.1]],
  'righe duplicate':[[1,1,2,2,3,3,4,4,5,5],[1,1,2,2,3.1,3.1,4,4,5,5]],
};
function regressionOffenders(){
  const out=[];
  for (const [k,[x,y]] of Object.entries(REG)){
    const pts=x.map((v,i)=>({x:v, y:y[i]})), y0=y[Math.min(1,y.length-1)];
    const fns={ linReg:()=>C.linReg(x,y), quadReg:()=>C.quadReg(x,y),
      calibrate:()=>{ const c=C.calibrate(pts); return c&&c.predict ? Object.assign({}, c, {_predict:c.predict(y0)}) : c; },
      'calibrateW 1/x':()=>{ const c=C.calibrateW(pts,'1/x'); return c ? Object.assign({}, c, {_predict:c.predict(y0)}) : c; },
      'calibrateW 1/x²':()=>{ const c=C.calibrateW(pts,'1/x2'); return c ? Object.assign({}, c, {_predict:c.predict(y0)}) : c; } };
    for (const [n,fn] of Object.entries(fns)){ const r=run(fn);
      if (r.err) out.push(`${n} [${k}]: eccezione ${r.err}`);
      else { const bad=nonFinite(r.v); if (bad.length) out.push(`${n} [${k}]: ${bad.slice(0,4).join(', ')}`);
        if (r.v && r.v.b===0 && r.v.r2===1) out.push(`${n} [${k}]: pendenza 0 con R² = 1 (retta piatta presentata come perfetta)`); }
    }
  }
  return out;
}
const mk=(n,f)=>{ const xs=Float64Array.from({length:n},(_,i)=>i), ys=Float64Array.from(xs,f); return [xs,ys]; };
const G=(x,c,w)=>Math.exp(-0.5*((x-c)/w)**2);
const SIG={
  'n=3':mk(3,x=>x), 'n=12':mk(12,x=>G(x,6,1)), 'y costante':mk(200,()=>5), 'y nulla':mk(200,()=>0),
  'y 1e-320':mk(200,x=>1e-320*(1+1000*G(x,100,5))), 'y 1e300':mk(200,x=>1e300*(1+G(x,100,5))), 'y 1e306 (picco 100×)':mk(200,x=>1e306*(1+100*G(x,100,5))),
  'NaN in y':(()=>{ const [a,b]=mk(200,x=>G(x,100,5)); b[50]=NaN; return [a,b]; })(),
  'Infinito in y':(()=>{ const [a,b]=mk(200,x=>G(x,100,5)); b[50]=Infinity; return [a,b]; })(),
  'x costanti':[new Float64Array(200).fill(3), Float64Array.from({length:200},(_,i)=>G(i,100,5))],
  'x duplicate':(()=>{ const xs=Float64Array.from({length:200},(_,i)=>i>>1); return [xs, Float64Array.from(xs,x=>G(x,50,4))]; })(),
};
function signalOffenders(){
  const out=[];
  for (const [k,[xs,ys]] of Object.entries(SIG)){
    const fns={ deconvolve:()=>C.deconvolve(xs,ys,{profile:'gauss'}), fitPeaks:()=>C.fitPeaks(xs,ys,[{x:xs[xs.length>>1],w:5}],{profile:'gauss'}),
      findPeaks:()=>C.findPeaks(xs,ys,1,0.5,50), bandMeasure:()=>C.bandMeasure(xs,ys,xs[0],xs[xs.length-1]), noiseSigma:()=>C.noiseSigma(ys) };
    for (const [n,fn] of Object.entries(fns)){ const r=run(fn);
      if (r.err) out.push(`${n} [${k}]: eccezione ${r.err}`); else { const bad=nonFinite(r.v); if (bad.length) out.push(`${n} [${k}]: ${bad.slice(0,3).join(', ')}`); } }
  }
  return out;
}
const R=(n,f)=>Array.from({length:n},(_,i)=>f(i)).join('\n');
const TXT={
  'una riga':'x,y\n1,2', 'due righe':'x,y\n1,2\n2,3', 'tre righe':'1 2\n2 3\n3 5',
  'x costanti':R(50,i=>`5\t${i}`), 'y costante':R(50,i=>`${400+i}\t7`),
  'NaN in mezzo':R(50,i=>`${400+i}\t${i===20?'NaN':Math.sin(i)}`), 'Infinity in mezzo':R(50,i=>`${400+i}\t${i===20?'Infinity':Math.sin(i)}`),
  'y 1e-320':R(50,i=>`${400+i}\t${(1+Math.sin(i))*1e-320}`), 'y 1e300':R(50,i=>`${400+i}\t${(2+Math.sin(i))*1e300}`),
  'y oltre 1e308':R(50,i=>`${400+i}\t${(2+Math.sin(i))*1e308}`), 'tutti 1e400':R(50,()=>'400\t1e400'),
  'righe duplicate':R(100,i=>`${400+(i>>1)}\t${Math.sin(i>>1)}`), 'NaN nella x':R(50,i=>`${i===10?'NaN':400+i}\t${Math.sin(i)}`),
};
// la lettura è accettabile se: rifiutata, oppure < 5 punti (scartata da addEntries), oppure valori tutti finiti E
// (se ha perso righe) segnalata con importIssue/importBad; x tutte uguali non sono uno spettro: vanno rifiutate o segnalate
function parseOffenders(){
  const out=[];
  for (const [k,t] of Object.entries(TXT)){ const r=run(()=>C.parseText(t)); if (r.err){ out.push(`parseText [${k}]: eccezione ${r.err}`); continue; }
    const p=r.v; if (!p || p.reject || !p.xs || p.xs.length<5) continue;
    const bad=nonFinite({xs:p.xs, ys:p.ys}); if (bad.length) out.push(`parseText [${k}]: ${bad.join(', ')}`);
    const warned=!!((p.importBad&&p.importBad.length) || (p.importIssue&&(p.importIssue.dropped||p.importIssue.midText||p.importIssue.thou)));
    const lines=t.split('\n').filter(l=>/\d/.test(l)).length; if (p.xs.length<lines-1 && !warned) out.push(`parseText [${k}]: ${lines-p.xs.length} righe perse senza avviso`);
    let mn=Infinity, mx=-Infinity; for (const v of p.xs){ if (v<mn) mn=v; if (v>mx) mx=v; } if (!(mx>mn) && !warned) out.push(`parseText [${k}]: asse X costante accettato senza rifiuto né avviso (${p.xs.length} punti)`);
    const d=run(()=>C.detectInstrument(p,'a.txt')); if (d.err) out.push(`detectInstrument [${k}]: eccezione ${d.err}`);
  }
  return out;
}
module.exports={regressionOffenders, signalOffenders, parseOffenders};

if (require.main===module){
  test('R7 regressione e taratura (linReg, quadReg, calibrate, calibrateW): mai NaN/Infinito, retta piatta rifiutata', ()=>{ assert.deepStrictEqual(regressionOffenders(), []); });
  test('R7 picchi, bande e deconvoluzione: mai NaN/Infinito', ()=>{ assert.deepStrictEqual(signalOffenders(), []); });
  test('R7 lettura dei file: rifiuto o valori finiti, righe perse segnalate, asse costante rifiutato', ()=>{ assert.deepStrictEqual(parseOffenders(), []); });
}
