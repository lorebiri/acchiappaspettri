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
