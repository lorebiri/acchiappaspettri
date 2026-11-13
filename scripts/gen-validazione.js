#!/usr/bin/env node
// R9: esegue le validazioni numeriche R1–R3 con le funzioni reali del nucleo e scrive docs/VALIDAZIONE.md
// (dati, valore certificato o di riferimento, valore calcolato, LRE, soglia, versione dell'app, motore e Node).
// Uso: node scripts/gen-validazione.js [--out percorso.md]   Esce con 1 se un controllo è sotto soglia (il documento viene scritto comunque).
'use strict';
const fs=require('fs'), path=require('path'), os=require('os');
const ROOT=path.join(__dirname,'..');
const V=p=>require(path.join(ROOT,'test','validation',p));
const C=V('core.js'), R1=V('r1-strd.test.js'), R2=V('r2-statistica.test.js'), R3=V('r3-deconvoluzione.test.js');
const outArg=process.argv.indexOf('--out'), OUT=outArg>0 ? path.resolve(process.argv[outArg+1]) : path.join(ROOT,'docs','VALIDAZIONE.md');

const g=v=>v==null?'—':typeof v==='boolean'?(v?'sì':'no'):Number.isFinite(v)?(Math.abs(v)>=1e6||(Math.abs(v)<1e-3&&v!==0)?v.toExponential(14):String(+v.toPrecision(15))):String(v);
const L=v=>v==null?'—':v.toFixed(1);
let fails=0; const ok=(lre,soglia)=>{ if (soglia==null) return ''; const y=lre>=soglia; if (!y) fails++; return y?'✓':'✗ sotto soglia'; };
const md=[]; const P=s=>md.push(s);
const engine=`Node ${process.version} (V8 ${process.versions.v8}), ${os.platform()} ${os.arch()}`;
P('# Validazione numerica di Acchiappaspettri');
P('');
P(`Documento generato da \`scripts/gen-validazione.js\` il ${new Date().toISOString().slice(0,10)}. **Non modificare a mano**: rigenerarlo.`);
P('');
P(`- Versione dell'app: **${C.APP_VERSION}** (nucleo scientifico di \`index.html\`, righe tra \`/*CORE-START*/\` e \`/*CORE-END*/\`)`);
P(`- Motore: ${engine}`);
P('- LRE (log relative error) = −log10(|calcolato − certificato| / |certificato|), al massimo 15; se il certificato è 0 si usa l\'errore assoluto. LRE 10 = 10 cifre corrette.');
P('- Ogni tabella si riproduce con `node --test test/validation/` (i test falliscono sotto soglia).');
P('');
// ---------------- R1 ----------------
P('## R1. NIST Statistical Reference Datasets');
P('');
P('Fonte: https://www.itl.nist.gov/div898/strd/ (file scaricati il 2026-11-06, copie integrali in `test/strd/`, URL in `test/strd/fonti.json`).');
P('');
P('### Statistica univariata');
P('');
P('Il nucleo **non ha una funzione unica** per media e deviazione standard: la formula (media, poi Σ(x−media)²/(n−1)) è scritta in linea in `mixResponse` e `fpCalibrate`; il test la estrae dal testo di `mixResponse`. La media interna di `linReg` (ym) è controllata a parte.');
P('');
P('| Dati | n | Difficoltà | Media certificata | Media calcolata | LRE | Soglia | s certificata | s calcolata | LRE | Soglia | Esito |');
P('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of R1.univRows()){ const e1=ok(r.lre.mean,r.soglie.mean), e2=ok(r.lre.sd,r.soglie.sd);
  P(`| ${r.name} | ${r.n} | ${r.diff} | ${g(r.cert.mean)} | ${g(r.calc.mean)} | ${L(r.lre.mean)} | ${r.soglie.mean} | ${g(r.cert.sd)} | ${g(r.calc.sd)} | ${L(r.lre.sd)} | ${r.soglie.sd} | ${(e1+e2).includes('✗')?'✗':'✓'} |`); }
