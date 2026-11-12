// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Elenco delle librerie Linux per l'offerta LGPL: solo i pacchetti delle librerie incluse nell'AppImage (dpkg -S), non tutta la macchina.
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), os=require('os'), {execFileSync}=require('child_process');
const L=require('../../scripts/linux-libs-tsv.js'), root=path.join(__dirname,'..','..');

test('librerie trovate nell\'albero estratto, programma escluso', ()=>{ const d=fs.mkdtempSync(path.join(os.tmpdir(),'ai-'));
  for (const f of ['usr/lib/libgtk-3.so.0','usr/lib/x86_64-linux-gnu/libwebkit2gtk-4.1.so.0.13.2','usr/lib/gio/modules/libgiolibproxy.so','usr/bin/acchiappaspettri','usr/share/doc/x.txt']){ fs.mkdirSync(path.dirname(path.join(d,f)),{recursive:true}); fs.writeFileSync(path.join(d,f),''); }
  assert.deepStrictEqual(L.libsFromTree(d), ['libgiolibproxy.so','libgtk-3.so.0','libwebkit2gtk-4.1.so.0.13.2']); });
test('uscita di dpkg -S: architettura, più pacchetti per file, diversioni', ()=>{
  const m=L.parseDpkgS('libgtk-3-0:amd64: /usr/lib/x86_64-linux-gnu/libgtk-3.so.0\nlibc6:amd64, libc6-dev:amd64: /usr/lib/x86_64-linux-gnu/libm.so.6\ndiversion by x from: /usr/lib/libz.so.1\ndpkg-query: no path found matching pattern */libnone.so\n');
  assert.deepStrictEqual([...m.get('libgtk-3.so.0')], ['libgtk-3-0:amd64']); assert.deepStrictEqual([...m.get('libm.so.6')], ['libc6:amd64','libc6-dev:amd64']); assert.ok(!m.has('libz.so.1')); assert.ok(!m.has('libnone.so')); });
test('TSV: intestazione onesta, righe a 4 colonne, librerie senza pacchetto dichiarate', ()=>{
  const t=L.tsv([['libgtk-3-0','3.24.33-1ubuntu2','gtk+3.0','3.24.33-1ubuntu2']], ['libextra.so.1'], 2), r=t.trim().split('\n');
  assert.match(r[0], /^# Pacchetti Ubuntu 22\.04 da cui vengono le 2 librerie incluse nell'AppImage \(trovati con dpkg -S\)/); assert.doesNotMatch(t, /elenco completo/);
  assert.strictEqual(r[2].split('\t').length, 4); assert.match(r[3], /^# .*non trovate da dpkg.*libextra\.so\.1/); });
test('release.yml: il TSV si genera dall\'AppImage estratta con scripts/linux-libs-tsv.js, non da dpkg-query -W di tutta la macchina', ()=>{
  const y=fs.readFileSync(path.join(root,'.github/workflows/release.yml'),'utf8');
  assert.match(y, /--appimage-extract/); assert.match(y, /node scripts\/linux-libs-tsv\.js "\$x\/squashfs-root" > librerie-linux-ubuntu-22\.04\.tsv/); assert.doesNotMatch(y, /dpkg-query -W -f=/); });
test('con dpkg (Linux): una libreria di sistema viene ricondotta al suo pacchetto', {skip:(()=>{ try{ execFileSync('dpkg',['--version'],{stdio:'ignore'}); return false; }catch(e){ return 'dpkg assente (si prova nella pipeline Linux)'; } })()}, ()=>{
  const lib=execFileSync('sh',['-c','ls /usr/lib/x86_64-linux-gnu/libc.so.6 /lib/x86_64-linux-gnu/libc.so.6 2>/dev/null | head -1'],{encoding:'utf8'}).trim(); if (!lib) return;
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'ai-')); fs.mkdirSync(path.join(d,'usr/lib'),{recursive:true}); fs.writeFileSync(path.join(d,'usr/lib/libc.so.6'),'');
  const t=execFileSync(process.execPath,[path.join(root,'scripts/linux-libs-tsv.js'),d],{encoding:'utf8'}); assert.match(t, /^libc6\t/m); });
