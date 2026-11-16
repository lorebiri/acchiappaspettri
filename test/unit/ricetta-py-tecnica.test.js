// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I12, ricetta Python, parte «tecnica»: scripts/ricetta-py/acch_tecnica.py (concatenato dopo acch_ricetta.py) rifà
// parametri_per_tecnica.csv (techMetrics) e controllo_qualita.csv (assess) con lo stesso testo dell'app, in italiano e in inglese,
// su spettri SINTETICI. Il riferimento è il codice vero di index.html: il nucleo (CORE) più techMetrics, assess, analysisFiles e i
// loro aiuti, estratti dal sorgente; processed e viewOf sono sostituiti dai dati del caso (gli stessi che riceve Python).
// Si salta (e lo si dice) se python3 ≥ 3.10 manca; fallisce se il modulo Python manca.
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), os=require('os'), vm=require('vm'), {spawnSync}=require('child_process');
const ROOT=path.join(__dirname,'..','..'), PYDIR=path.join(ROOT,'scripts','ricetta-py'), MOD=path.join(PYDIR,'acch_tecnica.py');
const PY=(()=>{ for (const c of [process.env.PYTHON, 'python3'].filter(Boolean)){ const r=spawnSync(c, ['-c','import sys; print(sys.version_info>=(3,10))'], {encoding:'utf8'}); if (r.status===0 && /True/.test(r.stdout)) return c; } return null; })();

/* ---------- l'app in Node: nucleo + funzioni estratte da index.html ---------- */
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8'), lines=html.split('\n');
const core=html.slice(html.indexOf('/*CORE-START*/'), html.indexOf('/*CORE-END*/'));
// una funzione (o costante) di primo livello: dalla sua riga fino alla prossima dichiarazione di primo livello
function extract(name){ const re=new RegExp('^(function '+name+'\\(|const '+name+'\\s*=)'); const i=lines.findIndex(l=>re.test(l)); if (i<0) throw new Error('non trovata in index.html: '+name);
  let j=i+1; while (j<lines.length && !/^(function |const |let |var |async function |\/\*|\/\/|window\.|\}\)|[A-Za-z_$][\w$]*\s*=)/.test(lines[j])) j++; return lines.slice(i,j).join('\n'); }
const NAMES=['techMetrics','assess','analysisFiles','fmtN','fmtG','fmtSN','upData','hullBaseAt','eprZonesOf','eprZonesTxt','sticksLike','peakShape','flatTopPeaks','peakFwhmPts','pSmooth','baseAllowed','pBase','dscRate','esc','uiEn','CSV_NUM','csvCell','TECH_REF','XQ_DEFAULT','xqIntens','xqModel','xqCsvRows'];
function makeApp(){
  const ctx={console, Float64Array, Uint8Array, Math, TextDecoder, DataView, ArrayBuffer}; ctx.window=ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT,'app','sorption-core.js'),'utf8'), ctx);
  vm.runInContext(core, ctx, {filename:'index.html#core'});
  vm.runInContext(NAMES.map(extract).join('\n')+`
var S={showArea:true, showPeaks:true, spike:{}, smooth:{}, base:{}, sample:'gen', order:'file'}, files=[], INC=[], MV={}, MVres={}, MVpls={};
function processed(f){ return f._P; } function viewOf(f){ return {peaks:f._peaks}; } function suspectT(f){ return !!f._suspectT; }
function chanWarn(f){ return f._chanWarn||[]; } function chanOf(f){ return f._chanLabel||''; } function dispTitle(f){ return f.title; } function fkey(f){ return f._fkey; }
function included(){ return INC; } function hypotheses(){ return null; } function fitCsvRows(){ return []; } function fitValid(){ return false; } function mixtureOf(){ return null; }
function methodsText(){ return ''; } function mvCfg(i){ return MV[i]; } function mvFiles(){ return XQ; } function procKey(f){ return 'k'+f.id; } var XQ=[];
globalThis.APP={ set:(o)=>{ LANG=o.lang; window.AcchI18n={lang:o.lang}; S=Object.assign(S,o.S); files.length=0; files.push(...o.files); INC=o.inc; MV={}; if (o.xq){ MV.xrf=o.xq; XQ=o.files.filter(f=>f._xq); } else XQ=[]; }, analysisFiles, techMetrics, assess, upData, csvCell:(f)=>{ csvCell=f; }, csvCell0:csvCell,
  CONST:{XRF_COMMON, XRF_LINES, XRF_LN_GR, XRF_TUBES, FP:{el:Object.fromEntries(Object.entries(FP.el).map(([k,v])=>[k,{fam:v.fam}]))}} };`, ctx, {filename:'index.html#estratte'});
  return ctx;
}

