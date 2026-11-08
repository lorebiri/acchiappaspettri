# Specifica 2.3: concentrazione HPLC da una taratura salvata in libreria

Decisa dal Capo Progetto il 7 novembre 2026, su incarico del committente, dopo i pareri di tre agenti scienziati (HPLC, chimico analitico, statistico e metrologo, con simulazioni Monte Carlo). Gli agenti sono tester virtuali, non persone reali; le soglie si basano su simulazioni e vanno riviste con dati reali di carte di controllo.

## Principi
1. **Decisione del committente (8 novembre 2026)**: nel profilo Ricerca la retta salvata calcola la concentrazione **anche senza controlli del giorno** (lo strumento è sempre lo stesso). Se ci sono controlli, la retta viene aggiornata con essi; se non ci sono, il risultato porta sempre il segno «taratura salvata senza controllo del giorno», con data ed età della taratura. Nota del Capo Progetto e degli agenti scienziati: senza controllo una deriva tra il 5 e il 10% non si vede; un controllo al giorno resta consigliato e il programma lo propone, senza imporlo.
2. Le regole dipendono dal **tipo di analisi**: dove la prassi richiede la retta in ogni serie, la retta salvata non quantifica.
3. L'età non decide nulla: le derive le trova la **carta di controllo**; i giorni sono un promemoria.
4. Mai un numero senza dire come è stato ottenuto: retta del giorno, retta salvata aggiornata con 1 o 2 controlli, oppure retta salvata senza controllo. Se manca una condizione bloccante, lo stato è «**taratura non verificata oggi**: motivo».

## Profili (scelti al salvataggio in libreria, obbligatori)
| Profilo | Retta salvata per quantificare | Note |
|---|---|---|
| Ricerca (predefinito) | sì; con i controlli del giorno se presenti, altrimenti senza controllo (decisione del committente) | risultato senza controllo marcato «taratura salvata senza controllo del giorno» |
| Esplorativa | sì, con regole più larghe | ogni risultato marcato «stima esplorativa» a schermo, nel CSV, nel PDF e nei metodi |
| Impurezze | solo il fattore di risposta relativo (RRF) salvato, riferito a uno standard del principio attivo misurato nel giorno | |
| Dosaggio | no: fattore o retta del giorno | |
| Tracce e residui | no: retta nella serie | |
| Bioanalisi | no: retta e controlli di qualità nella serie | |

Nei profili «no» la retta salvata serve solo come confronto con quella del giorno (differenza in %). Questi profili non si possono sbloccare.

