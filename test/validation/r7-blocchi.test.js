// R7 (blocchi): due blocchi di dati senza testo in mezzo (riga vuota, oppure attaccati con l'asse che riparte) non vanno
// uniti e ordinati per x: si legge un blocco e l'altro è segnalato. Casi dei rapporti del ciclo 25: agente C file 13–15, HPLC s10.
// Dati SINTETICI generati qui. Prova di sabotaggio: ACCH_INDEX=<index della rc.3> node --test test/validation/r7-blocchi.test.js deve fallire.
'use strict';
const test=require('node:test'), assert=require('node:assert');
const C=require('./core.js');

let s=11; const rnd=()=>{ s=(s*16807)%2147483647; return s/2147483647-0.5; };
const g=(t,c,w)=>Math.exp(-0.5*((t-c)/w)**2);
const chrom=(n,dt,peaks,base=0.5)=>Array.from({length:n},(_,i)=>{ const t=i*dt; return [t, base+0.02*rnd()+peaks.reduce((a,[c,w,h])=>a+h*g(t,c,w),0)]; });
const fx=(r,sep='\t')=>r.map(([t,y])=>t.toFixed(4)+sep+y.toFixed(4)).join('\n');
const cA=chrom(3000,0.004,[[5,0.05,80]]), cB=chrom(3000,0.004,[[5,0.05,20],[8,0.05,50]]), cB2=chrom(4000,0.004,[[5,0.05,20],[8,0.05,50]]);
const ir=Array.from({length:1801},(_,i)=>{ const x=4000-i*2; return [x, 0.05+0.8*g(x,1730,8)+0.01*rnd()]; });
const cA1=chrom(2751,0.004,[[6,0.05,80]]).map(([t,y])=>[t+1,y]), cB3=chrom(3001,0.004,[[5,0.05,20],[8,0.05,50]]);
const ir1=Array.from({length:1551},(_,i)=>{ const x=3500-i*2; return [x, 0.05+0.4*g(x,1730,8)+0.01*rnd()]; }), irTxt2=r=>r.map(([x,y])=>x+'\t'+y.toFixed(5)).join('\n');
const irTxt=k=>ir.map(([x,y])=>x+'\t'+(y*k).toFixed(5)).join('\n');
const maxOf=p=>{ let k=0; for (let i=1;i<p.ys.length;i++) if (p.ys[i]>p.ys[k]) k=i; return {x:p.xs[k], y:p.ys[k]}; };
const dupX=p=>{ let n=0; for (let i=1;i<p.xs.length;i++) if (p.xs[i]===p.xs[i-1]) n++; return n; };
// picchi sopra metà altezza nell'intorno di 5 min: con i blocchi uniti il segnale va a zig-zag e i massimi locali si moltiplicano
const localMax=(p,a,b,thr)=>{ let n=0; for (let i=1;i<p.xs.length-1;i++) if (p.xs[i]>a && p.xs[i]<b && p.ys[i]>thr && p.ys[i]>p.ys[i-1] && p.ys[i]>=p.ys[i+1]) n++; return n; };

