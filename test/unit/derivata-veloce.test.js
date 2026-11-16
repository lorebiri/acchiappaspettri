// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I5 (decisione del Capo Progetto): derivLS e peakCandidates lineari per i file grandi.
// - peakCandidates in O(n): identico bit per bit al calcolo di prima (riportato qui come riferimento), anche con valori uguali e NaN.
// - derivLS con finestre larghe (m > 64): somme scorrevoli, differenza dal calcolo punto per punto entro 1e-12 della scala della derivata;
//   con m ≤ 64 identico bit per bit. Il nucleo è quello di index.html, eseguito in questo processo (veloce) e non in un vm.
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','..','index.html'),'utf8'), src=html.slice(html.indexOf('/*CORE-START*/'), html.indexOf('/*CORE-END*/'));
const C=new Function(src+';return {parseText, decodeBuffer, derivLS, sgSmooth, noiseSigma, peakCandidates, DERIV_EXACT_M: typeof DERIV_EXACT_M==="undefined"?null:DERIV_EXACT_M};')();
// riferimenti: il codice di prima della I5
function derivRef(xs, ys, m){ const n=ys.length, out=new Float64Array(n);
  for (let i=0;i<n;i++){ const a=Math.max(0,i-m), b=Math.min(n-1,i+m); let sx=0, sy=0, c=0;
    for (let k=a;k<=b;k++){ sx+=xs[k]; sy+=ys[k]; c++; } const mx=sx/c, my=sy/c; let sxx=0, sxy=0;
    for (let k=a;k<=b;k++){ const dx=xs[k]-mx; sxx+=dx*dx; sxy+=dx*(ys[k]-my); } out[i]= sxx>0 ? sxy/sxx : 0; } return out; }
function candRef(sm){ const n=sm.length, out=[]; for (let i=1;i<n-1;i++){ if (!(sm[i]>sm[i-1] && sm[i]>=sm[i+1])) continue;
    let lmin=sm[i], j=i-1; while (j>=0 && sm[j]<=sm[i]){ if(sm[j]<lmin) lmin=sm[j]; j--; }
    let rmin=sm[i]; j=i+1; while (j<n && sm[j]<=sm[i]){ if(sm[j]<rmin) rmin=sm[j]; j++; }
    out.push({i, prom: sm[i]-Math.max(lmin,rmin)}); } return out; }
const rng=seed=>{ let s=seed; return ()=>{ s=(s*16807)%2147483647; return s/2147483647; }; };
const gauss=(x,c,w)=>Math.exp(-0.5*((x-c)/w)**2);

test('peakCandidates lineare: identico bit per bit al calcolo di prima (rumore, valori uguali, NaN, gradini)', ()=>{
  assert.equal(typeof C.DERIV_EXACT_M, 'number', 'serve la derivata veloce (I5)');
  const r=rng(3);
  for (let t=0;t<200;t++){ const n=3+Math.floor(r()*400), a=new Float64Array(n);
    for (let i=0;i<n;i++){ const k=r(); a[i]= t%4===0 ? Math.round(k*5) : t%4===1 ? (k<0.03?NaN:k) : t%4===2 ? 10*gauss(i,n/2,n/8)+0.1*k : (i>n/2?1:0)+0.01*Math.round(k*3); }
    assert.deepStrictEqual(C.peakCandidates(a), candRef(a), 'caso '+t); }
  const n=200000, big=new Float64Array(n); for (let i=0;i<n;i++) big[i]=100*gauss(i,n/2,n/20)+r();
  assert.deepStrictEqual(C.peakCandidates(big), candRef(big));
});

function check(xs, ys, m, label){ const a=C.derivLS(xs, ys, m), b=derivRef(xs, ys, m); let sc=0, d=0;
  for (let i=0;i<b.length;i++){ sc=Math.max(sc, Math.abs(b[i])); d=Math.max(d, Math.abs(a[i]-b[i])); }
  assert.ok(d<=1e-12*sc, `${label}: differenza ${d} su scala ${sc} (${(d/sc).toExponential(2)})`); return d/sc; }
