// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// R5: una retta di taratura HPLC non mescola i canali del rivelatore (casi critici degli agenti HPLC, QA, UI/UX, scientifico e architetto, cicli 24–25).
// Tutti i dati sono SINTETICI. Standard 1, 2, 3 mg/L e un incognito da 1,5 mg/L; canale A 40 mAU·L/mg, canale B = A/3.
// Intestazioni in stile Agilent ChemStation/OpenLab (lo strumento del committente è un Agilent 1260 con DAD).
'use strict';
const test=require('node:test'), assert=require('node:assert'), {startServer, launch, openPage}=require('./browser.js'), {pdfText}=require('./pdf-text.js');
let seed=7; const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647-0.5; };
const T=n=>Array.from({length:n},(_,i)=>i*0.004), g=(t,h)=>0.5+0.05*rnd()+h*Math.exp(-0.5*((t-5)/0.05)**2);
const chrom=(h,head,n)=>(head==null?'Time (min),DAD signal (mAU)':head)+'\n'+T(n||3000).map(t=>t.toFixed(4)+','+g(t,h).toFixed(4)).join('\n');
const S=[['STD1',1],['STD2',2],['STD3',3],['INC',1.5]];
const near=(x,v,tol,msg)=>assert.ok(x!=null && Math.abs(x-v)<tol, `${msg}: ${x}, atteso ${v}`);

// nel browser: carica i file, imposta la banda e le concentrazioni, e per ogni canale legge la retta e le stime
const PAGE=()=>{ window.R5={
  async load(L){ await addEntries(L.map(o=>({file:new File([o.data],o.name),path:o.path||o.name}))); document.querySelectorAll('dialog[open]').forEach(d=>d.close()); },
  setup(conc){ const c=mvCfg('hplc'); Object.assign(c,{a:4.8,b:5.2,meas:'area',model:'line'}); mvSave(); for (const [path,k] of conc){ const f=files.find(q=>q.path===path); if (!f) throw new Error('manca '+path); anSet(f,'conc',k); } },
  async read(){ openTab('multi'); $('#secMulti').open=true; $('#mvInstr').value='hplc'; renderMulti(); await new Promise(q=>setTimeout(q,60));
    const sel=$('#mvChan'), box=!$('#mvChanBox').hidden, chans=box?[...sel.options].map(o=>o.value):[null], out=[];
    for (const ch of chans){ if (ch!=null){ sel.value=ch; sel.onchange({target:sel}); await new Promise(q=>setTimeout(q,60)); }
      const rows=mvTable('hplc')||[], cal=mvCalib(rows);
      out.push({ch, rows:rows.map(o=>o.f.path), shown:rows.map(o=>dispTitle(o.f)), cal:!!(cal&&cal.predict), b:cal&&cal.b, pred:Object.fromEntries(cal&&cal.predict?rows.filter(o=>o.conc==null&&o.y!=null).map(o=>[o.f.path, cal.predict(o.y,1).x]):[]),
        note:[...document.querySelectorAll('#mvOut .signote')].map(e=>e.textContent).join(' | '), sel:[...document.querySelectorAll('#mvOut select.chanin')].map(e=>files[+e.dataset.fi].path)}); }
    return {box, chans, out, chanOf:Object.fromEntries(files.map(f=>[f.path, chanOf(f)]))}; },
  assess(path){ const f=files.find(q=>q.path===path); return assess(f, viewOf(f)).map(o=>String(o.t).replace(/<[^>]+>/g,'')).join(' | '); },
  async save(){ let out=null; const h=AcchProject.host, old=h.saveAs; h.saveAs=async b=>{ out=b; return {name:'r5.acchspettri', path:null}; }; await AcchProject.saveAs(); h.saveAs=old; let s=''; for (let i=0;i<out.length;i+=0x8000) s+=String.fromCharCode.apply(null,out.subarray(i,i+0x8000)); return btoa(s); },
  async open(b64){ await AcchProject.openBytes(Uint8Array.from(atob(b64),c=>c.charCodeAt(0)),'r5.acchspettri',null); document.querySelectorAll('dialog[open]').forEach(d=>d.close()); }
}; window.R5_TOASTS=[]; const o=toast; toast=function(t){ R5_TOASTS.push(String(t)); return o.apply(this, arguments); }; };
async function withPage(b, server, opt, fn){ const {ctx, p, errors}=await openPage(b, server, Object.assign({desk:true}, opt||{})); try{ await p.evaluate(PAGE); const r=await fn(p); assert.deepEqual(errors, []); return r; } finally { await ctx.close(); } }
const byCh=(r,re)=>r.out.find(o=>re.test(o.ch||''));

