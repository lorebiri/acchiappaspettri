// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I12, ricetta come script Python: parte pura (app/ricetta-py.js), modulo generato aggiornato, aritmetica di formattazione di JavaScript
// trascritta in Python identica a quella del browser, e parseText0 con keepLines che non cambia i numeri.
// I confronti con Python si saltano (e lo si dice) se python3 ≥ 3.10 manca.
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), os=require('os'), {spawnSync}=require('child_process');
const ROOT=path.join(__dirname,'..','..');
const PY=(()=>{ for (const c of [process.env.PYTHON, 'python3'].filter(Boolean)){ const r=spawnSync(c, ['-c','import sys; print(sys.version_info>=(3,10))'], {encoding:'utf8'}); if (r.status===0 && /True/.test(r.stdout)) return c; } return null; })();

test('app/ricetta-py-modello.js è generato dalla versione attuale dei moduli scripts/ricetta-py/*.py, concatenati nell\'ordine', ()=>{
  const B=require('../../scripts/ricetta-py-build.js'); assert.strictEqual(fs.readFileSync(B.OUT,'utf8'), B.build(), 'eseguire node scripts/ricetta-py-build.js');
  assert.deepStrictEqual(B.MODULI, ['acch_ricetta','acch_math','acch_lettori','acch_chemometria','acch_tecnica','acch_xrf','acch_sorp','acch_chemo','acch_libreria']);
  const M=require('../../app/ricetta-py-modello.js'); let at=-1;
  for (const m of B.MODULI){ const src=fs.readFileSync(path.join(B.DIR, m+'.py'),'utf8').replace(/\r\n/g,'\n').replace(/\s+$/,''), k=M.indexOf(src); assert.ok(k>at, m+' nel modello, nell\'ordine'); at=k; }
  assert.ok(!/^\s*(import|from)\s+acch_/m.test(M), 'niente import fra i moduli: sono concatenati');
  assert.deepStrictEqual(B.duplicates(), []);
  const r=spawnSync(process.execPath, [path.join(ROOT,'scripts','ricetta-py-build.js'), '--check'], {encoding:'utf8'}); assert.strictEqual(r.status, 0, r.stderr);
});

test('costruzione: un nome di primo livello definito in due moduli ferma la generazione (tranne le m_* ridefinite da acch_math)', ()=>{
  const B=require('../../scripts/ricetta-py-build.js');
  assert.deepStrictEqual(B.topNames("def a(x):\n    b = 1\nC = 2\nd, e = 1, 2\nT: int = 3\nS = r'''\nf = 1\n'''\nclass K:\n    pass\nx == 1\n"), ['a','C','d','e','T','S','K']);
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'acch-build-')); try{
    for (const m of B.MODULI) fs.copyFileSync(path.join(B.DIR, m+'.py'), path.join(d, m+'.py'));
    fs.appendFileSync(path.join(d,'acch_chemo.py'), '\n\ndef sorp_csv_text(*a):\n    return None\n');
    const prog=`const fs=require('fs'), path=require('path'); const src=fs.readFileSync(${JSON.stringify(path.join(ROOT,'scripts','ricetta-py-build.js'))},'utf8').replace("path.join(ROOT,'scripts','ricetta-py')", ${JSON.stringify(JSON.stringify(d))});
      const m={exports:{}}; new Function('require','module','__dirname',src)(require, m, ${JSON.stringify(path.join(ROOT,'scripts'))}); try{ m.exports.python(); console.log('nessun errore'); }catch(e){ console.log(e.message); }`;
    const r=spawnSync(process.execPath, ['-e', prog], {encoding:'utf8'}); assert.match(r.stdout, /sorp_csv_text: acch_sorp e acch_chemo/);
    assert.match(fs.readFileSync(path.join(B.DIR,'acch_math.py'),'utf8'), /^def m_exp\(/m);   // ridefinita: ammessa
  } finally { fs.rmSync(d,{recursive:true,force:true}); }
});

