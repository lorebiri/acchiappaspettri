// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// CF-LIBS sperimentale (app/libs-cf-core.js; dati atomici del NIST preparati da scripts/gen-libs-data.py, test/libs-dati-locali.js): ogni funzione ha la sua prova; poi la validazione su spettri
// SINTETICI con verità nota (stesso modello fisico: dice che il programma è coerente, non che il modello descrive un plasma vero)
// e su uno spettro REALE pubblico (SuperLIBS 10K, CC BY 4.0), dove si documenta il risultato senza pretendere accuratezza.
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..','..'), C=require('../../app/libs-cf-core.js'), D=require('../libs-dati-locali.js');
const rel=(a,b)=>Math.abs(a-b)/Math.abs(b);
const REPORT=[];   // tabella dei risultati della validazione, stampata alla fine (node --test la mostra)

/* ---------------- banca dati ---------------- */
test('dati atomici (scaricati dal NIST, non distribuiti): fonte con DOI e data, elementi richiesti, righe filtrate; nessuna copia nell\'app', ()=>{
  assert.match(D.source, /Kramida/); assert.match(D.source, /10\.18434\/T4W30F/); assert.match(D.source, /version 5\.\d+/);
  assert.match(D.downloaded, /^\d{4}-\d{2}-\d{2}$/); assert.match(D.copyright, /15 U\.S\.C\. 290e/);
  for (const el of ['H','C','N','O','Na','Mg','Al','Si','K','Ca','Ti','Cr','Mn','Fe','Co','Ni','Cu','Zn','Ag','Sn','Sb','Au','Pb','Ba','Sr','Li']){
    assert.ok(D.species[el+' I'], el+' I'); assert.ok(D.mass[el]>0, 'massa di '+el); }
  let n=0; for (const sp of Object.values(D.species)){ assert.strictEqual(sp.U.length, D.Tgrid.length); assert.ok(sp.U.every((u,i)=>u>0 && (i===0 || u>=sp.U[i-1]-1e-9)), 'U(T) crescente');
    assert.ok(sp.lines.length<=D.selection.perSpecies);
    for (const l of sp.lines){ n++; assert.ok(l[0]>=200 && l[0]<=900); assert.ok(l[1]>0); assert.ok(D.selection.acc.concat(D.selection.fillAcc).includes(l[2]), l[2]); assert.ok(l[4]>l[3]); } }
  assert.ok(n>800, 'righe: '+n);
  assert.ok(!fs.existsSync(path.join(ROOT,'app/libs-data.js')), 'i dati del NIST non vanno nell\'app finché il NIST non dà il permesso');
  for (const f of ['index.html','app/vista.html']) assert.ok(!/libs-data\.js/.test(fs.readFileSync(path.join(ROOT,f),'utf8')), f);
  // funzioni di partizione: entro il 6 % da quelle calcolate dal NIST a 1 eV (la differenza viene dai livelli sopra il limite, che qui non si contano)
  for (const [sp, u, un] of D.pfCheck1eV) if (un) assert.ok(rel(u, un)<0.06, sp+' '+u+' contro '+un);
});
test('partition: interpolazione sulla griglia e valori agli estremi; H II = 1', ()=>{
  const G=D.Tgrid, U=D.species['Fe I'].U; assert.strictEqual(C.partition(D,'Fe','I',G[4]), U[4]);
  const mid=C.partition(D,'Fe','I',(G[4]+G[5])/2); assert.ok(Math.abs(mid-(U[4]+U[5])/2)<1e-9);
  assert.strictEqual(C.partition(D,'Fe','I',100), U[0]); assert.strictEqual(C.partition(D,'H','II',1e4), 1); assert.strictEqual(C.partition(D,'Xx','I',1e4), null);
});
test('sahaRatio: forma del brevetto 6,0·10²¹·(U_II/U_I)·T_eV^{3/2}·exp(−E/T_eV) (fattore 2 incluso)', ()=>{
  const T=11604.518, ne=1e17, r=C.sahaRatio(D,'Cu',T,ne), sp=D.species['Cu I'];
  const pat=6.0e21*(C.partition(D,'Cu','II',T)/C.partition(D,'Cu','I',T))*Math.exp(-sp.Eion/1)/ne;
  assert.ok(rel(r, pat)<0.01, r+' '+pat);
  assert.ok(C.sahaRatio(D,'Cu',T,2e17)<r);   // più elettroni, meno ioni
});