test('R5 canali HPLC', async t=>{
  const server=await startServer(), b=await launch();
  try{
    await t.test('file separati per canale (DAD1A/DAD1B): una retta per canale, incognito stimato nel suo canale', async ()=>{
      const L=[]; S.forEach(([n,c])=>{ L.push({name:n+'_DAD1A.csv', data:chrom(40*c)}); L.push({name:n+'_DAD1B.csv', data:chrom(40*c/3)}); });
      for (const both of [false,true]){
        const r=await withPage(b, server, {}, p=>p.evaluate(async ([L,both])=>{ await R5.load(L); R5.setup(L.filter(o=>!/INC/.test(o.name) && (both || /A\.csv$/.test(o.name))).map(o=>[o.name, +o.name[3]])); return R5.read(); }, [L,both]));
        assert.deepEqual(r.chans, ['DAD1A','DAD1B'], 'due canali riconosciuti');
        for (const o of r.out){ assert.ok(o.rows.length>=4 && o.rows.every(n=>n.includes(o.ch)), `canale ${o.ch} con file di un altro canale: ${o.rows}`); assert.match(o.note, /2 canali diversi/); }
        const A=byCh(r,/DAD1A/); assert.ok(A.cal, 'manca la retta del canale A'); near(A.pred['INC_DAD1A.csv'], 1.5, 0.05, 'incognito nel canale A');
        if (both){ const B=byCh(r,/DAD1B/); assert.ok(B.cal, 'manca la retta del canale B'); near(B.pred['INC_DAD1B.csv'], 1.5, 0.05, 'incognito nel canale B'); }
      }
    });

    await t.test('C1 (HPLC s4 a): due blocchi per file, il secondo più lungo; il canale è quello del blocco letto', async ()=>{
      const blk=(hdr,n,h)=>chrom(h, hdr+'\nTime (min),Value (mAU)', n);
      const L=S.map(([n,c])=>({name:n+'.csv', data:blk('DAD1 A, Sig=254,4 Ref=off', n==='INC'?2500:3000, 40*c)+'\n\n'+blk('DAD1 B, Sig=280,4 Ref=off', 3000, 40*c/3)}));
      const r=await withPage(b, server, {}, p=>p.evaluate(async L=>{ await R5.load(L); R5.setup([['STD1.csv',1],['STD2.csv',2],['STD3.csv',3]]); const r=await R5.read(); r.assessInc=R5.assess('INC.csv'); r.assessStd=R5.assess('STD1.csv'); r.toasts=R5_TOASTS; return r; }, L));
      assert.equal(r.chanOf['STD1.csv'], 'DAD1A 254 nm'); assert.equal(r.chanOf['INC.csv'], 'DAD1B 280 nm', 'INC.csv: si legge il blocco B, il canale deve essere B');
      const A=byCh(r,/DAD1A/); assert.ok(A && A.cal, 'manca la retta del canale A'); assert.ok(!A.rows.includes('INC.csv'), 'il canale B dell\'incognito è finito nella retta del canale A');
      assert.ok(!('INC.csv' in A.pred), 'stima dell\'incognito con la retta di un altro canale');
      assert.match(r.assessInc, /canale «DAD1B 280 nm» \(blocco 2 di 2/); assert.match(r.assessStd, /canale «DAD1A 254 nm» \(blocco 1 di 2/);
      const tt=r.toasts.join(' '); assert.match(tt, /ho letto il canale «DAD1A 254 nm»/); assert.doesNotMatch(tt, /secondo canale/);
      // due file soli: «e un altro file», non «e altri 1 file»; in inglese «and 1 more file»
      for (const lang of ['it','en']){ const t2=await withPage(b, server, {lang}, p=>p.evaluate(async L=>{ await R5.load(L); return R5_TOASTS.join(' '); }, [L[3],L[0]]));
        if (lang==='it') assert.match(t2, /«INC\.csv» contiene più di un canale: ho letto il canale «DAD1B 280 nm».*\(e un altro file\)/);
        else assert.match(t2, /«INC\.csv» contains more than one channel: I read channel «DAD1B 280 nm».*\(and 1 more file\)/); }
    });

    await t.test('C1 (HPLC s4 b, scientifico): file a 3 colonne, l\'incognito passa alla colonna B; il canale segue la colonna, anche dopo salvataggio e riapertura', async ()=>{
      const L=S.map(([n,c])=>({name:n+'.csv', data:'Time (min),DAD1 A Sig=254 (mAU),DAD1 B Sig=280 (mAU)\n'+T(3000).map(t=>t.toFixed(4)+','+g(t,40*c).toFixed(4)+','+g(t,40*c/3).toFixed(4)).join('\n')}));
      const r=await withPage(b, server, {}, p=>p.evaluate(async L=>{ await R5.load(L); R5.setup([['STD1.csv',1],['STD2.csv',2],['STD3.csv',3]]); const before=await R5.read();
        const f=files.find(q=>q.name==='INC.csv'); cur=files.indexOf(f); refreshAll(); const sel=$('#ycolSel'); sel.value='2'; sel.onchange({target:sel});
        const after=await R5.read(); return {before, after, b64:await R5.save()}; }, L));
      assert.equal(r.before.box, false, 'prima: tutti nella colonna A, un solo canale'); near(r.before.out[0].pred['INC.csv'], 1.5, 0.05, 'incognito nella colonna A');
      assert.equal(r.after.chanOf['INC.csv'], 'DAD1B 280 nm', 'il canale non segue la colonna Y scelta');
      const A=byCh(r.after,/DAD1A/); assert.ok(A && A.cal && !A.rows.includes('INC.csv'), 'colonna B stimata con la retta della colonna A');
      const r2=await withPage(b, server, {}, p=>p.evaluate(async b64=>{ await R5.open(b64); return R5.read(); }, r.b64));
      assert.equal(r2.chanOf['INC.csv'], 'DAD1B 280 nm', 'progetto riaperto: canale della colonna salvata'); assert.ok(!byCh(r2,/DAD1A/).rows.includes('INC.csv'));
    });

    await t.test('QA (qa-canale-colonna): standard a 254 nm, incognito a 2 colonne 254/320; scelta la 320 l\'incognito non entra nella retta a 254', async ()=>{
      const std=h=>'Time (min)\tmAU 254nm\n'+T(3000).map(t=>t.toFixed(4)+'\t'+g(t,h).toFixed(4)).join('\n');
      const inc=h=>'Time (min)\tmAU 254nm\tmAU 320nm\n'+T(3000).map(t=>{ const a=g(t,h); return t.toFixed(4)+'\t'+a.toFixed(4)+'\t'+(a/3).toFixed(4); }).join('\n');
      for (const desk of [true,false]){
        const r=await withPage(b, server, {desk}, p=>p.evaluate(async L=>{ await R5.load(L); R5.setup([['STD1.txt',1],['STD2.txt',2],['STD3.txt',3]]); const before=await R5.read();
          const f=files.find(q=>q.name==='INC.txt'); cur=files.indexOf(f); refreshAll(); const sel=$('#ycolSel'); sel.value='2'; sel.onchange({target:sel}); return {before, after:await R5.read()}; },
          [{name:'STD1.txt',data:std(40)},{name:'STD2.txt',data:std(80)},{name:'STD3.txt',data:std(120)},{name:'INC.txt',data:inc(60)}]));
        near(r.before.out[0].pred['INC.txt'], 1.5, 0.05, 'prima, colonna 254');
        assert.equal(r.after.chanOf['INC.txt'], '320 nm'); assert.ok(r.after.box, 'manca il menu dei canali');
        const A=byCh(r.after,/254/); assert.ok(A.cal && !A.rows.includes('INC.txt'), (desk?'desktop':'web')+': la colonna 320 nm stimata con la retta a 254 nm');
      }
    });

    await t.test('UI/UX: file a 3 colonne 254/280/320, standard a 280 e campione a 254; poi il campione a 280', async ()=>{
      const conc=[1,2,4,8,16], f3=(h)=>'Time (min)\tmAU 254nm\tmAU 280nm\tmAU 320nm\n'+Array.from({length:3001},(_,i)=>{ const t=20*i/3000, v=[1,0.4,0.1].map(k=>(0.5+0.02*rnd()+h*k*Math.exp(-0.5*((t-5)/0.08)**2)).toFixed(5)); return t.toFixed(5)+'\t'+v.join('\t'); }).join('\n');
      const L=conc.map((c,i)=>({name:`STD${i+1}.txt`, data:f3(10*c)})).concat([{name:'CAMP.txt', data:f3(50)}]);
      const r=await withPage(b, server, {}, p=>p.evaluate(async ([L,conc])=>{ await R5.load(L); const c=mvCfg('hplc'); Object.assign(c,{a:4.6,b:5.4,meas:'area',model:'line'}); mvSave();
        files.forEach(f=>{ const m=/STD(\d)/.exec(f.name); if (m){ anSet(f,'conc',conc[+m[1]-1]); anSet(f,'ycol',2); applyYCol(f,2); persist(f); syncDerived(f); } });
        const mixed=await R5.read(); const k=files.find(f=>f.name==='CAMP.txt'); anSet(k,'ycol',2); applyYCol(k,2); persist(k); syncDerived(k); return {mixed, same:await R5.read()}; }, [L,conc]));
      assert.ok(r.mixed.box, 'canali misti senza menu né avviso'); assert.equal(r.mixed.chanOf['CAMP.txt'], '254 nm'); assert.equal(r.mixed.chanOf['STD1.txt'], '280 nm');
      const m280=byCh(r.mixed,/280/); assert.ok(m280.cal && !m280.rows.includes('CAMP.txt'), 'campione a 254 nella retta a 280');
      assert.equal(r.same.box, false); near(r.same.out[0].pred['CAMP.txt'], 5, 0.1, 'campione a 280 con gli standard a 280');
    });

    await t.test('A1 (HPLC s4 c, UI/UX, architetto): file senza canale nominati e assegnabili a mano; «DAD signal» non è un canale; la scelta resta nel progetto', async ()=>{
      const L=[]; S.slice(0,3).forEach(([n,c])=>['A','B'].forEach(ch=>L.push({name:`${n}_DAD1${ch}.csv`, data:chrom(ch==='A'?40*c:40*c/3, `"Signal: DAD1 ${ch}, Sig=${ch==='A'?254:280},4 Ref=360,100"\nTime (min),Signal (mAU)`)})));
      L.push({name:'U1.csv', data:chrom(60,'Time (min),Signal (mAU)')}); L.push({name:'INCOGNITO.csv', data:chrom(60,'Time (min),DAD signal (mAU)')});
      const conc=L.filter(o=>/STD/.test(o.name)).map(o=>[o.name, +o.name[3]]);
      const r=await withPage(b, server, {}, p=>p.evaluate(async ([L,conc])=>{ await R5.load(L); R5.setup(conc); const before=await R5.read();
        const sel=[...document.querySelectorAll('#mvOut select.chanin')].find(e=>files[+e.dataset.fi].name==='U1.csv'); sel.value=[...sel.options].find(o=>/DAD1A/.test(o.value)).value; sel.onchange(); await new Promise(q=>setTimeout(q,80));
        const after=await R5.read(); return {before, after, an:files.find(f=>f.name==='U1.csv').an, b64:await R5.save()}; }, [L,conc]));
      assert.deepEqual(r.before.chans, ['DAD1A 254 nm','DAD1B 280 nm'], 'canale «DAD» inventato o canali in più: '+r.before.chans);
      assert.equal(r.before.chanOf['INCOGNITO.csv'], ''); assert.equal(r.before.chanOf['U1.csv'], '');
      const A0=byCh(r.before,/DAD1A/); assert.match(A0.note, /In 2 file non riconosco il canale/); assert.deepEqual(A0.sel.sort(), ['INCOGNITO.csv','U1.csv']); assert.match(A0.note, /U1\.csv/); assert.match(A0.note, /INCOGNITO\.csv/);
      assert.equal(r.an.chan, 'DAD1A 254 nm'); const A=byCh(r.after,/DAD1A/); assert.ok(A.rows.includes('U1.csv')); near(A.pred['U1.csv'], 1.5, 0.05, 'U1 assegnato a DAD1A');
      const r2=await withPage(b, server, {}, p=>p.evaluate(async b64=>{ await R5.open(b64); return R5.read(); }, r.b64));
      const A2=byCh(r2,/DAD1A/); assert.ok(A2.rows.includes('U1.csv'), 'progetto riaperto: assegnazione a mano persa'); near(A2.pred['U1.csv'], 1.5, 0.05, 'riaperto');
    });

    await t.test('nomi ambigui: «DAD1A», «DAD1A_254nm» e «DAD1 A, Sig=254» sono lo stesso canale (HPLC s2 d, UI/UX B)', async ()=>{
      const L=[{name:'STD1_DAD1A.csv',data:chrom(40)},{name:'STD2_DAD1A_254nm.csv',data:chrom(80)},{name:'STD3.csv',data:chrom(120,'DAD1 A, Sig=254,4 Ref=360,100 (C:\\CHEM32\\1\\DATA\\SEQ\\STD3.D)\nTime (min),Value (mAU)')},{name:'INC_DAD1A_254nm.csv',data:chrom(60)}];
      const r=await withPage(b, server, {}, p=>p.evaluate(async L=>{ await R5.load(L); R5.setup([['STD1_DAD1A.csv',1],['STD2_DAD1A_254nm.csv',2],['STD3.csv',3]]); return R5.read(); }, L));
      assert.equal(r.box, false, 'lo stesso canale diviso in due: '+r.chans); assert.equal(r.out[0].rows.length, 4); near(r.out[0].pred['INC_DAD1A_254nm.csv'], 1.5, 0.05, 'incognito');
    });

    await t.test('A2 (HPLC s7): cartelle .D di ChemStation con lo stesso nome di file, distinti in tabella e nel CSV', async ()=>{
      const u16=s=>{ const a=new Uint8Array(2+s.length*2); a[0]=0xFF; a[1]=0xFE; for (let i=0;i<s.length;i++){ const c=s.charCodeAt(i); a[2+2*i]=c&255; a[3+2*i]=c>>8; } return a; };
      const L=S.map(([n,c])=>({name:'DAD1A.CSV', path:`SEQ1/${n}.D/DAD1A.CSV`, data:u16(T(3000).map(t=>t.toFixed(4)+','+g(t,40*c).toFixed(4)).join('\r\n'))}));
      const r=await withPage(b, server, {}, p=>p.evaluate(async L=>{ await R5.load(L); R5.setup([['SEQ1/STD1.D/DAD1A.CSV',1],['SEQ1/STD2.D/DAD1A.CSV',2],['SEQ1/STD3.D/DAD1A.CSV',3]]); const r=await R5.read();
        r.table=[...document.querySelectorAll('#mvOut table tbody tr')].map(tr=>tr.cells[0].textContent.trim()); r.csv=mvCsvRows('hplc').filter(x=>x&&x.length>3).map(x=>x[1]);
        Object.assign(S,{outPdf:true, outAnalysis:true}); const u=new Uint8Array(await (await buildPdf()).arrayBuffer()); let s=''; for (let i=0;i<u.length;i+=0x8000) s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000)); r.pdf=btoa(s); return r; }, L));
      const pdf=pdfText(Buffer.from(r.pdf,'base64')).join('\n');
      const want=['DAD1A.CSV (STD1.D)','DAD1A.CSV (STD2.D)','DAD1A.CSV (STD3.D)','DAD1A.CSV (INC.D)'];
      for (const w of want){ assert.ok(r.out[0].shown.includes(w), 'manca '+w+' in '+r.out[0].shown); assert.ok(r.table.some(x=>x.startsWith(w)), 'tabella: '+r.table); assert.ok(r.csv.includes(w), 'CSV: '+r.csv); assert.ok(pdf.includes(w), 'PDF senza '+w); }
      near(r.out[0].pred['SEQ1/INC.D/DAD1A.CSV'], 1.5, 0.05, 'incognito');
    });

    await t.test('riconoscimento del canale: 43 nomi del rapporto HPLC e intestazioni ChemStation/OpenLab', async ()=>{
      const N={'STD1_DAD1A.csv':'DAD1A','STD1_DAD1B.csv':'DAD1B','dad1a.csv':'DAD1A','STD1 DAD1 A.csv':'DAD1A','STD1_DAD1-A.csv':'DAD1A','DAD1 A, Sig=254,4 Ref=360,100.CSV':'DAD1A 254 nm','STD1_DAD1A_254nm.csv':'DAD1A 254 nm','STD1_254nm.csv':'254 nm','STD1 254 nm.csv':'254 nm','STD1_254.csv':'','STD1_280.5nm.csv':'280 nm','STD1_VWD1A.csv':'VWD1A','STD1_FLD1A.csv':'FLD1A','STD1_ch1.csv':'Ch1','STD1_CH1.csv':'Ch1','STD1_Ch1.csv':'Ch1','STD1_Channel2.csv':'Ch2','UV_VIS_1.csv':'UV_VIS_1','STD1_DAD1A254.csv':'DAD1A 254 nm','STD1-DAD1A-Sig254.csv':'DAD1A 254 nm','Sig=254,4.csv':'254 nm','ADC1A.csv':'ADC1A','RID1A.csv':'RID1A','STD1_MWD1C.csv':'MWD1C','STD1_DAD1I.csv':'','STD1_DAD2A.csv':'DAD2A','Campione_A.csv':'','Ch_A.csv':'ChA','STD1 2026-11-08 100 nm.csv':'','PDA 254.0 nm.arw':'254 nm','ACN 100nm filter.csv':'','Chanel1.csv':'','STD1_DAD.csv':'','STD1_ELSD.csv':'ELSD','STD1_DAD1A_1.csv':'DAD1A','STD1.D_DAD1A.CSV':'DAD1A','001-0101.D DAD1 B.csv':'DAD1B','STD1_210nm_DAD1C.csv':'DAD1C 210 nm'};
      const H=[[['DAD1 A, Sig=254,4 Ref=360,100 (C:\\CHEM32\\1\\DATA\\SEQ\\STD1.D)'],'DAD1A 254 nm'], [['Signal: DAD1A','Spectrum range 190-400 nm'],'DAD1A'], [['Method: gradient 5-95% ACN, 210 nm','Signal: DAD1 B, Sig=280,4'],'DAD1B 280 nm'], [['Lamp 100 nm bandwidth'],''], [['Instrument: Agilent 1260 DAD G4212B','Detector: DAD1 A'],'DAD1A'],
        [['Time (min),DAD signal (mAU)'],''], [['DAD1 A, Sig=254.0,4.0  Ref=off'],'DAD1A 254 nm'], [['VWD1 A, Wavelength=254 nm'],'VWD1A 254 nm'], [['Agilent 1260 Infinity II DAD WR (G7115A)','"Signal: DAD1A,Sig=280.0,4.0 Ref=360.0,100.0"'],'DAD1A 280 nm']];
      assert.equal(Object.keys(N).length+H.length, 47);
      const r=await withPage(b, server, {}, p=>p.evaluate(([N,H])=>({n:Object.keys(N).map(k=>[k, chanOf({name:k, meta:[]})]), h:H.map(([m])=>chanOf({name:'STD1.csv', meta:m}))}), [N,H]));
      const bad=r.n.filter(([k,v])=>v!==N[k]).concat(r.h.map((v,i)=>[H[i][0].join(' / '),v]).filter(([,v],i)=>v!==H[i][1]));
      assert.deepEqual(bad, [], 'canali riconosciuti male');
    });

    await t.test('versione inglese: avviso dei canali e file senza canale tutti in inglese', async ()=>{
      const L=[]; S.slice(0,3).forEach(([n,c])=>['A','B'].forEach(ch=>L.push({name:`${n}_DAD1${ch}.csv`, data:chrom(ch==='A'?40*c:40*c/3)}))); L.push({name:'U1.csv', data:chrom(60,'Time (min),Signal (mAU)')});
      const r=await withPage(b, server, {lang:'en'}, p=>p.evaluate(async L=>{ await R5.load(L); R5.setup(L.filter(o=>/STD/.test(o.name)).map(o=>[o.name, +o.name[3]])); await R5.read(); await new Promise(q=>setTimeout(q,300));
        return {note:[...document.querySelectorAll('#mvOut .signote')].map(e=>e.innerText).join(' '), opts:[...document.querySelectorAll('#mvOut select.chanin option')].map(o=>o.textContent)}; }, L));
      assert.match(r.note, /Chromatograms from 2 different channels are loaded/); assert.match(r.note, /In one file I cannot recognise the channel/); assert.match(r.note, /U1\.csv/);
      assert.doesNotMatch(r.note, /Sono caricati|canali|Cambia canale|non riconosco|retta/, 'resta testo italiano: '+r.note); assert.ok(r.opts.includes('— no channel: left out —'));
    });
  } finally { await b.close(); server.close(); }
});
