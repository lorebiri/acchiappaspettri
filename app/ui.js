// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Parti comuni a pagina e app desktop: conferme, impostazioni, lingua, tema, pagina di download */
(function(win){
  'use strict';
  const REPO='lorebiri/acchiappaspettri', RELEASES='https://github.com/'+REPO+'/releases';
  const $=s=>document.querySelector(s), lsG=k=>{ try{ return JSON.parse(localStorage.getItem(k)); }catch(e){ return null; } }, lsS=(k,v)=>{ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} };
  const isDesktop=()=>!!win.__TAURI__;
  /* finestra di scelta della pagina: uguale su ogni sistema, tradotta, non blocca il resto */
  function choice(message, buttons){ return new Promise(res=>{
    const d=$('#dlgConfirm'), box=$('#cfBtns'), pro=t=>win.ACCH_DESK?win.ACCH_DESK.pro(t):t; $('#cfMsg').textContent=pro(message); box.innerHTML='';
    const finish=v=>{ d.removeEventListener('cancel',onCancel); d.close(); res(v); }, onCancel=e=>{ e.preventDefault(); finish(buttons[0][0]); };
    buttons.forEach(([v,t,cl])=>{ const b=document.createElement('button'); b.type='button'; b.className='btn '+(cl||''); b.textContent=pro(t); b.onclick=()=>finish(v); box.appendChild(b); });
    d.addEventListener('cancel',onCancel); if (!d.open) d.showModal(); }); }
  win.uiConfirm=async msg=>{ if (win.ACCH_TEST) return true; return (await choice(msg,[['no','Annulla','ghost'],['yes','Sì','primary']]))==='yes'; };
  /* tema: i grafici restano bianchi, come nei file esportati */
  function applyTheme(){ const t=lsG('acch.ui.theme')||'auto', dark=t==='dark'||(t==='auto'&&win.matchMedia&&win.matchMedia('(prefers-color-scheme: dark)').matches); document.documentElement.dataset.theme=dark?'dark':'light'; }
  function setLang(l){ win.AcchI18n.setLang(l); const lab=$('#langLab'); if (lab) lab.textContent=l.toUpperCase(); if (typeof S!=='undefined' && S.lang!==l){ S.lang=l; saveS(); if (typeof syncControls==='function') syncControls(); if (files.length) refreshAll(); } }
  function openSettings(){ const d=$('#dlgSettings'); $('#stLang').value=win.AcchI18n.lang; $('#stTheme').value=lsG('acch.ui.theme')||'auto'; $('#stVer').textContent=APP_VERSION_FULL();
    $('#stKind').textContent=isDesktop()?'Applicazione desktop':'Versione online'; $('#stDesktop').hidden=!isDesktop(); $('#stWeb').hidden=isDesktop()||!!win.ACCH_SHELL; if (!d.open) d.showModal(); if (win.AcchDesktop) win.AcchDesktop.syncSettings(); }

  /* collegamenti reali: si chiede a GitHub l'ultima versione stabile (non include le beta) soltanto quando l'utente apre la finestra */
  function detectOs(){ const u=(navigator.userAgent||'')+' '+(navigator.platform||''); if (/Win/i.test(u)) return 'windows'; if (/Mac/i.test(u)) return 'macos'; if (/Linux|X11/i.test(u)) return 'linux'; return null; }
  function classifyAssets(assets){ const out=[]; for (const a of assets||[]){ const n=a.name||'', url=a.browser_download_url; if (!url || /\.(sig|json|tar\.gz|zip)$/i.test(n)) continue;
      if (/\.exe$/i.test(n)) out.push({os:'windows',label:'Windows (installer .exe)',a});
      else if (/\.dmg$/i.test(n)) out.push({os:'macos',label:/aarch64|arm64/i.test(n)?'macOS Apple Silicon (M1 e successivi) (.dmg)':/x64|x86_64|intel/i.test(n)?'macOS Intel (.dmg)':'macOS (.dmg)',a});
      else if (/\.AppImage$/i.test(n)) out.push({os:'linux',label:'Linux AppImage (si aggiorna da sola)',a});
      else if (/\.deb$/i.test(n)) out.push({os:'linux',label:'Linux .deb (Debian, Ubuntu)',a}); }
    return out; }
  const OS_NOTE={windows:'Il programma non è ancora firmato con un certificato: Windows può mostrare «Windows ha protetto il PC». Scegli «Ulteriori informazioni» e poi «Esegui comunque».',
    macos:'Il programma non è ancora firmato né autenticato da Apple. Trascinalo in Applicazioni; se macOS lo blocca, apri Impostazioni di Sistema → Privacy e sicurezza e scegli «Apri comunque».',
    linux:'AppImage: rendila eseguibile e aprila. Il pacchetto .deb si installa con il gestore pacchetti e si aggiorna scaricando la versione nuova.'};
  async function renderDownload(fetchFn){ const box=$('#dlBody'), esc=win.esc;
    const none=m=>{ box.innerHTML=`<div class="signote">${esc(m)}</div>`; };
    box.innerHTML='<div class="pkempty">Cerco l\'ultima versione…</div>';
    let r; try{ r=await (fetchFn||fetch)('https://api.github.com/repos/'+REPO+'/releases/latest',{headers:{Accept:'application/vnd.github+json'}}); }catch(e){ none('Non riesco a raggiungere GitHub: controlla la connessione. Puoi usare subito la versione online.'); return; }
    if (r.status===404){ none('La versione desktop non è ancora stata pubblicata. Per ora puoi usare la versione online.'); return; }
    if (!r.ok){ none('GitHub non ha risposto. Riprova tra poco oppure apri l\'elenco di tutte le versioni.'); return; }
    let j; try{ j=await r.json(); }catch(e){ none('Risposta di GitHub non valida.'); return; }
    const list=classifyAssets(j.assets); if (!list.length || j.prerelease || j.draft){ none('L\'ultima versione non contiene ancora gli installer. Per ora puoi usare la versione online.'); return; }
    const os=detectOs(), mine=list.filter(x=>x.os===os), other=list.filter(x=>x.os!==os), mb=n=>n?` · ${Math.round(n/1048576)} MB`:'';
    const link=(x,pri)=>`<a class="btn ${pri?'primary':'ghost'} dlasset" href="${esc(x.a.browser_download_url)}" rel="noopener">⬇️ ${esc(x.label)}<small class="opt-l" data-noi18n>${esc(mb(x.a.size))}</small></a>`;
    box.innerHTML=`<p style="margin:6px 0 10px"><b>Versione <span data-noi18n>${esc(String(j.tag_name||'').replace(/^v/,''))}</span></b></p><div class="dllist">${mine.map(x=>link(x,true)).join('')}${other.map(x=>link(x,false)).join('')}</div>${os&&OS_NOTE[os]?`<p class="why" style="margin-top:12px">${esc(OS_NOTE[os])}</p>`:''}`;
    return list;
  }
  // i pulsanti arrivano dopo showModal: il fuoco passa al primo installer, se nel frattempo l'utente non l'ha spostato
  // nel desktop la finestra di download non c'è (app/testi-desktop.js la toglie): gli aggiornamenti passano dal menu
  function openDownload(fetchFn){ const d=$('#dlgDownload'); if (!d) return Promise.resolve([]); if (!d.open) d.showModal(); const was=document.activeElement;
    return renderDownload(typeof fetchFn==="function"?fetchFn:undefined).then(list=>{ const a=d.querySelector('.dlasset'); if (a && d.open && document.activeElement===was) a.focus(); return list; }); }
  function init(){
    applyTheme(); if (win.matchMedia) win.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',applyTheme);
    const I=win.AcchI18n; if (I.isChosen && I.lang && typeof S!=='undefined' && S.lang!==I.lang && !lsG('acch.ui.langSynced')){ S.lang=I.lang; saveS(); lsS('acch.ui.langSynced',true); }
    $('#langLab').textContent=I.lang.toUpperCase();
    if (!/Mac|iPhone|iPad/i.test(navigator.platform||navigator.userAgent||'')) document.querySelectorAll('kbd').forEach(k=>{ if (k.textContent.trim()==='⌘K') k.textContent='Ctrl+K'; });
    $('#acceptAll').addEventListener('click',()=>toast('⚠️ Nomi proposti solo in base alla posizione delle bande: sono ipotesi, controllali.'));
    $('#langBtn').onclick=()=>setLang(I.lang==='it'?'en':'it');
    $('#settingsBtn').onclick=openSettings; $('#stClose').onclick=()=>$('#dlgSettings').close();
    $('#stLang').onchange=e=>setLang(e.target.value);
    $('#stTheme').onchange=e=>{ lsS('acch.ui.theme',e.target.value); applyTheme(); };
    $('#stGetDesktop').onclick=e=>{ e.preventDefault(); $('#dlgSettings').close(); openDownload(); };
    $('#dlClose').onclick=()=>$('#dlgDownload').close();
    $('#entryDesktop').onclick=openDownload;
    $('#entryOnline').onclick=()=>{ $('#entryBox').hidden=true; lsS('acch.ui.entryDone',true); const z=document.querySelector('#v1 .drop,#v1 .dropzone,#inFiles'); if (z && z.scrollIntoView) (z.closest('.drop,.dropzone')||z.parentElement).scrollIntoView({behavior:'smooth',block:'center'}); };
    if (lsG('acch.ui.entryDone') || isDesktop()) $('#entryBox').hidden=true;
  }
  win.AcchUi={init, choice, setLang, applyTheme, openSettings, openDownload, renderDownload, classifyAssets, detectOs, isDesktop};
  // avvio: lingua e progetto si agganciano quando la pagina è pronta
  init(); win.AcchProject.init(); win.AcchI18n.patchApp(); win.AcchI18n.start();
})(window);