/* ---------------- profili e larghezze ---------------- */
test('voigt: area 1, limiti gaussiano e lorentziano, accordo con la convoluzione numerica', ()=>{
  let a=0; for (let x=-30;x<=30;x+=0.0005) a+=C.voigt(x,0.05,0.04)*0.0005; assert.ok(Math.abs(a-1)<1e-3, a);
  const s=0.05/(2*Math.sqrt(2*Math.LN2)); assert.ok(rel(C.voigt(0.01,0.05,0), Math.exp(-1e-4/(2*s*s))/(s*Math.sqrt(2*Math.PI)))<1e-9);
  assert.ok(rel(C.voigt(0.01,0,0.04), 0.02/Math.PI/(1e-4+4e-4))<1e-9);
  for (const dx of [0, 0.02, 0.06, 0.2]){ let v=0; const h=0.0002; for (let t=-5;t<=5;t+=h){ const sg=0.03/2.3548; v+=Math.exp(-t*t/(2*sg*sg))/(sg*Math.sqrt(2*Math.PI))*(0.025/Math.PI)/((dx-t)*(dx-t)+0.025*0.025)*h; }
    assert.ok(rel(C.voigt(dx,0.03,0.05), v)<2e-3, dx+': '+C.voigt(dx,0.03,0.05)+' '+v); }
});
test('Olivero: FWHM della Voigt e inversione esatta per la componente Lorentziana', ()=>{
  assert.ok(Math.abs(C.oliveroFwhm(1,0)-1)<1e-4); assert.ok(Math.abs(C.oliveroFwhm(0,1)-1)<1e-12);
  for (const [fL,fG] of [[0.03,0.05],[0.2,0.05],[0.01,0.1]]) assert.ok(rel(C.lorentzFromVoigt(C.oliveroFwhm(fL,fG),fG), fL)<1e-9);
  assert.strictEqual(C.lorentzFromVoigt(0.05,0.06), 0);
  // FWHM vera della Voigt numerica: Olivero entro lo 0,05 %
  const fG=0.05, fL=0.04, pk=C.voigt(0,fG,fL); let lo=0, hi=1; for (let i=0;i<60;i++){ const m=(lo+hi)/2; if (C.voigt(m,fG,fL)>pk/2) lo=m; else hi=m; } assert.ok(rel(2*lo, C.oliveroFwhm(fL,fG))<5e-4);
});
test('fitLines: area e larghezza Lorentziana di una Voigt su fondo lineare; due righe vicine adattate insieme', ()=>{
  const R=C.rng(7), xs=[], ys=[]; for (let x=399; x<=401; x+=0.005){ xs.push(x); ys.push(100+20*(x-400)+5000*C.voigt(x-400.0,0.05,0.03)+3000*C.voigt(x-400.12,0.05,0.06)+R.normal()); }
  const [a,b]=C.fitLines(xs, ys, [400.0, 400.12], {fwhmG:0.05});
  assert.strictEqual(a.joint, 2); assert.ok(rel(a.area,5000)<0.01, a.area); assert.ok(rel(b.area,3000)<0.015, b.area);
  assert.ok(rel(a.fL,0.03)<0.03, a.fL); assert.ok(rel(b.fL,0.06)<0.03, b.fL); assert.ok(a.sArea>0 && a.snr>100); assert.ok(Math.abs(a.center-400)<0.001);
  // larghezza strumentale non dichiarata: si adatta anche f_G
  const [c]=C.fitLines(xs, ys.map((y,i)=>y-3000*C.voigt(xs[i]-400.12,0.05,0.06)), [400.0], {});
  assert.ok(rel(c.fG,0.05)<0.1 && rel(c.area,5000)<0.02, JSON.stringify(c));
  assert.strictEqual(C.fitLines(xs, ys, [398.0])[0], null, 'finestra fuori dai dati');
});

