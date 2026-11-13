// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I12, ricetta come script Python: parte pura (app/ricetta-py.js), modulo generato aggiornato, aritmetica di formattazione di JavaScript
// trascritta in Python identica a quella del browser, e parseText0 con keepLines che non cambia i numeri.
// I confronti con Python si saltano (e lo si dice) se python3 ≥ 3.10 manca.
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), os=require('os'), {spawnSync}=require('child_process');
const ROOT=path.join(__dirname,'..','..');
const PY=(()=>{ for (const c of [process.env.PYTHON, 'python3'].filter(Boolean)){ const r=spawnSync(c, ['-c','import sys; print(sys.version_info>=(3,10))'], {encoding:'utf8'}); if (r.status===0 && /True/.test(r.stdout)) return c; } return null; })();

test('app/ricetta-py-modello.js è generato dalla versione attuale di scripts/ricetta-py/acch_ricetta.py', ()=>{
  const B=require('../../scripts/ricetta-py-build.js'); assert.strictEqual(fs.readFileSync(B.OUT,'utf8'), B.build(), 'eseguire node scripts/ricetta-py-build.js');
  assert.strictEqual(require('../../app/ricetta-py-modello.js'), fs.readFileSync(B.SRC,'utf8').replace(/\r\n/g,'\n').replace(/\s+$/,''));
});

test('intestazione: GPL-3.0-or-later, titolare, versione, data, impronte; letterale della ricetta sicuro anche con apici tripli e barre', ()=>{
  const R=require('../../app/ricetta-py.js');
  const ric={versione:'3.0.0', data:'2026-11-14', titolare:'Lorenzo Birindelli', lingua:'it', spettri:[{nome:"a'''b\\", lettura:{modo:'testo', origine:'a.csv', sha256:'ab'.repeat(32)}}, {nome:'c', lettura:{modo:'csv', origine:'c.spa', impronta:'cd'.repeat(32)}}], nonTrascritte:['deconvoluzione.csv']};
  const s=R.script(ric), head=s.split('RICETTA =')[0];
  assert.match(head, /^#!\/usr\/bin\/env python3\n/); assert.match(head, /SPDX-License-Identifier: GPL-3\.0-or-later/); assert.match(head, /Copyright \(C\) 2026 Lorenzo Birindelli/);
  assert.match(head, /Acchiappaspettri 3\.0\.0, il 2026-11-14/); assert.match(head, /a\.csv  (ab){32}  \(rilettura del file di testo\)/); assert.match(head, /c\.spa  (cd){32}  \(CSV dei dati letti/);
  assert.match(head, /Parti del progetto non trascritte[^\n]*\n#   - deconvoluzione\.csv/); assert.match(head, /formati binari/);
  assert.ok(!s.includes("r'''\n{") || !JSON.stringify(ric).includes("'''"), 'con apici tripli serve la stringa JSON');
  const en=R.script(Object.assign({}, ric, {lingua:'en'})); assert.match(en, /Recipe exported from Acchiappaspettri 3\.0\.0, on 2026-11-14/); assert.match(en, /check: identical/);
  if (!PY) return console.log('# python3 ≥ 3.10 non trovato: rilettura del letterale SALTATA');
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'acch-py-')); try{ const f=path.join(d,'r.py'); fs.writeFileSync(f, s.split("\n\nif __name__ ==")[0]+"\nimport json as _j\nprint(_j.dumps(RICETTA['spettri'][0]['nome']))\n");
    const r=spawnSync(PY, ['-I', f], {encoding:'utf8'}); assert.strictEqual(r.status, 0, r.stderr); assert.strictEqual(JSON.parse(r.stdout), "a'''b\\"); } finally { fs.rmSync(d,{recursive:true,force:true}); }
});

test('formattazione dei numeri: js_str, toFixed, toPrecision, toExponential e Math.round in Python come in JavaScript', {skip:!PY}, ()=>{
  const vals=[0,-0,1,-1,0.5,1.5,2.5,-2.5,1.005,1.125,1e21,1.5e21,1e-7,1.234e-7,1e-6,1.2345e-6,123.456,-0.0001,5e-324,1.7976931348623157e308,0.1,0.30000000000000004,1/3,1e16,1.25e-5,999999.5,0.00049999,9.9999995,-1.45,2.675,1.0000000005];
  let s=7; const rnd=()=>{ s=(s*1103515245+12345)%2147483648; return s/2147483648; }; for (let i=0;i<2000;i++){ vals.push((rnd()-0.5)*Math.pow(10, Math.floor(rnd()*36)-18)); vals.push(Math.round(rnd()*1e6)/Math.pow(10, Math.floor(rnd()*8))); }
  const want=vals.map(v=>[String(v), v.toFixed(4), v.toFixed(2), Math.abs(v)<1e21?v.toFixed(1):'', v.toPrecision(6), v.toPrecision(8), v.toPrecision(10), v.toPrecision(7), v.toExponential(2), String(+v.toPrecision(6)), String(+v.toFixed(4)), String(Math.round(v*7.3))]);
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'acch-py-')); try{ fs.writeFileSync(path.join(d,'v.json'), JSON.stringify(vals.map(v=>Object.is(v,-0)?'-0':v)));
    const prog=fs.readFileSync(path.join(ROOT,'scripts','ricetta-py','acch_ricetta.py'),'utf8')+`\nimport json as _j\nV=[(-0.0 if v=='-0' else float(v)) for v in _j.load(open(${JSON.stringify(path.join(d,'v.json'))}))]\nprint(_j.dumps([[js_str(v), js_fixed(v,4), js_fixed(v,2), js_fixed(v,1) if abs(v)<1e21 else '', js_prec(v,6), js_prec(v,8), js_prec(v,10), js_prec(v,7), js_expo(v,2), num_prec(v,6), num_fixed(v,4), js_str(float(js_round(v*7.3)))] for v in V]))\n`;
    fs.writeFileSync(path.join(d,'p.py'), prog); const r=spawnSync(PY, ['-I', path.join(d,'p.py')], {encoding:'utf8', maxBuffer:1<<26}); assert.strictEqual(r.status, 0, r.stderr);
    const got=JSON.parse(r.stdout); let bad=[]; got.forEach((g,i)=>g.forEach((x,k)=>{ if (x!==want[i][k]) bad.push(`${vals[i]} [${k}]: ${x} invece di ${want[i][k]}`); }));
    assert.deepStrictEqual(bad.slice(0,10), []); } finally { fs.rmSync(d,{recursive:true,force:true}); }
});

test('parseText0 con keepLines: le righe lette, nell\'ordine prima del riordino; numeri identici a quelli senza opzione', ()=>{
  const C=require('../validation/core.js'), vm=require('vm'), ctx={console, Float64Array, Math, TextDecoder, Uint8Array, DataView, ArrayBuffer}; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT,'app','sorption-core.js'),'utf8'), ctx); vm.runInContext(C.src, ctx);
  const txt='# prova\nx\ty\n'+Array.from({length:30},(_,i)=>`${30-i}\t${(i*i)%7}`).join('\n')+'\nnota finale\n';
  const a=ctx.parseText0(txt,{}), b=ctx.parseText0(txt,{keepLines:true});
  assert.deepStrictEqual(Array.from(b.xs), Array.from(a.xs)); assert.deepStrictEqual(Array.from(b.ys), Array.from(a.ys)); assert.strictEqual(a.lines, undefined);
  assert.strictEqual(b.lines.length, 30); assert.deepStrictEqual(Array.from(b.lines.slice(0,3)), [2,3,4]);
});
