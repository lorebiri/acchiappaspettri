// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I10 nella pagina vera (online e desktop, IT ed EN): mappe SINTETICHE con verità nota (test/unit/mappe-dati.js) in .wdf, ENVI e testo,
// vista «Mappa» in Analisi (immagine, clic su un pixel, regione, tastiera, scala dei colori), MCR-ALS sulla mappa, esportazioni per voci
// (PNG, SVG, CSV), progetto salvato e riaperto, limite della versione online, cubi grandi nel motore nativo (finto Rust che usa
// app/map-core.js, con il file affiancato .acchcube) e nessun blocco oltre 50 ms nel calcolo delle immagini.
// Uso: PW_CHANNEL=chrome node --test test/validation/i10-mappe-ui.test.js
'use strict';
const test=require('node:test'), assert=require('node:assert'), B=require('./browser.js'), {openDesk}=require('./tauri-mock.js'), G=require('../unit/mappe-dati.js');
const EMOJI=/[\p{Extended_Pictographic}]/u;
const corr=(a,b)=>{ let n=0, sa=0, sb=0; for (let i=0;i<a.length;i++) if (Number.isFinite(a[i])){ sa+=a[i]; sb+=b[i]; n++; } const ma=sa/n, mb=sb/n; let ab=0, aa=0, bb=0; for (let i=0;i<a.length;i++) if (Number.isFinite(a[i])){ ab+=(a[i]-ma)*(b[i]-mb); aa+=(a[i]-ma)**2; bb+=(b[i]-mb)**2; } return ab/Math.sqrt(aa*bb); };
const T1=G.truth({nx:20, ny:15, nc:401, noise:1}), T2=G.truth({nx:15, ny:10, nc:351, noise:0.05, base:false, shift:false, selective:true}), T3=G.truth({nx:6, ny:5, nc:60});
const E3=G.envi(T3.cube,{interleave:'bil'});
const FILES=[['mappa.wdf', Array.from(G.wdf(T1.cube))], ['mcr.wdf', Array.from(G.wdf(T2.cube))], ['scena.hdr', Array.from(Buffer.from(E3.hdr))], ['scena.img', Array.from(E3.bin)], ['griglia.txt', Array.from(Buffer.from(G.gridText(T3.cube)))],
  ['normale.csv', Array.from(Buffer.from('Raman shift (cm-1),Intensity\n'+Array.from({length:300},(_,i)=>(200+i*5)+','+(10+Math.exp(-(((i-150)/8)**2))*100).toFixed(4)).join('\n')))]];
const load=p=>p.evaluate(async L=>{ files.length=0; await addEntries(L.map(([n,b])=>({file:new File([new Uint8Array(b)], n), path:n}))); document.querySelectorAll('dialog[open]').forEach(d=>d.close()); return files.map(f=>({name:f.name, map:!!f.cube, instr:f.instr, n:f.xs.length})); }, FILES);
const wait=(p, fn, arg)=>p.waitForFunction(fn, arg, {timeout:60000});
const step=(...a)=>{ if (process.env.DBG) console.log('[passo]', ...a); };
async function showMap(p, name){ await p.evaluate(n=>{ go(2); cur=files.findIndex(f=>f.name===n); refreshAll(); document.querySelector('.tab[data-tab="an"]').click(); }, name);
  await wait(p, n=>{ const f=files[cur]; return f && f.name===n && !$('#secMap').hidden && AcchMapUI._rt.img.get(f) && !AcchMapUI._rt.busy; }, name); }

