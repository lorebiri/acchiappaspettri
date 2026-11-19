# Funzioni scientifiche: metodi, correzioni, limiti

Le formule sono citate nell'interfaccia e nel README; il paragrafo «Metodi» esportato riporta quelle usate. Qui: che cosa è stato verificato, che cosa è stato cambiato e perché, che cosa resta approssimato.

## Correzioni della versione 2.2 (revisione scientifica di novembre 2026)
| Dove | Errore | Effetto | Correzione |
|---|---|---|---|
| Tabelle FP (`FP_DATA`) | Energie Kβ errate per Z ≥ ~50: `LineEnergy(KB_LINE)` di xraylib pesa componenti senza energia (Ba 35,52 invece di ~36,4 keV) | Ba −81%, Sb −24%, Sn −2% in simulazione | Energia media pesata solo sulle componenti definite (`scripts/gen-fp-data.py`); test contro `XRF_LINES` |
| `fpCalibrate` | Standard con composizione parziale: matrice sbagliata | Sensibilità errate fino a 5× | Standard con somma < 90% ignorati, con avviso |
| `chromMetrics` | Base cercata in una finestra fissa, che su picchi larghi resta sul picco | N 9091 invece di 5625 (σ = 0,2 min) | Finestra proporzionale alla larghezza; test |
| S/N HPLC | H/σ confrontato con il criterio ICH/farmacopea | Valore ~3 volte più alto | S/N = 2H/h con h picco-picco, Ph. Eur. 2.2.46, USP <621> |
| `eprDoubleIntegral` | Medie delle finestre attribuite agli estremi invece che ai centri | −9% con deriva del 13% | Retta per i centri delle finestre; test |
| DSC | Colonna del tempo senza unità letta come minuti | ΔH fino a 60× | La velocità nell'intestazione ha la precedenza; senza unità si sceglie quella con velocità plausibile |
| Testi | «affidabile», «modello predittivo affidabile», La > 2 nm | Più certezza di quanta dimostrata | Testi corretti; Cançado: La ~20–500 nm |

## Verificato dalla revisione
Fluorescenza primaria e secondaria (anche contro Monte Carlo, entro lo 0,1%), Klein–Nishina, N, T, As, Rs, retta di taratura, LOD/LOQ, Mandel, PLS, PCA, Tauc, onset, costante g (71,4477), Stokes, resa quantica. μ/ρ entro lo 0,5% da xraylib. Come sono provati in [COLLAUDO.md](COLLAUDO.md); i limiti in [LIMITAZIONI.md](LIMITAZIONI.md).

## Approssimazioni dichiarate del motore FP
- Spettro del tubo: Kramers con autoassorbimento e righe caratteristiche. Costanti **empiriche, non dalla letteratura**: intensità delle righe 1100, fattore L 0,25, profondità 0,7·R (Kanaya–Okayama), angolo d'uscita 20°. Per questo senza standard l'errore relativo in simulazione ha mediana di circa 3–4% (fino al 7% secondo il modello del tubo) e 90° percentile di 20–30%, di più sugli elementi sotto il 2–3% (benchmark `test/xrf-fp-benchmark.js` e prove dei tester virtuali); nella realtà può essere maggiore.
- Rese ω: forma Z⁴/(Z⁴+A) approssimata (usata solo per il tubo). Compton: S ≈ 0,92·Z.
- Rivelatore: Be 12,5 µm, Si 500 µm, 1 cm d'aria se non dichiarati. Picchi somma assenti; le fughe si aggiungono ma non si tolgono dal picco principale (1,4% a 2,3 keV, 0,2% a 8 keV). (Modello 3.0; il 3.1 è descritto sotto.)
- Spessori: nessuna fluorescenza fra strati; lo strato deve essere uniforme.
- Tutti i numeri di accuratezza vengono da **spettri simulati**, generati con lo stesso modello fisico anche quando perturbato. **Non c'è ancora una validazione su materiali certificati.**

