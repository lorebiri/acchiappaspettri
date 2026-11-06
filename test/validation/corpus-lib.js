// Corpus R5: lettura dei file come fa addEntries (index.html) e confronto con test/corpus/atteso.json.
'use strict';
const fs=require('fs'), path=require('path');
const DIR=path.join(__dirname,'..','corpus');
const ATTESO=JSON.parse(fs.readFileSync(path.join(DIR,'atteso.json'),'utf8'));
// nome neutro: il riconoscimento non deve usare le parole descrittive del nome del file del corpus
const neutral=rel=>'campione'+path.extname(rel);

// stessa sequenza di addEntries: parseBinary || parseText(decodeBuffer); reject; < 5 punti scartato; detectInstrument(p, nome)
function importNode(C, rel){
  const buf=fs.readFileSync(path.join(DIR,rel)), ab=buf.buffer.slice(buf.byteOffset, buf.byteOffset+buf.byteLength), name=neutral(rel);
  const pb=C.parseBinary(ab, name), p=pb || C.parseText(C.decodeBuffer(ab));
  if (!p) return {scartato:'nessun risultato'};
  if (p.reject) return {scartato:'reject: '+p.reject};
  if (!p.xs || p.xs.length<5) return {scartato:'meno di 5 punti'};
  const det=C.detectInstrument(p, name);
  return summary(p, det.instr, p.kind);
}
function summary(p, instr, kind){
  const xs=p.xs, ys=p.ys; let im=0, il=0; for (let i=1;i<ys.length;i++){ if (ys[i]>ys[im]) im=i; if (ys[i]<ys[il]) il=i; }
  const issue=p.importIssue||null, bad=(p.importBad||[]).slice();
  return {instr, kind:kind||null, n:xs.length, x0:xs[0], xN:xs[xs.length-1], xMax:xs[im], yMax:ys[im], xMin:xs[il], yMin:ys[il],
    importBad:bad, importIssue:issue, importNotes:p.importNotes||null,
    stopImport: !!(bad.length || (issue && (issue.thou || issue.dropped || issue.midText)))};
}
// valuta un risultato contro l'atteso. stops = ⛔ visibile (assess 'bad', importBad/importIssue grave, file scartato);
// warns = testi di tutti gli avvisi (⚠ e ⛔), per la regola «avviso». node=true: assess non disponibile, solo i controlli decidibili.
// esito: ok | valori_sbagliati (Node, file pulito) | silenzioso (valori sbagliati, nessun avviso) | solo_avviso (valori sbagliati con ⚠ ma senza ⛔) | stop_falso | avviso_mancante | scarto_mancante | rinviato
function valueProblems(rec, exp){
  const why=[];
  if (exp.tecnica && !exp.tecnica.includes(rec.instr)) why.push(`tecnica ${rec.instr}, attesa ${exp.tecnica.join('|')}`);
  if (exp.n!=null && Math.abs(rec.n-exp.n)>(exp.tolN||0)) why.push(`${rec.n} punti, attesi ${exp.n}`);
  for (const [key,val] of [['massimo',rec.xMax],['minimo',rec.xMin]]) if (exp[key] && !exp[key].some(([x,t])=>Math.abs(val-x)<=t)) why.push(`${key} a ${+(+val).toPrecision(6)}, atteso ${exp[key].map(([x,t])=>x+' ± '+t).join(' o ')}`);
  if (exp.yMax){ const [y,rel]=exp.yMax; if (!(Math.abs(rec.yMax-y)<=rel*Math.abs(y))) why.push(`y massima ${+(+rec.yMax).toPrecision(6)}, attesa ${y} ± ${rel*100}%`); }
  return why;
}
function evaluate(rec, exp, o){
  o=o||{}; const node=!!o.node, warns=(o.warns||[]).join(' \n ').toLowerCase();
  const avvisoOk = !exp.avviso || warns.includes(exp.avviso.toLowerCase());
  const stop = !!(rec.scartato || o.stops) || (exp.avvisoSostituisceStop && exp.avviso && warns.includes(exp.avviso.toLowerCase()));
  const res=(esito, motivi)=>({esito, ok:esito==='ok', motivi:motivi||[]});
  if (exp.categoria==='scarto') return rec.scartato ? res('ok') : (stop ? res('ok',['non scartato ma con ⛔']) : res('scarto_mancante',['doveva essere rifiutato']));
  if (rec.scartato) return (exp.categoria==='pulito') ? res('stop_falso',['scartato: '+rec.scartato]) : res('ok',['rifiutato: '+rec.scartato]);
  const vp=valueProblems(rec, exp), wrong=vp.length>0 || exp.categoria==='stop';
  if (exp.categoria==='pulito'){
    if (stop) return res('stop_falso', ['⛔ su un file pulito'].concat(vp));
    if (vp.length) return node ? res('valori_sbagliati',vp) : res(warns ? 'solo_avviso' : 'silenzioso', vp);
    if (!node && !avvisoOk) return res('avviso_mancante', [`manca l'avviso «${exp.avviso}»`]);
    return res('ok');
  }
  // stop / giusto_o_stop
  if (stop) return (!node && !avvisoOk && exp.categoria!=='stop' && !vp.length) ? res('avviso_mancante',[`manca l'avviso «${exp.avviso}»`]) : res('ok', vp.length?['valori sbagliati ma con ⛔: '+vp.join('; ')]:[]);
  if (!wrong){ if (!node && !avvisoOk) return res('avviso_mancante',[`manca l'avviso «${exp.avviso}»`]); return res('ok'); }
  if (node) return res('rinviato', vp.length?vp:['⛔ atteso da assess (solo nel browser)']);
  return res(warns ? 'solo_avviso' : 'silenzioso', vp.length?vp:['⛔ obbligatorio assente']);
}
module.exports={DIR, ATTESO, importNode, evaluate, valueProblems, neutral, summary};
