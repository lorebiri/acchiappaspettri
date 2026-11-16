# ---------------------------------------------------------------------------------------------
# Modulo acch_chemometria: deconvoluzione, PCA con cluster di Ward, PLS e miscele (NNLS).
# Va concatenato DOPO acch_ricetta.py: usa i suoi helper (fin, js_round, js_max, js_min, jdiv,
# num_prec, dec_num, interp_y, nearest_idx, noise_sigma, sg_smooth, sg_noise_gain,
# peak_candidates, half_width_pts, peak_width_pts, deriv_ls, chol, chol_solve, lin_reg,
# f_inv, transform_y, baseline_arpls, analysis_csv, view_peaks, NonTrascritto).
# Ogni funzione cita la funzione dell'app da cui deriva (index.html).
# Stesse operazioni nello stesso ordine dell'app. exp, log, sin e cos: m_exp, m_log, m_sin, m_cos
# di acch_math.py (concatenato prima), come nel motore JavaScript scelto con imposta_motore.
# Nomi con il prefisso cm_: altri moduli concatenati (acch_tecnica, acch_lettori) definiscono funzioni con lo stesso nome
# (fit_peaks, pv_at, hidden_bands, arr_max, _fl) e, se vengono dopo, le sostituirebbero in silenzio.
# ---------------------------------------------------------------------------------------------


JS_LN2 = 0.6931471805599453   # Math.LN2
JS_PI = 3.141592653589793     # Math.PI


def _cm_fl(a):
    # i numeri di JavaScript sono double: niente interi esatti di Python nei calcoli
    return [float(v) for v in a]


def chol_inv(L):
    # index.html cholInv: colonne dell'inversa (out[j][i] = (A⁻¹)[i][j])
    p = len(L)
    out = []
    for j in range(p):
        e = [0.0] * p
        e[j] = 1.0
        out.append(chol_solve(L, e))
    return out


def _cm_arr_max(a, f=None):
    # index.html arrMax
    m = -INF
    for v in a:
        w = f(v) if f else v
        if w > m:
            m = w
    return m


# ============================== deconvoluzione ==============================
CM_SQ_LN2_PI = math.sqrt(JS_LN2 / JS_PI)   # index.html CM_SQ_LN2_PI


def cm_pv_at(x, c, w, eta):
    # index.html pvAt: pseudo-Voigt ad area unitaria
    t = (x - c) / w
    g = 2 * CM_SQ_LN2_PI / w * m_exp(-4 * JS_LN2 * t * t)
    l = 2 / (JS_PI * w) / (1 + 4 * t * t)
    return eta * l + (1 - eta) * g


def cm_pv_peak_h(A, w, eta):
    # index.html pvPeakH
    return A * (eta * 2 / (JS_PI * w) + (1 - eta) * 2 * CM_SQ_LN2_PI / w)


def _n0(v):
    # null di JavaScript nelle operazioni aritmetiche vale 0
    return 0.0 if v is None else v


