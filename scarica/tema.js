// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Tema scelto da chi visita (chiaro o scuro), applicato prima del disegno della pagina per evitare il lampo del tema sbagliato.
// Il pulsante che lo cambia è in avvio.js. Senza una scelta vale il tema del sistema (CSS prefers-color-scheme).
(function () {
  try {
    var t = localStorage.getItem('acch-sito-tema');
    if (t === 'chiaro' || t === 'scuro') document.documentElement.setAttribute('data-tema', t);
  } catch (e) { /* localStorage non disponibile: tema del sistema */ }
})();
