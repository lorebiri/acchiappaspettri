// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// R12 · mappe e dati iperspettrali (app/map-core.js, SPEC-AVANZATE §1). Il committente non ha strumenti né file di mappe: validazione su
// dati SINTETICI con verità nota e su file PUBBLICI, dichiarata così.
// 1. Sintetici (sempre): tre componenti gaussiane con mappe di concentrazione note, fondo lineare, spostamento noto della banda;
//    criteri numerici su area, altezza, rapporto, posizione del picco, MCR-ALS, con e senza rumore, in tutti i formati.
// 2. Pubblici (solo in locale, ACCH_MAPPE_PUBBLICHE=<cartella con wdf/ e gdal-envi/>): i .wdf d'esempio di py-wdf-reader (MIT) e i
//    campioni ENVI dei test di GDAL (MIT). Non sono nel repository: i valori di riferimento (mappe/pubblici.json) sono stati letti da
//    un lettore indipendente in Python (mappe/rif_pubblici.py, solo il modulo struct; nessun codice esterno eseguito).
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..','..'), M=require(path.join(ROOT,'app','map-core.js')), MC=require(path.join(ROOT,'app','mcr-core.js')), G=require('../unit/mappe-dati.js');
const corr=(a,b)=>{ let n=0, sa=0, sb=0; for (let i=0;i<a.length;i++){ sa+=a[i]; sb+=b[i]; n++; } const ma=sa/n, mb=sb/n; let ab=0, aa=0, bb=0; for (let i=0;i<a.length;i++){ ab+=(a[i]-ma)*(b[i]-mb); aa+=(a[i]-ma)**2; bb+=(b[i]-mb)**2; } return ab/Math.sqrt(aa*bb); };
const relMax=(img, ref)=>{ let m=0; for (let i=0;i<img.length;i++) m=Math.max(m, Math.abs(img[i]/ref[i]-1)); return m; };

test('R12 sintetici: immagini di banda con verità nota, in tutti i formati letti', ()=>{
  const {cube, conc, bands, shift}=G.truth({nx:16, ny:12, nc:701}), rows=[];
  const files={wdf:M.readWdf(G.wdf(cube,{order:'colmajor'})), envi:M.readEnvi(...Object.values(G.envi(cube,{interleave:'bip'}))), testo:M.readMapText(G.columnsText(G.truth({nx:16, ny:12, nc:701}).cube))};
  for (const [fmt, c] of Object.entries(files)){
    for (let k=0;k<3;k++){ const b=bands[k], A=b.A*b.s*Math.sqrt(2*Math.PI), img=M.bandImage(c,{kind:'area', a:b.c-6*b.s, b:b.c+6*b.s, base:'linear'}), e=relMax(img, conc[k].map(v=>v*A));
      rows.push([fmt, 'area banda '+(k+1), e]); assert.ok(e<2e-3, `${fmt}: area della banda ${k+1}, errore relativo ${e}`); }
    const pk=M.bandImage(c,{kind:'peak', a:960, b:1040}); let ep=0; for (let i=0;i<pk.length;i++) ep=Math.max(ep, Math.abs(pk[i]-1000-shift[i])); rows.push([fmt, 'posizione del picco (cm⁻¹)', ep]); assert.ok(ep<0.05, fmt+': posizione '+ep);
    const rt=M.bandImage(c,{kind:'ratio', a:952, b:1048, a2:1540, b2:1660, base:'linear'}), r0=bands[0].A*bands[0].s/(bands[2].A*bands[2].s); const er=relMax(rt, conc[0].map((v,i)=>r0*v/conc[2][i])); rows.push([fmt, 'rapporto 1/3', er]); assert.ok(er<3e-3, fmt+': rapporto '+er);
    const ht=M.bandImage(c,{kind:'height', a:1300, b:1400, base:'linear'}), ch=corr(ht, conc[1]); rows.push([fmt, 'altezza banda 2 (1 − r)', 1-ch]); assert.ok(ch>0.9999, fmt+': altezza '+ch); }
  console.log(rows.map(r=>r[0]+' · '+r[1]+': '+r[2].toExponential(2)).join('\n'));
});

