// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I12, ricetta come script Python, parte «lettori»: scripts/ricetta-py/acch_lettori.py (concatenato dopo acch_ricetta.py) deve leggere
// i file come l'app. parse_bytes = parseBinary || parseText(decodeBuffer) di index.html; read_channels = i lettori di app/channels-core.js
// (.ch, .uv, .arw, Shimadzu) e textChannels (app/read-core.js dalla tappa I5, prima in index.html). Confronto di TUTTI i campi del risultato (xs, ys bit per bit, meta, reject,
// importIssue, ycol, nCols, colNames, blocchi e canali, thermal, epr, xrf…), su test/corpus/**, test/fixtures/** e file SINTETICI.
// Isoterme e chemisorbimento non sono trascritti: Python deve fermarsi con NonTrascritto ogni volta che l'app li riconosce.
// Si salta (e lo si dice) se python3 ≥ 3.10 manca; fallisce se il modulo Python manca.
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), os=require('os'), vm=require('vm'), {spawnSync}=require('child_process');
const ROOT=path.join(__dirname,'..','..');
const PYDIR=path.join(ROOT,'scripts','ricetta-py'), PYMOD=process.env.ACCH_PY_LETTORI ? path.resolve(process.env.ACCH_PY_LETTORI) : path.join(PYDIR,'acch_lettori.py');   // ACCH_PY_LETTORI: copia sabotata (il test deve fallire)
const PY=(()=>{ for (const c of [process.env.PYTHON, 'python3'].filter(Boolean)){ const r=spawnSync(c, ['-c','import sys; print(sys.version_info>=(3,10))'], {encoding:'utf8'}); if (r.status===0 && /True/.test(r.stdout)) return c; } return null; })();
const G=require('../fixtures/gen-canali.js'), CH=require('../../app/channels-core.js');

// nucleo di index.html in un contesto vm (come test/validation/core.js), con il fisisorbimento e textChannels (fuori dal blocco CORE)
function loadCore(){
  const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8'), a=html.indexOf('/*CORE-START*/'), b=html.indexOf('/*CORE-END*/');
  if (a<0 || b<0) throw new Error('index.html: nucleo non trovato');
  const ctx={console, Float64Array, Math, TextDecoder, Uint8Array, DataView, ArrayBuffer}; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT,'app','sorption-core.js'),'utf8'), ctx);
  vm.runInContext(html.slice(a,b), ctx);
  // textChannels dalla tappa I5 è in app/read-core.js (AcchRead), con gli stessi nomi globali del nucleo
  ctx.AcchChannels=CH; vm.runInContext(fs.readFileSync(path.join(ROOT,'app','read-core.js'),'utf8'), ctx); ctx.textChannels=ctx.AcchRead.textChannels;
  for (const n of ['parseText','parseBinary','decodeBuffer','sorpParse','textChannels']) if (typeof ctx[n]!=='function') throw new Error('manca '+n);
  return ctx;
}

// stessa codifica nei due linguaggi: numeri come String(v) (-0 a parte), testi con prefisso; campi undefined assenti
const DROP=new Set(['p','iso','chem','sorpGuided','chemGuided']);
function enc(v){ if (v===null || v===undefined) return null; if (typeof v==='number') return 'n:'+(Object.is(v,-0)?'-0':String(v)); if (typeof v==='string') return 's:'+v; if (typeof v==='boolean') return v;
  if (ArrayBuffer.isView(v) || Array.isArray(v)) return Array.from(v, enc);
  const o={}; for (const k of Object.keys(v)){ if (DROP.has(k) || v[k]===undefined) continue; o[k]=enc(v[k]); } return o; }
