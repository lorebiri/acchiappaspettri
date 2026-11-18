// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I10, mappe e dati iperspettrali (app/map-core.js): lettori (.wdf, ENVI, testo a griglia e a colonne, serie OPUS) su file SINTETICI con
// verità nota (test/unit/mappe-dati.js), immagini di banda, spettri di pixel e regioni, accorpamento, MCR-ALS sul cubo srotolato,
// cubo nel progetto (formato 2) e file affiancato .acchcube. Su b1f1ba4 il modulo non esiste: tutti i casi falliscono.
'use strict';
const test=require('node:test'), assert=require('node:assert'), path=require('path');
const ROOT=path.join(__dirname,'..','..');
const M=require(path.join(ROOT,'app','map-core.js')), MC=require(path.join(ROOT,'app','mcr-core.js')), F=require(path.join(ROOT,'app','project-format.js')), JSZip=require(path.join(ROOT,'node_modules','jszip'));
const G=require('./mappe-dati.js');

const sameF32=(a, b, msg)=>{ assert.strictEqual(a.length, b.length, msg+': lunghezza'); for (let i=0;i<a.length;i++){ const u=Math.fround(a[i]), v=Math.fround(b[i]); if (!Object.is(u,v) && !(u!==u && v!==v)) assert.fail(`${msg}: elemento ${i} ${a[i]} ≠ ${b[i]}`); } };
function sameCube(c, ref, msg, xtol){ assert.deepStrictEqual([c.nx,c.ny,c.nc],[ref.nx,ref.ny,ref.nc], msg+': dimensioni'); sameF32(c.data, ref.data, msg);
  if (xtol) c.x.values.forEach((v,i)=>assert.ok(Math.abs(v-ref.x.values[i])<=xtol, msg+' x')); else sameF32(c.x.values, ref.x.values, msg+' x'); }
const corr=(a,b)=>{ let n=0, sa=0, sb=0; for (let i=0;i<a.length;i++) if (Number.isFinite(a[i])){ sa+=a[i]; sb+=b[i]; n++; } const ma=sa/n, mb=sb/n; let ab=0, aa=0, bb=0; for (let i=0;i<a.length;i++) if (Number.isFinite(a[i])){ ab+=(a[i]-ma)*(b[i]-mb); aa+=(a[i]-ma)**2; bb+=(b[i]-mb)**2; } return ab/Math.sqrt(aa*bb); };

test('WDF sintetico: riga per riga, per colonne (coordinate ORGN), misura incompleta, linea', ()=>{
  const {cube}=G.truth();
  const r=M.readWdf(G.wdf(cube)); sameCube(r, cube, 'raster'); assert.strictEqual(r.meta.placement,'position'); assert.strictEqual(r.meta.format,'wdf'); assert.strictEqual(r.x.unit,'cm-1');
  assert.ok(Math.abs(r.px.values[3]-cube.px.values[3])<1e-6 && Math.abs(r.py.values[2]-cube.py.values[2])<1e-6, 'coordinate dei pixel');
  sameCube(M.readWdf(G.wdf(cube,{order:'colmajor'})), cube, 'per colonne');
  const inc=M.readWdf(G.wdf(cube,{count:50})); assert.strictEqual(inc.meta.complete,false); const ref=Float32Array.from(cube.data); ref.fill(NaN, 50*cube.nc); sameF32(inc.data, ref, 'incompleta');
  const ln=M.readWdf(G.wdf(cube,{line:true})); assert.deepStrictEqual([ln.nx,ln.ny],[cube.nx*cube.ny,1]); sameF32(ln.data, cube.data, 'linea');
  assert.strictEqual(M.sniff('x.wdf', G.wdf(cube)), 'wdf');
  for (const cut of [100, 600, 4000]) assert.throws(()=>M.readWdf(G.wdf(cube).subarray(0,cut)), e=>e instanceof M.MapError, 'troncato a '+cut);
});

