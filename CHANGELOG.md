# Novità delle versioni

## 2.2.0-rc.3

Versione di prova (release candidate) della 2.2.0, con le stesse novità elencate sotto. Serve a provare la pubblicazione e i pacchetti prima della versione stabile: è una pre-release e non viene proposta agli utenti come aggiornamento.

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
