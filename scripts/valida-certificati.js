// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Validazione con materiali certificati: per ogni cartella di validazione/certificati/ che contiene uno spettro, il certificato
   (certificato.csv) e i metadati (metadati.json), fa girare il nucleo dell'app e confronta i risultati con i valori certificati.
   Istruzioni per chi usa lo script: validazione/certificati/README.md.
   Uso:  node scripts/valida-certificati.js [cartella] [--uscita cartella] [--criteri file.json]
   Esce con codice 0 anche se un campione non supera i criteri (è un rapporto, non un test); 2 se non trova nulla da validare. */
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..');
const PymcaCfg=require(path.join(ROOT,'app','pymca-cfg-core.js'));
const DIR_DEF=path.join(ROOT,'validazione','certificati');

/* ---------------- criteri di accettazione (validazione/certificati/criteri.json, tutti modificabili) ---------------- */
const CRITERI_DEF={
  // fasce sul valore certificato (% in peso): errore relativo massimo ammesso; «segnala» = solo riportato, non valutato
  fasce:[{da:1, a:null, errore_rel_max:10}, {da:0.1, a:1, errore_rel_max:25}, {da:0, a:0.1, segnala:true}],
  zeta_max:2,                      // ζ = |x − ref| / √(u² + u_ref²), u_ref = U/k
  combinazione:'e',                // 'e': servono errore e ζ; 'o': basta uno dei due; 'errore': conta solo l'errore relativo
  incertezza_modello_rel:5,        // % relativa (incertezza tipo) sommata in quadratura all'incertezza di conteggio dell'app
  k_predefinito:2,                 // fattore di copertura se il certificato non lo dice
  tipi_valutati:['certificato']    // gli altri tipi (indicativo, informativo, per_differenza) sono solo riportati
};
function caricaCriteri(file){
  let c={}; if (file && fs.existsSync(file)){ const raw=JSON.parse(fs.readFileSync(file,'utf8')); for (const k of Object.keys(raw)) if (!k.startsWith('_')) c[k]=raw[k]; }
  const out=Object.assign({}, CRITERI_DEF, c);
  if (!Array.isArray(out.fasce) || !out.fasce.length) throw new Error('criteri: «fasce» deve essere una lista');
  if (!['e','o','errore'].includes(out.combinazione)) throw new Error('criteri: «combinazione» vale "e", "o" oppure "errore"');
  return out;
}
const fasciaDi=(ref, cr)=>cr.fasce.find(f=>ref>=(f.da||0) && (f.a==null || ref<f.a)) || null;

/* ---------------- certificato (CSV) ---------------- */
const UNITA={'%':1, '%m/m':1, '% m/m':1, '%w/w':1, '% w/w':1, 'wt%':1, '%wt':1, '% in peso':1, '%peso':1, 'g/100g':1, 'g/100 g':1, 'cg/g':1,
  'mg/kg':1e-4, 'ppm':1e-4, 'µg/g':1e-4, 'μg/g':1e-4, 'ug/g':1e-4, 'mg/g':0.1, 'g/kg':0.1, 'ppb':1e-7, 'µg/kg':1e-7, 'μg/kg':1e-7, 'ug/kg':1e-7};
const TIPI={certificato:'certificato', certified:'certificato', certificata:'certificato', indicativo:'indicativo', riferimento:'indicativo', reference:'indicativo', indicative:'indicativo',
  informativo:'informativo', informazione:'informativo', information:'informativo', info:'informativo', 'per differenza':'per_differenza', per_differenza:'per_differenza', differenza:'per_differenza', balance:'per_differenza'};
const COLONNE={elemento:'el', element:'el', analita:'el', analyte:'el', valore:'valore', value:'valore', 'frazione':'valore', incertezza:'U', u:'U', uncertainty:'U', 'incertezza estesa':'U',
  unita:'unita', 'unità':'unita', unit:'unita', units:'unita', tipo:'tipo', type:'tipo', k:'k', nota:'nota', note:'nota', fonte:'nota'};
function numIt(s, decComma){ s=String(s==null?'':s).trim().replace(/\s+/g,''); if (!s) return null; if (decComma) s=s.replace(/\./g,'').replace(',','.'); const v=Number(s); return Number.isFinite(v) ? v : NaN; }
function splitCsv(line, sep){ const out=[]; let cur='', q=false;
  for (let i=0;i<line.length;i++){ const ch=line[i]; if (ch==='"'){ if (q && line[i+1]==='"'){ cur+='"'; i++; } else q=!q; } else if (ch===sep && !q){ out.push(cur); cur=''; } else cur+=ch; }
  out.push(cur); return out.map(s=>s.trim()); }
