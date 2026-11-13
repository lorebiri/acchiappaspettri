# File d'esempio SINTETICI · SYNTHETIC example files

**Nessuno di questi file è una misura reale.** Sono calcolati da [`genera-esempi-sintetici.js`](genera-esempi-sintetici.js) (`node examples/genera-esempi-sintetici.js`, risultato sempre uguale) e servono ai [tutorial](../docs/tutorial/README.md). Ogni file lo dichiara nel nome (`SINTETICO`) e nella prima riga.

**None of these files is a real measurement.** They are computed by [`genera-esempi-sintetici.js`](genera-esempi-sintetici.js) (always the same output) and are used by the [tutorials](../docs/tutorial/README.md). Each file says so in its name (`SINTETICO` = synthetic) and in its first line.

| Cartella · Folder | Contenuto · Content | Valori usati · Values used |
|---|---|---|
| `ftir-polietilene-sintetico/` | 6 spettri FTIR-ATR di polietilene, 0–1000 h · 6 ATR-FTIR spectra of polyethylene | carbonile che cresce con il tempo · carbonyl growing with time |
| `hplc-taratura-sintetico/` | 6 standard, bianco, controllo, 2 incogniti · 6 standards, blank, control, 2 unknowns | standard 0,5–20 mg/L; controllo 8; A 3,7; B 12,4 mg/L |
| `librerie/` | bozza di libreria HPLC dalla letteratura (non sintetica: valori pubblicati), importabile · draft HPLC library from the literature (published values, not synthetic), importable | Agilent 1260 · DAD, 220 nm; vedi `docs/SPEC-TARATURA-SALVATA.md` |
| `xrf-lega-sintetico/` | 1 spettro XRF, tubo Rh 40 kV · 1 XRF spectrum, Rh tube 40 kV | Cu 84, Sn 8, Pb 5, Zn 2,5, As 0,5 % |

Lo spettro XRF è calcolato con il modello a parametri fondamentali dello stesso programma: l'accordo con il risultato è quindi più stretto che su un oggetto reale.
The XRF spectrum is computed with the program's own fundamental-parameters model: agreement with the result is therefore closer than on a real object.
