// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Importazione, tappa I1 di 3.0.0 (pacchetto «import»): migliaia sull'asse senza interi, asse che torna indietro con x ripetute,
// XRF con Calibration1 negativa, tabelle riassuntive non contate fra i canali. Dati SINTETICI generati qui.
// Prova del prima: ACCH_INDEX=<index.html di c3e22c4> node --test test/validation/r7-import-i1.test.js deve fallire.
'use strict';
const test=require('node:test'), assert=require('node:assert');
const C=require('./core.js');
const g=(x,c,w)=>Math.exp(-0.5*((x-c)/w)**2);
const th=(x,s)=>Math.floor(x/1000)+s+String(x%1000).padStart(3,'0');
const maxX=p=>{ let k=0; for (let i=1;i<p.ys.length;i++) if (p.ys[i]>p.ys[k]) k=i; return p.xs[k]; };

test('migliaia: asse X tutto «1,100…2,500» (nessun intero) con la Y a punto decimale dà ⛔', ()=>{
  const X=Array.from({length:1401},(_,i)=>1100+i), bad=[];
  const M={ 'virgola sull\'asse, Y «0.5»': 'X\tY\n'+X.map(x=>th(x,',')+'\t'+(0.5+g(x,1600,8)).toFixed(4)).join('\n'),
            'virgola sull\'asse, Y «0.5» senza intestazione': X.map(x=>th(x,',')+'\t'+(0.5+g(x,1600,8)).toFixed(3)).join('\n'),
            'passo 5 cm⁻¹, Y con un decimale': 'X\tY\n'+X.filter(x=>x%5===0).map(x=>th(x,',')+'\t'+(10+90*g(x,1600,20)).toFixed(1)).join('\n'),
            'punto sull\'asse, Y «0,5»': 'X;Y\n'+X.map(x=>th(x,'.')+';'+(0.5+g(x,1600,8)).toFixed(4).replace('.',',')).join('\n') };
  for (const [k,t] of Object.entries(M)){ const p=C.parseText(t); if (!(p.importIssue && p.importIssue.thou)) bad.push(`${k}: nessun ⛔ (letto ${p.xs[0]}–${p.xs[p.xs.length-1]})`); }
  assert.deepStrictEqual(bad, []);
});
test('migliaia: restano ambigui (nessun ⛔) lo stesso separatore nelle due colonne e la sola Y a tre decimali', ()=>{
  const X=Array.from({length:1401},(_,i)=>1100+i), bad=[];
  const M={ 'virgola in tutte e due («1,100» e «0,512»)': X.map(x=>th(x,',')+'\t'+(0.5+0.4*g(x,1600,8)).toFixed(3).replace('.',',')).join('\n'),
            'punto in tutte e due («1.100» e «0.512»)': X.map(x=>th(x,'.')+'\t'+(0.5+0.4*g(x,1600,8)).toFixed(3)).join('\n'),
            'X «100.0», Y «4,836» (come il corpus c/50)': Array.from({length:3101},(_,i)=>100+i).map(x=>x.toFixed(1)+'\t'+(2+3*g(x,1086,3)).toFixed(3).replace('.',',')).join('\n') };
  for (const [k,t] of Object.entries(M)){ const p=C.parseText(t); if (p.importIssue && p.importIssue.thou) bad.push(`${k}: falso ⛔ delle migliaia`); }
  assert.deepStrictEqual(bad, []);
});

