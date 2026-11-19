// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Prototipo di STUDIO: il motore FP di Acchiappaspettri (nucleo di index.html) sugli stessi due spettri del confronto con PyMca.
// Uso: node acch_confronto.js <percorso di Steel.spe di PyMca>
const fs=require('fs'), path=require('path'), vm=require('vm');
const root=path.join(__dirname,'..','..'), html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const src=html.slice(html.indexOf('/*CORE-START*/'), html.indexOf('/*CORE-END*/'));
const ctx={console, Float64Array, Math, AcchBaseline:require(path.join(root,'app','baseline-core.js'))}; vm.createContext(ctx);
vm.runInContext(src+';globalThis.C={fpSetup,fpPrep,xrfFP,FP_CACHE,parseXRF};', ctx); const C=ctx.C;
const els=['Cu','Sn','Pb','Zn','As'];
// 1) bronzo sintetico di examples/ (tubo Rh 40 kV, intestazione del file)
const txt=fs.readFileSync(path.join(root,'examples','xrf-lega-sintetico','BRONZO_SIMULATO_Rh40kV_SINTETICO.mca'),'utf8');
const ys=Float64Array.from(txt.split('\n').filter(l=>l.trim() && l.trim()[0]!=='#').map(Number)), xs=Float64Array.from(ys, (_,i)=>i*40.94/2047);
let S=C.fpSetup({anode:'Rh', kv:40, psi1:45, psi2:45});
let R=C.xrfFP(xs, ys, els, S, {mode:'norm'}); const bronze={}; for (const e of els) bronze[e]=R.Q.res[e].w/100;
// 2) Steel.spe di PyMca: eccitazione monocromatica 16 keV. Acchiappaspettri non la prevede: si sostituisce lo spettro del tubo nella cache con una sola riga a 16 keV.
const spe=fs.readFileSync(process.argv[2],'utf8').split('$DATA:')[1].trim().split(/\s+/).slice(2).map(Number);
const ys2=Float64Array.from(spe), xs2=Float64Array.from(ys2,(_,i)=>-0.00612446976449+0.0119281593146*i);
const S2=C.fpSetup({anode:'Ag', kv:30, psi1:45, psi2:45, beD:20, si:350, d1:0, d2:5}); const P=C.fpPrep(S2);
P.E=Float64Array.of(16); P.N=Float64Array.of(1); P.nb=1; P.mu={}; P.sig={};
const els2=['Cr','Mn','Fe','Ni','Cu','V'];
const R2=C.xrfFP(xs2, ys2, els2, S2, {mode:'norm', lo:4.5, hi:15}); const steel={}; for (const e of els2) steel[e]=R2.Q.res[e]?R2.Q.res[e].w/100:null;
console.log(JSON.stringify({bronze, bronzeChi2r:R.fit.chi2r, steel, steelChi2r:R2.fit.chi2r}, null, 1));
