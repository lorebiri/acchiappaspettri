// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Estensione d'esempio di Acchiappaspettri: file di testo a colonne di larghezza fissa («ACCH-FWF 1»).
   Formato (inventato per l'esempio, documentato in docs/ESTENSIONI.md):
     # ACCH-FWF 1                               prima riga: firma del formato
     # columns: x 1-10 | A 11-20 | B 21-30     colonne: nome, primo e ultimo carattere (da 1, inclusi); la prima è x
     # technique: uv                            facoltativa: tecnica di Acchiappaspettri (ftir, raman, uv, fluo, hplc, …)
     # sample: nome                             facoltativa: nome del campione
     # qualsiasi altra riga con # è un'informazione (meta)
     poi una riga di numeri per punto, ogni numero nella sua colonna; virgola o punto decimale.
   Gira nel worker isolato dell'app: niente DOM, niente rete. Restituisce null se il file non è in questo formato. */
registerReader(function(bytes, name){
  var text=new TextDecoder('utf-8').decode(bytes);
  if (text.charCodeAt(0)===0xFEFF) text=text.slice(1);
  var lines=text.split(/\r\n|\n|\r/);
  if (!/^#\s*ACCH-FWF\s+1\s*$/.test(lines[0]||'')) return null;   // non è un file di questo formato: lo legge l'app, se sa farlo
  var cols=null, technique=null, sample='', meta=[];
  var i, m;
  for (i=1; i<lines.length && /^\s*#/.test(lines[i]); i++){
    var h=lines[i].replace(/^\s*#\s?/,'');
    if ((m=/^columns\s*:\s*(.+)$/i.exec(h))){
      cols=m[1].split('|').map(function(s){ var c=/^\s*(.+?)\s+(\d+)\s*-\s*(\d+)\s*$/.exec(s); if (!c || +c[2]<1 || +c[3]<+c[2]) return null; return {name:c[1], a:+c[2]-1, b:+c[3]}; });
      if (cols.length<2 || cols.some(function(c){ return !c; })) return {error:'riga «columns» non valida: servono almeno due colonne «nome inizio-fine» / invalid «columns» line'};
    } else if ((m=/^technique\s*:\s*(\w+)\s*$/i.exec(h))) technique=m[1].toLowerCase();
    else if ((m=/^sample\s*:\s*(.+)$/i.exec(h))) sample=m[1].trim();
    else if (h.trim()) meta.push(h.trim());
  }
  if (!cols) return {error:'manca la riga «# columns:» / missing «# columns:» line'};
  var xs=[], ys=cols.slice(1).map(function(){ return []; });
  for (; i<lines.length; i++){
    var L=lines[i]; if (!L.trim()) continue;
    for (var k=0; k<cols.length; k++){
      var cell=L.slice(cols[k].a, cols[k].b).trim().replace(',', '.');
      var v=/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(cell) ? parseFloat(cell) : NaN;
      if (!isFinite(v)) return {error:'riga '+(i+1)+', colonna «'+cols[k].name+'»: «'+cell+'» non è un numero / line '+(i+1)+', column «'+cols[k].name+'»: not a number'};
      if (k===0) xs.push(v); else ys[k-1].push(v);
    }
  }
  return {
    sample: sample,
    technique: technique,
    meta: ['Formato: ACCH-FWF 1 (colonne fisse)', 'x: '+cols[0].name].concat(meta),
    channels: cols.slice(1).map(function(c, k){ return {name:c.name, x:xs, y:ys[k]}; })
  };
});
