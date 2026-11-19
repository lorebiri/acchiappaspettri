// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Debug 3.1 indipendente: lettori dei file XRF (parseXRF) e dei .cfg di PyMca su input ostili o insoliti. Ogni prova fallisce senza la correzione
// (tempi di decine di secondi, memoria di gigabyte o spettro letto male). Input SINTETICI costruiti qui.
const test=require('node:test'), assert=require('node:assert/strict'); const C=require('./load-core.js'); const P=require('../../app/pymca-cfg-core.js');
const ms=f=>{ const t=Date.now(); f(); return Date.now()-t; };

test('parseXRF: molte righe vuote dopo uno spettro non bloccano la lettura (prima 30 s con 60 000 righe CRLF)', ()=>{
  const txt=Array.from({length:500},(_,i)=>(i*0.02).toFixed(2)+'\t'+(10+i%7)).join('\n')+'\r\n'.repeat(60000);
  assert.ok(ms(()=>C.parseXRF(txt))<1500);
  assert.ok(C.parseXRF('[DATA]\r\n'+'\r\n'.repeat(3)+Array(300).fill('5').join('\r\n'))!==undefined);   // [DATA] su una riga sua: ancora riconosciuto
});
test('parseXRF: righe ostili per le espressioni regolari (Amptek «<<» con molti spazi, riga di cifre lunghissima)', ()=>{
  const amp='<<PMCA SPECTRUM>>\n<<'+' '.repeat(20000)+'x\n<<DATA>>\n'+Array(300).fill('7').join('\n')+'\n<<END>>\n';
  let p; assert.ok(ms(()=>{ p=C.parseXRF(amp); })<1500); assert.equal(p.ys.length, 300);
  assert.ok(ms(()=>C.parseXRF('1'.repeat(50000)+'x\n'+Array(300).fill('3').join('\n')))<1500);
  // 100 000 canali illeggibili: riempimento lineare (prima quadratico), e il numero è riportato
  const bad='<<PMCA SPECTRUM>>\n<<DATA>>\n5\n'+Array(100000).fill('?').join('\n')+'\n<<END>>\n'; let q; assert.ok(ms(()=>{ q=C.parseXRF(bad); })<2000); assert.equal(q.importIssue.dropped, 100000);
});
test('parseXRF: .mca in formato SPEC/PyMca (#@CHANN, #@CALIB, righe @A con «\\») letto come spettro tarato, non come tabella a due colonne', ()=>{
  const counts=Array.from({length:2048},(_,i)=>i===320?5000:10+(i%5)), rows=[]; for (let i=0;i<counts.length;i+=16) rows.push((i?' ':'@A ')+counts.slice(i,i+16).join(' ')+(i+16<counts.length?'\\':''));
  const p=C.parseXRF('#F t.mca\r\n#S 1 s\r\n#@MCA %16C\r\n#@CHANN 2048 0 2047 1\r\n#@CALIB 0.1 0.02 0\r\n'+rows.join('\r\n')+'\r\n');
  assert.equal(p.ys.length, 2048); let b=0; for (let i=0;i<p.ys.length;i++) if (p.ys[i]>p.ys[b]) b=i; assert.ok(Math.abs(p.xs[b]-6.5)<1e-9, 'picco a 6,5 keV: '+p.xs[b]);
  assert.ok(p.xrf.calibrated && /SPEC/.test(p.xrf.fmt));
  const u=C.parseXRF('#S 1\n#@CHANN 1024 0 1023 1\n#@CALIB 0 1 0\n@A '+Array(1024).fill('4').join(' ')+'\n'); assert.equal(u.xrf.calibrated, false, '«0 1 0» è un asse in canali');
});
test('.cfg: [DEFAULT] e %(x)s non esauriscono la memoria; «%(» ripetuto e spazi interni lunghi restano lineari', ()=>{
  const def='[DEFAULT]\n'+Array.from({length:30},(_,i)=>'k'+i+' = '+'%(a)s'.repeat(30)).join('\n')+'\na = '+'x'.repeat(1000)+'\n';
  const secs=Array.from({length:200},(_,i)=>'[s'+i+']\nv = 1').join('\n');
  assert.throws(()=>P.parse(def+secs), /troppo grande/);
  assert.ok(ms(()=>P.parse('[s]\nk = '+'%('.repeat(50000)+'\n'))<1500);
  assert.ok(ms(()=>P.parse('[s]\nk = a'+' '.repeat(100000)+'b\n'))<1500);
  // un file normale con [DEFAULT] e sostituzioni resta come prima
  assert.deepEqual(P.parse('[DEFAULT]\nd = 7\n[s]\nk = %(d)s0\n').s, {d:7, k:70});
});
test('fpSetup: valori finiti ma assurdi (1e308 cm d\'aria, sensore di 1e-300 µm, peso 1e-310) tornano ai tipici invece di dare NaN', ()=>{
  const S=C.fpSetup({anode:'Rh', kv:40, phys:'3.1', d1:1e308, d2:1e308, beT:1e308, beD:1e308, si:1e-300, trans:1, tT:1e308});
  assert.deepEqual([S.d1, S.d2, S.beT, S.beD, S.si, S.tT], [1, 1, 125, 12.5, 500, 0]);
  const I=C.fpIntensities([{comp:{Cu:0.9, Sn:0.1}, t:Infinity}], S, [['Cu','Ka'],['Sn','Ka']]); assert.ok(Number.isFinite(I['Cu Ka']) && I['Cu Ka']>0);
  assert.equal(C.fpSetup({exc:[[17.48, 1e-310, 1]]}).exc, undefined, 'peso denormale scartato');
  const R=C.fpSetup({d2:3.5, beT:250, si:1000}); assert.deepEqual([R.d2, R.beT, R.si], [3.5, 250, 1000], 'valori realistici invariati');
  assert.equal(C.fpSetup({eps:30}).eps, 30, 'angolo d\'uscita del tubo'); assert.equal(C.fpSetup({}).eps, 20);
});
