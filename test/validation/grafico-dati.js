// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I6: dati SINTETICI per le prove del grafico nel browser (test/validation/i6-grafico-ui.test.js) e nell'app (test/e2e/e2e-page.js).
// page.evaluate(I6_SETUP) definisce window.I6 nella pagina: crea N spettri da n punti (FTIR sintetico con picchi stretti di un punto),
// li mette nell'elenco come se fossero stati letti, apre il confronto e misura i disegni.
'use strict';
function I6_SETUP(){
  if (window.I6) return;
  const rnd=seed=>{ let s=seed||7; return ()=>{ s=(s*16807)%2147483647; return s/2147483647-0.5; }; };
  const g=(x,c,w)=>Math.exp(-0.5*((x-c)/w)**2);
  // uno spettro: X crescenti, picchi larghi e un picco stretto di un solo punto ogni 100 000 punti (deve restare visibile, G3)
  function spectrum(n, k){ const r=rnd(11+k), xs=new Float64Array(n), ys=new Float64Array(n);
    for (let i=0;i<n;i++){ const x=400+i*3600/(n-1); xs[i]=x; ys[i]=0.05+g(x,1000+7*k,4)+0.6*g(x,2500-5*k,6)+0.4*g(x,3300,5)+0.01*r(); }
    for (let i=50000+137*k;i<n;i+=100000) ys[i]+=0.8;   // picchi stretti
    return {xs, ys}; }
  async function load(N, n, instr){ const ents=[]; for (let k=0;k<N;k++) ents.push(spectrum(n, k));
    // lettura vera per il primo (stessa strada dell'utente); gli altri spettri copiano la sua struttura con i loro numeri
    const head='Wavenumber (cm-1)\tAbsorbance\n';
    const txt=head+Array.from(ents[0].xs.subarray(0,4096), (x,i)=>x.toFixed(4)+'\t'+ents[0].ys[i].toFixed(6)).join('\n')+'\n';
    await addEntries([{file:new File([txt],'sintetico-0.txt'), path:'sintetico-0.txt'}]);
    const f0=files[files.length-1];
    const made=[];
    for (let k=0;k<N;k++){ const f=k===0 ? f0 : Object.assign({}, f0, {id:++uid, removed:[], added:[], labels:{}, an:null, fit:null});
      f.name=f.path='sintetico-'+k+'.txt'; f.title='Sintetico '+(k+1); f.xs=f.xs0=ents[k].xs; f.ys=ents[k].ys; f._p=Object.assign({}, f0._p, {ys:ents[k].ys}); f.n0=n; f.hash='i6'+k; f.size=n*16;
      for (const key of Object.keys(f)) if (key[0]==='_' && key!=='_p') delete f[key];
      if (instr){ f.instr=f.autoInstr=instr; f.kind=kindOf(f); }
      if (k) files.push(f); made.push(f); }
    cur=files.indexOf(f0); refreshAll(); return made; }
  // confronto di tutti gli spettri caricati, nella vista «Sfalsati» (predefinita)
  function compare(list, mode){ const c=newCmp(list[0].instr, list); if (mode) c.mode=mode; go(2); setView('cmp'); return c; }
  const frames=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  // G1: zoom e spostamento animati, un passo per fotogramma; tempo di ogni passo (rendering della pagina e disegno) e intervalli tra fotogrammi
  async function animate(steps){ const t=zTarget(); const L=[], dt=[]; let last=performance.now();
    const [fa,fb]=t.range;
    for (let s=0;s<steps;s++){ await new Promise(r=>requestAnimationFrame(r)); const now=performance.now(); dt.push(now-last); last=now;
      const a=performance.now();
      if (s<steps/2){ const k=0.94; zoomBy(k, fa+(fb-fa)*0.37); }   // zoom verso un punto
      else { const z=t.o._zoom||[fa,fb], w=z[1]-z[0], sh=w*0.03*(s%20<10?1:-1); t.o._zoom=[Math.max(fa,z[0]+sh), Math.min(fb,z[1]+sh)]; renderPreview(); }   // spostamento
      L.push(performance.now()-a); }
    await new Promise(r=>requestAnimationFrame(r)); dt.push(performance.now()-last);
    return {work:L, frames:dt.slice(1)}; }
  window.I6={spectrum, load, compare, frames, animate};
}
module.exports={I6_SETUP};
