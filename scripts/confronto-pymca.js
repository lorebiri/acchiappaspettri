// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Confronto automatico con PyMca (punto 5 della 3.1): Acchiappaspettri sugli stessi spettri pubblici di scripts/confronto-pymca.py, con le
// condizioni lette dagli stessi .cfg (app/pymca-cfg-core.js). calcola() serve al test test/unit/xrf-pymca-confronto.test.js;
// «node scripts/confronto-pymca.js» scrive docs/VALIDAZIONE-PYMCA.md con le tabelle.
'use strict';
const fs=require('fs'), path=require('path'), ROOT=path.join(__dirname,'..'), FX=path.join(ROOT,'test','fixtures','pymca');
const C=require(path.join(ROOT,'test','unit','load-core.js')), P=require(path.join(ROOT,'app','pymca-cfg-core.js'));
const REF=()=>JSON.parse(fs.readFileSync(path.join(FX,'confronto-pymca.json'),'utf8'));
const cfgOf=n=>P.toAcch(P.parse(fs.readFileSync(path.join(FX,n),'utf8')));
const peaksOf=n=>Object.keys(n.peaks||{}).filter(e=>C.FP.el[e]);
function aree(fit, pym, map, over){ over=over||[]; const out=[]; const tot=Object.values(pym).reduce((t,v)=>t+Math.max(0,v),0);
  for (const [g, ids] of Object.entries(map)){ const a=ids.reduce((t,id)=>t+((fit.comps[id]&&fit.comps[id].tArea)||0),0), b=(Array.isArray(g.split('+')) ? g.split('+') : [g]).reduce((t,k)=>t+(pym[k]||0),0);
    out.push({gruppo:g, acch:a, pymca:b, diff:b>0 ? a/b-1 : null, grande:b>0.01*tot, sovrapposto:over.includes(g)}); } return out; }
function steel(ref){ const n=cfgOf('Steel.cfg'), txt=fs.readFileSync(path.join(FX,'Steel.spe'),'utf8'), ys=Float64Array.from(txt.split('$DATA:')[1].trim().split(/\s+/).slice(2).map(Number));
  const z=n.fit.zero, g=n.fit.gain, xs=Float64Array.from(ys,(_,i)=>z+g*i), lo=z+g*n.fit.xmin, hi=z+g*n.fit.xmax, els=peaksOf(n);
  const S31=C.fpSetup(Object.assign({}, n.setup, {phys:'3.1'})), S30=C.fpSetup(n.setup);
  const R31=C.xrfFP(xs, ys, els, S31, {mode:'norm', lo, hi, model:'hypermet', pileup:true}), R30=C.xrfFP(xs, ys, els, S30, {mode:'norm', lo, hi});
  const pc=ref.steel['pymca-cfg'], five=['Cr','Mn','Fe','Ni','Cu'], key={Cr:'Cr K',Mn:'Mn K',Fe:'Fe Ka',Ni:'Ni K',Cu:'Cu K'};
  const pyC=pc.conc.sec2, sP=five.reduce((t,e)=>t+pyC[key[e]],0), sA=five.reduce((t,e)=>t+R31.Q.res[e].w,0);
  const cert={Cr:0.1837, Mn:0.01619, Ni:0.1235, Cu:0.001734};   // certificato NIST SRM 1155 del 9/11/2012 (validazione/certificati/esempi/nist-srm-1155)
  const sC=0.9683;   // somma certificata di Cr+Mn+Fe+Ni+Cu circa (Fe per differenza 64,19)
  return {els, aree:aree(R31.fit, pc.areas, {'Cr K':['Cr K'],'Mn K':['Mn K'],'Fe Ka+Fe Kb':['Fe K'],'Ni K':['Ni K'],'Cu K':['Cu K']}, ['Mn K']),   // Mn Kα sta sotto Cr Kβ: la divisione dipende dal rapporto Kβ/Kα di Cr
    conc:five.map(e=>({el:e, acch:R31.Q.res[e].w/sA, pymca:pyC[key[e]]/sP, cert:cert[e]!=null ? cert[e]/sC : null})),
    chi2r:{acch31:R31.fit.chi2r, acch30:R30.fit.chi2r, pymca:pc.chi2r, pymcaIpermetro:ref.steel.ipermetro.chi2r}, noise:R31.fit.noise, fano:R31.fit.fano, pymcaNoise:pc.noise, pymcaFano:pc.fano}; }
