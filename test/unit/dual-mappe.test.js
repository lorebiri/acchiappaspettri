// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I10, test incrociati JS ↔ Rust sulle mappe (ACCH_DUAL=1): acch-core-cli --cube legge i file di mappa (sintetici; i .wdf pubblici di
// py-wdf-reader se sono in ACCH_MAPPE_PUBBLICHE, solo in locale) e fa i calcoli; app/map-core.js fa lo stesso. Cubo, assi, immagini
// di banda (area, altezza, posizione, rapporto, intensità), regioni, accorpamento e pixel: bit per bit (Object.is). Errori: stesso codice.
// Il .wdf si prova anche «sul disco» (--disk: lettura a pezzi, come per i cubi grandi del desktop). Senza ACCH_DUAL=1 si salta (serve cargo).
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), os=require('os'), {execFileSync}=require('child_process');
const ROOT=path.join(__dirname,'..','..'), TAURI=path.join(ROOT,'src-tauri'), ON=process.env.ACCH_DUAL==='1';
const M=require(path.join(ROOT,'app','map-core.js')), {decodeWire}=require(path.join(ROOT,'app','read-core.js')), G=require('./mappe-dati.js');
function cli(){ execFileSync('cargo',['build','--release','-q','-p','acch-core','--bin','acch-core-cli'],{cwd:TAURI, stdio:'inherit'}); return path.join(TAURI,'target','release','acch-core-cli'+(process.platform==='win32'?'.exe':'')); }
const ab=b=>b.buffer.slice(b.byteOffset, b.byteOffset+b.length);
const OPS=c=>{ const x=c.x.values, lo=Math.min(x[0],x[x.length-1]), hi=Math.max(x[0],x[x.length-1]), q=t=>lo+(hi-lo)*t, L=[];
  for (const base of ['none','linear']) for (const k of ['area','height','peak']) L.push(`${k} ${q(0.3)} ${q(0.45)} ${base}`);
  L.push(`ratio ${q(0.3)} ${q(0.45)} ${q(0.6)} ${q(0.8)} linear`, `ratio ${q(0.1)} ${q(0.2)} ${q(0.5)} ${q(0.5)} none`, `intensity ${q(0.37)}`, `area ${q(0.5)} ${q(0.5)} none`, `area ${hi+10} ${hi+20} none`);
  L.push(`roi 0 0 ${c.nx-1} ${c.ny-1}`, `roi 1 0 ${Math.min(3,c.nx-1)} ${Math.min(2,c.ny-1)}`, 'bin 2', 'bin 3', `pixel ${c.nx-1} ${c.ny-1}`); return L; };
function jsRun(c, ops){ return ops.map(line=>{ const f=line.split(/\s+/), n=j=>+f[j];
  try{ switch (f[0]){
    case 'roi': { const r=M.roiMean(c,{x0:n(1),y0:n(2),x1:n(3),y1:n(4)}); return {n:r.n, mean:r.mean}; }
    case 'bin': return {cube:M.bin(c, n(1))};
    case 'pixel': return {spectrum:M.pixelSpectrum(c, n(1), n(2))};
    case 'intensity': return {image:M.bandImage(c,{kind:'intensity', at:n(1)})};
    case 'ratio': return {image:M.bandImage(c,{kind:'ratio', a:n(1), b:n(2), a2:n(3), b2:n(4), base:f[5]})};
    default: return {image:M.bandImage(c,{kind:f[0], a:n(1), b:n(2), base:f[3]})}; } }catch(e){ return {error:e.code||String(e)}; } }); }
function same(a, b, where){ assert.strictEqual(a.length, b.length, where+': lunghezza'); for (let i=0;i<a.length;i++) if (!Object.is(a[i], b[i])) assert.fail(`${where}[${i}]: Rust ${a[i]} ≠ JS ${b[i]}`); }
function sameCube(R, c, where){ assert.deepStrictEqual([R.nx,R.ny,R.nc],[c.nx,c.ny,c.nc], where+': dimensioni'); assert.strictEqual(R.dtype, c.data instanceof Float64Array?'f64':'f32', where+': tipo');
  same(R.data, c.data, where+' dati'); for (const k of ['x','px','py']){ same(R[k].values, c[k].values, where+' '+k); assert.strictEqual(R[k].unit, c[k].unit||'', where+' unità '+k); }
  for (const k of ['format','placement','layout','complete','spectra','interleave']) assert.deepStrictEqual(R.meta[k], c.meta[k], where+' meta.'+k); }
