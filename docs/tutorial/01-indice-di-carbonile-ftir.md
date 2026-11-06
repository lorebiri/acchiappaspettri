# Tutorial 1 · Indice di carbonile da una serie FTIR

**Obiettivo:** da sei spettri FTIR di polietilene invecchiato (da 0 a 1000 ore) ottenere l'indice di carbonile, il grafico dell'andamento nel tempo, un PDF e un file CSV da aprire in Excel.
**Tempo:** circa 10 minuti.
**Serve:** Acchiappaspettri online (nel browser) oppure l'app desktop. Gli stessi passi valgono per entrambe; dove cambiano, è scritto.

> **Dati d'esempio SINTETICI.** I file di `examples/ftir-polietilene-sintetico/` sono stati calcolati al computer da `examples/genera-esempi-sintetici.js`. Non sono misure reali. Lo dicono anche il nome (`…_SINTETICO.csv`) e la prima riga di ogni file.

## Che cosa misura l'indice di carbonile
Quando il polietilene invecchia, si ossida. Nello spettro compare una banda tra 1650 e 1850 cm⁻¹ (gruppi C=O). L'indice di carbonile «SAUB» (Almond e colleghi, 2020) è l'area di questa banda divisa per l'area della banda del polietilene tra 1420 e 1500 cm⁻¹. Più è alto, più il materiale è ossidato. Il metodo è definito per polietilene e polipropilene.

## 1. Carica gli spettri
1. Apri Acchiappaspettri. Alla prima apertura compare il benvenuto: premi **Iniziamo 👻**.
2. Premi **Scegli file** e seleziona i sei file `PE_0000h_SINTETICO.csv` … `PE_1000h_SINTETICO.csv`. Puoi anche trascinarli sulla pagina.
   *App desktop:* premi **Aggiungi spettri** nella barra in alto.
3. Il programma riconosce da solo lo strumento: accanto a ogni nome compare **FTIR**.

## 2. Chiedi l'indice di carbonile
1. A destra del grafico apri la scheda **🔬 Analisi**.
2. Nel riquadro «Cosa vuoi fare con questo spettro FTIR / ATR-FTIR?» premi **📉 Quanto è degradato?**.
   *App desktop:* la scheda si chiama **Analisi** e la voce **Quanto è degradato?** è un collegamento.

![La scheda Analisi con il pulsante «Quanto è degradato?»](img/t1-it-1-analisi.png)

Il programma imposta da solo le due zone dell'indice (1650–1850 e 1420–1500 cm⁻¹) e misura tutti e sei gli spettri. Compare una tabella con una riga per spettro e la colonna **rapporto area**: è l'indice di carbonile.

## 3. Scrivi le ore di invecchiamento
Il programma non sa quante ore corrispondono a ogni file: devi scriverlo tu.

1. **Solo nella versione online:** sotto la tabella c'è il riquadro «Tarature, PCA, miscele, composizione XRF e falsi colori sono per il lavoro di studio». Premi **Mostra qui**. Senza questo passo la colonna per le ore non compare.

   ![La tabella dell'indice e il pulsante «Mostra qui» nella versione online](img/t1-it-2-misura.png)

2. Nella colonna **Valore di x** scrivi le ore, nell'ordine dei file: `0`, `100`, `250`, `500`, `750`, `1000`. Dopo ogni numero premi **Invio**: passi alla riga sotto.
   Nella versione online la tabella è più larga del riquadro: se non vedi la colonna, scorri la tabella verso destra.
3. Nella casella **Unità di x** (sopra la tabella) scrivi `h`.
4. Sotto la tabella compare il grafico dell'andamento, con la pendenza.

![Ore scritte e grafico dell'andamento (app desktop)](img/t1-it-3-andamento-desktop.png)

## 4. Leggi il risultato
Con i file d'esempio devi ottenere questi valori (provati più volte, online e desktop, con risultati identici):

| File | Ore | Indice di carbonile |
|---|---|---|
| PE_0000h | 0 | −0,0029 ⚠️ area negativa o nulla |
| PE_0100h | 100 | 0,0199 ⚠️ bordi della zona lontani dalla linea di base |
| PE_0250h | 250 | 0,105 |
| PE_0500h | 500 | 0,289 |
| PE_0750h | 750 | 0,551 |
| PE_1000h | 1000 | 0,842 |

Pendenza: 8,52e-4 ± 6,9e-5 per h, R² 0,975.

Come leggerli:
- **Gli avvisi ⚠️ sono normali qui.** A 0 ore il campione non è ossidato: la banda non c'è e l'area è circa zero. A 100 ore la banda è appena sopra il rumore. Il programma lo dice invece di dare un numero sicuro.
- **La pendenza è solo descrittiva.** Il programma lo scrive: «l'andamento può non essere lineare». Qui l'ossidazione accelera dopo le prime centinaia di ore, quindi la retta non descrive bene i punti. Non usarla come modello di degradazione.

## 5. Scarica il PDF e il CSV per Excel
1. Premi **Tutto ok, vai a scaricare** (in basso a destra).
   *App desktop:* premi **Esporta** nella barra in alto.
2. In «Lingua dei grafici» lascia **🇮🇹 Italiano**.
3. Le scelte già spuntate vanno bene. Premi **⬇️ Scarica tutto in un file ZIP**.

![La pagina «Cosa vuoi scaricare?»](img/t1-it-4-scarica.png)

Nel file ZIP trovi:
- `Report_spettri_….pdf`: i grafici e, nell'ultima pagina, «Andamento · FTIR / ATR-FTIR» con il grafico e i valori;
- `analisi/misure_bande_ftir.csv`: la tabella dell'indice con le ore, da aprire in Excel (separatore punto e virgola, decimali con la virgola);
- `analisi/metodi_e_bibliografia.txt`: una bozza del paragrafo «Metodi» con la citazione del metodo SAUB;
- le immagini PNG di ogni spettro e l'elenco dei picchi.

![L'ultima pagina del PDF: andamento dell'indice di carbonile](img/t1-it-5-pdf.png)

**Più veloce, solo il CSV:** il pulsante **⬇️ CSV** accanto alla tabella dell'indice scarica subito `misure_ftir.csv`, con gli stessi numeri.

**Attenzione:** gli avvisi ⚠️ della tabella (per esempio «area negativa o nulla») **non** compaiono nel CSV né nel PDF. Annotali tu prima di usare i numeri.

## Se qualcosa non va
- **Non vedi la colonna «Valore di x»:** nella versione online premi **Mostra qui**; poi scorri la tabella verso destra.
- **Il pulsante «Quanto è degradato?» non c'è:** compare solo per gli spettri riconosciuti come FTIR.
- **I tuoi spettri sono in trasmittanza:** l'indice va calcolato in assorbanza. Apri la scheda **🧪 Ritocca lo spettro** e in **Asse Y** scegli **Assorbanza**. La scelta vale per tutti gli spettri FTIR caricati; i file originali non cambiano.
