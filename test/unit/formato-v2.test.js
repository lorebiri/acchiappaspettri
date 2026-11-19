// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I2: formato di progetto 2 (docs/FORMATO-ACCHSPETTRI.md). Lettura completa della versione 1 senza perdite (fixture congelata
// progetto-v1-completo, scritta dal codificatore della 3.0.0-rc.1), byte dei file una volta sola con sampleKey, librerie incorporate,
// f.series, f.cube (dati binari in un campo separato) e f.iso.
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), JSZip=require('jszip');
const F=require('../../app/project-format.js');
const FX=n=>new Uint8Array(fs.readFileSync(path.join(__dirname,'..','fixtures',n)));
const ATTESO=JSON.parse(fs.readFileSync(path.join(__dirname,'..','fixtures','progetto-v1-completo.atteso.json'),'utf8'));
const enc=s=>new TextEncoder().encode(s);
// ciò che project.js passa a encode dopo aver aperto un progetto: gli stessi dati, riscritti nel formato 2
const reinput=P=>({appVersion:'3.0.0', title:P.manifest.title, createdAt:P.manifest.createdAt, state:P.state, libraries:P.libraries,
  spectra:P.spectra.map(s=>({name:s.name, path:s.path, bytes:s.bytes, binary:s.binary, memory:s.memory, sampleKey:s.sampleKey, channel:s.channel, processedCsv:s.processed?'x,y':null, series:s.series, cube:s.cube, iso:s.iso})), results:P.results});

test('versione 2: il file dichiara formatVersion 2 e minReaderVersion 2 (la 2.2.0 dice «aggiorna», non perde dati in silenzio)', async ()=>{
  const zip=await JSZip.loadAsync(await F.encode({state:{}, spectra:[{name:'a.txt', path:'a.txt', bytes:enc('1 2\n')}]}, JSZip));
  const m=JSON.parse(await zip.file('manifest.json').async('string'));
  assert.equal(m.formatVersion,2); assert.equal(m.minReaderVersion,2);
  for (const n of ['project/sources.json','project/spectra.json','project/libraries.json','project/state.json','data/000001.dat']) assert.ok(zip.file(n), n);
});

test('progetto della versione 1: letto per intero, senza perdite', async ()=>{
  const P=await F.decode(FX('progetto-v1-completo.acchspettri'), JSZip);
  assert.equal(P.manifest.formatVersion,2); assert.equal(P.manifest.readFrom,1); assert.ok(P.warnings.includes('migrated-from-1'));
  assert.equal(P.manifest.title, ATTESO.manifest.title); assert.equal(P.manifest.appVersion, ATTESO.manifest.appVersion); assert.equal(P.manifest.createdAt, ATTESO.manifest.createdAt);
  assert.deepStrictEqual(P.state, ATTESO.state);
  assert.equal(P.spectra.length, ATTESO.spectra.length);
  P.spectra.forEach((s,i)=>{ const a=ATTESO.spectra[i];
    assert.equal(s.name,a.name); assert.equal(s.path,a.path); assert.equal(s.binary,a.binary); assert.deepStrictEqual(s.memory,a.memory);
    assert.equal(s.bytes.length,a.size); assert.equal(F.sha256(s.bytes),a.sha256); assert.equal(!!s.processed,a.processed);
    assert.equal(s.sampleKey,null); assert.equal(s.channel,null);
    const src=P.sources.find(x=>x.id===s.source); assert.ok(src,'sorgente di '+s.path); assert.equal(src.sha256,a.sha256); });
  assert.deepStrictEqual(P.results.map(r=>[r.name,r.text]).sort(), ATTESO.results.map(r=>[r.name.replace(/[^\w.\- ]+/g,'_'),r.text]).sort());
  assert.deepEqual(P.libraries,[]);
});

test('versione 1 → riscritta in 2 → riletta: tutto identico, e i byte uguali si scrivono una volta sola', async ()=>{
  const P=await F.decode(FX('progetto-v1-completo.acchspettri'), JSZip);
  const out=await F.encode(reinput(P), JSZip), Q=await F.decode(out, JSZip);
  assert.deepEqual(Q.warnings,[]); assert.deepStrictEqual(Q.state, P.state);
  Q.spectra.forEach((s,i)=>{ const p=P.spectra[i]; assert.equal(s.name,p.name); assert.equal(s.path,p.path); assert.deepStrictEqual(s.memory,p.memory); assert.deepEqual([...s.bytes],[...p.bytes]); assert.equal(s.binary,p.binary); });
  assert.deepStrictEqual(Q.results, P.results);
  // olio_lino.csv compare due volte (due percorsi, stessi byte): nel formato 1 due copie, nel 2 una
  assert.equal(P.sources.length,4); assert.equal(Q.sources.length,3);
  const zip=await JSZip.loadAsync(out); assert.equal(Object.keys(zip.files).filter(n=>n.startsWith('data/') && !zip.files[n].dir).length,3);
  assert.equal(Q.spectra[0].source, Q.spectra[2].source); assert.notEqual(Q.spectra[0].path, Q.spectra[2].path);
});

