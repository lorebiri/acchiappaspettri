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
2. esegue test, benchmark, collaudo dell'interfaccia e collaudo dentro l'app sui tre sistemi: **se fallisce, non si pubblica nulla**;
3. costruisce `.exe`, `.dmg` (Apple Silicon e Intel), AppImage, `.deb` e `latest.json` in una release in bozza;
4. controlla che ci siano tutti i pacchetti e che `latest.json` abbia una firma per ogni piattaforma (la verifica vera la fa l'app all'installazione), scrive le note e pubblica.

La pagina online e le app installate vedono la nuova versione appena la release è pubblica. La pagina si aggiorna con il push su `main` (GitHub Pages).

## Beta
```bash
node scripts/set-version.js 2.3.0-beta.1
git tag v2.3.0-beta.1
```
Con un trattino nel tag la release è una *pre-release*: non è `latest`, quindi non arriva né agli utenti stabili né ai pulsanti della pagina. Chi vuole provarla scarica il pacchetto a mano.

## Se qualcosa va storto
Tag sbagliato prima della pubblicazione: cancella tag e bozza (`git push origin :v2.3.0`, `gh release delete v2.3.0`). Una release già pubblicata con un difetto: pubblica subito una versione più alta; le app non tornano indietro da sole.
