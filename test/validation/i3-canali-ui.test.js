// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I3, HPLC multicanale: tutti i canali dichiarati vengono letti (ChemStation/OpenLab .ch, .uv, CSV a colonne e a blocchi, Waters .arw,
// Shimadzu a più blocchi e più campioni), la finestra «Canali trovati» sceglie campioni × canali, un cromatogramma per canale con
// f.channel e f.sampleKey, i byte del file una volta sola nel progetto, la memoria di ogni canale ritrovata alla riapertura.
// Dati SINTETICI (test/fixtures/gen-canali.js); i binari Agilent seguono una disposizione DEDOTTA, non file veri.
'use strict';
const test=require('node:test'), assert=require('node:assert'), JSZip=require('jszip'), F=require('../../app/project-format.js');
const {startServer, launch, openPage}=require('./browser.js'), {tauriMock}=require('./tauri-mock.js'), G=require('../fixtures/gen-canali.js');
const b64=v=>Buffer.from(v).toString('base64');
const near=(x,v,tol,msg)=>assert.ok(x!=null && Math.abs(x-v)<tol, `${msg}: ${x}, atteso ${v}`);

const PAGE=()=>{ window.I3={
  ents(L){ return L.map(([path,b])=>({file:new File([Uint8Array.from(atob(b),c=>c.charCodeAt(0))], path.split('/').pop()), path})); },
  async load(L, answer){ let fin=false; const pr=addEntries(I3.ents(L)).finally(()=>{ fin=true; }); let shown=null;
    while (!fin){ await new Promise(r=>setTimeout(r,20)); const d=$('#dlgChan'); if (d.open){ shown=I3.dialog(); if (answer) await answer(d); else d.querySelector('#chOk').click(); break; } }
    await pr; return {shown, list:I3.list(), note:$('#skipNote').innerText}; },
  dialog(){ const d=$('#dlgChan'), cells=[...d.querySelectorAll('tbody tr')].map(tr=>[...tr.querySelectorAll('td')].map(td=>{ const i=td.querySelector('input'); return i ? (i.checked?'x':'o') : '-'; }).join(''));
    return {title:$('#chTitle').textContent, intro:$('#chIntro').textContent, cols:[...d.querySelectorAll('thead th')].slice(1).map(t=>t.querySelector('label').textContent.trim()), rows:[...d.querySelectorAll('tbody th.chrow label')].map(l=>l.textContent.trim()), cells, ok:$('#chOk').textContent, uv:!$('#chUv').hidden, uvWl:$('#chUvWl').value, text:d.innerText}; },
  list(){ return files.map(f=>({path:f.path, name:f.name, channel:f.channel||null, sampleKey:f.sampleKey==null?null:f.sampleKey, chan:chanOf(f), n:f.xs.length, instr:f.instr, title:f.title, y0:f.ys[0], ymax:Math.max(...f.ys), shown:dispTitle(f)})); },
  calib(conc){ const c=mvCfg('hplc'); Object.assign(c,{a:4.8,b:5.2,meas:'area',model:'line'}); mvSave(); for (const f of files){ const m=/(STD\d)/.exec(f.path); if (m) anSet(f,'conc',conc[m[1]]); } },
  async read(){ openTab('multi'); $('#secMulti').open=true; $('#mvInstr').value='hplc'; renderMulti(); await new Promise(q=>setTimeout(q,60));
    const sel=$('#mvChan'), box=!$('#mvChanBox').hidden, chans=box?[...sel.options].map(o=>o.value):[null], out=[];
    for (const ch of chans){ if (ch!=null){ sel.value=ch; sel.onchange({target:sel}); await new Promise(q=>setTimeout(q,60)); }
      const rows=mvTable('hplc')||[], cal=mvCalib(rows);
      out.push({ch, rows:rows.map(o=>o.f.path+'|'+(o.f.channel||'')), pred:Object.fromEntries(cal&&cal.predict?rows.filter(o=>o.conc==null&&o.y!=null).map(o=>[o.f.path+'|'+chanOf(o.f), cal.predict(o.y,1).x]):[])}); }
    return {box, chans, out}; },
  async save(){ let out=null; const h=AcchProject.host, old=h.saveAs; h.saveAs=async b=>{ out=b; return {name:'i3.acchspettri', path:null}; }; await AcchProject.saveAs(); h.saveAs=old; let s=''; for (let i=0;i<out.length;i+=0x8000) s+=String.fromCharCode.apply(null,out.subarray(i,i+0x8000)); return btoa(s); },
  async open(b){ const t0=performance.now(); let dlg=false; const iv=setInterval(()=>{ if ($('#dlgChan').open){ dlg=true; $('#chOk').click(); } },20); const ok=await AcchProject.openBytes(Uint8Array.from(atob(b),c=>c.charCodeAt(0)),'i3.acchspettri',null); clearInterval(iv); return {ok, dlg, list:I3.list(), toasts:I3_TOASTS.slice()}; }
}; window.I3_TOASTS=[]; const o=toast; toast=function(t){ I3_TOASTS.push(String(t)); return o.apply(this, arguments); }; };
async function withPage(b, server, opt, fn){ const {ctx, p, errors}=await openPage(b, server, Object.assign({desk:true, canali:'chiedi'}, opt||{})); try{ await p.evaluate(PAGE); const r=await fn(p); assert.deepEqual(errors, []); return r; } finally { await ctx.close(); } }
const CORPUS=()=>Object.entries(G.corpus()).map(([k,v])=>[k,b64(v)]);
const CONC={STD1:1, STD2:2, STD3:3};

