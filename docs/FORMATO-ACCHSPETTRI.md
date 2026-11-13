# Il formato di progetto `.acchspettri`

Un progetto è un normale archivio ZIP, apribile con qualsiasi programma: nulla è nascosto. Versione attuale del formato: **2** (dalla 3.0.0). La 3.0.0 legge anche tutti i progetti della versione 1 (2.x, 3.0.0-rc.1) e i vecchi `.acchiappa.json`.

Codice: `app/project-format.js` (lettura, scrittura, verifica; senza interfaccia, funziona anche in Node) e `app/project.js` (ciclo di vita del progetto nell'app). Lo schema è di proprietà della tappa I2 («nucleo»): chi ha bisogno di salvare dati nuovi propone il campo nel suo rapporto, non cambia lo schema da solo.

```
mimetype                    application/vnd.acchiappaspettri.project+zip (prima voce, non compressa)
manifest.json               formato, versioni, date, impronta SHA-256 e dimensione di ogni altra voce
README.txt                  spiegazione breve, in inglese
project/state.json          impostazioni, misure, confronti, riferimenti, libreria dei nomi, spettro aperto
project/sources.json        i file originali: uno per contenuto, anche se più spettri ne derivano
project/spectra.json        gli spettri: nome, percorso, sorgente, canale, memoria del lavoro, dati propri
project/libraries.json      indice delle librerie incorporate (id, revisione, nome, file)
data/000001.dat             un file originale, byte per byte (uno per sorgente)
libraries/000001.acchlib.json   contenuto di una libreria incorporata
series/000001.f64           matrice di una serie di spettri (binario little-endian)
cube/000001.f32             cubo di una mappa (binario little-endian)
processed/000001.csv        dati come visualizzati, leggibili (copia informativa: all'apertura si ricalcola dagli originali)
results/…                   tabelle dei risultati e bozza dei metodi (copia informativa)
```

## Regole
- **Autonomo e portabile**: i dati sono dentro il file, i percorsi sono sempre relativi; nessun percorso assoluto del computer.
- **Nessun contenuto eseguibile**: si leggono solo le voci elencate nel manifest e richiamate dallo schema; le altre si ignorano (avviso `unknown-entries`) e non si eseguono mai.
- **Verifica a ogni apertura**: impronta SHA-256 e dimensione di ogni voce letta, schema dei dati. Se qualcosa non torna il progetto non si apre e il lavoro corrente resta intatto.
- **Protezioni**: percorsi con `..`, assoluti o con barre rovesce rifiutati; limiti sulle dimensioni dichiarate dallo ZIP (`LIMITS`); chiavi JSON pericolose (`__proto__`, `constructor`, `prototype`) scartate; valori controllati prima di entrare nell'interfaccia.
- **Salvataggio verificato**: dopo la scrittura in memoria l'archivio viene riletto e verificato prima di considerarlo salvato. Nell'app desktop la scrittura è atomica e la versione precedente resta in `*.acchspettri.bak`.
- **Numeri**: nel JSON solo numeri finiti (niente `NaN`/`Infinity`); le matrici grandi vanno in binario (`series/`, `cube/`), mai nel JSON.

## `manifest.json`

| Campo | Tipo | Significato |
|---|---|---|
| `format` | `"acchspettri"` | identifica il formato |
| `formatVersion` | intero | versione con cui è scritto il file: **2** |
| `minReaderVersion` | intero | versione minima del lettore capace di aprirlo senza perdere dati: **2** |
| `mimetype` | stringa | come la voce `mimetype` |
| `appVersion` | stringa | versione dell'app che ha salvato |
| `title` | stringa | titolo del progetto |
| `createdAt`, `modifiedAt` | ISO 8601 | date |
| `spectra`, `sources`, `libraries` | interi | quanti record (informativi) |
| `entries` | oggetto | per ogni voce: `{sha256, size}`. Una voce non elencata non viene letta |

`minReaderVersion` è 2 perché un lettore della versione 1 (la 2.2.0) perderebbe in silenzio canali, serie, mappe, isoterme e librerie: meglio il messaggio «aggiorna l'applicazione».

## `project/sources.json`: i file originali, una volta sola

```json
[{"id":"000001", "data":"data/000001.dat", "size":42566, "sha256":"5ecd…", "binary":false}]
```
- Una sorgente per **contenuto** (impronta SHA-256 e modo di lettura `binary`): due spettri con gli stessi byte, anche con nomi o cartelle diversi, ne condividono una. È il caso dei canali di un file multicanale (ChemStation, `.arw`, Shimadzu), che sono più spettri da un solo file.
- `binary`: `true` se il file si legge come binario (`parseBinary`), `false` se come testo.
- `id` è unico nel file; `data` è sempre sotto `data/`.

## `project/spectra.json`: gli spettri

```json
[{"id":"000001", "name":"STD1.arw", "path":"run/STD1.arw", "source":"000001",
  "sampleKey":"STD1", "channel":"PDA Ch1 254/1.2 nm",
  "binary":false, "memory":{…}, "processed":"processed/000001.csv",
  "series":{…}, "cube":{…}, "iso":{…}}]
```

| Campo | Tipo | Significato |
|---|---|---|
| `id` | stringa | numero d'ordine, unico |
| `name` | stringa | nome del file originale |
| `path` | stringa | percorso relativo (anche dentro la cartella caricata) |
| `source` | stringa o `null` | `id` della sorgente in `sources.json`. `null` solo se lo spettro ha dati propri (`series`, `cube` o `iso`) e nessun file originale (per esempio importato da un progetto Origin o calcolato) |
| `sampleKey` | stringa o `null` | quale campione del file, quando un file ne contiene più d'uno (sequenze, file multicanale). `null` se il file ha un solo campione |
| `channel` | stringa o `null` | quale canale del campione, nella forma normalizzata di `app/channels-core.js` (`formatChannel`): `<rivelatore> <λ>/<banda> nm ref <λ>/<banda> nm`, per esempio `DAD1A 254/4 nm ref 360/100 nm`, `PDA Ch1 254/1.2 nm`, `UV 280/4 nm extracted` (dagli spettri di un `.uv`). `null` per un file di testo a un solo canale; i file dei rivelatori (`.ch`, `.arw`, Shimadzu) lo hanno sempre |
| `binary` | booleano | come la sorgente |
| `origin` | oggetto, facoltativo | per uno spettro preso da un progetto Origin (sorgente `.opj`/`.opju`): `{book, sheet, col}`, cioè cartella, numero del foglio (≥ 1) e colonna Y. Gli spettri dallo stesso progetto condividono la sorgente; il `path` termina con `#origin:libro|foglio|colonna`. Un lettore che non lo conosce rilegge la sorgente come file binario e non trova numeri: nessun numero sbagliato |
| `memory` | oggetto o `null` | il lavoro sullo spettro: titolo, descrizione, intervallo, etichette dei picchi (`labels`, con i rimandi `@id` alla libreria), picchi tolti e aggiunti, elaborazioni, deconvoluzioni, analisi (`fileMemory` in `index.html`) |
| `processed` | percorso, facoltativo | copia leggibile dei dati come visualizzati |
| `series`, `cube`, `iso` | oggetti, facoltativi | dati propri dello spettro, sotto |
| `extra` | oggetto, facoltativo | campi di una versione più nuova, conservati così come sono |

Le coppie (`source`, `sampleKey`, `channel`) distinguono gli spettri che vengono dallo stesso file. All'apertura l'app rilegge **una volta** ogni coppia (sorgente, percorso), carica solo i canali che il progetto contiene (senza la finestra «Canali trovati») e ritrova la memoria di ogni canale con la chiave `AcchChannels.memKey(path, sampleKey, channel)` = `path + "\u0000" + sampleKey + "\u0000" + channel` (solo `path` se tutti e due sono `null`) in `window.ACCH_PENDING_MEM`. Uno spettro salvato senza canale (versione 1, o 3.0.0-rc.1) si rilegge come allora, un solo spettro dal file.

### `series`: serie di spettri (cinetiche, DAD, MCR)

```json
{"kind":"kinetics", "t":{"values":[0,30,60], "quantity":"tempo", "unit":"s"},
 "x":{"values":[200,250,300,350], "quantity":"λ", "unit":"nm"}, "y":{"quantity":"A", "unit":""},
 "shape":[3,4], "dtype":"f64", "data":"series/000001.f64", "members":["000002","000003","000004"], "meta":{}}
```
- Matrice m × n con m = `t.values.length` (tempi o campioni) e n = `x.values.length` (asse spettrale).
- `data` è una voce binaria: `m·n` numeri `f64` (8 byte) o `f32` (4 byte) **little-endian**, in fila per righe: il valore al tempo `t[i]` e alla `x[j]` è l'elemento `i·n + j`.
- `kind`: `kinetics`, `dad`, `mcr`, `generic` o altro testo breve; `members`: facoltativo, gli `id` degli spettri del progetto da cui è stata composta; `meta`: facoltativo, oggetto libero (modello, vincoli, versione dell'algoritmo).
- In memoria (`decode` e `encode`) `data` è un `Float64Array` o `Float32Array`.

### `cube`: mappe e dati iperspettrali

```json
{"nx":3, "ny":2, "nc":1015, "order":"yxc", "x":{"values":[…1015], "unit":"cm-1"},
 "px":{"values":[0,1,2], "unit":"µm"}, "py":{"values":[0,1.5], "unit":"µm"}, "y":{"quantity":"intensità"},
 "dtype":"f32", "data":"cube/000001.f32", "meta":{}}
```
- `nx` × `ny` pixel, `nc` canali (bande). `x` è l'asse spettrale (lunghezza `nc`), `px` e `py` le coordinate dei pixel (lunghezza `nx` e `ny`, anche irregolari).
- `data`, in un campo separato dal JSON: `nx·ny·nc` numeri `f32` o `f64` little-endian, in ordine `yxc` (un pixel dopo l'altro, come BIP): il canale `c` del pixel (`ix`, `iy`) è l'elemento `(iy·nx + ix)·nc + c`. La voce ha la sua impronta SHA-256 nel manifest.
- Se la mappa viene da un file (`.wdf`, ENVI) la sorgente resta in `data/`: il cubo salvato evita di rileggerlo e conserva le elaborazioni per pixel. Un cubo di 1 GB si scrive in un progetto di oltre 1 GB: `LIMITS.archiveBytes` è 2 GB (vedi «Aperto» nel rapporto I2 per i cubi più grandi).

### `iso`: isoterme di adsorbimento (fisisorbimento, `autosorb/SPEC.md` §4)

```json
{"p":[10,50,100,300,700,300,100], "p0":[750.3,750.1,749.8,748,745,744,743.7], "n":[20,40,55,70,120,90,60],
 "t":77.35, "branches":{"ads":[0,5], "des":[4,7]}, "unit":{"p":"Torr", "n":"cm3 STP/g"}, "meta":{"gas":"N2"}}
```
- `p` pressione, `n` quantità adsorbita, `p0` pressione di saturazione **per punto** (o `null` se manca: allora l'app avvisa), stessa lunghezza; `t` temperatura in K o `null`.
- `branches.ads` e `branches.des`: intervalli di indici `[inizio, fine)` dei due rami (o `null`); possono condividere il punto di inversione.
- `unit`: unità di `p`, `p0`, `n`, `t` come testo; `meta`: oggetto libero (massa, adsorbato, parametri di riduzione, da dove vengono).
- Resta nel JSON: un'isoterma ha meno di 1000 punti.

### `memory.an.sorp` e `memory.an.chem`: impostazioni del fisisorbimento e del chemisorbimento
Campi facoltativi dentro `memory.an`: un lettore 2 che non li conosce li ignora senza perdere numeri, quindi la versione del formato non cambia. All'apertura passano da `SorpCore.cleanOpt` (`app/sorption-core.js`), che tiene solo numeri finiti, valori ammessi e dimensioni limitate.
- `sorp`:
  - `over`, cioè i parametri di riduzione scelti dall'utente: `gas`, `sigma` in nm², `T` in K, `rhoL`, `gamma`, `M`, `theta`, `stp` (`stp` o `iupac`), `thick`;
  - gli intervalli `betRange`, `langRange`, `drRange` (p/p₀) e `tRange.x`;
  - `tModel`, `bjhBranch`, `bjhThick`, `tpvX`, `tpvMode`, `lambda`;
  - `alphaRefKey` e `qstKeys`, che indicano altri spettri del progetto per percorso;
  - `kernel`, il kernel DFT dell'utente: `{name, x, w, K}`, al massimo 400 × 200.
- `chem`:
  - `factor` (µmol per unità d'area TCD), `mass_g`, `theo`, `beta`, `nu`;
  - per gli impulsi `loopVol`, `loopT`, `p`, `frac`, `nSat`, `tol`;
  - per lo statico `pa` e `pb`; per Monti–Baiker `S0` e `flow`; `coldTrap`;
  - `disp` = `{metal, loading, SF, uptake, M, rho, am, shape}`;
  - `kissKeys`.

## `project/libraries.json`: librerie incorporate

```json
[{"id":"lib-agilent1260-dad-alimenti", "revision":3, "name":"Agilent 1260 · DAD — alimenti", "file":"libraries/000001.acchlib.json"}]
```
- Ogni libreria usata dal progetto (REQUISITO-LIBRERIA, punto 7) è copiata per intero in `file`: il progetto resta autonomo anche su un altro computer.
- `id` unico nel progetto, `revision` intero ≥ 1: con lo stesso `id` vale la revisione più alta, e l'unione con la libreria dell'utente segue la strategia del Capo Progetto (voce per voce, conflitti all'utente).
- Il contenuto del file è il documento `.acchlib.json` così com'è (schema qui sotto). Il formato di progetto controlla solo che sia un oggetto JSON; la libreria dei picchi lo valida all'apertura. Si incorporano le librerie usate dagli spettri del progetto e quelle già incorporate all'apertura.
- La vecchia «libreria dei nomi» (`state.LIB`) resta in `state.json`.

### Il documento `.acchlib` (libreria dei picchi, tappa I4)

Una libreria vale per **una coppia (strumento, tipo di campione)**. Si salva con l'estensione **`.acchlib`** (decisione del Capo Progetto, 13/11/2026); il contenuto è JSON (UTF-8, formato `acchlib` 1). I file `.acchlib.json` della prima versione si leggono ancora, come le importazioni da un `.json`. È un file che si apre con qualsiasi editor; codice in `app/library.js` (`AcchLib.parse`, `normalize`, `serialize`, `merge`). Lo stesso documento sta in `libraries/*.acchlib.json` del progetto (nome interno dell'archivio, invariato), in `app_data_dir()/librerie/*.acchlib` (desktop), nelle cartelle condivise registrate e in IndexedDB (online).

```json
{"format":"acchlib", "formatVersion":1, "id":"lib-agilent-1260-infinity-dad-g4212b-alimenti-x7k2", "revision":3,
 "name":"Agilent 1260 Infinity · DAD — alimenti", "technique":"hplc",
 "instrument":{"brand":"Agilent", "model":"1260 Infinity", "detector":"DAD G4212B", "serial":""}, "sampleType":"alimenti",
 "methods":[{"id":"METODO-A.M", "column":"C18 150 × 4,6 mm", "notes":"", "aliases":["METODO-A"]}],
 "author":"", "createdAt":"2026-11-13T10:00:00Z", "modifiedAt":"2026-11-13T10:00:00Z", "description":"",
 "profile":"ricerca", "thresholds":{"dev":10, "diff":5, "drift":5}, "thresholdReason":"", "reminderDays":180,
 "maintenance":[{"date":"2026-12-01", "kind":"lampada", "target":"", "note":"", "author":"Tecnico A"}],
 "suitability":[{"date":"2026-12-02", "ok":true, "note":"", "author":"Tecnico A"}],
 "entries":[{"id":"v-…", "rev":2, "modifiedAt":"…", "name":"Caffeina", "x":3.21, "window":0.1, "rrt":null, "rrtRef":"",
   "channel":"DAD1A 220/4 nm ref off",
   "method":"METODO-A.M", "column":"", "integration":{"a":3.05, "b":3.38}, "profile":"",
   "cal":{"kind":"line", "slope":612.4, "intercept":0.8, "sa":0.6, "sb":2.1, "syx":1.9, "srel":0.008, "srelDf":12, "n":18, "df":16, "r2":0.9996,
          "xm":7.6, "ym":4660, "sxx":620, "lod":0.03, "loq":0.09, "range":[1,20], "areaUnit":"mAU·min", "concUnit":"mg/L",
          "date":"2026-11-13", "standardLot":"L-42", "normalized":false, "source":"taratura", "uStd":null, "measure":"area", "rrf":null},
   "source":null, "notes":"", "warnings":[], "chart":[{"date":"2026-11-14", "k":1.004}]}]}
```

| Campo | Significato |
|---|---|
| `format`, `formatVersion` | `"acchlib"`, `1`. Un file più nuovo si apre solo se `minReaderVersion` ≤ 1, altrimenti «aggiorna l'applicazione» |
| `id`, `revision` | identità della libreria e sua revisione (≥ 1, +1 a ogni modifica). Con lo stesso `id` le copie si uniscono voce per voce |
| `instrument`, `sampleType`, `technique` | la coppia (strumento, tipo di campione) e la tecnica (`hplc`, `ftir`, `raman`, `xrf`, `uv`). Campi liberi |
| `methods` | metodi della libreria; `aliases` sono i nomi del metodo nei file dello strumento (per esempio `ICCOM-A.M`) |
| `profile`, `thresholds`, `thresholdReason`, `reminderDays` | profilo predefinito delle voci e soglie (docs/SPEC-TARATURA-SALVATA.md). Soglie più larghe di quelle predefinite valgono solo con `thresholdReason`, mai oltre i massimi |
| `maintenance` | eventi di manutenzione (data, tipo, parte, nota, autore): invalidano le tarature salvate precedenti di quello strumento o colonna |
| `suitability` | idoneità del sistema del giorno (data, superata o no, nota, autore): una non superata blocca le tarature salvate di quel giorno. Registri: all'unione si sommano, senza conflitti |
| `entries[].x`, `window`, `rrt`, `rrtRef` | posizione (tR in min per l'HPLC, cm⁻¹, keV…), semiampiezza della finestra, RRT rispetto alla voce `rrtRef` |
| `entries[].channel` | canale del rivelatore come testo nel formato della tappa I3 (`AcchChannels.formatChannel`, per esempio `DAD1A 254/4 nm ref 360/100 nm`). Confronto con il file: rivelatore e λ obbligatori, banda e riferimento solo se presenti in entrambi |
| `entries[].integration` | zona di integrazione usata alla taratura; nel campione si sposta con il tR trovato |
| `entries[].cal` | taratura salvata: `kind` `line` (y = a + b·x) o `rf` (y = b·x); `srel` ripetibilità relativa per l'incertezza e `srelDf` i suoi gradi di libertà (U = t_df · x · …, decisione del Capo Progetto); `range` intervallo (nessuna estrapolazione); `areaUnit` e `concUnit`; `date` e `standardLot`; `source` `taratura` o `letteratura`; `rrf` per il profilo Impurezze |
| `entries[].chart` | carta di controllo della voce: k di ogni serie |
| `entries[].deleted` | voce tolta (lapide): resta perché un'altra copia non la faccia ricomparire all'unione |

Regole: chiavi `__proto__`, `constructor`, `prototype` scartate; testi limitati; solo numeri finiti; ogni voce senza nome si scarta con un avviso. Il testo si scrive in modo stabile (`serialize`): lo stesso contenuto dà la stessa impronta SHA-256.

**Scritture contemporanee** (DECISIONE-PO §7): si scrive solo se l'impronta del file è ancora quella letta (lato nativo `libs.rs`, oppure transazione IndexedDB). Altrimenti si unisce voce per voce con la versione letta come base (`id`, `rev`, `modifiedAt`): le voci cambiate da una parte sola entrano da sole, quelle cambiate da entrambe le parti le sceglie l'utente; annullare non scrive niente. Le copie di conflitto di OneDrive (`nome-PC.acchlib`, `nome (1).acchlib`, oppure lo stesso `id` in due file) si segnalano e non si usano mai al posto dell'originale. Nel desktop la versione precedente di una libreria dell'utente resta in `librerie/versioni/` (ultime 20). Sequenza della scrittura (`libs.rs`): lettura e confronto dell'impronta, file temporaneo nella stessa cartella, nuova lettura dell'impronta dell'originale, rinomina atomica; se l'originale è cambiato dopo il temporaneo si annulla e la pagina unisce. **Rischio residuo**: una scrittura di un altro computer che arriva tra l'ultima lettura e la rinomina (pochi millisecondi) verrebbe sostituita; su OneDrive la sincronizzazione ne fa di solito una copia di conflitto (segnalata), sulle librerie dell'utente la versione resta in `versioni/`. Su una cartella di rete senza blocchi non si può escludere del tutto (decisione PO §7: niente file di blocco).

**Apertura dal sistema**: `.acchlib` è associato con l'app come programma predefinito su Windows, macOS e Linux (`tauri.conf.json`, tipo `application/vnd.acchiappaspettri.library+json`): doppio clic → importazione con l'unione voce per voce e i conflitti espliciti. I vecchi `.acchlib.json`: doppio clic su Linux; su Windows e macOS, che vedono solo `.json`, l'app compare in «Apri con» (mai predefinita per tutti i JSON).

**Importazione della bozza di letteratura**: `examples/librerie/saliva-hplc-dad220.bozza.json` (schema `draft-acchiappaspettri-library-…`) si converte all'apertura (`AcchLib.fromDraft`). Non è installata né attiva di serie.

### Campi della libreria nella memoria dello spettro (`memory.an`)

Campi facoltativi aggiunti dalla tappa I4, che un lettore 2 senza libreria ignora senza perdere numeri (non cambiano `formatVersion`):

| Campo | Significato |
|---|---|
| `an.lib.st` | tipo di campione scelto dall'utente per lo spettro (ricordato nel progetto) |
| `an.lib.id` | libreria scelta a mano (assente: scelta automatica per strumento e tipo di campione) |
| `an.lib.ins`, `an.lib.insOk` | strumento corretto o confermato dall'utente (`{brand, model, detector, serial}`) |
| `an.libCtrl`, `an.libPos` | spettro di controllo del giorno (`an.role` = `qc`): valore nominale per `id` di voce; posizione `open` o `close` nella serie |

**Canale**: è il testo di `f.channel` della tappa I3 (per i file a un canale `chanOf(f)`), letto con `AcchChannels.parseChannel`. La prima versione della tappa I4 salvava un oggetto `{detector, lambda, …}`: all'apertura si converte nel testo.

## `project/state.json`

`{title, S, MV, COMPS, REFS, LIB, curIndex}`: impostazioni (`S`), misure per tecnica (`MV`), confronti (`COMPS`), riferimenti (`REFS`), libreria dei nomi (`LIB`, voci `{id, i, a, b, n}`), indice dello spettro aperto. Invariato dalla versione 1.

## Nell'app (`app/project.js`)
- **Salvataggio**: per ogni spettro si passano `f.raw` (byte), `f.sampleKey`, `f.channel`, `f.series`, `f.cube`, `f.iso` se il modulo che lo ha letto li ha messi su `f`. I moduli nuovi (multicanale, mappe, fisisorbimento, Origin) scrivono lì i loro dati: non serve toccare il formato.
- **Librerie**: `AcchProject.libraries` è l'elenco `[{id, revision, name, data}]` che si scrive al salvataggio; si riempie all'apertura con le librerie del progetto. La libreria dei picchi (I4) lo legge e lo aggiorna.
- **Spettri senza file originale** (`source: null`): all'apertura si chiama `AcchProject.restoreDerived(record)` se un modulo lo ha definito (deve restituire `true` se ha ricostruito lo spettro); altrimenti il record si conserva intatto e si riscrive al salvataggio successivo. Nessuna perdita in silenzio.
- **Libreria dei nomi**: all'apertura `libMerge` unisce `state.LIB` a quella dell'utente e restituisce `map` (id del progetto → id locale) quando una voce cambia id (conflitto, id oltre 40 caratteri, voce già presente con un altro id); i rimandi `@id` delle etichette si riscrivono con `map` prima di caricare gli spettri.

### API di `app/project-format.js`
- `encode(input, JSZip)` → `Uint8Array`. `input = {appVersion, title, createdAt, state, spectra:[{name, path, bytes?, binary?, memory?, processedCsv?, sampleKey?, channel?, origin?, series?, cube?, iso?, extra?}], libraries:[{id, revision, name?, data}], results:[{name, text}]}`. Errori `bad-input` per dati non validi (matrice di dimensioni sbagliate, numeri non finiti, id di libreria doppi).
- `decode(bytes, JSZip)` → sempre nella forma del formato 2: `{manifest, state, sources:[{id, data, size, sha256, binary, bytes}], spectra:[{…, source, sampleKey, channel, bytes, data, series?, cube?, iso?}], libraries:[{id, revision, name, data}], results, warnings}`. Gli spettri della stessa sorgente condividono lo stesso `Uint8Array`.
- `fromLegacyJson(text)` → la stessa forma, per i `.acchiappa.json`.
- Errori (`ProjectError.code`): `not-a-project`, `empty`, `corrupted`, `integrity`, `missing-entry`, `invalid-json`, `invalid-schema`, `unsafe-path`, `too-large`, `newer-format`, `no-migration`, `no-zip`, `bad-input`.

## Versioni e migrazioni
- File più vecchi: si passa dalla catena `MIGRATIONS` in `app/project-format.js`, in memoria, senza toccare il file originale. `MIGRATIONS[1]` porta la versione 1 alla 2: ogni `data/…` diventa una sorgente, `sampleKey` e `channel` valgono `null`, nessuna libreria incorporata; `manifest.readFrom` vale 1 e c'è l'avviso `migrated-from-1`. Al salvataggio successivo i byte uguali si scrivono una volta sola.
- File più nuovi: se `minReaderVersion` lo permette si apre con l'avviso `newer-format-compatible`, altrimenti messaggio «aggiorna l'applicazione».
- **Come si aggiunge un campo**: un campo facoltativo che un lettore 2 può ignorare senza perdere numeri non cambia la versione; un campo senza il quale i numeri sarebbero diversi richiede `formatVersion` 3, `minReaderVersion` 3 e una voce in `MIGRATIONS`.

## Fixture (non cancellarle: proteggono gli utenti)
- `test/fixtures/progetto-v1.acchspettri`: versione 1, costruito per provare il **contenitore** (impronte, percorsi, chiavi pericolose, ogni byte alterato). I suoi due «spettri» sono dati di prova, quindi l'app non ne legge nessuno e lo dice con «Il progetto è integro, ma nessuno dei suoi spettri si può leggere», non con «danneggiato».
- `test/fixtures/progetto-v1-spettri.acchspettri`: versione 1 salvata dalla 2.2.0 con due spettri sintetici (FTIR e HPLC), un titolo e una voce di libreria: deve aprirsi con tutto il suo contenuto.
- `test/fixtures/progetto-v1-completo.acchspettri`: versione 1 scritta dal codificatore della 3.0.0-rc.1 (`gen-progetto-v1-completo.js`) con tutto ciò che la versione 1 sa salvare: stato completo, confronti, riferimenti, libreria con un conflitto e un id lungo, etichette `@id`, due copie dello stesso file, un binario, risultati. Il contenuto atteso è in `progetto-v1-completo.atteso.json`; `test/unit/formato-v2.test.js` e `test/validation/i2-nucleo-ui.test.js` verificano la lettura senza perdite. Il file è congelato.
- I vecchi `.acchiappa.json` si aprono ancora; il salvataggio successivo crea un `.acchspettri`, e l'originale resta intatto.

## Cosa non contiene
Le fotografie del falso colore e i preset globali non fanno parte del progetto. Zoom e scheda aperta non vengono ripristinati.

---
**English summary.** `.acchspettri` is a plain, documented, versioned ZIP (format 2 since 3.0.0; format 1 and legacy `.acchiappa.json` are still read and migrated in memory). `manifest.json` lists every entry with SHA-256; `project/sources.json` and `data/` keep each original file once, byte for byte, even when several spectra (channels, told apart by `sampleKey` and `channel`) come from it; `project/spectra.json` holds per-spectrum work plus optional `series` (time × wavelength matrix), `cube` (nx × ny × channels map, binary data in a separate little-endian entry) and `iso` (adsorption isotherm); `project/libraries.json` and `libraries/` embed the peak libraries used (id and revision). A peak library (`.acchlib`, JSON format `acchlib` 1; older `.acchlib.json` files are still read) belongs to one (instrument, sample type) pair and holds entries with position, window, RRT, detector channel, method, column and the saved calibration (slope or response factor, intercept, units, range, n, R², s_y/x, relative repeatability, LOD, LOQ, date, standard lot); concurrent writes are merged entry by entry after a SHA-256 check, conflicts go to the user. Optional `memory.an.lib*` fields keep the sample type, chosen library, confirmed instrument and same-day control values of each spectrum. No absolute paths and no executable content; every entry is verified on opening. `minReaderVersion` is 2.
