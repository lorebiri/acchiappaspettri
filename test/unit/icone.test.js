// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Identità ibrida: le icone coincidono ovunque (desktop, installer, app online, PWA, sito scarica/, Open Graph, README)
// e derivano tutte dal disegno attuale in brand/. Se cambi un SVG in brand/, rilancia: node scripts/icone.js
'use strict';
const {test}=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), crypto=require('crypto');
const I=require('../../scripts/icone.js');
const ROOT=path.join(__dirname,'..','..'), R=f=>fs.readFileSync(path.join(ROOT,f)), sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const ST=JSON.parse(R('brand/icone.json'));
const html=R('index.html').toString('utf8');

test('i disegni in brand/ sono quelli da cui sono state generate le icone (altrimenti: node scripts/icone.js)', ()=>{
  for (const f of Object.values(I.SRC)) assert.strictEqual(sha(R(f)), ST.sorgenti[f], f+' è cambiato dopo l\'ultima generazione');
});

test('ogni file prodotto coincide con la sua impronta', ()=>{
  assert.ok(Object.keys(ST.file).length>=15);
  for (const [f,h] of Object.entries(ST.file)) assert.strictEqual(sha(R(f)), h, f);
});

test('una sola icona SVG: brand/, desktop, sito scarica/ (anche en/) e PWA sono lo stesso file', ()=>{
  const ref=R('brand/icona.svg');
  for (const f of ['src-tauri/icons/icona.svg','scarica/icona.svg','icone/icona.svg']) assert.ok(R(f).equals(ref), f);
  assert.ok(!fs.existsSync(path.join(ROOT,'src-tauri/icons/icona-3.0.svg')), 'la vecchia icona 3.0 non deve più esserci');
  for (const f of ['scarica/index.html','scarica/en/index.html']){ const h=R(f).toString(); const pre=f.includes('/en/')?'../':'';
    assert.ok(h.includes(`<link rel="icon" href="${pre}icona.svg"`), f+': favicon'); assert.ok(h.includes(`<img src="${pre}icona.svg"`), f+': marchio'); }
});

test('app online: favicon SVG e PNG, marchio nell\'intestazione e apple-touch sono quelli di brand/', ()=>{
  const svgUri=I.dataUri('image/svg+xml', R('brand/icona-piccola.svg'));
  assert.ok(html.includes(`<link rel="icon" type="image/svg+xml" href="${svgUri}">`), 'favicon SVG');
  const m=html.match(/<link rel="icon" type="image\/png" sizes="32x32" href="data:image\/png;base64,([^"]+)">/); assert.ok(m, 'favicon PNG');
  assert.strictEqual(sha(Buffer.from(m[1],'base64')), ST.favicon32); assert.strictEqual(ST.favicon32, ST.file['src-tauri/icons/32x32.png']);
  assert.ok(html.includes(`${I.MARK.brand[0]}<img src="${svgUri}" alt="" width="30" height="30">${I.MARK.brand[1]}`), 'marchio');
  assert.ok(!/fill=%22%23fff%22 stroke=%22%231c2230%22/.test(html.slice(0,4000)), 'niente più il vecchio fantasmino nei favicon');
  assert.strictEqual((html.match(/<link rel="icon"/g)||[]).length, 2);
  assert.ok(html.includes('<link rel="apple-touch-icon" href="apple-touch-icon.png">'));
  assert.deepStrictEqual(I.pngSize(R('apple-touch-icon.png')), {w:180,h:180});
});

test('PWA: manifest con le icone giuste, che esistono e hanno la dimensione dichiarata', ()=>{
  assert.ok(html.includes('<link rel="manifest" href="manifest.webmanifest">'));
  const M=JSON.parse(R('manifest.webmanifest')); assert.deepStrictEqual(M, I.MANIFEST());
  assert.ok(M.icons.some(i=>i.purpose==='maskable'));
  for (const i of M.icons){ assert.ok(fs.existsSync(path.join(ROOT,i.src)), i.src); if (i.type==='image/png'){ const [w]=i.sizes.split('x').map(Number); assert.deepStrictEqual(I.pngSize(R(i.src)), {w,h:w}, i.src); } }
});

test('desktop: tauri.conf.json usa le icone generate; .ico e .icns contengono le immagini generate a ogni dimensione', ()=>{
  const conf=JSON.parse(R('src-tauri/tauri.conf.json'));
  assert.deepStrictEqual(conf.bundle.icon, ['icons/32x32.png','icons/128x128.png','icons/128x128@2x.png','icons/icon.icns','icons/icon.ico']);
  for (const [f,s] of [['32x32.png',32],['128x128.png',128],['128x128@2x.png',256],['icon.png',512]]) assert.deepStrictEqual(I.pngSize(R('src-tauri/icons/'+f)), {w:s,h:s}, f);
  const ico=I.readIco(R('src-tauri/icons/icon.ico')); assert.deepStrictEqual(ico.map(e=>e.size), I.ICO_SIZES);
  for (const e of ico){ assert.strictEqual(sha(e.png), ST.ico[e.size], 'ico '+e.size); assert.deepStrictEqual(I.pngSize(e.png), {w:e.size,h:e.size}); }
  assert.strictEqual(ST.ico[32], ST.file['src-tauri/icons/32x32.png']); assert.strictEqual(ST.ico[256], ST.file['src-tauri/icons/128x128@2x.png']); assert.strictEqual(ST.ico[128], ST.file['src-tauri/icons/128x128.png']);
  const icns=I.readIcns(R('src-tauri/icons/icon.icns')); assert.deepStrictEqual(icns.map(e=>e.type), I.ICNS_TYPES.map(t=>t[0]));
  for (const e of icns){ const px=I.ICNS_TYPES.find(t=>t[0]===e.type)[1]; assert.strictEqual(sha(e.png), ST.icns[e.type], 'icns '+e.type); assert.deepStrictEqual(I.pngSize(e.png), {w:px,h:px}); }
  assert.strictEqual(ST.icns.ic09, ST.file['src-tauri/icons/icon.png']);
});

test('Open Graph e README mostrano la stessa icona', ()=>{
  assert.ok(html.includes('<meta property="og:image" content="https://lorebiri.github.io/acchiappaspettri/icone/og.jpg">'));
  const og=R('icone/og.jpg'); assert.strictEqual(og[0],0xff); assert.strictEqual(og[1],0xd8);
  assert.ok(/<img src="brand\/icona\.svg"[^>]*>/.test(R('README.md').toString()), 'README');
});

test('pagina 404: stessa favicon e stesso marchio dell\'app online, Gino «perso» di app/gino.js', ()=>{
  const h=R('404.html').toString(), b=I.blocks404(Buffer.alloc(0), R('brand/icona-piccola.svg'));   // marchio e Gino non dipendono dal PNG
  assert.ok(h.includes(b.marchio404), 'marchio'); assert.ok(h.includes(b.gino404), 'Gino');
  const m=h.match(/<link rel="icon" type="image\/png" sizes="32x32" href="data:image\/png;base64,([^"]+)">/); assert.ok(m); assert.strictEqual(sha(Buffer.from(m[1],'base64')), ST.favicon32);
  assert.ok(h.includes(`<link rel="icon" type="image/svg+xml" href="${I.dataUri('image/svg+xml', R('brand/icona-piccola.svg'))}">`));
});
