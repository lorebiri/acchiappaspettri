// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Verifica una firma minisign (quella dell'updater di Tauri) con la chiave pubblica di tauri.conf.json.
// Formato: https://jedisct1.github.io/minisign/ — firma «Ed» sul file, «ED» sull'hash BLAKE2b-512 del file.
const crypto=require('crypto');
const b64lines=s=>Buffer.from(String(s).trim(),'base64').toString('utf8').split(/\r?\n/);
function pubKey(confPubkey){
  const line=b64lines(confPubkey).find(l=>l && !/^untrusted comment:/i.test(l)), raw=Buffer.from(line,'base64');
  if (raw.length!==42 || raw.slice(0,2).toString()!=='Ed') throw new Error('chiave pubblica minisign non valida');
  return {id:raw.slice(2,10), key:crypto.createPublicKey({key:{kty:'OKP', crv:'Ed25519', x:raw.slice(10).toString('base64url')}, format:'jwk'})};
}
// Restituisce null se la firma è valida, altrimenti il motivo.
function verify(confPubkey, signature, data){
  let pk, lines; try{ pk=pubKey(confPubkey); lines=b64lines(signature); }catch(e){ return 'firma o chiave illeggibile: '+e.message; }
  const sigLine=lines.find((l,i)=>i>0 && l && !/^(untrusted|trusted) comment:/i.test(l)); if (!sigLine) return 'firma senza dati';
  const s=Buffer.from(sigLine,'base64'); if (s.length!==74) return 'firma di lunghezza sbagliata';
  const alg=s.slice(0,2).toString(), id=s.slice(2,10), sig=s.slice(10);
  if (!id.equals(pk.id)) return 'firmata con un\'altra chiave';
  const msg = alg==='ED' ? crypto.createHash('blake2b512').update(data).digest() : alg==='Ed' ? data : null; if (!msg) return 'algoritmo sconosciuto '+alg;
  if (!crypto.verify(null, msg, pk.key, sig)) return 'firma non valida per questo file';
  const k=lines.findIndex(l=>/^trusted comment:/i.test(l)); if (k<0 || !lines[k+1]) return 'manca il commento firmato';
  const tc=lines[k].replace(/^trusted comment:\s?/i,''), g=Buffer.from(lines[k+1],'base64');
  if (!crypto.verify(null, Buffer.concat([sig, Buffer.from(tc,'utf8')]), pk.key, g)) return 'commento firmato non valido';
  return null;
}
module.exports={verify, pubKey};
