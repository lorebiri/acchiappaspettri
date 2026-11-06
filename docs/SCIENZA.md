# Funzioni scientifiche: metodi, correzioni, limiti

Le formule sono citate nell'interfaccia e nel README; il paragrafo «Metodi» esportato riporta quelle usate. Qui: che cosa è stato verificato, che cosa è stato cambiato e perché, che cosa resta approssimato.

## Correzioni della versione 2.2 (revisione scientifica di novembre 2026)
| Dove | Errore | Effetto | Correzione |
|---|---|---|---|
| Tabelle FP (`FP_DATA`) | Energie Kβ errate per Z ≥ ~50: `LineEnergy(KB_LINE)` di xraylib pesa componenti senza energia (Ba 35,52 invece di ~36,4 keV) | Ba −81%, Sb −24%, Sn −2% in simulazione | Energia media pesata solo sulle componenti definite (`scripts/gen-fp-data.py`); test contro `XRF_LINES` |
| `fpCalibrate` | Standard con composizione parziale: matrice sbagliata | Sensibilità errate fino a 5× | Standard con somma < 90% ignorati, con avviso |
| `chromMetrics` | Base cercata in una finestra fissa, che su picchi larghi resta sul picco | N 9091 invece di 5625 (σ = 0,2 min) | Finestra proporzionale alla larghezza; test |
| S/N HPLC | H/σ confrontato con il criterio ICH/farmacopea | Valore ~3 volte più alto | S/N = 2H/h con h picco-picco, Ph. Eur. 2.2.46, USP <621> |
| `eprDoubleIntegral` | Medie delle finestre attribuite agli estremi invece che ai centri | −9% con deriva del 13% | Retta per i centri delle finestre; test |
| DSC | Colonna del tempo senza unità letta come minuti | ΔH fino a 60× | La velocità nell'intestazione ha la precedenza; senza unità si sceglie quella con velocità plausibile |
| Testi | «affidabile», «modello predittivo affidabile», La > 2 nm | Più certezza di quanta dimostrata | Testi corretti; Cançado: La ~20–500 nm |

## Verificato dalla revisione
Fluorescenza primaria e secondaria (anche contro Monte Carlo, entro lo 0,1%), Klein–Nishina, N, T, As, Rs, retta di taratura, LOD/LOQ, Mandel, PLS, PCA, Tauc, onset, costante g (71,4477), Stokes, resa quantica. μ/ρ entro lo 0,5% da xraylib. Dettagli e limiti in [COLLAUDO.md](COLLAUDO.md).

## Approssimazioni dichiarate del motore FP
- Spettro del tubo: Kramers con autoassorbimento e righe caratteristiche. Costanti **empiriche, non dalla letteratura**: intensità delle righe 1100, fattore L 0,25, profondità 0,7·R (Kanaya–Okayama), angolo d'uscita 20°. Per questo senza standard l'errore relativo in simulazione ha mediana di circa 3–4% (fino al 7% secondo il modello del tubo) e 90° percentile di 20–30%, di più sugli elementi sotto il 2–3% (benchmark `test/xrf-fp-benchmark.js` e prove dei tester virtuali); nella realtà può essere maggiore.
- Rese ω: forma Z⁴/(Z⁴+A) approssimata (usata solo per il tubo). Compton: S ≈ 0,92·Z.
- Rivelatore: Be 12,5 µm, Si 500 µm, 1 cm d'aria se non dichiarati. Picchi somma assenti; le fughe si aggiungono ma non si tolgono dal picco principale (1,4% a 2,3 keV, 0,2% a 8 keV).
- Spessori: nessuna fluorescenza fra strati; lo strato deve essere uniforme.
- Tutti i numeri di accuratezza vengono da **spettri simulati**, generati con lo stesso modello fisico anche quando perturbato. **Non c'è ancora una validazione su materiali certificati.**

## Limiti noti non corretti
- XRF empirico (`xrfIntensities`): con tubo ignoto la finestra del Compton 16–21,5 keV può includere il Rayleigh del Rh; ±1 FWHM taglia parte del Compton.
- Currie: «rilevato» sopra L_D è prudente; è dichiarato nel testo.
- EPR: l'asse è supposto in gauss se supera 1000 senza «mT»: controlla i file in banda Q.
- Tauc in riflettanza: R va dato in %. FTIR: T frazionaria 0–1 viene presa per assorbanza.
- Ammide I: stessa assorbività per tutte le strutture, zone per H₂O e stato solido (dichiarato).

## Roadmap (non implementata)
XRD, GC, ICP-OES e ICP-MS **non ci sono**. GC si avvicinerebbe alle figure di merito HPLC; XRD richiederebbe database di fasi; ICP richiederebbe flussi di taratura propri. Vanno aggiunte solo con dati reali di prova.
