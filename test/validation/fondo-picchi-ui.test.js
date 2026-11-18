// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Collaudo nell'interfaccia (browser vero) delle due funzioni della conclusione della 3.0.0:
//   1. picchi aggiunti per posizione (uno o più, larghezza e forma facoltative, aggancio, modifica, eliminazione, annulla, progetto, CSV);
//   2. rimozione del fondo con parametri (metodi, anteprima, ambito, ancoraggi, «applica a tutti», annulla, originale intatto, progetto).
// Dati SINTETICI (test/fixtures/raman-sintetici.js). Uso: PW_CHANNEL=chrome node --test test/validation/fondo-picchi-ui.test.js
'use strict';
const test=require('node:test'), assert=require('node:assert');
const B=require('./browser.js'), {raman}=require('../fixtures/raman-sintetici.js');
let server, browser;
test.before(async ()=>{ server=await B.startServer(); browser=await B.launch(); });
test.after(async ()=>{ await browser.close(); server.close(); });
// Raman con fluorescenza: picchi a 282, 712 e 1086 cm⁻¹ sopra una gobba alta 4 volte il picco più alto
const ramanTxt=()=>{ const s=raman(5, {noise:0.004}); let t='Raman Shift (cm-1)\tIntensity\n'; const x=s.x, base=s.base;
  for (let i=0;i<x.length;i++){ const v=x[i], pk=1/(1+((v-1086)/4)**2)+0.6/(1+((v-712)/5)**2)+0.3/(1+((v-282)/6)**2); t+=v.toFixed(3)+'\t'+(1000*(base[i]+pk)+4*Math.sin(i*1.7)).toFixed(3)+'\n'; } return t; };
async function load(p, list){ await p.evaluate(async list=>{ await addEntries(list.map(([n,t])=>({file:new File([t],n),path:n}))); document.querySelectorAll('dialog[open]').forEach(d=>d.close()); go(2); cur=0; refreshAll(); }, list); }

