// Carica il nucleo scientifico di index.html (tra /*CORE-START*/ e /*CORE-END*/) in un contesto vm, come test/unit/import-checks.test.js.
// ACCH_INDEX=percorso permette di provare una copia sabotata (i test devono fallire).
'use strict';
const fs=require('fs'), path=require('path'), vm=require('vm');
const ROOT=path.join(__dirname,'..','..');
const INDEX=process.env.ACCH_INDEX ? path.resolve(process.env.ACCH_INDEX) : path.join(ROOT,'index.html');
const html=fs.readFileSync(INDEX,'utf8');
const a=html.indexOf('/*CORE-START*/'), b=html.indexOf('/*CORE-END*/');
if (a<0 || b<0) throw new Error('marcatori CORE-START/CORE-END non trovati in '+INDEX);
const src=html.slice(a,b);
const ctx={console, Float64Array, Math, TextDecoder, Uint8Array, DataView, ArrayBuffer};
vm.createContext(ctx);
vm.runInContext(src, ctx, {filename:'index.html#core'});
// le dichiarazioni «function» di primo livello diventano proprietà del contesto
const need=['linReg','quadReg','calibrate','calibrateW','tInv','fInv','tCDF','fCDF','fitPeaks','deconvolve','fitEval','parseText','detectInstrument','mixResponse','fpCalibrate','findPeaks','peakAreas','bandMeasure','noiseSigma','parseBinary','decodeBuffer'];
const C={};
for (const n of need){ if (typeof ctx[n]!=='function') throw new Error('funzione del nucleo non trovata: '+n); C[n]=ctx[n]; }

// Media e deviazione standard: il nucleo NON ha una funzione unica (vedi rapporto). La formula usata per la dispersione
// dei fattori (mixResponse, fpCalibrate) è scritta in linea: la estraggo dal testo di mixResponse, così il test segue il codice reale.
function inlineMeanSd(){
  const m=/function mixResponse[\s\S]*?\n\}/.exec(src); if (!m) throw new Error('mixResponse non trovata');
  const body=m[0];
  const mean=/m=(v\.reduce\(\(a,b\)=>a\+b,0\)\/v\.length)/.exec(body), sd=/sd\[id\]=v\.length>1 \? (Math\.sqrt\(v\.reduce\(\(a,b\)=>a\+\(b-m\)\*\*2,0\)\/\(v\.length-1\)\)) : null/.exec(body);
  if (!mean || !sd) throw new Error('formula di media/deviazione standard in mixResponse cambiata: aggiornare il test');
  return new Function('v', `const m=${mean[1]}; return {mean:m, sd:${sd[1]}};`);
}
C.meanSd=inlineMeanSd();

// versione dell'app (APP_VERSION fuori dal nucleo)
const ver=/APP_VERSION_FULL\s*=\s*\(\)\s*=>\s*['"]([^'"]+)['"]/.exec(html);
C.APP_VERSION=ver?ver[1]:'?';
C.INDEX=INDEX; C.src=src; C.ROOT=ROOT;
module.exports=C;
