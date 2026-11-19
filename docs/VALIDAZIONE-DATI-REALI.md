# Validazione su dati reali (riservati): risultati aggregati

*19 novembre 2026, ramo `claude/xrf-libs-3.1`. Dati forniti dal CNR per i soli test interni: spettri, certificati e risultati **non** sono in questo repository. Qui ci sono solo errori aggregati e anonimi; i rapporti dettagliati restano con i dati riservati.*

## XRF: 6 standard di bronzo certificati (Cu–Zn–Sn–Pb)

Strumento portatile con tubo Rh a trasmissione, 40 kV, rivelatore SDD; 10 spettri per standard (60 in tutto). Condizioni dalle intestazioni dei file e dal manuale (incidenza 68°, uscita 63,5°, 6,1 cm d'aria tubo–campione, 1,4 cm campione–rivelatore). Modo «leghe» (somma 100%), elementi Cu, Zn, Sn, Pb. Riferimento: composizione certificata; come confronto, una misura SEM-EDS di controllo.

| Modello | Errore relativo medio | Mediana | Cu (bias) | Zn | Sn | Pb | χ² ridotto medio |
|---|---|---|---|---|---|---|---|
| 3.0 | 9,0% | 10,2% | +1,5% | −10,5% | −7,8% | −7,0% (medio 16%) | 7,0 |
| **3.1** | 9,7% | **8,5%** | **−0,3%** | −10,5% | +9,7% | +1,6% (medio 18%) | **6,0** |

- **Difetto trovato e corretto**: il lettore `.mca` usava nella calibrazione uno slot vuoto «Calibration3: 0 0» scritto dallo strumento. L'asse risultava spostato di circa 0,1 keV e **Sn era sottostimato di 3–6 volte con entrambi i modelli**. Ora il punto (0, 0) si scarta quando non sta sulla retta degli altri punti.
- **Difetto trovato e corretto**: senza limiti stretti, nel modello 3.1 la coda lunga dei picchi si confondeva con il fondo (χ² triplo). Ora i limiti dei parametri di forma sono quelli di PyMca.
- Zn è sottostimato del 10% da entrambi i modelli: errore sistematico comune, ancora da capire.
- In uno standard Pb risulta la metà del certificato con entrambi i modelli, e la misura SEM è vicina al valore dell'app: certificato o omogeneità del campione da verificare.
- Contro la misura SEM gli scarti sono molto più grandi (38% e 50%), soprattutto su Sn e Pb: la SEM-EDS vede la superficie.
- **Zn ambiguo in uno standard (0,3% o 0,003%)**: dal rapporto delle aree Zn K/Cu K, tarato sugli altri cinque standard (scarto 3%), risulta 0,31%; la quantificazione FP dà 0,27–0,29% e la somma a 100% è coerente. Vale 0,3%.
- Il confronto con il rapporto FP del software dello strumento su un reperto è solo indicativo (misure diverse dello stesso punto).

## LIBS: CF-LIBS

Gli spettri LIBS non sono disponibili; sono disponibili le composizioni CF-LIBS calcolate dal gruppo di Pisa sui 6 standard (con temperatura ≈ 0,86–0,96 eV e densità elettronica).

| | Errore relativo medio | Mediana |
|---|---|---|
| CF-LIBS del gruppo di Pisa, spettri reali, contro il certificato | 21% | 19% (Sn −34%, Pb −33%, Cu +4%, Zn −5% di bias) |
| App, spettri **sintetici** realistici, plasma otticamente sottile | 22% (n_e 10¹⁷) / 33% (n_e 10¹⁶) | 6% / 29% |
| App, sintetici con autoassorbimento, corretto | 123% (n_e 10¹⁷) / 19% (n_e 10¹⁶) | 33% / 18% |

Sintetici: composizione certificata, T e n_e del gruppo di Pisa (unità di n_e non indicata: provate 10¹⁶ e 10¹⁷ cm⁻³), 220–700 nm, 0,1 nm di risoluzione, rumore di Poisson, lastra di 0,05 cm per l'autoassorbimento.

- **Difetto trovato e corretto**: i multipletti non risolti della stessa specie (Zn I 330 e 334 nm) venivano scartati come righe sovrapposte, e Zn risultava 0 senza avviso. Ora diventano una riga sola.
- **La CF-LIBS dell'app è ancora fragile**: con autoassorbimento forte (n_e alta) la correzione di Palleschi non basta, il Cu esce sottostimato e lo Sn gonfiato. Nel caso sottile a n_e 10¹⁶ la densità da Hα risulta sovrastimata (anomalia da capire). Resta «sperimentale».
- Dataset LIBS pubblici di bronzi con composizione nota e licenza aperta: non trovati.

## Raman: rimozione del fondo della 3.0 su spettri veri

8 polimeri (785 nm) e 13 stesure di pigmenti (633 nm) di identità nota, con le tabelle dei picchi del laboratorio; picco ritrovato se entro ±6 cm⁻¹.

| Metodo (valori consigliati) | Picchi ritrovati, pigmenti | Sotto-sottrazione, pigmenti | Picchi ritrovati, polimeri |
|---|---|---|---|
| nessuna base | 65% | 0% | 55% |
| arPLS | 58% | 2,1% | 56% |
| ALS | 75% | 1,0% | 56% |
| IModPoly | 73% | **13,8%** | 56% |
| SNIP | **77%** | 1,2% | 57% |
| rolling ball | 76% | 11,3% | 61% |

- IModPoly (grado 6), che l'assistente della 3.0 consigliava quando la fluorescenza pesa molto, **sottrae troppo** in 6 spettri di pigmenti su 13 (21–35% dei punti nettamente negativi). **Corretto**: ora si consiglia IModPoly solo se non sottrae troppo, altrimenti SNIP o ALS. Sui 12 spettri veri con fondo oltre il 30%: sotto-sottrazione media dal 18,5% all'1,8%, picchi ritrovati dal 75% al 78%.
- I picchi non ritrovati sono soprattutto quelli deboli sotto i 200 cm⁻¹ e quelli segnati come spostati nelle tabelle.
- Parametri mancanti delle sessioni a 532 nm: laser, tempo ed accumuli ricavati dai metadati dei file WiRE (certezza alta); obiettivo, potenza e pigmento misurato non ricostruibili.
