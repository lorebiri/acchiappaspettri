# Pubblicare una versione

Tutto parte da un tag; il resto lo fa GitHub Actions.

## Prima volta
1. Controlla in *Settings → Secrets and variables → Actions* che esistano `TAURI_SIGNING_PRIVATE_KEY` e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` ([AGGIORNAMENTI.md](AGGIORNAMENTI.md)).
2. Unisci il ramo di lavoro in `main` e verifica che la CI sia verde.
3. Segui i passi qui sotto con la versione già presente (`2.2.0`), senza `set-version`.

## Ogni nuova versione
```bash
node scripts/set-version.js 2.3.0
```
1. Aggiungi la voce in cima a `NOVITA` in `index.html` (regola del progetto: ogni novità si annuncia) e la sezione `## 2.3.0` in `CHANGELOG.md`: diventa le note di rilascio.
2. `npm test`, poi commit su `main`.
3. Pubblica:
```bash
git tag v2.3.0
git push origin main v2.3.0
```

La pipeline `.github/workflows/release.yml`:
1. controlla che tag e versioni coincidano e che la firma sia configurata;
2. esegue test, benchmark, collaudo dell'interfaccia e collaudo dentro l'app su Windows, Linux, Mac Apple Silicon e Mac Intel (macchina Intel nativa): **se fallisce, non si pubblica nulla**;
3. costruisce `.exe`, `.dmg` (Apple Silicon e Intel), AppImage, `.deb` e `latest.json` in una release in bozza;
4. controlla che ci siano tutti i pacchetti e che `latest.json` abbia una firma per ogni piattaforma (la verifica vera la fa l'app all'installazione), scrive le note e pubblica.

Dopo la pubblicazione: scarica i pacchetti dalla pagina online e installali almeno su Windows e su un Mac, perché la pipeline li ricostruisce dopo i test.

La pagina online e le app installate vedono la nuova versione appena la release è pubblica. La pagina si aggiorna con il push su `main` (GitHub Pages).

## Sito di presentazione e download

Il sito è nella cartella `scarica/` (italiano in `scarica/index.html`, inglese in `scarica/en/index.html`) ed esce con l'app, allo stesso push su `main`:

| Che cosa | Indirizzo |
|---|---|
| App online (invariata, quella dei preferiti) | <https://lorebiri.github.io/acchiappaspettri/> |
| Sito, italiano | <https://lorebiri.github.io/acchiappaspettri/scarica/> |
| Sito, inglese | <https://lorebiri.github.io/acchiappaspettri/scarica/en/> |

- **Nessuna impostazione da cambiare**: Pages pubblica il ramo `main` così com'è («Deploy from a branch»), quindi `scarica/` esce da sola. Il workflow `.github/workflows/sito.yml` prova il sito a ogni modifica (struttura, link, immagini, nomi di terzi, download simulato nel browser, screenshot desktop e mobile tra gli artefatti).
- **Versione e file da scaricare**: il sito li legge dall'API di GitHub (`releases/latest`, solo versioni stabili), con dimensione e impronta SHA-256 di ogni pacchetto. Non c'è nulla da aggiornare a mano a ogni versione; senza JavaScript o se GitHub non risponde, i pulsanti portano alla pagina delle versioni.
- **Schermate**: `scarica/img/*.webp` sono schermate vere dell'app su dati sintetici o di prova. Dopo un cambiamento visibile si rifanno con `node scripts/sito-schermate.js` (tutte) o `node scripts/sito-schermate.js picchi fondo` (alcune); `PW_CHROMIUM=/percorso/chromium` usa un Chromium già installato.
- **Pubblicare con GitHub Actions** (facoltativo): se si passa *Settings → Pages → Source* a «GitHub Actions», va creata la variabile del repository `PAGES_DA_WORKFLOW` = `si`. Il lavoro «pubblica» di `sito.yml` costruisce allora con Jekyll l'intero ramo `main`, come la pubblicazione dal ramo, e lo pubblica: app e sito insieme, agli stessi indirizzi. Finché la variabile non c'è, quel lavoro non parte.
- Dall'app il sito si apre da *Impostazioni → Informazioni → Sito del programma* e, nel desktop, da *Aiuto → Sito di Acchiappaspettri*.

## Beta
```bash
node scripts/set-version.js 2.3.0-beta.1
```
Aggiungi la voce in `NOVITA` e la sezione `## 2.3.0-beta.1` in `CHANGELOG.md`, poi commit e:
```bash
git tag v2.3.0-beta.1
git push origin main v2.3.0-beta.1
```
Con un trattino nel tag la release è una *pre-release*: non è `latest`, quindi non arriva né agli utenti stabili né ai pulsanti della pagina. Chi vuole provarla scarica il pacchetto a mano.

## Se qualcosa va storto
Tag sbagliato prima della pubblicazione: cancella tag e bozza (`git push origin :v2.3.0`, `gh release delete v2.3.0`). Una release già pubblicata con un difetto: pubblica subito una versione più alta; le app non tornano indietro da sole.
