/* Versione online più leggera. Chiude gli accessi che il CSS non può chiudere (palette, ricette, foto) e invita a mostrare il resto. Nessuna funzione rimossa. */
(function(win){ 'use strict';
  const root=win.document.documentElement; if (!root.classList.contains('web')) return;
  const $=s=>win.document.querySelector(s), KEY='acch.web.full', full=()=>root.classList.contains('web-full');
  const lsS=v=>{ try{ win.localStorage.setItem(KEY,JSON.stringify(v)); }catch(e){} };
  function show(on){ root.classList.toggle('web-full',on); lsS(on); const c=$('#stWebFull'); if (c) c.checked=on; if (typeof win.refreshAll==='function' && files.length) win.refreshAll(); }
  const MOVED=/falso colore|composizione xrf|spessore di uno strato|scomponi come miscela|composizione in %|raggruppa i campioni|stima della composizione/i;
  const c0=win.commands, r0=win.recipesFor, a0=win.askImages;
  if (c0) win.commands=function(){ const C=c0.apply(this,arguments); return full()?C:C.filter(c=>!MOVED.test(c.label)); };
  if (r0) win.recipesFor=function(){ const R=r0.apply(this,arguments); return full()?R:R.filter(r=>!MOVED.test(r[1])); };
  /* una foto trascinata online: apre comunque, altrimenti il file sparirebbe nel nulla */
  if (a0) win.askImages=function(){ if (!full()) show(true); return a0.apply(this,arguments); };
  function invite(){ const d=win.document.createElement('div'); d.className='webinv'; const t=win.document.createElement('span'); t.textContent='Tarature, PCA, miscele, composizione XRF e falsi colori sono per il lavoro di studio.'; const a=win.document.createElement('button'); a.type='button'; a.className='btn small'; a.textContent='Mostra qui'; a.onclick=()=>show(true); const b=win.document.createElement('button'); b.type='button'; b.className='btn small ghost'; b.textContent='Versione desktop'; b.onclick=()=>win.AcchUi.openDownload(); d.append(t,a,b); return d; }
  const refs=$('[data-panel="refs"]'), multi=$('#secMulti'), cult=$('#secCult');
  if (refs) refs.appendChild(invite()); if (multi) multi.appendChild(invite());
  let invX=null; if (cult && cult.parentNode){ invX=invite(); invX.hidden=true; cult.parentNode.insertBefore(invX,cult); }
  /* un progetto che usa queste funzioni le mostra da solo: nessun risultato deve sparire in silenzio */
  const usesMoved=()=>files.some(f=>f.an&&(f.an.fp||f.an.conc!=null||f.an.std||f.an.mixW)) || Object.values(MV).some(m=>m&&m.model==='pls');
  const o=win.addEntries; if (o) win.addEntries=async function(){ const r=await o.apply(this,arguments); try{ if (invX) invX.hidden=!files.some(f=>f.instr==='xrf'); if (!full() && usesMoved()){ root.classList.add('web-full'); win.toast('Questo lavoro usa funzioni avanzate: le ho mostrate.'); } }catch(e){ console.error(e); } return r; };
  const st=$('#stWeb'); if (st){ const l=win.document.createElement('label'); l.className='check'; l.style.display='block'; l.style.marginTop='6px'; const c=win.document.createElement('input'); c.type='checkbox'; c.id='stWebFull'; c.checked=full(); c.onchange=()=>show(c.checked); l.append(c,' Mostra le funzioni avanzate anche online'); st.appendChild(l); }
})(window);
