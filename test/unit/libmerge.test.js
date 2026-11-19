// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I2: libMerge (index.html) non deve perdere né duplicare la chiave «@id» quando unisce la libreria di un progetto a quella locale.
// Restituisce map (id importato → id locale) per riscrivere i rimandi dei picchi. Su d091313 map non esiste: i picchi di un progetto
// con una voce in conflitto mostravano il nome della voce locale, e quelli con un id oltre 40 caratteri restavano senza nome.
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), vm=require('vm');
const html=fs.readFileSync(path.join(__dirname,'..','..','index.html'),'utf8');
const src=(()=>{ const a=html.indexOf('function libMerge('), b=html.indexOf('window.libMerge=libMerge;'); assert.ok(a>0 && b>a, 'libMerge non trovata'); return html.slice(a,b); })();
function env(lib){ const ctx={LIB:lib.map(e=>Object.assign({},e)), INSTR:{ftir:{}, hplc:{}, raman:{}}, saved:0}; vm.createContext(ctx); vm.runInContext('function saveLib(){ saved++; }\n'+src, ctx); return ctx; }
const merge=(ctx,list)=>vm.runInContext('libMerge(L)', Object.assign(ctx,{L:JSON.parse(JSON.stringify(list))}));
const nameOf=(ctx,id)=>(ctx.LIB.find(e=>e.id===id)||{}).n;
const LONG='c_lungo_'+'x'.repeat(50);
const PROJ=[{id:'c1', i:'hplc', a:2.1, b:2.4, n:'Caffeina'}, {id:'c2', i:'ftir', a:1735, b:1755, n:'C=O estere'}, {id:LONG, i:'ftir', a:2900, b:2950, n:'CH₂'}];
// rimando «@id» di un picco del progetto → nome mostrato dopo l'unione
const shown=(ctx,r,id)=>nameOf(ctx, (r.map && Object.prototype.hasOwnProperty.call(r.map,id)) ? r.map[id] : id);

test('stesso id e contenuto diverso: la voce del progetto entra con un altro id e map lo dice', ()=>{
  const ctx=env([{id:'c2', i:'ftir', a:1000, b:1010, n:'voce locale'}]), r=merge(ctx, PROJ);
  assert.ok(r.map, 'libMerge deve restituire map'); assert.equal(r.rinominate,1);
  assert.notEqual(r.map.c2, undefined); assert.notEqual(r.map.c2, 'c2');
  assert.equal(shown(ctx,r,'c2'), 'C=O estere', 'il picco «@c2» del progetto deve mostrare la voce del progetto');
  assert.equal(nameOf(ctx,'c2'), 'voce locale', 'la voce locale resta com\'era');
});
test('id più lungo di 40 caratteri: accorciato, e il rimando segue', ()=>{
  const ctx=env([]), r=merge(ctx, PROJ); assert.ok(r.map, 'map'); assert.equal(r.map[LONG], LONG.slice(0,40)); assert.equal(shown(ctx,r,LONG), 'CH₂');
});
test('riapertura dello stesso progetto: nessuna copia in più, e il rimando va sempre alla stessa voce', ()=>{
  const ctx=env([{id:'c2', i:'ftir', a:1000, b:1010, n:'voce locale'}]), r1=merge(ctx, PROJ), n=ctx.LIB.length;
  for (let k=0;k<3;k++){ const r=merge(ctx, PROJ); assert.equal(ctx.LIB.length, n, 'voci duplicate'); assert.equal(r.nuove+r.rinominate, 0); assert.ok(r.map); assert.equal(r.map.c2, r1.map.c2); assert.equal(shown(ctx,r,'c2'),'C=O estere'); }
});
test('stessa voce già presente con un altro id: si riusa quella, senza duplicarla', ()=>{
  const ctx=env([{id:'mia7', i:'hplc', a:2.1, b:2.4, n:'Caffeina'}]), r=merge(ctx, [PROJ[0]]);
  assert.equal(ctx.LIB.length,1); assert.equal(r.uguali,1); assert.ok(r.map); assert.equal(r.map.c1,'mia7');
});
test('nessun cambio di id: map vuota; voci non valide contate', ()=>{
  const ctx=env([]), r=merge(ctx, [PROJ[0], {id:'z', i:'nessuno', a:1, b:2, n:'x'}]); assert.deepEqual(Object.keys(r.map||{}), []); assert.equal(r.nuove,1); assert.equal(r.scartate,1); assert.ok(r.map);
});
