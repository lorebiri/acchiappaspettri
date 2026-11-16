// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I12, ricetta Python, parte «chemo»: scripts/ricetta-py/acch_chemo.py (concatenato dopo acch_ricetta.py) rifà MCR-ALS, MCR-BANDS,
// cinetica globale e confronto dei modelli e scrive gli stessi CSV di AcchChemo.analysisFiles (app/chemo-ui.js), IT ed EN.
// Dati SINTETICI (generatori di test/validation/chemo/sintetici.js). Se python3 ≥ 3.10 manca, il confronto si salta e lo si dice.
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), os=require('os'), vm=require('vm'), {spawnSync}=require('child_process');
const ROOT=path.join(__dirname,'..','..'), PYDIR=path.join(ROOT,'scripts','ricetta-py');
const SY=require('../validation/chemo/sintetici.js');
const PY=(()=>{ for (const c of [process.env.PYTHON, 'python3'].filter(Boolean)){ const r=spawnSync(c, ['-c','import sys; print(sys.version_info>=(3,10))'], {encoding:'utf8'}); if (r.status===0 && /True/.test(r.stdout)) return c; } return null; })();

// l'app in un contesto vm: mcr-core, kinetics-core e chemo-ui come nella pagina (senza DOM: la sezione non si disegna)
function app(lang, files){ const doc={querySelector:()=>null, createElement:()=>({}), head:{appendChild(){}}, readyState:'complete', addEventListener(){}};
  const ctx={console, document:doc, addEventListener(){}, performance:{now:()=>0}, setTimeout, files, AcchI18n:{lang},
    INSTR:{ftir:{xPdf:'cm-1'}, uv:{xPdf:'nm'}, raman:{xPdf:'cm-1'}, gen:{xPdf:''}, hplc:{xPdf:'min'}}};
  ctx.self=ctx; vm.createContext(ctx);
  for (const f of ['mcr-core.js','kinetics-core.js','chemo-ui.js']) vm.runInContext(fs.readFileSync(path.join(ROOT,'app',f),'utf8'), ctx, {filename:'app/'+f});
  return ctx; }

const serie=(D, t, x, unit)=>({kind:'generic', t:{values:t, quantity:'tempo', unit}, x:{values:Float64Array.from(x), quantity:'x', unit:''}, y:{}, shape:[D.m,D.n], dtype:'f64', data:Float64Array.from(D.a), meta:{version:'mcr-1'}});
function mcrData(m, n, nc, noise, seed){ const Ct=Array.from({length:m},(_,i)=>[0,1,2].slice(0,nc).map(c=>SY.bump(i,[0.25,0.45,0.68][c]*m,0.2*m)));
  const St=[0,1,2].slice(0,nc).map(c=>Array.from({length:n},(_,j)=>SY.bump(j,[0.2,0.5,0.8][c]*n,0.25*n)+0.05));
  return serie(SY.compose(Ct,St,noise,seed), Array.from({length:m},(_,i)=>i*0.5), Array.from({length:n},(_,j)=>400+j*2.5), 'min'); }
function closureData(m, n){ const Ct=Array.from({length:m},(_,i)=>{ const a=Math.max(0,1-i/(0.6*m)); return [a,1-a]; });
  const St=[0,1].map(c=>Array.from({length:n},(_,j)=>SY.bump(j,[0.3,0.7][c]*n,0.3*n)+0.02)); return serie(SY.compose(Ct,St,0.001,4), Array.from({length:m},(_,i)=>i), Array.from({length:n},(_,j)=>1000+j*4), 's'); }
const kinData=(model,k,o,m,n,noise,seed)=>{ const se=SY.serieCinetica(model,k,o,m,n,noise,seed); return {kind:'kinetics', t:se.t, x:{values:se.x.values, quantity:'x', unit:'nm'}, y:{}, shape:se.shape, dtype:'f64', data:se.data, meta:{}}; };

