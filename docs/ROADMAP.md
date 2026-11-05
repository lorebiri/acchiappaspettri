# Roadmap

Sintesi dei rapporti di cinque **ricercatori virtuali**: un ricercatore generale e quattro profili ispirati ai laboratori ICCOM (ABC-Lab, analitica e bioanalisi; MaRS-Lab, NMR ed EPR; ALS-Lab, spettroscopia laser e beni culturali; ThC2-Lab, chimica teorica e computazionale).

**Non sono ricercatori reali e questa non è una validazione ufficiale dell'ICCOM.** Sono sub-agenti che hanno usato il programma con file di prova sintetici. Le priorità vanno confermate con persone vere dei laboratori.

Livelli di evidenza: **O** osservato usando il programma; **D** dedotto dal codice; **P** proposta di funzione.

## Già fatto in questo ciclo (dai loro rapporti)

| Bisogno | Profilo | Correzione |
|---|---|---|
| Numeri con separatore delle migliaia letti male in silenzio, righe scartate senza dirlo | ABC | avviso all'importazione e in «Controllo del dato» |
| JCAMP con asse in Hz etichettato come ppm | MaRS | conversione con la frequenza di osservazione, altrimenti avviso |
| Riferire un NMR (TMS), scalare frequenze calcolate, spostare un TD-DFT | MaRS, ThC2 | scala e spostamento per spettro, riportati nei metodi |
| Etichette degli assi non modificabili | ThC2, generale | etichette per spettro |
| Tempo vivo Amptek non letto | ALS | `LIVE_TIME - 60` riconosciuto |
| Concentrazioni FP senza dire quali elementi sono stati considerati | ALS | elenco nelle note, avviso sulle righe sovrapposte |
| Spessore di uno strato su materiale senza l'elemento | ALS | calcolo rifiutato con spiegazione |
| Banda stretta vera appiattita dalla rimozione dei raggi cosmici | generale, ALS | controllo della larghezza a metà altezza |
| Picchi sotto soglia non segnalati | ABC | avviso con il numero dei segnali esclusi |
| Colonne in più ignorate senza dirlo | ABC | avviso |
| LOD maggiore degli standard più bassi | ABC | avviso nella curva di taratura |
| Commento per Origin con il nome sbagliato della linea di base | ABC | nome vero del metodo |

## P0: prima di usarlo per dati da pubblicare

| # | Cosa | Perché, per chi | Ev. | Impegno |
|---|---|---|---|---|
| 1 | **Blocco di tracciabilità in ogni esportazione**: file e hash, parametri di ogni passaggio, versione | Un dato esportato deve poter essere ricostruito. Generale, ABC | O | M |
| 2 | **Resoconto d'importazione completo**: righe lette, intestazioni, separatori riconosciuti, unità; possibilità di correggere prima di proseguire | Oggi c'è l'avviso, non il resoconto. ABC | O | M |
| 3 | **Elaborazione per singolo spettro con annulla**: linea di base, lisciatura e simili oggi sono per tecnica | Spettri diversi della stessa tecnica richiedono scelte diverse. Generale | O | L |
| 4 | **Salvataggio automatico con recupero** | Una sessione di misura persa costa una giornata. Generale | D | M |
| 5 | **Regressione pesata (1/x, 1/x²) e residui** | Su intervalli ampi la retta non pesata falsa i valori bassi: oggi solo un avviso. ABC | O | M |
| 6 | **Limiti dichiarati del doppio integrale EPR**: incertezza, confronto con un riferimento, normalizzazione per guadagno e potenza | Un numero senza incertezza può essere preso per una concentrazione di spin. MaRS | O | M |

## P1: bisogni specifici di un laboratorio

| # | Cosa | Per chi | Ev. | Impegno |
|---|---|---|---|---|
| 7 | Importazione nativa **Bruker** (`fid`/`1r`, `acqus`) e **BES3T** (`.DTA`/`.DSC`) | MaRS: oggi va esportato a mano in testo o JCAMP | O | L |
| 8 | Asse **g** per EPR e confronto normalizzato in g | MaRS | O | S |
| 9 | Regioni d'integrazione NMR e preset 13C, 29Si; elenco nuclei esteso | MaRS | O | M |
| 10 | **Vista per campione a più tecniche** (Raman, XRF, FTIR dello stesso campione, con le ipotesi in un solo posto) | Tutti, soprattutto ALS | O | L |
| 11 | Modello **oggetto → punto → misura**, punti su foto, tabella di campagna | ALS: campagne con decine di punti su un'opera | O | L |
| 12 | Serie di colpi **LIBS**: media, variabilità, andamento in profondità | ALS | P | M |
| 13 | **Modalità dato calcolato**: bastoncini con allargamento scelto, nessun controllo di rumore né ipotesi su spettri teorici; nessuna confusione fra calcolato e misurato | ThC2 | O | M |
| 14 | Importazione **Gaussian, ORCA** | ThC2 | P | M |
| 15 | Conversioni **nm ↔ eV ↔ cm⁻¹** con correzione di Jacobiano, sovrapposizione fra calcolato e sperimentale | ThC2, ALS | P | M |
| 16 | Repliche, diluizioni e fattori per campione; importazione di tabelle ICP | ABC | P | M |
| 17 | Modalità tracce: unità dalle intestazioni e LOD/LOQ con il loro metodo | ABC | O | M |
| 18 | Integrazione manuale HPLC (inizio, fine, taglio) | Generale, ABC | O | M |

## P2: qualità d'uso

| # | Cosa | Per chi | Ev. | Impegno |
|---|---|---|---|---|
| 19 | Annotazioni libere sui grafici; intervallo Y manuale; riquadri con etichette (inset) | Generale, ThC2 | O | M |
| 20 | Regole di ipotesi aggiuntive (biacca, nitrati) e livello di confidenza dichiarato | ALS | O | S |
| 21 | Allineamento automatico delle immagini con indicazione di affidabilità | ALS | O | M |
| 22 | Soglia di sensibilità sotto l'attuale minimo, per i segnali deboli che oggi restano solo segnalati | ABC | O | S |

Impegno: S giorni, M settimane, L oltre un mese.

## Cosa non è stato valutato

Nessun profilo ha lavorato con file reali di uno strumento ICCOM. Formati, tempi di lavoro e priorità vanno controllati con chi misura davvero: è il primo passo da fare prima di iniziare il P1.
