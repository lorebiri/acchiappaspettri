// Riferimenti «golden»: confronto esatto con un JSON salvato; AGGIORNA_GOLDEN=1 riscrive il riferimento (da fare solo
// dopo aver verificato che la differenza è voluta, e da dichiarare nel commit).
'use strict';
const fs=require('fs'), path=require('path');
const DIR=path.join(__dirname,'golden');
function diffLines(a, b, max){
  const out=[]; const n=Math.max(a.length,b.length);
  for (let i=0;i<n && out.length<(max||20);i++) if (a[i]!==b[i]) out.push(`#${i+1}\n   golden: ${a[i]===undefined?'(assente)':a[i]}\n   ora:    ${b[i]===undefined?'(assente)':b[i]}`);
  return out;
}
// value: oggetto serializzabile. Restituisce [] se uguale (o se aggiornato), altrimenti le differenze leggibili
function compare(name, value){
  const file=path.join(DIR, name+'.json'), now=JSON.stringify(value, null, 1);
  if (process.env.AGGIORNA_GOLDEN==='1'){ fs.mkdirSync(DIR,{recursive:true}); fs.writeFileSync(file, now+'\n'); return []; }
  if (!fs.existsSync(file)) return [`golden mancante: ${path.relative(process.cwd(), file)} (crealo con AGGIORNA_GOLDEN=1 dopo averlo verificato)`];
  const old=fs.readFileSync(file,'utf8').replace(/\n$/,'');
  if (old===now) return [];
  return [`${name}: risultati cambiati rispetto al golden (${path.relative(process.cwd(), file)})`].concat(diffLines(old.split('\n'), now.split('\n')));
}
module.exports={compare, DIR};
