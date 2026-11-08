// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// R5 (ciclo 26): sul desktop il ⛔ d'importazione resta nella barra di stato anche se lo spettro aperto non ha problemi
// (prima il controllo di qualità dello spettro aperto lo sostituiva con il nome del file). Dati SINTETICI.
// Uso: PW_CHANNEL=chrome node --test test/validation/r5-barra-avviso-ui.test.js
'use strict';
const {describe, it, before}=require('node:test'), assert=require('node:assert');
const B=require('./browser.js');
const T=Array.from({length:600},(_,i)=>i*0.01);
const blk=(h,name)=>`"Channel: ${name}"\nTime (min),Signal (mAU)\n`+T.map(t=>t.toFixed(3)+','+(1+h*Math.exp(-0.5*((t-3)/0.05)**2)).toFixed(3)).join('\n');
const DUE=blk(50,'DAD1A')+'\n\n'+blk(20,'DAD1B');
const RIGHE='Time (min),Signal (mAU)\n'+T.map((t,i)=>i===300?'ERRORE lettura':t.toFixed(3)+','+(1+50*Math.exp(-0.5*((t-3)/0.05)**2)).toFixed(3)).join('\n');

for (const lang of ['it','en']) describe(`R5 barra di stato del desktop: ⛔ d'importazione (${lang})`, {timeout:3*60*1000}, ()=>{
  let R;
  before(async ()=>{ const server=await B.startServer(), br=await B.launch();
    try{ const {ctx, p, errors}=await B.openPage(br, server, {lang, desk:true});
      R=await p.evaluate(async ([DUE,RIGHE])=>{ const bar=document.querySelector('#shMsg'), wait=ms=>new Promise(r=>setTimeout(r,ms));
        await addEntries([['due_DAD1A.csv',DUE],['righe_DAD1A.csv',RIGHE]].map(([n,t])=>({file:new File([t],n),path:n})));
        await wait(1000); const first={text:bar.textContent, err:bar.classList.contains('err'), cur:files[cur]&&files[cur].name};
        return {first}; }, [DUE,RIGHE]).catch(e=>({e:String(e)}));
      R.errors=errors; await ctx.close();
    } finally { await br.close(); server.close(); } }, {timeout:3*60*1000});
  it('dopo il caricamento la barra mostra il ⛔ del file con il problema', ()=>{ assert.ok(R.first, JSON.stringify(R));
    assert.ok(R.first.err && /righe_DAD1A/.test(R.first.text), JSON.stringify(R.first)); });
  it('nessun errore nella pagina', ()=>assert.deepStrictEqual(R.errors, []));
});
