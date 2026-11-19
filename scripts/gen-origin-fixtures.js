// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Genera i progetti Origin SINTETICI di test/fixtures/origin/ con lo scrittore di app/origin-core.js.
// Nessun dato reale: spettri calcolati qui. Uso: node scripts/gen-origin-fixtures.js [cartella]
'use strict';
const fs=require('fs'), path=require('path');
const O=require('../app/origin-core.js');
/* spettri deterministici: FTIR con passo costante, Raman con passo irregolare, valori estremi */
function specs(){
  const g=(x,c,w)=>Math.exp(-0.5*((x-c)/w)**2);
  const ir=Array.from({length:1801},(_,i)=>4000-i*2), irY=ir.map(x=>0.05+0.8*g(x,1730,8)+0.3*g(x,2920,20)+1e-4*Math.sin(x));
  const ra=Array.from({length:700},(_,i)=>100+i*1.37+0.001*Math.sin(i)), raY=ra.map(x=>200*g(x,520,3)+50*g(x,950,15)+5);
  const ext=[1e-300, -1e300, 5e-324, 0, -0, 123456789.123456789, 2**53+1, Math.PI, -Math.E, 1/3];
  return [
    {xs:ir, ys:irY, name:'FTIR sintetico', x:{longName:'Numero d\'onda', units:'cm\\+(-1)'}, y:{units:'A', comments:'spettro sintetico, picchi a 1730 e 2920'}},
    {xs:ra, ys:raY, name:'Raman sintetico', x:{longName:'Spostamento Raman', units:'cm\\+(-1)'}, y:{units:'conteggi'}},
    {xs:ext.map((_,i)=>i+1), ys:ext, name:'Valori estremi'}
  ];
}
function files(){
  const S=specs(), out={};
  for (const [f,w] of [['opj','writeOpj'],['opju','writeOpju']]) for (const m of ['each','one']) out[`sintetico-${m}.${f}`]=O[w](S,{mode:m});
  return out;
}
if (require.main===module){
  const dir=process.argv[2]||path.join(__dirname,'..','test','fixtures','origin');
  fs.mkdirSync(dir,{recursive:true});
  for (const [n,b] of Object.entries(files())){ fs.writeFileSync(path.join(dir,n), b); console.log(n, b.length); }
}
module.exports={specs, files};
