# Validazione con materiali certificati

Questa cartella serve a controllare **quanto sono giusti i risultati di Acchiappaspettri** su campioni di composizione nota: materiali di riferimento certificati (per esempio i NIST SRM, i CHARM per le leghe di rame, i vetri Corning). Si mettono qui lo spettro e il certificato; uno script fa il calcolo con il nucleo dell'app e scrive un rapporto con i numeri a confronto.

Finora l'accuratezza dell'app è stata misurata soprattutto su spettri simulati con lo stesso modello (vedi `docs/studi/XRF-PYMCA-CFLIBS.md`, § 1.5 e § 4.4): questa è la prova sui materiali veri.

## In tre passi

1. **Crea una cartella** per il campione, qui dentro: per esempio `validazione/certificati/bronzo-charm-B1/`.
2. **Copia nella cartella** tre (o quattro) file:
   - lo **spettro** così come esce dallo strumento (`.mca`, `.spe`, `.txt`, `.csv`…);
   - il **certificato** come `certificato.csv` (formato sotto);
   - i **metadati** della misura come `metadati.json` (formato sotto);
   - se c'è, il file **`.cfg` di PyMca** dello strumento: le condizioni di misura si leggono da lì.
3. **Lancia**, dalla cartella principale di Acchiappaspettri (serve Node.js):

   ```sh
   node scripts/valida-certificati.js
   ```

   Il rapporto è in `validazione/certificati/risultati/rapporto.md` (da leggere) e `risultati.json` (per altri programmi). Lo script trova da solo tutte le cartelle che contengono `certificato.csv` e `metadati.json`, comprese le sottocartelle. Le cartelle che iniziano con `_` o `.` sono saltate.

   Altre possibilità: `node scripts/valida-certificati.js altra/cartella --uscita dove/scrivere --criteri miei-criteri.json`.

**Dati riservati.** Gli spettri di un cliente o di un museo non vanno messi in un repository pubblico: tienili in una cartella fuori da git, e passala allo script come primo argomento.

## Il certificato: `certificato.csv`

