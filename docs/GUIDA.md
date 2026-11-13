# Guida rapida

1. **Carica**: trascina file o cartelle, oppure *File → Aggiungi spettri*. Lo strumento viene riconosciuto da solo; puoi correggerlo.
2. **Controlla**: grafico a sinistra, strumenti a destra. Clic su un picco per il nome, rotellina per lo zoom, clic destro per il menu. *Analisi* contiene il controllo del dato, le ipotesi, la deconvoluzione e i parametri della tecnica.
3. **Scarica** (nell'app desktop **Esporta**): spunti le voci che ti servono e ognuna diventa un file. Vedi [Esportare](#esportare).

⌘K (Ctrl+K) cerca e lancia qualsiasi comando; `?` mostra le scorciatoie.

## Esportare
Nella pagina *Esporta* ogni voce ha la sua casella e un nome di file (o di cartella) già proposto, che puoi cambiare:
- PDF del report; immagini PNG e SVG (una per grafico e per ogni confronto); elenco dei picchi in CSV;
- dati elaborati e dati originali, un CSV per spettro (i dati originali con i valori e l'ordine delle righe del file, prima di conversioni e tarature); tabelle di analisi (bande, tarature, parametri per tecnica, controllo di qualità, ipotesi, bozza dei metodi con la bibliografia);
- copia identica del file originale di ogni spettro (i byte caricati, con nome ed estensione, anche binari e JCAMP; non disponibile se il progetto non contiene gli originali);
- tracciabilità (impronta SHA-256 di ogni file e scelte usate); cartella Excel per Origin; il progetto `.acchspettri`.

In *Spettri inclusi* scegli quali spettri esportare: quelli spuntati, tutti, oppure solo quello aperto.

**App desktop.** Premi **Esporta nella cartella…** e scegli la cartella: i file vanno lì, uno per voce (le voci con più file in una loro sottocartella). Puoi raccoglierli in una sottocartella con il nome del progetto. Il dialogo si apre nell'ultima cartella usata per le esportazioni. Se un file esiste già, l'app chiede, file per file, se **sostituirlo**, **rinominare** quello nuovo (`_2`, `_3`…) o **saltarlo**; con **Applica a tutti i file rimanenti** la risposta vale per gli altri; *Annulla* non scrive niente. Alla fine compare l'elenco dei file scritti, quello dei file non scritti con il motivo e il pulsante **Mostra nella cartella** (Esplora risorse, Finder o il gestore dei file).

I nomi sono sempre validi anche su Windows: caratteri come `<>:"/\|?*`, il punto o lo spazio finale e i nomi riservati (CON, PRN, AUX, NUL, COM1–9, LPT1–9) vengono corretti, e l'app lo dice accanto al campo e nel riepilogo. Su Windows un percorso oltre 260 caratteri non viene scritto e il riepilogo lo spiega.

**Nella pagina online** il browser scarica i file uno per uno. Se sono più di 3, l'app propone di raccoglierli in uno ZIP, perché i browser spesso bloccano i download multipli; puoi rifiutare.

**ZIP solo se lo chiedi**: spunta **Raccogli tutto in un file ZIP** (spenta di partenza). Lo ZIP contiene le stesse voci, con gli stessi nomi.

**Una voce sola, al volo**: dal menu del clic destro sul grafico (*questo grafico come PNG o SVG*, *i picchi di questo spettro in CSV*), dal pulsante **CSV dei picchi** nella scheda dei picchi, da ⌘K oppure, nell'app desktop, da *File → Esporta una voce*. Si apre il salvataggio con un solo file.

Le **preimpostazioni** (in fondo alla pagina) ricordano anche le voci scelte, i loro nomi e gli spettri inclusi.

## Progetti
*File → Nuovo / Apri / Salva / Salva con nome / Chiudi progetto* (nella pagina online: 💾 Salva e «Apri un progetto»). Un progetto `.acchspettri` contiene dati originali e lavoro: riaprendolo ritrovi tutto. Se chiudi con modifiche non salvate, l'app chiede. Puoi passarlo a un collega, anche se usa la versione online. Dettagli: [FORMATO-ACCHSPETTRI.md](FORMATO-ACCHSPETTRI.md).

## XRF
- *Analisi → 🏛️ Concentrazioni XRF*: composizione a parametri fondamentali; si sceglie il tipo di campione e si controllano anodo, kV e angoli. I risultati senza standard sono **stime** (vedi [SCIENZA.md](SCIENZA.md)).
- *Più campioni → Composizione*: con standard, empirica o a parametri fondamentali.
- Gli elementi proposti sono ipotesi: controlla le righe e le sovrapposizioni segnalate.

## Serie, MCR-ALS e cinetica globale
*Analisi → Più campioni → Serie, MCR-ALS e cinetica globale*: spettri misurati nel tempo, con la dose o con la temperatura (cinetiche UV-Vis o IR, spettri DAD, titolazioni, degradazioni).

**Quando usare che cosa**
- **Serie** (sempre il primo passo): scegli la tecnica e gli spettri; l'asse viene proposto dai metadati (data e ora di acquisizione) o dal nome dei file (`t=30s`, `2 h`, `5 Gy`, `T25C`). **Controllalo sempre**: unità sbagliate danno costanti sbagliate. Gli spettri vanno su un asse comune (quello del primo, con interpolazione lineare se serve) e la serie diventa uno spettro del progetto, salvato con il progetto.
- **MCR-ALS**: quando **non conosci il meccanismo** né gli spettri puri, per esempio in una miscela che cambia, in un picco cromatografico con coeluizione o in una degradazione con intermedi. Ricava profili di concentrazione e spettri puri solo dai dati. Il numero di componenti lo scegli dal grafico dei valori singolari: quelli sopra il «gomito» sono segnale. La mancanza di adattamento va confrontata con quella della PCA con le stesse componenti, che è il minimo possibile.
- **Cinetica globale**: quando hai **un modello di reazione** (A → B, A → B → C, A ⇌ B, ordine 0 o 2, decadimenti paralleli) e vuoi le costanti con la loro incertezza. Usa tutte le lunghezze d'onda insieme e restituisce le costanti con errore standard, IC 95% e correlazioni, gli spettri associati alle specie (SAS) e i residui. *Confronta i modelli* li ordina con AIC e BIC (più basso è meglio) e fa il test F fra modelli annidati.
- I due metodi si aiutano: MCR-ALS per capire quante specie ci sono e come sono fatte, poi la cinetica per le costanti.

**Ambiguità rotazionale (MCR-ALS).** In generale la soluzione **non è unica**: altre coppie di profili e spettri, anche loro positive, riproducono i dati altrettanto bene. L'app lo scrive sempre.
- Si restringe con vincoli che siano veri per il tuo sistema: non negatività, chiusura (somma costante, per esempio un bilancio di massa), unimodalità (un solo massimo, come i picchi cromatografici), spettri noti (uno standard misurato). Nessun vincolo si applica da solo.
- *Intervalli MCR-BANDS* misura quanto la soluzione può cambiare. Per ogni componente dà il contributo minimo e massimo compatibile con gli stessi vincoli. Con una banda stretta (sotto 0,01) la soluzione è praticamente unica; con una banda larga i profili mostrati sono solo una delle soluzioni possibili, e non vanno letti come concentrazioni vere. È un'ottimizzazione locale: la banda vera può essere più larga.

**Scambio k₁ ↔ k₂ (A → B → C).** Con spettri liberi, le soluzioni (k₁, k₂) e (k₂, k₁) descrivono i dati **esattamente allo stesso modo**: cambia solo l'intermedio B. L'app sceglie la soluzione con i SAS meno negativi e mostra anche l'altra. Quale sia quella vera lo dice la chimica, per esempio uno spettro di B atteso o un intermedio che si accumula o no. Se k₁ e k₂ sono quasi uguali le incertezze diventano grandi e l'app avvisa.

**Altri avvisi da non ignorare**
- **A ⇌ B senza costante di equilibrio**: si determina solo k_obs = k_f + k_b. Scrivi K per separarle.
- **Secondo ordine**: il risultato è k' = k[A]₀. Scrivi [A]₀ per avere k.
- **Ordine 0**: se [A] non arriva a zero nell'intervallo dei tempi, k non si determina.
- **Correlazioni sopra 0,95**: i due parametri non si distinguono con questi dati.
- **Pianoro**: un parametro che cresce o cala senza limite non ha un valore. L'app non dà né il numero né l'incertezza. Prova un altro modello o altre k di partenza.
- **Residui con struttura**: residui molto più grandi di quelli della SVD con lo stesso numero di specie vogliono dire che il modello non basta.

**Esportare.** I risultati entrano nella voce *tabelle di analisi*: `mcr_als_….csv`, e `cinetica_globale_….csv` (`global_kinetics_….csv` in inglese). Contengono le impostazioni, gli avvisi, i profili e gli spettri. Nel PDF c'è un riassunto con i grafici. Le impostazioni si salvano nel progetto. Nell'app desktop il calcolo non blocca l'interfaccia anche su serie di 200 × 1000 punti.

## Impostazioni
⚙️: lingua, tema (i grafici restano bianchi come nei file esportati), controllo degli aggiornamenti, versione.

## Leggibilità
Nell'app desktop *Vista → Testo più grande o più piccolo* ingrandisce tutto il testo dell'interfaccia; nel browser si usa lo zoom (Ctrl e + oppure ⌘ e +). Gli avvisi importanti compaiono sotto il grafico e, nell'app desktop, anche nella barra di stato in basso, con ⚠ e in colore; un problema grave sul dato (⛔) compare sotto il grafico e accanto al nome dello spettro.