def cm_fit_peaks(xs, ys, seeds, opt=None):
    """index.html fitPeaks: Levenberg–Marquardt con vincoli; seeds = [{'x', 'w'}]."""
    xs, ys = _cm_fl(xs), _cm_fl(ys)
    if not nums_ok(xs) or not nums_ok(ys) or not (abs(xs[-1] - xs[0]) > 0):
        return None
    opt = opt or {}
    prof = opt.get('profile') or 'pv'
    n0 = len(xs)
    step = max(1, math.ceil(n0 / (opt.get('maxPts') or 2500)))
    X = xs[0:n0:step]
    Y = ys[0:n0:step]
    n, k = len(X), len(seeds)
    if not k or n < 4 * k + 4:
        return None
    x0, x1 = X[0], X[n - 1]
    xm = (x0 + x1) / 2
    xr = (abs(x1 - x0) / 2) or 1
    dx = abs(x1 - x0) / (n - 1)
    free_eta = prof == 'pv'
    np_ = 4 if free_eta else 3
    NB = 3
    P = k * np_ + NB
    p, lo, hi = [0.0] * P, [0.0] * P, [0.0] * P
    e = max(1, js_round(n * 0.03))
    ya = yb = 0.0
    for i in range(e):
        ya += Y[i]
        yb += Y[n - 1 - i]
    ya /= e
    yb /= e
    p[0] = (ya + yb) / 2
    p[1] = (yb - ya) / 2
    for a in range(NB):
        lo[a] = -INF
        hi[a] = INF
    deg = {'none': -1, 'const': 0, 'lin': 1, 'quad': 2}.get(opt.get('base') or 'lin')
    if deg is not None:
        for a in range(deg + 1, NB):
            p[a] = 0.0
            lo[a] = hi[a] = 0.0
    span = abs(x1 - x0)
    for j, s in enumerate(seeds):
        o = NB + j * np_
        sx = float(s['x'])
        sw = s.get('w')
        w = js_max(sw if (sw is not None and sw == sw and sw != 0) else span / 20, 3 * dx)
        base = p[0] + p[1] * (sx - xm) / xr
        h = js_max(interp_y(X, Y, sx) - base, 1e-12)
        eta = 1.0 if prof == 'lor' else (0.0 if prof == 'gauss' else 0.5)
        p[o] = h / ((eta * 2 / (JS_PI * w) + (1 - eta) * 2 * CM_SQ_LN2_PI / w))
        p[o + 1] = sx
        p[o + 2] = w
        lo[o] = 0.0
        hi[o] = INF
        lo[o + 1] = js_max(min(x0, x1), sx - 1.5 * w)
        hi[o + 1] = js_min(max(x0, x1), sx + 1.5 * w)
        lo[o + 2] = 2 * dx
        hi[o + 2] = span
        if free_eta:
            p[o + 3] = eta
            lo[o + 3] = 0.0
            hi[o + 3] = 1.0
    eta_fix = 1.0 if prof == 'lor' else 0.0

    def eta_of(q, o):
        return q[o + 3] if free_eta else eta_fix

    def model(q, xx):
        u = (xx - xm) / xr
        v = q[0] + q[1] * u + q[2] * u * u
        for j in range(k):
            o = NB + j * np_
            v += q[o] * cm_pv_at(xx, q[o + 1], q[o + 2], eta_of(q, o))
        return v

    def ssr(q):
        s = 0.0
        for i in range(n):
            r = Y[i] - model(q, X[i])
            s += r * r
        return s

    def normal(q):
        JTJ = [[0.0] * P for _ in range(P)]
        JTr = [0.0] * P
        row = [0.0] * P
        for i in range(n):
            x = X[i]
            u = (x - xm) / xr
            m = q[0] + q[1] * u + q[2] * u * u
            row[0] = 1.0
            row[1] = u
            row[2] = u * u
            for j in range(k):
                o = NB + j * np_
                A, c, w, eta = q[o], q[o + 1], q[o + 2], eta_of(q, o)
                t = (x - c) / w
                uu = 1 + 4 * t * t
                G = 2 * CM_SQ_LN2_PI / w * m_exp(-4 * JS_LN2 * t * t)
                L = 2 / (JS_PI * w) / uu
                S = eta * L + (1 - eta) * G
                m += A * S
                row[o] = S
                row[o + 1] = A * (eta * L * 8 * t / (w * uu) + (1 - eta) * G * 8 * JS_LN2 * t / w)
                row[o + 2] = A * (eta * L * (-1 + 8 * t * t / uu) / w + (1 - eta) * G * (-1 + 8 * JS_LN2 * t * t) / w)
                if free_eta:
                    row[o + 3] = A * (L - G)
            r = Y[i] - m
            for a in range(P):
                ra = row[a]
                if ra == 0:
                    continue
                JTr[a] += ra * r
                Ra = JTJ[a]
                for b in range(a, P):
                    Ra[b] += ra * row[b]
        for a in range(P):
            for b in range(a):
                JTJ[a][b] = JTJ[b][a]
        return JTJ, JTr

    def fixed(a):
        return lo[a] == hi[a]

    cur = ssr(p)
    mu = 1e-3
    it = 0
    max_iter = opt.get('maxIter') or 300
    while it < max_iter:
        JTJ, JTr = normal(p)
        mx = 0.0
        for a in range(P):
            mx = js_max(mx, JTJ[a][a])
        improved = False
        for tries in range(12):
            M = []
            for a, r in enumerate(JTJ):
                q = list(r)
                ra = r[a]
                q[a] += mu * (ra if (ra == ra and ra != 0) else mx * 1e-12) + 1e-15 * mx
                M.append(q)
            for a in range(P):
                if fixed(a):
                    for b in range(P):
                        M[a][b] = 0.0
                        M[b][a] = 0.0
                    M[a][a] = 1.0
            rhs = [0.0 if fixed(a) else v for a, v in enumerate(JTr)]
            L = chol(M)
            if not L:
                mu *= 10
                continue
            dlt = chol_solve(L, rhs)
            q = [js_min(hi[a], js_max(lo[a], v + dlt[a])) for a, v in enumerate(p)]
            s = ssr(q)
            if s < cur:
                rel = (cur - s) / (cur or 1e-300)
                p = q
                cur = s
                mu = max(mu / 3, 1e-12)
                improved = True
                if rel < 1e-10:
                    it = 1e9
                break
            mu *= 4
        if not improved:
            break
        it += 1
    free = [a for a in range(P) if not fixed(a)]

    def at_lim(a):
        r = hi[a] - lo[a]
        t = 1e-9 * (r if (math.isfinite(r) and r > 0) else max(1, abs(p[a])))
        return (math.isfinite(lo[a]) and p[a] <= lo[a] + t) or (math.isfinite(hi[a]) and p[a] >= hi[a] - t)

    JTJ, _ = normal(p)
    dof = max(1, n - len(free))
    s2 = cur / dof
    cov = [[0.0] * P for _ in range(P)]
    known = set()

    def try_cov(sset):
        if not sset:
            return False
        L = chol([[JTJ[a][b] for b in sset] for a in sset])
        if not L:
            return False
        inv = chol_inv(L)
        for i in range(len(sset)):
            v = inv[i][i]
            if not (v > 0) or not math.isfinite(v):
                return False
        for i, a in enumerate(sset):
            for j, b in enumerate(sset):
                cov[a][b] = inv[j][i] * s2
        known.update(sset)
        return True

    if not try_cov(free):
        out = set(a for a in free if at_lim(a))
        for j in range(k):
            o = NB + j * np_
            if o in out:
                for qq in range(np_):
                    out.add(o + qq)
        try_cov([a for a in free if a not in out])

    def se(a):
        return math.sqrt(js_max(0, cov[a][a])) if a in known else None

    ym = 0.0
    for v in Y:
        ym += v
    ym /= n
    sst = 0.0
    for v in Y:
        sst += (v - ym) ** 2
    peaks = []
    tot_a = 0.0
    for j in range(k):
        o = NB + j * np_
        A, w, eta = p[o], p[o + 2], eta_of(p, o)
        h = cm_pv_peak_h(A, w, eta)
        dh = [cm_pv_peak_h(1, w, eta), -h / w, A * (2 / (JS_PI * w) - 2 * CM_SQ_LN2_PI / w) if free_eta else 0]
        ix = [o, o + 2, o + 3 if free_eta else -1]
        vh = 0.0
        vok = True
        for a in range(3):
            for b in range(3):
                if ix[a] >= 0 and ix[b] >= 0:
                    if ix[a] not in known or ix[b] not in known:
                        vok = False
                    vh += dh[a] * dh[b] * cov[ix[a]][ix[b]]
        peaks.append({'c': p[o + 1], 'w': w, 'eta': eta, 'area': A, 'h': h, 'sc': se(o + 1), 'sw': se(o + 2), 'sarea': se(o),
                      'sh': math.sqrt(js_max(0, vh)) if vok else None, 'seta': se(o + 3) if free_eta else 0,
                      'atBound': w <= lo[o + 2] * 1.001 or w >= hi[o + 2] * 0.999 or p[o + 1] <= lo[o + 1] or p[o + 1] >= hi[o + 1],
                      'narrow': w <= lo[o + 2] * 1.1})
        tot_a += js_max(0, A)
    for q in peaks:
        q['pct'] = 100 * js_max(0, q['area']) / tot_a if tot_a > 0 else 0
    n_free = len(free)
    return {'peaks': peaks, 'seMissing': any(q['sc'] is None or q['sarea'] is None for q in peaks), 'base': [p[0], p[1], p[2]], 'xm': xm, 'xr': xr,
            'profile': prof, 'r2': 1 - cur / sst if sst > 0 else 1, 'ssr': cur, 'chi2r': s2, 'rmse': math.sqrt(cur / n), 'n': n, 'p': n_free, 'iter': it,
            'bic': n * m_log(js_max(cur, 1e-300) / n) + n_free * m_log(n), 'aic': n * m_log(js_max(cur, 1e-300) / n) + 2 * n_free,
            'range': [min(x0, x1), max(x0, x1)]}


def fit_eval(fit, x, j=None):
    # index.html fitEval: j = indice della componente, −1 = solo base, None = somma
    u = (x - fit['xm']) / fit['xr']
    b = fit['base'][0] + fit['base'][1] * u + (fit['base'][2] or 0) * u * u
    if j == -1:
        return b
    if j is not None:
        q = fit['peaks'][j]
        return b + q['area'] * cm_pv_at(x, q['c'], q['w'], q['eta'])
    v = b
    for q in fit['peaks']:
        v += q['area'] * cm_pv_at(x, q['c'], q['w'], q['eta'])
    return v


def cm_hidden_bands(xs, ys, sig):
    # index.html hiddenBands: minimi della derivata seconda lisciata (Maddams & Mead 1982)
    n = len(ys)
    if n < 15:
        return []
    m = max(2, min(js_round(peak_width_pts(ys) * 0.35), js_round(n / 30)))
    d2 = deriv_ls(xs, deriv_ls(xs, ys, m), m)
    neg = [-v for v in d2]
    sig = sig or noise_sigma(ys)
    st = [12345]

    def rnd():   # xorshift a 32 bit come in JavaScript
        s = st[0]
        s ^= (s << 13) & 0xffffffff
        s ^= s >> 17
        s ^= (s << 5) & 0xffffffff
        st[0] = s & 0xffffffff
        return st[0] / 4294967296
    wn = [0.0] * n
    for i in range(0, n, 2):
        u = rnd() or 1e-12
        v = rnd()
        r = math.sqrt(-2 * m_log(u))
        wn[i] = r * m_cos(2 * JS_PI * v) * sig
        if i + 1 < n:
            wn[i + 1] = r * m_sin(2 * JS_PI * v) * sig
    dn = deriv_ls(xs, deriv_ls(xs, wn, m), m)
    sd = 0.0
    for i in range(2 * m, n - 2 * m):
        sd += dn[i] * dn[i]
    sd = math.sqrt(sd / max(1, n - 4 * m)) + 1e-300
    c = [q for q in peak_candidates(neg) if q[0] > 2 * m and q[0] < n - 2 * m]
    mx = js_max(0, _cm_arr_max(c, lambda q: q[1]))
    vx = js_max(0, _cm_arr_max(c, lambda q: neg[q[0]]))
    return [{'x': xs[q[0]], 'i': q[0], 'prom': q[1]} for q in c if q[1] > max(5 * sd, 0.04 * mx) and neg[q[0]] > max(5 * sd, 0.03 * vx)]


