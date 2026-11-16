
# ---------------------------------------------------------------------------------------------
# Modulo acch_sorp: fisisorbimento e chemisorbimento, tabelle di analisi complete.
# Trascrizione di app/sorption-core.js (analyze, csvRows, chemAnalyze, chemCsvRows e le funzioni
# che usano) e di app/sorption-ui.js (run, csvText, csvName, chemRun, chemCsvText, chemCsvName).
# Si concatena DOPO acch_ricetta.py: usa i suoi helper (fin, jdiv, js_str, js_prec, js_fixed,
# js_expo, js_max, js_min, js_round, js_or1, sorp_rel, sorp_branch, sorp_sorted, sorp_interp,
# sorp_csv, SORP_NA, SORP_R, VMOL_STP, JS_WS, NonTrascritto). Le funzioni BET/BJH di
# acch_ricetta.py restano come sono: qui ci sono versioni complete e autonome (prefisso sp_/ch_).
# Funzioni matematiche: m_log, m_log10, m_exp, m_pow, m_cos di acch_math.py (concatenato prima), come nel
# motore JavaScript scelto con imposta_motore.
# ---------------------------------------------------------------------------------------------
import functools as _functools

SP_VMOL_IUPAC = 22710.95
SP_ADSORBATES = {
    'N2': {'name': 'N₂', 'M': 28.0134, 'sigma': 0.162, 'rhoL': 0.8061, 'gamma': 8.880, 'T': 77.355, 'beta': None, 'srcs': {
        'sigma': ['IUPAC 2015 §5.2.1 (0,162 nm²)', 'IUPAC 2015 §5.2.1 (0.162 nm²)'],
        'rhoL': ['NIST WebBook, N₂ saturo a 101,325 kPa (0,80608 g/cm³)', 'NIST WebBook, saturated N₂ at 101.325 kPa (0.80608 g/cm³)'],
        'gamma': ['NIST WebBook / Mulero et al. 2012 (8,880 mN/m a 77,355 K)', 'NIST WebBook / Mulero et al. 2012 (8.880 mN/m at 77.355 K)'],
        'T': ['NIST WebBook, ebollizione normale (77,355 K)', 'NIST WebBook, normal boiling point (77.355 K)']}},
    'Ar': {'name': 'Ar', 'M': 39.948, 'sigma': 0.142, 'rhoL': 1.395, 'gamma': 12.53, 'T': 87.30, 'beta': None, 'srcs': {
        'sigma': ['IUPAC 2015 §5.2.1 (0,142 nm² a 87 K)', 'IUPAC 2015 §5.2.1 (0.142 nm² at 87 K)'],
        'rhoL': ['NIST WebBook, Ar saturo, Tegeler et al. 1999 (1,395 g/cm³ a 87,3 K)', 'NIST WebBook, saturated Ar, Tegeler et al. 1999 (1.395 g/cm³ at 87.3 K)'],
        'gamma': ['NIST WebBook / Mulero et al. 2012 (12,53 mN/m a 87,3 K, interpolato fra 87,178 e 87,641 K)', 'NIST WebBook / Mulero et al. 2012 (12.53 mN/m at 87.3 K, interpolated between 87.178 and 87.641 K)'],
        'T': ['NIST WebBook, ebollizione normale (87,30 K)', 'NIST WebBook, normal boiling point (87.30 K)']}},
    'Kr': {'name': 'Kr', 'M': 83.798, 'sigma': 0.202, 'rhoL': None, 'gamma': None, 'T': 77.355, 'beta': None, 'srcs': {
        'sigma': ["valore d'uso comune; IUPAC 2015 §5.2.1: tra 0,17 e 0,23 nm², va dichiarato", 'commonly used value; IUPAC 2015 §5.2.1: between 0.17 and 0.23 nm², to be stated'],
        'T': ['N₂ liquido', 'liquid N₂']}},
    'CO2': {'name': 'CO₂', 'M': 44.0095, 'sigma': None, 'rhoL': 0.9274, 'gamma': 4.484, 'T': 273.15, 'beta': 0.35, 'srcs': {
        'sigma': ['nessun valore predefinito: IUPAC 2015 §6 usa il CO₂ a 273 K per i micropori, non per il BET', 'no default value: IUPAC 2015 §6 uses CO₂ at 273 K for micropores, not for BET'],
        'rhoL': ['NIST WebBook, CO₂ saturo a 273,15 K, Span e Wagner 1996 (0,92743 g/cm³)', 'NIST WebBook, saturated CO₂ at 273.15 K, Span and Wagner 1996 (0.92743 g/cm³)'],
        'gamma': ['NIST WebBook / Mulero et al. 2012 (4,484 mN/m a 273,15 K)', 'NIST WebBook / Mulero et al. 2012 (4.484 mN/m at 273.15 K)'],
        'beta': ['Linares-Solano e Stoeckli, Carbon 43 (2005) 658 (β = 0,35)', 'Linares-Solano and Stoeckli, Carbon 43 (2005) 658 (β = 0.35)'],
        'T': ['0 °C', '0 °C']}},
}
SP_THICK_NAME = {'harkins-jura': 'Harkins–Jura', 'de-boer': 'de Boer (forma di Harkins–Jura)', 'halsey': 'Halsey',
                 'carbon-black': 'Carbon Black / STSA (ASTM D6556)', 'kjs': 'Kruk–Jaroniec–Sayari'}
SP_METALS = {
    'Pt': {'M': 195.084, 'rho': 21.45, 'am': 0.08}, 'Pd': {'M': 106.42, 'rho': 12.02, 'am': 0.0787}, 'Ni': {'M': 58.693, 'rho': 8.90, 'am': 0.0649},
    'Rh': {'M': 102.906, 'rho': 12.41, 'am': 0.0752}, 'Ru': {'M': 101.07, 'rho': 12.45, 'am': 0.0613}, 'Ir': {'M': 192.217, 'rho': 22.56, 'am': 0.0769},
    'Cu': {'M': 63.546, 'rho': 8.96, 'am': 0.068}, 'Co': {'M': 58.933, 'rho': 8.90, 'am': 0.0662}, 'Ag': {'M': 107.868, 'rho': 10.49, 'am': 0.087},
    'Au': {'M': 196.967, 'rho': 19.30, 'am': 0.0875}, 'Fe': {'M': 55.845, 'rho': 7.87, 'am': 0.0614},
}


class _SpErr(Exception):
    """Equivalente di un TypeError di JavaScript dentro un try dell'app."""


# ============================== Math di JavaScript senza eccezioni di Python ==============================
def sp_num(v):
    # conversione numerica implicita di JS (null → 0, undefined → NaN; qui None vale undefined)
    if v is None:
        return NAN
    if isinstance(v, bool):
        return 1.0 if v else 0.0
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        s = v.strip(JS_WS)
        if s == '':
            return 0.0
        try:
            return float(s) if re.fullmatch(r'[-+]?(Infinity|[0-9]+\.?[0-9]*([eE][-+]?[0-9]+)?|\.[0-9]+([eE][-+]?[0-9]+)?)', s) else NAN
        except ValueError:
            return NAN
    return NAN


def sp_truthy(v):
    # valore di verità di JS
    if v is None or v is False:
        return False
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return v == v and v != 0
    if isinstance(v, str):
        return v != ''
    return True


def sp_gt(a, b):
    # a > b di JS (None come undefined: confronto falso)
    if a is None or b is None:
        return False
    return a > b


def sp_sqrt(x):
    return math.sqrt(x) if x >= 0 else (x if x != x else NAN)


def sp_sq(v):
    # v**2 (pow con esponente 2 = v*v anche in fdlibm)
    return v * v


def sp_max(arr):
    # Math.max(...arr)
    return js_max(*arr) if arr else -INF


def sp_cmp_num(v):
    # risultato di un comparatore di Array.prototype.sort: NaN vale 0
    return 0 if v != v else (-1 if v < 0 else (1 if v > 0 else 0))


def sp_tmpl(v):
    # numero (o '') dentro un modello `${…}`
    if isinstance(v, str):
        return v
    if v is None:
        return 'null'
    return js_str(v)


# ============================== utilità numeriche (sorption-core.js) ==============================
def sp_linfit(X, Y):
    # sorption-core.js linfit: minimi quadrati con somme centrate, errori standard, r
    n = len(X)
    if n < 2:
        return None
    mx = my = 0.0
    for i in range(n):
        mx += X[i]
        my += Y[i]
    mx /= n
    my /= n
    sxx = sxy = syy = 0.0
    for i in range(n):
        dx, dy = X[i] - mx, Y[i] - my
        sxx += dx * dx
        sxy += dx * dy
        syy += dy * dy
    if not (sxx > 0):
        return None
    slope = sxy / sxx
    icpt = my - slope * mx
    sse = 0.0
    for i in range(n):
        e = Y[i] - icpt - slope * X[i]
        sse += e * e
    s2 = sse / (n - 2) if n > 2 else NAN
    seS = sp_sqrt(s2 / sxx)
    seI = sp_sqrt(s2 * (1 / n + mx * mx / sxx))
    r = jdiv(sxy, sp_sqrt(sxx * syy)) if syy > 0 else 1.0
    return {'slope': slope, 'icpt': icpt, 'r': r, 'r2': r * r, 'seS': seS, 'seI': seI, 'n': n, 'sse': sse, 'mx': mx, 'sxx': sxx}


def sp_solve(A, b):
    # sorption-core.js solve: Gauss con pivot parziale
    n = len(b)
    M = [list(A[i]) + [b[i]] for i in range(n)]
    for c in range(n):
        p = c
        for r in range(c + 1, n):
            if abs(M[r][c]) > abs(M[p][c]):
                p = r
        if not (abs(M[p][c]) > 1e-300):
            return None
        M[c], M[p] = M[p], M[c]
        for r in range(n):
            if r == c:
                continue
            k = M[r][c] / M[c][c]
            if k != 0 and k == k:
                for q in range(c, n + 1):
                    M[r][q] -= k * M[c][q]
    return [jdiv(M[i][n], M[i][i]) for i in range(n)]


