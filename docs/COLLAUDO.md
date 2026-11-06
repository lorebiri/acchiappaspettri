# Collaudo

Che cosa è stato provato davvero e che cosa no. Ultimo aggiornamento: novembre 2026, versione 2.2.0.
Per ogni prova è indicato *dove* è stata eseguita: sul Mac di sviluppo (Apple Silicon), nella pipeline di GitHub (macchine virtuali di GitHub), oppure dai tester virtuali in Chrome. **Nessuna prova è stata fatta su un PC con Windows 10 reale.**

## Test automatici

| Prova | Comando | Dove | Esito |
|---|---|---|---|
| Test unitari: regressioni scientifiche, riconoscimento della tecnica, formato `.acchspettri` (anche ogni byte alterato), lingua, configurazione, importazione | `npm test` | Mac e GitHub | 82 su 82 |
| Test del codice nativo | `cargo test` | GitHub (tre sistemi) | superati |
| Collaudo dell'interfaccia: pagina in italiano e in inglese (1290 operazioni), spazio di lavoro desktop (1511 operazioni), versione online leggera, identità dei risultati fra online e desktop | `PW_CHANNEL=chrome node test/ui-run.js` | Mac e GitHub | 38 su 38 |
| Benchmark picchi | `node test/peak-benchmark.js` | Mac e GitHub | recall e precisione 100% su FTIR, Raman, HPLC e UV (200 spettri simulati ciascuno) |
| Benchmark aree e analisi | `node test/area-benchmark.js`, `node test/analysis-benchmark.js` | Mac e GitHub | uguali alla versione di riferimento (commit 70fad80); i falsi raggi cosmici scendono da 4 a 0 |
| Formati binari | `node test/format-test.js` | Mac e GitHub | 6 su 6, su file costruiti dalle specifiche pubbliche |
| Collaudo dentro l'app nativa (WebView del sistema) | `node test/e2e/run-e2e.js` | GitHub: Windows Server 2025, macOS Apple Silicon, macOS Intel (macchina Intel nativa), Ubuntu 22.04 | superato sui quattro |
| Installazione reale su Windows | passo della pipeline | GitHub: Windows Server 2025 | installazione per l'utente, avvio e app ancora aperta dopo 20 s, voce nel menu Start, disinstallazione, voce del menu Start rimossa |
| Pacchetti costruiti | pipeline | GitHub | `.exe` (NSIS), `.dmg` Apple Silicon, `.dmg` Intel, AppImage, `.deb` |
| Aggiornamento firmato | `test/e2e/update-test.js`, `update-ui-test.js` | Mac | firma valida installata (2.2.0 → 2.2.1 di prova); rifiutati firma alterata, pacchetto alterato e download interrotto |

## Cicli con i tester virtuali

Diciassette cicli di prova, correzione e nuova prova. I tester sono **sub-agenti con un profilo**, non persone reali, e non rappresentano né i ricercatori a cui i profili si ispirano né una validazione dell'ICCOM. Hanno usato solo dati sintetici, generati con una verità nota.

| Profilo | Che cosa ha provato |
|---|---|
| Agente scientifico (C) | nucleo dei calcoli contro la versione di riferimento, importazione, riconoscimento della tecnica (42 intestazioni), forme dei picchi, identità online/desktop |
| Agente di collaudo (D) | flusso completo web e desktop, recupero, telefono, confronto, PDF, salvataggio e riapertura, inglese, tema scuro |
| NMR/EPR e chimica teorica | integrali, riferimento, formati, unità del campo, fattore g, doppio integrale, dati calcolati |
| Ricercatore generale e chimico analitico | FTIR, Raman, UV, HPLC; tarature, LOD/LOQ, pesi, ruoli; CSV, PDF, metodi; progetti |
| Beni culturali, XRF senza standard, qualitativa multi-tecnica | elementi XRF, righe coincidenti, parametri fondamentali, spessori, standard, LIBS, pigmenti Raman, falso colore, miscele |
| HPLC qualitativa e quantitativa | coeluizioni, code, bordi, standard e impurezze, falsi allarmi, 25 formati, battitura nei campi |
| Ricercatore senior (Windows simulato) | percorso completo di un utente alle prime armi in Chrome con piattaforma Win32 e finestra 1366×768 al 125%: download, primo avvio, invecchiamento FTIR e UV, andamento, PDF, CSV, progetto |
| Architetto e UI/UX | qualità visiva a 375, 1024, 1440 e 2560 px, chiaro e scuro, italiano e inglese; accessibilità; usabilità |
| Agente Capo Progetto | valutazione complessiva per conto del committente e decisione di rilascio |

- **Criterio di uscita**: nessun difetto medio o superiore realizzabile da nessun profilo, correzioni verificate da chi le aveva segnalate, test automatici superati. I limiti che restano sono in [LIMITAZIONI.md](LIMITAZIONI.md).

## Non provato

- **Windows 10 reale**: SmartScreen, finestra della lingua dell'installer, DPI reale, WebView2 mancante, antivirus dell'ente, Excel italiano. Vedi la lista qui sotto.
- **Mac reali**: le prove sui Mac sono nelle macchine virtuali di GitHub; l'avviso di Gatekeeper per un'app non autenticata va provato a mano.
- **Aggiornamento da una versione pubblicata alla successiva**: possibile solo dalla seconda versione pubblicata (la 2.2.1).
- **I pacchetti pubblicati**: la pipeline di pubblicazione li ricostruisce dopo i test; vanno scaricati e installati dopo la pubblicazione.
- File reali di strumenti, materiali certificati.

## Lista di prova su Windows 10 (da fare a mano)

Con l'installer della pipeline (artefatto `installer-windows`) o quello pubblicato:

1. Avvio dell'installer: «PC protetto» → *Ulteriori informazioni* → *Esegui comunque*.
2. Lingua scelta nell'installer, poi ritrovata nell'app.
3. Installazione senza privilegi di amministratore; voce nel menu Start.
4. Avvio con lo schermo al 125% e al 150%: testi non sfocati né tagliati.
5. Nei campi della banda di «Più campioni»: virgola decimale, Canc, frecce, Tab.
6. Trascinare una cartella di file nella finestra.
7. Salvare un `.acchspettri`, chiudere e riaprirlo con doppio clic.
8. Aprire in Excel italiano un CSV esportato: decimali e lettere accentate corretti.
9. L'antivirus dell'ente non mette in quarantena l'app.
10. Impostazioni → controllo degli aggiornamenti attivo e senza errori.
11. Disinstallazione dalle Impostazioni di Windows.
