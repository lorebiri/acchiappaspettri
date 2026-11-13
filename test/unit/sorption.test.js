// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Fisisorbimento nel nucleo: i lettori (DEDOTTI) riconoscono le fixture sintetiche e nessun file del corpus diventa un'isoterma per sbaglio.
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path');
const C=require('../validation/core.js'), S=require('../../app/sorption-core.js');
const FX=path.join(__dirname,'..','fixtures','sorption'), rd=n=>fs.readFileSync(path.join(FX,n),'utf8');
const parse=(t,n)=>{ const p=C.parseText(t); return {p, det:p.reject?null:C.detectInstrument(p, n)}; };

test('lettori: le fixture Kaomi, ASiQwin, AIF e il testo del report diventano «sorp», prima delle euristiche numeriche', ()=>{
  for (const n of ['kaomi-tabella-en.csv','kaomi-tabella-it.txt','kaomi-assoluta.csv','kaomi-mmol-kpa.txt','kaomi-report-testo.txt','asiqwin-grezzo.txt','isoterma.aif','co2-273K.csv']){
    const {p, det}=parse(rd(n), n); assert.ok(!p.reject, n+': '+p.reject); assert.strictEqual(det.instr, 'sorp', n); assert.ok(p.iso && S.branch(p.iso,'ads').x.length>=20, n+': rami'); }
  // stessa isoterma in formati diversi: stessi numeri (cm³ STP/g)
  const a=S.parseSorption(rd('kaomi-tabella-en.csv')).iso, b=S.parseSorption(rd('kaomi-tabella-it.txt')).iso, c=S.parseSorption(rd('kaomi-assoluta.csv')).iso, d=S.parseSorption(rd('kaomi-mmol-kpa.txt')).iso, e=S.parseSorption(rd('isoterma.aif')).iso;
  for (const [nm,q] of [['it',b],['assoluta',c],['mmol/kPa',d],['AIF',e]]) S.branch(a,'ads').n.forEach((v,i)=>assert.ok(Math.abs(S.branch(q,'ads').n[i]-v)<=2e-3*v+2e-3, `${nm} punto ${i}: ${S.branch(q,'ads').n[i]} contro ${v}`));
  assert.strictEqual(S.parseSorption(rd('kaomi-report-testo.txt')).iso.meta.instrBET.n, 7);
  assert.ok(S.parseSorption(rd('kaomi-report-testo.txt')).iso.problems.some(q=>q.k==='pdf'));
  const asq=S.parseSorption(rd('asiqwin-grezzo.txt')).iso; assert.strictEqual(asq.meta.gasKey,'Ar'); assert.strictEqual(asq.meta.T, 87.45); assert.ok(Math.abs(asq.meta.sigma-0.142)<1e-12); assert.strictEqual(asq.meta.mass_g, 0.05);
});

test('colonne incerte: nessuna ipotesi, importazione guidata', ()=>{
  for (const n of ['kaomi-colonne-ignote.txt','isoterma-senza-unita.csv']){ const {p}=parse(rd(n), n); assert.ok(p.reject && p.sorpGuided && p.sorpGuided.guided, n); }
  // la conversione in AIF dell'importazione guidata si rilegge con gli stessi numeri
  const g=S.parseSorption(rd('kaomi-colonne-ignote.txt')), R=g.table.rows, aif=S.toAIF({x:R.map(r=>r[1]), n:R.map(r=>r[2]), nUnit:'cm3STP/g', gas:'N2', T:77.35});
  const iso=S.parseSorption(aif).iso; assert.strictEqual(S.branch(iso,'ads').x.length, 28); assert.strictEqual(S.branch(iso,'des').x.length, 23); assert.strictEqual(S.branch(iso,'ads').n[3], R[3][2]);
});

test('nessun file del corpus né delle altre fixture diventa un\'isoterma', ()=>{
  const roots=[path.join(__dirname,'..','corpus'), path.join(__dirname,'..','fixtures')], seen=[];
  const walk=d=>{ for (const e of fs.readdirSync(d, {withFileTypes:true})){ const f=path.join(d,e.name); if (e.isDirectory()){ if (!/sorption/.test(f)) walk(f); } else if (/\.(txt|csv|dat|asc|tsv|xy|prn|dpt|jdx|dx)$/i.test(e.name) && fs.statSync(f).size<5e6) seen.push(f); } };
  roots.forEach(r=>{ if (fs.existsSync(r)) walk(r); });
  assert.ok(seen.length>50, 'corpus trovato: '+seen.length);
  for (const f of seen){ const t=C.decodeBuffer(fs.readFileSync(f)); assert.strictEqual(S.parseSorption(t, path.basename(f)), null, f); }
});

// Testo del report pubblico di Kaomi 2.02 (pdftotext -layout): non è nel repository (documento di terzi); se lo si indica, si controlla il ripiego PDF
test('ripiego PDF sul report pubblico di Kaomi (facoltativo: ACCH_KAOMI_REPORT_TXT=percorso)', {skip:!process.env.ACCH_KAOMI_REPORT_TXT}, ()=>{
  const REF=require('../validation/sorption/kaomi-mesopore-pubblico.json'), r=S.parseSorption(fs.readFileSync(process.env.ACCH_KAOMI_REPORT_TXT,'utf8'));
  assert.ok(r && r.iso, 'letto'); const m=r.iso.meta;
  assert.deepStrictEqual([S.branch(r.iso,'ads').x.length, S.branch(r.iso,'des').x.length, m.mass_g, m.gasKey, m.T, m.sigma, m.rhoL, m.gamma, m.thick, m.instrBET.n], [40, 41, 0.2444, 'N2', 77.35, 0.162, 0.806, 8.85, 'carbon-black', 7]);
  const A=S.analyze(r.iso); assert.ok(Math.abs(A.bet.instr.area-REF.bet.area)/REF.bet.area<1e-4); assert.ok(r.iso.problems.some(q=>q.k==='pdf'));
});

