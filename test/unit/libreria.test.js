// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Tappa I4: librerie dei picchi per strumento e tipo di campione (app/library.js, app/library-store.js). Dati SINTETICI.
// Formato .acchlib.json versionato, librerie distinte per coppia, riconoscimento dello strumento, unione voce per voce,
// copie di conflitto, scritture contemporanee senza perdite (DECISIONE-PO §7), software per tutti (nessuna libreria di serie).
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), crypto=require('crypto');
const root=path.join(__dirname,'..','..');
const Lib=require(path.join(root,'app','library.js')), Store=require(path.join(root,'app','library-store.js'));
const BOZZA=path.join(root,'examples','librerie','saliva-hplc-dad220.bozza.json');

const A1260={brand:'Agilent', model:'1260 Infinity', detector:'DAD G4212B'}, A1290={brand:'Agilent', model:'1290 Infinity II', detector:'DAD G7117B'};
const entry=(name,x,slope)=>({name, x, window:0.1, channel:{detector:'DAD1A', lambda:220, bandwidth:4, reference:'off'}, method:'M1', cal:{kind:'line', slope, intercept:0, sa:0.5, syx:1, n:6, r2:0.9995, range:[1,20], areaUnit:'mAU·min', concUnit:'mg/L', date:'2026-10-01', standardLot:'L-1'}});

test('formato acchlib 1: normalizzato, serializzato in modo stabile, impronta SHA-256 come quella di Node', ()=>{
  const lib=Lib.create({instrument:A1260, sampleType:'alimenti', technique:'hplc', author:'Prova', entries:[entry('Caffeina',3.2,100)]});
  assert.strictEqual(lib.format,'acchlib'); assert.strictEqual(lib.formatVersion,1); assert.strictEqual(lib.revision,1);
  assert.strictEqual(lib.name,'Agilent 1260 Infinity · DAD — alimenti');
  const t=Lib.serialize(lib), again=Lib.parse(t);
  assert.strictEqual(Lib.serialize(again), t, 'stesso contenuto, stesso testo');
  assert.strictEqual(Lib.sha256(t), crypto.createHash('sha256').update(t,'utf8').digest('hex'));
  assert.strictEqual(Lib.sha256('àèé·—«»'), crypto.createHash('sha256').update('àèé·—«»','utf8').digest('hex'));
  // chiavi pericolose scartate, numeri non finiti tolti, formato più nuovo rifiutato
  const bad=JSON.parse(t); bad.__proto__polluted=1; bad.entries[0]['__proto__']={x:1};
  const p=Lib.parse(JSON.stringify(bad).replace('"__proto__polluted":1,','"constructor":{"a":1},'));
  assert.strictEqual(({}).x, undefined); assert.ok(!Object.prototype.hasOwnProperty.call(p,'constructor'));
  assert.throws(()=>Lib.parse(JSON.stringify(Object.assign(JSON.parse(t),{formatVersion:9}))), e=>e.code==='newer-format');
  assert.throws(()=>Lib.parse('{"format":"altro"}'), e=>e.code==='not-a-library');
  assert.throws(()=>Lib.parse('non json'), e=>e.code==='invalid-json');
  // soglie allargate senza motivazione: tornano a quelle predefinite (SPEC «Modificabile»)
  const w=Lib.parse(JSON.stringify(Object.assign(JSON.parse(t),{thresholds:{dev:14}})));
  assert.strictEqual(w.thresholds.dev,10); assert.ok(w.warnings.includes('threshold-without-reason'));
  const w2=Lib.parse(JSON.stringify(Object.assign(JSON.parse(t),{thresholds:{dev:30}, thresholdReason:'matrice difficile, validato in casa'})));
  assert.strictEqual(w2.thresholds.dev,15,'mai oltre il massimo della tabella');
});

