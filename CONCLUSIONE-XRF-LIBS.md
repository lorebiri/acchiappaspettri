# Conclusione: XRF più completo e base per la LIBS (verso la 3.1)

*19 novembre 2026, ramo `claude/xrf-libs-3.1` (partito da `claude/studio-pymca`). Nessun merge su `desktop` o `main`, niente pubblicato. Il piano era [docs/studi/XRF-PYMCA-CFLIBS.md](docs/studi/XRF-PYMCA-CFLIBS.md).*

## In breve, per chi non è del mestiere

- **Il programma ora «vede» meglio i picchi degli spettri XRF veri.** I rivelatori reali non danno picchi perfettamente a campana: hanno una coda verso le basse energie, piccoli picchi «fantasma» (fughe) e, quando arrivano molti fotoni insieme, picchi «somma». Ora l'app li descrive come fa PyMca, il programma di riferimento. Sull'unico spettro reale di un materiale certificato che abbiamo (un acciaio NIST distribuito con PyMca) il fit è **circa due volte più aderente** di prima, e anche più aderente di quello di PyMca con le sue impostazioni.
- **Niente più elementi inventati nei casi noti.** Prima, in uno stagno puro l'app proponeva anche antimonio e iodio; in un bronzo all'arsenico senza piombo poteva mettere piombo. Ora ogni elemento proposto viene messo alla prova sul fit: se le sue righe sono già spiegate dagli altri elementi, viene tolto dal calcolo e l'app lo scrive.
- **Il tubo a raggi X è descritto con una formula pubblicata** (Ebel, 1999) invece che con costanti scelte a mano; si possono impostare anodo, tensione, angoli e finestra.
- **Chi usa PyMca può portare le sue impostazioni**: l'app legge e scrive i file `.cfg` di PyMca.
- **C'è un confronto automatico con PyMca** che gira a ogni modifica, e una **cartella pronta per i materiali certificati**.
- **Sono arrivati i primi dati reali di laboratorio** (6 bronzi certificati misurati con un XRF portatile, risultati CF-LIBS già calcolati, spettri Raman di polimeri e pigmenti). Hanno subito fatto trovare **tre difetti**, ora corretti: l'app leggeva male la calibrazione dei file di quello strumento (lo stagno risultava 3–6 volte troppo basso), la CF-LIBS ignorava lo zinco, e per il Raman con fluorescenza la base consigliata toglieva troppo segnale. Dopo le correzioni, sui bronzi certificati l'errore medio è di circa il 9–10%, con il rame entro l'1%. I dati restano riservati: qui ci sono solo risultati aggregati ([docs/VALIDAZIONE-DATI-REALI.md](docs/VALIDAZIONE-DATI-REALI.md)).
- **Prima base per la LIBS senza taratura** (CF-LIBS: Ciucci et al., 1999, doi:10.1366/0003702991947612), segnata «sperimentale»: funziona sugli spettri simulati, non ancora su spettri veri.
- **I progetti salvati non cambiano**: chi riapre un lavoro fatto con la 3.0 ottiene gli stessi numeri, con un avviso che spiega come passare al nuovo modello.

## Che cosa è stato fatto, punto per punto

