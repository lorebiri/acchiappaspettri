// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Concentrazione da una taratura salvata in libreria (docs/SPEC-TARATURA-SALVATA.md): parte pura, senza pagina.
   Mai un numero senza dire come è stato ottenuto: ogni esito porta il modo (senza controllo, 1 o 2 controlli, RRF),
   la provenienza (libreria, voce, data della taratura) oppure il motivo per cui il numero non c'è.
   Funziona nella pagina (window.AcchStoredCal) e in Node (require), per i test. */
(function(root, factory){
  const api=factory();
  if (typeof module==='object' && module.exports) module.exports=api;
  else root.AcchStoredCal=api;
})(typeof self!=='undefined' ? self : this, function(){
  'use strict';
  const QUANT={ricerca:true, esplorativa:true, impurezze:'rrf', dosaggio:false, tracce:false, bioanalisi:false};
  const DEF={ricerca:{dev:10, diff:5, drift:5}, esplorativa:{dev:15, diff:8, drift:null}};
  const BETWEEN_DAYS=0.05;   // componente tra i giorni predefinita (5%), dichiarata quando non c'è la carta di controllo
  const CHART_MIN=10, CHART_ACTION=3.5;   // vedi chartCheck: 3,5 s invece di 3 s con limiti stimati da 10 serie

  /* t di Student (quantile a due code 97,5%) per i gradi di libertà dell'intercetta: tabella breve, oltre 30 → 1,96 */
  const T975=[NaN,12.706,4.303,3.182,2.776,2.571,2.447,2.365,2.306,2.262,2.228,2.201,2.179,2.160,2.145,2.131,2.120,2.110,2.101,2.093,2.086,2.080,2.074,2.069,2.064,2.060,2.056,2.052,2.048,2.045,2.042];
  const t975=df=>df>=1 && df<=30 ? T975[Math.round(df)] : 1.96;

  function days(from, to){ const a=Date.parse(String(from).slice(0,10)), b=Date.parse(String(to).slice(0,10)); return isFinite(a)&&isFinite(b) ? Math.round((b-a)/86400000) : null; }
  const fmtDate=d=>{ const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(d||'')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
  /* fattore che porta l'area dell'app nell'unità della voce: x del cromatogramma in minuti → area in «… × min» */
  const Lib0=u=>String(u||'').toLowerCase().replace(/[\s·*×]+/g,'');
  function areaFactor(appUnit, entryUnit){
    const t=u=>{ const s=String(u||'').toLowerCase().replace(/\s+/g,''); if (!s) return null; if (/(·|\*|×|x)?(s|sec)$/.test(s) && !/min$/.test(s)) return 's'; if (/min$/.test(s)) return 'min'; return null; };
    const same=Lib0(appUnit)===Lib0(entryUnit) && Lib0(entryUnit)!=='';
    const a=t(appUnit), e=t(entryUnit); if (same) return {f:1}; if (!e) return {f:1, assumed:true}; if (!a) return null; if (a===e) return {f:1}; if (a==='min' && e==='s') return {f:60}; if (a==='s' && e==='min') return {f:1/60}; return null; }

  /* intercetta non significativa: IC 95% che contiene 0, oppure |a| ≤ 2% della risposta al livello del controllo */
  function interceptNegligible(cal, yc){ const a=cal.intercept||0; if (a===0) return true; if (yc!=null && Math.abs(a)<=0.02*Math.abs(yc)) return true;
    if (cal.sa!=null && cal.sa>0){ const t=t975(cal.df || (cal.n ? cal.n-2 : 30)); return Math.abs(a)<=t*cal.sa; } return false; }

  /* carta di controllo: k di ogni serie. Attiva da 10 serie; limiti (media, s) dalle prime 10.
     Regole di Westgard: 1_3s blocca, 2_2s avvisa. Con limiti stimati da sole 10 serie la 1_3s darebbe l'1,7% di falsi allarmi per serie
     (simulazione nel test T3): qui il limite d'azione è 3,5 s (0,8%), valore da confermare dal Capo Progetto (rapporto I4). */
  function chartCheck(ks, opt){
    opt=opt||{}; const L=(ks||[]).filter(Number.isFinite), act=opt.action||CHART_ACTION;
    if (L.length<=CHART_MIN) return {active:false, n:L.length};
    const base=L.slice(0,CHART_MIN), m=base.reduce((a,b)=>a+b,0)/CHART_MIN, s=Math.sqrt(base.reduce((a,b)=>a+(b-m)**2,0)/(CHART_MIN-1));
    const z=L.slice(CHART_MIN).map(k=>s>0?(k-m)/s:0), last=z[z.length-1], prev=z.length>1?z[z.length-2]:null;
    const r13=Math.abs(last)>act, r22=prev!=null && ((last>2 && prev>2) || (last<-2 && prev<-2));
    return {active:true, n:L.length, mean:m, sd:s, z:last, block:r13, warn:!r13 && r22, rule:r13?'1_3s':r22?'2_2s':null};
  }

  /* incertezza estesa (k = 2), SPEC «Incertezza»:
     U = 2·x·√( s_r²·(1/m_c + 1/m_k) + u_std² + (s_a/b)²·(1/x − 1/x_c)² )
     s_r relativa: dalla carta (≥ 10 serie) oppure s_y/x della taratura alla risposta del campione; senza controllo m_c = ∞ e si aggiunge
     la componente tra i giorni (5% o dalla carta), sempre dichiarata. u_std relativa dello standard di controllo (0 se manca, dichiarato). */
  function uncertainty(o){
    const x=o.x, b=o.b; if (!(x>0) || !b) return null;
    const terms={}; let sr=o.sr, from=sr!=null?(o.srFrom||'given'):null; if (sr==null && o.syx!=null && o.y){ sr=Math.abs(o.syx/o.y); from='syx'; }
    // voce della letteratura senza s_y/x: la deviazione standard relativa della pendenza della fonte, dichiarata
    if (sr==null && o.sb!=null && o.b){ sr=Math.abs(o.sb/o.b); from='slope-sd'; }
    if (sr==null) return null;
    const inv=v=>v>0&&isFinite(v)?1/v:0, mc=o.mc, mk=o.mk||1;
    terms.rep=sr*sr*(inv(mc)+inv(mk));
    terms.std=(o.uStd||0)**2;
    const xc=o.xc; terms.int=o.sa!=null ? (o.sa/b)**2*Math.pow(1/x-(xc>0?1/xc:0),2) : 0;
    terms.days=o.noControl ? Math.pow(o.betweenDays!=null?o.betweenDays:BETWEEN_DAYS,2) : 0;
    const rel=Math.sqrt(terms.rep+terms.std+terms.int+terms.days);
    return {U:2*x*rel, rel, sr, from, terms, uStdMissing:!(o.uStd>0), betweenDays:o.noControl ? (o.betweenDays!=null?o.betweenDays:BETWEEN_DAYS) : null};
  }

  /* ripetibilità relativa per l'incertezza, dagli standard della taratura: con repliche, l'errore puro relativo (scarti dalla media di ogni livello,
     gradi di libertà n − livelli); senza repliche, i residui relativi della retta (n − 2). Con il modello a CV costante dell'HPLC la copertura di U95
     resta tra il 93 e il 97% (test T2); i residui relativi di una retta non pesata la sovrastimano (≈ 97,5%). */
  function relRepeatability(pts, a, b){
    const P=(pts||[]).filter(p=>p && isFinite(p.x) && isFinite(p.y)); if (P.length<3) return null;
    const lv=new Map(); for (const p of P){ const k=+(+p.x).toPrecision(9); if (!lv.has(k)) lv.set(k,[]); lv.get(k).push(p.y); }
    let ss=0, df=0; for (const v of lv.values()){ if (v.length<2) continue; const m=v.reduce((s,y)=>s+y,0)/v.length; if (!(m>0)) continue; for (const y of v) ss+=Math.pow((y-m)/m,2); df+=v.length-1; }
    if (df>=2) return Math.sqrt(ss/df);
    if (a==null || b==null) return null; ss=0; for (const p of P){ const yh=a+b*p.x; if (!(yh>0)) return null; ss+=Math.pow((p.y-yh)/yh,2); } return Math.sqrt(ss/(P.length-2)); }
  /* risposta prevista dalla retta salvata e concentrazione corretta con k: x = (y/k − a)/b */
  const predY=(cal,x)=>(cal.kind==='rf' ? 0 : (cal.intercept||0))+cal.slope*x;
  const toX=(cal,y,k)=>((y/k)-(cal.kind==='rf'?0:(cal.intercept||0)))/cal.slope;

  /* o = {entry, lib, profile, today, y (area nell'unità della voce), sampleYs: [risposte di tutti i campioni della serie],
          controls:[{nominal, y, tR, order, pos:'open'|'close'}], check:{channel, method, instrument, column} (esiti dei confronti),
          normalized, suitability (true/false/null), sampleOrder, activeRF (impurezze), uStd, sr (dalla carta), lang}
     → {ok, x, U, mode, k, devs, drift, age, provenance, status, reason, code, warnings} */
  function quantify(o){
    const e=o.entry||{}, cal=e.cal, lib=o.lib||{}, profile=o.profile || e.profile || lib.profile || 'ricerca', thr=Object.assign({}, DEF[profile]||DEF.ricerca, lib.thresholds||{});
    const today=o.today || new Date().toISOString().slice(0,10), age=cal&&cal.date ? days(cal.date, today) : null, rem=lib.reminderDays||180;
    const prov={library:lib.name||'', libraryId:lib.id||'', revision:lib.revision||null, entry:e.name||'', entryId:e.id||'', entryRev:e.rev||null, calDate:cal?cal.date||'':'', age, profile, standardLot:cal?cal.standardLot||'':'', source:cal?cal.source||'':''};
    const res={ok:false, x:null, U:null, mode:null, k:null, devs:[], drift:null, age, provenance:prov, warnings:[], profile, thresholds:thr};
    const block=(code, detail)=>Object.assign(res, {ok:false, code, detail:detail||null});
    if (!cal || !(cal.slope || cal.rrf)) return block('no-calibration');
    const q=QUANT[profile]; if (q===false) return block('profile');
    if (o.normalized || cal.normalized) return block('normalized');
    const ck=o.check||{};
    for (const k of ['channel','method','instrument','column']) if (ck[k] && ck[k].ok===false) return block(k, ck[k].detail||null);
    if (ck.channel && ck.channel.unverified && ck.channel.unverified.length) res.warnings.push({code:'channel-unverified', detail:ck.channel.unverified});
    for (const k of ['method','column']) if (ck[k] && ck[k].unverified) res.warnings.push({code:k+'-unverified'});
    if (o.areaUnitAssumed) res.warnings.push({code:'area-unit-assumed', detail:cal.areaUnit||''});
    // manutenzione registrata dopo la data della taratura: invalida le tarature salvate di quello strumento o colonna
    const mt=(lib.maintenance||[]).find(m=>cal.date && m.date>cal.date && (!m.target || !e.column || m.target===e.column || /lamp|lampada|cella|cell|strument/i.test(m.kind||'')));
    if (mt) return block('maintenance', mt.date);
    if (o.suitability===false) return block('suitability');
    if (age!=null && age>rem) res.warnings.push({code:'reminder', detail:rem});
    if (profile==='esplorativa') res.warnings.push({code:'exploratory'});
    const y=o.y; if (!(isFinite(y))) return block('no-response');
    // controlli del giorno validi: valore nominale e risposta; tR dentro la finestra della voce
    const ctr=(o.controls||[]).filter(c=>c && c.nominal>0 && isFinite(c.y));
    for (const c of ctr) if (c.tR!=null && e.x!=null && e.window!=null && Math.abs(c.tR-e.x)>e.window) return block('ctrl-window', c.tR);

    if (q==='rrf'){ // impurezze: RRF salvato riferito al principio attivo misurato oggi
      const rrf=cal.rrf; if (!(rrf>0)) return block('no-rrf'); if (!(o.activeRF>0)) return block('no-active-rf');
      if (o.impurityStd && o.impurityStd.nominal>0 && isFinite(o.impurityStd.y)){ const dv=100*(o.impurityStd.y/(rrf*o.activeRF*o.impurityStd.nominal)-1); res.devs.push(dv); if (Math.abs(dv)>10) return block('ctrl-dev', {dev:dv, thr:10}); }
      res.x=y/(rrf*o.activeRF); res.mode='rrf'; res.k=null; res.ok=true; res.code='ok';
      const U=uncertainty({x:res.x, b:rrf*o.activeRF, y, syx:cal.syx, sr:o.sr, mc:1, mk:1, uStd:o.uStd||cal.uStd, noControl:false}); res.U=U?U.U:null; res.u=U; return res; }

    const xs=[];   // concentrazioni dei campioni della serie (per le regole sui due controlli)
    let k=1, mode='nocontrol', drift=null;
    if (!ctr.length){
      if (profile!=='ricerca') return block('no-control');
      mode='nocontrol';
    } else {
      const R=ctr.map(c=>{ const yp=predY(cal, c.nominal); return Object.assign({}, c, {yp, k:c.y/yp}); });
      for (const c of R){ const dv=100*(c.k-1); res.devs.push(dv); if (Math.abs(dv)>thr.dev) return block('ctrl-dev', {dev:dv, thr:thr.dev}); }
      // apertura e chiusura: deriva e k interpolato nell'ordine di iniezione
      const op=R.filter(c=>c.pos==='open'), cl=R.filter(c=>c.pos==='close');
      if (op.length && cl.length){ const ko=op.reduce((a,c)=>a+c.k,0)/op.length, kc=cl.reduce((a,c)=>a+c.k,0)/cl.length; drift=100*(kc/ko-1); res.drift=drift;
        if (thr.drift!=null && Math.abs(drift)>thr.drift) return block('drift', {drift, thr:thr.drift}); }
      const ordered=R.filter(c=>Number.isFinite(c.order));
      if (ordered.length && Number.isFinite(o.sampleOrder)){ const all=ordered.map(c=>c.order).concat([o.sampleOrder]).sort((a,b)=>a-b); for (let i=1;i<all.length;i++) if (all[i]-all[i-1]>20) return block('frequency'); }
      const lv=[...new Set(R.map(c=>+c.nominal.toPrecision(6)))];
      if (lv.length===1){
        const c=R[0], need=[];
        if (!interceptNegligible(cal, c.yp)) need.push('intercept');
        const Ys=(o.sampleYs&&o.sampleYs.length?o.sampleYs:[y]).filter(Number.isFinite);
        if (Ys.some(v=>v<0.5*c.y || v>2*c.y)) need.push('span-control');
        Ys.forEach(v=>xs.push(toX(cal, v, c.k)));
        const rg=cal.range; if (xs.length>1){ const mx=Math.max(...xs), mn=Math.min(...xs); if (mn>0 && mx/mn>5) need.push('span5'); }
        if (rg && xs.some(v=>v<rg[0]+0.25*(rg[1]-rg[0]))) need.push('low25');
        if (need.length) return block('need-two', need);
        k=R.reduce((a,c)=>a+c.k,0)/R.length; mode='1ctrl';
      } else {
        const lo=R.filter(c=>c.nominal===Math.min(...R.map(q=>q.nominal))), hi=R.filter(c=>c.nominal===Math.max(...R.map(q=>q.nominal)));
        const kl=lo.reduce((a,c)=>a+c.k,0)/lo.length, kh=hi.reduce((a,c)=>a+c.k,0)/hi.length, diff=100*Math.abs(kh-kl)/((kh+kl)/2); res.ctrlDiff=diff;
        if (diff>thr.diff) return block('incoherent', {diff, thr:thr.diff});
        k=(kl+kh)/2; mode='2ctrl'; }
      if (op.length && cl.length && Number.isFinite(o.sampleOrder) && op.every(c=>Number.isFinite(c.order)) && cl.every(c=>Number.isFinite(c.order))){
        const to=op.reduce((a,c)=>a+c.order,0)/op.length, tc=cl.reduce((a,c)=>a+c.order,0)/cl.length, ko=op.reduce((a,c)=>a+c.k,0)/op.length, kc=cl.reduce((a,c)=>a+c.k,0)/cl.length;
        if (tc>to) k=ko+(kc-ko)*Math.min(1,Math.max(0,(o.sampleOrder-to)/(tc-to))); }
      // carta di controllo della voce: il k di oggi contro le serie precedenti
      const ch=chartCheck((e.chart||[]).map(p=>p.k).concat([k])); res.chart=ch;
      if (ch.active && ch.block) return block('chart', {z:ch.z});
      if (ch.active && ch.warn) res.warnings.push({code:'chart-warn'});
      res.nCtrl=R.length; res.xc=R.length===1||lv.length===1?R[0].nominal:null;
    }
    const x=toX(cal, y, k); res.k=mode==='nocontrol'?null:k; res.mode=mode;
    if (cal.range){ const tol=1e-9*Math.max(1,Math.abs(cal.range[1])); if (x<cal.range[0]-tol || x>cal.range[1]+tol) return block('range', {x, range:cal.range}); }
    else res.warnings.push({code:'range-unknown'});
    if (cal.lod!=null && x<cal.lod) res.belowLod=true; else if (cal.loq!=null && x<cal.loq) res.belowLoq=true;
    res.x=x; res.ok=true; res.code='ok';
    // s_r: dalla carta (≥ 10 serie) con i controlli; senza controllo la carta dà la componente tra i giorni e s_r viene da s_y/x
    const csd=e.chart&&e.chart.length>=CHART_MIN ? chartSd(e.chart) : null, noc=mode==='nocontrol';
    // s_r relativa: carta di controllo (con i controlli), poi la ripetibilità relativa della taratura salvata (srel), poi s_y/x alla risposta del campione
    const sr=o.sr!=null ? o.sr : (!noc && csd!=null ? csd : (cal.srel!=null ? cal.srel : null));
    const U=uncertainty({x, b:cal.slope, sb:cal.sb, y:y/k, syx:cal.syx, sr, srFrom:o.sr!=null?'given':(!noc && csd!=null)?'chart':'srel', sa:cal.kind==='rf'?null:cal.sa, xc:res.xc, mc:noc?Infinity:(res.nCtrl||1), mk:o.mk||1, uStd:o.uStd!=null?o.uStd:cal.uStd, noControl:noc, betweenDays:noc&&csd!=null?csd:null});
    res.u=U; res.U=U?U.U:null;
    if (!U) res.warnings.push({code:'no-uncertainty'});
    else if (U.from==='slope-sd') res.warnings.push({code:'u-slope-sd'});
    if (U && U.uStdMissing) res.uStdMissing=true;
    return res;
  }
  function chartSd(chart){ const L=chart.map(p=>p.k).filter(Number.isFinite).slice(0,CHART_MIN); if (L.length<CHART_MIN) return null; const m=L.reduce((a,b)=>a+b,0)/L.length; return Math.sqrt(L.reduce((a,b)=>a+(b-m)**2,0)/(L.length-1))/m; }

  /* ---------- testi (SPEC «Messaggi»), in italiano e in inglese ---------- */
  const N=(v,d,en)=>{ if (v==null || !isFinite(v)) return ''; const s=(+v).toFixed(d); return en ? s : s.replace('.',','); };
  const sgn=(v,en)=>(v>0?'+':v<0?'−':'')+N(Math.abs(v),1,en)+'%';
  const REASON={
    'no-control':['controllo assente','no control'], 'ctrl-dev':['controllo fuori soglia','control outside the limit'], 'drift':['deriva','drift'], 'incoherent':['controlli non coerenti','inconsistent controls'],
    'channel':['canale diverso da quello della taratura','channel different from the calibration'], 'method':['metodo diverso da quello della taratura','method different from the calibration'], 'instrument':['strumento diverso da quello della taratura','instrument different from the calibration'], 'column':['colonna diversa da quella della taratura','column different from the calibration'],
    'range':['fuori intervallo','outside the range'], 'profile':['profilo che non ammette tarature salvate','profile that does not allow saved calibrations'], 'chart':['carta di controllo: limite di azione superato','control chart: action limit exceeded'],
    'maintenance':['manutenzione registrata dopo la taratura','maintenance recorded after the calibration'], 'normalized':['dati normalizzati o in derivata','normalised or derivative data'], 'suitability':['idoneità del sistema non superata','system suitability failed'],
    'need-two':['servono due controlli (basso e alto)','two controls are needed (low and high)'], 'frequency':['controlli troppo radi (almeno uno ogni 20 campioni)','controls too sparse (at least one every 20 samples)'], 'ctrl-window':['tR del controllo fuori dalla finestra della voce','control tR outside the entry window'],
    'no-calibration':['la voce non ha una taratura salvata','the entry has no saved calibration'], 'no-response':['picco non trovato nella finestra di tR','peak not found in the tR window'], 'no-rrf':['la voce non ha un RRF salvato','the entry has no saved RRF'], 'no-active-rf':['manca il fattore di risposta del principio attivo misurato oggi','the response factor of the active ingredient measured today is missing'],
    'area-unit':['unità dell\'area diversa da quella della taratura','area unit different from the calibration']};
  const NEED={intercept:['intercetta significativa','significant intercept'], 'span-control':['campioni fuori da 0,5–2 volte la risposta del controllo','samples outside 0.5–2 times the control response'], span5:['campioni che coprono più di un fattore 5','samples spanning more than a factor of 5'], low25:['campioni sotto il 25% dell\'intervallo','samples below 25% of the range']};
  function reasonText(r, en){
    const i=en?1:0, d=r.detail, base=(REASON[r.code]||[r.code,r.code])[i];
    if (r.code==='ctrl-dev' && d) return `${base} (${sgn(d.dev,en)} ${en?'on':'su'} ±${N(d.thr,0,en)}%)`;
    if (r.code==='drift' && d) return `${base} ${N(Math.abs(d.drift),1,en)}% ${en?'on':'su'} ${N(d.thr,0,en)}%`;
    if (r.code==='incoherent' && d) return `${base} (${N(d.diff,1,en)}% ${en?'on':'su'} ${N(d.thr,0,en)}%)`;
    if (r.code==='need-two' && Array.isArray(d)) return `${base}: ${d.map(k=>(NEED[k]||[k,k])[i]).join(', ')}`;
    if (r.code==='range' && d) return `${base} (${N(d.x,3,en)} ${en?'outside':'fuori da'} ${N(d.range[0],3,en)}–${N(d.range[1],3,en)})`;
    if (r.code==='maintenance' && d) return `${base} (${fmtDate(d)})`;
    if (typeof d==='string' && d && ['channel','method','instrument','column'].includes(r.code)) return `${base}: ${d}`;
    return base; }
  const MODE={nocontrol:['salvata senza controllo','saved without control'], '1ctrl':['salvata + 1 controllo','saved + 1 control'], '2ctrl':['salvata + 2 controlli','saved + 2 controls'], rrf:['RRF','RRF']};
  const MARK=['senza controllo del giorno','without a same-day control'];
  /* frase di stato da mostrare accanto al numero, uguale a schermo, nel CSV e nel PDF */
  function statusText(r, lang){
    const en=lang==='en', p=r.provenance||{}, dt=fmtDate(p.calDate), ag=p.age!=null?(en?`age ${p.age} days`:`età ${p.age} giorni`):(en?'age unknown':'età non nota');
    if (!r.ok){ if (r.code==='profile') return en?`Saved calibration not used: the ${p.profile} profile requires a same-day line (for comparison only).`:`Taratura salvata non usata: il profilo ${p.profile} richiede la retta del giorno (solo confronto).`;
      return en?`Calibration not verified today: ${reasonText(r,true)}. Measure a same-day line.`:`Taratura non verificata oggi: ${reasonText(r,false)}. Misura una retta del giorno.`; }
    if (r.mode==='nocontrol') return en?`Saved calibration of ${dt} (${ag}), without a same-day control: an instrument drift would not be seen. A control is recommended.`:`Taratura salvata del ${dt} (${ag}), senza controllo del giorno: una deriva dello strumento non verrebbe vista. Consigliato un controllo.`;
    if (r.mode==='rrf') return en?`Saved RRF of ${dt} (${ag}) on the response factor of the active ingredient measured today.`:`RRF salvato del ${dt} (${ag}) sul fattore di risposta del principio attivo misurato oggi.`;
    const n=r.mode==='2ctrl'?2:1, dv=r.devs.map(v=>sgn(v,en)).join(' / ');
    return (en?`Saved calibration of ${dt} (${ag}), updated today with ${n} control${n>1?'s':''}; deviations ${dv}`:`Taratura salvata del ${dt} (${ag}), aggiornata oggi con ${n} controll${n>1?'i':'o'}; scostamenti ${dv}`)+(r.drift!=null?(en?`; drift ${N(Math.abs(r.drift),1,true)}%`:`; deriva ${N(Math.abs(r.drift),1,false)}%`):'')+'.';
  }
  const WARN={'reminder':['Promemoria: taratura di oltre {0} giorni.','Reminder: calibration older than {0} days.'], 'exploratory':['Stima esplorativa.','Exploratory estimate.'], 'chart-warn':['Carta di controllo: regola 2_2s, da tenere d\'occhio.','Control chart: 2_2s rule, keep an eye on it.'],
    'channel-unverified':['Ampiezza di banda o riferimento non dichiarati nel file: non verificati.','Bandwidth or reference not stated in the file: not verified.'], 'method-unverified':['Metodo non dichiarato nel file: non verificato.','Method not stated in the file: not verified.'], 'column-unverified':['Colonna non dichiarata nel file: non verificata.','Column not stated in the file: not verified.'],
    'range-unknown':['Intervallo della taratura non dichiarato: un\'estrapolazione non si può escludere.','Calibration range not stated: extrapolation cannot be ruled out.'], 'area-unit-assumed':['Unità dell\'area della voce assunta: {0}.','Entry area unit assumed: {0}.'], 'u-slope-sd':['Incertezza dalla deviazione standard della pendenza della fonte (s_y/x non dichiarato) più il 5% tra i giorni.','Uncertainty from the source slope standard deviation (s_y/x not stated) plus 5% between days.'], 'no-uncertainty':['Incertezza non calcolabile: la voce non ha s_y/x né una carta di controllo.','Uncertainty not computable: the entry has neither s_y/x nor a control chart.']};
  function warningTexts(r, lang){ const i=lang==='en'?1:0; return (r.warnings||[]).map(w=>{ const t=(WARN[w.code]||[w.code,w.code])[i]; return t.replace('{0}', w.detail!=null?String(w.detail):''); }); }
  function modeText(r, lang){ return r.ok ? (MODE[r.mode]||['',''])[lang==='en'?1:0] : (lang==='en'?'not verified':'non verificata'); }
  function markText(lang){ return MARK[lang==='en'?1:0]; }
  /* riga di provenienza: libreria, voce, data della taratura (REQUISITO punto 3) */
  function provenanceText(r, lang){ const p=r.provenance||{}, en=lang==='en';
    return `${en?'library':'libreria'} «${p.library}»${p.revision?` rev. ${p.revision}`:''} · ${en?'entry':'voce'} «${p.entry}»${p.entryRev?` rev. ${p.entryRev}`:''} · ${en?'calibration of':'taratura del'} ${fmtDate(p.calDate)||(en?'unknown date':'data non nota')}${p.source==='letteratura'?(en?' (literature)':' (letteratura)'):''}`; }

  return {relRepeatability, QUANT, DEF, BETWEEN_DAYS, CHART_MIN, CHART_ACTION, quantify, uncertainty, chartCheck, interceptNegligible, areaFactor, statusText, reasonText, warningTexts, modeText, markText, provenanceText, fmtDate, days, predY, toX, REASON};
});
