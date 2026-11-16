// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I12, ricetta Python, parte «libreria»: concentrazioni HPLC dalla taratura salvata (app/hplc-stored-cal.js, app/library.js,
// app/library-ui.js) trascritte in scripts/ricetta-py/acch_libreria.py. Casi SINTETICI con semi fissi:
//  1. quantify, incertezza, testi di stato e avvisi su centinaia di casi casuali e su quelli delle prove T1;
//  2. aiuti (areaFactor, days, chartCheck, instrumentCompare, channelCompare, matchEntries);
//  3. il file concentrazioni_da_libreria.csv prodotto da library-ui.js nella pagina (caricata in vm con il nucleo di index.html)
//     contro library_rows(input) di Python, in italiano e in inglese: testo identico, numeri entro 1e-9 relativo.
// I confronti con Python si saltano (e lo si dice) se python3 ≥ 3.10 manca.
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), os=require('os'), vm=require('vm'), {spawnSync}=require('child_process');
const ROOT=path.join(__dirname,'..','..');
const PYSRC=path.join(ROOT,'scripts','ricetta-py','acch_ricetta.py'), PYLIB=path.join(ROOT,'scripts','ricetta-py','acch_libreria.py');
const PY=(()=>{ for (const c of [process.env.PYTHON, 'python3'].filter(Boolean)){ const r=spawnSync(c, ['-c','import sys; print(sys.version_info>=(3,10))'], {encoding:'utf8'}); if (r.status===0 && /True/.test(r.stdout)) return c; } return null; })();
if (!PY) console.log('# python3 ≥ 3.10 non trovato: confronti con Python SALTATI');

// numeri non finiti nel JSON come testo, in tutte e due le direzioni
const enc=v=>JSON.stringify(v, (k,x)=>typeof x==='number' && !Number.isFinite(x) ? (Number.isNaN(x)?'NaN':x>0?'Infinity':'-Infinity') : x);
const PY_TAIL=`
import json as _j
def _enc(v):
    if isinstance(v, float) and not math.isfinite(v):
        return 'NaN' if v != v else ('Infinity' if v > 0 else '-Infinity')
    if isinstance(v, dict):
        return {k: _enc(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_enc(x) for x in v]
    return v
def _dec(v):
    if isinstance(v, str) and v in ('NaN', 'Infinity', '-Infinity'):
        return float(v.replace('Infinity', 'inf'))
    if isinstance(v, dict):
        return {k: _dec(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_dec(x) for x in v]
    return v
`;
function runPy(body, data){
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'acch-pylib-'));
  try{ fs.writeFileSync(path.join(d,'in.json'), enc(data));
    const prog=fs.readFileSync(PYSRC,'utf8')+'\n'+fs.readFileSync(path.join(path.dirname(PYSRC),'acch_math.py'),'utf8')+'\n'+fs.readFileSync(PYLIB,'utf8')+`\nusa_motore('v8-fma' if ${JSON.stringify(process.arch)}=='arm64' else 'v8')\n`+PY_TAIL+`\nIN=_j.load(open(${JSON.stringify(path.join(d,'in.json'))}, encoding='utf-8'))\nIN=_dec(IN)\n`+body;
    fs.writeFileSync(path.join(d,'p.py'), prog);
    const r=spawnSync(PY, ['-I', path.join(d,'p.py')], {encoding:'utf8', maxBuffer:1<<28});
    assert.strictEqual(r.status, 0, r.stderr);
    return JSON.parse(r.stdout); }
  finally { fs.rmSync(d,{recursive:true,force:true}); } }

// confronto: testi identici, numeri entro 1e-9 relativo; null, undefined e chiave assente coincidono
let LRE_MIN=Infinity, NNUM=0;
const lre=(a,b)=>{ if (a===b) return 15; const d=Math.abs(a-b), s=Math.abs(b); return Math.min(15, s===0 ? -Math.log10(d) : -Math.log10(d/s)); };
const num=v=>typeof v==='number' ? v : v==='NaN' ? NaN : v==='Infinity' ? Infinity : v==='-Infinity' ? -Infinity : v;
function diff(a, b, where, out){
  a=num(a); b=num(b);
  if (a==null && b==null) return;
  if (typeof a==='number' && typeof b==='number'){ NNUM++; if (Number.isNaN(a) && Number.isNaN(b)) return; if (a===b) { LRE_MIN=Math.min(LRE_MIN,15); return; }
    if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a-b)>1e-9*Math.max(Math.abs(a),Math.abs(b))) { out.push(`${where}: ${a} invece di ${b}`); return; }
    LRE_MIN=Math.min(LRE_MIN, lre(a,b)); return; }
  if (Array.isArray(a) || Array.isArray(b)){ if (!Array.isArray(a) || !Array.isArray(b) || a.length!==b.length){ out.push(`${where}: ${JSON.stringify(a)} invece di ${JSON.stringify(b)}`); return; } a.forEach((x,i)=>diff(x, b[i], where+'['+i+']', out)); return; }
  if (a && b && typeof a==='object' && typeof b==='object'){ for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], where+'.'+k, out); return; }
  if (a!==b) out.push(`${where}: ${JSON.stringify(a)} invece di ${JSON.stringify(b)}`);
}

// ---------- parte pura in Node ----------
const Ch=require(path.join(ROOT,'app','channels-core.js')), Q=require(path.join(ROOT,'app','hplc-stored-cal.js')), Lib=require(path.join(ROOT,'app','library.js'));
function rng(seed){ let s=seed>>>0; return ()=>{ s=(Math.imul(s,1103515245)+12345)>>>0; return s/4294967296; }; }

