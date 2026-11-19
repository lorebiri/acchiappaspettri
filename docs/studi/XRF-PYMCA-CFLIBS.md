# Studio: XRF di Acchiappaspettri, PyMca e CF-LIBS

*Studio del 19 novembre 2026 sul ramo `claude/studio-pymca`, partito da `desktop` (3.0.0). Non è un'implementazione: nessun file dell'app è stato cambiato. Il prototipo di confronto è in [`ricerca/xrf-pymca/`](../../ricerca/xrf-pymca/). Che cosa è stato realizzato poi nella 3.1 (ramo `claude/xrf-libs-3.1`): [`CONCLUSIONE-XRF-LIBS.md`](../../CONCLUSIONE-XRF-LIBS.md). Correzioni a questo studio fatte durante la 3.1: il significato di `hypermetflag` (§ 2.5) e le citazioni Cesareo/Trojek (§ 5).*

## In breve, per chi non è del mestiere

- **Che cosa fa oggi l'app.** Acchiappaspettri riconosce gli elementi in uno spettro XRF, ne misura i picchi e stima la composizione **senza standard** con un modello fisico («parametri fondamentali», FP). Sul suo stesso esempio sintetico va molto bene. Però tutta la sua accuratezza è stata misurata su **spettri simulati con lo stesso modello**: non c'è ancora una prova su materiali certificati.
- **Che cos'è PyMca.** È il programma di riferimento per l'XRF, sviluppato all'ESRF di Grenoble da quasi vent'anni e usato anche nei beni culturali (per esempio nel protocollo «CHARMed PyMca» per le leghe di rame). Il suo codice e i suoi dati sono per la quasi totalità sotto **licenza MIT**, compatibile con la licenza GPL di Acchiappaspettri: si possono **riusare codice e tabelle**, citando la fonte.
- **Prima prova di confronto** (prototipo di questo studio, sullo spettro reale di un acciaio certificato distribuito con PyMca): l'app e PyMca danno valori simili, entro qualche per cento per Cr, Ni e Fe. Il fit di PyMca descrive meglio la forma dei picchi reali (χ² ridotto 13 contro 22). Su un solo spettro è un indizio, non una validazione.
- **Che cosa manca all'app, in ordine di utilità.** (1) Una **validazione vera** con materiali certificati e con PyMca come secondo parere. (2) Un **fit più completo**: code dei picchi, picchi somma, fughe di tutte le righe. (3) Uno **spettro del tubo** preso dalla letteratura (Ebel) invece che da costanti scelte a mano. (4) **Banche dati** più complete per le righe deboli. (5) **Leggere e scrivere i file di configurazione di PyMca**, così chi usa già PyMca porta i suoi parametri.
- La **LIBS senza taratura** (CF-LIBS) esiste dal 1999 (Ciucci et al., 1999, doi:10.1366/0003702991947612). Oggi l'app riconosce soltanto le righe LIBS: non ne calcola la composizione. La CF-LIBS darebbe la composizione da uno spettro LIBS **senza standard**. Richiede però dati atomici di ogni riga e spettri ben acquisiti, ed è il lavoro più lungo fra quelli proposti. I parametri e gli articoli verificati sono nel § 3.

---

## 1. Stato attuale di Acchiappaspettri (desktop 3.0.0)

Il codice XRF è nel nucleo di `index.html` (fra `/*CORE-START*/` e `/*CORE-END*/`). Il ramo `wip/i12-ricetta-python` ne ha una copia fedele in Python (`scripts/ricetta-py/acch_xrf.py`), con le stesse funzioni nello stesso ordine.

### 1.1 Riconoscimento delle righe
- Picchi trovati sullo spettro, poi suggerimenti dalla tabella `XRF_LINES` entro una tolleranza (`tolFor('xrf')`); tre ipotesi per picco, con un punteggio di coerenza fra le righe di una famiglia (`xrfElements`, `xrfCrossCheck`).
- Calibrazione dell'asse (`xrfAlignFit`, `alignXrf`): ipotesi di guadagno e scostamento da **coppie** di picchi forti assegnate a coppie di righe di 32 elementi comuni (`XRF_COMMON`). Vince l'ipotesi più coerente, se spiega almeno 3 picchi e se è almeno 1,3 volte migliore della calibrazione del file.
- Artefatti (`xrfArtifacts`): fuga del Si (E − 1,740 keV) e picchi somma (2E, E₁ + E₂). Servono **solo come etichette**: nel calcolo non si tolgono.
- Limite di rivelabilità di Currie su fondo SNIP (`xrfCurrie`).

### 1.2 Fit dello spettro (`xrfFitLines`)
| Aspetto | Come è fatto oggi |
|---|---|
| Forma del picco | **gaussiana pura** |
| Larghezza | FWHM² = FWHM₀² + 2,355²·ε·F·E, con ε = 3,85 eV, **F = 0,114 fisso**, 140 eV a Mn Kα. Si adatta solo un fattore di scala `wf` (griglia ±18%) |
| Famiglie | K, L, M con le intensità relative di xraylib. Dopo la stima FP, Kβ/Kα e Lβ/Lα si ricalcolano per la matrice (3 giri, `xrfFP`) |
| Fughe | solo **Si Kα** (E − 1,74 keV), con frazione analitica `0,5·0,047·(1−1/10,4)·[1 − (μK/μ)·ln(1+μ/μK)]`; Si Kβ assente |
| Picchi somma (pile-up) | **assenti** dal modello |
| Code e gradino | **assenti** (né coda corta, né coda lunga, né gradino) |
| Diffusione | Rayleigh e Compton delle righe K e L dell'anodo; Compton gaussiano allargato di 0,2–0,6 keV; angolo di diffusione stimato dalla posizione del Compton |
| Fondo | B-spline cubiche non negative (nodi ogni 1,5 keV) adattate insieme alle righe; in alternativa SNIP, o SNIP più correzione |
| Calibrazione | scostamento, guadagno, `wf`, `wc` e angolo cercati **su una griglia** (non con le derivate) |
| Minimizzazione | minimi quadrati non negativi (Lawson–Hanson) pesati con 1/√N |
| Incertezze | dalla matrice normale inversa, scalata per √χ²ᵣ |

