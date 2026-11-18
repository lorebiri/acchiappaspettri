# Pubblicare la 3.0.0

Che cosa va fatto, in ordine, per pubblicare Acchiappaspettri 3.0.0 (versione stabile, per tutti). Fonti: `docs/PUBBLICARE.md`, `docs/AGGIORNAMENTI.md`, `.github/workflows/release.yml`, `scripts/publish-release.js`, `src-tauri/tauri.conf.json`, `.github/dependabot.yml`. Scritto il 18 novembre 2026.

## Stato dei rami

| Ramo | Commit | Contenuto |
|---|---|---|
| `claude/acch-conclusione` | quello indicato nell'ultimo messaggio della sessione | 3.0.0: rc.5 + I5, I6, I7, I9, I11 + picchi per posizione, rimozione del fondo e debug globale. Versione 3.0.0 in tutti i file (`package.json`, `tauri.conf.json`, `Cargo.toml`, `acch-core`, `Cargo.lock`, `index.html`), `CHANGELOG.md` con la sezione `## 3.0.0 — 18 novembre 2026`, Novità con la data |
| `desktop` | uguale a `claude/acch-conclusione` dopo l'avanzamento (fast-forward) | ramo di sviluppo |
| `main` | b25a677 (pagina online 2.2.x e due commit di `CLAUDE.md`) | **non contiene la 3.0**; da unire |

## 1. Prima del tag
1. In GitHub, *Settings → Secrets and variables → Actions*: devono esistere `TAURI_SIGNING_PRIVATE_KEY` e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (il primo passo della pipeline fallisce senza).
2. **Unire `desktop` in `main`** con un merge normale. Va fatto perché:
   - la pagina online (https://lorebiri.github.io/acchiappaspettri/) è pubblicata con **GitHub Pages dal ramo `main`** (`docs/PUBBLICARE.md`: «La pagina si aggiorna con il push su `main`»; `dependabot.yml`: «main è quello di GitHub Pages»; `docs/AUDIT.md`);
   - la procedura prevede il tag sul commit di `main` (`git push origin main v3.0.0`).
   L'unione è verificata senza conflitti (`git merge-tree`): `main` ha in più solo i due commit di `CLAUDE.md`. Secondo `CLAUDE.md`, il merge su `main` richiede la conferma di Lorenzo: questa sessione **non l'ha fatto**.
   ```bash
   git checkout main && git merge --no-ff desktop -m "3.0.0"
   npm ci && npm test        # e, se c'è tempo, npm run test:validation
   git push origin main
   ```
3. Attendere la **CI verde su `main`** (`.github/workflows/ci.yml` gira su ogni ramo).

Attenzione all'ordine: appena `main` è su GitHub, la pagina online mostra la 3.0, mentre i pulsanti di download puntano ancora alla release `latest` (la 2.2.0) finché la release 3.0.0 non è pubblicata. Per ridurre la finestra, push di `main` e del tag uno subito dopo l'altro (passo 2 della sezione successiva).

## 2. Tag e pubblicazione (sessione Pubblicazioni)
```bash
git tag v3.0.0 <commit di main dopo l'unione>
git push origin main v3.0.0
```
- **Tag `v3.0.0` sul commit di `main` dopo l'unione** (il contenuto è identico al commit di `desktop`/`claude/acch-conclusione`: l'unione aggiunge solo `CLAUDE.md`).
- Senza trattino nel tag la release è **stabile**: `prerelease` è falso in `release.yml` (`contains(github.ref_name, '-')`), quindi diventa `latest`.
- La pipeline `release.yml`:
  1. `check-version.js v3.0.0`: tag, `package.json`, `tauri.conf.json`, `Cargo.toml` e la sezione `## 3.0.0` del CHANGELOG devono coincidere (già verificato: «versione coerente: 3.0.0»); controlla i segreti di firma;
  2. nessuna release già pubblicata con lo stesso tag, al più una bozza dello stesso commit;
  3. test, benchmark, collaudo dell'interfaccia e collaudo dentro l'app su Windows, Linux, Mac Apple Silicon e Mac Intel: **se fallisce, non si pubblica nulla**;
  4. installer `.exe`, `.dmg` (Apple Silicon e Intel), AppImage, `.deb` e **`latest.json`** in una release in bozza (le piattaforme una alla volta, perché tauri-action fonde `latest.json`);
  5. `scripts/publish-release.js`: verifica che ci siano tutti i pacchetti e che `latest.json` abbia una firma valida per ogni piattaforma (controllata con la chiave pubblica di `tauri.conf.json`), scrive le note dalla sezione `## 3.0.0` di `CHANGELOG.md` (le stesse note vanno in `latest.json`) e pubblica.

## 3. Aggiornamenti dell'app desktop (`latest.json`)
- L'app installata legge `https://github.com/lorebiri/acchiappaspettri/releases/latest/download/latest.json` (8 s dopo l'avvio, poi ogni 6 ore). `releases/latest` è l'ultima release **stabile**: dalla pubblicazione della 3.0.0 gli utenti della 2.2.0 ricevono la proposta di aggiornamento (installazione solo dopo conferma, pacchetto firmato).
- `latest.json` non si scrive a mano: lo produce la pipeline al passo 2.4, con una voce per Windows, Linux (AppImage), `darwin-aarch64` e `darwin-x86_64`.
- Il `.deb` non si aggiorna da solo (avviso nell'app).

## 4. Dopo la pubblicazione
1. Scaricare dalla pagina della release e installare almeno su **Windows** e su **un Mac** (la pipeline ricostruisce i pacchetti dopo i test).
2. Provare l'**aggiornamento dalla 2.2.0 alla 3.0.0** su una macchina con la 2.2.0 installata (o prima, con il mirror locale di `docs/AGGIORNAMENTI.md`, `scripts/mirror-aggiornamento.js`): non è mai stato provato davvero (`docs/ROADMAP.md`, «Rilascio»).
3. Controllare la pagina online (Pages da `main`): versione 3.0 nelle Novità e pulsanti di download verso la 3.0.0.
4. Se un difetto emerge dopo la pubblicazione: pubblicare subito una 3.0.1 (le app non tornano indietro da sole); un tag sbagliato prima della pubblicazione si cancella con la bozza (`git push origin :v3.0.0`, cancellazione della bozza).

## Cose da sapere prima di pubblicare
- **Saltato il collaudo della rc**: nessuna versione di prova 3.0 è stata installata dagli utenti di prova; le suite automatiche sono verdi (vedi `CONCLUSIONE-REPORT.md`, sezione 4).
- **Non ripetuti sull'insieme finale in questo ambiente** (li fa la pipeline del passo 2.3): build Tauri completa con gli installer e collaudo dentro l'app vera; prove su Windows e macOS.
- **Test I6 «G3» del grafico**: fallisce su Linux con il WebGL software (2 px contro 1 ammesso), anche sul ramo `wip/i6-grafico-webgl` da solo. Se fallisce anche nella pipeline, la pubblicazione si ferma: va guardato prima del tag (tolleranza o difetto del ripiego WebGL).
- `docs/VALIDAZIONE.md` è stato rigenerato con la versione 3.0.0.
