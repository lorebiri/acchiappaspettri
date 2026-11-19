# Pubblicare l'app online e il sito di presentazione su GitHub Pages

Il sito è nella cartella `scarica/` (italiano `scarica/index.html`, inglese `scarica/en/index.html`); l'app online è la radice del ramo `main`. Dettagli anche in [docs/PUBBLICARE.md](docs/PUBBLICARE.md), sezione «Sito di presentazione e download».

| Indirizzo | Che cosa |
|---|---|
| <https://lorebiri.github.io/acchiappaspettri/> | app online (**non cambia**) |
| <https://lorebiri.github.io/acchiappaspettri/scarica/> | sito, italiano |
| <https://lorebiri.github.io/acchiappaspettri/scarica/en/> | sito, inglese |
| <https://lorebiri.github.io/acchiappaspettri/scarica/sitemap.xml> | sitemap delle due lingue |

## Sempre allineato all'ultima versione: come funziona

Tre livelli, nessun intervento a mano dopo l'attivazione:

1. **Dati statici nell'HTML, a ogni deploy.** `scripts/sito-aggiorna.mjs` scrive nelle due pagine, tra i segnaposto `<!-- sync:… -->` (da non modificare a mano):
   - `head`: JSON-LD `SoftwareApplication` con versione e data, e i dati della versione per `avvio.js`;
   - `principale`: il pulsante di download visibile senza JavaScript, con la versione;
   - `versione`: «Ultima versione: X.Y.Z, pubblicata il …»;
   - `elenco`: i cinque pacchetti con link diretto, nome, dimensione e impronta SHA-256;
   - `novita`: la sezione «Novità» con le ultime 3 versioni pubblicate di `CHANGELOG.md` (pagina inglese: `CHANGELOG.en.md`; se una versione non è tradotta compare il testo italiano, marcato `lang="it"`), senza le versioni di prova (rc) né le sezioni «In preparazione», fino alla versione pubblicata;
   - e rigenera `scarica/sitemap.xml`.

   Due modi:
   - `npm run sito` (in locale): usa la versione di `package.json`; se è già su GitHub Releases prende anche data, link diretti, dimensioni e impronte, altrimenti i link portano alla pagina delle versioni. Da fare a ogni cambio di versione o del CHANGELOG, prima del commit (i test lo ricordano).
   - `node scripts/sito-aggiorna.mjs --pubblicata` (nel workflow `pages.yml`, prima di costruire): usa l'ultima versione **pubblicata**. Se GitHub non risponde restano i dati già scritti nella pagina.
2. **Nel browser.** `avvio.js` disegna subito il pulsante giusto per il sistema (Windows, Mac con chip Apple o Intel, Linux AppImage o .deb) dai dati della pagina, poi chiede all'API di GitHub l'ultima versione stabile (attesa massima 6 s, risposta tenuta 10 minuti nella scheda, un errore ricordato 2 minuti per non insistere sul limite di richieste). Se è uguale o più nuova aggiorna pulsanti ed elenco; se GitHub è lento, ha raggiunto il limite o non risponde, restano i dati della pagina. Senza JavaScript la pagina mostra comunque versione, link diretti, dimensioni e impronte.
3. **I test** (`test/unit/sito-sync.test.js`, anche in `npm test`) falliscono se la versione nelle pagine non è quella di `package.json`, se un blocco `sync` è stato cambiato a mano o non corrisponde al CHANGELOG, se la sitemap non è allineata, o se su GitHub è già uscita una versione più nuova di quella del sito. Prima della pubblicazione di una versione nuova (package.json avanti rispetto all'ultima release) il test lo segnala senza fallire, così la CI resta verde fino al tag. Rimedio: `npm run sito` e commit di `scarica/`.

## Pubblicazione: workflow `pages.yml` (GitHub Actions)

`.github/workflows/pages.yml` costruisce **l'intero ramo `main` con Jekyll, esattamente come fa oggi «Deploy from a branch»** (stessi file, stessi indirizzi: app, `scarica/`, `app/`, `i18n/`, `vendor/`, documenti), dopo aver scritto nel sito i dati dell'ultima release. Prima del deploy `scripts/sito-verifica.mjs _site` controlla l'artefatto; dopo il deploy il lavoro «controlla» verifica online l'app (titolo, versione, ogni script e foglio di stile che carica, `app/`, `i18n/`, `vendor/`) e il sito (dati della versione, link diretti, JSON-LD, hreflang, Novità, risorse, sitemap), riprovando per 10 minuti per la cache di Pages.

Parte da solo:
- a ogni push su `main` (con Pages da Actions anche l'app esce da qui, quindi va pubblicata ogni modifica);
- alla pubblicazione di una release: `release.yml` lo lancia alla fine (una release pubblicata con il `GITHUB_TOKEN` non genera eventi per gli altri workflow); una release pubblicata a mano dal sito di GitHub lo fa ripartire tramite l'evento `release`;
- ogni giorno alle 05:17 UTC, come rete di sicurezza;
- a mano: *Actions → Pages → Run workflow* (ramo `main`).

**Finché la sorgente di Pages è «Deploy from a branch» il workflow non pubblica nulla**: costruisce e controlla l'artefatto e finisce verde (lo capisce dall'API di Pages, `build_type`). Online resta la pubblicazione dal ramo di sempre, con i dati statici del commit (allineati a `package.json` dai test) e la lettura dal vivo nel browser.

### Perché Actions e non un commit automatico su `main`

Alternativa scartata: un workflow che a ogni release aggiorna i dati statici e fa un commit su `main`. È meno robusta:
- commit di un bot su `main`, dove i merge li fa solo chi coordina, con il rischio di conflitti con i push umani e di essere bloccato da eventuali protezioni del ramo;
- i commit fatti con il `GITHUB_TOKEN` non fanno partire la CI: su `main` finirebbe un commit non provato;
- il contenuto di `main` divergerebbe dal tag della release.

Con Actions, invece, `main` resta com'è, il deploy è atomico (l'artefatto sostituisce tutto il sito in un colpo), viene controllato prima e dopo, e si torna indietro in un minuto rimettendo la sorgente «Deploy from a branch».

