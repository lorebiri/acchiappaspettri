// R5 (browser): priorità degli avvisi dopo l'importazione e blocchi senza testo in mezzo, online e desktop, in italiano e in inglese.
// Regola: vince l'avviso più grave; un ⛔ non viene mai coperto (gli altri aspettano in coda); l'avviso si chiude con × e con Esc.
// Casi dei rapporti del ciclo 25: agente C (file 06, 13–15, nota desktop), UI/UX (avviso coperto), QA («altre colonne»), HPLC s10.
// Dati SINTETICI generati qui. Uso: PW_CHANNEL=chrome node --test test/validation/r5-avvisi-ui.test.js
'use strict';
const test=require('node:test'), assert=require('node:assert');
const B=require('./browser.js');

let s=7; const rnd=()=>{ s=(s*16807)%2147483647; return s/2147483647-0.5; };
const g=(t,c,w)=>Math.exp(-0.5*((t-c)/w)**2);
const chrom=(n,dt,peaks)=>Array.from({length:n},(_,i)=>{ const t=i*dt; return [t, 0.5+0.02*rnd()+peaks.reduce((a,[c,w,h])=>a+h*g(t,c,w),0)]; });
const fx=(r,sep='\t')=>r.map(([t,y])=>t.toFixed(4)+sep+y.toFixed(4)).join('\n');
const eu=v=>{ const [i,d]=v.toFixed(2).split('.'); return i.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+','+d; };
const big=chrom(1000,0.01,[[5,0.05,1500]]), cA=chrom(3000,0.004,[[5,0.05,80]]), cB=chrom(3000,0.004,[[5,0.05,20],[8,0.05,50]]);
const ir=Array.from({length:1801},(_,i)=>{ const x=4000-i*2; return [x, 0.05+0.8*g(x,1730,8)+0.01*rnd()]; });
const F={
  // 06 dell'agente C: secondo canale e separatore delle migliaia (9 righe perse) nello stesso file
  canaleMigliaia: 'Signal: DAD1 A\nTime (min);mAU\n'+big.map(([t,y])=>t.toFixed(3).replace('.',',')+';'+eu(y)).join('\n')+'\n\nSignal: DAD1 B\nTime (min);mAU\n'+big.map(([t,y])=>t.toFixed(3).replace('.',',')+';'+eu(y/3)).join('\n')+'\n',
  migliaia: 'Time (min);mAU\n'+big.map(([t,y])=>t.toFixed(3).replace('.',',')+';'+eu(y)).join('\n')+'\n',
  treColonne: 'Time (min)\tmAU 254nm\tmAU 320nm\n'+cA.map(([t,y])=>t.toFixed(4)+'\t'+y.toFixed(4)+'\t'+(y/3).toFixed(4)).join('\n')+'\n',
  yScelta: 'Time (min)\tPressure (bar)\tSignal (mAU)\n'+cA.map(([t,y],i)=>t.toFixed(4)+'\t'+(150+0.01*i).toFixed(2)+'\t'+y.toFixed(4)).join('\n')+'\n',
  ftirDue: ir.map(([x,y])=>x+'\t'+y.toFixed(5)).join('\n')+'\n\n'+ir.map(([x,y])=>x+'\t'+(y*0.5).toFixed(5)).join('\n')+'\n',
  s10: 'Time (min),Signal (mAU)\n'+fx(cA,',')+'\n\n'+fx(cB,','),
  attaccati: 'Time (min)\tmAU\n'+fx(cA)+'\n'+fx(cB)+'\n',
};
// carica i file nella pagina e restituisce lo stato degli avvisi; azioni: 'x' (clic sulla ×), 'esc'
async function load(p, list, opt){ opt=opt||{};
  return p.evaluate(async ([list,opt])=>{
    const T=[]; const ot=window.toast; window.toast=t=>{ T.push(String(t)); return ot(t); };
    if (opt.graph){ await new Promise(q=>setTimeout(q, Math.max(0,3100-performance.now()))); go(2); }   // dal grafico: il fumetto di Gino non si vede, il saluto diventa un toast
    await addEntries(list.map(([name,data])=>({file:new File([data],name), path:name}))); document.querySelectorAll('dialog[open]').forEach(d=>d.close());
    if (opt.wait) await new Promise(q=>setTimeout(q,opt.wait));
    const el=document.querySelector('#toast'), txt=()=>el.classList.contains('on')?(document.querySelector('#toastTxt')||el).textContent:'';   // (#toast da solo: la rc.3, per la prova che il test fallisce)
    const out={toasts:T, shown:txt(), err:el.classList.contains('on')&&el.classList.contains('err'), note:document.querySelector('#skipNote').innerText, files:files.map(f=>{ let dup=0; for (let i=1;i<f.xs.length;i++) if (f.xs[i]===f.xs[i-1]) dup++; return {name:f.name, n:f.xs.length, dup, issue:f.importIssue, peaks5:viewOf(f).peaks.filter(q=>q.x>4.8&&q.x<5.2).length}; }), xVisible:!!(document.querySelector('#toastX')||{}).offsetParent};
    if (opt.close){ out.after=[]; for (const a of opt.close){ if (a==='x'){ const b=document.querySelector('#toastX'); if (b) b.click(); } else document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); await new Promise(q=>setTimeout(q,400)); out.after.push(txt()); } }
    return out; }, [list, opt]);
}
let server, browser;
test.before(async ()=>{ server=await B.startServer(); browser=await B.launch(); });
test.after(async ()=>{ await browser.close(); server.close(); });
const page=async (o)=>{ const r=await B.openPage(browser, server, o||{}); return r; };

