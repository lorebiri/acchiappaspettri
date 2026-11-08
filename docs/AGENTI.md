# Agenti di collaudo: regole comuni e ruoli

Fondamenta per ogni ciclo di collaudo con agenti virtuali. Ogni istruzione data a un agente richiama questo file e lo prevale su abitudini dei cicli precedenti.

## Contesto
- Acchiappaspettri sta per essere consegnato a gruppi di ricerca del CNR: chimici, fisici, conservatori, quasi mai informatici. Usano Windows 10/11 al 125–150%, Mac, a volte Linux; esportano in Excel e scrivono relazioni e articoli. Un numero sbagliato detto con sicurezza costa più di una funzione mancante.
- Due prodotti da un solo `index.html`: la versione **online** leggera (GitHub Pages) e l'app **desktop** Tauri 2 (`.exe`, `.dmg` Apple Silicon e Intel, AppImage, `.deb`) con formato `.acchspettri`, italiano/inglese e aggiornamenti firmati.
- La pubblicazione della 2.2.0 è stata bloccata da un controllo della pipeline (voce del menu Start su Windows) che passava per caso: era verde nelle esecuzioni precedenti e nessun agente l'aveva mai letto. **Verde una volta non vuol dire affidabile.** Tutto ciò che decide se si pubblica (test, script, pipeline, controlli dei pacchetti) va esaminato come il resto del prodotto.

## Regole comuni
1. **Indipendenza.** Non fidarti di rapporti precedenti, documenti, commenti nel codice o di ciò che dice il coordinatore: verifica. Un'affermazione nei documenti che non riesci a confermare è un difetto dei documenti.
2. **Esplorazione libera, non solo ricontrollo.** Oltre ai punti assegnati, dedica almeno metà del lavoro a cercare problemi nuovi nel tuo campo, con casi avversi: dati sporchi, limiti, combinazioni insolite, interruzioni, ripetizioni, lingue, temi, finestre piccole.
3. **Prova per ogni affermazione.** Ogni difetto ha passi riproducibili e la prova (script, comando con output, screenshot). Ogni «funziona» dice come è stato provato e con quanti casi.
4. **Ripetizione.** Ciò che decide se si pubblica o un risultato numerico si esegue almeno tre volte; un esito che cambia tra un'esecuzione e l'altra è un difetto (instabile), anche se passa due volte su tre.
5. **Test che passano per il motivo sbagliato.** Nel tuo campo, leggi i test e i controlli esistenti: asserzioni deboli, attese a tempo fisso, dipendenze dall'ordine, casi non coperti sono difetti da segnalare.
6. **Gravità.** CRITICO = risultato scientifico sbagliato senza avviso, perdita di dati, pubblicazione rotta o insicura. ALTO = errore probabile per un utente normale, o un controllo di rilascio inaffidabile. MEDIO = ostacolo serio o messaggio fuorviante. BASSO = rifinitura. Segnala anche i BASSI.
7. **Criterio di uscita.** «Nulla da segnalare» si può dire solo con l'elenco di ciò che hai provato (scenari, numeri, piattaforme) e se nessun difetto realizzabile di qualsiasi gravità resta aperto. Ciò che non è verificabile qui va elencato a parte, non taciuto.
8. **Onestà.** Etichetta tutto come ESEGUITO, DEDOTTO DAL CODICE o NON VERIFICATO. Mai risultati inventati; dati sintetici sempre dichiarati come tali.
9. **Identità.** Gli agenti sono tester virtuali con un profilo, non persone reali: nessuna impersonazione, nessuna dichiarazione attribuita, nessuna validazione dell'ICCOM o di altri.
10. **Limiti.** Non modificare il repository né la copia congelata; lavora in una cartella tua sotto `~/build/`. Non pubblicare, non fare push, non creare tag o release. Non leggere né copiare `~/.tauri/` (chiave di firma). Non usare il Chrome personale dell'utente: Playwright con `PW_CHANNEL=chrome` apre un'istanza propria. Non caricare dati da nessuna parte.

