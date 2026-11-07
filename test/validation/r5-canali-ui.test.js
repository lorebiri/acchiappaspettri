// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// R5: una retta di taratura HPLC non mescola i canali del rivelatore (caso critico trovato dall'agente HPLC, 2026-11-07).
// SINTETICO: tre standard (1, 2, 3 mg/L) e un incognito (1,5 mg/L), ognuno in due canali (DAD1A 254 nm e DAD1B 280 nm, risposta B = A/3).
'use strict';
const test=require('node:test'), assert=require('node:assert'), {startServer, launch, openPage}=require('./browser.js');
const T=Array.from({length:3000},(_,i)=>i*0.004); let seed=7; const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647-0.5; };
const chrom=h=>'Time (min),DAD signal (mAU)\n'+T.map(t=>t.toFixed(4)+','+(0.5+0.05*rnd()+h*Math.exp(-0.5*((t-5)/0.05)**2)).toFixed(4)).join('\n');
const L=[]; [['STD1',1],['STD2',2],['STD3',3],['INC',1.5]].forEach(([n,c])=>{ L.push([n+'_DAD1A.csv',chrom(40*c),n==='INC'?null:c]); L.push([n+'_DAD1B.csv',chrom(40*c/3),n==='INC'?null:c]); });

test('R5 canali HPLC: la retta usa un solo canale, l\'incognito è stimato con la retta del suo canale', async ()=>{
  const server=await startServer(), b=await launch();
  try{
    for (const mode of ['concentrazioni solo su A','concentrazioni su A e B']){
      const {ctx, p, errors}=await openPage(b, server, {desk:true});
      const r=await p.evaluate(async ([L,mode])=>{ await addEntries(L.map(([n,t])=>({file:new File([t],n),path:n}))); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
        const c=mvCfg('hplc'); c.a=4.8; c.b=5.2; c.meas='area'; c.model='line'; mvSave();
        L.forEach(([n,,conc])=>{ const f=files.find(g=>g.name===n); if (conc!=null && (mode==='concentrazioni su A e B' || /A\.csv$/.test(n))) anSet(f,'conc',conc); });
        openTab('multi'); $('#secMulti').open=true; $('#mvInstr').value='hplc'; renderMulti();
        const out=[]; for (const ch of [...$('#mvChan').options].map(o=>o.value)){ $('#mvChan').value=ch; $('#mvChan').onchange({target:$('#mvChan')}); await new Promise(q=>setTimeout(q,50));
          const rows=mvTable('hplc'), cal=mvCalib(rows); out.push({ch, n:rows.length, names:rows.map(o=>o.f.name), r2:cal&&cal.r2, pred:cal&&cal.predict?rows.filter(o=>o.conc==null).map(o=>[o.f.name, cal.predict(o.y,1).x]):[], note:/canali diversi/.test($('#mvOut').textContent)}); }
        return out; }, [L,mode]);
      assert.equal(r.length, 2, mode+': due canali riconosciuti '+JSON.stringify(r.map(o=>o.ch)));
      for (const o of r){
        assert.ok(o.names.every(n=>n.includes(o.ch.startsWith('DAD1A')?'DAD1A':'DAD1B')), `${mode}: canale ${o.ch} con file di un altro canale: ${o.names}`);
        assert.ok(o.note, `${mode}: manca l'avviso sui canali diversi`);
        for (const [n,x] of o.pred) if (/INC/.test(n)) assert.ok(Math.abs(x-1.5)<0.05, `${mode}: ${n} stimato ${x}, atteso 1,5`);
      }
      assert.deepEqual(errors, []); await ctx.close();
    }
  } finally { await b.close(); server.close(); }
});
