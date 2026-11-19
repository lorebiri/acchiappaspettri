# CF-LIBS (LIBS senza taratura): metodo, formule, fonti, limiti — SPERIMENTALE

Base per l'analisi quantitativa LIBS senza taratura, CF-LIBS (Ciucci et al., 1999, doi:10.1366/0003702991947612; brevetto US 6,657,721 B1). Lo studio di partenza è [studi/XRF-PYMCA-CFLIBS.md](studi/XRF-PYMCA-CFLIBS.md), §3.3 (parametri e formule) e §3.5 (procedura).

**Stato: sperimentale.** È validata solo su spettri **sintetici** generati con lo stesso modello fisico, e su un solo spettro reale pubblico, dove **non** dà risultati utili (vedi «Validazione»). Non va usata per dichiarare concentrazioni.

## File
| File | Contenuto |
|---|---|
| `scripts/gen-libs-data.py` | scarica dal NIST ASD (righe, livelli, energie di ionizzazione), salva i file grezzi in `scripts/.nist-cache/` (fuori dal repository) e scrive `app/libs-data.js`; con la stessa cache il risultato è identico byte per byte (`--offline`) |
| `app/libs-data.js` | banca dati (83 kB): 51 specie (stadi I e II di 26 elementi), 1225 righe, U(T), E_ion, ΔE per McWhirter, masse atomiche |
| `app/libs-cf-core.js` | algoritmo puro, senza DOM (UMD come `kinetics-core.js`: `module.exports` in node, `LibsCf` nel browser e nel worker) e generatore di spettri sintetici |
| `app/libs-cf-ui.js` | pannello «CF-LIBS (sperimentale)» nella scheda delle ipotesi degli spettri LIBS |
| `test/unit/libs-cf.test.js` | prove di ogni funzione e validazione sintetica; `LIBS_REPORT=1 node --test test/unit/libs-cf.test.js` stampa la tabella dei risultati |
| `test/validation/libs-cf-ui.test.js` | il pannello nel browser vero (italiano e inglese) |
| `test/fixtures/libs/` | spettro reale SuperLIBS 0201H (CC BY 4.0) e lo script che lo estrae; `gen-sintetici.js` scrive spettri sintetici CSV (bronzo, acciaio, vetro, bronzo autoassorbito) da aprire nell'app, deterministici |

## Banca dati atomica
- **Fonte**: Kramida A., Ralchenko Yu., Reader J., NIST ASD Team (2024). *NIST Atomic Spectra Database* (versione 5.12), NIST Standard Reference Database 78, https://physics.nist.gov/asd, doi:10.18434/T4W30F. Scaricata il 19/11/2026 (data scritta nel file). Moduli `lines1.pl` (TSV, `format=3`), `energy1.pl`, `ie.pl`.
- **Elementi**: H, Li, C, N, O, Na, Mg, Al, Si, K, Ca, Ti, Cr, Mn, Fe, Co, Ni, Cu, Zn, Sr, Ag, Sn, Sb, Ba, Au, Pb; stadi I e II.
- **Righe**: solo E1, λ in aria tra 200 e 900 nm, A_ki noto, accuratezza NIST AAA…C (A_ki entro il 25 %), E_i, E_k, g_i, g_k definiti; per specie le 30 con emissività LTE più alta a 10 000 K (g_k A_ki e^{−E_k/kT}/λ). È una scelta per tenere il file piccolo. Se una specie ha meno di 10 righe così, si completa con classi D+, D, E (marcate dalla classe): Sn I (1 sola riga ≥ C su 55), Ag I, Cr II, Sr II. **Senza nessuna riga utilizzabile nel NIST in 200–900 nm**: K II, Sb I (nessuna A_ki), Sb II, Au II, Pb II (una riga, senza classe): per questi elementi lo ione si ricava solo con l'equazione di Saha. Idrogeno: le componenti di struttura fine di ogni riga di Balmer sono sommate.
- **Funzioni di partizione** U(T) = Σ g_k e^{−E_k/kT} (brevetto eq. 3) sui livelli NIST sotto il limite di ionizzazione, su una griglia 3000–30 000 K ogni 500 K. Confronto a 1 eV con il valore calcolato dal NIST stesso (nel file, `pfCheck1eV`): entro l'1 % per quasi tutte le specie, fino al 5 % in meno per Ca I, Sr I, Mn I, Cr I, perché il NIST conta anche i livelli sopra il limite (autoionizzanti) e qui no. Non c'è abbassamento del potenziale di ionizzazione e i livelli mancanti nel NIST mancano anche qui (U sottostimata ad alta T).
- **Masse atomiche**: pesi standard abbreviati IUPAC/CIAAW 2021 (doi:10.1515/pac-2019-0603), scritti nello script.
- **Coefficienti Stark w: non inclusi.** Le tabelle (Griem, Konjević et al., Stark-B) hanno condizioni d'uso da verificare. Senza w la correzione automatica dell'autoassorbimento e n_e da righe non idrogenoidi richiedono che l'utente dia w (nel modulo; il pannello non lo chiede ancora).
- **Condizioni d'uso**: vedi THIRD-PARTY-NOTICES.md (voce «NIST ASD»). In breve: i dati SRD sono protetti da copyright del Segretario al Commercio degli USA (15 U.S.C. §290e); la pagina SRD del NIST dice che non si possono riprodurre senza permesso; l'app ridistribuisce un estratto piccolo, selezionato e trasformato, con la citazione chiesta dal NIST. **Prima di pubblicare una versione con questi dati va chiesta conferma al NIST (Office of Data and Informatics / SRD).**

