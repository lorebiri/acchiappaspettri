// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Gino, il fantasmino, nelle sue pose per i momenti «di servizio» (docs/brand/PROPOSTE-ICONA.md):
   stato vuoto, caricamento, successo, errore, pagina 404. Mai su risultati, grafici, PDF o testi scientifici.
   tono 'colore' per l'app online (il pulsante «Sobrio» lo nasconde), 'linea' per il desktop: solo contorno grigio-blu, piccolo.
   Disegno originale, piatto, tela 124×130. Nessun testo dentro (il desktop non nomina Gino). */
(function(){
  'use strict';
  const INK='#1c2230', BLU='#2563c9', SOLE='#ffc84a', LINEA='#6b7f9e';
  function svg(posa, tono){
    const linea=tono==='linea', st=linea?LINEA:INK, fill=linea?'none':'#fff';
    const corpo=`<path d="M22 64a38 38 0 0 1 76 0v54l-9.5-7-9.5 7-9.5-7-9.5 7-9.5-7-9.5 7-9.5-7z" fill="${fill}" stroke="${st}" stroke-width="4" stroke-linejoin="round"/>`;
    const occhi={ normali:`<circle cx="48" cy="60" r="5" fill="${st}"/><circle cx="72" cy="60" r="5" fill="${st}"/>`,
      felici:`<path d="M42 62q6-8 12 0M66 62q6-8 12 0" fill="none" stroke="${st}" stroke-width="4" stroke-linecap="round"/>`,
      preoccupati:`<circle cx="48" cy="62" r="4.5" fill="${st}"/><circle cx="72" cy="62" r="4.5" fill="${st}"/><path d="M41 50l12 4M79 50l-12 4" stroke="${st}" stroke-width="3.5" stroke-linecap="round"/>` };
    const pose={
      saluta: corpo+occhi.normali+`<path d="M54 78q6 5 12 0" fill="none" stroke="${st}" stroke-width="3.5" stroke-linecap="round"/><path d="M98 70q14-6 16-22" fill="none" stroke="${st}" stroke-width="4" stroke-linecap="round"/><circle cx="114" cy="46" r="6" fill="${fill}" stroke="${st}" stroke-width="4"/>`,
      acchiappa: corpo+occhi.normali+`<path d="M4 96h28c8 0 12-26 28-26s20 26 28 26h28" fill="none" stroke="${linea?st:SOLE}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="24" cy="96" r="7" fill="${fill}" stroke="${st}" stroke-width="4"/><circle cx="96" cy="96" r="7" fill="${fill}" stroke="${st}" stroke-width="4"/>`,
      contento: corpo+occhi.felici+`<path d="M50 76q10 10 20 0" fill="${linea?'none':INK}" stroke="${st}" stroke-width="3.5" stroke-linejoin="round"/><path d="M104 28l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="${linea?'none':SOLE}" stroke="${linea?st:'none'}" stroke-width="2"/>`,
      preoccupato: corpo+occhi.preoccupati+`<ellipse cx="60" cy="80" rx="5" ry="6" fill="${st}"/><path d="M100 50q4 8 0 12q-4-4 0-12z" fill="${linea?'none':'#7ab8ff'}" stroke="${linea?st:'none'}" stroke-width="2"/>`,
      perso: corpo+occhi.normali+`<path d="M52 80h16" stroke="${st}" stroke-width="3.5" stroke-linecap="round"/><path d="M100 30a9 9 0 1 1 13 8c-3 2-4 3-4 7" fill="none" stroke="${linea?st:BLU}" stroke-width="5" stroke-linecap="round"/><circle cx="109" cy="54" r="3.5" fill="${linea?st:BLU}"/>`
    };
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 124 130" aria-hidden="true" focusable="false">${pose[posa]||pose.saluta}</svg>`;
  }
  /* posa dell'avviso in basso: preoccupato per errori e avvisi, contento per le conferme; nessun Gino per le informazioni neutre */
  function posaAvviso(txt, sev){ txt=String(txt); if (sev>0 || /^\s*(😬|🤔)/u.test(txt)) return 'preoccupato';
    return /^\s*(✓|✅|📂|💾|🎉|Preso|Acchiappat|Fatto|Pronto|Salvat|Scaricat|Esportat|Copiat|Confronto creato|Progetto (aperto|salvato))/iu.test(txt) ? 'contento' : ''; }
  function fill(root){ (root||document).querySelectorAll('[data-gino]').forEach(el=>{ if (el.firstChild) return; const [posa,tono]=el.dataset.gino.split(' '); el.innerHTML=svg(posa,tono||'colore'); }); }
  const G={svg, posaAvviso, fill};
  if (typeof window!=='undefined'){ window.AcchGino=G; if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>fill()); else fill(); }
  if (typeof module!=='undefined') module.exports=G;
})();
