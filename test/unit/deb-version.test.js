// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// .deb delle prove con la versione «X~rc.N» (scripts/deb-version.js): dpkg le ordina prima della stabile.
// Il pacchetto di prova è costruito con il tar del sistema (formato vero, controllato poi di nuovo da tar) e,
// dove c'è dpkg-deb (Linux, pipeline), anche con dpkg-deb. Pacchetti SINTETICI, senza programma dentro.
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), os=require('os'), {execFileSync}=require('child_process');
const D=require('../../scripts/deb-version.js'), SCRIPT=path.join(__dirname,'..','..','scripts','deb-version.js');
const has=c=>{ try{ execFileSync(c,['--version'],{stdio:'ignore'}); return true; }catch(e){ return false; } };
const CONTROL=v=>`Package: acchiappaspettri\nVersion: ${v}\nArchitecture: amd64\nMaintainer: Lorenzo Birindelli\nDescription: prova\n`;

// pacchetto con il tar del sistema: debian-binary, control.tar.gz (control e md5sums), data.tar.gz
function makeDeb(ver, fmt){ const d=fs.mkdtempSync(path.join(os.tmpdir(),'deb-')), c=path.join(d,'c'), x=path.join(d,'x'); fs.mkdirSync(c); fs.mkdirSync(path.join(x,'usr/bin'),{recursive:true});
  fs.writeFileSync(path.join(c,'control'), CONTROL(ver)); fs.writeFileSync(path.join(c,'md5sums'), 'd41d8cd98f00b204e9800998ecf8427e  usr/bin/acchiappaspettri\n'); fs.writeFileSync(path.join(x,'usr/bin/acchiappaspettri'),'');
  const t=(dir,out)=>execFileSync('tar',['-czf',out,...(fmt?['--format',fmt]:[]),'-C',dir,'.']); t(c,path.join(d,'control.tar.gz')); t(x,path.join(d,'data.tar.gz'));
  const h=n=>{ const b=Buffer.alloc(60,0x20); b.write(n,0,'latin1'); b.write('0',16,'latin1'); b.write('0',28,'latin1'); b.write('0',34,'latin1'); b.write('100644',40,'latin1'); b.write('`\n',58,'latin1'); return b; };
  const deb=D.writeAr([['debian-binary',Buffer.from('2.0\n')],['control.tar.gz',fs.readFileSync(path.join(d,'control.tar.gz'))],['data.tar.gz',fs.readFileSync(path.join(d,'data.tar.gz'))]].map(([n,data])=>({h:h(n),data})));
  const f=path.join(d,`Acchiappaspettri_${ver}_amd64.deb`); fs.writeFileSync(f,deb); return f; }
function dpkgDeb(ver){ const d=fs.mkdtempSync(path.join(os.tmpdir(),'debr-')), r=path.join(d,'r'); fs.mkdirSync(path.join(r,'DEBIAN'),{recursive:true}); fs.mkdirSync(path.join(r,'usr/bin'),{recursive:true});
  fs.writeFileSync(path.join(r,'DEBIAN/control'), CONTROL(ver)); fs.writeFileSync(path.join(r,'usr/bin/acchiappaspettri'),''); const f=path.join(d,`Acchiappaspettri_${ver}_amd64.deb`);
  execFileSync('dpkg-deb',['-Zgzip','--root-owner-group','-b',r,f],{stdio:'ignore'}); return f; }

test('ordine di dpkg: «3.0.0-rc.1» viene dopo la 3.0.0 (il problema), «3.0.0~rc.1» prima', ()=>{
  assert.ok(D.dpkgCompare('3.0.0-rc.1','3.0.0')>0); assert.ok(D.dpkgCompare(D.debVersion('3.0.0-rc.1'),'3.0.0')<0);
  assert.ok(D.dpkgCompare('3.0.0~rc.2','3.0.0~rc.10')<0, 'rc.2 prima di rc.10'); assert.ok(D.dpkgCompare('2.2.0','3.0.0~rc.1')<0, 'dalla 2.2.0 alla prova è un aggiornamento');
  assert.strictEqual(D.debVersion('v3.0.0-rc.1'),'3.0.0~rc.1'); assert.strictEqual(D.debVersion('3.0.0'),'3.0.0');
  if (has('dpkg')) for (const [a,op,b] of [['3.0.0~rc.1','lt','3.0.0'],['3.0.0-rc.1','gt','3.0.0'],['3.0.0~rc.2','lt','3.0.0~rc.10']]) execFileSync('dpkg',['--compare-versions',a,op,b]);
});

for (const fmt of [null,'ustar']) test(`riscrive Version nel .deb e il tar resta valido (tar del sistema${fmt?', '+fmt:''})`, ()=>{
  const f=makeDeb('3.0.0-rc.1', fmt); assert.strictEqual(D.field(fs.readFileSync(f),'Version'), '3.0.0-rc.1');
  execFileSync(process.execPath,[SCRIPT,f,'3.0.0-rc.1']); const out=fs.readFileSync(f);
  assert.strictEqual(D.field(out,'Version'), '3.0.0~rc.1');
  // il control.tar.gz riscritto si legge con tar (somma di controllo giusta) e il resto del pacchetto non cambia
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'debx-')), ar=D.readAr(out); fs.writeFileSync(path.join(d,'c.tgz'), ar.find(m=>m.name==='control.tar.gz').data);
  assert.match(execFileSync('tar',['-xzOf',path.join(d,'c.tgz'),'./control'],{encoding:'utf8'}), /^Version: 3\.0\.0~rc\.1$/m);
  assert.match(execFileSync('tar',['-xzOf',path.join(d,'c.tgz'),'./md5sums'],{encoding:'utf8'}), /usr\/bin\/acchiappaspettri/);
  assert.deepStrictEqual(ar.map(m=>m.name), ['debian-binary','control.tar.gz','data.tar.gz']);
  const r=execFileSync(process.execPath,[SCRIPT,'--check',f,'3.0.0-rc.1'],{encoding:'utf8'}); assert.match(r, /Version 3\.0\.0~rc\.1/);
});

test('--check: un .deb di prova con «3.0.0-rc.1» dentro viene fermato; la stabile resta «3.0.0»', ()=>{
  const f=makeDeb('3.0.0-rc.1'); assert.throws(()=>execFileSync(process.execPath,[SCRIPT,'--check',f,'3.0.0-rc.1'],{stdio:'pipe'}), e=>/attesa «3\.0\.0~rc\.1»/.test(String(e.stderr)));
  const g=makeDeb('3.0.0'); execFileSync(process.execPath,[SCRIPT,g,'3.0.0']); assert.strictEqual(D.field(fs.readFileSync(g),'Version'),'3.0.0');
});

test('con dpkg-deb (Linux): il pacchetto riscritto è valido e dichiara 3.0.0~rc.1', {skip:!has('dpkg-deb') && 'dpkg-deb assente (si prova nella pipeline Linux)'}, ()=>{
  const f=dpkgDeb('3.0.0-rc.1'); execFileSync(process.execPath,[SCRIPT,f,'3.0.0-rc.1']);
  assert.strictEqual(execFileSync('dpkg-deb',['-f',f,'Version'],{encoding:'utf8'}).trim(), '3.0.0~rc.1'); execFileSync('dpkg-deb',['-I',f],{stdio:'ignore'}); execFileSync('dpkg-deb',['-c',f],{stdio:'ignore'});
});
