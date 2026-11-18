# Conclusione di Acchiappaspettri 3.0: rapporto

Branch `claude/acch-conclusione`, **candidata rc.6** (non pubblicata: nessun merge su `main` o `desktop`, nessuna release, nessun tag). Data: 18 novembre 2026.

Base di partenza: `desktop` = 3.0.0-rc.5 (77bc847). Su indicazione del coordinatore, a metà lavoro sono stati uniti `wip/integra-3.0` (1500d3a: rc.5 con I5 motore del desktop, I7 picchi e ZIP in Rust, I9 cinetiche e MCR-ALS, I11 estensioni) e `wip/i6-grafico-webgl` (c944acd: grafico WebGL, finestre «Stacca» e «Confronto»). Non toccati `wip/i10-mappe` e `wip/i12-ricetta-python`.

Indice: 1. Funzioni nuove · 2. Validazione del fondo · 3. Bug corretti · 4. Test e build · 5. Decisioni per Lorenzo · 6. Funzionalità (per una presentazione)

## 1. Funzioni nuove e come si usano

### 1.1 Picchi aggiunti per posizione
Scheda **Picchi** → riquadro **Aggiungi picchi per posizione**.
- Si scrivono una o più posizioni **nell'unità dell'asse** dello spettro (cm⁻¹ per il Raman, nm, eV, keV, 2θ, minuti…): `1086; 712; 282`, oppure una per riga, oppure separate da virgola e spazio (`1086, 712`). La virgola senza spazio è il decimale (`1086,5`); più virgole senza spazi sono un elenco (`1086,712,280`).
- Facoltativi: **larghezza** FWHM e **forma** (gaussiana, lorentziana, pseudo-Voigt) per tutti i picchi del riquadro, oppure accanto a una posizione: `1500 w=10 lor`, `2400 gauss`.
- **Aggancio facoltativo** («Aggancia al massimo locale più vicino entro …»): il picco va sul massimo vero più vicino entro la tolleranza (proposta dal programma: mezza larghezza tipica dei picchi, al più l'1 % dell'asse); se lì non c'è un massimo vero (prominenza oltre 6 volte il rumore) resta dove è stato scritto, e il programma lo dice.
- Sotto il riquadro un'**anteprima** dice come è stato capito il testo prima di premere **+ Aggiungi** (o Ctrl+Invio): posizioni, larghezze, forme, valori fuori dallo spettro, parole non capite. Un numero ambiguo come `1,086` si accetta solo se una delle due letture (1086 o 1,086) cade nello spettro.
- I doppioni (un picco già presente nello stesso punto) e le posizioni fuori dallo spettro sono segnalati; un picco automatico tolto in precedenza torna se lo si riscrive.
- **Modifica**: ✎ nella riga della tabella apre posizione, FWHM e forma (Invio salva, Esc annulla); un picco automatico modificato diventa un picco aggiunto a mano. **Eliminazione**: ×, Maiusc+clic o Canc. **Annulla**: Ctrl+Z o ↶, anche per un inserimento multiplo (un passo solo).
- I picchi scritti valgono **come quelli automatici** per i nomi proposti, le aree, la deconvoluzione (larghezza e forma fanno da valori di partenza del fit) e la quantificazione.
- Si salvano nel **progetto** (`memory.added` e `memory.an.pkm`), seguono un cambio di scala o spostamento dell'asse X e nel **CSV dei picchi** la colonna Nota dice «aggiunto per posizione (scritto …); FWHM …; forma».