const KEYS=['ok','code','detail','x','U','mode','k','devs','drift','ctrlDiff','age','belowLod','belowLoq','nCtrl','xc','warnings','provenance','profile','thresholds','chart','u'];
const pick=r=>{ const o={}; for (const k of KEYS) if (r[k]!==undefined) o[k]=r[k]; return o; };
const texts=r=>({st_it:Q.statusText(r,'it'), st_en:Q.statusText(r,'en'), w_it:Q.warningTexts(r,'it'), w_en:Q.warningTexts(r,'en'), m_it:Q.modeText(r,'it'), m_en:Q.modeText(r,'en'), p_it:Q.provenanceText(r,'it'), p_en:Q.provenanceText(r,'en'), mk:Q.markText('it')+'|'+Q.markText('en')});
const PY_Q=`
out=[]
for o in IN:
    r = sc_quantify(_floats(o))
    keep = {k: r[k] for k in ${JSON.stringify(KEYS)} if k in r}
    out.append({'r': keep, 't': {'st_it': sc_status_text(r,'it'), 'st_en': sc_status_text(r,'en'), 'w_it': sc_warning_texts(r,'it'), 'w_en': sc_warning_texts(r,'en'),
        'm_it': sc_mode_text(r,'it'), 'm_en': sc_mode_text(r,'en'), 'p_it': sc_provenance_text(r,'it'), 'p_en': sc_provenance_text(r,'en'), 'mk': sc_mark_text('it')+'|'+sc_mark_text('en')}})
print(_j.dumps(_enc(out)))
`;

