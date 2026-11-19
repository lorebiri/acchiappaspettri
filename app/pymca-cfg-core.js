// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* File di configurazione .cfg di PyMca: lettura, scrittura e traduzione da e verso le condizioni di misura dell'app.
   Parte pura, senza DOM. Nel browser e nel worker: globale `PymcaCfg`; in node: require('./app/pymca-cfg-core.js').

   COME SI USA
     const cfg = PymcaCfg.parse(testo);          // oggetto annidato come ConfigDict di PyMca: cfg.detector.gain, cfg.materials.Air.Density…
     const n   = PymcaCfg.toAcch(cfg);           // oggetto neutro: n.setup (per fpSetup), n.excitation, n.fit, n.peaks, n.matrix, n.warnings
     fpSetup(n.setup)                            // nel nucleo: le condizioni di misura (n.excitation va passata a parte: vedi sotto)
     const cfg2 = PymcaCfg.fromAcch(n);          // di nuovo un .cfg completo per PyMca (modello McaTheory.cfg, cambia solo ciò che è noto)
     const testo2 = PymcaCfg.stringify(cfg2);    // testo da salvare come .cfg e aprire in PyMca; cfg2.warnings (non enumerabile) dice che cosa manca
   Gli avvisi (n.warnings, cfg2.warnings) sono in italiano e vanno mostrati all'utente: ogni chiave senza equivalente o approssimata ne ha uno.
   L'eccitazione: in PyMca conta la lista [fit] energy/energyweight (per esempio Steel.cfg è monocromatico a 16 keV, la sezione [tube]
   lì è solo un promemoria). Se n.excitation non è nullo, il modello del tubo dell'app (anodo e kV) non descrive la misura.

   Formato (PyMca5/PyMcaIO/ConfigDict.py, su configparser di Python): sezioni [nome] e sottosezioni [nome.sotto] («.» nel nome si scrive «_|_»);
   valori convertiti come Python int() o float(), altrimenti stringhe; una virgola fa una lista; più righe (rientrate) fanno una lista di righe;
   «[1 2 3]» senza virgole è un vettore di numeri. Nessun codice di PyMca è incluso qui: il formato è reimplementato.
   Il modello per fromAcch (MODEL_CFG) deriva da PyMca5/PyMcaData/McaTheory.cfg e Steel.cfg:
     Copyright (c) 2004-2023 European Synchrotron Radiation Facility (ESRF), licenza MIT (testo completo in THIRD-PARTY-NOTICES.md, «PyMca / fisx»). */
