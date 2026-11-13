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
    const {p, det}=parse(rd(n), n); assert.ok(!p.reject, n+': '+p.reject); assert.strictEqual(det.instr, 'sorp', n); assert.ok(p.iso && p.iso.branches.ads.x.length>=20, n+': rami'); }
  // stessa isoterma in formati diversi: stessi numeri (cm³ STP/g)
  const a=S.parseSorption(rd('kaomi-tabella-en.csv')).iso, b=S.parseSorption(rd('kaomi-tabella-it.txt')).iso, c=S.parseSorption(rd('kaomi-assoluta.csv')).iso, d=S.parseSorption(rd('kaomi-mmol-kpa.txt')).iso, e=S.parseSorption(rd('isoterma.aif')).iso;
  for (const [nm,q] of [['it',b],['assoluta',c],['mmol/kPa',d],['AIF',e]]) a.branches.ads.n.forEach((v,i)=>assert.ok(Math.abs(q.branches.ads.n[i]-v)<=2e-3*v+2e-3, `${nm} punto ${i}: ${q.branches.ads.n[i]} contro ${v}`));
  assert.strictEqual(S.parseSorption(rd('kaomi-report-testo.txt')).iso.meta.instrBET.n, 7);
  assert.ok(S.parseSorption(rd('kaomi-report-testo.txt')).iso.problems.some(q=>q.k==='pdf'));
  const asq=S.parseSorption(rd('asiqwin-grezzo.txt')).iso; assert.strictEqual(asq.meta.gasKey,'Ar'); assert.strictEqual(asq.meta.T, 87.45); assert.ok(Math.abs(asq.meta.sigma-0.142)<1e-12); assert.strictEqual(asq.meta.mass_g, 0.05);
});

test('colonne incerte: nessuna ipotesi, importazione guidata', ()=>{
  for (const n of ['kaomi-colonne-ignote.txt','isoterma-senza-unita.csv']){ const {p}=parse(rd(n), n); assert.ok(p.reject && p.sorpGuided && p.sorpGuided.guided, n); }
  // la conversione in AIF dell'importazione guidata si rilegge con gli stessi numeri
  const g=S.parseSorption(rd('kaomi-colonne-ignote.txt')), R=g.table.rows, aif=S.toAIF({x:R.map(r=>r[1]), n:R.map(r=>r[2]), nUnit:'cm3STP/g', gas:'N2', T:77.35});
  const iso=S.parseSorption(aif).iso; assert.strictEqual(iso.branches.ads.x.length, 28); assert.strictEqual(iso.branches.des.x.length, 23); assert.strictEqual(iso.branches.ads.n[3], R[3][2]);
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
  assert.deepStrictEqual([r.iso.branches.ads.x.length, r.iso.branches.des.x.length, m.mass_g, m.gasKey, m.T, m.sigma, m.rhoL, m.gamma, m.thick, m.instrBET.n], [40, 41, 0.2444, 'N2', 77.35, 0.162, 0.806, 8.85, 'carbon-black', 7]);
  const A=S.analyze(r.iso); assert.ok(Math.abs(A.bet.instr.area-REF.bet.area)/REF.bet.area<1e-4); assert.ok(r.iso.problems.some(q=>q.k==='pdf'));
});
