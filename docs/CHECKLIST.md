# Checklist dei requisiti (versione 2.2.0)

Riferimento unico fino alla pubblicazione. Legenda: ✅ fatto e verificato · 🟡 fatto, verifica parziale (motivo indicato) · ⛔ non verificabile qui (motivo indicato) · ⬜ da fare.
«Verificato» indica sempre *come*: test automatico (CI o locale), collaudo degli agenti virtuali in Chrome, oppure prova su hardware reale. Gli agenti sono tester simulati, non persone reali: nessuna validazione da parte di ricercatori dell'ICCOM.

## Prodotto
| Requisito | Stato | Come è verificato |
|---|---|---|
| Versione online leggera (Fast-Plotting, Fast-Consulting) con import, grafici, Peak Recognizing, assegnazione dei composti, riferimenti, confronto | ✅ | test di interfaccia (38), agenti D, UX, architetto |
| Strumenti avanzati online raggiungibili con «Mostra qui», mai tolti | ✅ | WEB-LEGGERA.md, test «nell'alleggerimento non si nasconde…» |
| Desktop con interfaccia propria (barra degli strumenti, pannelli, ispettore, barra di stato, menu nativi) | ✅ | DESIGN-DESKTOP.md, test desktop, architetto |
| Formato `.acchspettri` (ZIP documentato, schema versionato, migrazioni, impronta SHA-256) | ✅ | FORMATO-ACCHSPETTRI.md, 15 test del formato, salvataggio/riapertura degli agenti |
| Italiano e inglese; scelta al primo avvio (e nell'installer Windows), salvata, modificabile | ✅ | test i18n (tutti i testi tradotti), agenti in inglese |
| Avvisi scientifici con cautela (ipotesi, «inconclusiva/parziale/plausibile», stime distinte da risultati) | ✅ | agenti scientifici (C, HPLC, NMR/teorica, beni culturali, generale) |
| Dati originali non modificati, elaborazioni distinguibili, tracciabilità | ✅ | test byte per byte, tracciabilita.csv |
| Privacy: offline, nessun dato scientifico inviato, controllo aggiornamenti senza dati dei progetti | ✅ | AGGIORNAMENTI.md, test sul controllo degli aggiornamenti |

## Distribuzioni
| Pacchetto | Stato | Come è verificato |
|---|---|---|
| Online (GitHub Pages da `main`) | ⬜ | da pubblicare con il merge |
| Windows `.exe` (NSIS), Windows 10 e 11 | 🟡 | CI su Windows Server 2025: installazione, avvio 20 s, menu Start, disinstallazione. Windows 10 reale non disponibile |
| macOS Apple Silicon `.dmg` | 🟡 | CI su macos-latest (ARM): build e collaudo dentro l'app. Mac reale: prova a mano |
| macOS Intel `.dmg` | 🟡 | CI su macos-15-intel: build nativa e collaudo dentro l'app |
| Linux AppImage e `.deb` | 🟡 | CI su Ubuntu 22.04: build e collaudo dentro l'app |
| GitHub Releases con `latest.json` firmato per ogni piattaforma | ⬜ | release.yml al tag v2.2.0 |
| Aggiornamento con conferma, firma verificata, pacchetto per architettura | 🟡 | test della configurazione; prova vera possibile solo dalla seconda versione pubblicata |

## Ciclo di collaudo (criterio di uscita)
| Agente | Ultimo esito |
|---|---|
| C (scientifico) | nulla di realizzabile (ciclo 15) |
| D (QA web e desktop) | nulla di realizzabile (ciclo 10) |
| HPLC | in corso |
| NMR/EPR e chimica teorica | in corso |
| Generale e chimico analitico | in corso |
| Beni culturali, XRF senza standard, qualitativa multi-tecnica | in corso |
| Architetto | in corso |
| UI/UX | in corso |
| Ricercatore senior Windows 10 | in corso (in Chrome con Windows simulato; Windows 10 reale non disponibile) |

## Non verificabile in questo ambiente
- Windows 10 reale (SmartScreen, finestra della lingua dell'installer, DPI reale, WebView2 mancante, antivirus): lista di controllo in [COLLAUDO.md](COLLAUDO.md), da eseguire a mano.
- Firma Apple e Microsoft: non disponibili, avvisi al primo avvio documentati in [INSTALLAZIONE.md](INSTALLAZIONE.md).
- Aggiornamento reale da una versione pubblicata alla successiva: possibile solo dopo la seconda release.
