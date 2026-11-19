// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Allinea il sito di presentazione (scarica/, italiano e inglese) all'ultima versione di Acchiappaspettri, senza interventi a mano.
//
// Scrive in scarica/index.html e scarica/en/index.html, tra i segnaposto <!-- sync:NOME --> … <!-- /sync:NOME -->:
//   head        JSON-LD (SoftwareApplication con versione e data) e i dati della versione letti da avvio.js
//   principale  il pulsante di download che si vede senza JavaScript
//   versione    «Ultima versione: X.Y.Z, pubblicata il …»
//   elenco      tutti i pacchetti con link diretto, nome, dimensione e impronta SHA-256
//   novita      la sezione «Novità»: le ultime 3 versioni pubblicate di CHANGELOG.md (in inglese CHANGELOG.en.md),
//               senza le versioni di prova (rc) né le sezioni «In preparazione»
// e accende o spegne (attributo hidden) le parti con data-dalla-versione / data-prima-della-versione (mostraPerVersione)
// e rigenera scarica/sitemap.xml (con le due lingue).
//
// Uso:
//   npm run sito                       versione di package.json (se è una versione di prova, l'ultima stabile del CHANGELOG)
//                                      (prima del commit di un rilascio, o dopo la pubblicazione per
//                                      scrivere anche data, dimensioni e impronte). Se quella versione è già su GitHub Releases
//                                      prende i dati da lì; altrimenti i link portano alla pagina delle versioni.
//   node scripts/sito-aggiorna.mjs --pubblicata [--dir cartella]
//                                      ultima versione PUBBLICATA su GitHub Releases (lo usa .github/workflows/pages.yml prima
//                                      del deploy). Se GitHub non risponde restano i dati già scritti nella pagina.
//   --dir cartella                     dove sono index.html e en/index.html (predefinita: scarica/)
// Variabile facoltativa GITHUB_TOKEN: evita il limite di richieste anonime dell'API.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  REPO, URL_RELEASES, CATALOGO, leggiRelease, leggiDatiStatici, nomeFile, confrontaVersioni, formattaDimensione, formattaData,
} from '../scarica/scarica.js';

export const URL_SITO = 'https://lorebiri.github.io/acchiappaspettri/scarica/';
export const URL_SITO_LINGUA = { it: URL_SITO, en: `${URL_SITO}en/` };
export const N_NOVITA = 3;
const RADICE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API = `https://api.github.com/repos/${REPO}`;

// ---- dati della versione ----

/** Dati presi solo da package.json (versione non ancora pubblicata, o GitHub non raggiungibile). */
export function datiDaPackage(versione, precedenti = null) {
  const file = {};
  for (const v of CATALOGO) file[v.chiave] = { nome: nomeFile(v.chiave, versione), url: URL_RELEASES, dimensione: null, sha256: null };
  const date = { ...(precedenti?.date || {}) };
  return { versione, data: date[versione] || null, pagina: URL_RELEASES, fonte: 'package.json', file, date };
}

/** Dati dalla risposta dell'API di GitHub per una release (dimensioni e impronte dal campo digest) e dall'elenco delle release (date). */
export function datiDaRelease(json, elenco = [], precedenti = null) {
  const r = leggiRelease(json);
  if (!r) return null;
  const file = {};
  for (const v of CATALOGO) if (r.file[v.chiave]) file[v.chiave] = { ...r.file[v.chiave] };
  const date = { ...(precedenti?.date || {}) };
  for (const x of Array.isArray(elenco) ? elenco : []) {
    const rx = leggiRelease(x);
    if (rx?.data) date[rx.versione] = rx.data;
  }
  if (r.data) date[r.versione] = r.data;
  return { versione: r.versione, data: r.data, pagina: r.pagina, fonte: 'github', file, date: ordina(date) };
}

const ordina = (date) => Object.fromEntries(Object.entries(date).sort((a, b) => confrontaVersioni(b[0], a[0])));

