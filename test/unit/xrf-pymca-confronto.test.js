// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Confronto automatico con PyMca 5.9.7 + fisx 1.3.2 (punto 5 della 3.1). I risultati di PyMca sono in test/fixtures/pymca/confronto-pymca.json,
// scritti da scripts/confronto-pymca.py; qui gira Acchiappaspettri sugli stessi spettri pubblici con le condizioni lette dagli stessi .cfg
// (app/pymca-cfg-core.js). Criteri e risultati in docs/VALIDAZIONE-PYMCA.md. Le tabelle: node scripts/confronto-pymca.js
const test=require('node:test'), assert=require('node:assert'); const K=require('../../scripts/confronto-pymca.js');
const R=K.calcola();
test('Steel.spe (NIST SRM 1155, 16 keV): aree di Cr, Fe, Ni, Cu entro il 3% di PyMca, Mn (sotto Cr Kβ) entro il 15%', ()=>{
  for (const r of R.steel.aree.filter(q=>q.grande)) assert.ok(Math.abs(r.diff)<(r.sovrapposto?0.15:0.03), `${r.gruppo}: ${r.acch.toFixed(0)} contro ${r.pymca.toFixed(0)} (${(100*r.diff).toFixed(1)}%)`);
});
test('Steel.spe: concentrazioni (normalizzate su Cr+Mn+Fe+Ni+Cu) entro il 6% del certificato NIST e il 10% di PyMca sopra l\'1% in peso', ()=>{
  for (const r of R.steel.conc){ if (r.cert>0.01) assert.ok(Math.abs(r.acch/r.cert-1)<0.06, `${r.el}: ${r.acch} contro il certificato ${r.cert}`); if (r.pymca>0.01 && r.el!=='Mn') assert.ok(Math.abs(r.acch/r.pymca-1)<0.10, `${r.el}: ${r.acch} contro ${r.pymca}`); }   // Mn: area divisa con Cr Kβ in modo diverso (PyMca +13% dal certificato)
});
test('Steel.spe: χ² ridotto del modello 3.1 sullo stesso intervallo non peggiore di PyMca (13,1)', ()=>{
  assert.ok(R.steel.chi2r.acch31<=R.steel.chi2r.pymca, JSON.stringify(R.steel.chi2r)); assert.ok(R.steel.chi2r.acch31<R.steel.chi2r.acch30, 'il 3.1 migliora il 3.0');
});
test('XRFSpectrum.mca (standard sottile di PyMca): χ² non peggiore di PyMca; aree dei gruppi K e L principali entro il 15% (dipendono dal fondo)', ()=>{
  const big=R.xrfs.aree.filter(q=>q.grande); assert.ok(big.length>=5, 'gruppi confrontati: '+big.length);
  assert.ok(R.xrfs.chi2r.acch31<=1.05*R.xrfs.chi2r.pymca, JSON.stringify(R.xrfs.chi2r));
  for (const r of big.filter(q=>!/ M$/.test(q.gruppo))) assert.ok(Math.abs(r.diff)<0.15, `${r.gruppo}: ${(100*r.diff).toFixed(1)}%`);   // righe M sotto 2,5 keV sovrapposte fra loro: solo riportate
});
test('bronzo SINTETICO di examples/: Acchiappaspettri 3.1 entro il 10% della verità e il 20% di PyMca sopra l\'1% (tubo di Ebel in entrambi)', ()=>{
  for (const r of R.bronzo.conc) if (r.verita>0.01){ assert.ok(Math.abs(r.acch/r.verita-1)<0.10, `${r.el}: ${r.acch} contro ${r.verita}`); assert.ok(Math.abs(r.acch/r.pymca-1)<0.20, `${r.el}: ${r.acch} contro PyMca ${r.pymca}`); }
});
