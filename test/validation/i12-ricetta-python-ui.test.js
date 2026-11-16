// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// R15, tappa I12: la ricetta esportata come script Python rifà gli stessi CSV dell'app: elenco dei picchi, dati elaborati, misure di banda e tarature,
// e (seconda parte) tutte le tabelle di analisi: controllo di qualità, parametri per tecnica, fisisorbimento e chemisorbimento completi, MCR-ALS e
// cinetica, deconvoluzione, PCA, PLS, miscele, composizione XRF con standard, concentrazioni dalla libreria; lettura dei file originali dai byte.
// I test girano in Chrome (V8, motore «v8-libm» della sonda); JavaScriptCore del desktop è provato dai test unitari dei moduli con osascript.
// Per progetti SINTETICI e per il corpus test/corpus: ogni numero del CSV scritto dallo script coincide con quello dell'app entro 1e-9 relativo;
// si dichiara il LRE minimo (−log10 dell'errore relativo, 15 se identico). Lo script deve dire «verifica: identico».
// Una copia sabotata (un coefficiente di Savitzky–Golay) deve dare «DIVERSO» con esito 1. Voce nella finestra Esporta, online e desktop.
// Uso: PW_CHANNEL=chrome node --test test/validation/i12-ricetta-python-ui.test.js   (serve python3 ≥ 3.10; senza, i confronti si saltano e lo si dice)
'use strict';
const {describe, it, before, after}=require('node:test'), assert=require('node:assert'), path=require('path'), fs=require('fs'), os=require('os'), {spawnSync}=require('child_process');
const B=require('./browser.js'), {openDesk}=require('./tauri-mock.js'), SY=require('./chemo/sintetici.js'), G=require('../fixtures/gen-canali.js'), XR=require('../fixtures/xrf-c27/genera.js'), D4=require('./i4-dati.js');

const PY=(()=>{ for (const c of [process.env.PYTHON, 'python3', 'python'].filter(Boolean)){ const r=spawnSync(c, ['-c','import sys; print(sys.version_info>=(3,10))'], {encoding:'utf8'}); if (r.status===0 && /True/.test(r.stdout)) return c; } return null; })();
const NONE={outPdf:false,outPng:false,outSvg:false,csvPeaks:false,csvData:false,csvRaw:false,outOrig:false,outPy:false,outAnalysis:false,outLibCharts:false,outTrace:false,outOrigin:false,outOpj:false,outOpju:false,outProject:false,zipAll:false,expSub:false,expScope:'all',expNames:{}};
const TMP=fs.mkdtempSync(path.join(os.tmpdir(),'acch-i12-'));
const LRE_MIN=[];   // [caso, LRE minimo, celle numeriche]

// ---------- dati sintetici ----------
const g=(x,c,w)=>Math.exp(-Math.pow((x-c)/w,2));
const rnd=(()=>{ let s=12345; return ()=>{ s=(s*1103515245+12345)%2147483648; return s/2147483648-0.5; }; })();
const col=(rows, sep, h)=>(h?h+'\n':'')+rows.map(r=>r.join(sep)).join('\n');
const ftirA=k=>col(Array.from({length:700},(_,i)=>{ const x=4000-i*5; return [x, (0.05+0.9*g(x,1720+k,12)+0.4*g(x,2920,18)+0.25*g(x,1450,9)+0.002*rnd()+0.00002*(x-400)).toFixed(5)]; }), ',', 'Wavenumber (cm-1),Absorbance');
const ftirT=()=>col(Array.from({length:600},(_,i)=>{ const x=4000-i*6; return [x, (100*Math.pow(10,-(0.03+0.8*g(x,1650,15)+0.3*g(x,3300,60)))+0.05*rnd()).toFixed(4)]; }), '\t', 'cm-1\t%T');
const raman=()=>col(Array.from({length:900},(_,i)=>{ const x=100+i*2; return [x, (200+3000*g(x,1350,25)+5000*g(x,1590,18)+0.4*x+20*rnd()+(i===333?4000:0)).toFixed(2)]; }), '\t', 'Raman shift (cm-1)\tIntensity');
const uv=()=>col(Array.from({length:500},(_,i)=>{ const x=200+i; return [x, (0.1+1.2*g(x,280,15)+0.6*g(x,420,30)+0.003*rnd()).toFixed(5)]; }), ';', 'Wavelength (nm);Abs').replace(/(\d)\.(\d)/g,'$1,$2');
const hplc=(amp, t0)=>col(Array.from({length:1500},(_,i)=>{ const t=i*0.004; return [t.toFixed(3), (amp*g(t,t0||4.2,0.05)+30*g(t,2.1,0.04)+0.2*rnd()+0.5*t).toFixed(3)]; }), '\t', 'Time (min)\tSignal (mAU)');
const tga=()=>col(Array.from({length:800},(_,i)=>{ const T=30+i; const m=100-15/(1+Math.exp(-(T-300)/12))-30/(1+Math.exp(-(T-520)/15)); return [T, (m+0.01*rnd()).toFixed(4)]; }), '\t', 'Temperature (°C)\tWeight (%)');
const dsc=()=>'Heating rate: 10 °C/min\nSample mass: 5.2 mg\n'+col(Array.from({length:900},(_,i)=>{ const T=20+i*0.25; return [T.toFixed(2), (-0.2-3*g(T,120,3)+1.5*g(T,180,4)+0.002*T+0.003*rnd()).toFixed(5)]; }), '\t', 'Temperature (°C)\tHeat Flow (mW)');
const epr=()=>'Frequency: 9.4 GHz\n'+col(Array.from({length:1024},(_,i)=>{ const B=320+i*0.04; const d=(B-336)/0.6; return [B.toFixed(3), (-2*d*Math.exp(-d*d)*1000+3*rnd()).toFixed(3)]; }), '\t', 'Field (mT)\tIntensity');
const hplcSec=()=>col(Array.from({length:900},(_,i)=>{ const t=i*0.25; return [t.toFixed(2), (80*g(t,120,4)+0.1*rnd()).toFixed(3)]; }), '\t', 'Time (s)\tSignal (mAU)');
const inverted=()=>col(Array.from({length:400},(_,i)=>{ const x=3000-i*5; return [(0.1+g(x,1700,15)+0.001*rnd()).toFixed(5), x]; }), ',', 'Absorbance,Wavenumber (cm-1)');
const uvEV=()=>col(Array.from({length:400},(_,i)=>{ const e=1.5+i*0.01; return [e.toFixed(3), (0.2+g(e,3.1,0.15)+0.002*rnd()).toFixed(5)]; }), '\t', 'Energy (eV)\tAbsorbance');