/** I dati scritti nella pagina (blocco head), come li legge avvio.js; null se mancano. */
export function datiNellaPagina(html) {
  const m = /<script type="application\/json" id="dati-versione">([\s\S]*?)<\/script>/.exec(String(html));
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

// ---- CHANGELOG ----

const RE_SEZIONE = /^## +(.+?) *$/;
const RE_TITOLO_VERSIONE = /^v?(\d+\.\d+\.\d+)(-[\w.]+)?(?:\s*[—–-]\s*(.*))?$/;
const IN_PREPARAZIONE = /in preparazione|in preparation|unreleased|non pubblicat/i;

/**
 * Le sezioni «## X.Y.Z — data» di un CHANGELOG, nell'ordine del file: { versione, data, testo (paragrafi), punti: [{ t, sotto: [] }] }.
 * Escluse le versioni di prova (X.Y.Z-rc.N) e le sezioni «In preparazione» (anche se il titolo ha un numero).
 */
export function leggiChangelog(md) {
  const sezioni = [];
  let cur = null;
  for (const riga of String(md || '').replace(/\r\n/g, '\n').split('\n')) {
    const s = RE_SEZIONE.exec(riga);
    if (s) {
      cur = null;
      const m = RE_TITOLO_VERSIONE.exec(s[1]);
      if (m && !m[2] && !IN_PREPARAZIONE.test(s[1])) sezioni.push(cur = { versione: m[1], data: (m[3] || '').trim() || null, testo: [], punti: [] });
      continue;
    }
    if (!cur || /^#/.test(riga)) { if (/^# /.test(riga)) cur = null; continue; }
    const p = /^[-*] +(.*)$/.exec(riga);
    const sotto = /^\s{2,}[-*] +(.*)$/.exec(riga);
    const ultimo = cur.punti[cur.punti.length - 1];
    if (p) cur.punti.push({ t: p[1].trim(), sotto: [] });
    else if (sotto && ultimo) ultimo.sotto.push(sotto[1].trim());
    else if (/^\s{2,}\S/.test(riga) && ultimo) {
      if (ultimo.sotto.length) ultimo.sotto[ultimo.sotto.length - 1] += ` ${riga.trim()}`; else ultimo.t += ` ${riga.trim()}`;
    } else if (riga.trim()) cur.testo.push(riga.trim());
  }
  return sezioni;
}

/** Le ultime `n` versioni fino a quella indicata compresa (le più nuove prima). */
export function ultimeNovita(sezioni, versione, n = N_NOVITA) {
  return (Array.isArray(sezioni) ? sezioni : [])
    .filter((x) => confrontaVersioni(x.versione, versione) <= 0)
    .sort((a, b) => confrontaVersioni(b.versione, a.versione))
    .slice(0, n);
}

// ---- HTML ----

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const jsonInHtml = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
export const giorno = (iso) => (iso ? new Date(Date.parse(iso)).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }) : '');