// casi delle prove T1 (test/unit/taratura-salvata.test.js) e casi casuali che toccano tutti i rami
const CAL={kind:'line', slope:100, intercept:0.4, sa:1.2, syx:2, srel:0.01, n:18, df:16, range:[1,20], date:'2026-10-01', areaUnit:'mAU·min', concUnit:'mg/L', standardLot:'L-7'};
const E0={id:'v1', rev:3, name:'Caffeina', x:3.2, window:0.1, cal:CAL};
const LIB={id:'lib-x', name:'Agilent 1260 Infinity · DAD — alimenti', revision:4, profile:'ricerca', thresholds:{dev:10, diff:5, drift:5}, reminderDays:180, maintenance:[]};
const base=o=>Object.assign({entry:E0, lib:LIB, today:'2026-11-13', y:800, sampleYs:[800]}, o);
function quantCases(){
  const C=[{}, {lib:Object.assign({},LIB,{profile:'esplorativa'})}, {controls:[{nominal:8, y:900}]}, {controls:[{nominal:8, y:800, pos:'open', order:0}, {nominal:8, y:850, pos:'close', order:9}], sampleOrder:4},
    {controls:[{nominal:3, y:300.4}, {nominal:17, y:1700.4*1.07}]}, {check:{channel:{ok:false, detail:'DAD1A, Sig=254 / DAD1A, Sig=220,4'}}}, {check:{method:{ok:false, detail:'B.M / A.M'}}},
    {check:{instrument:{ok:false, detail:'Agilent 1290 / Agilent 1260'}}}, {check:{column:{ok:false, detail:'C18 / Phenyl-Hexyl'}}}, {y:2500},
    {lib:Object.assign({},LIB,{profile:'dosaggio'})}, {lib:Object.assign({},LIB,{profile:'tracce'})}, {lib:Object.assign({},LIB,{profile:'bioanalisi'})},
    {entry:Object.assign({},E0,{chart:[1,1.01,0.99,1,1.005,0.995,1.01,0.99,1,1].map(k=>({k}))}), controls:[{nominal:8, y:(0.4+800)*1.08}]},
    {lib:Object.assign({},LIB,{maintenance:[{date:'2026-10-20', kind:'lampada'}]})}, {normalized:true}, {suitability:false},
    {entry:Object.assign({},E0,{cal:Object.assign({},CAL,{intercept:40, sa:1})}), controls:[{nominal:8, y:840}]}, {controls:[{nominal:8, y:800.4}], sampleYs:[800, 3000]},
    {controls:[{nominal:8, y:800.4, order:0}], sampleOrder:30}, {controls:[{nominal:8, y:800.4, tR:3.5}]}, {entry:Object.assign({},E0,{cal:null})}, {y:NaN}, {y:null},
    {lib:Object.assign({},LIB,{profile:'impurezze'}), entry:Object.assign({},E0,{cal:Object.assign({},CAL,{rrf:0.8})}), activeRF:50},
    {lib:Object.assign({},LIB,{profile:'impurezze'}), entry:Object.assign({},E0,{cal:Object.assign({},CAL,{rrf:0.8})}), activeRF:50, impurityStd:{nominal:2, y:2*0.8*50*1.12}},
    {lib:Object.assign({},LIB,{profile:'impurezze'}), entry:Object.assign({},E0,{cal:Object.assign({},CAL,{rrf:0.8})})}, {lib:Object.assign({},LIB,{profile:'impurezze'})},
    {areaUnitAssumed:true, check:{channel:{ok:true, unverified:['bw','ref']}, method:{ok:true, unverified:true}, column:{ok:true, unverified:true}}},
    {entry:Object.assign({},E0,{cal:Object.assign({},CAL,{date:'2025-01-02'})})}, {entry:Object.assign({},E0,{cal:Object.assign({},CAL,{date:'2026-02-30'})})}, {entry:Object.assign({},E0,{cal:Object.assign({},CAL,{date:''})})},
    {entry:Object.assign({},E0,{cal:Object.assign({},CAL,{syx:null, srel:null, sb:0.9, source:'letteratura'})})}, {entry:Object.assign({},E0,{cal:Object.assign({},CAL,{syx:null, srel:null, sb:null})})},
    {entry:Object.assign({},E0,{cal:Object.assign({},CAL,{range:null, lod:7, loq:9})})}, {entry:Object.assign({},E0,{cal:Object.assign({},CAL,{kind:'rf', intercept:null})})},
    {lib:Object.assign({},LIB,{suitability:[{date:'2026-11-13', ok:true},{date:'2026-11-13', ok:false}]})}, {sr:0.02, srDf:7, uStd:0.01, mk:3}];
  const r=rng(20261114), pk=a=>a[Math.floor(r()*a.length)], U=(a,b)=>a+(b-a)*r();
  for (let i=0;i<500;i++){
    const prof=pk(['ricerca','ricerca','ricerca','esplorativa','impurezze','dosaggio','zzz']);
    const cal={kind:r()<0.1?'rf':'line', slope:U(10,500), intercept:r()<0.3?0:U(-5,15), sa:r()<0.7?U(0.1,4):null, sb:r()<0.5?U(0.1,3):null, syx:r()<0.6?U(0.5,6):null, srel:r()<0.4?U(0.003,0.03):null, srelDf:r()<0.5?Math.floor(U(1,40)):null,
      n:r()<0.6?Math.floor(U(4,20)):null, df:r()<0.4?Math.floor(U(2,40)):null, range:r()<0.85?[U(0.1,3), U(15,60)]:null, lod:r()<0.4?U(0.1,3):null, loq:r()<0.4?U(1,6):null, date:pk(['2026-10-01','2026-05-17','2019-03-31','','2026-11-14']),
      areaUnit:'mAU·min', concUnit:'mg/L', standardLot:pk(['','L-1']), source:pk(['taratura','letteratura']), uStd:r()<0.3?U(0.001,0.02):null, rrf:r()<0.5?U(0.3,2):null, normalized:r()<0.03};
    const e={id:'v'+i, rev:Math.floor(U(1,5)), name:'A'+i, x:U(1,10), window:r()<0.8?U(0.05,0.3):null, column:r()<0.3?'C18':'', cal:r()<0.97?cal:null, chart:r()<0.3?Array.from({length:Math.floor(U(5,25))},()=>({k:U(0.97,1.03)})):[]};
    const lib={id:'L'+i, name:'Lib '+i, revision:Math.floor(U(1,9)), profile:prof, thresholds:r()<0.3?{dev:U(5,15), diff:U(3,8), drift:r()<0.5?null:U(3,8)}:undefined, reminderDays:r()<0.5?180:Math.floor(U(10,400)),
      maintenance:r()<0.1?[{date:'2026-10-15', kind:pk(['lampada','colonna','pompa']), target:pk(['','C18','X'])}]:[], suitability:r()<0.1?[{date:'2026-11-14', ok:r()<0.5}]:[]};
    const xT=U(2,40), y=cal.slope*xT+(cal.intercept||0);
    const nC=pk([0,0,1,1,2,2,3]), ctr=[];
    for (let j=0;j<nC;j++){ const lv=pk([xT, U(1,10), U(20,50)]), nom=r()<0.95?+lv.toPrecision(4):0; ctr.push({nominal:nom, y:(cal.slope*nom+(cal.intercept||0))*U(0.9,1.1), tR:r()<0.5?e.x+U(-0.2,0.2):null, order:r()<0.7?Math.floor(U(0,30)):null, pos:pk([null,'open','close'])}); }
    const sy=r()<0.7?Array.from({length:Math.floor(U(1,6))},()=>cal.slope*U(1,50)):[];
    C.push({entry:e, lib, today:'2026-11-14', y:r()<0.03?null:y, sampleYs:sy, controls:ctr, sampleOrder:r()<0.7?Math.floor(U(0,30)):undefined, normalized:r()<0.03, suitability:pk([undefined,undefined,true,false,null]),
      check:r()<0.2?{channel:{ok:r()<0.6, unverified:r()<0.5?['bw']:[], detail:'a / b'}}:undefined, activeRF:r()<0.5?U(10,100):undefined, impurityStd:r()<0.3?{nominal:U(1,5), y:U(50,300)}:undefined, areaUnitAssumed:r()<0.2});
  }
  return C.map(base);
}

test('il modulo Python della libreria esiste e si unisce ad acch_ricetta.py', ()=>{
  assert.ok(fs.existsSync(PYLIB), 'manca scripts/ricetta-py/acch_libreria.py');
  const s=fs.readFileSync(PYLIB,'utf8'); assert.match(s, /def library_rows\(inp\)/); assert.doesNotMatch(s, /import acch_ricetta|import numpy|import scipy/);
});

