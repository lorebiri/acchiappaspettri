// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Genera le fixture SINTETICHE di fisisorbimento e chemisorbimento (node test/fixtures/sorption/genera-fixture.js).
// I formati Kaomi sono DEDOTTI (nessun file reale disponibile): le intestazioni seguono il report pubblico di Kaomi 2.02
// e la documentazione nota; ASiQwin segue la struttura di un file pubblico (PARADIM), con numeri inventati.
'use strict';
const fs=require('fs'), path=require('path'), {meso, micro, grid, lf}=require('../../validation/sorption/sintetiche.js');
const D=__dirname, w=(n,t)=>fs.writeFileSync(path.join(D,n), t);
const f=(v,d)=>(+v).toFixed(d);
// sequenza di misura: adsorbimento poi desorbimento, p0 che deriva un poco (come nel report)
const xa=[0.02,0.04,0.06,0.08,0.1,0.125,0.15,0.175,0.2,0.225,0.25,0.3,0.35,0.4,0.45,0.5,0.55,0.6,0.65,0.7,0.725,0.75,0.775,0.8,0.85,0.9,0.95,0.99];
const xd=[0.985,0.95,0.9,0.85,0.8,0.75,0.725,0.7,0.675,0.65,0.625,0.6,0.55,0.5,0.45,0.4,0.35,0.3,0.25,0.2,0.15,0.1];
const seq=xa.map(x=>({x, n:meso(x,{}), d:false})).concat(xd.map(x=>({x, n:meso(x,{},true), d:true})));
const mass=0.2000;
seq.forEach((o,i)=>{ o.p0=750.3-0.08*i; o.p=o.x*o.p0; o.t=60+12*i; });

// 1) Kaomi, CSV inglese (DEDOTTO): intestazione chiave,valore, poi la tabella con le unità nella riga dei nomi
w('kaomi-tabella-en.csv', ['Anton Paar Kaomi for Autosorb,version 2.02','Sample ID,Sintetico meso 1','Sample Weight,0.2000,g','Analysis Gas,1: Nitrogen','Analysis Temp,77.35,K','Instrument,Autosorb 6300','Station,2','Cross Section Area,16.2000,Å²/molecule','Liquid Density,0.806000,g/cm³','Surface Tension,8.85000,erg/cm²','Statistical Thickness Model,Carbon Black','p₀ Override,no','',
  'Isotherm-Normalized Data','Pressure (Torr),p₀ (Torr),"Relative Pressure, p/p₀",Amount Adsorbed (cm³ STP),Amount Adsorbed (cm³ STP/g),Time (min)']
  .concat(seq.map(o=>[f(o.p,4),f(o.p0,3),f(o.x,6),f(o.n*mass,5),f(o.n,4),f(o.t,3)].join(','))).join('\r\n')+'\r\n');
// 2) Kaomi in italiano (DEDOTTO): tabulazioni, virgola decimale, nomi tradotti, unità in una riga a parte
w('kaomi-tabella-it.txt', ['Anton Paar Kaomi for Autosorb\tversione 2.02','ID campione\tSintetico meso 1','Peso del campione\t0,2000 g','Gas di analisi\tAzoto','Temperatura di analisi\t77,35 K','Strumento\tAutosorb 6300','Stazione\t2','Sezione trasversale\t16,2000 Å²','',
  'Pressione\tp₀\tPressione relativa p/p₀\tQuantità adsorbita\tTempo','Torr\tTorr\t\tcm³ STP/g\tmin']
  .concat(seq.map(o=>[f(o.p,4),f(o.p0,3),f(o.x,6),f(o.n,4),f(o.t,3)].join('\t').replace(/\./g,','))).join('\r\n')+'\r\n');
// 3) quantità assoluta (cm³ STP) senza p/p₀: servono la massa e p₀
w('kaomi-assoluta.csv', ['Kaomi for Autosorb','Sample Weight: 0.2000 g','Analysis Gas: Nitrogen','Analysis Temp: 77.35 K','','Pressure [Torr],P0 [Torr],Amount Adsorbed [cm3 STP]']
  .concat(seq.map(o=>[f(o.p,4),f(o.p0,3),f(o.n*mass,5)].join(','))).join('\n')+'\n');
