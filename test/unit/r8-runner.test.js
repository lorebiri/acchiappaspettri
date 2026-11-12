// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// R8: il benchmark gira in un processo asincrono con un limite alto e regolabile (ETIMEDOUT a 20 minuti sul Mac carico, tappa I1).
'use strict';
const test=require('node:test'), assert=require('node:assert'), path=require('path');
const R8=require('../validation/r8-golden.test.js'), script=path.join(__dirname,'..','fixtures','r8','lento.js');

test('R8: il benchmark non blocca il processo dei test e ne legge l\'uscita (N=20)', async ()=>{
  let tick=0; const iv=setInterval(()=>tick++, 100); const p=R8.runBench('lento.js', {script});
  assert.ok(p && typeof p.then==='function', 'runBench deve essere asincrono'); const out=await p; clearInterval(iv);
  assert.deepStrictEqual(out, ['riga 1','N=20']); assert.ok(tick>=8, 'ciclo degli eventi bloccato: '+tick+' tick');
});
test('R8: limite di tempo alto per il Mac carico, e messaggio che dice durata e carico se scatta', async ()=>{
  assert.ok(R8.LIMITE_MIN>=60, 'limite '+R8.LIMITE_MIN+' minuti');
  process.env.LENTO_MS='5000';
  try{ await assert.rejects(R8.runBench('lento.js', {script, limitMin:0.01}), e=>/fermato dopo .* minuti/.test(e.message) && /carico medio/.test(e.message)); }
  finally{ delete process.env.LENTO_MS; }
});