def sp_nnls(A, b, max_iter=None):
    # sorption-core.js nnls: Lawson–Hanson; A per colonne
    p, m = len(A), len(b)
    x = [0.0] * p
    inP = [False] * p

    def dot(u, v):
        s = 0.0
        for i in range(m):
            s += u[i] * v[i]
        return s

    def resid():
        r = [float(v) for v in b]
        for j in range(p):
            if x[j] != 0 and x[j] == x[j]:
                for i in range(m):
                    r[i] -= x[j] * A[j][i]
        return r

    tol = 1e-12 * sp_sqrt(js_or1(dot(b, b))) * js_max(1, *[sp_sqrt(dot(c, c)) for c in A])

    def ls(idx):
        return sp_solve([[dot(A[a], A[c]) + (1e-14 * dot(A[a], A[a]) if a == c else 0) for c in idx] for a in idx], [dot(A[a], b) for a in idx])

    for _outer in range(max_iter if sp_truthy(max_iter) else 3 * p + 20):
        r = resid()
        w = [dot(c, r) for c in A]
        j, wm = -1, tol
        for q in range(p):
            if not inP[q] and w[q] > wm:
                wm = w[q]
                j = q
        if j < 0:
            break
        inP[j] = True
        for _inner in range(3 * p + 20):
            idx = [q for q in range(p) if inP[q]]
            s = ls(idx)
            if not s:
                inP[j] = False
                break
            if all(v > 0 for v in s):
                for i, q in enumerate(idx):
                    x[q] = s[i]
                break
            alpha = 1
            for i, q in enumerate(idx):
                if s[i] <= 0:
                    den = x[q] - s[i]
                    a = jdiv(x[q], den if (den == den and den != 0) else 1e-300)
                    if a < alpha:
                        alpha = a
            for i, q in enumerate(idx):
                x[q] += alpha * (s[i] - x[q])
                if x[q] <= 1e-15:
                    x[q] = 0.0
                    inP[q] = False
    r = resid()
    ss = 0.0
    for v in r:
        ss += v * v
    return {'x': list(x), 'ssr': ss}


def sp_golden(f, a, b, tol):
    # sorption-core.js golden: sezione aurea
    g = (math.sqrt(5) - 1) / 2
    c = b - g * (b - a)
    d = a + g * (b - a)
    fc, fd = f(c), f(d)
    t = tol if sp_truthy(tol) else 1e-10
    i = 0
    while i < 200 and abs(b - a) > t * (1 + abs(a) + abs(b)):
        if fc < fd:
            b = d
            d = c
            fd = fc
            c = b - g * (b - a)
            fc = f(c)
        else:
            a = c
            c = d
            fc = fd
            d = a + g * (b - a)
            fd = f(d)
        i += 1
    return (a + b) / 2


# ============================== adsorbati, parametri, spessore ==============================
_SP_WS = '[' + re.escape(JS_WS) + ']'


def sp_gas_key(s):
    # sorption-core.js gasKey
    t = ('' if not sp_truthy(s) else (s if isinstance(s, str) else sp_tmpl(s))).lower()
    t = re.sub('^' + _SP_WS + '*[0-9]+' + _SP_WS + '*:' + _SP_WS + '*', '', t, count=1)
    t = re.sub('(' + _SP_WS + '|[_-])', '', t)
    if re.search(r'^n2|nitrog|azoto|stickstoff|azote|nitr[oó]geno', t):
        return 'N2'
    if re.search(r'^ar(87|gon|gon87)?\b|^ar$|argon', t, re.ASCII):
        return 'Ar'
    if re.search(r'^kr|krypt|kripto', t):
        return 'Kr'
    if re.search(r'^co2|carbondioxide|anidridecarbonica|biossidodicarbonio|kohlendioxid', t):
        return 'CO2'
    if re.search(r'^o2|oxygen|ossigeno', t):
        return 'O2'
    return None


def sp_params(iso, over):
    # sorption-core.js params: file > utente > predefiniti
    m = (iso or {}).get('meta') or {}
    o = over or {}
    gk = o.get('gas') or m.get('gasKey') or sp_gas_key(m.get('gas')) or None
    d = SP_ADSORBATES.get(gk) if gk else None
    src = {}

    def pick(k, fileV, defV):
        if o.get(k) is not None and fin(sp_num(o[k])):
            src[k] = 'utente'
            return sp_num(o[k])
        if fileV is not None and fin(sp_num(fileV)):
            src[k] = 'file'
            return sp_num(fileV)
        if defV is not None:
            src[k] = 'predefinito'
            return defV
        src[k] = 'mancante'
        return None

    dd = d or {}
    P = {'gas': gk, 'gasName': d['name'] if d else (m.get('gas') or '')}
    P['sigma'] = pick('sigma', m.get('sigma'), dd.get('sigma'))
    P['M'] = pick('M', m.get('M'), dd.get('M'))
    P['rhoL'] = pick('rhoL', m.get('rhoL'), dd.get('rhoL'))
    P['gamma'] = pick('gamma', m.get('gamma'), dd.get('gamma'))
    P['T'] = pick('T', m.get('T'), dd.get('T'))
    P['theta'] = pick('theta', m.get('theta'), 0)
    iupac = o.get('stp') == 'iupac'
    P['vmol'] = SP_VMOL_IUPAC if iupac else VMOL_STP
    P['stp'] = 'iupac' if iupac else 'stp'
    P['thick'] = o.get('thick') or m.get('thick') or 'harkins-jura'
    P['beta'] = pick('beta', None, (dd.get('beta') or None) if d else None)
    if not o.get('thick') and m.get('thick'):
        src['thick'] = 'file'
    elif o.get('thick'):
        src['thick'] = 'utente'
    else:
        src['thick'] = 'predefinito'
    ref, refEn = {}, {}
    if d and d.get('srcs'):
        for k in src:
            if src[k] in ('predefinito', 'mancante') and d['srcs'].get(k):
                ref[k] = d['srcs'][k][0]
                refEn[k] = d['srcs'][k][1]
    if src.get('M') == 'predefinito':
        ref['M'] = 'pesi atomici standard IUPAC'
        refEn['M'] = 'IUPAC standard atomic weights'
    P['ref'], P['refEn'], P['src'] = ref, refEn, src
    P['liqPerStp'] = P['M'] / (P['vmol'] * P['rhoL']) if (sp_truthy(P['M']) and sp_truthy(P['rhoL'])) else None
    P['Vm'] = P['M'] / P['rhoL'] if (sp_truthy(P['M']) and sp_truthy(P['rhoL'])) else None
    return P


def sp_t_of(x, key):
    # sorption-core.js tOf: spessore statistico in Å (THICK)
    if key == 'halsey':
        return 3.54 * m_pow(jdiv(5, m_log(jdiv(1, x))), 1 / 3)
    if key == 'carbon-black':
        return 0.88 * x * x + 6.45 * x + 2.98
    if key == 'kjs':
        return m_pow(jdiv(60.65, 0.03071 - m_log10(x)), 0.3968)
    return sp_sqrt(jdiv(13.99, 0.034 - m_log10(x)))   # harkins-jura, de-boer e chiavi sconosciute


def sp_kelvin_r(x, P):
    # sorption-core.js kelvinR: menisco emisferico (null dei parametri → 0 come in JS)
    z = lambda v: 0.0 if v is None else v
    k = jdiv(2 * z(P['gamma']) * 1e-3 * z(P['Vm']) * 1e-6 * m_cos((P.get('theta') or 0) * math.pi / 180), SORP_R * z(P['T']) * m_log(jdiv(1, x)))
    return k * 1e10


def sp_branch(iso, which):
    # sorption-core.js branchOf (x e n)
    x, n = sorp_branch(iso, which)
    return {'x': x, 'n': n}


# ============================== BET e Rouquerol ==============================
def sp_bet_fit(x, n, i0, i1):
    # sorption-core.js betFit
    X, Y = [], []
    for i in range(i0, i1 + 1):
        X.append(x[i])
        Y.append(jdiv(x[i], n[i] * (1 - x[i])))
    L = sp_linfit(X, Y)
    if not L:
        return None
    nm = jdiv(1, L['slope'] + L['icpt'])
    C = 1 + jdiv(L['slope'], L['icpt'])
    return {'i0': i0, 'i1': i1, 'npts': i1 - i0 + 1, 'x0': x[i0], 'x1': x[i1], 'slope': L['slope'], 'icpt': L['icpt'], 'r': L['r'],
            'seS': L['seS'], 'seI': L['seI'], 'nm': nm, 'C': C, 'xm': jdiv(1, sp_sqrt(C) + 1) if C > 0 else NAN, 'X': X, 'Y': Y}


def sp_bet_area(nm, P):
    # sorption-core.js betArea
    return nm / P['vmol'] * SORP_NA * P['sigma'] * 1e-18 if (P and sp_truthy(P.get('sigma'))) else NAN


def sp_x_at_n(x, n, target):
    # sorption-core.js xAtN
    for i in range(1, len(n)):
        if (n[i - 1] - target) * (n[i] - target) <= 0 and n[i] != n[i - 1]:
            return x[i - 1] + (target - n[i - 1]) * (x[i] - x[i - 1]) / (n[i] - n[i - 1])
    return NAN


def sp_rouquerol(fit, x, n):
    # sorption-core.js rouquerolCheck
    c = {}
    mono = True
    for i in range(fit['i0'] + 1, fit['i1'] + 1):
        if n[i] * (1 - x[i]) <= n[i - 1] * (1 - x[i - 1]):
            mono = False
    c['a'] = mono
    c['b'] = fit['C'] > 0 and fit['icpt'] > 0
    c['c'] = c['b'] and fit['xm'] >= fit['x0'] and fit['xm'] <= fit['x1']
    xn = sp_x_at_n(x, n, fit['nm']) if c['b'] else NAN
    c['xAtNm'] = xn
    c['d'] = c['b'] and fin(xn) and abs(xn - fit['xm']) <= 0.1 * fit['xm']
    c['ok'] = c['a'] and c['b'] and c['c'] and c['d']
    return c


