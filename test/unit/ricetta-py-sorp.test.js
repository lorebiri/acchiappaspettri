// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I12, ricetta Python, parte «sorp»: scripts/ricetta-py/acch_sorp.py (concatenato dopo acch_ricetta.py) rifà le tabelle di
// fisisorbimento (AcchSorp.csvText) e di chemisorbimento (AcchChem.csvText) con lo stesso testo, IT ed EN, e gli stessi numeri
// di SorpCore.analyze / chemAnalyze entro 1e-9 relativo. Casi: fixture di test/fixtures/sorption, isoterme sintetiche di
// test/validation/sorption e il report pubblico Kaomi. Si salta (e lo si dice) se python3 ≥ 3.10 manca; fallisce se il modulo manca.
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), os=require('os'), vm=require('vm'), {spawnSync}=require('child_process');
const ROOT=path.join(__dirname,'..','..'), PYDIR=path.join(ROOT,'scripts','ricetta-py'), MOD=path.join(PYDIR,'acch_sorp.py');
const PY=(()=>{ for (const c of [process.env.PYTHON, 'python3'].filter(Boolean)){ const r=spawnSync(c, ['-c','import sys; print(sys.version_info>=(3,10))'], {encoding:'utf8'}); if (r.status===0 && /True/.test(r.stdout)) return c; } return null; })();
const S=require('../../app/sorption-core.js'), SY=require('../validation/sorption/sintetiche.js'), REF=require('../validation/sorption/kaomi-mesopore-pubblico.json');
const FX=path.join(ROOT,'test','fixtures','sorption'), rd=n=>fs.readFileSync(path.join(FX,n),'utf8');
// i numeri dell'app vengono qui da V8 (Node): log, log10 ed exp di fdlibm, con fma su arm64 (vedi acch_math.py, usa_motore)
const MATH=process.env.ACCH_SORP_MATH || (process.arch==='arm64'?'v8-fma':'v8');   // ACCH_SORP_MATH=libm: solo per diagnosi

// sorption-ui.js in una finestra finta: AcchSorp.csvText e AcchChem.csvText veri, lingua scelta con AcchI18n
function loadUI(){
  const ctx={console, Math, JSON, Object, Array, Number, String, RegExp, Set, Map, WeakMap, Blob:function(){}, SorpCore:S, files:[], AcchI18n:{lang:'it'}, document:{querySelector:()=>null, querySelectorAll:()=>[]}};
  ctx.window=ctx; vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(ROOT,'app','sorption-ui.js'),'utf8'), ctx, {filename:'app/sorption-ui.js'}); return ctx;
}