// casi: {lang, f (spettro derivato dell'app), svd: scheda MCR aperta, bands, cmp, ref (spettro noto)}
function casi(){ const ref={name:'riferimento.csv', path:'rif/riferimento.csv', xs:Array.from({length:61},(_,j)=>560-j*3), ys:Array.from({length:61},(_,j)=>SY.bump(60-j,30,15)+0.05)};
  return [
    {id:'mcr-3c-it', lang:'it', f:{name:'Serie UV-Vis (30 × 40).series', title:'', instr:'uv', series:mcrData(30,40,3,0.002,11), an:{mcr:{nc:3}}}, svd:true},
    {id:'mcr-efa-chiusura-bande-en', lang:'en', f:{name:'Serie', title:'Closure: test/1', instr:'ftir', series:closureData(20,25), an:{mcr:{nc:2, init:'efa', initOn:'C', closure:1, unimodal:[0,1], norm:'max'}}}, svd:true, bands:true},
    {id:'mcr-noto-noconv-it', lang:'it', f:{name:'Serie noto', title:'', instr:'uv', series:mcrData(24,40,3,0.001,5), an:{mcr:{nc:3, known:{'1':'rif/riferimento.csv'}, nonnegS:false, maxIter:2, tol:1.5e-5}}}, svd:true, ref},
    {id:'mcr-ind-colonne-en', lang:'en', f:{name:'Serie IND', title:'', instr:'gen', series:mcrData(26,30,2,0.003,9), an:{mcr:{initOn:'C', init:'simplisma', offset:7, norm:'none'}}}, svd:true},
    {id:'mcr-senza-svd-it', lang:'it', f:{name:'Serie due', title:'', instr:'raman', series:mcrData(22,28,3,0.002,3), an:{mcr:{nonnegC:false, unimodal:[1]}}}, svd:false},
    {id:'mcr-bande-it', lang:'it', f:{name:'Serie bande', title:'', instr:'uv', series:mcrData(18,22,2,0.001,2), an:{mcr:{nc:2, unimodal:[0]}}}, svd:true, bands:true},
    {id:'kin-consec-cmp-it', lang:'it', f:{name:'Cinetica', title:'Cinetica A→B→C', instr:'uv', series:kinData('consec',[0.5,0.12],{},25,18,0.002,7), an:{kin:{model:'consec'}, mcr:{nc:3}}}, svd:true, cmp:true},
    {id:'kin-consec-cmp-en', lang:'en', f:{name:'Kinetics', title:'', instr:'uv', series:kinData('consec',[0.5,0.12],{},25,18,0.002,7), an:{kin:{model:'consec'}}}, cmp:true},
    {id:'kin-ord1-t0-it', lang:'it', f:{name:'k1', title:'', instr:'uv', series:kinData('ord1',[0.3],{},24,16,0.002,3), an:{kin:{model:'ord1', t0fit:true}}}},
    {id:'kin-par2c-en', lang:'en', f:{name:'par', title:'', instr:'uv', series:kinData('par',[0.8,0.1],{nExp:2, offset:true},30,16,0.002,4), an:{kin:{model:'par', nExp:2, offset:true}}}},
    {id:'kin-rev-K-it', lang:'it', f:{name:'rev', title:'', instr:'uv', series:kinData('rev',[0.3],{K:2},24,14,0.001,5), an:{kin:{model:'rev', K:2}}}},
    {id:'kin-rev-noK-en', lang:'en', f:{name:'rev', title:'', instr:'uv', series:kinData('rev',[0.3],{},24,14,0.001,5), an:{kin:{model:'rev'}}}},
    {id:'kin-ord2-A0-it', lang:'it', f:{name:'o2', title:'', instr:'uv', series:kinData('ord2',[0.4],{},24,14,0.001,6), an:{kin:{model:'ord2', A0:0.002}}}},
    {id:'kin-ord0-it', lang:'it', f:{name:'o0', title:'', instr:'uv', series:kinData('ord0',[0.02],{},24,14,0.001,6), an:{kin:{model:'ord0'}}}},
    {id:'kin-nnls-k0-en', lang:'en', f:{name:'nn', title:'', instr:'uv', series:kinData('ord1',[0.3],{},20,12,0.002,8), an:{kin:{model:'ord1', nonnegS:true, k0:[0.2]}}}},
    {id:'kin-pianoro-it', lang:'it', f:{name:'pianoro', title:'', instr:'uv', series:kinData('ord1',[0.3],{},40,30,0.001,4), an:{kin:{model:'par', nExp:3}}}},
    {id:'kin-rango-it', lang:'it', f:{name:'rango', title:'', instr:'uv', series:kinData('consec',[0.6,0.15],{},16,30,0.002,12), an:{kin:{model:'consec', rank:3}}}}
  ]; }

