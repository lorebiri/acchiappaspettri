// Lettura dei file NIST StRD (copie scaricate il 2026-11-06, URL in fonti.json) e calcolo del LRE.
'use strict';
const fs=require('fs'), path=require('path');
const DIR=__dirname;
// LRE = −log10(|calc − cert| / |cert|), al massimo 15; con cert = 0 si usa l'errore assoluto. calc non finito → 0.
function lre(calc, cert){
  if (calc==null || !Number.isFinite(calc)) return 0;
  if (calc===cert) return 15;
  const e = cert===0 ? Math.abs(calc) : Math.abs(calc-cert)/Math.abs(cert);
  return Math.max(0, Math.min(15, -Math.log10(e)));
}
const num=s=>Number(String(s).replace(/[dD]/,'e'));
function readFile(name){ return fs.readFileSync(path.join(DIR,name+'.dat'),'utf8').split(/\r?\n/); }
// i dati iniziano dopo la riga «Data:» con le intestazioni delle colonne (Y oppure y x)
function dataRows(lines){
  const k=lines.findIndex(l=>/^\s*Data\s*:\s*[A-Za-z]/.test(l) && !/^\s*Data\s*:\s*(\"|Constructed|1 Response)/.test(l));
  if (k<0) throw new Error('riga Data non trovata');
  const out=[]; for (let i=k+1;i<lines.length;i++){ const t=lines[i].trim(); if (!t || /^-+$/.test(t)) continue; const v=t.split(/\s+/).map(num); if (v.every(Number.isFinite)) out.push(v); }
  return out;
}
function univariate(name){
  const L=readFile(name), txt=L.join('\n');
  const mean=num(/ybar:\s*([-+0-9.eEdD]+)/.exec(txt)[1]), sd=num(/\bs:\s*([-+0-9.eEdD]+)/.exec(txt)[1]);
  const y=dataRows(L).map(r=>r[0]);
  const nObs=+/Number of Observations:\s*(\d+)/.exec(txt)[1];
  if (y.length!==nObs) throw new Error(`${name}: letti ${y.length} valori, attesi ${nObs}`);
  return {name, y, cert:{mean, sd}};
}
function linear(name){
  const L=readFile(name), txt=L.join('\n');
  const B={}; for (const m of txt.matchAll(/^\s*B(\d)\s+([-+0-9.eEdD]+)\s+([-+0-9.eEdD]+)/gm)) B[m[1]]={est:num(m[2]), sd:num(m[3])};
  const s=num(/Residual\s+Standard Deviation\s+([-+0-9.eEdD]+)/.exec(txt)[1]), r2=num(/R-Squared\s+([-+0-9.eEdD]+)/.exec(txt)[1]);
  const rows=dataRows(L), nObs=+/(\d+)\s+Observations/.exec(txt)[1];
  if (rows.length!==nObs) throw new Error(`${name}: lette ${rows.length} righe, attese ${nObs}`);
  return {name, y:rows.map(r=>r[0]), x:rows.map(r=>r[1]), cert:{B, s, r2}};
}
module.exports={lre, univariate, linear};
