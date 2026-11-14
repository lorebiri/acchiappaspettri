// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Finestre aggiuntive del desktop, lato finestra principale (tappa I6).
   - «Stacca il grafico»: il grafico della finestra principale (spettro o confronto) in una finestra sua, anche su un altro schermo.
     Zoom e spostamento sono gli stessi nelle due finestre.
   - «Confronto»: il confronto scelto, in sola lettura, sempre allineato alla principale (spettri, modo, elaborazione, nomi);
     lo zoom è solo suo.
   La principale resta l'unica che ha i dati e scrive le impostazioni: per ogni finestra prepara il disegno (drawPlot) alla sua
   risoluzione, con al più 8 punti veri per pixel (primo, minimo, massimo, ultimo di ogni mezzo pixel: nessun picco si perde) e lo
   consegna in binario (view_put, src-tauri/src/viste.rs). Le dimensioni delle finestre si ricordano nell'archivio (acch.viste).
   Nella pagina online window.__TAURI__ non c'è e questo file non fa nulla. */
(function(win){
  'use strict';
  const T=win.__TAURI__; if (!T) return;
  const inv=T.core.invoke, tr=s=>win.AcchI18n && win.AcchI18n.lang==='en' ? win.AcchI18n.tr(s) : s;
  const KEY='acch.viste', views=new Map();   // etichetta → {kind, cmpId, w, h, dpr, zoom}
  const lsG=()=>{ try{ return JSON.parse(AcchHost.store.getItem(KEY))||{}; }catch(e){ return {}; } }, lsS=v=>{ try{ AcchHost.store.setItem(KEY, JSON.stringify(v)); }catch(e){} };
  const stats={pushes:0, bytes:0, ms:0};

  async function open(kind){
    let cmpId=null, title;
    if (kind==='confronto'){ const c=curCmp(); if (!c || members(c).length<2){ toast(tr('Per aprire il confronto in una finestra servono almeno due spettri nel confronto: crealo in «Confronto».')); return null; }
      cmpId=c.id; title=cmpTitle(c, T_())+' — '+tr('Confronto')+' — Acchiappaspettri'; }
    else { if (!files.length){ toast(tr('Carica uno spettro: la finestra del grafico mostra il grafico della finestra principale.')); return null; } title=tr('Grafico')+' — Acchiappaspettri'; }
    const g=lsG()[kind]||{};
    try{ const label=await inv('view_open', {kind, title, w:g.w||null, h:g.h||null}); const old=views.get(label);
      views.set(label, Object.assign(old||{w:900, h:560, dpr:win.devicePixelRatio||1, zoom:null}, {kind, cmpId, title}));
      schedule(label); return label; }
    catch(e){ console.warn('[finestre] '+e); toast(tr('Impossibile aprire la finestra.')); return null; } }

  /* il disegno per una finestra: la stessa vista dell'anteprima, con lo zoom giusto */
  function viewFor(st){
    if (st.kind==='confronto'){ const c=COMPS.find(x=>x.id===st.cmpId); if (!c) return {empty:'Il confronto non esiste più nella finestra principale.'};
      if (members(c).length<2 || !cmpReady(c)) return {empty:'In attesa della finestra principale…', wait:members(c).length>=2};
      st.title=cmpTitle(c, T_())+' — '+tr('Confronto')+' — Acchiappaspettri';
      let d=cmpViewOf(c); const full=zoomRange(c, true); if (st.zoom){ d=zoomSliceMulti(d, st.zoom); d=Object.assign({}, d, {inset:null}); }
      return {d, zoom:st.zoom, range:full, heading:cmpTitle(c, T_()), instr:c.instr}; }
    if (viewMode==='cmp'){ const c=curCmp(); if (!c || members(c).length<2) return {empty:'Nessun grafico nella finestra principale.'}; if (!cmpReady(c)) return {empty:'In attesa della finestra principale…', wait:true};
      let d=cmpViewOf(c); if (c._zoom) d=zoomSliceMulti(d, c._zoom); if (c._yzoom) d=Object.assign({}, d, {yRange:c._yzoom.slice()}); if (c._zoom||c._yzoom) d=Object.assign({}, d, {inset:null});
      return {d, zoom:c._zoom, range:zoomRange(c, true), heading:cmpTitle(c, T_()), instr:c.instr}; }
    const f=files[cur]; if (!f) return {empty:'Nessun grafico nella finestra principale.'};
    let d=viewOf(f); d.highlightManual=true; if (f._zoom) d=zoomSlice(d, f._zoom); if (f._yzoom) d=Object.assign({}, d, {yRange:f._yzoom.slice()}); if (f._zoom||f._yzoom) d=Object.assign({}, d, {inset:null});
    return {d, zoom:f._zoom, range:fullRange(f), heading:dispTitle(f), instr:f.instr}; }
  function zoomRange(c){ let a=Infinity, b=-Infinity; members(c).forEach(f=>{ const r=fullRange(f); a=Math.min(a,r[0]); b=Math.max(b,r[1]); }); return [a,b]; }

  /* riduzione per il trasporto: B colonne sull'intervallo della serie; per ognuna il primo, il minimo, il massimo e l'ultimo punto,
     con X crescenti (minimo e massimo al centro della colonna, tenuto tra il primo e l'ultimo). Con B = 2 × pixel della finestra
     ogni pixel contiene almeno due colonne intere: minimo e massimo di ogni pixel restano quelli dei dati */
  function reduce(xs, ys, B){ const n=xs.length, P=win.AcchPlot, R=P && n>4*B && P.ready(xs, ys); if (!R) return {xs, ys, map:null};
    const lo=xs[0], hi=xs[n-1], par={o:0, lo, hi, den:(hi-lo)||1, w:1, inv:false}, G=P.groupsArr(R, ys, P.linCol(xs, 0, par, B), false, null);
    const X=new Float64Array(4*G.m), Y=new Float64Array(4*G.m); let m=0;
    for (let j=0;j<G.m;j++){ const xa=xs[G.ia[j]], xb=xs[G.ib[j]], xc=Math.min(xb, Math.max(xa, lo+(G.c[j]+0.5)/B*(hi-lo)));
      X[m]=xa; Y[m++]=G.f[j]; X[m]=xc; Y[m++]=G.mn[j]; X[m]=xc; Y[m++]=G.mx[j]; X[m]=xb; Y[m++]=G.l[j]; }
    return {xs:X.subarray(0,m), ys:Y.subarray(0,m), map:true}; }
  const lowerBound=(a,x)=>{ let p=0, q=a.length; while (p<q){ const k=(p+q)>>1; if (a[k]<x) p=k+1; else q=k; } return Math.min(a.length-1, p); };

  function encode(meta, arrays){ const js=new TextEncoder().encode(JSON.stringify(meta)), pad=(8-(8+js.length)%8)%8, n=arrays.reduce((s,a)=>s+a.length,0);
    const ab=new ArrayBuffer(8+js.length+pad+8*n), dv=new DataView(ab); dv.setUint32(0,0x53564341,true); dv.setUint32(4,js.length,true); new Uint8Array(ab,8,js.length).set(js);
    let off=8+js.length+pad; for (const a of arrays){ new Float64Array(ab, off, a.length).set(a); off+=8*a.length; } return new Uint8Array(ab); }

  function payload(st){ const V=viewFor(st), base={v:1, kind:st.kind, lang:(win.AcchI18n&&AcchI18n.lang)||'it', readOnly:st.kind==='confronto', title:st.title||'Acchiappaspettri'};
    if (!V.d){ return encode(Object.assign(base, {empty:V.empty}), []); }
    const d=V.d, B=Math.max(200, Math.round(2*st.w*st.dpr)), arrays=[];
    const pack=s=>{ const r=reduce(s.xs, s.ys, B); arrays.push(r.xs, r.ys); const o={}; for (const k of ['color','name','dash','lineW','noLegend','label']) if (s[k]!==undefined) o[k]=s[k]; o.n=r.xs.length; return {o, r}; };
    const ser=(d.series||[]).map(pack), s2=d.series2 && d.series2.xs && d.series2.xs.length ? pack(d.series2) : null;
    const dd={}; for (const k of Object.keys(d)) if (!['series','series2','xs','ys'].includes(k)) dd[k]=d[k];
    dd.series=ser.map(x=>x.o); if (s2) dd.series2=s2.o;
    dd.peaks=(d.peaks||[]).map(p=>{ const q={}; for (const k of Object.keys(p)) if (k!=='sugg' && k!=='suggAll') q[k]=p[k]; return q; });
    // aree colorate: gli indici dei punti vanno riportati sulla serie ridotta
    if (ser[0] && ser[0].r.map && dd.peaks.some(p=>p.ia!=null)){ const off=d.idxOff||0, full=d.series[0].xs, rx=ser[0].r.xs, at=i=>lowerBound(rx, full[Math.min(full.length-1, Math.max(0, i-off))]);
      dd.peaks.forEach(p=>{ if (p.ia==null) return; p.ia=at(p.ia); p.ib=at(p.ib); if (p.hullD) p.hullD=p.hullD.map(([i,v])=>[at(i),v]); }); dd.idxOff=0; }
    const S0=S, Sx={}; for (const k of ['grid','lineW','peakLabels','shadeArea','showArea','showInstr','showPeaks']) Sx[k]=S0[k];
    const xu=typeof xUnit==='function' && files[cur] ? (V.instr && files[cur].instr===V.instr ? (xUnit(files[cur])||'').replace('cm-1','cm⁻¹') : '') : '';
    return encode(Object.assign(base, {d:dd, S:Sx, zoom:V.zoom||null, range:V.range, heading:V.heading, xUnit:xu}), arrays); }

  const due=new Set(); let raf=0;
  function schedule(label){ if (label) due.add(label); else for (const l of views.keys()) due.add(l); if (!raf && due.size) raf=requestAnimationFrame(flush); }
  async function flush(){ raf=0; const L=[...due]; due.clear();
    for (const label of L){ const st=views.get(label); if (!st) continue; const t0=performance.now(); let body;
      try{ body=payload(st); }catch(e){ console.error('[finestre]', e); continue; }
      stats.pushes++; stats.bytes+=body.length; stats.ms+=performance.now()-t0;
      try{ await inv('view_put', body, {headers:{'x-acch-view':label}}); }catch(e){ if (/no-view/.test(String(e))) views.delete(label); else console.warn('[finestre] '+e); } } }

  /* richieste delle finestre: dimensioni, zoom, spostamento, chiusura */
  function zoomOf(st){ if (st.kind==='confronto'){ const c=COMPS.find(x=>x.id===st.cmpId); if (!c) return null; const r=zoomRange(c); return {o:{get _zoom(){ return st.zoom; }, set _zoom(v){ st.zoom=v; }, set _yzoom(v){}}, range:r, inv:INSTR[c.instr].invertX, own:true}; }
    return zTarget(); }
  function onReq(q){ if (!q || typeof q.label!=='string') return; const st=views.get(q.label); if (!st) return;
    if (q.op==='close'){ views.delete(q.label); return; }
    if (q.w>0 && q.h>0){ st.w=q.w; st.h=q.h; st.dpr=q.dpr||1; const g=lsG(); g[st.kind]={w:Math.round(q.w), h:Math.round(q.h)+56}; lsS(g); }
    if (q.op==='zoom' || q.op==='reset'){ const t=zoomOf(st); if (!t) return schedule(q.label);
      const [fa,fb]=t.range; if (q.op==='reset'){ t.o._zoom=null; t.o._yzoom=null; }
      else { let [a,b]=t.o._zoom||[fa,fb]; const W=b-a;
        if (q.k && q.k!==1){ const fx=t.inv ? 1-(q.at==null?0.5:q.at) : (q.at==null?0.5:q.at), c=a+fx*W; a=c-(c-a)*q.k; b=c+(b-c)*q.k; }
        if (q.pan){ const sh=-q.pan*W*(t.inv?-1:1); a+=sh; b+=sh; }
        // come setZoom della pagina: almeno 1/300 dell'intervallo, dentro i dati; quasi tutto = niente zoom
        const minW=(fb-fa)/300; if (b-a<minW){ const c=(a+b)/2; a=c-minW/2; b=c+minW/2; }
        if (b-a>=(fb-fa)*0.995){ t.o._zoom=null; t.o._yzoom=null; } else { if (a<fa){ b+=fa-a; a=fa; } if (b>fb){ a-=b-fb; b=fb; } t.o._zoom=[Math.max(fa,a), Math.min(fb,b)]; } }
      if (!t.own && typeof renderPreview==='function'){ renderPreview(); return; }   // grafico staccato: zoom condiviso, ridisegnano tutte e due
    }
    schedule(q.label); }

  // dopo ogni disegno della principale le finestre si allineano (al più una volta per fotogramma)
  const oPrev=win.renderPreview; win.renderPreview=function(){ const r=oPrev.apply(this, arguments); if (views.size) schedule(); return r; };
  T.event.listen('acch-vista-req', ev=>onReq(ev.payload)).catch(e=>console.warn(e));
  win.addEventListener('acch-lang', ()=>schedule());
  win.AcchViste={ open, schedule, stats, get open_(){ return [...views.keys()]; }, payload:label=>payload(views.get(label)), _views:views };
})(window);
