// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// R6: un progetto ricevuto da altri, con titoli e descrizioni ostili, produce un PDF che li contiene solo come testo:
// nessuno script, nessuna azione automatica aggiunta, titoli intatti nel testo e nei metadati.
// Uso: PW_CHANNEL=chrome node --test test/validation/r6-pdf-ostile.test.js
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path');
const B=require('./browser.js'), {pdfText, pdfInfoTitle}=require('./pdf-text.js');
const FILES=['c/10_raman_header.txt','hplc/U3_coeluito.txt'];
const HOSTILE='Titolo (ostile) \\ ) ( <script>alert(1)</script> /JS (app.alert(1)) >> /AA << °µ±';
const HOSTILE_DOC='Doc ) >> /OpenAction << /S /JavaScript /JS (app.alert(2)) >> (';

// nomi PDF fuori dalle stringhe e dai flussi: un'iniezione riuscita li farebbe comparire qui
function pdfNames(buf){
  const s=buf.toString('latin1'), names=[], at=[]; let i=0;
  while (i<s.length){
    const c=s[i];
    if (c==='%'){ while (i<s.length && s[i]!=='\n' && s[i]!=='\r') i++; continue; }
    if (c==='('){ let d=1; i++; while (i<s.length && d>0){ if (s[i]==='\\'){ i+=2; continue; } if (s[i]==='(') d++; else if (s[i]===')') d--; i++; } continue; }
    if (c==='<' && s[i+1]==='<'){ i+=2; continue; }   // inizio di dizionario, non stringa esadecimale
    if (c==='<'){ while (i<s.length && s[i]!=='>') i++; i++; continue; }
    if (s.startsWith('stream',i) && !/[A-Za-z]/.test(s[i-1]||'') && /[\r\n]/.test(s[i+6]||'')){ /* non «endstream» */ const e=s.indexOf('endstream',i); i=e<0?s.length:e+9; continue; }
    if (c==='/'){ let j=i+1; while (j<s.length && !/[\s\/\[\]()<>{}%]/.test(s[j])) j++; names.push(s.slice(i+1,j)); at.push(i); i=j; continue; }
    i++;
  }
  names.at_=at; names.src=s; return names;
}

test('R6 PDF da un progetto con titoli ostili: solo testo, nessuno script', {timeout:5*60*1000}, async ()=>{
  const server=await B.startServer(), br=await B.launch();
  try{
    // 1) il collega salva un progetto con titoli ostili
    let o=await B.openPage(br, server, {lang:'it'});
    const list=FILES.map(r=>[path.basename(r), fs.readFileSync(path.join(B.ROOT,'test','corpus',r)).toString('base64')]);
    const saved=await o.p.evaluate(async ([list,H,HD])=>{
      await addEntries(list.map(([n,b])=>({file:new File([Uint8Array.from(atob(b),c=>c.charCodeAt(0))],n), path:n}))); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
      files.forEach(f=>{ f.title=H; persist(f); }); S.docTitle=HD; saveS();
      let out=null; const h=AcchProject.host, old=h.saveAs; h.saveAs=async b=>{ out=b; return {name:'ostile.acchspettri', path:null}; };
      await AcchProject.saveAs(); h.saveAs=old; let s=''; for (let i=0;i<out.length;i+=0x8000) s+=String.fromCharCode.apply(null,out.subarray(i,i+0x8000)); return btoa(s);
    },[list,HOSTILE,HOSTILE_DOC]);
    await o.ctx.close();
    // 2) chi lo riceve lo apre in un'altra sessione e crea il PDF
    o=await B.openPage(br, server, {lang:'it'});
    const r=await o.p.evaluate(async (b64)=>{
      const ok=await AcchProject.openBytes(Uint8Array.from(atob(b64),c=>c.charCodeAt(0)),'ostile.acchspettri',null);
      Object.assign(S,{outPdf:true, summary:true, outAnalysis:true});
      const pdf=await buildPdf(), u=new Uint8Array(await pdf.arrayBuffer()); let s=''; for (let i=0;i<u.length;i+=0x8000) s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));
      return {ok, n:files.length, titles:files.map(f=>f.title), doc:S.docTitle, pdf:btoa(s)};
    }, saved);
    assert.deepStrictEqual(o.errors, [], 'errori nella pagina');
    await o.ctx.close();
    assert.ok(r.ok && r.n===FILES.length, 'progetto riaperto');
    assert.ok(r.titles.every(t=>t===HOSTILE) && r.doc===HOSTILE_DOC, 'titoli riaperti identici');
    const buf=Buffer.from(r.pdf,'base64'), names=pdfNames(buf);
    for (const bad of ['JS','JavaScript','AA','Launch','URI','SubmitForm','ImportData','EmbeddedFile','RichMedia','AcroForm'])
      assert.ok(!names.includes(bad), `nome PDF /${bad} fuori dalle stringhe: iniezione nel PDF`);
    // l'unica azione automatica ammessa è lo zoom di jsPDF ([pagina /FitH null])
    names.forEach((n,k)=>{ if (n!=='OpenAction') return; const after=names.src.slice(names.at_[k]+11, names.at_[k]+60);
      assert.ok(/^\s*\[\s*\d+ 0 R \/FitH null\s*\]/.test(after), 'OpenAction diversa dallo zoom: '+after); });
    const text=pdfText(buf), flat=text.join('\n');
    assert.ok(flat.includes('<script>alert(1)</script>') && flat.includes('/JS (app.alert(1))'), 'titolo ostile presente come testo');
    assert.ok(text.some(l=>l.startsWith('Doc ) >> /OpenAction')), 'titolo del documento presente come testo');
    // titoli intatti anche nei simboli (°µ±) e nei metadati: un /Title troncato o cambiato non deve passare (difetto piantato D4)
    assert.ok(text.some(l=>l.endsWith('/AA << °µ±')), 'simboli °µ± del titolo dello spettro nel testo del PDF');
    assert.strictEqual(pdfInfoTitle(buf), HOSTILE_DOC, 'titolo del documento nei metadati (/Title)');
  } finally { await br.close(); server.close(); }
});
