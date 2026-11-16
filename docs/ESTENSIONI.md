# Estensioni per nuovi formati (`.acchplugin`)

Un'estensione aggiunge ad Acchiappaspettri la lettura di un formato di file che l'app non conosce. Si installa da **Impostazioni → Estensioni → Installa un'estensione…**, oppure trascinando il file `.acchplugin` nella finestra. Vale per la versione online e per l'app desktop.

Questa guida è per chi scrive un'estensione. Ci sono tre modi, dal più sicuro al più libero:

| Modo | Quando usarlo | Esempio (GPL-3.0-or-later) |
|---|---|---|
| **1. Lettore dichiarativo** (consigliato) | testo a colonne o binario semplice: si descrive il formato, senza codice | [`examples/plugins/punto-e-virgola/`](../examples/plugins/punto-e-virgola/) |
| **2. Modulo WebAssembly** | binari complessi, codice già scritto in C, Rust, Zig… | [`examples/plugins/binario-wasm/`](../examples/plugins/binario-wasm/) |
| **3. Codice JavaScript** | formati di testo irregolari che lo schema dichiarativo non copre | [`examples/plugins/colonne-fisse/`](../examples/plugins/colonne-fisse/) |

Tutti e tre girano nello stesso worker isolato, con gli stessi controlli dell'uscita e la stessa impronta SHA-256.

## In breve
1. In una cartella metti:
   - `manifest.json`;
   - **uno** tra `reader.json` (dichiarativo), `reader.wasm` e `reader.js`;
   - se vuoi, i file d'esempio `esempio-…` con accanto `esempio-….atteso.json`.
2. Crea il pacchetto: `node scripts/plugin-pack.js <cartella>`. Il comando stampa l'impronta SHA-256: pubblicala insieme al file.
3. Installa il pacchetto e apri un file del tuo formato.

## Il pacchetto
Un `.acchplugin` è **un documento JSON in UTF-8**:

```json
{"format":"acchplugin", "formatVersion":1,
 "manifest":{…},
 "reader":{…}  oppure  "wasm":"<base64>"  oppure  "code":"registerReader(…);",
 "examples":[{"name":"esempio-1.xyz", "data":"<base64>", "expected":{…}}]}
```

Perché JSON e non ZIP:
- un solo file di testo, che si legge con qualsiasi editor: chi installa può vedere tutto prima di fidarsi;
- l'app non deve decomprimere niente, quindi niente archivi esplosivi né percorsi pericolosi;
- l'impronta SHA-256 dei byte del file identifica il pacchetto in modo univoco;
- il pacchetto arriva al massimo a 2 MB.

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

Le estensioni di file che l'app legge già (`txt`, `csv`, `dat`, …) sono ammesse. L'app prova prima l'estensione: se questa risponde «non è mio», il file lo legge l'app come sempre. I file che un progetto aveva fatto leggere all'app restano all'app anche dopo.

## 1. Lettore dichiarativo (consigliato)
Il campo `reader` descrive il formato: **sono dati, non codice**. Li interpreta l'interprete dell'app, che gira nello stesso worker isolato degli altri lettori. Chi installa non esegue niente di scritto da altri.

### File di testo

```json
{"kind":"text", "encoding":"utf-8",
 "signature":{"regex":"^Strumento: Spettrometro SINTETICO", "lines":1},
 "headerLine":4, "delimiter":";", "decimal":",",
 "x":{"column":1, "unit":"nm", "label":"Lunghezza d'onda"},
 "channels":"all", "technique":"uv",
 "meta":[{"name":"Strumento", "regex":"^Strumento:\\s*(.+)$"}],
 "sample":{"regex":"^Campione:\\s*(.+)$"}}
```

