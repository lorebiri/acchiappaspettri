// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Revisione online «immediatezza e chiarezza» (docs/revisione-online/LEGGIMI.md): cambia solo la versione online.
// Online: percorso in tre passi, area di caricamento in cima, schede con «Analisi» dopo «Picchi», testi in italiano e inglese, telefono senza scorrimento laterale.
// Desktop: la pagina è identica pixel per pixel con e senza app/web.css e app/web.js. Dati SINTETICI (examples/).
// Uso: node --test test/validation/web-chiarezza-ui.test.js   (PW_CHANNEL=chrome per Chrome installato)
'use strict';
const {describe, it, before, after}=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path');
const B=require('./browser.js'), TM=require('./tauri-mock.js');
const DIR=path.join(B.ROOT,'examples','ftir-polietilene-sintetico');
const FTIR=fs.readdirSync(DIR).filter(n=>/\.csv$/.test(n)).sort().slice(0,3).map(n=>[n, fs.readFileSync(path.join(DIR,n),'utf8')]);
const load=p=>p.evaluate(async list=>{ await addEntries(list.map(([n,t])=>({file:new File([t],n),path:n}))); document.querySelectorAll('dialog[open]').forEach(d=>d.close()); }, FTIR);
const vis=(p,s)=>p.evaluate(s=>{ const e=document.querySelector(s); if (!e) return false; const r=e.getBoundingClientRect(); return getComputedStyle(e).display!=='none' && r.width>0 && r.height>0; }, s);
// ordine a vista delle schede: per riga, poi da sinistra
const tabOrder=p=>p.evaluate(()=>[...document.querySelectorAll('#tabs .tab')].map(t=>({k:t.dataset.tab, r:t.getBoundingClientRect()})).sort((a,b)=>Math.round(a.r.top)-Math.round(b.r.top)||a.r.left-b.r.left).map(x=>x.k));

let br, server;
before(async()=>{ server=await B.startServer(); br=await B.launch(); });
after(async()=>{ if (br) await br.close(); if (server) server.close(); });

describe('versione online', ()=>{
  it('passo 1: l\'area di caricamento dice cosa fare e il percorso è in tre passi brevi', async()=>{
    const o=await B.openPage(br, server, {}); const p=o.p;
    assert.ok(await p.evaluate(()=>document.documentElement.classList.contains('web')));
    assert.strictEqual(await p.$eval('#drop .big', e=>e.textContent), 'Carica i tuoi spettri');
    assert.ok(await vis(p,'.webpath')); assert.ok(!(await vis(p,'#howto')));
    assert.deepStrictEqual(await p.$$eval('.webpath .webstep b', b=>b.map(x=>x.textContent)), ['Carica','Controlla e analizza','Leggi e scarica']);
    assert.ok(!(await vis(p,'#entryOnline')), 'online non serve «Usa la versione online»');
    assert.ok(await p.evaluate(()=>{ const c=document.querySelector('#v1 > .card'), e=document.querySelector('#entryBox'); return !!(c.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING); }), 'la nota sull\'app desktop viene dopo il caricamento');
    await load(p); await p.waitForTimeout(300);
    assert.ok(!(await vis(p,'.webpath')), 'con gli spettri caricati il percorso sparisce, come le liste che sostituisce');
    assert.deepStrictEqual(o.errors, []); await o.ctx.close();
  });
  it('passo 2: «Analisi» subito dopo «Picchi», senza cambiare il DOM', async()=>{
    const o=await B.openPage(br, server, {}); const p=o.p; await load(p); await p.evaluate(()=>{ go(2); cur=0; refreshAll(); }); await p.waitForTimeout(300);
    assert.deepStrictEqual(await tabOrder(p), ['peaks','an','refs','proc','zone']);
    assert.deepStrictEqual(await p.$$eval('#tabs .tab', t=>t.map(x=>x.dataset.tab)), ['peaks','proc','zone','refs','an'], 'il DOM resta quello del desktop');
    await p.click('#tabs [data-tab="an"]'); assert.ok(await vis(p,'.panel[data-panel="an"]'));
    // i titoli delle sezioni di Analisi non vanno a capo parola per parola
    const h=await p.evaluate(()=>{ const b=document.querySelector('#secHyp > summary > b'); return b.getBoundingClientRect().height/parseFloat(getComputedStyle(b).lineHeight||'20'); });
    assert.ok(h<1.9, 'titolo su una riga: '+h);
    assert.deepStrictEqual(o.errors, []); await o.ctx.close();
  });
  it('inglese: i testi nuovi sono tradotti e seguono il cambio di lingua', async()=>{
    const o=await B.openPage(br, server, {lang:'en'}); const p=o.p;
    assert.strictEqual(await p.$eval('#drop .big', e=>e.textContent), 'Load your spectra');
    assert.deepStrictEqual(await p.$$eval('.webpath .webstep b', b=>b.map(x=>x.textContent)), ['Load','Check and analyse','Read and download']);
    assert.strictEqual(await p.$eval('#entryBox .entrytxt b', e=>e.textContent), 'Need it offline too?');
    await p.evaluate(()=>AcchI18n.setLang('it')); assert.strictEqual(await p.$eval('#drop .big', e=>e.textContent), 'Carica i tuoi spettri');
    await p.evaluate(()=>AcchI18n.setLang('en')); assert.strictEqual(await p.$eval('#entryDesktop', e=>e.textContent), '🖥️ Download the desktop app');
    assert.deepStrictEqual(o.errors, []); await o.ctx.close();
  });
  it('telefono: i pulsanti per caricare sono nella prima schermata, niente scorrimento laterale', async()=>{
    const o=await B.openPage(br, server, {}); const p=o.p; await p.setViewportSize({width:390, height:844}); await p.waitForTimeout(200);
    const r=await p.$eval('#pickFiles', e=>e.getBoundingClientRect().bottom); assert.ok(r<844, 'Scegli file a '+r+' px');
    const g=await p.evaluate(()=>{ const a=document.querySelector('#gino').getBoundingClientRect(), d=document.querySelector('#drop').getBoundingClientRect(); return a.bottom<=d.top+1 || a.top>=d.bottom-1; });
    assert.ok(g, 'Gino non copre l\'area di caricamento');
    for (const step of [1,2]){ if (step===2){ await load(p); await p.evaluate(()=>{ go(2); cur=0; refreshAll(); }); await p.waitForTimeout(300); }
      const w=await p.evaluate(()=>document.documentElement.scrollWidth); assert.ok(w<=391, 'passo '+step+': larghezza '+w); }
    assert.deepStrictEqual(o.errors, []); await o.ctx.close();
  });
  it('tablet: nessuno scorrimento laterale tra 600 e 1024 px', async()=>{
    const o=await B.openPage(br, server, {}); const p=o.p; let loaded=false;
    for (const step of [1,2]) for (const w of [600,768,820,1024]){
      if (step===2 && !loaded){ await load(p); await p.evaluate(()=>{ go(2); cur=0; refreshAll(); }); loaded=true; }
      await p.setViewportSize({width:w, height:1100}); await p.waitForTimeout(150);
      const sw=await p.evaluate(()=>document.documentElement.scrollWidth); assert.ok(sw<=w+1, 'passo '+step+' a '+w+' px: larghezza '+sw); }
    assert.deepStrictEqual(o.errors, []); await o.ctx.close();
  });
});

