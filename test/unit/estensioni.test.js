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

/* ---------- lettori dichiarativi, WebAssembly, file d'esempio (seconda parte di I11) ---------- */
const DIR=n=>path.join(ROOT,'examples','plugins',n);
const runPkg=(p, bytes, name)=>{ let fn=null; new Function('registerReader', p.code)(f=>{ fn=f; }); return C.validateOutput(fn(bytes, name||'x'), {techniques:['uv','raman','ftir']}); };
const specErr=(s, detail)=>{ const e=code(()=>C.validateReaderSpec(s), 'reader'); if (detail) assert.match(e.detail, detail); };
const TXT={kind:'text', delimiter:';', decimal:',', x:{column:1}, channels:'all'};

test('i tre esempi: pacchetti uguali ai sorgenti, tipo giusto, file d\'esempio letti come atteso', ()=>{
  for (const [d, kind] of [['colonne-fisse','js'], ['punto-e-virgola','declarative'], ['binario-wasm','wasm']]){
    const buf=fs.readFileSync(path.join(DIR(d), d+'.acchplugin')), p=C.parsePackage(new Uint8Array(buf));
    assert.equal(pack(DIR(d)).text, buf.toString('utf8'), d+': rigenera con scripts/plugin-pack.js');
    assert.equal(p.kind, kind); assert.equal(p.manifest.license, 'GPL-3.0-or-later'); assert.equal(p.examples.length, 1, d);
    for (const x of p.examples) assert.deepEqual(C.compareExpected(runPkg(p, x.bytes, x.name), x.expected), {ok:true}, d); }
});

test('dichiarativo (R17): punto e virgola, virgola decimale, intestazione, metadati, campione, firma', ()=>{
  const p=C.parsePackage(new Uint8Array(fs.readFileSync(path.join(DIR('punto-e-virgola'),'punto-e-virgola.acchplugin'))));
  const v=runPkg(p, new Uint8Array(fs.readFileSync(path.join(DIR('punto-e-virgola'),'esempio-SINTETICO.sxp'))));
  assert.deepEqual(v.channels.map(c=>c.name), ['Assorbanza A','Assorbanza B']); assert.equal(v.sample, 'Standard SINTETICO'); assert.equal(v.technique, 'uv');
  assert.deepEqual([...v.channels[1].ys], [0.02,0.04,0.09,0.16,0.25,0.18]);
  assert.ok(v.meta.includes('Strumento: Spettrometro SINTETICO X-100') && v.meta.includes('Data: 2026-11-14') && v.meta.includes("x: Lunghezza d'onda (nm)"));
  assert.deepEqual(runPkg(p, new TextEncoder().encode('400;1\n')), {none:true}, 'senza firma non è suo');
  const S=C.validateReaderSpec({kind:'text', delimiter:'whitespace', comment:'#', x:{column:1}, channels:[{column:3, name:'B', unit:'AU'}], onBadLine:'skip'});
  const r=C.validateOutput(C.DECL(S, new TextEncoder().encode('# prova\n1 2 3\n2 4 6\nx y z\n3 6 9\n4 8 12\n5 10 15\n'), 'a'));
  assert.deepEqual([...r.channels[0].ys], [3,6,9,12,15]); assert.ok(r.meta.includes('prova') && r.meta.includes('Righe non numeriche saltate: 1')); assert.deepEqual(r.channels[0].meta, ['y: AU']);
  assert.match(C.DECL(C.validateReaderSpec(TXT), new TextEncoder().encode('1;2\n2;x\n'), 'a').error, /riga 2/);
  const F=C.validateReaderSpec({kind:'text', delimiter:'fixed', columns:[{start:1,end:4},{start:5,end:8}], x:{column:1}, channels:[{column:2}]});
  assert.deepEqual([...C.validateOutput(C.DECL(F, new TextEncoder().encode('   1  10\n   2  20\n   3  30\n   4  40\n   5  50\n'), 'a')).channels[0].ys], [10,20,30,40,50]);
});

