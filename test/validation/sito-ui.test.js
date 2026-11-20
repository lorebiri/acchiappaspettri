// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Sito di presentazione (scarica/) in un browser vero, con l'API delle versioni di GitHub simulata.
// Sistemi: Windows, Mac con chip Apple e Intel, Linux (AppImage e .deb), telefono e tablet: pulsante e file giusti, con
// dimensione e versione. Dati scritti nella pagina mostrati subito e anche senza JavaScript; GitHub che non risponde, lento
// o al limite di richieste (restano i dati della pagina, una sola richiesta ogni 2 minuti); versione più nuova o più vecchia
// su GitHub. Impronte SHA-256 con «Copia», tema chiaro/scuro ricordato, pagina inglese, ancore e Novità, nessuna richiesta a
// indirizzi esterni oltre all'API, niente scorrimento orizzontale su telefono e tablet, nessun errore nella console.
// Uso: node --test test/validation/sito-ui.test.js   (PW_CHROMIUM=/percorso/chromium per un Chromium già presente;
//      SITO_SCREENSHOT=/cartella salva anche gli screenshot: desktop, tablet e telefono, chiaro e scuro, italiano e inglese)
'use strict';
const test = require('node:test'), assert = require('node:assert'), http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.xml': 'application/xml' };
const API = 'https://api.github.com/repos/lorebiri/acchiappaspettri/releases/latest';

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
let PW;
async function launch() {
  PW = require(path.join(ROOT, 'node_modules', 'playwright'));
  if (process.env.PW_CHROMIUM) return PW.chromium.launch({ executablePath: process.env.PW_CHROMIUM });
  return PW.chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
}
const UA = {
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  linux: 'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0',
  mobile: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  tablet: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};
const TELEFONO = { viewport: { width: 390, height: 844 }, mobile: true, dpr: 2 };
const TABLET = { viewport: { width: 820, height: 1180 }, mobile: true, dpr: 2 };

// la release simulata ha dimensioni diverse da quelle vere scritte nella pagina: così si vede quale dato è mostrato
const DIM = { 'x64-setup.exe': 2806549, 'aarch64.dmg': 3488736, 'x64.dmg': 3710232, 'amd64.AppImage': 82340344, 'amd64.deb': 3835702 };
function release(v) {
  const n = (s) => `Acchiappaspettri_${v}_${s}`;
  return {
    tag_name: 'v' + v, draft: false, prerelease: false, published_at: '2026-11-20T10:00:00Z', html_url: `https://github.com/lorebiri/acchiappaspettri/releases/tag/v${v}`,
    assets: [...Object.entries(DIM).map(([s, size]) => [n(s), size]), [n('x64-setup.exe.sig'), 448], ['latest.json', 11744]]
      .map(([name, size], i) => ({ name, size, digest: 'sha256:' + 'abcdef0123456789'.repeat(4).slice(i) + '0'.repeat(i), browser_download_url: `https://github.com/lorebiri/acchiappaspettri/releases/download/v${v}/${name}` })),
  };
}
// i dati scritti nella pagina (quelli che restano se GitHub non risponde)
const STATICI = JSON.parse(/<script type="application\/json" id="dati-versione">([\s\S]*?)<\/script>/.exec(fs.readFileSync(path.join(ROOT, 'scarica', 'index.html'), 'utf8'))[1]);
const VS = STATICI.versione;
const mb = (byte, lingua = 'it') => (byte == null ? '' : `${(byte / 1048576).toLocaleString(lingua === 'en' ? 'en-GB' : 'it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`);
const re = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

let srv, br;
test.before(async () => { srv = await server(); br = await launch(); });
test.after(async () => { await br?.close(); srv?.close(); });