## Strumenti
- Copia congelata: `~/build/acch-test` (Node in `/opt/homebrew/bin`). `npm test`; `PW_CHANNEL=chrome node test/ui-run.js`; benchmark in `test/`.
- Desktop nel browser: `window.ACCH_SHELL_PREVIEW=true` prima del caricamento (esempi in `test/ui-run.js`).
- Pacchetti veri della pipeline: `~/build/ci-art-9bc535e/` (scaricati dalla CI). Log: `gh run list -R lorebiri/acchiappaspettri`, `gh run view <id> --log`.
- Repository in sola lettura: `git -C <repo> log/show/diff`.

## Ruoli
| Ruolo | Campo |
|---|---|
| C, scientifico | nucleo dei calcoli, importazione, riconoscimento della tecnica, benchmark, identità online/desktop |
| D, QA web e desktop | flussi completi, salvataggio e riapertura, errori in console, regressioni |
| HPLC | picchi, integrazione, coeluizioni, tarature, quantificazione |
| NMR/EPR e chimica teorica | integrali, riferimenti, campo, fattore g, dati calcolati |
| Beni culturali, XRF, qualitativa | elementi, righe sovrapposte, FP senza standard, pigmenti, multi-tecnica |
| Generale e chimico analitico | FTIR, Raman, UV, tarature, LOD/LOQ, esportazioni, metodi |
| Ricercatore senior Windows 10 | percorso di un non informatico, dalla pagina online al PDF |
| Architetto | qualità visiva, coerenza, accessibilità |
| UI/UX | usabilità, comportamenti, messaggi, tastiera, prestazioni |
| Ingegnere di rilascio | pipeline, script, pacchetti veri, `latest.json`, aggiornamenti, stabilità dei controlli; release candidata; identità dei risultati tra i motori web (R4); licenze nei pacchetti |
| Revisore dei documenti | ogni affermazione dei documenti confrontata con la realtà; VALIDAZIONE.md, licenza, visione, ROADMAP, tutorial |
| Implementatore della validazione | **scrive** solo in `test/strd/`, `test/fixtures/`, `test/corpus/`, `test/validation/`, `scripts/gen-validazione.js`, sul ramo `agente/validazione`: prove automatiche R1–R9 (NIST StRD, fixture R/scipy, corpus di file avversi, fedeltà delle esportazioni, casi limite, riferimenti golden) |
| Validatore numerico indipendente | ricalcola le prove R1–R9 con strumenti propri (mpmath, scipy, R) e dimostra che falliscono su copie sabotate |
| Licenze e conformità open source | licenze di tutte le dipendenze, avvisi nei pacchetti, LICENSE, CITATION.cff; ciò che richiede un parere legale resta NON VERIFICATO |
| Documentazione per gli utenti | **scrive** solo in `docs/tutorial/` e `examples/`, sul ramo `agente/tutorial`: tutorial veri nel programma, con dati sintetici |
| Sviluppatore della libreria e dei canali | **scrive** solo in `app/channels.js`, `app/library.js`, nei loro test e in `test/corpus/hplc-canali/`, sul ramo `agente/libreria` creato da `desktop` dopo il tag v2.2.0: caricatore multicanale (2.2.1) e libreria dei picchi (2.3); gli agganci nel nucleo li fa il coordinatore |
| Ingegnere dell'infrastruttura GitHub | tutta la struttura su GitHub: workflow, azioni e loro versioni, permessi, segreti (solo i nomi), rami, tag, release, Pages, cache, impostazioni del repository, robustezza della pipeline agli errori di rete; **scrive** solo in `.github/` e negli script della pipeline (`scripts/check-packages.js`, `scripts/publish-release.js`, `scripts/minisign-verify.js`, `scripts/windows-install-test.ps1`, `test/benchmark-gate.js`), in un clone proprio sul ramo `agente/github`, su cui può fare push e avviare la CI; non crea tag o release, non cancella nulla e non cambia impostazioni: le propone al committente |
| Capo Progetto | rappresenta il committente; decide priorità, squadra degli agenti e pubblicazione |

