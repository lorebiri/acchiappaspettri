// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// «Segnala un problema», parte pura (app/segnala-core.js): registro, pulizia dei testi, corpo, mailto, oscuramento. Dati SINTETICI.
'use strict';
const {describe, it}=require('node:test'), assert=require('node:assert');
const C=require('../../app/segnala-core.js');

const base=(o)=>{ const info=Object.assign({version:'3.0.0', desktop:true, os:'windows', kind:'nsis', arch:'x86_64', ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Edg/131.0',
  lang:'it', plotLang:'en', width:1366, height:768, scale:1.25, technique:'FTIR', format:'.csv', nFiles:2, fileName:'campione-segreto.csv', consent:false, entries:[], files:C.fileNames([{name:'campione-segreto.csv', path:'lab/campione-segreto.csv'}])}, o||{});
  return {version:info.version, lang:info.lang, desktop:info.desktop, doing:'esportavo il PDF', expect:'mi aspettavo il file', summary:C.summary(info)}; };
const bodyOf=u=>decodeURIComponent(u.split('&body=')[1]);

describe('Segnala un problema: parte pura', ()=>{
  it('oggetto, destinatario e corpo con i due spazi da compilare e i dati tecnici', ()=>{
    const m=C.mailto(base());
    assert.ok(m.url.startsWith('mailto:lorenzo.birindelli@cnr.it?subject='));
    assert.strictEqual(decodeURIComponent(m.url.split('subject=')[1].split('&')[0]), 'Acchiappaspettri 3.0.0: segnalazione di un problema');
    const b=bodyOf(m.url);
    for (const s of ['Cosa stavo facendo quando è successo:\r\nesportavo il PDF', 'Cosa mi aspettavo e cosa è successo invece:\r\nmi aspettavo il file', 'Versione di Acchiappaspettri: 3.0.0', 'Edizione: desktop (nsis, x86_64)', 'Sistema: Windows 10/11 · Edge 131', 'interfaccia it, grafici en', 'FTIR, .csv (2 file caricati)'])
      assert.ok(b.includes(s), 'manca «'+s+'» in:\n'+b);
    assert.ok(!/%0A(?<!%0D%0A)/.test(m.url.replace(/%0D%0A/g,'')), 'a capo come CRLF (RFC 6068)');
    assert.strictEqual(C.mailto(Object.assign(base({lang:'en'}),{lang:'en'})).subject, 'Acchiappaspettri 3.0.0: problem report');
  });
  it('senza consenso il nome del file non compare, nemmeno nel registro; con il consenso sì', ()=>{
    const entries=[{level:'WARN', msg:'⚠ campione-segreto.csv: colonna x non monotona', t:new Date(2026,10,13,9,0,0), n:1}];
    const no=C.mailto(base({entries})), yes=C.mailto(base({entries, consent:true}));
    assert.ok(!/campione-segreto/.test(bodyOf(no.url)), bodyOf(no.url));
    assert.ok(bodyOf(no.url).includes('09:00:00 [WARN] ⚠ ‹file›: colonna x non monotona'));
    assert.ok(bodyOf(yes.url).includes('Nome del file: campione-segreto.csv'));
  });
  it('percorsi e cartelle personali ridotti al nome del file; gli indirizzi del codice restano', ()=>{
    const s=C.clean('salvataggio /Users/mario rossi/Documenti/Fatture/f 12.pdf e C:\\Users\\Mario\\Desktop\\pratica\\ordine.csv; at http://127.0.0.1:8000/app/shell.js:12 ~/x/y.txt');
    assert.ok(!/mario|Mario|Documenti|Desktop|Fatture|pratica/.test(s), s);
    assert.ok(s.includes('…/ordine.csv') && s.includes('http://127.0.0.1:8000/app/shell.js:12') && s.includes('…/y.txt'), s);
  });
  it('il mailto resta sotto i 1900 caratteri: prima via le righe di registro più vecchie, poi si accorcia il testo', ()=>{
    const entries=Array.from({length:50},(_,i)=>({level:i%2?'ERROR':'WARN', msg:'errore '+i+' '+'x'.repeat(200), t:new Date(2026,10,13,10,0,i), n:1}));
    const m=C.mailto(base({entries}));
    assert.ok(m.url.length<=C.MAX_URL, String(m.url.length)); assert.ok(m.truncated);
    const b=bodyOf(m.url); assert.ok(b.includes('Versione di Acchiappaspettri'));
    assert.ok(!b.includes('errore 0 ') && !b.includes('errore 43 '), 'restano al massimo le ultime 6 righe, le più recenti');
    const long=Object.assign(base(),{expect:'parola '.repeat(800)}), m2=C.mailto(long);
    assert.ok(m2.url.length<=C.MAX_URL, String(m2.url.length)); assert.ok(bodyOf(m2.url).includes('[…] (testo completo negli appunti)'));
    assert.ok(bodyOf(m2.url).includes('esportavo il PDF'));
  });
  it('registro circolare: al massimo 50 voci, ripetizioni ravvicinate contate una volta', ()=>{
    const L=C.createLog(50); for (let i=0;i<70;i++) L.push('ERROR','e'+i);
    assert.strictEqual(L.list().length, 50); assert.strictEqual(L.list()[0].msg, 'e20');
    const t=new Date(); L.push('WARN','x',t); L.push('WARN','x',new Date(+t+100)); L.push('WARN','x',new Date(+t+5000));
    assert.strictEqual(L.list().pop().n, 2);
    assert.strictEqual(C.severity('⛔ no'), 'ERROR'); assert.strictEqual(C.severity('△ forse'), 'WARN'); assert.strictEqual(C.severity('ok'), null);
  });
  it('oscuramento nei pixel e nome dello screenshot', ()=>{
    const w=10, h=8, d=new Uint8ClampedArray(w*h*4).fill(200); C.blackout(d, w, h, [{x:8, y:6, w:-4, h:-3}]);
    for (let y=0;y<h;y++) for (let x=0;x<w;x++){ const i=(y*w+x)*4, inside=x>=4&&x<8&&y>=3&&y<6; assert.strictEqual(d[i]===0&&d[i+1]===0&&d[i+2]===0, inside, `${x},${y}`); }
    assert.strictEqual(C.shotName(new Date(2026,10,13,9,5,7)), 'Acchiappaspettri-segnalazione-2026-11-13-090507.png');
  });
});
