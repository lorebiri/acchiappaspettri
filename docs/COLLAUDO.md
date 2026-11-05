# Collaudo

Che cosa è stato provato davvero e che cosa no. Ultimo aggiornamento: novembre 2026, ramo `desktop`.

## Test automatici (eseguiti su macOS, Apple Silicon)

| Prova | Comando | Esito |
|---|---|---|
| Test unitari: regressioni scientifiche, formato `.acchspettri` (anche ogni byte alterato), lingua, configurazione, importazione | `npm test` | 70 su 70 |
| Test del codice nativo | `cargo test` | 3 su 3 |
| Collaudo dell'interfaccia: pagina in italiano e in inglese, spazio di lavoro desktop, versione online leggera, identità dei risultati fra online e desktop | `PW_CHANNEL=chrome node test/ui-run.js` | vedi sotto |
| Benchmark picchi | `node test/peak-benchmark.js` | recall e precisione 100% su FTIR, Raman, HPLC e UV (200 spettri simulati ciascuno) |
| Benchmark aree e analisi | `node test/area-benchmark.js`, `node test/analysis-benchmark.js` | uguali alla versione precedente (confronto con il commit 70fad80) |
| Formati binari | `node test/format-test.js` | 6 su 6, su file costruiti dalle specifiche pubbliche |
| Collaudo dentro l'app nativa (WKWebView) | `node test/e2e/run-e2e.js` | vedi sotto |
| Aggiornamento firmato | `test/e2e/update-test.js`, `update-ui-test.js` | provato su macOS: firma valida installata (2.2.0 → 2.2.1); rifiutati firma alterata, pacchetto alterato e download interrotto |

## Cicli con i tester virtuali

Cinque cicli di prova, correzione e nuova prova, con nove profili più un agente scientifico e un agente di collaudo. Il dettaglio e i limiti sono in [ROADMAP.md](ROADMAP.md) e [LIMITAZIONI.md](LIMITAZIONI.md).

- **Dati usati**: tutti sintetici, generati dagli agenti con una verità nota. Nessun file reale di uno strumento.
- **Criterio di uscita**: nessun problema critico o alto realizzabile segnalato da nessun profilo. Raggiunto al ciclo 5.
- **Ricontrollato a ogni ciclo dall'agente scientifico**: il nucleo dei calcoli contro la versione precedente (benchmark identici, falsi raggi cosmici da 4 a 0 su 60) e l'identità fra online e desktop (24 file).

## Non provato

- Windows e Linux: nessuna esecuzione, nessun installer costruito qui. Li costruisce e li prova la pipeline di GitHub, che non è ancora stata eseguita.
- macOS su Intel.
- Menu nativi e scorciatoie cliccati a mano: il collaudo dentro l'app chiama le stesse funzioni, ma non il clic del sistema.
- File reali di strumenti, materiali certificati.
- Pubblicazione di una versione e aggiornamento da GitHub reale.
