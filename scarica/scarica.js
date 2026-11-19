// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Logica della pagina di presentazione e download, senza DOM: riconosce il sistema, sceglie i file dell'ultima
// versione stabile pubblicata su GitHub, ne legge dimensione e impronta SHA-256 e scarta ogni indirizzo che non sia di GitHub.
// Modulo puro: lo usano scarica/avvio.js nel browser e i test (test/unit/sito.test.js).

export const REPO = 'lorebiri/acchiappaspettri';
export const URL_API = `https://api.github.com/repos/${REPO}/releases/latest`;
export const URL_RELEASES = `https://github.com/${REPO}/releases/latest`;

// I pacchetti pubblicati a ogni versione (nomi prodotti da Tauri: Acchiappaspettri_<versione>_<architettura>.<estensione>).
// `chiave` è usata anche negli attributi data-file della pagina.
export const CATALOGO = [
  { chiave: 'win', sistema: 'windows', re: /^Acchiappaspettri_[\w.+-]+_x64-setup\.exe$/i },
  { chiave: 'mac-arm', sistema: 'mac', re: /^Acchiappaspettri_[\w.+-]+_aarch64\.dmg$/i },
  { chiave: 'mac-intel', sistema: 'mac', re: /^Acchiappaspettri_[\w.+-]+_x64\.dmg$/i },
  { chiave: 'linux-appimage', sistema: 'linux', re: /^Acchiappaspettri_[\w.+-]+_amd64\.AppImage$/i },
  { chiave: 'linux-deb', sistema: 'linux', re: /^Acchiappaspettri_[\w.+-]+_amd64\.deb$/i },
];

/**
 * Riconosce il sistema operativo di chi visita.
 * @param {{ platform?: string, userAgent?: string, maxTouchPoints?: number }} info
 * @returns {'windows'|'mac'|'linux'|'mobile'|'altro'}
 */
export function rilevaSistema({ platform = '', userAgent = '', maxTouchPoints = 0 } = {}) {
  const p = String(platform).toLowerCase();
  const ua = String(userAgent);
  if (p) {
    if (p === 'windows') return 'windows';
    if (p === 'macos') return 'mac';
    if (p === 'android' || p === 'ios') return 'mobile';
    if (p === 'linux') return /Android/i.test(ua) ? 'mobile' : 'linux';
    if (p === 'chrome os' || p === 'chromeos') return 'altro';
  }
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return 'mobile';
  if (/Windows NT|Win64|Windows/i.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(ua)) return maxTouchPoints > 1 ? 'mobile' : 'mac';   // iPadOS si presenta come un Mac
  if (/CrOS/i.test(ua)) return 'altro';
  if (/Linux|X11|FreeBSD/i.test(ua)) return 'linux';
  return 'altro';
}

/** Chiave del CATALOGO per un nome di file, oppure null (firme .sig, latest.json, archivi degli aggiornamenti…). */
export function classificaFile(nome) {
  const n = String(nome || '');
  const voce = CATALOGO.find((v) => v.re.test(n));
  return voce ? voce.chiave : null;
}

function parseUrl(url) {
  if (typeof url !== 'string' || url.length > 2048) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
    return u;
  } catch { return null; }
}

/** Vero solo per i file e le pagine delle versioni di questo progetto su GitHub. */
export function urlDownloadSicuro(url) {
  const u = parseUrl(url);
  return !!u && u.hostname === 'github.com' && u.pathname.startsWith(`/${REPO}/releases/`);
}

/** «sha256:<64 cifre>» (campo digest dell'API di GitHub) → impronta in minuscolo, altrimenti null. */
export function leggiImpronta(digest) {
  const m = /^sha256:([0-9a-f]{64})$/i.exec(String(digest || ''));
  return m ? m[1].toLowerCase() : null;
}

/**
 * Dalla risposta di /releases/latest ricava versione, data e i pacchetti riconosciuti.
 * Le versioni di prova e le bozze non valgono (GitHub non le restituisce come «latest», ma si controlla).
 * @returns {null|{versione:string, data:string|null, pagina:string, file:Object<string,{nome:string,url:string,dimensione:number|null,sha256:string|null}>}}
 */
export function leggiRelease(json) {
  if (!json || typeof json !== 'object' || json.draft || json.prerelease) return null;
  const m = /^v?(\d+\.\d+\.\d+)$/.exec(String(json.tag_name || ''));
  if (!m) return null;
  const file = {};
  for (const a of Array.isArray(json.assets) ? json.assets : []) {
    if (!a || typeof a !== 'object') continue;
    const chiave = classificaFile(a.name);
    if (!chiave || file[chiave] || !urlDownloadSicuro(a.browser_download_url)) continue;
    file[chiave] = {
      nome: a.name,
      url: a.browser_download_url,
      dimensione: Number.isFinite(a.size) && a.size >= 0 ? a.size : null,
      sha256: leggiImpronta(a.digest),
    };
  }
  const data = typeof json.published_at === 'string' && !Number.isNaN(Date.parse(json.published_at)) ? json.published_at : null;
  const pagina = urlDownloadSicuro(json.html_url) ? json.html_url : URL_RELEASES;
  return { versione: m[1], data, pagina, file };
}

/**
 * Quali pacchetti proporre nel pulsante principale, in ordine di importanza.
 * Sul Mac il browser spesso non dice che chip c'è: di regola chip Apple, Intel solo se il browser dichiara x86.
 */
export function scegliPrincipale(sistema, arch = '') {
  if (sistema === 'windows') return ['win'];
  if (sistema === 'mac') return String(arch).toLowerCase().startsWith('x86') ? ['mac-intel', 'mac-arm'] : ['mac-arm', 'mac-intel'];
  if (sistema === 'linux') return ['linux-appimage', 'linux-deb'];
  return [];
}

/** Numero di versione principale (2 per «2.2.0»), 0 se non leggibile. */
export function versionePrincipale(v) {
  const m = /^(\d+)\./.exec(String(v || ''));
  return m ? Number(m[1]) : 0;
}

/** 3488736 → «3,3 MB» (in inglese «3.3 MB») */
export function formattaDimensione(byte, lingua = 'it') {
  if (!Number.isFinite(byte) || byte < 0) return '';
  const loc = lingua === 'en' ? 'en-GB' : 'it-IT';
  if (byte < 1024 * 1024) return `${Math.max(1, Math.round(byte / 1024))} kB`;
  return `${(byte / 1048576).toLocaleString(loc, { maximumFractionDigits: 1, minimumFractionDigits: 1 })} MB`;
}

/** '2026-11-10T12:42:31Z' → «10 novembre 2026» (in inglese «10 November 2026») */
export function formattaData(iso, lingua = 'it') {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t).toLocaleDateString(lingua === 'en' ? 'en-GB' : 'it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' });
}
