#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
# SPDX-License-Identifier: GPL-3.0-or-later
"""Genera le tabelle fisiche FP_DATA incorporate in index.html, da xraylib (Schoonjans et al. 2011).
Uso:  python3 -m venv /tmp/v && /tmp/v/bin/pip install xraylib && /tmp/v/bin/python scripts/gen-fp-data.py fp_data.json
Poi:  node scripts/embed-fp-data.js fp_data.json
Nota: LineEnergy(KB_LINE) di xraylib, per Z ≥ ~50, pesa anche le componenti senza energia definita e dà valori troppo bassi
(Ba Kβ 35,516 keV invece di ~36,4): le energie composte si calcolano qui pesando solo le componenti con energia definita."""
import xraylib as x, math, json, sys
NG=150; E0,E1=1.0,50.0
grid=[E0*(E1/E0)**(i/(NG-1)) for i in range(NG)]
SG=[E0*(E1/E0)**(i/11) for i in range(12)]
EDGES=[('K',x.K_SHELL),('L1',x.L1_SHELL),('L2',x.L2_SHELL),('L3',x.L3_SHELL),('M1',x.M1_SHELL),('M2',x.M2_SHELL),('M3',x.M3_SHELL),('M4',x.M4_SHELL),('M5',x.M5_SHELL)]
LINES={'Ka':x.KA_LINE,'Kb':x.KB_LINE,'La':x.LA_LINE,'Lb':x.LB_LINE}
PARTS={'Ka':[x.KA1_LINE,x.KA2_LINE],'Kb':[x.KB1_LINE,x.KB2_LINE,x.KB3_LINE,x.KB4_LINE,x.KB5_LINE],'La':[x.LA1_LINE,x.LA2_LINE],'Lb':[x.LB1_LINE,x.LB2_LINE,x.LB3_LINE,x.LB4_LINE,x.LB5_LINE,x.LB6_LINE,x.LB7_LINE,x.LB9_LINE,x.LB10_LINE,x.LB15_LINE,x.LB17_LINE]}
FAM={'K':[('Ka',x.KA_LINE),('Kb',x.KB_LINE)], 'L':[('La',x.LA_LINE),('Lb1',x.LB1_LINE),('Lb2',x.LB2_LINE),('Lg1',x.LG1_LINE),('Ll',x.LL_LINE),('Ln',x.LE_LINE)], 'M':[('Ma',x.MA1_LINE),('Ma2',x.MA2_LINE),('Mb',x.MB_LINE),('Mg',x.MG_LINE)]}
def safe(f,*a):
    try: return f(*a)
    except Exception: return 0.0
def line_energy(Z,nm,L):
    """energia media pesata con le componenti che hanno energia e resa definite"""
    if nm not in PARTS: return safe(x.LineEnergy,Z,L)
    num=den=0.0
    for p in PARTS[nm]:
        e=safe(x.LineEnergy,Z,p); r=safe(x.RadRate,Z,p)
        if e>0 and r>0: num+=e*r; den+=r
    return num/den if den>0 else safe(x.LineEnergy,Z,L)
out={'grid':[round(e,5) for e in grid],'sgrid':[round(e,5) for e in SG],'el':{}}
for Z in [4]+list(range(6,93)):
    sym=x.AtomicNumberToSymbol(Z); A=x.AtomicWeight(Z)
    edges={n:round(safe(x.EdgeEnergy,Z,s),4) for n,s in EDGES}; edges={k:v for k,v in edges.items() if v>0.05}
    tau=[safe(x.CS_Photo,Z,e) for e in grid]
    sca=[safe(x.CS_Rayl,Z,e)+safe(x.CS_Compt,Z,e) for e in SG]
    enc=lambda v: int(round(math.log10(max(v,1e-30))*1000))
    rec={'s':sym,'A':round(A,3),'ed':edges,'t':[enc(v) for v in tau],'sc':[enc(v) for v in sca],'ln':{},'fam':{}}
    eds=sorted(set(v for v in edges.values() if 1.0<v<50.0))
    bounds=[1.0]+eds+[50.0]
    for nm,L in LINES.items():
        E=line_energy(Z,nm,L)
        if E<=0.5: continue
        segs=[]
        for a,b in zip(bounds[:-1],bounds[1:]):
            m=math.sqrt(a*b); t=safe(x.CS_Photo,Z,m); s=safe(x.CS_FluorLine_Kissel_Cascade,Z,L,m)
            segs.append([round(a,4), float('%.4g'%(s/t if t>0 else 0.0))])
        comp=[]
        for sgm in segs:
            if not comp or abs(sgm[1]-comp[-1][1])>1e-6*max(1,abs(sgm[1])): comp.append(sgm)
        if any(v>0 for _,v in comp): rec['ln'][nm]={'E':round(E,4),'r':comp}
    for fn,ls in FAM.items():
        exc={'K':safe(x.EdgeEnergy,Z,x.K_SHELL),'L':safe(x.EdgeEnergy,Z,x.L1_SHELL),'M':safe(x.EdgeEnergy,Z,x.M1_SHELL)}[fn]*1.15+0.5
        vals=[(n,line_energy(Z,n,L),safe(x.CS_FluorLine_Kissel_Cascade,Z,L,exc)) for n,L in ls]
        tot=sum(v for _,e,v in vals if e>0)
        if tot>0: rec['fam'][fn]=[[n,round(e,4),float('%.4g'%(v/tot))] for n,e,v in vals if e>0 and v/tot>0.002]
    out['el'][sym]=rec
js=json.dumps(out,separators=(',',':'))
open(sys.argv[1] if len(sys.argv)>1 else 'fp_data.json','w').write(js); print(len(js)//1024,'kB')
for s in ['Cu','Sn','Sb','Ba','Nd','Pb','Au']: print(s,{k:v['E'] for k,v in out['el'][s]['ln'].items()})