// ---------------- casi di fisisorbimento ----------------
const N2={gas:'N2', gasKey:'N2', T:77.35};
const isoOf=(x, n, meta)=>S.buildIso({x, n, nUnit:'cm3STP/g', meta:Object.assign({}, N2, meta||{})});
function sorpCases(){
  const C=[], add=(name, iso, sorp, ref)=>C.push({name, iso, sorp:sorp||null, ref:ref||null});
  const fx={}; for (const n of ['kaomi-tabella-en.csv','kaomi-tabella-it.txt','kaomi-assoluta.csv','kaomi-mmol-kpa.txt','kaomi-report-testo.txt','asiqwin-grezzo.txt','isoterma.aif','co2-273K.csv','co2-298K.csv']){ const r=S.parseSorption(rd(n), n); assert.ok(r && r.iso, n); fx[n]=r.iso; add(n, r.iso); }
  const K=S.parseKernel(rd('kernel-utente.csv'), 'kernel-utente.csv'); assert.ok(!K.err, K.err);
  // il report pubblico di Kaomi (dati pubblici, ricopiati nel JSON di validazione)
  const kaomi=isoOf(REF.isotherm.map(r=>r[2]), REF.isotherm.map(r=>r[4]), {thick:'carbon-black', mass_g:REF.header.mass_g, software:REF.header.software, instrBET:{x0:REF.bet.x[0], x1:REF.bet.x[REF.bet.x.length-1]}});
  add('kaomi-pubblico', kaomi); add('kaomi-pubblico+iupac', kaomi, {over:{stp:'iupac'}});
  // sintetiche: mesoporosa con isteresi, microporosa, BET esatta, Kr, CO₂, gas sconosciuto, poca massa nella cella
  const xa=SY.grid(0.005, 0.995, 45), xd=SY.grid(0.99, 0.12, 35);
  const meso=isoOf(xa.concat(xd), xa.map(x=>SY.meso(x)).concat(xd.map(x=>SY.meso(x,{},true))), {mass_g:0.01});
  const xm=SY.grid(1e-6, 0.99, 60, true), micro=isoOf(xm, xm.map(x=>SY.micro(x)), {mass_g:0.2});
  const xb=SY.grid(0.02, 0.4, 20), betX=isoOf(xb, xb.map(x=>SY.betN(x, 30, 80)));
  const tse=(()=>{ const a=SY.grid(0.01,0.98,40), d=SY.grid(0.98,0.1,40); return isoOf(a.concat(d), a.map(x=>SY.meso(x,{xa:0.8})).concat(d.map(x=>x<0.45?SY.meso(x,{xa:0.8}):SY.meso(x,{xa:0.8})+120/(1+Math.exp(-(x-0.455)/0.004))))); })();
  const kr=isoOf(xb, xb.map(x=>SY.betN(x, 0.02, 50)), {gas:'Krypton', gasKey:null, T:77.35, mass_g:0.5});
  const unk=isoOf(xb, xb.map(x=>SY.betN(x, 10, 60)), {gas:'Xenon', gasKey:null, T:165});
  const lowC=isoOf(xa, xa.map(x=>SY.betN(Math.min(x,0.9), 20, 1.5)));
  // per i rami del tipo IUPAC e degli avvisi: I(a), I(b), IV(b), H1, non monotona, isteresi aperta, chiusura forzata, pochi punti
  const lang=(K)=>isoOf(xm, xm.map(x=>SY.micro(x,{K, ext:1e-9})));
  const xs=SY.grid(0.01, 0.97, 40), xr=SY.grid(0.96, 0.05, 30), mesoK={k:0.3, xa:0.7, xd:0.6, w:0.01};
  const ivb=isoOf(xs.concat(xr), xs.map(x=>SY.meso(x)).concat(xr.map(x=>SY.meso(x))));
  const h1=isoOf(xs.concat(xr), xs.map(x=>SY.meso(x,mesoK)).concat(xr.map(x=>SY.meso(x,mesoK,true))));
  const mono=isoOf(xb, xb.map((x,i)=>SY.betN(x, 30, 80)*(i===7?0.9:1)));
  const open=isoOf(xs.concat(xr), xs.map(x=>SY.meso(x)).concat(xr.map(x=>SY.meso(x,{},true)+25)));
  const two=isoOf([0.1,0.2,0.15,0.05], [10,12,11,9]);
  add('I(a)', lang(4000)); add('I(b)', lang(50)); add('IV(b)', ivb); add('H1', h1); add('non monotona', mono); add('isteresi aperta', open); add('due punti', two);
  add('tse ramo des', tse, S.cleanOpt('sorp', {bjhBranch:'des'})); add('BET utente vuoto', betX, S.cleanOpt('sorp', {betRange:[0.9,0.95]}));
  add('alfa senza riferimento valido', meso, S.cleanOpt('sorp', {alphaRefKey:'rif', alphaS:10}), {name:'rif', iso:two});
  add('meso', meso); add('micro', micro); add('bet-esatta', betX); add('tse', tse); add('kr', kr); add('ignoto', unk); add('C-basso', lowC);
  // opzioni dell'utente (f.an.sorp ripulite da cleanOpt, come le salva l'app)
  const opts=[
    {betRange:[0.05,0.3], langRange:[0.02,0.2], tRange:{x:[0.3,0.6]}, tModel:'halsey', tpvX:0.95, tpvMode:'interp', bjhBranch:'ads', bjhThick:'kjs', drRange:[1e-5,0.2]},
    {over:{gas:'Ar', sigma:0.142, T:87.3, rhoL:1.395, gamma:12.53, M:39.948, theta:10, thick:'carbon-black', stp:'iupac'}, bjhBranch:'des', tModel:'kjs', tpvX:0.9},
    {kernel:K, lambda:0}, {kernel:K, lambda:0.01, tModel:'carbon-black', bjhThick:'halsey'},
    {alphaRefKey:'rif', alphaS:25, kernel:K, lambda:0.5, betRange:[0.1,0.25]},
    {over:{thick:'de-boer', theta:30}, betRange:[0.001,0.02], langRange:[0.3,0.9], drRange:[0.001,0.5]}
  ];
  for (const [nm, iso] of [['meso',meso],['micro',micro],['kaomi-pubblico',kaomi],['kaomi-tabella-en.csv',fx['kaomi-tabella-en.csv']],['co2-273K.csv',fx['co2-273K.csv']],['asiqwin-grezzo.txt',fx['asiqwin-grezzo.txt']],['tse',tse]])
    opts.forEach((o,i)=>add(nm+' opzioni '+(i+1), iso, S.cleanOpt('sorp', o), o.alphaRefKey?{name:'rif', iso:betX}:null));
  return C;
}

