// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// R10 «Fisisorbimento»: calcoli di app/sorption-core.js contro soluzioni analitiche, isoterme sintetiche con parametri noti
// e il report PUBBLICO di Kaomi for Autosorb 2.02 (test/validation/sorption/kaomi-mesopore-pubblico.json, fonte nel file).
// SORP_CORE=percorso permette di provare una copia sabotata: i test devono fallire.
'use strict';
const test=require('node:test'), assert=require('node:assert'), path=require('path'), fs=require('fs');
const S=require(process.env.SORP_CORE ? path.resolve(process.env.SORP_CORE) : path.join(__dirname,'..','..','app','sorption-core.js'));
const SY=require('./sorption/sintetiche.js'), REF=require('./sorption/kaomi-mesopore-pubblico.json');
const LRE=(got, want)=>want===0 ? -Math.log10(Math.abs(got)) : -Math.log10(Math.abs(got-want)/Math.abs(want));
const rel=(got, want)=>Math.abs(got-want)/Math.abs(want);
const N2={gas:'Nitrogen', sigma:0.162, rhoL:0.806, gamma:8.85, M:28.0134, T:77.35};
const isoOf=(x, n, meta)=>S.buildIso({x, n, nUnit:'cm3STP/g', meta:Object.assign({}, N2, meta||{})});
const kaomiIso=()=>isoOf(REF.isotherm.map(r=>r[2]), REF.isotherm.map(r=>r[4]), {thick:'carbon-black', instrBET:{x0:REF.bet.x[0], x1:REF.bet.x[REF.bet.x.length-1]}});

test('BET: isoterma BET esatta, LRE ≥ 9 su pendenza, intercetta, C e area', ()=>{
  for (const [nm, C] of [[45, 120], [10.5, 30], [200, 800], [2.2, 8]]){
    const x=SY.grid(0.05, 0.3, 11), n=x.map(v=>SY.betN(v, nm, C)), F=S.betFit(x, n, 0, x.length-1);
    const P=S.params(isoOf(x,n)), area=nm/22414*6.02214076e23*0.162e-18;
    assert.ok(LRE(F.slope, (C-1)/(nm*C))>=9, 'pendenza '+F.slope); assert.ok(LRE(F.icpt, 1/(nm*C))>=9, 'intercetta');
    assert.ok(LRE(F.C, C)>=9, 'C '+F.C); assert.ok(LRE(S.betArea(F.nm, P), area)>=9, 'area');
    // per un'isoterma BET esatta 1/(√C+1) è proprio la p/p₀ a cui n = nₘ: il criterio (d) è soddisfatto
    assert.ok(Math.abs(S.xAtN(x, n, nm)-1/(Math.sqrt(C)+1))<0.01*F.xm || !(nm<n[n.length-1] && nm>n[0]));
  }
});

test('BET sul report pubblico di Kaomi: stessi 7 punti → 198,568 m²/g entro lo 0,01%', ()=>{
  const A=S.analyze(kaomiIso()), B=A.bet.instr;
  assert.strictEqual(B.npts, 7);
  assert.ok(rel(B.area, REF.bet.area)<1e-4, 'area '+B.area);
  assert.ok(rel(B.C, REF.bet.C)<1e-4, 'C '+B.C);
  assert.ok(Math.abs(B.r-REF.bet.r)<1e-6, 'r '+B.r);
  // Kaomi scrive la funzione BET con W = massa di gas adsorbito (g/g): pendenza e intercetta × 22 414/M
  assert.ok(rel(B.slope*22414/REF.header.M, REF.bet.slope)<1e-4, 'pendenza '+B.slope*22414/REF.header.M);
  assert.ok(rel(B.icpt*22414/REF.header.M, REF.bet.intercept)<1e-3, 'intercetta '+B.icpt*22414/REF.header.M);
  assert.ok(B.crit.ok, 'l\'intervallo di Kaomi rispetta i criteri di Rouquerol');
  // con 22 711 cm³/mol (100 kPa) l'area cala dell'1,3% (SPEC §1)
  const Bi=S.analyze(kaomiIso(), {stp:'iupac'}).bet.instr; assert.ok(Math.abs(Bi.area/B.area-22414/22710.95)<1e-9);
});

