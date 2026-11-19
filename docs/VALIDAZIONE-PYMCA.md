# Confronto automatico con PyMca

*Generato da `node scripts/confronto-pymca.js` (risultati di PyMca 5.9.7 con fisx 1.3.2 in `test/fixtures/pymca/confronto-pymca.json`, scritti da `scripts/confronto-pymca.py`). Il test `test/unit/xrf-pymca-confronto.test.js` controlla gli stessi numeri in CI.*

Area di Acchiappaspettri: gaussiana più code (con il `.cfg` di PyMca, a sola gaussiana, l'area gaussiana comprende anche le code). Criteri su Steel.spe: aree dei gruppi principali entro il 3% (15% per i gruppi sovrapposti ad altri, come Mn Kα sotto Cr Kβ); concentrazioni entro il 6% del certificato e il 10% di PyMca (Mn escluso: PyMca divide diversamente l'area con Cr Kβ). Su XRFSpectrum.mca: χ² non peggiore e aree dei gruppi K e L entro il 15% (le righe M sotto 2,5 keV, sovrapposte fra loro, sono solo riportate), perché lì le aree dipendono molto dal fondo (con SNIP, invece del fondo a B-spline, gli scarti cambiano segno: da +8% a −3/−8%).  Sul bronzo sintetico: entro il 10% della verità e il 20% di PyMca (geometrie solo approssimativamente uguali). χ² ridotto del modello 3.1 non peggiore di quello di PyMca.

## 1. Steel.spe (acciaio NIST SRM 1155, eccitazione monocromatica 16 keV)

Condizioni lette da `Steel.cfg`; elementi: Ni, Mn, Pb, As, Fe, W, V, Cr, Cu; intervallo di PyMca (canali 200–1432).

| Gruppo | Acchiappaspettri 3.1 | PyMca | Scarto |
|---|---|---|---|
| Cr K | 1185724 | 1196016 | -0,9% |
| Mn K | 97755 | 109608 | -10,8% |
| Fe Ka+Fe Kb | 3551074 | 3566386 | -0,4% |
| Ni K | 511552 | 512385 | -0,2% |
| Cu K | 10090 | 10058 | +0,3% |

| % in peso (normalizzato su Cr+Mn+Fe+Ni+Cu) | Acchiappaspettri 3.1 | PyMca (secondaria + terziaria, Fe di riferimento) | Certificato NIST |
|---|---|---|---|
| Cr | 18,259 | 20,024 | 18,971 |
| Mn | 1,646 | 1,895 | 1,672 |
| Fe | 67,750 | 66,005 | per differenza |
| Ni | 12,163 | 11,897 | 12,754 |
| Cu | 0,182 | 0,179 | 0,179 |

χ² ridotto sullo stesso intervallo: Acchiappaspettri 3.1 **8,21**, 3.0 15,15; PyMca con `Steel.cfg` (sola gaussiana) **13,09**, PyMca con l'ipermetro completo 19,16. Noise/Fano: Acchiappaspettri 101 eV / 0,134, PyMca 105 eV / 0,137. I fondi sono diversi (B-spline nel fit contro SNIP), quindi il χ² dice soprattutto quanto bene è descritta la forma dei picchi.

## 2. XRFSpectrum.mca (standard sottile multielemento distribuito con PyMca)

Condizioni dal `.cfg` di `PyMca5/tests/XrfTest.py`; aree in unità dello spettro (conteggi normalizzati). La concentrazione non si confronta: PyMca usa uno standard interno (Co) e uno strato sottile, che l'app non prevede.

| Gruppo | Acchiappaspettri 3.1 | PyMca | Scarto | Nel criterio |
|---|---|---|---|---|
| Ar K | 7633,2687 | 7284,5606 | +4,8% | no (< 1% del totale) |
| Ca K | 9428,1746 | 9397,0349 | +0,3% | no (< 1% del totale) |
| Ti K | 15334,8687 | 14836,3565 | +3,4% | sì |
| V K | 19731,5033 | 18856,2495 | +4,6% | sì |
| Cr K | 26436,5108 | 25084,0118 | +5,4% | sì |
| Mn K | 33448,7038 | 31587,5719 | +5,9% | sì |
| Fe K | 42754,1949 | 39996,6964 | +6,9% | sì |
| Co K | 50528,0302 | 46933,8383 | +7,7% | sì |
| Ni K | 62327,5876 | 58119,2601 | +7,2% | sì |
| Cu K | 69627,9951 | 64988,5373 | +7,1% | sì |
| Zn K | 79761,4738 | 75169,8951 | +6,1% | sì |
| Zn L | 0,0000 | 452,5626 | -100,0% | no (< 1% del totale) |
| As K | 107332,9696 | 100762,3329 | +6,5% | sì |
| As L | 1021,7244 | 447,4769 | +128,3% | no (< 1% del totale) |
| Se K | 114456,8878 | 108113,0960 | +5,9% | sì |
| Se L | 1331,6432 | 971,9866 | +37,0% | no (< 1% del totale) |
| Sr K | 136785,4783 | 123927,7256 | +10,4% | sì |
| Sr L | 3824,9201 | 3093,3100 | +23,7% | no (< 1% del totale) |
| Cd L | 2621,6683 | 3113,6104 | -15,8% | no (< 1% del totale) |
| Sb L | 5023,4202 | 6205,6459 | -19,1% | no (< 1% del totale) |
| Tl L | 95713,3611 | 98831,5287 | -3,2% | sì |
| Tl M | 11016,0949 | 15018,4209 | -26,6% | no (righe M) |
| Pb L | 97671,4552 | 99445,3070 | -1,8% | sì |
| Pb M | 13602,4577 | 13455,3309 | +1,1% | no (righe M) |

## 3. Bronzo SINTETICO di `examples/` (tubo Rh 40 kV)

Tubo di Ebel in entrambi i programmi, matrice iterata e normalizzata a 100%. Lo spettro è generato col modello 3.0 dell'app (tubo di Kramers): la «verità» vale per quel modello.

| % in peso | Verità | Acchiappaspettri 3.1 | PyMca |
|---|---|---|---|
| Cu | 84,00 | 83,51 | 82,26 |
| Sn | 8,00 | 8,49 | 8,82 |
| Pb | 5,00 | 4,88 | 5,91 |
| Zn | 2,50 | 2,52 | 2,56 |
| As | 0,50 | 0,60 | 0,45 |

