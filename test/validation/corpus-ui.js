// R5 nel browser: ogni file del corpus caricato nell'app vera (addEntries) con un nome neutro; raccoglie lettura, tecnica,
// avvisi di assess (⛔ = livello 'bad'), picchi e aree. Uso diretto: PW_CHANNEL=chrome node test/validation/corpus-ui.js [filtro] > uscita.json
'use strict';
const fs=require('fs'), path=require('path');
const B=require('./browser.js'), L=require('./corpus-lib.js');

async function recordOne(browser, server, rel){
  const {ctx, p, errors}=await B.openPage(browser, server, {});
  const b64=fs.readFileSync(path.join(L.DIR, rel)).toString('base64'), name=L.neutral(rel);
  let r;
  try{
    r=await p.evaluate(async ([b64,name])=>{
      const bin=Uint8Array.from(atob(b64),c=>c.charCodeAt(0)); await addEntries([{file:new File([bin],name), path:name}]);
      document.querySelectorAll('dialog[open]').forEach(d=>d.close());
      const note=((document.querySelector('#skipNote')||{}).innerText||'').trim();
      if (!files.length) return {scartato: note || 'non caricato'};
      const f=files[0], d=viewOf(f); let A=[]; try{ A=assess(f,d).map(o=>({lv:o.lv, t:String(o.t).replace(/<[^>]+>/g,'')})); }catch(e){ A=[{lv:'ERRORE', t:String(e)}]; }
      let im=0, il=0; const ys=f.ys, xs=f.xs; for (let i=1;i<ys.length;i++){ if (ys[i]>ys[im]) im=i; if (ys[i]<ys[il]) il=i; }
      const issue=f.importIssue||null, bad=(f.importBad||[]).slice();
      const r6=v=>v==null?null:+(+v).toPrecision(6);
      return {instr:f.instr, kind:f.kind||null, n:xs.length, x0:xs[0], xN:xs[xs.length-1], xMax:xs[im], yMax:ys[im], xMin:xs[il], yMin:ys[il],
        importBad:bad, importIssue:issue, importNotes:f.importNotes||null,
        stopImport: !!(bad.length || (issue && (issue.thou || issue.dropped || issue.midText))),
        assess:A, peaks:d.peaks.map(q=>({x:r6(q.x), y:r6(q.y), area:q.area!=null?r6(q.area):null}))};
    }, [b64, name]);
  }catch(e){ r={scartato:'ERRORE DEL BANCO DI PROVA '+String(e).slice(0,300)}; }
  r.errori=errors.slice(); await ctx.close();
  return r;
}
async function runCorpus(rels){
  const server=await B.startServer(), browser=await B.launch(), out={};
  try{ for (const rel of rels) out[rel]=await recordOne(browser, server, rel); }
  finally{ await browser.close(); server.close(); }
  return out;
}
// ⛔ nell'interfaccia: assess 'bad', oppure il file scartato (con messaggio)
const stopsOf=rec=>!!(rec.scartato || rec.stopImport || (rec.assess||[]).some(a=>a.lv==='bad'));
module.exports={runCorpus, stopsOf};

if (require.main===module){
  const only=process.argv[2] ? new RegExp(process.argv[2]) : null;
  runCorpus(Object.keys(L.ATTESO.file).filter(k=>!only||only.test(k))).then(o=>process.stdout.write(JSON.stringify(o,null,1)+'\n'));
}
