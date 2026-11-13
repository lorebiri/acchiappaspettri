# SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
# SPDX-License-Identifier: GPL-3.0-or-later
# Calcolo indipendente (Python, senza dipendenze) di k, x, U e RRF della taratura salvata, per la prova T4 di
# docs/SPEC-TARATURA-SALVATA.md: confronto con app/hplc-stored-cal.js, LRE >= 10. Scritto dalla specifica, non dal codice JS.
# Ingresso: JSON su stdin, una lista di casi; uscita: JSON con {k, x, U, rrf_x} per caso.
import json, math, sys

def fsum(v):
    return math.fsum(v)

def case(c):
    cal = c['cal']; a = 0.0 if cal.get('kind') == 'rf' else (cal.get('intercept') or 0.0); b = cal['slope']
    y = c['y']; ctr = c.get('controls') or []
    out = {}
    if c.get('rrf') is not None:
        out['rrf_x'] = y / (c['rrf'] * c['activeRF'])
        return out
    if not ctr:
        k = 1.0; mc = None; xc = None
    else:
        ks = [q['y'] / (a + b * q['nominal']) for q in ctr]
        lv = sorted(set(q['nominal'] for q in ctr))
        if len(lv) == 1:
            k = fsum(ks) / len(ks); xc = lv[0]
        else:
            lo = [kk for kk, q in zip(ks, ctr) if q['nominal'] == lv[0]]
            hi = [kk for kk, q in zip(ks, ctr) if q['nominal'] == lv[-1]]
            k = (fsum(lo) / len(lo) + fsum(hi) / len(hi)) / 2.0; xc = None
        mc = len(ctr)
    x = (y / k - a) / b
    # s_r relativa: data, oppure srel della taratura, oppure s_y/x alla risposta corretta
    if c.get('sr') is not None: sr = c['sr']
    elif cal.get('srel') is not None: sr = cal['srel']
    else: sr = abs(cal['syx'] / (y / k))
    inv = lambda v: 0.0 if v is None else 1.0 / v
    rep = sr * sr * (inv(mc) + 1.0)
    std = (c.get('uStd') or 0.0) ** 2
    sa = cal.get('sa')
    it = 0.0 if (sa is None or cal.get('kind') == 'rf') else (sa / b) ** 2 * (1.0 / x - (1.0 / xc if xc else 0.0)) ** 2
    days = 0.05 ** 2 if not ctr else 0.0
    U = 2.0 * x * math.sqrt(rep + std + it + days)
    out.update({'k': k, 'x': x, 'U': U})
    return out

print(json.dumps([case(c) for c in json.load(sys.stdin)]))
