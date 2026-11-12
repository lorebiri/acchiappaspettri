// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Tono del desktop (3.0.0, I1): un giro completo nell'app desktop, con il ponte Tauri simulato, raccoglie tutto il testo che l'utente vede
// (DOM visibile, title/aria-label, avvisi, caricamento, dialoghi, barra di stato, menu nativi, Novità, PDF e CSV esportati).
// Nel desktop: zero «Gino», zero emoji (\p{Extended_Pictographic}), zero «!» nei messaggi, zero «browser»/«download».
// Nella pagina online lo stesso giro deve trovare ancora Gino: l'online resta com'è. Dati SINTETICI e del corpus.
// Uso: PW_CHANNEL=chrome node --test test/validation/tono-desktop.test.js
'use strict';
const {describe, it, before, after}=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path');
const B=require('./browser.js'), {pdfText}=require('./pdf-text.js');
const JSZip=require(path.join(B.ROOT,'node_modules','jszip'));

const FILES=['c/01_ftir_tab_desc.txt','c/10_raman_header.txt','hplc/STD1_a.txt','xrf/A08_bronzo_senzacal.mca','c/21_hplc_us_thousands_quoted.csv'].map(r=>[path.basename(r), fs.readFileSync(path.join(B.ROOT,'test','corpus',r)).toString('base64')]);
const RIGHE='Time (min),Signal (mAU)\n'+Array.from({length:400},(_,i)=>i===200?'ERRORE lettura':(i*0.01).toFixed(3)+','+(1+50*Math.exp(-0.5*((i*0.01-2)/0.05)**2)).toFixed(3)).join('\n');

/* ponte Tauri finto: menu, dialoghi, file e aggiornamenti registrati in window.__TONO */
function fakeTauri(o){
  const T=window.__TONO={msgs:[], menu:null, files:{}, title:'', failWrite:false, update:null};
  const ok=v=>Promise.resolve(v);
  window.__TAURI__={
    core:{ invoke:async (cmd, a, opt)=>{
      if (cmd==='install_info') return {os:o.os, kind:'appimage', e2e:false};
      if (cmd==='installer_language') return null;
      if (cmd==='take_pending_open') return [];
      if (cmd==='pick_save') return {path:'/tmp/tono/'+a.suggested, name:a.suggested};
      if (cmd==='pick_open') return T.open||null;
      if (cmd==='pick_many') return [];
      if (cmd==='write_file'){ if (T.failWrite) throw 'PermissionDenied'; const p=decodeURIComponent(opt.headers['x-acch-path']); T.files[p]=a.slice(); return null; }
      if (cmd==='read_file'){ const b=T.files[a.path]; if (!b) throw 'NotFound'; return Array.from(b); }
      return null; } },
    event:{ listen:()=>ok(()=>{}) },
    window:{ getCurrentWindow:()=>({ onCloseRequested:()=>ok(), setTitle:t=>{ T.title=t; return ok(); }, destroy:()=>ok() }) },
    opener:{ openUrl:()=>ok() }, process:{ relaunch:()=>ok() },
    updater:{ check:async ()=>T.update },
    menu:{ MenuItem:{ new:x=>ok({text:x.text, enabled:x.enabled}) }, PredefinedMenuItem:{ new:x=>ok({text:x.text||'', pre:x.item}) }, Submenu:{ new:x=>ok({text:x.text, items:x.items}) },
      Menu:{ new:x=>ok({ setAsAppMenu:()=>{ T.menu=x.items; return ok(); } }) } }
  };
}
/* registro: ogni testo che cambia in un elemento visibile (o in avvisi, caricamento, barra dei messaggi, dialoghi) */
function recorder(){
  if (!window.__TONO) window.__TONO={msgs:[]};
  const T=()=>window.__TONO;
  const ALWAYS='#toast,#loader,#shMsg,#shLog,#status,dialog[open]';
  let q=new Set(), t=null;
  const flush=()=>{ t=null; for (const e of q){ if (!e.isConnected) continue; const vis=e.closest(ALWAYS) || (e.checkVisibility&&e.checkVisibility()); if (!vis) continue; const s=(e.innerText||e.textContent||'').replace(/\s+/g,' ').trim(); if (s) T().msgs.push(s); } q=new Set(); };
  const add=n=>{ const e=n&&(n.nodeType===1?n:n.parentElement); if (!e || /SCRIPT|STYLE/.test(e.tagName)) return; q.add(e); if (!t) t=setTimeout(flush,0); };
  const start=()=>new MutationObserver(ms=>{ for (const m of ms){ if (m.type==='characterData') add(m.target); else { add(m.target); m.addedNodes.forEach(add); } } }).observe(document.documentElement,{subtree:true, childList:true, characterData:true});
  if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start);
  const oc=window.confirm, oa=window.alert, op=window.prompt;
  window.alert=m=>{ T().msgs.push(String(m)); }; window.confirm=m=>{ T().msgs.push(String(m)); return true; }; window.prompt=(m,d)=>{ T().msgs.push(String(m)); return d; };
}
/* istantanea: testo visibile e attributi degli elementi visibili; «Gino» anche negli elementi nascosti */
function snap(tag){
  const vis=e=>e.checkVisibility ? e.checkVisibility() : !!e.getClientRects().length;
  const out=[]; out.push(['vista '+tag, document.body.innerText]);
  for (const e of document.querySelectorAll('*')){ if (/SCRIPT|STYLE/.test(e.tagName)) continue; if (!vis(e)) continue;
    for (const a of ['title','aria-label','placeholder','alt']) if (e.hasAttribute(a)) out.push([a+' '+tag, e.getAttribute(a)]);
    if (e.tagName==='INPUT' && /button|submit/.test(e.type)) out.push(['value '+tag, e.value]); }
  const w=document.createTreeWalker(document.body, 4); let hidden='';
  for (let n=w.nextNode(); n; n=w.nextNode()){ const p=n.parentElement; if (p && !/SCRIPT|STYLE/.test(p.tagName)) hidden+=n.nodeValue+' '; }
  for (const e of document.querySelectorAll('[title],[aria-label]')) hidden+=' '+(e.getAttribute('title')||'')+' '+(e.getAttribute('aria-label')||'');
  out.push(['dom nascosto '+tag, (hidden.match(/[^.]{0,40}\bGino\b[^.]{0,40}/g)||[]).join(' | ')]);
  return out;
}

