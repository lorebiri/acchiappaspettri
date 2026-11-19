// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Avvio della pagina di presentazione: tema, domande frequenti e pulsanti di download con l'ultima versione letta da GitHub.
// Senza JavaScript, o se GitHub non risponde, i link restano sulla pagina ufficiale delle versioni: la pagina funziona lo stesso.
import {
  URL_API, URL_RELEASES, rilevaSistema, leggiRelease, scegliPrincipale, urlDownloadSicuro,
  versionePrincipale, formattaDimensione, formattaData,
} from './scarica.js';

const $ = (sel, el = document) => el.querySelector(sel);
const LINGUA = document.documentElement.lang === 'en' ? 'en' : 'it';

const TESTI = {
  it: {
    scaricaPer: { windows: 'Scarica per Windows', mac: 'Scarica per Mac', linux: 'Scarica per Linux' },
    etichetta: {
      win: 'Windows 10 e 11 (64 bit)', 'mac-arm': 'Mac con chip Apple (M1, M2, M3, M4…)', 'mac-intel': 'Mac con processore Intel',
      'linux-appimage': 'Linux, AppImage (x86_64)', 'linux-deb': 'Linux, pacchetto .deb (Debian, Ubuntu)',
    },
    breve: { win: 'installer', 'mac-arm': 'chip Apple', 'mac-intel': 'Intel', 'linux-appimage': 'AppImage', 'linux-deb': '.deb' },
    versione: (v) => `versione ${v}`,
    pubblicata: (v, d) => `Ultima versione: ${v}${d ? `, pubblicata il ${d}` : ''}.`,
    daGithub: 'dalla pagina delle versioni su GitHub',
    sceltaMac: 'Che chip ha il tuo Mac? Menu Apple → Informazioni su questo Mac: «Chip Apple M…» oppure «Processore Intel».',
    mobile: 'Il programma desktop è per computer (Windows, macOS, Linux). Sul telefono o sul tablet usa la versione online.',
    altro: 'Non riconosco il sistema di questo computer: scegli il pacchetto nella sezione Scarica.',
    scegli: 'Scegli il pacchetto',
    tuttiISistemi: 'Windows, macOS, Linux',
    errore: 'Non riesco a leggere l\'elenco dei file da GitHub in questo momento: i pulsanti portano alla pagina ufficiale delle versioni, con gli stessi file.',
    vecchia: (v) => `La versione 3.0 descritta in questa pagina è in arrivo: il pacchetto proposto oggi è la ${v}. Quando esce la 3.0, il programma installato propone l'aggiornamento da solo.`,
    copia: 'Copia', copiata: 'Copiata', selezionata: 'Selezionata',
    copiaAria: (n) => `Copia l'impronta SHA-256 di ${n}`,
    annuncioOk: 'Impronta copiata negli appunti.', annuncioSel: 'Impronta selezionata: premi Ctrl+C (o Cmd+C) per copiarla.',
    tema: { auto: 'Tema: come il sistema', chiaro: 'Tema: chiaro', scuro: 'Tema: scuro' },
  },
  en: {
    scaricaPer: { windows: 'Download for Windows', mac: 'Download for Mac', linux: 'Download for Linux' },
    etichetta: {
      win: 'Windows 10 and 11 (64-bit)', 'mac-arm': 'Mac with Apple chip (M1, M2, M3, M4…)', 'mac-intel': 'Mac with Intel processor',
      'linux-appimage': 'Linux, AppImage (x86_64)', 'linux-deb': 'Linux, .deb package (Debian, Ubuntu)',
    },
    breve: { win: 'installer', 'mac-arm': 'Apple chip', 'mac-intel': 'Intel', 'linux-appimage': 'AppImage', 'linux-deb': '.deb' },
    versione: (v) => `version ${v}`,
    pubblicata: (v, d) => `Latest version: ${v}${d ? `, published on ${d}` : ''}.`,
    daGithub: 'from the releases page on GitHub',
    sceltaMac: 'Which chip does your Mac have? Apple menu → About This Mac: «Apple M… chip» or «Intel processor».',
    mobile: 'The desktop program is for computers (Windows, macOS, Linux). On a phone or tablet, use the online version.',
    altro: 'I cannot recognise this computer\'s system: choose the package in the Download section.',
    scegli: 'Choose the package',
    tuttiISistemi: 'Windows, macOS, Linux',
    errore: 'I cannot read the list of files from GitHub right now: the buttons lead to the official releases page, with the same files.',
    vecchia: (v) => `Version 3.0, described on this page, is coming soon: the package offered today is ${v}. When 3.0 is out, the installed program offers the update by itself.`,
    copia: 'Copy', copiata: 'Copied', selezionata: 'Selected',
    copiaAria: (n) => `Copy the SHA-256 fingerprint of ${n}`,
    annuncioOk: 'Fingerprint copied to the clipboard.', annuncioSel: 'Fingerprint selected: press Ctrl+C (or Cmd+C) to copy it.',
    tema: { auto: 'Theme: same as the system', chiaro: 'Theme: light', scuro: 'Theme: dark' },
  },
}[LINGUA];