test('ENVI: BSQ, BIL, BIP; f32, f64 big-endian, interi a 16 bit; header offset; valore da ignorare', ()=>{
  const {cube}=G.truth({nx:7, ny:5, nc:40});
  for (const il of ['bsq','bil','bip']) for (const [dt,bo] of [[4,0],[5,1],[4,1]]){ const {hdr,bin}=G.envi(cube,{interleave:il, dataType:dt, byteOrder:bo, offset:dt===5?128:0}); const r=M.readEnvi(hdr, bin);
    sameCube(r, cube, il+' tipo '+dt+' ordine '+bo, 1e-4); assert.ok(dt===5 ? r.data instanceof Float64Array : r.data instanceof Float32Array); assert.strictEqual(r.x.unit,'nm'); }
  for (const dt of [2,12]){ const {hdr,bin}=G.envi(cube,{interleave:'bil', dataType:dt, byteOrder:1, scale:100}); const r=M.readEnvi(hdr, bin);
    for (let i=0;i<r.data.length;i++) assert.strictEqual(r.data[i], Math.round(cube.data[i]*100)); }
  const {hdr,bin}=G.envi(cube,{}); const r=M.readEnvi(hdr.replace('byte order = 0','byte order = 0\ndata ignore value = '+cube.data[0]), bin); assert.ok(Number.isNaN(r.data[0]));
  assert.strictEqual(M.sniff('mappa.hdr', Buffer.from(hdr)), 'envi');
  assert.throws(()=>M.readEnvi(hdr, bin.subarray(0, bin.length-1)), e=>e.code==='truncated');
  assert.throws(()=>M.readEnvi(hdr.replace('data type = 4','data type = 6'), bin), e=>e.code==='envi-type');
  assert.throws(()=>M.parseEnviHeader('samples = 3'), e=>e.code==='not-envi');
});

test('testo a mappa: griglia (LabSpec) con tabulatore e punto e virgola, colonne X Y onda intensità (WiRE); un file normale non è una mappa', ()=>{
  const {cube}=G.truth({nx:6, ny:4, nc:50});
  sameCube(M.readMapText(G.gridText(cube)), cube, 'griglia tab');
  const sc=M.readMapText(G.gridText(cube,';').replace(/\./g,',')); sameCube(sc, cube, 'griglia ; con virgola decimale');
  const co=M.readMapText(G.columnsText(cube)); sameCube(co, cube, 'colonne'); assert.strictEqual(co.meta.layout,'columns'); sameF32(co.px.values, cube.px.values, 'px');
  // pixel mancante → NaN; pixel ripetuto → errore
  const L=G.columnsText(cube).split('\n'); const miss=M.readMapText(L.slice(0,1).concat(L.slice(1+cube.nc)).join('\n')); assert.ok(Number.isNaN(miss.data[0]) && miss.meta.complete===false);
  assert.strictEqual(M.readMapText('Wavenumber,Absorbance\n400,0.1\n402,0.2\n404,0.3\n406,0.2\n408,0.1\n'), null);
  assert.strictEqual(M.readMapText('1\t2\n3\t4\n'), null);
});

test('serie OPUS (blocco 3D, DEDOTTO): n × 1 e nuova disposizione in colonne', ()=>{
  const {cube}=G.truth({nx:5, ny:3, nc:60}), b=G.opusSeries(cube);
  assert.strictEqual(M.sniff('mappa.0', b), 'opus-series');
  const r=M.readOpusSeries(b); assert.deepStrictEqual([r.nx,r.ny,r.nc],[15,1,60]); assert.strictEqual(r.meta.layout,'unknown');
  const g=M.reshape(r, 5); assert.deepStrictEqual([g.nx,g.ny],[5,3]); sameF32(g.data, cube.data, 'serie'); assert.ok(Math.abs(g.x.values[59]-cube.x.values[59])<1e-9);
  assert.throws(()=>M.reshape(r, 4), e=>e.code==='reshape');
});

