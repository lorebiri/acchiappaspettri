# Novità delle versioni

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
- Tarature: rette pesate 1/x e 1/x², ruoli standard, bianco e controllo con recupero, stato di ogni stima (estrapolato, < LOD, < LOQ, cima tagliata, coeluito, bordi, picco spostato, normalizzato, unità mancante) anche nel CSV e nel PDF.
- XRF senza standard: ogni stima etichettata come non validata, condizioni nei file esportati, filtro primario, intervallo di sensibilità alle ipotesi.
- Importazione: blocchi di dati riconosciuti (tabelle escluse, pause unite), celle vuote, colonna Y scelta dal nome, CSV con virgolette, canali XRF illeggibili, memoria legata all'impronta del file.
- Tracciabilità: `tracciabilita.csv` in ogni cartella esportata; elaborazione per singolo spettro; dati calcolati dichiarabili; copia di recupero locale.
- Sicurezza: un progetto non può più eseguire codice nella pagina; «Sobrio» non scarta più gli spettri.