def sp_bet_auto(iso, opt):
    # sorption-core.js betAuto: la finestra valida più ampia, poi r maggiore
    opt = opt or {}
    A = sp_branch(iso, 'ads')
    minP = opt.get('minPts') if sp_truthy(opt.get('minPts')) else 3
    xmax = opt.get('xmax')
    idx = [i for i in range(len(A['x'])) if A['x'][i] > 0 and A['x'][i] < 1 and A['n'][i] > 0 and (xmax is None or A['x'][i] <= xmax)]
    if len(idx) < minP:
        return {'err': 'pochi', 'fits': [], 'valid': []}
    x = [A['x'][i] for i in idx]
    n = [A['n'][i] for i in idx]
    valid = []
    nall = 0
    for i0 in range(len(x)):
        for i1 in range(i0 + minP - 1, len(x)):
            F = sp_bet_fit(x, n, i0, i1)
            if not F:
                continue
            F['crit'] = sp_rouquerol(F, x, n)
            nall += 1
            if F['crit']['ok']:
                valid.append(F)

    def cmp(a, b):
        v = b['npts'] - a['npts']
        if v:
            return v
        v = sp_cmp_num(b['r'] - a['r'])
        if v:
            return v
        return sp_cmp_num(a['x0'] - b['x0'])
    valid = sorted(valid, key=_functools.cmp_to_key(cmp))
    best = valid[0] if valid else None
    if best:
        best['i0'] = idx[best['i0']]
        best['i1'] = idx[best['i1']]
    return {'best': best, 'valid': valid, 'nAll': nall, 'x': x, 'n': n}


def sp_bet_at(iso, x0, x1, P):
    # sorption-core.js betAt: BET su un intervallo dato
    A = sp_branch(iso, 'ads')
    idx = [i for i in range(len(A['x'])) if A['x'][i] >= x0 - 1e-9 and A['x'][i] <= x1 + 1e-9 and A['n'][i] > 0]
    if len(idx) < 2:
        return None
    x = [A['x'][i] for i in idx]
    n = [A['n'][i] for i in idx]
    F = sp_bet_fit(x, n, 0, len(x) - 1)
    if not F:
        return None
    F['crit'] = sp_rouquerol(F, x, n)
    F['area'] = sp_bet_area(F['nm'], P)
    F['i0'] = idx[0]
    F['i1'] = idx[-1]
    return F


def sp_bet(iso, P, opt):
    # sorption-core.js bet: automatico, utente, strumento
    opt = opt or {}
    out = {'P': P, 'warn': []}
    au = sp_bet_auto(iso, opt)
    out['auto'] = au.get('best')
    out['alternatives'] = (au.get('valid') or [])[1:6]
    if au.get('best'):
        au['best']['area'] = sp_bet_area(au['best']['nm'], P)
    for F in out['alternatives']:
        F['area'] = sp_bet_area(F['nm'], P)
    if opt.get('range'):
        out['user'] = sp_bet_at(iso, opt['range'][0], opt['range'][1], P)
    ib = ((iso.get('meta') or {}).get('instrBET'))
    if ib and fin(ib.get('x0')) and fin(ib.get('x1')):
        out['instr'] = sp_bet_at(iso, ib['x0'], ib['x1'], P)
    out['used'] = out.get('user') or out.get('auto') or None
    if out['used'] and out.get('instr') and out['instr']['area'] > 0:
        out['diffInstrPct'] = 100 * (out['used']['area'] - out['instr']['area']) / out['instr']['area']
    return out


# ============================== Langmuir ==============================
def sp_langmuir(iso, P, rng):
    # sorption-core.js langmuir: lineare e non lineare (Levenberg–Marquardt)
    A = sp_branch(iso, 'ads')
    r = rng or [0.05, 0.3]
    idx = [i for i in range(len(A['x'])) if A['x'][i] >= r[0] and A['x'][i] <= r[1] and A['n'][i] > 0 and A['x'][i] > 0]
    if len(idx) < 3:
        return {'err': 'pochi'}
    x = [A['x'][i] for i in idx]
    n = [A['n'][i] for i in idx]
    L = sp_linfit(x, [x[i] / n[i] for i in range(len(x))])
    if not L:
        return {'err': 'fit'}
    nmL = jdiv(1, L['slope'])
    KL = jdiv(L['slope'], L['icpt'])
    nm, K, lam = nmL, (KL if KL > 0 else 1), 1e-3

    def f(a, b):
        s = 0.0
        for i in range(len(x)):
            e = n[i] - jdiv(a * b * x[i], 1 + b * x[i])
            s += e * e
        return s
    sse = f(nm, K)
    for _it in range(200):
        J11 = J12 = J22 = g1 = g2 = 0.0
        for i in range(len(x)):
            d = 1 + K * x[i]
            mm = jdiv(nm * K * x[i], d)
            e = n[i] - mm
            j1 = jdiv(K * x[i], d)
            j2 = jdiv(nm * x[i], d * d)
            J11 += j1 * j1
            J12 += j1 * j2
            J22 += j2 * j2
            g1 += j1 * e
            g2 += j2 * e
        a11 = J11 * (1 + lam)
        a22 = J22 * (1 + lam)
        det = a11 * a22 - J12 * J12
        if not (abs(det) > 0):
            break
        d1 = jdiv(g1 * a22 - g2 * J12, det)
        d2 = jdiv(a11 * g2 - J12 * g1, det)
        s2 = f(nm + d1, K + d2)
        if s2 < sse:
            conv = abs(d1) < 1e-13 * abs(nm) and abs(d2) < 1e-13 * abs(K)
            nm += d1
            K += d2
            sse = s2
            lam /= 10
            if conv:
                break
        else:
            lam *= 10
            if lam > 1e12:
                break
    return {'range': r, 'npts': len(idx), 'lin': {'slope': L['slope'], 'icpt': L['icpt'], 'r': L['r'], 'nm': nmL, 'K': KL, 'area': sp_bet_area(nmL, P)},
            'nl': {'nm': nm, 'K': K, 'sse': sse, 'area': sp_bet_area(nm, P)}}


# ============================== volume dei pori, t-plot, αs ==============================
def sp_total_pore_volume(iso, P, xTarget, mode):
    # sorption-core.js totalPoreVolume (Gurvich) con dmax
    A = sp_branch(iso, 'ads')
    xt = xTarget if sp_truthy(xTarget) else 0.99
    if not A['x'] or not sp_truthy(P['liqPerStp']):
        return {'err': 'vuota' if sp_truthy(P['liqPerStp']) else 'densita'}
    if mode == 'interp':
        sx, sy = sorp_sorted(A['x'], A['n'])
        n = sorp_interp(sx, sy, xt)
        x = xt
    else:
        b = 0
        for i in range(1, len(A['x'])):
            if abs(A['x'][i] - xt) < abs(A['x'][b] - xt):
                b = i
        x, n = A['x'][b], A['n'][b]
    if not fin(n):
        return {'err': 'fuori'}
    V = n * P['liqPerStp']
    dmax = 2 * (sp_kelvin_r(x, P) + sp_t_of(x, P['thick'])) if (sp_truthy(P['gamma']) and sp_truthy(P['Vm']) and x < 1) else NAN
    return {'x': x, 'n': n, 'V': V, 'dmax': dmax}


def sp_avg_pore_diameter(V, S):
    # sorption-core.js avgPoreDiameter, in Å
    return 4 * V * 1e-6 / S * 1e10 if sp_gt(S, 0) else NAN


def sp_t_plot(iso, P, rng, model):
    # sorption-core.js tPlot
    A = sp_branch(iso, 'ads')
    key = model or P['thick'] or 'harkins-jura'
    pts = []
    for i, x in enumerate(A['x']):
        t = sp_t_of(x, key) if (x > 0 and x < 1) else NAN
        if fin(t):
            pts.append({'x': x, 'n': A['n'][i], 't': t})
    r = rng or {'x': [0.2, 0.5]}
    if r.get('t'):
        sel = [o for o in pts if o['t'] >= r['t'][0] and o['t'] <= r['t'][1]]
    else:
        sel = [o for o in pts if o['x'] >= r['x'][0] and o['x'] <= r['x'][1]]
    if len(sel) < 3:
        return {'err': 'pochi', 'pts': pts, 'model': key}
    L = sp_linfit([o['t'] for o in sel], [o['n'] for o in sel])
    if not L:
        return {'err': 'fit', 'pts': pts, 'model': key}
    if key not in SP_THICK_NAME:
        raise _SpErr("Cannot read properties of undefined (reading 'name')")   # THICK[key].name in JS
    k = P['liqPerStp']
    return {'model': key, 'modelName': SP_THICK_NAME[key], 'pts': pts, 'npts': len(sel), 'range': r, 'slope': L['slope'], 'icpt': L['icpt'], 'r': L['r'],
            'Sext': L['slope'] * k * 1e4 if sp_truthy(k) else NAN, 'Vmicro': L['icpt'] * k if sp_truthy(k) else NAN, 'nMicro': L['icpt']}


def sp_alpha_s(iso, P, ref, rng):
    # sorption-core.js alphaS: ref {x, n (cm³ STP/g), S}
    A = sp_branch(iso, 'ads')
    sx, sy = sorp_sorted(ref['x'], ref['n'])
    n04 = sorp_interp(sx, sy, 0.4)
    if not fin(n04) or n04 <= 0:
        return {'err': 'riferimento'}
    pts = []
    for i, x in enumerate(A['x']):
        a = sorp_interp(sx, sy, x) / n04
        if fin(a):
            pts.append({'x': x, 'n': A['n'][i], 'a': a})
    r = rng or {'a': [0.5, 1.2]}
    sel = [o for o in pts if o['a'] >= r['a'][0] and o['a'] <= r['a'][1]]
    if len(sel) < 3:
        return {'err': 'pochi', 'pts': pts}
    L = sp_linfit([o['a'] for o in sel], [o['n'] for o in sel])
    if not L:
        return {'err': 'fit', 'pts': pts}
    S = ref.get('S')
    return {'pts': pts, 'npts': len(sel), 'range': r, 'slope': L['slope'], 'icpt': L['icpt'], 'r': L['r'],
            'Sext': L['slope'] * S / n04 if fin(S) else NAN, 'Vmicro': L['icpt'] * P['liqPerStp'] if sp_truthy(P['liqPerStp']) else NAN, 'n04': n04}


