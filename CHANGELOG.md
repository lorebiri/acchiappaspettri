# Novità delle versioni

## 2.2.0

- Acchiappaspettri Desktop per Windows, macOS e Linux: funziona senza internet e avvisa quando esce una nuova versione.
- Nuovo formato di progetto .acchspettri: dati originali, lavoro fatto e risultati in un solo file, controllato a ogni apertura.
- Interfaccia completa anche in inglese, tema scuro, risorse tutte incluse per funzionare offline.
- XRF: corrette le energie Kβ dalle tabelle FP per Z ≥ 50 (Ba e Sb risultavano molto sottostimati); uno standard incompleto ora viene ignorato con un avviso. HPLC: piatti teorici corretti sui picchi larghi, S/N secondo la farmacopea (2H/h). EPR: doppio integrale non più alterato dalla deriva del fondo. DSC: unità del tempo non dichiarata riconosciuta dalla velocità plausibile. Dettagli in docs/SCIENZA.md.
- Sicurezza: un progetto non può più eseguire codice nella pagina; «Sobrio» non scarta più gli spettri.
