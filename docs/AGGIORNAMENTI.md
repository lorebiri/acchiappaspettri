# Aggiornamenti dell'app

## Che cosa fa l'app
- 8 secondi dopo l'avvio, poi ogni 6 ore, legge `https://github.com/lorebiri/acchiappaspettri/releases/latest/download/latest.json`. Si può disattivare in ⚙️ Impostazioni e si può controllare a mano (*Aiuto → Controlla aggiornamenti*).
- `releases/latest` di GitHub non include mai le beta: gli utenti stabili non le ricevono.
- Se c'è una versione nuova mostra versione installata, nuova e note, con **Scarica e aggiorna** e **Più tardi** (che non ripropone per 24 ore).
- Prima di riavviare chiede di salvare le modifiche. Il pacchetto si installa solo se la firma è valida: un download interrotto o un file alterato non viene installato e l'app resta com'è.

## Privacy
La richiesta è un normale download di un file pubblico: nessun dato, nome di file o progetto viene inviato. GitHub vede l'indirizzo di rete come per ogni sito. Nessuna telemetria.

## Architettura del Mac
`latest.json` ha una voce per `darwin-aarch64` (Apple Silicon) e una per `darwin-x86_64` (Intel). L'app sceglie quella del processore per cui è stata compilata: un Mac Intel riceve il pacchetto Intel, un Mac Apple Silicon quello ARM. `scripts/publish-release.js` rifiuta di pubblicare se una delle due manca. Entrambe sono compilate e provate nella pipeline su macchine virtuali macOS di GitHub: `macos-latest` (Apple Silicon) e `macos-15-intel` (Intel nativo). La prova su Mac reali si fa a mano dopo la pubblicazione.

## Per piattaforma
| Installazione | Aggiornamento |
|---|---|
| Windows (.exe), macOS (.app), AppImage | Automatico con conferma dell'utente |
| .deb | Manuale: l'app avvisa e apre la pagina di download |

Provato davvero: vedi [COLLAUDO.md](COLLAUDO.md).

## La chiave di firma
- La chiave privata è **solo** in `~/.tauri/acchiappaspettri.key` (con la password in `.key.password`) sul computer del manutentore e nei segreti GitHub `TAURI_SIGNING_PRIVATE_KEY` e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Non va mai nel repository.
- La chiave pubblica è in `src-tauri/tauri.conf.json`.
- **Conservane una copia sicura.** Se si perde, le app già installate non accetteranno più aggiornamenti e gli utenti dovranno reinstallare a mano.
- Rigenerarla: `npx tauri signer generate -w ~/.tauri/acchiappaspettri.key`, poi aggiornare chiave pubblica e segreti (vale solo per le installazioni successive).

## Protezione dei progetti
Un aggiornamento sostituisce il programma: progetti e impostazioni non vengono toccati. Le modifiche al formato passano da una migrazione provata ([FORMATO-ACCHSPETTRI.md](FORMATO-ACCHSPETTRI.md)).

## Provare l'aggiornamento firmato con un mirror locale (tester, prima di pubblicare)
L'app pubblicata legge solo `releases/latest` di GitHub, che non contiene mai le versioni di prova: per provare il passaggio dalla 2.2.0 a una `3.0.0-rc.N` (o alla 3.0.0 prima del tag) si usa un **mirror sul proprio computer**.

1. **La versione nuova.** Dalla bozza della release (o dagli artefatti della pipeline) scarica in una cartella vuota `latest.json` e i pacchetti per l'updater della tua piattaforma: `…_x64-setup.exe` (Windows), `…aarch64.app.tar.gz` o `…x64.app.tar.gz` (Mac), `…_amd64.AppImage` (Linux). Bastano quelli della piattaforma che provi; il mirror serve solo le voci che trova.
2. **Il mirror.** Dalla cartella del repository:
   ```
   node scripts/mirror-aggiornamento.js <cartella> --porta 8790
   ```
   Prima di partire verifica ogni firma con la chiave pubblica di `src-tauri/tauri.conf.json` e la versione scritta nella firma; se un pacchetto non è verificabile si ferma e dice perché (`--solo-controllo` fa solo la verifica). Poi serve `http://127.0.0.1:8790/latest.json` con gli indirizzi riscritti verso il mirror e le firme originali, e scrive ogni richiesta che riceve.
3. **La versione installata, in versione di collaudo.** Gli installer pubblicati non accettano un indirizzo diverso da GitHub; la build di collaudo sì, con il comando `e2e_check_update` (`src-tauri/src/lib.rs`, attivo solo con la feature `e2e`). Si compila dal tag della versione vecchia:
   ```
   git worktree add ../acch-2.2.0 v2.2.0 && cd ../acch-2.2.0 && npm ci
   ACCH_E2E_PAGE=1 npx tauri build --debug --features e2e
   ```
   e si installa il pacchetto prodotto (in `src-tauri/target/debug/bundle/`): l'aggiornamento sostituisce un'app installata (installer NSIS su Windows, `.app` in una cartella scrivibile sul Mac, AppImage su Linux), non un eseguibile qualsiasi. La chiave pubblica nel codice del tag è quella vera, quindi i pacchetti devono essere firmati con la chiave vera (quelli della pipeline lo sono).
4. **La prova.** Avvia l'app installata con:
   ```
   ACCH_E2E_SCENARIO=update-good ACCH_E2E_UPDATE_URL=http://127.0.0.1:8790/latest.json ACCH_E2E_DIR=<cartella del rapporto> <app installata>
   ```
   (su Windows: `set NOME=valore` in cmd, `$env:NOME="valore"` in PowerShell). L'app scarica, verifica la firma, installa e si chiude; il rapporto è in `<cartella del rapporto>/e2e-report.json`. Riavviala con `ACCH_E2E_SCENARIO=version`: il rapporto deve dire la versione nuova. `test/e2e/update-test.js` fa gli stessi passi con un server proprio e prova anche firma alterata, pacchetto alterato e download interrotto.
5. **Dopo.** Apri un progetto salvato con la versione vecchia e controlla che si apra (FORMATO-ACCHSPETTRI.md). Togli la build di collaudo e reinstalla dalla release.

Limiti: si prova il codice dell'updater della versione vecchia e il pacchetto vero della nuova, non l'eseguibile pubblicato della vecchia (che non si può puntare altrove); gli indirizzi `http://` del mirror sono accettati nella build `--debug` (in una build di rilascio l'updater può richiedere https: non verificato).