const PY_DRIVER=`
import json as _j
_DROP={'p','iso','chem','sorpGuided','chemGuided'}
def _enc(v):
    if v is None: return None
    if isinstance(v, bool): return v
    if isinstance(v, (int, float)): return 'n:' + ('-0' if (v == 0 and math.copysign(1.0, v) < 0) else js_str(v))
    if isinstance(v, str): return 's:' + v
    if isinstance(v, (list, tuple)): return [_enc(x) for x in v]
    return {k: _enc(x) for k, x in v.items() if k not in _DROP}
_T = _j.load(open(_TASKS, encoding='utf-8'))
with open(_OUT, 'w', encoding='utf-8') as _f:
    for _t in _T:
        _raw = open(_t['file'], 'rb').read()
        try:
            _r = parse_bytes(_raw, _t['name'], _t.get('opt')) if _t['kind'] == 'bytes' else read_channels(_raw, _t['name'], _t.get('opt'))
            _o = {'ok': _enc(_r)}
        except NonTrascritto as _e:
            _o = {'nt': str(_e)}
        except _RangeError:
            _o = {'range': True}
        except Exception:
            import traceback
            _o = {'err': traceback.format_exc()}
        _f.write(_j.dumps(_o) + '\\n')
`;

/* ---------- file sintetici ---------- */
function rng(seed){ let s=seed>>>0||1; return ()=>{ s=(Math.imul(s,1103515245)+12345)>>>0; return s/4294967296; }; }
function spa(o){ const n=o.n, info=0x200, off=0x400, b=Buffer.alloc(off+4*n+(o.extra||0)); b.write(o.title||'Campione SPA',30,'latin1');
  b[304]=2; b.writeUInt32LE(info,306); b[320]=3; b.writeUInt32LE(off,322); b.writeUInt32LE(o.size!=null?o.size:4*n,326); b[336]=1;
  b.writeUInt32LE(o.np!=null?o.np:n,info+4); b.writeUInt32LE(o.xu!=null?o.xu:1,info+8); b.writeUInt32LE(o.yu!=null?o.yu:17,info+12); b.writeFloatLE(o.fx,info+16); b.writeFloatLE(o.lx,info+20);
  for (let i=0;i<n;i++) b.writeFloatLE(o.y(i),off+4*i); return b; }
function opus(o){ const n=o.n, b=Buffer.alloc(0x800+4*n); b.writeUInt32LE(0xFEFE0A0A,0); let c=24; const dir=(type,chan,len,off)=>{ b[c]=type; b[c+1]=chan; b.writeInt32LE(len,c+4); b.writeInt32LE(off,c+8); c+=12; };
  const want=o.want||15; dir(want,o.chan||0,n,0x800); dir(want+16,o.chan||0,40,0x400);
  let p=0x400; const par=(nm,t,val)=>{ b.write(nm,p,'latin1'); b.writeUInt16LE(t,p+4); if (t===0){ b.writeUInt16LE(2,p+6); b.writeInt32LE(val,p+8); p+=12; } else if (t===1){ b.writeUInt16LE(4,p+6); b.writeDoubleLE(val,p+8); p+=16; } else { b.writeUInt16LE(4,p+6); b.write(val,p+8,'latin1'); p+=16; } };
  par('NPT',0,o.np!=null?o.np:n); par('FXV',1,o.fx); par('LXV',1,o.lx); if (o.csf!=null) par('CSF',1,o.csf); if (o.dxu!=null) par('DXU',2,o.dxu); b.write('END',p,'latin1');
  for (let i=0;i<n;i++) b.writeFloatLE(o.y(i),0x800+4*i); return b; }
// testi casuali: intestazioni, separatori, decimali, migliaia, blocchi, righe rovinate, canali, colonne in più
const HEADS=['# Sample: prova','Time (min)\tSignal (mAU)','Wavenumber (cm-1);Absorbance','##XUNITS=NM','XUNITS: 1/CM','Raman shift (cm-1)\tIntensity','Laser 785 nm','Wavelength (nm)\tIntensity',
  'Time (s),mAU','Retention time (s)\tDAD1 A','2theta\tcounts','Energy (eV)\tAbsorbance','Wavelength (µm)\tTransmittance','DAD1 A, Sig=254,4 Ref=360,100','DAD1 B, Sig=280,4 Ref=360,100',
  'Temperature (°C)\tWeight (%)','Temperature (°C)\tHeat Flow (mW)','Time (min)\tTemperature (°C)\tWeight (mg)','Field (G)\tIntensity','B (mT);EPR signal','x\ty\tz','Absorbance, Wavenumber',
  'mAU, Time','Instrument: Prova','DATA TYPE: UV/VIS SPECTRUM','Note finali','"Time","Value"','Signal 1: DAD1 A, Sig=254,4','Time\tA\tB\tC','Raman spectrum','Fluorescence emission','Wavenumber (cm-1)'];