def deconvolve(xs, ys, opt=None):
    """index.html deconvolve: semi da spalle e massimi, fusione, potatura, eliminazione all'indietro e aggiunta con il BIC."""
    xs, ys = _cm_fl(xs), _cm_fl(ys)
    if not nums_ok(xs) or not nums_ok(ys) or not (abs(xs[-1] - xs[0]) > 0):
        return None
    opt = opt or {}
    n = len(ys)
    if n < 12:
        return None
    sig = noise_sigma(ys) or 1e-12
    span = abs(xs[n - 1] - xs[0])
    dx = span / (n - 1)
    sm = sg_smooth(list(ys), 5)
    real = [q for q in peak_candidates(sm) if q[1] > 6 * sig * sg_noise_gain(2)]

    def width_at(x):
        i = nearest_idx(xs, x)
        c = None
        for q in real:
            if c is None or abs(q[0] - i) < abs(c[0] - i):
                c = q
        return max(3 * dx, half_width_pts(sm, c) * dx) if (c is not None and abs(c[0] - i) < n / 10) else span / 15
    lo, hi = min(xs[0], xs[n - 1]), max(xs[0], xs[n - 1])
    fixed = bool(opt.get('fixed'))
    hb = [] if (opt.get('shoulders') is False or fixed) else [{'x': h['x'], 'w': max(3 * dx, width_at(h['x']) * 0.7)} for h in cm_hidden_bands(xs, ys, sig)]
    seeds = [] if fixed else list(hb)
    for x in (opt.get('seeds') or []):
        x = float(x)
        if x < lo or x > hi:
            continue
        w = width_at(x)
        if not any(abs(s['x'] - x) < 0.45 * min(w, s['w']) for s in seeds):
            seeds.append({'x': x, 'w': w})
    if not seeds:
        im = 0
        for i in range(1, n):
            if sm[i] > sm[im]:
                im = i
        seeds = [{'x': xs[im], 'w': width_at(xs[im])}]
    seeds = sorted(seeds, key=lambda s: s['x'])[:(opt.get('maxPeaks') or 24)]

    def run(s):
        return cm_fit_peaks(xs, ys, s, opt) if s else None

    def as_seeds(f):
        return [{'x': q['c'], 'w': q['w']} for q in f['peaks']]
    fit = run(seeds)
    if not fit:
        return None

    def bad(q):
        return q['area'] <= 0 or q['h'] < 3 * sig or q['narrow'] or q['area'] < 2 * _n0(q['sarea'])
    rnd_ = 0
    while rnd_ < 12 and len(fit['peaks']) > 1 and not fixed:
        Pk = fit['peaks']
        dup = -1
        for j in range(1, len(Pk)):
            if abs(Pk[j]['c'] - Pk[j - 1]['c']) < 0.3 * min(Pk[j]['w'], Pk[j - 1]['w']):
                dup = j
                break
        if dup > 0:
            a, b = Pk[dup - 1], Pk[dup]
            nxt = [s for j, s in enumerate(as_seeds(fit)) if j != dup - 1 and j != dup] + [{'x': (a['c'] * a['area'] + b['c'] * b['area']) / ((a['area'] + b['area']) or 1), 'w': max(a['w'], b['w'])}]
            nxt = sorted(nxt, key=lambda s: s['x'])
        else:
            worst, wv = -1, INF
            for j, q in enumerate(Pk):
                if not bad(q):
                    continue
                sa = q['sarea']
                v = q['area'] / sa if (sa is not None and sa > 0) else (1e9 if q['area'] > 0 else -1)
                if v < wv:
                    wv, worst = v, j
            if worst < 0:
                break
            nxt = [s for j, s in enumerate(as_seeds(fit)) if j != worst]
        f2 = run(nxt)
        if not f2:
            break
        fit = f2
        rnd_ += 1
    if not fixed:   # eliminazione all'indietro: tolgo un componente se il BIC non peggiora
        changed = True
        while changed and 1 < len(fit['peaks']) <= 14:
            changed = False
            best = None
            for j in range(len(fit['peaks'])):
                f2 = run([s for q, s in enumerate(as_seeds(fit)) if q != j])
                if f2 and f2['bic'] < fit['bic'] and (best is None or f2['bic'] < best['bic']):
                    best = f2
            if best:
                fit = best
                changed = True
    max_add = 0 if fixed else (4 if opt.get('maxAdd') is None else opt['maxAdd'])
    for add in range(max_add):   # aggiunta: struttura nei residui > 4σ
        res = [ys[i] - fit_eval(fit, xs[i]) for i in range(n)]
        m = max(2, js_round(peak_width_pts(ys) * 0.3))
        rs = sg_smooth(res, 2 * m + 1)
        im, best = -1, 0.0
        for i in range(m, n - m):
            if rs[i] > best:
                best = rs[i]
                im = i
        if im < 0 or best < 4 * sig * sg_noise_gain(m):
            break
        f2 = run(sorted(as_seeds(fit) + [{'x': xs[im], 'w': max(3 * dx, width_at(xs[im]) * 0.6)}], key=lambda s: s['x']))
        if not f2 or not (f2['bic'] < fit['bic'] - 6) or any(bad(q) for q in f2['peaks']):
            break
        fit = f2
    fit['noise'] = sig
    fit['seedsUsed'] = len(seeds)
    return fit


def fit_rifai(P, cfg):
    """index.html runFitUI (e «Stessa deconvoluzione su tutti gli spettri»): rifà il fit salvato in f.fit.
    P: spettro elaborato (processed); cfg: {'range': [da, a], 'profile', 'bm', 'auto', 'semi': [x dei picchi nella zona],
    'semiFissi': [{'x','w'}] solo per i fit copiati da un altro spettro (fitPeaks diretto)}."""
    xs = P['xs']
    U = up_data(P)
    r = [float(cfg['range'][0]), float(cfg['range'][1])]
    a = 0
    while a < len(xs) and xs[a] < r[0]:
        a += 1
    b = len(xs) - 1
    while b >= 0 and xs[b] > r[1]:
        b -= 1
    if b - a < 12:
        return None
    sx, sy = xs[a:b + 1], U[a:b + 1]
    if cfg.get('semiFissi') is not None:
        fit = cm_fit_peaks(sx, sy, [{'x': float(s['x']), 'w': float(s['w'])} for s in cfg['semiFissi']], {'profile': cfg['profile'], 'base': cfg['bm']})
        if fit:
            fit['noise'] = noise_sigma(_cm_fl(sy))
    else:
        seeds = [x for x in (cfg.get('semi') or []) if r[0] <= x <= r[1]]
        fit = deconvolve(sx, sy, {'seeds': seeds, 'profile': cfg['profile'], 'base': cfg['bm'], 'fixed': not cfg['auto']})
    if fit:
        fit['range'] = r
        fit['bm'] = cfg['bm']
        fit['auto'] = bool(cfg['auto'])
    return fit


PROF_NAME = {'pv': 'pseudo-Voigt', 'gauss': 'Gauss', 'lor': 'Lorentz'}            # index.html PROF_NAME
BASE_NAME = {'lin': 'lineare', 'quad': 'quadratica', 'const': 'costante'}      # index.html BASE_NAME