for (const desk of [false, true]){ const W=desk?'desktop':'online';
  test(`${W}: fondo — metodi, anteprima, ambito, annulla, originale intatto`, async ()=>{
    const {ctx,p,errors}=await B.openPage(browser, server, {desk}); await load(p, [['a.txt',ramanTxt()],['b.txt',ramanTxt()]]);
    const r=await p.evaluate(async ()=>{ const f=files[0], o={}; const ys0=Array.from(f.ys); openTab('proc');
      o.order=document.querySelector('#baseBox .bord').textContent;
      // ordine dei gruppi nel pannello: lo smoothing viene prima del fondo, come nella catena di elaborazione
      const groups=[...document.querySelectorAll('#procBox [data-p], #baseBox, #procBox2 [data-p]')].map(e=>e.id==='baseBox'?'box':e.dataset.p); o.seq=[...new Set(groups)].join(',');
      for (const m of ['als','arpls','imodpoly','snip','rball']){ const s=$('#bMeth'); s.value=m; s.dispatchEvent(new Event('change')); const P=processed(f); o[m]={base:!!P.base, peaks:viewOf(f).peaks.map(q=>Math.round(q.x))}; }
      o.allSame=pBase(files[1])===pBase(f);   // ambito: tutti gli spettri Raman
      // anteprima: spettro prima della correzione e fondo come serie aggiuntive, mai nelle esportazioni
      $('#bShow').checked=true; $('#bShow').dispatchEvent(new Event('change')); o.series=pvView.series.length; o.exportSeries=viewOf(f).series.length;
      // parametro dal vivo
      const sl=document.querySelector('#baseBox [data-bp="deg"]'); $('#bMeth').value='imodpoly'; $('#bMeth').dispatchEvent(new Event('change'));
      const sl2=document.querySelector('#baseBox [data-bp="deg"]'); sl2.value='4'; sl2.dispatchEvent(new Event('input')); await new Promise(r=>setTimeout(r,200)); o.deg=S.baseP.raman.imodpoly && S.baseP.raman.imodpoly.deg; void sl;
      o.note=procNote(f, processed(f));
      // solo questo spettro
      $('#bScope').value='one'; $('#bScope').dispatchEvent(new Event('change')); o.one=JSON.stringify(f.an); o.otherFollows=pBase(files[1]);
      baseUndo(); o.undo=JSON.stringify(f.an||null);
      $('#bOff').click(); o.off=[pBase(f), processed(f).base===null];
      baseUndo(); o.offUndo=pBase(f);
      o.orig=Array.from(f.ys).every((v,i)=>v===ys0[i]);
      return o; });
    assert.match(r.order, /raggi cosmici → smoothing → rimozione del fondo → ricerca dei picchi/);
    assert.ok(/smooth.*base.*box/.test(r.seq) || /smooth,base,box/.test(r.seq), r.seq);
    for (const m of ['als','arpls','imodpoly','snip','rball']){ assert.ok(r[m].base, m); for (const x of [282,712,1086]) assert.ok(r[m].peaks.some(v=>Math.abs(v-x)<=3), `${m}: picco ${x} in ${r[m].peaks}`); }
    assert.ok(r.allSame); assert.strictEqual(r.series, r.exportSeries+2); assert.strictEqual(r.deg, 4); assert.match(r.note, /IModPoly \(Zhao et al\. 2007; polinomio di grado 4/);
    assert.match(r.one, /"pBm":"imodpoly"/); assert.match(r.one, /"deg":4/); assert.strictEqual(r.otherFollows, 'imodpoly');
    assert.strictEqual(r.undo, 'null'); assert.deepStrictEqual(r.off, ['none', true]); assert.strictEqual(r.offUndo, 'imodpoly'); assert.ok(r.orig, 'i dati originali non cambiano');
    assert.deepStrictEqual(errors, []); await ctx.close();
  });
}

test('fondo — punti di ancoraggio dal grafico e scritti, «applica a tutti», DSC senza metodi automatici', async ()=>{
  const {ctx,p,errors}=await B.openPage(browser, server, {});
  const dsc='Temperature (°C)\tHeat Flow (mW)\n'+Array.from({length:400},(_,i)=>{ const T=30+i*0.5; return T+'\t'+(0.01*T-2*Math.exp(-(((T-150)/4)**2))).toFixed(5); }).join('\n');
  await load(p, [['a.txt',ramanTxt()],['b.txt',ramanTxt()],['dsc.txt',dsc]]);
  const r=await p.evaluate(async ()=>{ const f=files[0], o={}; openTab('proc');
    $('#bMeth').value='anchor'; $('#bMeth').dispatchEvent(new Event('change')); o.pick=baseAnchorPick; o.scope=$('#bScope').value;
    // tre clic sul grafico, poi uno vicino a un punto già messo (lo toglie)
    const pv=document.getElementById('pv'), r0=pv.getBoundingClientRect(), click=x=>{ const px=gX(x)/PV_W*r0.width+r0.left, py=(geo.py0+geo.ph/2)/PV_H*r0.height+r0.top; pv.dispatchEvent(new MouseEvent('click',{clientX:px, clientY:py, bubbles:true})); };
    for (const x of [300, 1500, 3000]) click(x); o.three=(f.an.pBp.pts||[]).length; click(1500.5); o.two=(f.an.pBp.pts||[]).length; o.peaksUntouched=f.added.length===0;
    $('#bPts').value='250; 900\n1700, 2500; 3150'; $('#bPts').dispatchEvent(new Event('change')); o.pts=f.an.pBp.pts; o.base=!!processed(f).base;
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); o.pickOff=!baseAnchorPick;
    // un metodo automatico per tutti: la DSC resta com'è (metodo non adatto)
    $('#bMeth').value='als'; $('#bMeth').dispatchEvent(new Event('change')); $('#bAll').click(); o.all=files.map(g=>pBase(g)); o.toast=$('#toastTxt').textContent;
    cur=2; refreshAll(); openTab('proc'); o.dscMeth=[...$('#bMeth').options].map(x=>x.value);
    return o; });
  assert.ok(r.pick); assert.strictEqual(r.scope, 'one'); assert.strictEqual(r.three, 3); assert.strictEqual(r.two, 2); assert.ok(r.peaksUntouched, 'nella scelta dei punti il clic non aggiunge picchi');
  assert.deepStrictEqual(r.pts, [250,900,1700,2500,3150]); assert.ok(r.base); assert.ok(r.pickOff);
  assert.deepStrictEqual(r.all, ['als','als','none']); assert.match(r.toast, /applicato a 2 spettri.*non adatto/);
  assert.deepStrictEqual(r.dscMeth, ['none','linear','anchor']);
  assert.deepStrictEqual(errors, []); await ctx.close();
});

