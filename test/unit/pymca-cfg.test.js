// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// app/pymca-cfg-core.js: lettura e scrittura dei .cfg di PyMca, traduzione verso e da le condizioni dell'app.
// I .cfg e gli spettri d'esempio sono di PyMca (MIT, © ESRF: test/fixtures/pymca/README.md). Il confronto con PyMca vero è nel JSON
// salvato da scripts/pymca-cfg-verifica.js (PyMca 5.9.7, fisx 1.3.2), così qui non serve Python.
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('fs'), path=require('path');
const P=require('../../app/pymca-cfg-core.js');
const FIX=path.join(__dirname,'..','fixtures','pymca'), rd=f=>fs.readFileSync(path.join(FIX,f),'utf8');
const VER=JSON.parse(rd('verifica-pymca.json'));

// valori come li stampa scripts/pymca-cfg-verifica.py: vettori numpy marcati, nan e infiniti come stringhe
function norm(v){
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v==='object'){ if ('__ndarray__' in v) return norm(v.__ndarray__); const o={}; for (const k of Object.keys(v).sort()) o[k]=norm(v[k]); return o; }
  if (v==='__nan__') return 'NaN'; if (v==='__inf__') return 'Inf'; if (v==='__-inf__') return '-Inf';
  if (typeof v==='number'){ if (Number.isNaN(v)) return 'NaN'; if (v===Infinity) return 'Inf'; if (v===-Infinity) return '-Inf'; return +v.toPrecision(10); }
  return v;
}

test('parse legge come ConfigDict di PyMca: Steel.cfg, McaTheory.cfg e un file con tutti i casi del formato', ()=>{
  for (const f of ['Steel.cfg','McaTheory.cfg','prova-formato.cfg']) assert.deepEqual(norm(P.parse(rd(f))), norm(VER.letti[f]), f);
  const c=P.parse(rd('prova-formato.cfg')).alfa;
  assert.equal(c.comune, 7, 'la sezione [DEFAULT] vale in tutte le sezioni');
  assert.equal(c.percento, '50%'); assert.deepEqual(c.singolo, ['x']); assert.equal(c.vuoto, ''); assert.equal(c.nonvettore, '[[1 2] [3 4]]');
  assert.deepEqual(c.multi, [[1,2],[3,4],'',[5]], 'valori su più righe: una lista per riga');
  assert.ok(Number.isNaN(c.nonnumero)); assert.equal(c.infinito, -Infinity); assert.equal(c.sottolineato, 1000);
  assert.ok(P.parse(rd('prova-formato.cfg')).alfa['beta.gamma'], '«_|_» nel nome della sezione è un punto');
});

test('stringify: PyMca rilegge ciò che scrive il modulo (stesso contenuto dell\'originale)', ()=>{
  for (const f of ['Steel.cfg','McaTheory.cfg','prova-formato.cfg']){
    const txt=P.stringify(P.parse(rd(f)));
    assert.equal(txt, VER.scritti['riscritto-'+f], f+': la scrittura è cambiata, rigenera test/fixtures/pymca/verifica-pymca.json con node scripts/pymca-cfg-verifica.js');
    assert.deepEqual(norm(VER.letti['riscritto-'+f]), norm(VER.letti[f]), f+': PyMca legge dal file riscritto gli stessi valori dell\'originale');
    assert.deepEqual(norm(P.parse(txt)), norm(P.parse(rd(f))), f+': andata e ritorno nel modulo');
  }
  for (const f of ['Steel.cfg','McaTheory.cfg']){ const txt=P.stringify(P.fromAcch(P.toAcch(P.parse(rd(f)))));
    assert.equal(txt, VER.scritti['da-acch-'+f], f+' (fromAcch): rigenera verifica-pymca.json');
    assert.deepEqual(norm(P.parse(txt)), norm(VER.letti['da-acch-'+f]), f+' (fromAcch): PyMca legge ciò che legge il modulo'); }
  assert.throws(()=>P.stringify({x:1}), /fuori da ogni sezione/);
  assert.throws(()=>P.parse('a = 1\n[s]\n'), /intestazione di sezione/);
  assert.throws(()=>P.parse('[s]\nsenza uguale\n'), /chiave = valore/);
});