const BAD=[['Gino',/\bGino\b/], ['emoji',/\p{Extended_Pictographic}/u], ['!',/!(?!=)/], ['browser',/browser/i], ['download',/download/i]];
function problems(list){ const out=[]; for (const [src,t] of list){ for (const [k,re] of BAD){ if (/^dom nascosto/.test(src) && k!=='Gino') continue; if (re.test(t)){ const m=re.exec(t), i=m.index; out.push(`${k} · ${src}: …${t.slice(Math.max(0,i-60), i+40).replace(/\s+/g,' ')}…`); } } } return [...new Set(out)]; }
// testi del desktop in italiano (app/testi-desktop.js): in inglese non devono restare non tradotti
const DESK_IT=(()=>{ if (!fs.existsSync(path.join(B.ROOT,'app/testi-desktop.js'))) return [];   // codice di partenza: la tabella non c'è ancora
  const w={ACCH_SHELL:true, ACCH_EN:{}, document:{readyState:'loading', addEventListener(){}}, addEventListener(){}}; require('vm').runInNewContext(fs.readFileSync(path.join(B.ROOT,'app/testi-desktop.js'),'utf8'), {window:w});
  const T=w.ACCH_DESK._tables; return [...T.TESTI.filter(r=>r[1] && r[1]!==r[2] && r[1].length>14).map(r=>r[1]), ...[].concat(...Object.values(T.NOVITA).map(L=>L.map(n=>n[1])))]; })();
const menuTexts=items=>{ const o=[]; const walk=L=>{ for (const x of L||[]){ if (x.text) o.push(['menu', x.text]); if (x.items) walk(x.items); } }; walk(items); return o; };

let server, br;
before(async ()=>{ server=await B.startServer(); br=await B.launch(); });
after(async ()=>{ await br.close(); server.close(); });

