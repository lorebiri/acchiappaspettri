// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Tappa I4: prove di accettazione T1–T6 di docs/SPEC-TARATURA-SALVATA.md («Prove di accettazione», riga 68), app/hplc-stored-cal.js.
// Dati SINTETICI, semi fissi. La pagina (schermo, CSV, PDF, metodi) è provata in test/validation/i4-librerie-ui.test.js.
'use strict';
const test=require('node:test'), assert=require('node:assert'), path=require('path'), {execFileSync}=require('child_process');
const root=path.join(__dirname,'..','..');
const Q=require(path.join(root,'app','hplc-stored-cal.js')), Lib=require(path.join(root,'app','library.js'));

function rng(seed){ let s=seed>>>0; return ()=>{ s=(Math.imul(s,1103515245)+12345)>>>0; return s/4294967296; }; }
function gaussOf(r){ return ()=>{ let u=0; while (!u) u=r(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*r()); }; }
function fit(pts){ const n=pts.length, xm=pts.reduce((a,p)=>a+p.x,0)/n, ym=pts.reduce((a,p)=>a+p.y,0)/n; let sxx=0,sxy=0,sx2=0; for (const p of pts){ sxx+=(p.x-xm)**2; sxy+=(p.x-xm)*(p.y-ym); sx2+=p.x*p.x; }
  const b=sxy/sxx, a=ym-b*xm; let ss=0; for (const p of pts) ss+=(p.y-a-b*p.x)**2; const syx=Math.sqrt(ss/(n-2));
  return {kind:'line', slope:b, intercept:a, syx, srel:Q.relRepeatability(pts,a,b), sa:syx*Math.sqrt(sx2/(n*sxx)), sb:syx/Math.sqrt(sxx), n, df:n-2, range:[1,20], date:'2026-10-01', areaUnit:'mAU·min', concUnit:'mg/L'}; }
const CAL={kind:'line', slope:100, intercept:0.4, sa:1.2, syx:2, srel:0.01, n:18, df:16, range:[1,20], date:'2026-10-01', areaUnit:'mAU·min', concUnit:'mg/L', standardLot:'L-7'};
const E0={id:'v1', rev:3, name:'Caffeina', x:3.2, window:0.1, cal:CAL};
const LIB={id:'lib-x', name:'Agilent 1260 Infinity · DAD — alimenti', revision:4, profile:'ricerca', thresholds:{dev:10, diff:5, drift:5}, reminderDays:180, maintenance:[]};
const run=o=>Q.quantify(Object.assign({entry:E0, lib:LIB, today:'2026-11-13', y:800, sampleYs:[800]}, o));