/* ---------- dati sintetici (generatore deterministico) ---------- */
function rng(seed){ let s=seed>>>0; return ()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; }; }
function gauss(r){ let u=0; while (!u) u=r(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*r()); }
const lin=(a,b,n)=>Array.from({length:n},(_,i)=>a+(b-a)*i/(n-1));
const G=(x,c,w)=>Math.exp(-4*Math.LN2*((x-c)/w)**2), Lz=(x,c,w)=>1/(1+4*((x-c)/w)**2);

function cases(C){
  const r=rng(20261114), out=[]; let id=0;
  const mk=(o)=>{ const f=Object.assign({id:++id, name:'s'+id+'.csv', title:'s'+id, kind:'A', an:{}, removed:[], added:[], labels:{}}, o); f._fkey='k'+f.id; out.push(f); return f; };
  const peaksOf=(f, P, o)=>{ o=o||{}; const up=C.upData(P).y; let pk=C.findPeaks(P.xs, up, 1, o.sens||3, o.max||14).map(q=>({x:q.x, y:q.y, prom:q.prom, manual:false}));
    (o.add||[]).forEach(x=>pk.push({x, y:C.interpY(P.xs,P.ys,x), manual:true})); pk.sort((a,b)=>a.x-b.x);
    if (o.areas!==false){ const yA=o.areaY||up, ar=C.peakAreas(P.xs, yA, pk.map(p=>p.x)); pk.forEach((p,k)=>{ const a=ar[k]; if (a){ p.area=a.area*(o.netK||1); p.xa=a.xa; p.xb=a.xb; } }); }
    pk.forEach(p=>{ p.num=C.fmtPeak(f.instr,p.x,f.uncal,f); p.custom=false; p.name=''; p.sugg=[]; }); return pk; };
  // HPLC: picchi gaussiani, uno con coda, due vicini, deriva e rumore
  { const xs=lin(0,20,4000), ys=xs.map(x=>50*G(x,3,0.12)+30*G(x,7,0.2)+12*G(x,7.35,0.2)+40*(x>11.5?Math.exp(-(x-11.5)/0.35):0)*G(x,11.6,0.6)/G(11.6,11.6,0.6)+8*G(x,15,0.3)+0.2*x+0.15*gauss(r));
    const f=mk({instr:'hplc', kind:'mAU', xs, ys, an:{t0:1.1}}); f._P={xs, ys, kind:'mAU', dir:1, deriv:0}; f._peaks=peaksOf(f, f._P, {add:[18.2]}); }
  // HPLC senza t0, con un buco nell'asse e picco al bordo
  { let xs=lin(0,10,1500); xs=xs.filter(x=>!(x>4.95 && x<5.4)); const ys=xs.map(x=>20*G(x,2,0.1)+10*G(x,5.42,0.15)+0.05*gauss(r)+(x>9.7?15:0));
    const f=mk({instr:'hplc', kind:'mAU', xs, ys, nCols:3, an:{ycol:2}, _chanWarn:['Avviso di prova sul canale.']}); f._P={xs, ys, kind:'mAU', dir:1, deriv:0}; f._peaks=peaksOf(f, f._P); }
  // DSC: un endotermico e un esotermico
  { const xs=lin(30,300,2700), ys=xs.map(x=>-2*G(x,120,8)+1.2*G(x,220,12)+0.002*x+0.01*gauss(r)); const f=mk({instr:'dsc', kind:'HF', xs, ys, therm:{rate:10, yUnit:'W/g'}});
    const P={xs, ys, kind:'HF', dir:1, deriv:0}; f._P=P; const up=C.findPeaks(xs, ys, 1, 5, 4).map(q=>Object.assign(q,{side:1})), dn=C.findPeaks(xs, ys, -1, 5, 4).map(q=>Object.assign(q,{side:-1}));
    f._peaks=up.concat(dn).sort((a,b)=>a.x-b.x).map(p=>{ const yy=Float64Array.from(ys, v=>v*p.side), a=C.peakAreas(xs, yy, [p.x])[0]; const q=Object.assign({}, p, {manual:false, sign:p.side<0?'endo':'exo', num:C.fmtPeak('dsc',p.x), custom:false, name:'', sugg:[]}); if (a){ q.xa=a.xa; q.xb=a.xb; q.area=a.area*6; q.dH=q.area; q.dHu='ΔH (J/g)'; } return q; }); }
  // DSC senza velocità
  { const xs=lin(30,200,800), ys=xs.map(x=>G(x,100,6)+0.01*gauss(r)); const f=mk({instr:'dsc', kind:'HF', xs, ys}); f._P={xs, ys, kind:'HF', dir:1, deriv:0}; f._peaks=peaksOf(f, f._P).map(p=>Object.assign(p,{side:1, sign:'exo'})); }
  // TGA: due gradini, acqua sotto 150 °C
  { const xs=lin(25,800,3000), m=xs.map(x=>100-3/(1+Math.exp(-(x-80)/8))-40/(1+Math.exp(-(x-350)/15))-20/(1+Math.exp(-(x-600)/20))+0.005*gauss(r));
    const dtg=Array.from(C.derivLS(xs, m, Math.max(3, Math.round(m.length/150))), v=>-v); const f=mk({instr:'tga', kind:'W', xs, ys:m}); const P={xs, ys:m, kind:'W', dir:1, deriv:0, mass:m, dtg}; f._P=P;
    const pk=C.findPeaks(xs, dtg, 1, 3, 6), ar=C.peakAreas(xs, dtg, pk.map(p=>p.x)); f._peaks=pk.map((p,k)=>({x:p.x, y:C.interpY(xs,m,p.x), prom:p.prom, manual:false, xa:ar[k]&&ar[k].xa, xb:ar[k]&&ar[k].xb, area:ar[k]?Math.max(0, C.interpY(xs,m,ar[k].xa)-C.interpY(xs,m,ar[k].xb)):undefined, num:C.fmtPeak('tga',p.x), custom:false, name:'', sugg:[]})); }
  // UV-Vis: bordo di assorbimento con coda (assorbanza) e in riflettanza
  for (const an of [{}, {trans:'indirect'}, {data:'refl'}]){ const xs=lin(250,800,1101), ys=xs.map(x=>{ const E=1239.84/x; return (E>3.1?0.9*Math.sqrt(E-3.1)+0.05:0.05*Math.exp((E-3.1)/0.08))+0.4*G(x,300,30)+0.0005*gauss(r); });
    const f=mk({instr:'uv', kind:'A', xs, ys, an}); f._P={xs, ys, kind:'A', dir:1, deriv:0}; f._peaks=peaksOf(f, f._P); }
  // UV con assorbanza alta e rumore basso
  { const xs=lin(300,700,801), ys=xs.map(x=>2.2*G(x,450,60)+0.0003*gauss(r)-0.08*(x>680?1:0)); const f=mk({instr:'uv', kind:'A', xs, ys}); f._P={xs, ys, kind:'A', dir:1, deriv:0}; f._peaks=peaksOf(f, f._P); }
  // EPR: tre derivate (una con zone di fondo, una larga vicino al bordo) e un assorbimento
  const eprD=(c,w)=>x=>-(x-c)/w/(1+((x-c)/w)**2)**2;
  for (const [c,w,an,freq] of [[335,0.8,{},9.4],[336,0.5,{eprZ1a:320,eprZ1b:324,eprZ2a:346,eprZ2b:350},9.4],[333,5,{},null]]){ const xs=lin(320,350,2048), d=eprD(c,w), ys=xs.map(x=>100*d(x)+0.3*gauss(r));
    const f=mk({instr:'epr', kind:'E', xs, ys, an, freq}); f._P={xs, ys, kind:'E', dir:1, deriv:0}; f._peaks=[]; }
  { const xs=lin(3200,3500,1024), ys=xs.map(x=>50*Lz(x,3350,12)+0.2*gauss(r)); const f=mk({instr:'epr', kind:'E', xs, ys, eprConv:{by:'range', k:0.1}}); f._P={xs, ys, kind:'E', dir:1, deriv:0}; f._peaks=[]; }
  // NMR: integrali, un picco di riferimento, un picco negativo
  { const xs=lin(0,10,8000), ys=xs.map(x=>10*Lz(x,1.2,0.02)+20*Lz(x,3.4,0.02)+5*Lz(x,7.26,0.02)-3*Lz(x,5.0,0.03)+0.01*gauss(r)); const f=mk({instr:'nmr', kind:'I', nuc:'1H', xs, ys, an:{nmrX:3.4, nmrN:2}});
    f._P={xs, ys, kind:'I', dir:1, deriv:0}; f._peaks=peaksOf(f, f._P); if (f._peaks[0]){ f._peaks[0].custom=true; f._peaks[0].name='CH3'; } }
  // XRF: conteggi interi con fondo, righe di Fe, Cu, Pb; calibrazione spostata
  { const xs=lin(0.02,20.48,2048), sh=0.06, lam=xs.map(x=>30*Math.exp(-x/6)+800*G(x,6.40+sh,0.16)+150*G(x,7.06+sh,0.17)+500*G(x,8.05+sh,0.17)+80*G(x,8.90+sh,0.18)+300*G(x,10.55+sh,0.19)+200*G(x,12.61+sh,0.2)+60*G(x,3.69+sh,0.13)+40*G(x,17.48+sh,0.21));
    const ys=lam.map(l=>Math.max(0, Math.round(l+Math.sqrt(l)*gauss(r)))); const f=mk({instr:'xrf', kind:'I', xs, ys, xrf:{}, tube:'Rh', _currieOut:2}); const P={xs, ys, kind:'I', dir:1, deriv:0}; f._P=P;
    f._peaks=peaksOf(f, P, {areaY:ys, netK:1/((xs[xs.length-1]-xs[0])/(xs.length-1))}); f._peaks.forEach((p,k)=>{ p.sugg=k%3===2?[]:[{it:'riga '+k}]; }); if (f._peaks[1]){ f._peaks[1].custom=true; f._peaks[1].name='Fe Kβ <x>'; }
    f._auto=f._peaks.map(p=>({x:p.x, prom:p.prom})); }
  // XRF non calibrato e con canali negativi
  { const xs=lin(0,1023,1024), ys=xs.map(x=>Math.round(100*G(x,400,12)+5*gauss(r))); const f=mk({instr:'xrf', kind:'I', xs, ys, uncal:true, xrf:{}, importIssue:{dropped:3, total:1027}}); f._P={xs, ys, kind:'I', dir:1, deriv:0}; f._peaks=peaksOf(f, f._P); }
  // FTIR di un campione biologico: ammide I e II
  { const xs=lin(4000,400,3601), ys=xs.map(x=>0.5*G(x,1655,25)+0.3*G(x,1630,20)+0.15*G(x,1685,15)+0.35*G(x,1545,30)+0.2*G(x,2925,30)+0.1*G(x,1240,40)+0.0008*gauss(r));
    const f=mk({instr:'ftir', kind:'A', xs, ys, sample:'bio'}); f._P={xs, ys, kind:'A', dir:1, deriv:0}; f._peaks=peaksOf(f, f._P, {sens:2}); }
  // FTIR satura, con fondo alto
  { const xs=lin(4000,600,1701), ys=xs.map(x=>Math.min(2.6, 3.5*G(x,1700,40))+0.6+0.0001*x+0.002*gauss(r)); const f=mk({instr:'ftir', kind:'A', xs, ys}); f._P={xs, ys, kind:'A', dir:1, deriv:0}; f._peaks=peaksOf(f, f._P); }
  // Raman: carbonio D e G, con laser; raggi cosmici
  { const xs=lin(800,2000,1201), ys=xs.map(x=>60*Lz(x,1350,50)+100*Lz(x,1590,30)+0.02*x+0.8*gauss(r)); ys[300]+=400; ys[700]+=300;
    const f=mk({instr:'raman', kind:'I', xs, ys, an:{laser:532}}); f._P={xs, ys:Array.from(C.despike(ys).ys), kind:'I', dir:1, deriv:0}; f._peaks=peaksOf(f, f._P); }
  // Fluorescenza: campione e standard
  for (const k of [1,0.6]){ const xs=lin(400,700,601), ys=xs.map(x=>k*100*G(x,520,40)+0.3*gauss(r)); const f=mk({instr:'fluo', kind:'FL', xs, ys}); f._P={xs, ys, kind:'FL', dir:1, deriv:0}; f._peaks=peaksOf(f, f._P); }
  out[out.length-2].an={qyRef:out[out.length-1]._fkey, phiR:0.95, As:0.05, Ar:0.04};
  // bastoncini di un calcolo, dato calcolato, file con note di lettura
  { const xs=[], ys=[]; for (let i=0;i<400;i++){ xs.push(400+i*3); ys.push(i%37===0?100*r():0); } const f=mk({instr:'ftir', kind:'A', xs, ys, importNotes:['Una nota di prova', 'NTUPLES non letto'], importBad:[], reason:'intervallo IR', autoInstr:'ftir', importIssue:{thou:12, after:40, midText:true}}); f._P={xs, ys, kind:'A', dir:1, deriv:0}; f._peaks=[]; }
  { const xs=lin(400,4000,50), ys=xs.map(x=>G(x,1700,30)); const f=mk({instr:'raman', kind:'I', xs, ys, an:{calc:true}}); f._P={xs, ys, kind:'I', dir:1, deriv:0}; f._peaks=[]; }
  // HPLC con più canali, polarità invertita; generico con dati irregolari
  { const xs=lin(0,10,1200), ys=xs.map(x=>-30*G(x,4,0.1)+2*G(x,6,0.1)+0.05*gauss(r)); const f=mk({instr:'hplc', kind:'mAU', xs, ys, importIssue:{after:300, channel:true}, afterCh:200, chIx:0, nChan:3, _chanLabel:'DAD1A 254 nm'}); f._P={xs, ys, kind:'mAU', dir:1, deriv:0}; f._peaks=peaksOf(f, f._P); }
  { const xs=[]; let x=0; for (let i=0;i<600;i++){ x+=(i%5===0?3:1); xs.push(x); } const ys=xs.map(x=>10*G(x,300,4)+5*G(x,500,40)+0.05*gauss(r)); const f=mk({instr:'gen', kind:'I', xs, ys, an:{pSm:9}}); f._P={xs, ys:Array.from(C.sgSmooth(ys,9)), kind:'I', dir:1, deriv:0}; f._peaks=peaksOf(f, f._P); }
  // XRF: leghe di rame (Cu, Zn, Sn, Pb) con tubo Rh e Compton; quattro standard e due campioni
  const comp=[[85,10,4,1],[70,25,3,2],[90,2,7,1],[60,35,1,4],[80,12,6,2],[75,20,3,2]], E={Cu:[8.047,8.905], Zn:[8.639,9.572], Sn:[25.271,28.486], Pb:[10.551,12.614]};
  comp.forEach((w,k)=>{ const xs=lin(0.02,30.0,1500), el=['Cu','Zn','Sn','Pb'], lam=xs.map(x=>{ let v=20*Math.exp(-x/8)+600*G(x,19.1,0.6); el.forEach((e,j)=>{ const I=w[j]*(e==='Sn'?3:e==='Pb'?8:20)*(1-0.002*w[0]*(e==='Zn')); v+=I*G(x,E[e][0],C.xrfFWHM(E[e][0]))+0.15*I*G(x,E[e][1],C.xrfFWHM(E[e][1])); }); return v; });
    const ys=lam.map(l=>Math.max(0, Math.round(l+Math.sqrt(l)*gauss(r)))), f=mk({instr:'xrf', kind:'I', xs, ys, xrf:{}, tube:'Rh', _xq:true, an:k<4?{std:{Cu:w[0], Zn:w[1], Sn:w[2], Pb:w[3]}}:{}});
    f._P={xs, ys, kind:'I', dir:1, deriv:0}; f._peaks=peaksOf(f, f._P, {areaY:ys}); f._auto=[]; });
  const F=a=>a==null?a:Float64Array.from(a);   // l'app tiene i dati in Float64Array
  out.forEach(f=>{ f.xs=F(f.xs); f.ys=F(f.ys); for (const k of ['xs','ys','mass','dtg']) f._P[k]=F(f._P[k]); });
  return out;
}

