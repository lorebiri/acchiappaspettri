/* Interfaccia dell'app desktop: spazio di lavoro scientifico. Attiva solo con html.shell (vedi shell-boot.js): la pagina online non cambia.
   Criterio (docs/ARCHITETTURA.md): i blocchi principali restano al loro posto nel documento e vengono collocati dal CSS, così selettori, modalità di confronto,
   rendering pigro e tre viste restano quelli della pagina; si spostano solo elementi foglia per id. Nessun calcolo è qui. */
(function(win){
  'use strict';
  if (!win.ACCH_SHELL) return;
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)], el=(t,a,...k)=>{ const e=document.createElement(t); for (const n in (a||{})){ if (n==='on') continue; if (n==='html') e.innerHTML=a[n]; else e.setAttribute(n,a[n]); } if (a&&a.on) e.addEventListener('click',a.on); k.forEach(x=>x!=null&&e.append(x)); return e; };
  const lsG=(k,d)=>{ try{ const v=JSON.parse(localStorage.getItem(k)); return v==null?d:v; }catch(e){ return d; } }, lsS=(k,v)=>{ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} };
  const tr=s=>win.AcchI18n&&win.AcchI18n.lang==='en'?win.AcchI18n.tr(s):s;

  /* icone a tratto: griglia 16, colore del testo */
  const P={new:'M4 1.5h5.5L13 5v9.5H4zM9.5 1.5V5H13',open:'M1.5 13V3.5h4l1.5 2h7.5V13zM1.5 7.5h13',save:'M2.5 2.5h9l2 2v9h-11zM5 2.5v4h6v-4M5 13.5V9.5h6v4',add:'M8 3v10M3 8h10',export:'M8 10V2M5 5l3-3 3 3M2.5 9.5v4h11v-4',prev:'M10 3L5 8l5 5',next:'M6 3l5 5-5 5',zin:'M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM14 14l-3.5-3.5M7 5v4M5 7h4',zout:'M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM14 14l-3.5-3.5M5 7h4',zfit:'M2 5.5V2h3.5M10.5 2H14v3.5M14 10.5V14h-3.5M5.5 14H2v-3.5',zrect:'M3 3h10v10H3z',focus:'M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10',search:'M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM14 14l-3.5-3.5',settings:'M8 10.2A2.2 2.2 0 1 0 8 5.8a2.2 2.2 0 0 0 0 4.4zM8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4',graph:'M2 2v12h12M4 11c1.5 0 2-6 3-6s1.4 4 2.4 4 1.1-2 2.6-2',sheet:'M2 2.5h12v11H2zM2 6h12M2 9.5h12M6.5 2.5v11',study:'M3 13V8M8 13V3M13 13V6M1.5 13.5h13',peak:'M1.5 13.5h13M3 13.5C5.5 13.5 6 3 8 3s2.5 10.5 5 10.5',process:'M2 11c2-6 3-7 4-3s2 3 3 1 2-4 5-6',info:'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM8 7v4M8 4.6v.6',ref:'M3 2.5h8l2 2v9H3zM5.5 6.5h5M5.5 9h5',analyse:'M6 2v5l-3 6h10l-3-6V2M5 2h6',panelL:'M1.5 3h13v10h-13zM5.5 3v10',panelR:'M1.5 3h13v10h-13zM10.5 3v10',panelB:'M1.5 3h13v10h-13zM1.5 9.5h13',compare:'M2 5c2 0 3-2 4-2s2 2 4 2 3-1 4-1M2 11c2 0 3-2 4-2s2 2 4 2 3-1 4-1',home:'M2 8l6-5.5L14 8M4 7v6.5h8V7'};
  const ic=n=>`<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="${P[n]||''}"/></svg>`;
  const btn=(id,icon,title,fn,label)=>el('button',{id,type:'button',class:'shb'+(label?' lab':''),title,'aria-label':title,html:ic(icon)+(label?`<span>${label}</span>`:''),on:fn});

  /* ---- elementi nuovi: tutti fuori da <main> ---- */
  const app=el('div',{id:'shApp'}), tool=el('div',{id:'shTool',role:'toolbar'}), tabsBar=el('div',{id:'shTabs',role:'tablist'}), bottom=el('section',{id:'shBottom','aria-label':'Risultati'}), status=el('footer',{id:'shStatus'}), sheet=el('div',{id:'shSheet',class:'shcenter'}), study=el('div',{id:'shStudy',class:'shcenter'});
  const splitL=el('div',{id:'shSplitL',class:'shsplit v',role:'separator'}), splitR=el('div',{id:'shSplitR',class:'shsplit v',role:'separator'}), splitB=el('div',{id:'shSplitB',class:'shsplit h',role:'separator'});
  app.append(tool,tabsBar,bottom,status,sheet,study,splitL,splitR,splitB); document.body.insertBefore(app,document.body.firstChild);

  /* schede dei documenti al centro */
  const DOC={}, addDoc=(id,icon,label)=>{ const b=el('button',{type:'button',class:'shtab',role:'tab','data-doc':id,html:ic(icon)+`<span>${label}</span>`,on:()=>showDoc(id)}); tabsBar.append(b); DOC[id]=b; };
  addDoc('start','home','Inizio'); addDoc('graph','graph','Grafico'); addDoc('sheet','sheet','Foglio dati'); addDoc('study','study','Più campioni'); addDoc('export','export','Esporta');
  const titleSlot=el('div',{id:'shDocTitle'}); tabsBar.append(el('span',{class:'spacer'}),titleSlot); titleSlot.append($('#pvTitle')); $('#pvTitle').setAttribute('data-noi18n','');

  /* studio su più campioni: pagina intera. Il pannello cambia solo contenitore */
  const multi=$('.panel[data-panel="multi"]'); study.append(multi); $('#secMulti').open=true;

  /* ispettore: le schede esistenti con icone e nomi brevi */
  const tabIcon={peaks:'peak',proc:'process',zone:'info',refs:'ref',an:'analyse'}, tabLabel={peaks:'Picchi',proc:'Elabora',zone:'Dati',refs:'Riferimenti',an:'Analisi'};
  $$('#tabs .tab').forEach(t=>{ const k=t.dataset.tab; t.innerHTML=ic(tabIcon[k]||'info')+`<span>${tabLabel[k]||t.textContent}</span>`; t.title=tabLabel[k]||''; });
  $('#saveProjBtn').hidden=true;

  /* risultati in basso: tabelle che chiedono larghezza. Si spostano solo i contenitori foglia */
  const resTabs=el('div',{id:'shResTabs',role:'tablist'}), resBody=el('div',{id:'shResBody'}), RES={};
  const addRes=(id,label,nodes)=>{ const b=el('button',{type:'button',class:'shrt','data-res':id,on:()=>showRes(id)},label); resTabs.append(b); const box=el('div',{class:'shres','data-res':id}); nodes.forEach(n=>n&&box.append(n)); resBody.append(box); RES[id]={b,box}; };
  const log=el('div',{id:'shLog'}), cmpNote=el('div',{id:'shCmpNote',class:'pkempty'},'Questi risultati riguardano un solo spettro: nel confronto non si mostrano. Passa a «Singolo».');
  addRes('peaks','Picchi',[$('.panel[data-panel="peaks"] .pktools'),$('#pkTable').closest('.pkwrap')]);
  addRes('qual','Controllo del dato',[$('#anQual')]);
  addRes('hyp','Ipotesi',[$('#anHypWhy'),$('#anHyp')]);
  addRes('fit','Deconvoluzione',[$('#fitOut')]);
  addRes('tech','Parametri',[$('#anTech')]);
  addRes('log','Messaggi',[log]);
  resBody.append(cmpNote);
  resTabs.append(el('span',{class:'spacer'}),btn('shResToggle','panelB','Mostra o nascondi i risultati',()=>togglePane('bottom')));
  bottom.append(resTabs,resBody);

  /* barra di stato */
  const stMsg=el('div',{id:'shMsg',class:'st grow',title:'Clic: tutti i messaggi',on:()=>{ showPane('bottom',true); showRes('log'); }}), stXY=el('div',{id:'shXY',class:'st num','data-noi18n':''}), stRange=el('div',{id:'shRange',class:'st'}), stChain=el('div',{id:'shChain',class:'st','data-noi18n':''}), stIncl=el('div',{id:'shIncl',class:'st'}), stSave=el('div',{id:'shSaved',class:'st'});
  status.append(stMsg,stXY,stRange,stChain,stIncl,stSave);

  /* barra degli strumenti: comandi e, a destra, ricerca e pannelli */
  const act={ cmdNew:()=>win.AcchProject.newProject(), cmdOpen:()=>win.AcchDesktop&&win.AcchDesktop.openDialog?win.AcchDesktop.openDialog():$('#openProjIn').click(), cmdSave:()=>win.AcchProject.save() };
  const sep=()=>el('span',{class:'shsep'});
  const seg=$('#viewSeg');
  $$('#viewSeg button').forEach(b=>{ const v=b.dataset.v; b.innerHTML=ic(v==='cmp'?'compare':'graph')+`<span>${v==='cmp'?'Confronto':'Singolo'}</span>`; });
  tool.append(btn('tbNew','new','Nuovo progetto',act.cmdNew),btn('tbOpen','open','Apri progetto',act.cmdOpen),btn('tbSave','save','Salva progetto',act.cmdSave),sep(),
    btn('tbLoad','add','Aggiungi spettri',()=>$('#inFiles').click(),'Aggiungi spettri'),btn('tbExport','export','Esporta: PDF, immagini, dati',()=>showDoc('export'),'Esporta'),sep(),
    btn('tbPrev','prev','Spettro precedente',()=>$('#prevF').click()),btn('tbNext','next','Spettro successivo',()=>$('#nextF').click()),sep(),
    seg,sep(),
    btn('tbZin','zin','Ingrandisci',()=>$('#zIn').click()),btn('tbZout','zout','Rimpicciolisci',()=>$('#zOut').click()),btn('tbZfit','zfit','Mostra tutto (0)',()=>$('#zReset').click()),btn('tbZrect','zrect','Ingrandisci una zona (R)',()=>$('#lassoBtn').click()),sep(),
    btn('tbFocus','focus','Solo il grafico (F)',()=>toggleFocus()),
    el('span',{class:'spacer'}),$('#cmdBtn'),sep(),
    btn('tbLeft','panelL','Mostra o nascondi gli spettri',()=>togglePane('left')),btn('tbBottom','panelB','Mostra o nascondi i risultati',()=>togglePane('bottom')),btn('tbRight','panelR','Mostra o nascondi l\'ispettore',()=>togglePane('right')),sep(),
    btn('tbSettings','settings','Impostazioni',()=>win.AcchUi.openSettings()));

  /* ---- documenti ---- */
  const root=document.documentElement; let docNow='start';
  function mark(){ root.dataset.doc=docNow; for (const k in DOC){ DOC[k].classList.toggle('on',k===docNow); DOC[k].setAttribute('aria-selected',k===docNow); DOC[k].disabled=k!=='start'&&!files.length; } multi.classList.toggle('on',docNow==='study'); $('#tbExport').disabled=!files.length; }
  const oGo=win.go;
  win.go=function(n){ oGo(n); if (curView===1) docNow='start'; else if (curView===3) docNow='export'; else if (docNow==='start'||docNow==='export') docNow='graph'; mark(); if (curView===2) resize(); };
  function showDoc(id){ if (id!=='start'&&!files.length) return; if (id==='start'){ go(1); return; } if (id==='export'){ go(3); return; } docNow=id; if (curView!==2) go(2); docNow=id; mark();
    if (id==='study'){ if (files[cur]) $('#mvInstr').value=files[cur].instr; try{ renderMulti(); }catch(e){ console.error(e); } }
    if (id==='sheet') renderSheet(); if (id==='graph') resize(); }
  $$('[data-go]').forEach(b=>{ const n=+b.dataset.go; b.addEventListener('click',()=>{ if (curView===n) mark(); }); });
  const oOpen=win.openTab; win.openTab=function(name){ const r=oOpen(name); if (name==='multi') showDoc('study'); else { if (docNow==='start'&&files.length) showDoc('graph'); multi.classList.toggle('on',docNow==='study'); } return r; };
  const oAdd=win.addEntries; win.addEntries=async function(){ const r=await oAdd.apply(this,arguments); if (files.length&&docNow==='start') showDoc('graph'); mark(); return r; };
  const oView=win.setView; win.setView=function(m){ const r=oView(m); app.classList.toggle('cmp',m==='cmp'); if (m==='cmp'&&docNow!=='graph'&&files.length) showDoc('graph'); return r; };
  const oReveal=win.reveal; win.reveal=function(sel){ const t=typeof sel==='string'?$(sel):sel; if (t&&t.closest){ const res=t.closest('.shres'); if (res){ showPane('bottom',true); showRes(res.dataset.res); return; } if (t.closest('#shStudy')) showDoc('study'); } return oReveal(sel); };
  win.startTour=function(){ if (typeof showKeys==='function') showKeys(); };   // il giro della pagina indica elementi che qui non esistono

  /* ---- risultati ---- */
  function showRes(id){ for (const k in RES){ const on=k===id; RES[k].b.classList.toggle('on',on); RES[k].b.setAttribute('aria-selected',on); RES[k].box.classList.toggle('on',on); } lsS('acch.sh.res',id); refreshResults(); }
  function refreshResults(){ const id=Object.keys(RES).find(k=>RES[k].box.classList.contains('on')); if (['qual','hyp','fit','tech'].includes(id)&&files[cur]&&viewMode!=='cmp'&&curView===2){ try{ renderAnalysis(); }catch(e){ console.error(e); } } }

  /* ---- pannelli ---- */
  const PANES={left:{v:'--L',def:250,min:180,max:420},right:{v:'--R',def:340,min:280,max:560},bottom:{v:'--B',def:210,min:90,max:700}};
  const sizeOf=k=>{ const w=win.innerWidth,h=win.innerHeight,p=PANES[k]; let d=p.def; if (k==='left'&&w<1440) d=w<1320?200:240; if (k==='right'&&w<1440) d=w<1320?280:320; if (k==='bottom') d=h<860?160:h<1000?200:240; return lsG('acch.sh.'+k,d); };
  function applySizes(){ const foc=app.classList.contains('focus'); for (const k in PANES){ const off=foc||lsG('acch.sh.'+k+'.off',false); root.style.setProperty(PANES[k].v,(k==='bottom'&&off&&!foc?28:off?0:sizeOf(k))+'px'); app.classList.toggle('no-'+k,!!off); root.classList.toggle('no-'+k,!!off); } resize(); }
  function showPane(k,on){ lsS('acch.sh.'+k+'.off',!on); applySizes(); }
  function togglePane(k){ showPane(k,!!lsG('acch.sh.'+k+'.off',false)); }
  function toggleFocus(on){ const v=on==null?!app.classList.contains('focus'):on; app.classList.toggle('focus',v); root.classList.toggle('focus',v); $('#tbFocus').classList.toggle('on',v); applySizes(); }
  let rT=null; function resize(){ cancelAnimationFrame(rT); rT=requestAnimationFrame(()=>{ if (docNow==='graph'&&curView===2){ try{ renderPreview(); }catch(e){ console.error(e); } } if (docNow==='sheet') paintSheet(); }); }
  function bindSplit(s,k,axis,sign){ const p=PANES[k]; s.addEventListener('pointerdown',e=>{ e.preventDefault(); s.setPointerCapture(e.pointerId); const c0=axis==='x'?e.clientX:e.clientY, v0=sizeOf(k); let v=v0;
      const mv=ev=>{ v=Math.max(p.min,Math.min(p.max,v0+sign*((axis==='x'?ev.clientX:ev.clientY)-c0))); root.style.setProperty(p.v,v+'px'); };
      const up=()=>{ s.removeEventListener('pointermove',mv); s.removeEventListener('pointerup',up); lsS('acch.sh.'+k,Math.round(v)); resize(); }; s.addEventListener('pointermove',mv); s.addEventListener('pointerup',up); });
    s.addEventListener('dblclick',()=>{ try{ localStorage.removeItem('acch.sh.'+k); }catch(e){} applySizes(); }); }
  bindSplit(splitL,'left','x',1); bindSplit(splitR,'right','x',-1); bindSplit(splitB,'bottom','y',-1);
  new ResizeObserver(()=>resize()).observe($('#pvWrap'));
  win.addEventListener('resize',applySizes);
  win.setBig=function(){ toggleFocus(); };
  win.addEventListener('keydown',e=>{ if (e.key==='Escape'&&app.classList.contains('focus')&&!document.querySelector('dialog[open]')) toggleFocus(false); });

  /* ---- messaggi: nella barra di stato, con storia; gli avvisi restano anche visibili ---- */
  function pushMsg(t){ if (!t) return; const clean=String(t).replace(/[\p{Extended_Pictographic}️]/gu,'').replace(/\s+/g,' ').trim(); if (!clean) return; stMsg.textContent=clean; stMsg.title=clean; const r=el('div',{class:'lg'},el('span',{class:'t','data-noi18n':''},new Date().toTimeString().slice(0,8)),el('span',{},clean)); log.prepend(r); while (log.childNodes.length>200) log.lastChild.remove(); }
  const oToast=win.toast, oSay=win.say;
  win.say=function(sel,txt){ oSay(sel,txt); pushMsg(txt); };
  win.toast=function(txt){ pushMsg(txt); if (/😕|⚠️/.test(String(txt))) oToast(txt); };

  /* ---- dopo ogni disegno ---- */
  const oPrev=win.renderPreview; let aT=null;
  win.renderPreview=function(){ const r=oPrev.apply(this,arguments); updateStatus(); $$('#pkTable input[placeholder]').forEach(i=>{ const v=i.placeholder.replace(/[\p{Extended_Pictographic}\uFE0F]/gu,'').trim(); if (v!==i.placeholder) i.placeholder=v; }); clearTimeout(aT); aT=setTimeout(()=>{ refreshResults(); if (docNow==='sheet') renderSheet(); },80); return r; };
  function updateStatus(){ const f=files[cur]; stIncl.textContent=files.length?tr('{0} di {1} inclusi').replace('{0}',files.filter(g=>g.include).length).replace('{1}',files.length):''; mark();
    if (!f||viewMode==='cmp'){ stChain.textContent=''; stRange.textContent=''; return; }
    const it=f.instr; stChain.textContent=[NOME_IT[it]||it, S.conv[it]&&S.conv[it]!=='orig'?S.conv[it]:null, S.base[it]&&S.base[it]!=='none'?S.base[it]:null, +S.smooth[it]?'SG'+S.smooth[it]:null, +S.deriv[it]?'d'+S.deriv[it]:null, S.spike[it]?'despike':null].filter(Boolean).join(' · ');
    const z=f._zoom; stRange.textContent=z?`${tr('Vista')}: ${fmtV(z[0])} – ${fmtV(z[1])} (${tr('solo anteprima')})`:''; }
  win.AcchProject.onChange(i=>{ stSave.textContent=i.hasFiles||i.path?(i.dirty?tr('Modificato'):(i.path?tr('Salvato'):tr('Non salvato'))):''; stSave.classList.toggle('warn',i.dirty); const n=$('#shProject'); if (n){ n.textContent=(i.dirty?'• ':'')+i.name; n.title=i.path||''; } });
  $('#filesCard').prepend(el('div',{class:'shhead'},'Progetto'),el('div',{id:'shProject','data-noi18n':''}));
  $('#filesCard').insertBefore(el('div',{class:'shhead'},'Spettri'),$('#filesCard').querySelector('.row'));

  /* ---- cursore: mirino e valori dalle scale del grafico; sul livello che non viene mai esportato ---- */
  let mouse=null; const pvEl=$('#pv'), pvoEl=$('#pvo');
  function fmtV(v){ if (!isFinite(v)) return '—'; const a=Math.abs(v); return (a>=1e6||(a<1e-3&&a!==0))?v.toExponential(3):String(+v.toPrecision(6)).replace('.',T_().dec); }
  pvEl.addEventListener('mousemove',e=>{ try{ mouse=mmPos(e); drawOverlay(); }catch(err){} });
  pvEl.addEventListener('mouseleave',()=>{ mouse=null; stXY.textContent=''; drawOverlay(); });
  const oOv=win.drawOverlay; win.drawOverlay=function(){ oOv(); paintCursor(); };
  function paintCursor(){ if (!geo||!mouse||lassoOn||!pvView) return; const [mx,my]=mouse; if (mx<geo.px0||mx>geo.px0+geo.pw||my<geo.py0||my>geo.py0+geo.ph){ stXY.textContent=''; return; }
    const it=pvView.instr, unit=it&&INSTR[it]?INSTR[it].xPdf.replace('cm-1','cm⁻¹'):''; stXY.textContent=`x ${fmtV(xAt(mx))} ${unit}   y ${fmtV(yAt(my))}`;
    const c=pvoEl.getContext('2d'); c.save(); c.setTransform(pvoEl.width/PV_W,0,0,pvoEl.height/PV_H,0,0); c.strokeStyle='#5f6b7a'; c.lineWidth=0.12; c.setLineDash([0.45,0.45]); c.beginPath(); c.moveTo(mx,geo.py0); c.lineTo(mx,geo.py0+geo.ph); c.moveTo(geo.px0,my); c.lineTo(geo.px0+geo.pw,my); c.stroke(); c.restore(); }

  /* ---- foglio dati: valori originali e valori come visualizzati, a piena precisione ---- */
  const shHead=el('div',{id:'shSheetBar'}), shGrid=el('div',{id:'shGrid',tabindex:'0'}), shIn=el('div',{id:'shGridIn'}), shRows=el('div',{id:'shGridRows'}); shIn.append(shRows); shGrid.append(shIn); sheet.append(shHead,shGrid); const ROW=22; let shData=null;
  function sheetData(f){ const Q=processed(f), same=Q.xs.length===f.xs.length, I=INSTR[f.instr]||{}, unit=(I.xPdf||'x').replace('cm-1','cm⁻¹'), cols=[['#',i=>i+1],[`x (${unit})`,i=>f.xs[i]],[tr('y originale'),i=>f.ys[i]]]; if (same) cols.push([tr('y elaborato'),i=>Q.ys[i]]); else cols.push([`x ${tr('elaborato')}`,i=>Q.xs[i]],[tr('y elaborato'),i=>Q.ys[i]]); return {n:Math.max(Q.xs.length,f.xs.length),cols}; }
  function renderSheet(){ const f=files[cur]; shHead.innerHTML=''; if (!f){ shData=null; shRows.innerHTML=''; shIn.style.height='0'; return; } shData=sheetData(f); shHead.append(el('b',{'data-noi18n':''},dispTitle(f)),el('span',{class:'opt-l'},`  ${shData.n} ${tr('punti')}`),el('span',{class:'spacer'}),el('button',{type:'button',class:'btn small ghost',on:copySheet},tr('Copia tutto')),el('button',{type:'button',class:'btn small ghost',on:()=>win.download(new Blob([sheetText(',')],{type:'text/csv'}),(f.name||'dati').replace(/\.[^.]+$/,'')+'_dati.csv')},'CSV')); shIn.style.height=((shData.n+1)*ROW)+'px'; paintSheet(); }
  function paintSheet(){ if (!shData) return; const top=shGrid.scrollTop,h=shGrid.clientHeight||400,a=Math.max(0,Math.floor(top/ROW)-5),b=Math.min(shData.n,a+Math.ceil(h/ROW)+10),cols=shData.cols,tpl=`style="grid-template-columns:70px repeat(${cols.length-1},minmax(150px,240px))"`; let html=`<div class="shrow head" ${tpl} style="top:${top}px">`; html=`<div class="shrow head" style="top:${top}px;grid-template-columns:70px repeat(${cols.length-1},minmax(150px,240px))">${cols.map(c=>`<span>${win.esc(c[0])}</span>`).join('')}</div>`; for (let i=a;i<b;i++) html+=`<div class="shrow" style="top:${(i+1)*ROW}px;grid-template-columns:70px repeat(${cols.length-1},minmax(150px,240px))">${cols.map(c=>{ const v=c[1](i); return `<span>${v==null?'':win.esc(String(v))}</span>`; }).join('')}</div>`; shRows.innerHTML=html; }
  shGrid.addEventListener('scroll',paintSheet);
  function sheetText(sp){ const c=shData.cols,L=[c.map(x=>x[0]).join(sp)]; for (let i=0;i<shData.n;i++) L.push(c.map(x=>{ const v=x[1](i); return v==null?'':String(v); }).join(sp)); return L.join('\n'); }
  async function copySheet(){ try{ await navigator.clipboard.writeText(sheetText('\t')); pushMsg(tr('Dati copiati negli appunti.')); }catch(e){ pushMsg(tr('Non riesco a copiare negli appunti.')); } }

  win.AcchShell={showDoc,showRes,showPane,togglePane,toggleFocus,pushMsg,get doc(){ return docNow; },act};
  /* avvio */
  applySizes(); mark(); showRes(lsG('acch.sh.res','peaks')); updateStatus(); pushMsg('Pronto');
})(window);
