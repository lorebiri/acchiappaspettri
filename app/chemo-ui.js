// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Analisi → Più campioni → «Serie, MCR-ALS e cinetica globale» (SPEC-AVANZATE §2–§3). Interfaccia: i calcoli sono in app/mcr-core.js e
   app/kinetics-core.js e girano a fette (runSliced: nessun blocco dell'interfaccia oltre 50 ms). Usa le funzioni globali della pagina
   (files, processed, persist, refreshAll…). Una serie è uno spettro derivato (la media delle righe) con i dati propri in f.series,
   salvato nel progetto senza file originale e ricostruito all'apertura (AcchProject.restoreDerived).
   Desktop: testi professionali, segni △ e ⊘ al posto delle emoji; online il tono della pagina. */
(function(win){
  'use strict';
  const doc=win.document, $=s=>doc.querySelector(s), M=win.McrCore, K=win.KinCore;
  if (!M || !K) return;
  const en=()=>!!(win.AcchI18n && win.AcchI18n.lang==='en'), T=(it,e)=>en()?e:it, desk=()=>!!win.ACCH_SHELL;
  const W=(it,e)=>T(it,e), WEB=(webIt, webEn, dIt, dEn)=>desk()?T(dIt,dEn):T(webIt,webEn);
  const SIG=lv=>lv==='stop'?(desk()?'⊘':'⛔'):(desk()?'△':'⚠️');
  const h=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const dec=()=>en()?'.':',';
  const g=(v,d)=>v==null||!Number.isFinite(+v)?'—':(Math.abs(v)>=1e5||(Math.abs(v)<1e-3&&v!==0))?(+v).toExponential((d||4)-1).replace('.',dec()):String(+(+v).toPrecision(d||4)).replace('.',dec());
  const num=s=>{ const v=parseFloat(String(s).replace(',','.')); return Number.isFinite(v)?v:null; };
  const COL=['#1f5fbf','#c25a00','#2a9d5c','#7b4fc9','#b3261e','#8a6d00','#0f7c8c','#5f6b7d','#d14f9b','#4b7d1b'];
  const allFiles=()=>(typeof files!=='undefined'?files:[]);
  const seriesFiles=()=>allFiles().filter(f=>f.series && M.validSeries(f.series));
  const RT={tab:'serie', sel:null, busy:null, sInstr:null, sWhich:'inc', axis:null, msg:null};
  const keyOf=f=>f.path||f.name;
  const qName=q=>({tempo:T('tempo','time'), dose:'dose', temperatura:T('temperatura','temperature'), altro:T('valore','value')})[q]||q||T('valore','value');

  /* ---------------- calcolo a fette ---------------- */
  function runSliced(gen, onProg){ return new Promise((res, rej)=>{ let last=0;
    const step=()=>{ const t0=performance.now(); try{ let r; do { r=gen.next(); if (r.done) return res(r.value); if (r.value && onProg && performance.now()-last>120){ last=performance.now(); onProg(r.value); } } while (performance.now()-t0<12); }catch(e){ return rej(e); }
      setTimeout(step,0); };
    step(); }); }

  /* ---------------- grafici: una specifica, due pittori (SVG a schermo, canvas nel PDF) ---------------- */
  function ticks(a, b, log){ if (log){ const out=[]; for (let e=Math.floor(Math.log10(a)); e<=Math.ceil(Math.log10(b)); e++){ const v=Math.pow(10,e); if (v>=a*0.999 && v<=b*1.001) out.push(v); } return out; }
    const span=b-a||1, raw=span/5, p=Math.pow(10,Math.floor(Math.log10(raw))), st=[1,2,2.5,5,10].map(k=>k*p).find(k=>span/k<=6)||p*10, out=[]; for (let v=Math.ceil(a/st)*st; v<=b+st*1e-9; v+=st) out.push(Math.abs(v)<st*1e-9?0:v); return out; }
  function extent(S, k, log){ let lo=Infinity, hi=-Infinity; S.forEach(s=>{ const A=s[k]; for (let i=0;i<A.length;i++){ const v=A[i]; if (Number.isFinite(v) && (!log||v>0)){ if (v<lo) lo=v; if (v>hi) hi=v; } } }); if (!(hi>lo)){ hi=(Number.isFinite(lo)?lo:0)+1; if (!Number.isFinite(lo)) lo=0; } if (!log){ const pad=(hi-lo)*0.04; lo-=pad; hi+=pad; } return [lo,hi]; }
  function paint(spec, P, W, H){
    const S=spec.series.filter(s=>s.x.length), m={l:62, r:14, t:10, b:42}, X0=m.l, X1=W-m.r, Y0=H-m.b, Y1=m.t;
    const xr=spec.xr||extent(S,'x'), yr=spec.yr||extent(S,'y',spec.logy);
    const sx=v=>X0+(v-xr[0])/(xr[1]-xr[0]||1)*(X1-X0), sy=v=>spec.logy ? Y0+(Math.log10(v)-Math.log10(yr[0]))/(Math.log10(yr[1])-Math.log10(yr[0])||1)*(Y1-Y0) : Y0+(v-yr[0])/(yr[1]-yr[0]||1)*(Y1-Y0);
    P.rect(X0,Y1,X1-X0,Y0-Y1);
    ticks(xr[0],xr[1]).forEach(v=>{ const x=sx(v); P.line(x,Y0,x,Y0+4,'#888',1); P.text(x,Y0+16,g(v,3),'middle',10); });
    ticks(yr[0],yr[1],spec.logy).forEach(v=>{ const y=sy(v); P.line(X0-4,y,X0,y,'#888',1); P.text(X0-6,y+3,g(v,3),'end',10); });
    if (!spec.logy && yr[0]<0 && yr[1]>0) P.line(X0, sy(0), X1, sy(0), '#aaa', 0.6);
    P.text((X0+X1)/2, H-8, spec.xlabel||'', 'middle', 11); P.text(14, (Y0+Y1)/2, spec.ylabel||'', 'middle', 11, -90);
    for (const s of S){ const pts=[], step=Math.max(1, Math.floor(s.x.length/1200));
      for (let i=0;i<s.x.length;i+=step){ const v=s.x[i], yv=s.y[i]; if (!Number.isFinite(v)||!Number.isFinite(yv)||(spec.logy&&yv<=0)) continue; pts.push([sx(v), Math.min(Y0+2, Math.max(Y1-2, sy(yv)))]); }
      if (s.line!==false && pts.length>1) P.poly(pts, s.color, s.width||1.6, s.dash);
      if (s.mark) pts.forEach(([x,y])=>P.dot(x,y,s.color, s.mark==='open')); }
    let ly=Y1+12; const LG=S.filter(s=>s.label).slice(0,10); if (LG.length && P.box) P.box(X1-124, Y1+2, 120, LG.length*13+4); LG.forEach(s=>{ P.line(X1-120,ly-3,X1-104,ly-3,s.color,2); P.text(X1-100,ly,s.label,'start',10); ly+=13; });
  }
  function svg(spec, W, H){ W=W||560; H=H||300; const out=[];
    const P={rect:(x,y,w,hh)=>out.push(`<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="none" stroke="currentColor" stroke-opacity=".5"/>`), box:(x,y,w,hh)=>out.push(`<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="var(--panel,#fff)" fill-opacity=".85" stroke="none"/>`),
      line:(a,b,c,d,col,w)=>out.push(`<line x1="${a.toFixed(1)}" y1="${b.toFixed(1)}" x2="${c.toFixed(1)}" y2="${d.toFixed(1)}" stroke="${col}" stroke-width="${w}"/>`),
      text:(x,y,t,anc,sz,rot)=>out.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${sz}" text-anchor="${anc}" fill="currentColor"${rot?` transform="rotate(${rot} ${x} ${y})"`:''}>${h(t)}</text>`),
      poly:(pts,col,w,dash)=>out.push(`<polyline fill="none" stroke="${col}" stroke-width="${w}"${dash?' stroke-dasharray="5 4"':''} points="${pts.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ')}"/>`),
      dot:(x,y,col,open)=>out.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="${open?'none':col}" stroke="${col}" stroke-width="1.2"/>`)};
    paint(spec, P, W, H); return `<svg class="chemochart" viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" role="img" aria-label="${h((spec.title||spec.ylabel)+' / '+spec.xlabel)}">${out.join('')}</svg>`; }
  function canvas(spec, W, H){ const c=doc.createElement('canvas'), k=3; c.width=W*k; c.height=H*k; const x=c.getContext('2d'); x.scale(k,k); x.fillStyle='#fff'; x.fillRect(0,0,W,H);
    const P={rect:(a,b,w,hh)=>{ x.strokeStyle='#999'; x.lineWidth=1; x.strokeRect(a,b,w,hh); }, box:(a,b,w,hh)=>{ x.fillStyle='rgba(255,255,255,.85)'; x.fillRect(a,b,w,hh); }, line:(a,b,c2,d,col,w)=>{ x.strokeStyle=col==='currentColor'?'#333':col; x.lineWidth=w; x.beginPath(); x.moveTo(a,b); x.lineTo(c2,d); x.stroke(); },
      text:(a,b,t,anc,sz,rot)=>{ x.save(); x.fillStyle='#222'; x.font=sz+'px Helvetica, Arial'; x.textAlign=anc==='middle'?'center':anc==='end'?'right':'left'; x.translate(a,b); if (rot) x.rotate(rot*Math.PI/180); x.fillText(t,0,0); x.restore(); },
      poly:(pts,col,w,dash)=>{ x.strokeStyle=col; x.lineWidth=w; x.setLineDash(dash?[5,4]:[]); x.beginPath(); pts.forEach((p,i)=>i?x.lineTo(p[0],p[1]):x.moveTo(p[0],p[1])); x.stroke(); x.setLineDash([]); },
      dot:(a,b,col,open)=>{ x.beginPath(); x.arc(a,b,2.6,0,2*Math.PI); if (open){ x.strokeStyle=col; x.lineWidth=1.2; x.stroke(); } else { x.fillStyle=col; x.fill(); } }};
    paint(spec, P, W, H); return c; }

  /* ---------------- serie: uno spettro derivato con f.series ---------------- */
  const tLab=se=>`${qName(se.t.quantity)}${se.t.unit?' ('+se.t.unit+')':''}`;
  const xLab=f=>{ const I=(typeof INSTR!=='undefined'&&INSTR[f.instr])||{}; return I.xPdf||I.x||'x'; };
  function meanOf(se){ const [m,n]=se.shape, y=new Float64Array(n); for (let i=0;i<m;i++) for (let j=0;j<n;j++) y[j]+=se.data[i*n+j]/m; return y; }
  function makeSeriesFile(se, o){ const xs=Float64Array.from(se.x.values), ys=meanOf(se), instr=o.instr||'gen';
    const f={id:(typeof uid!=='undefined'? ++uid : Date.now()), name:o.name, path:o.path, size:se.data.length*8, xs, xs0:xs, ys, meta:[], peY:null, xrf:null, tube:'', uncal:false, ecal:null,
      instr, autoInstr:instr, reason:T('serie di spettri','spectrum series'), include:true, removed:[], added:[], labels:{}, title:'', desc:'', xr:null};
    f._p={peY:null, ys, meta:[]}; f.raw=null; f.rawBin=false; f.n0=xs.length; f.nCols=2; f.ycolNow=1; f.xSeconds=false; f.importIssue=null; f.series=se; f.hash='series:'+o.path;
    try{ if (typeof postDetect==='function') postDetect(f, {meta:[]}); }catch(e){}
    if (o.memory){ const mm=o.memory; if (typeof mm.title==='string') f.title=mm.title.slice(0,300); if (typeof mm.desc==='string') f.desc=mm.desc.slice(0,5000); if (mm.include===false) f.include=false;
      if (typeof cleanAn==='function') f.an=cleanAn(mm.an); }
    try{ f.kind=typeof kindOf==='function'?kindOf(f):'A'; }catch(e){ f.kind='A'; }
    return f; }
  function seriesRecord(se, extra){ return {kind:se.kind, t:{values:Array.from(se.t.values), quantity:se.t.quantity, unit:se.t.unit||''}, x:{values:Float64Array.from(se.x.values), quantity:se.x.quantity||'x', unit:se.x.unit||''}, y:se.y||{}, shape:se.shape.slice(), dtype:'f64', data:se.data instanceof Float64Array?se.data:Float64Array.from(se.data), meta:Object.assign({version:M.VERSION}, se.meta||{}, extra||{})}; }
  // apertura di un progetto: la serie salvata torna come spettro derivato con la sua memoria
  function restore(rec){ if (!rec || !rec.series || !M.validSeries(rec.series)) return false; const meta=rec.series.meta||{};
    const f=makeSeriesFile(rec.series, {name:rec.name||'serie', path:rec.path||('serie/'+Date.now()), instr:typeof meta.instr==='string'&&typeof INSTR!=='undefined'&&INSTR[meta.instr]?meta.instr:'gen', memory:rec.memory||null});
    allFiles().push(f); return true; }
  function hookProject(){ const P=win.AcchProject; if (!P) return; const prev=P.restoreDerived; P.restoreDerived=rec=>restore(rec) || (typeof prev==='function' ? prev(rec) : false); }

  function candidates(){ const L=allFiles().filter(f=>!f.series && f.xs && f.xs.length>=5), by={}; L.forEach(f=>{ (by[f.instr]=by[f.instr]||[]).push(f); }); return by; }
  function membersNow(){ const by=candidates(); let ins=RT.sInstr; if (!by[ins]) ins=Object.keys(by).sort((a,b)=>by[b].length-by[a].length)[0]||null; RT.sInstr=ins; if (!ins) return [];
    const inc=typeof included==='function'?new Set(included()):null; return by[ins].filter(f=>RT.sWhich==='all' || !inc || inc.has(f)); }
  function proposal(list){ const sig=list.map(keyOf).join('\u0000'); if (RT.axis && RT.axis.sig===sig) return RT.axis;
    const P=M.proposeAxis(list.map(f=>({name:f.name, meta:f.meta||[]}))); RT.axis={sig, quantity:P.quantity||'tempo', unit:P.unit||'', source:P.source, weak:!!P.weak, values:new Map(list.map((f,i)=>[keyOf(f), P.values[i]]))}; return RT.axis; }

  function renderSerie(box){ const by=candidates(), instrs=Object.keys(by), L=membersNow(), A=proposal(L), nm=k=>(typeof T_==='function'&&T_().nome&&T_().nome[k])||k;
    if (!instrs.length){ box.innerHTML=`<p class="why">${WEB('Carica almeno 3 spettri della stessa tecnica (per esempio una cinetica UV-Vis nel tempo): qui li metto in fila in una matrice tempo × λ.','Load at least 3 spectra of the same technique (for example a UV-Vis kinetics over time): here they are stacked into a time × λ matrix.','Carica almeno 3 spettri della stessa tecnica per comporre una serie (matrice tempo × asse spettrale).','Load at least 3 spectra of the same technique to build a series (time × spectral axis matrix).')}</p>`+seriesList(); bindList(box); return; }
    const src={meta:T('dai metadati (data e ora di acquisizione o campo esplicito)','from the metadata (acquisition date and time or explicit field)'), name:T('dal nome dei file','from the file names'), manual:T('da scrivere','to be entered')}[A.source];
    const rows=L.map((f,i)=>{ const v=A.values.get(keyOf(f)); return `<tr><td data-noi18n>${h(typeof dispTitle==='function'?dispTitle(f):f.name)}</td><td><input type="text" inputmode="decimal" data-tv="${i}" value="${v==null?'':String(+v.toPrecision(10)).replace('.',dec())}" style="width:110px" aria-label="${h(qName(A.quantity))}"></td></tr>`; }).join('');
    box.innerHTML=`<p class="why">${WEB('Metti in fila gli spettri misurati nel tempo, con la dose o con la temperatura: diventano una matrice per MCR-ALS e per la cinetica globale. L\'asse lo propongo dai metadati o dal nome dei file; controllalo sempre, le unità sbagliate sono l\'errore più comune.','Stack spectra measured over time, dose or temperature: they become a matrix for MCR-ALS and global kinetics. The axis is proposed from the metadata or the file names; always check it, wrong units are the most common error.','Gli spettri selezionati diventano una matrice (righe: tempo, dose o temperatura; colonne: asse spettrale) per MCR-ALS e cinetica globale. L\'asse proposto dai metadati o dal nome dei file va confermato.','The selected spectra become a matrix (rows: time, dose or temperature; columns: spectral axis) for MCR-ALS and global kinetics. The axis proposed from the metadata or file names must be confirmed.')}</p>
      <div class="ibfields">
        <label class="ibf"><span>${T('Tecnica','Technique')}</span><select id="chSInstr">${instrs.map(k=>`<option value="${k}" ${k===RT.sInstr?'selected':''}>${h(nm(k))} (${by[k].length})</option>`).join('')}</select></label>
        <label class="ibf"><span>${T('Quali spettri','Which spectra')}</span><select id="chSWhich"><option value="inc" ${RT.sWhich!=='all'?'selected':''}>${T('solo quelli spuntati','checked only')}</option><option value="all" ${RT.sWhich==='all'?'selected':''}>${T('tutti quelli caricati','all loaded')}</option></select></label>
        <label class="ibf"><span>${T('Grandezza','Quantity')}</span><select id="chSQ">${['tempo','dose','temperatura','altro'].map(q=>`<option value="${q}" ${A.quantity===q?'selected':''}>${h(qName(q))}</option>`).join('')}</select></label>
        <label class="ibf"><span>${T('Unità','Unit')}</span><input type="text" id="chSU" value="${h(A.unit||'')}" style="width:80px" data-noi18n></label>
      </div>
      <p class="opt-l">${T('Asse','Axis')}: ${h(src)}${A.weak?' · '+T('solo un numero nel nome: verifica che sia davvero il tempo','only a number in the name: check that it really is the time'):''}</p>
      <div class="tblwrap"><table class="tbl"><thead><tr><th>${T('Spettro','Spectrum')}</th><th>${h(qName(A.quantity))}</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="row" style="margin-top:8px"><button class="btn small primary" id="chSMake">${WEB('▶ Crea la serie','▶ Build the series','Crea la serie','Build series')}</button></div>
      <div class="signote" id="chSMsg" ${RT.msg?'':'hidden'}>${RT.msg?h(RT.msg):''}</div>${seriesList()}`;
    $('#chSInstr').onchange=e=>{ RT.sInstr=e.target.value; RT.axis=null; render(); };
    $('#chSWhich').onchange=e=>{ RT.sWhich=e.target.value; RT.axis=null; render(); };
    $('#chSQ').onchange=e=>{ A.quantity=e.target.value; render(); }; $('#chSU').onchange=e=>{ A.unit=e.target.value.trim().slice(0,20); };
    box.querySelectorAll('[data-tv]').forEach(el=>el.onchange=()=>{ A.values.set(keyOf(L[+el.dataset.tv]), num(el.value)); });
    $('#chSMake').onclick=()=>make(L, A); bindList(box); }
  function seriesList(){ const S=seriesFiles(); if (!S.length) return ''; return `<h4 class="anh">${T('Serie nel progetto','Series in the project')}</h4><ul class="chemolist">${S.map(f=>{ const se=f.series; return `<li><label><input type="radio" name="chSel" value="${h(keyOf(f))}" ${sel()===f?'checked':''}> <span data-noi18n>${h(typeof dispTitle==='function'?dispTitle(f):f.name)}</span> · ${se.shape[0]} × ${se.shape[1]} · ${h(tLab(se))} ${g(se.t.values[0],4)}–${g(se.t.values[se.t.values.length-1],4)}</label></li>`; }).join('')}</ul>`; }
  function bindList(box){ box.querySelectorAll('input[name="chSel"]').forEach(el=>el.onchange=()=>{ RT.sel=el.value; render(); }); }
  function make(L, A){ const t=L.map(f=>A.values.get(keyOf(f)));
    try{ if (L.length<3) throw new Error(T('servono almeno 3 spettri','at least 3 spectra are needed'));
      const P=L.map(f=>{ const q=typeof processed==='function'?processed(f):f; return {xs:q.xs, ys:q.ys}; });
      const se=M.buildSeries(P, t, {quantity:A.quantity, tunit:A.unit, kind:A.quantity==='tempo'?'kinetics':'generic', xunit:''});
      const ins=RT.sInstr, nm=`${T('Serie','Series')} ${(typeof T_==='function'&&T_().nome&&T_().nome[ins])||ins} (${se.shape[0]} × ${se.shape[1]})`;
      const path='serie/'+new Date().toISOString().replace(/[:.]/g,'-')+'.series';
      const rec=seriesRecord(se, {instr:ins, members:se.order.map(i=>L[i].path||L[i].name).slice(0,5000), axisSource:A.source, resampled:se.resampled});
      const f=makeSeriesFile(rec, {name:nm, path, instr:ins}); allFiles().push(f); if (typeof persist==='function') persist(f);
      RT.sel=keyOf(f); RT.msg=T(`Serie creata: ${se.shape[0]} spettri × ${se.shape[1]} punti`,`Series built: ${se.shape[0]} spectra × ${se.shape[1]} points`)+(se.resampled?T(' (riportati sull\'asse del primo spettro per interpolazione lineare)',' (resampled onto the first spectrum\'s axis by linear interpolation)'):'')+'.';
      RT.tab='mcr'; if (typeof refreshAll==='function') refreshAll(); else render();
    }catch(e){ RT.msg=SIG('warn')+' '+T('Serie non creata: ','Series not built: ')+e.message; render(); } }
  function sel(){ const S=seriesFiles(); return S.find(f=>keyOf(f)===RT.sel) || (typeof cur!=='undefined' && allFiles()[cur] && allFiles()[cur].series ? allFiles()[cur] : null) || S[S.length-1] || null; }

  /* ---------------- impostazioni (f.an.mcr, f.an.kin) e risultati in memoria (f._chemo) ---------------- */
  const opt=(f,k)=>Object.assign({}, f.an&&f.an[k]||{});
  function setOpt(f, k, o){ const c=(k==='mcr'?M:K).cleanOpt(o); f.an=f.an||{}; if (c) f.an[k]=c; else delete f.an[k]; if (!Object.keys(f.an).length) f.an=null; try{ if (typeof persist==='function') persist(f); }catch(e){} }
  const rt=f=>(f._chemo=f._chemo||{});
  function knownFor(f, o){ const out={}; if (!o.known) return out; const xv=f.series.x.values; for (const [k,p] of Object.entries(o.known)){ const r=allFiles().find(q=>keyOf(q)===p && !q.series); if (!r) continue; const P=typeof processed==='function'?processed(r):r; try{ out[k]=interp(P.xs,P.ys,xv); }catch(e){} } return out; }
  function interp(xs, ys, X){ const up=xs[0]<=xs[xs.length-1], N=xs.length, out=new Float64Array(X.length); for (let j=0;j<X.length;j++){ const x=X[j]; let lo=0, hi=N-1; while (hi-lo>1){ const mid=(lo+hi)>>1; if ((xs[mid]<=x)===up) lo=mid; else hi=mid; } const w=xs[hi]===xs[lo]?0:(x-xs[lo])/(xs[hi]-xs[lo]); out[j]=ys[lo]+(ys[hi]-ys[lo])*Math.min(1,Math.max(0,w)); } return out; }
  const mcrKey=(f,o)=>JSON.stringify([keyOf(f), o]);
  function mcrOpts(f){ const o=opt(f,'mcr'), se=f.series, lim=Math.min(8, se.shape[0], se.shape[1]); const sv=svdOf(f);
    if (!o.nc) o.nc=Math.min(lim, Math.max(1, sv?M.suggestRank(sv.s, se.shape[0], se.shape[1]).k:2)); return o; }
  function svdOf(f){ const r=rt(f); return r.svd||null; }

  /* ---------------- MCR-ALS ---------------- */
  function renderMcr(box, f){ const se=f.series, [m,n]=se.shape, r=rt(f);
    if (!r.svd){ box.innerHTML=`<p class="why">${T('Calcolo dei valori singolari…','Computing singular values…')}</p>`; if (!RT.busy){ RT.busy='svd'; runSliced(M.svdGen(M.seriesMatrix(se), Math.min(m,n,30))).then(s=>{ r.svd=s; RT.busy=null; render(); }).catch(e=>{ RT.busy=null; box.innerHTML=`<p>${SIG('stop')} ${h(e.message)}</p>`; }); } return; }
    const o=mcrOpts(f), sv=r.svd, sug=M.suggestRank(sv.s, m, n).k, lim=Math.min(8,m,n), res=r.mcr&&r.mcr.key===mcrKey(f,o)?r.mcr.res:null;
    const sst=M.sumSq(se.data), cand=allFiles().filter(q=>!q.series && q.instr===f.instr && q.xs);
    const svSpec={title:T('Valori singolari','Singular values'), series:[{x:Array.from({length:Math.min(15,sv.s.length)},(_,i)=>i+1), y:Array.from(sv.s.slice(0,15)), color:COL[0], mark:'fill', line:true, width:1}], xlabel:T('componente','component'), ylabel:T('valore singolare','singular value'), logy:true};
    const uni=new Set(o.unimodal||[]), kn=o.known||{};
    box.innerHTML=`<p class="why">${WEB('MCR-ALS ricava dai dati spettri puri e profili di concentrazione senza riferimenti, alternando due minimi quadrati con i vincoli che scegli tu. Il numero di componenti lo decidi guardando i valori singolari: quelli sopra il «gomito» sono segnale.','MCR-ALS extracts pure spectra and concentration profiles from the data without references, alternating two least-squares steps with the constraints you choose. Choose the number of components from the singular values: those above the «elbow» are signal.','Risoluzione multivariata delle curve con minimi quadrati alternati (Tauler 1995): D = C Sᵀ + E. Il numero di componenti si sceglie dai valori singolari; i vincoli sono quelli selezionati, nessuno si applica in automatico.','Multivariate curve resolution by alternating least squares (Tauler 1995): D = C Sᵀ + E. The number of components is chosen from the singular values; only the selected constraints are applied, none automatically.')}</p>
      <div class="chemogrid"><div>${svg(svSpec,420,220)}<p class="opt-l">${T('Indicazione (funzione IND di Malinowski)','Suggestion (Malinowski IND function)')}: ${sug}. ${T('PCA','PCA')}: ${[1,2,3,4,5].filter(k=>k<=Math.min(m,n)).map(k=>`${k} → ${g(M.lofPca(sv.s.length>=Math.min(m,n)?sv.s:sv.s, k, sst),3)}%`).join(' · ')} ${T('di mancanza di adattamento','lack of fit')}</p></div>
      <div class="ibfields" style="align-content:flex-start">
        <label class="ibf"><span>${T('Componenti','Components')}</span><select data-mo="nc">${Array.from({length:lim},(_,i)=>i+1).map(k=>`<option value="${k}" ${k===o.nc?'selected':''}>${k}</option>`).join('')}</select></label>
        <label class="ibf"><span>${T('Partenza','Initial estimate')}</span><select data-mo="init"><option value="simplisma|S" ${(o.init||'simplisma')==='simplisma'&&o.initOn!=='C'?'selected':''}>SIMPLISMA, ${T('spettri puri','pure spectra')}</option><option value="simplisma|C" ${(o.init||'simplisma')==='simplisma'&&o.initOn==='C'?'selected':''}>SIMPLISMA, ${T('variabili pure','pure variables')}</option><option value="efa|C" ${o.init==='efa'?'selected':''}>EFA (${T('dati ordinati','ordered data')})</option></select></label>
        <label class="check"><input type="checkbox" data-mb="nonnegC" ${o.nonnegC!==false?'checked':''}> ${T('concentrazioni ≥ 0','concentrations ≥ 0')}</label>
        <label class="check"><input type="checkbox" data-mb="nonnegS" ${o.nonnegS!==false?'checked':''}> ${T('spettri ≥ 0','spectra ≥ 0')}</label>
        <label class="ibf"><span>${T('Chiusura (somma delle concentrazioni)','Closure (sum of concentrations)')}</span><input type="text" inputmode="decimal" data-mo="closure" value="${o.closure!=null?String(o.closure).replace('.',dec()):''}" placeholder="${T('nessuna','none')}" style="width:90px"></label>
        <label class="ibf"><span>${T('Normalizzazione degli spettri','Spectra normalisation')}</span><select data-mo="norm"><option value="norm" ${(o.norm||'norm')==='norm'?'selected':''}>${T('norma 1','unit norm')}</option><option value="max" ${o.norm==='max'?'selected':''}>${T('massimo 1','maximum 1')}</option><option value="none" ${o.norm==='none'?'selected':''}>${T('nessuna','none')}</option></select></label>
        <div class="ibf"><span>${T('Unimodalità (profili con un solo massimo)','Unimodality (single-maximum profiles)')}</span><span>${Array.from({length:o.nc},(_,k)=>`<label class="check" style="display:inline-flex;margin-right:8px"><input type="checkbox" data-mu="${k}" ${uni.has(k)?'checked':''}> ${k+1}</label>`).join('')}</span></div>
        ${cand.length?`<div class="ibf"><span>${T('Spettri noti (uguaglianza)','Known spectra (equality)')}</span>${Array.from({length:o.nc},(_,k)=>`<label class="ibf" style="margin:0"><span>${k+1}</span><select data-mk="${k}"><option value="">—</option>${cand.map(q=>`<option value="${h(keyOf(q))}" ${kn[k]===keyOf(q)?'selected':''}>${h(typeof dispTitle==='function'?dispTitle(q):q.name)}</option>`).join('')}</select></label>`).join('')}</div>`:''}
        <label class="ibf"><span>${T('Iterazioni al massimo','Maximum iterations')}</span><input type="number" min="1" max="5000" data-mo="maxIter" value="${o.maxIter||200}" style="width:80px"></label>
        <button class="btn small primary" id="chMRun" ${RT.busy?'disabled':''}>${WEB('▶ Risolvi','▶ Resolve','Esegui MCR-ALS','Run MCR-ALS')}</button>
      </div></div>
      <div id="chMProg" class="opt-l"></div><div id="chMOut">${res?mcrResultHtml(f,res,r.bands&&r.bands.key===mcrKey(f,o)?r.bands.res:null):''}</div>`;
    const upd=fn=>{ const q=opt(f,'mcr'); fn(q); setOpt(f,'mcr',q); render(); };
    box.querySelectorAll('[data-mo]').forEach(el=>el.onchange=()=>upd(q=>{ const k=el.dataset.mo, v=el.value;
      if (k==='init'){ const [a,b]=v.split('|'); q.init=a; q.initOn=b; } else if (k==='nc'||k==='maxIter') q[k]=parseInt(v,10); else if (k==='closure'){ const x=num(v); if (x>0) q.closure=x; else delete q.closure; } else q[k]=v; if (k==='nc'){ if (q.unimodal) q.unimodal=q.unimodal.filter(u=>u<q.nc); } }));
    box.querySelectorAll('[data-mb]').forEach(el=>el.onchange=()=>upd(q=>{ q[el.dataset.mb]=el.checked; }));
    box.querySelectorAll('[data-mu]').forEach(el=>el.onchange=()=>upd(q=>{ const s=new Set(q.unimodal||[]); if (el.checked) s.add(+el.dataset.mu); else s.delete(+el.dataset.mu); q.unimodal=[...s].sort(); }));
    box.querySelectorAll('[data-mk]').forEach(el=>el.onchange=()=>upd(q=>{ q.known=Object.assign({}, q.known||{}); if (el.value) q.known[el.dataset.mk]=el.value; else delete q.known[el.dataset.mk]; }));
    $('#chMRun').onclick=()=>runMcr(f);
    const bb=$('#chMBands'); if (bb) bb.onclick=()=>runBands(f);
    const cs=$('#chMCsv'); if (cs) cs.onclick=()=>dl(f,'mcr'); }
  function mcrInput(f){ const o=mcrOpts(f), kn=knownFor(f,o), known={}; for (const [k,v] of Object.entries(kn)) if (v) known[k]=v; return Object.assign({}, o, {known, svd:null}); }
  function mcrCompute(f){ return M.alsGen(M.seriesMatrix(f.series), mcrInput(f)); }
  async function runMcr(f){ const o=mcrOpts(f), r=rt(f), pr=$('#chMProg'); RT.busy='mcr'; const btn=$('#chMRun'); if (btn) btn.disabled=true;
    try{ const res=await runSliced(mcrCompute(f), p=>{ if (pr) pr.textContent=p.phase==='als'?T(`Iterazione ${p.iter}: mancanza di adattamento ${g(p.lof,4)}%`,`Iteration ${p.iter}: lack of fit ${g(p.lof,4)}%`):T('Partenza…','Initial estimate…'); });
      r.mcr={key:mcrKey(f,o), res}; r.bands=null; }
    catch(e){ console.error(e); if (pr) pr.textContent=SIG('stop')+' '+T('Calcolo non riuscito: ','Computation failed: ')+e.message; RT.busy=null; return; }
    RT.busy=null; render(); }
  async function runBands(f){ const r=rt(f), o=mcrOpts(f); if (!r.mcr) return; const pr=$('#chMProg'); RT.busy='bands'; const b=$('#chMBands'); if (b) b.disabled=true;
    try{ const res=await runSliced(M.bandsGen(r.mcr.res), p=>{ if (pr) pr.textContent=T('MCR-BANDS: ','MCR-BANDS: ')+Math.round(100*(p&&p.frac||0))+'%'; }); r.bands={key:mcrKey(f,o), res}; }
    catch(e){ console.error(e); if (pr) pr.textContent=SIG('stop')+' '+e.message; }
    RT.busy=null; render(); }
  function warnList(W){ return W.length?`<ul class="chemowarn">${W.map(w=>`<li>${SIG('warn')} ${h(en()?w.en:w.it)}</li>`).join('')}</ul>`:''; }
  function mcrSpecs(f, res){ const se=f.series, t=Array.from(se.t.values), x=Array.from(se.x.values), k=res.C.n;
    return [{title:T('Concentrazioni','Concentrations'), series:Array.from({length:k},(_,c)=>({x:t, y:Array.from(M.col(res.C,c)), color:COL[c%COL.length], mark:t.length<=60?'fill':null, label:T('componente ','component ')+(c+1)})), xlabel:tLab(se), ylabel:T('concentrazione (relativa)','concentration (relative)')},
      {title:T('Spettri puri','Pure spectra'), series:Array.from({length:k},(_,c)=>({x, y:Array.from(M.row(res.S,c)), color:COL[c%COL.length], label:T('componente ','component ')+(c+1)+(res.known.includes(c)?T(' (noto)',' (known)'):'')})), xlabel:xLab(f), ylabel:T('intensità','intensity')},
      {title:T('Residui per spettro','Residuals per spectrum'), series:[{x:t, y:Array.from(res.rmsRow), color:COL[4], mark:'open'}], xlabel:tLab(se), ylabel:T('scarto quadratico medio','root mean square')},
      {title:T('Residui per canale','Residuals per channel'), series:[{x, y:Array.from(res.rmsCol), color:COL[4]}], xlabel:xLab(f), ylabel:T('scarto quadratico medio','root mean square')}]; }
  function mcrMetrics(res){ return [[T('Mancanza di adattamento','Lack of fit'), g(res.lof,4)+' %'], [T('Mancanza di adattamento minima (PCA, stesse componenti)','Minimum lack of fit (PCA, same components)'), g(res.lofPca,4)+' %'],
      [T('Varianza spiegata','Explained variance'), g(res.expVar,6)+' %'], [T('Scarto quadratico medio dei residui','Residual root mean square'), g(res.sigma,4)], [T('Iterazioni','Iterations'), String(res.iter)], [T('Convergenza','Convergence'), res.converged?T('sì','yes'):T('no','no')]]; }
  function mcrResultHtml(f, res, B){ const S=mcrSpecs(f,res);
    const bt=B?`<h4 class="anh">MCR-BANDS</h4><div class="tblwrap"><table class="tbl"><thead><tr><th>${T('Componente','Component')}</th><th>f min</th><th>f ALS</th><th>f max</th></tr></thead><tbody>${B.f.map((b,i)=>`<tr><td>${i+1}</td><td>${g(b.fmin,4)}</td><td>${g(b.fopt,4)}</td><td>${g(b.fmax,4)}</td></tr>`).join('')}</tbody></table></div><p class="opt-l">${h(bandsNote(B))}</p>`:'';
    return `<div class="tblwrap"><table class="tbl"><tbody>${mcrMetrics(res).map(r=>`<tr><td>${h(r[0])}</td><td>${h(r[1])}</td></tr>`).join('')}</tbody></table></div>${warnList(res.warnings)}
      <div class="chemogrid">${S.map(s=>`<figure>${svg(s,460,250)}<figcaption>${h(s.title)}</figcaption></figure>`).join('')}</div>${bt}
      <div class="row"><button class="btn small ghost" id="chMBands" ${RT.busy?'disabled':''}>${T('Intervalli MCR-BANDS','MCR-BANDS ranges')}</button><button class="btn small ghost" id="chMCsv">${desk()?'CSV':'⬇️ CSV'}</button></div>`; }
  const bandsNote=B=>B.width<0.01 ? T(`Banda massima ${g(B.width,2)}: con questi vincoli la soluzione è praticamente unica.`,`Maximum band ${g(B.width,2)}: with these constraints the solution is practically unique.`)
    : T(`Banda massima ${g(B.width,2)}: la soluzione NON è unica; ogni profilo fra f min e f max descrive i dati allo stesso modo. Ottimizzazione locale: la banda vera può essere più larga.`,`Maximum band ${g(B.width,2)}: the solution is NOT unique; any profile between f min and f max describes the data equally well. Local optimisation: the true band may be wider.`);

  /* ---------------- cinetica globale ---------------- */
  const MODEL_NAMES=()=>({ord0:T('ordine 0 (A → P)','zero order (A → P)'), ord1:T('primo ordine (A → B)','first order (A → B)'), ord2:T('secondo ordine (2A → P, A + B → P)','second order (2A → P, A + B → P)'), consec:T('consecutive (A → B → C)','consecutive (A → B → C)'), rev:T('equilibrio (A ⇌ B)','equilibrium (A ⇌ B)'), par:T('paralleli (somma di esponenziali, DAS)','parallel (sum of exponentials, DAS)')});
  const kinKey=(f,o)=>JSON.stringify([keyOf(f), o]);
  function renderKin(box, f){ const se=f.series, o=Object.assign({model:'ord1'}, opt(f,'kin')), r=rt(f), res=r.kin&&r.kin.key===kinKey(f,o)?r.kin.res:null, MN=MODEL_NAMES();
    const tq=se.t.quantity!=='tempo'?`<p>${SIG('warn')} ${T('L\'asse della serie non è un tempo: la cinetica ha senso solo nel tempo.','The series axis is not a time: kinetics only makes sense over time.')}</p>`:'';
    box.innerHTML=`<p class="why">${WEB('Scegli il modello: stimo le costanti di velocità usando tutte le lunghezze d\'onda insieme, con gli spettri delle specie, le incertezze e i residui. Con «Confronta i modelli» vedi quale descrive meglio i dati.','Choose the model: the rate constants are estimated using all wavelengths together, with the species spectra, uncertainties and residuals. «Compare models» shows which describes the data best.','Fit globale con proiezione variabile (Golub e Pereyra 1973): per ogni insieme di costanti gli spettri associati alle specie si ricavano per minimi quadrati; le costanti si stimano in log k con Levenberg–Marquardt. Unità delle costanti: 1/unità dell\'asse.','Global fit by variable projection (Golub and Pereyra 1973): for each set of constants the species-associated spectra are obtained by least squares; the constants are estimated in log k by Levenberg–Marquardt. Units of the constants: 1/axis unit.')}</p>${tq}
      <div class="ibfields">
        <label class="ibf"><span>${T('Modello','Model')}</span><select data-ko="model">${Object.keys(K.MODELS).map(k=>`<option value="${k}" ${o.model===k?'selected':''}>${h(MN[k])}</option>`).join('')}</select></label>
        ${o.model==='par'?`<label class="ibf"><span>${T('Esponenziali','Exponentials')}</span><select data-ko="nExp">${[1,2,3,4,5].map(k=>`<option ${(o.nExp||1)===k?'selected':''}>${k}</option>`).join('')}</select></label><label class="check"><input type="checkbox" data-kb="offset" ${o.offset?'checked':''}> ${T('fondo costante','constant offset')}</label>`:''}
        ${o.model==='rev'?`<label class="ibf"><span>${T('K = k_f/k_b (facoltativa)','K = k_f/k_b (optional)')}</span><input type="text" inputmode="decimal" data-ko="K" value="${o.K!=null?String(o.K).replace('.',dec()):''}" style="width:90px"></label>`:''}
        ${o.model==='ord2'||o.model==='ord0'?`<label class="ibf"><span>[A]₀ (${T('facoltativa','optional')})</span><input type="text" inputmode="decimal" data-ko="A0" value="${o.A0!=null?String(o.A0).replace('.',dec()):''}" style="width:90px"></label>`:''}
        <label class="ibf"><span>${T('k di partenza (facoltative, separate da ;)','Starting k (optional, separated by ;)')}</span><input type="text" data-ko="k0" value="${o.k0?o.k0.map(v=>String(v).replace('.',dec())).join('; '):''}" style="width:130px" placeholder="${T('automatiche','automatic')}"></label>
        <label class="check"><input type="checkbox" data-kb="t0fit" ${o.t0fit?'checked':''}> ${T('stima anche t₀','also estimate t₀')}</label>
        <label class="check"><input type="checkbox" data-kb="nonnegS" ${o.nonnegS?'checked':''}> ${T('spettri ≥ 0 (NNLS)','spectra ≥ 0 (NNLS)')}</label>
        <button class="btn small primary" id="chKRun" ${RT.busy?'disabled':''}>${WEB('▶ Stima le costanti','▶ Estimate the constants','Esegui il fit','Run fit')}</button>
        <button class="btn small ghost" id="chKCmp" ${RT.busy?'disabled':''}>${T('Confronta i modelli','Compare models')}</button>
      </div><p class="opt-l">${h(K.MODELS[o.model].note[en()?1:0])}</p>
      <div id="chKProg" class="opt-l"></div><div id="chKOut">${res?kinResultHtml(f,res):''}${r.cmp&&r.cmp.key===keyOf(f)?cmpHtml(r.cmp.res):''}</div>`;
    const upd=fn=>{ const q=opt(f,'kin'); if (!q.model) q.model='ord1'; fn(q); setOpt(f,'kin',q); render(); };
    box.querySelectorAll('[data-ko]').forEach(el=>el.onchange=()=>upd(q=>{ const k=el.dataset.ko, v=el.value;
      if (k==='model') q.model=v; else if (k==='nExp') q.nExp=parseInt(v,10); else if (k==='k0'){ const L=v.split(/[;\s]+/).map(num).filter(x=>x>0); if (L.length) q.k0=L; else delete q.k0; } else { const x=num(v); if (x>0) q[k]=x; else delete q[k]; } }));
    box.querySelectorAll('[data-kb]').forEach(el=>el.onchange=()=>upd(q=>{ q[el.dataset.kb]=el.checked; }));
    $('#chKRun').onclick=()=>runKin(f); $('#chKCmp').onclick=()=>runCmp(f);
    const cs=$('#chKCsv'); if (cs) cs.onclick=()=>dl(f,'kin'); }
  async function runKin(f){ const o=Object.assign({model:'ord1'}, opt(f,'kin')), r=rt(f), pr=$('#chKProg'); RT.busy='kin'; ['#chKRun','#chKCmp'].forEach(s=>{ const b=$(s); if (b) b.disabled=true; });
    try{ const res=await runSliced(K.fitGen(f.series, o), p=>{ if (pr) pr.textContent=p.phase==='lm'?T(`Iterazione ${p.iter}`,`Iteration ${p.iter}`):T('Ricerca della partenza…','Searching the starting point…'); }); r.kin={key:kinKey(f,o), res}; }
    catch(e){ console.error(e); if (pr) pr.textContent=SIG('stop')+' '+T('Fit non riuscito: ','Fit failed: ')+e.message; RT.busy=null; return; }
    RT.busy=null; render(); }
  const CMP_SET=[['ord0',{model:'ord0'}],['ord1',{model:'ord1'}],['ord2',{model:'ord2'}],['consec',{model:'consec'}],['par2',{model:'par', nExp:2}],['par2c',{model:'par', nExp:2, offset:true}],['par3c',{model:'par', nExp:3, offset:true}]];
  function cmpLabel(id){ const MN=MODEL_NAMES(); return {par2:T('2 esponenziali','2 exponentials'), par2c:T('2 esponenziali + costante','2 exponentials + constant'), par3c:T('3 esponenziali + costante','3 exponentials + constant')}[id]||MN[id]||id; }
  function* cmpGen(se){ const out=[]; for (const [id,o] of CMP_SET){ try{ const r=yield* K.fitGen(se,o); r.label=id; out.push(r); }catch(e){ /* modello non applicabile a questi dati */ } yield {phase:'cmp', frac:out.length/CMP_SET.length}; } return K.compare(out); }
  async function runCmp(f){ const r=rt(f), pr=$('#chKProg'); RT.busy='cmp'; ['#chKRun','#chKCmp'].forEach(s=>{ const b=$(s); if (b) b.disabled=true; });
    try{ const res=await runSliced(cmpGen(f.series), p=>{ if (pr && p.phase==='cmp') pr.textContent=T('Confronto: ','Comparison: ')+Math.round(100*p.frac)+'%'; }); r.cmp={key:keyOf(f), res}; }
    catch(e){ console.error(e); if (pr) pr.textContent=SIG('stop')+' '+e.message; }
    RT.busy=null; render(); }
  function kinSpecs(f, res){ const se=f.series, t=res.t, x=Array.from(se.x.values), ns=res.species.length, das=!!res.info.das;
    return [{title:T('Concentrazioni del modello','Model concentrations'), series:Array.from({length:ns},(_,c)=>({x:t, y:Array.from(M.col(res.C,c)), color:COL[c%COL.length], label:res.species[c]})), xlabel:tLab(se), ylabel:das?T('ampiezza (relativa)','amplitude (relative)'):T('concentrazione relativa','relative concentration')},
      {title:das?T('Spettri associati ai decadimenti (DAS)','Decay-associated spectra (DAS)'):T('Spettri associati alle specie (SAS)','Species-associated spectra (SAS)'), series:Array.from({length:ns},(_,c)=>({x, y:Array.from(M.row(res.S,c)), color:COL[c%COL.length], label:res.species[c]})), xlabel:xLab(f), ylabel:T('intensità','intensity')},
      {title:T('Residui per spettro','Residuals per spectrum'), series:[{x:t, y:Array.from(res.rmsRow), color:COL[4], mark:'open'}], xlabel:tLab(se), ylabel:T('scarto quadratico medio','root mean square')},
      {title:T('Residui per canale','Residuals per channel'), series:[{x, y:Array.from(res.rmsCol), color:COL[4]}], xlabel:xLab(f), ylabel:T('scarto quadratico medio','root mean square')}]; }
  function kinRows(f, res){ const u=f.series.t.unit||T('unità dell\'asse','axis unit'); return res.params.map(p=>[p.name, g(p.value,6), g(p.se,3), `${g(p.lo95,4)} – ${g(p.hi95,4)}`, p.name==='t0'?u:'1/'+u, p.tau!=null&&p.name!=='t0'?g(p.tau,4)+' '+u:'']).concat(res.derived.map(d=>[d.name, g(d.value,6), g(d.se,3), '', d.unit||'1/'+u, ''])); }
  function kinResultHtml(f, res){ const S=kinSpecs(f,res), P=res.params.map(p=>p.name), rows=kinRows(f,res);
    const corr=res.corr&&res.corr.length>1?`<h4 class="anh">${T('Correlazioni dei parametri','Parameter correlations')}</h4><div class="tblwrap"><table class="tbl"><thead><tr><th></th>${P.map(p=>`<th>${h(p)}</th>`).join('')}</tr></thead><tbody>${res.corr.map((r,i)=>`<tr><th>${h(P[i])}</th>${r.map(v=>`<td>${g(v,3)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:'';
    const sw=res.swap?`<p class="opt-l">${T('Soluzione alternativa con k scambiate','Alternative solution with swapped k')}: ${res.swap.k.map(v=>g(v,5)).join(', ')} (${T('parte negativa dei SAS','negative part of the SAS')} ${g(res.swap.neg,2)} ${T('contro','vs')} ${g(res.swap.negMain,2)})</p>`:'';
    return `<div class="tblwrap"><table class="tbl"><thead><tr><th>${T('Parametro','Parameter')}</th><th>${T('Valore','Value')}</th><th>${T('Errore standard','Standard error')}</th><th>${T('IC 95%','95% CI')}</th><th>${T('Unità','Unit')}</th><th>τ = 1/k</th></tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${h(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="opt-l">${T('Somma dei quadrati','Sum of squares')} ${g(res.ssr,5)} · σ ${g(res.sigma,4)} · N ${res.N} · ${T('parametri','parameters')} ${res.P} · AIC ${g(res.aic,7)} · BIC ${g(res.bic,7)} · ${T('iterazioni','iterations')} ${res.iter}</p>${sw}${warnList(res.warnings)}${corr}
      <div class="chemogrid">${S.map(s=>`<figure>${svg(s,460,250)}<figcaption>${h(s.title)}</figcaption></figure>`).join('')}</div><div class="row"><button class="btn small ghost" id="chKCsv">${desk()?'CSV':'⬇️ CSV'}</button></div>`; }
  function cmpHtml(c){ if (!c.rows.length) return ''; const R=c.rows.slice().sort((a,b)=>a.aic-b.aic);
    return `<h4 class="anh">${T('Confronto tra modelli','Model comparison')}</h4><div class="tblwrap"><table class="tbl"><thead><tr><th>${T('Modello','Model')}</th><th>${T('Somma dei quadrati','Sum of squares')}</th><th>${T('Parametri','Parameters')}</th><th>ΔAIC</th><th>ΔBIC</th><th>${T('Peso di Akaike','Akaike weight')}</th></tr></thead><tbody>${R.map(r=>`<tr><td>${h(cmpLabel(r.label))}</td><td>${g(r.ssr,5)}</td><td>${r.P}</td><td>${g(r.dAIC,4)}</td><td>${g(r.dBIC,4)}</td><td>${g(r.wAIC,3)}</td></tr>`).join('')}</tbody></table></div>
      ${c.tests.length?`<p class="opt-l">${T('Test F fra modelli annidati','F test between nested models')}: ${c.tests.map(t=>`${h(cmpLabel(t.simple))} → ${h(cmpLabel(t.complex))}: F ${g(t.F,4)}, p ${g(t.p,2)}`).join(' · ')}</p>`:''}
      <p class="opt-l">${T('AIC e BIC più bassi sono migliori; contano i parametri lineari degli spettri. Il test F vale solo fra modelli annidati.','Lower AIC and BIC are better; the linear spectral parameters are counted. The F test is valid only between nested models.')}</p>`; }

  /* ---------------- esportazioni ---------------- */
  const safe=s=>String(s).replace(/\.[^.]{1,7}$/,'').replace(/[\\/:*?"<>|\u0000-\u001f]+/g,'_').slice(0,80);
  function csvText(rows){ const sep=en()?',':';', d=dec(); const cell=c=>{ let s=typeof c==='number'?(Number.isFinite(c)?String(c).replace('.',d):''):String(c==null?'':c); if (/^[=+\-@]/.test(s) && !/^[-+]?\d/.test(s)) s="'"+s; return (s.includes(sep)||/["\n\r]/.test(s))?'"'+s.replace(/"/g,'""')+'"':s; };
    return '﻿'+rows.map(r=>r.map(cell).join(sep)).join('\r\n')+'\r\n'; }
  function mcrRows(f, res, B){ const se=f.series, k=res.C.n, rows=[[T('MCR-ALS','MCR-ALS'), f.title||f.name], [T('Algoritmo','Algorithm'), M.VERSION+' · '+(res.info.init||'')]];
    const o=res.opt; rows.push([T('Vincoli','Constraints'), [o.nonnegC?T('C ≥ 0','C ≥ 0'):'', o.nonnegS?T('S ≥ 0','S ≥ 0'):'', o.closure!=null?T('chiusura ','closure ')+o.closure:'', o.unimodal.length?T('unimodalità ','unimodality ')+o.unimodal.map(u=>u+1).join(' '):'', res.known.length?T('spettri noti ','known spectra ')+res.known.map(u=>u+1).join(' '):'', T('normalizzazione ','normalisation ')+(o.closure!=null?'—':o.norm)].filter(Boolean).join('; ')]);
    mcrMetrics(res).forEach(r=>rows.push(r)); res.warnings.forEach(w=>rows.push([T('Avviso','Warning'), en()?w.en:w.it]));
    if (B) B.f.forEach((b,i)=>rows.push(['MCR-BANDS '+(i+1), b.fmin, b.fopt, b.fmax]));
    rows.push([]); rows.push([tLab(se)].concat(Array.from({length:k},(_,c)=>'C'+(c+1)))); for (let i=0;i<res.C.m;i++) rows.push([se.t.values[i]].concat(Array.from(res.C.a.subarray(i*k,(i+1)*k))));
    rows.push([]); rows.push([xLab(f)].concat(Array.from({length:k},(_,c)=>'S'+(c+1)))); const n=res.S.n; for (let j=0;j<n;j++) rows.push([se.x.values[j]].concat(Array.from({length:k},(_,c)=>res.S.a[c*n+j])));
    return rows; }
  function kinRowsCsv(f, res, cmp){ const se=f.series, ns=res.species.length, rows=[[T('Cinetica globale','Global kinetics'), f.title||f.name], [T('Modello','Model'), MODEL_NAMES()[res.model]], [T('Parametro','Parameter'), T('Valore','Value'), T('Errore standard','Standard error'), T('IC 95%','95% CI'), T('Unità','Unit'), 'τ']];
    kinRows(f,res).forEach(r=>rows.push(r));
    rows.push([T('Somma dei quadrati','Sum of squares'), res.ssr], ['σ', res.sigma], ['N', res.N], [T('Parametri','Parameters'), res.P], ['AIC', res.aic], ['BIC', res.bic]);
    if (res.corr) res.corr.forEach((r,i)=>rows.push([T('correlazione ','correlation ')+res.params[i].name].concat(r)));
    res.warnings.forEach(w=>rows.push([T('Avviso','Warning'), en()?w.en:w.it]));
    if (cmp) { rows.push([]); rows.push([T('Modello','Model'), T('Somma dei quadrati','Sum of squares'), T('Parametri','Parameters'), 'AIC', 'BIC', 'ΔAIC', 'ΔBIC']); cmp.rows.forEach(r=>rows.push([cmpLabel(r.label), r.ssr, r.P, r.aic, r.bic, r.dAIC, r.dBIC])); cmp.tests.forEach(t=>rows.push(['F', cmpLabel(t.simple)+' → '+cmpLabel(t.complex), t.F, t.d1, t.d2, t.p])); }
    rows.push([]); rows.push([tLab(se)].concat(res.species.map(s=>'C '+s))); for (let i=0;i<res.C.m;i++) rows.push([res.t[i]].concat(Array.from(res.C.a.subarray(i*ns,(i+1)*ns))));
    rows.push([]); rows.push([xLab(f)].concat(res.species.map(s=>(res.info.das?'DAS ':'SAS ')+s))); const n=res.S.n; for (let j=0;j<n;j++) rows.push([se.x.values[j]].concat(Array.from({length:ns},(_,c)=>res.S.a[c*n+j])));
    return rows; }
  // risultato per le esportazioni: quello a schermo; se manca ma le impostazioni sono salvate, si calcola (l'esportazione mostra già l'attesa)
  function resultFor(f, kind){ const r=rt(f);
    if (kind==='mcr'){ const o=mcrOpts(f); if (r.mcr && r.mcr.key===mcrKey(f,o)) return r.mcr.res; if (!(f.an&&f.an.mcr)) return null; try{ const res=M.drain(mcrCompute(f)); r.mcr={key:mcrKey(f,o), res}; return res; }catch(e){ return null; } }
    const o=Object.assign({model:'ord1'}, opt(f,'kin')); if (r.kin && r.kin.key===kinKey(f,o)) return r.kin.res; if (!(f.an&&f.an.kin)) return null; try{ const res=K.fit(f.series,o); r.kin={key:kinKey(f,o), res}; return res; }catch(e){ return null; } }
  function analysisFiles(list){ const out=[]; for (const f of list.filter(q=>q.series && M.validSeries(q.series))){ const m=resultFor(f,'mcr'), k=resultFor(f,'kin'), r=rt(f);
      if (m) out.push([(en()?'mcr_als_':'mcr_als_')+safe(f.title||f.name)+'.csv', csvText(mcrRows(f,m, r.bands&&r.bands.key===mcrKey(f,mcrOpts(f))?r.bands.res:null))]);
      if (k) out.push([(en()?'global_kinetics_':'cinetica_globale_')+safe(f.title||f.name)+'.csv', csvText(kinRowsCsv(f,k, r.cmp&&r.cmp.key===keyOf(f)?r.cmp.res:null))]); }
    return out; }
  function dl(f, kind){ const res=resultFor(f,kind); if (!res) return; const L=analysisFiles([f]).filter(([n])=>kind==='mcr'?/^mcr_/.test(n):!/^mcr_/.test(n)); if (L[0] && win.download) win.download(new Blob([L[0][1]],{type:'text/csv'}), L[0][0]); }
  function pdfLines(f){ const L=[], se=f.series, m=resultFor(f,'mcr'), k=resultFor(f,'kin');
    L.push(T('Serie: ','Series: ')+`${se.shape[0]} × ${se.shape[1]}, ${tLab(se)} ${g(se.t.values[0],4)}–${g(se.t.values[se.t.values.length-1],4)}`);
    if (m){ L.push(`MCR-ALS: ${m.C.n} ${T('componenti','components')}, ${T('mancanza di adattamento','lack of fit')} ${g(m.lof,4)}% (PCA ${g(m.lofPca,4)}%), ${T('varianza spiegata','explained variance')} ${g(m.expVar,6)}%, ${m.iter} ${T('iterazioni','iterations')}${m.converged?'':T(', senza convergenza',', not converged')}.`);
      m.warnings.forEach(w=>L.push(T('Nota: ','Note: ')+(en()?w.en:w.it))); }
    if (k){ L.push(T('Cinetica globale','Global kinetics')+` (${MODEL_NAMES()[k.model]}): `+kinRows(f,k).map(r=>`${r[0]} = ${r[1]} ± ${r[2]} ${r[4]}`).join('; ')+`; σ ${g(k.sigma,4)}, AIC ${g(k.aic,7)}.`);
      k.warnings.forEach(w=>L.push(T('Nota: ','Note: ')+(en()?w.en:w.it))); }
    return L; }
  function pdfImages(f){ const out=[], m=resultFor(f,'mcr'), k=resultFor(f,'kin'); if (m) mcrSpecs(f,m).slice(0,2).forEach(s=>out.push(canvas(s,560,300))); if (k) kinSpecs(f,k).slice(0,2).forEach(s=>out.push(canvas(s,560,300))); return out; }

  /* ---------------- sezione ---------------- */
  function title(){ return WEB('🧪 Serie, MCR-ALS e cinetica globale','🧪 Series, MCR-ALS and global kinetics','Serie, MCR-ALS e cinetica globale','Series, MCR-ALS and global kinetics'); }
  function ensure(){ let d=$('#secChemo'); if (d) return d; const host=$('[data-panel="multi"]'); if (!host) return null;
    d=doc.createElement('details'); d.className='ansec'; d.id='secChemo'; d.innerHTML=`<summary><b id="chemoTitle" data-noi18n></b><span class="secsum" id="sumChemo" data-noi18n></span><span class="scope s-instr" id="chemoScope" data-noi18n></span></summary><div class="in" id="chemoBox" data-noi18n></div>`;
    host.appendChild(d); d.addEventListener('toggle', ()=>{ if (d.open) render(); }); return d; }
  function summary(){ const d=ensure(); if (!d) return; $('#chemoTitle').textContent=title(); $('#chemoScope').textContent=T('più spettri','several spectra'); const S=seriesFiles(); $('#sumChemo').textContent=S.length?T(`${S.length} serie`,`${S.length} series`):''; }
  function render(){ const d=ensure(); if (!d) return; summary(); if (!d.open) return; const box=$('#chemoBox'), f=sel();
    const tabs=[['serie',T('Serie','Series')],['mcr','MCR-ALS'],['kin',T('Cinetica globale','Global kinetics')]];
    if (RT.tab!=='serie' && !f) RT.tab='serie';
    box.innerHTML=`<div class="chemotabs" role="tablist">${tabs.map(([k,l])=>`<button type="button" role="tab" class="btn small ${RT.tab===k?'primary':'ghost'}" data-ctab="${k}" aria-selected="${RT.tab===k}" ${k!=='serie'&&!f?'disabled':''}>${h(l)}</button>`).join('')}${f&&RT.tab!=='serie'?`<span class="opt-l" style="margin-left:8px">${h(typeof dispTitle==='function'?dispTitle(f):f.name)}</span>`:''}</div><div id="chemoBody"></div>`;
    box.querySelectorAll('[data-ctab]').forEach(b=>b.onclick=()=>{ RT.tab=b.dataset.ctab; render(); });
    const body=$('#chemoBody');
    try{ if (RT.tab==='mcr') renderMcr(body, f); else if (RT.tab==='kin') renderKin(body, f); else renderSerie(body); }catch(e){ console.error(e); body.innerHTML=`<p>${SIG('stop')} ${h(e.message)}</p>`; } }
  function init(){ ensure(); summary(); hookProject();
    const st=doc.createElement('style'); st.textContent='.chemogrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:10px;align-items:start;margin:8px 0}.chemogrid figure{margin:0}.chemogrid figcaption{font-size:12.5px;color:var(--muted)}.chemotabs{display:flex;gap:6px;align-items:center;margin-bottom:10px;flex-wrap:wrap}.chemowarn{margin:6px 0;padding-left:18px}.chemolist{margin:4px 0;padding-left:18px}'; doc.head.appendChild(st);
    const rf=win.refreshAll; if (typeof rf==='function') win.refreshAll=function(){ const r=rf.apply(this,arguments); try{ render(); }catch(e){ console.error(e); } return r; };
    win.addEventListener('acch-lang', ()=>{ try{ render(); }catch(e){} }); }
  win.AcchChemo={render, init, analysisFiles, pdfLines, pdfImages, restore, runSliced, makeSeriesFile, seriesRecord, _rt:RT, sel, resultFor};
  if (doc.readyState==='loading') doc.addEventListener('DOMContentLoaded', init); else init();
})(typeof self!=='undefined' ? self : this);
