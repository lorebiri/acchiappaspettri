// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Parti pure del controllo del dato (tappa I6), spostate qui dalla funzione assess di index.html senza cambiare un'operazione:
   così nel desktop si possono calcolare nel worker del nucleo (app/engine.js, elenco HEAVY) e con 1M punti la finestra non si ferma.
   Caricato dalla pagina prima del nucleo e dal worker prima di core.js; usa sortedAt del nucleo, che c'è in tutti e due al momento della chiamata. */
'use strict';
/* buchi dell'asse X: passo mediano ms e i tratti con un passo oltre 10 volte la mediana, come coppie [x_i, x_i+1] */
function axisGaps(xs){ const n=xs.length, st=new Float64Array(n-1); for (let i=1;i<n;i++) st[i-1]=Math.abs(xs[i]-xs[i-1]); const ms=sortedAt(st, st.length>>1); const gaps=[]; st.forEach((v,i)=>{ if (ms>0 && v>10*ms) gaps.push([xs[i],xs[i+1]]); }); return {ms, gaps}; }
if (typeof module==='object' && module.exports) module.exports={axisGaps};
