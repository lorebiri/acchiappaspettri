# Guida rapida

1. **Carica**: trascina file o cartelle, oppure *File → Aggiungi spettri*. Lo strumento viene riconosciuto da solo; puoi correggerlo.
2. **Controlla**: grafico a sinistra, strumenti a destra. Clic su un picco per il nome, rotellina per lo zoom, clic destro per il menu. *Analisi* contiene il controllo del dato, le ipotesi, la deconvoluzione e i parametri della tecnica.
3. **Scarica** (nell'app desktop **Esporta**): spunti le voci che ti servono e ognuna diventa un file. Vedi [Esportare](#esportare).

⌘K (Ctrl+K) cerca e lancia qualsiasi comando; `?` mostra le scorciatoie.

## Picchi per posizione
Scheda *Picchi* → **Aggiungi picchi per posizione**: scrivi le posizioni nell'unità dell'asse (es. `1086; 712; 282`, oppure una per riga) e premi **+ Aggiungi** (o Ctrl+Invio). Facoltativi: la larghezza FWHM e la forma per tutti, oppure accanto a una posizione (`1500 w=10 lor`, `2400 gauss`). Con **Aggancia al massimo locale più vicino entro…** il picco va sul massimo vero entro la tolleranza; se lì non c'è un massimo resta dove l'hai scritto. Sotto il riquadro leggi come è stato capito il testo. Nella tabella ✎ modifica posizione, larghezza e forma, × toglie il picco, Ctrl+Z annulla. I picchi scritti valgono come gli altri per nomi, aree, deconvoluzione e quantificazione e si salvano nel progetto.

## Rimozione del fondo
Scheda *Ritocca lo spettro* → **Rimozione del fondo** (per il Raman con fluorescenza, ma vale per ogni spettro a picchi in su). Il fondo si toglie dopo raggi cosmici e smoothing e **prima** della ricerca dei picchi, delle aree e della quantificazione: il pannello è nello stesso ordine.
- **Vale per**: tutti gli spettri della tecnica, oppure solo questo spettro.
- **Metodo**: arPLS, ALS, polinomio iterativo (IModPoly o ModPoly), SNIP, rolling ball, inviluppo, retta, **punti di ancoraggio**. I parametri partono dai valori consigliati per lo spettro; i cursori aggiornano il grafico mentre li muovi. *Valori consigliati* li riporta indietro.
- **Mostra sul grafico…**: lo spettro prima della correzione (grigio) e il fondo stimato (arancione tratteggiato), solo nell'anteprima.
- **Punti di ancoraggio**: *Scegli i punti sul grafico* e clic dove c'è solo fondo (un clic vicino a un punto lo toglie; Esc per finire), oppure scrivi le posizioni.
- **Applica a tutti gli spettri caricati** dà a ciascuno lo stesso metodo e gli stessi parametri (DSC, EPR e TGA restano esclusi dai metodi automatici). **↶ Annulla** torna indietro di un passo, **Ripristina l'originale** toglie la correzione. Il file originale non cambia mai.
- Per gli spettri molto puliti (rumore sotto lo 0,2 % del picco) con fluorescenza ripida controlla arPLS con l'anteprima: può restare sotto la fluorescenza; IModPoly o ALS, o un λ più basso, vanno meglio ([VALIDAZIONE.md](VALIDAZIONE.md), R12).

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

## Impostazioni
⚙️: lingua, tema (i grafici restano bianchi come nei file esportati), controllo degli aggiornamenti, versione.

## Leggibilità
Nell'app desktop *Vista → Testo più grande o più piccolo* ingrandisce tutto il testo dell'interfaccia; nel browser si usa lo zoom (Ctrl e + oppure ⌘ e +). Gli avvisi importanti compaiono sotto il grafico e, nell'app desktop, anche nella barra di stato in basso, con ⚠ e in colore; un problema grave sul dato (⛔) compare sotto il grafico e accanto al nome dello spettro.
