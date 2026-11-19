// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// XRF: file .mca a una sola colonna con sole righe di commento «#» (come XRFSpectrum.mca di PyMca).
// Nessun valore viene preso per il numero di canali: si leggono tutti. I canali a zero ai bordi si tolgono, ma xs resta il numero di canale.
const test=require('node:test'), assert=require('node:assert'); const C=require('./load-core.js');
const file=v=>'# Spettro di prova a una colonna\n#\n# righe di commento facoltative\n'+v.join('\n')+'\n';

test('una colonna: tutti i valori letti, il primo compreso, anche se sembra il numero di canali', ()=>{
  const v=Array.from({length:300},(_,i)=>10+(i%7));
  v[0]=300;   // uguale al numero di valori: non è un'intestazione
  const p=C.parseXRF(file(v));
  assert.ok(p, 'file non riconosciuto');
  assert.equal(p.xrf.fmt, 'MCA (una colonna)');
  assert.equal(p.xrf.calibrated, false);
  assert.equal(p.ys.length, 300);
  assert.deepEqual(Array.from(p.xs.slice(0,3)), [0,1,2]);
  assert.deepEqual(Array.from(p.ys), v);
});

test('una colonna con il primo canale a zero (come XRFSpectrum.mca): niente spostamento, xs è il canale del file', ()=>{
  const v=Array.from({length:300},(_,i)=>i===0 ? 0 : 1000+i);
  v[299]=0;
  const p=C.parseXRF(file(v));
  assert.equal(p.ys.length, 298, 'canali a zero ai bordi tolti');
  assert.equal(p.xs[0], 1);
  for (let i=0;i<p.xs.length;i++) assert.equal(p.ys[i], v[p.xs[i]], 'canale '+p.xs[i]);
});
