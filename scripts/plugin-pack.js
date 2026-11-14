// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Pacchetto .acchplugin da una cartella con manifest.json e reader.js (docs/ESTENSIONI.md). Stessi sorgenti → stessi byte e stessa impronta.
// Uso: node scripts/plugin-pack.js <cartella> [--check]   (--check: il pacchetto già presente deve coincidere con i sorgenti)
'use strict';
const fs=require('fs'), path=require('path'), C=require('../app/plugins-base.js');
function pack(dir){
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8')), code=fs.readFileSync(path.join(dir,'reader.js'),'utf8');
  const text=C.buildPackage(manifest, code), p=C.parsePackage(text);   // stessi controlli dell'installazione
  return {text, out:path.join(dir, path.basename(path.resolve(dir))+'.acchplugin'), sha256:p.sha256, manifest:p.manifest};
}
if (require.main===module){
  const dir=process.argv[2], check=process.argv.includes('--check');
  if (!dir){ console.error('uso: node scripts/plugin-pack.js <cartella> [--check]'); process.exit(2); }
  const r=pack(dir);
  if (check){ const old=fs.existsSync(r.out) ? fs.readFileSync(r.out,'utf8') : null; if (old!==r.text){ console.error('pacchetto diverso dai sorgenti: '+r.out); process.exit(1); } }
  else fs.writeFileSync(r.out, r.text);
  console.log(path.relative(process.cwd(), r.out)+'  SHA-256 '+r.sha256);
}
module.exports={pack};