/* ---------------- densità elettronica ---------------- */
test('n_e da Stark (w noto) e da Hα/Hβ (Gigosos 2003): formule e inverse', ()=>{
  assert.strictEqual(C.neFromStark(0.02, 0.01), 1e16); assert.strictEqual(C.neFromStark(0, 0.01), null);
  for (const ne of [1e16, 1e17, 5e17]){ assert.ok(rel(C.neHalpha(C.fwhmHalpha(ne)), ne)<1e-12); assert.ok(rel(C.neHbeta(C.fwhmHbeta(ne)), ne)<1e-12); }
  assert.ok(Math.abs(C.fwhmHbeta(1e17)-4.8)<1e-12); assert.ok(Math.abs(C.fwhmHalpha(1e17)-1.098)<1e-12);
});
test('neFromHydrogen: n_e ritrovata entro il 10 % da Hα e Hβ su spettri sintetici di solo idrogeno', ()=>{
  for (const ne of [3e16, 1e17]){ const S=C.synth(D,{comp:{Ar:1}, ambient:{H:2e17}, T:10000, ne, wl:[420,700], peakCounts:1e5, seed:11});
    const a=C.neFromHydrogen(S.x,S.y,'alpha',{fwhmG:0.05}), b=C.neFromHydrogen(S.x,S.y,'beta',{fwhmG:0.05});
    assert.ok(a.ok && rel(a.ne,ne)<0.1, 'Hα '+a.ne); assert.ok(b.ok && rel(b.ne,ne)<0.1, 'Hβ '+b.ne);
    REPORT.push(['n_e da Hα (solo H)', ne.toExponential(1), a.ne.toExponential(3), (100*(a.ne/ne-1)).toFixed(1)+' %']);
    REPORT.push(['n_e da Hβ (solo H)', ne.toExponential(1), b.ne.toExponential(3), (100*(b.ne/ne-1)).toFixed(1)+' %']); }
});

/* ---------------- autoassorbimento ---------------- */
test('autoassorbimento: El Sherbini (α = −0,54, β = 0,46) e formula pratica (esponente 0,85) coincidono entro l\'1 %', ()=>{
  const w=0.005, ne=1e17, d0=2*w*ne/1e16;
  assert.strictEqual(C.saFromWidth(d0, w, ne), 1); assert.ok(Math.abs(C.saFromWidth(2*d0, w, ne)-Math.pow(2,-1/0.54))<1e-12);
  const p=C.selfAbsCorrect(100, 2*d0, w, ne, 'potenza'), e=C.selfAbsCorrect(100, 2*d0, w, ne, 'elsherbini');
  assert.ok(Math.abs(p.I0-100*Math.pow(2,0.85))<1e-9); assert.ok(rel(p.I0, e.I0)<0.01, p.I0+' '+e.I0);
  assert.strictEqual(C.selfAbsCorrect(100, 0.5*d0, w, ne).I0, 100, 'riga più stretta di Δλ0: nessuna correzione');
  assert.strictEqual(C.selfAbsCorrect(100, 0.1, 0, ne), null);
});
test('McWhirter: soglia 1,6·10¹²·T^{1/2}·ΔE³ con ΔE dalla banca dati', ()=>{
  const m=C.mcWhirter(D, [['Cu','I'],['Cu','II']], 10000, 1e17), dE=Math.max(D.species['Cu I'].dEmax, D.species['Cu II'].dEmax);
  assert.ok(Math.abs(m.neMin-1.6e12*100*dE*dE*dE)<1); assert.strictEqual(m.ok, 1e17>m.neMin); assert.strictEqual(C.mcWhirter(D, [['Cu','I']], 1e4, 1e10).ok, false);
});

