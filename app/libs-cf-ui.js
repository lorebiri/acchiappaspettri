// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* CF-LIBS (sperimentale): pannello minimo nella scheda delle ipotesi degli spettri LIBS. I calcoli sono tutti in
   app/libs-cf-core.js (LibsCf), i dati atomici in app/libs-data.js (LIBS_DATA, NIST ASD). Usa lo spettro originale (f.xs, f.ys):
   il fondo si toglie riga per riga con un fondo lineare locale. Lo stato resta in f._cf (non si salva nel progetto).
   Testi in italiano e in inglese qui (T(it,en)), come in app/sorption-ui.js. */
(function(win){
  'use strict';
  const doc=win.document;
  const en=()=>!!(win.AcchI18n && win.AcchI18n.lang==='en'), T=(it,e)=>en()?e:it;
  const h=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const dec=()=>en()?'.':',';
  const g=(v,d)=>v==null||!Number.isFinite(+v)?'—':String(+(+v).toPrecision(d||3)).replace('.',dec());
  const ex=v=>!Number.isFinite(+v)?'—':(+v).toExponential(2).replace('.',dec()).replace(/e\+?(-?)(\d+)/,(m,s,n)=>'·10'+(s?'⁻':'')+String(n).split('').map(c=>'⁰¹²³⁴⁵⁶⁷⁸⁹'[c]).join(''));
  const num=s=>{ const v=parseFloat(String(s==null?'':s).replace(',','.')); return Number.isFinite(v)?v:null; };
  // n_e scritta come 1e17, 1,5e17, 10^17, 1,5·10^17 o 1.5x10^17 (prima «10^17» diventava 10 cm⁻³)
  const neNum=s=>{ const t=String(s==null?'':s).replace(/\s+/g,'').replace(',','.').replace(/^10\^/,'1e').replace(/(?:[x×·*])10\^/i,'e').replace(/[⁻]/g,'-');
    return /^[+]?\d+(\.\d*)?(e[+-]?\d+)?$/i.test(t) ? +t : null; };

  function warnText(w){ const L=a=>(a||[]).slice(0,6).join(', ')+((a||[]).length>6?'…':'');
    switch (w.code){
      case 'response': return T('La risposta spettrale dello strumento non è nota all\'app: la CF-LIBS richiede che il fattore F sia lo stesso per tutte le righe. Senza la curva di efficienza (lampada tarata) le concentrazioni possono avere errori grandi, soprattutto fra righe lontane in lunghezza d\'onda.',
        'The app does not know the instrument spectral response: CF-LIBS needs the same factor F for every line. Without the efficiency curve (calibrated lamp) concentrations can be badly wrong, especially between lines far apart in wavelength.');
      case 'closure': return T('Chiusura a 100 %: gli elementi non scelti (o non visibili) spostano tutti gli altri. L\'errore è almeno pari alla frazione degli elementi mancanti.', 'Closure to 100%: elements not selected (or not visible) shift all the others. The error is at least the fraction of missing elements.');
      case 'mcwhirterOnlyNecessary': return T('Il criterio di McWhirter è soddisfatto, ma è una condizione necessaria e non sufficiente per l\'equilibrio termodinamico locale (Cristoforetti et al. 2010): servono anche omogeneità e stazionarietà del plasma (ritardo e finestra di acquisizione adatti).',
        'The McWhirter criterion is met, but it is a necessary, not sufficient, condition for local thermodynamic equilibrium (Cristoforetti et al. 2010): the plasma must also be homogeneous and stationary (suitable delay and gate).');
      case 'mcwhirterFail': return T('n_e è sotto la soglia di McWhirter ('+ex(w.neMin)+' cm⁻³): l\'equilibrio termodinamico locale non è garantito e il metodo non è applicabile così.', 'n_e is below the McWhirter threshold ('+ex(w.neMin)+' cm⁻³): local thermodynamic equilibrium is not ensured and the method does not apply as is.');
      case 'resonance': return T('Righe di risonanza (livello inferiore fondamentale) usate: sono le più esposte all\'autoassorbimento ('+L(w.lines)+'). Prova a escluderle.', 'Resonance lines (ground lower level) used: they are the most prone to self-absorption ('+L(w.lines)+'). Try excluding them.');
      case 'resonanceExcluded': return T(w.n+' righe di risonanza escluse (autoassorbimento probabile).', w.n+' resonance lines excluded (likely self-absorbed).');
      case 'oneStage': return T(w.el+': righe di un solo stadio ('+w.st+'); l\'altro è stimato con l\'equazione di Saha.', w.el+': lines of one stage only ('+w.st+'); the other is estimated with the Saha equation.');
      case 'oneLine': return T(w.el+': una riga sola, risultato poco affidabile.', w.el+': a single line, unreliable result.');
      case 'narrowEk': return T('Le energie dei livelli superiori coprono meno di 1 eV: la temperatura è poco determinata.', 'Upper-level energies span less than 1 eV: the temperature is poorly determined.');
      case 'Toutside': return T('Temperatura fuori dalla griglia delle funzioni di partizione (3000–30000 K).', 'Temperature outside the partition-function grid (3000–30000 K).');
      case 'noConvergence': return T('L\'iterazione su T e n_e non è arrivata a convergenza.', 'The T and n_e iteration did not converge.');
      case 'closureRefMissing': return T('Lo standard interno '+w.el+' non ha righe misurate: chiusura a 100 % al suo posto.', 'The internal standard '+w.el+' has no measured lines: closure to 100% used instead.');
      case 'neInvalid': return T('La densità elettronica data non è valida (serve un numero in cm⁻³ fra 10¹³ e 10²¹, per esempio 1e17): ignorata, n_e ricavata per iterazione (ipotesi: 1 atm).', 'The given electron density is not valid (a number in cm⁻³ between 10¹³ and 10²¹ is needed, e.g. 1e17): ignored, n_e estimated by iteration (assumption: 1 atm).');
      case 'oneElement': return T('Un solo elemento: con la chiusura a 100 % risulta 100 % per costruzione. Scegli tutti gli elementi presenti nel campione.', 'A single element: with closure to 100% it comes out at 100% by construction. Select all the elements present in the sample.');
      case 'noLines': return T('Elementi scelti senza righe misurabili, quindi assenti dal risultato: '+L(w.els)+'. La chiusura a 100 % è fatta senza di loro e gli altri risultano più alti.', 'Selected elements with no measurable lines, hence missing from the result: '+L(w.els)+'. The 100% closure is made without them, so the others come out higher.');
      case 'selfAbsNoW': return T('Correzione dell\'autoassorbimento non applicata: mancano i coefficienti Stark w delle righe.', 'Self-absorption correction not applied: line Stark coefficients w are missing.');
      case 'lowSA': return T('Righe scartate per autoassorbimento forte: '+L(w.lines), 'Lines discarded for strong self-absorption: '+L(w.lines));
      case 'noH': return T('Riga dell\'idrogeno non trovata o troppo debole: n_e è stata stimata per iterazione (ipotesi: 1 atm).', 'Hydrogen line not found or too weak: n_e was estimated by iteration (assumption: 1 atm).');
      default: return w.code; } }

  function plotSvg(r){ const P=r.points, W=420, H=230, m={l:46,r:8,t:8,b:30};
    const xs=P.map(p=>p.x), ys=P.map(p=>p.y-(r.fit.q[p.g]-Math.max(...Object.values(r.fit.q))));   // ogni gruppo portato sull'intercetta più alta
    const x0=Math.min(...xs), x1=Math.max(...xs), y0=Math.min(...ys), y1=Math.max(...ys), sx=x=>m.l+(x-x0)/((x1-x0)||1)*(W-m.l-m.r), sy=y=>H-m.b-(y-y0)/((y1-y0)||1)*(H-m.t-m.b);
    const groups=[...new Set(P.map(p=>p.g))], pal=['#1f5fbf','#c25a00','#2a9d5c','#7b4fc9','#b8336a','#0e7490','#8a6d00','#555'];
    const q0=Math.max(...Object.values(r.fit.q)), line=`<line x1="${sx(x0)}" y1="${sy(r.fit.m*x0+q0)}" x2="${sx(x1)}" y2="${sy(r.fit.m*x1+q0)}" stroke="currentColor" stroke-width="1"/>`;
    const dots=P.map((p,i)=>`<circle cx="${sx(xs[i]).toFixed(1)}" cy="${sy(ys[i]).toFixed(1)}" r="3" fill="${pal[groups.indexOf(p.g)%pal.length]}"><title>${h(p.el+' '+p.st+' '+g(p.wl,6)+' nm')}</title></circle>`).join('');
    const leg=groups.map((gr,i)=>`<tspan fill="${pal[i%pal.length]}">● ${h(gr)} </tspan>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" role="img" aria-label="${h(T('Grafico di Boltzmann','Boltzmann plot'))}">
      <rect x="${m.l}" y="${m.t}" width="${W-m.l-m.r}" height="${H-m.t-m.b}" fill="none" stroke="currentColor" stroke-opacity="0.3"/>${line}${dots}
      <text x="${(W+m.l)/2}" y="${H-6}" text-anchor="middle" font-size="11" fill="currentColor">${h(r.mode==='saha-boltzmann'?T('E_k (+ E_ion per gli ioni), eV','E_k (+ E_ion for ions), eV'):'E_k, eV')}</text>
      <text x="12" y="${(H-m.b)/2}" transform="rotate(-90 12 ${(H-m.b)/2})" text-anchor="middle" font-size="11" fill="currentColor">ln(I/gA)</text>
      <text x="${m.l+4}" y="${m.t+12}" font-size="10">${leg}</text>
      <text x="${m.l-4}" y="${sy(y1)+4}" text-anchor="end" font-size="9" fill="currentColor">${g(y1,3)}</text><text x="${m.l-4}" y="${sy(y0)}" text-anchor="end" font-size="9" fill="currentColor">${g(y0,3)}</text>
      <text x="${sx(x0)}" y="${H-m.b+11}" font-size="9" fill="currentColor">${g(x0,3)}</text><text x="${sx(x1)}" y="${H-m.b+11}" text-anchor="end" font-size="9" fill="currentColor">${g(x1,3)}</text></svg>`; }

  function resultHtml(r){
    if (!r.ok) return `<div class="pkempty">${h(T('CF-LIBS non riuscita: ','CF-LIBS failed: ')+(r.why||''))}</div>`;
    const mw=r.mcWhirter, srcs={given:T('valore inserito','entered value'), Halpha:'Hα (Gigosos 2003)', Hbeta:'Hβ (Gigosos 2003)', line:T('riga con w noto','line with known w'), iterated:T('iterazione (neutralità di carica, 1 atm: ipotesi)','iteration (charge neutrality, 1 atm: assumption)')};
    let s=`<p style="margin:6px 0"><b>T</b> = ${g(r.T,4)} ± ${g(r.sT,2)} K · <b>n_e</b> = ${ex(r.ne)} cm⁻³ <small>(${h(srcs[r.neSource]||r.neSource)})</small> · χ²ᵣ ${g(r.fit.chi2r,3)} · ${r.points.length} ${T('righe','lines')}</p>`;
    s+=`<p class="why" style="margin:2px 0">McWhirter: n_e ${mw.ok?'&gt;':'&lt;'} ${ex(mw.neMin)} cm⁻³ (ΔE = ${g(mw.dE,3)} eV, ${h(mw.species||'')}) → ${mw.ok?T('soddisfatto (necessario, non sufficiente)','met (necessary, not sufficient)'):T('NON soddisfatto','NOT met')}</p>`;
    if (r.neSaha && r.neSaha.length) s+=`<p class="why" style="margin:2px 0">${T('n_e dall\'equilibrio di Saha','n_e from Saha equilibrium')}: ${r.neSaha.map(x=>h(x.el)+' '+ex(x.ne)).join(' · ')} ${T('(confronta con Stark)','(compare with Stark)')}</p>`;
    s+=`<div class="areawrap"><table class="areatab"><thead><tr><th>${T('Elemento','Element')}</th><th>${T('% atomica','atomic %')}</th><th>${T('% in peso','wt %')}</th><th>${T('stadi','stages')}</th><th>${T('righe','lines')}</th><th>${T('ionizzato','ionised')}</th></tr></thead><tbody>${
      r.elements.map(e=>`<tr><td>${h(e.el)}</td><td>${g(100*e.mol,3)} ± ${g(100*e.sMol,2)}</td><td>${g(100*e.wt,3)} ± ${g(100*e.sWt,2)}</td><td>${h(e.species.join('+'))}</td><td>${e.nLines}</td><td>${g(100*e.ionFrac,2)} %</td></tr>`).join('')}</tbody></table></div>`;
    s+=`<p class="why" style="margin:2px 0">${T('Incertezze: solo statistiche (regressione e A_ki), Monte Carlo; non comprendono gli errori di modello (LTE, autoassorbimento, risposta spettrale).','Uncertainties: statistical only (regression and A_ki), Monte Carlo; they exclude model errors (LTE, self-absorption, spectral response).')}${r.sumWt!==1?' '+T('Somma con lo standard interno','Sum with the internal standard')+': '+g(100*r.sumWt,4)+' %':''}</p>`;
    s+=`<h4 class="anh">${T('Grafico di Boltzmann','Boltzmann plot')}${r.mode==='saha-boltzmann'?' (Saha–Boltzmann)':''}</h4>`+plotSvg(r);
    s+=`<details><summary>${T('Tabella del grafico','Plot table')}</summary><div class="areawrap"><table class="areatab"><thead><tr><th>${T('specie','species')}</th><th>λ (nm)</th><th>E_k (eV)</th><th>x (eV)</th><th>y = ln(I/gA)</th><th>σ_y</th><th>${T('residuo','residual')}</th></tr></thead><tbody>${
      r.points.map(p=>`<tr><td>${h(p.el+' '+p.st)}${p.resonance?' ʳ':''}</td><td>${g(p.wl,6)}</td><td>${g(p.Ek,4)}</td><td>${g(p.x,4)}</td><td>${g(p.y,4)}</td><td>${g(p.sy,2)}</td><td>${g(p.res,2)}</td></tr>`).join('')}</tbody></table></div><p class="why">ʳ ${T('riga di risonanza','resonance line')}</p></details>`;
    s+=`<h4 class="anh">${T('Avvisi','Warnings')}</h4><ul class="anlist">${r.warnings.map(w=>`<li class="lv-${/Fail|noConv/.test(w.code)?'bad':'warn'}"><span>△</span><div>${h(warnText(w))}</div></li>`).join('')}</ul>`;
    return s; }

  /* dati atomici assenti: non sono distribuiti con l'app (dati NIST, permesso da chiedere). Si scaricano dal sito del NIST su richiesta
     dell'utente (app/libs-nist.js) o si carica un file preparato con scripts/gen-libs-data.py; poi restano nell'archivio dell'app. */
  function errText(e){ const c=e&&e.code;
    if (c==='offline') return T('Nessuna connessione a Internet: collegati e riprova. I dati servono una volta sola, poi l\'app funziona anche senza rete.','No Internet connection: connect and try again. The data are needed only once; afterwards the app works offline.');
    if (c==='cors') return T('Il sito del NIST non permette lo scaricamento diretto da una pagina web: il browser blocca la richiesta. Usa l\'app desktop, che li scarica da sé, oppure carica qui un file di dati preparato con scripts/gen-libs-data.py (nel repository di Acchiappaspettri).','The NIST website does not allow direct downloads from a web page: the browser blocks the request. Use the desktop app, which downloads them itself, or load here a data file prepared with scripts/gen-libs-data.py (in the Acchiappaspettri repository).');
    if (c==='quota') return T('Spazio di archiviazione esaurito: libera spazio e riprova.','Storage is full: free some space and try again.');
    if (c==='http' || c==='format') return T('Il sito del NIST non ha risposto come previsto','The NIST website did not answer as expected')+' ('+h(e.message)+'). '+T('Riprova più tardi.','Try again later.');
    return h(String(e&&e.message||e)); }
  function renderGet(box, f, d, els){ const N=win.AcchLibsNist; const wrap=doc.createElement('div'); wrap.className='libscf'; wrap.style.marginTop='10px';
    wrap.innerHTML=`<h4 class="anh">CF-LIBS <small>(${T('sperimentale','experimental')})</small></h4>
      <p class="why" style="margin:2px 0">${T('Per la CF-LIBS servono i dati atomici del NIST Atomic Spectra Database (Kramida et al., NIST SRD 78, doi:10.18434/T4W30F): righe di emissione, livelli energetici ed energie di ionizzazione di 26 elementi. Non sono distribuiti con l\'app. Si scaricano una volta sola dal sito ufficiale del NIST (physics.nist.gov, circa 130 richieste, qualche minuto) e restano salvati nell\'app, così dopo funziona anche senza rete.','CF-LIBS needs the atomic data of the NIST Atomic Spectra Database (Kramida et al., NIST SRD 78, doi:10.18434/T4W30F): emission lines, energy levels and ionisation energies of 26 elements. They are not distributed with the app. They are fetched once from the official NIST website (physics.nist.gov, about 130 requests, a few minutes) and stay saved in the app, so it then works offline.')}</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:6px 0">${N?`<button class="btn small primary" data-cf="nist">${T('Scarica i dati atomici dal NIST','Get the atomic data from NIST')}</button>
      <label class="btn small ghost" style="cursor:pointer">${T('Carica un file di dati…','Load a data file…')}<input type="file" data-cf="nistFile" accept=".js,.json,application/json,text/javascript" hidden></label>`:''}</div>
      <p class="why" data-cf="nistMsg" style="margin:2px 0" aria-live="polite"></p>`;
    const q=k=>wrap.querySelector('[data-cf="'+k+'"]'), msg=q('nistMsg'), done=()=>{ if (wrap.parentNode) wrap.parentNode.removeChild(wrap); render(box, f, d, els); };
    if (!N){ msg.textContent=T('Modulo dei dati atomici assente.','Atomic-data module missing.'); box.appendChild(wrap); return; }
    q('nist').onclick=async ()=>{ const b=q('nist'); b.disabled=true; msg.textContent=T('Collegamento al NIST…','Connecting to NIST…');
      try { await N.download((i,n)=>{ msg.textContent=T('Scarico dal NIST: ','Fetching from NIST: ')+i+' / '+n+'…'; }); msg.textContent=T('Dati atomici scaricati e salvati.','Atomic data fetched and saved.'); done(); }
      catch(e){ msg.innerHTML='△ '+errText(e); b.disabled=false; } };
    q('nistFile').onchange=async e=>{ const file=e.target.files&&e.target.files[0]; if (!file) return;
      try { const t=win.decodeBuffer ? win.decodeBuffer(await file.arrayBuffer()) : await file.text(); N.save(N.parseFile(t)); done(); }
      catch(err){ msg.innerHTML='△ '+(err&&err.code ? errText(err) : T('File non valido: ','Invalid file: ')+h(String(err&&err.message||err))); } };
    box.appendChild(wrap); }

  function render(box, f, d, els){
    const C=win.LibsCf; if (!C || !box) return; const D=win.LIBS_DATA || (win.AcchLibsNist && win.AcchLibsNist.load());
    if (!D) return renderGet(box, f, d, els);
    const st=f._cf||(f._cf={els:null, fwhm:'', ne:'Halpha', neVal:'', mode:'saha-boltzmann', noRes:true, open:false, res:null});
    // senza righe in banca dati (Sb) l'elemento non si può misurare: non si offre
    const avail=C.elementsIn(D).filter(e=>e!=='H' && C.linesOf(D, e, 'I').length+C.linesOf(D, e, 'II').length>0); if (!st.els) st.els=(els||[]).filter(e=>avail.includes(e));
    const wrap=doc.createElement('div'); wrap.className='libscf'; wrap.style.marginTop='10px';
    const paint=()=>{ wrap.innerHTML=`<h4 class="anh">CF-LIBS <small>(${T('sperimentale','experimental')})</small></h4>`+(!st.open ? `<p class="why" style="margin:2px 0">${T('Analisi quantitativa senza taratura (Ciucci et al. 1999): temperatura dal grafico di Boltzmann, densità elettronica da Stark, concentrazioni per chiusura a 100 %. Sperimentale: richiede plasma in equilibrio, otticamente sottile e risposta spettrale nota. Provata solo su spettri sintetici: non usarla per dichiarare concentrazioni.','Calibration-free quantitative analysis (Ciucci et al. 1999): temperature from the Boltzmann plot, electron density from Stark broadening, concentrations by closure to 100%. Experimental: needs a plasma in equilibrium, optically thin, and a known spectral response. Tested only on synthetic spectra: do not use it to report concentrations.')}</p><button class="btn small" data-cf="open">${T('CF-LIBS (sperimentale)…','CF-LIBS (experimental)…')}</button>` :
      `<div class="elrow"><b>${T('Elementi','Elements')}:</b> ${avail.map(e=>`<button class="pill ${st.els.includes(e)?'on':''}" data-cfel="${e}">${e}</button>`).join(' ')}</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;margin:6px 0">
        <label>${T('Larghezza strumentale FWHM (nm)','Instrument FWHM (nm)')} <input data-cf="fwhm" size="6" value="${h(st.fwhm)}" placeholder="${h(T('stima','estimate'))}"></label>
        <label>n_e <select data-cf="ne">${[['Halpha','Hα '+g(656.28,5)+' nm'],['Hbeta','Hβ '+g(486.13,5)+' nm'],['given',T('valore (cm⁻³)','value (cm⁻³)')],['iter',T('iterazione (1 atm)','iteration (1 atm)')]].map(([v,t])=>`<option value="${v}" ${st.ne===v?'selected':''}>${h(t)}</option>`).join('')}</select></label>
        ${st.ne==='given'?`<input data-cf="neVal" size="8" value="${h(st.neVal)}" placeholder="1e17">`:''}
        <label>${T('Metodo','Method')} <select data-cf="mode"><option value="saha-boltzmann" ${st.mode==='saha-boltzmann'?'selected':''}>Saha–Boltzmann</option><option value="boltzmann" ${st.mode==='boltzmann'?'selected':''}>${T('Boltzmann per specie','Boltzmann per species')}</option></select></label>
        <label class="check"><input type="checkbox" data-cf="noRes" ${st.noRes?'checked':''}> ${T('escludi le righe di risonanza','exclude resonance lines')}</label>
        <button class="btn small primary" data-cf="run">${T('Calcola','Compute')}</button></div>
      <div data-cf="out">${st.res?resultHtml(st.res):''}</div>
      <p class="why" style="margin-top:6px">${T('Dati atomici','Atomic data')}: ${h(D.source)}, ${T('scaricati dal NIST il','fetched from NIST on')} ${h(D.downloaded)}, ${T('salvati in questa app e non ridistribuibili','saved in this app and not to be redistributed')}. ${T('Coefficienti Stark non inclusi: niente correzione automatica dell\'autoassorbimento. Metodo e limiti: docs/CF-LIBS.md.','Stark coefficients not included: no automatic self-absorption correction. Method and limits: docs/CF-LIBS.md.')}</p>`);
      wrap.querySelectorAll('[data-cfel]').forEach(b=>b.onclick=()=>{ const e=b.dataset.cfel; st.els=st.els.includes(e)?st.els.filter(x=>x!==e):st.els.concat([e]); paint(); });
      const q=k=>wrap.querySelector('[data-cf="'+k+'"]');
      if (q('open')) q('open').onclick=()=>{ st.open=true; paint(); };
      if (q('fwhm')) q('fwhm').onchange=e=>{ st.fwhm=e.target.value; };
      if (q('neVal')) q('neVal').onchange=e=>{ st.neVal=e.target.value; };
      if (q('ne')) q('ne').onchange=e=>{ st.ne=e.target.value; paint(); };
      if (q('mode')) q('mode').onchange=e=>{ st.mode=e.target.value; };
      if (q('noRes')) q('noRes').onchange=e=>{ st.noRes=e.target.checked; };
      if (q('run')) q('run').onclick=()=>{ const out=q('out'); out.innerHTML=`<p class="why">${T('Calcolo…','Computing…')}</p>`;
        setTimeout(()=>{ try{
          const fw=num(st.fwhm), opt={elements:st.els, fwhmG:fw>0?fw:undefined, mode:st.mode, excludeResonance:st.noRes};
          if (st.ne==='Halpha'||st.ne==='Hbeta') opt.neFrom=st.ne; else if (st.ne==='given'){ const v=neNum(st.neVal); opt.ne=v>=1e13 && v<=1e21 ? v : -1; }   // valore assente o assurdo: -1 fa comparire l'avviso neInvalid (prima si passava in silenzio all'iterazione)
          st.res=C.analyze(D, Array.from(f.xs), Array.from(f.ys), opt);
          if (st.res && st.res.ok && st.res.elements && st.res.elements.length===1 && (!opt.closure || opt.closure==='sum')) (st.res.warnings=st.res.warnings||[]).unshift({code:'oneElement'});
          if ((st.ne==='Halpha'||st.ne==='Hbeta') && st.res.neSource==='iterated' && st.res.warnings) st.res.warnings.unshift({code:'noH'});
        }catch(e){ console.error(e); st.res={ok:false, why:String(e&&e.message||e)}; } out.innerHTML=resultHtml(st.res); }, 20); };
    };
    paint(); box.appendChild(wrap); }

  win.LibsCfUi={render, resultHtml, warnText};
})(typeof window!=='undefined' ? window : globalThis);
