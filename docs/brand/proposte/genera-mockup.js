// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// node docs/brand/proposte/genera-mockup.js : scrive i mockup docs/brand/mockup-*.png (Playwright + Chromium)
const path=require('path'); const { chromium } = require('playwright');
const { svg } = require('./varianti.js'); const { gino } = require('./gino-pose.js');
const uri = s => 'data:image/svg+xml;base64,' + Buffer.from(s).toString('base64');
const G = (posa, tono, w) => `<img src="${uri(gino(posa,tono))}" width="${w}" alt="">`;
const ICO = (k,s,f='quadrato') => `<img src="${uri(svg(k,f,s<=32))}" width="${s}" height="${s}" alt="">`;
const K = process.env.VARIANTE || 'C';   // variante scelta da Lorenzo (C); le altre restano solo come archivio

// spettro IR finto ma plausibile, sobrio: per far vedere che i grafici restano puliti
function grafico(w=560,h=230,col='#2563c9'){ const pk=[[2920,.55,40],[2850,.35,30],[1720,.9,22],[1460,.3,25],[1240,.5,35],[1050,.7,45],[720,.25,15]];
  let d=''; for (let i=0;i<=400;i++){ const x=4000-i*9; let y=.04; for (const [c,a,s] of pk) y+=a*Math.exp(-(((x-c)/s)**2)/2);
    d+=(i?'L':'M')+(50+i*(w-70)/400).toFixed(1)+' '+(h-30-y*(h-60)).toFixed(1); }
  const ticks=[4000,3000,2000,1000,400].map(t=>{const X=50+(4000-t)/9*(w-70)/400;return `<line x1="${X}" x2="${X}" y1="${h-30}" y2="${h-25}" stroke="#555"/><text x="${X}" y="${h-12}" font-size="10" text-anchor="middle" fill="#444">${t}</text>`;}).join('');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Arial"><rect width="${w}" height="${h}" fill="#fff"/><path d="M50 10V${h-30}H${w-20}" fill="none" stroke="#333"/>${ticks}<text x="${w/2}" y="${h-1}" font-size="10" text-anchor="middle" fill="#333">Numero d'onda (cm⁻¹)</text><text x="14" y="${h/2}" font-size="10" transform="rotate(-90 14 ${h/2})" text-anchor="middle" fill="#333">Assorbanza</text><path d="${d}" fill="none" stroke="${col}" stroke-width="1.4"/><text x="${50+(4000-1720)/9*(w-70)/400}" y="22" font-size="9.5" text-anchor="middle" fill="#333">1720</text></svg>`; }

const BASE = `*{box-sizing:border-box}body{margin:0;font:14px/1.45 system-ui,sans-serif;color:#1c2230}
.nota{position:absolute;background:#fff8d6;border:1px solid #e5c860;border-radius:8px;padding:6px 10px;font-size:12px;max-width:260px;box-shadow:0 2px 6px #0002}
.nota b{color:#8a6a00}.btn{display:inline-block;padding:7px 14px;border-radius:8px;border:1px solid #c9d3e3;background:#fff;font-size:13px}.btn.pri{background:#2563c9;color:#fff;border-color:#2563c9}`;

const online = `<style>${BASE}body{background:#f4f6fa;width:1440px;height:900px;position:relative}
header{display:flex;align-items:center;gap:12px;padding:12px 24px;background:#fff;border-bottom:1px solid #dde3ec}
header b{font-size:18px}header small{display:block;color:#6a7486;font-weight:400;font-size:12px}
main{display:grid;grid-template-columns:1fr 1fr;gap:22px;padding:22px 24px}
.card{background:#fff;border:1px solid #dde3ec;border-radius:14px;padding:18px}.card h3{margin:0 0 10px;font-size:13px;color:#6a7486;text-transform:uppercase;letter-spacing:.04em}
.drop{border:2px dashed #9fb6dc;border-radius:14px;padding:26px;text-align:center;background:#f8faff}.drop p{margin:8px 0}
.load{display:flex;gap:16px;align-items:center}.bar{height:8px;border-radius:9px;background:#e6ecf6;overflow:hidden;width:320px}.bar i{display:block;height:100%;width:62%;background:#2563c9}
.toast{display:flex;gap:12px;align-items:center;padding:10px 14px;border-radius:10px;margin:8px 0}.ok{background:#e7f5ed;border:1px solid #9fd3b4}.ko{background:#fdecea;border:1px solid #f0b4ae}
.sobrio{font-size:12px;color:#6a7486;margin-top:6px}</style>
<header>${ICO(K,32)}<div><b>Acchiappaspettri</b><small>c'è uno spettro nel tuo file? lo acchiappo io</small></div></header>
<main>
 <div class="card"><h3>1 · Stato vuoto</h3><div class="drop">${G('saluta','colore',110)}<p><b>Trascina qui i tuoi spettri</b><br>IR, Raman, UV-Vis, XRD, cromatogrammi… Gino li acchiappa al volo.</p><span class="btn pri">Scegli i file</span> <span class="btn">Prova con un esempio</span></div></div>
 <div class="card"><h3>2 · Caricamento</h3><div class="load">${G('acchiappa','colore',96)}<div><b>Gino sta acchiappando 3 file…</b><div class="bar"><i></i></div><small style="color:#6a7486">campione-2.csv · 2 di 3</small></div></div>
  <h3 style="margin-top:20px">3 · Successo ed errore</h3>
  <div class="toast ok">${G('contento','colore',42)}<div><b>Preso!</b> 3 spettri IR pronti. Premi «Vediamo i grafici».</div></div>
  <div class="toast ko">${G('preoccupato','colore',42)}<div><b>Questo file non lo capisco.</b> «misura.bin» non sembra uno spettro: ci sono solo byte senza colonne di numeri. <u>Cosa posso caricare?</u></div></div></div>
 <div class="card" style="grid-column:1/3"><h3>4 · Risultati: sobri, senza Gino</h3><div style="display:flex;gap:22px;align-items:flex-start">${grafico(640,250)}
  <table style="font-size:12.5px;border-collapse:collapse"><tr style="text-align:left;color:#6a7486"><th style="padding:4px 14px 4px 0">Picco</th><th style="padding:4px 14px 4px 0">Posizione (cm⁻¹)</th><th>Assegnazione</th></tr>
  <tr><td>1</td><td>2920</td><td>ν(C–H) asimm.</td></tr><tr><td>2</td><td>1720</td><td>ν(C=O)</td></tr><tr><td>3</td><td>1240</td><td>ν(C–O)</td></tr><tr><td>4</td><td>1050</td><td>ν(C–O–C)</td></tr></table></div>
  <div class="sobrio">Grafici, tabelle, PDF esportati e testi scientifici restano neutri: niente mascotte, niente emoji, niente battute.</div></div>
</main>
<div class="nota" style="left:1020px;top:560px;max-width:340px"><b>Online:</b> Gino a colori negli stati «di servizio». Il pulsante «Sobrio» lo nasconde, come oggi.</div>`;

const desktop = `<style>${BASE}body{background:#5b6b82;width:1440px;height:900px;padding:30px;position:relative}
.win{background:#f6f7f9;border-radius:12px;overflow:hidden;height:840px;box-shadow:0 20px 50px #0006;display:grid;grid-template-rows:38px 1fr 26px}
.tit{display:flex;align-items:center;gap:8px;padding:0 14px;background:#e9ecf1;border-bottom:1px solid #d4d9e1;font-size:13px}.sem i{display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:6px}
.corpo{display:grid;grid-template-columns:220px 1fr 1fr}.side{background:#eef1f5;border-right:1px solid #d9dee6;padding:14px;font-size:13px;color:#3d4757}.side div{padding:5px 8px;border-radius:6px}.side .on{background:#dde6f4}
.pan{padding:24px;border-right:1px solid #e1e5ec}.vuoto{text-align:center;margin-top:60px;color:#5a6577}.vuoto h4{margin:10px 0 4px;color:#1c2230}
.stato{display:flex;align-items:center;gap:10px;padding:0 12px;background:#e9ecf1;border-top:1px solid #d4d9e1;font-size:12px;color:#3d4757}
.dlg{background:#fff;border:1px solid #d4d9e1;border-radius:10px;padding:16px;margin-top:22px;box-shadow:0 6px 18px #0002}.dlg h5{margin:0 0 6px;font-size:14px}
.pdf{background:#fff;border:1px solid #cfd5de;box-shadow:0 3px 10px #0002;padding:22px;font-family:Georgia,serif;font-size:11px;width:470px;margin-top:10px}</style>
<div class="win"><div class="tit"><span class="sem"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></span>${ICO(K,16)}<b>Acchiappaspettri 3.0</b> — Progetto senza nome</div>
<div class="corpo"><div class="side"><div class="on">Dati</div><div>Grafici</div><div>Picchi</div><div>Taratura</div><div>Esporta</div><div style="margin-top:420px;display:flex;gap:8px;align-items:center;color:#6b7f9e">${ICO(K,20)} Informazioni</div></div>
<div class="pan"><div class="vuoto">${G('saluta','linea',84)}<h4>Nessun dato aperto</h4>Trascina qui i file o usa File › Apri (⌘O).<br><br><span class="btn pri">Apri file…</span> <span class="btn">Apri un esempio</span></div>
 <div class="dlg"><h5>Il file non è stato letto</h5><div style="display:flex;gap:12px">${G('preoccupato','linea',40)}<div>«misura.bin»: formato non riconosciuto (nessuna colonna numerica). Formati supportati: CSV, JCAMP-DX, SPC, …<br><br><span class="btn">Dettagli</span> <span class="btn pri">OK</span></div></div></div></div>
<div class="pan"><div style="font-weight:700;font-size:13px">Grafico — sobrio</div>${grafico(500,210,'#1d3557')}<div style="font-weight:700;font-size:13px;margin-top:14px">PDF esportato — sobrio</div><div class="pdf"><b style="font-size:13px">Rapporto di analisi FTIR</b><br>Campione: PET-03 · Strumento: … · Data: 19/11/2026<br><br>Sono stati individuati 7 picchi; la banda a 1720 cm⁻¹ è attribuita allo stiramento C=O dell'estere.<div style="margin-top:8px;color:#777">Generato con Acchiappaspettri 3.0</div></div></div></div>
<div class="stato">${G('contento','linea',16)} Importati 3 file (FTIR) in 0,4 s.</div></div>
<div class="nota" style="left:290px;top:600px"><b>Desktop:</b> Gino solo a contorno, grigio-blu, piccolo: stato vuoto, dialoghi d'errore, barra di stato, «Informazioni». Testi con il tono professionale di oggi.</div>`;

const sito = `<style>${BASE}body{width:1440px;height:820px;display:grid;grid-template-columns:1fr 1fr;position:relative}
.hero{background:linear-gradient(160deg,#1d3557,#2563c9);color:#fff;padding:60px 56px}.hero h1{font-size:40px;margin:22px 0 10px}.hero p{font-size:17px;opacity:.9;max-width:520px}
.hero .btn{background:#fff;color:#1d3557;border:0;font-weight:700;padding:12px 20px;font-size:15px;margin-right:10px}.hero .sec{background:transparent;color:#fff;border:1px solid #fff8}
.p404{background:#f4f6fa;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px}.p404 h2{font-size:64px;margin:6px 0 0;color:#2563c9}.p404 h3{margin:4px 0 8px;font-size:22px}</style>
<div class="hero">${ICO(K,128)}<h1>Acchiappaspettri</h1><p>Spettri e cromatogrammi trasformati in grafici puliti e analisi scientifiche. Online, gratis, oppure sul tuo computer.</p><br><span class="btn">Scarica per macOS</span><span class="btn sec">Usa online</span>
<div style="margin-top:60px;display:flex;gap:14px;align-items:center;font-size:13px;opacity:.85">${G('acchiappa','colore',56)} Nessun dato lascia il tuo computer.</div></div>
<div class="p404">${G('perso','colore',170)}<h2>404</h2><h3>Questo spettro ci è sfuggito</h3><p style="color:#5a6577;max-width:380px">La pagina che cerchi non c'è (o è svanita nel nulla, come fanno i fantasmi). Torna alla pagina principale o apri direttamente l'app.</p><span class="btn pri">Torna all'inizio</span></div>
<div class="nota" style="left:760px;top:24px"><b>Sito scarica/ e 404:</b> icona grande nell'intestazione, Gino a colori nella 404 e come firma accanto alle promesse (privacy).</div>`;

(async()=>{ const b=await chromium.launch();
  for (const [nome,html,h] of [['online',online,900],['desktop',desktop,900],['sito-404',sito,820]]) {
    const p=await b.newPage({viewport:{width:1440,height:h},deviceScaleFactor:1}); await p.setContent('<!doctype html><meta charset="utf-8">'+html); await p.waitForTimeout(150);
    const out=path.join(__dirname,'..',`mockup-${nome}.png`); await p.screenshot({path:out}); console.log(out); await p.close(); }
  await b.close(); })();
