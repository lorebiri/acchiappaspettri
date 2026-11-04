# Limitazioni note

- **Firma dei sistemi operativi**: niente certificati Microsoft né Apple: avvisi al primo avvio ([INSTALLAZIONE.md](INSTALLAZIONE.md)). Su macOS l'app ha firma ad hoc e non è autenticata (notarizzata).
- **Lingua nell'installer**: solo su Windows; su macOS e Linux si chiede al primo avvio.
- **Aggiornamento .deb**: manuale, con avviso.
- **Linux ARM e Windows ARM**: nessun pacchetto.
- **Motori web diversi**: WebKit su macOS e Linux, WebView2 su Windows. HEIC/TIFF si aprono solo dove il motore li supporta.
- **Grafici**: il tema scuro non cambia i grafici, che restano bianchi come nei file esportati. Alcuni piccoli elementi colorati a mano nell'interfaccia possono essere meno curati in tema scuro.
- **Inglese**: traduzione a livello di testo mostrato. Nomi di alcuni file esportati e nomi tecnici restano in italiano. Il testo costruito da pezzi molto dinamici può risultare meno naturale.
- **Dati scientifici**: vedi [SCIENZA.md](SCIENZA.md).
- **Progetti**: niente foto del falso colore; zoom e scheda aperta non vengono ripristinati.
- **File grandi**: i progetti sono caricati interamente in memoria; limite di sicurezza 2 GB.