const CASES={
  '13 riga vuota': {txt:fx(cA)+'\n\n'+fx(cB)+'\n', n:3000, after:3000, ymax:[80,1]},
  '14 attaccati, l\'asse riparte da 0': {txt:'Time (min)\tmAU\n'+fx(cA)+'\n'+fx(cB)+'\n', n:3000, after:3000, ymax:[80,1]},
  '15 FTIR, due scansioni (asse decrescente)': {txt:irTxt(1)+'\n\n'+irTxt(0.5)+'\n', n:1801, after:1801, ymax:[0.85,0.03], xmax:1730},
  's10 CSV con intestazione': {txt:'Time (min),Signal (mAU)\n'+fx(cA,',')+'\n\n'+fx(cB,','), n:3000, after:3000, ymax:[80,1]},
  's10 a tabulazioni': {txt:fx(cA)+'\n\n'+fx(cB), n:3000, after:3000, ymax:[80,1]},
  'secondo blocco più lungo': {txt:fx(cA)+'\n'+fx(cB2), n:4000, after:3000, ymax:[50,1], xmax:8},
  // ciclo 26: il secondo blocco comincia prima dell'inizio del primo (HPLC da 1 e da 0 min; FTIR 3500–400 poi 4000–400)
  'secondo blocco che parte prima del primo (HPLC)': {txt:'Time (min)\tmAU\n'+fx(cA1)+'\n'+fx(cB3)+'\n', n:3001, after:2751, ymax:[50,1], xmax:8},
  'FTIR, seconda scansione più ampia (riga vuota)': {txt:irTxt2(ir1)+'\n\n'+irTxt2(ir)+'\n', n:1801, after:1551, ymax:[0.85,0.03], xmax:1730},
  'FTIR, seconda scansione più ampia (attaccata)': {txt:irTxt2(ir1)+'\n'+irTxt2(ir)+'\n', n:1801, after:1551, ymax:[0.85,0.03], xmax:1730},
};
test('R7 blocchi: due blocchi senza testo in mezzo, si legge un blocco e l\'altro è segnalato', ()=>{
  const bad=[];
  for (const [k,c] of Object.entries(CASES)){ const p=C.parseText(c.txt), q=p.importIssue||{}, m=maxOf(p);
    if (p.xs.length!==c.n) bad.push(`${k}: ${p.xs.length} punti, attesi ${c.n}`);
    if (q.after!==c.after || !q.channel) bad.push(`${k}: secondo blocco non segnalato (importIssue ${JSON.stringify(p.importIssue)})`);
    if (dupX(p)) bad.push(`${k}: ${dupX(p)} x ripetute`);
    if (Math.abs(m.y-c.ymax[0])>c.ymax[1]) bad.push(`${k}: massimo ${m.y.toFixed(3)}, atteso ${c.ymax[0]}`);
    if (c.xmax!=null && Math.abs(m.x-c.xmax)>0.05*Math.abs(c.xmax)) bad.push(`${k}: massimo a ${m.x}, atteso ${c.xmax}`);
    if (!c.xmax && localMax(p,4.8,5.2,40)>1) bad.push(`${k}: ${localMax(p,4.8,5.2,40)} massimi locali intorno a 5 min (zig-zag)`); }
  assert.deepStrictEqual(bad, []);
});

// niente falsi blocchi: assi decrescenti, passo irregolare, x arrotondate (ripetute), piccoli passi indietro, andata e ritorno, righe mescolate, pausa
const N=2000, jit=Array.from({length:N},()=>rnd());
const SAFE={
  'asse decrescente, passo irregolare ±40%': (()=>{ let x=4000; return Array.from({length:N},(_,i)=>{ x-=2*(1+0.8*jit[i]); return x.toFixed(3)+'\t'+(0.1+g(x,1700,10)).toFixed(5); }).join('\n'); })(),
  'tempo arrotondato a 0,01 min (x ripetute)': Array.from({length:N},(_,i)=>(i*0.004).toFixed(2)+'\t'+(0.5+80*g(i*0.004,5,0.05)+0.02*jit[i]).toFixed(4)).join('\n'),
  'piccoli passi indietro (rumore sull\'asse)': Array.from({length:N},(_,i)=>(400+i+0.9*jit[i]).toFixed(3)+'\t'+(1+g(400+i,1000,5)).toFixed(4)).join('\n'),
  'andata e ritorno (voltammetria)': Array.from({length:2*N},(_,i)=>{ const v=i<N?-0.5+i*0.0005:-0.5+(2*N-1-i)*0.0005; return v.toFixed(4)+'\t'+(1e-6*(v+(i<N?0.1:-0.1))).toExponential(4); }).join('\n'),
  'righe mescolate': (()=>{ const r=Array.from({length:N},(_,i)=>i), out=[]; for (let i=N-1;i>0;i--){ const j=Math.floor((jit[i]+0.5)*(i+1))%(i+1); [r[i],r[j]]=[r[j],r[i]]; } r.forEach(i=>out.push((i*0.01).toFixed(2)+'\t'+(1+g(i*0.01,9,0.1)).toFixed(4))); return out.join('\n'); })(),
  'pausa nella misura (riga vuota, l\'asse prosegue)': Array.from({length:N},(_,i)=>(i*0.5).toFixed(1)+'\t'+(1+g(i*0.5,300,3)).toFixed(4)+(i===N/2?'\n':'')).join('\n'),
};
test('R7 blocchi: nessun falso blocco su assi decrescenti, passo irregolare e righe in disordine', ()=>{
  const bad=[];
  for (const [k,t] of Object.entries(SAFE)){ const rows=t.split('\n').filter(l=>l.trim()).length, p=C.parseText(t), q=p.importIssue;
    if (p.xs.length!==rows) bad.push(`${k}: ${p.xs.length} punti su ${rows}`);
    if (q && (q.after || q.channel)) bad.push(`${k}: falso secondo blocco (${JSON.stringify(q)})`); }
  assert.deepStrictEqual(bad, []);
});

