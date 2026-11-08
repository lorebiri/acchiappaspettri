// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// R6 (ciclo 26): un'assorbanza FTIR vera con il fondo alto (0,45–0,5) e bande fino a 0,95 non va presa per trasmittanza
// in frazione; la trasmittanza 0–1 vera (fondo in alto, bande verso il basso) resta riconosciuta. Dati SINTETICI.
// Uso: PW_CHANNEL=chrome node --test test/validation/r6-ftir-fondo-alto.test.js
'use strict';
const {describe, it, before}=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path');
const B=require('./browser.js');
const X=Array.from({length:1801},(_,i)=>4000-i*2);
const band=(x,c,w)=>Math.exp(-0.5*Math.pow((x-c)/w,2));
const bands=[[2915,15,1],[2848,12,0.8],[1715,10,0.35],[1465,8,0.4],[720,6,0.25]];
const A=x=>0.45+0.05*(4000-x)/3600+0.45*bands.reduce((s,[c,w,h])=>s+h*band(x,c,w),0);   // assorbanza, fondo alto
const Tf=x=>0.95-0.65*bands.reduce((s,[c,w,h])=>s+h*band(x,c,w),0);                         // trasmittanza in frazione
const csv=(f,head)=>(head?head+'\n':'')+X.map(x=>x+','+f(x).toFixed(6)).join('\n');
const FTIR_T=fs.readFileSync(path.join(B.ROOT,'test','corpus','c','64_ftir_T_fraction.txt'),'utf8');
const CASES=[['A_con_intestazione.csv', csv(A,'Wavenumber (cm-1),Absorbance'), false],
             ['A_senza_intestazione.csv', csv(A,''), false],
             ['T_frazione.csv', csv(Tf,'Wavenumber (cm-1),Value'), true],
             ['64_ftir_T_fraction.txt', FTIR_T, true]];

describe('R6 FTIR: assorbanza con il fondo alto e trasmittanza in frazione', {timeout:3*60*1000}, ()=>{
  let R;
  before(async ()=>{ const server=await B.startServer(), br=await B.launch();
    try{ const {ctx, p, errors}=await B.openPage(br, server, {lang:'it'});
      R=await p.evaluate(async (L)=>{
        await addEntries(L.map(([n,t])=>({file:new File([t],n),path:n}))); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
        return L.map(([n])=>{ const f=files.find(g=>g.name===n); return {n, instr:f&&f.instr, kind:f&&f.kind, t:f?suspectT(f):null}; });
      }, CASES.map(([n,t])=>[n,t]));
      R.errors=errors; await ctx.close();
    } finally { await br.close(); server.close(); } }, {timeout:3*60*1000});
  for (const [n,,exp] of CASES) it(`${n}: ${exp?'riconosciuto come trasmittanza in frazione':'resta assorbanza, nessun avviso di trasmittanza'}`, ()=>{
    const o=R.find(r=>r.n===n); assert.ok(o && o.instr==='ftir', JSON.stringify(o)); assert.strictEqual(o.t, exp, JSON.stringify(o)); });
  it('nessun errore nella pagina', ()=>assert.deepStrictEqual(R.errors, []));
});
