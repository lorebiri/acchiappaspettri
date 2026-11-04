// Sostituisce la costante FP_DATA in index.html con il file generato da gen-fp-data.py
const fs=require('fs'), path=require('path'); const p=path.join(__dirname,'..','index.html'); let s=fs.readFileSync(p,'utf8');
const data=fs.readFileSync(process.argv[2],'utf8'), i=s.indexOf('const FP_DATA='), j=s.indexOf(';\n',i); if (i<0) throw new Error('FP_DATA non trovata');
s=s.slice(0,i)+'const FP_DATA='+data+s.slice(j); fs.writeFileSync(p,s); console.log('ok',data.length);
