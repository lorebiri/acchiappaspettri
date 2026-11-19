// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// scripts/valida-certificati.js: certificato CSV, errori, ζ ed E_n, criteri, ricerca dei campioni, aggancio LIBS. Dati FINTI, tranne l'ultimo
// test che fa girare l'esempio pubblico NIST SRM 1155 (spettro di PyMca) con il nucleo.
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('fs'), os=require('os'), path=require('path');
const V=require('../../scripts/valida-certificati.js');
const near=(a,b,t)=>assert.ok(Math.abs(a-b)<=(t||1e-9), a+' ≠ '+b);

test('certificato: virgole o punti e virgola, unità, ossidi, limiti, tipi, righe sbagliate segnalate', ()=>{
  const a=V.parseCertificato('# fonte: finta\nelemento,valore,incertezza,unita,tipo,k\nCu,84.1,0.2,%,certificato,2\nFe,350,20,mg/kg,indicativo,\nSiO2,10,,%,informativo,\nPb,<0.001,,%,certificato,\nXx,1,,%,certificato,\nZn,2,0.1,furlong,certificato,\nSn,abc,,%,,\n');
  const by=Object.fromEntries(a.righe.map(r=>[r.el, r]));
  assert.deepEqual(Object.keys(by), ['Cu','Fe','Si','Pb']);
  near(by.Cu.valore, 84.1); near(by.Cu.U, 0.2); assert.equal(by.Cu.k, 2); assert.equal(by.Cu.tipo, 'certificato');
  near(by.Fe.valore, 0.035); near(by.Fe.U, 0.002); assert.equal(by.Fe.tipo, 'indicativo'); assert.equal(by.Fe.k, null);
  near(by.Si.valore, 10*28.085/(28.085+2*15.999), 1e-6); assert.match(by.Si.nota, /SiO2/);
  assert.equal(by.Pb.tipo, 'limite'); assert.equal(by.Pb.limite, '<');
  assert.equal(a.avvisi.length, 3); assert.match(a.avvisi.join('\n'), /Xx.*non riconosciuto/); assert.match(a.avvisi.join('\n'), /furlong/); assert.match(a.avvisi.join('\n'), /abc/);
  const b=V.parseCertificato('elemento;valore;incertezza;unità;tipo\nCu;84,12;0,15;%;certificato\nSn;7,96;0,08;% in peso;certified\nAg;1.200;50;ppm;reference\n');
  near(b.righe[0].valore, 84.12); near(b.righe[1].U, 0.08); assert.equal(b.righe[1].tipo, 'certificato'); near(b.righe[2].valore, 0.12); assert.equal(b.righe[2].tipo, 'indicativo');
  assert.throws(()=>V.parseCertificato('el,quanto\nCu,1\n'), /elemento/);
  assert.throws(()=>V.parseCertificato('# solo note\n'), /vuoto/);
});

test('errori, ζ ed E_n con le incertezze del certificato e dell\'app', ()=>{
  const cr=Object.assign({}, V.CRITERI_DEF, {incertezza_modello_rel:0});
  const righe=[{el:'Cu', valore:80, U:0.4, k:2, tipo:'certificato'}];
  const r=V.valuta(righe, {Cu:{w:82, sw:0.3}}, cr).righe[0];
  near(r.errRel, 2.5); near(r.zeta, 2/Math.hypot(0.3, 0.2)); near(r.En, 2/Math.hypot(0.6, 0.4)); assert.equal(r.esito, 'non superato'); assert.match(r.motivo, /ζ oltre 2/);
  // con il 5% di incertezza di modello lo scarto del 2,5% non è più significativo
  const r5=V.valuta(righe, {Cu:{w:82, sw:0.3}}, V.CRITERI_DEF).righe[0];
  near(r5.u, Math.hypot(0.3, 0.05*82)); assert.equal(r5.esito, 'superato');
  // k mancante: quello predefinito
  const rk=V.valuta([{el:'Cu', valore:80, U:0.4, k:null, tipo:'certificato'}], {Cu:{w:80, sw:0}}, cr).righe[0]; assert.equal(rk.k, 2); near(rk.zeta, 0);
});

