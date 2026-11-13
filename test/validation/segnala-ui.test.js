// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// «Segnala un problema» nella pagina vera: desktop simulato con il finto Tauri (tauri-mock.js) e versione online.
// Comando nei menu, registro degli errori, avviso con «Segnalalo», riepilogo visibile, consenso al nome del file, oscuramento,
// Simple MAPI su Windows, ripiego mailto con lo screenshot in Download, nessun programma di posta. Dati SINTETICI.
// Uso: PW_CHANNEL=chrome node --test test/validation/segnala-ui.test.js
'use strict';
const {describe, it, before, after}=require('node:test'), assert=require('node:assert');
const B=require('./browser.js'), {openDesk}=require('./tauri-mock.js');

const ftir='Wavenumber (cm-1),Absorbance\n'+Array.from({length:400},(_,i)=>(4000-i*8)+','+(0.1+Math.exp(-Math.pow((i-150)/9,2))).toFixed(4)).join('\n');
const NAME='campione-riservato-42.csv';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let server, br;
before(async ()=>{ server=await B.startServer(); br=await B.launch(); });
after(async ()=>{ await br.close(); server.close(); });
const load=o=>o.p.evaluate(async ([t,n])=>{ await addEntries([{file:new File([t],n),path:'lab/'+n}]); document.querySelectorAll('dialog[open]').forEach(d=>d.close()); }, [ftir, NAME]);
async function desk(opt){ const o=await openDesk(B, br, server, opt); await o.p.waitForFunction(()=>window.__mock && window.__mock.menu); await o.p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close())); await load(o); return o; }
const menuItem=o=>o.p.evaluate(()=>{ const help=window.__mock.menu.find(m=>m.text==='Aiuto'||m.text==='Help'); return help ? help.items.map(i=>i.text) : []; });
const uncaught=errs=>errs.filter(e=>!/errore provocato/.test(e));