P('');
P('### Regressione lineare');
P('');
P('| Dati | Funzione | Parametro | Certificato | Calcolato | LRE | Soglia | Esito |');
P('|---|---|---|---|---|---|---|---|');
for (const r of R1.norrisRows().concat(R1.pontiusRows())) P(`| ${r.dataset} | \`${r.funzione}\` | ${r.parametro} | ${g(r.cert)} | ${g(r.calc)} | ${L(r.lre)} | ${r.soglia} | ${ok(r.lre,r.soglia)} |`);
P('');
P('Non applicabili (modello non offerto dal programma): NoInt1, NoInt2 (retta per l\'origine: il menu del modello di taratura offre solo «nessuno», 1/x, 1/x²; il test fallisce se compare un modello nuovo), Filip (grado 10), Wampler1–5 (grado 5), Longley (regressione multipla).');
P('');
// ---------------- R2 ----------------
const Q=R2.quantRows(), M=R2.meta;
P('## R2. Distribuzioni, retta pesata, test di Mandel');
P('');
P(`Riferimenti: \`test/fixtures/validazione/gen_fixtures.py\` (Python ${M.q.python}, numpy ${M.q.numpy}, scipy ${M.q.scipy}, mpmath ${M.q.mpmath}; generati ${M.q.generato}). Tutti i dati di taratura sono **sintetici** (seme fisso), salvo Pontius (NIST).`);
P('');
P('| Funzione | Casi | Errore relativo massimo | Dove | Soglia | Esito |');
P('|---|---|---|---|---|---|');
for (const [nm,r] of [['`tInv` (t di Student, df 1–200, p 0,90–0,995)',Q.t],['`fInv` (F, d1 in 19 valori, d2 1–200, p 0,90–0,995)',Q.f]]){ const y=r.max<=1e-8; if (!y) fails++;
  P(`| ${nm} | ${r.n} | ${r.max.toExponential(2)} | ${JSON.stringify(r.at).replace(/\|/g,'/')} | 1e-8 | ${y?'✓':'✗'} |`); }
P('');
P('### Retta pesata (`calibrateW`)');
P('');
P('| Caso | Peso | n | Parametro | Riferimento | Calcolato | LRE | Soglia | Esito |');
P('|---|---|---|---|---|---|---|---|---|');
for (const r of R2.wlsRows()) P(`| ${r.caso} | ${r.peso} | ${r.n} | ${r.parametro} | ${g(r.cert)} | ${g(r.calc)} | ${L(r.lre)} | ${r.soglia} | ${ok(r.lre,r.soglia)} |`);
P('');
P('### Test di linearità di Mandel (`calibrate`)');
P('');
P('| Caso | n | Grandezza | Riferimento | Calcolato | LRE | Soglia | Esito |');
P('|---|---|---|---|---|---|---|---|');
for (const r of R2.mandelRows()){ const e=r.soglia==null ? (r.calc===r.cert?'✓':(fails++,'✗')) : ok(r.lre,r.soglia); P(`| ${r.caso} | ${r.n} | ${r.parametro} | ${g(r.cert)} | ${g(r.calc)} | ${L(r.lre)} | ${r.soglia??'uguale'} | ${e} |`); }
P('');
// ---------------- R3 ----------------
P('## R3. Deconvoluzione (`deconvolve`, `fitPeaks`)');
P('');
P('### Senza rumore, semi automatici (dati sintetici, 1001 punti, passo 0,1)');
P('');
P('| Profilo | Caso | Componenti attese / trovate | LRE min centro | LRE min FWHM | LRE min area | Soglia | Esito |');
P('|---|---|---|---|---|---|---|---|');
for (const r of R3.cleanRows()){ const m=Math.min(r.minLRE.c,r.minLRE.w,r.minLRE.area), y=r.trovati===r.attesi && m>=6; if (!y) fails++;
  P(`| ${r.profilo} | ${r.caso} | ${r.attesi} / ${r.trovati} | ${L(r.minLRE.c)} | ${L(r.minLRE.w)} | ${L(r.minLRE.area)} | 6 | ${y?'✓':'✗'} |`); }
P('');
P('### Con rumore: errori standard contro scipy `curve_fit` (stesso modello, stessi dati)');
P('');
P('| Caso | Comp. | Grandezza | scipy | Acchiappaspettri (semi) | LRE | Soglia | Esito |');
P('|---|---|---|---|---|---|---|---|');
for (const r of R3.noisyRows()) r.semi.forEach((q,j)=>{ for (const [k,ck,rk] of [['σ centro','sc','s_c'],['σ FWHM','sw','s_w'],['σ area','sarea','s_area'],['σ η','seta','s_eta']]){ if (q.rif[rk]==null) continue;
  P(`| ${r.caso} | ${j+1} | ${k} | ${g(q.rif[rk])} | ${g(q.calc[ck])} | ${L(q.lre[rk.replace('s_','s_')])} | 2 | ${ok(q.lre[rk],2)} |`); } });
