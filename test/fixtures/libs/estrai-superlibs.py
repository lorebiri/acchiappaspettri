#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
# SPDX-License-Identifier: GPL-3.0-or-later
"""Estrae UNO spettro LIBS reale con composizione nota dal dataset pubblico SuperLIBS 10K (Mount Holyoke College), per i test.
Fonte: Lepore K., Dyar M.D., Ytsma C.R. (2023). Mount Holyoke College Laser Induced Breakdown Spectra; SuperLIBS 10K; Earth and
vacuum atmospheres. Zenodo, doi:10.5281/zenodo.10287455. Licenza CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
Il file ridistribuito (superlibs-0201H.csv) è un estratto MODIFICATO: una sola riga (pastiglia 0201H, atmosfera terrestre, 3,2 mJ),
trasposta in due colonne e arrotondata a 6 cifre significative. Nei dati originali gli spettri sono già elaborati dagli autori:
fondo tolto (airPLS) e normalizzati SEPARATAMENTE in ciascuna delle tre regioni (UV, VIS, VIS-NIR).
Uso: python3 -I test/fixtures/libs/estrai-superlibs.py  (scarica solo i primi 1,5 MB del file da 330 MB, con una richiesta Range)"""
import os, urllib.request
URL = 'https://zenodo.org/api/records/10287455/files/zenodo.10K_EARTH.3.2mJ.csv/content'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'superlibs-0201H.csv')
req = urllib.request.Request(URL, headers={'Range': 'bytes=0-1500000', 'User-Agent': 'test-fixture-extractor'})
txt = urllib.request.urlopen(req, timeout=300).read().decode('utf-8')
rows = [r.split(',') for r in txt.split('\n')]
head = rows[1]
row = next(r for r in rows[2:] if len(r) == len(head) and r[9] == '0201H')
comp = {head[i].replace(' (wt %)', ''): float(row[i]) for i in range(1, 9)}
g6 = lambda v: '%.6g' % float(v)
with open(OUT, 'w', encoding='utf-8', newline='\n') as fh:
    fh.write('# Spettro LIBS reale, pastiglia 0201H (SuperLIBS 10K, Mount Holyoke College), atmosfera terrestre, 3,2 mJ\n')
    fh.write('# Fonte: Lepore K., Dyar M.D., Ytsma C.R. (2023), Zenodo, doi:10.5281/zenodo.10287455, licenza CC BY 4.0\n')
    fh.write('# Estratto modificato da test/fixtures/libs/estrai-superlibs.py: una riga, trasposta, 6 cifre significative\n')
    fh.write('# Dati degli autori: fondo tolto (airPLS), normalizzati separatamente nelle regioni UV, VIS, VIS-NIR\n')
    fh.write('# Composizione dichiarata (% in peso): ' + ', '.join('%s %g' % kv for kv in comp.items()) + '\n')
    fh.write('wavelength_nm,intensity\n')
    for w, y in zip(head[10:], row[10:]):
        fh.write(g6(w) + ',' + g6(y) + '\n')
print('scritto', OUT, os.path.getsize(OUT), 'byte', comp)