## Procedura e formule (con le fonti)
Ipotesi di tutto il metodo: plasma **omogeneo**, **otticamente sottile** (salvo la correzione), in **LTE**, **risposta spettrale nota e costante** (il fattore F è lo stesso per tutte le righe).

1. **Aree delle righe** (`fitLines`). Fit locale con profilo di **Voigt** (funzione di Faddeeva, approssimazione di Humlíček 1982, doi:10.1016/0022-4073(82)90078-4) più fondo lineare. La larghezza strumentale (FWHM Gaussiana) si dichiara; se manca si adatta. Righe più vicine di 3 larghezze si adattano insieme; quelle più vicine di 0,6 larghezze sono inseparabili e si scartano. Centri e larghezze con Levenberg–Marquardt, aree e fondo per proiezione variabile (Golub e Pereyra 1973). Si scartano le righe con S/N < 8, al limite dei parametri o più larghe di 4 volte la mediana (di solito una riga non in banca dati sotto il profilo).
2. **Deconvoluzione strumentale** (Olivero e Longbothum 1977, doi:10.1016/0022-4073(77)90161-3; eq. 19 di Aberkane et al. 2020, doi:10.3390/app10144973): f_V = 0,5346 f_L + √(0,2166 f_L² + f_G²), invertita in modo esatto (`lorentzFromVoigt`). Nel PDF di Aberkane la formula è disordinata: si usa la forma standard di Olivero.
3. **Densità elettronica**:
   - riga con coefficiente Stark w noto: Δλ_L = 2w·n_e/10¹⁶ (Aberkane 2020 eq. 13; forma completa eq. 11–12), quindi n_e = Δλ_L·10¹⁶/(2w);
   - **Hα** (656,28 nm) e **Hβ** (486,13 nm). Aberkane 2020 dà la forma Δλ = γ_α n_e^{2/3} (eq. 14, da Pardini et al. 2013, doi:10.1016/j.sab.2013.05.030) e Δλ = γ_β n_e^{0,68116} (eq. 15, Gigosos 2014) **senza i valori di γ**. Coefficienti usati: Gigosos, González, Cardeñoso 2003 (*Spectrochim. Acta B* 58, 1489, doi:10.1016/S0584-8547(03)00097-1): FWHM(Hβ) = 4,800 nm·(n_e/10¹⁷ cm⁻³)^0,68116 e FWHM(Hα) = 1,098 nm·(n_e/10¹⁷ cm⁻³)^0,67965. **Verifica: WS** (articolo non letto; i due coefficienti sono confermati solo da fonti secondarie trovate con ricerche web). La formula di El Sherbini et al. 2005 (n_e = C(λ,T)·Δλ^{3/2}, eq. 13) **non è implementata**: manca la tabella C(λ,T) di Griem. Il profilo di Balmer si approssima con una Voigt e se ne prende la componente Lorentziana. Con molto idrogeno Hα è autoassorbita: meglio Hβ;
   - senza misura di n_e: **iterazione** chiusura → n_e = Σ N_ioni → Saha, a partire da 10¹⁸ cm⁻³ (brevetto, passo A iii, come riportato nello studio). Per fissare la scala assoluta (Σ N_ioni) l'app assume **pressione di 1 atm**: N_tot = p/(k_B T) e n_e = N_tot·X/(1+X), con X = Σ c_el·(frazione ionizzata). Questa ipotesi è dell'app, non è stata letta nel brevetto: **da verificare**.