# ============================== BJH e Dollimore–Heal ==============================
def sp_bjh(iso, P, opt):
    # sorption-core.js bjh
    opt = opt or {}
    which = opt.get('branch') or 'des'
    method = opt.get('method') or 'bjh'
    B = sp_branch(iso, which)
    lo = opt['xmin'] if opt.get('xmin') is not None else 0.35
    hi = opt['xmax'] if opt.get('xmax') is not None else 1
    if not sp_truthy(P['liqPerStp']) or not sp_truthy(P['gamma']):
        return {'err': 'parametri'}
    pts = [{'x': x, 'V': B['n'][i] * P['liqPerStp']} for i, x in enumerate(B['x'])]
    pts = [o for o in pts if o['x'] >= lo and o['x'] < hi and fin(o['V'])]
    if which == 'ads':
        pts = sorted(pts, key=_functools.cmp_to_key(lambda a, b: sp_cmp_num(b['x'] - a['x'])))
    if len(pts) < 3:
        return {'err': 'pochi'}
    key = opt.get('thick') or P['thick']
    rk = [sp_kelvin_r(o['x'], P) for o in pts]
    t = [sp_t_of(o['x'], key) for o in pts]
    rp = [rk[i] + t[i] for i in range(len(rk))]
    out = []
    sumA = sumL = 0.0
    for j in range(1, len(pts)):
        dV = pts[j - 1]['V'] - pts[j]['V']
        dt = t[j - 1] - t[j]
        rpm = (rp[j - 1] + rp[j]) / 2
        rkm = (rk[j - 1] + rk[j]) / 2
        tm = (t[j - 1] + t[j]) / 2
        if method == 'dh':
            Rf = sp_sq(jdiv(rpm, rkm + dt))
            Vp = Rf * (dV - dt * sumA * 1e-4 + 2 * math.pi * tm * dt * sumL * 1e-4)
        else:
            sc = 0.0
            for o in out:
                if o['Vp'] > 0:
                    sc += jdiv(o['rp'] - t[j], o['rp']) * o['A']
            Rf = sp_sq(jdiv(rpm, rkm + dt / 2))
            Vp = Rf * (dV - dt * sc * 1e-4)
        ok = Vp > 0
        if not ok:
            Vp = 0.0
        A = jdiv(2e4 * Vp, rpm)
        d0, d1 = 2 * rp[j - 1], 2 * rp[j]
        sumA += A
        sumL += jdiv(A, 2 * math.pi * rpm)
        out.append({'d': 2 * rpm, 'rp': rpm, 'dmax': d0, 'dmin': d1, 'Vp': Vp, 'A': A, 'dVdd': jdiv(Vp, d0 - d1), 'dVdlogd': jdiv(Vp, m_log10(jdiv(d0, d1))),
                    'neg': not ok, 'x0': pts[j - 1]['x'], 'x1': pts[j]['x']})
    asc = out[::-1]
    cv = ca = 0.0
    for o in asc:
        cv += o['Vp']
        ca += o['A']
        o['cumV'] = cv
        o['cumA'] = ca
    mode = asc[0]
    for o in asc:
        if o['dVdd'] > mode['dVdd']:
            mode = o
    ml = asc[0]
    for o in asc:
        ml = o if o['dVdlogd'] > ml['dVdlogd'] else ml
    return {'branch': which, 'method': method, 'thick': key, 'rows': asc, 'Vtot': cv, 'Atot': ca, 'mode': mode['d'], 'modeLog': ml['d'],
            'nNeg': len([o for o in out if o['neg']])}


# ============================== Dubinin–Radushkevich e Dubinin–Astakhov ==============================
def sp_drda(iso, P, rng, kind):
    # sorption-core.js drda
    A = sp_branch(iso, 'ads')
    r = rng or [1e-6, 0.1]
    k = P['liqPerStp']
    if not sp_truthy(k) or not sp_truthy(P['T']):
        return {'err': 'parametri'}
    pts = [{'x': x, 'W': A['n'][i] * k} for i, x in enumerate(A['x'])]
    pts = [o for o in pts if o['x'] >= r[0] and o['x'] <= r[1] and o['x'] > 0 and o['x'] < 1 and o['W'] > 0]
    if len(pts) < 3:
        return {'err': 'pochi'}
    Aj = [SORP_R * P['T'] * m_log(1 / o['x']) / 1000 for o in pts]
    lnW = [m_log(o['W']) for o in pts]

    def fitN(nn):
        return sp_linfit([m_pow(a, nn) for a in Aj], lnW)

    def res(nn):
        L = fitN(nn)
        return L['sse'] if L else INF
    nn = sp_golden(res, 1, 6, 1e-12) if kind == 'da' else 2
    L = fitN(nn)
    if not L or not (L['slope'] < 0):
        return {'err': 'fit'}
    E = m_pow(-1 / L['slope'], 1 / nn)
    W0 = m_exp(L['icpt'])
    out = {'kind': kind or 'dr', 'range': r, 'npts': len(pts), 'W0': W0, 'E': E, 'n': nn, 'r': L['r'],
           'pts': [{'x': o['x'], 'W': o['W'], 'A': Aj[i]} for i, o in enumerate(pts)]}
    if sp_truthy(P['beta']):
        out['E0'] = E / P['beta']
        if out['E0'] >= 20 and out['E0'] <= 42:
            out['L'] = 10.8 / (out['E0'] - 11.4)
    if nn == 2:
        out['D'] = jdiv(SORP_R * SORP_R * P['T'] * P['T'] * 2.302585092994046, E * E * 1e6)
    return out


# ============================== DFT con il kernel dell'utente ==============================
def sp_dft_fit(iso, kernel, opt):
    # sorption-core.js dftFit: NNLS (Lawson–Hanson) con regolarizzazione di Tikhonov
    opt = opt or {}
    A = sp_branch(iso, 'ads')
    lam = opt['lambda'] if opt.get('lambda') is not None else 0
    kx = kernel['x']
    pts = [{'x': x, 'n': A['n'][i]} for i, x in enumerate(A['x']) if x >= kx[0] and x <= kx[-1] and fin(A['n'][i])]
    if len(pts) < 3:
        return {'err': 'fuori'}
    lx = [m_log(v) for v in kx]
    W = kernel['w']
    cols = []
    for j in range(len(W)):
        kj = [row[j] if j < len(row) else NAN for row in kernel['K']]
        cols.append([sorp_interp(lx, kj, m_log(o['x'])) for o in pts])
    if any(any(not fin(v) for v in c) for c in cols):
        return {'err': 'kernel'}
    m = len(pts)
    b = [o['n'] for o in pts]
    sc = js_or1(sp_max(b))
    Acols, bb = cols, b
    if lam > 0:
        s = sp_sqrt(lam) * sc / js_or1(sp_max([sp_max(c) for c in cols]))
        Acols = [c + [s * sp_max(c) if q == j else 0 for q in range(len(W))] for j, c in enumerate(cols)]
        bb = b + [0] * len(W)
    F = sp_nnls(Acols, bb)
    v = F['x']
    ss = 0.0
    fit = []
    for i, o in enumerate(pts):
        s = 0.0
        for j in range(len(v)):
            s += cols[j][i] * v[j]
        ss += sp_sq(o['n'] - s)
        fit.append(s)
    cum = 0.0
    rows = []
    for j, w in enumerate(W):
        cum += v[j]
        rows.append({'w': w, 'dV': v[j], 'cumV': cum})
    name = kernel.get('name')
    return {'rows': rows, 'Vtot': cum, 'rms': sp_sqrt(ss / m), 'fit': fit, 'pts': pts, 'lambda': lam,
            'label': "kernel dell'utente" + (': ' + str(name) if sp_truthy(name) else '')}


# ============================== isteresi e tipo IUPAC ==============================
def sp_hysteresis(iso):
    # sorption-core.js hysteresis
    A = sp_branch(iso, 'ads')
    D = sp_branch(iso, 'des')
    if len(D['x']) < 3:
        return {'has': False}
    sax, say = sorp_sorted(A['x'], A['n'])
    sdx, sdy = sorp_sorted(D['x'], D['n'])
    maxGap, xGap, close = 0, NAN, NAN
    nMax = sp_max(A['n'])
    first = lambda a: a[0] if a else NAN
    last = lambda a: a[-1] if a else NAN
    grid = []
    x = js_max(first(sax), first(sdx))
    hi = js_min(last(sax), last(sdx))
    while x <= hi:
        grid.append(x)
        x += 0.005
    gap = [sorp_interp(sdx, sdy, g) - sorp_interp(sax, say, g) for g in grid]
    for i, g in enumerate(gap):
        if g > maxGap:
            maxGap = g
            xGap = grid[i]
    thr = 0.02 * nMax
    thrC = js_max(thr, 0.05 * maxGap)
    for i in range(len(grid)):
        if gap[i] > thrC:
            close = grid[i]
            break
    op = any(grid[i] < 0.35 and gap[i] > thr for i in range(len(grid)))
    return {'has': maxGap > thr, 'maxGap': maxGap, 'xGap': xGap, 'close': close, 'open': op}