test('T1: ogni blocco impedisce il numero e dà il messaggio giusto; Ricerca senza controlli dà il numero marcato', ()=>{
  const cases=[
    ['no-control', {lib:Object.assign({},LIB,{profile:'esplorativa'})}, 'controllo assente'],
    ['ctrl-dev', {controls:[{nominal:8, y:900}]}, 'controllo fuori soglia (+12,4% su ±10%)'],
    ['drift', {controls:[{nominal:8, y:800, pos:'open', order:0}, {nominal:8, y:850, pos:'close', order:9}], sampleOrder:4}, 'deriva 6,3% su 5%'],
    ['incoherent', {controls:[{nominal:3, y:300.4}, {nominal:17, y:1700.4*1.07}], sampleYs:[800]}, 'controlli non coerenti'],
    ['channel', {check:{channel:{ok:false, detail:'DAD1A, Sig=254 / DAD1A, Sig=220,4'}}}, 'canale diverso da quello della taratura'],
    ['method', {check:{method:{ok:false, detail:'B.M / A.M'}}}, 'metodo diverso da quello della taratura'],
    ['instrument', {check:{instrument:{ok:false, detail:'Agilent 1290 / Agilent 1260'}}}, 'strumento diverso da quello della taratura'],
    ['column', {check:{column:{ok:false, detail:'C18 / Phenyl-Hexyl'}}}, 'colonna diversa da quella della taratura'],
    ['range', {y:2500}, 'fuori intervallo'],
    ['profile', {lib:Object.assign({},LIB,{profile:'dosaggio'})}, 'profilo dosaggio richiede la retta del giorno'],
    ['profile', {lib:Object.assign({},LIB,{profile:'tracce'})}, 'retta del giorno'],
    ['profile', {lib:Object.assign({},LIB,{profile:'bioanalisi'})}, 'retta del giorno'],
    ['chart', {entry:Object.assign({},E0,{chart:[1,1.01,0.99,1,1.005,0.995,1.01,0.99,1,1].map(k=>({k}))}), controls:[{nominal:8, y:(0.4+800)*1.08}]}, 'carta di controllo: limite di azione superato'],
    ['maintenance', {lib:Object.assign({},LIB,{maintenance:[{date:'2026-10-20', kind:'lampada'}]})}, 'manutenzione registrata dopo la taratura'],
    ['normalized', {normalized:true}, 'dati normalizzati'],
    ['suitability', {suitability:false}, 'idoneità del sistema non superata'],
    ['need-two', {entry:Object.assign({},E0,{cal:Object.assign({},CAL,{intercept:40, sa:1})}), controls:[{nominal:8, y:840}]}, 'servono due controlli (basso e alto): intercetta significativa'],
    ['need-two', {controls:[{nominal:8, y:800.4}], sampleYs:[800, 3000]}, 'campioni fuori da 0,5–2 volte'],
    ['frequency', {controls:[{nominal:8, y:800.4, order:0}], sampleOrder:30}, 'controlli troppo radi'],
    ['ctrl-window', {controls:[{nominal:8, y:800.4, tR:3.5}]}, 'tR del controllo fuori dalla finestra'],
    ['no-response', {y:NaN}, 'picco non trovato']];
  for (const [code, o, msg] of cases){ const r=run(o);
    assert.strictEqual(r.ok, false, code); assert.strictEqual(r.x, null, code+': nessun numero'); assert.strictEqual(r.code, code, code+' → '+r.code);
    const t=Q.statusText(r,'it'); assert.ok(t.includes(msg) || Q.reasonText(r,false).includes(msg), `${code}: «${t}»`);
    if (code!=='profile') assert.match(t, /^Taratura non verificata oggi: .*Misura una retta del giorno\.$/);
    assert.ok(Q.statusText(r,'en').length>20); }
  // profilo Ricerca senza controlli: il numero c'è e porta il segno, con data ed età
  const r=run({}); assert.strictEqual(r.ok, true); assert.strictEqual(r.mode, 'nocontrol'); assert.ok(Math.abs(r.x-(800-0.4)/100)<1e-12);
  assert.strictEqual(Q.statusText(r,'it'), 'Taratura salvata del 01/10/2026 (età 43 giorni), senza controllo del giorno: una deriva dello strumento non verrebbe vista. Consigliato un controllo.');
  assert.strictEqual(Q.markText('it'), 'senza controllo del giorno'); assert.strictEqual(Q.modeText(r,'it'), 'salvata senza controllo');
  assert.ok(r.U>0 && r.u.betweenDays===0.05, 'componente tra i giorni del 5% dichiarata');
  assert.match(Q.provenanceText(r,'it'), /libreria «Agilent 1260 Infinity · DAD — alimenti» rev\. 4 · voce «Caffeina» rev\. 3 · taratura del 01\/10\/2026/);
  // con un controllo: numero, k, scostamento, frase giusta
  const r1=run({controls:[{nominal:8, y:(0.4+800)*1.021}]}); assert.strictEqual(r1.mode,'1ctrl'); assert.match(Q.statusText(r1,'it'), /aggiornata oggi con 1 controllo; scostamenti \+2,1%\./);
  // promemoria dell'età: non blocca mai
  const old=run({today:'2027-06-01'}); assert.strictEqual(old.ok, true); assert.ok(Q.warningTexts(old,'it').includes('Promemoria: taratura di oltre 180 giorni.'));
  assert.ok(Q.warningTexts(run({lib:Object.assign({},LIB,{profile:'esplorativa'}), controls:[{nominal:8, y:800.4}]}),'it').includes('Stima esplorativa.'));
});

