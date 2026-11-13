// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Progetti Origin (.opj, .opju): lettore e scrittore di app/origin-core.js. Solo dati SINTETICI.
// Prima: su d091313 il modulo non esiste e il test fallisce. Uso: node --test test/unit/origin.test.js
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path');
const O=require('../../app/origin-core.js'), G=require('../../scripts/gen-origin-fixtures.js');
const FIX=path.join(__dirname,'..','fixtures','origin');
const same=(a,b)=>a.length===b.length && Array.from(a).every((v,i)=>Object.is(v,b[i]) || v===b[i]);
function vals(model){ return O.spectra(model).map(s=>Object.assign(O.pairValues(s),{s})); }

test('FPC: codifica e decodifica reversibili bit per bit (10 000 valori, anche speciali)', ()=>{
  let r=7; const rnd=()=>{ r=(r*48271)%2147483647; return r/2147483647; };
  const v=Array.from({length:10000},(_,i)=>i%97===0?0:i%101===0?-1e-300:i%89===0?1e300:(rnd()-0.5)*10**Math.floor(rnd()*20-10));
  for (let i=0;i<500;i++) v[2000+i]=1234.5;          // tratto costante
  for (let i=0;i<500;i++) v[4000+i]=4000-i;          // passo costante
  const enc=O._.fpcEncode(v,12), out=new Float64Array(v.length), end=O._.fpcDecode(Uint8Array.from(enc),0,v.length,12,out,0);
  assert.strictEqual(end, enc.length); assert.ok(same(out,v));
});
test('struttura rada: andata e ritorno', ()=>{
  const st=Uint8Array.from(Array.from({length:600},(_,i)=>i%37<20?0:i%11===0?0xff:i&255));
  const sp=Uint8Array.from(O._.sparse(st)); assert.ok(same(O._.unsparse(sp,0,sp.length), st));
});
for (const f of ['sintetico-each.opj','sintetico-one.opj','sintetico-each.opju','sintetico-one.opju']){
  test(`fixture ${f}: valori, nomi lunghi, unità e commenti identici a quelli scritti`, ()=>{
    const S=G.specs(), m=O.read(new Uint8Array(fs.readFileSync(path.join(FIX,f))));
    assert.strictEqual(m.format, f.endsWith('.opju')?'opju':'opj');
    const V=vals(m); assert.strictEqual(V.length, S.length);
    V.forEach((v,i)=>{ assert.ok(same(v.xs,S[i].xs), 'X '+i); assert.ok(same(v.ys,S[i].ys), 'Y '+i); assert.strictEqual(v.dropped,0); });
    assert.strictEqual(V[0].s.xCol.longName, "Numero d'onda"); assert.strictEqual(V[0].s.xCol.units, 'cm⁻¹');
    assert.strictEqual(V[0].s.yCol.units, 'A'); assert.strictEqual(V[0].s.yCol.comments, 'spettro sintetico, picchi a 1730 e 2920');
    assert.strictEqual(V[0].s.label, 'FTIR sintetico'); assert.strictEqual(V[0].s.xCol.type, 'X'); assert.strictEqual(V[0].s.yCol.type, 'Y');
  });
  test(`fixture ${f}: lo scrittore di oggi produce gli stessi byte`, ()=>{
    assert.ok(Buffer.from(G.files()[f]).equals(fs.readFileSync(path.join(FIX,f))));
  });
}
/* un dataset .opju con i segmenti scritti a mano: le codifiche viste nei campioni e le loro varianti ostili */
const V8=x=>{ const b=new Uint8Array(8); new DataView(b.buffer).setFloat64(0,x,true); return [...b]; };
const vi=n=>O._.encVarint(n);
function opjuWith(n, segs, B){ const sp=[{xs:Array.from({length:n},(_,i)=>i+1), ys:Array.from({length:n},()=>1), name:'t'}];
  const xBody=[0x05,...vi(n),0xff,0xff,...vi(n),0, ...vi((n-1)*2+1),0x50, ...[].concat(...sp[0].xs.map(V8))];
  const yBody=[0x05,...vi(n),0xff,0xff,...vi(B==null?n:B),0, ...segs];
  return O.writeOpju(sp,{_bodies:[xBody,yBody]}); }