function crea(tag, attr = {}, ...figli) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attr)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const f of figli) if (f != null) el.append(f);
  return el;
}

// link sicuro: solo indirizzi delle versioni su GitHub, altrimenti la pagina delle versioni
const href = (url) => (urlDownloadSicuro(url) ? url : URL_RELEASES);

function annuncia(testo) {
  const el = $('#annuncio');
  if (!el) return;
  el.textContent = '';
  setTimeout(() => { el.textContent = testo; }, 50);
}

// ---- tema: come il sistema, chiaro o scuro (ricordato su questo computer) ----
function leggiTema() { try { return localStorage.getItem('acch-sito-tema') || 'auto'; } catch { return 'auto'; } }
function applicaTema(t) {
  if (t === 'chiaro' || t === 'scuro') document.documentElement.dataset.tema = t;
  else delete document.documentElement.dataset.tema;
  const b = $('#tema');
  if (b) { b.dataset.stato = t; b.setAttribute('aria-label', TESTI.tema[t]); b.title = TESTI.tema[t]; }
}
function collegaTema() {
  const b = $('#tema');
  applicaTema(leggiTema());
  if (!b) return;
  b.hidden = false;
  b.addEventListener('click', () => {
    const ordine = ['auto', 'chiaro', 'scuro'];
    const t = ordine[(ordine.indexOf(leggiTema()) + 1) % ordine.length];
    try { localStorage.setItem('acch-sito-tema', t); } catch { /* pazienza: vale fino alla chiusura */ }
    applicaTema(t);
    annuncia(TESTI.tema[t]);
  });
}

// ---- domande frequenti: un link a una risposta (#d-…) la apre ----
function apriRisposta(hash) {
  let id = '';
  try { id = decodeURIComponent(String(hash || '').slice(1)); } catch { return; }
  const d = id && document.getElementById(id)?.closest('details');
  if (d && !d.open) d.open = true;
}
function collegaRisposte() {
  apriRisposta(location.hash);
  window.addEventListener('hashchange', () => apriRisposta(location.hash));
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href^="#"]');
    if (a) apriRisposta(a.getAttribute('href'));
  });
}

// ---- impronte SHA-256 ----
async function copia(testo, pulsante) {
  let ok = false;
  try { await navigator.clipboard.writeText(testo); ok = true; } catch {
    const code = pulsante.previousElementSibling;
    if (code) { const sel = getSelection(); const r = document.createRange(); r.selectNodeContents(code); sel.removeAllRanges(); sel.addRange(r); }
  }
  pulsante.textContent = ok ? TESTI.copiata : TESTI.selezionata;
  annuncia(ok ? TESTI.annuncioOk : TESTI.annuncioSel);
  setTimeout(() => { pulsante.textContent = TESTI.copia; }, 2000);
}
function rigaImpronta(nome, hex) {
  const btn = crea('button', { type: 'button', class: 'copia', 'aria-label': TESTI.copiaAria(nome), text: TESTI.copia });
  btn.addEventListener('click', () => copia(hex, btn));
  return crea('span', { class: 'impronta' }, crea('span', { class: 'impronta-nome', text: 'SHA-256' }), crea('code', { text: hex }), btn);
}

// ---- pulsante principale ----
function pulsante(chiave, sistema, release, primario) {
  const f = release?.file?.[chiave];
  const testo = primario ? TESTI.scaricaPer[sistema] : TESTI.etichetta[chiave];
  const sotto = f
    ? [primario && sistema !== 'windows' ? TESTI.breve[chiave] : null, TESTI.versione(release.versione), formattaDimensione(f.dimensione, LINGUA)].filter(Boolean).join(' · ')
    : TESTI.daGithub;
  return crea('a', { class: primario ? 'btn primario' : 'btn', href: href(f?.url) }, crea('span', { text: testo }), crea('small', { text: sotto }));
}