| # | Richiesta | Stato | Dove |
|---|---|---|---|
| 1 | Fit XRF completo: ipermetro con parametri del rivelatore, fughe di tutte le righe (Kα e Kβ, Si o Ge), picchi somma con opzione, Fano libero o fissabile, termine quadratico, Levenberg–Marquardt | fatto | `xrfFitHyper`, `xrfHyperAt`, `xrfEscape`, `lmBox` in `index.html`; test `test/unit/xrf-fit-completo.test.js` |
| 1b | Falsi elementi di LIMITAZIONI (Sb e I nello stagno, Pb al posto di As) | spariscono o sono segnalati | `xrfConfirm`, `xrfFPAuto`; test nel browser `test/validation/r5-xrf-ui.test.js` |
| 2 | Spettro del tubo di Ebel, anodi, kV, angoli, berillio; fluorescenza terziaria | fatto (terziaria approssimata) | `fpTubeEbel`, `fpIntensities`; test `test/unit/xrf-tubo-ebel.test.js` |
| 3 | FP_DATA con Lγ, M, rese; controllo con xraylib | fatto | `scripts/gen-fp-data.py`, `scripts/check-fp-data.py`; test `test/unit/fp-dati.test.js` |
| 4 | Import ed export dei `.cfg` di PyMca | fatto, verificato con PyMca vero | `app/pymca-cfg-core.js`, pannello delle concentrazioni; test `test/unit/pymca-cfg.test.js` |
| 5 | Confronto automatico con PyMca 5.9.7 + fisx 1.3.2 | fatto: test in CI e sezione R15 di VALIDAZIONE.md | `scripts/confronto-pymca.py`, `scripts/confronto-pymca.js`, [docs/VALIDAZIONE-PYMCA.md](docs/VALIDAZIONE-PYMCA.md) |
| 6 | Pronti per i materiali certificati | fatto, con l'esempio NIST SRM 1155 | [validazione/certificati/](validazione/certificati/README.md), `scripts/valida-certificati.js` |
| 7 | Base CF-LIBS: dati NIST, Boltzmann e Saha–Boltzmann, Stark, chiusura, autoassorbimento, interfaccia sperimentale, validazione | fatto (sintetici); uno spettro pubblico reale provato | `app/libs-data.js`, `app/libs-cf-core.js`, `app/libs-cf-ui.js`, [docs/CF-LIBS.md](docs/CF-LIBS.md) |
| 8 | Citazioni Cesareo 2008 e Trojek 2011 | corrette | `fpLayerSolve` e bibliografia dell'app; studio § 5 |
| — | Dati reali di laboratorio (arrivati durante il lavoro): XRF sui 6 bronzi certificati, CF-LIBS contro i risultati del laboratorio, Raman per la rimozione del fondo | fatto; tre difetti trovati e corretti | [docs/VALIDAZIONE-DATI-REALI.md](docs/VALIDAZIONE-DATI-REALI.md); dati e rapporti dettagliati fuori dal repository |

Lavoro con due agenti (CF-LIBS; file `.cfg` e materiali certificati), uniti nel ramo. 365 test unitari verdi su 371, 6 saltati come prima (prima 305 su 311); validazione numerica 77/77, validazione nell'interfaccia 211/211, collaudo dell'interfaccia 39/39, benchmark 36/36.

## Risultati prima e dopo

### Acciaio NIST SRM 1155 (spettro reale distribuito con PyMca, fascio monocromatico a 16 keV)

Stesso intervallo di PyMca (2,4–17 keV), condizioni lette dal `.cfg` di PyMca.

| | Acchiappaspettri 3.0 | **Acchiappaspettri 3.1** | PyMca 5.9.7 (sua configurazione, sola gaussiana) | PyMca con ipermetro |
|---|---|---|---|---|
| χ² ridotto del fit | 15,2 (22,2 nel prototipo dello studio, 4,5–15 keV) | **7,9** (8,2 con i pesi 1/√y, prima del debug indipendente) | 13,1 | 19,2 |

Aree dei picchi, 3.1 contro PyMca: Cr −0,8%, Fe −0,4%, Ni −0,1%, Cu +0,2%; Mn −11% (la sua riga sta sotto la Kβ del cromo e i due programmi la dividono in modo diverso).

Concentrazioni normalizzate su Cr+Mn+Fe+Ni+Cu, scarto dal certificato NIST:

| | 3.0 | **3.1** | PyMca |
|---|---|---|---|
| Cr | −3,2% | −3,9% | +5,5% |
| Mn | −3,0% | **−1,5%** | +13% |
| Ni | −5,0% | −4,8% | −6,7% |
| Cu | +2,5% | **+1,3%** | +0,0% |

Lettura: su questo spettro il tubo non conta (fascio monocromatico), quindi le concentrazioni cambiano poco; il guadagno vero è nel fit (forma dei picchi, fughe, picchi somma). Con lo script dei materiali certificati (intervallo 4,5–15 keV, elementi non misurabili presi dal certificato) Cr, Mn, Cu e Ni stanno entro i criteri (4 su 5); **Co** (0,1%) no: la sua riga è sotto la Kβ del ferro, 600 volte più intensa.

### Falsi elementi (spettri SINTETICI dei collaudi)

