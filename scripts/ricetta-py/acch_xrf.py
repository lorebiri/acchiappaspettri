# =============================================================================================
# Modulo acch_xrf: XRF a parametri fondamentali (FP) e spessore degli strati. Si concatena DOPO acch_tecnica.py
# (ne usa COSTANTI_XRF, _cst, TEC_LANG, t_esc, xrf_align_fit) e dopo acch_ricetta/acch_math (js_*, m_*, chol, median).
# Stesse operazioni nello stesso ordine di index.html:
#   nucleo: fpTau, fpScat, fpMu, fpSigma, fpParseComp, fpMat, fpSetup, fpTube, fpPrep, fpLine, fpIntensities, fpCompton,
#           fpQuant, fpCalibrate, xrfFitLines, nnlsGram, xrfFP, fpMeasure, fpLayerSolve;
#   pannello: fpCfg, fpSetupOf, fpDefaultEls, fpBalance, fpPlan, fpRun, fpNotes (gli avvisi ⚠️, gli unici che vanno nel CSV),
#             fpCsvRows, fpLayerPairs, fpLayerCfg, fpLayerRun, xqModelFP, xrfElements (elementi trovati dai suggerimenti).
# Costanti (FP_DATA, FP_MATS, FP_OXIDE, FP_ANODES, FP_FILTERS, FP_MODES, FP_SUB_DEF, FP_AIR, FP_AIR_RHO, FP_ENH): JSON dell'app
# in dati/, con l'impronta SHA-256, caricate con carica_costanti (non ricopiate qui).
# Numeri: exp, log, pow, sin, cos e hypot sono le m_* di acch_math (motore della sonda); niente sum() di Python sui float
# (da Python 3.12 è compensata): somme in ordine, come in JavaScript.
# Ingresso di ogni spettro (voce di acch_tecnica) in più: xrf (f.xrf, intestazione), xsug (per picco: i primi tre suggerimenti
# {id, coherent}, quanti sono, se vengono da suggAll, e l'etichetta grezza f.labels[lblKey(x)]).
# =============================================================================================

_FPX = {'id': None, 'FP': None, 'cache': {}}


def _bisect_left(a, x):
    # primo indice con a[i] >= x (a in ordine crescente)
    lo, hi = 0, len(a)
    while lo < hi:
        mid = (lo + hi) // 2
        if a[mid] < x:
            lo = mid + 1
        else:
            hi = mid
    return lo


def _xc(k):
    return _cst(k)


def _fp():
    # index.html: const FP=(()=>{...})() costruito da FP_DATA
    D = _xc('FP_DATA')
    if _FPX['id'] is D and _FPX['FP'] is not None:
        return _FPX['FP']
    G = [float(v) for v in D['grid']]
    n = len(G)
    lg = [m_log(v) for v in G]
    SG = [float(v) for v in D['sgrid']]
    slg = [m_log(v) for v in SG]
    k = 2.302585092994046 / 1000   # Math.LN10/1000
    el = {}
    for i, (s, r) in enumerate(D['el'].items()):
        edges = sorted(v for v in r['ed'].values() if v > G[0] and v < G[n - 1])
        el[s] = {'s': s, 'Z': 4 if i == 0 else i + 5, 'A': r['A'], 'ed': r['ed'], 'edges': edges,
                 't': [v * k for v in r['t']], 'sc': [v * k for v in r['sc']], 'ln': r['ln'], 'fam': r['fam']}
    FP = {'G': G, 'n': n, 'lg': lg, 'SG': SG, 'slg': slg, 'dl': (lg[n - 1] - lg[0]) / (n - 1), 'sdl': (slg[-1] - slg[0]) / (len(slg) - 1), 'el': el}
    _FPX.update({'id': D, 'FP': FP, 'cache': {}})
    return FP


# ---------- semantica di JavaScript ----------
def _t(v):
    # verità di JavaScript
    if v is None or v is False:
        return False
    if v is True:
        return True
    if isinstance(v, (int, float)):
        return v == v and v != 0
    if isinstance(v, str):
        return v != ''
    return True


def _xn(v):
    # +v (undefined e null: NaN, così ogni confronto è falso come in JavaScript)
    if v is None:
        return NAN
    if isinstance(v, bool):
        return 1.0 if v else 0.0
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        return js_number(v)
    return NAN


def _js_s(v):
    # `${v}` di un valore
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return js_str(v)
    return '' if v is None else str(v)


def _ed(e, k):
    v = e['ed'].get(k)
    return NAN if v is None else v