async function open(opt){
  const ctx=await br.newContext({locale:opt.lang==='en'?'en-GB':'it-IT', viewport:{width:1400,height:900}});
  await ctx.addInitScript(({lang})=>{ try{ localStorage.setItem('acch.ui.entryDone','1'); if (lang) localStorage.setItem('acch.ui.lang', JSON.stringify(lang)); }catch(e){} }, {lang:opt.lang||null});
  await ctx.addInitScript(recorder);
  if (opt.desk){ await ctx.addInitScript(()=>{ window.ACCH_SHELL_PREVIEW=true; }); await ctx.addInitScript(fakeTauri, {os:opt.os||'macos'}); }
  await ctx.route('**/*', r=>{ const u=r.request().url(); return (u.startsWith('http://127.0.0.1')||u.startsWith('data:')||u.startsWith('blob:')) ? r.continue() : r.abort(); });
  const p=await ctx.newPage(), errors=[], dialogs=[]; p.on('pageerror',e=>errors.push(String(e.stack||e))); p.on('dialog',d=>{ dialogs.push(d.message()); d.accept().catch(()=>{}); });
  await p.goto(`http://127.0.0.1:${server.address().port}/index.html`); await p.waitForFunction(()=>window.AcchProject && window.AcchUi);
  return {ctx, p, errors, dialogs};
}

