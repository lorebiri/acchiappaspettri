/* Lingua dell'interfaccia (italiano / inglese). Il sorgente della pagina è in italiano: in inglese ogni testo mostrato passa da un dizionario
   (i18n/en.js, generato da i18n/en.json) a livello di DOM, così le migliaia di modelli HTML restano invariati.
   Testi spezzati dai tag si traducono pezzo per pezzo; i valori dinamici (numeri, nomi) sono i segnaposto {0}, {1}… dei modelli.
   Nomi di file, dati e campi modificabili dall'utente non vengono toccati ([data-noi18n], input, textarea). */
(function(root, factory){
  if (typeof module==='object' && module.exports) module.exports=factory;
  else root.AcchI18n=factory(root);
})(typeof self!=='undefined' ? self : this, function(win){
  'use strict';
  const KEY='acch.ui.lang', dict=(win.ACCH_EN||{}), exact=new Map(), byWord=new Map(), general=[], cache=new Map();
  const noEmoji=new Map(), deEmoji=t=>t.replace(/[\p{Extended_Pictographic}\uFE0F⬚]/gu,'').replace(/\s+/g,' ').replace(/« /g,'«').trim();
  const norm=s=>s.replace(/\s+/g,' ').trim();
  const escRe=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const wordsOf=s=>s.toLowerCase().match(/[\p{L}]{3,}/gu)||[];
  const core=t=>t.replace(/^[^\p{L}\p{N}{(«"']+/u,'').replace(/[\s—–·:,;]+$/u,'');
  function addEntry(k, v){
    if (!/\{\d+\}/.test(k)){ exact.set(k, v); const de=deEmoji(k); if (de!==k && de) noEmoji.set(de, deEmoji(v)); const k2=core(k); if (k2 && k2!==k && !exact.has(k2)) exact.set(k2, core(v)); return; }
    const parts=k.split(/\{\d+\}/), order=(k.match(/\{\d+\}/g)||[]).map(x=>+x.slice(1,-1));
    const statics=parts.join(' ');
    if (!/\p{L}{3}/u.test(statics)) return;   // un modello tutto segnaposto non si può riconoscere
    const re=new RegExp('^'+parts.map(escRe).join('(.*?)')+'$','su');
    // parola guida: solo parole intere, non attaccate a un segnaposto (in «spettr{1}» la parola vera è «spettri»)
    const safe=[]; parts.forEach((p,i)=>{ const m=p.match(/[\p{L}]+/gu)||[]; m.forEach((w,j)=>{ if (w.length<3) return; if (j===0 && i>0 && p.startsWith(w)) return; if (j===m.length-1 && i<parts.length-1 && p.endsWith(w)) return; safe.push(w.toLowerCase()); }); });
    const w=safe.sort((a,b)=>b.length-a.length)[0];
    const t={re, order, tr:v, len:statics.length}; if (w) (byWord.get(w)||byWord.set(w,[]).get(w)).push(t); else general.push(t);
  }
  Object.keys(dict).forEach(k=>addEntry(k, dict[k]));
  for (const list of byWord.values()) list.sort((a,b)=>b.len-a.len);
  /* traduce una stringa già ripulita dagli spazi di contorno; restituisce null se non la conosce */
  function lookup(s){
    if (cache.has(s)) return cache.get(s);
    let r=exact.has(s) ? exact.get(s) : null;
    const fits=(m,t)=>{ let cap=0; for (let i=1;i<m.length;i++) cap+=m[i].length; return cap<=Math.max(24,3*t.len) && (cap<=60 || cap<=0.6*s.length || (t.len>=20 && cap<=140)); };   // un modello quasi tutto segnaposto non deve «inghiottire» frasi intere
    const fill=(t,m)=>{ const vals=[]; t.order.forEach((n,i)=>vals[n]=m[i+1]); return t.tr.replace(/\{(\d+)\}/g,(_,n)=>{ const v=vals[+n]; return v==null?'':(lookup(v)||v); }); };
    if (r==null){ const seen=new Set(), cand=general.slice();   // tra tutti i modelli possibili vince quello con più testo fisso, il più specifico
      for (const w of wordsOf(s)){ if (seen.has(w)) continue; seen.add(w); const L=byWord.get(w); if (L) cand.push(...L); }
      cand.sort((a,b)=>b.len-a.len);
      for (const t of cand){ const m=t.re.exec(s); if (m && fits(m,t)){ r=fill(t,m); break; } } }
    if (r==null && noEmoji.size){ const v=noEmoji.get(deEmoji(s)); if (v!=null) r=v; }
    if (r==null){ // testi composti in modo dinamico: «Etichetta: spiegazione», «Nome — nota», frasi di seguito, simboli attorno
      cache.set(s,null);
      const pair=(sep,any)=>{ const i=s.indexOf(sep); if (i<=0) return null; const A=s.slice(0,i), B=s.slice(i+sep.length), TA=lookup(A), TB=lookup(B); return (TA!=null&&TB!=null)||(any&&(TA!=null||TB!=null)) ? (TA!=null?TA:A)+sep+(TB!=null?TB:B) : null; };
      const list=(re,glue,any)=>{ const P=s.split(re); if (P.length<2) return null; const T=P.map(x=>lookup(x)); return (any?T.some(x=>x!=null):T.every(x=>x!=null)) ? T.map((x,i)=>x!=null?x:P[i]).join(glue) : null; };
      const SENT=/(?<=[.!?…])\s+(?=[\p{Lu}«])/u;
      { const q=/^(\d+) (\p{L}.*)$/u.exec(s); if (q){ const v=lookup(q[2]); if (v!=null) r=q[1]+' '+v; } }
      { const q=/^Usa «(.+)»$/su.exec(s); if (q){ const v=lookup(q[1]); r='Use «'+(v!=null?v:q[1])+'»'; } }
      r=r||pair(' — ')||pair(': ')||list(SENT,' ')||list(' · ',' · ');
      if (r==null){ const m=/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N})»%]*)$/su.exec(s); if (m && (m[1]||m[3]) && m[2] && m[2]!==s){ const inner=lookup(m[2]); if (inner!=null) r=m[1]+inner+m[3]; } }
      if (r==null) r=pair(' — ',1)||pair(': ',1)||list(SENT,' ',1)||list(' · ',' · ',1)||list(', ',', ',1);
    }
    if (r!=null && r.includes('spectrum/spectra')) r=r.replace(/\b1 spectrum\/spectra\b/g,'1 spectrum').replace(/spectrum\/spectra/g,'spectra');
    if (cache.size>40000) cache.clear(); cache.set(s,r); return r;
  }
  function tr(text){ if (text==null) return text; const s=String(text); if (!/\p{L}/u.test(s)) return s; const n=norm(s); if (!n) return s; const r=lookup(n); if (r==null) return s;
    const lead=/^\s*/.exec(s)[0], tail=/\s*$/.exec(s)[0]; return lead+r+tail; }
  let lang='it'; const seen=new WeakMap(), missing=new Map(); let obs=null, collect=false;
  try{ const v=JSON.parse(win.localStorage.getItem(KEY)); if (v==='it'||v==='en') lang=v; else lang=null; }catch(e){ lang=null; }
  const isChosen=lang!=null;
  if (!lang) lang=(win.navigator && /^it\b/i.test(win.navigator.language||'')) ? 'it' : 'en';
  const SKIP=new Set(['SCRIPT','STYLE','TEXTAREA','CODE','KBD']);
  const ATTRS=['title','placeholder','aria-label','alt'];
  const noTr=el=>{ for (let p=el; p; p=p.parentElement){ if (SKIP.has(p.tagName) || p.hasAttribute && p.hasAttribute('data-noi18n')) return true; } return false; };
  function doText(node){
    const cur=node.nodeValue, st=seen.get(node);
    if (st && (cur===st.en)) return;              // già tradotto
    if (!/\p{L}/u.test(cur)) return;
    const en=tr(cur); seen.set(node,{it:cur, en});
    if (en!==cur) node.nodeValue=en; else if (collect) note(cur);
  }
  function note(s){ const n=norm(s); if (n) missing.set(n,(missing.get(n)||0)+1); }
  const attrMem=new WeakMap();
  function doAttrs(el){ if (el.nodeType!==1) return; for (const a of ATTRS){ if (!el.hasAttribute(a)) continue; const v=el.getAttribute(a); let mem=attrMem.get(el); if (!mem) attrMem.set(el, mem={}); if (mem[a] && mem[a].en===v) continue; const en=tr(v); mem[a]={it:v,en}; if (en!==v) el.setAttribute(a,en); else if (collect) note(v); }
    if (el.tagName==='INPUT' && (el.type==='button'||el.type==='submit') && el.value){ const en=tr(el.value); if (en!==el.value) el.value=en; } }
  function apply(rootEl){ if (lang!=='en' || !rootEl) return;
    if (rootEl.nodeType===3){ if (!noTr(rootEl.parentElement)) doText(rootEl); return; }
    if (rootEl.nodeType!==1 && rootEl.nodeType!==9 && rootEl.nodeType!==11) return;
    if (rootEl.nodeType===1){ if (noTr(rootEl)) return; doAttrs(rootEl); }
    const w=win.document.createTreeWalker(rootEl, 5 /* elementi e testi */, {acceptNode(n){ if (n.nodeType===1) return SKIP.has(n.tagName)||(n.hasAttribute('data-noi18n')) ? 2 : 1; return 1; }});
    for (let n=w.nextNode(); n; n=w.nextNode()){ if (n.nodeType===3) doText(n); else doAttrs(n); }
  }
  function restore(rootEl){ const w=win.document.createTreeWalker(rootEl||win.document.documentElement, 5); for (let n=w.nextNode(); n; n=w.nextNode()){ if (n.nodeType===3){ const st=seen.get(n); if (st && n.nodeValue===st.en) n.nodeValue=st.it; seen.delete(n); } else { const mem=attrMem.get(n); if (mem){ for (const a in mem) if (n.getAttribute(a)===mem[a].en) n.setAttribute(a,mem[a].it); attrMem.delete(n); } } } }
  function watch(){ if (obs) return; obs=new win.MutationObserver(list=>{ for (const m of list){ if (m.type==='childList') m.addedNodes.forEach(apply); else if (m.type==='characterData') apply(m.target); else if (m.type==='attributes' && !noTr(m.target)) doAttrs(m.target); } });
    obs.observe(win.document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:ATTRS}); }
  function unwatch(){ if (obs){ obs.disconnect(); obs=null; } }
  /* ciò che non passa dal DOM: finestre del browser, etichette dei grafici piccoli, comandi, celle CSV, testo del PDF */
  function patch(){
    const oc=win.confirm, oa=win.alert, op=win.prompt;
    if (oc) win.confirm=m=>oc.call(win, lang==='en'?tr(m):m);
    if (oa) win.alert=m=>oa.call(win, lang==='en'?tr(m):m);
    if (op) win.prompt=(m,d)=>op.call(win, lang==='en'?tr(m):m, d);
    const C2=win.CanvasRenderingContext2D; if (C2){ const ft=C2.prototype.fillText; C2.prototype.fillText=function(t,x,y,mw){ const c=this.canvas; if (lang==='en' && c && c.classList && c.classList.contains('minic')) t=tr(t); return mw==null ? ft.call(this,t,x,y) : ft.call(this,t,x,y,mw); }; }
  }
  /* si richiama dopo l'avvio della pagina: agganci alle funzioni globali che producono testo fuori dal DOM */
  function patchApp(){
    const wrap=(name, fn)=>{ const o=win[name]; if (typeof o==='function') win[name]=fn(o); };
    wrap('commands', o=>function(){ const L=o.apply(this,arguments); if (lang==='en') L.forEach(c=>{ c.kw=[c.kw||'',tr(c.kw||''),tr(c.label),c.sub?tr(c.sub):''].join(' '); }); return L; });   // i testi mostrati li traduce il DOM; qui serve solo la ricerca
    wrap('csvCell', o=>function(c,sep){ return o.call(this, win.LANG_EN_OUT&&win.LANG_EN_OUT() && typeof c==='string' ? tr(c) : c, sep); });
    wrap('pdfText', o=>function(t){ return o.call(this, win.LANG_EN_OUT&&win.LANG_EN_OUT() && typeof t==='string' ? tr(t) : t); });
  }
  function setLang(l, opt){ opt=opt||{}; if (l!=='it' && l!=='en') return; const prev=lang; lang=l;
    try{ win.localStorage.setItem(KEY, JSON.stringify(l)); }catch(e){}
    win.document.documentElement.lang=l;
    if (l==='en'){ apply(win.document.documentElement); watch(); } else if (prev==='en'){ unwatch(); restore(); }
    if (win.document.title) win.document.title='Acchiappaspettri';
    if (!opt.silent) win.dispatchEvent(new win.CustomEvent('acch-lang',{detail:l}));
  }
  function start(){ patch(); win.document.documentElement.lang=lang; if (lang==='en'){ apply(win.document.documentElement); watch(); } }
  return {tr, start, patchApp, setLang, get lang(){ return lang; }, isChosen, apply,
    _cov:{ begin(){ collect=true; missing.clear(); }, end(){ collect=false; return [...missing.entries()].sort((a,b)=>b[1]-a[1]); }, size:()=>exact.size+general.length+[...byWord.values()].reduce((a,b)=>a+b.length,0), lookup } };
});