function fmtNum(v, f, r){ let s=v.toFixed(f.dec); if (f.comma) s=s.replace('.',','); if (f.thou && Math.abs(v)>=1000){ const [i,d]=v.toFixed(f.dec).split('.'); const ii=i.replace(/\B(?=(\d{3})+(?!\d))/g, f.comma?'.':','); s=ii+(d?(f.comma?',':'.')+d:''); }
  if (f.sci && r()<0.5) s=v.toExponential(4); if (f.quote) s='"'+s+'"'; return s; }
function fuzzText(seed){ const r=rng(seed), pick=a=>a[Math.floor(r()*a.length)], L=[];
  const seps=['\t',';',',',' ','   ','\t '], sep=pick(seps), eol=pick(['\n','\r\n','\r']);
  const f={dec:Math.floor(r()*5), comma:sep!==','&&r()<0.25, thou:r()<0.12, sci:r()<0.1, quote:r()<0.08};
  for (let k=Math.floor(r()*4);k>0;k--) L.push(pick(HEADS));
  const nb=r()<0.7?1:1+Math.floor(r()*3), ncol=2+Math.floor(r()*(r()<0.6?1:3));
  for (let b=0;b<nb;b++){ const n=3+Math.floor(r()*(r()<0.2?20:400)), x0=pick([0,1,100,400,4000,8500,-5,0.5,950,200]), dx=pick([1,0.5,0.01,2,-1,-0.5,10,0.004,1.5]);
    if (b>0 && r()<0.6) L.push(pick(HEADS));
    const shuffle=r()<0.05, turn=r()<0.06, rows=[];
    for (let i=0;i<n;i++){ const x=turn&&i>n/2 ? x0+dx*(n-i) : x0+dx*i; const c=[fmtNum(x,f,r)]; for (let j=1;j<ncol;j++){ const y=j===1&&r()<0.02?NaN: (j===2&&r()<0.5? Math.round(r()*3) : 100*Math.sin(i/7+j)+r()*5); c.push(Number.isNaN(y)?'NaN':fmtNum(y,f,r)); }
      let line=c.join(sep); if (r()<0.01) line='x'+line; if (r()<0.01) line=c.slice(0,1).join(sep); if (r()<0.01) line=sep+line; if (r()<0.005) line=''; if (r()<0.004) line=pick(HEADS); rows.push(line); }
    if (shuffle) rows.sort(()=>r()-0.5);
    L.push(...rows); if (r()<0.2) L.push(''); }
  if (r()<0.3) L.push(pick(HEADS), '1'+sep+'2', '3'+sep+'4');
  return L.join(eol)+(r()<0.5?eol:''); }
