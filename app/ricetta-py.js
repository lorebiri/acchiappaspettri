// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Ricetta esportata come script Python (tappa I12, SPEC-AVANZATE §4): parte pura, senza pagina.
   script(ricetta) compone il file .py: intestazione (licenza GPL-3.0-or-later e titolare, versione, data, impronte dei file),
   i parametri della ricetta in JSON e il modulo acch_ricetta (app/ricetta-py-modello.js, generato da scripts/ricetta-py/acch_ricetta.py).
   Funziona nella pagina (window.AcchRicettaPy) e in Node (require), per i test. */
(function(root, factory){
  const api=factory(typeof module==='object' && module.exports ? require('./ricetta-py-modello.js') : root.AcchRicettaPyModello);
  if (typeof module==='object' && module.exports) module.exports=api;
  else root.AcchRicettaPy=api;
})(typeof self!=='undefined' ? self : this, function(MODELLO){
  'use strict';
  const GPL_EN=[
    'This program is free software: you can redistribute it and/or modify it under the terms of the',
    'GNU General Public License as published by the Free Software Foundation, either version 3 of the',
    'License, or (at your option) any later version.',
    'This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without',
    'even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU',
    'General Public License for more details: <https://www.gnu.org/licenses/>.'];
  const T={
    it:{titolo:'ricetta come script Python', esportata:'Ricetta esportata da Acchiappaspettri', il:'il',
      gpl:'Lo script contiene codice derivato da Acchiappaspettri ed è distribuito con la stessa licenza, GPL-3.0-or-later.',
      req:'Requisiti: Python >= 3.10 e la sola libreria standard (re, json, math, struct, hashlib, decimal, argparse, functools, unicodedata; fractions e ctypes solo dove servono).',
      noNp:'numpy (>= 1.26) e scipy (>= 1.11) non servono: le funzioni sono trascritte operazione per operazione, perché i filtri di numpy e scipy hanno bordi e ordine delle somme diversi e cambierebbero i numeri.',
      uso:'Uso: python3 ricetta.py [--dati CARTELLA] [--uscita CARTELLA]   (file nuovi: --file A.csv B.csv --tecnica ftir)',
      rete:'Nessun accesso alla rete. Lo script legge solo la cartella dei dati e scrive solo nella cartella di uscita.',
      fonti:'File sorgente (SHA-256 dei byte, modo di lettura):', testo:'rilettura del file di testo', byte:'lettura del file originale con il lettore dell\'app trascritto', csv:'CSV dei dati letti scritto dall\'app',
      estensione:'letto dall\'estensione', noteEst:'Nota: gli spettri letti da un\'estensione (lettore aggiunto all\'app) si rileggono dal CSV dei dati letti: il lettore dell\'estensione non fa parte dello script.',
      noteCsv:'Nota: per i file che il lettore trascritto non ricostruisce identici (estensioni, Excel, progetti Origin, serie e i rari casi in cui i numeri non coincidono) lo script legge il CSV dei dati letti dall\'app, nella cartella dati.',
      nonTr:'Parti del progetto non trascritte (lo script le segnala con un errore, senza approssimarle):',
      esito:'Esito: 0 identico all\'app; 1 numeri diversi; 2 file mancanti o diversi; 3 identico, ma con parti non trascritte.'},
    en:{titolo:'recipe as a Python script', esportata:'Recipe exported from Acchiappaspettri', il:'on',
      gpl:'The script contains code derived from Acchiappaspettri and is distributed under the same licence, GPL-3.0-or-later.',
      req:'Requirements: Python >= 3.10 and the standard library only (re, json, math, struct, hashlib, decimal, argparse, functools, unicodedata; fractions and ctypes only where needed).',
      noNp:'numpy (>= 1.26) and scipy (>= 1.11) are not needed: the functions are transcribed operation by operation, because the numpy and scipy filters handle edges and summation order differently and would change the numbers.',
      uso:'Usage: python3 ricetta.py [--dati FOLDER] [--uscita FOLDER]   (new files: --file A.csv B.csv --tecnica ftir)',
      rete:'No network access. The script reads only the data folder and writes only to the output folder.',
      fonti:'Source files (SHA-256 of the bytes, reading mode):', testo:'re-reading of the text file', byte:'reading of the original file with the transcribed reader of the app', csv:'CSV of the data as read, written by the app',
      estensione:'read by the extension', noteEst:'Note: spectra read by an extension (a reader added to the app) are re-read from the CSV of the data as read: the reader of the extension is not part of the script.',
      noteCsv:'Note: for files that the transcribed reader does not rebuild identically (extensions, Excel, Origin projects, series and the rare cases where the numbers do not match) the script reads the CSV of the data as read by the app, in the data folder.',
      nonTr:'Parts of the project that are not transcribed (the script reports them with an error, without approximating them):',
      esito:'Exit code: 0 identical to the app; 1 different numbers; 2 missing or different files; 3 identical, but with parts not transcribed.'}
  };
  // testi mostrati dallo script mentre lavora (anche per l'aiuto di argparse)
  const RUN={
    it:{titolo:'ricetta Python', descrizione:'Rifà lettura, elaborazioni, picchi, aree e tarature del progetto con gli stessi numeri dell\'app.',
      aiutoDati:'cartella con i file originali e i CSV dei dati letti (predefinita: dati accanto allo script)', aiutoUscita:'cartella dei risultati (predefinita: risultati accanto allo script)',
      aiutoFile:'file nuovi a cui applicare le impostazioni per tecnica (lettura semplificata, solo picchi automatici)', aiutoTecnica:'tecnica dei file nuovi (ftir, raman, uv, hplc, …)',
      nuoviFile:'File nuovi elaborati con le impostazioni della ricetta: lettura semplificata, nessun confronto con l\'app.',
      nonTrascritta:'ERRORE, non trascritta in modo identico', verificaDiversa:'verifica: DIVERSO dall\'app', verificaIdentica:'verifica: identico'},
    en:{titolo:'Python recipe', descrizione:'Redoes reading, processing, peaks, areas and calibrations of the project with the same numbers as the app.',
      aiutoDati:'folder with the original files and the CSVs of the data as read (default: dati next to the script)', aiutoUscita:'results folder (default: risultati next to the script)',
      aiutoFile:'new files to which the per-technique settings are applied (simplified reading, automatic peaks only)', aiutoTecnica:'technique of the new files (ftir, raman, uv, hplc, …)',
      nuoviFile:'New files processed with the recipe settings: simplified reading, no comparison with the app.',
      nonTrascritta:'ERROR, not transcribed identically', verificaDiversa:'check: DIFFERENT from the app', verificaIdentica:'check: identical'}
  };
  const lang=r=>r && r.lingua==='en' ? 'en' : 'it';
  // la ricetta in un letterale Python: stringa grezza se possibile (leggibile), altrimenti stringa JSON con le sequenze di escape
  function literal(obj){ const j=JSON.stringify(obj, null, 1); if (!j.includes("'''") && !/\\$/.test(j)) return "json.loads(r'''\n"+j+"\n''')"; return 'json.loads('+JSON.stringify(j)+')'; }
  const oneLine=s=>String(s==null?'':s).replace(/[\r\n\u2028\u2029]+/g,' ');
  function header(r){
    const t=T[lang(r)], L=[];
    L.push('#!/usr/bin/env python3', '# -*- coding: utf-8 -*-', '# SPDX-License-Identifier: GPL-3.0-or-later', '# SPDX-FileCopyrightText: '+(r.anno||'2026')+' '+r.titolare, '#');
    L.push('# '+t.esportata+' '+r.versione+', '+t.il+' '+r.data+'.', '# Copyright (C) '+(r.anno||'2026')+' '+r.titolare+'.', '# '+t.gpl, '#');
    GPL_EN.forEach(l=>L.push('# '+l));
    L.push('#', '# '+t.req, '# '+t.noNp, '# '+t.uso, '# '+t.rete, '# '+t.esito, '#', '# '+t.fonti);
    (r.spettri||[]).forEach(s=>{ const le=s.lettura||{}; L.push('#   '+oneLine(le.origine||s.nome)+'  '+(le.sha256||le.impronta||'')+'  ('+(le.modo==='testo'?t.testo:le.modo==='byte'?t.byte:t.csv)+(le.estensione?', '+t.estensione+' '+oneLine(le.estensione):'')+')'); });
    if ((r.spettri||[]).some(s=>s.lettura && s.lettura.modo==='csv')) L.push('# '+t.noteCsv);
    if ((r.spettri||[]).some(s=>s.lettura && s.lettura.estensione)) L.push('# '+t.noteEst);
    if ((r.nonTrascritte||[]).length){ L.push('#', '# '+t.nonTr); r.nonTrascritte.forEach(x=>L.push('#   - '+oneLine(x))); }
    L.push('', 'import sys', 'if sys.version_info < (3, 10):', "    sys.exit('Python >= 3.10')", 'import json', '');
    return L.join('\n');
  }
  function script(r){
    if (!MODELLO) throw new Error('modello dello script Python non caricato');
    const rr=Object.assign({}, r, {testi:Object.assign({}, RUN[lang(r)], r.testi||{})});
    return header(rr)+'\n# Parametri della ricetta (letti dall\'app al momento dell\'esportazione)\nRICETTA = '+literal(rr)+'\n\n'+MODELLO+"\n\nif __name__ == '__main__':\n    sys.exit(main(sys.argv[1:]))\n";
  }
  return {script, header, literal, RUN, T};
});