### 1.2 Rimozione del fondo (linea di base)
Scheda **Ritocca lo spettro** → riquadro **Rimozione del fondo**, subito dopo la scelta del metodo. Il pannello è nell'ordine della catena di elaborazione (raggi cosmici → smoothing → **fondo** → derivata, scale) e il riquadro lo scrive: il fondo si toglie **prima** della ricerca dei picchi, delle aree, della deconvoluzione e della quantificazione.
- **Metodi**: arPLS (Baek 2015), **ALS** (Eilers & Boelens 2005), **polinomio iterativo** IModPoly (Zhao 2007) e ModPoly (Lieber & Mahadevan-Jansen 2003), **SNIP** (Ryan 1988, ora anche per il Raman), **rolling ball** (Kneen & Annegarn 1996), inviluppo convesso, retta, **punti di ancoraggio**. Su DSC ed EPR solo retta e ancoraggi (i metodi automatici suppongono picchi in su); su TGA nessun fondo.
- **Parametri** con cursori e anteprima dal vivo: rigidità λ e asimmetria p (ALS, arPLS), grado del polinomio, semiampiezza della finestra e lisciatura preliminare (SNIP), raggio e media mobile (rolling ball), più le opzioni avanzate (iterazioni, tolleranze). Partono da **valori consigliati** calcolati sullo spettro (per il Raman: λ di ALS = 10⁵·(n/1000)⁴ e p = 0,05; polinomio di grado 6; finestre di SNIP e rolling ball dalla larghezza tipica dei picchi misurata su uno spettro prima appiattito); «Valori consigliati» li riporta indietro. Le larghezze sono in punti con l'equivalente nell'unità dell'asse.
- **Anteprima**: «Mostra sul grafico…» disegna lo spettro prima della correzione (grigio) e il fondo stimato (arancione tratteggiato) sopra il risultato, online e nel grafico WebGL del desktop; non va mai nelle esportazioni.
- **Punti di ancoraggio** in alternativa: «Scegli i punti sul grafico» e clic dove c'è solo fondo (un clic vicino a un punto lo toglie, Esc per finire), oppure le posizioni scritte. Il fondo passa per la media dello spettro attorno a ogni punto, con un'interpolazione monotona PCHIP (niente oscillazioni) o con rette; fuori dai punti resta costante.
- **Ambito**: «Vale per» tutti gli spettri della tecnica, oppure solo questo spettro; **«Applica a tutti gli spettri caricati»** dà a ognuno lo stesso metodo e gli stessi parametri (le tecniche per cui il metodo non è adatto restano com'erano, con l'elenco).
- **Reversibile**: «↶ Annulla» (fino a 40 passi), «Ripristina l'originale». Il file originale non cambia mai: il fondo è un passo della catena di elaborazione.
- **Salvato nel progetto** (metodo e parametri per spettro e per tecnica); **tracciabilità** e **bozza dei metodi** riportano il metodo con i parametri davvero usati e la bibliografia; i dati elaborati esportati sono quelli corretti.
- **Prestazioni**: tutti i metodi sono O(n) o O(n·grado) (SNIP O(n·finestra), a blocchi oltre 3·10⁸ operazioni); 100 000 punti in 10–350 ms, un milione in 0,1–1,2 s. Nel desktop, con spettri da 200 000 punti in su, il calcolo va al worker del motore (I5) e la finestra non si blocca.
- **Rust**: valutato e non usato. Gli algoritmi sono lineari e veloci in JavaScript; il worker toglie già il lavoro alla finestra; una seconda implementazione in Rust andrebbe tenuta identica bit per bit (regola di I5/I7) senza un guadagno misurabile per l'utente.

### 1.3 Altre correzioni fatte lungo la strada
Vedi la sezione 3 (bug corretti).

## 2. Validazione degli algoritmi di fondo

Test: `test/unit/fondo.test.js` (11 prove), `test/validation/fondo-sintetici.test.js` (3 prove con soglie), sezione **R12** di `docs/VALIDAZIONE.md` (rigenerata da `scripts/gen-validazione.js`).