test('volume totale dei pori, diametro limite e diametro medio come Kaomi', ()=>{
  const iso=kaomiIso(), P=S.params(iso), V=S.totalPoreVolume(iso, P, 0.99), B=S.bet(iso, P).instr;
  assert.ok(Math.abs(V.x-REF.tpv.x)<1e-4); assert.ok(rel(V.V, REF.tpv.V)<1e-4, 'V '+V.V);
  assert.ok(rel(V.dmax, REF.tpv.dmax_A)<5e-4, 'diametro limite '+V.dmax);
  assert.ok(rel(S.avgPoreDiameter(V.V, B.area), REF.avgDiameter_A)<2e-4, 'diametro medio');
});

test('BJH sui due rami contro le tabelle di Kaomi: cumulati ≤ 0,2%, moda nello stesso intervallo, diametri ≤ 0,1%', ()=>{
  const iso=kaomiIso(), P=S.params(iso);
  for (const [br, R] of [['ads', REF.bjhAds], ['des', REF.bjhDes]]){
    const B=S.bjh(iso, P, {branch:br, method:'bjh'});
    assert.strictEqual(B.rows.length, R.rows.length, br+': numero di intervalli');
    B.rows.forEach((o,i)=>assert.ok(rel(o.d, R.rows[i][0])<1e-3, `${br} riga ${i}: ${o.d} contro ${R.rows[i][0]}`));
    // SPEC: ≤ 1%; qui 0,2%, così si distingue la variante di BJH di Kaomi (R = (r̄p/(r̄k+Δt/2))²) dalle altre (−0,4/−0,6%)
    assert.ok(rel(B.Vtot, R.Vtot)<0.002, br+' volume '+B.Vtot); assert.ok(rel(B.Atot, R.Atot)<0.002, br+' area '+B.Atot);
    B.rows.forEach((o,i)=>assert.ok(Math.abs(o.cumV-R.rows[i][1])<0.01*R.Vtot, `${br} cumulato riga ${i}`));
    assert.ok(rel(B.mode, R.mode_A)<1e-3, br+' moda '+B.mode);
    const D=S.bjh(iso, P, {branch:br, method:'dh'}); assert.ok(rel(D.Vtot, R.Vtot)<0.01, br+' DH '+D.Vtot);
  }
});

test('BJH: distribuzione nota ricostruita (pori cilindrici sintetici, stessa geometria)', ()=>{
  // isoterma costruita in avanti: pori di raggio rp si riempiono quando x supera la x di Kelvin+t
  const P=S.params(isoOf([0.1,0.2],[1,2])), key='harkins-jura', xs=SY.grid(0.40, 0.985, 80), rps=[30, 45, 60, 90], vps=[0.05, 0.12, 0.08, 0.04];
  // volume di liquido: pori pieni (r_p ≤ r_k(x)+t) più film di spessore t nei pori vuoti: V_film = Vp (1 − ((rp−t)/rp)²)
  const V=x=>{ const t=S.tOf(x,key), rk=S.kelvinR(x,P); let v=0; rps.forEach((r,i)=>{ v+= (r<=rk+t) ? vps[i] : vps[i]*(1-((r-t)/r)**2); }); return v; };
  const iso=isoOf(xs, xs.map(x=>V(x)/P.liqPerStp)), B=S.bjh(iso, P, {branch:'ads', method:'bjh', thick:key, xmin:0.4});
  const tot=vps.reduce((a,b)=>a+b,0); assert.ok(rel(B.Vtot, tot)<0.02, 'volume '+B.Vtot+' contro '+tot);
  for (const [i,r] of rps.entries()){ const near=B.rows.filter(o=>Math.abs(o.rp-r)<0.15*r).reduce((s,o)=>s+o.Vp,0); assert.ok(rel(near, vps[i])<0.03, `poro ${r} Å: ${near} contro ${vps[i]}`); }
});

