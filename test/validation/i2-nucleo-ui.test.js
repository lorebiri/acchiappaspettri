// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Tappa I2 nella pagina vera: progetto della versione 1 aperto e risalvato nel formato 2 senza perdite; rimandi «@id» dei picchi
// che seguono la voce giusta della libreria (libMerge); archivio del desktop su file con migrazione dal localStorage. Dati SINTETICI.
// Uso: PW_CHANNEL=chrome node --test test/validation/i2-nucleo-ui.test.js
'use strict';
const {describe, it, before, after}=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path');
const B=require('./browser.js'), {openDesk}=require('./tauri-mock.js');
const fx=n=>fs.readFileSync(path.join(B.ROOT,'test','fixtures',n)).toString('base64');
const ATTESO=JSON.parse(fs.readFileSync(path.join(B.ROOT,'test','fixtures','progetto-v1-completo.atteso.json'),'utf8'));

describe('Tappa I2: formato 2, libreria, archivio', {timeout:5*60*1000}, ()=>{
  let server, br; const errs=[];
  before(async ()=>{ server=await B.startServer(); br=await B.launch(); });
  after(async ()=>{ await br.close(); server.close(); assert.deepStrictEqual(errs, [], 'errori nella pagina'); });
  const done=async o=>{ errs.push(...o.errors); await o.ctx.close(); };

  it('progetto della versione 1 con una voce di libreria in conflitto: i picchi mostrano i nomi del progetto; risalvato nel formato 2 senza perdite', async ()=>{
    for (const desk of [false, true]){
      const o=await B.openPage(br, server, {desk});
      const r=await o.p.evaluate(async b=>{ const u=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
        LIB.push({id:'c2', i:'ftir', a:1000, b:1010, n:'voce locale diversa'}); saveLib();
        const ok=await AcchProject.openBytes(u(b),'progetto-v1-completo.acchspettri',null); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
        const name=(f,k)=>{ const v=f&&f.labels[k]; return v && v[0]==='@' ? (entryById(v.slice(1))||{it:'(nessuna voce: '+v+')'}).it : v; };
        const ft=files.find(f=>f.path==='campioni/olio_lino.csv'), hp=files.find(f=>f.path==='hplc/STD1_DAD1A.csv');
        const shown={c2:name(ft,'1745.0000'), lungo:name(ft,'2925.0000'), testo:name(ft,'1160.0000'), c1:name(hp,'2.2500')};
        const nLib=LIB.length; await AcchProject.openBytes(u(b),'progetto-v1-completo.acchspettri',null); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
        const nLib2=LIB.length, shown2=name(files.find(f=>f.path==='campioni/olio_lino.csv'),'1745.0000');
        const P=await AcchFormat.decode((await AcchProject._build()).bytes, JSZip);
        return {ok, shown, nLib, nLib2, shown2, local:LIB.find(e=>e.id==='c2').n, n:files.length, ver:P.manifest.formatVersion, min:P.manifest.minReaderVersion, title:P.state.title, comps:P.state.COMPS.map(c=>c.name), refs:P.state.REFS.map(x=>x.n), sources:P.sources?P.sources.length:null,
          spectra:P.spectra.map(s=>({path:s.path, size:s.bytes&&s.bytes.length, mem:s.memory}))}; }, fx('progetto-v1-completo.acchspettri'));
      await done(o);
      const w=desk?'desktop':'online';
      assert.strictEqual(r.ok, true, w);
      assert.deepStrictEqual(r.shown, {c2:'C=O estere', lungo:'CH₂ «stretching»', testo:'C–O', c1:'Caffeina'}, w+': nomi mostrati sui picchi');
      assert.strictEqual(r.local, 'voce locale diversa', w); assert.strictEqual(r.nLib2, r.nLib, w+': voci duplicate alla riapertura'); assert.strictEqual(r.shown2, 'C=O estere', w);
      // risalvato: formato 2, tutto il lavoro della versione 1 c'è ancora; i due olio_lino.csv uguali diventano una sola sorgente
      assert.strictEqual(r.ver, 2); assert.strictEqual(r.min, 2); assert.strictEqual(r.title, ATTESO.state.title); assert.deepStrictEqual(r.comps, ATTESO.state.COMPS.map(c=>c.name)); assert.deepStrictEqual(r.refs, ATTESO.state.REFS.map(x=>x.n));
      assert.strictEqual(r.n, 3, w+': tre spettri leggibili (il finto .spa no)'); assert.strictEqual(r.sources, 2, w+': byte uguali salvati una volta');
      for (const a of ATTESO.spectra.filter(s=>!s.binary)){ const s=r.spectra.find(x=>x.path===a.path); assert.ok(s, w+': manca '+a.path); assert.strictEqual(s.size, a.size);
        for (const k of ['title','desc','xr','removed','added','include','sample']) if (a.memory[k]!==undefined) assert.deepStrictEqual(s.mem[k], a.memory[k], `${w} ${a.path}: ${k}`);
        assert.deepStrictEqual(Object.keys(s.mem.labels).sort(), Object.keys(a.memory.labels).sort(), w+': etichette di '+a.path); }
    }
  });

  it('desktop: archivio su file in app_data_dir con migrazione dal localStorage, poi ogni modifica va su file', async ()=>{
    const LIB0=[{id:'cm1', i:'hplc', a:3, b:3.2, n:'Voce migrata è'}];
    const o=await openDesk(B, br, server, {init:[()=>{ window.__ACCH_STORE__={version:1, items:{}}; }, l=>{ try{ localStorage.setItem('spectraplot.lib.v1', JSON.stringify(l)); localStorage.setItem('acch.zoom','1.1'); }catch(e){} }].map((f,i)=>i===1?{content:`(${f})(${JSON.stringify(LIB0)})`}:f)});
    const r=await o.p.evaluate(async ()=>{ await new Promise(q=>setTimeout(q,100)); const M=window.__mock, first=JSON.parse(JSON.stringify(M.store));
      LIB.push({id:'cn2', i:'ftir', a:1,b:2,n:'Nuova'}); saveLib(); await AcchHost.store.flush();
      return {kind:AcchHost.kind, lib:LIB.map(e=>e.n), first, after:JSON.parse(M.store['spectraplot.lib.v1']).map(e=>e.n), writes:M.storeWrites.length, zoom:AcchHost.store.getItem('acch.zoom')}; });
    await done(o);
    assert.strictEqual(r.kind, 'desktop');
    assert.deepStrictEqual(r.lib, ['Voce migrata è'].concat('Nuova'), 'libreria letta dall\'archivio migrato');
    assert.strictEqual(r.first['spectraplot.lib.v1'], JSON.stringify(LIB0), 'migrazione byte per byte'); assert.strictEqual(r.first['acch.zoom'], '1.1'); assert.ok(r.first['acch.store.migrated'], 'segno di migrazione');
    assert.deepStrictEqual(r.after, ['Voce migrata è','Nuova'], 'modifica scritta su file'); assert.ok(r.writes>=2); assert.strictEqual(r.zoom,'1.1');
  });
});
