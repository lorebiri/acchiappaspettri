# Roadmap

Sintesi di diciassette cicli di prova con **tester virtuali**. Sono sub-agenti che hanno usato il programma con dati sintetici, ciascuno dal punto di vista di un profilo:
- ricercatore generale di laboratorio;
- analitica e bioanalisi, NMR ed EPR, spettroscopia laser e beni culturali, chimica teorica (quattro contesti di ricerca dell'ICCOM);
- tre profili specialistici: XRF quantitativa senza standard, analisi qualitativa multi-tecnica dei beni culturali, HPLC qualitativa e quantitativa.

Ai cicli hanno partecipato anche un agente scientifico e un agente di collaudo, che cercavano errori e regressioni.

**Non sono persone reali e non rappresentano né i ricercatori a cui i profili si ispirano né una validazione dell'ICCOM.** Nessun profilo ha usato file reali di uno strumento: le priorità vanno confermate con chi misura.

Legenda dell'evidenza: **O** osservato usando il programma; **D** dedotto dal codice; **P** proposta di funzione.

## Come si è lavorato

Ogni ciclo ha seguito gli stessi passi:
1. ogni profilo prova il programma e scrive un rapporto per gravità (critico, alto, medio, basso);
2. il coordinatore toglie i doppioni e sceglie che cosa correggere;
3. si corregge;
4. chi aveva segnalato riprova.

Ventitré cicli fino al 6 novembre 2026, poi il ciclo 24 con regole più severe ([AGENTI.md](AGENTI.md)) e il ciclo 25 di riverifica prima della 2.2.0. Quelli che restano sono qui e in [LIMITAZIONI.md](LIMITAZIONI.md). Le proposte sono state valutate dall'Agente Capo Progetto, che rappresenta il committente.

## Già corretto o aggiunto nei cicli

| Bisogno | Profili | Che cosa c'è ora |
|---|---|---|
| Dati letti male in silenzio | tutti | Avvisi per righe scartate, separatori delle migliaia, celle vuote (anche nella prima colonna), tabelle dei picchi prima o dopo i dati, testo in mezzo, CSV con virgolette, JCAMP NTUPLES, Hz senza frequenza. Colonna Y scelta dal nome (Value, Signal) o a mano. |
| Stesso nome, dati diversi | generale | Il lavoro salvato si eredita solo se l'impronta del file coincide. |
| Ipotesi da un solo picco | qualitativa, beni culturali | Una banda o una riga sola è «inconclusiva». Pb, As, Hg, W e Au si dichiarano «non distinguibili» quando le righe coincidono. Le bande condivise vengono dichiarate. Con l'asse XRF spostato non si propone nessun elemento. «Accetta i suggerimenti» non cambia più l'esito. |
| Stima XRF presentata come concentrazione | XRF | «Stima senza standard, non validata» a schermo, nel CSV e nel PDF, con le condizioni di misura, la modalità e il filtro primario. Un pulsante mostra quanto la stima dipende dalle ipotesi. |
| Tarature difendibili | analitica, HPLC | Rette pesate 1/x e 1/x², controllate con un calcolo indipendente. Ruoli standard, bianco e controllo, con il recupero. Concentrazioni valide per la zona in cui sono state scritte. Stato di ogni stima (estrapolato, < LOD, < LOQ, normalizzato, unità mancante, cima tagliata, coeluito, bordi, picco spostato) a schermo, nel CSV e nel PDF. |
| Ricostruire un dato esportato | generale | `tracciabilita.csv` con l'impronta SHA-256, la tecnica, la colonna Y, la scala, le elaborazioni (raggi cosmici compresi) e se il dato è calcolato. I metodi elencano le elaborazioni per singolo spettro e i pesi. |
| Elaborazione giusta per ogni spettro | generale | Smoothing e linea di base anche per singolo spettro. Avviso se lo smoothing è più largo dei picchi e se si usano le elaborazioni dell'ultima volta. |
| Dati calcolati scambiati per misure | chimica teorica | Interruttore «Dato calcolato»: niente controlli di rumore, niente ipotesi, etichetta nei titoli e nella tracciabilità. Tipo di asse Y dichiarabile. |
| Riferimento NMR e unità EPR | NMR/EPR | Riferimento degli integrali che segue l'asse. Avvisi per campo in unità sbagliate e per un rapporto picco/rumore basso. |
| Lavoro perso | generale | Copia di recupero locale ogni 30 s, che si cancella solo su richiesta. |
| Versione online | web lead | Più leggera: le funzioni di studio si aprono con «Mostra qui». Picchi e assegnazioni sono identici al desktop ([WEB-LEGGERA.md](WEB-LEGGERA.md)). |

## Versioni decise dal Capo Progetto (7 novembre 2026)

### 2.2.1: caricamento multicanale HPLC
- Riconoscimento dei canali dal nome e dall'intestazione (DAD1 A, Sig=254, VWD, FLD Ex/Em, UV_VIS_1, Detector A-Ch1, «254 nm»); lettura dei file a più colonne e a più blocchi (Shimadzu); Empower `.arw`.
- Finestra «Canali trovati»: griglia campioni × canali con lunghezza d'onda e sigla; predefinito tutto tranne fluorescenza e canali sconosciuti; un canale non riconosciuto non viene mai scartato senza dirlo; «ricorda la scelta».
- Ogni canale diventa uno spettro con il suo canale (`f.channel`) e il campione (`f.sampleKey`); i byte originali si salvano una volta sola.
- Libreria dei nomi: campi facoltativi (tecnica, tipo di campione, canale, unità, fonte, data), provenienza del nome visibile (📚) e nel CSV, avviso quando due voci si sovrappongono.
- Desktop, apertura dei file grezzi dal sistema (decisione del committente, 8 novembre 2026): doppio clic e «Apri con» per i file degli strumenti. Formati propri (JCAMP `.jdx`/`.dx`, `.spc`, Empower `.arw`) proposti come predefiniti; formati generici (`.csv`, `.txt`, `.tsv`, `.xy`, `.dat`) solo come programma alternativo, senza togliere Excel o l'editor. Il filtro in `src-tauri/src/lib.rs` (`accept_args`, `RunEvent::Opened`) accetta queste estensioni oltre ai progetti; l'app apre più file insieme in una sola finestra (istanza singola) e chiede se aggiungerli al progetto aperto. Prove su Windows, macOS e Linux (registrazione, doppio clic, file con spazi e accenti, file molto grandi, disinstallazione che toglie le associazioni) nella pipeline e nella lista di controllo di Windows.

### 2.3: libreria dei picchi completa e pendenza per picco
- Modulo `app/library.js`, file aperto `.acchlib.json` con schema versionato, tre livelli (sistema, utente, condivise), import con i conflitti esplicitati, progetto `.acchspettri` versione 2 con le librerie incorporate e migrazione provata dalla versione 1.
- Scheda «Libreria dei picchi» con filtri per strumento, tipo di campione, metodo e canale; «Aggiungi alla libreria» dal clic destro sul picco.
- HPLC: per ogni picco tempo di ritenzione, finestra, RRT rispetto allo standard interno, canale e λ, metodo e colonna, taratura (pendenza o fattore di risposta, intercetta, unità, intervallo, n, R², s_y/x, LOD, LOQ, data, strumento, lotto dello standard) con lo storico.
- Regole della taratura salvata decise dal Capo Progetto il 7 novembre 2026 (su incarico del committente, dopo i pareri degli agenti scienziati): profili per tipo di analisi, aggiornamento con uno o due controlli del giorno, carta di controllo, incertezza estesa, messaggi ed esportazioni, prove di accettazione. Specifica completa in [SPEC-TARATURA-SALVATA.md](SPEC-TARATURA-SALVATA.md).
- Validazione prima del rilascio: prove HPLC T1–T6, migrazione dei progetti, R4–R8 estesi alla libreria, test di usabilità con SUS ≥ 75.
- Anche nella 2.3 (piano del Capo Progetto, 8 novembre 2026): fit con funzioni scritte dall'utente; polinomi e regressione multipla; statistica validata su NIST; ricette applicate in serie a una cartella. Prestazioni con grandi dati e accessibilità diventano obbligatorie. Ogni funzione nuova va confrontata sui benchmark pubblici con i programmi di riferimento (criterio in AGENTI.md).

### 2.2.1, in più
- Dopo il ciclo 25: importare ogni blocco o colonna HPLC come cromatogramma separato; corpus con esportazioni vere ChemStation/OpenLab multicanale e file .arw multicanale; integrazione HPLC oltre l'1% dell'altezza; riconoscere l'inversione dell'asse con x ripetute; testo del controllo per due scansioni FTIR; base del doppio integrale EPR con finestre lontane dalla riga; avviso NMR sul picco negativo; «2H» nel nome letto come nucleo; GIAO con scala negativa (δ = σref − σ); bastoncini DFT con avviso; versioni .deb delle prove come «2.2.1~rc.N»; elenco delle librerie Linux filtrato con `dpkg -S`.
- Misura di base del tempo per arrivare al risultato su 5 compiti tipo (indice FTIR, taratura HPLC, deconvoluzione, XRF, NMR), da confrontare poi con i ricercatori pilota.

### Aspetto dell'applicazione (requisiti V1–V6 e G1–G5 in AGENTI.md)
- 2.2.0: invariata.
- 2.2.1: il designer visivo scrive il sistema di design e le bozze; passaggio alle variabili CSS senza cambiare l'aspetto (confronto a pixel identico); misura di base di fluidità e prontezza; movimento di base: zoom morbido, passaggi tra viste, riscontro delle azioni, impostazione «Animazioni».
- 2.3: nuovo aspetto per gradi, una zona alla volta (barra degli strumenti, pannelli, finestre, benvenuto, grafico), con i 39 test dell'interfaccia e R5/R6 verdi e il ritorno all'aspetto precedente; grafico fluido con 1 milione di punti (WebGL o OffscreenCanvas con ritorno al canvas 2D); mirino, cursori, viste collegate, spettri a cascata; animazione didattica. Voce separata a priorità più bassa: figure per la pubblicazione (vettoriali, stili delle riviste, palette per chi distingue male i colori).
- 3.0: mappe, contorni, 3D, serie nel tempo animate.

### 3.0: oltre i programmi a pagamento
- Mappe e dati iperspettrali; MCR-ALS; fit globale delle cinetiche; ricetta esportata come script Python; estensioni per nuovi formati; importazione dei progetti Origin (.opj).

### Le capacità per cui sceglierlo (visione del committente)
1. Dal file al risultato in un minuto: riconoscimento del file, ricette applicate a una cartella, rapporto con un clic.
2. Incertezza su ogni numero: fit, tarature, XRF, integrali.
3. Validazione pubblica e riproducibile (VALIDAZIONE.md e benchmark aperti).
4. Conoscenza del campo: librerie, ipotesi prudenti, bozza dei metodi.
5. Riproducibilità: la ricetta esportata come script Python.
6. Senza barriere: dal browser, su tutti i sistemi, in italiano e in inglese.

## Da sviluppare

### P1: bisogni concreti, realizzabili con l'architettura attuale

| # | Cosa | Per chi | Ev. | Impegno |
|---|---|---|---|---|
| 1 | Regioni d'integrazione NMR con numero di nuclei (riusa la misura di banda) | NMR | O | giorni |
| 2 | Lettura BES3T 1D e Bruker `1r` con `procs`, conservando guadagno e potenza | NMR/EPR | P | giorni ciascuno |
| 3 | Incertezza del doppio integrale da zone di fondo; controllo delle ali e della deriva | EPR | O | 1–2 settimane |
| 4 | Integrazione manuale HPLC (inizio, fine, taglio) | HPLC, analitica | O | settimane |
| 5 | Sequenze con repliche, diluizioni e più analiti per iniezione; bianco confrontato con il LOD | HPLC, analitica | O | settimane |
| 6 | Avviso se standard e campioni hanno elaborazioni diverse | analitica | O | giorni |
| 7 | Bastoncini con allargamento dichiarato; asse nm ↔ eV ↔ cm⁻¹ con Jacobiano | chimica teorica | O | settimane |
| 8 | Tabella di campagna oggetto → punto → misura → elementi; media e profilo dei colpi LIBS | beni culturali | P | oltre un mese |
| 9 | Vista per campione a più tecniche, con evidenze a favore e contro | qualitativa, beni culturali | P | oltre un mese |
| 10 | Stato delle attribuzioni (ipotesi, confermata, respinta) con autore | qualitativa | P | settimane |
| 11 | Correzione della tecnica per una serie intera, riconosciuta dal nome dei file | beni culturali | O | giorni |
| 12 | Riferimenti confrontati con la stessa elaborazione del campione | qualitativa | O | giorni |
| 13 | Caricamento di `jsPDF` e del dizionario inglese solo all'uso: −20% di attesa su reti lente | web lead | O | giorni |
| 14 | Ore o dosi lette dal nome del file («0250h» → 250 h) nella modalità andamento | ricercatore senior | P | giorni |
| 15 | Scheda «Andamento» a sé: campioni, ore, indice, grafico ed esportazione su un solo schermo | ricercatore senior | P | settimane |

### P2: qualità d'uso

Separare il ricalcolo dei numeri dalla ricostruzione dei campi in «Più campioni» (debito tecnico: oggi si ridisegna tutto, conservando fuoco e testo); revisione del glossario perché SNV/MSC, arPLS e pseudo-Voigt abbiano tutti una spiegazione; testo base più grande e avvisi accanto al campo coinvolto; un'unica uscita «per la relazione» (grafici e tabella senza le pagine di ipotesi); annotazioni libere sui grafici; intervallo Y manuale nelle figure esportate; nomi delle colonne nel selettore Y; uno schermo da 375 px senza scorrimento laterale; il benvenuto dopo un recupero; una soglia S/N EPR meno sensibile allo smoothing.

## Valutato e scartato (motivato dai profili)

- Correzioni automatiche dei gauss, della patina e della composizione da colore: troppo ambigue, darebbero numeri sicuri e sbagliati.
- Modello del tubo XRF oltre 50 kV, e un modello del tubo più fine senza materiali certificati.
- Lettori di formati binari proprietari senza file veri per collaudarli (`.ch`, `.lcd`, `.cmbx`, `.pdz`).
- Separazione automatica dei picchi con Rs < 0,5; un punteggio unico di affidabilità; un'identificazione automatica «intelligente».
- Supporto a 21 CFR Part 11 e alle firme elettroniche.

## Rilascio

- I pacchetti pubblicati vengono ricostruiti dalla pipeline di pubblicazione dopo i test: non sono gli stessi file installati e provati in CI. Dopo ogni pubblicazione si scaricano e si installano almeno Windows e un Mac.
- L'aggiornamento firmato si prova davvero solo da una versione pubblicata alla successiva: pubblicare una 2.2.1 entro due settimane dalla 2.2.0.
- La chiave privata di firma degli aggiornamenti va custodita anche fuori dal Mac di sviluppo: senza di essa le app installate non possono più aggiornarsi.

## Prossimo passo

Provare il programma con file reali dei laboratori, per confermare quali voci P1 contano davvero.
