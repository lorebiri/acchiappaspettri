// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Versione online più leggera. Chiude gli accessi che il CSS non può chiudere (palette, ricette, foto) e invita a mostrare il resto. Nessuna funzione rimossa. */
(function(win){ 'use strict';
  const root=win.document.documentElement; if (!root.classList.contains('web')) return;
  const $=s=>win.document.querySelector(s), KEY='acch.web.full', full=()=>root.classList.contains('web-full');
  const lsS=v=>{ try{ win.AcchHost.store.setItem(KEY,JSON.stringify(v)); }catch(e){} };
  win.AcchWebShow=()=>{ if (!full()){ root.classList.add('web-full'); sync(); } };   // per questa sessione, senza cambiare la preferenza
  const TXT=[]; function sync(){ const c=$('#stWebFull'); if (c) c.checked=full(); TXT.forEach(([e,a,b])=>{ e.textContent=full()?a:b; }); }
  function show(on){ root.classList.toggle('web-full',on); lsS(on); sync(); if (typeof win.refreshAll==='function' && files.length) win.refreshAll(); }
  const MOVED=/falso colore|composizione xrf|spessore di uno strato|scomponi come miscela|composizione in %|raggruppa i campioni|stima della composizione|taratura|\bpca\b/i;
  const c0=win.commands, r0=win.recipesFor, a0=win.askImages;
  if (c0) win.commands=function(){ const C=c0.apply(this,arguments); return full()?C:C.filter(c=>!MOVED.test(c.label)); };
  if (r0) win.recipesFor=function(){ const R=r0.apply(this,arguments); return full()?R:R.filter(r=>!MOVED.test(r[1])); };
  /* una foto trascinata online: apre comunque, altrimenti il file sparirebbe nel nulla */
  if (a0) win.askImages=function(){ root.classList.add('web-full'); sync(); return a0.apply(this,arguments); };
  const g0=win.go2; if (g0) win.go2=function(sel){ if (!full() && typeof sel==='string' && /secCult|xqBox|mix|pcOut|plsOut/.test(sel)){ root.classList.add('web-full'); sync(); } return g0.apply(this,arguments); };
  function invite(){ const d=win.document.createElement('div'); d.className='webinv'; const t=win.document.createElement('span'); t.textContent='Tarature, PCA, miscele, composizione XRF e falsi colori sono per il lavoro di studio.'; const a=win.document.createElement('button'); a.type='button'; a.className='btn small'; a.textContent='Mostra qui'; a.onclick=()=>show(true); const b=win.document.createElement('button'); b.type='button'; b.className='btn small ghost'; b.textContent='Versione desktop'; b.onclick=()=>win.AcchUi.openDownload(); d.append(t,a,b); return d; }
  const refs=$('[data-panel="refs"]'), multi=$('#secMulti'), cult=$('#secCult');
  if (refs) refs.appendChild(invite()); if (multi) multi.appendChild(invite());
  let invX=null; if (cult && cult.parentNode){ invX=invite(); invX.hidden=true; cult.parentNode.insertBefore(invX,cult); }
  { const t=multi&&multi.querySelector('summary b'); if (t&&t.firstChild){ TXT.push([t.firstChild,t.firstChild.textContent,'📊 Più campioni: misura la stessa banda ']); } const h4=multi&&[...multi.querySelectorAll('h4')].find(h=>/retta di taratura/.test(h.textContent)); if (h4&&h4.firstChild&&h4.firstChild.nodeType===3) TXT.push([h4.firstChild,h4.firstChild.textContent,'📏 Misura di banda ']); const w=multi&&multi.querySelector('.why'); if (w) TXT.push([w,w.textContent,'Misura la stessa banda su tutti gli spettri di uno strumento e confronta i valori.']); sync(); }
  /* un progetto che usa queste funzioni le mostra da solo: nessun risultato deve sparire in silenzio */
  let first=true; const usesMoved=()=>(win.AcchProject.prevResults?win.AcchProject.prevResults():[]).some(r=>/pca|pls|miscel|mix|composiz|fundamental|parametri_fond|spessor|layer/i.test(r.name)) || files.some(f=>f.an&&(f.an.fp||f.an.conc!=null||f.an.std||f.an.mixW)) || Object.values(MV).some(m=>m&&m.model==='pls');
  const o=win.addEntries; if (o) win.addEntries=async function(){ const r=await o.apply(this,arguments); try{ if (invX) invX.hidden=!files.some(f=>f.instr==='xrf'); if (!full() && usesMoved()){ root.classList.add('web-full'); sync(); win.setTimeout(()=>win.toast('Questo lavoro usa funzioni avanzate: le ho mostrate.'),1600); } if (first && files.length && curView===1 && !win.ACCH_PENDING_MEM){ first=false; win.go(2); } }catch(e){ console.error(e); } return r; };
  try{ win.AcchHost.store.setItem('acch.tourDone','true'); }catch(e){}   // online si parte subito: il giro resta nel menu
  const st=$('#stWeb'); if (st){ const l=win.document.createElement('label'); l.className='check'; l.style.display='block'; l.style.marginTop='6px'; const c=win.document.createElement('input'); c.type='checkbox'; c.id='stWebFull'; c.checked=full(); c.onchange=()=>show(c.checked); l.append(c,' Mostra le funzioni avanzate anche online'); st.appendChild(l); }
})(window);
/* Revisione online «immediatezza e chiarezza» (docs/revisione-online/LEGGIMI.md): solo testi brevi e ordine dei pannelli, nessuna funzione nuova, nessun calcolo toccato.
   I testi sono in italiano come il resto della pagina; l'inglese è in i18n/en-app.json e passa dal dizionario come tutti gli altri. */