// AcchChemo.analysisFiles([f]) con lo stato a schermo voluto (valori singolari, MCR-BANDS e confronto già calcolati come dall'utente)
function jsFiles(c){ const files=[Object.assign({path:'serie/'+c.id+'.series'}, c.f)]; if (c.ref) files.push(c.ref); const ctx=app(c.lang, files), M=ctx.McrCore, K=ctx.KinCore, f=files[0], r=f._chemo={};
  const [m,n]=f.series.shape; if (c.svd) r.svd=M.svd(M.seriesMatrix(f.series), Math.min(m,n,30));
  if (c.bands){ const res=ctx.AcchChemo.resultFor(f,'mcr'), o=Object.assign({}, f.an.mcr); r.bands={key:JSON.stringify([f.path, o]), res:M.bands(res)}; }
  if (c.cmp){ const out=[]; for (const [id,o] of [['ord0',{model:'ord0'}],['ord1',{model:'ord1'}],['ord2',{model:'ord2'}],['consec',{model:'consec'}],['par2',{model:'par', nExp:2}],['par2c',{model:'par', nExp:2, offset:true}],['par3c',{model:'par', nExp:3, offset:true}]]){ try{ const q=K.fit(f.series,o); q.label=id; out.push(q); }catch(e){} }
    r.cmp={key:f.path, res:K.compare(out)}; }
  return ctx.AcchChemo.analysisFiles([f]); }
// ingresso per chemo_tables: i campi di f che servono, come li scriverebbe l'esportazione
function pyInput(c){ const f=c.f, an=f.an||{}, se=f.series;
  return {lingua:c.lang, f:{name:f.name, title:f.title, instr:f.instr, series:{t:{values:Array.from(se.t.values), quantity:se.t.quantity, unit:se.t.unit}, x:{values:Array.from(se.x.values)}, shape:se.shape, data:Array.from(se.data)},
    mcr:an.mcr||null, mcr_svd_visto:!!c.svd, mcr_known_xy:c.ref?{'1':{xs:c.ref.xs, ys:c.ref.ys}}:{}, mcr_bands:!!c.bands, kin:an.kin?Object.assign({model:'ord1'}, an.kin):null, kin_cmp:!!c.cmp, sonda:sonda()}}; }

// sonda del motore JavaScript: la funzione acchSondaMath scritta in acch_math.py (SONDA_JS), eseguita qui come nella pagina
const PYCAT=()=>['acch_ricetta.py','acch_math.py','acch_chemo.py'].map(f=>fs.readFileSync(path.join(PYDIR,f),'utf8')).join('\n');
const SONDA_SRC=(()=>{ const m=/SONDA_JS = r'''([\s\S]*?)'''/.exec(fs.readFileSync(path.join(PYDIR,'acch_math.py'),'utf8')); return m?m[1]:'function acchSondaMath(){ return null; }'; })();
const sonda=()=>new Function(SONDA_SRC+'\nreturn acchSondaMath();')();
const RE_NUM={it:/-?\d+(?:,\d+)?(?:e[-+]\d+)?/g, en:/-?\d+(?:\.\d+)?(?:e[-+]\d+)?/g};
const lreOf=(a,b)=>a===b?15:Math.min(15,-Math.log10(Math.abs(a-b)/Math.max(Math.abs(b),1e-300)));
function confronta(js, py, lang){ let lre=15, diff=[], nnum=0;
  const A=js.split('\r\n'), B=py.split('\r\n'); if (A.length!==B.length) return {lre:0, diff:[`righe ${B.length} invece di ${A.length}`], nnum};
  A.forEach((la,i)=>{ const lb=B[i], na=(la.match(RE_NUM[lang])||[]), nb=(lb.match(RE_NUM[lang])||[]); nnum+=na.length; if (la===lb) return;
    const strip=s=>s.replace(RE_NUM[lang],'#'); if (strip(la)!==strip(lb) || na.length!==nb.length){ diff.push(`riga ${i+1}: «${lb}» invece di «${la}»`); lre=0; return; }
    na.forEach((v,k)=>{ const x=+v.replace(',','.'), y=+nb[k].replace(',','.'), L=lreOf(y,x); if (L<lre) lre=L; if (L<9) diff.push(`riga ${i+1}: ${nb[k]} invece di ${v}`); }); });
  return {lre, diff, nnum}; }

