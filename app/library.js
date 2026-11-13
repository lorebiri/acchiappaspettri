// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Librerie dei picchi per strumento e tipo di campione (REQUISITO-LIBRERIA, tappa I4): parte pura, senza pagina.
   - documento .acchlib.json versionato (formato «acchlib» 1): una libreria = una coppia (strumento, tipo di campione);
   - impronta SHA-256 del testo, per accorgersi che un file condiviso è cambiato prima di riscriverlo (DECISIONE-PO §7);
   - unione voce per voce (id, revisione, data) con i conflitti restituiti a chi chiama, mai risolti in silenzio;
   - riconoscimento dello strumento dall'intestazione (ChemStation/OpenLab e simili) e scelta della libreria giusta;
   - copie di conflitto di OneDrive riconosciute dal nome e dall'id.
   Funziona nella pagina (window.AcchLib) e in Node (require), per i test. */
(function(root, factory){
  const api=factory();
  if (typeof module==='object' && module.exports) module.exports=api;
  else root.AcchLib=api;
})(typeof self!=='undefined' ? self : this, function(){
  'use strict';
  const FORMAT='acchlib', VERSION=1, MAX_ENTRIES=5000, MAX_TEXT=4000;
  const PROFILES=['ricerca','esplorativa','impurezze','dosaggio','tracce','bioanalisi'];
  // suggerimenti generici per il tipo di campione: campo libero, nessun settore privilegiato (REQUISITO punto 6)
  const SAMPLE_SUGGESTIONS=[['alimenti','food'],['farmaceutico','pharmaceutical'],['ambientale','environmental'],['biologico','biological'],['polimeri','polymers'],['beni culturali','cultural heritage'],['altro','other']];
  const BAD_KEYS=new Set(['__proto__','constructor','prototype']);

  /* ---------- SHA-256 (sincrono, su UTF-8): stesso risultato del lato nativo e di crypto.subtle ---------- */
  const K=new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  function utf8(s){ if (typeof TextEncoder!=='undefined') return new TextEncoder().encode(s); return Uint8Array.from(Buffer.from(s,'utf8')); }
  function sha256(input){
    const msg=typeof input==='string' ? utf8(input) : input, n=msg.length, L=((n+9+63)>>6)<<6, b=new Uint8Array(L); b.set(msg); b[n]=0x80;
    const bits=n*8; for (let i=0;i<8;i++) b[L-1-i]=Math.floor(bits/Math.pow(2,8*i))&0xff;
    const H=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]), W=new Uint32Array(64);
    const r=(x,k)=>(x>>>k)|(x<<(32-k));
    for (let o=0;o<L;o+=64){
      for (let i=0;i<16;i++) W[i]=(b[o+4*i]<<24)|(b[o+4*i+1]<<16)|(b[o+4*i+2]<<8)|b[o+4*i+3];
      for (let i=16;i<64;i++){ const s0=r(W[i-15],7)^r(W[i-15],18)^(W[i-15]>>>3), s1=r(W[i-2],17)^r(W[i-2],19)^(W[i-2]>>>10); W[i]=(W[i-16]+s0+W[i-7]+s1)>>>0; }
      let a=H[0],c=H[1],d=H[2],e=H[3],f=H[4],g=H[5],h=H[6],k=H[7];
      for (let i=0;i<64;i++){ const S1=r(f,6)^r(f,11)^r(f,25), ch=(f&g)^(~f&h), t1=(k+S1+ch+K[i]+W[i])>>>0, S0=r(a,2)^r(a,13)^r(a,22), mj=(a&c)^(a&d)^(c&d), t2=(S0+mj)>>>0;
        k=h; h=g; g=f; f=(e+t1)>>>0; e=d; d=c; c=a; a=(t1+t2)>>>0; }
      H[0]+=a; H[1]+=c; H[2]+=d; H[3]+=e; H[4]+=f; H[5]+=g; H[6]+=h; H[7]+=k;
    }
    return Array.from(H, v=>v.toString(16).padStart(8,'0')).join('');
  }

  /* ---------- pulizia dei valori: niente chiavi pericolose, testi limitati, numeri finiti ---------- */
  const str=(v,max)=>typeof v==='string' ? v.slice(0,max||MAX_TEXT) : (typeof v==='number' && isFinite(v) ? String(v) : '');
  const num=v=>{ if (v===null || v===undefined || v==='') return null; const x=typeof v==='string' ? +v.replace(',','.') : +v; return isFinite(x) ? x : null; };
  const int=(v,d)=>{ const x=Math.round(+v); return isFinite(x) && x>=1 ? x : d; };
  function clean(v, depth){ depth=depth||0; if (depth>12) return null;
    if (Array.isArray(v)) return v.slice(0,MAX_ENTRIES).map(x=>clean(x,depth+1));
    if (v && typeof v==='object'){ const o={}; for (const k of Object.keys(v)){ if (BAD_KEYS.has(k)) continue; const c=clean(v[k],depth+1); if (c!==undefined) o[k]=c; } return o; }
    if (typeof v==='number') return isFinite(v) ? v : null;
    if (typeof v==='string') return v.slice(0,20000);
    if (typeof v==='boolean' || v===null) return v;
    return undefined; }
  const isoDay=v=>{ const s=str(v,40); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s : ''; };

  /* ---------- canale del rivelatore: il formato della tappa I3 (app/channels-core.js) ----------
     f.channel è un testo («DAD1A 254/4 nm ref 360/100 nm»); AcchChannels.parseChannel lo legge in {det, wl, bw, ref, ex, em, extracted}.
     Nelle voci della libreria il canale si salva come lo stesso testo normalizzato (formatChannel). Si accetta anche il testo di ChemStation
     («DAD1 A, Sig=220,4 Ref=off») e, per i file della prima versione di questa tappa, l'oggetto {detector, lambda, bandwidth, reference}. */
  const Ch=()=>(typeof self!=='undefined' && self.AcchChannels) || (typeof window!=='undefined' && window.AcchChannels) || (typeof require==='function' ? require('./channels-core.js') : null);
  function parseChannel(c){
    if (!c) return null;
    if (typeof c==='object'){ if ('det' in c || 'wl' in c) return c;   // già letto
      const L=num(c.lambda), B=num(c.bandwidth), R=c.reference==='off'?'ref off':num(c.reference)!=null?`ref ${num(c.reference)}/${num(c.refBandwidth)!=null?num(c.refBandwidth):0} nm`:'';
      c=[str(c.detector,40), L!=null?`${L}${B!=null?'/'+B:''} nm`:'', R].filter(Boolean).join(' '); }
    const o=Ch().parseChannel(String(c));
    return o.det || o.wl!=null || o.ex!=null ? o : null;
  }
  function channelText(c){ const o=parseChannel(c); return o ? Ch().formatChannel(o) : ''; }
  const detType=d=>{ const m=/^(DAD|MWD|VWD|FLD|RID|ELSD|PDA|UV|TUV)/i.exec(String(d||'')); return m?m[1].toUpperCase():''; };
  /* confronto canale salvato / canale del file (decisione del coordinatore): rivelatore e λ obbligatori, banda e riferimento solo se presenti
     in entrambi. Un rivelatore generico nella voce («DAD», «UV») si confronta con il tipo del file; uno preciso («DAD1A») deve coincidere. */
  function channelCompare(saved, seen){
    const a=parseChannel(saved), b=parseChannel(seen), out={ok:true, unverified:[], diff:[]};
    if (!a) return out;
    if (a.det){ const generic=!/\d/.test(a.det); if (!b || !b.det){ out.ok=false; out.diff.push('det'); out.missing=true; }
      else if (generic ? detType(a.det)!==detType(b.det) : a.det.replace(/\s+/g,'').toUpperCase()!==b.det.replace(/\s+/g,'').toUpperCase()){ out.ok=false; out.diff.push('det'); } }
    for (const k of ['wl','ex','em']){ if (a[k]==null) continue; if (!b || b[k]==null){ out.ok=false; out.diff.push(k); out.missing=true; } else if (Math.abs(a[k]-b[k])>0.5){ out.ok=false; out.diff.push(k); } }
    if (a.bw!=null){ if (!b || b.bw==null) out.unverified.push('bw'); else if (Math.abs(a.bw-b.bw)>1e-9){ out.ok=false; out.diff.push('bw'); } }
    if (a.ref!=null){ if (!b || b.ref==null) out.unverified.push('ref'); else if (JSON.stringify(a.ref)!==JSON.stringify(b.ref)){ out.ok=false; out.diff.push('ref'); } }
    if (a.extracted!==!!(b&&b.extracted) && b){ out.ok=false; out.diff.push('extracted'); }   // estratto dal .uv senza riferimento: non è il segnale .ch
    return out;
  }

  /* ---------- strumento: {brand, model, detector, serial} e riconoscimento dall'intestazione ---------- */
  // moduli Agilent più comuni: il codice del rivelatore dice anche la serie dello strumento
  const AGILENT_MODULES={G4212A:['DAD','1290 Infinity'],G4212B:['DAD','1260 Infinity'],G1315D:['DAD','1260 Infinity'],G1315C:['DAD SL','1200'],G1315B:['DAD','1100/1200'],G1315A:['DAD','1100'],G1314F:['VWD','1260 Infinity'],G1314E:['VWD','1260 Infinity'],G1314B:['VWD','1100/1200'],G1321B:['FLD','1260 Infinity'],G1321A:['FLD','1100/1200'],G1362A:['RID','1260 Infinity'],
    G7115A:['DAD WR','1260 Infinity II'],G7117C:['DAD HS','1260 Infinity II'],G7114A:['VWD','1260 Infinity II'],G7121A:['FLD','1260 Infinity II'],G7162A:['RID','1260 Infinity II'],G7117A:['DAD FS','1290 Infinity II'],G7117B:['DAD','1290 Infinity II'],G7114B:['VWD','1290 Infinity II']};
  const MODELS=[
    [/(?:Agilent|Hewlett[\s-]?Packard|\bHP)\s*(?:Technologies\s*)?(1100|1120|1200|1220|1260|1290)(?:\s*(Infinity(?:\s*(?:III|II))?))?/i, m=>['Agilent', m[1]+(m[2]?' '+m[2].replace(/\s+/g,' '):'')]],
    [/(?<![A-Za-z0-9])(1260|1290)\s+Infinity(?:\s*(III|II))?/i, m=>['Agilent', m[1]+' Infinity'+(m[2]?' '+m[2]:'')]],
    [/Waters\s*(Alliance(?:\s*e?\d{4})?|Acquity\s*\w*|Arc|e2695)/i, m=>['Waters', m[1]]],
    [/Shimadzu\s*(LC-\w+|Nexera[\w\s-]*?|Prominence[\w\s-]*?|IRSpirit|IRTracer-?\d*|IRAffinity-?\w*|EDX-\w+)(?=[\s,;]|$)/i, m=>['Shimadzu', m[1].trim()]],
    [/(?:Thermo(?:\s*Fisher)?(?:\s*Scientific)?|Dionex)\s*(Vanquish\s*\w*|UltiMate\s*3000|Nicolet\s*i[SN]\d+|Nicolet\s*\d+|Niton\s*XL\w+|DXR\d*\w*)/i, m=>['Thermo', m[1].replace(/\s+/g,' ')]],
    [/Bruker\s*(ALPHA(?:\s*II)?|Tensor\s*(?:\d+|II)|INVENIO\s*\w?|Vertex\s*\d+\w?|LUMOS\s*II?|Senterra\s*II?|BRAVO|MultiRAM|Tracer\s*[\w-]+|M4\s*Tornado|M6\s*Jetstream|S1\s*TITAN|ELIO|ARTAX|S2\s*PUMA|S8\s*TIGER)/i, m=>['Bruker', m[1].replace(/\s+/g,' ')]],
    [/PerkinElmer\s*(Spectrum\s*(?:Two|3|100|400|One)|Frontier|Lambda\s*\d+)/i, m=>['PerkinElmer', m[1]]],
    [/(?:Agilent\s*)?(Cary\s*\d+)/i, m=>['Agilent', m[1]]],
    [/Renishaw\s*(inVia(?:\s*Qontor)?|Virsa)/i, m=>['Renishaw', m[1]]],
    [/Horiba\s*(LabRAM\s*(?:HR\s*Evolution|Soleil|Odyssey|HR|Aramis))/i, m=>['Horiba', m[1]]],
    [/(?:Olympus|Evident)\s*(Vanta\s*\w*|Delta\s*\w*)/i, m=>['Evident', m[1]]],
    [/Hitachi\s*(X-MET\s*\d+)/i, m=>['Hitachi', m[1]]]
  ];
  function normTxt(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,' ').trim(); }
  function cleanInstrument(i){ i=i&&typeof i==='object'?i:{}; return {brand:str(i.brand,80).trim(), model:str(i.model,120).trim(), detector:str(i.detector,120).trim(), serial:str(i.serial,80).trim()}; }
  function instrumentText(i){ i=cleanInstrument(i); const head=[i.brand, i.model].filter(Boolean).join(' '); return [head, i.detector].filter(Boolean).join(' · ')+(i.serial?` (S/N ${i.serial})`:''); }
  /* righe dell'intestazione → strumento, metodo, colonna, canale. «evidence» dice da quali righe viene ogni dato */
  function recognize(lines, fileName){
    const L=(Array.isArray(lines)?lines:String(lines||'').split(/\r?\n/)).slice(0,400).map(l=>String(l).slice(0,500)), all=L.join('\n'), out={brand:'', model:'', detector:'', serial:'', method:'', column:'', channel:null, software:'', evidence:[]};
    const field=re=>{ for (const l of L){ const m=re.exec(l); if (m && m[1].trim()) return [m[1].trim(), l.trim()]; } return null; };
    const ev=(k,l)=>out.evidence.push({field:k, line:String(l).slice(0,160)});
    let f;
    if (/ChemStation/i.test(all)) out.software='ChemStation'; else if (/OpenLab|OpenLAB/i.test(all)) out.software='OpenLab'; else if (/Empower/i.test(all)) out.software='Empower'; else if (/LabSolutions/i.test(all)) out.software='LabSolutions'; else if (/Chromeleon/i.test(all)) out.software='Chromeleon'; else if (/OPUS/.test(all)) out.software='OPUS'; else if (/OMNIC/i.test(all)) out.software='OMNIC';
    // modello: prima i campi espliciti, poi qualsiasi riga
    const instF=field(/^\s*#*\s*(?:Instrument(?:\s*(?:name|model|type))?|Model(?:\s*name)?|System(?:\s*name)?|Acq\.?\s*Instrument|Spectrometer|##?\s*SPECTROMETER\/DATA SYSTEM)\s*[:=;\t]\s*(.+)$/i);
    const tryModel=(t,l)=>{ for (const [re,fn] of MODELS){ const m=re.exec(t); if (m){ const [b,mo]=fn(m); out.brand=b; out.model=mo.trim(); ev('model', l); return true; } } return false; };
    if (!(instF && tryModel(instF[0], instF[1]))) for (const l of L){ if (tryModel(l,l)) break; }
    // moduli Agilent (G4212B…): rivelatore e serie
    for (const l of L){ const m=[...l.matchAll(/(?<![A-Za-z0-9])(G[1-7]\d{3}[A-F])(?![A-Za-z0-9])/g)].find(q=>AGILENT_MODULES[q[1]]); if (m){ const [d,ser]=AGILENT_MODULES[m[1]]; out.detector=`${d} ${m[1]}`; ev('detector', l); if (!out.model){ out.brand='Agilent'; out.model=ser; ev('model', l); } else if (!out.brand) out.brand='Agilent'; break; } }
    if (!out.detector && (f=field(/^\s*#*\s*Detector(?:\s*(?:name|type|model))?\s*[:=;\t]\s*(.+)$/i))){ out.detector=f[0].replace(/\s*,?\s*Sig\s*=.*$/i,'').slice(0,80); ev('detector', f[1]); }
    // canale: riga del segnale (ChemStation/OpenLab) o nome del file
    for (const l of L){ if (/Sig\s*=\s*\d{3}/i.test(l)){ out.channel=channelText(l)||null; ev('channel', l); break; } }
    if (!out.channel && (f=field(/^\s*#*\s*(?:Signal|Channel|Wavelength)\s*[:=;\t]\s*(.+)$/i))){ out.channel=channelText(f[0])||null; if (out.channel) ev('channel', f[1]); }
    if (!out.channel && fileName){ const c=parseChannel(String(fileName)); if (c && c.det) { out.channel=channelText(c); ev('channel', fileName); } }
    if (!out.detector && out.channel){ const t=detType((parseChannel(out.channel)||{}).det); if (t) out.detector=t; }
    if ((f=field(/^\s*#*\s*(?:Acq\.?\s*Method|Acquisition\s*Method|Instrument\s*Method|Method(?:\s*Name)?|Method\s*file)\s*[:=;\t]\s*(.+)$/i))){ out.method=f[0].split(/[\\/]/).filter(Boolean).pop().replace(/\s+\(.*$/,'').slice(0,120); ev('method', f[1]); }
    if ((f=field(/^\s*#*\s*(?:Serial\s*(?:number|no\.?|#)?|S\/N|Instrument\s*serial(?:\s*number)?)\s*[:=;\t]\s*(\S.+)$/i))){ out.serial=f[0].slice(0,60); ev('serial', f[1]); }
    if ((f=field(/^\s*#*\s*Column(?:\s*(?:description|name|type))?\s*[:=;\t]\s*(.+)$/i))){ out.column=f[0].slice(0,160); ev('column', f[1]); }
    out.found=!!(out.model || out.detector);
    return out;
  }
  /* due strumenti: 'same' (stesso modello e rivelatore), 'compatible' (dati mancanti da una parte), 'different' */
  function instrumentCompare(a, b){
    a=cleanInstrument(a); b=cleanInstrument(b); const why=[];
    const nums=s=>(normTxt(s).match(/\d{3,4}/g)||[]), gen=s=>/\b(iii|ii)\b/.exec(normTxt(s)), modCode=s=>{ const m=/G[1-7]\d{3}[A-F]/i.exec(s||''); return m?m[0].toUpperCase():''; };
    const typ=s=>{ const m=/\b(DAD|VWD|MWD|FLD|RID|ELSD|PDA|UV|MS|ATR|DTGS|MCT|CCD|SDD)\b/i.exec(s||''); return m?m[1].toUpperCase():''; };
    if (!a.model && !a.detector && !b.model && !b.detector) return {level:'unknown', why:[]};
    if (a.brand && b.brand && normTxt(a.brand)!==normTxt(b.brand)) why.push('brand');
    if (a.model && b.model){ const na=nums(a.model), nb=nums(b.model); if ((na.length && nb.length && na[0]!==nb[0]) || (!na.length && !nb.length && normTxt(a.model)!==normTxt(b.model))) why.push('model');
      else { const ga=gen(a.model), gb=gen(b.model); if ((ga?ga[1]:'')!==(gb?gb[1]:'') && (ga||gb)) why.push('model'); } }
    if (a.detector && b.detector){ const ca=modCode(a.detector), cb=modCode(b.detector); if (ca && cb ? ca!==cb : (typ(a.detector) && typ(b.detector) && typ(a.detector)!==typ(b.detector))) why.push('detector'); }
    if (a.serial && b.serial && normTxt(a.serial)!==normTxt(b.serial)) why.push('serial');
    if (why.length) return {level:'different', why};
    const full=x=>x.model && x.detector;
    return {level: full(a) && full(b) ? 'same' : 'compatible', why:[]};
  }

  /* ---------- documento della libreria ---------- */
  function newId(prefix){ const r=Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4); return (prefix||'lib')+'-'+r; }
  function slug(s){ return normTxt(s).replace(/\s+/g,'-').slice(0,40) || 'libreria'; }
  function cleanCal(c){
    if (!c || typeof c!=='object') return null;
    const o={kind:c.kind==='rf'?'rf':'line', slope:num(c.slope), intercept:num(c.intercept), sa:num(c.sa), sb:num(c.sb), syx:num(c.syx), srel:num(c.srel), srelDf:int(c.srelDf,null), n:int(c.n,null), r2:num(c.r2), xm:num(c.xm), ym:num(c.ym), sxx:num(c.sxx), df:int(c.df,null), lod:num(c.lod), loq:num(c.loq),
      range:Array.isArray(c.range)&&c.range.length===2&&num(c.range[0])!=null&&num(c.range[1])!=null ? [Math.min(num(c.range[0]),num(c.range[1])), Math.max(num(c.range[0]),num(c.range[1]))] : null,
      areaUnit:str(c.areaUnit,40), concUnit:str(c.concUnit,40), date:isoDay(c.date), standardLot:str(c.standardLot,120), normalized:c.normalized===true, source:str(c.source,40)||'taratura', uStd:num(c.uStd), measure:c.measure==='height'?'height':'area', rrf:num(c.rrf), alt:c.alt&&typeof c.alt==='object'?clean(c.alt):undefined};
    if (o.slope==null || o.slope===0) return o.rrf!=null ? o : null;
    if (o.alt===undefined) delete o.alt;
    return o;
  }
  // finestra di tR: un numero (± min) o un intervallo {from, to} della fonte, che diventa la semiampiezza attorno a tR
  function winOf(w, x){ if (w && typeof w==='object'){ const a=num(w.from), b=num(w.to); if (a!=null && b!=null) return x!=null ? Math.max(Math.abs(b-x), Math.abs(x-a)) : Math.abs(b-a)/2; return null; } return num(w); }
  function cleanEntry(e){
    if (!e || typeof e!=='object') return null;
    const o={id:str(e.id,80)||newId('v'), rev:int(e.rev,1), modifiedAt:str(e.modifiedAt,40), name:str(e.name,200).trim(), x:num(e.x!=null?e.x:e.tR), window:winOf(e.window, num(e.x!=null?e.x:e.tR)),
      rrt:num(e.rrt), rrtRef:str(e.rrtRef,80), channel:channelText(e.channel)||null, method:str(e.method,160), column:str(e.column,200),
      integration:e.integration&&num(e.integration.a)!=null&&num(e.integration.b)!=null ? {a:Math.min(num(e.integration.a),num(e.integration.b)), b:Math.max(num(e.integration.a),num(e.integration.b))} : null,
      cal:cleanCal(e.cal), profile:PROFILES.includes(e.profile)?e.profile:'', notes:str(e.notes,4000), source:e.source&&typeof e.source==='object'?{citation:str(e.source.citation,800), doi:str(e.source.doi,120), note:str(e.source.note,800)}:null,
      chart:Array.isArray(e.chart)?e.chart.filter(p=>p&&num(p.k)!=null).slice(-500).map(p=>({date:isoDay(p.date), k:num(p.k)})):[], warnings:Array.isArray(e.warnings)?e.warnings.filter(w=>typeof w==='string').slice(0,20).map(w=>w.slice(0,600)):[]};
    if (e.deleted===true) o.deleted=true;
    if (o.window!=null) o.window=Math.abs(o.window);
    if (!o.name && !o.deleted) return null;
    return o;
  }
  const DEF_THR={ricerca:{dev:10, diff:5, drift:5}, esplorativa:{dev:15, diff:8, drift:null}};
  const MAX_THR={ricerca:{dev:15, diff:8, drift:8}, esplorativa:{dev:20, diff:12, drift:null}};
  function cleanThresholds(t, profile){ const d=DEF_THR[profile]||DEF_THR.ricerca, m=MAX_THR[profile]||MAX_THR.ricerca, o={};
    for (const k of ['dev','diff','drift']){ const v=t?num(t[k]):null; o[k]= v==null || d[k]==null ? d[k] : Math.min(Math.max(v, 0.1), m[k]); }
    return o; }
  /* documento valido e pulito. Le voci senza nome si scartano e lo si dice (warnings) */
  function normalize(doc){
    if (!doc || typeof doc!=='object' || Array.isArray(doc)) throw libError('invalid', 'non è un oggetto');
    if (doc.schema && /draft-acchiappaspettri-library/.test(doc.schema)) doc=fromDraft(doc);
    if (doc.format!==FORMAT) throw libError('not-a-library', 'formato '+String(doc.format));
    const v=+doc.formatVersion; if (!(v>=1)) throw libError('invalid', 'formatVersion');
    if (v>VERSION && !(+doc.minReaderVersion<=VERSION)) throw libError('newer-format', String(v));
    const warnings=[]; const ents=Array.isArray(doc.entries)?doc.entries.slice(0,MAX_ENTRIES):[];
    const entries=[]; const seen=new Set();
    for (const e of ents){ const c=cleanEntry(e); if (!c){ warnings.push('entry-dropped'); continue; } if (seen.has(c.id)){ c.id=newId('v'); warnings.push('entry-id-renamed'); } seen.add(c.id); entries.push(c); }
    const profile=PROFILES.includes(doc.profile)?doc.profile:'ricerca';
    const out={format:FORMAT, formatVersion:VERSION, id:str(doc.id,80)||newId(), revision:int(doc.revision,1), name:str(doc.name,200).trim()||'Libreria', technique:str(doc.technique,20)||'hplc',
      instrument:cleanInstrument(doc.instrument), sampleType:str(doc.sampleType,120).trim(), methods:Array.isArray(doc.methods)?doc.methods.slice(0,50).filter(m=>m&&typeof m==='object').map(m=>({id:str(m.id,120), column:str(m.column,200), notes:str(m.notes,2000), aliases:Array.isArray(m.aliases)?m.aliases.filter(a=>typeof a==='string').slice(0,50).map(a=>a.slice(0,120)):[]})):[],
      author:str(doc.author,160), createdAt:str(doc.createdAt,40), modifiedAt:str(doc.modifiedAt,40), description:str(doc.description,4000), profile, thresholds:cleanThresholds(doc.thresholds, profile), thresholdReason:str(doc.thresholdReason,2000), reminderDays:Math.max(1, Math.min(3650, int(doc.reminderDays,180))),
      maintenance:Array.isArray(doc.maintenance)?doc.maintenance.filter(m=>m&&isoDay(m.date)).slice(0,500).map(m=>({date:isoDay(m.date), kind:str(m.kind,40), target:str(m.target,200), note:str(m.note,1000), author:str(m.author,160)})):[],
      // idoneità del sistema del giorno (SPEC «Mai sbloccabile»): una non superata blocca le tarature salvate di quel giorno
      suitability:Array.isArray(doc.suitability)?doc.suitability.filter(m=>m&&isoDay(m.date)&&typeof m.ok==='boolean').slice(0,2000).map(m=>({date:isoDay(m.date), ok:m.ok, note:str(m.note,1000), author:str(m.author,160)})):[],
      source:doc.source&&typeof doc.source==='object'?clean(doc.source):undefined, entries};
    if (out.source===undefined) delete out.source;
    // soglie allargate solo con una motivazione scritta (SPEC, «Modificabile»)
    const d=DEF_THR[profile]||DEF_THR.ricerca; if (!out.thresholdReason) for (const k of ['dev','diff','drift']) if (out.thresholds[k]!=null && d[k]!=null && out.thresholds[k]>d[k]){ out.thresholds[k]=d[k]; warnings.push('threshold-without-reason'); }
    Object.defineProperty(out,'warnings',{value:warnings, enumerable:false, writable:true});
    return out;
  }
  function libError(code, detail){ const e=new Error(code+(detail?': '+detail:'')); e.code=code; e.name='LibraryError'; return e; }
  function parse(text){ let j; try{ j=JSON.parse(typeof text==='string'?text.replace(/^﻿/,''):new TextDecoder().decode(text)); }catch(e){ throw libError('invalid-json'); } return normalize(clean(j)); }
  // JSON stabile (chiavi nell'ordine del documento normalizzato): lo stesso contenuto dà la stessa impronta
  function serialize(doc){ return JSON.stringify(normalize(JSON.parse(JSON.stringify(doc))), null, 1)+'\n'; }
  function hashOf(doc){ return sha256(typeof doc==='string' ? doc : serialize(doc)); }
  function create(o){ o=o||{}; const now=new Date().toISOString();
    const ins=cleanInstrument(o.instrument), st=str(o.sampleType,120).trim();
    return normalize({format:FORMAT, formatVersion:VERSION, id:o.id||('lib-'+slug([ins.brand,ins.model,ins.detector,st].filter(Boolean).join(' '))+'-'+Math.random().toString(36).slice(2,6)), revision:1, name:o.name||defaultName(ins, st), technique:o.technique||'hplc', instrument:ins, sampleType:st,
      methods:o.methods||[], author:o.author||'', createdAt:now, modifiedAt:now, description:o.description||'', profile:o.profile||'ricerca', entries:o.entries||[]}); }
  function defaultName(ins, st){ const i=cleanInstrument(ins), head=[i.brand, i.model].filter(Boolean).join(' '), det=i.detector?i.detector.split(/\s+/)[0]:''; return [[head,det].filter(Boolean).join(' · '), st].filter(Boolean).join(' — ') || 'Libreria'; }
  /* modelli vuoti per tecnica: nessuna voce, solo i campi da riempire (REQUISITO punto 6) */
  const TEMPLATES={hplc:{technique:'hplc', xUnit:'min', fields:['tR','window','rrt','channel','method','column','slope','intercept','unit']}, ftir:{technique:'ftir', xUnit:'cm-1', fields:['x','window','measure','slope']}, raman:{technique:'raman', xUnit:'cm-1', fields:['x','window','measure','slope']}, xrf:{technique:'xrf', xUnit:'keV', fields:['x','window','measure','slope']}, uv:{technique:'uv', xUnit:'nm', fields:['x','window','measure','slope']}};
  function template(technique){ return create({technique: TEMPLATES[technique] ? technique : 'hplc'}); }

  /* aggiunge o aggiorna una voce: revisione della voce e della libreria +1, data. Una voce con lo stesso nome e canale si aggiorna (non si duplica) */
  function upsert(lib, entry, opt){
    opt=opt||{}; const now=opt.now||new Date().toISOString(); const e=cleanEntry(Object.assign({}, entry, {modifiedAt:now}));
    if (!e) throw libError('invalid', 'voce');
    const same=x=>!x.deleted && (x.id===e.id || (normTxt(x.name)===normTxt(e.name) && channelText(x.channel)===channelText(e.channel) && (x.method||'')===(e.method||'')));
    const i=lib.entries.findIndex(same);
    if (i>=0){ const old=lib.entries[i]; e.id=old.id; e.rev=old.rev+1; if (!entry.chart) e.chart=old.chart; lib.entries[i]=e; }
    else { if (!entry.id) e.id=newId('v'); e.rev=1; lib.entries.push(e); }
    lib.revision++; lib.modifiedAt=now; return e;
  }
  function removeEntry(lib, id, opt){ const e=lib.entries.find(x=>x.id===id); if (!e) return false; const now=(opt&&opt.now)||new Date().toISOString();
    // resta come «tolta» (lapide): un'altra copia che ha ancora la voce non la fa ricomparire all'unione
    Object.keys(e).forEach(k=>{ if (!['id','rev','name'].includes(k)) delete e[k]; }); e.deleted=true; e.rev++; e.modifiedAt=now; lib.revision++; lib.modifiedAt=now; return true; }
  const liveEntries=lib=>lib.entries.filter(e=>!e.deleted);

  /* ---------- unione voce per voce (DECISIONE-PO §7) ----------
     base = libreria com'era quando l'abbiamo letta (può mancare), mine = la nostra, theirs = quella trovata sul disco.
     Restituisce {merged, conflicts:[{id, kind:'entry'|'meta', field?, mine, theirs}], auto:[…]}. Con conflitti merged non va scritto finché l'utente non sceglie (resolve). */
  const META=['name','technique','instrument','sampleType','methods','author','description','profile','thresholds','thresholdReason','reminderDays','maintenance','suitability'];
  const canon=v=>JSON.stringify(v===undefined?null:v);
  function entryCanon(e){ if (!e) return 'null'; const c=Object.assign({}, e); delete c.modifiedAt; delete c.rev; return canon(c); }
  function merge(base, mine, theirs){
    mine=normalize(JSON.parse(JSON.stringify(mine))); theirs=normalize(JSON.parse(JSON.stringify(theirs))); base=base?normalize(JSON.parse(JSON.stringify(base))):null;
    if (mine.id!==theirs.id) throw libError('different-library', mine.id+' / '+theirs.id);
    const conflicts=[], auto=[], out=JSON.parse(JSON.stringify(mine));
    for (const k of META){ const m=canon(mine[k]), t=canon(theirs[k]); if (m===t) continue; const b=base?canon(base[k]):null;
      // registri (manutenzioni, idoneità): si aggiungono soltanto, quindi si uniscono senza conflitto
      if (k==='maintenance' || k==='suitability'){ const seen=new Set(), all=[]; for (const x of (mine[k]||[]).concat(theirs[k]||[])){ const c=canon(x); if (!seen.has(c)){ seen.add(c); all.push(x); } } all.sort((x,y)=>String(x.date).localeCompare(String(y.date))); out[k]=all; auto.push({kind:'meta', field:k, took:'union'}); continue; }
      if (base && m===b){ out[k]=JSON.parse(JSON.stringify(theirs[k])); auto.push({kind:'meta', field:k, took:'theirs'}); }
      else if (base && t===b){ /* modificato solo da noi */ }
      else conflicts.push({kind:'meta', id:'#'+k, field:k, mine:mine[k], theirs:theirs[k]}); }
    const by=l=>new Map((l?l.entries:[]).map(e=>[e.id,e])), M=by(mine), T=by(theirs), B=by(base), ids=[...new Set([...M.keys(), ...T.keys()])];
    const entries=[];
    for (const id of ids){ const m=M.get(id), t=T.get(id), b=B.get(id);
      if (m && !t){ if (base && b && entryCanon(b)===entryCanon(m)){ auto.push({kind:'entry', id, took:'theirs-removed'}); continue; } entries.push(m); continue; }   // l'altro l'ha tolta del tutto (senza lapide) e noi non l'avevamo cambiata
      if (t && !m){ if (base && b && entryCanon(b)===entryCanon(t)){ entries.push(t); auto.push({kind:'entry', id, took:'kept'}); continue; } entries.push(t); auto.push({kind:'entry', id, took:'theirs-new'}); continue; }
      if (entryCanon(m)===entryCanon(t)){ entries.push(m.rev>=t.rev?m:t); continue; }
      if (b){ if (entryCanon(b)===entryCanon(m)){ entries.push(t); auto.push({kind:'entry', id, took:'theirs'}); continue; } if (entryCanon(b)===entryCanon(t)){ entries.push(m); continue; } }
      else if (!base){ // nessuna base (importazione): la revisione più alta e più recente vince solo se l'altra è un suo antenato evidente (revisione più bassa e data precedente)
        const newer=(x,y)=>x.rev>y.rev && String(x.modifiedAt||'')>=String(y.modifiedAt||'');
        if (newer(t,m)){ entries.push(t); auto.push({kind:'entry', id, took:'theirs-newer'}); continue; }
        if (newer(m,t)){ entries.push(m); auto.push({kind:'entry', id, took:'mine-newer'}); continue; } }
      entries.push(m); conflicts.push({kind:'entry', id, name:m.name||t.name, mine:m, theirs:t}); }
    out.entries=entries; out.revision=Math.max(mine.revision, theirs.revision)+1; out.modifiedAt=new Date().toISOString();
    return {merged:normalize(out), conflicts, auto};
  }
  /* scelte dell'utente: choices[id]='mine'|'theirs' per ogni conflitto. Senza una scelta per ciascuno: errore, niente scrittura */
  function resolve(result, choices){
    const out=JSON.parse(JSON.stringify(result.merged));
    for (const c of result.conflicts){ const ch=choices&&choices[c.id]; if (ch!=='mine' && ch!=='theirs') throw libError('unresolved', c.id);
      if (c.kind==='meta'){ out[c.field]=JSON.parse(JSON.stringify(ch==='mine'?c.mine:c.theirs)); continue; }
      const i=out.entries.findIndex(e=>e.id===c.id), pick=JSON.parse(JSON.stringify(ch==='mine'?c.mine:c.theirs)); pick.rev=Math.max(c.mine.rev, c.theirs.rev)+1; if (i>=0) out.entries[i]=pick; else out.entries.push(pick); }
    return normalize(out);
  }

  /* ---------- copie di conflitto di OneDrive (e simili) in una cartella ----------
     files = [{name, id?}]. Una copia è un file che ha il nome di un altro più «-NOMEPC», «-NOMEPC-2», « (1)» o «conflict», oppure lo stesso id di libreria di un altro file. */
  function conflictCopies(files){
    const stem=n=>String(n).replace(/\.acchlib(\.json)?$/i,'').replace(/\.json$/i,''), list=files.map(f=>({f, s:stem(f.name)})), out=[];
    for (const a of list){
      const orig=list.find(b=>b!==a && a.s.length>b.s.length && a.s.startsWith(b.s) && /^(?:-[^\s.\\/]{1,40}(?:-\d{1,3})?| \(\d{1,3}\)|[ _-]?(?:conflict|conflitto|copia|copy)[^\\/]*)$/i.test(a.s.slice(b.s.length)));
      if (orig) out.push({name:a.f.name, of:orig.f.name, reason:'name'}); }
    // stesso id con nomi non collegati: l'originale è quello che ha già copie per nome, altrimenti il nome più corto
    const isCopy=new Set(out.map(c=>c.name)), hasCopies=new Set(out.map(c=>c.of)), groups={};
    for (const a of list) if (a.f.id && !isCopy.has(a.f.name)) (groups[a.f.id]=groups[a.f.id]||[]).push(a);
    for (const g of Object.values(groups)){ if (g.length<2) continue; const orig=g.find(a=>hasCopies.has(a.f.name)) || g.slice().sort((x,y)=>x.s.length-y.s.length)[0];
      for (const a of g) if (a!==orig) out.push({name:a.f.name, of:orig.f.name, reason:'same-id'}); }
    return out;
  }
  // estensione delle librerie: .acchlib (decisione del Capo Progetto, doppio clic su tutti i sistemi); il contenuto è il JSON acchlib 1 e i .acchlib.json si leggono ancora
  const EXT='.acchlib', isLibName=n=>/\.acchlib(\.json)?$/i.test(String(n||''));
  function fileNameFor(lib){ return slug(lib.name)+EXT; }

  /* ---------- scelta della libreria per uno spettro ----------
     libs = [{lib, origin}]. ins = strumento confermato o riconosciuto; st = tipo di campione; technique.
     Esito: {pick, match:'exact'|'instrument-only'|'none', others, warn}. Una libreria di un altro strumento non è mai proposta come giusta. */
  function choose(libs, o){
    o=o||{}; const st=normTxt(o.sampleType), tech=o.technique||'hplc';
    const rows=(libs||[]).filter(x=>x && x.lib && (x.lib.technique||'hplc')===tech).map(x=>{ const c=instrumentCompare(x.lib.instrument, o.instrument); return Object.assign({}, x, {ins:c, stOk:!!st && normTxt(x.lib.sampleType)===st}); });
    const good=rows.filter(r=>r.ins.level==='same' || r.ins.level==='compatible');
    const exact=good.filter(r=>r.stOk).sort((a,b)=>(a.ins.level==='same'?0:1)-(b.ins.level==='same'?0:1) || (b.lib.modifiedAt||'').localeCompare(a.lib.modifiedAt||''));
    if (exact.length) return {pick:exact[0], match:'exact', others:rows.filter(r=>r!==exact[0]), ambiguous:exact.length>1, missing:false};
    const wrong=rows.filter(r=>r.ins.level==='different' && r.stOk);
    return {pick:null, match:good.length?'instrument-only':'none', others:rows, wrongInstrument:wrong, missing:true};
  }
  /* voce della libreria per un picco del cromatogramma: dentro la finestra di tR, la più vicina; con RRT se c'è il picco di riferimento */
  function matchEntries(lib, peaks, opt){
    opt=opt||{}; const xs=(peaks||[]).map(p=>typeof p==='number'?p:p.x).filter(Number.isFinite), out=[];
    const live=liveEntries(lib), defW=opt.defaultWindow||0.1;
    const refShift=(()=>{ // RRT: se la voce di riferimento è trovata, le altre si cercano a RRT × tR del riferimento
      const m={}; for (const e of live){ if (!e.rrt || !e.rrtRef) continue; const r=live.find(q=>q.id===e.rrtRef); if (!r || r.x==null) continue; const w=r.window||defW; const hit=xs.filter(x=>Math.abs(x-r.x)<=w).sort((a,b)=>Math.abs(a-r.x)-Math.abs(b-r.x))[0]; if (hit!=null) m[e.id]=e.rrt*hit; } return m; })();
    // ogni picco va a una sola voce: le coppie (voce, picco) dentro la finestra si assegnano dalla più vicina (in unità di finestra)
    const cand=[]; for (const e of live){ if (e.x==null) continue; const w=e.window||defW, x0=refShift[e.id]!=null?refShift[e.id]:e.x;
      for (const x of xs) if (Math.abs(x-x0)<=w) cand.push({e, x, x0, d:Math.abs(x-x0)/w}); }
    cand.sort((a,b)=>a.d-b.d); const usedE=new Set(), usedX=new Set(), hit=new Map();
    for (const c of cand){ if (usedE.has(c.e.id) || usedX.has(c.x)) continue; usedE.add(c.e.id); usedX.add(c.x); hit.set(c.e.id, c.x); }
    for (const e of live){ if (e.x==null) continue; const x0=refShift[e.id]!=null?refShift[e.id]:e.x, h=hit.has(e.id)?hit.get(e.id):null;
      out.push({entry:e, x:h, expected:x0, found:h!=null, byRrt:refShift[e.id]!=null}); }
    return out;
  }

  /* ---------- la bozza della letteratura (schema draft) → acchlib, per importarla come libreria dell'utente ---------- */
  // LOD/LOQ della fonte nell'unità della concentrazione della voce (µM → mM se serve)
  function lodIn(v, u, cu){ v=num(v); if (v==null) return null; if (/^u|µ|μ/i.test(String(u||'')) && cu==='mM') return v/1000; return v; }
  // l'età della taratura si conta dalla data della fonte (SPEC): l'anno della citazione, al 1° gennaio se non c'è altro
  function pubDate(c){ const m=/(?:;|\.)\s*((?:19|20)\d{2})\s*;/.exec(String(c||'')) || /\b((?:19|20)\d{2})\b/.exec(String(c||'')); return m ? m[1]+'-01-01' : ''; }
  function fromDraft(d){
    const E=(d.entries||[]).filter(e=>e && e.name), first=E.find(e=>e.instrument)||{}, st=(E.find(e=>e.sampleType)||{}).sampleType||'';
    const entries=E.map((e,i)=>{ const c=e.calibration||{}, src=e.source||{}, lam=num(e.lambda);
      const quant=c.slope!=null && num(e.tR)!=null && /READ IN FULL TEXT/i.test(e.status||'') && e.technique==='hplc' && /ijerph/i.test(src.doi||'');
      const cu=/umol|µmol|μmol/i.test(c.units||'') ? 'µmol/L' : /\bmM\b/.test(c.units||'') ? 'mM' : '';
      const rg=/([\d.]+)\s*[-–]\s*([\d.]+)/.exec(String(c.range||'')), range=rg?[+rg[1], +rg[2]]:null;
      return {id:'v'+String(i+1).padStart(3,'0'), rev:1, name:e.name, x:num(e.tR), window:e.window!=null?e.window:0.1, channel:lam?`${lam} nm`:null, method:(e.method&&e.method.id)||'', column:(e.method&&e.method.column)||'',
        cal:quant?{kind:'line', slope:num(c.slope), intercept:num(c.intercept), sb:num(c.slopeSD), sa:num(c.interceptSD), r2:num(c.r2), lod:lodIn(c.lod, c.lodUnits, cu), loq:lodIn(c.loq, c.loqUnits, cu), areaUnit:'mAU·s', concUnit:cu, range, n:null, date:pubDate(src.citation)||isoDay(d.generated)||'', source:'letteratura', alt:e.altCalibration||undefined}:null,
        source:{citation:str(src.citation,800), doi:str(src.doi,120), note:str(src.location,800)}, notes:[e.notes, e.integration, quant?'fonte: letteratura, stesso modello di strumento dichiarato dall\'utente; unità dell\'area assunta mAU·s':'' ].filter(Boolean).join(' · ')}; });
    const ins=first.instrument||{};
    return {format:FORMAT, formatVersion:VERSION, id:'lib-'+slug('agilent 1260 dad '+st), revision:1, technique:'hplc',
      name:defaultName({brand:'Agilent', model:'1260 Infinity', detector:'DAD'}, st), instrument:{brand:ins.brand||'Agilent', model:'1260 Infinity', detector:'DAD G4212B', serial:''}, sampleType:st,
      methods:[...new Set(E.map(e=>e.method&&e.method.id).filter(Boolean))].map(id=>({id, column:(E.find(e=>e.method&&e.method.id===id).method.column)||''})),
      author:'', createdAt:isoDay(d.generated), modifiedAt:isoDay(d.generated), description:str(d.disclaimer,4000), profile:'ricerca', entries};
  }

  return {FORMAT, VERSION, PROFILES, SAMPLE_SUGGESTIONS, TEMPLATES, DEF_THR, MAX_THR, sha256, parse, normalize, serialize, hashOf, create, template, defaultName, upsert, removeEntry, liveEntries,
    EXT, isLibName, merge, resolve, conflictCopies, fileNameFor, choose, matchEntries, recognize, instrumentCompare, instrumentText, cleanInstrument, parseChannel, channelText, channelCompare, fromDraft, normTxt, libError, newId};
});
