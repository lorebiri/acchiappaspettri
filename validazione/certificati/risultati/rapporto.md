# Validazione con materiali certificati

*Generato da `scripts/valida-certificati.js` il 2026-11-19 (Acchiappaspettri 3.0.0). Non modificare a mano: rilanciare lo script.*

## Criteri di accettazione

- Valore certificato ≥ 1%: |errore relativo| ≤ 10%
- Valore certificato fra 0,1 e 1%: |errore relativo| ≤ 25%
- Valore certificato fra 0 e 0,1%: solo segnalato
- ζ = |x − ref| / √(u² + (U/k)²) ≤ 2 (u: incertezza tipo dell'app = conteggio ⊕ 5% di modello; U, k: dal certificato, k = 2 se manca). E_n = |x − ref| / √((2u)² + U²) è riportato per confronto.
- Combinazione: servono entrambi (errore relativo e ζ). Valutati solo i valori di tipo: certificato.

| Campione | Tecnica | Esito | Elementi superati |
|---|---|---|---|
| esempi/nist-srm-1155 | XRF | non superato | 4 su 5 |

## esempi/nist-srm-1155

NIST SRM 1155, acciaio inossidabile AISI 316 · non dichiarato nei file di PyMca (fascio monocromatico)
Fonte: spettro e configurazione d'esempio di PyMca 5.9.7 (MIT, © ESRF): test/fixtures/pymca/Steel.spe e Steel.cfg

Condizioni usate: anodo Ag, eccitazione 16 keV (nucleo), angoli 45°/45°, aria, rivelatore Si 350 µm, finestra Be 20 µm, filtro Al 1100 µm. Intervallo 4,5–15 keV, picco ipermetro, calibrazione dal cfg. χ²ᵣ = 9,4.
Elementi non misurati, presi dal certificato: C 0,0445%, Mo 2,39%, S 0,0175%, As 0,0107%, P 0,02%, Si 0,509%, N 0,04%, Pb 0,001%, W 0,11%.

| Elemento | Tipo | Certificato (%) | U (k) | Trovato (%) | u | Errore rel. | ζ | E_n | Limite | Esito |
|---|---|---|---|---|---|---|---|---|---|---|
| C | certificato | 0,0445 | 0,0014 (3,2) | — | — | — | — | — | — | **fisso** (non misurato: preso dal certificato e tolto dalla normalizzazione) |
| Co | certificato | 0,1052 | 0,0057 (2,36) | 0,3787 | 0,026 | +260,0% | 10,6 | 5,28 | ±25% | **non superato** (errore oltre 25%, ζ oltre 2) |
| Cr | certificato | 18,37 | 0,21 (4,3) | 18,45 | 0,92 | +0,4% | 0,0814 | 0,0405 | ±10% | **superato** |
| Cu | certificato | 0,1734 | 0,0075 (2,26) | 0,1732 | 0,011 | -0,1% | 0,0156 | 0,00769 | ±25% | **superato** |
| Mn | certificato | 1,619 | 0,075 (3,2) | 1,614 | 0,086 | -0,3% | 0,0616 | 0,0292 | ±10% | **superato** |
| Mo | certificato | 2,386 | 0,024 (2,23) | — | — | — | — | — | — | **fisso** (non misurato: preso dal certificato e tolto dalla normalizzazione) |
| Ni | certificato | 12,35 | 0,22 (4,3) | 11,26 | 0,56 | -8,9% | 1,93 | 0,95 | ±10% | **superato** |
| S | certificato | 0,0175 | 0,0032 (4,3) | — | — | — | — | — | — | **fisso** (non misurato: preso dal certificato e tolto dalla normalizzazione) |
| V | certificato | 0,0508 | 0,0034 (2,36) | 0,003377 | 0,0097 | -93,4% | 4,84 | 2,41 | — | **segnalato** (sotto 0,1%: riportato, non valutato) |
| As | indicativo | 0,01067 | 0,00045 (2,6) | — | — | — | — | — | — | **fisso** (non misurato: preso dal certificato e tolto dalla normalizzazione) |
| P | indicativo | 0,02 | 0,0012 (2,4) | — | — | — | — | — | — | **fisso** (non misurato: preso dal certificato e tolto dalla normalizzazione) |
| Si | indicativo | 0,5093 | 0,0049 (2,6) | — | — | — | — | — | — | **fisso** (non misurato: preso dal certificato e tolto dalla normalizzazione) |
| N | informativo | 0,04 | — | — | — | — | — | — | — | **fisso** (non misurato: preso dal certificato e tolto dalla normalizzazione) |
| Pb | informativo | 0,001 | — | — | — | — | — | — | — | **fisso** (non misurato: preso dal certificato e tolto dalla normalizzazione) |
| W | informativo | 0,11 | — | — | — | — | — | — | — | **fisso** (non misurato: preso dal certificato e tolto dalla normalizzazione) |
| Bi | limite | 0,0005 | — | — | — | — | — | — | — | **informazione** (il certificato dà solo un limite (<)) |
| Fe | per differenza | 64,19 | — | 64,99 | 3,3 | +1,2% | 0,246 | 0,123 | — | **informazione** (valore per differenza: non entra nei criteri) |

Esito del campione: **non superato** (4 su 5 elementi valutati).

<details><summary>Avvisi (9)</summary>

- cfg [attenuators] atmosphere: PyMca non descrive l'aria fra tubo e campione: d1 = 0; l'atmosfera (5 cm) è il cammino campione–rivelatore (d2)
- cfg [fit] energy: eccitazione monocromatica a 16 keV: è quella che PyMca usa per il calcolo; la sezione [tube] (Ag, 30 kV) serve solo a generare la lista e qui non conta. Il modello del tubo dell'app non la descrive: passa al nucleo come lista di energie (setup.exc)
- cfg [fit] stripflag: fondo strip iterativo: nell'app corrisponde al fondo «SNIP» (larghezza in keV), non identico
- cfg [concentrations] reference: elemento di riferimento «Fe» (standard interno): l'app normalizza a 100% (modo «leghe») oppure usa il Compton
- cfg [xrfmc]: impostazioni di XMI-MSIM (Monte Carlo): l'app non le usa
- cfg [detector] ignoreinputcalibration, nthreshold: senza equivalente nell'app (soglie di raggruppamento delle righe e opzioni di calibrazione)
- cfg [fit] stripwidth, stripfilterwidth, exppolorder, strategy, fitweight, stripanchorsflag, use_limit, stripiterations, linpolorder, deltaonepeak, stripconstant, strategyflag, stripanchorslist: senza equivalente nell'app (opzioni dell'algoritmo di PyMca)
- cfg [tube] anodedensity, anodethickness, deltaplotting, filter1thickness, filter1density, filter1: senza equivalente nell'app (dettagli dello spettro del tubo di Ebel)
- cfg [concentrations] usexrfmc, useautotime: senza equivalente nell'app

</details>