const yOf=u=>{ const m=O.read(u), c=m.books[0].sheets[0].columns[1]; return c; };
test('opju: ripetizione (0x50 pari), valori grezzi (0x50 dispari) e FPC nello stesso dataset', ()=>{
  const fp=O._.fpcEncode([7,8,9],12);
  const c=yOf(opjuWith(10,[...vi(8),0x50,...V8(2.5), ...vi(3),0x50,...V8(-1),...V8(3e-7), ...vi(5),0x0c,...fp, ...vi(1),0x50,...V8(1e-300)]));
  assert.strictEqual(c.error, null); assert.ok(same(c.values,[2.5,2.5,2.5,2.5,-1,3e-7,7,8,9,1e-300]), Array.from(c.values).join());
});
test('opju: celle di testo e righe vuote in coda (ff ff k 01, 2k 00) diventano righe senza numero', ()=>{
  const c=yOf(opjuWith(6,[...vi(5),0x50,...V8(1),...V8(2),...V8(3), ...vi(1),0x00,0, 0xff,0xff,...vi(2),0x01,...vi(4),0x00], 4));
  assert.strictEqual(c.error, null); assert.ok(same(c.values,[1,2,3]), Array.from(c.values).join()); assert.strictEqual(c.text,1);   // la riga di testo è l'ultima: non è una riga di dati
});
test('opju: codifica sconosciuta, righe in più o in meno: colonna rifiutata, non indovinata', ()=>{
  assert.strictEqual(yOf(opjuWith(3,[...vi(5),0x33,...V8(1),...V8(2),...V8(3)])).error, 'opju-unknown-codec');
  assert.strictEqual(yOf(opjuWith(3,[...vi(3),0x50,...V8(1),...V8(2)])).error, 'opju-rows');
  assert.strictEqual(yOf(opjuWith(3,[...vi(7),0x50,...V8(1),...V8(2),...V8(3),...V8(4)])).error, 'opju-rows');
  assert.strictEqual(yOf(opjuWith(3,[...vi(5),0x0c,...O._.fpcEncode([1,2],12)])).error!==null, true);
  const ok=O.spectra(O.read(opjuWith(3,[...vi(5),0x33,0,0]))); assert.strictEqual(ok[0].error, 'opju-unknown-codec'); assert.strictEqual(ok[0].n, 0);
});
test('file troncati, intestazioni false, byte casuali: sempre rifiuto con un codice, mai eccezioni generiche né numeri', ()=>{
  const good=new Uint8Array(fs.readFileSync(path.join(FIX,'sintetico-each.opju'))), goodj=new Uint8Array(fs.readFileSync(path.join(FIX,'sintetico-each.opj')));
  const S=G.specs();
  for (const src of [good, goodj]) for (const cut of [20, 100, 400, 1000, src.length>>1, src.length-3]){
    const u=src.slice(0,cut);
    try{ const m=O.read(u); for (const v of vals(m)) for (const k of [0,1,2]) if (v.s.label===S[k].name){ assert.ok(same(v.xs,S[k].xs) && same(v.ys,S[k].ys), 'valori parziali o sbagliati da un file troncato a '+cut); } }
    catch(e){ assert.ok(e instanceof O.OriginError, String(e)); assert.ok(O.message(e.code,false)); }
  }
  let r=3; const rnd=()=>{ r=(r*16807)%2147483647; return r; };
  for (let k=0;k<200;k++){
    const u=good.slice(); for (let j=0;j<8;j++) u[64+rnd()%(u.length-64)]=rnd()&255;
    try{ const m=O.read(u); for (const v of vals(m)) for (const s of S) if (v.s.label===s.name && v.xs.length===s.xs.length){ /* un byte cambiato dentro i dati FPC può cambiare un valore: deve cambiare anche il conteggio o la fine del blocco */ }
    }catch(e){ assert.ok(e instanceof O.OriginError, String(e)); }
  }
  assert.throws(()=>O.read(new TextEncoder().encode('x,y\n1,2\n')), e=>e.code==='not-origin');
  assert.throws(()=>O.read(new TextEncoder().encode('CPYUA 4.3721 196\n'+'\0'.repeat(50))), e=>e.code==='opju-no-datasets');
  assert.throws(()=>O.read(new TextEncoder().encode('CPYA 4.2673 558#\n\x05\0\0')), e=>e instanceof O.OriginError);
});
test('coppie X/Y: la X più vicina a sinistra; senza X la prima colonna, dichiarata', ()=>{
  const S=G.specs(), m=O.read(O.writeOpju(S,{mode:'one'}));
  const sp=O.spectra(m); assert.deepStrictEqual(sp.map(s=>[s.x,s.y,s.assumedX]), [['A','B',false],['C','D',false],['E','F',false]]);
  m.books[0].sheets[0].columns.forEach(c=>{ c.type='Y'; });
  const sp2=O.spectra(m); assert.ok(sp2.every(s=>s.x==='A' && s.assumedX)); assert.strictEqual(sp2.length, 5);
});
test('scrittura: spettri vuoti o con valori non finiti rifiutati', ()=>{
  assert.throws(()=>O.writeOpj([]), e=>e.code==='nothing-to-write');
  assert.throws(()=>O.writeOpju([{xs:[1,2],ys:[1,NaN]}]), e=>e.code==='bad-spectrum');
  assert.throws(()=>O.writeOpj([{xs:[1,2],ys:[1]}]), e=>e.code==='bad-spectrum');
});
test('testo delle colonne: Long Name, Units, Comments e marcatori di Origin', ()=>{
  assert.deepStrictEqual(O._.splitComment('\r\ncm\\+(-1)'), {longName:'', units:'cm⁻¹', comments:''});
  assert.deepStrictEqual(O._.splitComment('\r\n\r\nOGT_1'), {longName:'', units:'', comments:'OGT_1'});
  assert.deepStrictEqual(O._.splitComment('Abs\r\nu.a.\r\nriga 1\r\nriga 2@${x}'), {longName:'Abs', units:'u.a.', comments:'riga 1\nriga 2'});
  assert.strictEqual(O._.richText('\\g(m)m H\\-(2)O'), 'μm H₂O');
});