**Dati**: spettri Raman **sintetici** con verità nota (`test/fixtures/raman-sintetici.js`, generatore deterministico): 1500 punti tra 200 e 3200 cm⁻¹, da 4 a 9 picchi lorentziani, gaussiani o misti con FWHM da 6 a 36 cm⁻¹, sopra un fondo di fluorescenza alto da 2 a 8 volte il picco più alto (gobba gaussiana larga, polinomio di 3° grado o decadimento esponenziale), più rumore gaussiano. **Parametri: quelli consigliati dal programma**, senza ritocchi. Errore = fondo stimato − fondo vero, in % del picco più alto.

**Rumore 1 % del picco più alto, 100 spettri**

| Metodo | Errore RMS mediano | RMS 95° percentile | Errore massimo mediano | Picchi veri ritrovati | Picchi falsi per spettro | Tempo per spettro |
|---|---|---|---|---|---|---|
| IModPoly | **0,56 %** | 1,50 % | 1,21 % | 98,1 % | 0,03 | 1,2 ms |
| arPLS | **0,65 %** | 3,10 % | 2,01 % | 98,1 % | 0,00 | 1,5 ms |
| ModPoly | 1,03 % | 2,24 % | 3,05 % | 98,1 % | 0,11 | 0,5 ms |
| SNIP | 1,16 % | 4,29 % | 3,12 % | 98,1 % | 0,01 | 0,5 ms |
| ALS | 1,53 % | 2,30 % | 5,08 % | 98,1 % | 0,09 | 0,4 ms |
| rolling ball | 3,18 % | 5,55 % | 17,82 % | 97,9 % | 0,28 | 0,1 ms |

**Altri livelli di rumore (40 spettri ciascuno), errore RMS mediano / 95° percentile**

| Metodo | rumore 0,05 % | rumore 0,2 % | rumore 3 % |
|---|---|---|---|
| IModPoly | 0,30 / 2,39 % | 0,44 / 4,14 % | 0,85 / 3,59 % |
| ALS | 1,46 / 2,63 % | 1,58 / 2,38 % | 2,89 / 3,38 % |
| ModPoly | 1,03 / 3,09 % | 0,95 / 5,82 % | 3,10 / 4,94 % |
| SNIP | 1,39 / 7,67 % | 1,24 / 9,50 % | 1,79 / 7,05 % |
| rolling ball | 3,33 / 5,38 % | 3,31 / 6,58 % | 3,53 / 6,21 % |
| arPLS (rigidità automatica storica) | **67 / 190 %** | **9,6 / 281 %** | 0,84 / 1,43 % |

Lettura:
- Con i valori consigliati, **IModPoly** è il più accurato a tutti i livelli di rumore (errore mediano 0,3–0,9 % del picco più alto), **ALS** il più stabile (95° percentile sempre sotto il 3,4 %).
- **arPLS** (la base automatica già presente nella 2.x e nella rc.5) va bene con rumore dall'1 % in su, ma **sugli spettri molto puliti con fluorescenza ripida resta sotto la fluorescenza** (errore mediano 9,6 % con rumore 0,2 %, 67 % con rumore 0,05 %). Causa: la rigidità fissa (λ = (n/(2π·8))⁴) non segue la curvatura del fondo e, con rumore piccolo, i pesi asimmetrici escludono progressivamente il fondo stesso. Con un λ più basso (rigidità per 24–32 «onde») l'errore torna sotto l'1 %. **Non l'ho cambiato** perché altererebbe i risultati dei progetti salvati: è una decisione per Lorenzo (sezione 5). Intanto il riquadro consiglia IModPoly per il Raman e invita a controllare arPLS con l'anteprima; il test `LIMITE NOTO` registra il comportamento.
- **Rolling ball** non toglie le bande più larghe del raggio (code lorentziane) e taglia le curve strette del fondo: è un'alternativa semplice, non il metodo consigliato.
- Con tutti i metodi la ricerca automatica ritrova il 97–99 % dei picchi veri visibili dopo la correzione.
- Casi particolari provati: retta e polinomio senza rumore recuperati esattamente; trasmittanza (%T) con il fondo sul bordo superiore; asse decrescente; spettri corti, costanti, parametri NaN; parametri ostili da un progetto (scartati); 200 000 punti in meno di 0,4 s per metodo; 2 milioni di punti (ALS) in circa 1 s; SNIP con un milione di punti e finestra larga da 29 s a 1,2 s dopo la correzione.
- **Spettri Raman reali**: in `examples/` non ce ne sono e le banche dati pubbliche (RRUFF) non erano raggiungibili da questo ambiente: **la prova su spettri reali resta da fare** (sezione 5).