/* ---------- l'ingresso di Python: lo stesso caso, nei nomi dello schema di acch_tecnica ---------- */
const arr=a=>a==null?null:Array.from(a);
function voce(C, f, S){ const P=f._P; return {id:f.id, nome:f.name, titolo:f.title, nomeIt:C.NOME_IT[f.instr], instr:f.instr, kind:f.kind, xs:arr(f.xs), ys:arr(f.ys), an:f.an||{}, uncal:!!f.uncal, ecal:!!f.ecal, freq:f.freq,
  eprConv:f.eprConv, nuc:f.nuc, sample:f.sample||S.sample, fkey:f._fkey, smooth:C.pSmooth(f), base:C.pBase(f), removed:f.removed, importNotes:f.importNotes, importBad:f.importBad, reason:f.reason, autoInstr:f.autoInstr,
  importIssue:f.importIssue, afterCh:f.afterCh, nCols:f.nCols, chIx:f.chIx, blockIx:f.blockIx, nChan:f.nChan, nBlocks:f.nBlocks, isXrf:!!f.xrf, chanLabel:f._chanLabel, chanWarn:f._chanWarn, suspectT:!!f._suspectT,
  auto:f._auto, tube:f.tube, xq:!!f._xq, currieOut:f._currieOut, userRate:f.userRate, therm:f.therm, ts:arr(f.ts),
  P:{xs:arr(P.xs), ys:arr(P.ys), kind:P.kind, dir:P.dir, deriv:P.deriv||0, mass:arr(P.mass), dtg:arr(P.dtg)},
  peaks:f._peaks.map(p=>({x:p.x, y:p.y, prom:p.prom, xa:p.xa, xb:p.xb, side:p.side, sign:p.sign, custom:p.custom, name:p.name, area:p.area, dH:p.dH, dHu:p.dHu, sugg:(p.sugg||[]).map(s=>({it:s.it})), num:p.num}))}; }

