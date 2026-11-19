# Identità ibrida: proposte di icona (fase 1)

Lorenzo ha scelto l'identità **ibrida**: un'unica icona che unisce Gino (il fantasmino dell'app online) e la curva dello spettro (l'icona 3.0 del desktop). Qui ci sono tre proposte da cui scegliere. Niente è ancora applicato all'app.

| | Idea | Fondo |
|---|---|---|
| **A · Il picco è Gino** | La campana gaussiana è Gino: orlo ondulato, due occhi, le code diventano la linea di base. | blu online `#2563c9` |
| **B · Gino afferra la curva** | Gino stringe con le manine un tracciato giallo con un picco. Il più «simpatico». | blu scuro desktop `#1d3557` |
| **C · Il 3.0 con l'occhiolino** | L'icona 3.0 di oggi, ma il picco ha il corpo e gli occhi di Gino. Da lontano sobria, da vicino sorride. | blu scuro desktop `#1d3557` |

Consiglio: **A**. È la più leggibile a 16 e 32 px (una sola sagoma bianca), è nuova e unica, e il blu online la lega all'app più usata. **C** è la scelta più prudente se il desktop deve restare molto «da laboratorio».

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

## Fase 2 (dopo la scelta)

Uno script ripetibile genera dall'SVG scelto tutte le icone (src-tauri/icons con .icns e .ico, installer e .deb, favicon e apple-touch dell'app online, manifest e PWA, `scarica/`, immagini Open Graph, README), più un test che verifica che coincidano ovunque. La logica scientifica non si tocca.