/** Markdown in linea del CHANGELOG → HTML sicuro: `codice` e **grassetto**; il resto è testo. Il soggetto prima dei due punti in grassetto. */
export function inLinea(md, conSoggetto = false) {
  let t = String(md || '');
  let soggetto = '';
  if (conSoggetto) {
    const m = /^([^:`*]{2,100}?): (.+)$/s.exec(t);
    if (m) { soggetto = m[1]; t = m[2]; }
  }
  const html = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return soggetto ? `<strong>${html(soggetto)}</strong>: ${html(t)}` : html(t);
}

export const TESTI = {
  it: {
    lingua: 'it', ogLocale: 'it_IT',
    descrizioneLd: 'Software libero e gratuito per spettri e cromatogrammi (FTIR, Raman, UV-Vis, fluorescenza, HPLC, XRF, LIBS, TGA, DSC, NMR, EPR, adsorbimento): legge i file degli strumenti, trova i picchi, toglie il fondo, controlla il dato e prepara PDF, immagini e tabelle. Online nel browser o per Windows, macOS e Linux.',
    os: 'Windows 10, Windows 11, macOS 11 o successivo (chip Apple e Intel), Linux (x86_64)',
    scarica: 'Scarica il programma', tutti: 'Windows, macOS, Linux',
    versione: (v) => `versione ${v}`,
    ultima: (v, d) => `Ultima versione: ${v}${d ? `, pubblicata il ${d}` : ''}.`,
    soloVersione: (v) => `Versione ${v}.`,
    leNovita: 'Le novità',
    sistemi: [
      ['windows', 'Windows', [['win', 'Installer per Windows 10 e 11 (64 bit)']]],
      ['mac', 'macOS', [['mac-arm', 'Mac con chip Apple (M1, M2, M3, M4…)'], ['mac-intel', 'Mac con processore Intel']]],
      ['linux', 'Linux', [['linux-appimage', 'AppImage (x86_64), si aggiorna da sola'], ['linux-deb', 'Pacchetto .deb (Debian, Ubuntu)']]],
    ],
    titoloNovita: 'Novità', introNovita: 'Le ultime versioni pubblicate, dalla più nuova. Il programma desktop avvisa da solo quando ne esce una nuova; la versione online è sempre l\'ultima.',
    pubblicataIl: 'Pubblicata il', altre: (n) => `Le altre ${n} novità`,
    tutte: 'Tutte le versioni nel registro delle novità', tutteRelease: 'pagine delle versioni su GitHub',
    linguaOriginale: null,
  },
  en: {
    lingua: 'en', ogLocale: 'en_GB',
    descrizioneLd: 'Free and open-source software for spectra and chromatograms (FTIR, Raman, UV-Vis, fluorescence, HPLC, XRF, LIBS, TGA, DSC, NMR, EPR, gas adsorption): reads instrument files, finds peaks, removes the background, checks data quality and prepares PDFs, images and tables. Online in the browser or for Windows, macOS and Linux.',
    os: 'Windows 10, Windows 11, macOS 11 or later (Apple chip and Intel), Linux (x86_64)',
    scarica: 'Download the program', tutti: 'Windows, macOS, Linux',
    versione: (v) => `version ${v}`,
    ultima: (v, d) => `Latest version: ${v}${d ? `, published on ${d}` : ''}.`,
    soloVersione: (v) => `Version ${v}.`,
    leNovita: 'What\'s new',
    sistemi: [
      ['windows', 'Windows', [['win', 'Installer for Windows 10 and 11 (64-bit)']]],
      ['mac', 'macOS', [['mac-arm', 'Mac with Apple chip (M1, M2, M3, M4…)'], ['mac-intel', 'Mac with Intel processor']]],
      ['linux', 'Linux', [['linux-appimage', 'AppImage (x86_64), updates itself'], ['linux-deb', '.deb package (Debian, Ubuntu)']]],
    ],
    titoloNovita: 'What\'s new', introNovita: 'The latest published versions, newest first. The desktop program tells you when a new one is out; the online version is always the latest.',
    pubblicataIl: 'Published on', altre: (n) => `The other ${n} changes`,
    tutte: 'All versions in the change log', tutteRelease: 'release pages on GitHub',
    linguaOriginale: 'These notes are not yet translated: here is the Italian text.',
  },
};

function bloccoHead(dati, T) {
  const win = dati.file.win;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Acchiappaspettri',
    description: T.descrizioneLd,
    url: URL_SITO_LINGUA[T.lingua],
    image: `${URL_SITO}img/desktop-spazio.webp`,
    screenshot: `${URL_SITO}img/desktop-spazio.webp`,
    applicationCategory: 'ScientificApplication',
    applicationSubCategory: T.lingua === 'en' ? 'Spectroscopy and chromatography' : 'Spettroscopia e cromatografia',
    operatingSystem: T.os,
    inLanguage: ['it', 'en'],
    isAccessibleForFree: true,
    license: 'https://www.gnu.org/licenses/gpl-3.0.html',
    author: { '@type': 'Person', name: 'Lorenzo Birindelli' },
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    softwareVersion: dati.versione,
    ...(dati.data ? { datePublished: giorno(dati.data) } : {}),
    downloadUrl: dati.pagina,
    releaseNotes: dati.fonte === 'github' ? dati.pagina : `https://github.com/${REPO}/blob/main/CHANGELOG.md`,
    ...(win?.dimensione ? { fileSize: formattaDimensione(win.dimensione, 'en') } : {}),
    codeRepository: `https://github.com/${REPO}`,
  };
  return [
    `<script type="application/ld+json">${jsonInHtml(ld)}</script>`,
    `<script type="application/json" id="dati-versione">${jsonInHtml(dati)}</script>`,
  ].join('\n');
}

function bloccoPrincipale(dati, T) {
  return `            <a class="btn primario" href="#scarica"><span>${esc(T.scarica)}</span><small>${esc(T.versione(dati.versione))} · ${esc(T.tutti)}</small></a>`;
}

export function testoVersione(dati, lingua) {
  const T = TESTI[lingua];
  return dati.fonte === 'github' ? T.ultima(dati.versione, formattaData(dati.data, lingua)) : T.soloVersione(dati.versione);
}

function bloccoVersione(dati, T) {
  return `      <p class="intro"><span id="versione">${esc(testoVersione(dati, T.lingua))} <a href="#novita">${esc(T.leNovita)}</a></span> ${T.lingua === 'en'
    ? 'All free, forever. Rather not install anything? <a href="../../">Use the online version</a>.'
    : 'Tutti gratuiti, per sempre. Preferisci non installare nulla? <a href="../">Usa la versione online</a>.'}</p>`;
}

function rigaFile(dati, chiave, testo, T) {
  const f = dati.file[chiave];
  const nome = f?.nome || nomeFile(chiave, dati.versione);
  const info = [nome, formattaDimensione(f?.dimensione, T.lingua)].filter(Boolean).join(' · ');
  const pezzi = [`<a href="${esc(f ? f.url : URL_RELEASES)}">${esc(testo)}</a>`, `<span class="file-info">${esc(info)}</span>`];
  if (f?.sha256) pezzi.push(`<span class="impronta"><span class="impronta-nome">SHA-256</span> <code>${esc(f.sha256)}</code></span>`);
  return `            <li data-file="${chiave}"${f ? '' : ' class="assente"'}>${pezzi.join('')}</li>`;
}

function bloccoElenco(dati, T) {
  const righe = [];
  for (const [sistema, titolo, file] of T.sistemi) {
    righe.push(`        <div class="carta carta-sistema" data-sistema="${sistema}">`);
    righe.push(`          <h3>${esc(titolo)}</h3>`);
    righe.push('          <ul class="file">');
    for (const [chiave, testo] of file) righe.push(rigaFile(dati, chiave, testo, T));
    righe.push('          </ul>');
    righe.push('        </div>');
  }
  return righe.join('\n');
}

const idVersione = (v) => `v-${v.replace(/\./g, '-')}`;

function dataNovita(voce, dati, lingua) {
  const iso = dati.date?.[voce.versione];
  if (iso) return `<time datetime="${giorno(iso)}">${esc(formattaData(iso, lingua))}</time>`;
  return voce.data ? esc(voce.data) : '';
}

/** Sezione «Novità»: per ogni versione i primi 6 punti in vista, gli altri in un riquadro da aprire. */
function bloccoNovita(dati, T, sezioni, sezioniIt) {
  const voci = ultimeNovita(sezioniIt, dati.versione);
  const r = '      ';
  const righe = [
    `${r}<h2 id="t-novita">${esc(T.titoloNovita)}</h2>`,
    `${r}<p class="intro">${esc(T.introNovita)}</p>`,
    `${r}<ol class="novita">`,
  ];
  for (const vIt of voci) {
    const tradotta = sezioni.find((x) => x.versione === vIt.versione);
    const voce = tradotta || vIt;
    const lang = !tradotta && T.lingua !== 'it' ? ' lang="it"' : '';
    const d = dataNovita(voce, dati, T.lingua);
    righe.push(`${r}  <li class="carta voce-novita" id="${idVersione(vIt.versione)}" data-versione="${esc(vIt.versione)}">`);
    righe.push(`${r}    <h3>Acchiappaspettri ${esc(vIt.versione)}</h3>`);
    if (d) righe.push(`${r}    <p class="novita-data">${esc(T.pubblicataIl)} ${d}</p>`);
    if (lang) righe.push(`${r}    <p class="nota">${esc(T.linguaOriginale)}</p>`);
    for (const t of voce.testo) righe.push(`${r}    <p${lang}>${inLinea(t)}</p>`);
    const punti = voce.punti.map((p) => `<li>${inLinea(p.t, true)}${p.sotto.length ? `<ul>${p.sotto.map((x) => `<li>${inLinea(x, true)}</li>`).join('')}</ul>` : ''}</li>`);
    if (punti.length) {
      righe.push(`${r}    <ul class="punti"${lang}>`);
      for (const p of punti.slice(0, 6)) righe.push(`${r}      ${p}`);
      righe.push(`${r}    </ul>`);
    }
    if (punti.length > 6) {
      righe.push(`${r}    <details class="altre-novita"><summary>${esc(T.altre(punti.length - 6))}</summary>`);
      righe.push(`${r}      <ul class="punti"${lang}>`);
      for (const p of punti.slice(6)) righe.push(`${r}        ${p}`);
      righe.push(`${r}      </ul>`);
      righe.push(`${r}    </details>`);
    }
    righe.push(`${r}  </li>`);
  }
  righe.push(`${r}</ol>`);
  righe.push(`${r}<p class="nota"><a href="https://github.com/${REPO}/blob/main/${T.lingua === 'en' ? 'CHANGELOG.en.md' : 'CHANGELOG.md'}">${esc(T.tutte)}</a> · <a href="https://github.com/${REPO}/releases">${esc(T.tutteRelease)}</a></p>`);
  return righe.join('\n');
}

/**
 * Parti della pagina legate a una versione: un elemento con data-dalla-versione="3.1.0" si vede solo se la versione scritta nella pagina
 * è una 3.1.0 stabile o successiva (una versione di prova come 3.1.0-rc.1 no); data-prima-della-versione="3.1.0" il contrario.
 * Così le schede delle funzioni nuove stanno già nel sito ma escono solo con la versione pubblicata: pages.yml scrive l'ultima
 * versione PUBBLICATA (--pubblicata) prima di mettere online. Si aggiunge o si toglie solo l'attributo hidden.
 */
export function versioneRaggiunta(versione, soglia) {
  const c2 = confrontaVersioni(String(versione || '').split('-')[0], soglia);
  return c2 !== 0 ? c2 > 0 : !/-/.test(String(versione || ''));
}
export function mostraPerVersione(html, versione) {
  return String(html).replace(/<([a-z][a-z0-9]*)((?:\s[^>]*?)?\sdata-(dalla|prima-della)-versione="([^"]+)"[^>]*?)\s*>/gi, (_, tag, attr, tipo, soglia) => {
    const vedi = tipo === 'dalla' ? versioneRaggiunta(versione, soglia) : !versioneRaggiunta(versione, soglia);
    const a = attr.replace(/\shidden(?=\s|$)/g, '');
    return `<${tag}${a}${vedi ? '' : ' hidden'}>`;
  });
}

