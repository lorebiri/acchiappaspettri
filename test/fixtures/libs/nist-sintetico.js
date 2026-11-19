// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
// SPDX-License-Identifier: GPL-3.0-or-later
// Piccolo campione SINTETICO nel formato delle risposte del NIST ASD (lines1.pl, energy1.pl, ie.pl): valori inventati, NON dati del NIST.
// Serve a provare lo scaricamento e l'elaborazione dei dati atomici (app/libs-nist.js) senza ridistribuire i dati veri.
// campione sintetico: righe e livelli inventati per H I, Cu I, Cu II, Sn I; per gli altri elementi il «NIST» non ha dati
const LH='obs_wl_air(nm)\tunc_obs_wl\tritz_wl_air(nm)\tunc_ritz_wl\tintens\tAki(s^-1)\tAcc\tEi(eV)\tEk(eV)\tconf_i\tterm_i\tJ_i\tconf_k\tterm_k\tJ_k\tg_i\tg_k\tType\ttp_ref\tline_ref\t';
const row=(wl, A, acc, Ei, Ek, gi, gk, o)=>{ o=o||{}; return [o.obs===''?'""':'"'+wl+'"','""','"'+(o.ritz||wl)+'"','""','"10"','"'+A+'"',acc,'"'+Ei+'"','"'+Ek+'"','"'+(o.ci||'3d10.4s')+'"','"2S"','"1/2"','"'+(o.ck||'3d10.4p')+'"','"2P*"','"3/2"',gi,gk,o.type||'','""','"X"',''].join('\t'); };
const SAMPLE={
  'lines_H_I.tsv':[LH, row(656.28,'6.47e7','AAA',10.2,12.09,2,4,{ci:'2p',ck:'3d'}), row(656.27,'2.25e7','AAA',10.2,12.09,2,2,{ci:'2s',ck:'3p'}), row(656.28,'4.41e7','AAA',10.2,12.09,8,18,{ci:'2',ck:'3'}),
    row(486.13,'8.42e6','AAA',10.2,12.75,8,32,{ci:'2',ck:'4'})].join('\n'),
  'lines_Cu_I.tsv':[LH, row(324.754,'1.395e8','AA',0,3.817,2,4), row(327.396,'1.376e8','AA',0,3.786,2,2), row(510.554,'2.0e6','A',1.389,3.817,6,4), row(515.324,'6.0e7','B+',3.786,6.192,2,4),
    row(521.820,'7.5e7','B+',3.817,6.192,4,6), row(578.213,'1.65e6','A',1.642,3.786,4,2), row(222.0,'(1e5)','C',0,5.58,2,4), row(250.0,'','',0,4.96,2,4), row(300.0,'1e6','C',0,4.13,2,4,{type:'M1'}),
    row(950.0,'1e6','A',0,1.3,2,4), row(458.7,'3.2e7','B',5.5,8.2,4,6,{obs:'',ritz:'458.697'})].join('\n'),
  'lines_Cu_II.tsv':[LH, row(224.700,'1.5e8','B',2.72,8.23,5,7), row(271.350,'7.0e7','C+',3.25,7.82,5,5), row(268.929,'1.0e8','C',3.26,7.87,5,3)].join('\n'),
  'lines_Sn_I.tsv':[LH, row(283.999,'1.7e8','D',0.425,4.789,5,3), row(317.505,'1.0e8','D+',0.425,4.329,5,3), row(326.234,'2.7e8','E',1.068,4.867,5,3)].join('\n'),
  'levels_H_I.tsv':'Configuration\tTerm\tJ\tg\tLevel (eV)\tUncertainty (eV)\tReference\n"1s"\t"2S"\t"1/2"\t2\t"0.0"\t""\t""\n"2p"\t"2P*"\t"3/2"\t4\t"10.19881"\t""\t""\n"2s"\t"2S"\t"1/2"\t2\t"10.19881"\t""\t""\n"3d"\t"2D"\t"5/2"\t6\t"12.08749"\t""\t""\n""\t"Limit"\t""\t""\t"13.59843"\t""\t""',
  'levels_Cu_I.tsv':'Configuration\tTerm\tJ\tg\tLevel (eV)\tUncertainty (eV)\tReference\n"3d10.4s"\t"2S"\t"1/2"\t2\t"0.0000000"\t""\t""\n"3d9.4s2"\t"2D"\t"5/2"\t6\t"1.3889"\t""\t""\n"3d9.4s2"\t"2D"\t"3/2"\t4\t"[1.6422]"\t""\t""\n"3d10.4p"\t"2P*"\t"1/2"\t2\t"3.7859"\t""\t""\n"3d10.4p"\t"2P*"\t"3/2"\t4\t"3.8170"\t""\t""\n"x"\t"?"\t"1/2"\t2\t"4.0+x"\t""\t""\n"3d10.4d"\t"2D"\t"5/2"\t6\t"6.1920"\t""\t""\n""\t"Limit"\t""\t""\t"7.72638"\t""\t""\n"3d10.9s"\t"2S"\t"1/2"\t2\t"8.0"\t""\t""',
  'levels_Cu_II.tsv':'Configuration\tTerm\tJ\tg\tLevel (eV)\tUncertainty (eV)\tReference\n"3d10"\t"1S"\t"0"\t1\t"0.0"\t""\t""\n"3d9.4s"\t"3D"\t"3"\t7\t"2.7187"\t""\t""\n"3d9.4p"\t"3P*"\t"2"\t5\t"8.2346"\t""\t""',
  'levels_Sn_I.tsv':'Configuration\tTerm\tJ\tg\tLevel (eV)\tUncertainty (eV)\tReference\n"5p2"\t"3P"\t"0"\t1\t"0.0"\t""\t""\n"5p2"\t"3P"\t"1"\t3\t"0.2100"\t""\t""\n"5p2"\t"3P"\t"2"\t5\t"0.4250"\t""\t""\n"5p6s"\t"3P*"\t"1"\t3\t"4.3290"\t""\t""',
  'ie_H.tsv':'Sp. Name\tIon Charge\tIonization Energy (eV)\n"H I"\t0\t"13.598434599702"', 'ie_Cu.tsv':'Sp. Name\tIon Charge\tIonization Energy (eV)\n"Cu I"\t0\t"7.726380"\n"Cu II"\t1\t"[20.29239]"',
  'ie_Sn.tsv':'Sp. Name\tIon Charge\tIonization Energy (eV)\n"Sn I"\t0\t"7.343918"'};
/* risposta per una richiesta al NIST (URL completo), come la darebbe il sito: '' se il campione non ha quella specie */
function respond(url){ const u=new URL(url), q=u.searchParams, script=u.pathname.split('/').pop();
  if (script==='ie.pl'){ const el=(q.get('spectra')||'').split(' ')[0]; return SAMPLE['ie_'+el+'.tsv']||''; }
  const sp=(q.get(script==='lines1.pl' ? 'spectra' : 'spectrum')||'').replace(' ','_');
  return SAMPLE[(script==='lines1.pl' ? 'lines_' : 'levels_')+sp+'.tsv']||''; }
module.exports={SAMPLE, respond};
