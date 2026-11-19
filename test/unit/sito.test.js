// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Sito di presentazione e download (scarica/): logica pura di scarica.js e controlli statici delle due pagine (italiano e inglese).
// Struttura uguale nelle due lingue, link interni e relativi validi, immagini presenti e leggere, nessuna risorsa esterna,
// nessuno stile o script in linea (la CSP li bloccherebbe), nomi di terzi solo dove servono (formati, esportazioni, istruzioni).
'use strict';
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), SITO = path.join(ROOT, 'scarica');
const PAGINE = { it: path.join(SITO, 'index.html'), en: path.join(SITO, 'en', 'index.html') };
const leggi = (p) => fs.readFileSync(p, 'utf8');
const mod = () => import(path.join(SITO, 'scarica.js'));

// ---- logica pura ----

const RELEASE = {
  tag_name: 'v3.0.0', draft: false, prerelease: false, published_at: '2026-11-20T10:00:00Z',
  html_url: 'https://github.com/lorebiri/acchiappaspettri/releases/tag/v3.0.0',
  assets: [
    ['Acchiappaspettri_3.0.0_x64-setup.exe', 2806549], ['Acchiappaspettri_3.0.0_x64-setup.exe.sig', 448],
    ['Acchiappaspettri_3.0.0_aarch64.dmg', 3488736], ['Acchiappaspettri_3.0.0_x64.dmg', 3710232],
    ['Acchiappaspettri_3.0.0_amd64.AppImage', 82340344], ['Acchiappaspettri_3.0.0_amd64.deb', 3835702],
    ['Acchiappaspettri_aarch64.app.tar.gz', 3393384], ['latest.json', 11744],
  ].map(([name, size], i) => ({ name, size, digest: 'sha256:' + String(i).repeat(64).slice(0, 64), browser_download_url: `https://github.com/lorebiri/acchiappaspettri/releases/download/v3.0.0/${name}` })),
};

test('sito: riconosce i pacchetti, le dimensioni e le impronte', async () => {
  const S = await mod();
  const r = S.leggiRelease(RELEASE);
  assert.strictEqual(r.versione, '3.0.0');
  assert.deepStrictEqual(Object.keys(r.file).sort(), ['linux-appimage', 'linux-deb', 'mac-arm', 'mac-intel', 'win']);
  assert.strictEqual(r.file.win.nome, 'Acchiappaspettri_3.0.0_x64-setup.exe');
  assert.strictEqual(r.file.win.dimensione, 2806549);
  assert.strictEqual(r.file.win.sha256, '0'.repeat(64));
  assert.strictEqual(r.file['mac-intel'].nome, 'Acchiappaspettri_3.0.0_x64.dmg', 'il .dmg Intel non si confonde con l\'installer di Windows');
  assert.strictEqual(S.classificaFile('Acchiappaspettri_3.0.0_x64-setup.exe.sig'), null);
  assert.strictEqual(S.classificaFile('latest.json'), null);
});

