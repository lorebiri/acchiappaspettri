// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I7, ZIP in Rust (src-tauri/acch-core/src/zip.rs) contro JSZip 3.10, con ACCH_DUAL=1 (serve cargo):
// 1) ZIP di Esporta (STORE): archivio identico byte per byte a quello di JSZip, anche con nomi non ASCII, cartelle, file vuoti e date diverse.
// 2) Progetto .acchspettri (DEFLATE livello 6): equivalenza, non identità. Perché: JSZip comprime con pako (porting JS di zlib),
//    il Rust con miniz_oxide; sono due compressori DEFLATE (RFC 1951) diversi e, a parità di livello, scelgono corrispondenze diverse,
//    quindi i byte compressi (e con loro le dimensioni compresse e gli scostamenti delle voci) cambiano. Tutto il resto è uguale e il test
//    lo verifica campo per campo: stesse voci nello stesso ordine, stessi nomi, flag, metodo, ora e data DOS, CRC-32, dimensione non
//    compressa, campi extra, attributi e versioni; i dati decompressi sono identici; «mimetype» resta la prima voce, non compressa, con gli
//    stessi byte; JSZip (il lettore della 2.2.0 e di questa versione) lo apre e AcchFormat.decode dà lo stesso progetto.
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), os=require('os'), zlib=require('zlib'), {execFileSync}=require('child_process');
const JSZip=require('jszip'), F=require('../../app/project-format.js'), C=require('../../app/calc-core.js');
const ROOT=path.join(__dirname,'..','..'), TAURI=path.join(ROOT,'src-tauri'), ON=process.env.ACCH_DUAL==='1';
function cli(){ execFileSync('cargo',['build','--release','-q','-p','acch-core','--bin','acch-core-cli'],{cwd:TAURI, stdio:'inherit'}); return path.join(TAURI,'target','release','acch-core-cli'+(process.platform==='win32'?'.exe':'')); }
let tmp=null; const rustZip=(exe, req)=>{ tmp=tmp||fs.mkdtempSync(path.join(os.tmpdir(),'acch-dzip-')); const q=path.join(tmp,'q.acz'), o=path.join(tmp,'o.zip'); fs.writeFileSync(q, req); execFileSync(exe,['--zip',o,q]); return fs.readFileSync(o); };

// lettura delle strutture ZIP (directory centrale e intestazioni locali), senza JSZip
function parseZip(b){ const u32=o=>b.readUInt32LE(o), u16=o=>b.readUInt16LE(o); let e=b.length-22; while (e>=0 && u32(e)!==0x06054b50) e--; assert.ok(e>=0, 'fine della directory centrale');
  const n=u16(e+10), cdLen=u32(e+12), cdOff=u32(e+16), out=[]; assert.equal(cdOff+cdLen, e); assert.equal(u16(e+20), 0); let o=cdOff;
  for (let k=0;k<n;k++){ assert.equal(u32(o), 0x02014b50); const nl=u16(o+28), xl=u16(o+30), cl=u16(o+32), lo=u32(o+42);
    const c={madeBy:u16(o+4), need:u16(o+6), flag:u16(o+8), method:u16(o+10), time:u16(o+12), date:u16(o+14), crc:u32(o+16), csize:u32(o+20), usize:u32(o+24), disk:u16(o+34), iattr:u16(o+36), eattr:u32(o+38),
      name:b.subarray(o+46, o+46+nl).toString('hex'), extra:b.subarray(o+46+nl, o+46+nl+xl).toString('hex'), comment:cl, offset:lo};
    assert.equal(u32(lo), 0x04034b50); const lnl=u16(lo+26), lxl=u16(lo+28);
    c.local={need:u16(lo+4), flag:u16(lo+6), method:u16(lo+8), time:u16(lo+10), date:u16(lo+12), crc:u32(lo+14), csize:u32(lo+18), usize:u32(lo+22), name:b.subarray(lo+30, lo+30+lnl).toString('hex'), extra:b.subarray(lo+30+lnl, lo+30+lnl+lxl).toString('hex')};
    c.body=b.subarray(lo+30+lnl+lxl, lo+30+lnl+lxl+c.csize); out.push(c); o+=46+nl+xl+cl; }
  assert.equal(o, e); return out; }
const data=c=>c.method===8 ? zlib.inflateRawSync(c.body) : Buffer.from(c.body);

// voci come quelle di zipOf (Esporta): cartella radice, sottocartelle, testo UTF-8, binari, file vuoti, nomi non ASCII, date diverse
function exportZip(variant){ const z=new JSZip(), root=['Analisi_20261114_1230','Città_µ_δ_20261114','分析_✓_🧪'][variant%3], f=z.folder(root), r=n=>{ let s=n*7+variant; return ()=>{ s=(s*16807)%2147483647; return s; }; };
  const g=r(3), csv=n=>{ const L=['x,y']; for (let i=0;i<n;i++) L.push((400+i*0.5).toFixed(2)+','+(g()%100000/7).toFixed(5)); return L.join('\r\n'); };
  f.file('riepilogo.csv', 'campione;area (µV·s);T (°C)\r\nprova è;12,5;25\r\n');
  f.file('dati/spettro_1.csv', csv(2000)); f.file('dati/più/spettro_2.csv', csv(50000), {date:new Date(Date.UTC(2025,0,31,23,59,59))});
  f.file('grafico.png', new Uint8Array(Array.from({length:70000},()=>g()&255))); f.file('vuoto.txt', ''); f.file('123', 'nome numerico');
  f.file('note 🧪.txt', 'nota', {date:new Date(Date.UTC(1999,11,31,0,0,1))}); z.file('fuori.txt', 'in radice', {date:new Date(2026,10,14,1,2,3)});
  if (variant>2) f.file('grande.bin', Buffer.alloc(5e6, variant));
  return z; }