Architetto e UI/UX lavorano come un solo agente «esperienza d'uso». Dalla 2.3 sono obbligatori: prestazioni e grandi dati, accessibilità, sviluppatore delle funzioni avanzate (moduli nuovi), statistico. Dopo la 2.2.0 si aggiunge l'**analista comparativo** (sola lettura): esegue gli stessi compiti su dati sintetici e pubblici con i programmi di riferimento accessibili (versioni di prova, con scipy e R come riferimento numerico) e pubblica solo i nostri dati e i nostri tempi, nel rispetto delle licenze d'uso di quei programmi. La documentazione per gli utenti diventa «didattica»: tutorial e casi d'uso.

**Chi scrive codice.** Solo il coordinatore modifica `index.html`, `app/`, `src-tauri/`, `.github/` e gli script di rilascio, e unisce i rami degli agenti dopo la revisione. Gli agenti che scrivono lavorano nel proprio ramo e solo nei file del loro perimetro. Chi costruisce una prova non è chi la verifica.

## Visione e affidabilità (committente)
Acchiappaspettri vuole essere lo strumento che **ogni ricercatore sceglie** per i propri dati spettrali e cromatografici, preferito anche ai programmi a pagamento (Origin, MestReNova, Chromeleon/OpenLab, PeakFit, Igor, Excel), perché è **gratuito e aperto**, **più potente** nei campi dei ricercatori e porta **dal file al risultato pubblicabile** in meno tempo, con meno errori e con l'incertezza sempre dichiarata. La potenza non toglie mai semplicità: guidato per chi inizia, completo per chi sa. (Messaggio del committente, 8 novembre 2026: «contro ogni aspettativa comune e contro ogni classico software di elaborazione dati a pagamento… voluto da tutti i ricercatori. Potentissimo.»)

Affidabilità almeno al livello di OriginLab, misurata dalle prove R1–R9 del Capo Progetto (validazione su dati certificati NIST con LRE, ripetibilità, identità tra motori, nessun numero sbagliato senza avviso, esportazioni uguali allo schermo, casi limite, stabilità tra versioni, rapporto di validazione pubblicato).

