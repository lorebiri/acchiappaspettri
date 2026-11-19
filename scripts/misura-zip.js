// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I7: tempi dello ZIP, JSZip (generateAsync in Node) contro Rust (acch-core-cli --zip, senza l'IPC dell'app), sui dati sintetici
// di test/unit/motore-dati.js: progetto .acchspettri (DEFLATE livello 6) e ZIP di Esporta (STORE). Uso: node scripts/misura-zip.js [--runs 3]
'use strict';
const fs=require('fs'), path=require('path'), os=require('os'), {execFileSync}=require('child_process'), JSZip=require('jszip');
const ROOT=path.join(__dirname,'..'), TAURI=path.join(ROOT,'src-tauri'), F=require('../app/project-format.js'), C=require('../app/calc-core.js'), D=require('../test/unit/motore-dati.js');
const RUNS=+(process.argv[process.argv.indexOf('--runs')+1]||3)||3, med=a=>a.slice().sort((p,q)=>p-q)[a.length>>1];
execFileSync('cargo',['build','--release','-q','-p','acch-core','--bin','acch-core-cli'],{cwd:TAURI, stdio:'inherit'});
const exe=path.join(TAURI,'target','release','acch-core-cli'+(process.platform==='win32'?'.exe':'')), tmp=fs.mkdtempSync(path.join(os.tmpdir(),'acch-zip-'));
(async()=>{ const files=D.files(), cases={};
  // progetto: i quattro file grandi come sorgenti (≈140 MB), più i CSV elaborati di uno spettro da 1M punti
  cases['progetto (DEFLATE)']=async zipper=>F.encode({state:{}, spectra:Object.entries(files).map(([n,b])=>({name:n, path:n, bytes:new Uint8Array(b), binary:/\.uv$/.test(n)}))}, JSZip, zipper);
  const csv=files['grande-1M.txt'].toString('latin1');
  cases['Esporta (STORE)']=async zipper=>{ const z=new JSZip(), f=z.folder('Analisi_20261114'); for (let k=0;k<4;k++) f.file('dati/spettro_'+k+'.csv', csv); f.file('riepilogo.txt', 'tabella\r\n'.repeat(1000));
    const gen={type:'uint8array', compression:'STORE'}; return zipper ? zipper(z, gen) : z.generateAsync(gen); };
  console.log('carico '+os.loadavg().map(v=>v.toFixed(1)).join(' ')+', '+RUNS+' prove');
  for (const [k,mk] of Object.entries(cases)){ const js=[], ru=[], req=[]; let size=0, rsize=0;
    for (let r=0;r<RUNS;r++){ const t=process.hrtime.bigint(); const b=await mk(null); js.push(Number(process.hrtime.bigint()-t)/1e6); size=b.length; }
    for (let r=0;r<RUNS;r++){ const t=process.hrtime.bigint(); let q; await mk(async (z,gen)=>{ q=await C.zipRequest(z, gen); return new Uint8Array(1); }); const tq=Number(process.hrtime.bigint()-t)/1e6;
      const p=path.join(tmp,'q.acz'), o=path.join(tmp,'o.zip'); fs.writeFileSync(p,q); ru.push(+execFileSync(exe,['--zip',o,p]).toString()); req.push(tq); rsize=fs.statSync(o).size; }
    console.log(k+': JSZip '+med(js).toFixed(0)+' ms ('+js.map(v=>v.toFixed(0)).join(' ')+'), '+(size/1e6).toFixed(1)+' MB · Rust '+med(ru).toFixed(0)+' ms ('+ru.map(v=>v.toFixed(0)).join(' ')+'), '+(rsize/1e6).toFixed(1)+' MB, più la preparazione della richiesta in JS '+med(req).toFixed(0)+' ms (SHA-256 e manifest compresi)'); }
  fs.rmSync(tmp,{recursive:true,force:true});
})();
