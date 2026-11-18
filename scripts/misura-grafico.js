// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I6: misura a tempo di G1 e G2 nel browser (Chromium, lo stesso motore di WebView2), fuori dalla suite di prove: il tempo d'orologio
// dipende dal carico della macchina e va misurato a macchina scarica. Dati SINTETICI (test/validation/grafico-dati.js).
//   PW_CHANNEL=chrome node scripts/misura-grafico.js [--runs 3] [--n 20] [--punti 1000000]
// Nell'app vera: node scripts/misura-motore.js <eseguibile e2e> --grafico-g
'use strict';
const os=require('os'), path=require('path');
const B=require(path.join(__dirname,'..','test','validation','browser.js')), {openDesk}=require(path.join(__dirname,'..','test','validation','tauri-mock.js')), {I6_SETUP}=require(path.join(__dirname,'..','test','validation','grafico-dati.js'));
const args=process.argv.slice(2), opt=(k,d)=>{ const i=args.indexOf(k); return i>=0 ? +args[i+1] : d; }, RUNS=opt('--runs',3), N=opt('--n',20), NP=opt('--punti',1e6);
(async()=>{ const server=await B.startServer(), br=await B.launch(), out=[];
  for (let k=0;k<RUNS;k++){ const load=os.loadavg()[0]; const o=await openDesk(B, br, server); await o.p.evaluate(I6_SETUP);
    const r=await o.p.evaluate(([N,NP])=>I6.g12(N,NP), [N,NP]); r.load=+load.toFixed(1); r.run=k+1; out.push(r); console.log(JSON.stringify(r)); await o.ctx.close(); }
  await br.close(); server.close();
  const med=a=>a.slice().sort((x,y)=>x-y)[Math.floor(a.length/2)];
  const fps=med(out.map(r=>r.fps)), p95=med(out.map(r=>r.drawP95)), mx=Math.max(...out.map(r=>r.drawMax)), g2=med(out.map(r=>r.g2));
  console.log(`\nG1 ≥ 50 fps (${N}×${NP}, zoom e spostamento): ${fps>=50?'OK':'NO'} (mediana ${fps.toFixed(1)} fps; disegno p95 ${Math.round(p95)} ms, massimo ${Math.round(mx)} ms; carico ${out.map(r=>r.load).join(' / ')} su ${os.cpus().length} CPU)`);
  console.log(`G2 primo disegno del confronto ≤ 3 s: ${g2<=3000?'OK':'NO'} (${Math.round(g2)} ms)`);
  if (out.some(r=>r.load>os.cpus().length)) console.log('ATTENZIONE: macchina carica durante la misura, i tempi non valgono come criterio');
})();
