# Novità delle versioni

## 3.0.0-rc.2

Versione di prova (release candidate) della 3.0.0, uguale alla 3.0.0-rc.1, che non è stata pubblicata perché un controllo dei pacchetti Linux nella CI non riscriveva la versione Debian delle prove (X~rc.N). È una pre-release: non viene proposta agli utenti come aggiornamento.

## 3.0.0-rc.1

Versione di prova (release candidate) della 3.0.0, per il collaudo: è una pre-release e non viene proposta agli utenti come aggiornamento. Contiene la prima tappa della 3.0.0 (correzioni dei collaudi e desktop professionale); le altre funzioni della 3.0.0 arrivano nelle prove successive.

## 3.0.0

- Desktop professionale: testi sobri da software scientifico, senza mascotte, emoji, esclamazioni né coriandoli; Novità proprie; nessun riferimento al browser. La versione online non cambia.
- Desktop: «Aggiungi spettri» e tutte le scelte di file usano i dialoghi del sistema (prima su Windows la finestra si bloccava); i dialoghi si aprono nell'ultima cartella usata per spettri, progetti ed esportazioni, altrimenti in Documenti; l'esportazione conferma solo dopo aver scritto il file; trascinamento nativo di file e cartelle; finestra mostrata già disegnata; Analisi → Preimpostazioni apre la sezione giusta. Lo stesso file caricato due volte insieme entra una volta sola.
- Importazione: un asse con il separatore delle migliaia e tutti i valori ≥ 1000 («1,100» con la Y a punto decimale) dà ⛔; un asse di tempo o spettrale che torna indietro dallo stesso punto si legge come due blocchi; XRF .mca con energia negativa nella calibrazione letta per intero.
- HPLC: avvisi per due segnali con un solo blocco e per un canale del nome diverso dall'intestazione; nomi uguali distinti dalla cartella; tabelle riassuntive non contate come canali; fattore di coda > 2 anche con un picco solo. CSV: nomi della libreria personale non più indicati come proposte.
- Andamento: l'unità di x anche nella pendenza del CSV. Riga di Mandel, numero di pagine, intervalli di confidenza nel CSV, avviso con LOD = 0, S/N, piatti teorici e riepilogo corretti in inglese; avvisi al singolare.
- EPR: zone di fondo scelte per il doppio integrale, con la provenienza nei risultati; avviso quando le ali della riga entrano nella base; niente ⛔ falso con una base curva. NMR: avviso sul picco negativo, «2H» nel nome non è più il deuterio, scala negativa per δ = σrif − σ, avviso sui bastoncini.
- XRF: avviso As/Pb con pochi conteggi; testi tradotti; gli avvisi della stima restano segnati anche nel CSV e sul desktop.
- PDF: cm⁻¹, ∞ e √ leggibili; font Unicode caricato solo quando serve. Titoli e nomi in cinese, giapponese e coreano leggibili con il font WenQuanYi Micro Hei (Apache 2.0), anch'esso caricato solo quando serve.
- Interfaccia: sezione «Controllo del dato» con un solo nome; avvisi, nomi dei file e menu dei canali leggibili sugli schermi stretti; riepilogo di Esporta intero a 720 px. Progetti: le voci della libreria non si duplicano più a ogni riapertura; un progetto integro con spettri illeggibili non viene più detto danneggiato.
- Rilascio: pagina con il file da scaricare in cima e le istruzioni per Edge, SmartScreen, Smart App Control e Avast/AVG; .deb delle versioni di prova ordinati prima della stabile; licenze anche in .txt.

## 2.2.0-rc.4

Versione di prova (release candidate) della 2.2.0, con le stesse novità elencate sotto e le correzioni del ciclo di collaudo 25. È una pre-release: non viene proposta agli utenti come aggiornamento ed esce senza il pacchetto .deb.

## 2.2.0

