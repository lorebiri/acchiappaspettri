// benchmark finto per test/unit/r8-runner.test.js: scrive due righe dopo LENTO_MS millisecondi
setTimeout(()=>{ console.log('riga 1   '); console.log('N='+process.env.N); }, +process.env.LENTO_MS||1500);
