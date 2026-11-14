// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I11, estensioni per nuovi formati (R16–R17, parte pura): pacchetto .acchplugin, manifesto, versione minima, controllo dell'uscita
// del lettore (tipi, lunghezze, NaN, dimensioni), testo della sandbox, campo «plugin» del progetto e correttezza dell'esempio
// examples/plugins/colonne-fisse su dati SINTETICI. L'isolamento nel browser è in test/validation/i11-estensioni-ui.test.js.
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), crypto=require('crypto');
const JSZip=require('jszip'), C=require('../../app/plugins-base.js'), F=require('../../app/project-format.js'), {pack}=require('../../scripts/plugin-pack.js');
const ROOT=path.join(__dirname,'..','..'), EX=path.join(ROOT,'examples','plugins','colonne-fisse');
const PKG=fs.readFileSync(path.join(EX,'colonne-fisse.acchplugin')), SAMPLE=fs.readFileSync(path.join(EX,'esempio-SINTETICO.fwf'));
const MAN={id:'it.prova.lettore', name:'Prova', version:'1.2.3', author:'Autore di prova', license:'MIT', extensions:['xyz'], minAppVersion:'3.0.0'};
const pkg=(m, code)=>C.buildPackage(Object.assign({}, MAN, m||{}), code==null ? 'registerReader(function(){ return null; });' : code);
const code=(fn, err)=>{ try{ fn(); }catch(e){ assert.ok(e instanceof C.PluginError, String(e)); if (err) assert.equal(e.code, err, e.message); return e; } assert.fail('nessun errore, atteso '+err); };
// il lettore dell'esempio come lo esegue il worker: una funzione registrata con registerReader
function exampleReader(){ let fn=null; new Function('registerReader', fs.readFileSync(path.join(EX,'reader.js'),'utf8'))(f=>{ fn=f; }); return fn; }
const pts=n=>Array.from({length:n},(_,i)=>i);

test('pacchetto d\'esempio: si legge, manifesto completo, impronta dei byte, uguale ai sorgenti', ()=>{
  const p=C.parsePackage(new Uint8Array(PKG));
  assert.equal(p.manifest.id, 'org.acchiappaspettri.esempio.colonne-fisse');
  for (const k of ['name','version','author','license','minAppVersion']) assert.ok(p.manifest[k], k);
  assert.equal(p.manifest.license, 'GPL-3.0-or-later');
  assert.deepEqual(p.manifest.extensions, ['fwf']);
  assert.deepEqual(p.manifest.permissions, ['read-file']);
  assert.equal(p.sha256, crypto.createHash('sha256').update(PKG).digest('hex'));
  assert.equal(C.fingerprint(p.sha256).replace(/ /g,''), p.sha256);
  assert.equal(pack(EX).text, PKG.toString('utf8'), 'il .acchplugin dell\'esempio va rigenerato con scripts/plugin-pack.js');
  assert.ok(/registerReader/.test(p.code));
});

test('pacchetti rifiutati: non JSON, formato sbagliato o più nuovo, manifesto incompleto, estensioni riservate, permessi sconosciuti, import, dimensioni', ()=>{
  code(()=>C.parsePackage('ciao'), 'not-a-package');
  code(()=>C.parsePackage(new Uint8Array([0xff,0xfe,0x00])), 'not-a-package');
  code(()=>C.parsePackage(''), 'empty');
  code(()=>C.parsePackage(JSON.stringify({format:'altro', formatVersion:1, manifest:MAN, code:'x'})), 'not-a-package');
  code(()=>C.parsePackage(JSON.stringify({format:'acchplugin', formatVersion:2, manifest:MAN, code:'x'})), 'newer-package');
  for (const k of ['id','name','version','author','license','minAppVersion']){ const m=Object.assign({},MAN); delete m[k]; assert.equal(code(()=>C.parsePackage(C.buildPackage(m,'x'))).detail, k); }
  code(()=>C.parsePackage(pkg({id:'Maiuscole e spazi'})), 'manifest');
  code(()=>C.parsePackage(pkg({version:'1.0'})), 'manifest');
  code(()=>C.parsePackage(pkg({extensions:[]})), 'manifest');
  code(()=>C.parsePackage(pkg({extensions:['../x']})), 'manifest');
  for (const e of ['acchspettri','acchplugin','json','png','opju']) assert.equal(code(()=>C.parsePackage(pkg({extensions:['xyz',e]})), 'reserved-ext').detail, e);
  assert.equal(code(()=>C.parsePackage(pkg({permissions:['read-file','network']})), 'permissions').detail, 'network');
  code(()=>C.parsePackage(pkg({}, '')), 'no-code');
  code(()=>C.parsePackage(pkg({}, 'registerReader(function(){ return import("https://example.org/x.js"); });')), 'forbidden-code');
  code(()=>C.parsePackage(pkg({}, 'registerReader(function(){ return import/**/("x"); });')), 'forbidden-code');
  code(()=>C.parsePackage(pkg({}, 'x'.repeat(C.LIMITS.packageBytes))), 'too-large');
  // nomi con controlli e inversioni di direzione: ripuliti; __proto__ ignorato
  const p=C.parsePackage(pkg({name:'Nome‮ovitte\u0007', __proto__:{x:1}, extensions:['.XYZ','xyz']}));
  assert.equal(p.manifest.name, 'Nomeovitte'); assert.deepEqual(p.manifest.extensions, ['xyz']);
  assert.ok(C.parsePackage('﻿'+pkg()).manifest);
  // «important» e x.import non sono l'istruzione import
  assert.ok(C.parsePackage(pkg({}, 'var important=1; var o={}; o.import=2; registerReader(function(){ return null; });')));
});