// serie (MCR-ALS con chiusura e MCR-BANDS; cinetica consecutiva con il confronto dei modelli): dati SINTETICI di test/validation/chemo
const serieJson=()=>{ const C=SY.chiusura().D, m=C.m, n=C.n, K=SY.serieCinetica('consec',[0.5,0.12],{},25,18,0.002,7);
  return JSON.stringify([['mcr.series', {kind:'generic', t:{values:Array.from({length:m},(_,i)=>i), quantity:'tempo', unit:'min'}, x:{values:Array.from({length:n},(_,j)=>1000+j*4), quantity:'x', unit:''}, y:{}, shape:[m,n], dtype:'f64', data:Array.from(C.a), meta:{version:'mcr-1'}}, {mcr:{nc:2, closure:1, init:'efa', initOn:'C'}}],
    ['kin.series', {kind:'kinetics', t:K.t, x:{values:Array.from(K.x.values), quantity:'x', unit:'nm'}, y:{}, shape:K.shape, dtype:'f64', data:Array.from(K.data), meta:{}}, {kin:{model:'consec'}, mcr:{nc:3}}]]); };
const SORP_FX=n=>fs.readFileSync(path.join(B.ROOT,'test','fixtures','sorption',n),'utf8');
// Raman di miscele di tre componenti puri (riferimenti), UV con analita e interferente per la PLS
const pv=(x,c,w,eta)=>{ const t=(x-c)/w; return eta*2/(Math.PI*w)/(1+4*t*t)+(1-eta)*2*Math.sqrt(Math.LN2/Math.PI)/w*Math.exp(-4*Math.LN2*t*t); };
const COMP=[[[480,30],[1085,25]],[[620,40],[1300,35],[1600,20]],[[900,50],[1450,30]]], pure=(k,x)=>COMP[k].reduce((s,[c,w])=>s+1000*pv(x,c,w,0.5),0);
const MIX=[[50,30,20],[20,50,30],[30,20,50],[60,25,15],[10,40,50],[45,45,10]];
const ramanMix=w=>col(Array.from({length:401},(_,i)=>{ const x=200+i*4; return [x, (w.reduce((s,v,k)=>s+v/100*pure(k,x),0)+5+0.004*x+0.15*rnd()).toFixed(4)]; }), '\t', 'Raman shift (cm-1)\tIntensity');
const uvPls=c=>{ const ii=0.5+rnd(); return col(Array.from({length:101},(_,i)=>{ const x=250+i*2; return [x, (0.1*c*Math.exp(-(((x-320)/25)**2))+0.3*ii*Math.exp(-(((x-360)/30)**2))+0.004*rnd()).toFixed(5)]; }), '\t', 'Wavelength (nm)\tAbsorbance'); };
// XRF: bronzi arsenicali con tubo Rh (generatore di test/fixtures/xrf-c27), quattro standard e due campioni
const XRF=[[0.90,0.08,0.02],[0.86,0.12,0.02],[0.92,0.05,0.03],[0.88,0.10,0.02],[0.89,0.09,0.02],[0.91,0.06,0.03]];
const PROJECTS={
  // nome: [file, impostazioni globali S, lavoro su singoli spettri]
  ftir:{files:[['ftA_1.csv',ftirA(0)],['ftA_2.csv',ftirA(15)],['ftT.txt',ftirT()]], set:{showArea:true, smooth:{ftir:11}, base:{ftir:'rubber'}, conv:{ftir:'A'}},
    work:`const f=files.find(q=>q.name==='ftA_1.csv'); f.removed=[viewOf(f).peaks[0].x]; f.added=[1100]; f.labels[(1100).toFixed(4)]='banda scritta a mano'; f.xr=[800,3800]; f.title='Campione uno';
      const h=files.find(q=>q.name==='ftA_2.csv'); h.sub={ref:fkey(files.find(q=>q.name==='ftT.txt')), k:0.5};`},
  ftirDeriv:{files:[['ftA_1.csv',ftirA(0)],['ftT.txt',ftirT()]], set:{smooth:{ftir:15}, deriv:{ftir:2}, base:{ftir:'none'}, conv:{ftir:'A'}}},
  ftirArpls:{files:[['ftA_1.csv',ftirA(0)],['ftT.txt',ftirT()]], set:{showArea:true, base:{ftir:'arpls'}, conv:{ftir:'orig'}}},
  raman:{files:[['ram.txt',raman()]], set:{showArea:true, spike:{raman:true}, base:{raman:'arpls'}, smooth:{raman:7}}, work:`const f=files[0]; setEcal(f,{a:2.5,b:1.001});`},
  ramanNorm:{files:[['ram.txt',raman()]], set:{conv:{raman:'norm'}, base:{raman:'linear'}, deriv:{raman:1}}},
  uv:{files:[['uv.csv',uv()],['uvev.txt',uvEV()]], set:{showArea:true, conv:{uv:'norm'}, base:{uv:'linear'}}},
  hplc:{files:[['STD1.txt',hplc(50)],['STD2.txt',hplc(100)],['STD3.txt',hplc(200)],['STD4.txt',hplc(400)],['STD5.txt',hplc(800)],['CQ.txt',hplc(300)],['BIANCO.txt',hplc(0.3)],['U1.txt',hplc(250,4.25)],['SEC.txt',hplcSec()]], set:{showArea:true, base:{hplc:'linear'}},
    work:`const c=mvCfg('hplc'); Object.assign(c,{a:3.9,b:4.5,meas:'area',model:'line',unit:'mg/L'}); mvSave(); const C={STD1:1,STD2:2,STD3:4,STD4:8,STD5:16};
      for (const f of files){ const k=f.name.replace(/\\.txt$/,''); if (C[k]!=null) anSet(f,'conc',C[k]); } anSet(files.find(f=>f.name==='CQ.txt'),'role','qc'); anSet(files.find(f=>f.name==='CQ.txt'),'conc',6); anSet(files.find(f=>f.name==='BIANCO.txt'),'role','blank');`},
  hplcW:{files:[['STD1.txt',hplc(50)],['STD2.txt',hplc(100)],['STD3.txt',hplc(200)],['STD4.txt',hplc(400)],['STD5.txt',hplc(800)],['STD6.txt',hplc(1600)],['U1.txt',hplc(250)]], set:{},
    work:`const c=mvCfg('hplc'); Object.assign(c,{a:3.9,b:4.5,meas:'height',model:'line',unit:'',weight:'1/x2'}); mvSave(); const C={STD1:1,STD2:2,STD3:4,STD4:8,STD5:16,STD6:32};
      for (const f of files){ const k=f.name.replace(/\\.txt$/,''); if (C[k]!=null) anSet(f,'conc',C[k]); }`},
  ftirTrend:{files:[['t0.csv',ftirA(0)],['t1.csv',ftirA(2)],['t2.csv',ftirA(4)],['t3.csv',ftirA(6)]], set:{},
    work:`const c=mvCfg('ftir'); Object.assign(c,{a:1650,b:1800,c:2850,d:2990,meas:'area',model:'trend',unit:'h'}); mvSave(); mvFiles('ftir',c).forEach((f,i)=>anSet(f,'conc',[0,10,20,30][i]));`},
  termiche:{files:[['tga.txt',tga()],['dsc.txt',dsc()]], set:{showArea:true, conv:{tga:'both', dsc:'flip'}}},
  epr:{files:[['epr.txt',epr()]], set:{}},
  fisisorbimento:{files:['kaomi-tabella-it.txt','isoterma.aif','asiqwin-grezzo.txt','kaomi-tabella-en.csv','co2-273K.csv'].map(n=>[n, fs.readFileSync(path.join(B.ROOT,'test','fixtures','sorption',n),'utf8')]), set:{}},
  assi:{files:[['sec.txt',hplcSec()],['inv.csv',inverted()],['ev.txt',uvEV()]], set:{showArea:true}, trasf:{'sec.txt':'div60', 'inv.csv':'swap', 'ev.txt':'inv'}},
  // seconda parte: tabelle di analisi dei moduli
  serie:{files:[['uv.csv',uv()]], set:{}, attese:[/^analisi\/mcr_als_mcr\.csv$/, /^analisi\/cinetica_globale_kin\.csv$/, /^analisi\/mcr_als_kin\.csv$/],
    work:`const SE=JSON.parse(${JSON.stringify(serieJson())}); for (const [nm, se, an] of SE){ se.x.values=Float64Array.from(se.x.values); se.data=Float64Array.from(se.data); const f=AcchChemo.makeSeriesFile(se,{name:nm, path:'serie/'+nm, instr:'uv'}); f.an=an; files.push(f); }
      const a=files.find(f=>f.name==='mcr.series'), r=a._chemo={}; r.svd=McrCore.svd(McrCore.seriesMatrix(a.series), Math.min(a.series.shape[0], a.series.shape[1], 30)); const res=AcchChemo.resultFor(a,'mcr'); r.bands={key:r.mcr.key, res:McrCore.bands(res)};
      const b=files.find(f=>f.name==='kin.series'), q=b._chemo={}, L=[]; for (const [id,o] of [['ord0',{model:'ord0'}],['ord1',{model:'ord1'}],['ord2',{model:'ord2'}],['consec',{model:'consec'}],['par2',{model:'par', nExp:2}],['par2c',{model:'par', nExp:2, offset:true}],['par3c',{model:'par', nExp:3, offset:true}]]){ try{ const k=KinCore.fit(b.series,o); k.label=id; L.push(k); }catch(e){} } q.cmp={key:b.path, res:KinCore.compare(L)};`},
  fisisorbimentoOpz:{files:['kaomi-tabella-it.txt','isoterma.aif','asiqwin-grezzo.txt','co2-273K.csv'].map(n=>[n, SORP_FX(n)]), set:{}, attese:[/^analisi\/fisisorbimento_kaomi-tabella-it\.csv$/, /^analisi\/controllo_qualita\.csv$/, /^analisi\/parametri_per_tecnica\.csv$/],
    work:`const K=SorpCore.parseKernel(${JSON.stringify(SORP_FX('kernel-utente.csv'))},'kernel-utente.csv');
      const a=files.find(f=>f.name==='kaomi-tabella-it.txt'); a.an=Object.assign({}, a.an||{}, {sorp:SorpCore.cleanOpt('sorp',{betRange:[0.05,0.3], langRange:[0.02,0.2], tModel:'halsey', tpvX:0.95, bjhBranch:'ads', bjhThick:'kjs', kernel:K, lambda:0.01, alphaRefKey:'isoterma.aif', alphaS:25})});
      const b=files.find(f=>f.name==='asiqwin-grezzo.txt'); b.an=Object.assign({}, b.an||{}, {sorp:SorpCore.cleanOpt('sorp',{over:{thick:'de-boer'}, drRange:[0.001,0.5], bjhBranch:'des'})});`},
  chemisorbimento:{files:['tpr-sintetico.txt','impulsi-co.txt','statico-h2.txt','tpd-nh3-10.txt'].map(n=>[n, SORP_FX(n)]), set:{}, attese:[/^analisi\/chemisorbimento_tpr-sintetico\.csv$/, /^analisi\/chemisorbimento_statico-h2\.csv$/, /^analisi\/controllo_qualita\.csv$/],
    work:`const O={'tpr-sintetico.txt':{factor:0.0123, mass_g:0.05, theo:40, coldTrap:true, S0:50, flow:30, frac:0.05}, 'impulsi-co.txt':{nSat:2, tol:0.001, loopVol:0.5, loopT:300, p:100, frac:0.1, mass_g:0.2, disp:{loading:2, SF:2, shape:5, metal:'Pd'}}, 'statico-h2.txt':{pa:10, pb:45, disp:{loading:0.5, SF:1, M:190, rho:21, am:0.081}}};
      for (const f of files) if (O[f.name]) f.an=Object.assign({}, f.an||{}, {chem:SorpCore.cleanOpt('chem', O[f.name])});`},
  deconvoluzione:{files:[['ftA_1.csv',ftirA(0)],['ftA_2.csv',ftirA(15)],['ftA_3.csv',ftirA(8)]], set:{showArea:true, base:{ftir:'rubber'}}, attese:[/^analisi\/deconvoluzione\.csv$/],
    work:`$('#fitA').value='1650'; $('#fitB').value='1800'; $('#fitProf').value='pv'; $('#fitBase').value='lin'; $('#fitMode').value='auto'; cur=0; await runFitUI(); renderFitOut(files[0]); await $('#fitAllSp').onclick();
      cur=2; $('#fitMode').value='fixed'; $('#fitProf').value='gauss'; $('#fitA').value=''; $('#fitB').value=''; await runFitUI();`},
  chemometria:{files:MIX.map((w,j)=>['ram_'+(j+1)+'.txt', ramanMix(w)]).concat([1,2,3,4,5,6,7,null].map((c,j)=>['uv_'+(j+1)+'.txt', uvPls(c==null?3.5:c)])), set:{}, attese:[/^analisi\/pca_raman\.csv$/, /^analisi\/pls_uv\.csv$/, /^analisi\/miscele_percentuali_in_peso\.csv$/],
    work:`const R=files.filter(f=>f.instr==='raman'), U=files.filter(f=>f.instr==='uv');
      const c=mvCfg('raman'); Object.assign(c,{pre:'snv', scale:'mean', zone:'all', k:'auto'}); runPCA('raman');
      const u=mvCfg('uv'); Object.assign(u,{model:'pls', pre:'none', scale:'mean', zone:'all'}); U.forEach((f,i)=>{ if (i<7) anSet(f,'conc',i+1); }); mvSave(); MVpls.uv=plsRun('uv');
      const xr=Float64Array.from({length:851},(_,i)=>150+2*i), comp=${JSON.stringify(COMP)}, pv=(x,c,w,eta)=>{ const t=(x-c)/w; return eta*2/(Math.PI*w)/(1+4*t*t)+(1-eta)*2*Math.sqrt(Math.LN2/Math.PI)/w*Math.exp(-4*Math.LN2*t*t); };
      comp.forEach((cc,k)=>{ const v=refVector(xr, Float64Array.from(xr, x=>cc.reduce((s,[c,w])=>s+1000*pv(x,c,w,0.5),0)), 'I'); REFS.push({id:'r'+'ABC'[k], n:'Componente '+'ABC'[k], i:'raman', k:'I', x:v.x, y:v.y}); });
      const W=${JSON.stringify(MIX)}; R.slice(0,4).forEach((f,j)=>anSet(f,'mixW',{rA:W[j][0], rB:W[j][1], rC:W[j][2]}));`},
  xrf:{files:XRF.map((c,j)=>['bronzo_'+(j+1)+'.mca', XR.spectrum({Cu:c[0], Sn:c[1], As:c[2]}, 3000, 20+j)]), set:{showArea:true}, attese:[/^analisi\/composizione_xrf\.csv$/, /^analisi\/controllo_qualita\.csv$/],
    work:`const c=mvCfg('xrf'); Object.assign(c,{qEls:['Cu','Sn','As'], qModel:'auto'}); mvSave(); const C=${JSON.stringify(XRF)};
      files.filter(f=>f.instr==='xrf').forEach((f,j)=>{ if (j<4) anSet(f,'std',{Cu:C[j][0]*100, Sn:C[j][1]*100, As:C[j][2]*100}); });`},
  canali:{files:[['DAD1A.ch', Array.from(fs.readFileSync(path.join(B.ROOT,'test','fixtures','canali','STD1.D','DAD1A.ch'))), 'STD1.D/DAD1A.ch'], ['DAD1B.ch', Array.from(fs.readFileSync(path.join(B.ROOT,'test','fixtures','canali','STD1.D','DAD1B.ch'))), 'STD1.D/DAD1B.ch'],
      ['waters-2canali.arw', fs.readFileSync(path.join(B.ROOT,'test','fixtures','canali','waters-2canali.arw'),'utf8')], ['shimadzu-2canali.txt', fs.readFileSync(path.join(B.ROOT,'test','fixtures','canali','shimadzu-2canali.txt'),'utf8')],
      ['DAD1.uv', Array.from(G.writeUv({sample:'UV1', times:Array.from({length:120},(_,i)=>i*0.05), spectra:Array.from({length:120},(_,i)=>Array.from({length:101},(_,j)=>Math.exp(-(((j-40)/12)**2))*(1+Math.exp(-(((i*0.05-3)/0.3)**2)))*50+(i%7)*0.01)), a:200, b:400, s:2}))]],
    set:{showArea:true}, byte:['DAD1A.ch','DAD1B.ch','waters-2canali.arw','shimadzu-2canali.txt','DAD1.uv']},
};

