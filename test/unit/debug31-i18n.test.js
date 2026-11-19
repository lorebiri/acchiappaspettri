// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Debug 3.1 indipendente: traduzione inglese di note composte da elenchi (prima solo la prima voce era tradotta) e dei testi
// con i simboli del desktop (△ al posto di ⚠️). Dizionario vero (i18n/en.js) e traduttore vero (app/i18n.js).
const test=require('node:test'), assert=require('node:assert/strict'), vm=require('vm'), fs=require('fs'), path=require('path');
const root=path.join(__dirname,'..','..'), w={localStorage:{getItem:()=>'en', setItem(){}}, navigator:{language:'en'}};
vm.runInNewContext(fs.readFileSync(path.join(root,'i18n/en.js'),'utf8'), {window:w}); const I=require('../../app/i18n.js')(w);

test('note XRF 3.1 con elenchi e simboli del desktop: tradotte per intero', ()=>{
  const cases=[
    ['△ Il file dichiara 40 kV, ma il calcolo usa 35 kV: il modello arriva a 50 kV, quindi la stima è meno affidabile.', /^△ The file declares 40 kV, but the calculation uses 35 kV/],
    ['⚠️ Pb non è distinguibile da As con questo spettro: nel calcolo entra As; Sb non è distinguibile da Sn con questo spettro: nel calcolo entra Sn.', /^⚠️ Pb cannot be told apart from As in this spectrum: As goes into the calculation; Sb cannot be told apart from Sn in this spectrum: Sn goes into the calculation\.$/],
    ['Eccitazione a lista di energie (monocromatica a 17,50 keV): anodo e tensione del tubo non contano.', /\(monochromatic at 17,50 keV\)/],
    ['Sb (riga analitica non significativa: 0,04 ± 0,05%), I (riga analitica non significativa: 0,1 ± 0,2%)', /^Sb \(analytical line not significant: 0,04 ± 0,05%\), I \(analytical line not significant: 0,1 ± 0,2%\)$/],
    ['⚠️ Valori poco sicuri per righe sovrapposte: As (riga vicina a Pb), Sb (riga vicina a Sn). Un elemento così può anche non esserci: cerca una seconda riga.', /As \(line close to Pb\), Sb \(line close to Sn\)/]];
  for (const [it, re] of cases){ const en=I.tr(it); assert.match(en, re, en); assert.ok(!/riga|non è|sotto la soglia|monocromatica/.test(en), 'resta dell\'italiano: '+en); }
});