test('quantify, incertezza e testi (IT/EN) identici a hplc-stored-cal.js su 540 casi', {skip:!PY}, ()=>{
  const C=quantCases(), want=C.map(o=>{ const r=Q.quantify(o); return {r:JSON.parse(enc(pick(r))), t:texts(r)}; });
  const got=runPy(PY_Q, C), bad=[];
  assert.strictEqual(got.length, want.length);
  got.forEach((g,i)=>{ diff(g.r, want[i].r, `caso ${i} r`, bad); diff(g.t, want[i].t, `caso ${i} testi`, bad); });
  const codes={}; want.forEach(w=>{ const k=w.r.code+(w.r.mode?'/'+w.r.mode:''); codes[k]=(codes[k]||0)+1; });
  console.log('# esiti coperti:', JSON.stringify(codes));
  assert.deepStrictEqual(bad.slice(0,15), []);
  for (const c of ['ok/nocontrol','ok/1ctrl','ok/2ctrl','ok/rrf','need-two','drift','incoherent','ctrl-dev','chart','range','profile','maintenance','suitability','frequency','ctrl-window','no-control','no-rrf','no-active-rf','no-calibration','no-response','normalized','channel'])
    assert.ok(Object.keys(codes).some(k=>k===c || k.startsWith(c+'/')), 'esito non coperto: '+c);
});

test('aiuti: areaFactor, days, chartCheck, interceptNegligible, instrumentCompare, channelCompare, matchEntries', {skip:!PY}, ()=>{
  const units=['mAU·min','mAU·s','mAU*s','mAU × min','mau min','counts·nm','mAU','','pA·s','mAU·sec','u·x','A·min'];
  const AF=[]; for (const a of units) for (const b of units) AF.push([a,b]);
  const DAYS=[['2026-10-01','2026-11-14'],['2026-02-30','2026-03-02'],['2026-02-28','2026-13-01'],['2024-02-29','2026-02-28'],['0001-01-01','2026-11-14'],['','2026-11-14'],['2026-01-31T10:00','2026-02-01']];
  const r=rng(7), CK=Array.from({length:80},(_,i)=>Array.from({length:i%25},()=>1+(r()-0.5)*0.06+(r()<0.1?0.2:0)));
  const IN=[{intercept:0},{intercept:3, sa:2, df:10},{intercept:3, sa:1, n:6},{intercept:3},{intercept:30, sa:1}].map((c,i)=>[c, i===3?100:i===4?null:5000]);
  const INS=[{brand:'Agilent', model:'1260 Infinity', detector:'DAD G4212B'},{brand:'Agilent', model:'1260 Infinity II', detector:'DAD G7115A'},{brand:'Agilent', model:'1290 Infinity', detector:'DAD'},{brand:'agilent', model:'1260', detector:'VWD'},
    {model:'', detector:''},{brand:'Waters', model:'Alliance e2695', detector:'PDA', serial:'X1'},{brand:'Waters', model:'Alliance e2695', detector:'PDA', serial:'X2'},{brand:'Ägilent', model:'1260 Infinity', detector:'DAD G4212B', serial:'S 1'}];
  const IC=[]; for (const a of INS) for (const b of INS) IC.push([a,b]);
  const CHS=['DAD1A 254/4 nm ref 360/100 nm','DAD1 A, Sig=254,4 Ref=360,100','DAD1A 254 nm','DAD 254/4 nm','DAD1B 254/4 nm','VWD1A 220 nm','FLD1A ex 230 nm em 330 nm','UV 280/4 nm extracted','DAD1A 254/4 nm ref off','Det A-Ch1 254 nm','PDA Ch1 254nm@1.2nm','RID1A','', 'DAD1A 254.4/4 nm'];
  const tab={}; for (const s of CHS){ const p=Lib.parseChannel(s); tab[s]=p; if (p){ const t=Lib.channelText(p); tab[t]=Lib.parseChannel(t); } }
  const CC=[]; for (const a of CHS) for (const b of CHS) CC.push([a,b]);
  const lib={entries:[{id:'a', name:'A', x:3, window:0.1},{id:'b', name:'B', x:3.05, window:0.2},{id:'c', name:'C', x:6, window:null, rrt:2, rrtRef:'a'},{id:'d', name:'D', x:null},{id:'e', name:'E', x:8, deleted:true},{id:'f', name:'F', x:9, window:0.05}]};
  const PK=Array.from({length:40},()=>Array.from({length:Math.floor(r()*8)},()=>+(2.8+r()*6.5).toFixed(3)).concat(r()<0.5?[3.02,3.02]:[]));
  const want={af:AF.map(([a,b])=>Q.areaFactor(a,b)), days:DAYS.map(([a,b])=>Q.days(a,b)), ck:CK.map(k=>Q.chartCheck(k)), inn:IN.map(([c,y])=>Q.interceptNegligible(c,y)), ic:IC.map(([a,b])=>Lib.instrumentCompare(a,b)), it:INS.map(i=>Lib.instrumentText(i)),
    cc:CC.map(([a,b])=>Lib.channelCompare(a,b)), ct:CHS.map(s=>Lib.channelText(s)), me:PK.map(p=>Lib.matchEntries(lib, p, {defaultWindow:0.1}).map(m=>({id:m.entry.id, x:m.x, expected:m.expected, found:m.found, byRrt:m.byRrt}))),
    fd:['2026-11-14','x',null,'2026-02-30T1'].map(Q.fmtDate), nt:['Ägilent  Ïnfinity-II','1260/DAD','',null].map(Lib.normTxt)};
  const got=runPy(`
I=_floats(IN)
out={'af': [area_factor(a,b) for a,b in I['AF']], 'days': [sc_days(a,b) for a,b in I['DAYS']], 'ck': [chart_check(k) for k in I['CK']], 'inn': [intercept_negligible(c,y) for c,y in I['IN']],
  'ic': [instrument_compare(a,b) for a,b in I['IC']], 'it': [instrument_text(i) for i in I['INS']], 'cc': [channel_compare(a,b,I['tab']) for a,b in I['CC']], 'ct': [channel_text(s,I['tab']) for s in I['CHS']],
  'me': [[{'id': m['entry']['id'], 'x': m['x'], 'expected': m['expected'], 'found': m['found'], 'byRrt': m['byRrt']} for m in match_entries(I['lib'], p, {'defaultWindow': 0.1})] for p in I['PK']],
  'fd': [sc_fmt_date(d) for d in ['2026-11-14','x',None,'2026-02-30T1']], 'nt': [norm_txt(s) for s in ['Ägilent  Ïnfinity-II','1260/DAD','',None]]}
print(_j.dumps(_enc(out)))
`, {AF, DAYS, CK, IN, IC, INS, CC, CHS, tab, lib, PK}), bad=[];
  diff(got, JSON.parse(enc(want)), 'aiuti', bad);
  assert.deepStrictEqual(bad.slice(0,15), []);
});