test('formato 2: f.iso passa la verifica del progetto e an.sorp / an.chem fanno andata e ritorno', async ()=>{
  const F=require('../../app/project-format.js'), JSZip=require('jszip');
  const iso=S.parseSorption(rd('kaomi-tabella-it.txt')).iso, rel=S.parseSorption(rd('asiqwin-grezzo.txt')).iso;
  const sorp={over:{gas:'Ar', sigma:0.142, stp:'iupac', thick:'carbon-black'}, betRange:[0.05,0.2], tRange:{x:[0.2,0.5]}, bjhBranch:'ads', tpvX:0.98, lambda:1e-4, qstKeys:['a.csv','b.csv'], kernel:{name:'k', x:[1e-4,1e-3,0.01,0.1,0.9], w:[1,2], K:[[1,2],[2,3],[3,4],[4,5],[5,6]]}};
  const chem={factor:0.012, beta:10, nu:1e13, disp:{metal:'Pt', loading:1.2, SF:2, shape:6}, kissKeys:['tpd-5.txt']};
  assert.deepStrictEqual(S.cleanOpt('sorp', sorp), sorp); assert.deepStrictEqual(S.cleanOpt('chem', chem), chem);
  // valori ostili scartati, campi sconosciuti ignorati
  assert.deepStrictEqual(S.cleanOpt('sorp', {betRange:[0.3,0.1], over:{gas:'<script>', sigma:NaN}, x:1, kernel:{x:[1],w:[1],K:[[1]]}}), null);
  assert.deepStrictEqual(S.cleanOpt('chem', {disp:{metal:'Xx', loading:-1}, factor:Infinity}), null);
  const bytes=await F.encode({appVersion:'test', title:'t', state:{S:{}}, spectra:[
    {name:'a.txt', path:'a.txt', bytes:new TextEncoder().encode(rd('kaomi-tabella-it.txt')), memory:{an:{sorp}}, iso},
    {name:'b.txt', path:'b.txt', bytes:new TextEncoder().encode(rd('asiqwin-grezzo.txt')), memory:{an:{sorp:{betRange:[0.01,0.1]}}}, iso:rel},
    {name:'c.txt', path:'c.txt', bytes:new TextEncoder().encode(rd('tpd-nh3-10.txt')), memory:{an:{chem}}}], libraries:[], results:[]}, JSZip);
  const P=await F.decode(bytes, JSZip);
  assert.deepStrictEqual(P.spectra[0].memory.an.sorp, sorp); assert.deepStrictEqual(P.spectra[2].memory.an.chem, chem);
  assert.deepStrictEqual(P.spectra[0].iso.n, iso.n); assert.deepStrictEqual(P.spectra[0].iso.branches, iso.branches); assert.strictEqual(P.spectra[1].iso.unit.p, 'p/p0');
  // i rami letti dal progetto sono gli stessi
  assert.deepStrictEqual(S.branch(P.spectra[0].iso,'des').x, S.branch(iso,'des').x);
});

test('XLSX (DEDOTTO): la cartella di lavoro dà la stessa isoterma del CSV; chemisorbimento dalle fixture', async ()=>{
  const JSZip=require('jszip'), z=await JSZip.loadAsync(fs.readFileSync(path.join(FX,'kaomi-cartella.xlsx')));
  const names=Object.keys(z.files).filter(n=>/^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort(), sheets=[]; for (const n of names) sheets.push({name:n, xml:await z.file(n).async('string')});
  const a=S.parseSorption(S.xlsxToText({shared:null, sheets})).iso, b=S.parseSorption(rd('kaomi-tabella-en.csv')).iso;
  assert.deepStrictEqual(S.branch(a,'ads').n, S.branch(b,'ads').n); assert.strictEqual(a.meta.station, '3');
  // stringhe condivise e celle saltate
  const t=S.xlsxToText({shared:'<sst><si><t>Relative Pressure</t></si><si><r><t>Amount Adsorbed (cm³ STP/g)</t></r></si></sst>', sheets:[{name:'s', xml:'<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2"><v>0.1</v></c><c r="C2"><v>50</v></c></row>'}]});
  assert.strictEqual(t, 'Relative Pressure\t\tAmount Adsorbed (cm³ STP/g)\n0.1\t\t50\n');
  for (const [n,k] of [['impulsi-co.txt','pulse'],['statico-h2.txt','static'],['tpd-nh3-10.txt','TPD'],['tpr-sintetico.txt','TPR']]){ const {p, det}=parse(rd(n), n); assert.strictEqual(det.instr, 'chem', n); assert.strictEqual(p.chem.kind, k, n); }
  assert.ok(parse(rd('impulsi-colonne-ignote.txt')).p.chemGuided, 'colonne incerte: importazione guidata');
  const L=[5,10,15,20].map(b=>{ const A=S.chemAnalyze(S.parseChem(rd(`tpd-nh3-${b}.txt`)).chem, {}); return {beta:A.tpx.beta, Tm:A.tpx.Tm}; });
  assert.ok(Math.abs(S.kissinger(L).E-120)/120<0.01, 'Kissinger sulle fixture TPD');
  const g=S.parseChem(S.toChemText({kind:'pulse', y:[0,200,900,1200,1200,1200]})).chem; assert.deepStrictEqual(g.areas, [0,200,900,1200,1200,1200]);
});
