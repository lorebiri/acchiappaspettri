// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* «Segnala un problema», parte pura (senza DOM): registro circolare degli errori, pulizia dei testi, corpo e mailto della mail,
   oscuramento dei pixel. Il programma non spedisce nulla: prepara il messaggio, che l'utente invia dal suo programma di posta.
   Caricato presto nella pagina, così il registro raccoglie anche gli errori dell'avvio. Usato anche dai test in Node. */
(function(root, factory){
  const C=factory();
  if (typeof module==='object' && module.exports) module.exports=C;
  else { root.AcchSegnalaCore=C; C.install(root); }
})(typeof self!=='undefined' ? self : this, function(){
  'use strict';
  const TO='lorenzo.birindelli@cnr.it';
  const MAX_URL=1900;   // Outlook su Windows tronca i mailto più lunghi
  const MAX_LOG=50, MAX_LINES=6, MAX_LINE=220;

  /* ---- registro circolare: errori JS non gestiti, console.error, avvisi ⊘/△ mostrati ---- */
  function createLog(max){ max=max||MAX_LOG; const L=[], subs=[];
    return {
      push(level, msg, t){ const m=String(msg==null?'':msg).replace(/\s+/g,' ').trim(); if (!m) return null;
        const last=L[L.length-1]; const now=t||new Date(); if (last && last.level===level && last.msg===m){ if (now-last.t>2000) last.n++; last.t=now; return last; }   // stesso messaggio ripetuto: una riga (toast e fumetto dello stesso avviso contano una volta)
        const e={level, msg:m.slice(0,500), t:now, n:1}; L.push(e); while (L.length>max) L.shift(); subs.forEach(f=>{ try{ f(e); }catch(_){} }); return e; },
      list(){ return L.slice(); }, clear(){ L.length=0; }, on(f){ subs.push(f); } };
  }
  const log=createLog();
  const z2=n=>String(n).padStart(2,'0');
  const hms=d=>z2(d.getHours())+':'+z2(d.getMinutes())+':'+z2(d.getSeconds());
  // gravità di un messaggio della pagina: ⛔/⊘ errore, ⚠/△/😕 avviso; il resto non entra nel registro
  const severity=t=>{ const s=String(t||''); return /⛔|⊘/.test(s)?'ERROR':/⚠|△|😕/.test(s)?'WARN':null; };

  /* ---- pulizia: cartelle personali e percorsi completi → solo il nome del file; senza consenso, via anche i nomi dei file aperti ---- */
  const escRe=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  function clean(line, opt){ opt=opt||{}; let s=String(line==null?'':line);
    // gli indirizzi della pagina stessa (stack degli errori) restano: dicono il punto del codice, non i dati dell'utente
    const keep=[]; s=s.replace(/\b(?:https?|tauri|blob):\/\/[^\s"'()]+/g,m=>{ keep.push(m); return '\u0000'+(keep.length-1)+'\u0000'; });
    s=s.replace(/(?:file:\/\/)?(?:[A-Za-z]:)?[\\/](?:Users|home)[\\/][^\\/\u0000]+/gi,'~');   // cartella personale, anche con spazi nel nome
    s=s.replace(/(?:file:\/\/)?~?(?:[A-Za-z]:)?(?:[\\/][^\\/\s"',:()\u0000]+)+[\\/]([^\\/\s"',:()\u0000]+)/g,'…/$1');
    s=s.replace(/\u0000(\d+)\u0000/g,(_,i)=>keep[+i]);
    if (!opt.names) for (const n of (opt.files||[]).filter(Boolean).sort((a,b)=>b.length-a.length)){ s=s.replace(new RegExp(escRe(n),'g'),'‹file›'); }
    return s.slice(0,MAX_LINE); }
  // nomi da nascondere: nome, percorso relativo e nome senza estensione di ogni file caricato
  function fileNames(list){ const out=new Set(); for (const f of list||[]){ for (const v of [f && f.name, f && f.path]){ if (!v) continue; const s=String(v); out.add(s); const base=s.split(/[\\/]/).pop(); out.add(base); const stem=base.replace(/\.[^.]+$/,''); if (stem.length>=3) out.add(stem); } } return [...out]; }
  function logLines(entries, opt){ return (entries||[]).filter(e=>e.level==='ERROR'||e.level==='WARN').slice(-MAX_LINES)
    .map(e=>clean(`${hms(e.t)} [${e.level}] ${e.msg}${e.n>1?' (×'+e.n+')':''}`, opt)); }

  /* ---- sistema dall'user agent: niente dati personali, solo sistema e motore ---- */
  function osFromUA(ua){ ua=String(ua||'');
    let os=/Windows NT 10/.test(ua)?'Windows 10/11':/Windows NT ([\d.]+)/.test(ua)?'Windows NT '+RegExp.$1:/Mac OS X ([\d_]+)/.test(ua)?'macOS '+RegExp.$1.replace(/_/g,'.'):/Android ([\d.]+)/.test(ua)?'Android '+RegExp.$1:/(iPhone|iPad).*OS ([\d_]+)/.test(ua)?'iOS '+RegExp.$2.replace(/_/g,'.'):/Linux/.test(ua)?'Linux':'?';
    const br=/Edg\/([\d]+)/.test(ua)?'Edge '+RegExp.$1:/Firefox\/([\d]+)/.test(ua)?'Firefox '+RegExp.$1:/Chrome\/([\d]+)/.test(ua)?'Chrome '+RegExp.$1:/Version\/([\d.]+).*Safari/.test(ua)?'Safari '+RegExp.$1:/AppleWebKit\/([\d.]+)/.test(ua)?'WebKit '+RegExp.$1:'';
    return br ? os+' · '+br : os; }

  /* ---- testi della mail (lingua dell'interfaccia; tono sobrio nel desktop) ---- */
  const TXT={
    it:{ subject:v=>`Acchiappaspettri ${v}: segnalazione di un problema`, hello:d=>d?'Buongiorno,':'Ciao Lorenzo,',
      doing:'Cosa stavo facendo quando è successo:', expect:'Cosa mi aspettavo e cosa è successo invece:',
      shotAtt:'Lo screenshot della finestra è allegato.', shotDl:n=>`Lo screenshot della finestra è nella cartella Download («${n}»): allegalo a questa mail.`,
      tech:'-- Dati tecnici, puoi lasciarli così --', ver:'Versione di Acchiappaspettri', build:'Edizione', desk:'desktop', web:'online', sys:'Sistema', lang:'Lingua',
      langV:(u,g)=>`interfaccia ${u}, grafici ${g}`, win:'Finestra', tech2:'Tecnica e formato del file aperto', nfiles:n=>`${n} file caricati`, none:'nessun file caricato',
      file:'Nome del file', shown:'Avviso mostrato', logs:'Ultimi errori e avvisi registrati:', nologs:'Nessun errore o avviso registrato.', cut:'[…] (testo completo negli appunti)' },
    en:{ subject:v=>`Acchiappaspettri ${v}: problem report`, hello:d=>d?'Hello,':'Hi Lorenzo,',
      doing:'What I was doing when it happened:', expect:'What I expected and what happened instead:',
      shotAtt:'The screenshot of the window is attached.', shotDl:n=>`The screenshot of the window is in the Downloads folder («${n}»): attach it to this email.`,
      tech:'-- Technical data, you can leave it as it is --', ver:'Acchiappaspettri version', build:'Edition', desk:'desktop', web:'online', sys:'System', lang:'Language',
      langV:(u,g)=>`interface ${u}, plots ${g}`, win:'Window', tech2:'Technique and format of the open file', nfiles:n=>`${n} files loaded`, none:'no file loaded',
      file:'File name', shown:'Message shown', logs:'Latest errors and warnings logged:', nologs:'No error or warning logged.', cut:'[…] (full text in the clipboard)' } };
  const T=l=>TXT[l==='en'?'en':'it'];
  const subject=(version, lang)=>T(lang).subject(version||'?');

  // desktop: il sistema lo dice il lato nativo; dall'user agent della webview solo la versione, se è dello stesso sistema
  function sysLine(info){ const ua=osFromUA(info.ua); if (!info.desktop || !info.os) return ua; const n={windows:'Windows',macos:'macOS',linux:'Linux'}[info.os]||info.os;
    return ua.startsWith(n) ? ua : n+(ua.includes(' · ')?' · '+ua.split(' · ').pop():''); }
  /* riepilogo tecnico, cioè ciò che l'utente vede prima dell'invio. info: {version, desktop, os, kind, arch, ua, lang, plotLang, width, height, scale,
     technique, format, nFiles, fileName, consent, shown, entries, files} */
  function summary(info){ const t=T(info.lang), o={names:!!info.consent, files:info.files||[]};
    const L=[`${t.ver}: ${info.version||'?'}`,
      `${t.build}: ${info.desktop ? t.desk+(info.kind?' ('+info.kind+(info.arch?', '+info.arch:'')+')':'') : t.web}`,
      `${t.sys}: ${sysLine(info)}`,
      `${t.lang}: ${t.langV(info.lang||'it', info.plotLang||info.lang||'it')}`];
    if (info.width) L.push(`${t.win}: ${info.width}×${info.height}${info.scale&&info.scale!==1?' @'+(+info.scale.toFixed(2))+'x':''}`);
    L.push(`${t.tech2}: ${info.nFiles ? [info.technique, info.format].filter(Boolean).join(', ')+' ('+t.nfiles(info.nFiles)+')' : t.none}`);
    if (info.consent && info.fileName) L.push(`${t.file}: ${clean(info.fileName,{names:true})}`);
    if (info.shown) L.push(`${t.shown}: ${clean(String(info.shown).replace(/\s+/g,' '), o).slice(0,200)}`);
    const lines=logLines(info.entries, o); return {head:L, lines}; }

  /* corpo: due spazi da compilare (già riempiti con ciò che l'utente ha scritto nella finestra), screenshot, dati tecnici, registro */
  function body(m, lines){ const t=T(m.lang), S=m.summary, out=[t.hello(m.desktop), '', t.doing, m.doing ? m.doing : '', '', t.expect, m.expect ? m.expect : '', ''];
    if (m.shot==='attached') out.push(t.shotAtt, ''); else if (m.shot) out.push(t.shotDl(m.shot), '');
    out.push(t.tech, ...S.head); const ls=lines==null?S.lines:lines; out.push(ls.length ? t.logs : t.nologs, ...ls); return out.join('\n'); }
  const enc=s=>encodeURIComponent(s).replace(/%0A/g,'%0D%0A');   // RFC 6068: a capo come CRLF
  const url=(sub, b)=>`mailto:${TO}?subject=${enc(sub)}&body=${enc(b)}`;
  /* mailto entro MAX_URL: prima si tolgono le righe di registro più vecchie, poi si accorciano i testi dell'utente (il testo intero va negli appunti) */
  function mailto(m, max){ max=max||MAX_URL; const sub=subject(m.version, m.lang), t=T(m.lang); let lines=m.summary.lines.slice(), mm=Object.assign({}, m), b=body(mm, lines), u=url(sub,b), truncated=false;
    while (u.length>max && lines.length){ lines=lines.slice(1); b=body(mm, lines); u=url(sub,b); truncated=true; }
    const cut=(s,n)=>s.length<=n ? s : s.slice(0,Math.max(0,n)).replace(/\s+\S*$/,'')+' '+t.cut;
    for (let guard=0; u.length>max && guard<200; guard++){ const k=(mm.expect||'').length>=(mm.doing||'').length?'expect':'doing'; const v=mm[k]||''; if (!v.length) break;
      mm[k]=cut(v.replace(/ \[…\].*$/,''), Math.floor(v.replace(/ \[…\].*$/,'').length*0.8)-1); if (mm[k]===v) mm[k]=''; b=body(mm, lines); u=url(sub,b); truncated=true; }
    // ultima rete: si taglia dal fondo (dati tecnici) finché entra
    while (u.length>max){ b=b.slice(0,-20); u=url(sub,b); truncated=true; }
    return {url:u, subject:sub, body:b, truncated, to:TO}; }

  /* nome dello screenshot: Acchiappaspettri-segnalazione-AAAA-MM-GG-hhmmss.png (ora locale) */
  const shotName=d=>{ d=d||new Date(); return `Acchiappaspettri-segnalazione-${d.getFullYear()}-${z2(d.getMonth()+1)}-${z2(d.getDate())}-${z2(d.getHours())}${z2(d.getMinutes())}${z2(d.getSeconds())}.png`; };

  /* oscuramento: i rettangoli diventano neri pieni nei pixel stessi (RGBA, larghezza w), non un livello sopra */
  function blackout(data, w, h, rects){ for (const r of rects||[]){ const x0=Math.max(0,Math.floor(Math.min(r.x,r.x+r.w))), x1=Math.min(w,Math.ceil(Math.max(r.x,r.x+r.w))), y0=Math.max(0,Math.floor(Math.min(r.y,r.y+r.h))), y1=Math.min(h,Math.ceil(Math.max(r.y,r.y+r.h)));
      for (let y=y0;y<y1;y++) for (let x=x0;x<x1;x++){ const i=(y*w+x)*4; data[i]=0; data[i+1]=0; data[i+2]=0; data[i+3]=255; } } return data; }

  /* raccolta nella pagina: errori non gestiti, promesse rifiutate, console.error/warn; un ascoltatore per l'avviso «errore imprevisto» */
  const unexpected=[];
  const benign=m=>/ResizeObserver loop|^Script error\.?$/i.test(String(m||''));
  function install(win){ if (!win || !win.addEventListener || win.__acchSegnala) return; win.__acchSegnala=true;
    const where=e=>e && e.filename ? ' ('+String(e.filename).split(/[\\/]/).pop()+':'+e.lineno+')' : '';
    win.addEventListener('error', e=>{ if (!e || e.target && e.target!==win && e.target.tagName) return;   // risorse non caricate: non sono errori del programma
      const m=(e.error && e.error.message) || e.message; if (benign(m)) return; const ent=log.push('ERROR', 'JS: '+m+where(e)); unexpected.forEach(f=>{ try{ f(ent); }catch(_){} }); });
    win.addEventListener('unhandledrejection', e=>{ const r=e && e.reason, m=r && r.message ? r.message : String(r); if (benign(m)) return; const ent=log.push('ERROR', 'JS (promise): '+m); unexpected.forEach(f=>{ try{ f(ent); }catch(_){} }); });
    const c=win.console; if (c){ for (const [k,lv] of [['error','ERROR'],['warn','WARN']]){ const o=c[k]; if (typeof o!=='function') continue;
      c[k]=function(){ try{ log.push(lv, [...arguments].map(a=>a && a.message ? a.message : typeof a==='object' ? (()=>{ try{ return JSON.stringify(a); }catch(_){ return String(a); } })() : String(a)).join(' ')); }catch(_){} return o.apply(this, arguments); }; } } }
  return {TO, MAX_URL, createLog, log, severity, clean, fileNames, logLines, osFromUA, summary, body, subject, mailto, shotName, blackout, install, onUnexpected:f=>unexpected.push(f), _txt:TXT};
});
