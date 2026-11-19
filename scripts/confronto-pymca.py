#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
# SPDX-License-Identifier: GPL-3.0-or-later
"""Confronto automatico con PyMca (punto 5 della 3.1): fa girare PyMca 5.9.7 con fisx 1.3.2 sugli spettri pubblici e salva aree, χ² e
concentrazioni in test/fixtures/pymca/confronto-pymca.json. Il test test/unit/xrf-pymca-confronto.test.js fa girare Acchiappaspettri sugli
stessi spettri e confronta (così la CI non ha bisogno di Python); docs/VALIDAZIONE-PYMCA.md riporta le tabelle (node scripts/confronto-pymca.js).
Spettri: Steel.spe (acciaio NIST SRM 1155, 16 keV monocromatico, Steel.cfg), XRFSpectrum.mca (standard sottile, cfg di PyMca5/tests/XrfTest.py),
il bronzo SINTETICO di examples/ (tubo Rh 40 kV, spettro del tubo di Ebel). Per ogni spettro: la configurazione di PyMca così com'è
(hypermetflag 1 = sola gaussiana) e con l'ipermetro completo (15). Uso:
  python3 -m venv /tmp/v && /tmp/v/bin/pip install pymca==5.9.7 fisx==1.3.2 numpy
  /tmp/v/bin/python -I scripts/confronto-pymca.py"""
import os, sys, json, copy, numpy
from PyMca5.PyMcaIO import specfilewrapper as specfile, ConfigDict
from PyMca5.PyMcaPhysics.xrf import ClassMcaTheory, ConcentrationsTool, XRayTubeEbel
import PyMca5, fisx
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); FX = os.path.join(ROOT, 'test', 'fixtures', 'pymca')

def run(x, y, cfg, xmin, xmax):
    f = ClassMcaTheory.ClassMcaTheory(); cfg = f.configure(cfg)
    f.setData(x, y, xmin=xmin, xmax=xmax); f.estimate(); fr, res = f.startFit(digest=1)
    P = list(res['parameters']); par = lambda k: float(res['fittedpar'][P.index(k)]) if k in P else None
    out = {'chi2r': float(res['chisq']), 'zero': par('Zero'), 'gain': par('Gain'), 'noise': par('Noise'), 'fano': par('Fano'), 'sum': par('Sum'),
           'areas': {g: float(res[g]['fitarea']) for g in res['groups']}, 'sigma': {g: float(res[g]['sigmaarea']) for g in res['groups']},
           'xmin': int(xmin), 'xmax': int(xmax)}
    return f, res, out

def conc(f, res, cfg, sec=2, ref=None):
    ct = ConcentrationsTool.ConcentrationsTool(); cc = ct.configure(); cc.update(cfg['concentrations'])
    cc['usemultilayersecondary'] = sec
    if ref: cc['reference'] = ref
    c, info = ct.processFitResult(config=cc, fitresult={'result': res}, elementsfrommatrix=False, fluorates=f._fluoRates, addinfo=True)
    return {k: float(v) for k, v in c['mass fraction'].items()}

def steel():
    sf = specfile.Specfile(os.path.join(FX, 'Steel.spe')); y = sf[0].mca(1); x = numpy.arange(y.size, dtype=float)
    base = ConfigDict.ConfigDict(); base.read(os.path.join(FX, 'Steel.cfg'))
    base['concentrations']['usematrix'] = 1; base['concentrations']['reference'] = 'Fe'
    out = {}
    for name, hyp in (('pymca-cfg', None), ('ipermetro', 15)):
        cfg = copy.deepcopy(base)
        if hyp: cfg['fit']['hypermetflag'] = hyp
        f, res, o = run(x, y, cfg, cfg['fit']['xmin'], cfg['fit']['xmax'])
        o['conc'] = {('sec%d' % s): conc(f, res, cfg, s) for s in (1, 2)}
        o['hypermetflag'] = cfg['fit']['hypermetflag']; out[name] = o
    return out

