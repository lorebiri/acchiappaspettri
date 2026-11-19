// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Controlla che una pubblicazione di GitHub Pages contenga l'app online e il sito di presentazione, agli indirizzi di sempre.
// Funziona su una cartella (l'artefatto costruito, prima del deploy) e su un indirizzo (il sito online, dopo il deploy).
//
//   node scripts/sito-verifica.mjs _site --versione 3.0.0
//   node scripts/sito-verifica.mjs https://lorebiri.github.io/acchiappaspettri/ --versione 3.0.0 --attendi 600 --confronta _site
//
// Controlla:
//   app      index.html è l'app (titolo, APP_VERSION_FULL) e ogni script, foglio di stile e icona che carica esiste;
//            app/, i18n/ e vendor/ ci sono
//   sito     scarica/ e scarica/en/: dati della versione nella pagina (uguale a --versione, se indicata), link diretti di GitHub
//            per tutti i pacchetti, JSON-LD con la stessa versione, hreflang, risorse (stile, script, immagini, sitemap, anteprima)
//   --confronta DIR  (solo online) le pagine pubblicate sono byte per byte quelle della cartella costruita
//   --attendi S      (solo online) riprova fino a S secondi: la cache di GitHub Pages tiene le pagine fino a 10 minuti
// Esce con 1 e l'elenco dei problemi se qualcosa non va.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CATALOGO, leggiDatiStatici, nomeFile } from '../scarica/scarica.js';

const PAGINE_SITO = ['scarica/', 'scarica/en/'];
const RISORSE_SITO = ['scarica/stile.css', 'scarica/avvio.js', 'scarica/scarica.js', 'scarica/tema.js', 'scarica/icona.svg', 'scarica/sitemap.xml', 'scarica/anteprima.jpg', 'scarica/img/desktop-spazio.webp'];
const RISORSE_APP = ['app/ui.js', 'i18n/en.js', 'vendor/jspdf.umd.min.js', 'apple-touch-icon.png'];
const CONFRONTO = ['', 'scarica/', 'scarica/en/', 'app/ui.js', 'i18n/en.js'];