function fuzzSpecial(seed){ const r=rng(seed), pick=a=>a[Math.floor(r()*a.length)], k=seed%6, n=20+Math.floor(r()*300);
  if (k===0){ // MCA a una colonna con taratura
    const L=[pick(['# MCA Channels: 512','<<PMCA SPECTRUM>>','Tube Anode: Rh','# Calibration1: 0 -0.100','HV: 40']), '# Calibration1: '+Math.floor(r()*50)+' '+(r()*2).toFixed(3), '# Calibration2: 900 '+(10+r()*5).toFixed(3), 'Live time = 30', 'Tube Anode: '+pick(['Rh','Ag','Xx','W'])];
    if (r()<0.4){ L.unshift('<<PMCA SPECTRUM>>'); L.push('<<CALIBRATION>>','LABEL - Channel','10 0.2','900 15.1','<<DATA>>'); }
    for (let i=0;i<Math.max(n,260);i++) L.push(String(r()<0.01?'x':Math.round(Math.abs(500*Math.exp(-(((i-150)/8)**2))+20*r()))));
    if (/<<DATA>>/.test(L.join())) L.push('<<END>>'); return L.join('\n'); }
  if (k===1){ // JCAMP AFFN o compresso, a volte rovinato
    const fx=pick([400,4000,0.5]), dx=pick([1,-1,0.25]), ys=Array.from({length:n},(_,i)=>Math.round(1000*Math.sin(i/9)+r()*20)), L=['##TITLE=sint','##JCAMP-DX=4.24','##XUNITS='+pick(['1/CM','HZ','NM']),'##YUNITS='+pick(['ABSORBANCE','TRANSMITTANCE','']),'##FIRSTX='+fx,'##LASTX='+(fx+dx*(n-1)),'##NPOINTS='+(r()<0.2?n+3:n),'##XFACTOR=1','##YFACTOR='+pick(['1','0.001'])];
    if (r()<0.3) L.push('##.OBSERVE FREQUENCY='+pick(['400.13','5000']));
    L.push('##XYDATA=(X++(Y..Y))'); const SQ='@ABCDEFGHI', SQn='abcdefghi', DF='%JKLMNOPQR', DFn='jklmnopqr', sq=v=>{ const s=String(Math.abs(v)); return (v<0?SQn[+s[0]-1]:SQ[+s[0]])+s.slice(1); }, df=v=>{ const s=String(Math.abs(v)); return v===0?'%':(v<0?DFn[+s[0]-1]:DF[+s[0]])+s.slice(1); };
    const comp=r()<0.5; for (let i=0;i<n;i+=8){ const seg=ys.slice(i,i+8); let line=String(fx+dx*i)+' ';
      if (comp){ line+=sq(seg[0]); for (let j=1;j<seg.length;j++) line+=df(seg[j]-seg[j-1]); } else line+=seg.join(' '); if (r()<0.03) line=line.replace(/\d$/,'?'); L.push(line); }
    L.push('##END='); return L.join('\r\n'); }
  if (k===2){ // TGA/DSC a colonne con nome
    const L=['Sample mass: 10,5 mg','Heating rate 10 K/min', pick(['Time (min)\tTemperature (°C)\tWeight (mg)','Temp (°C);Heat flow (mW)','Ts [K]\tTG [%]\tt [s]'])], m=L[2].split(/[\t;]/).length;
    for (let i=0;i<n;i++){ const T=25+i*(i>n*0.7?-0.5:1); const c=[i*0.1, T, 10-i*0.01].slice(0,m); L.push(c.map(v=>v.toFixed(3)).join(/;/.test(L[2])?';':'\t')); } return L.join('\n'); }
  if (k===3){ // EPR
    const L=['MWFQ 9.4 GHz', pick(['Field [G]\tIntensity','B_Field (mT)\tSignal','Field\tValue'])]; for (let i=0;i<n;i++) L.push((3300+i*0.5).toFixed(2)+'\t'+(Math.sin(i/5)*100).toFixed(3)); return L.join('\n'); }
  if (k===4){ // TopSpin
    const L=['# File created = Mon','# LEFT = 12.5 ppm. RIGHT = -1.5 ppm','#','# SIZE = '+n]; for (let i=0;i<n;i++) L.push(String(Math.round(1e5*Math.exp(-(((i-n/2)/5)**2))))); return L.join('\n'); }
  const L=['PE IR', 'ciao', '#GR', 'CM-1', '%T', '#DATA']; for (let i=0;i<n;i++) L.push((4000-i*2)+'\t'+(90-Math.random()*0).toFixed(2)); return L.join('\n'); }