// ---------------- casi di chemisorbimento ----------------
function chemCases(){
  const C=[], add=(name, chem, o)=>C.push({name, chem, o:o||null});
  const fx={}; for (const n of ['tpr-sintetico.txt','tpd-nh3-5.txt','tpd-nh3-10.txt','tpd-nh3-15.txt','tpd-nh3-20.txt','impulsi-co.txt','statico-h2.txt']){ const r=S.parseChem(rd(n), n); assert.ok(r && r.chem, n); fx[n]=r.chem; add(n, r.chem); }
  const tpr=fx['tpr-sintetico.txt'], pulse=fx['impulsi-co.txt'], stat=fx['statico-h2.txt'], tpd=fx['tpd-nh3-10.txt'];
  add('tpr fattore', tpr, {factor:0.0123, mass_g:0.05, theo:40, coldTrap:true, S0:50, flow:30, frac:0.05, nu:1e12});
  add('tpr Monti–Baiker fuori', tpr, {factor:2, S0:5000, flow:30, frac:0.05, beta:5});
  add('tpd senza tempo', {kind:'TPD', t:null, T:tpd.T.slice(), s:tpd.s.slice(), meta:{ramp:10}}, {factor:1e-3});
  add('tpd senza tempo né rampa', {kind:'TPx', t:null, T:tpd.T.slice(), s:tpd.s.map((v,i)=>v+0.002*i), meta:{}});
  add('tpx corta', {kind:'TPO', t:null, T:[1,2,3], s:[1,2,3], meta:{}});
  add('impulsi opzioni', pulse, {nSat:2, tol:0.001, loopVol:0.5, loopT:300, p:100, frac:0.1, mass_g:0.2, disp:{loading:2, SF:2, shape:5, metal:'Pd'}});
  add('impulsi nSat frazionario', pulse, {nSat:2.5, tol:0.05}); add('impulsi non saturati', pulse, {tol:1e-5, nSat:0.5});
  add('rampa non lineare', Object.assign({}, tpr, {t:tpr.t.map(v=>v*v/tpr.t[tpr.t.length-1])}), {factor:0.01});
  add('statico intervallo vuoto', stat, {pa:1000, pb:2000});
  add('impulsi senza loop', Object.assign({}, pulse, {meta:Object.assign({}, pulse.meta, {loopVol:null})}));
  add('statico intervallo', stat, {pa:10, pb:45, disp:{loading:0.5, SF:1, M:190, rho:21, am:0.081}});
  add('statico senza ripetuta', Object.assign({}, stat, {rep:null}));
  add('statico dispersione oltre 100%', stat, {disp:{loading:0.01, SF:2}});
  add('statico metallo ignoto', Object.assign({}, stat, {meta:Object.assign({}, stat.meta, {metal:null})}), {disp:{loading:1, SF:1}});
  return C;
}

// ---------------- appiattimento dei risultati per i confronti numerici ----------------
function flat(o, p, out, seen){ out=out||{}; seen=seen||new Set(); p=p||'';
  if (typeof o==='number'){ out[p]=Number.isFinite(o)?o:String(o); return out; } if (typeof o==='string'){ out[p]='s:'+o; return out; }
  if (!o || typeof o!=='object' || seen.has(o)) return out; seen.add(o);
  if (Array.isArray(o)) o.forEach((v,i)=>flat(v, p+'['+i+']', out, seen)); else for (const k of Object.keys(o)) flat(o[k], p+'.'+k, out, seen); return out; }