function xrfs(ref){ const n=cfgOf('XRFSpectrum.cfg'), ys=Float64Array.from(fs.readFileSync(path.join(FX,'XRFSpectrum.mca'),'utf8').split('\n').filter(l=>l.trim() && l.trim()[0]!=='#').map(Number)), z=n.fit.zero, g=n.fit.gain;   // una colonna di conteggi, canale 0 compreso
  const xs=Float64Array.from(ys,(_,i)=>z+g*i), lo=z+g*n.fit.xmin, hi=z+g*n.fit.xmax, els=peaksOf(n), S=C.fpSetup(Object.assign({}, n.setup, {phys:'3.1'}));
  const R=C.xrfFitLines(xs, ys, els, S, {lo, hi, model:'hypermet', pileup:false}), pc=ref.xrfspectrum['pymca-cfg'], map={};   // impostazioni predefinite dell'app (fondo a B-spline nel fit); sumflag 0 come nel .cfg
  for (const k of Object.keys(pc.areas)) if (!/Scatter/.test(k) && R.comps[k]) map[k]=[k];
  return {els, aree:aree(R, pc.areas, map), chi2r:{acch31:R.chi2r, pymca:pc.chi2r}}; }
function bronzo(ref){ const p=C.parseXRF(fs.readFileSync(path.join(ROOT,'examples','xrf-lega-sintetico','BRONZO_SIMULATO_Rh40kV_SINTETICO.mca'),'utf8')), els=['Cu','Sn','Pb','Zn','As'];
  const S=C.fpSetup({anode:'Rh', kv:40, psi1:45, psi2:45, phys:'3.1', ae:90, eps:20}), R=C.xrfFP(p.xs, p.ys, els, S, {mode:'norm', model:'hypermet'}), pc=ref.bronzo['pymca-ebel'];
  return {conc:els.map(e=>({el:e, acch:R.Q.res[e].w/100, pymca:pc.norm100[e], verita:pc.verita[e]})), chi2r:{acch31:R.fit.chi2r, pymca:pc.chi2r}}; }
