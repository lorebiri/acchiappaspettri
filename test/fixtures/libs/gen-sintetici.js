// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Scrive spettri LIBS SINTETICI (CSV a due colonne) con verità nota, per provare a mano il pannello CF-LIBS dell'app.
// Stesso generatore dei test (app/libs-cf-core.js, synth): LTE, plasma omogeneo, Voigt (Stark + strumentale), Poisson con seme.
// Uso: node test/fixtures/libs/gen-sintetici.js [cartella]   (predefinita: la cartella temporanea del sistema). Deterministico.
'use strict';
const fs=require('fs'), path=require('path'), os=require('os');
const C=require('../../../app/libs-cf-core.js'), D=require('../../../app/libs-data.js');
const out=process.argv[2]||os.tmpdir();
const CASI={
  'bronzo_Cu85_Sn8_Zn4_Pb3':{comp:{Cu:85, Sn:8, Zn:4, Pb:3}},
  'acciaio_Fe70_Cr18_Ni10_Mn2':{comp:{Fe:70, Cr:18, Ni:10, Mn:2}},
  'vetro_Si33_Na10_Ca7_K3_Al2_O45':{comp:{Si:33, Na:10, Ca:7, K:3, Al:2, O:45}},
  'bronzo_autoassorbito_L0.1cm':{comp:{Cu:85, Sn:8, Zn:4, Pb:3}, L:0.1} };
fs.mkdirSync(out, {recursive:true});
for (const [nome, c] of Object.entries(CASI)){
  const S=C.synth(D, Object.assign({T:10000, ne:1e17, ambient:{H:2e17}, peakCounts:1e6, seed:3, step:0.02}, c));
  const head=`# LIBS laser-induced breakdown, spettro SINTETICO (app/libs-cf-core.js synth, seme 3)\n# T = 10000 K, n_e = 1e17 cm-3, FWHM strumentale 0,05 nm${c.L?', L = '+c.L+' cm':''}; % in peso: ${Object.entries(S.truth.wt).map(([e,v])=>e+' '+(100*v).toFixed(2)).join(', ')}\nwavelength_nm,counts\n`;
  const f=path.join(out, 'libs-sintetico_'+nome+'.csv');
  fs.writeFileSync(f, head+Array.from(S.x).map((x,i)=>x.toFixed(2)+','+S.y[i]).join('\n')+'\n'); console.log(f); }
