// Regressioni trovate provando il programma: bande strette e raggi cosmici
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), vm=require('vm');
const html=fs.readFileSync(path.join(__dirname,'..','..','index.html'),'utf8');
const src=html.slice(html.indexOf('/*CORE-START*/'), html.indexOf('/*CORE-END*/'));
const ctx={console}; vm.createContext(ctx); vm.runInContext(src+';globalThis.D=despike;globalThis.PT=parseText;globalThis.J=parseJcamp;',ctx); const despike=ctx.D;
function spectrum(fwhmPts, n=1200){ const y=new Float64Array(n); let s=11; const rnd=()=>{ s=(s*16807)%2147483647; return s/2147483647; }; const sg=fwhmPts/2.355; for (let i=0;i<n;i++) y[i]=100+1500*Math.exp(-0.5*((i-600)/sg)**2)+3*Math.sqrt(-2*Math.log(rnd()))*Math.cos(6.2832*rnd()); return y; }
test('una banda vera stretta (FWHM 4,7 punti) non viene appiattita', ()=>{ const y=spectrum(4.7), r=despike(y); assert.ok(Math.abs(r.ys[600]-y[600])<1e-9 && Math.max(...r.ys)>1400, 'massimo '+Math.max(...r.ys)); });
test('una banda di 6 e 10 punti resta intatta', ()=>{ for (const w of [6,10]){ const y=spectrum(w), r=despike(y); assert.ok(Math.max(...r.ys)>0.95*Math.max(...y), 'w='+w); } });
test('i raggi cosmici di 1 e 2 punti vengono tolti', ()=>{ const y=spectrum(20); y[200]+=5000; y[300]+=4000; y[301]+=3800; y[900]+=2500; const r=despike(y); for (const i of [200,300,301,900]) assert.ok(r.ys[i]<200,'punto '+i+': '+r.ys[i]); });
test('separatori delle migliaia e righe scartate vengono segnalati', ()=>{ let txt=''; for (let i=0;i<300;i++) txt+=`${(i/10).toFixed(2).replace('.',',')};${i===150?'12.355,50':(100+i)}\n`; const P=ctx.PT(txt); assert.ok(P.importIssue, 'segnalato'); assert.ok(P.importIssue.thou>=1); });
test('un file pulito non genera avvisi', ()=>{ let txt=''; for (let i=0;i<300;i++) txt+=`${(i/10).toFixed(2)}\t${(Math.sin(i/9)+2).toFixed(4)}\n`; assert.equal(ctx.PT(txt).importIssue,null); });
test('colonne in più: segnalate', ()=>{ let txt=''; for (let i=0;i<300;i++) txt+=`${i}\t${i*2}\t${i*3}\n`; assert.equal(ctx.PT(txt).extraCols,1); });
test('JCAMP in Hz: in ppm con la frequenza di osservazione', ()=>{ const txt='##TITLE=x\n##JCAMP-DX=4.24\n##DATA TYPE=NMR SPECTRUM\n##XUNITS=HZ\n##YUNITS=ARBITRARY\n##.OBSERVE FREQUENCY=400\n##FIRSTX=0\n##LASTX=4000\n##NPOINTS=5\n##XYDATA=(X++(Y..Y))\n0 1 2 3 4 5\n##END=\n'; const P=ctx.J(txt); assert.ok(P); assert.equal(P.xs[P.xs.length-1],10); });