function synthetic(){ const out=[], add=(name, data, opt)=>out.push({name, data:Buffer.isBuffer(data)?data:Buffer.from(data,'utf8'), opt});
  const A=G.chrom(600,0.01,[[2,40,0.05],[4,15,0.06]],0.5,3), B=G.chrom(600,0.01,[[2,10,0.05]],0.2,4);
  add('DAD1A.ch', G.writeCh({sample:'S1', signal:'DAD1 A, Sig=254,4 Ref=360,100', units:'mAU', method:'M.M', t0:0, t1:5.99, ys:A.ys}));
  add('dad1b.CH', G.writeCh({sample:'S1', signal:'DAD1 B, Sig=280,4 Ref=off', units:'mAU', t0:0, t1:5.99, ys:B.ys, encoding:'double'}));
  add('VWD1A.ch', G.writeCh({version:'130', sample:'S2', signal:'', units:'mAU', t0:0.5, t1:6, ys:A.ys}));
  add('FLD1A.ch', G.writeCh({version:'30', sample:'S3', signal:'FLD1 A, Ex=230, Em=330', t0:0, t1:3, ys:B.ys, scale:0.5}));
  add('senza-nome.bin', G.writeCh({sample:'S4', signal:'RID1A', t0:0, t1:1, ys:A.ys.slice(0,50)}));
  { const b=G.writeCh({sample:'S5', signal:'DAD1 C, Sig=230,8', t0:0, t1:5.99, ys:A.ys}); add('tronco.ch', b.subarray(0, 0x1800+700)); add('vuoto.ch', b.subarray(0, 0x1800+3)); const c=Buffer.from(b); c.writeInt32BE(0,0x11E); add('tempi.ch', c); }
  const times=Array.from({length:120},(_,i)=>i*0.05), spectra=times.map((t,i)=>Array.from({length:101},(_,j)=>Math.exp(-(((j-40)/12)**2))*(1+Math.exp(-(((t-3)/0.3)**2)))*50+(i%7)*0.01));
  const uv=G.writeUv({sample:'UV1', times, spectra, a:200, b:400, s:2});
  add('DAD1.uv', uv, {}); add('DAD1-b.uv', uv, {uvWl:[254,280,199,401], uvBw:4}); add('DAD1-c.uv', uv, {uvWl:[230.5], uvBw:0}); add('DAD1-d.uv', uv.subarray(0, 0x1002+3000), {}); add('x.uv', Buffer.alloc(100), {});
  add('w.arw', G.writeArw([Object.assign({sample:'MIX1', channel:'PDA Ch1 254nm@1.2nm'},G.chrom(300,0.01,[[1,0.3,0.05]],0.001,9)), Object.assign({sample:'MIX2', channel:'2998 Ch2 280 nm'},G.chrom(300,0.01,[[1,0.1,0.05]],0.001,10)), Object.assign({sample:'MIX2', channel:''},G.chrom(300,0.01,[[1,0.1,0.05]],0.001,11))]));
  add('s.txt', G.writeShimadzu([{sample:'A', status:true, channels:[Object.assign({name:'Detector A-Ch1', wl:254, mult:0.5},A), Object.assign({name:'Detector A-Ch2', wl:280, declare:5},B)]}, {sample:'B', channels:[Object.assign({name:'PDA Multi 1'},A)]}]));
  add('cols.csv', G.writeCsvCols(['DAD1 A, Sig=254,4 Ref=360,100','DAD1 B, Sig=280,4 Ref=360,100','Pressure'], [A,B,A]));
  add('cols2.csv', G.writeCsvCols(['VWD1 A 220 nm','FLD1 A Ex=230 Em=330'], [A,B]));
  add('blocchi.csv', G.writeCsvBlocks(['Signal 1: DAD1 A, Sig=254,4 Ref=360,100','Signal 2: DAD1 B, Sig=280,4 Ref=360,100'], [A,B])+'Peak table\r\n1,2.0,345\r\n2,4.0,99\r\n3,5,1\r\n');
  add('blocchi2.csv', G.writeCsvBlocks(['Segnale 1','Segnale 2'], [A,B]));
  const y=i=>1+Math.sin(i/20);
  add('a.spa', spa({n:500, fx:4000, lx:400, y})); add('b.SPA', spa({n:300, fx:400, lx:4000, yu:16, xu:2, y, title:''})); add('c.spa', spa({n:300, fx:400, lx:400, y})); add('d.spa', spa({n:300, fx:400, lx:4000, y, size:1e6}));
  add('e.spa', spa({n:50, fx:400, lx:4000, y:i=>i===3?NaN:1})); add('f.spa', Buffer.alloc(300));
  add('a.0', opus({n:400, fx:4000, lx:400, y})); add('b.1', opus({n:400, fx:400, lx:4000, y, want:7, csf:2, dxu:'MIC'})); add('c.0', opus({n:400, fx:400, lx:4000, y, csf:0, dxu:'WN'}));
  add('d.0', opus({n:400, fx:400, lx:4000, y, np:5})); add('e.0', opus({n:400, fx:400, lx:4000, y}).subarray(0,1000));
  for (let s=1;s<=420;s++) add('fuzz'+s+'.txt', fuzzText(s));
  for (let s=1;s<=60;s++) add('spec'+s+'.txt', fuzzSpecial(s));
  // lo stesso testo in UTF-16 con BOM e con caratteri fuori dal piano di base nell'intestazione
  add('u16.txt', Buffer.concat([Buffer.from([0xFF,0xFE]), Buffer.from('Time (min)\tSignal 😀 (mAU)\n'+A.xs.map((t,i)=>t+'\t'+A.ys[i]).join('\n'),'utf16le')]));
  add('cp1252.txt', Buffer.concat([Buffer.from('Wellenlänge (nm);Absorption\n','latin1'), Buffer.from(Array.from({length:50},(_,i)=>(300+i)+';'+(i/10).toFixed(1).replace('.',',')).join('\n'))]));
  return out; }
