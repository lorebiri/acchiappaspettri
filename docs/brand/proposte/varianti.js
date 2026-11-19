'use strict';
/* Proposte di icona ibrida (fase 1). Ogni variante ha:
   - bg: colore del fondo; body(): il disegno su tela 1024×1024, area utile circa 200..824;
   - small(): versione semplificata per 16 e 32 px (stessa forma, meno dettagli, tratti più spessi).
   Le forme di fondo (quadrato arrotondato e tondo) sono comuni a tutte. Tutto disegnato a mano, nessuna immagine di terzi. */
const C = { blu:'#2563c9', bluScuro:'#1d3557', azzurro:'#4fa3e0', celeste:'#9ec5ff', grigioBlu:'#8fa8c8', inchiostro:'#1c2230', sole:'#ffc84a', bianco:'#ffffff' };

// orlo ondulato del fantasmino tra x0 e x1, da destra verso sinistra, alla quota y (punte in basso) con onde alte h
function orlo(x0, x1, y, h, n){ let d=''; const w=(x1-x0)/n; for (let i=n-1;i>=0;i--){ const xa=x0+i*w; d+=` L${(xa+w/2).toFixed(1)} ${y-h} L${xa.toFixed(1)} ${y}`; } return d; }

const V = {
  A: { nome:'A · Il picco è Gino', idea:'Il picco gaussiano è Gino: la campana ha l\u2019orlo ondulato del fantasmino e le code si allungano in una linea di base. Fondo blu dell\u2019app online.',
    bg: C.blu,
    body(){ const campana = `M168 720 C300 720 372 676 410 540 C440 420 464 248 512 248 C560 248 584 420 614 540 C652 676 724 720 856 720 L688 720 L688 776 L644 728 L600 776 L556 728 L512 776 L468 728 L424 776 L380 728 L336 776 L336 720 Z`;
      return `<path d="${campana}" fill="${C.bianco}" stroke="${C.bianco}" stroke-width="28" stroke-linejoin="round"/>
  <ellipse cx="474" cy="452" rx="26" ry="36" fill="${C.inchiostro}"/><ellipse cx="550" cy="452" rx="26" ry="36" fill="${C.inchiostro}"/>
  <path d="M168 720 H336 M688 720 H856" stroke="${C.bianco}" stroke-width="28" stroke-linecap="round"/>`; },
    small(){ const campana = `M120 730 C280 730 350 690 392 540 C424 420 452 210 512 210 C572 210 600 420 632 540 C674 690 744 730 904 730 L700 730 L700 810 L637 740 L575 810 L512 740 L449 810 L387 740 L324 810 L324 730 Z`;
      return `<path d="${campana}" fill="${C.bianco}" stroke="${C.bianco}" stroke-width="56" stroke-linejoin="round"/>
  <ellipse cx="466" cy="470" rx="40" ry="54" fill="${C.inchiostro}"/><ellipse cx="558" cy="470" rx="40" ry="54" fill="${C.inchiostro}"/>`; } },

  B: { nome:'B · Gino afferra la curva', idea:'Gino stringe con le manine un tracciato giallo con un picco, come chi ha appena acchiappato qualcosa. Fondo blu scuro del desktop 3.0.',
    bg: C.bluScuro,
    body(){ const corpo = `M322 790 L322 480 A190 190 0 0 1 702 480 L702 790${orlo(322,702,790,46,4)} Z`;
      const traccia = 'M168 664 H384 C432 664 456 528 512 528 C568 528 592 664 640 664 H856';
      return `<path d="${corpo}" fill="${C.bianco}"/>
  <circle cx="446" cy="440" r="32" fill="${C.inchiostro}"/><circle cx="578" cy="440" r="32" fill="${C.inchiostro}"/>
  <path d="${traccia}" fill="none" stroke="${C.bluScuro}" stroke-width="84" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${traccia}" fill="none" stroke="${C.sole}" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="318" cy="664" r="42" fill="${C.bianco}" stroke="${C.bluScuro}" stroke-width="20"/><circle cx="706" cy="664" r="42" fill="${C.bianco}" stroke="${C.bluScuro}" stroke-width="20"/>`; },
    small(){ const corpo = `M300 800 L300 480 A212 212 0 0 1 724 480 L724 800${orlo(300,724,800,70,3)} Z`;
      const traccia = 'M150 680 H380 C430 680 460 540 512 540 C564 540 594 680 644 680 H874';
      return `<path d="${corpo}" fill="${C.bianco}"/>
  <circle cx="436" cy="430" r="48" fill="${C.inchiostro}"/><circle cx="588" cy="430" r="48" fill="${C.inchiostro}"/>
  <path d="${traccia}" fill="none" stroke="${C.bluScuro}" stroke-width="120" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${traccia}" fill="none" stroke="${C.sole}" stroke-width="68" stroke-linecap="round" stroke-linejoin="round"/>`; } },

  C: { nome:'C · Il 3.0 con l’occhiolino', idea:'È l’icona professionale del desktop 3.0 (curva bianca su blu scuro), ma il picco ha il corpo e gli occhi di Gino. Da lontano è sobria, da vicino sorride.',
    bg: C.bluScuro,
    body(){ const curva = 'M200 712 C320 712 352 700 380 620 C406 530 432 292 512 292 C592 292 618 530 644 620 C672 700 704 712 824 712';
      const corpo = `M380 620 C406 530 432 292 512 292 C592 292 618 530 644 620 L644 712${orlo(380,644,712,40,4)} Z`;
      return `<path d="M200 760 H824" fill="none" stroke="${C.grigioBlu}" stroke-width="28" stroke-linecap="round"/>
  <path d="${corpo}" fill="${C.blu}"/>
  <path d="${curva}" fill="none" stroke="${C.bianco}" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="474" cy="470" r="30" fill="${C.bianco}"/><circle cx="550" cy="470" r="30" fill="${C.bianco}"/>
  <circle cx="480" cy="478" r="14" fill="${C.inchiostro}"/><circle cx="556" cy="478" r="14" fill="${C.inchiostro}"/>`; },
    small(){ const curva = 'M170 730 C300 730 340 716 370 620 C400 520 430 250 512 250 C594 250 624 520 654 620 C684 716 724 730 854 730';
      const corpo = `M370 620 C400 520 430 250 512 250 C594 250 624 520 654 620 L654 730${orlo(370,654,730,60,3)} Z`;
      return `<path d="${corpo}" fill="${C.blu}"/>
  <path d="${curva}" fill="none" stroke="${C.bianco}" stroke-width="76" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="482" cy="500" r="26" fill="${C.bianco}"/><circle cx="542" cy="500" r="26" fill="${C.bianco}"/>`; } },
};