## Attivazione (una volta sola, sessione Pubblicazioni sul Mac)

Prerequisito: `pages.yml` è su `main` (dopo il merge di questo ramo).

1. **Prova a secco, senza cambiare nulla.** *Actions → Pages → Run workflow* sul ramo `main`. Con la sorgente ancora «Deploy from a branch» il run costruisce e controlla l'artefatto e mostra l'avviso «Pages pubblica dal ramo … non pubblicato». Deve essere verde. (Facoltativo: scaricare l'artefatto `github-pages` e controllare che contenga `index.html`, `app/`, `scarica/`.)
2. **Ambiente.** *Settings → Environments → github-pages* (se esiste già): in *Deployment branches and tags* deve essere ammesso `main` (di solito «Selected branches and tags: main», creato da GitHub). Se l'ambiente non esiste, lo crea GitHub al passo 3.
3. **Sorgente.** *Settings → Pages → Build and deployment → Source*: scegliere **«GitHub Actions»** (al posto di «Deploy from a branch»). Il sito già pubblicato resta online finché il nuovo deploy non lo sostituisce: gli indirizzi non cambiano e non c'è interruzione.
4. **Primo deploy, subito.** *Actions → Pages → Run workflow* sul ramo `main`. Attendere i lavori «Costruisce app e sito», «Pubblica su GitHub Pages» e «Controlla online app e sito» (3–5 minuti in tutto): tutti verdi.
5. **Controllo a mano** (anche dal Mac, con Node 22): `node scripts/sito-verifica.mjs https://lorebiri.github.io/acchiappaspettri/ --versione 3.0.0 --attendi 600` → «✓ … app e sito presenti, sito alla 3.0.0». Poi aprire <https://lorebiri.github.io/acchiappaspettri/> (l'app si apre e carica un file d'esempio) e <https://lorebiri.github.io/acchiappaspettri/scarica/> (pulsante «Scarica per Mac · chip Apple · versione 3.0.0 · 6,1 MB»).
6. **Se qualcosa non va: tornare indietro.** *Settings → Pages → Source*: «Deploy from a branch», ramo `main`, cartella `/ (root)`, *Save*. GitHub ripubblica il ramo come prima (1–2 minuti).

Facoltativo: la variabile del repository `PAGES_DA_WORKFLOW` = `si` (*Settings → Secrets and variables → Actions → Variables*) forza il deploy da `main` anche se l'API di Pages non risponde. Con la sorgente «GitHub Actions» non serve.

Da quel momento: ogni push su `main` pubblica app e sito; ogni release stabile aggiorna da sola il sito (versione, data, link, dimensioni, impronte, Novità) entro pochi minuti dalla pubblicazione.

## A ogni versione

1. Aggiornare `CHANGELOG.md` (e `CHANGELOG.en.md` per la pagina inglese) e la versione come sempre.
2. `npm run sito` e commit di `scarica/` (altrimenti `npm test` fallisce).
3. Dopo la pubblicazione della release non serve altro: `pages.yml` scrive i dati della release online. Per avere gli stessi dati anche nel ramo (e nella pubblicazione dal ramo, se la sorgente non è Actions): `npm run sito` e commit.

## Prima di pubblicare modifiche al sito

- `node --test test/unit/sito.test.js test/unit/sito-sync.test.js`: struttura, link, immagini, nomi di terzi, logica del download, allineamento a versione e CHANGELOG, SEO, workflow.
- `node scripts/sito-verifica.mjs .`: app e sito presenti nel ramo, agli indirizzi di sempre.
- `node --test test/validation/sito-ui.test.js`: prova nel browser (Windows, Mac Apple e Intel, Linux, telefono, tablet; temi; italiano e inglese; GitHub che non risponde, lento o al limite di richieste; JavaScript spento). Con `SITO_SCREENSHOT=cartella` salva anche gli screenshot.
- Dopo cambiamenti visibili dell'app, le schermate si rifanno con `node scripts/sito-schermate.js`.
- In locale dietro un proxy, Node ha bisogno di `NODE_USE_ENV_PROXY=1` per raggiungere l'API di GitHub.
