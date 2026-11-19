// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Dati atomici della CF-LIBS scaricati dall'app (app/libs-nist.js) invece che distribuiti: elaborazione provata con un piccolo campione
// SINTETICO nel formato delle risposte del NIST ASD (valori inventati, non dati del NIST), confrontata con scripts/gen-libs-data.py
// sulla stessa cache; controllo dei file caricati dall'utente; scaricamento con rete assente o risposta inattesa.
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('fs'), os=require('os'), path=require('path'), {execFileSync}=require('child_process');
const N=require('../../app/libs-nist.js');
const ROOT=path.join(__dirname,'..','..');

const {SAMPLE}=require('../fixtures/libs/nist-sintetico.js');
function writeCache(dir){ fs.mkdirSync(dir, {recursive:true}); const all=new Set(Object.keys(SAMPLE));
  for (const el of N.ELEMENTS){ all.add('ie_'+el+'.tsv'); for (const st of N.STAGES){ all.add('lines_'+el+'_'+st+'.tsv'); all.add('levels_'+el+'_'+st+'.tsv'); } }
  for (const f of all) fs.writeFileSync(path.join(dir, f), '# scaricato 2026-01-02\n'+(SAMPLE[f]||''));
  for (const k of ['H_I','Cu_I','Cu_II','Sn_I']) fs.writeFileSync(path.join(dir, 'pf_'+k+'_1.html'), '# scaricato 2026-01-02\n<html><body>Partition function: Z = 2.5</body></html>');
  return dir; }
const getter=dir=>async name=>{ const t=fs.readFileSync(path.join(dir, name),'utf8'), i=t.indexOf('\n'); return {stamp:t.slice(0,i).replace('# scaricato ',''), body:t.slice(i+1)}; };

test('elaborazione del NIST: stesso risultato dello script Python sullo stesso campione sintetico', async ()=>{
  const dir=writeCache(fs.mkdtempSync(path.join(os.tmpdir(),'nist-sint-'))), out=path.join(dir,'out.js');
  execFileSync('python3', [path.join(ROOT,'scripts','gen-libs-data.py'), '--offline'], {env:Object.assign({}, process.env, {LIBS_NIST_CACHE:dir, LIBS_DATA_OUT:out}), stdio:'pipe'});
  const py=require(out), js=await N.build(getter(dir));
  for (const k of ['version','selection','accRel','lineFields','Tgrid','mass','downloaded','downloadedFirst']) assert.deepEqual(JSON.parse(JSON.stringify(js[k])), JSON.parse(JSON.stringify(py[k])), k);
  assert.deepEqual(Object.keys(js.species), Object.keys(py.species));
  assert.deepEqual(js.species, py.species);
  assert.deepEqual(js.pfCheck1eV.map(c=>c.slice(0,2)), py.pfCheck1eV.map(c=>c.slice(0,2)));
  // scelte attese sul campione: λ fuori 200–900 nm, M1, A mancante e «+x» scartati; λ di Ritz se manca quella osservata; Sn I completato con D+, D, E;
  // Balmer: componenti sommate senza la riga totale (g·A = 6,47·10⁷·4 + 2,25·10⁷·2), Hβ dalla sola riga totale; Cu II senza Eion utile (tra [ ])
  const cu=js.species['Cu I'];
  assert.deepEqual(cu.lines.map(l=>l[0]), [222, 324.754, 327.396, 458.697, 510.554, 515.324, 521.82, 578.213]);
  assert.equal(js.species['Sn I'].lines.length, 3); assert.deepEqual(js.species['Sn I'].lines.map(l=>l[2]), ['D','D+','E']);
  const ha=js.species['H I'].lines.find(l=>Math.abs(l[0]-656.28)<0.01); assert.ok(Math.abs(ha[1]*18-(6.47e7*4+2.25e7*2))/(ha[1]*18)<1e-3, String(ha[1]));
  assert.equal(js.species['Cu II'].Eion, 20.29239); assert.equal(cu.nLev, 6, 'livelli sotto il limite di ionizzazione (8,0 eV escluso), senza «+x», con «[1.6422]»');
  assert.ok(!('Ag I' in js.species), 'nessun livello: specie assente');
});

