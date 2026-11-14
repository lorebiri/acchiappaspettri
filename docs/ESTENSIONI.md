# Estensioni per nuovi formati (`.acchplugin`)

Un'estensione aggiunge ad Acchiappaspettri la lettura di un formato di file che l'app non conosce. Si installa da **Impostazioni → Estensioni → Installa un'estensione…**, oppure trascinando il file `.acchplugin` nella finestra. Vale per la versione online e per l'app desktop.

Questa guida è per chi scrive un'estensione. L'esempio completo è in [`examples/plugins/colonne-fisse/`](../examples/plugins/colonne-fisse/) (licenza GPL-3.0-or-later).

## In breve
1. Scrivi `manifest.json` e `reader.js` in una cartella.
2. Crea il pacchetto: `node scripts/plugin-pack.js <cartella>`. Il comando stampa l'impronta SHA-256: pubblicala insieme al file.
3. Installa il pacchetto e apri un file del tuo formato.

## Il pacchetto
Un `.acchplugin` è **un documento JSON in UTF-8**:

```json
{"format":"acchplugin", "formatVersion":1,
 "manifest":{…},
 "code":"registerReader(function(bytes, name){ … });"}
```

Perché JSON e non ZIP:
- un solo file di testo, che si legge con qualsiasi editor: chi installa può vedere tutto il codice prima di fidarsi;
- l'app non deve decomprimere niente, quindi niente archivi esplosivi né percorsi pericolosi;
- l'impronta SHA-256 dei byte del file identifica il pacchetto in modo univoco;
- un lettore non ha bisogno di altri file. Le tabelle grandi possono stare nel codice, fino a 2 MB in tutto.

### Il manifesto

| Campo | Obbligatorio | Regola |
|---|---|---|
| `id` | sì | identificativo stabile, minuscole, cifre, `.` `_` `-` (es. `org.mio-lab.formato-x`). Un pacchetto con lo stesso `id` sostituisce quello installato |
| `name` | sì | nome mostrato, al massimo 80 caratteri |
| `version` | sì | versione semver, `1.2.0` o `1.2.0-beta.1` |
| `author` | sì | autore, al massimo 120 caratteri |
| `license` | sì | licenza, possibilmente un identificativo SPDX (`GPL-3.0-or-later`, `MIT`, …) |
| `extensions` | sì | da 1 a 20 estensioni dei file letti, senza punto (`["fwf"]`). Non si possono prendere `acchspettri`, `acchplugin`, `acchlib`, `json`, `opj`, `opju`, le immagini, `pdf`, `zip`, `js`, `html` |
| `minAppVersion` | sì | versione minima di Acchiappaspettri. Si confronta solo il numero: le versioni di prova della 3.0.0 valgono come 3.0.0 |
| `permissions` | no | `["read-file"]`, l'unico permesso esistente. Un permesso sconosciuto fa rifiutare il pacchetto |
| `description` | no | testo, oppure `{"it":"…", "en":"…"}`, al massimo 500 caratteri |
| `homepage` | no | indirizzo `https://`, mostrato come testo |

Le estensioni di file che l'app legge già (`txt`, `csv`, `dat`, …) sono ammesse. L'app prova prima l'estensione: se questa restituisce `null`, il file lo legge l'app come sempre. I file che un progetto aveva fatto leggere all'app restano all'app anche dopo.

## Il codice del lettore
Il codice chiama una volta `registerReader(funzione)`. La funzione riceve:
- `bytes`, un `Uint8Array` con il contenuto del file;
- `name`, il nome del file.

Deve **restituire subito** (non una promessa) uno di questi valori:
- `null`: il file non è di questo formato;
- `{error: "testo"}`: il file è di questo formato, ma non si legge. Il testo, al massimo 300 caratteri, arriva all'utente;
- uno spettro: `{x:[…], y:[…], meta:["riga", …]}`;
- più canali: `{channels:[{name:"A 254 nm", x:[…], y:[…], meta:[…]}, …], meta:[…], sample:"nome", technique:"uv"}`.

Note sul risultato:
- `x` e `y` sono Array o `Float64Array`/`Float32Array` di numeri finiti, della stessa lunghezza, con almeno 5 punti;
- `technique`, se c'è, è una delle tecniche dell'app: `ftir`, `raman`, `uv`, `fluo`, `hplc`, `xrf`, `libs`, `tga`, `dsc`, `nmr`, `epr`, `sorp`, `chem`, `gen`. Senza, la tecnica si riconosce come per gli altri file;
- con due o più canali si apre la finestra «Canali trovati». Il nome del canale diventa il campo `channel` del progetto, quindi deve restare uguale fra una versione e l'altra dell'estensione. I nomi vuoti o ripetuti si numerano (`#2`, `#3`).

L'app **controlla tutto** prima di usarlo e rifiuta il risultato se trova:
- tipi sbagliati;
- lunghezze diverse fra x e y;
- `NaN` o infiniti;
- più di 64 canali, più di 2 000 000 punti per canale o più di 8 000 000 punti in tutto.

Righe di `meta` e nomi si accorciano (500 e 100 caratteri). I caratteri di controllo e quelli che invertono la direzione del testo si tolgono.