const PYFLAT=`
def _flat(o, p='', out=None, seen=None):
    out = {} if out is None else out
    seen = set() if seen is None else seen
    if isinstance(o, bool) or o is None:
        return out
    if isinstance(o, (int, float)):
        out[p] = o if math.isfinite(o) else js_str(float(o))
        return out
    if isinstance(o, str):
        out[p] = 's:' + o
        return out
    if id(o) in seen:
        return out
    seen.add(id(o))
    if isinstance(o, (list, tuple)):
        for i, v in enumerate(o):
            _flat(v, p + '[' + str(i) + ']', out, seen)
    elif isinstance(o, dict):
        for k, v in o.items():
            _flat(v, p + '.' + str(k), out, seen)
    return out
`;

function runPy(cases, dir){
  const fin=path.join(dir,'casi.json'), prog=path.join(dir,'p.py');
  fs.writeFileSync(fin, JSON.stringify(cases));
  fs.writeFileSync(prog, fs.readFileSync(path.join(PYDIR,'acch_ricetta.py'),'utf8')+'\n'+fs.readFileSync(path.join(PYDIR,'acch_math.py'),'utf8')+'\n'+fs.readFileSync(MOD,'utf8')+'\n'+PYFLAT+`
usa_motore(${JSON.stringify(MATH==='libm'?'jsc':MATH)})
_C = json.load(open(${JSON.stringify(fin)}, encoding='utf-8'))
_out = []
for c in _C:
    if c['tipo'] == 'sorp':
        so = c.get('sorp') or {}
        over = so.get('over') or {}
        ar = {'iso': c['ref'], 'S': so.get('alphaS')} if c.get('ref') else None
        r = {'it': sorp_csv_text(c['iso'], over, so, ar, None, False), 'en': sorp_csv_text(c['iso'], over, so, ar, None, True),
             'flat': _flat(sorp_analyze(c['iso'], over, so, ar, None)), 'name': [sorp_csv_name(c['name'], False), sorp_csv_name(c['name'], True)]}
    elif c['tipo'] == 'chem':
        cc, A = chem_analyze(c['chem'], c.get('o'))
        r = {'it': chem_csv_text(c['chem'], c.get('o'), False), 'en': chem_csv_text(c['chem'], c.get('o'), True), 'flat': _flat(A),
             'name': [chem_csv_name(c['name'], False), chem_csv_name(c['name'], True)]}
    else:
        r = {'flat': _flat({'kiss': ch_kissinger(c['list']), 'tcd': ch_tcd_factor(c['tcd'])})}
    _out.append(r)
sys.stdout.write(json.dumps(_out, ensure_ascii=False))
`);
  const r=spawnSync(PY, ['-I', prog], {encoding:'utf8', maxBuffer:1<<28}); assert.strictEqual(r.status, 0, r.stderr); return JSON.parse(r.stdout);
}

// confronto dei numeri: 1e-9 relativo; LRE (cifre corrette) per il rapporto
function compare(name, js, py, acc){
  for (const k of Object.keys(js)){ if (!(k in py)){ acc.missing.push(name+' '+k); continue; } const a=js[k], b=py[k]; acc.n++;
    if (typeof a==='number' && typeof b==='number'){ if (a===b){ acc.same++; continue; } const d=Math.abs(a-b)/Math.max(Math.abs(a), 1e-300), lre=-Math.log10(d); if (lre<acc.lre){ acc.lre=lre; acc.worst=`${name} ${k}: ${b} invece di ${a}`; } if (!(d<=1e-9)) acc.bad.push(`${name} ${k}: ${b} invece di ${a}`); }
    else if (a!==b) acc.bad.push(`${name} ${k}: ${JSON.stringify(b)} invece di ${JSON.stringify(a)}`); else acc.same++; } }