**Aspetto dell'intera applicazione (committente, 8 novembre 2026: «grafica potentissima, con visuali spettacolari e fluide», «un po' di motion»; riguarda l'interfaccia del programma, online e desktop, non le esportazioni).** Requisiti del Capo Progetto, misurati anche su un PC di riferimento modesto (Windows 10, i3/i5 di 7ª generazione, 8 GB, grafica integrata, 1366×768 al 125%; in CI processore rallentato ×4):
- **V1 sistema di design**: un solo insieme di variabili CSS (colori, spaziature, raggi, ombre, tipografia, durate e curve delle animazioni); nessun colore o misura scritti a mano fuori dalle eccezioni elencate (controllo in CI); icone di un solo stile, senza emoji nei comandi; stessi componenti online e desktop.
- **V2 fluidità**: risposta ai comandi ≤ 100 ms (95° percentile); nessun blocco oltre 50 ms nell'uso normale; ≥ 50 fps in zoom, trascinamento, apertura dei pannelli e passaggi tra viste.
- **V3 leggibilità**: contrasto WCAG AA (≥ 4,5:1 per il testo) in entrambi i temi, il tema scuro curato quanto il chiaro; testo ≥ 13 px a 125–150%; nessun testo tagliato da 375 a 2560 px.
- **V4 movimento**: serve a far capire, mai a decorare. Piccole interazioni ≤ 120 ms, passaggi tra viste ≤ 250 ms, comparsa ≤ 400 ms; zoom e trascinamento morbidi; riscontro delle azioni una volta sola; animazione didattica di base, fit e deconvoluzione solo su richiesta («Mostrami come»). Mai nei numeri, nelle tabelle, durante la digitazione, mai in ciclo continuo. Un clic porta subito allo stato finale e viene eseguito; si spegne da sola se il PC non regge 50 fps; `prefers-reduced-motion` e l'impostazione «Animazioni: sì / ridotte / no»; lo stato finale coincide al pixel con il disegno senza animazione.
- **V5 cura degli stati**: benvenuto, stati vuoti, caricamento, errori e avvisi ⛔ disegnati, non lasciati di ripiego.
- **V6 giudizio dei ricercatori pilota**: estetica ≥ 4/5, SUS ≥ 80, almeno il 70% preferisce la versione nuova nel confronto prima/dopo alla cieca.
- **Grafico a schermo**: G1 fluidità (≥ 50 fps con 1 milione di punti e 20 spettri sovrapposti), G2 prontezza (primo grafico ≤ 1 s per 100 mila punti, ≤ 3 s per 1 milione), G3 correttezza (la riduzione dei punti per lo schermo conserva minimi e massimi: un picco stretto non sparisce mai), G5 interattività (mirino, cursori con Δx e Δy, viste collegate, spettri a cascata, mappe; 3D solo dove serve ai dati).
- **Familiarità**: comandi, nomi e posizioni restano gli stessi; nella 2.3 si può tornare all'aspetto precedente dalle Impostazioni, e «Che cosa è cambiato» compare nelle Novità.
- **Misura in CI (che fallisce)**: confronto visivo a pixel su almeno 40 schermate (2 temi × 2 lingue × online e desktop × 5 larghezze), controllo dei token, contrasto calcolato, prove V2 con processore rallentato. Le immagini di riferimento si aggiornano solo con l'approvazione del designer e del Capo Progetto.
- **Agenti**: designer visivo (scrive solo in `app/design/`, bozze e documenti: sistema di design, bozze in chiaro e scuro, specifiche del movimento); sviluppatore della visualizzazione (applica token e movimento all'interfaccia e al grafico, in `app/render/` e `app/design/`); l'esperienza d'uso verifica V1–V5 e la familiarità. Le figure per la pubblicazione (G4) sono una voce separata della 2.3 a priorità più bassa; il revisore delle figure è rinviato a quel lavoro.

## Criterio di uscita per pubblicare (approvato dal committente)
Zero CRITICI e zero ALTI realizzabili aperti; ogni MEDIO corretto con prova o scritto in LIMITAZIONI/ROADMAP con l'approvazione del Capo Progetto; BASSI in ROADMAP; prove R1–R9 verdi. Gli agenti segnalano comunque tutto (regola 7); un difetto grave nuovo va al triage del Capo Progetto. **Dalla 2.3** ogni funzione nuova si pubblica solo se, sui benchmark pubblici, è almeno pari ai programmi di riferimento in accuratezza (LRE) e non più lenta nel tempo per arrivare al risultato.

**Come si misura «voluto da tutti».** Gli agenti non sono persone: servono ricercatori veri, in un gruppo pilota di 10–20 persone di laboratori diversi, con consenso. Obiettivi: SUS ≥ 80; almeno il 90% dei compiti riusciti senza aiuto; tempo per arrivare al risultato al massimo la metà di quello del programma abituale su 5 compiti tipo (indice FTIR, taratura HPLC, deconvoluzione, XRF, NMR); R1–R9 estesi a ogni funzione nuova; benchmark pubblici e riproducibili nel repository; adozione misurata senza telemetria (download, citazioni con il DOI Zenodo, issue, questionario volontario).

## Fine di ogni ciclo
1. Tutti gli agenti consegnano il rapporto; il coordinatore corregge e fa riverificare a chi aveva segnalato.
2. Il Capo Progetto riceve **tutti** i rapporti integrali (non riassunti) e l'elenco delle correzioni con le loro prove.
3. Il Capo Progetto decide se serve un altro ciclo, con quali agenti e su che cosa, oppure se si può pubblicare (APPROVATO / NON ANCORA APPROVATO / APPROVATO CON LIMITAZIONI DOCUMENTATE). Il coordinatore non chiude un ciclo e non pubblica senza questa decisione.

## Formato del rapporto
Italiano, al massimo 600 parole: (1) difetti per gravità, ognuno con passi, prova, file:riga, correzione proposta; (2) che cosa hai provato, con i numeri; (3) che cosa non hai potuto verificare; (4) una riga finale: «RESTANO DIFETTI REALIZZABILI: sì/no».

## Numerazione dei cicli
Cicli 1–23 fino al 6 novembre 2026; ciclo 24 con queste regole (11 agenti); ciclo 25 di riverifica, ultimo ciclo completo prima della 2.2.0.