test('immagini di banda con verità nota: area con fondo lineare ∝ concentrazione, posizione del picco, rapporto, intensità', ()=>{
  const {cube, conc, bands, shift}=G.truth();
  for (let k=0;k<3;k++){ const b=bands[k], img=M.bandImage(cube,{kind:'area', a:b.c-6*b.s, b:b.c+6*b.s, base:'linear'}), A=b.A*b.s*Math.sqrt(2*Math.PI);
    for (let p=0;p<img.length;p++) assert.ok(Math.abs(img[p]/(A*conc[k][p])-1)<2e-3, `banda ${k} pixel ${p}: ${img[p]} invece di ${A*conc[k][p]}`); }
  const pk=M.bandImage(cube,{kind:'peak', a:960, b:1040}); for (let p=0;p<pk.length;p++) assert.ok(Math.abs(pk[p]-(1000+shift[p]))<0.05, `posizione ${p}: ${pk[p]}`);
  const rt=M.bandImage(cube,{kind:'ratio', a:1000-48, b:1000+48, a2:1600-60, b2:1600+60, base:'linear'}); const r0=bands[0].A*bands[0].s/(bands[2].A*bands[2].s);
  for (let p=0;p<rt.length;p++) assert.ok(Math.abs(rt[p]/(r0*conc[0][p]/conc[2][p])-1)<3e-3, 'rapporto '+p);
  const it=M.bandImage(cube,{kind:'intensity', at:1350}); const j=M.nearest(cube.x.values,1350); for (let p=0;p<it.length;p++) assert.strictEqual(it[p], cube.data[p*cube.nc+j]);
  const h=M.bandImage(cube,{kind:'height', a:1300, b:1400, base:'linear'}); assert.ok(corr(h, conc[1])>0.9999, 'altezza');
  // asse crescente o decrescente: stessa area
  const rev=Object.assign({}, cube, {x:{values:cube.x.values.slice().reverse()}, data:Float32Array.from(cube.data)}); for (let p=0;p<cube.nx*cube.ny;p++) rev.data.subarray(p*cube.nc,(p+1)*cube.nc).reverse();
  const a1=M.bandImage(cube,{kind:'area',a:1200,b:1500,base:'linear'}), a2=M.bandImage(rev,{kind:'area',a:1500,b:1200,base:'linear'}); for (let p=0;p<a1.length;p++) assert.ok(Math.abs(a1[p]-a2[p])<=1e-9*Math.abs(a1[p]));
  assert.throws(()=>M.bandImage(cube,{kind:'area', a:5000, b:6000}), e=>e.code==='range');
  // pixel non misurato: NaN nell'immagine
  const w=M.readWdf(G.wdf(cube,{count:10})); const im=M.bandImage(w,{kind:'area',a:900,b:1100}); assert.ok(Number.isFinite(im[9]) && Number.isNaN(im[10]));
});

test('spettro di un pixel, spettro medio di una regione (pixel non misurati esclusi), accorpamento 2 × 2', ()=>{
  const {cube}=G.truth({nx:5, ny:4, nc:30}), nc=cube.nc;
  const s=M.pixelSpectrum(cube, 3, 2); for (let j=0;j<nc;j++) assert.strictEqual(s[j], cube.data[(2*5+3)*nc+j]);
  const r=M.roiMean(cube,{x0:1, y0:1, x1:2, y1:3}); assert.strictEqual(r.n, 6);
  for (let j=0;j<nc;j++){ let a=0; for (const [ix,iy] of [[1,1],[2,1],[1,2],[2,2],[1,3],[2,3]]) a+=cube.data[(iy*5+ix)*nc+j]; assert.ok(Math.abs(r.mean[j]-a/6)<=1e-12*Math.abs(a)); }
  const holes=Object.assign({}, cube, {data:Float32Array.from(cube.data)}); holes.data.fill(NaN, 0, nc); assert.strictEqual(M.roiMean(holes,{x0:0,y0:0,x1:1,y1:0}).n, 1);
  const b=M.bin(cube, 2); assert.deepStrictEqual([b.nx,b.ny],[3,2]);
  for (let j=0;j<nc;j++){ const v=(cube.data[j]+cube.data[nc+j]+cube.data[5*nc+j]+cube.data[6*nc+j])/4; assert.strictEqual(b.data[j], Math.fround(v)); }
  assert.strictEqual(b.data[(2)*nc], Math.fround((cube.data[4*nc]+cube.data[9*nc])/2), 'blocco al bordo');
  assert.strictEqual(M.meanSpectrum(cube).n, 20);
});

test('MCR-ALS sul cubo srotolato: le mappe di concentrazione ritrovano quelle vere (a meno della scala)', ()=>{
  const {cube, conc}=G.truth({nx:15, ny:10, nc:351, noise:0.05, base:false, shift:false, selective:true});
  const U=M.unfold(cube, {}); assert.strictEqual(U.D.m, 150); assert.strictEqual(U.D.n, 351);
  const R=MC.als(U.D, {nc:3, init:'simplisma', nonnegC:true, nonnegS:true, maxIter:300, tol:1e-7});
  const maps=[0,1,2].map(k=>M.refold(R.C, k, U.pix, U.nx, U.ny));
  for (let k=0;k<3;k++){ const best=Math.max(...maps.map(m=>corr(m, conc[k]))); assert.ok(best>0.995, `componente ${k}: correlazione ${best}`); }
  assert.ok(R.lof<2, 'mancanza di adattamento '+R.lof);
  // cubo grande: accorpato fino a stare nei limiti, pixel non misurati esclusi
  const U2=M.unfold(cube, {maxRows:40, range:[900,1700]}); assert.ok(U2.bin>=2 && U2.D.m<=40 && U2.D.n<351);
});