// ciclo 25: A crescente, poi B decrescente dallo stesso punto (x ripetute). Con un asse che va in un verso solo sono due blocchi.
const T=Array.from({length:3000},(_,i)=>i*0.004), fx=r=>r.map(([t,y])=>t.toFixed(4)+'\t'+y.toFixed(4)).join('\n');
const A=T.map(t=>[t,0.5+80*g(t,5,0.05)]), Br=T.map(t=>[t,0.5+20*g(t,5,0.05)+50*g(t,8,0.05)]).reverse();
const W=Array.from({length:1801},(_,i)=>400+2*i), irA=W.map(x=>[x,0.05+0.8*g(x,1730,8)]), irB=W.map(x=>[x,0.05+0.4*g(x,1730,8)]).reverse(), fi=r=>r.map(([x,y])=>x+'\t'+y.toFixed(5)).join('\n');
test('asse invertito con x ripetute: HPLC e FTIR con il nome dell\'asse si leggono come due blocchi, con l\'avviso', ()=>{
  const bad=[];
  const M={ 'HPLC «Time (min)», 0→12 poi 12→0': {t:'Time (min)\tmAU\n'+fx(A)+'\n'+fx(Br), n:3000, ymax:80},
            'HPLC «RT [min]» in CSV': {t:'RT [min],Signal\n'+fx(A).replace(/\t/g,',')+'\n'+fx(Br).replace(/\t/g,','), n:3000, ymax:80},
            'FTIR «Wavenumber (cm-1)», 400→4000 poi 4000→400': {t:'Wavenumber (cm-1)\tAbsorbance\n'+fi(irA)+'\n'+fi(irB), n:1801, ymax:0.85} };
  for (const [k,c] of Object.entries(M)){ const p=C.parseText(c.t), q=p.importIssue||{}; let ym=-Infinity; for (const v of p.ys) ym=Math.max(ym,v);
    if (p.xs.length!==c.n || q.after!==c.n || !q.channel) bad.push(`${k}: ${p.xs.length} punti, importIssue ${JSON.stringify(p.importIssue)}`);
    if (Math.abs(ym-c.ymax)>0.02*c.ymax) bad.push(`${k}: massimo ${ym}, atteso ${c.ymax}`);
    for (let i=1;i<p.xs.length;i++) if (p.xs[i]===p.xs[i-1]){ bad.push(`${k}: x ripetute`); break; } }
  assert.deepStrictEqual(bad, []);
});
test('andata e ritorno vera (potenziale) o senza nome dell\'asse: resta un blocco solo', ()=>{
  const N=2000, cv=Array.from({length:2*N},(_,i)=>{ const v=i<N?-0.5+i*0.0005:-0.5+(2*N-1-i)*0.0005; return [v, 1e-6*(v+(i<N?0.1:-0.1))]; }), bad=[];
  const M={ 'voltammetria «Potential (V)»': 'Potential (V)\tCurrent (A)\n'+cv.map(([v,c])=>v.toFixed(4)+'\t'+c.toExponential(4)).join('\n'),
            'voltammetria «E (V)» a punto e virgola': 'E (V);I (uA)\n'+cv.map(([v,c])=>v.toFixed(4)+';'+(c*1e6).toFixed(4)).join('\n'),
            'HPLC senza nome dell\'asse': fx(A)+'\n'+fx(Br) };
  for (const [k,t] of Object.entries(M)){ const rows=t.split('\n').filter(l=>/^-?\d/.test(l)).length, p=C.parseText(t), q=p.importIssue;
    if (p.xs.length!==rows || (q && (q.after||q.channel))) bad.push(`${k}: ${p.xs.length} punti su ${rows}, importIssue ${JSON.stringify(q)}`); }
  assert.deepStrictEqual(bad, []);
});

// ciclo 25 (XRF): «# Calibration1: 0 -0.100» è uno scostamento vero; scartarlo spostava tutti i picchi (circa 20 eV invece del valore giusto)
test('XRF: calibrazione con energia negativa al canale 0 letta per intero (.mca con # Calibration e Amptek)', ()=>{
  const a=-0.1, b=0.01, E=ch=>a+b*ch, n=2048, peaks=[[6.404,4000],[8.048,9000],[10.551,3000]];
  const counts=Array.from({length:n},(_,ch)=>Math.round(5+peaks.reduce((s,[e,h])=>s+h*g(E(ch),e,0.07),0)));
  const hashMca='# SINTETICO\n# Tube Anode: Rh\n# MCA Channels: 2048\n# Calibration1: 0 -0.100\n# Calibration2: 2047 '+E(2047).toFixed(3)+'\n'+counts.join('\n')+'\n';
  const amptek='<<PMCA SPECTRUM>>\nTAG - live_data_1\n<<CALIBRATION>>\nLABEL - Channel\n0 -0.100\n2047 '+E(2047).toFixed(3)+'\n<<DATA>>\n'+counts.join('\n')+'\n<<END>>\n';
  const bad=[];
  for (const [k,t] of [['# Calibration',hashMca],['Amptek',amptek]]){ const p=C.parseText(t); if (!p.xrf || !p.xrf.calibrated){ bad.push(k+': non calibrato'); continue; }
    const cu=maxX({xs:p.xs.filter(x=>x>7.5&&x<8.5), ys:p.ys.filter((y,i)=>p.xs[i]>7.5&&p.xs[i]<8.5)});
    if (Math.abs(cu-8.048)>0.006) bad.push(`${k}: Cu Kα a ${cu.toFixed(4)} keV, atteso 8,048`);
    if (Math.abs(p.xrf.cal.a-a)>1e-6) bad.push(`${k}: scostamento ${p.xrf.cal.a}, atteso ${a}`); }
  assert.deepStrictEqual(bad, []);
});

// ciclo 26: due canali e una tabella riassuntiva corta. La tabella non è un canale: non entra nel conto dei blocchi né nelle righe «di altri canali»
test('canali e tabella riassuntiva: righe e blocchi dei canali contati a parte', ()=>{
  const blk=(h,k)=>h+'\nTime (min),Value (mAU)\n'+T.map(t=>t.toFixed(4)+','+(0.5+k*g(t,5,0.05)).toFixed(4)).join('\n');
  const tab='Peak table\nRT (min),Area\n'+[[2.1,120.5],[5.0,980.2],[8.0,433.9],[9.5,55.1],[11.2,12.3]].map(r=>r.join(',')).join('\n');
  const p=C.parseText(blk('DAD1 A, Sig=254,4 Ref=off',80)+'\n\n'+blk('DAD1 B, Sig=280,4 Ref=off',30)+'\n\n'+tab+'\n'), q=p.importIssue||{};
  assert.equal(p.xs.length, 3000); assert.ok(q.channel, 'secondo canale non segnalato');
  assert.equal(q.after, 3005, 'righe fuori dal blocco letto'); assert.equal(p.afterCh, 3000, 'righe degli altri canali: la tabella non ne fa parte');
  assert.equal(p.nChan, 2, 'canali contati (la tabella non è un canale)'); assert.equal(p.chIx, 0);
});
