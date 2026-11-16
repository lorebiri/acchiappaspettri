// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I12, ricetta Python, parte «chemometria»: scripts/ricetta-py/acch_chemometria.py (concatenato dopo acch_ricetta.py) rifà
// deconvoluzione.csv, pca_<tecnica>.csv, pls_<tecnica>.csv e miscele_percentuali_in_peso.csv con gli stessi testi dell'app.
// Riferimento JS: il nucleo di index.html e le funzioni dell'interfaccia estratte dal testo (fitCsvRows, pcaData, runPCA,
// pcaCsvRows, plsRun, refScore, refMatches, mixtureOf, mixCalib, analysisFiles…), con pochi sostituti per lo stato della pagina.
// Casi sintetici. Si confrontano i testi CSV (identici) e i numeri grezzi (LRE minimo stampato).
// I confronti con Python si saltano (e lo si dice) se python3 ≥ 3.10 manca; il test fallisce se il modulo Python manca.
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), os=require('os'), vm=require('vm'), {spawnSync}=require('child_process');
const ROOT=path.join(__dirname,'..','..');
const PYDIR=path.join(ROOT,'scripts','ricetta-py');
const PY=(()=>{ for (const c of [process.env.PYTHON, 'python3'].filter(Boolean)){ const r=spawnSync(c, ['-c','import sys; print(sys.version_info>=(3,10))'], {encoding:'utf8'}); if (r.status===0 && /True/.test(r.stdout)) return c; } return null; })();

const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const core=html.slice(html.indexOf('/*CORE-START*/'), html.indexOf('/*CORE-END*/'));
// una dichiarazione di primo livello dell'interfaccia: dalla riga che la apre alla prossima riga di primo livello
function grab(head){
  const a=html.indexOf('\n'+head); if (a<0) throw new Error('non trovato in index.html: '+head);
  const rest=html.slice(a+1), m=/\n(?=function |const |let |var |async function |\/\*|\/\/)/.exec(rest.slice(1));
  const src=m ? rest.slice(0, m.index+1) : rest; if (!/[}\];]\s*$/.test(src)) throw new Error('fine non riconosciuta: '+head); return src;
}
const UI=['const PROF_NAME=','function fitCsvRows(','function mvCfg(','function pcaData(','function runPCA(','function pcaCsvRows(','function plsRun(',
  'function refVector(','function refScore(','function refScoreDeriv(','const REF_BL=','function refMatches(','function mixtureOf(','function mixCalib(',
  'const CSV_NUM=','function csvCell(','function upData(','const TECH_REF=','function analysisFiles('].map(grab);