def _n7(v, dec):
    # n() di fitCsvRows e di analysisFiles: String(+v.toPrecision(7)), virgola decimale della lingua
    return '' if v is None or not fin(v) else dec_num(num_prec(float(v), 7), dec)


def fit_csv_rows(items, dec):
    """index.html fitCsvRows. items: [{'nome', 'titolo', 'nomeTecnica' (NOME_IT), 'fit'}] con fit da fit_rifai."""
    rows = [['File', 'Nome', 'Strumento', 'Profilo', 'Base', 'Zona da', 'Zona a', 'R2', 'Componente', 'Centro', 'σ centro', 'FWHM', 'σ FWHM', 'Altezza', 'σ altezza',
             'Area', 'σ area', 'Area %', 'Frazione Lorentz']]
    for it in items:
        F = it['fit']
        if not F:
            continue
        prof = F['profile']
        for j, q in enumerate(F['peaks']):
            rows.append([it['nome'], it['titolo'], it['nomeTecnica'], PROF_NAME.get(prof, ''), BASE_NAME.get(F['bm']) or F['bm'], _n7(F['range'][0], dec), _n7(F['range'][1], dec),
                         _n7(F['r2'], dec), str(j + 1), _n7(q['c'], dec), _n7(q['sc'], dec), _n7(q['w'], dec), _n7(q['sw'], dec), _n7(q['h'], dec), _n7(q['sh'], dec),
                         _n7(q['area'], dec), _n7(q['sarea'], dec), _n7(q['pct'], dec), _n7(q['eta'] if prof == 'pv' else (1 if prof == 'lor' else 0), dec)])
    return rows


# ============================== PCA e cluster ==============================
def preprocess_rows(rows, grid, method):
    # index.html preprocessRows: SNV, derivata prima o seconda (Savitzky–Golay + regressione locale)
    out = []
    for r in rows:
        v = list(r)
        if method == 'snv':
            m = 0.0
            for q in v:
                m += q
            m /= len(v)
            s = 0.0
            for q in v:
                s += (q - m) ** 2
            s = math.sqrt(s / (len(v) - 1)) or 1
            v = [(q - m) / s for q in v]
        if method in ('d1', 'd2'):
            mm = max(2, js_round(len(v) / 150))
            v = deriv_ls(grid, sg_smooth(v, 2 * mm + 1), mm)
            if method == 'd2':
                v = deriv_ls(grid, v, mm)
        out.append(v)
    return out


def msc_rows(rows):
    # index.html mscRows: correzione moltiplicativa dello scattering rispetto allo spettro medio
    m = len(rows[0])
    nr = len(rows)
    mean = [0.0] * m
    for r in rows:
        for j, v in enumerate(r):
            mean[j] += v / nr
    out = []
    for r in rows:
        R = lin_reg(list(mean), list(r))
        ok = R is not None and R['b'] == R['b'] and R['b'] != 0   # R && R.b: 0 e NaN sono falsi
        out.append([(v - R['a']) / R['b'] for v in r] if ok else list(r))
    return out


def pca_nipals(rows, k, scale):
    # index.html pcaNipals
    n, m = len(rows), len(rows[0])
    k = max(1, min(k or 5, n - 1, m))
    mean = [0.0] * m
    sd = [1.0] * m
    for r in rows:
        for j, v in enumerate(r):
            mean[j] += v / n
    if scale in ('auto', 'pareto'):
        for j in range(m):
            s = 0.0
            for r in rows:
                s += (r[j] - mean[j]) ** 2
            s = math.sqrt(s / (n - 1)) or 1
            sd[j] = s if scale == 'auto' else math.sqrt(s)
    X = [[(v - mean[j]) / sd[j] for j, v in enumerate(r)] for r in rows]
    tot = 0.0
    for r in X:
        for v in r:
            tot += v * v
    T, Pl, ev = [], [], []
    for a in range(k):
        jm, vm = 0, -1.0
        for j in range(m):
            s = 0.0
            for r in X:
                s += r[j] * r[j]
            if s > vm:
                vm, jm = s, j
        t = [r[jm] for r in X]
        p = [0.0] * m
        for it in range(1000):
            tt = 0.0
            for v in t:
                tt += v * v
            tt = tt or 1e-300
            p = [0.0] * m
            for i in range(n):
                Xi, ti = X[i], t[i]
                for j in range(m):
                    p[j] += Xi[j] * ti / tt
            pn = 0.0
            for v in p:
                pn += v * v
            pn = math.sqrt(pn) or 1e-300
            for j in range(m):
                p[j] /= pn
            tn = []
            for r in X:
                s = 0.0
                for j in range(m):
                    s += r[j] * p[j]
                tn.append(s)
            d = nn = 0.0
            for i in range(n):
                d += (tn[i] - t[i]) ** 2
                nn += tn[i] * tn[i]
            t = tn
            if d <= 1e-20 * (nn or 1):
                break
        jmax = 0
        for j in range(1, m):
            if abs(p[j]) > abs(p[jmax]):
                jmax = j
        if p[jmax] < 0:   # segno riproducibile
            p = [-v for v in p]
            t = [-v for v in t]
        tt = 0.0
        for v in t:
            tt += v * v
        for i in range(n):
            for j in range(m):
                X[i][j] -= t[i] * p[j]
        T.append(t)
        Pl.append(p)
        ev.append(tt / tot if tot > 0 else 0)
        if tot > 0:
            se_ = 0.0
            for v in ev:
                se_ += v
            if se_ > 0.99999:
                break
    return {'scores': [[t[i] for t in T] for i in range(n)], 'loadings': Pl, 'explained': ev, 'mean': mean, 'sd': sd, 'k': len(T)}


def hotelling_ellipse(scores, a, b, conf=None):
    # index.html hotellingEllipse (Jackson 1991); f_inv come in acch_ricetta
    n = len(scores)
    if n < 4:
        return None

    def v(c):
        s = 0.0
        for r in scores:
            s += r[c] * r[c]
        return s / (n - 1)
    T2 = 2 * (n - 1) / (n - 2) * f_inv(conf or 0.95, 2, n - 2)
    return {'ra': math.sqrt(v(a) * T2), 'rb': math.sqrt(v(b) * T2), 'T2': T2}


def hca_ward(pts):
    # index.html hcaWard: Lance–Williams sulle distanze euclidee al quadrato
    n = len(pts)
    if n < 2:
        return {'merges': [], 'order': [0]}
    D = []
    for i in range(n):
        row = []
        for j in range(n):
            s = 0.0
            for q in range(len(pts[i])):
                s += (pts[i][q] - pts[j][q]) ** 2
            row.append(s)
        D.append(row)
    size = [1] * n
    alive = [True] * n
    node = list(range(n))
    merges = []
    for step in range(n - 1):
        bi = bj = -1
        bd = INF
        for i in range(n):
            if alive[i]:
                for j in range(i + 1, n):
                    if alive[j] and D[i][j] < bd:
                        bd, bi, bj = D[i][j], i, j
        merges.append({'a': node[bi], 'b': node[bj], 'h': math.sqrt(js_max(0, bd)), 'size': size[bi] + size[bj]})
        for q in range(n):
            if not alive[q] or q == bi or q == bj:
                continue
            nk, ni, nj = size[q], size[bi], size[bj]
            v = ((ni + nk) * D[q][bi] + (nj + nk) * D[q][bj] - nk * D[bi][bj]) / (ni + nj + nk)
            D[q][bi] = D[bi][q] = v
        size[bi] += size[bj]
        alive[bj] = False
        node[bi] = n + step

    def kids(i):
        out, st = [], [i]
        while st:
            x = st.pop()
            if x < n:
                out.append(x)
            else:
                st.append(merges[x - n]['b'])
                st.append(merges[x - n]['a'])
        return out
    return {'merges': merges, 'order': kids(2 * n - 2), 'n': n}


