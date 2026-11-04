// Regressioni scientifiche: ogni test corrisponde a un errore trovato nella revisione (docs/SCIENZA.md)
const test=require('node:test'), assert=require('node:assert'); const C=require('./load-core.js');
const near=(a,b,t,m)=>assert.ok(Math.abs(a-b)<=t, `${m||''} ${a} ≠ ${b} ± ${t}`);
test('energie delle righe FP coerenti con la tabella XRF (Kα, Kβ, Lα fino a Z alti)', ()=>{
  const name={Ka:'Kα',Kb:'Kβ',La:'Lα'}; let n=0;
  for (const [el,lines] of Object.entries(C.XRF_LINES)) for (const [ln,E] of lines){ const key=Object.keys(name).find(k=>name[k]===ln); if (!key) continue; const fp=C.fpLineE(el,key); if (!fp) continue; n++; near(fp,E,0.2,el+' '+ln); }
  assert.ok(n>80,'righe confrontate '+n);
  near(C.fpLineE('Ba','Kb'),36.378,0.2,'Ba Kβ'); near(C.fpLineE('Sb','Kb'),29.726,0.15,'Sb Kβ');
});
test('sezioni d\'urto: valori di riferimento xraylib entro lo 0,5%', ()=>{
  for (const [el,E,mu] of [['Cu',20,33.7997],['Pb',15,111.574],['Fe',7,55.5604],['Au',30,27.5243],['Ca',5,602.492],['O',8,11.6307],['Ag',30,36.6846]]) near(C.fpMu(el,E)/mu,1,0.005,el);
});
test('uno standard incompleto non produce fattori di taratura sbagliati', ()=>{
  const S=C.fpSetup({anode:'Rh',kv:40}); const I=C.fpIntensities([{comp:{Pb:0.1,Ca:0.36,C:0.11,O:0.43},t:Infinity}],S,[['Pb','La']]);
  const K=C.fpCalibrate([{meas:{Pb:{line:'La',I:I['Pb La']}},comp:{Pb:10}}],S); assert.equal(K.skipped,1); assert.equal(K.G,null);
  const I2=C.fpIntensities([{comp:{Cu:0.9,Sn:0.1},t:Infinity}],S,[['Cu','Ka'],['Sn','Ka']]);
  const K2=C.fpCalibrate([{meas:{Cu:{line:'Ka',I:I2['Cu Ka']},Sn:{line:'Ka',I:I2['Sn Ka']}},comp:{Cu:90,Sn:10}}],S); near(K2.k.Cu,1,1e-6); near(K2.k.Sn,1,1e-6);
});
function gaussRun(sigma, noise){ const n=1800, xs=new Float64Array(n), ys=new Float64Array(n); let seed=7; const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; };
  for (let i=0;i<n;i++){ xs[i]=30*i/(n-1); const gs=noise?noise*Math.sqrt(-2*Math.log(rnd()))*Math.cos(6.2832*rnd()):0; ys[i]=100*Math.exp(-0.5*((xs[i]-15)/sigma)**2)+gs; } return {xs,ys}; }
test('piatti teorici corretti anche per picchi larghi senza limiti di integrazione', ()=>{
  for (const sigma of [0.05,0.2,0.4]){ const {xs,ys}=gaussRun(sigma,0), [m]=C.chromMetrics(xs,ys,[{x:15}],0); const N=(15/sigma)**2; near(m.N/N,1,0.03,'σ='+sigma); near(m.H,100,2,'H'); }
});
test('S/N secondo la farmacopea: 2H/h con h picco-picco', ()=>{
  const {xs,ys}=gaussRun(0.05,0.5), [m]=C.chromMetrics(xs,ys,[{x:15}],0); assert.equal(m.snKind,'pharm'); assert.ok(m.sn>30 && m.sn<130,'S/N '+m.sn); assert.ok(m.sn<m.snSigma,'più basso di H/σ');
});
test('doppio integrale EPR: la deriva del fondo non altera il risultato', ()=>{
  const n=2000, B=new Float64Array(n), mk=d=>{ const y=new Float64Array(n); for (let i=0;i<n;i++){ B[i]=i/n*100; const u=(B[i]-50)/4; y[i]=-u*Math.exp(-0.5*u*u)+d*(i/(n-1)-0.5); } return C.eprDoubleIntegral(B,y).di; };
  const d0=mk(0); for (const d of [0.05,0.1,0.3]) near(mk(d)/d0,1,0.01,'deriva '+d);
});
test('formule chimiche e composizioni', ()=>{ near(C.fpParseComp('CaCO3').Ca,0.4004,0.001); near(C.fpParseComp('Cu 88 Sn 12').Sn,0.12,1e-9); assert.equal(C.fpParseComp('Xx2'),null); near(C.fpParseComp('CaSO4·2H2O').H,0.0234,0.001); });
test('quantificazione FP: da intensità esatte si ritrova la composizione', ()=>{
  const S=C.fpSetup({anode:'Rh',kv:40}), comp={Cu:.85,Sn:.08,Pb:.05,Zn:.02}, L=[['Cu','Ka'],['Sn','Ka'],['Pb','La'],['Zn','Ka']], I=C.fpIntensities([{comp,t:Infinity}],S,L), meas={}; L.forEach(([e,l])=>meas[e]={line:l,I:I[e+' '+l]});
  const Q=C.fpQuant(meas,S,{}); for (const e in comp) near(Q.res[e].w,comp[e]*100,0.02,e);
});
test('fit per famiglie: Ba e Sb non sono più sottostimati', ()=>{
  const S=C.fpSetup({anode:'Rh',kv:50}), xs=new Float64Array(2400).map((_,i)=>0.02*i+0.01), ys=new Float64Array(2400).fill(5), F=C.FP.el.Ba.fam.K, A=1e5;
  F.forEach(([n,E,r])=>{ const w=C.xrfFWHM(E)/2.3548; for (let i=0;i<xs.length;i++) ys[i]+=A*r*0.02*Math.exp(-0.5*((xs[i]-E)/w)**2)/(w*2.5066); });
  const fit=C.xrfFitLines(xs,ys,['Ba'],S,{}), ka=F.find(x=>x[0]==='Ka')[2]*A; near(fit.area.Ba.Ka/ka,1,0.03);
});
test('Currie', ()=>{ const c=C.currie(100,100); near(c.LC,2.33*10,1e-9); near(c.LD,2.71+46.5,1e-9); });
test('mix: fattori di risposta', ()=>{ const k={A:1,B:3}, q=w=>{ const t=k.A*w.A+k.B*w.B; return {A:k.A*w.A/t,B:k.B*w.B/t}; }; const R=C.mixResponse([{w:{A:50,B:50},q:q({A:50,B:50})}]); const W=C.mixWeights(q({A:80,B:20}),R); near(W.w.A.w,80,1e-6); });