test('due librerie con lo stesso composto, strumenti o tipi di campione diversi: restano distinte e si sceglie la coppia giusta', ()=>{
  const L1=Lib.create({instrument:A1260, sampleType:'alimenti', entries:[entry('Caffeina',3.2,100)]});
  const L2=Lib.create({instrument:A1290, sampleType:'alimenti', entries:[entry('Caffeina',3.2,140)]});
  const L3=Lib.create({instrument:A1260, sampleType:'farmaceutico', entries:[entry('Caffeina',3.2,120)]});
  assert.notStrictEqual(L1.id, L2.id); assert.notStrictEqual(L1.id, L3.id);
  const all=[L1,L2,L3].map(lib=>({lib, origin:'user'}));
  const c1=Lib.choose(all,{instrument:A1260, sampleType:'alimenti'}), c2=Lib.choose(all,{instrument:A1290, sampleType:'Alimenti'}), c3=Lib.choose(all,{instrument:A1260, sampleType:'farmaceutico'});
  assert.strictEqual(c1.pick.lib.id, L1.id); assert.strictEqual(c2.pick.lib.id, L2.id); assert.strictEqual(c3.pick.lib.id, L3.id);
  assert.strictEqual(c1.pick.lib.entries[0].cal.slope, 100); assert.strictEqual(c2.pick.lib.entries[0].cal.slope, 140);
  // un altro strumento (1290 di un'altra serie, un VWD, un altro numero di serie): mai proposta; si propone di crearla
  const c4=Lib.choose([{lib:L1, origin:'user'}], {instrument:A1290, sampleType:'alimenti'});
  assert.strictEqual(c4.pick, null); assert.strictEqual(c4.missing, true); assert.strictEqual(c4.wrongInstrument.length, 1);
  assert.strictEqual(Lib.choose([{lib:L1}], {instrument:{brand:'Agilent', model:'1260 Infinity', detector:'VWD G1314F'}, sampleType:'alimenti'}).pick, null);
  const L5=Lib.create({instrument:Object.assign({serial:'DE111'},A1260), sampleType:'alimenti'});
  assert.strictEqual(Lib.choose([{lib:L5}], {instrument:Object.assign({serial:'DE999'},A1260), sampleType:'alimenti'}).pick, null);
  // tipo di campione non scelto: nessuna libreria «indovinata»
  assert.strictEqual(Lib.choose(all,{instrument:A1260, sampleType:''}).pick, null);
});

test('strumento dall\'intestazione: ChemStation, OpenLab, altri sistemi; senza intestazione niente', ()=>{
  const r=Lib.recognize(['Sample Name: X','Acq. Instrument: Agilent 1260 Infinity','Instrument Modules: G1311B Quat Pump, G1329B ALS, G1316A TCC, G4212B DAD','Acq. Method: C:\\Chem32\\1\\METHODS\\MET-A.M','Signal: DAD1 A, Sig=220,4 Ref=off']);
  assert.deepStrictEqual([r.brand,r.model,r.detector,r.method], ['Agilent','1260 Infinity','DAD G4212B','MET-A.M']);
  assert.deepStrictEqual(r.channel, {detector:'DAD1A', lambda:220, bandwidth:4, reference:'off', refBandwidth:null});
  assert.ok(r.evidence.some(e=>e.field==='model') && r.found);
  assert.strictEqual(Lib.instrumentCompare(A1260, r).level, 'same');
  const o=Lib.recognize(['Instrument: 1290 Infinity II LC System','Detector: G7117B DAD FS','Method Name: Metodo B','Signal: DAD1A,Sig=254,4,Ref=360,100']);
  assert.deepStrictEqual([o.brand,o.model,o.detector], ['Agilent','1290 Infinity II','DAD G7117B']); assert.strictEqual(o.channel.lambda,254); assert.strictEqual(o.channel.reference,360);
  assert.strictEqual(Lib.instrumentCompare(A1260, o).level, 'different');
  const w=Lib.recognize(['Instrument Name: Waters Alliance e2695','Detector: 2998 PDA']); assert.strictEqual(w.brand,'Waters');
  const f=Lib.recognize(['##TITLE=x','##SPECTROMETER/DATA SYSTEM=Bruker ALPHA II']); assert.deepStrictEqual([f.brand,f.model],['Bruker','ALPHA II']);
  assert.strictEqual(Lib.recognize(['Time (min),Signal (mAU)'],'STD1.csv').found, false);
  // canale: «Sig=220,4» è λ 220 con banda 4; il testo si rilegge identico
  for (const t of ['DAD1 A, Sig=254,4 Ref=360,100','VWD1A 280 nm','DAD 220 nm']){ const c=Lib.parseChannel(t); assert.deepStrictEqual(Lib.parseChannel(Lib.channelText(c)), c, t); }
  assert.strictEqual(Lib.channelCompare({lambda:220, bandwidth:4}, {lambda:254}).ok, false);
  assert.deepStrictEqual(Lib.channelCompare({lambda:220, bandwidth:4}, {lambda:220}).unverified, ['bandwidth']);
  assert.strictEqual(Lib.channelCompare({lambda:220}, null).ok, false, 'λ salvata e file che non la dice: non verificabile');
});

