// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Desktop 3.0.0 (I1, dialoghi): finestra mostrata al primo disegno, trascinamento nativo, jsPDF caricato quando serve,
// comandi nativi dei dialoghi registrati. Le prove nel browser sono in test/validation/desktop-dialoghi.test.js.
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path');
const root=path.join(__dirname,'..','..'), conf=JSON.parse(fs.readFileSync(path.join(root,'src-tauri/tauri.conf.json'),'utf8')), win=conf.app.windows.find(w=>w.label==='main');
const rs=fs.readFileSync(path.join(root,'src-tauri/src/lib.rs'),'utf8');

test('la finestra parte nascosta e la pagina chiede di mostrarla (app_ready), con un ripiego nativo', ()=>{
  assert.strictEqual(win.visible, false);
  assert.match(fs.readFileSync(path.join(root,'app/desktop.js'),'utf8'), /inv\('app_ready'\)/);
  assert.match(rs, /fn app_ready\(/); assert.match(rs, /run_on_main_thread\(move \|\| show_main/);
  for (const h of rs.match(/generate_handler!\[[^\]]*\]/g)) for (const c of ['app_ready','pick_folder']) assert.ok(h.includes(c), c+' non registrato: '+h);
});
test('trascinamento nativo attivo, con i percorsi concessi dal lato nativo', ()=>{
  assert.strictEqual(win.dragDropEnabled, true);
  assert.match(rs, /DragDropEvent::Drop/); assert.match(rs, /emit\("acch-dropped"/);
});
test('desktop: jsPDF non si carica all\'avvio ma alla prima esportazione PDF; online resta com\'è', ()=>{
  const {desktopHtml}=require(path.join(root,'scripts/prepare-desktop.js'));
  const web=fs.readFileSync(path.join(root,'index.html'),'utf8'), desk=desktopHtml(web), tag=/<script src="vendor\/jspdf\.umd\.min\.js"><\/script>/;
  assert.match(web, tag); assert.doesNotMatch(desk, tag);
  assert.match(desk, /async function buildPdf\(\)\{\s*await ensurePdfLib\(\);/);
  assert.strictEqual(desktopHtml(web.replace(/\n/g,'\r\n')).includes('vendor/jspdf.umd.min.js"></script>'), false, 'righe CRLF (Windows)');
});