test('dichiarativo binario: ordine dei byte, tipo, offset e conteggio da un campo, colonne in sequenza, x da inizio e passo', ()=>{
  const n=6, b=Buffer.alloc(16+2*n*2); b.write('BNR1',0,'ascii'); b.writeUInt16BE(n,4); b.writeUInt32BE(16,6);
  for (let i=0;i<n;i++){ b.writeInt16BE(100*i,16+2*i); b.writeInt16BE(-5*i,16+2*n+2*i); }
  const S=C.validateReaderSpec({kind:'binary', endian:'big', signature:{offset:0, ascii:'BNR1'}, count:{offset:4, type:'u16'}, data:{offset:{offset:6, type:'u32'}, type:'i16', columns:2, layout:'sequential', scale:0.5},
    x:{start:10, step:{value:2}, unit:'s'}, channels:[{column:1, name:'A'}, {column:2, name:'B'}], technique:'gen'});
  const r=C.validateOutput(C.DECL(S, new Uint8Array(b), 'a'));
  assert.deepEqual([...r.channels[0].xs], [10,12,14,16,18,20]); assert.deepEqual([...r.channels[0].ys], [0,50,100,150,200,250]); assert.deepEqual([...r.channels[1].ys], [-0,-2.5,-5,-7.5,-10,-12.5]);
  assert.equal(C.DECL(S, new Uint8Array(Buffer.from('XXXX0000')), 'a'), null, 'firma diversa');
  // manifesti ostili: conteggio enorme, dati oltre la fine, campo fuori dal file
  const H=o=>C.validateReaderSpec(Object.assign({kind:'binary', count:{offset:0, type:'u32'}, data:{offset:8, type:'f64', columns:2}, x:{column:1}, channels:[{column:2}]}, o));
  const big=Buffer.alloc(16); big.writeUInt32LE(0xffffffff,0); assert.match(C.DECL(H(), new Uint8Array(big), 'a').error, /troppi punti/);
  big.writeUInt32LE(1000,0); assert.match(C.DECL(H(), new Uint8Array(big), 'a').error, /oltre la fine/);
  assert.match(C.DECL(H({count:{offset:100, type:'u32'}}), new Uint8Array(big), 'a').error, /fuori dal file/);
});

test('manifesti dichiarativi rifiutati: campi sconosciuti, regex rischiose, combinazioni ambigue, colonne fuori scala', ()=>{
  specErr(Object.assign({}, TXT, {codice:'x'}), /codice/);
  specErr(Object.assign({}, TXT, {kind:'altro'}), /kind/);
  for (const re of ['(a+)+$', '(\\w*)*x', '(a|aa){2,}', '(.*a){10}', '(a)\\1', 'x'.repeat(201), '[']) specErr(Object.assign({}, TXT, {signature:{regex:re}}), /signature/);
  specErr(Object.assign({}, TXT, {delimiter:',', decimal:','}), /decimal/);
  specErr(Object.assign({}, TXT, {delimiter:'tab'}), /delimiter/);
  specErr(Object.assign({}, TXT, {channels:[{column:1}]}), /channels/);
  specErr(Object.assign({}, TXT, {channels:[{column:99}]}), /channels/);
  specErr(Object.assign({}, TXT, {delimiter:'fixed', columns:[{start:5, end:2}, {start:6, end:9}]}), /columns/);
  specErr(Object.assign({}, TXT, {meta:Array.from({length:21},()=>({name:'a', regex:'a'}))}), /meta/);
  specErr({kind:'binary', count:{offset:0, type:'f32'}, data:{offset:0, type:'f32', columns:1}, x:{start:0, step:1}, channels:[{column:1}]}, /count/);
  specErr({kind:'binary', count:{value:10}, data:{offset:0, type:'f128', columns:1}, x:{start:0, step:1}, channels:[{column:1}]}, /data/);
  specErr({kind:'binary', count:{value:10}, data:{offset:0, type:'f32', columns:1}, x:{start:0, step:1}, channels:[{column:2}]}, /channels/);
  code(()=>C.parsePackage(C.buildPackage(MAN, {reader:TXT, code:'x'})), 'kind');
});

