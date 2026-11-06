# Il progetto dello spazio di lavoro desktop

La versione desktop non è la pagina dentro una finestra: è uno spazio di lavoro per chi passa ore sugli spettri. L'idea di fondo viene dai programmi scientifici come Origin (menu, pannelli, documenti, stato sempre visibile), ma disegno, nomi e flussi sono originali. Nessun elemento grafico è stato copiato.

La versione online resta com'è: guidata, un passo alla volta, adatta a chi la apre per la prima volta. Ogni regola di `app/shell.css` inizia con `html.shell`, e un test controlla che la pagina online non cambi.

## Com'è fatta

```
┌ Menu nativo: File  Modifica  Vista  Analisi  Aiuto ─────────────────────┐
├ Barra strumenti ─────────────────────────────────────────────────────── ┤
├────────────┬ Inizio · Grafico · Foglio dati · Più campioni · Esporta ┬───┤
│ Spettri    │                                                         │ I │
│ del        │  documento: grafico, tabella, confronto                 │ s │
│ progetto   │                                                         │ p │
│            ├ Picchi · Controllo del dato · Ipotesi · Deconvoluzione  ┤ e │
│            │ Parametri · Messaggi                                    │ t │
├────────────┴─────────────────────────────────────────────────────────┴───┤
│ messaggio │ x y del cursore │ intervallo │ elaborazioni │ inclusi │ salvato│
└──────────────────────────────────────────────────────────────────────────┘
```

| Scelta | Perché |
|---|---|
| **Tema chiaro come predefinito**, scuro a scelta | Nei laboratori si lavora spesso in stanze illuminate e sulle stampe; lo scuro resta disponibile |
| **I grafici restano bianchi anche nel tema scuro** | Ciò che si vede è ciò che finisce nell'articolo |
| **13/12/11 px, controlli da 28 px, angoli di 3 px** | Densità da strumento di lavoro: più dati sullo schermo, poche decorazioni |
| **Niente mascotte, coriandoli né istruzioni passo per passo** | Restano nella pagina online, dove servono a chi inizia |
| **Risultati sotto il grafico, proprietà a destra** | Si guarda il picco e il suo numero insieme, senza cambiare scheda |
| **Barra di stato con la catena di elaborazione** | Si vede sempre che cosa è stato fatto al dato |
| **Foglio dati virtuale** | Migliaia di righe senza rallentare; copia e CSV |
| **Pannelli ridimensionabili e modalità focus** | Da 1024×640 a schermi molto grandi; le misure dipendono dalla risoluzione |
| **Menu nativi del sistema** | Scorciatoie e posizione che chi usa quel sistema si aspetta |

## Come è costruito

La regola era non riscrivere: i calcoli e i pannelli sono quelli della pagina, una sola copia.

- `app/shell-boot.js` mette la classe `html.shell` prima che la pagina si disegni, solo nell'app (o con `window.ACCH_SHELL_PREVIEW`, usato dal collaudo).
- `app/shell.css` dispone il contenuto esistente: `#v2`, `.bench` e `#workCard` diventano `display:contents`, così i pannelli si collocano con posizioni fisse senza spostarli nel documento. La geometria viene dalle variabili `--T --D --S --L --R --B`.
- `app/shell.js` aggiunge barra strumenti, schede, pannello risultati e barra di stato. Sposta soltanto elementi foglia (`.pktools`, `.pkwrap`, `#anQual`, `#anHypWhy`, `#anHyp`, `#fitOut`, `#anTech`, il pannello di confronto, `#pvTitle`, `#viewSeg`, `#cmdBtn`).
- Le funzioni della pagina (`go`, `openTab`, `addEntries`, `setView`, `reveal`, `say`, `toast`, `renderPreview`, `drawOverlay`, `runFitUI`) vengono avvolte per aggiornare l'interfaccia, mai i valori.

Un primo tentativo spostava interi contenitori e rompeva il confronto fra spettri: per questo si è passati alla disposizione con il CSS.

## Limiti noti

- Il grafico resta il disegno su canvas della pagina: zoom, selezione e cursore ci sono, ma le annotazioni libere e l'intervallo Y manuale no (vedi [ROADMAP.md](ROADMAP.md)).
- Le schede documento sono fisse: non si aprono due grafici affiancati in finestre separate.
- L'aspetto è stato controllato su macOS (WebKit) e in Chrome (Chromium). Windows e Linux non sono stati provati.
