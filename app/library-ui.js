// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Librerie dei picchi nella pagina (REQUISITO-LIBRERIA, tappa I4): stessa interfaccia online e nel desktop.
   - sezione «Libreria del tuo strumento e del tuo tipo di campione» nella scheda Analisi: strumento riconosciuto (da confermare),
     tipo di campione (ricordato), libreria scelta, concentrazioni dalla taratura salvata con la loro provenienza;
   - finestra «Librerie dei picchi»: crea, importa, esporta, apri, cartelle condivise, copie di conflitto, conflitti da scegliere;
   - «Salva le pendenze nella libreria di questo strumento e tipo di campione» dopo una retta di taratura HPLC;
   - «Aggiungi alla libreria…» nel menu del clic destro su un picco (AcchLibUi.ctxItems, chiamata da openCtx);
   - CSV, PDF e metodi con la provenienza (chiamate da analysisFiles e pdfAnalysisPages);
   - librerie usate incorporate nel progetto (AcchProject.libraries).
   Testi in italiano e in inglese, sobri: nessuna emoji né esclamazione (il desktop è professionale). */
(function(win){
  'use strict';
  const doc=win.document, $=s=>doc.querySelector(s), Lib=win.AcchLib, Q=win.AcchStoredCal;
  if (!Lib || !Q || !win.AcchHost) return;
  const store=()=>win.AcchHost.libs;
  const en=()=>!!(win.AcchI18n && win.AcchI18n.lang==='en'), T=(it,e)=>en()?e:it, TD=(it,e)=>(typeof LANG!=='undefined' && LANG==='en')?e:it;
  const E=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const today=()=>{ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const N=(v,d)=>v==null||!isFinite(v)?'—':(typeof fmtG==='function'?fmtG(v,d||4):String(+(+v).toPrecision(d||4)));
  const ND=(v,d)=>v==null||!isFinite(v)?'':String(+(+v).toPrecision(d||7)).replace('.', TD(',','.'));
  const hs=k=>{ try{ return JSON.parse(win.AcchHost.store.getItem(k)); }catch(e){ return null; } }, hset=(k,v)=>{ try{ win.AcchHost.store.setItem(k, JSON.stringify(v)); }catch(e){} };
  const KEY_ST='acch.lib.sampleType', KEY_STS='acch.lib.sampleTypes';
  const PROF_NAME={ricerca:['Ricerca','Research'], esplorativa:['Esplorativa','Exploratory'], impurezze:['Impurezze','Impurities'], dosaggio:['Dosaggio','Assay'], tracce:['Tracce e residui','Traces and residues'], bioanalisi:['Bioanalisi','Bioanalysis']};
  const profName=(p,docLang)=>(PROF_NAME[p]||[p,p])[(docLang?TD(0,1):T(0,1))];
  const TECHS=['hplc','ftir','raman','xrf','uv'];

  /* ---------- stato: librerie dell'archivio e librerie incorporate nel progetto aperto ---------- */
  let items=[], embedded=[], ready=null, version=0;
  function refresh(){ ready=store().list().then(L=>{ items=L; version++; return L; }).catch(e=>{ console.error(e); items=[]; return []; }); return ready; }
  function allLibs(){
    const out=items.filter(it=>it.lib && !it.conflictOf).map(it=>({lib:it.lib, origin:it.origin, item:it}));
    for (const p of embedded){ if (!out.some(o=>o.lib.id===p.lib.id)) out.push({lib:p.lib, origin:'project', item:null, embedded:p}); }
    return out; }
  const libById=id=>allLibs().find(o=>o.lib.id===id)||null;
  const sampleTypes=()=>{ const own=(hs(KEY_STS)||[]).filter(s=>typeof s==='string'); const sug=Lib.SAMPLE_SUGGESTIONS.map(p=>en()?p[1]:p[0]); const libsSt=allLibs().map(o=>o.lib.sampleType).filter(Boolean); return [...new Set([...own, ...libsSt, ...sug])]; };
  function rememberSt(st){ if (!st) return; hset(KEY_ST, st); const L=(hs(KEY_STS)||[]).filter(s=>s!==st); L.unshift(st); hset(KEY_STS, L.slice(0,30)); }

  /* ---------- contesto di uno spettro: strumento (riconosciuto o confermato), tipo di campione, libreria ---------- */
  const techOf=f=>f && f.instr;
  const supports=f=>f && TECHS.includes(f.instr) && !f.uncal;
  function rec(f){ if (!f._libRec) f._libRec=Lib.recognize((f.blockHead||f.meta||[]).slice(0,400), f.name); return f._libRec; }
  const ctx=f=>(f.an && f.an.lib) || {};
  function setCtx(f, patch){ const c=Object.assign({}, ctx(f), patch); for (const k of Object.keys(c)) if (c[k]==null || c[k]==='') delete c[k]; anSet(f, 'lib', Object.keys(c).length ? c : null); f._libRes=null; }
  function instrumentOf(f){ const c=ctx(f); if (c.ins) return Lib.cleanInstrument(c.ins); const r=rec(f); return {brand:r.brand, model:r.model, detector:r.detector, serial:r.serial}; }
  const confirmed=f=>!!ctx(f).insOk;
  /* canale del file nel formato della tappa I3: f.channel (file multicanale), altrimenti chanOf(f) per i file a un canale.
     Se l'intestazione dice lo stesso canale con più dettagli (banda, riferimento), si usa quella: niente si perde. */
  function fileChannel(f){
    if (f.channel){ const c=Lib.parseChannel(f.channel); if (c) return Lib.channelText(c); }
    let c2=null; try{ c2=Lib.parseChannel(typeof chanOf==='function' ? chanOf(f) : ''); }catch(e){}
    const c3=Lib.parseChannel(rec(f).channel);
    if (c2 && c3 && (c2.wl===c3.wl || c2.wl==null) && (!c2.det || !c3.det || c2.det===c3.det)) return Lib.channelText(c3);
    return Lib.channelText(c2||c3)||null; }
  function chooseFor(f){
    const c=ctx(f), libs=allLibs();
    if (c.id){ const o=libById(c.id); if (o){ const cmp=Lib.instrumentCompare(o.lib.instrument, instrumentOf(f)); return {pick:o, manual:true, ins:cmp, match:cmp.level==='different'?'wrong':'chosen'}; } }
    const r=Lib.choose(libs, {instrument:instrumentOf(f), sampleType:c.st||'', technique:techOf(f)});
    return r.pick ? {pick:r.pick, ins:r.pick.ins, match:r.match, ambiguous:r.ambiguous} : {pick:null, match:r.match, wrong:r.wrongInstrument||[], missing:true};
  }

  /* ---------- quantificazione di uno spettro con la libreria scelta ---------- */
  function appAreaUnit(f){ const P=processed(f), yu=({A:'A', mAU:'mAU', I:'counts'}[P.kind])||'u', xu=(INSTR[f.instr].xPdf||'x'); return `${yu}·${xu}`; }
  function methodCheck(lib, e, seen){
    const m=e.method||''; if (!m) return null; if (!seen) return {ok:true, unverified:true};
    const n=s=>Lib.normTxt(String(s).replace(/\.m$/i,'')); const def=(lib.methods||[]).find(x=>x.id===m);
    const ok=n(seen)===n(m) || (def && (def.aliases||[]).some(a=>n(a)===n(seen)));
    return ok ? {ok:true} : {ok:false, detail:`${seen} / ${m}`, seen}; }
  function responseOf(f, e, at){
    const P=processed(f); if (!P || !P.xs || P.xs.length<9) return null;
    if (e.integration && typeof mvValue==='function'){ const sh=at!=null && e.x!=null ? at-e.x : 0; const v=mvValue(f, e.integration.a+sh, e.integration.b+sh, e.cal&&e.cal.measure==='height'?'height':'area'); return v==null||!isFinite(v)?null:v; }
    if (e.cal && e.cal.measure==='height'){ const y=interpY(P.xs, P.ys, at); return isFinite(y)?y:null; }
    const a=peakAreas(P.xs, P.dir<0 ? Float64Array.from(P.ys, v=>-v) : P.ys, [at])[0]; return a && isFinite(a.area) ? a.area : null; }
  function peaksOf(f){ try{ const d=viewOf(f); return (d.peaks||[]).map(p=>p.x); }catch(e){ return []; } }
  /* righe per ogni voce della libreria: picco trovato, risposta, esito del calcolo */
  function quantRows(f){
    const ch=chooseFor(f); if (!ch.pick) return {choice:ch, rows:[]};
    const lib=ch.pick.lib, key=[version, lib.id, lib.revision, typeof procKey==='function'?procKey(f):'', JSON.stringify(f.an||{}), peaksOf(f).join(','), files.length, files.map(g=>g.an&&g.an.role==='qc'?JSON.stringify(g.an):'').join('|')].join('#');
    if (f._libRes && f._libRes.key===key) return f._libRes.v;
    const r=rec(f), insCmp=Lib.instrumentCompare(lib.instrument, instrumentOf(f)), chan=fileChannel(f), norm=(S.conv&&S.conv[f.instr]==='norm') || !!processed(f).deriv;
    const others=files.filter(g=>{ if (g===f || g.instr!==f.instr) return false; const c=chooseFor(g); return c.pick && c.pick.lib.id===lib.id; });
    const dw=f.instr==='hplc'?0.1:(SNAP_TOL&&SNAP_TOL[f.instr])||2, mcache=new Map();
    const matchOf=g=>{ if (!mcache.has(g)) mcache.set(g, new Map(Lib.matchEntries(lib, peaksOf(g), {defaultWindow:dw}).map(q=>[q.entry.id, q]))); return mcache.get(g); };
    const ctrlFiles=files.filter(g=>g.instr===f.instr && g.an && g.an.role==='qc' && g.an.libCtrl && (g===f || others.includes(g)));
    const matches=[...matchOf(f).values()];
    const rows=[];
    for (const m of matches){ const e=m.entry, cal=e.cal;
      const row={entry:e, found:m.found, x:m.x, expected:m.expected, y:null, res:null};
      if (!m.found || !cal){ rows.push(row); continue; }
      const raw=responseOf(f, e, m.x); const af=Q.areaFactor(appAreaUnit(f), cal.areaUnit);
      row.yApp=raw; row.y=raw!=null && af ? raw*af.f : null; row.unitApp=appAreaUnit(f);
      const check={channel:null, method:null, instrument:null, column:null};
      if (e.channel){ const cc=Lib.channelCompare(e.channel, chan); check.channel={ok:cc.ok, unverified:cc.unverified, detail:cc.ok?null:`${Lib.channelText(chan)||T('non dichiarato','not stated')} / ${Lib.channelText(e.channel)}`}; }
      check.method=methodCheck(lib, e, r.method);
      if (insCmp.level==='different') check.instrument={ok:false, detail:`${Lib.instrumentText(instrumentOf(f))||'?'} / ${Lib.instrumentText(lib.instrument)}`};
      if (e.column && r.column && Lib.normTxt(e.column)!==Lib.normTxt(r.column)) check.column={ok:false, detail:`${r.column} / ${e.column}`};
      else if (e.column && !r.column) check.column={ok:true, unverified:true};
      // controlli del giorno: file con il ruolo «controllo» e il valore nominale per questa voce
      const controls=[]; for (const g of ctrlFiles){ if (g===f) continue; const nom=g.an.libCtrl[e.id]; if (!(nom>0)) continue; const mg=matchOf(g).get(e.id); const yy=mg&&mg.found?responseOf(g, e, mg.x):null; if (yy==null) continue; controls.push({nominal:nom, y:yy*(af?af.f:1), tR:mg.x, order:files.indexOf(g), pos:g.an.libPos||null, name:g.name}); }
      const sampleYs=[f].concat(others.filter(g=>!(g.an&&g.an.role==='qc'))).map(g=>{ const mg=g===f?m:matchOf(g).get(e.id); const yy=mg&&mg.found?responseOf(g, e, mg.x):null; return yy==null?null:yy*(af?af.f:1); }).filter(v=>v!=null);
      const isCtrl=f.an && f.an.role==='qc';
      row.res=af ? Q.quantify({entry:e, lib, today:today(), y:row.y, controls, sampleYs, check, normalized:norm, sampleOrder:files.indexOf(f), areaUnitAssumed:!!af.assumed}) : {ok:false, code:'area-unit', provenance:{library:lib.name, entry:e.name, calDate:cal.date, revision:lib.revision, entryRev:e.rev, profile:lib.profile}, warnings:[], devs:[]};
      if (row.res && row.res.code==='profile' && af) row.res.compare=dayCompare(f, e, af.f);
      row.controls=controls; row.isCtrl=isCtrl; rows.push(row); }
    const v={choice:ch, rows, lib, insCmp};
    f._libRes={key, v}; return v;
  }

  /* profili che non ammettono tarature salvate (Dosaggio, Tracce, Bioanalisi): la retta salvata serve solo da confronto con quella del giorno.
     Retta del giorno = quella di «Più campioni» sulla stessa banda (la zona contiene il tR della voce); differenza delle pendenze in %. */
  function dayCompare(f, e, fac){
    try{ const c=mvCfg(f.instr); if (c.model==='pls' || c.model==='trend' || c.a==null || c.b==null || (c.c!=null && c.d!=null)) return {none:true};
      const x0=e.x!=null?e.x:null; if (x0==null || x0<Math.min(c.a,c.b) || x0>Math.max(c.a,c.b)) return {none:true};
      const cal=mvCalib(mvTable(f.instr)); if (!cal || cal.b==null || cal.few) return {none:true};
      const bDay=cal.b*fac; return {diff:100*(bDay/e.cal.slope-1), bDay, bSaved:e.cal.slope}; }catch(err){ return {none:true}; } }
  function compareText(r, lg){ const c=r && r.compare, en=lg==='en'; if (!c) return ''; if (c.none) return en?'No same-day line on this band yet: measure the standards in «Multiple samples» to see the comparison.':'Manca ancora la retta del giorno su questa banda: misura gli standard in «Più campioni» per vedere il confronto.';
    const v=(c.diff>0?'+':c.diff<0?'−':'')+Math.abs(c.diff).toFixed(1).replace('.', en?'.':','); return en?`Same-day line: slope ${v}% from the saved one.`:`Retta del giorno: pendenza ${v}% rispetto a quella salvata.`; }

  /* ---------- carta di controllo: geometria comune a SVG e PNG, CSV ---------- */
  function chartGeom(e, W, H){
    const pts=(e.chart||[]).filter(p=>Number.isFinite(p.k)), n=pts.length, ch=Q.chartCheck(pts.map(p=>p.k).concat(n>Q.CHART_MIN?[]:[]));
    const base=pts.slice(0,Q.CHART_MIN).map(p=>p.k), m=base.length?base.reduce((a,b)=>a+b,0)/base.length:1, sd=base.length>1?Math.sqrt(base.reduce((a,b)=>a+(b-m)**2,0)/(base.length-1)):0;
    const lim=n>=Q.CHART_MIN && sd>0 ? [m-Q.CHART_ACTION*sd, m-2*sd, m, m+2*sd, m+Q.CHART_ACTION*sd] : [m];
    const ys=pts.map(p=>p.k).concat(lim), lo=Math.min(...ys, 0.9), hi=Math.max(...ys, 1.1), L=50, R=12, Tp=24, B=34;
    const X=i=>L+(n>1?i/(n-1):0.5)*(W-L-R), Y=v=>Tp+(hi-v)/((hi-lo)||1)*(H-Tp-B);
    return {pts, n, m, sd, lim, X, Y, W, H, L, R, Tp, B, lo, hi, active:n>Q.CHART_MIN, title:`${e.name}: k`}; }
  function chartSvg(e, lib){ const g=chartGeom(e, 640, 320), r=[];
    r.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${g.W}" height="${g.H}" viewBox="0 0 ${g.W} ${g.H}" font-family="Helvetica, Arial, sans-serif" font-size="11"><rect width="100%" height="100%" fill="#fff"/>`);
    r.push(`<text x="${g.L}" y="15" font-weight="bold">${E(T('Carta di controllo','Control chart'))} · ${E(e.name)} · ${E(lib?lib.name:'')}</text>`);
    g.lim.forEach((v,i)=>{ const dash=i===2||g.lim.length===1?'':i===0||i===4?' stroke-dasharray="6 3"':' stroke-dasharray="2 3"'; r.push(`<line x1="${g.L}" x2="${g.W-g.R}" y1="${g.Y(v).toFixed(1)}" y2="${g.Y(v).toFixed(1)}" stroke="${i===0||i===4?'#b3261e':'#888'}"${dash}/><text x="4" y="${(g.Y(v)+4).toFixed(1)}" fill="#555">${v.toFixed(3)}</text>`); });
    r.push(`<polyline fill="none" stroke="#1f5fbf" stroke-width="1.5" points="${g.pts.map((p,i)=>g.X(i).toFixed(1)+','+g.Y(p.k).toFixed(1)).join(' ')}"/>`);
    g.pts.forEach((p,i)=>r.push(`<circle cx="${g.X(i).toFixed(1)}" cy="${g.Y(p.k).toFixed(1)}" r="3" fill="#1f5fbf"><title>${E(p.date)} k=${p.k}</title></circle>`));
    r.push(`<text x="${g.L}" y="${g.H-10}" fill="#555">${E(T(`serie (${g.n}); limiti dalle prime ${Q.CHART_MIN}: media, ±2 s, ±${Q.CHART_ACTION} s${g.active?'':' — carta non ancora attiva'}`,`series (${g.n}); limits from the first ${Q.CHART_MIN}: mean, ±2 s, ±${Q.CHART_ACTION} s${g.active?'':' — chart not active yet'}`))}</text></svg>`);
    return r.join(''); }
  function chartPng(e, lib){ return new Promise(res=>{ const g=chartGeom(e, 1280, 640), cv=doc.createElement('canvas'); cv.width=g.W; cv.height=g.H; const c=cv.getContext('2d');
    c.fillStyle='#fff'; c.fillRect(0,0,g.W,g.H); c.font='bold 22px Helvetica, Arial, sans-serif'; c.fillStyle='#000'; c.fillText(`${T('Carta di controllo','Control chart')} · ${e.name} · ${lib?lib.name:''}`, g.L, 24);
    c.font='20px Helvetica, Arial, sans-serif'; g.lim.forEach((v,i)=>{ c.strokeStyle=i===0||i===4?'#b3261e':'#888'; c.setLineDash(i===2||g.lim.length===1?[]:i===0||i===4?[12,6]:[4,6]); c.beginPath(); c.moveTo(g.L,g.Y(v)); c.lineTo(g.W-g.R,g.Y(v)); c.stroke(); c.fillStyle='#555'; c.fillText(v.toFixed(3), 4, g.Y(v)+6); });
    c.setLineDash([]); c.strokeStyle='#1f5fbf'; c.lineWidth=3; c.beginPath(); g.pts.forEach((p,i)=>i?c.lineTo(g.X(i),g.Y(p.k)):c.moveTo(g.X(i),g.Y(p.k))); c.stroke(); c.fillStyle='#1f5fbf'; g.pts.forEach((p,i)=>{ c.beginPath(); c.arc(g.X(i),g.Y(p.k),5,0,7); c.fill(); });
    cv.toBlob(b=>res(b),'image/png'); }); }
  function chartCsv(e, lib){ const sep=TD(';',','), g=chartGeom(e, 10, 10), dec=v=>String(v).replace('.', TD(',','.'));
    const head=[TD('Libreria','Library'), TD('Voce','Entry'), TD('Serie','Series'), TD('Data','Date'), 'k', 'z', TD('Regola','Rule')].join(sep);
    const rows=g.pts.map((p,i)=>{ const z=g.active && g.sd>0 && i>=Q.CHART_MIN ? (p.k-g.m)/g.sd : null, cc=i>=Q.CHART_MIN ? Q.chartCheck(g.pts.slice(0,i+1).map(q=>q.k)) : null; return [lib?lib.name:'', e.name, i+1, p.date||'', dec(p.k), z==null?'':dec(+z.toPrecision(4)), cc&&cc.rule||''].map(v=>/[";\n]/.test(String(v))?'"'+String(v).replace(/"/g,'""')+'"':v).join(sep); });
    return '\uFEFF'+[head].concat(rows).join('\r\n'); }
  const chartName=(lib,e)=>(Lib.normTxt(lib.name).replace(/\s+/g,'_')+'__'+Lib.normTxt(e.name).replace(/\s+/g,'_')).slice(0,90);
  async function exportChart(o, e, kind){ const n=chartName(o.lib,e);
    if (kind==='csv') return win.download(new Blob([chartCsv(e, o.lib)],{type:'text/csv'}), n+'.csv');
    if (kind==='svg') return win.download(new Blob([chartSvg(e, o.lib)],{type:'image/svg+xml'}), n+'.svg');
    return win.download(await chartPng(e, o.lib), n+'.png'); }
  /* voce propria della finestra Esporta («Carte di controllo delle librerie», exportEntries in index.html): per ogni voce delle librerie usate
     che ha una carta, PNG, SVG e CSV. add(percorso relativo, contenuto) è quello di exportEntries */
  const chartEntries=()=>{ const out=[]; for (const lib of usedLibs()) for (const e of Lib.liveEntries(lib)) if ((e.chart||[]).length) out.push({lib, e}); return out; };
  function chartCount(){ try{ return chartEntries().length; }catch(err){ return 0; } }
  async function chartFiles(add){ let n=0; try{ for (const {lib, e} of chartEntries()){ const nm=chartName(lib,e); add(nm+'.png', await chartPng(e, lib)); add(nm+'.svg', chartSvg(e, lib)); add(nm+'.csv', chartCsv(e, lib)); n++; } }catch(err){ console.error(err); } return n; }
  // nella finestra Esporta la voce dice se non c'è niente da esportare (nessuna carta nelle librerie usate)
  function exportNote(){ const note=$('#libChartsNote'); if (!note) return; const n=chartCount(); note.hidden=n>0; note.textContent=T('Nessuna voce delle librerie usate ha ancora una carta di controllo: non c\'è niente da esportare.','No entry of the libraries in use has a control chart yet: there is nothing to export.'); }

  /* ---------- sezione nella scheda Analisi ---------- */
  function ensureSection(){
    let sec=$('#secLib'); if (sec) return sec;
    const anchor=$('#secTech'); if (!anchor) return null;
    sec=doc.createElement('details'); sec.className='ansec'; sec.id='secLib';
    sec.innerHTML=`<summary><b><span id="libSecTitle"></span></b><span class="secsum" id="sumLib"></span><span class="scope s-one" id="libScope"></span></summary><div class="in"><div id="libBody"></div></div>`;
    anchor.parentNode.insertBefore(sec, anchor.nextSibling); return sec; }
  function render(){
    const sec=ensureSection(); if (!sec) return; const f=files[cur];
    $('#libSecTitle').textContent=T('Libreria del tuo strumento e del tuo tipo di campione','Library of your instrument and sample type');
    $('#libScope').textContent=T('solo questo spettro','this spectrum only');
    const body=$('#libBody');
    if (!f || !supports(f)){ sec.hidden=true; body.innerHTML=''; return; }
    sec.hidden=false;
    const c=ctx(f), r=rec(f), ins=instrumentOf(f), insTxt=Lib.instrumentText(ins), ch=chooseFor(f), q=quantRows(f), st=c.st||'';
    let h='';
    h+=`<div class="ibfields" style="align-items:flex-end">`;
    h+=`<div class="ibf" style="min-width:260px"><span>${E(T('Strumento','Instrument'))}</span><div id="libIns">${insTxt?E(insTxt):`<i>${E(T('non riconosciuto dal file','not recognised from the file'))}</i>`}${insTxt?` <small class="libsrc">${E(confirmed(f)?T('confermato','confirmed'):c.ins?T('scritto da te','entered by you'):T('dall\'intestazione del file, da confermare','from the file header, to be confirmed'))}</small>`:''}</div></div>`;
    if (insTxt && !confirmed(f)) h+=`<button type="button" class="btn small" id="libInsOk">${E(T('Conferma lo strumento','Confirm the instrument'))}</button>`;
    h+=`<button type="button" class="btn small ghost" id="libInsEdit">${E(insTxt?T('Correggi…','Correct…'):T('Scrivi lo strumento…','Enter the instrument…'))}</button>`;
    h+=`<label class="ibf"><span>${E(T('Tipo di campione','Sample type'))}</span><input type="text" id="libSt" list="libStList" value="${E(st)}" placeholder="${E(T('scegli o scrivi','choose or type'))}" autocomplete="off" style="min-width:170px"><datalist id="libStList">${sampleTypes().map(s=>`<option value="${E(s)}">`).join('')}</datalist></label>`;
    h+=`<label class="ibf"><span>${E(T('Libreria','Library'))}</span><select id="libPick"><option value="">${E(T('scelta automatica','automatic choice'))}</option>${allLibs().filter(o=>o.lib.technique===f.instr).map(o=>{ const cmp=Lib.instrumentCompare(o.lib.instrument, ins); return `<option value="${E(o.lib.id)}" ${c.id===o.lib.id?'selected':''}>${E(o.lib.name)}${cmp.level==='different'?E(T(' (altro strumento)',' (other instrument)')):''}${o.origin==='project'?E(T(' (dal progetto)',' (from the project)')):''}</option>`; }).join('')}</select></label>`;
    h+=`<button type="button" class="btn small ghost" id="libManage">${E(T('Librerie…','Libraries…'))}</button></div>`;
    if (r.evidence && r.evidence.length && !c.ins) h+=`<p class="why" style="margin-top:4px">${E(T('Riconosciuto da: ','Recognised from: '))}${r.evidence.slice(0,3).map(x=>`«${E(x.line)}»`).join(' · ')}</p>`;
    // libreria scelta o proposta
    if (ch.pick){ const L=ch.pick.lib;
      h+=`<p style="margin:8px 0 4px"><b>${E(L.name)}</b> · ${E(Lib.instrumentText(L.instrument))} · ${E(T('tipo di campione','sample type'))} ${E(L.sampleType||'—')} · ${E(T('profilo','profile'))} ${E(profName(L.profile))} · rev. ${L.revision}${ch.pick.origin==='project'?' · '+E(T('incorporata nel progetto','embedded in the project')):''}</p>`;
      if (ch.match==='wrong' || (q.insCmp && q.insCmp.level==='different')) h+=`<p class="signote bad" id="libWrong" role="alert"><b>${E(T('Attenzione: questa libreria è di un altro strumento','Warning: this library belongs to another instrument'))}</b> (${E(Lib.instrumentText(L.instrument))} ${E(T('invece di','instead of'))} ${E(insTxt||T('strumento non riconosciuto','unrecognised instrument'))}). ${E(T('Le pendenze salvate non vengono usate: i nomi servono solo da orientamento.','The saved slopes are not used: the names are only a guide.'))}</p>`;
      else if (!confirmed(f) && insTxt) h+=`<p class="why">${E(T('Proposta in base allo strumento riconosciuto e al tipo di campione: conferma lo strumento.','Proposed from the recognised instrument and the sample type: confirm the instrument.'))}</p>`;
      if (ch.ambiguous) h+=`<p class="why">${E(T('Ci sono più librerie per questa coppia: è proposta la più recente.','There are several libraries for this pair: the most recent is proposed.'))}</p>`;
      const emb=embedded.find(p=>p.lib.id===L.id), loc=items.find(it=>it.lib&&it.lib.id===L.id);
      if (emb && !loc) h+=`<p class="why">${E(T('Questa libreria viene dal progetto e non è tra le tue.','This library comes from the project and is not among yours.'))} <button type="button" class="btn small" id="libImportEmb">${E(T('Aggiungila alle mie librerie','Add it to my libraries'))}</button></p>`;
      else if (emb && loc && Lib.hashOf(emb.lib)!==Lib.hashOf(loc.lib)) h+=`<p class="why">${E(T(`La libreria del progetto (rev. ${emb.lib.revision}) è diversa dalla tua (rev. ${loc.lib.revision}).`,`The project library (rev. ${emb.lib.revision}) differs from yours (rev. ${loc.lib.revision}).`))} <button type="button" class="btn small" id="libMergeEmb">${E(T('Unisci voce per voce…','Merge entry by entry…'))}</button></p>`;
    } else {
      const pair=[insTxt||T('strumento non riconosciuto','unrecognised instrument'), st||T('tipo di campione da scegliere','sample type to choose')].join(' — ');
      h+=`<p class="signote" id="libMissing">${E(T('Non c\'è una libreria per ','There is no library for '))}<b>${E(pair)}</b>.${(ch.wrong||[]).length?' '+E(T('Ce n\'è una per lo stesso tipo di campione ma per un altro strumento: non viene proposta.','There is one for the same sample type but for another instrument: it is not proposed.')):''} <button type="button" class="btn small primary" id="libCreate">${E(T('Crea la libreria di questo strumento e tipo di campione','Create the library for this instrument and sample type'))}</button></p>`; }
    // risultati
    if (q.rows && q.rows.length){
      const yu=appAreaUnit(f);
      h+=`<div class="tblwrap"><table class="libq" id="libQ"><thead><tr><th>${E(T('Voce','Entry'))}</th><th>tR ${E(T('atteso','expected'))}</th><th>tR ${E(T('trovato','found'))}</th><th>${E(T('Area','Area'))} (${E(yu)})</th><th>${E(T('Concentrazione','Concentration'))} ± U</th><th>${E(T('Stato e provenienza','Status and provenance'))}</th></tr></thead><tbody>`;
      const shown=q.rows.filter(w=>w.found), miss=q.rows.filter(w=>!w.found);
      for (const w of shown){ const e=w.entry, rs=w.res, cu=e.cal?e.cal.concUnit||'':'';
        const val=rs && rs.ok ? `<b data-libx="${E(e.id)}">${E(N(rs.x,4))}</b>${rs.U!=null?` ± ${E(N(rs.U,2))}`:''} ${E(cu)}${rs.belowLod?' (< LOD)':rs.belowLoq?' (< LOQ)':''}${rs.mode==='nocontrol'?`<br><span class="libmark">${E(Q.markText(en()?'en':'it'))}</span>`:''}` : (e.cal ? '—' : `<small>${E(T('solo identificazione','identification only'))}</small>`);
        const stt=rs ? `<div class="${rs.ok?'':'libbad'}">${E(Q.statusText(rs, en()?'en':'it'))}</div>${rs.compare?`<div class="libcmp"><b>${E(compareText(rs, en()?'en':'it'))}</b></div>`:''}${Q.warningTexts(rs, en()?'en':'it').map(t=>`<div class="why">${E(t)}</div>`).join('')}${rs.ok && /ctrl/.test(rs.mode||'') && rs.k!=null && !w.isCtrl?`<button type="button" class="btn small ghost libchart" data-e="${E(e.id)}" data-k="${rs.k}">${E(T('Registra il k di oggi nella carta di controllo','Record today\'s k in the control chart'))}</button>`:''}<div class="libprov">${E(Q.provenanceText(rs, en()?'en':'it'))}</div>` : (w.found?'':`<small>${E(T('nessun picco nella finestra','no peak in the window'))}</small>`);
        h+=`<tr data-e="${E(e.id)}"><td>${E(e.name)}${w.isCtrl?` <small>(${E(T('controllo','control'))})</small>`:''}</td><td>${E(N(w.expected,4))}${e.window!=null?` ± ${E(N(e.window,2))}`:''}</td><td>${w.found?E(N(w.x,4)):'—'}</td><td>${w.yApp!=null?E(N(w.yApp,4)):'—'}</td><td>${val}</td><td>${stt}</td></tr>`; }
      h+='</tbody></table></div>';
      if (!shown.length) h+=`<p class="why">${E(T('Nessuna voce della libreria ha un picco nella sua finestra di tR.','No library entry has a peak in its tR window.'))}</p>`;
      if (miss.length) h+=`<details class="libmiss"><summary>${E(T(`${miss.length} voci senza un picco nella loro finestra`,`${miss.length} entries without a peak in their window`))}</summary><p class="why">${miss.map(w=>`${E(w.entry.name)} (${E(N(w.expected,4))})`).join(' · ')}</p></details>`;
      // controlli del giorno
      h+=`<details class="libctl" ${f.an&&f.an.role==='qc'?'open':''}><summary>${E(T('Controllo del giorno','Same-day control'))}</summary><p class="why">${E(T('Uno standard di concentrazione nota misurato oggi aggiorna la retta salvata (k) e toglie il segno «senza controllo del giorno». Segna qui questo spettro come controllo e scrivi i valori nominali.','A standard of known concentration measured today updates the saved line (k) and removes the «without a same-day control» mark. Mark this spectrum as a control here and enter the nominal values.'))}</p>
        <label class="check"><input type="checkbox" id="libIsCtrl" ${f.an&&f.an.role==='qc'?'checked':''}> ${E(T('Questo spettro è un controllo','This spectrum is a control'))}</label>
        ${f.an&&f.an.role==='qc'?`<label class="ibf"><span>${E(T('Posizione nella serie','Position in the run'))}</span><select id="libPos"><option value="">—</option><option value="open" ${f.an.libPos==='open'?'selected':''}>${E(T('apertura','opening'))}</option><option value="close" ${f.an.libPos==='close'?'selected':''}>${E(T('chiusura','closing'))}</option></select></label><div class="ibfields">${shown.filter(w=>w.entry.cal).map(w=>`<label class="ibf"><span>${E(w.entry.name)} (${E(w.entry.cal.concUnit||'')})</span><input type="text" inputmode="decimal" class="libnom" data-e="${E(w.entry.id)}" value="${E(f.an.libCtrl&&f.an.libCtrl[w.entry.id]!=null?String(f.an.libCtrl[w.entry.id]).replace('.',T(',','.')):'')}" style="width:90px"></label>`).join('')}</div>`:''}</details>`;
    } else if (ch.pick) h+=`<p class="why">${E(T('La libreria non ha ancora voci. Aggiungile con il clic destro su un picco («Aggiungi alla libreria…») o salvando le pendenze dopo una retta di taratura in «Più campioni».','The library has no entries yet. Add them with a right click on a peak («Add to library…») or by saving the slopes after a calibration line in «Multiple samples».'))}</p>`;
    body.innerHTML=h;
    const sm=$('#sumLib'); if (sm){ const ok=(q.rows||[]).filter(w=>w.res&&w.res.ok).length; sm.textContent=ch.pick ? `${ch.pick.lib.name}${ok?' · '+ok+' '+T('concentrazioni','concentrations'):''}` : T('nessuna libreria per questa coppia','no library for this pair'); }
    bindSection(f);
  }
  function bindSection(f){
    const on=(id,fn)=>{ const el=$('#'+id); if (el) el.onclick=fn; };
    on('libInsOk', ()=>{ setCtx(f, {insOk:true, ins:instrumentOf(f)}); applySameToBatch(f); rerender(); });
    on('libInsEdit', async ()=>{ const v=await editInstrument(instrumentOf(f)); if (v){ setCtx(f, {ins:v, insOk:true}); rerender(); } });
    on('libManage', ()=>openManager());
    on('libCreate', async ()=>{ const lib=await createDialog({instrument:instrumentOf(f), sampleType:ctx(f).st||'', technique:f.instr, method:rec(f).method}); if (lib){ setCtx(f, {id:lib.id, st:lib.sampleType||ctx(f).st}); rerender(); } });
    on('libImportEmb', async ()=>{ const L=chooseFor(f).pick.lib; await saveLib({origin:'user'}, L); rerender(); });
    on('libMergeEmb', async ()=>{ const L=chooseFor(f).pick.lib, emb=embedded.find(p=>p.lib.id===L.id), loc=items.find(it=>it.lib&&it.lib.id===L.id); await mergeInto(loc, emb.lib); rerender(); });
    const stI=$('#libSt'); if (stI) stI.onchange=()=>{ const v=stI.value.trim(); setCtx(f, {st:v}); rememberSt(v); rerender(); };
    const pk=$('#libPick'); if (pk) pk.onchange=()=>{ setCtx(f, {id:pk.value||null}); rerender(); };
    const ic=$('#libIsCtrl'); if (ic) ic.onchange=()=>{ anSet(f, 'role', ic.checked?'qc':null); f._libRes=null; files.forEach(g=>g._libRes=null); rerender(); };
    const ps=$('#libPos'); if (ps) ps.onchange=()=>{ anSet(f, 'libPos', ps.value||null); files.forEach(g=>g._libRes=null); rerender(); };
    doc.querySelectorAll('#libBody .libchart').forEach(b=>b.onclick=async ()=>{ const o=chooseFor(f).pick; if (!o) return; const copy=JSON.parse(JSON.stringify(o.lib)), e=copy.entries.find(x=>x.id===b.dataset.e); if (!e) return;
      e.chart=(e.chart||[]).filter(p=>p.date!==today()).concat([{date:today(), k:+b.dataset.k}]); Lib.upsert(copy, e); const it=await saveLib(o.item||{origin:'user'}, copy); if (it) toast(T('k di oggi registrato nella carta di controllo.','Today\'s k recorded in the control chart.')); });
    doc.querySelectorAll('#libBody .libnom').forEach(el=>el.onchange=()=>{ const v=+String(el.value).replace(',','.'); const m=Object.assign({}, (f.an&&f.an.libCtrl)||{}); if (v>0) m[el.dataset.e]=v; else delete m[el.dataset.e]; anSet(f, 'libCtrl', Object.keys(m).length?m:null); files.forEach(g=>g._libRes=null); rerender(); });
  }
  // lo stesso strumento confermato vale per gli altri file dello stesso caricamento con la stessa intestazione
  function applySameToBatch(f){ const k=Lib.instrumentText(instrumentOf(f)); files.forEach(g=>{ if (g!==f && g.instr===f.instr && !confirmed(g) && Lib.instrumentText(instrumentOf(g))===k) setCtx(g, {insOk:true, ins:instrumentOf(g)}); }); }
  function rerender(){ files.forEach(g=>g._libRes=null); try{ render(); }catch(e){ console.error(e); } }

  /* ---------- finestre ---------- */
  function dialog(id, html, opt){
    let d=$('#'+id); if (!d){ d=doc.createElement('dialog'); d.id=id; d.className='wide libdlg'; doc.body.appendChild(d); }
    d.innerHTML=`<form method="dialog" class="dlg">${html}</form>`; if (!d.open) d.showModal(); return d; }
  const field=(id,label,val,extra)=>`<div class="field"><label for="${id}">${E(label)}</label><input type="text" id="${id}" value="${E(val||'')}" autocomplete="off" ${extra||''}></div>`;
  function editInstrument(ins){ return new Promise(res=>{ ins=Lib.cleanInstrument(ins);
    const d=dialog('dlgLibIns', `<h2>${E(T('Strumento','Instrument'))}</h2>${field('liB',T('Marca','Brand'),ins.brand)}${field('liM',T('Modello','Model'),ins.model)}${field('liD',T('Rivelatore','Detector'),ins.detector,'placeholder="DAD G4212B"')}${field('liS',T('Numero di serie (facoltativo)','Serial number (optional)'),ins.serial)}<div class="actions"><button class="btn ghost" value="no" type="submit">${E(T('Annulla','Cancel'))}</button><button class="btn primary" value="ok" type="submit" id="liOk">${E(T('Usa','Use'))}</button></div>`);
    d.onclose=()=>{ if (d.returnValue!=='ok') return res(null); res(Lib.cleanInstrument({brand:$('#liB').value, model:$('#liM').value, detector:$('#liD').value, serial:$('#liS').value})); }; }); }
  /* nuova libreria per una coppia (strumento, tipo di campione). Il profilo si sceglie qui ed è obbligatorio */
  function createDialog(o){ return new Promise(res=>{ o=o||{}; const ins=Lib.cleanInstrument(o.instrument);
    const d=dialog('dlgLibNew', `<h2>${E(T('Nuova libreria','New library'))}</h2><p class="why">${E(T('Una libreria per ogni coppia di strumento e tipo di campione. Strumento e tipo di campione sono campi liberi.','One library for each pair of instrument and sample type. Instrument and sample type are free fields.'))}</p>
      <div class="ibfields"><label class="ibf"><span>${E(T('Tecnica','Technique'))}</span><select id="lnTech">${TECHS.map(t=>`<option value="${t}" ${t===(o.technique||'hplc')?'selected':''}>${E((typeof NOME_IT!=='undefined'&&NOME_IT[t])||t)}</option>`).join('')}</select></label>
      <label class="ibf"><span>${E(T('Profilo','Profile'))}</span><select id="lnProf">${Lib.PROFILES.map(p=>`<option value="${p}">${E(profName(p))}</option>`).join('')}</select></label></div>
      ${field('lnB',T('Marca','Brand'),ins.brand)}${field('lnM',T('Modello','Model'),ins.model)}${field('lnD',T('Rivelatore','Detector'),ins.detector)}${field('lnS',T('Numero di serie (facoltativo)','Serial number (optional)'),ins.serial)}
      <div class="field"><label for="lnSt">${E(T('Tipo di campione','Sample type'))}</label><input type="text" id="lnSt" list="lnStList" value="${E(o.sampleType||'')}" autocomplete="off"><datalist id="lnStList">${sampleTypes().map(s=>`<option value="${E(s)}">`).join('')}</datalist></div>
      ${field('lnMet',T('Metodo (facoltativo)','Method (optional)'),o.method||'')}${field('lnAu',T('Autore','Author'),hs('acch.lib.author')||'')}${field('lnN',T('Nome della libreria','Library name'),'','placeholder="'+E(T('automatico','automatic'))+'"')}
      <div class="actions"><button class="btn ghost" value="no" type="submit">${E(T('Annulla','Cancel'))}</button><button class="btn primary" value="ok" type="submit" id="lnOk">${E(T('Crea','Create'))}</button></div>`);
    d.onclose=async ()=>{ if (d.returnValue!=='ok') return res(null);
      const instrument={brand:$('#lnB').value, model:$('#lnM').value, detector:$('#lnD').value, serial:$('#lnS').value}, st=$('#lnSt').value.trim(), met=$('#lnMet').value.trim(), au=$('#lnAu').value.trim();
      const lib=Lib.create({instrument, sampleType:st, technique:$('#lnTech').value, profile:$('#lnProf').value, author:au, name:$('#lnN').value.trim()||undefined, methods:met?[{id:met}]:[]});
      if (au) hset('acch.lib.author', au); rememberSt(st);
      const r=await saveLib({origin:'user'}, lib); res(r?r.lib:null); }; }); }
  /* conflitti: per ognuno l'utente sceglie la versione da tenere. Annullare non scrive niente */
  function askConflicts(m){ return new Promise(res=>{
    const sum=e=>{ if (!e || typeof e!=='object') return E(JSON.stringify(e)); if (e.entries) return ''; const c=e.cal; return `rev. ${e.rev||'?'} · ${E(e.modifiedAt?String(e.modifiedAt).slice(0,10):'')}${e.x!=null?' · tR '+E(N(e.x,4)):''}${c&&c.slope!=null?' · '+E(T('pendenza','slope'))+' '+E(N(c.slope,5)):''}${c&&c.date?' · '+E(c.date):''}${e.deleted?' · '+E(T('tolta','removed')):''}`; };
    const rows=m.conflicts.map((c,i)=>`<tr><td>${E(c.kind==='meta'?T('dati della libreria: ','library data: ')+c.field:c.name||c.id)}</td><td><label><input type="radio" name="lc${i}" value="mine" checked> ${c.kind==='meta'?E(typeof c.mine==='object'?JSON.stringify(c.mine):String(c.mine)):sum(c.mine)}</label></td><td><label><input type="radio" name="lc${i}" value="theirs"> ${c.kind==='meta'?E(typeof c.theirs==='object'?JSON.stringify(c.theirs):String(c.theirs)):sum(c.theirs)}</label></td></tr>`).join('');
    const d=dialog('dlgLibConf', `<h2>${E(T('Modifiche contemporanee alla stessa libreria','Simultaneous changes to the same library'))}</h2><p class="why">${E(T('La libreria è stata cambiata anche altrove dopo che l\'hai aperta. Le voci cambiate da una parte sola sono già unite; per queste scegli quale versione tenere. Niente viene scritto finché non confermi.','The library was also changed elsewhere after you opened it. Entries changed on one side only are already merged; for these choose which version to keep. Nothing is written until you confirm.'))}</p>
      <div class="tblwrap"><table id="lcTable"><thead><tr><th>${E(T('Voce','Entry'))}</th><th>${E(T('La tua versione','Your version'))}</th><th>${E(T('Quella trovata sul disco','The one found on disk'))}</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="actions"><button class="btn ghost" value="no" type="submit">${E(T('Annulla','Cancel'))}</button><button class="btn primary" value="ok" type="submit" id="lcOk">${E(T('Applica le scelte','Apply the choices'))}</button></div>`);
    d.onclose=()=>{ if (d.returnValue!=='ok') return res(null); const ch={}; m.conflicts.forEach((c,i)=>{ const r=d.querySelector(`input[name="lc${i}"]:checked`); ch[c.id]=r?r.value:'mine'; }); res(ch); }; }); }
  win.AcchLibAsk=null;   // i test possono sostituire la scelta dei conflitti
  async function saveLib(item, lib){
    try{ const r=await store().save(item, lib, m=>(win.AcchLibAsk||askConflicts)(m)); await refresh();
      if (!r.ok){ toast(T('Libreria non salvata: scelta annullata, il file sul disco non è stato toccato.','Library not saved: choice cancelled, the file on disk was not touched.')); return null; }
      const auto=r.merges.reduce((a,x)=>a+x.auto.length,0); toast(auto ? T(`Libreria salvata, unita con le modifiche trovate sul disco (${auto}).`,`Library saved, merged with the changes found on disk (${auto}).`) : T('Libreria salvata.','Library saved.'));
      rerender(); return r.item; }
    catch(e){ console.error(e); toast(T('Non sono riuscito a salvare la libreria: ','Could not save the library: ')+(e.code||e.message||e)); return null; } }
  async function mergeInto(item, other){ // unisce una copia (progetto, copia di conflitto, file importato) nella libreria dell'archivio
    const m=Lib.merge(null, item.lib, other); let next=m.merged; if (m.conflicts.length){ const ch=await (win.AcchLibAsk||askConflicts)(m); if (!ch) return null; next=Lib.resolve(m, ch); }
    return saveLib(item, next); }

  /* ---------- finestra «Librerie dei picchi» ---------- */
  const ORIGIN={system:['di sistema (sola lettura)','system (read-only)'], user:['tue','yours'], shared:['condivisa','shared'], project:['dal progetto','from the project']};
  async function openManager(sel){
    await (ready||refresh());
    const L=allLibs(), conflicts=items.filter(it=>it.conflictOf), errs=items.filter(it=>it.error && !it.lib), desk=store().kind==='desktop';
    const row=o=>`<tr data-id="${E(o.lib.id)}"><td><b>${E(o.lib.name)}</b><br><small>${E(Lib.instrumentText(o.lib.instrument)||'—')}</small></td><td>${E(o.lib.sampleType||'—')}</td><td>${E((typeof NOME_IT!=='undefined'&&NOME_IT[o.lib.technique])||o.lib.technique)}</td><td>${Lib.liveEntries(o.lib).length}</td><td>rev. ${o.lib.revision}<br><small>${E(String(o.lib.modifiedAt||'').slice(0,10))}${o.lib.author?' · '+E(o.lib.author):''}</small></td><td>${E((ORIGIN[o.origin]||[o.origin,o.origin])[en()?1:0])}${o.item&&o.item.folder&&o.origin==='shared'?`<br><small>${E(o.item.folder)}</small>`:''}${o.item&&o.item.hasConflictCopy?`<br><small class="libbad">${E(T('ha copie di conflitto','has conflict copies'))}</small>`:''}</td><td class="act"><button type="button" class="btn small ghost" data-act="open">${E(T('Apri','Open'))}</button> <button type="button" class="btn small ghost" data-act="export">${E(T('Esporta','Export'))}</button>${o.origin==='user'?` <button type="button" class="btn small ghost" data-act="remove">${E(T('Togli','Remove'))}</button>`:''}${o.origin==='project'||o.origin==='system'?` <button type="button" class="btn small ghost" data-act="adopt">${E(T('Copia nelle mie','Copy to mine'))}</button>`:''}</td></tr>`;
    const html=`<h2>${E(T('Librerie dei picchi','Peak libraries'))}</h2>
      <p class="why">${E(T('Ogni libreria vale per uno strumento e un tipo di campione: nome, strumento, tipo di campione, metodi, data e autore. Nessuna libreria è installata di serie: crea la tua o importane una.','Each library is for one instrument and one sample type: name, instrument, sample type, methods, date and author. No library is installed by default: create your own or import one.'))}</p>
      <div class="actions" style="justify-content:flex-start"><button type="button" class="btn small primary" id="lmNew">${E(T('Nuova libreria…','New library…'))}</button><button type="button" class="btn small" id="lmImport">${E(T('Importa un file .acchlib…','Import an .acchlib file…'))}</button>${desk?`<button type="button" class="btn small ghost" id="lmShared">${E(T('Aggiungi una cartella condivisa…','Add a shared folder…'))}</button>`:''}<input type="file" id="lmFile" accept=".acchlib,.json,application/json" hidden></div>
      ${conflicts.length?`<div class="signote bad" id="lmConflicts" role="alert"><b>${E(T('Copie di conflitto trovate (OneDrive o altra sincronizzazione)','Conflict copies found (OneDrive or other sync)'))}</b>${conflicts.map(it=>`<div>${E(it.name)} → ${E(it.conflictOf)} <button type="button" class="btn small" data-conf="${E(it.key)}">${E(T('Unisci nella libreria…','Merge into the library…'))}</button></div>`).join('')}<div class="why">${E(T('Una copia di conflitto non viene mai usata al posto della libreria: unisci le sue voci, poi toglila dalla cartella.','A conflict copy is never used instead of the library: merge its entries, then remove it from the folder.'))}</div></div>`:''}
      ${errs.length?`<div class="signote">${errs.map(it=>`<div>${E(it.folder||it.path||it.key)}: ${E(it.error)}</div>`).join('')}</div>`:''}
      <div class="ibfields" id="lmFilters"><label class="ibf"><span>${E(T('Tecnica','Technique'))}</span><select id="lfTech"><option value="">${E(T('tutte','all'))}</option>${[...new Set(L.map(o=>o.lib.technique))].map(t=>`<option value="${E(t)}" ${FIL.tech===t?'selected':''}>${E((typeof NOME_IT!=='undefined'&&NOME_IT[t])||t)}</option>`).join('')}</select></label>${[['lfIns','ins',T('Strumento','Instrument')],['lfSt','st',T('Tipo di campione','Sample type')],['lfMet','met',T('Metodo','Method')],['lfCh','ch',T('Canale','Channel')]].map(([id,k,l])=>`<label class="ibf"><span>${E(l)}</span><input type="text" id="${id}" value="${E(FIL[k]||'')}" autocomplete="off" style="width:130px"></label>`).join('')}<span class="why" id="lfCount"></span></div>
      <div class="tblwrap"><table id="lmTable"><thead><tr><th>${E(T('Libreria e strumento','Library and instrument'))}</th><th>${E(T('Tipo di campione','Sample type'))}</th><th>${E(T('Tecnica','Technique'))}</th><th>${E(T('Voci','Entries'))}</th><th>${E(T('Versione','Version'))}</th><th>${E(T('Dove','Where'))}</th><th></th></tr></thead><tbody>${L.length?L.map(row).join(''):`<tr><td colspan="7" class="pkempty">${E(T('Nessuna libreria. Creane una per il tuo strumento e il tuo tipo di campione, oppure importa un file.','No library. Create one for your instrument and sample type, or import a file.'))}</td></tr>`}</tbody></table></div>
      <div id="lmDetail"></div><div class="actions"><button class="btn primary" value="ok" type="submit">${E(T('Chiudi','Close'))}</button></div>`;
    const d=dialog('dlgLib', html);
    d.onclose=()=>rerender();
    $('#lmNew').onclick=async ()=>{ const f=files[cur]; const lib=await createDialog(f&&supports(f)?{instrument:instrumentOf(f), sampleType:ctx(f).st, technique:f.instr, method:rec(f).method}:{}); if (lib) openManager(lib.id); };
    $('#lmImport').onclick=()=>$('#lmFile').click();
    $('#lmFile').onchange=async ()=>{ const fl=$('#lmFile').files[0]; if (!fl) return; await importText(await fl.text(), fl.name); openManager(); };
    if ($('#lmShared')) $('#lmShared').onclick=async ()=>{ try{ const p=await store().addShared(T('Cartella delle librerie condivise','Shared libraries folder')); if (p){ await refresh(); toast(T('Cartella condivisa aggiunta: ','Shared folder added: ')+p); openManager(); } }catch(e){ toast(String(e)); } };
    d.querySelectorAll('[data-conf]').forEach(b=>b.onclick=async ()=>{ const cp=items.find(it=>it.key===b.dataset.conf), orig=items.find(it=>!it.conflictOf && it.lib && cp && it.folder===cp.folder && it.name===cp.conflictOf); if (!cp||!orig||!cp.lib) return; await mergeInto(orig, cp.lib); openManager(); });
    d.querySelectorAll('#lmTable tr[data-id]').forEach(tr=>{ const o=L.find(x=>x.lib.id===tr.dataset.id);
      tr.querySelectorAll('button[data-act]').forEach(b=>b.onclick=async ()=>{ const a=b.dataset.act;
        if (a==='open') renderDetail(o);
        if (a==='export') exportLib(o.lib);
        if (a==='adopt'){ const copy=JSON.parse(JSON.stringify(o.lib)); if (o.origin==='system'){ copy.id=Lib.newId('lib'); copy.revision=1; } await saveLib({origin:'user'}, copy); openManager(); }
        if (a==='remove'){ const ok=await win.AcchUi.choice(T(`Togliere la libreria «${o.lib.name}»? Nel desktop il file resta recuperabile nella cartella delle versioni.`,`Remove the library «${o.lib.name}»? On the desktop the file can still be recovered from the versions folder.`),[['no',T('Annulla','Cancel'),'ghost'],['yes',T('Togli','Remove'),'primary']]); if (ok==='yes'){ await store().remove(o.item); await refresh(); openManager(); } } }); });
    const applyF=()=>{ FIL={tech:$('#lfTech').value, ins:$('#lfIns').value.trim(), st:$('#lfSt').value.trim(), met:$('#lfMet').value.trim(), ch:$('#lfCh').value.trim()}; let k=0;
      d.querySelectorAll('#lmTable tr[data-id]').forEach(tr=>{ const o=L.find(x=>x.lib.id===tr.dataset.id), ok=libMatches(o.lib, FIL); tr.hidden=!ok; if (ok) k++; });
      $('#lfCount').textContent=T(`${k} di ${L.length}`,`${k} of ${L.length}`); };
    ['lfTech','lfIns','lfSt','lfMet','lfCh'].forEach(id=>{ const el=$('#'+id); el.oninput=el.onchange=applyF; }); applyF();
    if (sel){ const o=L.find(x=>x.lib.id===sel); if (o) renderDetail(o); }
  }
  let FIL={};
  /* filtri della finestra: tecnica esatta; strumento, tipo di campione, metodo (anche alias e metodi delle voci) e canale delle voci per testo */
  function libMatches(lib, F){ const has=(t,q)=>!q || Lib.normTxt(t).includes(Lib.normTxt(q)), E2=Lib.liveEntries(lib);
    return (!F.tech || lib.technique===F.tech) && has(Lib.instrumentText(lib.instrument), F.ins) && has(lib.sampleType, F.st)
      && (!F.met || (lib.methods||[]).some(m=>has(m.id,F.met) || (m.aliases||[]).some(a=>has(a,F.met))) || E2.some(e=>has(e.method,F.met)))
      && (!F.ch || E2.some(e=>has(e.channel||'',F.ch) || (e.channel && Lib.parseChannel(F.ch) && Lib.channelCompare(e.channel, F.ch).ok))); }
  function renderDetail(o){
    const L=o.lib, box=$('#lmDetail'); if (!box) return; const ro=o.origin==='system';
    const ent=Lib.liveEntries(L);
    box.innerHTML=`<h3 style="margin-top:14px">${E(L.name)}</h3><p class="why">${E(Lib.instrumentText(L.instrument))} · ${E(T('tipo di campione','sample type'))} ${E(L.sampleType||'—')} · ${E(T('profilo','profile'))} ${E(profName(L.profile))} · ${E(T('metodi','methods'))}: ${E((L.methods||[]).map(m=>m.id+(m.aliases&&m.aliases.length?' ('+m.aliases.join(', ')+')':'')).join('; ')||'—')}${L.description?'<br>'+E(L.description.slice(0,400)):''}</p>
      <div class="actions" style="justify-content:flex-start">${ro?'':`<button type="button" class="btn small" id="lmLog">${E(T('Idoneità del sistema e manutenzioni…','System suitability and maintenance…'))}</button>`}</div>
      ${(L.maintenance||[]).length||(L.suitability||[]).length?`<p class="why" id="lmLogSum">${E(T('Registro','Log'))}: ${(L.suitability||[]).slice(-3).map(r=>E(r.date+' '+(r.ok?T('idoneità superata','suitability passed'):T('idoneità non superata','suitability failed'))+(r.author?' ('+r.author+')':''))).concat((L.maintenance||[]).slice(-3).map(m=>E(m.date+' '+T('manutenzione','maintenance')+' '+m.kind+(m.target?' '+m.target:'')+(m.author?' ('+m.author+')':'')))).join(' · ')}</p>`:''}
      <div class="tblwrap"><table id="lmEntries"><thead><tr><th>${E(T('Voce','Entry'))}</th><th>tR / x</th><th>${E(T('Finestra','Window'))}</th><th>${E(T('Canale','Channel'))}</th><th>${E(T('Metodo','Method'))}</th><th>${E(T('Pendenza','Slope'))}</th><th>${E(T('Intercetta','Intercept'))}</th><th>${E(T('Unità','Units'))}</th><th>${E(T('Intervallo','Range'))}</th><th>n · R²</th><th>LOD · LOQ</th><th>${E(T('Data e lotto','Date and lot'))}</th><th></th></tr></thead><tbody>${ent.map(e=>{ const c=e.cal; return `<tr data-e="${E(e.id)}"><td>${E(e.name)}${e.rrt?`<br><small>RRT ${E(N(e.rrt,4))}</small>`:''}</td><td>${E(N(e.x,5))}</td><td>${e.window!=null?'± '+E(N(e.window,3)):'—'}</td><td>${E(Lib.channelText(e.channel)||'—')}</td><td>${E(e.method||'—')}${e.column?'<br><small>'+E(e.column)+'</small>':''}</td><td>${c?E(N(c.slope,5)):'—'}</td><td>${c?E(N(c.intercept,4)):'—'}</td><td>${c?E((c.areaUnit||'?')+' / '+(c.concUnit||'?')):'—'}</td><td>${c&&c.range?E(N(c.range[0],3)+'–'+N(c.range[1],3)):'—'}</td><td>${c?E((c.n||'—')+' · '+N(c.r2,5)):'—'}</td><td>${c?E(N(c.lod,3)+' · '+N(c.loq,3)):'—'}</td><td>${c?E((c.date||'—')+(c.standardLot?' · '+c.standardLot:'')):'—'}</td><td>${(e.chart||[]).length?`<span class="lmch">${['png','svg','csv'].map(k=>`<button type="button" class="btn small ghost" data-chart="${E(e.id)}" data-kind="${k}" title="${E(T('Carta di controllo','Control chart'))}">${k.toUpperCase()}</button>`).join('')}</span>`:''}${ro?'':`<button type="button" class="btn small ghost" data-del="${E(e.id)}" title="${E(T('Togli la voce','Remove the entry'))}">×</button>`}</td></tr>`; }).join('')||`<tr><td colspan="13" class="pkempty">${E(T('Nessuna voce.','No entries.'))}</td></tr>`}</tbody></table></div>`;
    box.querySelectorAll('[data-chart]').forEach(b=>b.onclick=()=>exportChart(o, L.entries.find(e=>e.id===b.dataset.chart), b.dataset.kind));
    if ($('#lmLog')) $('#lmLog').onclick=()=>logDialog(o);
    box.querySelectorAll('[data-del]').forEach(b=>b.onclick=async ()=>{ const copy=JSON.parse(JSON.stringify(L)); Lib.removeEntry(copy, b.dataset.del); const it=await saveLib(o.item||{origin:'user'}, copy); if (it) openManager(L.id); });
  }
  /* idoneità del sistema e manutenzioni, salvate nella libreria con data e autore. Una manutenzione dopo la data di una taratura la invalida;
     un'idoneità non superata blocca le tarature salvate di quel giorno */
  function logDialog(o){ const L=o.lib;
    const rows=[...(L.suitability||[]).map(r=>[r.date, r.ok?T('idoneità superata','suitability passed'):T('idoneità non superata','suitability failed'), '', r.note, r.author]), ...(L.maintenance||[]).map(m=>[m.date, T('manutenzione','maintenance')+': '+m.kind, m.target, m.note, m.author])].sort((a,b)=>String(b[0]).localeCompare(String(a[0])));
    const d=dialog('dlgLibLog', `<h2>${E(T('Idoneità del sistema e manutenzioni','System suitability and maintenance'))}</h2><p class="why">${E(L.name)}. ${E(T('Una manutenzione (lampada, colonna, cella) registrata dopo la data di una taratura salvata la invalida. Un\'idoneità non superata blocca le tarature salvate di quel giorno.','A maintenance event (lamp, column, cell) recorded after the date of a saved calibration invalidates it. A failed suitability blocks the saved calibrations of that day.'))}</p>
      <div class="ibfields"><label class="ibf"><span>${E(T('Evento','Event'))}</span><select id="lgKind"><option value="suit-ok">${E(T('idoneità superata','suitability passed'))}</option><option value="suit-ko">${E(T('idoneità non superata','suitability failed'))}</option><option value="lampada">${E(T('manutenzione: lampada','maintenance: lamp'))}</option><option value="colonna">${E(T('manutenzione: colonna','maintenance: column'))}</option><option value="cella">${E(T('manutenzione: cella','maintenance: cell'))}</option><option value="altro">${E(T('manutenzione: altro','maintenance: other'))}</option></select></label>
      <label class="ibf"><span>${E(T('Data','Date'))}</span><input type="date" id="lgDate" value="${today()}"></label><label class="ibf"><span>${E(T('Colonna o parte (facoltativo)','Column or part (optional)'))}</span><input type="text" id="lgTarget"></label><label class="ibf"><span>${E(T('Autore','Author'))}</span><input type="text" id="lgAuthor" value="${E(hs('acch.lib.author')||'')}"></label><label class="ibf" style="flex:1 1 100%"><span>${E(T('Nota','Note'))}</span><input type="text" id="lgNote"></label></div>
      <div class="tblwrap"><table id="lgTable"><thead><tr><th>${E(T('Data','Date'))}</th><th>${E(T('Evento','Event'))}</th><th>${E(T('Parte','Part'))}</th><th>${E(T('Nota','Note'))}</th><th>${E(T('Autore','Author'))}</th></tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${E(c||'')}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="5" class="pkempty">${E(T('Nessun evento registrato.','No events recorded.'))}</td></tr>`}</tbody></table></div>
      <div class="actions"><button class="btn ghost" value="no" type="submit">${E(T('Chiudi','Close'))}</button><button class="btn primary" value="ok" type="submit" id="lgOk">${E(T('Registra','Record'))}</button></div>`);
    d.onclose=async ()=>{ if (d.returnValue!=='ok') return; const k=$('#lgKind').value, date=$('#lgDate').value||today(), au=$('#lgAuthor').value.trim(), note=$('#lgNote').value.trim(), target=$('#lgTarget').value.trim();
      if (!au){ toast(T('Scrivi l\'autore: ogni evento del registro ha data e autore.','Enter the author: every log event has a date and an author.')); return; }
      hset('acch.lib.author', au); const copy=JSON.parse(JSON.stringify(L));
      if (k==='suit-ok' || k==='suit-ko') copy.suitability=(copy.suitability||[]).concat([{date, ok:k==='suit-ok', note, author:au}]);
      else copy.maintenance=(copy.maintenance||[]).concat([{date, kind:k, target, note, author:au}]);
      copy.revision++; copy.modifiedAt=new Date().toISOString(); const it=await saveLib(o.item||{origin:'user'}, copy); if (it) openManager(L.id); }; }
  function exportLib(lib){ const txt=Lib.serialize(lib); win.download(new Blob([txt],{type:'application/vnd.acchiappaspettri.library+json'}), Lib.fileNameFor(lib)); }
  /* importazione: un file .acchlib o .acchlib.json (o la bozza di letteratura) diventa una libreria dell'utente; se c'è già, unione voce per voce */
  async function importText(text, name){
    let lib; try{ lib=Lib.parse(text); }catch(e){ toast(T('Il file non è una libreria di Acchiappaspettri: ','The file is not an Acchiappaspettri library: ')+(e.code||e.message)); return null; }
    await (ready||refresh());
    const have=items.find(it=>it.lib && it.lib.id===lib.id && it.origin==='user');
    const it=have ? await mergeInto(have, lib) : await saveLib({origin:'user'}, lib);
    if (it) toast(T(`Libreria importata: «${lib.name}», ${Lib.liveEntries(lib).length} voci.`,`Library imported: «${lib.name}», ${Lib.liveEntries(lib).length} entries.`));
    return it; }

  /* ---------- al caricamento: strumento riconosciuto, tipo di campione, libreria proposta ---------- */
  async function onLoaded(before){
    await (ready||refresh());
    const fresh=files.filter(f=>!before.has(f) && supports(f));
    if (!fresh.length) return;
    const def=hs(KEY_ST)||'';
    fresh.forEach(f=>{ if (!ctx(f).st && def) setCtx(f, {st:def}); });
    const f=fresh[0], r=rec(f), libsT=allLibs().filter(o=>o.lib.technique===f.instr);
    // nessuna libreria per questa tecnica: niente finestra che interrompe il lavoro; la sezione della scheda Analisi propone di crearla
    if (!libsT.length){ rerender(); return; }
    if (win.ACCH_PENDING_MEM) return;   // apertura di un progetto: contesto già salvato negli spettri
    loadPrompt(fresh);
  }
  function loadPrompt(list){
    const f=list[0], ins=instrumentOf(f), insTxt=Lib.instrumentText(ins), r=rec(f);
    const html=()=>{ const st=$('#lpSt')?$('#lpSt').value.trim():(ctx(f).st||''); const ch=Lib.choose(allLibs(), {instrument:instrumentOf(f), sampleType:st, technique:f.instr});
      return ch.pick ? `<p id="lpPick">${E(T('Libreria proposta: ','Proposed library: '))}<b>${E(ch.pick.lib.name)}</b> (rev. ${ch.pick.lib.revision}, ${Lib.liveEntries(ch.pick.lib).length} ${E(T('voci','entries'))})</p>`
        : `<p id="lpPick">${E(T('Non c\'è una libreria per questa coppia di strumento e tipo di campione.','There is no library for this instrument and sample type.'))}${(ch.wrongInstrument||[]).length?' '+E(T('Quella con lo stesso tipo di campione è di un altro strumento e non viene usata.','The one with the same sample type is for another instrument and is not used.')):''} <button type="button" class="btn small" id="lpCreate">${E(T('Creala','Create it'))}</button></p>`; };
    const d=dialog('dlgLibLoad', `<h2>${E(T('Libreria per questi cromatogrammi','Library for these chromatograms'))}</h2>
      <p>${E(T('File caricati: ','Files loaded: '))}${list.length} · ${E(T('strumento','instrument'))}: <b id="lpIns">${E(insTxt||T('non riconosciuto','not recognised'))}</b>${r.evidence.length?`<br><small>${E(T('dall\'intestazione: ','from the header: '))}${r.evidence.slice(0,2).map(x=>'«'+E(x.line)+'»').join(' · ')}</small>`:''}</p>
      <div class="ibfields"><label class="ibf"><span>${E(T('Tipo di campione','Sample type'))}</span><input type="text" id="lpSt" list="lpStList" value="${E(ctx(f).st||hs(KEY_ST)||'')}" autocomplete="off"><datalist id="lpStList">${sampleTypes().map(s=>`<option value="${E(s)}">`).join('')}</datalist></label><button type="button" class="btn small ghost" id="lpEdit">${E(T('Correggi lo strumento…','Correct the instrument…'))}</button></div>
      <div id="lpBox">${html()}</div>
      <div class="actions"><button class="btn ghost" value="later" type="submit">${E(T('Più tardi','Later'))}</button><button class="btn primary" value="ok" type="submit" id="lpOk">${E(insTxt?T('Conferma lo strumento e usa','Confirm the instrument and use'):T('Usa','Use'))}</button></div>`);
    const upd=()=>{ $('#lpBox').innerHTML=html(); const c=$('#lpCreate'); if (c) c.onclick=async ()=>{ const lib=await createDialog({instrument:instrumentOf(f), sampleType:$('#lpSt')?$('#lpSt').value.trim():'', technique:f.instr, method:r.method}); if (lib){ if (!$('#dlgLibLoad').open) $('#dlgLibLoad').showModal(); upd(); } }; };
    $('#lpSt').oninput=upd; upd();
    let edited=null; $('#lpEdit').onclick=async ()=>{ const v=await editInstrument(instrumentOf(f)); if (v){ edited=v; list.forEach(g=>setCtx(g,{ins:v})); $('#lpIns').textContent=Lib.instrumentText(v); } if (!d.open) d.showModal(); upd(); };
    d.onclose=()=>{ const st=$('#lpSt').value.trim(); list.forEach(g=>setCtx(g, {st})); rememberSt(st);
      if (d.returnValue==='ok') list.forEach(g=>{ if (Lib.instrumentText(instrumentOf(g))===Lib.instrumentText(edited||ins) || edited) setCtx(g, {insOk:true, ins:edited||instrumentOf(g)}); });
      rerender(); };
  }

  /* ---------- «Aggiungi alla libreria…» dal clic destro su un picco ---------- */
  function ctxItems(f, p, it){ if (!supports(f)) return; it('📚', T('Aggiungi alla libreria…','Add to library…'), ()=>addPeakDialog(f, p)); }
  async function addPeakDialog(f, p){
    await (ready||refresh());
    const ch=chooseFor(f), libs=allLibs().filter(o=>o.lib.technique===f.instr && o.origin!=='system'), P=processed(f);
    const a=(()=>{ try{ return peakAreas(P.xs, P.dir<0?Float64Array.from(P.ys,v=>-v):P.ys, [p.x])[0]; }catch(e){ return null; } })();
    const w0=f.instr==='hplc' ? Math.max(0.05, a&&a.xa!=null ? +(Math.min(p.x-a.xa, a.xb-p.x)/2).toPrecision(2) : 0.1) : ((SNAP_TOL&&SNAP_TOL[f.instr])||2);
    const chan=fileChannel(f), name=p.custom?(p.nameUi||p.name||''):'';
    const d=dialog('dlgLibAdd', `<h2>${E(T('Aggiungi alla libreria','Add to library'))}</h2>
      <div class="field"><label for="laLib">${E(T('Libreria','Library'))}</label><select id="laLib">${libs.map(o=>`<option value="${E(o.lib.id)}" ${ch.pick&&ch.pick.lib.id===o.lib.id?'selected':''}>${E(o.lib.name)}</option>`).join('')}<option value="__new">${E(T('nuova libreria per questo strumento e tipo di campione…','new library for this instrument and sample type…'))}</option></select></div>
      ${field('laName',T('Nome','Name'),name)}<div class="ibfields"><label class="ibf"><span>${f.instr==='hplc'?'tR (min)':'x'}</span><input type="text" id="laX" value="${E(String(+p.x.toPrecision(6)))}"></label><label class="ibf"><span>${E(T('Finestra ±','Window ±'))}</span><input type="text" id="laW" value="${E(String(w0))}"></label>${f.instr==='hplc'?`<label class="ibf"><span>${E(T('Canale','Channel'))}</span><input type="text" id="laCh" value="${E(Lib.channelText(chan))}" placeholder="DAD1A Sig=220,4 Ref=off"></label><label class="ibf"><span>${E(T('Metodo','Method'))}</span><input type="text" id="laMet" value="${E(rec(f).method||'')}"></label>`:''}</div>
      <p class="why">${E(T('La voce serve a riconoscere il picco. La pendenza si aggiunge dopo una retta di taratura in «Più campioni» («Salva le pendenze nella libreria…»).','The entry identifies the peak. The slope is added after a calibration line in «Multiple samples» («Save the slopes in the library…»).'))}</p>
      <div class="actions"><button class="btn ghost" value="no" type="submit">${E(T('Annulla','Cancel'))}</button><button class="btn primary" value="ok" type="submit" id="laOk">${E(T('Aggiungi','Add'))}</button></div>`);
    if (!libs.length) $('#laLib').value='__new';
    d.onclose=async ()=>{ if (d.returnValue!=='ok') return; const nm=$('#laName').value.trim(); if (!nm){ toast(T('Serve un nome per la voce.','The entry needs a name.')); return; }
      let target=$('#laLib').value; if (target==='__new'){ const lib=await createDialog({instrument:instrumentOf(f), sampleType:ctx(f).st||'', technique:f.instr, method:rec(f).method}); if (!lib) return; target=lib.id; setCtx(f,{id:lib.id}); }
      const o=libById(target); if (!o) return; const copy=JSON.parse(JSON.stringify(o.lib)), x=+String($('#laX').value).replace(',','.'), w=+String($('#laW').value).replace(',','.');
      const e={name:nm, x, window:w>0?w:null, channel:$('#laCh')?Lib.parseChannel($('#laCh').value):null, method:$('#laMet')?$('#laMet').value.trim():'', integration:a&&a.xa!=null?{a:+a.xa.toPrecision(6), b:+a.xb.toPrecision(6)}:null};
      const ex=Lib.liveEntries(copy).find(q=>Lib.normTxt(q.name)===Lib.normTxt(nm)); if (ex){ e.id=ex.id; e.cal=ex.cal; e.chart=ex.chart; }
      Lib.upsert(copy, e); await saveLib(o.item||{origin:'user'}, copy); };
  }

  /* ---------- «Salva le pendenze nella libreria di questo strumento e tipo di campione» (Più campioni, HPLC) ---------- */
  function multiHook(){
    // HPLC e, dove ha senso, le altre tecniche: una banda misurata come area o altezza, senza rapporto con una seconda banda
    try{ const instr=$('#mvInstr')&&$('#mvInstr').value; if (!TECHS.includes(instr)) return; const c=mvCfg(instr); if (c.model==='pls' || c.model==='trend' || c.a==null || c.b==null || (c.c!=null && c.d!=null) || !['area','height'].includes(c.meas)) return;
      const cal=mvCalib(mvTable(instr)); if (!cal || cal.b==null || cal.few) return; const out=$('#mvOut'); if (!out || $('#libSaveSlope')) return;
      const b=doc.createElement('button'); b.type='button'; b.className='btn small'; b.id='libSaveSlope'; b.textContent=T('Salva le pendenze nella libreria di questo strumento e tipo di campione…','Save the slopes in the library of this instrument and sample type…');
      b.onclick=()=>saveSlopeDialog(cal, c, instr); const p=doc.createElement('p'); p.className='libsave'; p.appendChild(b); out.appendChild(p); }catch(e){ console.warn(e); } }
  // ripetibilità relativa dai residui relativi degli standard (gradi di libertà n − 2): è la s_r dell'incertezza (SPEC)
  function relRep(cal){ try{ return Q.relRepeatabilityDf(cal.pts, cal.a, cal.b); }catch(e){ return null; } }
  async function saveSlopeDialog(cal, c, instr){
    instr=instr||'hplc'; const hplc=instr==='hplc';
    await (ready||refresh());
    if (S.conv && S.conv[instr]==='norm'){ toast(T('Dati normalizzati: una retta da dati normalizzati non si salva in libreria.','Normalised data: a line from normalised data is not saved to the library.')); return; }
    const std=cal.pts.map(p=>p.f).filter(Boolean), f0=std[0]||files[cur], chs=chooseFor(f0), libs=allLibs().filter(o=>o.lib.technique===instr && o.origin!=='system');
    const xs=cal.pts.map(p=>p.x), xmax=(()=>{ const v=std.map(f=>{ try{ const P=processed(f); const m=bandMeasure(P.xs, upData(P).y, c.a, c.b); return m?m.xmax:null; }catch(e){ return null; } }).filter(Number.isFinite); return v.length ? v.reduce((a,b)=>a+b,0)/v.length : (c.a+c.b)/2; })();
    const label=(()=>{ try{ const d=viewOf(f0), p=(d.peaks||[]).filter(q=>q.custom && q.x>=c.a && q.x<=c.b)[0]; return p?(p.nameUi||p.name):''; }catch(e){ return ''; } })();
    const chan=fileChannel(f0);
    const d=dialog('dlgLibSlope', `<h2>${E(T('Salva le pendenze nella libreria','Save the slopes in the library'))}</h2>
      <p class="why">${E(T('Retta','Line'))}: y = ${E(N(cal.a,4))} + ${E(N(cal.b,5))}·x · R² ${E(N(cal.r2,5))} · n ${cal.n} · s_y/x ${E(N(cal.syx,3))} · ${E(T('intervallo','range'))} ${E(N(Math.min(...xs),3))}–${E(N(Math.max(...xs),3))} ${E(c.unit||'')}</p>
      <div class="field"><label for="lsLib">${E(T('Libreria di questo strumento e tipo di campione','Library of this instrument and sample type'))}</label><select id="lsLib">${libs.map(o=>`<option value="${E(o.lib.id)}" ${chs.pick&&chs.pick.lib.id===o.lib.id?'selected':''}>${E(o.lib.name)}</option>`).join('')}<option value="__new">${E(T('nuova libreria…','new library…'))}</option></select></div>
      ${field('lsName',T('Analita','Analyte'),label)}<div class="ibfields"><label class="ibf"><span>${E(T('Profilo (obbligatorio)','Profile (required)'))}</span><select id="lsProf"><option value="">—</option>${Lib.PROFILES.map(p=>`<option value="${p}">${E(profName(p))}</option>`).join('')}</select></label><label class="ibf"><span>${E(T('Lotto dello standard','Standard lot'))}</span><input type="text" id="lsLot"></label><label class="ibf"><span>${E(T('Data della taratura','Calibration date'))}</span><input type="date" id="lsDate" value="${today()}"></label><label class="ibf"><span>${E(T('Unità della concentrazione','Concentration unit'))}</span><input type="text" id="lsU" value="${E(c.unit||'')}"></label>${hplc?`<label class="ibf"><span>${E(T('Canale','Channel'))}</span><input type="text" id="lsCh" value="${E(Lib.channelText(chan)||c.chan||'')}"></label>`:''}<label class="ibf"><span>${E(T('Metodo','Method'))}</span><input type="text" id="lsMet" value="${E(rec(f0).method||'')}"></label></div>
      <div class="actions"><button class="btn ghost" value="no" type="submit">${E(T('Annulla','Cancel'))}</button><button class="btn primary" value="ok" type="submit" id="lsOk">${E(T('Salva','Save'))}</button></div>`);
    if (!libs.length) $('#lsLib').value='__new';
    d.onclose=async ()=>{ if (d.returnValue!=='ok') return;
      const prof=$('#lsProf').value, nm=$('#lsName').value.trim(); if (!prof){ toast(T('Scegli il profilo: è obbligatorio per salvare una taratura.','Choose the profile: it is required to save a calibration.')); return; } if (!nm){ toast(T('Scrivi il nome dell\'analita.','Enter the analyte name.')); return; }
      let target=$('#lsLib').value; if (target==='__new'){ const lib=await createDialog({instrument:instrumentOf(f0), sampleType:ctx(f0).st||'', technique:instr, method:rec(f0).method}); if (!lib) return; target=lib.id; std.forEach(g=>setCtx(g,{id:lib.id})); }
      const o=libById(target); if (!o) return; const copy=JSON.parse(JSON.stringify(o.lib)), met=$('#lsMet').value.trim();
      if (met && !(copy.methods||[]).some(m=>m.id===met)) copy.methods=(copy.methods||[]).concat([{id:met}]);
      const e={name:nm, x:+xmax.toPrecision(6), window:+Math.max(hplc?0.02:1e-6, Math.abs(c.b-c.a)/2).toPrecision(3), channel:$('#lsCh')?Lib.parseChannel($('#lsCh').value):null, method:met, integration:{a:c.a, b:c.b}, profile:prof,
        cal:{kind:'line', slope:cal.b, intercept:cal.a, sa:cal.sa, sb:cal.sb, syx:cal.syx, srel:(relRep(cal)||{}).s, srelDf:(relRep(cal)||{}).df, n:cal.n, df:cal.df, r2:cal.r2, xm:cal.xm, ym:cal.ym, sxx:cal.sxx, lod:cal.lod, loq:cal.loq, range:[Math.min(...xs), Math.max(...xs)], areaUnit:appAreaUnit(f0), concUnit:$('#lsU').value.trim(), date:$('#lsDate').value||today(), standardLot:$('#lsLot').value.trim(), normalized:false, source:'taratura', measure:c.meas==='height'?'height':'area'}};
      const ex=Lib.liveEntries(copy).find(q=>Lib.normTxt(q.name)===Lib.normTxt(nm) && Lib.channelText(q.channel)===Lib.channelText(e.channel)); if (ex){ e.id=ex.id; e.chart=ex.chart; }
      Lib.upsert(copy, e); const it=await saveLib(o.item||{origin:'user'}, copy); if (it) toast(T(`Pendenza di «${nm}» salvata nella libreria «${copy.name}».`,`Slope of «${nm}» saved in the library «${copy.name}».`)); };
  }

  /* ---------- esportazioni: CSV, PDF e metodi con la provenienza (SPEC «Esportazioni») ---------- */
  function exportRows(inc){
    const out=[]; for (const f of inc||[]){ if (!supports(f)) continue; let q; try{ q=quantRows(f); }catch(e){ console.warn(e); continue; } if (!q.rows) continue;
      for (const w of q.rows){ if (!w.entry.cal || !w.res) continue; out.push({f, w, lib:q.lib}); } }
    return out; }
  function csvRows(inc){
    const lg=TD('it','en'), R=exportRows(inc); if (!R.length) return null;
    const head=TD(['File','Nome','Analita','tR atteso','tR trovato','Area','Unità area','Concentrazione','U','Fattore di copertura','Unità','Stato','Segno','Messaggio','Avvisi','Profilo','Metodo di taratura','k','Livelli dei controlli','Scostamenti %','Deriva %','Stato della carta','Età (giorni)','Data taratura','Lotto standard','Libreria','Id libreria','Revisione libreria','Voce','Id voce','Revisione voce','Strumento della libreria','Tipo di campione','Fonte','Motivazione soglie allargate'],
      ['File','Name','Analyte','Expected tR','Found tR','Area','Area unit','Concentration','U','Coverage factor','Unit','Status','Mark','Message','Warnings','Profile','Calibration method','k','Control levels','Deviations %','Drift %','Chart status','Age (days)','Calibration date','Standard lot','Library','Library id','Library revision','Entry','Entry id','Entry revision','Library instrument','Sample type','Source','Reason for widened limits']);
    const rows=[head];
    for (const {f, w, lib} of R){ const r=w.res, e=w.entry, p=r.provenance||{};
      rows.push([f.name, dispTitle(f), e.name, ND(w.expected), ND(w.x), ND(w.y), e.cal.areaUnit||'', r.ok?ND(r.x):'', r.ok&&r.U!=null?ND(r.U,4):'', r.ok&&r.u?ND(r.u.kU,4):'', e.cal.concUnit||'', r.ok?TD('ok','ok'):TD('non verificata','not verified'), r.ok&&r.mode==='nocontrol'?Q.markText(lg):'', [Q.statusText(r, lg), compareText(r, lg)].filter(Boolean).join(' '), Q.warningTexts(r, lg).join(' '), profName(p.profile||lib.profile, true), Q.modeText(r, lg), r.k!=null?ND(r.k,6):'', (w.controls||[]).map(c=>ND(c.nominal)).join(' '), (r.devs||[]).map(v=>ND(v,3)).join(' '), r.drift!=null?ND(r.drift,3):'', r.chart?(r.chart.active?(r.chart.rule||'ok'):TD('non attiva','not active')):'', p.age!=null?p.age:'', p.calDate||'', p.standardLot||'', p.library||'', p.libraryId||'', p.revision||'', p.entry||'', p.entryId||'', p.entryRev||'', Lib.instrumentText(lib.instrument), lib.sampleType||'', e.cal.source==='letteratura'?((e.source&&(e.source.doi||e.source.citation))||TD('letteratura','literature')):TD('taratura dell\'utente','user calibration'), lib.thresholdReason||'']); }
    return rows; }
  function exportFiles(inc, out, used){ try{ const rows=csvRows(inc); if (!rows) return; const csep=TD(';',','), cell=v=>{ const s=String(v==null?'':v); return /[";\r\n]/.test(s)||s.includes(csep) ? '"'+s.replace(/"/g,'""')+'"' : s; };
      const name=TD('concentrazioni_da_libreria.csv','concentrations_from_library.csv'); const i=out.findIndex(x=>/^(metodi|methods)/.test(x[0])); const item=[name, '﻿'+rows.map(r=>r.map(cell).join(csep)).join('\r\n')];
      if (i>=0) out.splice(i,0,item); else out.push(item); if (used) used.add('storedcal'); }catch(e){ console.error(e); } }
  function methodsText(inc){ const R=exportRows(inc); if (!R.length) return '';
    const libs=[...new Map(R.map(x=>[x.lib.id, x.lib])).values()], noc=R.some(x=>x.w.res.ok && x.w.res.mode==='nocontrol'), ctl=R.some(x=>x.w.res.ok && /ctrl/.test(x.w.res.mode||''));
    return TD(`Concentrazioni HPLC calcolate dalla taratura salvata nella libreria dello strumento e del tipo di campione (${libs.map(l=>`«${l.name}» rev. ${l.revision}`).join('; ')}), senza rifare la retta: x = (y/k − a)/b, con k dal controllo del giorno${ctl?'':' (k = 1 se il controllo manca)'}; incertezza estesa U (k = 2) secondo la specifica della taratura salvata (ICH Q2(R2); Eurachem; ISO 8466-1; regole di Westgard per la carta di controllo).${noc?' Alcuni risultati sono marcati «senza controllo del giorno»: profilo Ricerca, una deriva dello strumento tra il giorno della taratura e quello della misura non verrebbe vista; nell\'incertezza è compresa una componente tra i giorni del 5%.':''}`,
      `HPLC concentrations computed from the calibration saved in the library of the instrument and sample type (${libs.map(l=>`«${l.name}» rev. ${l.revision}`).join('; ')}), without refitting the line: x = (y/k − a)/b, with k from the same-day control${ctl?'':' (k = 1 when the control is missing)'}; expanded uncertainty U (k = 2) according to the saved-calibration specification (ICH Q2(R2); Eurachem; ISO 8466-1; Westgard rules for the control chart).${noc?' Some results are marked «without a same-day control»: Research profile, an instrument drift between the calibration day and the measurement day would not be seen; the uncertainty includes a 5% between-day component.':''}`); }
  function pdfPages(doc2, line, head, footer, inc){
    const R=exportRows(inc); if (!R.length) return; const lg=TD('it','en');
    head(TD('Concentrazioni dalla libreria dello strumento','Concentrations from the instrument library'));
    for (const {f, w, lib} of R){ const r=w.res, e=w.entry, cu=e.cal.concUnit||'';
      line(`${dispTitle(f)} · ${e.name}: ${r.ok?`${N(r.x,4)}${r.U!=null?' ± '+N(r.U,2):''} ${cu} (U, k = ${r.u?N(r.u.kU,3):2})`:TD('nessun valore','no value')}${r.ok&&r.mode==='nocontrol'?' · '+Q.markText(lg).toUpperCase():''}`, 9.5, true, r.ok?(r.mode==='nocontrol'?[150,80,0]:0):[179,38,30]);
      line(Q.statusText(r, lg), 8.5, !r.ok, r.ok?60:[179,38,30]); if (r.compare) line(compareText(r, lg), 8.5, true, 0);
      line(`${Q.provenanceText(r, lg)} · ${TD('profilo','profile')} ${profName((r.provenance&&r.provenance.profile)||lib.profile, true)} · ${TD('metodo','method')} ${Q.modeText(r, lg)}${r.k!=null?' · k '+N(r.k,5):''}`, 8, false, 90);
      Q.warningTexts(r, lg).forEach(t=>line(t, 8, false, 90)); }
    const m=methodsText(inc); if (m) line(m, 8, false, 60);
    footer(); }

  /* ---------- progetto: librerie usate incorporate (FORMATO-ACCHSPETTRI, project/libraries.json) ---------- */
  function usedLibs(){ const ids=new Set(); files.forEach(f=>{ if (!supports(f)) return; const ch=chooseFor(f); if (ch.pick) ids.add(ch.pick.lib.id); }); return [...ids].map(id=>libById(id)).filter(Boolean).map(o=>o.lib); }
  function hookProject(){ const P=win.AcchProject; if (!P) return;
    Object.defineProperty(P, 'libraries', {configurable:true, enumerable:true,
      get(){ const out=new Map(); for (const p of embedded) out.set(p.lib.id, {id:p.lib.id, revision:p.lib.revision, name:p.lib.name, data:p.lib});
        for (const l of usedLibs()) out.set(l.id, {id:l.id, revision:l.revision, name:l.name, data:JSON.parse(JSON.stringify(l))});
        return [...out.values()]; },
      set(v){ embedded=[]; for (const x of (Array.isArray(v)?v:[])){ try{ const lib=Lib.normalize(JSON.parse(JSON.stringify(x.data||{}))); embedded.push({lib, id:x.id, revision:x.revision}); }catch(e){ console.warn('libreria del progetto non valida', e); } } files.forEach(g=>g._libRes=null); } }); }

  /* ---------- aggancio alla pagina ---------- */
  function init(){
    hookProject(); refresh().then(()=>{ try{ render(); }catch(e){} });
    const wrap=(n, after)=>{ const o=win[n]; if (typeof o!=='function') return; win[n]=function(){ const r=o.apply(this, arguments); try{ after.apply(this, arguments); }catch(e){ console.error(e); } return r; }; };
    wrap('renderAnalysis', ()=>render());
    wrap('renderMulti', ()=>multiHook());
    wrap('renderExpNames', ()=>exportNote());
    const ae=win.addEntries; if (typeof ae==='function') win.addEntries=async function(){ const before=new Set(files); const r=await ae.apply(this, arguments); try{ await onLoaded(before); }catch(e){ console.error(e); } return r; };
    // comando nella tavolozza
    const c0=win.commands; if (typeof c0==='function') win.commands=function(){ const C=c0.apply(this, arguments); try{ C.push({grp:T('Analisi','Analysis'), ic:'📚', label:T('Librerie dei picchi…','Peak libraries…'), run:()=>openManager(), kw:'libreria library pendenze slope taratura salvata'}); }catch(e){} return C; };
    const css=doc.createElement('style'); css.textContent='#secLib .libmark{font-weight:700;color:var(--warn,#9a5b00)} #secLib .libbad,.libdlg .libbad{color:var(--bad,#b3261e)} #secLib .libprov{color:var(--muted);font-size:12px} #secLib table.libq td{vertical-align:top} .libdlg table td,.libdlg table th{padding:4px 6px;text-align:left;vertical-align:top} #secLib .libsrc{color:var(--muted)}';
    doc.head.appendChild(css);
  }
  win.AcchLibUi={init, render, refresh, openManager, importText, saveLib, quantRows, chooseFor, recognize:rec, ctxItems, exportFiles, csvRows, chartFiles, chartCount, chartSvg, chartCsv, chartPng, logDialog, libMatches, compareText, methodsText, pdfPages, setCtx, ctx, instrumentOf, askConflicts, mergeInto, get items(){ return items; }, get embedded(){ return embedded; }, ready:()=>ready||refresh()};
  if (doc.readyState==='loading') doc.addEventListener('DOMContentLoaded', init); else init();
})(typeof self!=='undefined' ? self : this);