test('il modulo Python della parte «sorp» esiste e si concatena dopo acch_ricetta.py', ()=>{
  assert.ok(fs.existsSync(MOD), 'manca scripts/ricetta-py/acch_sorp.py'); const s=fs.readFileSync(MOD,'utf8');
  for (const f of ['def sorp_csv_text(', 'def chem_csv_text(', 'def sorp_csv_name(', 'def chem_csv_name(', 'def sp_analyze(', 'def ch_analyze(']) assert.ok(s.includes(f), f);
  assert.ok(!/^\s*(import|from)\s+acch_ricetta/m.test(s), 'niente import di acch_ricetta: il modulo si concatena');
  // nessuna funzione di acch_ricetta.py ridefinita (BET/BJH restano quelle)
  const base=new Set([...fs.readFileSync(path.join(PYDIR,'acch_ricetta.py'),'utf8').matchAll(/^def (\w+)\(|^([A-Z_][A-Z0-9_]*) =/gm)].map(m=>m[1]||m[2]));
  const dup=[...s.matchAll(/^def (\w+)\(|^([A-Z_][A-Z0-9_]*) =/gm)].map(m=>m[1]||m[2]).filter(n=>base.has(n)); assert.deepStrictEqual(dup, []);
});

test(`Math.log, log10, exp e pow di V8 in Python bit per bit (modo ${MATH})`, {skip:!PY && 'python3 ≥ 3.10 non trovato: confronto SALTATO'}, ()=>{
  assert.ok(fs.existsSync(MOD), 'manca scripts/ricetta-py/acch_sorp.py');
  let s=4242; const rnd=()=>{ s=(s*1103515245+12345)%2147483648; return s/2147483648; }, V=[0,-0,1,-1,2,0.5,Infinity,-Infinity,NaN,5e-324,1e-310,1.7976931348623157e308,Math.E,10,0.1];
  for (let i=0;i<40000;i++) V.push(rnd()*Math.pow(10, Math.floor(rnd()*40)-20)*(i%5?1:-1), (rnd()-0.5)*Math.pow(10, Math.floor(rnd()*5)-1));
  const enc=v=>Object.is(v,-0)?'-0':Number.isFinite(v)?v:String(v), want=[]; for (let i=0;i+1<V.length;i+=2){ const a=V[i], b=V[i+1]; want.push([Math.log(a), Math.log10(a), Math.exp(b), Math.exp(b*30), Math.pow(Math.abs(a), b), Math.pow(a, b)].map(enc)); }
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'acch-py-sorp-')); try{ fs.writeFileSync(path.join(d,'v.json'), JSON.stringify(V.map(enc)));
    fs.writeFileSync(path.join(d,'p.py'), fs.readFileSync(path.join(PYDIR,'acch_ricetta.py'),'utf8')+'\n'+fs.readFileSync(path.join(PYDIR,'acch_math.py'),'utf8')+'\n'+fs.readFileSync(MOD,'utf8')+`
usa_motore(${JSON.stringify(MATH==='libm'?'jsc':MATH)})
_P = lambda v: -0.0 if v == '-0' else float(v)
_V = [_P(v) for v in json.load(open(${JSON.stringify(path.join(d,'v.json'))}))]
_E = lambda v: '-0' if (v == 0 and math.copysign(1, v) < 0) else (v if math.isfinite(v) else js_str(v))
print(json.dumps([[_E(f) for f in (m_log(_V[i]), m_log10(_V[i]), m_exp(_V[i + 1]), m_exp(_V[i + 1] * 30), m_pow(abs(_V[i]), _V[i + 1]), m_pow(_V[i], _V[i + 1]))] for i in range(0, len(_V) - 1, 2)]))
`);
    const r=spawnSync(PY, ['-I', path.join(d,'p.py')], {encoding:'utf8', maxBuffer:1<<27}); assert.strictEqual(r.status, 0, r.stderr);
    const got=JSON.parse(r.stdout), bad=[]; got.forEach((g,i)=>g.forEach((x,k)=>{ if (x!==want[i][k]) bad.push(`[${k}] ${V[2*i]}, ${V[2*i+1]}: ${x} invece di ${want[i][k]}`); }));
    console.log(`# funzioni matematiche: ${got.length*6} valori, ${bad.length} diversi`); assert.deepStrictEqual(bad.slice(0,10), []); } finally { fs.rmSync(d,{recursive:true,force:true}); }
});