/* ---------------- Boltzmann e CF con intensità esatte ---------------- */
function exactLines(comp, T, ne, basis){   // intensità integrate del modello LTE (fotoni), senza spettro
  const M=D.mass, mol={}; let t=0; for (const el in comp){ mol[el]=basis==='weight'?comp[el]/M[el]:comp[el]; t+=mol[el]; } for (const el in mol) mol[el]/=t;
  const out=[]; for (const el in mol){ const R=C.sahaRatio(D, el, T, ne), N={I:mol[el]/(1+R), II:mol[el]*R/(1+R)};
    for (const st of ['I','II']) for (const l of C.linesOf(D, el, st)) out.push(Object.assign(l, {area:1e20*N[st]*l.gk*l.A*Math.exp(-l.Ek/(C.KB*T))/C.partition(D, el, st, T), sArea:0})); }
  return {lines:out, mol}; }
test('boltzmannPlot e jointFit: T esatta da punti senza rumore, pendenza comune a più specie', ()=>{
  const {lines}=exactLines({Fe:1, Cr:1}, 9000, 1e17, 'molar'); const b=C.boltzmannPlot(lines.map(l=>Object.assign(l,{I:l.area, sy:0.1})));
  assert.ok(rel(b.T, 9000)<1e-9, b.T); assert.ok(b.sT>0 && b.sT<500, b.sT);   // σ_y = 0,1 dichiarato: σ_T dai pesi, non dai residui (nulli)
  assert.strictEqual(b.groups.length, 4);   // Fe I, Fe II, Cr I, Cr II (l'asserzione era finita nel commento)
  assert.strictEqual(C.jointFit([{g:'a',x:1,y:1,sy:1}]), null);
});
test('cf: concentrazioni esatte in Saha-Boltzmann e in Boltzmann per specie; standard interno; n_e di Saha', ()=>{
  const comp={Cu:85, Sn:8, Zn:4, Pb:3}, {lines}=exactLines(comp, 10000, 1e17, 'weight');
  for (const mode of ['saha-boltzmann','boltzmann']){ const r=C.cf(D, lines, {mode, ne:1e17});
    assert.ok(r.ok, r.why); assert.ok(rel(r.T,10000)<1e-6, mode+' T '+r.T);
    for (const e of r.elements) assert.ok(Math.abs(e.wt-comp[e.el]/100)<1e-6, mode+' '+e.el+' '+e.wt);
    assert.ok(r.warnings.some(w=>w.code==='response') && r.warnings.some(w=>w.code==='closure')); }
  const b=C.cf(D, lines, {mode:'boltzmann', ne:1e17}); assert.ok(b.neSaha.length>=2); for (const s of b.neSaha) assert.ok(rel(s.ne,1e17)<1e-6, s.el+' '+s.ne);
  const st=C.cf(D, lines, {ne:1e17, closure:{el:'Cu', wt:0.85}}); assert.ok(Math.abs(st.sumWt-1)<1e-6); assert.ok(Math.abs(st.elements.find(e=>e.el==='Sn').wt-0.08)<1e-6);
  // con solo righe neutre di Pb (Pb II senza A_ki nel NIST) lo ione viene da Saha: avviso «un solo stadio»
  assert.ok(st.warnings.some(w=>w.code==='oneStage' && w.el==='Pb'));
  // righe di risonanza: avviso, oppure esclusione
  assert.ok(st.warnings.some(w=>w.code==='resonance')); const ex=C.cf(D, lines, {ne:1e17, excludeResonance:true}); assert.ok(ex.points.every(p=>p.Ei>0));
  assert.strictEqual(C.cf(D, lines.slice(0,2), {ne:1e17}).ok, false);
});
test('cf: senza n_e, iterazione con neutralità di carica e pressione (1 atm): ritrova n_e e T del modello coerente', ()=>{
  const S=C.synth(D,{comp:{Fe:70,Cr:18,Ni:10,Mn:2}, T:9000, ne:'lte', peakCounts:1e6, seed:5});
  const r=C.analyze(D, S.x, S.y, {elements:['Fe','Cr','Ni','Mn'], fwhmG:0.05});
  assert.ok(r.ok && r.converged); assert.strictEqual(r.neSource, 'iterated');
  assert.ok(rel(r.ne, S.truth.ne)<0.05, r.ne+' '+S.truth.ne); assert.ok(rel(r.T, 9000)<0.02, r.T);
  REPORT.push(['n_e iterata (acciaio, 9000 K)', S.truth.ne.toExponential(2), r.ne.toExponential(3), (100*(r.ne/S.truth.ne-1)).toFixed(1)+' %']);
});