test('ACCH_DUAL: ZIP di Esporta (STORE) in Rust identico byte per byte a quello di JSZip', {skip:!ON && 'serve ACCH_DUAL=1 (e cargo)', timeout:600000}, async ()=>{
  const exe=cli();
  for (let v=0;v<4;v++){ const z=exportZip(v), gen={type:'uint8array', compression:'STORE'};
    const js=Buffer.from(await z.generateAsync(gen)), req=await C.zipRequest(z, gen); assert.ok(req, 'richiesta'); const rs=rustZip(exe, req);
    assert.ok(rs.equals(js), 'variante '+v+': archivi diversi ('+rs.length+' / '+js.length+' byte)');
    const E=parseZip(rs); assert.ok(E.some(c=>c.flag===0x0800 && c.extra.startsWith('7570')), 'nomi non ASCII: flag UTF-8 e campo 0x7075'); assert.ok(E.some(c=>c.flag===0 && !c.extra), 'nomi ASCII senza campo extra'); assert.ok(E.some(c=>c.eattr===0x10), 'cartelle'); }
});

test('ACCH_DUAL: progetto .acchspettri (DEFLATE) in Rust equivalente a quello di JSZip, voce per voce', {skip:!ON && 'serve ACCH_DUAL=1 (e cargo)', timeout:900000}, async ()=>{
  const exe=cli(), files=[]; const walk=d=>{ for (const n of fs.readdirSync(d).sort()){ const p=path.join(d,n); if (fs.statSync(p).isDirectory()) walk(p); else if (!/\.(js|py|md)$/.test(n)) files.push(p); } };
  walk(path.join(ROOT,'test','corpus')); assert.ok(files.length>=100, 'corpus: '+files.length);
  const input={appVersion:'3.0.0-test', title:'Prova è µ', state:{sens:2, nota:'città'}, spectra:files.map(p=>({name:path.basename(p), path:path.relative(path.join(ROOT,'test'),p), bytes:new Uint8Array(fs.readFileSync(p)), binary:/\.(ch|uv|spa|0)$/i.test(p), processedCsv:'x,y\r\n1,2'})),
    libraries:[{id:'lib-1', revision:2, name:'Libreria', data:{voci:[{nome:'acido è', rt:3.2}]}}], results:[{name:'tabella picchi.csv', text:'x;area\r\n1;2'}, {name:'分析/结果.txt', text:'ok'}]};
  let js=null, req=null; const rs=await F.encode(input, JSZip, async (z, gen)=>{ js=Buffer.from(await z.generateAsync(gen)); req=await C.zipRequest(z, gen); return new Uint8Array(rustZip(exe, req)); });
  const R=parseZip(Buffer.from(rs)), J=parseZip(js);
  assert.equal(R.length, J.length, 'numero di voci'); assert.ok(R.length>=files.length+6);
  let packed=0, sameBytes=0;
  R.forEach((r,k)=>{ const j=J[k], nm=Buffer.from(j.name,'hex').toString();
    for (const f of ['madeBy','need','flag','method','time','date','crc','usize','disk','iattr','eattr','name','extra','comment']) assert.equal(r[f], j[f], nm+': '+f);
    for (const f of ['need','flag','method','time','date','crc','usize','name','extra']) assert.equal(r.local[f], j.local[f], nm+': intestazione locale, '+f);
    assert.equal(r.local.csize, r.csize); const d=data(r); assert.ok(d.equals(data(j)), nm+': dati decompressi'); assert.equal(d.length, r.usize);
    if (r.method===8){ packed++; if (Buffer.compare(r.body, j.body)===0) sameBytes++; } else assert.ok(Buffer.from(r.body).equals(Buffer.from(j.body)), nm+': voce STORE'); });
  assert.equal(Buffer.from(R[0].name,'hex').toString(), 'mimetype'); assert.equal(R[0].method, 0); assert.equal(R[0].offset, 0);
  assert.ok(Buffer.from(rs).subarray(0, 38+R[0].usize).equals(js.subarray(0, 38+R[0].usize)), '«mimetype» in testa con gli stessi byte');
  // il lettore: JSZip apre l'archivio del Rust e il progetto decodificato è lo stesso
  const P=await F.decode(rs, JSZip), Q=await F.decode(new Uint8Array(js), JSZip);
  assert.deepStrictEqual(P, Q);
  console.log('voci', R.length, '· DEFLATE', packed, '(byte compressi uguali in', sameBytes, ') · dimensione Rust', rs.length, 'JSZip', js.length);
});

test('AcchCalc.zipRequest: opzioni che il Rust non scrive (commento, piattaforma UNIX, permessi, livello ≠ 6) restano a JSZip', async ()=>{
  const z=new JSZip(); z.file('a.txt','x');
  assert.equal(await C.zipRequest(z, {compression:'STORE', comment:'c'}), null);
  assert.equal(await C.zipRequest(z, {compression:'STORE', platform:'UNIX'}), null);
  assert.equal(await C.zipRequest(z, {compression:'DEFLATE', compressionOptions:{level:9}}), null);
  const y=new JSZip(); y.file('b', 'x', {unixPermissions:0o644}); assert.equal(await C.zipRequest(y, {}), null);
  const q=await C.zipRequest(z, {compression:'DEFLATE', compressionOptions:{level:6}}); assert.equal(String.fromCharCode(...q.subarray(0,4)), 'ACZ1');
  assert.deepStrictEqual(C.dos(new Date(Date.UTC(2026,10,14,12,34,57))), [(12<<11)|(34<<5)|28, ((2026-1980)<<9)|(11<<5)|14]);
});
test.after(()=>{ if (tmp) fs.rmSync(tmp,{recursive:true,force:true}); });
