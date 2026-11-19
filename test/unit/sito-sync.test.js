// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Sito di presentazione sempre allineato alla versione: dati statici in scarica/index.html e scarica/en/index.html
// (versione, data, link diretti, dimensioni, impronte, JSON-LD), Novità dal CHANGELOG, sitemap, workflow di pubblicazione.
// Se un test qui fallisce dopo un cambio di versione o del CHANGELOG: esegui «npm run sito» e fai il commit di scarica/.
'use strict';
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const leggi = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const PKG0 = JSON.parse(leggi('package.json'));
// versione mostrata dal sito: quella di package.json, o l'ultima stabile del CHANGELOG se package.json ha una versione di prova (rc);
// una sezione «## X.Y.Z — in preparazione» (le novità che una rc rimanda alla stabile) non è ancora pubblicata e si salta
const VS = /-/.test(PKG0.version) ? [...leggi('CHANGELOG.md').matchAll(/^## (\d+\.\d+\.\d+)(?![-\w.])(?![^\n]*(?:in preparazione|in preparation))/gim)].map((m) => m[1])[0] : PKG0.version;
const PKG = { ...PKG0, version: VS };
const PAGINE = { it: 'scarica/index.html', en: 'scarica/en/index.html' };
const AIUTO = 'esegui «npm run sito» e fai il commit di scarica/';
const S = () => import(path.join(ROOT, 'scarica', 'scarica.js'));
const A = () => import(path.join(ROOT, 'scripts', 'sito-aggiorna.mjs'));
const V = () => import(path.join(ROOT, 'scripts', 'sito-verifica.mjs'));

const VF = '9.8.7';
const dl = (n) => `https://github.com/lorebiri/acchiappaspettri/releases/download/v${VF}/${n}`;
async function releaseFinta(extra = {}) {
  const { CATALOGO, nomeFile } = await S();
  const nomi = [...CATALOGO.map((v) => nomeFile(v.chiave, VF)), `Acchiappaspettri_${VF}_x64-setup.exe.sig`, 'latest.json'];
  return {
    tag_name: `v${VF}`, published_at: '2027-01-15T10:00:00Z', html_url: `https://github.com/lorebiri/acchiappaspettri/releases/tag/v${VF}`, draft: false, prerelease: false,
    assets: nomi.map((name, i) => ({ name, size: 100000000 + i, digest: `sha256:${String(i).repeat(64)}`, browser_download_url: dl(name) })),
    ...extra,
  };
}

// ---- la versione scritta nelle pagine ----

for (const [lingua, file] of Object.entries(PAGINE)) {
  test(`sito-sync (${lingua}): la versione nella pagina coincide con package.json`, async () => {
    const { datiNellaPagina } = await A();
    const { leggiDatiStatici } = await S();
    const dati = datiNellaPagina(leggi(file));
    assert.ok(dati, `dati-versione mancanti in ${file}: ${AIUTO}`);
    assert.strictEqual(dati.versione, PKG.version, `${file} dice ${dati.versione}, package.json ${PKG.version}: ${AIUTO}`);
    const letti = leggiDatiStatici(dati);
    assert.ok(letti, 'dati della pagina validi');
    assert.deepStrictEqual(Object.keys(letti.file).sort(), Object.keys(dati.file).sort(), 'nessun file scartato dai controlli');
  });

  test(`sito-sync (${lingua}): i blocchi generati sono allineati a dati e CHANGELOG (nessuna modifica a mano)`, async () => {
    const { applica, datiNellaPagina, leggiChangelogRepo, sitemap } = await A();
    const html = leggi(file);
    const dati = datiNellaPagina(html);
    assert.ok(applica(html, dati, lingua, leggiChangelogRepo(ROOT)) === html, `${file}: blocchi sync non allineati: ${AIUTO}`);
    assert.strictEqual(leggi('scarica/sitemap.xml'), sitemap(dati), `sitemap non allineata: ${AIUTO}`);
  });

  test(`sito-sync (${lingua}): versione, file e impronte visibili anche senza JavaScript`, async () => {
    const { datiNellaPagina, testoVersione } = await A();
    const { CATALOGO, nomeFile, URL_RELEASES, formattaDimensione } = await S();
    const html = leggi(file);
    const dati = datiNellaPagina(html);
    assert.ok(html.includes(`<span id="versione">${testoVersione(dati, lingua)} <a href="#novita">`));
    const principale = html.slice(html.indexOf('<!-- sync:principale'), html.indexOf('<!-- /sync:principale'));
    assert.match(principale, new RegExp(`(versione|version) ${PKG.version.replace(/\./g, '\\.')} ·`));
    for (const v of CATALOGO) {
      const li = new RegExp(`<li data-file="${v.chiave}"[^>]*>([\\s\\S]*?)</li>`).exec(html);
      assert.ok(li, v.chiave);
      assert.ok(li[1].includes(nomeFile(v.chiave, PKG.version)), `${v.chiave}: nome del file`);
      const href = /href="([^"]+)"/.exec(li[1])[1];
      assert.ok(href === URL_RELEASES || href === `https://github.com/lorebiri/acchiappaspettri/releases/download/v${PKG.version}/${nomeFile(v.chiave, PKG.version)}`, href);
      if (dati.fonte === 'github') {
        assert.ok(href.includes('/releases/download/'), `${v.chiave}: link diretto`);
        assert.ok(dati.file[v.chiave].dimensione > 1e6, `${v.chiave}: dimensione`);
        assert.match(dati.file[v.chiave].sha256, /^[0-9a-f]{64}$/, `${v.chiave}: impronta`);
        assert.ok(li[1].includes(`<code>${dati.file[v.chiave].sha256}</code>`), `${v.chiave}: impronta nella pagina`);
        assert.ok(li[1].includes(formattaDimensione(dati.file[v.chiave].dimensione, lingua)), `${v.chiave}: dimensione nella pagina`);
      }
    }
    if (dati.fonte === 'github') assert.match(dati.data, /^\d{4}-\d\d-\d\dT/);
  });

  test(`sito-sync (${lingua}): SEO con versione e data (JSON-LD, Open Graph, hreflang, sitemap)`, async () => {
    const { datiNellaPagina, giorno, URL_SITO, URL_SITO_LINGUA } = await A();
    const html = leggi(file);
    const dati = datiNellaPagina(html);
    const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);
    assert.strictEqual(ld['@type'], 'SoftwareApplication');
    assert.strictEqual(ld.softwareVersion, PKG.version);
    if (dati.data) assert.strictEqual(ld.datePublished, giorno(dati.data));
    assert.deepStrictEqual(ld.offers, { '@type': 'Offer', price: '0', priceCurrency: 'EUR' });
    assert.match(ld.operatingSystem, /Windows.*macOS.*Linux/);
    assert.strictEqual(ld.url, URL_SITO_LINGUA[lingua]);
    const titolo = /<title>([^<]+)<\/title>/.exec(html)[1];
    assert.ok(titolo.length >= 30 && titolo.length <= 70, `titolo di ${titolo.length} caratteri`);
    const desc = /<meta name="description" content="([^"]+)"/.exec(html)[1];
    assert.ok(desc.length >= 100 && desc.length <= 180, `description di ${desc.length} caratteri`);
    assert.ok(html.includes(`<link rel="canonical" href="${URL_SITO_LINGUA[lingua]}">`));
    for (const [l, u] of [['it', URL_SITO], ['en', `${URL_SITO}en/`], ['x-default', URL_SITO]]) assert.ok(html.includes(`<link rel="alternate" hreflang="${l}" href="${u}">`), `hreflang ${l}`);
    for (const p of ['og:title', 'og:description', 'og:url', 'og:image', 'og:image:width', 'og:image:height', 'og:image:alt', 'og:type', 'og:locale', 'og:site_name']) assert.ok(html.includes(`property="${p}"`), p);
    const img = /property="og:image" content="([^"]+)"/.exec(html)[1];
    assert.ok(img.startsWith(URL_SITO));
    const f = path.join(ROOT, 'scarica', img.slice(URL_SITO.length));
    assert.ok(fs.existsSync(f), `immagine di anteprima ${img}`);
    assert.ok(fs.statSync(f).size < 300 * 1024, 'anteprima sotto i 300 kB');
    const sm = leggi('scarica/sitemap.xml');
    assert.ok(sm.includes(`<loc>${URL_SITO_LINGUA[lingua]}</loc>`));
    if (dati.data) assert.ok(sm.includes(`<lastmod>${giorno(dati.data)}</lastmod>`));
  });
}

