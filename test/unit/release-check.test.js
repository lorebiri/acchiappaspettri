// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Controllo della firma minisign usato prima di pubblicare (scripts/minisign-verify.js): accetta solo il file firmato con la chiave giusta
const test=require('node:test'), assert=require('node:assert'), crypto=require('crypto'), {verify}=require('../../scripts/minisign-verify');
const b64=s=>Buffer.from(s).toString('base64');
function keyPair(){ const {publicKey, privateKey}=crypto.generateKeyPairSync('ed25519'), id=crypto.randomBytes(8);
  const raw=Buffer.from(publicKey.export({format:'jwk'}).x,'base64url');
  return {id, privateKey, conf:b64('untrusted comment: minisign public key\n'+Buffer.concat([Buffer.from('Ed'),id,raw]).toString('base64')+'\n')}; }
function sign(k, data, prehash=true){ const msg=prehash?crypto.createHash('blake2b512').update(data).digest():data, sig=crypto.sign(null,msg,k.privateKey), tc='timestamp:1\tfile:x';
  const g=crypto.sign(null, Buffer.concat([sig,Buffer.from(tc)]), k.privateKey);
  return b64('untrusted comment: signature\n'+Buffer.concat([Buffer.from(prehash?'ED':'Ed'),k.id,sig]).toString('base64')+'\ntrusted comment: '+tc+'\n'+g.toString('base64')+'\n'); }
test('firma valida accettata (con e senza hash)', ()=>{ const k=keyPair(), d=crypto.randomBytes(5000); assert.equal(verify(k.conf, sign(k,d), d), null); assert.equal(verify(k.conf, sign(k,d,false), d), null); });
test('file alterato, altra chiave, firma vuota o finta: rifiutati', ()=>{ const k=keyPair(), k2=keyPair(), d=crypto.randomBytes(5000), s=sign(k,d), d2=Buffer.from(d); d2[10]^=1;
  assert.match(verify(k.conf, s, d2), /non valida/); assert.match(verify(k2.conf, s, d), /altra chiave/); assert.ok(verify(k.conf, 'x', d)); assert.ok(verify(k.conf, '', d));
  const t=Buffer.from(s,'base64').toString().replace('file:x','file:y'); assert.match(verify(k.conf, b64(t), d), /commento/); });
test('la chiave pubblica dell\'app è leggibile', ()=>{ const conf=require('../../src-tauri/tauri.conf.json'); assert.doesNotThrow(()=>require('../../scripts/minisign-verify').pubKey(conf.plugins.updater.pubkey)); });