test('toAcch su Steel.cfg: eccitazione monocromatica 16 keV, geometria, filtri, rivelatore, matrice', ()=>{
  const n=P.toAcch(P.parse(rd('Steel.cfg')));
  assert.equal(n.version, 'pymca-cfg-1');
  assert.deepEqual(n.excitation, [{E:16, w:1, scatter:true}], 'conta [fit] energy, non [tube]');
  assert.deepEqual(n.setup.exc, [[16, 1, 1]], 'la stessa eccitazione nel formato di fpSetup');
  const s=n.setup;
  assert.deepEqual({anode:s.anode, kv:s.kv, psi1:s.psi1, psi2:s.psi2, beT:s.beT, eps:s.eps, alphae:s.alphae, alphax:s.alphax, d1:s.d1, d2:s.d2, atm:s.atm, beD:s.beD, si:s.si, det:s.det},
    {anode:'Ag', kv:30, psi1:45, psi2:45, beT:125, eps:90, alphae:90, alphax:90, d1:0, d2:5, atm:'air', beD:20, si:350, det:'Si'});
  assert.deepEqual(s.filt, {comp:'Al', compW:{Al:1}, rho:2.72, um:1100, name:'Al1'});
  assert.equal(s.ae, 90, 'ae: incidenza degli elettroni (alphae); eps: uscita dei raggi X (alphax)'); assert.equal(s.trans, 0); assert.equal(s.tT, null);
  const f=n.fit;
  assert.equal(f.xmin, 200); assert.equal(f.xmax, 1432); assert.ok(Math.abs(f.xminE-(-0.00612446976449+0.0119281593146*200))<1e-9); assert.ok(Math.abs(f.xmaxE-17.075)<1e-3);
  assert.equal(f.noise, 0.127439); assert.equal(f.fano, 0.101156); assert.equal(f.sum, 1e-10); assert.equal(f.quad, null);
  assert.deepEqual(f.hypermet, {gauss:true, st:false, lt:false, step:false}, 'hypermetflag = 1 è la sola gaussiana (bit 1)');
  assert.deepEqual(f.st, [0.05, 0.5]); assert.deepEqual(f.lt, [0.02, 10]); assert.equal(f.stepH, 1e-4);
  assert.equal(f.escape, true); assert.equal(f.pileup, true); assert.equal(f.stripalgorithm, 'strip'); assert.equal(f.snipwidth, 30); assert.equal(f.continuum, null); assert.equal(f.maxiter, 10);
  assert.deepEqual(n.peaks.Fe, ['Ka','Kb']); assert.deepEqual(n.peaks.W, ['L1','L2','L3']); assert.deepEqual(n.peaks.Pb, ['L','M']);
  assert.equal(n.matrix.name, 'SRM_1155'); const t=Object.values(n.matrix.comp).reduce((a,b)=>a+b,0); assert.ok(Math.abs(t-1)<1e-12);
  assert.ok(Math.abs(n.matrix.comp.Cr-0.1837/0.99999)<1e-4); assert.equal(n.matrix.rho, 1); assert.equal(n.matrix.thickness, 1);
  assert.equal(n.quant.reference, 'Fe'); assert.equal(n.quant.secondary, 0);
  // nessuna chiave ignorata in silenzio
  const keys=n.warnings.map(w=>w.key).join(' | ');
  for (const k of ['stripiterations','deltaonepeak','strategy','nthreshold','anodethickness','[xrfmc]','usexrfmc','[fit] energy','[concentrations] reference']) assert.ok(keys.includes(k), 'avviso per '+k);
  for (const w of n.warnings){ assert.ok(['ignorata','approssimata','nota'].includes(w.kind)); assert.ok(w.msg.length>10); }
  // il materiale completo del certificato si risolve dalle [materials]
  const full=P.materialComp('SRM_1155_COMPLETE', P.parse(rd('Steel.cfg'))); assert.ok(Math.abs(full.Fe-64.314/100.0029)<1e-3);
});

test('toAcch su McaTheory.cfg: senza eccitazione né matrice, avvisi chiari', ()=>{
  const n=P.toAcch(P.parse(rd('McaTheory.cfg')));
  assert.equal(n.excitation, null); assert.equal(n.matrix, null); assert.equal(n.setup.anode, null); assert.equal(n.setup.atm, 'vac'); assert.equal(n.setup.beD, 0);
  assert.equal(n.setup.si, 5000); assert.equal(n.fit.xmin, 83); assert.equal(n.fit.gain, 0.0174);
  const kinds=n.warnings.map(w=>w.key+' '+w.msg).join('\n');
  assert.match(kinds, /\[attenuators\] Detector efficienza del rivelatore disattivata/);
  assert.match(kinds, /\[fit\] energy nessuna eccitazione né tubo/);
  assert.match(kinds, /\[attenuators\] Matrix nessuna matrice attiva/);
});

