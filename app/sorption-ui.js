// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
/* Fisisorbimento: interfaccia (schede della SPEC §4), importazione guidata, grafici SVG e su canvas per il PDF.
   I calcoli sono tutti in app/sorption-core.js (SorpCore). Usa le funzioni globali della pagina (files, cur, download…).
   Desktop: tono professionale, segni △ e ⊘ al posto delle emoji. */
(function(win){
  'use strict';
  const doc=win.document, $=s=>doc.querySelector(s);
  const en=()=>!!(win.AcchI18n && win.AcchI18n.lang==='en'), T=(it,e)=>en()?e:it, desk=()=>!!win.ACCH_SHELL;
  const SIG=lv=>lv==='stop'?(desk()?'⊘':'⛔'):(desk()?'△':'⚠️');
  const h=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const dec=()=>en()?'.':',';
  const g=(v,d)=>v==null||!Number.isFinite(+v)?'—':(Math.abs(v)>=1e5||(Math.abs(v)<1e-3&&v!==0))?(+v).toExponential((d||4)-1).replace('.',dec()):String(+(+v).toPrecision(d||4)).replace('.',dec());
  const num=s=>{ const v=parseFloat(String(s).replace(',','.')); return Number.isFinite(v)?v:null; };
  const C={ads:'#1f5fbf', des:'#c25a00', fit:'#2a9d5c', alt:'#7b4fc9', grid:'currentColor'};
  const allFiles=()=>(typeof files!=='undefined'?files:[]);   // «let files» della pagina: non è una proprietà di window
  // impostazioni salvate nel progetto: f.an.sorp e f.an.chem (memoria dello spettro, formato 2), ripulite da SorpCore.cleanOpt; lo stato della vista resta in f._sorpRt
  const keyOf=q=>q.path||q.name;
  const optOf=f=>{ const o=f.an&&f.an.sorp; if (o && typeof o==='object') return o.over ? o : Object.assign({}, o, {over:{}}); return {over:{}}; };   // sola lettura se non c'è niente di salvato
  const own=f=>{ f.an=f.an||{}; if (!f.an.sorp || typeof f.an.sorp!=='object') f.an.sorp={}; if (!f.an.sorp.over) f.an.sorp.over={}; return f.an.sorp; };   // al primo cambio
  const rtOf=f=>(f._sorpRt=f._sorpRt||{tab:'iso'});
  function commit(f, kind){ const k=kind||'sorp'; if (!f.an) return; const c=SorpCore.cleanOpt(k, f.an[k]); if (c) f.an[k]=c; else delete f.an[k]; if (!Object.keys(f.an).length) f.an=null; try{ if (typeof persist==='function') persist(f); }catch(e){} }

  /* ---------------- calcolo con cache per file e opzioni ---------------- */
  function run(f){
    const o=optOf(f), key=JSON.stringify([o.over, o.betRange, o.langRange, o.tRange, o.tModel, o.tpvX, o.tpvMode, o.bjhBranch, o.bjhThick, o.drRange, o.lambda, o.kernel&&o.kernel.name, o.alphaRefKey, o.alphaS]);
    if (f._sorpRes && f._sorpKey===key) return f._sorpRes;
    let alphaRef=null; if (o.alphaRefKey){ const r=allFiles().find(q=>keyOf(q)===o.alphaRefKey && q.iso); if (r) alphaRef={x:SorpCore.branch(r.iso,'ads').x, n:SorpCore.branch(r.iso,'ads').n, S:o.alphaS}; }
    const A=SorpCore.analyze(f.iso, o.over, {betRange:o.betRange, langRange:o.langRange, tRange:o.tRange, tModel:o.tModel, tpvX:o.tpvX, tpvMode:o.tpvMode, bjhBranch:o.bjhBranch, bjhThick:o.bjhThick, drRange:o.drRange, kernel:o.kernel, lambda:o.lambda, alphaRef});
    f._sorpRes=A; f._sorpKey=key; return A;
  }

  /* ---------------- grafici: una specifica, due pittori (SVG a schermo, canvas nel PDF) ---------------- */
  function scale(v, a, b, A, B, log){ if (log){ v=Math.log10(v); a=Math.log10(a); b=Math.log10(b); } return A+(v-a)/(b-a||1)*(B-A); }
  function ticks(a, b, log){ if (log){ const out=[]; for (let e=Math.floor(Math.log10(a)); e<=Math.ceil(Math.log10(b)); e++){ const v=Math.pow(10,e); if (v>=a*0.999 && v<=b*1.001) out.push(v); } return out; }
    const span=b-a||1, raw=span/5, p=Math.pow(10,Math.floor(Math.log10(raw))), st=[1,2,2.5,5,10].map(k=>k*p).find(k=>span/k<=6)||p*10, out=[]; for (let v=Math.ceil(a/st)*st; v<=b+st*1e-9; v+=st) out.push(Math.abs(v)<st*1e-9?0:v); return out; }
  function extent(S, k, log){ let lo=Infinity, hi=-Infinity; S.forEach(s=>s[k].forEach(v=>{ if (Number.isFinite(v) && (!log||v>0)){ lo=Math.min(lo,v); hi=Math.max(hi,v); } })); if (!(hi>lo)){ hi=lo+1; } if (!log){ const pad=(hi-lo)*0.04; lo-=pad; hi+=pad; } return [lo,hi]; }
  function paint(spec, P, W, H){
    const S=spec.series.filter(s=>s.x.length), m={l:62, r:spec.y2?58:14, t:10, b:42}, X0=m.l, X1=W-m.r, Y0=H-m.b, Y1=m.t;
    const xr=spec.xr||extent(S,'x',spec.logx), yS=S.filter(s=>!s.y2), y2S=S.filter(s=>s.y2), yr=spec.yr||extent(yS.length?yS:S,'y',spec.logy), y2r=y2S.length?extent(y2S,'y'):null;
    const sx=v=>scale(v,xr[0],xr[1],X0,X1,spec.logx), sy=(v,s)=>s&&s.y2&&y2r?scale(v,y2r[0],y2r[1],Y0,Y1):scale(v,yr[0],yr[1],Y0,Y1,spec.logy);
    P.rect(X0,Y1,X1-X0,Y0-Y1);
    ticks(xr[0],xr[1],spec.logx).forEach(v=>{ const x=sx(v); P.line(x,Y0,x,Y0+4,'#888',1); P.text(x,Y0+16,g(v,3),'middle',10); });
    ticks(yr[0],yr[1],spec.logy).forEach(v=>{ const y=sy(v); P.line(X0-4,y,X0,y,'#888',1); P.text(X0-6,y+3,g(v,3),'end',10); });
    if (y2r) ticks(y2r[0],y2r[1]).forEach(v=>{ const y=scale(v,y2r[0],y2r[1],Y0,Y1); P.line(X1,y,X1+4,y,'#888',1); P.text(X1+6,y+3,g(v,3),'start',10); });
    P.text((X0+X1)/2, H-8, spec.xlabel||'', 'middle', 11); P.text(14, (Y0+Y1)/2, spec.ylabel||'', 'middle', 11, -90); if (spec.y2) P.text(W-10, (Y0+Y1)/2, spec.y2, 'middle', 11, 90);
    const inside=(x,y)=>x>=X0-0.5&&x<=X1+0.5&&y>=Y1-0.5&&y<=Y0+0.5;
    for (const s of S){ const pts=[]; s.x.forEach((v,i)=>{ const yv=s.y[i]; if (!Number.isFinite(v)||!Number.isFinite(yv)||(spec.logx&&v<=0)||(spec.logy&&yv<=0)) return; const x=sx(v), y=sy(yv,s); if (inside(x,y)) pts.push([x,y]); });
      if (s.line && pts.length>1) P.poly(pts, s.color, s.width||1.6, s.dash);
      if (s.mark) pts.forEach(([x,y])=>P.dot(x,y,s.color, s.mark==='open'));
      if (s.err) s.x.forEach((v,i)=>{ const e=s.err[i]; if (!Number.isFinite(e)) return; const x=sx(v), a=sy(s.y[i]-e,s), b=sy(s.y[i]+e,s); P.line(x,a,x,b,s.color,1); }); }
    let ly=Y1+12; S.filter(s=>s.label).forEach(s=>{ P.line(X1-120,ly-3,X1-104,ly-3,s.color,2); if (s.mark) P.dot(X1-112,ly-3,s.color,s.mark==='open'); P.text(X1-100,ly,s.label,'start',10); ly+=13; });
  }
  function svg(spec, W, H){ W=W||560; H=H||300; const out=[];
    const P={rect:(x,y,w,hh)=>out.push(`<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="none" stroke="currentColor" stroke-opacity=".5"/>`),
      line:(a,b,c,d,col,w)=>out.push(`<line x1="${a.toFixed(1)}" y1="${b.toFixed(1)}" x2="${c.toFixed(1)}" y2="${d.toFixed(1)}" stroke="${col}" stroke-width="${w}"/>`),
      text:(x,y,t,anc,sz,rot)=>out.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${sz}" text-anchor="${anc}" fill="currentColor"${rot?` transform="rotate(${rot} ${x} ${y})"`:''}>${h(t)}</text>`),
      poly:(pts,col,w,dash)=>out.push(`<polyline fill="none" stroke="${col}" stroke-width="${w}"${dash?' stroke-dasharray="5 4"':''} points="${pts.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ')}"/>`),
      dot:(x,y,col,open)=>out.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${open?'none':col}" stroke="${col}" stroke-width="1.3"/>`)};
    paint(spec, P, W, H); return `<svg class="sorpchart" viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" role="img" aria-label="${h(spec.ylabel+' / '+spec.xlabel)}">${out.join('')}</svg>`; }
  function canvas(spec, W, H){ const c=doc.createElement('canvas'), k=3; c.width=W*k; c.height=H*k; const x=c.getContext('2d'); x.scale(k,k); x.fillStyle='#fff'; x.fillRect(0,0,W,H); x.font='10px Helvetica, Arial';
    const P={rect:(a,b,w,hh)=>{ x.strokeStyle='#999'; x.lineWidth=1; x.strokeRect(a,b,w,hh); }, line:(a,b,c2,d,col,w)=>{ x.strokeStyle=col==='currentColor'?'#333':col; x.lineWidth=w; x.beginPath(); x.moveTo(a,b); x.lineTo(c2,d); x.stroke(); },
      text:(a,b,t,anc,sz,rot)=>{ x.save(); x.fillStyle='#222'; x.font=sz+'px Helvetica, Arial'; x.textAlign=anc==='middle'?'center':anc==='end'?'right':'left'; x.translate(a,b); if (rot) x.rotate(rot*Math.PI/180); x.fillText(t,0,0); x.restore(); },
      poly:(pts,col,w,dash)=>{ x.strokeStyle=col; x.lineWidth=w; x.setLineDash(dash?[5,4]:[]); x.beginPath(); pts.forEach((p,i)=>i?x.lineTo(p[0],p[1]):x.moveTo(p[0],p[1])); x.stroke(); x.setLineDash([]); },
      dot:(a,b,col,open)=>{ x.beginPath(); x.arc(a,b,3,0,2*Math.PI); if (open){ x.strokeStyle=col; x.lineWidth=1.3; x.stroke(); } else { x.fillStyle=col; x.fill(); } }};
    paint(spec, P, W, H); return c; }

  /* ---------------- specifiche dei grafici ---------------- */
  const unitN=f=>optOf(f).mmol?'mmol/g':'cm³ STP/g', cvN=f=>optOf(f).mmol?(v=>SorpCore.toMmol(v)):(v=>v);
  function specIso(f, logx){ const A=SorpCore.branch(f.iso,'ads'), D=SorpCore.branch(f.iso,'des'), cv=cvN(f);
    return {series:[{x:A.x, y:A.n.map(cv), color:C.ads, mark:'fill', line:true, width:1, label:T('adsorbimento','adsorption')}, {x:D.x, y:D.n.map(cv), color:C.des, mark:'open', line:true, width:1, label:T('desorbimento','desorption')}],
      xlabel:T('Pressione relativa p/p₀','Relative pressure p/p₀'), ylabel:T('Quantità adsorbita','Amount adsorbed')+' ('+unitN(f)+')', logx}; }
  function specBET(f, A){ const B=A.bet&&A.bet.used, Ad=SorpCore.branch(f.iso,'ads'), pts=Ad.x.map((x,i)=>({x, y:x/(Ad.n[i]*(1-x))})).filter(o=>o.x>0&&o.x<0.5&&o.y>0);
    const s=[{x:pts.map(o=>o.x), y:pts.map(o=>o.y), color:'#999', mark:'open', label:T('punti','points')}];
    if (B){ s.push({x:B.X, y:B.Y, color:C.ads, mark:'fill', label:T('intervallo usato','range used')}); s.push({x:[B.x0,B.x1], y:[B.icpt+B.slope*B.x0, B.icpt+B.slope*B.x1], color:C.fit, line:true}); }
    return {series:s, xlabel:'p/p₀', ylabel:'(p/p₀) / [n (1 − p/p₀)]  (g/cm³ STP)'}; }
  function specRouq(f, A){ const Ad=SorpCore.branch(f.iso,'ads'), B=A.bet&&A.bet.used, i=Ad.x.map((_,k)=>k).filter(k=>Ad.x[k]>0&&Ad.x[k]<0.6);
    const s=[{x:i.map(k=>Ad.x[k]), y:i.map(k=>Ad.n[k]*(1-Ad.x[k])), color:C.ads, mark:'fill', line:true, width:1}]; if (B) s.push({x:[B.x0,B.x0,B.x1,B.x1], y:[0,1e9,1e9,0].map(()=>NaN), color:C.fit});
    return {series:s, xlabel:'p/p₀', ylabel:'n (1 − p/p₀)  (cm³ STP/g)'}; }
  function specT(A){ const t=A.tplot; if (!t||!t.pts) return null; const s=[{x:t.pts.map(o=>o.t), y:t.pts.map(o=>o.n), color:C.ads, mark:'fill', label:T('punti','points')}];
    if (t.slope!=null){ const xs=t.pts.map(o=>o.t), a=Math.min(...xs), b=Math.max(...xs); s.push({x:[0,b], y:[t.icpt, t.icpt+t.slope*b], color:C.fit, line:true, label:T('retta','line')}); }
    return {series:s, xlabel:'t (Å)', ylabel:'n (cm³ STP/g)', xr:[0, Math.max(...t.pts.map(o=>o.t))*1.05]}; }
  function specBJH(B){ if (!B||B.err) return null; const r=B.rows; return {series:[{x:r.map(o=>o.d/10), y:r.map(o=>o.dVdlogd), color:C.ads, mark:'fill', line:true, label:'dV/dlog d'}, {x:r.map(o=>o.d/10), y:r.map(o=>o.cumV), color:C.des, line:true, dash:true, y2:true, label:T('cumulato','cumulative')}],
    xlabel:T('Diametro dei pori (nm)','Pore diameter (nm)'), ylabel:'dV/dlog d (cm³/g)', y2:T('Volume cumulato (cm³/g)','Cumulative volume (cm³/g)'), logx:true}; }
  function specDR(A){ const d=A.dr; if (!d||d.err) return null; const L=d.pts.map(o=>Math.log10(1/o.x)**2), s=[{x:L, y:d.pts.map(o=>Math.log10(o.W)), color:C.ads, mark:'fill', label:T('punti','points')}];
    if (d.D){ const a=Math.min(...L), b=Math.max(...L); s.push({x:[a,b], y:[Math.log10(d.W0)-d.D*a, Math.log10(d.W0)-d.D*b], color:C.fit, line:true, label:'DR'}); }
    return {series:s, xlabel:'log²(p₀/p)', ylabel:'log W (cm³/g)'}; }

  /* ---------------- parti dell'interfaccia ---------------- */
  const srcLab=s=>({file:T('dal file','from the file'), utente:T('scritto da te','entered by you'), predefinito:T('valore predefinito','default value'), libreria:T('dalla libreria','from the library'), mancante:T('mancante','missing')})[s]||s||'';
  function paramsBox(f, A){ const P=A.P, o=optOf(f).over, rows=[['gas',T('Adsorbato','Adsorbate'),P.gasName,''],['sigma',T('Sezione molecolare σ','Cross-sectional area σ'),P.sigma,'nm²'],['T',T('Temperatura','Temperature'),P.T,'K'],['rhoL',T('Densità del liquido','Liquid density'),P.rhoL,'g/cm³'],['gamma',T('Tensione superficiale','Surface tension'),P.gamma,'mN/m'],['M',T('Massa molare','Molar mass'),P.M,'g/mol'],['theta',T('Angolo di contatto','Contact angle'),P.theta,'°']];
    const gasSel=`<select data-sp="gas"><option value="">${T('dal file','from the file')}</option>${Object.keys(SorpCore.ADSORBATES).map(k=>`<option value="${k}" ${o.gas===k?'selected':''}>${SorpCore.ADSORBATES[k].name}</option>`).join('')}</select>`;
    return `<details class="sorppar"><summary><b>${T('Parametri di riduzione','Data reduction parameters')}</b> <small>${h(P.gasName||'?')} · σ ${g(P.sigma)} nm² · ${g(P.T)} K · STP ${P.stp==='iupac'?'0 °C/100 kPa':'0 °C/1 atm'}</small></summary>
      <table class="areatab"><thead><tr><th>${T('Grandezza','Quantity')}</th><th>${T('Valore','Value')}</th><th>${T('Unità','Unit')}</th><th>${T('Da dove viene','Source')}</th><th>${T('Cambia','Change')}</th></tr></thead><tbody>
      ${rows.map(([k,l,v,u])=>`<tr><td>${l}</td><td>${k==='gas'?h(v||'—'):g(v,5)}</td><td>${u}</td><td>${srcLab(k==='gas'?(o.gas?'utente':(f.iso.meta.gas?'file':'mancante')):P.src[k])}</td><td>${k==='gas'?gasSel:`<input type="text" inputmode="decimal" size="7" data-sp="${k}" value="${o[k]!=null?String(o[k]).replace('.',dec()):''}" placeholder="${T('dal file','from file')}">`}</td></tr>`).join('')}
      <tr><td>STP</td><td>${g(P.vmol,6)}</td><td>cm³/mol</td><td>${P.stp==='iupac'?T('scelto da te','chosen by you'):T('come Kaomi (0 °C, 1 atm)','as Kaomi (0 °C, 1 atm)')}</td><td><select data-sp="stp"><option value="stp">0 °C, 101,325 kPa</option><option value="iupac" ${P.stp==='iupac'?'selected':''}>0 °C, 100 kPa</option></select></td></tr>
      <tr><td>${T('Modello di spessore','Thickness model')}</td><td colspan="2">${h(SorpCore.THICK[P.thick]?SorpCore.THICK[P.thick].name:P.thick)}</td><td>${srcLab(P.src.thick)}</td><td><select data-sp="thick">${Object.keys(SorpCore.THICK).map(k=>`<option value="${k}" ${P.thick===k?'selected':''}>${h(SorpCore.THICK[k].name)}</option>`).join('')}</select></td></tr>
      </tbody></table><p class="why">${T('Ogni numero dipende da questi parametri: i valori del file hanno la precedenza sui predefiniti, quelli scritti qui su tutti. La libreria dello strumento e del tipo di campione li fornirà con la tappa I4.','Every number depends on these parameters: file values take precedence over defaults, values entered here over everything. The library for the instrument and sample type will supply them from stage I4.')}</p></details>`; }
  function warnBox(A, tab){ const W=(A.warnings||[]).filter(w=>w.k!=='lang' || tab==='lang');   // l'avviso su Langmuir solo nella sua scheda if (!W.length) return `<p class="why">${T('Nessun avviso.','No warnings.')}</p>`;
    return `<ul class="anlist sorpwarn">${W.sort((a,b)=>(a.lv==='stop'?0:1)-(b.lv==='stop'?0:1)).map(w=>`<li class="${w.lv==='stop'?'lv-bad':'lv-warn'}" data-k="${w.k}">${SIG(w.lv)} ${h(trW(w.t))}</li>`).join('')}</ul>`; }
  const trW=t=>en()&&win.AcchI18n?win.AcchI18n.tr(t):t;
  const table=(head, rows)=>`<div class="areawrap"><table class="areatab"><thead><tr>${head.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const rng=(k,a,b,lab)=>`<label class="ibf"><span>${lab||T('da','from')}</span><input type="text" inputmode="decimal" size="7" data-r="${k}" data-i="0" value="${a!=null?String(a).replace('.',dec()):''}"></label><label class="ibf"><span>${T('a','to')}</span><input type="text" inputmode="decimal" size="7" data-r="${k}" data-i="1" value="${b!=null?String(b).replace('.',dec()):''}"></label>`;
  const crit=c=>['a','b','c','d'].map(k=>`<span class="${c&&c[k]?'ok':'no'}" title="${h({a:T('n(1−p/p₀) crescente','n(1−p/p₀) increasing'),b:'C > 0',c:T('p/p₀ del monostrato nell\'intervallo','monolayer p/p₀ inside the range'),d:T('1/(√C+1) entro il 10%','1/(√C+1) within 10%')}[k])}">${k} ${c&&c[k]?'✓':'✗'}</span>`).join(' ');

  const TABS=[['iso',T('Isoterma','Isotherm')],['bet','BET'],['lang','Langmuir'],['t','t-plot / αs'],['pori',T('Pori','Pores')],['micro',T('Micropori','Micropores')],['dft','DFT'],['qst',T('Calore isosterico','Isosteric heat')],['cmp',T('Confronto','Comparison')]];
  function tabIso(f, A){ const o=optOf(f), m=f.iso.meta, I=A.iupac;
    const meta=[[T('Software','Software'),m.software],[T('Strumento','Instrument'),m.instrument],[T('Stazione','Station'),m.station],[T('Campione','Sample'),m.sampleId],[T('Massa','Mass'),m.mass_g!=null?g(m.mass_g,5)+' g':''],[T('Adsorbato','Adsorbate'),m.gas],[T('Temperatura','Temperature'),m.T!=null?g(m.T,5)+' K':''],[T('Data','Date'),m.date],[T('Punti','Points'),`${SorpCore.branch(f.iso,'ads').x.length} ${T('adsorbimento','adsorption')} · ${Math.max(0,SorpCore.branch(f.iso,'des').x.length-1)} ${T('desorbimento','desorption')}`]].filter(r=>r[1]);
    return `<div class="ibfields"><label class="check"><input type="checkbox" data-o="logx" ${o.logx?'checked':''}> ${T('asse p/p₀ logaritmico','logarithmic p/p₀ axis')}</label><label class="check"><input type="checkbox" data-o="mmol" ${o.mmol?'checked':''}> mmol/g</label></div>
      ${svg(specIso(f,o.logx))}
      ${I?`<p><b>${T('Tipo IUPAC suggerito','Suggested IUPAC type')}: ${h(I.type)}${I.hyst?' · '+T('isteresi','hysteresis')+' '+h(I.hyst):''}</b><br><small>${T('Solo un suggerimento motivato (Thommes et al., 2015)','Only a reasoned suggestion (Thommes et al., 2015)')}: ${h(I.why.map(trW).join('; '))}.</small></p>`:''}
      ${table([T('Dal file','From the file'),''], meta.map(r=>[r[0],h(r[1])]))}`; }
  function tabBET(f, A){ const B=A.bet||{}, U=B.used, o=optOf(f);
    const row=(lab,F)=>F?[lab, `${g(F.x0)}–${g(F.x1)}`, F.npts, g(F.area,5), g(F.C,4), g(F.nm,4), g(F.r,6), crit(F.crit)]:[lab,'—','','','','','',''];
    const rows=[row(o.betRange?T('scelto da te','chosen by you'):T('automatico (Rouquerol)','automatic (Rouquerol)'), U)];
    if (o.betRange && B.auto) rows.push(row(T('automatico','automatic'), B.auto));
    if (B.instr) rows.push(row(T('dello strumento (dal file)','instrument (from the file)'), B.instr));
    (B.alternatives||[]).slice(0,4).forEach((F,i)=>rows.push(row(T('alternativa ','alternative ')+(i+1), F)));
    const ir=f.iso.meta.instrResults;
    return `${svg(specBET(f,A))}<div class="ibfields">${rng('betRange', o.betRange&&o.betRange[0], o.betRange&&o.betRange[1], T('Intervallo p/p₀ da','p/p₀ range from'))}<button class="btn small" data-act="betAuto">${T('Torna all\'automatico','Back to automatic')}</button></div>
      ${table([T('Intervallo','Range'),'p/p₀',T('punti','points'),T('Area (m²/g)','Area (m²/g)'),'C','nₘ (cm³ STP/g)','r',T('criteri','criteria')], rows)}
      ${B.diffInstrPct!=null?`<p>${T('Differenza rispetto all\'intervallo dello strumento','Difference from the instrument range')}: <b>${g(B.diffInstrPct,3)} %</b></p>`:''}
      ${ir&&ir.area?`<p class="why">${T('Area scritta nel file dallo strumento','Area written in the file by the instrument')}: ${g(ir.area,6)} m²/g${ir.C?' · C '+g(ir.C,6):''}.</p>`:''}
      <p class="why">${T('Scelta automatica: tra le finestre di almeno 3 punti consecutivi che rispettano i quattro criteri di Rouquerol (ISO 9277:2022) vince la più ampia, a pari merito quella con r maggiore. Con le stesse isoterme laboratori diversi ottengono BET molto diversi: per questo intervallo e criteri sono sempre mostrati.','Automatic choice: among windows of at least 3 consecutive points that meet the four Rouquerol criteria (ISO 9277:2022) the widest wins, ties broken by the highest r. Different labs get very different BET values from the same isotherms: range and criteria are therefore always shown.')}</p>
      ${svg(specRouq(f,A),560,220)}`; }
  function tabLang(f, A){ const L=A.langmuir, o=optOf(f); const I=A.iupac;
    return `<div class="ibfields">${rng('langRange', (o.langRange||[0.05,0.3])[0], (o.langRange||[0.05,0.3])[1], T('Intervallo p/p₀ da','p/p₀ range from'))}</div>
      ${L&&!L.err?table([T('Modello','Model'),T('Area (m²/g)','Area (m²/g)'),'nₘ (cm³ STP/g)','K','r'],[[T('lineare (p/n contro p)','linear (p/n vs p)'),g(L.lin.area,5),g(L.lin.nm,5),g(L.lin.K,4),g(L.lin.r,6)],[T('non lineare','non-linear'),g(L.nl.area,5),g(L.nl.nm,5),g(L.nl.K,4),'']]):`<p class="why">${T('Pochi punti nell\'intervallo.','Too few points in the range.')}</p>`}
      ${I&&/^(II|IV)/.test(I.type)?`<p class="warn">${SIG('warn')} ${T('Su un\'isoterma di tipo II o IV Langmuir non ha significato fisico: il numero è solo un indice.','On a type II or IV isotherm Langmuir has no physical meaning: the number is only an index.')}</p>`:''}`; }
  function tabT(f, A){ const t=A.tplot, o=optOf(f), a=A.alpha, others=allFiles().filter(q=>q.iso && q!==f);
    const sp=specT(A);
    return `<div class="ibfields"><label class="ibf"><span>${T('Spessore','Thickness')}</span><select data-o="tModel">${Object.keys(SorpCore.THICK).map(k=>`<option value="${k}" ${(t&&t.model)===k?'selected':''}>${h(SorpCore.THICK[k].name)}</option>`).join('')}</select></label>${rng('tRange', (o.tRange&&o.tRange.x||[0.2,0.5])[0], (o.tRange&&o.tRange.x||[0.2,0.5])[1], T('p/p₀ da','p/p₀ from'))}</div>
      ${sp?svg(sp):''}
      ${t&&!t.err?table([T('Area esterna (m²/g)','External area (m²/g)'),T('Volume dei micropori (cm³/g)','Micropore volume (cm³/g)'),T('Pendenza','Slope'),'r',T('punti','points')],[[g(t.Sext,5),g(t.Vmicro,4),g(t.slope,5),g(t.r,6),t.npts]]):`<p class="why">${T('Pochi punti nell\'intervallo.','Too few points in the range.')}</p>`}
      ${t&&t.Vmicro<0?`<p class="warn">${SIG('warn')} ${T('Intercetta negativa: nessun volume di micropori misurabile con questo intervallo.','Negative intercept: no measurable micropore volume with this range.')}</p>`:''}
      <h4>αs</h4><div class="ibfields"><label class="ibf"><span>${T('Riferimento non poroso','Non-porous reference')}</span><select data-o="alphaRefKey"><option value="">—</option>${others.map(q=>`<option value="${h(keyOf(q))}" ${o.alphaRefKey===keyOf(q)?'selected':''}>${h(q.title||q.name)}</option>`).join('')}</select></label><label class="ibf"><span>${T('Area BET del riferimento (m²/g)','BET area of the reference (m²/g)')}</span><input type="text" inputmode="decimal" size="7" data-o="alphaS" value="${o.alphaS!=null?o.alphaS:''}"></label></div>
      ${a&&!a.err?table([T('Area esterna (m²/g)','External area (m²/g)'),T('Volume dei micropori (cm³/g)','Micropore volume (cm³/g)'),'r'],[[g(a.Sext,5),g(a.Vmicro,4),g(a.r,6)]]):`<p class="why">${others.length?T('Scegli un\'isoterma di riferimento caricata e la sua area.','Choose a loaded reference isotherm and its area.'):T('Carica anche l\'isoterma di un riferimento non poroso dello stesso adsorbato.','Also load the isotherm of a non-porous reference with the same adsorbate.')}</p>`}`; }
  function tabPori(f, A){ const V=A.tpv, o=optOf(f), B=A.bjh, D=A.dh, H=A.iupac&&A.iupac.H;
    return `<div class="ibfields"><label class="ibf"><span>${T('Volume totale a p/p₀','Total volume at p/p₀')}</span><input type="text" inputmode="decimal" size="6" data-o="tpvX" value="${String(o.tpvX||0.99).replace('.',dec())}"></label><label class="ibf"><span>${T('Punto','Point')}</span><select data-o="tpvMode"><option value="">${T('misurato più vicino (come Kaomi)','nearest measured (as Kaomi)')}</option><option value="interp" ${o.tpvMode==='interp'?'selected':''}>${T('interpolato','interpolated')}</option></select></label></div>
      ${V&&!V.err?table([T('Volume totale (cm³/g)','Total volume (cm³/g)'),T('a p/p₀','at p/p₀'),T('pori più piccoli di (nm)','pores smaller than (nm)'),T('Diametro medio 4V/S (nm)','Average diameter 4V/S (nm)')],[[g(V.V,5),g(V.x,6),g(V.dmax/10,5),g(V.dAvg/10,4)]]):`<p class="why">${T('Volume totale non calcolabile (densità del liquido mancante o punti fuori intervallo).','Total volume cannot be computed (missing liquid density or points out of range).')}</p>`}
      <h4>BJH ${T('e','and')} Dollimore–Heal</h4>
      <div class="ibfields"><label class="ibf"><span>${T('Ramo','Branch')}</span><select data-o="bjhBranch"><option value="ads" ${B&&B.branch==='ads'?'selected':''}>${T('adsorbimento','adsorption')}</option><option value="des" ${B&&B.branch==='des'?'selected':''}>${T('desorbimento','desorption')}</option></select></label><label class="ibf"><span>${T('Spessore','Thickness')}</span><select data-o="bjhThick"><option value="">${T('come nei parametri','as in the parameters')}</option>${Object.keys(SorpCore.THICK).map(k=>`<option value="${k}" ${o.bjhThick===k?'selected':''}>${h(SorpCore.THICK[k].name)}</option>`).join('')}</select></label></div>
      ${B&&!B.err?svg(specBJH(B))+table([T('Metodo','Method'),T('Volume cumulato (cm³/g)','Cumulative volume (cm³/g)'),T('Area cumulata (m²/g)','Cumulative area (m²/g)'),T('Moda dV(d) (nm)','Mode dV(d) (nm)'),T('Moda dV(log d) (nm)','Mode dV(log d) (nm)')],[['BJH',g(B.Vtot,5),g(B.Atot,5),g(B.mode/10,4),g(B.modeLog/10,4)]].concat(D&&!D.err?[['DH',g(D.Vtot,5),g(D.Atot,5),g(D.mode/10,4),g(D.modeLog/10,4)]]:[])):`<p class="why">${T('BJH non calcolabile: servono densità e tensione superficiale del liquido e almeno 3 punti sopra p/p₀ = 0,35.','BJH cannot be computed: liquid density and surface tension and at least 3 points above p/p₀ = 0.35 are needed.')}</p>`}
      ${H&&H.has&&Number.isFinite(H.close)?`<p class="why">${T('Chiusura dell\'isteresi a p/p₀ ≈ ','Hysteresis closes at p/p₀ ≈ ')+g(H.close,3)}. ${T('Pori cilindrici, menisco emisferico, angolo di contatto dai parametri; ogni diametro è la media degli estremi dell\'intervallo, come nelle tabelle di Kaomi.','Cylindrical pores, hemispherical meniscus, contact angle from the parameters; each diameter is the mean of the interval ends, as in Kaomi tables.')}</p>`:''}
      ${B&&!B.err?`<details><summary>${T('Tabella BJH','BJH table')} (${B.rows.length})</summary>${table(['d (nm)','V (cm³/g)',T('V cumulato','cumulative V'),'A (m²/g)','dV/dd','dV/dlog d'], B.rows.map(r=>[g(r.d/10,4),g(r.Vp,4),g(r.cumV,4),g(r.A,4),g(r.dVdd,4),g(r.dVdlogd,4)]))}</details>`:''}`; }
  function tabMicro(f, A){ const o=optOf(f), r=o.drRange||[1e-6,0.1], d=A.dr, a=A.da, sp=specDR(A);
    return `<div class="ibfields">${rng('drRange', r[0], r[1], T('p/p₀ da','p/p₀ from'))}</div>${sp?svg(sp):''}
      ${d&&!d.err?table([T('Modello','Model'),'W₀ (cm³/g)','E (kJ/mol)','n','r'].concat(d.E0?['E₀ (kJ/mol)','L (nm)']:[]), [['Dubinin–Radushkevich',g(d.W0,5),g(d.E,4),'2',g(d.r,6)].concat(d.E0?[g(d.E0,4),d.L?g(d.L,3):'—']:[])].concat(a&&!a.err?[['Dubinin–Astakhov',g(a.W0,5),g(a.E,4),g(a.n,3),g(a.r,6)].concat(d.E0?[g(a.E0,4),a.L?g(a.L,3):'—']:[])]:[])):`<p class="why">${T('Servono almeno 3 punti nell\'intervallo e la densità del liquido.','At least 3 points in the range and the liquid density are needed.')}</p>`}
      <p class="why">${T('W₀ è il volume dei micropori, E l\'energia caratteristica dell\'adsorbato. Con CO₂ a 273 K E₀ = E/β (β supposto 0,35) e la larghezza L secondo Stoeckli vale solo per E₀ tra 20 e 42 kJ/mol.','W₀ is the micropore volume, E the characteristic energy of the adsorbate. With CO₂ at 273 K E₀ = E/β (β assumed 0.35) and the width L after Stoeckli is valid only for E₀ between 20 and 42 kJ/mol.')}</p>`; }
  function tabDFT(f, A){ const o=optOf(f), X=f.iso.meta.dftExport, D=A.dft;
    const imp=X&&X.rows&&X.rows.length?svg({series:[{x:X.rows.map(r=>r.w), y:X.rows.map(r=>r.cumV), color:C.ads, line:true, mark:'fill', label:T('cumulato','cumulative')}], xlabel:T('Larghezza dei pori (nm)','Pore width (nm)'), ylabel:'V (cm³/g)', logx:true})+`<p><b>${h(trW(X.label))}</b></p>`:'';
    return `<p class="why">${T('Nessun kernel DFT è incluso: quelli di Kaomi sono proprietari. Si può (a) vedere la distribuzione DFT esportata da Kaomi, marcata come tale, oppure (b) usare un kernel tuo (CSV: «p/p0» seguito dalle larghezze in nm; nelle righe le isoterme di poro singolo in cm³ STP per cm³ di poro).','No DFT kernel is included: Kaomi kernels are proprietary. You can (a) view the DFT distribution exported by Kaomi, labelled as such, or (b) use your own kernel (CSV: «p/p0» followed by widths in nm; rows hold single-pore isotherms in cm³ STP per cm³ of pore).')}</p>
      ${imp||`<p class="why">${T('Il file non contiene una distribuzione DFT.','The file contains no DFT distribution.')}</p>`}
      <div class="ibfields"><label class="btn small" style="cursor:pointer">${T('Carica un kernel…','Load a kernel…')}<input type="file" data-act="kernel" accept=".csv,.txt" hidden></label><label class="ibf"><span>λ ${T('(regolarizzazione)','(regularisation)')}</span><input type="text" inputmode="decimal" size="7" data-o="lambda" value="${o.lambda!=null?o.lambda:''}" placeholder="0"></label>${o.kernel?`<span>${h(o.kernel.name)} · ${o.kernel.w.length} ${T('larghezze','widths')}</span>`:''}</div>
      ${rtOf(f).kernelErr?`<p class="bad">${SIG('stop')} ${h(rtOf(f).kernelErr)}</p>`:''}
      ${D&&!D.err?svg({series:[{x:D.rows.map(r=>r.w), y:D.rows.map(r=>r.dV), color:C.ads, mark:'fill', line:true, label:'dV'}, {x:D.rows.map(r=>r.w), y:D.rows.map(r=>r.cumV), color:C.des, line:true, dash:true, y2:true, label:T('cumulato','cumulative')}], xlabel:T('Larghezza dei pori (nm)','Pore width (nm)'), ylabel:'dV (cm³/g)', y2:'V (cm³/g)', logx:true})+`<p><b>${h(trW(D.label))}</b> · V ${g(D.Vtot,5)} cm³/g · ${T('scarto quadratico medio','RMS residual')} ${g(D.rms,3)} cm³ STP/g</p>`:D&&D.err?`<p class="warn">${SIG('warn')} ${T('Il kernel non copre le pressioni dell\'isoterma.','The kernel does not cover the isotherm pressures.')}</p>`:''}`; }
  function qstSet(f){ const gk=SorpCore.params(f.iso).gas; return allFiles().filter(q=>q.iso && Number.isFinite(+q.iso.meta.T) && SorpCore.params(q.iso).gas===gk && q.iso.unit && q.iso.unit.p==='Pa' && q.iso.p.length); }
  function tabQst(f){ const o=optOf(f), L=qstSet(f), sel=o.qstKeys||L.map(keyOf), use=L.filter(q=>sel.includes(keyOf(q)));
    const Q=use.length>=2?SorpCore.isosteric(use.map(q=>({T:+q.iso.meta.T, p:SorpCore.branch(q.iso,'ads').idx.map(i=>q.iso.p[i]), n:SorpCore.branch(q.iso,'ads').n})), {virial:{m:4,k:2}}):null;
    const ok=Q&&!Q.err;
    return `<p class="why">${T('Isoterme dello stesso adsorbato a temperature diverse, con le pressioni assolute: Clausius–Clapeyron a quantità costante e fit viriale. Incertezza dall\'errore standard della pendenza (≥ 3 temperature) o dallo 0,5% sulle pressioni (2 temperature).','Isotherms of the same adsorbate at different temperatures, with absolute pressures: Clausius–Clapeyron at constant amount and virial fit. Uncertainty from the slope standard error (≥ 3 temperatures) or from 0.5% on pressures (2 temperatures).')}</p>
      <div class="ibfields">${L.map(q=>`<label class="check"><input type="checkbox" data-qst="${h(keyOf(q))}" ${sel.includes(keyOf(q))?'checked':''}> ${h(q.title||q.name)} (${g(+q.iso.meta.T,5)} K)</label>`).join('')}</div>
      ${ok?svg({series:[{x:Q.rows.map(r=>r.n), y:Q.rows.map(r=>r.Q), err:Q.rows.map(r=>r.u), color:C.ads, mark:'fill', label:'Clausius–Clapeyron'}].concat(Q.virial?[{x:Q.virial.rows.map(r=>r.n), y:Q.virial.rows.map(r=>r.Q), color:C.fit, line:true, label:T('viriale','virial')}]:[]), xlabel:'n (cm³ STP/g)', ylabel:'Qst (kJ/mol)'})+table(['n (cm³ STP/g)','Qst (kJ/mol)','±','r'], Q.rows.filter((_,i)=>i%2===0).map(r=>[g(r.n,4),g(r.Q,4),g(r.u,2),g(r.r,5)]))
        :`<p class="why">${use.length<2?T('Servono almeno due isoterme dello stesso adsorbato a temperature diverse, con le pressioni assolute.','At least two isotherms of the same adsorbate at different temperatures, with absolute pressures, are needed.'):T('Le isoterme non si sovrappongono in quantità adsorbita.','The isotherms do not overlap in adsorbed amount.')}</p>`}`; }
  function tabCmp(f){ const L=allFiles().filter(q=>q.iso && q.include!==false), cols=['#1f5fbf','#c25a00','#2a9d5c','#7b4fc9','#17a2b8','#8c564b','#a3a01d','#e377c2'];
    const sp={series:L.map((q,i)=>({x:SorpCore.branch(q.iso,'ads').x, y:SorpCore.branch(q.iso,'ads').n, color:cols[i%cols.length], mark:'fill', line:true, width:1, label:(q.title||q.name).slice(0,22)})), xlabel:'p/p₀', ylabel:T('Quantità adsorbita (cm³ STP/g)','Amount adsorbed (cm³ STP/g)')};
    const rows=L.map(q=>{ const A=run(q), B=A.bet&&A.bet.used; return [h(q.title||q.name), B?g(B.area,5):'—', B?g(B.C,4):'—', B?`${g(B.x0,3)}–${g(B.x1,3)}`:'—', A.tpv&&!A.tpv.err?g(A.tpv.V,4):'—', A.tpv&&A.tpv.dAvg?g(A.tpv.dAvg/10,4):'—', A.bjh&&!A.bjh.err?g(A.bjh.mode/10,4)+' ('+A.bjh.branch+')':'—', A.tplot&&!A.tplot.err?g(A.tplot.Sext,4):'—', A.tplot&&!A.tplot.err?g(A.tplot.Vmicro,3):'—', A.warnings.filter(w=>w.lv==='stop').length?SIG('stop'):A.warnings.length?SIG('warn'):'']; });
    return svg(sp)+table([T('Campione','Sample'),'BET (m²/g)','C','p/p₀',T('V tot (cm³/g)','Total V (cm³/g)'),T('d medio (nm)','avg d (nm)'),T('moda BJH (nm)','BJH mode (nm)'),T('S est. (m²/g)','ext. S (m²/g)'),T('V micro (cm³/g)','micro V (cm³/g)'),T('avvisi','warnings')], rows); }

  function render(box, f){
    if (!f || !f.iso || typeof SorpCore==='undefined'){ box.innerHTML=''; return; }
    const o=optOf(f), A=run(f), tab=rtOf(f).tab||'iso';
    const body={iso:tabIso, bet:tabBET, lang:tabLang, t:tabT, pori:tabPori, micro:tabMicro, dft:tabDFT, qst:tabQst, cmp:tabCmp}[tab](f, A);
    box.innerHTML=`<div class="sorpui" data-sorp="${f.id}"><div class="sorptabs" role="tablist">${TABS.map(([k,l])=>`<button type="button" role="tab" class="btn small${k===tab?' primary':' ghost'}" aria-selected="${k===tab}" data-tab="${k}">${l}</button>`).join('')}<button type="button" class="btn small ghost" data-act="csv">${T('Esporta CSV…','Export CSV…')}</button></div>
      ${warnBox(A,tab)}${paramsBox(f,A)}<div class="sorpbody" data-body="${tab}">${body}</div></div>`;
    bind(box, f);
  }
  function rerender(box, f){ f._sorpRes=null; commit(f); render(box, f); }
  function bind(box, f){ const O=()=>own(f);
    box.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{ rtOf(f).tab=b.dataset.tab; render(box, f); });
    box.querySelectorAll('[data-sp]').forEach(el=>el.onchange=()=>{ const k=el.dataset.sp, v=el.value; if (k==='gas'||k==='stp'||k==='thick'){ if (v) O().over[k]=v; else delete O().over[k]; } else { const x=num(v); if (x==null) delete O().over[k]; else O().over[k]=x; } rerender(box, f); });
    box.querySelectorAll('[data-o]').forEach(el=>el.onchange=()=>{ const k=el.dataset.o; if (el.type==='checkbox') O()[k]=el.checked; else if (k==='alphaRefKey') O()[k]=el.value||null; else if (['tModel','bjhBranch','bjhThick','tpvMode'].includes(k)) O()[k]=el.value||null; else O()[k]=num(el.value); rerender(box, f); });
    box.querySelectorAll('[data-r]').forEach(el=>el.onchange=()=>{ const k=el.dataset.r, ins=box.querySelectorAll(`[data-r="${k}"]`), a=num(ins[0].value), b=num(ins[1].value);
      if (a!=null && b!=null && b>a) O()[k]=k==='tRange'?{x:[a,b]}:[a,b]; else if (a==null && b==null) O()[k]=null; rerender(box, f); });
    box.querySelectorAll('[data-qst]').forEach(el=>el.onchange=()=>{ O().qstKeys=[...box.querySelectorAll('[data-qst]')].filter(c=>c.checked).map(c=>c.dataset.qst); commit(f); render(box, f); });
    const ba=box.querySelector('[data-act="betAuto"]'); if (ba) ba.onclick=()=>{ O().betRange=null; rerender(box, f); };
    const ki=box.querySelector('[data-act="kernel"]'); if (ki) ki.onchange=async()=>{ const file=ki.files[0]; if (!file) return; const K=SorpCore.parseKernel(await file.text(), file.name); if (K.err){ rtOf(f).kernelErr=K.err; O().kernel=null; } else { O().kernel=K; rtOf(f).kernelErr=null; } rerender(box, f); };
    const cs=box.querySelector('[data-act="csv"]'); if (cs) cs.onclick=()=>exportCsv(f);
  }

  /* ---------------- esportazioni ---------------- */
  function csvText(f){ const A=run(f), sep=en()?',':';', d=en()?'.':',', rows=SorpCore.csvRows(f.iso, A, en());
    const cell=c=>{ let s=typeof c==='number'?String(c).replace('.',d):String(c==null?'':c); if (/^[=+\-@]/.test(s) && !/^[-+]?\d/.test(s)) s="'"+s; return (s.includes(sep)||/["\n\r]/.test(s))?'"'+s.replace(/"/g,'""')+'"':s; };
    return '﻿'+rows.map(r=>r.map(cell).join(sep)).join('\r\n')+'\r\n'; }
  const csvName=f=>(en()?'physisorption_':'fisisorbimento_')+String(f.title||f.name).replace(/\.[^.]{1,4}$/,'').replace(/[\\/:*?"<>|\u0000-\u001f]+/g,'_').slice(0,80)+'.csv';
  async function exportCsv(f){ const blob=new Blob([csvText(f)],{type:'text/csv'}); try{ await win.download(blob, csvName(f)); }catch(e){ console.error(e); } }
  // file per le «tabelle di analisi» della finestra Esporta (e dello ZIP): uno per isoterma
  function analysisFiles(list){ return list.filter(f=>f.iso).map(f=>[csvName(f), csvText(f)]); }
  // righe per «parametri per tecnica»
  function techRows(f){ const A=run(f), B=A.bet&&A.bet.used, r=[];
    if (B) r.push([T('Area BET','BET area'), g(B.area,5), 'm²/g', `p/p₀ ${g(B.x0,3)}–${g(B.x1,3)}, C ${g(B.C,4)}, r ${g(B.r,6)}`]);
    if (A.langmuir&&!A.langmuir.err) r.push([T('Area di Langmuir','Langmuir area'), g(A.langmuir.nl.area,5), 'm²/g', T('solo indice su tipo II/IV','index only on type II/IV')]);
    if (A.tpv&&!A.tpv.err) r.push([T('Volume totale dei pori','Total pore volume'), g(A.tpv.V,5), 'cm³/g', 'p/p₀ '+g(A.tpv.x,5)]);
    if (A.tpv&&A.tpv.dAvg) r.push([T('Diametro medio 4V/S','Average diameter 4V/S'), g(A.tpv.dAvg/10,4), 'nm', '']);
    if (A.tplot&&!A.tplot.err) r.push([T('Area esterna (t-plot)','External area (t-plot)'), g(A.tplot.Sext,5), 'm²/g', A.tplot.modelName], [T('Volume dei micropori (t-plot)','Micropore volume (t-plot)'), g(A.tplot.Vmicro,4), 'cm³/g', '']);
    if (A.bjh&&!A.bjh.err) r.push(['BJH', g(A.bjh.Vtot,5), 'cm³/g', T('moda ','mode ')+g(A.bjh.mode/10,4)+' nm, '+T('ramo ','branch ')+A.bjh.branch]);
    if (A.dr&&!A.dr.err) r.push(['DR W₀', g(A.dr.W0,4), 'cm³/g', 'E '+g(A.dr.E,4)+' kJ/mol']);
    return r; }
  function assess(f){ const A=run(f), out=(f.importNotes||[]).filter(t=>!A.warnings.some(w=>w.t===t)).map(t=>({lv:'warn', t:t+'.'}));
    A.warnings.forEach(w=>out.push({lv:w.lv==='stop'?'bad':'warn', t:SIG(w.lv)+' '+w.t+'.'}));
    if (!out.length) out.push({lv:'ok', t:T('Isoterma letta: nessun avviso.','Isotherm read: no warnings.')}); return out; }
  // pagina PDF: risultati, avvisi e due grafici (isoterma con i due rami, BET)
  function pdfLines(f){ const A=run(f), B=A.bet&&A.bet.used, L=[];
    if (B) L.push(`BET: ${g(B.area,5)} m²/g · C ${g(B.C,4)} · p/p₀ ${g(B.x0,3)}–${g(B.x1,3)} (${B.npts} ${T('punti','points')}) · r ${g(B.r,6)} · ${T('criteri di Rouquerol','Rouquerol criteria')} ${['a','b','c','d'].map(k=>k+(B.crit&&B.crit[k]?'✓':'✗')).join(' ')}`);
    if (A.bet&&A.bet.instr) L.push(`${T('Intervallo dello strumento','Instrument range')}: ${g(A.bet.instr.area,5)} m²/g (${T('differenza','difference')} ${g(A.bet.diffInstrPct,3)} %)`);
    techRows(f).slice(1).forEach(r=>L.push(`${r[0]}: ${r[1]} ${r[2]}${r[3]?' · '+r[3]:''}`));
    const P=A.P; L.push(`${T('Parametri','Parameters')}: ${P.gasName||'?'} · σ ${g(P.sigma)} nm² (${srcLab(P.src.sigma)}) · T ${g(P.T)} K · ρ ${g(P.rhoL)} g/cm³ · STP ${g(P.vmol,6)} cm³/mol`);
    if (A.iupac) L.push(`${T('Tipo IUPAC suggerito','Suggested IUPAC type')}: ${A.iupac.type}${A.iupac.hyst?' · '+A.iupac.hyst:''}`);
    return {lines:L, warn:A.warnings}; }
  function pdfImages(f){ const A=run(f); return [canvas(specIso(f,false),560,300), canvas(specBET(f,A),560,300)]; }

  /* ---------------- importazione guidata: si sceglie, non si indovina ---------------- */
  const queue=[]; let busy=false;
  function queueGuided(file, path, so){ queue.push({file, path, so}); setTimeout(next, 400); }
  function next(){ if (busy || !queue.length) return; if (typeof LOADING!=="undefined" && LOADING.size){ setTimeout(next, 300); return; } busy=true; const job=queue.shift(); (job.so.chemGuided?openChem:open)(job); }
  function open(job){
    const t=job.so.table, m=job.so.meta||{}, k=t.k, opts=sel=>`<option value="">—</option>`+Array.from({length:k},(_,j)=>`<option value="${j}" ${sel===j?'selected':''}>${T('colonna','column')} ${j+1}${t.names&&t.names[j]?' · '+h(t.names[j]):''}</option>`).join('');
    const guessRel=(()=>{ for (let j=0;j<k;j++){ const v=t.rows.map(r=>r[j]); if (v.every(x=>x>=0&&x<=1.05) && Math.max(...v)>0.5) return j; } return null; })();
    const dlg=doc.createElement('dialog'); dlg.className='sorpguided'; dlg.setAttribute('aria-label', T('Importazione guidata dell\'isoterma','Guided isotherm import'));
    dlg.innerHTML=`<form method="dialog"><h3>${T('Importazione guidata dell\'isoterma','Guided isotherm import')}</h3>
      <p>${SIG('warn')} <b>${h(job.path)}</b>: ${h(trW(job.so.why))}. ${T('Indica tu che cosa contiene ogni colonna: l\'app non indovina.','Tell the app what each column contains: it does not guess.')}</p>
      <div class="areawrap" style="max-height:180px;overflow:auto"><table class="areatab"><thead><tr>${Array.from({length:k},(_,j)=>`<th>${j+1}${t.names&&t.names[j]?'<br><small>'+h(t.names[j])+'</small>':''}</th>`).join('')}</tr></thead><tbody>${t.rows.slice(0,8).map(r=>`<tr>${r.map(v=>`<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <div class="ibfields">
        <label class="ibf"><span>p/p₀</span><select name="rel">${opts(guessRel)}</select></label>
        <label class="ibf"><span>${T('oppure pressione','or pressure')}</span><select name="p">${opts(null)}</select></label>
        <label class="ibf"><span>p₀ (${T('colonna','column')})</span><select name="p0">${opts(null)}</select></label>
        <label class="ibf"><span>${T('o p₀ fisso','or fixed p₀')}</span><input name="p0v" type="text" inputmode="decimal" size="7"></label>
        <label class="ibf"><span>${T('Unità della pressione','Pressure unit')}</span><select name="pu">${['torr','kpa','pa','mbar','bar','atm','mmhg'].map(u=>`<option>${u}</option>`).join('')}</select></label>
        <label class="ibf"><span>${T('Quantità adsorbita','Amount adsorbed')}</span><select name="n">${opts(null)}</select></label>
        <label class="ibf"><span>${T('Unità della quantità','Amount unit')}</span><select name="nu"><option value="">—</option>${['cm3STP/g','mmol/g','mol/kg','cm3STP','mmol'].map(u=>`<option>${u}</option>`).join('')}</select></label>
        <label class="ibf"><span>${T('Massa del campione (g)','Sample mass (g)')}</span><input name="mass" type="text" inputmode="decimal" size="7" value="${m.mass_g!=null?m.mass_g:''}"></label>
        <label class="ibf"><span>${T('Adsorbato','Adsorbate')}</span><select name="gas">${Object.keys(SorpCore.ADSORBATES).map(q=>`<option value="${q}" ${m.gasKey===q?'selected':''}>${SorpCore.ADSORBATES[q].name}</option>`).join('')}</select></label>
        <label class="ibf"><span>${T('Temperatura (K)','Temperature (K)')}</span><input name="T" type="text" inputmode="decimal" size="7" value="${m.T!=null?m.T:''}"></label>
      </div><p class="sorpgerr bad" hidden></p>
      <div class="row"><button class="btn primary" value="ok">${T('Importa','Import')}</button> <button class="btn ghost" value="cancel">${T('Annulla','Cancel')}</button></div></form>`;
    doc.body.appendChild(dlg);
    const F=dlg.querySelector('form'), err=dlg.querySelector('.sorpgerr');
    F.addEventListener('submit', ev=>{ const v=ev.submitter&&ev.submitter.value; if (v!=='ok') return;
      const q=n=>F.elements[n].value, col=n=>q(n)===''?null:+q(n), rel=col('rel'), p=col('p'), p0=col('p0'), p0v=num(q('p0v')), nC=col('n'), nu=q('nu');
      const bad=msg=>{ ev.preventDefault(); err.hidden=false; err.textContent=SIG('stop')+' '+msg; };
      if (nC==null) return bad(T('Scegli la colonna della quantità adsorbita.','Choose the amount adsorbed column.'));
      if (!nu) return bad(T('Scegli l\'unità della quantità: senza, i numeri non hanno significato.','Choose the amount unit: without it the numbers are meaningless.'));
      if (rel==null && (p==null || (p0==null && p0v==null))) return bad(T('Serve p/p₀, oppure la pressione con p₀ (colonna o valore).','p/p₀ is needed, or the pressure with p₀ (column or value).'));
      if (/^(cm3STP|mmol)$/.test(nu) && !(num(q('mass'))>0)) return bad(T('Con quantità non normalizzate serve la massa del campione.','Non-normalised amounts need the sample mass.'));
      const R=t.rows, o={n:R.map(r=>r[nC]), nUnit:nu, mass_g:num(q('mass')), gas:q('gas'), T:num(q('T')), sampleId:m.sampleId||job.path};
      if (rel!=null) o.x=R.map(r=>r[rel]); else { o.p=R.map(r=>r[p]); o.p0=p0!=null?R.map(r=>r[p0]):R.map(()=>p0v); o.pUnit=q('pu'); }
      const aif=SorpCore.toAIF(o), name=String(job.file.name).replace(/\.[^.]+$/,'')+'.guidata.aif';
      setTimeout(async()=>{ try{ await win.addEntries([{file:new File([aif], name, {type:'text/plain'}), path:name}]); }catch(e){ console.error(e); } }, 0);
    });
    dlg.addEventListener('close', ()=>{ dlg.remove(); busy=false; setTimeout(next, 50); });
    dlg.showModal();
  }

  /* =====================================================================================================
     CHEMISORBIMENTO (SPEC §6): schede TPx, impulsi, statico, dispersione. Impostazioni in f.an.chem.
     ===================================================================================================== */
  const copt=f=>(f.an&&f.an.chem&&typeof f.an.chem==='object')?f.an.chem:{};
  const cown=f=>{ f.an=f.an||{}; if (!f.an.chem || typeof f.an.chem!=='object') f.an.chem={}; return f.an.chem; };
  const crt=f=>(f._chemRt=f._chemRt||{tab:null});
  const KLAB={TPR:'TPR', TPO:'TPO', TPD:'TPD', TPSR:'TPSR', TPx:'TPx', pulse:T('impulsi','pulses'), static:T('statico','static')};
  function chemRun(f){ const o=copt(f), key=JSON.stringify(o); if (f._chemRes && f._chemKey===key) return f._chemRes;
    const disp=(o.disp||f.chem.meta.metal||f.chem.kind==='pulse'||f.chem.kind==='static')?Object.assign({}, o.disp||{}):null;
    const A=SorpCore.chemAnalyze(f.chem, Object.assign({}, o, {disp})); f._chemRes=A; f._chemKey=key; return A; }
  const cin=(k,lab,v,ph)=>`<label class="ibf"><span>${lab}</span><input type="text" inputmode="decimal" size="8" data-c="${k}" value="${v!=null?String(v).replace('.',dec()):''}" placeholder="${h(ph==null?'':String(ph).replace('.',dec()))}"></label>`;
  function cwarn(A){ const W=A.warn||[]; if (!W.length) return `<p class="why">${T('Nessun avviso.','No warnings.')}</p>`;
    return `<ul class="anlist sorpwarn">${W.slice().sort((a,b)=>(a.lv==='stop'?0:1)-(b.lv==='stop'?0:1)).map(w=>`<li class="${w.lv==='stop'?'lv-bad':'lv-warn'}">${SIG(w.lv)} ${h(trW(w.t))}</li>`).join('')}</ul>`; }
  function chemTabs(f){ const k=f.chem.kind; return k==='pulse'?[['pulse',T('Impulsi','Pulses')],['disp',T('Dispersione','Dispersion')]]:k==='static'?[['static',T('Statico','Static')],['disp',T('Dispersione','Dispersion')]]:[['tpx','TPx'],['kiss','Kissinger / Redhead']]; }
  function tabTPx(f, A){ const c=f.chem, o=copt(f), X=A.tpx; if (!X || X.err) return `<p class="why">${T('Curva troppo corta.','Curve too short.')}</p>`;
    const Tc=c.T.map(v=>v-273.15);
    const sp={series:[{x:Tc, y:c.s, color:C.ads, line:true, label:T('segnale','signal')}, {x:Tc, y:X.base, color:'#999', line:true, dash:true, label:T('linea di base','baseline')}], xlabel:T('Temperatura misurata (°C)','Measured temperature (°C)'), ylabel:T('Segnale TCD','TCD signal')};
    const m=c.meta;
    return `${svg(sp)}<div class="ibfields">${cin('factor',T('Fattore TCD (µmol per unità d\'area)','TCD factor (µmol per area unit)'),o.factor,'')}${cin('mass_g',T('Massa (g)','Mass (g)'),o.mass_g,m.mass_g)}${cin('theo',T('Consumo teorico (µmol)','Theoretical consumption (µmol)'),o.theo,'')}${cin('beta',T('Rampa β (K/min)','Ramp β (K/min)'),o.beta,X.beta!=null?+X.beta.toFixed(3):m.ramp)}</div>
      <div class="ibfields"><b>${T('Taratura con uno standard (CuO → Cu)','Calibration with a standard (CuO → Cu)')}</b>${cin('stdMass',T('massa di CuO (mg)','CuO mass (mg)'),crt(f).stdMass,'')}${cin('stdArea',T('area misurata','measured area'),crt(f).stdArea,'')}<button type="button" class="btn small" data-c-act="std">${T('Calcola il fattore','Compute the factor')}</button><label class="check"><input type="checkbox" data-c-chk="coldTrap" ${o.coldTrap?'checked':''}> ${T('trappola fredda per l\'acqua','cold trap for water')}</label></div>
      ${table([T('Grandezza','Quantity'),T('Valore','Value'),T('Unità','Unit')],[[T('Area (base lineare tra gli estremi)','Area (linear baseline between the ends)'),g(X.area,5),T('segnale·min','signal·min')],['Tm',g(X.Tm-273.15,4),'°C'],[T('Quantità','Amount'),X.umol!=null?g(X.umol,5):'—','µmol'],[T('Per grammo','Per gram'),X.umolPerG!=null?g(X.umolPerG,5):'—','µmol/g'],[T('Grado di riduzione','Degree of reduction'),X.reduction!=null?g(100*X.reduction,4):'—','%']].concat(X.peaks.map((q,i)=>[T('Massimo ','Maximum ')+(i+1),g(q.T-273.15,4),'°C'])))}
      <div class="ibfields"><b>Monti–Baiker</b>${cin('S0',T('S₀ specie riducibile (µmol)','S₀ reducible species (µmol)'),o.S0,'')}${cin('flow',T('Flusso totale (cm³ STP/min)','Total flow (cm³ STP/min)'),o.flow,m.flow)}${cin('frac',T('Frazione di H₂','H₂ fraction'),o.frac,m.frac)}${A.mb?`<span>K = ${g(A.mb.K,4)} s${A.mb.P!=null?' · P = '+g(A.mb.P,3)+' K':''}</span>`:''}</div>
      <p class="why">${T('Asse in temperatura misurata. Per separare picchi sovrapposti usa la «Deconvoluzione» dell\'analisi (già validata, R3).','Axis in measured temperature. To separate overlapping peaks use the analysis «Deconvolution» (already validated, R3).')}</p>`; }
  function kissSet(f){ return allFiles().filter(q=>q.chem && q.chem.kind===f.chem.kind && q.chem.T); }
  function tabKiss(f, A){ const o=copt(f), L=kissSet(f), sel=o.kissKeys||L.map(keyOf), use=L.filter(q=>sel.includes(keyOf(q)));
    const pts=use.map(q=>{ const R=chemRun(q); return {q, beta:R.tpx&&R.tpx.beta, Tm:R.tpx&&R.tpx.Tm}; }).filter(p=>p.beta>0 && p.Tm>0), K=SorpCore.kissinger(pts.map(p=>({beta:p.beta, Tm:p.Tm})));
    const sp=pts.length>=2?{series:[{x:pts.map(p=>1000/p.Tm), y:pts.map(p=>Math.log(p.beta/(p.Tm*p.Tm))), color:C.ads, mark:'fill', label:T('rampe','ramps')}].concat(K&&!K.err?[{x:[Math.min(...pts.map(p=>1000/p.Tm)),Math.max(...pts.map(p=>1000/p.Tm))], y:[0,1].map(i=>{ const xx=i?Math.max(...pts.map(p=>1/p.Tm)):Math.min(...pts.map(p=>1/p.Tm)); return Math.log(K.A/(K.E*1000/8.314462618))-K.E*1000/8.314462618*xx; }), color:C.fit, line:true}]:[]), xlabel:'1000/Tm (K⁻¹)', ylabel:'ln(β/Tm²)'}:null;
    return `<div class="ibfields">${L.map(q=>`<label class="check"><input type="checkbox" data-kiss="${h(keyOf(q))}" ${sel.includes(keyOf(q))?'checked':''}> ${h(q.title||q.name)}</label>`).join('')}</div>${sp?svg(sp):''}
      ${table([T('Curva','Curve'),'β (K/min)','Tm (°C)'], pts.map(p=>[h(p.q.title||p.q.name), g(p.beta,4), g(p.Tm-273.15,4)]))}
      ${K&&!K.err?`<p><b>Kissinger: E = ${g(K.E,4)} ± ${g(K.uE,2)} kJ/mol</b> (r ${g(K.r,5)})</p>`:`<p class="bad">${SIG('stop')} ${T('Kissinger con meno di 3 rampe','Kissinger with fewer than 3 ramps')}</p>`}
      <div class="ibfields">${cin('nu',T('ν per Redhead (s⁻¹)','ν for Redhead (s⁻¹)'),o.nu,'1e13')}${A.redhead?`<span>Redhead (${T('questa curva, primo ordine','this curve, first order')}): E = ${g(A.redhead.E,4)} kJ/mol</span>`:''}</div>
      <p class="why">${T('Kissinger (1957): ln(β/Tm²) contro 1/Tm, servono almeno 3 rampe. Redhead (1962): primo ordine, con ν supposto e dichiarato.','Kissinger (1957): ln(β/Tm²) vs 1/Tm, at least 3 ramps are needed. Redhead (1962): first order, with an assumed and stated ν.')}</p>`; }
  function tabPulse(f, A){ const c=f.chem, o=copt(f), P=A.pulse||{}, m=c.meta;
    const sp={series:[{x:c.areas.map((_,i)=>i+1), y:c.areas, color:C.ads, mark:'fill', line:true, label:T('area','area')}].concat(P.Asat?[{x:[1,c.areas.length], y:[P.Asat,P.Asat], color:C.fit, line:true, dash:true, label:T('saturazione','saturation')}]:[]), xlabel:T('Impulso','Pulse'), ylabel:T('Area dell\'impulso','Pulse area')};
    return `${svg(sp)}<div class="ibfields">${cin('loopVol',T('Volume del loop (cm³)','Loop volume (cm³)'),o.loopVol,m.loopVol)}${cin('loopT',T('T del loop (K)','Loop T (K)'),o.loopT,m.loopT!=null?+m.loopT.toFixed(2):298.15)}${cin('p',T('Pressione (kPa)','Pressure (kPa)'),o.p,101.325)}${cin('frac',T('Frazione del gas attivo','Active gas fraction'),o.frac,m.frac!=null?m.frac:1)}${cin('mass_g',T('Massa (g)','Mass (g)'),o.mass_g,m.mass_g)}${cin('nSat',T('Impulsi per la saturazione','Pulses for saturation'),o.nSat,3)}</div>
      ${P.err?'':table([T('Grandezza','Quantity'),T('Valore','Value'),T('Unità','Unit')],[['A_sat',g(P.Asat,5),''],[T('Saturazione','Saturation'),P.saturated?T('raggiunta','reached'):T('non raggiunta','not reached'),''],[T('Volume STP per impulso','STP volume per pulse'),g(P.vStpPulse,4),'cm³'],['uptake',g(P.uptakeUmol,5),'µmol'],['uptake',g(P.uptakeUmolPerG,5),'µmol/g']])}
      <p class="why">${T('uptake = Σ (A_sat − Aᵢ)/A_sat · V_loop (STP); la saturazione si riconosce dagli ultimi impulsi uguali entro il 2%.','uptake = Σ (A_sat − Aᵢ)/A_sat · V_loop (STP); saturation is recognised by the last pulses equal within 2%.')}</p>`; }
  function tabStatic(f, A){ const c=f.chem, o=copt(f), St=A.stat||{};
    const line=(L,p)=>L?[L.icpt, L.icpt+L.slope*p]:null, pm=Math.max(...c.comb.p);
    const s=[{x:c.comb.p, y:c.comb.n, color:C.ads, mark:'fill', label:T('combinata','combined')}]; if (c.rep) s.push({x:c.rep.p, y:c.rep.n, color:C.des, mark:'open', label:T('ripetuta','repeat')});
    if (St.Lc) s.push({x:[0,pm], y:line(St.Lc,pm), color:C.ads, line:true, dash:true}); if (St.Lr) s.push({x:[0,pm], y:line(St.Lr,pm), color:C.des, line:true, dash:true});
    return `${svg({series:s, xlabel:T('Pressione (kPa)','Pressure (kPa)'), ylabel:T('Quantità adsorbita (cm³ STP/g)','Amount adsorbed (cm³ STP/g)'), xr:[0,pm*1.05]})}<div class="ibfields">${cin('pa',T('Tratto lineare da (kPa)','Linear part from (kPa)'),o.pa,'')}${cin('pb',T('a (kPa)','to (kPa)'),o.pb,'')}</div>
      ${St.err?`<p class="why">${T('Pochi punti nel tratto scelto.','Too few points in the chosen part.')}</p>`:table([T('Grandezza','Quantity'),'cm³ STP/g','µmol/g'],[[T('totale (combinata a p = 0)','total (combined at p = 0)'),g(St.total,5),g(St.total/22.414*1000,5)],[T('debole (ripetuta a p = 0)','weak (repeat at p = 0)'),g(St.weak,5),St.weak!=null?g(St.weak/22.414*1000,5):'—'],[T('forte = totale − debole','strong = total − weak'),g(St.strong,5),g(St.strong/22.414*1000,5)]])}
      <p class="why">${T('Estrapolazione lineare a pressione zero (ASTM D3908).','Linear extrapolation to zero pressure (ASTM D3908).')}</p>`; }
  function tabDisp(f, A){ const o=copt(f), d=o.disp||{}, m=f.chem.meta, D=A.disp||{}, src=A.uptake!=null?(f.chem.kind==='pulse'?T('dagli impulsi','from the pulses'):T('dallo statico (forte)','from the static run (strong)')):'';
    const metalSel=`<select data-cd="metal"><option value="">—</option>${Object.keys(SorpCore.METALS).map(k=>`<option ${ (d.metal||m.metal)===k?'selected':''}>${k}</option>`).join('')}</select>`;
    const di=(k,lab,ph)=>`<label class="ibf"><span>${lab}</span><input type="text" inputmode="decimal" size="7" data-cd="${k}" value="${d[k]!=null?String(d[k]).replace('.',dec()):''}" placeholder="${h(ph==null?'':String(ph).replace('.',dec()))}"></label>`;
    const M=SorpCore.METALS[d.metal||m.metal]||{};
    return `<div class="ibfields"><label class="ibf"><span>${T('Metallo','Metal')}</span>${metalSel}</label>${di('loading',T('Carico (% in peso)','Loading (wt%)'),m.loading)}${di('SF',T('Stechiometria (atomi per molecola)','Stoichiometry (atoms per molecule)'),m.SF)}${di('uptake',T('Uptake (µmol/g), se diverso','Uptake (µmol/g), if different'),A.uptake!=null?+A.uptake.toPrecision(5):'')}${di('am',T('aₘ (nm² per atomo)','aₘ (nm² per atom)'),M.am)}${di('shape',T('Fattore di forma','Shape factor'),6)}</div>
      ${D.err?'':table([T('Grandezza','Quantity'),T('Valore','Value'),T('Unità','Unit')],[[T('Dispersione','Dispersion'),g(D.Dpct,4),'%'],[T('Area metallica','Metal area'),g(D.areaSample,4),T('m²/g di campione','m²/g of sample')],[T('Area metallica','Metal area'),g(D.areaMetal,4),T('m²/g di metallo','m²/g of metal')],[T('Diametro medio','Mean diameter'),g(D.d,4),'nm']])}
      <p class="why">${T('Nₛ = uptake·N_A·SF; D = Nₛ·M/(N_A·w); area = Nₛ·aₘ; d = f·vₘ/(aₘ·D) (Bergeret e Gallezot, 2008).','Nₛ = uptake·N_A·SF; D = Nₛ·M/(N_A·w); area = Nₛ·aₘ; d = f·vₘ/(aₘ·D) (Bergeret and Gallezot, 2008).')}${src?' Uptake '+src+'.':''}</p>`; }
  function chemRender(box, f){
    if (!f || !f.chem || typeof SorpCore==='undefined'){ box.innerHTML=''; return; }
    const tabs=chemTabs(f), rt=crt(f); if (!tabs.some(t=>t[0]===rt.tab)) rt.tab=tabs[0][0];
    const A=chemRun(f), body={tpx:tabTPx, kiss:tabKiss, pulse:tabPulse, static:tabStatic, disp:tabDisp}[rt.tab](f, A);
    box.innerHTML=`<div class="sorpui chemui" data-chem="${f.id}"><p><b>${T('Chemisorbimento','Chemisorption')} · ${h(KLAB[f.chem.kind]||f.chem.kind)}</b>${f.chem.meta.software?' · '+h(f.chem.meta.software):''}</p><div class="sorptabs" role="tablist">${tabs.map(([k,l])=>`<button type="button" role="tab" class="btn small${k===rt.tab?' primary':' ghost'}" aria-selected="${k===rt.tab}" data-ctab="${k}">${l}</button>`).join('')}<button type="button" class="btn small ghost" data-c-act="csv">${T('Esporta CSV…','Export CSV…')}</button></div>${cwarn(A)}<div class="sorpbody">${body}</div></div>`;
    const redo=()=>{ f._chemRes=null; commit(f,'chem'); chemRender(box, f); };
    box.querySelectorAll('[data-ctab]').forEach(b=>b.onclick=()=>{ rt.tab=b.dataset.ctab; chemRender(box, f); });
    box.querySelectorAll('[data-c]').forEach(el=>el.onchange=()=>{ const k=el.dataset.c, v=num(el.value); if (k==='stdMass'||k==='stdArea'){ rt[k]=v; return; } const o=cown(f); if (v==null) delete o[k]; else o[k]=v; redo(); });
    box.querySelectorAll('[data-c-chk]').forEach(el=>el.onchange=()=>{ const o=cown(f); if (el.checked) o[el.dataset.cChk]=true; else delete o[el.dataset.cChk]; redo(); });
    box.querySelectorAll('[data-cd]').forEach(el=>el.onchange=()=>{ const o=cown(f), d=o.disp=o.disp||{}, k=el.dataset.cd; if (k==='metal'){ if (el.value) d.metal=el.value; else delete d.metal; } else { const v=num(el.value); if (v==null) delete d[k]; else d[k]=v; } redo(); });
    box.querySelectorAll('[data-kiss]').forEach(el=>el.onchange=()=>{ cown(f).kissKeys=[...box.querySelectorAll('[data-kiss]')].filter(c=>c.checked).map(c=>c.dataset.kiss); redo(); });
    const sb=box.querySelector('[data-c-act="std"]'); if (sb) sb.onclick=()=>{ if (rt.stdMass>0 && rt.stdArea>0){ cown(f).factor=SorpCore.tcdFactor({mass_mg:rt.stdMass, area:rt.stdArea}).factor; redo(); } };
    const cs=box.querySelector('[data-c-act="csv"]'); if (cs) cs.onclick=()=>chemExportCsv(f);
  }
  function chemCsvText(f){ const A=chemRun(f), sep=en()?',':';', d=en()?'.':',', rows=SorpCore.chemCsvRows(f.chem, A, en());
    const cell=c=>{ let s=typeof c==='number'?String(c).replace('.',d):String(c==null?'':c); if (/^[=+\-@]/.test(s) && !/^[-+]?\d/.test(s)) s="'"+s; return (s.includes(sep)||/["\n\r]/.test(s))?'"'+s.replace(/"/g,'""')+'"':s; };
    return '﻿'+rows.map(r=>r.map(cell).join(sep)).join('\r\n')+'\r\n'; }
  const chemCsvName=f=>(en()?'chemisorption_':'chemisorbimento_')+String(f.title||f.name).replace(/\.[^.]{1,4}$/,'').replace(/[\\/:*?"<>|\u0000-\u001f]+/g,'_').slice(0,80)+'.csv';
  async function chemExportCsv(f){ try{ await win.download(new Blob([chemCsvText(f)],{type:'text/csv'}), chemCsvName(f)); }catch(e){ console.error(e); } }
  function chemTechRows(f){ return SorpCore.chemCsvRows(f.chem, chemRun(f), en()).slice(2).filter(r=>r[0]!==T('Avvisi','Warnings')).map(r=>[r[0]+' · '+r[1], r[2]===''?'—':g(r[2],5), r[3], r[4]]); }
  function chemAssess(f){ const A=chemRun(f), out=A.warn.map(w=>({lv:w.lv==='stop'?'bad':'warn', t:SIG(w.lv)+' '+w.t+'.'})); if (!out.length) out.push({lv:'ok', t:T('Misura letta: nessun avviso.','Measurement read: no warnings.')}); return out; }
  function chemPdfLines(f){ return chemTechRows(f).map(r=>`${r[0]}: ${r[1]} ${r[2]}${r[3]?' · '+r[3]:''}`); }
  function chemPdfImages(f){ const c=f.chem; if (c.kind==='pulse') return [canvas({series:[{x:c.areas.map((_,i)=>i+1), y:c.areas, color:C.ads, mark:'fill', line:true}], xlabel:T('Impulso','Pulse'), ylabel:T('Area','Area')},560,300)];
    if (c.kind==='static') return [canvas({series:[{x:c.comb.p, y:c.comb.n, color:C.ads, mark:'fill', label:T('combinata','combined')}].concat(c.rep?[{x:c.rep.p, y:c.rep.n, color:C.des, mark:'open', label:T('ripetuta','repeat')}]:[]), xlabel:T('Pressione (kPa)','Pressure (kPa)'), ylabel:'cm³ STP/g'},560,300)];
    const A=chemRun(f); return [canvas({series:[{x:c.T.map(v=>v-273.15), y:c.s, color:C.ads, line:true}, {x:c.T.map(v=>v-273.15), y:A.tpx?A.tpx.base:[], color:'#999', line:true, dash:true}], xlabel:T('Temperatura misurata (°C)','Measured temperature (°C)'), ylabel:T('Segnale TCD','TCD signal')},560,300)]; }
  function chemAnalysisFiles(list){ return list.filter(f=>f.chem).map(f=>[chemCsvName(f), chemCsvText(f)]); }

  // stile minimo, con le variabili del sistema di design (chiaro, scuro, desktop)
  if (doc.head && !doc.getElementById('sorpCss')){ const st=doc.createElement('style'); st.id='sorpCss'; st.textContent='.sorptabs{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0 8px}.sorpchart{color:var(--ink);display:block;margin:6px 0}.sorpui .ok{color:var(--ok)}.sorpui .no{color:var(--danger)}.sorpui h4{margin:12px 0 4px}.sorpui .bad,.sorpguided .bad{color:var(--danger)}.sorppar{margin:6px 0}.sorpguided{max-width:860px}'; doc.head.appendChild(st); }
  function openChem(job){
    const t=job.so.table, m=job.so.meta||{}, k=t.k, opts=sel=>`<option value="">—</option>`+Array.from({length:k},(_,j)=>`<option value="${j}" ${sel===j?'selected':''}>${T('colonna','column')} ${j+1}${t.names&&t.names[j]?' · '+h(t.names[j]):''}</option>`).join('');
    const dlg=doc.createElement('dialog'); dlg.className='sorpguided'; dlg.setAttribute('aria-label', T('Importazione guidata del chemisorbimento','Guided chemisorption import'));
    dlg.innerHTML=`<form method="dialog"><h3>${T('Importazione guidata del chemisorbimento','Guided chemisorption import')}</h3>
      <p>${SIG('warn')} <b>${h(job.path)}</b>: ${h(trW(job.so.why))}. ${T('Indica tu che cosa contiene ogni colonna: l\'app non indovina.','Tell the app what each column contains: it does not guess.')}</p>
      <div class="areawrap" style="max-height:180px;overflow:auto"><table class="areatab"><thead><tr>${Array.from({length:k},(_,j)=>`<th>${j+1}${t.names&&t.names[j]?'<br><small>'+h(t.names[j])+'</small>':''}</th>`).join('')}</tr></thead><tbody>${t.rows.slice(0,8).map(r=>`<tr>${r.map(v=>`<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <div class="ibfields">
        <label class="ibf"><span>${T('Misura','Measurement')}</span><select name="kind">${['TPR','TPO','TPD','TPSR'].map(x=>`<option>${x}</option>`).join('')}<option value="pulse" ${/impuls|pulse/i.test(job.so.why)?'selected':''}>${T('impulsi','pulses')}</option><option value="static" ${/statico|static/i.test(job.so.why)?'selected':''}>${T('statico','static')}</option></select></label>
        <label class="ibf"><span>${T('Asse: T misurata (°C), impulso o pressione (kPa)','Axis: measured T (°C), pulse or pressure (kPa)')}</span><select name="x">${opts(null)}</select></label>
        <label class="ibf"><span>${T('Valore: segnale TCD, area o quantità (cm³ STP/g)','Value: TCD signal, area or amount (cm³ STP/g)')}</span><select name="y">${opts(null)}</select></label>
        <label class="ibf"><span>${T('Tempo (min), facoltativo','Time (min), optional')}</span><select name="t">${opts(null)}</select></label>
        <label class="ibf"><span>${T('Massa (g)','Mass (g)')}</span><input name="mass" type="text" inputmode="decimal" size="7" value="${m.mass_g!=null?m.mass_g:''}"></label>
        <label class="ibf"><span>${T('Volume del loop (cm³)','Loop volume (cm³)')}</span><input name="loop" type="text" inputmode="decimal" size="7" value="${m.loopVol!=null?m.loopVol:''}"></label>
      </div><p class="sorpgerr bad" hidden></p>
      <div class="row"><button class="btn primary" value="ok">${T('Importa','Import')}</button> <button class="btn ghost" value="cancel">${T('Annulla','Cancel')}</button></div></form>`;
    doc.body.appendChild(dlg); const F=dlg.querySelector('form'), err=dlg.querySelector('.sorpgerr');
    F.addEventListener('submit', ev=>{ if ((ev.submitter&&ev.submitter.value)!=='ok') return; const q=n=>F.elements[n].value, col=n=>q(n)===''?null:+q(n), kind=q('kind'), x=col('x'), y=col('y'), tc=col('t');
      const bad=msg=>{ ev.preventDefault(); err.hidden=false; err.textContent=SIG('stop')+' '+msg; };
      if (y==null) return bad(T('Scegli la colonna dei valori.','Choose the value column.')); if (kind!=='pulse' && x==null) return bad(T('Scegli la colonna dell\'asse.','Choose the axis column.'));
      const R=t.rows, txt=SorpCore.toChemText({kind, x:x==null?R.map((_,i)=>i+1):R.map(r=>r[x]), y:R.map(r=>r[y]), t:tc==null?null:R.map(r=>r[tc]), mass_g:num(q('mass')), loopVol:num(q('loop'))}), name=String(job.file.name).replace(/\.[^.]+$/,'')+'.guidata.txt';
      setTimeout(async()=>{ try{ await win.addEntries([{file:new File([txt], name, {type:'text/plain'}), path:name}]); }catch(e){ console.error(e); } }, 0); });
    dlg.addEventListener('close', ()=>{ dlg.remove(); busy=false; setTimeout(next, 50); }); dlg.showModal();
  }
  win.AcchChem={render:chemRender, run:chemRun, assess:chemAssess, techRows:chemTechRows, analysisFiles:chemAnalysisFiles, csvText:chemCsvText, csvName:chemCsvName, pdfLines:chemPdfLines, pdfImages:chemPdfImages};
  win.AcchSorp={render, run, assess, techRows, analysisFiles, csvText, csvName, exportCsv, pdfLines, pdfImages, queueGuided, svg, canvas, specIso};
})(window);