function compare(exe, tmp, name, kind, buf, hdr, extra){ const f=path.join(tmp, name), out=path.join(tmp, name+'.acw'), opsF=path.join(tmp, name+'.ops'); fs.writeFileSync(f, buf);
  let js, err=null; try{ js=kind==='envi' ? M.readEnvi(hdr, buf) : M.read(kind, buf); }catch(e){ err=e.code||String(e); }
  const ops=js ? OPS(js) : []; fs.writeFileSync(opsF, ops.join('\n'));
  const args=['--cube', out, kind, f]; if (hdr!=null){ fs.writeFileSync(f+'.hdr', hdr); args.push(f+'.hdr'); } args.push('--ops', opsF); if (extra) args.push(...extra);
  execFileSync(exe, args); const R=decodeWire(ab(fs.readFileSync(out)));
  if (err){ assert.strictEqual(String(R.error||'').split(':')[0], err, name+': errore'); return 'errore '+err; }
  if (js===null){ assert.strictEqual(R.none, true, name+': non è una mappa'); return 'non mappa'; }
  assert.ok(!R.error, name+': '+R.error); sameCube(R, js, name);
  const J=jsRun(js, ops); R.results.forEach((r,i)=>{ const j=J[i], w=name+' «'+ops[i]+'»';
    if (j.error){ assert.strictEqual(String(r.error).split(':')[0], j.error, w); return; }
    if (j.image) same(r.image, j.image, w); else if (j.spectrum) same(r.spectrum, j.spectrum, w); else if (j.cube) sameCube(r, j.cube, w); else { assert.strictEqual(r.n, j.n, w+' n'); same(r.mean, j.mean, w); } });
  return 'ok'; }

test('ACCH_DUAL: mappe sintetiche in tutti i formati, Rust identico al JS (cubo e calcoli)', {skip:!ON && 'serve ACCH_DUAL=1 (e cargo)', timeout:600000}, ()=>{
  const exe=cli(), tmp=fs.mkdtempSync(path.join(os.tmpdir(),'acch-mappe-')), seen={};
  try{
    const {cube}=G.truth({nx:9, ny:7, nc:301, noise:3}), small=G.truth({nx:6, ny:4, nc:40, noise:1}).cube;
    const cases=[['raster.wdf','wdf',G.wdf(cube)], ['colonne.wdf','wdf',G.wdf(cube,{order:'colmajor'})], ['incompleta.wdf','wdf',G.wdf(cube,{count:20})], ['linea.wdf','wdf',G.wdf(cube,{line:true})],
      ['griglia.txt','text',Buffer.from(G.gridText(small))], ['griglia-pv.txt','text',Buffer.from(G.gridText(small,';').replace(/\./g,','))], ['colonne.txt','text',Buffer.from(G.columnsText(small))],
      ['normale.csv','text',Buffer.from('x,y\n1,2\n3,4\n5,6\n7,8\n9,10\n')], ['serie.0','opus-series',G.opusSeries(small)]];
    for (const il of ['bsq','bil','bip']) for (const [dt,bo] of [[4,0],[5,1],[2,1],[12,0],[1,0]]){ const e=G.envi(small,{interleave:il, dataType:dt, byteOrder:bo, offset:dt===5?64:0, scale:dt===1?1:dt===4||dt===5?1:50}); cases.push([`envi-${il}-${dt}-${bo}.img`,'envi',e.bin,e.hdr]); }
    // file troncati o alterati: stesso esito (stesso errore o stesso cubo)
    let seed=5; const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; };
    for (const [n,k,b] of cases.slice(0,9)){ for (const cut of [0.5, 0.97]) cases.push(['tronco-'+cut+'-'+n, k, b.subarray(0, Math.floor(b.length*cut))]);
      const c=Buffer.from(b); for (let j=0;j<6;j++) c[Math.floor(rnd()*c.length)]^=0xFF; cases.push(['alterato-'+n, k, c]); }
    for (const [n,k,b,h] of cases){ const r=compare(exe, tmp, n, k, b, h); seen[r.split(' ')[0]]=(seen[r.split(' ')[0]]||0)+1; }
    for (const [n,,b] of cases.slice(0,4)) assert.strictEqual(compare(exe, tmp, 'disco-'+n, 'wdf', b, null, ['--disk']), 'ok', 'disco '+n);
    console.log('mappe sintetiche:', JSON.stringify(seen));
    assert.ok(seen.ok>=24 && seen.errore>=1 && seen.non>=1);
  } finally { fs.rmSync(tmp,{recursive:true,force:true}); }
});

// .wdf pubblici (py-wdf-reader, MIT): non sono nel repository; ACCH_MAPPE_PUBBLICHE=<cartella con mapping.wdf, streamline.wdf…>
const PUB=process.env.ACCH_MAPPE_PUBBLICHE;
test('ACCH_DUAL: .wdf pubblici, Rust identico al JS, in memoria e sul disco', {skip:(!ON || !PUB) && 'serve ACCH_DUAL=1 e ACCH_MAPPE_PUBBLICHE', timeout:900000}, ()=>{
  const exe=cli(), tmp=fs.mkdtempSync(path.join(os.tmpdir(),'acch-mappe-'));
  try{ const L=fs.readdirSync(PUB).filter(n=>/\.wdf$/i.test(n)).sort(); assert.ok(L.length>=1);
    for (const n of L){ const b=fs.readFileSync(path.join(PUB,n)); assert.strictEqual(compare(exe, tmp, n, 'wdf', b), 'ok', n); assert.strictEqual(compare(exe, tmp, 'disco-'+n, 'wdf', b, null, ['--disk']), 'ok', 'disco '+n); }
    console.log('wdf pubblici identici:', L.join(', '));
  } finally { fs.rmSync(tmp,{recursive:true,force:true}); }
});