test('R12 sintetici: rumore, pixel non misurati, accorpamento; MCR-ALS ritrova le mappe di concentrazione', ()=>{
  for (const noise of [0.5, 2]){ const {cube, conc, bands}=G.truth({nx:16, ny:12, nc:701, noise, seed:3}), b=bands[1];
    const img=M.bandImage(cube,{kind:'area', a:b.c-6*b.s, b:b.c+6*b.s, base:'linear'}), c=corr(img, conc[1]); assert.ok(c>(noise<1?0.999:0.99), `rumore ${noise}: correlazione ${c}`); }
  const {cube}=G.truth({nx:16, ny:12, nc:200}), w=M.readWdf(G.wdf(cube,{count:100})), img=M.bandImage(w,{kind:'area', a:900, b:1100});
  assert.strictEqual(img.filter(Number.isNaN).length, 92, 'pixel non misurati: NaN'); assert.strictEqual(M.roiMean(w,{x0:0,y0:0,x1:15,y1:11}).n, 100);
  const b2=M.bin(cube, 4); assert.deepStrictEqual([b2.nx,b2.ny],[4,3]);
  for (const noise of [0, 0.05, 0.5]){ const T=G.truth({nx:15, ny:10, nc:351, noise, base:false, shift:false, selective:true}), U=M.unfold(T.cube,{}), R=MC.als(U.D,{nc:3, maxIter:400, tol:1e-8});
    const best=T.conc.map(cv=>Math.max(...[0,1,2].map(q=>corr(M.refold(R.C,q,U.pix,U.nx,U.ny), cv))));
    console.log(`MCR-ALS, rumore ${noise}: correlazioni ${best.map(v=>v.toFixed(5)).join(', ')}, mancanza di adattamento ${R.lof.toFixed(3)}%`);
    best.forEach((v,k)=>assert.ok(v>(noise<0.1?0.999:0.99), `MCR rumore ${noise} componente ${k}: ${v}`)); }
});

const PUB=process.env.ACCH_MAPPE_PUBBLICHE, REF=JSON.parse(fs.readFileSync(path.join(__dirname,'mappe','pubblici.json'),'utf8'));
test('R12 pubblici: .wdf di py-wdf-reader e ENVI di GDAL letti come il lettore indipendente', {skip:!PUB && 'serve ACCH_MAPPE_PUBBLICHE (file pubblici solo in locale)'}, ()=>{
  for (const [rel, R] of Object.entries(REF)){ const p=path.join(PUB, rel); let c;
    if (rel.startsWith('wdf/')) c=M.readWdf(fs.readFileSync(p));
    else { const n=path.basename(rel); c=M.readEnvi(fs.readFileSync(p+'.hdr','latin1'), fs.readFileSync(p+(n.startsWith('envi')?'.img':'.dat'))); }
    assert.deepStrictEqual([c.nx,c.ny,c.nc],[R.nx,R.ny,R.nc], rel+': dimensioni');
    if (R.x0!=null) assert.ok(Object.is(c.x.values[0], R.x0) && Object.is(c.x.values[c.nc-1], R.x1), rel+': asse');
    for (const s of R.samples){ const sp=M.pixelSpectrum(c, s.ix, s.iy); s.c.forEach((j,q)=>assert.ok(Object.is(sp[j], s.v[q]), `${rel} (${s.ix}, ${s.iy}) canale ${j}: ${sp[j]} ≠ ${s.v[q]}`)); let a=0; for (const v of sp) a+=v; assert.strictEqual(a, s.sum, rel+': somma dello spettro'); }
    if (R.total!=null){ let t=0; for (const v of c.data) t+=v; assert.strictEqual(t, R.total, rel+': totale'); } }
  // stessa immagine nelle tre disposizioni ENVI di GDAL; .wdf per colonne (StreamLine) messo al suo posto dalle coordinate
  const e=['bil','bip','bsq'].map(il=>M.readEnvi(fs.readFileSync(path.join(PUB,'gdal-envi','envi_rgbsmall_'+il+'.hdr'),'latin1'), fs.readFileSync(path.join(PUB,'gdal-envi','envi_rgbsmall_'+il+'.img'))));
  assert.ok(e[0].data.every((v,i)=>v===e[1].data[i] && v===e[2].data[i]), 'BIL, BIP e BSQ uguali');
  const s=M.readWdf(fs.readFileSync(path.join(PUB,'wdf','streamline.wdf'))); assert.strictEqual(s.meta.placement, 'position');
  console.log('file pubblici confrontati:', Object.keys(REF).join(', '));
});
