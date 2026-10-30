// Benchmark dei motori di concentrazione per i beni culturali: XRF a parametri fondamentali (senza standard e con uno standard),
// spessore degli strati dai rapporti di riga e dall'attenuazione, percentuali in peso delle miscele (Raman/FTIR) con fattori di risposta.
// Gli spettri XRF sintetici sono generati con il modello FP di Acchiappaspettri, ma con una «realtà» volutamente diversa da quella che
// l'inversione presume (tubo, rivelatore, geometria): così si misura anche l'errore di modello, non solo la coerenza interna.
// Uso:  node test/xrf-fp-benchmark.js        (oppure N=40 node test/xrf-fp-benchmark.js)
const fs=require('fs'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
eval(html.slice(html.indexOf('/*CORE-START*/'), html.indexOf('/*CORE-END*/'))+';global.C={fpTau,fpCompton,fpSetup,fpIntensities,fpQuant,fpCalibrate,fpLine,fpLineE,xrfFitLines,fpMeasure,xrfFP,fpLayerSolve,fpMat,fpParseComp,mixResponse,mixWeights,nnls,FP,xrfFWHM,xrfQuantFit}');
function rng(seed){ let s=seed>>>0||1; return ()=>{ s^=s<<13; s>>>=0; s^=s>>>17; s^=s<<5; s>>>=0; return s/4294967296; }; }
function gauss(r){ let u=0,v=0; while(!u)u=r(); while(!v)v=r(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }
function poisson(r, l){ if (l>30) return Math.max(0, Math.round(l+Math.sqrt(l)*gauss(r))); let L=Math.exp(-l), k=0, p=1; do { k++; p*=r(); } while (p>L); return k-1; }
const N=+process.env.N||30;
const q=(a,f)=>{ const s=a.slice().sort((x,y)=>x-y); return s[Math.min(s.length-1, Math.floor(s.length*f))]; };
const line=(label, txt)=>console.log(label.padEnd(58)+txt);

/* spettro sintetico: righe di tutte le famiglie con le intensità del modello FP «vero», fondo continuo, picchi del tubo diffusi, Poisson */
function synth(layers, Strue, els, r, peakCounts){
  const xs=new Float64Array(2048).map((_,i)=>0.02*i+0.01), ys=new Float64Array(xs.length), lines=[];
  els.forEach(e=>{ for (const l of ['Ka','Kb','La','Lb']) if (C.fpLineE(e,l)) lines.push([e,l]); });
  const I=C.fpIntensities(layers, Strue, lines);
  const add=(E, A, fw)=>{ const sg=fw/2.3548; for (let i=0;i<xs.length;i++){ const d=xs[i]-E; if (Math.abs(d)<5*sg) ys[i]+=A*0.02*Math.exp(-0.5*(d/sg)**2)/(sg*2.5066); } };
  const peaks=[];
  els.forEach(e=>{ const F=C.FP.el[e].fam;
    for (const fam of ['K','L']){ if (!F[fam]) continue; const main=fam==='K'?'Ka':'La', Imain=I[e+' '+main]||0; if (!Imain) continue; const relMain=F[fam].find(x=>x[0]===main)[2];
      F[fam].forEach(([nm,E,rel])=>{ let A=Imain*rel/relMain; if (nm==='Kb') A=I[e+' Kb']||A; if (nm==='Lb1'||nm==='Lb2'||nm==='Lg1'||nm==='Ln'){ const tb=F.L.filter(x=>x[0].startsWith('Lb')).reduce((t,x)=>t+x[2],0); A=(I[e+' Lb']||0)*rel/tb; }
        if (E>0.9) peaks.push([E,A]); }); } });
  const mx=Math.max(...peaks.map(p=>p[1])), sc=peakCounts/mx;
  peaks.forEach(([E,A])=>{ add(E, A*sc, C.xrfFWHM(E)); const es=escSi(E); if (es>0) add(E-1.74, A*sc*es, C.xrfFWHM(E-1.74)); });
  const T=C.FP.el[Strue.anode].fam.K, th=(Strue.psi1+Strue.psi2)*Math.PI/180;
  const IC=C.fpCompton(layers[0].comp, Strue)*sc, relKa=T.find(x=>x[0]==='Ka')[2];
  T.forEach(([nm,E,rel])=>{ add(E, IC*0.3*rel/relKa, C.xrfFWHM(E)); add(E/(1+E/511*(1-Math.cos(th))), IC*rel/relKa, Math.hypot(C.xrfFWHM(E), 0.35)); });
  for (let i=0;i<xs.length;i++){ const x=xs[i]; const b=peakCounts*2e-4*(x>1.5? Math.exp(-(((x-12)/9)**2))+0.3 : 0.2); ys[i]=poisson(r, ys[i]+b); }
  return {xs, ys};
}
// fuga del silicio (Reed 1972): fisica nota, uguale per la realtà e per il modello
function escSi(E){ if (E<1.9) return 0; const mi=C.fpTau('Si',E), mk=C.fpTau('Si',1.74); return 0.5*0.047*(1-1/10.4)*(1-(mk/mi)*Math.log(1+mi/mk)); }
const S0=C.fpSetup({anode:'Rh', kv:40, psi1:45, psi2:45, d1:1, d2:1});
const alloys=[
  ['bronzo','Cu',['Cu','Sn','Pb','Zn','Fe'], r=>{ const Sn=4+r()*10, Pb=r()*8, Zn=r()*3, Fe=r()*0.6; return {Sn,Pb,Zn,Fe,Cu:100-Sn-Pb-Zn-Fe}; }],
  ['ottone','Cu',['Cu','Zn','Pb','Sn','Fe'], r=>{ const Zn=15+r()*20, Pb=r()*4, Sn=r()*2, Fe=r()*0.6; return {Zn,Pb,Sn,Fe,Cu:100-Zn-Pb-Sn-Fe}; }],
  ['argento','Ag',['Ag','Cu','Pb','Au'], r=>{ const Cu=1+r()*15, Pb=r()*1.5, Au=r()*1.5; return {Cu,Pb,Au,Ag:100-Cu-Pb-Au}; }],
  ['oro','Au',['Au','Ag','Cu'], r=>{ const Ag=2+r()*15, Cu=0.5+r()*8; return {Ag,Cu,Au:100-Ag-Cu}; }]
];
const realities=[
  ['realtà = modello (adattamento e statistica)', {}],
  ['tubo: righe caratteristiche ×1,5 e continuo più ripido', {charF:1.5, cexp:1.15}],
  ['tubo: righe caratteristiche ×0,6 e continuo più piatto', {charF:0.6, cexp:0.9}],
  ['rivelatore: Be 25 µm, Si 300 µm; angoli 40°/50°', {beD:25, si:300, psi1:40, psi2:50}],
  ['tutto insieme (scenario pessimistico)', {charF:1.6, cexp:1.15, beD:25, si:300, psi1:40, psi2:50, d2:1.5}]
];
console.log('\n== XRF a parametri fondamentali: leghe sintetiche (Rh, 40 kV), errore relativo sugli elementi > 1% in peso ==');
console.log('   colonne: senza standard (normalizzato a 100%)  ·  FP con 1 standard della stessa famiglia  ·  errore assoluto mediano (% in peso)');
const summary={};
for (const [rlab, rp] of realities){
  const Strue=C.fpSetup(Object.assign({anode:'Rh', kv:40, psi1:45, psi2:45, d1:1, d2:1}, rp));
  const e0=[], e1=[], a0=[], a1=[];
  for (const [alab, base, els, gen] of alloys){
    const r=rng(alab.length*7919+rlab.length);
    const stdC=gen(rng(99+alab.length)); const sSp=synth([{comp:Object.fromEntries(Object.entries(stdC).map(([k,v])=>[k,v/100])), t:Infinity}], Strue, els, r, 2e5);
    const mS=C.xrfFP(sSp.xs, sSp.ys, els, S0).meas, cal=C.fpCalibrate([{meas:mS, comp:stdC}], S0);
    for (let k=0;k<N;k++){
      const truth=gen(r), comp=Object.fromEntries(Object.entries(truth).map(([e,v])=>[e,v/100]));
      const sp=synth([{comp, t:Infinity}], Strue, els, r, 1e5), Q0=C.xrfFP(sp.xs, sp.ys, els, S0).Q, Q1=C.xrfFP(sp.xs, sp.ys, els, S0, {k:cal.k, G:cal.G}).Q;
      for (const e of els){ if (truth[e]<1) continue; const t=truth[e];
        e0.push(Math.abs(Q0.res[e].w-t)/t*100); e1.push(Math.abs(Q1.res[e].w-t)/t*100); a0.push(Math.abs(Q0.res[e].w-t)); a1.push(Math.abs(Q1.res[e].w-t)); }
    }
  }
  line(rlab, `±${q(e0,0.5).toFixed(1)}% (90%: ${q(e0,0.9).toFixed(1)}%)  ·  ±${q(e1,0.5).toFixed(1)}% (90%: ${q(e1,0.9).toFixed(1)}%)  ·  ${q(a0,0.5).toFixed(2)} / ${q(a1,0.5).toFixed(2)}`);
  summary[rlab]=[q(e0,0.5), q(e1,0.5)];
}

console.log('\n== Strati pittorici e preparazioni spessi: scala assoluta dal picco Compton, il resto = legante organico ==');
console.log('   colonne: errore relativo mediano (90%) sugli elementi > 1%  ·  errore assoluto mediano (% in peso)  ·  quote con avviso «Compton debole»');
{ const P={lw:C.fpParseComp('2PbCO3·Pb(OH)2'), ve:C.fpParseComp('HgS'), oc:C.fpParseComp('Fe2O3'), ch:C.fpParseComp('CaCO3'), gy:C.fpParseComp('CaSO4·2H2O'), az:C.fpParseComp('Cu3(CO3)2(OH)2'), um:C.fpParseComp('Fe 40 Mn 15 O 45'), oil:C.fpParseComp('C 77 H 12 O 11')};
  const kinds=[['matrice leggera (terre, azzurrite su creta o gesso)', r=>({ch:r()<0.5?0.5+r():0, gy:r()<0.5?0.5+r():0.2, oc:r()<0.6?r()*0.3:0, um:r()<0.3?r()*0.2:0, az:r()<0.3?r()*0.3:0, lw:r()<0.4?r()*0.1:0})],
               ['matrice pesante (biacca, cinabro)', r=>({lw:0.5+r(), ve:r()<0.5?r()*0.4:0, ch:r()<0.3?r()*0.2:0})]];
  for (const [rlab, rp] of [realities[0], realities[4]]) for (const [klab, gen] of kinds){
    const Strue=C.fpSetup(Object.assign({anode:'Rh', kv:40, psi1:45, psi2:45, d1:1, d2:1}, rp)), r=rng(31+klab.length), e=[], a=[], els=['Pb','Hg','Fe','Ca','Cu','Mn','S']; let warn=0, tot=0;
    for (let k=0;k<N*2;k++){ const f=gen(r), sum=Object.values(f).reduce((x,y)=>x+y,0)||1, binder=0.1+r()*0.15, comp={};
      for (const q in f) for (const el in P[q]) comp[el]=(comp[el]||0)+P[q][el]*f[q]/sum*(1-binder);
      for (const el in P.oil) comp[el]=(comp[el]||0)+P.oil[el]*binder;
      const present=els.filter(x=>comp[x]>0.002); if (!present.length) continue;
      const sp=synth([{comp, t:Infinity}], Strue, present, r, 1e5), R=C.xrfFP(sp.xs, sp.ys, present, S0, {mode:'compton', balance:P.oil}); tot++;
      if (R.Q.relC>0.1){ warn++; continue; }
      for (const el of present){ const t=comp[el]*100; if (t<1) continue; e.push(Math.abs(R.Q.res[el].w-t)/t*100); a.push(Math.abs(R.Q.res[el].w-t)); } }
    line((rp.charF?'pessimistico · ':'')+klab, e.length ? `±${q(e,0.5).toFixed(1)}% (90%: ${q(e,0.9).toFixed(1)}%)  ·  ${q(a,0.5).toFixed(2)}  ·  avviso ${warn}/${tot}` : `avviso ${warn}/${tot}`); } }

console.log('\n== Sovrapposizioni risolte dall\'adattamento per famiglie: Pb Lα (10,55 keV) sopra As Kα (10,54 keV) ==');
{ const S=S0, r=rng(7), err=[];
  for (let k=0;k<N;k++){ const As=0.5+r()*5, Pb=20+r()*40, comp={Pb:Pb/100, As:As/100, Ca:0.2, O:1-Pb/100-As/100-0.2};
    const sp=synth([{comp, t:Infinity}], S, ['Pb','As','Ca'], r, 1e5), fit=C.xrfFP(sp.xs, sp.ys, ['Pb','As','Ca'], S, {balance:{O:1}}).fit;
    const I=C.fpIntensities([{comp, t:Infinity}], S, [['As','Ka'],['Pb','La']]), ratioTrue=I['As Ka']/I['Pb La'], ratioFit=fit.area.As.Ka/fit.area.Pb.La;
    err.push(Math.abs(ratioFit/ratioTrue-1)*100); }
  line('rapporto As Kα / Pb Lα (As 0,5–5%, Pb 20–60%)', `errore mediano ${q(err,0.5).toFixed(1)}%  (90%: ${q(err,0.9).toFixed(1)}%)`); }

console.log('\n== Spessore degli strati: elemento sepolto sotto uno strato (dalla 2ª colonna in poi la «realtà» è quella pessimistica) ==');
{ const Strue=C.fpSetup({anode:'Rh', kv:40, charF:1.6, cexp:1.15, beD:25, si:300, psi1:40, psi2:50}), S=S0;
  const cases=[
    ['biacca sotto legante organico (Pb Lα/Lβ)', 'org', 'biacca', 'Pb', ['La','Lb'], [20,60,150,300]],
    ['biacca sotto gesso (Pb Lα/Lβ)', 'gesso', 'biacca', 'Pb', ['La','Lb'], [10,25,50,100]],
    ['rame sotto doratura (Cu Kα/Kβ)', 'oro', 'rame', 'Cu', ['Ka','Kb'], [0.2,0.5,1,2]],
    ['argento sotto doratura (Ag Kα/Kβ)', 'oro', 'argento', 'Ag', ['Ka','Kb'], [0.5,1,2,4]],
  ];
  for (const [lab, cov, sub, el, ls, ums] of cases){
    const Cv=C.fpMat(cov), Sb=C.fpMat(sub), rows=[];
    for (const um of ums){ const t=um*1e-4*Cv.rho, Iu=C.fpIntensities([{comp:Cv.comp, t},{comp:Sb.comp, t:Infinity}], Strue, [[el,ls[0]],[el,ls[1]]], {sec:false});
      const I0=C.fpIntensities([{comp:Sb.comp, t:Infinity}], Strue, [[el,ls[0]],[el,ls[1]]], {sec:false});
      const R=Iu[el+' '+ls[0]]/Iu[el+' '+ls[1]], R0=I0[el+' '+ls[0]]/I0[el+' '+ls[1]];
      const Im=C.fpIntensities([{comp:Cv.comp, t},{comp:Sb.comp, t:Infinity}], S, [[el,ls[0]],[el,ls[1]]], {sec:false}), Rm=Im[el+' '+ls[0]]/Im[el+' '+ls[1]];
      const t0=C.fpLayerSolve({S, cover:Cv, sub:Sb, el, lines:ls, method:'ratio', R:Rm}), th=C.fpLayerSolve({S, cover:Cv, sub:Sb, el, lines:ls, method:'ratio', R}), rf=C.fpLayerSolve({S, cover:Cv, sub:Sb, el, lines:ls, method:'ratio', R, R0meas:R0});
      const at=C.fpLayerSolve({S, cover:Cv, sub:Sb, el, lines:ls, method:'atten', ratio:Iu[el+' '+ls[0]]/I0[el+' '+ls[0]]});
      rows.push(`${um} µm → ${t0.um.toFixed(um<1?2:1)} | ${th.um.toFixed(um<1?2:1)} | ${rf.um.toFixed(um<1?2:1)} | ${at.um.toFixed(um<1?2:1)}`); }
    line(lab, rows.join(' · ')); }
  console.log('   (vero → R₀ teorico, strumento descritto bene | R₀ teorico, strumento diverso | R₀ da uno spettro di riferimento | attenuazione rispetto al riferimento)'); }
{ // incertezza di conteggio: spettro sintetico con Poisson, rapporto dalle aree adattate
  const S=S0, r=rng(11), Cv=C.fpMat('org'), Sb=C.fpMat('biacca'), res=[];
  for (let k=0;k<N;k++){ const um=100, t=um*1e-4*Cv.rho, layers=[{comp:Cv.comp, t},{comp:Sb.comp, t:Infinity}];
    const sp=synth(layers, S, ['Pb','C','O'], r, 5e4), fit=C.xrfFitLines(sp.xs, sp.ys, ['Pb'], S, {split:{Pb:true}});
    const R=fit.area.Pb.La/fit.area.Pb.Lb, sR=R*Math.hypot(fit.sArea.Pb.La/fit.area.Pb.La, fit.sArea.Pb.Lb/fit.area.Pb.Lb);
    const o=C.fpLayerSolve({S, cover:Cv, sub:Sb, el:'Pb', lines:['La','Lb'], method:'ratio', R, sR}); res.push(o.um); }
  line('biacca sotto 100 µm di legante, 5·10⁴ conteggi al picco', `mediana ${q(res,0.5).toFixed(0)} µm, 90% delle stime tra ${q(res,0.05).toFixed(0)} e ${q(res,0.95).toFixed(0)} µm`); }

console.log('\n== Miscele (Raman/FTIR): da quote spettrali a % in peso con fattori di risposta imparati da miscele note ==');
{ const r=rng(5), ids=['A','B','C'], kTrue={A:1, B:3.2, C:0.45}, eRaw=[], eCal=[];
  const quote=(w, noise)=>{ const t=ids.reduce((s,i)=>s+kTrue[i]*w[i],0), o={}; ids.forEach(i=>o[i]=kTrue[i]*w[i]/t*(1+noise*gauss(r))); return o; };
  const rand=()=>{ const a=[r(),r(),r()], s=a[0]+a[1]+a[2]; return {A:100*a[0]/s, B:100*a[1]/s, C:100*a[2]/s}; };
  const stds=Array.from({length:4},()=>{ const w=rand(); return {w, q:quote(w,0.03)}; }), R=C.mixResponse(stds);
  for (let k=0;k<N*5;k++){ const w=rand(), qq=quote(w,0.03), W=C.mixWeights(qq, R), tq=ids.reduce((s,i)=>s+qq[i],0);
    ids.forEach(i=>{ eRaw.push(Math.abs(100*qq[i]/tq-w[i])); eCal.push(Math.abs(W.w[i].w-w[i])); }); }
  line('3 componenti, risposte 1 : 3,2 : 0,45, rumore 3%, 4 standard', `quote spettrali ±${q(eRaw,0.5).toFixed(1)} (90%: ${q(eRaw,0.9).toFixed(1)}) · con fattori ±${q(eCal,0.5).toFixed(1)} (90%: ${q(eCal,0.9).toFixed(1)}) % in peso`); }
