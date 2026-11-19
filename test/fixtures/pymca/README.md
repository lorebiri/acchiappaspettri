# File d'esempio di PyMca

Servono ai test di `app/pymca-cfg-core.js` (`test/unit/pymca-cfg.test.js`), al confronto con PyMca e all'esempio di `validazione/certificati/`. Non entrano nei pacchetti dell'app.

| File | Origine | Licenza |
|---|---|---|
| `McaTheory.cfg`, `Steel.cfg`, `Steel.spe`, `XRFSpectrum.mca` | copiati **senza modifiche** da `PyMca5/PyMcaData/` di PyMca 5.9.7 (https://github.com/vasole/pymca) | MIT, © ESRF (testo sotto) |
| `prova-formato.cfg` | scritto per Acchiappaspettri: tutti i casi del formato ConfigDict | GPL-3.0-or-later |
| `verifica-pymca.json` | generato da `node scripts/pymca-cfg-verifica.js` con PyMca 5.9.7 e fisx 1.3.2: ciò che ConfigDict legge da ogni file, i testi scritti dal modulo, il fit di `Steel.spe` | GPL-3.0-or-later (contiene dati dei file sopra) |

`Steel.spe` è lo spettro di un acciaio inossidabile NIST SRM 1155 eccitato con un fascio monocromatico a 16 keV; `Steel.cfg` è la sua configurazione. `XRFSpectrum.mca` è uno standard sottile multielemento (Mo monocromatizzato, circa 17,5 keV; le condizioni sono scritte in testa al file).

Quando cambia la scrittura del modulo, il test lo segnala: rigenerare il JSON con

```sh
node scripts/pymca-cfg-verifica.js /percorso/python   # python con pymca==5.9.7 fisx==1.3.2
```

```text
The PyMca X-Ray Fluorescence Toolkit is Copyright (C) 2004-2023 of the
European Synchrotron Radiation Facility (ESRF).

The MIT License (MIT)

Copyright (c) 2004-2023 European Synchrotron Radiation Facility (ESRF)

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```