4. **Autoassorbimento** (`selfAbsCorrect`, facoltativo, serve w): El Sherbini et al. 2005 (doi:10.1016/j.sab.2005.10.011, eq. 6, 8, 12) SA = (Δλ/Δλ₀)^{1/α}, α = −0,54, Ī = Ī₀·SA^β, β = 0,46, Δλ₀ = 2w n_e/10¹⁶; formula pratica (*Spectroscopy* 2022, doi:10.56530/spectroscopy.xq8876v9, eq. 6) I₀ ≈ I·(Δλ/Δλ₀)^0,85. Sono la stessa relazione (0,46/0,54 = 0,85; differiscono meno dell'1 %). Il segno di α è perso nel PDF (studio §3.3): α < 0 perché la riga autoassorbita è più larga. Nota: nel testo estratto di Aberkane 2020 le eq. 26–27 hanno gli esponenti scambiati, ma l'eq. 28 che le combina coincide. Le **righe di risonanza** (E_i = 0) sono segnalate; il pannello le esclude per impostazione predefinita.
5. **Grafico di Boltzmann** (brevetto eq. 5–6; Aberkane eq. 3): ln(Ī/(g_k A_ki)) = −E_k/(k_B T) + ln(F C_s/U_s(T)), con intensità in fotoni (conteggi); con spettro tarato in energia `intensity:'energy'` usa ln(Ī λ/(g_k A_ki)). Regressione **pesata congiunta**: una pendenza comune a tutte le specie (stessa T), un'intercetta per gruppo. σ_y² = (σ_I/I)² + (incertezza NIST di A_ki)², dove la classe NIST dà l'incertezza **massima** (AAA 0,3 %, … C 25 %, D 50 %), usata come σ. Covarianza scalata per χ²ᵣ se > 1.
   - modo **Saha–Boltzmann** (predefinito): le righe ioniche portate sulla scala neutra, y* = y − ln(2(2π m_e k_B T/h²)^{3/2}/n_e), x* = E_k + E_ion; una retta per elemento; iterazione su T;
   - modo **Boltzmann per specie**: una retta per specie; dove ci sono I e II, n_e dall'equilibrio di Saha (`neSaha`), da confrontare con Stark (verifica LTE consigliata da Cristoforetti 2010, §3.1).
6. **Saha–Eggert** (Aberkane eq. 1–2; brevetto eq. 1): n_e n_II/n_I = 2(U_II/U_I)(2π m_e k_B T/h²)^{3/2} e^{−E_ion/k_B T} (la forma del brevetto 6,0·10²¹·T_eV^{3/2} è verificata nei test). Solo il primo stadio di ionizzazione.
7. **Concentrazioni**: F C_s = U_s(T)·e^{q_s}; elemento = I + II (lo stadio mancante da Saha). **Chiusura** ΣC = 100 % (brevetto eq. 7–8), oppure **standard interno** di frazione in peso nota. Frazione atomica (molare) e in peso (masse IUPAC).
8. **McWhirter** (Cristoforetti et al. 2010, doi:10.1016/j.sab.2009.11.005, eq. 12): n_e > 1,6·10¹²·T^{1/2}·ΔE³, con ΔE il gap massimo fra livelli adiacenti delle specie analizzate (da `libs-data.js`). Condizione **necessaria e non sufficiente**: l'avviso lo dice sempre.
9. **Incertezze**: Monte Carlo (300 estrazioni, seme fisso) sui parametri della regressione con la loro covarianza e, se dichiarata, sull'incertezza di n_e. Sono **solo statistiche**: non comprendono gli errori di modello (LTE, autoassorbimento, risposta spettrale, dati atomici sistematici).

## Generatore di spettri sintetici (`synth`)
Plasma omogeneo in LTE (Saha per I e II, Boltzmann); profili Lorentziani di Stark (Δλ = 2w n_e/10¹⁶; per Hα e Hβ le FWHM di Gigosos 2003) convoluti con la Gaussiana strumentale; Doppler trascurato. Con una lunghezza ottica L trasporto in una lastra omogenea I(λ) = B(λ,T)(1 − e^{−τ}), τ = Σ κL, κ = λ⁴/(8πc)(g_k/g_i)A_ki N_i (1 − e^{−hc/λkT}) φ(λ). Rumore di Poisson con seme. **I coefficienti w del generatore sono una regola sintetica** (0,003 nm per I e 0,006 nm per II a 400 nm, ∝ λ²), non dati misurati. Con `ne:'lte'` n_e è coerente con la neutralità di carica a 1 atm.

## Validazione
Tabella prodotta da `LIBS_REPORT=1 node --test test/unit/libs-cf.test.js` (T = 10 000 K, n_e = 10¹⁷ cm⁻³, FWHM strumentale 0,05 nm, passo 0,01 nm, 200–900 nm, picco più alto 10⁶ conteggi, n_e misurata da Hα, modo Saha–Boltzmann). **Gli spettri sono generati con lo stesso modello che li analizza** (stessi dati atomici, stessa forma dei profili): la tabella dice che il programma è coerente, non che è accurato su plasmi veri.

| Prova | Vero | Trovato | Scarto |
|---|---|---|---|
| n_e da Hα, solo H | 3·10¹⁶ / 10¹⁷ | 2,998·10¹⁶ / 9,996·10¹⁶ | −0,1 % / 0,0 % |
| n_e da Hβ, solo H | 3·10¹⁶ / 10¹⁷ | 3,09·10¹⁶ / 1,04·10¹⁷ | +3,1 % / +4,3 % |
| n_e iterata (acciaio, 9000 K, n_e coerente a 1 atm) | 2,53·10¹⁷ | 2,52·10¹⁷ | −0,5 % |
| Bronzo: T; n_e (Hα) | 10 000 K; 10¹⁷ | 9949 ± 12 K; 9,33·10¹⁶ | −0,5 %; −6,7 % |
| Bronzo Cu / Sn / Zn / Pb (% peso) | 85 / 8 / 4 / 3 | 84,80 / 8,05 / 4,07 / 3,08 | −0,2 / +0,6 / +1,8 / +2,7 % |
| Acciaio: T; n_e | 10 000 K; 10¹⁷ | 9967 ± 16 K; 9,78·10¹⁶ | −0,3 %; −2,2 % |
| Acciaio Fe / Cr / Ni / Mn | 70 / 18 / 10 / 2 | 70,33 / 17,91 / 9,74 / 2,01 | +0,5 / −0,5 / −2,6 / +0,7 % |
| Vetro: T; n_e | 10 000 K; 10¹⁷ | 9968 ± 47 K; 9,77·10¹⁶ | −0,3 %; −2,3 % |
| Vetro O / Si / Na / Ca / K / Al | 45 / 33 / 10 / 7 / 3 / 2 | 47,14 / 32,23 / 8,99 / 6,71 / 2,93 / 2,00 | +4,8 / −2,3 / −10,1 / −4,2 / −2,2 / 0,0 % |
| Bronzo, autoassorbimento L = 0,1 cm (n_e nota): errore medio relativo | — | 57 % senza correzione → 12 % con la correzione dalla larghezza | Cu 73,4 → 85,3; Sn 16,0 → 6,6; Zn 4,8 → 4,4; Pb 5,9 → 3,7 |
| Acciaio, autoassorbimento L = 0,1 cm | — | 56 % → 16 % | Fe 59,5 → 69,6; Cr 18,3 → 16,6; Ni 17,5 → 11,0; Mn 4,7 → 2,9 |

La correzione dell'autoassorbimento migliora molto ma non annulla l'errore: la relazione di El Sherbini è approssimata e la larghezza misurata con una Voigt di una riga autoassorbita (profilo appiattito) non è esattamente quella del modello.

**Spettro reale pubblico.** SuperLIBS 10K (Mount Holyoke College; Lepore, Dyar, Ytsma 2023, doi:10.5281/zenodo.10287455, CC BY 4.0), pastiglia 0201H (roccia, composizione in ossidi), atmosfera terrestre, 3,2 mJ. Nei dati originali gli spettri sono già senza fondo e **normalizzati separatamente** nelle regioni UV, VIS e VIS-NIR, quindi F non è costante fra le regioni; risoluzione e ritardo non sono dichiarati nel file. Sulla regione VIS (370–479 nm, FWHM ipotizzata 0,08 nm, righe di risonanza escluse) il calcolo gira (T ≈ 9400 K, n_e iterata 3·10¹⁷ cm⁻³) ma dà **Mg 99,8 %** contro 2,6 % atteso fra i cationi: una riga di Mg ad alta E_k con un'intercetta estrapolata domina la chiusura. **Su questo spettro la CF-LIBS automatica non dà risultati utili.** Non è stato trovato nessuno spettro LIBS pubblico di leghe o vetri certificati, con licenza aperta e con risposta spettrale e ritardo dichiarati.

## Che cosa serve dagli spettri reali
- **Risposta spettrale** dello strumento (curva di efficienza con una lampada tarata, per esempio deuterio + alogena): senza, F non è costante e le concentrazioni fra righe lontane sono sbagliate. L'app oggi **non** la applica (`synth` ha l'opzione `response`, l'analisi no).
- **Larghezza strumentale** (FWHM Gaussiana, in nm, alle varie λ): da una lampada a bassa pressione o dal costruttore.
- **Ritardo (delay) e finestra (gate)** di acquisizione: l'LTE e l'omogeneità valgono solo in una finestra temporale; con spettrometri non risolti nel tempo (molti portatili) la CF-LIBS classica non è applicabile così (vedi Lellouche et al. 2024, doi:10.1016/j.sab.2024.106903, solo metadati).
- **Righe dell'idrogeno** (o una riga con w noto) per n_e; coefficienti Stark per la correzione dell'autoassorbimento.
- Spettri **senza normalizzazioni** per regione e con l'asse in lunghezza d'onda **in aria** (come la banca dati).

## Limiti e cose non fatte
- Validazione solo sintetica; nessun materiale certificato; nessun confronto con un altro programma CF-LIBS.
- Niente coefficienti Stark in banca dati; il pannello non permette di inserirli (né la correzione dell'autoassorbimento, né n_e da una riga non idrogenoide sono raggiungibili dall'interfaccia: solo dal modulo).
- Niente curva di risposta spettrale, niente OPC-LIBS (Cavalcanti 2013: formula dei fattori P(λ) non vista), niente grafico CD-SB né C-sigma, niente stadi III, niente abbassamento del potenziale di ionizzazione, niente Doppler.
- Le righe candidate sono solo quelle in banca dati (30 per specie): righe di elementi non scelti o non in banca dati sotto un profilo falsano l'area (scarto per larghezza solo grossolano).
- Iterazione su n_e con l'ipotesi di 1 atm (da verificare sul brevetto); coefficienti di Gigosos per Hα/Hβ verificati solo su fonti secondarie.
- Un elemento con una sola riga, o righe con E_k molto diversa dalle altre, può dominare la chiusura (vedi lo spettro reale).
