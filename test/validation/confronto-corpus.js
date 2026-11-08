// Confronto prima/dopo sul corpus intero: lettura (Node) e app vera online e desktop (ACCH_SHELL_PREVIEW).
// Registra:   ACCH_INDEX=<index.html> PW_CHANNEL=chrome node test/validation/confronto-corpus.js registra <uscita.json>
// Confronta:  node test/validation/confronto-corpus.js confronta <prima.json> <dopo.json>
// «Dati» (punti, tecnica, massimo, avvisi di assess, picchi, aree, importIssue) devono essere identici; i messaggi
// (toast, nota di importazione) si elencano a parte, perché la correzione degli avvisi li cambia di proposito.
'use strict';
const fs=require('fs'), path=require('path'), crypto=require('crypto');
const L=require('./corpus-lib.js');

function nodeRecord(){
  const C=require('./core.js'), out={};
  for (const rel of Object.keys(L.ATTESO.file)){
    const buf=fs.readFileSync(path.join(L.DIR,rel)), ab=buf.buffer.slice(buf.byteOffset, buf.byteOffset+buf.byteLength), name=L.neutral(rel);
    let r; try{ const p=C.parseBinary(ab,name)||C.parseText(C.decodeBuffer(ab));
      r=!p?{nulla:1}:p.reject?{reject:p.reject}:{n:p.xs.length, h:crypto.createHash('sha1').update(Buffer.from(p.xs.buffer)).update(Buffer.from(p.ys.buffer)).digest('hex'), issue:p.importIssue||null, notes:p.importNotes||null, bad:p.importBad||null, ycol:p.ycol, nCols:p.nCols, instr:p.xs.length>=5?C.detectInstrument(p,name).instr:null};
    }catch(e){ r={eccezione:String(e)}; }
    out[rel]=r; }
  return out;
}
async function uiRecord(){
  const B=require('./browser.js'), server=await B.startServer(), browser=await B.launch(), out={};
  const one=async (rel, desk)=>{ const {ctx,p,errors}=await B.openPage(browser, server, {desk});
    const b64=fs.readFileSync(path.join(L.DIR,rel)).toString('base64');
    const r=await p.evaluate(async ([b64,name])=>{
      const T=[]; const ot=window.toast; window.toast=t=>{ T.push(String(t)); return ot(t); };
      const bin=Uint8Array.from(atob(b64),c=>c.charCodeAt(0)); await addEntries([{file:new File([bin],name), path:name}]);
      document.querySelectorAll('dialog[open]').forEach(d=>d.close()); await new Promise(q=>setTimeout(q,150));
      const note=((document.querySelector('#skipNote')||{}).innerText||'').trim(), tEl=document.querySelector('#toast'), shown=tEl&&tEl.classList.contains('on')?(document.querySelector('#toastTxt')||tEl).innerText.trim():'';
      if (!files.length) return {scartato:note||'non caricato', toasts:T, shown, note};
      const f=files[0], d=viewOf(f); let A=[]; try{ A=assess(f,d).filter(o=>o.lv!=='ok').map(o=>o.lv+': '+String(o.t).replace(/<[^>]+>/g,'')); }catch(e){ A=['ERRORE '+e]; }
      let im=0; for (let i=1;i<f.ys.length;i++) if (f.ys[i]>f.ys[im]) im=i;
      const r8=v=>v==null?null:+(+v).toPrecision(8);
      return {dati:{instr:f.instr, n:f.xs.length, x0:f.xs[0], xN:f.xs[f.xs.length-1], xMax:r8(f.xs[im]), yMax:r8(f.ys[im]), issue:f.importIssue, notes:f.importNotes||null, bad:f.importBad||null, assess:A, peaks:d.peaks.map(q=>[r8(q.x),r8(q.y),q.area!=null?r8(q.area):null])}, toasts:T, shown, note};
    },[b64, L.neutral(rel)]);
    r.errori=errors; await ctx.close(); return r; };
  try{ for (const rel of Object.keys(L.ATTESO.file)) out[rel]={web:await one(rel,false), desk:await one(rel,true)}; }
  finally{ await browser.close(); server.close(); }
  return out;
}
function compare(A, B){
  const dati=[], msg=[]; const J=JSON.stringify, D=r=>r.dati||{scartato:true};   // il testo di un file scartato è un messaggio (nota), non un dato
  for (const rel of Object.keys(L.ATTESO.file)){
    if (J(A.node[rel])!==J(B.node[rel])) dati.push(`${rel} [node]: ${J(A.node[rel]).slice(0,300)} → ${J(B.node[rel]).slice(0,300)}`);
    for (const m of ['web','desk']){ const a=A.ui[rel][m], b=B.ui[rel][m];
      if (J(D(a))!==J(D(b))) dati.push(`${rel} [${m}]: ${J(D(a)).slice(0,300)} → ${J(D(b)).slice(0,300)}`);
      if (b.errori.length) dati.push(`${rel} [${m}]: errore JavaScript ${b.errori[0].slice(0,200)}`);
      for (const k of ['note','shown']) if (a[k].replace(/×$/,'')!==b[k].replace(/×$/,'')) msg.push(`${rel} [${m}] ${k}: «${a[k]}» → «${b[k]}»`);
      if (J(a.toasts)!==J(b.toasts)) msg.push(`${rel} [${m}] toast: ${J(a.toasts)} → ${J(b.toasts)}`); }
    // online e desktop: stessi dati
    const w=B.ui[rel].web, d=B.ui[rel].desk; if (J(D(w))!==J(D(d))) dati.push(`${rel}: online e desktop diversi`);
  }
  return {dati, msg};
}
module.exports={compare};
if (require.main===module){
  const [cmd,a,b]=process.argv.slice(2);
  if (cmd==='registra') uiRecord().then(ui=>{ fs.writeFileSync(a, JSON.stringify({index:require('./browser.js').INDEX, node:nodeRecord(), ui},null,1)); console.log('scritto', a); });
  else if (cmd==='confronta'){ const r=compare(JSON.parse(fs.readFileSync(a,'utf8')), JSON.parse(fs.readFileSync(b,'utf8')));
    console.log(`file ${Object.keys(L.ATTESO.file).length} · differenze nei dati: ${r.dati.length}`); r.dati.forEach(x=>console.log('  DATI', x));
    console.log(`differenze nei messaggi: ${r.msg.length}`); r.msg.forEach(x=>console.log('  MSG', x)); process.exitCode=r.dati.length?1:0; }
  else { console.error('uso: registra <uscita.json> | confronta <prima.json> <dopo.json>'); process.exitCode=2; }
}