function runJs(ctx, list, lang, S, xq){
  const A=ctx.APP; A.csvCell(A.csvCell0); const trad={};
  if (lang==='en'){ const w={}; vm.runInNewContext(fs.readFileSync(path.join(ROOT,'i18n','en.js'),'utf8'), {window:w}); const I=require(path.join(ROOT,'app','i18n.js'))({ACCH_EN:w.ACCH_EN, navigator:{language:'en'}, AcchHost:{store:{getItem:()=>JSON.stringify('en'), setItem(){}}}});
    const oc=A.csvCell0, tr=(c,sep)=>oc(typeof c==='string'?I.tr(c):c, sep);   // come i18n.js (wrap di csvCell), registrando le coppie come pyRecipe
    A.csvCell(function(c, sep){ const o=tr(c, sep); if (typeof c==='string' && /\p{L}/u.test(c)){ let t=tr(c,'\u0001'); if (/^"[\s\S]*"$/.test(t) && t.length>=2) t=t.slice(1,-1).replace(/""/g,'"'); if (t[0]==="'" && /^[=+\-@\t\r]/.test(t.slice(1)) && !ctx.CSV_NUM_T(t.slice(1))) t=t.slice(1); if (t!==c) trad[c]=t; } return o; }); }
  A.set({lang, S, files:list, inc:list, xq}); list.forEach(f=>f._peaks.forEach(p=>{ p.num=ctx.fmtPeak(f.instr, p.x, f.uncal, f); }));   // viewOf rifà p.num nella lingua
  const out={}; A.analysisFiles().forEach(([n,t])=>{ if (/^(controllo_qualita|quality_check|parametri_per_tecnica|technique_parameters|composizione_xrf|xrf_composition)\./.test(n)) out[n]=t; });
  A.csvCell(A.csvCell0); return {out, trad};
}

