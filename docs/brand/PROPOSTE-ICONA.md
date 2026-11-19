# Identità ibrida: icona e Gino

**Scelta di Lorenzo: variante C, «Il 3.0 con l'occhiolino».** È applicata ovunque (vedi «Come è fatta» in fondo). Le varianti A e B restano qui solo come archivio delle proposte e non si usano da nessuna parte.

Lorenzo ha scelto l'identità **ibrida**: un'unica icona che unisce Gino (il fantasmino dell'app online) e la curva dello spettro (l'icona 3.0 del desktop). Sotto, le tre proposte della fase 1.

| | Idea | Fondo |
|---|---|---|
| **A · Il picco è Gino** | La campana gaussiana è Gino: orlo ondulato, due occhi, le code diventano la linea di base. | blu online `#2563c9` |
| **B · Gino afferra la curva** | Gino stringe con le manine un tracciato giallo con un picco. Il più «simpatico». | blu scuro desktop `#1d3557` |
| **C · Il 3.0 con l'occhiolino** | L'icona 3.0 di oggi, ma il picco ha il corpo e gli occhi di Gino. Da lontano sobria, da vicino sorride. | blu scuro desktop `#1d3557` |

Consiglio dato in fase 1: **A**. È la più leggibile a 16 e 32 px (una sola sagoma bianca), è nuova e unica, e il blu online la lega all'app più usata. **C** è la scelta più prudente se il desktop deve restare molto «da laboratorio».

## File

- Anteprima completa (16, 32, 48, 128, 256, 512 px, fondo chiaro e scuro, tonda e quadrata, Dock di macOS, barra di Windows, scheda del browser, iOS e Android): [`anteprima-icona-ibrida.png`](anteprima-icona-ibrida.png)
- SVG di ogni variante in `proposte/`: `ibrida-x.svg` (quadrato arrotondato), `ibrida-x-tondo.svg` (Android, PWA), `ibrida-x-piccola.svg` (versione semplificata per 16 e 32 px, come le immagini piccole dentro .ico e .icns).
- Sorgente unico: `proposte/varianti.js`. Si rigenera tutto con:
  `node docs/brand/proposte/scrivi-svg.js && node docs/brand/proposte/genera-anteprima.js && node docs/brand/proposte/genera-mockup.js`
  (per i mockup con un'altra icona: `VARIANTE=B node docs/brand/proposte/genera-mockup.js`).

## Gino dentro l'interfaccia

Regola: **Gino accompagna i momenti di servizio, mai i risultati.**

- Sì: stato vuoto (nessun file), caricamento (Gino che acchiappa la curva), messaggi di successo ed errore, pagina 404, sito `scarica/`, finestra «Informazioni».
- No: grafici, tabelle dei picchi, PDF ed esportazioni, rapporti, testi scientifici, tooltip con valori. Lì restano solo l'icona piccola (barra del titolo) e un «Generato con Acchiappaspettri» neutro.
- Online: Gino a colori, con le pose `saluta`, `acchiappa`, `contento`, `preoccupato`, `perso` (`proposte/gino-pose.js`). Il pulsante «Sobrio» lo nasconde, come fa oggi.
- Desktop: Gino solo a contorno grigio-blu e piccolo, nelle stesse posizioni; i testi mantengono il tono professionale di `app/testi-desktop.js`.

Mockup: [`mockup-online.png`](mockup-online.png), [`mockup-desktop.png`](mockup-desktop.png), [`mockup-sito-404.png`](mockup-sito-404.png) (mostrano la variante A; i tocchi di Gino valgono uguali per tutte e tre).

## Come è fatta (fase 2)

- **Sorgente unico**: `brand/icona.svg` (quadrato arrotondato), `brand/icona-piccola.svg` (16-32 px), `brand/icona-tonda.svg`, `brand/icona-piena.svg` (tutta tela: iOS e PWA mascherabile). Si modificano solo questi.
- **Script**: `node scripts/icone.js` (Playwright con Chromium) rigenera tutto e scrive le impronte in `brand/icone.json`:
  - `src-tauri/icons/`: 32x32, 128x128, 128x128@2x, icon.png, `icon.ico` (16-256), `icon.icns` (16-1024 con le @2x), `icona.svg`. Da qui Tauri prende finestra, installer NSIS, .app/.dmg, AppImage e .deb (`bundle.icon` in `tauri.conf.json`);
  - app online: favicon PNG e SVG in data URI e marchio nell'intestazione di `index.html`, `apple-touch-icon.png`, `manifest.webmanifest` e `icone/` (PWA, con icona mascherabile), meta Open Graph con `icone/og.jpg`;
  - sito: `scarica/icona.svg` (lo usano anche `scarica/en/`), `404.html` del sito con icona e Gino in linea.
- **Test**: `test/unit/icone.test.js` verifica che i disegni in `brand/` siano quelli generati, che ogni file coincida con la sua impronta, che `.ico` e `.icns` contengano le stesse immagini dei PNG, che app online, PWA, sito, 404, Open Graph e README usino la stessa icona.
- **Gino**: le pose sono in `app/gino.js` (`saluta`, `acchiappa`, `contento`, `preoccupato`, `perso`).
  - online: nell'avviso in basso, preoccupato per errori e avvisi, contento per le conferme (nessun Gino per i messaggi neutri); «Sobrio» lo nasconde. Restano il fumetto, il caricamento e il giro guidato di prima;
  - desktop: a contorno grigio-blu nella zona vuota «Trascina qui file o cartelle» e accanto agli errori di lettura; nessun testo che lo nomina, avvisi e barra di stato restano neutri;
  - mai su grafici, tabelle, PDF, esportazioni e testi scientifici.
- **Schermate reali** dopo le modifiche: `docs/brand/schermate/` (si rifanno con `node docs/brand/schermate.js`).