test('fisisorbimento e chemisorbimento: CSV identici a AcchSorp.csvText e AcchChem.csvText (IT ed EN), numeri entro 1e-9', {skip:!PY && 'python3 ≥ 3.10 non trovato: confronto SALTATO'}, ()=>{
  assert.ok(fs.existsSync(MOD), 'manca scripts/ricetta-py/acch_sorp.py');
  const ui=loadUI(), SC=sorpCases(), CC=chemCases(), cases=[], want=[];
  for (const c of SC){ const mk=()=>({name:c.name, title:c.name, iso:c.iso, an:c.sorp?{sorp:JSON.parse(JSON.stringify(c.sorp))}:null});
    ui.files=c.ref?[{name:c.ref.name, iso:c.ref.iso}]:[];
    const r={}; for (const lang of ['it','en']){ ui.AcchI18n.lang=lang; const f=mk(); r[lang]=ui.AcchSorp.csvText(f); r['name_'+lang]=ui.AcchSorp.csvName(f); r.flat=flat(f._sorpRes); }
    cases.push({tipo:'sorp', name:c.name, iso:c.iso, sorp:c.sorp, ref:c.ref&&c.ref.iso}); want.push(r); }
  for (const c of CC){ const mk=()=>({name:c.name, chem:c.chem, an:c.o?{chem:JSON.parse(JSON.stringify(c.o))}:null});
    const r={}; for (const lang of ['it','en']){ ui.AcchI18n.lang=lang; const f=mk(); r[lang]=ui.AcchChem.csvText(f); r['name_'+lang]=ui.AcchChem.csvName(f); r.flat=flat(f._chemRes); }
    cases.push({tipo:'chem', name:c.name, chem:c.chem, o:c.o}); want.push(r); }
  // Kissinger e fattore TCD (usati dalla scheda, non dalla tabella): solo numeri
  const kl=['tpd-nh3-5.txt','tpd-nh3-10.txt','tpd-nh3-15.txt','tpd-nh3-20.txt'].map(n=>{ const A=S.chemAnalyze(S.parseChem(rd(n)).chem, {}); return {beta:A.tpx.beta, Tm:A.tpx.Tm}; }), tcd={mass_mg:12.5, area:3.2e4};
  cases.push({tipo:'num', list:kl, tcd}); want.push({flat:flat({kiss:S.kissinger(kl), tcd:S.tcdFactor(tcd)})});
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'acch-py-sorp-')); let got; try{ got=runPy(cases, d); } finally { fs.rmSync(d,{recursive:true,force:true}); }
  const acc={n:0, same:0, lre:15, worst:'', bad:[], missing:[]}, txt=[];
  got.forEach((g,i)=>{ const w=want[i], nm=cases[i].name||'numeri';
    if (w.it!=null){ for (const lang of ['it','en']) if (g[lang]!==w[lang]){ const a=w[lang].split('\r\n'), b=g[lang].split('\r\n'), j=a.findIndex((l,k)=>l!==b[k]); txt.push(`${nm} [${lang}] riga ${j+1}:\n  app:    ${a[j]}\n  python: ${b[j]}`); }
      assert.deepStrictEqual(g.name, [w.name_it, w.name_en], nm+': nome del file'); assert.ok(w.it.endsWith('\r\n') && w.it.startsWith('\ufeff')); }
    compare(nm, w.flat, g.flat, acc); });
  const nRows=want.filter(w=>w.it).reduce((s,w)=>s+w.it.split('\r\n').length+w.en.split('\r\n').length, 0);
  console.log(`# sorp: ${cases.length} casi, ${nRows} righe di CSV confrontate; ${acc.n} valori dei risultati (${acc.same} identici bit per bit), LRE minimo ${acc.lre>=15?'≥ 15 (tutti identici)':acc.lre.toFixed(2)+' — '+acc.worst}; risultati senza corrispondente in Python: ${acc.missing.length}`);
  assert.deepStrictEqual(txt.slice(0,5), [], 'CSV diversi');
  assert.deepStrictEqual(acc.bad.slice(0,10), [], 'numeri diversi oltre 1e-9');
  assert.deepStrictEqual(acc.missing.slice(0,10), [], 'risultati dell\'app senza corrispondente in Python');
});

