# Pubblicare il sito di presentazione su GitHub Pages

Il sito è nella cartella `scarica/` (italiano `scarica/index.html`, inglese `scarica/en/index.html`). Dettagli in [docs/PUBBLICARE.md](docs/PUBBLICARE.md), sezione «Sito di presentazione e download».

## In breve

| Domanda | Risposta |
|---|---|
| Quale branch | **`main`**. GitHub Pages oggi pubblica il ramo `main` così com'è (*Settings → Pages → Source: Deploy from a branch*, cartella `/`). |
| Quale workflow | **Nessuno è necessario.** Il push su `main` basta: Pages pubblica tutto il ramo, `scarica/` compresa, insieme all'app. Il workflow `.github/workflows/sito.yml` fa solo i test del sito (e una pubblicazione da Actions facoltativa, spenta). |
| Serve un tag | **No.** I tag `v*` servono solo ai pacchetti desktop (`release.yml`). Il sito legge da solo l'ultima versione stabile da GitHub, con dimensione e impronta SHA-256 dei file. |
| Indirizzi | App (invariata): <https://lorebiri.github.io/acchiappaspettri/> · sito: <https://lorebiri.github.io/acchiappaspettri/scarica/> · inglese: <https://lorebiri.github.io/acchiappaspettri/scarica/en/> |

Unire il sito nel branch `desktop` **non pubblica nulla**: va online solo quando arriva su `main`.

## Passi per chi pubblica

1. Unire il branch che contiene `scarica/` (oggi `claude/sito-presentazione`, poi `desktop`) in `main` e fare push.
2. Attendere il workflow automatico di GitHub «pages build and deployment» (1–2 minuti), visibile in *Actions*.
3. Controllare <https://lorebiri.github.io/acchiappaspettri/scarica/> e che <https://lorebiri.github.io/acchiappaspettri/> apra ancora l'app.

Finché su GitHub l'ultima versione stabile è la 2.2.0, il sito propone quella e mostra la nota «La versione 3.0 descritta in questa pagina è in arrivo». La nota sparisce da sola quando esce la 3.0.0 stabile, senza toccare il sito.

## In alternativa: pubblicazione da GitHub Actions (facoltativa)

Serve solo se si vuole smettere di pubblicare dal ramo:

1. *Settings → Pages → Source*: «GitHub Actions».
2. *Settings → Secrets and variables → Actions → Variables*: creare `PAGES_DA_WORKFLOW` = `si`.
3. A ogni push su `main` il lavoro «pubblica» di `sito.yml` costruisce con Jekyll l'intero ramo, come la pubblicazione dal ramo, e lo pubblica: stessi file, stessi indirizzi.

Senza la variabile quel lavoro non parte, e non cambia nulla.

## Prima di pubblicare

- `node --test test/unit/sito.test.js`: struttura, link, immagini, nomi di terzi, logica del download.
- `node --test test/validation/sito-ui.test.js`: prova nel browser con l'API di GitHub simulata. Con `SITO_SCREENSHOT=cartella` salva anche gli screenshot.
- Dopo cambiamenti visibili dell'app, le schermate si rifanno con `node scripts/sito-schermate.js`.