def sp_iupac_suggest(iso, P, betRes):
    # sorption-core.js iupacSuggest: suggerimento motivato (Thommes et al. 2015)
    A = sp_branch(iso, 'ads')
    sx, sy = sorp_sorted(A['x'], A['n'])
    if len(sx) < 5:
        return None
    nAt = lambda x: sorp_interp(sx, sy, x)
    nTop = sy[-1]
    n01, n05, n09 = nAt(0.1), nAt(0.5), nAt(js_min(0.9, sx[-1]))
    H = sp_hysteresis(iso)
    C = betRes['used']['C'] if (betRes and betRes.get('used')) else None
    why = []
    typ, hyst = 'II', None
    if fin(n01) and n01 > 0.7 * nTop and (not fin(n09) or n09 < 1.15 * n05):
        typ = 'I(a)' if (fin(nAt(0.01)) and nAt(0.01) > 0.6 * nTop) else 'I(b)'
        why.append("quasi tutta la quantità è adsorbita sotto p/p₀ = 0,1 e poi c'è un plateau")
    elif C is not None and C < 2:
        typ = 'V' if H['has'] else 'III'
        why.append('C del BET basso (' + js_fixed(C, 2) + '): interazione debole con la superficie')
    elif H['has']:
        typ = 'IV(a)'
        why.append('ciclo di isteresi nella zona della condensazione capillare')
    elif fin(n05) and fin(n09) and n09 > 1.5 * n05 and nAt(0.95) < 1.1 * n09:
        typ = 'IV(b)'
        why.append('condensazione capillare senza isteresi')
    else:
        why.append('salita continua senza plateau e senza isteresi')
    if H['has']:
        cl = H.get('close')
        if P and P['gas'] == 'N2' and fin(cl) and cl >= 0.40 and cl <= 0.50:
            hyst = 'H2(a) o H3/H4 con chiusura forzata'
            why.append('chiusura a ' + js_fixed(cl, 2) + ": per l'N₂ a 77 K è la chiusura forzata (cavitazione, TSE)")
        elif fin(nTop) and fin(nAt(0.95)) and nAt(0.95) < 1.03 * n09:
            hyst = 'H1'
            why.append('rami ripidi e quasi paralleli con plateau finale')
        else:
            hyst = 'H3'
            why.append('nessun plateau vicino a p/p₀ = 1')
    return {'type': typ, 'hyst': hyst, 'why': why, 'H': H}


# ============================== avvisi (SPEC §4) ==============================
_SP_ROUQ = {'a': 'n(1−p/p₀) non sempre crescente', 'b': 'C o intercetta non positivi', 'c': "p/p₀ del monostrato fuori dall'intervallo",
            'd': '1/(√C+1) diverso di oltre il 10% dalla p/p₀ a cui n = nₘ'}


def sp_warnings(iso, P, R0):
    # sorption-core.js warnings
    W = []
    add = lambda lv, k, t: W.append({'lv': lv, 'k': k, 't': t})
    Rr = R0 or {}
    meta = iso.get('meta') or {}
    for p in (iso.get('problems') or []):
        add(p.get('lv'), p.get('k'), p.get('t'))
    A = sp_branch(iso, 'ads')
    if not sp_truthy(P['sigma']):
        if P['gas'] == 'CO2':
            add('warn', 'sigma', "CO₂ a 273 K: si usa per i micropori (DR, DFT), non per il BET (IUPAC 2015). Nessuna sezione molecolare predefinita: scrivila nei parametri se ti serve un'area")
        else:
            add('stop', 'sigma', "Adsorbato o sezione molecolare sconosciuti: l'area non si può calcolare")
    if len(A['x']) < 3:
        add('stop', 'pts', 'Meno di 3 punti nel ramo di adsorbimento')
    for i in range(1, len(A['x'])):
        if A['x'][i] < A['x'][i - 1] or A['n'][i] < A['n'][i - 1] - 1e-9 * abs(A['n'][i - 1]):
            add('warn', 'mono', 'Adsorbimento non monotono: la pressione o la quantità tornano indietro nel ramo di adsorbimento')
            break
    B = Rr.get('bet')
    if B:
        u = B.get('used')
        if not u:
            add('stop', 'bet', 'Nessun intervallo BET rispetta i criteri di Rouquerol (ISO 9277)')
        else:
            c = u.get('crit') or {}
            if u['npts'] < 3:
                add('stop', 'bet3', "Meno di 3 punti nell'intervallo BET")
            if not (u['C'] > 0):
                add('stop', 'betC', "C del BET ≤ 0: l'intervallo non ha significato")
            elif not c.get('ok'):
                for k in ['a', 'b', 'c', 'd']:
                    if not c.get(k):
                        add('stop', 'betR', "L'intervallo BET viola il criterio di Rouquerol (" + k + '): ' + _SP_ROUQ[k])
            if u['r'] < 0.999:
                add('warn', 'betr', 'Coefficiente di correlazione BET r = ' + js_fixed(u['r'], 5) + ' < 0,999')
            if u['npts'] < 5 and u['npts'] >= 3:
                add('warn', 'bet5', 'Intervallo BET con meno di 5 punti: ISO 9277 ne raccomanda almeno 5')
        if u and fin(u.get('area')) and fin(meta.get('mass_g')):
            tot = u['area'] * meta['mass_g']
            ma = Rr.get('minArea')
            if tot < (ma if sp_truthy(ma) else 1):
                add('warn', 'cell', 'Area totale nella cella ' + js_prec(tot, 3) + ' m²: sotto 1 m², il limite pratico con N₂ o Ar anche per gli strumenti manometrici accurati (IUPAC 2015, §5.2.1: circa 0,5–1 m²). Per aree così basse è raccomandato il kripton a 77 K')
    H = sp_hysteresis(iso)
    if H.get('open'):
        add('warn', 'close', "L'isoterma non chiude: il desorbimento resta sopra l'adsorbimento oltre il 2% a p/p₀ < 0,35")
    cl = H.get('close')
    if Rr.get('bjh') and Rr['bjh'].get('branch') == 'des' and P['gas'] == 'N2' and fin(cl) and cl >= 0.40 and cl <= 0.50:
        add('warn', 'tse', "Chiusura forzata dell'isteresi (p/p₀ ≈ 0,42–0,45 con N₂ a 77 K): il picco BJH del desorbimento verso 3,8–4 nm è un artefatto. Usa il ramo di adsorbimento")
    if P['stp'] == 'iupac' and sp_truthy(meta.get('software')):
        add('warn', 'stp', "STP diversa da quella del file: qui 0 °C e 100 kPa (22 711 cm³/mol), Kaomi usa 0 °C e 1 atm (22 414 cm³/mol); le aree cambiano dell'1,3%")
    iu = Rr.get('iupac')
    if Rr.get('langmuir') and iu and re.match(r'(II|IV)', iu['type']):
        add('warn', 'lang', "Langmuir su un'isoterma di tipo " + iu['type'] + ': il modello non ha significato fisico, il numero è solo un indice')
    if iu and re.match(r'I', iu['type']) and 'V' not in iu['type'] and P['gas'] == 'N2':
        add('warn', 'n2micro', 'Campione microporoso misurato con N₂ a 77 K: per i micropori è più affidabile Ar a 87 K (IUPAC 2015)')
    return W


# ============================== tutto insieme ==============================
def _sp_try(fn):
    # try { … } catch(e) { {err:String(e)} } dell'app; NonTrascritto passa sempre
    try:
        return fn()
    except NonTrascritto:
        raise
    except Exception as e:   # noqa: BLE001 — come il catch di JavaScript
        return {'err': 'Error: ' + str(e)}


def sp_analyze(iso, over, opt):
    # sorption-core.js analyze
    opt = opt or {}
    P = sp_params(iso, over)
    out = {'P': P}
    out['bet'] = _sp_try(lambda: sp_bet(iso, P, {'range': opt.get('betRange'), 'minPts': opt.get('minPts')}))
    out['langmuir'] = _sp_try(lambda: sp_langmuir(iso, P, opt.get('langRange')))

    def tpv():
        t = sp_total_pore_volume(iso, P, opt.get('tpvX') if sp_truthy(opt.get('tpvX')) else 0.99, opt.get('tpvMode'))
        if t and out['bet'].get('used') and fin(t.get('V')):
            t['dAvg'] = sp_avg_pore_diameter(t['V'], out['bet']['used']['area'])
        return t
    out['tpv'] = _sp_try(tpv)
    out['tplot'] = _sp_try(lambda: sp_t_plot(iso, P, opt.get('tRange'), opt.get('tModel')))
    if opt.get('alphaRef'):
        out['alpha'] = _sp_try(lambda: sp_alpha_s(iso, P, opt['alphaRef'], opt.get('alphaRange')))
    H = sp_hysteresis(iso)
    cl = H.get('close')
    defBranch = opt.get('bjhBranch') or ('ads' if (P['gas'] == 'N2' and fin(cl) and cl >= 0.40 and cl <= 0.50) else ('des' if len(sp_branch(iso, 'des')['x']) >= 3 else 'ads'))
    try:
        out['bjh'] = sp_bjh(iso, P, {'branch': defBranch, 'method': 'bjh', 'thick': opt.get('bjhThick')})
        out['dh'] = sp_bjh(iso, P, {'branch': defBranch, 'method': 'dh', 'thick': opt.get('bjhThick')})
    except NonTrascritto:
        raise
    except Exception as e:   # noqa: BLE001
        out['bjh'] = {'err': 'Error: ' + str(e)}
    try:
        out['dr'] = sp_drda(iso, P, opt.get('drRange'), 'dr')
        out['da'] = sp_drda(iso, P, opt.get('drRange'), 'da')
    except NonTrascritto:
        raise
    except Exception as e:   # noqa: BLE001
        out['dr'] = {'err': 'Error: ' + str(e)}
    if opt.get('kernel'):
        out['dft'] = _sp_try(lambda: sp_dft_fit(iso, opt['kernel'], {'lambda': opt.get('lambda')}))
    out['iupac'] = sp_iupac_suggest(iso, P, out['bet'])
    bj = out.get('bjh')
    out['warnings'] = sp_warnings(iso, P, {'bet': out['bet'], 'bjh': bj if (bj and not bj.get('err')) else None, 'langmuir': out['langmuir'],
                                           'iupac': out['iupac'], 'minArea': opt.get('minArea')})
    return out


