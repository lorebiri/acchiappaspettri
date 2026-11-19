# Studio: XRF di Acchiappaspettri, PyMca e i metodi di V. Palleschi

*Studio del 19 novembre 2026 sul ramo `claude/studio-pymca`, partito da `desktop` (3.0.0). Non è un'implementazione: nessun file dell'app è stato cambiato. Il prototipo di confronto è in [`ricerca/xrf-pymca/`](../../ricerca/xrf-pymca/).*

## In breve, per chi non è del mestiere

- **Che cosa fa oggi l'app.** Acchiappaspettri riconosce gli elementi in uno spettro XRF, ne misura i picchi e stima la composizione **senza standard** con un modello fisico («parametri fondamentali», FP). Sul suo stesso esempio sintetico va molto bene. Però tutta la sua accuratezza è stata misurata su **spettri simulati con lo stesso modello**: non c'è ancora una prova su materiali certificati.
- **Che cos'è PyMca.** È il programma di riferimento per l'XRF, sviluppato all'ESRF di Grenoble da quasi vent'anni e usato anche nei beni culturali (per esempio nel protocollo «CHARMed PyMca» per le leghe di rame). Il suo codice e i suoi dati sono per la quasi totalità sotto **licenza MIT**, compatibile con la licenza GPL di Acchiappaspettri: si possono **riusare codice e tabelle**, citando la fonte.
- **Prima prova di confronto** (prototipo di questo studio, sullo spettro reale di un acciaio certificato distribuito con PyMca): l'app e PyMca danno valori simili, entro qualche per cento per Cr, Ni e Fe. Il fit di PyMca descrive meglio la forma dei picchi reali (χ² ridotto 13 contro 22). Su un solo spettro è un indizio, non una validazione.
- **Che cosa manca all'app, in ordine di utilità.** (1) Una **validazione vera** con materiali certificati e con PyMca come secondo parere. (2) Un **fit più completo**: code dei picchi, picchi somma, fughe di tutte le righe. (3) Uno **spettro del tubo** preso dalla letteratura (Ebel) invece che da costanti scelte a mano. (4) **Banche dati** più complete per le righe deboli. (5) **Leggere e scrivere i file di configurazione di PyMca**, così chi usa già PyMca porta i suoi parametri.
- **Vincenzo Palleschi (CNR, Pisa)** è uno degli inventori della **LIBS senza taratura** (CF-LIBS, 1999). Oggi l'app riconosce soltanto le righe LIBS: non ne calcola la composizione. La CF-LIBS darebbe la composizione da uno spettro LIBS **senza standard**. Richiede però dati atomici di ogni riga e spettri ben acquisiti, ed è il lavoro più lungo fra quelli proposti. I parametri e gli articoli verificati sono nel § 3.

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
| `[fit]` | `xmin`, `xmax`, `energy`, `energyweight`, `energyflag`, `energyscatter`, `hypermetflag`, `escapeflag`, `sumflag`, `stripflag`, `stripalgorithm`, `snipwidth`, `continuum`, `maxiter`, `deltachi`, `linearfitflag` | hypermet 1 (cioè tutte le code), escape 1, SNIP 30, maxiter 10 |
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

## 3. Vincenzo Palleschi: articoli e parametri

*(sezione in compilazione)*

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
| 8 | **CF-LIBS secondo Palleschi** | alto per gli utenti LIBS, ma oggi la base manca | 15–25 g | Servono dati atomici (Aᵢₖ, gₖ, Eₖ) e funzioni di partizione, fit dei picchi LIBS (Voigt, Stark), grafico di Boltzmann o Saha–Boltzmann, criterio di McWhirter e correzione dell'autoassorbimento. Vedi § 3 |

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
| χ²ᵣ del fit | | 13,1 (2,4–17 keV, ipermetro) | | | 22,2 (4,5–15 keV, gaussiane) |

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
- Cesareo R., Rizzutto M.A., Brunetti A., Rao D.V. (2009). Metal location and thickness in a multilayered sheet by measuring Kα/Kβ, Lα/Lβ and Lα/Lγ X-ray ratios. *Nucl. Instrum. Methods B* 267, 2890–2896. doi:10.1016/j.nimb.2009.06.119. *Nota: il commento di `fpLayerSolve` cita «Cesareo et al. 2008» e «Trojek 2011». Crossref non ha restituito un articolo che corrisponda a questi due riferimenti: vanno controllati.*
- Lucas-Tooth H.J., Price B.J. (1961). *Metallurgia* 64 (citato dall'app; senza DOI, pagine non verificate).

**Palleschi, LIBS e CF-LIBS**: vedi § 3.