/** Sostituisce il contenuto di un blocco <!-- sync:nome --> … <!-- /sync:nome -->. Errore se il blocco non c'è. */
export function sostituisciBlocco(html, nome, contenuto) {
  const re = new RegExp(`(<!-- sync:${nome}\\b[^>]*-->)[\\s\\S]*?(\\n[ \\t]*<!-- /sync:${nome} -->)`);
  if (!re.test(html)) throw new Error(`Blocco «sync:${nome}» non trovato`);
  return html.replace(re, (_, a, b) => `${a}\n${contenuto}${b}`);
}

/**
 * Scrive i dati della versione e le Novità in una pagina. Funzione pura: stessa entrata → stessa uscita.
 * @param {string} html  la pagina
 * @param {object} dati  dati della versione (datiDaRelease o datiDaPackage)
 * @param {'it'|'en'} lingua
 * @param {{it: Array, en: Array}} changelog  sezioni lette da CHANGELOG.md e CHANGELOG.en.md
 */
export function applica(html, dati, lingua, changelog) {
  const T = TESTI[lingua];
  let out = String(html).replace(/\r\n/g, '\n');
  out = sostituisciBlocco(out, 'head', bloccoHead(dati, T));
  out = sostituisciBlocco(out, 'principale', bloccoPrincipale(dati, T));
  out = sostituisciBlocco(out, 'versione', bloccoVersione(dati, T));
  out = sostituisciBlocco(out, 'elenco', bloccoElenco(dati, T));
  out = sostituisciBlocco(out, 'novita', bloccoNovita(dati, T, changelog[lingua] || [], changelog.it || []));
  out = mostraPerVersione(out, dati.versione);
  return out;
}