test('il modulo Python della parte chemo esiste e cita le funzioni dell\'app', ()=>{
  const p=path.join(PYDIR,'acch_chemo.py'); assert.ok(fs.existsSync(p), 'manca scripts/ricetta-py/acch_chemo.py'); const s=fs.readFileSync(p,'utf8');
  for (const nm of ['eigSymGen','svdGen','fnnls','closedLS','unimodal','simplisma','efaGen','alsGen','bandsGen','nelderMead','lmGen','fitGen','compare','analysisFiles','mcrRows','kinRowsCsv']) assert.ok(s.includes(nm), 'non cita '+nm);
  assert.ok(!/^\s*import\s+acch_ricetta/m.test(s), 'il modulo va concatenato, non importato');
});

function runPy(inputs){ const d=fs.mkdtempSync(path.join(os.tmpdir(),'acch-chemo-'));
  try{ fs.writeFileSync(path.join(d,'in.json'), JSON.stringify(inputs));
    const prog=PYCAT()+
      `\nimport json as _j\n_I=_j.load(open(${JSON.stringify(path.join(d,'in.json'))}, encoding='utf-8'))\n_O=[chemo_tables(c['f'], c['lingua']) for c in _I]\nopen(${JSON.stringify(path.join(d,'out.json'))},'w',encoding='utf-8').write(_j.dumps(_O, ensure_ascii=True))\n`;
    fs.writeFileSync(path.join(d,'p.py'), prog);
    const r=spawnSync(PY, ['-I', path.join(d,'p.py')], {encoding:'utf8', maxBuffer:1<<26}); assert.strictEqual(r.status, 0, r.stderr);
    return JSON.parse(fs.readFileSync(path.join(d,'out.json'),'utf8')); } finally { fs.rmSync(d,{recursive:true,force:true}); } }
function verifica(C, want, got, tag){ let lmin=15, tot=0, ident=0, nfile=0; const bad=[];
  C.forEach((c,i)=>{ const W=want[i], G=got[i];
    assert.deepStrictEqual(G.map(x=>x[0]), W.map(x=>x[0]), c.id+': nomi dei file'); assert.ok(W.length>=1, c.id+': l\'app non ha prodotto file');
    W.forEach(([nm,txt],k)=>{ nfile++; const R=confronta(txt, G[k][1], c.lang); tot+=R.nnum; if (txt===G[k][1]) ident++; if (R.lre<lmin) lmin=R.lre; if (R.diff.length) bad.push(`${c.id} ${nm}: `+R.diff.slice(0,3).join(' · ')); }); });
  console.log(`# chemo ${tag}: ${C.length} casi, ${nfile} file CSV, ${ident} identici come testo, circa ${tot} numeri; LRE minimo ${lmin.toFixed(1)}`);
  assert.deepStrictEqual(bad, []); assert.ok(lmin>=9, 'LRE minimo '+lmin); }