test('gli altri progetti della versione 1 del repository si leggono nella forma del formato 2', async ()=>{
  for (const n of ['progetto-v1.acchspettri','progetto-v1-spettri.acchspettri']){ const P=await F.decode(FX(n), JSZip);
    assert.equal(P.spectra.length,2,n); assert.ok(P.spectra.every(s=>s.bytes && P.sources.some(x=>x.id===s.source)),n); assert.ok(P.warnings.includes('migrated-from-1'),n); }
});

test('file multicanale: byte salvati una volta, un record per canale con sampleKey e channel', async ()=>{
  const raw=enc('canale A\n1 2\n2 3\ncanale B\n1 5\n2 6\n'), sp=k=>({name:'seq.arw', path:'run/seq.arw', bytes:raw, sampleKey:'campione 1', channel:k, memory:{title:'canale '+k}});
  const out=await F.encode({state:{}, spectra:[sp('DAD1A'), sp('DAD1B'), Object.assign(sp('DAD1A'),{sampleKey:'campione 2'})]}, JSZip);
  const zip=await JSZip.loadAsync(out); assert.deepEqual(Object.keys(zip.files).filter(n=>n.startsWith('data/') && !zip.files[n].dir),['data/000001.dat']);
  const P=await F.decode(out, JSZip);
  assert.equal(P.sources.length,1); assert.deepEqual(P.spectra.map(s=>[s.sampleKey,s.channel,s.memory.title]),[['campione 1','DAD1A','canale DAD1A'],['campione 1','DAD1B','canale DAD1B'],['campione 2','DAD1A','canale DAD1A']]);
  assert.ok(P.spectra.every(s=>s.bytes===P.sources[0].bytes)); assert.deepEqual([...P.spectra[1].bytes],[...raw]);
  // stessi byte ma uno letto come binario e uno come testo: restano due sorgenti
  const Q=await F.decode(await F.encode({state:{}, spectra:[{name:'a',path:'a',bytes:raw},{name:'b',path:'b',bytes:raw,binary:true}]}, JSZip), JSZip); assert.equal(Q.sources.length,2);
});

test('librerie incorporate: id e revisione, contenuto intatto; id doppi rifiutati', async ()=>{
  const lib={format:'acchlib', version:1, name:'Agilent 1260 · DAD — campioni di prova', instrument:{model:'1260', detector:'DAD'}, sampleType:'altro', entries:[{id:'e1', name:'Composto A', tR:2.2, slope:1234.5}]};
  const P=await F.decode(await F.encode({state:{}, spectra:[{name:'a',path:'a',bytes:enc('1 2')}], libraries:[{id:'lib-1', revision:3, name:lib.name, data:lib}]}, JSZip), JSZip);
  assert.equal(P.libraries.length,1); assert.equal(P.libraries[0].id,'lib-1'); assert.equal(P.libraries[0].revision,3); assert.equal(P.libraries[0].name,lib.name); assert.deepStrictEqual(P.libraries[0].data,lib);
  await assert.rejects(()=>F.encode({state:{}, spectra:[], libraries:[{id:'x',revision:1,data:{}},{id:'x',revision:2,data:{}}]}, JSZip), e=>e.code==='bad-input');
  await assert.rejects(()=>F.encode({state:{}, spectra:[], libraries:[{id:'x',revision:0,data:{}}]}, JSZip), e=>e.code==='bad-input');
});

