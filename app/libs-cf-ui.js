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
      case 'neInvalid': return T('La densità elettronica data non è positiva: ignorata, n_e ricavata dallo spettro.', 'The given electron density is not positive: ignored, n_e derived from the spectrum.');
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
    s+=`<table class="areatab"><thead><tr><th>${T('Elemento','Element')}</th><th>${T('% atomica','atomic %')}</th><th>${T('% in peso','wt %')}</th><th>${T('stadi','stages')}</th><th>${T('righe','lines')}</th><th>${T('ionizzato','ionised')}</th></tr></thead><tbody>${
      r.elements.map(e=>`<tr><td>${h(e.el)}</td><td>${g(100*e.mol,3)} ± ${g(100*e.sMol,2)}</td><td>${g(100*e.wt,3)} ± ${g(100*e.sWt,2)}</td><td>${h(e.species.join('+'))}</td><td>${e.nLines}</td><td>${g(100*e.ionFrac,2)} %</td></tr>`).join('')}</tbody></table>`;
    s+=`<p class="why" style="margin:2px 0">${T('Incertezze: solo statistiche (regressione e A_ki), Monte Carlo; non comprendono gli errori di modello (LTE, autoassorbimento, risposta spettrale).','Uncertainties: statistical only (regression and A_ki), Monte Carlo; they exclude model errors (LTE, self-absorption, spectral response).')}${r.sumWt!==1?' '+T('Somma con lo standard interno','Sum with the internal standard')+': '+g(100*r.sumWt,4)+' %':''}</p>`;
    s+=`<h4 class="anh">${T('Grafico di Boltzmann','Boltzmann plot')}${r.mode==='saha-boltzmann'?' (Saha–Boltzmann)':''}</h4>`+plotSvg(r);
    s+=`<details><summary>${T('Tabella del grafico','Plot table')}</summary><table class="areatab"><thead><tr><th>${T('specie','species')}</th><th>λ (nm)</th><th>E_k (eV)</th><th>x (eV)</th><th>y = ln(I/gA)</th><th>σ_y</th><th>${T('residuo','residual')}</th></tr></thead><tbody>${
      r.points.map(p=>`<tr><td>${h(p.el+' '+p.st)}${p.resonance?' ʳ':''}</td><td>${g(p.wl,6)}</td><td>${g(p.Ek,4)}</td><td>${g(p.x,4)}</td><td>${g(p.y,4)}</td><td>${g(p.sy,2)}</td><td>${g(p.res,2)}</td></tr>`).join('')}</tbody></table><p class="why">ʳ ${T('riga di risonanza','resonance line')}</p></details>`;
    s+=`<h4 class="anh">${T('Avvisi','Warnings')}</h4><ul class="anlist">${r.warnings.map(w=>`<li class="lv-${/Fail|noConv/.test(w.code)?'bad':'warn'}"><span>△</span><div>${h(warnText(w))}</div></li>`).join('')}</ul>`;
    return s; }

  function render(box, f, d, els){
    const D=win.LIBS_DATA, C=win.LibsCf; if (!D || !C || !box) return;
    const st=f._cf||(f._cf={els:null, fwhm:'', ne:'Halpha', neVal:'', mode:'saha-boltzmann', noRes:true, open:false, res:null});
    const avail=C.elementsIn(D).filter(e=>e!=='H'); if (!st.els) st.els=(els||[]).filter(e=>avail.includes(e));
    const wrap=doc.createElement('div'); wrap.className='libscf'; wrap.style.marginTop='10px';
    const paint=()=>{ wrap.innerHTML=`<h4 class="anh">CF-LIBS <small>(${T('sperimentale','experimental')})</small></h4>`+(!st.open ? `<p class="why" style="margin:2px 0">${T('Analisi quantitativa senza taratura (Ciucci et al. 1999): temperatura dal grafico di Boltzmann, densità elettronica da Stark, concentrazioni per chiusura a 100 %. Sperimentale: richiede plasma in equilibrio, otticamente sottile e risposta spettrale nota.','Calibration-free quantitative analysis (Ciucci et al. 1999): temperature from the Boltzmann plot, electron density from Stark broadening, concentrations by closure to 100%. Experimental: needs a plasma in equilibrium, optically thin, and a known spectral response.')}</p><button class="btn small" data-cf="open">${T('CF-LIBS (sperimentale)…','CF-LIBS (experimental)…')}</button>` :
      `<div class="elrow"><b>${T('Elementi','Elements')}:</b> ${avail.map(e=>`<button class="pill ${st.els.includes(e)?'on':''}" data-cfel="${e}">${e}</button>`).join(' ')}</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;margin:6px 0">
        <label>${T('Larghezza strumentale FWHM (nm)','Instrument FWHM (nm)')} <input data-cf="fwhm" size="6" value="${h(st.fwhm)}" placeholder="${h(T('stima','estimate'))}"></label>
        <label>n_e <select data-cf="ne">${[['Halpha','Hα 656,28 nm'],['Hbeta','Hβ 486,13 nm'],['given',T('valore (cm⁻³)','value (cm⁻³)')],['iter',T('iterazione (1 atm)','iteration (1 atm)')]].map(([v,t])=>`<option value="${v}" ${st.ne===v?'selected':''}>${h(t)}</option>`).join('')}</select></label>
        ${st.ne==='given'?`<input data-cf="neVal" size="8" value="${h(st.neVal)}" placeholder="1e17">`:''}
        <label>${T('Metodo','Method')} <select data-cf="mode"><option value="saha-boltzmann" ${st.mode==='saha-boltzmann'?'selected':''}>Saha–Boltzmann</option><option value="boltzmann" ${st.mode==='boltzmann'?'selected':''}>${T('Boltzmann per specie','Boltzmann per species')}</option></select></label>
        <label class="check"><input type="checkbox" data-cf="noRes" ${st.noRes?'checked':''}> ${T('escludi le righe di risonanza','exclude resonance lines')}</label>
        <button class="btn small primary" data-cf="run">${T('Calcola','Compute')}</button></div>
      <div data-cf="out">${st.res?resultHtml(st.res):''}</div>
      <p class="why" style="margin-top:6px">${T('Dati atomici','Atomic data')}: ${h(D.source)}, ${T('scaricati il','downloaded on')} ${h(D.downloaded)}. ${T('Coefficienti Stark non inclusi: niente correzione automatica dell\'autoassorbimento. Metodo e limiti: docs/CF-LIBS.md.','Stark coefficients not included: no automatic self-absorption correction. Method and limits: docs/CF-LIBS.md.')}</p>`);
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
          if (st.ne==='Halpha'||st.ne==='Hbeta') opt.neFrom=st.ne; else if (st.ne==='given'){ const v=num(st.neVal); if (v>0) opt.ne=v; }
          st.res=C.analyze(D, Array.from(f.xs), Array.from(f.ys), opt);
          if ((st.ne==='Halpha'||st.ne==='Hbeta') && st.res.neSource==='iterated' && st.res.warnings) st.res.warnings.unshift({code:'noH'});
        }catch(e){ console.error(e); st.res={ok:false, why:String(e&&e.message||e)}; } out.innerHTML=resultHtml(st.res); }, 20); };
    };
    paint(); box.appendChild(wrap); }

  win.LibsCfUi={render, resultHtml, warnText};
})(typeof window!=='undefined' ? window : globalThis);