function runPy(input){
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'acch-tec-')); try{
    fs.writeFileSync(path.join(d,'in.json'), JSON.stringify(input));
    const drv=`
import json as _j
_I=_j.load(open(${JSON.stringify(path.join(d,'in.json'))}, encoding='utf-8'))
carica_costanti(_I['costanti'])
_R=[]
for _c in _I['giri']:
    TRAD.clear(); TRAD.update(_c['trad'])
    _ctx={'lang':_c['lang'], 'S':_c['S'], 'files':_I['voci']}
    _o={}
    for _f in (controllo_qualita_csv, parametri_per_tecnica_csv):
        _r=_f(_I['voci'], _ctx)
        if _r: _o[_r[0]]=_r[1]
    _r=composizione_xrf_csv(_c['xq'], [_v for _v in _I['voci'] if _v.get('xq')], _ctx)
    if _r: _o[_r[0]]=_r[1]
    _R.append(_o)
_V={}
_V['chrom']=[chrom_metrics(_v['P']['xs'], up_data(_v['P']), [{'x':p['x'],'xa':p.get('xa'),'xb':p.get('xb')} for p in _v['peaks']], (_v['an'] or {}).get('t0')) for _v in _I['voci'] if _v['instr']=='hplc']
_V['epr']=[(epr_double_integral(_v['P']['xs'], _v['P']['ys'], epr_zones_of(_v['an'])) or {}).get('di') for _v in _I['voci'] if _v['instr']=='epr']
_V['tauc']=[(lambda t: t and [t['Eg'], t['EgAxis'], t['fit']['r2']])(tauc_gap(_v['P']['xs'], _v['P']['ys'], {})) for _v in _I['voci'] if _v['instr']=='uv']
_V['sq']=[(lambda q: [q['snr'], q['bgRatio'], q['wPts'], q['irregular'], q['flat']])(signal_quality(_v['xs'], _v['ys'], 1, False)) for _v in _I['voci'] if len(_v['ys'])>=20]
_V['hb']=[[h['x'] for h in cm_hidden_bands(_v['P']['xs'], up_data(_v['P']), None)] for _v in _I['voci'] if len(_v['ys'])>=20]
_xr=[_v for _v in _I['voci'] if _v['instr']=='raman' and not _v['an'].get('calc')][0]
_U=up_data(_xr['P']); _fit=cm_fit_peaks(_xr['P']['xs'], _U, [{'x':1350,'w':60},{'x':1590,'w':40}], {'profile':'lor','base':'lin'})
_fit2=cm_fit_peaks(_xr['P']['xs'], _U, [{'x':1350,'w':60},{'x':1590,'w':40}], {'profile':'pv','base':'quad'})
_V['fit']=[[q['c'],q['w'],q['area'],q['h']] for q in _fit['peaks']]+[[q['c'],q['w'],q['area'],q['eta']] for q in _fit2['peaks']]+[[_fit['r2'],_fit2['r2'],0,0]]
_xf=[_v for _v in _I['voci'] if _v['instr']=='xrf' and not _v['uncal']][0]
_al=xrf_align_fit([{'x':q['x'],'w':q.get('prom') or 1} for q in _xf['auto']], _xf['tube'])
_V['align']=[_al['a'], _al['b']]+[q['name'] for q in _al['pairs']]
_NT=[]
for _f in (lambda: composizione_fp_csv([], {}), lambda: spessore_strati_csv([], {}), lambda: xq_model({'qEls':['Cu'],'qModel':'fp'}, []),
           lambda: tech_metrics({'instr':'sorp','iso':{},'P':{'xs':[0],'ys':[0],'kind':'I','dir':1}}, {}), lambda: assess({'instr':'chem','chem':{},'P':{}}, {})):
    try:
        _f(); _NT.append(None)
    except NonTrascritto as _e:
        _NT.append(str(_e))
print(_j.dumps({'csv':_R, 'num':_V, 'nt':_NT}))
`;
    const prog=fs.readFileSync(path.join(PYDIR,'acch_ricetta.py'),'utf8')+'\n'+fs.readFileSync(path.join(PYDIR,'acch_math.py'),'utf8')+'\n'+fs.readFileSync(path.join(PYDIR,'acch_chemometria.py'),'utf8')+'\n'+fs.readFileSync(MOD,'utf8')+`\nusa_motore('v8-fma' if ${JSON.stringify(process.arch)}=='arm64' else 'v8')\n`+drv;
    fs.writeFileSync(path.join(d,'p.py'), prog); const r=spawnSync(PY, ['-I', path.join(d,'p.py')], {encoding:'utf8', maxBuffer:1<<28});
    assert.strictEqual(r.status, 0, r.stderr); return JSON.parse(r.stdout);
  } finally { fs.rmSync(d,{recursive:true,force:true}); }
}
const lre=(a,b)=>{ if (a===b) return 15; if (typeof a!=='number' || typeof b!=='number') return 0; if (!isFinite(a)||!isFinite(b)) return Object.is(a,b)?15:0; const d=Math.abs(a-b)/Math.max(Math.abs(a),Math.abs(b),1e-300); return d===0?15:Math.min(15,-Math.log10(d)); };