test('I10: mappe nella pagina (online e desktop, IT ed EN): lettura, immagine, pixel, regione, MCR-ALS, esportazioni, progetto', {timeout:20*60*1000}, async ()=>{
  const server=await B.startServer(), br=await B.launch();
  try{
    for (const [lang, desk] of [['it',false],['en',true],['it',true],['en',false]]){
      const o=desk ? await openDesk(B, br, server, {lang}) : await B.openPage(br, server, {lang}), p=o.p, tag=`${lang}${desk?' desktop':' online'}`;
      if (desk) await p.evaluate(()=>{ window.__mock.engine={rust:false, dual:false}; window.__mock.pick.pick_export_dir={path:'/out/mappe', name:'mappe'}; });
      step('carico', tag);
      const L=await load(p);
      assert.deepStrictEqual(L.map(f=>[f.name, f.map]), [['mappa.wdf',true],['mcr.wdf',true],['scena.hdr',true],['griglia.txt',true],['normale.csv',false]], tag+': mappe riconosciute, ENVI in coppia, spettro normale invariato');
      assert.strictEqual(L[0].instr, 'raman', tag+': .wdf è Raman');

      // immagine: area con fondo lineare ∝ concentrazione vera; stessa funzione del nucleo
      step('mostro la mappa', tag, await p.evaluate(()=>cur));
      await showMap(p, 'mappa.wdf');
      const r1=await p.evaluate(()=>{ const f=files[cur], I=AcchMapUI._rt.img.get(f), op={kind:'area', a:+$('#mpA').value.replace(',','.'), b:+$('#mpB').value.replace(',','.'), base:'linear'}, ref=AcchMap.bandImage(f.cube, op);
        return {img:Array.from(I.img), same:I.img.every((v,i)=>Object.is(v, ref[i])), title:$('#mapTitle').textContent, box:$('#mapBox').innerText, cap:$('#mapCap').textContent, a:op.a, b:op.b}; });
      assert.ok(r1.same, tag+': immagine = AcchMap.bandImage');
      assert.ok(r1.a<1000 && r1.b>1000, tag+': intervallo proposto sulla banda più alta');
      assert.ok(corr(r1.img, T1.conc[0])>0.999, tag+': area ∝ concentrazione vera ('+corr(r1.img, T1.conc[0])+')');
      if (desk) assert.ok(!EMOJI.test(r1.title+r1.box), tag+': nessuna emoji nel desktop'); else assert.ok(/🗺️/.test(r1.title), tag+': tono online');
      if (lang==='en') assert.ok(/^(🗺️ )?Map$/.test(r1.title) && /Band area/.test(r1.cap) && /pixels/.test(r1.box) && !/canali|Immagine/.test(r1.box), tag+': testi in inglese: '+r1.box.slice(0,200));
      else assert.ok(/Area di una banda/.test(r1.cap));

      // clic su un pixel, trascinamento (regione), frecce della tastiera
      step('clic', tag, await p.evaluate(()=>cur));
      await p.locator('#mapCv').scrollIntoViewIfNeeded(); const bb=await p.locator('#mapCv').boundingBox();
      const geo=await p.evaluate(()=>{ const cv=$('#mapCv'), r=cv.getBoundingClientRect(); return {k:r.width/cv.width}; });
      // il canvas disegna l'immagine da x0=46 a 46+w; pixel (5, 4)
      const at=await p.evaluate(()=>{ const cv=$('#mapCv'); return {w:cv.width, h:cv.height}; }); step('dopo scroll', await p.evaluate(()=>cur));
      const pxAt=async (ix, iy)=>p.evaluate(([ix,iy])=>{ const cv=$('#mapCv'), r=cv.getBoundingClientRect(), f=files[cur], I=AcchMapUI._rt.img.get(f); if (!I) throw new Error('nessuna immagine: cur='+cur+' '+(f&&f.name)+' cache='+AcchMapUI._rt.img.size+' busy='+AcchMapUI._rt.busy+' nascosta='+$('#secMap').hidden); const W=cv.width, H=cv.height, pad={l:46, r:78, t:8, b:34};
        const dx=Math.abs(I.px[1]-I.px[0]), dy=Math.abs(I.py[1]-I.py[0]), asp=(I.nx*dx)/(I.ny*dy); let w=W-pad.l-pad.r, hh=w/asp; if (hh>H-pad.t-pad.b){ hh=H-pad.t-pad.b; w=hh*asp; }
        return {x:r.left+(pad.l+(ix+0.5)*w/I.nx)*r.width/W, y:r.top+(pad.t+(iy+0.5)*hh/I.ny)*r.height/H}; }, [ix,iy]);
      let q=await pxAt(5,4); await p.mouse.click(q.x, q.y); await wait(p, ()=>/^Pixel x 5, y 4/.test($('#mapSpecCap').textContent));
      const r2=await p.evaluate(()=>({cap:$('#mapSpecCap').textContent, svg:document.querySelectorAll('#mapSpec svg polyline').length}));
      assert.ok(r2.svg>=2, tag+': spettro del pixel e media');
      await p.keyboard.press('ArrowRight'); await wait(p, ()=>/^Pixel x 6, y 4/.test($('#mapSpecCap').textContent));
      const a=await pxAt(2,2), b=await pxAt(6,5); await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(b.x, b.y, {steps:6}); await p.mouse.up();
      await wait(p, ()=>/: 20 (pixel misurati|measured pixels)/.test($('#mapSpecCap').textContent));
      const r3=await p.evaluate(()=>{ const f=files[cur], s=AcchMapUI._rt.last, ref=AcchMap.roiMean(f.cube,{x0:2,y0:2,x1:6,y1:5}); return {n:s.n, same:s.y.every((v,i)=>Object.is(v, ref.mean[i]))}; });
      assert.ok(r3.n===20 && r3.same, tag+': spettro medio della regione 5 × 4');

      step('picco', tag);
      // posizione del picco: lo spostamento noto della banda a 1000 cm⁻¹
      await p.evaluate(()=>{ const s=$('#mpKind'); s.value='peak'; s.dispatchEvent(new Event('change')); });
      await wait(p, ()=>{ const I=AcchMapUI._rt.img.get(files[cur]); return I && /peak/.test(I.key) && !AcchMapUI._rt.busy; });
      await p.evaluate(()=>{ for (const [id,v] of [['mpA','960'],['mpB','1040']]){ const e=$('#'+id); e.value=v; e.dispatchEvent(new Event('change')); } });
      await wait(p, ()=>{ const I=AcchMapUI._rt.img.get(files[cur]); return I && /"a":960,"b":1040/.test(I.key) && !AcchMapUI._rt.busy; });
      const pk=await p.evaluate(()=>Array.from(AcchMapUI._rt.img.get(files[cur]).img));
      assert.ok(corr(pk, T1.shift)>0.99 && pk.every((v,i)=>Math.abs(v-(1000+T1.shift[i]))<0.5), tag+': posizione del picco (con rumore), r = '+corr(pk, T1.shift));

      // MCR-ALS sulla mappa con pixel selettivi: le mappe ritrovano le concentrazioni vere
      step('MCR', tag);
      await showMap(p, 'mcr.wdf');
      await p.evaluate(()=>{ $('#mpNc').value='3'; $('#mpMcr').click(); });
      await wait(p, ()=>{ const R=AcchMapUI._rt.mcr.get(files[cur]); return R && AcchMapUI._rt.img.get(files[cur]) && /mcr0/.test(AcchMapUI._rt.img.get(files[cur]).key) && !AcchMapUI._rt.busy; });
      const r4=await p.evaluate(()=>{ const R=AcchMapUI._rt.mcr.get(files[cur]); return {maps:R.maps.map(m=>Array.from(m)), lof:R.lof, txt:$('#mpMcrOut').innerText, opts:[...$('#mpKind').options].map(o=>o.value)}; });
      for (let k=0;k<3;k++){ const best=Math.max(...r4.maps.map(m=>corr(m, T2.conc[k]))); assert.ok(best>0.99, `${tag}: MCR componente ${k}: ${best}`); }
      assert.ok(r4.lof<2 && r4.opts.includes('mcr2'), tag+': mappe di concentrazione fra le immagini');
      if (lang==='en') assert.ok(/lack of fit/.test(r4.txt)); if (desk) assert.ok(!EMOJI.test(r4.txt));

      step('ENVI', tag);
      // ENVI e testo: stessi numeri del cubo vero
      const r5=await p.evaluate(()=>{ const e=files.find(f=>f.name==='scena.hdr'), t=files.find(f=>f.name==='griglia.txt'); return {e:Array.from(e.cube.data), t:Array.from(t.cube.data), ef:e.cube.meta.format, il:e.cube.meta.interleave}; });
      assert.ok(r5.e.every((v,i)=>v===Math.fround(T3.cube.data[i])) && r5.ef==='envi' && r5.il==='bil', tag+': ENVI'); assert.ok(r5.t.every((v,i)=>v===Math.fround(T3.cube.data[i])), tag+': testo a griglia');

      step('esporta', tag);
      // esportazioni: PNG e SVG delle mappe, CSV dell'immagine e delle mappe MCR fra i risultati
      const NONE={outPdf:false,outPng:true,outSvg:true,csvPeaks:false,csvData:false,csvRaw:false,outOrig:false,outAnalysis:true,outTrace:false,outOrigin:false,outProject:false,zipAll:false,expSub:false,expScope:'all',expNames:{}};
      const r6=await p.evaluate(async ([NONE, desk])=>{ Object.assign(S, NONE); saveS(); syncControls();
        let names; if (desk){ await runExport(); names=Object.keys(window.__mock.disk); } else { const z=await JSZip.loadAsync(await buildZip()); names=Object.keys(z.files); var csv=await z.file(names.find(n=>/mappa_peak\.csv$/.test(n))).async('string'); }
        if (desk){ const k=names.find(n=>/mappa_peak\.csv$/.test(n)); csv=new TextDecoder().decode(new Uint8Array(window.__mock.disk[k])); }
        const f=files.find(q=>q.name==='mappa.wdf'), I=AcchMapUI._rt.img.get(f); return {names, csv, img:Array.from(I.img), nx:I.nx}; }, [NONE, desk]);
      const maps=r6.names.filter(n=>/\/(mappe|maps)\//.test(n));
      for (const re of [/mappa_peak\.png$/, /mappa_peak\.svg$/, /mappa_peak\.csv$/, /mcr_mcr1\.png$/, /mcr_mcr_(componente|component)3\.csv$/]) assert.ok(maps.some(n=>re.test(n)), tag+': esportato '+re+' in '+maps.join(', '));
      { const rows=r6.csv.replace(/^﻿/,'').split(/\r\n/), sep=lang==='en'?',':';', d=lang==='en'?'.':','; const vals=rows.slice(2).map(r=>r.split(sep).slice(1).map(v=>+v.replace(d,'.')));
        assert.strictEqual(vals.length, 15, tag+': righe del CSV'); vals.forEach((r,iy)=>r.forEach((v,ix)=>assert.ok(Math.abs(v-r6.img[iy*20+ix])<=1e-9*Math.abs(v), tag+': CSV = immagine'))); }

      step('progetto', tag);
      // progetto: andata e ritorno, con le scelte della vista
      const r7=await p.evaluate(async ()=>{ const b=await AcchProject._build(); const before=files.map(f=>[f.name, !!f.cube]); files.length=0; await AcchProject.openBytes(b.bytes, 'prova.acchspettri', null);
        const f=files.find(q=>q.name==='mappa.wdf'); go(2); cur=files.indexOf(f); refreshAll(); document.querySelector('.tab[data-tab="an"]').click();
        for (let i=0;i<400 && !(AcchMapUI._rt.img.get(f) && !AcchMapUI._rt.busy);i++) await new Promise(r=>setTimeout(r,25));
        const I=AcchMapUI._rt.img.get(f); return {before, after:files.map(q=>[q.name, !!q.cube]), kind:$('#mpKind').value, key:I&&I.key, same:I && I.img.every((v,i)=>Object.is(v, AcchMap.bandImage(f.cube,{kind:'peak',a:960,b:1040,base:'linear'})[i]))}; });
      assert.deepStrictEqual(r7.after, r7.before, tag+': spettri e mappe dopo la riapertura'); assert.strictEqual(r7.kind, 'peak', tag+': scelta della vista salvata'); assert.ok(r7.same, tag+': stessa immagine');
      assert.deepStrictEqual(o.errors, [], tag+': errori nella pagina');
      await o.ctx.close();
    }
  } finally { await br.close(); server.close(); }
});

test('I10: limite online, cubi grandi nel motore nativo (finto) con file affiancato .acchcube, nessun blocco oltre 50 ms', {timeout:10*60*1000}, async ()=>{
  const server=await B.startServer(), br=await B.launch();
  try{
    step('limite online');
    // online: oltre la soglia, «usa l'app desktop»
    { const o=await B.openPage(br, server, {lang:'it'}); const r=await o.p.evaluate(async b=>{ AcchMap.LIMITS.PAGE_BYTES=100000; files.length=0; await addEntries([{file:new File([new Uint8Array(b)],'grande.wdf'), path:'grande.wdf'}]); return {n:files.length, note:$('#skipNote').innerText}; }, Array.from(G.wdf(T1.cube)));
      assert.strictEqual(r.n, 0); assert.match(r.note, /troppo grande per la versione online, usa l'app desktop/); await o.ctx.close(); }
    step('finto rust');
    // desktop con il finto Rust: il cubo resta nel «Rust» (qui AcchMap in una copia separata), alla pagina solo immagini e spettri
    const o=await openDesk(B, br, server, {lang:'it'}), p=o.p;
    await p.evaluate(()=>{ const M=window.__mock; M.engine={rust:true, dual:false}; M.cubes=new Map(); M.side={}; let nid=0;
      const wire=(obj)=>{ const nums=[]; const enc=v=>{ if (ArrayBuffer.isView(v)){ const o=nums.length; for (const x of v) nums.push(x); return {$f:[o, v.length]}; } if (Array.isArray(v)) return v.map(enc); if (v && typeof v==='object'){ const r={}; for (const k of Object.keys(v)) r[k]=enc(v[k]); return r; } return v; };
        const j=new TextEncoder().encode(JSON.stringify(enc(obj))), head=8+j.length, pad=(8-head%8)%8, out=new Uint8Array(head+pad+8*nums.length), dv=new DataView(out.buffer); out.set([65,67,87,49]); dv.setUint32(4,j.length,true); out.set(j,8); new Float64Array(out.buffer, head+pad).set(nums); return Array.from(out); };
      const head=(id,c,extra)=>Object.assign({id, disk:true, nx:c.nx, ny:c.ny, nc:c.nc, dtype:c.data instanceof Float64Array?'f64':'f32', x:{values:Float64Array.from(c.x.values), unit:c.x.unit||'', quantity:c.x.quantity||''}, px:{values:Float64Array.from(c.px.values), unit:c.px.unit||''}, py:{values:Float64Array.from(c.py.values), unit:c.py.unit||''}, yq:'', meta:c.meta}, extra||{});
      const bytes=a=>Array.from(new Uint8Array(Float64Array.from(a).buffer));
      M.extra={
        acch_cube_stat:()=>{ throw 'mock: non serve'; },
        acch_cube_open:(body, h)=>{ const c=AcchMap.read(h['x-acch-kind'], new Uint8Array(body).buffer), id=++nid; M.cubes.set(id, c); const m=AcchMap.meanSpectrum(c); return wire(head(id, c, {mean:m.mean, n:m.n, bytes:body.length, sha256:AcchFormat.sha256(new Uint8Array(body))})); },
        acch_cube_image:a=>bytes(AcchMap.bandImage(M.cubes.get(a.id), a.op)),
        acch_cube_pixel:a=>bytes(AcchMap.pixelSpectrum(M.cubes.get(a.id), a.ix, a.iy)),
        acch_cube_roi:a=>{ const r=AcchMap.roiMean(M.cubes.get(a.id),{x0:a.rect[0],y0:a.rect[1],x1:a.rect[2],y1:a.rect[3]}), out=new Uint8Array(8+8*r.mean.length); new DataView(out.buffer).setUint32(0,r.n,true); out.set(new Uint8Array(Float64Array.from(r.mean).buffer),8); return Array.from(out); },
        acch_cube_bin:a=>{ const b=AcchMap.bin(M.cubes.get(a.id), a.f), id=++nid; M.cubes.set(id,b); return wire(head(id,b)); },
        acch_cube_take:a=>{ const c=M.cubes.get(a.id), e=Math.min(c.nx*c.ny, a.p0+a.n), s=c.data.subarray(a.p0*c.nc, e*c.nc); return Array.from(new Uint8Array(s.slice().buffer)); },
        acch_cube_close:a=>{ M.cubes.delete(a.id); return null; },
        acch_cube_side_write:a=>{ const c=M.cubes.get(a.id), b=new Uint8Array(c.data.slice().buffer), sha=AcchFormat.sha256(b), dir=a.project.replace(/[^/]*$/,''); M.side[dir+a.name]={c, sha, bytes:b.length}; return {bytes:b.length, sha256:sha}; },
        acch_cube_side_open:a=>{ const dir=a.project.replace(/[^/]*$/,''), s=M.side[dir+a.name]; if (!s) throw 'side-missing: NotFound'; if (s.sha!==a.sha256 || s.bytes!==a.bytes) throw 'side-integrity'; const id=++nid; M.cubes.set(id, s.c); return wire(head(id, s.c)); } }; });
    step('apro grande');
    const r1=await p.evaluate(async b=>{ AcchMap.LIMITS.PAGE_BYTES=100000; files.length=0; await addEntries([{file:new File([new Uint8Array(b)],'grande.wdf'), path:'grande.wdf'}]);
      const f=files[0]; go(2); cur=0; refreshAll(); document.querySelector('.tab[data-tab="an"]').click();
      for (let i=0;i<400 && !(AcchMapUI._rt.img.get(f) && !AcchMapUI._rt.busy);i++) await new Promise(r=>setTimeout(r,25));
      const I=AcchMapUI._rt.img.get(f), sp=await AcchMapUI.Eng.pixel(f, 3, 2), roi=await AcchMapUI.Eng.roi(f, {x0:1,y0:1,x1:4,y1:3});
      return {n:files.length, cube:!!f.cube, rust:!!(f._map&&f._map.rust), img:I&&Array.from(I.img), sp:Array.from(sp), roiN:roi.n, box:$('#mapBox').innerText, calls:window.__mock.calls.map(c=>c.cmd).filter(c=>/^acch_cube/.test(c))}; }, Array.from(G.wdf(T1.cube)));
    assert.ok(r1.n===1 && !r1.cube && r1.rust, 'cubo nel motore nativo, non nella pagina');
    const ref=require('../../app/map-core.js'), C=ref.readWdf(G.wdf(T1.cube)), op=await p.evaluate(()=>AcchMapUI._rt.img.get(files[0]).key);
    assert.ok(r1.img.every((v,i)=>Object.is(v, ref.bandImage(C, JSON.parse(op))[i])), 'immagine dal motore nativo');
    assert.deepStrictEqual(r1.sp, Array.from(ref.pixelSpectrum(C,3,2))); assert.strictEqual(r1.roiN, 12);
    assert.ok(r1.calls.includes('acch_cube_open') && r1.calls.includes('acch_cube_image'), r1.calls.join(','));
    assert.match(r1.box, /motore nativo/);
    step('mcr nativo');
    // MCR: accorpamento e dati portati nella pagina dal motore nativo
    const r2=await p.evaluate(async ()=>{ const f=files[0]; await AcchMapUI.runMcr(f, {nc:3, a:null, b:null}); const R=AcchMapUI._rt.mcr.get(f); return {nc:R&&R.nc, m:R&&R.m, msg:AcchMapUI._rt.msg}; });
    assert.ok(r2.nc===3 && r2.m===300, 'MCR sul cubo nel motore nativo: '+JSON.stringify(r2));
    step('affiancato');
    // progetto: il cubo va nel file affiancato accanto al progetto; la riapertura lo ritrova e ne controlla l'impronta
    const r3=await p.evaluate(async ()=>{ const M=window.__mock; M.pick.pick_save={path:'/progetti/prova.acchspettri', name:'prova.acchspettri'}; M.keepBytes=true;
      await AcchProject.saveAs(); const w=M.writes.find(x=>/prova\.acchspettri$/.test(x.path)), bytes=new Uint8Array(w.bytes), P=await AcchFormat.decode(bytes, JSZip), cb=P.spectra[0].cube;
      files.length=0; await AcchProject.openBytes(bytes, 'prova.acchspettri', '/progetti/prova.acchspettri'); const f=files[0];
      for (let i=0;i<200 && f._map.missing==='pending';i++) await new Promise(r=>setTimeout(r,25));
      const img=await AcchMapUI.Eng.image(f, {kind:'area', a:960, b:1044, base:'linear'});
      // file affiancato alterato: la mappa resta nel progetto ma non si mostra
      const k=Object.keys(M.side)[0]; M.side[k].sha='0'.repeat(64); files.length=0; await AcchProject.openBytes(bytes, 'prova.acchspettri', '/progetti/prova.acchspettri'); const g=files[0];
      for (let i=0;i<200 && g._map.missing==='pending';i++) await new Promise(r=>setTimeout(r,25));
      const b2=await AcchProject._build(), P2=await AcchFormat.decode(b2.bytes, JSZip);
      return {ext:cb.external, data:cb.data, side:Object.keys(M.side), rust:!!f._map.rust, img:Array.from(img), missing:g._map.missing, kept:P2.spectra[0].cube.external}; });
    assert.ok(r3.ext && /^prova\.1\.acchcube$/.test(r3.ext.file) && r3.data===null, 'impronta del file affiancato nel progetto: '+JSON.stringify(r3.ext));
    assert.deepStrictEqual(r3.side, ['/progetti/prova.1.acchcube']); assert.ok(r3.rust, 'riaperto dal file affiancato');
    assert.ok(r3.img.every((v,i)=>Object.is(v, ref.bandImage(C,{kind:'area',a:960,b:1044,base:'linear'})[i])));
    assert.strictEqual(r3.missing, 'side-integrity', 'impronta diversa: non si mostra'); assert.deepStrictEqual(r3.kept, r3.ext, 'e il progetto la conserva');
    assert.deepStrictEqual(o.errors, []); await o.ctx.close();
    step('compiti lunghi');
    // nessun blocco oltre 50 ms: lettura e immagini di una mappa da 120 MB nella pagina (online)
    { const o2=await B.openPage(br, server, {lang:'it'}), big=G.truth({nx:200, ny:150, nc:1000}).cube, bytes=G.wdf(big);
      const r=await o2.p.evaluate(async b=>{ const L=[]; new PerformanceObserver(l=>l.getEntries().forEach(e=>L.push(e.duration))).observe({type:'longtask'}); const u=new Uint8Array(b);
        await new Promise(r=>setTimeout(r,200)); L.length=0; const t0=performance.now();
        const run=gen=>new Promise((res,rej)=>{ const step=()=>{ const t=performance.now(); try{ let q; do { q=gen.next(); if (q.done) return res(q.value); } while (performance.now()-t<12); }catch(e){ return rej(e); } setTimeout(step,0); }; step(); });
        const c=await run(AcchMap.readWdfGen(u)), img=await run(AcchMap.bandImageGen(c,{kind:'area',a:900,b:1100,base:'linear'})), roi=await run(AcchMap.roiMeanGen(c,{x0:0,y0:0,x1:199,y1:149}));
        await new Promise(r=>setTimeout(r,200)); return {ms:performance.now()-t0, long:L.slice(), n:roi.n, img:img.length}; }, Array.from(bytes));
      assert.strictEqual(r.n, 30000); console.log('120 MB: lettura, immagine e media in', Math.round(r.ms), 'ms; compiti lunghi', r.long.map(Math.round).join(', ')||'nessuno');
      // l'allocazione del cubo (un solo Float32Array) è l'unico passo indivisibile: si tollera un compito lungo di allocazione
      assert.ok(r.long.filter(d=>d>50).length<=1, 'compiti oltre 50 ms: '+r.long.map(Math.round).join(', '));
      await o2.ctx.close(); }
  } finally { await br.close(); server.close(); }
});
