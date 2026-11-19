// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// XRF 3.1: modello completo del picco (ipermetro, fughe Kα e Kβ del rivelatore, picchi somma, Noise e Fano liberi, calibrazione quadratica,
// Levenberg–Marquardt). Spettri SINTETICI costruiti qui con verità nota; il confronto con uno spettro reale (Steel.spe di PyMca) è in
// test/unit/xrf-pymca-confronto.test.js.
const test=require('node:test'), assert=require('node:assert'); const C=require('./load-core.js');
function rng(seed){ let s=seed>>>0||1; return ()=>{ s^=s<<13; s>>>=0; s^=s>>>17; s^=s<<5; s>>>=0; return s/4294967296; }; }
function poisson(r, l){ if (l>40){ let u=0,v=0; while(!u)u=r(); while(!v)v=r(); return Math.max(0, Math.round(l+Math.sqrt(l)*Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v))); } let L=Math.exp(-l), k=0, p=1; do { k++; p*=r(); } while (p>L); return k-1; }
const SH={noise:0.105, fano:0.118, st:0.07, sts:0.6, lt:0.015, lts:10, step:2e-4};
// spettro sintetico: famiglie K con le intensità relative della banca dati, ipermetro, fughe del Si, termine quadratico sull'asse, picchi somma
function synth(areas, o){ o=o||{}; const n=1400, dx=0.0125, xs=Float64Array.from({length:n},(_,i)=>0.5+i*dx), ys=new Float64Array(n), r=rng(o.seed||7);
  const q=o.quad||0, Etrue=x=>x+q*x*x, sh=Object.assign({flags:15}, SH, o.sh||{});
  const fw=E=>Math.sqrt(sh.noise**2+2.3548**2*0.00385*sh.fano*E);
  for (const [el, A] of Object.entries(areas)){ const F=C.FP.el[el].fam.K, sr=F.reduce((t,f)=>t+f[2],0);
    for (const [nm,E,rel] of F){ const N=A*rel/sr, es=o.gauss ? [] : C.xrfEscape(E,'Si'), eT=es.reduce((t,e)=>t+e[1],0), sg=fw(E)/2.3548;
      for (let i=0;i<n;i++){ const x=Etrue(xs[i]); ys[i]+=N*(1-eT)*dx*(o.gauss ? Math.exp(-0.5*((x-E)/sg)**2)/(sg*2.5066) : C.xrfHyperAt(x-E, sg, sh)); }
      for (const [Ee, eta] of es){ const s2=fw(Ee)/2.3548; for (let i=0;i<n;i++){ const x=Etrue(xs[i]); ys[i]+=N*eta*dx*Math.exp(-0.5*((x-Ee)/s2)**2)/(s2*2.5066); } } } }
  if (o.pile){ const P=new Float64Array(n), k0=Math.round(xs[0]/dx); for (let i=0;i<n;i++) for (let j=i;j<n && i+j+k0<n;j++) P[i+j+k0]+=(i===j?1:2)*ys[i]*ys[j]; for (let i=0;i<n;i++) ys[i]+=o.pile*P[i]; }
  for (let i=0;i<n;i++) ys[i]=poisson(r, ys[i]+(o.bg||30)*(1+0.02*xs[i]));
  return {xs, ys}; }
const S0=()=>C.fpSetup({anode:'Mo', kv:20, exc:[[19.0,1,0]]});   // eccitazione monocromatica senza diffusione: solo le righe del campione

