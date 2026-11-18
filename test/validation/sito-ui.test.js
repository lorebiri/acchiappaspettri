// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Sito di presentazione (scarica/) in un browser vero, con l'API delle versioni di GitHub simulata:
// pulsante per il sistema riconosciuto (versione e dimensione), ripiego se GitHub non risponde, impronte SHA-256 con «Copia»,
// avviso quando l'ultima versione è precedente alla 3.0, tema chiaro/scuro ricordato, pagina inglese, nessuna richiesta
// a indirizzi esterni oltre all'API, niente scorrimento orizzontale sul telefono, nessun errore nella console.
// Uso: node --test test/validation/sito-ui.test.js   (PW_CHROMIUM=/percorso/chromium per un Chromium già presente;
//      SITO_SCREENSHOT=/cartella salva anche gli screenshot desktop e mobile, chiaro e scuro, in italiano e in inglese)
'use strict';
const test = require('node:test'), assert = require('node:assert'), http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json' };

function server() {
  const s = http.createServer((q, r) => {
    let p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
    if (!p.startsWith(ROOT)) { r.writeHead(403); r.end(); return; }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!fs.existsSync(p)) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(r);
  });
  return new Promise((res) => s.listen(0, '127.0.0.1', () => res(s)));
}
async function launch() {
  const { chromium } = require(path.join(ROOT, 'node_modules', 'playwright'));
  if (process.env.PW_CHROMIUM) return chromium.launch({ executablePath: process.env.PW_CHROMIUM });
  return chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
}
const UA = {
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  linux: 'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0',
  mobile: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
};
function release(v) {
  const n = (s) => `Acchiappaspettri_${v}_${s}`;
  return {
    tag_name: 'v' + v, draft: false, prerelease: false, published_at: '2026-11-20T10:00:00Z', html_url: `https://github.com/lorebiri/acchiappaspettri/releases/tag/v${v}`,
    assets: [[n('x64-setup.exe'), 2806549], [n('x64-setup.exe.sig'), 448], [n('aarch64.dmg'), 3488736], [n('x64.dmg'), 3710232], [n('amd64.AppImage'), 82340344], [n('amd64.deb'), 3835702], ['latest.json', 11744]]
      .map(([name, size], i) => ({ name, size, digest: 'sha256:' + 'abcdef0123456789'.repeat(4).slice(i) + '0'.repeat(i), browser_download_url: `https://github.com/lorebiri/acchiappaspettri/releases/download/v${v}/${name}` })),
  };
}

let srv, br;
test.before(async () => { srv = await server(); br = await launch(); });
test.after(async () => { await br.close(); srv.close(); });

async function apri(opt) {
  const ctx = await br.newContext({ userAgent: UA[opt.sistema || 'windows'], viewport: opt.viewport || { width: 1366, height: 860 }, locale: opt.lingua === 'en' ? 'en-GB' : 'it-IT', colorScheme: opt.scuro ? 'dark' : 'light', deviceScaleFactor: opt.dpr || 1, isMobile: !!opt.mobile, hasTouch: !!opt.mobile });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  // Safari, e in genere i browser fuori da Windows, non dichiarano l'architettura: niente userAgentData (il Chromium di prova direbbe x86)
  if (opt.sistema && opt.sistema !== 'windows') await ctx.addInitScript(() => Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => undefined }));
  const esterne = [], errori = [];
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === '127.0.0.1') return route.continue();
    if (u.href === 'https://api.github.com/repos/lorebiri/acchiappaspettri/releases/latest') {
      if (opt.api === 'errore') return route.fulfill({ status: 503, body: '' });
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(release(opt.versione || '3.0.0')) });
    }
    esterne.push(u.href); return route.abort();
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errori.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errori.push(m.text()); });
  await p.goto(`http://127.0.0.1:${srv.address().port}/scarica/${opt.lingua === 'en' ? 'en/' : ''}`);
  await p.waitForFunction(() => document.querySelector('#scarica-principale')?.getAttribute('aria-busy') === 'false', null, { timeout: 10000 });
  return { ctx, p, esterne, errori };
}

