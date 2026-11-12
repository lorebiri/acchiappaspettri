// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Interfaccia di esportazione e dintorni (ciclo 25): «Scarica» in vista sul desktop in finestre basse, tabella delle tarature
// dentro il pannello online, Novità tradotte sul desktop in inglese, nessun messaggio doppio, finestra di download leggibile e col fuoco giusto.
// Uso: PW_CHANNEL=chrome node --test test/validation/ui-esporta.test.js
'use strict';
const {describe, it, before, after}=require('node:test'), assert=require('node:assert');
const B=require('./browser.js');

// dati SINTETICI
const ftir=n=>'Wavenumber (cm-1),Absorbance\n'+Array.from({length:500},(_,i)=>(4000-i*6)+','+(0.1+Math.exp(-Math.pow((i-200)/10,2))).toFixed(4)).join('\n');
const T=Array.from({length:3000},(_,i)=>i*0.004);
const chrom=h=>'Time (min),Signal (mAU)\n'+T.map(t=>t.toFixed(4)+','+(0.5+h*Math.exp(-0.5*Math.pow((t-5)/0.05,2))).toFixed(4)).join('\n');
const lum=c=>{ const v=c.match(/[\d.]+/g).slice(0,3).map(x=>{ x=+x/255; return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4); }); return 0.2126*v[0]+0.7152*v[1]+0.0722*v[2]; };
const ratio=(a,b)=>{ const x=lum(a), y=lum(b); return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05); };
const RELEASE={tag_name:'v9.9.9', prerelease:false, draft:false, assets:['Acch_9.9.9_aarch64.dmg','Acch_9.9.9_x64.dmg','Acch_9.9.9_x64-setup.exe','Acch_9.9.9_amd64.AppImage'].map(n=>({name:n, browser_download_url:'https://example.invalid/'+n, size:9.4e6}))};

let server, br;
before(async ()=>{ server=await B.startServer(); br=await B.launch(); });
after(async ()=>{ await br.close(); server.close(); });
async function page(opt, size){ const o=await B.openPage(br, server, opt); if (size) await o.p.setViewportSize(size); return o; }