/* il giro completo dentro la pagina: restituisce le istantanee, i messaggi registrati e i file scritti */
async function journey(p, lang, desk){
  return p.evaluate(async ([FILES, RIGHE, lang, desk])=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms)), shots=[], snapT=t=>shots.push(...window.__snap(t)), T=window.__TONO;
    const closeAll=()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close());
    const step=async (name, fn)=>{ try{ await fn(); }catch(e){ shots.push(['ERRORE '+name, String(e&&e.stack||e)]); } };
    // avvio: scelta della lingua (prima installazione), poi la finestra vuota
    await wait(900);
    await step('lingua', async ()=>{ snapT('avvio'); const b=[...document.querySelectorAll('#cfBtns button')].find(x=>/Italiano|English/.test(x.textContent)&&x.textContent===(lang==='en'?'English':'Italiano')); if (b) b.click(); await wait(300); snapT('dopo lingua'); });
    // benvenuto, scorciatoie (giro guidato), Novità, impostazioni, comandi
    await step('benvenuto', async ()=>{ document.querySelector('#aboutBtn').click(); await wait(250); snapT('benvenuto'); closeAll(); });
    await step('giro', async ()=>{ window.startTour(); await wait(250); snapT('giro'); closeAll(); try{ endTour(); }catch(e){} });
    await step('novità', async ()=>{ showNews(); await wait(250); snapT('novità'); closeAll(); showNews(NOVITA); await wait(250); snapT('novità tutte'); closeAll(); });
    await step('impostazioni', async ()=>{ AcchUi.openSettings(); await wait(250); snapT('impostazioni'); closeAll(); });
    await step('comandi', async ()=>{ openCmd(); await wait(200); snapT('comandi'); closeAll(); });
    await step('aggiornamenti', async ()=>{ if (!desk) return; await AcchDesktop.checkUpdate(true); await wait(200); snapT('nessun aggiornamento');
      T.update={version:'9.9.9', body:'Correzioni.', download:async()=>{ throw new Error('rete'); }, install:async()=>{}}; await AcchDesktop.checkUpdate(true); await wait(200); snapT('aggiornamento');
      document.querySelector('#upGo').click(); await wait(400); snapT('aggiornamento non riuscito'); closeAll(); T.update=null; });
    // caricamento: spettri veri del corpus e un file con una riga illeggibile
    await step('caricamento', async ()=>{ const ents=FILES.map(([n,b])=>({file:new File([Uint8Array.from(atob(b),c=>c.charCodeAt(0))],n), path:n})); ents.push({file:new File([RIGHE],'righe.csv'), path:'righe.csv'}, {file:new File(['niente di numerico qui'],'vuoto.txt'), path:'vuoto.txt'});
      await addEntries(ents); await wait(600); snapT('caricati'); closeAll(); });
    // analisi: schede dell'ispettore, risultati, nomi suggeriti, confronti, deconvoluzione
    await step('analisi', async ()=>{ for (let i=0;i<files.length;i++){ cur=i; go(2); for (const t of ['peaks','proc','zone','refs','an']){ openTab(t); await wait(60); } renderAnalysis(); await wait(120); snapT('analisi '+files[i].name); }
      if (window.AcchShell) for (const r of ['peaks','qual','hyp','fit','tech','log']){ AcchShell.showRes(r); await wait(60); snapT('risultati '+r); }
      cur=0; go(2); renderPreview(); const a=document.querySelector('#acceptAll'); if (a) a.click(); await wait(200); snapT('nomi');
      const c=document.querySelector('#cmpAuto'); if (c) c.click(); await wait(200); snapT('confronti'); setView('cmp'); await wait(200); snapT('vista confronto'); setView('one'); await wait(100);
      try{ await runFitUI(); }catch(e){} await wait(300); snapT('deconvoluzione');
      if (window.AcchShell) AcchShell.showDoc('sheet'); await wait(200); snapT('foglio'); if (window.AcchShell) AcchShell.showDoc('study'); await wait(300); snapT('più campioni'); });
    // esportazione: PDF, immagini e CSV (nel desktop passano dal dialogo di salvataggio)
    let exported=[];
    await step('esportazione', async ()=>{ Object.assign(S,{outPdf:true, csvPeaks:true, csvData:true, outAnalysis:true, summary:true, oneFile:true}); saveS(); go(3); await wait(300); snapT('esporta');
      if (!desk){ const o=window.download; window.download=(b,n)=>exported.push([n,b]); await runExport(); await wait(1600); window.download=o; } else { await runExport(); await wait(2500); }
      snapT('esportato'); });
    // progetto: salvataggio, riapertura, errori di scrittura e di lettura
    await step('progetto', async ()=>{ await AcchProject.save(); await wait(400); snapT('salvato');
      if (desk){ const k=Object.keys(T.files).find(x=>/\.acchspettri$/.test(x)); await AcchDesktop.openPath(k); await wait(800); snapT('riaperto');
        T.failWrite=true; await AcchProject.saveAs(); await wait(300); snapT('errore scrittura'); T.failWrite=false;
        await AcchDesktop.openPath('/tmp/tono/non-esiste.acchspettri'); await wait(300); snapT('errore lettura');
        T.files['/tmp/tono/rotto.acchspettri']=Array.from(new TextEncoder().encode('PK rotto')); await AcchDesktop.openPath('/tmp/tono/rotto.acchspettri'); await wait(300); snapT('progetto rotto'); }
      AcchProject.closeProject && setTimeout(()=>{ const b=[...document.querySelectorAll('#cfBtns button')].find(x=>/Non salvare|Don't save/.test(x.textContent)); if (b) b.click(); }, 200);
      await AcchProject.newProject(); await wait(300); snapT('nuovo progetto'); });
    const toB64=u=>{ let s=''; for (let i=0;i<u.length;i+=0x8000) s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000)); return btoa(s); };
    const outFiles=[]; if (desk){ for (const k of Object.keys(T.files)) if (/\.(zip|pdf|csv)$/.test(k)) outFiles.push([k, toB64(Uint8Array.from(T.files[k]))]); }
    else for (const [n,b] of exported) outFiles.push([n, toB64(new Uint8Array(await b.arrayBuffer()))]);
    const menu=T.menu||null;
    return {hasDl:!!document.querySelector('#dlgDownload'), shots, msgs:T.msgs, title:T.title||'', menu, outFiles, lang:AcchI18n.lang, misses:window.ACCH_DESK&&ACCH_DESK.misses?[...ACCH_DESK.misses]:[]};
  }, [FILES, RIGHE, lang, desk]);
}
async function exportsText(outFiles){
  const list=[];
  for (const [name,b64] of outFiles){ const buf=Buffer.from(b64,'base64');
    if (/\.pdf$/.test(name)) list.push(['pdf '+name, pdfText(buf).join('\n')]);
    else if (/\.zip$/.test(name)){ const Z=await JSZip.loadAsync(buf); for (const k of Object.keys(Z.files)){ if (Z.files[k].dir) continue;
        if (/\.pdf$/.test(k)) list.push(['pdf '+k, pdfText(Buffer.from(await Z.file(k).async('uint8array'))).join('\n')]);
        else if (/\.(csv|txt|md|json)$/.test(k)) list.push([k, await Z.file(k).async('string')]); } }
    else list.push([name, buf.toString('utf8')]); }
  return list;
}
async function run(opt){
  const o=await open(opt); await o.p.addInitScript(()=>{}); await o.p.evaluate(`window.__snap=${snap.toString()}`);
  const r=await journey(o.p, opt.lang||'it', !!opt.desk); r.errors=o.errors; r.dialogs=o.dialogs; await o.ctx.close();
  r.exp=await exportsText(r.outFiles);
  if (process.env.TONO_DUMP) fs.writeFileSync(process.env.TONO_DUMP+'-'+(opt.desk?'desk':'web')+'-'+(opt.lang||'it')+'.json', JSON.stringify({problems:problems([...r.shots, ...r.msgs.map(m=>['messaggio',m]), ...r.dialogs.map(m=>['dialogo',m]), ['titolo finestra',r.title], ...menuTexts(r.menu), ...r.exp]), misses:r.misses, r}, null, 1));
  return r;
}

