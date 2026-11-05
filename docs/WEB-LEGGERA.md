# Versione online leggera

Online e desktop eseguono lo stesso `index.html`. La versione online è pensata per Fast-Plotting e Fast-Consulting: importare, guardare, confrontare, riconoscere i picchi, assegnare i composti, senza installare nulla.

**Nulla è stato rimosso dal codice.** Le funzioni di studio sono nascoste online e si riaprono con «Mostra qui» o dalle Impostazioni. Il desktop non riceve mai la classe `web`.

| Funzione | Online | Desktop |
|---|---|---|
| Importazione, elenco, grafico, zoom, confronti | in vista | in vista |
| Picchi, suggerimenti, libreria dei nomi | in vista | in vista |
| Riferimenti (HQI), ipotesi, controllo del dato | in vista | in vista |
| Calibrazione XRF e parametri dello strumento (servono ai suggerimenti) | in vista | in vista |
| Elaborazioni, assi, differenza, zona | in vista | in vista |
| Analisi per tecnica (DSC, TGA, EPR…) | in vista | in vista |
| Progetti | in vista | in vista |
| Deconvoluzione | in vista, senza quella di gruppo | completa |
| Misura di banda su più spettri | solo misura | con taratura |
| Retta di taratura, PLS, PCA e cluster | «Mostra qui» | in vista |
| Miscele di riferimenti | «Mostra qui» | in vista |
| Composizione XRF, spessori, standard | «Mostra qui» | in vista |
| Immagini multibanda | «Mostra qui» | in vista |

Un progetto che usa queste funzioni le mostra da solo all'apertura, e una foto trascinata apre comunque il suo pannello. I risultati calcolati in una sessione precedente e non rifatti si conservano in `results/precedenti/` al salvataggio.

## Regole

- `app/web.css`: ogni selettore inizia con `html.web` e non può nominare `#pkTable`, `#anHyp`, `#refMatches`, `#libList`, `#xrfBox`, `#instrBox`. C'è un test.
- `app/web.js`: chiude solo ciò che il CSS non può chiudere (palette, ricette).
- Prima di nascondere altro: controllare il grafo delle chiamate da `suggest`, `hypotheses`, `xrfElements`, `findPeaks`, `refMatches`. Le funzioni nascoste oggi non vi compaiono.
- `test/ui-run.js` confronta online e desktop su picchi, aree, suggerimenti, ipotesi e controlli: devono essere identici.

## Cosa non cambia

Il peso scaricato: il CSS non fa risparmiare byte. Il guadagno è di attenzione, non di tempo di caricamento. Caricare `jsPDF` e il dizionario inglese solo quando servono ridurrebbe l'attesa su reti lente, circa 340 ms su 1650 misurati con rete a 10 Mbit e processore rallentato: è in [ROADMAP.md](ROADMAP.md).

Le funzioni nascoste restano disponibili finché il desktop non è scaricabile: per questo «Mostra qui» è in primo piano e l'invito al desktop non promette un installer che non esiste.