async function apri(opt = {}) {
  const ctx = await br.newContext({
    userAgent: UA[opt.ua || opt.sistema || 'windows'], viewport: opt.viewport || { width: 1366, height: 860 }, locale: opt.lingua === 'en' ? 'en-GB' : 'it-IT',
    colorScheme: opt.scuro ? 'dark' : 'light', deviceScaleFactor: opt.dpr || 1, isMobile: !!opt.mobile, hasTouch: !!opt.mobile, javaScriptEnabled: opt.js !== false,
  });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  // Safari, e in genere i browser fuori da Windows, non dichiarano l'architettura: niente userAgentData (il Chromium di prova direbbe x86).
  // Il Mac Intel con Chrome invece la dichiara: x86.
  if (opt.arch) await ctx.addInitScript((a) => Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => ({ platform: 'macOS', mobile: false, brands: [], getHighEntropyValues: async () => ({ architecture: a }) }) }), opt.arch);
  else if (opt.sistema && opt.sistema !== 'windows') await ctx.addInitScript(() => Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => undefined }));
  const esterne = [], errori = [], chiamate = [];
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === '127.0.0.1') {
      if (!opt.pagina || !/\/scarica\/(en\/)?$/.test(u.pathname)) return route.continue();
      return route.fetch().then(async (r) => route.fulfill({ response: r, body: opt.pagina(await r.text()) }));
    }
    if (u.href === API) {
      chiamate.push(Date.now());
      const api = opt.api || 'ok';
      if (api === 'errore') return route.fulfill({ status: 503, body: '' });
      if (api === 'limite') return route.fulfill({ status: 403, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'x-ratelimit-remaining', 'x-ratelimit-remaining': '0' }, body: '{"message":"API rate limit exceeded"}' });
      if (api === 'rete') return route.abort('internetdisconnected');
      const corpo = { status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(release(opt.versione || VS)) };
      if (api === 'lento') { setTimeout(() => route.fulfill(corpo).catch(() => {}), 9000); return undefined; }
      return route.fulfill(corpo);
    }
    esterne.push(u.href); return route.abort();
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errori.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errori.push(m.text()); });
  await p.goto(`http://127.0.0.1:${srv.address().port}/scarica/${opt.lingua === 'en' ? 'en/' : ''}`);
  if (opt.js !== false && opt.attendi !== false) await p.waitForFunction(() => document.documentElement.dataset.release, null, { timeout: 15000 });
  return { ctx, p, esterne, errori, chiamate };
}
const principale = (o) => o.p.evaluate(() => {
  const a = document.querySelector('#scarica-principale a.btn.primario');
  return { testo: a.innerText.replace(/\s+/g, ' ').trim(), href: a.href, tutto: document.querySelector('#scarica-principale').innerText.replace(/\s+/g, ' '),
    altri: [...document.querySelectorAll('#scarica-principale .nota-pulsante a')].map((x) => ({ t: x.textContent, href: x.href })) };
});
const dl = (v, s) => `https://github.com/lorebiri/acchiappaspettri/releases/download/v${v}/Acchiappaspettri_${v}_${s}`;

test('sito: Windows, pulsante con versione e dimensione da GitHub, impronte con «Copia», nessuna richiesta esterna', async () => {
  const o = await apri({ sistema: 'windows' });
  const b = await principale(o);
  assert.strictEqual(b.testo, `Scarica per Windows versione ${VS} · 2,7 MB`);
  assert.strictEqual(b.href, dl(VS, 'x64-setup.exe'));
  const r = await o.p.evaluate(() => ({
    versione: document.querySelector('#versione').textContent, evidenza: document.querySelector('.carta-sistema.evidenza')?.dataset.sistema,
    impronte: document.querySelectorAll('[data-file] .impronta code').length, copia: document.querySelectorAll('[data-file] .impronta .copia').length,
    info: document.querySelector('[data-file="win"] .file-info').textContent, nota: document.querySelector('#nota-versione').hidden,
    online: document.querySelector('.cta a.btn.secondario').getAttribute('href'), fonte: document.documentElement.dataset.release,
  }));
  assert.strictEqual(r.versione, `Ultima versione: ${VS}, pubblicata il 20 novembre 2026. Le novità`);
  assert.strictEqual(r.evidenza, 'windows');
  assert.strictEqual(r.impronte, 5); assert.strictEqual(r.copia, 5, 'un\'impronta e un «Copia» per pacchetto');
  assert.strictEqual(r.info, `Acchiappaspettri_${VS}_x64-setup.exe · 2,7 MB`);
  assert.strictEqual(r.nota, true); assert.strictEqual(r.online, '../'); assert.strictEqual(r.fonte, 'github');
  await o.p.click('[data-file="win"] .copia');
  await o.p.waitForFunction(() => document.querySelector('#annuncio')?.textContent);
  assert.match(await o.p.textContent('#annuncio'), /Impronta (copiata|selezionata)/);
  assert.deepStrictEqual(o.esterne, [], 'nessuna richiesta oltre all\'API delle versioni');
  assert.deepStrictEqual(o.errori, []);
  await o.ctx.close();
});

