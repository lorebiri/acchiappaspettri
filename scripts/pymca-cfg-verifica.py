# SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
# SPDX-License-Identifier: GPL-3.0-or-later
# Verifica di app/pymca-cfg-core.js con PyMca vero (lanciato da scripts/pymca-cfg-verifica.js, non dalla CI).
#  1) rilegge con ConfigDict di PyMca i file .cfg originali e quelli scritti dal modulo JS, e li stampa in JSON;
#  2) fa il fit e le concentrazioni di Steel.spe con Steel.cfg originale e con il .cfg rifatto da toAcch → fromAcch.
# Uso: python -I pymca-cfg-verifica.py <file.json di richiesta> <file.json di uscita>   (serve: pip install pymca==5.9.7 fisx==1.3.2 numpy)
import sys, json, math, copy
import numpy
from PyMca5.PyMcaIO import ConfigDict, specfilewrapper as specfile
from PyMca5.PyMcaPhysics.xrf import ClassMcaTheory, ConcentrationsTool
import PyMca5


def plain(v):
    """valori di ConfigDict → JSON: vettori numpy in liste, nan e infiniti in stringhe marcate"""
    if isinstance(v, dict):
        return {k: plain(x) for k, x in v.items()}
    if isinstance(v, numpy.ndarray):
        return {'__ndarray__': plain(v.tolist())}
    if isinstance(v, (list, tuple)):
        return [plain(x) for x in v]
    if isinstance(v, float):
        if math.isnan(v):
            return '__nan__'
        if math.isinf(v):
            return '__inf__' if v > 0 else '__-inf__'
        return v
    return v


def read(path):
    c = ConfigDict.ConfigDict()
    c.read(path)
    return plain(dict(c))


def steel(spe, cfgpath):
    sf = specfile.Specfile(spe)
    y = sf[0].mca(1)
    x = numpy.arange(y.size, dtype=float)
    cfg = ConfigDict.ConfigDict()
    cfg.read(cfgpath)
    f = ClassMcaTheory.ClassMcaTheory()
    cfg = f.configure(cfg)
    f.setData(x, y, xmin=cfg['fit']['xmin'], xmax=cfg['fit']['xmax'])
    f.estimate()
    fr, res = f.startFit(digest=1)
    ct = ConcentrationsTool.ConcentrationsTool()
    cc = ct.configure()
    cc.update(cfg['concentrations'])
    out = {'chisq': float(res['chisq']), 'areas': {g: float(res[g]['fitarea']) for g in res['groups']}}
    for sec in (0, 1, 2):
        cc['usemultilayersecondary'] = sec
        cc['usematrix'] = 1
        c, info = ct.processFitResult(config=cc, fitresult={'result': res}, elementsfrommatrix=False,
                                      fluorates=f._fluoRates, addinfo=True)
        out['sec%d' % sec] = {k: float(v) for k, v in c['mass fraction'].items()}
    return out


if __name__ == '__main__':
    req = json.load(open(sys.argv[1], encoding='utf8'))
    out = {'pymca': PyMca5.version(), 'letti': {}, 'steel': {}}
    try:
        import fisx
        out['fisx'] = fisx.version()
    except Exception:
        out['fisx'] = None
    for name, path in req['leggi'].items():
        out['letti'][name] = read(path)
    for name, path in req.get('steel', {}).items():
        out['steel'][name] = steel(req['spe'], path)
    with open(sys.argv[2], 'w', encoding='utf8') as fp:   # PyMca stampa messaggi sullo stdout: il risultato va in un file
        json.dump(out, fp, indent=1, sort_keys=True)
