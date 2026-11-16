// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I12, ricetta Python, parte «XRF a parametri fondamentali»: scripts/ricetta-py/acch_xrf.py (concatenato dopo acch_ricetta, acch_math,
// acch_chemometria e acch_tecnica) rifà composizione_xrf_parametri_fondamentali.csv, spessore_strati_xrf.csv e composizione_xrf.csv con il
// modello «parametri fondamentali» con lo stesso testo dell'app, in italiano e in inglese, su spettri XRF SINTETICI (generatore del ciclo 27:
// bronzi e una doratura sopra il rame, tubo Rh e Ag). Il riferimento è il codice vero di index.html: il nucleo (CORE) più fpCsvRows, fpRun,
// fpNotes, fpLayer*, xqModelFP, xrfElements e analysisFiles, estratti dal sorgente; viewOf è sostituito dai dati del caso.
// Si salta (e lo si dice) se python3 ≥ 3.10 manca; fallisce se il modulo Python manca.
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), os=require('os'), vm=require('vm'), crypto=require('crypto'), {spawnSync}=require('child_process');
const ROOT=path.join(__dirname,'..','..'), PYDIR=path.join(ROOT,'scripts','ricetta-py'), MOD=path.join(PYDIR,'acch_xrf.py');
const PY=(()=>{ for (const c of [process.env.PYTHON, 'python3'].filter(Boolean)){ const r=spawnSync(c, ['-c','import sys; print(sys.version_info>=(3,10))'], {encoding:'utf8'}); if (r.status===0 && /True/.test(r.stdout)) return c; } return null; })();
const XR=require('../fixtures/xrf-c27/genera.js');

/* ---------- l'app in Node: nucleo + funzioni estratte da index.html ---------- */
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8'), lines=html.split('\n');
const core=html.slice(html.indexOf('/*CORE-START*/'), html.indexOf('/*CORE-END*/'));
function extract(name){ const re=new RegExp('^(function '+name+'\\(|const '+name+'\\s*=)'); const i=lines.findIndex(l=>re.test(l)); if (i<0) throw new Error('non trovata in index.html: '+name);
  let j=i+1; while (j<lines.length && !/^(function |const |let |var |async function |\/\*|\/\/|window\.|\}\)|[A-Za-z_$][\w$]*\s*=)/.test(lines[j])) j++; return lines.slice(i,j).join('\n'); }
const NAMES=['analysisFiles','FP_MODES','fpNum','fpCfg','fpSetupOf','FP_FILTERS','fpAnodeKeep','fpDefaultEls','fpBalance','fpData','fpPlan','fpStore','fpRun','fpNotes','fpAtmName','fpCsvRows',
  'FP_SUB_DEF','fpLayerPairs','fpLn','fpLayerCfg','fpLayerRun','xqfKey','xqModelFP','XQ_DEFAULT','xqModel','xqCsvRows','xrfElements','fmtN','fmtG','esc','uiEn','CSV_NUM','csvCell','TECH_REF','lblKey'];
function makeApp(){
  const ctx={console, Float64Array, Uint8Array, Math, TextDecoder, DataView, ArrayBuffer}; ctx.window=ctx; vm.createContext(ctx);
  vm.runInContext(core, ctx, {filename:'index.html#core'});
  vm.runInContext(NAMES.map(extract).join('\n')+`
var S={showArea:true, showPeaks:true, spike:{}, smooth:{}, base:{}, sample:'gen'}, files=[], INC=[], MV={}, MVres={}, MVpls={}, XQL=[];
function viewOf(f){ return {peaks:f._peaks}; } function dispTitle(f){ return f.title; } function included(){ return INC; }
function assess(){ return []; } function hypotheses(){ return null; } function techMetrics(){ return {title:'', rows:[]}; } function fitCsvRows(){ return []; } function fitValid(){ return false; }
function mixtureOf(){ return null; } function methodsText(){ return ''; } function mvCfg(i){ return MV[i]; } function mvFiles(){ return XQL; } function processed(f){ return {xs:f.xs, ys:f.ys, kind:'I'}; } function procKey(f){ return 'k'+f.id; }
globalThis.APP={ set:(o)=>{ LANG=o.lang; window.AcchI18n=o.i18n||{lang:o.lang}; files.length=0; files.push(...o.files); INC=o.inc; MV={}; if (o.xq){ MV.xrf=o.xq; XQL=o.xql; } else XQL=[]; files.forEach(f=>{ f._fpKey=null; f._fpRes=null; f._xqfKey=null; f._lyKey=null; }); },
  analysisFiles, fpRun, fpNotes, csvCell:(f)=>{ csvCell=f; }, csvCell0:csvCell,
  CONST:{XRF_COMMON, XRF_LINES, XRF_LN_GR, XRF_TUBES, FP:{el:Object.fromEntries(Object.entries(FP.el).map(([k,v])=>[k,{fam:v.fam}]))}},
  FPC:{FP_DATA, FP_MATS, FP_OXIDE, FP_ANODES, FP_FILTERS, FP_MODES, FP_SUB_DEF, FP_AIR, FP_AIR_RHO, FP_ENH} };`, ctx, {filename:'index.html#estratte'});
  return ctx;
}

