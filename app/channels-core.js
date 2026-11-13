// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* HPLC multicanale (tappa I3): lettura di tutti i canali dei file dei rivelatori e descrizione normalizzata del canale.
   Modulo puro, senza interfaccia: funziona nel browser, nell'app desktop e in Node (test). È la specifica che il lettore Rust (I5) deve eguagliare.
   Formati: Agilent ChemStation / OpenLab .ch (un segnale per file) e .uv (spettri DAD), Waters Empower .arw, Shimadzu LabSolutions ASCII
   (più blocchi e più campioni). I file di testo ChemStation/OpenLab con più segnali (colonne o blocchi) li divide index.html con il nucleo.
   DEDOTTO: i formati binari Agilent non sono documentati dal produttore. La disposizione usata qui viene dalle descrizioni pubbliche
   delle librerie libere che li leggono (rainbow-api, Aston) ed è provata solo su file sintetici costruiti allo stesso modo:
   va confermata su file veri dell'Agilent 1260 con DAD G4212B (docs/LIMITAZIONI.md). */
(function(root, factory){
  if (typeof module==='object' && module.exports) module.exports=factory();
  else root.AcchChannels=factory();
})(typeof self!=='undefined' ? self : this, function(){
  'use strict';

  /* ---------- canale: rivelatore, λ, banda, riferimento ----------
     Forma normalizzata (f.channel, campo «channel» del progetto), in inglese e con il punto decimale:
       <rivelatore>[ <λ>[/<banda>] nm][ ex <λex> nm em <λem> nm][ ref <λ>/<banda> nm | ref off][ extracted]
     Esempi: «DAD1A 254/4 nm ref 360/100 nm», «VWD1A 220 nm», «Det A-Ch1 254 nm», «PDA Ch1 254/1.2 nm», «FLD1A ex 230 nm em 330 nm»,
     «RID1A», «UV 280/4 nm extracted» (cromatogramma ricavato dagli spettri DAD di un .uv). */
  const num=s=>{ const v=parseFloat(String(s).replace(',','.')); return Number.isFinite(v) ? v : null; };
  const okWl=v=>v!=null && v>=190 && v<=1100;
  const fmtN=v=>String(+(+v).toPrecision(6));
  function detOf(t){
    let d='', sc=0, m; const re=/(?<![A-Za-z0-9])(DAD|MWD|VWD|FLD|RID|ELSD|PDA|ADC|CAD|TUV)(?:[\s_-]?(\d)(?!\d))?(?:[\s_-]?([A-H])(?![A-Za-z]))?/gi;
    while ((m=re.exec(t))){ const nx=t.slice(m.index+m[0].length), gen=!m[2]&&!m[3]; if (/^[A-Za-z]/.test(nx) && !/^Ch/i.test(nx)) continue; if (gen && /^\d/.test(nx)) continue; if (m[3] && !m[2] && /^\d/.test(nx)) continue;   // «DAD G4212B» è il modello del rivelatore, non il segnale G
      let k=(m[2]?1:0)+(m[3]?1:0)+1; if (gen && /^(DAD|MWD|VWD|PDA|TUV)$/i.test(m[1])) k=0;   // rivelatore UV generico senza numero né lettera: è lo strumento
      if (k>sc){ sc=k; d=(m[1]+(m[2]||'')+(m[3]||'')).toUpperCase(); } }
    // Waters: «PDA Ch1», «2998 Ch1», «2489 ChA», «TUV ChA»
    if ((m=/(?<![A-Za-z0-9])(PDA|TUV|UV|2998|2996|2489|2487|W2489|W2998)\s*Ch(?:annel)?\s*([1-9A-D])(?![A-Za-z0-9])/i.exec(t))) d=m[1].toUpperCase()+' Ch'+m[2].toUpperCase();
    if (!d && (m=/(?<![A-Za-z0-9])UV[_ ]?VIS[_ ]?(\d)(?![0-9])/i.exec(t))) d='UV_VIS_'+m[1];
    if (!d && (m=/(?<![A-Za-z])Det(?:ector)?\s+([A-Z])(?![a-z])(?:[\s_-]*Ch\s?(\d))?/i.exec(t))) d='Det '+m[1].toUpperCase()+(m[2]?'-Ch'+m[2]:'');
    if (!d && (m=/(?<![A-Za-z0-9])Ch(?:annel)?[\s_]?([A-D1-9])(?![A-Za-z0-9])/i.exec(t))) d='Ch'+m[1].toUpperCase();
    if (!d && /^\s*UV(?![A-Za-z])/.test(t)) d='UV';
    return d;
  }
  // dal testo dello strumento o dalla forma normalizzata: {det, wl, bw, ref, ex, em, extracted}
  function parseChannel(text){
    const t=String(text||''), o={det:detOf(t), wl:null, bw:null, ref:null, ex:null, em:null, extracted:/\bextracted\b/i.test(t)}; let m;
    if ((m=/Sig\s*=\s*(\d{3}(?:\.\d+)?)(?:\s*,\s*(\d+(?:\.\d+)?))?/i.exec(t))){ o.wl=num(m[1]); if (m[2]!=null) o.bw=num(m[2]); }   // Agilent: «Sig=254,4» = λ 254, banda 4
    if ((m=/Ref\s*=\s*(off|(\d{3}(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?))/i.exec(t))) o.ref=/off/i.test(m[1]) ? 'off' : {wl:num(m[2]), bw:num(m[3])};
    if ((m=/\bref\s+(off|(\d{3}(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*nm)/i.exec(t)) && !o.ref) o.ref=/off/i.test(m[1]) ? 'off' : {wl:num(m[2]), bw:num(m[3])};
    if ((m=/\bEx(?:citation)?\s*[=:]?\s*(\d{3}(?:[.,]\d+)?)/i.exec(t))) o.ex=num(m[1]);
    if ((m=/\bEm(?:ission)?\s*[=:]?\s*(\d{3}(?:[.,]\d+)?)/i.exec(t))) o.em=num(m[1]);
    if (o.wl==null && (m=/(\d{3}(?:\.\d+)?)\s*nm\s*@\s*(\d+(?:[.,]\d+)?)\s*nm/i.exec(t))){ o.wl=num(m[1]); o.bw=num(m[2]); }   // Waters: «254nm@1.2nm»
    if (o.wl==null){ const noRef=t.replace(/\bref\s+\d{3}(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?\s*nm/ig,'').replace(/Ref\s*=\s*\d+\s*,\s*\d+/ig,'');
      if ((m=/(?<![\d.,])(\d{3}(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*nm/i.exec(noRef))){ o.wl=num(m[1]); o.bw=num(m[2]); }   // forma normalizzata «254/4 nm»
      else if ((m=/(?:Wavelength|Lambda|λ)\s*(?:\(nm\))?\s*[:=\t ]\s*(\d{3}(?:[.,]\d+)?)/i.exec(noRef))) o.wl=num(m[1]);
      else if ((m=/(?<![\d.,]|\d\s*(?:[-–~]|to)\s*|(?:ex|em)\s*)(\d{3}(?:[.,]\d+)?)\s?nm(?![a-z])(?!\s*(?:[-–~]|to)\s*\d)/i.exec(noRef))) o.wl=num(m[1]); }
    if (o.em!=null && o.ex!=null){ o.wl=null; o.bw=null; }
    if (!okWl(o.wl)){ o.wl=null; o.bw=null; }
    if (o.bw!=null && !(o.bw>=0 && o.bw<=400)) o.bw=null;
    if (o.ref && o.ref!=='off' && !(okWl(o.ref.wl) && o.ref.bw>=0)) o.ref=null;
    return o;
  }
  function formatChannel(o){ if (!o) return ''; const p=[];
    if (o.det) p.push(o.det);
    if (o.ex!=null && o.em!=null) p.push(`ex ${fmtN(o.ex)} nm em ${fmtN(o.em)} nm`);
    else if (o.wl!=null) p.push(fmtN(o.wl)+(o.bw!=null?'/'+fmtN(o.bw):'')+' nm');
    if (o.ref==='off') p.push('ref off'); else if (o.ref) p.push(`ref ${fmtN(o.ref.wl)}/${fmtN(o.ref.bw)} nm`);
    if (o.extracted) p.push('extracted');
    return p.join(' '); }
  // etichetta breve, la stessa di chanOf in index.html («DAD1A 254 nm»): serve a raggruppare i canali nella taratura
  function shortLabel(o){ if (!o) return ''; const w=o.em!=null ? o.em : o.wl; return [o.det, w!=null ? fmtN(w)+' nm' : ''].filter(Boolean).join(' '); }
  const canon=t=>formatChannel(parseChannel(t));

  /* ---------- utilità ---------- */
  const latin1=(u8,a,b)=>{ let s=''; for (let i=a;i<b && i<u8.length;i++) s+=String.fromCharCode(u8[i]); return s; };
  function pstr(u8, off, wide){ if (off>=u8.length) return ''; const n=u8[off]; let s='';
    if (wide){ for (let i=0;i<n;i++){ const p=off+1+2*i; if (p+1>=u8.length) break; s+=String.fromCharCode(u8[p]|(u8[p+1]<<8)); } }
    else s=latin1(u8, off+1, off+1+n);
    return s.replace(/\0+$/,'').trim(); }
  const finiteAll=a=>{ for (let i=0;i<a.length;i++) if (!Number.isFinite(a[i])) return false; return true; };

  /* ---------- Agilent ChemStation / OpenLab .ch: un segnale per file (DEDOTTO) ----------
     intestazione: stringa di versione «179» (ChemStation C.01 e OpenLab, testi UTF-16) o «130»/«30» (revisioni vecchie, testi ASCII);
     0x116 numero di punti (int32 BE), 0x11A/0x11E tempo iniziale e finale in ms (int32 BE; alcune revisioni float32 BE);
     testi: campione, operatore, data, metodo, unità, segnale («DAD1 A, Sig=254,4 Ref=360,100»);
     dati da 0x1800 (179) o 0x1000 (130) o 0x400 (30): delta a segmenti (byte 0x10, conteggio, int16 BE, -32768 = valore assoluto int32 BE)
     oppure double little-endian; fattore di scala double BE a 0x127C (179) o 0x284 (130/30). */
  const CH_LAYOUT={
    '179':{wide:true, data:0x1800, scale:0x127C, s:{sample:0x35A, operator:0x758, date:0x957, method:0xA0E, instrument:0xC15, units:0x104C, signal:0x1075}},
    '181':{wide:true, data:0x1800, scale:0x127C, s:{sample:0x35A, operator:0x758, date:0x957, method:0xA0E, instrument:0xC15, units:0x104C, signal:0x1075}},
    '130':{wide:false, data:0x1000, scale:0x284, s:{sample:0x18, operator:0x94, date:0xB2, method:0xE4, units:0x244, signal:0x254}},
    '30':{wide:false, data:0x400, scale:0x284, s:{sample:0x18, operator:0x94, date:0xB2, method:0xE4, units:0x244, signal:0x254}}
  };
  function agilentVersion(u8){ const n=u8[0]; if (!(n>=1 && n<=3) || u8.length<0x200) return ''; const v=latin1(u8,1,1+n); return /^\d+$/.test(v) ? v : ''; }
  function deltaDecode(dv, off, end, le){ const out=[]; let acc=0, p=off;
    while (p+2<=end){ const head=dv.getUint8(p), cnt=dv.getUint8(p+1); if (head!==0x10) break; p+=2;
      for (let i=0;i<cnt;i++){ if (p+2>end) return out; const d=dv.getInt16(p,le); p+=2; if (d===-32768){ if (p+4>end) return out; acc=dv.getInt32(p,le); p+=4; } else acc+=d; out.push(acc); } }
    return out; }
  function chTimes(dv, n){ const a=dv.getInt32(0x11A,false), b=dv.getInt32(0x11E,false); let t0=a/60000, t1=b/60000;
    if (!(b>a && b-a<1e9)){ const fa=dv.getFloat32(0x11A,false), fb=dv.getFloat32(0x11E,false); if (Number.isFinite(fa) && Number.isFinite(fb) && fb>fa){ t0=fa/60000; t1=fb/60000; } else return null; }
    const xs=new Float64Array(n); for (let i=0;i<n;i++) xs[i]=n>1 ? t0+(t1-t0)*i/(n-1) : t0; return xs; }
  function readCh(buf){ const u8=new Uint8Array(buf), ver=agilentVersion(u8), L=CH_LAYOUT[ver]; if (!L || u8.length<=L.data) return null;
    const dv=new DataView(buf), head={}; for (const k in L.s) head[k]=pstr(u8, L.s[k], L.wide);
    let raw; if (u8[L.data]===0x10) raw=deltaDecode(dv, L.data, u8.length, false);
    else { const n=Math.floor((u8.length-L.data)/8); raw=new Float64Array(n); for (let i=0;i<n;i++) raw[i]=dv.getFloat64(L.data+8*i, true); }
    if (raw.length<5) return null;
    let k=u8.length>=L.scale+8 ? dv.getFloat64(L.scale,false) : 1; if (!Number.isFinite(k) || k===0 || Math.abs(k)>1e12) k=1;
    const ys=Float64Array.from(raw, v=>v*k), xs=chTimes(dv, ys.length); if (!xs || !finiteAll(ys)) return null;
    return {format:'agilent-ch', version:ver, head, xs, ys}; }

  /* ---------- Agilent ChemStation .uv: spettri del DAD nel tempo (DEDOTTO) ----------
     intestazione «131» (o «31»); 0x116 numero di spettri (int32 BE); da 0x1002 (131) o 0x202 (31) uno spettro dopo l'altro:
     lunghezza del blocco (uint16 LE), tempo in ms (uint32 LE), λ iniziale, finale e passo ×20 (uint16 LE), 8 byte, poi i valori
     a delta (int16 LE, -32768 = valore assoluto int32 LE) in 1/2000 di mAU. */
  function readUv(buf){ const u8=new Uint8Array(buf), ver=agilentVersion(u8); if (ver!=='131' && ver!=='31') return null;
    const dv=new DataView(buf), wide=ver==='131', n=dv.getInt32(0x116,false), start=ver==='131'?0x1002:0x202; if (!(n>0 && n<1e7)) return null;
    const times=new Float64Array(n), scans=[]; let pos=start, lo=Infinity, hi=-Infinity, step=Infinity;
    for (let i=0;i<n;i++){ if (pos+20>u8.length) return null; const len=dv.getUint16(pos,true); if (len<20) return null;
      const t=dv.getUint32(pos+2,true)/60000, a=dv.getUint16(pos+6,true)/20, b=dv.getUint16(pos+8,true)/20, s=dv.getUint16(pos+10,true)/20; if (!(s>0) || !(b>=a)) return null;
      const v=[]; let p=pos+20, acc=0; const end=Math.min(u8.length, pos+len);
      while (p+2<=end){ const d=dv.getInt16(p,true); p+=2; if (d===-32768){ if (p+4>end) break; acc=dv.getInt32(p,true); p+=4; } else acc+=d; v.push(acc/2000); }
      times[i]=t; scans.push({a, s, v}); lo=Math.min(lo,a); hi=Math.max(hi,a+s*(v.length-1)); step=Math.min(step,s); pos+=len; }
    const head={}; for (const [k,o] of Object.entries({sample:0x35A, operator:0x758, date:0x957, method:0xA0E})) head[k]=pstr(u8, wide?o:{sample:0x18,operator:0x94,date:0xB2,method:0xE4}[k], wide);
    return {format:'agilent-uv', version:ver, head, times, scans, wl:{lo, hi, step}}; }
  // cromatogramma alla λ (media dei valori nella banda; banda 0 = λ più vicina)
  function uvExtract(uv, wl, bw){ const half=(bw||0)/2, ys=new Float64Array(uv.times.length);
    for (let i=0;i<uv.scans.length;i++){ const q=uv.scans[i]; let s=0, c=0;
      if (half>0){ const j0=Math.max(0,Math.ceil((wl-half-q.a)/q.s-1e-9)), j1=Math.min(q.v.length-1,Math.floor((wl+half-q.a)/q.s+1e-9)); for (let j=j0;j<=j1;j++){ s+=q.v[j]; c++; } }
      if (!c){ const j=Math.round((wl-q.a)/q.s); if (j>=0 && j<q.v.length){ s=q.v[j]; c=1; } }
      ys[i]=c ? s/c : NaN; }
    return ys; }
  // λ proposte per un .uv senza altri canali: il massimo dello spettro medio, arrotondato al nanometro
  function uvSuggest(uv){ const q0=uv.scans[0]; if (!q0) return []; const acc=new Float64Array(q0.v.length); let k=0;
    for (const q of uv.scans){ if (q.a!==q0.a || q.s!==q0.s || q.v.length!==q0.v.length) continue; for (let j=0;j<acc.length;j++) acc[j]+=q.v[j]; k++; }
    if (!k) return []; let jm=0; for (let j=1;j<acc.length;j++) if (acc[j]>acc[jm]) jm=j; return [Math.round(q0.a+q0.s*jm)]; }

  /* ---------- Waters Empower .arw (testo, DEDOTTO) ----------
     righe tra virgolette separate da tab: nomi dei campi, poi i valori («SampleName», «Channel», …), poi le righe tempo-valore.
     Più canali o più campioni nello stesso file: le coppie di righe tra virgolette si ripetono. */
  const tsvQ=l=>l.split('\t').map(x=>x.trim().replace(/^"(.*)"$/,'$1').trim());
  const numRow=l=>{ const t=l.trim(); if (!t || /^"/.test(t)) return null; const c=t.split(/\t|;|\s+(?=[-+\d.])/).filter(Boolean); if (c.length<2) return null;
    const a=num(c[0]), b=num(c[1]); return a!=null && b!=null && /^[-+]?[\d.,]+(e[-+]?\d+)?$/i.test(c[0].trim()) ? [a,b] : null; };
  function readArw(text){ const lines=text.split(/\r\n|\n|\r/); if (!lines.slice(0,3).some(l=>/^"/.test(l.trim()))) return null;
    const blocks=[]; let i=0;
    while (i<lines.length){ const l=lines[i].trim(); if (!/^"/.test(l)){ i++; continue; }
      const q=[]; while (i<lines.length && /^"/.test(lines[i].trim())){ q.push(tsvQ(lines[i])); i++; }
      const rec={}; for (let k=0;k+1<q.length;k+=2) q[k].forEach((key,j)=>{ if (key) rec[key]=q[k+1][j]!=null?q[k+1][j]:''; });
      const xs=[], ys=[]; while (i<lines.length && !/^"/.test(lines[i].trim())){ const r=numRow(lines[i]); if (r){ xs.push(r[0]); ys.push(r[1]); } i++; }
      blocks.push({rec, meta:q.map(r=>r.join('\t')), xs, ys}); }
    if (!blocks.length || !blocks.some(b=>b.xs.length>=5)) return null;
    const pick=(rec,re)=>{ for (const k of Object.keys(rec)) if (re.test(k)) return rec[k]; return ''; };
    const samples=new Map();
    blocks.forEach((b,ix)=>{ const sn=pick(b.rec,/^sample\s*name$/i)||pick(b.rec,/^sample/i), ch=pick(b.rec,/^channel(\s*(name|description))?$/i)||pick(b.rec,/^ch(annel)?/i), wl=pick(b.rec,/wavelength/i), det=pick(b.rec,/^detector/i);
      const info=parseChannel([ch, wl&&!/nm/i.test(wl)?wl+' nm':wl, det].filter(Boolean).join(' ')); if (!info.det && !info.wl && ch) info.det=String(ch).slice(0,30);
      const key=sn||''; if (!samples.has(key)) samples.set(key, {name:sn, channels:[]});
      samples.get(key).channels.push({info, raw:ch, xs:b.xs, ys:b.ys, meta:b.meta.concat(['Waters Empower .arw', 'Time (min)\tIntensity']), units:pick(b.rec,/unit/i)}); });
    const S=[...samples.values()];
    return {format:'waters-arw', declared:blocks.length, samples:S.map(s=>({sampleKey:S.length>1?(s.name||null):null, name:s.name, channels:s.channels}))}; }

  /* ---------- Shimadzu LabSolutions, esportazione ASCII (DEDOTTO) ----------
     sezioni «[Header]», «[Sample Information]», «[LC Chromatogram(Detector A-Ch1)]», «[PDA Multi Chromatogram(…)]»…;
     in ogni cromatogramma: «# of Points», «Intensity Units», «Intensity Multiplier», «Wavelength(nm)», poi «R.Time (min)» e i dati.
     Un «[Header]» nuovo apre un altro campione (esportazione di più dati in un file). Le tracce di stato (pressione…) non sono canali. */
  function readShimadzu(text){ if (!/^\[Header\]\s*$/m.test(text.slice(0,20000)) || !/^\[[^\]\n]*Chromatogram[^\]\n]*\]\s*$/mi.test(text)) return null;
    const lines=text.split(/\r\n|\n|\r/), samples=[]; let cur=null, sec=null, notes=[], declared=0, status=[];
    const kv=l=>{ const c=l.split(/\t|,(?=\S)/); return [c[0].trim(), (c[1]||'').trim()]; };
    const newSample=()=>{ cur={name:'', file:'', channels:[]}; samples.push(cur); };
    for (let i=0;i<lines.length;i++){ const l=lines[i].replace(/\s+$/,''), m=/^\[(.+)\]$/.exec(l.trim());
      if (m){ const name=m[1].trim(); if (/^Header$/i.test(name) || !cur) newSample();
        if (/Chromatogram/i.test(name) && !/Status\s*Trace/i.test(name)){ declared++; const paren=(/\((.*)\)/.exec(name)||[])[1]||name; sec={name, paren, kv:{}, xs:[], ys:[], data:false, meta:[l.trim()]}; cur.channels.push(sec); }
        else { if (/Status\s*Trace/i.test(name)) status.push((/\((.*)\)/.exec(name)||[])[1]||name); sec={name, kv:{}, other:true}; }
        continue; }
      if (!sec || !l.trim()) continue;
      if (sec.other){ const [k,v]=kv(l); if (/^Sample\s*Name$/i.test(k)) cur.name=v; if (/^Data\s*File\s*Name$/i.test(k)) cur.file=v.split(/[\\/]/).pop(); continue; }
      const r=numRow(/\t/.test(l) ? l : l.replace(/,/g,'\t'));   // esportazione CSV: virgola come separatore
      if (sec.data && r){ sec.xs.push(r[0]); sec.ys.push(r[1]); continue; }
      if (/^R\.?\s*Time/i.test(l.trim())){ sec.data=true; sec.meta.push(l.trim()); continue; }
      if (!sec.data){ const [k,v]=kv(l); sec.kv[k]=v; sec.meta.push(l.trim()); } }
    const out=samples.filter(s=>s.channels.length).map(s=>{ const chs=s.channels.map(c=>{ const mult=num(c.kv['Intensity Multiplier']); const k=mult!=null && mult!==0 ? mult : 1;
        const wl=c.kv['Wavelength(nm)']||c.kv['Wavelength']||'', bw=c.kv['Bandwidth(nm)']||c.kv['Band Width(nm)']||'';
        const info=parseChannel(c.paren+(wl?' '+wl+(bw?'/'+bw:'')+' nm':'')); if (!info.det) info.det=c.paren.slice(0,30);
        const want=parseInt(c.kv['# of Points'],10);
        if (Number.isFinite(want) && want!==c.xs.length) notes.push({code:'points', channel:formatChannel(info), sample:s.name, declared:want, read:c.xs.length});
        return {info, raw:c.paren, xs:c.xs, ys:k===1?c.ys:c.ys.map(v=>v*k), meta:c.meta.concat(['Shimadzu LabSolutions ASCII']), units:c.kv['Intensity Units']||''}; });
      return {name:s.name||s.file, channels:chs}; });
    if (!out.some(s=>s.channels.some(c=>c.xs.length>=5))) return null;
    if (status.length) notes.push({code:'status', list:status});
    return {format:'shimadzu-ascii', declared, notes, samples:out.map(s=>({sampleKey:out.length>1?(s.name||null):null, name:s.name, channels:s.channels}))}; }

  /* ---------- lettore unico ----------
     restituisce {format, declared, notes, samples:[{sampleKey, name, channels:[{channel, label, info, xs, ys, meta, units}]}]} oppure null (file a un canale:
     lo legge il percorso di sempre). La λ estratta dagli spettri .uv si chiede con opt.uvWl (elenco di λ) e opt.uvBw. */
  function finish(r){ if (!r) return null; r.notes=r.notes||[];
    for (const s of r.samples){ s.channels=s.channels.filter(c=>c.xs.length>=5); s.channels.forEach((c,i)=>{ c.channel=formatChannel(c.info); c.label=shortLabel(c.info)||c.channel; c.xs=Float64Array.from(c.xs); c.ys=Float64Array.from(c.ys);
        if (!c.channel && s.channels.length>1){ c.channel='#'+(i+1); c.label=c.channel; } }); }   // canali senza nome nello stesso campione: si numerano nell'ordine del file
    // due canali con la stessa descrizione nello stesso campione (per esempio due blocchi senza nome): si numerano, non si fondono
    for (const s of r.samples){ const seen={}; for (const c of s.channels){ const k=c.channel; seen[k]=(seen[k]||0)+1; if (seen[k]>1){ c.channel=(k?k+' ':'')+'#'+seen[k]; c.label=(c.label?c.label+' ':'')+'#'+seen[k]; } } }
    r.read=r.samples.reduce((a,s)=>a+s.channels.length,0); return r; }
  function readBinary(buf, name){ const nm=String(name||'');
    if (/\.ch$/i.test(nm) || /^\.?(179|181|130|30)$/.test(agilentVersion(new Uint8Array(buf)))){ const c=readCh(buf); if (!c) return null;
      const info=parseChannel(c.head.signal||''); if (!info.det && !info.wl){ const fromName=parseChannel(nm.replace(/\.ch$/i,'')); info.det=fromName.det; info.wl=fromName.wl; }
      const meta=[`Agilent ChemStation .ch (${c.version})`, c.head.sample?'Sample Name: '+c.head.sample:'', c.head.signal?'Signal: '+c.head.signal:'', c.head.method?'Method: '+c.head.method:'', c.head.units?'Units: '+c.head.units:'', 'Time (min)'].filter(Boolean);
      return finish({format:'agilent-ch', declared:1, samples:[{sampleKey:null, name:c.head.sample, channels:[{info, raw:c.head.signal, xs:c.xs, ys:c.ys, meta, units:c.head.units}]}]}); }
    return null; }
  function readUvChannels(uv, wls, bw){ const chs=[]; for (const wl of wls){ const ys=uvExtract(uv, wl, bw); if (!finiteAll(ys)) continue;
      chs.push({info:{det:'UV', wl, bw:bw||null, ref:null, ex:null, em:null, extracted:true}, xs:uv.times.slice(), ys, meta:['Agilent ChemStation .uv ('+uv.version+'): cromatogramma dagli spettri DAD', uv.head.sample?'Sample Name: '+uv.head.sample:'', 'Time (min)'].filter(Boolean)}); }
    return finish({format:'agilent-uv', declared:wls.length, samples:[{sampleKey:null, name:uv.head.sample, channels:chs}]}); }
  function readText(text, name){ const nm=String(name||'');
    if (/\.arw$/i.test(nm) || /^"?Sample\s*Name"?\t/i.test(text.slice(0,200))){ const r=readArw(text); if (r) return finish(r); }
    const s=readShimadzu(text); if (s) return finish(s);
    return null; }
  // nomi delle colonne di un file di testo: la riga con lo stesso numero di celle dei dati, con le virgolette rispettate
  function headerNames(lines, nCols){ for (let k=lines.length-1;k>=0 && k>=lines.length-8;k--){ const h=String(lines[k]).replace(/^#\s*/,''); const sep=h.includes('\t')?'\t':h.includes(';')?';':',';
      const out=[]; let cur='', q=false; for (const ch of h){ if (ch==='"'){ q=!q; continue; } if (ch===sep && !q){ out.push(cur.trim()); cur=''; } else cur+=ch; } out.push(cur.trim());
      if (out.length===nCols && !out.every(x=>num(x)!=null)) return out; }
    return null; }
  // chiave della memoria di uno spettro in un progetto: il percorso, più campione e canale se il file ne ha più d'uno (I3)
  const memKey=(path, sampleKey, channel)=>(sampleKey==null && channel==null) ? String(path) : String(path)+'\u0000'+(sampleKey==null?'':sampleKey)+'\u0000'+(channel==null?'':channel);
  return {memKey, parseChannel, formatChannel, shortLabel, canon, readCh, readUv, uvExtract, uvSuggest, readArw, readShimadzu, readBinary, readUvChannels, readText, headerNames, finish, agilentVersion};
});
