// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Tabella dei testi del desktop (app/testi-desktop.js): ogni voce ha italiano e inglese sobri, i modelli hanno gli stessi segnaposto,
// i saluti e le battute di Gino escono puliti, e nella pagina online il file non fa nulla.
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), vm=require('vm');
const root=path.join(__dirname,'..','..'), SRC=fs.readFileSync(path.join(root,'app/testi-desktop.js'),'utf8'), HTML=fs.readFileSync(path.join(root,'index.html'),'utf8');
function load(shell, lang){ const win={ACCH_SHELL:shell, ACCH_EN:{'Scarica':'Download'}, AcchI18n:{lang:lang||'it', tr:s=>s==='Scarica'?'Download':s}, document:{readyState:'loading', addEventListener(){}}, addEventListener(){}};
  vm.runInNewContext(SRC, {window:win}); return win; }
const BAD=[[/\bGino\b/,'Gino'],[/\p{Extended_Pictographic}/u,'emoji'],[/!(?!=)/,'!'],[/browser/i,'browser'],[/download/i,'download']];
const clean=(s,where)=>{ for (const [re,n] of BAD) assert.ok(!re.test(s), `${n} in ${where}: «${s}»`); };

test('online: il file non fa nulla (dizionario intatto, nessun ACCH_DESK)', ()=>{ const w=load(false); assert.equal(w.ACCH_DESK, undefined); assert.deepStrictEqual(w.ACCH_EN, {'Scarica':'Download'}); });
test('ogni voce: italiano e inglese senza Gino, emoji, «!», «browser», «download»', ()=>{ const {TESTI, MODELLI, NOVITA}=load(true).ACCH_DESK._tables;
  assert.ok(TESTI.length>=60, 'voci: '+TESTI.length);
  for (const [o,it,en] of TESTI){ assert.equal(typeof o,'string'); clean(it,'IT di «'+o+'»'); clean(en,'EN di «'+o+'»'); assert.ok((it==='')===(en===''), o); }
  for (const [re,it,en] of MODELLI){ clean(it,String(re)); clean(en,String(re)); const ph=s=>(s.match(/\{\d+\}/g)||[]).sort().join(); assert.equal(ph(it), ph(en), String(re)); }
  for (const v in NOVITA) for (const n of NOVITA[v]) n.slice(0,4).forEach(s=>clean(s,'Novità '+v)); });
test('il dizionario riceve le traduzioni del desktop', ()=>{ const w=load(true); assert.equal(w.ACCH_EN['Caricamento di {0} file…'], 'Loading {0} files…'); assert.equal(w.ACCH_EN['Esportazione completata.'], 'Export completed.'); });
test('messaggi: voci, modelli e rete di sicurezza', ()=>{ const P=load(true).ACCH_DESK.pro;
  assert.equal(P('Gino sta acchiappando 12 file…'), 'Caricamento di 12 file…');
  assert.equal(P('✅ Fatto! Trovi il file nella cartella Download (o qui sotto).'), 'Esportazione completata. Il file prodotto è elencato qui sotto.');
  assert.equal(P('Acchiappati 3 spettri! 👻 Gino è contentissimo: 2 FTIR, 1 Raman. 🎉'), 'Caricati 3 spettri: 2 FTIR, 1 Raman.');
  assert.equal(P('💾 Progetto salvato: 4 spettri e tutto il lavoro, nel file «a.acchspettri».'), 'Progetto salvato in «a.acchspettri»: 4 spettri.');
  assert.equal(P('Salvato: rapporto!.pdf'), 'Salvato: rapporto!.pdf', 'un «!» dentro un nome di file resta');
  // tutte le frasi di Gino e i saluti della pagina, anche senza voce in tabella, escono puliti
  const lists=['GREET','GINO'].map(n=>{ const m=new RegExp('const '+n+' = \\[([\\s\\S]*?)\\];').exec(HTML); return vm.runInNewContext('['+m[1]+']'); });
  for (const L of lists) for (const s of L) clean(P(s), 'pro(«'+s+'»)'); });
test('testi fissi: inglese e italiano a seconda della lingua, segni di gravità tipografici', ()=>{ const w=load(true,'en'), D=w.ACCH_DESK;
  const node={nodeType:3, nodeValue:' Scarica ', parentElement:{tagName:'BUTTON', hasAttribute:()=>false, parentElement:null}}; D.dom(node); assert.equal(node.nodeValue,' Export ');
  const n2={nodeType:3, nodeValue:'⛔ Dati da controllare:', parentElement:node.parentElement}; D.dom(n2); assert.equal(n2.nodeValue,'⊘ Dati da controllare:');
  w.AcchI18n.lang='it'; const n3={nodeType:3, nodeValue:'Export', parentElement:node.parentElement}; D.dom(n3); assert.equal(n3.nodeValue,'Esporta'); });