/* ---------- spettri sintetici ---------- */
// generatore del ciclo 27 (FP del nucleo); intestazione letta come la legge parseXRF: anodo, kV, angoli
function xrfFile(comp, counts, seed, opt){ opt=opt||{}; const txt=XR.spectrum(comp, counts, seed), L=txt.split('\n'), ys=[], xs=[];
  for (const l of L){ if (!l || l[0]==='#') continue; ys.push(+l); } for (let i=0;i<ys.length;i++) xs.push(i*40.94/2047);
  return {xs, ys}; }
// picchi e suggerimenti come li darebbe viewOf (righe della banca dati vicine), deterministici
function peaksOf(C, f){ const ys=f.ys, xs=f.xs, yA=Float64Array.from(ys, v=>2*Math.sqrt(Math.max(v,0)+0.375)); const pk=C.findPeaks(xs, yA, 1, 3, 40);
  const lines=[]; for (const [el,o] of Object.entries(C.FP.el)) for (const [nm,q] of Object.entries(o.ln)) if (q.E>1 && ['Ka','Kb','La','Lb'].includes(nm)) lines.push({id:'x_'+el+'_'+nm, el, E:q.E});
  return pk.map(q=>{ const near=lines.map(L=>({L, d:Math.abs(L.E-q.x)})).filter(o=>o.d<0.12).sort((a,b)=>a.d-b.d).slice(0,4);
    return {x:q.x, y:q.y, prom:q.prom, custom:false, name:'', sugg:near.map((o,i)=>({id:o.L.id, it:o.L.el+' '+o.L.id.slice(-2), coherent:i<2}))}; }); }

function cases(C){
  const out=[]; let id=0;
  const mk=(name, data, o)=>{ const f=Object.assign({id:++id, name, title:name.replace(/\.mca$/,''), instr:'xrf', kind:'I', xs:Float64Array.from(data.xs), ys:Float64Array.from(data.ys), an:{}, labels:{}, tube:'Rh', xrf:{tube:'Rh', kv:'40', psi1:'45', psi2:'45'}}, o||{});
    f._peaks=peaksOf(C, f); f._auto=f._peaks.map(p=>({x:p.x, prom:p.prom})); out.push(f); return f; };
  // bronzo arsenicale, lega, elementi scelti dall'utente; stesso con la scala dal Compton e materiale «calcite»
  mk('bronzo_a.mca', xrfFile({Cu:0.90, Sn:0.08, As:0.02}, 3000, 11), {an:{fp:{mode:'norm', els:['Cu','Sn','As']}}});
  mk('pittura.mca', xrfFile({Pb:0.25, Ca:0.15, Fe:0.03, C:0.37, O:0.2}, 3000, 12), {an:{fp:{mode:'compton', bal:'custom', balTxt:'C 60 H 8 O 32', els:['Pb','Ca','Fe']}}});
  mk('pittura_b.mca', xrfFile({Pb:0.05, Ca:0.3, C:0.35, O:0.3}, 3000, 17), {an:{fp:{mode:'compton', bal:'calcite', els:['Pb','Ca']}}});
  // ottone senza intestazione: anodo, tensione e geometria presunti (avvisi), elementi trovati dai suggerimenti; ossidi
  mk('ottone.mca', xrfFile({Cu:0.70, Zn:0.28, Pb:0.02}, 2500, 13), {xrf:{}, tube:null, an:{fp:{mode:'oxides', S:{filtEl:'Al', filtUm:50}}}});
  // doratura: oro sopra il rame, spessore dal rapporto Lα/Lβ dell'oro... qui Cu Kα/Kβ sotto la foglia d'oro, con riferimento senza strato
  const ref=mk('rame_nudo.mca', xrfFile({Cu:1.0}, 3000, 14), {an:{fp:{els:['Cu']}}});
  mk('doratura.mca', xrfFile({Cu:0.75, Au:0.25}, 3000, 15), {an:{fp:{els:['Cu','Au'], layer:{on:true, el:'Cu', cover:'oro', sub:'rame', ref:ref.id}}}});
  mk('doratura_att.mca', xrfFile({Cu:0.6, Au:0.4}, 3000, 16), {xrf:{tube:'Rh', kv:'40', psi1:'45', psi2:'45', live:'100'}, an:{fp:{els:['Cu','Au'], layer:{on:true, el:'Cu', cover:'custom', coverTxt:'Au', coverRho:19.3, sub:'fp', method:'atten', ref:ref.id}}}});
  // standard per la composizione FP di «Più campioni»: due standard e un campione, tubo Rh 40 kV
  for (const [k,c] of [[0,{Cu:88, Sn:10, As:2}],[1,{Cu:92, Sn:6, As:2}],[2,null]]) mk('std_'+k+'.mca', xrfFile({Cu:(c?c.Cu:90)/100, Sn:(c?c.Sn:8)/100, As:(c?c.As:2)/100}, 3000, 30+k), {an:c?{std:c}:{}, _xq:true});
  return out;
}