- Acchiappaspettri Desktop per Windows, macOS e Linux: funziona senza internet e avvisa quando esce una nuova versione.
- Nuovo formato di progetto .acchspettri: dati originali, lavoro fatto e risultati in un solo file, controllato a ogni apertura.
- Interfaccia completa anche in inglese, tema scuro, risorse tutte incluse per funzionare offline.
- XRF: corrette le energie Kβ dalle tabelle FP per Z ≥ 50 (Ba e Sb risultavano molto sottostimati); uno standard incompleto ora viene ignorato con un avviso. HPLC: piatti teorici corretti sui picchi larghi, S/N secondo la farmacopea (2H/h). EPR: doppio integrale non più alterato dalla deriva del fondo. DSC: unità del tempo non dichiarata riconosciuta dalla velocità plausibile. Dettagli in docs/SCIENZA.md.
- App desktop con un proprio spazio di lavoro: menu nativi, barra strumenti, documenti (grafico, foglio dati, più campioni), risultati sotto il grafico, proprietà a destra, barra di stato con la catena di elaborazione. La pagina online resta guidata.
- Importazione: avviso per righe non lette e separatori delle migliaia. JCAMP con asse in Hz convertito in ppm con la frequenza di osservazione.
- Asse X con scala e spostamento per spettro (riferimento NMR, frequenze calcolate), riportati nei metodi; etichette degli assi per spettro.
- Avvisi nuovi: LOD maggiore degli standard più bassi, segnali sotto la soglia, colonne ignorate, elementi considerati e righe sovrapposte nelle concentrazioni FP.
- Versione online più leggera: le funzioni di studio (tarature, PCA, miscele, composizione XRF, falsi colori) si aprono con «Mostra qui»; picchi e assegnazioni identici al desktop.
- Ipotesi più prudenti: una banda o una riga sola è inconclusiva; righe XRF coincidenti dichiarate non distinguibili; bande condivise dichiarate; «Accetta i suggerimenti» non cambia l'esito; nessun elemento proposto se l'asse XRF è spostato.
- Sicurezza: jsPDF aggiornato dalla 2.5.1 alla 4.2.1 (corregge vulnerabilità note, tra cui due critiche); PDF identici a prima, provati anche con titoli e progetti ostili.
- HPLC con più canali: canale riconosciuto dal nome del file (DAD, VWD, FLD, UV_VIS, Ch1, Sig=254, «254 nm»); in «Più campioni» la taratura usa un canale alla volta, con avviso se i canali sono misti; canale nel PDF e nel CSV. Libreria dei nomi: eliminazione con conferma, voci con lo stesso codice unite. Empower .arw accettato.
- Tarature: rette pesate 1/x e 1/x², ruoli standard, bianco e controllo con recupero, stato di ogni stima (estrapolato, < LOD, < LOQ, cima tagliata, coeluito, bordi, picco spostato, normalizzato, unità mancante) anche nel CSV e nel PDF.
- XRF senza standard: ogni stima etichettata come non validata, condizioni nei file esportati, filtro primario, intervallo di sensibilità alle ipotesi.
- Importazione: blocchi di dati riconosciuti (tabelle escluse, pause unite), celle vuote, colonna Y scelta dal nome, CSV con virgolette, canali XRF illeggibili, memoria legata all'impronta del file.
- Tracciabilità: `tracciabilita.csv` in ogni cartella esportata; elaborazione per singolo spettro; dati calcolati dichiarabili; copia di recupero locale.
- Sicurezza: un progetto non può più eseguire codice nella pagina; «Sobrio» non scarta più gli spettri.
- Andamento: in «Più campioni» la misura di banda si può seguire nel tempo o con la dose (x con la sua unità, pendenza solo descrittiva, pagina «Andamento» nel PDF); ricette «Quanto è degradato?» (indice di carbonile) e «Quanto è ingiallito?» (assorbanza a 420 nm). La bozza dei metodi descrive le misure di banda.
- HPLC: profilo di ogni campione confrontato con quello degli standard (coda, coeluito o impurezza); avviso di spalla senza falsi allarmi sulle code; cime sature riconosciute; derive della linea di base ai bordi della zona.
- Riconoscimento della tecnica dalle intestazioni: tempo in minuti con il segnale del rivelatore (HPLC anche se non parte da 0), massa in percentuale (TGA), tempo e temperatura (da scegliere), colonna «B (%)» del gradiente non scambiata per campo EPR.
- Numeri scritti a mano controllati: un solo separatore decimale; migliaia, spazi, testo e valori ambigui («1.000») rifiutati con un avviso, mai troncati. Limiti di banda fuori dall'asse rifiutati.
- Problemi gravi sul dato (⛔) visibili sotto il grafico, nella barra di stato e accanto al nome; avvisi della barra di stato colorati.
- Correzioni fatte prima dell'uscita, dopo le prove sulle versioni di prova:
  - HPLC: il canale viene dal blocco o dalla colonna letti davvero, e l'avviso dice quale canale è stato letto; i file senza canale riconoscibile sono nominati e si assegnano a mano; «DAD1A», «DAD1A_254nm» e «DAD1 A, Sig=254» sono lo stesso canale; i file con lo stesso nome (cartelle .D) mostrano la cartella.
  - Importazione: due blocchi di dati senza testo in mezzo (riga vuota, oppure l'asse che riparte) non vengono più uniti: si legge un blocco e l'altro è segnalato.
  - Avvisi: vince il più grave e un ⛔ non viene mai coperto; si chiudono con × o Esc; nel desktop la nota di importazione mostra ⛔ e ⚠, e il ⛔ resta nella barra di stato.
  - EPR: ⛔ se agli estremi dello spettro c'è ancora segnale o se il doppio integrale è negativo; frequenza MWFQ con la virgola decimale; unità del campo non dichiarata dedotta sulla riga più intensa; avviso quando i valori vengono divisi per 10; colonna «Doppio o singolo integrale».
  - Esportazioni: CSV rapidi con il separatore della lingua; nessuna formula di Excel dai titoli; numeri senza separatore delle migliaia in parametri_per_tecnica.csv; nel PDF apostrofi, virgolette, €, •, ‰, ², ³ corretti e titolo intero nei metadati.
  - FTIR in trasmittanza 0–1: nessun indice sbagliato, avviso «trasmittanza letta come assorbanza»; un'assorbanza con il fondo alto resta assorbanza (decide il nome della colonna o la forma dello spettro).
  - Interfaccia: nel desktop «Scarica» sempre in vista; le tabelle delle tarature stanno nel pannello; Novità tradotte in inglese anche nel desktop; «> 100,000» con il formato della lingua.
  - XRF: lega d'argento misurata con tubo ad argento stimata correttamente (argento dalla riga Lα, con avviso); con pochi conteggi una riga vale solo oltre il limite di Currie e il rapporto segnale/rumore è realistico; stagno puro non più dichiarato con l'asse spostato; CSV della stima FP con note corrette e tradotte; tabella FP leggibile nel pannello del desktop.
  - Un milione di punti: niente più grafico bianco né errore di sistema.
  - Pubblicazione: gli strumenti dell'AppImage si verificano sempre con l'hash pubblicato da GitHub; la pagina della release dice quale file scaricare e come superare gli avvisi di Windows e macOS.

