// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Genera app/ricetta-py-modello.js dal modulo Python scripts/ricetta-py/acch_ricetta.py (la fonte da modificare).
// Uso: node scripts/ricetta-py-build.js        (--check: esce con 1 se il file generato non è aggiornato)
'use strict';
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..'), SRC=path.join(ROOT,'scripts','ricetta-py','acch_ricetta.py'), OUT=path.join(ROOT,'app','ricetta-py-modello.js');
function build(){
  const py=fs.readFileSync(SRC,'utf8').replace(/\r\n/g,'\n').replace(/\s+$/,'');
  return '// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli\n// SPDX-License-Identifier: GPL-3.0-or-later\n'
    +'// GENERATO da scripts/ricetta-py-build.js a partire da scripts/ricetta-py/acch_ricetta.py: non modificarlo a mano.\n'
    +'(function(root){ const M='+JSON.stringify(py)+';\n  if (typeof module===\'object\' && module.exports) module.exports=M; else root.AcchRicettaPyModello=M; })(typeof self!==\'undefined\' ? self : this);\n';
}
if (require.main===module){
  const want=build();
  if (process.argv.includes('--check')){ const have=fs.existsSync(OUT)?fs.readFileSync(OUT,'utf8'):''; if (have!==want){ console.error('app/ricetta-py-modello.js non è aggiornato: node scripts/ricetta-py-build.js'); process.exit(1); } console.log('ricetta-py-modello.js aggiornato'); }
  else { fs.writeFileSync(OUT, want); console.log('scritto '+path.relative(ROOT,OUT)); }
}
module.exports={build, SRC, OUT};
