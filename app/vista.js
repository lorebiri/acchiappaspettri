// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Finestra aggiuntiva del desktop (tappa I6): disegna ciò che manda la finestra principale (app/viste.js) con drawPlot, lo stesso
   codice della pagina (plot.js, estratto da index.html), e le tracce con WebGL se c'è.
   - Non legge né scrive archivio, file o impostazioni: chiede alla principale e ridisegna.
   - Zoom e spostamento (rotellina, trascinamento, tasti + − 0 ← →, pulsanti) si chiedono alla principale, che manda il disegno nuovo.
   - Accessibilità: grafico con descrizione (role img), annuncio della zona vista, pulsanti con testo, tutto da tastiera. */
(function(win){
  'use strict';
  const T=win.__TAURI__, $=s=>document.querySelector(s), kind=(new URLSearchParams(location.search).get('k')||'grafico');
  const cv=$('#vcv'), wrap=$('#wrap'), msg=$('#msg');
  let label=null, data=null, lang='it', lastSay='', GL;
  const TXT={ en:{'Ingrandisci':'Zoom in','Riduci':'Zoom out','Mostra tutto':'Show all','Sola lettura':'Read-only','In attesa della finestra principale…':'Waiting for the main window…',
      'Grafico':'Graph','spettri':'spectra','vista intera':'full view','zona vista':'visible range','asse X da':'X axis from','a':'to','Nessun grafico nella finestra principale.':'No graph in the main window.',
      'Il confronto non esiste più nella finestra principale.':'The comparison no longer exists in the main window.','Zona vista':'Visible range','Tutto lo spettro':'Whole spectrum'} };
  const tr=s=>lang==='en' && TXT.en[s] ? TXT.en[s] : s;
  function texts(){ document.documentElement.lang=lang; $('#vzin').textContent=tr('Ingrandisci'); $('#vzout').textContent=tr('Riduci'); $('#vzall').textContent=tr('Mostra tutto'); $('#vro').textContent=tr('Sola lettura'); }

  /* formato del messaggio: [magia 'ACVS', lunghezza del JSON][JSON][fino a multiplo di 8][Float64: per ogni serie xs poi ys] */
  function decode(ab){ const dv=new DataView(ab); if (ab.byteLength<8 || dv.getUint32(0,true)!==0x53564341) return null;
    const jl=dv.getUint32(4,true), meta=JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 8, jl))); let off=8+jl; off+=(8-off%8)%8;
    const take=n=>{ const a=new Float64Array(ab, off, n); off+=8*n; return a; };
    const fill=s=>{ if (s && s.n!=null){ s.xs=take(s.n); s.ys=take(s.n); delete s.n; } return s; };
    if (meta.d){ meta.d.series=(meta.d.series||[]).map(fill); if (meta.d.series2) fill(meta.d.series2); const s0=meta.d.series[0]; meta.d.xs=s0?s0.xs:new Float64Array(0); meta.d.ys=s0?s0.ys:new Float64Array(0); }
    return meta; }
  win.AcchVistaDecode=decode;

  function size(){ const r=wrap.getBoundingClientRect(), dpr=win.devicePixelRatio||1; return {w:Math.max(200,Math.round(r.width)), h:Math.max(150,Math.round(r.height)), dpr}; }
  function ask(op, extra){ if (!T || !label) return; const s=size(); T.event.emitTo('main','acch-vista-req', Object.assign({label, kind, op, w:s.w, h:s.h, dpr:s.dpr}, extra||{})).catch(e=>console.warn(e)); }

  function draw(){ const s=size(); cv.width=Math.round(s.w*s.dpr); cv.height=Math.round(s.h*s.dpr);
    const ctx=cv.getContext('2d'); ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle='#fff'; ctx.fillRect(0,0,cv.width,cv.height);
    if (GL===undefined){ GL=null; if (win.AcchPlotGL){ const g=AcchPlotGL.create(cv); if (g.available){ GL=g; g.onLost=()=>{ g.clear(); draw(); }; } } }
    if (!data || !data.d){ if (GL) GL.clear(); msg.hidden=false; msg.textContent=tr(data && data.empty ? data.empty : 'In attesa della finestra principale…'); return; }
    msg.hidden=true; const W=s.w/5, H=s.h/5, k=cv.width/W;
    const L=GL && GL.available ? (GL.size(cv.width, cv.height), {gl:GL, over:GL.over.getContext('2d')}) : null;
    try{ LANG=lang; }catch(e){}
    data.d.fontPt=10; drawPlot(ctx, W, H, k, data.d, data.S, L);
    describe(); }
  function describe(){ const d=data.d, n=(d.series||[]).filter(s=>s.xs.length).length, z=data.zoom;
    const fmt=v=>(+(+v).toPrecision(5)).toLocaleString(lang==='en'?'en-GB':'it-IT');
    const rng=data.range ? `${tr('asse X da')} ${fmt(data.range[0])} ${tr('a')} ${fmt(data.range[1])}${data.xUnit?' '+data.xUnit:''}` : '';
    cv.setAttribute('aria-label', `${tr('Grafico')}: ${d.title||''}. ${n>1?n+' '+tr('spettri')+'. ':''}${rng} (${z?tr('zona vista'):tr('vista intera')}).`);
    const say=z ? `${tr('Zona vista')}: ${fmt(z[0])} – ${fmt(z[1])}${data.xUnit?' '+data.xUnit:''}` : tr('Tutto lo spettro');
    if (say!==lastSay){ lastSay=say; $('#stato').textContent=say; } }

  async function take(){ const b=await T.core.invoke('view_take'); const ab=b instanceof ArrayBuffer ? b : new Uint8Array(b).buffer; if (!ab.byteLength) return;
    const m=decode(ab); if (!m) return; data=m; if (m.lang && m.lang!==lang){ lang=m.lang; texts(); }
    document.title=m.title||'Acchiappaspettri'; $('#vtit').textContent=m.heading||m.title||''; $('#vro').hidden=!m.readOnly;
    try{ if (T.window) T.window.getCurrentWindow().setTitle(document.title); }catch(e){}
    draw(); }

  // interazione: tutto passa dalla principale (che ha i dati); la rotellina e il trascinamento si raccolgono per fotogramma
  let pend=null; const send=()=>{ if (pend){ ask('zoom', pend); pend=null; } };
  const later=o=>{ const first=!pend; pend=pend||{k:1, pan:0, at:0.5}; if (o.k){ pend.k*=o.k; pend.at=o.at; } if (o.pan) pend.pan+=o.pan; if (first) requestAnimationFrame(send); };
  function xFrac(clientX){ const r=cv.getBoundingClientRect(); return Math.min(1, Math.max(0, (clientX-r.left)/r.width)); }
  cv.addEventListener('wheel', e=>{ e.preventDefault(); later({k:e.deltaY>0?1.25:0.8, at:xFrac(e.clientX)}); }, {passive:false});
  let drag=null;
  cv.addEventListener('pointerdown', e=>{ if (e.button!==0) return; drag={x:e.clientX}; try{ cv.setPointerCapture(e.pointerId); }catch(_){} });
  cv.addEventListener('pointermove', e=>{ if (!drag) return; const dx=e.clientX-drag.x; if (Math.abs(dx)<2) return; drag.x=e.clientX; const r=cv.getBoundingClientRect(); later({pan:dx/r.width}); });
  cv.addEventListener('pointerup', ()=>{ drag=null; });
  $('#vzin').onclick=()=>ask('zoom',{k:0.6}); $('#vzout').onclick=()=>ask('zoom',{k:1.6}); $('#vzall').onclick=()=>ask('reset');
  document.addEventListener('keydown', e=>{ if (e.ctrlKey||e.metaKey||e.altKey) return;
    if (e.key==='+'||e.key==='='){ e.preventDefault(); ask('zoom',{k:0.6}); }
    else if (e.key==='-'){ e.preventDefault(); ask('zoom',{k:1.6}); }
    else if (e.key==='0'){ e.preventDefault(); ask('reset'); }
    else if (e.key==='ArrowLeft' && document.activeElement===cv){ e.preventDefault(); ask('zoom',{pan:0.1}); }
    else if (e.key==='ArrowRight' && document.activeElement===cv){ e.preventDefault(); ask('zoom',{pan:-0.1}); } });
  let rt=null; win.addEventListener('resize', ()=>{ clearTimeout(rt); rt=setTimeout(()=>{ draw(); ask('size'); }, 80); });

  texts();
  if (!T){ msg.textContent=tr('In attesa della finestra principale…'); return; }
  (async()=>{ try{ label=T.window.getCurrentWindow().label; }catch(e){ label='vista-'+kind; }
    await T.event.listen('acch-vista', ()=>{ take().catch(e=>console.warn(e)); });
    win.addEventListener('beforeunload', ()=>ask('close'));
    ask('hello'); cv.focus(); })();
})(window);
