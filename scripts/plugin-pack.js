// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Pacchetto .acchplugin da una cartella (docs/ESTENSIONI.md). Stessi sorgenti → stessi byte e stessa impronta. La cartella contiene:
//   manifest.json e UNO tra reader.json (lettore dichiarativo, consigliato), reader.wasm (WebAssembly) e reader.js (JavaScript);
//   facoltativi i file d'esempio «esempio-*» con accanto «<nome>.atteso.json»: l'app li verifica all'installazione.
// Uso: node scripts/plugin-pack.js <cartella> [--check]   (--check: il pacchetto già presente deve coincidere con i sorgenti)
'use strict';
const fs=require('fs'), path=require('path'), C=require('../app/plugins-base.js');
function pack(dir){
  const has=f=>fs.existsSync(path.join(dir,f)), manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
  const found=['reader.json','reader.wasm','reader.js'].filter(has);
  if (found.length!==1) throw new Error(dir+': serve uno solo tra reader.json, reader.wasm e reader.js (trovati: '+(found.join(', ')||'nessuno')+')');
  const f=found[0], body=f==='reader.json' ? {reader:JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'))} : f==='reader.wasm' ? {wasm:new Uint8Array(fs.readFileSync(path.join(dir,f)))} : {code:fs.readFileSync(path.join(dir,f),'utf8')};
  const examples=fs.readdirSync(dir).filter(n=>/^esempio-/.test(n) && !/\.atteso\.json$/.test(n) && has(n+'.atteso.json')).sort()
    .map(n=>({name:n, bytes:new Uint8Array(fs.readFileSync(path.join(dir,n))), expected:JSON.parse(fs.readFileSync(path.join(dir,n+'.atteso.json'),'utf8'))}));
  const text=C.buildPackage(manifest, body, examples), p=C.parsePackage(text);   // stessi controlli dell'installazione
  return {text, out:path.join(dir, path.basename(path.resolve(dir))+'.acchplugin'), sha256:p.sha256, manifest:p.manifest, kind:p.kind, examples:p.examples.length};
}
if (require.main===module){
  const dir=process.argv[2], check=process.argv.includes('--check');
  if (!dir){ console.error('uso: node scripts/plugin-pack.js <cartella> [--check]'); process.exit(2); }
  const r=pack(dir);
  if (check){ const old=fs.existsSync(r.out) ? fs.readFileSync(r.out,'utf8') : null; if (old!==r.text){ console.error('pacchetto diverso dai sorgenti: '+r.out); process.exit(1); } }
  else fs.writeFileSync(r.out, r.text);
  console.log(path.relative(process.cwd(), r.out)+'  '+r.kind+', '+r.examples+' esempi  SHA-256 '+r.sha256);
}
module.exports={pack};