test('versioni: minima dell\'app sul numero (le pre-release della 3.0.0 valgono 3.0.0), confronto semver', ()=>{
  assert.equal(C.appSatisfies('3.0.0','3.0.0-rc.4'), true);
  assert.equal(C.appSatisfies('3.0.0','3.0.1'), true);
  assert.equal(C.appSatisfies('3.1.0','3.0.9'), false);
  assert.equal(C.appSatisfies('4.0.0','3.10.0'), false);
  assert.equal(C.appSatisfies('x','3.0.0'), false);
  assert.equal(C.cmpVersion('1.0.0','1.0.0-rc.1'), 1);
  assert.equal(C.cmpVersion('1.2.0','1.10.0'), -1);
  assert.equal(C.handles({extensions:['fwf']}, 'cartella/Prova.FWF'), true);
  assert.equal(C.handles({extensions:['fwf']}, 'prova.fwf.txt'), false);
});

test('uscita del lettore: null, errore, NaN, infiniti, lunghezze, tipi, troppi canali o punti, testi ripuliti', ()=>{
  assert.deepEqual(C.validateOutput(null), {none:true});
  assert.deepEqual(C.validateOutput(undefined), {none:true});
  assert.deepEqual(C.validateOutput({error:'riga 3\u0000 rotta'}), {error:'riga 3 rotta'});
  const ok=C.validateOutput({x:pts(6), y:pts(6).map(v=>v*2), meta:['a‮b', 7, {}, '']});
  assert.equal(ok.channels.length, 1); assert.ok(ok.channels[0].xs instanceof Float64Array); assert.equal(ok.channels[0].ys[5], 10);
  assert.deepEqual(ok.meta, ['ab','7']);
  const m=C.validateOutput({channels:[{x:pts(5), y:pts(5), meta:['a‮b', 7, {}, '']}]}); assert.deepEqual(m.channels[0].meta, ['ab','7']);
  code(()=>C.validateOutput({x:[1,2,3,4,NaN], y:pts(5)}), 'not-finite');
  code(()=>C.validateOutput({x:pts(5), y:[1,2,Infinity,4,5]}), 'not-finite');
  code(()=>C.validateOutput({x:pts(5), y:pts(6)}), 'length');
  code(()=>C.validateOutput({x:pts(4), y:pts(4)}), 'too-few');
  code(()=>C.validateOutput({x:['1',2,3,4,5], y:pts(5)}), 'bad-output');
  code(()=>C.validateOutput({x:{length:5}, y:pts(5)}), 'bad-output');
  code(()=>C.validateOutput(42), 'bad-output');
  code(()=>C.validateOutput({channels:[]}), 'bad-output');
  code(()=>C.validateOutput({channels:Array.from({length:C.LIMITS.channels+1},()=>({x:pts(5), y:pts(5)}))}), 'too-large');
  // la lunghezza dichiarata si controlla prima di leggere un solo valore
  code(()=>C.validateOutput({x:{length:C.LIMITS.pointsPerChannel+1}, y:{length:C.LIMITS.pointsPerChannel+1}}), 'too-large');
  const big=new Float64Array(C.LIMITS.pointsPerChannel); code(()=>C.validateOutput({channels:[1,2,3,4,5].map(()=>({x:big, y:big}))}), 'too-large');
  const two=C.validateOutput({channels:[{name:'A', x:pts(5), y:pts(5)}, {name:'A', x:pts(5), y:pts(5)}, {x:pts(5), y:pts(5)}], technique:'uv'}, {techniques:['uv','ftir']});
  assert.deepEqual(two.channels.map(c=>c.name), ['A', 'A #2', '#3']); assert.equal(two.technique, 'uv');
  const unk=C.validateOutput({x:pts(5), y:pts(5), technique:'magia'}, {techniques:['uv']}); assert.equal(unk.technique, null); assert.deepEqual(unk.notes, ['technique']);
});

