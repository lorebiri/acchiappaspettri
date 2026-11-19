// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Estrattore di testo dei test R6 (test/validation/pdf-text.js). Il test R6 del PDF falliva di rado («1 grafico» e titolo
// assenti, come se mancasse il riepilogo): il riepilogo contiene data e ora, quindi i suoi byte compressi cambiano a ogni
// esecuzione, e quando l'ultimo byte compresso era 0x0D l'estrattore lo toglieva insieme all'a capo prima di «endstream».
// Qui si cercano apposta documenti jsPDF con quel byte finale: la causa è il dato, non il carico della macchina.
'use strict';
const test=require('node:test'), assert=require('node:assert'), path=require('path'), zlib=require('zlib');
const {pdfText}=require('../validation/pdf-text.js');
const {jsPDF}=require(path.join(__dirname,'..','..','node_modules','jspdf'));

// documenti di una pagina il cui flusso di contenuto termina con 0x0D: deterministici (testo con un contatore)
function withCR(max){ const out=[];
  for (let i=0;i<20000 && out.length<max;i++){ const t='1 grafico - Relazione '+i+' – ’ “” € •';
    const d=new jsPDF({compress:true}); d.text(t,10,10); const b=Buffer.from(d.output('arraybuffer')), s=b.toString('latin1');
    const e=s.indexOf('\nendstream');
    if (s.charCodeAt(e-1)===0x0D) out.push({t, b}); }
  return out; }

test('pdf-text: flusso compresso che finisce con 0x0D (il caso dei fallimenti rari di R6)', ()=>{
  const L=withCR(3); assert.ok(L.length===3, 'servono almeno 3 casi: '+L.length);
  for (const {t,b} of L){ assert.ok(pdfText(b).includes(t), 'testo perso: '+t); }
});

test('pdf-text: documenti qualsiasi, 300 di fila, testo sempre trovato', ()=>{
  for (let i=0;i<300;i++){ const t='Relazione '+i+' – ’ “” € •'; const d=new jsPDF({compress:true}); d.text(t,10,10); const lines=pdfText(Buffer.from(d.output('arraybuffer')));
    assert.ok(lines.some(l=>l.startsWith('Relazione '+i+' ')), 'documento '+i+': '+JSON.stringify(lines)); }
});

test('pdf-text: /Length indiretto (n 0 R) o assente: si usa ancora la fine del flusso', ()=>{
  const body=zlib.deflateSync(Buffer.from('BT /F1 12 Tf 10 10 Td (Ciao) Tj ET'));
  for (const dict of ['<< /Length 9 0 R /Filter /FlateDecode >>','<< /Filter /FlateDecode >>']){
    const pdf=Buffer.concat([Buffer.from('%PDF-1.3\n4 0 obj\n'+dict+'\nstream\n','latin1'), body, Buffer.from('\nendstream\nendobj\n','latin1')]);
    assert.deepStrictEqual(pdfText(pdf), ['Ciao'], dict); }
});
