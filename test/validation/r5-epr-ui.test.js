// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// R5 EPR nella pagina vera: unità del campo dedotta in postDetect, frequenza con la virgola, riga al bordo (casi della sonda NMR/EPR, ciclo 25).
// Tutti i dati sono SINTETICI.
'use strict';
const test=require('node:test'), assert=require('node:assert'), {startServer, launch, openPage}=require('./browser.js');
let seed=7; const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; }, gs=()=>{ let s=0; for (let i=0;i<6;i++) s+=rnd(); return s-3; };
const NU=9.4, gB=(g,nu)=>71.44773*nu/g, B0=gB(2.0036,NU), BQ=gB(2.0036,34);
const der=(b,c,w)=>{ const t=(b-c)/w; return -2*t/(1+t*t)**2; };
const txt=(head,col,lo,hi,n,f,conv)=>{ let s=head+(col?col+'\n':''); for (let i=0;i<n;i++){ const b=lo+(hi-lo)*i/(n-1); s+=conv(b).toPrecision(8)+'\t'+(f(b)+gs()*0.002).toFixed(5)+'\n'; } return s; };
const G=b=>b*10, T=b=>b/1000, M=b=>b, d1=b=>1000*der(b,B0,0.4), wide=b=>1000*der(b,gB(4.3,NU),3)+1000*der(b,B0,1.5);
// atteso: frequenza, righe (mT) e g; lv = livelli che devono comparire tra gli avvisi, no = livelli/testi che non devono comparire
const CASI=[
  ['e01_G_mwfq.txt', txt('EPR spectrum\nMWFQ 9.4e9\n','Field (G)\tIntensity',B0-10,B0+10,2048,d1,G), {freq:9.4, g:[2.0036], no:['bad']}],
  ['e02_nounit_G.txt', txt('EPR spectrum\nMicrowave frequency: 9.4 GHz\n','Field\tIntensity',B0-10,B0+10,2048,d1,G), {freq:9.4, g:[2.0036], no:['bad']}],
  ['e03_nounit_T.txt', txt('EPR spectrum\nMicrowave frequency: 9.4 GHz\n','Field\tIntensity',B0-10,B0+10,2048,d1,T), {freq:9.4, g:[2.0036], no:['bad']}],
  ['e08_Qband_nounit_G.txt', txt('EPR spectrum\nMicrowave frequency: 34.0 GHz\n','Field\tIntensity',BQ-15,BQ+15,2048,b=>1000*der(b,BQ,0.6),G), {freq:34, g:[2.0036], no:['bad']}],
  ['e14_mwfq_comma.txt', txt('EPR spectrum\nMWFQ 9,400000e9\n','Field (G)\tIntensity',B0-10,B0+10,2048,d1,G), {freq:9.4, g:[2.0036], no:['bad']}],
  ['e17_noheader_G_wide.txt', txt('EPR spectrum\nMicrowave frequency: 9.4 GHz\n','',0.5,1000,8192,wide,G), {freq:9.4, g:[4.3,2.0036], no:['bad']}],
  ['e21_noheader_mT_wide.txt', txt('EPR spectrum\n','',0,1400,8192,b=>1000*der(b,B0,1.5),M), {lines:[B0], lv:['warn']}],
  ['e22_noheader_Qband_mT.txt', txt('EPR spectrum\n','',BQ-15,BQ+15,2048,b=>1000*der(b,BQ,0.6),M), {lv:['warn'], has:/divisi per 10/}],
  ['e23_line_near_edge.txt', 'EPR spectrum\nMWFQ 9.4e9\nField (mT)\tIntensity\n'+Array.from({length:4096},(_,i)=>{ const b=330+10*i/4095; return b.toFixed(4)+'\t'+(1000*der(b,331,0.3)).toFixed(4); }).join('\n'), {lv:['bad'], has:/estremi/, row:/⛔/}],
  ['e10_absorption_mT.txt', txt('EPR spectrum\nMWFQ 9.4e9\n','Field (mT)\tIntensity',B0-10,B0+10,2048,b=>1000/(1+((b-B0)/0.4)**2),M), {lv:['bad'], head:'Doppio o singolo integrale'}],
  // derivata con il lobo tagliato dal bordo: sembra un assorbimento, ma anche l'integrale singolo è sbagliato
  ['e25_edge_like_absorption.txt', 'EPR spectrum\nMWFQ 9.4e9\nField (mT)\tIntensity\n'+Array.from({length:4096},(_,i)=>{ const b=330+10*i/4095, u=(b-330.6)/0.3; return b.toFixed(4)+'\t'+(-1000*u*Math.exp(-0.5*u*u)).toFixed(4); }).join('\n'), {lv:['bad'], has:/estremi/, row:/⛔/}],
  ['e24_line_centered.txt', 'EPR spectrum\nMWFQ 9.4e9\nField (mT)\tIntensity\n'+Array.from({length:4096},(_,i)=>{ const b=330+10*i/4095; return b.toFixed(4)+'\t'+(1000*der(b,335,0.3)).toFixed(4); }).join('\n'), {no:['bad'], di:[0.85,0.95]}],
];