describe('Esporta e finestre', {timeout:10*60*1000}, ()=>{
  for (const [w,h] of [[1280,720],[1536,864]]) it(`desktop ${w}×${h}: «Scarica» visibile appena si apre Esporta`, async ()=>{
    const o=await page({desk:true}, {width:w, height:h});
    const r=await o.p.evaluate(async t=>{ await addEntries([{file:new File([t],'a.csv'),path:'a.csv'}]); document.querySelectorAll('dialog[open]').forEach(d=>d.close()); go(3); await new Promise(r=>setTimeout(r,300));
      const b=$('#doDl').getBoundingClientRect(), hit=document.elementFromPoint(b.left+b.width/2, b.top+b.height/2); return {top:b.top, bottom:b.bottom, ih:innerHeight, hit:!!hit && (hit===$('#doDl') || $('#doDl').contains(hit))}; }, ftir());
    assert.deepStrictEqual(o.errors, []); await o.ctx.close();
    assert.ok(r.top>=0 && r.bottom<=r.ih && r.hit, `#doDl a y=${Math.round(r.top)}–${Math.round(r.bottom)} in una finestra alta ${r.ih}, coperto: ${!r.hit}`);
  });
  for (const w of [1366,1440,1920]) it(`online ${w} px: «Concentrazione stimata ± IC 95%» dentro il pannello senza scorrere`, async ()=>{
    const o=await page({}, {width:w, height:900});
    const L=[['STD1.csv',chrom(40),1],['STD2.csv',chrom(80),2],['STD3.csv',chrom(120),3],['INCOGNITO_campione_lungo.csv',chrom(60),null]];
    const r=await o.p.evaluate(async L=>{ await addEntries(L.map(([n,t])=>({file:new File([t],n),path:n}))); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
      const c=mvCfg('hplc'); c.a=4.8; c.b=5.2; c.meas='area'; mvSave(); L.forEach(([n,,conc])=>{ const f=files.find(g=>g.name===n); if (f&&conc!=null) anSet(f,'conc',conc); });
      if (window.AcchWebShow) AcchWebShow(); go(2); cur=0; openTab('multi'); $('#secMulti').open=true; $('#mvInstr').value='hplc'; renderMulti(); await new Promise(r=>setTimeout(r,200));
      const tb=$('#mvOut table'), cell=[...tb.querySelectorAll('td')].find(td=>/±/.test(td.textContent)), th=[...tb.querySelectorAll('th')].pop();
      let clipR=Infinity; for (let e=tb.parentElement;e&&e!==document.documentElement;e=e.parentElement){ if (getComputedStyle(e).overflowX!=='visible') clipR=Math.min(clipR,e.getBoundingClientRect().right); }
      return {cell:cell&&cell.textContent, cellW:cell&&cell.getBoundingClientRect().width, cellR:cell&&cell.getBoundingClientRect().right, thR:th.getBoundingClientRect().right, clipR}; }, L);
    await o.ctx.close();
    assert.ok(r.cell && r.cellW>0 && r.cellR<=r.clipR+0.5 && r.thR<=r.clipR+0.5, `cella «${r.cell}» fino a ${Math.round(r.cellR)} px, pannello fino a ${Math.round(r.clipR)} px`);
  });
  it('desktop in inglese: titolo delle Novità tradotto', async ()=>{
    const o=await page({desk:true, lang:'en'});
    const t=await o.p.evaluate(async ()=>{ showNews(); await new Promise(r=>setTimeout(r,300)); return $('#nwTitle').textContent; });
    await o.ctx.close();
    assert.match(t, /^\W*What's new in Acchiappaspettri \d/, t);
  });
  it('online: «Ultimo passo!» solo nel fumetto, non ripetuto in un avviso', async ()=>{
    const o=await page({}, {width:1280, height:720});
    const r=await o.p.evaluate(async t=>{ await addEntries([{file:new File([t],'a.csv'),path:'a.csv'}]); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
      go(2); await new Promise(r=>setTimeout(r,Math.max(0,3200-performance.now()))); $('#toast').classList.remove('on'); window.scrollTo(0, document.body.scrollHeight); await new Promise(r=>setTimeout(r,100));
      go(3); await new Promise(r=>setTimeout(r,100)); return {on:$('#toast').classList.contains('on'), toast:$('#toast').textContent, tip:$('#tip3').textContent}; }, ftir());
    await o.ctx.close();
    assert.match(r.tip, /Ultimo passo/);
    assert.ok(!(r.on && /Ultimo passo/.test(r.toast)), 'messaggio ripetuto nell\'avviso: '+r.toast);
  });
  // la finestra di download esiste solo online: nel desktop (3.0.0) non c'è, vedi tono-desktop.test.js
  for (const desk of [false]) for (const theme of ['light','dark']) it(`finestra di download (${desk?'desktop':'online'}, ${theme}): fuoco sul primo installer, dimensione leggibile`, async ()=>{
    const o=await page({desk});
    await o.p.evaluate(fr=>{ localStorage.setItem('acch.ui.theme', JSON.stringify(fr)); AcchUi.applyTheme(); }, theme);
    const r=await o.p.evaluate(async rel=>{ await AcchUi.openDownload(async()=>({status:200, ok:true, json:async()=>rel})); await new Promise(r=>setTimeout(r,100));
      const a=document.activeElement, pri=document.querySelector('#dlBody .dlasset.primary'), sm=pri&&pri.querySelector('.opt-l');
      const bg=e=>{ for (;e;e=e.parentElement){ const c=getComputedStyle(e).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return 'rgb(255,255,255)'; };
      return {focus:a&&a.className, theme:document.documentElement.dataset.theme||'', fg:sm&&getComputedStyle(sm).color, bg:pri&&bg(pri)}; }, RELEASE);
    assert.deepStrictEqual(o.errors, []); await o.ctx.close();
    assert.match(r.focus||'', /dlasset/, 'primo fuoco su '+r.focus);
    assert.ok(r.fg && ratio(r.fg, r.bg)>=4.5, `«· 9 MB» ${r.fg} su ${r.bg}: ${r.fg&&ratio(r.fg,r.bg).toFixed(2)}:1 (tema ${r.theme})`);
  });
  it('online, tema chiaro: anello di fuoco dei pulsanti almeno 3:1', async ()=>{
    const o=await page({});
    await o.p.keyboard.press('Tab');
    const r=await o.p.evaluate(()=>{ const b=[...document.querySelectorAll('.btn')].find(e=>e.offsetParent); b.focus(); const cs=getComputedStyle(b); return {fv:b.matches(':focus-visible'), oc:cs.outlineColor, ow:cs.outlineWidth}; });
    await o.ctx.close();
    assert.ok(r.fv, 'fuoco da tastiera');
    assert.ok(ratio(r.oc,'rgb(255,255,255)')>=3, `anello ${r.oc}: ${ratio(r.oc,'rgb(255,255,255)').toFixed(2)}:1 sul bianco`);
  });
});