test('criteri: fasce, combinazioni, tipi non valutati, non trovato, fissi, esito del campione', ()=>{
  const righe=[{el:'Cu', valore:80, U:0.4, k:2, tipo:'certificato'}, {el:'Sn', valore:0.5, U:0.01, k:2, tipo:'certificato'}, {el:'As', valore:0.05, U:0.005, k:2, tipo:'certificato'},
    {el:'Fe', valore:0.3, U:null, k:null, tipo:'indicativo'}, {el:'Ni', valore:2, U:0.05, k:2, tipo:'certificato'}, {el:'Si', valore:0.4, U:0.01, k:2, tipo:'certificato'}, {el:'Bi', valore:0.001, tipo:'limite', limite:'<'}];
  const trov={Cu:{w:86, sw:0.1}, Sn:{w:0.55, sw:0.01}, As:{w:0.2, sw:0.01}, Fe:{w:0.9, sw:0.01}};
  const v=V.valuta(righe, trov, V.CRITERI_DEF, {Si:0.4});
  const e=Object.fromEntries(v.righe.map(r=>[r.el, r]));
  assert.equal(e.Cu.esito, 'superato', '+7,5% sopra l\'1%: entro il 10%'); assert.equal(e.Cu.limiteErr, 10);
  assert.equal(e.Sn.esito, 'superato', '+10% fra 0,1 e 1%: entro il 25%, ζ 1,7'); assert.equal(e.Sn.limiteErr, 25);
  assert.equal(e.As.esito, 'segnalato'); assert.equal(e.As.limiteErr, null);
  assert.equal(e.Fe.esito, 'informazione'); assert.equal(e.Ni.esito, 'non trovato'); assert.equal(e.Si.esito, 'fisso'); assert.equal(e.Bi.esito, 'informazione');
  assert.equal(v.valutati, 3); assert.equal(v.superati, 2); assert.equal(v.esito, 'non superato');
  // combinazioni
  const big=[{el:'Cu', valore:80, U:0.1, k:2, tipo:'certificato'}], x={Cu:{w:96, sw:0.1}};   // +20%: errore oltre, ζ oltre
  const cr0=Object.assign({}, V.CRITERI_DEF, {incertezza_modello_rel:0});
  assert.equal(V.valuta(big, x, cr0).righe[0].esito, 'non superato');
  const close=[{el:'Cu', valore:80, U:0.1, k:2, tipo:'certificato'}], y={Cu:{w:81, sw:0.01}};   // +1,25%: errore entro, ζ molto oltre
  assert.equal(V.valuta(close, y, Object.assign({}, cr0, {combinazione:'e'})).righe[0].esito, 'non superato');
  assert.equal(V.valuta(close, y, Object.assign({}, cr0, {combinazione:'o'})).righe[0].esito, 'superato');
  assert.equal(V.valuta(close, y, Object.assign({}, cr0, {combinazione:'errore'})).righe[0].esito, 'superato');
  // valutare anche gli indicativi
  assert.equal(V.valuta(righe, trov, Object.assign({}, V.CRITERI_DEF, {tipi_valutati:['certificato','indicativo']})).righe.find(r=>r.el==='Fe').esito, 'non superato');
  assert.equal(V.valuta([], {}, V.CRITERI_DEF).esito, 'niente da valutare');
});

test('file dei criteri: valori modificabili, note ignorate, errori chiari', ()=>{
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'acch-crit-'));
  try{
    const f=path.join(d,'c.json'); fs.writeFileSync(f, JSON.stringify({_nota:'x', zeta_max:3, combinazione:'o'}));
    const c=V.caricaCriteri(f); assert.equal(c.zeta_max, 3); assert.equal(c.combinazione, 'o'); assert.equal(c._nota, undefined); assert.deepEqual(c.fasce, V.CRITERI_DEF.fasce);
    fs.writeFileSync(f, JSON.stringify({combinazione:'forse'})); assert.throws(()=>V.caricaCriteri(f), /combinazione/);
    assert.deepEqual(V.caricaCriteri(path.join(d,'manca.json')), V.CRITERI_DEF);
    // il file della cartella è coerente con i valori predefiniti dichiarati nello script e nel README
    const repo=V.caricaCriteri(path.join(__dirname,'..','..','validazione','certificati','criteri.json'));
    for (const k of Object.keys(V.CRITERI_DEF)) assert.deepEqual(repo[k], V.CRITERI_DEF[k], k);
  } finally { fs.rmSync(d, {recursive:true, force:true}); }
});