const series=(A)=>{ const t=[0,30,60], x=[200,250,300,350], d=new A(12); for (let i=0;i<12;i++) d[i]=Math.sin(i)*1e-3+i; return {kind:'kinetics', t:{values:t, quantity:'tempo', unit:'s'}, x:{values:x, quantity:'λ', unit:'nm'}, y:{quantity:'A', unit:''}, data:d, members:['000001']}; };
test('f.series: serie di spettri (tempo × λ) in binario, valori identici bit per bit', async ()=>{
  for (const A of [Float64Array, Float32Array]){ const sr=series(A);
    const out=await F.encode({state:{}, spectra:[{name:'cinetica', path:'cinetica', series:sr}]}, JSZip), P=await F.decode(out, JSZip), q=P.spectra[0].series;
    assert.equal(P.spectra[0].source,null); assert.equal(P.spectra[0].bytes,null);
    assert.ok(q.data instanceof A); assert.deepEqual([...q.data],[...sr.data]); assert.deepEqual(q.shape,[3,4]); assert.deepEqual(q.t.values,sr.t.values); assert.equal(q.x.unit,'nm'); assert.equal(q.kind,'kinetics'); assert.deepEqual(q.members,['000001']);
    const zip=await JSZip.loadAsync(out); assert.ok(zip.file(`series/000001.${A===Float32Array?'f32':'f64'}`)); }
  await assert.rejects(()=>F.encode({state:{}, spectra:[{name:'x', series:Object.assign(series(Float64Array),{data:new Float64Array(5)})}]}, JSZip), e=>e.code==='bad-input');
  await assert.rejects(()=>F.encode({state:{}, spectra:[{name:'x', series:Object.assign(series(Float64Array),{t:{values:[0,NaN,2]}})}]}, JSZip), e=>e.code==='bad-input');
});
test('f.cube: mappa nx × ny × canali con i dati binari in un campo separato e impronta SHA-256', async ()=>{
  const nx=3, ny=2, nc=5, d=new Float32Array(nx*ny*nc).map((_,i)=>i/7);
  const cube={nx, ny, nc, x:{values:[100,200,300,400,500], unit:'cm-1'}, px:{values:[0,1,2], unit:'µm'}, py:{values:[0,1.5], unit:'µm'}, y:{quantity:'intensità'}, data:d};
  const out=await F.encode({state:{}, spectra:[{name:'mappa.wdf', path:'mappa.wdf', bytes:enc('WDF1…'), binary:true, cube}]}, JSZip), P=await F.decode(out, JSZip), c=P.spectra[0].cube;
  assert.ok(c.data instanceof Float32Array); assert.deepEqual([...c.data],[...d]); assert.equal(c.order,'yxc'); assert.deepEqual([c.nx,c.ny,c.nc],[3,2,5]); assert.deepEqual(c.py.values,[0,1.5]);
  const zip=await JSZip.loadAsync(out), spj=await zip.file('project/spectra.json').async('string'); assert.ok(!/"data":\{/.test(spj) && spj.includes('"data":"cube/000001.f32"'), 'i numeri del cubo non stanno nel JSON');
  // dato binario alterato: impronta sbagliata, progetto rifiutato
  const z2=await JSZip.loadAsync(out); z2.file('cube/000001.f32', new Uint8Array(nx*ny*nc*4)); await assert.rejects(async ()=>F.decode(await z2.generateAsync({type:'uint8array'}), JSZip), e=>e.code==='integrity');
});
test('f.iso: isoterma con rami, p₀ per punto e unità', async ()=>{
  const iso={p:[10,50,100,300,700,300,100], p0:[750.3,750.1,749.8,748,745,744,743.7], n:[20,40,55,70,120,90,60], t:77.35, branches:{ads:[0,5], des:[4,7]}, unit:{p:'Torr', n:'cm3 STP/g'}, meta:{gas:'N2', massa_g:0.2444}};
  const P=await F.decode(await F.encode({state:{}, spectra:[{name:'iso.csv', path:'iso.csv', bytes:enc('p;n'), iso}]}, JSZip), JSZip);
  assert.deepStrictEqual(P.spectra[0].iso, iso);
  const noP0=Object.assign({}, iso, {p0:null}); assert.equal((await F.decode(await F.encode({state:{}, spectra:[{name:'i', iso:noP0}]}, JSZip), JSZip)).spectra[0].iso.p0, null);
  await assert.rejects(()=>F.encode({state:{}, spectra:[{name:'i', iso:Object.assign({},iso,{branches:{ads:[0,99]}})}]}, JSZip), e=>e.code==='bad-input');
});
test('schema: uno spettro senza byte e senza dati propri, o una sorgente inesistente, sono rifiutati', async ()=>{
  await assert.rejects(()=>F.encode({state:{}, spectra:[{name:'vuoto'}]}, JSZip), e=>e.code==='bad-input');
  const out=await F.encode({state:{}, spectra:[{name:'a',path:'a',bytes:enc('1 2')}]}, JSZip), zip=await JSZip.loadAsync(out);
  const sp=JSON.parse(await zip.file('project/spectra.json').async('string')); sp[0].source='999999'; const u=enc(JSON.stringify(sp)); zip.file('project/spectra.json',u);
  const m=JSON.parse(await zip.file('manifest.json').async('string')); m.entries['project/spectra.json']={sha256:F.sha256(u),size:u.length}; zip.file('manifest.json',JSON.stringify(m));
  await assert.rejects(async ()=>F.decode(await zip.generateAsync({type:'uint8array'}), JSZip), e=>e.code==='invalid-schema');
});