// ---------- la pagina: library-ui.js in vm con il nucleo di index.html ----------
function loadPage(){
  const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8'), core=html.slice(html.indexOf('/*CORE-START*/'), html.indexOf('/*CORE-END*/'));
  const grab=name=>{ const m=new RegExp('\\nfunction '+name+'\\([^)]*\\)\\{[\\s\\S]*?\\n\\}').exec(html); if (!m) throw new Error('funzione non trovata in index.html: '+name); return m[0]; };
  const el={textContent:'', hidden:false, appendChild(){}, set innerHTML(v){}};
  const doc={querySelector:()=>null, querySelectorAll:()=>[], createElement:()=>Object.assign({}, el), head:el, body:el, readyState:'complete', addEventListener(){}};
  const ctx={console, setTimeout, clearTimeout, document:doc, AcchI18n:{lang:'it'}, files:[], S:{conv:{hplc:'orig', ftir:'orig'}}, __libs:[], __mv:{}};
  ctx.self=ctx; ctx.window=ctx;
  ctx.AcchHost={libs:{kind:'web', list:()=>Promise.resolve(ctx.__libs)}, store:{getItem:()=>null, setItem(){}}};
  vm.createContext(ctx);
  for (const f of ['sorption-core.js','channels-core.js','library.js','hplc-stored-cal.js']) vm.runInContext(fs.readFileSync(path.join(ROOT,'app',f),'utf8'), ctx, {filename:'app/'+f});
  vm.runInContext(core, ctx, {filename:'index.html#core'});
  vm.runInContext(grab('upData')+'\n'+grab('mvValue'), ctx, {filename:'index.html#mv'});
  // funzioni della pagina che la sezione usa: i dati elaborati e i picchi vengono dal caso sintetico
  vm.runInContext(`function processed(f){ return f._P; } function viewOf(f){ return {peaks:(f._peaks||[]).map(x=>({x}))}; } function procKey(f){ return ''; }
    function anSet(f,k,v){ f.an=f.an||{}; if (v==null) delete f.an[k]; else f.an[k]=v; } function dispTitle(f){ return f._title; } function chanOf(f){ if (f._chanThrows) throw new Error('x'); return f._chanOf||''; }
    function mvCfg(i){ if (__mv.cfgThrows) throw new Error('x'); return __mv.cfg||{}; } function mvTable(i){ return []; } function mvCalib(rows){ if (__mv.calThrows) throw new Error('x'); return __mv.cal||null; } function toast(){}`, ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT,'app','library-ui.js'),'utf8'), ctx, {filename:'app/library-ui.js'});
  assert.ok(ctx.AcchLibUi && typeof ctx.AcchLibUi.csvRows==='function', 'library-ui.js non caricata');
  return ctx;
}

// cromatogramma sintetico: base, picchi gaussiani (area in mAU·min), rumore piccolo con seme fisso
function chrom(seed, peaks, o){ o=o||{}; const r=rng(seed), n=3001, xs=new Float64Array(n), ys=new Float64Array(n);
  for (let i=0;i<n;i++){ const x=i*0.004; xs[i]=x; let y=0.5+0.02*x; for (const p of peaks){ const s=p.s||0.03; y+=p.area/(s*Math.sqrt(2*Math.PI))*Math.exp(-0.5*((x-p.t)/s)**2); } ys[i]=y+(r()-0.5)*0.4; }
  return {xs, ys, kind:o.kind||'mAU', dir:o.dir||1, deriv:o.deriv||0}; }
const HEAD=(o)=>['Instrument: '+(o.ins||'Agilent 1260 Infinity'), 'Detector: DAD G4212B', 'Method: C:\\Chem32\\1\\METHODS\\'+(o.method||'MET-A.M'), 'Column: '+(o.column||'Zorbax C18'), 'Signal: '+(o.signal||'DAD1 A, Sig=254,4 Ref=off')];

