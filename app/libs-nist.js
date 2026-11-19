// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Dati atomici per la CF-LIBS (sperimentale), scaricati dal NIST Atomic Spectra Database su richiesta dell'utente.
   Non sono distribuiti con l'app: i dati del NIST ASD sono Standard Reference Data (copyright del Segretario al Commercio degli USA,
   15 U.S.C. 290e) e la redistribuzione richiede il permesso del NIST. L'app li scarica una volta dal sito ufficiale (physics.nist.gov),
   li elabora come scripts/gen-libs-data.py (stesse richieste, stesse scelte, stesso formato «libs-data-1") e li conserva nell'archivio
   dell'app (desktop: cartella dei dati dell'app; online: memoria del browser), così dopo funziona senza rete.
   Fonte: Kramida A., Ralchenko Yu., Reader J., NIST ASD Team, NIST Atomic Spectra Database (SRD 78), https://physics.nist.gov/asd,
   doi:10.18434/T4W30F. La parte di calcolo (build) è pura e si prova in node con un piccolo campione SINTETICO nel formato del NIST
   (test/unit/libs-nist.test.js), confrontata con lo script Python sullo stesso campione. */
(function(root, factory){
  if (typeof module==='object' && module.exports) module.exports=factory(root);
  else root.AcchLibsNist=factory(root);
})(typeof self!=='undefined' ? self : this, function(win){
  'use strict';
  const ASD_VERSION='5.12', BASE='https://physics.nist.gov/cgi-bin/ASD/', KEY='acch.libs.nist';
  const ELEMENTS=['H','Li','C','N','O','Na','Mg','Al','Si','K','Ca','Ti','Cr','Mn','Fe','Co','Ni','Cu','Zn','Sr','Ag','Sn','Sb','Ba','Au','Pb'], STAGES=['I','II'];
  const WL_MIN=200.0, WL_MAX=900.0, ACC_OK=['AAA','AA','A+','A','B+','B','C+','C'], ACC_WEAK=['D+','D','E'];
  const ACC_REL={'AAA':0.003,'AA':0.01,'A+':0.02,'A':0.03,'B+':0.07,'B':0.10,'C+':0.18,'C':0.25,'D+':0.40,'D':0.50,'E':1.0};
  const N_PER_SPECIES=30, N_MIN=10, T_SEL=10000.0, KB=8.617333262e-5, T_GRID=[]; for (let T=3000; T<=30000; T+=500) T_GRID.push(T);
  const MASS={H:1.008, Li:6.94, C:12.011, N:14.007, O:15.999, Na:22.990, Mg:24.305, Al:26.982, Si:28.085, K:39.098, Ca:40.078, Ti:47.867, Cr:51.996, Mn:54.938, Fe:55.845, Co:58.933,
    Ni:58.693, Cu:63.546, Zn:65.38, Sr:87.62, Ag:107.87, Sn:118.71, Sb:121.76, Ba:137.33, Au:196.97, Pb:207.2};

  /* richieste: stessi parametri di scripts/gen-libs-data.py (lines_of, levels_of, ion_energies) */
  const Q={
    lines:(el, st)=>['lines_'+el+'_'+st+'.tsv', 'lines1.pl', [['spectra',el+' '+st],['output_type',0],['limits_type',0],['low_w',WL_MIN],['upp_w',WL_MAX],['unit',1],['submit','Retrieve Data'],['de',0],['I_scale_type',1],['format',3],['line_out',0],['remove_js','on'],
      ['en_unit',1],['output',0],['bibrefs',1],['page_size',15],['show_obs_wl',1],['show_calc_wl',1],['unc_out',1],['order_out',0],['show_av',2],['tsb_value',0],['A_out',0],['intens_out','on'],['allowed_out',1],
      ['forbid_out',1],['conf_out','on'],['term_out','on'],['enrg_out','on'],['J_out','on'],['g_out','on']]],
    levels:(el, st)=>['levels_'+el+'_'+st+'.tsv', 'energy1.pl', [['de',0],['spectrum',el+' '+st],['submit','Retrieve Data'],['units',1],['format',3],['output',0],['page_size',15],['multiplet_ordered',0],['conf_out','on'],['term_out','on'],['level_out','on'],['unc_out',1],
      ['j_out','on'],['g_out','on'],['biblio','on'],['temp','']]],
    ie:el=>['ie_'+el+'.tsv', 'ie.pl', [['spectra',el+' I-II'],['submit','Retrieve Data'],['units',1],['format',3],['order',0],['at_num_out','on'],['sp_name_out','on'],['ion_charge_out','on'],['el_name_out','on'],['seq_out','on'],
      ['shells_out','on'],['level_out','on'],['ion_conf_out','on'],['e_out',0],['unc_out','on'],['biblio','on']]]};
  // codifica come urllib.parse.urlencode di Python (quote_plus): spazi «+», «200.0» come i float di Python
  const enc=s=>encodeURIComponent(s).replace(/%20/g,'+').replace(/[!'()*~]/g, c=>c==='~' ? c : '%'+c.charCodeAt(0).toString(16).toUpperCase());
  function query(params){ return params.map(([k,v])=>enc(k)+'='+enc(k==='low_w'||k==='upp_w' ? Number(v).toFixed(1) : String(v))).join('&'); }

  /* numero da un campo NIST, come num() dello script: via virgolette, parentesi, «?», «*» e lettere (non l'esponente «e»); null per «+x» */
  function num(s){ s=String(s==null?'':s).trim().replace(/^"+|"+$/g,'').trim(); if (/\+[a-z]/.test(s)) return null;
    s=s.replace(/[\[\]()?*a-df-z]/g,''); if (!/^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/.test(s)) return null; const v=Number(s); return Number.isFinite(v) ? v : null; }
  function tsv(body){ const rows=String(body||'').split(/\r\n|\n|\r/).filter(r=>r.trim()).map(r=>r.split('\t')); if (!rows.length) return {head:[], rows:[]};
    const head=rows[0].map(h=>h.trim()); return {head, rows:rows.slice(1).filter(r=>r.length>=head.length-1 && !r[0].startsWith('obs_wl'))}; }
  const field=(ix, r)=>k=>Object.prototype.hasOwnProperty.call(ix, k) && ix[k]<r.length ? r[ix[k]] : '';
  const strip=s=>String(s).trim().replace(/^"+|"+$/g,'');
  function linesOf(body){ const {head, rows}=tsv(body), ix={}; head.forEach((h,i)=>{ ix[h]=i; }); const out=[];
    for (const r of rows){ const g=field(ix, r); const wl=num(g('obs_wl_air(nm)')) || num(g('ritz_wl_air(nm)')), A=num(g('Aki(s^-1)')), acc=strip(g('Acc')),
        Ei=num(g('Ei(eV)')), Ek=num(g('Ek(eV)')), gi=num(g('g_i')), gk=num(g('g_k')), typ=strip(g('Type'));
      if ([wl,A,Ei,Ek,gi,gk].some(v=>v==null) || typ || !(WL_MIN<=wl && wl<=WL_MAX) || A<=0) continue;
      out.push({wl, A, acc, Ei, Ek, gi:Math.trunc(gi), gk:Math.trunc(gk), ci:g('conf_i').replace(/^"+|"+$/g,''), ck:g('conf_k').replace(/^"+|"+$/g,'')}); }
    return out; }
  /* Balmer: componenti di struttura fine sommate; la riga totale del NIST (conf «2», «3») solo se mancano le componenti */
  function mergeHydrogen(L){ const groups=new Map();
    for (const l of L){ const a=/^(\d+)/.exec(l.ci), b=/^(\d+)/.exec(l.ck); if (!a || !b) continue; const k=a[1]+','+b[1]; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(l); }
    const out=[];
    for (const [k, G0] of groups){ const [ni, nk]=k.split(',').map(Number); const comp=G0.filter(l=>!(/^\d+$/.test(l.ci) && /^\d+$/.test(l.ck))), G=comp.length ? comp : G0;
      const gA=G.reduce((t,l)=>t+l.gk*l.A,0), wavg=f=>G.reduce((t,l)=>t+l[f]*l.gk*l.A,0)/gA;
      const acc=G.map(l=>l.acc).reduce((w,a)=>(ACC_REL[a]!=null?ACC_REL[a]:1)>(ACC_REL[w]!=null?ACC_REL[w]:1) ? a : w);
      const gk=2*nk*nk, gi=2*ni*ni; out.push({wl:wavg('wl'), A:gA/gk, acc, Ei:wavg('Ei'), Ek:wavg('Ek'), gi, gk, ci:String(ni), ck:String(nk)}); }
    return out; }
  function levelsOf(body){ const {head, rows}=tsv(body), ix={}; head.forEach((h,i)=>{ ix[h]=i; }); const lev=[]; let limit=null;
    for (const r of rows){ const g=field(ix, r), E=num(g('Level (eV)'));
      if (strip(g('Term'))==='Limit'){ if (E!=null && limit==null) limit=E; continue; }
      const gg=num(g('g')); if (E==null || gg==null) continue; lev.push([E, gg]); }
    return {lev, limit}; }
  function ionEnergies(body, out){ const {head, rows}=tsv(body), ix={}; head.forEach((h,i)=>{ ix[h]=i; });
    for (const r of rows){ const sp=strip(r[ix['Sp. Name']]||''), E=num(r[ix['Ionization Energy (eV)']]); if (E!=null) out[sp]=E; } }
  // arrotondamenti come lo script: round(x, 4) e float('%.4g' / '%.6g')
  const r4=x=>Number(x.toFixed(4)), g4=x=>Number(x.toPrecision(4)), g6=x=>Number(x.toPrecision(6));

  /* elaborazione completa. get(nome, script, params) → Promise<{stamp, body}> (body '' se il NIST non ha dati). opt.progress(i, n, nome). */
  async function build(get, opt){ opt=opt||{}; const stamps=new Set(), n=ELEMENTS.length*3, IE={}; let i=0;
    const step=async (spec)=>{ const [name, script, params]=spec; if (opt.progress) opt.progress(i, n, name); const r=await get(name, script, params); i++; if (r && r.stamp) stamps.add(r.stamp); return r ? r.body||'' : ''; };
    for (const el of ELEMENTS) ionEnergies(await step(Q.ie(el)), IE);
    const species={}, checks=[];
    for (const el of ELEMENTS) for (const st of STAGES){ const name=el+' '+st; if (el==='H' && st==='II') continue;
      let L=linesOf(await step(Q.lines(el, st))); const {lev, limit}=levelsOf(await step(Q.levels(el, st))); if (!lev.length) continue;
      const Eion=Object.prototype.hasOwnProperty.call(IE, name) ? IE[name] : null; if (el==='H') L=mergeHydrogen(L);
      const emis=l=>l.gk*l.A*Math.exp(-l.Ek/(KB*T_SEL))/l.wl, good=L.filter(l=>ACC_OK.includes(l.acc)).sort((a,b)=>emis(b)-emis(a));
      let sel=good.slice(0, N_PER_SPECIES);
      if (sel.length<N_MIN){ const weak=L.filter(l=>ACC_WEAK.includes(l.acc)).sort((a,b)=>emis(b)-emis(a)); sel=sel.concat(weak.slice(0, N_MIN-sel.length)); }
      sel=sel.slice().sort((a,b)=>a.wl-b.wl);
      const lim=Eion!=null ? Eion : limit!=null ? limit : Infinity, lv=lev.filter(([E])=>E<lim).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
      const U=T_GRID.map(T=>g6(lv.reduce((t,[E,g])=>t+g*Math.exp(-E/(KB*T)),0)));
      const Es=[...new Set(lv.map(([E])=>r4(E)))].sort((a,b)=>a-b); let dE=0; for (let k=1;k<Es.length;k++) dE=Math.max(dE, Es[k]-Es[k-1]);
      const U1=lv.reduce((t,[E,g])=>t+g*Math.exp(-E/1.0),0); checks.push([name, r4(U1), null]);   // il controllo con il calcolo del NIST (pagina HTML) lo fa solo lo script
      species[name]={el, st, Eion, dEmax:r4(dE), nLev:lv.length, nAll:L.length, nOk:good.length, U, lines:sel.map(l=>[r4(l.wl), g4(l.A), l.acc, r4(l.Ei), r4(l.Ek), l.gi, l.gk])}; }
    const ss=[...stamps].sort(), today=new Date().toISOString().slice(0,10);
    return {version:'libs-data-1', source:'Kramida A., Ralchenko Yu., Reader J., NIST ASD Team (2024). NIST Atomic Spectra Database (version '+ASD_VERSION+'), NIST Standard Reference Database 78, https://physics.nist.gov/asd, doi:10.18434/T4W30F',
      downloaded:ss.length ? ss[ss.length-1] : today, downloadedFirst:ss.length ? ss[0] : today,
      copyright:'Dati NIST SRD 78: copyright U.S. Secretary of Commerce on behalf of the United States of America (15 U.S.C. 290e). Scaricati dal sito del NIST su richiesta dell\'utente ed elaborati da Acchiappaspettri: righe scelte, funzioni di partizione calcolate dai livelli. Non ridistribuire.',
      masses:'IUPAC/CIAAW 2021, pesi atomici standard abbreviati (doi:10.1515/pac-2019-0603)',
      selection:{wl_nm:[WL_MIN, WL_MAX], air:true, acc:ACC_OK, fillTo:N_MIN, fillAcc:ACC_WEAK, perSpecies:N_PER_SPECIES, Tsel_K:T_SEL, type:'E1'},
      accRel:ACC_REL, lineFields:['wl_nm_air','Aki_s-1','acc','Ei_eV','Ek_eV','gi','gk'], Tgrid:T_GRID.slice(), mass:Object.fromEntries(ELEMENTS.map(e=>[e, MASS[e]])), pfCheck1eV:checks, species}; }

  /* controllo di un insieme di dati (scaricato, salvato o caricato da file): solo la struttura che l'analisi usa, numeri finiti */
  function validate(D){ const bad=m=>{ throw new Error(m); };
    if (!D || typeof D!=='object' || D.version!=='libs-data-1') bad('non è un file di dati atomici di Acchiappaspettri (libs-data-1)');
    if (!Array.isArray(D.Tgrid) || D.Tgrid.length<2 || !D.Tgrid.every(Number.isFinite)) bad('griglia delle temperature assente');
    if (!D.species || typeof D.species!=='object' || !D.mass || typeof D.mass!=='object') bad('specie o masse assenti');
    const sp={}; let nl=0;
    for (const k of Object.keys(D.species)){ const s=D.species[k]; if (!/^[A-Z][a-z]? (I|II)$/.test(k) || !s || typeof s!=='object') continue;
      if (!Array.isArray(s.U) || s.U.length!==D.Tgrid.length || !s.U.every(v=>Number.isFinite(v) && v>0)) bad('funzione di partizione non valida: '+k);
      const lines=(Array.isArray(s.lines) ? s.lines : []).filter(l=>Array.isArray(l) && l.length>=7 && [0,1,3,4,5,6].every(j=>Number.isFinite(l[j])) && typeof l[2]==='string');
      nl+=lines.length; sp[k]={el:k.split(' ')[0], st:k.split(' ')[1], Eion:Number.isFinite(s.Eion) ? s.Eion : null, dEmax:Number.isFinite(s.dEmax) ? s.dEmax : 0, nLev:+s.nLev||0, nAll:+s.nAll||0, nOk:+s.nOk||0, U:s.U.slice(), lines}; }
    if (!Object.keys(sp).length || !nl) bad('nessuna riga utilizzabile');
    const mass={}; for (const k of Object.keys(D.mass)) if (/^[A-Z][a-z]?$/.test(k) && Number.isFinite(D.mass[k]) && D.mass[k]>0) mass[k]=D.mass[k];
    const acc={}; for (const k of Object.keys(D.accRel||ACC_REL)) if (Number.isFinite((D.accRel||ACC_REL)[k])) acc[k]=(D.accRel||ACC_REL)[k];
    return {version:'libs-data-1', source:String(D.source||'NIST ASD').slice(0,400), downloaded:String(D.downloaded||'').slice(0,20), downloadedFirst:String(D.downloadedFirst||'').slice(0,20),
      copyright:String(D.copyright||'').slice(0,600), masses:String(D.masses||'').slice(0,200), selection:D.selection||null, accRel:acc, lineFields:['wl_nm_air','Aki_s-1','acc','Ei_eV','Ek_eV','gi','gk'],
      Tgrid:D.Tgrid.slice(), mass, pfCheck1eV:Array.isArray(D.pfCheck1eV) ? D.pfCheck1eV.slice(0,200) : [], species:sp}; }
  /* testo di un file: JSON dei dati, oppure il libs-data.js scritto da scripts/gen-libs-data.py */
  function parseFile(text){ text=String(text||'').replace(/^﻿/,''); let j=null;
    try { j=JSON.parse(text); } catch(e){ const a=text.indexOf('{"version"'), b=text.lastIndexOf('});'); if (a>=0 && b>a){ try { j=JSON.parse(text.slice(a, b+1)); } catch(e2){ j=null; } } }
    if (!j) throw new Error('il file non contiene dati atomici leggibili');
    return validate(j); }

  /* ---------------- nella pagina: archivio, scaricamento, caricamento ---------------- */
  // archivio dell'app (AcchHost.store: file nella cartella dei dati sul desktop, localStorage online); testo JSON grezzo
  const box=()=>win.AcchHost && win.AcchHost.store ? win.AcchHost.store : win.localStorage;
  const store={ get:()=>{ try { const b=box(); return b ? b.getItem(KEY) : null; } catch(e){ return null; } },
    set:v=>{ const b=box(); if (!b) throw new Error('nessun archivio disponibile'); try { b.setItem(KEY, v); } catch(e){ const err=new Error('spazio di archiviazione esaurito'); err.code='quota'; throw err; } },
    del:()=>{ try { const b=box(); if (b) b.removeItem(KEY); } catch(e){} } };
  function load(){ const t=store.get(); if (!t) return null; try { const D=validate(JSON.parse(t)); win.LIBS_DATA=D; return D; } catch(e){ return null; } }
  function save(D){ D=validate(D); store.set(JSON.stringify(D)); win.LIBS_DATA=D; return D; }
  function forget(){ store.del(); win.LIBS_DATA=null; }
  // desktop: richiesta dal processo nativo (comando nist_get, solo physics.nist.gov); online: fetch (il NIST oggi non lo permette alle pagine
  // di altri siti, CORS: l'errore lo spiega e propone il caricamento da file)
  const nativeInvoke=()=>win.__TAURI__ && win.__TAURI__.core && win.__TAURI__.core.invoke;
  async function getter(name, script, params){ const q=query(params), inv=nativeInvoke();
    let body; if (inv) body=await inv('nist_get', {script, query:q});
    else { let r; try { r=await win.fetch(BASE+script+'?'+q, {mode:'cors', credentials:'omit'}); } catch(e){ const err=new Error('cors'); err.code='cors'; throw err; }
      if (!r.ok){ const err=new Error('http '+r.status); err.code='http'; throw err; } body=await r.text(); }
    if (/^\s*</.test(body) || /<html/i.test(body.slice(0,800))){ if (/No lines are available|No levels|Unrecognized|not found/i.test(body)) body=''; else { const err=new Error('risposta inattesa del NIST per '+name); err.code='format'; throw err; } }
    return {stamp:new Date().toISOString().slice(0,10), body}; }
  async function download(progress){ if (win.navigator && win.navigator.onLine===false){ const e=new Error('offline'); e.code='offline'; throw e; }
    let first=true; const polite=async (...a)=>{ if (!first) await new Promise(r=>setTimeout(r, API.delay)); first=false; return getter(...a); };   // riguardo per il server del NIST
    const D=await build(polite, {progress}); return save(D); }

  const API={delay:250, ELEMENTS, STAGES, ASD_VERSION, BASE, KEY, Q, query, num, tsv, linesOf, mergeHydrogen, levelsOf, build, validate, parseFile, load, save, forget, download, native:()=>!!nativeInvoke()};
  return API;
});