test('sito: Mac con chip Apple e con Intel, Linux AppImage e .deb: pulsante e file giusti', async () => {
  let o = await apri({ sistema: 'mac' });
  let b = await principale(o);
  assert.strictEqual(b.testo, `Scarica per Mac chip Apple · versione ${VS} · 3,3 MB`);
  assert.strictEqual(b.href, dl(VS, 'aarch64.dmg'));
  assert.deepStrictEqual(b.altri, [{ t: 'Mac con processore Intel', href: dl(VS, 'x64.dmg') }]);
  assert.match(b.tutto, /Informazioni su questo Mac/);
  assert.strictEqual(await o.p.evaluate(() => document.querySelector('.carta-sistema.evidenza')?.dataset.sistema), 'mac');
  await o.ctx.close();
  o = await apri({ sistema: 'mac', ua: 'macChrome', arch: 'x86' });
  b = await principale(o);
  assert.strictEqual(b.testo, `Scarica per Mac Intel · versione ${VS} · 3,5 MB`);
  assert.strictEqual(b.href, dl(VS, 'x64.dmg'));
  assert.deepStrictEqual(b.altri.map((x) => x.href), [dl(VS, 'aarch64.dmg')]);
  await o.ctx.close();
  o = await apri({ sistema: 'mac', ua: 'macChrome', arch: 'arm' });
  assert.strictEqual((await principale(o)).href, dl(VS, 'aarch64.dmg'));
  await o.ctx.close();
  o = await apri({ sistema: 'linux' });
  b = await principale(o);
  assert.strictEqual(b.testo, `Scarica per Linux AppImage · versione ${VS} · 78,5 MB`);
  assert.strictEqual(b.href, dl(VS, 'amd64.AppImage'));
  assert.deepStrictEqual(b.altri, [{ t: 'Linux, pacchetto .deb (Debian, Ubuntu)', href: dl(VS, 'amd64.deb') }]);
  assert.strictEqual(await o.p.textContent('[data-file="linux-deb"] .file-info'), `Acchiappaspettri_${VS}_amd64.deb · 3,7 MB`);
  assert.deepStrictEqual(o.errori, []);
  await o.ctx.close();
});

test('sito: telefono e tablet propongono la versione online e la scelta del pacchetto, senza scorrimento orizzontale', async () => {
  for (const [ua, vista] of [['mobile', TELEFONO], ['tablet', TABLET], ['android', TABLET]]) {
    const o = await apri({ sistema: 'mobile', ua, ...vista });
    const b = await principale(o);
    assert.match(b.tutto, /Scegli il pacchetto/, ua); assert.match(b.tutto, /Sul telefono o sul tablet usa la versione online/, ua);
    assert.match(b.href, /#scarica$/);
    await o.p.evaluate(async () => { for (const i of document.images) i.loading = 'eager'; await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); });
    const r = await o.p.evaluate(() => ({ larga: document.documentElement.scrollWidth, vista: innerWidth, rotte: [...document.images].filter((i) => !i.naturalWidth).map((i) => i.getAttribute('src')) }));
    assert.ok(r.larga <= r.vista, `${ua}: pagina larga ${r.larga} px su ${r.vista}`);
    assert.deepStrictEqual(r.rotte, [], `${ua}: immagini non caricate`);
    assert.deepStrictEqual(o.errori, []); assert.deepStrictEqual(o.esterne, []);
    await o.ctx.close();
  }
});