function libraries(){
  const ins={brand:'Agilent', model:'1260 Infinity', detector:'DAD G4212B'};
  const cal=(o)=>Object.assign({kind:'line', slope:120, intercept:0.5, sa:0.8, sb:0.9, syx:2, srel:0.012, srelDf:12, n:15, df:13, range:[1,30], lod:0.3, loq:0.9, areaUnit:'mAU·min', concUnit:'mg/L', date:'2026-09-01', standardLot:'L-1;"a"', source:'taratura'}, o);
  const A=Lib.normalize({format:'acchlib', formatVersion:1, id:'libA', revision:7, name:'Agilent 1260 Infinity · DAD — caffè', technique:'hplc', instrument:ins, sampleType:'alimenti', profile:'ricerca', methods:[{id:'MET-A', aliases:['MET-A2']}], reminderDays:180,
    entries:[
      {id:'e1', rev:2, name:'Caffeina', x:3.0, window:0.1, channel:'DAD1A 254/4 nm', method:'MET-A', column:'Zorbax C18', cal:cal({})},
      {id:'e2', rev:1, name:'Teobromina', x:5.0, window:0.12, channel:'DAD1A 254/4 nm ref 360/100 nm', cal:cal({slope:7000, intercept:0, sa:null, syx:null, srel:null, srelDf:null, sb:150, areaUnit:'mAU·s', date:'2020-01-01', source:'letteratura', range:[0.5,20], lod:null, loq:null}), source:{doi:'10.1000/xyz', citation:'Autori, Rivista 2020'}},
      {id:'e3', rev:4, name:'Paraxantina', x:7.0, window:0.1, integration:{a:6.85, b:7.15}, cal:cal({slope:50, intercept:0, sa:0.5, range:[1,40], standardLot:''})},
      {id:'e4', rev:1, name:'Acido clorogenico', x:9.0, window:0.1, cal:cal({slope:400, intercept:2, measure:'height', areaUnit:'mAU', range:[0.5,50]})},
      {id:'e5', rev:1, name:'Solo identificazione', x:10.5, window:0.1},
      {id:'e6', rev:1, name:'Assente', x:11.5, window:0.1, cal:cal({})},
      {id:'e7', rev:3, name:'Trigonellina', x:2.0, window:0.1, cal:cal({slope:80, intercept:0, range:[1,20]}), chart:[1,1.004,0.998,1.002,0.999,1.003,0.997,1.001,1,1.002,0.999,1.001].map((k,i)=>({date:'2026-10-'+String(10+i), k}))},
      {id:'e8', rev:1, name:'Relativo', x:4.5, window:0.1, rrt:1.5, rrtRef:'e1', cal:cal({slope:60, intercept:0, range:[0.5,30]})},
      {id:'e9', rev:2, name:'Tolta', deleted:true}]});
  const B=Lib.normalize({format:'acchlib', formatVersion:1, id:'libB', revision:2, name:'Dosaggio 1260', technique:'hplc', instrument:ins, sampleType:'farmaci', profile:'dosaggio',
    entries:[{id:'b1', rev:1, name:'Principio', x:3.0, window:0.1, cal:cal({})}, {id:'b2', rev:1, name:'Secondo', x:7.0, window:0.1, cal:cal({slope:50, intercept:0})}]});
  const C=Lib.normalize({format:'acchlib', formatVersion:1, id:'libC', revision:3, name:'Esplorativa, "prova"', technique:'hplc', instrument:{brand:'Agilent', model:'1260 Infinity', detector:'DAD G4212B', serial:'DE123'}, sampleType:'ambientale', profile:'esplorativa',
    thresholds:{dev:18, diff:9}, thresholdReason:'Matrice difficile; "scritta" dal responsabile', entries:[{id:'c1', rev:1, name:'Caffeina', x:3.0, window:0.1, cal:cal({})}, {id:'c3', rev:1, name:'Paraxantina', x:7.0, window:0.1, cal:cal({slope:50, intercept:0})}]});
  const D=Lib.normalize({format:'acchlib', formatVersion:1, id:'libD', revision:1, name:'Manutenzione', technique:'hplc', instrument:ins, sampleType:'x', profile:'ricerca', maintenance:[{date:'2026-10-02', kind:'lampada'}],
    suitability:[{date:'2026-11-14', ok:true}], entries:[{id:'d1', rev:1, name:'Caffeina', x:3.0, window:0.1, cal:cal({})}, {id:'d2', rev:1, name:'Paraxantina', x:7.0, window:0.1, cal:cal({slope:50, intercept:0, date:'2026-10-05'})}]});
  const F=Lib.normalize({format:'acchlib', formatVersion:1, id:'libF', revision:1, name:'FTIR', technique:'ftir', instrument:{brand:'Bruker', model:'ALPHA II', detector:'DTGS'}, sampleType:'polimeri', profile:'ricerca',
    entries:[{id:'f1', rev:1, name:'Banda', x:1720, window:5, cal:cal({areaUnit:'mAU·s'})}, {id:'f2', rev:1, name:'Banda 2', x:1600, window:5, cal:cal({areaUnit:'A·cm-1', slope:3, intercept:0})}]});
  return [A,B,C,D,F];
}
// i file del caso: (nome, libreria, ruolo, concentrazioni vere, opzioni)
function scene(){
  const L=libraries(), A=L[0], files=[];
  const resp=(lib, id, c)=>{ const e=lib.entries.find(q=>q.id===id), k=e.cal; const y=(k.intercept||0)+k.slope*c; return k.areaUnit==='mAU·s' ? y/60 : y; };
  const pkA=(conc, f)=>{ f=f||{}; const P=[]; const T={e1:3.0, e2:5.0, e3:7.0, e4:9.0, e5:10.5, e7:2.0, e8:4.5};
    for (const [id,c] of Object.entries(conc)){ const t=T[id]+(f.shift||0)+(id==='e8'?0.012:0); if (id==='e4'){ P.push({t, area:resp(A,'e4',c)*0.03*Math.sqrt(2*Math.PI)}); continue; } P.push({t, area:id==='e5'?300:resp(A,id,c)*(f.k&&f.k[id]||1)}); }
    return P; };
  const mk=(name, libId, peaks, o)=>{ o=o||{}; const P=chrom(files.length*17+3, peaks, o); const f={name, _title:o.title||name.replace(/\.csv$/,''), instr:o.instr||'hplc', _P:P, _peaks:o.peaksAt||peaks.map(p=>+(p.t+0.002).toFixed(4)), meta:HEAD(o), an:{}, _chanOf:o.chanOf||'DAD1A 254 nm'};
    if (o.channel) f.channel=o.channel; if (o.uncal) f.uncal=true; if (libId) f.an.lib={id:libId, insOk:true}; if (o.role) f.an.role=o.role; if (o.libCtrl) f.an.libCtrl=o.libCtrl; if (o.libPos) f.an.libPos=o.libPos; if (o.chanThrows) f._chanThrows=true; files.push(f); return f; };
  mk('S1.csv','libA', pkA({e7:6, e1:9, e2:4, e8:2, e3:10, e4:3, e5:1}));
  mk('QC_open.csv','libA', pkA({e7:6, e1:10, e3:5}, {k:{e1:1.01, e7:1.002}}), {role:'qc', libPos:'open', libCtrl:{e1:10, e3:5, e7:6}});
  mk('S2.csv','libA', pkA({e1:12, e2:6, e3:15, e8:3}), {signal:'DAD1 A, Sig=254,4', title:'Campione; 2'});
  mk('QC_close.csv','libA', pkA({e1:10, e3:20}, {k:{e1:0.99, e3:1.02}}), {role:'qc', libPos:'close', libCtrl:{e1:10, e3:20}});
  mk('S3.csv','libA', pkA({e1:15, e3:8}), {deriv:1});
  mk('S4.csv','libA', pkA({e1:14, e3:9}), {channel:'DAD1A 220/4 nm'});
  mk('S5.csv','libA', pkA({e1:20, e3:30}), {uncal:true});
  mk('S6.csv','libA', pkA({e1:13}), {ins:'Agilent 1290 Infinity II'});
  mk('S7.csv','libA', pkA({e1:11, e3:12}), {method:'MET-B.M', column:'Kinetex C8', chanThrows:true});
  mk('S8.csv','libA', pkA({e1:11}), {method:'MET-A2.M'});
  mk('D1.csv','libB', [{t:3.0, area:1100}, {t:7.0, area:600}]);
  mk('E1.csv','libC', [{t:3.0, area:1100}, {t:7.0, area:300}]);
  mk('E2.csv','libC', [{t:3.0, area:1150}, {t:7.0, area:500}], {role:'qc', libCtrl:{c1:9.5, c3:10}});
  mk('M1.csv','libD', [{t:3.0, area:1100}, {t:7.0, area:500}]);
  mk('F1.csv','libF', [{t:1720/400, area:10}], {instr:'ftir', peaksAt:[1721, 1601, 1650]});
  mk('N1.csv', null, [{t:3.0, area:1000}]);
  return {L, files};
}