for (const desk of [false, true]){ const W=desk?'desktop':'online';
  // nel desktop (3.0.0) il ⛔ non si scrive: l'avviso grave è il toast rosso (classe err) e, nelle note, il segno tipografico ⊘
  const grave=(r,re,msg)=>{ if (desk){ assert.ok(r.err, 'toast non rosso: '+(msg||r.shown)); assert.doesNotMatch(r.shown, /\p{Extended_Pictographic}/u, r.shown); assert.match(r.shown, re, msg||r.shown); } else assert.match(r.shown, new RegExp('^⛔ '+re.source), msg||r.shown); };
  const MARK=desk?'⊘':'⛔';
  test(`${W}: canale e migliaia nello stesso file, il toast dice il ⛔ (migliaia), non il canale`, async ()=>{
    const {ctx,p,errors}=await page({desk}); const r=await load(p, [['DAD.csv',F.canaleMigliaia]]);
    grave(r, /.*migliaia/); assert.doesNotMatch(r.shown, /canale/);
    assert.match(r.note, new RegExp(MARK+' Da controllare'), 'la nota di importazione perde il ⛔: '+r.note); assert.deepStrictEqual(errors, []); await ctx.close(); });
  test(`${W}: «altre colonne» non copre il ⛔ delle migliaia; × ed Esc chiudono, poi tocca all'avviso in coda`, async ()=>{
    const {ctx,p,errors}=await page({desk}); const r=await load(p, [['M.csv',F.migliaia],['C3.txt',F.treColonne]], {close:['x','esc']});
    grave(r, /\S/, 'in vista: '+r.shown); assert.ok(r.xVisible, 'manca il pulsante per chiudere');
    assert.match(r.after[0], /altre colonne/, 'dopo la ×: '+r.after[0]); assert.equal(r.after[1], '', 'Esc non chiude l\'avviso');
    assert.match(r.note, desk ? /△ In questo file ci sono altre colonne/ : /⚠️? In questo file ci sono altre colonne/); assert.deepStrictEqual(errors, []); await ctx.close(); });
  test(`${W}: file aggiunti stando sul grafico, «Acchiappati» non sostituisce l'avviso`, async ()=>{
    const {ctx,p,errors}=await page({desk}); await load(p, [['A.txt',F.treColonne.split('\n').map(l=>l.split('\t').slice(0,2).join('\t')).join('\n')]]);
    const r=await load(p, [['M.csv',F.migliaia],['B.txt',F.yScelta]], {graph:true, wait:300});
    grave(r, /.*migliaia/, 'in vista: '+r.shown); assert.deepStrictEqual(errors, []); await ctx.close(); });
  test(`${W}: con la colonna Y già scelta niente «uso solo le prime due»`, async ()=>{
    const {ctx,p,errors}=await page({desk}); const r=await load(p, [['Y.txt',F.yScelta]]);
    assert.ok(!r.toasts.some(t=>/prime due|altre colonne/.test(t)), r.toasts.join(' | ')); assert.doesNotMatch(r.note, /altre colonne/); assert.deepStrictEqual(errors, []); await ctx.close(); });
  test(`${W}: due scansioni FTIR non sono «un secondo canale»; blocchi senza testo in mezzo non uniti (s10, attaccati)`, async ()=>{
    const {ctx,p,errors}=await page({desk}); const r=await load(p, [['FTIR.txt',F.ftirDue]]);
    assert.match(r.shown, /secondo blocco di dati/, r.shown); assert.doesNotMatch(r.shown, /canale/);
    assert.equal(r.files[0].n, 1801); assert.equal(r.files[0].issue.after, 1801);
    const {ctx:c2,p:p2}=await page({desk}); const h=await load(p2, [['S_DAD.csv',F.s10],['ATT.txt',F.attaccati]]);
    for (const f of h.files){ assert.equal(f.n, 3000, f.name); assert.equal(f.dup, 0, f.name+': x ripetute'); assert.ok(f.issue && f.issue.channel, f.name+': secondo blocco non segnalato'); assert.equal(f.peaks5, 1, f.name+': picchi intorno a 5 min'); }
    assert.match(h.toasts.join(' '), /più di un canale: ho letto/, 'HPLC: il secondo blocco è un canale e l\'avviso dice quale è stato letto'); assert.deepStrictEqual(errors, []); await ctx.close(); await c2.close(); });
}
test('inglese: testi degli avvisi tradotti, ⛔ in testa', async ()=>{
  const {ctx,p,errors}=await page({lang:'en'}); const r=await load(p, [['DAD.csv',F.canaleMigliaia]]);
  assert.match(r.shown, /^⛔ thousands separators in «DAD\.csv»: numbers may be wrong\. See «Data check»\./, r.shown); assert.match(r.note, /⛔ To check/, r.note);
  const {ctx:c2,p:p2}=await page({lang:'en'}); const q=await load(p2, [['FTIR.txt',F.ftirDue],['M.csv',F.migliaia]]);
  assert.match(q.toasts.join(' | '), /contains a second block of data|thousands separators/); assert.match(q.shown, /\(and 1 more file\)/, 'plurale inglese: '+q.shown);
  assert.deepStrictEqual(errors, []); await ctx.close(); await c2.close(); });
