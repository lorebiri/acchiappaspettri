// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Testi dell'app desktop: tono sobrio da software scientifico, senza mascotte, emoji, esclamazioni o battute.
   La pagina online resta com'è: qui non succede nulla se window.ACCH_SHELL è falso.
   Si carica dopo i18n/en.js e prima di app/i18n.js: aggiunge al dizionario le traduzioni dei testi del desktop.
   Uso: i punti di uscita dei messaggi (loader, say, toast, status, choice, Novità, barra di stato) passano da ACCH_DESK.pro();
   i testi fissi della pagina passano da ACCH_DESK.dom(), una volta all'avvio e poi a ogni modifica del DOM. */
(function(win){
  'use strict';
  if (!win.ACCH_SHELL) return;

  /* [originale (IT, senza emoji), testo del desktop IT, testo del desktop EN] */
  const TESTI=[
    // caricamento (loader)
    ['Gino sta acchiappando i file…', 'Caricamento dei file…', 'Loading files…'],
    ['Gino sta acchiappando il file…', 'Caricamento del file…', 'Loading file…'],
    ['Gino sta guardando cosa hai trascinato…', 'Lettura degli elementi trascinati…', 'Reading the dropped items…'],
    ['Gino sta salvando il progetto…', 'Salvataggio del progetto…', 'Saving project…'],
    ['Gino sta aprendo il progetto…', 'Apertura del progetto…', 'Opening project…'],
    ['Preparo i grafici…', 'Preparazione dei grafici…', 'Preparing plots…'],
    // messaggi dopo il caricamento e durante il lavoro
    ['Questo ce l\'ho già! Prova con un altro file.', 'File già caricato.', 'File already loaded.'],
    ['Ho ricevuto una foto: ti chiedo cosa farne.', 'Immagine ricevuta: scegli come usarla.', 'Image received: choose how to use it.'],
    ['Mmm, non mi è arrivato nessun file. Riprova o usa «Scegli file».', 'Nessun file ricevuto. Riprova o usa «Scegli file».', 'No files received. Try again or use «Choose files».'],
    ['Ops, con questo non ci riesco… Guarda il messaggio qui sotto.', 'Impossibile leggere il file: vedi il messaggio.', 'The file could not be read: see the message.'],
    ['Lascialo qui, lo acchiappo al volo!', 'Rilascia per caricare.', 'Drop to load.'],
    ['Lo sto acchiappando…', 'Caricamento…', 'Loading…'],
    ['Scegli la cartella… poi aspettami un attimo!', 'Scegli la cartella…', 'Choose the folder…'],
    ['Nessun file scelto? Nessun problema, sono qui.', 'Nessun file scelto.', 'No file chosen.'],
    ['Ok, niente file per ora.', 'Nessun file scelto.', 'No file chosen.'],
    ['Tutti gli spettri liberati! Carica quello che vuoi.', 'Elenco degli spettri svuotato.', 'Spectrum list cleared.'],
    ['Ok, ti propongo nomi di ogni tipo.', 'Nomi suggeriti per ogni tipo di campione.', 'Names suggested for all sample types.'],
    ['Ultimo passo! Spunta cosa vuoi ricevere, poi premi il pulsante blu.', 'Scegli i contenuti da esportare, poi premi «Esporta».', 'Select the content to export, then press «Export».'],
    ['Nuovo confronto creato: ora spunta gli spettri a sinistra.', 'Nuovo confronto creato: seleziona gli spettri nel pannello a sinistra.', 'New comparison created: select the spectra in the left panel.'],
    ['Non c\'era niente di nuovo da confrontare: servono almeno 2 spettri dello stesso strumento.', 'Nessun nuovo confronto: servono almeno 2 spettri della stessa tecnica.', 'No new comparison: at least 2 spectra of the same technique are needed.'],
    ['Ecco il confronto! Spunta o togli spettri a sinistra, scegli come sovrapporli qui sotto.', 'Confronto aperto: seleziona gli spettri nel pannello a sinistra e scegli come sovrapporli.', 'Comparison open: select the spectra in the left panel and choose how to overlay them.'],
    ['Ecco il confronto in grande! Rotellina per zoomare, trascina per spostarti. Esc per uscire.', 'Confronto a tutto schermo: rotellina per lo zoom, trascina per spostare, Esc per uscire.', 'Comparison in full view: wheel to zoom, drag to pan, Esc to exit.'],
    ['Ecco il grafico in grande! Rotellina per zoomare, clic su un picco per il nome, clic in un punto vuoto per aggiungerne uno. Esc per uscire.', 'Grafico a tutto schermo: rotellina per lo zoom, clic su un picco per il nome, clic in un punto vuoto per aggiungere un picco, Esc per uscire.', 'Plot in full view: wheel to zoom, click a peak to name it, click an empty point to add a peak, Esc to exit.'],
    ['Grafici in italiano, perfetto!', 'Testi dei grafici in italiano.', 'Plot labels in Italian.'],
    ['Plots in English, coming right up!', 'Testi dei grafici in inglese.', 'Plot labels in English.'],
    ['Ok, lascio solo i numeri.', 'Nessun nome assegnato: restano le posizioni.', 'No names assigned: positions only.'],
    ['Fatto! Il riquadro ingrandito è nel grafico e finirà anche nel PDF e nelle immagini.', 'Riquadro ingrandito aggiunto al grafico, al PDF e alle immagini.', 'Zoomed inset added to the plot, the PDF and the images.'],
    ['Fatto! Spostamento di', 'Spostamento di', 'Shift of'],
    ['Ecco la zona ingrandita! Con «Metti l\'ingrandimento nel grafico» la trovi anche nel PDF e nelle immagini. «↺ Tutto» per tornare indietro.', 'Zona ingrandita. Con «Metti l\'ingrandimento nel grafico» compare anche nel PDF e nelle immagini; «Tutto» torna alla vista intera.', 'Zoomed region. «Put the zoom in the plot» also adds it to the PDF and the images; «All» returns to the full view.'],
    ['Annullato!', 'Annullato.', 'Undone.'],
    ['Impostazioni importate!', 'Impostazioni importate.', 'Settings imported.'],
    ['Mmm, quel file non lo capisco.', 'File di impostazioni non riconosciuto.', 'Settings file not recognised.'],
    ['Tutto come appena installato.', 'Impostazioni predefinite ripristinate.', 'Default settings restored.'],
    ['Questo comando qui non si può usare.', 'Comando non disponibile in questa vista.', 'Command not available in this view.'],
    // esportazione
    ['Al lavoro! Ci vuole un attimo…', 'Esportazione in corso…', 'Exporting…'],
    ['Spettri acchiappati e impaginati!', 'Esportazione completata.', 'Export completed.'],
    ['Tutto pronto, buona analisi!', 'Esportazione completata.', 'Export completed.'],
    ['Missione compiuta, nessuno spettro è sfuggito!', 'Esportazione completata.', 'Export completed.'],
    ['Fatto! Se nella cartella Download manca un file, il browser l\'ha bloccato: scaricalo qui sotto con un clic.', 'Esportazione completata: file salvati.', 'Export completed: files saved.'],
    ['Fatto! Trovi il file nella cartella Download (o qui sotto).', 'Esportazione completata: file salvato.', 'Export completed: file saved.'],
    ['Ops… riproviamo?', 'Esportazione non riuscita.', 'Export failed.'],
    ['Non riesco a caricare le librerie per PDF/ZIP: controlla la connessione e ricarica la pagina.', 'Componenti per PDF e ZIP non disponibili: riavvia l\'applicazione.', 'PDF and ZIP components unavailable: restart the application.'],
    ['Cosa vuoi scaricare?', 'Contenuto da esportare', 'Content to export'],
    ['Scarica', 'Esporta', 'Export'],
    ['Passo 3 · Scarica', 'Esporta', 'Export'],
    ['Scarica tutto in un file ZIP', 'Esporta tutto in un file ZIP', 'Export everything to one ZIP file'],
    ['consigliato: i browser a volte bloccano due download di fila', 'consigliato quando i file sono più di uno', 'recommended when there is more than one file'],
    ['File pronti', 'File prodotti', 'Files produced'],
    ['se il browser ne ha bloccato uno, scaricalo da qui con un clic', 'fai clic su un file per salvarne un\'altra copia', 'click a file to save another copy'],
    ['Spunta almeno una cosa da scaricare', 'Seleziona almeno un contenuto da esportare', 'Select at least one item to export'],
    ['Tutto ok, vai a scaricare', 'Controlli superati: puoi esportare', 'Checks passed: you can export'],
    ['vai a scaricare', 'vai a Esporta', 'go to Export'],
    ['Scarica adesso (PDF, immagini, risultati)', 'Esporta ora (PDF, immagini, risultati)', 'Export now (PDF, images, results)'],
    ['Scarica questo grafico (PNG)', 'Esporta questo grafico (PNG)', 'Export this plot (PNG)'],
    ['Scarica questo grafico (SVG)', 'Esporta questo grafico (SVG)', 'Export this plot (SVG)'],
    ['Scarica i picchi di questo spettro (CSV)', 'Esporta i picchi di questo spettro (CSV)', 'Export the peaks of this spectrum (CSV)'],
    ['CSV dei picchi', 'Esporta i picchi (CSV)', 'Export peaks (CSV)'],
    ['Un file CSV con i picchi di questo spettro', 'Un file CSV con i picchi di questo spettro', 'A CSV file with the peaks of this spectrum'],
    ['Scarica l\'immagine (PNG)', 'Esporta l\'immagine (PNG)', 'Export the image (PNG)'],
    ['Quando sei contento, vai a scaricare PDF, immagini e risultati. Buon lavoro!', 'Al termine, esporta PDF, immagini e risultati.', 'When finished, export PDF, images and results.'],
    // esportazione per voci in una cartella (requisito «esporta» della 3.0.0)
    ['Esporta nella cartella…', 'Esporta nella cartella…', 'Export to folder…'],
    ['Scegli la cartella di destinazione', 'Scegli la cartella di destinazione', 'Choose the destination folder'],
    ['Raccogli tutto in un file ZIP', 'Raccogli tutto in un file ZIP', 'Collect everything in one ZIP file'],
    ['In una sottocartella', 'In una sottocartella', 'In a subfolder'],
    ['Mostra nella cartella', 'Mostra nella cartella', 'Show in folder'],
    ['File non scritti', 'File non scritti', 'Files not written'],
    ['File già presenti, lasciati com\'erano', 'File già presenti, lasciati invariati', 'Files already present, left unchanged'],
    ['Nessun file scritto: i file erano già presenti.', 'Nessun file scritto: i file erano già presenti.', 'No files written: the files were already present.'],
    ['Impossibile aprire la cartella.', 'Impossibile aprire la cartella.', 'The folder could not be opened.'],
    ['Nome di file non valido.', 'Nome di file non valido.', 'Invalid file name.'],
    ['Salta', 'Salta', 'Skip'],
    ['Rinomina', 'Rinomina', 'Rename'],
    ['Sostituisci', 'Sostituisci', 'Replace'],
    ['Esporta una voce', 'Esporta una voce', 'Export one item'],
    ['Questo grafico come PNG…', 'Questo grafico come PNG…', 'This plot as PNG…'],
    ['Questo grafico come SVG…', 'Questo grafico come SVG…', 'This plot as SVG…'],
    ['Picchi di questo spettro come CSV…', 'Picchi di questo spettro come CSV…', 'Peaks of this spectrum as CSV…'],
    ['Report PDF…', 'Report PDF…', 'PDF report…'],
    ['Preparo il progetto…', 'Preparazione del progetto…', 'Preparing the project…'],
    ['Preparo la cartella per Origin…', 'Preparazione del file per Origin…', 'Preparing the file for Origin…'],
    ['Preparo i risultati delle analisi…', 'Preparazione dei risultati delle analisi…', 'Preparing the analysis results…'],
    ['Impacchetto lo ZIP…', 'Creazione del file ZIP…', 'Creating the ZIP file…'],
    ['Spazio del browser esaurito: elimina qualche riferimento o esportali in un file.', 'Spazio di archiviazione esaurito: elimina qualche riferimento o esportali in un file.', 'Storage full: delete some references or export them to a file.'],
    // progetto
    ['Non c\'è ancora niente da salvare: carica qualche spettro.', 'Nessun contenuto da salvare: carica almeno uno spettro.', 'Nothing to save: load at least one spectrum.'],
    ['Sto già salvando il progetto: un momento…', 'Salvataggio del progetto già in corso.', 'The project is already being saved.'],
    ['Non sono riuscito a completare l\'operazione sul progetto. I tuoi dati non sono stati toccati.', 'Operazione sul progetto non completata. I dati non sono stati modificati.', 'The project operation was not completed. The data were not changed.'],
    ['Un momento: sto finendo un\'operazione sul progetto.', 'Operazione sul progetto in corso: attendi.', 'A project operation is in progress: please wait.'],
    // benvenuto, giro, aiuto
    ['Dai file di testo che esportano gli strumenti del laboratorio a grafici puliti, pronti da consultare, condividere e mettere in tesi e articoli. In pochi secondi, senza installare nulla.', 'Dai file esportati dagli strumenti di laboratorio a grafici, tabelle e relazioni pronti per tesi e pubblicazioni.', 'From instrument export files to plots, tables and reports ready for theses and publications.'],
    ['trascina i file o una cartella intera: riconosco da solo lo strumento', 'file singoli o cartelle intere; la tecnica è riconosciuta automaticamente', 'single files or whole folders; the technique is recognised automatically'],
    ['picchi trovati in automatico; il nome lo metto solo se lo approvi', 'ricerca automatica dei picchi; le assegnazioni proposte si applicano solo dopo conferma', 'automatic peak detection; proposed assignments are applied only after confirmation'],
    ['tutto avviene nel tuo browser: i dati non lasciano mai il tuo computer', 'elaborazione locale: i dati non lasciano il computer', 'local processing: the data never leave the computer'],
    ['Acchiappaspettri · tutto avviene nel tuo browser, nessun dato lascia il tuo computer', 'Acchiappaspettri · elaborazione locale, nessun dato lascia il computer', 'Acchiappaspettri · local processing, no data leaves the computer'],
    ['Iniziamo', 'Inizia', 'Start'],
    ['Giro guidato', 'Guida rapida', 'Quick guide'],
    ['Ciao! Dammi i tuoi spettri, ci penso io ai grafici.', '', ''],
    ['Controlla i grafici uno per uno. Sotto al grafico trovi gli strumenti, divisi per cosa vuoi fare.', 'Controlla i grafici uno per uno.', 'Check the plots one by one.'],
    ['Ultimo passo! Spunta cosa vuoi ricevere, poi premi il pulsante blu.', 'Scegli i contenuti da esportare, poi premi «Esporta».', 'Select the content to export, then press «Export».'],
    ['Scarica Acchiappaspettri Desktop', 'Versioni di Acchiappaspettri', 'Acchiappaspettri releases'],
    ['Scarica la versione desktop', 'Pagina delle versioni', 'Releases page']
  ];
  /* testi con numeri o nomi: espressione sull'originale IT (senza emoji), modello IT, modello EN. I modelli EN vanno anche nel dizionario. */
  const MODELLI=[
    [/^Gino sta acchiappando (\d+) file…$/, 'Caricamento di {0} file…', 'Loading {0} files…'],
    [/^(\d+) spettri acchiappati$/, '{0} spettri caricati', '{0} spectra loaded'],
    [/^Preso! Gino ha fiutato uno spettro (.+?)\. Premi «Vediamo i grafici»\.$/, 'Caricato 1 spettro: {0}.', 'Loaded 1 spectrum: {0}.'],
    [/^Acchiappati (\d+) spettri! Gino è contentissimo: (.+)\.$/, 'Caricati {0} spettri: {1}.', '{0} spectra loaded: {1}.'],
    [/^Ho ricevuto (\d+) foto: ti chiedo cosa farne\.$/, 'Ricevute {0} immagini: scegli come usarle.', '{0} images received: choose how to use them.'],
    [/^Perfetto, userò i nomi per (.+)\.$/, 'Nomi suggeriti per: {0}.', 'Names suggested for: {0}.'],
    [/^Fatto! 1 confronto, uno per strumento\.$/, 'Creato 1 confronto.', '1 comparison created.'],
    [/^Fatto! (\d+) confronti, uno per strumento\.$/, 'Creati {0} confronti, uno per tecnica.', '{0} comparisons created, one per technique.'],
    [/^Fatto! (\d+) nom[ei] sul grafico e su altri (\d+) file\.$/, 'Nomi assegnati: {0} su questo spettro e su altri {1} file.', 'Names assigned: {0} on this spectrum and on {1} other files.'],
    [/^Fatto! (\d+) nom[ei] sul grafico\. Se uno non ti convince, clic sul picco per cambiarlo; Ctrl\+Z annulla tutto\.$/, 'Nomi assegnati: {0}. Per cambiarne uno fai clic sul picco; Ctrl+Z annulla.', 'Names assigned: {0}. Click a peak to change its name; Ctrl+Z undoes.'],
    [/^Fatto! (\d+) nom[ei] sul grafico\.$/, 'Nomi assegnati: {0}.', 'Names assigned: {0}.'],
    [/^Fatto! Stesso intervallo su (\d+) file (.+)\.$/, 'Stesso intervallo applicato a {0} file {1}.', 'Same range applied to {0} {1} files.'],
    [/^Fatto! (\d+) spettri rinominati\. Se non ti piace: «Rinomina in blocco» → «↶ Annulla l'ultima rinomina»\.$/, '{0} spettri rinominati. Per annullare: «Rinomina in blocco» → «Annulla l\'ultima rinomina».', '{0} spectra renamed. To undo: «Bulk rename» → «Undo last rename».'],
    [/^«(.+)» aggiunto alla tua libreria!$/, '«{0}» aggiunto alla libreria.', '«{0}» added to the library.'],
    [/^Preparo i file: spettro (\d+) di (\d+)…$/, 'Preparazione dei file: spettro {0} di {1}…', 'Preparing the files: spectrum {0} of {1}…'],
    [/^Preparo lo ZIP: spettro (\d+) di (\d+)…$/, 'Creazione del file ZIP: spettro {0} di {1}…', 'Creating the ZIP file: spectrum {0} of {1}…'],
    [/^Esportazione completata: (.+) in «(.+)»\.$/, 'Esportazione completata: {0} in «{1}».', 'Export completed: {0} in «{1}».'],
    [/^Esportazione incompleta: (.+)\.$/, 'Esportazione incompleta: {0}.', 'Export incomplete: {0}.'],
    [/^Nella cartella «(.+)» esiste già un file con lo stesso nome: (.+)\.$/, 'Nella cartella «{0}» esiste già un file con lo stesso nome: {1}.', 'The folder «{0}» already contains a file with the same name: {1}.'],
    [/^Nella cartella «(.+)» esistono già (\d+) file con lo stesso nome: (.+)\.$/, 'Nella cartella «{0}» esistono già {1} file con lo stesso nome: {2}.', 'The folder «{0}» already contains {1} files with the same names: {2}.'],
    [/^Qualcosa è andato storto: ([\s\S]*)$/, 'Esportazione non riuscita: {0}', 'Export failed: {0}'],
    [/^Progetto salvato: (\d+) spettri e tutto il lavoro, nel file «(.+)»\.$/, 'Progetto salvato in «{1}»: {0} spettri.', 'Project saved to «{1}»: {0} spectra.'],
    [/^Novità di Acchiappaspettri (\S+)$/, 'Novità di Acchiappaspettri {0}', 'What\'s new in Acchiappaspettri {0}'],
    [/^Versione (\S+) · (.+)\. Ecco cosa c'è di nuovo:$/, 'Versione {0} · {1}', 'Version {0} · {1}'],
    [/^Dall'ultima volta che sei passato sono uscite (\d+) versioni\. Ecco cosa è cambiato:$/, 'Versioni pubblicate dall\'ultimo avvio: {0}.', 'Versions released since the last start: {0}.']
  ];

  /* Novità del desktop, scritte per il desktop. Le versioni che non sono qui usano quelle online ripulite (vedi novita()). */
  const ICON='<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M1.5 13.5h13M3 13.5C5.5 13.5 6 3 8 3s2.5 10.5 5 10.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
  const NOVITA={
    '3.0':[
      ['Dialoghi di sistema', 'Tutte le scelte di file usano i dialoghi del sistema, aperti nell\'ultima cartella usata; trascinamento nativo di file e cartelle.', 'System dialogs', 'All file choices use the system dialogs, opened in the last folder used; native drag and drop of files and folders.'],
      ['Interfaccia professionale', 'Testi sobri, senza simboli decorativi; la finestra compare già pronta.', 'Professional interface', 'Sober wording without decorative symbols; the window appears ready.'],
      ['Controllo dei dati', 'Separatore delle migliaia riconosciuto anche con valori oltre 1000; assi che tornano indietro letti come blocchi separati; nuovi avvisi HPLC.', 'Data checks', 'Thousands separator recognised also with values above 1000; axes turning back read as separate blocks; new HPLC warnings.'],
      ['Analisi', 'Zone di fondo scelte per il doppio integrale EPR, con la provenienza nei risultati; avvisi su picchi negativi NMR e su As/Pb in XRF; PDF con simboli leggibili.', 'Analysis', 'User-chosen background zones for the EPR double integral, with the source in the results; warnings for negative NMR peaks and As/Pb in XRF; PDF with readable symbols.'],
    ],
    '2.2':[
      ['Applicazione desktop', 'Applicazione per Windows, macOS e Linux: funziona senza connessione e installa gli aggiornamenti firmati solo dopo conferma.', 'Desktop application', 'Application for Windows, macOS and Linux: it works offline and installs signed updates only after confirmation.'],
      ['Controllo dei dati importati', 'Segnalazione di righe non lette, separatori delle migliaia e tabelle dopo i dati. In «Dati» si sceglie la colonna Y, si trasforma l\'asse X con scala e spostamento e si modificano le etichette degli assi.', 'Checks on imported data', 'Unread rows, thousands separators and tables after the data are reported. In «Data» you can choose the Y column, transform the X axis with scale and offset, and edit the axis labels.', ()=>{ if (files.length){ go(2); openTab('zone'); } }],
      ['Risultati dichiarati', 'Un\'ipotesi basata su una sola banda è dichiarata inconclusiva. Le composizioni XRF senza standard sono indicate come stime, con le condizioni nel file esportato e la sensibilità alle ipotesi. Si può dichiarare il filtro primario.', 'Declared results', 'A hypothesis based on a single band is declared inconclusive. Standardless XRF compositions are labelled as estimates, with the conditions in the exported file and the sensitivity to the assumptions. The primary filter can be declared.'],
      ['Canali HPLC', 'Il canale (DAD, VWD, FLD…) è riconosciuto dal nome del file. In «Più campioni» la taratura usa un canale alla volta; i canali misti sono segnalati. Il canale è riportato nel PDF e nel CSV.', 'HPLC channels', 'The channel (DAD, VWD, FLD…) is recognised from the file name. In «Multiple samples» the calibration uses one channel at a time; mixed channels are reported. The channel is shown in the PDF and the CSV.'],
      ['Tarature e tracciabilità', 'Rette pesate 1/x e 1/x²; avvisi per picchi tagliati, cime piatte e aree negative. Ogni esportazione contiene l\'impronta di ogni spettro e le elaborazioni usate. Il lavoro non salvato viene copiato in locale e recuperato dopo un arresto.', 'Calibrations and traceability', 'Weighted 1/x and 1/x² fits; warnings for clipped peaks, flat tops and negative areas. Every export contains the fingerprint of each spectrum and the processing used. Unsaved work is copied locally and recovered after a crash.'],
      ['Progetti .acchspettri', 'Un solo file con i dati originali, il lavoro svolto e le tabelle dei risultati, verificato a ogni apertura. I file .acchiappa.json si aprono ancora.', '.acchspettri projects', 'A single file with the original data, the work done and the result tables, verified at every opening. .acchiappa.json files can still be opened.'],
      ['Italiano e inglese', 'Interfaccia completa in italiano e in inglese; la lingua si sceglie nelle Impostazioni.', 'Italian and English', 'Full interface in Italian and English; the language is chosen in Settings.', ()=>win.AcchUi.openSettings()],
      ['Tema scuro', 'Tema chiaro, scuro o del sistema nelle Impostazioni. I grafici restano su fondo bianco, come nei file esportati.', 'Dark theme', 'Light, dark or system theme in Settings. Plots stay on a white background, as in the exported files.', ()=>win.AcchUi.openSettings()],
      ['Andamento nel tempo', 'In «Più campioni» si segue una misura di banda nel tempo o con la dose: grafico, pendenza descrittiva e pagina nel PDF.', 'Trend over time', 'In «Multiple samples» a band measurement can be followed over time or dose: plot, descriptive slope and a page in the PDF.'],
      ['Avvisi visibili', 'Un problema grave sul dato compare sotto il grafico e accanto al nome dello spettro. I numeri scritti a mano sono controllati: «1.000» o «2 5» non vengono letti a metà.', 'Visible warnings', 'A serious data problem is shown below the plot and next to the spectrum name. Hand-typed numbers are checked: «1.000» or «2 5» are not read halfway.'],
      ['Nessun collegamento esterno', 'Librerie e caratteri sono inclusi nell\'applicazione: l\'analisi non richiede connessioni. Un progetto non può eseguire codice.', 'No external connections', 'Libraries and fonts are included in the application: the analysis requires no connection. A project cannot run code.']
    ]
  };

  const EP=/[\p{Extended_Pictographic}\uFE0F\u200D]/gu;
  const key=s=>String(s).replace(EP,'').replace(/\s+/g,' ').replace(/« /g,'«').replace(/ »/g,'»').trim();
  const SRC=new Map(), IT=new Map(), EN=new Map(), misses=new Set();
  for (const [o,it,en] of TESTI){ const k=key(o); SRC.set(k,it); IT.set(k,it); EN.set(k,en); EN.set(key(it),en); IT.set(key(en),it); }
  /* il dizionario del traduttore: testi e modelli del desktop. i18n.js lo legge quando si carica, cioè subito dopo questo file */
  const D=win.ACCH_EN||(win.ACCH_EN={});
  for (const [,it,en] of TESTI) if (it && it!==en) D[it]=en;
  for (const [,it,en] of MODELLI) if (it!==en) D[it]=en;
  for (const v in NOVITA) for (const n of NOVITA[v]){ D[n[0]]=n[2]; D[n[1]]=n[3]; }
  const lang=()=>win.AcchI18n ? win.AcchI18n.lang : 'it';
  let enDone=false;   // gli originali già tradotti in inglese (testi della pagina che il traduttore ha cambiato prima di noi)
  function enKeys(){ if (enDone || !win.AcchI18n) return; enDone=true; for (const [o,it,en] of TESTI){ const t=win.AcchI18n.tr(o); if (t && t!==o){ const k=key(t); if (!SRC.has(k)) SRC.set(k,en); EN.set(k,en); IT.set(k,it); } }
    for (const [re,it,en] of MODELLI){ const t=win.AcchI18n.tr(it); if (t && t!==it) EN.set(key(t),en); } }
  const fill=(tpl,m)=>tpl.replace(/\{(\d+)\}/g,(_,i)=>m[+i+1]);

  /* un messaggio verso lo schermo: testo del desktop nella lingua della fonte (il traduttore della pagina fa il resto) */
  function pro(text){
    if (text==null) return text; const s=String(text); if (!/\S/.test(s)) return s; enKeys();
    const k=key(s); if (SRC.has(k)) return SRC.get(k);
    for (const [re,it] of MODELLI){ const m=re.exec(k); if (m) return fill(it,m); }
    // rete di sicurezza: un testo non ancora in tabella esce comunque senza emoji, esclamazioni e mascotte (e viene annotato)
    let c=k.replace(/^(?:Fatto|Done|Pronto|Ready)!\s*/,'').replace(/([\p{L}\p{N})»])!+(?=\s|$)/gu,'$1.');   // solo il «!» di fine frase: un nome di file con «!» resta com'è
    if (/\bGino\b/.test(c)) c=c.replace(/[^.?…]*\bGino\b[^.?…]*[.?…]?\s*/g,'').trim();
    if (c!==k) misses.add(s);   // non conta il solo togliere le emoji: serve una voce nella tabella
    return c;
  }
  /* testi fissi della pagina: nodi di testo e attributi visibili; le emoji spariscono, i segnali di gravità diventano simboli tipografici */
  const ATTRS=['title','aria-label','placeholder','alt'];
  const SKIP=/^(SCRIPT|STYLE|TEXTAREA|CODE)$/;
  const SIGN=s=>s.replace(/⛔\uFE0F?/g,'⊘').replace(/⚠\uFE0F?/g,'△').replace(/©\s?/g,'Copyright ').replace(EP,'');
  function fix(v){ if (!v || !/[\p{L}\p{Extended_Pictographic}]/u.test(v)) return v; enKeys();
    const k=key(v), M=lang()==='en'?EN:IT; if (M.has(k)){ const r=M.get(k), lead=/^\s*/.exec(v)[0], tail=/\s*$/.exec(v)[0]; return r ? lead+r+tail : ''; }
    if (/[\p{Extended_Pictographic}]/u.test(v)){ let r=SIGN(v).replace(/« /g,'«').replace(/ {2,}/g,' '); if (!/\S/.test(r)) r=''; else if (!/^\s/.test(v)) r=r.replace(/^\s+/,''); return r; }
    return v; }
  const user=e=>{ for (let p=e; p; p=p.parentElement){ if (SKIP.test(p.tagName) || (p.hasAttribute && p.hasAttribute('data-noi18n'))) return true; } return false; };
  function dom(root){ root=root||win.document.body; if (!root) return;
    if (root.nodeType===3){ if (root.parentElement && !user(root.parentElement)){ const v=fix(root.nodeValue); if (v!==root.nodeValue) root.nodeValue=v; } return; }
    if (root.nodeType!==1 || user(root)) return;
    const one=e=>{ for (const a of ATTRS){ if (!e.hasAttribute(a)) continue; const v=e.getAttribute(a), n=fix(v); if (n!==v) e.setAttribute(a,n); } };
    one(root);
    const w=win.document.createTreeWalker(root, 5, {acceptNode(n){ if (n.nodeType===1) return (SKIP.test(n.tagName) || n.hasAttribute('data-noi18n')) ? 2 : 1; return 1; }});
    for (let n=w.nextNode(); n; n=w.nextNode()){ if (n.nodeType===3){ const v=fix(n.nodeValue); if (v!==n.nodeValue) n.nodeValue=v; } else one(n); }
  }
  let obs=null;
  function watch(){ if (obs) return; obs=new win.MutationObserver(ms=>{ for (const m of ms){ if (m.type==='childList') m.addedNodes.forEach(dom); else if (m.type==='characterData') dom(m.target); else if (m.type==='attributes') dom(m.target); } });
    obs.observe(win.document.documentElement,{subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:ATTRS}); }
  /* la pagina è pronta: via la mascotte e la finestra di download, testi fissi del desktop, poi si segue ogni modifica */
  function start(){ const $=s=>win.document.querySelector(s);
    const g=$('#gino'); if (g){ g.innerHTML=''; g.removeAttribute('title'); }
    const h=$('#hello'); if (h) h.textContent='';
    const dl=$('#dlgDownload'); if (dl) dl.remove();
    const ld=$('#loader svg'); if (ld) ld.outerHTML='<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 26h24M6 26c5 0 6-18 10-18s5 18 10 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    dom(win.document.body); watch(); win.addEventListener('acch-lang',()=>dom(win.document.body)); }
  if (win.document.readyState==='loading') win.document.addEventListener('DOMContentLoaded', start); else start();

  /* Novità: quelle del desktop dove ci sono, altrimenti quelle online ripulite; nessuna emoji, un'icona sobria */
  function novita(list){ const en=lang()==='en';
    return list.map(n=>{ const own=NOVITA[n.v]; if (own) return {v:n.v, data:n.data, voci:own.map(x=>[ICON, x[0], x[1], x[4]||null])};
      return {v:n.v, data:n.data, voci:n.voci.filter(x=>x[4]!=='web').map(x=>[ICON, pro(x[1]), pro(x[2]), x[0]&&x[3]&&!/download/i.test(String(x[3]))?x[3]:null])}; }); }

  win.ACCH_DESK={pro, dom, novita, misses, ICON, _tables:{TESTI, MODELLI, NOVITA}};
})(window);
