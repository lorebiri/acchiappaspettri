# Test d'uso reale: dalla misura FTIR al grafico in meno di 3 minuti

**Scenario.** Chi ha appena fatto una misura FTIR apre per la prima volta l'app online, senza conoscerla, e vuole vedere il grafico. Obiettivo: meno di 3 minuti dall'apertura a un grafico leggibile e utile (assi, unità, picchi).

**Come.** `docs/revisione-online/test-utente.js` usa Playwright come farebbe una persona: prima visita vera (nessuna preferenza salvata), clic o tocco sui pulsanti visibili, scelta del file nella finestra del sistema (`filechooser`). La pagina è la radice del ramo servita così com'è, come la pubblica GitHub Pages. Il test cronometra ogni passo e controlla che il grafico sia in vista senza scorrere, con il titolo degli assi, le unità e i picchi.

**File.** Il repository contiene solo dati sintetici, quindi «file vero» qui vuol dire un export nei formati reali degli strumenti:

| File | Formato |
|---|---|
| `examples/ftir-polietilene-sintetico/PE_0000h_SINTETICO.csv` | CSV con intestazione, virgola |
| lo stesso spettro in JCAMP-DX 4.24 (`##XYPOINTS=(XY..XY)`, `##XUNITS=1/CM`), generato dal test | JCAMP-DX |
| `test/corpus/c/01_ftir_tab_desc.txt` | TXT con tabulazioni, senza intestazione, X decrescente |
| `test/corpus/c/05_ftir_T_header.csv` | CSV in trasmittanza (%T) |

Dispositivi: browser 1440×900 e telefono 390×844 (touch).

## Tempi misurati (macchina)

Tempo dall'apertura della pagina al grafico in vista, in secondi:

| File | Browser | Telefono |
|---|---|---|
| CSV (esempio) | 1,5 | 1,2 |
| JCAMP-DX | 1,5 | 1,2 |
| TXT con tabulazioni | 1,5 | 1,4 |
| CSV in trasmittanza | 1,7 | 1,4 |

Passi, browser, CSV d'esempio: pagina pronta 0,43 s · benvenuto chiuso con «Iniziamo» 0,36 s · «Scegli file» 0,14 s · lettura del file e passo 2 0,59 s · grafico già in vista.

In tutti gli 8 casi:

- lo strumento è riconosciuto: FTIR;
- l'asse X è «Numero d'onda (cm⁻¹)», l'asse Y è «Assorbanza» oppure «Trasmittanza (%)» per il file in %T;
- i picchi sono trovati e scritti sul grafico: 2915, 2848, 1471, 730, 719 cm⁻¹ per il polietilene; 2920, 1730, 1050 cm⁻¹ per i file del corpus;
- il grafico è in vista senza scorrere, sia nel browser sia sul telefono;
- il pulsante «Scegli file» è in vista appena chiuso il benvenuto;
- non ci sono errori nella pagina.

## Tempo per una persona (stima)

La macchina non esita. Questa stima aggiunge il tempo di una persona che legge e cerca il file:

| Passo | Stima |
|---|---|
| Apertura della pagina (rete normale) | 2–5 s |
| Lettura del benvenuto (circa 70 parole e 3 passi) e «Iniziamo» | 10–20 s |
| Trovare «Scegli file»: è il pulsante blu al centro, già in vista | 2–5 s |
| Trovare il file nella finestra del sistema (fuori dall'app) | 10–40 s |
| Lettura del grafico: nome, assi, picchi numerati | 5–10 s |
| **Totale** | **circa 30–80 s**, sotto i 3 minuti con margine |

## Esitazioni e punti poco chiari

| # | Punto | Esito |
|---|---|---|
| 1 | Il primo consiglio del passo 2 diceva «Sotto al grafico trovi gli strumenti», ma su schermo largo sono a destra | **Corretto** (solo online): «Il grafico è pronto. Nelle schede trovi gli strumenti: «Picchi» per dare i nomi, «Analisi» per scegliere cosa fare con lo spettro.» Coperto da un test |
| 2 | Il benvenuto blocca la pagina finché non si chiude | Lasciato, ma accorciato con questa revisione (prima circa 200 parole, ora circa 70). Basta un clic |
| 3 | Prima della revisione, su telefono, il caricamento era sotto il riquadro «Due modi» e la figura grande | Corretto con la revisione: i pulsanti sono nella prima schermata |
| 4 | Dopo il caricamento non c'è bisogno di cercare il grafico: l'app passa da sola al passo 2 | Nessuna esitazione |
| 5 | Il pannello «Picchi» accanto al grafico è denso (istruzioni, pulsanti, campi) | Non ostacola l'obiettivo, perché il grafico è già completo. Da valutare in un giro successivo |
| 6 | Sul telefono il nome del file nel titolo è troncato («PE_0000…») | Il nome intero resta nell'elenco e nel grafico grande. Non è un ostacolo |
| 7 | Sul telefono, nella prova automatica, l'icona di «Sobrio» appare come mezzo cerchio piccolo: dipende dai caratteri del browser senza finestra | Da riguardare su un telefono vero |

**Esito:** obiettivo raggiunto, con margine, da browser e da telefono, nei quattro formati. L'unico ostacolo trovato (punto 1) è corretto e la prova è stata ripetuta dopo la correzione.

## Rifare la prova

```
node docs/revisione-online/test-utente.js
```

Le schermate e `risultati.json`, con i tempi di ogni passo, vanno in `docs/revisione-online/test-utente/`.