test('I3 canali HPLC', async t=>{
  const server=await startServer(), b=await launch();
  try{
    await t.test('cartelle .D (DAD1A.ch e DAD1B.ch), Shimadzu a 2 canali e Waters .arw: griglia campioni × canali, tutti i canali dichiarati letti', async ()=>{
      const r=await withPage(b, server, {}, p=>p.evaluate(async L=>{ const r=await I3.load(L); I3.calib({STD1:1,STD2:2,STD3:3}); r.cal=await I3.read(); return r; }, CORPUS()));
      assert.equal(r.shown.title, 'Canali trovati');
      assert.deepEqual(r.shown.rows, ['STD1','STD2','STD3','INC','MIX1','MIX1']);
      assert.deepEqual(r.shown.cols, ['DAD1A 254 nm','DAD1B 280 nm','Det A-Ch1 254 nm','Det A-Ch2 280 nm','PDA Ch1 254 nm','PDA Ch2 280 nm']);
      assert.deepEqual(r.shown.cells, ['xx----','xx----','xx----','xx----','--xx--','----xx']);
      assert.equal(r.shown.ok, 'Carica 12 cromatogrammi');
      assert.equal(r.list.length, 12, 'canali letti ≠ dichiarati');
      const ch=r.list.filter(f=>/\.ch$/.test(f.path));
      assert.deepEqual([...new Set(ch.map(f=>f.channel))], ['DAD1A 254/4 nm ref 360/100 nm','DAD1B 280/4 nm ref 360/100 nm']);
      assert.ok(r.list.every(f=>f.instr==='hplc' && f.sampleKey===null && f.channel), 'manca il canale');
      const shim=r.list.filter(f=>/shimadzu/.test(f.path)); assert.deepEqual(shim.map(f=>f.channel), ['Det A-Ch1 254 nm','Det A-Ch2 280 nm']); assert.deepEqual(shim.map(f=>f.n), [1201,1201]);
      near(shim[0].ymax, 20100, 30, 'Shimadzu canale 1, massimo'); near(shim[1].ymax, 7100, 30, 'Shimadzu canale 2, massimo');
      assert.deepEqual(r.list.filter(f=>/arw$/.test(f.path)).map(f=>f.channel), ['PDA Ch1 254/1.2 nm','PDA Ch2 280/1.2 nm']);
      assert.match(r.note, /tracce di stato dello strumento \(Pump A Pressure\) non sono canali del rivelatore/);
      // la taratura usa un canale alla volta: l'incognito a 1,5 si ritrova in tutti e due i canali Agilent
      const A=r.cal.out.find(o=>o.ch==='DAD1A 254 nm'), B=r.cal.out.find(o=>o.ch==='DAD1B 280 nm'); assert.ok(A && B, 'canali della taratura: '+r.cal.chans);
      assert.ok(A.rows.every(x=>/DAD1A/.test(x)), 'retta del canale A con un altro canale: '+A.rows);
      near(A.pred['INC.D/DAD1A.ch|DAD1A 254 nm'], 1.5, 0.05, 'incognito, canale A'); near(B.pred['INC.D/DAD1B.ch|DAD1B 280 nm'], 1.5, 0.05, 'incognito, canale B');
    });

    await t.test('scelta nella griglia: tolta la colonna DAD1B e una cella, gli altri caricati; ciò che non è scelto è detto', async ()=>{
      const r=await withPage(b, server, {}, p=>p.evaluate(async L=>I3.load(L, async d=>{ d.querySelector('thead input[data-col="1"]').click(); d.querySelector('tbody tr:nth-child(5) td:nth-child(4) input').click(); I3.after=I3.dialog(); d.querySelector('#chOk').click(); }).then(r=>Object.assign(r,{after:I3.after})), CORPUS()));
      assert.deepEqual(r.after.cells, ['xo----','xo----','xo----','xo----','--ox--','----xx']); assert.equal(r.after.ok, 'Carica 7 cromatogrammi');
      assert.equal(r.list.length, 7); assert.ok(!r.list.some(f=>/DAD1B/.test(f.channel||'')));
      assert.match(r.note, /5 canali non caricati perché non selezionati: STD1 · DAD1B 280 nm/);
    });

    await t.test('scelta predefinita: fluorescenza e canali senza nome non spuntati (ma detti); «Ricorda la scelta» vale la volta dopo', async ()=>{
      const A=G.chrom(800,0.01,[[3,40,0.05]],0.5,1), csv=G.writeCsvCols(['DAD1 A, Sig=254,4 Ref=360,100','FLD1 A, Ex=230, Em=330','VWD1 A, Wavelength=220 nm'],[A,A,A]);
      const r=await withPage(b, server, {}, p=>p.evaluate(async c=>{ const r1=await I3.load([['a.csv',c]]);
        const r2=await I3.load([['b.csv',c]], async d=>{ I3.b=I3.dialog(); d.querySelector('#chRemember').click(); d.querySelector('tbody input[data-c="0"]').click(); d.querySelector('tbody input[data-c="1"]').click(); d.querySelector('#chOk').click(); });
        const r3=await I3.load([['c.csv',c]], async d=>{ I3.c=I3.dialog(); d.querySelector('#chOk').click(); }); return {r1, b:I3.b, c:I3.c, list:I3.list().map(f=>f.path+' '+f.chan)}; }, btoa(csv)));
      assert.deepEqual(r.r1.shown.cols, ['DAD1A 254 nm','FLD1A 330 nm','VWD1A 220 nm']); assert.deepEqual(r.r1.shown.cells, ['xox']);
      assert.match(r.r1.note, /1 canale non caricato perché non selezionato: a\.csv · FLD1A 330 nm/);
      assert.deepEqual(r.b.cells, ['xox']); assert.deepEqual(r.c.cells, ['oxx'], 'la scelta ricordata non è stata applicata');
      assert.deepEqual(r.list, ['a.csv DAD1A 254 nm','a.csv VWD1A 220 nm','b.csv FLD1A 330 nm','b.csv VWD1A 220 nm','c.csv FLD1A 330 nm','c.csv VWD1A 220 nm']);
    });

    await t.test('Annulla: nessun file multicanale caricato, e lo si dice; il file a un canale arriva lo stesso', async ()=>{
      const one='Time (min),Value (mAU)\n'+Array.from({length:500},(_,i)=>(i*0.01).toFixed(3)+','+(1+Math.exp(-0.5*((i*0.01-2)/0.05)**2)).toFixed(4)).join('\n');
      const r=await withPage(b, server, {}, p=>p.evaluate(async L=>I3.load(L, async d=>d.querySelector('#chCancel').click()), CORPUS().concat([['solo.csv', btoa(one)]])));
      assert.deepEqual(r.list.map(f=>f.path), ['solo.csv']); assert.match(r.note, /Scelta dei canali annullata: 10 file non sono stati caricati/);
    });

    await t.test('progetto: byte di ogni file una volta sola, un record per canale; riaperto senza finestra, con la memoria di ogni canale', async ()=>{
      const s=await withPage(b, server, {}, p=>p.evaluate(async L=>{ await I3.load(L); const f=files.find(f=>/INC\.D\/DAD1B/.test(f.path)); f.title='INC a 280'; f.removed=[5]; persist(f);
        const g=files.find(f=>/shimadzu/.test(f.path) && /Ch2/.test(f.channel)); g.desc='canale 2'; persist(g); return I3.save(); }, CORPUS()));
      const P=await F.decode(Uint8Array.from(Buffer.from(s,'base64')), JSZip);
      assert.equal(P.sources.length, 10, 'un file, una sorgente'); assert.equal(P.spectra.length, 12);
      const sh=P.spectra.filter(x=>/shimadzu/.test(x.path)); assert.equal(new Set(sh.map(x=>x.source)).size, 1); assert.deepEqual(sh.map(x=>x.channel), ['Det A-Ch1 254 nm','Det A-Ch2 280 nm']);
      assert.ok(P.spectra.every(x=>x.channel && x.sampleKey===null));
      const r=await withPage(b, server, {}, p=>p.evaluate(async s=>I3.open(s), s));
      assert.ok(r.ok); assert.equal(r.dlg, false, 'la finestra dei canali non deve comparire alla riapertura'); assert.equal(r.list.length, 12);
      const inc=r.list.filter(f=>/INC\.D/.test(f.path)); assert.deepEqual(inc.map(f=>f.title), ['', 'INC a 280'], 'memoria sul canale sbagliato');
      assert.ok(!r.toasts.some(t=>/non sono stati riconosciuti|non si ritrovano/.test(t)), r.toasts.join(' | '));
    });

    await t.test('file grezzi riaperti: un canale salvato che il file non contiene più viene contato', async ()=>{
      const s=await withPage(b, server, {}, p=>p.evaluate(async L=>{ await I3.load(L); return I3.save(); }, CORPUS().filter(([k])=>/arw/.test(k))));
      const P=await F.decode(Uint8Array.from(Buffer.from(s,'base64')), JSZip); P.spectra[1].channel='PDA Ch9 999 nm';
      const out=await F.encode({appVersion:'3.0.0', title:'', state:P.state, spectra:P.spectra.map(x=>({name:x.name, path:x.path, bytes:x.bytes, binary:x.binary, memory:x.memory, sampleKey:x.sampleKey, channel:x.channel})), libraries:[], results:[]}, JSZip);
      const r=await withPage(b, server, {}, p=>p.evaluate(async s=>I3.open(s), b64(out)));
      assert.equal(r.list.length, 1); assert.ok(r.toasts.some(t=>/1 canali salvati nel progetto non si ritrovano/.test(t)), r.toasts.join(' | '));
      assert.ok(!r.toasts.some(t=>/file del progetto non sono stati riconosciuti/.test(t)), 'il file c\'è: non va contato fra i non riconosciuti');
    });

    await t.test('ChemStation/OpenLab di testo: CSV con 3 segnali in colonna, e segnali in blocchi uno dopo l\'altro (dichiarati 3, letti 2)', async ()=>{
      const A=G.chrom(2001,0.005,[[5,40,0.05]],0.5,1), B=G.chrom(2001,0.005,[[5,13,0.05]],0.5,2), D=G.chrom(2001,0.005,[[5,5,0.05]],0.5,3);
      const cols=G.writeCsvCols(['DAD1 A, Sig=254,4 Ref=360,100','DAD1 B, Sig=280,4 Ref=360,100','DAD1 C, Sig=320,8 Ref=off'],[A,B,D]);
      const blocks='Signal 1: DAD1 A, Sig=254,4 Ref=360,100\nSignal 2: DAD1 B, Sig=280,4 Ref=360,100\nSignal 3: DAD1 C, Sig=320,8 Ref=off\n\n'+G.writeCsvBlocks(['DAD1 A, Sig=254,4 Ref=360,100','DAD1 B, Sig=280,4 Ref=360,100'],[A,B]);
      const r=await withPage(b, server, {}, p=>p.evaluate(async L=>I3.load(L), [['colonne.csv',btoa(cols)],['blocchi.csv',btoa(blocks)]]));
      assert.deepEqual(r.list.map(f=>f.path+' '+f.channel), ['colonne.csv DAD1A 254/4 nm ref 360/100 nm','colonne.csv DAD1B 280/4 nm ref 360/100 nm','colonne.csv DAD1C 320/8 nm ref off','blocchi.csv DAD1A 254/4 nm ref 360/100 nm','blocchi.csv DAD1B 280/4 nm ref 360/100 nm']);
      const c=r.list.filter(f=>f.path==='colonne.csv'); near(c[0].ymax, 40.5, 0.1, 'colonna A'); near(c[1].ymax, 13.5, 0.1, 'colonna B'); near(c[2].ymax, 5.5, 0.1, 'colonna C');
      const k=r.list.filter(f=>f.path==='blocchi.csv'); near(k[1].ymax, 13.5, 0.1, 'blocco B'); assert.deepEqual(k.map(f=>f.n), [2001,2001]);
      assert.match(r.note, /«blocchi\.csv»: il file dichiara 3 canali, ne ho letti 2/);
    });

    await t.test('Shimadzu con 2 campioni nello stesso file: sampleKey e due righe; punti dichiarati diversi da quelli letti', async ()=>{
      const A=G.chrom(601,0.01,[[3,1000,0.05]],10,1), B=G.chrom(601,0.01,[[3,500,0.05]],10,2);
      const txt=G.writeShimadzu([{sample:'STD1', channels:[Object.assign({name:'Detector A-Ch1', wl:254, mult:0.001},A), Object.assign({name:'Detector A-Ch2', wl:280, declare:700},B)]}, {sample:'STD2', channels:[Object.assign({name:'Detector A-Ch1', wl:254, mult:0.001},A)]}]);
      const r=await withPage(b, server, {}, p=>p.evaluate(async L=>I3.load(L), [['lotto.txt',btoa(txt)]]));
      assert.deepEqual(r.shown.rows, ['STD1','STD2']); assert.deepEqual(r.shown.cells, ['xx','x-']);
      assert.deepEqual(r.list.map(f=>[f.sampleKey,f.channel]), [['STD1','Det A-Ch1 254 nm'],['STD1','Det A-Ch2 280 nm'],['STD2','Det A-Ch1 254 nm']]);
      near(r.list[0].ymax, 1010, 2, 'moltiplicatore dell\'intensità'); assert.match(r.list[0].shown, /lotto\.txt · STD1 · Det A-Ch1 254 nm/);
      assert.match(r.note, /canale «Det A-Ch2 280 nm»: dichiarati 700 punti, letti 601/);
    });

    await t.test('.uv di ChemStation (spettri DAD): cromatogrammi estratti alle λ indicate, accanto ai .ch dello stesso campione', async ()=>{
      const n=400, T=Array.from({length:n},(_,i)=>i*0.01), wl=Array.from({length:106},(_,j)=>190+2*j);
      const spec=T.map(t=>wl.map(w=>0.1+50*Math.exp(-0.5*((t-2)/0.05)**2)*Math.exp(-0.5*((w-260)/15)**2)));
      const uv=G.writeUv({times:T, a:190, b:400, s:2, spectra:spec, sample:'STD1'}), A=G.chrom(n,0.01,[[2,40,0.05]],0.5,1);
      const ch=G.writeCh({sample:'STD1', signal:'DAD1 A, Sig=254,4 Ref=360,100', units:'mAU', t0:0, t1:(n-1)*0.01, ys:A.ys});
      const r=await withPage(b, server, {}, p=>p.evaluate(async L=>I3.load(L, async d=>{ I3.before=I3.dialog(); d.querySelector('#chUvWl').value='254, 300'; d.querySelector('#chUvWl').dispatchEvent(new Event('change')); d.querySelectorAll('tbody input[data-c="1"],tbody input[data-c="2"]').forEach(i=>i.click()); I3.after=I3.dialog(); d.querySelector('#chOk').click(); }).then(r=>Object.assign(r,{before:I3.before, after:I3.after})), [['STD1.D/DAD1A.ch',b64(ch)],['STD1.D/DAD1.UV',b64(uv)]]));
      assert.ok(r.before.uv); assert.equal(r.before.uvWl, '254'); assert.deepEqual(r.before.cols, ['DAD1A 254 nm','UV 254 nm']); assert.deepEqual(r.before.cells, ['xo'], '.uv spento di norma se il campione ha già i suoi segnali');
      assert.deepEqual(r.after.cols, ['DAD1A 254 nm','UV 254 nm','UV 300 nm']); assert.deepEqual(r.after.cells, ['xxx']);
      assert.deepEqual(r.list.map(f=>f.channel), ['DAD1A 254/4 nm ref 360/100 nm','UV 254/4 nm extracted','UV 300/4 nm extracted']);
      const want=w=>0.1+50*[w-2,w,w+2].map(x=>Math.exp(-0.5*((x-260)/15)**2)).reduce((a,b)=>a+b)/3;
      near(r.list[1].ymax, want(254), 0.002, 'λ 254 dagli spettri'); near(r.list[2].ymax, want(300), 0.002, 'λ 300 dagli spettri'); assert.equal(r.list[1].n, n);
      // salvato e riaperto: i canali estratti tornano dalla loro λ
      const s=await withPage(b, server, {}, p=>p.evaluate(async L=>{ window.ACCH_CANALI='tutti'; await I3.load(L); return I3.save(); }, [['STD1.D/DAD1.UV',b64(uv)]]));
      const o=await withPage(b, server, {}, p=>p.evaluate(async s=>I3.open(s), s)); assert.deepEqual(o.list.map(f=>f.channel), ['UV 260/4 nm extracted']); assert.equal(o.dlg, false);
    });

    await t.test('progetto della versione 1 con un file a due blocchi: si riapre come allora, un solo spettro (nessun numero cambia)', async ()=>{
      const A=G.chrom(2001,0.005,[[5,40,0.05]],0.5,1), B=G.chrom(3001,0.005,[[5,13,0.05]],0.5,2), txt=G.writeCsvBlocks(['DAD1 A, Sig=254,4 Ref=off','DAD1 B, Sig=280,4 Ref=off'],[A,B]);
      const out=await F.encode({appVersion:'3.0.0-rc.1', title:'', state:{}, spectra:[{name:'vecchio.csv', path:'vecchio.csv', bytes:new TextEncoder().encode(txt), memory:{title:'dalla 2.2', size:txt.length}}], libraries:[], results:[]}, JSZip);
      const r=await withPage(b, server, {}, p=>p.evaluate(async s=>I3.open(s), b64(out)));
      assert.equal(r.list.length, 1); assert.equal(r.list[0].channel, null); assert.equal(r.list[0].n, 3001, 'il blocco più lungo, come nella 2.2'); assert.equal(r.list[0].title, 'dalla 2.2'); assert.equal(r.dlg, false);
    });

    await t.test('tono: nel desktop la finestra è sobria, online parla Gino; in inglese tutto tradotto', async ()=>{
      const L=CORPUS().filter(([k])=>/arw/.test(k)), bad=/Gino|[\p{Extended_Pictographic}]|!/u;
      const d=await withPage(b, server, {desk:true}, p=>p.evaluate(async L=>I3.load(L), L));
      assert.doesNotMatch(d.shown.text, bad, 'desktop: '+d.shown.text); assert.match(d.shown.intro, /^1 campione, 2 canali\. Seleziona i cromatogrammi da caricare/);
      const w=await withPage(b, server, {desk:false}, p=>p.evaluate(async L=>I3.load(L), L)); assert.match(w.shown.intro, /Gino ha trovato più canali/);
      const e=await withPage(b, server, {desk:true, lang:'en'}, p=>p.evaluate(async L=>I3.load(L), L));
      assert.equal(e.shown.title, 'Channels found'); assert.match(e.shown.intro, /^1 sample, 2 channels\. Select the chromatograms to load/); assert.match(e.shown.ok, /^Load 2 chromatograms$/);
      assert.doesNotMatch(e.shown.text, /Campione|Seleziona tutti|Nessuno|Annulla|Carica/, 'testo italiano nella finestra inglese: '+e.shown.text);
    });

    await t.test('desktop: file grezzi aperti dal sistema (doppio clic, «Apri con») arrivano insieme, con la cartella .D', async ()=>{
      const C=G.corpus(), files={'C:\\Dati\\STD1.D\\DAD1A.ch':[...C['STD1.D/DAD1A.ch']], 'C:\\Dati\\STD1.D\\DAD1B.ch':[...C['STD1.D/DAD1B.ch']], '/home/u/lc.arw':[...Buffer.from(C['waters-2canali.arw'])]};
      const {ctx, p, errors}=await openPage(b, server, {desk:true, canali:'chiedi', init:[tauriMock]});
      try{ await p.evaluate(PAGE);
        const r=await p.evaluate(async f=>{ const M=window.__mock; Object.assign(M.files, Object.fromEntries(Object.entries(f).map(([k,v])=>[k,new Uint8Array(v)])));
          let shown=null; const iv=setInterval(()=>{ if ($('#dlgChan').open){ shown=I3.dialog(); $('#chOk').click(); } },20);
          // «Apri con» su tre file: il sistema li consegna uno alla volta, la pagina li legge insieme
          for (const path of Object.keys(f)){ M.pending=(M.pending||[]).concat([{path, name:path.split(/[\\/]/).pop()}]); M.emit('acch-open-files'); }
          for (let i=0;i<150 && files.length<4;i++) await new Promise(q=>setTimeout(q,40)); clearInterval(iv); return {shown, list:I3.list(), reads:M.calls.filter(c=>c.cmd==='read_file').map(c=>c.args.path)}; }, files);
        assert.deepEqual(r.list.map(f=>f.path+' '+f.channel), ['STD1.D/DAD1A.ch DAD1A 254/4 nm ref 360/100 nm','STD1.D/DAD1B.ch DAD1B 280/4 nm ref 360/100 nm','lc.arw PDA Ch1 254/1.2 nm','lc.arw PDA Ch2 280/1.2 nm']);
        // con un lavoro aperto si chiede se aggiungere: «Aggiungi» li mette insieme agli altri
        const q=await p.evaluate(async ()=>{ const M=window.__mock; M.files['/x/STD2.D/DAD1A.ch']=M.files['C:\\Dati\\STD1.D\\DAD1A.ch']; M.pending=[{path:'/x/STD2.D/DAD1A.ch', name:'DAD1A.ch'}]; M.emit('acch-open-files');
          for (let i=0;i<100 && !$('#dlgConfirm').open;i++) await new Promise(q=>setTimeout(q,30)); const msg=$('#cfMsg').textContent, btn=[...document.querySelectorAll('#cfBtns button')].map(b=>b.textContent);
          [...document.querySelectorAll('#cfBtns button')].find(b=>b.textContent==='Aggiungi').click(); for (let i=0;i<100 && files.length<5;i++) await new Promise(q=>setTimeout(q,30)); return {msg, btn, n:files.length, last:files[files.length-1].path}; });
        assert.equal(q.msg, 'Aggiungere 1 file al progetto aperto «Progetto senza nome»?'); assert.deepEqual(q.btn, ['Annulla','Nuovo progetto','Aggiungi']); assert.equal(q.n, 5); assert.equal(q.last, 'STD2.D/DAD1A.ch');
        assert.deepEqual(r.shown.rows, ['STD1','MIX1'], 'i due .ch dello stesso campione devono stare sulla stessa riga'); assert.deepEqual(r.reads.sort(), Object.keys(files).sort()); assert.deepEqual(errors, []);
      } finally { await ctx.close(); }
    });
  } finally { await b.close(); server.close(); }
});