def cut_tree(T, k):
    # index.html cutTree: gruppo (0..k−1) di ogni campione tagliando l'albero in k gruppi
    n = T.get('n') or 1
    lab = [0] * n
    if k <= 1 or not T['merges']:
        return lab
    parent = list(range(2 * n - 1))

    def find(i):
        r = i
        while parent[r] != r:
            r = parent[r]
        while parent[i] != r:   # compressione dei cammini, come la ricorsione dell'app
            parent[i], i = r, parent[i]
        return r
    e = n - k   # merges.slice(0, n − k): NaN vale 0, i decimali si troncano, un negativo conta dalla fine
    nm = len(T['merges'])
    if e != e:
        cnt = 0
    else:
        e = math.trunc(e)
        cnt = max(0, nm + e) if e < 0 else min(e, nm)
    for s, mg in enumerate(T['merges'][:cnt]):
        parent[find(mg['a'])] = n + s
        parent[find(mg['b'])] = n + s
    ids = {}
    for i in range(n):
        r = find(i)
        if r not in ids:
            ids[r] = len(ids)
        lab[i] = ids[r]
    return lab


def suggest_k(T):
    # index.html suggestK: salto più grande tra altezze di fusione consecutive
    h = [m['h'] for m in T['merges']]
    n = len(h) + 1
    if n < 4:
        return min(n, 2)
    best, gap = 2, -1.0
    for k in range(2, min(8, n - 1) + 1):
        g = h[n - k] - h[n - k - 1]
        if g > gap:
            gap, best = g, k
    return best


def pca_data(spettri, c):
    """index.html pcaData: griglia comune, interpolazione e pretrattamento. spettri: [{'xs': P xs, 'ys': upData(P)}]."""
    if len(spettri) < 3:
        return {'err': 'Servono almeno 3 spettri dello stesso strumento.'}
    Ps = [(_cm_fl(s['xs']), _cm_fl(s['ys'])) for s in spettri]
    lo = js_max(*[js_min(x[0], x[-1]) for x, _ in Ps])
    hi = js_min(*[js_max(x[0], x[-1]) for x, _ in Ps])
    if c.get('zone') == 'band' and c.get('a') is not None and c.get('b') is not None:
        lo = js_max(lo, js_min(c['a'], c['b']))
        hi = js_min(hi, js_max(c['a'], c['b']))
    if not (hi > lo):
        return {'err': 'Gli spettri non hanno un intervallo X in comune.'}
    m = min(800, max(50, min(len(x) for x, _ in Ps)))
    grid = [lo + (hi - lo) * i / (m - 1) for i in range(m)]
    rows = []
    for x, y in Ps:
        if not (x[0] < x[-1]):
            x, y = x[::-1], y[::-1]
        rows.append([interp_y(x, y, g) for g in grid])
    if c.get('pre') == 'msc':
        rows = msc_rows(rows)
    elif c.get('pre') != 'none':
        rows = preprocess_rows(rows, grid, c.get('pre'))
    return {'rows': rows, 'grid': grid}


def run_pca(spettri, c):
    # index.html runPCA
    D = pca_data(spettri, c)
    if 'err' in D:
        return D
    rows = D['rows']
    P = pca_nipals(rows, min(6, len(rows) - 1), c.get('scale'))
    n_pc = min(P['k'], 3)
    tree = hca_ward([s[:max(2, n_pc)] for s in P['scores']])
    k_sug = suggest_k(tree)
    ck = c.get('k')
    if ck is None:   # mvCfg: k mancante vale 'auto'
        ck = 'auto'
    if ck == 'auto':
        k = k_sug
    else:
        try:   # +c.k
            kv = 0.0 if (isinstance(ck, str) and js_trim(ck) == '') else float(ck)
        except (TypeError, ValueError):
            kv = NAN
        k = js_min(kv, len(spettri))
        if k == k and k == int(k):
            k = int(k)
    lab = cut_tree(tree, k)
    return {'P': P, 'tree': tree, 'lab': lab, 'k': k, 'kSug': k_sug, 'grid': D['grid']}


def pca_csv_rows(spettri, R, dec):
    """index.html pcaCsvRows. spettri: [{'nome', 'titolo'}] nell'ordine di mvFiles."""
    if not R or 'err' in R:
        return []

    def n(v):   # qui n() non toglie null e non finiti: String(NaN) = 'NaN'
        return dec_num(num_prec(float(v), 7), dec)
    out = [['File', 'Nome', 'Gruppo'] + ['PC%d (%s%%)' % (i + 1, n(v * 100)) for i, v in enumerate(R['P']['explained'])]]
    for i, s in enumerate(spettri):
        out.append([s['nome'], s['titolo'], str(R['lab'][i] + 1)] + [n(v) for v in R['P']['scores'][i]])
    return out


# ============================== PLS ==============================
def solve_lin(A, b):
    # index.html solveLin: Gauss con pivot parziale
    n = len(b)
    M = [list(A[i]) + [b[i]] for i in range(n)]
    for c in range(n):
        pv = c
        for r in range(c + 1, n):
            if abs(M[r][c]) > abs(M[pv][c]):
                pv = r
        M[c], M[pv] = M[pv], M[c]
        if abs(M[c][c]) < 1e-300:
            return None
        for r in range(c + 1, n):
            k = M[r][c] / M[c][c]
            for q in range(c, n + 1):
                M[r][q] -= k * M[c][q]
    x = [0.0] * n
    for r in range(n - 1, -1, -1):
        t = M[r][n]
        for q in range(r + 1, n):
            t -= M[r][q] * x[q]
        x[r] = t / M[r][r]
    return x


def pls_fit(rows, y, A):
    # index.html plsFit: PLS1 NIPALS (Wold, Sjöström & Eriksson 2001)
    n, m = len(rows), len(rows[0])
    xm = [0.0] * m
    ym = 0.0
    for i, r in enumerate(rows):
        ym += y[i] / n
        for j in range(m):
            xm[j] += r[j] / n
    X = [[v - xm[j] for j, v in enumerate(r)] for r in rows]
    yc = [v - ym for v in y]
    W, Pp, Q = [], [], []
    A = max(1, min(A, n - 1, m))
    for a in range(A):
        w = [0.0] * m
        for i in range(n):
            Xi, yi = X[i], yc[i]
            for j in range(m):
                w[j] += Xi[j] * yi
        wn = 0.0
        for v in w:
            wn += v * v
        wn = math.sqrt(wn)
        if not (wn > 1e-300):
            break
        for j in range(m):
            w[j] /= wn
        t = []
        for r in X:
            s = 0.0
            for j in range(m):
                s += r[j] * w[j]
            t.append(s)
        tt = 0.0
        for v in t:
            tt += v * v
        if not (tt > 1e-300):
            break
        p = [0.0] * m
        for i in range(n):
            Xi, ti = X[i], t[i]
            for j in range(m):
                p[j] += Xi[j] * ti / tt
        q = 0.0
        for i in range(n):
            q += yc[i] * t[i] / tt
        for i in range(n):
            Xi = X[i]
            for j in range(m):
                Xi[j] -= t[i] * p[j]
            yc[i] -= q * t[i]
        W.append(w)
        Pp.append(p)
        Q.append(q)
    k = len(W)
    PW = []
    for a in range(k):
        row = []
        for b in range(k):
            s = 0.0
            for j in range(m):
                s += Pp[a][j] * W[b][j]
            row.append(s)
        PW.append(row)
    z = solve_lin(PW, Q) or [0.0] * k
    B = [0.0] * m
    for a in range(k):
        for j in range(m):
            B[j] += W[a][j] * z[a]

    def predict(x):
        s = ym
        for j in range(m):
            s += (x[j] - xm[j]) * B[j]
        return s
    return {'A': k, 'xm': xm, 'ym': ym, 'B': B, 'predict': predict}