// riferimento indipendente per la scelta dell'intervallo: scritto da capo, senza usare il modulo. off = criterio spento (prova di sensibilità)
function refWindow(x, n, minP, off){
  const res=[]; for (let a=0;a<x.length;a++) for (let b=a+minP-1;b<x.length;b++){
    let ok=true; if (off!=='a') for (let i=a+1;i<=b;i++) if (!(n[i]*(1-x[i])>n[i-1]*(1-x[i-1]))) ok=false; if (!ok) continue;
    const X=x.slice(a,b+1), Y=X.map((v,k)=>v/(n[a+k]*(1-v))), m=X.length, sx=X.reduce((s,v)=>s+v,0), sy=Y.reduce((s,v)=>s+v,0), sxx=X.reduce((s,v)=>s+v*v,0), sxy=X.reduce((s,v,k)=>s+v*Y[k],0), syy=Y.reduce((s,v)=>s+v*v,0);
    const sl=(m*sxy-sx*sy)/(m*sxx-sx*sx), ic=(sy-sl*sx)/m; if (!(ic>0) || !(sl/ic+1>0)) continue; const C=1+sl/ic, nm=1/(sl+ic), xm=1/(Math.sqrt(C)+1);
    if (off!=='c' && (xm<X[0] || xm>X[m-1])) continue; let xn=NaN; for (let i=1;i<n.length;i++) if ((n[i-1]-nm)*(n[i]-nm)<=0){ xn=x[i-1]+(nm-n[i-1])*(x[i]-x[i-1])/(n[i]-n[i-1]); break; }
    if (off!=='d' && !(Math.abs(xn-xm)<=0.1*xm)) continue; const r=(m*sxy-sx*sy)/Math.sqrt((m*sxx-sx*sx)*(m*syy-sy*sy)); res.push({a,b,m,r}); }
  res.sort((p,q)=>q.m-p.m || q.r-p.r || p.a-q.a); return res[0]||null;
}
// 20 isoterme sintetiche scelte perché, tutte insieme, ogni criterio (a, c, d) cambia la finestra in almeno un caso
const FAM={micro:C=>v=>SY.micro(v,{K:C*20,nL:100+C/4}), microlow:C=>v=>SY.micro(v,{K:C*200,nL:150,ext:40}), mix:C=>v=>SY.betN(v,25,C)+SY.micro(v,{K:C*40,nL:40,ext:0}),
  gab:C=>v=>{ const k=0.85; return 30*C*k*v/((1-k*v)*(1+(C-1)*k*v)); }, step:C=>v=>SY.betN(v,30,C)+60/(1+Math.exp(-(v-0.15)/0.02))};
const CASES=[['micro',40,1e-4],['micro',150,1e-4],['micro',400,1e-4],['mix',5,1e-4],['mix',5,0.005],['mix',15,1e-4],['mix',40,1e-4],['mix',150,1e-4],['step',5,0.005],['step',15,0.005],
  ['step',40,0.005],['step',150,0.005],['step',400,1e-4],['micro',5,0.005],['micro',15,0.005],['gab',400,1e-4],['microlow',150,0.005],['step',5,1e-4],['gab',15,0.005],['micro',400,0.005]];