test('derivLS: con m ≤ 64 identico bit per bit, con finestre larghe entro 1e-12 della scala', ()=>{
  const r=rng(7), out=[];
  // piccolo: bit per bit
  { const n=5000, xs=Float64Array.from({length:n},(_,i)=>400+i*0.72), ys=Float64Array.from(xs,x=>gauss(x,1000,4)+0.01*r());
    for (const m of [1,3,20,64]){ const a=C.derivLS(xs,ys,m), b=derivRef(xs,ys,m); for (let i=0;i<n;i++) assert.ok(Object.is(a[i],b[i]), 'm='+m+' i='+i); } }
  const cases=[
    ['FTIR 200k, x crescente', 200000, i=>400+i*0.018, x=>gauss(x,1000,4)+0.6*gauss(x,2500,6)+0.01*(r()-0.5), [65,300,1333]],
    ['X decrescente, Y con fondo alto', 120000, i=>4000-i*0.03, x=>1e4+50*gauss(x,2000,10)+0.1*(r()-0.5), [100,800]],
    ['passo irregolare', 100000, i=>i*0.01+0.004*Math.sin(i), x=>Math.sin(x/30)+0.001*(r()-0.5), [80,666]],
    ['tempo in minuti, cromatogramma', 150000, i=>i*1e-4, x=>200*gauss(x,8,0.05)+0.02*(r()-0.5), [70,1000]],
    ['asse con tratti fermi', 60000, i=>Math.floor(i/3)*0.5, x=>Math.cos(x/200), [90]] ];
  for (const [label,n,fx,fy,ms] of cases){ const xs=Float64Array.from({length:n},(_,i)=>fx(i)), ys=Float64Array.from(xs,fy); for (const m of ms) out.push(label+' m='+m+': '+check(xs,ys,m,label+' m='+m).toExponential(1)); }
  console.log(out.join('\n'));
});
test('derivLS con 1M punti e la finestra di n/150: veloce (prima quadratica)', ()=>{
  const n=1e6, xs=Float64Array.from({length:n},(_,i)=>400+i*0.0036), r=rng(5), ys=Float64Array.from(xs,x=>gauss(x,1000,4)+0.01*(r()-0.5));
  const t=Date.now(); const d=C.derivLS(xs, ys, Math.round(n/150)); const ms=Date.now()-t;
  assert.equal(d.length, n); assert.ok(ms<3000, ms+' ms');
  // controllo a campione contro il calcolo punto per punto
  const b=derivRef(xs.subarray(0,40000), ys.subarray(0,40000), 6667); let sc=0, dd=0; for (let i=0;i<30000;i++){ sc=Math.max(sc,Math.abs(b[i])); dd=Math.max(dd,Math.abs(d[i]-b[i])); }
  assert.ok(dd<=1e-12*sc, dd/sc+'');
});

function sgRef(ys, win){ const n=ys.length; if (!win || win<5 || n<win+2) return ys; const m=(win-1)>>1, den=(2*m+3)*(2*m+1)*(2*m-1), c=[];
  for (let i=-m;i<=m;i++) c.push(3*(3*m*m+3*m-1-5*i*i)/den); const out=Float64Array.from(ys);
  for (let i=m;i<n-m;i++){ let s=0; for (let j=-m;j<=m;j++) s+=c[j+m]*ys[i+j]; out[i]=s; } return out; }
test('sgSmooth: finestre fino a 129 punti identiche bit per bit, più larghe entro 1e-12 della scala dei dati', ()=>{
  const r=rng(11), out=[];
  { const n=20000, ys=Float64Array.from({length:n},(_,i)=>gauss(i,8000,300)+0.01*r()); for (const w of [5,7,31,129]){ const a=C.sgSmooth(ys,w), b=sgRef(ys,w); for (let i=0;i<n;i++) assert.ok(Object.is(a[i],b[i]), 'w='+w+' i='+i); } }
  for (const [label,n,f,ws] of [['picco su fondo alto',200000,i=>1e4+500*gauss(i,1e5,3000)+(r()-0.5),[131,601,2001]],['segno alterno e rumore',150000,i=>Math.sin(i/500)*(r()<0.01?100:1)+0.1*(r()-0.5),[201,1001]],['cromatogramma',300000,i=>200*gauss(i,1.5e5,800)+0.02*r(),[1501]]]){
    const ys=Float64Array.from({length:n},(_,i)=>f(i)); for (const w of ws){ const a=C.sgSmooth(ys,w), b=sgRef(ys,w); let sc=0, d=0; for (let i=0;i<n;i++){ sc=Math.max(sc,Math.abs(ys[i])); d=Math.max(d,Math.abs(a[i]-b[i])); }
      assert.ok(d<=1e-12*sc, label+' w='+w+': '+(d/sc)); out.push(label+' w='+w+': '+(d/sc).toExponential(1)); } }
  console.log(out.join('\n'));
});

