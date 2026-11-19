// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Revisione online «immediatezza e chiarezza»: tutto sta nei file della sola versione online (app/web.css, app/web.js).
// La prova nel browser, desktop identico pixel per pixel, è test/validation/web-chiarezza-ui.test.js.
'use strict';
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path');
const root=path.join(__dirname,'..','..'), rd=f=>fs.readFileSync(path.join(root,f),'utf8');
const CLASSI=['webpath','webstep','webn','webentry','webtabs','webor'];

test('le classi della revisione esistono solo nei file della versione online', ()=>{
  for (const f of ['index.html','app/app.css','app/shell.css','app/shell.js','app/desktop.js','app/theme-dark.css','app/ui.js','app/vista.html'])
    for (const c of CLASSI) assert.ok(!new RegExp('\\b'+c+'\\b').test(rd(f)), f+' nomina '+c);
  const css=rd('app/web.css'), js=rd('app/web.js');
  for (const c of CLASSI) assert.ok(css.includes('.'+c) || js.includes("'"+c+"'"), c);
});
test('il blocco della revisione in app/web.js esce subito fuori dalla versione online', ()=>{
  const js=rd('app/web.js'), i=js.indexOf('Revisione online «immediatezza e chiarezza»'); assert.ok(i>0);
  const head=js.slice(i, i+900); assert.ok(/if \(!root\.classList\.contains\('web'\)\) return;/.test(head));
});
test('il desktop non riceve mai la classe web', ()=>{
  const b=rd('app/shell-boot.js'); assert.ok(/if \(window\.ACCH_SHELL\)\{[^}]*classList\.add\('shell'\)/.test(b)); assert.ok(/else \{ document\.documentElement\.classList\.add\('web'\)/.test(b));
});
test('ogni testo nuovo ha la sua traduzione in i18n/en-app.json', ()=>{
  const js=rd('app/web.js'), blk=js.slice(js.lastIndexOf('\n/*', js.indexOf('Revisione online «immediatezza e chiarezza»'))), en=JSON.parse(rd('i18n/en-app.json'));
  const lits=[]; (function walk(n){ if (!n || typeof n.type!=='string') return; if (n.type==='Literal' && typeof n.value==='string' && /\p{L}{3}/u.test(n.value) && /\s/.test(n.value) && n.value!=='use strict' && !/^[#.[]/.test(n.value)) lits.push(n.value);
    for (const k in n){ const v=n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type==='string') walk(v); } })(require('acorn').parse(blk,{ecmaVersion:'latest'}));
  assert.ok(lits.length>=10, lits.join(' | '));
  for (const t of lits) assert.ok(t in en, 'manca la traduzione: '+t);
});