test('file di dati caricato dall\'utente: JSON o libs-data.js dello script; struttura controllata, chiavi strane scartate', async ()=>{
  const D=await N.build(getter(writeCache(fs.mkdtempSync(path.join(os.tmpdir(),'nist-sint-')))));
  const js='// x\n(function(root, D){ module.exports=D; })(this, '+JSON.stringify(D)+');\n';
  assert.deepEqual(N.parseFile(js).species['Cu I'], D.species['Cu I']); assert.deepEqual(N.parseFile(JSON.stringify(D)).Tgrid, D.Tgrid);
  const evil=JSON.parse(JSON.stringify(D)); evil.species['__proto__']={U:[1]}; evil.species['constructor']={}; evil.mass['__proto__']=3;
  const v=N.parseFile(JSON.stringify(evil).replace('"species":{','"species":{"__proto__":{"lines":[]},')); assert.equal(({}).U, undefined); assert.ok(!Object.keys(v.species).includes('__proto__'));
  for (const bad of ['', '{}', '{"version":"libs-data-1"}', 'ciao', JSON.stringify(Object.assign({}, D, {Tgrid:['a']}))]) assert.throws(()=>N.parseFile(bad));
  const nan=JSON.parse(JSON.stringify(D)); nan.species['Cu I'].U[3]=-1; assert.throws(()=>N.parseFile(JSON.stringify(nan)), /partizione/);
});

test('scaricamento nella pagina: senza rete, NIST irraggiungibile (CORS) o risposta inattesa → errore con codice; i dati salvati si ricaricano senza rete', async ()=>{
  const mem=new Map(), win={localStorage:{getItem:k=>mem.has(k)?mem.get(k):null, setItem:(k,v)=>mem.set(k,String(v)), removeItem:k=>mem.delete(k)}, navigator:{onLine:false}};
  const f=new Function('self','module', fs.readFileSync(path.join(ROOT,'app','libs-nist.js'),'utf8')+';return self.AcchLibsNist;');
  const W=f(win, undefined);
  await assert.rejects(W.download(), e=>e.code==='offline');
  win.navigator.onLine=true; win.fetch=async ()=>{ throw new TypeError('Failed to fetch'); }; await assert.rejects(W.download(), e=>e.code==='cors');
  win.fetch=async ()=>({ok:true, text:async ()=>'<html>Errore del server</html>'}); await assert.rejects(W.download(), e=>e.code==='format');
  win.fetch=async ()=>({ok:false, status:503}); await assert.rejects(W.download(), e=>e.code==='http');
  assert.equal(W.load(), null);
  const D=await N.build(getter(writeCache(fs.mkdtempSync(path.join(os.tmpdir(),'nist-sint-'))))); W.save(D);
  win.LIBS_DATA=null; win.fetch=async ()=>{ throw new Error('nessuna rete'); }; const L=W.load(); assert.ok(L && win.LIBS_DATA===L && L.species['Cu I']);
  W.forget(); assert.equal(W.load(), null); assert.equal(win.LIBS_DATA, null);
});

test('desktop: lo scaricamento passa dal comando nativo nist_get (solo il modulo e la query, mai un URL), con il campione sintetico', async ()=>{
  const NS=require('../fixtures/libs/nist-sintetico.js'), mem=new Map(), calls=[];
  const win={localStorage:{getItem:k=>mem.has(k)?mem.get(k):null, setItem:(k,v)=>mem.set(k,String(v)), removeItem:k=>mem.delete(k)}, navigator:{onLine:true},
    fetch:()=>{ throw new Error('fetch non va usato sul desktop'); },
    __TAURI__:{core:{invoke:async (cmd, a)=>{ calls.push([cmd, a.script]); assert.equal(cmd, 'nist_get'); assert.ok(!/https?:/.test(a.query)); return NS.respond(N.BASE+a.script+'?'+a.query); }}}};
  const W=new Function('self','module', fs.readFileSync(path.join(ROOT,'app','libs-nist.js'),'utf8')+';return self.AcchLibsNist;')(win, undefined); W.delay=0;
  assert.ok(W.native()); const D=await W.download(); assert.equal(calls.length, 128); assert.ok(D.species['Cu I'] && win.LIBS_DATA===D);
});