export function sitemap(dati) {
  const lastmod = dati.data ? `\n    <lastmod>${giorno(dati.data)}</lastmod>` : '';
  const alt = Object.entries(URL_SITO_LINGUA).map(([l, u]) => `\n    <xhtml:link rel="alternate" hreflang="${l}" href="${u}"/>`).join('')
    + `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${URL_SITO}"/>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${Object.values(URL_SITO_LINGUA).map((u) => `  <url>\n    <loc>${u}</loc>${lastmod}${alt}\n  </url>`).join('\n')}
</urlset>
`;
}

export function leggiChangelogRepo(radice = RADICE) {
  const leggi = (f) => (existsSync(join(radice, f)) ? readFileSync(join(radice, f), 'utf8') : '');
  return { it: leggiChangelog(leggi('CHANGELOG.md')), en: leggiChangelog(leggi('CHANGELOG.en.md')) };
}

// ---- rete ----

async function leggiJson(url) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'acchiappaspettri-sito' };
  let r = null;
  if (process.env.GITHUB_TOKEN) {
    r = await fetch(url, { headers: { ...headers, Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }, signal: AbortSignal.timeout(20000) });
    if (r.status === 401) r = null; // token non valido per l'API: si riprova senza
  }
  r ??= await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${url}: GitHub ha risposto ${r.status}`);
  return r.json();
}

/** Dati di una versione da GitHub Releases: l'ultima pubblicata (versione = null) o quella indicata. */
async function daGitHub(versione, precedenti) {
  const elenco = await leggiJson(`${API}/releases?per_page=30`).catch((e) => { if (!versione) return []; throw e; });
  let release = versione ? (Array.isArray(elenco) ? elenco : []).find((r) => r?.tag_name === `v${versione}` && !r.draft) : null;
  if (!versione) release = await leggiJson(`${API}/releases/latest`);
  if (!release) throw new Error(`nessuna release v${versione} pubblicata`);
  return datiDaRelease(release, elenco, precedenti);
}

// ---- riga di comando ----

/**
 * Versione che il sito deve mostrare: quella di package.json se è stabile; se è una versione di prova (3.1.0-rc.1) l'ultima stabile
 * del CHANGELOG, perché le versioni di prova non vanno annunciate né proposte nel sito.
 */
export function versioneDelSito(versionePkg, sezioniIt) {
  if (!/-/.test(String(versionePkg || ''))) return versionePkg;
  const base = String(versionePkg).split('-')[0];   // confrontaVersioni non legge il suffisso «-rc.N»
  const stabili = (sezioniIt || []).map((x) => x.versione).filter((v) => confrontaVersioni(v, base) < 0 && !/-/.test(v));
  return stabili.sort((a, b) => confrontaVersioni(b, a))[0] || versionePkg;
}

async function main(argv) {
  const pubblicata = argv.includes('--pubblicata');
  const i = argv.indexOf('--dir');
  const dir = resolve(i >= 0 ? argv[i + 1] : join(RADICE, 'scarica'));
  const changelog = leggiChangelogRepo();
  const versionePacchetto = JSON.parse(readFileSync(join(RADICE, 'package.json'), 'utf8')).version, versionePkg = versioneDelSito(versionePacchetto, changelog.it);
  if (versionePkg !== versionePacchetto) console.log(`${versionePacchetto} è una versione di prova: il sito resta sulla ${versionePkg}.`);
  const pagine = { it: join(dir, 'index.html'), en: join(dir, 'en', 'index.html') };
  const html = { it: readFileSync(pagine.it, 'utf8'), en: readFileSync(pagine.en, 'utf8') };
  const precedenti = datiNellaPagina(html.it);
  const precedentiValidi = leggiDatiStatici(precedenti) ? precedenti : null;

  let dati = null;
  if (pubblicata) {
    try { dati = await daGitHub(null, precedentiValidi); } catch (e) { console.warn(`Avviso: ${e.message}`); }
    if (!dati) {
      console.warn('Avviso: ultima versione pubblicata non disponibile, restano i dati già scritti nella pagina.');
      dati = precedentiValidi || datiDaPackage(versionePkg);
    } else if (dati.versione !== versionePkg) {
      console.log(`Nota: l'ultima versione pubblicata è la ${dati.versione}, package.json dice ${versionePkg} (normale tra il cambio di versione e la pubblicazione).`);
    }
  } else {
    try { dati = await daGitHub(versionePkg, precedentiValidi); } catch (e) { console.log(`La ${versionePkg} non è (ancora) su GitHub Releases: ${e.message}`); }
    if (!dati && precedentiValidi?.versione === versionePkg && precedentiValidi.fonte === 'github') dati = precedentiValidi;
    if (!dati) dati = datiDaPackage(versionePkg, precedentiValidi);
  }
  if (!ultimeNovita(changelog.it, dati.versione).some((v) => v.versione === dati.versione)) console.warn(`Avviso: in CHANGELOG.md manca la sezione «## ${dati.versione}».`);
  if (!changelog.en.some((v) => v.versione === dati.versione)) console.warn(`Avviso: in CHANGELOG.en.md manca la sezione «## ${dati.versione}»: la pagina inglese mostra il testo italiano.`);

  for (const lingua of ['it', 'en']) writeFileSync(pagine[lingua], applica(html[lingua], dati, lingua, changelog));
  writeFileSync(join(dir, 'sitemap.xml'), sitemap(dati));
  console.log(`Sito allineato ad Acchiappaspettri ${dati.versione} (fonte: ${dati.fonte}${dati.data ? `, ${giorno(dati.data)}` : ''}).`);
  if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `versione=${dati.versione}\nfonte=${dati.fonte}\n`, { flag: 'a' });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
}