| Spettro | 3.0 | 3.1 |
|---|---|---|
| Stagno puro (4 spettri) | Sn 99,5–99,6% più **Sb e I** (0,04–0,5%) | **solo Sn**; avviso «Sb e I non confermati dal fit» |
| Bronzo arsenicale senza Pb, molti conteggi | As 1,9%, niente Pb | As 1,9%, niente Pb (Pb proposto e tolto dalla verifica) |
| Bronzo arsenicale, picco di 300 conteggi | As 3,5% (vero 2%) con avviso «As non distinguibile da Pb» | As e Pb **non confermati** (la riga non è significativa) e l'avviso lo dice |
| Lega d'argento con tubo ad argento | Cl 0,06% falso | Cl tolto |

### Spettro del tubo e banche dati

- Continuo di Ebel identico a PyMca entro lo 0,5% (Rh, Ag, Mo, W; angoli diversi), righe K entro l'1%; righe L calcolate anche per i tubi a tungsteno (PyMca non le dà).
- Banca dati: aggiunte righe Lγ e M, rese e Coster–Kronig senza cambiare nessun valore della 3.0. Il controllo con xraylib ha trovato che la produzione delle righe della 3.0 si discosta fino al 10% (95° percentile) per gli elementi leggeri e le Lγ lontano dagli spigoli; la tabella più fine del modello 3.1 scende sotto il 4%.

### CF-LIBS (spettri SINTETICI generati con lo stesso modello)

| Caso | Temperatura | Densità elettronica | Concentrazioni (vero → trovato, % in peso) |
|---|---|---|---|
| Bronzo | −0,5% | −6,7% | Cu 85 → 84,8 · Sn 8 → 8,05 · Zn 4 → 4,07 · Pb 3 → 3,08 |
| Acciaio | −0,3% | −2,2% | Fe 70 → 70,3 · Cr 18 → 17,9 · Ni 10 → 9,7 · Mn 2 → 2,0 |
| Vetro | −0,3% | −2,3% | O 45 → 47,1 · Si 33 → 32,2 · Na 10 → 9,0 · Ca 7 → 6,7 |

Con autoassorbimento simulato l'errore medio scende dal 56–57% al 12–16% con la correzione dalla larghezza delle righe (*Spectroscopy* 2022, doi:10.56530/spectroscopy.xq8876v9). Sull'unico spettro LIBS pubblico con composizione nota trovato (SuperLIBS 10K, roccia, CC BY 4.0) il calcolo non dà risultati utili: gli autori hanno normalizzato separatamente le regioni dello spettro, quindi la condizione base della CF-LIBS (stessa efficienza su tutto lo spettro) non vale.

### Dati reali di laboratorio (riservati; risultati aggregati)

**XRF, 6 standard di bronzo certificati, 60 spettri** (errore relativo rispetto al certificato):

| | Errore medio | Mediana | Cu | Zn | Sn | Pb | χ² ridotto |
|---|---|---|---|---|---|---|---|
| Prima della correzione del lettore (entrambi i modelli) | — | — | | | **Sn 3–6 volte troppo basso** | | |
| 3.0 | 9,0% | 10,2% | +1,5% | −10,5% | −7,8% | −7,0% | 7,0 |
| **3.1** | 9,7% | **8,5%** | **−0,3%** | −10,5% | +9,7% | +1,6% | **6,0** |

Lo Zn ambiguo di uno standard (0,3 o 0,003%) è 0,3%: lo dicono le aree dei picchi tarate sugli altri cinque standard (0,31%). Zn resta sottostimato del 10% da entrambi i modelli; in uno standard il Pb è la metà del certificato con entrambi i modelli, e la misura SEM gli dà ragione.

**CF-LIBS**: la CF-LIBS calcolata dal laboratorio sugli spettri veri ha errore medio 21% (Sn e Pb −33%). L'app, su spettri sintetici realistici con le stesse temperature e densità, va bene in plasma otticamente sottile (mediana 6%) ma è fragile con autoassorbimento forte (mediana 18–33%): resta sperimentale.

