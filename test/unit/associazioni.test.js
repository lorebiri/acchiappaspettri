// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// I3: apertura dei file grezzi dal sistema. Stesso elenco di formati nella pagina (ACCEPT), nel lato nativo (RAW_EXT), nelle associazioni
// di macOS, nell'installer di Windows e nel pacchetto Linux. Le estensioni comuni (.csv, .txt, .arw delle foto Sony…) vanno solo in «Apri con»:
// nella configurazione comune (che su Windows diventa il programma predefinito) restano solo i progetti e i formati propri (Agilent, JCAMP-DX).
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path');
const R=p=>fs.readFileSync(path.join(__dirname,'..','..',p),'utf8');
const accept=()=>{ const m=/const ACCEPT = \/\\\.\(([^)]*)\)\$\/i;/.exec(R('index.html')); return m[1].split('|').filter(x=>!/\\d/.test(x)); };
const rawExt=()=>{ const m=/const RAW_EXT: \[&str; (\d+)\] = \[([^\]]*)\]/.exec(R('src-tauri/src/lib.rs')); const L=[...m[2].matchAll(/"([a-z0-9]+)"/g)].map(x=>x[1]); assert.equal(L.length,+m[1]); return L; };

test('pagina e lato nativo leggono gli stessi formati, .ch e .uv compresi', ()=>{
  assert.deepEqual(rawExt().sort(), accept().sort()); assert.ok(accept().includes('ch') && accept().includes('uv'));
  assert.match(R('src-tauri/src/lib.rs'), /RunEvent::Opened[\s\S]{0,300}is_openable/, 'macOS: «Apri con» e doppio clic devono accettare anche i file grezzi');
});

test('associazioni: predefinito solo per progetti e Agilent, «Apri con» per tutti gli altri su macOS, Windows e Linux', ()=>{
  const base=JSON.parse(R('src-tauri/tauri.conf.json')).bundle.fileAssociations.flatMap(a=>a.ext);
  assert.deepEqual(base.sort(), ['acchlib','acchspettri','ch','dx','jcamp','jdx','uv'], 'su Windows ogni estensione di tauri.conf.json diventa predefinita: solo formati propri, niente .csv/.txt/.arw');
  const mac=JSON.parse(R('src-tauri/tauri.macos.conf.json')).bundle.fileAssociations, macExt=mac.flatMap(a=>a.ext);
  for (const e of rawExt()) assert.ok(macExt.includes(e), 'macOS: manca .'+e);
  for (const a of mac) if (a.ext.some(e=>!base.includes(e))) assert.equal(a.rank,'Alternate', 'macOS: .'+a.ext.join('/.')+' non deve diventare predefinito');
  const nsis=R('src-tauri/windows/installer-hooks.nsh'), ow=[...nsis.matchAll(/!insertmacro \$\{M\} "([a-z0-9]+)"/g)].map(x=>x[1]);
  assert.deepEqual(ow.sort(), rawExt().filter(e=>!base.includes(e)).sort(), 'Windows: OpenWithProgids'); assert.match(nsis, /OpenWithProgids/); assert.match(nsis, /NSIS_HOOK_PREUNINSTALL[\s\S]*ACCH_OPENWITH_DEL/, 'la disinstallazione deve togliere le voci');
  const desk=/^MimeType=(.*)$/m.exec(R('src-tauri/linux/acchiappaspettri.desktop'))[1].split(';').filter(Boolean), xml=R('src-tauri/linux/acchiappaspettri-mime.xml');
  for (const t of [...xml.matchAll(/<mime-type type="([^"]+)"/g)].map(x=>x[1])) assert.ok(desk.includes(t), 'Linux: '+t+' non è nel file .desktop');
  for (const t of ['text/csv','text/plain','chemical/x-jcamp-dx']) assert.ok(desk.includes(t), 'Linux: '+t);
  assert.match(xml, /x-waters-empower-arw[\s\S]*?<magic/, '.arw di Empower distinto dalle foto Sony per il contenuto');
});

test('I4: librerie dei picchi dal sistema: .acchlib predefinito su Windows, macOS e Linux; .acchlib.json in «Apri con» (Linux: doppio clic), importate dalla pagina', ()=>{
  for (const f of ['src-tauri/tauri.conf.json','src-tauri/tauri.macos.conf.json']){ const a=JSON.parse(R(f)).bundle.fileAssociations.find(x=>x.ext.includes('acchlib')); assert.ok(a && !a.rank, f+': .acchlib predefinito'); }
  assert.match(R('src-tauri/linux/acchiappaspettri-mime.xml'), /<glob pattern="\*\.acchlib"\/>/);
  assert.match(R('app/library.js'), /const EXT='\.acchlib'/);
  const rs=R('src-tauri/src/lib.rs'); assert.match(rs, /fn is_openable[\s\S]{0,200}is_library/);
  const base=JSON.parse(R('src-tauri/tauri.conf.json')).bundle.fileAssociations.flatMap(a=>a.ext); assert.ok(!base.includes('json'), 'mai predefinito per tutti i .json');
  const mac=JSON.parse(R('src-tauri/tauri.macos.conf.json')).bundle.fileAssociations.find(a=>a.ext.includes('json')); assert.ok(mac && mac.rank==='Alternate');
  const nsis=R('src-tauri/windows/installer-hooks.nsh'); assert.match(nsis, /\.json\\OpenWithProgids" "\$\{ACCH_LIBPROGID\}"/); assert.match(nsis, /NSIS_HOOK_PREUNINSTALL[\s\S]*\.json\\OpenWithProgids" "\$\{ACCH_LIBPROGID\}"/);
  assert.match(R('src-tauri/linux/acchiappaspettri-mime.xml'), /<glob pattern="\*\.acchlib\.json"/);
  assert.match(R('app/desktop.js'), /isLib=n=>\/\\\.\(acchlib\|json\)\$\/i/); assert.match(R('app/desktop.js'), /isLib\(p\.name\)[\s\S]{0,200}AcchLibUi\.importText/);
});