def fp_num(v):
    # index.html fpNum: parseFloat del testo con la virgola decimale; undefined se non è un numero finito
    s = '' if v is None else (js_str(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else ('true' if v is True else 'false' if v is False else str(v)))
    x = js_parse_float(s.replace(',', '.', 1))
    return x if math.isfinite(x) else None


# ---------- sezioni d'urto ----------
def _edge_in(e, a, b):
    for v in e['edges']:
        if v > a and v <= b:
            return True
    return False


def fp_tau(s, E):
    # index.html fpTau: τ fotoelettrica (cm²/g), log-log, estrapolazione dal lato giusto di uno spigolo
    FP = _fp()
    e = FP['el'].get(s)
    if not e or not (E > 0):
        return 0
    G, n, lg = FP['G'], FP['n'], FP['lg']
    L = m_log(E)
    i = max(0, min(n - 2, math.floor((L - lg[0]) / FP['dl'])))
    while i > 0 and G[i] > E:
        i -= 1
    while i < n - 2 and G[i + 1] < E:
        i += 1
    t = e['t']

    def lin(a, b):
        return t[a] + (t[b] - t[a]) * (L - lg[a]) / (lg[b] - lg[a])
    if not _edge_in(e, G[i], G[i + 1]):
        return m_exp(lin(i, i + 1))
    ed = next(v for v in e['edges'] if v > G[i] and v <= G[i + 1])
    if E >= ed:
        if i + 2 < n and not _edge_in(e, G[i + 1], G[i + 2]):
            return m_exp(lin(i + 1, i + 2))
        return m_exp(t[i + 1] - 2.7 * (L - lg[i + 1]))
    if i > 0 and not _edge_in(e, G[i - 1], G[i]):
        return m_exp(lin(i - 1, i))
    return m_exp(t[i] - 2.7 * (L - lg[i]))


def fp_kn(E):
    # index.html fpKN: σ di Klein–Nishina (cm²/elettrone)
    k = E / 511
    l = m_log(1 + 2 * k)
    return 2 * math.pi * 7.9407e-26 * ((1 + k) / (k * k) * (2 * (1 + k) / (1 + 2 * k) - l / k) + l / (2 * k) - (1 + 3 * k) / m_pow(1 + 2 * k, 2))


def fp_scat(s, E):
    # index.html fpScat
    if s == 'H':
        return fp_kn(E) * 0.5975e24
    FP = _fp()
    e = FP['el'].get(s)
    if not e:
        return 0
    L = m_log(E)
    m = len(FP['SG'])
    slg, sc = FP['slg'], e['sc']
    i = max(0, min(m - 2, math.floor((L - slg[0]) / FP['sdl'])))
    return m_exp(sc[i] + (sc[i + 1] - sc[i]) * (L - slg[i]) / (slg[i + 1] - slg[i]))


def fp_mu(s, E):
    return fp_tau(s, E) + fp_scat(s, E)


def fp_mu_c(comp, E):
    m = 0
    for s in comp:
        m += comp[s] * fp_mu(s, E)
    return m


def fp_sigma(s, line, E):
    # index.html fpSigma: produzione di una riga (cm²/g), cascate comprese
    e = _fp()['el'].get(s)
    L = e and e['ln'].get(line)
    if not L:
        return 0
    r = 0
    for q in L['r']:
        if E >= q[0]:
            r = q[1]
        else:
            break
    return r * fp_tau(s, E) if _t(r) else 0


def fp_line_e(s, line):
    e = _fp()['el'].get(s)
    return e['ln'][line]['E'] if (e and e['ln'].get(line)) else None


def fp_omega(Z, sh):
    z4 = m_pow(Z, 4)
    return z4 / (z4 + 1.12e6) if sh == 'K' else z4 / (z4 + 9.4e7)


# ---------- composizioni ----------
_WS = '[' + re.escape(JS_WS) + ']'
_RE_PC1 = re.compile('[A-Z][a-z]?' + _WS + '*[:=]?' + _WS + '+[0-9]')
_RE_PC2 = re.compile('[A-Z][a-z]?' + _WS + '*[:=]' + _WS + '*[0-9]')
_RE_PC3 = re.compile('([A-Z][a-z]?)' + _WS + '*[:=]?' + _WS + '*([0-9.,]+)' + _WS + '*%?')
_RE_MULT = re.compile('^([0-9]+(?:\\.[0-9]+)?)?' + _WS + '*(.*)$')
_RE_NUM = re.compile('^[0-9]+(?:\\.[0-9]+)?')
_RE_ATOM = re.compile('^([A-Z][a-z]?)([0-9]+(?:\\.[0-9]+)?)?')


class _FpErr(Exception):
    pass


def fp_parse_comp(txt):
    # index.html fpParseComp: «CaCO3», «2PbCO3·Pb(OH)2», oppure percentuali in peso «Cu 88 Sn 12»
    FPel = _fp()['el']
    txt = js_trim('' if txt is None or txt is False else str(txt))
    if not txt:
        return None
    if _RE_PC1.search(txt) or _RE_PC2.search(txt):
        c = {}
        ok = False
        for m in _RE_PC3.finditer(txt):
            s, v = m.group(1), m.group(2)
            if s in FPel or s == 'H':
                c[s] = (c.get(s) or 0) + js_parse_float(v.replace(',', '.', 1))
                ok = True
        if not ok:
            return None
        t = 0
        for v in c.values():
            t = t + v
        if not (t > 0):
            return None
        for s in c:
            c[s] /= 100 if t > 1.5 else 1
        return c
    parts = [js_trim(p) for p in re.split('[·*.]', txt)]
    parts = [p for p in parts if p]
    cnt = {}
    H = 1.008

    def unit(st, mult):
        pos = [0]

        def grp():
            o = {}
            while pos[0] < len(st) and st[pos[0]] != ')':
                if st[pos[0]] == '(':
                    pos[0] += 1
                    g = grp()
                    pos[0] += 1
                    m = _RE_NUM.match(st[pos[0]:])
                    k = float(m.group(0)) if m else 1
                    if m:
                        pos[0] += len(m.group(0))
                    for s in g:
                        o[s] = (o.get(s) or 0) + g[s] * k
                    continue
                m = _RE_ATOM.match(st[pos[0]:])
                if not m:
                    raise _FpErr()
                pos[0] += len(m.group(0))
                o[m.group(1)] = (o.get(m.group(1)) or 0) + (float(m.group(2)) if m.group(2) else 1)
            return o
        g = grp()
        if pos[0] < len(st):
            raise _FpErr()
        for s in g:
            cnt[s] = (cnt.get(s) or 0) + g[s] * mult
    try:
        for p in parts:
            m = _RE_MULT.match(p)
            unit(m.group(2), float(m.group(1)) if m.group(1) else 1)
    except _FpErr:
        return None

    def am(s):
        return H if s == 'H' else FPel[s]['A']
    M = 0
    out = {}
    for s in cnt:
        if s != 'H' and s not in FPel:
            return None
        M += am(s) * cnt[s]
    if not (M > 0):
        return None
    for s in cnt:
        out[s] = am(s) * cnt[s] / M
    return out


def fp_mat(mid):
    # index.html fpMat
    m = next((q for q in _xc('FP_MATS') if q[0] == mid), None)
    return {'id': mid, 'comp': fp_parse_comp(m[3]), 'rho': m[4], 'it': m[1], 'en': m[2]} if m else None


# ---------- condizioni di misura, tubo, preparazione ----------
def fp_setup(o):
    # index.html fpSetup
    o = o or {}
    FPel = _fp()['el']
    an = o.get('anode')
    kv, p1, p2 = _xn(o.get('kv')), _xn(o.get('psi1')), _xn(o.get('psi2'))
    filt = o.get('filt')
    s = {'anode': an if (isinstance(an, str) and an in FPel and an in _xc('FP_ANODES')) else 'Rh',
         'kv': 50 if kv > 50 else (kv if kv > 4 else 40),
         'psi1': p1 if (p1 > 3 and p1 <= 90) else 45, 'psi2': p2 if (p2 > 3 and p2 <= 90) else 45,
         'd1': _xn(o['d1']) if (o.get('d1') is not None and _xn(o['d1']) >= 0) else 1.0,
         'd2': _xn(o['d2']) if (o.get('d2') is not None and _xn(o['d2']) >= 0) else 1.0,
         'beT': _xn(o['beT']) if o.get('beT') is not None else 125, 'beD': _xn(o['beD']) if o.get('beD') is not None else 12.5,
         'si': _xn(o['si']) if o.get('si') is not None else 500, 'eps': _xn(o.get('eps')) if _t(_xn(o.get('eps'))) else 20,
         'atm': o.get('atm') if o.get('atm') in ('he', 'vac') else 'air',
         'charF': _xn(o.get('charF')) if _xn(o.get('charF')) > 0 else 1, 'cexp': _xn(o.get('cexp')) if _xn(o.get('cexp')) > 0 else 1,
         'filt': filt if (_t(filt) and fp_parse_comp(filt.get('comp'))) else None}
    s['key'] = json.dumps([s[k] for k in ('anode', 'kv', 'psi1', 'psi2', 'd1', 'd2', 'beT', 'beD', 'si', 'eps', 'atm', 'charF', 'cexp')] + [s['filt']], sort_keys=True)
    return s


def fp_tube(S):
    # index.html fpTube: continuo di Kramers con autoassorbimento nell'anodo, righe caratteristiche, finestra di Be, filtro
    a = _fp()['el'][S['anode']]
    Z, E0, st = a['Z'], S['kv'], 0.1
    R = 2.76e-6 * a['A'] * m_pow(E0, 1.67) / m_pow(Z, 0.889)
    se = m_sin(S['eps'] * math.pi / 180)
    E, N = [], []
    fc = fp_parse_comp(S['filt']['comp']) if S['filt'] else None

    def win(x):
        t = m_exp(-fp_mu('Be', x) * 1.848 * S['beT'] * 1e-4)
        if S['filt']:
            t *= m_exp(-fp_mu_c(fc, x) * S['filt']['rho'] * S['filt']['um'] * 1e-4)
        return t

    def self_(x, Ecut):
        z = 0.7 * R * max(1e-3, 1 - m_pow(Ecut / E0, 1.67))
        q = fp_mu(S['anode'], x) * z / se
        return 1 if q < 1e-9 else (1 - m_exp(-q)) / q
    x = 1 + st / 2
    while x < E0:
        E.append(x)
        N.append(Z * m_pow(E0 / x - 1, S['cexp']) * self_(x, x) * win(x) * st)
        x += st
    for sh, fam, edk in (('K', 'K', 'K'), ('L', 'L', 'L3')):
        ed = a['ed'].get(edk)
        if not _t(ed) or ed >= E0 or not a['fam'].get(fam):
            continue
        U = E0 / ed
        n0 = 1100 * (U * m_log(U) - U + 1) * fp_omega(Z, sh) * (0.25 if sh == 'L' else 1) * S['charF']
        for nm, El, rel in a['fam'][fam]:
            if El > 1:
                E.append(El)
                N.append(n0 * rel * self_(El, ed) * win(El))
    return {'E': E, 'N': N}


def fp_prep(S):
    # index.html fpPrep (con la sua memoria: gli stessi numeri)
    _fp()
    C = _FPX['cache']
    P = C.get(S['key'])
    if P:
        return P
    if len(C) > 12:
        C.clear()
    T = fp_tube(S)
    s1, s2 = m_sin(S['psi1'] * math.pi / 180), m_sin(S['psi2'] * math.pi / 180)
    gas = _xc('FP_AIR') if S['atm'] == 'air' else None
    rho = _xc('FP_AIR_RHO')

    def air(x, d):
        return m_exp(-fp_mu_c(gas, x) * rho * d) if gas else 1
    N = [v * air(T['E'][i], S['d1']) for i, v in enumerate(T['N'])]

    def det(x):
        return m_exp(-fp_mu('Be', x) * 1.848 * S['beD'] * 1e-4) * (1 - m_exp(-fp_tau('Si', x) * 2.33 * S['si'] * 1e-4)) * air(x, S['d2'])
    P = {'S': S, 'E': T['E'], 'N': N, 's1': s1, 's2': s2, 'nb': len(T['E']), 'mu': {}, 'sig': {}, 'det': det, 'theta': S['psi1'] + S['psi2']}
    C[S['key']] = P
    return P


def _mu_arr(P, s):
    a = P['mu'].get(s)
    if a is None:
        a = P['mu'][s] = [fp_mu(s, x) for x in P['E']]
    return a


def _sig_arr(P, s, l):
    k = s + l
    a = P['sig'].get(k)
    if a is None:
        a = P['sig'][k] = [fp_sigma(s, l, x) for x in P['E']]
    return a


def _mu_layer(P, comp):
    m = [0.0] * P['nb']
    for s in comp:
        a, w = _mu_arr(P, s), comp[s]
        for b in range(P['nb']):
            m[b] += w * a[b]
    return m


def fp_line(s, S):
    # index.html fpLine: Kα se lo spigolo K è eccitato bene, altrimenti Lα; l'anodo con la Lα
    e = _fp()['el'].get(s)
    if not e:
        return None
    kv = S['kv'] if S else 40
    ln, ed = e['ln'], e['ed']
    if S and s == S['anode'] and ln.get('La') and ln['La']['E'] >= 1.0 and _t(ed.get('L3')) and ed['L3'] < kv:
        return 'La'
    if ln.get('Ka') and ln['Ka']['E'] >= 1.0 and _t(ed.get('K')) and ed['K'] < 0.9 * kv:
        return 'Ka'
    if ln.get('La') and ln['La']['E'] >= 1.0 and _t(ed.get('L3')) and ed['L3'] < kv:
        return 'La'
    return 'Ka' if (ln.get('Ka') and ln['Ka']['E'] >= 1.0 and _ed(e, 'K') < kv) else None


def fp_intensities(layers, S, lines, opt=None):
    # index.html fpIntensities: Sherman (primaria) e Shiraiwa–Fujino (secondaria nel supporto spesso)
    P = fp_prep(S)
    s1, s2, nb, Nt = P['s1'], P['s2'], P['nb'], P['N']
    out = {}
    opt = opt or {}
    FPel = _fp()['el']
    ENH = _xc('FP_ENH')
    MU = [_mu_layer(P, L['comp']) for L in layers]
    for s, l in lines:
        Ei = fp_line_e(s, l)
        if not _t(Ei):
            out[s + ' ' + l] = 0
            continue
        sig = _sig_arr(P, s, l)
        det = P['det'](Ei)
        I = 0
        muI = [fp_mu_c(L['comp'], Ei) for L in layers]
        above = [0.0] * nb
        for k, L in enumerate(layers):
            C = L['comp'].get(s) or 0
            M = MU[k]
            t = L['t']
            mk = muI[k]
            fin_t = math.isfinite(t)
            if C > 0:
                for b in range(nb):
                    chi = M[b] / s1 + mk / s2
                    f = (1 - m_exp(-chi * t)) / chi if fin_t else 1 / chi
                    I += Nt[b] * C * sig[b] / s1 * f * m_exp(-above[b])
            if C > 0 and not fin_t and opt.get('sec') is not False:
                shell = 'K' if l[0] == 'K' else 'L3'
                ed = _ed(FPel[s], shell)
                Ssum = 0
                for j in L['comp']:
                    if j == s:
                        continue
                    Cj = L['comp'][j]
                    for lj in ENH:
                        Ej = fp_line_e(j, lj)
                        if not _t(Ej) or not (Ej > ed):
                            continue
                        sj = _sig_arr(P, j, lj)
                        sigI = fp_sigma(s, l, Ej)
                        muJ = fp_mu_c(L['comp'], Ej)
                        if not _t(sigI):
                            continue
                        for b in range(nb):
                            if not sj[b]:
                                continue
                            mE = M[b]
                            chi = mE / s1 + mk / s2
                            Lf = (s1 / mE) * m_log(1 + mE / (s1 * muJ)) + (s2 / mk) * m_log(1 + mk / (s2 * muJ))
                            Ssum += 0.5 * Nt[b] * C * sigI * Cj * sj[b] / (s1 * chi) * Lf * m_exp(-above[b])
                I += Ssum
                if opt.get('split'):
                    out[s + ' ' + l + ' sec'] = Ssum * det
            if not fin_t:
                break
            for b in range(nb):
                above[b] += (M[b] / s1 + mk / s2) * t
        out[s + ' ' + l] = I * det
    return out


def fp_ox(e):
    # index.html fpOx: ossigeno per unità di elemento nel suo ossido
    f = _xc('FP_OXIDE').get(e)
    if not f:
        return 0
    c = fp_parse_comp(f)
    return (c.get('O') or 0) / c[e] if (c and _t(c.get(e))) else 0


def fp_compton(comp, S):
    # index.html fpCompton: picco Compton della Kα del tubo
    P = fp_prep(S)
    FPel = _fp()['el']
    A = FPel.get(S['anode'])
    ka = A and A['fam'].get('K') and next((q for q in A['fam']['K'] if q[0] == 'Ka'), None)
    if not ka or not (_ed(A, 'K') < S['kv']):
        return 0
    N0 = 0
    for b in range(P['nb']):
        if abs(P['E'][b] - ka[1]) < 1e-9:
            N0 += P['N'][b]
    if not _t(N0):
        return 0
    th = P['theta'] * math.pi / 180
    E = ka[1]
    Ec = E / (1 + E / 511 * (1 - m_cos(th)))
    r = Ec / E
    dkn = 3.97035e-26 * r * r * (r + 1 / r - m_pow(m_sin(th), 2))
    za = 0
    for s in comp:
        za += comp[s] * ((1 / 1.008) if s == 'H' else (FPel[s]['Z'] / FPel[s]['A'] if s in FPel else 0))
    sig = 4 * math.pi * dkn * 0.6022e24 * 0.92 * za
    chi = fp_mu_c(comp, E) / P['s1'] + fp_mu_c(comp, Ec) / P['s2']
    return N0 * sig / (P['s1'] * chi) * P['det'](Ec)


def fp_quant(meas, S, opt=None):
    # index.html fpQuant: campione omogeneo e spesso; C_i ← I_i / (k_i · G · S_i(C))
    opt = opt or {}
    FPel = _fp()['el']
    mode = opt.get('mode') or ('abs' if opt.get('norm') is False else 'norm')
    els = [e for e in meas if meas[e] and meas[e]['I'] > 0 and e in FPel]
    fixed = opt.get('fixed') or {}
    bal = opt.get('balance') or None
    if not els:
        return None
    lines = [[e, meas[e]['line']] for e in els]
    ok_, oG = opt.get('k'), opt.get('G')

    def k(e):
        v = ok_.get(e) if ok_ else None
        return v if _t(v) else (oG if _t(oG) else 1)

    def ox(e):
        return fp_ox(e) if mode == 'oxides' else 0
    if mode == 'compton' and not (_xn(opt.get('compton')) > 0):
        return {'err': 'compton'}
    fixT = 0
    for v in fixed.values():
        fixT = fixT + v
    fixT = fixT / 100

    def comp(C):
        c = {}
        t = 0
        for e in els:
            c[e] = C[e]
            t += C[e]
            o = ox(e) * C[e]
            if _t(o):
                c['O'] = (c.get('O') or 0) + o
                t += o
        for e in fixed:
            c[e] = (c.get(e) or 0) + fixed[e] / 100
            t += fixed[e] / 100
        rest = js_max(0, 1 - t)
        if bal and rest > 0:
            for e in bal:
                c[e] = (c.get(e) or 0) + bal[e] * rest
        elif not bal and t > 0 and t < 1:
            for e in c:
                c[e] /= t
        return c, rest
    pure = {}
    for e in els:
        pure[e] = fp_intensities([{'comp': {e: 1}, 't': INF}], S, [[e, meas[e]['line']]])[e + ' ' + meas[e]['line']]
    C = {}
    t = 0
    for e in els:
        C[e] = jdiv(meas[e]['I'], k(e) * pure[e])
        t += C[e] * (1 + ox(e))
    for e in els:
        C[e] *= jdiv(1 - fixT, t) * (0.5 if mode in ('compton', 'abs') else 1)
    it = 0
    conv = False
    sens = {}
    G = 1
    over = False
    while it < 80:
        c, _r = comp(C)
        I = fp_intensities([{'comp': c, 't': INF}], S, lines)
        raw = {}
        t = 0
        dmax = 0
        if mode == 'compton':
            G = opt['compton'] / js_max(1e-300, fp_compton(c, S))
        for e in els:
            sens[e] = I[e + ' ' + meas[e]['line']] / js_max(c[e], 1e-12)
            raw[e] = jdiv(meas[e]['I'], k(e) * G * sens[e])
            t += raw[e] * (1 + ox(e))
        scale = jdiv(1 - fixT, t) if mode in ('norm', 'oxides') else (jdiv(1 - fixT, t) if t > 1 - fixT else 1)
        over = mode in ('compton', 'abs') and t > 1 - fixT
        for e in els:
            v = js_max(0, raw[e] * scale)
            dmax = js_max(dmax, jdiv(abs(v - C[e]), js_max(v, 1e-6)))
            C[e] = C[e] + 0.7 * (v - C[e])
        if dmax < 1e-5:
            conv = True
            break
        it += 1
    c, rest = comp(C)
    res = {}
    tot = 0
    relC = opt['sCompton'] / opt['compton'] if (mode == 'compton' and _t(opt.get('sCompton'))) else 0
    for e in els:
        m = meas[e]
        rel = m_hypot(m['sI'] / m['I'] if (_t(m.get('sI')) and _t(m['I'])) else 0, relC)
        o = ox(e)
        res[e] = {'w': 100 * C[e], 'sw': 100 * C[e] * rel, 'line': m['line'], 'sens': sens.get(e)}
        if _t(o):
            res[e]['ox'] = _xc('FP_OXIDE')[e]
            res[e]['wox'] = 100 * C[e] * (1 + o)
        tot += 100 * C[e]
    return {'res': res, 'sum': tot + fixT * 100, 'rest': 100 * rest, 'iter': it + 1, 'conv': conv, 'comp': c, 'G': G, 'over': over, 'mode': mode, 'relC': relC}


def fp_calibrate(stds, S):
    # index.html fpCalibrate: k_i = I misurata / I calcolata con la composizione nota
    FPel = _fp()['el']
    K = {}
    skipped = 0
    for st in stds:
        tot = 0
        for v in st['comp'].values():
            tot = tot + (0 if v is None else v)   # +null = 0
        if not _t(tot):
            tot = 100
        c = {}
        if tot < 90 and not st.get('balance'):
            skipped += 1
            continue
        for e in st['comp']:
            if e in FPel:
                c[e] = (0 if st['comp'][e] is None else st['comp'][e]) / js_max(tot, 100)
        els = [e for e in st['meas'] if (c.get(e) is not None and c[e] > 0) and st['meas'][e] and st['meas'][e]['I'] > 0]
        I = fp_intensities([{'comp': c, 't': INF}], st.get('S') or S, [[e, st['meas'][e]['line']] for e in els])
        for e in els:
            K.setdefault(e, []).append(jdiv(st['meas'][e]['I'], I[e + ' ' + st['meas'][e]['line']]))
    alln = [v for L in K.values() for v in L]
    if not alln:
        return {'k': {}, 'cv': {}, 'G': None, 'n': 0, 'skipped': skipped} if skipped else None
    G = median(alln)
    out = {'k': {}, 'cv': {}, 'G': G, 'n': len(stds) - skipped, 'skipped': skipped}
    for e, v in K.items():
        m = 0
        for b in v:
            m = m + b
        m = m / len(v)
        out['k'][e] = m
        if len(v) > 1:
            q = 0
            for b in v:
                q = q + m_pow(b - m, 2)
            out['cv'][e] = math.sqrt(q / (len(v) - 1)) / m
        else:
            out['cv'][e] = None
    return out


# ---------- adattamento dello spettro con le famiglie di righe ----------
def nnls_gram(Gm, h):
    # index.html nnlsGram: min ½xᵀGx − hᵀx con x ≥ 0 (Lawson & Hanson)
    p = len(h)
    x = [0.0] * p
    P = [False] * p
    tol = 1e-12 * js_max(1e-300, *[abs(v) for v in h])

    def grad():
        g = []
        for j in range(p):
            t = h[j]
            Gj = Gm[j]
            for q in range(p):
                t -= Gj[q] * x[q]
            g.append(t)
        return g

    def sub(idx):
        M = [[Gm[a][c] for c in idx] for a in idx]
        for i in range(len(idx)):
            M[i][i] += 1e-12 * (M[i][i] if _t(M[i][i]) else 1)
        L = chol(M)
        return chol_solve(L, [h[a] for a in idx]) if L else None
    for outer in range(3 * p + 10):
        g = grad()
        j = -1
        gm = tol
        for q in range(p):
            if not P[q] and g[q] > gm:
                gm = g[q]
                j = q
        if j < 0:
            break
        P[j] = True
        for inner in range(3 * p + 10):
            idx = [q for q in range(p) if P[q]]
            s = sub(idx)
            if not s:
                P[j] = False
                break
            if all(v > 0 for v in s):
                for i, q in enumerate(idx):
                    x[q] = s[i]
                break
            al = 1
            for i, q in enumerate(idx):
                if s[i] <= 0:
                    d = x[q] - s[i]
                    t = x[q] / (d if _t(d) else 1e-300)
                    if t < al:
                        al = t
            for i, q in enumerate(idx):
                x[q] += al * (s[i] - x[q])
                if x[q] <= 1e-14 * (1 + abs(s[i])):
                    x[q] = 0
                    P[q] = False
    return x


def xrf_fit_lines(xs, ys, els, S, opt=None):
    # index.html xrfFitLines: famiglie K, L, M di ogni elemento, fuga del Si, righe del tubo diffuse (Rayleigh e Compton),
    # fondo a B-spline cubiche non negative, minimi quadrati non negativi pesati (Poisson), piccole correzioni di scala
    opt = opt or {}
    FPel = _fp()['el']
    n = len(xs)
    kv = S['kv'] if S else 40
    dx0 = (xs[n - 1] - xs[0]) / (n - 1)
    bgm = opt.get('bgMode') or 'spline'
    bkg = opt.get('bkg')
    if not bkg:
        bkg = [0.0] * n if bgm == 'spline' else baseline_snip(list(ys), max(4, js_round(2.2 * xrf_fwhm(10) / dx0)) if bgm == 'hybrid' else 0, True)
    lo = js_max(xs[0], opt['lo'] if _t(opt.get('lo')) else 1.0)
    hi = js_min(xs[n - 1], opt['hi'] if _t(opt.get('hi')) else js_min(kv * 0.97, 48))
    a = 0
    while a < n and xs[a] < lo:
        a += 1
    b = n - 1
    while b > a and xs[b] > hi:
        b -= 1
    m = b - a + 1
    if m < 20:
        return None
    X = list(xs[a:b + 1])
    net = [ys[a + i] - bkg[a + i] for i in range(m)]
    w = [1 / math.sqrt(js_max(1, ys[a + i])) for i in range(m)]
    comps = []
    split = opt.get('split') or {}
    groups = {'K': [['Ka'], ['Kb']], 'L': [['La', 'Ll'], ['Lb1', 'Lb2', 'Ln'], ['Lg1']], 'M': [['Ma', 'Ma2'], ['Mb'], ['Mg']]}
    EDK = {'K': 'K', 'L': 'L3', 'M': 'M5'}
    ratios = opt.get('ratios')

    def fam_of(s, fam):
        F = FPel[s]['fam'].get(fam)
        R = ratios.get(s) if ratios else None
        if not F or not R:
            return F
        if fam == 'K' and _xn(R.get('Kb')) > 0:
            a_ = next((q for q in F if q[0] == 'Ka'), None)
            return [[q[0], q[1], a_[2] * R['Kb']] if (q[0] == 'Kb' and a_) else q for q in F]
        if fam == 'L' and _xn(R.get('Lb')) > 0:
            a_ = next((q for q in F if q[0] == 'La'), None)
            sb = 0
            for q in F:
                if q[0].startswith('Lb'):
                    sb = sb + q[2]
            if not a_ or not _t(sb):
                return F
            f = a_[2] * R['Lb'] / sb
            return [[q[0], q[1], q[2] * f] if (q[0].startswith('Lb') or q[0] == 'Ln' or q[0] == 'Lg1') else q for q in F]
        return F
    for s in els:
        e = FPel.get(s)
        if not e:
            continue
        for fam in ('K', 'L', 'M'):
            F = fam_of(s, fam)
            ed = e['ed'].get(EDK[fam])
            if not F or not _t(ed) or ed >= kv:
                continue
            inR = [q for q in F if q[1] >= lo and q[1] <= hi]
            sr = 0
            for q in inR:
                sr = sr + q[2]
            if not inR or sr < 0.3:
                continue
            if split.get(s):
                for g in groups[fam]:
                    L = [q for q in F if q[0] in g]
                    if L and any(q[1] >= lo and q[1] <= hi for q in L):
                        comps.append({'id': s + ' ' + g[0], 'el': s, 'fam': fam, 'grp': g[0], 'lines': L})
            else:
                comps.append({'id': s + ' ' + fam, 'el': s, 'fam': fam, 'lines': F})
    if S and S['anode'] in FPel:
        A = FPel[S['anode']]
        for fam in ('K', 'L'):
            F = A['fam'].get(fam)
            ed = A['ed'].get('K' if fam == 'K' else 'L3')
            if not F or not _t(ed) or ed >= kv:
                continue
            if fam == 'L' and S['anode'] in els:
                continue
            for g in ([['Ka'], ['Kb']] if fam == 'K' else [['La', 'Ll'], ['Lb1', 'Lb2', 'Ln']]):
                L = [q for q in F if q[0] in g]
                if not L or L[0][1] < lo or L[0][1] > hi:
                    continue
                comps.append({'id': 'Rayleigh ' + S['anode'] + ' ' + g[0], 'el': None, 'scat': 'R', 'lines': L})
                comps.append({'id': 'Compton ' + S['anode'] + ' ' + g[0], 'el': None, 'scat': 'C', 'lines': L})
    if not comps:
        return None
    spl = []
    if bgm != 'snip':
        h = 1.5
        k0, k1 = math.floor(lo / h) - 1, math.ceil(hi / h) + 1
        for k in range(k0, k1 + 1):
            c = [0.0] * m
            anyv = False
            kh = k * h
            for i in range(m):
                t = abs((X[i] - kh) / h)
                v = (4 - 6 * t * t + 3 * t * t * t) / 6 if t < 1 else (m_pow(2 - t, 3) / 6 if t < 2 else 0)
                if _t(v):
                    c[i] = v
                    anyv = True
            if anyv:
                spl.append(c)
                if bgm == 'hybrid':
                    spl.append([-v for v in c])
    esc_memo = {}

    def esc(E):
        if E in esc_memo:
            return esc_memo[E]
        if E < 1.9:
            r = 0
        else:
            mi, mk = fp_tau('Si', E), fp_tau('Si', 1.74)
            r = 0.5 * 0.047 * (1 - 1 / 10.4) * (1 - (mk / mi) * m_log(1 + mi / mk))
        esc_memo[E] = r
        return r

    def build(off, gain, wf, wc, th):
        Xc = [x * (1 + gain) + off for x in X]
        ct = 1 - m_cos((th if _t(th) else 90) * math.pi / 180)
        cols = []
        for c in comps:
            col = [0.0] * m

            def add(Ec, amp, extra):
                fw = math.sqrt(m_pow(xrf_fwhm(Ec) * wf, 2) + m_pow(extra if _t(extra) else 0, 2))
                sg = fw / 2.3548
                lo2, hi2 = Ec - 4 * sg, Ec + 4 * sg
                i = _bisect_left(Xc, lo2)   # i punti con x < lo2 si saltano (continue), come nell'app
                den = sg * 2.5066283
                while i < m:
                    x = Xc[i]
                    if x > hi2:
                        break
                    dx = Xc[i + 1] - Xc[i] if i + 1 < m else Xc[i] - Xc[i - 1]
                    col[i] += amp * dx * m_exp(-0.5 * m_pow((x - Ec) / sg, 2)) / den
                    i += 1
            for nm, E, rel in c['lines']:
                if c.get('scat') == 'C':
                    add(E / (1 + E / 511 * ct), rel, wc)
                else:
                    add(E, rel, 0)
                e = esc(E)
                if e > 0 and not c.get('scat'):
                    add(E - 1.74, rel * e, 0)
            cols.append(col)
        return cols + spl

    def solve(cols):
        p = len(cols)
        Gm = [[0.0] * p for _ in range(p)]
        h = [0.0] * p
        Wc = [[v * w[i] for i, v in enumerate(c)] for c in cols]
        wb = [v * w[i] for i, v in enumerate(net)]
        rg = []
        for c in Wc:
            s0 = 0
            while s0 < m and not c[s0]:
                s0 += 1
            e0 = m - 1
            while e0 > s0 and not c[e0]:
                e0 -= 1
            rg.append((s0, e0))
        for j in range(p):
            cj = Wc[j]
            sj, ej = rg[j]
            t = 0
            for i in range(sj, ej + 1):
                t += cj[i] * wb[i]
            h[j] = t
            for q in range(j, p):
                cq = Wc[q]
                s1, e1 = max(sj, rg[q][0]), min(ej, rg[q][1])
                u = 0
                for i in range(s1, e1 + 1):
                    u += cj[i] * cq[i]
                Gm[j][q] = Gm[q][j] = u
        x = nnls_gram(Gm, h)
        chi = 0
        mod = [0.0] * m
        for j in range(p):
            if _t(x[j]):
                xj, cl = x[j], cols[j]
                for i in range(m):
                    mod[i] += xj * cl[i]
        for i in range(m):
            chi += m_pow((net[i] - mod[i]) * w[i], 2)
        return {'x': x, 'chi': chi, 'Gm': Gm, 'mod': mod}
    best = {'off': 0, 'gain': 0, 'wf': 1, 'wc': 0.35, 'th': S['psi1'] + S['psi2'] if S else 90}
    best.update(opt.get('fix') or {})
    st = {'R': solve(build(best['off'], best['gain'], best['wf'], best['wc'], best['th'])), 'best': best}

    def tryP(k, vals):
        for v in vals:
            p = dict(st['best'])
            p[k] = v
            r = solve(build(p['off'], p['gain'], p['wf'], p['wc'], p['th']))
            if r['chi'] < st['R']['chi']:
                st['R'] = r
                st['best'] = p
    hasC = any(c.get('scat') == 'C' for c in comps)
    if hasC and opt.get('tune') is not False and not opt.get('fix'):
        th0 = st['best']['th']
        if opt.get('autoGeom'):
            tryP('th', [v for v in (70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170) if v != st['best']['th']])
        tryP('th', [js_min(178, js_max(40, st['best']['th'] + d)) for d in (-6, -3, 3, 6)])
        if not opt.get('autoGeom') and abs(st['best']['th'] - th0) > 8:
            B = st['best']
            B['th'] = th0
            st['R'] = solve(build(B['off'], B['gain'], B['wf'], B['wc'], B['th']))
    if opt.get('tune') is not False and not opt.get('fix'):
        for ps in range(2):
            f = 0.4 if ps else 1
            tryP('off', [st['best']['off'] + (i - 4) * 0.02 * f for i in range(9)])
            tryP('gain', [st['best']['gain'] + (i - 4) * 0.0015 * f for i in range(9)])
            tryP('wf', [st['best']['wf'] * (1 + (i - 3) * 0.06 * f) for i in range(7)])
            if hasC:
                tryP('wc', [js_min(0.6, js_max(0.2, st['best']['wc'] * v)) for v in (0.85, 0.93, 1.07, 1.15)] if ps else [0.2, 0.3, 0.4, 0.5, 0.6])
    R, best = st['R'], st['best']
    act = [j for j, v in enumerate(R['x']) if v > 0]
    sdAll = [0.0] * len(R['x'])
    dof = max(1, m - len(act) - 4)
    red = R['chi'] / dof
    if act:
        Mx = [[R['Gm'][j][q] for q in act] for j in act]
        L = chol(Mx)
        if L:
            inv = chol_inv(L)
            for k, j in enumerate(act):
                sdAll[j] = math.sqrt(js_max(0, inv[k][k]) * js_max(1, red))
    area, sArea, famArea = {}, {}, {}
    for j, c in enumerate(comps):
        sr = 0
        for q in c['lines']:
            sr = sr + q[2]
        sd = sdAll[j]
        famArea[c['id']] = {'a': R['x'][j], 's': sd, 'area': R['x'][j] * sr, 'sArea': sd * sr}
        if not c.get('el'):
            continue
        for nm, E, rel in c['lines']:
            key = nm if nm in ('La', 'Ka') else ('Lb' if nm == 'Lb1' else ('Kb' if nm == 'Kb' else None))
            if not key:
                continue
            if key == 'Lb':
                add = 0
                for q in c['lines']:
                    if q[0].startswith('Lb'):
                        add = add + q[2]
            else:
                add = rel
            ae = area.setdefault(c['el'], {})
            ae[key] = (ae.get(key) or 0) + R['x'][j] * add
            se = sArea.setdefault(c['el'], {})
            se[key] = m_hypot(se.get(key) or 0, sd * add)
    return {'area': area, 'sArea': sArea, 'comps': famArea, 'off': best['off'], 'gain': best['gain'], 'wf': best['wf'], 'wc': best['wc'],
            'th': best['th'] if hasC else None, 'chi2r': red, 'lo': lo, 'hi': hi, 'a': a, 'b': b, 'bkg': bkg}


def fp_measure(fit, els, S):
    # index.html fpMeasure: area della riga analitica di ogni elemento
    out = {}
    for e in els:
        l = fp_line(e, S)
        if not l:
            continue
        A = fit['area'].get(e)
        I = A.get(l) if A else None
        sA = fit['sArea'].get(e)
        sI = sA.get(l) if sA else None
        if I is not None and I > 0:
            out[e] = {'line': l, 'I': I, 'sI': sI}
        else:
            out[e] = {'line': l, 'I': 0, 'sI': sI if _t(sI) else 0}
    return out


def xrf_fp(xs, ys, els, S0, opt=None):
    # index.html xrfFP: adattamento → quantificazione → rapporti Kβ/Kα, Lβ/Lα previsti → nuovo adattamento (3 giri)
    S = S0
    opt = opt or {}
    st = {'fit': xrf_fit_lines(xs, ys, els, S, opt)}
    Q = None
    if not st['fit']:
        return None
    bkg = st['fit']['bkg']
    fit = st['fit']
    if opt.get('autoGeom') and _t(fit['th']) and abs(fit['th'] - (S['psi1'] + S['psi2'])) > 4:
        o = dict(S)
        o.update({'psi1': fit['th'] / 2, 'psi2': fit['th'] / 2})
        S = fp_setup(o)

    def qo():
        if opt.get('mode') != 'compton' or _t(opt.get('compton')):
            return opt
        c = st['fit']['comps'].get('Compton ' + S['anode'] + ' Ka')
        o = dict(opt)
        o.update({'compton': c['area'] if c else 0, 'sCompton': c['sArea'] if c else 0})
        return o
    for it in range(3):
        meas = fp_measure(st['fit'], els, S)
        Q = fp_quant(meas, S, qo())
        if not Q or Q.get('err'):
            break
        lines = []
        for e in els:
            for l in ('Ka', 'Kb', 'La', 'Lb'):
                if _t(fp_line_e(e, l)):
                    lines.append([e, l])
        I = fp_intensities([{'comp': Q['comp'], 't': INF}], S, lines, {'sec': True})
        ratios = {}
        for e in els:
            r = {}
            if (I.get(e + ' Ka') or 0) > 0 and (I.get(e + ' Kb') or 0) > 0:
                r['Kb'] = I[e + ' Kb'] / I[e + ' Ka']
            if (I.get(e + ' La') or 0) > 0 and (I.get(e + ' Lb') or 0) > 0:
                r['Lb'] = I[e + ' Lb'] / I[e + ' La']
            ratios[e] = r
        f0 = st['fit']
        o = dict(opt)
        o.update({'ratios': ratios, 'bkg': bkg, 'fix': {'off': f0['off'], 'gain': f0['gain'], 'wf': f0['wf'], 'wc': f0['wc'], 'th': f0['th'] if _t(f0['th']) else S['psi1'] + S['psi2']}})
        st['fit'] = xrf_fit_lines(xs, ys, els, S, o) or st['fit']
    meas = fp_measure(st['fit'], els, S)
    Q = fp_quant(meas, S, qo())
    return {'fit': st['fit'], 'meas': meas, 'Q': Q, 'S': S}


# ---------- spessore di uno strato ----------
def fp_layer_solve(o):
    # index.html fpLayerSolve: rapporto di righe (Cesareo 2008; Trojek 2011) o attenuazione, con il modello FP completo
    S, cov, sub, el = o['S'], o['cover'], o['sub'], o['el']
    l1, l2 = (list(o.get('lines') or []) + [None, None])[:2]

    def stack(t):
        return [{'comp': cov['comp'], 't': t}, {'comp': sub['comp'], 't': INF}]
    inCover = (cov['comp'].get(el) or 0) > 0
    onlyCover = inCover and not ((sub['comp'].get(el) or 0) > 0)
    atten = o.get('method') == 'atten'
    if atten:
        def f(t):
            return fp_intensities(stack(t), S, [[el, l1]], {'sec': False})[el + ' ' + l1]
    else:
        def f(t):
            I = fp_intensities(stack(t), S, [[el, l1], [el, l2]], {'sec': False})
            return jdiv(I[el + ' ' + l1], I[el + ' ' + l2])
    if atten:
        I0 = f(0)
        target = o['ratio'] * I0
    else:
        target = o['R']
        if _xn(o.get('R0meas')) > 0:
            target = o['R'] * (f(1e3 if onlyCover else 0) / o['R0meas'])
    if onlyCover and atten:
        return {'err': 'cover'}

    def I1(t):
        return fp_intensities(stack(t), S, [[el, l1]], {'sec': False})[el + ' ' + l1]
    i0 = I1(1e-7)
    tl = 1e-7
    ft = f(tl)
    th = 5
    while th > 1e-5 and not (math.isfinite(f(th)) and f(th) > 0 and I1(th) > 1e-6 * i0):
        th /= 2
    fh = f(th)
    up = fh > ft
    if not math.isfinite(ft) or not math.isfinite(fh) or fh == ft:
        return None

    def solve(y):
        if not (y > 0):
            return None
        if (y <= ft) if up else (y >= ft):
            return {'t': 0, 'below': True, 'beyond': abs(y - ft) > 0.05 * abs(fh - ft)}
        if (y >= fh) if up else (y <= fh):
            return {'t': th, 'above': True}
        a, b = m_log(tl), m_log(th)
        for k in range(60):
            c = (a + b) / 2
            v = f(m_exp(c))
            if (v < y) == up:
                a = c
            else:
                b = c
        return {'t': m_exp((a + b) / 2)}
    r = solve(target)
    if not r:
        return None

    def near(t):
        return abs(f(t) - fh) < 0.03 * abs(ft - fh)
    if not r.get('below') and (r.get('above') or near(r['t'])):
        a, b = m_log(tl), m_log(th)
        for k in range(50):
            c = (a + b) / 2
            if near(m_exp(c)):
                b = c
            else:
                a = c
        r['above'] = True
        r['t'] = m_exp(b)
    sR = o['sR'] / (o['ratio'] if atten else o['R']) if o.get('sR') is not None else 0
    rl = solve(target * (1 - sR)) if sR > 0 else None
    rh = solve(target * (1 + sR)) if sR > 0 else None
    ts = [v for v in ((rl['t'] if rl else None), (rh['t'] if rh else None)) if v is not None]
    return {'t': r['t'], 'below': r.get('below'), 'beyond': bool(r.get('below') and r.get('beyond')), 'above': r.get('above'),
            'lo': min(ts) if ts else None, 'hi': max(ts) if ts else None, 'mgcm2': r['t'] * 1000,
            'um': r['t'] / cov['rho'] * 1e4 if _t(cov.get('rho')) else None,
            'R0': None if atten else f(1e3 if onlyCover else 0), 'Rthick': None if atten else fh, 'target': target, 'maxT': th}


# ============================== pannello (index.html, fuori dal nucleo) ==============================
def xrf_currie_full(xs, ys, pxs):
    # index.html xrfCurrie con currie: {net, LD, detected}
    n = len(ys)
    dx = abs(xs[n - 1] - xs[0]) / (n - 1)
    dx = dx if _t(dx) else 1
    k = max(1, js_round(xrf_fwhm(10) / dx))
    bg = baseline_snip(smooth_ma(ys, k), js_round(2.2 * xrf_fwhm(10) / dx), True)
    out = []
    for x in pxs:
        w = xrf_fwhm(js_max(1, x))
        net = B = 0.0
        for i in range(n):
            if abs(xs[i] - x) <= w:
                net += ys[i] - bg[i]
                B += bg[i]
        Bp = js_max(0, B)
        LD = 2.71 + 4.65 * math.sqrt(Bp)
        out.append({'net': net, 'bkg': Bp, 'LD': LD, 'detected': net > LD})
    return out


_RE_LINEOF = re.compile(r'^x_([A-Z][a-z]?)_([A-Za-z0-9]+?)(?:_c)?$')
_RE_FREE = re.compile('^([A-Z][a-z]?)' + _WS + '*(K|L)' + _WS + '*(α|a|β|b)')


def _line_of(i):
    m = _RE_LINEOF.match(i or '')
    return {'el': m.group(1), 'ln': m.group(2)} if m else None


def xrf_elements(v):
    """index.html xrfElements(f, viewOf(f)): elementi presenti dai suggerimenti della banca dati (registrati dall'app: v['xsug'])."""
    if 'xe' in v:
        return v['xe']
    FPel = _fp()['el']
    peaks = v.get('peaks') or []
    xs_ = v.get('xsug') or {}
    xr = v.get('xrf') or {}

    def sug(p):
        return xs_.get(js_str(p['x'])) or {'sg': [], 'n': 0, 'all': False, 'lab': ''}
    mp = js_max(1e-30, *[(p.get('prom') or 0) for p in peaks])
    by = {}

    def free_line(t):
        m = _RE_FREE.match(t)
        return 'x_%s_%s%s' % (m.group(1), m.group(2), 'a' if m.group(3) in ('α', 'a') else 'b') if m else t
    an = xr.get('tube')
    tubeE = fp_line_e(an, 'La' if an in ('W', 'Au', 'Pt') else 'Ka') if (_t(an) and an in FPel) else None
    for p in peaks:
        q = sug(p)
        lab = q.get('lab') or ''
        if _t(tubeE) and p['x'] > tubeE - 1.2 and p['x'] < tubeE - 0.15 and (not p.get('custom') or str(lab)[:1] == '@'):
            continue
        rawL = str(lab) if p.get('custom') else ''
        SG = q['sg']
        autoIds = [g['id'] for i, g in enumerate(SG[:3]) if i == 0 or g.get('coherent')]
        if not p.get('custom'):
            ids = autoIds
        elif rawL[:1] == '@':
            ids = list(dict.fromkeys(autoIds + [rawL[1:]]))
        else:
            ids = [free_line(rawL)]
        alls = [g['id'] for g in SG[:3]] + ids if (not p.get('custom') or rawL[:1] == '@') else ids
        altEls = [L['el'] for L in (_line_of(g['id']) for g in SG[:3]) if L]
        pr = (p.get('prom') or 0) / mp
        for i_ in ids:
            L = _line_of(i_)
            if not L:
                continue
            e = by.setdefault(L['el'], {'main': False, 'strong': False, 'lines': [], 'prom': 0})
            if L['ln'] not in e['lines']:
                e['lines'].append(L['ln'])
            if L['ln'] in ('Ka', 'La'):
                e['main'] = True
                if pr >= e['prom']:
                    e['mx'] = p['x']
                e['prom'] = js_max(e['prom'], pr)
                e['alt'] = list(dict.fromkeys((e.get('alt') or []) + altEls))
                if pr >= 0.25:
                    e['strong'] = True
        for i_ in alls:
            L = _line_of(i_)
            if L and L['el'] in by and L['ln'] not in by[L['el']]['lines']:
                by[L['el']]['lines'].append(L['ln'])
    els = [el for el, e in by.items() if e['main'] and (len(e['lines']) >= 2 or e['strong']) and el != 'Ar' and el != 'Rh']
    unsure = []

    def has_line(el, rx):
        return el in by and any(re.match(rx, l) for l in by[el]['lines'])

    def drop(e):
        if e in els:
            els.remove(e)
        if e not in unsure:
            unsure.append(e)
    PbSeen = 'Pb' in els
    PbOk = PbSeen and has_line('Pb', '^L[bg]')
    AsK = has_line('As', '^Kb')
    Hg = 'Hg' in els
    if PbSeen and not PbOk:
        drop('Pb')
    if PbOk and not (AsK and not Hg):
        drop('As')
    elif PbSeen and not PbOk and not AsK and 'As' in els:
        drop('As')
    lbHidden = False
    if not PbSeen and not (AsK and not Hg) and not v.get('uncal') and is_counts(v['ys']):
        la, lb = xrf_currie_full(v['xs'], v['ys'], [10.54, 12.61])
        lbHidden = 0.6 * js_max(0, la['net']) <= lb['LD']
    asPb = lbHidden and not PbSeen and not (AsK and not Hg) and ('As' in els or ('As' in by and by['As']['main']))
    if asPb:
        drop('As')
        if 'Pb' not in unsure:
            unsure.append('Pb')
    if 'Au' in els and 'W' in els:
        drop('W')
    if 'Ti' in els and ('Ba' in els or ('Ba' in by and len(by['Ba']['lines']) >= 2)):
        drop('Ti')
    if 'S' not in els and ('Pb' in by or 'Hg' in by or 'Pb' in els or 'Hg' in els) and any(p['x'] > 2.15 and p['x'] < 2.40 for p in peaks) and 'S' not in unsure:
        unsure.append('S')
    if 'Se' in els and 'Pb' in els and not has_line('Pb', '^L[gl]'):
        drop('Pb')
    if an == 'Rh':
        for e in ('Ru', 'Pd'):
            if e in els and not has_line(e, '^L'):
                drop(e)
    kv = fp_num(xr.get('kv'))
    kv = kv if _t(kv) else 40
    for e in list(els):
        Ek = fp_line_e(e, 'Ka')
        if _t(Ek) and Ek < 0.6 * kv and not has_line(e, '^K') and has_line(e, '^L'):
            drop(e)

    def is_esc(e):
        return e.get('mx') is not None and any((q.get('prom') or 0) >= 3 * e['prom'] * mp and abs(q['x'] - 1.74 - e['mx']) <= 0.07 + 0.006 * abs(e['mx']) for q in peaks)
    cands = [el for el, e in by.items() if e['main'] and el not in els and el not in unsure and el != 'Ar' and el != 'Rh' and not is_esc(e)
             and not any(o != el and (o in els or o in unsure) for o in (e.get('alt') or []))] if els else []
    if asPb and 'Pb' in FPel and 'Pb' not in els and 'Pb' not in cands:
        cands.append('Pb')
    assigned = len([p for p in peaks if p.get('custom') or sug(p)['n']])
    empty = {'els': [], 'unsure': [], 'cands': [], 'strong': None, 'shifted': True}
    tubeOff = None
    if _t(an) and an in FPel:
        E = fp_line_e(an, 'La' if an in ('W', 'Au', 'Pt') else 'Ka') or 0   # p.x − null = p.x
        best = None
        for p in peaks:
            dx = p['x'] - E
            if abs(dx) <= 0.4 and (best is None or abs(dx) < abs(best)):
                best = dx
        tubeOff = best
    if tubeOff is not None and abs(tubeOff) > 0.08:
        res = empty
    elif not v.get('ecal') and not v.get('uncal') and v.get('auto') and len(v['auto']) >= 3 and _al_shift(v) > 0.06:
        res = empty
    elif len(peaks) >= 5 and assigned < 0.5 * len(peaks):
        res = empty
    else:
        res = {'els': els, 'unsure': unsure, 'cands': cands, 'strong': [e for e in els if by[e]['strong']]}
    v['xe'] = res
    return res


def _al_shift(v):
    # index.html xrfElements: guadagno o scostamento sbagliati (xrfAlignFit), un errore non ferma niente
    try:
        al = xrf_align_fit([{'x': q['x'], 'w': q.get('prom') if _t(q.get('prom')) else 1} for q in v['auto']], v.get('tube'))
    except NonTrascritto:
        raise
    except Exception:
        return 0
    sh = al['a'] + (al['b'] - 1) * 8 if al else 0
    return abs(sh)


def fp_cfg(v):
    c = {'mode': 'norm', 'bal': 'org'}
    c.update(((v.get('an') or {}).get('fp')) or {})
    return c


def fp_setup_of(v):
    # index.html fpSetupOf: condizioni dal pannello, poi dall'intestazione del file
    x = v.get('xrf') or {}
    o = (((v.get('an') or {}).get('fp')) or {}).get('S') or {}
    FF = _xc('FP_FILTERS')
    fe = o.get('filtEl')
    return fp_setup({'anode': _xor(o.get('anode'), x.get('tube'), 'Rh'), 'kv': o['kv'] if o.get('kv') is not None else fp_num(x.get('kv')),
                     'psi1': o['psi1'] if o.get('psi1') is not None else fp_num(x.get('psi1')), 'psi2': o['psi2'] if o.get('psi2') is not None else fp_num(x.get('psi2')),
                     'd2': o['d2'] if o.get('d2') is not None else fp_num(x.get('dist')), 'd1': o.get('d1'), 'atm': o.get('atm'), 'beD': o.get('beD'), 'si': o.get('si'),
                     'beT': o.get('beT'),
                     'filt': {'comp': fe, 'rho': FF[fe], 'um': o['filtUm']} if (_t(fe) and _xn(o.get('filtUm')) > 0 and isinstance(fe, str) and _t(FF.get(fe))) else None})


def _xor(*a):
    for x in a[:-1]:
        if _t(x):
            return x
    return a[-1]


def fp_default_els(v):
    # index.html fpDefaultEls
    q = None
    e = []
    q = xrf_elements(v)
    e = q['els'] + q['cands']
    S = fp_setup_of(v)
    keepA = bool(q and S['anode'] in q['els'] and S['anode'] in (q.get('strong') or []))
    FPel = _fp()['el']
    return [x for x in e if (x != S['anode'] or keepA) and x != 'Ar' and x in FPel and fp_line(x, S)]


def fp_balance(c):
    if c.get('bal') == 'custom':
        p = fp_parse_comp(c.get('balTxt'))
        return p or fp_mat('org')['comp']
    m = fp_mat(c.get('bal') or 'org')
    return m['comp'] if m else fp_mat('org')['comp']


def fp_run(v):
    """index.html fpRun (fpPlan, fpStore): la stima FP dello spettro, una volta per voce."""
    if 'fpRes' in v:
        return v['fpRes']
    R = None
    if v.get('instr') == 'xrf' and not v.get('uncal'):
        FPel = _fp()['el']
        c = fp_cfg(v)
        els = [e for e in (c['els'] if isinstance(c.get('els'), list) else fp_default_els(v)) if e in FPel]
        S = fp_setup_of(v)
        x = v.get('xrf') or {}
        so = c.get('S') or {}
        autoGeom = so.get('psi1') is None and so.get('psi2') is None and not _t(fp_num(x.get('psi1'))) and not _t(fp_num(x.get('psi2')))
        R0 = None
        err = None
        if els:
            try:
                R0 = xrf_fp(v['xs'], v['ys'], els, S, {'mode': c['mode'], 'balance': fp_balance(c), 'autoGeom': autoGeom})
            except ZeroDivisionError as e:
                raise NonTrascritto(tt('%s: divisione per zero nella stima FP (in JavaScript darebbe Infinity o NaN): ', '%s: division by zero in the FP estimate (JavaScript would give Infinity or NaN): ') % v['nome'] + str(e))
        if R0:
            R0.update({'els': els, 'S': R0.get('S') or S, 'S0': S, 'autoGeom': autoGeom, 'cfg': c})
            R = R0
        else:
            R = {'els': els, 'S': S, 'cfg': c, 'empty': True}
        if err:
            R['err'] = err
    v['fpRes'] = R
    return R


def _fp_warn_list(v, R):
    """index.html fpNotes: solo gli avvisi con ⚠️ (gli unici che fpCsvRows scrive), nello stesso ordine."""
    Q = R.get('Q')
    if not Q or not Q.get('res'):
        return []
    FPel = _fp()['el']
    c = fp_cfg(v)
    S, els, x, so = R['S'], R['els'], v.get('xrf') or {}, c.get('S') or {}
    light = [e for e in els if FPel[e]['Z'] < 19]
    notes = []

    def un(t):
        notes.insert(0, t)
    xkv = fp_num(x.get('kv'))
    if so.get('kv') is None and xkv is None:
        un('⚠️ Il file non dichiara la tensione del tubo: il calcolo presume %s kV. Se la misura è stata fatta con un\'altra tensione scrivila in «Condizioni di misura»: gli elementi pesanti (Sn, Ag, Pb) cambiano molto.' % _js_s(S['kv']))
    if not _t(so.get('anode')) and not _t(x.get('tube')):
        un('⚠️ Il file non dichiara l\'anodo del tubo: il calcolo presume %s. Controllalo in «Condizioni di misura».' % S['anode'])
    if xkv is not None and xkv != S['kv']:
        un('⚠️ Il file dichiara %s kV, ma il calcolo usa %s kV: il modello arriva a 50 kV, quindi la stima è meno affidabile.' % (t_esc(_js_s(x.get('kv')) if x.get('kv') is not None else 'undefined'), _js_s(S['kv'])))
    if 'W' in R['els'] and 'Au' in R['els']:
        un('⚠️ W e Au hanno righe sovrapposte (W Lα / Au Lℓ, W Lβ / Au Lα): la quota di W non è affidabile.')
    if c.get('mode') == 'compton':
        if _xn(Q.get('relC')) > 0.1:
            un('⚠️ <b>Il picco Compton è troppo debole</b> (matrice pesante: biacca, cinabro, metalli): la scala assoluta non è affidabile. Usa «Lega» per i rapporti tra elementi, oppure uno standard.')
        if Q.get('over'):
            un('⚠️ La somma supera il 100%: la parte invisibile scelta non è adatta o lo strato non è spesso e omogeneo.')
    ov = []
    for e in els:
        o = Q['res'].get(e)
        if not o:
            continue
        E = fp_line_e(e, o['line'])
        for j in els:
            if j == e:
                continue
            Rj = Q['res'].get(j)
            if not Rj or Rj['w'] < o['w']:
                continue
            fam = FPel[j]['fam']
            if any(q[2] > 0.05 and abs(q[1] - E) < 0.6 * xrf_fwhm(E) for q in (fam.get('K') or []) + (fam.get('L') or [])):
                ov.append('%s (riga vicina a %s)' % (e, j))
                break
    if ov:
        un('⚠️ Valori poco sicuri per righe sovrapposte: %s. Un elemento così può anche non esserci: cerca una seconda riga.' % ', '.join(ov))
    if Q['res'].get('As') and not (Q['res'].get('Pb') and Q['res']['Pb']['w'] > 0) and not v.get('uncal') and is_counts(v['ys']):
        kb = xrf_currie_full(v['xs'], v['ys'], [fp_line_e('As', 'Kb')])[0]
        if kb and not kb['detected']:
            un('⚠️ As non distinguibile da Pb: la riga As Kα coincide con Pb Lα e la As Kβ è sotto il limite di rilevabilità (pochi conteggi). Il valore di As può essere Pb: misura più a lungo.')
    a = S['anode']
    if a in els:
        un('⚠️ %s è anche l\'anodo del tubo: la sua Kα coincide con quella del tubo diffusa, quindi %s è stimato dalla riga Lα e una parte del segnale può venire dal tubo. Confronta con una misura fatta con un tubo diverso.' % (a, a))
    else:
        q = xrf_elements(v)
        if q and a in q['els']:
            un('⚠️ Le righe di %s si vedono, ma %s è l\'anodo del tubo e non è nel calcolo: le righe deboli possono venire dal tubo. Se il campione può contenere %s (per esempio una lega d\'argento con un tubo ad argento), aggiungilo all\'elenco: i valori cambiano molto.' % (a, a, a))
    if light and S['atm'] == 'air':
        notes.append('⚠️ %s: elementi leggeri in aria, le loro righe sono molto assorbite; il risultato è solo indicativo.' % ', '.join(light))
    th = R['fit'].get('th')
    if R.get('autoGeom') and _t(th):
        pass
    elif _t(th) and abs(th - (R['S']['psi1'] + R['S']['psi2'])) > 15:
        notes.append('⚠️ Il picco Compton indica un angolo di diffusione di circa %s°, ma gli angoli impostati danno %s°: controlla le condizioni di misura.' % (js_str(js_round(th)), js_str(js_round(R['S']['psi1'] + R['S']['psi2']))))
    return notes


_RE_TAG = re.compile(r'<[^>]+>')
_RE_WARN = re.compile('⚠️' + _WS + '*')


def fp_csv_rows(lista, ctx):
    """index.html fpCsvRows(list): righe di composizione_xrf_parametri_fondamentali.csv."""
    en = ctx.get('lang') == 'en'
    dec = '.' if en else ','
    TRF = ctx.get('fpTr') or {}

    def n(x):
        return '' if (x is None or not isinstance(x, (int, float)) or not math.isfinite(x)) else num_prec(float(x), 5).replace('.', dec, 1)

    def tr(t):
        return TRF.get(t, t) if en else t
    out = [['File', 'Nome', 'Modalità', 'Elemento', 'Riga', '% in peso', '± (conteggi)', 'Ossido', '% ossido', 'Conteggi netti', 'Anodo', 'kV', 'Angolo ingresso', 'Angolo uscita',
            'Tipo di valore', 'Somma %', 'Chi2 ridotto', 'Atmosfera', 'Be tubo (um)', 'Be rivelatore (um)', 'Si (um)', 'Distanza rivelatore (cm)', 'Filtro primario', 'Note']]
    MODES = _xc('FP_MODES')
    for v in lista:
        R = fp_run(v)
        if not R or not R.get('Q') or not R['Q'].get('res'):
            continue
        m = (next((q for q in MODES if q[0] == R['cfg'].get('mode')), None) or MODES[0])[1]
        sm = 0
        for o in R['Q']['res'].values():
            sm = sm + o['w']
        warn = [js_trim(_RE_WARN.sub('', _RE_TAG.sub('', t))) for t in _fp_warn_list(v, R) if '⚠️' in t]
        x = v.get('xrf') or {}
        kvP = (fp_cfg(v).get('S') or {}).get('kv') is None and fp_num(x.get('kv')) is None
        H = xrf_elements(v)
        unsure = (H.get('unsure') or []) if H else []

        def el_note(e):
            a = [tr('poco sicuro per righe sovrapposte') for t in warn if re.search('sovrappost|poco sicur', t) and re.search('(^|[' + re.escape(JS_WS) + ':,])' + re.escape(e) + ' \\(riga vicina a ', t)][:1]
            b = tr('non distinguibile da un elemento con righe coincidenti') if (H and e in unsure) else ''
            return '; '.join(q for q in a + [b] if q)
        S = R['S']
        xkv = fp_num(x.get('kv'))
        for k, (e, o) in enumerate(R['Q']['res'].items()):
            me = R['meas'].get(e)
            kvc = ('%s (file: %s)' % (n(S['kv']), n(xkv))) if (xkv is not None and xkv != S['kv']) else (('%s (%s)' % (n(S['kv']), 'assumed' if en else 'presunti')) if kvP else n(S['kv']))
            first = ' | '.join('! ' + tr(t) for t in warn if not re.search('sovrappost|poco sicur', t)) if k == 0 else ''
            note = ' | '.join(q for q in (el_note(e), first) if q)
            filt = ('%s %s um' % (S['filt']['comp'], _js_s(S['filt']['um']))) if S['filt'] else 'nessuno'
            out.append([v['nome'], v['titolo'], m, e, o['line'], n(o['w']), n(o['sw']), o.get('ox') or '', n(o.get('wox')), n(me['I'] if me else None), S['anode'], kvc,
                        n(S['psi1']), n(S['psi2']), 'stima senza standard, non validata', n(sm), n(R['fit']['chi2r'] if R.get('fit') else None),
                        ('air' if en else 'aria') if S['atm'] == 'air' else (('helium' if en else 'elio') if S['atm'] == 'he' else (('vacuum' if en else 'vuoto') if S['atm'] == 'vac' else S['atm'])),
                        n(S['beT']), n(S['beD']), n(S['si']), n(S['d2']), filt, note])
        miss = [e for e in unsure if e not in R['Q']['res']]
        if H and miss:
            out.append([v['nome'], v['titolo'], m] + [''] * 20 + [tr('non distinguibili (non nel calcolo):') + ' ' + ', '.join(miss)])
    return out


def fp_layer_pairs(el, S):
    e = _fp()['el'].get(el)
    if not e:
        return []
    out = []
    if e['ln'].get('Ka') and e['ln'].get('Kb') and _ed(e, 'K') < S['kv'] * 0.95:
        out.append(['Ka', 'Kb'])
    if e['ln'].get('La') and e['ln'].get('Lb') and _ed(e, 'L3') < S['kv']:
        out.append(['La', 'Lb'])
    return out


def fp_layer_cfg(v, R):
    # index.html fpLayerCfg
    c = fp_cfg(v)
    L = {'method': 'ratio'}
    L.update(c.get('layer') or {})
    els = (R and R.get('els')) or []
    FPel = _fp()['el']
    if not _t(L.get('el')) or L['el'] not in FPel:
        L['el'] = next((e for e in ('Pb', 'Cu', 'Ag', 'Hg', 'Fe') if e in els), None) or (els[0] if els else None) or 'Pb'
    if not _t(L.get('cover')):
        L['cover'] = 'oro' if L['el'] in ('Cu', 'Ag') else 'org'
    if not _t(L.get('sub')):
        L['sub'] = 'fp' if (R and R.get('Q') and R['Q'].get('comp')) else (_xc('FP_SUB_DEF').get(L['el']) or 'calcite')
    return L


def fp_layer_run(v, R, L, pr, ref_of):
    # index.html fpLayerRun: {res, cov, method, ...} oppure {msg}
    if not pr:
        return {'msg': 'pairs'}
    S = R['S']

    def mat_of(i_, txt, rho):
        if i_ == 'custom':
            c = fp_parse_comp(txt)
            r = _xn(rho)
            return {'comp': c, 'rho': r if _t(r) else None} if c else None
        return fp_mat(i_)
    cov = mat_of(L['cover'], L.get('coverTxt'), L.get('coverRho'))
    if L['sub'] == 'fp':
        sub = {'comp': R['Q']['comp'], 'rho': None} if (R.get('Q') and R['Q'].get('comp')) else None
    else:
        sub = mat_of(L['sub'], L.get('subTxt'), 1)
    if not cov or not sub:
        return {'msg': 'formula'}
    if not _t(cov.get('rho')):
        cov['rho'] = 1.5
    el = L['el']
    if not ((sub['comp'].get(el) or 0) > 0) and not ((cov['comp'].get(el) or 0) > 0):
        return {'msg': 'el'}
    els = list(dict.fromkeys((R.get('els') or []) + [el]))

    def split(g):
        k = 'ly|' + el + '|' + S['key'] + '|' + ','.join(els)
        if g.get('_lyK') != k:
            g['_ly'] = xrf_fit_lines(g['xs'], g['ys'], els, S, {'split': {el: True}})
            g['_lyK'] = k
        return g['_ly']
    F = split(v)
    if not F or not F['area'].get(el):
        return {'msg': 'lines'}
    A, SA = F['area'][el], F['sArea'][el]
    a1, a2, s1, s2 = A.get(pr[0]), A.get(pr[1]), SA.get(pr[0]), SA.get(pr[1])
    if not ((a1 or 0) > 0 and (a2 or 0) > 0):
        return {'msg': 'weak'}
    ref = ref_of(L.get('ref')) if (L.get('ref') is not None and L.get('ref') != '') else None
    if L['method'] == 'atten':
        if not ref:
            return {'msg': 'ref'}
        Gf = split(ref)
        if not Gf or not Gf['area'].get(el) or not ((Gf['area'][el].get(pr[0]) or 0) > 0):
            return {'msg': 'refline'}

        def nf(g):
            x = g.get('xrf') or {}
            lt, ua = fp_num(x.get('live')), fp_num(x.get('ua'))
            return {'v': ((lt / 1000 if _t(x.get('liveMs')) else lt) if _t(lt) else 1) * (ua if _t(ua) else 1),
                    'by': ' e '.join(q for q in ('tempo vivo' if _t(lt) else '', 'corrente' if _t(ua) else '') if q)}
        n1, n0 = nf(v), nf(ref)
        g0, sg0 = Gf['area'][el][pr[0]], Gf['sArea'][el][pr[0]]
        ratio = (a1 / n1['v']) / (g0 / n0['v'])
        sR = ratio * m_hypot(s1 / a1, sg0 / g0)
        if sR / ratio > 0.25:
            return {'msg': 'weakatt'}
        res = fp_layer_solve({'S': S, 'cover': cov, 'sub': sub, 'el': el, 'lines': pr, 'method': 'atten', 'ratio': ratio, 'sR': sR})
        if res and res.get('err') == 'cover':
            return {'msg': 'cover'}
        return {'res': res, 'cov': cov, 'method': 'atten', 'ratio': ratio, 'sR': sR}
    R1 = a1 / a2
    sR = R1 * m_hypot(s1 / a1, s2 / a2)
    R0m = None
    if sR / R1 > 0.25:
        return {'msg': 'weakratio'}
    if ref:
        Gf = split(ref)
        if Gf and Gf['area'].get(el) and (Gf['area'][el].get(pr[0]) or 0) > 0 and (Gf['area'][el].get(pr[1]) or 0) > 0:
            R0m = Gf['area'][el][pr[0]] / Gf['area'][el][pr[1]]
    res = fp_layer_solve({'S': S, 'cover': cov, 'sub': sub, 'el': el, 'lines': pr, 'method': 'ratio', 'R': R1, 'sR': sR, 'R0meas': R0m})
    return {'res': res, 'cov': cov, 'method': 'ratio', 'R': R1, 'sR': sR, 'R0m': R0m} if res else {'msg': 'solve'}


def strati_rows(lista, ctx, ref_of):
    """index.html analysisFiles: righe di spessore_strati_xrf.csv."""
    dec = '.' if ctx.get('lang') == 'en' else ','

    def n(x):
        return '' if (x is None or not isinstance(x, (int, float)) or not math.isfinite(x)) else num_prec(float(x), 7).replace('.', dec, 1)
    lr = [['File', 'Nome', 'Elemento', 'Righe', 'Strato sopra', 'Materiale sotto', 'Metodo', 'mg/cm²', 'da', 'a', 'µm', 'da', 'a', 'Nota']]
    for v in lista:
        fp = (v.get('an') or {}).get('fp')
        if not fp or not fp.get('layer') or not fp['layer'].get('on'):
            continue
        R = fp_run(v)
        if not R or not R.get('S'):
            continue
        L = fp_layer_cfg(v, R)
        pairs = fp_layer_pairs(L['el'], R['S'])
        want = ','.join(L.get('lines') or [])
        pr = next((q for q in pairs if ','.join(q) == want), None) or (pairs[0] if pairs else None)
        o = fp_layer_run(v, R, L, pr, ref_of)
        if not o or not o.get('res'):
            continue
        r, cv = o['res'], o['cov']
        lo, hi = r.get('lo'), r.get('hi')
        lr.append([v['nome'], v['titolo'], L['el'], '/'.join(pr), L.get('coverTxt') if L['cover'] == 'custom' else L['cover'], L.get('subTxt') if L['sub'] == 'custom' else L['sub'],
                   ('rapporto di righe, R0 da riferimento' if _t(o.get('R0m')) else 'rapporto di righe, R0 teorico') if o['method'] == 'ratio' else 'attenuazione',
                   n(r['mgcm2']), n(lo * 1000 if lo is not None else None), n(hi * 1000 if hi is not None else None), n(r['um']),
                   n(lo / cv['rho'] * 1e4 if lo is not None else None), n(hi / cv['rho'] * 1e4 if hi is not None else None),
                   'sotto il limite' if r.get('below') else ('oltre il limite' if r.get('above') else '')])
    return lr


def xq_model_fp(cfg, lista, els):
    # index.html xqModelFP: parametri fondamentali; con 1 o più standard corregge la sensibilità di ogni elemento
    mode = 'norm' if cfg.get('q100') is not False else 'abs'
    rows = []
    for v in lista:
        S = fp_setup_of(v)
        R = None
        if not v.get('uncal'):
            try:
                R = xrf_fp(v['xs'], v['ys'], els, S, {'mode': 'norm'})
            except ZeroDivisionError as e:
                raise NonTrascritto(tt('%s: divisione per zero nella stima FP (in JavaScript darebbe Infinity o NaN): ', '%s: division by zero in the FP estimate (JavaScript would give Infinity or NaN): ') % v['nome'] + str(e))
        I = {e: (R['meas'][e]['I'] if (R and R['meas'].get(e)) else None) for e in els}
        rows.append({'v': v, 'S': S, 'meas': R['meas'] if R else None, 'I': I, 'C': (v.get('an') or {}).get('std') or {}})
    stds = [r for r in rows if r['meas'] and any(r['C'].get(e) is not None for e in els)]

    def cal_of(sset):
        return fp_calibrate([{'meas': r['meas'], 'comp': r['C'], 'S': r['S']} for r in sset], sset[0]['S']) if sset else None

    def pred(r, K):
        Q = fp_quant(r['meas'], r['S'], {'k': K['k'], 'G': K['G'], 'mode': mode} if (K and _t(K.get('G'))) else {'mode': 'norm'})
        return Q if (Q and Q.get('res')) else None
    cal = cal_of(stds)
    for r in rows:
        r['pred'] = {}
        r['tot'] = 0
        if not r['meas']:
            continue
        Q = pred(r, cal)
        if not Q:
            continue
        for e in els:
            r['pred'][e] = Q['res'][e]['w'] if Q['res'].get(e) else None
        r['tot'] = Q['sum']
    loo = {}   # validazione incrociata: lo stesso calcolo per ogni elemento, fatto una volta per standard (stessi numeri)
    fit = {}
    for e in els:
        err = []
        if len(stds) >= 2:
            for i, s in enumerate(stds):
                if s['C'].get(e) is None:
                    continue
                if i not in loo:
                    loo[i] = pred(s, cal_of([q for k, q in enumerate(stds) if k != i]))
                Q = loo[i]
                if Q and Q['res'].get(e):
                    err.append(Q['res'][e]['w'] - s['C'][e])
        q = 0
        for b in err:
            q = q + b * b
        fit[e] = {'ok': True, 'kind': 'fp', 'n': len(stds), 'rmsecv': math.sqrt(q / len(err)) if err else None, 'rmse': None}
    return {'els': els, 'rows': rows, 'stds': stds, 'fit': fit, 'fp': True, 'cal': cal}


# ============================== tabelle ==============================
def _fp_guard(fn, *a):
    try:
        return fn(*a)
    except ZeroDivisionError as e:
        raise NonTrascritto(tt('divisione per zero nel calcolo FP (in JavaScript darebbe Infinity o NaN): ', 'division by zero in the FP calculation (JavaScript would give Infinity or NaN): ') + str(e))


def composizione_fp_csv(lista, ctx):
    """index.html analysisFiles: (nome, testo) di composizione_xrf_parametri_fondamentali.csv, o None.
    lista: le voci XRF incluse, non «canale», con f.an.fp o una stima già fatta (il filtro lo applica l'app: A.fp.lista).
    ctx: lang, fpTr (in inglese: le parti tradotte da AcchI18n.tr in fpCsvRows)."""
    TEC_LANG[0] = ctx.get('lang') or 'it'
    rows = _fp_guard(fp_csv_rows, lista, ctx)
    if len(rows) <= 1:
        return None
    return ('xrf_fundamental_parameters.csv' if _en() else 'composizione_xrf_parametri_fondamentali.csv', analysis_csv(rows, _csep(), _dec()))


def spessore_strati_csv(lista, ctx):
    """index.html analysisFiles: (nome, testo) di spessore_strati_xrf.csv, o None. Stessa lista; ctx['rif'](id) dà la voce dello
    spettro di riferimento scelto (L.ref), o None."""
    TEC_LANG[0] = ctx.get('lang') or 'it'
    rif = ctx.get('rif') or (lambda i: None)
    rows = _fp_guard(strati_rows, lista, ctx, rif)
    if len(rows) <= 1:
        return None
    return ('xrf_layer_thickness.csv' if _en() else 'spessore_strati_xrf.csv', analysis_csv(rows, _csep(), _dec()))