const runFit=grab('async function runFitUI('), allSp=/\$\('#fitAllSp'\)\.onclick=[\s\S]*?renderFitOut\(f\);/.exec(html)[0];
// le righe dell'app che fanno il fit e salvano f.fit: si eseguono così come sono scritte
const FIT_STMT=/const xs=P\.xs\.subarray\(a,b\+1\), ys=U\.y\.subarray\(a,b\+1\), d=viewOf\(f\), seeds=[^;]*;/.exec(runFit)[0];
const FIT_CALL=/const t0=performance\.now\(\), fit=deconvolve\([^;]*;/.exec(runFit)[0];
const FIT_SAVE=/f\.fit=\{pk:procKey\(f\)[\s\S]*?\};/.exec(runFit)[0];
const ALL_FIT=/const fit=fitPeaks\(P\.xs\.subarray[^;]*;/.exec(allSp)[0], ALL_SAVE=/g\.fit=\{pk:procKey\(g\)[\s\S]*?\};/.exec(allSp)[0];

const STUBS=`
let files=[], INC=[], REFS=[], MV={}, MVres={}, MVpls={};
function lsGet(){ return null; }
function processed(f){ return f._P; }
function dispTitle(f){ return f.title; }
function included(){ return INC; }
function mvFiles(instr, c){ return files.filter(f=>f.instr===instr); }
function fitValid(f){ return !!(f.fit && f.fit.pk==='k'); }
function procKey(f){ return 'k'; }
function pBase(f){ return f._base; }
function viewOf(f){ return {peaks:(f._peaks||[]).map(x=>({x}))}; }
function assess(){ return []; } function hypotheses(){ return null; } function techMetrics(){ return {title:'', rows:[]}; } function methodsText(){ return ''; }
function mvCsvRows(){ return [[]]; } function mvTable(){ return []; } function mvCalib(){ return null; }
const window={}, performance={now:()=>0};
globalThis.__lang=v=>{ LANG=v; };
globalThis.__state=(F, I, R)=>{ files=F; INC=I; REFS=R; MV={}; MVres={}; MVpls={}; REF_BL.clear(); };
globalThis.__mv=(instr, c)=>Object.assign(mvCfg(instr), c);
globalThis.__runPCA=instr=>runPCA(instr); globalThis.__pls=instr=>{ MVpls[instr]=plsRun(instr); return MVpls[instr]; };
globalThis.__fit=(f, r, prof, bm, auto)=>{ const P=processed(f), U=upData(P); let a=0; while (a<P.xs.length && P.xs[a]<r[0]) a++; let b=P.xs.length-1; while (b>=0 && P.xs[b]>r[1]) b--;
  ${FIT_STMT} ${FIT_CALL} if (!fit) throw new Error('fit JS non riuscito'); ${FIT_SAVE} return fit; };
globalThis.__fitAll=(f, g)=>{ const F=f.fit, P=processed(g), U=upData(P); let a=0; while (a<P.xs.length && P.xs[a]<F.range[0]) a++; let b=P.xs.length-1; while (b>=0 && P.xs[b]>F.range[1]) b--;
  ${ALL_FIT} if (!fit) throw new Error('fit JS non riuscito'); ${ALL_SAVE} return fit; };
globalThis.__files=()=>analysisFiles();
globalThis.__mix=f=>{ const M=mixtureOf(f); if (!M || M.err) return null; const K=mixCalib(f.instr); if (!K) return null; const q={}; M.list.forEach(o=>q[o.r.id]=o.frac); return {list:M.list.map(o=>[o.r.id, o.frac]), r2:M.r2, w:mixWeights(q, K)}; };
globalThis.__refVector=refVector;
`;
function context(){
  const ctx={console, Float64Array, Math, TextDecoder, Uint8Array, DataView, ArrayBuffer, Map, Set}; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT,'app','sorption-core.js'),'utf8'), ctx);
  vm.runInContext(core, ctx, {filename:'index.html#core'});
  vm.runInContext(UI.join('\n'), ctx, {filename:'index.html#ui'});
  vm.runInContext(STUBS, ctx, {filename:'stubs'});
  return ctx;
}

// ---------------- dati sintetici ----------------
function prng(seed){ let s=seed>>>0; const u=()=>{ s=(s*1664525+1013904223)>>>0; return (s+0.5)/4294967296; }; return {u, g:()=>Math.sqrt(-2*Math.log(u()))*Math.cos(2*Math.PI*u())}; }
const pv=(x,c,w,eta)=>{ const t=(x-c)/w; return eta*2/(Math.PI*w)/(1+4*t*t)+(1-eta)*2*Math.sqrt(Math.LN2/Math.PI)/w*Math.exp(-4*Math.LN2*t*t); };
const grid=(a,b,st)=>{ const o=[]; for (let x=a; x<=b+1e-9; x+=st) o.push(+x.toFixed(6)); return o; };
function spectrum(name, instr, kind, xs, fy, base){ const ys=xs.map(fy); return {name:name+'.csv', title:name, instr, kind, include:true, _base:base||'lin', an:{}, xs:Float64Array.from(xs), ys:Float64Array.from(ys),
  _P:{xs:Float64Array.from(xs), ys:Float64Array.from(ys), kind, dir:1, deriv:0}}; }
