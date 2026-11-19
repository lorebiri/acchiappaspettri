# Prototipo: PyMca e Acchiappaspettri sugli stessi spettri XRF

**Solo studio.** Non fa parte dell'app e non entra nei pacchetti. Risultati e commento in [`docs/studi/XRF-PYMCA-PALLESCHI.md`](../../docs/studi/XRF-PYMCA-PALLESCHI.md).

| File | Cosa fa |
|---|---|
| `pymca_confronto.py` | PyMca 5.9.7 (con fisx 1.3.2) su `Steel.spe`/`Steel.cfg` (dati d'esempio di PyMca, acciaio NIST SRM 1155, 16 keV monocromatico) e sul bronzo SINTETICO di `examples/xrf-lega-sintetico` (tubo Rh 40 kV, spettro del tubo di Ebel) |
| `acch_confronto.js` | il nucleo FP di `index.html` sugli stessi due spettri |
| `risultati-pymca.json`, `risultati-acch.json` | uscite del 19/11/2026 |

```sh
python3 -m venv venv && venv/bin/pip install pymca==5.9.7 fisx==1.3.2 numpy
git clone https://github.com/vasole/pymca          # per Steel.spe, Steel.cfg, McaTheory.cfg (src/PyMca5/PyMcaData)
venv/bin/python -I pymca_confronto.py pymca/src/PyMca5/PyMcaData ../../examples/xrf-lega-sintetico/BRONZO_SIMULATO_Rh40kV_SINTETICO.mca
node acch_confronto.js pymca/src/PyMca5/PyMcaData/Steel.spe
```

Limiti: per `Steel.spe` Acchiappaspettri non sa descrivere un fascio monocromatico; lo script sostituisce lo spettro del tubo nella cache con una riga a 16 keV (trucco da prototipo). Le condizioni del bronzo in PyMca (aria, finestre) sono approssimate a quelle che l'app presume. Lo spettro del bronzo è generato con il modello dell'app stessa: favorisce Acchiappaspettri.
