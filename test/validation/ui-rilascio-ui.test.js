// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Interfaccia e progetti, BASSI del ciclo 26 (tappa I1): nome unico della sezione «Controllo del dato», toast a 360 px,
// nomi dei file non spezzati online, menu «Canale di …» dentro il riquadro a 360 px, riepilogo di Esporta intero a 720 px
// di altezza nel desktop, voci della libreria non duplicate a ogni riapertura, progetti della versione 1. Dati SINTETICI.
// Uso: PW_CHANNEL=chrome node --test test/validation/ui-rilascio-ui.test.js
'use strict';
const {describe, it, before, after}=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path');
const B=require('./browser.js');
const T=Array.from({length:1500},(_,i)=>i*0.008);
const chrom=(h,head)=>(head||'Time (min),Signal (mAU)')+'\n'+T.map(t=>t.toFixed(4)+','+(0.5+h*Math.exp(-0.5*((t-5)/0.05)**2)).toFixed(4)).join('\n');
const ents=L=>L.map(([n,d])=>({file:new File([d],n),path:n}));
const fx=n=>fs.readFileSync(path.join(B.ROOT,'test','fixtures',n)).toString('base64');

describe('UI e progetti (tappa I1, BASSI del ciclo 26)', {timeout:6*60*1000}, ()=>{
  let server, br; const errs=[];
  before(async ()=>{ server=await B.startServer(); br=await B.launch(); });
  after(async ()=>{ await br.close(); server.close(); });
  const page=async (opt, size)=>{ const o=await B.openPage(br, server, opt); if (size) await o.p.setViewportSize(size); return o; };
  const done=async o=>{ errs.push(...o.errors); await o.ctx.close(); };

  it('una sola sezione «Controllo del dato» (IT) / «Data check» (EN), online e desktop', async ()=>{
    for (const [lang, want, bad] of [['it','Controllo del dato',/Controllo dello spettro/],['en','Data check',/Spectrum check|Controllo dello spettro/]]){
      const o=await page({lang}); const r=await o.p.evaluate(()=>({sec:document.querySelector('#secQual>summary>b').textContent, body:document.body.innerText+' '+document.body.innerHTML})); await done(o);
      assert.ok(r.sec.includes(want), `sezione «${r.sec.trim()}» invece di «${want}»`); assert.doesNotMatch(r.body, bad); }
  });

  it('toast a 360 px: largo quasi quanto lo schermo, non la metà', async ()=>{
    for (const desk of [false]){ const o=await page({desk}, {width:360,height:740});
      const w=await o.p.evaluate(async ()=>{ toast('⚠️ Un avviso abbastanza lungo da andare a capo su più righe in uno schermo stretto da telefono.'); await new Promise(r=>setTimeout(r,400)); return document.querySelector('#toast').getBoundingClientRect().width; }); await done(o);
      assert.ok(w>=300 && w<=360, `toast largo ${w} px su 360`); }
  });

  // ogni pezzo di testo fra due <wbr> sta su una riga: il nome si spezza solo dopo _ e - o prima dell'estensione
  const NOMI=['CAMPIONE_SALIVA_PAZIENTE_042_STD1_DAD1A.csv','CAMPIONE_SALIVA_PAZIENTE_042_STD2_DAD1A.csv','CAMPIONE_SALIVA_PAZIENTE_042_STD3_DAD1A.csv','CAMPIONE_SALIVA_PAZIENTE_042_INC_DAD1A.csv'];
  it('online, «Più campioni»: i nomi dei file non si spezzano a metà di una parola', async ()=>{
    for (const size of [{width:1366,height:768},{width:390,height:800}]){ const o=await page({}, size);
      const r=await o.p.evaluate(async ([L])=>{ await addEntries(L.map(([n,d])=>({file:new File([d],n),path:n}))); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
        const c=mvCfg('hplc'); Object.assign(c,{a:4.8,b:5.2,meas:'area',model:'line'}); mvSave(); files.forEach((f,i)=>{ if (!/INC/.test(f.name)) anSet(f,'conc',i+1); });
        go(2); openTab('multi'); $('#secMulti').open=true; $('#mvInstr').value='hplc'; renderMulti(); await new Promise(q=>setTimeout(q,200));
        const out=[]; for (const td of document.querySelectorAll('#mvOut table.areatab tbody tr td:first-child')){ const w=document.createTreeWalker(td, NodeFilter.SHOW_TEXT); let n;
          while ((n=w.nextNode())){ if (!n.textContent.trim()) continue; const rg=document.createRange(); rg.selectNodeContents(n); const tops=new Set([...rg.getClientRects()].filter(q=>q.width>0).map(q=>Math.round(q.top))); out.push([n.textContent, tops.size]); } }
        return {out, lines:[...document.querySelectorAll('#mvOut table.areatab tbody tr td:first-child')].map(td=>Math.round(td.getBoundingClientRect().height))}; }, [NOMI.map((n,i)=>[n, chrom(40*(i+1))])]);
      await done(o);
      assert.ok(r.out.length>=4, 'tabella senza nomi: '+JSON.stringify(r));
      const broken=r.out.filter(([,k])=>k>1); assert.deepStrictEqual(broken, [], `${size.width} px: pezzi di nome spezzati a metà`); }
  });

  it('360 px: il menu «Canale di …» con un nome lungo resta dentro il riquadro giallo', async ()=>{
    const L=[]; for (const [n,c] of [['STD1',1],['STD2',2],['STD3',3]]) for (const ch of ['A','B']) L.push([`${n}_DAD1${ch}.csv`, chrom(ch==='A'?40*c:13*c)]);
    L.push(['CAMPIONESALIVAPAZIENTE0042RIPETIZIONESECONDAINIEZIONE.csv', chrom(60)]); L.push(['campione_saliva_paziente_0042_ripetizione_seconda.csv', chrom(60)]);
    const o=await page({}, {width:360,height:740});
    const r=await o.p.evaluate(async L=>{ await addEntries(L.map(([n,d])=>({file:new File([d],n),path:n}))); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
      const c=mvCfg('hplc'); Object.assign(c,{a:4.8,b:5.2,meas:'area',model:'line'}); mvSave(); files.forEach(f=>{ const m=/STD(\d)/.exec(f.name); if (m) anSet(f,'conc',+m[1]); });
      go(2); openTab('multi'); $('#secMulti').open=true; $('#mvInstr').value='hplc'; renderMulti(); await new Promise(q=>setTimeout(q,200));
      const sel=[...document.querySelectorAll('#mvOut select.chanin')]; if (!sel.length) return {n:0};
      const box=sel[0].closest('.signote').getBoundingClientRect();
      return {n:sel.length, box:[box.left,box.right], out:sel.flatMap(s=>[s, s.closest('label'), s.previousElementSibling].map(e=>{ const q=e.getBoundingClientRect(); return [e.tagName, Math.round(q.left), Math.round(q.right)]; })), docW:document.documentElement.scrollWidth}; }, L);
    await done(o);
    assert.strictEqual(r.n, 2, 'attesi due menu dei canali: '+JSON.stringify(r));
    const fuori=r.out.filter(([,l,rr])=>l<r.box[0]-1 || rr>r.box[1]+1); assert.deepStrictEqual(fuori, [], 'fuori dal riquadro '+JSON.stringify(r.box));
  });

  it('desktop 1280×720: nessuna riga del riepilogo di Esporta tagliata a metà', async ()=>{
    for (const [w,h] of [[1280,720],[1024,720],[1366,720]]){ const o=await page({desk:true}, {width:w,height:h});
      const r=await o.p.evaluate(async L=>{ await addEntries(L.map(([n,d])=>({file:new File([d],n),path:n}))); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
        go(3); await new Promise(q=>setTimeout(q,600)); const s=document.querySelector('#v3 .dlcard .summary'), b=s.getBoundingClientRect();
        return {box:[b.top,b.bottom], li:[...s.querySelectorAll('li')].map(li=>{ const q=li.getBoundingClientRect(); return [li.textContent.slice(0,30), q.top, q.bottom]; })}; }, [['S1.csv',chrom(40)],['S2.csv',chrom(60)],['S3.csv',chrom(80)]]);
      await done(o);
      assert.ok(r.li.length>=3, JSON.stringify(r));
      const cut=r.li.filter(([,t,bt])=>t<r.box[1]-0.5 && bt>r.box[1]+0.5); assert.deepStrictEqual(cut, [], `${w}×${h}: righe tagliate dal bordo ${r.box[1]}`); }
  });

  it('progetto riaperto più volte: le voci della libreria non si duplicano', async ()=>{
    const o=await page({desk:true});
    const r=await o.p.evaluate(async L=>{ await addEntries(L.map(([n,d])=>({file:new File([d],n),path:n}))); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
      LIB.push({id:'cprova1', i:'hplc', a:4.9, b:5.1, n:'Acido caffeico'}, {id:'cprova2', i:'hplc', a:6, b:6.2, n:'X'.repeat(150)}); saveLib();
      let bytes=null; const h=AcchProject.host, old=h.saveAs; h.saveAs=async b=>{ bytes=b; return {name:'lib.acchspettri', path:null}; }; await AcchProject.saveAs(); h.saveAs=old;
      const n=[]; const open=async ()=>{ await AcchProject.openBytes(bytes,'lib.acchspettri',null); document.querySelectorAll('dialog[open]').forEach(d=>d.close()); n.push(LIB.length); };
      await open(); await open(); await open();
      // stesso codice, contenuto diverso (libreria di un altro PC): una sola copia separata, anche riaprendo
      LIB.find(e=>e.id==='cprova1').n='Acido caffeico (altro PC)'; saveLib(); const n0=LIB.length; const m=[]; for (let k=0;k<3;k++){ await AcchProject.openBytes(bytes,'lib.acchspettri',null); m.push(LIB.length); }
      return {n, n0, m, nomi:LIB.map(e=>e.n.slice(0,30))}; }, [['S1.csv',chrom(40)]]);
    await done(o);
    assert.deepStrictEqual(r.n, [2,2,2], 'voci dopo ogni riapertura: '+JSON.stringify(r));
    assert.deepStrictEqual(r.m, [r.n0+1, r.n0+1, r.n0+1], 'voce in conflitto duplicata a ogni riapertura: '+JSON.stringify(r));
  });

  it('progetti della versione 1: la fixture di formato dice che il contenitore è integro; un progetto v1 con spettri veri si apre', async ()=>{
    const o=await page({desk:true});
    const r=await o.p.evaluate(async ([a,b])=>{ const T=[], ot=toast; toast=function(t){ T.push(String(t)); return ot.apply(this, arguments); };
      const u=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
      const okA=await AcchProject.openBytes(u(a),'progetto-v1.acchspettri',null), tA=T.splice(0);
      const okB=await AcchProject.openBytes(u(b),'progetto-v1-spettri.acchspettri',null); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
      return {okA, tA, okB, tB:T, n:files.length, titoli:files.map(f=>f.title||''), lib:LIB.map(e=>e.n)}; }, [fx('progetto-v1.acchspettri'), fx('progetto-v1-spettri.acchspettri')]);
    await done(o);
    assert.strictEqual(r.okA, false); const m=r.tA.join(' ');
    assert.doesNotMatch(m, /danneggiato/, 'il contenitore della fixture è valido: «danneggiato» è falso'); assert.match(m, /integro, ma nessuno dei suoi spettri si può leggere/);
    assert.strictEqual(r.okB, true, JSON.stringify(r.tB)); assert.strictEqual(r.n, 2); assert.ok(r.titoli.includes('Campione è'), JSON.stringify(r.titoli)); assert.ok(r.lib.includes('C=O estere (prova)'));
  });

  it('nessun errore nelle pagine', ()=>assert.deepStrictEqual(errs, []));
});
