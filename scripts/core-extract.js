// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Nucleo scientifico condiviso da online e desktop: il blocco /*CORE-START*/…/*CORE-END*/ di index.html, che resta la fonte unica.
// Lavora sui byte (Buffer), non sulle stringhe: il file estratto deve essere identico byte per byte al blocco di index.html.
'use strict';
const START=Buffer.from('/*CORE-START*/'), END=Buffer.from('/*CORE-END*/');
function coreRange(buf){
  const a=buf.indexOf(START), b=buf.indexOf(END);
  if (a<0 || b<0 || b<a) throw new Error('nucleo: marcatori /*CORE-START*/ e /*CORE-END*/ non trovati');
  // un solo blocco: due marcatori renderebbero ambiguo che cosa è il nucleo
  if (buf.indexOf(START, a+1)>=0 || buf.indexOf(END, b+1)>=0) throw new Error('nucleo: marcatori ripetuti');
  return [a, b+END.length];
}
function extractCore(buf){ if (typeof buf==='string') buf=Buffer.from(buf,'utf8'); const [a,b]=coreRange(buf); return buf.subarray(a,b); }
module.exports={extractCore, coreRange};
