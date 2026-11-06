// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// i18n/en.json + coppie già nel codice → i18n/en.js (caricato dalla pagina)
const fs=require('fs'), path=require('path'), d=path.join(__dirname,'..','i18n');
const dict=JSON.parse(fs.readFileSync(path.join(d,'en.json'),'utf8')); let pairs={}; try{ pairs=JSON.parse(fs.readFileSync(path.join(d,'_pairs.json'),'utf8')); }catch(e){}
const extra=fs.existsSync(path.join(d,'en-app.json')) ? JSON.parse(fs.readFileSync(path.join(d,'en-app.json'),'utf8')) : {};
const all=Object.assign({}, pairs, dict, extra); for (const k of Object.keys(all)) if (all[k]===k) delete all[k];
fs.writeFileSync(path.join(d,'en.js'), '/* generato da scripts/i18n-build.js: non modificare a mano */\nwindow.ACCH_EN='+JSON.stringify(all)+';\n');
console.log('voci',Object.keys(all).length);
