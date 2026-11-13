// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// R11 «Chemisorbimento» (SPEC §6): impulsi, dispersione metallica, statico, TPx, Kissinger, Redhead, Monti–Baiker.
// Dati sintetici con parametri noti (dichiarati) e formule pubblicate. SORP_CORE=percorso per una copia sabotata.
'use strict';
const test=require('node:test'), assert=require('node:assert'), path=require('path'), fs=require('fs');
const S=require(process.env.SORP_CORE ? path.resolve(process.env.SORP_CORE) : path.join(__dirname,'..','..','app','sorption-core.js'));
const LRE=(g,w)=>-Math.log10(Math.abs(g-w)/Math.abs(w)), rel=(g,w)=>Math.abs(g-w)/Math.abs(w);

test('impulsi: serie con uptake noto, formula chiusa, LRE ≥ 9; ⛔ se non saturati', ()=>{
  const Asat=1250, A=[0, 120, 610, 1100, 1249.9, 1250, 1250.1], loop=0.5, T=308.15, p=101.325;
  const R=S.pulseUptake({areas:A, loopVol:loop, T, p, frac:1, mass_g:0.1});
  const molPulse=loop*(273.15/T)/22414, want=A.reduce((s,a)=>s+Math.max(0,(Asat-a)/Asat),0)*molPulse*1e6;   // impulsi sopra la saturazione contano zero
  assert.ok(R.saturated); assert.ok(LRE(R.uptakeUmol, want)>=9, R.uptakeUmol+' '+want);
  const N=S.pulseUptake({areas:[0,200,600,900], loopVol:loop}); assert.ok(N.warn.some(w=>w.lv==='stop' && /non saturati/.test(w.t)));
  assert.ok(S.pulseUptake({areas:A}).warn.some(w=>/volume del loop/.test(w.t)));
});

test('dispersione, area metallica e diametro: Pt con aₘ = 0,08 nm² → d = 1,13/D nm (Bergeret e Gallezot)', ()=>{
  // 1% Pt, H₂ con SF = 2; uptake scelto per D = 0,5
  const D0=0.5, uptake=D0*0.01/195.084/2*1e6, R=S.metalDispersion({metal:'Pt', loading:1, SF:2, uptake});
  assert.ok(LRE(R.D, D0)>=9, 'D '+R.D); assert.ok(rel(R.d*R.D, 1.13)<0.01, 'd·D = '+R.d*R.D);
  assert.ok(LRE(R.areaSample, uptake*1e-6*6.02214076e23*2*0.08e-18)>=9);
  assert.ok(S.metalDispersion({metal:'Pt', loading:1, SF:2, uptake:uptake*3}).warn.some(w=>/oltre il 100%/.test(w.t)));
  assert.ok(S.metalDispersion({metal:'Pt', SF:2, uptake}).warn.some(w=>w.lv==='stop' && /carico/.test(w.t)));
  assert.ok(S.metalDispersion({metal:'Pt', loading:1, uptake}).warn.some(w=>w.lv==='stop' && /stechiometria/.test(w.t)));
});

test('statico (ASTM D3908): combinata − ripetuta estrapolate a p = 0, esatto su rette note', ()=>{
  const p=[10,20,30,40,50,60], c={p, n:p.map(v=>42+0.05*v)}, r={p, n:p.map(v=>12+0.04*v)}, R=S.staticChem(c, r, {pa:20});
  assert.ok(LRE(R.total,42)>=9 && LRE(R.weak,12)>=9 && LRE(R.strong,30)>=9);
});

test('TPR: area di un segnale sintetico con base lineare entro lo 0,5%, fattore TCD da CuO, grado di riduzione', ()=>{
  const t=[], T=[], s=[]; for (let i=0;i<=1400;i++){ const tt=i*0.05; t.push(tt); T.push(50+10*tt); s.push(0.3+0.002*tt+4*Math.exp(-((((50+10*tt)-350)/30)**2))+1e-3*Math.sin(i)); }
  const want=4*30*Math.sqrt(Math.PI)/10;   // area nel tempo: ∫ = A σ √π / β
  const F=S.tcdFactor({mass_mg:10, area:want}), R=S.tpx({t, T, s, factor:F.factor, theo:F.umol});
  assert.ok(rel(R.area, want)<0.005, 'area '+R.area+' contro '+want); assert.ok(Math.abs(R.Tm-350)<0.6);
  assert.ok(Math.abs(R.reduction-1)<0.005); assert.ok(LRE(F.umol, 10/1000/79.545*1e6)>=12);
  assert.ok(S.tpx({t, T, s}).warn.some(w=>w.lv==='stop' && /fattore TCD/.test(w.t)));
  const sd=s.map((v,i)=>v+0.6*i/1400); assert.ok(S.tpx({t, T, s:sd, factor:1}).warn.some(w=>/Deriva/.test(w.t)));
});

test('Kissinger su TPD simulati con Polanyi–Wigner (E noto, 4 rampe) entro l\'1%; ⛔ con meno di 3 rampe', ()=>{
  for (const E of [90, 140]){ const L=[2,5,10,20].map(beta=>{ const sim=S.polanyiWigner({E, nu:1e13, beta, T0:300, T1:900, dt:0.02}); let k=0; sim.rate.forEach((r,i)=>{ if (r>sim.rate[k]) k=i; }); return {beta, Tm:sim.T[k]}; });
    const K=S.kissinger(L); assert.ok(rel(K.E, E)<0.01, `E ${K.E} contro ${E}`); }
  assert.ok(S.kissinger([{beta:5,Tm:500},{beta:10,Tm:510}]).warn.some(w=>w.lv==='stop'));
});

test('Redhead (primo ordine, ν noto) entro il 2% per 10⁸ < ν/β < 10¹³ K⁻¹, con ⚠ su ν supposto', ()=>{
  for (const [E, nu, beta] of [[100, 1e13, 10], [60, 1e11, 30], [150, 1e15, 5]]){ const sim=S.polanyiWigner({E, nu, beta, T0:200, T1:1200, dt:0.02}); let k=0; sim.rate.forEach((r,i)=>{ if (r>sim.rate[k]) k=i; });
    const R=S.redhead(sim.T[k], beta, nu); assert.ok(rel(R.E, E)<0.02, `${R.E} contro ${E}`); assert.ok(R.warn.length); }
});

test('Monti–Baiker: K = S0/(V*·C0), avviso fuori da 55–140 s', ()=>{
  const M=S.montiBaiker({S0:100, flow:0.5, frac:0.05}); assert.ok(LRE(M.K, 100/(0.5*0.05*1e6/22414))>=12); assert.strictEqual(M.warn.length, 0);
  assert.ok(S.montiBaiker({S0:1000, flow:0.5, frac:0.05}).warn.length===1);
});

test('lettore TPx tollerante (DEDOTTO) sulla fixture sintetica', ()=>{
  const r=S.parseTPx(fs.readFileSync(path.join(__dirname,'..','fixtures','sorption','tpr-sintetico.txt'),'utf8'));
  assert.strictEqual(r.kind, 'TPR'); assert.strictEqual(r.T.length, 701); assert.ok(Math.abs(r.T[0]-323.15)<1e-9);
  assert.strictEqual(S.parseSorption(fs.readFileSync(path.join(__dirname,'..','fixtures','sorption','tpr-sintetico.txt'),'utf8')), null);
});
