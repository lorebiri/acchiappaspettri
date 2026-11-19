# SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
# SPDX-License-Identifier: GPL-3.0-or-later
# Prototipo di STUDIO (non fa parte dell'app): esegue PyMca (MIT, ESRF) su due spettri e stampa le concentrazioni in JSON.
#  1) Steel.spe + Steel.cfg, i dati d'esempio distribuiti con PyMca (acciaio NIST SRM 1155, eccitazione monocromatica 16 keV);
#  2) examples/xrf-lega-sintetico (bronzo SINTETICO di Acchiappaspettri, tubo Rh 40 kV) con una configurazione scritta qui.
# Uso: python pymca_confronto.py <cartella PyMcaData> <file .mca del bronzo>   (serve: pip install pymca fisx numpy)
import sys, json, copy, numpy
from PyMca5.PyMcaIO import specfilewrapper as specfile, ConfigDict
from PyMca5.PyMcaPhysics.xrf import ClassMcaTheory, ConcentrationsTool, XRayTubeEbel, Elements

def fit_conc(x, y, cfg, xmin, xmax):
    f = ClassMcaTheory.ClassMcaTheory(); cfg = f.configure(cfg)
    f.setData(x, y, xmin=xmin, xmax=xmax); f.estimate(); fr, res = f.startFit(digest=1)
    ct = ConcentrationsTool.ConcentrationsTool(); cc = ct.configure(); cc.update(cfg['concentrations'])
    return f, fr, res, ct, cc

def steel(datadir):
    sf = specfile.Specfile(datadir + '/Steel.spe'); y = sf[0].mca(1); x = numpy.arange(y.size, dtype=float)
    cfg = ConfigDict.ConfigDict(); cfg.read(datadir + '/Steel.cfg')
    cfg['concentrations']['usematrix'] = 1; cfg['concentrations']['usemultilayersecondary'] = 2; cfg['concentrations']['reference'] = 'Fe'
    f, fr, res, ct, cc = fit_conc(x, y, cfg, cfg['fit']['xmin'], cfg['fit']['xmax'])
    out = {}
    for sec in (0, 1, 2):
        cc['usemultilayersecondary'] = sec
        c, info = ct.processFitResult(config=cc, fitresult={'result': res}, elementsfrommatrix=False, fluorates=f._fluoRates, addinfo=True)
        out['sec%d' % sec] = {k: v for k, v in c['mass fraction'].items()}
    out['chi2r'] = fr.get('chisq') if isinstance(fr, dict) else None
    out['calib'] = {'zero': cfg['detector']['zero'], 'gain': cfg['detector']['gain']}
    out['areas'] = {g: res[g]['fitarea'] for g in res['groups']}
    return out

def bronze(mca):
    y = []; zero, gain = 0.0, 0.02
    for ln in open(mca, encoding='utf8'):
        s = ln.strip()
        if s.startswith('#') or not s: continue
        y.append(float(s))
    y = numpy.array(y); x = numpy.arange(y.size, dtype=float)
    cfg = ConfigDict.ConfigDict(); cfg.read(sys.argv[1] + '/McaTheory.cfg')
    # tubo Rh 40 kV, finestra Be 125 µm, angoli come in Acchiappaspettri (incidenza elettroni 90°, uscita 20°)
    e, w, s = XRayTubeEbel.generateLists('Rh', 40.0, window=['Be', 1.848, 0.0125], alphae=90.0, alphax=20.0)
    n = len(e); cfg['fit']['energy'] = list(e); cfg['fit']['energyweight'] = list(w)
    cfg['fit']['energyflag'] = [1] * n; cfg['fit']['energyscatter'] = list(map(int, s))
    cfg['fit']['scatterflag'] = 1; cfg['fit']['escapeflag'] = 1; cfg['fit']['sumflag'] = 1; cfg['fit']['hypermetflag'] = 1
    cfg['fit']['stripflag'] = 1; cfg['fit']['stripalgorithm'] = 1; cfg['fit']['snipwidth'] = 30; cfg['fit']['continuum'] = 0
    cfg['detector']['zero'] = 0.01; cfg['detector']['gain'] = 0.02; cfg['detector']['noise'] = 0.07; cfg['detector']['fano'] = 0.114
    cfg['detector']['detele'] = 'Si'
    cfg['peaks'] = {'Cu': 'K', 'Zn': 'K', 'As': 'K', 'Sn': ['K', 'L'], 'Pb': ['L', 'M'], 'Fe': 'K'}
    att = cfg['attenuators']
    for k in list(att.keys()): att[k] = [0, '-', 0.0, 0.0, 1.0]
    att['atmosphere'] = [1, 'Air', 0.0012048, 2.0, 1.0]      # 1 cm tubo-campione + 1 cm campione-rivelatore (approssimato a 2 cm in uscita)
    att['window'] = [1, 'Be1', 1.848, 0.00125, 1.0]           # Be 12,5 µm
    att['Detector'] = [1, 'Si1', 2.33, 0.05, 1.0]             # Si 500 µm
    truth = {'Cu': 0.84, 'Sn': 0.08, 'Pb': 0.05, 'Zn': 0.025, 'As': 0.005}
    comp = dict(truth)
    res_iter = []
    cfg['materials']['Bronzo'] = {'Comment': 'stima', 'Density': 8.8, 'Thickness': 1.0,
                                  'CompoundList': list(comp.keys()), 'CompoundFraction': list(comp.values())}
    att['Matrix'] = [1, 'Bronzo', 8.8, 1.0, 45.0, 45.0, 0, 90.0]
    cfg['concentrations']['usematrix'] = 0; cfg['concentrations']['usemultilayersecondary'] = 1
    # partenza da composizione uguale per tutti: la verità non entra nel calcolo
    comp = {k: 1.0 / len(truth) for k in truth}
    xmin, xmax = int((1.0 - 0.01) / 0.02), int((38.0 - 0.01) / 0.02)
    for it in range(8):
        cfg['materials']['Bronzo']['CompoundList'] = list(comp.keys()); cfg['materials']['Bronzo']['CompoundFraction'] = list(comp.values())
        f, fr, res, ct, cc = fit_conc(x, y, copy.deepcopy(cfg), xmin, xmax)
        c, info = ct.processFitResult(config=cc, fitresult={'result': res}, elementsfrommatrix=False, fluorates=f._fluoRates, addinfo=True)
        mf = c['mass fraction']
        g = {'Cu': 'Cu K', 'Zn': 'Zn K', 'As': 'As K', 'Sn': 'Sn K', 'Pb': 'Pb L'}
        raw = {k: max(0.0, mf.get(v, 0.0)) for k, v in g.items()}; t = sum(raw.values())
        comp = {k: v / t for k, v in raw.items()}   # normalizzazione a 100 % (come il modo «leghe» di Acchiappaspettri)
        res_iter.append(comp)
    return {'norm100': comp, 'truth': truth, 'iters': len(res_iter), 'areas': {gg: res[gg]['fitarea'] for gg in res['groups']},
            'zero': fr['fittedpar'][fr['parameters'].index('Zero')] if 'parameters' in fr else None}

if __name__ == '__main__':
    print(json.dumps({'steel': steel(sys.argv[1]), 'bronze': bronze(sys.argv[2])}, indent=1, default=float))