test('sandbox: il testo del worker toglie rete, archivio, worker e messaggi prima del codice dell\'estensione', ()=>{
  const src=C.sandboxSource('registerReader(function(){ return null; });');
  for (const k of ['fetch','XMLHttpRequest','WebSocket','EventSource','importScripts','Worker','indexedDB','caches','BroadcastChannel','postMessage','navigator']) assert.ok(C.BLOCKED.includes(k), k);
  assert.ok(src.indexOf('__acchRegister')<src.indexOf('registerReader(function'), 'l\'avvio viene prima del codice');
  assert.ok(/\(function\(registerReader\)\{ "use strict";/.test(src));
  assert.doesNotThrow(()=>new Function(src));
});

test('esempio colonne fisse (R17): numeri, canali, tecnica, virgola decimale, file non suoi e righe sbagliate', ()=>{
  const read=exampleReader(), r=read(new Uint8Array(SAMPLE), 'esempio-SINTETICO.fwf'), v=C.validateOutput(r, {techniques:['uv','ftir']});
  assert.equal(v.technique, 'uv'); assert.equal(v.sample, 'Miscela SINTETICA');
  assert.deepEqual(v.channels.map(c=>c.name), ['A 254 nm', 'B 280 nm']);
  assert.deepEqual([...v.channels[0].xs], [240,245,250,255,260,265,270,275,280,285]);
  assert.deepEqual([...v.channels[0].ys], [0.12,0.24,0.41,0.5,0.43,0.29,0.18,0.11,0.07,0.05]);
  assert.deepEqual([...v.channels[1].ys], [0.05,0.08,0.13,0.21,0.32,0.42,0.49,0.44,0.31,0.17]);
  assert.ok(v.meta.some(m=>/SINTETICI/.test(m)));
  const enc=s=>new TextEncoder().encode(s);
  assert.equal(read(enc('240 0.1\n245 0.2\n'), 'a.fwf'), null, 'senza firma il file non è suo');
  const bad=read(enc('# ACCH-FWF 1\n# columns: x 1-5 | y 6-10\n  1.0  2.0\n  2.0  abc\n'), 'b.fwf'); assert.match(bad.error, /riga 4/);
  assert.match(read(enc('# ACCH-FWF 1\n  1.0  2.0\n'), 'c.fwf').error, /columns/);
});

test('progetto: campo «plugin» salvato, riletto e controllato', async ()=>{
  const bytes=new Uint8Array(SAMPLE), pl={id:'org.acchiappaspettri.esempio.colonne-fisse', version:'1.0.0', name:'Colonne fisse (esempio)', sha256:'a'.repeat(64)};
  const base={name:'e.fwf', path:'e.fwf', bytes, binary:true, channel:'A 254 nm', plugin:pl};
  const z=await F.encode({appVersion:'3.0.0', spectra:[base, Object.assign({}, base, {channel:'B 280 nm'})]}, JSZip), P=await F.decode(z, JSZip);
  assert.deepEqual(P.spectra.map(s=>s.plugin), [pl, pl]); assert.equal(P.sources.length, 1);
  await assert.rejects(F.encode({spectra:[Object.assign({}, base, {plugin:{id:'X Y', version:'1'}})]}, JSZip), e=>e.code==='bad-input');
  await assert.rejects(F.encode({spectra:[Object.assign({}, base, {plugin:{id:'a.b', version:'1', sha256:'zz'}})]}, JSZip), e=>e.code==='bad-input');
  // senza il campo il progetto resta quello di prima
  const z0=await F.encode({spectra:[Object.assign({}, base, {plugin:undefined})]}, JSZip), P0=await F.decode(z0, JSZip); assert.equal(P0.spectra[0].plugin, undefined);
  // un plugin non valido nel file si rifiuta all'apertura
  const zip=await JSZip.loadAsync(z), man=JSON.parse(await zip.file('manifest.json').async('string')), sp=JSON.parse(await zip.file('project/spectra.json').async('string'));
  sp[0].plugin={id:'<script>', version:'1'}; const t=JSON.stringify(sp), b=new TextEncoder().encode(t); zip.file('project/spectra.json', t);
  man.entries['project/spectra.json']={sha256:F.sha256(b), size:b.length}; zip.file('manifest.json', JSON.stringify(man));
  await assert.rejects(F.decode(await zip.generateAsync({type:'uint8array'}), JSZip), e=>e.code==='invalid-schema' && e.detail==='plugin');
});