function walk(d){ const out=[]; for (const e of fs.readdirSync(d,{withFileTypes:true})){ const p=path.join(d,e.name); if (e.isDirectory()) out.push(...walk(p)); else out.push(p); } return out; }

test('lettori in Python (acch_lettori.py) identici a quelli dell\'app: corpus, fixture e file sintetici', {skip:!PY && 'python3 ≥ 3.10 non trovato: confronto SALTATO', timeout:900000}, ()=>{
  assert.ok(fs.existsSync(PYMOD), 'manca '+PYMOD);
  const C=loadCore(), tmp=fs.mkdtempSync(path.join(os.tmpdir(),'acch-lett-'));
  try{
    const inputs=[];
    for (const p of walk(path.join(ROOT,'test','corpus')).concat(walk(path.join(ROOT,'test','fixtures')))) inputs.push({file:p, name:path.basename(p), rel:path.relative(ROOT,p)});
    synthetic().forEach((s,k)=>{ const f=path.join(tmp,'s'+k+'_'+s.name.replace(/[^\w.-]/g,'_')); fs.writeFileSync(f, s.data); inputs.push({file:f, name:s.name, rel:'sintetico/'+s.name, opt:s.opt}); });
    const ab=f=>{ const b=fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset+b.length); };
    const run=fn=>{ try{ return {ok:enc(fn())}; }catch(e){ if (e && e.name==='RangeError') return {range:true}; return {err:String(e && e.stack || e)}; } };
    const other=n=>/\.(xlsx|opju?)$/i.test(n);   // Excel e Origin: altri lettori dell'app (xlsxParse, origin-core): parse_bytes si ferma, read_channels dà None
    const jsChannels=(buf, name, opt)=>{ opt=opt||{}; if (other(name)) return null; if (/\.uv$/i.test(name)){ const uv=CH.readUv(buf); if (!uv) return null; return CH.readUvChannels(uv, opt.uvWl||CH.uvSuggest(uv), opt.uvBw!=null?opt.uvBw:4); }
      let mc=CH.readBinary(buf, name); if (mc) return mc; if (C.parseBinary(buf, name)) return null; const text=C.decodeBuffer(buf); mc=CH.readText(text, name); if (mc) return mc;
      const p=C.parseText(text); if (p.reject || p.xs.length<5) return null; return C.textChannels(text, p, name); };
    const tasks=[], want=[], sorp=[];
    // l'app legge il file come isoterma o chemisorbimento (lettore non trascritto): Python deve fermarsi con NonTrascritto
    const isSorp=q=>!!(q && (q.iso || q.chem || q.sorpGuided || q.chemGuided));
    for (const it of inputs){ const buf=ab(it.file); let hit=false; try{ hit=!C.parseBinary(buf, it.name) && isSorp(C.parseText(C.decodeBuffer(buf))); }catch(e){}
      const add=(kind, opt)=>{ tasks.push({file:it.file, name:it.name, kind, opt:opt||null, rel:it.rel}); sorp.push(kind==='bytes' ? (hit || other(it.name)) : (hit && !other(it.name)));
        want.push(kind==='bytes' ? run(()=>C.parseBinary(buf, it.name)||C.parseText(C.decodeBuffer(buf), opt||undefined)) : run(()=>jsChannels(buf, it.name, opt))); };
      add('bytes'); add('bytes', {keepLines:true, keepOrder:true}); add('chan', it.opt);
      const nC=want[want.length-3].ok && want[want.length-3].ok.nCols; const n=nC ? +nC.slice(2) : 0;
      if (n>2){ add('bytes', {ycol:2}); if (n>3) add('bytes', {ycol:n-1, keepLines:true}); } }
    fs.writeFileSync(path.join(tmp,'tasks.json'), JSON.stringify(tasks));
    const prog=fs.readFileSync(path.join(PYDIR,'acch_ricetta.py'),'utf8')+'\n'+fs.readFileSync(PYMOD,'utf8')+`\n_TASKS=${JSON.stringify(path.join(tmp,'tasks.json'))}\n_OUT=${JSON.stringify(path.join(tmp,'out.jsonl'))}\n`+PY_DRIVER;
    fs.writeFileSync(path.join(tmp,'p.py'), prog);
    const r=spawnSync(PY, ['-I', path.join(tmp,'p.py')], {encoding:'utf8', maxBuffer:1<<26}); assert.strictEqual(r.status, 0, r.stderr);
    const got=fs.readFileSync(path.join(tmp,'out.jsonl'),'utf8').trim().split('\n').map(l=>JSON.parse(l)); assert.strictEqual(got.length, tasks.length);
    let same=0, ntOk=0, ntExtra=[], nums=0, minLre=Infinity; const bad=[];
    const countNums=v=>{ if (typeof v==='string') return v.startsWith('n:')?1:0; if (Array.isArray(v)) return v.reduce((a,x)=>a+countNums(x),0); if (v && typeof v==='object') return Object.values(v).reduce((a,x)=>a+countNums(x),0); return 0; };
    // primo punto in cui due risultati divergono, con lo scarto relativo se sono numeri
    const diff=(a,b,p)=>{ if (JSON.stringify(a)===JSON.stringify(b)) return null; if (typeof a==='string' && typeof b==='string' && a.startsWith('n:') && b.startsWith('n:')){ const x=+a.slice(2), y=+b.slice(2), rel=Math.abs(x-y)/Math.max(Math.abs(x),Math.abs(y),1e-300); return {p, a, b, rel}; }
      if (a && b && typeof a==='object' && typeof b==='object'){ const ks=new Set([...Object.keys(a),...Object.keys(b)]); for (const k of ks){ const d=diff(a[k],b[k],p+'.'+k); if (d) return d; } } return {p, a:JSON.stringify(a).slice(0,200), b:JSON.stringify(b).slice(0,200)}; };
    tasks.forEach((t,k)=>{ const w=want[k], g=got[k];
      if (g.err) return bad.push(`${t.rel} [${t.kind} ${JSON.stringify(t.opt)}]: errore Python ${g.err.slice(-600)}`);
      if (g.nt){ if (sorp[k]) ntOk++; else ntExtra.push(t.rel); return; }
      if (sorp[k]) return bad.push(`${t.rel} [${t.kind}]: l'app la legge come isoterma o chemisorbimento, Python non si è fermato`);
      const d=diff(w,g,'');
      if (d){ if (d.rel!=null) minLre=Math.min(minLre, d.rel?-Math.log10(d.rel):99); bad.push(`${t.rel} [${t.kind} ${JSON.stringify(t.opt)}] ${d.p}: app ${d.a} · Python ${d.b}`+(d.rel!=null?` (relativo ${d.rel.toExponential(2)})`:'')); return; }
      same++; nums+=countNums(w); });
    const cov={}, seen=(k)=>{ cov[k]=(cov[k]||0)+1; }; want.forEach((w,k)=>{ const o=w.ok; if (!o) return seen(w.range?'RangeError':'null/errore'); if (tasks[k].kind==='chan'){ seen('canali:'+(o.format||'?')); return; }
      if (o.reject) seen('rifiuto'); if (o.thermal) seen('termico'); if (o.epr) seen('epr'); if (o.xrf) seen('xrf'); if (o.nmr) seen('topspin'); if (o.importBad) seen('avvisi'); if (o.unitInstr) seen('unità:'+o.unitInstr.slice(2));
      if (o.pe && o.pe!==false) seen('pe'); if (o.chSpans) seen('canali di testo'); if (o.importIssue && o.importIssue.thou!=='n:0') seen('migliaia'); if (o.importIssue && o.importIssue.dropped && o.importIssue.dropped!=='n:0') seen('righe perse'); if (o.nBlocks && +o.nBlocks.slice(2)>1) seen('più blocchi');
      if ((o.meta||[]).some(m=>/JCAMP-DX file/.test(m))) seen('jcamp'); if ((o.meta||[]).some(m=>/OMNIC|OPUS/.test(m))) seen('binario'); if (o.ycol && o.ycol!=='n:1') seen('ycol>1'); });
    console.log('# percorsi: '+Object.entries(cov).map(([k,v])=>k+' '+v).join(' · '));
    console.log(`# lettori: ${tasks.length} letture (${inputs.length} file), ${same} identiche, ${nums} numeri confrontati: LRE minimo ${minLre===Infinity?'≥ 15 (identici bit per bit)':minLre.toFixed(1)}`);
    console.log(`# isoterme/chemisorbimento: ${ntOk} fermate con NonTrascritto come atteso; fermate prudenti in più (l'app non le riconosce): ${ntExtra.length}${ntExtra.length?' · '+[...new Set(ntExtra)].slice(0,8).join(', '):''}`);
    assert.deepStrictEqual(bad.slice(0,12), []);
    // la condizione prudente non deve fermare file del corpus che l'app legge come spettri
    assert.deepStrictEqual([...new Set(ntExtra.filter(x=>x.startsWith('test/corpus/')))], []);
  } finally { fs.rmSync(tmp,{recursive:true,force:true}); }
});