test('scala dei colori: viridis e cividis da 256 colori; pixel senza valore trasparenti; estremi ai percentili', ()=>{
  assert.strictEqual(M.lut('viridis').length, 768); assert.deepStrictEqual(Array.from(M.lut('cividis').subarray(0,3)), [0,0x22,0x4e]); assert.strictEqual(M.cssColor('viridis',1), 'rgb(253,231,37)');
  const img=Float64Array.from({length:101},(_,i)=>i); img[5]=NaN; const [lo,hi]=M.range(img); assert.deepStrictEqual([lo,hi],[1,99]);
  const c=M.colorize(img, 0, 100, 'cividis'); assert.strictEqual(c[5*4+3], 0); assert.strictEqual(c[3], 255);
});

test('cubo nel progetto (formato 2): andata e ritorno bit per bit, f32 e f64', async ()=>{
  const {cube}=G.truth({nx:4, ny:3, nc:20}), env=M.readEnvi(...Object.values(G.envi(cube,{dataType:5})));
  for (const c of [cube, env]){ const rec=M.toRecord(c), bytes=await F.encode({appVersion:'t', spectra:[{name:'mappa', path:'mappa.wdf', cube:rec, memory:{}}]}, JSZip), back=await F.decode(bytes, JSZip);
    const r=M.fromRecord(back.spectra[0].cube); sameCube(r, c, 'progetto', 1e-4); assert.strictEqual(r.data.constructor, c.data.constructor); assert.strictEqual(back.spectra[0].source, null); }
});

test('cubo grande nel file affiancato .acchcube: nel progetto solo assi, metadati e impronta; nomi non sicuri rifiutati', async ()=>{
  const ext={file:'prova.1.acchcube', bytes:4*2*3*5+64, sha256:'ab'.repeat(32)}, rec={nx:2, ny:3, nc:5, x:{values:[1,2,3,4,5], unit:'cm-1'}, px:{values:[0,1]}, py:{values:[0,1,2]}, y:{}, dtype:'f32', data:null, external:ext, meta:{mean:[1,2,3,4,5], format:'wdf'}};
  const bytes=await F.encode({appVersion:'t', spectra:[{name:'grande.wdf', path:'grande.wdf', cube:rec}]}, JSZip), back=await F.decode(bytes, JSZip), cb=back.spectra[0].cube;
  assert.strictEqual(cb.data, null); assert.deepStrictEqual(cb.external, ext); assert.deepStrictEqual(cb.meta.mean, [1,2,3,4,5]);
  const z=await JSZip.loadAsync(bytes); assert.ok(!Object.keys(z.files).some(n=>/^cube\//.test(n)), 'nessun cubo nello ZIP');
  for (const bad of ['../x.acchcube','a/b.acchcube','x.bin','.acchcube','c:x.acchcube']) await assert.rejects(F.encode({appVersion:'t', spectra:[{name:'g', path:'g', cube:Object.assign({}, rec, {external:Object.assign({}, ext, {file:bad})})}]}, JSZip), e=>e.code==='bad-input', bad);
  await assert.rejects(F.encode({appVersion:'t', spectra:[{name:'g', path:'g', cube:Object.assign({}, rec, {external:Object.assign({}, ext, {bytes:10})})}]}, JSZip), e=>e.code==='bad-input', 'dimensione minore del cubo');
  // un progetto alterato con un percorso nel nome del file affiancato non si apre
  const z2=await JSZip.loadAsync(bytes), sp=JSON.parse(await z2.file('project/spectra.json').async('string')); sp[0].cube.external.file='../../x.acchcube';
  z2.file('project/spectra.json', JSON.stringify(sp)); const man=JSON.parse(await z2.file('manifest.json').async('string')), t=new TextEncoder().encode(JSON.stringify(sp)); man.entries['project/spectra.json']={sha256:F.sha256(t), size:t.length}; z2.file('manifest.json', JSON.stringify(man));
  await assert.rejects(F.decode(await z2.generateAsync({type:'uint8array'}), JSZip), e=>e.code==='invalid-schema');
});

test('riconoscimento: .wdf dai primi byte, ENVI dal nome .hdr, serie OPUS dalla directory; i lettori a fette danno lo stesso cubo', ()=>{
  const {cube}=G.truth({nx:5, ny:4, nc:30}), w=G.wdf(cube), e=G.envi(cube,{});
  assert.strictEqual(M.sniff('qualsiasi.bin', w), 'wdf'); assert.strictEqual(M.sniff('scena.hdr', Buffer.from(e.hdr)), 'envi'); assert.strictEqual(M.sniff('scena.txt', Buffer.from(e.hdr)), null);
  const g=M.readWdfGen(w); let r, n=0; do { r=g.next(); n++; } while (!r.done); sameCube(r.value, cube, 'a fette'); assert.ok(n>=2);
  sameCube(M.read('envi', e.bin, e.hdr), cube, 'read(envi)', 1e-4);
});
