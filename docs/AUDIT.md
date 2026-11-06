# Relazione di audit (novembre 2026, versione di partenza 2.1)

## Architettura trovata
- Un'unica pagina `index.html` (830 kB): HTML, CSS e JavaScript senza framework né compilazione. Il nucleo scientifico sta tra `/*CORE-START*/` e `/*CORE-END*/`; i benchmark lo eseguono direttamente da lì.
- Librerie da CDN: jsPDF 2.5.1 e JSZip 3.10.1; carattere Nunito da Google Fonts. Nessuna altra chiamata di rete.
- Pubblicata con GitHub Pages dal ramo `main`. Nessuna GitHub Action, nessun file di licenza.
- Test: benchmark in `test/*.js`, collaudo `test/ui-collaudo.js` lanciato a mano nel browser.

## Funzioni da preservare
Strumenti FTIR/ATR, Raman, UV-Vis, fluorescenza, HPLC, XRF, LIBS, TGA, DSC, NMR, EPR, generico. Importazione di file, cartelle e trascinamento (`.txt .asc .csv .dat .dpt .prn .xy .tsv .mca .spt .spe .sp .exp .jdx .dx .spa`, OPUS). Conversioni, linee di base (inviluppo, lineare, arPLS, SNIP), smoothing, derivate, raggi cosmici. Picchi, nomi, librerie, ipotesi, aree. Deconvoluzione, riferimenti, miscele NNLS, confronti, misure multi-campione, taratura, PLS, PCA, Ward. XRF a parametri fondamentali, standard, spessori. Falso colore. PDF, PNG, SVG, CSV, Excel per Origin, risultati e metodi. Rinomina, preset, ⌘K, selezione multipla, giro guidato, novità.

## Problemi trovati e stato
| Gravità | Problema | Stato |
|---|---|---|
| Alta | Offline si bloccavano tutte le esportazioni (librerie da CDN) | Corretto: `vendor/` |
| Alta | Un progetto `.acchiappa.json` poteva eseguire codice nella pagina (id e valori non protetti) e scrivere chiavi arbitrarie nel browser | Corretto, con test su un progetto ostile |
| Alta | Salvataggio legato a localStorage: con memoria piena si perdeva il lavoro senza avviso | Corretto: si salva dagli oggetti in memoria |
| Alta | «Sobrio» spento ricaricava la pagina e perdeva gli spettri | Corretto |
| Medio-alta | Stesso nome e stessi punti: la memoria di un file passava a un altro | Corretto per i nuovi salvataggi (controllo della dimensione) |
| Media | Apertura progetto non transazionale, nessuna nozione di modifiche non salvate | Corretto: si verifica tutto prima di toccare il lavoro corrente |
| Media | Impostazioni FP e miscele note perse alla riapertura (`cleanAn`) | Corretto |
| Alta | Errori scientifici: vedi [SCIENZA.md](SCIENZA.md) | Corretti i principali |

## Soluzione desktop scelta
Tauri 2: vedi [ARCHITETTURA.md](ARCHITETTURA.md).

## Rischi e limitazioni
Vedi [LIMITAZIONI.md](LIMITAZIONI.md).

## Metodo
Audit in sola lettura e revisione scientifica eseguiti da due sub-agenti separati. I risultati sono stati verificati sul codice prima di correggere; ciò che è stato davvero eseguito è in [COLLAUDO.md](COLLAUDO.md).