test('picchi per posizione — elenco, larghezza e forma, aggancio, doppioni, fuori scala, modifica, elimina, annulla, CSV', async ()=>{
  const {ctx,p,errors}=await B.openPage(browser, server, {});
  await load(p, [['a.txt',ramanTxt()]]);
  const r=await p.evaluate(async ()=>{ const f=files[0], o={}; S.base.raman='imodpoly'; f._pk=null; refreshAll(); openTab('peaks');
    const pk=()=>viewOf(f).peaks.map(q=>`${q.x.toFixed(1)}${q.manual?'m':''}${q.w?' w'+q.w:''}${q.sh?' '+q.sh:''}`);
    o.auto=pk();
    $('#pkAddTxt').value='1084\n1500 w=10 lor; 2000, 2400 gauss\n9999; ciao'; $('#pkAddTxt').dispatchEvent(new Event('input')); o.prev=$('#pkAddPrev').textContent;
    $('#pkAddGo').click(); o.after=pk(); o.toast=$('#toastTxt').textContent; o.left=$('#pkAddTxt').value;
    $('#pkAddSnap').checked=false; $('#pkAddW').value='7'; $('#pkAddSh').value='pv'; $('#pkAddTxt').value='1090,5'; $('#pkAddGo').click(); o.nosnap=pk();
    pkUndo(); o.undo=pk();
    // modifica dalla tabella: posizione, FWHM e forma
    const tr=[...document.querySelectorAll('#pkTable tr[data-x]')].find(t=>Math.abs(+t.dataset.x-2000)<0.5); tr.querySelector('.edit').click();
    const row=document.querySelector('#pkTable tr.edit'); row.querySelector('.eX').value='2010,5'; row.querySelector('.eW').value='12'; row.querySelector('.eS').value='gauss'; row.querySelector('.eOk').click(); o.edit=pk();
    // elimina
    const tr2=[...document.querySelectorAll('#pkTable tr[data-x]')].find(t=>Math.abs(+t.dataset.x-2400)<0.5); tr2.querySelector('.del').click(); o.del=pk(); o.pkm=Object.keys(f.an.pkm).length;
    // CSV dei picchi
    const e=await exportEntries({peaks:true}, false), c=e.find(q=>q.key==='peaks'); o.csv=(typeof c.data==='string'?c.data:await c.data.text()).split('\r\n').filter(l=>/per posizione/.test(l));
    return o; });
  assert.deepStrictEqual(r.auto, ['282.0','712.0','1086.0'].map(x=>r.auto.find(v=>Math.abs(parseFloat(v)-x)<1)||x));
  assert.match(r.prev, /Capito: 5 picchi/); assert.match(r.prev, /Fuori dallo spettro: 9999/); assert.match(r.prev, /Non capisco: «ciao»/);
  assert.ok(r.after.includes('1500.0m w10 lor') && r.after.includes('2000.0m') && r.after.includes('2400.0m gauss'), r.after.join(' | '));
  assert.ok(!r.after.some(v=>/^108[0-9]\.\dm/.test(v)), '1084 si aggancia al picco automatico a 1086: già presente, non un doppione');
  assert.match(r.toast, /3 picchi aggiunti/); assert.match(r.toast, /già presenti: 1084/); assert.match(r.toast, /fuori dallo spettro: 9999/);
  assert.strictEqual(r.left, '1084\n1500 w=10 lor; 2000, 2400 gauss\n9999; ciao', 'con errori il testo resta da correggere');
  assert.ok(r.nosnap.includes('1090.5m w7 pv'), r.nosnap.join(' | ')); assert.ok(!r.undo.includes('1090.5m w7 pv'));
  assert.ok(r.edit.includes('2010.5m w12 gauss') && !r.edit.some(v=>v.startsWith('2000.0')), r.edit.join(' | '));
  assert.ok(!r.del.some(v=>v.startsWith('2400')) && r.pkm===2, r.del.join(' | '));
  assert.strictEqual(r.csv.length, 2); assert.match(r.csv.join('\n'), /aggiunto per posizione; FWHM 10; lorentziana/); assert.match(r.csv.join('\n'), /aggiunto per posizione; FWHM 12; gaussiana/);
  assert.deepStrictEqual(errors, []); await ctx.close();
});

