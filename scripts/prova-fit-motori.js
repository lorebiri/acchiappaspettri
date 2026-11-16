// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I7, prova per fit e XRF FP: lo stesso nucleo JS eseguito nei due motori JavaScript del desktop, V8 (WebView2 su Windows, Node) e
// JavaScriptCore (WKWebView su macOS, WebKitGTK su Linux), dà gli stessi risultati? fitPeaks e deconvolve sui casi di R3 (senza rumore
// e con rumore), xrfFP sugli spettri sintetici di test/fixtures/xrf-c25. Se il riferimento JS stesso cambia fra un motore e l'altro, un
// Rust «identico al JS» non è definito bit per bit: vale il criterio dei parametri entro 1e-9 relativo.
// Uso (macOS, dove c'è jsc): node scripts/prova-fit-motori.js
'use strict';
const fs=require('fs'), path=require('path'), os=require('os'), {execFileSync}=require('child_process');
const R=path.join(__dirname,'..'), JSC='/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc';
const html=fs.readFileSync(R+'/index.html','utf8'), src=html.slice(html.indexOf('/*CORE-START*/'), html.indexOf('/*CORE-END*/'));
const C=require(R+'/test/unit/load-core.js'), FX=R+'/test/fixtures/xrf-c25', X={};
for (const f of fs.readdirSync(FX)){ const p=C.parseXRF(fs.readFileSync(path.join(FX,f),'utf8')); X[f]={xs:Array.from(p.xs), ys:Array.from(p.ys)}; }
const body=`
var out={};
var SQ=Math.sqrt(Math.LN2/Math.PI), pvf=function(x,c,w,e){ var t=(x-c)/w; return e*2/(Math.PI*w)/(1+4*t*t)+(1-e)*2*SQ/w*Math.exp(-4*Math.LN2*t*t); };
var SEP=[{c:40,w:6,A:300,eta:0.3},{c:60,w:8,A:200,eta:0.7}], OVL=[{c:45,w:8,A:300,eta:0.5},{c:54,w:8,A:200,eta:0.5}];
var SEP4=[{c:20,w:5,A:300,eta:0.2},{c:35,w:6,A:200,eta:0.5},{c:55,w:7,A:400,eta:0.8},{c:75,w:5,A:150,eta:0.4}], OVL4=[{c:30,w:8,A:300,eta:0.3},{c:40,w:8,A:200,eta:0.6},{c:55,w:10,A:400,eta:0.5},{c:66,w:8,A:250,eta:0.4}];
var sd=7, rn=function(){ sd=(sd*16807)%2147483647; return sd/2147483647-0.5; };
['gauss','lor','pv'].forEach(function(prof){ [['SEP',SEP],['OVL',OVL],['SEP4',SEP4],['OVL4',OVL4]].forEach(function(c){ [0,0.3].forEach(function(noise){
  var P=c[1], xs=Float64Array.from({length:1001},function(_,i){return i*0.1;}), ys=Float64Array.from(xs,function(x){ return P.reduce(function(s,p){ return s+p.A*pvf(x,p.c,p.w,prof==='pv'?p.eta:prof==='lor'?1:0); },0)+noise*rn(); });
  var k=prof+'/'+c[0]+'/'+noise;
  var f=fitPeaks(xs, ys, P.map(function(p){return {x:p.c, w:p.w};}), {profile:prof}); out['fitPeaks '+k]=f && f.peaks.map(function(q){ return [q.c,q.w,q.area,q.eta,q.sc,q.sw,q.sarea]; }).concat([[f.ssr,f.iter,f.bic]]);
  var d=deconvolve(xs, ys, {profile:prof}); out['deconvolve '+k]=d && d.peaks.map(function(q){ return [q.c,q.w,q.area,q.eta]; }).concat([[d.ssr,d.bic]]); }); }); });
Object.keys(XD).forEach(function(f){ try{ var S=fpSetup({anode:'Ag', kv:40, psi1:45, psi2:45}), r=xrfFP(Float64Array.from(XD[f].xs), Float64Array.from(XD[f].ys), ['Ag','Cu','Sn','Pb','As','Zn','Fe'], S, {mode:'norm'});
  var res=r && r.Q && r.Q.res; out['xrfFP '+f]=res ? Object.keys(res).sort().map(function(e){ return [e, res[e].w]; }) : null; }catch(e){ out['xrfFP '+f]='errore '+e; } });
print(JSON.stringify(out));`;
const H=src+'\nvar XD='+JSON.stringify(X)+';\n'+body;
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'acch-motori-')), f=path.join(tmp,'h.js'), fn=path.join(tmp,'hn.js');
fs.writeFileSync(f, H); fs.writeFileSync(fn, 'var print=function(s){console.log(s)};'+H);
const v8=JSON.parse(execFileSync(process.execPath,[fn],{maxBuffer:1<<26}));
if (!fs.existsSync(JSC)){ console.log('jsc non trovato: la prova serve macOS'); process.exit(0); }
const jc=JSON.parse(execFileSync(JSC,[f],{maxBuffer:1<<26})); fs.rmSync(tmp,{recursive:true,force:true});
// parametri: c, w, area, eta (fit) e % in peso (XRF); altro: errori standard, SSR, BIC, iterazioni
const rel=(a,b)=>a===b ? 0 : Math.abs(a-b)/Math.max(Math.abs(a),Math.abs(b));
const S={};
for (const k of Object.keys(v8)){ const fn=k.split(' ')[0], a=v8[k], b=jc[k], s=S[fn]=S[fn]||{casi:0, bitPerBit:0, strutturaDiversa:0, parametriMaxRel:0, altroMaxRel:0, iterazioniDiverse:0};
  s.casi++; if (JSON.stringify(a)===JSON.stringify(b)){ s.bitPerBit++; continue; } if (!a || !b || a.length!==b.length){ s.strutturaDiversa++; continue; }
  if (fn==='xrfFP'){ a.forEach((r,i)=>{ if (r[0]!==b[i][0]) s.strutturaDiversa++; else s.parametriMaxRel=Math.max(s.parametriMaxRel, rel(r[1],b[i][1])); }); continue; }
  for (let i=0;i<a.length-1;i++) a[i].forEach((v,j)=>{ const d=rel(v,b[i][j]); if (j<4) s.parametriMaxRel=Math.max(s.parametriMaxRel,d); else s.altroMaxRel=Math.max(s.altroMaxRel,d); });
  const L=a[a.length-1], M=b[b.length-1]; if (fn==='fitPeaks' && L[1]!==M[1]) s.iterazioniDiverse++; s.altroMaxRel=Math.max(s.altroMaxRel, rel(L[0],M[0])); }
console.log(JSON.stringify(S,null,1));
