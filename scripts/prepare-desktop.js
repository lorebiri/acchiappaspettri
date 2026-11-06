// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Copia in dist-desktop/ solo ciò che serve all'app: pagina, librerie, moduli. Niente test né sorgenti nativi.
const fs=require('fs'), path=require('path'); const root=path.join(__dirname,'..'), out=path.join(root,'dist-desktop');
fs.rmSync(out,{recursive:true,force:true}); fs.mkdirSync(out,{recursive:true});
for (const f of ['index.html','apple-touch-icon.png','THIRD-PARTY-NOTICES.md']) fs.copyFileSync(path.join(root,f), path.join(out,f));
if (fs.existsSync(path.join(root,'LICENSE'))) fs.copyFileSync(path.join(root,'LICENSE'), path.join(out,'LICENSE'));
for (const d of ['vendor','app']) fs.cpSync(path.join(root,d), path.join(out,d), {recursive:true});
fs.mkdirSync(path.join(out,'i18n')); fs.copyFileSync(path.join(root,'i18n/en.js'), path.join(out,'i18n/en.js'));
if (process.env.ACCH_E2E_PAGE) { let h=fs.readFileSync(path.join(out,'index.html'),'utf8'); fs.copyFileSync(path.join(root,'test/e2e/e2e-page.js'), path.join(out,'app/e2e-page.js')); h=h.replace('<script src="app/desktop.js"></script>','<script src="app/e2e-page.js"></script>\n<script src="app/desktop.js"></script>'); fs.writeFileSync(path.join(out,'index.html'),h); }
console.log('dist-desktop pronto');