test('sito: scarta versioni di prova, bozze, indirizzi estranei e impronte non valide', async () => {
  const S = await mod();
  assert.strictEqual(S.leggiRelease({ ...RELEASE, prerelease: true }), null);
  assert.strictEqual(S.leggiRelease({ ...RELEASE, draft: true }), null);
  assert.strictEqual(S.leggiRelease({ ...RELEASE, tag_name: 'v3.0.0-rc.6' }), null);
  assert.strictEqual(S.leggiRelease(null), null);
  const ostile = { ...RELEASE, assets: [{ name: 'Acchiappaspettri_3.0.0_x64-setup.exe', size: 1, digest: 'sha256:xyz', browser_download_url: 'https://example.com/lorebiri/acchiappaspettri/releases/x.exe' },
    { name: 'Acchiappaspettri_3.0.0_x64.dmg', size: 1, digest: 'md5:00', browser_download_url: 'https://github.com/lorebiri/acchiappaspettri/releases/download/v3.0.0/Acchiappaspettri_3.0.0_x64.dmg' }] };
  const r = S.leggiRelease(ostile);
  assert.strictEqual(r.file.win, undefined, 'indirizzo non di GitHub scartato');
  assert.strictEqual(r.file['mac-intel'].sha256, null, 'impronta non SHA-256 ignorata');
  for (const u of ['http://github.com/lorebiri/acchiappaspettri/releases/x', 'https://github.com/altri/acchiappaspettri/releases/x', 'https://github.com.evil.example/lorebiri/acchiappaspettri/releases/x', 'https://user@github.com/lorebiri/acchiappaspettri/releases/x', 'javascript:alert(1)'])
    assert.strictEqual(S.urlDownloadSicuro(u), false, u);
  assert.strictEqual(S.leggiRelease({ ...RELEASE, html_url: 'https://example.com/' }).pagina, S.URL_RELEASES);
});

test('sito: sistema, pacchetto proposto, formati', async () => {
  const S = await mod();
  const ua = {
    windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    linux: 'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0',
    android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
  };
  assert.strictEqual(S.rilevaSistema({ userAgent: ua.windows }), 'windows');
  assert.strictEqual(S.rilevaSistema({ userAgent: ua.mac }), 'mac');
  assert.strictEqual(S.rilevaSistema({ userAgent: ua.mac, maxTouchPoints: 5 }), 'mobile', 'iPad');
  assert.strictEqual(S.rilevaSistema({ userAgent: ua.linux }), 'linux');
  assert.strictEqual(S.rilevaSistema({ userAgent: ua.android }), 'mobile');
  assert.strictEqual(S.rilevaSistema({ platform: 'Linux', userAgent: ua.android }), 'mobile');
  assert.strictEqual(S.rilevaSistema({ platform: 'macOS', userAgent: '' }), 'mac');
  assert.deepStrictEqual(S.scegliPrincipale('windows'), ['win']);
  assert.deepStrictEqual(S.scegliPrincipale('mac'), ['mac-arm', 'mac-intel']);
  assert.deepStrictEqual(S.scegliPrincipale('mac', 'x86'), ['mac-intel', 'mac-arm']);
  assert.deepStrictEqual(S.scegliPrincipale('mobile'), []);
  assert.strictEqual(S.formattaDimensione(3488736), '3,3 MB');
  assert.strictEqual(S.formattaDimensione(3488736, 'en'), '3.3 MB');
  assert.strictEqual(S.formattaData('2026-11-10T12:42:31Z'), '10 novembre 2026');
  assert.strictEqual(S.formattaData('2026-11-10T12:42:31Z', 'en'), '10 November 2026');
  assert.strictEqual(S.versionePrincipale('2.2.0'), 2);
});

// ---- controlli statici delle pagine ----