// «Fe2O3» → frazione in peso di Fe nell'ossido; un simbolo da solo → 1
function elementoDi(s){ const a=PymcaCfg.formulaAtoms(String(s).trim()); if (!a) return null; const els=Object.keys(a); if (els.length===1) return {el:els[0], f:1, formula:s};
  const noO=els.filter(e=>e!=='O'); if (noO.length!==1) return null; const tot=els.reduce((t,e)=>t+a[e]*PymcaCfg.AW[e],0); return {el:noO[0], f:a[noO[0]]*PymcaCfg.AW[noO[0]]/tot, formula:s}; }
function parseCertificato(text){
  const avvisi=[], righe=[]; const lines=String(text).replace(/^﻿/,'').split(/\r\n|\r|\n/).filter(l=>l.trim() && !/^\s*#/.test(l));
  if (!lines.length) throw new Error('certificato vuoto');
  const sep=lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',', decComma=sep!==',';
  const head=splitCsv(lines[0], sep).map(h=>COLONNE[h.toLowerCase().replace(/[()]/g,'').trim()]||null);
  for (const need of ['el','valore']) if (!head.includes(need)) throw new Error('certificato: manca la colonna «'+(need==='el'?'elemento':'valore')+'» nella prima riga');
  const seen=new Set();
  for (let i=1;i<lines.length;i++){ const cells=splitCsv(lines[i], sep), r={}; head.forEach((h,j)=>{ if (h) r[h]=cells[j]==null?'':cells[j]; });
    const where='riga '+(i+1)+' ('+r.el+')';
    const e=elementoDi(r.el); if (!e){ avvisi.push(where+': elemento o ossido non riconosciuto, riga saltata'); continue; }
    const uni=String(r.unita||'%').trim().toLowerCase().replace('in massa','in peso'), fu=UNITA[uni];
    if (fu==null){ avvisi.push(where+': unità «'+r.unita+'» sconosciuta (ammesse: % in peso, mg/kg, ppm, µg/g, g/kg…), riga saltata'); continue; }
    let vs=String(r.valore||'').trim(), limite=null; const lm=/^([<>≤≥]=?)\s*(.*)$/.exec(vs); if (lm){ limite=lm[1]; vs=lm[2]; }
    const v=numIt(vs, decComma), U=numIt(r.U, decComma), k=numIt(r.k, decComma);
    if (!(v>=0)){ avvisi.push(where+': valore «'+r.valore+'» non numerico, riga saltata'); continue; }
    if (Number.isNaN(U)){ avvisi.push(where+': incertezza «'+r.U+'» non numerica, ignorata'); }
    const tipoRaw=String(r.tipo||'certificato').trim().toLowerCase(), tipo=TIPI[tipoRaw];
    if (!tipo) avvisi.push(where+': tipo «'+r.tipo+'» sconosciuto, trattato come «informativo»');
    if (seen.has(e.el)) avvisi.push(where+': elemento ripetuto, vale l\'ultima riga'); seen.add(e.el);
    const f=fu*e.f;
    const riga={el:e.el, valore:v*f, U:U>0 ? U*f : null, k:k>0 ? k : null, tipo:limite ? 'limite' : (tipo||'informativo'), limite, unita:r.unita||'%', valore_orig:r.valore, nota:r.nota||''};
    if (e.f!==1) riga.nota=(riga.nota?riga.nota+'; ':'')+'convertito da '+e.formula;
    const old=righe.findIndex(x=>x.el===e.el); if (old>=0) righe.splice(old,1); righe.push(riga);
  }
  return {righe, avvisi};
}

/* ---------------- confronto e criteri ---------------- */
// trovati: {El: {w: % in peso, sw: incertezza tipo di conteggio in %}}; fissi: elementi presi dal certificato (non valutati)
function valuta(righe, trovati, criteri, fissi){
  const cr=criteri||caricaCriteri(null), out=[]; fissi=fissi||{};
  for (const r of righe){
    const x=trovati[r.el], fa=fasciaDi(r.valore, cr), k=r.k||cr.k_predefinito, uRef=r.U!=null ? r.U/k : 0;
    const o={el:r.el, tipo:r.tipo, ref:r.valore, U:r.U, k, x:null, u:null, uConteggio:null, errRel:null, zeta:null, En:null, limiteErr:fa&&!fa.segnala ? fa.errore_rel_max : null, esito:'', motivo:''};
    if (fissi[r.el]!=null){ o.esito='fisso'; o.motivo='non misurato: preso dal certificato e tolto dalla normalizzazione'; o.limiteErr=null; out.push(o); continue; }
    if (x && Number.isFinite(x.w)){
      o.x=x.w; o.uConteggio=x.sw||0; o.u=Math.hypot(o.uConteggio, (cr.incertezza_modello_rel||0)/100*x.w);
      if (r.valore>0) o.errRel=100*(x.w-r.valore)/r.valore;
      const den=Math.hypot(o.u, uRef); o.zeta=den>0 ? Math.abs(x.w-r.valore)/den : null;
      const denE=Math.hypot(2*o.u, r.U||0); o.En=denE>0 ? Math.abs(x.w-r.valore)/denE : null;
    }
    if (r.tipo==='limite'){ o.esito='informazione'; o.motivo='il certificato dà solo un limite ('+r.limite+')'; }
    else if (!cr.tipi_valutati.includes(r.tipo)){ o.esito='informazione'; o.motivo='valore '+r.tipo.replace('_',' ')+': non entra nei criteri'; }
    else if (o.x==null){ o.esito='non trovato'; o.motivo='l\'elemento non è stato quantificato'; }
    else if (!fa || fa.segnala){ o.esito='segnalato'; o.motivo='sotto '+(fa&&fa.a!=null?String(fa.a).replace('.',',')+'%':'la soglia')+': riportato, non valutato'; }
    else {
      const okE=Math.abs(o.errRel)<=fa.errore_rel_max, okZ=o.zeta!=null ? o.zeta<=cr.zeta_max : null;
      const ok=cr.combinazione==='errore' ? okE : cr.combinazione==='o' ? (okE || okZ===true) : (okE && okZ!==false);
      o.esito=ok ? 'superato' : 'non superato';
      o.motivo=[!okE && 'errore oltre '+fa.errore_rel_max+'%', okZ===false && 'ζ oltre '+cr.zeta_max].filter(Boolean).join(', ') || (ok ? '' : 'criteri');
    }
    if (!['superato','non superato','non trovato'].includes(o.esito)) o.limiteErr=null;
    out.push(o);
  }
  const val=out.filter(o=>o.esito==='superato' || o.esito==='non superato' || o.esito==='non trovato');
  const sup=val.filter(o=>o.esito==='superato').length;
  return {righe:out, valutati:val.length, superati:sup, esito:!val.length ? 'niente da valutare' : sup===val.length ? 'superato' : 'non superato'};
}

/* ---------------- spettri ---------------- */
// SPE di PyMca/Maestro con più numeri per riga, MCA, tabelle a due colonne; per gli altri formati il lettore del nucleo (parseXRF)
function leggiSpettro(text, C){
  const t=String(text);
  if (/^\s*\$DATA:\s*$/m.test(t)){
    const after=t.split(/^\s*\$DATA:\s*$/m)[1], body=after.split(/^\s*\$[A-Z_]+:\s*$/m)[0], nums=body.trim().split(/\s+/).map(Number);
    if (nums.length>2 && nums.every(Number.isFinite)){ const first=nums[0], counts=nums.slice(2); let cal=null;
      const ef=/^\s*\$ENER_FIT:\s*\n\s*([-+\d.eE]+)\s+([-+\d.eE]+)/m.exec(t); if (ef && +ef[2]>0) cal={zero:+ef[1], gain:+ef[2]};
      return {ch:Float64Array.from(counts, (_,i)=>first+i), ys:Float64Array.from(counts), cal, keV:false, fmt:'SPE'}; }
  }
  const rows=t.split(/\r\n|\r|\n/).map(l=>l.trim()).filter(l=>/^[-+.\d]/.test(l)).map(l=>l.split(/[\s;,\t]+/).map(Number));
  if (rows.length>16 && rows.every(r=>r.length>=2 && Number.isFinite(r[0]) && Number.isFinite(r[1]))){
    const x=rows.map(r=>r[0]), sc=Math.max(...x)>200 ? 1e-3 : 1;
    return {xs:Float64Array.from(x, v=>v*sc), ys:Float64Array.from(rows.map(r=>r[1])), keV:true, fmt:'due colonne', xRaw:Float64Array.from(x)};
  }
  if (C && C.parseXRF){ const r=C.parseXRF(t); if (r){ const cal=r.xrf&&r.xrf.cal; return cal ? {xs:r.xs, ys:r.ys, keV:true, fmt:r.xrf.fmt, cal:{zero:cal.a, gain:cal.b, quad:cal.c}} : {ch:r.xs, ys:r.ys, keV:false, fmt:r.xrf.fmt, cal:null}; } }
  return null;
}

/* ---------------- condizioni di misura ---------------- */
const DENS_FILTRI={Al:2.70, Ti:4.51, Ni:8.91, Cu:8.96, Zr:6.51, Mo:10.28, Ag:10.49, Fe:7.874, Sn:7.31, Pd:12.02, Rh:12.41, Nb:8.57};
const ATM={aria:'air', air:'air', elio:'he', he:'he', helium:'he', vuoto:'vac', vac:'vac', vacuum:'vac'};
// oggetto per fpSetup: prima il .cfg di PyMca (se c'è), poi i metadati, che vincono
function setupDaMetadati(meta, neutro){
  const o=Object.assign({}, neutro ? neutro.setup : {}), m=meta||{}, av=[];
  const set=(k,v)=>{ if (v!=null && v!=='') o[k]=v; };
  set('anode', m.anodo); set('kv', m.kV!=null ? +m.kV : m.kv!=null ? +m.kv : null);
  if (m.angoli){ set('psi1', m.angoli.ingresso); set('psi2', m.angoli.uscita); }
  if (m.distanze_cm){ set('d1', m.distanze_cm.tubo_campione); set('d2', m.distanze_cm.campione_rivelatore); }
  if (m.atmosfera!=null){ const a=ATM[String(m.atmosfera).toLowerCase()]; if (a) o.atm=a; else av.push('atmosfera «'+m.atmosfera+'» sconosciuta (aria, elio, vuoto): resta '+(o.atm||'aria')); }
  if (m.rivelatore){ set('det', m.rivelatore.tipo); set('si', m.rivelatore.spessore_um); set('beD', m.rivelatore.finestra_Be_um); }
  set('beT', m.finestra_tubo_Be_um); set('eps', m.angolo_uscita_tubo);
  if (m.filtro===null || m.filtro==='nessuno') o.filt=null;
  else if (m.filtro && m.filtro.materiale){ const rho=m.filtro.densita!=null ? +m.filtro.densita : DENS_FILTRI[m.filtro.materiale];
    if (rho>0 && +m.filtro.spessore_um>0) o.filt={comp:m.filtro.materiale, rho, um:+m.filtro.spessore_um}; else av.push('filtro «'+m.filtro.materiale+'»: servono spessore_um e densita (g/cm³)'); }
  if (Array.isArray(m.eccitazione) && m.eccitazione.length) o.exc=m.eccitazione.map(q=>[+q.E, q.peso!=null ? +q.peso : 1, q.diffusione===false ? 0 : 1]);
  return {o, avvisi:av};
}
/* eccitazione a lista di energie: il nucleo 3.1 la accetta in fpSetup (S.exc). Se il nucleo caricato non la conosce, ripiego
   del prototipo (ricerca/xrf-pymca/acch_confronto.js): lo spettro del tubo nella cache di fpPrep è sostituito dalla lista. */
function eccitazione(C, o){
  const S=C.fpSetup(o); if (!o.exc || !o.exc.length) return {S, modo:'tubo'};
  if (S.exc) return {S, modo:'nucleo'};
  // TODO(coordinatore): togliere questo ripiego quando ogni nucleo usato ha S.exc (dalla 3.1 in poi non serve più)
  const S2=C.fpSetup(Object.assign({}, o, {kv:Math.max(4.5, ...o.exc.map(q=>q[0]))})), P=C.fpPrep(S2);
  P.E=Float64Array.from(o.exc.map(q=>q[0])); P.N=Float64Array.from(o.exc.map(q=>q[1])); P.nb=P.E.length; P.mu={}; P.sig={}; P.out={};
  return {S:S2, modo:'ripiego'};
}

/* ---------------- un campione XRF ---------------- */
let CORE=null; const nucleo=()=>CORE||(CORE=require(path.join(ROOT,'test','unit','load-core.js')));
function eseguiXRF(c, cert, C){
  C=C||nucleo(); const m=c.meta, avvisi=[];
  let neutro=null;
  if (c.cfg){ neutro=PymcaCfg.toAcch(PymcaCfg.parse(fs.readFileSync(c.cfg,'utf8'))); for (const w of neutro.warnings) if (w.kind!=='nota' || /energy|atmosphere/.test(w.key)) avvisi.push('cfg '+w.key+': '+w.msg); }
  const sp=leggiSpettro(fs.readFileSync(c.spettro,'latin1'), C); if (!sp) throw new Error('spettro non leggibile: '+path.basename(c.spettro));
  // calibrazione: metadati, poi quella del file, poi il .cfg
  let xs=sp.xs, cal=null;
  if (m.calibrazione && +m.calibrazione.guadagno>0) cal={zero:+m.calibrazione.zero||0, gain:+m.calibrazione.guadagno, quad:+m.calibrazione.quadratico||0, da:'metadati'};
  else if (sp.keV){ cal={da:'file'}; if (neutro && neutro.fit.gain && sp.cal && Math.abs(sp.cal.gain-neutro.fit.gain)/neutro.fit.gain>0.01) avvisi.push('la calibrazione del file e quella del .cfg differiscono più dell\'1%: vale quella del file'); }
  else if (sp.cal) cal=Object.assign({}, sp.cal, {da:'file'});
  else if (neutro && neutro.fit.gain>0) cal={zero:neutro.fit.zero||0, gain:neutro.fit.gain, quad:neutro.fit.quad||0, da:'cfg'};
  else throw new Error('lo spettro non ha calibrazione in energia: aggiungere "calibrazione" ai metadati (o il .cfg di PyMca)');
  if (!sp.keV) xs=Float64Array.from(sp.ch, ch=>cal.zero+cal.gain*ch+(cal.quad||0)*ch*ch);
  const {o, avvisi:av2}=setupDaMetadati(m, neutro); avvisi.push(...av2);
  const ex=eccitazione(C, o), S=ex.S;
  if (ex.modo==='ripiego') avvisi.push('eccitazione a lista con il ripiego del prototipo (il nucleo caricato non conosce S.exc)');
  // intervallo
  let lo=null, hi=null; if (Array.isArray(m.intervallo_keV)){ lo=+m.intervallo_keV[0]; hi=+m.intervallo_keV[1]; } else if (neutro && neutro.fit.xminE!=null){ lo=neutro.fit.xminE; hi=neutro.fit.xmaxE; }
  // elementi e fissi
  const rif=cert.righe.filter(r=>r.tipo!=='limite');
  let els=Array.isArray(m.elementi) ? m.elementi.slice() : rif.filter(r=>{ const l=C.fpLine(r.el,S), E=l&&C.fpLineE(r.el,l); return E && (lo==null || E>=lo) && (hi==null || E<=hi); }).map(r=>r.el);
  els=els.filter(e=>C.FP.el[e]); if (!els.length) throw new Error('nessun elemento da quantificare');
  const fissi=Object.assign({}, m.fissi||{});
  if (m.fissi_dal_certificato) for (const r of rif) if (!els.includes(r.el) && fissi[r.el]==null) fissi[r.el]=r.valore;
  // forma del picco
  const opt={mode:m.modo||'norm', fixed:fissi}; if (lo!=null) opt.lo=lo; if (hi!=null) opt.hi=hi;
  const mp=m.modello_picco||'gaussiano';
  if (mp==='ipermetro' || mp==='come_cfg'){ opt.model='hypermet';
    if (mp==='come_cfg' && neutro){ const f=neutro.fit, h=f.hypermet;
      opt.peak={flags:h ? (h.gauss?1:0)+(h.st?2:0)+(h.lt?4:0)+(h.step?8:0) : 15, st:f.st, lt:f.lt, step:f.stepH};
      if (f.noise>0){ opt.noise=f.noise; opt.fixNoise=!!(f.fixed&&f.fixed.noise); } if (f.fano>0){ opt.fano=f.fano; opt.fixFano=!!(f.fixed&&f.fixed.fano); }
      opt.escape=f.escape ? undefined : 'none'; opt.pileup=f.pileup; } }
  else if (mp!=='gaussiano') avvisi.push('modello_picco «'+mp+'» sconosciuto: usato il gaussiano');
  const t0=Date.now(), R=C.xrfFP(xs, sp.ys, els, S, opt); if (!R || !R.Q || R.Q.err) throw new Error('il calcolo FP non ha dato risultati'+(R&&R.Q&&R.Q.err?' ('+R.Q.err+')':''));
  const trovati={}; for (const e of els) if (R.Q.res[e]) trovati[e]={w:R.Q.res[e].w, sw:R.Q.res[e].sw, riga:R.Q.res[e].line};
  return {trovati, fissi, elementi:els, avvisi, dettagli:{formato:sp.fmt, calibrazione:cal, eccitazione:ex.modo, setup:JSON.parse(S.key), intervallo_keV:[opt.lo??null, opt.hi??null], modello_picco:mp, chi2r:R.fit&&R.fit.chi2r, somma:R.Q.sum, ms:Date.now()-t0}};
}

/* ---------------- un campione LIBS: aggancio al modulo CF-LIBS (app/libs-cf-core.js), in preparazione ---------------- */
// Interfaccia prevista: modulo UMD con una funzione quantify(spettro {x: nm, y}, opzioni = metadati) → {res: {El: {w: % in peso, sw}}}
function eseguiLIBS(c, cert, modulo){
  let M=null; const file=modulo||path.join(ROOT,'app','libs-cf-core.js');
  if (fs.existsSync(file)) M=require(file);
  const fn=M && ['quantify','quantifica','cfLibs','cfQuant'].map(k=>M[k]).find(f=>typeof f==='function');
  if (!fn) return {nonDisponibile:true, avvisi:['quantificazione LIBS non ancora disponibile: '+(M ? 'app/libs-cf-core.js non espone quantify()' : 'manca app/libs-cf-core.js')]};
  const sp=leggiSpettro(fs.readFileSync(c.spettro,'latin1'), null); if (!sp || !sp.xRaw) throw new Error('spettro LIBS: servono due colonne (lunghezza d\'onda in nm, intensità)');
  const out=fn({x:sp.xRaw, y:sp.ys}, Object.assign({elementi:cert.righe.map(r=>r.el)}, c.meta));
  const res=(out&&out.res)||out||{}, trovati={};
  for (const [e,v] of Object.entries(res)) if (v!=null) trovati[e]=typeof v==='number' ? {w:v, sw:0} : {w:+v.w, sw:+v.sw||0};
  return {trovati, fissi:{}, elementi:Object.keys(trovati), avvisi:(out&&out.avvisi)||[], dettagli:{modulo:path.relative(ROOT,file)}};
}

/* ---------------- ricerca dei campioni ---------------- */
const EST_SPETTRO=/\.(spe|mca|msa|txt|csv|spt|dat|xy)$/i;
function trovaCampioni(dir){
  const out=[];
  const walk=d=>{ let names; try{ names=fs.readdirSync(d); } catch(e){ return; }
    if (names.includes('certificato.csv') && names.includes('metadati.json')){
      const meta=JSON.parse(fs.readFileSync(path.join(d,'metadati.json'),'utf8')), rel=f=>f ? path.resolve(d, f) : null;
      let spettro=rel(meta.spettro); if (!spettro){ const c=names.filter(n=>EST_SPETTRO.test(n) && n!=='certificato.csv'); if (c.length===1) spettro=path.join(d,c[0]); }
      let cfg=rel(meta.cfg); if (!cfg && meta.cfg!==null){ const c=names.filter(n=>/\.cfg$/i.test(n)); if (c.length===1) cfg=path.join(d,c[0]); }
      out.push({nome:path.relative(dir,d)||path.basename(d), dir:d, meta, spettro, cfg, certificato:path.join(d,'certificato.csv')});
    }
    for (const n of names.sort()){ if (n.startsWith('.') || n.startsWith('_') || n==='risultati' || n==='node_modules') continue; const p=path.join(d,n); if (fs.statSync(p).isDirectory()) walk(p); } };
  walk(dir); return out;
}

/* ---------------- rapporto ---------------- */
const fmt=(v,d)=>v==null||!Number.isFinite(v) ? '—' : (+v.toPrecision(d||4)).toLocaleString('it-IT',{maximumSignificantDigits:d||4});
const fmtP=v=>v==null ? '—' : (v>0?'+':'')+v.toFixed(1).replace('.',',')+'%';
function rapportoMd(esiti, criteri, info){
  const L=[], P=s=>L.push(s);
  P('# Validazione con materiali certificati'); P('');
  P('*Generato da `scripts/valida-certificati.js` il '+info.data+' ('+info.versione+'). Non modificare a mano: rilanciare lo script.*'); P('');
  P('## Criteri di accettazione'); P('');
  for (const f of criteri.fasce) P('- Valore certificato '+(f.a==null ? '≥ '+String(f.da).replace('.',',')+'%' : 'fra '+String(f.da).replace('.',',')+' e '+String(f.a).replace('.',',')+'%')+': '+(f.segnala ? 'solo segnalato' : '|errore relativo| ≤ '+f.errore_rel_max+'%'));
  P('- ζ = |x − ref| / √(u² + (U/k)²) ≤ '+criteri.zeta_max+' (u: incertezza tipo dell\'app = conteggio ⊕ '+criteri.incertezza_modello_rel+'% di modello; U, k: dal certificato, k = '+criteri.k_predefinito+' se manca). E_n = |x − ref| / √((2u)² + U²) è riportato per confronto.');
  P('- Combinazione: '+({e:'servono entrambi (errore relativo e ζ)', o:'basta uno dei due', errore:'conta solo l\'errore relativo'})[criteri.combinazione]+'. Valutati solo i valori di tipo: '+criteri.tipi_valutati.join(', ')+'.');
  P('');
  P('| Campione | Tecnica | Esito | Elementi superati |'); P('|---|---|---|---|');
  for (const e of esiti) P('| '+e.nome+' | '+e.tecnica.toUpperCase()+' | '+(e.errore ? 'errore' : e.nonDisponibile ? 'non ancora disponibile' : e.valutazione.esito)+' | '+(e.valutazione ? e.valutazione.superati+' su '+e.valutazione.valutati : '—')+' |');
  P('');
  for (const e of esiti){
    P('## '+e.nome); P('');
    const m=e.meta||{}; const desc=[m.campione, m.strumento, m.anodo&&('anodo '+m.anodo), m.kV&&(m.kV+' kV'), m.uA&&(m.uA+' µA'), m.tempo_s&&(m.tempo_s+' s')].filter(Boolean).join(' · ');
    if (desc) P(desc); if (m.fonte) P('Fonte: '+m.fonte); if (desc||m.fonte) P('');
    if (e.errore){ P('**Errore:** '+e.errore); P(''); continue; }
    if (e.nonDisponibile){ P('**Non ancora disponibile.** '+e.avvisi.join(' ')); P(''); continue; }
    const d=e.dettagli||{};
    if (d.setup) P('Condizioni usate: anodo '+d.setup.anode+(d.setup.exc ? ', eccitazione '+d.setup.exc.map(q=>q[0]+' keV').join(' + ')+' ('+e.dettagli.eccitazione+')' : ', '+d.setup.kv+' kV')+', angoli '+d.setup.psi1+'°/'+d.setup.psi2+'°, '+({air:'aria',he:'elio',vac:'vuoto'})[d.setup.atm]+', rivelatore '+(d.setup.det||'Si')+' '+d.setup.si+' µm, finestra Be '+d.setup.beD+' µm'+(d.setup.filt ? ', filtro '+d.setup.filt.comp+' '+d.setup.filt.um+' µm' : '')+'. Intervallo '+fmt(d.intervallo_keV[0],3)+'–'+fmt(d.intervallo_keV[1],3)+' keV, picco '+d.modello_picco+', calibrazione dal '+(d.calibrazione&&d.calibrazione.da)+'. χ²ᵣ = '+fmt(d.chi2r,3)+'.');
    if (Object.keys(e.fissi||{}).length) P('Elementi non misurati, presi dal certificato: '+Object.entries(e.fissi).map(([k,v])=>k+' '+fmt(v,3)+'%').join(', ')+'.');
    P('');
    P('| Elemento | Tipo | Certificato (%) | U (k) | Trovato (%) | u | Errore rel. | ζ | E_n | Limite | Esito |'); P('|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of e.valutazione.righe) P('| '+r.el+' | '+r.tipo.replace('_',' ')+' | '+fmt(r.ref)+' | '+(r.U!=null ? fmt(r.U,2)+' ('+fmt(r.k,3)+')' : '—')+' | '+fmt(r.x)+' | '+fmt(r.u,2)+' | '+fmtP(r.errRel)+' | '+fmt(r.zeta,3)+' | '+fmt(r.En,3)+' | '+(r.limiteErr!=null ? '±'+r.limiteErr+'%' : '—')+' | **'+r.esito+'**'+(r.motivo ? ' ('+r.motivo+')' : '')+' |');
    P(''); P('Esito del campione: **'+e.valutazione.esito+'** ('+e.valutazione.superati+' su '+e.valutazione.valutati+' elementi valutati).'); P('');
    const av=(e.certAvvisi||[]).map(a=>'certificato: '+a).concat(e.avvisi||[]);
    if (av.length){ P('<details><summary>Avvisi ('+av.length+')</summary>'); P(''); for (const a of av) P('- '+a); P(''); P('</details>'); P(''); }
  }
  return L.join('\n');
}

/* ---------------- principale ---------------- */
function valida(opt){
  opt=opt||{}; const dir=opt.dir||DIR_DEF, criteri=caricaCriteri(opt.criteri||path.join(dir,'criteri.json'));
  const campioni=trovaCampioni(dir), esiti=[];
  for (const c of campioni){
    const tecnica=String(c.meta.tecnica||'xrf').toLowerCase(), e={nome:c.nome, tecnica, meta:c.meta};
    try{
      const cert=parseCertificato(fs.readFileSync(c.certificato,'utf8')); e.certAvvisi=cert.avvisi;
      if (!c.spettro || !fs.existsSync(c.spettro)) throw new Error('spettro non trovato'+(c.meta.spettro ? ': '+c.meta.spettro : ' (indicarlo in metadati.json, "spettro")'));
      const r=tecnica==='libs' ? eseguiLIBS(c, cert, opt.moduloLibs) : tecnica==='xrf' ? eseguiXRF(c, cert, opt.nucleo) : null;
      if (!r) throw new Error('tecnica «'+tecnica+'» non prevista (xrf, libs)');
      Object.assign(e, r); if (!r.nonDisponibile) e.valutazione=valuta(cert.righe, r.trovati, criteri, r.fissi);
    } catch(err){ e.errore=String(err && err.message || err); }
    esiti.push(e);
  }
  const info={data:opt.data||new Date().toISOString().slice(0,10), versione:'Acchiappaspettri '+require(path.join(ROOT,'package.json')).version};
  return {esiti, criteri, info, md:rapportoMd(esiti, criteri, info)};
}
function main(argv){
  const a=argv.slice(), get=k=>{ const i=a.indexOf(k); if (i<0) return null; const v=a[i+1]; a.splice(i,2); return v; };
  const uscita=get('--uscita'), criteri=get('--criteri'), dir=a[0] ? path.resolve(a[0]) : DIR_DEF;
  const R=valida({dir, criteri});
  if (!R.esiti.length){ console.error('Nessun campione in '+dir+': servono una cartella con certificato.csv, metadati.json e lo spettro (vedi validazione/certificati/README.md).'); return 2; }
  const out=uscita ? path.resolve(uscita) : path.join(dir,'risultati'); fs.mkdirSync(out, {recursive:true});
  fs.writeFileSync(path.join(out,'rapporto.md'), R.md+'\n');
  const json={generato:R.info, criteri:R.criteri, campioni:R.esiti.map(e=>({nome:e.nome, tecnica:e.tecnica, esito:e.errore ? 'errore' : e.nonDisponibile ? 'non ancora disponibile' : e.valutazione.esito, errore:e.errore||null,
    dettagli:e.dettagli||null, fissi:e.fissi||{}, righe:e.valutazione ? e.valutazione.righe : [], avvisi:(e.certAvvisi||[]).map(x=>'certificato: '+x).concat(e.avvisi||[])}))};
  fs.writeFileSync(path.join(out,'risultati.json'), JSON.stringify(json, null, 1)+'\n');
  for (const e of R.esiti) console.log(e.nome+': '+(e.errore ? 'errore: '+e.errore : e.nonDisponibile ? 'non ancora disponibile' : e.valutazione.esito+' ('+e.valutazione.superati+'/'+e.valutazione.valutati+')'));
  console.log('Rapporto: '+path.relative(process.cwd(), path.join(out,'rapporto.md')));
  return 0;
}
if (require.main===module) process.exitCode=main(process.argv.slice(2));
module.exports={CRITERI_DEF, caricaCriteri, parseCertificato, valuta, leggiSpettro, setupDaMetadati, eccitazione, eseguiXRF, eseguiLIBS, trovaCampioni, rapportoMd, valida, main};