function build(){
  const R=prng(20261114), F=[];
  // FTIR, banda ammide I: tre componenti pseudo-Voigt sopra una retta
  const xf=grid(1580,1720,1), amp=[[30,50,15],[22,58,20],[35,40,10],[26,52,18]];
  amp.forEach((A,j)=>F.push(spectrum('ftir_'+(j+1), 'ftir', 'A', xf, x=>0.02+1e-4*(x-1580)+A[0]*pv(x,1630,14,0.3)+A[1]*pv(x,1652,18,0.6)+A[2]*pv(x,1675,12,0.2)+0.002*R.g())));
  F[0]._peaks=[1630,1652]; F[1]._peaks=[1631,1653,1674]; F[2]._peaks=[];
  // Raman: miscele di tre componenti puri (anche riferimenti in libreria), con fondo di fluorescenza
  const xr=grid(200,1800,4), comp=[[[480,30],[1085,25]],[[620,40],[1300,35],[1600,20]],[[900,50],[1450,30]]];
  const pure=(k,x)=>comp[k].reduce((s,[c,w])=>s+1000*pv(x,c,w,0.5),0);
  const mixes=[[50,30,20],[20,50,30],[30,20,50],[60,25,15],[10,40,50],[45,45,10],[33,33,34],[70,10,20],[15,70,15]];
  mixes.forEach((w,j)=>{ const f=spectrum('raman_'+(j+1), 'raman', 'I', xr, x=>w.reduce((s,v,k)=>s+v/100*pure(k,x)*(1+0.15*k),0)+(j%2? 0 : 5+0.004*x+3e-6*x*x)+0.15*R.g(), j%2?'arpls':'none');
    if (j<4) f.an.mixW={rA:w[0], rB:w[1], rC:w[2]}; if (j===8) f.an.mixW={}; F.push(f); });
  // UV: banda dell'analita sovrapposta a un interferente, per la PLS
  const xu=grid(250,450,2), conc=[1,2,3,4,5,6,7,8,null,null];
  conc.forEach((c,j)=>{ const cc=c==null?3.3+j*0.4:c, ii=R.u(); const f=spectrum('uv_'+(j+1), 'uv', 'A', xu, x=>0.1*cc*Math.exp(-(((x-320)/25)**2))+0.3*ii*Math.exp(-(((x-360)/30)**2))+0.004*R.g()); f.an.conc=c; F.push(f); });
  return F;
}
function refsOf(ctx){ const xr=grid(150,1850,2), comp=[[[480,30],[1085,25]],[[620,40],[1300,35],[1600,20]],[[900,50],[1450,30]]], out=[];
  comp.forEach((cc,k)=>{ const v=ctx.__refVector(Float64Array.from(xr), Float64Array.from(xr.map(x=>cc.reduce((s,[c,w])=>s+1000*pv(x,c,w,0.5),0))), 'I'); out.push({id:'r'+'ABC'[k], n:'Componente '+'ABC'[k], i:'raman', k:'I', x:v.x, y:v.y}); });
  const v=ctx.__refVector(Float64Array.from(xr), Float64Array.from(xr.map(x=>Math.exp(-(((x-1000)/80)**2)))), 'A'); out.push({id:'rF', n:'FTIR estraneo', i:'ftir', k:'A', x:v.x, y:v.y});
  return out; }

