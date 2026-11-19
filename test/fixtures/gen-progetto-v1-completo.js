// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Genera test/fixtures/progetto-v1-completo.acchspettri con il codificatore del formato 1 della 3.0.0-rc.1 (d091313),
// passato come argomento: node test/fixtures/gen-progetto-v1-completo.js <project-format.js di d091313>
// Dati sintetici: i due file di progetto-v1-spettri (FTIR e HPLC) più una copia, con tutto il lavoro che il formato 1 sa salvare.
// Il file prodotto è congelato: non rigenerarlo con un codificatore più nuovo.
'use strict';
const fs=require('fs'), path=require('path'), JSZip=require('jszip');
const V1=require(path.resolve(process.argv[2]));
if (V1.FORMAT_VERSION!==1) throw new Error('serve il codificatore del formato 1');
(async()=>{
  const src=await V1.decode(new Uint8Array(fs.readFileSync(path.join(__dirname,'progetto-v1-spettri.acchspettri'))), JSZip);
  const [ftir, hplc]=src.spectra;
  const S=Object.assign({}, src.state.S, {docTitle:'Prova completa v1', docAuthor:'Autore di prova', sample:'mat', perPage:2});
  const state={title:'Prova completa v1', S, MV:{hplc:{mode:'cal', std:{'STD1_DAD1A.csv':{c:1.5}}}},
    COMPS:[{id:'cmpA', name:'Confronto FTIR', instr:'ftir', mode:'stack', gap:1.2, out:true, keys:['spectraplot.file.v1:campioni/olio_lino.csv|1748','spectraplot.file.v1:copia/olio_lino.csv|1748']}],
    REFS:[{id:'refA', i:'ftir', n:'Riferimento sintetico', x:[400,800,1200,1600,2000,2400,2800,3200], y:[0.1,0.2,0.5,0.3,0.2,0.1,0.4,0.1]}],
    LIB:[{id:'c1', i:'hplc', a:2.1, b:2.4, n:'Caffeina'}, {id:'c2', i:'ftir', a:1735, b:1755, n:'C=O estere'}, {id:'c_lungo_'+'x'.repeat(50), i:'ftir', a:2900, b:2950, n:'CH₂ «stretching»'}],
    curIndex:1};
  const memF={hash:ftir.memory.hash, size:ftir.memory.size, title:'Olio di lino è', desc:'Descrizione con a capo\nseconda riga', xr:[600,3800],
    labels:{'1745.0000':'@c2', '2925.0000':'@c_lungo_'+'x'.repeat(50), '1160.0000':'C–O'}, removed:[1100.5], added:[1650.25], include:true, sample:'mat'};
  const memH={hash:hplc.memory.hash, size:hplc.memory.size, title:'Standard 1', desc:'', xr:null, labels:{'2.2500':'@c1'}, removed:[], added:[], include:true};
  const input={appVersion:'3.0.0-rc.1', title:state.title, createdAt:'2026-11-12T10:00:00.000Z', state,
    spectra:[{name:ftir.name, path:ftir.path, bytes:ftir.bytes, binary:false, memory:memF, processedCsv:'x,y\r\n1,2'},
      {name:hplc.name, path:hplc.path, bytes:hplc.bytes, binary:false, memory:memH, processedCsv:'x,y\r\n3,4'},
      {name:ftir.name, path:'copia/'+ftir.name, bytes:ftir.bytes, binary:false, memory:{hash:ftir.memory.hash, size:ftir.memory.size, title:'Copia', desc:'', xr:null, labels:{}, removed:[], added:[], include:false}},
      {name:'finto.spa', path:'bin/finto.spa', bytes:Uint8Array.from({length:600},(_,i)=>(i*7)%256), binary:true, memory:null}],
    results:[{name:'controllo_qualita.csv', text:'file;esito\r\nolio_lino.csv;ok'}, {name:'precedenti/vecchia.csv', text:'a;b'}]};
  const out=path.join(__dirname,'progetto-v1-completo.acchspettri');
  fs.writeFileSync(out, await V1.encode(input, JSZip));
  fs.writeFileSync(path.join(__dirname,'progetto-v1-completo.atteso.json'), JSON.stringify({manifest:{formatVersion:1, appVersion:input.appVersion, title:input.title, createdAt:input.createdAt}, state, spectra:input.spectra.map(s=>({name:s.name, path:s.path, binary:s.binary, memory:s.memory||null, size:s.bytes.length, sha256:V1.sha256(s.bytes), processed:!!s.processedCsv})), results:input.results}, null, 1));
  console.log('scritto', out);
})().catch(e=>{ console.error(e); process.exit(1); });
