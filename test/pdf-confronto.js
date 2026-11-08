// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Costruisce i PDF dell'app con il jsPDF in vendor/, per confrontare due versioni della libreria.
// Uso: PW_CHANNEL=chrome node test/pdf-confronto.js CARTELLA_USCITA
'use strict';
const fs=require('fs'), path=require('path'), B=require('./validation/browser.js');
const OUT=path.resolve(process.argv[2]||'pdf-out'); fs.mkdirSync(OUT,{recursive:true});
const SETS={
  misto:['c/10_raman_header.txt','c/64_ftir_T_fraction.txt','xrf/A08_bronzo_senzacal.mca','hplc/U3_coeluito.txt'],
};
// titoli ostili: devono finire nel PDF solo come testo
const HOSTILE='Titolo (ostile) \\ ) ( <script>alert(1)</script> /JS (app.alert(1)) \u0001\u0007 °µ±⁻¹ àèìòù';
const HOSTILE_DOC='Doc ) >> /OpenAction << /S /JavaScript /JS (app.alert(2)) >> (';
(async()=>{
  const server=await B.startServer(), br=await B.launch();
  try{
    for (const lang of ['it','en']) for (const [set,rel] of Object.entries(SETS)) for (const hostile of [false,true]){
      const {ctx,p,errors}=await B.openPage(br,server,{lang});
      const list=rel.map(r=>[path.basename(r), fs.readFileSync(path.join(B.ROOT,'test','corpus',r)).toString('base64')]);
      const b64=await p.evaluate(async ([list,hostile,H,HD])=>{
        await addEntries(list.map(([n,b])=>({file:new File([Uint8Array.from(atob(b),c=>c.charCodeAt(0))],n), path:n}))); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
        if (hostile){ files.forEach(f=>{ f.title=H; persist(f); }); S.docTitle=HD; } else S.docTitle='Confronto jsPDF °µ±⁻¹';
        Object.assign(S,{outPdf:true, csvPeaks:true, outAnalysis:true, summary:true, showPeaks:true});
        const pdf=await buildPdf(); const u=new Uint8Array(await pdf.arrayBuffer()); let s=''; for (let i=0;i<u.length;i+=0x8000) s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000)); return btoa(s);
      },[list,hostile,HOSTILE,HOSTILE_DOC]);
      const name=`${set}-${lang}${hostile?'-ostile':''}.pdf`;
      fs.writeFileSync(path.join(OUT,name), Buffer.from(b64,'base64'));
      console.log(name, errors.length?'ERRORI: '+errors.join(' | '):'ok');
      await ctx.close();
    }
  } finally { await br.close(); server.close(); }
})().catch(e=>{ console.error(e); process.exit(1); });
