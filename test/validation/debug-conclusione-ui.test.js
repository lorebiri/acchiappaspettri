// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Regressioni dei bug trovati nel debug globale della conclusione (collaudo da utente, dati SINTETICI): ogni prova fallisce sul codice
// di prima della correzione. Uso: PW_CHANNEL=chrome node --test test/validation/debug-conclusione-ui.test.js
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path');
const B=require('./browser.js'), {raman}=require('../fixtures/raman-sintetici.js');
let server, browser;
test.before(async ()=>{ server=await B.startServer(); browser=await B.launch(); });
test.after(async ()=>{ await browser.close(); server.close(); });
const txt=(a,b,seed)=>{ const s=raman(seed||5,{noise:0.004}); let t='Raman Shift (cm-1)\tIntensity\n'; for (let i=0;i<s.x.length;i++){ const x=a+(b-a)*i/(s.x.length-1); t+=x.toFixed(3)+'\t'+(1000*(s.base[i]+1/(1+((x-(a+b)/2)/4)**2))).toFixed(3)+'\n'; } return t; };
async function load(p, list){ await p.evaluate(async list=>{ await addEntries(list.map(([n,t])=>({file:new File([t],n),path:n}))); document.querySelectorAll('dialog[open]').forEach(d=>d.close()); go(2); cur=0; refreshAll(); }, list); }

test('«Applica a tutti» con i punti di ancoraggio salta gli spettri dove i punti cadono fuori asse e lo dice', async ()=>{
  const {ctx,p,errors}=await B.openPage(browser, server, {}); await load(p, [['a.txt',txt(200,1200)],['b.txt',txt(2000,3200)]]);
  const r=await p.evaluate(()=>{ openTab('proc'); $('#bMeth').value='anchor'; $('#bMeth').dispatchEvent(new Event('change')); $('#bPts').value='300; 1100'; $('#bPts').dispatchEvent(new Event('change'));
    $('#bAll').click(); return {b:pBase(files[1]), toast:$('#toastTxt').textContent}; });
  assert.strictEqual(r.b, 'none'); assert.match(r.toast, /applicato a 1 spettro.*non adatto.*b\.txt/);
  assert.deepStrictEqual(errors, []); await ctx.close();
});

test('picchi: la modifica verso un picco esistente è rifiutata; larghezza e forma restano se si riscrive un picco automatico tolto; avvisi brevi', async ()=>{
  const {ctx,p,errors}=await B.openPage(browser, server, {}); await load(p, [['a.txt',txt(200,1200)]]);
  const r=await p.evaluate(async ()=>{ const f=files[0], auto=viewOf(f).peaks[0]; const o={};
    pkAddTyped(f,{text:'900', snap:false}); const p900=viewOf(f).peaks.find(q=>Math.abs(q.x-900)<1e-9);
    o.edit=pkEdit(f, p900, {x:auto.x}); o.n=viewOf(f).peaks.filter(q=>Math.abs(q.x-auto.x)<0.5).length;
    removePeak(f, auto.x, false); pkAddTyped(f,{text:String(+auto.x.toFixed(3))+' w=12 lor', snap:true, tol:3});
    const back=viewOf(f).peaks.find(q=>Math.abs(q.x-auto.x)<1e-6); o.back={w:back&&back.w, sh:back&&back.sh};
    $('#pkAddTxt').value=Array.from({length:500},(_,i)=>5000+i).join('; '); $('#pkAddGo').click(); o.toastLen=$('#toastTxt').textContent.length;
    return o; });
  assert.strictEqual(r.edit, false); assert.strictEqual(r.n, 1); assert.deepStrictEqual(r.back, {w:12, sh:'lor'}); assert.ok(r.toastLen<500, 'avviso di '+r.toastLen+' caratteri');
  assert.deepStrictEqual(errors, []); await ctx.close();
});

test('tema scuro: i riquadri del fondo e dei picchi hanno lo sfondo del tema (prima restavano chiari con il testo chiaro)', async ()=>{
  const {ctx,p,errors}=await B.openPage(browser, server, {}); await load(p, [['a.txt',txt(200,1200)]]);
  const r=await p.evaluate(()=>{ localStorage.setItem('acch.ui.theme','dark'); document.documentElement.dataset.theme='dark'; openTab('proc');
    const lum=c=>{ const m=c.match(/\d+(\.\d+)?/g).map(Number); return (0.2126*m[0]+0.7152*m[1]+0.0722*m[2])/255; };
    const bb=getComputedStyle($('#baseBox')).backgroundColor, pk=getComputedStyle($('#pkAddBox')).backgroundColor; return {bb:lum(bb), pk:lum(pk)}; });
  assert.ok(r.bb<0.2 && r.pk<0.2, JSON.stringify(r)); assert.deepStrictEqual(errors, []); await ctx.close();
});

test('inglese: segnaposti delle aree di testo e avviso fuori asse in inglese', async ()=>{
  const {ctx,p,errors}=await B.openPage(browser, server, {lang:'en'}); await load(p, [['a.txt',txt(200,1200)]]);
  const r=await p.evaluate(async ()=>{ openTab('peaks'); const a=$('#pkAddTxt').placeholder, w=$('#pkAddW').placeholder; openTab('proc'); $('#bMeth').value='anchor'; $('#bMeth').dispatchEvent(new Event('change'));
    const b=$('#bPts').placeholder; $('#bPts').value='300; 5000'; $('#bPts').dispatchEvent(new Event('change')); await new Promise(r=>setTimeout(r,50)); return {a, w, b, toast:$('#toastTxt').textContent}; });
  assert.match(r.a, /^e\.g\. 1086/); assert.strictEqual(r.w, 'automatic'); assert.match(r.b, /^e\.g\. 250/); assert.match(r.toast, /Outside the spectrum/);
  assert.deepStrictEqual(errors, []); await ctx.close();
});

test('online a 375 px: il pulsante Impostazioni mostra l\'icona', async ()=>{
  const {ctx,p,errors}=await B.openPage(browser, server, {}); await p.setViewportSize({width:375, height:800});
  const r=await p.evaluate(()=>{ const b=$('#settingsBtn'), st=getComputedStyle(b,'::before'); return {before:st.content, fs:st.fontSize, w:b.getBoundingClientRect().width}; });
  assert.match(r.before, /⚙/); assert.strictEqual(r.fs, '16px'); assert.ok(r.w>=36);
  assert.deepStrictEqual(errors, []); await ctx.close();
});

test('una libreria .acchlib trascinata insieme agli spettri si importa (prima: «formato non riconosciuto»)', async ()=>{
  const {ctx,p,errors}=await B.openPage(browser, server, {});
  const lib=fs.readFileSync(path.join(B.ROOT,'examples','librerie','saliva-hplc-dad220.bozza.json'),'utf8');
  const r=await p.evaluate(async t=>{ await AcchLibUi.refresh(); const n0=AcchLibUi.items.length; await addEntries([{file:new File([t],'saliva.acchlib'),path:'saliva.acchlib'}]); await new Promise(r=>setTimeout(r,300));
    return {more:AcchLibUi.items.length-n0, hello:$('#hello').textContent}; }, lib);
  assert.ok(r.more>=1, JSON.stringify(r)); assert.doesNotMatch(r.hello, /non ci riesco|non riconosciuto/);
  assert.deepStrictEqual(errors, []); await ctx.close();
});
