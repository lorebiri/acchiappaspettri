// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I2: adattatore dell'host (app/host.js). Online l'archivio resta localStorage; nel desktop è su file (lib.rs, store_write),
// con migrazione automatica e senza perdite dal localStorage delle versioni precedenti.
'use strict';
const test=require('node:test'), assert=require('node:assert');
const Host=require('../../app/host.js');
// localStorage finto con la stessa interfaccia del browser
function fakeLS(init){ const m=new Map(Object.entries(init||{})); return { getItem:k=>m.has(k)?m.get(k):null, setItem:(k,v)=>{ m.set(k,String(v)); }, removeItem:k=>{ m.delete(k); }, key:i=>[...m.keys()][i]??null, get length(){ return m.size; }, _m:m }; }
// «disco» finto con la stessa semantica di store_write in lib.rs: chiave → valore, null toglie
function fakeDisk(){ const files=new Map(), calls=[]; let fail=0;
  return { files, calls, failNext(n){ fail=n; }, async invoke(cmd, args){ assert.equal(cmd,'store_write'); calls.push(JSON.parse(JSON.stringify(args.items))); if (fail>0){ fail--; throw 'write-failed: PermissionDenied'; } for (const [k,v] of Object.entries(args.items)){ if (v==null) files.delete(k); else files.set(k,v); } },
    boot(){ return {version:1, items:Object.fromEntries(files)}; } }; }
// dati come li lasciano le versioni fino alla 3.0.0-rc.1: JSON, testo semplice, chiavi con percorsi e lettere accentate
const OLD={ 'spectraplot.lib.v1':JSON.stringify([{id:'c1',i:'hplc',a:2.1,b:2.3,n:'Caffeina'},{id:'c2',i:'ftir',a:1700,b:1720,n:'C=O «estere»'}]),
  'spectraplot.file.v1:cartella/campione è.csv|2048':JSON.stringify({hash:'abc',size:10,title:'Campione',labels:{'2.2':'@c1'}}),
  'acch.zoom':'1.25', 'acch.ui.lang':'"it"', 'acch.recent':JSON.stringify([{path:'C:\\Utenti\\m\\p.acchspettri',name:'p.acchspettri'}]), 'vuota':'' };

test('online: localStorage com\'era', ()=>{ const ls=fakeLS({a:'1'}), H=Host.create({localStorage:ls}); assert.equal(H.kind,'web'); assert.equal(H.store.getItem('a'),'1'); H.store.setItem('b','2'); assert.equal(ls.getItem('b'),'2'); H.store.removeItem('a'); assert.equal(ls.getItem('a'),null); assert.deepEqual(H.store.keys(),['b']); });
test('senza localStorage (bloccato dal browser): archivio in memoria, nessun errore', ()=>{ const H=Host.create({get localStorage(){ throw new Error('SecurityError'); }}); assert.equal(H.kind,'memory'); H.store.setItem('a',1); assert.equal(H.store.getItem('a'),'1'); });
test('desktop: si usa il file solo se il lato nativo ha consegnato l\'archivio', ()=>{ const d=fakeDisk(); assert.equal(Host.create({__TAURI__:{core:{invoke:d.invoke}}, localStorage:fakeLS()}).kind,'web'); assert.equal(Host.create({__TAURI__:{core:{invoke:d.invoke}}, __ACCH_STORE__:{items:{}}, localStorage:fakeLS()}).kind,'desktop'); });

test('migrazione dal localStorage: tutte le chiavi, byte per byte, una volta sola, senza cancellare l\'originale', async ()=>{
  const ls=fakeLS(OLD), d=fakeDisk();
  const s=Host.fileStore(d.boot(), d.invoke, ls); await s.flush();
  for (const [k,v] of Object.entries(OLD)){ assert.strictEqual(s.getItem(k), v, k); assert.strictEqual(d.files.get(k), v, 'su file: '+k); }
  assert.equal(s.migration.copied, Object.keys(OLD).length);
  // un solo lotto, con il segno di migrazione insieme ai dati (o tutto o niente)
  assert.equal(d.calls.length,1); assert.ok(d.calls[0][Host.MIGRATED]);
  assert.equal(JSON.parse(d.files.get(Host.MIGRATED)).keys, Object.keys(OLD).length);
  assert.deepEqual(Object.fromEntries(ls._m), OLD, 'il localStorage resta intatto');
  // secondo avvio: si legge dal file, nessuna nuova migrazione e nessuna scrittura
  const s2=Host.fileStore(d.boot(), d.invoke, fakeLS({'spectraplot.lib.v1':'[]', nuova:'x'})); await s2.flush();
  assert.equal(s2.migration, null); assert.equal(d.calls.length,1);
  assert.strictEqual(s2.getItem('spectraplot.lib.v1'), OLD['spectraplot.lib.v1'], 'il file vince sul localStorage');
  assert.equal(s2.getItem('nuova'), null);
});
test('migrazione a metà (archivio già presente ma senza segno): il file vince, le chiavi mancanti si copiano', async ()=>{
  const d=fakeDisk(); d.files.set('acch.zoom','2'); const s=Host.fileStore(d.boot(), d.invoke, fakeLS(OLD)); await s.flush();
  assert.equal(s.getItem('acch.zoom'),'2'); assert.equal(d.files.get('acch.zoom'),'2'); assert.equal(s.getItem('spectraplot.lib.v1'), OLD['spectraplot.lib.v1']); assert.equal(s.migration.copied, Object.keys(OLD).length-1);
});
test('scritture: nell\'ordine, a lotti, e l\'ultima vince', async ()=>{
  const d=fakeDisk(); d.files.set(Host.MIGRATED,'{}'); const s=Host.fileStore(d.boot(), d.invoke, null);
  s.setItem('a','1'); s.setItem('a','2'); s.setItem('b','x'); s.removeItem('b'); await s.flush();
  assert.equal(d.calls.length,1); assert.deepEqual(d.calls[0],{a:'2',b:null}); assert.equal(d.files.get('a'),'2'); assert.equal(d.files.has('b'),false);
  s.setItem('a','3'); const p=s.flush(); s.setItem('a','4'); await p; await s.flush(); assert.equal(d.files.get('a'),'4');
});
test('scrittura non riuscita: niente si perde, il lotto si riscrive', async ()=>{
  const d=fakeDisk(); d.files.set(Host.MIGRATED,'{}'); const errs=[]; const s=Host.fileStore(d.boot(), d.invoke, null, {retryMs:5, onError:e=>errs.push(e)});
  d.failNext(1); s.setItem('lib','[1]'); assert.equal(s.pending,1); assert.equal(s.length,2); assert.equal(await s.flush(), false); assert.equal(s.pending,1); assert.equal(errs.length,1); assert.equal(s.getItem('lib'),'[1]');
  s.setItem('altro','y'); await new Promise(r=>setTimeout(r,30)); await s.flush();
  assert.equal(d.files.get('lib'),'[1]'); assert.equal(d.files.get('altro'),'y'); assert.equal(s.pending,0);
});
test('copia di cortesia nel localStorage della webview: una versione precedente ritrova il lavoro', async ()=>{
  const ls=fakeLS(), d=fakeDisk(); const s=Host.fileStore(d.boot(), d.invoke, ls); s.setItem('spectraplot.lib.v1','[2]'); await s.flush(); assert.equal(ls.getItem('spectraplot.lib.v1'),'[2]'); s.removeItem('spectraplot.lib.v1'); assert.equal(ls.getItem('spectraplot.lib.v1'),null);
});
