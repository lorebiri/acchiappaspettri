// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// R15, tappa I12: la ricetta esportata come script Python rifà gli stessi CSV dell'app (elenco dei picchi, dati elaborati, misure di banda e tarature).
// Per progetti SINTETICI e per il corpus test/corpus: ogni numero del CSV scritto dallo script coincide con quello dell'app entro 1e-9 relativo;
// si dichiara il LRE minimo (−log10 dell'errore relativo, 15 se identico). Lo script deve dire «verifica: identico».
// Una copia sabotata (un coefficiente di Savitzky–Golay) deve dare «DIVERSO» con esito 1. Voce nella finestra Esporta, online e desktop.
// Uso: PW_CHANNEL=chrome node --test test/validation/i12-ricetta-python-ui.test.js   (serve python3 ≥ 3.10; senza, i confronti si saltano e lo si dice)
'use strict';
const {describe, it, before, after}=require('node:test'), assert=require('node:assert'), path=require('path'), fs=require('fs'), os=require('os'), {spawnSync}=require('child_process');
const B=require('./browser.js'), {openDesk}=require('./tauri-mock.js');

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
};

let server, br;
before(async ()=>{ server=await B.startServer(); br=await B.launch(); });
after(async ()=>{ await br.close(); server.close(); fs.rmSync(TMP,{recursive:true,force:true}); });