/** Lettore di una cartella o di un indirizzo: get(percorso) → { stato, testo, byte } */
export function sorgente(base, { cacheBust = '' } = {}) {
  if (/^https:\/\//.test(base)) {
    const radice = base.endsWith('/') ? base : `${base}/`;
    return {
      nome: radice,
      async get(p) {
        const u = new URL(p, radice);
        if (cacheBust && (p === '' || p.endsWith('/') || p.endsWith('.html') || p.endsWith('.xml'))) u.searchParams.set('verifica', cacheBust);
        try {
          const r = await fetch(u, { redirect: 'follow', headers: { 'User-Agent': 'acchiappaspettri-verifica' }, signal: AbortSignal.timeout(30000) });
          const byte = Buffer.from(await r.arrayBuffer());
          return { stato: r.status, testo: byte.toString('utf8'), byte };
        } catch (e) { return { stato: 0, testo: String(e.message || e), byte: Buffer.alloc(0) }; }
      },
    };
  }
  const dir = resolve(base);
  return {
    nome: dir,
    async get(p) {
      let f = join(dir, decodeURIComponent(p.split(/[?#]/)[0]));
      if (p === '' || p.endsWith('/') || (existsSync(f) && statSync(f).isDirectory())) f = join(f, 'index.html');
      if (!existsSync(f)) return { stato: 404, testo: '', byte: Buffer.alloc(0) };
      const byte = readFileSync(f);
      return { stato: 200, testo: byte.toString('utf8'), byte };
    },
  };
}

const attr = (html, tag, a) => [...html.matchAll(new RegExp(`<${tag}\\b[^>]*\\s${a}="([^"]*)"`, 'gi'))].map((m) => m[1]);
const relativo = (h) => h && !/^(#|[a-z][a-z0-9+.-]*:|\/\/|data:)/i.test(h);
const unisci = (pagina, h) => { const u = new URL(h, `https://x/${pagina}`); return decodeURIComponent(u.pathname.slice(1)); };

/** Esegue tutti i controlli; ritorna l'elenco dei problemi (vuoto = tutto bene). */
export async function verifica(src, { versione = null } = {}) {
  const problemi = [];
  const no = (m) => problemi.push(m);
  const esiste = async (p, chi) => { const r = await src.get(p); if (r.stato !== 200) no(`${chi}: ${p} risponde ${r.stato}`); return r; };

  // ---- app ----
  const app = await esiste('', 'app');
  if (app.stato === 200) {
    if (!/<title>Acchiappaspettri<\/title>/.test(app.testo)) no('app: index.html non è l\'app (manca <title>Acchiappaspettri</title>)');
    const v = /APP_VERSION_FULL=\(\)=>'([^']+)'/.exec(app.testo);
    if (!v) no('app: manca APP_VERSION_FULL in index.html');
    const usate = [...attr(app.testo, 'script', 'src'), ...attr(app.testo, 'link', 'href')].filter(relativo).map((h) => unisci('', h));
    if (usate.length < 3) no(`app: troppo poche risorse in index.html (${usate.length})`);
    for (const p of new Set([...usate, ...RISORSE_APP])) await esiste(p, 'app');
  }

  // ---- sito ----
  for (const pagina of PAGINE_SITO) {
    const r = await esiste(pagina, 'sito');
    if (r.stato !== 200) continue;
    const html = r.testo;
    const m = /<script type="application\/json" id="dati-versione">([\s\S]*?)<\/script>/.exec(html);
    let dati = null;
    try { dati = leggiDatiStatici(JSON.parse(m?.[1] || 'null')); } catch { /* sotto */ }
    if (!dati) { no(`sito: ${pagina} senza dati della versione validi`); continue; }
    if (versione && dati.versione !== versione) no(`sito: ${pagina} mostra la ${dati.versione}, attesa la ${versione}`);
    for (const v of CATALOGO) {
      const f = dati.file[v.chiave];
      if (!f) { no(`sito: ${pagina} senza il pacchetto ${v.chiave}`); continue; }
      if (f.nome !== nomeFile(v.chiave, dati.versione)) no(`sito: ${pagina} ${v.chiave} si chiama ${f.nome}`);
      if (dati.fonte === 'github' && !f.url.endsWith(`/releases/download/v${dati.versione}/${f.nome}`)) no(`sito: ${pagina} ${v.chiave} senza link diretto (${f.url})`);
      if (!html.includes(`href="${f.url}"`)) no(`sito: ${pagina} il link di ${v.chiave} non è nell'elenco`);
    }
    const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
    try { if (JSON.parse(ld?.[1] || 'null')?.softwareVersion !== dati.versione) no(`sito: ${pagina} JSON-LD con un'altra versione`); } catch { no(`sito: ${pagina} JSON-LD non valido`); }
    for (const l of ['it', 'en', 'x-default']) if (!html.includes(`hreflang="${l}"`)) no(`sito: ${pagina} senza hreflang ${l}`);
    if (!html.includes(`id="versione">`) || !html.includes(dati.versione)) no(`sito: ${pagina} senza la versione scritta`);
    if (!/<section id="novita"/.test(html) || !html.includes(`data-versione="${dati.versione}"`)) no(`sito: ${pagina} senza le Novità della ${dati.versione}`);
    const risorse = [...attr(html, 'img', 'src'), ...attr(html, 'script', 'src'), ...attr(html, 'link', 'href')].filter(relativo).map((h) => unisci(pagina, h));
    for (const p of new Set(risorse)) await esiste(p, `sito ${pagina}`);
    // «Usa online» porta all'app
    if (!attr(html, 'a', 'href').some((h) => unisci(pagina, h) === '')) no(`sito: ${pagina} senza link all'app`);
  }
  for (const p of RISORSE_SITO) await esiste(p, 'sito');
  return problemi;
}

async function confronta(src, dir) {
  const locale = sorgente(dir);
  const diversi = [];
  for (const p of CONFRONTO) {
    const [a, b] = await Promise.all([src.get(p), locale.get(p)]);
    if (b.stato === 200 && !a.byte.equals(b.byte)) diversi.push(`online diverso dalla cartella costruita: /${p}`);
  }
  return diversi;
}

async function main(argv) {
  const conValore = new Set(['--versione', '--attendi', '--confronta']);
  const base = argv.find((a, i) => !a.startsWith('--') && !conValore.has(argv[i - 1]));
  if (!base) { console.error('Uso: node scripts/sito-verifica.mjs <cartella|https://…/> [--versione X.Y.Z] [--attendi secondi] [--confronta cartella]'); process.exit(2); }
  const opz = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const versione = opz('--versione') || null;
  const attendi = Number(opz('--attendi') || 0);
  const dir = opz('--confronta');
  const fine = Date.now() + attendi * 1000;
  for (let tentativo = 1; ; tentativo++) {
    const src = sorgente(base, { cacheBust: `${Date.now()}-${tentativo}` });
    const problemi = await verifica(src, { versione });
    if (dir && /^https:/.test(base)) problemi.push(...await confronta(src, dir));
    if (!problemi.length) {
      console.log(`✓ ${src.nome}: app e sito presenti${versione ? `, sito alla ${versione}` : ''}${dir ? ', uguali alla cartella costruita' : ''} (tentativo ${tentativo}).`);
      return;
    }
    if (Date.now() >= fine) {
      console.error(`✗ ${src.nome}: ${problemi.length} problemi`);
      for (const p of problemi) console.error(`  - ${p}`);
      process.exit(1);
    }
    console.log(`Tentativo ${tentativo}: ${problemi.length} problemi (${problemi[0]}); riprovo tra 20 s…`);
    await new Promise((r) => setTimeout(r, 20000));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
}