```js
registerReader(function(bytes, name){
  var text=new TextDecoder('utf-8').decode(bytes);
  if (!/^MIOFORMATO/.test(text)) return null;
  var x=[], y=[];
  text.split(/\r?\n/).slice(1).forEach(function(l){ var c=l.trim().split(/\s+/); if (c.length===2){ x.push(+c[0]); y.push(+c[1]); } });
  return {x:x, y:y, meta:['Formato: MIOFORMATO']};
});
```

## Dove gira e che cosa non può fare
Ogni file si legge in un **Web Worker dedicato**, nuovo per ogni file e chiuso subito dopo. È separato dal worker del nucleo e non ha nessuno stato fra un file e l'altro. Prima del tuo codice l'app toglie:
- **la rete**: `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `WebTransport`, `importScripts`. La parola chiave `import` non è ammessa nel codice: il pacchetto viene rifiutato all'installazione, anche se compare solo in un commento;
- **gli altri worker e canali**: `Worker`, `SharedWorker`, `BroadcastChannel`, `MessageChannel`, `postMessage`. Non puoi scrivere alla pagina: risponde solo l'avvio dell'app, con il valore che restituisci;
- **l'archivio**: `indexedDB`, `caches`, file system, `navigator`;
- **il codice da testo**: `eval`, `Function` (anche attraverso `.constructor`) e `setTimeout`/`setInterval` con una stringa.

Il worker non ha DOM per costruzione, quindi niente `window`, `document` o `localStorage`. Nel desktop vale anche la CSP della finestra: nessuna connessione fuori dall'app e nessun `eval`.

Limiti:
- file in ingresso fino a 64 MB;
- **15 s** per ogni lettura: allo scadere il worker si chiude (ciclo infinito, lettore troppo lento);
- pacchetto fino a 2 MB.

Un limite di memoria vero non si può imporre a un worker del browser. Il worker si chiude dopo ogni file e l'uscita si scarta prima di copiarla se supera i limiti. Un'estensione che alloca troppa memoria fa chiudere il worker e, in casi estremi, l'intera pagina o finestra dell'app: è un limite noto. Il lavoro non salvato si recupera dalla copia automatica.

## Sicurezza per chi installa
Prima dell'installazione l'app mostra:
- nome, versione, autore, licenza, formati, versione minima e descrizione;
- i permessi: legge solo i file che apri tu, con quelle estensioni, e restituisce solo numeri e testi controllati;
- l'**impronta SHA-256** del pacchetto.

Le estensioni **non sono firmate**. Installale solo se ti fidi dell'autore e se l'impronta coincide con quella che l'autore ha pubblicato. Per calcolarla da terminale:
- macOS e Linux: `shasum -a 256 file.acchplugin`;
- Windows: `certutil -hashfile file.acchplugin SHA256`.

In Impostazioni → Estensioni ogni estensione si **disattiva** (i suoi formati non si aprono più) o si **rimuove**. L'elenco è salvato in IndexedDB online e nell'archivio dell'app nel desktop.

## Estensioni e progetti
Ogni spettro letto da un'estensione registra nel progetto il campo `plugin` = `{id, version, name, sha256}` (vedi [FORMATO-ACCHSPETTRI.md](FORMATO-ACCHSPETTRI.md)). All'apertura del progetto:
- **se l'estensione c'è ed è attiva**, il file si rilegge con quella. Se la versione è cambiata, l'app lo dice;
- **se manca o è disattiva**, l'app avvisa con nome, versione e `id`. Gli spettri non si vedono, ma i byte originali restano nel progetto e si riscrivono a ogni salvataggio. Si installa l'estensione e si riapre il progetto;
- **se l'estensione non rilegge più il file** (errore, formato cambiato), vale lo stesso: avviso e byte conservati.

## Prove
- `node --test test/unit/estensioni.test.js`: pacchetto, manifesto, controlli dell'uscita, campo `plugin` e correttezza dell'esempio.
- `PW_CHANNEL=chrome node --test test/validation/i11-estensioni-ui.test.js`: isolamento (R16) e uso nell'app (R17). Gira nel browser vero, anche con la CSP del desktop.

---
**English summary.** An extension (`.acchplugin`) adds a file format reader. The package is a single UTF-8 JSON document `{format:"acchplugin", formatVersion:1, manifest, code}`. JSON rather than ZIP keeps it readable, needs no decompression and has one SHA-256 fingerprint.
- **Manifest:** `id`, `name`, `version` (semver), `author`, `license`, `extensions`, `minAppVersion`; optional `permissions` (only `read-file`), `description`, `homepage`.
- **Reader:** the code calls `registerReader(fn)`. `fn(bytes, name)` returns `null` (not my format), `{error}`, `{x, y, meta}` or `{channels:[{name, x, y, meta}], meta, sample, technique}`, synchronously.
- **Isolation:** the reader runs in a dedicated Web Worker, one per file, separate from the core worker. Network, other workers and channels, `postMessage`, storage, `navigator`, `eval`/`Function`/string timers and the `import` keyword are removed or refused. There is a 15 s timeout and a 64 MB input limit.
- **Checks:** the page re-validates every result (types, lengths, NaN, at most 64 channels and 8 M points).
- **Installation:** the user sees author, permissions and the SHA-256 fingerprint. Extensions are unsigned and can be disabled or removed.
- **Projects:** each spectrum records `plugin = {id, version, name, sha256}`. If the extension is missing on reopening, the app warns and keeps the original bytes.