# ============================== CSV dei risultati ==============================
def sp_g(v):
    # g dei CSV: +(+v).toPrecision(8), '' se mancante
    if v is None or not fin(v):
        return ''
    return float(js_prec(float(v), 8))


def sp_csv_rows(iso, A, en):
    # sorption-core.js csvRows
    T = lambda it, e: e if en else it
    g = sp_g
    gs = lambda v: sp_tmpl(g(v))
    rows = []
    P = A['P']
    rows.append([T('Sezione', 'Section'), T('Grandezza', 'Quantity'), T('Valore', 'Value'), T('Unità', 'Unit'), T('Fonte o nota', 'Source or note')])

    def par(k, lab, u, v):
        note = (P['src'].get(k) or '') + ((': ' + (P['refEn'][k] if en else P['ref'][k])) if P['ref'].get(k) else '')
        rows.append([T('Parametri', 'Parameters'), lab, g(v), u, note])
    rows.append([T('Parametri', 'Parameters'), T('Adsorbato', 'Adsorbate'), P['gasName'] or '', '', P['src'].get('sigma') or ''])
    par('sigma', T('Sezione molecolare', 'Cross-sectional area'), 'nm²', P['sigma'])
    par('T', T('Temperatura', 'Temperature'), 'K', P['T'])
    par('rhoL', T('Densità del liquido', 'Liquid density'), 'g/cm³', P['rhoL'])
    par('gamma', T('Tensione superficiale', 'Surface tension'), 'mN/m', P['gamma'])
    par('M', T('Massa molare', 'Molar mass'), 'g/mol', P['M'])
    rows.append([T('Parametri', 'Parameters'), 'STP', P['vmol'], 'cm³/mol', '0 °C, 100 kPa' if P['stp'] == 'iupac' else '0 °C, 101,325 kPa (Kaomi)'])
    rows.append([T('Parametri', 'Parameters'), T('Modello di spessore', 'Thickness model'), SP_THICK_NAME.get(P['thick'], P['thick']), '', P['src'].get('thick') or ''])
    bet = A.get('bet') or {}
    B = bet.get('used')
    if B:
        crit = B.get('crit')
        rows += [['BET', T('Area specifica', 'Specific surface area'), g(B['area']), 'm²/g', 'p/p₀ ' + gs(B['x0']) + '–' + gs(B['x1']) + ', ' + str(B['npts']) + ' ' + T('punti', 'points')],
                 ['BET', 'C', g(B['C']), '', ''], ['BET', 'nₘ', g(B['nm']), 'cm³ STP/g', ''], ['BET', T('Pendenza', 'Slope'), g(B['slope']), '', ''],
                 ['BET', T('Intercetta', 'Intercept'), g(B['icpt']), '', ''],
                 ['BET', 'r', g(B['r']), '', T('criteri di Rouquerol', 'Rouquerol criteria') + ': ' + ' '.join(k + ('✓' if (crit and crit.get(k)) else '✗') for k in ['a', 'b', 'c', 'd'])]]
    if bet.get('instr'):
        I = bet['instr']
        rows.append(['BET', T("Area con l'intervallo dello strumento", 'Area with the instrument range'), g(I['area']), 'm²/g',
                     'p/p₀ ' + gs(I['x0']) + '–' + gs(I['x1']) + '; ' + T('differenza', 'difference') + ' ' + gs(bet.get('diffInstrPct')) + ' %'])
    Lg = A.get('langmuir')
    if Lg and not Lg.get('err'):
        rows += [['Langmuir', T('Area (lineare)', 'Area (linear)'), g(Lg['lin']['area']), 'm²/g', 'p/p₀ ' + '–'.join('' if v is None else sp_tmpl(v) for v in Lg['range'])],
                 ['Langmuir', T('Area (non lineare)', 'Area (non-linear)'), g(Lg['nl']['area']), 'm²/g', ''], ['Langmuir', 'K', g(Lg['nl']['K']), '', '']]
    V = A.get('tpv')
    if V and not V.get('err'):
        rows += [[T('Pori', 'Pores'), T('Volume totale dei pori', 'Total pore volume'), g(V['V']), 'cm³/g', 'p/p₀ ' + gs(V['x']) + '; d < ' + gs(V['dmax']) + ' Å'],
                 [T('Pori', 'Pores'), T('Diametro medio 4V/S', 'Average diameter 4V/S'), g(V.get('dAvg')), 'Å', '']]
    t = A.get('tplot')
    if t and not t.get('err'):
        rows += [['t-plot', T('Area esterna', 'External area'), g(t['Sext']), 'm²/g', t['modelName']],
                 ['t-plot', T('Volume dei micropori', 'Micropore volume'), g(t['Vmicro']), 'cm³/g', 'r ' + gs(t['r'])]]
    for k, lab in [['bjh', 'BJH'], ['dh', 'DH']]:
        b = A.get(k)
        if b and not b.get('err'):
            rows += [[lab, T('Volume cumulato', 'Cumulative volume'), g(b['Vtot']), 'cm³/g', T('ramo', 'branch') + ' ' + b['branch']],
                     [lab, T('Area cumulata', 'Cumulative area'), g(b['Atot']), 'm²/g', ''], [lab, T('Moda dV(d)', 'Mode dV(d)'), g(b['mode']), 'Å', '']]
    for k, lab in [['dr', 'DR'], ['da', 'DA']]:
        d = A.get(k)
        if d and not d.get('err'):
            rows += [[lab, 'W₀', g(d['W0']), 'cm³/g', 'p/p₀ ' + gs(d['range'][0]) + '–' + gs(d['range'][1])], [lab, 'E', g(d['E']), 'kJ/mol', ''], [lab, 'n', g(d['n']), '', '']]
    if A.get('dft') and not A['dft'].get('err'):
        rows.append(['DFT', T('Volume', 'Volume'), g(A['dft']['Vtot']), 'cm³/g', A['dft']['label']])
    if A.get('iupac'):
        iu = A['iupac']
        rows.append([T('Isoterma', 'Isotherm'), T('Tipo IUPAC (suggerimento)', 'IUPAC type (suggestion)'), iu['type'] + ((' · ' + iu['hyst']) if iu['hyst'] else ''), '', '; '.join(iu['why'])])
    for w in (A.get('warnings') or []):
        rows.append([T('Avvisi', 'Warnings'), T('grave', 'serious') if w['lv'] == 'stop' else T('attenzione', 'warning'), '', '', w['t']])
    rows.append([])
    rows.append([T('Ramo', 'Branch'), 'p/p₀', T('Quantità', 'Amount'), 'cm³ STP/g', 'mmol/g'])
    for br in ['ads', 'des']:
        b = sp_branch(iso, br)
        for i, x in enumerate(b['x']):
            n = b['n'][i]
            rows.append([br, g(x), g(n), g(n), g(n / VMOL_STP * 1000)])
    return rows


# ============================== ingresso: f.iso e f.an.sorp come nell'app ==============================
def _sp_numlist(a):
    return None if a is None else [NAN if v is None else float(v) for v in a]


def sp_iso_from_json(iso):
    # f.iso letto da JSON: null (NaN in JSON.stringify) torna NaN, gli interi diventano double
    q = dict(iso)
    q['p'] = _sp_numlist(iso['p'])
    q['n'] = _sp_numlist(iso['n'])
    q['p0'] = _sp_numlist(iso.get('p0'))
    q['meta'] = dict(iso.get('meta') or {})
    return q


def sp_run_opt(opt, alpha_ref=None, kernel=None):
    # sorption-ui.js run: opzioni passate ad analyze da f.an.sorp
    o = opt or {}
    out = {k: o.get(k) for k in ['betRange', 'langRange', 'tRange', 'tModel', 'tpvX', 'tpvMode', 'bjhBranch', 'bjhThick', 'drRange', 'lambda']}
    K = kernel if kernel is not None else o.get('kernel')
    if K:
        K = {'name': K.get('name'), 'x': _sp_numlist(K['x']), 'w': _sp_numlist(K['w']), 'K': [_sp_numlist(r) for r in K['K']]}
    out['kernel'] = K
    ar = alpha_ref if alpha_ref is not None else o.get('alphaRef')
    if ar:
        if ar.get('iso'):
            b = sp_branch(sp_iso_from_json(ar['iso']), 'ads')
            ar = {'x': b['x'], 'n': b['n'], 'S': ar.get('S')}
        else:
            ar = {'x': _sp_numlist(ar['x']), 'n': _sp_numlist(ar['n']), 'S': ar.get('S')}
    out['alphaRef'] = ar or None
    return out


def sorp_analyze(iso, over=None, opt=None, alpha_ref=None, kernel=None):
    # sorption-ui.js run + sorption-core.js analyze
    return sp_analyze(sp_iso_from_json(iso), over or {}, sp_run_opt(opt, alpha_ref, kernel))


def sorp_csv_text(iso, over=None, opt=None, alpha_ref=None, kernel=None, en=False):
    """sorption-ui.js csvText (AcchSorp.csvText): iso = f.iso; over = f.an.sorp.over; opt = f.an.sorp;
    alpha_ref = {x, n, S} (ramo di adsorbimento del riferimento e area alphaS) oppure {iso, S}; kernel = f.an.sorp.kernel."""
    q = sp_iso_from_json(iso)
    A = sp_analyze(q, over or {}, sp_run_opt(opt, alpha_ref, kernel))
    return sorp_csv(sp_csv_rows(q, A, en), en)


def _sp_safe_name(s):
    # sorption-ui.js csvName: estensione tolta, caratteri vietati, 80 unità UTF-16
    s = re.sub(r'\.[^.]{1,4}\Z', '', s, count=1)
    s = re.sub(r'[\\/:*?"<>|\u0000-\u001f]+', '_', s)
    u = s.encode('utf-16-le', 'surrogatepass')
    if len(u) > 160:
        s = u[:160].decode('utf-16-le', 'surrogatepass')
    return s


