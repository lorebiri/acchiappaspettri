// Prova reale dell'aggiornamento: l'app di collaudo (versione A) contro un server locale che offre la versione B firmata.
// Uso: node test/e2e/update-test.js <eseguibile-A> <platform-key> <pacchetto-B> <firma-B> <versione-B> <versione-A>
const http=require('http'), fs=require('fs'), {spawnSync}=require('child_process'), path=require('path'), os=require('os');
const [exe,plat,pkg,sigFile,verB,verA]=process.argv.slice(2), sig=fs.readFileSync(sigFile,'utf8').trim(), body=fs.readFileSync(pkg);
const srv=http.createServer((q,r)=>{ const P=`http://127.0.0.1:${srv.address().port}`, js=(v,s,u)=>({version:v,notes:'Note di prova',pub_date:'2026-01-01T00:00:00Z',platforms:{[plat]:{url:u||`${P}/pkg`,signature:s}}});
  if (q.url==='/same.json') return r.end(JSON.stringify(js(verA,sig)));
  if (q.url==='/ok.json') return r.end(JSON.stringify(js(verB,sig)));
  if (q.url==='/badsig.json'){ const bad=Buffer.from(Buffer.from(sig,'base64').toString().replace(/[A-Za-z0-9+]{20}/,'AAAAAAAAAAAAAAAAAAAA')).toString('base64'); return r.end(JSON.stringify(js(verB,bad))); }
  if (q.url==='/cut.json') return r.end(JSON.stringify(js(verB,sig,`${P}/cut`)));
  if (q.url==='/tampered.json') return r.end(JSON.stringify(js(verB,sig,`${P}/tampered`)));
  if (q.url==='/pkg') return r.end(body);
  if (q.url==='/cut'){ r.writeHead(200,{'content-length':body.length}); r.write(body.subarray(0,body.length>>1)); return setTimeout(()=>r.destroy(),100); }
  if (q.url==='/tampered'){ const b=Buffer.from(body); b[b.length>>1]^=255; return r.end(b); }
  r.writeHead(404); r.end(); });
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'acch-up-'));
srv.listen(0,'127.0.0.1',async ()=>{ const base=`http://127.0.0.1:${srv.address().port}`; let fail=0;
  const run=(sc,url)=>new Promise(res=>{ const {spawn}=require('child_process'); const c=spawn(exe,[],{env:Object.assign({},process.env,{ACCH_E2E_DIR:dir,ACCH_E2E_SCENARIO:sc,ACCH_E2E_UPDATE_URL:url}),stdio:'ignore'}); const t=setTimeout(()=>c.kill(),120000); c.on('exit',code=>{ clearTimeout(t); let rep=null; try{ rep=JSON.parse(fs.readFileSync(path.join(dir,'e2e-report.json'),'utf8')); fs.unlinkSync(path.join(dir,'e2e-report.json')); }catch(e){} res({code,rep}); }); });
  const expect=(name,ok,info)=>{ console.log((ok?'✓ ':'✗ ')+name+(ok?'':' '+JSON.stringify(info))); if (!ok) fail++; };
  let r=await run('update-none',base+'/same.json'); expect('stessa versione: nessun aggiornamento proposto',r.code===0,r);
  r=await run('update-bad',base+'/badsig.json'); expect('firma alterata: rifiutato',r.code===0,r); console.log('   ',r.rep&&r.rep.updateError);
  r=await run('update-bad',base+'/tampered.json'); expect('pacchetto alterato: rifiutato',r.code===0,r); console.log('   ',r.rep&&r.rep.updateError);
  r=await run('update-bad',base+'/cut.json'); expect('download interrotto: nessuna installazione',r.code===0,r); console.log('   ',r.rep&&r.rep.updateError);
  r=await run('update-bad','http://127.0.0.1:1/x.json'); expect('server irraggiungibile: errore gestito',r.code===0,r);
  r=await run('version',''); expect('prima dell\'aggiornamento: versione '+verA,r.rep&&r.rep.version===verA,r);
  r=await run('update-good',base+'/ok.json'); expect('firma valida: scaricato, verificato, installato',r.code===0,r);
  await new Promise(res=>setTimeout(res,3000));
  r=await run('version',''); expect('dopo l\'aggiornamento: versione '+verB,r.rep&&r.rep.version===verB,r);
  srv.close(); console.log(fail?`${fail} FALLITI`:'tutti riusciti'); process.exit(fail?1:0); });