/* ---------- l'ingresso di Python ---------- */
const arr=a=>a==null?null:Array.from(a);
function voce(C, f){ const xsug={}; f._peaks.forEach(p=>{ const SG=p.suggAll||p.sugg||[]; xsug[String(p.x)]={sg:SG.slice(0,3).map(g=>({id:g.id, coherent:!!g.coherent})), n:SG.length, all:!!p.suggAll, lab:p.custom?String(f.labels[C.lblKey(p.x)]||''):''}; });
  return {id:f.id, nome:f.name, titolo:f.title, instr:f.instr, kind:f.kind, xs:arr(f.xs), ys:arr(f.ys), an:f.an||{}, uncal:!!f.uncal, ecal:!!f.ecal, tube:f.tube, xrf:f.xrf||null,
    peaks:f._peaks.map(p=>({x:p.x, y:p.y, prom:p.prom, custom:p.custom, name:p.name})), auto:f._auto, xsug}; }

function runJs(ctx, list, lang, xq){
  const A=ctx.APP; A.csvCell(A.csvCell0); const trad={}, fpTr={};
  let i18n={lang};
  if (lang==='en'){ const w={}; vm.runInNewContext(fs.readFileSync(path.join(ROOT,'i18n','en.js'),'utf8'), {window:w}); const I=require(path.join(ROOT,'app','i18n.js'))({ACCH_EN:w.ACCH_EN, navigator:{language:'en'}, AcchHost:{store:{getItem:()=>JSON.stringify('en'), setItem(){}}}});
    const oc=A.csvCell0, tr=(c,sep)=>oc(typeof c==='string'?I.tr(c):c, sep);
    A.csvCell(function(c, sep){ const o=tr(c, sep); if (typeof c==='string' && /\p{L}/u.test(c)){ let t=tr(c,'\u0001'); if (/^"[\s\S]*"$/.test(t) && t.length>=2) t=t.slice(1,-1).replace(/""/g,'"'); if (t[0]==="'" && /^[=+\-@\t\r]/.test(t.slice(1)) && !ctx.CSV_NUM_T(t.slice(1))) t=t.slice(1); if (t!==c) trad[c]=t; } return o; });
    i18n={lang:'en', tr:t=>{ const r=I.tr(t); if (r!==t) fpTr[t]=r; return r; }}; }   // come pyAnalysis: le parti tradotte da fpCsvRows
  A.set({lang, files:list, inc:list, xq, xql:list.filter(f=>f._xq), i18n});
  const out={}; A.analysisFiles().forEach(([n,t])=>{ if (/^(composizione_xrf|xrf_composition|composizione_xrf_parametri_fondamentali|xrf_fundamental_parameters|spessore_strati_xrf|xrf_layer_thickness)\./.test(n)) out[n]=t; });
  A.csvCell(A.csvCell0); return {out, trad, fpTr};
}

