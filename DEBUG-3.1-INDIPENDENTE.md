# Debug indipendente della 3.1

*19 novembre 2026, ramo `claude/xrf-libs-3.1-debug` (partito da `claude/xrf-libs-3.1`, commit 793daa6). Secondo debug, fatto da una sessione che non aveva scritto il codice. Nessun merge su `desktop` o `main`, niente pubblicato.*

## In breve

- **Fisica XRF del modello 3.1: corretta** nei punti controllati riga per riga contro il codice di PyMca 5.9.7 (forma dell'ipermetro, fughe di Reed e Ware, tubo di Ebel, larghezza dei picchi). **Il modello 3.0 dà esattamente gli stessi numeri della 3.0.0** (16 spettri, modi «leghe» e «Compton», con e senza geometria dal Compton: differenza 0).
- **Trovati e corretti 26 difetti**, ognuno con un test. I più importanti:
  - il `.cfg` esportato per PyMca aveva la **calibrazione sbagliata**: in PyMca l'intervallo del fit e le righe cadevano nel posto sbagliato;
  - il paragrafo **«Metodi»** descriveva il modello 3.0 anche quando si usava il 3.1;
  - un file di testo con **molte righe vuote bloccava l'app per 30 s**;
  - i `.mca` in **formato SPEC/PyMca** venivano letti come una tabella senza senso;
  - un `.cfg` di 28 kB poteva occupare **4 GB di memoria**;
  - nella CF-LIBS un elemento scelto ma **senza righe spariva dal risultato** senza avviso.
- **Regole del progetto rispettate**:
  - «Palleschi» non compare da nessuna parte;
  - nessun nome del laboratorio che ha dato i dati;
  - nessuno spettro né certificato riservato nei file. Un test conteneva l'intestazione di un file reale (data, tempo vivo, punti di calibrazione): ora i valori sono inventati, ma restano nella storia di git (vedi «Decisioni»);
  - l'avviso MIT di PyMca è corretto.
- **Raccomandazione: la 3.1 si può pubblicare come candidata (rc)** dopo queste correzioni. Le tre decisioni chieste (dati NIST, pesi del fit, versione) sono state prese e applicate: vedi «Seguito».

## Bug trovati e corretti

Gravità: **alta** = risultati sbagliati senza avviso o app bloccata; **media** = risultato o testo sbagliato in casi realistici; **bassa** = casi limite o cosmetica. «Test» = il test che fallisce senza la correzione.

### XRF ed export

| Gravità | Problema | Causa | Correzione | Test |
|---|---|---|---|---|
| alta | Il `.cfg` esportato per PyMca aveva come «zero» la sola correzione del fit e come guadagno quello dell'esempio di PyMca (0,0174 keV/canale): in PyMca la Cu Kα cadeva 60 canali più in là e l'intervallo 1–38,8 keV diventava 1,1–44,6 keV | `fpExportCfg` passava `zero:F.off, gain:null` | `fpCfgCal`: calibrazione per canale del file, composta con l'allineamento e le correzioni del fit; vale anche quando il lettore toglie i primi canali vuoti (export ELIO con scostamento negativo) | `pymca-cfg.test.js` (debug 3.1), `xrf31-flussi-ui.test.js` |
| alta | Paragrafo «Metodi» (esportazioni, PDF) sempre del modello 3.0: Kramers, gaussiane, fughe del solo Si | testo fisso in `methodsText` | un paragrafo per modello, con file misti distinti; riferimenti Van Gysel 2003, Solé 2007 ed Ebel 2003 | `xrf31-flussi-ui.test.js` |
| media | Il `.cfg` esportato diceva «picchi somma spenti» quando nello spettro non ce n'erano, anche se erano attivi | si esportava l'esito (`F.pile`), non l'impostazione | si esporta l'impostazione | `xrf31-flussi-ui.test.js` |
| bassa | Valori finiti ma assurdi (1e308 cm d'aria, sensore di 1e-300 µm, peso dell'eccitazione 1e-310) davano NaN in tutte le concentrazioni | mancavano i limiti superiori in `fpSetup` | limiti (aria ≤ 10 m, finestre e sensore ≤ 10 cm, sensore ≥ 0,1 µm); i valori realistici non cambiano | `debug31-lettori.test.js` |
| bassa | Tensioni oltre 50 kV o angoli impossibili presi da un `.cfg` venivano sostituiti senza dirlo | — | avviso «valori fuori dai limiti dell'app, sostituiti» | `xrf31-flussi-ui.test.js` |
| bassa | `.cfg` salvato in UTF-16 (Blocco note): «manca l'intestazione» incomprensibile | `file.text()` decodifica solo UTF-8 | `decodeBuffer`, come per gli spettri | `xrf31-flussi-ui.test.js` |
| bassa | L'argon di un `.cfg` di PyMca entrava fra gli elementi del campione | — | filtrato, come nella proposta automatica | — |

### Lettori dei file

| Gravità | Problema | Causa | Correzione | Test |
|---|---|---|---|---|
| alta | Uno spettro seguito da 60 000 righe vuote (120 kB) bloccava l'apertura per 30 s; vale per **qualunque** file di testo | `/^\s*\[DATA\]\s*$/m`: con il flag `m`, `\s*` attraversa gli a capo (tempo quadratico) | `[ \t]*` | `debug31-lettori.test.js` |
| media | `.mca` in formato SPEC/PyMca (`#@CHANN`, `#@CALIB`, righe `@A … \`) letto come tabella a due colonne: un conteggio diventava la X e il successivo la Y, senza avviso | formato non riconosciuto | lettore SPEC: primo spettro, calibrazione `#@CALIB` (`0 1 0` = canali), primo canale da `#@CHANN` | `debug31-lettori.test.js` |
| media | Riga Amptek `<<` seguita da migliaia di spazi: oltre 20 s | regex `/^<<\s*(.+?)\s*>>$/` cubica | confronto senza regex | `debug31-lettori.test.js` |
| media | `.cfg` con molte chiavi in `[DEFAULT]` e `%(x)s` ripetuti: 28 kB → 4 GB di memoria, scheda bloccata | ogni chiave di `[DEFAULT]` copiata in ogni sezione, sostituzioni senza limite | tetto alle sostituzioni (20 volte il file, almeno 4 milioni di caratteri) con errore leggibile | `debug31-lettori.test.js` |
| bassa | Altre regex quadratiche: riga di cifre lunghissima (7 s), `%(` ripetuto (4 s), spazi interni lunghi in un valore `.cfg` (7,6 s), nomi di materiale | regex con backtracking | controllo sui primi 256 caratteri, nome della chiave limitato, `trimEnd` | `debug31-lettori.test.js` |
| bassa | 100 000 canali Amptek illeggibili: riempimento quadratico (4,6 s) | ricerca ripetuta in avanti | indice ricordato (stesso risultato) | `debug31-lettori.test.js` |

Su tutti i 174 file di `examples/` e `test/` il lettore dà, byte per byte, lo stesso risultato di prima.

### CF-LIBS (sperimentale)

| Gravità | Problema | Correzione | Test |
|---|---|---|---|
| media | Elemento scelto senza righe misurabili (Sb non ha righe nella banca dati): spariva dalla tabella e gli altri venivano riscalati a 100 %, con il solo avviso generico | avviso `noLines`; Sb non è più offerto nel pannello | `libs-cf.test.js`, `libs-cf-ui.test.js` |
| bassa | Un solo λ o g·A non valido con intensità in energia: «pendenza indeterminata», calcolo fallito | righe non valide escluse | `libs-cf.test.js` |
| bassa | n_e scritta «10^17» letta come 10 cm⁻³; valore vuoto o negativo: si passava in silenzio all'iterazione | lettura di 1e17, 10^17, 1,5·10^17; fuori 10¹³–10²¹ cm⁻³ c'è l'avviso `neInvalid` | — (pannello) |
| bassa | g·A delle righe di Balmer doppio (Hα 8,82·10⁷ invece di 4,41·10⁷ s⁻¹): lo script sommava le componenti fini **e** la riga totale del NIST | script corretto e dati dimezzati per Hα…H₁₂. Contava solo per gli spettri sintetici (H non si quantifica); i test usano H ambiente doppio, così gli spettri sono identici e la tabella di validazione non cambia | `libs-cf.test.js` |
| bassa | Un'asserzione dei test era finita dentro un commento | ripristinata | `libs-cf.test.js` |
| bassa | Con un solo elemento scelto il risultato è «100 %» senza spiegazione | avviso `oneElement` | — |
| bassa | Tabelle dei risultati tagliate sugli schermi stretti (390 px) | tabelle scorrevoli | `libs-cf-ui.test.js` |
| — | Il pannello non diceva «provato solo su spettri sintetici» | aggiunto, in italiano e in inglese | `libs-cf-ui.test.js` |
| — | docs/CF-LIBS.md riportava per lo spettro reale SuperLIBS «Mg 99,8 %», ma il codice attuale dà Fe 52 % e T ≈ 17 600 K | testo aggiornato: la conclusione (nessun risultato utile) non cambia | — |

### Interfaccia e lingue

| Gravità | Problema | Correzione | Test |
|---|---|---|---|
| media | In inglese le note fatte di elenchi erano tradotte solo per la prima voce: «Sb (analytical line…), I (riga analitica non significativa…)», «Pb … : Sn. goes into the calculation» | il traduttore non accetta più un modello che «inghiotte» le sue ripetizioni, così l'elenco si traduce voce per voce; la nota degli elementi tolti è composta per lingua | `debug31-i18n.test.js` |
| media | Sul desktop in inglese le note con «△» (al posto di ⚠️) restavano in italiano | il punto finale ora fa parte del modello anche dopo un simbolo | `debug31-i18n.test.js` |
| media | Toast dell'export `.cfg` in inglese: «Esportato … vedi le note nel files» | testo per lingua | — |
| bassa | Apertura di un progetto 3.0 con più spettri: «gli 2 spettri XRF restano» (e mezzo italiano in inglese) | «i 2 spettri», testo per lingua | — |
| bassa | Selettore del modello XRF più largo del riquadro sui telefoni | `max-width:100%` | — |
| bassa | «Hα 656,28 nm» con la virgola in inglese | separatore della lingua | — |

### Errori miei durante il debug, trovati e corretti prima del push

Tre volte un commento aggiunto in coda a una riga ha disattivato il codice che seguiva sulla stessa riga:
- l'angolo d'uscita del tubo in `fpSetup`: lo ha visto il confronto con la 3.0.0;
- l'elenco degli elementi nel pannello CF-LIBS: lo ha visto il test nel browser;
- il `catch` del pulsante di export: lo ha visto l'analizzatore sintattico.

Per una decina di minuti, inoltre, un `git stash` ha riportato l'albero di lavoro alla versione precedente mentre giravano i test. Dopo ogni caso ho ripetuto i controlli: il confronto con la 3.0.0, gli unitari, i test nel browser e un controllo di tutte le righe aggiunte con un commento in coda.

## Verificato senza trovare problemi

- **Ipermetro** (`xrfHyperAt`): stesse formule di `SpecfitFuns.c` di PyMca, cioè gaussiana di area A, code `A·r/β·½·erfc(z/(σ√2) + σ/(β√2))·exp(z/β + σ²/2β²)` e gradino `h·A/(σ√2π)·½·erfc(z/(σ√2))`. Code in keV come in PyMca; code e gradino tolti dai picchi di fuga come in `ClassMcaTheory`.
- **Fughe**: formula di Reed e Ware come `Elements.getEscape`. Scelta voluta, diversa da PyMca: l'area di una riga comprende i fotoni finiti nella fuga, e il picco principale è ridotto di (1 − Σ fughe). È coerente con l'efficienza del rivelatore del modello FP, e l'«area gaussiana» confrontata con PyMca esclude le fughe.
- **Tubo di Ebel**: continuo, ρz, η, m, x, f(χ), righe K (6·10¹³, z_K = 2, b_K = 0,35, R, 1/S) identici a `XRayTubeEbel.py`, anche per il tubo a trasmissione. In più il limite allo spessore dell'anodo, che PyMca non ha.
- **FWHM** = √(Noise² + 2,3548²·0,00385·Fano·E) come PyMca. **Angolo di diffusione** = ψ₁ + ψ₂ (corretto per tubo e rivelatore dai due lati della normale), Compton con Klein–Nishina.
- **Levenberg–Marquardt con limiti** e **picchi somma**: indici e scala dell'autoconvoluzione corretti; gli indici negativi non sono raggiungibili, perché il fit parte da almeno 1 keV.
- **Fluorescenza terziaria**: la chiave della memoria arrotondata a 2 cifre non impedisce la convergenza (60 acciai Fe–Cr–Ni–Mn: sempre convergenti, scarto massimo 0,006 %).
- **Fisica 3.0 contro 3.1**: con il modello 3.0 la differenza dalla 3.0.0 è 0 (sopra). Le differenze del 3.1 sono quelle dichiarate (tubo di Ebel su spettri costruiti con Kramers). `fpCfg` e `fpProjectCompat` portano al 3.0 i progetti e le impostazioni salvati prima della 3.1.
- **CF-LIBS**:
  - costanti: Saha 2(2πm_e kT/h²)^{3/2} = 4,829·10¹⁵·T^{3/2} cm⁻³ (errore 1,6·10⁻⁸), k_B in eV/K;
  - formule: ordinata di Boltzmann ln(I/gA) per i conteggi e ln(Iλ/gA) in energia, ascissa Saha–Boltzmann E_k + E_ion;
  - larghezze: Olivero entro lo 0,02 % dalla Voigt numerica; McWhirter con ΔE in eV; coefficienti di Hα e Hβ come documentati;
  - funzioni di partizione ricalcolate in modo indipendente dai livelli NIST (Fe I, Cu I, Ca II, Sn I, Mn I, 5000–15 000 K): entro 10⁻⁵;
  - modello diretto indipendente in Python, con costanti proprie: il calcolo ritrova T entro 0,01 K e le concentrazioni entro 0,001 %. Nessun errore si compensa fra generatore e analisi.
- **Lettori**: `__proto__`, `constructor` e `prototype` in sezioni annidate, chiavi, materiali e progetti sono innocui. Altre regex lineari. 40 000 `.cfg` mutati o troncati senza eccezioni. Andata e ritorno `.cfg` esatta sui 4 file d'esempio. CRLF, CR, BOM, UTF-16, virgola decimale, `.spt` LIDAQ e «Calibration3: 0 0» di ELIO a posto.
- **Prima riga dei `.mca` a una colonna** (segnalata in CONCLUSIONE come scartata): **non si riproduce**. Provati 256–2048 righe, LF/CRLF/CR, BOM, notazioni diverse: il primo valore è il canale 0. Sotto 256 righe il file non è preso per XRF. Il lettore toglie invece i canali iniziali a zero e quelli a energia negativa: l'asse resta giusto.
- **Interfaccia** (Playwright: web e desktop simulato, italiano e inglese, 1400, 768 e 390 px):
  - XRF: modello 3.1 predefinito; anodo, kV e angoli; elementi aggiunti e tolti; elementi non confermati elencati;
  - file: tutti gli spettri di `examples/` e dei collaudi si aprono;
  - `.cfg`: import di XRFSpectrum, Steel, McaTheory e del proprio export; export CSV;
  - progetti salvati e riaperti con gli stessi numeri e lo stesso modello in tutte e quattro le combinazioni; progetto della 3.0 col modello 3.0, i numeri della 3.0 e l'avviso;
  - CF-LIBS segnata «(sperimentale)» o «(experimental)» e visibile a tutte le larghezze;
  - Raman: su 30 spettri sintetici IModPoly è sostituito da SNIP solo dove sottrae troppo, e «Applica SNIP» funziona;
  - nessun errore nella console.
- **Regole**:
  - `git grep -i palleschi`: nessun risultato;
  - nessun nome del laboratorio né del gruppo. Restano solo citazioni bibliografiche «primo autore et al., anno, doi», come stabilito nel commit 7ec09e7;
  - in `validazione/` ci sono solo il NIST SRM 1155 pubblico e i criteri;
  - `docs/VALIDAZIONE-DATI-REALI.md` ha solo errori aggregati;
  - `THIRD-PARTY-NOTICES.md` riporta il testo MIT di PyMca identico a `LICENSE.MIT` di PyMca 5.9.7, l'elenco delle funzioni portate e la nota su XMI-MSIM (solo costanti).
- **Suite locali** (ultima esecuzione dopo le correzioni): test unitari 380 su 386 (6 saltati come prima), validazione numerica 77/77, benchmark 36/36, `check-version` a posto, dizionario rigenerato senza differenze. Collaudo dell'interfaccia passato per intero (italiano e inglese, web e desktop simulato). Validazione nell'interfaccia: 212 prove su 213. L'unica fallita è I9, la prova dei tempi della chemometria, codice non toccato qui: con la macchina carica ha avuto un tentativo da 1,9 s; rilanciata da sola passa (3/3), come già annotato in CONCLUSIONE. Tutte con `PW_EXECUTABLE=/opt/pw-browsers/chromium`.

## Prestazioni

| Canali (bronzo sintetico) | nucleo in node, 3.1 con verifica degli elementi, 8 elementi proposti | pagina web, pannello aperto (blocco più lungo) | modello 3.0 in node |
|---|---|---|---|
| 2048 | 2,1 s | 0,65 s | 0,29 s |
| 4096 | 2,9 s | 0,80 s | 0,39 s |
| 8192 | 4,6 s | 1,64 s | 0,42 s |
| 16 384 | 8,7 s | — | 0,74 s |

Nella versione web il calcolo gira nella pagina: per quei tempi la pagina è ferma. Nel nucleo i tempi sono più lunghi perché la prova parte da 8 elementi da verificare, mentre nella pagina la proposta automatica è più corta. Sul desktop vero il calcolo gira nel processo separato (non misurato qui: il desktop simulato non ha il processo). La CF-LIBS impiega 0,1–0,2 s.

## Problemi trovati e non corretti (con il perché)

- **Pesi del fit con pochi conteggi per canale (media).** Lo stesso bronzo sintetico diviso in più canali dà Sn più basso: 8,3 % con 2048 canali, 7,5 % con 4096, 6,9 % con 8192 (media di 4 semi; il vero è 8,0 %, picco dello Sn di circa 300 conteggi). Succede con entrambi i modelli. La causa sono i pesi 1/√y (χ² di Neyman), distorti quando i conteggi per canale sono pochi. **PyMca usa gli stessi pesi.** Cambiarli cambia tutti i numeri, quindi è una decisione da prendere con i materiali certificati.
- **Avvisi dell'import `.cfg` in italiano anche in inglese** (circa 25 frasi di `app/pymca-cfg-core.js`): servono un codice e un testo inglese per ogni avviso, come in `libs-cf-ui.js`. Lavoro di traduzione, non un errore di calcolo.
- **CF-LIBS**: limiti elencati in docs/CF-LIBS.md («Limiti trovati dal debug indipendente»):
  - righe a 0,3–0,5 nm assorbite dal fondo; la correzione provata non migliora le concentrazioni e rallenta fino a 8 volte;
  - soglie dei multipletti con una larghezza Lorentziana fissa;
  - Monte Carlo di n_e in modo Saha–Boltzmann;
  - criterio S/N.
- **Il pannello CF-LIBS preseleziona solo gli elementi trovati dall'identificazione** (spesso uno solo). Ora c'è l'avviso; proporre tutti gli elementi con righe è una scelta di interfaccia.
- **Testi vecchi non tradotti** (non della 3.1): «1 di 30 · file.csv» durante il caricamento, «elementi: Sn, Sb, I» nel riassunto delle ipotesi.
- **Avvio dei test dell'interfaccia in questo ambiente**: Playwright 1.64.1 cerca Chromium 1248, ma qui c'è il 1243. Serve `PW_EXECUTABLE=/opt/pw-browsers/chromium`; in CI non serve (lì si installa).

## Decisioni per Lorenzo prima della versione definitiva

1. **Dati NIST ASD** in `app/libs-data.js`: serve il permesso del NIST, oppure si distribuisce solo lo script (punto già aperto in CONCLUSIONE). Il file dei dati è stato corretto a mano per le righe di Balmer; con la cache del NIST va rigenerato con `scripts/gen-libs-data.py` (lo script è già corretto).
2. **Pesi del fit** (sopra): lasciarli come PyMca o passare a pesi dal modello o dallo spettro lisciato, verificandoli sui bronzi certificati.
3. **Numero di versione**: `package.json` e `APP_VERSION_FULL` dicono ancora 3.0.0, quindi PDF e progetti scrivono «3.0.0». Al passaggio alla 3.1 il contrassegno `xrfModel` mantiene comunque giusta la compatibilità dei progetti.
4. **Storia di git**: il commit 58821fd contiene, in un test, l'intestazione di un export reale: data e ora della misura, tempo vivo e due punti di calibrazione. Nessuno spettro né certificato. Ora i valori sono inventati. Per toglierli anche dalla storia basta unire il ramo con uno «squash» invece di riscrivere la storia condivisa.
5. **Citazioni nella CF-LIBS**: restano citazioni bibliografiche brevi (Ciucci et al. 1999, Cristoforetti et al. 2010, Tognoni et al. nello studio) e link a copie su iris.cnr.it in `docs/studi/XRF-PYMCA-CFLIBS.md`. Rispettano la regola come applicata nel commit 7ec09e7. Se la regola va letta in modo più stretto, sono da togliere anche quelle.

## Seguito: decisioni di Lorenzo applicate (stesso ramo)

1. **Dati NIST non più distribuiti.**
   - `app/libs-data.js` è tolto dal repository e dal pacchetto.
   - Il pannello CF-LIBS, senza dati, spiega che cosa sono (fonte e DOI), perché non sono inclusi e che servono una volta sola. Offre «Scarica i dati atomici dal NIST» e, in alternativa, «Carica un file di dati…».
   - `app/libs-nist.js` fa al NIST le stesse 128 richieste di `scripts/gen-libs-data.py`, con le stesse scelte. Su un campione sintetico nel formato del NIST il risultato è identico a quello dello script, e le query coincidono byte per byte. I dati vengono salvati nell'archivio dell'app: la cartella dati sul desktop, la memoria del browser online. Dopo funziona senza rete (provato riaprendo la pagina con la rete bloccata).
   - Sul desktop la richiesta parte dal comando nativo `nist_get` (`src-tauri/src/nist.rs`): solo `https://physics.nist.gov/cgi-bin/ASD/`, solo i tre moduli, query controllata, niente reindirizzamenti, 2 minuti e 32 MB al massimo. Nessun crate nuovo (stesse versioni di reqwest e rustls dell'aggiornamento automatico). `cargo check` e `cargo test` passano; una prova manuale con la rete scarica davvero dal NIST.
   - **Limite della versione online**: il sito del NIST non manda l'intestazione CORS, quindi il browser blocca lo scaricamento da una pagina web. Il pannello lo spiega e propone l'app desktop o il caricamento di un file preparato con lo script. Gestiti anche: rete assente, risposta inattesa, spazio esaurito, file non valido.
   - Test: con un campione SINTETICO (valori inventati) in node e nel browser, con le risposte del NIST simulate: scaricamento, CORS, errore del server, assenza di rete, uso senza rete dopo. I test scientifici della CF-LIBS usano i dati preparati dallo script: la CI li scarica dal NIST in una cache che non entra nei pacchetti.
2. **Pesi del fit.** Confronto, sempre col modello 3.1 (Sn vero 8,0 %):

   | Pesi | Sn sintetico a 2048 / 4096 / 8192 canali (media di 4 semi) | χ²ᵣ sintetico | Bronzi certificati: errore medio / mediana | Sn (bias) sui bronzi | Acciaio NIST di PyMca |
   |---|---|---|---|---|---|
   | 1/√y (Neyman, come PyMca) | 8,30 / 7,53 / 6,86 % | 1,13 / 1,05 / 0,83 | 9,3 % / 8,7 % | +8,4 % | χ²ᵣ 8,2 |
   | **spettro lisciato (ora predefinito del 3.1)** | **8,05 / 8,20 / 8,46 %** | 0,99 / 1,00 / 0,96 | **9,2 %** / 9,2 % | +7,9 % | χ²ᵣ 7,9, concentrazioni uguali entro 0,02 punti |
   | modello, Pearson iterato (scartato) | 7,99 / 8,15 / 8,48 % | 0,99 / 1,00 / 0,99 | 12,1 % / 10,0 % | +18,3 % | — |

   - I pesi lisciati tolgono la deriva con pochi conteggi e non peggiorano il resto, quindi sono predefiniti nel 3.1. Restano disponibili nel pannello «pesi del fit come PyMca».
   - Il modello 3.0 resta Neyman: con il 3.0 la differenza dalla 3.0.0 è ancora 0 sui 16 spettri.
   - Il modello 3.0 (Neyman) sul sintetico dà 7,86 / 7,16 / 6,57 %.
   - Tutti i numeri dei bronzi certificati sono aggregati; i dati restano nel repository privato.
3. **Versione 3.1.0-rc.1**:
   - aggiornata in `package.json`, `tauri.conf.json`, `Cargo.toml` e `Cargo.lock` (app e `acch-core`) e in `APP_VERSION_FULL`;
   - sezione «## 3.1.0-rc.1» nel CHANGELOG e voce 3.1 nelle Novità;
   - è una pre-release: la pipeline la pubblica come pre-release per i tag con «-», e l'aggiornamento automatico legge `releases/latest`, che esclude le pre-release.
4. Storia di git non riscritta (lo squash lo fa Jarvis). 5. Citazioni bibliografiche brevi lasciate.

## Raccomandazione

**La 3.1.0-rc.1 si può pubblicare come pre-release** una volta verde la CI. La fisica del 3.1 è corretta, la 3.0 è riprodotta esattamente, i difetti trovati sono corretti con i loro test, i dati del NIST non sono più distribuiti e i pesi del fit sono giusti anche con pochi conteggi. Per la versione definitiva restano:
- la risposta del NIST, per eventualmente includere i dati;
- gli altri materiali certificati, per confermare tubo di Ebel e pesi su strumenti diversi;
- i punti aperti elencati sopra: avvisi del `.cfg` in inglese e limiti della CF-LIBS.

La CF-LIBS resta correttamente segnata come sperimentale.
