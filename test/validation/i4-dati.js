// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Dati SINTETICI per la tappa I4 (librerie per strumento e tipo di campione): cromatogrammi con un'intestazione nello stile
// dell'esportazione ASCII di ChemStation/OpenLab. Nessuna misura reale; i picchi sono gaussiani con l'area scelta in mAU·s.
'use strict';
function rng(seed){ let s=seed>>>0||1; return ()=>{ s=(Math.imul(s,1103515245)+12345)>>>0; return s/4294967296; }; }
function gauss(r){ let u=0; while (!u) u=r(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*r()); }
/* o = {sample, peaks:[{t, area}] (area in mAU·s), model, modules, method, signal, noise, seed, header:false per un file senza intestazione} */
function chrom(o){
  o=Object.assign({sample:'CAMPIONE', model:'Agilent 1260 Infinity', modules:'G1311B Quat Pump, G1329B ALS, G1316A TCC, G4212B DAD', method:'C:\\Chem32\\1\\METHODS\\METODO-A.M', signal:'DAD1 A, Sig=220,4 Ref=off', noise:0.02, seed:7, sigma:0.015, tEnd:12, dt:0.004}, o||{});
  const r=rng(o.seed), L=[];
  if (o.header!==false){ L.push('# DATI SINTETICI / SYNTHETIC DATA - non è una misura reale / not a real measurement', `Sample Name: ${o.sample}`, `Acq. Instrument: ${o.model}`, `Instrument Modules: ${o.modules}`, `Acq. Method: ${o.method}`, `Signal: ${o.signal}`, 'Injection Date: 13/11/2026 10:00'); }
  L.push('Time (min),Signal (mAU)');
  const n=Math.round(o.tEnd/o.dt)+1, k=1/(o.sigma*Math.sqrt(2*Math.PI));
  for (let i=0;i<n;i++){ const t=i*o.dt; let y=0.3+o.noise*gauss(r);
    for (const p of o.peaks||[]){ const h=(p.area/60)*k; y+=h*Math.exp(-0.5*Math.pow((t-p.t)/o.sigma,2)); }   // area in mAU·s → mAU·min
    L.push(t.toFixed(4)+','+y.toFixed(4)); }
  return L.join('\n')+'\n';
}
module.exports={chrom, rng, gauss};