def sorp_csv_name(title_or_name, en=False):
    # sorption-ui.js csvName: String(f.title||f.name)
    return ('physisorption_' if en else 'fisisorbimento_') + _sp_safe_name(str(title_or_name)) + '.csv'


# ============================== CHEMISORBIMENTO ==============================
def ch_metal_dispersion(o):
    # sorption-core.js metalDispersion
    W = []
    M = dict(SP_METALS.get(o.get('metal')) or {})
    for k in ['M', 'rho', 'am']:
        if o.get(k) is not None:
            M[k] = o[k]
    if not sp_gt(o.get('loading'), 0):
        W.append({'lv': 'stop', 't': 'Dispersione senza carico metallico'})
    if not sp_gt(o.get('SF'), 0):
        W.append({'lv': 'stop', 't': 'Dispersione senza stechiometria'})
    if not (o.get('uptake') is not None and o['uptake'] >= 0):
        W.append({'lv': 'stop', 't': 'Quantità adsorbita mancante'})
    if W:
        return {'err': 'dati', 'warn': W}
    MM, rho, am = sp_num(M.get('M')), M.get('rho'), M.get('am')
    Ns = o['uptake'] * 1e-6 * SORP_NA * o['SF']
    wmet = o['loading'] / 100
    D = jdiv(Ns * MM, SORP_NA * wmet)
    vm = MM / (rho * SORP_NA) * 1e21 if (sp_truthy(M.get('M')) and sp_truthy(rho)) else NAN
    f = o.get('shape') if sp_truthy(o.get('shape')) else 6
    areaS = Ns * am * 1e-18 if sp_truthy(am) else NAN
    areaM = jdiv(areaS, wmet)
    d = jdiv(f * vm, am * D) if (fin(vm) and sp_truthy(am)) else NAN
    if D > 1:
        W.append({'lv': 'warn', 't': 'Dispersione oltre il 100%: spillover, stechiometria o carico sbagliati'})
    W.append({'lv': 'warn', 't': 'Diametro valido solo per la forma ipotizzata (fattore 6, sfera o cubo con una faccia sul supporto)' if f == 6
              else 'Diametro valido solo per la forma ipotizzata (fattore ' + sp_tmpl(f) + ')'})
    return {'Ns': Ns, 'D': D, 'Dpct': 100 * D, 'areaSample': areaS, 'areaMetal': areaM, 'd': d, 'vm': vm, 'am': am, 'M': M.get('M'), 'shape': f, 'warn': W}


def ch_pulse_uptake(o):
    # sorption-core.js pulseUptake
    A = o.get('areas') or []
    W = []
    if not sp_gt(o.get('loopVol'), 0):
        W.append({'lv': 'stop', 't': 'Quantità assoluta senza volume del loop'})
    if len(A) < 3:
        W.append({'lv': 'stop', 't': 'Servono almeno 3 impulsi'})
    if W:
        return {'err': 'dati', 'warn': W}
    k = o.get('nSat') if sp_truthy(o.get('nSat')) else 3
    tol = o['tol'] if o.get('tol') is not None else 0.02
    ki = int(k)   # A.slice(-k): l'indice si tronca verso zero; -0 vuol dire dall'inizio
    last = A[max(0, len(A) - ki):] if ki > 0 else list(A)
    s = 0
    for v in last:
        s = s + v
    mean = jdiv(s, len(last))
    sat = all(abs(v - mean) <= tol * mean for v in last)
    if not sat:
        W.append({'lv': 'stop', 't': 'Impulsi non saturati: gli ultimi ' + sp_tmpl(k) + ' differiscono più del ' + js_fixed(tol * 100, 0) + '%'})
    Asat = o['Asat'] if sp_gt(o.get('Asat'), 0) else mean
    T = o.get('T') if sp_truthy(o.get('T')) else 298.15
    p = o.get('p') if sp_truthy(o.get('p')) else 101.325
    fr = o['frac'] if o.get('frac') is not None else 1
    vStp = o['loopVol'] * (p / 101.325) * jdiv(273.15, T) * fr
    molPerPulse = vStp / VMOL_STP
    frac = 0
    per = []
    for a in A:
        u = js_max(0, jdiv(Asat - a, Asat))
        frac += u
        per.append(u)
    umol = frac * molPerPulse * 1e6
    perG = umol / o['mass_g'] if sp_gt(o.get('mass_g'), 0) else NAN
    return {'Asat': Asat, 'saturated': sat, 'per': per, 'uptakeUmol': umol, 'uptakeUmolPerG': perG, 'vStpPulse': vStp, 'warn': W}


def ch_static(comb, rep, opt):
    # sorption-core.js staticChem: combinata − ripetuta, estrapolate a p = 0 (ASTM D3908)
    opt = opt or {}
    pa = opt['pa'] if opt.get('pa') is not None else -INF
    pb = opt['pb'] if opt.get('pb') is not None else INF

    def sel(s):
        i = [k for k in range(len(s['p'])) if s['p'][k] >= pa and s['p'][k] <= pb]
        return {'p': [s['p'][k] for k in i], 'n': [s['n'][k] for k in i]}
    c = sel(comb)
    r = sel(rep) if rep else None
    Lc = sp_linfit(c['p'], c['n'])
    if not Lc:
        return {'err': 'pochi'}
    Lr = sp_linfit(r['p'], r['n']) if (r and len(r['p']) >= 2) else None
    return {'total': Lc['icpt'], 'weak': Lr['icpt'] if Lr else None, 'strong': Lc['icpt'] - Lr['icpt'] if Lr else Lc['icpt'], 'Lc': Lc, 'Lr': Lr,
            'method': 'estrapolazione lineare a p = 0 (ASTM D3908)'}


def ch_tpx(o):
    # sorption-core.js tpx: TPR, TPO, TPD con base lineare tra le finestre agli estremi
    T, s = o['T'], o['s']
    n = len(T)
    W = []
    if n < 10:
        return {'err': 'pochi'}
    t = o['t'] if (o.get('t') and len(o['t']) == n) else None
    wf = o.get('edge') if sp_truthy(o.get('edge')) else 0.05
    e = js_max(2, js_round(n * wf))
    e = int(e)
    ix = list(range(e)) + [n - 1 - k for k in range(e)]
    if max(ix) >= n or min(ix) < 0:
        raise NonTrascritto('TPx con finestre più lunghe della curva non trascritto: in JS gli indici fuori dànno undefined')
    xv = t if t else T
    L = sp_linfit([xv[i] for i in ix], [s[i] for i in ix])

    def base(i):
        return L['icpt'] + L['slope'] * xv[i] if L else 0
    y = [v - base(i) for i, v in enumerate(s)]
    beta = o.get('beta') if sp_truthy(o.get('beta')) else None
    if t:
        F = sp_linfit(t, T)
        if F:
            beta = F['slope']
            mx = 0
            for i in range(n):
                mx = js_max(mx, abs(T[i] - F['icpt'] - F['slope'] * t[i]))
            if mx > 0.01 * abs(T[n - 1] - T[0]):
                W.append({'lv': 'warn', 't': 'Rampa non lineare: controlla la temperatura misurata'})
    else:
        W.append({'lv': 'warn', 't': "Senza il tempo l'area si calcola con la rampa nominale: controlla che T sia quella misurata"})
    area = 0
    for i in range(1, n):
        dx = t[i] - t[i - 1] if t else jdiv(T[i] - T[i - 1], beta if sp_truthy(beta) else 1)
        area += (y[i] + y[i - 1]) / 2 * dx
    pk = 0
    for i in range(1, n):
        if y[i] > y[pk]:
            pk = i
    hmax = y[pk]
    peaks = []
    for i in range(2, n - 2):
        if y[i] > y[i - 1] and y[i] >= y[i + 1] and y[i] > 0.1 * hmax:
            if not peaks or abs(T[i] - T[peaks[-1]]) > 5:
                peaks.append(i)
            elif y[i] > y[peaks[-1]]:
                peaks[-1] = i
    drift = abs(L['slope'] * (xv[n - 1] - xv[0])) if L else 0
    if hmax > 0 and drift > 0.05 * hmax:
        W.append({'lv': 'warn', 't': 'Deriva della linea di base ' + js_fixed(100 * drift / hmax, 1) + "% dell'altezza del picco (oltre il 5%)"})
    out = {'area': area, 'y': y, 'base': [base(i) for i in range(len(s))], 'Tm': T[pk], 'peaks': [{'T': T[i], 'h': y[i]} for i in peaks], 'beta': beta, 'warn': W}
    if sp_gt(o.get('factor'), 0):
        out['umol'] = area * o['factor']
        if sp_gt(o.get('mass_g'), 0):
            out['umolPerG'] = out['umol'] / o['mass_g']
        if sp_gt(o.get('theo'), 0):
            out['reduction'] = out['umol'] / o['theo']
    else:
        W.append({'lv': 'stop', 't': 'Quantità assoluta senza fattore TCD tarato: il risultato è solo qualitativo'})
    return out


def ch_tcd_factor(o):
    # sorption-core.js tcdFactor: µmol di gas per unità d'area da uno standard (CuO → Cu)
    mol = o['mass_mg'] / 1000 / (o.get('Mstd') if sp_truthy(o.get('Mstd')) else 79.545) * (o.get('stoich') if sp_truthy(o.get('stoich')) else 1) * 1e6
    return {'factor': jdiv(mol, o['area']), 'umol': mol, 'std': o.get('std') or 'CuO', 'lot': o.get('lot') or '', 'date': o.get('date') or ''}