// 4) mmol/g e kPa, punto e virgola, ramo dichiarato in una colonna
w('kaomi-mmol-kpa.txt', ['Kaomi for Autosorb','Analysis Gas;Nitrogen','Analysis Temp;77.35 K','Pressure (kPa);p0 (kPa);Amount adsorbed (mmol/g);Branch']
  .concat(seq.map(o=>[f(o.p*0.133322387415,5),f(o.p0*0.133322387415,4),f(o.n/22.414,6),o.d?2:1].join(';'))).join('\n')+'\n');
// 5) testo di un report PDF (ripiego): colonne a larghezza fissa, parole spezzate, tabella BET dello strumento e pagina «continued»
{ const pad=(s,n)=>String(s).padStart(n), L=['                     Anton Paar Kaomi for Autosorb','                          version 2.02','Report date:    11/10/2026','File name:      Sintetico.qcuPhysIso','',
    '       Sample ID      Sintetico meso 1                Sample W eight     0.2000 g','      Instrument      Autosorb 6300','         Station      1','    Analysis Gas      1: Nitrogen                     Analysis T emp      77.35 K','',
    '                     BET Method-Multipoint BET',' Relativ e Pressure, p/ p₀       Amount Adsorbed      1 / [ W ((p₀ / p) - 1) ]','                                 c m³ ST P/ g          1/ g'];
  seq.filter(o=>!o.d && o.x>=0.06 && o.x<=0.2).forEach(o=>L.push(pad(f(o.x,6),24)+pad(f(o.n,4),20)+pad(f(1/(o.n*(1/o.x-1)),4),18)));
  const head=['','Anton Paar Kaomi for Autosorb v2.02 {Report ID: QC20261110000000000-00001}   Page 2 of 7','',' Isotherm-Normalized Data','   Pressure        p₀       Relativ e Pressure,   Amount Adsorbed    Amount Adsorbed      T ime','                                  p/ p₀','   T orr           T orr                         c m³ ST P          c m³ ST P/ g         min',''];
  L.push(...head); seq.slice(0,30).forEach(o=>L.push(pad(f(o.p,4),10)+pad(f(o.p0,3),11)+pad(f(o.x,6),14)+pad(f(o.n*mass,4),14)+pad(f(o.n,4),14)+pad(f(o.t,3),12)));
  L.push('','Page 3 of 7',' Isotherm-Normalized Data continued...', ...head.slice(4)); seq.slice(30).forEach(o=>L.push(pad(f(o.p,4),10)+pad(f(o.p0,3),11)+pad(f(o.x,6),14)+pad(f(o.n*mass,4),14)+pad(f(o.n,4),14)+pad(f(o.t,3),12)));
  L.push('',' Isotherm-Linear',' 400',' 0  0.2  0.4  0.6  0.8  1',' Relative Pressure, p/ p₀');
  w('kaomi-report-testo.txt', L.join('\n')+'\n'); }
// 6) ASiQwin grezzo (struttura del file pubblico PARADIM, numeri sintetici): Ar a 87 K, microporoso, senza marcatore di ramo
{ const xs=grid(2e-6,0.3,24,true).concat(grid(0.35,0.99,10)), xds=grid(0.95,0.1,8);
  const L=['                        Quantachrome ASiQwin - Automated Gas Sorption Data','                                            version 3.0','','Analysis                                          Report','Sample ID:      sintetico-micro    Filename:      sintetico.qps','Sample Weight: 0.0500 g            Instrument:    Autosorb iQ Station 1','Analysis gas:  Argon87             Non-ideality:  3.94e-05 1/Torr     CellType:      6mm','Analysis Time: 20:00 hr:min        Bath temp.:    87.45 K','                                     Data Reduction Parameters','Adsorbate      Argon87                  Temperature    87.450K','               Molec. Wt.: 39.948       Cross Section: 14.200  Å²    Liquid Density: 1.400  g/cc','','                     Relative                                        Volume @ STP','                     Pressure','                                                                         cc/g',''];
  xs.forEach(x=>L.push('                        '+x.toExponential(5)+'                                    '+f(micro(x),4).padStart(9)));
  xds.forEach(x=>L.push('                        '+x.toExponential(5)+'                                    '+f(micro(x)+0.3,4).padStart(9)));
  w('asiqwin-grezzo.txt', L.join('\r\n')+'\r\n'); }
