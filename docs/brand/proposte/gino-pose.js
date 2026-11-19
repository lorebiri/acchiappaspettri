'use strict';
/* Gino nelle sue pose, per i tocchi simpatici nell'interfaccia (stato vuoto, caricamento, successo, errore, 404).
   Disegno piatto, tela 120×130. tono 'colore' per l'app online, 'linea' per il desktop (solo contorno, grigio-blu, discreto). */
const INK='#1c2230', BLU='#2563c9', SOLE='#ffc84a';
function gino(posa='saluta', tono='colore'){
  const linea = tono==='linea'; const st = linea ? '#6b7f9e' : INK; const fill = linea ? 'none' : '#fff';
  const corpo = `<path d="M22 64a38 38 0 0 1 76 0v54l-9.5-7-9.5 7-9.5-7-9.5 7-9.5-7-9.5 7-9.5-7z" fill="${fill}" stroke="${st}" stroke-width="4" stroke-linejoin="round"/>`;
  const occhi = { normali:`<circle cx="48" cy="60" r="5" fill="${st}"/><circle cx="72" cy="60" r="5" fill="${st}"/>`,
    felici:`<path d="M42 62q6-8 12 0M66 62q6-8 12 0" fill="none" stroke="${st}" stroke-width="4" stroke-linecap="round"/>`,
    preoccupati:`<circle cx="48" cy="62" r="4.5" fill="${st}"/><circle cx="72" cy="62" r="4.5" fill="${st}"/><path d="M41 50l12 4M79 50l-12 4" stroke="${st}" stroke-width="3.5" stroke-linecap="round"/>` };
  const tr = linea ? st : BLU;
  const pose = {
    saluta: corpo + occhi.normali + `<path d="M54 78q6 5 12 0" fill="none" stroke="${st}" stroke-width="3.5" stroke-linecap="round"/><path d="M98 70q14-6 16-22" fill="none" stroke="${st}" stroke-width="4" stroke-linecap="round"/><circle cx="114" cy="46" r="6" fill="${fill}" stroke="${st}" stroke-width="4"/>`,
    acchiappa: corpo + occhi.normali + `<path d="M4 96h28c8 0 12-26 28-26s20 26 28 26h28" fill="none" stroke="${linea?st:SOLE}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="24" cy="96" r="7" fill="${fill}" stroke="${st}" stroke-width="4"/><circle cx="96" cy="96" r="7" fill="${fill}" stroke="${st}" stroke-width="4"/>`,
    contento: corpo + occhi.felici + `<path d="M50 76q10 10 20 0" fill="${linea?'none':INK}" stroke="${st}" stroke-width="3.5" stroke-linejoin="round"/><path d="M104 28l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="${linea?'none':SOLE}" stroke="${linea?st:'none'}" stroke-width="2"/>`,
    preoccupato: corpo + occhi.preoccupati + `<ellipse cx="60" cy="80" rx="5" ry="6" fill="${st}"/><path d="M100 50q4 8 0 12q-4-4 0-12z" fill="${linea?'none':'#7ab8ff'}" stroke="${linea?st:'none'}" stroke-width="2"/>`,
    perso: corpo + occhi.normali + `<path d="M52 80h16" stroke="${st}" stroke-width="3.5" stroke-linecap="round"/><text x="96" y="40" font-family="system-ui,sans-serif" font-size="34" font-weight="800" fill="${linea?st:BLU}">?</text>`,
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 124 130">${pose[posa]}</svg>`;
}
module.exports = { gino };