## 3. Bug corretti

Gravità: **alta** = risultati sbagliati o app inutilizzabile in un caso comune; **media** = risultato sbagliato in un caso particolare, rischio di sicurezza reale o funzione inservibile in un caso; **bassa** = fastidio, testo, difesa in profondità. Ogni correzione ha un test che fallisce sul codice di prima (verificato rimettendo il file vecchio), tranne dove è indicato. «Origine» dice se il difetto c'era già nella rc.5, nei rami uniti o nelle funzioni nuove di questa sessione (trovato prima della consegna).

| # | Gravità | Origine | Difetto | Causa | Correzione | Test |
|---|---|---|---|---|---|---|
| 1 | alta | rc.5 | Spettri lunghi lentissimi: 100 000 punti Raman con fluorescenza = 35 s di caricamento, un milione mai finito; il cursore del fondo bloccato per secondi | `peakCandidates` scorreva da ogni massimo fino al primo punto più alto: O(n²) con rumore sopra una gobba | Già corretta nel ramo unito I5/I7 (pile monotone, O(n), uguale bit per bit, anche in Rust); verificato sull'insieme: 100 000 punti caricati in 1,7–1,9 s | prove di tempi I5 (`test:validation:tempi`) e misura riportata qui |
| 2 | media | rc.5 | Un progetto `.acchspettri` ostile di 3 MB portava la pagina a 7 GB di memoria e la bloccava 113 s (un PC con poca memoria può andare in crash) | I limiti si basavano sulle dimensioni scritte nello ZIP e la decompressione avveniva per intero prima del controllo; `manifest.json` senza limite | Byte contati durante la decompressione (`internalStream`): si ferma oltre la dimensione dichiarata nel manifest, oltre 1 GB in tutto o oltre 500:1 per voci sopra 64 MB; `manifest.json` al più 16 MB. Ora rifiutato in 87 ms | `test/unit/bomba-zip.test.js` |
| 3 | media | I4 (rc.4) | CSV injection: `concentrazioni_da_libreria.csv` e la carta di controllo scrivevano un nome di file come `=1+2.csv` o un titolo `@SUM(…)` come formula di Excel | Funzione `cell` locale senza la neutralizzazione che `csvCell` applica agli altri CSV | `csvCell` della pagina | `test/validation/sicurezza-csv-ui.test.js` |
| 4 | bassa-media | rc.4 | CSV injection nel CSV del fisisorbimento e del chemisorbimento (`+1+HYPERLINK(…)` da un file AIF) | Regola propria che lasciava passare `+1…` e `-1…` | `csvCell` della pagina | `sicurezza-csv-ui.test.js` |
| 5 | bassa | rc.5 (desktop) | `read_file` concedeva la scrittura di un `.acchspettri` anche quando la lettura falliva (un percorso inesistente diventava scrivibile) | Permesso registrato prima di `fs::read` | Permesso solo dopo una lettura riuscita | revisione del codice; prova dell'agente su una copia della crate (il comando richiede lo stato di Tauri) |
| 6 | bassa | rc.5 (desktop) | `write_into` creava cartelle fuori dalla cartella d'esportazione concessa attraverso un collegamento simbolico (la scrittura poi era rifiutata) | `create_dir_all` prima del controllo `canonicalize` | Controllo della parte esistente del percorso prima di creare le sottocartelle | `cargo test`: `write_into_non_crea_cartelle_fuori` |
| 7 | media | rc.5 | arPLS automatico sugli spettri molto puliti resta sotto la fluorescenza (errore del fondo 10–67 %) | Rigidità fissa troppo alta quando il rumore è basso | **Non corretto** (cambierebbe i progetti salvati): documentato, consiglio IModPoly nel riquadro, decisione per Lorenzo | `fondo-sintetici.test.js` («LIMITE NOTO») |
| 8 | media | rc.5 | Bozza dei metodi e tracciabilità in inglese con l'elaborazione del singolo spettro scritta in italiano | `procNote` solo in italiano | `procNote(f, P, en)` bilingue | `fondo-picchi-ui.test.js` (inglese) |
| 9 | bassa | rc.5 | A 375 px il pulsante Impostazioni era vuoto (online) | `font-size:0` nascondeva anche l'icona, che è testo | Icona come `::before` | `debug-conclusione-ui.test.js` |
| 10 | bassa | rc.4 | Un `.acchlib` trascinato o scelto con gli spettri veniva scartato come «formato non riconosciuto» | `addEntries` non conosceva le librerie | Importato nella libreria, con un messaggio | `debug-conclusione-ui.test.js` |
| 11 | bassa | rc.5 | «⚠️ 1 file del progetto non sono stati riconosciuti» | Plurale fisso | Singolare | prova manuale (`app/project.js`, testo) |
| 12 | bassa | rc.5 | Barra di stato del desktop: la catena di elaborazione ignorava il fondo scelto per il singolo spettro | Leggeva solo l'impostazione della tecnica | Usa `pBase(f)` | prova manuale |
| 13 | media | unione I6 | La finestra «Stacca» non aveva il modulo del fondo: con un fondo nuovo le viste staccate fallivano | `vista.html` elenca i moduli del nucleo a mano | Aggiunto `app/baseline-core.js` | `i6-finestre-ui.test.js` (già esistente, falliva dopo l'unione) |
| 14 | media | funzione nuova | SNIP su un milione di punti con finestra larga: 29 s | Costo n × finestra | Medie a blocchi oltre 3·10⁸ operazioni: 1,2 s | `fondo.test.js` |
| 15 | media | funzione nuova | Senza correzione del fondo, «1500» scritto in un Raman con fluorescenza si agganciava alla cima della gobba (tolleranza consigliata ≈ 330 cm⁻¹) e risultava «già presente» | Larghezza tipica misurata sul dato grezzo | Misurata su uno spettro appiattito, al più l'1 % dell'asse | `fondo-picchi-ui.test.js` (online e desktop) |
| 16 | media | funzione nuova | «Applica a tutti» copiava i punti di ancoraggio anche dove cadono fuori asse: fondo costante, spettro corretto negativo | Nessun controllo per spettro | Spettri con meno di due punti nel loro asse saltati ed elencati | `debug-conclusione-ui.test.js` |
| 17 | media | funzione nuova | ✎ Modifica di un picco verso la posizione di un altro creava un doppione (anche nel CSV) | Nessun controllo | Modifica rifiutata con un messaggio | `debug-conclusione-ui.test.js` |
| 18 | media | funzione nuova | Tema scuro: riquadri del fondo e dei picchi illeggibili (contrasto 1,1) | Variabile CSS inesistente | Colori del tema; segnaposti leggibili nel tema scuro | `debug-conclusione-ui.test.js` |
| 19 | media | funzione nuova + rc.5 | Con 500 posizioni l'avviso di 4300 caratteri copriva la pagina per 4 minuti | Elenchi interi; durata proporzionale alla lunghezza senza tetto | Elenchi a 8 voci («… e altri N»), avvisi al più 15 s | `debug-conclusione-ui.test.js` |
| 20 | bassa | funzione nuova | Larghezza e forma perse riscrivendo un picco automatico tolto | Ramo che riattivava il picco automatico | Diventa un picco aggiunto con larghezza e forma | `debug-conclusione-ui.test.js` |
| 21 | bassa | funzione nuova | Testi in italiano nell'interfaccia inglese (segnaposti delle aree di testo, «Fuori dallo spectra», «consigliato», forme) e suggerimento «1.086» sbagliato | Il traduttore salta le aree di testo; avvisi composti a pezzi | Testi bilingui espliciti, voci del dizionario | `debug-conclusione-ui.test.js`, `fondo-picchi-ui.test.js` |
| 22 | bassa | funzione nuova | Cursore del fondo su 100 000 punti: ogni passo rifaceva anche il riepilogo dell'esportazione (≈ 200 ms) | Riepilogo a ogni movimento | Riepilogo quando il cursore si ferma: passo da ≈ 0,46 a ≈ 0,3 s | misura (prova manuale) |
| 23 | bassa | funzione nuova | L'avviso «standard con elaborazioni diverse» non vedeva parametri del fondo diversi | Confrontava solo il metodo | Confronta anche i parametri | — |

Errori miei durante la sessione, corretti prima di ogni consegna e non arrivati a nessun utente: due commenti `//` inseriti a metà di una riga e un apostrofo non protetto (errori di sintassi, intercettati dall'estrattore delle traduzioni e dai test).

Osservazioni non corrette (sezione 5): permesso `opener:allow-reveal-item-in-dir` senza limiti di percorso (lo usa «Segnala un problema»); avvisi di `cargo audit` su crate non mantenuti e `glib` 0.18 «unsound» (dipendenze indirette di gtk/webkit su Linux, nessuna vulnerabilità); 5 avvisi di stile di `clippy`.

## 4. Test e build: prima e dopo

«Prima» = `desktop` 3.0.0-rc.5 (77bc847), su questa macchina Linux. «Dopo» = branch finale (rc.5 + I5, I6, I7, I9, I11 + questo lavoro), stessa macchina, a macchina scarica. Le suite dei rami uniti contengono più test: i totali crescono anche per questo.

| Suite | Comando | Prima (rc.5) | Dopo (candidata rc.6) |
|---|---|---|---|
| Unitari | `npm test` | 241 superati, 0 falliti, 1 saltato | **293 superati, 0 falliti, 6 saltati** (saltati: prove che richiedono il binario Rust o un'app vera) |
| Validazione numerica | `npm run test:validation` | 61 superati, 0 falliti, 3 saltati | **77 superati, 0 falliti, 3 saltati** (nuova R12, fondo) |
| Validazione nell'interfaccia | `npm run test:validation:ui` | 198 su 198 | **252 su 253**: 208 + 23 + 21 su 22. Fallisce `i6-grafico-ui` «G3» (scarto di 2 px contro 1 ammesso, WebGL software di Linux): **fallisce identico sul ramo `wip/i6-grafico-webgl` senza questo lavoro**, non è stato disattivato. Dentro la suite ci sono i nuovi `fondo-picchi-ui` (8), `sicurezza-csv-ui` (2) e `debug-conclusione-ui` (6) |
| Collaudo dell'interfaccia | `node test/ui-run.js` | 39 su 39 | **39 su 39** |
| Tempi del motore (I5) | `npm run test:validation:tempi` | — | 1 su 1 |
| Benchmark scientifici | `N=20 node test/benchmark-gate.js` | 36 controlli superati | **36 controlli superati** |
| Rust, app | `cargo test --lib` (src-tauri) | 19 su 19 (agente sicurezza) | **22 su 22** (con il nuovo `write_into_non_crea_cartelle_fuori`) |
| Rust, motore | `cargo test -p acch-core` | — | 10 su 10 |
| Clippy | `cargo clippy --all-targets` | 0 errori, 5 avvisi di stile | non ripetuto sull'insieme |
| Build desktop | `prepare-desktop` + `tauri build --debug --features e2e --no-bundle` + `run-e2e.js` (xvfb) | ok; collaudo nell'app vera 34 su 34 e «apri grezzi» 6 su 6 (agente, sulla rc.5) | `prepare-desktop` ok e worker con `baseline-core.js` verificato; build Rust di test ok; **la build Tauri completa e il collaudo e2e non sono stati ripetuti sull'insieme unito** (da fare in CI) |
| `npm audit` | | 0 vulnerabilità | 0 vulnerabilità |
| `cargo audit` | | 0 vulnerabilità, 6 avvisi (crate non mantenuti, glib unsound, indiretti) | dipendenze Rust invariate dai rami uniti salvo `acch-core` (nessuna nuova crate esterna oltre a quelle già nel Cargo.lock) |
| Installer di release, Windows, macOS | | non eseguibili qui | non eseguibili qui |

Una prova di tempi I9 («nessun compito oltre 50 ms») è fallita una volta con la macchina sotto carico (load 8 su 4 core per agenti e benchmark) ed è passata nel giro finale a macchina scarica.

## 5. Decisioni che spettano a Lorenzo

1. **arPLS automatico** (bug 7). Scegliere fra: lasciarlo com'è (risultati dei progetti salvati invariati) e consigliare IModPoly per il Raman; oppure cambiare la rigidità automatica (per esempio 24–32 «onde» al posto di 8, o adattiva al rumore), sapendo che i progetti già salvati con arPLS daranno numeri diversi; oppure cambiare il metodo proposto dall'assistente («Consiglio la base arPLS») per il Raman.
2. **Prova su spettri Raman reali**: i metodi di fondo sono validati solo su spettri sintetici. Servono alcuni spettri veri con fluorescenza (minerali, pigmenti, campioni biologici), con il fondo stimato da un esperto o da un altro programma, per confermare i valori consigliati.
3. **Versione rc.6**: il branch è la candidata rc.6, ma `package.json` e gli altri file di versione dicono ancora 3.0.0-rc.5 (la versione si cambia con `scripts/set-version.js` al momento della pubblicazione). Il crate `src-tauri/acch-core` è alla 3.0.0-rc.3 (da allineare o lasciare separato).
4. **Limite dei progetti a 1 GB** di dati decompressi (prima 4 GB, non controllati davvero): un progetto vero più grande (per esempio con mappe iperspettrali, I10) non si aprirebbe. Va bene, o serve un limite più alto per il desktop?
5. **Permessi del desktop**: (a) `opener:allow-reveal-item-in-dir` permette di mostrare nel gestore dei file qualunque percorso (lo usa «Segnala un problema» per lo screenshot): restringerlo passando dal comando nativo `reveal_in_dir`? (b) Aprire un progetto dai «recenti» concede ancora la scrittura su quel file senza un dialogo: è il comportamento voluto per «Salva»?
6. **SNIP anche per Raman e altre tecniche**: prima era riservato a XRF e LIBS; ora è proposto anche altrove (richiesta di Lorenzo). Confermare.
7. **Prove su Windows e macOS reali** (installer, WebView2, Gatekeeper) e build di release con gli installer: non eseguibili da questo ambiente Linux.
8. **Dipendenze Rust**: `cargo audit` non trova vulnerabilità ma segnala crate non mantenuti (chrono 0.4.45, proc-macro-error, zbus_names, zvariant) e `glib` 0.18 «unsound», tutte indirette (Tauri, gtk, webkit su Linux): da rivedere a un aggiornamento di Tauri.
9. **Prova dei tempi I9** («nessun compito oltre 50 ms»): fallita una volta con la macchina sotto carico (load 8 su 4 core), passata a macchina scarica (sezione 4). Se capita anche in CI, va resa meno sensibile al carico.
10. **`npm test` riscrive `i18n/_pairs.json`** (l'estrattore lo salva compatto): dopo i test l'albero di lavoro risulta modificato. Da sistemare nello script o accettare.
11. **Pubblicazione**: nessun merge, release né tag sono stati fatti. Unione in `desktop`/`main` e pubblicazione della rc.6 restano a Lorenzo.
12. **Test I6 «G3» del grafico**: fallisce su Linux con il WebGL software (2 px contro 1 ammesso) anche sul ramo `wip/i6-grafico-webgl` da solo. Sul Mac passava. Va deciso se la tolleranza dipende dal motore grafico o se c'è un difetto vero nel ripiego WebGL; non l'ho toccato.

## 6. Funzionalità (per una presentazione)

Acchiappaspettri trasforma i file degli strumenti di laboratorio (spettri e cromatogrammi) in grafici puliti e in analisi scientifiche. Funziona nel browser e come programma per Windows, macOS e Linux, in italiano e in inglese. I dati non lasciano mai il computer.

**Che cosa legge**
- Le tecniche più diffuse: infrarosso (FTIR, ATR), Raman, UV-Visibile, fluorescenza, cromatografia HPLC, fluorescenza X (XRF), LIBS, analisi termiche (TGA, DSC), risonanze NMR ed EPR, adsorbimento di gas (fisisorbimento e chemisorbimento).
- I file di testo e di Excel e molti formati degli strumenti: JCAMP-DX, Thermo OMNIC, Bruker OPUS, Agilent ChemStation/OpenLab con tutti i canali, Waters, Shimadzu, Anton Paar Autosorb, i progetti Origin. Nuovi formati si aggiungono con estensioni sicure.
- Riconosce da solo lo strumento e i problemi del file (righe illeggibili, separatori ambigui, unità sospette) e lo dice in parole semplici.

**Come si lavora**
- Tre passi: carica, controlla, scarica. Si trascinano file o cartelle; il grafico è subito pronto.
- I picchi si trovano da soli; si aggiungono con un clic o, **novità**, scrivendone la posizione (anche molti insieme, con larghezza e forma). Si tolgono, si rinominano e si annulla ogni passo.
- I nomi dei picchi vengono proposti da banche dati per tipo di campione (beni culturali, biologico, chimica, materiali) e da librerie personali per strumento: sono sempre ipotesi da confermare.
- Ritocchi dello spettro: conversioni, smoothing, raggi cosmici, derivate, scale e, **novità**, la **rimozione del fondo** con sei metodi riconosciuti in letteratura o con punti scelti a mano. Si vede il fondo stimato mentre si regolano i parametri, per uno spettro o per tutti. Il file originale non viene mai toccato.

**Analisi**
- Controllo della qualità del dato con rimedi a un clic.
- Separazione delle bande sovrapposte (deconvoluzione) con l'incertezza di ogni numero.
- Rette di taratura con limiti di rilevabilità e quantificazione, e librerie HPLC che ricordano le tarature.
- Confronto con spettri di riferimento e analisi delle miscele.
- Statistica su più campioni (PCA, gruppi), andamento nel tempo, serie con MCR-ALS e cinetiche.
- Composizione XRF anche senza standard (come stima dichiarata) e superficie specifica BET dei materiali porosi.

**Risultati**
- PDF pronto da leggere, immagini per articoli e tesi, tabelle CSV per Excel, file per Origin.
- Bozza del paragrafo «Metodi» con la bibliografia.
- File di tracciabilità con l'impronta di ogni dato e le elaborazioni usate, per rifare ogni numero.
- Un file di progetto conserva dati e lavoro, da riaprire o passare a un collega.

**Programma desktop**
- Spazio di lavoro professionale con menu, barra degli strumenti, foglio dati e finestre staccabili.
- Calcoli pesanti in un processo separato e lettore nativo veloce, con gli stessi numeri della versione online.
- Grafico veloce anche con milioni di punti.
- Aggiornamenti firmati; funziona senza internet.

**Affidabilità**
- Ogni calcolo è confrontato con riferimenti pubblici (NIST, dati sintetici con verità nota, report pubblici), con documenti di validazione aperti e centinaia di prove automatiche.
- Le identificazioni automatiche sono presentate come ipotesi; le concentrazioni senza standard come stime.
