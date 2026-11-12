// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Tappa I1, pacchetto ui-rilascio: licenze leggibili su Windows (.txt nei pacchetti), guida di installazione IT/EN con
// l'ordine degli avvisi, Smart App Control e Avast/AVG, e guida del mirror locale per l'aggiornamento firmato.
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), {execFileSync}=require('child_process');
const root=path.join(__dirname,'..','..'), rd=f=>fs.readFileSync(path.join(root,f),'utf8');

test('licenze anche in .txt nei pacchetti: risorse di Tauri e file preparati da prepare-desktop', ()=>{
  const r=JSON.parse(rd('src-tauri/tauri.conf.json')).bundle.resources, t=Object.values(r);
  for (const f of ['LICENSE','THIRD-PARTY-NOTICES.md','LICENSE.txt','THIRD-PARTY-NOTICES.txt']) assert.ok(t.includes(f), 'manca la risorsa '+f);
  execFileSync(process.execPath,[path.join(root,'scripts/prepare-desktop.js')],{stdio:'ignore'});
  for (const [src,txt] of [['LICENSE','LICENSE.txt'],['THIRD-PARTY-NOTICES.md','THIRD-PARTY-NOTICES.txt']]){ const k=Object.keys(r).find(x=>r[x]===txt), p=path.join(root,'src-tauri',k);
    assert.ok(fs.existsSync(p), 'non preparato: '+k); const a=fs.readFileSync(p,'utf8'); assert.strictEqual(a.replace(/\r\n/g,'\n'), rd(src).replace(/\r\n/g,'\n')); assert.ok(/\r\n/.test(a) && !/[^\r]\n/.test(a), txt+': a capo di Windows'); }
  const c=rd('scripts/check-packages.js'); assert.ok((c.match(/LICENSE\\?\.txt/g)||[]).length>=4, 'check-packages controlla i .txt su Windows, macOS, .deb e AppImage');
});
test('INSTALLAZIONE.md: ordine Edge → SmartScreen → Avviso di sicurezza, Smart App Control e Avast/AVG, in italiano e in inglese', ()=>{
  const s=rd('docs/INSTALLAZIONE.md'), en=s.indexOf('# Installation (English)'); assert.ok(en>0, 'manca la parte inglese');
  for (const [part, words] of [[s.slice(0,en), ['**Edge','**SmartScreen**','**Avviso di sicurezza**','Smart App Control','Avast e AVG']], [s.slice(en), ['**Edge','**SmartScreen**','**Security Warning**','Smart App Control','Avast and AVG']]]){
    let last=-1; for (const w of words){ const i=part.indexOf(w); assert.ok(i>last, `«${w}» manca o è fuori ordine`); last=i; }
    assert.ok(part.includes('%LOCALAPPDATA%\\Acchiappaspettri') && part.includes('acchiappaspettri.exe'), 'percorso dell\'eccezione'); }
});
test('AGGIORNAMENTI.md: guida del mirror locale con lo script e il comando di collaudo', ()=>{
  const s=rd('docs/AGGIORNAMENTI.md'); assert.match(s, /node scripts\/mirror-aggiornamento\.js <cartella>/); assert.match(s, /e2e_check_update/); assert.match(s, /ACCH_E2E_UPDATE_URL=http:\/\/127\.0\.0\.1:8790\/latest\.json/);
  assert.ok(fs.existsSync(path.join(root,'scripts/mirror-aggiornamento.js'))); assert.match(rd('src-tauri/src/lib.rs'), /pub async fn e2e_check_update\(app: tauri::AppHandle, url: String, install: bool\)/);
});