test('sito: GitHub che non risponde, al limite di richieste, senza rete o lento: restano i dati scritti nella pagina', async () => {
  const atteso = `Scarica per Windows versione ${VS}${STATICI.file.win.dimensione ? ` · ${mb(STATICI.file.win.dimensione)}` : ''}`;
  for (const api of ['errore', 'limite', 'rete']) {
    const o = await apri({ sistema: 'windows', api });
    const b = await principale(o);
    assert.strictEqual(b.testo, atteso, api);
    assert.strictEqual(b.href, STATICI.file.win.url, api);
    assert.doesNotMatch(b.tutto, /Non riesco a leggere/, `${api}: nessun messaggio d'errore, i dati della pagina bastano`);
    const r = await o.p.evaluate(() => ({ fonte: document.documentElement.dataset.release, impronte: document.querySelectorAll('[data-file] .impronta code').length, copia: document.querySelectorAll('.impronta .copia').length, v: document.querySelector('#versione').textContent }));
    assert.strictEqual(r.fonte, 'pagina', api);
    const conImpronta = Object.values(STATICI.file).filter((f) => f.sha256).length;
    assert.strictEqual(r.impronte, conImpronta); assert.strictEqual(r.copia, conImpronta);
    assert.match(r.v, new RegExp(`^(Ultima versione|Versione):? ${re(VS)}`));
    if (api === 'limite') {
      // l'errore è ricordato 2 minuti: ricaricando, la pagina non richiama GitHub
      await o.p.reload(); await o.p.waitForFunction(() => document.documentElement.dataset.release);
      assert.strictEqual(o.chiamate.length, 1, 'una sola richiesta a GitHub');
    }
    // il browser registra da sé la risposta 503/403 della richiesta fallita: non è un errore della pagina
    assert.deepStrictEqual(o.errori.filter((e) => !/^Failed to load resource: .*(503|403)/.test(e) && !/ERR_INTERNET_DISCONNECTED/.test(e)), [], api);
    await o.ctx.close();
  }
  // lento: il pulsante giusto c'è subito, prima che GitHub risponda; dopo 6 s la pagina smette di aspettare
  const o = await apri({ sistema: 'windows', api: 'lento', attendi: false });
  await o.p.waitForFunction(() => document.querySelector('#scarica-principale a.btn.primario')?.textContent.includes('Windows'), null, { timeout: 2000 });
  assert.strictEqual((await principale(o)).testo, atteso);
  await o.p.waitForFunction(() => document.documentElement.dataset.release, null, { timeout: 10000 });
  assert.strictEqual(await o.p.evaluate(() => document.documentElement.dataset.release), 'pagina');
  assert.deepStrictEqual(o.errori, []);
  await o.ctx.close();
});