(function(win){ 'use strict';
  const doc=win.document, root=doc.documentElement; if (!root.classList.contains('web')) return;
  const $=s=>doc.querySelector(s);
  const mk=(tag, cls, text)=>{ const e=doc.createElement(tag); if (cls) e.className=cls; if (text!=null) e.textContent=text; return e; };
  const put=(el, text)=>{ if (el) el.textContent=text; };
  /* 1. Il riquadro «Due modi»: online si sta già usando la versione online, quindi niente secondo pulsante primario in cima.
        Diventa una nota discreta dopo l'area di caricamento, con il solo invito all'app desktop. */
  const box=$('#entryBox');
  if (box){ box.classList.add('webentry'); const t=box.querySelector('.entrytxt');
    if (t){ put(t.querySelector('b'),'Ti serve anche senza internet?'); put(t.querySelector('small'),"C'è l'app per Windows, macOS e Linux, con le stesse funzioni. In entrambi i casi i dati restano sul tuo computer."); }
    put($('#entryDesktop'),"🖥️ Scarica l'app desktop");
    const card=$('#v1 > .card'); if (card && card.parentNode===box.parentNode) card.after(box); }
  /* 2. L'area di caricamento dice subito cosa fare */
  const drop=$('#drop');
  if (drop){ put(drop.querySelector('.big'),'Carica i tuoi spettri');
    const or=[...drop.children].find(e=>e.matches('div') && /^\s*oppure\s*$/i.test(e.textContent)); if (or){ or.classList.add('webor'); or.textContent='Trascinali qui, anche una cartella intera, oppure:'; } }
  /* 3. Il percorso in tre passi, breve, al posto delle tre liste lunghe (che restano nel codice e nel desktop) */
  const how=$('#howto');
  if (how){ const p=mk('div','webpath');
    const S=[['1','Carica','Trascina i file: riconosco da solo lo strumento (FTIR, Raman, UV-Vis, XRF, HPLC…).'],
             ['2',"Controlla e analizza",'Picchi con i nomi suggeriti, confronti, controllo del dato e analisi per tecnica.'],
             ['3','Leggi e scarica',"Il risultato è subito accanto al grafico; poi PDF, immagini per le riviste ed elenco dei picchi."]];
    for (const [n,t,d] of S){ const s=mk('div','webstep'), w=mk('div'); w.append(mk('b',null,t), mk('small',null,d)); s.append(mk('span','webn',n), w); p.appendChild(s); }
    how.after(p); if (win.AcchI18n && win.AcchI18n.apply) win.AcchI18n.apply(p); }
  /* 4. Passo 2: «Analisi» subito dopo «Picchi». Cambia solo l'ordine a vista (CSS): DOM, scorciatoie e giro guidato restano quelli del desktop. */
  const tabs=$('#tabs'); if (tabs) tabs.classList.add('webtabs');
  /* 5. Primo consiglio del passo 2: valido su ogni schermo (su quelli larghi gli strumenti sono accanto al grafico, non sotto) e indica dove scegliere l'analisi */
  const T2=win.TIPS2, T2new="Il grafico è pronto. Nelle schede trovi gli strumenti: «Picchi» per dare i nomi, «Analisi» per scegliere cosa fare con lo spettro.";
  if (Array.isArray(T2) && /^Sotto al grafico/.test(T2[0]||'')) T2[0]=T2new;
  const tip2=$('#tip2'); if (tip2 && /Sotto al grafico/.test(tip2.textContent)) tip2.textContent=T2new;
})(window);
