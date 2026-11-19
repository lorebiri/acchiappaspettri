# Confronto automatico con PyMca

*Generato da `node scripts/confronto-pymca.js` (risultati di PyMca 5.9.7 con fisx 1.3.2 in `test/fixtures/pymca/confronto-pymca.json`, scritti da `scripts/confronto-pymca.py`). Il test `test/unit/xrf-pymca-confronto.test.js` controlla gli stessi numeri in CI.*

Area di Acchiappaspettri: gaussiana più code (con il `.cfg` di PyMca, a sola gaussiana, l'area gaussiana comprende anche le code). Criteri su Steel.spe: aree dei gruppi principali entro il 3% (15% per i gruppi sovrapposti ad altri, come Mn Kα sotto Cr Kβ); concentrazioni entro il 6% del certificato e il 10% di PyMca (Mn escluso: PyMca divide diversamente l'area con Cr Kβ). Su XRFSpectrum.mca: χ² non peggiore e aree dei gruppi K e L entro il 15% (le righe M sotto 2,5 keV, sovrapposte fra loro, sono solo riportate), perché lì le aree dipendono molto dal fondo (con SNIP, invece del fondo a B-spline, gli scarti cambiano segno: da +8% a −3/−8%).  Sul bronzo sintetico: entro il 10% della verità e il 20% di PyMca (geometrie solo approssimativamente uguali). χ² ridotto del modello 3.1 non peggiore di quello di PyMca.

## 1. Steel.spe (acciaio NIST SRM 1155, eccitazione monocromatica 16 keV)

Condizioni lette da `Steel.cfg`; elementi: Ni, Mn, Pb, As, Fe, W, V, Cr, Cu; intervallo di PyMca (canali 200–1432).

| Gruppo | Acchiappaspettri 3.1 | PyMca | Scarto |
|---|---|---|---|
| Cr K | 1186002 | 1196016 | -0,8% |
| Mn K | 98002 | 109608 | -10,6% |
| Fe Ka+Fe Kb | 3552091 | 3566386 | -0,4% |
| Ni K | 511718 | 512385 | -0,1% |
| Cu K | 10074 | 10058 | +0,2% |

| % in peso (normalizzato su Cr+Mn+Fe+Ni+Cu) | Acchiappaspettri 3.1 | PyMca (secondaria + terziaria, Fe di riferimento) | Certificato NIST |
|---|---|---|---|
| Cr | 18,258 | 20,024 | 18,971 |
| Mn | 1,649 | 1,895 | 1,672 |
| Fe | 67,748 | 66,005 | per differenza |
| Ni | 12,163 | 11,897 | 12,754 |
| Cu | 0,182 | 0,179 | 0,179 |

χ² ridotto sullo stesso intervallo: Acchiappaspettri 3.1 **8,23**, 3.0 15,15; PyMca con `Steel.cfg` (sola gaussiana) **13,09**, PyMca con l'ipermetro completo 19,16. Noise/Fano: Acchiappaspettri 101 eV / 0,134, PyMca 105 eV / 0,137. I fondi sono diversi (B-spline nel fit contro SNIP), quindi il χ² dice soprattutto quanto bene è descritta la forma dei picchi.

## 2. XRFSpectrum.mca (standard sottile multielemento distribuito con PyMca)

Condizioni dal `.cfg` di `PyMca5/tests/XrfTest.py`; aree in unità dello spettro (conteggi normalizzati). La concentrazione non si confronta: PyMca usa uno standard interno (Co) e uno strato sottile, che l'app non prevede.

| Gruppo | Acchiappaspettri 3.1 | PyMca | Scarto | Nel criterio |
|---|---|---|---|---|
| Ar K | 7805,3255 | 7284,5606 | +7,1% | no (< 1% del totale) |
| Ca K | 9658,7615 | 9397,0349 | +2,8% | no (< 1% del totale) |
| Ti K | 15664,6824 | 14836,3565 | +5,6% | sì |
| V K | 20154,7695 | 18856,2495 | +6,9% | sì |
| Cr K | 26992,1897 | 25084,0118 | +7,6% | sì |
| Mn K | 34143,2420 | 31587,5719 | +8,1% | sì |
| Fe K | 43641,8615 | 39996,6964 | +9,1% | sì |
| Co K | 51570,9385 | 46933,8383 | +9,9% | sì |
| Ni K | 63573,5018 | 58119,2601 | +9,4% | sì |
| Cu K | 70995,3502 | 64988,5373 | +9,2% | sì |
| Zn K | 81308,5049 | 75169,8951 | +8,2% | sì |
| Zn L | 0,0000 | 452,5626 | -100,0% | no (< 1% del totale) |
| As K | 109414,0778 | 100762,3329 | +8,6% | sì |
| As L | 1039,2099 | 447,4769 | +132,2% | no (< 1% del totale) |
| Se K | 116726,8110 | 108113,0960 | +8,0% | sì |
| Se L | 1369,7303 | 971,9866 | +40,9% | no (< 1% del totale) |
| Sr K | 139383,1846 | 123927,7256 | +12,5% | sì |
| Sr L | 3928,4122 | 3093,3100 | +27,0% | no (< 1% del totale) |
| Cd L | 2676,6940 | 3113,6104 | -14,0% | no (< 1% del totale) |
| Sb L | 5085,7241 | 6205,6459 | -18,0% | no (< 1% del totale) |
| Tl L | 97371,8419 | 98831,5287 | -1,5% | sì |
| Tl M | 11141,7997 | 15018,4209 | -25,8% | no (righe M) |
| Pb L | 99580,4382 | 99445,3070 | +0,1% | sì |
| Pb M | 14010,0993 | 13455,3309 | +4,1% | no (righe M) |

## 3. Bronzo SINTETICO di `examples/` (tubo Rh 40 kV)

Tubo di Ebel in entrambi i programmi, matrice iterata e normalizzata a 100%. Lo spettro è generato col modello 3.0 dell'app (tubo di Kramers): la «verità» vale per quel modello.

| % in peso | Verità | Acchiappaspettri 3.1 | PyMca |
|---|---|---|---|
| Cu | 84,00 | 83,45 | 82,26 |
| Sn | 8,00 | 8,53 | 8,82 |
| Pb | 5,00 | 4,89 | 5,91 |
| Zn | 2,50 | 2,53 | 2,56 |
| As | 0,50 | 0,59 | 0,45 |