/* ---------------- generatore ---------------- */
test('synth: deterministico con il seme, rumore di Poisson, verità restituita', ()=>{
  const o={comp:{Cu:90, Zn:10}, wl:[320,340], seed:4}, a=C.synth(D,o), b=C.synth(D,o), c=C.synth(D,Object.assign({},o,{seed:5}));
  assert.deepStrictEqual(Array.from(a.y), Array.from(b.y)); assert.notDeepStrictEqual(Array.from(a.y), Array.from(c.y));
  assert.ok(a.y.every(v=>Number.isInteger(v) && v>=0)); assert.ok(Math.abs(a.truth.wt.Cu-0.9)<1e-12);
  const th=C.synth(D,Object.assign({},o,{L:0.1, noise:false})); assert.ok(th.truth.lines.some(l=>l.tau0>1), 'con L le righe di risonanza del Cu diventano spesse');
});

/* ---------------- validazione su spettri sintetici ---------------- */
const CASES={
  'bronzo Cu–Sn–Zn–Pb':{comp:{Cu:85, Sn:8, Zn:4, Pb:3}},
  'acciaio Fe–Cr–Ni–Mn':{comp:{Fe:70, Cr:18, Ni:10, Mn:2}},
  'vetro Si–Na–Ca–K–Al (+O)':{comp:{Si:33, Na:10, Ca:7, K:3, Al:2, O:45}} };
function runCase(name, extra, aopt){ const c=CASES[name], S=C.synth(D, Object.assign({T:10000, ne:1e17, ambient:{H:2e17}, peakCounts:1e6, seed:3}, c, extra));
  const r=C.analyze(D, S.x, S.y, Object.assign({elements:Object.keys(c.comp), fwhmG:0.05, neFrom:'Halpha'}, aopt)); return {S, r}; }
const errs=(r, S)=>r.elements.map(e=>({el:e.el, wt:e.wt, s:e.sWt, truth:S.truth.wt[e.el], err:rel(e.wt, S.truth.wt[e.el])}));
for (const name of Object.keys(CASES)) test('validazione sintetica, otticamente sottile: '+name, ()=>{
  const {S, r}=runCase(name, {}, {}); assert.ok(r.ok, r.why);
  assert.strictEqual(r.neSource, 'Halpha'); assert.ok(rel(r.ne, 1e17)<0.1, 'n_e '+r.ne); assert.ok(rel(r.T, 10000)<0.03, 'T '+r.T);
  const E=errs(r, S); for (const e of E) assert.ok(e.err<0.12, name+' '+e.el+' '+(e.wt*100).toFixed(2)+' contro '+(e.truth*100).toFixed(2));
  const mean=E.reduce((s,e)=>s+e.err,0)/E.length; assert.ok(mean<0.06, 'errore medio '+mean);
  REPORT.push(['T, '+name, '10000 K', r.T.toFixed(0)+' ± '+r.sT.toFixed(0)+' K', (100*(r.T/1e4-1)).toFixed(1)+' %']);
  REPORT.push(['n_e (Hα), '+name, '1.0e+17', r.ne.toExponential(3), (100*(r.ne/1e17-1)).toFixed(1)+' %']);
  for (const e of E) REPORT.push(['  '+e.el+' % peso', (e.truth*100).toFixed(2), (e.wt*100).toFixed(2)+' ± '+(e.s*100).toFixed(2), (100*(e.wt/e.truth-1)).toFixed(1)+' %']);
});
test('validazione sintetica con autoassorbimento (L = 0,1 cm): la correzione con la larghezza riduce l\'errore', ()=>{
  for (const name of ['bronzo Cu–Sn–Zn–Pb','acciaio Fe–Cr–Ni–Mn']){
    const a=runCase(name, {L:0.1}, {ne:1e17}), b=runCase(name, {L:0.1}, {ne:1e17, selfAbs:{method:'potenza', w:C.syntheticW}});
    assert.ok(a.r.ok && b.r.ok); const ea=errs(a.r, a.S), eb=errs(b.r, b.S), ma=ea.reduce((s,e)=>s+e.err,0)/ea.length, mb=eb.reduce((s,e)=>s+e.err,0)/eb.length;
    assert.ok(mb<0.6*ma, name+': errore medio senza correzione '+ma.toFixed(3)+', con correzione '+mb.toFixed(3));
    REPORT.push(['autoassorbimento L=0,1 cm, '+name, 'errore medio relativo', (100*ma).toFixed(1)+' % → '+(100*mb).toFixed(1)+' %', 'T '+a.r.T.toFixed(0)+' → '+b.r.T.toFixed(0)+' K']);
    for (let i=0;i<eb.length;i++){ const x=ea.find(e=>e.el===eb[i].el); REPORT.push(['  '+eb[i].el+' % peso', (eb[i].truth*100).toFixed(2), (x.wt*100).toFixed(2)+' → '+(eb[i].wt*100).toFixed(2), '']); } }
});

