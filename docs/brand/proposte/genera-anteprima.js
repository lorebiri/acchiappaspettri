// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// node docs/brand/proposte/genera-anteprima.js : scrive docs/brand/anteprima-icona-ibrida.png (serve Playwright con Chromium)
const fs=require('fs'), path=require('path'); const { V, svg } = require('./varianti.js');
const { chromium } = require('playwright');
const uri = s => 'data:image/svg+xml;base64,' + Buffer.from(s).toString('base64');
const SIZES=[16,32,48,128,256,512];
// a 16 e 32 px si usa la versione semplificata (come fanno i file .ico con più immagini dentro)
const ico = (k, s, forma='quadrato') => `<img src="${uri(svg(k, forma, s<=32))}" width="${s}" height="${s}">`;
const altre = n => Array.from({length:n},(_,i)=>`<i class="alt" style="background:${['#c9ced8','#aab3c2','#d8c9b8','#b8d0c4'][i%4]}"></i>`).join('');

function blocco(k){ const v=V[k];
  const fila = sfondo => `<div class="fila ${sfondo}">${SIZES.map(s=>`<figure>${ico(k,s)}<figcaption>${s}</figcaption></figure>`).join('')}</div>`;
  const tondi = sfondo => `<div class="fila ${sfondo}">${[16,32,48,128,192].map(s=>`<figure>${ico(k,s,'tondo')}<figcaption>${s} tondo</figcaption></figure>`).join('')}</div>`;
  return `<section><h2>${v.nome}</h2><p>${v.idea}</p>
  ${fila('chiaro')}${fila('scuro')}
  <div class="riga">${tondi('chiaro')}${tondi('scuro')}</div>
  <div class="riga contesti">
    <div><h3>Dock di macOS</h3><div class="dock">${altre(2)}${ico(k,64)}${altre(2)}<b class="punto"></b></div></div>
    <div><h3>Barra di Windows</h3><div class="taskbar"><span class="start"></span><span class="tb">${altre(2)}</span><span class="tb on">${ico(k,24)}</span><span class="tb">${altre(1)}</span></div></div>
    <div><h3>Scheda del browser, chiaro e scuro</h3>
      <div class="tabs chiaro"><span class="tab">${ico(k,16)}Acchiappaspettri</span><span class="tab off"><i class="alt mini"></i>Posta</span></div>
      <div class="tabs scuro"><span class="tab">${ico(k,16)}Acchiappaspettri</span><span class="tab off"><i class="alt mini"></i>Posta</span></div></div>
    <div><h3>iOS e Android</h3><div class="tel">${`<img src="${uri(svg(k,'pieno'))}" width="60" height="60" style="border-radius:14px">`}<span>Acchiappa…</span>${ico(k,60,'tondo')}<span>Acchiappa…</span></div></div>
  </div></section>`; }

const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:28px 36px;font:15px/1.45 system-ui,sans-serif;color:#1c2230;background:#fff;width:1640px}
h1{font-size:26px;margin:0 0 4px} h2{font-size:21px;margin:30px 0 2px} h3{font-size:13px;margin:0 0 6px;color:#5a6577;font-weight:600}
p{margin:0 0 10px;color:#3d4757;max-width:1100px} section{border-top:1px solid #dde2ea;padding-bottom:10px}
.fila{display:flex;align-items:flex-end;gap:26px;padding:14px 18px;border-radius:12px;margin:8px 0}
.chiaro{background:#f3f5f9}.scuro{background:#16191f;color:#c9d1dc}
figure{margin:0;text-align:center}figure img{display:block;margin:auto}figcaption{font-size:11px;margin-top:4px;opacity:.75}
.riga{display:flex;gap:16px;align-items:flex-start}.riga>.fila{flex:1}
.contesti>div{flex:1}
.dock{display:inline-flex;align-items:center;gap:10px;padding:8px 12px;border-radius:22px;background:linear-gradient(#cfd8e6,#9fb0c8);position:relative}
.dock .alt{width:64px;height:64px;border-radius:15px}.dock .punto{position:absolute;bottom:2px;left:${12+2*74+28}px;width:6px;height:6px;border-radius:50%;background:#1c2230}
.alt{display:inline-block;width:24px;height:24px;border-radius:6px}.alt.mini{width:16px;height:16px;border-radius:4px;margin-right:8px;vertical-align:-3px}
.taskbar{display:flex;align-items:center;gap:4px;height:48px;padding:0 10px;background:#202020;border-radius:6px}
.start{width:24px;height:24px;margin:0 10px;background:linear-gradient(90deg,#4aa3ff 48%,transparent 48% 52%,#4aa3ff 52%);border-radius:2px}
.tb{display:flex;gap:4px;align-items:center;justify-content:center;min-width:40px;height:40px;border-radius:5px}.tb .alt{margin:0 8px}
.tb.on{background:#3a3a3a;position:relative}.tb.on:after{content:'';position:absolute;bottom:2px;left:13px;width:14px;height:3px;border-radius:2px;background:#4aa3ff}
.tabs{display:flex;gap:2px;padding:6px 8px 0;border-radius:8px 8px 0 0;margin-bottom:8px}.tabs.chiaro{background:#dee3ea}.tabs.scuro{background:#202124}
.tab{display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:8px 8px 0 0;font-size:12.5px;width:170px}
.chiaro .tab{background:#fff}.scuro .tab{background:#35363a;color:#e8eaed}.tab.off{background:transparent!important;opacity:.7}
.tel{display:inline-grid;grid-template-columns:repeat(2,80px);gap:4px 18px;justify-items:center;padding:14px 18px;border-radius:16px;background:linear-gradient(135deg,#5b7bb3,#2b3d63);color:#fff;font-size:11px}
.tel span{grid-row:2}
</style>
<h1>Acchiappaspettri: tre proposte di icona ibrida</h1>
<p>Fantasmino (Gino) + curva dello spettro. Disegni originali in SVG, piatti, palette del blu attuale (#2563c9 online, #1d3557 desktop). Dimensioni reali in pixel; a 16 e 32 px si usa una versione semplificata dello stesso disegno (tratti più spessi, meno dettagli), come si fa nei file .ico e .icns.</p>
${Object.keys(V).map(blocco).join('')}`;

(async()=>{ const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1712,height:800},deviceScaleFactor:1});
  await p.setContent(html); await p.waitForTimeout(200);
  const out=path.join(__dirname,'..','anteprima-icona-ibrida.png'); await p.screenshot({path:out, fullPage:true}); await b.close(); console.log(out); })();
