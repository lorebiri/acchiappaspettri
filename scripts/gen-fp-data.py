#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
# SPDX-License-Identifier: GPL-3.0-or-later
"""Genera le tabelle fisiche FP_DATA incorporate in index.html, da xraylib (Schoonjans et al. 2011).
Uso:  python3 -m venv /tmp/v && /tmp/v/bin/pip install xraylib && /tmp/v/bin/python scripts/gen-fp-data.py fp_data.json
Poi:  node scripts/embed-fp-data.js fp_data.json
Nota: LineEnergy(KB_LINE) di xraylib, per Z ≥ ~50, pesa anche le componenti senza energia definita e dà valori troppo bassi
(Ba Kβ 35,516 keV invece di ~36,4): le energie composte si calcolano qui pesando solo le componenti con energia definita.
3.1: in più (le chiavi della 3.0 restano identiche, controllato con xraylib 4.3.0): sezioni di produzione delle righe Lγ (Lγ1…Lγ8) e M (Mα, Mβ, Mγ),
rese di fluorescenza ω di K, L1–L3, M1–M5 («w»), probabilità di Coster–Kronig f12, f13, f23 («ck») e le righe di ogni sottoguscio con la
probabilità radiativa («tl»: [nome, E, guscio, probabilità]) per lo spettro del tubo di Ebel. Fonti di xraylib (Schoonjans et al. 2011):
rese e Coster–Kronig da Krause (1979) per K e L ed EADL97 per M (con le correzioni di xraylib); probabilità radiative da Krause/Scofield (1974)."""
import xraylib as x, math, json, sys
NG=150; E0,E1=1.0,50.0
grid=[E0*(E1/E0)**(i/(NG-1)) for i in range(NG)]
SG=[E0*(E1/E0)**(i/11) for i in range(12)]
EDGES=[('K',x.K_SHELL),('L1',x.L1_SHELL),('L2',x.L2_SHELL),('L3',x.L3_SHELL),('M1',x.M1_SHELL),('M2',x.M2_SHELL),('M3',x.M3_SHELL),('M4',x.M4_SHELL),('M5',x.M5_SHELL)]
LINES={'Ka':x.KA_LINE,'Kb':x.KB_LINE,'La':x.LA_LINE,'Lb':x.LB_LINE}
PARTS={'Ka':[x.KA1_LINE,x.KA2_LINE],'Kb':[x.KB1_LINE,x.KB2_LINE,x.KB3_LINE,x.KB4_LINE,x.KB5_LINE],'La':[x.LA1_LINE,x.LA2_LINE],'Lb':[x.LB1_LINE,x.LB2_LINE,x.LB3_LINE,x.LB4_LINE,x.LB5_LINE,x.LB6_LINE,x.LB7_LINE,x.LB9_LINE,x.LB10_LINE,x.LB15_LINE,x.LB17_LINE]}
NEWLINES={'Lg':[x.LG1_LINE,x.LG2_LINE,x.LG3_LINE,x.LG4_LINE,x.LG5_LINE,x.LG6_LINE,x.LG8_LINE],'Ma':[x.MA1_LINE,x.MA2_LINE],'Mb':[x.MB_LINE],'Mg':[x.MG_LINE]}
TL={'K':[('Ka1',x.KA1_LINE),('Ka2',x.KA2_LINE),('Kb1',x.KB1_LINE),('Kb2',x.KB2_LINE),('Kb3',x.KB3_LINE)],
    'L1':[('Lb3',x.LB3_LINE),('Lb4',x.LB4_LINE),('Lg2',x.LG2_LINE),('Lg3',x.LG3_LINE)],
    'L2':[('Lb1',x.LB1_LINE),('Lg1',x.LG1_LINE),('Ln',x.LE_LINE)],
    'L3':[('La1',x.LA1_LINE),('La2',x.LA2_LINE),('Lb2',x.LB2_LINE),('Lb15',x.LB15_LINE),('Ll',x.LL_LINE)]}
