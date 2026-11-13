// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Formato di progetto .acchspettri — archivio ZIP documentato e versionato (vedi docs/FORMATO-ACCHSPETTRI.md). Versione 2, legge anche la 1.
   Modulo senza dipendenze dall'interfaccia: funziona nel browser, nell'app desktop e in Node (per i test).
   Sicurezza: si leggono solo i percorsi previsti, nessun contenuto viene mai eseguito né scritto su disco. */
(function(root, factory){
  if (typeof module==='object' && module.exports) module.exports=factory();
  else root.AcchFormat=factory();
})(typeof self!=='undefined' ? self : this, function(){
  'use strict';
  const FORMAT='acchspettri', FORMAT_VERSION=2, MIN_READER=2, MIME='application/vnd.acchiappaspettri.project+zip';
  const LIMITS={archiveBytes:2*1024*1024*1024, entries:20000, totalBytes:4*1024*1024*1024, jsonBytes:512*1024*1024, spectra:10000};
  class ProjectError extends Error{ constructor(code, detail){ super(code+(detail?': '+detail:'')); this.name='ProjectError'; this.code=code; this.detail=detail||''; } }

  /* SHA-256 (FIPS 180-4), sincrono e senza dipendenze: serve anche dove crypto.subtle non c'è */
  const K=new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  function sha256(bytes){
    const n=bytes.length, total=((n+9+63)>>>6)<<6, m=new Uint8Array(total); m.set(bytes); m[n]=0x80;
    const dv=new DataView(m.buffer), hi=Math.floor(n/0x20000000), lo=(n<<3)>>>0; dv.setUint32(total-8,hi); dv.setUint32(total-4,lo);
    const h=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]), w=new Uint32Array(64);
    const rr=(x,c)=>(x>>>c)|(x<<(32-c));
    for (let o=0;o<total;o+=64){
      for (let t=0;t<16;t++) w[t]=dv.getUint32(o+t*4);
      for (let t=16;t<64;t++){ const a=w[t-15], b=w[t-2]; w[t]=(w[t-16]+(rr(a,7)^rr(a,18)^(a>>>3))+w[t-7]+(rr(b,17)^rr(b,19)^(b>>>10)))|0; }
      let a=h[0],b=h[1],c=h[2],d=h[3],e=h[4],f=h[5],g=h[6],i=h[7];
      for (let t=0;t<64;t++){ const t1=(i+(rr(e,6)^rr(e,11)^rr(e,25))+((e&f)^(~e&g))+K[t]+w[t])|0, t2=((rr(a,2)^rr(a,13)^rr(a,22))+((a&b)^(a&c)^(b&c)))|0; i=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0; }
      h[0]+=a;h[1]+=b;h[2]+=c;h[3]+=d;h[4]+=e;h[5]+=f;h[6]+=g;h[7]+=i;
    }
    let s=''; for (const v of h) s+=v.toString(16).padStart(8,'0'); return s;
  }
  const utf8=s=>new TextEncoder().encode(s), unutf8=b=>new TextDecoder('utf-8',{fatal:false}).decode(b);
  /* JSON senza chiavi pericolose (__proto__, constructor, prototype) */
  function safeParse(text, where){
    try{ return JSON.parse(text, (k,v)=>(k==='__proto__'||k==='constructor'||k==='prototype') ? undefined : v); }
    catch(e){ throw new ProjectError('invalid-json', where); }
  }
  const isObj=v=>v!==null && typeof v==='object' && !Array.isArray(v);
  /* un percorso di dati dentro l'archivio deve essere relativo, senza risalite né caratteri strani */
  function isSafeEntry(p){ return typeof p==='string' && p.length>0 && p.length<512 && !p.startsWith('/') && !p.includes('\\') && !p.includes('\0') && !/^[a-zA-Z]:/.test(p) && !p.split('/').some(s=>s==='..'||s==='.'); }
  /* il percorso originale dello spettro si conserva solo relativo: mai percorsi assoluti del computer di chi salva */
  function relPath(p, name){ let s=String(p==null?'':p).replace(/\\/g,'/').replace(/^[a-zA-Z]:/,'').replace(/^\/+/,''); s=s.split('/').filter(x=>x && x!=='.' && x!=='..').join('/'); return s.slice(-400) || String(name||'spettro'); }

  /* ---- dati numerici in binario (f.series, f.cube): little-endian, righe in fila (row-major) ---- */
  const DTYPES={f64:{B:8, A:Float64Array}, f32:{B:4, A:Float32Array}};
  const LE=new Uint8Array(new Uint16Array([1]).buffer)[0]===1;
  function typedToBytes(arr){ if (LE) return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength).slice();
    const B=arr.BYTES_PER_ELEMENT, out=new Uint8Array(arr.length*B), dv=new DataView(out.buffer); arr.forEach((v,i)=>B===8?dv.setFloat64(i*B,v,true):dv.setFloat32(i*B,v,true)); return out; }
  function bytesToTyped(bytes, dtype){ const D=DTYPES[dtype]; if (LE){ const c=bytes.slice(); return new D.A(c.buffer, 0, c.length/D.B); }
    const dv=new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), out=new D.A(bytes.length/D.B); for (let i=0;i<out.length;i++) out[i]=D.B===8?dv.getFloat64(i*8,true):dv.getFloat32(i*4,true); return out; }
  const dtypeOf=a=>a instanceof Float32Array ? 'f32' : 'f64';
  const isNumArr=(a,n)=>Array.isArray(a) && (n==null || a.length===n) && a.every(v=>typeof v==='number' && Number.isFinite(v));
  const isPosInt=v=>Number.isInteger(v) && v>0;
  /* asse: {values:[…], quantity?, unit?, label?}; i numeri devono essere finiti */
  function axisOut(a, n, where){ if (!isObj(a) || !isNumArr(Array.from(a.values||[]), n)) throw new ProjectError('bad-input', where); const o={values:Array.from(a.values)}; for (const k of ['quantity','unit','label']) if (typeof a[k]==='string') o[k]=a[k].slice(0,200); return o; }
  function axisIn(a, n, where){ if (!isObj(a) || !isNumArr(a.values, n)) throw new ProjectError('invalid-schema', where); return a; }
  const pickStr=(o,keys)=>{ const r={}; if (isObj(o)) for (const k of keys) if (typeof o[k]==='string') r[k]=o[k].slice(0,200); return r; };
  /* f.series: serie di spettri (cinetica, DAD, MCR). data[i*n+j] = y al tempo t[i] e alla x[j] */
  function seriesOut(sr, id, add){ if (!isObj(sr)) throw new ProjectError('bad-input','series');
    const m=(sr.t&&sr.t.values||[]).length, n=(sr.x&&sr.x.values||[]).length, arr=sr.data;
    if (!isPosInt(m) || !isPosInt(n) || !(arr instanceof Float64Array || arr instanceof Float32Array) || arr.length!==m*n) throw new ProjectError('bad-input','series');
    const dt=dtypeOf(arr), path=`series/${id}.${dt}`; add(path, typedToBytes(arr));
    const o={kind:typeof sr.kind==='string'?sr.kind.slice(0,40):'generic', t:axisOut(sr.t,m,'series.t'), x:axisOut(sr.x,n,'series.x'), y:pickStr(sr.y,['quantity','unit','label']), shape:[m,n], dtype:dt, data:path};
    if (Array.isArray(sr.members)) o.members=sr.members.filter(v=>typeof v==='string').slice(0,100000);
    if (isObj(sr.meta)) o.meta=sr.meta; return o; }
  /* f.cube: mappa nx × ny × nc. data[(iy*nx+ix)*nc+ic] (ordine «yxc», un pixel dopo l'altro, come BIP) */
  function cubeOut(cb, id, add){ if (!isObj(cb)) throw new ProjectError('bad-input','cube');
    const {nx,ny,nc}=cb, arr=cb.data;
    if (![nx,ny,nc].every(isPosInt) || !(arr instanceof Float64Array || arr instanceof Float32Array) || arr.length!==nx*ny*nc) throw new ProjectError('bad-input','cube');
    const dt=dtypeOf(arr), path=`cube/${id}.${dt}`; add(path, typedToBytes(arr));
    const o={nx, ny, nc, order:'yxc', x:axisOut(cb.x,nc,'cube.x'), px:axisOut(cb.px,nx,'cube.px'), py:axisOut(cb.py,ny,'cube.py'), y:pickStr(cb.y,['quantity','unit','label']), dtype:dt, data:path};
    if (isObj(cb.meta)) o.meta=cb.meta; return o; }
  /* f.iso: isoterma di adsorbimento (autosorb/SPEC §4). Pochi punti: resta nel JSON */
  const isNumOrNullArr=(a,n)=>Array.isArray(a) && a.length===n && a.every(v=>v===null || (typeof v==='number' && Number.isFinite(v)));
  function isoCheck(iso, Err, where){ if (!isObj(iso)) throw new ProjectError(Err, where);
    const n=Array.isArray(iso.p)?iso.p.length:-1, rng=r=>r==null || (Array.isArray(r) && r.length===2 && r.every(Number.isInteger) && r[0]>=0 && r[0]<=r[1] && r[1]<=n);
    if (!(n>0) || !isNumArr(iso.p) || !isNumArr(iso.n,n) || !(iso.p0==null || isNumOrNullArr(iso.p0,n)) || !(iso.t==null || (typeof iso.t==='number' && Number.isFinite(iso.t))) || !isObj(iso.branches) || !rng(iso.branches.ads) || !rng(iso.branches.des) || !(iso.unit==null || isObj(iso.unit)) || !(iso.meta==null || isObj(iso.meta))) throw new ProjectError(Err, where);
    return iso; }
  function isoOut(iso){ isoCheck(iso,'bad-input','iso'); const o={p:iso.p.slice(), p0:iso.p0==null?null:iso.p0.slice(), n:iso.n.slice(), t:iso.t==null?null:iso.t, branches:{ads:iso.branches.ads||null, des:iso.branches.des||null}, unit:pickStr(iso.unit,['p','p0','n','t'])}; if (isObj(iso.meta)) o.meta=iso.meta; return o; }
  const KEYS_S=new Set(['name','path','bytes','binary','memory','processedCsv','sampleKey','channel','series','cube','iso','extra']);

  /* input: {appVersion, title, createdAt, state,
             spectra:[{name, path, bytes?:Uint8Array, binary?, memory?, processedCsv?, sampleKey?, channel?, series?, cube?, iso?, extra?}],
             libraries:[{id, revision, name?, data}], results:[{name,text}]}
     Formato 2: i byte di ogni file originale si scrivono una volta sola (data/, project/sources.json), anche se più spettri
     ne derivano (canali di un file multicanale, distinti da sampleKey). Vedi docs/FORMATO-ACCHSPETTRI.md. */
  async function encode(input, JSZip){
    if (!JSZip) throw new ProjectError('no-zip');
    const zip=new JSZip(), entries={}, now=new Date().toISOString();
    const add=(path, data, opt, hash)=>{ const bytes=typeof data==='string' ? utf8(data) : data; entries[path]={sha256:hash||sha256(bytes), size:bytes.length}; zip.file(path, bytes, Object.assign({binary:true, date:new Date(now)}, opt||{})); };
    const sources=[], bySha=new Map(), shaCache=new WeakMap();
    const shaOf=b=>{ let m=shaCache.get(b.buffer); if (!m){ m=new Map(); shaCache.set(b.buffer,m); } const k=b.byteOffset+':'+b.length; if (!m.has(k)) m.set(k, sha256(b)); return m.get(k); };
    const spectra=(input.spectra||[]).map((s,i)=>{ const id=String(i+1).padStart(6,'0');
      const derived=!!(s.series||s.cube||s.iso);
      let source=null;
      if (s.bytes!=null){
        if (!(s.bytes instanceof Uint8Array)) throw new ProjectError('bad-input', s.name);
        const h=shaOf(s.bytes), key=h+(s.binary?':b':':t');
        if (!bySha.has(key)){ const sid=String(sources.length+1).padStart(6,'0'), data=`data/${sid}.dat`; add(data, s.bytes, null, h); const src={id:sid, data, size:s.bytes.length, sha256:h, binary:!!s.binary}; sources.push(src); bySha.set(key, src); }
        source=bySha.get(key).id;
      } else if (!derived) throw new ProjectError('bad-input', s.name);
      const rec={id, name:String(s.name||'spettro'), path:relPath(s.path, s.name), source, sampleKey:typeof s.sampleKey==='string'?s.sampleKey.slice(0,400):null, channel:typeof s.channel==='string'?s.channel.slice(0,200):null, binary:!!s.binary, memory:s.memory||null};
      if (s.processedCsv){ rec.processed=`processed/${id}.csv`; add(rec.processed, s.processedCsv); }
      if (s.series) rec.series=seriesOut(s.series, id, add);
      if (s.cube) rec.cube=cubeOut(s.cube, id, add);
      if (s.iso) rec.iso=isoOut(s.iso);
      if (isObj(s.extra)) rec.extra=s.extra;   // campi di versioni più nuove, conservati così come sono
      return rec; });
    const libraries=(input.libraries||[]).map((l,i)=>{ if (!isObj(l) || typeof l.id!=='string' || !l.id || l.id.length>200 || !(Number.isInteger(l.revision) && l.revision>=1) || !isObj(l.data)) throw new ProjectError('bad-input','library');
      const file=`libraries/${String(i+1).padStart(6,'0')}.acchlib.json`; add(file, JSON.stringify(l.data));
      return {id:l.id, revision:l.revision, name:typeof l.name==='string'?l.name.slice(0,300):'', file}; });
    if (new Set(libraries.map(l=>l.id)).size!==libraries.length) throw new ProjectError('bad-input','library-id');
    add('project/state.json', JSON.stringify(input.state||{}));
    add('project/sources.json', JSON.stringify(sources));
    add('project/spectra.json', JSON.stringify(spectra));
    add('project/libraries.json', JSON.stringify(libraries));
    (input.results||[]).forEach(r=>{ const nm=String(r.name).replace(/[^\w.\-/ ]+/g,'_').replace(/\/{2,}/g,'/').split('/').filter(x=>x && x!=='.' && x!=='..').join('/').slice(0,120) || 'risultato'; add('results/'+nm, r.text); });
    const readme='Acchiappaspettri project (.acchspettri), format 2\r\nA plain ZIP archive: manifest.json lists every file with its SHA-256; data/ holds each original file once, byte for byte;\r\nproject/ holds settings, sources, spectra, embedded libraries (JSON); series/ and cube/ hold numeric matrices (little-endian float);\r\nprocessed/ and results/ are readable copies of processed data and analysis tables.\r\nFormat documentation: https://github.com/lorebiri/acchiappaspettri/blob/main/docs/FORMATO-ACCHSPETTRI.md\r\n';
    add('README.txt', readme);
    const manifest={format:FORMAT, formatVersion:FORMAT_VERSION, minReaderVersion:MIN_READER, mimetype:MIME, appVersion:String(input.appVersion||''), title:String(input.title||''), createdAt:input.createdAt||now, modifiedAt:now, spectra:spectra.length, sources:sources.length, libraries:libraries.length, entries};
    // «mimetype» per primo e senza compressione, come ODF ed EPUB: identifica il file anche senza estensione
    const out=new JSZip();
    out.file('mimetype', MIME, {compression:'STORE', date:new Date(now)});
    out.file('manifest.json', JSON.stringify(manifest,null,1), {date:new Date(now)});
    for (const p of Object.keys(zip.files)) if (!zip.files[p].dir) out.file(p, await zip.files[p].async('uint8array'), {binary:true, date:new Date(now)});
    return out.generateAsync({type:'uint8array', compression:'DEFLATE', compressionOptions:{level:6}});
  }

  /* migrazioni: da una versione del formato alla successiva, in memoria, senza toccare il file originale */
  const MIGRATIONS={
    // 1 → 2: ogni spettro aveva il suo data/…; diventa una sorgente (una per spettro, come nel file) e lo spettro la richiama.
    // Niente si perde: nomi, percorsi, memoria, processed, stato e risultati restano com'erano.
    1: p=>{ p.sources=p.spectra.map(s=>({id:s.id||s.data.replace(/^data\/|\.dat$/g,''), data:s.data, size:s.bytes.length, sha256:(p.manifest.entries&&p.manifest.entries[s.data]&&p.manifest.entries[s.data].sha256)||sha256(s.bytes), binary:!!s.binary, bytes:s.bytes}));
      p.spectra.forEach((s,i)=>{ s.source=p.sources[i].id; if (s.sampleKey===undefined) s.sampleKey=null; if (s.channel===undefined) s.channel=null; });
      p.libraries=p.libraries||[]; p.manifest.formatVersion=2; p.manifest.readFrom=1; p.warnings.push('migrated-from-1'); return p; }
  };
  function migrate(p){ let v=p.manifest.formatVersion; while (v<FORMAT_VERSION){ const m=MIGRATIONS[v]; if (!m) throw new ProjectError('no-migration', String(v)); p=m(p); v=p.manifest.formatVersion; } return p; }

  function validateSpectra(list, v){
    if (!Array.isArray(list)) throw new ProjectError('invalid-schema','spectra');
    if (list.length>LIMITS.spectra) throw new ProjectError('too-large','spectra');
    list.forEach(s=>{ if (!isObj(s) || typeof s.name!=='string' || (s.memory!=null && !isObj(s.memory))) throw new ProjectError('invalid-schema','spectra');
      if (v===1){ if (!isSafeEntry(s.data) || !s.data.startsWith('data/')) throw new ProjectError('invalid-schema','spectra'); return; }
      if (!(s.source===null || typeof s.source==='string') || !(s.sampleKey==null || typeof s.sampleKey==='string') || !(s.channel==null || typeof s.channel==='string')) throw new ProjectError('invalid-schema','spectra');
      if (s.source===null && !(s.series || s.cube || s.iso)) throw new ProjectError('invalid-schema','spectra');
      for (const k of ['series','cube']) if (s[k]!=null && (!isObj(s[k]) || !isSafeEntry(s[k].data) || !s[k].data.startsWith(k+'/') || !DTYPES[s[k].dtype])) throw new ProjectError('invalid-schema',k);
      if (s.iso!=null) isoCheck(s.iso,'invalid-schema','iso'); });
    return list;
  }
  /* decodifica e verifica. Restituisce sempre la forma del formato 2:
     {manifest, state, sources:[{id,data,size,sha256,binary,bytes}], spectra:[{…, source, sampleKey, channel, bytes, series?, cube?, iso?}],
      libraries:[{id,revision,name,data}], results:[{name,text}], warnings} */
  async function decode(bytes, JSZip){
    if (!JSZip) throw new ProjectError('no-zip');
    if (!bytes || !bytes.length) throw new ProjectError('empty');
    if (bytes.length>LIMITS.archiveBytes) throw new ProjectError('too-large','archive');
    if (!(bytes[0]===0x50 && bytes[1]===0x4b)) throw new ProjectError('not-a-project');
    // niente controllo CRC qui: decomprimerebbe tutto prima del controllo delle dimensioni; ogni voce ha la sua impronta SHA-256
    let zip; try{ zip=await JSZip.loadAsync(bytes); }catch(e){ throw new ProjectError('corrupted', 'zip'); }
    const names=Object.keys(zip.files); if (names.length>LIMITS.entries) throw new ProjectError('too-large','entries');
    let declared=0; for (const n of names){ if (!isSafeEntry(n.replace(/\/$/,''))) throw new ProjectError('unsafe-path', n); const d=zip.files[n]._data; if (d && d.uncompressedSize) declared+=d.uncompressedSize; }
    if (declared>LIMITS.totalBytes) throw new ProjectError('too-large','content');
    const read=async p=>{ const e=zip.files[p]; if (!e || e.dir) throw new ProjectError('missing-entry', p); try{ return await e.async('uint8array'); }catch(err){ throw new ProjectError('corrupted', p); } };
    if (!zip.files['manifest.json']) throw new ProjectError('not-a-project');
    const manifest=safeParse(unutf8(await read('manifest.json')),'manifest.json');
    if (!isObj(manifest) || manifest.format!==FORMAT || !isObj(manifest.entries)) throw new ProjectError('not-a-project');
    if (!Number.isInteger(manifest.formatVersion) || manifest.formatVersion<1) throw new ProjectError('invalid-schema','formatVersion');
    const warnings=[];
    if (manifest.formatVersion>FORMAT_VERSION){
      if (!(Number.isInteger(manifest.minReaderVersion) && manifest.minReaderVersion<=FORMAT_VERSION)) throw new ProjectError('newer-format', String(manifest.formatVersion));
      warnings.push('newer-format-compatible');
    }
    for (const p of Object.keys(manifest.entries)) if (!isSafeEntry(p)) throw new ProjectError('unsafe-path', p);
    const known=new Set(['mimetype','manifest.json',...Object.keys(manifest.entries)]);
    if (names.some(n=>!zip.files[n].dir && !known.has(n))) warnings.push('unknown-entries');   // ignorati: non vengono né letti né eseguiti
    const checked=async p=>{ const info=manifest.entries[p]; if (!isObj(info)) throw new ProjectError('missing-entry', p); if (!(info.size>=0) || (/\.json$/.test(p) && info.size>LIMITS.jsonBytes)) throw new ProjectError('too-large',p); const b=await read(p); if (b.length!==info.size || sha256(b)!==info.sha256) throw new ProjectError('integrity', p); return b; };
    const json=async (p,where)=>safeParse(unutf8(await checked(p)),where);
    const state=await json('project/state.json','state'); if (!isObj(state)) throw new ProjectError('invalid-schema','state');
    const v=Math.min(manifest.formatVersion, FORMAT_VERSION);
    const spectra=validateSpectra(await json('project/spectra.json','spectra'), v);
    const results=[]; for (const p of Object.keys(manifest.entries)) if (p.startsWith('results/')) results.push({name:p.slice(8), text:unutf8(await checked(p))});
    if (v===1){ for (const s of spectra) s.bytes=await checked(s.data); return migrate({manifest, state, spectra, results, warnings}); }
    // formato 2: sorgenti (byte una volta sola), spettri che le richiamano, librerie incorporate, matrici binarie
    const sources=await json('project/sources.json','sources');
    if (!Array.isArray(sources) || sources.length>LIMITS.spectra || sources.some(x=>!isObj(x) || typeof x.id!=='string' || !isSafeEntry(x.data) || !x.data.startsWith('data/'))) throw new ProjectError('invalid-schema','sources');
    const byId=new Map(); for (const x of sources){ if (byId.has(x.id)) throw new ProjectError('invalid-schema','sources'); x.bytes=await checked(x.data); x.size=x.bytes.length; byId.set(x.id, x); }
    for (const s of spectra){
      if (s.source!=null){ const x=byId.get(s.source); if (!x) throw new ProjectError('invalid-schema','source'); s.bytes=x.bytes; s.data=x.data; if (s.binary==null) s.binary=!!x.binary; }
      else s.bytes=null;
      if (s.series){ const sr=s.series, m=sr.shape&&sr.shape[0], n=sr.shape&&sr.shape[1]; if (!isPosInt(m) || !isPosInt(n)) throw new ProjectError('invalid-schema','series'); axisIn(sr.t,m,'series.t'); axisIn(sr.x,n,'series.x');
        const b=await checked(sr.data); if (b.length!==m*n*DTYPES[sr.dtype].B) throw new ProjectError('invalid-schema','series'); sr.data=bytesToTyped(b, sr.dtype); }
      if (s.cube){ const cb=s.cube; if (![cb.nx,cb.ny,cb.nc].every(isPosInt) || (cb.order||'yxc')!=='yxc') throw new ProjectError('invalid-schema','cube'); axisIn(cb.x,cb.nc,'cube.x'); axisIn(cb.px,cb.nx,'cube.px'); axisIn(cb.py,cb.ny,'cube.py');
        const b=await checked(cb.data); if (b.length!==cb.nx*cb.ny*cb.nc*DTYPES[cb.dtype].B) throw new ProjectError('invalid-schema','cube'); cb.data=bytesToTyped(b, cb.dtype); }
    }
    const libIdx=manifest.entries['project/libraries.json'] ? await json('project/libraries.json','libraries') : [];
    if (!Array.isArray(libIdx) || libIdx.some(l=>!isObj(l) || typeof l.id!=='string' || !Number.isInteger(l.revision) || !isSafeEntry(l.file) || !l.file.startsWith('libraries/'))) throw new ProjectError('invalid-schema','libraries');
    const libraries=[]; for (const l of libIdx){ const data=await json(l.file,'library'); if (!isObj(data)) throw new ProjectError('invalid-schema','library'); libraries.push({id:l.id, revision:l.revision, name:typeof l.name==='string'?l.name:'', data}); }
    return {manifest, state, sources, spectra, libraries, results, warnings};
  }

  /* vecchio progetto .acchiappa.json (v1) → stessa struttura */
  function fromLegacyJson(text){
    const P=safeParse(text,'legacy');
    if (!isObj(P) || P.app!=='acchiappaspettri' || !Array.isArray(P.files)) throw new ProjectError('not-a-project');
    const un=b=>{ const s=atob(b), u=new Uint8Array(s.length); for (let i=0;i<s.length;i++) u[i]=s.charCodeAt(i); return u; };
    const spectra=P.files.filter(o=>isObj(o) && typeof o.name==='string' && typeof o.data==='string').map((o,i)=>{ let bytes; try{ bytes=o.bin ? un(o.data) : utf8(o.data); }catch(e){ throw new ProjectError('corrupted','legacy'); }
      return {id:String(i+1).padStart(6,'0'), name:o.name, path:relPath(o.path, o.name), binary:!!o.bin, memory:isObj(o.mem)?o.mem:null, bytes, key:typeof o.key==='string'?o.key:null}; });
    const state={title:typeof P.title==='string'?P.title:'', S:isObj(P.S)?P.S:null, MV:isObj(P.MV)?P.MV:null, COMPS:Array.isArray(P.COMPS)?P.COMPS:[], REFS:Array.isArray(P.REFS)?P.REFS:[], LIB:Array.isArray(P.LIB)?P.LIB:[], curKey:P.cur||null};
    const sources=spectra.map(s=>({id:s.id, data:null, size:s.bytes.length, sha256:sha256(s.bytes), binary:s.binary, bytes:s.bytes}));
    spectra.forEach(s=>{ s.source=s.id; s.sampleKey=null; s.channel=null; });
    return {manifest:{format:FORMAT, formatVersion:FORMAT_VERSION, appVersion:'legacy', title:state.title, createdAt:P.saved||null, modifiedAt:P.saved||null, legacy:true}, state, sources, spectra, libraries:[], results:[], warnings:['legacy']};
  }
  return {FORMAT, FORMAT_VERSION, MIN_READER, MIME, LIMITS, ProjectError, sha256, encode, decode, fromLegacyJson, isSafeEntry, relPath, migrate, MIGRATIONS};
});