test('BET automatico (criteri di Rouquerol): 20 isoterme sintetiche, stessa finestra di un riferimento indipendente', ()=>{
  const changed={a:0,c:0,d:0};
  CASES.forEach(([f,C,lo],i)=>{
    const x=SY.grid(lo, 0.45, 30, true), n=x.map(FAM[f](C)), iso=isoOf(x, n), A=S.betAuto(iso), R=refWindow(x, n, 3), key=w=>w?w.a+'-'+w.b:'-';
    for (const k of ['a','c','d']) if (key(refWindow(x,n,3,k))!==key(R)) changed[k]++;
    if (!R){ assert.strictEqual(A.best, null, `isoterma ${i+1} (${f}, C ${C}): nessuna finestra valida`); return; }
    assert.ok(A.best, `isoterma ${i+1}: trovata una finestra`); assert.deepStrictEqual([A.best.i0, A.best.i1], [R.a, R.b], `isoterma ${i+1} (${f}, C ${C}, da ${lo})`);
  });
  for (const k of ['a','c','d']) assert.ok(changed[k]>=1, `il criterio ${k} deve contare in almeno un caso (sensibilità del test)`);
  // per costruzione: isoterma BET pura → tutti i punti sono validi, vince l'intervallo intero
  const x=SY.grid(0.02,0.3,15), iso=isoOf(x, x.map(v=>SY.betN(v,40,100))), b=S.betAuto(iso).best; assert.deepStrictEqual([b.i0,b.i1],[0,14]);
});

test('Langmuir: isoterma esatta → lineare LRE ≥ 8, non lineare 1e-6 relativo', ()=>{
  const nm=180, K=35, x=SY.grid(0.01,0.5,20), iso=isoOf(x, x.map(v=>nm*K*v/(1+K*v))), L=S.langmuir(iso, S.params(iso), [0.01,0.5]);
  assert.ok(LRE(L.lin.nm, nm)>=8 && LRE(L.lin.K, K)>=8, 'lineare'); assert.ok(rel(L.nl.nm, nm)<1e-6 && rel(L.nl.K, K)<1e-6, 'non lineare '+L.nl.nm+' '+L.nl.K);
});

test('DR e DA: parametri noti, LRE ≥ 8 (lineare) e 1e-6 relativo (DA non lineare)', ()=>{
  const P=S.params(isoOf([0.1],[1])), k=P.liqPerStp, R=8.314462618, T=77.35;
  for (const [W0, E, nn, kind] of [[0.35, 9, 2, 'dr'], [0.21, 14, 1.7, 'da'], [0.5, 7, 3.2, 'da']]){
    const x=SY.grid(1e-6, 0.1, 25, true), W=x.map(v=>W0*Math.exp(-Math.pow(R*T*Math.log(1/v)/1000/E, nn))), iso=isoOf(x, W.map(w=>w/k)), D=S.drda(iso, P, [1e-6,0.1], kind);
    if (kind==='dr'){ assert.ok(LRE(D.W0,W0)>=8 && LRE(D.E,E)>=8, 'DR'); } else { assert.ok(rel(D.W0,W0)<1e-6 && rel(D.E,E)<1e-6 && rel(D.n,nn)<1e-6, `DA ${D.W0} ${D.E} ${D.n}`); }
  }
});

test('spessori statistici dalle equazioni pubblicate e t-plot con parametri noti (≤ 0,1%)', ()=>{
  assert.ok(rel(S.tOf(0.5,'harkins-jura'), Math.sqrt(13.99/(0.034+Math.log10(2))))<1e-12);
  assert.ok(rel(S.tOf(0.5,'carbon-black'), 0.88*0.25+6.45*0.5+2.98)<1e-12);
  assert.ok(rel(S.tOf(0.5,'halsey'), 3.54*Math.pow(5/Math.LN2,1/3))<1e-12);
  const P=S.params(isoOf([0.1],[1])), k=P.liqPerStp, Sx=85, Vmi=0.12;
  const x=SY.grid(0.1,0.6,26), iso=isoOf(x, x.map(v=>(Vmi+Sx*S.tOf(v,'harkins-jura')*1e-4)/k)), T=S.tPlot(iso, P, {x:[0.2,0.5]}, 'harkins-jura');
  assert.ok(rel(T.Sext, Sx)<1e-3 && rel(T.Vmicro, Vmi)<1e-3, `${T.Sext} ${T.Vmicro}`);
  // αs: campione = a·riferimento + b
  const ref={x:SY.grid(0.01,0.95,40), n:null, S:20}; ref.n=ref.x.map(v=>SY.betN(v*0.9,5,60)); const iso2=isoOf(x, x.map(v=>3*S.interp(ref.x, ref.n, v)+40)), A=S.alphaS(iso2, P, ref, {a:[0.4,1.5]});
  assert.ok(rel(A.Sext, 3*20)<1e-3, 'αs area '+A.Sext); assert.ok(rel(A.Vmicro, 40*k)<1e-3, 'αs micropori');
});

