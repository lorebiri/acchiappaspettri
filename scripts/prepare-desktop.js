// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Copia in dist-desktop/ solo ciò che serve all'app: pagina, librerie, moduli. Niente test né sorgenti nativi.
const fs=require('fs'), path=require('path'); const root=path.join(__dirname,'..'), out=path.join(root,'dist-desktop');
// pagina del desktop: jsPDF non si carica all'avvio ma alla prima esportazione PDF (ensurePdfLib in index.html), così la prima schermata arriva prima
const JSPDF_TAG=/<script src="vendor\/jspdf\.umd\.min\.js"><\/script>\r?\n/;
function desktopHtml(h){ if (!JSPDF_TAG.test(h) || !h.includes('function ensurePdfLib')) throw new Error('prepare-desktop: jsPDF o ensurePdfLib non trovati in index.html'); return h.replace(JSPDF_TAG,''); }
function main(){
  fs.rmSync(out,{recursive:true,force:true}); fs.mkdirSync(out,{recursive:true});
  for (const f of ['index.html','apple-touch-icon.png','THIRD-PARTY-NOTICES.md']) fs.copyFileSync(path.join(root,f), path.join(out,f));
  if (fs.existsSync(path.join(root,'LICENSE'))) fs.copyFileSync(path.join(root,'LICENSE'), path.join(out,'LICENSE'));
  // copie .txt (a capo di Windows) per i pacchetti: su Windows LICENSE senza estensione e .md non si aprono con un doppio clic
  fs.mkdirSync(path.join(out,'licenze'));
  for (const [f,t] of [['LICENSE','LICENSE.txt'],['THIRD-PARTY-NOTICES.md','THIRD-PARTY-NOTICES.txt']]) fs.writeFileSync(path.join(out,'licenze',t), fs.readFileSync(path.join(root,f),'utf8').replace(/\r?\n/g,'\r\n'));
  for (const d of ['vendor','app']) fs.cpSync(path.join(root,d), path.join(out,d), {recursive:true});
  fs.writeFileSync(path.join(out,'index.html'), desktopHtml(fs.readFileSync(path.join(root,'index.html'),'utf8')));
  fs.mkdirSync(path.join(out,'i18n')); fs.copyFileSync(path.join(root,'i18n/en.js'), path.join(out,'i18n/en.js'));
  if (process.env.ACCH_E2E_PAGE) { let h=fs.readFileSync(path.join(out,'index.html'),'utf8'); fs.copyFileSync(path.join(root,'test/e2e/e2e-page.js'), path.join(out,'app/e2e-page.js')); h=h.replace('<script src="app/desktop.js"></script>','<script src="app/e2e-page.js"></script>\n<script src="app/desktop.js"></script>'); fs.writeFileSync(path.join(out,'index.html'),h); }
  console.log('dist-desktop pronto');
}
if (require.main===module) main();
module.exports={desktopHtml};