describe('Segnala un problema', {timeout:6*60*1000}, ()=>{
  it('1 · desktop Windows: menu Aiuto, errore provocato nel registro, «Segnalalo», MAPI con destinatario, oggetto, corpo e allegato', async ()=>{
    const o=await desk();
    const items=await menuItem(o);
    await o.p.evaluate(n=>{ toast('⛔ '+n+': lettura non riuscita'); setTimeout(()=>{ throw new Error('errore provocato'); },0); }, NAME);
    await o.p.waitForSelector('#acchErrReport', {timeout:5000});
    const log=await o.p.evaluate(()=>AcchSegnalaCore.log.list().map(e=>e.level+' '+e.msg));
    await o.p.click('#acchErrReport'); await o.p.waitForSelector('#dlgReport[open]');
    const tech=await o.p.textContent('#rpTech'), shot=await o.p.evaluate(()=>!!AcchSegnala.shot && AcchSegnala.shot.width>0), attachOn=await o.p.isChecked('#rpAttach'), nameOn=await o.p.isChecked('#rpName');
    await o.p.fill('#rpDoing','esportavo il PDF'); await o.p.fill('#rpExpect','mi aspettavo il file');
    await o.p.click('#rpSend'); await o.p.waitForFunction(()=>$('#rpMsg').textContent.length>0, null, {timeout:10000});
    const calls=await o.p.evaluate(()=>window.__mock.calls.filter(c=>/report/.test(c.cmd))), msg=await o.p.textContent('#rpMsg');
    const errs=uncaught(await (async()=>{ const e=o.errors.slice(); await o.ctx.close(); return e; })());
    assert.deepStrictEqual(errs, []);
    assert.ok(items.includes('Segnala un problema…'), 'voce nel menu Aiuto: '+items.join(', '));
    assert.ok(log.some(l=>/^ERROR JS: errore provocato/.test(l)), 'errore provocato nel registro: '+log.join(' | '));
    assert.ok(log.some(l=>l.startsWith('ERROR '+NAME)), 'avviso ⊘ nel registro');
    assert.ok(shot && attachOn, 'screenshot catturato e «Allega» acceso'); assert.strictEqual(nameOn, false, 'nome del file spento di default');
    assert.ok(/Versione di Acchiappaspettri: 3\.0\.0/.test(tech) && /Edizione: desktop/.test(tech) && /Sistema: Windows/.test(tech) && /Lingua:/.test(tech) && /FTIR.*\.csv/.test(tech) && /errore provocato/.test(tech), tech);
    assert.ok(!tech.includes('campione-riservato'), 'nome del file nel riepilogo senza consenso: '+tech);
    const save=calls.find(c=>c.cmd==='save_report_shot'), mapi=calls.find(c=>c.cmd==='send_report_mapi');
    assert.ok(save && save.args.dest==='temp' && /^Acchiappaspettri-segnalazione-\d{4}-\d\d-\d\d-\d{6}\.png$/.test(save.args.name), JSON.stringify(save&&save.args));
    assert.deepStrictEqual(save.args.png, [137,80,78,71,13,10,26,10], 'PNG vero');
    assert.ok(mapi, 'MAPI non chiamato');
    assert.strictEqual(mapi.args.to, 'lorenzo.birindelli@cnr.it');
    assert.match(mapi.args.subject, /^Acchiappaspettri 3\.0\.0\S*: segnalazione di un problema$/);
    for (const s of ['esportavo il PDF','mi aspettavo il file','Lo screenshot della finestra è allegato.','errore provocato','Avviso mostrato']) assert.ok(mapi.args.body.includes(s), 'manca «'+s+'»');
    assert.ok(!mapi.args.body.includes('campione-riservato'), 'nome del file nel corpo senza consenso');
    assert.ok(mapi.args.attachment && mapi.args.attachment.endsWith(save.args.name), 'allegato: '+mapi.args.attachment);
    assert.ok(!/inviat/i.test(msg) && /programma di posta/.test(msg), 'conferma onesta: '+msg);
    assert.ok(!calls.some(c=>c.cmd==='openUrl'));
  });

  it('2 · MAPI assente: mailto codificato sotto i 1900 caratteri, screenshot in Download, «Mostra nella cartella»; con il consenso c\'è il nome', async ()=>{
    const o=await desk();
    await o.p.evaluate(()=>{ window.__mock.mapi='mapi-unavailable'; for (let i=0;i<30;i++) console.warn('avviso sintetico '+i+' '+'y'.repeat(120)); });
    await o.p.evaluate(()=>AcchSegnala.open()); await o.p.waitForSelector('#dlgReport[open]');
    await o.p.check('#rpName'); const tech=await o.p.textContent('#rpTech');
    await o.p.fill('#rpExpect','accento è & simboli ?=#% e a capo\nseconda riga');
    await o.p.click('#rpSend'); await o.p.waitForFunction(()=>$('#rpMsg').textContent.length>0, null, {timeout:10000});
    await o.p.click('#rpReveal');
    const calls=await o.p.evaluate(()=>window.__mock.calls), msg=await o.p.textContent('#rpMsg');
    const errs=await (async()=>{ const e=o.errors.slice(); await o.ctx.close(); return e; })();
    assert.deepStrictEqual(errs, []);
    assert.ok(tech.includes('Nome del file: '+NAME), 'con il consenso il riepilogo mostra il nome');
    const url=calls.find(c=>c.cmd==='openUrl').args.u, save=calls.find(c=>c.cmd==='save_report_shot' && c.args.dest==='downloads');
    assert.ok(url.length<=1900, 'lunghezza '+url.length);
    assert.ok(url.startsWith('mailto:lorenzo.birindelli@cnr.it?subject=Acchiappaspettri%203.0.0'), url.slice(0,90));
    assert.ok(!/[ \n#]/.test(url), 'caratteri non codificati nel mailto');
    const body=decodeURIComponent(url.split('&body=')[1]);
    assert.ok(body.includes('accento è & simboli ?=#% e a capo\r\nseconda riga'), 'testo dell\'utente intatto dopo la decodifica');
    assert.ok(body.includes('Nome del file: '+NAME));
    assert.strictEqual(save.args.dest, 'downloads');
    assert.ok(body.includes('cartella Download («'+save.args.name+'»)'), 'il corpo dice dove è lo screenshot');
    assert.ok(calls.some(c=>c.cmd==='revealItemInDir' && c.args.p.endsWith(save.args.name)), '«Mostra nella cartella»');
    assert.ok(/Messaggio preparato nel programma di posta/.test(msg) && /cartella Download/.test(msg) && !/inviat/i.test(msg), msg);
  });

  it('3 · nessun programma di posta: avviso con l\'indirizzo', async ()=>{
    const o=await desk();
    await o.p.evaluate(()=>{ window.__mock.mapi='mapi-failed: 2'; window.__mock.openFail=true; });
    await o.p.evaluate(()=>AcchSegnala.open()); await o.p.waitForSelector('#dlgReport[open]');
    await o.p.uncheck('#rpAttach'); await o.p.click('#rpSend'); await o.p.waitForFunction(()=>$('#rpMsg').textContent.length>0, null, {timeout:10000});
    const msg=await o.p.textContent('#rpMsg'), calls=await o.p.evaluate(()=>window.__mock.calls.filter(c=>/report|openUrl/.test(c.cmd)).map(c=>c.cmd)), copyBtn=await o.p.isVisible('#rpCopy');
    await o.ctx.close();
    assert.ok(/Non si è aperto nessun programma di posta/.test(msg) && msg.includes('lorenzo.birindelli@cnr.it'), msg);
    assert.ok(copyBtn, '«Copia il testo del messaggio» disponibile');
    assert.ok(!calls.includes('save_report_shot'), 'screenshot non allegato: non si salva: '+calls);
  });

  it('4 · lo screenshot oscurato non contiene i pixel coperti', async ()=>{
    const o=await desk();
    await o.p.evaluate(()=>AcchSegnala.open()); await o.p.waitForSelector('#dlgReport[open]');
    // copertura disegnata con il mouse sull'anteprima, sopra il grafico
    const b=await o.p.locator('#rpCanvas').boundingBox();
    await o.p.mouse.move(b.x+b.width*0.3, b.y+b.height*0.2); await o.p.mouse.down(); await o.p.mouse.move(b.x+b.width*0.6, b.y+b.height*0.6, {steps:5}); await o.p.mouse.up();
    const r=await o.p.evaluate(()=>{ const R=AcchSegnala.rects[0], s=AcchSegnala.shot, k=s.k, x0=Math.ceil(Math.min(R.x,R.x+R.w)*k), y0=Math.ceil(Math.min(R.y,R.y+R.h)*k), w=Math.floor(Math.abs(R.w)*k)-1, h=Math.floor(Math.abs(R.h)*k)-1;
      const px=c=>c.getContext('2d').getImageData(x0,y0,w,h).data, a=px(AcchSegnala.redacted()), o=px(s); let black=0, origDark=0, n=a.length/4;
      for (let i=0;i<a.length;i+=4){ if (a[i]===0&&a[i+1]===0&&a[i+2]===0&&a[i+3]===255) black++; if (o[i]<10&&o[i+1]<10&&o[i+2]<10) origDark++; }
      const out=AcchSegnala.redacted().getContext('2d').getImageData(2,2,1,1).data;
      return {n, black, origDark, rects:AcchSegnala.rects.length, outside:[...out]}; });
    await o.ctx.close();
    assert.strictEqual(r.rects, 1, 'rettangolo disegnato');
    assert.ok(r.n>1000, 'zona coperta troppo piccola: '+r.n);
    assert.strictEqual(r.black, r.n, 'pixel coperti non tutti neri');
    assert.ok(r.origDark<r.n*0.5, 'l\'originale nella zona non era già nero');
    assert.notDeepStrictEqual(r.outside.slice(0,3), [0,0,0], 'fuori dalla copertura l\'immagine resta');
  });

  it('5 · desktop sobrio, online con il suo tono: finestra senza emoji né «!»; online mailto e download dello screenshot', async ()=>{
    const o=await desk();
    await o.p.evaluate(()=>AcchSegnala.open()); await o.p.waitForSelector('#dlgReport[open]');
    const deskTxt=await o.p.evaluate(()=>{ const d=$('#dlgReport'); return d.innerText+' '+[...d.querySelectorAll('[title],[aria-label],[placeholder]')].map(e=>(e.title||'')+(e.getAttribute('aria-label')||'')+(e.placeholder||'')).join(' '); });
    await o.ctx.close();
    assert.ok(!/\p{Extended_Pictographic}/u.test(deskTxt), 'emoji nel desktop'); assert.ok(!/!|Gino/.test(deskTxt), 'esclamazioni o Gino nel desktop');
    const w=await B.openPage(br, server, {});
    await w.p.evaluate(async ([t,n])=>{ await addEntries([{file:new File([t],n),path:n}]); document.querySelectorAll('dialog[open]').forEach(d=>d.close()); }, [ftir, NAME]);
    const inPalette=await w.p.evaluate(()=>commands().some(c=>c.grp==='Aiuto' && c.label==='Segnala un problema'));
    await w.p.evaluate(()=>commands().find(c=>c.label==='Segnala un problema').run()); await w.p.waitForSelector('#dlgReport[open]');
    const title=await w.p.textContent('#rpTitle'), tech=await w.p.textContent('#rpTech');
    const [dl]=await Promise.all([w.p.waitForEvent('download', {timeout:10000}), w.p.click('#rpSend')]);
    await w.p.waitForFunction(()=>window.ACCH_LAST_MAILTO);
    const url=await w.p.evaluate(()=>window.ACCH_LAST_MAILTO), errs=w.errors.slice();
    await w.ctx.close();
    assert.deepStrictEqual(errs, []);
    assert.ok(inPalette, 'voce «Segnala un problema» nel gruppo Aiuto della barra dei comandi');
    assert.match(title, /🐞/); assert.ok(/Edizione: online/.test(tech), tech);
    assert.match(dl.suggestedFilename(), /^Acchiappaspettri-segnalazione-\d{4}-\d\d-\d\d-\d{6}\.png$/);
    assert.ok(url.length<=1900 && url.startsWith('mailto:lorenzo.birindelli@cnr.it?subject='));
    const body=decodeURIComponent(url.split('&body=')[1]);
    assert.ok(body.includes(dl.suggestedFilename()) && !body.includes('campione-riservato'), body);
  });

  it('6 · in inglese: comando, finestra e mail tradotti', async ()=>{
    const o=await openDesk(B, br, server, {lang:'en'}); await o.p.waitForFunction(()=>window.__mock && window.__mock.menu);
    await o.p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
    const items=await menuItem(o);
    await o.p.evaluate(()=>{ window.__mock.mapi='mapi-unavailable'; AcchSegnala.open(); }); await o.p.waitForSelector('#dlgReport[open]'); await sleep(200);
    const txt=await o.p.evaluate(()=>$('#dlgReport').innerText);
    await o.p.click('#rpSend'); await o.p.waitForFunction(()=>$('#rpMsg').textContent.length>0, null, {timeout:10000});
    const url=await o.p.evaluate(()=>window.__mock.calls.find(c=>c.cmd==='openUrl').args.u), msg=await o.p.textContent('#rpMsg');
    await o.ctx.close();
    assert.ok(items.includes('Report a problem…'), items.join(', '));
    assert.ok(/Report a problem/.test(txt) && /Attach the screenshot/.test(txt) && !/Segnala|Allega/.test(txt), txt.slice(0,400));
    assert.ok(decodeURIComponent(url).includes('problem report') && decodeURIComponent(url).includes('Technical data'));
    assert.ok(/Message prepared in the email program/.test(msg), msg);
  });
});