test('sito: versione più nuova su GitHub aggiorna la pagina; una più vecchia non la sostituisce', async () => {
  let o = await apri({ sistema: 'windows', versione: '99.0.0' });
  assert.strictEqual((await principale(o)).href, dl('99.0.0', 'x64-setup.exe'));
  assert.match(await o.p.textContent('#versione'), /^Ultima versione: 99\.0\.0, pubblicata il 20 novembre 2026\./);
  assert.strictEqual(await o.p.getAttribute('[data-file="mac-arm"] a', 'href'), dl('99.0.0', 'aarch64.dmg'));
  await o.ctx.close();
  // pagina con i dati di una versione non ancora pubblicata (da package.json, subito dopo il cambio di versione): vale GitHub
  o = await apri({ sistema: 'windows', pagina: (h) => h.replace(/("versione":")[\d.]+(","data":)[^,]*(,"pagina":"[^"]*","fonte":)"github"/, '$199.0.0$2null$3"package.json"') });
  assert.strictEqual((await principale(o)).testo, `Scarica per Windows versione ${VS} · 2,7 MB`);
  assert.strictEqual(await o.p.evaluate(() => document.documentElement.dataset.release), 'github');
  await o.ctx.close();
  // pagina con i dati di una versione già pubblicata (fonte GitHub, come la scrive pages.yml): una versione più vecchia su GitHub non la sostituisce.
  // Subito dopo il cambio di versione, prima della pubblicazione, nel repo la pagina ha fonte package.json: qui la si porta a «github».
  o = await apri({ sistema: 'windows', versione: '2.2.0', pagina: (h) => h.replace(/"fonte":"package\.json"/g, '"fonte":"github"') });
  assert.strictEqual((await principale(o)).href, STATICI.file.win.url);
  assert.strictEqual(await o.p.evaluate(() => document.documentElement.dataset.release), 'github');
  assert.strictEqual(await o.p.evaluate(() => document.querySelector('#nota-versione').hidden), true, 'nessun avviso «in arrivo» con la 3.x nella pagina');
  assert.deepStrictEqual(o.errori, []);
  await o.ctx.close();
});

test('sito: con JavaScript spento versione, link diretti, dimensioni e impronte ci sono lo stesso (italiano e inglese)', async () => {
  for (const lingua of ['it', 'en']) {
    const o = await apri({ sistema: 'windows', js: false, lingua });
    const r = await o.p.evaluate(() => ({
      v: document.querySelector('#versione').textContent, btn: document.querySelector('#scarica-principale a').innerText.replace(/\s+/g, ' ').trim(),
      file: [...document.querySelectorAll('[data-file]')].map((li) => ({ k: li.dataset.file, href: li.querySelector('a').href, info: li.querySelector('.file-info').textContent, sha: li.querySelector('.impronta code')?.textContent || null })),
      tema: !!document.querySelector('#tema').offsetParent || document.querySelector('#nota-versione').offsetHeight > 0, novita: document.querySelectorAll('#novita [data-versione]').length,
    }));
    assert.match(r.v, lingua === 'en' ? new RegExp(`^(Latest version|Version):? ${re(VS)}`) : new RegExp(`^(Ultima versione|Versione):? ${re(VS)}`));
    assert.strictEqual(r.btn, lingua === 'en' ? `Download the program version ${VS} · Windows, macOS, Linux` : `Scarica il programma versione ${VS} · Windows, macOS, Linux`);
    for (const f of r.file) {
      const s = STATICI.file[f.k];
      assert.strictEqual(f.href, s.url, f.k);
      assert.strictEqual(f.info, [s.nome, s.dimensione ? mb(s.dimensione, lingua) : ''].filter(Boolean).join(' · '), f.k);
      assert.strictEqual(f.sha, s.sha256, f.k);
    }
    assert.strictEqual(r.file.length, 5);
    assert.strictEqual(r.tema, false, 'senza JavaScript il pulsante del tema (che non funzionerebbe) e l\'avviso vuoto della versione non si vedono');
    assert.ok(r.novita >= 2, 'Novità visibili');
    await o.ctx.close();
  }
});

test('sito: ancore, Novità, tema scelto e ricordato, pagina inglese', async () => {
  let o = await apri({ sistema: 'windows', scuro: true });
  // ogni link #… porta a un elemento che esiste; «Le novità» porta alla sezione e le altre novità si aprono
  const rotte = await o.p.evaluate(() => [...document.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute('href')).filter((h) => h.length > 1 && !document.getElementById(decodeURIComponent(h.slice(1)))));
  assert.deepStrictEqual(rotte, []);
  await o.p.click('#versione a[href="#novita"]');
  await o.p.waitForFunction(() => location.hash === '#novita');
  const nov = await o.p.evaluate(() => ({ voci: [...document.querySelectorAll('#novita [data-versione]')].map((x) => x.dataset.versione), altre: !!document.querySelector('#novita details.altre-novita') }));
  assert.strictEqual(nov.voci[0], VS);
  if (nov.altre) { await o.p.click('#novita details.altre-novita summary'); assert.strictEqual(await o.p.evaluate(() => document.querySelector('#novita details.altre-novita').open), true); }
  await o.p.click('a[href="#d-impronta"]');
  assert.strictEqual(await o.p.evaluate(() => document.getElementById('d-impronta').open), true, 'il link alla risposta la apre');
  const sfondo = () => o.p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const scuro = await sfondo();
  await o.p.click('#tema');   // auto → chiaro
  assert.strictEqual(await o.p.evaluate(() => document.documentElement.dataset.tema), 'chiaro');
  assert.notStrictEqual(await sfondo(), scuro);
  await o.p.reload(); await o.p.waitForLoadState('domcontentloaded');
  assert.strictEqual(await o.p.evaluate(() => document.documentElement.dataset.tema), 'chiaro', 'ricordato dopo il ricaricamento');
  await o.p.click('#tema'); assert.strictEqual(await o.p.evaluate(() => document.documentElement.dataset.tema), 'scuro');
  await o.p.click('#tema'); assert.strictEqual(await o.p.evaluate(() => document.documentElement.dataset.tema), undefined);
  assert.deepStrictEqual(o.errori, []);
  await o.ctx.close();
  o = await apri({ sistema: 'windows', lingua: 'en' });
  const en = await o.p.evaluate(() => ({ btn: document.querySelector('#scarica-principale a.btn.primario').innerText.replace(/\s+/g, ' '), v: document.querySelector('#versione').textContent, lang: document.documentElement.lang, voce: document.querySelector('#novita [data-versione]')?.textContent || '' }));
  assert.strictEqual(en.btn, `Download for Windows version ${VS} · 2.7 MB`);
  assert.strictEqual(en.v, `Latest version: ${VS}, published on 20 November 2026. What's new`);
  assert.strictEqual(en.lang, 'en');
  assert.match(en.voce, /Published on/);
  assert.deepStrictEqual(o.errori, []);
  await o.ctx.close();
  o = await apri({ sistema: 'mac', lingua: 'en' });
  assert.strictEqual((await principale(o)).testo, `Download for Mac Apple chip · version ${VS} · 3.3 MB`);
  await o.ctx.close();
});

test('sito: accessibilità di base nel browser (nomi dei controlli, contrasto dei testi principali, focus visibile)', async () => {
  for (const scuro of [false, true]) {
    const o = await apri({ sistema: 'windows', scuro });
    const r = await o.p.evaluate(() => {
      const nome = (el) => (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').trim();
      const senzaNome = [...document.querySelectorAll('a[href], button')].filter((el) => el.offsetParent && !nome(el)).map((el) => el.outerHTML.slice(0, 80));
      // «rgb(…)», «rgba(…)» e «color(srgb r g b / a)» (color-mix), quest'ultimo in 0–1
      const rgb = (c) => { const n = (c.replace(/^color\(srgb/, '').match(/[\d.]+/g) || []).map(Number); return c.startsWith('color(srgb') ? n.map((v, i) => (i < 3 ? v * 255 : v)) : n; };
      const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const fondo = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length === 3 || (c.length === 4 && c[3] > 0.9)) return c.slice(0, 3); } return [255, 255, 255]; };
      const bassi = [];
      for (const el of document.querySelectorAll('p, li, a, summary, h1, h2, h3, small, .file-info, code, td, th')) {
        if (!el.offsetParent || !el.textContent.trim()) continue;
        const a = lum(rgb(getComputedStyle(el).color)), b = lum(fondo(el));
        const c = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        if (c < 4.5) bassi.push(`${el.tagName}.${el.className}: ${c.toFixed(2)} «${el.textContent.trim().slice(0, 30)}»`);
      }
      return { senzaNome, bassi: [...new Set(bassi)].slice(0, 10) };
    });
    assert.deepStrictEqual(r.senzaNome, [], 'link e pulsanti senza nome');
    assert.deepStrictEqual(r.bassi, [], `${scuro ? 'scuro' : 'chiaro'}: contrasto sotto 4,5:1`);
    await o.p.keyboard.press('Tab');
    const salta = await o.p.evaluate(() => ({ cls: document.activeElement.className, vis: getComputedStyle(document.activeElement).outlineStyle !== 'none' || getComputedStyle(document.activeElement).boxShadow !== 'none' || document.activeElement.getBoundingClientRect().top >= 0 }));
    assert.strictEqual(salta.cls, 'salta', 'il primo Tab porta a «Vai al contenuto»');
    await o.ctx.close();
  }
});

test('sito: screenshot desktop, tablet e telefono, chiaro e scuro, italiano e inglese, JavaScript spento (con SITO_SCREENSHOT)', { skip: !process.env.SITO_SCREENSHOT }, async () => {
  const dir = process.env.SITO_SCREENSHOT; fs.mkdirSync(dir, { recursive: true });
  const casi = [
    ['desktop-it-chiaro-windows', { sistema: 'windows' }], ['desktop-it-scuro-windows', { sistema: 'windows', scuro: true }],
    ['desktop-en-chiaro-mac', { sistema: 'mac', lingua: 'en' }], ['desktop-it-chiaro-mac-intel', { sistema: 'mac', ua: 'macChrome', arch: 'x86' }],
    ['desktop-it-chiaro-linux', { sistema: 'linux' }], ['desktop-it-github-giu', { sistema: 'windows', api: 'errore' }],
    ['desktop-it-senza-js', { sistema: 'windows', js: false }], ['desktop-en-senza-js', { sistema: 'windows', js: false, lingua: 'en' }],
    ['tablet-it-chiaro', { sistema: 'mobile', ua: 'tablet', ...TABLET }], ['tablet-en-scuro', { sistema: 'mobile', ua: 'tablet', lingua: 'en', scuro: true, ...TABLET }],
    ['telefono-it-chiaro', { sistema: 'mobile', ...TELEFONO }], ['telefono-it-scuro', { sistema: 'mobile', scuro: true, ...TELEFONO }],
    ['telefono-en-chiaro', { sistema: 'mobile', lingua: 'en', ...TELEFONO }],
  ];
  for (const [nome, opt] of casi) {
    const o = await apri({ viewport: { width: 1440, height: 900 }, ...opt });
    await o.p.evaluate(async () => { for (const i of document.images) i.loading = 'eager'; await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); });
    await o.p.screenshot({ path: path.join(dir, `${nome}-inizio.png`) });
    if (!/github-giu|mac-intel|linux/.test(nome)) await o.p.screenshot({ path: path.join(dir, `${nome}-intera.png`), fullPage: true });
    for (const sez of ['scarica', 'novita']) {
      await o.p.evaluate((id) => { document.documentElement.style.scrollBehavior = 'auto'; document.getElementById(id).scrollIntoView(); }, sez);
      await o.p.waitForTimeout(150);
      await o.p.screenshot({ path: path.join(dir, `${nome}-${sez}.png`) });
    }
    await o.ctx.close();
  }
});