test('ricerca dei campioni, metadati, spettri a due colonne, aggancio LIBS «non ancora disponibile», rapporto', ()=>{
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'acch-cert-'));
  try{
    const mk=(rel, files)=>{ const p=path.join(d,rel); fs.mkdirSync(p,{recursive:true}); for (const [n,t] of Object.entries(files)) fs.writeFileSync(path.join(p,n), t); };
    const libsSpec=Array.from({length:40}, (_,i)=>(300+i*0.5)+','+(100+i)).join('\n');
    mk('vetro-libs', {'certificato.csv':'elemento,valore\nSi,30\n', 'metadati.json':JSON.stringify({tecnica:'libs', ritardo_us:1, gate_us:10}), 'spettro.csv':libsSpec});
    mk('_saltato', {'certificato.csv':'elemento,valore\nCu,1\n', 'metadati.json':'{}'});
    mk('gruppo/senza-spettro', {'certificato.csv':'elemento,valore\nCu,1\n', 'metadati.json':JSON.stringify({tecnica:'xrf'})});
    mk('strano', {'certificato.csv':'elemento,valore\nCu,1\n', 'metadati.json':JSON.stringify({tecnica:'raman'}), 'a.txt':libsSpec});
    const C=V.trovaCampioni(d); assert.deepEqual(C.map(c=>c.nome).sort(), ['gruppo/senza-spettro','strano','vetro-libs']);
    assert.equal(path.basename(C.find(c=>c.nome==='vetro-libs').spettro), 'spettro.csv');
    const sp=V.leggiSpettro(libsSpec); assert.equal(sp.fmt, 'due colonne'); assert.equal(sp.ys.length, 40); near(sp.xRaw[2], 301);
    const R=V.valida({dir:d, moduloLibs:path.join(d,'non-esiste.js'), data:'2026-01-01'});
    const by=Object.fromEntries(R.esiti.map(e=>[e.nome, e]));
    assert.equal(by['vetro-libs'].nonDisponibile, true); assert.match(by['vetro-libs'].avvisi[0], /non ancora disponibile/);
    assert.match(by['gruppo/senza-spettro'].errore, /spettro non trovato/); assert.match(by.strano.errore, /raman.*non prevista/);
    assert.match(R.md, /\| vetro-libs \| LIBS \| non ancora disponibile \|/); assert.match(R.md, /generato|Generato/);
    // con un modulo CF-LIBS che espone quantify(): il risultato entra nel confronto
    const mod=path.join(d,'libs-finto.js'); fs.writeFileSync(mod, 'module.exports={quantify:(sp,o)=>({res:{Si:{w:31, sw:0.5}}})};');
    const R2=V.valida({dir:d, moduloLibs:mod}); const e=R2.esiti.find(x=>x.nome==='vetro-libs');
    assert.equal(e.valutazione.righe[0].esito, 'superato'); near(e.valutazione.righe[0].errRel, 100/30);
  } finally { fs.rmSync(d, {recursive:true, force:true}); }
});

test('metadati → fpSetup: il .cfg di PyMca prima, i metadati vincono; ripiego per un nucleo senza eccitazione a lista', ()=>{
  const neutro={setup:{anode:'Ag', kv:30, psi1:45, psi2:45, atm:'air', si:350, beD:20, exc:[[16,1,1]]}};
  const {o, avvisi}=V.setupDaMetadati({anodo:'Rh', angoli:{ingresso:60}, atmosfera:'elio', rivelatore:{tipo:'Ge', spessore_um:1000}, filtro:{materiale:'Cu', spessore_um:25}, eccitazione:[{E:17.48}], kV:40}, neutro);
  assert.deepEqual({anode:o.anode, kv:o.kv, psi1:o.psi1, psi2:o.psi2, atm:o.atm, det:o.det, si:o.si, beD:o.beD}, {anode:'Rh', kv:40, psi1:60, psi2:45, atm:'he', det:'Ge', si:1000, beD:20});
  assert.deepEqual(o.filt, {comp:'Cu', rho:8.96, um:25}); assert.deepEqual(o.exc, [[17.48,1,1]]); assert.equal(avvisi.length, 0);
  assert.match(V.setupDaMetadati({atmosfera:'azoto', filtro:{materiale:'W', spessore_um:5}}).avvisi.join(' '), /azoto.*W/s);
  const Core=require('./load-core.js');
  const nat=V.eccitazione(Core, {anode:'Ag', kv:30, exc:[[16,1,1]]}); assert.equal(nat.modo, 'nucleo');
  // un nucleo che non conosce exc (come la 3.0): lo spettro del tubo nella cache è sostituito dalla lista
  const vecchio=Object.assign({}, Core, {fpSetup:x=>{ const y=Object.assign({}, x); delete y.exc; return Core.fpSetup(y); }});
  const rip=V.eccitazione(vecchio, {anode:'Ag', kv:30, exc:[[16,1,1]]}); assert.equal(rip.modo, 'ripiego'); assert.equal(rip.S.kv, 16);
  const P=Core.fpPrep(rip.S); assert.deepEqual(Array.from(P.E), [16]); assert.deepEqual(Array.from(P.N), [1]);
  Core.FP_CACHE.clear();
});

test('esempio pubblico NIST SRM 1155 (Steel.spe di PyMca): gira con il nucleo e Cr, Mn, Cu sono entro i criteri', ()=>{
  const dir=path.join(__dirname,'..','..','validazione','certificati');
  const R=V.valida({dir}); const e=R.esiti.find(x=>x.nome==='esempi/nist-srm-1155');
  assert.ok(e && !e.errore, e && e.errore); assert.equal(e.dettagli.eccitazione, 'nucleo'); assert.deepEqual(e.dettagli.setup.exc, [[16,1,1]]);
  const by=Object.fromEntries(e.valutazione.righe.map(r=>[r.el, r]));
  for (const el of ['Cr','Mn','Cu']) assert.equal(by[el].esito, 'superato', el+' '+by[el].errRel);
  assert.equal(by.Mo.esito, 'fisso'); assert.equal(by.Fe.tipo, 'per_differenza');
  assert.ok(Math.abs(by.Fe.errRel)<5, 'Fe per differenza: '+by.Fe.errRel);
});