test('sito: Windows, pulsante con versione e dimensione, impronte, nessuna richiesta esterna', async () => {
  const o = await apri({ sistema: 'windows' });
  const r = await o.p.evaluate(() => {
    const a = document.querySelector('#scarica-principale a.btn.primario');
    return { testo: a.innerText.replace(/\s+/g, ' '), href: a.href, versione: document.querySelector('#versione').textContent,
      evidenza: document.querySelector('.carta-sistema.evidenza')?.dataset.sistema, impronte: document.querySelectorAll('[data-file] .impronta code').length,
      info: document.querySelector('[data-file="win"] .file-info').textContent, notaVersione: document.querySelector('#nota-versione').hidden,
      online: document.querySelector('.cta a.btn.secondario').getAttribute('href') };
  });
  assert.match(r.testo, /^Scarica per Windows versione 3\.0\.0 · 2,7 MB$/);
  assert.strictEqual(r.href, 'https://github.com/lorebiri/acchiappaspettri/releases/download/v3.0.0/Acchiappaspettri_3.0.0_x64-setup.exe');
  assert.match(r.versione, /^Ultima versione: 3\.0\.0, pubblicata il 20 novembre 2026\.$/);
  assert.strictEqual(r.evidenza, 'windows');
  assert.strictEqual(r.impronte, 5, 'un\'impronta per pacchetto');
  assert.strictEqual(r.info, 'Acchiappaspettri_3.0.0_x64-setup.exe · 2,7 MB');
  assert.strictEqual(r.notaVersione, true, 'con la 3.0 non c\'è l\'avviso della versione');
  assert.strictEqual(r.online, '../');
  // «Copia» mette l'impronta negli appunti e lo annuncia
  await o.p.click('[data-file="win"] .copia');
  await o.p.waitForFunction(() => document.querySelector('#annuncio')?.textContent);
  assert.match(await o.p.textContent('#annuncio'), /Impronta (copiata|selezionata)/);
  assert.deepStrictEqual(o.esterne, [], 'nessuna richiesta oltre all\'API delle versioni');
  assert.deepStrictEqual(o.errori, []);
  await o.ctx.close();
});

test('sito: Mac, Linux, telefono; GitHub che non risponde; versione 2.x', async () => {
  let o = await apri({ sistema: 'mac' });
  let t = await o.p.innerText('#scarica-principale');
  assert.match(t, /Scarica per Mac\s+chip Apple · versione 3\.0\.0 · 3,3 MB/);
  assert.match(t, /Mac con processore Intel/); assert.match(t, /Informazioni su questo Mac/);
  await o.ctx.close();
  o = await apri({ sistema: 'linux' });
  t = await o.p.innerText('#scarica-principale');
  assert.match(t, /Scarica per Linux\s+AppImage · versione 3\.0\.0 · 78,5 MB/); assert.match(t, /pacchetto \.deb/);
  await o.ctx.close();
  o = await apri({ sistema: 'mobile', viewport: { width: 390, height: 844 }, mobile: true });
  t = await o.p.innerText('#scarica-principale');
  assert.match(t, /Scegli il pacchetto/); assert.match(t, /Sul telefono o sul tablet usa la versione online/);
  await o.ctx.close();
  o = await apri({ sistema: 'windows', api: 'errore' });
  const r = await o.p.evaluate(() => ({ t: document.querySelector('#scarica-principale').innerText, href: document.querySelector('#scarica-principale a').href, impronte: document.querySelectorAll('.impronta').length }));
  assert.match(r.t, /Scarica per Windows\s+dalla pagina delle versioni su GitHub/); assert.match(r.t, /Non riesco a leggere/);
  assert.strictEqual(r.href, 'https://github.com/lorebiri/acchiappaspettri/releases/latest'); assert.strictEqual(r.impronte, 0);
  await o.ctx.close();
  o = await apri({ sistema: 'windows', versione: '2.2.0' });
  assert.match(await o.p.innerText('#nota-versione'), /La versione 3\.0 descritta in questa pagina è in arrivo: il pacchetto proposto oggi è la 2\.2\.0/);
  assert.deepStrictEqual(o.errori, []);
  await o.ctx.close();
});

