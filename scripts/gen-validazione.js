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
fs.mkdirSync(path.dirname(OUT),{recursive:true}); fs.writeFileSync(OUT, md.join('\n')+'\n');
console.log(`Scritto ${path.relative(process.cwd(), OUT)}: ${fails? fails+' controlli sotto soglia' : 'tutti i controlli R1–R3 sopra soglia'}.`);
process.exitCode=fails?1:0;
