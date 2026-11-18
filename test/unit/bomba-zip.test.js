// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Progetti .acchspettri ostili (debug della conclusione): i byte si contano mentre si decomprime. Prima un progetto di 1,5 MB che
// dichiarava 100 byte per manifest.json, o uno di 3 MB con dimensioni vere ma 3 GB di zeri, venivano decompressi per intero
// (fino a 7 GB di memoria e due minuti di pagina bloccata) prima del rifiuto.
const test=require('node:test'), assert=require('node:assert'), crypto=require('crypto');
const JSZip=require('jszip'), F=require('../../app/project-format.js');
async function bomb(kind){
  const z=new JSZip(); z.file('mimetype','application/vnd.acchiappaspettri.project+zip',{compression:'STORE'});
  if (kind==='manifest'){ z.file('manifest.json', new Uint8Array(40*1024*1024).fill(0x20), {compression:'DEFLATE'}); }
  else { const zero=new Uint8Array(80*1024*1024), sha=crypto.createHash('sha256').update(zero).digest('hex');
    const entries={'project/state.json':null,'project/spectra.json':null,'project/sources.json':null,'data/000001.bin':{size:zero.length, sha256:sha}};
    const js={'project/state.json':'{}','project/spectra.json':JSON.stringify([{name:'a', source:'1'}]),'project/sources.json':JSON.stringify([{id:'1', data:'data/000001.bin'}])};
    for (const [p,t] of Object.entries(js)){ const b=Buffer.from(t); entries[p]={size:b.length, sha256:crypto.createHash('sha256').update(b).digest('hex')}; z.file(p,b); }
    z.file('manifest.json', JSON.stringify({format:'acchspettri', formatVersion:2, minReaderVersion:2, entries})); z.file('data/000001.bin', zero, {compression:'DEFLATE'}); }
  const b=await z.generateAsync({type:'uint8array', compression:'DEFLATE', compressionOptions:{level:9}});
  if (kind==='manifest'){ const dv=new DataView(b.buffer); for (let i=0;i<b.length-46;i++){ const s=dv.getUint32(i,true);
    if (s===0x02014b50 && Buffer.from(b.slice(i+46,i+46+13)).toString()==='manifest.json') dv.setUint32(i+24,100,true);
    if (s===0x04034b50 && Buffer.from(b.slice(i+30,i+30+13)).toString()==='manifest.json') dv.setUint32(i+22,100,true); } }
  return b; }
test('bomba ZIP: manifest.json che mente sulla dimensione viene fermato durante la decompressione', async ()=>{
  const b=await bomb('manifest'), t0=Date.now(); await assert.rejects(F.decode(b, JSZip), e=>e.code==='too-large' && e.detail==='manifest.json'); assert.ok(Date.now()-t0<3000);
});
test('bomba ZIP: voce con dimensione e impronta vere ma rapporto di compressione assurdo (80 MB di zeri) viene rifiutata', async ()=>{
  const b=await bomb('ratio'); assert.ok(b.length<1024*1024, 'archivio piccolo: '+b.length); await assert.rejects(F.decode(b, JSZip), e=>e.code==='too-large');
});