TUBE_ANODES={'Sc','Ti','Cr','Fe','Co','Cu','Mo','Rh','Pd','Ag','Ta','W','Pt','Au'}
SHELLS={'K':x.K_SHELL,'L1':x.L1_SHELL,'L2':x.L2_SHELL,'L3':x.L3_SHELL,'M1':x.M1_SHELL,'M2':x.M2_SHELL,'M3':x.M3_SHELL,'M4':x.M4_SHELL,'M5':x.M5_SHELL}
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
    for nm,parts in NEWLINES.items():   # 3.1: Lγ e righe M
        num=den=0.0
        for q in parts:
            e=safe(x.LineEnergy,Z,q); r=safe(x.RadRate,Z,q)
            if e>0 and r>0: num+=e*r; den+=r
        if den<=0 or num/den<=0.5: continue
        segs=[]
        for a,b in zip(bounds[:-1],bounds[1:]):
            m=math.sqrt(a*b); t=safe(x.CS_Photo,Z,m); sm=sum(safe(x.CS_FluorLine_Kissel_Cascade,Z,q,m) for q in parts)
            segs.append([round(a,4), float('%.4g'%(sm/t if t>0 else 0.0))])
        comp=[]
        for sgm in segs:
            if not comp or abs(sgm[1]-comp[-1][1])>1e-6*max(1,abs(sgm[1])): comp.append(sgm)
        if any(v>0 for _,v in comp): rec['ln'][nm]={'E':round(num/den,4),'r':comp}
    # 3.1: produzione su 5 punti per tratto fra due spigoli (interpolazione lineare in log E), usata dal modello fisico «3.1»
    FINE={'Ka':[x.KA_LINE],'Kb':[x.KB_LINE],'La':[x.LA_LINE],'Lb':[x.LB_LINE]}; FINE.update({k:v for k,v in NEWLINES.items() if k!='Mg'})
    for nm,parts in FINE.items():
        if nm not in rec['ln']: continue
        q=[]
        for a,b in zip(bounds[:-1],bounds[1:]):
            pts=[a*1.0005*(b*0.9995/(a*1.0005))**(i/4) for i in range(5)]
            v=[]
            for pt in pts:
                t=safe(x.CS_Photo,Z,pt); v.append(float('%.3g'%(sum(safe(x.CS_FluorLine_Kissel_Cascade,Z,pp,pt) for pp in parts)/t if t>0 else 0.0)))
            if max(v)>0: q.append([round(a,4)]+v)
        if q: rec['ln'][nm]['q']=q
    w={k:float('%.4g'%safe(x.FluorYield,Z,v)) for k,v in SHELLS.items() if k in edges}
    rec['w']={k:v for k,v in w.items() if v>0}
    ck={'f12':safe(x.CosKronTransProb,Z,x.FL12_TRANS),'f13':safe(x.CosKronTransProb,Z,x.FL13_TRANS),'f23':safe(x.CosKronTransProb,Z,x.FL23_TRANS)}
    rec['ck']={k:float('%.4g'%v) for k,v in ck.items() if v>0}
    tl=[]
    for sh,ls in TL.items():
        if sh not in edges: continue
        for n,L in ls:
            e=safe(x.LineEnergy,Z,L); r=safe(x.RadRate,Z,L)
            if e>0.5 and r>1e-4: tl.append([n,round(e,4),sh,float('%.4g'%r)])
    if tl and sym in TUBE_ANODES: rec['tl']=tl   # solo per gli anodi dei tubi (il file resta piccolo)
    for fn,ls in FAM.items():
        exc={'K':safe(x.EdgeEnergy,Z,x.K_SHELL),'L':safe(x.EdgeEnergy,Z,x.L1_SHELL),'M':safe(x.EdgeEnergy,Z,x.M1_SHELL)}[fn]*1.15+0.5
        vals=[(n,line_energy(Z,n,L),safe(x.CS_FluorLine_Kissel_Cascade,Z,L,exc)) for n,L in ls]
        tot=sum(v for _,e,v in vals if e>0)
        if tot>0: rec['fam'][fn]=[[n,round(e,4),float('%.4g'%(v/tot))] for n,e,v in vals if e>0 and v/tot>0.002]
    out['el'][sym]=rec
js=json.dumps(out,separators=(',',':'))
open(sys.argv[1] if len(sys.argv)>1 else 'fp_data.json','w').write(js); print(len(js)//1024,'kB')
for s in ['Cu','Sn','Sb','Ba','Nd','Pb','Au']: print(s,{k:v['E'] for k,v in out['el'][s]['ln'].items()})