function runPy(input){
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'acch-xrf-')); try{
    fs.writeFileSync(path.join(d,'in.json'), JSON.stringify(input));
    const drv=`
import json as _j
_I=_j.load(open(${JSON.stringify(path.join(d,'in.json'))}, encoding='utf-8'))
_c=dict(_I['costanti']); _c.update(_I['fpc']); carica_costanti(_c)
_R=[]
for _g in _I['giri']:
    TRAD.clear(); TRAD.update(_g['trad'])
    _V={str(_v['id']): dict(_v) for _v in _I['voci']}
    _ctx={'lang':_g['lang'], 'fpTr':_g['fpTr']}
    TEC_LANG[0]=_g['lang']
    _o={}
    _fl=[_v for _v in _V.values() if (_v['an'] or {}).get('fp')]   # analysisFiles: XRF inclusi con f.an.fp
    _r=composizione_fp_csv(_fl, _ctx)
    if _r: _o[_r[0]]=_r[1]
    _r=spessore_strati_csv(_fl, dict(_ctx, rif=lambda i: _V.get(js_str(i) if isinstance(i,(int,float)) else str(i))))
    if _r: _o[_r[0]]=_r[1]
    _r=composizione_xrf_csv(_g['xq'], [_v for _v in _V.values() if _v.get('xq')], _ctx)
    if _r: _o[_r[0]]=_r[1]
    _R.append(_o)
# numeri interni: stima FP di ogni spettro e spessore, per l'LRE
_N={}
_V={str(_v['id']): dict(_v) for _v in _I['voci']}
for _k,_v in _V.items():
    _r=fp_run(_v)
    if _r and _r.get('Q') and _r['Q'].get('res'):
        _N[_k]=[[_e,_o['w'],_o['sw'],_o.get('sens')] for _e,_o in _r['Q']['res'].items()]+[[_r['fit']['chi2r'],_r['fit']['off'],_r['fit']['gain'],_r['fit']['wf']]]
_S=fp_setup({'anode':'Rh','kv':40})
_N['tubo']=fp_tube(_S)['N'][::25]
_N['int']=fp_intensities([{'comp':{'Au':1},'t':0.002},{'comp':fp_parse_comp('Cu 90 Sn 10'),'t':INF}], _S, [['Cu','Ka'],['Cu','Kb'],['Au','La'],['Sn','Ka']])
_N['comp']=[fp_parse_comp(_t) for _t in ['2PbCO3·Pb(OH)2','CaSO4·2H2O','Cu 88, Sn 12','Cu2CO3(OH)2','C 50 H 7 N 18 O 25','Xx2O','']]
print(_j.dumps({'csv':_R, 'num':_N}))
`;
    const prog=['acch_ricetta','acch_math','acch_lettori','acch_chemometria','acch_tecnica','acch_xrf'].map(m=>fs.readFileSync(path.join(PYDIR,m+'.py'),'utf8')).join('\n')+`\nusa_motore('v8-fma' if ${JSON.stringify(process.arch)}=='arm64' else 'v8')\n`+drv;
    fs.writeFileSync(path.join(d,'p.py'), prog); const r=spawnSync(PY, ['-I', path.join(d,'p.py')], {encoding:'utf8', maxBuffer:1<<28});
    assert.strictEqual(r.status, 0, r.stderr); return JSON.parse(r.stdout);
  } finally { fs.rmSync(d,{recursive:true,force:true}); }
}
const lre=(a,b)=>{ if (a===b) return 15; if (typeof a!=='number' || typeof b!=='number') return 0; if (!isFinite(a)||!isFinite(b)) return Object.is(a,b)?15:0; const d=Math.abs(a-b)/Math.max(Math.abs(a),Math.abs(b),1e-300); return d===0?15:Math.min(15,-Math.log10(d)); };

test('il modulo Python dell\'XRF a parametri fondamentali esiste ed è nel build', ()=>{
  assert.ok(fs.existsSync(MOD), 'manca '+MOD); assert.ok(require(path.join(ROOT,'scripts','ricetta-py-build.js')).MODULI.includes('acch_xrf'), 'acch_xrf non è fra i moduli concatenati'); });