test('erfc ed erfcx: accordo con i valori di riferimento (Abramowitz e Stegun)', ()=>{
  for (const [x, v] of [[0,1],[0.5,0.4795001222],[1,0.1572992071],[2,0.004677734981],[3,2.209049700e-5],[-1,1.842700793]]) assert.ok(Math.abs(C.erfcA(x)-v)<=2e-7*Math.max(1,v)+1e-12, `erfc(${x})`);
  for (const x of [0.3, 2, 5, 12]) assert.ok(Math.abs(C.erfcxA(x)-C.erfcA(x)*Math.exp(x*x))/C.erfcxA(x)<1e-6, `erfcx(${x})`);
});
test('ipermetro: area gaussiana 1, aree delle code pari ai rapporti dichiarati, gradino piatto a sinistra (definizioni di PyMca)', ()=>{
  const sg=0.06, integ=sh=>{ let t=0; for (let z=-40; z<3; z+=0.0005) t+=C.xrfHyperAt(z, sg, sh)*0.0005; return t; };
  assert.ok(Math.abs(integ({flags:1})-1)<1e-4, 'gaussiana');
  assert.ok(Math.abs(integ({flags:2, st:0.05, sts:0.5})-0.05)<1e-4, 'coda corta');
  assert.ok(Math.abs(integ({flags:4, lt:0.02, lts:1})-0.02)<1e-4, 'coda lunga');
  const h=1e-3, v=C.xrfHyperAt(-2, sg, {flags:8, step:h}); assert.ok(Math.abs(v-h/(sg*Math.sqrt(2*Math.PI)))<1e-9, 'gradino');
  assert.ok(C.xrfHyperAt(1, sg, {flags:15, st:0.05, sts:0.5, lt:0.02, lts:10, step:1e-4})<1e-12, 'nulla molto sopra il picco');
  for (const z of [5, 50, 600]) assert.ok(Number.isFinite(C.xrfHyperAt(z*sg, sg, {flags:6, st:0.05, sts:0.01, lt:0.02, lts:0.02})), 'nessun overflow');
});
test('fughe del rivelatore: Kα e Kβ del Si e del Ge entro il 5% di PyMca 5.9.7 (Elements.getEscape)', ()=>{
  const ref=[['Si',6.4,3.1324e-3,9.7773e-5],['Si',8.04,1.7790e-3,5.6157e-5],['Si',17.48,1.9286e-4,6.1744e-6],['Ge',17.48,8.2137e-2,1.3902e-2]];
  for (const [d, E, ka, kb] of ref){ const es=C.xrfEscape(E, d), a=es.find(q=>q[2]==='Ka'), b=es.find(q=>q[2]==='Kb');
    assert.ok(Math.abs(a[1]/ka-1)<0.05, `${d} Kα a ${E}: ${a[1]} invece di ${ka}`); assert.ok(Math.abs(b[1]/kb-1)<0.06, `${d} Kβ a ${E}: ${b[1]} invece di ${kb}`); }
  assert.deepEqual(C.xrfEscape(1.5,'Si'), [], 'sotto lo spigolo K niente fughe');
});
test('Levenberg–Marquardt con limiti: ritrova i parametri di una esponenziale e rispetta i limiti', ()=>{
  const t=Array.from({length:40},(_,i)=>i*0.25), y=t.map(x=>3*Math.exp(-0.7*x)+0.2), res=p=>Float64Array.from(t,(x,i)=>p[0]*Math.exp(-p[1]*x)+p[2]-y[i]);
  const R=C.lmBox(res, [1,0.2,0], [0,0,-1], [10,5,1], {maxIter:60, tol:1e-12}); assert.ok(Math.abs(R.p[0]-3)<1e-4 && Math.abs(R.p[1]-0.7)<1e-4 && Math.abs(R.p[2]-0.2)<1e-4, String(R.p));
  const B=C.lmBox(res, [1,0.2,0], [0,0,0.5], [10,5,1], {maxIter:60}); assert.ok(B.p[2]>=0.5, 'limite inferiore');
});
test('modello completo su uno spettro con code, fughe e asse quadratico: aree entro il 2%, Noise e Fano ritrovati, χ² vicino a 1', ()=>{
  const A={Cr:4e5, Fe:1.2e6, Ni:3e5}, sp=synth(A, {quad:4e-4, seed:3}), S=S0();
  const R=C.xrfFitLines(sp.xs, sp.ys, ['Cr','Fe','Ni'], S, {model:'hypermet', quad:true, lo:3, hi:15, pileup:false, bgMode:'spline'});
  assert.equal(R.peakModel, 'hypermet'); assert.ok(R.chi2r<1.35, 'χ²ᵣ '+R.chi2r.toFixed(2));
  for (const e in A){ const tot=R.comps[e+' K'].area; assert.ok(Math.abs(tot/A[e]-1)<0.02, `${e}: area ${tot.toFixed(0)} invece di ${A[e]}`); }
  assert.ok(Math.abs(R.noise-SH.noise)<0.012, 'noise '+R.noise); assert.ok(Math.abs(R.fano-SH.fano)<0.02, 'fano '+R.fano);
  assert.ok(Math.abs(R.quad-4e-4)<1.2e-4, 'termine quadratico '+R.quad);   // correlato con guadagno e scostamento
  const G=C.xrfFitLines(sp.xs, sp.ys, ['Cr','Fe','Ni'], S, {lo:3, hi:15});   // il modello gaussiano della 3.0 su questo spettro: χ² molto più alto
  assert.ok(G.chi2r>3*R.chi2r, `gaussiano ${G.chi2r.toFixed(1)} contro ${R.chi2r.toFixed(2)}`);
});
test('Fano fissato: resta al valore dato', ()=>{
  const sp=synth({Fe:5e5}, {seed:5}), R=C.xrfFitLines(sp.xs, sp.ys, ['Fe'], S0(), {model:'hypermet', fano:0.114, fixFano:true, lo:3, hi:12, pileup:false});
  assert.equal(R.fano, 0.114); assert.ok(!R.lm.free.includes('fano'));
});
test('picchi somma: con l\'opzione attiva il falso elemento sulla somma Fe Kα + Fe Kα sparisce', ()=>{
  const sp=synth({Fe:4e6}, {pile:2.5e-6, seed:11}), S=S0();   // Fe Kα + Fe Kα = 12,80 keV, vicino a Pb Lβ (12,61) e Br Kβ (13,29): qui un «Se» o «Br» non c'è
  const on=C.xrfFitLines(sp.xs, sp.ys, ['Fe','Br'], S, {model:'hypermet', lo:3, hi:15, pileup:true}), off=C.xrfFitLines(sp.xs, sp.ys, ['Fe','Br'], S, {model:'hypermet', lo:3, hi:15, pileup:false});
  assert.ok(on.pile && on.pile.counts>0, 'picchi somma adattati');
  assert.ok(on.chi2r<off.chi2r, `χ² ${on.chi2r.toFixed(2)} con, ${off.chi2r.toFixed(2)} senza`);
  const br=x=>x.comps['Br K'] ? x.comps['Br K'].area : 0; assert.ok(br(on)<0.3*br(off) || br(off)===0, `Br con ${br(on).toFixed(0)}, senza ${br(off).toFixed(0)}`);
});
test('xrfFP con il modello completo: la quantificazione resta coerente (lega Fe–Cr–Ni sintetica, eccitazione monocromatica)', ()=>{
  const S=S0(), comp={Fe:0.70, Cr:0.19, Ni:0.11}, I=C.fpIntensities([{comp, t:Infinity}], S, [['Fe','Ka'],['Cr','Ka'],['Ni','Ka'],['Fe','Kb'],['Cr','Kb'],['Ni','Kb']]);
  const A={}; for (const e in comp){ const F=C.FP.el[e].fam.K, ka=F.find(f=>f[0]==='Ka')[2], sr=F.reduce((t,f)=>t+f[2],0); A[e]=I[e+' Ka']*sr/ka; }
  const k=2e6/Math.max(...Object.values(A)); for (const e in A) A[e]*=k;
  const sp=synth(A, {seed:2}), R=C.xrfFP(sp.xs, sp.ys, Object.keys(comp), S, {mode:'norm', model:'hypermet', lo:3, hi:15, pileup:false});
  for (const e in comp) assert.ok(Math.abs(R.Q.res[e].w/(100*comp[e])-1)<0.04, `${e}: ${R.Q.res[e].w.toFixed(2)}% invece di ${100*comp[e]}%`);
});
test('eccitazione a lista di energie: picchi Rayleigh e Compton per ogni energia marcata «diffusione»', ()=>{
  const S=C.fpSetup({anode:'Ag', kv:30, exc:[[16,1,1],[8,0.1,0]]}); assert.equal(S.kv, 16); assert.deepEqual(S.exc, [[16,1,1],[8,0.1,0]]);
  const P=C.fpPrep(S); assert.equal(P.nb, 2); assert.equal(C.xrfComptonId(S), 'Compton 16.00 keV');
  const xs=Float64Array.from({length:1500},(_,i)=>i*0.012), ys=Float64Array.from(xs, x=>50+1e4*Math.exp(-0.5*((x-16)/0.08)**2)+2e4*Math.exp(-0.5*((x-15.2)/0.2)**2));
  const R=C.xrfFitLines(xs, ys, ['Fe'], S, {lo:2, hi:17.5}); assert.ok(R.comps['Rayleigh 16.00 keV'] && R.comps['Compton 16.00 keV'], 'componenti di diffusione');
});
test('lettura .mca con lo slot vuoto «Calibration3: 0 0» (Bruker ELIO): il punto incoerente non entra nella calibrazione; un «0 0» vero sì', ()=>{
  const body=Array.from({length:4096},(_,i)=>String(i===760?50000:i===2030?9000:i%7)).join('\n');
  const elio='# S1\n# Tube Anode:  Rh\n# Tube Voltage: 40\n# MCA Channels: 4096\n# Calibration1: 760 8,050\n# Calibration2: 2030 22,150\n# Calibration3: 0 0\n#\n'+body;
  const p=C.parseXRF(elio), at=ch=>{ let b=0; for (let i=0;i<p.ys.length;i++) if (p.ys[i]===(ch===760?50000:9000)) b=i; return p.xs[b]; };
  assert.ok(Math.abs(at(760)-8.05)<1e-6 && Math.abs(at(2030)-22.15)<1e-6, `canali 760 e 2030: ${at(760)} e ${at(2030)} keV`);
  const ok='# Tube Anode: Rh\n# MCA Channels: 2048\n# Calibration1: 0 0\n# Calibration2: 2047 40,94\n#\n'+Array.from({length:2048},(_,i)=>String(1+i%5)).join('\n'), q=C.parseXRF(ok);
  assert.ok(Math.abs(q.xs[q.xs.length-1]-40.94)<1e-9 && Math.abs(q.xs[1]-q.xs[0]-0.02)<1e-9, 'calibrazione con «0 0» vero invariata');
});
test('export Bruker ELIO: .mca (con «Calibration3: 0 0») e .spt LIDAQ (Coefficients = 0 0 0 0 e due punti) danno lo stesso asse e lo stesso tempo vivo', ()=>{
  const counts=Array.from({length:4096},(_,i)=>i<30?0:(i===760?9000:i===2030?700:5+(i%3)));
  const mca='# S1\n# Tube Anode:  Rh\n# Tube Voltage: 40\n# Live time: 85,125\n# MCA Channels: 4096\n# Calibration1: 760 8,050\n# Calibration2: 2030 22,150\n# Calibration3: 0 0\n#\n'+counts.join('\n');
  const spt='[LIDAQ1ch Spectrum]\nStart Time = 01/01/2026 10:00:00\n\nRun Time = 90000 msec\nLive Time = 85125 msec\n\n[CALIBRATION]\nCoefficients = 0 0 0 0\nCoefficients points number = 0\n760 8,050\n2030 22,150\n\n[ROIs]\nROIs Number = 0\n\n[DATA]\n'+counts.join('\n');
  const a=C.parseXRF(mca), b=C.parseXRF(spt);
  assert.deepStrictEqual([a.xrf.cal.a, a.xrf.cal.b].map(v=>v.toFixed(9)), [b.xrf.cal.a, b.xrf.cal.b].map(v=>v.toFixed(9)), 'stessa calibrazione');
  assert.strictEqual(a.xs.length, b.xs.length); assert.ok(Math.abs(a.xs[0]-b.xs[0])<1e-12);
  assert.ok(Math.abs(parseFloat(a.xrf.live.replace(',','.'))-85.125)<1e-9 && b.xrf.liveMs && +b.xrf.live===85125, 'tempo vivo in s (.mca) e in ms (.spt)');
});
test('revisione 3.1: nel fit completo le righe del tubo diffuse non finiscono fra le aree degli elementi (chiave «null»)', ()=>{
  const sp=synth({Fe:5e5}, {seed:9}), R=C.xrfFitLines(sp.xs, sp.ys, ['Fe'], C.fpSetup({anode:'Mo', kv:20, exc:[[17.48,1,1]]}), {model:'hypermet', lo:3, hi:18, pileup:false});
  assert.deepStrictEqual(Object.keys(R.area), ['Fe']);
});