/* ---------------- spettro reale pubblico ---------------- */
test('spettro reale SuperLIBS 10K (0201H, CC BY 4.0): il calcolo gira e dà avvisi; accuratezza NON garantita (documentata)', ()=>{
  const txt=fs.readFileSync(path.join(ROOT,'test/fixtures/libs/superlibs-0201H.csv'),'utf8'); assert.match(txt, /CC BY 4\.0/); assert.match(txt, /10\.5281\/zenodo\.10287455/);
  const rows=txt.split('\n').filter(l=>/^\d/.test(l)).map(l=>l.split(',').map(Number)), x=rows.map(r=>r[0]), y=rows.map(r=>r[1]);
  // composizione dichiarata in ossidi → frazioni in peso dei cationi (senza O), per il confronto
  const ox={Si:[48.49,28.085,60.084,1],Ti:[1.31,47.867,79.866,1],Al:[17.47,26.982,101.96,2],Fe:[9.94,55.845,159.69,2],Mg:[2.32,24.305,40.304,1],Ca:[13.64,40.078,56.077,1],Na:[3.81,22.99,61.98,2],K:[1.29,39.098,94.196,2]};
  const ref={}; let s=0; for (const [el,[w,M,Mo,n]] of Object.entries(ox)){ ref[el]=w*n*M/Mo; s+=ref[el]; } for (const el in ref) ref[el]/=s;
  // solo la regione VIS (370–479 nm): gli autori normalizzano ogni regione a parte, quindi F non è costante fra le regioni
  const i0=x.findIndex(v=>v>=370), i1=x.findIndex(v=>v>479.1), r=C.analyze(D, x.slice(i0,i1), y.slice(i0,i1), {elements:Object.keys(ox), fwhmG:0.08, snrMin:5, maxShift:0.06, excludeResonance:true});
  assert.ok(r.ok, r.why); assert.ok(Number.isFinite(r.T) && r.elements.every(e=>Number.isFinite(e.wt)));
  assert.ok(r.warnings.some(w=>w.code==='response'));
  REPORT.push(['REALE SuperLIBS 0201H (VIS), T e n_e', '—', r.T.toFixed(0)+' K, '+r.ne.toExponential(2)+' ('+r.neSource+')', 'χ²ᵣ '+r.fit.chi2r.toFixed(1)]);
  for (const e of r.elements) REPORT.push(['  '+e.el+' % peso (cationi)', (ref[e.el]*100).toFixed(1), (e.wt*100).toFixed(1), '']);
});

