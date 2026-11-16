// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Genera app/ricetta-py-modello.js dai moduli Python in scripts/ricetta-py/ (la fonte da modificare), concatenati in un solo testo
// nell'ordine di MODULI: lo script esportato è un file unico, senza import fra i moduli.
// Uso: node scripts/ricetta-py-build.js        (--check: esce con 1 se il file generato non è aggiornato)
'use strict';
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..'), DIR=path.join(ROOT,'scripts','ricetta-py'), OUT=path.join(ROOT,'app','ricetta-py-modello.js');
// acch_math subito dopo acch_ricetta (ridefinisce le m_*); acch_tecnica dopo acch_chemometria (ne usa il fit)
const MODULI=['acch_ricetta','acch_math','acch_lettori','acch_chemometria','acch_tecnica','acch_sorp','acch_chemo','acch_libreria'];
const SRC=path.join(DIR,'acch_ricetta.py');
const read=m=>fs.readFileSync(path.join(DIR,m+'.py'),'utf8').replace(/\r\n/g,'\n').replace(/\s+$/,'');
// nomi definiti al primo livello: def, class e assegnazioni (anche a più nomi: «a, b = …»); il testo dentro le stringhe a tre apici non conta
function topNames(src){ const out=[]; let inStr=null;
  for (const l of src.split('\n')){
    if (inStr){ if (l.includes(inStr)) inStr=null; continue; }
    let m=/^(?:async\s+)?(?:def|class)\s+([A-Za-z_]\w*)/.exec(l);
    if (m) out.push(m[1]);
    else if ((m=/^([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*(?::[^=]*)?=(?!=)/.exec(l))) m[1].split(',').forEach(n=>out.push(n.trim()));
    const q=(l.match(/'''|"""/g)||[]); if (q.length%2===1) inStr=q[q.length-1];
  }
  return out; }
// nomi di primo livello definiti in più moduli: vietati, perché l'ultimo sostituirebbe in silenzio il primo.
// Eccezione: le m_* di acch_ricetta (math di Python) che acch_math ridefinisce con il motore JavaScript scelto dalla sonda.
function duplicates(){ const owner=new Map(), dup=[];
  for (const m of MODULI) for (const n of new Set(topNames(read(m)))){
    if (owner.has(n) && owner.get(n)!==m && !(owner.get(n)==='acch_ricetta' && m==='acch_math' && /^m_/.test(n))) dup.push(`${n}: ${owner.get(n)} e ${m}`);
    if (!owner.has(n)) owner.set(n, m); }
  return dup; }
function python(){
  const dup=duplicates(); if (dup.length) throw new Error('nomi di primo livello definiti due volte nei moduli Python:\n  '+dup.join('\n  '));
  return MODULI.map(m=>(m==='acch_ricetta'?'':`\n\n# ============================== modulo ${m} (scripts/ricetta-py/${m}.py) ==============================\n`)+read(m)).join('');
}
function build(){
  return '// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli\n// SPDX-License-Identifier: GPL-3.0-or-later\n'
    +'// GENERATO da scripts/ricetta-py-build.js a partire da scripts/ricetta-py/*.py ('+MODULI.join(', ')+'): non modificarlo a mano.\n'
    +'(function(root){ const M='+JSON.stringify(python())+';\n  if (typeof module===\'object\' && module.exports) module.exports=M; else root.AcchRicettaPyModello=M; })(typeof self!==\'undefined\' ? self : this);\n';
}
if (require.main===module){
  let want; try{ want=build(); }catch(e){ console.error(e.message); process.exit(1); }
  if (process.argv.includes('--check')){ const have=fs.existsSync(OUT)?fs.readFileSync(OUT,'utf8'):''; if (have!==want){ console.error('app/ricetta-py-modello.js non è aggiornato: node scripts/ricetta-py-build.js'); process.exit(1); } console.log('ricetta-py-modello.js aggiornato'); }
  else { fs.writeFileSync(OUT, want); console.log('scritto '+path.relative(ROOT,OUT)); }
}
module.exports={build, python, duplicates, topNames, MODULI, DIR, SRC, OUT};
