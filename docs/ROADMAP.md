# Roadmap

Sintesi di cinque cicli di prova con **tester virtuali**. Sono sub-agenti che hanno usato il programma con dati sintetici, ciascuno dal punto di vista di un profilo:
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

Cinque cicli, fermi solo quando nessun profilo trovava più problemi critici o alti realizzabili. Quelli medi e bassi restano qui e in [LIMITAZIONI.md](LIMITAZIONI.md).

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

### P2: qualità d'uso

Annotazioni libere sui grafici; intervallo Y manuale nelle figure esportate; nomi delle colonne nel selettore Y; uno schermo da 375 px senza scorrimento laterale; il benvenuto dopo un recupero; una soglia S/N EPR meno sensibile allo smoothing.

## Valutato e scartato (motivato dai profili)

- Correzioni automatiche dei gauss, della patina e della composizione da colore: troppo ambigue, darebbero numeri sicuri e sbagliati.
- Modello del tubo XRF oltre 50 kV, e un modello del tubo più fine senza materiali certificati.
- Lettori di formati binari proprietari senza file veri per collaudarli (`.ch`, `.lcd`, `.cmbx`, `.pdz`).
- Separazione automatica dei picchi con Rs < 0,5; un punteggio unico di affidabilità; un'identificazione automatica «intelligente».
- Supporto a 21 CFR Part 11 e alle firme elettroniche.

## Prossimo passo

Provare il programma con file reali dei laboratori, per confermare quali voci P1 contano davvero.