// 7) AIF (formato pubblico, Evans et al. 2021) con i due rami
{ const L=['data_sintetico','_exptl_adsorptive Nitrogen','_exptl_temperature 77.35','_units_temperature K','_units_pressure Torr','_units_loading \'cm3(STP)/g\'','_units_mass g','_adsnt_sample_mass 0.2','_adsnt_sample_name \'Sintetico meso 1\'','_exptl_instrument \'Autosorb 6300\'','_exptl_software \'Kaomi for Autosorb 2.02\'','','loop_','_adsorp_pressure','_adsorp_p0','_adsorp_amount'];
  seq.filter(o=>!o.d).forEach(o=>L.push(`${f(o.p,4)} ${f(o.p0,3)} ${f(o.n,4)}`)); L.push('','loop_','_desorp_pressure','_desorp_p0','_desorp_amount'); seq.filter(o=>o.d).forEach(o=>L.push(`${f(o.p,4)} ${f(o.p0,3)} ${f(o.n,4)}`));
  w('isoterma.aif', L.join('\n')+'\n'); }
// 8) marca riconosciuta ma colonne non riconoscibili: importazione guidata
w('kaomi-colonne-ignote.txt', ['Anton Paar Kaomi for Autosorb','Sample Weight\t0.2000 g','Colonna A\tColonna B\tColonna C'].concat(seq.map(o=>[f(o.p,4),f(o.x,6),f(o.n,4)].join('\t'))).join('\n')+'\n');
// 9) nomi riconosciuti senza unità della quantità: importazione guidata
w('isoterma-senza-unita.csv', ['Isotherm','Relative Pressure,Amount Adsorbed'].concat(seq.map(o=>[f(o.x,6),f(o.n,4)].join(','))).join('\n')+'\n');
// 10) due temperature di CO₂ (calore isosterico), Langmuir–Freundlich con Q = 28 kJ/mol
for (const T of [273.15, 298.15]){ const p0=T<280?3485000:6434000, ps=grid(500,110000,25,true);
  w(`co2-${Math.round(T)}K.csv`, ['Kaomi for Autosorb','Analysis Gas,Carbon Dioxide',`Analysis Temp,${T},K`,'Sample Weight,0.1000,g','Pressure (kPa),p0 (kPa),Amount Adsorbed (mmol/g)'].concat(ps.map(p=>[f(p/1000,5),f(p0/1000,2),f(lf(p,T,{nm:6,b0:1e-9,Q:28,t:0.9}),6)].join(','))).join('\n')+'\n'); }
// 11) kernel dell'utente (sintetico): isoterme di poro singolo a gradino, larghezze 1–20 nm
{ const ws=[1,1.5,2,3,4,5,6,8,10,13,16,20], xs=grid(1e-4,0.99,60,true), L=['p/p0;'+ws.join(';')];
  xs.forEach(x=>L.push([x.toPrecision(6)].concat(ws.map(wd=>{ const xc=Math.exp(-2.3/wd); return (650*(0.3*x/(0.05+x)+0.7/(1+Math.exp(-(x-xc)/(0.02*xc+0.004))))).toPrecision(6); })).join(';')));
  w('kernel-utente.csv', L.join('\n')+'\n'); }
// 12) TPR sintetico (DEDOTTO): tempo, temperatura misurata, segnale TCD, due picchi gaussiani
{ const L=['Kaomi for Autosorb','Method: TPR','Gas: 5% H2/Ar','Flow: 30 cm3/min','Ramp: 10 °C/min','Sample Weight: 0.0500 g','Time (min);Temperature (°C);TCD Signal (mV)'];
  for (let i=0;i<=700;i++){ const t=i*0.1, T=50+10*t, s=0.2+0.0004*T+8*Math.exp(-(((T-320)/25)**2))+5*Math.exp(-(((T-480)/35)**2)); L.push([f(t,2),f(T,2),f(s,5)].join(';')); }
  w('tpr-sintetico.txt', L.join('\n')+'\n'); }
// 13) impulsi di CO (DEDOTTO): aree per impulso, loop, temperatura, miscela; 1% Pt
{ const L=['Kaomi for Autosorb','Method: Pulse Chemisorption','Gas: 10% CO/He','Loop Volume: 0.250 cm3','Loop Temperature: 35 °C','Sample Weight: 0.1000 g','Metal: Pt','Metal Loading: 1.0 %','Stoichiometry: 1','Pulse No.;Peak Area'];
  [0,0,180.5,812.3,1180.2,1201.4,1200.9,1201.6].forEach((a,i)=>L.push(`${i+1};${a}`)); w('impulsi-co.txt', L.join('\n')+'\n'); }