**Raman**: con le basi consigliate SNIP e ALS si ritrovano il 75–77% dei picchi tabulati dei pigmenti (65% senza base). IModPoly, consigliata dalla 3.0 con fondo alto, toglieva troppo segnale in 6 spettri su 13; ora l'assistente lo evita (sotto-sottrazione dal 18,5% all'1,8%, picchi ritrovati dal 75% al 78%).

## Confronto con PyMca: che cosa dice e che cosa no

- **Dove i due programmi si possono confrontare in modo pulito** (Steel.spe), le aree coincidono entro l'1% e il fit dell'app è più aderente.
- Sullo **standard sottile** di PyMca (XRFSpectrum.mca) il χ² è uguale (1,53 contro 1,55), ma le aree differiscono del 3–12% a seconda di come si toglie il fondo: lì il fondo pesa molto. Non è un errore di uno dei due: è il margine di incertezza del metodo, e va detto.
- Sul **bronzo sintetico** i due programmi, entrambi con il tubo di Ebel, differiscono fino al 17% su Pb: le geometrie (aria, finestre) sono solo approssimativamente uguali.
- **Il confronto con PyMca non è una validazione**: dice che i due programmi fanno conti simili, non che sono giusti. La validazione la danno i materiali certificati.

## Che cosa resta per i prossimi dati

1. **Altri materiali certificati XRF** (leghe diverse, vetri, pigmenti, altri strumenti). Copiare ogni spettro con il suo certificato (CSV: elemento, valore, incertezza, unità, tipo) e i metadati dello strumento (o il `.cfg` di PyMca) in `validazione/certificati/<campione>/` e lanciare `node scripts/valida-certificati.js`. Il rapporto dice, elemento per elemento, errore relativo, ζ e se i criteri sono rispettati. Le istruzioni sono in [validazione/certificati/README.md](validazione/certificati/README.md).
2. **Che cosa decideremo con quei dati.** (a) Se il tubo di Ebel è davvero meglio delle costanti della 3.0 (sui sintetici della 3.0 dà scarti del 3–5%, che misurano solo la differenza fra i modelli). (b) Le soglie della verifica degli elementi (oggi 3σ sulla riga analitica e Δχ²/χ²ᵣ ≥ 25). (c) Se la terziaria approssimata basta per gli acciai o serve il calcolo completo.
3. **Spettri LIBS veri** (non saranno forniti con i dati di laboratorio: servono altre fonti). Servono, per ogni spettro: risposta spettrale dello strumento (curva di efficienza), larghezza strumentale, ritardo e finestra di acquisizione, energia del laser, e la composizione certificata. Senza la risposta spettrale la CF-LIBS non può essere accurata.

## Punti aperti e decisioni per Lorenzo

- **Dati reali di laboratorio, riservati.** Sono nel repository privato di validazione; i rapporti dettagliati (per standard e per spettro) e gli script che li producono sono stati scritti fuori dal repository pubblico, sulla macchina di questa sessione (`/home/user/validazione-privata-risultati/`): la sessione aveva solo accesso in lettura al repository privato, quindi non li ha caricati lì. Vanno copiati nel repository privato prima che la sessione venga chiusa.
- **Zn sottostimato del 10%** sui bronzi veri con entrambi i modelli: da capire (rapporto Kβ/Kα del Cu, coda dei picchi del Cu, efficienza del rivelatore).

- **Dati NIST per la LIBS: decisione presa** (dopo il debug indipendente): non sono più nel repository né nell'app; l'utente li scarica dal NIST dal pannello CF-LIBS, finché il NIST non dà il permesso di ridistribuirli. Testo precedente: I dati del NIST Atomic Spectra Database sono protetti dallo Standard Reference Data Act: la pagina del NIST dice di non ridistribuirli senza permesso. Sono nel repository (`app/libs-data.js`), come richiesto, ma prima di pubblicare una versione bisogna chiedere il permesso al NIST oppure distribuire solo lo script che li rigenera.
- **Modello 3.1 come predefinito per le analisi nuove.** È la scelta fatta, perché sullo spettro reale è migliore; i test e il tutorial costruiti su spettri sintetici della 3.0 usano ora esplicitamente il modello 3.0 dove verificano quei numeri. Se si preferisce aspettare altri dati reali, basta cambiare il predefinito in `fpCfg` (una riga).
- **Tempi.** Il modello 3.1 richiede 1–4 secondi per spettro nella versione online (sul desktop il calcolo gira nel processo separato). Si può ancora ottimizzare.
- **Lettore dei file a una colonna.** Durante il confronto è emerso che `parseXRF` scarta la prima riga di un file `.mca` a una colonna senza intestazione (come `XRFSpectrum.mca` di PyMca): lo spettro risulta spostato di un canale. Non corretto qui (tocca il lettore di tutti i formati); segnalato.
- **Da leggere a mano**: l'articolo di Ebel 2003 sulle righe L (costanti prese da XMI-MSIM) e quello di Gigosos 2003 per Hα e Hβ (coefficienti da fonti secondarie).