const OURS=/^(deconvoluzione|deconvolution|miscele_percentuali_in_peso|mixture_weight_percent|pls_.*|pca_.*)\.csv$/;
const SCEN=[
  {lang:'it', fits:true, pca:{pre:'snv', scale:'mean', zone:'all', k:'auto'}, pls:{pre:'none', scale:'mean', zone:'all'}, mix:true},
  {lang:'en', fits:'fixed', pca:{pre:'msc', scale:'auto', zone:'band', a:400, b:1500, k:'3'}, pls:{pre:'d1', scale:'mean', zone:'all'}, mix:true},
  {lang:'it', fits:false, pca:{pre:'d2', scale:'pareto', zone:'all', k:'2'}, pls:{pre:'snv', scale:'mean', zone:'band', a:280, b:420}, mix:false},
  {lang:'it', fits:false, pca:{pre:'none', scale:'mean', zone:'all', k:'auto'}, pls:null, mix:false},
];
function runJS(ctx, F, refs, sc){
  F.forEach(f=>{ delete f.fit; }); ctx.__lang(sc.lang); ctx.__state(F, F.filter(f=>f.include), sc.mix ? refs : []);
  const ft=F.filter(f=>f.instr==='ftir'), fits=[];
  if (sc.fits===true){ ctx.__fit(ft[0], [1590,1710], 'pv', 'lin', true); ctx.__fit(ft[1], [ft[1]._P.xs[0], ft[1]._P.xs[ft[1]._P.xs.length-1]], 'gauss', 'quad', false); ctx.__fit(ft[2], [1600,1700], 'lor', 'const', true); ctx.__fitAll(ft[0], ft[3]); }
  if (sc.fits==='fixed') ctx.__fit(ft[1], [1590,1712], 'pv', 'quad', false);
  if (sc.pca){ ctx.__mv('raman', sc.pca); ctx.__runPCA('raman'); }
  if (sc.pls){ ctx.__mv('uv', Object.assign({model:'pls'}, sc.pls)); const R=ctx.__pls('uv'); if (R.err) throw new Error(R.err); }
  const files=JSON.parse(JSON.stringify(ctx.__files())).filter(([n])=>OURS.test(n));   // JSON: array del contesto vm come array di qui
  return {files, F};
}
// numeri grezzi dell'app, dagli stessi oggetti che le tabelle leggono
function rawJS(ctx, F, sc){
  const g=s=>vm.runInContext(s, ctx), out={};
  out.fit=F.filter(f=>f.instr==='ftir' && f.fit).map(f=>[f.fit.r2].concat(...f.fit.peaks.map(q=>[q.c,q.w,q.eta,q.area,q.h,q.sc,q.sw,q.sarea,q.sh,q.pct])));
  out.pca=sc.pca ? [g('MVres.raman.P.explained').concat(...g('MVres.raman.P.scores')).concat(g('MVres.raman.lab'))] : [];
  out.pls=sc.pls ? [(R=>[R.A,R.r2,R.q2,R.rmsec,R.rmsecv].concat(R.pred, R.cvPred))(g('MVpls.uv'))] : [];
  out.mix=sc.mix ? F.filter(f=>f.include && ['raman','ftir'].includes(f.instr)).map(f=>ctx.__mix(f)).filter(Boolean).map(m=>[m.r2].concat(...m.list.map(o=>[o[1], m.w.w[o[0]].w, m.w.w[o[0]].sw]))) : [];
  return out;
}
function pyInput(F, refs, sc, ctx){
  const k=f=>F.indexOf(f), ft=F.filter(f=>f.instr==='ftir'), arr=a=>Array.from(a);
  const spettri=F.map(f=>({nome:f.name, titolo:f.title, tecnica:f.instr, kind:f.kind, elab:{base:f._base}}));
  const ch={}, cfgOf=f=>({range:f.fit.range, profile:f.fit.profile, bm:f.fit.bm, auto:f.fit.auto, semi:f._peaks||[]});
  if (sc.fits){ ch.deconvoluzione=ft.filter(f=>f.fit).map(f=>({i:k(f), nomeTecnica:vm.runInContext('NOME_IT.ftir', ctx), fit: f===ft[3] ? {range:f.fit.range, profile:f.fit.profile, bm:f.fit.bm, auto:false, copiaDa:{i:k(ft[0]), fit:cfgOf(ft[0])}} : cfgOf(f)})); }
  if (sc.pca) ch.pca=[{tecnica:'raman', cfg:sc.pca, spettri:F.filter(f=>f.instr==='raman').map(k)}];
  if (sc.pls){ const L=F.filter(f=>f.instr==='uv'); ch.pls=[{tecnica:'uv', cfg:Object.assign({model:'pls'}, sc.pls), spettri:L.map(k), conc:L.map(f=>f.an.conc==null?null:f.an.conc)}]; }
  if (sc.mix) ch.miscele={riferimenti:refs, tutti:F.map(f=>[k(f), f.an.mixW==null?null:f.an.mixW]), inclusi:F.filter(f=>f.include).map(k)};
  return {ric:{lingua:sc.lang, dec:sc.lang==='en'?'.':',', csep:sc.lang==='en'?',':';'}, ch, spettri,
    loaded:F.map(f=>[arr(f.xs), arr(f.ys)]), results:F.map(f=>({xs:arr(f._P.xs), ys:arr(f._P.ys), kind:f._P.kind, dir:f._P.dir, deriv:f._P.deriv}))};
}
const PYMAIN=`
import json as _j, sys as _s
_D=_j.load(open(_s.argv[1]))
_out=[]
for _c in _D:
    _raw={}
    _f=chemometria_files(_c['ch'], _c['ric'], _c['spettri'], _c['loaded'], _c['results'], _raw)
    _r={'fit':[[F['r2']]+[v for q in F['peaks'] for v in (q['c'],q['w'],q['eta'],q['area'],q['h'],q['sc'],q['sw'],q['sarea'],q['sh'],q['pct'])] for F in _raw.get('fit',[])],
        'pca':[R['P']['explained']+[v for s in R['P']['scores'] for v in s]+R['lab'] for R in _raw.get('pca',[])],
        'pls':[[R['A'],R['r2'],R['q2'],R['rmsec'],R['rmsecv']]+R['pred']+R['cvPred'] for R in _raw.get('pls',[])],
        'mix':[[m['r2']]+[v for i,fr in m['list'] for v in (fr, m['w']['w'][i]['w'], m['w']['w'][i]['sw'])] for m in _raw.get('mix',[])]}
    _out.append({'files':_f, 'raw':_r})
print(_j.dumps(_out))
`;
function lre(a, b){ if (a===b || (a==null && b==null)) return 16; if (a==null || b==null || !isFinite(a) || !isFinite(b)) return a===b?16:0; if (b===0) return a===0?16:Math.max(0,-Math.log10(Math.abs(a))); return Math.min(16, Math.max(0, -Math.log10(Math.abs(a-b)/Math.abs(b)))); }