const attr = (html, tag, a) => [...html.matchAll(new RegExp(`<${tag}\\b[^>]*\\s${a}="([^"]*)"`, 'gi'))].map((m) => m[1]);
const ids = (html) => [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const testo = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ');

test('sito: le due lingue hanno la stessa struttura e le stesse immagini', () => {
  const it = leggi(PAGINE.it), en = leggi(PAGINE.en);
  assert.match(it, /<html lang="it">/); assert.match(en, /<html lang="en">/);
  assert.deepStrictEqual(ids(en), ids(it), 'stessi id nello stesso ordine (i link #… valgono in entrambe)');
  assert.deepStrictEqual(attr(en, 'li', 'data-file'), attr(it, 'li', 'data-file'));
  const img = (h, pre) => attr(h, 'img', 'src').filter((s) => s.includes('img/')).map((s) => s.replace(pre, '')).sort();
  const ii = img(it, /^img\//), ie = img(en, /^\.\.\/img\//);
  assert.ok(ii.length >= 18, 'schermate in ogni sezione delle funzioni');
  assert.deepStrictEqual(ie.filter((s) => s !== 'online-en.webp'), ii.filter((s) => s !== 'online.webp'));
  for (const sezione of ['scegli', 'tecniche', 'come', 'funzioni', 'affidabilita', 'scarica', 'domande', 'contatti', 'privacy'])
    assert.ok(ids(it).includes(sezione), `sezione #${sezione}`);
  for (const f of ['f-picchi', 'f-fondo', 'f-qualita', 'f-deconvoluzione', 'f-tarature', 'f-riferimenti', 'f-statistica', 'f-xrf', 'f-adsorbimento', 'f-esportazioni', 'f-progetti'])
    assert.ok(ids(it).includes(f), `funzione #${f}`);
});

for (const [lingua, file] of Object.entries(PAGINE)) {
  test(`sito (${lingua}): link, risorse, accessibilità`, () => {
    const html = leggi(file), dir = path.dirname(file);
    const tuttiId = new Set(ids(html));
    // link interni
    for (const h of attr(html, 'a', 'href').filter((h) => h.startsWith('#'))) assert.ok(tuttiId.has(h.slice(1)), `${lingua}: ancora ${h} inesistente`);
    // link e risorse relative: il file deve esistere (le cartelle valgono per il loro index.html)
    const relativi = [...attr(html, 'a', 'href'), ...attr(html, 'img', 'src'), ...attr(html, 'script', 'src'), ...attr(html, 'link', 'href')]
      .filter((h) => !/^(#|https?:|mailto:)/.test(h));
    for (const h of relativi) {
      let p = path.resolve(dir, h.split('#')[0]);
      if (h.endsWith('/') || (fs.existsSync(p) && fs.statSync(p).isDirectory())) p = path.join(p, 'index.html');
      assert.ok(fs.existsSync(p), `${lingua}: ${h} non esiste (${path.relative(ROOT, p)})`);
    }
    // «Usa online» porta all'app, che resta all'indirizzo di sempre
    const online = path.resolve(dir, lingua === 'it' ? '../' : '../../', 'index.html');
    assert.strictEqual(online, path.join(ROOT, 'index.html'));
    assert.ok(attr(html, 'a', 'href').includes(lingua === 'it' ? '../' : '../../'));
    // link esterni: solo il progetto su GitHub, la sua pagina, la posta e il sito dell'autore (piè di pagina)
    for (const h of [...attr(html, 'a', 'href'), ...attr(html, 'link', 'href')].filter((h) => /^https?:/.test(h)))
      assert.match(h, /^https:\/\/(github\.com\/lorebiri\/acchiappaspettri([/#].*)?|lorebiri\.github\.io\/acchiappaspettri\/scarica\/(en\/)?|lorebiri\.github\.io\/)$/, `${lingua}: link esterno inatteso ${h}`);
    assert.ok(attr(html, 'a', 'href').includes('https://lorebiri.github.io/'), `${lingua}: manca il link al sito dell'autore`);
    // nessuna risorsa esterna: immagini, script, fogli di stile e caratteri dal sito stesso
    for (const s of [...attr(html, 'img', 'src'), ...attr(html, 'script', 'src'), ...attr(html, 'link', 'href').filter((_, i, a) => true)])
      if (!/^https:\/\/lorebiri\.github\.io\/acchiappaspettri\/scarica\//.test(s)) assert.doesNotMatch(s, /^(https?:)?\/\//, `${lingua}: risorsa esterna ${s}`);
    assert.doesNotMatch(html, /@import|fonts\.googleapis|cdn\.|unpkg|jsdelivr/i);
    // CSP: niente stili, script o gestori in linea
    assert.match(html, /http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src https:\/\/api\.github\.com;/);
    assert.doesNotMatch(html, /\sstyle="/, `${lingua}: attributo style in linea`);
    assert.doesNotMatch(html, /\son[a-z]+="/, `${lingua}: gestore di evento in linea`);
    // script in linea: solo i blocchi di dati (JSON-LD e dati della versione), che non si eseguono
    assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)(?![^>]*\stype="application\/(ld\+)?json")[^>]*>/, `${lingua}: script in linea`);
    assert.doesNotMatch(html, /<style/, `${lingua}: <style> in linea`);
    // accessibilità di base
    assert.strictEqual((html.match(/<h1\b/g) || []).length, 1);
    const livelli = [...html.matchAll(/<h([1-6])\b/g)].map((m) => +m[1]);
    livelli.forEach((l, i) => { if (i) assert.ok(l <= livelli[i - 1] + 1, `${lingua}: titolo h${l} dopo h${livelli[i - 1]}`); });
    for (const m of html.matchAll(/<img\b[^>]*>/g)) {
      assert.match(m[0], /\salt="/, `${lingua}: immagine senza alt: ${m[0]}`);
      if (m[0].includes('img/')) { assert.match(m[0], /\swidth="\d+" height="\d+"/, `${lingua}: immagine senza dimensioni`); }
    }
    assert.match(html, /class="salta" href="#contenuto"/);
    assert.match(html, /<meta name="viewport"/);
    assert.match(html, /hreflang="(it|en)"/);
    // anche senza JavaScript ogni pacchetto ha il suo link: diretto al file (dati scritti dalla pubblicazione) o alla pagina delle versioni
    for (const k of ['win', 'mac-arm', 'mac-intel', 'linux-appimage', 'linux-deb'])
      assert.match(html, new RegExp(`<li data-file="${k}"[^>]*><a href="https:\\/\\/github\\.com\\/lorebiri\\/acchiappaspettri\\/releases\\/(latest|download\\/v[\\d.]+\\/Acchiappaspettri_[^"]+)">`), `${lingua}: link di ${k}`);
  });

  test(`sito (${lingua}): nessun confronto con prodotti di terzi, marchi solo dove servono`, () => {
    const html = leggi(file);
    // programmi di analisi di terzi: mai nominati (i confronti, se ci sono, sono generici)
    const CONCORRENTI = /\b(OriginPro|OriginLab|Spectragryph|KnowItAll|Essential FTIR|SpectraGryph|Fityk|PeakFit|OMNIC Specta|LabSolutions|Empower|OpenChrom|Igor Pro|MATLAB|Unscrambler|SIMCA|PyMca|ASAP 2020|MicroActive|GRAMS|Spectrum IR|CrystalSleuth|Profex|Topas|HighScore|Mnova|MestReNova|TopSpin)\b/;
    assert.doesNotMatch(testo(html), CONCORRENTI, `${lingua}: nome di un programma di terzi`);
    // marchi di strumenti, formati e sistemi: solo nei blocchi data-marchi (formati, esportazioni, download e avvisi)
    const MARCHI = /\b(Thermo|Bruker|Agilent|Waters|Shimadzu|PerkinElmer|Anton Paar|JASCO|Amptek|ORTEC|LIDAQ|Kaomi|ASiQwin|Origin|Excel|Edge|Chrome|SmartScreen|Avast|AVG|Microsoft)\b/;
    // tolgo i blocchi marcati (div o article con data-marchi, chiusi dal primo </div> di pari livello: si conta l'annidamento)
    let resto = html;
    for (;;) {
      const i = resto.search(/<div\b[^>]*\sdata-marchi="/);
      if (i < 0) break;
      let j = i, prof = 0;
      const re = /<(\/?)div\b[^>]*>/g; re.lastIndex = i;
      for (let m; (m = re.exec(resto));) { prof += m[1] ? -1 : 1; if (!prof) { j = re.lastIndex; break; } }
      assert.ok(j > i, 'blocco data-marchi chiuso');
      resto = resto.slice(0, i) + resto.slice(j);
    }
    const fuori = testo(resto).match(MARCHI);
    assert.strictEqual(fuori, null, `${lingua}: «${fuori && fuori[0]}» fuori dai blocchi dei formati, delle esportazioni e del download`);
  });
}

test('sito: immagini webp leggere, file del sito presenti', () => {
  const dir = path.join(SITO, 'img');
  const usate = new Set(attr(leggi(PAGINE.it), 'img', 'src').concat(attr(leggi(PAGINE.en), 'img', 'src')).filter((s) => s.includes('img/')).map((s) => path.basename(s)));
  let totale = 0;
  for (const n of usate) {
    const p = path.join(dir, n);
    assert.ok(fs.existsSync(p), `immagine ${n}`);
    assert.match(n, /\.webp$/);
    const b = fs.readFileSync(p); totale += b.length;
    assert.strictEqual(b.subarray(0, 4).toString(), 'RIFF'); assert.strictEqual(b.subarray(8, 12).toString(), 'WEBP');
    assert.ok(b.length <= 200 * 1024, `${n}: ${Math.round(b.length / 1024)} kB, oltre 200 kB`);
  }
  for (const n of fs.readdirSync(dir)) assert.ok(usate.has(n), `immagine non usata: ${n}`);
  assert.ok(totale <= 3.5 * 1024 * 1024, `immagini in tutto ${Math.round(totale / 1024)} kB`);
  for (const f of ['stile.css', 'avvio.js', 'scarica.js', 'tema.js', 'icona.svg']) assert.ok(fs.existsSync(path.join(SITO, f)), f);
  assert.doesNotMatch(leggi(path.join(SITO, 'stile.css')), /url\(\s*['"]?https?:|@import/);
  // l'unico indirizzo esterno usato dagli script è l'API delle versioni di GitHub
  for (const f of ['avvio.js', 'scarica.js', 'tema.js']) {
    const urls = (leggi(path.join(SITO, f)).match(/https?:\/\/[^\s'"`)]+/g) || []).filter((u) => !/^https:\/\/(api\.)?github\.com\//.test(u));
    assert.deepStrictEqual(urls, [], f);
  }
});

test('sito: i documenti citati esistono nel repository', () => {
  for (const html of Object.values(PAGINE).map(leggi))
    for (const h of attr(html, 'a', 'href')) {
      const m = /^https:\/\/github\.com\/lorebiri\/acchiappaspettri\/blob\/main\/([^#]+)/.exec(h);
      if (m) assert.ok(fs.existsSync(path.join(ROOT, m[1])), `${m[1]} non esiste`);
    }
});

test('sito: l\'app porta al sito (Informazioni, menu Aiuto del desktop) senza cambiare l\'indirizzo dell\'app', () => {
  const app = leggi(path.join(ROOT, 'index.html'));
  assert.match(app, /<a href="https:\/\/lorebiri\.github\.io\/acchiappaspettri\/scarica\/"[^>]*>Sito del programma<\/a>/);
  assert.match(leggi(path.join(ROOT, 'app', 'desktop.js')), /item\('Sito di Acchiappaspettri',\(\)=>T\.opener\.openUrl\(PAGE\+'scarica\/'\)/);
  assert.match(leggi(path.join(ROOT, 'app', 'desktop.js')), /const PAGE='https:\/\/lorebiri\.github\.io\/acchiappaspettri\/'/);
  const en = JSON.parse(leggi(path.join(ROOT, 'i18n', 'en-app.json')));
  assert.strictEqual(en['Sito del programma'], 'Program website');
  assert.strictEqual(en['Sito di Acchiappaspettri'], 'Acchiappaspettri website');
  // il permesso del desktop per aprire indirizzi copre il sito
  assert.match(leggi(path.join(ROOT, 'src-tauri', 'capabilities', 'default.json')), /"url": "https:\/\/lorebiri\.github\.io\/acchiappaspettri\/\*"/);
});