def pls_cv(rows, y, Amax=None):
    # index.html plsCV: validazione incrociata leave-one-out; il più piccolo A con RMSECV entro il 5% del minimo
    n = len(rows)
    Amax = max(1, min(Amax or 8, n - 2))
    press = [0.0] * (Amax + 1)
    cvp = [[0.0] * n for _ in range(Amax + 1)]
    for i in range(n):
        R = [r for k, r in enumerate(rows) if k != i]
        Y = [v for k, v in enumerate(y) if k != i]
        for a in range(1, Amax + 1):
            M = pls_fit(R, Y, a)
            pr = M['predict'](rows[i])
            cvp[a][i] = pr
            press[a] += (pr - y[i]) ** 2
    ym = 0.0
    for v in y:
        ym += v / n
    ss = 0.0
    for v in y:
        ss += (v - ym) ** 2

    def rm(a):
        return math.sqrt(press[a] / n)
    best = 1
    for a in range(2, Amax + 1):
        if rm(a) < rm(best):
            best = a
    A = best
    for a in range(1, best):
        if rm(a) <= 1.05 * rm(best):
            A = a
            break
    M = pls_fit(rows, y, A)
    sse = 0.0
    for i, r in enumerate(rows):
        sse += (M['predict'](r) - y[i]) ** 2
    return {'model': M, 'A': A, 'rmsecv': rm(A), 'rmsec': math.sqrt(sse / max(1, n - A - 1)), 'q2': 1 - press[A] / ss if ss > 0 else 0,
            'r2': 1 - sse / ss if ss > 0 else 0, 'cvPred': list(cvp[A]), 'curve': [rm(a + 1) for a in range(Amax)]}


def pls_run(spettri, conc, c):
    """index.html plsRun. spettri come per pca_data; conc: concentrazione nota (an.conc) o None, stesso ordine."""
    D = pca_data(spettri, c)
    if 'err' in D:
        return D
    idx = [i for i in range(len(spettri)) if conc[i] is not None]
    if len(idx) < 4:
        return {'err': 'Per la PLS servono almeno 4 spettri con la concentrazione nota (meglio 8 o più).'}
    R = [D['rows'][i] for i in idx]
    y = [float(conc[i]) for i in idx]
    cv = pls_cv(R, y, 8)
    cv.update({'idx': idx, 'y': y, 'pred': [cv['model']['predict'](D['rows'][i]) for i in range(len(spettri))]})
    return cv


def pls_csv_rows(spettri, R, dec):
    # index.html analysisFiles, file pls_<tecnica>.csv
    out = [['File', 'Nome', 'Concentrazione nota', 'Stimata PLS', 'Validazione incrociata']]
    for i, s in enumerate(spettri):
        k = R['idx'].index(i) if i in R['idx'] else -1
        out.append([s['nome'], s['titolo'], _n7(R['y'][k], dec) if k >= 0 else '', _n7(R['pred'][i], dec), _n7(R['cvPred'][k], dec) if k >= 0 else ''])
    out.append([])
    out.append(['Variabili latenti', str(R['A']), 'R2', _n7(R['r2'], dec), 'Q2', _n7(R['q2'], dec), 'RMSEC', _n7(R['rmsec'], dec), 'RMSECV', _n7(R['rmsecv'], dec)])
    return out


# ============================== miscele ==============================
def nnls(A, b, max_iter=None):
    # index.html nnls: minimi quadrati non negativi (Lawson & Hanson 1974); A = colonne
    p, m = len(A), len(b)
    x = [0.0] * p
    in_p = [False] * p

    def dot(u, v):
        s = 0.0
        for i in range(m):
            s += u[i] * v[i]
        return s

    def resid():
        r = list(b)
        for j in range(p):
            if x[j] == x[j] and x[j] != 0:   # if (x[j]): 0 e NaN sono falsi
                xj, Aj = x[j], A[j]
                for i in range(m):
                    r[i] -= xj * Aj[i]
        return r
    nrm = math.sqrt(dot(b, b)) or 1
    tol = 1e-10 * nrm * js_max(*([math.sqrt(dot(c, c)) or 0 for c in A] + [1]))

    def lsq(idx):
        M = [[dot(A[a], A[c]) for c in idx] for a in idx]
        v = [dot(A[a], b) for a in idx]
        for i in range(len(idx)):
            d = M[i][i]
            M[i][i] += 1e-12 * (d if (d == d and d != 0) else 1)
        L = chol(M)
        return chol_solve(L, v) if L else None
    for outer in range(max_iter or 3 * p + 10):
        r = resid()
        w = [dot(c, r) for c in A]
        j, wm = -1, tol
        for q in range(p):
            if not in_p[q] and w[q] > wm:
                wm, j = w[q], q
        if j < 0:
            break
        in_p[j] = True
        for inner in range(3 * p + 10):
            idx = [q for q in range(p) if in_p[q]]
            s = lsq(idx)
            if not s:
                in_p[j] = False
                break
            if all(v > 0 for v in s):
                for i, q in enumerate(idx):
                    x[q] = s[i]
                break
            alpha = 1.0
            for i, q in enumerate(idx):
                if s[i] <= 0:
                    a = x[q] / ((x[q] - s[i]) or 1e-300)
                    if a < alpha:
                        alpha = a
            for i, q in enumerate(idx):
                x[q] += alpha * (s[i] - x[q])
                if x[q] <= 1e-14:
                    x[q] = 0.0
                    in_p[q] = False
    r = resid()
    ss = 0.0
    for v in r:
        ss += v * v
    return {'x': x, 'ssr': ss, 'res': r}


COMPAT = {'uv': ['uv', 'fluo'], 'fluo': ['fluo', 'uv']}   # index.html COMPAT


def compatible(a, b):
    # index.html compatible
    return a == b or b in COMPAT.get(a, [])


def ref_score(xs, ys, kind, r):
    # index.html refScore: correlazione dopo aver tolto una retta, su una griglia comune
    y = transform_y(ys, 'T', 'A')[0] if kind == 'T' else ys
    rx, ry = r['x'], r['y']
    lo, hi = js_max(xs[0], rx[0]), js_min(xs[-1], rx[-1])
    span = js_min(xs[-1] - xs[0], rx[-1] - rx[0])
    if not (hi > lo) or (hi - lo) < 0.5 * span:
        return None
    n = 600
    G, A, B = [0.0] * n, [0.0] * n, [0.0] * n
    for i in range(n):
        x = lo + (hi - lo) * i / (n - 1)
        G[i] = x
        A[i] = interp_y(xs, y, x)
        B[i] = interp_y(rx, ry, x)

    def detrend(V):
        sx = sy = 0.0
        for i in range(n):
            sx += G[i]
            sy += V[i]
        mx, my = sx / n, sy / n
        sxx = sxy = 0.0
        for i in range(n):
            sxx += (G[i] - mx) ** 2
            sxy += (G[i] - mx) * (V[i] - my)
        b = sxy / sxx if sxx else 0
        for i in range(n):
            V[i] -= my + b * (G[i] - mx)
    detrend(A)
    detrend(B)
    ab = aa = bb = 0.0
    for i in range(n):
        ab += A[i] * B[i]
        aa += A[i] * A[i]
        bb += B[i] * B[i]
    if not (aa > 0 and bb > 0):
        return None
    c = ab / math.sqrt(aa * bb)
    return 100 * js_max(0, c) * js_max(0, c)