for (const lang of ['it','en']) describe(`Tono del desktop (${lang})`, {timeout:10*60*1000}, ()=>{
  let R;
  before(async ()=>{ R=await run({desk:true, lang:lang==='en'?'en':null, os:'macos'}); });
  it('il giro è completo: menu, esportazione e progetto ci sono davvero', ()=>{
    const err=R.shots.filter(s=>/^ERRORE/.test(s[0])); assert.deepStrictEqual(err, []); assert.equal(R.lang, lang);
    assert.ok(R.menu && R.menu.length>=5, 'menu nativo costruito');
    assert.ok(R.exp.some(x=>/^pdf /.test(x[0])) && R.exp.some(x=>/\.csv$/.test(x[0])), 'PDF e CSV esportati: '+R.exp.map(x=>x[0]).join(', '));
    assert.ok(R.shots.some(s=>/^vista benvenuto/.test(s[0])) && R.shots.some(s=>/^vista novità/.test(s[0])));
    assert.equal(R.hasDl, false, 'la finestra di download della pagina online non c\'è nel desktop');
  });
  if (lang==='en') it('in inglese nessun testo del desktop resta in italiano', ()=>{
    const all=[...R.shots, ...R.msgs.map(m=>['messaggio',m]), ...menuTexts(R.menu)].filter(x=>!/^dom nascosto/.test(x[0])), left=DESK_IT.filter(t=>all.some(([,v])=>v.includes(t)));
    assert.deepStrictEqual(left, []);
  });
  it('schermo, attributi, messaggi, dialoghi e menu: zero Gino, emoji, «!», «browser», «download»', ()=>{
    const P=problems([...R.shots, ...R.msgs.map(m=>['messaggio',m]), ...R.dialogs.map(m=>['dialogo',m]), ['titolo finestra',R.title], ...menuTexts(R.menu)]);
    assert.deepStrictEqual(P, [], P.length+' problemi:\n'+P.slice(0,80).join('\n'));
  });
  it('PDF e CSV esportati dal desktop: zero Gino, emoji, «!», «browser», «download»', ()=>{
    const P=problems(R.exp); assert.deepStrictEqual(P, [], P.length+' problemi:\n'+P.slice(0,60).join('\n'));
  });
  it('nessun errore nella pagina', ()=>assert.deepStrictEqual(R.errors, []));
});

describe('Online: Gino resta', {timeout:10*60*1000}, ()=>{
  let R;
  before(async ()=>{ R=await run({desk:false, lang:null}); });
  it('lo stesso giro nella pagina online trova Gino e le sue emoji', ()=>{
    assert.equal(R.hasDl, true, 'online la finestra di download resta');
    const all=[...R.shots, ...R.msgs.map(m=>['messaggio',m])];
    assert.ok(all.some(([,t])=>/\bGino\b/.test(t)), 'Gino non trovato nella pagina online');
    assert.ok(all.some(([,t])=>/\p{Extended_Pictographic}/u.test(t)), 'emoji non trovate nella pagina online');
  });
  it('nessun errore nella pagina', ()=>assert.deepStrictEqual(R.errors, []));
});
