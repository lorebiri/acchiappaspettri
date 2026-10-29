// Prova dei lettori di formato: JCAMP-DX (AFFN, SQZ, DIF/DUP con controllo Y, XY..XY), Thermo .spa e Bruker OPUS
// costruiti secondo le specifiche pubblicate. Uso: node test/format-test.js
const fs=require('fs'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
eval(html.slice(html.indexOf('/*CORE-START*/'), html.indexOf('/*CORE-END*/'))+';global.C={parseText,parseBinary,detectInstrument}');
let ok=0, ko=0; const check=(name, cond, info)=>{ if (cond){ ok++; console.log('✓ '+name); } else { ko++; console.log('✗ '+name+'  '+(info||'')); } };
const head=['##TITLE=prova','##JCAMP-DX=4.24','##DATA TYPE=INFRARED SPECTRUM','##XUNITS=1/CM','##YUNITS=ABSORBANCE','##XFACTOR=1','##YFACTOR=0.001','##FIRSTX=4000','##LASTX=3990','##NPOINTS=11','##DELTAX=-1'];
const want=[100,110,120,130,140,150,160,170,180,190,200].map(v=>v/1000);
const same=(p)=>p && p.xs.length===11 && p.xs[0]===3990 && p.xs[10]===4000 && want.slice().reverse().every((v,i)=>Math.abs(p.ys[i]-v)<1e-9);
check('JCAMP AFFN (X++(Y..Y))', same(C.parseText(head.concat(['##XYDATA=(X++(Y..Y))','4000 100 110 120 130 140 150','3994 160 170 180 190 200','##END=']).join('\n'))));
check('JCAMP SQZ', same(C.parseText(head.concat(['##XYDATA=(X++(Y..Y))','4000A00A10A20A30A40A50','3994A60A70A80A90B00','##END=']).join('\n'))));
// DIF + DUP: 100, poi +10 in tutto 4 volte (V) → 110..140; ogni riga ricomincia dal valore di controllo (l'ultimo della riga prima)
check('JCAMP DIF/DUP con controllo Y', same(C.parseText(head.concat(['##XYDATA=(X++(Y..Y))','4000A00J0V','3996A40J0W','3991A90J0','##END=']).join('\n'))));
const xy=C.parseText(['##TITLE=x','##JCAMP-DX=5.01','##XUNITS=NANOMETERS','##YUNITS=ABSORBANCE','##XFACTOR=1','##YFACTOR=1','##XYPOINTS=(XY..XY)','200, 0.1; 201, 0.2; 202, 0.3','203, 0.4 204, 0.5 205, 0.6','##END='].join('\n'));
check('JCAMP (XY..XY)', xy && xy.xs.length===6 && xy.ys[5]===0.6, JSON.stringify(xy && Array.from(xy.ys)));
// Thermo .spa
{ const n=50, buf=new ArrayBuffer(2000), dv=new DataView(buf); 'campione'.split('').forEach((c,i)=>dv.setUint8(30+i,c.charCodeAt(0)));
  dv.setUint8(304,2); dv.setUint32(306,600,true); dv.setUint8(320,3); dv.setUint32(322,800,true); dv.setUint32(326,4*n,true); dv.setUint8(336,0);
  dv.setUint32(604,n,true); dv.setUint32(608,1,true); dv.setUint32(612,17,true); dv.setFloat32(616,4000,true); dv.setFloat32(620,400,true);
  for (let i=0;i<n;i++) dv.setFloat32(800+4*i, i/100, true);
  const p=C.parseBinary(buf,'x.spa'); check('Thermo .spa', p && p.xs.length===n && p.xs[0]===400 && Math.abs(p.ys[0]-0.49)<1e-6 && p.peY==='A', JSON.stringify(p && {n:p.xs.length, x0:p.xs[0], y0:p.ys[0], peY:p.peY})); }
// Bruker OPUS: blocco 15 (AB) e blocco parametri 31
{ const n=40, buf=new ArrayBuffer(4000), dv=new DataView(buf); dv.setUint32(0,0xFEFE0A0A,true);
  const blk=(c,type,chan,len,off)=>{ dv.setUint8(c,type); dv.setUint8(c+1,chan); dv.setInt32(c+4,len/4,true); dv.setInt32(c+8,off,true); };
  blk(24,15,0,4*n,1000); blk(36,31,0,200,2000);
  let p=2000; const par=(nm,t,val)=>{ for (let k=0;k<3;k++) dv.setUint8(p+k,nm.charCodeAt(k)); dv.setUint16(p+4,t,true);
    if (t===0){ dv.setUint16(p+6,2,true); dv.setInt32(p+8,val,true); p+=12; } else { dv.setUint16(p+6,4,true); dv.setFloat64(p+8,val,true); p+=16; } };
  par('NPT',0,n); par('FXV',1,3999.5); par('LXV',1,600.25); par('CSF',1,1); 'END'.split('').forEach((c,k)=>dv.setUint8(p+k,c.charCodeAt(0)));
  for (let i=0;i<n;i++) dv.setFloat32(1000+4*i, 0.5+i/1000, true);
  const q=C.parseBinary(buf,'campione.0'); check('Bruker OPUS', q && q.xs.length===n && Math.abs(q.xs[0]-600.25)<1e-9 && Math.abs(q.ys[n-1]-0.5)<1e-6 && C.detectInstrument(q,'campione.0').instr==='ftir', JSON.stringify(q && {n:q.xs.length, x0:q.xs[0], y:q.ys[n-1]})); }
console.log(`\n${ok} riuscite, ${ko} fallite. Nota: .spa e OPUS sono provati su file costruiti secondo le specifiche pubbliche, non ancora su file veri.`);