test('voci: ogni picco a una sola voce, la più vicina; RRT dal picco di riferimento', ()=>{
  const lib=Lib.create({entries:[{name:'A', x:3.56, window:0.1}, {name:'B', x:3.64, window:0.1}, {name:'C', x:6.0, window:0.1, rrt:2, rrtRef:'rA'}, {id:'rA', name:'Rif', x:3.0, window:0.2}]});
  const m=Lib.matchEntries(lib, [3.57, 3.05]); const by=n=>m.find(q=>q.entry.name===n);
  assert.strictEqual(by('A').x, 3.57); assert.strictEqual(by('B').found, false, 'lo stesso picco non va a due voci');
  assert.strictEqual(by('Rif').x, 3.05); assert.strictEqual(by('C').expected, 6.1); assert.strictEqual(by('C').byRrt, true);
});

test('unione voce per voce: modifiche separate unite, stessa voce cambiata da due parti → conflitto, scelte dell\'utente', ()=>{
  const base=Lib.create({instrument:A1260, sampleType:'alimenti', entries:[entry('A',2,10), entry('B',3,20), entry('C',4,30)]});
  const mine=JSON.parse(JSON.stringify(base)), theirs=JSON.parse(JSON.stringify(base));
  Lib.upsert(mine, Object.assign({}, mine.entries[0], {cal:Object.assign({}, mine.entries[0].cal, {slope:11})}));   // noi: A
  Lib.upsert(theirs, Object.assign({}, theirs.entries[1], {cal:Object.assign({}, theirs.entries[1].cal, {slope:21})}));   // loro: B
  Lib.upsert(theirs, entry('D',5,40));   // loro: voce nuova
  Lib.removeEntry(mine, mine.entries[2].id);   // noi: tolta C
  let m=Lib.merge(base, mine, theirs);
  assert.strictEqual(m.conflicts.length, 0);
  const s=n=>{ const e=m.merged.entries.find(x=>x.name===n); return e&&!e.deleted ? e.cal.slope : null; };
  assert.deepStrictEqual(['A','B','C','D'].map(s), [11,21,null,40]);
  assert.ok(m.merged.revision>Math.max(mine.revision, theirs.revision));
  // la stessa voce cambiata da entrambi: conflitto, niente scelto in silenzio
  const t2=JSON.parse(JSON.stringify(base)); Lib.upsert(t2, Object.assign({}, t2.entries[0], {cal:Object.assign({}, t2.entries[0].cal, {slope:12})}));
  t2.name='Nome cambiato da un collega';
  m=Lib.merge(base, mine, t2);
  assert.deepStrictEqual(m.conflicts.map(c=>c.kind).sort(), ['entry']); assert.strictEqual(m.merged.name, 'Nome cambiato da un collega', 'meta cambiato da una parte sola: unito');
  assert.throws(()=>Lib.resolve(m, {}), e=>e.code==='unresolved');
  const id=m.conflicts[0].id;
  assert.strictEqual(Lib.resolve(m, {[id]:'theirs'}).entries.find(e=>e.id===id).cal.slope, 12);
  assert.strictEqual(Lib.resolve(m, {[id]:'mine'}).entries.find(e=>e.id===id).cal.slope, 11);
  // senza base (importazione): vince la revisione più alta e più recente solo se è un discendente evidente; altrimenti conflitto
  const old=JSON.parse(JSON.stringify(base)), nw=JSON.parse(JSON.stringify(base)); Lib.upsert(nw, Object.assign({}, nw.entries[0], {cal:Object.assign({}, nw.entries[0].cal, {slope:10.5})}), {now:'2099-01-01T00:00:00Z'});
  const mi=Lib.merge(null, old, nw); assert.strictEqual(mi.conflicts.length, 0); assert.ok(mi.auto.some(a=>a.took==='theirs-newer'));
  assert.throws(()=>Lib.merge(null, base, Lib.create({})), e=>e.code==='different-library');
});