// forma: 'quadrato' (quadrato arrotondato con margine, come macOS e il 3.0), 'tondo' (Android e PWA mascherabili),
// 'pieno' (tutta la tela, per iOS che arrotonda da sé), 'nudo' (senza fondo: il segno su sfondi colorati)
function svg(k, forma='quadrato', piccolo=false){
  const v=V[k]; const corpo = piccolo ? v.small() : v.body();
  // sui fondi blu scuro un bordino appena più chiaro tiene staccata l'icona dai temi scuri
  const bordo = v.bg===C.bluScuro && forma!=='pieno' ? ` stroke="#3a5a88" stroke-width="${piccolo?32:16}"` : '';
  const fondo = forma==='tondo' ? `<circle cx="512" cy="512" r="448" fill="${v.bg}"${bordo}/>`
    : forma==='pieno' ? `<rect width="1024" height="1024" fill="${v.bg}"/>`
    : forma==='nudo' ? ''
    : piccolo ? `<rect x="16" y="16" width="992" height="992" rx="200" fill="${v.bg}"${bordo}/>`   // a 16-32 px il margine si mangia il disegno
    : `<rect x="64" y="64" width="896" height="896" rx="200" fill="${v.bg}"${bordo}/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <!-- Acchiappaspettri, proposta di icona ibrida ${v.nome}${piccolo?' (versione per 16-32 px)':''} -->
  ${fondo}
  ${corpo}
</svg>
`; }

module.exports = { V, C, svg };