def ref_score_deriv(xs, ys, kind, r):
    # index.html refScoreDeriv: correlazione delle derivate prime (Varmuza & Filzmoser 2009)
    y = transform_y(ys, 'T', 'A')[0] if kind == 'T' else ys
    rx, ry = r['x'], r['y']
    lo, hi = js_max(xs[0], rx[0]), js_min(xs[-1], rx[-1])
    span = js_min(xs[-1] - xs[0], rx[-1] - rx[0])
    if not (hi > lo) or (hi - lo) < 0.5 * span:
        return None
    n = 600
    G, A, B = [0.0] * n, [0.0] * n, [0.0] * n
    for i in range(n):
        x = lo + (hi - lo) * i / (n - 1)
        G[i] = x
        A[i] = interp_y(xs, y, x)
        B[i] = interp_y(rx, ry, x)
    dA, dB = deriv_ls(G, A, 3), deriv_ls(G, B, 3)
    ma = mb = 0.0
    for i in range(n):
        ma += dA[i] / n
        mb += dB[i] / n
    ab = aa = bb = 0.0
    for i in range(n):
        p, q = dA[i] - ma, dB[i] - mb
        ab += p * q
        aa += p * p
        bb += q * q
    if not (aa > 0 and bb > 0):
        return None
    c = ab / math.sqrt(aa * bb)
    return 100 * js_max(0, c) * js_max(0, c)


def _mix_view(s):
    # dati usati da refMatches e mixtureOf: con una derivata si torna ai dati del file
    P = s['P']
    if P.get('deriv'):
        return s['kind'], _cm_fl(s['xs_file']), _cm_fl(s['ys_file'])
    return P['kind'], _cm_fl(P['xs']), _cm_fl(P['ys'])


def ref_matches(s, refs, cache=None):
    """index.html refMatches. s: {'P', 'xs_file', 'ys_file', 'kind' (f.kind), 'tecnica', 'base' (pBase)}; refs: REFS dell'app."""
    P = s['P']
    refs = [dict(r, x=_cm_fl(r['x']), y=_cm_fl(r['y'])) for r in refs]
    kind, xs, ys = _mix_view(s)
    bl = s['base'] == 'none' and not P.get('deriv') and kind != 'T' and s['tecnica'] in ('raman', 'fluo', 'gen')
    if bl:   # l'app ignora un errore di arPLS (try/catch): qui un errore ferma lo script, mai un risultato diverso in silenzio
        b = baseline_arpls(xs, ys)
        ys = [v - b[i] for i, v in enumerate(ys)]
    cache = {} if cache is None else cache

    def ref_of(r):
        if not bl:
            return r
        key = r['id'] + '|' + str(len(r['y']))
        if key not in cache:
            rx, ry = _cm_fl(r['x']), _cm_fl(r['y'])
            b = baseline_arpls(rx, ry)
            cache[key] = dict(r, x=rx, y=[v - b[i] for i, v in enumerate(ry)])
        return cache[key]
    kk = 'U' if kind == 'N' else kind
    out = []
    for r0 in refs:
        if not compatible(r0['i'], s['tecnica']):
            continue
        r = ref_of(r0)
        sc = ref_score(xs, ys, kk, r)
        if sc is None:
            continue
        sd = ref_score_deriv(xs, ys, kk, r)
        out.append({'r': r0, 's': sc, 'sd': sd, 'c': (sc + sd) / 2 if sd is not None else sc})
    if any(o['c'] != o['c'] for o in out):
        raise NonTrascritto(tt('ordinamento dei riferimenti con un punteggio NaN non trascritto', 'sorting of the references with a NaN score not transcribed'))
    return sorted(out, key=lambda o: -o['c'])


def mixture_of(s, refs, cache=None):
    """index.html mixtureOf: quote spettrali dei riferimenti (NNLS con fondo costante e retta).
    cache: dizionario condiviso; con s['k'] (indice dello spettro) il risultato si calcola una volta sola."""
    if cache is not None and s.get('k') is not None and ('mix', s['k']) in cache:
        return cache[('mix', s['k'])]
    M = _mixture_of(s, refs, cache)
    if cache is not None and s.get('k') is not None:
        cache[('mix', s['k'])] = M
    return M


def _mixture_of(s, refs, cache):
    kind, xs, ys0 = _mix_view(s)
    y = transform_y(ys0, 'T', 'A')[0] if kind == 'T' else ys0
    cand = [o['r'] for o in ref_matches(s, refs, cache)[:12]]
    if not cand:
        return None
    cx = [(_cm_fl(r['x']), _cm_fl(r['y'])) for r in cand]
    lo = js_max(*([xs[0]] + [x[0] for x, _ in cx]))
    hi = js_min(*([xs[-1]] + [x[-1] for x, _ in cx]))
    span = xs[-1] - xs[0]
    if not (hi > lo) or hi - lo < 0.3 * span:
        return {'err': 'I riferimenti candidati non coprono un intervallo comune abbastanza ampio.'}
    m = 600
    G = [lo + (hi - lo) * i / (m - 1) for i in range(m)]
    b = [interp_y(xs, y, x) for x in G]
    cols = []
    for rx, ry in cx:
        v = [interp_y(rx, ry, x) for x in G]
        mn = INF
        for q in v:
            mn = js_min(mn, q)
        v = [q - mn for q in v]
        a = 0.0
        for q in v:
            a += q
        a = a or 1
        cols.append([q / a for q in v])
    one = [1 / m] * m
    ramp = [i / (m - 1) / m for i in range(m)]
    A = cols + [one, [-v for v in one], ramp, [-v for v in ramp]]
    res = nnls(A, b)
    bm = 0.0
    for v in b:
        bm += v / m
    sst = 0.0
    for v in b:
        sst += (v - bm) ** 2
    tot = 0.0
    for j in range(len(cand)):
        tot += res['x'][j]
    tot = tot or 1
    lst = [{'r': r, 'frac': res['x'][j] / tot} for j, r in enumerate(cand)]
    lst = sorted([o for o in lst if o['frac'] > 0.005], key=lambda o: -o['frac'])
    return {'list': lst, 'r2': 1 - res['ssr'] / sst if sst > 0 else 1}


def mix_response(stds):
    # index.html mixResponse: fattori di risposta k_j da miscele di composizione nota (media geometrica)
    L = {}
    for s in stds:
        ids = [i for i in s['w'] if s['w'][i] > 0 and (s['q'].get(i) or 0) > 0]
        if len(ids) < 1:
            continue
        r = [m_log(s['q'][i] / s['w'][i]) for i in ids]
        mean = 0.0
        for v in r:
            mean += v
        mean /= len(r)
        for i, idd in enumerate(ids):
            L.setdefault(idd, []).append(r[i] - mean)
    k, sd, n = {}, {}, {}
    for idd, v in L.items():
        m = 0.0
        for q in v:
            m += q
        m /= len(v)
        k[idd] = m_exp(m)
        n[idd] = len(v)
        if len(v) > 1:
            a = 0.0
            for q in v:
                a += (q - m) ** 2
            sd[idd] = math.sqrt(a / (len(v) - 1))
        else:
            sd[idd] = None
    return {'k': k, 'sd': sd, 'n': n}


