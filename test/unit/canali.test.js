// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I3: lettori multicanale di app/channels-core.js su fixture SINTETICHE (test/fixtures/gen-canali.js). Canali letti = canali dichiarati,
// valori e tempi esatti, forma normalizzata del canale (rivelatore, λ, banda, riferimento) stabile: la usano le librerie (I4) e il lettore Rust (I5).
'use strict';
const test=require('node:test'), assert=require('node:assert'), C=require('../../app/channels-core.js'), G=require('../fixtures/gen-canali.js');
const ab=b=>b.buffer.slice(b.byteOffset, b.byteOffset+b.length);
const close=(a,b,tol,msg)=>{ assert.equal(a.length,b.length,msg+': punti'); for (let i=0;i<a.length;i++) if (Math.abs(a[i]-b[i])>tol) assert.fail(`${msg}: punto ${i}, ${a[i]} invece di ${b[i]}`); };

test('forma del canale: dai testi degli strumenti alla forma normalizzata, e ritorno', ()=>{
  const W={'DAD1 A, Sig=254,4 Ref=360,100':'DAD1A 254/4 nm ref 360/100 nm', 'DAD1 B, Sig=280,4 Ref=off':'DAD1B 280/4 nm ref off', 'DAD1 C, Sig=210.5,8 Ref=360,100':'DAD1C 210.5/8 nm ref 360/100 nm',
    'VWD1 A, Wavelength=220 nm':'VWD1A 220 nm', 'FLD1 A, Ex=230, Em=330':'FLD1A ex 230 nm em 330 nm', 'RID1 A, Refractive Index Signal':'RID1A', 'PDA Ch1 254nm@1.2nm':'PDA Ch1 254/1.2 nm',
    '2489 ChA 254nm':'2489 ChA 254 nm', 'Detector A-Ch1 254':'Det A-Ch1', 'Detector A-Ch1 254 nm':'Det A-Ch1 254 nm', 'Agilent 1260 DAD G4212B':'', 'mAU 254nm':'254 nm'};
  for (const [t,want] of Object.entries(W)){ const f=C.formatChannel(C.parseChannel(t)); assert.equal(f, want, t); assert.equal(C.canon(f), f, 'ritorno: '+f); }
  assert.deepEqual(C.parseChannel('DAD1A 254/4 nm ref 360/100 nm'), {det:'DAD1A', wl:254, bw:4, ref:{wl:360, bw:100}, ex:null, em:null, extracted:false});
  assert.equal(C.shortLabel(C.parseChannel('DAD1 A, Sig=254,4 Ref=360,100')), 'DAD1A 254 nm');
  assert.equal(C.memKey('a.csv',null,null), 'a.csv'); assert.equal(C.memKey('a.ch',null,'DAD1A 254 nm'), 'a.ch\u0000\u0000DAD1A 254 nm');
});

test('Agilent .ch (179 a delta e a double, 130): segnale, campione, tempi e valori', ()=>{
  const A=G.chrom(3001,0.004,[[5,40,0.05]],0.5,3);
  for (const o of [{version:'179'},{version:'179',encoding:'double'},{version:'130'}]){
    const b=G.writeCh(Object.assign({sample:'STD1', signal:'DAD1 A, Sig=254,4 Ref=360,100', units:'mAU', method:'M.M', t0:0, t1:12, ys:A.ys},o)), r=C.readBinary(ab(b),'DAD1A.ch');
    assert.equal(r.format,'agilent-ch'); assert.equal(r.declared,1); assert.equal(r.read,1);
    const c=r.samples[0].channels[0]; assert.equal(r.samples[0].name,'STD1'); assert.equal(c.channel,'DAD1A 254/4 nm ref 360/100 nm'); assert.equal(c.units,'mAU');
    close(c.xs, A.xs, 1e-9, o.version+' tempi'); close(c.ys, A.ys, o.encoding==='double'?0:5e-4, o.version+' valori'); }
  // senza testo del segnale il canale viene dal nome; un file troncato o di un altro tipo non si legge
  const b=G.writeCh({signal:'', t0:0, t1:1, ys:A.ys.slice(0,100)}); assert.equal(C.readBinary(ab(b),'DAD1B.ch').samples[0].channels[0].channel,'DAD1B');
  assert.equal(C.readBinary(ab(b.subarray(0,0x1800)),'x.ch'), null); assert.equal(C.readBinary(new ArrayBuffer(10),'x.ch'), null);
});

test('Agilent .uv: spettri nel tempo, cromatogramma alla λ con la banda', ()=>{
  const T=[0,0.5,1,1.5,2,2.5], sp=T.map((t,i)=>Array.from({length:106},(_,j)=>i+0.01*j+(j===40?70000/2000:0)));
  const u=C.readUv(ab(G.writeUv({times:T, a:190, b:400, s:2, spectra:sp, sample:'S1'})));
  assert.equal(u.head.sample,'S1'); assert.deepEqual(Array.from(u.times),T); assert.deepEqual(u.wl,{lo:190, hi:400, step:2});
  close(C.uvExtract(u,252,0), T.map((t,i)=>i+0.31), 1e-9, 'λ 252, banda 0'); close(C.uvExtract(u,270,4), T.map((t,i)=>i+0.40+35/3), 1e-9, 'λ 270 ± 2 (il valore grande entra nella media)');
  const r=C.readUvChannels(u,[254,280],4); assert.deepEqual(r.samples[0].channels.map(c=>c.channel), ['UV 254/4 nm extracted','UV 280/4 nm extracted']); assert.deepEqual(C.uvSuggest(u),[270]);
});

test('Waters .arw e Shimadzu ASCII: canali letti = dichiarati, campioni, moltiplicatore, tracce di stato e punti', ()=>{
  const c=G.corpus(), w=C.readText(c['waters-2canali.arw'],'x.arw'); assert.equal(w.format,'waters-arw'); assert.equal(w.declared,2); assert.equal(w.read,2); assert.equal(w.samples[0].sampleKey,null);
  const s=C.readText(c['shimadzu-2canali.txt'],'x.txt'); assert.equal(s.declared,2); assert.equal(s.read,2); assert.deepEqual(s.notes,[{code:'status', list:['Pump A Pressure']}]);
  const A=G.chrom(101,0.01,[[0.5,1000,0.05]],10,1), two=G.writeShimadzu([{sample:'S1', channels:[Object.assign({name:'Detector A-Ch1', wl:254, mult:0.01},A), Object.assign({name:'Detector A-Ch2', wl:280, declare:200},A)]},{sample:'S2', channels:[Object.assign({name:'Detector A-Ch1', wl:254},A)]}]);
  const r=C.readText(two,'lotto.txt'); assert.equal(r.declared,3); assert.equal(r.read,3); assert.deepEqual(r.samples.map(x=>x.sampleKey),['S1','S2']);
  close(r.samples[0].channels[0].ys, A.ys, 0.006, 'moltiplicatore 0,01'); assert.deepEqual(r.notes.filter(n=>n.code==='points').map(n=>[n.declared,n.read]),[[200,101]]);
  // esportazione CSV di LabSolutions: virgola come separatore
  const csv=two.replace(/\t/g,','), q=C.readText(csv,'lotto.csv'); assert.equal(q.read,3); close(q.samples[1].channels[0].xs, A.xs, 1e-5, 'CSV, tempi');
  // un file di testo normale non è multicanale per questi lettori
  assert.equal(C.readText('Time,Value\n0,1\n1,2\n2,3\n3,4\n4,5\n5,6','a.csv'), null);
});