// ---- Novità ----

test('sito-sync: Novità dal CHANGELOG, ultime versioni pubblicate senza rc né «In preparazione»', async () => {
  const { leggiChangelogRepo, ultimeNovita, datiNellaPagina, N_NOVITA } = await A();
  const cl = leggiChangelogRepo(ROOT);
  const versioni = cl.it.map((s) => s.versione);
  assert.ok(versioni.includes(PKG.version), `manca in CHANGELOG.md la sezione «## ${PKG.version}»`);
  for (const [lingua, file] of Object.entries(PAGINE)) {
    const html = leggi(file);
    const dati = datiNellaPagina(html);
    const sezione = html.slice(html.indexOf('<section id="novita"'), html.indexOf('</section>', html.indexOf('<section id="novita"')));
    const voci = [...sezione.matchAll(/data-versione="([^"]+)"/g)].map((m) => m[1]);
    assert.deepStrictEqual(voci, ultimeNovita(cl.it, dati.versione).map((s) => s.versione), lingua);
    assert.ok(voci.length >= 2 && voci.length <= N_NOVITA, `${lingua}: ${voci.length} versioni`);
    assert.strictEqual(voci[0], dati.versione, `${lingua}: la versione mostrata è in cima alle Novità`);
    assert.doesNotMatch(voci.join(' '), /-/, 'niente versioni di prova');
    assert.doesNotMatch(sezione, /In preparazione|In preparation/i);
    // il testo viene davvero dal CHANGELOG della lingua (o, se manca la traduzione, dall'italiano con lang="it")
    for (const v of voci) {
      const sez = cl[lingua].find((s) => s.versione === v) || cl.it.find((s) => s.versione === v);
      const primo = sez.punti[0].t.split(':').pop().trim().slice(0, 40).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      assert.ok(sezione.includes(primo), `${lingua} ${v}: primo punto «${primo}»`);
    }
    assert.ok(html.includes('<a href="#novita">'), `${lingua}: link alle Novità`);
  }
  // la versione inglese esiste per la versione in cima
  assert.ok(cl.en.some((s) => s.versione === PKG.version), `manca in CHANGELOG.en.md la sezione «## ${PKG.version}»`);
});

