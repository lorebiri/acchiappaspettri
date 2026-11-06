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
| Ingegnere di rilascio | pipeline, script, pacchetti veri, `latest.json`, aggiornamenti, stabilità dei controlli |
| Revisore dei documenti | ogni affermazione dei documenti confrontata con la realtà |
| Capo Progetto | rappresenta il committente; decide se si pubblica |

## Fine di ogni ciclo
1. Tutti gli agenti consegnano il rapporto; il coordinatore corregge e fa riverificare a chi aveva segnalato.
2. Il Capo Progetto riceve **tutti** i rapporti integrali (non riassunti) e l'elenco delle correzioni con le loro prove.
3. Il Capo Progetto decide se serve un altro ciclo, con quali agenti e su che cosa, oppure se si può pubblicare (APPROVATO / NON ANCORA APPROVATO / APPROVATO CON LIMITAZIONI DOCUMENTATE). Il coordinatore non chiude un ciclo e non pubblica senza questa decisione.

## Formato del rapporto
Italiano, al massimo 600 parole: (1) difetti per gravità, ognuno con passi, prova, file:riga, correzione proposta; (2) che cosa hai provato, con i numeri; (3) che cosa non hai potuto verificare; (4) una riga finale: «RESTANO DIFETTI REALIZZABILI: sì/no».