// solo le chiavi note in ref (non nulle): quelle ignote fromAcch le riempie con i valori del modello di PyMca
const known=(o, ref)=>{ if (!o || typeof o!=='object' || Array.isArray(o)) return o; const r={}; for (const k of Object.keys(ref)) if (ref[k]!=null) r[k]=known(o[k], ref[k]); return r; };
test('andata e ritorno: toAcch → fromAcch → stringify → parse → toAcch conserva tutto ciò che è mappato', ()=>{
  for (const f of ['Steel.cfg','McaTheory.cfg']){
    const n1=P.toAcch(P.parse(rd(f))), cfg=P.fromAcch(n1), n2=P.toAcch(P.parse(P.stringify(cfg)));
    assert.deepEqual(norm(n2.setup), norm(n1.setup), f+' setup'); assert.deepEqual(norm(n2.excitation), norm(n1.excitation), f+' eccitazione');
    assert.deepEqual(norm(known(n2.fit, n1.fit)), norm(known(n1.fit, n1.fit)), f+' fit (i valori ignoti li completa il modello di PyMca)'); assert.deepEqual(n2.peaks, n1.peaks, f+' righe'); assert.deepEqual(norm(n2.matrix), norm(n1.matrix), f+' matrice');
    if (n1.quant) assert.deepEqual(norm(known(n2.quant, n1.quant)), norm(known(n1.quant, n1.quant)), f+' concentrazioni');
    assert.ok(Array.isArray(cfg.warnings) && !Object.keys(cfg).includes('warnings'), 'avvisi non enumerabili: non finiscono nel file');
  }
});

test('PyMca vero sul .cfg rifatto da toAcch → fromAcch: stesso fit e stesse concentrazioni di Steel.cfg', ()=>{
  const a=VER.steel['Steel.cfg'], b=VER.steel['da-acch-Steel.cfg'];
  assert.equal(VER.pymca, '5.9.7'); assert.equal(VER.fisx, '1.3.2');
  assert.ok(Math.abs(a.chisq-b.chisq)/a.chisq<0.01, 'χ² '+a.chisq+' / '+b.chisq);
  for (const g of ['Cr K','Mn K','Fe Ka','Ni K','Cu K']){ assert.ok(Math.abs(a.areas[g]-b.areas[g])/a.areas[g]<0.005, 'area '+g);
    for (const s of ['sec0','sec1','sec2']) assert.ok(Math.abs(a[s][g]-b[s][g])/a[s][g]<0.01, s+' '+g+': '+a[s][g]+' / '+b[s][g]); }
});