test('regex di JavaScript in Python: \\d \\w \\b ASCII, \\s e «.» come in JS, /i senza u, ^ e $ con e senza m', {skip:!PY && 'python3 ≥ 3.10 non trovato: SALTATO'}, ()=>{
  assert.ok(fs.existsSync(PYMOD), 'manca '+PYMOD);
  const cases=[[String.raw`^\d+$`,'','٣'],[String.raw`\w+`,'','è'],[String.raw`\bab\b`,'i','èAB'],[String.raw`\s`,'','﻿'],[String.raw`\s`,'','\x1c'],[String.raw`a.b`,'','a b'],[String.raw`a$`,'','a\n'],
    [String.raw`^b`,'m','a b'],[String.raw`a$`,'m','a\rb'],[String.raw`[a-z]`,'i','K'],[String.raw`s`,'i','ſ'],[String.raw`µm`,'i','ΜM'],[String.raw`θ`,'i','ϑ'],[String.raw`[^\w]*[a-zµ]`,'i','μ'],[String.raw`é`,'i','É'],[String.raw`ǅ`,'i','ǆ']];
  const want=cases.map(([s,f,t])=>new RegExp(s,f).test(t));
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'acch-re-')); try{ fs.writeFileSync(path.join(d,'c.json'), JSON.stringify(cases));
    fs.writeFileSync(path.join(d,'p.py'), fs.readFileSync(path.join(PYDIR,'acch_ricetta.py'),'utf8')+'\n'+fs.readFileSync(PYMOD,'utf8')+`\nimport json as _j\nprint(_j.dumps([jt(s, t, f) for s, f, t in _j.load(open(${JSON.stringify(path.join(d,'c.json'))}, encoding='utf-8'))]))\n`);
    const r=spawnSync(PY, ['-I', path.join(d,'p.py')], {encoding:'utf8'}); assert.strictEqual(r.status, 0, r.stderr); assert.deepStrictEqual(JSON.parse(r.stdout), want); } finally { fs.rmSync(d,{recursive:true,force:true}); }
});