test('noiseSigma con la selezione invece dell\'ordinamento: identica bit per bit', ()=>{
  const r=rng(13), ref=ys=>{ const n=ys.length; if (n<4) return 0; const a=new Float64Array(n-2); for (let i=1;i<n-1;i++) a[i-1]=Math.abs(ys[i+1]-2*ys[i]+ys[i-1]); a.sort(); return a[a.length>>1]/0.6745/Math.sqrt(6); };
  for (let t=0;t<60;t++){ const n=2050+Math.floor(r()*60000), ys=Float64Array.from({length:n},(_,i)=> t%3===0 ? Math.round(r()*4) : t%3===1 ? Math.sin(i/50)+0.01*r() : (i%7===0?5:0));
    assert.ok(Object.is(C.noiseSigma(ys), ref(ys)), 'caso '+t); }
  const big=Float64Array.from({length:1e6},()=>r()); assert.ok(Object.is(C.noiseSigma(big), ref(big)));
});

test('tutto il corpus: derivata, lisciatura e candidati identici o entro 1e-12, anche con finestre larghe', ()=>{
  const files=[]; const walk=d=>{ for (const n of fs.readdirSync(d)){ const p=path.join(d,n); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(txt|csv|dat|xy|asc|dpt|prn|jdx|dx|mca|spt|spe|arw)$/i.test(n)) files.push(p); } };
  walk(path.join(__dirname,'..','corpus')); walk(path.join(__dirname,'..','fixtures')); let worst=0, used=0, wide=0;
  for (const f of files){ let P; try{ const b=fs.readFileSync(f); P=C.parseText(C.decodeBuffer(b.buffer.slice(b.byteOffset,b.byteOffset+b.length))); }catch(e){ continue; }
    if (!P || P.reject || !P.xs || P.xs.length<20) continue; used++; const xs=P.xs, ys=P.ys, n=ys.length;
    assert.deepStrictEqual(C.peakCandidates(ys), candRef(ys), f);
    for (const m of [2, 10, 64, 65, 100, Math.max(1,Math.round(n/30)), Math.max(1,Math.round(n/150))]){ if (2*m+1>n) continue; const a=C.derivLS(xs,ys,m), b=derivRef(xs,ys,m); let sc=0,d=0; for (let i=0;i<n;i++){ sc=Math.max(sc,Math.abs(b[i])); d=Math.max(d,Math.abs(a[i]-b[i])); } if (m<=64) assert.equal(d, 0, f+' m='+m); else { wide++; if (sc>0) worst=Math.max(worst,d/sc); assert.ok(d<=1e-12*sc, f+' m='+m+': '+d/sc); } }
    for (const w of [5, 31, 129, 131, 2*Math.round(n/40)+1]){ if (w>n-3) continue; const a=C.sgSmooth(ys,w), b=sgRef(ys,w); let sc=0,d=0; for (let i=0;i<n;i++){ sc=Math.max(sc,Math.abs(ys[i])); d=Math.max(d,Math.abs(a[i]-b[i])); } if (w<=129) assert.equal(d, 0, f+' w='+w); else { wide++; if (sc>0) worst=Math.max(worst,d/sc); assert.ok(d<=1e-12*sc, f+' w='+w+': '+d/sc); } } }
  console.log('corpus: '+used+' spettri, '+wide+' confronti con finestra larga, differenza massima '+worst.toExponential(1)+' della scala');
  assert.ok(used>50);
});