def ch_kissinger(lst):
    # sorption-core.js kissinger: [{beta (K/min), Tm (K)}]
    if not lst or len(lst) < 3:
        return {'err': 'rampe', 'warn': [{'lv': 'stop', 't': 'Kissinger con meno di 3 rampe'}]}
    F = sp_linfit([jdiv(1, o['Tm']) for o in lst], [m_log(jdiv(o['beta'], o['Tm'] * o['Tm'])) for o in lst])
    if not F:
        return {'err': 'fit'}
    return {'E': -F['slope'] * SORP_R / 1000, 'uE': F['seS'] * SORP_R / 1000, 'r': F['r'], 'A': m_exp(F['icpt']) * (-F['slope']), 'warn': []}


def ch_redhead(Tm, beta, nu):
    # sorption-core.js redhead
    v = nu if sp_truthy(nu) else 1e13
    b = beta / 60
    return {'E': SORP_R * Tm * (m_log(jdiv(v * Tm, b)) - 3.64) / 1000, 'nu': v,
            'warn': [{'lv': 'warn', 't': 'Redhead con ν supposto (' + js_expo(v, 0) + ' s⁻¹): il valore dipende da questa ipotesi'}]}


def ch_monti_baiker(o):
    # sorption-core.js montiBaiker
    C0 = o['c0'] if o.get('c0') is not None else o['frac'] * 1e6 / VMOL_STP
    K = jdiv(o['S0'], o['flow'] * C0)
    P = K * o['beta'] / 60 if o.get('beta') is not None else None
    return {'K': K, 'P': P, 'warn': [{'lv': 'warn', 't': 'Parametro di Monti–Baiker K = ' + js_fixed(K, 0) + ' s fuori da 55–140 s'}] if (K < 55 or K > 140) else []}


def ch_analyze(c, o):
    # sorption-core.js chemAnalyze
    o = o or {}
    out = {'warn': []}
    m = c.get('meta') or {}
    kind = c.get('kind')
    nn = lambda k: o[k] if o.get(k) is not None else m.get(k)
    if kind == 'pulse':
        out['pulse'] = ch_pulse_uptake({'areas': c.get('areas'), 'loopVol': nn('loopVol'),
                                        'T': o.get('loopT') if sp_truthy(o.get('loopT')) else (m.get('loopT') if sp_truthy(m.get('loopT')) else 298.15),
                                        'p': o.get('p') if sp_truthy(o.get('p')) else 101.325,
                                        'frac': o['frac'] if o.get('frac') is not None else (m['frac'] if m.get('frac') is not None else 1),
                                        'nSat': o.get('nSat'), 'tol': o.get('tol'), 'mass_g': nn('mass_g')})
        out['uptake'] = out['pulse'].get('uptakeUmolPerG')
        out['warn'] += out['pulse'].get('warn') or []
    elif kind == 'static':
        out['stat'] = ch_static(c['comb'], c.get('rep'), {'pa': o.get('pa'), 'pb': o.get('pb')})
        if not out['stat'].get('err'):
            out['uptake'] = out['stat']['strong'] / VMOL_STP * 1e6
            if not c.get('rep'):
                out['warn'].append({'lv': 'warn', 't': "Senza isoterma ripetuta: l'uptake è quello totale (forte + debole)"})
    else:
        b = o.get('beta') if sp_truthy(o.get('beta')) else (m.get('ramp') if sp_truthy(m.get('ramp')) else None)
        out['tpx'] = ch_tpx({'t': c.get('t'), 'T': list(c['T']), 's': c['s'], 'beta': b, 'factor': o.get('factor'), 'mass_g': nn('mass_g'), 'theo': o.get('theo')})
        out['warn'] += out['tpx'].get('warn') or []
        X = out['tpx']
        if X and fin(X.get('Tm')):
            bb = X.get('beta') if sp_truthy(X.get('beta')) else (b if sp_truthy(b) else 10)
            out['redhead'] = ch_redhead(X['Tm'], bb, o.get('nu'))
            out['warn'] += out['redhead']['warn']
        if sp_gt(o.get('S0'), 0) and sp_gt(o.get('flow'), 0) and (sp_gt(o.get('frac'), 0) or sp_gt(m.get('frac'), 0)):
            out['mb'] = ch_monti_baiker({'S0': o['S0'], 'flow': o['flow'] / 60, 'frac': o['frac'] if sp_truthy(o.get('frac')) else m.get('frac'), 'beta': X.get('beta')})
            out['warn'] += out['mb']['warn']
        if kind == 'TPR' and not o.get('coldTrap'):
            out['warn'].append({'lv': 'warn', 't': "Acqua nel TCD: senza trappola fredda il segnale del TPR comprende l'acqua prodotta"})
    if o.get('disp') is not None:
        d = dict(o['disp'])
        if d.get('uptake') is None and out.get('uptake') is not None:
            d['uptake'] = out['uptake']
        if d.get('metal') is None:
            d['metal'] = m.get('metal')
        if d.get('loading') is None:
            d['loading'] = m.get('loading')
        if d.get('SF') is None:
            d['SF'] = m.get('SF')
        out['disp'] = ch_metal_dispersion(d)
        out['warn'] += out['disp'].get('warn') or []
    return out


def ch_csv_rows(c, A, en):
    # sorption-core.js chemCsvRows
    T = lambda it, e: e if en else it
    g = sp_g
    rows = [[T('Sezione', 'Section'), T('Grandezza', 'Quantity'), T('Valore', 'Value'), T('Unità', 'Unit'), T('Nota', 'Note')]]
    rows.append([T('Misura', 'Measurement'), T('Tipo', 'Kind'), c.get('kind'), '', ''])
    X = A.get('tpx')
    if X:
        rows += [['TPx', T('Area (base lineare)', 'Area (linear baseline)'), g(X.get('area')), T('segnale·min', 'signal·min'), ('β ' + sp_tmpl(g(X['beta'])) + ' K/min') if sp_truthy(X.get('beta')) else ''],
                 ['TPx', 'Tm', g(X.get('Tm')), 'K', ''],
                 ['TPx', T('Quantità', 'Amount'), g(X.get('umol')), 'µmol', T('senza fattore TCD', 'without TCD factor') if X.get('umol') is None else ''],
                 ['TPx', T('Grado di riduzione', 'Degree of reduction'), g(X.get('reduction')), '', '']]
        for i, q in enumerate(X.get('peaks') or []):
            rows.append(['TPx', T('Picco ', 'Peak ') + str(i + 1), g(q['T']), 'K', ''])
    if A.get('redhead'):
        rows.append(['Redhead', 'E', g(A['redhead']['E']), 'kJ/mol', 'ν ' + js_expo(A['redhead']['nu'], 0) + ' s⁻¹ (' + T('supposto', 'assumed') + ')'])
    if A.get('mb'):
        rows.append(['Monti–Baiker', 'K', g(A['mb']['K']), 's', '55–140 s'])
    Pu = A.get('pulse')
    if Pu and not Pu.get('err'):
        rows += [[T('Impulsi', 'Pulses'), 'A_sat', g(Pu['Asat']), '', T('saturati', 'saturated') if Pu['saturated'] else T('non saturati', 'not saturated')],
                 [T('Impulsi', 'Pulses'), 'uptake', g(Pu['uptakeUmol']), 'µmol', ''], [T('Impulsi', 'Pulses'), 'uptake', g(Pu['uptakeUmolPerG']), 'µmol/g', '']]
    S = A.get('stat')
    if S and not S.get('err'):
        rows += [[T('Statico', 'Static'), T('totale', 'total'), g(S['total']), 'cm³ STP/g', S['method']], [T('Statico', 'Static'), T('debole', 'weak'), g(S['weak']), 'cm³ STP/g', ''],
                 [T('Statico', 'Static'), T('forte', 'strong'), g(S['strong']), 'cm³ STP/g', '']]
    D = A.get('disp')
    if D and not D.get('err'):
        rows += [[T('Metallo', 'Metal'), T('Dispersione', 'Dispersion'), g(D['Dpct']), '%', ''],
                 [T('Metallo', 'Metal'), T('Area metallica', 'Metal area'), g(D['areaSample']), T('m²/g campione', 'm²/g sample'), ''],
                 [T('Metallo', 'Metal'), T('Area metallica', 'Metal area'), g(D['areaMetal']), T('m²/g metallo', 'm²/g metal'), ''],
                 [T('Metallo', 'Metal'), T('Diametro medio', 'Mean diameter'), g(D['d']), 'nm', T('fattore di forma ', 'shape factor ') + sp_tmpl(D['shape'])]]
    for w in (A.get('warn') or []):
        rows.append([T('Avvisi', 'Warnings'), T('grave', 'serious') if w['lv'] == 'stop' else T('attenzione', 'warning'), '', '', w['t']])
    return rows


def ch_from_json(chem):
    # f.chem letto da JSON: null → NaN nelle colonne numeriche
    c = dict(chem)
    for k in ['areas', 't', 'T', 's']:
        if c.get(k) is not None:
            c[k] = _sp_numlist(c[k])
    for k in ['comb', 'rep']:
        if c.get(k):
            c[k] = {'p': _sp_numlist(c[k]['p']), 'n': _sp_numlist(c[k]['n'])}
    c['meta'] = dict(c.get('meta') or {})
    return c


def chem_analyze(chem, opzioni=None):
    # sorption-ui.js chemRun: la dispersione si calcola se c'è il metallo o per impulsi e statico
    c = ch_from_json(chem)
    o = dict(opzioni or {})
    disp = dict(o.get('disp') or {}) if (o.get('disp') or sp_truthy(c['meta'].get('metal')) or c.get('kind') in ('pulse', 'static')) else None
    o['disp'] = disp
    return c, ch_analyze(c, o)


def chem_csv_text(chem, opzioni=None, en=False):
    """sorption-ui.js chemCsvText (AcchChem.csvText): chem = f.chem; opzioni = f.an.chem."""
    c, A = chem_analyze(chem, opzioni)
    return sorp_csv(ch_csv_rows(c, A, en), en)


def chem_csv_name(title_or_name, en=False):
    # sorption-ui.js chemCsvName
    return ('chemisorption_' if en else 'chemisorbimento_') + _sp_safe_name(str(title_or_name)) + '.csv'