test.after(()=>{ if (process.env.LIBS_REPORT) console.log('\n'+REPORT.map(r=>r.join(' | ')).join('\n')); });
test('multipletti non risolti della stessa specie (Zn I 330,26/330,29 nm): una riga sola con g·A sommato, non scartati', ()=>{
  const r=C.candidates(D, ['Zn','Cu'], 300, 345, {fwhmG:0.1}), z=r.lines.filter(l=>l.el==='Zn' && l.merged);
  assert.ok(z.length>=1, 'multipletto di Zn unito'); const m=z.find(l=>Math.abs(l.wl-330.27)<0.03); assert.ok(m && m.parts.length===2 && m.gk===1 && m.A>0);
  assert.ok(!r.blended.some(l=>l.el==='Zn' && Math.abs(l.wl-330.27)<0.05), 'non più fra le righe scartate');
  const S=C.synth(D, {comp:{Cu:90, Zn:10}, T:10000, ne:1e17, ambient:{H:2e17}, wl:[300,540], fwhmG:0.1, peakCounts:3e5, seed:2}), a=C.analyze(D, S.x, S.y, {elements:['Cu','Zn'], fwhmG:0.1, neFrom:'Halpha'});
  assert.ok(a.ok, a.why); const zn=a.elements.find(e=>e.el==='Zn'); assert.ok(zn && zn.wt>0.05, 'Zn misurato: '+(zn&&zn.wt));
});
test('revisione 3.1: standard interno senza righe e n_e non positiva sono segnalati, non ignorati in silenzio', ()=>{
  const S=C.synth(D, {comp:{Cu:90, Sn:10}, T:10000, ne:1e17, ambient:{H:2e17}, wl:[300,540], fwhmG:0.05, peakCounts:3e5, seed:4});
  const a=C.analyze(D, S.x, S.y, {elements:['Cu','Sn'], fwhmG:0.05, neFrom:'Halpha', closure:{el:'Zn', wt:0.05}});
  assert.ok(a.warnings.some(w=>w.code==='closureRefMissing' && w.el==='Zn'), JSON.stringify(a.warnings.map(w=>w.code)));
  const b=C.analyze(D, S.x, S.y, {elements:['Cu','Sn'], fwhmG:0.05, neFrom:'Halpha', ne:-5});
  assert.ok(b.warnings.some(w=>w.code==='neInvalid'), JSON.stringify(b.warnings.map(w=>w.code)));
});
test('debug 3.1 indipendente: elemento scelto senza righe (Sb, assente dalla banca dati) segnalato; un λ NaN non rende indeterminata la pendenza; gA di Balmer come nel NIST', ()=>{
  const S=C.synth(D, {comp:{Cu:90, Sn:10}, T:10000, ne:1e17, ambient:{H:2e17}, wl:[300,540], fwhmG:0.05, peakCounts:3e5, seed:4});
  const a=C.analyze(D, S.x, S.y, {elements:['Cu','Sn','Sb'], fwhmG:0.05, neFrom:'Halpha'});
  const w=a.warnings.find(q=>q.code==='noLines'); assert.ok(w && w.els.includes('Sb') && w.noData.includes('Sb') && !w.els.includes('Cu'), JSON.stringify(a.warnings));
  const {lines}=exactLines({Fe:1, Cr:1}, 9000, 1e17, 'molar'); lines.forEach(l=>{ l.area/=l.wl; }); lines[3].wl=NaN;   // intensità in energia: Ī ∝ g·A·e^(−E/kT)/λ
  const r=C.cf(D, lines, {ne:1e17, intensity:'energy', mc:0}); assert.ok(r.ok && Math.abs(r.T/9000-1)<1e-6, r.why||r.T);
  // Hα 4,41·10⁷ s⁻¹ (g_k 18) e Hβ 8,42·10⁶ s⁻¹ (g_k 32), NIST ASD: prima componenti e riga totale erano sommate (valori doppi)
  const H=C.linesOf(D, 'H', 'I'), ha=H.find(l=>Math.abs(l.wl-656.28)<0.01), hb=H.find(l=>Math.abs(l.wl-486.13)<0.01);
  assert.ok(Math.abs(ha.A/4.41e7-1)<0.002 && Math.abs(hb.A/8.42e6-1)<0.002, ha.A+' '+hb.A);
});