test('MCR-ALS, MCR-BANDS, cinetica globale e confronto: CSV di Python identici a quelli di AcchChemo.analysisFiles (IT ed EN)', {skip:!PY && 'python3 ≥ 3.10 non trovato: confronto SALTATO', timeout:600000}, ()=>{
  const C=casi(), want=C.map(c=>JSON.parse(JSON.stringify(jsFiles(c))));
  const all=want.map(W=>W.map(x=>x[1]).join('\n')).join('\n');
  for (const t of ['MCR-BANDS 1','ΔAIC','\r\nF;','non determinato (pianoro)','spettri noti 2','Nessuna convergenza in 2 iterazioni: la mancanza di adattamento cambia ancora più dello 0,002%','mcr_als_Closure_ test_1.csv'.slice(0,0)+'Closure: test/1','DAS τ1','SAS A','kf;','t0;','normalisation —','correlazione k1'])
    assert.ok(all.includes(t), 'caso non esercitato: '+t+' (mancano: '+['MCR-BANDS 1','ΔAIC','\r\nF;','non determinato (pianoro)','spettri noti 2','Nessuna convergenza in 2 iterazioni: la mancanza di adattamento cambia ancora più dello 0,002%','Closure: test/1','DAS τ1','SAS A','kf;','t0;','normalisation —','correlazione k1'].filter(q=>!all.includes(q)).join(' | ')+')');
  assert.ok(want.some(W=>W.some(x=>x[0]==='mcr_als_Closure_ test_1.csv')), 'nome del file ripulito');
  verifica(C, want, runPy(C.map(pyInput)), 'V8 (Node)');
});

// motore del desktop su macOS (WKWebView): JavaScriptCore, qui con osascript -l JavaScript. Mostra che la sonda sceglie «jsc».
const JSC=process.platform==='darwin' && spawnSync('osascript', ['-l','JavaScript','-e','1+1'], {encoding:'utf8'}).stdout.trim()==='2';
test('JavaScriptCore (desktop su macOS): stessi CSV con il motore «jsc» scelto dalla sonda', {skip:(!PY || !JSC) && 'python3 o JavaScriptCore (osascript) non disponibili: SALTATO', timeout:600000}, ()=>{
  const C=casi().filter(c=>['mcr-3c-it','mcr-efa-chiusura-bande-en','mcr-noto-noconv-it','kin-consec-cmp-it','kin-ord1-t0-it','kin-par2c-en','kin-pianoro-it'].includes(c.id));
  const ser=v=>JSON.stringify(v, (k,x)=>x instanceof Float64Array?{__f64:Array.from(x)}:x);
  const src=['mcr-core.js','kinetics-core.js','chemo-ui.js'].map(f=>fs.readFileSync(path.join(ROOT,'app',f),'utf8')).join('\n;\n');
  const prog=`var self=this; var document={querySelector:function(){return null}, createElement:function(){return {}}, head:{appendChild:function(){}}, readyState:'complete', addEventListener:function(){}};
    var addEventListener=function(){}; var performance={now:function(){return 0}}; var files=[]; var AcchI18n={lang:'it'};
    var INSTR={ftir:{xPdf:'cm-1'}, uv:{xPdf:'nm'}, raman:{xPdf:'cm-1'}, gen:{xPdf:''}, hplc:{xPdf:'min'}};
    ${src}
    var CASI=JSON.parse(${JSON.stringify(ser(C))}, function(k,x){ return x && x.__f64 ? Float64Array.from(x.__f64) : x; });
    ${SONDA_SRC}
    var OUT=CASI.map(function(c){ AcchI18n.lang=c.lang; files.length=0; var f=Object.assign({path:'serie/'+c.id+'.series'}, c.f); files.push(f); if (c.ref) files.push(c.ref);
      var M=McrCore, K=KinCore, r=f._chemo={}, m=f.series.shape[0], n=f.series.shape[1]; if (c.svd) r.svd=M.svd(M.seriesMatrix(f.series), Math.min(m,n,30));
      if (c.bands){ var res=AcchChemo.resultFor(f,'mcr'); r.bands={key:JSON.stringify([f.path, Object.assign({}, f.an.mcr)]), res:M.bands(res)}; }
      if (c.cmp){ var out=[]; [['ord0',{model:'ord0'}],['ord1',{model:'ord1'}],['ord2',{model:'ord2'}],['consec',{model:'consec'}],['par2',{model:'par', nExp:2}],['par2c',{model:'par', nExp:2, offset:true}],['par3c',{model:'par', nExp:3, offset:true}]].forEach(function(p){ try{ var q=K.fit(f.series,p[1]); q.label=p[0]; out.push(q); }catch(e){} }); r.cmp={key:f.path, res:K.compare(out)}; }
      return AcchChemo.analysisFiles([f]); });
    JSON.stringify({out:OUT, sonda:acchSondaMath()});`;
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'acch-jsc-')); let J;
  try{ fs.writeFileSync(path.join(d,'p.js'), prog); const r=spawnSync('osascript', ['-l','JavaScript', path.join(d,'p.js')], {encoding:'utf8', maxBuffer:1<<28}); assert.strictEqual(r.status, 0, r.stderr); J=JSON.parse(r.stdout); }
  finally { fs.rmSync(d,{recursive:true,force:true}); }
  const inp=C.map(c=>{ const q=pyInput(c); q.f.sonda=J.sonda; return q; });
  verifica(C, J.out, runPy(inp), 'JavaScriptCore');
  // gli stessi dati con la sonda di V8: Python segue il motore, i numeri della cinetica cambiano nell'ultima cifra
  const nV8=C.map(c=>JSON.parse(JSON.stringify(jsFiles(c)))); let diversi=0; nV8.forEach((W,i)=>W.forEach(([nm,t],k)=>{ if (t!==J.out[i][k][1]) diversi++; }));
  console.log(`# CSV diversi fra V8 e JavaScriptCore sugli stessi dati: ${diversi}`);
});

