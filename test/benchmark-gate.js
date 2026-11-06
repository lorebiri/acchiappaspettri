// Esegue i benchmark scientifici e li fa FALLIRE se un risultato esce dalle soglie: senza questo controllo un calcolo rotto
// (pendenza raddoppiata, LOD sbagliato, picchi persi) lascerebbe la pipeline verde. Uso: N=20 node test/benchmark-gate.js
// Le soglie hanno un margine rispetto ai valori attuali (N=20) per non dipendere dal caso, ma sono strette abbastanza da vedere un errore vero.
const {execFileSync}=require('child_process'), path=require('path');
const run=f=>{ try{ return execFileSync(process.execPath,[path.join(__dirname,f)],{encoding:'utf8',maxBuffer:1<<26,env:process.env,stdio:['ignore','pipe','pipe']}); }catch(e){ fail(`${f}: uscito con errore ${e.status}\n${String(e.stdout||'').slice(-2000)}${String(e.stderr||'').slice(-2000)}`); return String(e.stdout||''); } };
const fails=[], oks=[]; function fail(m){ fails.push(m); }
const num=s=>parseFloat(String(s).replace(',','.'));
// cerca nella riga che contiene `label` il primo gruppo della regex `re` e lo confronta con il limite
function gate(out, label, re, test, what){ const line=out.split('\n').find(l=>l.includes(label)); if (!line){ fail(`riga mancante: «${label}»`); return; } const m=re.exec(line); if (!m){ fail(`formato inatteso: «${line.trim()}»`); return; }
  const vals=m.slice(1).map(num); if (vals.some(v=>!isFinite(v))){ fail(`valore illeggibile: «${line.trim()}»`); return; } if (test(...vals)) oks.push(`${what}: ${vals.join(' / ')}`); else fail(`${what} fuori soglia: «${line.trim()}»`); }

{ const o=run('peak-benchmark.js'), blocks=o.split('== Acchiappaspettri');
  if (blocks.length<3) fail('peak-benchmark: tabelle mancanti');
  blocks.slice(1).forEach(b=>{ const sens=(/\(sens (\d+)\)/.exec(b)||[])[1]; for (const t of ['ftir','raman','hplc','uv']){ const m=new RegExp(`│ ${t}\\s+│ '([\\d.]+)'\\s+│ '([\\d.]+)'`).exec(b); if (!m){ fail(`peak-benchmark sens ${sens}: riga ${t} mancante`); continue; } const r=+m[1], p=+m[2]; if (r>=97 && p>=97) oks.push(`picchi ${t} sens ${sens}: ${r}/${p}`); else fail(`picchi ${t} sens ${sens}: recall ${r}, precisione ${p} (soglia 97)`); } }); }

{ const o=run('area-benchmark.js');
  gate(o,'Gaussiani isolati, base inclinata',/errore mediano ([-\d.]+)%.*90% entro ±([\d.]+)%/,(m,q)=>Math.abs(m)<=1&&q<=5,'aree gaussiane, base inclinata');
  gate(o,'Gaussiani vicini',/errore mediano ([-\d.]+)%.*90% entro ±([\d.]+)%/,(m,q)=>Math.abs(m)<=1.5&&q<=6,'aree gaussiane vicine'); }

{ const o=run('analysis-benchmark.js');
  gate(o,'Gaussiani isolati, rumore 0,5%',/fit ([-+\d.]+)% \(90% ±([\d.]+)%/,(m,q)=>Math.abs(m)<=1&&q<=2,'area con il fit');
  gate(o,'Lorentziani isolati',/fit ([-+\d.]+)% \(90% ±([\d.]+)%/,(m,q)=>Math.abs(m)<=1.5&&q<=7,'area lorentziana con il fit');
  gate(o,'Numero di componenti corretto',/(\d+)\/(\d+)/,(a,b)=>a/b>=0.85,'deconvoluzione: componenti');
  gate(o,'Errore RMS della base',/arPLS mediano ([\d.]+)%/,m=>m<=3,'arPLS');
  gate(o,'Area netta entro',/errore mediano ([-+\d.]+)%.*90% entro ±([\d.]+)%/,(m,q)=>Math.abs(m)<=2&&q<=7,'XRF SNIP');
  gate(o,'Raggi cosmici rimossi',/\((\d+(?:\.\d+)?)%\), falsi allarmi (\d+)/,(r,f)=>r>=95&&f<=1,'raggi cosmici');
  gate(o,'IC della pendenza',/([\d.]+)% \(atteso/,v=>v>=85,'copertura IC pendenza');
  gate(o,'IC della concentrazione predetta',/([\d.]+)% \(atteso/,v=>v>=85,'copertura IC concentrazione');
  gate(o,'rette dichiarate non lineari',/([\d.]+)% \(atteso/,v=>v<=10,'Mandel falsi allarmi');
  gate(o,'curvatura del 4%',/([\d.]+)%/,v=>v>=80,'Mandel curvatura');
  gate(o,'Gruppi ritrovati senza errori',/(\d+)\/(\d+)/,(a,b)=>a/b>=0.9,'PCA e cluster');
  gate(o,'Errore sulla frazione',/mediano ([\d.]+) punti/,v=>v<=0.5,'miscele NNLS');
  gate(o,'Piatti teorici',/errore mediano ([-+\d.]+)%/,v=>Math.abs(v)<=2,'piatti teorici');
  gate(o,'Risoluzione Rs',/errore mediano ([-+\d.]+)%/,v=>Math.abs(v)<=2,'risoluzione');
  gate(o,'Errore su Eg',/mediano ([-+\d.]+) meV, 90% entro ±([\d.]+) meV/,(m,q)=>Math.abs(m)<=40&&q<=90,'band gap di Tauc');
  gate(o,"Errore sull'onset",/mediano ([-+\d.]+) °C/,v=>Math.abs(v)<=0.3,'onset DSC');
  gate(o,'Doppio integrale',/errore mediano ([-+\d.]+)%, 90% entro ±([\d.]+)%/,(m,q)=>Math.abs(m)<=3&&q<=15,'doppio integrale EPR');
  gate(o,'Q² in validazione',/([\d.]+)\s*$/,v=>v>=0.95,'PLS');
  gate(o,'Pigmento giusto al primo posto',/(\d+)\/(\d+)/,(a,b)=>a/b>=0.95,'pigmenti Raman');
  gate(o,'Cu: errore assoluto',/normalizzato al 100% ([\d.]+)/,v=>v<=1,'XRF leghe Cu'); }

{ const o=run('format-test.js'); const m=/(\d+) riuscite, (\d+) fallite/.exec(o); if (!m) fail('format-test: risultato non trovato'); else if (+m[2]===0 && +m[1]>0) oks.push(`formati ${m[1]} riusciti`); else fail(`formati: ${m[1]} riusciti, ${m[2]} falliti`); }

{ const o=run('xrf-fp-benchmark.js');
  gate(o,'realtà = modello',/±([\d.]+)% \(90%: ([\d.]+)%\)/,(m,q)=>m<=1.5&&q<=8,'XRF FP senza standard (modello esatto)'); }

oks.forEach(l=>console.log('✓ '+l));
if (fails.length){ fails.forEach(l=>console.error('✗ '+l)); console.error(`\n${fails.length} controlli dei benchmark falliti`); process.exit(1); }
console.log(`\nBenchmark: ${oks.length} controlli superati`);