Una riga per elemento. La prima riga contiene i nomi delle colonne. Le righe che iniziano con `#` sono note (utile per scrivere la fonte del certificato, con la data e l'indirizzo).

| Colonna | Obbligatoria | Che cosa contiene |
|---|---|---|
| `elemento` | sì | simbolo (`Cu`, `Sn`) oppure ossido (`SiO2`, `Fe2O3`: il valore è convertito nell'elemento) |
| `valore` | sì | il valore del certificato; `<0.001` indica solo un limite |
| `incertezza` | no | l'incertezza **estesa** U del certificato, nella stessa unità del valore |
| `unita` | no (predefinita `%`) | `%` (in peso), `mg/kg`, `ppm`, `µg/g`, `g/kg` |
| `tipo` | no (predefinito `certificato`) | `certificato`; `indicativo` (valori «di riferimento» non certificati); `informativo` (senza incertezza); `per differenza` (calcolato, non certificato) |
| `k` | no | il fattore di copertura di U (se manca: 2) |
| `nota` | no | testo libero |

Si può usare anche il punto e virgola con la virgola decimale, come lo salva Excel in italiano:

```text
elemento;valore;incertezza;unita;tipo
Cu;84,12;0,15;%;certificato
Sn;7,96;0,08;%;certificato
Fe;350;20;mg/kg;indicativo
```

Solo i valori di tipo `certificato` entrano nei criteri (si cambia in `criteri.json`); gli altri sono riportati per informazione.

## I metadati della misura: `metadati.json`

Tutto è facoltativo tranne la tecnica; quello che manca si prende dal `.cfg` di PyMca, se c'è, altrimenti dai valori tipici dell'app (che il rapporto dichiara). Se un valore è sia nel `.cfg` sia qui, **vince questo file**.

### XRF

```json
{
 "tecnica": "xrf",
 "campione": "Bronzo CHARM B1",
 "fonte": "certificato del produttore, 2017",
 "strumento": "Bruker Tracer 5g",
 "spettro": "misura.pdz.txt",
 "cfg": "tracer5g.cfg",
 "anodo": "Rh", "kV": 40, "uA": 10, "tempo_s": 60,
 "filtro": {"materiale": "Al", "spessore_um": 100},
 "atmosfera": "aria",
 "angoli": {"ingresso": 45, "uscita": 45},
 "distanze_cm": {"tubo_campione": 1.0, "campione_rivelatore": 1.0},
 "rivelatore": {"tipo": "Si", "spessore_um": 450, "finestra_Be_um": 8},
 "finestra_tubo_Be_um": 125,
 "calibrazione": {"zero": -0.012, "guadagno": 0.0201},
 "intervallo_keV": [1.5, 38],
 "elementi": ["Cu", "Sn", "Pb", "Zn", "As", "Fe", "Ni", "Sb", "Ag"],
 "fissi_dal_certificato": false,
 "modo": "norm",
 "modello_picco": "ipermetro"
}
```

| Campo | Significato |
|---|---|
| `spettro`, `cfg` | nomi dei file (anche percorsi relativi alla cartella); se manca, lo script prende l'unico spettro o l'unico `.cfg` della cartella |
| `anodo`, `kV`, `uA`, `tempo_s` | tubo e tempo di misura (µA e tempo vanno solo nel rapporto) |
| `filtro` | filtro sul fascio: `materiale` (simbolo), `spessore_um`, `densita` in g/cm³ (non serve per Al, Ti, Ni, Cu, Zr, Mo, Ag, Fe, Sn, Pd, Rh, Nb); `null` = nessun filtro |
| `atmosfera` | `aria`, `elio` o `vuoto` |
| `angoli` | angolo d'ingresso del fascio e d'uscita verso il rivelatore, in gradi rispetto alla superficie |
| `rivelatore` | `tipo` (`Si` o `Ge`), spessore e finestra di berillio in µm |
| `eccitazione` | **solo** per un fascio monocromatico o una lista di energie (sincrotrone, ottiche con filtro): `[{"E": 16.0, "peso": 1}]`. Se c'è, sostituisce il tubo |
| `calibrazione` | zero e guadagno in keV per canale (e `quadratico`), se lo spettro non li contiene: altrimenti si usa quella del file, poi quella del `.cfg` |
| `intervallo_keV` | parte dello spettro usata nel calcolo (predefinita: quella del `.cfg`, altrimenti 1 keV – kV) |
| `elementi` | gli elementi da quantificare; se manca, quelli del certificato con una riga nell'intervallo |
| `fissi_dal_certificato` | `true`: gli elementi del certificato non elencati in `elementi` (perché invisibili, come C, Si o Mo a bassa energia) entrano con il valore del certificato e sono tolti dalla normalizzazione; il rapporto lo dice. `fissi` permette di indicarli a mano: `{"Si": 0.5}` |
| `modo` | `norm` (leghe, somma 100%), `oxides`, `compton` (come nell'app) |
| `modello_picco` | `gaussiano` (predefinito dell'app), `ipermetro` (modello completo con code, fughe e picchi somma), `come_cfg` (ipermetro con i parametri di forma, Noise e Fano del `.cfg` di PyMca) |

### LIBS

```json
{
 "tecnica": "libs",
 "campione": "Vetro NIST SRM 610",
 "spettro": "media-50-colpi.csv",
 "strumento": "…",
 "laser": {"lunghezza_onda_nm": 1064, "energia_mJ": 50, "durata_ns": 8},
 "ritardo_us": 1.0,
 "gate_us": 10,
 "larghezza_strumentale_nm": 0.05,
 "risposta_spettrale": "risposta.csv",
 "atmosfera": "aria"
}
```

Lo spettro LIBS va in due colonne: lunghezza d'onda in nm e intensità. `risposta_spettrale` è la curva di efficienza dello spettrometro, se è nota (due colonne: nm e fattore relativo).

**La quantificazione LIBS senza standard (CF-LIBS) non è ancora disponibile**: il modulo `app/libs-cf-core.js` è in preparazione. Fino ad allora il rapporto scrive «non ancora disponibile» per i campioni LIBS. Interfaccia prevista: una funzione `quantify(spettro, opzioni)` con lo spettro `{x: nm, y}` e i metadati come opzioni, che restituisce `{res: {El: {w: % in peso, sw: incertezza}}}`.

## Come si giudica

I criteri sono in `criteri.json` e si possono cambiare. Quelli proposti:

| Valore certificato | Errore relativo ammesso |
|---|---|
| sopra l'1% in peso | ±10% |
| fra 0,1 e 1% | ±25% |
| sotto lo 0,1% | solo segnalato, non giudicato |

e in più **ζ ≤ 2** (con `"combinazione": "e"` servono entrambe le condizioni), dove ζ = |trovato − certificato| / √(u² + (U/k)²): la differenza confrontata con le incertezze. u è l'incertezza dell'app: quella di conteggio più un 5% di incertezza del modello (modificabile; da sola, l'incertezza di conteggio di uno spettro di milioni di conteggi è troppo piccola e ogni scarto risulterebbe «significativo»). ζ ≤ 2 equivale a E_n ≤ 1 con k = 2; il rapporto riporta anche E_n = |x − ref| / √((2u)² + U²). Attenzione all'effetto combinato: con il 5% di incertezza di modello, ζ ≤ 2 vuol dire in pratica un errore entro il 10% circa anche fra 0,1 e 1%, dove la fascia ammetterebbe il 25%, salvo che l'incertezza di conteggio o quella del certificato siano grandi. Chi vuole giudicare solo l'accuratezza mette `"combinazione": "errore"`; chi vuole che basti una delle due condizioni mette `"o"`.

Esiti possibili per ogni elemento: **superato**, **non superato** (con il motivo), **non trovato** (nel certificato e valutato, ma non quantificato), **segnalato** (sotto la soglia), **fisso** (preso dal certificato), **informazione** (valore non certificato).

## L'esempio: NIST SRM 1155

`esempi/nist-srm-1155/` usa dati **pubblici**: lo spettro `Steel.spe` e la configurazione `Steel.cfg` distribuiti con PyMca (licenza MIT, in `test/fixtures/pymca/`), e i valori del certificato NIST SRM 1155 (emissione del 9 novembre 2012), trascritti con la fonte in testa a `certificato.csv`. Il ferro non è certificato: la riga Fe è calcolata per differenza e non entra nei criteri.

Lo spettro è stato acquisito con un fascio **monocromatico a 16 keV**, non con un tubo: i metadati lo dicono con `"eccitazione"`. Il nucleo 3.1 lo accetta (`fpSetup` con `exc`); con un nucleo più vecchio lo script usa il ripiego del prototipo `ricerca/xrf-pymca/acch_confronto.js` (lo spettro del tubo nella cache sostituito dalla riga a 16 keV) e lo scrive negli avvisi. Mo, Si, C, S, P, N, W, As e Pb non si misurano fra 4,5 e 15 keV: entrano con il valore certificato.

Il risultato aggiornato è in `risultati/rapporto.md`. Al 19 novembre 2026 (nucleo 3.1, picco ipermetro): Cr +1,2%, Mn +0,3%, Cu −1,4% superati; Ni −9,3%: dentro il 10%, ma ζ = 2,02 appena sopra 2, quindi non superato; **Co +263%** non superato (la sua Kα, 6,93 keV, sta sotto la Kβ del ferro, 7,06 keV, e il ferro è circa 600 volte più abbondante); V sotto lo 0,1%, solo segnalato. Esito del campione: 3 elementi superati su 5 valutati.

## Per chi sviluppa

- Script: `scripts/valida-certificati.js` (le funzioni sono esportate; test in `test/unit/valida-certificati.test.js`, con dati finti).
- Il nucleo si carica come nei test (`test/unit/load-core.js`); il `.cfg` di PyMca si legge con `app/pymca-cfg-core.js`.
- Perché la cartella è qui e non in `test/validation/`: è una cartella **di lavoro per l'utente**, dove si aggiungono a mano spettri e certificati (anche riservati), non una prova automatica della CI; resta fuori dai pacchetti dell'app (che copiano solo `app/` e `vendor/`).
- Non è collegata a `docs/VALIDAZIONE.md`, che è generato da `scripts/gen-validazione.js`.