## Debug finale

Fase chiesta da Lorenzo dopo i punti 1–8: revisione indipendente, prove d'uso, confronto prima e dopo, correzione di ogni bug confermato con il suo test.

**Revisione indipendente** (un agente che non aveva scritto il codice, su tutto il ramo). Nessuna regressione del modello 3.0: con il modello 3.0 i numeri sono identici alla 3.0.0 (esempio del bronzo e 15 spettri di collaudo, modi «leghe» e «Compton», con e senza geometria dal Compton: differenza massima 0). Bug confermati e corretti, ognuno con un test:

| Gravità | Problema | Correzione | Test |
|---|---|---|---|
| alta | un `.cfg` con una sezione `[__proto__]` scriveva sul prototipo di tutti gli oggetti della pagina | sezioni e chiavi `__proto__`, `constructor`, `prototype` scartate | `pymca-cfg.test.js`, `xrf31-flussi-ui.test.js` |
| media | i progetti salvati da questo ramo (versione ancora 3.0.0), riaperti, passavano al modello 3.0 | contrassegno `xrfModel` nello stato del progetto | `xrf31-flussi-ui.test.js` |
| media | tubo a trasmissione con anodo di 1–2 µm: intensità enormi o infinite | profondità di generazione limitata allo spessore dell'anodo | `xrf-tubo-ebel.test.js` |
| media | angolo d'uscita fuori 3–90° o spessori negativi: composizione tutta NaN | valori impossibili riportati ai tipici | `xrf-tubo-ebel.test.js` |
| media | tempi nella versione online (il calcolo gira nella pagina): fino a 4 s per spettro da 4096 canali | code esponenziali senza erfc lontano dal picco, colonne pesate senza callback, analisi di sensibilità che riusa la forma del picco: 2,6 → 1,6 s. Resta lento sui file molto grandi (vedi sotto) | numeri invariati (rapporti rigenerati: cambia solo l'ultima cifra) |
| bassa | un `return` finito in un commento: le righe del tubo diffuse comparivano fra le aree sotto la chiave «null» | riga separata | `xrf-fit-completo.test.js` |
| bassa | `[peaks]` con chiavi come `toString`: elemento fasullo e calcolo in errore | solo elementi veri (`hasOwnProperty`), anche nei progetti | `xrf31-flussi-ui.test.js` |
| bassa | espressione regolare quadratica nel lettore `.cfg` (2 s su una riga di 40 000 spazi) e ricorsione senza limite nelle formule | ricerca del separatore senza espressione regolare; massimo 64 livelli di parentesi | `pymca-cfg.test.js` |
| bassa | eccitazione oltre 400 energie troncata solo alla riapertura del progetto, senza avviso; energie oltre 50 keV fuori dalle tabelle | troncata e filtrata subito all'importazione, con avviso | `xrf31-flussi-ui.test.js` |
| bassa | CF-LIBS: standard interno senza righe e n_e non positiva ignorati in silenzio; T negativa possibile dopo iterazioni non convergenti | avvisi `closureRefMissing` e `neInvalid`; controllo della pendenza alla fine | `libs-cf.test.js` |
| bassa | due energie di eccitazione uguali alla seconda cifra: componenti di diffusione con lo stesso nome | un solo picco | — |

Sospetti del revisore rimasti aperti, perché non riprodotti o con effetto piccolo: la memoria della fluorescenza terziaria con più strati (chiave sulla sola composizione del supporto) e l'unione a catena di multipletti LIBS molto fitti.

**Export reali dello strumento (indicazione di Lorenzo).** Il difetto dello Sn era nella lettura dell'export, non nei dati: l'ELIO scrive uno slot vuoto «Calibration3: 0 0» che il lettore usava (corretto). Ora `.mca` e `.spt` dello stesso standard danno la stessa calibrazione e gli stessi picchi; il tempo vivo è letto in entrambi; aria ed elio danno composizioni coerenti. I `.xga` (progetti ELIO, DataSet .NET binario) non si leggono: l'app lo dice e spiega come esportare gli spettri.

**Prove d'uso nel programma vero** (Playwright, web e anteprima desktop, italiano e inglese): file XRF nuovo col modello 3.1, elementi aggiunti, `.cfg` esportato e reimportato, `.cfg` ostile, progetto salvato e riaperto (stessi numeri, stesso modello), progetto della 3.0 riaperto (modello 3.0 e avviso), pannello in inglese; CF-LIBS nel pannello delle ipotesi in italiano e in inglese; stagno puro nell'anteprima desktop (Sb e I tolti, 0,7 s). Nuovo test `test/validation/xrf31-flussi-ui.test.js` nella validazione dell'interfaccia.

**Prima e dopo su tutti gli esempi di `examples/`** (la pagina della 3.0.0 contro quella del ramo, nel browser): i 6 spettri FTIR e i 10 cromatogrammi HPLC danno picchi, aree, ipotesi e avvisi identici. L'unica differenza è la stima XRF del bronzo, voluta: con il modello 3.1, predefinito per le analisi nuove, Sn 8,34 → 8,74% e Pb 5,38 → 5,55% (tubo di Ebel invece di Kramers su uno spettro costruito con Kramers); con il modello 3.0 i numeri sono quelli di prima. Il tutorial 3 è stato aggiornato con i numeri del 3.1 (le schermate mostrano ancora quelli della 3.0).

**Esito delle suite** (in locale, ultima esecuzione): test unitari 372 su 378 (6 saltati come prima), validazione numerica 77/77, validazione nell'interfaccia 213 prove (l'ultima esecuzione completa: 211 passate; le 2 fallite sono state ricontrollate: il riferimento «golden» del corpus nel browser aveva ancora il vecchio consiglio IModPoly su 4 spettri Raman con fluorescenza ed è stato aggiornato al nuovo consiglio SNIP/ALS, cambio voluto; la prova dei tempi I9 superava i 50 ms solo con la macchina carica e da sola passa), collaudo dell'interfaccia 39/39, benchmark 36/36. CI su GitHub: vedi il messaggio finale.

