// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Rigenera test/fixtures/pymca/verifica-pymca.json: che cosa legge PyMca vero (ConfigDict) dai .cfg d'esempio e da quelli scritti da
// app/pymca-cfg-core.js, e il fit di Steel.spe con Steel.cfg e con il .cfg rifatto da toAcch → fromAcch. I test unitari usano il JSON
// salvato, così la CI non ha bisogno di Python.
// Uso: node scripts/pymca-cfg-verifica.js [python con pymca==5.9.7 e fisx==1.3.2, predefinito /opt/venv/bin/python]
const fs=require('fs'), path=require('path'), os=require('os'), {execFileSync}=require('child_process');
const ROOT=path.join(__dirname,'..'), FIX=path.join(ROOT,'test','fixtures','pymca'), P=require(path.join(ROOT,'app','pymca-cfg-core.js'));
const py=process.argv[2]||'/opt/venv/bin/python';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'acch-pymca-'));
const rd=f=>fs.readFileSync(path.join(FIX,f),'utf8');
const leggi={}, scritti={};
for (const f of ['Steel.cfg','McaTheory.cfg','prova-formato.cfg']){
  leggi[f]=path.join(FIX,f);
  const out=path.join(tmp,'riscritto-'+f); fs.writeFileSync(out, P.stringify(P.parse(rd(f)))); leggi['riscritto-'+f]=out; scritti['riscritto-'+f]=fs.readFileSync(out,'utf8');
}
// andata e ritorno attraverso l'oggetto neutro
for (const f of ['Steel.cfg','McaTheory.cfg']){ const out=path.join(tmp,'da-acch-'+f); fs.writeFileSync(out, P.stringify(P.fromAcch(P.toAcch(P.parse(rd(f)))))); leggi['da-acch-'+f]=out; scritti['da-acch-'+f]=fs.readFileSync(out,'utf8'); }
const req=path.join(tmp,'richiesta.json');
fs.writeFileSync(req, JSON.stringify({leggi, spe:path.join(FIX,'Steel.spe'), steel:{'Steel.cfg':leggi['Steel.cfg'], 'da-acch-Steel.cfg':leggi['da-acch-Steel.cfg']}}));
const outp=path.join(tmp,'risultato.json'); execFileSync(py, ['-I', path.join(__dirname,'pymca-cfg-verifica.py'), req, outp], {stdio:['ignore','ignore','inherit']});
const res=JSON.parse(fs.readFileSync(outp,'utf8'));
res.data=new Date().toISOString().slice(0,10); res.scritti=scritti;
res.nota='Generato da scripts/pymca-cfg-verifica.js: «letti» è ciò che ConfigDict di PyMca legge da ogni file; «scritti» sono i testi prodotti da app/pymca-cfg-core.js; «steel» è il fit di Steel.spe (frazioni in peso, Fe riferimento interno).';
fs.writeFileSync(path.join(FIX,'verifica-pymca.json'), JSON.stringify(res, null, 1)+'\n');
fs.rmSync(tmp, {recursive:true, force:true});
const s=res.steel; for (const k of Object.keys(s)) console.log(k, 'chi2', s[k].chisq.toFixed(3), JSON.stringify(Object.fromEntries(Object.entries(s[k].sec1).map(([e,v])=>[e, +v.toPrecision(4)]))));