test('intestazione: GPL-3.0-or-later, titolare, versione, data, impronte; letterale della ricetta sicuro anche con apici tripli e barre', ()=>{
  const R=require('../../app/ricetta-py.js');
  const ric={versione:'3.0.0', data:'2026-11-14', titolare:'Lorenzo Birindelli', lingua:'it', spettri:[{nome:"a'''b\\", lettura:{modo:'testo', origine:'a.csv', sha256:'ab'.repeat(32)}}, {nome:'c', lettura:{modo:'csv', origine:'c.spa', impronta:'cd'.repeat(32)}}], nonTrascritte:['deconvoluzione.csv']};
  const s=R.script(ric), head=s.split('RICETTA =')[0];
  assert.match(head, /^#!\/usr\/bin\/env python3\n/); assert.match(head, /SPDX-License-Identifier: GPL-3\.0-or-later/); assert.match(head, /Copyright \(C\) 2026 Lorenzo Birindelli/);
  assert.match(head, /Acchiappaspettri 3\.0\.0, il 2026-11-14/); assert.match(head, /a\.csv  (ab){32}  \(rilettura del file di testo\)/); assert.match(head, /c\.spa  (cd){32}  \(CSV dei dati letti/);
  assert.match(head, /Parti del progetto non trascritte[^\n]*\n#   - deconvoluzione\.csv/); assert.match(head, /lettore trascritto non ricostruisce identici/);
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

// I5 (motore desktop): il nucleo condiviso calcola Savitzky–Golay e derivata con somme scorrevoli quando la finestra è larga
// (m > 64, sgFast e derivFast), i candidati dei picchi con una pila (peakCandidatesMin) e la mediana del rumore senza ordinare tutto
// (kthSmallest). Sono numeri del web e del desktop: lo script deve rifarli identici bit per bit, anche nei casi limite.
test('nucleo dopo la tappa I5: sgFast, derivFast, peakCandidates a pila e noiseSigma in Python identici bit per bit', {skip:!PY && 'python3 ≥ 3.10 non trovato: SALTATO', timeout:600000}, ()=>{
  const C=require('../validation/core.js'), vm=require('vm'), ctx={console, Float64Array, Math, TextDecoder, Uint8Array, DataView, ArrayBuffer}; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT,'app','sorption-core.js'),'utf8'), ctx); vm.runInContext(C.src, ctx);
  for (const n of ['sgFast','derivFast','peakCandidatesMin','kthSmallest']) assert.strictEqual(typeof ctx[n], 'function', 'nel nucleo manca '+n);
  let s=11; const r=()=>{ s=(s*16807)%2147483647; return s/2147483647; }, g=(x,c,w)=>Math.exp(-0.5*((x-c)/w)**2);
  const cases=[];
  for (const [n, noise, step] of [[3000, 0.01, 1], [5000, 0.2, 0.37], [700, 0, 2], [2600, 1e-6, -0.5], [1500, 3, 1]]){
    const xs=Array.from({length:n},(_,i)=>1000+step*i+(i%7===3?0.01*step:0)), ys=xs.map((x,i)=>40*g(i,0.3*n,0.02*n)+15*g(i,0.62*n,0.005*n)+5*g(i,0.8*n,0.1*n)+noise*(r()-0.5)+(i%400===0?8:0));
    cases.push({xs, ys, sg:[5, 2*65+1, 2*90+1, 2*200+1], dv:[3, 65, 80, 150], pk:[[1,2,20],[-1,1,12],[1,0.5,200]]}); }
  cases.push({xs:Array.from({length:600},(_,i)=>i), ys:Array.from({length:600},(_,i)=>i%2?1:0), sg:[2*70+1], dv:[70], pk:[[1,2,20]]});   // gradini e valori uguali
  cases.push({xs:Array.from({length:900},()=>5), ys:Array.from({length:900},(_,i)=>i), sg:[2*66+1], dv:[66, 100], pk:[]});   // x tutte uguali: derivPoint
  const enc=v=>Object.is(v,-0)?'-0':Number.isFinite(v)?v:String(v);
  const want=cases.map(c=>{ const X=Float64Array.from(c.xs), Y=Float64Array.from(c.ys);
    return {sg:c.sg.map(w=>Array.from(ctx.sgSmooth(Y, w), enc)), dv:c.dv.map(m=>Array.from(ctx.derivLS(X, Y, m), enc)), ns:enc(ctx.noiseSigma(Y)), pc:ctx.peakCandidates(Y).map(o=>[o.i, enc(o.prom)]),
      pk:c.pk.map(([d,se,mx])=>ctx.findPeaks(X, Y, d, se, mx).map(p=>[enc(p.x), enc(p.y), enc(p.prom)]))}; });
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'acch-py-i5-')); try{ fs.writeFileSync(path.join(d,'c.json'), JSON.stringify(cases));
    const prog=fs.readFileSync(path.join(ROOT,'scripts','ricetta-py','acch_ricetta.py'),'utf8')+`
import json as _j
_E = lambda v: '-0' if (v == 0 and math.copysign(1, v) < 0) else (v if math.isfinite(v) else js_str(v))
_out = []
for c in _j.load(open(${JSON.stringify(path.join(d,'c.json'))})):
    X, Y = [float(v) for v in c['xs']], [float(v) for v in c['ys']]
    _out.append({'sg': [[_E(v) for v in sg_smooth(Y, w)] for w in c['sg']], 'dv': [[_E(v) for v in deriv_ls(X, Y, m)] for m in c['dv']], 'ns': _E(noise_sigma(Y)),
                 'pc': [[i, _E(p)] for i, p in peak_candidates(Y)], 'pk': [[[_E(p['x']), _E(p['y']), _E(p['prom'])] for p in find_peaks(X, Y, d, se, mx)] for d, se, mx in c['pk']]})
print(_j.dumps(_out))
`;
    fs.writeFileSync(path.join(d,'p.py'), prog); const p=spawnSync(PY, ['-I', path.join(d,'p.py')], {encoding:'utf8', maxBuffer:1<<28}); assert.strictEqual(p.status, 0, p.stderr);
    const got=JSON.parse(p.stdout), bad=[]; let nn=0;
    got.forEach((G,i)=>{ for (const k of ['sg','dv','ns','pc','pk']){ const a=JSON.stringify(want[i][k]), b=JSON.stringify(G[k]); nn+=a.length; if (a!==b) bad.push(`caso ${i} ${k}: ${b.slice(0,160)} invece di ${a.slice(0,160)}`); } });
    console.log(`# nucleo I5 in Python: ${cases.length} spettri, finestre fino a m = 200, ${bad.length} diversi`); assert.deepStrictEqual(bad, []); } finally { fs.rmSync(d,{recursive:true,force:true}); }
});

// la sonda del motore JavaScript che la pagina esegue all'esportazione è la stessa funzione scritta in acch_math.py (SONDA_JS)
test('sonda del motore: acchSondaMath di index.html identica a SONDA_JS di acch_math.py', ()=>{
  const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8'), py=fs.readFileSync(path.join(ROOT,'scripts','ricetta-py','acch_math.py'),'utf8');
  const sonda=/SONDA_JS = r'''([\s\S]*?)'''/.exec(py)[1], k=html.indexOf('\nfunction acchSondaMath(');
  assert.ok(k>0, 'acchSondaMath non trovata in index.html'); assert.strictEqual(html.slice(k+1, k+1+sonda.length), sonda);
  const v=new Function(sonda+'\nreturn acchSondaMath();')(); assert.strictEqual(v.versione, 1); assert.strictEqual(v.valori.length, 128); assert.ok(v.valori.every(r=>r.length===9));
});