// 14) chemisorbimento statico di H₂ (DEDOTTO): isoterma combinata e ripetuta
{ const L=['Kaomi for Autosorb','Static Chemisorption','Gas: H2','Analysis Temp: 35 °C','Sample Weight: 0.5000 g','Metal: Pt','Metal Loading: 1.0 %','Stoichiometry: 2','','Combined isotherm','Pressure (Torr);Volume Adsorbed (cm3 STP/g)'];
  const ps=[80,120,160,200,240,280,320,360,400]; ps.forEach(p=>L.push(`${p};${(0.62+0.00050*p).toFixed(5)}`)); L.push('','Repeat isotherm','Pressure (Torr);Volume Adsorbed (cm3 STP/g)'); ps.forEach(p=>L.push(`${p};${(0.08+0.00045*p).toFixed(5)}`));
  w('statico-h2.txt', L.join('\n')+'\n'); }
// 15) TPD di NH₃ a 4 rampe (Polanyi–Wigner, primo ordine, E = 120 kJ/mol, ν = 1e13 s⁻¹): per Kissinger
for (const beta of [5,10,15,20]){ const R=8.314462618, E=120e3, nu=1e13, dt=0.05; let th=1, T=300.15, t=0; const L=['Kaomi for Autosorb','Method: TPD','Gas: NH3',`Ramp: ${beta} °C/min`,'Sample Weight: 0.1000 g','Time (min);Temperature (°C);TCD Signal (mV)'];
  while (T<973.15){ const r=nu*th*Math.exp(-E/(R*T)); th=Math.max(0, th-r*dt); L.push([(t/60).toFixed(4),(T-273.15).toFixed(3),(0.1+5000*r).toFixed(6)].join(';')); t+=dt; T+=beta/60*dt; }
  w(`tpd-nh3-${beta}.txt`, L.filter((_,i)=>i<6||i%4===0).join('\n')+'\n'); }
// 16) chemisorbimento con colonne non riconoscibili: importazione guidata
w('impulsi-colonne-ignote.txt', ['Kaomi for Autosorb','Pulse chemisorption','Col A;Col B'].concat([0,300,900,1200,1201,1200].map((a,i)=>`${i+1};${a}`)).join('\n')+'\n');
// 17) XLSX (DEDOTTO): la stessa isoterma di kaomi-tabella-en.csv in una cartella di lavoro con un foglio «Data Reduction» e uno «Isotherm»
(async()=>{ const JSZip=require('jszip'), z=new JSZip(), esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;'), col=i=>String.fromCharCode(65+i);
  const sheet=rows=>`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((r,i)=>`<row r="${i+1}">${r.map((c,j)=>typeof c==='number'?`<c r="${col(j)}${i+1}"><v>${c}</v></c>`:`<c r="${col(j)}${i+1}" t="inlineStr"><is><t>${esc(c)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
  const head=[['Anton Paar Kaomi for Autosorb','version 2.02'],['Sample ID','Sintetico meso 1'],['Sample Weight',0.2,'g'],['Analysis Gas','Nitrogen'],['Analysis Temp',77.35,'K'],['Instrument','Autosorb 6300'],['Station',3],['Cross Section Area',16.2,'Å²']];
  const iso=[['Isotherm-Normalized Data'],['Pressure (Torr)','p₀ (Torr)','Relative Pressure, p/p₀','Amount Adsorbed (cm³ STP/g)','Time (min)']].concat(seq.map(o=>[+o.p.toFixed(4),+o.p0.toFixed(3),+o.x.toFixed(6),+o.n.toFixed(4),+o.t.toFixed(3)]));
  z.file('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
  z.file('xl/workbook.xml','<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data Reduction" sheetId="1" r:id="rId1"/><sheet name="Isotherm" sheetId="2" r:id="rId2"/></sheets></workbook>');
  z.file('xl/_rels/workbook.xml.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>');
  z.file('xl/worksheets/sheet1.xml', sheet(head)); z.file('xl/worksheets/sheet2.xml', sheet(iso));
  const fixed=new Date(Date.UTC(2026,10,13)); z.forEach((_,f)=>{ f.date=fixed; });
  fs.writeFileSync(path.join(D,'kaomi-cartella.xlsx'), await z.generateAsync({type:'nodebuffer', compression:'DEFLATE'}));
  console.log('fixture scritte in', D); })();