// ingresso per library_rows, costruito come lo costruirà l'app (vedi rapporto): stesse funzioni della pagina
function buildInput(ctx, inc, lang){
  const U=ctx.AcchLibUi, Lb=ctx.AcchLib, libs={}, tab={}, day_line={};
  const addCh=s=>{ if (s==null || s==='') return; s=String(s); if (s in tab) return; const p=Lb.parseChannel(s); tab[s]=p?JSON.parse(JSON.stringify(p)):null; if (p){ const t=Lb.channelText(p); if (!(t in tab)) tab[t]=JSON.parse(JSON.stringify(Lb.parseChannel(t))); } };
  const files=ctx.files.map(f=>{ const ch=U.chooseFor(f), lib=ch.pick?ch.pick.lib:null; if (lib && !libs[lib.id]){ libs[lib.id]=JSON.parse(JSON.stringify(lib)); for (const e of lib.entries) addCh(e.channel); }
    const r=U.recognize(f), P=ctx.processed(f); let co=''; try{ co=typeof ctx.chanOf==='function'?ctx.chanOf(f):''; }catch(e){ co=''; }
    addCh(f.channel); addCh(co); addCh(r.channel);
    let peaks=[]; try{ peaks=(ctx.viewOf(f).peaks||[]).map(p=>p.x); }catch(e){}
    if (!(f.instr in day_line)){ try{ const c=ctx.mvCfg(f.instr); let cal=null; try{ const k=ctx.mvCalib(ctx.mvTable(f.instr)); cal=k?{b:k.b, few:!!k.few}:null; }catch(e){ cal=null; } day_line[f.instr]={cfg:{model:c.model, a:c.a, b:c.b, c:c.c, d:c.d}, cal}; }catch(e){ day_line[f.instr]=null; } }
    const an=f.an||{};
    return {name:f.name, title:ctx.dispTitle(f), instr:f.instr, uncal:!!f.uncal, lib_id:lib?lib.id:null, an:{role:an.role||null, libCtrl:an.libCtrl||null, libPos:an.libPos||null}, peaks,
      proc:{xs:Array.from(P.xs), ys:Array.from(P.ys), kind:P.kind, dir:P.dir}, normalized:!!((ctx.S.conv && ctx.S.conv[f.instr]==='norm') || P.deriv),
      instrument:U.instrumentOf(f), rec:{method:r.method, column:r.column, channel:r.channel}, channel_src:{channel:f.channel||null, chan_of:co}}; });
  return {lang, ui_lang:lang, today:ctx.__today, libraries:libs, channels:tab, day_line, files, inc:inc.map(f=>ctx.files.indexOf(f))};
}