test('il modulo Python della chemometria esiste e si concatena a acch_ricetta.py senza import', ()=>{
  const src=fs.readFileSync(path.join(PYDIR,'acch_chemometria.py'),'utf8');
  assert.ok(!/^\s*(import|from)\s+acch_ricetta/m.test(src), 'niente import di acch_ricetta: il modulo va concatenato');
  for (const fn of ['cm_fit_peaks','deconvolve','fit_eval','cm_pv_at','cm_hidden_bands','fit_csv_rows','preprocess_rows','msc_rows','pca_nipals','hotelling_ellipse','hca_ward','cut_tree','suggest_k','pca_csv_rows','pls_fit','pls_cv','nnls','mixture_of','mix_response','mix_weights','chemometria_files'])
    assert.match(src, new RegExp('\\ndef '+fn+'\\('), fn);
  // le righe dell'app che il test esegue: se cambiano, la trascrizione va rivista
  assert.match(FIT_CALL, /deconvolve\(xs, ys, \{seeds, profile:prof, base:bm, fixed:!auto\}\)/);
  assert.match(ALL_FIT, /\{profile:F\.profile, base:F\.bm\}/);
});

test('deconvoluzione, PCA, PLS e miscele: stessi CSV dell\'app e stessi numeri', {skip:!PY && 'python3 ≥ 3.10 non trovato: confronto con Python SALTATO', timeout:900000}, ()=>{
  const ctx=context(), F=build(), refs=refsOf(ctx), want=[], input=[];
  for (const sc of SCEN){ const {files}=runJS(ctx, F, refs, sc); want.push({files, raw:rawJS(ctx, F, sc)}); input.push(pyInput(F, refs, sc, ctx)); }
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'acch-chemo-')); let got;
  try{ fs.writeFileSync(path.join(d,'in.json'), JSON.stringify(input));
    const prog=fs.readFileSync(path.join(PYDIR,'acch_ricetta.py'),'utf8')+'\n'+fs.readFileSync(path.join(PYDIR,'acch_math.py'),'utf8')+'\n'+fs.readFileSync(path.join(PYDIR,'acch_chemometria.py'),'utf8')+`\nusa_motore('v8-fma' if ${JSON.stringify(process.arch)}=='arm64' else 'v8')\n`+PYMAIN;
    fs.writeFileSync(path.join(d,'p.py'), prog); const r=spawnSync(PY, ['-I', path.join(d,'p.py'), path.join(d,'in.json')], {encoding:'utf8', maxBuffer:1<<28});
    assert.strictEqual(r.status, 0, r.stderr); got=JSON.parse(r.stdout); } finally { fs.rmSync(d,{recursive:true,force:true}); }
  let minL=16, nNum=0, nFiles=0; const worst={};
  SCEN.forEach((sc,s)=>{
    const W=want[s], G=got[s];
    assert.deepStrictEqual(G.files.map(f=>f[0]), W.files.map(f=>f[0]), `scenario ${s+1}: file`);
    W.files.forEach(([nm,txt],q)=>{ nFiles++; const g=G.files[q][1]; if (g!==txt){ const a=g.split('\r\n'), b=txt.split('\r\n'); const i=b.findIndex((l,k)=>l!==a[k]); assert.fail(`scenario ${s+1}, ${nm}, riga ${i+1}:\n  Python: ${a[i]}\n  app:    ${b[i]}`); } });
    for (const key of ['fit','pca','pls','mix']){ assert.strictEqual(G.raw[key].length, W.raw[key].length, `scenario ${s+1}: ${key}`);
      W.raw[key].forEach((v,i)=>{ assert.strictEqual(G.raw[key][i].length, v.length, `scenario ${s+1}: ${key}[${i}]`); v.forEach((x,j)=>{ const L=lre(G.raw[key][i][j], x); nNum++; if (L<minL) minL=L; if (!(key in worst) || L<worst[key]) worst[key]=L; }); }); }
  });
  console.log(`# chemometria: ${nFiles} CSV identici all'app in ${SCEN.length} scenari; ${nNum} numeri grezzi, LRE minimo ${minL.toFixed(1)} (${Object.entries(worst).map(([k,v])=>k+' '+v.toFixed(1)).join(', ')})`);
  assert.ok(minL>=9, 'LRE minimo '+minL.toFixed(1)+' sotto 9 (1e-9 relativo)');
});