test('acch_math: Math.exp, log, log10, expm1, sin, cos, pow e hypot di Python identici bit per bit a quelli di Node; la sonda riconosce il motore', {skip:!PY && 'python3 ≥ 3.10 non trovato: SALTATO'}, ()=>{
  const R=SY.rng(3), V=[]; for (let i=0;i<6000;i++){ const a=(R.u()-0.5)*Math.pow(10,Math.floor(R.u()*9)-6), b=(R.u()-0.5)*Math.pow(10,Math.floor(R.u()*9)-6); V.push([a,b]); }
  for (let e=-30;e<9;e++) V.push([Math.pow(2,e), -Math.pow(2,e)]); for (let k=-40;k<40;k++) V.push([k*Math.PI/4, k*Math.PI/2+1e-9]);
  const F=(a,b)=>[Math.hypot(a,b), Math.hypot(a,1), Math.exp(a), Math.expm1(b), Math.log(Math.abs(a)), Math.log10(Math.abs(b)), Math.sin(a), Math.cos(b), Math.pow(2*a-1,3), Math.pow(Math.abs(a),b)];
  const want=V.map(([a,b])=>F(a,b)), enc=v=>Number.isFinite(v)?v:String(v);
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'acch-chemo-')); try{ fs.writeFileSync(path.join(d,'v.json'), JSON.stringify({V, sonda:sonda()}));
    const prog=PYCAT()+`\nimport json as _j\n_D=_j.load(open(${JSON.stringify(path.join(d,'v.json'))}))\n_m=imposta_motore(_D['sonda'])\n_E=lambda v: v if math.isfinite(v) else js_str(v)\nprint(_j.dumps({'motore':_m, 'v':[[_E(q) for q in (m_hypot(a,b), m_hypot(a,1.0), m_exp(a), m_expm1(b), m_log(abs(a)), m_log10(abs(b)), m_sin(a), m_cos(b), m_pow(2*a-1,3), m_pow(abs(a),b))] for a,b in _D['V']]}))\n`;
    fs.writeFileSync(path.join(d,'p.py'), prog); const r=spawnSync(PY, ['-I', path.join(d,'p.py')], {encoding:'utf8', maxBuffer:1<<26}); assert.strictEqual(r.status, 0, r.stderr);
    const out=JSON.parse(r.stdout), nd=new Array(10).fill(0);
    out.v.forEach((g,i)=>g.forEach((x,k)=>{ if (x!==enc(want[i][k])) nd[k]++; }));
    console.log(`# Node ${process.arch}: motore riconosciuto ${out.motore}; valori diversi su ${V.length} coppie (hypot, hypot, exp, expm1, log, log10, sin, cos, pow, pow): ${nd.join(' ')}`);
    assert.strictEqual(out.motore, process.arch==='arm64'?'v8-fma':'v8', 'motore riconosciuto');
    assert.deepStrictEqual(nd, new Array(10).fill(0), 'le Math.* devono coincidere bit per bit');
  } finally { fs.rmSync(d,{recursive:true,force:true}); }
});