test('concentrazioni_da_libreria.csv: library_rows di Python identico a library-ui.js (IT ed EN, 35 colonne, controlli, blocchi, confronto)', {skip:!PY, timeout:600000}, async ()=>{
  const ctx=loadPage(), U=ctx.AcchLibUi, {L, files}=scene();
  ctx.__libs=L.map(lib=>({lib, origin:'user'})); await U.refresh();
  ctx.files.length=0; files.forEach(f=>ctx.files.push(f));
  const d=new Date(); ctx.__today=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;   // today() della pagina
  const runs=[], wantNums=[], variants=[
    {lang:'it', mv:{cfg:{model:'line', a:2.9, b:3.1}, cal:{b:118}}},
    {lang:'en', mv:{cfg:{model:'line', a:2.9, b:3.1}, cal:{b:125}}},
    {lang:'it', mv:{cfg:{model:'line', a:6.9, b:7.1}, cal:{b:50, few:true}}, inc:files.filter((f,i)=>i%2===0)},
    {lang:'en', mv:{cfgThrows:true}},
    {lang:'it', mv:{cfg:{model:'pls', a:2.9, b:3.1}, calThrows:true}, noQc:true}];
  for (const v of variants){
    vm.runInContext(`LANG=${JSON.stringify(v.lang)}`, ctx); ctx.AcchI18n.lang=v.lang; ctx.__mv=v.mv;
    if (v.noQc) files.forEach(f=>{ if (f.name==='QC_close.csv') f.an.libPos=null; });
    files.forEach(f=>f._libRes=null);
    const inc=v.inc||files, out=[]; U.exportFiles(inc, out, null);
    assert.strictEqual(out.length, 1, 'la pagina scrive il CSV');
    const rowsJs=U.csvRows(inc).map(r=>r.map(c=>c==null?'':String(c)));
    assert.strictEqual(rowsJs[0].length, 35);
    const nums=[]; for (const f of inc){ if (!['hplc','ftir','raman','xrf','uv'].includes(f.instr) || f.uncal) continue; const q=U.quantRows(f); for (const w of q.rows||[]){ if (!w.entry.cal || !w.res) continue;
      nums.push({file:f.name, entry:w.entry.id, ok:!!w.res.ok, code:w.res.code, mode:w.res.mode||null, y:w.y, x:w.res.x, U:w.res.U, kU:w.res.u?w.res.u.kU:null, k:w.res.k, devs:w.res.devs||[], drift:w.res.drift, age:w.res.provenance&&w.res.provenance.age}); } }
    runs.push(buildInput(ctx, inc, v.lang)); wantNums.push({name:out[0][0], text:out[0][1], rows:rowsJs, nums});
    if (v.noQc) files.forEach(f=>{ if (f.name==='QC_close.csv') f.an.libPos='close'; });
  }
  const got=runPy(`print(_j.dumps(_enc([library_rows(x) for x in IN])))`, runs), bad=[];
  got.forEach((g,i)=>{ const w=wantNums[i];
    assert.strictEqual(g.name, w.name);
    if (g.text!==w.text){ const a=g.text.split('\r\n'), b=w.text.split('\r\n'); a.forEach((l,j)=>{ if (l!==b[j]) bad.push(`giro ${i} riga ${j}:\n  py ${l}\n  js ${b[j]}`); }); if (a.length!==b.length) bad.push(`giro ${i}: ${a.length} righe invece di ${b.length}`); }
    diff(g.rows, w.rows, `giro ${i} righe`, bad); diff(g.results, w.nums, `giro ${i} numeri`, bad); });
  const codes={}; wantNums.forEach(w=>w.nums.forEach(n=>{ const k=n.code+(n.mode?'/'+n.mode:''); codes[k]=(codes[k]||0)+1; }));
  console.log('# CSV: esiti coperti:', JSON.stringify(codes), '· righe:', wantNums.map(w=>w.rows.length-1).join(' '));
  assert.deepStrictEqual(bad.slice(0,10), []);
  for (const c of ['ok/nocontrol','ok/1ctrl','ok/2ctrl','channel','instrument','method','normalized','profile','maintenance','area-unit','no-control'])
    assert.ok(Object.keys(codes).some(k=>k===c || k.startsWith(c+'/')), 'esito non coperto nel CSV: '+c);
  assert.ok(wantNums.some(w=>/«Più campioni»|«Multiple samples»/.test(w.text)) && wantNums.some(w=>/Retta del giorno: pendenza|Same-day line: slope/.test(w.text)), 'confronto con la retta del giorno');
  assert.ok(wantNums.some(w=>/2_2s|1_3s|;ok;|,ok,/.test(w.text)), 'stato della carta');
});

test('riepilogo: LRE minimo dei numeri confrontati', ()=>{
  if (!PY) return console.log('# confronti con Python saltati: nessun LRE');
  console.log(`# numeri confrontati: ${NNUM}; LRE minimo: ${LRE_MIN===Infinity?'—':LRE_MIN.toFixed(1)} (15 = identico)`);
  assert.ok(LRE_MIN>=9, 'LRE minimo sotto 9');
});