// moduli WebAssembly minimi costruiti qui: con un'importazione, senza massimo di memoria, senza le funzioni richieste
const uleb=n=>{ const o=[]; do { let b=n&0x7f; n>>>=7; if (n) b|=0x80; o.push(b); } while (n); return o; };
const sec=(id, body)=>[id, ...uleb(body.length), ...body], nm=s=>[s.length, ...Buffer.from(s)];
function mod({imp, max, exp}){ const b=[0,0x61,0x73,0x6d,1,0,0,0, ...sec(1,[1,0x60,0,0])];
  if (imp) b.push(...sec(2,[1, ...nm('env'), ...nm('f'), 0, 0]));
  b.push(...sec(3,[1,0]), ...sec(5, max==null ? [1,0,1] : [1,1,1,...uleb(max)]));
  const E=exp||['memory','acch_alloc','acch_read'], ex=[E.length]; for (const e of E) ex.push(...nm(e), e==='memory'?2:0, 0);
  b.push(...sec(7, ex), ...sec(10,[1,2,0,0x0b])); return new Uint8Array(b); }
test('WebAssembly: niente importazioni, memoria massima ≤ 256 MB, funzioni richieste; intestazioni rotte rifiutate', ()=>{
  const w=new Uint8Array(fs.readFileSync(path.join(DIR('binario-wasm'),'reader.wasm')));
  assert.deepEqual(C.checkWasm(w).memories, [{min:1, max:256}]);
  assert.ok(WebAssembly.validate(mod({max:10})), 'il costruttore dei moduli di prova funziona');
  code(()=>C.checkWasm(mod({max:10, imp:true})), 'wasm-imports');
  code(()=>C.checkWasm(mod({})), 'wasm-memory');
  code(()=>C.checkWasm(mod({max:5000})), 'wasm-memory');
  code(()=>C.checkWasm(mod({max:10, exp:['memory','acch_read']})), 'wasm');
  code(()=>C.checkWasm(new Uint8Array([0,0x61,0x73,0x6d,1,0,0,0, 7, 0xff,0xff,0xff,0xff,0x0f])), 'wasm');
  code(()=>C.checkWasm(new Uint8Array([1,2,3])), 'wasm');
  code(()=>C.parsePackage(C.buildPackage(MAN, {wasm:mod({max:10, imp:true})})), 'wasm-imports');
  code(()=>C.parsePackage(C.buildPackage(MAN, {wasm:'@@@'})), 'base64');
  // il modulo d'esempio: file suo, file non suo, file troncato
  const b64=Buffer.from(w).toString('base64'), smp=new Uint8Array(fs.readFileSync(path.join(DIR('binario-wasm'),'esempio-SINTETICO.awb')));
  assert.equal(C.validateOutput(C.WASMRUN(b64, 4096, smp)).channels[0].ys[5], 300);
  assert.equal(C.WASMRUN(b64, 4096, new Uint8Array([1,2,3,4,5,6,7,8,9])), null);
  assert.match(C.WASMRUN(b64, 4096, smp.slice(0,40)).error, /troncato/);
  for (const n of [0,1,2,3,7,100]){ const u=new Uint8Array(n).map((_,i)=>i*37); assert.doesNotThrow(()=>C.WASMRUN(b64, 4096, u)); }
});

test('file d\'esempio: atteso diverso → la verifica lo dice; base64 andata e ritorno; troppi esempi rifiutati', ()=>{
  const p=C.parsePackage(new Uint8Array(fs.readFileSync(path.join(DIR('colonne-fisse'),'colonne-fisse.acchplugin')))), x=p.examples[0], out=runPkg(p, x.bytes, x.name);
  const wrong=JSON.parse(JSON.stringify(x.expected)); wrong.channels[1].y[3]=0.22;
  assert.match(C.compareExpected(out, wrong).why, /canale 2, punto 4/);
  assert.match(C.compareExpected(out, Object.assign({}, x.expected, {technique:'ftir'})).why, /tecnica/);
  assert.equal(C.compareExpected({none:true}, {none:true}).ok, true);
  const u=new Uint8Array(300).map((_,i)=>(i*91)&255); assert.deepEqual(C.fromB64(C.toB64(u)), u); assert.equal(C.toB64(u), Buffer.from(u).toString('base64'));
  const ex=Array.from({length:6},()=>({name:'esempio', bytes:new Uint8Array(3), expected:{none:true}}));
  code(()=>C.parsePackage(C.buildPackage(MAN, 'registerReader(function(){ return null; });', ex)), 'examples');
});