function calcola(){ const ref=REF(); return {versioni:ref.versioni, steel:steel(ref), xrfs:xrfs(ref), bronzo:bronzo(ref)}; }
function rapporto(r){ const f=(v,d)=>v==null||!isFinite(v)?'—':v.toFixed(d).replace('.',','), pc=v=>v==null?'—':(v>=0?'+':'')+f(100*v,1)+'%';
  const L=[`# Confronto automatico con PyMca`, '', `*Generato da \`node scripts/confronto-pymca.js\` (risultati di PyMca ${r.versioni.pymca} con fisx ${r.versioni.fisx} in \`test/fixtures/pymca/confronto-pymca.json\`, scritti da \`scripts/confronto-pymca.py\`). Il test \`test/unit/xrf-pymca-confronto.test.js\` controlla gli stessi numeri in CI.*`, '',
    'Area di Acchiappaspettri: gaussiana più code (con il `.cfg` di PyMca, a sola gaussiana, l\'area gaussiana comprende anche le code). Criteri su Steel.spe: aree dei gruppi principali entro il 3% (15% per i gruppi sovrapposti ad altri, come Mn Kα sotto Cr Kβ); concentrazioni entro il 6% del certificato e il 10% di PyMca (Mn escluso: PyMca divide diversamente l\'area con Cr Kβ). Su XRFSpectrum.mca: χ² non peggiore e aree dei gruppi K e L entro il 15% (le righe M sotto 2,5 keV, sovrapposte fra loro, sono solo riportate), perché lì le aree dipendono molto dal fondo (con SNIP, invece del fondo a B-spline, gli scarti cambiano segno: da +8% a −3/−8%).  Sul bronzo sintetico: entro il 10% della verità e il 20% di PyMca (geometrie solo approssimativamente uguali). χ² ridotto del modello 3.1 non peggiore di quello di PyMca.', '',
    '## 1. Steel.spe (acciaio NIST SRM 1155, eccitazione monocromatica 16 keV)', '', `Condizioni lette da \`Steel.cfg\`; elementi: ${r.steel.els.join(', ')}; intervallo di PyMca (canali ${''}200–1432).`, '',
    '| Gruppo | Acchiappaspettri 3.1 | PyMca | Scarto |', '|---|---|---|---|', ...r.steel.aree.map(a=>`| ${a.gruppo} | ${f(a.acch,0)} | ${f(a.pymca,0)} | ${pc(a.diff)} |`), '',
    '| % in peso (normalizzato su Cr+Mn+Fe+Ni+Cu) | Acchiappaspettri 3.1 | PyMca (secondaria + terziaria, Fe di riferimento) | Certificato NIST |', '|---|---|---|---|',
    ...r.steel.conc.map(c=>`| ${c.el} | ${f(100*c.acch,3)} | ${f(100*c.pymca,3)} | ${c.cert!=null?f(100*c.cert,3):'per differenza'} |`), '',
    `χ² ridotto sullo stesso intervallo: Acchiappaspettri 3.1 **${f(r.steel.chi2r.acch31,2)}**, 3.0 ${f(r.steel.chi2r.acch30,2)}; PyMca con \`Steel.cfg\` (sola gaussiana) **${f(r.steel.chi2r.pymca,2)}**, PyMca con l'ipermetro completo ${f(r.steel.chi2r.pymcaIpermetro,2)}. Noise/Fano: Acchiappaspettri ${f(1000*r.steel.noise,0)} eV / ${f(r.steel.fano,3)}, PyMca ${f(1000*r.steel.pymcaNoise,0)} eV / ${f(r.steel.pymcaFano,3)}. I fondi sono diversi (B-spline nel fit contro SNIP), quindi il χ² dice soprattutto quanto bene è descritta la forma dei picchi.`, '',
    '## 2. XRFSpectrum.mca (standard sottile multielemento distribuito con PyMca)', '', 'Condizioni dal `.cfg` di `PyMca5/tests/XrfTest.py`; aree in unità dello spettro (conteggi normalizzati). La concentrazione non si confronta: PyMca usa uno standard interno (Co) e uno strato sottile, che l\'app non prevede.', '',
    '| Gruppo | Acchiappaspettri 3.1 | PyMca | Scarto | Nel criterio |', '|---|---|---|---|---|', ...r.xrfs.aree.map(a=>`| ${a.gruppo} | ${f(a.acch,4)} | ${f(a.pymca,4)} | ${pc(a.diff)} | ${!a.grande?'no (< 1% del totale)':/ M$/.test(a.gruppo)?'no (righe M)':'sì'} |`), '',
    '## 3. Bronzo SINTETICO di `examples/` (tubo Rh 40 kV)', '', 'Tubo di Ebel in entrambi i programmi, matrice iterata e normalizzata a 100%. Lo spettro è generato col modello 3.0 dell\'app (tubo di Kramers): la «verità» vale per quel modello.', '',
    '| % in peso | Verità | Acchiappaspettri 3.1 | PyMca |', '|---|---|---|---|', ...r.bronzo.conc.map(c=>`| ${c.el} | ${f(100*c.verita,2)} | ${f(100*c.acch,2)} | ${f(100*c.pymca,2)} |`), ''];
  return L.join('\n'); }
module.exports={calcola, rapporto};
if (require.main===module){ const r=calcola(); fs.writeFileSync(path.join(ROOT,'docs','VALIDAZIONE-PYMCA.md'), rapporto(r)+'\n'); console.log(JSON.stringify({steel:r.steel.chi2r, aree:r.steel.aree.map(a=>a.gruppo+' '+(100*a.diff).toFixed(1)), conc:r.steel.conc.map(c=>c.el+' '+(100*c.acch).toFixed(2)+'/'+(100*c.pymca).toFixed(2)), xrfs:r.xrfs.aree.filter(a=>a.grande).map(a=>a.gruppo+' '+(100*a.diff).toFixed(1)), bronzo:r.bronzo.conc.map(c=>c.el+' '+(100*c.acch).toFixed(2)+'/'+(100*c.pymca).toFixed(2))}, null, 1)); }