test('composizione FP, spessore degli strati e composizione «parametri fondamentali»: testo identico all\'app (IT, EN), numeri entro 1e-9', {skip:!PY && 'python3 ≥ 3.10 non trovato', timeout:30*60*1000}, ()=>{
  assert.ok(fs.existsSync(MOD), 'manca '+MOD);
  const ctx=makeApp(); vm.runInContext('globalThis.CSV_NUM_T=s=>CSV_NUM.test(s);', ctx);
  const C={findPeaks:ctx.findPeaks, FP:vm.runInContext('FP', ctx), lblKey:vm.runInContext('lblKey', ctx)};
  const list=cases(C), giri=[], want=[];
  const XQ=[{qEls:['Cu','Sn','As'], qModel:'fp'}, {qEls:['Cu','Sn','As'], qModel:'fp', q100:false}];
  for (const [lang, xq] of [['it', XQ[0]], ['en', XQ[1]]]){ const J=runJs(ctx, list, lang, xq); want.push(J.out); giri.push({lang, trad:J.trad, fpTr:J.fpTr, xq}); }
  // l'app produce le tre tabelle, con avvisi, ossidi, Compton, strati con rapporto e attenuazione
  for (const w of want) assert.strictEqual(Object.keys(w).length, 3, 'tabelle prodotte dall\'app: '+Object.keys(w).join(', '));
  const fpIt=want[0]['composizione_xrf_parametri_fondamentali.csv'], lyIt=want[0]['spessore_strati_xrf.csv'];
  assert.match(fpIt, /! /, 'avvisi nella colonna Note'); assert.match(fpIt, /Fe2O3|CuO|ZnO/, 'ossidi'); assert.ok(lyIt.split('\r\n').length>=3, 'due strati: '+lyIt);
  const voci=list.map(f=>Object.assign(voce(C, f), {xq:!!f._xq}));
  const fpc=JSON.parse(JSON.stringify(ctx.APP.FPC));
  let t0=Date.now(); const got=runPy({voci, giri, costanti:ctx.APP.CONST, fpc}); console.log('# python: '+(Date.now()-t0)+' ms');
  let nRighe=0;
  want.forEach((w,g)=>{ assert.deepStrictEqual(Object.keys(got.csv[g]).sort(), Object.keys(w).sort(), 'file prodotti, giro '+g);
    for (const [n,t] of Object.entries(w)){ const a=got.csv[g][n].split('\r\n'), b=t.split('\r\n'); nRighe+=b.length; const diff=[]; b.forEach((l,i)=>{ if (a[i]!==l) diff.push(`${n} riga ${i}:\n  py: ${a[i]}\n  js: ${l}`); }); if (a.length!==b.length) diff.push(`${n}: ${a.length} righe invece di ${b.length}`); assert.deepStrictEqual(diff.slice(0,6), [], 'giro '+g); } });
  // numeri interni
  const js={};
  ctx.APP.set({lang:'it', files:list, inc:list});
  list.forEach(f=>{ const R=ctx.APP.fpRun(f); if (R && R.Q && R.Q.res) js[f.id]=Object.entries(R.Q.res).map(([e,o])=>[e,o.w,o.sw,o.sens]).concat([[R.fit.chi2r,R.fit.off,R.fit.gain,R.fit.wf]]); });
  const S=ctx.fpSetup({anode:'Rh', kv:40}); js.tubo=Array.from(ctx.fpTube(S).N).filter((_,i)=>i%25===0);
  js.int=ctx.fpIntensities([{comp:{Au:1}, t:0.002},{comp:ctx.fpParseComp('Cu 90 Sn 10'), t:Infinity}], S, [['Cu','Ka'],['Cu','Kb'],['Au','La'],['Sn','Ka']]);
  js.comp=['2PbCO3·Pb(OH)2','CaSO4·2H2O','Cu 88, Sn 12','Cu2CO3(OH)2','C 50 H 7 N 18 O 25','Xx2O',''].map(ctx.fpParseComp);
  let minL=15, nNum=0;
  const walk=(a,b,k)=>{ if (Array.isArray(b)){ assert.ok(Array.isArray(a), k); assert.strictEqual(a.length, b.length, k+' lunghezza'); b.forEach((v,i)=>walk(a[i], v, k+'['+i+']')); return; }
    if (b && typeof b==='object'){ assert.deepStrictEqual(Object.keys(a).sort(), Object.keys(b).sort(), k); for (const q of Object.keys(b)) walk(a[q], b[q], k+'.'+q); return; }
    if (typeof b==='number' && isFinite(b)){ nNum++; const l=lre(a,b); minL=Math.min(minL,l); assert.ok(l>=9, `${k}: ${a} invece di ${b}`); } else assert.deepStrictEqual(a==null?null:a, b==null?null:b, k); };
  walk(got.num, JSON.parse(JSON.stringify(js)), 'num');
  console.log(`# XRF FP: ${list.length} spettri, ${nRighe} righe CSV identiche in 2 giri (IT, EN), ${nNum} numeri interni, LRE minimo ${minL.toFixed(1)}`);
});