test('calore isosterico: Langmuir–Freundlich con ΔH noto (28 kJ/mol) entro 0,5 kJ/mol, Clausius–Clapeyron e viriale', ()=>{
  const o={nm:6, b0:1e-9, Q:28, t:0.9}, iso=T=>{ const p=SY.grid(300, 120000, 30, true); return {T, p, n:p.map(v=>SY.lf(v,T,o)*22.414)}; };
  for (const Ts of [[273.15, 298.15], [273.15, 288.15, 303.15]]){
    const Q=S.isosteric(Ts.map(iso), {virial:{m:5,k:3}});
    assert.ok(Q.rows.length>10); Q.rows.forEach(r=>assert.ok(Math.abs(r.Q-28)<0.5, `CC n=${r.n}: ${r.Q}`));
    Q.virial.rows.forEach(r=>assert.ok(Math.abs(r.Q-28)<0.5, `viriale n=${r.n}: ${r.Q}`));
    if (Ts.length===3) Q.rows.forEach(r=>assert.ok(r.u<0.5));
  }
  assert.strictEqual(S.isosteric([iso(273.15)]).err, 'temperature');
});

test('DFT con un kernel dell\'utente: distribuzione nota ricostruita, volume entro il 2%', ()=>{
  const fs2=fs.readFileSync(path.join(__dirname,'..','fixtures','sorption','kernel-utente.csv'),'utf8'), K=S.parseKernel(fs2, 'kernel-utente.csv');
  assert.ok(!K.err, K.err); const v=K.w.map(w=>w>=3&&w<=6?0.1:w===16?0.05:0), tot=v.reduce((a,b)=>a+b,0);
  const x=SY.grid(2e-4, 0.98, 45, true), n=x.map(xx=>{ let s=0; K.w.forEach((_,j)=>s+=v[j]*S.interp(K.x.map(Math.log), K.K.map(r=>r[j]), Math.log(xx))); return s; });
  const iso=isoOf(x, n), D=S.dftFit(iso, K, {lambda:0});
  assert.ok(rel(D.Vtot, tot)<0.02, 'volume '+D.Vtot+' contro '+tot); assert.ok(/kernel dell'utente/.test(D.label));
  const D2=S.dftFit(iso, K, {lambda:1e-4}); assert.ok(rel(D2.Vtot, tot)<0.02, 'regolarizzato '+D2.Vtot);
});

test('avvisi della SPEC: ⛔ e ⚠ nei casi previsti', ()=>{
  const k=w=>w.map(o=>o.k);
  // chiusura forzata con N₂: BJH proposto sull'adsorbimento, avviso se si sceglie il desorbimento
  const xa=SY.grid(0.02,0.99,40), xd=SY.grid(0.98,0.1,30), n=xa.map(x=>SY.meso(x,{xd:0.44, xa:0.7, wd:0.006})).concat(xd.map(x=>SY.meso(x,{xd:0.44, xa:0.7, wd:0.006},true)));
  const iso=isoOf(xa.concat(xd), n), A=S.analyze(iso); assert.strictEqual(A.bjh.branch, 'ads');
  const W=S.warnings(iso, A.P, {bet:A.bet, bjh:S.bjh(iso, A.P, {branch:'des'})}); assert.ok(k(W).includes('tse'));
  // massa mancante con quantità assolute; p₀ mancante; unità ambigua; sezione sconosciuta
  const iso2=S.buildIso({p:[10,20,30,40], n:[1,2,3,4], nUnit:'cm3 STP', pUnit:'torr', meta:{}}); const k2=k(S.warnings(iso2, S.params(iso2), {}));
  for (const c of ['p0','mass','sigma']) assert.ok(k2.includes(c), c);
  assert.ok(k(S.buildIso({x:[0.1,0.2,0.3], n:[1,2,3], nUnit:'', meta:{}}).problems).includes('unit'));
  // isoterma che non chiude a bassa pressione
  const iso3=isoOf(xa.concat(xd), xa.map(x=>SY.meso(x,{})).concat(xd.map(x=>SY.meso(x,{},true)+20))); assert.ok(k(S.analyze(iso3).warnings).includes('close'));
  // STP diversa dal file
  const iso4=kaomiIso(); iso4.meta.software='Kaomi'; assert.ok(k(S.analyze(iso4,{stp:'iupac'}).warnings).includes('stp'));
});

test('costanti predefinite con la fonte (IUPAC 2015, NIST WebBook, Linares-Solano e Stoeckli) e avviso sull\'area nella cella', ()=>{
  const A=S.ADSORBATES;
  assert.deepStrictEqual([A.N2.sigma, A.Ar.sigma], [0.162, 0.142]);                       // IUPAC 2015 §5.2.1
  assert.ok(Math.abs(A.Ar.gamma-12.53)<0.01 && Math.abs(A.Ar.rhoL-1.395)<0.001);          // NIST WebBook (Mulero 2012; Tegeler 1999) a 87,3 K
  assert.ok(Math.abs(A.N2.rhoL-0.8061)<1e-4 && Math.abs(A.N2.gamma-8.880)<1e-3);           // NIST WebBook a 77,355 K
  assert.ok(Math.abs(A.CO2.rhoL-0.9274)<1e-4 && Math.abs(A.CO2.gamma-4.484)<1e-3 && A.CO2.beta===0.35 && A.CO2.sigma===null);
  for (const g of Object.keys(A)) for (const k of ['sigma','rhoL','gamma','beta']) if (A[g][k]!=null || k==='sigma') assert.ok(A[g].srcs && Array.isArray(A[g].srcs[k]) && A[g].srcs[k].length===2, `${g}.${k}: fonte IT ed EN`);
  const P=S.params({meta:{gas:'Argon'}}); assert.ok(/NIST/.test(P.ref.gamma) && /IUPAC 2015/.test(P.ref.sigma) && /NIST/.test(P.refEn.rhoL));
  // CO₂: nessuna σ predefinita, avviso △ e non ⛔
  const co2=isoOf([0.001,0.005,0.01,0.02,0.03],[10,20,25,30,33],{gas:'CO2', sigma:undefined}); delete co2.meta.sigma;
  const W=S.warnings(co2, S.params(co2), {}); assert.ok(W.some(w=>w.k==='sigma' && w.lv==='warn'));
  // area nella cella: 1 m², avviso con la fonte
  const x=SY.grid(0.05,0.3,11), iso=isoOf(x, x.map(v=>SY.betN(v,1,100)), {mass_g:0.1}), An=S.analyze(iso), c=An.warnings.find(w=>w.k==='cell');
  assert.ok(c && c.lv==='warn' && /IUPAC 2015/.test(c.t) && /1 m²/.test(c.t), 'avviso cella');
  const iso2=isoOf(x, x.map(v=>SY.betN(v,100,100)), {mass_g:0.1}); assert.ok(!S.analyze(iso2).warnings.some(w=>w.k==='cell'));
});