let server, br;
before(async ()=>{ server=await B.startServer(); br=await B.launch(); });
after(async ()=>{ await br.close(); server.close(); fs.rmSync(TMP,{recursive:true,force:true}); });

// progetto nella pagina → file esportati dall'app (picchi, dati elaborati, analisi, script)
async function exportIn(p, files, set, work, lang){
  return p.evaluate(async ([L, NONE, set, work, lang])=>{
    if (lang){ S.lang=lang; LANG=lang; }
    const iv=setInterval(()=>{ const d=document.querySelector('#dlgChan'); if (d && d.open) d.querySelector('#chOk').click(); }, 20);   // «Canali trovati»: canali proposti
    try{ await addEntries(L.map(([n,t,p])=>({file:new File([typeof t==='string'?t:new Uint8Array(t)],n), path:p||n}))); } finally { clearInterval(iv); } document.querySelectorAll('dialog[open]').forEach(d=>d.close());
    Object.assign(S, NONE); for (const [k,v] of Object.entries(set||{})){ if (v && typeof v==='object' && !Array.isArray(v)) Object.assign(S[k], v); else S[k]=v; } saveS(); resetCaches();
    if (work) await (new Function('return (async()=>{'+work+'\n})()'))();
    resetCaches(); EXP_SCOPE='all';
    const E=await exportEntries({peaks:true, data:true, analysis:true, py:true}, false); EXP_SCOPE=null;
    return E.map(e=>[e.key, e.path, typeof e.data==='string' ? e.data : Array.from(e.data instanceof Uint8Array ? e.data : new Uint8Array())]); }, [files, NONE, set, work||'', lang||null]);
}
function writeOut(dir, E){ fs.rmSync(dir,{recursive:true,force:true}); for (const [,p,d] of E){ const f=path.join(dir,p); fs.mkdirSync(path.dirname(f),{recursive:true}); fs.writeFileSync(f, typeof d==='string'?d:Buffer.from(d)); } }
const recipeOf=dir=>{ const t=fs.readFileSync(path.join(pyDir(dir),'ricetta.py'),'utf8'), m=/RICETTA = json\.loads\(r'''\n([\s\S]*?)\n'''\)/.exec(t); return JSON.parse(m[1]); };
const pyDir=dir=>["ricetta_python","python_recipe"].map(d=>path.join(dir,d)).find(d=>fs.existsSync(d))||path.join(dir,'ricetta_python');
function runPy(dir, args){ const r=spawnSync(PY, ['-I', path.join(pyDir(dir),'ricetta.py')].concat(args||[]), {encoding:'utf8', timeout:15*60*1000}); return {code:r.status, out:(r.stdout||'')+(r.stderr||'')}; }
// confronto cella per cella: testo uguale, numeri entro 1e-9 relativo; LRE minimo
function compareCsv(a, b, dec, name){
  const L1=a.replace(/^\uFEFF/,'').split('\r\n'), L2=b.replace(/^\uFEFF/,'').split('\r\n'); assert.strictEqual(L2.length, L1.length, name+': righe '+L2.length+' invece di '+L1.length);
  const num=s=>{ const t=dec===','?s.replace(',','.'):s; return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t) ? Number(t) : null; };
  let lre=15, n=0;
  for (let i=0;i<L1.length;i++){ if (L1[i]===L2[i]){ const c=L1[i].split(/[;,]/).filter(x=>num(x)!=null).length; n+=c; continue; }
    const sep=dec===','?';':',', c1=L1[i].split(sep), c2=L2[i].split(sep); assert.strictEqual(c2.length, c1.length, `${name} riga ${i+1}: ${L2[i]} | ${L1[i]}`);
    for (let k=0;k<c1.length;k++){ if (c1[k]===c2[k]){ if (num(c1[k])!=null) n++; continue; } const x=num(c1[k]), y=num(c2[k]); assert.ok(x!=null && y!=null, `${name} riga ${i+1} colonna ${k+1}: «${c2[k]}» invece di «${c1[k]}»`);
      const rel=Math.abs(x-y)/Math.max(Math.abs(x), 1e-300); assert.ok(rel<=1e-9, `${name} riga ${i+1} colonna ${k+1}: ${y} invece di ${x} (relativo ${rel})`); n++; lre=Math.min(lre, rel>0 ? -Math.log10(rel) : 15); } }
  return {lre, n};
}
const TEXTUAL=/^(analisi|analysis)\/(ipotesi_qualitative|qualitative_hypotheses|metodi_e_bibliografia|methods_and_references)\./;
function checkCase(name, E, dec){
  const dir=path.join(TMP, name); writeOut(dir, E);
  const py=E.filter(e=>e[0]==='py').map(e=>e[1]); assert.ok(py.some(p=>/ricetta\.py$/.test(p)), name+': manca ricetta.py');
  const r=runPy(dir); assert.ok(r.code===0 || r.code===3, name+': esito '+r.code+'\n'+r.out); assert.match(r.out, /verifica: identico|check: identical/, name+'\n'+r.out);
  const ric=recipeOf(dir), att=ric.attesi||{}, nt=ric.nonTrascritte||[];
  // ogni tabella di analisi dell'app è rifatta dallo script (nei risultati attesi) oppure dichiarata non trascritta; i testi (ipotesi, metodi) a parte
  for (const [k,p] of E.filter(e=>e[0]==='analysis').map(e=>[e[0],e[1]])){ if (TEXTUAL.test(p) || p in att) continue; const nm=p.replace(/^[^/]*\//,''); assert.ok(nt.some(x=>x===nm || x.startsWith(nm+' ')), name+': tabella né rifatta né dichiarata: '+p); }
  const want=E.filter(e=>e[0]==='peaks' || e[0]==='data' || (e[0]==='analysis' && e[1] in att));
  let lre=15, n=0;
  for (const [,p,d] of want){ const got=path.join(pyDir(dir),'risultati',p); assert.ok(fs.existsSync(got), name+': lo script non ha scritto '+p); const c=compareCsv(d, fs.readFileSync(got,'utf8'), dec, name+'/'+p); lre=Math.min(lre,c.lre); n+=c.n; }
  LRE_MIN.push([name, lre, n, want.length]); return {dir, out:r.out, code:r.code, ric, want:want.map(e=>e[1])};
}

describe('R15 · ricetta Python: stessi CSV dell\'app', {timeout:40*60*1000}, ()=>{
  it('python3 ≥ 3.10 disponibile (altrimenti i confronti R15 si saltano: da eseguire dove c\'è Python)', ()=>{ if (!PY) console.log('# python3 ≥ 3.10 non trovato: confronti R15 SALTATI'); assert.ok(true); });
  for (const [name, P] of Object.entries(PROJECTS)) it('progetto sintetico «'+name+'»: CSV identici entro 1e-9', {skip:!PY}, async ()=>{
    const o=await B.openPage(br, server); const E=await exportIn(o.p, P.files, P.set, P.work); assert.deepStrictEqual(o.errors, []); await o.ctx.close();
    const r=checkCase(name, E, ','), ric=recipeOf(r.dir);
    if (P.trasf) for (const [n,op] of Object.entries(P.trasf)){ const sp=ric.spettri.find(q=>q.nome===n); assert.strictEqual(sp.lettura.modo, 'testo', n); assert.ok(sp.lettura.trasf.some(o=>o.op===op), n+': '+JSON.stringify(sp.lettura.trasf)); }
    if (name==='ftir'){ const a=ric.spettri.find(q=>q.nome==='ftA_1.csv'), b=ric.spettri.find(q=>q.nome==='ftA_2.csv'); assert.ok(a.picchi.tolti.length===1 && a.picchi.aggiunti.length===1 && a.elab.xr, 'lavoro manuale nella ricetta'); assert.ok(b.elab.sub_rif!=null, 'spettro differenza'); }
    if (name==='raman') assert.ok(ric.spettri[0].ecal && ric.spettri[0].elab.spike, 'asse corretto e raggi cosmici');
    for (const re of P.attese||[]) assert.ok(r.want.some(p=>re.test(p)), name+': la tabella '+re+' non è fra quelle rifatte e confrontate: '+r.want.join(', '));
    for (const n of P.byte||[]){ const sp=ric.spettri.filter(q=>q.nome===n); assert.ok(sp.length, n+' nella ricetta'); for (const q of sp) assert.strictEqual(q.lettura.modo, 'byte', n+': '+q.lettura.modo); }
    if (P.byte) assert.ok(ric.spettri.filter(q=>q.lettura.canale).length>=6, 'canali letti dai byte: '+ric.spettri.map(q=>q.nome+' '+q.lettura.modo).join(', '));
    if (name==='serie'){ const se=ric.analisi.serie; assert.ok(se.some(q=>q.mcr_bands) && se.some(q=>q.kin_cmp) && se.some(q=>q.mcr_svd_visto), 'stato a schermo: MCR-BANDS, confronto, valori singolari'); }
    if (name==='deconvoluzione') assert.ok(ric.analisi.chemometria.deconvoluzione.some(d=>d.fit.copiaDa), 'fit copiato da un altro spettro');
  });
  it('lingua inglese (separatore «,» e punto decimale)', {skip:!PY}, async ()=>{
    const o=await B.openPage(br, server, {lang:'en'}); const P=PROJECTS.hplc; const E=await exportIn(o.p, P.files, P.set, P.work, 'en'); assert.deepStrictEqual(o.errors, []); await o.ctx.close();
    const r=checkCase('hplc_en', E, '.'); assert.match(r.out, /check: identical/);
  });
  for (const pass of ['predefinite','elaborate']) it('corpus test/corpus ('+pass+'): CSV identici entro 1e-9, lettura dal file o dal CSV dei dati letti', {skip:!PY}, async ()=>{
    const all=[]; for (const d of ['c','generale','hplc','nmr','xrf']) for (const n of fs.readdirSync(path.join(B.ROOT,'test','corpus',d)).sort()) if (!/\.js$/.test(n)) all.push([d+'_'+n, Array.from(fs.readFileSync(path.join(B.ROOT,'test','corpus',d,n)))]);
    const set=pass==='elaborate' ? {showArea:true, smooth:{ftir:9, raman:7, uv:9, hplc:7, gen:5}, base:{ftir:'rubber', raman:'arpls', uv:'linear', hplc:'linear', xrf:'snip', fluo:'rubber'}, deriv:{nmr:1}, conv:{ftir:'A', fluo:'norm', dsc:'flip', tga:'dtg'}, spike:{raman:true, gen:true}} : {};
    const o=await B.openPage(br, server); const E=await exportIn(o.p, all, set); assert.deepStrictEqual(o.errors, []); await o.ctx.close();
    const r=checkCase('corpus_'+pass, E, ','); const ric=fs.readFileSync(path.join(TMP,'corpus_'+pass,'ricetta_python','ricetta.py'),'utf8');
    const modi=(ric.match(/"modo": "(testo|csv)"/g)||[]).reduce((m,s)=>{ const k=/testo/.test(s)?'testo':'csv'; m[k]=(m[k]||0)+1; return m; }, {});
    console.log(`# corpus ${pass}: ${E.filter(e=>e[0]==='data').length} spettri, lettura dal file di testo ${modi.testo||0}, dal CSV dei dati letti ${modi.csv||0}`);
    assert.ok((modi.testo||0)>=40, 'troppo pochi file riletti dal testo: '+JSON.stringify(modi));
  });
  it('copia sabotata (un coefficiente di Savitzky–Golay): lo script dice DIVERSO ed esce con 1', {skip:!PY}, async ()=>{
    const dir=path.join(TMP,'ftir'), f=path.join(dir,'ricetta_python','ricetta.py'), src=fs.readFileSync(f,'utf8'), bad=src.replace("c = [float(3 * (3 * m * m + 3 * m - 1 - 5 * i * i)) / den for i in range(-m, m + 1)]", "c = [float(3 * (3 * m * m + 3 * m - 1 - 5 * i * i)) / den * (1.001 if i == 0 else 1) for i in range(-m, m + 1)]");
    assert.notStrictEqual(bad, src, 'riga del coefficiente non trovata'); fs.writeFileSync(f, bad);
    try{ fs.rmSync(path.join(dir,'ricetta_python','risultati'),{recursive:true,force:true}); const r=runPy(dir); assert.strictEqual(r.code, 1, r.out); assert.match(r.out, /DIVERSO/); } finally { fs.writeFileSync(f, src); }
  });
  it('file originale cambiato: errore chiaro, nessun numero', {skip:!PY}, async ()=>{
    const dir=path.join(TMP,'uv'), f=fs.readdirSync(path.join(dir,'ricetta_python','dati')).find(n=>n==='uv.csv'), p=path.join(dir,'ricetta_python','dati',f), b=fs.readFileSync(p);
    fs.writeFileSync(p, Buffer.concat([b, Buffer.from('\n')]));
    try{ const r=runPy(dir); assert.strictEqual(r.code, 2, r.out); assert.match(r.out, /non è quello del progetto/); } finally { fs.writeFileSync(p, b); }
  });
  it('file nuovi con --file (lettore completo): testo e .ch di Agilent, impostazioni per tecnica applicate, CSV scritti solo nella cartella di uscita', {skip:!PY}, async ()=>{
    const dir=path.join(TMP,'ftir'), nuovo=path.join(TMP,'nuovo.csv'), out=path.join(TMP,'uscita_nuovi'); fs.writeFileSync(nuovo, ftirA(30));
    const r=runPy(dir, ['--file', nuovo, '--tecnica', 'ftir', '--uscita', out]); assert.strictEqual(r.code, 0, r.out);
    const w=[]; (function walk(d){ for (const n of fs.readdirSync(d)){ const q=path.join(d,n); if (fs.statSync(q).isDirectory()) walk(q); else w.push(path.relative(out,q)); } })(out);
    assert.deepStrictEqual(w.sort(), ['dati_elaborati/nuovo.csv', 'elenco_picchi.csv']); assert.match(fs.readFileSync(path.join(out,'elenco_picchi.csv'),'utf8'), /nuovo\.csv;nuovo\.csv;FTIR/);
    const ch=path.join(B.ROOT,'test','fixtures','canali','STD2.D','DAD1A.ch'), out2=path.join(TMP,'uscita_ch'), r2=runPy(path.join(TMP,'hplc'), ['--file', ch, '--tecnica', 'hplc', '--uscita', out2]);
    assert.strictEqual(r2.code, 0, r2.out); assert.ok(fs.existsSync(path.join(out2,'dati_elaborati','DAD1A.csv')), r2.out); assert.match(fs.readFileSync(path.join(out2,'elenco_picchi.csv'),'utf8'), /DAD1A\.ch;DAD1A\.ch;HPLC/);
    assert.ok(!/read_simple_text/.test(fs.readFileSync(path.join(pyDir(dir),'ricetta.py'),'utf8')), 'niente lettore semplificato');
  });
  it('tabella non rifatta in modo identico (fit salvato con altri picchi): dichiarata nello script, esito 3 con errore esplicito, il resto identico', {skip:!PY}, async ()=>{
    const o=await B.openPage(br, server); const E=await exportIn(o.p, PROJECTS.ftir.files, {}, `$('#fitA').value='1650'; $('#fitB').value='1800'; $('#fitMode').value='auto'; cur=0; await runFitUI(); files[0].added=[1700.5]; resetCaches();`);
    const an=JSON.parse(await o.p.evaluate(()=>JSON.stringify(analysisFiles().map(([n])=>n)))); await o.ctx.close();
    assert.ok(an.includes('deconvoluzione.csv'), 'l\'app scrive la deconvoluzione');
    const dir=path.join(TMP,'nontr'); writeOut(dir, E); const ric=recipeOf(dir), list=ric.nonTrascritte;
    assert.ok(list.some(x=>/^deconvoluzione\.csv \(il fit salvato di «ftA_1\.csv»/.test(x)), JSON.stringify(list)); assert.ok(!('analisi/deconvoluzione.csv' in ric.attesi));
    for (const n of an) if (!/^(ipotesi_qualitative|metodi_e_bibliografia)/.test(n)) assert.ok(('analisi/'+n) in ric.attesi || list.some(x=>x.startsWith(n)), 'né rifatta né dichiarata: '+n);
    const r=runPy(dir); assert.strictEqual(r.code, 3, r.out); assert.match(r.out, /ERRORE, non trascritta in modo identico: deconvoluzione\.csv/); assert.match(r.out, /verifica: identico/);
  });
  it('libreria HPLC: concentrazioni dalla taratura salvata, senza controllo del giorno e con un controllo; lo script rifà concentrazioni_da_libreria.csv', {skip:!PY}, async ()=>{
    const BOZZA=path.join(B.ROOT,'examples','librerie','saliva-hplc-dad220.bozza.json'), LIBNAME='Agilent 1260 Infinity · DAD — saliva';
    const TRUE={Creatinine:[3.561, 9876, 0.0227], 'Uric acid':[5.358, 12773, 0.15], Tyrosine:[7.476, 16717, 0.05]};
    const sal=o=>D4.chrom(Object.assign({sample:'SAL_03', method:'C:\\Chem32\\1\\METHODS\\ICCOM-SAL-RP220.M', peaks:Object.values(TRUE).map(([t,b,c])=>({t, area:b*c}))}, o||{}));
    const o=await B.openPage(br, server);
    await o.p.evaluate(()=>AcchLibUi.openManager()); await o.p.waitForSelector('#lmImport'); await o.p.setInputFiles('#lmFile', BOZZA);
    await o.p.waitForFunction(n=>AcchLibUi.items.some(it=>it.lib && it.lib.name===n), LIBNAME); await o.p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
    const load=async (name, text)=>{ await o.p.evaluate(async ([n,t])=>{ await addEntries([{file:new File([t],n), path:n}]); await new Promise(r=>setTimeout(r,250)); }, [name, text]);
      await o.p.fill('#lpSt', 'saliva'); await o.p.dispatchEvent('#lpSt', 'input'); await o.p.click('#lpOk');
      await o.p.waitForFunction(n=>{ const f=files.find(g=>g.name===n); return f && f.an && f.an.lib && f.an.lib.insOk; }, name); };
    await load('SAL_03.csv', sal()); await load('SAL_04.csv', sal({sample:'SAL_04', seed:9}));
    const run=async (tag, work)=>{ const E=await exportIn(o.p, [], {showArea:true}, work); const r=checkCase('libreria_'+tag, E, ','); const t=E.find(e=>/concentrazioni_da_libreria\.csv$/.test(e[1])); assert.ok(t && r.want.includes(t[1]), tag+': tabella della libreria rifatta'); return t[2]; };
    const t1=await run('senza_controllo', ''); assert.match(t1, /senza controllo del giorno/);
    await load('SAL_QC.csv', sal({sample:'SAL_QC', seed:11}));
    const t2=await run('controllo', `const f=files.find(g=>g.name==='SAL_QC.csv'), L=AcchLibUi.items.find(x=>x.lib && x.lib.name===${JSON.stringify(LIBNAME)}).lib, T=${JSON.stringify(TRUE)}, c={};
      for (const e of L.entries) if (T[e.name]) c[e.id]=T[e.name][2]; anSet(f,'role','qc'); anSet(f,'libCtrl',c); files.forEach(g=>g._libRes=null);`);
    assert.notStrictEqual(t2, t1); assert.deepStrictEqual(o.errors, []); await o.ctx.close();
  });
  it('intestazione: licenza GPL-3.0-or-later e titolare, versione, data, impronte dei file; niente rete, niente scrittura fuori dalla cartella di uscita', async ()=>{
    const src=fs.readFileSync(path.join(TMP,'ftir','ricetta_python','ricetta.py'),'utf8'), head=src.split('RICETTA =')[0];
    assert.match(head, /SPDX-License-Identifier: GPL-3\.0-or-later/); assert.match(head, /Copyright \(C\) 2026 Lorenzo Birindelli/); assert.match(head, /either version 3 of the\n# License, or \(at your option\) any later version/);
    assert.match(head, /Acchiappaspettri 3\.\d+\.\d+[^,]*, il \d{4}-\d{2}-\d{2}/); assert.match(head, /Python >= 3\.10/); assert.match(head, /numpy \(>= 1\.26\) e scipy \(>= 1\.11\) non servono/);
    assert.match(head, /ftA_1\.csv  [0-9a-f]{64}  \(rilettura del file di testo\)/);
    assert.ok(!/^\s*(import|from)\s+(socket|urllib|http|requests|subprocess|ftplib|smtplib|ssl|asyncio)\b/m.test(src), 'moduli di rete o processi');
    const opens=src.match(/open\([^)]*\)/g)||[]; assert.ok(opens.every(s=>/'rb'|'r'|\(p, 'wb'\)/.test(s)), 'open() inattese: '+opens.join(' | '));
    if (PY){ const r=spawnSync(PY, ['-I','-c', src.split("\n\nif __name__ ==")[0]+"\nimport tempfile\nd=tempfile.mkdtemp()\nU=Uscita(d)\ntry:\n    U.write('../fuori.csv','x')\n    print('SCRITTO')\nexcept PermissionError as e:\n    print('RIFIUTATO')\n"], {encoding:'utf8'}); assert.match(r.stdout, /RIFIUTATO/, r.stdout+r.stderr); }
  });
  it('voce nella finestra Esporta (online e desktop): scheda, nome della cartella, riepilogo, file scritti; testi del desktop senza emoji', async ()=>{
    for (const desk of [false, true]){ const o=desk ? await openDesk(B, br, server) : await B.openPage(br, server);
      if (desk) await o.p.waitForFunction(()=>window.__mock && window.__mock.menu);
      const r=await o.p.evaluate(async ([L, NONE, desk])=>{ await addEntries(L.map(([n,t])=>({file:new File([t],n), path:n}))); document.querySelectorAll('dialog[open]').forEach(d=>d.close()); Object.assign(S, NONE, {outPy:true, expScope:'all'}); saveS(); syncControls(); go(3); renderSummary(); await new Promise(r=>setTimeout(r,100));
        const card=document.querySelector('[data-out="outPy"]'), sum=$('#sumList').textContent, nm=$('[data-nm="py"]').value;
        let disk=[]; if (desk){ window.__mock.pick.pick_export_dir={path:'/out/r', name:'r'}; await runExport(); disk=Object.keys(window.__mock.disk).sort(); }
        return {card:!!card, title:card&&card.querySelector('b').textContent, txt:card&&card.innerText, sum, nm, disk, def:DEFAULTS.outPy}; }, [PROJECTS.uv.files, NONE, desk]);
      assert.deepStrictEqual(o.errors, []); await o.ctx.close();
      assert.ok(r.card, 'scheda della voce'); assert.strictEqual(r.def, false, 'spenta di default');
      assert.strictEqual(r.nm, 'ricetta_python'); assert.match(r.sum, /Script Python della ricetta/);
      if (desk){ assert.ok(r.disk.includes('/out/r/ricetta_python/ricetta.py') && r.disk.some(k=>/\/ricetta_python\/dati\/uv\.csv$/.test(k)), r.disk.join(', ')); assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(r.title+r.sum), 'emoji nel desktop: '+r.sum); }
    }
  });
  for (const name of ['serie','chemisorbimento','xrf']) it('lingua inglese, tabelle di analisi: «'+name+'»', {skip:!PY}, async ()=>{
    const o=await B.openPage(br, server, {lang:'en'}); const P=PROJECTS[name]; const E=await exportIn(o.p, P.files, P.set, P.work, 'en'); assert.deepStrictEqual(o.errors, []); await o.ctx.close();
    const r=checkCase(name+'_en', E, '.'); assert.match(r.out, /check: identical/); assert.ok(r.want.some(p=>/^analysis\//.test(p)), 'tabelle di analisi in inglese: '+r.want.join(', '));
    assert.ok(!/ERRORE|verifica/.test(r.out), 'messaggi dello script in inglese: '+r.out);
  });
  it('anteprima commentata nella finestra Esporta: letture, tabelle rifatte, non trascritte, intestazione', async ()=>{
    const o=await B.openPage(br, server); const P=PROJECTS.chemisorbimento;
    const t=await o.p.evaluate(async ([L, NONE, work])=>{ await addEntries(L.map(([n,t])=>({file:new File([t],n), path:n}))); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
      Object.assign(S, NONE, {outPy:true, expScope:'all'}); saveS(); await (new Function('return (async()=>{'+work+'\n})()'))(); resetCaches(); syncControls(); go(3); renderSummary();
      const d=$('#pyPrev'); d.open=true; d.dispatchEvent(new Event('toggle')); for (let i=0;i<200 && !/Intestazione/.test($('#pyPrevBody').textContent);i++) await new Promise(r=>setTimeout(r,50));
      return $('#pyPrevBody').innerText; }, [P.files, NONE, P.work]);
    assert.deepStrictEqual(o.errors, []); await o.ctx.close();
    assert.match(t, /Che cosa legge e che cosa rifà/); assert.match(t, /tpr-sintetico\.txt/); assert.match(t, /letto dal CSV dei dati letti|riletto dal file di testo|letto dal file originale/);
    assert.match(t, /Tabelle di analisi rifatte/); assert.match(t, /chemisorbimento_tpr-sintetico\.csv/); assert.match(t, /controllo_qualita\.csv/); assert.match(t, /Intestazione dello script/); assert.match(t, /SPDX-License-Identifier: GPL-3\.0-or-later/);
  });
  it('LRE dichiarato', ()=>{ for (const [n,l,c,f] of LRE_MIN) console.log(`# LRE minimo ${n}: ${l.toFixed(1)} su ${c} numeri in ${f} CSV`); assert.ok(!PY || LRE_MIN.length>=15, 'casi confrontati: '+LRE_MIN.length); assert.ok(LRE_MIN.every(x=>x[1]>=9)); });
});