test('T2: Monte Carlo (seme fisso), deriva 3, 5 e 8%: oltre ±10% ≤ 1,5% con un controllo e ≤ 0,5% con due; copertura di U95 tra 93 e 97%', ()=>{
  for (const cv of [0.01, 0.02]) for (const nc of [1,2]) for (const d of [0.03,0.05,0.08]){
    const r=rng(1000+Math.round(cv*1000)*10+nc*100+Math.round(d*100)), g=gaussOf(r), noise=y=>y*cv*g(); let ok=0, bad=0, cov=0;
    for (let it=0; it<5000; it++){
      const pts=[]; for (const x of [1,2,5,10,15,20]) for (let k=0;k<4;k++){ const y=100*x; pts.push({x, y:y+noise(y)}); }   // 6 livelli × 4 repliche: s_r con 18 gradi di libertà
      const cal=fit(pts), resp=x=>{ const y=100*x*(1+d); return y+noise(y); };
      const xt=nc===1 ? 6+13*r() : 2+17*r(), ctr=nc===1 ? [{nominal:10, y:resp(10)}] : [{nominal:3, y:resp(3)}, {nominal:17, y:resp(17)}], y=resp(xt);
      const res=Q.quantify({entry:{name:'A', cal}, lib:{profile:'ricerca'}, y, controls:ctr, sampleYs:[y], today:'2026-11-13'});
      if (!res.ok) continue; ok++; if (Math.abs(res.x/xt-1)>0.10) bad++; if (Math.abs(res.x-xt)<=res.U) cov++; }
    const out=100*bad/ok, c=100*cov/ok, tag=`CV ${cv*100}%, ${nc} controlli, deriva ${d*100}%`;
    assert.ok(ok>3000, tag+': troppi blocchi'); assert.ok(out<=(nc===1?1.5:0.5), `${tag}: oltre ±10% ${out.toFixed(2)}%`); assert.ok(c>=93 && c<=97, `${tag}: copertura ${c.toFixed(1)}%`); }
});

test('T3: carta di controllo: salto dell\'8% entro 1 serie, deriva dello 0,1% al giorno entro 40 serie, falsi allarmi ≤ 1% per serie', ()=>{
  const r=rng(77), g=gaussOf(r), sd=0.01, N=2000; let jump=0, drift=0, fa=0, series=0;
  for (let it=0; it<N; it++){
    const base=Array.from({length:10},()=>1+sd*g());
    if (Q.chartCheck(base.concat([1.08+sd*g()])).block) jump++;   // salto alla prima serie dopo le 10 di riferimento
    let L=base.slice(), seen=false; for (let dday=1; dday<=40 && !seen; dday++){ L.push(1+0.001*dday+sd*g()); const c=Q.chartCheck(L); if (c.block || c.warn) seen=true; } if (seen) drift++;
    L=base.slice(); for (let s=0;s<20;s++){ L.push(1+sd*g()); series++; if (Q.chartCheck(L).block) fa++; } }
  assert.ok(jump/N>=0.99, 'salto 8%: '+jump/N); assert.ok(drift/N>=0.95, 'deriva: '+drift/N); assert.ok(fa/series<=0.01, 'falsi allarmi per serie: '+fa/series);
  // con la sola regola 1_3s su limiti da 10 serie i falsi allarmi sarebbero circa l'1,7%: per questo il limite d'azione è 3,5 s
  let fa3=0; const r2=rng(78), g2=gaussOf(r2); for (let it=0; it<N; it++){ const b=Array.from({length:10},()=>1+sd*g2()); for (let s=0;s<20;s++){ if (Q.chartCheck(b.concat([1+sd*g2()]),{action:3}).block) fa3++; } }
  assert.ok(fa3/(N*20)>0.01, 'con 3 s si supera l\'1%: '+fa3/(N*20));
  assert.strictEqual(Q.chartCheck([1,1,1]).active, false, 'meno di 10 serie: carta non attiva');
});