P('');
P('Limiti noti (test che falliscono sul codice attuale, vedi `test/validation/r3-deconvoluzione.test.js`): quando una componente va a area 0 o due componenti coincidono, la matrice JᵀJ è singolare e `fitPeaks` restituisce errore standard 0 per **tutte** le componenti (mostrato come «± 0»).');
P('');
// ---------------- R10 / R11 ----------------
{ const S=require(path.join(ROOT,'app','sorption-core.js')), SY=V('sorption/sintetiche.js'), REF=V('sorption/kaomi-mesopore-pubblico.json');
  const lre=(c,w)=>Math.min(15, w===0?-Math.log10(Math.abs(c)):-Math.log10(Math.abs(c-w)/Math.abs(w))), pct=(c,w)=>100*(c-w)/w;
  const N2={gas:'Nitrogen', sigma:0.162, rhoL:0.806, gamma:8.85, M:28.0134, T:77.35}, iso=(x,n,m)=>S.buildIso({x, n, nUnit:'cm3STP/g', meta:Object.assign({},N2,m||{})});
  const row=(a,b,c,d,e,f)=>P(`| ${a} | ${b} | ${g(c)} | ${g(d)} | ${e} | ${f} |`);
  P('## R10. Fisisorbimento (`app/sorption-core.js`)'); P('');
  P('Riferimenti: soluzioni analitiche su isoterme sintetiche (parametri noti) e il report **pubblico** di Kaomi for Autosorb 2.02 «Mesopore example» (Particle Technology Labs, 2025; numeri in `test/validation/sorption/kaomi-mesopore-pubblico.json`, con la fonte). Nessun file reale del laboratorio. Test: `test/validation/r10-fisisorbimento.test.js`.'); P('');
  P('| Calcolo | Riferimento | Valore di riferimento | Calcolato | LRE o scarto | Esito |'); P('|---|---|---|---|---|---|');
  { const nm=45, C=120, x=SY.grid(0.05,0.3,11), F=S.betFit(x, x.map(v=>SY.betN(v,nm,C)), 0, 10), l1=lre(F.C,C), l2=lre(F.slope,(C-1)/(nm*C)); if (Math.min(l1,l2)<9) fails++; row('BET, isoterma BET esatta','C (analitico)',C,F.C,'LRE '+L(l1),l1>=9?'✓':'✗'); row('BET, isoterma BET esatta','pendenza (analitica)',(C-1)/(nm*C),F.slope,'LRE '+L(l2),l2>=9?'✓':'✗'); }
  const K=iso(REF.isotherm.map(r=>r[2]), REF.isotherm.map(r=>r[4]), {thick:'carbon-black', instrBET:{x0:REF.bet.x[0], x1:REF.bet.x[6]}}), A=S.analyze(K), Bi=A.bet.instr;
  const chk=(lab, ref, got, tolPct)=>{ const d=pct(got,ref), y=Math.abs(d)<=tolPct; if (!y) fails++; row(lab,'report Kaomi',ref,got,`${d.toFixed(4)} % (≤ ${tolPct} %)`,y?'✓':'✗'); };
  chk('BET, stessi 7 punti: area (m²/g)', REF.bet.area, Bi.area, 0.01); chk('BET: C', REF.bet.C, Bi.C, 0.01);
  chk('Volume totale dei pori (cm³/g)', REF.tpv.V, A.tpv.V, 0.01); chk('Diametro medio 4V/S (Å)', REF.avgDiameter_A, S.avgPoreDiameter(A.tpv.V, Bi.area), 0.05);
  for (const [br,R] of [['ads',REF.bjhAds],['des',REF.bjhDes]]){ const B=S.bjh(K, A.P, {branch:br}); chk(`BJH ${br}: volume cumulato (cm³/g)`, R.Vtot, B.Vtot, 0.2); chk(`BJH ${br}: area cumulata (m²/g)`, R.Atot, B.Atot, 0.2); chk(`BJH ${br}: moda (Å)`, R.mode_A, B.mode, 0.1); }
  { const x=SY.grid(0.01,0.5,20), I=iso(x, x.map(v=>180*35*v/(1+35*v))), Lg=S.langmuir(I, S.params(I), [0.01,0.5]), l=lre(Lg.lin.nm,180); if (l<8) fails++; row('Langmuir lineare: nₘ','analitico',180,Lg.lin.nm,'LRE '+L(l),l>=8?'✓':'✗'); }
  { const P0=S.params(iso([0.1],[1])), k=P0.liqPerStp, x=SY.grid(1e-6,0.1,25,true), W=x.map(v=>0.21*Math.exp(-Math.pow(8.314462618*77.35*Math.log(1/v)/1000/14,1.7))), D=S.drda(iso(x,W.map(w=>w/k)), P0, [1e-6,0.1], 'da'), r=Math.abs(D.E-14)/14; if (r>1e-6) fails++; row('Dubinin–Astakhov: E (kJ/mol)','analitico',14,D.E,`${r.toExponential(1)} relativo`,r<=1e-6?'✓':'✗'); }
  { const o={nm:6,b0:1e-9,Q:28,t:0.9}, mk=T=>{ const p=SY.grid(300,120000,30,true); return {T,p,n:p.map(v=>SY.lf(v,T,o)*22.414)}; }, Q=S.isosteric([273.15,298.15].map(mk)), mx=Math.max(...Q.rows.map(q=>Math.abs(q.Q-28))); if (mx>0.5) fails++; row('Calore isosterico (2 T): massimo scarto di Qst da 28 kJ/mol','Langmuir–Freundlich, ΔH noto',28,28+mx,`${mx.toFixed(3)} kJ/mol (≤ 0,5)`,mx<=0.5?'✓':'✗'); }
  P(''); P('La scelta automatica dell\'intervallo BET (criteri di Rouquerol a–d, la finestra più ampia, a pari merito r maggiore) coincide con un riferimento indipendente scritto nel test su 20 isoterme sintetiche, scelte in modo che ogni criterio cambi la finestra in almeno un caso. pyGAPS e BETSI non sono stati eseguiti (non installati, nessun download senza permesso): NON VERIFICATO contro di loro.'); P('');
  P('## R11. Chemisorbimento (`app/sorption-core.js`, SPEC §6)'); P('');
  P('Dati sintetici con parametri noti e formule pubblicate; formati Kaomi per il chemisorbimento non disponibili. Test: `test/validation/r11-chemisorbimento.test.js`.'); P('');
  P('| Calcolo | Riferimento | Valore di riferimento | Calcolato | LRE o scarto | Esito |'); P('|---|---|---|---|---|---|');
  { const D0=0.5, R=S.metalDispersion({metal:'Pt', loading:1, SF:2, uptake:D0*0.01/195.084/2*1e6}), d=R.d*R.D; const y=Math.abs(d-1.13)/1.13<0.01; if (!y) fails++; row('Pt, aₘ 0,08 nm²: d·D (nm)','1,13 (Bergeret e Gallezot)',1.13,d,`${pct(d,1.13).toFixed(2)} %`,y?'✓':'✗'); }
  for (const E of [90,140]){ const Ls=[2,5,10,20].map(beta=>{ const s=S.polanyiWigner({E, nu:1e13, beta, T0:300, T1:900, dt:0.02}); let k=0; s.rate.forEach((r,i)=>{ if (r>s.rate[k]) k=i; }); return {beta, Tm:s.T[k]}; }), Kq=S.kissinger(Ls), d=pct(Kq.E,E), y=Math.abs(d)<1; if (!y) fails++; row('Kissinger, 4 rampe: E (kJ/mol)','Polanyi–Wigner simulato',E,Kq.E,`${d.toFixed(3)} % (≤ 1 %)`,y?'✓':'✗'); }
  { const s=S.polanyiWigner({E:100, nu:1e13, beta:10, T0:200, T1:1200, dt:0.02}); let k=0; s.rate.forEach((r,i)=>{ if (r>s.rate[k]) k=i; }); const R=S.redhead(s.T[k],10,1e13), d=pct(R.E,100), y=Math.abs(d)<2; if (!y) fails++; row('Redhead, primo ordine: E (kJ/mol)','Polanyi–Wigner simulato',100,R.E,`${d.toFixed(3)} % (≤ 2 %)`,y?'✓':'✗'); }
  P(''); }
fs.mkdirSync(path.dirname(OUT),{recursive:true}); fs.writeFileSync(OUT, md.join('\n')+'\n');
console.log(`Scritto ${path.relative(process.cwd(), OUT)}: ${fails? fails+' controlli sotto soglia' : 'tutti i controlli R1–R3, R10 e R11 sopra soglia'}.`);
process.exitCode=fails?1:0;