| Campo | Significato |
|---|---|
| `encoding` | `utf-8` (predefinito), `latin1`, `utf-16le` |
| `signature` | facoltativa: regex che deve trovarsi in una delle prime `lines` righe (1–50). Se non la trova, il file «non è suo» |
| `skipLines` | righe da saltare all'inizio (0–1000) |
| `headerLine` | riga (contata dopo quelle saltate) con i nomi delle colonne. I dati cominciano dalla riga dopo |
| `comment` | prefisso delle righe di commento (es. `#`): diventano informazioni (meta) |
| `delimiter` | `,` `;` `\t` `" "` `|` `whitespace` (spazi o tabulazioni ripetuti) `fixed` (colonne a larghezza fissa) |
| `columns` | solo con `fixed`: `[{"start":1, "end":10}, …]`, caratteri da 1, estremi inclusi |
| `decimal` | `.` (predefinito) o `,`. Non insieme al separatore `,` |
| `x` | `{column, unit?, label?}`, colonne contate da 1 |
| `channels` | `"all"` (ogni altra colonna, con il nome dall'intestazione) oppure `[{column, name?, unit?}]`, al massimo 64 |
| `technique` | tecnica dell'app, vedi sotto |
| `meta` | fino a 20 `{name, regex}`: il primo gruppo della prima riga che corrisponde, cercata nei primi 64 kB |
| `sample` | `{regex}` per il nome del campione |
| `onBadLine` | `error` (predefinito: una riga non numerica ferma la lettura e lo dice) o `skip` (si salta e si conta) |

### Binario semplice

```json
{"kind":"binary", "endian":"little", "signature":{"offset":0, "ascii":"AWB1"},
 "count":{"offset":4, "type":"u32"},
 "data":{"offset":8, "type":"f32", "columns":2, "layout":"sequential", "scale":1},
 "x":{"column":1}, "channels":[{"column":2, "name":"Intensità"}]}
```

| Campo | Significato |
|---|---|
| `endian` | `little` o `big` |
| `signature` | facoltativa: `{offset, ascii}` o `{offset, hex}` |
| `count` | numero di punti: `{value}` oppure da un campo intero `{offset, type}` |
| `data` | `{offset, type, columns, layout, scale}`. `offset` può venire da un campo, `type` è `u8 i8 u16 i16 u32 i32 f32 f64`. `layout` è `interleaved` (x0 y0 x1 y1 …) o `sequential` (prima tutte le x, poi tutte le y) |
| `x` | `{column}` oppure `{start, step}`, ognuno un numero o un campo `{offset, type}` |
| `channels` | `[{column, name?, unit?}]` |

### Controlli
All'installazione l'app rifiuta:
- campi sconosciuti (un errore di battitura non passa in silenzio);
- colonne fuori scala e combinazioni ambigue;
- regex di oltre 200 caratteri, con riferimenti all'indietro o con le forme tipiche delle regex catastrofiche (`(a+)+`, `(a|aa)*`).

Durante la lettura:
- le regex vedono solo i primi 64 kB e righe di al massimo 1000 caratteri;
- un conteggio enorme, un offset fuori dal file o dati oltre la fine producono un errore chiaro, non numeri a caso;
- una regex lenta che supera i controlli si ferma con il tempo massimo del worker.

## 2. Modulo WebAssembly
Il campo `wasm` contiene il modulo in base64. `plugin-pack.js` lo prende da `reader.wasm`.

Il modulo:
- **non deve importare niente**: niente file, rete, orologio, perché non c'è niente da importare. Un modulo con importazioni è rifiutato;
- deve esportare `memory`, con un **massimo dichiarato di 256 MB al più** (4096 pagine): il limite di memoria è vero;
- deve esportare `acch_alloc(len) → ptr`: l'app ci copia i byte del file;
- deve esportare `acch_read(ptr, len) → out`, con il risultato a `out` in little-endian:

```
i32 stato        0 = letto, 1 = non è mio, 2 = errore
i32 canali       0–64
i32 punti        0–2 000 000
f64 x[punti]
f64 y[punti]     una serie per canale
i32 lunghezza    poi tanti byte di JSON UTF-8, facoltativo:
                 {"channels":["nome", …], "meta":[…], "sample":"…", "technique":"…", "error":"…"}
```

Il «carburante» limitato della SPEC non esiste nei browser. Un ciclo infinito si ferma con il tempo massimo del worker.

Nel desktop la CSP permette di compilare WebAssembly (`'wasm-unsafe-eval'`) ma non `eval`.

L'esempio [`binario-wasm`](../examples/plugins/binario-wasm/) contiene:
- `reader.wat`, il sorgente leggibile;
- `genera.js`, che scrive il binario istruzione per istruzione, senza compilatori.

Con Rust o C si compila per `wasm32-unknown-unknown` senza libreria di sistema e con `--max-memory`.

## 3. Codice JavaScript
Il codice chiama una volta `registerReader(funzione)`. La funzione riceve `bytes` (`Uint8Array`) e `name` (nome del file). Deve **restituire subito**, non una promessa, uno di questi valori:
- `null`: il file non è di questo formato;
- `{error: "testo"}`: il file è di questo formato ma non si legge. Il testo, al massimo 300 caratteri, arriva all'utente;
- uno spettro: `{x:[…], y:[…], meta:["riga", …]}`;
- più canali: `{channels:[{name:"A 254 nm", x:[…], y:[…], meta:[…]}, …], meta:[…], sample:"nome", technique:"uv"}`.

```js
registerReader(function(bytes, name){
  var text=new TextDecoder('utf-8').decode(bytes);
  if (!/^MIOFORMATO/.test(text)) return null;
  var x=[], y=[];
  text.split(/\r?\n/).slice(1).forEach(function(l){ var c=l.trim().split(/\s+/); if (c.length===2){ x.push(+c[0]); y.push(+c[1]); } });
  return {x:x, y:y, meta:['Formato: MIOFORMATO']};
});
```

## Il risultato, per tutti e tre i modi
- `x` e `y` sono numeri finiti, della stessa lunghezza, con almeno 5 punti.
- `technique`, se c'è, è una delle tecniche dell'app: `ftir`, `raman`, `uv`, `fluo`, `hplc`, `xrf`, `libs`, `tga`, `dsc`, `nmr`, `epr`, `sorp`, `chem`, `gen`. Senza, la tecnica si riconosce come per gli altri file.
- Con due o più canali si apre la finestra «Canali trovati».
- Il nome del canale diventa il campo `channel` del progetto, quindi deve restare uguale fra una versione e l'altra. I nomi vuoti o ripetuti si numerano (`#2`, `#3`).
- La pagina **ricontrolla tutto** e rifiuta il risultato se trova tipi sbagliati, lunghezze diverse, `NaN` o infiniti, più di 64 canali, più di 2 000 000 punti per canale o più di 8 000 000 in tutto.
- Righe di `meta` e nomi si accorciano (500 e 100 caratteri); i caratteri di controllo e quelli che invertono la direzione del testo si tolgono.

## File d'esempio: verificati all'installazione
`examples` contiene fino a 5 file (1 MB in tutto), ciascuno con il risultato atteso:
- `{"channels":[{"name":"A", "x":[…], "y":[…]}], "technique":"uv"}`;
- `{"none":true}`, per un file che il lettore deve dire «non mio»;
- `{"error":true}`, per un file che deve dare un errore.

**Prima di attivare l'estensione**, l'app legge ogni esempio nel worker isolato e confronta il risultato con l'atteso: canali, nomi, numero di punti, valori con tolleranza relativa 10⁻⁹, tecnica. Se un esempio non coincide, l'estensione non si installa e l'app dice quale file e quale punto non tornano. L'avviso d'installazione dice quanti esempi sono stati verificati.

Mettere almeno un esempio è fortemente consigliato.

## Dove gira e che cosa non può fare
Ogni file si legge in un **Web Worker dedicato**, nuovo per ogni file e chiuso subito dopo. È separato dal worker del nucleo e non ha nessuno stato fra un file e l'altro. Prima del lettore l'app toglie:
- **la rete**: `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `WebTransport`, `importScripts`. La parola chiave `import` non è ammessa nel codice JavaScript: il pacchetto viene rifiutato anche se compare solo in un commento;
- **gli altri worker e canali**: `Worker`, `SharedWorker`, `BroadcastChannel`, `MessageChannel`, `postMessage`;
- **l'archivio**: `indexedDB`, `caches`, file system, `navigator`;
- **il codice da testo**: `eval`, `Function` (anche attraverso `.constructor`) e `setTimeout`/`setInterval` con una stringa.

Il worker non ha DOM. Nel desktop vale anche la CSP della finestra: nessuna connessione fuori dall'app e nessun `eval`.

Limiti:
- **15 s** per ogni lettura;
- file in ingresso fino a **64 MB**: si cambia da 1 a 1024 MB in *Impostazioni → Estensioni*, e il controllo avviene prima di leggere il file;
- pacchetto fino a 2 MB.

Per JavaScript e per i lettori dichiarativi un limite di memoria vero non si può imporre a un worker del browser (vedi [LIMITAZIONI.md](LIMITAZIONI.md)). Per WebAssembly il limite c'è: 256 MB.

## Sicurezza per chi installa
Prima dell'installazione l'app mostra:
- nome, versione, autore, licenza, formati, versione minima, descrizione;
- il **tipo** (dichiarativo, WebAssembly, JavaScript);
- l'esito della **verifica degli esempi**;
- i permessi: legge solo i file che apri tu, con quelle estensioni, e restituisce solo numeri e testi controllati;
- l'**impronta SHA-256** del pacchetto.

**Niente firma, per scelta.** La SPEC prevedeva estensioni firmate con la chiave del progetto. Il progetto però non ha un'infrastruttura di chiavi per terzi (rilascio, revoca, rotazione), e una firma senza revisione darebbe solo una falsa garanzia. L'utente verifica il pacchetto con l'impronta pubblicata dall'autore:
- macOS e Linux: `shasum -a 256 file.acchplugin`;
- Windows: `certutil -hashfile file.acchplugin SHA256`.

In Impostazioni → Estensioni ogni estensione si **disattiva** (i suoi formati non si aprono più) o si **rimuove**. L'elenco è salvato in IndexedDB online e nell'archivio dell'app nel desktop.

I formati delle estensioni non entrano in «Apri con» del sistema: vedi [LIMITAZIONI.md](LIMITAZIONI.md).

## Estensioni e progetti
Ogni spettro letto da un'estensione registra nel progetto il campo `plugin` = `{id, version, name, sha256}` (vedi [FORMATO-ACCHSPETTRI.md](FORMATO-ACCHSPETTRI.md)). All'apertura del progetto:
- **se l'estensione c'è ed è attiva**, il file si rilegge con quella. Se la versione è cambiata, l'app lo dice;
- **se manca o è disattiva**, l'app avvisa con nome, versione e `id`. Gli spettri non si vedono, ma i byte originali restano nel progetto e si riscrivono a ogni salvataggio;
- **se l'estensione non rilegge più il file**, vale lo stesso.

## Fuori dalla 3.0.0 (decisione del Capo Progetto, 14/11/2026)
- **Registro curato delle estensioni**: il committente non ha ancora scelto la prima estensione, quindi non c'è ancora niente da curare.
- **Lettore Rust identico**: le estensioni sono codice di terzi che gira nel worker isolato del browser o della webview. Riscriverle in Rust non ha senso, e l'interprete dichiarativo resta in JS, nello stesso worker.

## Prove
- `node --test test/unit/estensioni.test.js`: pacchetti, manifesti, lettori dichiarativi (anche ostili), WebAssembly (importazioni, memoria), controlli dell'uscita, esempi, campo `plugin`.
- `PW_CHANNEL=chrome node --test test/validation/i11-estensioni-ui.test.js`, nel browser vero, anche con la CSP del desktop:
  - isolamento (R16);
  - i tre esempi, la verifica all'installazione, il limite dei file e i progetti (R17).
- **Fuzzing**: `node test/fuzz/estensioni-fuzz.js --seconds 3600 --workers 2 --seed 1` (o `npm run test:fuzz` per un minuto). Colpisce pacchetti, manifesti dichiarativi e loro interprete, moduli WebAssembly mutati e controllo dell'uscita. Ogni caso è riproducibile con `--replay <seme>`. Le 24 ore si fanno su GitHub con il flusso *Fuzzing estensioni* (`.github/workflows/fuzz-estensioni.yml`, su richiesta), per esempio 5 job da 300 minuti con semi diversi.

---
**English summary.** An extension (`.acchplugin`) adds a file format reader. The package is one UTF-8 JSON document with a manifest and exactly one reader:
- **declarative `reader`** (recommended): data, not code. It describes text (delimiter, decimal, header line, columns, units, channels, short regexes for metadata) or simple binary layouts (endianness, offsets, types, counts from a field). The app's own interpreter runs it;
- **`wasm`**: a base64 module with no imports, an exported memory capped at 256 MB, and `acch_alloc`/`acch_read`;
- **`code`**: JavaScript calling `registerReader`.

All three run in the same dedicated, isolated Web Worker, separate from the core worker. Network, workers, messaging, storage, `eval`/`Function` and `import` are removed. There is a 15 s timeout and a configurable input size limit (64 MB by default) checked before reading. The page re-validates every result.

Optional example files with expected output are checked at install time; on a mismatch the extension is not installed. There is no signing, by decision: no key infrastructure exists, and the SHA-256 fingerprint lets users verify the package. Projects record `plugin = {id, version, name, sha256}` and keep the bytes if the extension is missing. Out of 3.0.0: a curated registry and a Rust reader. A fuzzing harness, with a manual CI workflow for 24-hour runs, covers packages, declarative specs, WASM modules and output validation.