test('copie di conflitto di OneDrive riconosciute dal nome e dall\'id', ()=>{
  const cc=Lib.conflictCopies([{name:'agilent-1260-dad-alimenti.acchlib.json', id:'L1'}, {name:'agilent-1260-dad-alimenti-PC-LAB.acchlib.json', id:'L1'}, {name:'agilent-1260-dad-alimenti-PC-LAB-2.acchlib.json', id:'L1'}, {name:'altra (1).acchlib.json', id:'L2'}, {name:'altra.acchlib.json', id:'L2'}, {name:'copia senza nome simile.acchlib.json', id:'L1'}, {name:'diversa.acchlib.json', id:'L9'}]);
  const n=cc.map(c=>c.name).sort();
  assert.deepStrictEqual(n, ['agilent-1260-dad-alimenti-PC-LAB-2.acchlib.json','agilent-1260-dad-alimenti-PC-LAB.acchlib.json','altra (1).acchlib.json','copia senza nome simile.acchlib.json'].sort());
  assert.strictEqual(cc.find(c=>c.name==='copia senza nome simile.acchlib.json').reason, 'same-id');
});

test('scritture contemporanee: confronto dell\'impronta, unione, conflitti all\'utente, mai sovrascrivere in silenzio (×3)', async ()=>{
  for (let rep=0; rep<3; rep++){
    const S=Store.make(Store.memoryBackend());
    const lib=Lib.create({instrument:A1260, sampleType:'alimenti', entries:[entry('A',2,10), entry('B',3,20)]});
    const r0=await S.save({origin:'user'}, lib); assert.ok(r0.ok);
    // due finestre (o due computer sulla stessa cartella condivisa) leggono la stessa versione
    const [a]=(await S.list()).filter(x=>x.lib), [b]=(await S.list()).filter(x=>x.lib);
    const la=JSON.parse(JSON.stringify(a.lib)), lb=JSON.parse(JSON.stringify(b.lib));
    Lib.upsert(la, entry('C',4,30)); Lib.upsert(lb, entry('D',5,40));
    assert.ok((await S.save(a, la)).ok);
    let asked=0; const rb=await S.save(b, lb, ()=>{ asked++; return {}; });
    assert.ok(rb.ok); assert.strictEqual(asked, 0, 'voci diverse: nessuna domanda');
    let now=(await S.list()).find(x=>x.lib).lib; assert.deepStrictEqual(Lib.liveEntries(now).map(e=>e.name).sort(), ['A','B','C','D'], 'nessuna voce persa');
    // stessa voce cambiata da due parti: domanda; «annulla» non scrive niente
    const [c]=(await S.list()).filter(x=>x.lib), [d]=(await S.list()).filter(x=>x.lib);
    const lc=JSON.parse(JSON.stringify(c.lib)), ld=JSON.parse(JSON.stringify(d.lib)); const id=lc.entries[0].id;
    Lib.upsert(lc, Object.assign({}, lc.entries[0], {cal:Object.assign({}, lc.entries[0].cal, {slope:15})})); Lib.upsert(ld, Object.assign({}, ld.entries[0], {cal:Object.assign({}, ld.entries[0].cal, {slope:16})}));
    assert.ok((await S.save(c, lc)).ok);
    const before=(await S.list()).find(x=>x.lib).hash;
    const cancel=await S.save(d, ld, m=>{ assert.strictEqual(m.conflicts.length,1); return null; });
    assert.strictEqual(cancel.ok, false); assert.strictEqual((await S.list()).find(x=>x.lib).hash, before, 'annullato: il file resta com\'era');
    const ok=await S.save(d, ld, m=>({[m.conflicts[0].id]:'mine'}));
    assert.ok(ok.ok); now=(await S.list()).find(x=>x.lib).lib; assert.strictEqual(now.entries.find(e=>e.id===id).cal.slope, 16);
    assert.strictEqual(Lib.liveEntries(now).length, 4);
  }
});