**Limiti noti rimasti.** Nella versione online, senza processo separato, un file XRF molto grande (16 000 canali) col modello 3.1 e la verifica degli elementi richiede ancora alcuni secondi; sul desktop il calcolo gira nel processo separato. Zn sottostimato del 10% sui bronzi veri; CF-LIBS fragile con autoassorbimento forte.

## Riferimenti principali

Solé et al. 2007 (PyMca), doi:10.1016/j.sab.2006.12.002 · Van Gysel et al. 2003 (ipermetro), doi:10.1002/xrs.666 · Ebel 1999 (tubo), doi:10.1002/(SICI)1097-4539(199907/08)28:4<255::AID-XRS347>3.0.CO;2-Y · Ebel 2003 (righe L), doi:10.1002/xrs.610 · Schoonjans et al. 2011 (xraylib), doi:10.1016/j.sab.2011.09.011 · Krause 1979 (rese), doi:10.1063/1.555594 · Ciucci et al. 1999 (CF-LIBS), doi:10.1366/0003702991947612 · El Sherbini et al. 2005, doi:10.1016/j.sab.2005.10.011 · *Spectroscopy* 2022, doi:10.56530/spectroscopy.xq8876v9 · Cristoforetti et al. 2010, doi:10.1016/j.sab.2009.11.005 · Kramida et al., NIST ASD, doi:10.18434/T4W30F · Cesareo et al. 2008, doi:10.3233/XST-2008-00196 · Cesareo et al. 2009, doi:10.1016/j.nimb.2009.06.119 · Trojek et al. 2010, doi:10.1016/j.apradiso.2009.09.054.
