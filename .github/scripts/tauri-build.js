// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Esegue «tauri <argomenti>» e lo ripete SOLO per gli errori passeggeri noti delle macchine di GitHub, con un ::warning:: nel log:
//   - hdiutil «Resource busy» nel .dmg su macOS (run 42430451508);
//   - download del bundler falliti per la rete (HTTP 5xx/429/408, tempo scaduto, connessione interrotta: run 42464743191).
// Qualsiasi altro errore ferma subito, con il codice di uscita di tauri. Usato da ci.yml e, come tauriScript, da tauri-action in release.yml.
// Uso: node .github/scripts/tauri-build.js build [argomenti di tauri]
const {spawn}=require('child_process'), path=require('path');
const cli=path.join(__dirname,'..','..','node_modules','@tauri-apps','cli','tauri.js'), args=process.argv.slice(2), MAX=3, WAIT=[30,90];
// Si guarda solo l'errore finale di tauri (l'ultima riga «Error …» / «failed to bundle project»): bundle_dmg.sh ripete da sé
// «hdiutil detach» e stampa «Resource busy» anche quando poi riesce, quindi quella riga da sola non dice perché la build è fallita.
// «Resource busy» conta solo se l'errore finale è quello del .dmg e l'ultimo messaggio di hdiutil prima di esso è proprio quello.
const TRANSIENT=[
  [(e,before)=>/error running bundle_dmg\.sh/i.test(e) && /Resource busy/i.test([...before].reverse().find(l=>/^hdiutil:/i.test(l))||''), 'hdiutil «Resource busy»'],
  [e=>/failed to bundle project:? .*http status: (5\d\d|429|408)\b/i.test(e), 'download del bundler: errore HTTP passeggero'],
  [e=>/failed to bundle project:? .*(timed out|timeout|connection (reset|refused|closed|aborted)|dns (error|failed)|failed to lookup address|network (is )?unreachable)/i.test(e), 'download del bundler: rete'],
];
function finalError(tail){
  const L=tail.split(/\r?\n/).map(l=>l.replace(/\x1b\[[0-9;]*m/g,'').trim()).filter(Boolean);
  for (let i=L.length-1;i>=0;i--) if (/^error\b|failed to bundle project/i.test(L[i])) return {line:L[i], before:L.slice(0,i)};
  return null;
}
function transient(tail){ const f=finalError(tail); if (!f) return null; const w=TRANSIENT.find(([ok])=>ok(f.line,f.before)); return w&&{why:w[1], line:f.line}; }
function once(){
  return new Promise(res=>{ let tail='';
    const keep=d=>{ tail=(tail+d.toString()).slice(-1<<20); };
    const c=spawn(process.execPath,[cli,...args],{stdio:['inherit','pipe','pipe'],env:process.env});
    c.stdout.on('data',d=>{ process.stdout.write(d); keep(d); }); c.stderr.on('data',d=>{ process.stderr.write(d); keep(d); });
    c.on('error',e=>res({code:1,tail:String(e)})); c.on('close',(code,sig)=>res({code:code==null?1:code,sig,tail})); });
}
(async()=>{
  for (let i=1;;i++){
    const r=await once(); if (r.code===0) return;
    const t=transient(r.tail);
    if (!t || i>=MAX){ if (t) console.log(`::error::tauri ${args[0]||''}: ${t.why} anche al tentativo ${i} di ${MAX}`); process.exit(r.code||1); }
    console.log(`::warning::tauri ${args[0]||''}: ${t.why} («${t.line.slice(0,200)}»); nuovo tentativo ${i+1} di ${MAX} fra ${WAIT[i-1]} s`);
    await new Promise(r=>setTimeout(r,WAIT[i-1]*1000));
  }
})();