## XRF: modello 3.1 (dopo la 3.0.0; predefinito per le analisi nuove)
Il modello della 3.0 (sopra) resta disponibile e resta in uso per le impostazioni e i progetti salvati con la 3.0, con un avviso. Il modello 3.1 segue PyMca (Solé et al. 2007, doi:10.1016/j.sab.2006.12.002; codice e dati MIT, avviso in THIRD-PARTY-NOTICES.md) e la letteratura citata qui.
- **Forma del picco**: ipermetro come «ahypermet» di PyMca (Van Gysel, Lemberge, Van Espen 2003, doi:10.1002/xrs.666): gaussiana di area A, coda corta e lunga con aree relative r e pendenze β in keV, gradino di altezza relativa h. Valori di partenza di PyMca (0,05/0,5; 0,02/10; 10⁻⁴). FWHM = √(Noise² + 2,3548²·0,00385·Fano·E): Noise e Fano liberi, oppure fissati.
- **Fughe**: Kα e Kβ del rivelatore (silicio o germanio) per **tutte** le righe, con la formula di Reed e Ware come `Elements.getEscape` di PyMca (entro il 4% dei valori di PyMca per Si e Ge). L'area di una riga comprende i fotoni finiti nella fuga. Le righe L di fuga del germanio (≈ 10⁻⁴) sono trascurate.
- **Picchi somma**: autoconvoluzione del modello dei picchi (come `SpecfitFuns.pileup`), con ampiezza non negativa adattata; facoltativi (predefinito: attivi).
- **Calibrazione**: scostamento, guadagno e termine quadratico facoltativo, adattati insieme ai parametri di forma con **Levenberg–Marquardt con limiti** (`lmBox`, arresto con Δχ² relativo 0,001 come PyMca); le ampiezze restano minimi quadrati non negativi (proiezione variabile). Angolo di diffusione dal Compton anche nel Levenberg–Marquardt.
- **Eccitazione a lista di energie** (monocromatica, sincrotrone, `[fit] energy` di PyMca): un Rayleigh e un Compton per ogni energia marcata «diffusione».
- **Spettro del tubo di Ebel** (1999), *X-Ray Spectrom.* 28, 255–266, doi:10.1002/(SICI)1097-4539(199907/08)28:4<255::AID-XRS347>3.0.CO;2-Y, valido per 5–50 kV, incidenza degli elettroni 50–90°, uscita 5–90°: continuo e righe K come `XRayTubeEbel.py` di PyMca (continuo identico entro lo 0,5%, righe K entro l'1%); righe L con z_L = 8, b_L = 0,25 e costanti per sottoguscio L1 0,71·10¹³, L2 2,70·10¹³, L3 4,94·10¹³ come nell'implementazione di XMI-MSIM (Schoonjans et al. 2012), che le attribuisce a Ebel (2003, *X-Ray Spectrom.* 32, 46–51, doi:10.1002/xrs.610, testo non letto). Configurabili: anodo (14 elementi), kV, incidenza degli elettroni, angolo d'uscita, finestra di berillio, filtro, tubo a trasmissione. Nota: per le righe K PyMca usa 6,0·10¹³, XMI-MSIM 5,0·10¹³; qui come PyMca.
- **Fluorescenza terziaria**, approssimata: la riga che eccita l'elemento i è rinforzata dalla secondaria nella stessa matrice di (1 + S_j/P_j). Sull'acciaio SRM 1155 sposta Cr/Fe dell'1,1% (PyMca, con il calcolo completo di fisx: 2,1%).
- **Banche dati**: righe Lγ e M, rese ω (K, L1–L3, M1–M5), Coster–Kronig e righe per sottoguscio degli anodi da xraylib; produzione delle righe su 5 punti per tratto fra due spigoli. Controllo con xraylib (`scripts/check-fp-data.py`, `test/unit/fp-dati.test.js`): sezione fotoelettrica entro lo 0,5%; produzione delle righe della 3.0 con mediana 0,8% e 95° percentile 10% (Lγ e elementi leggeri lontano dagli spigoli), con la tabella fine del 3.1 95° percentile sotto il 4%.
- **Pesi del fit** (debug 3.1): σ² dei conteggi dallo spettro lisciato su mezza larghezza di riga, non dal conteggio del singolo canale (1/√y, χ² di Neyman, usato da PyMca e dal modello 3.0). Con pochi conteggi per canale 1/√y sottostima le righe deboli: sul bronzo sintetico (Sn vero 8,0 %) Sn 8,30 / 7,53 / 6,86 % a 2048 / 4096 / 8192 canali contro 8,05 / 8,20 / 8,46 % con i pesi lisciati. Sull'acciaio NIST di PyMca e sui bronzi certificati i risultati non cambiano (vedi VALIDAZIONE-DATI-REALI). I pesi 1/√y restano sceglibili nel pannello.
- **Verifica degli elementi con il fit** (`xrfConfirm`): un elemento proposto entra nel calcolo solo se la sua riga analitica è significativa (oltre 3σ) e se toglierlo peggiora il χ² più della soglia (Δχ²/χ²ᵣ ≥ 25). Le famiglie K, L e M di un elemento hanno ampiezze indipendenti nel fit: senza il primo criterio Sb «ripara» con le sue righe L la zona L dello stagno mentre la sua Kα è nulla. Gli elementi tolti sono elencati negli avvisi; se l'utente li aggiunge a mano restano.
- **Confronto con PyMca** (docs/VALIDAZIONE-PYMCA.md, sezione R15 di VALIDAZIONE.md): sullo spettro reale Steel.spe (SRM 1155) χ²ᵣ 7,9 contro 13,1 di PyMca e 15,2 del modello 3.0 sullo stesso intervallo; aree di Cr, Fe, Ni, Cu entro l'1%; Cr, Mn, Ni entro il 5% del certificato NIST.
- **Limiti**: la superiorità del tubo di Ebel sulle costanti della 3.0 non è dimostrata finché mancano spettri reali di materiali certificati; sugli spettri sintetici generati con il modello 3.0 (esempi, test) il 3.1 dà scarti del 3–5% che misurano la differenza fra i due modelli di tubo, non un errore. Con pochi conteggi (picco < 1000) la verifica toglie anche elementi veri ma non significativi, e lo dice.

## Rimozione del fondo (dopo la 3.0.0-rc.5)
- Metodi in `app/baseline-core.js`: ALS (Eilers & Boelens 2005), arPLS (Baek et al. 2015), ModPoly (Lieber & Mahadevan-Jansen 2003), IModPoly (Zhao et al. 2007; primo passo senza i punti sopra polinomio + DEV), SNIP (Ryan et al. 1988, finestra decrescente di Morháč 1997, con lisciatura preliminare), rolling ball (Kneen & Annegarn 1996: minimo, massimo e media mobile), punti di ancoraggio con PCHIP (Fritsch & Carlson 1980). Smoother di Whittaker con LDLᵀ pentadiagonale in O(n); polinomi in base di Čebyšëv con equazioni normali (Cholesky); minimi e massimi su finestra con code monotone in O(n).
- Valori consigliati (`baseDefaults`): λ di ALS = 10⁵·(n/1000)⁴, p = 0,05; arPLS come la base automatica storica; polinomio di grado 6; SNIP e rolling ball dalla larghezza tipica dei picchi misurata su uno spettro prima appiattito con arPLS (sul dato grezzo la gobba della fluorescenza sembrerebbe il picco più grande).
- arPLS e SNIP senza parametri danno gli stessi numeri delle versioni precedenti (test `fondo.test.js`).
- Oltre 100 000 punti ALS e arPLS lavorano su medie a blocchi con λ/k⁴ e interpolano: 2 milioni di punti in circa un secondo.

## CF-LIBS (sperimentale, dopo la 3.0.0)
Analisi LIBS senza taratura, CF-LIBS (Ciucci et al., 1999, doi:10.1366/0003702991947612): aree con fit di Voigt e deconvoluzione di Olivero, n_e da Hα/Hβ (Gigosos 2003) o da una riga con w noto, grafico di Boltzmann e di Saha–Boltzmann con regressione pesata, Saha–Eggert, chiusura a 100 % o standard interno, correzione facoltativa dell'autoassorbimento (El Sherbini et al., 2005, doi:10.1016/j.sab.2005.10.011; *Spectroscopy* 2022, doi:10.56530/spectroscopy.xq8876v9), controllo di McWhirter (necessario, non sufficiente). Dati atomici dal NIST ASD 5.12 (`app/libs-data.js`), algoritmo in `app/libs-cf-core.js`. Metodo, formule con le fonti, validazione e limiti: [CF-LIBS.md](CF-LIBS.md). **Validata solo su spettri sintetici generati con lo stesso modello**; sull'unico spettro reale pubblico provato non dà risultati utili.

## Limiti noti non corretti
- XRF empirico (`xrfIntensities`): con tubo ignoto la finestra del Compton 16–21,5 keV può includere il Rayleigh del Rh; ±1 FWHM taglia parte del Compton.
- Currie: «rilevato» sopra L_D è prudente; è dichiarato nel testo.
- EPR: campo senza unità dichiarata (colonna «Field» o file senza intestazione): con la frequenza si sceglie G, mT o T perché la riga più intensa dia g tra 1,5 e 6; senza frequenza (o se nessun fattore va bene) una riga oltre 1000 è presa per gauss e divisa per 10, sempre con avviso. Un file in banda Q in mT senza frequenza viene quindi diviso per 10: l'avviso lo dice.
- EPR, doppio integrale: base presa dal 5 % agli estremi. Se lì c'è ancora segnale (riga vicina al bordo o troppo larga) o il risultato è negativo compare ⛔; una lorentziana in una finestra di ±5–7 HWHM ha ⛔ (66–75 % del vero), in ±10 HWHM dà circa l'82 % del vero senza ⛔ (limite fisico delle code).
- Tauc in riflettanza: R va dato in %. FTIR: T frazionaria 0–1 viene presa per assorbanza.
- Ammide I: stessa assorbività per tutte le strutture, zone per H₂O e stato solido (dichiarato).

## Roadmap (non implementata)
XRD, GC, ICP-OES e ICP-MS **non ci sono**. GC si avvicinerebbe alle figure di merito HPLC; XRD richiederebbe database di fasi; ICP richiederebbe flussi di taratura propri. Vanno aggiunte solo con dati reali di prova.