test('sito: tema scelto e ricordato; pagina inglese; telefono senza scorrimento orizzontale', async () => {
  let o = await apri({ sistema: 'windows', scuro: true });
  const sfondo = () => o.p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const scuro = await sfondo();
  await o.p.click('#tema');   // auto → chiaro
  assert.strictEqual(await o.p.evaluate(() => document.documentElement.dataset.tema), 'chiaro');
  assert.notStrictEqual(await sfondo(), scuro);
  await o.p.reload(); await o.p.waitForLoadState('domcontentloaded');
  assert.strictEqual(await o.p.evaluate(() => document.documentElement.dataset.tema), 'chiaro', 'ricordato dopo il ricaricamento');
  await o.p.click('#tema'); assert.strictEqual(await o.p.evaluate(() => document.documentElement.dataset.tema), 'scuro');
  await o.p.click('#tema'); assert.strictEqual(await o.p.evaluate(() => document.documentElement.dataset.tema), undefined);
  await o.ctx.close();
  o = await apri({ sistema: 'windows', lingua: 'en' });
  const en = await o.p.evaluate(() => ({ btn: document.querySelector('#scarica-principale a.btn.primario').innerText.replace(/\s+/g, ' '), v: document.querySelector('#versione').textContent, img: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src) }));
  assert.match(en.btn, /^Download for Windows version 3\.0\.0 · 2\.7 MB$/); assert.match(en.v, /^Latest version: 3\.0\.0, published on 20 November 2026\.$/);
  assert.deepStrictEqual(o.errori, []);
  await o.ctx.close();
  for (const lingua of ['it', 'en']) {
    o = await apri({ sistema: 'mobile', lingua, viewport: { width: 375, height: 812 }, mobile: true });
    // tutte le immagini caricate (scorrendo la pagina) e nessun elemento più largo dello schermo
    await o.p.evaluate(async () => { for (const i of document.images) i.loading = 'eager'; await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); });
    const r = await o.p.evaluate(() => ({ larga: document.documentElement.scrollWidth, vista: innerWidth, rotte: [...document.images].filter((i) => !i.naturalWidth).map((i) => i.getAttribute('src')) }));
    assert.ok(r.larga <= r.vista, `${lingua}: pagina larga ${r.larga} px su ${r.vista}`);
    assert.deepStrictEqual(r.rotte, [], `${lingua}: immagini non caricate`);
    assert.deepStrictEqual(o.esterne, []);
    await o.ctx.close();
  }
});

test('sito: screenshot desktop e mobile, chiaro e scuro (con SITO_SCREENSHOT)', { skip: !process.env.SITO_SCREENSHOT }, async () => {
  const dir = process.env.SITO_SCREENSHOT; fs.mkdirSync(dir, { recursive: true });
  const casi = [
    ['desktop-it-chiaro', { sistema: 'windows' }], ['desktop-it-scuro', { sistema: 'windows', scuro: true }], ['desktop-en-chiaro', { sistema: 'mac', lingua: 'en' }],
    ['mobile-it-chiaro', { sistema: 'mobile', viewport: { width: 390, height: 844 }, mobile: true, dpr: 2 }], ['mobile-it-scuro', { sistema: 'mobile', viewport: { width: 390, height: 844 }, mobile: true, dpr: 2, scuro: true }],
    ['mobile-en-chiaro', { sistema: 'mobile', lingua: 'en', viewport: { width: 390, height: 844 }, mobile: true, dpr: 2 }],
  ];
  for (const [nome, opt] of casi) {
    const o = await apri({ viewport: { width: 1440, height: 900 }, ...opt });
    await o.p.evaluate(async () => { for (const i of document.images) i.loading = 'eager'; await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); });
    await o.p.screenshot({ path: path.join(dir, `${nome}-inizio.png`) });
    await o.p.screenshot({ path: path.join(dir, `${nome}-intera.png`), fullPage: true });
    for (const sez of ['scegli', 'funzioni', 'scarica']) {
      await o.p.evaluate((id) => { document.documentElement.style.scrollBehavior = 'auto'; document.getElementById(id).scrollIntoView(); }, sez);
      await o.p.waitForTimeout(150);
      await o.p.screenshot({ path: path.join(dir, `${nome}-${sez}.png`) });
    }
    await o.ctx.close();
  }
});
