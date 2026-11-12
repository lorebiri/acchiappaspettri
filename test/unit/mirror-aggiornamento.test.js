// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Mirror locale per provare l'aggiornamento firmato (scripts/mirror-aggiornamento.js): serve latest.json con gli indirizzi
// del mirror e le firme originali, e non parte se un pacchetto non è verificabile. Chiave di firma di PROVA, pacchetti finti.
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), os=require('os'), crypto=require('crypto'), http=require('http');
const M=require('../../scripts/mirror-aggiornamento.js'), {verify}=require('../../scripts/minisign-verify.js');
const b64=s=>Buffer.from(s).toString('base64');
function keyPair(){ const {publicKey, privateKey}=crypto.generateKeyPairSync('ed25519'), id=crypto.randomBytes(8), raw=Buffer.from(publicKey.export({format:'jwk'}).x,'base64url');
  return {id, privateKey, pub:b64('untrusted comment: minisign public key\n'+Buffer.concat([Buffer.from('Ed'),id,raw]).toString('base64')+'\n')}; }
function sign(k, data, file, ver){ const sig=crypto.sign(null, crypto.createHash('blake2b512').update(data).digest(), k.privateKey), tc=`timestamp:1\tfile:${file}\tversion:${ver}`;
  const g=crypto.sign(null, Buffer.concat([sig,Buffer.from(tc)]), k.privateKey);
  return b64('untrusted comment: signature from tauri secret key\n'+Buffer.concat([Buffer.from('ED'),k.id,sig]).toString('base64')+'\ntrusted comment: '+tc+'\n'+g.toString('base64')+'\n'); }
function release(k, ver, opt={}){ const d=fs.mkdtempSync(path.join(os.tmpdir(),'mir-')), P={}, pre=`https://github.com/lorebiri/acchiappaspettri/releases/download/v${ver}/`;
  for (const [key,n] of [['windows-x86_64',`Acchiappaspettri_${ver}_x64-setup.exe`],['darwin-aarch64','Acchiappaspettri_aarch64.app.tar.gz'],['linux-x86_64',`Acchiappaspettri_${ver}_amd64.AppImage`]]){
    const body=crypto.randomBytes(4096); fs.writeFileSync(path.join(d,n), body); P[key]={url:pre+n, signature:sign(k, body, n, opt.sigVer||ver)}; }
  fs.writeFileSync(path.join(d,'latest.json'), JSON.stringify({version:ver, notes:'prova', platforms:P})); return d; }
const get=(port,p)=>new Promise((res,rej)=>http.get({host:'127.0.0.1',port,path:p},r=>{ const c=[]; r.on('data',x=>c.push(x)); r.on('end',()=>res({status:r.statusCode, body:Buffer.concat(c)})); }).on('error',rej));

test('mirror: latest.json con gli indirizzi del mirror, firme originali, pacchetti identici e verificabili', async ()=>{
  const k=keyPair(), d=release(k,'3.0.0-rc.1'), m=await M.serve(d,{pubkey:k.pub, log:()=>{}});
  try{ const j=JSON.parse((await get(m.port,'/latest.json')).body); assert.strictEqual(j.version,'3.0.0-rc.1');
    const orig=JSON.parse(fs.readFileSync(path.join(d,'latest.json'),'utf8'));
    for (const [key,e] of Object.entries(j.platforms)){ assert.ok(e.url.startsWith(`http://127.0.0.1:${m.port}/`), e.url); assert.strictEqual(e.signature, orig.platforms[key].signature);
      const r=await get(m.port, new URL(e.url).pathname); assert.strictEqual(r.status,200); assert.strictEqual(verify(k.pub, e.signature, r.body), null, key+': firma non valida sul file servito'); }
    assert.strictEqual((await get(m.port,'/../../etc/passwd')).status, 404); }
  finally{ m.srv.close(); }
});
test('mirror: non parte con un pacchetto alterato, una firma di un\'altra versione o un file mancante', async ()=>{
  const k=keyPair();
  const a=release(k,'3.0.0-rc.1'); const f=fs.readdirSync(a).find(n=>n.endsWith('.exe')); const b=fs.readFileSync(path.join(a,f)); b[10]^=255; fs.writeFileSync(path.join(a,f),b);
  await assert.rejects(M.serve(a,{pubkey:k.pub}), /mirror non avviato[\s\S]*windows-x86_64/);
  await assert.rejects(M.serve(release(k,'3.0.0-rc.1',{sigVer:'3.0.0-rc.0'}),{pubkey:k.pub}), /firma della versione 3\.0\.0-rc\.0, non 3\.0\.0-rc\.1/);
  const c=release(k,'3.0.0-rc.1'); fs.unlinkSync(path.join(c,fs.readdirSync(c).find(n=>n.endsWith('.AppImage')))); await assert.rejects(M.serve(c,{pubkey:k.pub}), /manca il file/);
  await assert.rejects(M.serve(release(keyPair(),'3.0.0-rc.1'),{pubkey:k.pub}), /mirror non avviato/, 'firmato con un\'altra chiave');
});