describe('app desktop', ()=>{
  it('nessuna traccia della revisione online', async()=>{
    const r=await deskShots(false);
    assert.ok(/\bshell\b/.test(r.info.cl) && !/\bweb\b/.test(r.info.cl), r.info.cl);
    assert.ok(!r.info.path && !r.info.wt); assert.strictEqual(r.info.big, 'Trascina qui file o cartelle');
  });
  it('identico pixel per pixel con e senza app/web.css e app/web.js', async()=>{
    const con=await deskShots(false), senza=await deskShots(true);
    assert.ok(con.a.equals(senza.a), 'passo 1 diverso'); assert.ok(con.b.equals(senza.b), 'passo 2 (Analisi) diverso');
  });
});

// anteprima del desktop (finto Tauri): schermata vuota e passo 2 su «Analisi»; senzaWeb → la stessa pagina senza i tag di app/web.css e app/web.js
const SENZA_WEB=(()=>{ const h=fs.readFileSync(B.INDEX,'utf8'), tags=['<link rel="stylesheet" href="app/web.css">','<script src="app/web.js"></script>'];
  for (const t of tags) assert.ok(h.includes(t), 'manca in index.html: '+t); return tags.reduce((x,t)=>x.replace(t,''), h); })();
async function deskShots(senzaWeb){
  const o=await TM.openDesk(B, br, server, senzaWeb ? {html:SENZA_WEB} : {}); const p=o.p; await p.setViewportSize({width:1440, height:900}); await p.waitForFunction(()=>window.__mock && window.__mock.menu); await p.waitForTimeout(400);
  const sheets=await p.evaluate(()=>[...document.styleSheets].some(x=>/\/app\/web\.css$/.test(x.href||'')));
  assert.strictEqual(sheets, !senzaWeb, 'app/web.css caricato: '+sheets);
  const a=await p.screenshot(); await load(p); await p.evaluate(()=>{ go(2); cur=0; refreshAll(); openTab('an'); }); await p.waitForTimeout(800); const b=await p.screenshot();
  const info=await p.evaluate(()=>({cl:document.documentElement.className, path:!!document.querySelector('.webpath'), wt:!!document.querySelector('.webtabs'), big:document.querySelector('#drop .big').textContent}));
  assert.deepStrictEqual(o.errors, []); await o.ctx.close(); return {a, b, info};
}
