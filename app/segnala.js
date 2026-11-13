// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* «Segnala un problema»: finestra con descrizione, riepilogo tecnico visibile, screenshot oscurabile; il messaggio va a
   lorenzo.birindelli@cnr.it ma lo spedisce sempre l'utente dal suo programma di posta. Nessuna chiamata di rete, nessun segreto.
   Desktop Windows: Simple MAPI con l'allegato (lato Rust); altrimenti mailto: e screenshot salvato in Download. Online: mailto: e download.
   La parte pura (registro, testi, mailto, oscuramento) è in app/segnala-core.js. */
(function(win){
  'use strict';
  const C=win.AcchSegnalaCore, doc=win.document; if (!C || !doc) return;
  const $=s=>doc.querySelector(s), desk=()=>!!win.ACCH_SHELL, T=()=>win.__TAURI__;
  const lang=()=>win.AcchI18n && win.AcchI18n.lang==='en' ? 'en' : 'it';
  const tr=s=>lang()==='en' && win.AcchI18n ? win.AcchI18n.tr(s) : s;
  const el=(t,a,...k)=>{ const e=doc.createElement(t); for (const n in (a||{})){ if (n==='on') e.addEventListener('click',a.on); else if (n==='text') e.textContent=a[n]; else e.setAttribute(n,a[n]); } k.forEach(x=>x!=null&&e.append(x)); return e; };
  const plain=t=>String(t||'').replace(/[\p{Extended_Pictographic}️⊘△⛔⚠]/gu,'').replace(/\s+/g,' ').trim();

  /* ---- avvisi ⊘/△ mostrati dalla pagina: nel registro ---- */
  for (const k of ['toast','say']){ const o=win[k]; if (typeof o!=='function') continue;
    win[k]=function(){ const txt=k==='say'?arguments[1]:arguments[0]; try{ const lv=C.severity(txt); if (lv) C.log.push(lv, plain(txt)); }catch(_){} return o.apply(this, arguments); }; }

  /* ---- stile: variabili del tema, nessun colore scritto a mano tranne il nero dell'oscuramento ---- */
  doc.head.appendChild(el('style',{text:`
#dlgReport .rpgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:10px 0}
#dlgReport textarea{width:100%;min-height:74px;resize:vertical;border:1px solid var(--line);border-radius:8px;padding:6px 8px;background:var(--panel);font-size:14px}
#dlgReport .rpshot{position:relative;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--bg);cursor:crosshair;touch-action:none;line-height:0}
#dlgReport .rpshot canvas{width:100%;height:auto;display:block}
#dlgReport pre{white-space:pre-wrap;word-break:break-word;font-size:12px;max-height:150px;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:8px;margin:4px 0 10px;background:var(--bg)}
#dlgReport .rpmsg{margin:10px 0 0;padding:8px 10px;border-radius:8px;background:var(--accent-soft)}
#dlgReport .rpmsg:empty{display:none}
#dlgReport .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
#acchErrNote{position:fixed;right:16px;bottom:16px;z-index:60;max-width:420px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:var(--panel);color:var(--ink);border:1px solid var(--danger);border-radius:12px;padding:10px 12px;box-shadow:0 8px 30px rgba(20,30,50,.18);font-size:14px}
@media (max-width:640px){ #dlgReport .rpgrid{grid-template-columns:1fr} }`}));

  /* ================= SCREENSHOT DELLA FINESTRA =================
     Ricostruito dalla pagina stessa (riquadri, bordi, testi, campi, grafici su canvas, icone SVG): funziona uguale in WebView2, WebKit
     e nei browser, senza permessi del sistema e senza «sporcare» il canvas. Non è una copia al pixel: ombre e sfumature si perdono. */
  const isTransparent=c=>!c || c==='transparent' || /rgba?\([^)]*,\s*0\)$/.test(c) || /\/\s*0\)$/.test(c);
  const px=v=>parseFloat(v)||0;
  function collect(skip){ const ops=[], top=[], vw=win.innerWidth, vh=win.innerHeight;
    function box(e,cs,r){ const bg=cs.backgroundColor, rad=Math.min(px(cs.borderTopLeftRadius), r.width/2, r.height/2);
      if (!isTransparent(bg)) ops.push({t:'fill', x:r.left, y:r.top, w:r.width, h:r.height, rad, c:bg});
      const sides=[['Top',r.left,r.top,r.width,0],['Bottom',r.left,r.bottom,r.width,0],['Left',r.left,r.top,0,r.height],['Right',r.right,r.top,0,r.height]];
      const bw=px(cs.borderTopWidth); if (bw>0 && cs.borderTopStyle!=='none' && ['Top','Right','Bottom','Left'].every(s=>px(cs['border'+s+'Width'])===bw && cs['border'+s+'Color']===cs.borderTopColor && cs['border'+s+'Style']!=='none') && !isTransparent(cs.borderTopColor)){
        ops.push({t:'stroke', x:r.left+bw/2, y:r.top+bw/2, w:r.width-bw, h:r.height-bw, rad, c:cs.borderTopColor, lw:bw}); return; }
      for (const [s,x,y,w,h] of sides){ const lw=px(cs['border'+s+'Width']); if (lw>0 && cs['border'+s+'Style']!=='none' && !isTransparent(cs['border'+s+'Color'])) ops.push({t:'line', x, y, w, h, c:cs['border'+s+'Color'], lw}); } }
    const font=cs=>`${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    function text(node, cs){ let s=node.nodeValue; if (!/\S/.test(s)) return; if (!/pre/.test(cs.whiteSpace)) s=s.replace(/\s+/g,' ');
      if (cs.textTransform==='uppercase') s=s.toUpperCase(); const rg=doc.createRange(); rg.selectNodeContents(node); const rs=[...rg.getClientRects()].filter(r=>r.width>0&&r.height>0); if (!rs.length) return;
      ops.push({t:'text', s:s.trim(), rs:rs.map(r=>({x:r.left, y:r.top, w:r.width, h:r.height})), f:font(cs), c:cs.color}); }
    function field(e, cs, r){ const pl=px(cs.paddingLeft)+px(cs.borderLeftWidth);
      if (e.tagName==='INPUT' && (e.type==='checkbox'||e.type==='radio')){ ops.push({t:'check', x:r.left, y:r.top, w:r.width, h:r.height, on:e.checked, radio:e.type==='radio', c:cs.color}); return; }
      if (e.tagName==='INPUT' && /^(hidden|file|range|color|submit|button|image)$/.test(e.type)) return;
      let v=e.tagName==='SELECT' ? (e.options[e.selectedIndex]||{}).text||'' : e.value, c=cs.color; if (!v && e.placeholder){ v=e.placeholder; c='rgba(128,128,128,.9)'; } if (!v) return;
      if (e.type==='password') v='•'.repeat(v.length);
      const lh=px(cs.fontSize)*1.3, lines=e.tagName==='TEXTAREA' ? v.split('\n') : [v];
      ops.push({t:'clip', x:r.left, y:r.top, w:r.width, h:r.height});
      lines.forEach((ln,i)=>{ const y=e.tagName==='TEXTAREA' ? r.top+px(cs.paddingTop)+lh*i : r.top+(r.height-lh)/2; if (y<r.bottom) ops.push({t:'text', s:ln, rs:[{x:r.left+pl, y, w:r.width-pl, h:lh}], f:font(cs), c, one:true}); });
      ops.push({t:'unclip'}); }
    function walk(e, inheritedHidden){ if (e===skip || e.id==='acchErrNote') return;
      const cs=win.getComputedStyle(e); if (cs.display==='none') return;
      if (e.tagName==='DIALOG' && e.open && !top.includes(e) && !e.__top){ top.push(e); return; }   // le finestre aperte stanno sopra a tutto
      const op=+cs.opacity; if (op===0) return;
      const r=e.getBoundingClientRect(), hidden=inheritedHidden || cs.visibility==='hidden';
      const clips=cs.overflowX!=='visible' || cs.overflowY!=='visible' || e.tagName==='DIALOG';
      if (clips && (r.width<1 || r.height<1 || r.right<0 || r.bottom<0 || r.left>vw || r.top>vh)) return;
      if (op<1) ops.push({t:'alpha', a:op});
      if (!hidden){
        box(e, cs, r);
        if (e.tagName==='CANVAS' && r.width>0 && e.width>0){ try{ const cp=doc.createElement('canvas'); cp.width=e.width; cp.height=e.height; cp.getContext('2d').drawImage(e,0,0); ops.push({t:'img', im:cp, x:r.left, y:r.top, w:r.width, h:r.height}); }catch(_){} }
        else if (e.tagName==='IMG' && e.complete && e.naturalWidth) ops.push({t:'img', im:e, x:r.left, y:r.top, w:r.width, h:r.height});
        else if (e.tagName.toLowerCase()==='svg' && r.width>0){ try{ const cl=e.cloneNode(true), so=[e,...e.querySelectorAll('*')], sc=[cl,...cl.querySelectorAll('*')];   // stili del CSS (fill, stroke…) scritti nel clone: fuori dalla pagina si perderebbero
            so.forEach((n,i)=>{ const q=win.getComputedStyle(n); sc[i].setAttribute('style',['fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','opacity','fill-opacity','stroke-opacity'].map(k=>k+':'+q.getPropertyValue(k)).join(';')); });
            cl.setAttribute('width', r.width); cl.setAttribute('height', r.height); if (!cl.getAttribute('xmlns')) cl.setAttribute('xmlns','http://www.w3.org/2000/svg');
            const src=new XMLSerializer().serializeToString(cl).replace(/currentColor/g, cs.color); ops.push({t:'svg', src:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(src), x:r.left, y:r.top, w:r.width, h:r.height}); }catch(_){} if (op<1) ops.push({t:'unalpha'}); return; }
        if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName)){ field(e, cs, r); if (op<1) ops.push({t:'unalpha'}); return; }
      }
      if (clips) ops.push({t:'clip', x:r.left+px(cs.borderLeftWidth), y:r.top+px(cs.borderTopWidth), w:r.width-px(cs.borderLeftWidth)-px(cs.borderRightWidth), h:r.height-px(cs.borderTopWidth)-px(cs.borderBottomWidth)});
      for (const n of e.childNodes){ if (n.nodeType===1) walk(n, hidden); else if (n.nodeType===3 && !hidden) text(n, cs); }
      if (clips) ops.push({t:'unclip'}); if (op<1) ops.push({t:'unalpha'}); }
    const bcs=win.getComputedStyle(doc.body), hcs=win.getComputedStyle(doc.documentElement);
    ops.push({t:'fill', x:0, y:0, w:vw, h:vh, rad:0, c:!isTransparent(bcs.backgroundColor)?bcs.backgroundColor:!isTransparent(hcs.backgroundColor)?hcs.backgroundColor:'#fff'});
    walk(doc.body, false);
    for (const d of top){ ops.push({t:'fill', x:0, y:0, w:vw, h:vh, rad:0, c:'rgba(20,30,50,.35)'}); d.__top=true; try{ walk(d, false); } finally { delete d.__top; } }
    return ops; }
  function loadSvg(src){ return new Promise(res=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=()=>res(null); im.src=src; setTimeout(()=>res(null), 1500); }); }
  function paint(ops, W, H, k, withSvg){ const c=doc.createElement('canvas'); c.width=Math.round(W*k); c.height=Math.round(H*k); const g=c.getContext('2d'); g.scale(k,k); g.textBaseline='middle';
    const rr=(o)=>{ g.beginPath(); if (o.rad>0 && g.roundRect) g.roundRect(o.x,o.y,o.w,o.h,o.rad); else g.rect(o.x,o.y,o.w,o.h); };
    for (const o of ops){
      if (o.t==='fill'){ g.fillStyle=o.c; rr(o); g.fill(); }
      else if (o.t==='stroke'){ g.strokeStyle=o.c; g.lineWidth=o.lw; rr(o); g.stroke(); }
      else if (o.t==='line'){ g.strokeStyle=o.c; g.lineWidth=o.lw; g.beginPath(); g.moveTo(o.x,o.y); g.lineTo(o.x+o.w,o.y+o.h); g.stroke(); }
      else if (o.t==='img'){ try{ g.drawImage(o.im,o.x,o.y,o.w,o.h); }catch(_){} }
      else if (o.t==='svg'){ if (withSvg && o.im) try{ g.drawImage(o.im,o.x,o.y,o.w,o.h); }catch(_){} }
      else if (o.t==='check'){ g.strokeStyle=o.c; g.lineWidth=1; g.beginPath(); if (o.radio) g.arc(o.x+o.w/2,o.y+o.h/2,Math.min(o.w,o.h)/2-1,0,7); else g.rect(o.x+1,o.y+1,o.w-2,o.h-2); g.stroke(); if (o.on){ g.fillStyle=o.c; g.beginPath(); if (o.radio) g.arc(o.x+o.w/2,o.y+o.h/2,Math.min(o.w,o.h)/4,0,7); else g.rect(o.x+3,o.y+3,o.w-6,o.h-6); g.fill(); } }
      else if (o.t==='text'){ g.font=o.f; g.fillStyle=o.c;
        if (o.rs.length===1 || o.one){ const r=o.rs[0]; g.fillText(o.s, r.x, r.y+r.h/2); }
        else { const words=o.s.split(' '); let i=0; for (const r of o.rs){ let line=''; while (i<words.length){ const t=line?line+' '+words[i]:words[i]; if (line && g.measureText(t).width>r.w+2) break; line=t; i++; } g.fillText(line, r.x, r.y+r.h/2); } } }
      else if (o.t==='clip'){ g.save(); g.beginPath(); g.rect(o.x,o.y,o.w,o.h); g.clip(); }
      else if (o.t==='unclip') g.restore();
      else if (o.t==='alpha'){ g.save(); g.globalAlpha*=o.a; }
      else if (o.t==='unalpha') g.restore();
    }
    return c; }
  async function capture(skip){ const W=win.innerWidth, H=win.innerHeight, k=Math.min(2, win.devicePixelRatio||1);
    const ops=collect(skip); await Promise.all(ops.filter(o=>o.t==='svg').map(async o=>{ o.im=await loadSvg(o.src); }));
    let c=paint(ops, W, H, k, true);
    try{ c.getContext('2d').getImageData(0,0,1,1); }catch(e){ c=paint(ops, W, H, k, false); }   // un motore che «sporca» il canvas con gli SVG: senza icone
    c.cssW=W; c.cssH=H; c.k=k; return c; }

  /* ================= FINESTRA ================= */
  let dlg=null, shot=null, rects=[], context=null, deskInfo=null;
  const curFile=()=>{ try{ return typeof files!=='undefined' && files.length ? files[typeof cur!=='undefined' && files[cur] ? cur : 0] : null; }catch(e){ return null; } };
  const allFiles=()=>{ try{ return typeof files!=='undefined' ? files : []; }catch(e){ return []; } };
  function info(consent){ const f=curFile(), L=allFiles(); let technique='', format='';
    if (f){ try{ technique=(typeof NOME_IT!=='undefined' && NOME_IT[f.instr]) || f.instr || ''; }catch(e){ technique=f.instr||''; } const m=/\.([A-Za-z0-9]{1,8})$/.exec(String(f.name||'')); format=m?'.'+m[1].toLowerCase():''; }
    let plotLang=lang(); try{ if (typeof S!=='undefined' && S.lang) plotLang=S.lang; }catch(e){}
    const d=deskInfo||{};
    return {version:typeof APP_VERSION_FULL==='function' ? APP_VERSION_FULL() : '?', desktop:desk(), os:d.os, kind:d.kind, arch:d.arch, ua:win.navigator.userAgent, lang:lang(), plotLang,
      width:win.innerWidth, height:win.innerHeight, scale:win.devicePixelRatio||1, technique, format, nFiles:L.length, fileName:f?f.name:'', consent:!!consent,
      shown:context, entries:C.log.list(), files:C.fileNames(L)}; }

  function build(){
    const web=!desk();
    const ta=(id,label,ph)=>el('label',{class:'ibf'},el('span',{text:label}),el('textarea',{id,placeholder:ph,'data-noi18n':''}));
    const cv=el('canvas',{id:'rpCanvas','aria-label':'Anteprima dello screenshot'});
    dlg=el('dialog',{id:'dlgReport',class:'wide','aria-labelledby':'rpTitle'},el('div',{class:'dlg'},
      el('h2',{id:'rpTitle',text:web?'🐞 Segnala un problema':'Segnala un problema'}),
      el('p',{class:'why',text:web?'Il messaggio va a Lorenzo, che sviluppa Acchiappaspettri (lorenzo.birindelli@cnr.it). Lo invii tu dal tuo programma di posta: da qui non parte niente da solo.':'Il messaggio è indirizzato allo sviluppatore (lorenzo.birindelli@cnr.it). Lo invii tu dal tuo programma di posta: il programma non spedisce nulla da solo.'}),
      el('div',{class:'rpgrid'},ta('rpDoing','Cosa stavi facendo','Per esempio: avevo caricato tre spettri FTIR e stavo esportando il PDF'),ta('rpExpect','Cosa ti aspettavi e cosa è successo invece','Per esempio: mi aspettavo il PDF, è comparso un errore')),
      el('h4',{class:'anh',text:'Screenshot'}),
      el('p',{class:'why',id:'rpShotWhy',text:'L\'immagine mostra la finestra com\'era quando hai aperto la segnalazione, con gli spettri, i dati e i nomi visibili in quel momento. Trascina sull\'immagine per coprire le zone che non vuoi inviare.'}),
      el('div',{class:'rpshot',id:'rpShot'},cv),
      el('div',{class:'row',style:'margin:6px 0 10px'},el('label',{class:'check',style:'margin:0'},el('input',{type:'checkbox',id:'rpAttach'}),' Allega lo screenshot'),
        el('button',{type:'button',class:'btn small ghost',id:'rpUndo',text:'Annulla l\'ultima copertura'}),el('button',{type:'button',class:'btn small ghost',id:'rpClear',text:'Togli le coperture'})),
      el('h4',{class:'anh',text:'Dati tecnici inclusi nel messaggio'}),
      el('label',{class:'check',id:'rpNameBox'},el('input',{type:'checkbox',id:'rpName'}),el('span',{id:'rpNameLab'})),
      el('pre',{id:'rpTech','data-noi18n':''}),
      el('p',{class:'why',text:'Il messaggio non contiene i dati degli spettri né i percorsi dei file.'}),
      el('div',{class:'rpmsg',id:'rpMsg',role:'status','aria-live':'polite'}),
      el('div',{class:'row',id:'rpAfter',hidden:''},el('button',{type:'button',class:'btn small',id:'rpReveal',hidden:'',text:'Mostra nella cartella'}),el('button',{type:'button',class:'btn small ghost',id:'rpCopy',text:'Copia il testo del messaggio'})),
      el('div',{class:'actions'},el('button',{type:'button',class:'btn ghost',id:'rpCancel',text:'Chiudi'}),el('button',{type:'button',class:'btn primary',id:'rpSend',text:web?'Prepara la mail':'Prepara il messaggio'}))));
    doc.body.appendChild(dlg);
    $('#rpCancel').onclick=()=>dlg.close();
    $('#rpName').onchange=refreshTech; $('#rpAttach').onchange=()=>{ $('#rpShot').style.opacity=$('#rpAttach').checked?'':'0.45'; };
    $('#rpUndo').onclick=()=>{ rects.pop(); drawPreview(); }; $('#rpClear').onclick=()=>{ rects=[]; drawPreview(); };
    $('#rpSend').onclick=send; $('#rpCopy').onclick=()=>copy(lastText, true);
    // oscuramento: trascinare sull'anteprima disegna un rettangolo (coordinate dell'immagine, in px CSS della finestra)
    let start=null; const pos=e=>{ const b=cv.getBoundingClientRect(); return {x:(e.clientX-b.left)/b.width*shot.cssW, y:(e.clientY-b.top)/b.height*shot.cssH}; };
    cv.addEventListener('pointerdown',e=>{ if (!shot) return; e.preventDefault(); cv.setPointerCapture(e.pointerId); start=pos(e); rects.push({x:start.x,y:start.y,w:0,h:0}); });
    cv.addEventListener('pointermove',e=>{ if (!start) return; const p=pos(e), r=rects[rects.length-1]; r.w=p.x-start.x; r.h=p.y-start.y; drawPreview(); });
    cv.addEventListener('pointerup',()=>{ if (!start) return; start=null; const r=rects[rects.length-1]; if (Math.abs(r.w)<3 || Math.abs(r.h)<3) rects.pop(); drawPreview(); });
  }
  function redacted(){ const c=doc.createElement('canvas'); c.width=shot.width; c.height=shot.height; const g=c.getContext('2d'); g.drawImage(shot,0,0);
    if (rects.length){ const im=g.getImageData(0,0,c.width,c.height); C.blackout(im.data, c.width, c.height, rects.map(r=>({x:r.x*shot.k, y:r.y*shot.k, w:r.w*shot.k, h:r.h*shot.k}))); g.putImageData(im,0,0); }
    return c; }
  function drawPreview(){ const cv=$('#rpCanvas'); if (!shot){ cv.width=1; cv.height=1; return; } const s=Math.min(1, 1400/shot.width); cv.width=Math.round(shot.width*s); cv.height=Math.round(shot.height*s);
    cv.getContext('2d').drawImage(redacted(),0,0,cv.width,cv.height); }
  function refreshTech(){ const s=C.summary(info($('#rpName').checked)); $('#rpTech').textContent=s.head.concat(s.lines.length?[lang()==='en'?'Latest errors and warnings logged:':'Ultimi errori e avvisi registrati:',...s.lines]:[]).join('\n'); }

  async function open(ctx){
    context=ctx?plain(ctx):null;
    if (desk() && win.AcchDesktop && win.AcchDesktop.info) deskInfo=win.AcchDesktop.info;
    const note=$('#acchErrNote'); if (note) note.remove();
    // lo screenshot si prende prima di aprire la finestra: mostra il programma com'era
    shot=null; try{ shot=await capture(); }catch(e){ C.log.push('WARN','screenshot: '+(e&&e.message||e)); }
    if (!dlg) build(); rects=[]; lastText=''; $('#rpMsg').textContent=''; $('#rpAfter').hidden=true; $('#rpReveal').hidden=true; $('#rpSend').disabled=false;
    $('#rpAttach').checked=!!shot; $('#rpAttach').disabled=!shot; $('#rpShot').style.opacity=''; $('#rpShot').hidden=!shot;
    const f=curFile(); $('#rpName').checked=false; $('#rpNameBox').hidden=!f; $('#rpNameLab').textContent=f?' '+tr('Includi il nome del file aperto')+' («'+f.name+'»)':''; $('#rpNameLab').setAttribute('data-noi18n','');
    drawPreview(); refreshTech(); if (!dlg.open) dlg.showModal(); $('#rpDoing').focus(); return dlg; }

  /* ================= INVIO ================= */
  let lastText='';
  async function copy(text, say){ if (!text) return false; let ok=false; try{ await win.navigator.clipboard.writeText(text); ok=true; }catch(e){ ok=false; }
    if (say) msg(ok?tr('Testo del messaggio copiato negli appunti.'):tr('Non riesco a copiare negli appunti: seleziona il testo dei dati tecnici e copialo a mano.'), true); return ok; }
  function msg(t, keep){ const m=$('#rpMsg'); m.textContent=keep && m.textContent && !m.textContent.includes(t) ? m.textContent+' '+t : t; }
  const pngBytes=c=>new Promise(res=>c.toBlob(async b=>res(b?new Uint8Array(await b.arrayBuffer()):null),'image/png'));
  function fullText(m){ return m.subject+'\n\n'+m.body; }
  async function send(){
    const consent=$('#rpName').checked, attach=!!shot && $('#rpAttach').checked, name=C.shotName(new Date()), inf=info(consent);
    const base={version:inf.version, lang:inf.lang, desktop:inf.desktop, doing:$('#rpDoing').value.trim(), expect:$('#rpExpect').value.trim(), summary:C.summary(inf)};
    const btn=$('#rpSend'); btn.disabled=true; $('#rpAfter').hidden=true; $('#rpReveal').hidden=true; msg('');
    try{
      const png=attach ? await pngBytes(redacted()) : null, tau=T();
      if (tau){ const inv=tau.core.invoke;
        // Windows: prima Simple MAPI, con l'allegato; se non c'è o non riesce, mailto come sugli altri sistemi
        if (deskInfo && deskInfo.os==='windows'){ try{
            const att=png ? await inv('save_report_shot', png, {headers:{'x-acch-name':name,'x-acch-dest':'temp'}}) : null;
            const m=Object.assign({}, base, {shot:att?'attached':''}), sub=C.subject(m.version, m.lang), body=C.body(m);
            const r=await inv('send_report_mapi', {to:C.TO, subject:sub, body, attachment:att});
            lastText=sub+'\n\n'+body; $('#rpAfter').hidden=false;
            msg(r==='aborted' ? tr('Il programma di posta è stato chiuso senza inviare il messaggio.') : tr('Messaggio passato al programma di posta, con lo screenshot se l\'hai lasciato allegato. Controllalo e invialo da lì.'));
            return; }
          catch(e){ C.log.push('WARN','MAPI: '+String(e)); } }
        const path=png ? await inv('save_report_shot', png, {headers:{'x-acch-name':name,'x-acch-dest':'downloads'}}) : null, shown=path ? String(path).split(/[\\/]/).pop() : '';
        const m=C.mailto(Object.assign({}, base, {shot:shown})); lastText=fullText(Object.assign({}, m, {body:C.body(Object.assign({}, base, {shot:shown}))}));
        const copied=await copy(lastText, false);
        let opened=true; try{ await tau.opener.openUrl(m.url); }catch(e){ opened=false; C.log.push('WARN','mailto: '+String(e)); }
        $('#rpAfter').hidden=false;
        if (path){ const rb=$('#rpReveal'); rb.hidden=false; rb.onclick=()=>{ try{ tau.opener.revealItemInDir(path); }catch(e){ console.warn(e); } }; }
        msg(opened ? tr('Messaggio preparato nel programma di posta. Controllalo e invialo da lì.') : tr('Non si è aperto nessun programma di posta. Scrivi a lorenzo.birindelli@cnr.it e incolla il testo del messaggio.'));
        if (path) msg(tr('Lo screenshot è nella cartella Download')+' («'+shown+'»): '+tr('allegalo al messaggio.'), true);
        if (copied) msg(tr('Il testo completo è anche negli appunti.'), true);
        return; }
      // online: download dello screenshot e mailto
      if (png){ const a=el('a',{href:URL.createObjectURL(new Blob([png],{type:'image/png'})),download:name}); doc.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 4000); }
      const m=C.mailto(Object.assign({}, base, {shot:png?name:''})); lastText=fullText(Object.assign({}, m, {body:C.body(Object.assign({}, base, {shot:png?name:''}))}));
      const copied=await copy(lastText, false);
      let left=false; const away=()=>{ left=true; }; win.addEventListener('blur', away); doc.addEventListener('visibilitychange', away);
      const a=el('a',{href:m.url}); doc.body.appendChild(a); a.click(); a.remove(); win.ACCH_LAST_MAILTO=m.url;
      $('#rpAfter').hidden=false;
      msg(tr('Messaggio preparato nel programma di posta. Controllalo e invialo da lì.')+(png?' '+tr('Lo screenshot è nella cartella Download')+' («'+name+'»): '+tr('allegalo al messaggio.'):'')+(copied?' '+tr('Il testo completo è anche negli appunti.'):''));
      // nessun programma di posta: la pagina non perde mai il fuoco
      setTimeout(()=>{ win.removeEventListener('blur', away); doc.removeEventListener('visibilitychange', away); if (!left && dlg.open) msg(tr('Se non si è aperto nessun programma di posta, scrivi a lorenzo.birindelli@cnr.it e incolla il testo del messaggio.'), true); }, 2500);
    }catch(e){ console.error(e); msg(tr('Non sono riuscito a preparare il messaggio. Scrivi a lorenzo.birindelli@cnr.it e incolla il testo del messaggio.')); $('#rpAfter').hidden=false; }
    finally{ btn.disabled=false; } }

  /* ================= AVVISO DI ERRORE IMPREVISTO, con «Segnalalo» ================= */
  let lastNote=0;
  C.onUnexpected(ent=>{ if (!doc.body || (dlg && dlg.open) || Date.now()-lastNote<30000) return; lastNote=Date.now();
    const old=$('#acchErrNote'); if (old) old.remove(); const web=!desk();
    const n=el('div',{id:'acchErrNote',role:'alert'},el('span',{text:web?'😕 Qualcosa è andato storto: un errore imprevisto nel programma.':'Si è verificato un errore imprevisto nel programma.'}),
      el('button',{type:'button',class:'btn small primary',id:'acchErrReport',text:'Segnalalo',on:()=>open(ent?ent.msg:'')}),
      el('button',{type:'button',class:'btn small ghost',text:'Chiudi',on:()=>n.remove()}));
    doc.body.appendChild(n); setTimeout(()=>{ if (n.isConnected) n.remove(); }, 30000); });

  win.AcchSegnala={open, capture, get shot(){ return shot; }, get rects(){ return rects; }, set rects(v){ rects=v; drawPreview(); }, redacted:()=>shot?redacted():null, info};
})(window);