(function(root, factory){
  if (typeof module==='object' && module.exports) module.exports=factory();
  else root.PymcaCfg=factory();
})(typeof globalThis!=='undefined' ? globalThis : this, function(){
  'use strict';
  const VERSION='pymca-cfg-1';
  const isObj=v=>v!==null && typeof v==='object' && !Array.isArray(v);
  const num=v=>typeof v==='number' && Number.isFinite(v) ? v : null;
  const arr=v=>v==null || v==='' ? [] : Array.isArray(v) ? v : [v];
  const clone=v=>JSON.parse(JSON.stringify(v));

  /* ---------------- lettura (come configparser + ConfigDict.__parse_data) ---------------- */
  // int() e float() di Python su una stringa già ripulita dagli spazi; altrimenti la stringa resta tale
  const RE_INT=/^[+-]?\d+(?:_\d+)*$/, RE_FLT=/^[+-]?(?:\d+(?:_\d+)*(?:\.(?:\d+(?:_\d+)*)?)?|\.\d+(?:_\d+)*)(?:[eE][+-]?\d+(?:_\d+)*)?$/;
  function pyScalar(s){
    if (RE_INT.test(s) || RE_FLT.test(s)) return Number(s.replace(/_/g,''));
    const l=s.toLowerCase().replace(/^\+/,'');
    if (l==='nan' || l==='-nan') return NaN;
    if (l==='inf' || l==='infinity') return Infinity;
    if (l==='-inf' || l==='-infinity') return -Infinity;
    return s;
  }
  function pyLine(line){
    if (line.indexOf(',')<0) return pyScalar(line.trim());
    if (line.endsWith(',')){ const b=line.slice(0,-1); return b.indexOf(',')>=0 ? b.split(',').map(x=>pyScalar(x.trim())) : [pyScalar(b.trim())]; }
    return line.split(',').map(x=>pyScalar(x.trim()));
  }
  function pyData(data){
    if (data.length && data.indexOf(',')<0 && data[0]==='[' && data[data.length-1]===']'){   // vettore numpy, come lo scrive ConfigDict
      const fl=t=>{ const v=pyScalar(t); return typeof v==='number' ? v : null; };
      const toks=data.slice(1,-1).split(/\s+/).filter(Boolean);
      if (toks.every(t=>fl(t)!==null)) return toks.map(fl);
      if (data[2]==='[' && data[data.length-3]===']'){   // matrice «[ [1. 2.] [3. 4.] ]»
        const inner=data.slice(3,-3), nrows=inner.split('] [').length, vals=inner.split('] [').join(' ').split(/\s+/).filter(Boolean);
        if (vals.every(t=>fl(t)!==null) && vals.length%nrows===0){ const nc=vals.length/nrows; return Array.from({length:nrows}, (_,r)=>vals.slice(r*nc,(r+1)*nc).map(fl)); }
      }
    }
    const lines=data.split(/\r\n|\r|\n/);
    if (data==='') return '';
    if (lines.length===1) return pyLine(lines[0]);
    return lines.map(pyLine);
  }
  // configparser di Python con le opzioni di ConfigDict: chiavi con le maiuscole come sono, «=» o «:», commenti «#» e «;» a inizio riga,
  // valori su più righe se rientrati, «%%» → «%» (interpolazione di base), sezione [DEFAULT] copiata in tutte le altre
  function parse(text){
    text=String(text==null?'':text).replace(/^﻿/,'');
    const secs=[], byName=new Map(); let cur=null, opt=null, optIndent=0;
    const lines=text.split(/\r\n|\r|\n/);
    for (let ln=0; ln<lines.length; ln++){
      const raw=lines[ln], strip=raw.trim();
      if (strip.startsWith('#') || strip.startsWith(';')) continue;   // commento: non interrompe un valore su più righe
      if (!strip){ if (cur && opt) cur.opts.get(opt).push(''); else opt=null; continue; }
      const indent=raw.search(/\S/);
      if (cur && opt && indent>optIndent){ cur.opts.get(opt).push(strip); continue; }
      const h=/^\[(.+)\]/.exec(strip);
      if (h){ const name=h[1]; cur=byName.get(name); if (!cur){ cur={name, opts:new Map()}; byName.set(name,cur); secs.push(cur); } opt=null; continue; }
      if (!cur) throw new Error('riga '+(ln+1)+': manca l\'intestazione di sezione [nome] prima di «'+strip.slice(0,40)+'»');
      const m=/^(.*?)\s*[=:]\s*(.*)$/.exec(strip);
      if (!m || !m[1]) throw new Error('riga '+(ln+1)+': atteso «chiave = valore», trovato «'+strip.slice(0,40)+'»');
      opt=m[1].trim(); optIndent=indent; cur.opts.set(opt, [m[2]]);
    }
    const def=byName.get('DEFAULT'), out={};
    const interp=(v, sec)=>v.replace(/%\(([^)]+)\)s|%%/g, (all, k)=>{ if (!k) return '%'; const src=(sec.opts.has(k)?sec:def&&def.opts.has(k)?def:null); return src ? src.opts.get(k).join('\n').trim() : all; });
    for (const s of secs){ if (s.name==='DEFAULT') continue;
      let d=out; for (const part of s.name.split('.')){ const k=part.split('_|_').join('.'); if (!isObj(d[k])) d[k]={}; d=d[k]; }
      const keys=new Map(def ? def.opts : []); for (const [k,v] of s.opts) keys.set(k,v);
      for (const [k,v] of keys){ const val=v.join('\n').replace(/\s+$/,''); d[k]=pyData(interp(val, s)); }
    }
    return out;
  }

  /* ---------------- scrittura (come ConfigDict.__write: prima i valori, poi le liste, poi le sottosezioni) ---------------- */
  function pyStr(v){
    if (typeof v==='number'){ if (Number.isNaN(v)) return 'nan'; if (v===Infinity) return 'inf'; if (v===-Infinity) return '-inf'; return String(v); }
    if (v===null || v===undefined) return 'None';
    if (v===true) return 'True'; if (v===false) return 'False';
    return String(v).replace(/[\r\n]+/g,' ');
  }
  const esc=s=>s.replace(/%/g,'%%');
  function stringify(obj){
    if (!isObj(obj)) throw new Error('stringify: serve un oggetto con le sezioni');
    let txt='';
    const write=(d, head)=>{
      const vals=[], lists=[], subs=[];
      for (const k of Object.keys(d)){ const v=d[k]; if (v===undefined) continue; (Array.isArray(v)?lists:isObj(v)?subs:vals).push(k); }
      for (const k of vals) txt+=k+' = '+esc(pyStr(d[k]))+'\n';
      for (const k of lists){ const L=d[k]; let sep=', '; const parts=[];
        for (const it of L){ if (Array.isArray(it)){ sep='\n\t'; parts.push(it.length===1 ? pyStr(it[0])+',' : it.map(pyStr).join(', ')); } else parts.push(pyStr(it)); }
        // una lista di un solo elemento si scrive «x,»: ConfigDict la rilegge come lista (PyMca la scriverebbe «x», cioè uno scalare)
        let s=parts.join(sep); if (L.length===1 && !Array.isArray(L[0])) s+=',';
        txt+=k+' = '+esc(s)+'\n'; }
      for (const k of subs){ const h=(head ? head+'.' : '')+k.split('.').join('_|_'); txt+='\n['+h+']\n'; write(d[k], h); }
    };
    for (const k of Object.keys(obj)) if (!isObj(obj[k])) throw new Error('stringify: «'+k+'» fuori da ogni sezione: configparser non lo rileggerebbe');
    write(obj, '');
    return txt.replace(/^\n/,'');
  }

  /* ---------------- materiali: formule e [materials] → frazioni in peso ---------------- */
  // pesi atomici standard (IUPAC, valori abbreviati) per convertire le formule (H2O1, Fe1O2H1) in frazioni in peso
  const AW={H:1.008,He:4.0026,Li:6.94,Be:9.0122,B:10.81,C:12.011,N:14.007,O:15.999,F:18.998,Ne:20.180,Na:22.990,Mg:24.305,Al:26.982,Si:28.085,P:30.974,S:32.06,Cl:35.45,Ar:39.948,
    K:39.098,Ca:40.078,Sc:44.956,Ti:47.867,V:50.942,Cr:51.996,Mn:54.938,Fe:55.845,Co:58.933,Ni:58.693,Cu:63.546,Zn:65.38,Ga:69.723,Ge:72.630,As:74.922,Se:78.971,Br:79.904,Kr:83.798,
    Rb:85.468,Sr:87.62,Y:88.906,Zr:91.224,Nb:92.906,Mo:95.95,Tc:98,Ru:101.07,Rh:102.91,Pd:106.42,Ag:107.87,Cd:112.41,In:114.82,Sn:118.71,Sb:121.76,Te:127.60,I:126.90,Xe:131.29,
    Cs:132.91,Ba:137.33,La:138.91,Ce:140.12,Pr:140.91,Nd:144.24,Pm:145,Sm:150.36,Eu:151.96,Gd:157.25,Tb:158.93,Dy:162.50,Ho:164.93,Er:167.26,Tm:168.93,Yb:173.05,Lu:174.97,
    Hf:178.49,Ta:180.95,W:183.84,Re:186.21,Os:190.23,Ir:192.22,Pt:195.08,Au:196.97,Hg:200.59,Tl:204.38,Pb:207.2,Bi:208.98,Po:209,At:210,Rn:222,Fr:223,Ra:226,Ac:227,Th:232.04,Pa:231.04,U:238.03};
  // formula → numero di atomi: «Si1», «H2O1», «Fe1O2H1», «Ca(OH)2»; null se non è una formula
  function formulaAtoms(f){
    f=String(f).trim(); if (!f || !/^[A-Z(]/.test(f)) return null; let i=0;
    const numAt=()=>{ const m=/^\d*\.?\d+/.exec(f.slice(i)); if (!m) return 1; i+=m[0].length; return +m[0]; };
    const grp=()=>{ const o={};
      while (i<f.length && f[i]!==')'){
        if (f[i]==='('){ i++; const g=grp(); if (f[i]!==')') return null; i++; const k=numAt(); for (const s in g) o[s]=(o[s]||0)+g[s]*k; continue; }
        const m=/^[A-Z][a-z]?/.exec(f.slice(i)); if (!m || !AW[m[0]]) return null; i+=m[0].length; const k=numAt(); o[m[0]]=(o[m[0]]||0)+k;
      } return o; };
    const o=grp(); if (!o || i!==f.length || !Object.keys(o).length) return null; return o;
  }
  function formulaMass(f){ const a=formulaAtoms(f); if (!a) return null; let t=0; const w={}; for (const s in a){ w[s]=a[s]*AW[s]; t+=w[s]; } for (const s in w) w[s]/=t; return w; }
  // nome di un materiale (sezione [materials.Nome]) o formula → {El: frazione in peso}, somma 1. Come PyMca: prima i materiali, poi le formule
  function materialComp(name, cfg, depth){
    depth=depth||0; if (depth>8 || name==null) return null; const mats=(cfg&&cfg.materials)||{}, key=String(name).trim();
    if (!key || key==='-') return null;
    const m=isObj(mats[key]) ? mats[key] : null;
    if (m && m.CompoundList!=null){
      const L=arr(m.CompoundList), F=arr(m.CompoundFraction).map(Number); if (!L.length || L.length!==F.length) return null;
      const c={}; let t=0;
      for (let j=0;j<L.length;j++){ const sub=materialComp(L[j], cfg, depth+1); if (!sub || !(F[j]>=0)) return null; for (const s in sub) c[s]=(c[s]||0)+F[j]*sub[s]; t+=F[j]; }
      if (!(t>0)) return null; for (const s in c) c[s]/=t; return c;
    }
    return formulaMass(key);
  }

  /* ---------------- PyMca → oggetto neutro ---------------- */
  const CONTINUUM=[null,'Constant','Linear','Parabolic','Linear Polynomial','Exp. Polynomial'];
  // densità degli anodi (g/cm³) per la sezione [tube] scritta da fromAcch
  const ANODE_RHO={Rh:12.41, Ag:10.5, Mo:10.22, W:19.3, Pd:12.02, Cr:7.19, Cu:8.96, Ti:4.506, Au:19.32, Co:8.9, Fe:7.874, Sc:2.985};
  const BE_RHO=1.848;

  function toAcch(cfg){
    if (typeof cfg==='string') cfg=parse(cfg);
    cfg=cfg||{}; const W=[], warn=(key, kind, msg)=>W.push({key, kind, msg});
    const sec=k=>isObj(cfg[k]) ? cfg[k] : {};
    const det=sec('detector'), fit=sec('fit'), ps=sec('peakshape'), tube=sec('tube'), att=sec('attenuators'), conc=sec('concentrations');
    const used={detector:new Set(), fit:new Set(), peakshape:new Set(), tube:new Set(), concentrations:new Set()};
    const get=(s, d, k)=>{ used[s].add(k); return d[k]; };
    const flag=v=>v===true || (typeof v==='number' && v!==0) || (typeof v==='string' && /^(true|yes|1)$/i.test(v));
    const um=cm=>num(cm)!=null ? +(cm*1e4).toPrecision(12) : null;

    /* attenuatori: [attivo, materiale, densità, spessore (cm), fattore]; Matrix ha anche α_in, α_out, flag e angolo di diffusione */
    const A={}; for (const k of Object.keys(att)){ const v=arr(att[k]); A[k]={on:flag(v[0]), mat:v[1], rho:num(v[2]), t:num(v[3]), f:v.length>4?num(v[4]):1, raw:v}; }
    const findAtt=name=>{ const k=Object.keys(A).find(x=>x.toLowerCase()===name.toLowerCase()); return k ? A[k] : null; };
    const funny=(k,a)=>{ if (a.on && a.f!=null && Math.abs(a.f-1)>1e-10 && k.toUpperCase()!=='MATRIX') warn('[attenuators] '+k, 'approssimata', 'attenuatore «a rete» (fattore '+a.f+'): l\'app lo tratta come uno strato pieno'); };
    for (const k of Object.keys(A)) funny(k, A[k]);

    // matrice
    const mx=findAtt('Matrix'); let psi1=null, psi2=null, matrix=null;
    if (mx){ psi1=num(mx.raw[4]); psi2=num(mx.raw[5]);
      if (mx.raw.length>=8 && flag(mx.raw[6])) warn('[attenuators] Matrix', 'approssimata', 'angolo di diffusione fissato a '+mx.raw[7]+'°: l\'app usa α_in + α_out o lo ricava dal picco Compton');
      if (mx.on){
        if (String(mx.mat).toUpperCase()==='MULTILAYER'){
          const ml=sec('multilayer'), layers=Object.keys(ml).sort().map(k=>({k, v:arr(ml[k])})).filter(x=>flag(x.v[0]))
            .map(x=>({name:String(x.v[1]), comp:materialComp(x.v[1], cfg), rho:num(x.v[2]), thickness:num(x.v[3])}));
          if (layers.length){ const L0=layers[0]; matrix={name:L0.name, comp:L0.comp, rho:L0.rho, thickness:L0.thickness, multilayer:layers};
            warn('[multilayer]', 'approssimata', layers.length>1 ? 'campione a '+layers.length+' strati: l\'app usa il primo («'+L0.name+'»); gli strati sotto e la fluorescenza fra strati vanno descritti a mano' : 'multistrato con un solo strato attivo: usato come matrice'); }
          else warn('[attenuators] Matrix', 'nota', 'matrice MULTILAYER senza strati attivi');
        } else {
          const comp=materialComp(mx.mat, cfg); matrix={name:String(mx.mat), comp, rho:mx.rho, thickness:mx.t};
          if (!comp) warn('[attenuators] Matrix', 'ignorata', 'materiale «'+mx.mat+'» non riconosciuto (né in [materials] né come formula)');
        }
      }
    }
    if (!matrix) warn('[attenuators] Matrix', 'nota', 'nessuna matrice attiva: in PyMca il calcolo FP delle concentrazioni non si fa senza matrice');
    else if (matrix.rho!=null && matrix.thickness!=null && matrix.rho*matrix.thickness<0.1) warn('[attenuators] Matrix', 'approssimata', 'campione sottile (ρ·d = '+(matrix.rho*matrix.thickness).toPrecision(3)+' g/cm²): l\'app oggi presume un campione spesso');
    { const mlActive=Object.keys(sec('multilayer')).filter(k=>flag(arr(sec('multilayer')[k])[0]));
      if (mlActive.length && !(matrix && matrix.multilayer)) warn('[multilayer]', 'ignorata', 'strati attivi ('+mlActive.join(', ')+') ma la matrice non è MULTILAYER: PyMca li ignora, l\'app pure'); }

    // atmosfera (cammino campione → rivelatore)
    let atm='vac', d2=null; const at=findAtt('atmosphere');
    if (at && at.on){
      const c=materialComp(at.mat, cfg)||{}; d2=at.t;
      if ((c.He||0)>0.5) atm='he';
      else if ((c.N||0)+(c.O||0)>0.9){ atm='air'; if (at.rho!=null && Math.abs(at.rho-1.205e-3)/1.205e-3>0.1) warn('[attenuators] atmosphere', 'approssimata', 'densità dell\'aria '+at.rho+' g/cm³: l\'app usa 1,205·10⁻³ g/cm³'); }
      else { atm='air'; warn('[attenuators] atmosphere', 'approssimata', 'atmosfera di «'+at.mat+'»: l\'app conosce solo aria, elio e vuoto; trattata come aria'); }
    }
    warn('[attenuators] atmosphere', 'nota', 'PyMca non descrive l\'aria fra tubo e campione: d1 = 0'+(at&&at.on ? '; l\'atmosfera ('+(at.t)+' cm) è il cammino campione–rivelatore (d2)' : ''));

    // finestra del rivelatore, rivelatore, filtri sul fascio
    let beD=null; const win=findAtt('window');
    if (win && win.on){ const c=materialComp(win.mat, cfg)||{};
      if ((c.Be||0)>0.99){ beD=um(win.t); if (win.rho!=null && Math.abs(win.rho-BE_RHO)>0.05) warn('[attenuators] window', 'approssimata', 'densità del berillio '+win.rho+': l\'app usa 1,848 g/cm³'); }
      else { beD=um(win.t*(win.rho||BE_RHO)/BE_RHO); warn('[attenuators] window', 'approssimata', 'finestra del rivelatore di «'+win.mat+'»: l\'app la tratta come berillio di uguale massa per area ('+beD+' µm)'); } }
    else beD=0;
    const dt=findAtt('Detector'); let si=null; const detEl=String(get('detector', det, 'detele')||'Si');
    if (dt){ si=um(dt.t); if (!dt.on) warn('[attenuators] Detector', 'nota', 'efficienza del rivelatore disattivata in PyMca (spessore '+si+' µm); l\'app la applica sempre'); }
    const detType=/^ge/i.test(detEl) ? 'Ge' : 'Si';
    if (!/^(si|ge)$/i.test(detEl)) warn('[detector] detele', 'approssimata', 'rivelatore di «'+detEl+'»: l\'app conosce Si e Ge; usato Si');
    if (detType==='Ge') warn('[detector] detele', 'approssimata', 'rivelatore al germanio: il nucleo oggi calcola efficienza e fughe solo per il silicio');
    const filters=Object.keys(A).filter(k=>/^beamfilter\d$/i.test(k) && A[k].on).map(k=>({k, a:A[k], comp:materialComp(A[k].mat, cfg)}));
    let filt=null;
    if (filters.length){ const f0=filters[0];
      if (f0.comp){ const els=Object.keys(f0.comp); filt={comp:els.length===1 ? els[0] : els.map(s=>s+':'+(+(100*f0.comp[s]).toPrecision(6))).join(' '), compW:f0.comp, rho:f0.a.rho, um:um(f0.a.t), name:String(f0.a.mat)}; }
      else warn('[attenuators] '+f0.k, 'ignorata', 'materiale del filtro «'+f0.a.mat+'» non riconosciuto');
      if (filters.length>1) warn('[attenuators] '+filters.slice(1).map(f=>f.k).join(', '), 'ignorata', 'l\'app ha un solo filtro sul fascio: usato '+f0.k); }
    for (const k of Object.keys(A)){ const lk=k.toLowerCase(); if (!A[k].on || lk==='matrix' || lk==='atmosphere' || lk==='window' || lk==='detector' || /^beamfilter\d$/.test(lk)) continue;
      warn('[attenuators] '+k, 'ignorata', 'strato «'+A[k].mat+'» di '+um(A[k].t)+' µm sul cammino verso il rivelatore'+(lk==='deadlayer'?' (strato morto)':lk==='contact'?' (contatto elettrico)':'')+': l\'app non lo prevede'); }
    if (isObj(cfg.userattenuators) && Object.keys(cfg.userattenuators).some(k=>isObj(cfg.userattenuators[k]) && flag(cfg.userattenuators[k].use))) warn('[userattenuators]', 'ignorata', 'attenuatori definiti da tabella (curve di trasmissione): l\'app non li prevede');

    // tubo
    const hasTube=Object.keys(tube).length>0, tw=get('tube', tube, 'window'), twt=get('tube', tube, 'windowthickness'), twr=get('tube', tube, 'windowdensity');
    let beT=null;
    if (hasTube && num(twt)!=null){ const c=materialComp(tw, cfg)||{}; if ((c.Be||0)>0.99) beT=um(twt);
      else if (num(twt)>0){ beT=um(twt*(num(twr)||BE_RHO)/BE_RHO); warn('[tube] window', 'approssimata', 'finestra del tubo di «'+tw+'»: trattata come berillio di uguale massa per area ('+beT+' µm)'); } else beT=0; }
    const anode=hasTube ? String(get('tube', tube, 'anode')||'') || null : null, kv=hasTube ? num(get('tube', tube, 'voltage')) : null;
    const alphae=hasTube ? num(get('tube', tube, 'alphae')) : null, alphax=hasTube ? num(get('tube', tube, 'alphax')) : null;
    if (hasTube && num(tube.filter1thickness)>0) { used.tube.add('filter1').add('filter1thickness').add('filter1density'); warn('[tube] filter1', 'approssimata', 'filtro del tubo «'+tube.filter1+'» ('+um(tube.filter1thickness)+' µm): in PyMca entra solo nella lista delle energie generata dal tubo; aggiungilo come filtro sul fascio se serve'); }
    if (hasTube && flag(tube.transmission)) { used.tube.add('transmission'); warn('[tube] transmission', 'ignorata', 'tubo a trasmissione: l\'app presume un anodo massiccio'); }

    // eccitazione: la lista di [fit] è ciò che PyMca usa davvero
    const E=arr(get('fit', fit, 'energy')), Wt=arr(get('fit', fit, 'energyweight')), Fl=arr(get('fit', fit, 'energyflag')), Sc=arr(get('fit', fit, 'energyscatter'));
    const exc=[];
    for (let j=0;j<E.length;j++){ const e=num(E[j]); if (e==null || !(e>0)) continue; if (Fl.length>j && !flag(Fl[j])) continue;
      exc.push({E:e, w:num(Wt[j])!=null ? Wt[j] : 1, scatter:Sc.length>j ? flag(Sc[j]) : true}); }
    const excitation=exc.length ? exc : null;
    if (excitation){
      const kind=excitation.length===1 ? 'monocromatica a '+excitation[0].E+' keV' : excitation.length+' energie fra '+Math.min(...excitation.map(x=>x.E))+' e '+Math.max(...excitation.map(x=>x.E))+' keV';
      warn('[fit] energy', 'nota', 'eccitazione '+kind+': è quella che PyMca usa per il calcolo'+(hasTube?'; la sezione [tube] ('+anode+', '+kv+' kV) serve solo a generare la lista e qui non conta':'')+'. Il modello del tubo dell\'app non la descrive: va passata al nucleo come lista di energie');
    } else if (hasTube) warn('[fit] energy', 'approssimata', 'nessuna energia d\'eccitazione: si usa il modello del tubo dell\'app ('+anode+', '+kv+' kV), diverso da quello di Ebel che PyMca userebbe per generare la lista');
    else warn('[fit] energy', 'nota', 'nessuna eccitazione né tubo: restano i valori predefiniti dell\'app');

    // fit
    const zero=num(get('detector', det, 'zero')), gain=num(get('detector', det, 'gain'));
    let quad=null; for (const k of ['quad','quadratic','gain2']) if (num(det[k])!=null){ used.detector.add(k); quad=det[k]; }
    const chE=c=>c==null||zero==null||gain==null ? null : +(zero+gain*c+(quad||0)*c*c).toPrecision(10);
    const xmin=num(get('fit', fit, 'xmin')), xmax=num(get('fit', fit, 'xmax'));
    const hf=num(get('fit', fit, 'hypermetflag')), ff=num(get('fit', fit, 'fitfunction'));
    const hyper=hf==null ? null : {gauss:!!(hf&1), st:!!((hf>>1)&1), lt:!!((hf>>2)&1), step:!!((hf>>3)&1)};
    const fitfunction=ff===1 || (ff==null && hf===0) ? 'pseudo-voigt' : 'hypermet';
    const P=k=>num(get('peakshape', ps, k));
    const fixed={}, delta={};
    for (const k of ['zero','gain','noise','fano','sum']){ const f=get('detector', det, 'fixed'+k), d=get('detector', det, 'delta'+k); if (f!=null) fixed[k]=flag(f); if (num(d)!=null) delta[k]=d; }
    const psFixed={}; for (const k of ['st_arearatio','st_sloperatio','lt_arearatio','lt_sloperatio','step_heightratio','eta_factor']){ const f=get('peakshape', ps, 'fixed'+k); get('peakshape', ps, 'delta'+k); if (f!=null) psFixed[k]=flag(f); }
    const strAlg=num(get('fit', fit, 'stripalgorithm'));
    const cont=num(get('fit', fit, 'continuum'));
    const fitN={
      xmin, xmax, xminE:chE(xmin), xmaxE:chE(xmax), zero, gain, quad,
      noise:num(get('detector', det, 'noise')), fano:num(get('detector', det, 'fano')), sum:num(get('detector', det, 'sum')),
      fixed, delta,
      hypermet:hyper, st:[P('st_arearatio'), P('st_sloperatio')], lt:[P('lt_arearatio'), P('lt_sloperatio')], stepH:P('step_heightratio'), eta:P('eta_factor'), shapeFixed:psFixed,
      fitfunction,
      escape:flag(get('fit', fit, 'escapeflag')), detEl:detType, pileup:flag(get('fit', fit, 'sumflag')), scatter:fit.scatterflag==null ? null : flag(get('fit', fit, 'scatterflag')),
      stripflag:flag(get('fit', fit, 'stripflag')), stripalgorithm:strAlg===1 ? 'snip' : strAlg==null ? null : 'strip', snipwidth:num(get('fit', fit, 'snipwidth')),
      continuum:cont==null ? null : (CONTINUUM[cont]===undefined ? String(cont) : CONTINUUM[cont]),
      maxiter:num(get('fit', fit, 'maxiter')), deltachi:num(get('fit', fit, 'deltachi')), linearfit:flag(get('fit', fit, 'linearfitflag'))
    };
    // scarti di forma e di fit che il nucleo oggi non riproduce (il coordinatore aggiorna questi avvisi quando il nucleo cresce)
    if (hyper && (hyper.st || hyper.lt || hyper.step)) warn('[fit] hypermetflag', 'approssimata', 'ipermetro con '+[hyper.st&&'coda corta', hyper.lt&&'coda lunga', hyper.step&&'gradino'].filter(Boolean).join(', ')+' (bit '+hf+'): parametri letti in fit.st, fit.lt, fit.stepH; il nucleo attuale usa gaussiane pure');
    if (fitfunction==='pseudo-voigt') warn('[fit] fitfunction', 'approssimata', 'pseudo-Voigt (eta '+fitN.eta+'): il nucleo attuale usa gaussiane');
    if (fitN.pileup) warn('[fit] sumflag', 'approssimata', 'picchi somma (pile-up) attivi, Sum = '+fitN.sum+': il nucleo attuale li segnala soltanto');
    if (fitN.stripflag) warn('[fit] stripflag', 'approssimata', 'fondo '+(fitN.stripalgorithm==='snip' ? 'SNIP ('+fitN.snipwidth+' canali)' : 'strip iterativo')+': nell\'app corrisponde al fondo «SNIP» (larghezza in keV), non identico');
    if (fitN.continuum) warn('[fit] continuum', 'ignorata', 'continuo analitico «'+fitN.continuum+'»: l\'app usa B-spline o SNIP');
    if (fitN.linearfit) warn('[fit] linearfitflag', 'approssimata', 'fit lineare (Zero, Gain, Noise, Fano fissi): nell\'app corrisponde a calibrazione fissata');
    if (quad) warn('[detector] '+[...used.detector].find(k=>/quad|gain2/.test(k)), 'approssimata', 'termine quadratico della calibrazione ('+quad+'): il nucleo attuale ha un asse lineare');

    // righe
    const peaks={}; for (const [el, v] of Object.entries(sec('peaks'))){ const sh=arr(v).flatMap(x=>String(x).split(/[\s,]+/)).filter(Boolean); if (sh.length) peaks[el]=sh; }

    // concentrazioni
    const C=k=>get('concentrations', conc, k);
    const quant=Object.keys(conc).length ? {reference:C('reference')!=null ? String(C('reference')) : null, flux:num(C('flux')), time:num(C('time')), area:num(C('area')), distance:num(C('distance')),
      secondary:num(C('usemultilayersecondary')), useMatrix:flag(C('usematrix')), useAttenuators:C('useattenuators')==null ? null : flag(C('useattenuators')), mmolar:flag(C('mmolarflag'))} : null;
    if (quant){
      if (quant.reference && !/^auto$/i.test(quant.reference)) warn('[concentrations] reference', 'approssimata', 'elemento di riferimento «'+quant.reference+'» (standard interno): l\'app normalizza a 100% (modo «leghe») oppure usa il Compton');
      else if (quant.flux!=null) warn('[concentrations] flux', 'approssimata', 'scala assoluta da flusso × tempo × angolo solido: l\'app normalizza a 100% o usa il Compton');
      if (quant.secondary===2) warn('[concentrations] usemultilayersecondary', 'approssimata', 'fluorescenza terziaria richiesta: il nucleo calcola primaria e secondaria');
      else if (quant.secondary===0) warn('[concentrations] usemultilayersecondary', 'nota', 'in PyMca solo fluorescenza primaria: l\'app aggiunge sempre la secondaria');
      if (quant.useMatrix) warn('[concentrations] usematrix', 'nota', 'in PyMca la composizione della matrice è presa come nota (matrix.comp)');
      if (quant.mmolar) warn('[concentrations] mmolarflag', 'ignorata', 'risultati in mmol/l: l\'app dà frazioni in peso');
      if (flag(conc.usexrfmc)){ used.concentrations.add('usexrfmc'); warn('[concentrations] usexrfmc', 'ignorata', 'correzione Monte Carlo XMI-MSIM: non disponibile nell\'app'); }
    }
    for (const k of ['xrfmc']) if (isObj(cfg[k]) && Object.keys(cfg[k]).length) warn('['+k+']', 'ignorata', 'impostazioni di XMI-MSIM (Monte Carlo): l\'app non le usa');

    // chiavi lette ma senza equivalente: una riga per sezione, mai in silenzio
    const NOEQ={detector:'soglie di raggruppamento delle righe e opzioni di calibrazione', fit:'opzioni dell\'algoritmo di PyMca', peakshape:'', tube:'dettagli dello spettro del tubo di Ebel', concentrations:''};
    for (const s of Object.keys(used)){ const rest=Object.keys(sec(s)).filter(k=>!used[s].has(k));
      if (rest.length) warn('['+s+'] '+rest.join(', '), 'ignorata', 'senza equivalente nell\'app'+(NOEQ[s] ? ' ('+NOEQ[s]+')' : '')); }
    const known=new Set(['detector','fit','peakshape','tube','attenuators','concentrations','peaks','materials','multilayer','xrfmc','userattenuators','fisx']);
    for (const k of Object.keys(cfg)) if (!known.has(k) && !(isObj(cfg[k]) && !Object.keys(cfg[k]).length)) warn('['+k+']', 'ignorata', 'sezione sconosciuta all\'importazione');

    return {
      version:VERSION,
      setup:{anode, kv, psi1, psi2, beT, eps:alphax, alphae, alphax, d1:0, d2, atm, beD, si, det:detType, filt},
      excitation, fit:fitN, peaks, matrix, quant, warnings:W
    };
  }

  /* ---------------- oggetto neutro → PyMca ---------------- */
  // modello: PyMca5/PyMcaData/McaTheory.cfg (MIT, © ESRF), con [tube], BeamFilter0/1 e il materiale Air presi da Steel.cfg
  const MODEL_CFG=`[attenuators]
kapton = 0, -, 0.0, 0.0, 1.0
atmosphere = 0, -, 0.0, 0.0, 1.0
Matrix = 0, MULTILAYER, 0.0, 0.0, 45.0, 45.0, 0, 90.0
deadlayer = 0, Si1, 2.33, 0.002, 1.0
BeamFilter0 = 0, -, 0.0, 0.0, 1.0
BeamFilter1 = 0, -, 0.0, 0.0, 1.0
absorber = 0, -, 0.0, 0.0, 1.0
window = 0, -, 0.0, 0.0, 1.0
contact = 0, Au1, 19.37, 1e-06, 1.0
Detector = 0, Si1, 2.33, 0.5, 1.0
Filter 6 = 0, -, 0.0, 0.0, 1.0
Filter 7 = 0, -, 0.0, 0.0, 1.0

[peaks]

[fit]
deltachi = 0.001
continuum = 0
hypermetflag = 1
stripconstant = 1.0
exppolorder = 6
energy = None
stripwidth = 1
stripfilterwidth = 1
sumflag = 0
stripflag = 0
stripalgorithm = 0
snipwidth = 30
scatterflag = 0
linearfitflag = 0
use_limit = 0
linpolorder = 5
xmax = 1130
maxiter = 10
xmin = 83
stripiterations = 20000
escapeflag = 1

[concentrations]
distance = 10.0
area = 30.0
flux = 10000000000.0
time = 1.0
useattenuators = 1
usematrix = 0
usemultilayersecondary = 1
reference = Auto
mmolarflag = 0

[detector]
noise = 0.1
fixednoise = 0
fixedgain = 0
deltafano = 0.114
fixedfano = 0
sum = 1e-8
deltasum = 1e-8
fano = 0.114
fixedsum = 0
fixedzero = 0
zero = -0.0118
deltazero = 0.1
gain = 0.0174
deltagain = 0.001
deltanoise = 0.05
detele = Si
ethreshold = 0.020
ithreshold = 1.0E-07
nthreshold = 4

[peakshape]
lt_arearatio = 0.02
fixedlt_arearatio = 0
st_arearatio = 0.05
deltalt_arearatio = 0.015
deltalt_sloperatio = 7.0
deltastep_heightratio = 5e-05
st_sloperatio = 0.5
lt_sloperatio = 10.0
fixedlt_sloperatio = 0
deltast_arearatio = 0.03
fixedst_sloperatio = 0
fixedst_arearatio = 0
deltast_sloperatio = 0.49
step_heightratio = 0.0001
fixedstep_heightratio = 0
eta_factor = 0.02
fixedeta_factor = 0
deltaeta_factor = 0.02

[tube]
anode = Ag
voltage = 30.0
window = Be
windowthickness = 0.0125
windowdensity = 1.848
anodedensity = 10.5
anodethickness = 0.0002
alphae = 90.0
alphax = 90.0
filter1 = He
filter1density = 0.000118
filter1thickness = 0.0
transmission = 0
deltaplotting = 0.1

[materials]

[materials.Air]
Comment = Dry Air (Near sea level) density=0.001204790 g/cm3
Thickness = 1.0
Density = 0.0012048
CompoundFraction = 0.000124, 0.75527, 0.23178, 0.012827, 3.2e-06
CompoundList = C1, N1, O1, Ar1, Kr1

[materials.Kapton]
Comment = Kapton 100 HN 25 micron density=1.42 g/cm3
Density = 1.42
Thickness = 0.0025
CompoundFraction = 0.628772, 0.066659, 0.304569
CompoundList = C1, N1, O1

[materials.Mylar]
Comment = Mylar (Polyethylene Terephthalate) density=1.40 g/cm3
Density = 1.4
CompoundFraction = 0.041959, 0.625017, 0.333025
CompoundList = H1, C1, O1
`;
  const DET_RHO={Si:2.33, Ge:5.323};
  const r6=v=>+(+v).toPrecision(12);
  // nome valido per una sezione [materials.Nome] e per gli attenuatori (niente virgole, punti né spazi ai bordi)
  const matName=s=>String(s||'').replace(/[,.\[\]=:%\s]+/g,'_').replace(/^_+|_+$/g,'') || 'Matrice_Acch';
  function compFromAny(c){ if (!c) return null; if (typeof c==='string'){ const m=formulaMass(c); if (m) return m; const o={}; String(c).replace(/([A-Z][a-z]?)\s*[:=]?\s*([\d.,]+)/g, (_,s,v)=>{ if (AW[s]) o[s]=(o[s]||0)+parseFloat(v.replace(',','.')); return ''; }); return Object.keys(o).length ? o : null; } return isObj(c) ? c : null; }
  function putMaterial(cfg, name, comp, rho, thick, comment){
    const els=Object.keys(comp).filter(s=>comp[s]>0), t=els.reduce((a,s)=>a+comp[s],0);
    cfg.materials[name]={Comment:comment||'scritto da Acchiappaspettri', Density:rho!=null?rho:1.0, Thickness:thick!=null?thick:1.0,
      CompoundFraction:els.map(s=>r6(comp[s]/t)), CompoundList:els.slice()};
  }

  function fromAcch(n){
    n=n||{}; const cfg=parse(MODEL_CFG), W=[], warn=(key, kind, msg)=>W.push({key, kind, msg});
    const s=n.setup||{}, f=n.fit||{}, at=cfg.attenuators;
    const psi1=num(s.psi1)!=null ? s.psi1 : 45, psi2=num(s.psi2)!=null ? s.psi2 : 45;
    // rivelatore e calibrazione
    const D=cfg.detector, det=s.det==='Ge' || f.detEl==='Ge' ? 'Ge' : 'Si';
    D.detele=det;
    for (const k of ['zero','gain','noise','fano','sum']) if (num(f[k])!=null) D[k]=f[k];
    for (const k of Object.keys(f.fixed||{})) D['fixed'+k]=f.fixed[k] ? 1 : 0;
    for (const k of Object.keys(f.delta||{})) if (num(f.delta[k])!=null) D['delta'+k]=f.delta[k];
    if (num(f.quad)) { D.quadratic=f.quad; warn('[detector] quadratic', 'nota', 'termine quadratico scritto come «quadratic»: PyMca non lo legge dal .cfg, va impostato nella calibrazione dello spettro'); }
    // intervallo del fit: canali, oppure keV convertiti con zero e guadagno
    const F=cfg.fit, z=num(D.zero), g=num(D.gain);
    const ch=E=>g ? Math.round((E-z)/g) : null;
    if (num(f.xmin)!=null) F.xmin=Math.round(f.xmin); else if (num(f.xminE)!=null && ch(f.xminE)!=null) F.xmin=Math.max(0, ch(f.xminE));
    if (num(f.xmax)!=null) F.xmax=Math.round(f.xmax); else if (num(f.xmaxE)!=null && ch(f.xmaxE)!=null) F.xmax=ch(f.xmaxE);
    if (f.hypermet){ const h=f.hypermet; F.hypermetflag=(h.gauss!==false?1:0)+(h.st?2:0)+(h.lt?4:0)+(h.step?8:0); if (!(F.hypermetflag&1)) F.hypermetflag=0; }
    if (f.fitfunction==='pseudo-voigt'){ F.fitfunction=1; F.hypermetflag=0; } else if (f.fitfunction==='hypermet') F.fitfunction=0;
    if (f.escape!=null) F.escapeflag=f.escape ? 1 : 0;
    if (f.pileup!=null) F.sumflag=f.pileup ? 1 : 0;
    if (f.scatter!=null) F.scatterflag=f.scatter ? 1 : 0;
    if (f.stripflag!=null) F.stripflag=f.stripflag ? 1 : 0;
    if (f.stripalgorithm) F.stripalgorithm=f.stripalgorithm==='snip' ? 1 : 0;
    if (num(f.snipwidth)!=null) F.snipwidth=Math.round(f.snipwidth);
    if (f.continuum!==undefined){ const i=CONTINUUM.indexOf(f.continuum); F.continuum=i>=0 ? i : 0; }
    if (num(f.maxiter)!=null) F.maxiter=Math.round(f.maxiter);
    if (num(f.deltachi)!=null) F.deltachi=f.deltachi;
    if (f.linearfit!=null) F.linearfitflag=f.linearfit ? 1 : 0;
    const PS=cfg.peakshape;
    if (Array.isArray(f.st)){ if (num(f.st[0])!=null) PS.st_arearatio=f.st[0]; if (num(f.st[1])!=null) PS.st_sloperatio=f.st[1]; }
    if (Array.isArray(f.lt)){ if (num(f.lt[0])!=null) PS.lt_arearatio=f.lt[0]; if (num(f.lt[1])!=null) PS.lt_sloperatio=f.lt[1]; }
    if (num(f.stepH)!=null) PS.step_heightratio=f.stepH;
    if (num(f.eta)!=null) PS.eta_factor=f.eta;
    for (const k of Object.keys(f.shapeFixed||{})) PS['fixed'+k]=f.shapeFixed[k] ? 1 : 0;
    // righe
    for (const [el, sh] of Object.entries(n.peaks||{})){ const L=arr(sh).map(String).filter(Boolean); if (L.length) cfg.peaks[el]=L.length===1 ? L[0] : L; }
    if (!Object.keys(cfg.peaks).length) warn('[peaks]', 'nota', 'nessun elemento: in PyMca vanno scelti nella tavola periodica prima del fit');
    // eccitazione
    const exc=arr(n.excitation).filter(x=>x && num(x.E)>0);
    if (exc.length){ F.energy=exc.map(x=>x.E); F.energyweight=exc.map(x=>num(x.w)!=null ? x.w : 1); F.energyflag=exc.map(()=>1); F.energyscatter=exc.map(x=>x.scatter===false ? 0 : 1); }
    else { F.energy='None'; warn('[fit] energy', 'nota', 'nessuna lista di energie: in PyMca, scheda «ATTENUATORS» → «Matrix», premere «Tube» per generarla dallo spettro del tubo ([tube], modello di Ebel), poi salvare'); }
    // tubo
    const T=cfg.tube;
    if (s.anode){ T.anode=s.anode; if (ANODE_RHO[s.anode]) T.anodedensity=ANODE_RHO[s.anode]; }
    if (num(s.kv)!=null) T.voltage=s.kv;
    if (num(s.beT)!=null){ T.window='Be'; T.windowdensity=BE_RHO; T.windowthickness=r6(s.beT*1e-4); }
    const ax=num(s.alphax)!=null ? s.alphax : num(s.eps)!=null ? s.eps : null; if (ax!=null) T.alphax=ax;
    if (num(s.alphae)!=null) T.alphae=s.alphae;
    if (!s.anode) delete cfg.tube;   // tubo ignoto: niente sezione [tube] (come McaTheory.cfg), invece di un tubo inventato
    if (num(s.charF)!=null && s.charF!==1 || num(s.cexp)!=null && s.cexp!==1) warn('[tube]', 'ignorata', 'correzioni empiriche del tubo dell\'app (charF, cexp): PyMca usa il modello di Ebel');
    // attenuatori
    if (s.atm==='he') at.atmosphere=[1, 'He1', 0.000166, r6(num(s.d2)!=null ? s.d2 : 1), 1.0];
    else if (s.atm==='vac') at.atmosphere=[0, '-', 0.0, 0.0, 1.0];
    else at.atmosphere=[1, 'Air', 0.0012048, r6(num(s.d2)!=null ? s.d2 : 1), 1.0];
    if (num(s.d1)>0 && s.atm!=='vac') warn('[attenuators] atmosphere', 'approssimata', 'aria fra tubo e campione ('+s.d1+' cm): PyMca non la descrive; con una lista di energie è già nello spettro, con il tubo si può aggiungere come BeamFilter1 di aria');
    if (num(s.beD)>0) at.window=[1, 'Be1', BE_RHO, r6(s.beD*1e-4), 1.0];
    at.Detector=[1, det+'1', DET_RHO[det], r6((num(s.si)!=null ? s.si : 500)*1e-4), 1.0];
    if (s.filt && num(s.filt.um)>0){ const c=compFromAny(s.filt.compW||s.filt.comp);
      if (c){ const els=Object.keys(c); let name;
        if (els.length===1) name=els[0]+'1'; else { name=matName(s.filt.name||'Filtro_Acch'); putMaterial(cfg, name, c, s.filt.rho, r6(s.filt.um*1e-4), 'filtro sul fascio, scritto da Acchiappaspettri'); }
        at.BeamFilter0=[1, name, num(s.filt.rho)!=null ? s.filt.rho : 1.0, r6(s.filt.um*1e-4), 1.0]; }
      else warn('[attenuators] BeamFilter0', 'ignorata', 'composizione del filtro non riconosciuta: «'+s.filt.comp+'»'); }
    // matrice
    const M=n.matrix;
    const scatAng=r6(psi1+psi2);
    if (M && M.comp && Object.keys(M.comp).length){ const name=matName(M.name||'Matrice_Acch'); const comp=compFromAny(M.comp);
      putMaterial(cfg, name, comp, num(M.rho)!=null ? M.rho : 1.0, num(M.thickness)!=null ? M.thickness : 1.0, 'matrice, scritta da Acchiappaspettri');
      at.Matrix=[1, name, num(M.rho)!=null ? M.rho : 1.0, num(M.thickness)!=null ? M.thickness : 1.0, psi1, psi2, 0, scatAng];
      if (Array.isArray(M.multilayer) && M.multilayer.length>1) warn('[multilayer]', 'ignorata', 'scritto solo il primo strato: gli altri vanno aggiunti in PyMca');
    } else { at.Matrix=[0, 'MULTILAYER', 0.0, 0.0, psi1, psi2, 0, scatAng]; warn('[attenuators] Matrix', 'nota', 'nessuna matrice: angoli scritti, ma il calcolo delle concentrazioni in PyMca richiede una matrice (anche una stima)'); }
    // concentrazioni
    const Q=n.quant, CC=cfg.concentrations;
    if (Q){ if (Q.reference) CC.reference=Q.reference; for (const [k,v] of [['flux','flux'],['time','time'],['area','area'],['distance','distance'],['secondary','usemultilayersecondary']]) if (num(Q[k])!=null) CC[v]=Q[k];
      if (Q.useMatrix!=null) CC.usematrix=Q.useMatrix ? 1 : 0; if (Q.useAttenuators!=null) CC.useattenuators=Q.useAttenuators ? 1 : 0; if (Q.mmolar!=null) CC.mmolarflag=Q.mmolar ? 1 : 0; }
    else warn('[concentrations]', 'nota', 'flusso, tempo e angolo solido non noti: valori del modello di PyMca; l\'app normalizza a 100%, in PyMca conviene un elemento di riferimento');
    Object.defineProperty(cfg, 'warnings', {value:W, enumerable:false, configurable:true, writable:true});
    return cfg;
  }

  return {VERSION, parse, stringify, toAcch, fromAcch, materialComp, formulaAtoms, formulaMass, MODEL_CFG, CONTINUUM, AW};
});
