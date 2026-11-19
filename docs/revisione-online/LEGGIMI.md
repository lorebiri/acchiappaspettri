# Revisione grafica della versione online: immediatezza e chiarezza

Chi apre l'app online deve capire subito cosa fare: **caricare uno spettro, scegliere l'analisi, leggere il risultato**.
Questa revisione cambia solo l'aspetto della versione online. Nessuna funzione nuova, nessun calcolo toccato. L'app desktop resta identica.

## Come è tenuto separato il desktop

Online e desktop usano lo stesso `index.html`. Già prima `app/shell-boot.js` mette in testa alla pagina la classe `shell` nel desktop (Tauri) e la classe `web` online, e due file valgono solo online:

- `app/web.css`: ogni regola inizia con `html.web` (c'è un test);
- `app/web.js`: esce subito se la pagina non ha la classe `web`.

Tutta la revisione sta in questi due file, più le traduzioni inglesi in `i18n/en-app.json` (e il dizionario generato `i18n/en.js`). `index.html` e i file del desktop non sono toccati.

Verifiche:

- `test/validation/web-chiarezza-ui.test.js` apre l'anteprima del desktop (con il finto Tauri dei test) due volte, con e senza `app/web.css` e `app/web.js`, e confronta le schermate pixel per pixel, sia all'avvio sia sul passo 2 con «Analisi» aperta. Una regola che toccasse il desktop fa fallire il test (provato).
- Le schermate `prima/desktop-*.png` (prese da `main`) e `dopo/desktop-*.png` sono identiche byte per byte.

## Cosa cambia online e perché

| Dove | Prima | Dopo | Perché |
|---|---|---|---|
| Prima schermata | In cima il riquadro «Due modi» con un pulsante blu «Usa Acchiappaspettri Online», mentre la si sta già usando | Il riquadro diventa una nota sotto: «Ti serve anche senza internet?» con «Scarica l'app desktop» | Un solo invito principale: caricare i file |
| Area di caricamento | «Trascina qui file o cartelle» | «Carica i tuoi spettri», poi «Trascinali qui, anche una cartella intera, oppure:»; area più evidente | Il titolo dice l'azione, non il gesto |
| Sotto il caricamento | Tre schede con liste lunghe (15 voci) | Tre passi brevi: Carica · Controlla e analizza · Leggi e scarica | Il percorso si legge in pochi secondi; i passi seguono la barra in alto |
| Benvenuto | Finestra lunga con storia e 5 punti | Solo i tre passi, gli strumenti e «Iniziamo» | Si arriva prima al lavoro; tutto il resto è nella pagina |
| Passo 2, schede | Schede sottolineate su due righe, «Analisi» per ultima | Pulsanti ordinati, «Analisi» subito dopo «Picchi» | Scegliere l'analisi è il passo principale; cambia solo l'ordine a vista |
| Passo 2, Analisi | Titoli come «Che cosa potrebbe esserci» stretti a una parola per riga | Titolo su una riga | Leggibilità |
| Intestazione | Comandi di servizio blu come i link | Grigi, più quieti dei tre passi | Gerarchia: i passi guidano |
| Contrasto | Testo secondario `#5f6b7d` | `#4c5767` (circa 7:1 sul bianco) | Testi piccoli più leggibili |
| Errori | Avviso scuro, come gli altri | Rosso chiaro con bordo rosso | Un errore si riconosce a colpo d'occhio |
| Telefono | Il caricamento era sotto il riquadro «Due modi» e la figura grande | Pulsanti a tutta larghezza nella prima schermata, Gino piccolo accanto al fumetto | Si carica senza scorrere |
| Tablet (561–899 px) | L'intestazione usciva dallo schermo e la pagina scorreva di lato | I comandi vanno a capo | Niente scorrimento laterale |

L'identità resta: icona C, Gino nel fumetto e nella pagina, tono «serio ma non troppo».

## Schermate

`prima/` (da `main`) e `dopo/`: browser 1440×900, tablet 820×1180 e telefono 390×844, in quattro momenti (prima visita con il benvenuto, pagina vuota, spettri caricati, scheda Analisi). Le schermate del desktop sono `desktop-*.png`.

Si rifanno con:

```
node docs/revisione-online/schermate.js dopo
ACCH_ROOT=/percorso/di/una/copia/di/main node docs/revisione-online/schermate.js prima
```

Dati solo sintetici (`examples/ftir-polietilene-sintetico`).