test('T4: k, x, U e RRF contro un calcolo Python indipendente, LRE ≥ 10', ()=>{
  const r=rng(9), cases=[];
  for (let i=0;i<60;i++){ const cal={kind:i%7===0?'rf':'line', slope:50+200*r(), intercept:i%7===0?null:(r()-0.5)*4, sa:0.2+r(), syx:0.5+3*r(), srel:i%3===0?null:0.005+0.02*r(), n:12, df:10, range:null};
    const nc=i%3, ctr=nc===0?[]:nc===1?[{nominal:5+10*r()}]:[{nominal:2+r()},{nominal:15+5*r()}]; ctr.forEach(c=>{ c.y=((cal.kind==='rf'?0:cal.intercept)+cal.slope*c.nominal)*(0.96+0.08*r()); });
    // due controlli coerenti: lo stesso k (entro il 5%)
    if (nc===2) ctr[1].y=ctr[0].y/((cal.kind==='rf'?0:cal.intercept)+cal.slope*ctr[0].nominal)*((cal.kind==='rf'?0:cal.intercept)+cal.slope*ctr[1].nominal)*(1+0.02*(r()-0.5));
    const x=ctr.length===1 ? ctr[0].nominal*(0.6+0.8*r()) : 3+12*r(), y=((cal.kind==='rf'?0:cal.intercept)+cal.slope*x)*(1+0.02*(r()-0.5));
    cases.push({cal, y, controls:ctr, uStd:i%4===0?0.01:null}); }
  for (let i=0;i<10;i++) cases.push({cal:{kind:'line', slope:1}, y:100+500*r(), rrf:0.5+r(), activeRF:20+30*r()});
  const py=JSON.parse(execFileSync('python3',[path.join(root,'test','validation','taratura_salvata_ref.py')],{input:JSON.stringify(cases)}).toString());
  const lre=(a,b)=>a===b ? 15 : -Math.log10(Math.abs(a-b)/Math.abs(b)); let n=0;
  cases.forEach((c,i)=>{ const e={name:'A', x:null, window:null, cal:Object.assign({date:'2026-01-01'}, c.cal, c.rrf!=null?{rrf:c.rrf}:{})};
    const res=Q.quantify({entry:e, lib:{profile:c.rrf!=null?'impurezze':'ricerca', thresholds:{dev:10, diff:5}}, y:c.y, controls:c.controls, sampleYs:[c.y], uStd:c.uStd||undefined, activeRF:c.activeRF, today:'2026-11-13'});
    assert.strictEqual(res.ok, true, `caso ${i}: ${res.code} ${JSON.stringify(res.detail)}`);
    if (c.rrf!=null){ assert.ok(lre(res.x, py[i].rrf_x)>=10, `RRF ${i}`); n++; return; }
    for (const k of ['k','x','U']){ const js=k==='k' ? (res.k==null?1:res.k) : res[k]; const L=lre(js, py[i][k]); assert.ok(L>=10, `caso ${i} ${k}: LRE ${L.toFixed(1)} (${js} / ${py[i][k]})`); n++; } });
  assert.ok(n>=190);
});

test('T5: profili e soglie conservati nei file di libreria e nei progetti', async ()=>{
  const lib=Lib.create({instrument:{brand:'Agilent', model:'1260 Infinity', detector:'DAD G4212B'}, sampleType:'alimenti', profile:'esplorativa', entries:[Object.assign({profile:'impurezze'}, E0)]});
  lib.thresholds={dev:18, diff:8}; lib.thresholdReason='matrice complessa, motivazione scritta'; lib.reminderDays=90;
  const back=Lib.parse(Lib.serialize(lib));
  assert.strictEqual(back.profile,'esplorativa'); assert.deepStrictEqual(back.thresholds,{dev:18, diff:8, drift:null}); assert.strictEqual(back.thresholdReason, lib.thresholdReason); assert.strictEqual(back.reminderDays, 90); assert.strictEqual(back.entries[0].profile,'impurezze');
  // progetto v2 con la libreria incorporata: torna identica
  global.window=undefined; const F=require(path.join(root,'app','project-format.js')), JSZip=require(path.join(root,'node_modules','jszip'));
  const bytes=await F.encode({appVersion:'3.0.0-test', title:'t', state:{S:{}, MV:{}, COMPS:[], REFS:[], LIB:[], curIndex:0}, spectra:[], libraries:[{id:lib.id, revision:lib.revision, name:lib.name, data:JSON.parse(Lib.serialize(lib))}], results:[]}, JSZip);
  const P=await F.decode(bytes, JSZip); const got=Lib.normalize(P.libraries[0].data);
  assert.strictEqual(Lib.serialize(got), Lib.serialize(back));
});

test('T6: chi non riceve un numero capisce perché e cosa fare (testi completi in italiano e in inglese)', ()=>{
  // l'esperienza d'uso con persone vere resta da misurare (SUS, DECISIONE-PO §10): qui si verifica che ogni motivo sia detto in chiaro
  for (const code of Object.keys(Q.REASON)){ const r={ok:false, code, detail:null, provenance:{profile:'ricerca'}};
    for (const lg of ['it','en']){ const t=Q.statusText(r, lg); assert.ok(!/undefined|null|NaN|\{|\}/.test(t), `${code} ${lg}: ${t}`); assert.ok(t.length>30); } }
  assert.match(Q.statusText({ok:false, code:'profile', provenance:{profile:'bioanalisi'}},'it'), /solo confronto/);
});