def xrfspectrum():
    sf = specfile.Specfile(os.path.join(FX, 'XRFSpectrum.mca')); y = numpy.array(sf[0].data()[-1], dtype=float); x = numpy.arange(y.size, dtype=float)   # una colonna: mca(1) darebbe i numeri di canale
    base = ConfigDict.ConfigDict(); base.read(os.path.join(FX, 'XRFSpectrum.cfg')); base['fit']['linearfitflag'] = 0
    out = {}
    for name, hyp in (('pymca-cfg', None), ('ipermetro', 15)):
        cfg = copy.deepcopy(base)
        if hyp: cfg['fit']['hypermetflag'] = hyp
        f, res, o = run(x, y, cfg, cfg['fit']['xmin'], cfg['fit']['xmax']); o['hypermetflag'] = cfg['fit']['hypermetflag']; out[name] = o
    return out

def bronze():
    p = os.path.join(ROOT, 'examples', 'xrf-lega-sintetico', 'BRONZO_SIMULATO_Rh40kV_SINTETICO.mca')
    y = numpy.array([float(s) for s in (l.strip() for l in open(p, encoding='utf8')) if s and not s.startswith('#')]); x = numpy.arange(y.size, dtype=float)
    cfg = ConfigDict.ConfigDict(); cfg.read(os.path.join(FX, 'McaTheory.cfg'))
    e, w, s = XRayTubeEbel.generateLists('Rh', 40.0, window=['Be', 1.848, 0.0125], alphae=90.0, alphax=20.0); n = len(e)
    cfg['fit'].update({'energy': list(e), 'energyweight': list(w), 'energyflag': [1] * n, 'energyscatter': list(map(int, s)), 'scatterflag': 1,
                       'escapeflag': 1, 'sumflag': 1, 'hypermetflag': 1, 'stripflag': 1, 'stripalgorithm': 1, 'snipwidth': 30, 'continuum': 0})
    cfg['detector'].update({'zero': 0.0, 'gain': 0.02, 'noise': 0.07, 'fano': 0.114, 'detele': 'Si'})
    cfg['peaks'] = {'Cu': 'K', 'Zn': 'K', 'As': 'K', 'Sn': ['K', 'L'], 'Pb': ['L', 'M']}
    att = cfg['attenuators']
    for k in list(att.keys()): att[k] = [0, '-', 0.0, 0.0, 1.0]
    att['atmosphere'] = [1, 'Air', 0.0012048, 2.0, 1.0]; att['window'] = [1, 'Be1', 1.848, 0.00125, 1.0]; att['Detector'] = [1, 'Si1', 2.33, 0.05, 1.0]
    comp = {k: 0.2 for k in ('Cu', 'Sn', 'Pb', 'Zn', 'As')}   # partenza uniforme: la verità non entra nel calcolo
    att['Matrix'] = [1, 'Bronzo', 8.8, 1.0, 45.0, 45.0, 0, 90.0]
    cfg['concentrations']['usematrix'] = 0; cfg['concentrations']['usemultilayersecondary'] = 1
    g = {'Cu': 'Cu K', 'Zn': 'Zn K', 'As': 'As K', 'Sn': 'Sn K', 'Pb': 'Pb L'}
    for it in range(8):   # matrice iterata e normalizzata a 100% come il modo «leghe» di Acchiappaspettri
        cfg['materials']['Bronzo'] = {'Comment': 'stima', 'Density': 8.8, 'Thickness': 1.0, 'CompoundList': list(comp.keys()), 'CompoundFraction': list(comp.values())}
        f, res, o = run(x, y, copy.deepcopy(cfg), int(1.0 / 0.02), int(38.0 / 0.02))
        mf = conc(f, res, cfg, 1); raw = {k: max(0.0, mf.get(v, 0.0)) for k, v in g.items()}; t = sum(raw.values()); comp = {k: v / t for k, v in raw.items()}
    o['norm100'] = comp; o['verita'] = {'Cu': 0.84, 'Sn': 0.08, 'Pb': 0.05, 'Zn': 0.025, 'As': 0.005}
    return {'pymca-ebel': o}

if __name__ == '__main__':
    out = {'versioni': {'pymca': PyMca5.version(), 'fisx': getattr(fisx, '__version__', '?')}, 'steel': steel(), 'xrfspectrum': xrfspectrum(), 'bronzo': bronze()}
    open(os.path.join(FX, 'confronto-pymca.json'), 'w').write(json.dumps(out, indent=1))
    print(json.dumps({k: {n: v.get('chi2r') for n, v in out[k].items()} for k in ('steel', 'xrfspectrum', 'bronzo')}))