### 1.3 Parametri fondamentali (`fpTube`, `fpIntensities`, `fpQuant`)
- **Primaria**: Sherman (1955). **Secondaria**: Shiraiwa e Fujino (1966), solo nel supporto spesso. **Terziaria assente.**
- **Spettro del tubo**: continuo di Kramers ∝ Z·(E₀/E − 1) con autoassorbimento a profondità 0,7·R di Kanaya–Okayama; righe caratteristiche ∝ ω·(U·lnU − U + 1). Costanti **empiriche** (intensità delle righe 1100, fattore L 0,25, angolo d'uscita 20°): lo dice già `docs/SCIENZA.md`. Il tubo arriva fino a 50 kV; 8 anodi.
- Rese ω del tubo: Z⁴/(Z⁴ + A), formula approssimata. Compton del campione: Klein–Nishina × 0,92·Z/A.
- Modi: `norm` (leghe, somma 100%), `oxides` (vetri, ceramiche), `compton` (scala dal Compton, per gli strati pittorici), `abs` (scala da standard). Taratura con standard: fattori k per elemento (`fpCalibrate`).
- **Spessori** (`fpLayerSolve`): rapporto Kα/Kβ o Lα/Lβ, oppure attenuazione coperto/scoperto. Nessuna fluorescenza fra strati; lo strato deve essere uniforme.
- **Composizione senza standard**: iterazione di punto fisso Cᵢ ← Iᵢ/(kᵢ·G·Sᵢ(C)) con smorzamento 0,7, fino a 80 giri.

### 1.4 Banche dati
`FP_DATA` è generata con xraylib 4.2 (`scripts/gen-fp-data.py`, licenza BSD-3). Contiene Be e Z = 6–92; τ su 150 energie fra 1 e 50 keV; diffusione su 12 energie; spigoli; produzione delle righe **Kα, Kβ, Lα, Lβ** con le cascate di Kissel; intensità relative delle righe. L'accordo con xraylib è entro lo 0,5%. Nella 2.2 è stato corretto l'errore delle energie Kβ per Z ≥ 50.

### 1.5 Punti deboli noti
Fonti: `docs/SCIENZA.md`, `docs/LIMITAZIONI.md` e la lettura del codice.
1. **Nessuna validazione su materiali certificati.** I numeri (mediana 3–4%, 90° percentile 20–30%) vengono da spettri generati con lo stesso modello.
2. Forma del picco troppo semplice per i rivelatori reali: senza code e gradino, l'area di un picco grande «perde» le code. Le code finiscono nel fondo o sugli elementi vicini (per esempio un elemento minore vicino a Fe Kα o a Cu Kα).
3. Picchi somma e fughe Kβ non modellati: falsi elementi o aree gonfiate a conteggi alti (lo dice `docs/LIMITAZIONI.md`: Sb e I falsi nelle leghe di stagno; Pb proposto al posto di As).
4. Spettro del tubo con costanti scelte a mano: è il primo responsabile dell'errore senza standard (fino al 7% secondo il modello del tubo).
5. Niente fluorescenza terziaria (conta negli acciai, vedi § 4.3) né fluorescenza fra strati.
6. Solo 4 righe per elemento nei dati FP: le righe Lγ e M entrano nel fit con le intensità relative di xraylib, ma non nel calcolo FP.
7. Nessuna eccitazione monocromatica (sincrotrone, ottiche policapillari con filtro): il modello presume un tubo.
8. Righe coincidenti senza riga libera (As/Pb, W/Au, S/Mo L) lasciate «non distinguibili».
9. Asse dell'energia lineare (manca il termine quadratico), tolleranza di allineamento oltre 80–100 eV.
10. LIBS: c'è solo una tabella di lunghezze d'onda (`LIBS_LINES`, «valori indicativi» dal NIST ASD), **senza** probabilità di transizione, degenerazioni, energie dei livelli né funzioni di partizione: oggi non si può fare alcuna quantificazione LIBS.

## 2. PyMca

### 2.1 Versione studiata e fonte
- Sorgente: `https://github.com/vasole/pymca`, commit `4fbf74a` (9 gennaio 2026). Pacchetto eseguito: **PyMca5 5.9.7** con **fisx 1.3.2** (PyPI). La copia nella cartella Download di Lorenzo non è stata confrontata: se è più vecchia della 5.9, in particolare senza fisx, l'escape e la fluorescenza secondaria e terziaria cambiano. Per confronti numerici conviene **fissare** `pymca==5.9.7` e `fisx==1.3.2`.
- Articolo da citare: Solé V.A., Papillon E., Cotte M., Walter Ph., Susini J. (2007), *Spectrochim. Acta B* 62, 63–68, doi:10.1016/j.sab.2006.12.002.

### 2.2 Modello di fit (`PyMcaPhysics/xrf/ClassMcaTheory.py`, `PyMcaMath/fitting/specfit/SpecfitFuns.c`)
| Aspetto | PyMca |
|---|---|
| Calibrazione | E = Zero + Gain·canale; Zero e Gain **parametri del fit** (non lineari), con limiti `deltazero`, `deltagain` |
| Larghezza | FWHM = √(Noise² + 0,00385·E·Fano·2,3548²) in keV; **Noise e Fano liberi** (predefiniti 0,1 keV e 0,114) |
| Forma | **ipermetro** (`hypermetflag`, bit: 1 gaussiana, 2 coda corta, 4 coda lunga, 8 gradino) oppure pseudo-Voigt (`Eta Factor`) |
| Ipermetro | G(x) = A/(σ√2π)·exp(−(x−x₀)²/2σ²) più, per la coda corta e la lunga, A·r/β · ½·erfc((x−x₀)/(σ√2) + σ/(β√2))·exp((x−x₀)/β + σ²/2β²), più il gradino h·A/(σ√2π)·½·erfc((x−x₀)/(σ√2)). Le pendenze β sono **in unità di σ** («SlopeR») e le aree in rapporto all'area gaussiana («AreaR»). È la forma classica per i rivelatori al silicio (vedi Van Gysel et al. 2003) |
| Valori tipici (`McaTheory.cfg`) | ST AreaR 0,05, ST SlopeR 0,5, LT AreaR 0,02, LT SlopeR 10, STEP HeightR 1·10⁻⁴; le code e il gradino si azzerano sulle righe di fuga |
| Fughe | `escapeflag`: con fisx si calcolano **tutte** le righe di fuga del materiale del rivelatore (Si Kα e Kβ; Ge Kα, Kβ e L) con la loro probabilità, da `Elements.getEscape` o da fisx |
| Picchi somma | `sumflag`: **autoconvoluzione** dello spettro modello (`SpecfitFuns.pileup`) moltiplicata per il parametro `Sum` (predefinito 1·10⁻⁸, adattato) |
| Righe | gruppi per elemento e guscio (K, L1, L2, L3, M o Ka/Kb separati), con i rapporti di riga corretti per l'assorbimento in matrice, filtri e rivelatore. Le soglie `ethreshold`, `ithreshold` e `nthreshold` raggruppano le righe vicine |
| Diffusione | un picco Rayleigh e uno Compton **per ogni energia di eccitazione** marcata «scatter» (`energyscatter`); il Compton ha parametri propri di larghezza e coda |
| Fondo | «strip» iterativo (`stripwidth` 1, `stripconstant` 1, `stripiterations` 20000) oppure **SNIP** (`snipwidth` 30 canali), su spettro lisciato (`stripfilterwidth`), con punti d'ancoraggio facoltativi. Si somma un continuo analitico facoltativo: costante, lineare, parabolico, polinomio lineare (`linpolorder`) o esponenziale (`exppolorder`) |
| Ottimizzazione | Levenberg–Marquardt (`Gefit`) con limiti, `maxiter` 10, `deltachi` 0,001; in alternativa un fit lineare veloce (`linearfitflag`), usato anche nelle mappe (`FastXRFLinearFit`) |

### 2.3 Parametri fondamentali e «concentrations» (`ConcentrationsTool.py`, fisx)
- **Eccitazione**: una lista di energie con peso (`[fit] energy`, `energyweight`, `energyflag`, `energyscatter`). Per un tubo la lista viene da `XRayTubeEbel.generateLists`: continuo e righe caratteristiche di **Ebel (1999)**, *X-Ray Spectrom.* 28, 255–266, valido per 5–50 kV, incidenza degli elettroni 50–90°, uscita 5–90°. Passi di 0,2 keV fino a 20 keV e di 0,5 keV oltre; finestra e filtri del tubo inclusi.
- **Attenuatori** (`[attenuators]`, ogni riga: attivo, materiale, densità, spessore, «funny factor»): atmosfera, finestra del rivelatore, strato morto, contatto, rivelatore (efficienza), filtri sul fascio (`BeamFilter*`), assorbitori.
- **Matrice**: uno strato (`Matrix`, con angoli d'ingresso e d'uscita) o **multistrato** (`[multilayer]`, fino a 10 strati). Materiali definiti in `[materials]` (lista di composti e frazioni).
- **Fluorescenza secondaria e terziaria** (`usemultilayersecondary` 0/1/2) calcolate con **fisx**, anche **fra strati diversi**.
- **Scala assoluta**: flusso × tempo × angolo solido (area e distanza del rivelatore), oppure un **elemento di riferimento** (standard interno) che fissa il flusso; `usematrix` prende la composizione della matrice come nota.
- **Strategie** (`SingleLayerStrategy`): iterazione che aggiorna la composizione della matrice con le concentrazioni trovate.
- **Monte Carlo**: collegamento facoltativo a XMI-MSIM (Schoonjans et al. 2012) per la correzione delle interazioni di ordine superiore.

### 2.4 Banche dati di PyMca e fisx, con le fonti dichiarate nei file
| Grandezza | File | Fonte |
|---|---|---|
| Sezioni d'urto totali, coerente, incoerente, fotoelettrica | `XCOM_CrossSections.dat`, `PyMcaData/attdata/*.mat` | XCOM, Berger e Hubbell, NBSIR 87-3597 (1987) |
| Sezioni fotoelettriche per sottoguscio | `EPDL97_CrossSections.dat`; `Scofield1973.dict` | EPDL97 (LLNL, Cullen et al. 1997); Scofield 1973 (UCRL-51326) |
| Energie di legame | `BindingEnergies.dat`, `EADL97_BindingEnergies.dat` | Larkins (1977) *ADNDT* 20, 311; EADL97 |
| Rese ω_K | `KShellConstants.dat` | formula semiempirica di Bambynek (1984), confrontata con Chen et al. (1980) |
| Rese L e Coster–Kronig | `LShellConstants.dat` | Chen, Crasemann, Mark (1981) *Phys. Rev. A* 24, 177; ω_L2 per Z < 25 da EADL97 |
| Rese M | `MShellConstants.dat` | Chen, Crasemann, Mark (1980, 1983); Coster–Kronig corretti come spiegato nel file |
| Probabilità di emissione K | `KShellRates.dat` | Scofield (1974) *Phys. Rev. A* 9, 1041 |
| Probabilità L | `LShellRates.dat` | Scofield (1974) *ADNDT* 14, 121 (nel file l'anno è scritto «1964»: è un refuso) |
| Probabilità M | `MShellRates.dat` | Bhalla (1970) *J. Phys. B* 3, 916 |
| Alternative EADL97 | `EADL97_*Rates.dat`, `*Constants.dat` | EADL97 (LLNL) |
| Fattori di forma per la diffusione | `atomsf.lib`, `incoh.dict` | (non verificato in dettaglio) |

**Elam** (Elam, Ravel, Sieber 2002) **non** è usata da PyMca; è la base di altri programmi (per esempio Larch e il database xraydb).

### 2.5 File `.cfg`
Formato INI di `ConfigDict` (`PyMcaIO/ConfigDict.py`): sezioni `[name]`, sottosezioni `[materials.Nome]`, valori Python (numeri, liste separate da virgole, stringhe). Sezioni principali, con i valori dei due file d'esempio `McaTheory.cfg` e `Steel.cfg`:

| Sezione | Chiavi principali | Valori tipici |
|---|---|---|
| `[detector]` | `zero`, `gain`, `noise`, `fano`, `sum`, `detele`, `fixed*`, `delta*`, `ethreshold`, `ithreshold`, `nthreshold` | noise 0,10–0,13 keV, fano 0,10–0,114, sum 1·10⁻⁸–1·10⁻¹⁰, detele Si |
| `[fit]` | `xmin`, `xmax`, `energy`, `energyweight`, `energyflag`, `energyscatter`, `hypermetflag`, `escapeflag`, `sumflag`, `stripflag`, `stripalgorithm`, `snipwidth`, `continuum`, `maxiter`, `deltachi`, `linearfitflag` | hypermet 1 (**sola gaussiana**: i bit sono 1 gaussiana, 2 coda corta, 4 coda lunga, 8 gradino; tutte le code = 15; correzione del 19/11/2026, vedi la nota sotto), escape 1, SNIP 30, maxiter 10 |
| `[peakshape]` | `st_arearatio`, `st_sloperatio`, `lt_arearatio`, `lt_sloperatio`, `step_heightratio`, `eta_factor`, con `fixed*` e `delta*` | 0,05 / 0,5 / 0,02 / 10 / 1·10⁻⁴ / 0,02 |
| `[peaks]` | elemento = guscio o righe | `Fe = Ka, Kb`, `Pb = L, M` |
| `[attenuators]` | nome = attivo, materiale, densità, spessore (cm), fattore; `Matrix = attivo, materiale, densità, spessore, α_in, α_out, …` | aria 0,0012048 g/cm³; Be 1,848; Si 2,33 |
| `[multilayer]` | `Layer0…Layer9` | |
| `[tube]` | `anode`, `voltage`, `window`, `windowthickness`, `alphae`, `alphax`, `filter1`, `transmission` | Ag, 30 kV, Be 0,0125 cm |
| `[materials.X]` | `CompoundList`, `CompoundFraction`, `Density`, `Thickness`, `Comment` | |
| `[concentrations]` | `usematrix`, `reference`, `flux`, `time`, `area`, `distance`, `useattenuators`, `usemultilayersecondary`, `mmolarflag`, `usexrfmc` | flux 1·10¹⁰, area 30 mm², distanza 10 |
| `[xrfmc]` | percorso di XMI-MSIM e geometria | |

Nota per l'import: in `Steel.cfg` la sezione `[tube]` è solo un promemoria per l'interfaccia. Quello che conta per il calcolo è la lista `[fit] energy…`, che lì è **monocromatica a 16 keV**. Un import deve quindi leggere la lista delle energie, non soltanto anodo e tensione.

### 2.6 Licenze, e che cosa si può fare
| Parte | Licenza (verificata nei file) |
|---|---|
| PyMca, quasi tutti i moduli Python e C, `PyMcaData/` (tabelle e cfg d'esempio) | **MIT** (Expat), © ESRF; file `LICENSE`, `LICENSE.MIT`, `copyright`, intestazioni `__license__ = "MIT"` |
| `PyMcaIO/specfile/src/specfile_py*.c` | **LGPL-2.0-or-later** (intestazione del file) |
| L'insieme del toolkit | il file `LICENSE` lo offre anche sotto GPL-2.0-or-later; chi usa PyQt eredita la GPL di PyQt |
| `PyMcaMath/sift` | escluso dal pacchetto Debian (`Files-Excluded`); non serve all'XRF |
| fisx (libreria C++ e `fisx_data/`) | **MIT** (pacchetto 1.3.2, `License: MIT`) |
| Dati d'origine: EPDL97 e EADL97 (LLNL), XCOM (NIST) | opere del governo USA, di fatto riusabili; conviene citarle |
| Acchiappaspettri | **GPL-3.0-or-later** (`LICENSE`); documentazione e tabelle di dati anche CC BY 4.0 (`LICENSES/`) |

**Che cosa si può fare:**
1. **Riusare codice PyMca/fisx (MIT) in Acchiappaspettri (GPL-3)**: sì. La MIT è compatibile con la GPL-3: il codice derivato si distribuisce sotto GPL-3, ma va **conservato l'avviso di copyright e di licenza MIT**. Il codice LGPL di `specfile` non serve.
2. **Riusare i dati** (tabelle di fisx e PyMca): sì, alle stesse condizioni. Poiché le tabelle di Acchiappaspettri sono offerte **anche** sotto CC BY 4.0, la doppia licenza resta possibile per i dati MIT, purché l'avviso MIT le accompagni.
3. **Reimplementare dagli articoli** (Ebel 1999, Sherman, Shiraiwa–Fujino, ipermetro): sempre lecito. Basta citare gli articoli.
4. **Usare PyMca come programma esterno** (la «ricetta Python», un'estensione o i test): lecito; PyMca non viene ridistribuito.

**Come attribuire** (proposta). In `THIRD-PARTY-NOTICES.md` va una voce «PyMca / fisx» con il testo MIT completo: «Copyright (c) 2004-2022 European Synchrotron Radiation Facility (ESRF)». Lo stesso avviso va in testa a ogni file portato. Nel paragrafo «Metodi» e in `docs/SCIENZA.md` va citato Solé et al. (2007), doi:10.1016/j.sab.2006.12.002, più gli articoli dei dati usati (Scofield, Chen et al., XCOM ed EPDL97 secondo le tabelle). Per Ebel va citato l'articolo, anche se si porta `XRayTubeEbel.py`.

## 3. CF-LIBS: articoli e parametri

Ricerca bibliografica del 19/11/2026, fatta da un agente con l'API di Crossref per i metadati, OpenAlex e Semantic Scholar per abstract e accesso aperto, ricerche web e testi completi ad accesso aperto (archivi istituzionali, Zenodo, Europe PMC, IMEKO). **Nessun valore è stato inventato.** Il livello di verifica è indicato riga per riga:
- **CR**: metadati verificati con Crossref;
- **FT**: testo completo letto;
- **AB**: solo l'abstract;
- **WS**: informazione presa solo da ricerche web, da confermare.

Gli abstract di Elsevier non escono dalle API, e ScienceDirect, RSC e NASA ADS hanno bloccato lo scaricamento automatico. Per questo **diversi articoli chiave sono verificati solo nei metadati**: Tognoni 2002 e 2010, Bulajic 2002, Cavalcanti 2013 (OPC), Grifoni 2016. Prima di implementare qualcosa bisogna leggerli a mano.

### 3.1 Che cosa interessa ad Acchiappaspettri
- **Articolo fondativo della CF-LIBS**: Ciucci et al., 1999, doi:10.1366/0003702991947612. Le equazioni del metodo sono anche nel brevetto US 6,657,721 B1 (priorità italiana del 20/03/1998).
- Rassegne: Tognoni et al., 2002, doi:10.1016/s0584-8547(02)00053-8; Tognoni et al., 2010, doi:10.1016/j.sab.2009.11.006; Poggialini et al., 2023, doi:10.1039/d3ja00130j, ad accesso aperto, **da leggere per prima**.
- Equilibrio termodinamico locale (LTE): Cristoforetti et al., 2010, doi:10.1016/j.sab.2009.11.005 (letto per intero). Il criterio di McWhirter è **necessario ma non sufficiente**.
- Autoassorbimento: curva di crescita (Bulajic et al., 2002, doi:10.1016/s0584-8547(01)00398-6), larghezza Stark (El Sherbini et al., 2005, doi:10.1016/j.sab.2005.10.011), formula pratica I₀ ≈ I·(Δλ/Δλ₀)^0,85 (*Spectroscopy* 2022, doi:10.56530/spectroscopy.xq8876v9), grafico di Saha–Boltzmann a densità colonnare e «extended C-sigma» (Safi et al., 2019, doi:10.1016/j.jare.2019.01.008).
- Chemometria: graph clustering (LIBS e pXRF), reti neurali, SOM, e un avvertimento sui modelli «scatola nera» (Safi et al., 2018, doi:10.1016/j.sab.2018.03.007). Libro Wiley *Chemometrics and Numerical Methods in LIBS*, 2022, doi:10.1002/9781119759614.
- XRF: in questi lavori si usano i **parametri fondamentali** e poi si classifica con SOM o graph clustering (monete d'oro etrusche, necropoli di Chovdar). Lavori combinati XRF + LIBS: Ferretti et al., 2007, doi:10.1016/j.sab.2007.09.004; Senesi et al., 2023, doi:10.21014/tc4-arc-2023.093.
- **Attribuzioni da non sbagliare.** I C-sigma graphs vengono da Aragón et al., 2014, doi:10.1016/j.jqsrt.2014.07.026. Il «calibration-free inverse method» viene da Gaudiuso et al., 2014, doi:10.1016/j.aca.2014.01.020. L'«inverse calibration» di Poggialini et al., 2020, è un'altra cosa (regressione inversa).

### 3.2 Articoli verificati
| # | Primo autore | Anno | Titolo | Rivista, vol., pagine | DOI | Verifica | OA |
|---|---|---|---|---|---|---|---|
| 1 | Ciucci et al. | 1999 | New Procedure for Quantitative Elemental Analysis by Laser-Induced Plasma Spectroscopy | Appl. Spectrosc. 53, 960-964 | 10.1366/0003702991947612 | CR + AB | No |
| 2 | Ciucci et al. | 1999 | CF-LIPS: A new approach to LIPS spectra analysis | Laser Part. Beams 17, 793-797 | 10.1017/s0263034699174251 | CR + AB | No |
| 3 | — | 2003 (priorità 1998) | Method for quantitative analysis of atomic components of materials by LIBS spectroscopy measurements | Brevetto US 6,657,721 B1 | (n/a) | Google Patents (FT del brevetto) | Sì (brevetto) |
| 4 | Bulajic et al. | 2002 | A procedure for correcting self-absorption in calibration free-laser induced breakdown spectroscopy | Spectrochim. Acta B 57, 339-353 | 10.1016/s0584-8547(01)00398-6 | CR (contenuto WS) | No |
| 5 | Tognoni et al. | 2002 | Quantitative micro-analysis by laser-induced breakdown spectroscopy: a review of the experimental approaches | Spectrochim. Acta B 57, 1115-1130 | 10.1016/s0584-8547(02)00053-8 | CR | No |
| 6 | El Sherbini et al. | 2005 | Evaluation of self-absorption coefficients of aluminum emission lines in LIBS measurements | Spectrochim. Acta B 60, 1573-1579 | 10.1016/j.sab.2005.10.011 | CR + FT | Copia su CNR IRIS |
| 7 | Tognoni et al. | 2007 | A numerical study of expected accuracy and precision in CF-LIBS analysis | Spectrochim. Acta B 62, 1287-1302 | 10.1016/j.sab.2007.10.005 | CR | No |
| 8 | Ferretti et al. | 2007 | In situ study of the Porticello Bronzes by portable X-ray fluorescence and laser-induced breakdown spectroscopy | Spectrochim. Acta B 62, 1512-1518 | 10.1016/j.sab.2007.09.004 | CR | No |
| 9 | Tognoni et al. | 2010 | Calibration-Free Laser-Induced Breakdown Spectroscopy: State of the art | Spectrochim. Acta B 65, 1-14 | 10.1016/j.sab.2009.11.006 | CR (contenuto WS) | No (IRIS senza file) |
| 10 | Cristoforetti et al. | 2010 | Local Thermodynamic Equilibrium in LIBS: Beyond the McWhirter criterion | Spectrochim. Acta B 65, 86-95 | 10.1016/j.sab.2009.11.005 | CR + FT | Copia su CNR IRIS (prod_171806) |
| 11 | Cavalcanti et al. | 2013 | One-point calibration for calibration-free LIBS quantitative analysis | Spectrochim. Acta B 87, 51-56 | 10.1016/j.sab.2013.05.016 | CR (contenuto WS) | No |
| 12 | Pardini et al. | 2013 | On the determination of plasma electron number density from Stark broadened hydrogen Balmer series lines in LIBS experiments | Spectrochim. Acta B 88, 98-103 | 10.1016/j.sab.2013.05.030 | CR (contenuto WS) | Bronze (Elsevier), CONICET |
| 13 | D'Andrea et al. | 2014 | An artificial neural network approach to LIBS quantitative analysis | Spectrochim. Acta B 99, 52-58 | 10.1016/j.sab.2014.06.012 | CR + FT (preprint) | Green (ARPI 11568/779938) |
| 14 | D'Andrea et al. | 2015 | A hybrid calibration-free/artificial neural networks approach to the quantitative analysis of LIBS spectra | Appl. Phys. B 118, 353-360 | 10.1007/s00340-014-5990-z | CR + FT (preprint) | Green (ARPI 11568/780488) |
| 15 | Scuotto et al. | 2014 | X-ray fluorescence analysis on a group of coins from the ancient roman city of Tridentum | X-Ray Spectrom. 43, 370-374 | 10.1002/xrs.2567 | CR + AB | No |
| 16 | Baldassarri et al. | 2014 | X-Ray Fluorescence Analysis of XII-XIV Century Italian Gold Coins | J. Archaeology 2014, 1-6 | 10.1155/2014/519218 | CR + AB | Sì (Hindawi) |
| 17 | Grifoni et al. | 2016 | Application of Graph Theory to unsupervised classification of materials by LIBS | Spectrochim. Acta B 118, 40-44 | 10.1016/j.sab.2016.02.003 | CR | No |
| 18 | Grifoni et al. | 2016 | From Calibration-Free to Fundamental Parameters Analysis: A comparison of three recently proposed approaches | Spectrochim. Acta B 124, 40-46 | 10.1016/j.sab.2016.08.022 | CR | No |
| 19 | Arias et al. | 2016 (vol. 2017) | X-Ray Fluorescence Analysis and Self-Organizing Maps Classification of the Etruscan Gold Coin Collection at the Monetiere of Florence | Appl. Spectrosc. 71, 817-822 | 10.1177/0003702816641421 | CR + AB | No |
| 20 | Pagnotta et al. | 2017 | Micro-LIBS Study on Ancient Roman Mortars | Appl. Spectrosc. 71, 721-727 | 10.1177/0003702817695289 | CR + AB | No |
| 21 | Safi et al. | 2018 | Multivariate calibration in LIBS quantitative analysis: The dangers of a 'black box' approach | Spectrochim. Acta B 144, 46-54 | 10.1016/j.sab.2018.03.007 | CR | No |
| 22 | Botto et al. | 2019 | Applications of LIBS in cultural heritage and archaeology: a critical review | JAAS 34, 81-103 | 10.1039/c8ja00319j | CR + AB | Bronze (RSC), ARPI 11568/952349 |
| 23 | Safi et al. | 2019 | Determination of excitation temperature in laser-induced plasmas using columnar density Saha-Boltzmann plot | J. Adv. Res. 18, 1-7 | 10.1016/j.jare.2019.01.008 | CR + FT | Gold (PMC6370548) |
| 24 | Safi et al. | 2019 | Exploiting Self-Absorption for Plasma Characterization in LIBS Experiments: A Comparison of Two Recent Approaches | Anal. Chem. 91, 8595-8601 | 10.1021/acs.analchem.9b01885 | CR + AB | Green (INO-CNR openportal) |
| 25 | Rezaei et al. | 2020 | A review of the current analytical approaches for evaluating, compensating and exploiting self-absorption in LIBS | Spectrochim. Acta B 169, 105878 | 10.1016/j.sab.2020.105878 | CR | No |
| 26 | Messaoud Aberkane et al. | 2020 | LIBS for Determination of Spectral Fundamental Parameters | Appl. Sci. 10, 4973 | 10.3390/app10144973 | CR + FT | Gold (MDPI, Zenodo 14451390) |
| 27 | Poggialini et al. | 2020 | Determination of the Stark broadening coefficients of tantalum emission lines by time-independent Extended C-sigma method | Spectrochim. Acta B 167, 105829 | 10.1016/j.sab.2020.105829 | CR | No |
| 28 | Poggialini et al. | 2020 | About the use of inverse calibration in LIBS quantitative analysis | Spectrochim. Acta B 170, 105917 | 10.1016/j.sab.2020.105917 | CR | No |
| 29 | Odelli et al. | 2020 | Graph clustering and portable X-Ray Fluorescence: An application for in situ, fast and preliminary classification of transport amphoras | Spectrochim. Acta B 172, 105966 | 10.1016/j.sab.2020.105966 | CR (contenuto WS) | No |
| 30 | Safi et al. | 2021 | Determination of Spectroscopic Parameters of Ag(I) and Ag(II) Emission Lines Using Time-Independent Extended C-Sigma Method | Appl. Spectrosc. 75, 654-660 | 10.1177/0003702821999425 | CR + AB | No |
| 31 | — | 2021 | Effect of plasma inhomogeneity on the determination of Strark [sic, refuso nei metadati] broadening coefficients by LIBS | JQSRT 271, 107714 | 10.1016/j.jqsrt.2021.107714 | CR | No |
| 32 | — | 2022 | Avoiding Misunderstanding Self-Absorption in LIBS Analysis | Spectroscopy (The Resource Issue 2022-2023), 60-62 | 10.56530/spectroscopy.xq8876v9 | CR + FT | Copia su CNR IRIS (prod_474369); spectroscopyonline.com |
| 33 | — | 2022 | Chemometrics and Numerical Methods in LIBS (Wiley) | libro, ISBN 9781119759614 | 10.1002/9781119759614 | CR | No |
| 34 | Jalilov et al. | 2022 (vol. 2023) | Preliminary X-ray Fluorescence Analysis of Metallic Samples from the Chovdar Necropolis in Azerbaijan | Heritage 6, 199-211 | 10.3390/heritage6010010 | CR + AB | Gold (MDPI) |
| 35 | Senesi et al. | 2023 | Handheld LIBS, portable ED-XRF and Graph Clustering applied to the identification and inner stratigraphy of archaeological metallic artifacts | Proc. IMEKO TC4 MetroArchaeo 2022 | 10.21014/tc4-arc-2023.093 | CR + FT | Sì (PDF IMEKO) |
| 36 | Poggialini et al. | 2023 | Catching up on calibration-free LIBS | JAAS 38, 1751-1771 | 10.1039/d3ja00130j | CR + AB | Sì, hybrid CC-BY-NC (PDF RSC; download automatico bloccato da Cloudflare) |
| 37 | Lellouche et al. | 2024 | A new method for calibration-free analysis by LIBS using a time-integrated spectrometer | Spectrochim. Acta B 215, 106903 | 10.1016/j.sab.2024.106903 | CR (contenuto WS) | No |

**Riferimenti di controllo (attribuzioni da non confondere):**
- Aragón et al., "CSigma graphs: A new approach for plasma characterization in LIBS", JQSRT 149 (2014) 90-102, DOI 10.1016/j.jqsrt.2014.07.026 (CR).
- Gaudiuso et al., *Sensors* 10 (2010) 7434-7468, DOI 10.3390/s100807434 (CR).
- Gaudiuso et al., "LIBS of archaeological findings with calibration-free inverse method", *Anal. Chim. Acta* 813 (2014) 15-24, DOI 10.1016/j.aca.2014.01.020 (CR).

Altri lavori pertinenti trovati in Crossref, di cui non ho visto il contenuto:
- Borgia et al. 2000, *J. Cult. Herit.* 1 S281 (CF-LIPS su pigmenti), 10.1016/s1296-2074(00)00174-6;
- Corsi et al. 2006, *Appl. Geochem.* 21:748 (DP CF-LIBS), 10.1016/j.apgeochem.2006.02.004;
- Borges et al. 2014, *Appl. Phys. B* 117:437 (metodo rapido per n_e e T), 10.1007/s00340-014-5852-8;
- Lezzerini et al. 2014 (malte di un campanile medievale), 10.1016/j.conbuildmat.2014.07.051;
- *ChemTexts* 6, 2020 (rassegna introduttiva), 10.1007/s40828-020-00114-x;
- *Laser Part. Beams*, 2023 (storia della LIBS, OA), 10.1155/2023/2502152.

### 3.3 Parametri e metodi, con la fonte
| Parametro / metodo | Valore / formula | Condizioni | Fonte (DOI + posizione) | Note |
|---|---|---|---|---|
| Intensità di riga (LTE, plasma otticamente sottile) | Ī_ki = F·N_a·g_k·A_ki·exp(−E_k/k_B T)/U_a(T) | Plasma omogeneo, otticamente sottile, in LTE | Brevetto US 6,657,721 (eq. 2 e 4); stessa forma nell'eq. 3 di 10.3390/app10144973 (FT) | F è il fattore sperimentale (geometria, efficienza, massa ablata) |
| Boltzmann plot (CF-LIBS) | ln(Ī_ki/(g_k A_ki)) = −E_k/(k_B T) + ln(F·C_s/U_s(T)); pendenza = −1/(k_B T); intercetta = ln(F C_s/U_s) | Una retta per ogni specie (I, II) | Brevetto US 6,657,721 (eq. 5-6) | Nel brevetto T è ottenuta per regressione lineare, eventualmente mediata sulle specie |
| Funzione di partizione | U(T) = Σ_k g_k exp(−E_k/k_B T) | | Brevetto (eq. 3) | |
| Saha-Eggert | n_e·n_II/n_I = 2Λ^-3·(U_II/U_I)·exp(−E_ion/k_B T), con Λ = sqrt(2πħ²/(m_e k_B T)). Forma del brevetto: N_e·N_II/N_I = 6.0·10^21·(g_II/g_I)·T^3/2·exp(−E_∞/T) | Primo stadio di ionizzazione; stadi superiori < 10^-3 (brevetto) | 10.3390/app10144973 eq. 1-2 (FT); brevetto eq. 1 | Lega le intercette di I e II, quindi la concentrazione totale dell'elemento |
| Chiusura | C_i = (F C_i)/Σ_j (F C_j), cioè ΣC = 1; in alternativa uno standard interno: F = (F C_el)_LIBS / C_el,nota | Tutti gli elementi maggiori identificati (≥ 0.1% secondo il brevetto) | Brevetto (eq. 7-8) | L'errore è almeno pari alla frazione di elementi non identificati (brevetto) |
| n_e iterativo nel CF | Valore di partenza n_e ≈ 10^18 cm^-3; si itera chiusura → n_e = Σ N_ioni → Saha fino a convergenza | Quando si misura una sola specie | Brevetto (procedura, passo A iii) | |
| Temperatura tipica | ~10 eV (~10^5 K) nelle fasi iniziali; ~1 eV (~10^4 K) nel regime di analisi | | Brevetto (descrizione) | Valori indicativi |
| Irradianza / frequenza (brevetto) | ~10^8 W/cm² (leghe metalliche); ~5·10^9 W/cm² (atmosfera); 10 Hz | | Brevetto | Volume focale ~0.1 mm³ |
| Criterio di McWhirter | n_e (cm^-3) > 1.6·10^12 · T^1/2 · (ΔE_nm)^3, con T in K, ΔE in eV, ΔE = gap massimo tra livelli adiacenti (di solito fondamentale → primo eccitato) | Plasma stazionario e omogeneo | 10.1016/j.sab.2009.11.005, eq. 12 (FT); ripetuto in 10.3390/app10144973 eq. 6 | Necessario ma non sufficiente; gli autori raccomandano di non usarlo da solo |
| Criterio di Hey (con fattore di Gaunt) | n_e > 2.55·10^11·⟨ḡ⟩^-1·T^1/2·(ΔE_nm)^3 | | 10.1016/j.sab.2009.11.005, eq. 13 (FT) | Il testo estratto dal PDF è disordinato: verificare la forma esatta sul PDF |
| Criterio LTE temporale | ΔT/T ≪ 1 e Δn_e/n_e ≪ 1 sull'intervallo τ_rel | Plasma transitorio | 10.1016/j.sab.2009.11.005, eq. 16; τ_rel ≈ 6.3·10^4/(n_e f_12 ⟨ḡ⟩)·ΔE_21·(kT)^1/2·exp(ΔE_21/kT), eq. 18 (FT) | Per plasma parzialmente ionizzato τ_rel va moltiplicato per N_II/(N_I+N_II) |
| Criterio LTE spaziale | ΔT/T ≪ 1 e Δn_e/n_e ≪ 1 sulla lunghezza di diffusione λ = (D·τ_rel)^1/2, con D ≈ 3·10^19·kT/(N_II·M_A) cm²/s (kT in eV) | Plasma disomogeneo | 10.1016/j.sab.2009.11.005, eq. 19-20 (FT) | La lettura dell'esponente di D dal PDF è incerta: verificare |
| Verifica LTE consigliata | Confrontare n_e da McWhirter, da Saha e da allargamento Stark | | 10.1016/j.sab.2009.11.005, §3.1 (FT) | |
| Allargamento Stark (non-H) | Δλ_S ≈ 2w(T,n_e)·(n_e/10^16) (contributo ionico trascurabile); formula completa con parametro ionico A e N_D = 1.72·10^9 T^3/2/n_e^1/2 | | 10.3390/app10144973, eq. 11-13 (FT) | w = coefficiente Stark (tabulato) |
| n_e da H-alpha | Δλ_S = γ_α(T,n_e)·n_e^(2/3), con Hα a 656.28 nm; formula di El Sherbini 2005: n_e = C(λ,T)·Δλ_1/2^(3/2) (Δλ in Å, C tabulato da Griem) | Idrogeno presente per l'umidità dell'aria | 10.3390/app10144973 eq. 14; 10.1016/j.sab.2005.10.011 eq. 13 (FT) | Con H abbondante Hα è autoassorbita: usare Hβ (Pardini 2013, WS) |
| n_e da H-beta | Δλ_S = γ_β(T,n_e)·n_e^0.68116 (Gigosos), con Hβ a 486.135 nm | | 10.3390/app10144973, eq. 15 (FT) | |
| Deconvoluzione strumentale | FWHM_V = FWHM_L·[0.5346 + sqrt(0.2166 + (FWHM_G/FWHM_L)²)] (Olivero, accuratezza ±0.01%), da invertire numericamente per ottenere la componente Lorentziana | Profilo di Voigt | 10.3390/app10144973, eq. 19 (FT) | La forma esatta nel PDF è disordinata: ho usato la formula standard di Olivero, da verificare sul PDF |
| Autoassorbimento: coefficiente SA dalla larghezza | SA = I(λ0)/I0(λ0); Δλ = Δλ0·SA^α con α = −0.54; Ī/Ī0 = SA^β con β = 0.46; SA = (Δλ/(2w_s n_e))^(1/α) | Plasma omogeneo, n_e noto (per esempio da Hα), w_s noto | 10.1016/j.sab.2005.10.011, eq. 6, 8, 12 (FT) | Nel PDF il segno meno di α è perso nell'estrazione; dal contesto (Δλ > Δλ0 per SA < 1) α è negativo |
| Autoassorbimento: formula pratica | I0 ≈ I·(Δλ/Δλ0)^0.85, valida anche per autoassorbimento forte; con approssimazione semplice I0 ≈ I·Δλ/Δλ0 | Plasma omogeneo in LTE | 10.56530/spectroscopy.xq8876v9, eq. 6 e Fig. 2 (FT) | In scala log-log la curva di calibrazione passa da pendenza 1 a 1/2 al crescere della concentrazione |
| Autoreversal vs autoassorbimento | L'autoreversal (dip centrale) richiede gradienti spaziali; la sua assenza non esclude autoassorbimento | | 10.56530/spectroscopy.xq8876v9 (FT) | Esempio: Ag II 243.78 nm, delay 400-2900 ns, gate 500 ns (10.3390/app10144973, Fig. 2) |
| Curve of growth nel CF-LIBS | Correzione automatica dell'autoassorbimento con curva di crescita per ogni riga (software LIPS++); test su 3 acciai NIST e 3 leghe Au-Ag-Cu; accuratezza CF migliorata di circa un ordine di grandezza | | 10.1016/s0584-8547(01)00398-6 | **WS** (abstract non visto direttamente) |
| Duplicating mirror | Rapporto di intensità con e senza specchio sferico; senza autoassorbimento il segnale con specchio raddoppia | Nessuna ipotesi su omogeneità o LTE | 10.3390/app10144973, §3 e Fig. 3 (FT) | Metodo discusso in 10.3390/app10144973 |
| C-sigma / extended C-sigma | C-sigma (Aragón & Aguilera 2014): intensità di molte righe e specie su una curva universale in funzione di τ(λ0). Extended C-sigma (Safi et al. 2019): unisce il CD-SB plot (Cristoforetti & Tognoni 2013) e il C-sigma. TIECS: variante time-independent per misurare A_ki e coefficienti Stark compensando l'autoassorbimento | | 10.1016/j.jqsrt.2014.07.026 (CR); 10.1021/acs.analchem.9b01885 (AB); 10.3390/app10144973 eq. 30-31 (FT); 10.1177/0003702821999425 (AB) | Attribuzione: il C-sigma è di Aragón & Aguilera |
| Columnar-density Saha-Boltzmann (CD-SB) plot | T dalle densità colonnari dei livelli fondamentali atomico e ionico, ricavate quantificando l'autoassorbimento di righe di risonanza (Mg I 285.21, Mg II 279.55 e 280.27 nm) | Lega di Al, Nd:YAG 60 mJ, 1064 nm, 10 ns, 5 Hz, in aria; Echelle λ/Δλ = 2100; delay 0.5-5 µs, gate 0.5 µs; n_e = 4.16, 2.4, 1.6, 0.83, 0.55·10^17 cm^-3; soglia di McWhirter < 4·10^16 cm^-3 (ΔE = 4.34 eV) | 10.1016/j.jare.2019.01.008, §Setup e §Risultati (FT) | Dati spettroscopici NIST ASD. A delay lunghi solo il CD-SB è applicabile |
| OPC-LIBS (one-point calibration) | Un solo standard matrix-matched viene analizzato con CF-LIBS; si calcolano fattori di correzione empirici per riga P(λ) e li si applica alle intensità nei Boltzmann plot del campione | Test su campioni a base di rame (bronzi), composizione da XRF | 10.1016/j.sab.2013.05.016 | **WS**; le formule esatte non sono state viste |
| Ibrido CF/ANN: parametri di simulazione | T = 1.1 / 1.2 / 1.25 eV e n_e = 3 / 3.5 / 4·10^16 cm^-3 per E_laser = 50 / 100 / 150 mJ; righe Cu I 521.8, Cu I 578.2, Ni I 362.0, Ni II 241.6 nm; A_ki e g_k da NIST | Spettri sintetici Cu-Ni (Ni 0-10%), 1064 nm, 10 ns, spot 200 µm, rumore Poisson, 1000 spettri per campione | 10.1007/s00340-014-5990-z, Tab. I e §2-3 (FT preprint) | Rete feed-forward con 1 strato nascosto di 3-10 neuroni (tanh, uscita lineare), suddivisione 70/15/15 |
| ANN su bronzi | Modì double pulse, Nd:YAG 1064 nm, 2×60 mJ, ~8 ns, 10 Hz; interpulse 1 µs; delay 260 ns dopo il 2° impulso; lente f = 10 cm; 3606 canali in ingresso, 4 uscite (Cu, Zn, Sn, Pb); feature selection su finestre spettrali | 6 bronzi moderni | 10.1016/j.sab.2014.06.012, §2-3 (FT preprint) | |
| Strumento Modì (dati 2005) | Double pulse fino a 150 mJ per impulso, ~8 ns, interpulse 0-60 µs; Echelle λ/Δλ = 7500 con ICCD | | 10.1016/j.sab.2005.10.011, §3 (FT) | Esperimento di confronto al Cairo: Nd:YAG 800 mJ, 6 ns, 1064 nm, delay 0.1-5 µs |
| Graph clustering (LIBS/XRF) | Similarità = prodotto scalare normalizzato tra vettori spettrali (intensità XRF per energia o LIBS per lunghezza d'onda); grafo visualizzato con Gephi 0.8.2, layout Force Atlas | Classificazione non supervisionata | 10.21014/tc4-arc-2023.093 (FT), che cita Grifoni 2016 e Odelli 2020 | Su 73 anfore con pXRF: 75.35% di attribuzioni corrette, confrontato con cluster analysis e PCA (Odelli 2020, **WS**) |
| pXRF + hLIBS (Senesi 2023) | pED-XRF SciAps X-200, modalità "Alloy", due fasci 40 kV (pesanti) e 10 kV (leggeri), 30 s; hLIBS SciAps Z-903, 1064 nm, 5-6 mJ, ~1 ns, spot 100 µm, 1-50 Hz, 190-950 nm | Leghe di Cu e Fe archeologiche | 10.21014/tc4-arc-2023.093 (FT) | XRF in 3 cluster, LIBS in 4 cluster |
| XRF quantitativa | Metodo dei parametri fondamentali (FP) applicato agli spettri pED-XRF, poi classificazione con SOM o graph clustering | Monete d'oro etrusche (classificate soprattutto in base all'Ag); necropoli di Chovdar (8 gruppi) | 10.1177/0003702816641421 (AB); 10.3390/heritage6010010 (AB) | Software FP non specificato negli abstract |
| Micro-LIBS mapping | 4000 spettri su 10 mm², risoluzione laterale 50 µm; elementi H, C, O, Na, Mg, Al, Si, K, Ca, Ti, Mn, Fe; false color, blind separation, SOM | Malta romana (V sec. d.C.) | 10.1177/0003702817695289 (AB) | |
| Database spettroscopici | NIST ASD per A_ki e g_k (lavori 2015 e 2019, FT); Stark da letteratura (Griem e altri) | | 10.1007/s00340-014-5990-z; 10.1016/j.jare.2019.01.008 | Uso di Kurucz: **non trovato** nei testi visti |

### 3.4 Cercato e non trovato
- Abstract e full text di Tognoni 2010 (state of the art), Tognoni 2002, Bulajic 2002, Cavalcanti 2013 (OPC), Grifoni 2016 (graph theory e FP), Ferretti 2007 (Porticello), Rezaei 2020: tutti chiusi o bloccati. I contenuti in tabella per Bulajic, OPC e Odelli vengono da WebSearch.
- Full text di "Catching up on calibration-free LIBS" (JAAS 2023, OA): download bloccato da Cloudflare. Ho visto solo l'abstract. È la fonte principale da leggere a mano.
- Formula esatta dei fattori P(λ) nell'OPC: non trovata.
- Valori specifici di delay e gate "standard" raccomandati per il CF-LIBS: non trovati come raccomandazione generale. Ci sono solo valori sperimentali dei singoli lavori (sezione 3).
- Uso del database Kurucz: non trovato.
- Lavori su "Roman glass" con XRF quantitativa: non trovati in Crossref.
- Un articolo specifico "Pagnotta et al., micro-LIBS and micro-XRF": non trovato. Esiste "Micro-LIBS... Ancient Roman Mortars" (solo LIBS).
- h-index e profili Google Scholar o ResearchGate: non verificati.
- Dettagli del capitolo "Time-Dependent Spectral Analysis" (Wiley 2022, doi:10.1002/9781119759614) e del metodo "3D Boltzmann plot": solo titoli.

### 3.5 Che cosa servirebbe per la CF-LIBS in Acchiappaspettri
**Procedura** (schema della CF-LIBS: Ciucci et al., 1999, doi:10.1366/0003702991947612; brevetto US 6,657,721 e rassegne)

1. **Pre-elaborazione.** Sottrarre il fondo e il continuo, calibrare le lunghezze d'onda e la risposta spettrale (F deve essere costante su tutto lo spettro, quindi serve una curva di efficienza).
2. **Identificazione delle righe** con NIST ASD (λ, A_ki, g_k, E_k, E_i, E_ion). Scegliere righe isolate, con A_ki noto e di buona accuratezza. Evitare le righe di risonanza (E_i = 0) o segnalarle come a rischio di autoassorbimento.
3. **Fit dei profili** con una Voigt. Rimuovere la componente strumentale (formula di Olivero, eq. 19 di 10.3390/app10144973) e ottenere l'area integrata e la FWHM Lorentziana.
4. **Densità elettronica.** Calcolare n_e da Hα (656.28 nm) o Hβ (486.13 nm), oppure da una riga con w Stark noto: n_e ≈ Δλ_L·10^16/(2w).
5. **Autoassorbimento.** Stimare SA o correggere con I0 ≈ I·(Δλ/Δλ0)^0.85, dove Δλ0 = 2w·n_e/10^16 (*Spectroscopy* 2022, doi:10.56530/spectroscopy.xq8876v9; El Sherbini et al., 2005: α = −0.54, β = 0.46). Scartare le righe con SA molto basso.
6. **Boltzmann plot o Saha-Boltzmann plot.** Fare un Boltzmann plot per specie, oppure un Saha-Boltzmann plot che porta le righe ioniche sulla scala neutra tramite l'equazione di Saha. Ricavare T dalla pendenza (stessa T per tutte le specie) e le intercette q_s = ln(F C_s/U_s(T)).
7. **Concentrazioni delle specie e degli elementi.** C_s·F = U_s(T)·e^(q_s). Sommare I e II con Saha, iterando su n_e se manca una delle due specie (partenza n_e ~10^18 cm^-3).
8. **Chiusura.** Normalizzare con ΣC = 1, oppure usare uno standard interno di concentrazione nota. Riportare che l'errore è almeno pari alla frazione di elementi non rilevati.
9. **Controlli LTE.**
   - McWhirter: n_e > 1.6·10^12·T^1/2·ΔE³ (ΔE in eV, T in K), con avviso esplicito che è solo una condizione necessaria.
   - Confronto tra n_e da Stark e n_e da Saha.
   - Coerenza tra T(I) e T(II).
10. **Opzione OPC.** Se è disponibile uno standard matrix-matched, calcolare fattori per riga P(λ) = I_attesa/I_misurata dallo standard e applicarli al campione (Cavalcanti 2013; formula da verificare sul full text).
11. **Incertezze.** Propagare gli errori su A_ki, sulla regressione e sulla chiusura. Tognoni 2007 (10.1016/j.sab.2007.10.005) è lo studio numerico su accuratezza e precisione del CF-LIBS da leggere.

**Combinazione XRF + LIBS** (come nei lavori citati)

- La **XRF con parametri fondamentali** serve per i maggiori e i medi pesanti (Cu, Sn, Pb, Au, Ag, Fe). La **LIBS** serve per gli elementi leggeri (H, C, O, Na, Mg, Al, Si) e per la stratigrafia: colpi ripetuti su patine e corrosione. Esempi: Porticello 2007; Senesi 2023.
- La **XRF può fornire la composizione dello standard per l'OPC-LIBS**: così sono stati caratterizzati i bronzi di Cavalcanti 2013 (WS). Si può anche usare come vincolo o seed della chiusura CF.
- **Graph clustering comune ai due tipi di spettro.** Similarità = prodotto scalare normalizzato tra spettri. Si costruisce il grafo con una soglia e si cercano le comunità. Si applica separatamente a XRF e LIBS e si confrontano i cluster (Senesi 2023: 3 cluster XRF e 4 LIBS). In alternativa SOM (Arias 2016; Pagnotta 2017) o PCA come confronto (Odelli 2020).
- **Cautela sulla chemometria "black box".** Safi 2018 e D'Andrea 2015 raccomandano campioni di training che coprano l'intervallo di concentrazioni degli incogniti e mettono in guardia dall'estrapolazione. L'ANN ibrida usa come input righe scelte per significato fisico (stadi I e II).

**Che cosa manca oggi nell'app per farlo.**
- `LIBS_LINES` ha solo λ e lo stadio di ionizzazione. Servono A_ki, g_k, E_k, E_i ed E_ion di ogni riga, le funzioni di partizione U(T) e i coefficienti Stark w.
- La fonte naturale è il **NIST ASD** (Kramida et al.). Prima di includerne una selezione in `index.html` vanno lette le condizioni d'uso: i dati NIST di riferimento ricadono sotto lo *Standard Reference Data Act*. Lo stesso vale per le tabelle Stark (Griem, Konjević e altri).
- Serve anche la **risposta spettrale** dello strumento (curva di efficienza), che i file LIBS di solito non riportano.

**Lettura consigliata prima di implementare**: Poggialini et al. 2023 (JAAS, accesso aperto), Aberkane et al. 2020 (*Appl. Sci.*, accesso aperto), Cristoforetti et al. 2010, El Sherbini et al. 2005, *Spectroscopy* 2022 (doi:10.56530/spectroscopy.xq8876v9), Tognoni et al. 2007 (accuratezza attesa). I link ai testi aperti sono qui sotto.

- JAAS 2023 "Catching up on CF-LIBS": https://pubs.rsc.org/en/content/articlepdf/2023/ja/d3ja00130j
- Appl. Sci. 2020 (fondamenti, Stark, autoassorbimento, C-sigma): https://zenodo.org/records/14451390
- Cristoforetti 2010 (LTE): https://iris.cnr.it/retrieve/0dad71af-6818-4a93-aa8b-65fb7b1962c3/prod_171806-doc_12432.pdf
- El Sherbini 2005 (SA): https://iris.cnr.it/retrieve/339f814a-0a39-4c94-9283-5df202bfd64b/prod_39780-doc_13746.pdf
- *Spectroscopy* 2022 (autoassorbimento): https://iris.cnr.it/retrieve/c6504b3e-038d-46a8-a4e6-88d6080eda86/prod_474369-doc_193478.pdf
- JARE 2019 CD-SB: PMC6370548
- JAAS 2019, rassegna sui beni culturali: ARPI hdl 11568/952349
- Preprint ANN 2014 e CF/ANN 2015: ARPI hdl 11568/779938 e 11568/780488
- IMEKO 2023 XRF+LIBS+graph clustering: https://www.imeko.org/publications/tc4-Archaeo-2023/IMEKO-MetroArchaeo-2023-093.pdf
- Brevetto US 6,657,721 B1: https://patents.google.com/patent/US6657721

## 4. Confronto e proposta

### 4.1 Confronto punto per punto
| Funzione | Acchiappaspettri 3.0.0 | PyMca 5.9.7 | Scarto |
|---|---|---|---|
| Forma del picco | gaussiana | ipermetro (code corta e lunga, gradino) o pseudo-Voigt | **alto** sugli spettri reali |
| Larghezza | Fano fisso 0,114, si adatta solo la scala | Noise e Fano liberi | medio |
| Calibrazione | griglia su scostamento e guadagno; allineamento automatico da coppie di picchi | LM su Zero e Gain, partendo dalla calibrazione | pari (l'app è più robusta sui file mal calibrati) |
| Fughe | Si Kα, frazione analitica | tutte le righe del rivelatore (fisx), Si e Ge | medio |
| Picchi somma | solo etichetta | autoconvoluzione con parametro adattato | **alto** a conteggi alti |
| Fondo | B-spline non negative nel fit; SNIP | strip/SNIP più continuo analitico | pari |
| Diffusione | Rayleigh e Compton delle righe dell'anodo; angolo dal Compton | per ogni energia di eccitazione | pari o meglio l'app (stima dell'angolo) |
| Spettro del tubo | Kramers con costanti empiriche, ≤ 50 kV | Ebel (1999), 5–50 kV | **alto** senza standard |
| Monocromatico, sincrotrone | no | sì | medio (pochi utenti dei beni culturali) |
| Effetti di matrice | primaria e secondaria nel supporto spesso | primaria, secondaria, terziaria, anche fra strati (fisx) | medio |
| Multistrato | 1 strato + supporto, spessore da rapporti o attenuazione | fino a 10 strati nel calcolo diretto | medio |
| Senza standard | normalizzazione 100%, ossidi, Compton | standard interno o flusso assoluto | l'app è più pratica per i beni culturali |
| Con standard | fattori k, Lucas-Tooth e Price, leave-one-out | flusso dal riferimento | pari |
| Dati atomici | xraylib 4.2, 4 righe per elemento in FP | fisx: Scofield, Chen, EPDL97, XCOM, tutte le righe | medio |
| Configurazione | interna (intestazione del file e pannello) | `.cfg` documentato e diffuso | **alto** per l'interoperabilità |
| Riconoscimento automatico degli elementi | sì, con artefatti e righe coincidenti | no (l'utente sceglie dalla tavola periodica) | **vantaggio dell'app** |
| Mappe ed elaborazione in serie | serie di spettri | mappe, fit lineare veloce, batch | fuori scopo |

### 4.2 Proposte, in ordine di valore per l'utente
Sforzo in giornate di lavoro (g) di una sessione esperta, test compresi; stima grezza.

| # | Proposta | Valore | Sforzo | Note |
|---|---|---|---|---|
| 1 | **Validazione** con PyMca come riferimento e con materiali certificati | altissimo: è la condizione per dichiarare un'accuratezza | 3–5 g (più l'acquisto o il prestito di standard) | Il prototipo di questo studio ne è il primo passo; vedi § 4.4 |
| 2 | **Fit completo**: ipermetro (code corta e lunga, gradino), Noise e Fano liberi, fughe Si Kα + Kβ (e Ge), picchi somma per autoconvoluzione | alto: aree giuste su spettri reali, meno falsi elementi (Sb, I, Pb/As) | 6–10 g | Codice di riferimento MIT (`SpecfitFuns.c`, `ClassMcaTheory.py`). La NNLS resta per le aree; i parametri di forma si aggiungono alla ricerca su griglia o con un LM. Attenzione ai tempi sul web |
| 3 | **Spettro del tubo di Ebel** al posto di Kramers con costanti empiriche | alto per l'analisi senza standard | 3–4 g | Porting di `XRayTubeEbel.py` (MIT) o reimplementazione dall'articolo; tiene anche finestra, filtri e angoli. Va rifatto il benchmark |
| 4 | **Banche dati**: tutte le righe K, L1–L3, M con probabilità di Scofield, rese di Chen et al., Coster–Kronig, sezioni per sottoguscio | medio | 3–5 g | Da fisx (MIT) o da xraylib (BSD), già usato. Pesa sul file: oggi `FP_DATA` è dentro `index.html`. Conviene misurare prima quanto cambia sul benchmark |
| 5 | **Fluorescenza terziaria** e secondaria fra strati | medio (acciai, leghe Fe–Cr–Ni; dorature) | 3–4 g | Formule in fisx (MIT) |
| 6 | **Import ed export `.cfg` di PyMca** | medio-alto per chi usa già PyMca; utile anche per la validazione | 3–4 g | Lettore INI e liste; mappare `[detector]`, `[attenuators]`, `[tube]`, `[fit] energy…`, `[materials]`, `[multilayer]`, `[concentrations]`. Le chiavi senza equivalente vanno segnalate, non ignorate in silenzio. L'export permette di rifare il calcolo in PyMca |
| 7 | **Eccitazione monocromatica o con lista di energie** | basso-medio | 1–2 g | Facile, una volta che c'è l'import `.cfg` |
| 8 | **CF-LIBS** | alto per gli utenti LIBS, ma oggi la base manca | 15–25 g | Servono dati atomici (Aᵢₖ, gₖ, Eₖ) e funzioni di partizione, fit dei picchi LIBS (Voigt, Stark), grafico di Boltzmann o Saha–Boltzmann, criterio di McWhirter e correzione dell'autoassorbimento. Vedi § 3 |

Ordine consigliato: **1 → 2 → 3 → 6 → 4/5 → 7**, con la **8** come progetto separato. La validazione (1) va prima perché dice quale delle altre conta davvero.

### 4.3 Risultati del prototipo (`ricerca/xrf-pymca/`)
Due spettri, PyMca 5.9.7 + fisx 1.3.2 contro il nucleo di `index.html` (desktop 3.0.0).

**A. `Steel.spe`, distribuito con PyMca: acciaio NIST SRM 1155, eccitazione monocromatica 16 keV, configurazione `Steel.cfg` così com'è.** Valori di riferimento: il materiale `SRM_1155_COMPLETE` di `Steel.cfg` (da confrontare con il certificato NIST prima di usarli come «veri»). In PyMca Fe è lo standard interno (65,4%). Per l'app, che normalizza a 100%, i risultati sono riscalati alla somma di riferimento di Cr + Mn + Fe + Ni + Cu (96,83%).

| % in peso | Riferimento | PyMca, solo primaria | PyMca, + secondaria | PyMca, + terziaria | Acchiappaspettri (primaria + secondaria) |
|---|---|---|---|---|---|
| Cr | 18,37 | 31,16 | 20,27 | 19,84 (+8%) | 17,77 (−3%) |
| Mn | 1,619 | 2,00 | 1,88 | 1,88 (+16%) | 1,56 (−4%) |
| Fe | 64,31 | 65,4 (riferimento) | 65,4 | 65,4 | 65,51 (+2%) |
| Ni | 12,35 | 11,17 | 11,79 | 11,79 (−5%) | 11,82 (−4%) |
| Cu | 0,175 | 0,168 | 0,177 | 0,177 (+1%) | 0,171 (−2%) |
| χ²ᵣ del fit | | 13,1 (2,4–17 keV, `hypermetflag = 1`, cioè sola gaussiana: vedi la correzione al § 2.5) | | | 22,2 (4,5–15 keV, gaussiane) |

Lettura. (i) La fluorescenza secondaria è essenziale negli acciai: senza, Cr risulta +70%. L'app la include. (ii) Sulle concentrazioni i due programmi sono vicini; la normalizzazione a 100% avvantaggia l'app rispetto allo standard interno di PyMca, che qui non è stato ottimizzato. (iii) Il χ²ᵣ più alto dell'app su uno spettro reale da 3 milioni di conteggi è l'effetto atteso della forma gaussiana senza code (proposta 2). (iv) Per far girare l'app su questo spettro bisogna sostituire lo spettro del tubo con una riga a 16 keV nella cache (trucco da prototipo): è la proposta 7.

**B. Bronzo SINTETICO di `examples/` (tubo Rh 40 kV; verità: Cu 84, Sn 8, Pb 5, Zn 2,5, As 0,5%).** PyMca con lo spettro del tubo di Ebel, ipermetro, fughe e somme, SNIP; matrice iterata e normalizzata a 100% come fa l'app.

| % in peso | Verità | Acchiappaspettri | PyMca |
|---|---|---|---|
| Cu | 84,0 | 84,0 | 82,3 |
| Sn | 8,0 | 8,15 | 8,82 |
| Pb | 5,0 | 4,71 | 5,92 |
| Zn | 2,5 | 2,51 | 2,55 |
| As | 0,5 | 0,64 | 0,45 |

Lettura. Lo spettro è generato con il modello dell'app (Kramers, gaussiane), quindi l'app «gioca in casa». Lo scarto di PyMca (Sn +10%, Pb +18%) misura soprattutto la **differenza fra i due modelli di tubo** e fra le geometrie presunte. È proprio l'errore di modello che oggi l'app non vede, perché si valuta solo contro sé stessa: un argomento in più per la proposta 1.

### 4.4 Come validare
1. **PyMca come secondo parere**, automatico. Un test (fuori dalla CI ordinaria, o con i risultati di PyMca salvati in JSON come quelli di questo studio) fa girare entrambi i programmi sugli stessi spettri: `Steel.spe` e `XRFSpectrum.mca` di PyMca (il secondo è uno standard sottile multielemento; la sua configurazione è scritta dentro `tests/XrfTest.py`), gli esempi sintetici dell'app e spettri **generati da PyMca o da XMI-MSIM**. Così l'app non viene più valutata solo contro il proprio modello. Criteri da concordare: aree dei picchi principali entro il 2–3%; concentrazioni entro il 5% relativo sopra l'1% in peso.
2. **Materiali certificati pubblici o in commercio** (i valori vanno presi dai certificati, non da questo studio):
   - **NIST SRM 1155** (acciaio inossidabile AISI 316): lo spettro è già in PyMca.
   - **Serie CHARM** per le leghe di rame del patrimonio (Heginbotham & Solé 2017, *Archaeometry* 59, 714–730, doi:10.1111/arcm.12282). È il riferimento naturale per bronzi e ottoni, con un protocollo PyMca pubblicato.
   - Leghe di rame certificate **ERM/BCR** (per esempio i bronzi BCR-691), vetri **NIST SRM 610–612** e **Corning A–D** (vetri archeologici), rocce e suoli **USGS** (BCR-2, BHVO-2) per il modo «ossidi».
3. **Spessori**: foglie d'oro o di stagno di spessore noto su supporto, e dorature misurate in sezione, dove si trovano.
4. **Dati reali degli utenti**: Lorenzo e i tester con strumenti portatili (Rh, Ag, W). Ogni spettro va acquisito con il file `.cfg` di PyMca dello strumento: sono gli stessi file che la proposta 6 deve saper leggere.

## 5. Bibliografia

DOI verificati con l'API di Crossref il 19/11/2026 salvo dove indicato.

**XRF, PyMca e dati**
- Solé V.A., Papillon E., Cotte M., Walter Ph., Susini J. (2007). A multiplatform code for the analysis of energy-dispersive X-ray fluorescence spectra. *Spectrochim. Acta B* 62, 63–68. doi:10.1016/j.sab.2006.12.002
- Heginbotham A., Solé V.A. (2017). CHARMed PyMca, Part I: A protocol for improved inter-laboratory reproducibility in the quantitative ED-XRF analysis of copper alloys. *Archaeometry* 59, 714–730. doi:10.1111/arcm.12282
- Ebel H. (1999). X-ray tube spectra. *X-Ray Spectrom.* 28, 255–266. doi:10.1002/(SICI)1097-4539(199907/08)28:4<255::AID-XRS347>3.0.CO;2-Y
- Sherman J. (1955). The theoretical derivation of fluorescent X-ray intensities from mixtures. *Spectrochim. Acta* 7, 283–306. doi:10.1016/0371-1951(55)80081-1
- Shiraiwa T., Fujino N. (1966). Theoretical calculation of fluorescent X-ray intensities in fluorescent X-ray spectrochemical analysis. *Jpn. J. Appl. Phys.* 5, 886. doi:10.1143/JJAP.5.886
- Schoonjans T., Brunetti A., Golosio B., Sanchez del Rio M., Solé V.A., Ferrero C., Vincze L. (2011). The xraylib library for X-ray–matter interactions. Recent developments. *Spectrochim. Acta B* 66, 776–784. doi:10.1016/j.sab.2011.09.011
- Schoonjans T., Vincze L., Solé V.A., Sanchez del Rio M., Brondeel P., Silversmit G., Appel K., Ferrero C. (2012). A general Monte Carlo simulation of energy dispersive X-ray fluorescence spectrometers — Part 5. *Spectrochim. Acta B* 70, 10–23. doi:10.1016/j.sab.2012.03.011
- Scofield J.H. (1974). Exchange corrections of K x-ray emission rates. *Phys. Rev. A* 9, 1041–1049. doi:10.1103/PhysRevA.9.1041
- Scofield J.H. (1974). Relativistic Hartree-Slater values for K and L X-ray emission rates. *At. Data Nucl. Data Tables* 14, 121–137. doi:10.1016/S0092-640X(74)80019-7
- Scofield J.H. (1973). Theoretical photoionization cross sections from 1 to 1500 keV. Rapporto UCRL-51326, LLNL (senza DOI; non verificato su Crossref).
- Chen M.H., Crasemann B., Mark H. (1981). Widths and fluorescence yields of atomic L-shell vacancy states. *Phys. Rev. A* 24, 177–182. doi:10.1103/PhysRevA.24.177
- Bhalla C.P. (1970). Radiative transition probabilities for vacancies in M sub-shells. *J. Phys. B* 3, 916–924. doi:10.1088/0022-3700/3/7/004
- Larkins F.P. (1977). Semiempirical Auger-electron energies for elements 10 ≤ Z ≤ 100. *At. Data Nucl. Data Tables* 20, 311–387. doi:10.1016/0092-640X(77)90024-9
- Krause M.O. (1979). Atomic radiative and radiationless yields for K and L shells. *J. Phys. Chem. Ref. Data* 8, 307–327. doi:10.1063/1.555594
- Elam W.T., Ravel B.D., Sieber J.R. (2002). A new atomic database for X-ray spectroscopic calculations. *Radiat. Phys. Chem.* 63, 121–128. doi:10.1016/S0969-806X(01)00227-4
- Berger M.J., Hubbell J.H. (1987). XCOM: Photon cross sections on a personal computer. NBSIR 87-3597 (senza DOI).
- Cullen D.E. et al. (1997). EPDL97: the Evaluated Photon Data Library, '97 version. UCRL-50400 vol. 6, LLNL (senza DOI; non verificato).
- Bambynek W. (1984). Atti della conferenza X-84 sui processi X e dei gusci interni, Lipsia (citato nei file di fisx; non verificato).
- Kramers H.A. (1923). On the theory of X-ray absorption and of the continuous X-ray spectrum. *Phil. Mag.* 46, 836–871. doi:10.1080/14786442308565244
- Kanaya K., Okayama S. (1972). Penetration and energy-loss theory of electrons in solid targets. *J. Phys. D* 5, 43–58. doi:10.1088/0022-3727/5/1/308
- Ryan C.G., Clayton E., Griffin W.L., Sie S.H., Cousens D.R. (1988). SNIP, a statistics-sensitive background treatment for the quantitative analysis of PIXE spectra in geoscience applications. *Nucl. Instrum. Methods B* 34, 396–402. doi:10.1016/0168-583X(88)90063-8
- Morháč M., Kliman J., Matoušek V., Veselský M., Turzo I. (1997). Background elimination methods for multidimensional coincidence γ-ray spectra. *Nucl. Instrum. Methods A* 401, 113–132. doi:10.1016/S0168-9002(97)01023-1
- Van Gysel M., Lemberge P., Van Espen P. (2003). Implementation of a spectrum fitting procedure using a robust peak model. *X-Ray Spectrom.* 32, 434–441. doi:10.1002/xrs.666
- Cesareo R., Rizzutto M.A., Brunetti A., Rao D.V. (2009). Metal location and thickness in a multilayered sheet by measuring Kα/Kβ, Lα/Lβ and Lα/Lγ X-ray ratios. *Nucl. Instrum. Methods B* 267, 2890–2896. doi:10.1016/j.nimb.2009.06.119
- Cesareo R., Brunetti A. (2008). Metal sheets thickness determined by energy-dispersive X-ray fluorescence analysis. *J. X-Ray Sci. Technol.* 16, 119–130. doi:10.3233/XST-2008-00196 (CR; abstract letto con OpenAlex: spessore delle dorature dal rapporto fra righe K)
- Trojek T., Čechák T., Musílek L. (2010). Recognition of pigment layers in illuminated manuscripts by means of Kα/Kβ and Lα/Lβ ratios of characteristic X-rays. *Appl. Radiat. Isot.* 68, 871–874. doi:10.1016/j.apradiso.2009.09.054 (CR)
- Trojek T., Wegrzynek D. (2010). X-ray fluorescence Kα/Kβ ratios for a layered specimen: comparison of measurements and Monte Carlo calculations with the MCNPX code. *Nucl. Instrum. Methods A* 619, 311–315. doi:10.1016/j.nima.2009.10.157 (CR)
- *Verifica delle citazioni di `fpLayerSolve` (3.1, 19/11/2026).* «Cesareo et al. 2008» nell'elenco dell'app era il capitolo Cesareo, Ridolfi, Marabelli et al., *Portable X-ray Fluorescence Spectrometry*, RSC 2008, pp. 206–246, doi:10.1039/9781847558640-00206: esiste (Crossref), ma è una rassegna sugli strumenti portatili. «Trojek 2011» era *J. Anal. At. Spectrom.* 26, 1253 (doi:10.1039/c0ja00187b): esiste, ma tratta gli effetti della superficie e la ricostruzione del rilievo, non il metodo dei rapporti fra righe. Nell'app sono stati sostituiti dai tre articoli specifici sul metodo: Cesareo e Brunetti 2008, Cesareo et al. 2009, Trojek et al. 2010.
- Lucas-Tooth H.J., Price B.J. (1961). *Metallurgia* 64 (citato dall'app; senza DOI, pagine non verificate).

**LIBS e CF-LIBS**: la bibliografia completa, con DOI e livello di verifica, è la tabella del § 3.2 (37 voci più i riferimenti di controllo), integrata dai lavori elencati sotto quella tabella.
