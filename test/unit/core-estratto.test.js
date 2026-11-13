// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I2: il nucleo estratto in dist-desktop/core.js è identico byte per byte al blocco di index.html, che resta la fonte;
// il nucleo non tocca DOM né archivio direttamente: passa dall'adattatore dell'host (app/host.js).
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), os=require('os'), vm=require('vm');
const ROOT=path.join(__dirname,'..','..');
// estrazione indipendente da scripts/core-extract.js: si cercano i marcatori nei byte di index.html
function blockOf(buf){ const a=buf.indexOf('/*CORE-START*/'), e='/*CORE-END*/', b=buf.indexOf(e); assert.ok(a>0 && b>a, 'marcatori'); return buf.subarray(a, b+e.length); }

test('prepare-desktop scrive dist-desktop/core.js identico byte per byte al nucleo di index.html', ()=>{
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'acch-dist-'));
  try{
    const prep=require('../../scripts/prepare-desktop.js');
    assert.equal(typeof prep.main,'function','prepare-desktop deve esportare main(cartella)');
    const log=console.log; console.log=()=>{}; try{ prep.main(out); } finally { console.log=log; }
    const core=fs.readFileSync(path.join(out,'core.js')), src=blockOf(fs.readFileSync(path.join(ROOT,'index.html')));
    assert.ok(core.length>100000, 'nucleo troppo corto: '+core.length);
    assert.equal(Buffer.compare(core, src), 0, 'core.js diverso dal blocco di index.html');
    // anche la pagina del desktop contiene lo stesso nucleo
    assert.equal(Buffer.compare(blockOf(fs.readFileSync(path.join(out,'index.html'))), core), 0, 'nucleo della pagina desktop diverso');
  } finally { fs.rmSync(out,{recursive:true,force:true}); }
});

test('marcatori assenti o ripetuti: l\'estrazione si ferma con un errore', ()=>{
  const {extractCore}=require('../../scripts/core-extract.js');
  assert.throws(()=>extractCore('niente'), /marcatori/);
  assert.throws(()=>extractCore('/*CORE-START*/a/*CORE-END*/ /*CORE-START*/b/*CORE-END*/'), /ripetuti/);
  assert.equal(extractCore('x/*CORE-START*/è/*CORE-END*/y').toString('utf8'), '/*CORE-START*/è/*CORE-END*/');
});

const coreSrc=()=>blockOf(fs.readFileSync(path.join(ROOT,'index.html'))).toString('utf8');
test('il nucleo non usa direttamente DOM, localStorage o IndexedDB', ()=>{
  const src=coreSrc().replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:])\/\/.*$/gm,'$1');
  for (const re of [/\blocalStorage\b/, /\bsessionStorage\b/, /\bindexedDB\b/, /\bdocument\s*\./, /\bwindow\s*\./, /\bnavigator\s*\./])
    assert.ok(!re.test(src), 'il nucleo usa '+re);
});

test('il nucleo gira senza pagina (worker, Node) e legge la libreria dall\'adattatore dell\'host', ()=>{
  const src=coreSrc();
  // senza host: nessun errore, libreria vuota
  const bare={console, Float64Array, Math, TextDecoder, Uint8Array, DataView, ArrayBuffer}; vm.createContext(bare);
  vm.runInContext(src, bare); assert.deepEqual(vm.runInContext('LIB', bare), []);
  // con l'adattatore: legge e scrive passando da AcchHost.store
  const Host=require('../../app/host.js'), store=Host.memoryStore();
  store.setItem('spectraplot.lib.v1', JSON.stringify([{id:'c1', i:'ftir', a:1700, b:1720, n:'C=O'}]));
  const ctx={console, Float64Array, Math, TextDecoder, Uint8Array, DataView, ArrayBuffer, AcchHost:{store}}; vm.createContext(ctx);
  vm.runInContext(src, ctx);
  assert.equal(vm.runInContext('LIB.length', ctx), 1);
  vm.runInContext("LIB.push({id:'c2',i:'raman',a:1,b:2,n:'x'}); saveLib();", ctx);
  assert.equal(JSON.parse(store.getItem('spectraplot.lib.v1')).length, 2);
});