// ciclo 26, riverifica: con il separatore delle migliaia sull'asse («1,000», «1.000») l'asse sembra tornare da 999 a 1.
// Non è un secondo blocco: resta il ⛔ «separatori delle migliaia» e nessun avviso di blocco.
test('R7 blocchi: separatore delle migliaia sull\'asse, nessun falso blocco e ⛔ delle migliaia', ()=>{
  const fmt=(x,s)=>x>=1000?Math.floor(x/1000)+s+String(x%1000).padStart(3,'0'):String(x);
  const M={
    'Raman 100–3200, «1,000»': Array.from({length:3101},(_,i)=>100+i).map(x=>fmt(x,',')+'\t'+(0.5+g(x,1086,6)).toFixed(4)).join('\n'),
    'Raman 200–3200, «1.000»': Array.from({length:3001},(_,i)=>200+i).map(x=>fmt(x,'.')+'\t'+(0.1+g(x,1600,8)).toFixed(4)).join('\n'),
    'UV 190–1100, «1,000»': Array.from({length:911},(_,i)=>190+i).map(x=>fmt(x,',')+'\t'+(0.05+g(x,280,10)).toFixed(4)).join('\n'),
    'FTIR 4000–400 decrescente, «4,000»': Array.from({length:1801},(_,i)=>4000-2*i).map(x=>fmt(x,',')+'\t'+(0.05+0.8*g(x,1730,8)).toFixed(4)).join('\n'),
  };
  const bad=[];
  for (const [k,t] of Object.entries(M)){ const p=C.parseText('X\tY\n'+t), q=p.importIssue||{};
    if (!q.thou) bad.push(`${k}: manca il ⛔ delle migliaia (${JSON.stringify(p.importIssue)})`);
    if (q.channel || q.after) bad.push(`${k}: falso secondo blocco (${JSON.stringify(p.importIssue)})`); }
  assert.deepStrictEqual(bad, []);
});

// ciclo 26, seconda riverifica: un asse con tre decimali veri («200.000») non è un separatore delle migliaia: due scansioni restano separate
test('R7 blocchi: asse a tre decimali, due scansioni separate con l\'avviso', ()=>{
  const sc=(a,b,st,c,w)=>Array.from({length:Math.round((b-a)/st)+1},(_,i)=>a+i*st).map(x=>x.toFixed(3)+'\t'+(0.05+g(x,c,w)).toFixed(4)).join('\n');
  const M={ 'UV 200.000–800.000 ×2 (riga vuota)': sc(200,800,0.5,280,5)+'\n\n'+sc(200,800,0.5,280,5),
            'UV 200.000–800.000 ×2 (attaccate)': sc(200,800,0.5,280,5)+'\n'+sc(200,800,0.5,280,5),
            'Raman 100.000–1800.000 ×2': sc(100,1800,1,1086,4)+'\n'+sc(100,1800,1,1086,4) };
  const bad=[];
  for (const [k,t] of Object.entries(M)){ const p=C.parseText('X\tY\n'+t), q=p.importIssue||{}, n=t.split('\n').filter(l=>l.trim()).length/2;
    if (p.xs.length!==n || !q.after) bad.push(`${k}: ${p.xs.length} punti, attesi ${n} con l'avviso del secondo blocco (${JSON.stringify(p.importIssue)})`); }
  assert.deepStrictEqual(bad, []);
});