test('sito-sync: lettura del CHANGELOG (rc, «In preparazione», punti annidati, markdown sicuro)', async () => {
  const { leggiChangelog, ultimeNovita, inLinea } = await A();
  const md = '# Novità\n\n## In preparazione\n\n- futuro\n\n## 3.1.0 — in preparazione\n\n- non ancora\n\n## 3.0.1 — 2 dicembre 2026\n\nCorrezioni.\n\n- Uno: `a<b>` e **forte**\n  continua\n- Due\n  - sotto A\n  - sotto B\n\n## 3.0.1-rc.1\n\n- prova\n\n## 3.0.0\n\n- tre\n\n## 2.2.0\n\n- due\n';
  const s = leggiChangelog(md);
  assert.deepStrictEqual(s.map((x) => x.versione), ['3.0.1', '3.0.0', '2.2.0']);
  assert.strictEqual(s[0].data, '2 dicembre 2026');
  assert.deepStrictEqual(s[0].testo, ['Correzioni.']);
  assert.deepStrictEqual(s[0].punti, [{ t: 'Uno: `a<b>` e **forte** continua', sotto: [] }, { t: 'Due', sotto: ['sotto A', 'sotto B'] }]);
  assert.deepStrictEqual(ultimeNovita(s, '3.0.0').map((x) => x.versione), ['3.0.0', '2.2.0']);
  assert.deepStrictEqual(ultimeNovita(s, '3.0.1', 2).map((x) => x.versione), ['3.0.1', '3.0.0']);
  assert.strictEqual(inLinea(s[0].punti[0].t, true), '<strong>Uno</strong>: <code>a&lt;b&gt;</code> e <strong>forte</strong> continua');
  assert.strictEqual(inLinea('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
});

// ---- scripts/sito-aggiorna.mjs ----

test('sito-sync: dati da una release di GitHub (link diretti, dimensioni, impronte, date) e da package.json', async () => {
  const { datiDaRelease, datiDaPackage } = await A();
  const { CATALOGO, nomeFile, URL_RELEASES, leggiDatiStatici } = await S();
  const d = datiDaRelease(await releaseFinta(), [{ ...await releaseFinta(), tag_name: 'v9.8.6', published_at: '2026-12-01T09:00:00Z' }, { ...await releaseFinta(), tag_name: 'v9.8.7-rc.1', prerelease: true }]);
  assert.strictEqual(d.versione, VF); assert.strictEqual(d.fonte, 'github'); assert.strictEqual(d.data, '2027-01-15T10:00:00Z');
  assert.deepStrictEqual(d.file.win, { nome: `Acchiappaspettri_${VF}_x64-setup.exe`, url: dl(`Acchiappaspettri_${VF}_x64-setup.exe`), dimensione: 100000000, sha256: '0'.repeat(64) });
  assert.deepStrictEqual(d.date, { [VF]: '2027-01-15T10:00:00Z', '9.8.6': '2026-12-01T09:00:00Z' });
  assert.strictEqual(datiDaRelease({ ...await releaseFinta(), draft: true }), null);
  assert.strictEqual(datiDaRelease({ ...await releaseFinta(), prerelease: true }), null);
  assert.strictEqual(datiDaRelease({ message: 'API rate limit exceeded' }), null);
  const p = datiDaPackage('1.0.0', { date: { '0.9.0': '2026-10-01T00:00:00Z' } });
  assert.strictEqual(p.fonte, 'package.json'); assert.strictEqual(p.data, null);
  for (const v of CATALOGO) assert.deepStrictEqual(p.file[v.chiave], { nome: nomeFile(v.chiave, '1.0.0'), url: URL_RELEASES, dimensione: null, sha256: null });
  assert.ok(leggiDatiStatici(p));
});

test('sito-sync: applica scrive versione, file, impronte, JSON-LD e Novità nelle due lingue; è idempotente e sicuro', async () => {
  const { applica, datiDaRelease, datiNellaPagina } = await A();
  const d = datiDaRelease(await releaseFinta());
  const changelog = {
    it: [{ versione: '10.0.0', data: null, testo: [], punti: [{ t: 'Futura: non ancora pubblicata', sotto: [] }] }, { versione: VF, data: null, testo: ['Intro <b>&</b>'], punti: [{ t: 'Prova: uno «due» `x`', sotto: [] }] }, { versione: '9.8.6', data: '1 dicembre 2026', testo: [], punti: [{ t: 'Vecchia', sotto: [] }] }],
    en: [{ versione: VF, data: null, testo: [], punti: [{ t: 'Test: one', sotto: [] }] }],
  };
  for (const lingua of ['it', 'en']) {
    const html = leggi(PAGINE[lingua]);
    const out = applica(html, d, lingua, changelog);
    assert.strictEqual(applica(out, d, lingua, changelog), out, 'idempotente');
    assert.ok(out.includes(lingua === 'it' ? `Ultima versione: ${VF}, pubblicata il 15 gennaio 2027.` : `Latest version: ${VF}, published on 15 January 2027.`));
    assert.ok(out.includes(`href="${dl(`Acchiappaspettri_${VF}_aarch64.dmg`)}"`));
    assert.ok(out.includes(lingua === 'it' ? '95,4 MB' : '95.4 MB'));
    assert.ok(out.includes(`<code>${'2'.repeat(64)}</code>`));
    assert.ok(out.includes(`"softwareVersion":"${VF}"`)); assert.ok(out.includes('"datePublished":"2027-01-15"'));
    assert.ok(!out.includes('Futura'), 'Novità fino alla versione pubblicata');
    assert.ok(out.includes(`data-versione="${VF}"`) && out.includes('data-versione="9.8.6"'));
    if (lingua === 'it') {
      assert.ok(out.includes('Intro &lt;b&gt;&amp;&lt;/b&gt;'));
      assert.ok(out.includes('<strong>Prova</strong>: uno «due» <code>x</code>'));
    } else {
      assert.ok(out.includes('<strong>Test</strong>: one'));
      assert.match(out, /<ul class="punti" lang="it">\s*<li>Vecchia<\/li>/, 'versione non tradotta: testo italiano con lang="it"');
    }
    assert.deepStrictEqual(datiNellaPagina(out), d);
    assert.doesNotMatch(out, /<\/script>[^\n]*<\/script>/, 'il JSON non chiude il blocco <script>');
  }
});

test('sito-sync: un file che manca nella release è segnato come assente; senza segnaposto lo script si ferma', async () => {
  const { applica, datiDaRelease, sostituisciBlocco, leggiChangelogRepo } = await A();
  const r = await releaseFinta();
  r.assets = r.assets.filter((a) => !a.name.endsWith('.deb'));
  const out = applica(leggi(PAGINE.it), datiDaRelease(r), 'it', leggiChangelogRepo(ROOT));
  assert.match(out, /<li data-file="linux-deb" class="assente"><a href="https:\/\/github\.com\/lorebiri\/acchiappaspettri\/releases\/latest">/);
  assert.throws(() => sostituisciBlocco('<html></html>', 'elenco', 'x'), /sync:elenco/);
});

test('sito-sync: scarica.js legge i dati statici scartando indirizzi estranei, impronte e date non valide', async () => {
  const { leggiDatiStatici, confrontaVersioni, nomeFile, classificaFile, CATALOGO, URL_RELEASES } = await S();
  const { datiDaRelease } = await A();
  const d = datiDaRelease(await releaseFinta());
  d.file.win.url = 'https://evil.example/Acchiappaspettri.exe';
  d.file['mac-intel'].sha256 = 'zz';
  d.file['linux-deb'].nome = 'altro.deb';
  d.date['1.0.0'] = 'boh';
  d.pagina = 'javascript:alert(1)';
  const l = leggiDatiStatici(d);
  assert.strictEqual(l.file.win, undefined);
  assert.strictEqual(l.file['linux-deb'], undefined);
  assert.strictEqual(l.file['mac-intel'].sha256, null);
  assert.strictEqual(l.file['mac-arm'].url, dl(`Acchiappaspettri_${VF}_aarch64.dmg`));
  assert.strictEqual(l.date['1.0.0'], undefined);
  assert.strictEqual(l.pagina, URL_RELEASES);
  assert.strictEqual(leggiDatiStatici(null), null);
  assert.strictEqual(leggiDatiStatici({ versione: '3.0.0-rc.1' }), null);
  for (const v of CATALOGO) assert.strictEqual(classificaFile(nomeFile(v.chiave, '3.0.0')), v.chiave);
  assert.strictEqual(nomeFile('boh', '3.0.0'), null);
  assert.ok(confrontaVersioni('3.10.0', '3.9.9') > 0);
  assert.strictEqual(confrontaVersioni('3.0.0', '3.0.0'), 0);
  assert.ok(confrontaVersioni('2.2.0', '3.0.0') < 0);
});

// ---- l'ultima release pubblicata su GitHub (rete; si salta se GitHub non risponde) ----

test('sito-sync: la versione del sito coincide con l\'ultima release pubblicata (o la precede solo prima della pubblicazione)', async (t) => {
  const { datiNellaPagina } = await A();
  const { leggiRelease, confrontaVersioni } = await S();
  let json = null;
  try {
    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'acchiappaspettri-test' };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const r = await fetch('https://api.github.com/repos/lorebiri/acchiappaspettri/releases/latest', { headers, signal: AbortSignal.timeout(10000) });
    if (r.ok) json = await r.json();
    else t.diagnostic(`GitHub ha risposto ${r.status}`);
  } catch (e) { t.diagnostic(`GitHub non raggiungibile: ${e.message}`); }
  const ultima = leggiRelease(json);
  if (!ultima) { t.skip('ultima release non disponibile (rete, limite di richieste)'); return; }
  const dati = datiNellaPagina(leggi(PAGINE.it));
  const c = confrontaVersioni(dati.versione, ultima.versione);
  assert.ok(c >= 0, `il sito dice ${dati.versione} ma su GitHub c'è già la ${ultima.versione}: aggiorna package.json o ${AIUTO}`);
  if (c > 0) { t.diagnostic(`package.json ${PKG.version} non ancora pubblicata (ultima: ${ultima.versione}): normale prima del tag`); return; }
  // stessa versione: se i dati vengono da GitHub, nomi, link e dimensioni devono essere quelli della release
  if (dati.fonte !== 'github') { t.diagnostic(`dati da package.json: dopo la pubblicazione ${AIUTO} per scrivere data, dimensioni e impronte`); return; }
  for (const [k, f] of Object.entries(ultima.file)) {
    assert.strictEqual(dati.file[k]?.url, f.url, k);
    assert.strictEqual(dati.file[k]?.dimensione, f.dimensione, `${k}: dimensione cambiata su GitHub, ${AIUTO}`);
    if (f.sha256) assert.strictEqual(dati.file[k]?.sha256, f.sha256, `${k}: impronta cambiata su GitHub, ${AIUTO}`);
  }
});

// ---- pubblicazione ----

test('sito-sync: pages.yml pubblica app e sito, alla release, ai push su main, ogni giorno e a mano; release.yml lo lancia', () => {
  const y = leggi('.github/workflows/pages.yml');
  assert.match(y, /push:\s*\n\s*branches: \[main\]/);
  assert.doesNotMatch(y.slice(0, y.indexOf('jobs:')), /paths:/, 'ogni push su main va pubblicato: con Pages da Actions anche l\'app esce da qui');
  assert.match(y, /release:\s*\n\s*types: \[published\]/);
  assert.match(y, /schedule:/); assert.match(y, /workflow_dispatch:/);
  assert.match(y, /gh workflow run pages\.yml[^\n]*--ref/);
  assert.ok(y.includes('node scripts/sito-aggiorna.mjs --pubblicata'));
  assert.match(y, /actions\/jekyll-build-pages@[0-9a-f]{40}[^\n]*\n\s*with: \{ source: \.\/, destination: \.\/_site \}/, 'costruisce l\'intero ramo come la pubblicazione dal ramo');
  assert.ok(y.includes('node scripts/sito-verifica.mjs _site --versione'), 'controlla l\'artefatto prima del deploy');
  assert.ok(y.includes('node scripts/sito-verifica.mjs https://lorebiri.github.io/acchiappaspettri/ --versione'), 'controlla online dopo il deploy');
  assert.match(y, /build_type/, 'con «Deploy from a branch» non pubblica');
  assert.match(y, /if: needs\.costruisci\.outputs\.pubblica == 'si'/);
  assert.ok(y.indexOf('sito-aggiorna.mjs --pubblicata') < y.indexOf('jekyll-build-pages'), 'i dati si scrivono prima della costruzione');
  for (const u of y.match(/uses: [^\s]+/g)) assert.match(u, /@[0-9a-f]{40}$/, `${u}: azione fissata a un commit`);
  const r = leggi('.github/workflows/release.yml');
  assert.match(r, /gh workflow run pages\.yml/);
  assert.ok(!fs.readFileSync(path.join(ROOT, '.github/workflows/sito.yml'), 'utf8').includes('deploy-pages'), 'un solo workflow pubblica');
  assert.strictEqual(PKG0.scripts.sito, 'node scripts/sito-aggiorna.mjs');
  const doc = leggi('DEPLOY-SITO.md');
  for (const s of ['npm run sito', 'GitHub Actions', 'pages.yml', 'sito-verifica.mjs']) assert.ok(doc.includes(s), `DEPLOY-SITO.md: ${s}`);
});

test('sito-sync: il controllo della pubblicazione trova app e sito nel ramo e si accorge se mancano', async () => {
  const { verifica, sorgente } = await V();
  assert.deepStrictEqual(await verifica(sorgente(ROOT), { versione: PKG.version }), []);
  const p = await verifica(sorgente(ROOT), { versione: '0.0.1' });
  assert.ok(p.some((x) => /mostra la .*attesa la 0\.0\.1/.test(x)), p.join('\n'));
  const vuota = fs.mkdtempSync(path.join(require('os').tmpdir(), 'acch-sito-'));
  const q = await verifica(sorgente(vuota));
  assert.ok(q.some((x) => /^app: {2}?.*risponde 404/.test(x) || /^app: /.test(x)));
  assert.ok(q.some((x) => /^sito: scarica\/ risponde 404/.test(x)));
});

test('sito-sync: schede delle funzioni nuove già nelle pagine ma spente fino alla versione stabile; una rc non arriva nel sito', async () => {
  const { mostraPerVersione, versioneRaggiunta, versioneDelSito, leggiChangelogRepo, applica, datiNellaPagina } = await A();
  for (const [v, atteso] of [['3.0.0', false], ['3.1.0-rc.1', false], ['3.1.0', true], ['3.1.2', true], ['4.0.0-rc.1', true]]) assert.strictEqual(versioneRaggiunta(v, '3.1.0'), atteso, v);
  const cl = leggiChangelogRepo(ROOT);
  assert.strictEqual(versioneDelSito('3.1.0-rc.1', cl.it), '3.0.0', 'con una versione di prova il sito resta sull\'ultima stabile');
  assert.strictEqual(versioneDelSito('3.1.0', cl.it), '3.1.0');
  for (const [lingua, file] of Object.entries(PAGINE)) {
    const html = leggi(file), dati = datiNellaPagina(html);
    const legati = [...html.matchAll(/<[a-z]+\b[^>]*\sdata-(dalla|prima-della)-versione="([^"]+)"[^>]*>/g)];
    assert.ok(legati.length >= 8, `${lingua}: parti legate alla versione`);
    for (const m of legati) assert.strictEqual(/\shidden\b/.test(m[0]), m[1] === 'dalla' ? !versioneRaggiunta(dati.versione, m[2]) : versioneRaggiunta(dati.versione, m[2]), `${lingua}: ${m[0].slice(0, 90)}`);
    // la scheda CF-LIBS e il suo link nell'indice escono insieme, con la 3.1.0 stabile
    const con31 = mostraPerVersione(html, '3.1.0');
    assert.match(con31, /<article class="funzione" id="f-libs"[^>]*data-dalla-versione="3\.1\.0">/, lingua); assert.match(con31, /<li data-dalla-versione="3\.1\.0"><a href="#f-libs">/, lingua);
    assert.match(html, /<article class="funzione" id="f-libs"[^>]*data-dalla-versione="3\.1\.0" hidden>/, `${lingua}: spenta con la ${dati.versione}`);
    assert.ok(mostraPerVersione(con31, dati.versione) === html, `${lingua}: si spengono di nuovo identiche`);
    assert.ok(applica(con31, dati, lingua, cl) === html, `${lingua}: applica spegne le schede secondo la versione scritta`);
    assert.doesNotMatch(html, /Palleschi|Legnaioli|PyMca/, `${lingua}: nomi non ammessi`);
  }
});