## Calcolo
- Per ogni controllo: k = risposta osservata / risposta prevista dalla retta salvata; concentrazione x = (y/k − a)/b.
- **Un controllo** è ammesso solo se l'intercetta salvata non è significativa (IC 95% che contiene 0, oppure |a| ≤ 2% della risposta al livello del controllo) **e** tutti i campioni hanno risposte tra 0,5 e 2 volte quella del controllo.
- **Due controlli** (basso: circa 2–3 × LOQ o 20% dell'intervallo; alto: circa 80%) sono obbligatori se l'intercetta è significativa, se i campioni coprono più di un fattore 5 o se qualche campione sta sotto il 25% dell'intervallo. k è la media dei due rapporti, che devono differire al massimo del 5% (altrimenti la linearità del giorno non è verificata).
- **Apertura e chiusura della serie**: deriva ≤ 5%, k interpolato nell'ordine di iniezione, un controllo almeno ogni 20 campioni.
- **Impurezze**: concentrazione = risposta / (RRF × fattore di risposta del principio attivo nel giorno); l'RRF deve passare il controllo di ±10% sullo standard di impurezza, se presente.

## Soglie predefinite
| | Ricerca | Esplorativa |
|---|---|---|
| Scostamento di ogni controllo dal valore nominale | ±10% | ±15% |
| Differenza tra due controlli | ≤ 5% | ≤ 8% |
| Deriva apertura–chiusura | ≤ 5% | non richiesta (basta 1 controllo) |
| Massimo consentito allargando | ±15% | ±20% |

Terminologia: «scostamento dal valore nominale», non «recupero».

## Modificabile e non modificabile
- **Modificabile**: soglie e frequenza dei controlli (restringere sempre; allargare solo con una motivazione scritta, salvata nella libreria e riportata nel CSV e nei metodi, mai oltre i massimi della tabella); promemoria dell'età.
- **Mai sbloccabile**: canale, λ, ampiezza di banda e riferimento, metodo, strumento e colonna coincidenti con quelli salvati; nessuna estrapolazione oltre l'intervallo della taratura; nessuna retta salvata da dati normalizzati; tR del controllo nella finestra della voce; idoneità del sistema superata, se inserita; controlli presenti (salvo nel profilo Ricerca, vedi principio 1); un evento registrato di manutenzione (lampada, colonna, cella) invalida le tarature salvate di quello strumento o di quella colonna; profili Dosaggio, Tracce e Bioanalisi.

## Carta di controllo
- Una carta per ogni voce della libreria, con il k di ogni serie; attiva dopo almeno 10 serie (prima valgono le soglie fisse). Limiti dalle prime 10 serie, ricalcolabili solo con motivazione scritta.
- Regole di Westgard: 1_3s blocca («taratura non verificata oggi: fuori dai limiti di azione»); 2_2s avvisa. Il blocco oltre la soglia fissa resta sempre.
- Visibile nella scheda della libreria ed esportabile in PNG, SVG e CSV.
- Età sempre mostrata; promemoria a 180 giorni (modificabile), che non blocca mai.

## Incertezza
U (k = 2) accanto a ogni concentrazione:

U = 2·x·√( s_r²·(1/m_c + 1/m_k) + u_std² + (s_a/b)²·(1/x − 1/x_c)² )

Senza controllo del giorno: m_c = ∞ e la componente tra i giorni (5% predefinito, o dalla carta se esiste) resta sempre dichiarata. s_r dalla carta di controllo (variabilità tra i giorni) se ci sono almeno 10 serie; altrimenti s_y/x della taratura più una componente predefinita del 5% tra i giorni, dichiarata. u_std è l'incertezza dello standard di controllo, inserita dall'utente; se manca vale 0 e lo si dichiara. La formula va anche in SCIENZA.md e nella bozza dei metodi.

## Messaggi
- «Taratura salvata del gg/mm/aaaa (età N giorni), aggiornata oggi con 1 o 2 controlli; scostamenti −2,1% / +1,4%; deriva 1,8%.»
- «Taratura non verificata oggi: [controllo assente | controllo fuori soglia (−12,3% su ±10%) | deriva 6,1% su 5% | controlli non coerenti | canale, metodo, strumento o colonna diversi | fuori intervallo | profilo che non ammette tarature salvate | carta di controllo: limite di azione superato | manutenzione registrata dopo la taratura]. Misura una retta del giorno.»
- «Taratura salvata del gg/mm/aaaa (età N giorni), senza controllo del giorno: una deriva dello strumento non verrebbe vista. Consigliato un controllo.»
- «Promemoria: taratura di oltre 180 giorni.» · «Stima esplorativa.»

## Esportazioni
- CSV: profilo, metodo di taratura (retta del giorno / salvata + 1 controllo / salvata + 2 controlli / salvata senza controllo / RRF), id della taratura e versione, data, età in giorni, livelli dei controlli, scostamenti %, deriva %, k, stato della carta, U (k = 2), stato, motivazione di soglie allargate.
- PDF: lo stesso riepilogo per ogni analita, con lo stato in evidenza.
- Metodi: frase con il metodo e i riferimenti (ICH Q2(R2), Eurachem, Westgard, ISO 8466-1). Le altre norme citate dagli agenti a memoria (ICH M10, SANTE/11312/2021, USP <621>, Ph. Eur. 2.2.46, EPA serie 8000) vanno verificate dal revisore dei documenti prima di essere scritte.

## Prove di accettazione (automatiche nella pipeline, ripetute 3 volte)
1. Ogni blocco impedisce il numero e dà il messaggio giusto: un test per ciascuno. Nel profilo Ricerca senza controlli il numero c'è e porta il segno «senza controllo del giorno» a schermo, nel CSV, nel PDF e nei metodi.
2. Monte Carlo con seme fisso, deriva 3, 5 e 8%: con un controllo risultati oltre ±10% ≤ 1,5%; con due controlli ≤ 0,5%; copertura di U95 tra 93 e 97%.
3. Carta di controllo: salto dell'8% rilevato entro 1 serie; deriva dello 0,1% al giorno entro 40 serie; falsi allarmi ≤ 1% per serie.
4. Calcoli (k, x, U, RRF) contro un calcolo Python indipendente: LRE ≥ 10.
5. Esportazioni uguali allo schermo; profili e soglie conservati nei progetti e nei file di libreria.
6. Esperienza d'uso: un utente sceglie il profilo e capisce senza aiuto perché non riceve un numero.

Implementazione: sviluppatore della libreria (moduli `app/library.js` e `app/hplc-stored-cal.js`), collaudo degli agenti HPLC, analitico e metrologo (che ripete le simulazioni), verifica delle norme da parte del revisore dei documenti.

## Libreria di partenza: saliva, HPLC-DAD 220 nm (decisione del committente, 8 novembre 2026)
Il committente usa lo stesso sistema degli articoli di partenza (Agilent 1260 Infinity con DAD G4212B e software Agilent). Le voci entrano quindi nella sua libreria come **tarature salvate**, utilizzabili nel profilo Ricerca, non come semplici riferimenti.
- Fonti: Campanella et al., IJERPH 2020, 17, 6158 (doi:10.3390/ijerph17176158), 23 analiti, metodo RP-HPLC-DAD a 220 nm su Zorbax Phenyl-Hexyl; Campanella et al., IJERPH 2022, 19, 6033 (doi:10.3390/ijerph19106033), diidrouracile. Bozza delle voci, con tR, pendenza ± DS, R², LOD e posizione nella fonte: [`libreria/saliva-hplc-dad220.bozza.json`](libreria/saliva-hplc-dad220.bozza.json), preparata dall'agente di letteratura, da convertire nel formato `.acchlib.json` quando esisterà.
- Pendenza predefinita: Tabella S2 (standard); la pendenza e l'intercetta della Tabella 2 (in saliva) restano come alternativa nella stessa voce.
- Ogni voce dichiara «fonte: letteratura, stesso modello di strumento dichiarato dall'utente», l'unità dell'area assunta (mAU·s, predefinita del software Agilent, non scritta negli articoli) e la data della fonte; l'età si conta da quella data.
- Avvisi da mostrare: tra le due tabelle dello stesso articolo le pendenze differiscono fino al 34% (GSSG) e i tR fino a 0,53 min (fenilalanina); il primo standard iniettato confronta subito la propria risposta con la pendenza salvata. Interferenze dichiarate dalle fonti: piruvico coperto dal malico, α-chetoglutarico vicino a diidrouracile e acetico, lattico in due picchi, creatinina e piruvico assorbiti in parte dalla Salivette.
- Esclusi: lattato-9-CMA (solo abstract) e carbonili-DNPH (UHPLC 1290, senza tR) restano voci di sola identificazione.
