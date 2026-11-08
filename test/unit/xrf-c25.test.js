// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// XRF, difetti del ciclo 25 (spettri SINTETICI dell'agente XRF in test/fixtures/xrf-c25): nucleo di calcolo.
// C5 anodo Ag su lega d'argento; A5 stagno puro dichiarato «spostato»; A4 conteggi bassi (Currie).
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'); const C=require('./load-core.js');
const FX=path.join(__dirname,'..','fixtures','xrf-c25');
const load=n=>C.parseXRF(fs.readFileSync(path.join(FX,n),'utf8'));

test('C5: lega Ag 92,5/Cu 7,5 e Ag 80/Cu 20 misurate con tubo ad argento: Ag stimato dalla Lα, valori giusti', ()=>{
  for (const [f, ag] of [['C_Ag_s2.mca',92.5],['C_Ag_s4_Ag800.mca',80]]){
    const p=load(f), S=C.fpSetup({anode:'Ag', kv:40, psi1:45, psi2:45}), R=C.xrfFP(p.xs, p.ys, ['Ag','Cu'], S, {mode:'norm'});
    assert.ok(R && R.Q && R.Q.res.Ag, f+': Ag assente');
    assert.equal(R.Q.res.Ag.line, 'La', f+': riga di Ag');
    assert.ok(Math.abs(R.Q.res.Ag.w-ag)<2, `${f}: Ag ${R.Q.res.Ag.w.toFixed(2)} invece di ${ag}`);
    assert.ok(Math.abs(R.Q.res.Cu.w-(100-ag))<2, `${f}: Cu ${R.Q.res.Cu.w.toFixed(2)}`);
  }
  assert.equal(C.fpLine('Ag', C.fpSetup({anode:'Rh', kv:40})), 'Ka', 'con un altro anodo Ag resta sulla Kα');
});

// picchi trovati dal programma negli spettri di stagno puro (posizione, prominenza): asse giusto
const SN=[[1.712,16],[1.934,11],[3.044,26],[3.443,188],[3.663,92],[3.904,40],[4.137,28],[19.341,12],[25.195,129],[28.529,50]];
test('A5: stagno puro con asse giusto non risulta spostato (fughe del Si, Lℓ, Lβ₂, Lγ e Kα₁+Kα₂)', ()=>{
  const fit=C.xrfAlignFit(SN.map(([x,w])=>({x,w})), 'Rh'), sh=fit ? fit.a+(fit.b-1)*8 : 0;
  assert.ok(Math.abs(sh)<0.025, `spostamento dichiarato ${Math.round(sh*1000)} eV`);
});
test('A5: uno spostamento vero resta riconosciuto (stagno −150 eV; bronzo −150 eV e +2% di guadagno)', ()=>{
  const BR=[[8.0411,7000],[8.9053,1000],[8.63,60],[10.5408,120],[12.6144,90],[25.192,40],[3.443,30]];
  for (const [name, pk, cases] of [['stagno',SN,[[0.15,1]]],['bronzo',BR,[[0.15,1],[0,1/1.02],[0,1/0.98]]]]) for (const [off, g] of cases){
    const shifted=pk.map(([x,w])=>({x:(x+off)/g, w})), fit=C.xrfAlignFit(shifted,'Rh'), sh=fit.a+(fit.b-1)*8, want=-(off+(1/g-1)*8);
    assert.ok(Math.abs(sh-want)<0.03, `${name} ${off} ${g}: trovato ${Math.round(sh*1000)} eV, atteso ${Math.round(want*1000)}`);
  }
});
test('A4: conteggi bassi, il rumore di Poisson non passa il limite di Currie; le righe vere sì', ()=>{
  const p=load('Q_low_300.mca'); assert.ok(C.isCounts(p.ys), 'conteggi interi');
  const [cu, bi, cd]=C.xrfCurrie(p.xs, p.ys, [8.03, 2.48, 3.12]);
  assert.ok(cu.detected, 'Cu Kα'); assert.ok(!bi.detected, 'rumore a 2,48 keV («Bi»)'); assert.ok(!cd.detected, 'rumore a 3,12 keV («Cd»)');
  assert.ok(!C.isCounts(Float64Array.from(p.ys, v=>v/3.7)), 'conteggi al secondo: niente Currie');
});
test('A4: S/N con pochi conteggi non è «infinito»', ()=>{
  const p=load('Q_low_300.mca'), q=C.signalQuality(p.xs, p.ys, 1, true);
  assert.ok(q.snr<1000, 'S/N '+q.snr);
});