test('software per tutti: nessuna libreria di serie, la bozza è un esempio fuori dall\'installazione e si importa', ()=>{
  const sys=fs.readFileSync(path.join(root,'app','librerie-sistema.js'),'utf8'); assert.match(sys, /ACCH_SYSTEM_LIBS=\[\];/);
  assert.ok(!fs.existsSync(path.join(root,'docs','libreria','saliva-hplc-dad220.bozza.json')), 'la bozza non resta tra i documenti dell\'app');
  // nessun testo visibile dell'app parla di saliva: pagina, moduli, traduzioni, Novità e tutorial
  const files=['index.html', ...fs.readdirSync(path.join(root,'app')).filter(f=>/\.js$/.test(f)).map(f=>'app/'+f), 'i18n/en.json', 'i18n/en-app.json', ...fs.readdirSync(path.join(root,'docs','tutorial')).map(f=>'docs/tutorial/'+f)];
  for (const f of files){ const p=path.join(root,f); if (!fs.statSync(p).isFile()) continue; assert.ok(!/saliva/i.test(fs.readFileSync(p,'utf8')), f+' parla di saliva'); }
  // il pacchetto desktop copia app/, vendor/ e i18n: examples/ resta fuori
  const prep=fs.readFileSync(path.join(root,'scripts','prepare-desktop.js'),'utf8'); assert.ok(!/examples/.test(prep));
  // la bozza si importa come libreria dell'utente: Agilent 1260 · DAD, voci con la taratura salvata (stesso sistema), le altre solo identificazione
  const lib=Lib.parse(fs.readFileSync(BOZZA,'utf8'));
  assert.strictEqual(lib.instrument.model,'1260 Infinity'); assert.match(lib.instrument.detector,/G4212B/); assert.strictEqual(lib.profile,'ricerca');
  assert.strictEqual(lib.entries.length, 35); assert.strictEqual(lib.entries.filter(e=>e.cal).length, 24);
  const cr=lib.entries.find(e=>e.name==='Creatinine'); assert.strictEqual(cr.cal.slope, 9876); assert.strictEqual(cr.cal.areaUnit,'mAU·s'); assert.strictEqual(cr.cal.concUnit,'mM'); assert.strictEqual(cr.cal.source,'letteratura'); assert.strictEqual(cr.channel.lambda,220);
  assert.strictEqual(lib.entries.filter(e=>/DNPH/.test(e.name)).every(e=>!e.cal), true, 'UHPLC 1290 senza tR: solo identificazione');
  // suggerimenti generici per il tipo di campione
  assert.deepStrictEqual(Lib.SAMPLE_SUGGESTIONS.map(s=>s[0]), ['alimenti','farmaceutico','ambientale','biologico','polimeri','beni culturali','altro']);
});

test('altre tecniche: la stessa libreria per FTIR, Raman, XRF con posizione, finestra e risposta', ()=>{
  const ftir=Lib.create({technique:'ftir', instrument:{brand:'Bruker', model:'ALPHA II', detector:'DTGS'}, sampleType:'polimeri', entries:[{name:'C=O', x:1715, window:15, cal:{kind:'line', slope:0.02, intercept:0, measure:'area', areaUnit:'A·cm-1', concUnit:'%', range:[0,5]}}]});
  assert.strictEqual(ftir.technique,'ftir'); assert.strictEqual(ftir.entries[0].cal.measure,'area');
  const all=[{lib:ftir}, {lib:Lib.create({technique:'hplc', instrument:{brand:'Bruker', model:'ALPHA II'}, sampleType:'polimeri'})}];
  assert.strictEqual(Lib.choose(all, {technique:'ftir', instrument:{brand:'Bruker', model:'ALPHA II', detector:'DTGS'}, sampleType:'polimeri'}).pick.lib.id, ftir.id);
  assert.strictEqual(Lib.matchEntries(ftir, [1712, 2920])[0].x, 1712);
});