// JavaScriptCore (desktop Tauri su macOS, Safari) con osascript -l JavaScript: la sonda di acch_math sceglie «jsc» e i CSV coincidono
const JSC=process.platform==='darwin' && spawnSync('osascript', ['-l','JavaScript','-e','1+1'], {encoding:'utf8'}).stdout.trim()==='2';
test('fisisorbimento in JavaScriptCore: stessi CSV con il motore «jsc» scelto dalla sonda di acch_math', {skip:(!PY || !JSC) && 'python3 o JavaScriptCore (osascript) non disponibili: SALTATO', timeout:600000}, ()=>{
  const want=['meso','micro','kaomi-pubblico','tse','meso opzioni 1','meso opzioni 2','micro opzioni 6','kaomi-pubblico opzioni 1'];
  const SC=sorpCases().filter(c=>want.includes(c.name)); assert.strictEqual(SC.length, want.length);
  const ser=v=>JSON.stringify(v, (k,x)=>x instanceof Float64Array?{__f64:Array.from(x)}:x);
  const sonda=/SONDA_JS = r'''([\s\S]*?)'''/.exec(fs.readFileSync(path.join(PYDIR,'acch_math.py'),'utf8'))[1];
  const prog=`var window=this; var document={querySelector:function(){return null}, querySelectorAll:function(){return []}}; var Blob=function(){}; var files=[]; var AcchI18n={lang:'it'};
    ${fs.readFileSync(path.join(ROOT,'app','sorption-core.js'),'utf8')}
    ;var SorpCore=this.SorpCore;
    ${fs.readFileSync(path.join(ROOT,'app','sorption-ui.js'),'utf8')}
    ${sonda}
    var CASI=JSON.parse(${JSON.stringify(ser(SC))}, function(k,x){ return x && x.__f64 ? Float64Array.from(x.__f64) : x; });
    var OUT=CASI.map(function(c){ var r={}; ['it','en'].forEach(function(lang){ AcchI18n.lang=lang; files.length=0; if (c.ref) files.push({name:c.ref.name, iso:c.ref.iso});
      r[lang]=AcchSorp.csvText({name:c.name, title:c.name, iso:c.iso, an:c.sorp?{sorp:JSON.parse(JSON.stringify(c.sorp))}:null}); }); return r; });
    JSON.stringify({out:OUT, sonda:acchSondaMath()});`;
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'acch-jsc-sorp-'));
  try{ fs.writeFileSync(path.join(d,'p.js'), prog); const r=spawnSync('osascript', ['-l','JavaScript', path.join(d,'p.js')], {encoding:'utf8', maxBuffer:1<<28}); assert.strictEqual(r.status, 0, r.stderr);
    const J=JSON.parse(r.stdout), cases=SC.map(c=>({name:c.name, iso:c.iso, sorp:c.sorp, ref:c.ref&&c.ref.iso}));
    fs.writeFileSync(path.join(d,'casi.json'), JSON.stringify({cases, sonda:J.sonda}));
    fs.writeFileSync(path.join(d,'p.py'), fs.readFileSync(path.join(PYDIR,'acch_ricetta.py'),'utf8')+'\n'+fs.readFileSync(path.join(PYDIR,'acch_math.py'),'utf8')+'\n'+fs.readFileSync(MOD,'utf8')+`
_D = json.load(open(${JSON.stringify(path.join(d,'casi.json'))}, encoding='utf-8'))
_m = imposta_motore(_D['sonda'])
_out = []
for c in _D['cases']:
    so = c.get('sorp') or {}
    over = so.get('over') or {}
    ar = {'iso': c['ref'], 'S': so.get('alphaS')} if c.get('ref') else None
    _out.append({'it': sorp_csv_text(c['iso'], over, so, ar, None, False), 'en': sorp_csv_text(c['iso'], over, so, ar, None, True)})
sys.stdout.write(json.dumps({'motore': _m, 'out': _out}, ensure_ascii=False))
`);
    const p=spawnSync(PY, ['-I', path.join(d,'p.py')], {encoding:'utf8', maxBuffer:1<<28}); assert.strictEqual(p.status, 0, p.stderr);
    const G=JSON.parse(p.stdout), bad=[]; let rows=0;
    J.out.forEach((w,i)=>{ for (const lang of ['it','en']){ rows+=w[lang].split('\r\n').length; if (G.out[i][lang]!==w[lang]){ const a=w[lang].split('\r\n'), b=G.out[i][lang].split('\r\n'), j=a.findIndex((l,k)=>l!==b[k]); bad.push(`${SC[i].name} [${lang}] riga ${j+1}: ${b[j]} invece di ${a[j]}`); } } });
    console.log(`# sorp in JavaScriptCore: motore ${G.motore}, ${SC.length} casi, ${rows} righe di CSV, ${bad.length} diverse`);
    assert.strictEqual(G.motore, 'jsc'); assert.deepStrictEqual(bad.slice(0,5), []);
  } finally { fs.rmSync(d,{recursive:true,force:true}); }
});
