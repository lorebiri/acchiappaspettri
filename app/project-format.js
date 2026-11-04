/* Formato di progetto .acchspettri — archivio ZIP documentato e versionato (vedi docs/FORMATO-ACCHSPETTRI.md).
   Modulo senza dipendenze dall'interfaccia: funziona nel browser, nell'app desktop e in Node (per i test).
   Sicurezza: si leggono solo i percorsi previsti, nessun contenuto viene mai eseguito né scritto su disco. */
(function(root, factory){
  if (typeof module==='object' && module.exports) module.exports=factory();
  else root.AcchFormat=factory();
})(typeof self!=='undefined' ? self : this, function(){
  'use strict';
  const FORMAT='acchspettri', FORMAT_VERSION=1, MIME='application/vnd.acchiappaspettri.project+zip';
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

  /* input: {appVersion, title, createdAt, state, spectra:[{name,path,bytes:Uint8Array,memory,processedCsv?}], results:[{name,text}]} */
  async function encode(input, JSZip){
    if (!JSZip) throw new ProjectError('no-zip');
    const zip=new JSZip(), entries={}, now=new Date().toISOString();
    const add=(path, data, opt)=>{ const bytes=typeof data==='string' ? utf8(data) : data; entries[path]={sha256:sha256(bytes), size:bytes.length}; zip.file(path, bytes, Object.assign({binary:true, date:new Date(now)}, opt||{})); };
    const spectra=(input.spectra||[]).map((s,i)=>{ const id=String(i+1).padStart(6,'0'), data=`data/${id}.dat`;
      if (!(s.bytes instanceof Uint8Array)) throw new ProjectError('bad-input', s.name);
      add(data, s.bytes);
      const rec={id, name:String(s.name||'spettro'), path:relPath(s.path, s.name), data, binary:!!s.binary, memory:s.memory||null};
      if (s.processedCsv){ rec.processed=`processed/${id}.csv`; add(rec.processed, s.processedCsv); }
      return rec; });
    add('project/state.json', JSON.stringify(input.state||{}));
    add('project/spectra.json', JSON.stringify(spectra));
    (input.results||[]).forEach(r=>{ const nm=String(r.name).replace(/[^\w.\- ]+/g,'_').slice(0,120); add('results/'+nm, r.text); });
    const readme='Acchiappaspettri project (.acchspettri)\r\nA plain ZIP archive: manifest.json lists every file with its SHA-256; data/ holds the original files byte for byte;\r\nproject/ holds settings and the work done on each spectrum (JSON); processed/ and results/ are readable copies of processed data and analysis tables.\r\nFormat documentation: https://github.com/lorebiri/acchiappaspettri/blob/main/docs/FORMATO-ACCHSPETTRI.md\r\n';
    add('README.txt', readme);
    const manifest={format:FORMAT, formatVersion:FORMAT_VERSION, minReaderVersion:1, mimetype:MIME, appVersion:String(input.appVersion||''), title:String(input.title||''), createdAt:input.createdAt||now, modifiedAt:now, spectra:spectra.length, entries};
    // «mimetype» per primo e senza compressione, come ODF ed EPUB: identifica il file anche senza estensione
    const out=new JSZip();
    out.file('mimetype', MIME, {compression:'STORE', date:new Date(now)});
    out.file('manifest.json', JSON.stringify(manifest,null,1), {date:new Date(now)});
    for (const p of Object.keys(zip.files)) if (!zip.files[p].dir) out.file(p, await zip.files[p].async('uint8array'), {binary:true, date:new Date(now)});
    return out.generateAsync({type:'uint8array', compression:'DEFLATE', compressionOptions:{level:6}});
  }

  /* migrazioni: da una versione del formato alla successiva, sempre senza toccare il file originale */
  const MIGRATIONS={ /* 1: p=>{…; p.manifest.formatVersion=2; return p;} */ };
  function migrate(p){ let v=p.manifest.formatVersion; while (v<FORMAT_VERSION){ const m=MIGRATIONS[v]; if (!m) throw new ProjectError('no-migration', String(v)); p=m(p); v=p.manifest.formatVersion; } return p; }

  function validateSpectra(list){
    if (!Array.isArray(list)) throw new ProjectError('invalid-schema','spectra');
    if (list.length>LIMITS.spectra) throw new ProjectError('too-large','spectra');
    list.forEach(s=>{ if (!isObj(s) || typeof s.name!=='string' || !isSafeEntry(s.data) || !s.data.startsWith('data/') || (s.memory!=null && !isObj(s.memory))) throw new ProjectError('invalid-schema','spectra'); });
    return list;
  }
  /* decodifica e verifica. Restituisce {manifest,state,spectra:[{…,bytes}],results:[{name,text}],warnings} */
  async function decode(bytes, JSZip){
    if (!JSZip) throw new ProjectError('no-zip');
    if (!bytes || !bytes.length) throw new ProjectError('empty');
    if (bytes.length>LIMITS.archiveBytes) throw new ProjectError('too-large','archive');
    if (!(bytes[0]===0x50 && bytes[1]===0x4b)) throw new ProjectError('not-a-project');
    let zip; try{ zip=await JSZip.loadAsync(bytes, {checkCRC32:true}); }catch(e){ throw new ProjectError('corrupted', 'zip'); }
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
    const checked=async p=>{ const info=manifest.entries[p]; if (!isObj(info)) throw new ProjectError('missing-entry', p); const b=await read(p); if (b.length!==info.size || sha256(b)!==info.sha256) throw new ProjectError('integrity', p); return b; };
    const state=safeParse(unutf8(await checked('project/state.json')),'state'); if (!isObj(state)) throw new ProjectError('invalid-schema','state');
    const spectra=validateSpectra(safeParse(unutf8(await checked('project/spectra.json')),'spectra'));
    for (const s of spectra) s.bytes=await checked(s.data);
    const results=[]; for (const p of Object.keys(manifest.entries)) if (p.startsWith('results/')) results.push({name:p.slice(8), text:unutf8(await checked(p))});
    let P={manifest, state, spectra, results, warnings};
    if (manifest.formatVersion<FORMAT_VERSION) P=migrate(P);
    return P;
  }

  /* vecchio progetto .acchiappa.json (v1) → stessa struttura */
  function fromLegacyJson(text){
    const P=safeParse(text,'legacy');
    if (!isObj(P) || P.app!=='acchiappaspettri' || !Array.isArray(P.files)) throw new ProjectError('not-a-project');
    const un=b=>{ const s=atob(b), u=new Uint8Array(s.length); for (let i=0;i<s.length;i++) u[i]=s.charCodeAt(i); return u; };
    const spectra=P.files.filter(o=>isObj(o) && typeof o.name==='string' && typeof o.data==='string').map((o,i)=>{ let bytes; try{ bytes=o.bin ? un(o.data) : utf8(o.data); }catch(e){ throw new ProjectError('corrupted','legacy'); }
      return {id:String(i+1).padStart(6,'0'), name:o.name, path:relPath(o.path, o.name), binary:!!o.bin, memory:isObj(o.mem)?o.mem:null, bytes, key:typeof o.key==='string'?o.key:null}; });
    const state={title:typeof P.title==='string'?P.title:'', S:isObj(P.S)?P.S:null, MV:isObj(P.MV)?P.MV:null, COMPS:Array.isArray(P.COMPS)?P.COMPS:[], REFS:Array.isArray(P.REFS)?P.REFS:[], LIB:Array.isArray(P.LIB)?P.LIB:[], curKey:P.cur||null};
    return {manifest:{format:FORMAT, formatVersion:FORMAT_VERSION, appVersion:'legacy', title:state.title, createdAt:P.saved||null, modifiedAt:P.saved||null, legacy:true}, state, spectra, results:[], warnings:['legacy']};
  }
  return {FORMAT, FORMAT_VERSION, MIME, LIMITS, ProjectError, sha256, encode, decode, fromLegacyJson, isSafeEntry, relPath, migrate, MIGRATIONS};
});
