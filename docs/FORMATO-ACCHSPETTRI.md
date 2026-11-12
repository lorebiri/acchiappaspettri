# Il formato di progetto `.acchspettri`

Un progetto è un normale archivio ZIP, apribile con qualsiasi programma: nulla è nascosto. Versione attuale del formato: **1**.

```
mimetype                 application/vnd.acchiappaspettri.project+zip (prima voce, non compressa)
manifest.json            formato, versione, data, impronta SHA-256 e dimensione di ogni file
README.txt               spiegazione breve
project/state.json       impostazioni, misure, confronti, riferimenti, libreria, spettro aperto
project/spectra.json     per ogni spettro: nome, percorso relativo, dati, memoria (titolo, picchi, nomi, elaborazioni, deconvoluzioni, analisi)
data/000001.dat          il file originale, byte per byte
processed/000001.csv     dati come visualizzati, leggibili (copia informativa: all'apertura si ricalcola dagli originali)
results/…                tabelle dei risultati e bozza dei metodi (copia informativa)
```

## Regole
- **Autonomo e portabile**: i dati sono dentro il file, i percorsi sono sempre relativi; nessun percorso assoluto del computer.
- **Nessun contenuto eseguibile**: si leggono solo le voci previste; le altre vengono ignorate e mai eseguite.
- **Verifica a ogni apertura**: CRC dello ZIP, impronta SHA-256 di ogni voce, schema dei dati. Se qualcosa non torna, il progetto non si apre e il lavoro corrente resta intatto.
- **Protezioni**: percorsi con `..`, assoluti o con barre rovesce rifiutati; limiti sulle dimensioni dichiarate dallo ZIP; chiavi JSON pericolose scartate; valori controllati prima di entrare nell'interfaccia.
- **Salvataggio verificato**: dopo la scrittura in memoria l'archivio viene riletto e verificato prima di considerarlo salvato. Nell'app la scrittura è atomica e la versione precedente resta in `*.acchspettri.bak`.

## Versioni e migrazioni
- `formatVersion` è la versione con cui è scritto il file, `minReaderVersion` la minima capace di leggerlo.
- File più vecchi: si passa dalla catena `MIGRATIONS` in `app/project-format.js`, in memoria, senza toccare il file originale.
- File più nuovi: se `minReaderVersion` lo permette si apre con un avviso, altrimenti messaggio «aggiorna l'applicazione».
- `test/fixtures/progetto-v1.acchspettri` è un progetto della versione 1 costruito per provare il **contenitore** (impronte, percorsi, chiavi pericolose, ogni byte alterato): **non va cancellato**. I suoi due «spettri» sono dati di prova (due righe di testo e un finto `.spa`), quindi l'app non ne legge nessuno e lo dice con «Il progetto è integro, ma nessuno dei suoi spettri si può leggere», non con «danneggiato».
- `test/fixtures/progetto-v1-spettri.acchspettri` è un progetto della versione 1 salvato dalla 2.2.0 con due spettri sintetici (FTIR e HPLC), un titolo e una voce di libreria: deve aprirsi con tutto il suo contenuto (`test/validation/ui-rilascio-ui.test.js`), anche dopo il formato 2.
- I vecchi `.acchiappa.json` si aprono ancora; il salvataggio successivo crea un `.acchspettri`, e l'originale resta intatto.

## Cosa non contiene
Le fotografie del falso colore e i preset globali non fanno parte del progetto. Zoom e scheda aperta non vengono ripristinati.

---
**English summary.** `.acchspettri` is a plain, documented, versioned ZIP: `manifest.json` lists every entry with SHA-256, `data/` keeps original files byte for byte, `project/` holds settings and per-spectrum work as JSON, `processed/` and `results/` are readable copies. No absolute paths and no executable content; every file is verified on opening.