test('casi sintetici: ipermetro completo, multistrato, elio, germanio, due filtri, attenuatore a rete, keV → canali', ()=>{
  const txt=['[detector]','zero = 0.0','gain = 0.02','detele = Ge','[fit]','hypermetflag = 15','energy = 17.48, 19.6','energyweight = 0.8, 0.2','energyflag = 1, 0','energyscatter = 1, 1','continuum = 2',
    '[attenuators]','atmosphere = 1, He1, 0.000166, 1.0, 1.0','Matrix = 1, MULTILAYER, 0.0, 0.0, 60.0, 30.0, 1, 100.0','BeamFilter0 = 1, Ottone, 8.5, 0.005, 1.0','BeamFilter1 = 1, Al1, 2.7, 0.01, 1.0',
    'window = 1, Be1, 1.848, 0.0008, 1.0','Detector = 1, Ge1, 5.32, 0.5, 1.0','absorber = 1, Mylar, 1.4, 0.0006, 0.5',
    '[multilayer]','Layer0 = 1, Vernice, 1.5, 0.002','Layer1 = 1, Cu1, 8.96, 0.1','Layer2 = 0, -, 0.0, 0.0',
    '[materials.Ottone]','CompoundList = Cu, Zn','CompoundFraction = 63, 37','[materials.Vernice]','CompoundList = C10H8O4, Pb3O4','CompoundFraction = 0.7, 0.3',
    '[materials.Mylar]','CompoundList = H1, C1, O1','CompoundFraction = 0.041959, 0.625017, 0.333025','[strana]','x = 1'].join('\n');
  const n=P.toAcch(txt);
  assert.deepEqual(n.excitation, [{E:17.48, w:0.8, scatter:true}], 'energia con flag 0 esclusa');
  assert.deepEqual(n.fit.hypermet, {gauss:true, st:true, lt:true, step:true}); assert.equal(n.fit.continuum, 'Linear');
  assert.deepEqual(n.setup.exc, [[17.48, 0.8, 1]]);
  assert.equal(n.setup.atm, 'he'); assert.equal(n.setup.det, 'Ge'); assert.equal(n.setup.si, 5000); assert.equal(n.setup.beD, 8); assert.equal(n.setup.psi1, 60); assert.equal(n.setup.psi2, 30);
  assert.equal(n.setup.filt.comp, 'Cu:63 Zn:37'); assert.equal(n.setup.filt.um, 50);
  assert.equal(n.matrix.name, 'Vernice'); assert.equal(n.matrix.multilayer.length, 2); assert.ok(n.matrix.comp.Pb>0.25 && n.matrix.comp.Pb<0.3);
  const w=n.warnings.map(x=>x.key+' '+x.msg).join('\n');
  for (const re of [/BeamFilter1.*un solo filtro/, /absorber.*a rete/, /absorber.*non lo prevede/, /\[multilayer\].*2 strati/, /angolo di diffusione fissato/, /coda corta, coda lunga, gradino/, /continuo analitico/, /\[strana\]/]) assert.match(w, re);
  // fromAcch: ipermetro, intervallo in keV, filtro di lega come materiale, elio
  const cfg=P.fromAcch({setup:{anode:'Rh', kv:40, psi1:60, psi2:30, beT:75, eps:20, atm:'he', d2:0.5, beD:8, si:450, det:'Si', filt:{comp:'Cu:63 Zn:37', rho:8.5, um:50}},
    excitation:[{E:17.48, w:1, scatter:true}], fit:{zero:0.01, gain:0.02, xminE:1.01, xmaxE:20.01, hypermet:{gauss:true, st:true, lt:false, step:true}}, peaks:{Cu:['K'], Pb:['L','M']},
    matrix:{name:'Bronzo antico', comp:{Cu:0.88, Sn:0.1, Pb:0.02}, rho:8.8, thickness:1}});
  assert.equal(cfg.fit.hypermetflag, 11); assert.equal(cfg.fit.xmin, 50); assert.equal(cfg.fit.xmax, 1000);
  assert.deepEqual(cfg.attenuators.atmosphere, [1,'He1',0.000166,0.5,1]); assert.equal(cfg.attenuators.BeamFilter0[1], 'Filtro_Acch'); assert.deepEqual(cfg.materials.Filtro_Acch.CompoundList, ['Cu','Zn']);
  assert.deepEqual(cfg.attenuators.Matrix, [1,'Bronzo_antico',8.8,1,60,30,0,90]); assert.equal(cfg.tube.alphax, 20); assert.equal(cfg.tube.anodedensity, 12.41);
  assert.equal(cfg.peaks.Cu, 'K'); assert.deepEqual(cfg.peaks.Pb, ['L','M']);
  const back=P.toAcch(P.stringify(cfg)); assert.equal(back.setup.filt.comp, 'Cu:63 Zn:37'); assert.deepEqual(back.fit.hypermet, {gauss:true, st:true, lt:false, step:true}); assert.equal(back.setup.eps, 20);
  // senza eccitazione: energy = None e la spiegazione per generarla in PyMca
  const tr=P.fromAcch({setup:{anode:'Rh', kv:50, ae:60, trans:1, tT:5}}); assert.equal(tr.tube.transmission, 1); assert.equal(tr.tube.anodethickness, 0.0005); assert.equal(tr.tube.alphae, 60);
  const trb=P.toAcch(P.stringify(tr)); assert.equal(trb.setup.trans, 1); assert.equal(trb.setup.tT, 5); assert.equal(trb.setup.ae, 60);
  const c2=P.fromAcch({setup:{anode:'W', kv:35}}); assert.equal(c2.fit.energy, 'None'); assert.match(c2.warnings.map(x=>x.msg).join(' '), /Tube/);
});

test('formule e materiali', ()=>{
  assert.deepEqual(P.formulaAtoms('Fe1O2H1'), {Fe:1, O:2, H:1}); assert.deepEqual(P.formulaAtoms('Ca(OH)2'), {Ca:1, O:2, H:2}); assert.equal(P.formulaAtoms('Pippo'), null); assert.equal(P.formulaAtoms('-'), null);
  const w=P.formulaMass('H2O1'); assert.ok(Math.abs(w.O-0.888)<1e-3);
  const cfg={materials:{A:{CompoundList:['B','Fe'], CompoundFraction:[1,1]}, B:{CompoundList:'Cu', CompoundFraction:1}}}; assert.deepEqual(P.materialComp('A', cfg), {Cu:0.5, Fe:0.5});
  const loop={materials:{A:{CompoundList:'A', CompoundFraction:1}}}; assert.equal(P.materialComp('A', loop), null, 'un materiale che contiene sé stesso non manda in ciclo');
});
test('sicurezza: un .cfg con sezioni o chiavi __proto__, constructor, prototype non tocca il prototipo degli oggetti', ()=>{
  const c=P.parse('[__proto__]\npolluted = 1\n[constructor]\nprototype = 2\n[a.__proto__]\nx = 3\n[peaks]\n__proto__ = K\nCu = K\nconstructor = L\n');
  assert.strictEqual(({}).polluted, undefined); assert.strictEqual(Object.prototype.polluted, undefined); assert.strictEqual(({}).x, undefined);
  assert.deepStrictEqual(Object.keys(c).sort(), ['peaks']); assert.deepStrictEqual(Object.keys(c.peaks), ['Cu']);
  const n=P.toAcch(c); assert.strictEqual(({}).polluted, undefined); assert.deepStrictEqual(Object.keys(n.peaks), ['Cu']);
});
