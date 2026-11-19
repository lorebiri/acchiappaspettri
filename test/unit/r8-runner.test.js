// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// R8: il benchmark gira in un processo asincrono con un limite alto e regolabile (ETIMEDOUT a 20 minuti sul Mac carico, tappa I1).
// Ogni test ha un proprio timeout e alla fine nessun processo figlio resta vivo.
'use strict';
const {test, after}=require('node:test'), assert=require('node:assert'), path=require('path');
const R8=require('../validation/r8-golden.test.js'), script=path.join(__dirname,'..','fixtures','r8','lento.js');
const alive=pid=>{ try{ process.kill(pid,0); return true; }catch(e){ return false; } };
after(()=>R8.killAll());

test('R8: il benchmark non blocca il processo dei test e ne legge l\'uscita (N=20)', {timeout:20000}, async ()=>{
  let tick=0; const iv=setInterval(()=>tick++, 100);
  try{ const p=R8.runBench('lento.js', {script}); assert.ok(p && typeof p.then==='function', 'runBench deve essere asincrono'); const out=await p;
    assert.deepStrictEqual(out, ['riga 1','N=20']); assert.ok(tick>=8, 'ciclo degli eventi bloccato: '+tick+' tick'); assert.strictEqual(R8.FIGLI.size, 0); }
  finally{ clearInterval(iv); }
});
test('R8: limite di tempo alto per il Mac carico; quando scatta il figlio viene ucciso e il messaggio dice durata e carico', {timeout:20000}, async ()=>{
  assert.ok(R8.LIMITE_MIN>=60, 'limite '+R8.LIMITE_MIN+' minuti');
  process.env.LENTO_MS='60000';   // il figlio aspetterebbe un minuto: deve essere ucciso subito al limite (0,6 s)
  try{ const p=R8.runBench('lento.js', {script, limitMin:0.01}); const [c]=[...R8.FIGLI], t0=Date.now();
    await assert.rejects(p, e=>/fermato dopo .* minuti/.test(e.message) && /carico medio/.test(e.message));
    assert.ok(Date.now()-t0<5000, 'risposta dopo '+(Date.now()-t0)+' ms');
    for (let i=0;i<50 && alive(c.pid);i++) await new Promise(r=>setTimeout(r,100)); assert.ok(!alive(c.pid), 'figlio ancora vivo: '+c.pid); assert.strictEqual(R8.FIGLI.size, 0); }
  finally{ delete process.env.LENTO_MS; R8.killAll(); }
});
