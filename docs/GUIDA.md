# Guida rapida

1. **Carica**: trascina file o cartelle, oppure *File → Aggiungi spettri*. Lo strumento viene riconosciuto da solo; puoi correggerlo.
2. **Controlla**: grafico a sinistra, strumenti a destra. Clic su un picco per il nome, rotellina per lo zoom, clic destro per il menu. *Analisi* contiene il controllo del dato, le ipotesi, la deconvoluzione e i parametri della tecnica.
3. **Scarica** (nell'app desktop **Esporta**): spunti le voci che ti servono e ognuna diventa un file. Vedi [Esportare](#esportare).

⌘K (Ctrl+K) cerca e lancia qualsiasi comando; `?` mostra le scorciatoie.

## Esportare
Nella pagina *Esporta* ogni voce ha la sua casella e un nome di file (o di cartella) già proposto, che puoi cambiare:
- PDF del report; immagini PNG e SVG (una per grafico e per ogni confronto); elenco dei picchi in CSV;
- dati elaborati e dati originali, un CSV per spettro; tabelle di analisi (bande, tarature, parametri per tecnica, controllo di qualità, ipotesi, bozza dei metodi con la bibliografia);
- tracciabilità (impronta SHA-256 di ogni file e scelte usate); cartella Excel per Origin; il progetto `.acchspettri`.

In *Spettri inclusi* scegli quali spettri esportare: quelli spuntati, tutti, oppure solo quello aperto.

**App desktop.** Premi **Esporta nella cartella…** e scegli la cartella: i file vanno lì, uno per voce (le voci con più file in una loro sottocartella). Puoi raccoglierli in una sottocartella con il nome del progetto. Il dialogo si apre nell'ultima cartella usata per le esportazioni. Se un file esiste già, l'app chiede se **sostituirlo**, **rinominare** quello nuovo (`_2`, `_3`…) o **saltarlo**; *Annulla* non scrive niente. Alla fine compare l'elenco dei file scritti, quello dei file non scritti con il motivo e il pulsante **Mostra nella cartella** (Esplora risorse, Finder o il gestore dei file).

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