// progetto nella pagina → file esportati dall'app (picchi, dati elaborati, analisi, script)
async function exportIn(p, files, set, work, lang){
  return p.evaluate(async ([L, NONE, set, work, lang])=>{
    if (lang){ S.lang=lang; LANG=lang; }
    await addEntries(L.map(([n,t])=>({file:new File([typeof t==='string'?t:new Uint8Array(t)],n), path:n}))); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
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
function checkCase(name, E, dec){
  const dir=path.join(TMP, name); writeOut(dir, E);
  const py=E.filter(e=>e[0]==='py').map(e=>e[1]); assert.ok(py.some(p=>/ricetta\.py$/.test(p)), name+': manca ricetta.py');
  const r=runPy(dir); assert.ok(r.code===0 || r.code===3, name+': esito '+r.code+'\n'+r.out); assert.match(r.out, /verifica: identico|check: identical/, name+'\n'+r.out);
  const want=E.filter(e=>e[0]==='peaks' || e[0]==='data' || (e[0]==='analysis' && /(misure_bande|band_measurements)_/.test(e[1])));
  let lre=15, n=0;
  for (const [,p,d] of want){ const got=path.join(pyDir(dir),'risultati',p); assert.ok(fs.existsSync(got), name+': lo script non ha scritto '+p); const c=compareCsv(d, fs.readFileSync(got,'utf8'), dec, name+'/'+p); lre=Math.min(lre,c.lre); n+=c.n; }
  for (const [,p,d] of E.filter(e=>e[0]==='analysis' && /^(analisi|analysis)\/(fisisorbimento|physisorption)_/.test(e[1]))){
    const Ls=d.split('\r\n'), b=Ls.indexOf(''), sub=[Ls[0]].concat(Ls.slice(1,b).filter(l=>/^(BET|BJH|DH)[;,]/.test(l)), Ls.slice(b)).join('\r\n');
    const got=path.join(pyDir(dir),'risultati',p.replace(/\.csv$/,'.bet_bjh.csv')); assert.ok(fs.existsSync(got), name+': lo script non ha scritto '+got);
    assert.ok(/^\uFEFF?[^\r]*\r\nBET[;,]/.test(sub) || !/\r\nBET[;,]/.test(d), name+': righe BET'); const c=compareCsv(sub, fs.readFileSync(got,'utf8'), dec, name+'/'+p+' (BET, BJH, DH)'); lre=Math.min(lre,c.lre); n+=c.n; }
  LRE_MIN.push([name, lre, n, want.length]); return {dir, out:r.out, code:r.code};
}

describe('R15 · ricetta Python: stessi CSV dell\'app', {timeout:40*60*1000}, ()=>{
  it('python3 ≥ 3.10 disponibile (altrimenti i confronti R15 si saltano: da eseguire dove c\'è Python)', ()=>{ if (!PY) console.log('# python3 ≥ 3.10 non trovato: confronti R15 SALTATI'); assert.ok(true); });
  for (const [name, P] of Object.entries(PROJECTS)) it('progetto sintetico «'+name+'»: CSV identici entro 1e-9', {skip:!PY}, async ()=>{
    const o=await B.openPage(br, server); const E=await exportIn(o.p, P.files, P.set, P.work); assert.deepStrictEqual(o.errors, []); await o.ctx.close();
    const r=checkCase(name, E, ','), ric=recipeOf(r.dir);
    if (P.trasf) for (const [n,op] of Object.entries(P.trasf)){ const sp=ric.spettri.find(q=>q.nome===n); assert.strictEqual(sp.lettura.modo, 'testo', n); assert.ok(sp.lettura.trasf.some(o=>o.op===op), n+': '+JSON.stringify(sp.lettura.trasf)); }
    if (name==='ftir'){ const a=ric.spettri.find(q=>q.nome==='ftA_1.csv'), b=ric.spettri.find(q=>q.nome==='ftA_2.csv'); assert.ok(a.picchi.tolti.length===1 && a.picchi.aggiunti.length===1 && a.elab.xr, 'lavoro manuale nella ricetta'); assert.ok(b.elab.sub_rif!=null, 'spettro differenza'); }
    if (name==='raman') assert.ok(ric.spettri[0].ecal && ric.spettri[0].elab.spike, 'asse corretto e raggi cosmici');
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
  it('file nuovi con --file: impostazioni per tecnica applicate, CSV scritti solo nella cartella di uscita', {skip:!PY}, async ()=>{
    const dir=path.join(TMP,'ftir'), nuovo=path.join(TMP,'nuovo.csv'), out=path.join(TMP,'uscita_nuovi'); fs.writeFileSync(nuovo, ftirA(30));
    const r=runPy(dir, ['--file', nuovo, '--tecnica', 'ftir', '--uscita', out]); assert.strictEqual(r.code, 0, r.out);
    const w=[]; (function walk(d){ for (const n of fs.readdirSync(d)){ const q=path.join(d,n); if (fs.statSync(q).isDirectory()) walk(q); else w.push(path.relative(out,q)); } })(out);
    assert.deepStrictEqual(w.sort(), ['dati_elaborati/nuovo.csv', 'elenco_picchi.csv']); assert.match(fs.readFileSync(path.join(out,'elenco_picchi.csv'),'utf8'), /nuovo\.csv;nuovo\.csv;FTIR/);
  });
  it('tabelle non trascritte (fisisorbimento, MCR-ALS, cinetiche, deconvoluzione…): dichiarate nello script, esito 3 con errore esplicito', {skip:!PY}, async ()=>{
    const o=await B.openPage(br, server); const E=await exportIn(o.p, PROJECTS.ftir.files, {}, `cur=0; await runFitUI();`);
    const iso=JSON.parse(await o.p.evaluate(()=>JSON.stringify(analysisFiles().map(([n])=>n)))); await o.ctx.close();
    const dir=path.join(TMP,'nontr'); writeOut(dir, E); const src=fs.readFileSync(path.join(dir,'ricetta_python','ricetta.py'),'utf8');
    const nt=/"nonTrascritte": \[([^\]]*)\]/.exec(src); assert.ok(nt, 'campo nonTrascritte'); const list=JSON.parse('['+nt[1]+']');
    for (const n of iso) if (!/^(misure_bande|controllo_qualita|ipotesi_qualitative|metodi_e_bibliografia)/.test(n)) assert.ok(list.includes(n), 'non dichiarata: '+n);
    const r=runPy(dir); if (list.length){ assert.strictEqual(r.code, 3, r.out); assert.match(r.out, /ERRORE, non trascritta in modo identico/); } else assert.strictEqual(r.code, 0, r.out);
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
  it('LRE dichiarato', ()=>{ for (const [n,l,c,f] of LRE_MIN) console.log(`# LRE minimo ${n}: ${l.toFixed(1)} su ${c} numeri in ${f} CSV`); assert.ok(!PY || LRE_MIN.length>=15, 'casi confrontati: '+LRE_MIN.length); assert.ok(LRE_MIN.every(x=>x[1]>=9)); });
});
