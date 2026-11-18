// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Mappe e dati iperspettrali (tappa I10): lettura dei file di mappa, vista «Mappa» in Analisi, MCR-ALS sulla mappa, salvataggio nel
   progetto e esportazioni. I calcoli sono in app/map-core.js (pagina, a fette: nessun blocco oltre 50 ms) oppure, nel desktop e per i cubi
   oltre AcchMap.LIMITS.PAGE_BYTES, in Rust (src-tauri/src/maps.rs, stessi numeri: test/unit/dual-mappe.test.js).
   Una mappa è uno spettro della lista (lo spettro medio) con il cubo in f.cube; il grafico degli spettri non si tocca: la mappa ha un suo canvas.
   Desktop: testi sobri e senza emoji; online il tono della pagina. */
(function(win){
  'use strict';
  const doc=win.document, M=win.AcchMap; if (!M) return;
  const $=s=>doc.querySelector(s), en=()=>!!(win.AcchI18n && win.AcchI18n.lang==='en'), T=(it,e)=>en()?e:it, desk=()=>!!win.ACCH_SHELL;
  const WEB=(wIt,wEn,dIt,dEn)=>desk()?T(dIt,dEn):T(wIt,wEn);
  const h=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const dec=()=>en()?'.':',', g=(v,d)=>v==null||!Number.isFinite(+v)?'—':(Math.abs(v)>=1e5||(Math.abs(v)<1e-3&&v!==0))?(+v).toExponential((d||4)-1).replace('.',dec()):String(+(+v).toPrecision(d||4)).replace('.',dec());
  const num=s=>{ const v=parseFloat(String(s).replace(',','.')); return Number.isFinite(v)?v:null; };
  const TAURI=()=>win.__TAURI__ && win.__TAURI__.core;
  const allFiles=()=>(typeof files!=='undefined'?files:[]);
  const isMap=f=>!!(f && (f.cube || f._map));
  const RT={busy:false, sel:null, roi:null, img:new Map(), mcr:new Map(), msg:null};   // stato a runtime (non si salva)
  const COMP_COL=['#1f5fbf','#c25a00','#2a9d5c','#7b4fc9','#b3261e','#0f7c8c'];

  /* ---------------- calcolo a fette (pagina) ---------------- */
  function sliced(gen){ return new Promise((res, rej)=>{ const step=()=>{ const t0=performance.now(); try{ let r; do { r=gen.next(); if (r.done) return res(r.value); } while (performance.now()-t0<12); }catch(e){ return rej(e); } setTimeout(step,0); }; step(); }); }

  /* ---------------- motore: pagina (JS) o Rust (desktop, cubi grandi) ---------------- */
  const wireOf=b=>win.AcchRead.decodeWire(b instanceof ArrayBuffer ? b : new Uint8Array(b).buffer);
  const f64Of=b=>{ const u=b instanceof ArrayBuffer ? new Uint8Array(b) : new Uint8Array(b); const c=u.slice(); return new Float64Array(c.buffer, 0, c.length/8); };
  let jobN=0;
  async function rustOk(){ if (!TAURI() || !win.AcchEngine) return false; try{ const c=await win.AcchEngine.config(); return !!c.rust; }catch(e){ return false; } }
  async function rustOpen(kind, file, bytes, hdr){ const inv=TAURI().invoke, headers={'x-acch-kind':kind, 'x-acch-job':String(++jobN)};
    if (hdr!=null) headers['x-acch-hdr']=encodeURIComponent(hdr);
    let body=bytes ? new Uint8Array(bytes) : new Uint8Array(0); if (file && file.acchPath){ headers['x-acch-path']=encodeURIComponent(file.acchPath); body=new Uint8Array(0); }
    return wireOf(await inv('acch_cube_open', body, {headers})); }
  const Eng={
    async image(f, op){ const R=f._map&&f._map.rust; if (R){ return f64Of(await TAURI().invoke('acch_cube_image', {id:R.id, op:Object.assign({a:0,b:0,a2:0,b2:0,at:0,base:'none'}, op)})); }
      return sliced(M.bandImageGen(f.cube, op)); },
    async pixel(f, ix, iy){ const R=f._map&&f._map.rust; if (R) return f64Of(await TAURI().invoke('acch_cube_pixel', {id:R.id, ix, iy})); return M.pixelSpectrum(f.cube, ix, iy); },
    async roi(f, r){ const R=f._map&&f._map.rust; if (R){ const b=new Uint8Array(await TAURI().invoke('acch_cube_roi', {id:R.id, rect:[r.x0,r.y0,r.x1,r.y1]})); const n=new DataView(b.buffer, b.byteOffset).getUint32(0,true); return {n, mean:f64Of(b.slice(8))}; }
      return sliced(M.roiMeanGen(f.cube, r)); },
    // cubo piccolo per MCR: dal Rust si accorpa fino a stare nei limiti e si porta nella pagina
    async small(f, maxValues){ const R=f._map&&f._map.rust; if (!R) return f.cube; const c=geom(f); let fct=1; while (Math.ceil(c.nx/fct)*Math.ceil(c.ny/fct)*c.nc>maxValues) fct++;
      const inv=TAURI().invoke; let id=R.id, head=c; if (fct>1){ const w=wireOf(await inv('acch_cube_bin', {id, f:fct})); id=w.id; head=w; }
      const np=head.nx*head.ny, d64=(fct>1?'f32':R.dtype)==='f64', A=d64?Float64Array:Float32Array, per=Math.max(1, Math.floor((8<<20)/(head.nc*8))), out=new A(np*head.nc);
      for (let p=0;p<np;p+=per){ const b=new Uint8Array(await inv('acch_cube_take', {id, p0:p, n:per})); out.set(new A(b.slice().buffer), p*head.nc); }
      if (id!==R.id) inv('acch_cube_close', {id}).catch(()=>{});
      return {nx:head.nx, ny:head.ny, nc:head.nc, data:out, x:{values:Float64Array.from(head.x.values), unit:head.x.unit}, px:{values:Float64Array.from(head.px.values), unit:head.px.unit}, py:{values:Float64Array.from(head.py.values), unit:head.py.unit}, y:{}, meta:Object.assign({}, head.meta, {binned:fct})}; }
  };
  // geometria del cubo (anche quando i dati stanno nel Rust)
  const geom=f=>f.cube && f.cube.data ? f.cube : (f._map && f._map.head) || f.cube;

  /* ---------------- lettura: quali file sono mappe ---------------- */
  const ENVI_BIN=/\.(img|bsq|bil|bip|raw)$/i, TEXTISH=/\.(txt|csv|tsv|dat|asc|xy)$/i;
  const baseOf=p=>String(p).replace(/\.[^./\\]*$/,'');
  async function headBytes(file, n){ try{ if (file.slice) return new Uint8Array(await file.slice(0, n).arrayBuffer()); if (file.lazy) return null; return new Uint8Array(await file.arrayBuffer()).subarray(0, n); }catch(e){ return null; } }
  // testo che sembra una mappa: griglia (due celle vuote e poi l'asse) o colonne X Y onda intensità con le prime due costanti
  function looksMapText(u){ const s=new TextDecoder('utf-8').decode(u), L=s.split(/\r\n|\n|\r/).filter(l=>l.trim() && !/^\s*#(?!\s*x\b)/i.test(l)).slice(0,8); if (!L.length) return false;
    if (/^(\t\t|;;|,,)[-+.\d]/.test(L[0]) && (L[0].match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g)||[]).length>=5) return true;
    const rows=L.filter(l=>!/[a-df-zA-DF-Z]/.test(l)).map(l=>l.trim().split(/[\t;,]|\s+/).filter(Boolean)); if (rows.length<4 || rows.some(r=>r.length!==4)) return false;
    return rows.every(r=>r[0]===rows[0][0] && r[1]===rows[0][1]) && new Set(rows.map(r=>r[2])).size===rows.length; }
  /* entries della pagina → {rest, skipped, rejected, added}: le mappe si leggono qui, il resto torna ad addEntries */
  async function take(entries){ const rest=[], skipped=[], rejected=[], jobs=[]; let added=0;
    const byBase=new Map(); entries.forEach(e=>{ if (e && e.file) byBase.set(baseOf(e.path||e.file.name).toLowerCase()+'|'+(String(e.file.name).match(/\.[^.]*$/)||[''])[0].toLowerCase(), e); });
    const used=new Set();
    for (const e of entries){ if (!e || !e.file || e.err){ rest.push(e); continue; } const nm=e.file.name;
      if (/\.wdf$/i.test(nm)){ jobs.push({kind:'wdf', e}); continue; }
      if (/\.hdr$/i.test(nm)){ const b=baseOf(e.path||nm).toLowerCase(); let bin=null; for (const x of ['.img','.bsq','.bil','.bip','.raw','.dat','']){ const c=byBase.get(b+'|'+x); if (c && c!==e){ bin=c; break; } }
        if (!bin){ rejected.push(`${e.path}: ${T('manca il file binario ENVI con lo stesso nome (.img, .bsq, .bil, .bip, .raw)','the ENVI binary file with the same name is missing (.img, .bsq, .bil, .bip, .raw)')}`); continue; }
        used.add(bin); jobs.push({kind:'envi', e, bin}); continue; }
      if (/^\d{1,3}$/.test((nm.match(/\.([^.]*)$/)||[])[1]||'') ){ const u=await headBytes(e.file, 1024); if (u && u.length>600 && M.isOpusSeries(u)){ jobs.push({kind:'opus-series', e}); continue; } }
      if (TEXTISH.test(nm)){ const u=await headBytes(e.file, 16384); if (u && looksMapText(u)){ jobs.push({kind:'text', e}); continue; } }
      rest.push(e); }
    // binari ENVI senza intestazione: non sono spettri
    const out=rest.filter(e=>!used.has(e)).filter(e=>{ if (e && e.file && ENVI_BIN.test(e.file.name)){ skipped.push(e.path+' '+T('(binario ENVI senza .hdr)','(ENVI binary without .hdr)')); return false; } return true; });
    for (const j of jobs){ try{ const r=await readJob(j); if (r==='text-no') out.push(j.e); else if (r) added++; }catch(err){ console.error(err); rejected.push(`${j.e.path}: ${errText(err)}`); } }
    if (added) setTimeout(()=>{ try{ win.toast(WEB('🗺️ Mappa caricata: la trovi in «Analisi» → «Mappa».','🗺️ Map loaded: see «Analysis» → «Map».','Mappa caricata: vedi Analisi → Mappa.','Map loaded: see Analysis → Map.')); }catch(e){} }, 60);
    return {rest:out, skipped, rejected, added}; }
  function errText(e){ const c=e && (e.code || String(e.message||e).split(':')[0]), MSG={
      'too-large':T('mappa troppo grande per questa versione','map too large for this version'), truncated:T('file troncato','truncated file'), 'not-wdf':T('non è un file .wdf','not a .wdf file'),
      'wdf-header':T('intestazione .wdf non valida','invalid .wdf header'), 'wdf-blocks':T('blocchi DATA o XLST mancanti','DATA or XLST block missing'), 'envi-type':T('tipo di dati ENVI non supportato (complessi)','unsupported ENVI data type (complex)'),
      'envi-header':T('intestazione ENVI incompleta','incomplete ENVI header'), 'envi-interleave':T('disposizione ENVI sconosciuta','unknown ENVI interleave'), 'map-duplicate':T('pixel ripetuto nel file','repeated pixel in the file'),
      'online-limit':T(`mappa oltre ${M.LIMITS.PAGE_BYTES>>20} MB: troppo grande per la versione online, usa l'app desktop`,`map over ${M.LIMITS.PAGE_BYTES>>20} MB: too large for the online version, use the desktop app`),
      'no-rust':T('mappa grande: serve il motore nativo dell\'app, che non è attivo','large map: the app native engine is needed and is not active')};
    return MSG[c] || T('mappa non leggibile','unreadable map')+(c?' ('+c+')':''); }
  async function sizeOf(file){ if (file.size>0) return file.size; if (file.acchPath && TAURI()){ try{ return await TAURI().invoke('acch_cube_stat', {path:file.acchPath}); }catch(e){} } return -1; }
  async function readJob(j){ const e=j.e, file=e.file, big=Math.max(await sizeOf(file), j.bin ? await sizeOf(j.bin.file) : 0)>M.LIMITS.PAGE_BYTES;
    const hdr=j.kind==='envi' ? new TextDecoder('latin1').decode(new Uint8Array(await file.arrayBuffer())) : null, srcFile=j.kind==='envi' ? j.bin.file : file;
    if (big){ if (!TAURI()) throw Object.assign(new Error('online-limit'),{code:'online-limit'}); if (!await rustOk()) throw Object.assign(new Error('no-rust'),{code:'no-rust'});
      const W=await rustOpen(j.kind, srcFile, srcFile.acchPath ? null : await srcFile.arrayBuffer(), hdr);
      const head={nx:W.nx, ny:W.ny, nc:W.nc, x:{values:Float64Array.from(W.x.values), unit:W.x.unit, quantity:W.x.quantity}, px:{values:Float64Array.from(W.px.values), unit:W.px.unit}, py:{values:Float64Array.from(W.py.values), unit:W.py.unit}, y:{quantity:W.yq}, meta:Object.assign({}, W.meta, {source:{name:file.name, bytes:W.bytes, sha256:W.sha256}})};
      addMap({name:file.name, path:e.path, head, rust:{id:W.id, disk:!!W.disk, dtype:W.dtype}, mean:W.mean, size:W.bytes, memory:pend(e.path)}); return true; }
    const buf=await srcFile.arrayBuffer();
    let cube; if (j.kind==='text'){ cube=M.read('text', buf); if (!cube) return 'text-no'; } else cube=await sliced(M.readGen(j.kind, buf, hdr));   // a fette: nessun blocco lungo
    if (M.bytesOf(cube)>M.LIMITS.PAGE_BYTES) throw Object.assign(new Error('too-large'),{code:'too-large'});
    let sha=null; try{ if (buf.byteLength<=64<<20 && win.AcchFormat) sha=win.AcchFormat.sha256(new Uint8Array(buf)); }catch(_){}
    cube.meta=Object.assign({}, cube.meta, {source:{name:file.name, bytes:buf.byteLength, sha256:sha}});
    const mean=(await sliced(M.roiMeanGen(cube, {x0:0, y0:0, x1:cube.nx-1, y1:cube.ny-1}))).mean;
    addMap({name:file.name, path:e.path, cube, mean, size:buf.byteLength, memory:pend(e.path)}); return true; }
  const pend=p=>win.ACCH_PENDING_MEM && win.ACCH_PENDING_MEM.get ? win.ACCH_PENDING_MEM.get(p)||null : null;

  /* ---------------- lo spettro della lista: lo spettro medio della mappa ---------------- */
  function addMap(o){ const g0=o.cube||o.head, x=g0.x.values, n=x.length, asc=!(x[0]>x[n-1]);
    const xs=new Float64Array(n), ys=new Float64Array(n); for (let i=0;i<n;i++){ const k=asc?i:n-1-i; xs[i]=x[k]; ys[i]=Number.isFinite(o.mean[k])?o.mean[k]:0; }
    const fmt=(g0.meta&&g0.meta.format)||'', meta=['Mappa '+fmt+' '+g0.nx+' x '+g0.ny+' x '+g0.nc];
    const det=fmt==='wdf' ? {instr:'raman', reason:T('mappa Renishaw .wdf','Renishaw .wdf map')} : fmt==='opus-series' ? {instr:'ftir', reason:T('serie Bruker OPUS','Bruker OPUS series')} : (()=>{ try{ return detectInstrument({xs, ys, meta, pe:null}, o.name); }catch(e){ return {instr:'gen', reason:''}; } })();
    const instr=(typeof INSTR!=='undefined' && INSTR[det.instr]) ? det.instr : 'gen';
    const f={id:(typeof uid!=='undefined' ? ++uid : Date.now()), name:o.name, path:o.path, size:o.size||0, xs, xs0:xs, ys, meta, peY:null, xrf:null, tube:'', uncal:false, ecal:null,
      instr, autoInstr:instr, reason:(det.reason||'')+' · '+T('spettro medio della mappa','mean spectrum of the map'), include:true, removed:[], added:[], labels:{}, title:'', desc:'', xr:null};
    f._p={peY:null, ys, meta}; f.raw=null; f.rawBin=false; f.n0=n; f.nCols=2; f.ycolNow=1; f.xSeconds=false; f.importIssue=null;
    f.hash='cube:'+((g0.meta&&g0.meta.source&&g0.meta.source.sha256)||o.path);
    if (o.cube) f.cube=o.cube; else { f._map={head:o.head, rust:o.rust||null, missing:o.missing||null}; if (o.record) f.cube=o.record; }
    if (o.rust) f._map.rust=o.rust; f._mapMean=o.mean;
    try{ if (typeof postDetect==='function') postDetect(f, {meta}); }catch(e){}
    const mm=o.memory; if (mm){ if (typeof mm.title==='string') f.title=mm.title.slice(0,300); if (typeof mm.desc==='string') f.desc=mm.desc.slice(0,5000); if (mm.include===false) f.include=false; if (mm.instr && INSTR[mm.instr]) f.instr=mm.instr; if (typeof cleanAn==='function') f.an=cleanAn(mm.an); }
    try{ f.kind=typeof kindOf==='function'?kindOf(f):'A'; }catch(e){ f.kind='A'; }
    allFiles().push(f); if (typeof persist==='function') try{ persist(f); }catch(e){}
    return f; }
  const viewOpt=f=>{ const g0=geom(f), m=(g0&&g0.meta)||{}; return Object.assign({kind:'area', base:'linear', cmap:'cividis', scale:'p'}, m.view||{}); };
  function setView(f, v){ const g0=geom(f); g0.meta=Object.assign({}, g0.meta||{}, {view:Object.assign(viewOpt(f), v)}); if (f.cube && f.cube!==g0) f.cube.meta=Object.assign({}, f.cube.meta||{}, {view:g0.meta.view}); if (typeof persist==='function') try{ persist(f); }catch(e){} }

  /* ---------------- progetto: apertura e salvataggio ---------------- */
  // apertura: cubo nel progetto (f.cube con i dati) o nel file affiancato .acchcube (desktop)
  function restore(rec, projectPath){ if (!rec || !rec.cube) return false; const cb=rec.cube;
    if (cb.data){ const cube=M.fromRecord(cb); if (!cube) return false; const mean=M.meanSpectrum(cube).mean; addMap({name:rec.name||'mappa', path:rec.path||'mappa', cube, mean, size:M.bytesOf(cube), memory:rec.memory}); return true; }
    if (!cb.external) return false;
    const head={nx:cb.nx, ny:cb.ny, nc:cb.nc, x:{values:Float64Array.from(cb.x.values), unit:cb.x.unit||'', quantity:cb.x.quantity||''}, px:{values:Float64Array.from(cb.px.values), unit:cb.px.unit||''}, py:{values:Float64Array.from(cb.py.values), unit:cb.py.unit||''}, y:cb.y||{}, meta:cb.meta||{}};
    const mean=Array.isArray(head.meta.mean) && head.meta.mean.length===cb.nc ? Float64Array.from(head.meta.mean) : new Float64Array(cb.nc);
    const f=addMap({name:rec.name||'mappa', path:rec.path||'mappa', head, record:cb, mean, size:cb.external.bytes, memory:rec.memory, missing:'pending'});
    f._map.pending=openSide(f, cb, projectPath); return true; }
  async function openSide(f, cb, projectPath){ const e=cb.external;
    try{ if (!TAURI() || !projectPath) throw Object.assign(new Error('side-missing'),{code:'side-missing'}); if (!await rustOk()) throw Object.assign(new Error('no-rust'),{code:'no-rust'});
      const W=wireOf(await TAURI().invoke('acch_cube_side_open', {project:projectPath, name:e.file, bytes:e.bytes, sha256:e.sha256, x:{values:Array.from(cb.x.values), unit:cb.x.unit||'', quantity:cb.x.quantity||''}, px:{values:Array.from(cb.px.values), unit:cb.px.unit||''}, py:{values:Array.from(cb.py.values), unit:cb.py.unit||''}}));
      f._map.rust={id:W.id, disk:true, dtype:W.dtype}; f._map.missing=null; f._map.sideAt=projectPath; }
    catch(err){ const c=String(err && (err.code||err.message||err)).split(':')[0]; f._map.missing=c; console.warn('[mappe] file affiancato non aperto: '+c);
      win.toast(WEB('⚠️ ','⚠️ ','','')+T(`Mappa «${f.name}»: il file affiancato «${e.file}» ${c==='side-integrity'||c==='side-size'?'non corrisponde a quello salvato (impronta diversa)':'non si trova accanto al progetto'}. La mappa resta nel progetto ma non si può mostrare.`,`Map «${f.name}»: the side file «${e.file}» ${c==='side-integrity'||c==='side-size'?'does not match the saved one (different fingerprint)':'is not next to the project'}. The map stays in the project but cannot be shown.`)); }
    try{ render(); }catch(_){} }
  /* prima di salvare (desktop): i cubi nel Rust si scrivono nel file affiancato accanto al progetto; senza percorso restano fuori (avviso del progetto) */
  async function beforeBuild(projectPath){ const L=allFiles().filter(f=>f._map && f._map.rust); if (!L.length) return;
    const base=projectPath ? String(projectPath).split(/[\\/]/).pop().replace(/\.acchspettri$/i,'') : null; let k=0;
    for (const f of L){ k++; const g0=geom(f), rec={nx:g0.nx, ny:g0.ny, nc:g0.nc, x:g0.x, px:g0.px, py:g0.py, y:g0.y||{}, dtype:f._map.rust.dtype||'f32', data:null, meta:Object.assign({}, g0.meta||{}, {mean:Array.from(f._mapMean||[], v=>Number.isFinite(v)?v:0)})};
      if (!base){ f.cube=undefined; continue; }
      const name=base.replace(/[\\/:\0]/g,'_')+'.'+k+'.acchcube';
      if (f.cube && f.cube.external && f.cube.external.file===name && f._map.sideAt===projectPath) continue;   // già accanto a questo progetto
      try{ win.loader && win.loader(true, T('Scrivo la mappa accanto al progetto…','Writing the map next to the project…'), name, null);
        const r=await TAURI().invoke('acch_cube_side_write', {id:f._map.rust.id, project:projectPath, name}); rec.external={file:name, bytes:r.bytes, sha256:r.sha256}; f.cube=rec; f._map.sideAt=projectPath; }
      catch(e){ console.error(e); f.cube=undefined; win.toast(T('Mappa «'+f.name+'» non salvata accanto al progetto: ','Map «'+f.name+'» not saved next to the project: ')+String(e).slice(0,120)); } } }
  function hookProject(){ const P=win.AcchProject; if (!P) return; const prev=P.restoreDerived; P.restoreDerived=(rec, where)=>restore(rec, where) || (typeof prev==='function' ? prev(rec, where) : false);
    const pb=P.beforeBuild; P.beforeBuild=async where=>{ if (typeof pb==='function') await pb(where); await beforeBuild(where); }; }

  /* ---------------- immagine e disegno ---------------- */
  const OPS=()=>({area:T('Area di una banda','Band area'), height:T('Altezza di una banda','Band height'), ratio:T('Rapporto fra due aree','Ratio of two areas'), peak:T('Posizione del picco','Peak position'), intensity:T('Intensità a un valore','Intensity at a value')});
  const xUnit=f=>{ const u=(geom(f).x.unit||''); return u==='cm-1'?'cm⁻¹':u; };
  function defaults(f, v){ const x=geom(f).x.values, lo=Math.min(x[0],x[x.length-1]), hi=Math.max(x[0],x[x.length-1]), P=f.ys, X=f.xs; let k=0; for (let i=1;i<P.length;i++) if (P[i]>P[k]) k=i;
    const c=X[k], w=(hi-lo)*0.03; return Object.assign({a:+(c-w).toPrecision(6), b:+(c+w).toPrecision(6), a2:+(lo+(hi-lo)*0.6).toPrecision(6), b2:+(lo+(hi-lo)*0.7).toPrecision(6), at:+c.toPrecision(6)}, v); }
  function opOf(f){ const v=defaults(f, viewOpt(f)); if (/^mcr\d$/.test(v.kind)) return {kind:v.kind}; return {kind:v.kind, a:v.a, b:v.b, a2:v.a2, b2:v.b2, at:v.at, base:v.base}; }
  const keyOp=o=>JSON.stringify(o);
  async function imageOf(f){ const op=opOf(f), k=keyOp(op), c=RT.img.get(f); if (c && c.key===k) return c;
    let img, nx, ny, px, py, unit;
    if (/^mcr\d$/.test(op.kind)){ const R=RT.mcr.get(f); if (!R) return null; const q=+op.kind.slice(3); if (q>=R.nc) return null; img=R.maps[q]; nx=R.nx; ny=R.ny; px=R.px; py=R.py; unit=T('concentrazione relativa','relative concentration'); }
    else { const g0=geom(f); img=await Eng.image(f, op); nx=g0.nx; ny=g0.ny; px=g0.px.values; py=g0.py.values; unit=op.kind==='peak' ? xUnit(f) : op.kind==='ratio' ? '' : T('u.a.','a.u.'); }
    const out={key:k, img, nx, ny, px, py, unit, label:labelOf(f, op)}; RT.img.set(f, out); return out; }
  function labelOf(f, op){ const u=xUnit(f), r=(a,b)=>`${g(Math.min(a,b),5)}–${g(Math.max(a,b),5)} ${u}`;
    if (/^mcr\d$/.test(op.kind)) return 'MCR-ALS '+T('componente','component')+' '+(+op.kind.slice(3)+1);
    return op.kind==='ratio' ? `${OPS().ratio}: ${r(op.a,op.b)} / ${r(op.a2,op.b2)}` : op.kind==='intensity' ? `${OPS().intensity}: ${g(op.at,5)} ${u}` : `${OPS()[op.kind]}: ${r(op.a,op.b)}${op.base==='linear'&&op.kind!=='peak'?T(', fondo lineare',', linear baseline'):''}`; }
  // disegno su un canvas: immagine (pixel quadrati secondo il passo delle coordinate), scala dei colori con i valori, assi con le unità
  function paint(cv, I, v, opt){ opt=opt||{}; const ctx=cv.getContext('2d'), Wt=cv.width, Ht=cv.height, k=opt.k||1, pad={l:46*k, r:78*k, t:8*k, b:34*k};
    const R=I.range || (I.range=M.range(I.img, v.scale==='minmax'?'minmax':'p')) || [0,1], rgba=M.colorize(I.img, R[0], R[1], v.cmap);
    const off=doc.createElement('canvas'); off.width=I.nx; off.height=I.ny; off.getContext('2d').putImageData(new ImageData(rgba, I.nx, I.ny), 0, 0);
    const dx=I.nx>1?Math.abs(I.px[1]-I.px[0]):1, dy=I.ny>1?Math.abs(I.py[1]-I.py[0]):dx, aspect=(I.ny>1 && dx>0 && dy>0) ? (I.nx*dx)/(I.ny*dy) : Math.max(4, I.nx/Math.max(1,I.ny));
    const aw=Wt-pad.l-pad.r, ah=Ht-pad.t-pad.b; let w=aw, hh=w/aspect; if (hh>ah){ hh=ah; w=hh*aspect; }
    const x0=pad.l, y0=pad.t; ctx.fillStyle=opt.bg||'#fff'; ctx.fillRect(0,0,Wt,Ht); ctx.fillStyle='#d8d8d8'; ctx.fillRect(x0,y0,w,hh);
    ctx.imageSmoothingEnabled=false; ctx.drawImage(off, x0, y0, w, hh); ctx.strokeStyle='#888'; ctx.lineWidth=k; ctx.strokeRect(x0,y0,w,hh);
    const geo={x0, y0, w, hh, nx:I.nx, ny:I.ny};
    // assi: primo e ultimo valore delle coordinate
    ctx.fillStyle='#333'; ctx.font=`${11*k}px Helvetica, Arial, sans-serif`; ctx.textAlign='center';
    const pu=(I.punit||'')?` (${I.punit})`:''; ctx.fillText(`x${pu}`, x0+w/2, y0+hh+28*k); ctx.textAlign='left'; ctx.fillText(g(I.px[0],5), x0, y0+hh+14*k); ctx.textAlign='right'; ctx.fillText(g(I.px[I.nx-1],5), x0+w, y0+hh+14*k);
    if (I.ny>1){ ctx.save(); ctx.translate(x0-30*k, y0+hh/2); ctx.rotate(-Math.PI/2); ctx.textAlign='center'; ctx.fillText(`y${pu}`, 0, 0); ctx.restore(); ctx.textAlign='right'; ctx.fillText(g(I.py[0],5), x0-4*k, y0+10*k); ctx.fillText(g(I.py[I.ny-1],5), x0-4*k, y0+hh); }
    // scala dei colori
    const bx=x0+w+12*k, bw=12*k, bh=Math.max(60*k, hh); for (let i=0;i<bh;i++){ ctx.fillStyle=M.cssColor(v.cmap, 1-i/(bh-1)); ctx.fillRect(bx, y0+i, bw, 1.2); } ctx.strokeStyle='#888'; ctx.strokeRect(bx, y0, bw, bh);
    ctx.fillStyle='#333'; ctx.textAlign='left'; [[R[1],0],[(R[0]+R[1])/2,0.5],[R[0],1]].forEach(([val,t])=>ctx.fillText(g(val,4), bx+bw+4*k, y0+t*bh+(t===0?9*k:t===1?0:4*k)));
    if (I.unit){ ctx.save(); ctx.translate(Wt-6*k, y0+bh/2); ctx.rotate(-Math.PI/2); ctx.textAlign='center'; ctx.fillText(I.unit, 0, 0); ctx.restore(); }
    if (opt.sel && RT.sel && RT.sel.f===opt.f){ const s=RT.sel; ctx.strokeStyle='#e03'; ctx.lineWidth=2*k; ctx.strokeRect(x0+s.ix*w/I.nx, y0+s.iy*hh/I.ny, Math.max(2,w/I.nx), Math.max(2,hh/I.ny)); }
    if (opt.sel && RT.roi && RT.roi.f===opt.f){ const r=RT.roi; ctx.strokeStyle='#fff'; ctx.setLineDash([4*k,3*k]); ctx.lineWidth=2*k; ctx.strokeRect(x0+Math.min(r.x0,r.x1)*w/I.nx, y0+Math.min(r.y0,r.y1)*hh/I.ny, (Math.abs(r.x1-r.x0)+1)*w/I.nx, (Math.abs(r.y1-r.y0)+1)*hh/I.ny); ctx.setLineDash([]); }
    return geo; }
  // spettro (pixel, regione, medio) in SVG
  function specSvg(f, list, W, H){ W=W||420; H=H||220; const m={l:52, r:10, t:10, b:34}, X0=m.l, X1=W-m.r, Y0=H-m.b, Y1=m.t, x=geom(f).x.values;
    let ylo=Infinity, yhi=-Infinity; list.forEach(s=>{ for (const v of s.y) if (Number.isFinite(v)){ if (v<ylo) ylo=v; if (v>yhi) yhi=v; } }); if (!(yhi>ylo)){ yhi=ylo+1; if (!Number.isFinite(ylo)){ ylo=0; yhi=1; } }
    const xlo=Math.min(x[0],x[x.length-1]), xhi=Math.max(x[0],x[x.length-1]), inv=geom(f).x.unit==='cm-1' && f.instr==='ftir';
    const sx=v=>inv ? X1-(v-xlo)/(xhi-xlo||1)*(X1-X0) : X0+(v-xlo)/(xhi-xlo||1)*(X1-X0), sy=v=>Y0+(v-ylo)/(yhi-ylo)*(Y1-Y0), o=[];
    const v=defaults(f, viewOpt(f)); if (!/^mcr/.test(v.kind) && v.kind!=='intensity'){ const a=sx(v.a), b=sx(v.b); o.push(`<rect x="${Math.min(a,b).toFixed(1)}" y="${Y1}" width="${Math.abs(b-a).toFixed(1)}" height="${Y0-Y1}" fill="#888" fill-opacity=".12"/>`); }
    o.push(`<rect x="${X0}" y="${Y1}" width="${X1-X0}" height="${Y0-Y1}" fill="none" stroke="currentColor" stroke-opacity=".5"/>`);
    list.forEach(s=>{ const st=Math.max(1, Math.floor(s.y.length/1500)), p=[]; for (let i=0;i<s.y.length;i+=st) if (Number.isFinite(s.y[i])) p.push(sx(x[i]).toFixed(1)+','+sy(s.y[i]).toFixed(1)); o.push(`<polyline fill="none" stroke="${s.color}" stroke-width="${s.w||1.4}"${s.dash?' stroke-dasharray="4 3"':''} points="${p.join(' ')}"/>`); });
    o.push(`<text x="${(X0+X1)/2}" y="${H-6}" font-size="11" text-anchor="middle" fill="currentColor">${h(xUnit(f))}</text><text x="${X0}" y="${Y0+14}" font-size="10" fill="currentColor">${h(g(inv?xhi:xlo,5))}</text><text x="${X1}" y="${Y0+14}" font-size="10" text-anchor="end" fill="currentColor">${h(g(inv?xlo:xhi,5))}</text><text x="${X0-4}" y="${Y1+9}" font-size="10" text-anchor="end" fill="currentColor">${h(g(yhi,3))}</text><text x="${X0-4}" y="${Y0}" font-size="10" text-anchor="end" fill="currentColor">${h(g(ylo,3))}</text>`);
    let ly=Y1+12; list.filter(s=>s.label).forEach(s=>{ o.push(`<line x1="${X1-130}" y1="${ly-4}" x2="${X1-114}" y2="${ly-4}" stroke="${s.color}" stroke-width="2"${s.dash?' stroke-dasharray="4 3"':''}/><text x="${X1-110}" y="${ly}" font-size="10" fill="currentColor">${h(s.label)}</text>`); ly+=13; });
    return `<svg class="mapspec" viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" role="img" aria-label="${h(T('Spettri della mappa','Map spectra'))}">${o.join('')}</svg>`; }

  /* ---------------- sezione «Mappa» in Analisi ---------------- */
  function cur_(){ try{ return (typeof files!=='undefined' && typeof cur!=='undefined' && cur>=0) ? files[cur] : null; }catch(e){ return null; } }
  function ensure(){ let d=$('#secMap'); if (d) return d; const host=$('[data-panel="an"]'); if (!host) return null;
    d=doc.createElement('details'); d.className='ansec'; d.id='secMap'; d.hidden=true; d.innerHTML='<summary><b id="mapTitle" data-noi18n></b><span class="secsum" id="sumMap" data-noi18n></span><span class="scope s-one" id="mapScope" data-noi18n></span></summary><div class="in" id="mapBox" data-noi18n></div>';
    const q=$('#secQual'); if (q) host.insertBefore(d, q); else host.appendChild(d); d.addEventListener('toggle', ()=>{ if (d.open) render(); }); return d; }
  let lastF=null, renderSeq=0;
  async function render(){ const d=ensure(); if (!d) return; const f=cur_(); d.hidden=!isMap(f); if (!isMap(f)) return;
    $('#mapTitle').textContent=WEB('🗺️ Mappa','🗺️ Map','Mappa','Map'); $('#mapScope').textContent=T('solo questa mappa','this map only');
    const g0=geom(f); $('#sumMap').textContent=`${g0.nx} × ${g0.ny} × ${g0.nc}`;
    if (f!==lastF){ lastF=f; if (!d.open) d.open=true; }
    if (!d.open) return; const box=$('#mapBox'), v=defaults(f, viewOpt(f)), seq=++renderSeq, meta=g0.meta||{};
    const src=[meta.format==='wdf'?'Renishaw .wdf':meta.format==='envi'?'ENVI '+String(meta.interleave||'').toUpperCase():meta.format==='opus-series'?T('serie Bruker OPUS (struttura dedotta)','Bruker OPUS series (inferred structure)'):meta.format==='text'?T('testo a mappa','text map'):meta.format||''].filter(Boolean).join('');
    const notes=[]; if (meta.complete===false) notes.push(T('misura incompleta: i pixel non misurati sono grigi','incomplete measurement: unmeasured pixels are grey'));
    if (meta.layout==='unknown' || /-line$/.test(meta.layout||'')) notes.push(T('disposizione dei pixel non nota: indica le colonne','pixel layout unknown: enter the columns'));
    if (f._map && f._map.rust) notes.push(f._map.rust.disk?T('cubo letto dal disco dal motore nativo','cube read from disk by the native engine'):T('cubo nel motore nativo','cube in the native engine'));
    if (f._map && f._map.missing==='pending') notes.push(T('apertura del file affiancato…','opening the side file…'));
    const ops=OPS(), R=RT.mcr.get(f), kinds=Object.keys(ops).map(k=>`<option value="${k}" ${v.kind===k?'selected':''}>${h(ops[k])}</option>`).concat(R?Array.from({length:R.nc},(_,q)=>`<option value="mcr${q}" ${v.kind==='mcr'+q?'selected':''}>MCR-ALS ${T('componente','component')} ${q+1}</option>`):[]).join('');
    const nf=(id,val,lab)=>`<label class="ibf"><span>${h(lab)}</span><input type="text" inputmode="decimal" id="${id}" value="${val==null?'':String(val).replace('.',dec())}" style="width:90px"></label>`;
    const rng=v.kind==='intensity' ? nf('mpAt',v.at,T('Valore','Value')+' ('+xUnit(f)+')') : /^mcr/.test(v.kind) ? '' : nf('mpA',v.a,T('Da','From')+' ('+xUnit(f)+')')+nf('mpB',v.b,T('a','to'))+(v.kind==='ratio'?nf('mpA2',v.a2,T('diviso da','divided by'))+nf('mpB2',v.b2,T('a','to')):'')
      +(v.kind!=='peak'?`<label class="ibf"><span>${T('Fondo','Baseline')}</span><select id="mpBase"><option value="linear" ${v.base==='linear'?'selected':''}>${T('lineare fra gli estremi','linear between the ends')}</option><option value="none" ${v.base!=='linear'?'selected':''}>${T('nessuno','none')}</option></select></label>`:'');
    box.innerHTML=`<p class="why">${WEB('Ogni pixel ha il suo spettro: scegli che cosa mostrare come immagine. Un clic su un pixel mostra il suo spettro; trascina per scegliere una regione e vederne lo spettro medio.','Each pixel has its own spectrum: choose what to show as an image. Click a pixel to see its spectrum; drag to select a region and see its mean spectrum.','Immagine calcolata pixel per pixel. Clic su un pixel: il suo spettro. Trascinamento: spettro medio della regione. Frecce della tastiera: pixel accanto.','Image computed pixel by pixel. Click a pixel: its spectrum. Drag: mean spectrum of the region. Arrow keys: neighbouring pixel.')}</p>
      <p class="opt-l">${h(src)} · ${g0.nx} × ${g0.ny} ${T('pixel','pixels')} · ${g0.nc} ${T('canali','channels')}${g0.px.unit?' · '+T('passo','step')+' '+g(g0.nx>1?Math.abs(g0.px.values[1]-g0.px.values[0]):0,4)+' '+h(g0.px.unit):''}${notes.length?' · '+h(notes.join(' · ')):''}</p>
      ${f._map && f._map.missing && f._map.missing!=='pending' ? `<div class="signote">${h(T('Il cubo di questa mappa non è disponibile: ','The cube of this map is not available: ')+(f._map.missing==='side-integrity'||f._map.missing==='side-size'?T('il file affiancato è diverso da quello salvato.','the side file differs from the saved one.'):T('il file affiancato non è accanto al progetto.','the side file is not next to the project.')))}</div>` : ''}
      <div class="ibfields"><label class="ibf"><span>${T('Immagine','Image')}</span><select id="mpKind">${kinds}</select></label>${rng}
        <label class="ibf"><span>${T('Colori','Colours')}</span><select id="mpCmap"><option value="cividis" ${v.cmap!=='viridis'?'selected':''}>cividis</option><option value="viridis" ${v.cmap==='viridis'?'selected':''}>viridis</option></select></label>
        <label class="ibf"><span>${T('Estremi della scala','Scale limits')}</span><select id="mpScale"><option value="p" ${v.scale!=='minmax'?'selected':''}>${T('percentili 1–99','percentiles 1–99')}</option><option value="minmax" ${v.scale==='minmax'?'selected':''}>${T('minimo e massimo','minimum and maximum')}</option></select></label></div>
      ${g0.ny===1?`<div class="ibfields"><label class="ibf"><span>${T('Colonne della mappa','Map columns')}</span><input type="number" id="mpCols" min="1" step="1" value="${g0.nx}" style="width:90px"></label><button class="btn small ghost" id="mpReshape">${T('Disponi','Arrange')}</button></div>`:''}
      <div class="mapgrid"><figure><canvas id="mapCv" width="520" height="360" tabindex="0" role="img" aria-label="${h(T('Immagine della mappa','Map image'))}" style="width:100%;max-width:520px;cursor:crosshair;touch-action:none"></canvas><figcaption id="mapCap"></figcaption></figure>
        <figure><div id="mapSpec"></div><figcaption id="mapSpecCap"></figcaption><div class="row" style="gap:6px;margin-top:4px"><button class="btn small ghost" id="mpSpecCsv" disabled>${T('Spettro in CSV','Spectrum as CSV')}</button><button class="btn small ghost" id="mpImgCsv">${T('Immagine in CSV','Image as CSV')}</button><button class="btn small ghost" id="mpPng">PNG</button></div></figure></div>
      <h4 class="anh">MCR-ALS ${T('sulla mappa','on the map')}</h4>
      <p class="why">${WEB('Scompone la mappa in componenti pure (spettri) e mostra dove sta ciascuna. I pixel diventano le righe della matrice; le mappe grandi si accorpano prima del calcolo.','Decomposes the map into pure components (spectra) and shows where each one is. Pixels become the rows of the matrix; large maps are binned before the calculation.','Cubo srotolato (pixel × canali); mappe grandi accorpate per stare nei limiti del calcolo. Le concentrazioni diventano immagini.','Unfolded cube (pixels × channels); large maps are binned to fit the calculation limits. Concentrations become images.')}</p>
      <div class="ibfields"><label class="ibf"><span>${T('Componenti','Components')}</span><select id="mpNc">${[2,3,4,5,6].map(k=>`<option ${((v.mcr&&v.mcr.nc)||3)===k?'selected':''}>${k}</option>`).join('')}</select></label>${nf('mpMa', v.mcr&&v.mcr.a, T('Da','From'))}${nf('mpMb', v.mcr&&v.mcr.b, T('a','to'))}<button class="btn small primary" id="mpMcr" ${f._map&&f._map.missing?'disabled':''}>${WEB('▶ Esegui','▶ Run','Esegui','Run')}</button></div>
      <div id="mpMcrOut">${R?mcrHtml(f,R):''}</div><div class="signote" id="mpMsg" ${RT.msg?'':'hidden'}>${RT.msg?h(RT.msg):''}</div>`;
    bind(f);
    if (f._map && f._map.missing) return;
    try{ RT.busy=true; const I=await imageOf(f); if (seq!==renderSeq) return; if (!I){ $('#mapCap').textContent=T('Esegui MCR-ALS per vedere le componenti.','Run MCR-ALS to see the components.'); return; }
      I.punit=g0.px.unit; draw(f, I); $('#mapCap').textContent=I.label+(I.unit?' · '+I.unit:'');
      showSpec(f); }
    catch(e){ console.error(e); if (seq===renderSeq) $('#mapCap').textContent=T('Immagine non calcolata: ','Image not computed: ')+(e.code==='range'?T('nessun canale nell\'intervallo scelto','no channel in the chosen range'):String(e.message||e).slice(0,120)); }
    finally{ RT.busy=false; } }
  let GEO=null;
  function draw(f, I){ const cv=$('#mapCv'); if (!cv) return; const v=viewOpt(f); GEO=paint(cv, I, v, {sel:true, f, bg:getComputedStyle(doc.body).getPropertyValue('--panel').trim()||'#fff'}); }
  function pixAt(e){ const cv=$('#mapCv'), r=cv.getBoundingClientRect(), sx=cv.width/r.width, x=(e.clientX-r.left)*sx, y=(e.clientY-r.top)*(cv.height/r.height); if (!GEO) return null;
    const ix=Math.floor((x-GEO.x0)/GEO.w*GEO.nx), iy=Math.floor((y-GEO.y0)/GEO.hh*GEO.ny); return (ix>=0 && ix<GEO.nx && iy>=0 && iy<GEO.ny) ? {ix, iy} : null; }
  function bind(f){ const on=(id,ev,fn)=>{ const el=$('#'+id); if (el) el[ev]=fn; }, val=id=>{ const el=$('#'+id); return el?num(el.value):null; };
    const upd=o=>{ setView(f, o); RT.img.delete(f); render(); };
    on('mpKind','onchange',e=>upd({kind:e.target.value})); on('mpCmap','onchange',e=>{ setView(f,{cmap:e.target.value}); const I=RT.img.get(f); if (I) draw(f,I); });
    on('mpScale','onchange',e=>{ setView(f,{scale:e.target.value}); const I=RT.img.get(f); if (I){ I.range=null; draw(f,I); } });
    on('mpBase','onchange',e=>upd({base:e.target.value}));
    for (const [id,k] of [['mpA','a'],['mpB','b'],['mpA2','a2'],['mpB2','b2'],['mpAt','at']]) on(id,'onchange',()=>{ const x=val(id); if (x!=null) upd({[k]:x}); });
    on('mpReshape','onclick',()=>reshape(f, Math.round(val('mpCols')||0)));
    on('mpMcr','onclick',()=>runMcr(f, {nc:+$('#mpNc').value, a:val('mpMa'), b:val('mpMb')}));
    on('mpImgCsv','onclick',async ()=>{ const I=await imageOf(f); if (I) win.download(new Blob(['﻿'+imageCsv(f, I)],{type:'text/csv'}), safe(f)+'_'+T('mappa','map')+'.csv'); });
    on('mpPng','onclick',async ()=>{ const I=await imageOf(f); if (!I) return; const c=exportCanvas(f, I); c.toBlob(b=>win.download(b, safe(f)+'_'+T('mappa','map')+'.png')); });
    on('mpSpecCsv','onclick',()=>{ const s=RT.last; if (s && s.f===f) win.download(new Blob(['﻿'+specCsv(f, s)],{type:'text/csv'}), safe(f)+'_'+(s.kind==='roi'?T('regione','region'):'pixel')+'.csv'); });
    const cv=$('#mapCv'); if (!cv) return; let down=null;
    cv.onpointerdown=e=>{ const p=pixAt(e); if (!p) return; down=p; try{ cv.setPointerCapture(e.pointerId); }catch(_){} };
    cv.onpointermove=e=>{ if (!down) return; const p=pixAt(e); if (!p) return; if (p.ix!==down.ix || p.iy!==down.iy){ RT.roi={f, x0:down.ix, y0:down.iy, x1:p.ix, y1:p.iy}; const I=RT.img.get(f); if (I) draw(f, I); } };
    cv.onpointerup=e=>{ const p=pixAt(e)||down, d0=down; down=null; if (!d0 || !p) return; if (p.ix===d0.ix && p.iy===d0.iy){ RT.sel={f, ix:p.ix, iy:p.iy}; RT.roi=null; } else RT.roi={f, x0:d0.ix, y0:d0.iy, x1:p.ix, y1:p.iy}; const I=RT.img.get(f); if (I) draw(f,I); showSpec(f); };
    cv.onkeydown=e=>{ const g0=geom(f), s=RT.sel && RT.sel.f===f ? RT.sel : {f, ix:0, iy:0}, d={ArrowLeft:[-1,0], ArrowRight:[1,0], ArrowUp:[0,-1], ArrowDown:[0,1]}[e.key]; if (!d) return; e.preventDefault(); e.stopPropagation();   // le frecce della pagina cambiano spettro: qui muovono il pixel
      RT.sel={f, ix:Math.max(0,Math.min(g0.nx-1,s.ix+d[0])), iy:Math.max(0,Math.min(g0.ny-1,s.iy+d[1]))}; RT.roi=null; const I=RT.img.get(f); if (I) draw(f,I); showSpec(f); }; }
  async function showSpec(f){ const box=$('#mapSpec'); if (!box) return; const list=[{y:f._mapMean||f.ys, color:'#8a8a8a', dash:true, w:1, label:T('media della mappa','map mean')}]; let cap='', last=null; const I=RT.img.get(f);
    try{ if (RT.roi && RT.roi.f===f){ const r=RT.roi, q=await Eng.roi(f, r); list.push({y:q.mean, color:'#1f5fbf', label:T('regione','region')}); cap=`${T('Regione','Region')} x ${Math.min(r.x0,r.x1)}–${Math.max(r.x0,r.x1)}, y ${Math.min(r.y0,r.y1)}–${Math.max(r.y0,r.y1)}: ${q.n} ${T('pixel misurati','measured pixels')}`; last={f, kind:'roi', y:q.mean, n:q.n, r}; }
      else if (RT.sel && RT.sel.f===f){ const s=RT.sel, sp=await Eng.pixel(f, s.ix, s.iy), g0=geom(f); list.push({y:sp, color:'#c25a00', label:'pixel'}); const val=I && I.nx===g0.nx ? I.img[s.iy*I.nx+s.ix] : null;
        cap=`Pixel x ${s.ix}, y ${s.iy} (${g(g0.px.values[s.ix],5)}; ${g(g0.py.values[s.iy],5)} ${h(g0.px.unit||'')})${val!=null?' · '+T('valore','value')+' '+g(val,5):''}${sp.every(v=>!Number.isFinite(v))?' · '+T('non misurato','not measured'):''}`; last={f, kind:'pixel', y:sp, s}; } }
    catch(e){ console.error(e); }
    const R=RT.mcr.get(f); if (R && /^mcr\d$/.test(viewOpt(f).kind)){ const q=+viewOpt(f).kind.slice(3); if (R.S[q]) list.push({y:scaleTo(R.Sx, R.S[q], f), color:COMP_COL[q%COMP_COL.length], label:T('spettro puro','pure spectrum')+' '+(q+1)}); }
    RT.last=last; box.innerHTML=specSvg(f, list); $('#mapSpecCap').textContent=cap||T('Clic su un pixel o trascina per una regione.','Click a pixel or drag for a region.'); const b=$('#mpSpecCsv'); if (b) b.disabled=!last; }
  // spettro puro (sui canali dell'intervallo) portato sulla scala della media, sull'asse completo
  function scaleTo(Sx, S, f){ const x=geom(f).x.values, out=new Float64Array(x.length).fill(NaN), mean=f._mapMean||f.ys; let a=0, b=0; const idx=new Map(Array.from(Sx,(v,i)=>[v,i]));
    for (let i=0;i<x.length;i++){ const j=idx.get(x[i]); if (j!=null){ out[i]=S[j]; a+=Math.abs(mean[i]||0); b+=Math.abs(S[j]); } } const k=b>0?a/b:1; for (let i=0;i<out.length;i++) out[i]*=k; return out; }
  async function reshape(f, nx){ const g0=geom(f); if (f._map && f._map.rust){ RT.msg=T('Con il cubo nel motore nativo la disposizione si indica nel file di origine.','With the cube in the native engine the layout must come from the source file.'); render(); return; }
    try{ f.cube=M.reshape(f.cube, nx); RT.img.delete(f); RT.mcr.delete(f); RT.sel=null; RT.roi=null; RT.msg=null; if (typeof persist==='function') persist(f); }catch(e){ RT.msg=T(`${g0.nx*g0.ny} spettri non si dispongono in ${nx} colonne: scegli un divisore.`,`${g0.nx*g0.ny} spectra cannot be arranged in ${nx} columns: choose a divisor.`); }
    render(); }

  /* ---------------- MCR-ALS sulla mappa ---------------- */
  async function runMcr(f, o){ const MC=win.McrCore; if (!MC || RT.busy) return; const btn=$('#mpMcr'); if (btn) btn.disabled=true; RT.msg=null;
    const out=$('#mpMcrOut'); if (out) out.innerHTML=`<p class="opt-l">${T('Calcolo in corso…','Computing…')}</p>`;
    try{ setView(f, {mcr:{nc:o.nc, a:o.a, b:o.b}});
      const c=await Eng.small(f, 8e6), U=M.unfold(c, {range:o.a!=null && o.b!=null ? [o.a, o.b] : null, maxRows:40000, maxValues:8e6});
      if (U.D.m<o.nc+1) throw new Error(T('troppo pochi pixel misurati','too few measured pixels'));
      const opt={nc:o.nc, init:'simplisma', nonnegC:true, nonnegS:true, maxIter:300, tol:1e-6};
      const R=TAURI() && win.AcchEngine && win.AcchEngine.callMod ? await win.AcchEngine.callMod('McrCore','alsGen', U.D, opt).catch(()=>sliced(MC.alsGen(U.D, opt))) : await sliced(MC.alsGen(U.D, opt));   // desktop: nel worker JS
      const maps=Array.from({length:o.nc},(_,q)=>M.refold(R.C, q, U.pix, U.nx, U.ny)), S=Array.from({length:o.nc},(_,q)=>R.S.a.slice(q*R.S.n,(q+1)*R.S.n));
      RT.mcr.set(f, {nc:o.nc, maps, S, Sx:U.x, nx:U.nx, ny:U.ny, px:U.px, py:U.py, bin:U.bin, lof:R.lof, expVar:R.expVar, iter:R.iter, converged:R.converged, warnings:R.warnings||[], m:U.D.m, n:U.D.n});
      setView(f, {kind:'mcr0'}); RT.img.delete(f); }
    catch(e){ console.error(e); RT.msg=T('MCR-ALS non riuscito: ','MCR-ALS failed: ')+String(e.message||e).slice(0,160); }
    render(); }
  function mcrHtml(f, R){ return `<p class="opt-l">${R.m} ${T('pixel','pixels')} × ${R.n} ${T('canali','channels')}${R.bin>1?' · '+T('pixel accorpati','binned pixels')+' '+R.bin+' × '+R.bin:''} · ${T('mancanza di adattamento','lack of fit')} ${g(R.lof,3)}% · ${T('varianza spiegata','explained variance')} ${g(R.expVar,5)}% · ${R.iter} ${T('iterazioni','iterations')}${R.converged?'':T(', senza convergenza',', not converged')}</p>`
    +(R.warnings.length?`<ul class="chemowarn">${R.warnings.map(w=>`<li>${h(en()?w.en:w.it)}</li>`).join('')}</ul>`:'')
    +`<p class="opt-l">${T('Senza pixel in cui una componente è sola, le soluzioni non sono uniche (ambiguità rotazionale): confronta gli spettri puri con quelli noti.','Without pixels where a component is alone, solutions are not unique (rotational ambiguity): compare the pure spectra with known ones.')}</p>`; }

  /* ---------------- esportazioni ---------------- */
  const safe=f=>(typeof safeName==='function' ? safeName((f.title&&f.title.trim())||f.name) : String(f.name)).replace(/\s+/g,'_');
  function imageCsv(f, I){ const sep=en()?',':';', d=en()?'.':',', n=v=>Number.isFinite(v)?String(+v.toPrecision(10)).replace('.',d):'';
    const L=[[`# ${I.label}${I.unit?' ('+I.unit+')':''}`], [`y \\ x (${geom(f).px.unit||'px'})`].concat(Array.from(I.px, n))]; for (let iy=0;iy<I.ny;iy++){ const r=[n(I.py[iy])]; for (let ix=0;ix<I.nx;ix++) r.push(n(I.img[iy*I.nx+ix])); L.push(r); }
    return L.map(r=>r.join(sep)).join('\r\n'); }
  function specCsv(f, s){ const sep=en()?',':';', d=en()?'.':',', x=geom(f).x.values, n=v=>Number.isFinite(v)?String(+v.toPrecision(10)).replace('.',d):''; const L=[[xUnit(f).replace('⁻¹','-1')||'x', s.kind==='roi'?T('media della regione','region mean')+' (n='+s.n+')':'pixel '+s.s.ix+','+s.s.iy]];
    for (let i=0;i<x.length;i++) L.push([n(x[i]), n(s.y[i])]); return L.map(r=>r.join(sep)).join('\r\n'); }
  function exportCanvas(f, I, k){ k=k||2; const c=doc.createElement('canvas'); c.width=560*k; c.height=380*k; const v=viewOpt(f); paint(c, Object.assign({}, I, {punit:geom(f).px.unit}), v, {k, bg:'#fff'});
    const x=c.getContext('2d'); x.fillStyle='#333'; x.font=`${11*k}px Helvetica, Arial, sans-serif`; x.textAlign='left'; x.fillText((f.title||f.name)+' · '+I.label, 6*k, c.height-4*k); return c; }
  function svgOf(f, I){ const c=exportCanvas(f, I, 2), W=560, H=380; return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><title>${h((f.title||f.name)+' · '+I.label)}</title><image width="${W}" height="${H}" xlink:href="${c.toDataURL('image/png')}"/></svg>`; }
  /* voci della finestra Esporta: PNG e SVG delle mappe (con scala e unità), CSV dell'immagine e delle mappe MCR fra i risultati delle analisi */
  async function exportFiles(sel, add, inc, expDir){ const L=(inc||allFiles()).filter(f=>isMap(f) && !(f._map && f._map.missing)); if (!L.length) return;
    for (const f of L){ let I; try{ I=await imageOf(f); }catch(e){ console.error(e); continue; } if (!I) continue; const base=safe(f)+'_'+(/^mcr/.test(viewOpt(f).kind)?'mcr'+(+viewOpt(f).kind.slice(3)+1):viewOpt(f).kind);
      if (sel.png){ const c=exportCanvas(f, I, 3), b=await new Promise(r=>c.toBlob(r,'image/png')); add('png', expDir('png')+T('mappe/','maps/')+base+'.png', b); }
      if (sel.svg) add('svg', expDir('svg')+T('mappe/','maps/')+base+'.svg', svgOf(f, I));
      if (sel.analysis){ add('analysis', expDir('analysis')+T('mappe/','maps/')+base+'.csv', '﻿'+imageCsv(f, I)); const R=RT.mcr.get(f);
        if (R) for (let q=0;q<R.nc;q++) add('analysis', expDir('analysis')+T('mappe/','maps/')+safe(f)+T('_mcr_componente','_mcr_component')+(q+1)+'.csv', '﻿'+imageCsv(f, {label:'MCR-ALS '+(q+1), unit:'', img:R.maps[q], nx:R.nx, ny:R.ny, px:R.px, py:R.py})); } } }
  // PDF: immagine corrente (già calcolata) con scala e unità; sincrono
  function pdfBlock(f){ const I=RT.img.get(f); if (!I) return null; const c=exportCanvas(f, I, 2); return {png:c.toDataURL('image/png'), w:c.width, h:c.height, lines:[(en()?'Map':'Mappa')+`: ${geom(f).nx} × ${geom(f).ny} ${T('pixel','pixels')}, ${I.label}`]}; }

  function init(){ ensure(); hookProject();
    const st=doc.createElement('style'); st.textContent='.mapgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;align-items:start;margin:8px 0}.mapgrid figure{margin:0}.mapgrid figcaption{font-size:12.5px;color:var(--muted)}#mapCv:focus{outline:2px solid var(--accent,#1f5fbf);outline-offset:2px}'; doc.head.appendChild(st);
    const rf=win.refreshAll; if (typeof rf==='function') win.refreshAll=function(){ const r=rf.apply(this,arguments); try{ render(); }catch(e){ console.error(e); } return r; };
    win.addEventListener('acch-lang', ()=>{ try{ render(); }catch(e){} }); }
  win.AcchMapUI={take, restore, beforeBuild, render, exportFiles, pdfBlock, imageOf, runMcr, isMap, _rt:RT, Eng, looksMapText, svgOf, imageCsv};
  if (doc.readyState==='loading') doc.addEventListener('DOMContentLoaded', init); else init();
})(typeof self!=='undefined' ? self : this);