test('R5 EPR: unità, frequenza e doppio integrale nella pagina', async ()=>{
  const server=await startServer(), b=await launch();
  try{
    for (const lang of ['it','en']){
      const {ctx, p, errors}=await openPage(b, server, {lang});
      const fail=[];
      for (const [name, t, att] of CASI){
        const r=await p.evaluate(async ([name,t])=>{ files.length=0; await addEntries([{file:new File([t],name), path:name}]); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
          const f=files.find(g=>g.name===name); cur=files.indexOf(f); const d=viewOf(f), o=techMetrics(f,d), row=o&&o.rows&&o.rows.find(r=>/▶/.test(r[0]));
          const en=window.AcchI18n&&AcchI18n.lang==='en', A=assess(f,d).map(o=>({lv:o.lv, t:String(o.t), en:en?AcchI18n.tr(String(o.t)):null}));
          const di=(()=>{ const Q=processed(f); const r=eprDoubleIntegral(Q.xs,Q.ys); return r&&r.di; })();
          return {instr:f.instr, freq:f.freq, peaks:d.peaks.map(q=>({x:q.x, g:q.g})), assess:A, row:row?row.join(' | '):'', rowEn:row&&en?AcchI18n.tr(row[3]):null, head:o&&o.head&&o.head[1], di}; }, [name,t]);
        const tag=`${lang} ${name}`, ck=(ok,m)=>{ if (!ok) fail.push(m); };
        ck(r.instr==='epr', tag+': tecnica '+r.instr);
        if (att.freq) ck(Math.abs(r.freq-att.freq)<1e-6, `${tag}: frequenza ${r.freq}`);
        for (const g of att.g||[]) ck(r.peaks.some(q=>q.g!=null && Math.abs(q.g-g)<0.002), `${tag}: g ${g} non trovato in ${JSON.stringify(r.peaks.map(q=>q.g))}`);
        for (const x of att.lines||[]) ck(r.peaks.some(q=>Math.abs(q.x-x)<0.5), `${tag}: riga a ${x} mT non trovata in ${JSON.stringify(r.peaks.map(q=>q.x))}`);
        for (const lv of att.lv||[]) ck(r.assess.some(o=>o.lv===lv), `${tag}: manca un avviso ${lv}: ${JSON.stringify(r.assess)}`);
        for (const lv of att.no||[]) ck(!r.assess.some(o=>o.lv===lv), `${tag}: avviso ${lv} di troppo: ${JSON.stringify(r.assess.filter(o=>o.lv===lv))}`);
        if (att.has) ck(r.assess.some(o=>att.has.test(o.t)), `${tag}: manca l'avviso ${att.has}`);
        // interfaccia in inglese: gli avvisi nuovi hanno la traduzione
        if (lang==='en') for (const o of r.assess.filter(o=>att.has && att.has.test(o.t))) ck(o.en && o.en!==o.t && !/[àèéìòù]/.test(o.en), `${tag}: avviso non tradotto «${o.en}»`);
        if (lang==='en' && att.row) ck(/not reliable/.test(r.rowEn) && !/segnale|affidabile|assorbimento/.test(r.rowEn), `${tag}: nota non tradotta «${r.rowEn}»`);
        if (att.row) ck(att.row.test(r.row), `${tag}: nota del doppio integrale «${r.row}»`);
        if (att.head) ck(r.head===att.head, `${tag}: colonna «${r.head}» con l'integrale singolo`);
        if (att.di){ const v=r.di/(1000*Math.PI*0.3*0.3); ck(v>att.di[0] && v<att.di[1], `${tag}: DI ${v} del vero`); }
      }
      assert.deepEqual(fail, [], `${fail.length} controlli falliti`); assert.deepEqual(errors, []); await ctx.close();
    }
  } finally { await b.close(); server.close(); }
});