test('il modulo Python della parte tecnica esiste', ()=>{ assert.ok(fs.existsSync(MOD), 'manca '+MOD); });

test('parametri_per_tecnica.csv e controllo_qualita.csv: testo identico all\'app (IT, EN) e numeri interni entro 1e-9', {skip:!PY && 'python3 ≥ 3.10 non trovato'}, ()=>{
  assert.ok(fs.existsSync(MOD), 'manca '+MOD);
  const ctx=makeApp(); vm.runInContext('globalThis.CSV_NUM_T=s=>CSV_NUM.test(s);', ctx);
  const C={upData:ctx.upData, findPeaks:ctx.findPeaks, peakAreas:ctx.peakAreas, interpY:ctx.interpY, fmtPeak:ctx.fmtPeak, derivLS:ctx.derivLS, despike:ctx.despike, sgSmooth:ctx.sgSmooth,
    NOME_IT:vm.runInContext('NOME_IT', ctx), pSmooth:ctx.pSmooth, pBase:ctx.pBase, xrfFWHM:ctx.xrfFWHM};
  const list=cases(C), S={showArea:true, showPeaks:true, spike:{raman:false}, sample:'gen'};
  const giri=[], want=[];
  const XQ=[{qEls:['Cu','Zn','Sn','Pb'], qModel:'auto'}, {qEls:['Cu','Zn','Sn','Pb'], qModel:'linear', q100:false}, {qEls:['Pb','Cu','Zn','As'], qModel:'auto'}];
  for (const [lang, S2, xq] of [['it', S, XQ[0]], ['en', S, XQ[1]], ['it', Object.assign({}, S, {showArea:false, spike:{raman:true}}), XQ[2]]]){ const J=runJs(ctx, list, lang, S2, xq); want.push(J.out); giri.push({lang, S:S2, trad:J.trad, xq}); }
  const voci=list.map(f=>voce(C, f, S));
  let t0=Date.now(); const got=runPy({voci, giri, costanti:ctx.APP.CONST}); console.log('# python: '+(Date.now()-t0)+' ms');
  assert.ok(want.every(w=>Object.keys(w).some(n=>/^(composizione_xrf|xrf_composition)\.csv$/.test(n))), 'il caso XRF deve produrre la composizione');
  assert.ok(got.nt.every(t=>typeof t==='string' && /non trascritt/.test(t)), 'le parti non trascritte si fermano con NonTrascritto: '+JSON.stringify(got.nt));
  // testo identico, file per file
  let nRighe=0;
  want.forEach((w,g)=>{ assert.deepStrictEqual(Object.keys(got.csv[g]).sort(), Object.keys(w).sort(), 'file prodotti, giro '+g);
    for (const [n,t] of Object.entries(w)){ const a=got.csv[g][n].split('\r\n'), b=t.split('\r\n'); nRighe+=b.length; const diff=[]; b.forEach((l,i)=>{ if (a[i]!==l) diff.push(`${n} riga ${i}:\n  py: ${a[i]}\n  js: ${l}`); }); if (a.length!==b.length) diff.push(`${n}: ${a.length} righe invece di ${b.length}`); assert.deepStrictEqual(diff.slice(0,6), [], 'giro '+g); } });
  // numeri interni
  const P=f=>({xs:f._P.xs, ys:f._P.ys, kind:f._P.kind, dir:f._P.dir}), js={
    chrom:list.filter(f=>f.instr==='hplc').map(f=>ctx.chromMetrics(f._P.xs, ctx.upData(f._P).y, f._peaks.map(p=>({x:p.x, xa:p.xa, xb:p.xb})), f.an.t0).map(c=>Object.fromEntries(['tR','H','sn','w50','N','tailing','asym','k','rs'].map(k=>[k, c[k]])))),
    epr:list.filter(f=>f.instr==='epr').map(f=>{ const r=ctx.eprDoubleIntegral(f._P.xs, f._P.ys, ctx.eprZonesOf(f)); return r?r.di:null; }),
    tauc:list.filter(f=>f.instr==='uv').map(f=>{ const t=ctx.taucGap(f._P.xs, f._P.ys, {}); return t?[t.Eg, t.EgAxis, t.fit.r2]:null; }),
    sq:list.filter(f=>f.ys.length>=20).map(f=>{ const q=ctx.signalQuality(f.xs, f.ys, 1, false); return [q.snr, q.bgRatio, q.wPts, q.irregular, q.flat]; }),
    hb:list.filter(f=>f.ys.length>=20).map(f=>ctx.hiddenBands(f._P.xs, ctx.upData(P(f)).y).map(h=>h.x)) };
  { const f=list.find(f=>f.instr==='raman' && !f.an.calc), U=ctx.upData(f._P).y, a=ctx.fitPeaks(f._P.xs, U, [{x:1350,w:60},{x:1590,w:40}], {profile:'lor', base:'lin'}), b=ctx.fitPeaks(f._P.xs, U, [{x:1350,w:60},{x:1590,w:40}], {profile:'pv', base:'quad'});
    js.fit=a.peaks.map(q=>[q.c,q.w,q.area,q.h]).concat(b.peaks.map(q=>[q.c,q.w,q.area,q.eta]), [[a.r2,b.r2,0,0]]); }
  { const f=list.find(f=>f.instr==='xrf' && !f.uncal), al=ctx.xrfAlignFit(f._auto.map(q=>({x:q.x, w:q.prom||1})), f.tube); js.align=[al.a, al.b].concat(al.pairs.map(q=>q.name)); }
  // soglia 1e-9 relativo; signalQuality passa da arPLS, che amplifica l'ultima cifra di Math.exp (V8, fdlibm con FMA su arm64) diversa da
  // math.exp della libm: lì si dichiara l'LRE ottenuto (soglia 6), come chiede il brief
  const LIM={sq:6}, minG={}; let nNum=0;
  const walk=(a,b,k,g)=>{ if (Array.isArray(b)){ assert.ok(Array.isArray(a), k); assert.strictEqual(a.length, b.length, k+' lunghezza'); b.forEach((v,i)=>walk(a[i], v, k+'['+i+']', g)); return; }
    if (b && typeof b==='object'){ for (const q of Object.keys(b)) walk(a[q], b[q], k+'.'+q, g); return; }
    if (typeof b==='number' && isFinite(b)){ nNum++; const l=lre(a,b); minG[g]=Math.min(minG[g]==null?15:minG[g], l); assert.ok(l>=(LIM[g]||9), `${k}: ${a} invece di ${b}`); } else assert.deepStrictEqual(a==null?null:a, b==null?null:b, k); };
  for (const k of Object.keys(js)) walk(got.num[k], JSON.parse(JSON.stringify(js[k])), k, k);
  const minL=Math.min(...Object.values(minG));
  console.log('# LRE minimo per gruppo: '+Object.entries(minG).map(([k,v])=>k+' '+v.toFixed(1)).join(', '));
  console.log(`# parte tecnica: ${list.length} spettri, ${nRighe} righe CSV identiche in 3 giri (IT, EN, IT senza aree), ${nNum} numeri interni, LRE minimo ${minL.toFixed(1)}`);
});
