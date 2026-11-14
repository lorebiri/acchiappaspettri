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
    channels:64, pointsPerChannel:2000000, points:8000000, minPoints:5, metaLines:200, metaChars:500, nameChars:100, errorChars:300};
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
    if (typeof j.code!=='string' || !j.code.trim()) throw new PluginError('no-code');
    if (j.code.length>LIMITS.codeChars) throw new PluginError('too-large','code');
    if (IMPORT_RE.test(j.code)) throw new PluginError('forbidden-code','import');
    return {manifest, code:j.code, sha256:sha256Of(bytes), size:bytes.length, text};
  }
  /* pacchetto dai sorgenti (scripts/plugin-pack.js e test): sempre gli stessi byte per gli stessi sorgenti */
  function buildPackage(manifest, code){ return JSON.stringify({format:FORMAT, formatVersion:FORMAT_VERSION, manifest, code}, null, 1)+'\n'; }
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
    cmpVersion, appSatisfies, parseVersion, extOf, handles, fingerprint, sandboxSource, sha256:sha256Of};
});
