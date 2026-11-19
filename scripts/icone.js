// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Icone di Acchiappaspettri, tutte da un solo disegno: brand/icona*.svg (identità ibrida, variante C «il 3.0 con l'occhiolino").
   Uso: node scripts/icone.js            → rigenera tutto e scrive brand/icone.json (impronte)
   Serve Playwright con Chromium (lo stesso dei test dell'interfaccia): il disegno vettoriale si rasterizza direttamente a ogni dimensione.
   A 16, 24 e 32 px si usa brand/icona-piccola.svg (stesso disegno, tratti più spessi), come fanno .ico e .icns con più immagini dentro.
   Produce:
   - src-tauri/icons: 32x32.png, 128x128.png, 128x128@2x.png, icon.png (512), icon.icns, icon.ico, icona.svg
     (sono le icone di finestra, installer NSIS, .app/.dmg, AppImage e .deb: Tauri le prende da tauri.conf.json → bundle.icon)
   - app online: favicon PNG 32 px e SVG in data URI dentro index.html, apple-touch-icon.png (180), manifest.webmanifest e icone/ per la PWA,
     icone/og.jpg (Open Graph 1200×630) con i meta og: in index.html, marchio nell'intestazione
   - scarica/: icona.svg, icona-32.png e apple-touch-icon.png (anche per en/), anteprima.jpg per i social (icona e nome sopra la schermata vera)
   - la pagina 404.html del sito (icona e Gino in linea)
   test/unit/icone.test.js verifica che le icone coincidano ovunque con le impronte di brand/icone.json. */
'use strict';
const fs=require('fs'), path=require('path'), crypto=require('crypto');
const ROOT=path.join(__dirname,'..'), P=(...a)=>path.join(ROOT,...a);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const SRC={ icona:'brand/icona.svg', piccola:'brand/icona-piccola.svg', tonda:'brand/icona-tonda.svg', piena:'brand/icona-piena.svg' };
const SITO='https://lorebiri.github.io/acchiappaspettri/';
const COLORE='#1d3557';

/* ---- formati contenitore: entrambi accettano PNG così come sono ---- */
function ico(imgs){ // imgs: [{size, png}]
  const head=Buffer.alloc(6); head.writeUInt16LE(0,0); head.writeUInt16LE(1,2); head.writeUInt16LE(imgs.length,4);
  let off=6+16*imgs.length; const dir=[], data=[];
  for (const {size,png} of imgs){ const e=Buffer.alloc(16); e[0]=size>=256?0:size; e[1]=size>=256?0:size; e[2]=0; e[3]=0;
    e.writeUInt16LE(1,4); e.writeUInt16LE(32,6); e.writeUInt32LE(png.length,8); e.writeUInt32LE(off,12); off+=png.length; dir.push(e); data.push(png); }
  return Buffer.concat([head,...dir,...data]); }
function icns(entries){ // entries: [{type, png}]
  const parts=entries.map(({type,png})=>{ const h=Buffer.alloc(8); h.write(type,0,'ascii'); h.writeUInt32BE(png.length+8,4); return Buffer.concat([h,png]); });
  const total=8+parts.reduce((s,b)=>s+b.length,0), h=Buffer.alloc(8); h.write('icns',0,'ascii'); h.writeUInt32BE(total,4); return Buffer.concat([h,...parts]); }
/* lettura, usata anche dal test */
function readIco(buf){ const n=buf.readUInt16LE(4), out=[]; for (let i=0;i<n;i++){ const o=6+16*i, size=buf[o]||256, len=buf.readUInt32LE(o+8), at=buf.readUInt32LE(o+12); out.push({size, png:buf.subarray(at,at+len)}); } return out; }
function readIcns(buf){ const out=[]; for (let o=8;o<buf.length;){ const type=buf.toString('ascii',o,o+4), len=buf.readUInt32BE(o+4); out.push({type, png:buf.subarray(o+8,o+len)}); o+=len; } return out; }
function pngSize(b){ return {w:b.readUInt32BE(16), h:b.readUInt32BE(20)}; }
// tipi .icns con PNG: px reali → tipo (le @2x sono le stesse immagini del doppio)
const ICNS_TYPES=[['icp4',16],['icp5',32],['ic11',32],['icp6',64],['ic12',64],['ic07',128],['ic08',256],['ic13',256],['ic09',512],['ic14',1024],['ic10',1024]];
const ICO_SIZES=[16,24,32,48,64,128,256];
const fonte=s=>s<=32?'piccola':'icona';

/* blocchi generati dentro index.html, tra due marcatori */
const MARK={ head:['<!-- icone: generato da scripts/icone.js, non modificare a mano -->','<!-- /icone -->'], brand:['<!--marchio-->','<!--/marchio-->'],
  icona404:['<!--icona404-->','<!--/icona404-->'], marchio404:['<!--marchio404-->','<!--/marchio404-->'], gino404:['<!--gino404-->','<!--/gino404-->'] };
const dataUri=(mime,b)=>`data:${mime};base64,${Buffer.from(b).toString('base64')}`;
function headBlock(fav32, svgPiccola){ return [MARK.head[0],
  `<link rel="icon" type="image/png" sizes="32x32" href="${dataUri('image/png',fav32)}">`,
  `<link rel="icon" type="image/svg+xml" href="${dataUri('image/svg+xml',svgPiccola)}">`,
  '<link rel="apple-touch-icon" href="apple-touch-icon.png">',
  '<link rel="manifest" href="manifest.webmanifest">',
  '<meta property="og:type" content="website">',
  '<meta property="og:site_name" content="Acchiappaspettri">',
  '<meta property="og:title" content="Acchiappaspettri: spettri e cromatogrammi, dal file al grafico">',
  '<meta property="og:description" content="Gratuito e open source, nel browser o sul tuo computer. I dati restano sul tuo computer.">',
  `<meta property="og:url" content="${SITO}">`,
  `<meta property="og:image" content="${SITO}icone/og.jpg">`,
  '<meta property="og:image:type" content="image/jpeg">','<meta property="og:image:width" content="1200">','<meta property="og:image:height" content="630">',
  '<meta property="og:image:alt" content="Icona di Acchiappaspettri: la curva di uno spettro il cui picco è il fantasmino Gino">',
  '<meta name="twitter:card" content="summary_large_image">',
  MARK.head[1]].join('\n'); }
const blocks404=(fav32, svgPiccola)=>({
  icona404:`${MARK.icona404[0]}<link rel="icon" type="image/png" sizes="32x32" href="${dataUri('image/png',fav32)}">\n<link rel="icon" type="image/svg+xml" href="${dataUri('image/svg+xml',svgPiccola)}">${MARK.icona404[1]}`,
  marchio404:`${MARK.marchio404[0]}<img src="${dataUri('image/svg+xml',svgPiccola)}" alt="">${MARK.marchio404[1]}`,
  gino404:`${MARK.gino404[0]}${require('../app/gino.js').svg('perso','colore')}${MARK.gino404[1]}` });
const brandBlock=svgPiccola=>`${MARK.brand[0]}<img src="${dataUri('image/svg+xml',svgPiccola)}" alt="" width="30" height="30">${MARK.brand[1]}`;
function between(html, [a,b], block){ const i=html.indexOf(a), j=html.indexOf(b); if (i<0||j<i) throw new Error('icone: marcatori non trovati: '+a); return html.slice(0,i)+block+html.slice(j+b.length); }

const MANIFEST=()=>({ name:'Acchiappaspettri', short_name:'Acchiappaspettri', description:'Spettri e cromatogrammi: grafici puliti e analisi scientifica, i dati restano sul tuo computer.',
  lang:'it', start_url:'./', scope:'./', display:'standalone', background_color:'#ffffff', theme_color:'#2563c9',
  icons:[ {src:'icone/icona-192.png', sizes:'192x192', type:'image/png', purpose:'any'},
          {src:'icone/icona-512.png', sizes:'512x512', type:'image/png', purpose:'any'},
          {src:'icone/icona-maskable-512.png', sizes:'512x512', type:'image/png', purpose:'maskable'},
          {src:'icone/icona.svg', sizes:'any', type:'image/svg+xml', purpose:'any'} ] });

// anteprima per i social del sito scarica/ (IT ed EN): icona e nome sopra la schermata vera del programma (scarica/img/desktop-spazio.webp)
function ogSitoHtml(svgIcona, webp){ return `<!doctype html><meta charset="utf-8"><style>body{margin:0;width:1200px;height:630px;overflow:hidden;box-sizing:border-box;padding:44px 70px 0;
  background:linear-gradient(160deg,#1d3557 0%,#23477a 60%,#2563c9 100%);color:#fff;font-family:Nunito,system-ui,sans-serif}
  header{display:flex;align-items:center;gap:22px;margin-bottom:34px}h1{font-size:60px;margin:0;font-weight:800;letter-spacing:-.5px}
  .shot{width:1060px;border-radius:14px 14px 0 0;box-shadow:0 18px 50px #0007;display:block}</style>
  <header><img src="${dataUri('image/svg+xml',svgIcona)}" width="104" height="104"><h1>Acchiappaspettri</h1></header>
  <img class="shot" src="data:image/webp;base64,${Buffer.from(webp).toString('base64')}">`; }
function ogHtml(svgIcona){ return `<!doctype html><meta charset="utf-8"><style>body{margin:0;width:1200px;height:630px;display:flex;align-items:center;gap:56px;padding:0 90px;box-sizing:border-box;
  background:linear-gradient(160deg,#1d3557 0%,#23477a 60%,#2563c9 100%);color:#fff;font-family:Nunito,system-ui,sans-serif}
  h1{font-size:76px;margin:0 0 14px;font-weight:800;letter-spacing:-.5px}p{font-size:31px;margin:0;opacity:.92;line-height:1.3}</style>
  <img src="${dataUri('image/svg+xml',svgIcona)}" width="330" height="330"><div><h1>Acchiappaspettri</h1><p>Spettri e cromatogrammi,<br>dal file al grafico e all'analisi.<br>Online o sul tuo computer.</p></div>`; }

async function main(){
  const { chromium } = require('playwright');
  const svg={}; for (const k in SRC) svg[k]=fs.readFileSync(P(SRC[k]));
  const browser=await chromium.launch(process.env.PW_EXECUTABLE ? {executablePath:process.env.PW_EXECUTABLE} : process.env.PW_CHANNEL ? {channel:process.env.PW_CHANNEL} : {}), page=await browser.newPage({deviceScaleFactor:1});
  const cache=new Map();
  async function png(k, size){ const key=k+size; if (cache.has(key)) return cache.get(key);
    await page.setViewportSize({width:Math.max(size,16), height:Math.max(size,16)});
    await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}img{display:block}</style><img src="${dataUri('image/svg+xml',svg[k])}" width="${size}" height="${size}">`);
    await page.waitForFunction(()=>document.images[0].complete);
    const b=await page.locator('img').screenshot({omitBackground:true, type:'png'}); cache.set(key,b); return b; }
  const out={};   // percorso → buffer
  const W=(rel,buf)=>{ fs.mkdirSync(path.dirname(P(rel)),{recursive:true}); fs.writeFileSync(P(rel),buf); out[rel]=buf; };

  // desktop (Tauri): finestra, installer, .app/.dmg, AppImage, .deb
  W('src-tauri/icons/32x32.png', await png('piccola',32));
  W('src-tauri/icons/128x128.png', await png('icona',128));
  W('src-tauri/icons/128x128@2x.png', await png('icona',256));
  W('src-tauri/icons/icon.png', await png('icona',512));
  const icoImgs=[]; for (const s of ICO_SIZES) icoImgs.push({size:s, png:await png(fonte(s),s)});
  W('src-tauri/icons/icon.ico', ico(icoImgs));
  const icnsE=[]; for (const [type,s] of ICNS_TYPES) icnsE.push({type, png:await png(fonte(type==='ic11'?16:type==='ic12'?32:s), s)});
  W('src-tauri/icons/icon.icns', icns(icnsE));
  W('src-tauri/icons/icona.svg', svg.icona);
  if (fs.existsSync(P('src-tauri/icons/icona-3.0.svg'))) fs.rmSync(P('src-tauri/icons/icona-3.0.svg'));

  // app online e PWA
  W('apple-touch-icon.png', await png('piena',180));   // iOS arrotonda da sé: disegno a tutta tela
  W('icone/icona.svg', svg.icona);
  W('icone/icona-192.png', await png('icona',192));
  W('icone/icona-512.png', await png('icona',512));
  W('icone/icona-maskable-512.png', await png('piena',512));
  W('manifest.webmanifest', Buffer.from(JSON.stringify(MANIFEST(),null,1)+'\n'));
  const fav32=await png('piccola',32);
  let html=fs.readFileSync(P('index.html'),'utf8');
  html=between(html, MARK.head, headBlock(fav32, svg.piccola)); html=between(html, MARK.brand, brandBlock(svg.piccola));
  fs.writeFileSync(P('index.html'), html);
  // pagina 404 del sito: tutto in linea (Pages la serve da qualunque percorso)
  let h404=fs.readFileSync(P('404.html'),'utf8');
  for (const [k,block] of Object.entries(blocks404(fav32, svg.piccola))) h404=between(h404, MARK[k], block);
  fs.writeFileSync(P('404.html'), h404);

  // sito scarica/ (anche en/, che punta a ../icona.svg)
  W('scarica/icona.svg', svg.icona);
  W('scarica/icona-32.png', fav32);
  W('scarica/apple-touch-icon.png', await png('piena',180));

  // Open Graph
  await page.setViewportSize({width:1200,height:630}); await page.setContent(ogHtml(svg.icona)); await page.waitForFunction(()=>document.images[0].complete);
  W('icone/og.jpg', await page.screenshot({type:'jpeg', quality:88}));
  await page.setContent(ogSitoHtml(svg.icona, fs.readFileSync(P('scarica/img/desktop-spazio.webp')))); await page.waitForFunction(()=>[...document.images].every(i=>i.complete));
  W('scarica/anteprima.jpg', await page.screenshot({type:'jpeg', quality:86}));
  await browser.close();

  // impronte: sorgenti, file prodotti, immagini dentro .ico/.icns e i data URI di index.html
  const stamp={ nota:'generato da scripts/icone.js: impronte SHA-256 controllate da test/unit/icone.test.js', sorgenti:{}, file:{}, favicon32:sha(fav32), ico:{}, icns:{} };
  for (const k in SRC) stamp.sorgenti[SRC[k]]=sha(svg[k]);
  for (const rel of Object.keys(out).sort()) stamp.file[rel]=sha(out[rel]);
  for (const {size,png:b} of icoImgs) stamp.ico[size]=sha(b);
  for (const {type,png:b} of icnsE) stamp.icns[type]=sha(b);
  fs.writeFileSync(P('brand/icone.json'), JSON.stringify(stamp,null,1)+'\n');
  console.log('icone rigenerate:', Object.keys(out).length, 'file + index.html');
}
if (require.main===module) main().catch(e=>{ console.error(e); process.exit(1); });
module.exports={ SRC, MARK, blocks404, MANIFEST, readIco, readIcns, pngSize, ICO_SIZES, ICNS_TYPES, dataUri, COLORE };