async function architettura() {
  try {
    const d = navigator.userAgentData;
    if (!d?.getHighEntropyValues) return '';
    const v = await Promise.race([d.getHighEntropyValues(['architecture']), new Promise((r) => setTimeout(() => r({}), 500))]);
    return v?.architecture || '';
  } catch { return ''; }
}

function disegnaPrincipale(sistema, arch, release, errore) {
  const box = $('#scarica-principale');
  if (!box) return;
  const chiavi = scegliPrincipale(sistema, arch).filter((k, i) => i === 0 || release?.file?.[k]);
  const pezzi = [];
  if (chiavi.length) {
    pezzi.push(pulsante(chiavi[0], sistema, release, true));
    const note = [];
    if (sistema === 'mac') note.push(TESTI.sceltaMac);
    const altri = chiavi.slice(1).map((k) => crea('a', { href: href(release?.file?.[k]?.url) }, TESTI.etichetta[k]));
    if (altri.length) pezzi.push(crea('p', { class: 'nota-pulsante' }, ...altri.flatMap((a, i) => (i ? [' · ', a] : [a]))));
    for (const n of note) pezzi.push(crea('p', { class: 'nota-pulsante', text: n }));
  } else {
    pezzi.push(crea('a', { class: 'btn primario', href: '#scarica' }, crea('span', { text: TESTI.scegli }), crea('small', { text: TESTI.tuttiISistemi })));
    pezzi.push(crea('p', { class: 'nota-pulsante', text: sistema === 'mobile' ? TESTI.mobile : TESTI.altro }));
  }
  if (errore) pezzi.push(crea('p', { class: 'nota-pulsante', role: 'status', text: TESTI.errore }));
  box.replaceChildren(...pezzi);
  box.setAttribute('aria-busy', 'false');
}

function aggiornaElenco(release) {
  for (const li of document.querySelectorAll('[data-file]')) {
    const f = release.file[li.dataset.file];
    li.querySelector('.impronta')?.remove();
    if (!f) continue;
    const a = $('a', li);
    if (a) a.href = href(f.url);
    const info = $('.file-info', li);
    if (info) info.textContent = [f.nome, formattaDimensione(f.dimensione, LINGUA)].filter(Boolean).join(' · ');
    if (f.sha256) li.append(rigaImpronta(f.nome, f.sha256));
  }
}

async function caricaRelease() {
  try {
    const salvata = JSON.parse(sessionStorage.getItem('acch-sito-release') || 'null');
    if (salvata && Date.now() - salvata.quando < 10 * 60 * 1000) return leggiRelease(salvata.json);
  } catch { /* sessionStorage non disponibile */ }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(URL_API, { headers: { Accept: 'application/vnd.github+json' }, signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!r.ok) throw new Error(`GitHub ha risposto ${r.status}`);
    const json = await r.json();
    const release = leggiRelease(json);
    if (!release) throw new Error('risposta di GitHub non valida');
    try { sessionStorage.setItem('acch-sito-release', JSON.stringify({ quando: Date.now(), json })); } catch { /* pazienza */ }
    return release;
  } finally { clearTimeout(t); }
}

async function avvia() {
  document.documentElement.classList.add('js');
  collegaTema();
  collegaRisposte();
  document.body.append(crea('div', { id: 'annuncio', class: 'vh', role: 'status', 'aria-live': 'polite' }));
  const sistema = rilevaSistema({
    platform: navigator.userAgentData?.platform || '',
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints || 0,
  });
  document.documentElement.dataset.sistema = sistema;
  document.querySelector(`.carta-sistema[data-sistema="${sistema}"]`)?.classList.add('evidenza');
  const arch = sistema === 'mac' ? await architettura() : '';
  $('#scarica-principale')?.setAttribute('aria-busy', 'true');

  let release = null;
  try { release = await caricaRelease(); } catch (err) { console.info('Acchiappaspettri: elenco dei file non disponibile —', err.message); }
  disegnaPrincipale(sistema, arch, release, !release);
  if (!release) return;
  const v = $('#versione');
  if (v) v.textContent = TESTI.pubblicata(release.versione, formattaData(release.data, LINGUA));
  const nv = $('#nota-versione');
  if (nv && versionePrincipale(release.versione) < 3) { nv.textContent = TESTI.vecchia(release.versione); nv.hidden = false; }
  aggiornaElenco(release);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia);
else avvia();
