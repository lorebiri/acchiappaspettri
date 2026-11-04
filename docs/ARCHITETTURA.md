# Architettura

```
index.html            la pagina: interfaccia e nucleo scientifico (identica online e nell'app)
app/project-format.js formato .acchspettri (senza interfaccia, collaudabile da solo)
app/project.js        nuovo, apri, salva, chiudi, modifiche non salvate
app/i18n.js           lingua dell'interfaccia; i18n/en.json + en-app.json → i18n/en.js
app/ui.js             impostazioni, tema, conferme, finestra di download
app/desktop.js        solo nell'app: menu, file nativi, chiusura sicura, aggiornamenti
src-tauri/            lato nativo in Rust: finestre di dialogo, lettura e scrittura controllate
vendor/               jsPDF, JSZip, carattere Nunito: tutto incluso, niente rete
```
La pagina resta una sola: nessuna riscrittura e nessuna seconda copia del codice scientifico. Online e desktop eseguono lo stesso `index.html`; l'app aggiunge `app/desktop.js`.

## Perché Tauri 2
| Criterio | Tauri 2 (scelto) | Electron | Python + Qt |
|---|---|---|---|
| Riuso della pagina esistente | totale | totale | parziale (WebEngine) o riscrittura |
| Dimensione dell'installer | circa 5–15 MB, usa la webview di sistema | circa 90–150 MB | circa 100+ MB |
| Aggiornamenti firmati senza certificati del sistema | sì: firma propria (minisign), anche su macOS | su macOS l'aggiornamento automatico richiede la firma Apple | da costruire |
| Installer `.exe` con scelta della lingua, `.dmg`, AppImage, `.deb` | sì, integrati | sì | da costruire |
| Accesso ai file | permessi espliciti e comandi nativi minimi | Node completo, da limitare | completo |
| Stesso motore grafico ovunque | no: WebKit su macOS e Linux, WebView2 su Windows | sì, Chromium | sì |

Il criterio decisivo è il primo rischio di questo progetto: senza certificato Apple, solo Tauri permette comunque aggiornamenti verificati su macOS. Il costo è dover collaudare tre motori web: per questo la pipeline esegue il collaudo dentro l'app vera su ogni sistema.

## Sicurezza dell'app
- Politica CSP: solo script della app (inline ammesso per hash), nessuna connessione di rete dalla pagina, nessun gestore inline. Verificata nel collaudo.
- La pagina non ha accesso libero al disco: legge e scrive solo percorsi scelti dall'utente nella finestra di sistema o passati dal sistema operativo, più i file con estensione di progetto (per l'elenco «recenti»). Il rifiuto degli altri file è verificato nel collaudo.
- Scrittura atomica (file temporaneo, svuotamento su disco, rinomina); la versione precedente di un progetto resta in `.bak`.
- La funzione di collaudo (`feature e2e`) non esiste negli installer pubblicati.
