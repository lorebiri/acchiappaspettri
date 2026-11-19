# Confronto automatico con PyMca

*Generato da `node scripts/confronto-pymca.js` (risultati di PyMca 5.9.7 con fisx 1.3.2 in `test/fixtures/pymca/confronto-pymca.json`, scritti da `scripts/confronto-pymca.py`). Il test `test/unit/xrf-pymca-confronto.test.js` controlla gli stessi numeri in CI.*

Area di Acchiappaspettri: gaussiana più code (con il `.cfg` di PyMca, a sola gaussiana, l'area gaussiana comprende anche le code). Criteri su Steel.spe: aree dei gruppi principali entro il 3% (15% per i gruppi sovrapposti ad altri, come Mn Kα sotto Cr Kβ); concentrazioni entro il 6% del certificato e il 10% di PyMca (Mn escluso: PyMca divide diversamente l'area con Cr Kβ). Su XRFSpectrum.mca: χ² non peggiore e aree dei gruppi K e L entro il 15% (le righe M sotto 2,5 keV, sovrapposte fra loro, sono solo riportate), perché lì le aree dipendono molto dal fondo (con SNIP, invece del fondo a B-spline, gli scarti cambiano segno: da +8% a −3/−8%).  Sul bronzo sintetico: entro il 10% della verità e il 20% di PyMca (geometrie solo approssimativamente uguali). χ² ridotto del modello 3.1 non peggiore di quello di PyMca.

## 1. Steel.spe (acciaio NIST SRM 1155, eccitazione monocromatica 16 keV)

Condizioni lette da `Steel.cfg`; elementi: Ni, Mn, Pb, As, Fe, W, V, Cr, Cu; intervallo di PyMca (canali 200–1432).

| Gruppo | Acchiappaspettri 3.1 | PyMca | Scarto |
|---|---|---|---|
| Cr K | 1184846 | 1196016 | -0,9% |
| Mn K | 96711 | 109608 | -11,8% |
| Fe Ka+Fe Kb | 3547527 | 3566386 | -0,5% |
| Ni K | 511214 | 512385 | -0,2% |
| Cu K | 10158 | 10058 | +1,0% |

| % in peso (normalizzato su Cr+Mn+Fe+Ni+Cu) | Acchiappaspettri 3.1 | PyMca (secondaria + terziaria, Fe di riferimento) | Certificato NIST |
|---|---|---|---|
| Cr | 18,264 | 20,024 | 18,971 |
| Mn | 1,630 | 1,895 | 1,672 |
| Fe | 67,756 | 66,005 | per differenza |
| Ni | 12,167 | 11,897 | 12,754 |
| Cu | 0,183 | 0,179 | 0,179 |

χ² ridotto sullo stesso intervallo: Acchiappaspettri 3.1 **7,90**, 3.0 15,15; PyMca con `Steel.cfg` (sola gaussiana) **13,09**, PyMca con l'ipermetro completo 19,16. Noise/Fano: Acchiappaspettri 105 eV / 0,130, PyMca 105 eV / 0,137. I fondi sono diversi (B-spline nel fit contro SNIP), quindi il χ² dice soprattutto quanto bene è descritta la forma dei picchi.

## 2. XRFSpectrum.mca (standard sottile multielemento distribuito con PyMca)

Condizioni dal `.cfg` di `PyMca5/tests/XrfTest.py`; aree in unità dello spettro (conteggi normalizzati). La concentrazione non si confronta: PyMca usa uno standard interno (Co) e uno strato sottile, che l'app non prevede.

| Gruppo | Acchiappaspettri 3.1 | PyMca | Scarto | Nel criterio |
|---|---|---|---|---|
| Ar K | 7670,9154 | 7284,5606 | +5,3% | no (< 1% del totale) |
| Ca K | 9487,5065 | 9397,0349 | +1,0% | no (< 1% del totale) |
| Ti K | 15429,9838 | 14836,3565 | +4,0% | sì |
| V K | 19860,8552 | 18856,2495 | +5,3% | sì |
| Cr K | 26582,5911 | 25084,0118 | +6,0% | sì |
| Mn K | 33671,0088 | 31587,5719 | +6,6% | sì |
| Fe K | 43027,1585 | 39996,6964 | +7,6% | sì |
| Co K | 50875,1211 | 46933,8383 | +8,4% | sì |
| Ni K | 62772,0963 | 58119,2601 | +8,0% | sì |
| Cu K | 70121,9707 | 64988,5373 | +7,9% | sì |
| Zn K | 80339,1473 | 75169,8951 | +6,9% | sì |
| Zn L | 0,0000 | 452,5626 | -100,0% | no (< 1% del totale) |
| As K | 108080,6427 | 100762,3329 | +7,3% | sì |
| As L | 1042,9059 | 447,4769 | +133,1% | no (< 1% del totale) |
| Se K | 115285,8519 | 108113,0960 | +6,6% | sì |
| Se L | 1340,9498 | 971,9866 | +38,0% | no (< 1% del totale) |
| Sr K | 137607,4666 | 123927,7256 | +11,0% | sì |
| Sr L | 3861,0405 | 3093,3100 | +24,8% | no (< 1% del totale) |
| Cd L | 2658,2897 | 3113,6104 | -14,6% | no (< 1% del totale) |
| Sb L | 5064,1006 | 6205,6459 | -18,4% | no (< 1% del totale) |
| Tl L | 96167,1246 | 98831,5287 | -2,7% | sì |
| Tl M | 11135,1057 | 15018,4209 | -25,9% | no (righe M) |
| Pb L | 98153,9538 | 99445,3070 | -1,3% | sì |
| Pb M | 13667,2505 | 13455,3309 | +1,6% | no (righe M) |

## 3. Bronzo SINTETICO di `examples/` (tubo Rh 40 kV)

Tubo di Ebel in entrambi i programmi, matrice iterata e normalizzata a 100%. Lo spettro è generato col modello 3.0 dell'app (tubo di Kramers): la «verità» vale per quel modello.

| % in peso | Verità | Acchiappaspettri 3.1 | PyMca |
|---|---|---|---|
| Cu | 84,00 | 83,60 | 82,26 |
| Sn | 8,00 | 8,41 | 8,82 |
| Pb | 5,00 | 4,95 | 5,91 |
| Zn | 2,50 | 2,51 | 2,56 |
| As | 0,50 | 0,53 | 0,45 |

