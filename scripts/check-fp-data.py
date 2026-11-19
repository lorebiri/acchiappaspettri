#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
# SPDX-License-Identifier: GPL-3.0-or-later
"""Controllo di coerenza delle tabelle FP_DATA (index.html) con xraylib (Schoonjans et al. 2011, doi:10.1016/j.sab.2011.09.011).
Scrive i valori di riferimento di xraylib in test/fixtures/xraylib-ref.json; il test test/unit/fp-dati.test.js li confronta con il nucleo
(fpTau, fpSigma, rese), così la CI non ha bisogno di xraylib. Uso:
  python3 -m venv /tmp/v && /tmp/v/bin/pip install xraylib && /tmp/v/bin/python scripts/check-fp-data.py
Energie scelte lontano dagli spigoli (± 3%), dove l'interpolazione log-log è attendibile."""
import xraylib as x, json, os, random
random.seed(31)
EL=['C','O','Na','Al','Si','S','K','Ca','Ti','Cr','Mn','Fe','Ni','Cu','Zn','As','Sr','Zr','Mo','Ag','Sn','Sb','Ba','W','Au','Hg','Pb','Bi','U']
LN={'Ka':[x.KA1_LINE,x.KA2_LINE,x.KA3_LINE],'Kb':[x.KB1_LINE,x.KB2_LINE,x.KB3_LINE,x.KB4_LINE,x.KB5_LINE],'La':[x.LA1_LINE,x.LA2_LINE],
    'Lg':[x.LG1_LINE,x.LG2_LINE,x.LG3_LINE,x.LG4_LINE,x.LG5_LINE,x.LG6_LINE,x.LG8_LINE],'Ma':[x.MA1_LINE,x.MA2_LINE],'Mb':[x.MB_LINE]}
SH={'K':x.K_SHELL,'L1':x.L1_SHELL,'L2':x.L2_SHELL,'L3':x.L3_SHELL,'M5':x.M5_SHELL}
def near_edge(Z,E):
    for s in range(x.K_SHELL, x.M5_SHELL+1):
        try: e=x.EdgeEnergy(Z,s)
        except Exception: continue
        if e>0 and abs(E/e-1)<0.03: return True
    return False
out={'xraylib':x.__version__,'tau':[],'sigma':[],'w':[]}
for s in EL:
    Z=x.SymbolToAtomicNumber(s)
    for _ in range(6):
        E=round(1.2*(45/1.2)**random.random(),4)
        if near_edge(Z,E): continue
        out['tau'].append([s,E,x.CS_Photo(Z,E)])
        for nm,parts in LN.items():
            v=0.0
            for q in parts:
                try: v+=x.CS_FluorLine_Kissel_Cascade(Z,q,E)
                except Exception: pass
            if v>0: out['sigma'].append([s,nm,E,v])
    for k,v in SH.items():
        try: w=x.FluorYield(Z,v)
        except Exception: w=0
        if w>0: out['w'].append([s,k,w])
p=os.path.join(os.path.dirname(__file__),'..','test','fixtures','xraylib-ref.json')
open(p,'w').write(json.dumps(out,separators=(',',':'))); print(p, len(out['tau']), len(out['sigma']), len(out['w']))