def mix_weights(q, R):
    # index.html mixWeights: da quote spettrali a % in peso
    ids = [i for i in q if q[i] > 0]
    if not ids:
        return None
    miss = [i for i in ids if not R['k'].get(i)]
    raw = {}
    t = 0.0
    for i in ids:
        kv = R['k'].get(i)
        raw[i] = q[i] / (kv if (kv is not None and kv == kv and kv != 0) else 1)
        t += raw[i]
    out = {}
    for i in ids:
        w = 100 * raw[i] / t
        s = R['sd'].get(i)
        out[i] = {'w': w, 'sw': w * (1 - w / 100) * s if s is not None else None, 'cal': bool(R['k'].get(i))}
    return {'w': out, 'missing': miss}


def mix_calib(tecnica, tutti, refs, cache=None):
    """index.html mixCalib. tutti: tutti gli spettri caricati, come per mixture_of, con 'mixW' ({id: % in peso}) o None."""
    L = []
    for g in tutti:
        if g['tecnica'] != tecnica or g.get('mixW') is None:   # !g.an.mixW: anche {} conta come standard
            continue
        M = mixture_of(g, refs, cache)
        if not M or 'err' in M:
            continue
        L.append({'q': {o['r']['id']: o['frac'] for o in M['list']}, 'w': {i: float(v) for i, v in g['mixW'].items()}})
    if not L:
        return None
    R = mix_response(L)
    R['nStd'] = len(L)
    return R


def miscele_rows(inclusi, tutti, refs, dec, raw=None):
    """index.html analysisFiles, file miscele_percentuali_in_peso.csv. inclusi: spettri inclusi (ordine di included()),
    ciascuno {'nome', 'titolo', 'P', 'xs_file', 'ys_file', 'kind', 'tecnica', 'base'}; tutti: come per mix_calib."""
    cache = {}
    mw = []
    for f in inclusi:
        if f['tecnica'] not in ('raman', 'ftir'):
            continue
        M = mixture_of(f, refs, cache)
        if not M or 'err' in M:
            continue
        K = mix_calib(f['tecnica'], tutti, refs, cache)
        if not K:
            continue
        q = {o['r']['id']: o['frac'] for o in M['list']}
        mw.append((f, M, mix_weights(q, K)))
        if raw is not None:
            raw.setdefault('mix', []).append({'list': [(o['r']['id'], o['frac']) for o in M['list']], 'r2': M['r2'], 'w': mw[-1][2]})
    if not mw:
        return None
    rows = [['File', 'Nome', 'Componente', 'Quota spettrale %', '% in peso', '±']]
    for f, M, W in mw:
        for o in M['list']:
            w = W['w'].get(o['r']['id']) if W else None
            rows.append([f['nome'], f['titolo'], o['r']['n'], _n7(o['frac'] * 100, dec), _n7(w['w'], dec) if (w and w['cal']) else '', _n7(w['sw'], dec) if (w and w['sw'] is not None) else ''])
    return rows


# ============================== file della ricetta ==============================
def chemometria_files(ch, ric, spettri, loaded, results, raw=None):
    """index.html analysisFiles: deconvoluzione.csv, miscele_percentuali_in_peso.csv, pls_<tecnica>.csv e pca_<tecnica>.csv,
    nello stesso ordine dell'app. ch = ric['chemometria'] (schema nel rapporto); spettri, loaded, results come in run_project.
    Restituisce [(nome del file, testo CSV)]; raw (dizionario, facoltativo) riceve i risultati numerici per i controlli."""
    raw = {} if raw is None else raw
    en = ric['lingua'] == 'en'
    dec, csep = ric['dec'], ric['csep']
    out = []

    def need(k):
        if results[k] is None:
            raise NonTrascritto(tt('%s: spettro non elaborato', '%s: spectrum not processed') % spettri[k]['nome'])
        return results[k]

    def mv_list(ids):
        return [{'xs': need(k)['xs'], 'ys': up_data(need(k)), 'nome': spettri[k]['nome'], 'titolo': spettri[k]['titolo']} for k in ids]

    def mix_item(k, extra=None):
        sp = spettri[k]
        d = {'k': k, 'nome': sp['nome'], 'titolo': sp['titolo'], 'P': need(k), 'xs_file': loaded[k][0], 'ys_file': loaded[k][1], 'kind': sp['kind'],
             'tecnica': sp['tecnica'], 'base': sp['elab']['base']}
        if extra:
            d.update(extra)
        return d
    def seeds_of(k, cfg):
        if cfg.get('semi') is None and cfg.get('semiFissi') is None:   # picchi della vista, come d.peaks in runFitUI
            cfg['semi'] = [p['x'] for p in view_peaks(spettri[k], need(k), loaded[k][0], loaded[k][1], ric)]
        return cfg
    items = []
    for d in ch.get('deconvoluzione') or []:
        k = d['i']
        cfg = dict(d['fit'])
        if cfg.get('copiaDa') is not None:   # «Stessa deconvoluzione su tutti gli spettri»: semi = componenti del fit di partenza
            src = cfg['copiaDa']
            F = fit_rifai(need(src['i']), seeds_of(src['i'], dict(src['fit'])))
            if not F:
                raise NonTrascritto(tt('%s: il fit di partenza della deconvoluzione non converge nello script', '%s: the starting deconvolution fit does not converge in the script') % spettri[src['i']]['nome'])
            cfg['semiFissi'] = [{'x': q['c'], 'w': q['w']} for q in F['peaks']]
            cfg['range'] = F['range']
        fit = fit_rifai(need(k), seeds_of(k, cfg))
        if not fit:
            raise NonTrascritto(tt('%s: il fit della deconvoluzione non converge nello script', '%s: the deconvolution fit does not converge in the script') % spettri[k]['nome'])
        items.append({'nome': spettri[k]['nome'], 'titolo': spettri[k]['titolo'], 'nomeTecnica': d['nomeTecnica'], 'fit': fit})
        raw.setdefault('fit', []).append(fit)
    fr = fit_csv_rows(items, dec)
    if len(fr) > 1:
        out.append(('deconvolution.csv' if en else 'deconvoluzione.csv', analysis_csv(fr, csep, dec)))
    mi = ch.get('miscele')
    if mi:
        refs = mi['riferimenti']
        tutti = [mix_item(int(k), {'mixW': w}) for k, w in mi['tutti']]
        inclusi = [mix_item(k) for k in mi['inclusi']]
        rows = miscele_rows(inclusi, tutti, refs, dec, raw)
        if rows:
            out.append(('mixture_weight_percent.csv' if en else 'miscele_percentuali_in_peso.csv', analysis_csv(rows, csep, dec)))
    for d in ch.get('pls') or []:
        L = mv_list(d['spettri'])
        R = pls_run(L, d['conc'], d['cfg'])
        if 'err' in R:
            raise NonTrascritto('pls_%s.csv: %s' % (d['tecnica'], R['err']))
        raw.setdefault('pls', []).append(R)
        out.append(('pls_%s.csv' % d['tecnica'], analysis_csv(pls_csv_rows(L, R, dec), csep, dec)))
    for d in ch.get('pca') or []:
        L = mv_list(d['spettri'])
        R = run_pca(L, d['cfg'])
        if 'err' in R:
            raise NonTrascritto('pca_%s.csv: %s' % (d['tecnica'], R['err']))
        raw.setdefault('pca', []).append(R)
        out.append(('pca_%s.csv' % d['tecnica'], analysis_csv(pca_csv_rows(L, R, dec), csep, dec)))
    return out
