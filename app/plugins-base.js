// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Estensioni per nuovi formati (tappa I11): parte pura, senza DOM (non è un modulo del nucleo: per questo non si chiama *-core.js). Funziona nel browser, nell'app desktop e in Node (test).
   - Pacchetto .acchplugin: un documento JSON (UTF-8) con manifesto e codice JS del lettore. Si verifica con l'impronta SHA-256 dei suoi byte.
   - Sandbox: il testo del Web Worker dedicato in cui gira il lettore (sandboxSource); prima del codice dell'estensione toglie rete,
     archivio, altri worker e canali di comunicazione.
   - Uscita: il lettore restituisce solo x/y/meta/canali; validateOutput li controlla nel contesto della pagina (tipi, lunghezze,
     numeri finiti, dimensioni massime) ed è l'unico controllo che conta: quello nel worker serve solo a non copiare risultati enormi.
   Guida per chi scrive estensioni: docs/ESTENSIONI.md. */
(function(root, factory){
  if (typeof module==='object' && module.exports) module.exports=factory(root);
  else root.AcchPluginsCore=factory(root);
})(typeof self!=='undefined' ? self : this, function(root){
  'use strict';
  const FORMAT='acchplugin', FORMAT_VERSION=1;
  const LIMITS={packageBytes:2*1024*1024, codeChars:1500000, inputBytes:64*1024*1024, timeoutMs:15000,
    channels:64, pointsPerChannel:2000000, points:8000000, minPoints:5, metaLines:200, metaChars:500, nameChars:100, errorChars:300,
    wasmMaxPages:4096, examples:5, examplesBytes:1024*1024};   // 4096 pagine da 64 KiB = 256 MB
  // estensioni che l'app usa per sé (progetti, librerie, immagini, Origin) o che non sono dati: un'estensione non può prenderle
  const RESERVED=new Set(['acchspettri','acchplugin','acchlib','json','opj','opju','jpg','jpeg','png','tif','tiff','webp','bmp','heic','heif','gif','svg','pdf','zip','exe','dll','js','mjs','html','htm']);
  // unico permesso possibile: leggere i byte dei file che l'utente apre con le estensioni dichiarate
  const PERMISSIONS=['read-file'];
  class PluginError extends Error{ constructor(code, detail){ super(code+(detail?': '+detail:'')); this.name='PluginError'; this.code=code; this.detail=detail||''; } }
  const isObj=v=>v!==null && typeof v==='object' && !Array.isArray(v);
  const CTRL=/[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069]/g;   // controlli e inversioni di direzione (nomi ingannevoli)
  const clean=(s, n)=>String(s).replace(CTRL,'').trim().slice(0,n);
  // import() caricherebbe altro codice (anche dalla rete) e non si può togliere come una funzione: la parola «import» non è ammessa.
  // Le parole chiave non accettano sequenze \u, e eval, Function e setTimeout con testo sono tolti nel worker: non si ricostruisce.
  const IMPORT_RE=/(^|[^.\w$])import(?![\w$])/;
  const SEMVER=/^(\d{1,6})\.(\d{1,6})\.(\d{1,6})(?:-([0-9A-Za-z.-]{1,30}))?$/;

  function sha256Of(bytes){
    const F=root && root.AcchFormat ? root.AcchFormat : (typeof require==='function' ? require('./project-format.js') : null);
    return F.sha256(bytes); }
  function parseVersion(v){ const m=SEMVER.exec(String(v||'')); return m ? {n:[+m[1],+m[2],+m[3]], pre:m[4]||''} : null; }
  // confronto semver completo (le pre-release vengono prima della versione stabile)
  function cmpVersion(a, b){ const A=parseVersion(a), B=parseVersion(b); if (!A || !B) return NaN;
    for (let i=0;i<3;i++) if (A.n[i]!==B.n[i]) return A.n[i]<B.n[i]?-1:1;
    if (A.pre===B.pre) return 0; if (!A.pre) return 1; if (!B.pre) return -1; return A.pre<B.pre?-1:1; }
  // versione minima dell'app: conta solo il numero (le pre-release della 3.0.0 valgono come 3.0.0)
  function appSatisfies(minApp, app){ const A=parseVersion(app), M=parseVersion(minApp); if (!A || !M) return false;
    for (let i=0;i<3;i++) if (A.n[i]!==M.n[i]) return A.n[i]>M.n[i]; return true; }
  const extOf=name=>{ const m=/\.([A-Za-z0-9]{1,12})$/.exec(String(name||'')); return m ? m[1].toLowerCase() : ''; };

  function validateManifest(m){
    if (!isObj(m)) throw new PluginError('manifest','manifest');
    const str=(k, max, re)=>{ const v=m[k]; if (typeof v!=='string') throw new PluginError('manifest',k); const s=clean(v,max+1); if (!s || s.length>max || (re && !re.test(s))) throw new PluginError('manifest',k); return s; };
    const out={
      id:str('id',64,/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/),
      name:str('name',80),
      version:str('version',40,SEMVER),
      author:str('author',120),
      license:str('license',80,/^[A-Za-z0-9.+() -]+$/),
      minAppVersion:str('minAppVersion',40,SEMVER)
    };
    if (!Array.isArray(m.extensions) || !m.extensions.length || m.extensions.length>20) throw new PluginError('manifest','extensions');
    const ext=[]; for (const e of m.extensions){ const s=typeof e==='string' ? e.trim().replace(/^\./,'').toLowerCase() : '';
      if (!/^[a-z0-9]{1,12}$/.test(s)) throw new PluginError('manifest','extensions');
      if (RESERVED.has(s)) throw new PluginError('reserved-ext', s);
      if (!ext.includes(s)) ext.push(s); }
    out.extensions=ext;
    // un permesso sconosciuto non si ignora: l'estensione chiede qualcosa che l'app non sa concedere, quindi si rifiuta
    if (m.permissions!=null){ if (!Array.isArray(m.permissions) || m.permissions.some(p=>!PERMISSIONS.includes(p))) throw new PluginError('permissions', Array.isArray(m.permissions)?m.permissions.filter(p=>!PERMISSIONS.includes(p)).map(String).join(', ').slice(0,100):''); }
    out.permissions=PERMISSIONS.slice();
    const d=m.description; out.description={it:'', en:''};
    if (typeof d==='string') out.description.it=out.description.en=clean(d,500);
    else if (isObj(d)){ for (const k of ['it','en']) if (typeof d[k]==='string') out.description[k]=clean(d[k],500); if (!out.description.it) out.description.it=out.description.en; if (!out.description.en) out.description.en=out.description.it; }
    if (typeof m.homepage==='string' && /^https:\/\/[^\s<>"']{1,190}$/.test(m.homepage.trim())) out.homepage=m.homepage.trim();
    return out;
  }

  /* pacchetto: Uint8Array (byte del file) o stringa. Restituisce {manifest, code, sha256, size, text} o lancia PluginError */
  function parsePackage(input){
    let bytes;
    if (typeof input==='string') bytes=new TextEncoder().encode(input);
    else if (input instanceof Uint8Array) bytes=input;
    else if (input instanceof ArrayBuffer) bytes=new Uint8Array(input);
    else throw new PluginError('not-a-package');
    if (!bytes.length) throw new PluginError('empty');
    if (bytes.length>LIMITS.packageBytes) throw new PluginError('too-large', String(bytes.length));
    let text; try{ text=new TextDecoder('utf-8',{fatal:true}).decode(bytes); }catch(e){ throw new PluginError('not-a-package','utf-8'); }
    if (text.charCodeAt(0)===0xFEFF) text=text.slice(1);
    let j; try{ j=JSON.parse(text, (k,v)=>(k==='__proto__'||k==='constructor'||k==='prototype') ? undefined : v); }catch(e){ throw new PluginError('not-a-package','json'); }
    if (!isObj(j) || j.format!==FORMAT) throw new PluginError('not-a-package','format');
    if (!Number.isInteger(j.formatVersion) || j.formatVersion<1) throw new PluginError('not-a-package','formatVersion');
    if (j.formatVersion>FORMAT_VERSION) throw new PluginError('newer-package', String(j.formatVersion));
    const manifest=validateManifest(j.manifest);
    // tre tipi, uno solo per pacchetto: «reader» (dichiarativo, consigliato), «wasm» (modulo base64), «code» (JavaScript)
    const kinds=['reader','wasm','code'].filter(k=>j[k]!=null);
    if (kinds.length>1) throw new PluginError('kind', kinds.join('+'));
    let kind, code, reader=null, wasm=null;
    if (j.reader!=null){ kind='declarative'; reader=validateReaderSpec(j.reader); code='registerReader(function(b, n){ return ('+DECL.toString()+')('+JSON.stringify(reader)+', b, n); });'; }
    else if (j.wasm!=null){ kind='wasm'; const u=fromB64(j.wasm); wasm=checkWasm(u); code='registerReader(function(b, n){ return ('+WASMRUN.toString()+')('+JSON.stringify(j.wasm)+', '+LIMITS.wasmMaxPages+', b, n); });'; }
    else { kind='js';
      if (typeof j.code!=='string' || !j.code.trim()) throw new PluginError('no-code');
      if (j.code.length>LIMITS.codeChars) throw new PluginError('too-large','code');
      if (IMPORT_RE.test(j.code)) throw new PluginError('forbidden-code','import');
      code=j.code; }
    const examples=examplesOf(j.examples, manifest);
    return {manifest, kind, code, reader, wasm, examples, sha256:sha256Of(bytes), size:bytes.length, text};
  }
  /* pacchetto dai sorgenti (scripts/plugin-pack.js e test): sempre gli stessi byte per gli stessi sorgenti */
  // body: stringa (codice JS) oppure {code} | {reader} | {wasm: Uint8Array o base64}; examples: [{name, bytes, expected}]
  function buildPackage(manifest, body, examples){ const b=typeof body==='string' ? {code:body} : Object.assign({}, body);
    if (b.wasm instanceof Uint8Array) b.wasm=toB64(b.wasm);
    const o=Object.assign({format:FORMAT, formatVersion:FORMAT_VERSION, manifest}, b);
    if (examples && examples.length) o.examples=examples.map(e=>({name:e.name, data:toB64(e.bytes), expected:e.expected}));
    return JSON.stringify(o, null, 1)+'\n'; }
  const handles=(manifest, name)=>{ const e=extOf(name); return !!e && manifest.extensions.includes(e); };
  // impronta leggibile: gruppi di 4 cifre, come si confronta a voce o su una pagina web
  const fingerprint=h=>String(h||'').replace(/(.{4})(?=.)/g,'$1 ');

  /* ---------- uscita del lettore, nel contesto della pagina ----------
     null/undefined → {none:true}: il file non è di questa estensione (si prova il lettore dell'app).
     {error:"…"} → {error}: il file è di questa estensione ma non si legge (messaggio dell'estensione, ripulito).
     {x, y, meta?} oppure {channels:[{name?, x, y, meta?}], meta?, sample?, technique?} → canali validati in Float64Array. */
  function numArray(a, where, maxLen){
    if (!(Array.isArray(a) || a instanceof Float64Array || a instanceof Float32Array)) throw new PluginError('bad-output', where+': not-array');
    const n=a.length; if (!Number.isInteger(n) || n>maxLen) throw new PluginError('too-large', where);
    const out=new Float64Array(n);
    for (let i=0;i<n;i++){ const v=a[i]; if (typeof v!=='number') throw new PluginError('bad-output', where+': not-number@'+i); if (!Number.isFinite(v)) throw new PluginError('not-finite', where+'@'+i); out[i]=v; }
    return out; }
  function metaOf(m){ if (m==null) return []; if (!Array.isArray(m)) throw new PluginError('bad-output','meta');
    return m.slice(0, LIMITS.metaLines).filter(s=>typeof s==='string' || typeof s==='number').map(s=>clean(s, LIMITS.metaChars)).filter(Boolean); }
  function validateOutput(raw, opt){
    opt=opt||{};
    if (raw==null) return {none:true};
    if (!isObj(raw)) throw new PluginError('bad-output','type');
    if (raw.error!=null) return {error:clean(typeof raw.error==='string'?raw.error:'?', LIMITS.errorChars)||'?'};
    let list=raw.channels;
    if (list==null && raw.x!=null) list=[{name:'', x:raw.x, y:raw.y, meta:null}];
    if (!Array.isArray(list) || !list.length) throw new PluginError('bad-output','channels');
    if (list.length>LIMITS.channels) throw new PluginError('too-large','channels');
    let total=0; const channels=[];
    list.forEach((c,k)=>{ if (!isObj(c)) throw new PluginError('bad-output','channel '+(k+1));
      const where='channel '+(k+1);
      const nx=c.x && c.x.length, ny=c.y && c.y.length;
      if (!Number.isInteger(nx) || !Number.isInteger(ny)) throw new PluginError('bad-output', where+': not-array');
      if (nx!==ny) throw new PluginError('length', where);
      if (nx>LIMITS.pointsPerChannel) throw new PluginError('too-large', where);
      total+=nx; if (total>LIMITS.points) throw new PluginError('too-large','points');
      if (nx<LIMITS.minPoints) throw new PluginError('too-few', where);
      const xs=numArray(c.x, where+' x', LIMITS.pointsPerChannel), ys=numArray(c.y, where+' y', LIMITS.pointsPerChannel);
      channels.push({name:typeof c.name==='string' ? clean(c.name, LIMITS.nameChars) : '', xs, ys, meta:metaOf(c.meta)}); });
    // nomi di canale ripetuti: si numerano, così ogni canale resta distinto nel progetto (campo channel)
    const seen={}; for (const c of channels){ const k=c.name; seen[k]=(seen[k]||0)+1; if (channels.length>1 && (!k || seen[k]>1)) c.name=(k?k+' ':'')+'#'+(k?seen[k]:channels.indexOf(c)+1); }
    const allowed=opt.techniques ? new Set(opt.techniques) : null, notes=[];
    let technique=null; if (typeof raw.technique==='string'){ if (!allowed || allowed.has(raw.technique)) technique=raw.technique; else notes.push('technique'); }
    return {channels, meta:metaOf(raw.meta), sample:typeof raw.sample==='string' ? clean(raw.sample, LIMITS.nameChars) : '', technique, notes};
  }

  /* ---------- lettori dichiarativi (consigliati): dati, non codice ----------
     Il manifesto «reader» descrive un file di testo (colonne, separatore, decimale, righe d'intestazione, unità, canali,
     metadati con regex brevi) o un binario semplice (ordine dei byte, offset, tipo, conteggio da un campo). Lo interpreta
     DECL, codice dell'app, che gira nello stesso worker isolato delle estensioni: una regex lenta si ferma con il tempo massimo.
     validateReaderSpec è il controllo all'installazione: campi sconosciuti, valori fuori scala e regex rischiose sono rifiutati. */
  const BIN_T={u8:1,i8:1,u16:2,i16:2,u32:4,i32:4,f32:4,f64:8}, INT_T=['u8','i8','u16','i16','u32','i32'];
  const DELIMS=[',',';','\t',' ','|','whitespace','fixed'];
  // gruppo ripetuto che contiene a sua volta una ripetizione, (a+)+ o (a|aa)*: la forma tipica delle regex catastrofiche
  const NESTED_Q=/\((?:[^()\\]|\\.)*(?:[+*]|\{\d+,?\d*\})(?:[^()\\]|\\.)*\)(?:[+*]|\{\d+,?\d*\})/;
  // gruppo con alternative ripetuto senza limite, (a|aa)* o (a|a){2,}: alternative che si sovrappongono
  const NESTED_ALT=/\((?:[^()\\]|\\.)*\|(?:[^()\\]|\\.)*\)(?:[+*]|\{\d+,\d*\})/;
  function specErr(where){ return new PluginError('reader', where); }
  function okRegex(s, where){ if (typeof s!=='string' || !s || s.length>200) throw specErr(where);
    if (NESTED_Q.test(s) || NESTED_ALT.test(s) || /\\[1-9]|\\k</.test(s)) throw specErr(where+': regex');
    try{ new RegExp(s); }catch(e){ throw specErr(where+': regex'); } return s; }
  const intIn=(v,a,b)=>Number.isInteger(v) && v>=a && v<=b;
  function onlyKeys(o, keys, where){ if (!isObj(o)) throw specErr(where); for (const k of Object.keys(o)) if (!keys.includes(k)) throw specErr(where+'.'+k); }
  const sstr=(v,n)=>typeof v==='string' && v.length<=n ? clean(v,n) : null;
  function fieldOf(f, where, N){ if (typeof f==='number'){ if (!Number.isFinite(f)) throw specErr(where); return {value:f}; }
    onlyKeys(f, ['value','offset','type'], where);
    if (f.value!=null){ if (typeof f.value!=='number' || !Number.isFinite(f.value)) throw specErr(where); return {value:f.value}; }
    if (!intIn(f.offset,0,0x7fffffff) || !BIN_T[f.type] || (N && !INT_T.includes(f.type))) throw specErr(where); return {offset:f.offset, type:f.type}; }
  function validateReaderSpec(s){
    onlyKeys(s, ['kind','encoding','signature','skipLines','comment','delimiter','decimal','headerLine','columns','x','channels','technique','meta','sample','onBadLine','endian','count','data'], 'reader');
    const o={kind:s.kind};
    if (s.technique!=null){ if (!/^[a-z]{1,10}$/.test(s.technique||'')) throw specErr('technique'); o.technique=s.technique; }
    const chans=(L, maxCol)=>{ if (!Array.isArray(L) || !L.length || L.length>LIMITS.channels) throw specErr('channels');
      return L.map((c,i)=>{ onlyKeys(c, ['column','name','unit'], 'channels['+i+']'); if (!intIn(c.column,1,maxCol)) throw specErr('channels['+i+'].column');
        const r={column:c.column}; if (c.name!=null){ r.name=sstr(c.name,100); if (r.name==null) throw specErr('channels['+i+'].name'); } if (c.unit!=null){ r.unit=sstr(c.unit,20); if (r.unit==null) throw specErr('channels['+i+'].unit'); } return r; }); };
    if (s.kind==='text'){
      for (const k of ['endian','count','data']) if (s[k]!=null) throw specErr(k);
      o.encoding=s.encoding==null ? 'utf-8' : s.encoding; if (!['utf-8','latin1','utf-16le'].includes(o.encoding)) throw specErr('encoding');
      if (s.signature!=null){ onlyKeys(s.signature, ['regex','lines'], 'signature'); o.signature={regex:okRegex(s.signature.regex,'signature'), lines:s.signature.lines==null?1:s.signature.lines}; if (!intIn(o.signature.lines,1,50)) throw specErr('signature.lines'); }
      o.skipLines=s.skipLines==null?0:s.skipLines; if (!intIn(o.skipLines,0,1000)) throw specErr('skipLines');
      if (s.comment!=null){ if (typeof s.comment!=='string' || !/^[^\s\d.,;+-]{1,5}$/.test(s.comment)) throw specErr('comment'); o.comment=s.comment; }
      if (!DELIMS.includes(s.delimiter)) throw specErr('delimiter'); o.delimiter=s.delimiter;
      o.decimal=s.decimal==null?'.':s.decimal; if (!['.',','].includes(o.decimal) || (o.decimal===',' && o.delimiter===',')) throw specErr('decimal');
      if (s.headerLine!=null){ if (!intIn(s.headerLine,1,1000)) throw specErr('headerLine'); o.headerLine=s.headerLine; }
      let maxCol=LIMITS.channels+1;
      if (o.delimiter==='fixed'){ if (!Array.isArray(s.columns) || s.columns.length<2 || s.columns.length>LIMITS.channels+1) throw specErr('columns');
        o.columns=s.columns.map((c,i)=>{ onlyKeys(c, ['start','end'], 'columns['+i+']'); if (!intIn(c.start,1,10000) || !intIn(c.end,c.start,10000)) throw specErr('columns['+i+']'); return {start:c.start, end:c.end}; }); maxCol=o.columns.length; }
      else if (s.columns!=null) throw specErr('columns');
      onlyKeys(s.x, ['column','unit','label'], 'x'); if (!intIn(s.x.column,1,maxCol)) throw specErr('x.column');
      o.x={column:s.x.column}; for (const [k,n] of [['unit',20],['label',60]]) if (s.x[k]!=null){ o.x[k]=sstr(s.x[k],n); if (o.x[k]==null) throw specErr('x.'+k); }
      if (s.channels==='all') o.channels='all'; else { o.channels=chans(s.channels, maxCol); if (o.channels.some(c=>c.column===o.x.column)) throw specErr('channels.column'); }
      if (s.meta!=null){ if (!Array.isArray(s.meta) || s.meta.length>20) throw specErr('meta');
        o.meta=s.meta.map((m,i)=>{ onlyKeys(m, ['name','regex'], 'meta['+i+']'); const n=sstr(m.name,40); if (!n) throw specErr('meta['+i+'].name'); return {name:n, regex:okRegex(m.regex,'meta['+i+']')}; }); }
      if (s.sample!=null){ onlyKeys(s.sample, ['regex'], 'sample'); o.sample={regex:okRegex(s.sample.regex,'sample')}; }
      o.onBadLine=s.onBadLine==null?'error':s.onBadLine; if (!['error','skip'].includes(o.onBadLine)) throw specErr('onBadLine');
      return o; }
    if (s.kind==='binary'){
      for (const k of ['encoding','skipLines','comment','delimiter','decimal','headerLine','columns','meta','sample','onBadLine']) if (s[k]!=null) throw specErr(k);
      o.endian=s.endian==null?'little':s.endian; if (!['little','big'].includes(o.endian)) throw specErr('endian');
      if (s.signature!=null){ onlyKeys(s.signature, ['offset','ascii','hex'], 'signature'); const g=s.signature; if (!intIn(g.offset==null?0:g.offset,0,65535)) throw specErr('signature.offset');
        let hex; if (typeof g.ascii==='string' && /^[\x20-\x7e]{1,32}$/.test(g.ascii)) hex=[...g.ascii].map(c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join('');
        else if (typeof g.hex==='string' && /^(?:[0-9a-fA-F]{2}){1,32}$/.test(g.hex)) hex=g.hex.toLowerCase(); else throw specErr('signature');
        o.signature={offset:g.offset==null?0:g.offset, hex}; }
      o.count=fieldOf(s.count, 'count', true); if (o.count.value!=null && !intIn(o.count.value,1,LIMITS.pointsPerChannel)) throw specErr('count');
      onlyKeys(s.data, ['offset','type','columns','layout','scale'], 'data'); const d=s.data;
      o.data={offset:typeof d.offset==='number' ? (intIn(d.offset,0,0x7fffffff)?d.offset:(()=>{ throw specErr('data.offset'); })()) : fieldOf(d.offset,'data.offset',true), type:d.type, columns:d.columns, layout:d.layout==null?'interleaved':d.layout, scale:d.scale==null?1:d.scale};
      if (o.data.offset.value!=null) throw specErr('data.offset');
      if (!BIN_T[o.data.type] || !intIn(o.data.columns,1,LIMITS.channels+1) || !['interleaved','sequential'].includes(o.data.layout) || typeof o.data.scale!=='number' || !Number.isFinite(o.data.scale) || o.data.scale===0) throw specErr('data');
      onlyKeys(s.x, ['column','start','step','unit','label'], 'x');
      if (s.x.column!=null){ if (!intIn(s.x.column,1,o.data.columns) || s.x.start!=null || s.x.step!=null) throw specErr('x'); o.x={column:s.x.column}; }
      else o.x={start:fieldOf(s.x.start,'x.start'), step:fieldOf(s.x.step,'x.step')};
      for (const [k,n] of [['unit',20],['label',60]]) if (s.x[k]!=null){ o.x[k]=sstr(s.x[k],n); if (o.x[k]==null) throw specErr('x.'+k); }
      o.channels=chans(s.channels, o.data.columns); if (o.x.column && o.channels.some(c=>c.column===o.x.column)) throw specErr('channels.column');
      return o; }
    throw specErr('kind');
  }
  /* interprete dei lettori dichiarativi. Autonomo (nessun riferimento esterno): si copia come testo nel worker.
     Restituisce null (file non suo), {error} o il risultato di un lettore JS; i controlli finali li fa validateOutput. */
  function DECL(S, bytes, name){
    var SCAN=65536, LINE=1000, MAXP=2000000;
    function cut(l){ return l.length>LINE ? l.slice(0,LINE) : l; }
    if (S.kind==='binary'){
      var N=bytes.length, dv=new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), le=S.endian!=='big', SZ={u8:1,i8:1,u16:2,i16:2,u32:4,i32:4,f32:4,f64:8};
      var OUT={};
      function rd(off, t){ if (!(off>=0) || off+SZ[t]>N) throw OUT;
        switch(t){ case 'u8': return dv.getUint8(off); case 'i8': return dv.getInt8(off); case 'u16': return dv.getUint16(off,le); case 'i16': return dv.getInt16(off,le);
          case 'u32': return dv.getUint32(off,le); case 'i32': return dv.getInt32(off,le); case 'f32': return dv.getFloat32(off,le); default: return dv.getFloat64(off,le); } }
      function field(f){ return f.value!=null ? f.value : rd(f.offset, f.type); }
      if (S.signature){ var g=S.signature; if (g.offset+g.hex.length/2>N) return null; for (var i=0;i<g.hex.length/2;i++) if (bytes[g.offset+i]!==parseInt(g.hex.substr(2*i,2),16)) return null; }
      try{
        var n=field(S.count); if (!(n>=1) || n!==Math.floor(n)) return {error:'numero di punti non valido ('+n+') / invalid point count'};
        if (n>MAXP) return {error:'troppi punti dichiarati ('+n+') / too many points'};
        var D=S.data, off=typeof D.offset==='number' ? D.offset : field(D.offset), sz=SZ[D.type], nc=D.columns;
        if (off+n*nc*sz>N) return {error:'i dati dichiarati ('+n+' punti da '+nc+' colonne) vanno oltre la fine del file / declared data beyond end of file'};
        var at=function(i,c){ return D.layout==='sequential' ? off+(c*n+i)*sz : off+(i*nc+c)*sz; };
        var col=function(c){ var a=new Float64Array(n); for (var i=0;i<n;i++) a[i]=rd(at(i,c-1),D.type)*D.scale; return a; };
        var xs; if (S.x.column) xs=col(S.x.column); else { var x0=field(S.x.start), dx=field(S.x.step); xs=new Float64Array(n); for (var j=0;j<n;j++) xs[j]=x0+dx*j; }
        var meta=['Lettore dichiarativo (binario)']; if (S.x.label || S.x.unit) meta.push('x: '+(S.x.label||'')+(S.x.unit?' ('+S.x.unit+')':''));
        return {technique:S.technique||null, meta:meta, channels:S.channels.map(function(c,k){ return {name:c.name||('#'+(k+1)), x:xs, y:col(c.column), meta:c.unit?['y: '+c.unit]:[]}; })};
      }catch(e){ if (e===OUT) return {error:'un campo dichiarato è fuori dal file / a declared field is outside the file'}; throw e; }
    }
    var text=new TextDecoder(S.encoding).decode(bytes); if (text.charCodeAt(0)===0xFEFF) text=text.slice(1);
    var lines=text.split(/\r\n|\n|\r/); if (lines.length && lines[lines.length-1]==='') lines.pop();
    if (S.signature){ var re=new RegExp(S.signature.regex), hit=false; for (var a=0;a<Math.min(S.signature.lines, lines.length);a++) if (re.test(cut(lines[a]))){ hit=true; break; } if (!hit) return null; }
    var head=text.slice(0,SCAN).split(/\r\n|\n|\r/), meta=['Lettore dichiarativo (testo)'], sample='';
    function first(rx){ var r=new RegExp(rx); for (var h=0;h<head.length;h++){ var m=r.exec(cut(head[h])); if (m) return (m[1]!==undefined?m[1]:m[0]).trim(); } return null; }
    (S.meta||[]).forEach(function(m){ var v=first(m.regex); if (v!=null) meta.push(m.name+': '+v); });
    if (S.sample){ var sv=first(S.sample.regex); if (sv!=null) sample=sv; }
    function split(l){ if (S.delimiter==='fixed') return S.columns.map(function(c){ return l.slice(c.start-1, c.end); });
      if (S.delimiter==='whitespace') return l.trim().split(/\s+/); return l.split(S.delimiter); }
    function num(s){ if (s==null) return NaN; s=s.trim(); if (s.length>1 && s[0]==='"' && s[s.length-1]==='"') s=s.slice(1,-1).trim(); if (S.decimal===',') s=s.replace(',','.');
      return /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s) ? parseFloat(s) : NaN; }
    var start=S.skipLines, names=null;
    if (S.headerLine){ var hl=start+S.headerLine-1; if (hl>=lines.length) return {error:'manca la riga d\'intestazione '+S.headerLine+' / missing header line'}; names=split(lines[hl]).map(function(s){ return s.trim().replace(/^"(.*)"$/,'$1'); }); start=hl+1; }
    var xs=[], ys=null, cols=null, bad=0;
    for (var i2=start;i2<lines.length;i2++){ var L=lines[i2]; if (!L.trim()) continue;
      if (S.comment && L.trim().indexOf(S.comment)===0){ var c=L.trim().slice(S.comment.length).trim(); if (c && meta.length<200) meta.push(cut(c)); continue; }
      var cells=split(L);
      if (!cols){ if (S.channels==='all'){ cols=[]; for (var k=1;k<=cells.length && cols.length<64;k++) if (k!==S.x.column) cols.push({column:k}); } else cols=S.channels; ys=cols.map(function(){ return []; }); }
      var x=num(cells[S.x.column-1]), row=[], ok=isFinite(x);
      for (var q=0;q<cols.length && ok;q++){ var v=num(cells[cols[q].column-1]); if (!isFinite(v)) ok=false; row.push(v); }
      if (!ok){ if (S.onBadLine==='skip'){ bad++; continue; } return {error:'riga '+(i2+1)+': valore non numerico / line '+(i2+1)+': not a number'}; }
      if (xs.length>=MAXP) return {error:'troppi punti / too many points'};
      xs.push(x); for (var w=0;w<row.length;w++) ys[w].push(row[w]); }
    if (!xs.length || !cols || !cols.length) return {error:'nessuna riga di numeri / no numeric rows'};
    if (bad) meta.push('Righe non numeriche saltate: '+bad);
    if (S.x.label || S.x.unit) meta.push('x: '+(S.x.label||(names&&names[S.x.column-1])||'')+(S.x.unit?' ('+S.x.unit+')':''));
    return {sample:sample, technique:S.technique||null, meta:meta, channels:cols.map(function(c,k){ var nm=c.name || (names && names[c.column-1]) || ('Colonna '+c.column); return {name:nm, x:xs, y:ys[k], meta:c.unit?['y: '+c.unit]:[]}; })};
  }

  /* ---------- lettori WebAssembly ----------
     Il modulo non deve importare niente (niente file, rete, orologio: non c'è niente da importare) e deve esportare
     «memory» con un massimo dichiarato ≤ 256 MB, acch_alloc(len) → ptr e acch_read(ptr, len) → ptr del risultato:
       i32 stato (0 ok, 1 non è mio, 2 errore), i32 canali, i32 punti, f64 x[punti], f64 y[punti] per ogni canale,
       i32 lunghezza, poi JSON UTF-8 facoltativo {channels:[nomi], meta, sample, technique, error}. Little-endian.
     Il «carburante» non esiste nei browser: il limite di tempo è quello del worker. */
  function leb(u, p, end){ let r=0, s=0, b; do { if (p.i>=end || s>28) throw new PluginError('wasm','leb'); b=u[p.i++]; r|=(b&0x7f)<<s; s+=7; } while (b&0x80); return r>>>0; }
  function wasmInfo(u){
    if (!(u instanceof Uint8Array) || u.length<8 || u[0]!==0 || u[1]!==0x61 || u[2]!==0x73 || u[3]!==0x6d) throw new PluginError('wasm','magic');
    if (u[4]!==1 || u[5]|u[6]|u[7]) throw new PluginError('wasm','version');
    const info={imports:0, memories:[], exports:{}}, p={i:8};
    while (p.i<u.length){ const id=u[p.i++], size=leb(u,p,u.length), end=p.i+size; if (end>u.length) throw new PluginError('wasm','section');
      if (id===2){ info.imports+=leb(u,p,end); }
      else if (id===5){ const n=leb(u,p,end); if (n>1) throw new PluginError('wasm','memories'); for (let k=0;k<n;k++){ const fl=leb(u,p,end); if (fl&~1) throw new PluginError('wasm','memory-type'); const min=leb(u,p,end), max=(fl&1)?leb(u,p,end):null; info.memories.push({min, max}); } }
      else if (id===7){ const n=leb(u,p,end); if (n>1000) throw new PluginError('wasm','exports'); for (let k=0;k<n;k++){ const L=leb(u,p,end); if (p.i+L>end) throw new PluginError('wasm','exports'); let nm=''; for (let c=0;c<L;c++) nm+=String.fromCharCode(u[p.i+c]); p.i+=L; if (p.i>=end) throw new PluginError('wasm','exports'); const kind=u[p.i++]; leb(u,p,end); info.exports[nm]=kind; } }
      else if (id>12) throw new PluginError('wasm','section-id');
      p.i=end; }
    return info; }
  function checkWasm(u){ const w=wasmInfo(u);
    if (w.imports) throw new PluginError('wasm-imports', String(w.imports));
    if (w.memories.length!==1 || w.exports.memory!==2) throw new PluginError('wasm','memory');
    if (w.memories[0].max==null || w.memories[0].max>LIMITS.wasmMaxPages || w.memories[0].min>w.memories[0].max) throw new PluginError('wasm-memory', String(w.memories[0].max));
    if (w.exports.acch_alloc!==0 || w.exports.acch_read!==0) throw new PluginError('wasm','exports');
    return w; }
  function WASMRUN(B64, MAXP, bytes){
    var s=atob(B64), u=new Uint8Array(s.length); for (var i=0;i<s.length;i++) u[i]=s.charCodeAt(i);
    var E=new WebAssembly.Instance(new WebAssembly.Module(u), {}).exports, mem=E.memory, len=bytes.length;
    if (mem.buffer.byteLength>MAXP*65536) return {error:'memoria del modulo oltre il limite / module memory over the limit'};
    var ptr=E.acch_alloc(len);
    if (!(ptr>=0) || ptr+len>mem.buffer.byteLength) return {error:'acch_alloc: indirizzo fuori dalla memoria del modulo / address outside module memory'};
    new Uint8Array(mem.buffer, ptr, len).set(bytes);
    var out=E.acch_read(ptr, len)>>>0, B=mem.buffer, N=B.byteLength, dv=new DataView(B);
    if (out+12>N) return {error:'acch_read: risultato fuori dalla memoria / result outside memory'};
    var st=dv.getInt32(out,true), nc=dv.getInt32(out+4,true), n=dv.getInt32(out+8,true);
    if (st===1) return null;
    if (st!==0 && st!==2) return {error:'acch_read: stato sconosciuto '+st};
    if (nc<0 || nc>64 || n<0 || n>2000000) return {error:'acch_read: dimensioni non valide / invalid sizes'};
    var p=out+12; if (p+8*n*(1+nc)+4>N) return {error:'acch_read: risultato fuori dalla memoria / result outside memory'};
    var xs=new Float64Array(n); for (var j=0;j<n;j++) xs[j]=dv.getFloat64(p+8*j,true); p+=8*n;
    var ys=[]; for (var c=0;c<nc;c++){ var y=new Float64Array(n); for (var k=0;k<n;k++) y[k]=dv.getFloat64(p+8*k,true); ys.push(y); p+=8*n; }
    var jl=dv.getInt32(p,true), info={}; p+=4;
    if (jl>0){ if (jl>1000000 || p+jl>N) return {error:'acch_read: JSON fuori dalla memoria / JSON outside memory'};
      try{ info=JSON.parse(new TextDecoder().decode(new Uint8Array(B, p, jl))); }catch(e){ return {error:'acch_read: JSON non valido / invalid JSON'}; }
      if (!info || typeof info!=='object') info={}; }
    if (st===2) return {error:typeof info.error==='string' ? info.error : 'errore del modulo / module error'};
    var names=Array.isArray(info.channels) ? info.channels : [];
    return {sample:typeof info.sample==='string'?info.sample:'', technique:typeof info.technique==='string'?info.technique:null, meta:['Lettore WebAssembly'].concat(Array.isArray(info.meta)?info.meta:[]),
      channels:ys.map(function(y,c){ return {name:typeof names[c]==='string'?names[c]:'', x:xs, y:y}; })};
  }
  // base64 senza dipendenze (browser, desktop e Node)
  const B64='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function fromB64(s){ if (typeof s!=='string' || s.length%4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new PluginError('base64');
    const pad=s.endsWith('==')?2:s.endsWith('=')?1:0, n=s.length/4*3-pad, out=new Uint8Array(n); let o=0;
    for (let i=0;i<s.length;i+=4){ const v=(B64.indexOf(s[i])<<18)|(B64.indexOf(s[i+1])<<12)|((s[i+2]==='='?0:B64.indexOf(s[i+2]))<<6)|(s[i+3]==='='?0:B64.indexOf(s[i+3]));
      if (o<n) out[o++]=v>>16&255; if (o<n) out[o++]=v>>8&255; if (o<n) out[o++]=v&255; }
    return out; }
  function toB64(u){ let s=''; for (let i=0;i<u.length;i+=3){ const v=(u[i]<<16)|((u[i+1]||0)<<8)|(u[i+2]||0); s+=B64[v>>18&63]+B64[v>>12&63]+(i+1<u.length?B64[v>>6&63]:'=')+(i+2<u.length?B64[v&63]:'='); } return s; }

  /* ---------- file d'esempio con il risultato atteso: verificati all'installazione, prima di attivare ---------- */
  function examplesOf(list, manifest){ if (list==null) return [];
    if (!Array.isArray(list) || list.length>LIMITS.examples) throw new PluginError('examples','count');
    let total=0; return list.map((e,i)=>{ if (!isObj(e) || typeof e.name!=='string' || !e.name || e.name.length>100 || !isObj(e.expected)) throw new PluginError('examples', String(i+1));
      const bytes=fromB64(e.data); total+=bytes.length; if (total>LIMITS.examplesBytes) throw new PluginError('examples','size');
      const x=e.expected; if (!(x.none===true || x.error===true || (Array.isArray(x.channels) && x.channels.length && x.channels.every(c=>isObj(c) && Array.isArray(c.x) && Array.isArray(c.y))))) throw new PluginError('examples', String(i+1));
      return {name:clean(e.name,100), bytes, expected:x}; }); }
  // confronto con l'atteso: stessi canali, nomi, lunghezze e numeri (tolleranza relativa 1e-9), stessa tecnica se dichiarata
  function compareExpected(out, x){ const same=(a,b)=>Math.abs(a-b)<=1e-12+1e-9*Math.max(Math.abs(a),Math.abs(b));
    if (x.none) return out.none ? {ok:true} : {ok:false, why:'atteso «non è mio»'};
    if (x.error) return out.error ? {ok:true} : {ok:false, why:'atteso un errore'};
    if (out.none) return {ok:false, why:'il lettore dice che il file non è suo'}; if (out.error) return {ok:false, why:out.error};
    if (out.channels.length!==x.channels.length) return {ok:false, why:'canali: '+out.channels.length+' invece di '+x.channels.length};
    for (let k=0;k<x.channels.length;k++){ const e=x.channels[k], c=out.channels[k];
      if (e.name!=null && e.name!==c.name) return {ok:false, why:'canale '+(k+1)+': nome «'+c.name+'»'};
      if (c.xs.length!==e.x.length || c.ys.length!==e.y.length) return {ok:false, why:'canale '+(k+1)+': '+c.xs.length+' punti invece di '+e.x.length};
      for (let i=0;i<e.x.length;i++) if (!same(c.xs[i],e.x[i]) || !same(c.ys[i],e.y[i])) return {ok:false, why:'canale '+(k+1)+', punto '+(i+1)}; }
    if (x.technique!=null && x.technique!==out.technique) return {ok:false, why:'tecnica «'+out.technique+'»'};
    return {ok:true}; }

  /* ---------- sandbox del Web Worker ----------
     Il testo del worker è: avvio (BOOT) + codice dell'estensione in una funzione. BOOT gira prima di ogni riga dell'estensione e
     - toglie fetch, XMLHttpRequest, WebSocket, EventSource, WebTransport, importScripts, altri worker, IndexedDB, cache,
       BroadcastChannel, file system e navigator, sull'oggetto globale e su tutta la catena dei prototipi, in modo non riconfigurabile;
     - tiene per sé postMessage (l'estensione non può scrivere alla pagina) e risponde a un solo messaggio: {bytes, name};
     - converte l'uscita in Float64Array e scarta subito quelle oltre i limiti (la pagina rifà comunque ogni controllo).
     Le operazioni di un oggetto globale WebIDL ([Global]) stanno sull'oggetto stesso, non sul prototipo: si cercano da lì in su.
     Gli intrinseci si prendono dai letterali ({}.constructor, (0).constructor): una dichiarazione «function Object(){}»
     nell'estensione, che il motore solleva prima di eseguire BOOT, non li cambia.
     Nel desktop la CSP della finestra vale anche per il worker (connect-src senza rete esterna, niente eval). */
  const BLOCKED=['fetch','XMLHttpRequest','WebSocket','WebSocketStream','EventSource','WebTransport','importScripts','Worker','SharedWorker',
    'indexedDB','caches','BroadcastChannel','MessageChannel','RTCPeerConnection','webkitRTCPeerConnection','RTCDataChannel','Notification',
    'requestFileSystem','webkitRequestFileSystem','requestFileSystemSync','webkitRequestFileSystemSync','webkitResolveLocalFileSystemURL',
    'webkitResolveLocalFileSystemSyncURL','postMessage','navigator','IDBFactory','CacheStorage','StorageManager','FileSystemHandle',
    'FileSystemDirectoryHandle','FileSystemFileHandle','FileSystemSyncAccessHandle','ServiceWorkerContainer','LockManager','cookieStore'];
  function BOOT(LIM, NAMES){
    var G=this, O=({}).constructor, N=(0).constructor, dp=O.defineProperty, gpo=O.getPrototypeOf, gopd=O.getOwnPropertyDescriptor, freeze=O.freeze;
    var isFin=N.isFinite, isArr=[].constructor.isArray;
    function find(name){ for (var o=G; o; o=gpo(o)){ var d=gopd(o,name); if (d) return d.value; } return null; }
    var post=find('postMessage').bind(G), listen=find('addEventListener').bind(G);
    var F64=G.Float64Array, F32=G.Float32Array, U8=G.Uint8Array;
    var NAV=freeze({userAgent:'', language:'', onLine:false});
    function blocked(){ throw 'Acchiappaspettri: blocked in extensions (no network, storage, workers or messages)'; }
    // niente codice da testo: eval, Function (anche async e generatori, raggiungibili da .constructor) e i timer con una stringa
    var lock=function(o,k,v){ try{ dp(o,k,{value:v, writable:false, configurable:false, enumerable:false}); }catch(e){} };
    lock(G,'eval',blocked); lock(G,'Function',blocked);
    var protos=[gpo(function(){})]; try{ protos.push(gpo(async function(){})); }catch(e){} try{ protos.push(gpo(function*(){})); }catch(e){} try{ protos.push(gpo(async function*(){})); }catch(e){}
    for (var p=0;p<protos.length;p++) lock(protos[p],'constructor',blocked);
    var st=find('setTimeout'), si=find('setInterval');
    if (st) lock(G,'setTimeout',function(f,ms){ if (typeof f!=='function') blocked(); return st.call(G,f,ms); });
    if (si) lock(G,'setInterval',function(f,ms){ if (typeof f!=='function') blocked(); return si.call(G,f,ms); });
    for (var i=0;i<NAMES.length;i++){ var nm=NAMES[i], val=nm==='navigator'?NAV:(nm==='indexedDB'||nm==='caches'||nm==='cookieStore')?undefined:blocked;
      for (var o=G; o; o=gpo(o)){ if (gopd(o,nm)) try{ dp(o,nm,{value:val, writable:false, configurable:false, enumerable:false}); }catch(e){} }
      try{ dp(G,nm,{value:val, writable:false, configurable:false, enumerable:false}); }catch(e){} }
    var reader=null;
    function register(fn){ if (reader===null && typeof fn==='function') reader=fn; }
    function msg(e){ try{ var s=(e && typeof e==='object' && 'message' in e) ? e.message : e; return (''+s).slice(0, LIM.errorChars); }catch(x){ return '?'; } }
    function arr(a, where){ if (!a) throw {code:'bad-output', msg:where}; var n=a.length; if (!(n>=0) || n>LIM.pointsPerChannel) throw {code:'too-large', msg:where};
      if (a instanceof F64) return a; var out=new F64(n);
      for (var i=0;i<n;i++){ var v=a[i]; if (typeof v!=='number') throw {code:'bad-output', msg:where+': not-number@'+i}; if (!isFin(v)) throw {code:'not-finite', msg:where+'@'+i}; out[i]=v; }
      return out; }
    function pack(r){ if (r==null) return {ok:true, out:null, transfer:[]};
      if (typeof r!=='object') return {ok:false, code:'bad-output', msg:'type'};
      if (typeof r.then==='function') return {ok:false, code:'async'};
      if (r.error!=null) return {ok:true, out:{error:msg(r.error)}, transfer:[]};
      var list=r.channels; if (list==null && r.x!=null) list=[{name:'', x:r.x, y:r.y}];
      if (!isArr(list)) return {ok:false, code:'bad-output', msg:'channels'};
      if (list.length>LIM.channels) return {ok:false, code:'too-large', msg:'channels'};
      var total=0, ch=[], tr=[];
      for (var k=0;k<list.length;k++){ var c=list[k]; if (!c || typeof c!=='object') return {ok:false, code:'bad-output', msg:'channel '+(k+1)};
        var nx=c.x && c.x.length; total+=(nx>0?nx:0); if (total>LIM.points) return {ok:false, code:'too-large', msg:'points'};
        try{ var xs=arr(c.x,'channel '+(k+1)+' x'), ys=arr(c.y,'channel '+(k+1)+' y'); }catch(e){ return {ok:false, code:e.code||'bad-output', msg:e.msg||msg(e)}; }
        var meta=isArr(c.meta) ? c.meta.slice(0, LIM.metaLines).map(function(s){ return typeof s==='string' ? s.slice(0, LIM.metaChars) : typeof s==='number' ? ''+s : ''; }) : null;
        ch.push({name:typeof c.name==='string' ? c.name.slice(0, LIM.nameChars) : '', x:xs, y:ys, meta:meta}); tr.push(xs.buffer); if (ys.buffer!==xs.buffer) tr.push(ys.buffer); }
      var top=isArr(r.meta) ? r.meta.slice(0, LIM.metaLines).map(function(s){ return typeof s==='string' ? s.slice(0, LIM.metaChars) : typeof s==='number' ? ''+s : ''; }) : null;
      return {ok:true, out:{channels:ch, meta:top, sample:typeof r.sample==='string'?r.sample.slice(0,LIM.nameChars):'', technique:typeof r.technique==='string'?r.technique.slice(0,40):null}, transfer:tr.filter(function(b,i){ return tr.indexOf(b)===i; })}; }
    var answered=false;
    listen('message', function(ev){ if (answered) return; answered=true; var m=ev.data, res;
      try{ if (!reader) res={ok:false, code:'no-reader'}; else res=pack(reader(new U8(m.bytes), ''+m.name)); }
      catch(e){ res={ok:false, code:'threw', msg:msg(e)}; }
      var tr=res.transfer||[]; delete res.transfer;
      try{ post(res, tr); }catch(e){ try{ post({ok:false, code:'clone', msg:msg(e)}); }catch(e2){} } });
    return register;
  }
  function sandboxSource(code, lim){
    const L=Object.assign({}, LIMITS, lim||{});
    // const al livello più alto: se il codice dell'estensione «esce» dalla funzione e ridichiara __acchRegister, lo script non si compila
    return 'const __acchRegister=('+BOOT.toString()+').call(this, '+JSON.stringify(L)+', '+JSON.stringify(BLOCKED)+');\n'
      +'(function(registerReader){ "use strict";\n'+String(code)+'\n})(__acchRegister);\n';
  }
  return {FORMAT, FORMAT_VERSION, LIMITS, RESERVED, PERMISSIONS, BLOCKED, PluginError, parsePackage, buildPackage, validateManifest, validateOutput,
    validateReaderSpec, DECL, wasmInfo, checkWasm, WASMRUN, fromB64, toB64, compareExpected,
    cmpVersion, appSatisfies, parseVersion, extOf, handles, fingerprint, sandboxSource, sha256:sha256Of};
});