test('progetto: fondo (metodo, parametri, ancoraggi) e picchi scritti si salvano e tornano uguali; asse X spostato li sposta', async ()=>{
  const {ctx,p,errors}=await B.openPage(browser, server, {});
  await load(p, [['a.txt',ramanTxt()],['b.txt',ramanTxt()]]);
  const r=await p.evaluate(async ()=>{ const o={}; const f=files[0], g=files[1];
    S.base.raman='als'; S.baseP.raman={als:{lam:2e6, p:0.02}}; saveS();
    anSet(g,'pBm','anchor'); anSet(g,'pBp',{pts:[250,1700,3150], interp:'linear'});
    pkAddTyped(f, {text:'1500 w=10 lor; 2000', snap:false});
    const sig=JSON.stringify([S.base.raman, S.baseP.raman, g.an, f.an.pkm, f.added]); const v0=viewOf(f).peaks.map(q=>q.x), b0=Array.from(processed(g).base.slice(0,50));
    let saved=null; const h=AcchProject.host, old=h.saveAs; h.saveAs=async (b,s)=>{ saved=b; return {name:s,path:null}; }; await AcchProject.saveAs(); h.saveAs=old;
    await AcchProject.closeProject(); S.base.raman='none'; S.baseP.raman={}; saveS(); o.closed=files.length;
    await AcchProject.openBytes(saved,'p.acchspettri',null); const F=files.find(x=>x.name==='a.txt'), G=files.find(x=>x.name==='b.txt');
    o.sig=JSON.parse(sig); o.now=JSON.parse(JSON.stringify([S.base.raman, S.baseP.raman, G.an, F.an.pkm, F.added]));
    o.views=JSON.stringify(viewOf(F).peaks.map(q=>q.x))===JSON.stringify(v0) && JSON.stringify(Array.from(processed(G).base.slice(0,50)))===JSON.stringify(b0);
    // asse X: scala e spostamento muovono picchi scritti, metadati e punti di ancoraggio
    setEcal(F, {a:10, b:1}); o.shiftPk=Object.keys(F.an.pkm).map(Number).sort((a,b)=>a-b); setEcal(G, {a:-5, b:1}); o.shiftPts=G.an.pBp.pts;
    // un progetto ostile: parametri fuori scala o di tipo sbagliato vengono scartati
    o.hostile=JSON.stringify(cleanAn({pBm:'als', pBp:{lam:'1e6; alert(1)', p:-3, iter:5}, pkm:{'<img>':{w:1}, '12.5':{w:-1, sh:'boh', t:12.5}}}));
    return o; });
  assert.strictEqual(r.closed, 0); assert.deepStrictEqual(r.now, r.sig); assert.ok(r.views, 'stessi picchi e stesso fondo dopo la riapertura');
  assert.deepStrictEqual(r.shiftPk, [1510, 2010]); assert.deepStrictEqual(r.shiftPts, [245,1695,3145]);
  assert.strictEqual(r.hostile, JSON.stringify({pBm:'als', pBp:{iter:5}, pkm:{'12.5':{t:12.5}}}));
  assert.deepStrictEqual(errors, []); await ctx.close();
});

test('inglese: pannello del fondo e riquadro dei picchi tradotti, nessuna parola italiana rimasta', async ()=>{
  const {ctx,p,errors}=await B.openPage(browser, server, {lang:'en'});
  await load(p, [['a.txt',ramanTxt()]]);
  const r=await p.evaluate(async ()=>{ openTab('proc'); $('#bMeth').value='anchor'; $('#bMeth').dispatchEvent(new Event('change')); await new Promise(r=>setTimeout(r,100)); const a=$('#baseBox').innerText;
    $('#bMeth').value='als'; $('#bMeth').dispatchEvent(new Event('change')); await new Promise(r=>setTimeout(r,100)); const b=$('#baseBox').innerText;
    openTab('peaks'); $('#pkAddTxt').value='1500 w=3 lor; 99999'; $('#pkAddTxt').dispatchEvent(new Event('input')); await new Promise(r=>setTimeout(r,100));
    // bozza dei metodi e tracciabilità in inglese: l'elaborazione scelta per il singolo spettro non resta in italiano (prima: «linea di base …»)
    const f=files[0]; anSet(f,'pBm','als'); f._pk=null; S.smooth.raman=7; const L0=LANG; LANG='en'; const m=methodsText([f], new Set()), tr=traceRows([f])[1].join(' | '); LANG=L0;
    return {a, b, c:$('#pkAddBox').innerText, m:m.split('\n').filter(l=>/individual spectra/.test(l)).join(' '), tr}; });
  assert.match(r.m, /ALS baseline \(Eilers & Boelens 2005; λ = /); assert.match(r.m, /smoothing Savitzky–Golay 7 points/); assert.doesNotMatch(r.m, /linea di base|punti\b/);
  assert.match(r.tr, /ALS baseline/); delete r.m; delete r.tr;
  const ITA=/\b(il|della|delle|dei|nel|che|per|con|non|sono|spettro|spettri|picchi|picco|fondo|punti|scegli|tutti|anche|oppure|più)\b/i;
  for (const [k,t] of Object.entries(r)) assert.doesNotMatch(t.replace(/arPLS|IModPoly|ModPoly|ALS|SNIP|PCHIP/g,''), ITA, k+': '+t.slice(0,600));
  assert.match(r.b, /Baseline removal/); assert.match(r.c, /Add peaks by position/); assert.match(r.c, /Understood: 2 peaks/);
  assert.deepStrictEqual(errors, []); await ctx.close();
});
