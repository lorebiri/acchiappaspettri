
# =============================================================================================
# Modulo acch_tecnica: parametri per tecnica (techMetrics), controllo di qualità (assess) e
# XRF (composizione con standard; parametri fondamentali e spessori in acch_xrf.py). Si concatena DOPO acch_ricetta.py e ne
# usa gli helper con la semantica di JavaScript (js_round, js_fixed, jdiv, median, ...).
# Stesse operazioni nello stesso ordine di index.html. Ciò che non è identico: NonTrascritto.
#
# Ingresso di ogni spettro («voce», un dict; tra parentesi la funzione dell'app che lo produce):
#   id, nome (f.name), titolo (dispTitle), nomeIt (NOME_IT[f.instr]), instr, kind (f.kind),
#   xs, ys (f.xs, f.ys), an (f.an), uncal, ecal (bool), freq, eprConv, nuc, sample
#   (f.sample||S.sample), fkey (fkey(f)), P (processed: xs, ys, kind, dir, deriv, mass, dtg;
#   acch_ricetta.processed), peaks (viewOf(f).peaks: x, y, prom, xa, xb, side, sign, custom,
#   name, area, dH, dHu, sugg=[{it}]), smooth (pSmooth), base (pBase), removed (f.removed),
#   lettura: importNotes, importBad, reason, autoInstr, importIssue, afterCh, nCols, chIx,
#   blockIx, nChan, nBlocks, isXrf (!!f.xrf), chanLabel (chanOf), chanWarn (chanWarn(f)),
#   suspectT (suspectT(f)), auto (f._auto: x, prom), tube (f.tube), currieOut (f._currieOut),
#   userRate, therm {rate}, ts (f.ts).
#   Per la composizione XRF anche an.std (composizione nota degli standard).
# Contesto ctx: lang ('it'|'en'; vale per LANG e per AcchI18n.lang), S {showArea, showPeaks,
#   spike{instr: bool}}, files (tutte le voci del progetto, per EPR e fluorescenza).
# Costanti (carica_costanti, JSON dall'app): XRF_COMMON, XRF_LINES, XRF_LN_GR, XRF_TUBES, FP.el[El].fam.
# In inglese i testi li traduce TRAD (acch_ricetta), registrato all'esportazione come per le altre tabelle.
# Ingressi: controllo_qualita_csv(voci, ctx), parametri_per_tecnica_csv(voci, ctx),
#   composizione_xrf_csv(cfg=mvCfg('xrf'), lista=mvFiles('xrf'), ctx). Restituiscono (nome file, testo CSV).
# Numeri: exp, log, pow, sin e cos sono m_* di acch_math.py, come nel motore JavaScript scelto con imposta_motore.
# La deconvoluzione (fitPeaks, hiddenBands) è quella di acch_chemometria.py (cm_fit_peaks, cm_hidden_bands).
# =============================================================================================

TEC_LANG = ['it']


def _en():
    return TEC_LANG[0] == 'en'


def _dec():
    # index.html T_().dec
    return '.' if _en() else ','


def t_fmt_n(v, d):
    # index.html fmtN: (+v).toFixed(d) con il separatore decimale della lingua
    v = NAN if v is None else float(v)
    return js_fixed(v, d).replace('.', _dec(), 1)


def t_fmt_g(v, d=None):
    # index.html fmtG
    if v is None or not math.isfinite(v):
        return '—'
    v = float(v)
    if abs(v) >= 1e5 or (abs(v) < 1e-3 and v != 0):
        return js_expo(v, 3 if d is None else d - 1).replace('.', _dec(), 1)
    return num_prec(v, d or 4).replace('.', _dec(), 1)


def t_loc_int(v):
    # Math.round(v).toLocaleString(T_().locale): it-IT raggruppa da 10.000 in su, en-GB da 1,000
    if v != v:
        return 'NaN'
    if v in (INF, -INF):
        return '∞' if v > 0 else '-∞'
    r = js_round(v)
    if r == 0:
        return '-0' if (v < 0 or math.copysign(1, v) < 0) else '0'
    n = int(Decimal(repr(float(r))))
    s = str(abs(n))
    sep, lim = (',', 1000) if _en() else ('.', 10000)
    if abs(n) >= lim:
        g = []
        while len(s) > 3:
            g.insert(0, s[-3:])
            s = s[:-3]
        g.insert(0, s)
        s = sep.join(g)
    return ('-' if n < 0 else '') + s


def t_fmt_sn(v):
    # index.html fmtSN
    if not math.isfinite(v) or v > 1e5:
        return '> ' + t_loc_int(1e5)
    if v >= 1000:
        return t_loc_int(v)
    return t_fmt_g(v, 3 if v >= 100 else 2)


def t_fmt_tick(v, dec):
    # index.html fmtTick
    sep = _dec()
    if abs(v) >= 1e7 or (abs(v) >= 1e5 and math.fmod(v, 1) != 0) or (abs(v) < 1e-3 and v != 0):
        return js_expo(v, 1).replace('.', sep, 1)
    return js_fixed(v, dec).replace('.', sep, 1)


def t_fmt_peak(instr, x, uncal, nuc=None):
    # index.html fmtPeak
    if abs(x) < 5e-7:
        x = 0.0
    else:
        d = 2 if ((instr == 'nmr' and nuc == '1H') or instr in ('hplc', 'xrf', 'libs', 'epr')) else 1
        if abs(x) < 0.5 * m_pow(10, -d):
            x = 0.0
    if uncal:
        return js_str(float(js_round(x)))
    if instr in ('hplc', 'xrf', 'libs', 'epr'):
        return js_fixed(x, 2).replace('.', _dec(), 1)
    if instr in ('tga', 'dsc'):
        return js_fixed(x, 1).replace('.', _dec(), 1)
    if instr == 'nmr':
        return js_fixed(x, 2 if nuc == '1H' else 1).replace('.', _dec(), 1)
    if instr == 'gen':
        return num_prec(x, 4).replace('.', _dec(), 1)
    return js_str(float(js_round(x)))


def t_esc(s):
    # index.html esc
    return str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


def t_num(p):
    return t_fmt_peak(p['_instr'], p['x'], p['_uncal'], p['_nuc'])


def _s(x):
    # `${x}` di JavaScript
    if x is None:
        return 'undefined'
    if isinstance(x, (int, float)) and not isinstance(x, bool):
        return js_str(x)
    return str(x)


def _peaks(v):
    # viewOf(f).peaks con p.num (fmtPeak), come in viewOf0
    out = []
    for p in v.get('peaks') or []:
        q = dict(p)
        q['_instr'], q['_uncal'], q['_nuc'] = v['instr'], bool(v.get('uncal')), v.get('nuc')
        q['num'] = t_num(q)
        q.setdefault('sugg', [])
        out.append(q)
    return out


def t_up(P):
    # index.html upData(P).y
    return up_data(P)


def js_sort(a, cmp):
    # Array.prototype.sort con un comparatore: TimSort stabile come V8; NaN del comparatore vale 0
    import functools

    def c(x, y):
        r = cmp(x, y)
        return 0 if (r != r or r == 0) else (1 if r > 0 else -1)
    return sorted(a, key=functools.cmp_to_key(c))


def _num(v):
    return NAN if v is None else v


def _by_prom_desc(a, b):
    return _num(b.get('prom')) - _num(a.get('prom'))


def _arr_max(a):
    m = -INF
    for v in a:
        if v > m:
            m = v
    return m


# ============================== HPLC: figure di merito (index.html) ==============================
def width_at_frac(xs, ys, i, base, frac, tol):
    # index.html widthAtFrac
    def val(k):
        return ys[k] - base(xs[k])
    h = ys[i] - base(xs[i])
    lev = frac * h
    l = r = i
    ml = mr = val(i)
    tol = tol or 0
    while l > 0 and val(l) > lev:
        l -= 1
        ml = js_min(ml, val(l))
        if val(l) > ml + tol:
            return None
    while r < len(xs) - 1 and val(r) > lev:
        r += 1
        mr = js_min(mr, val(r))
        if val(r) > mr + tol:
            return None
    if val(l) > lev or val(r) > lev:
        return None
    dl = (val(l + 1) - val(l)) or 1e-30
    dr = (val(r) - val(r - 1)) or 1e-30
    xl = xs[l] + (lev - val(l)) / dl * (xs[l + 1] - xs[l])
    xr = xs[r - 1] + (lev - val(r - 1)) / dr * (xs[r] - xs[r - 1])
    return {'a': xs[i] - xl, 'b': xr - xs[i], 'w': xr - xl}


def noise_p2p(xs, ys, peaks, span):
    # index.html noisePeakToPeak
    n = len(xs)
    step = js_or1(abs(xs[n - 1] - xs[0]) / (n - 1))
    L = max(20, js_round(span / step))
    if L * 2 > n:
        return 0

    def far(x):
        return all(abs(x - p['x']) > span * 1.2 for p in peaks)
    R = []
    a = 0
    while a + L < n:
        if far(xs[a]) and far(xs[a + L]) and far(xs[a + (L >> 1)]):
            sx = sy = sxy = sxx = 0.0
            for k in range(L):
                sx += k
                sy += ys[a + k]
                sxy += k * ys[a + k]
                sxx += k * k
            b = (L * sxy - sx * sy) / js_or1(L * sxx - sx * sx)
            c = (sy - b * sx) / L
            mn, mx = INF, -INF
            for k in range(L):
                r = ys[a + k] - c - b * k
                if r < mn:
                    mn = r
                if r > mx:
                    mx = r
            R.append(mx - mn)
        a += max(1, L >> 1)
    return median(R) if R else 0


def noise_robust(ys):
    # index.html noiseRobust
    n = len(ys)
    s = noise_sigma(ys)
    lim = max(1, math.floor(peak_width_pts(ys) / 4))
    k = 2
    while k <= lim and n / k >= 200:
        sub = [ys[i * k] for i in range(math.floor(n / k))]
        s = js_max(s, noise_sigma(sub))
        k *= 2
    return s


def chrom_metrics(xs, ys, peaks, t0):
    # index.html chromMetrics
    sig = noise_robust(ys) or 1e-30
    out = []
    n = len(xs)
    for pk in peaks:
        i = nearest_idx(xs, pk['x'])
        for _ in range(20):
            if i + 1 < n and ys[i + 1] > ys[i]:
                i += 1
            elif i > 0 and ys[i - 1] > ys[i]:
                i -= 1
            else:
                break
        if pk.get('xa') is not None and pk.get('xb') is not None:
            xa, xb = min(pk['xa'], pk['xb']), max(pk['xa'], pk['xb'])
            ya, yb = interp_y(xs, ys, xa), interp_y(xs, ys, xb)

            def base(x, ya=ya, yb=yb, xa=xa, xb=xb):
                return ya + (yb - ya) * (x - xa) / js_or1(xb - xa)
        else:
            w = max(5, js_round(n / 100))
            b0 = ys[i]
            for _ in range(3):
                lm = rm = ys[i]
                for k in range(max(0, i - w), i):
                    lm = js_min(lm, ys[k])
                for k in range(i + 1, min(n - 1, i + w) + 1):
                    rm = js_min(rm, ys[k])
                b0 = js_min(lm, rm)
                half = (ys[i] + b0) / 2
                a = z = i
                while a > 0 and ys[a] > half:
                    a -= 1
                while z < n - 1 and ys[z] > half:
                    z += 1
                need = js_round(2.5 * (z - a))
                if need <= w:
                    break
                w = need

            def base(x, b0=b0):
                return b0
        H = ys[i] - base(xs[i])
        tR = xs[i]
        tl = sig * max(4, 2 + math.sqrt(2 * m_log(n)))
        h50 = width_at_frac(xs, ys, i, base, 0.5, tl)
        h05 = width_at_frac(xs, ys, i, base, 0.05, tl)
        h10 = width_at_frac(xs, ys, i, base, 0.10, tl)
        o = {'tR': tR, 'H': H, 'sn': H / sig, 'w50': h50['w'] if h50 else None}
        if h50:
            hpp = noise_p2p(xs, ys, peaks, 5 * h50['w'])
            if hpp > 0:
                o['sn'] = 2 * H / hpp
            o['N'] = 5.54 * m_pow(jdiv(tR, h50['w']), 2)
        if h05:
            o['tailing'] = jdiv(h05['w'], 2 * h05['a'])
        if h10:
            o['asym'] = jdiv(h10['b'], h10['a'])
        if t0 is not None and t0 > 0:
            o['k'] = (tR - t0) / t0
        out.append(o)
    for j in range(1, len(out)):
        p, q = out[j - 1], out[j]
        if p['w50'] and q['w50']:
            q['rs'] = 1.18 * (q['tR'] - p['tR']) / (p['w50'] + q['w50'])
    return out


# ============================== analisi termica (index.html) ==============================
def line_fit(xs, ys, a, b):
    # index.html lineFit
    X, Y = [], []
    for k in range(max(0, a), min(len(xs) - 1, b) + 1):
        X.append(xs[k])
        Y.append(ys[k])
    R = lin_reg(X, Y)
    return {'a': R['a'], 'b': R['b']} if R else None


def tangent_onset(xs, ys, xa, xpk, xb):
    # index.html tangentOnset
    ia, ib, ip = nearest_idx(xs, min(xa, xb)), nearest_idx(xs, max(xa, xb)), nearest_idx(xs, xpk)
    if ip - ia < 3 or ib - ip < 3:
        return None
    m = max(1, js_round((ib - ia) / 40))
    d = deriv_ls(xs, ys, m)
    ya, yb = ys[ia], ys[ib]
    blb = (yb - ya) / js_or1(xs[ib] - xs[ia])
    bla = ya - (yb - ya) / js_or1(xs[ib] - xs[ia]) * xs[ia]
    il, ir = ia, ip
    for k in range(ia, ip + 1):
        if d[k] > d[il]:
            il = k
    for k in range(ip, ib + 1):
        if d[k] < d[ir]:
            ir = k

    def cut(k):
        s = d[k]
        c = ys[k] - s * xs[k]
        return (bla - c) / (s - blb) if abs(s - blb) > 1e-30 else None
    return {'onset': cut(il), 'endset': cut(ir)}


def tga_onset(xs, mass, xa, xpk, xb):
    # index.html tgaOnset
    ia, ib, ip = nearest_idx(xs, min(xa, xb)), nearest_idx(xs, max(xa, xb)), nearest_idx(xs, xpk)
    w = max(3, js_round((ib - ia) / 4))
    pre, post = line_fit(xs, mass, ia - w, ia), line_fit(xs, mass, ib, ib + w)
    if not pre or not post:
        return None
    m = max(1, js_round((ib - ia) / 40))
    s = deriv_ls(xs, mass, m)[ip]
    c = mass[ip] - s * xs[ip]

    def meet(L):
        return (L['a'] - c) / (s - L['b']) if abs(s - L['b']) > 1e-30 else None
    return {'onset': meet(pre), 'endset': meet(post)}


# ============================== UV-Vis: Tauc (index.html taucGap) ==============================
def tauc_gap(nm, y, opt):
    r = 0.5 if opt.get('trans') == 'indirect' else 2
    pts = []
    for i in range(len(nm)):
        if not (nm[i] > 0):
            continue
        E = 1239.84 / nm[i]
        F = y[i]
        if opt.get('data') == 'refl':
            R = js_min(0.9999, js_max(1e-4, y[i] / (1 if opt.get('pct') is False else 100)))
            F = (1 - R) * (1 - R) / (2 * R)
        if not (F > 0):
            F = 0
        pts.append([E, m_pow(F * E, r)])
    pts = sorted(pts, key=lambda p: p[0])
    n = len(pts)
    if n < 15:
        return None
    E = [p[0] for p in pts]
    Yr = [p[1] for p in pts]
    Y = sg_smooth(Yr, min(11, (n >> 3) * 2 + 1))
    ymax = 0
    for v in Y:
        ymax = js_max(ymax, v)
    if not (ymax > 0):
        return None
    w = max(6, js_round(n * 0.06))
    best = None
    s = 0
    while s + w < n:
        mid = Y[s + (w >> 1)]
        if not (mid < 0.1 * ymax or mid > 0.9 * ymax):
            R = lin_reg(E[s:s + w], Y[s:s + w])
            if R and not (R['b'] <= 0 or R['r2'] < 0.98):
                if not best or R['b'] > best['R']['b']:
                    best = {'R': R, 's': s, 'e': s + w - 1}
        s += 1
    if not best:
        return None
    Eg0 = -best['R']['a'] / best['R']['b']
    EgB = tail = None
    te = best['s'] - 1
    ts = max(0, te - 2 * w)
    if te - ts >= 5:
        T = lin_reg(E[ts:te + 1], Y[ts:te + 1])
        if T and T['b'] < 0.5 * best['R']['b']:
            tail = T
            EgB = (T['a'] - best['R']['a']) / (best['R']['b'] - T['b'])
    return {'Eg': EgB if (EgB is not None and EgB > E[0]) else Eg0, 'EgAxis': Eg0, 'EgTail': EgB, 'fit': best['R'],
            'seg': [E[best['s']], E[best['e']]], 'tail': tail}


# ============================== EPR (index.html) ==============================
def epr_zones_of(an):
    # index.html eprZonesOf
    a = an or {}
    z = [[a.get('eprZ1a'), a.get('eprZ1b')], [a.get('eprZ2a'), a.get('eprZ2b')]]
    z = [q for q in z if q[0] is not None and q[1] is not None and math.isfinite(q[0]) and math.isfinite(q[1]) and q[0] != q[1]]
    return z or None


def epr_zones_txt(Z, en):
    # index.html eprZonesTxt
    if not Z:
        return '5% windows at the ends' if en else 'finestre del 5% agli estremi'
    return ('chosen background zones ' if en else 'zone di fondo scelte ') + (' and ' if en else ' e ').join(
        '%s–%s' % (t_fmt_n(min(z), 2), t_fmt_n(max(z), 2)) for z in Z) + ' mT'


def epr_zone_idx(B, zones):
    # index.html eprZoneIdx
    if not isinstance(zones, list):
        return None
    Z = []
    for z in [z for z in zones if isinstance(z, list) and math.isfinite(z[0]) and math.isfinite(z[1]) and z[0] != z[1]][:2]:
        lo, hi = min(z[0], z[1]), max(z[0], z[1])
        Z.append([k for k in range(len(B)) if B[k] >= lo and B[k] <= hi])
    return Z if (Z and all(len(ks) >= 3 for ks in Z)) else None


def epr_base_fit(ks, v):
    # index.html eprBaseFit
    al = [k for g in ks for k in g]
    m = len(al)
    sk = sv = 0.0
    for k in al:
        sk += k
        sv += v(k)
    km, vm = sk / m, sv / m
    if len(ks) < 2:
        return lambda k: vm
    sxy = sxx = 0.0
    for k in al:
        sxy += (k - km) * (v(k) - vm)
        sxx += (k - km) * (k - km)
    b = sxy / sxx if sxx > 0 else 0
    return lambda k: vm + b * (k - km)


def epr_double_integral(B, y, zones):
    # index.html eprDoubleIntegral
    Z = epr_zone_idx(B, zones)
    n = len(y)
    if Z:
        f1 = epr_base_fit(Z, lambda k: y[k])
        I = [0.0] * n
        for k in range(1, n):
            I[k] = I[k - 1] + 0.5 * (y[k] - f1(k) + y[k - 1] - f1(k - 1)) * (B[k] - B[k - 1])
        f2 = epr_base_fit(Z, lambda k: I[k])
        ab = [I[k] - f2(k) for k in range(n)]
        DI = 0.0
        for k in range(1, n):
            DI += 0.5 * (ab[k] + ab[k - 1]) * (B[k] - B[k - 1])
        return {'di': DI}
    if n < 20:
        return None
    e = max(2, js_round(n * 0.05))

    def avg(a, b):
        s = 0.0
        for k in range(a, b):
            s += y[k]
        return s / (b - a)
    k0 = (e - 1) / 2
    k1 = n - 1 - k0
    y0, y1 = avg(0, e), avg(n - e, n)
    I = [0.0] * n
    for k in range(1, n):
        ck = y[k] - (y0 + (y1 - y0) * (k - k0) / (k1 - k0))
        ck1 = y[k - 1] - (y0 + (y1 - y0) * (k - 1 - k0) / (k1 - k0))
        I[k] = I[k - 1] + 0.5 * (ck + ck1) * (B[k] - B[k - 1])
    a0 = 0.0
    for v in I[:e]:
        a0 += v
    a0 /= e
    a1 = 0.0
    for v in I[n - e:]:
        a1 += v
    a1 /= e
    ab = [I[k] - (a0 + (a1 - a0) * (k - k0) / (k1 - k0)) for k in range(n)]
    DI = 0.0
    for k in range(1, n):
        DI += 0.5 * (ab[k] + ab[k - 1]) * (B[k] - B[k - 1])
    return {'di': DI}


def epr_is_absorption(B, y):
    # index.html eprIsAbsorption
    n = len(y)
    if n < 20:
        return False
    e = max(2, js_round(n * 0.05))
    a0 = a1 = 0.0
    for k in range(e):
        a0 += y[k]
        a1 += y[n - 1 - k]
    a0 /= e
    a1 /= e
    pos = neg = 0.0
    for k in range(n):
        c = y[k] - (a0 + (a1 - a0) * k / (n - 1))
        if c > 0:
            pos += c
        else:
            neg -= c
    big = js_max(pos, neg)
    return big > 0 and js_min(pos, neg) / big < 0.15


def epr_single_integral(B, y):
    # index.html eprSingleIntegral
    n = len(y)
    e = max(2, js_round(n * 0.05))
    a0 = a1 = 0.0
    for k in range(e):
        a0 += y[k]
        a1 += y[n - 1 - k]
    a0 /= e
    a1 /= e
    s = 0.0
    for k in range(1, n):
        c0 = y[k - 1] - (a0 + (a1 - a0) * (k - 1) / (n - 1))
        c1 = y[k] - (a0 + (a1 - a0) * k / (n - 1))
        s += 0.5 * (c0 + c1) * (B[k] - B[k - 1])
    return s


def _det3(A):
    return A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0])


def epr_edge_signal(B, y, zones):
    # index.html eprEdgeSignal
    Z = epr_zone_idx(B, zones)
    if Z:
        sg = noise_sigma(y)
        mx, mn = -INF, INF
        for v in y:
            if v > mx:
                mx = v
            if v < mn:
                mn = v
        fb = epr_base_fit(Z, lambda k: y[k])
        bad = []
        for ks in Z:
            e = len(ks)
            m = 0.0
            for k in ks:
                m += k
            m /= e
            rm = 0.0
            for k in ks:
                rm += y[k] - fb(k)
            rm /= e
            sxy = sxx = 0.0
            for k in ks:
                sxy += (k - m) * ((y[k] - fb(k)) - rm)
                sxx += (k - m) * (k - m)
            bad.append(abs(sxy / sxx) * (e - 1) > js_max(5 * sg * math.sqrt(12 / e), 0.002 * (mx - mn)))
        return {'edge': any(bad)}
    n = len(y)
    if n < 20:
        return None
    e = max(2, js_round(n * 0.05))
    sg = noise_sigma(y)
    mx, mn = -INF, INF
    for v in y:
        if v > mx:
            mx = v
        if v < mn:
            mn = v
    if not (mx > mn) or not math.isfinite(mx - mn):
        return None

    def mean(a, b):
        s = 0.0
        for k in range(a, b):
            s += y[k]
        return s / (b - a)

    def slope(a, b):
        m = (a + b - 1) / 2
        ym = mean(a, b)
        sxy = sxx = 0.0
        for k in range(a, b):
            sxy += (k - m) * (y[k] - ym)
            sxx += (k - m) * (k - m)
        return sxy / sxx
    k0 = (e - 1) / 2
    k1 = n - 1 - k0
    ch = (mean(n - e, n) - mean(0, e)) / (k1 - k0)
    L = abs(slope(0, e) - ch) * (e - 1)
    R = abs(slope(n - e, n) - ch) * (e - 1)
    c = (n - 1) / 2
    ks = list(range(e)) + list(range(n - e, n))
    M = [[0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [0.0, 0.0, 0.0]]
    v = [0.0, 0.0, 0.0]
    for k in ks:
        t = (k - c) / c
        b = [1, t, t * t]
        for i in range(3):
            v[i] += b[i] * y[k]
            for j in range(3):
                M[i][j] += b[i] * b[j]
    D = _det3(M)
    if abs(D) > 1e-300:
        q = [_det3([[v[a] if j == i else x for j, x in enumerate(r)] for a, r in enumerate(M)]) / D for i in range(3)]

        def res(k):
            t = (k - c) / c
            return y[k] - (q[0] + q[1] * t + q[2] * t * t)

        def rs(a, b):
            m = (a + b - 1) / 2
            r = 0.0
            for k in range(a, b):
                r += res(k)
            r /= (b - a)
            sxy = sxx = 0.0
            for k in range(a, b):
                sxy += (k - m) * (res(k) - r)
                sxx += (k - m) * (k - m)
            return abs(sxy / sxx) * (e - 1)
        L = js_min(L, rs(0, e))
        R = js_min(R, rs(n - e, n))
    lim = js_max(5 * sg * math.sqrt(12 / e), 0.002 * (mx - mn))
    return {'edge': L > lim or R > lim}


def epr_wings(B, y, zones):
    # index.html eprWings
    n = len(y)
    if n < 20:
        return None
    a = b = 0
    for k in range(1, n):
        if y[k] > y[a]:
            a = k
        if y[k] < y[b]:
            b = k
    pp = y[a] - y[b]
    dB = abs(B[a] - B[b])
    Bc = (B[a] + B[b]) / 2
    if not (pp > 0) or not (dB > 0):
        return None
    e5 = max(2, js_round(n * 0.05))
    m0 = 0.0
    for v in y[:e5]:
        m0 += v
    m0 /= e5
    m1 = 0.0
    for v in y[n - e5:]:
        m1 += v
    m1 /= e5
    k0 = (e5 - 1) / 2
    k1 = n - 1 - k0

    def ch(k):
        return m0 + (m1 - m0) * (k - k0) / (k1 - k0)
    sgn = 1 if B[0] < B[n - 1] else -1

    def at(x):
        k = 0
        while k < n - 1 and (B[k] - x) * sgn < 0:
            k += 1
        return y[k] - ch(k)
    lo, hi = min(B[0], B[n - 1]), max(B[0], B[n - 1])
    if Bc - 3 * dB < lo or Bc + 3 * dB > hi:
        return {'warn': False}
    T3 = (at(Bc - 3 * dB) - at(Bc + 3 * dB)) / 2
    T6 = (at(Bc - 6 * dB) - at(Bc + 6 * dB)) / 2 if (Bc - 6 * dB >= lo and Bc + 6 * dB <= hi) else None
    tail = abs(T3 if T6 is None else (2 * T3 - T6) * 8 / 15)
    sg = noise_sigma(y)
    lor = tail > 0.01 * pp and tail > 5 * sg
    w = dB * math.sqrt(3) / 2
    inL, inR = lo, hi
    Z = epr_zone_idx(B, zones)
    if Z:
        ed = [[min(B[ks[0]], B[ks[-1]]), max(B[ks[0]], B[ks[-1]])] for ks in Z]
        Ls = [q for q in ed if q[1] <= Bc]
        Rs = [q for q in ed if q[0] >= Bc]
        inL = max(q[1] for q in Ls) if Ls else -INF
        inR = min(q[0] for q in Rs) if Rs else INF
    else:
        e = max(2, js_round(n * 0.05))
        d = (hi - lo) * e / (n - 1)
        inL = lo + d
        inR = hi - d
    R = js_min(Bc - inL, inR - Bc)
    loss = 0.75 * w * (hi - lo) / (R * R) + (w / math.pi * (1 / (Bc - lo) + 1 / (hi - Bc)) if Z else 0) if R > 0 else 1
    return {'warn': bool(lor and loss > 0.02), 'loss': loss}


def epr_line_field(B, y):
    # index.html eprLineField
    n = len(y)
    if not n:
        return NAN
    med = sorted(y)[n >> 1]
    k = 0
    for i in range(1, n):
        if abs(y[i] - med) > abs(y[k] - med):
            k = i
    return B[k]


# ============================== XRF: aree con l'inviluppo (index.html peakAreas, hullBaseAt) ==============================
def peak_areas_hull(xs, ys, pks):
    # index.html peakAreas: come acch_ricetta.peak_areas, in più l'inviluppo «hull» che techMetrics usa per i conteggi netti
    n = len(ys)
    if n < 9 or not pks:
        return []
    sig_raw = noise_sigma(ys)
    sm1 = sg_smooth(ys, 5)
    wch = _strong_width(sm1, sig_raw, n)
    m = max(2, min(js_round(0.6 * wch / 2), js_round(n / 40)))
    sm = sg_smooth(ys, 2 * m + 1)
    sig = max(sig_raw * sg_noise_gain(m), 1e-15)
    tol = 3 * sig
    order = sorted([{'k': k, 'i': nearest_idx(xs, x)} for k, x in enumerate(pks)], key=lambda o: o['i'])
    out = [None] * len(pks)
    for r, o in enumerate(order):
        left_stop = order[r - 1]['i'] if r > 0 else 0
        right_stop = order[r + 1]['i'] if r < len(order) - 1 else n - 1
        i = o['i']
        span = max(2 * m, 3)
        for k in range(max(left_stop + 1, o['i'] - span), min(right_stop - 1, o['i'] + span) + 1):
            if sm[k] > sm[i]:
                i = k
        lmin = sm[i]
        j = i - 1
        while j >= left_stop and sm[j] <= sm[i] + tol:
            if sm[j] < lmin:
                lmin = sm[j]
            j -= 1
        rmin = sm[i]
        j = i + 1
        while j <= right_stop and sm[j] <= sm[i] + tol:
            if sm[j] < rmin:
                rmin = sm[j]
            j += 1
        prom = max(sm[i] - max(lmin, rmin), sig)
        half = sm[i] - prom / 2
        a = b = i
        while a > left_stop and sm[a] > half:
            a -= 1
        while b < right_stop and sm[b] > half:
            b += 1
        w = max(2, b - a)
        rise = max(3 * sig, 0.03 * prom)

        def walk(step, stop, floor, i=i, w=w, rise=rise):
            lim = max(stop, i - 6 * w, 0) if step < 0 else min(stop, i + 6 * w, n - 1)
            jj, best, bv = i, i, sm[i]
            while (jj > lim) if step < 0 else (jj < lim):
                jj += step
                if sm[jj] < bv:
                    bv = sm[jj]
                    best = jj
                if sm[jj] > bv + rise:
                    break
                if sm[jj] <= floor:
                    best = jj
                    break
            return best
        L = min(o['i'], walk(-1, left_stop, lmin + max(0.01 * prom, sig)))
        R = max(o['i'], walk(+1, right_stop, rmin + max(0.01 * prom, sig)))
        hw = max(m, js_round(w / 3))

        def avg(lo, hi):
            lo, hi = max(0, lo), min(n - 1, hi)
            t = 0.0
            c = 0
            for k in range(lo, hi + 1):
                t += ys[k]
                c += 1
            return t / c if c else 0.0
        y0 = min(sm[L] + tol, avg(max(left_stop, L - hw), L)) if L > left_stop else sm[L]
        y1 = min(sm[R] + tol, avg(R, min(right_stop, R + hw))) if R < right_stop else sm[R]

        def val(k, L=L, R=R, y0=y0, y1=y1):
            return y0 if k == L else (y1 if k == R else sm[k])
        pen = False
        for k in range(L + 1, R):
            ln = y0 + (y1 - y0) * (xs[k] - xs[L]) / js_or1(xs[R] - xs[L])
            if sm[k] < ln - tol:
                pen = True
                break
        hull = []
        if not pen:
            hull = [L, R]
        else:
            for k in range(L, R + 1):
                while len(hull) >= 2:
                    p1, p2 = hull[-2], hull[-1]
                    if (xs[p2] - xs[p1]) * (val(k) - val(p1)) - (val(p2) - val(p1)) * (xs[k] - xs[p1]) <= 0:
                        hull.pop()
                    else:
                        break
                hull.append(k)
        base = [0.0] * (R - L + 1)
        for h in range(len(hull) - 1):
            p1, p2 = hull[h], hull[h + 1]
            v1, v2 = val(p1), val(p2)
            for k in range(p1, p2 + 1):
                base[k - L] = v1 + (v2 - v1) * (xs[k] - xs[p1]) / js_or1(xs[p2] - xs[p1])
        A = 0.0
        for k in range(L, R):
            A += 0.5 * ((ys[k] - base[k - L]) + (ys[k + 1] - base[k + 1 - L])) * (xs[k + 1] - xs[k])
        out[o['k']] = {'ia': L, 'ib': R, 'xa': xs[L], 'xb': xs[R], 'area': max(0.0, A), 'hull': [[k, val(k)] for k in hull]}
    return out


def hull_base_at(hull, k):
    # index.html hullBaseAt
    for h in range(len(hull) - 1):
        k1, v1 = hull[h]
        k2, v2 = hull[h + 1]
        if k >= k1 and k <= k2:
            return v1 + (v2 - v1) * (k - k1) / js_or1(k2 - k1)
    return hull[-1][1] if hull else 0


def currie_full(net, bkg):
    # index.html currie (Currie 1968)
    B = max(0, bkg)
    LC = 2.33 * math.sqrt(B)
    LD = 2.71 + 4.65 * math.sqrt(B)
    s = math.sqrt(max(0, net) + 2 * B)
    return {'net': net, 'sigma': s, 'LC': LC, 'LD': LD, 'detected': net > LD, 'critical': net > LC}


# ============================== deconvoluzione (index.html fitPeaks, hiddenBands) ==============================
LN2 = 0.6931471805599453   # Math.LN2
SQ_LN2_PI = math.sqrt(LN2 / math.pi)


AMIDE_I = [[1600, 1615, 'catene laterali (Tyr, Asn, Gln…)', 'side chains'], [1615, 1637, 'foglietto β', 'β-sheet'], [1637, 1645, 'disordinata (random coil)', 'random coil'],
           [1645, 1662, 'α-elica', 'α-helix'], [1662, 1681, 'ripiegamenti (turn)', 'turns'], [1681, 1700, 'foglietto β antiparallelo / aggregati', 'antiparallel β-sheet / aggregates']]


def amide_i(xs, yA):
    # index.html amideI
    a = 0
    while a < len(xs) and xs[a] < 1590:
        a += 1
    b = len(xs) - 1
    while b >= 0 and xs[b] > 1710:
        b -= 1
    if b - a < 20:
        return None
    X, Y = xs[a:b + 1], yA[a:b + 1]
    hb = [h['x'] for h in cm_hidden_bands(X, Y, None) if h['x'] > 1602 and h['x'] < 1698]
    seeds = hb if hb else [1630, 1655, 1675, 1690]
    fit = cm_fit_peaks(X, Y, [{'x': x, 'w': 18} for x in seeds], {'profile': 'gauss', 'base': 'lin'})
    if not fit:
        return None
    cls = [{'lo': lo, 'hi': hi, 'it': it, 'en': en, 'area': 0.0, 'comps': []} for lo, hi, it, en in AMIDE_I]
    tot = 0.0
    for q in fit['peaks']:
        if q['area'] <= 0:
            continue
        c = next((c for c in cls if q['c'] >= c['lo'] and q['c'] < c['hi']), None) or (cls[0] if q['c'] < 1600 else cls[-1])
        c['area'] += q['area']
        c['comps'].append(q['c'])
        if c is not cls[0]:
            tot += q['area']
    for i, c in enumerate(cls):
        c['pct'] = None if (i == 0 or not tot) else 100 * c['area'] / tot
    return {'fit': fit, 'cls': cls}


# ============================== techMetrics (index.html) ==============================
def tech_metrics(v, ctx):
    """index.html techMetrics(f, d): {title, head, rows} come per la tabella e per parametri_per_tecnica.csv."""
    it = v['instr']
    P = v['P']
    U = t_up(P)
    an = v.get('an') or {}
    S = ctx.get('S') or {}
    peaks = _peaks(v)
    o = {'title': '', 'head': [], 'rows': []}

    def T(x):
        return t_fmt_n(x, 1)
    if it == 'chem':
        if v.get('chem') is not None:
            # AcchChem.techRows: acch_sorp.chem_tech_rows sui dati letti (v['chem']) con le opzioni f.an.chem
            o['title'] = '🧮 Chemisorbimento'
            o['head'] = ['Grandezza', 'Valore', 'Unità', 'Nota']
            o['rows'] = chem_tech_rows(v['chem'], v.get('chemOpt'), _en())
        return o
    if it == 'sorp':
        if v.get('iso') is not None:
            # AcchSorp.techRows: acch_sorp.sorp_tech_rows sull'isoterma letta, con le opzioni f.an.sorp e il riferimento αs
            o['title'] = '🧮 Fisisorbimento'
            o['head'] = ['Grandezza', 'Valore', 'Unità', 'Nota']
            o['rows'] = sorp_tech_rows(v['iso'], v.get('sorpOpt'), v.get('sorpRif'), _en())
        return o
    if an.get('calc') and it in ('uv', 'ftir', 'raman'):
        o['title'] = 'Dato calcolato'
        return o
    if P.get('deriv') or P['kind'] == 'N':
        if it in ('hplc', 'dsc', 'tga', 'uv', 'epr', 'nmr', 'xrf', 'raman', 'fluo'):
            o['title'] = '🧮 Parametri quantitativi'
        return o
    xs = P['xs']
    if it == 'hplc':
        o['title'] = '🧮 Figure di merito cromatografiche'
        cm = chrom_metrics(xs, U, [{'x': p['x'], 'xa': p.get('xa'), 'xb': p.get('xb')} for p in peaks], an.get('t0'))
        o['head'] = ['tR (min)', 'Altezza', 'W½ (min)', 'N', 'Coda T', 'As', 'Rs', 'k', 'S/N']
        o['rows'] = [[t_fmt_n(c['tR'], 3), t_fmt_g(c['H'], 3), t_fmt_n(c['w50'], 4) if c['w50'] is not None else '—',
                      t_loc_int(c['N']) if c.get('N') is not None else '—', t_fmt_n(c['tailing'], 2) if c.get('tailing') is not None else '—',
                      t_fmt_n(c['asym'], 2) if c.get('asym') is not None else '—', t_fmt_n(c['rs'], 2) if c.get('rs') is not None else '—',
                      t_fmt_n(c['k'], 2) if c.get('k') is not None else '—', t_fmt_sn(c['sn'])] for c in cm]
    if it == 'dsc':
        o['title'] = '🧮 Temperature di onset ed endset (DSC)'
        o['head'] = ['Evento', 'T picco (°C)', 'Onset (°C)', 'Endset (°C)', 'ΔH']
        for p in peaks:
            if p.get('xa') is None:
                continue
            s = p.get('side') or 1
            yy = [q * s for q in P['ys']]
            on = tangent_onset(xs, yy, p['xa'], p['x'], p['xb'])
            o['rows'].append([p.get('sign') or '', T(p['x']), T(on['onset']) if on and on['onset'] is not None else '—',
                              T(on['endset']) if on and on['endset'] is not None else '—',
                              t_fmt_n(p['dH'], 2) + ' ' + re.sub(r'^ΔH \(|\)$', '', p['dHu']) if p.get('dH') is not None else '—'])
    if it == 'tga' and P.get('mass') is not None:
        o['title'] = '🧮 Gradini di degradazione (TGA)'
        o['head'] = ['DTG max (°C)', 'Onset (°C)', 'Endset (°C)', 'Perdita (%)']
        for p in peaks:
            if p.get('xa') is None:
                continue
            on = tga_onset(xs, P['mass'], p['xa'], p['x'], p['xb'])
            o['rows'].append([T(p['x']), T(on['onset']) if on and on['onset'] is not None else '—', T(on['endset']) if on and on['endset'] is not None else '—',
                              t_fmt_n(p['area'], 2) if p.get('area') is not None else '—'])
    if it == 'uv':
        o['title'] = '🧮 Band gap ottico (grafico di Tauc)'
        if an.get('data') == 'refl':
            y = P['ys'] if P['kind'] == 'T' else [100 * m_pow(10, -q) for q in P['ys']]
        else:
            y = U
        tg = tauc_gap(xs, y, {'trans': an.get('trans') or 'direct', 'data': an.get('data') or 'abs'})
        if not tg:
            return o
        o['head'] = ['Grandezza', 'Valore']
        o['rows'] = [['<b>Eg (eV)</b>', '<b>%s</b>' % t_fmt_n(tg['Eg'], 3)], ['Eg (nm)', js_str(float(js_round(1239.84 / tg['Eg'])))],
                     ['Tratto lineare (eV)', '%s – %s' % (t_fmt_n(tg['seg'][0], 2), t_fmt_n(tg['seg'][1], 2))], ['R² del tratto lineare', t_fmt_n(tg['fit']['r2'], 4)]]
        if tg['EgTail'] is not None:
            o['rows'].append(["Intersezione con l'asse, senza correzione della coda (eV)", t_fmt_n(tg['EgAxis'], 3)])
    if it == 'epr' and P['kind'] == 'E':
        o['title'] = '🧮 Doppio integrale (quantità relativa di spin)'
        al = []
        for g in ctx.get('files') or [v]:
            if g['instr'] != 'epr':
                continue
            Q = g['P']
            if Q['kind'] != 'E' or Q.get('deriv'):
                continue
            ab = epr_is_absorption(Q['xs'], Q['ys'])
            Z = epr_zones_of(g.get('an'))
            di = {'di': epr_single_integral(Q['xs'], Q['ys'])} if ab else epr_double_integral(Q['xs'], Q['ys'], Z)
            if not di:
                continue
            al.append({'g': g, 'ab': ab, 'Z': Z, 'wg': None if ab else epr_wings(Q['xs'], Q['ys'], Z), 'di': di})
        mx = js_max(*([abs(q['di']['di']) for q in al] + [1e-300]))
        o['head'] = ['Spettro', 'Doppio o singolo integrale' if any(q['ab'] for q in al) else 'Doppio integrale', 'Relativo al massimo (%)', 'Nota', 'Base']

        def odd(g):
            if not (g.get('freq') and g['freq'] > 0):
                ec = g.get('eprConv')
                return g['xs'][-1] > 1000 or bool(ec is not None and ec.get('by') == 'range' and ec.get('k') != 1)
            B = epr_line_field(g['xs'], g['ys'])
            gg = 71.4477 * g['freq'] / B if B > 0 else 0
            return gg < 1.2 or gg > 12

        def edge_bad(q):
            Q = q['g']['P']
            ed = epr_edge_signal(Q['xs'], Q['ys'], q['Z'])
            return bool(ed and ed['edge']) or (not q['ab'] and q['di']['di'] < 0)
        for q in al:
            g = q['g']
            note = ['⚠️ spettro in assorbimento, non in derivata: integrale singolo' if q['ab'] else '',
                    ('⛔ segnale nelle zone di fondo o valore negativo: non affidabile' if q['Z'] else '⛔ segnale agli estremi o valore negativo: non affidabile') if edge_bad(q)
                    else ('⚠️ ali della riga nella base: valore sottostimato' if (q['wg'] and q['wg']['warn']) else ''),
                    '⚠️ unità del campo da controllare' if odd(g) else '']
            o['rows'].append([('▶ ' if g['id'] == v['id'] else '') + g['titolo'], t_fmt_g(q['di']['di'], 4), t_fmt_n(100 * abs(q['di']['di']) / mx, 1),
                              '; '.join(t for t in note if t), '' if q['ab'] else epr_zones_txt(q['Z'], _en())])
    if it == 'nmr':
        o['title'] = '🧮 Integrali relativi (NMR)'
        if not S.get('showArea'):
            return o
        pk = [p for p in peaks if p.get('area') is not None]
        nx = an.get('nmrX')
        ref = next((p for p in pk if nx is not None and abs(p['x'] - nx) < 0.02), None) or (pk[0] if pk else None)
        nH = an.get('nmrN') or 1
        if not pk:
            return o
        o['head'] = ['δ (ppm)', 'Nome', 'Integrale', 'Nuclei relativi']
        o['rows'] = [[p['num'], p['name'] if p.get('custom') else '', t_fmt_g(p['area'], 4), t_fmt_n(jdiv(p['area'], ref['area']) * nH, 2)] for p in pk]
    if it == 'xrf' and P['kind'] == 'I' and not v.get('uncal') and peaks:
        o['title'] = '🧮 Conteggi netti e limiti di rilevabilità (XRF)'
        ar = peak_areas_hull(xs, P['ys'], [p['x'] for p in peaks])
        o['head'] = ['Energia (keV)', 'Riga', 'Netti', 'σ', 'L_D', 'Esito']
        for j, p in enumerate(peaks):
            a = ar[j] if j < len(ar) else None
            if not a:
                o['rows'].append([p['num'], '', '—', '—', '—', ''])
                continue
            net = B = 0.0
            for kk in range(a['ia'], a['ib'] + 1):
                b = hull_base_at(a['hull'], kk)
                B += b
                net += P['ys'][kk] - b
            c = currie_full(net, B)
            nm = p['name'] if p.get('custom') else ((p['sugg'][0].get('it') or '') if p['sugg'] else '')
            o['rows'].append([p['num'], t_esc(nm), t_loc_int(c['net']), t_loc_int(c['sigma']), t_loc_int(c['LD']),
                              '✅ rilevato' if c['detected'] else ('🟡 dubbio' if c['critical'] else '⛔ non rilevato')])
    if it == 'ftir' and P['kind'] != 'N' and v.get('sample') == 'bio' and any(1615 <= p['x'] <= 1700 for p in peaks) and any(1500 <= p['x'] <= 1585 for p in peaks):
        o['title'] = '🧮 Proteine: struttura secondaria (ammide I)'
        asc = xs[0] < xs[-1]
        X = xs if asc else list(reversed(xs))
        Y = U if asc else list(reversed(U))
        R = amide_i(X, Y)
        if not R:
            return o
        o['head'] = ['Struttura', 'Componenti (cm⁻¹)', 'Area %']
        o['rows'] = [[c['it'], ', '.join(t_fmt_n(x, 0) for x in c['comps']), t_fmt_n(c['pct'], 1) if c['pct'] is not None else '<small class="opt-l">esclusa</small>']
                     for c in R['cls'] if c['comps']]
    if it == 'raman' and P['kind'] != 'N':
        D = [p for p in peaks if 1310 <= p['x'] <= 1370]
        G = [p for p in peaks if 1560 <= p['x'] <= 1615]
        if D and G:
            o['title'] = '🧮 Carbonio: rapporto I(D)/I(G)'
            dp = js_sort(D, _by_prom_desc)[0]
            gp = js_sort(G, _by_prom_desc)[0]
            a = 0
            while a < len(xs) and xs[a] < 1000:
                a += 1
            b = len(xs) - 1
            while b > 0 and xs[b] > 1800:
                b -= 1
            fit = cm_fit_peaks(xs[a:b + 1], U[a:b + 1], [{'x': dp['x'], 'w': 60}, {'x': gp['x'], 'w': 40}], {'profile': 'lor', 'base': 'lin'}) if b - a > 20 else None
            bmin = INF
            for kk in range(a, b + 1):
                bmin = js_min(bmin, U[kk])
            hD = interp_y(xs, U, dp['x']) - bmin
            hG = interp_y(xs, U, gp['x']) - bmin
            rH = jdiv(fit['peaks'][0]['h'], fit['peaks'][1]['h']) if fit else jdiv(hD, hG)
            rA = jdiv(fit['peaks'][0]['area'], fit['peaks'][1]['area']) if fit else None
            lam = an.get('laser')
            o['head'] = ['Grandezza', 'Valore']
            o['rows'] = [['D (cm⁻¹)', t_fmt_n(fit['peaks'][0]['c'] if fit else dp['x'], 1)], ['G (cm⁻¹)', t_fmt_n(fit['peaks'][1]['c'] if fit else gp['x'], 1)],
                         ['I(D)/I(G) altezze', t_fmt_n(rH, 3)]]
            if rA is not None:
                o['rows'].append(['A(D)/A(G) aree (fit lorentziano)', t_fmt_n(rA, 3)])
            if rA and rA == rA and lam is not None and lam > 0:
                o['rows'].append(['La (nm)', t_fmt_n(2.4e-10 * m_pow(lam, 4) / rA, 1)])
    if it == 'fluo' and P['kind'] != 'N':
        o['title'] = '🧮 Resa quantica relativa'
        refs = [g for g in (ctx.get('files') or []) if g['id'] != v['id'] and g['instr'] == 'fluo']

        def integ(g):
            Q = g['P']
            s = 0.0
            for kk in range(1, len(Q['xs'])):
                s += 0.5 * (Q['ys'][kk] + Q['ys'][kk - 1]) * abs(Q['xs'][kk] - Q['xs'][kk - 1])
            return s
        rg = next((g for g in refs if g.get('fkey') == an.get('qyRef')), None)
        F = integ(v)
        o['head'] = ['Grandezza', 'Valore']
        o['rows'] = [['Emissione integrata F', t_fmt_g(F, 4)]]
        if rg:
            Fr = integ(rg)
            ns = an.get('ns') or 1.333
            nr = an.get('nr') or 1.333
            o['rows'].append(['Emissione integrata standard F_R', t_fmt_g(Fr, 4)])
            if (an.get('phiR') or 0) > 0 and (an.get('As') or 0) > 0 and (an.get('Ar') or 0) > 0:
                phi = an['phiR'] * jdiv(F, Fr) * ((1 - m_pow(10, -an['Ar'])) / (1 - m_pow(10, -an['As']))) * (ns * ns / (nr * nr))
                o['rows'].append(['<b>Resa quantica Φ</b>', '<b>%s</b>' % t_fmt_n(phi, 3)])
            else:
                o['rows'].append(['Resa quantica Φ', 'inserisci Φ dello standard e le due assorbanze'])
    return o


# ============================== controllo di qualità: aiuti (index.html) ==============================
def _get(a, i):
    # a[i] di JavaScript: undefined (qui NaN) fuori dall'array
    return a[i] if 0 <= i < len(a) else NAN


def peak_fwhm_pts(xs, y, x0):
    # index.html peakFwhmPts
    k, best = 0, INF
    for i in range(len(xs)):
        dx = abs(xs[i] - x0)
        if dx < best:
            best = dx
            k = i
    v = sorted(y)
    base = v[len(v) >> 2]
    yk = _get(y, k)
    t = base + (yk - base) / 2
    if not (yk > base):
        return 0
    l = r = k
    while l > 0 and _get(y, l) > t:
        l -= 1
    while r < len(y) - 1 and _get(y, r) > t:
        r += 1
    return r - l


def peak_shape(xs, y, x0):
    # index.html peakShape
    v = sorted(y)
    base = v[len(v) >> 2]
    k, best = 0, INF
    for i in range(len(xs)):
        dx = abs(xs[i] - x0)
        if dx < best:
            best = dx
            k = i
    h = y[k] - base
    sg = noise_sigma(y) or 0
    if not (h > 0) or h < 20 * sg:
        return {}

    def w(q):
        t = base + q * h
        l = r = k
        while l > 0 and y[l] > t:
            l -= 1
        while r < len(y) - 1 and y[r] > t:
            r += 1
        return None if (l == 0 or r == len(y) - 1) else (l, r)
    a, b = w(0.5), w(0.1)
    if not a or not b or a[1] - a[0] < 12:
        return {}

    def at(i, j, q):
        t = base + q * h
        d = y[j] - y[i]
        return xs[i] + ((t - y[i]) / d if d else 0.5) * (xs[j] - xs[i])
    W5 = abs(at(a[1], a[1] - 1, 0.5) - at(a[0], a[0] + 1, 0.5))
    W1 = abs(at(b[1], b[1] - 1, 0.1) - at(b[0], b[0] + 1, 0.1))
    L = xs[k] - xs[b[0]]
    Rr = xs[b[1]] - xs[k]
    tops = sorted([y[i] for i in range(a[0], a[1] + 1)], reverse=True)
    yt = tops[min(4, len(tops) - 1)]
    tol = js_max(2 * sg, 0.02 * h)
    npk = 0
    for i in range(a[0], a[1] + 1):
        if y[i] >= yt - tol:
            npk += 1
    plat = npk / max(1, a[1] - a[0])
    return {'flat': W5 > 0 and (jdiv(W1, W5) < 1.55 or (h > 50 * sg and plat > 0.5 + 3 * sg / h)),
            'asym': L > 0 and Rr > 0 and (Rr / L > 2.5 or L / Rr > 2.5)}


def sticks_like(xs, ys):
    # index.html sticksLike
    n = len(xs) if xs else 0
    if n < 3 or n > 5000:
        return False
    z = iso = 0
    for i in range(n):
        if ys[i] == 0:
            z += 1
        elif (i == 0 or ys[i - 1] == 0) and (i == n - 1 or ys[i + 1] == 0):
            iso += 1
    if z >= 0.5 * n and iso >= 3 and iso >= 0.8 * (n - z):
        return True
    if n > 500:
        return False
    d = [abs(xs[i] - xs[i - 1]) for i in range(1, n)]
    m = sorted(d)[len(d) >> 1]
    if not (m > 0):
        return False
    odd = len([q for q in d if q > 1.5 * m or q < m / 1.5])
    return max(d) > 5 * m and odd >= 0.2 * len(d)


def signal_quality(xs, ys, dir_, counts):
    # index.html signalQuality
    n = len(ys)
    y = [q * (dir_ or 1) for q in ys]
    sig = noise_robust(y) or 1e-30
    mn, mx, im = INF, -INF, 0
    for i in range(n):
        if y[i] < mn:
            mn = y[i]
        if y[i] > mx:
            mx = y[i]
            im = i
    flat = 1
    tolf = 1e-9 * max(1, abs(mx))
    k = im + 1
    while k < n and abs(y[k] - mx) <= tolf:
        flat += 1
        k += 1
    k = im - 1
    while k >= 0 and abs(y[k] - mx) <= tolf:
        flat += 1
        k -= 1
    bl = baseline_arpls(xs, y)
    r = [0.0] * n
    bmin, bmax, rmax, ir = INF, -INF, 0, 0
    for i in range(n):
        r[i] = y[i] - bl[i]
        if bl[i] < bmin:
            bmin = bl[i]
        if bl[i] > bmax:
            bmax = bl[i]
        if r[i] > rmax:
            rmax = r[i]
            ir = i
    if counts:
        pf = math.sqrt(js_max(1, bl[ir]))
        if sig < 0.5 * pf:
            sig = pf
    steps = [abs(xs[i] - xs[i - 1]) for i in range(1, min(n, 3000))]
    st = median(steps)
    irregular = len([s for s in steps if s > 3 * st or s < st / 3]) / (len(steps) or 1)
    return {'snr': jdiv(rmax, sig), 'flat': flat, 'bgRatio': jdiv(bmax - bmin, js_or1(rmax + (bmax - bmin))), 'wPts': peak_width_pts(r), 'irregular': irregular}


def despike_at(ys, thr=7, max_w=3):
    # index.html despike: come acch_ricetta.despike, ma restituisce anche le posizioni («at») che assess usa
    n = len(ys)
    if n < 10:
        return {'n': 0, 'at': []}
    d = [ys[i] - ys[i - 1] for i in range(1, n)]
    med = median(d)
    mad = median([abs(v - med) for v in d]) or 1e-30

    def z(i):
        return 0.6745 * (d[i - 1] - med) / mad if 1 <= i < n else 0
    flag = [0] * n
    for i in range(1, n - 1):
        if abs(z(i)) > thr or abs(z(i + 1)) > thr:
            flag[i] = 1
    at = []
    i = 1
    while i < n - 1:
        if not flag[i]:
            i += 1
            continue
        j = i
        while j + 1 < n - 1 and flag[j + 1]:
            j += 1
        a, b, wd = i - 1, j + 1, j - i + 1
        if wd <= max_w + 1 and a >= 0 and b < n:
            dev = 0
            for k in range(i, j + 1):
                ln = ys[a] + (ys[b] - ys[a]) * (k - a) / (b - a)
                dev = js_max(dev, abs(ys[k] - ln))
            top = i
            for k in range(i, j + 1):
                if abs(ys[k] - ys[a] - (ys[b] - ys[a]) * (k - a) / (b - a)) > abs(ys[top] - ys[a] - (ys[b] - ys[a]) * (top - a) / (b - a)):
                    top = k
            base = min(ys[max(0, i - 6)], ys[min(n - 1, j + 6)])
            half = (ys[top] - base) / 2
            hw = 1
            sgn = 1 if half > 0 else (-1 if half < 0 else 1)
            k = top - 1
            while k >= max(0, top - 6) and sgn * (ys[k] - base) > sgn * half:
                hw += 1
                k -= 1
            k = top + 1
            while k <= min(n - 1, top + 6) and sgn * (ys[k] - base) > sgn * half:
                hw += 1
                k += 1
            if hw <= max_w and dev > thr * mad / 0.6745 / math.sqrt(2):
                at.append(i)
        i = j + 1
    return {'n': len(at), 'at': at}


def dsc_rate(v):
    # index.html dscRate
    if (v.get('userRate') or 0) > 0:
        return v['userRate']
    th = v.get('therm') or {}
    if (th.get('rate') or 0) > 0:
        return th['rate']
    ts = v.get('ts')
    if ts and len(ts) > 10:
        xs = v['xs']
        r = []
        st = max(1, math.floor(len(xs) / 200))
        for k in range(st, len(xs), st):
            dt = ts[k] - ts[k - st]
            if abs(dt) > 1e-9:
                r.append(abs((xs[k] - xs[k - st]) / dt) * 60)
        r = sorted(r)
        if r:
            return r[len(r) >> 1]
    return th['rate'] if (th.get('rate') or 0) > 0 else None


COSTANTI_XRF = {}   # JSON dell'app: XRF_COMMON, XRF_LINES, XRF_LN_GR, XRF_TUBES e FP (FP.el[El].fam, ...); si caricano con carica_costanti


def carica_costanti(c):
    COSTANTI_XRF.clear()
    COSTANTI_XRF.update(c or {})


def _cst(k):
    if k not in COSTANTI_XRF:
        raise NonTrascritto(tt('tabella %s non fornita: serve il JSON delle costanti dell\'app (COSTANTI_XRF)', 'table %s not given: the JSON of the app constants is needed (COSTANTI_XRF)') % k)
    return COSTANTI_XRF[k]


def xrf_align_fit(peaks, tube):
    # index.html xrfAlignFit
    FPel = _cst('FP')['el']
    XRF_COMMON, XRF_LINES, XRF_LN_GR, XRF_TUBES = _cst('XRF_COMMON'), _cst('XRF_LINES'), _cst('XRF_LN_GR'), _cst('XRF_TUBES')
    MAJ = {'Ka': 1, 'Kb': 1, 'La': 1, 'Lb1': 1}
    L = []
    for el in XRF_COMMON:
        F = FPel[el].get('fam') if el in FPel else None
        if F:
            for fam in ('K', 'L'):
                for row in (F.get(fam) or []):
                    nm, E, rel = row[0], row[1], row[2]
                    if E >= 1.5 and rel >= 0.02 and XRF_LN_GR.get(nm):
                        L.append({'E': E, 'el': el, 'minor': not MAJ.get(nm), 'name': '%s %s' % (el, XRF_LN_GR[nm])})
        else:
            for ln, E in [(q[0], q[1]) for q in (XRF_LINES.get(el) or [])]:
                if E >= 1.5:
                    L.append({'E': E, 'el': el, 'minor': False, 'name': '%s %s' % (el, ln)})
    if tube and tube in XRF_TUBES:
        TK = FPel[tube]['fam'].get('K') if (tube in FPel and FPel[tube].get('fam')) else None

        def tE(ln):
            q = next((r for r in TK if XRF_LN_GR.get(r[0]) == ln), None) if TK else None
            return q[1] if q else XRF_TUBES[tube].get(ln)
        for ln in ('Kα', 'Kβ', 'Lα', 'Lβ'):
            if XRF_TUBES[tube].get(ln):
                L.append({'E': tE(ln), 'el': 'tubo', 'minor': False, 'name': '%s %s (tubo)' % (tube, ln)})
    L = sorted(L, key=lambda p: p['E'])
    tKa = XRF_TUBES[tube]['Kα'] if (tube and tube in XRF_TUBES) else None

    def is_esc(q):
        return any((r.get('w') or 0) >= 3 * (q.get('w') or 0) and abs(r['x'] - 1.74 - q['x']) <= 0.06 for r in peaks)
    P = [q for q in peaks if q['x'] >= 1.5 and not is_esc(q) and not (tKa and q['x'] > tKa - 1.2 and q['x'] < tKa - 0.15)]
    P = sorted(P, key=lambda q: (q.get('w') or 0), reverse=True)[:10]
    P = [{'x': q['x'], 'w': math.sqrt(js_max(q.get('w') or 1, 1))} for q in P]
    if len(P) < 2:
        return None

    def near0(E, ok):
        best = None
        for l in L:
            if l['E'] < E - 0.3:
                continue
            if l['E'] > E + 0.3:
                break
            if l['minor'] and not (ok and l['el'] in ok):
                continue
            if not best or abs(l['E'] - E) < abs(best['E'] - E):
                best = l
        return best or {'E': INF}

    def ok_els(a, b):
        ok = set()
        for p in P:
            E = a + b * p['x']
            l = near0(E, None)
            if abs(l['E'] - E) < 0.04:
                ok.add(l['el'])
        return ok
    cur = [None]

    def near(E):
        return near0(E, cur[0])

    def score(a, b):
        cur[0] = ok_els(a, b)
        s = 0.0
        n = 0
        for p in P:
            d = abs(near(a + b * p['x'])['E'] - (a + b * p['x']))
            if d < 0.04:
                n += 1
            s += p['w'] * m_exp(-((d / 0.025) ** 2))
        return {'s': s, 'n': n}
    id0 = score(0, 1)
    best = {'a': 0, 'b': 1, 's': id0['s'], 'n': id0['n']}
    top = P[:6]
    for i in range(len(top)):
        for k in range(i + 1, len(top)):
            p, q = top[i], top[k]
            if abs(q['x'] - p['x']) < 1:
                continue
            Lp = [l for l in L if abs(l['E'] - p['x']) < 0.4]
            Lq = [l for l in L if abs(l['E'] - q['x']) < 0.4]
            for l1 in Lp:
                for l2 in Lq:
                    if l1 is l2:
                        continue
                    b = (l2['E'] - l1['E']) / (q['x'] - p['x'])
                    a = l1['E'] - b * p['x']
                    if not (b > 0.97 and b < 1.03) or abs(a) > 0.3:
                        continue
                    r = score(a, b)
                    if r['s'] > best['s']:
                        best = {'a': a, 'b': b, 's': r['s'], 'n': r['n']}
    moved = best['a'] != 0 or best['b'] != 1
    keep = not moved or best['s'] < 1.3 * id0['s'] or best['n'] < 3
    a0 = 0 if keep else best['a']
    b0 = 1 if keep else best['b']
    cur[0] = ok_els(a0, b0)
    pairs = []
    for p in P:
        E = a0 + b0 * p['x']
        l = near(E)
        if abs(l['E'] - E) < 0.04:
            pairs.append({'x': p['x'], 'E': l['E'], 'name': l['name'], 'w': p['w']})
    pairs = [q for k, q in enumerate(pairs) if next(i for i, r in enumerate(pairs) if r['E'] == q['E']) == k]
    if keep:
        return {'a': 0, 'b': 1, 'pairs': pairs}
    a, b = a0, b0
    if len(pairs) >= 3:
        W = 0.0
        for q in pairs:
            W += q['w']
        mx = 0.0
        for q in pairs:
            mx += q['w'] * q['x']
        mx /= W
        mE = 0.0
        for q in pairs:
            mE += q['w'] * q['E']
        mE /= W
        sxx = sxy = 0.0
        for q in pairs:
            sxx += q['w'] * (q['x'] - mx) ** 2
            sxy += q['w'] * (q['x'] - mx) * (q['E'] - mE)
        if sxx > 0:
            bb = sxy / sxx
            if bb > 0.97 and bb < 1.03:
                b = bb
                a = mE - b * mx
    return {'a': a, 'b': b, 'pairs': pairs}


RE_REASON = re.compile(r'^(asse X in minuti|intervallo 150|intervallo IR|shift cm|conteggi interi)')


# ============================== assess (index.html) ==============================
def assess(v, ctx):
    """index.html assess(f, d): i messaggi {lv, t} del controllo di qualità, nell'ordine dell'app (testi in italiano;
    in inglese li traduce csvCell con TRAD, come nell'app)."""
    it = v['instr']
    if it == 'sorp' and v.get('iso') is not None:
        return sorp_assess(v['iso'], v.get('sorpOpt'), v.get('sorpRif'), v.get('importNotes'), _en(), bool(ctx.get('desk')))   # AcchSorp.assess
    if it == 'chem' and v.get('chem') is not None:
        return chem_assess(v['chem'], v.get('chemOpt'), _en(), bool(ctx.get('desk')))   # AcchChem.assess
    P = v['P']
    S = ctx.get('S') or {}
    an = v.get('an') or {}
    peaks = _peaks(v)
    fxs, fys = v['xs'], v['ys']
    uncal = bool(v.get('uncal'))
    out = []

    def add(lv, t):
        out.append({'lv': lv, 't': t})

    def fp(x):
        return t_fmt_peak(it, x, uncal, v.get('nuc'))
    raw = transform_y(fys, 'T', 'A')[0] if v.get('kind') == 'T' else fys
    shape_ok = it not in ('tga', 'dsc', 'epr')
    for n_ in v.get('importNotes') or []:
        add('bad' if (re.search('NTUPLES', n_) or n_ in (v.get('importBad') or [])) else 'warn', n_ + '.')
    if RE_REASON.match(v.get('reason') or '') and it == v.get('autoInstr'):
        add('info', 'Tecnica dedotta solo dagli intervalli dei numeri (%s): controlla che sia giusta in «Dati dello spettro».' % v['reason'])
    if v.get('suspectT'):
        add('warn', 'Valori tra 0 e 1 con il fondo in alto: sembra trasmittanza in frazione, letta come assorbanza. In questo caso le bande sono invertite e le ipotesi sbagliate: in «Dati dello spettro» scegli l\'asse Y, «trasmittanza %» oppure «assorbanza» se il dato è già un\'assorbanza.')
    if it == 'xrf':
        neg = len([q for q in fys if q < 0])
        if neg:
            add('warn', "%d canali con conteggi negativi: i conteggi veri non sono mai negativi, lo spettro è già stato elaborato e l'incertezza di conteggio non vale." % neg)
    q = v.get('importIssue')
    if q:
        if q.get('thou'):
            add('bad', 'Il file sembra usare un separatore delle migliaia (%s valori, es. 12.355 o 12,355): i numeri possono essere stati letti male. Esporta dallo strumento senza separatore delle migliaia e ricarica.' % _s(q['thou']))
        if q.get('dropped') and v.get('isXrf'):
            add('bad', '%s canali illeggibili sostituiti con la media dei vicini. Controlla il file.' % _s(q['dropped']))
        elif q.get('dropped'):
            add('bad', '%s righe con numeri su %s non sono state lette: possono mancare punti dello spettro. Controlla il formato del file.' % (_s(q['dropped']), _s(q.get('total'))))
        qCh = v['afterCh'] if v.get('afterCh') is not None else q.get('after')
        qTab = (q.get('after') or 0) - (qCh or 0) if q.get('after') is not None else NAN
        if q.get('after') and q.get('channel') and it != 'hplc':
            add('warn', "Il file contiene un secondo blocco di dati sullo stesso asse (%s righe), per esempio un'altra scansione o un'altra misura: non è stato letto. Esportalo come file separato." % _s(qCh))
        elif q.get('after') and q.get('channel'):
            lab = v.get('chanLabel') or ''
            k = (v['chIx'] if v.get('chIx') is not None else (v.get('blockIx') or 0)) + 1
            n_ = v.get('nChan') or v.get('nBlocks') or 2
            if lab:
                add('warn', 'Il file contiene più blocchi di dati sullo stesso asse, probabilmente altri canali. Ho letto il canale «%s» (blocco %s di %s, il più lungo); gli altri blocchi (%s righe) non sono stati letti. Esportali come file separati.' % (lab, _s(k), _s(n_), _s(qCh)))
            else:
                add('warn', 'Il file contiene più blocchi di dati sullo stesso asse, probabilmente altri canali. Ho letto il blocco %s di %s (il più lungo); gli altri blocchi (%s righe) non sono stati letti. Esportali come file separati.' % (_s(k), _s(n_), _s(qCh)))
        if q.get('after') and q.get('channel'):
            if qTab and qTab == qTab:
                add('info', 'Altre %s righe di numeri, più brevi dei canali, sono in genere tabelle riassuntive e non sono state usate.' % _s(qTab))
        elif q.get('after'):
            add('warn', '%s righe di numeri fuori dal blocco principale non sono state usate: sono in genere tabelle riassuntive. Controlla che non fossero altri punti.' % _s(q['after']))
    if q and q.get('midText'):
        add('bad', 'Una riga di testo interrompe i dati: ho tenuto i numeri di entrambe le parti, ma controlla che siano lo stesso spettro.')
    if it == 'hplc':
        for t in v.get('chanWarn') or []:
            add('warn', t)
    if (v.get('nCols') or 0) > 2:
        add('info', 'Il file ha %s colonne: Y è la colonna %s. La puoi cambiare in «Dati dello spettro».' % (_s(v['nCols']), js_str((an.get('ycol') or 1) + 1)))
    if it in ('libs', 'xrf') and not uncal and len(peaks) >= 5 and len([p for p in peaks if p.get('custom') or p['sugg']]) < 0.5 * len(peaks):
        add('warn', 'Più di metà delle righe trovate non ha un\'assegnazione: forse l\'asse X è spostato, e gli elementi proposti non sono affidabili. Correggilo in «Dati dello spettro».')
    freq = v.get('freq')
    if it == 'epr' and freq is not None and freq > 0 and P['xs']:
        B = epr_line_field(P['xs'], P['ys'])
        g = 71.4477 * freq / B if B > 0 else 0
        if g < 1.2 or g > 12:
            add('bad', 'Con questo campo il fattore g verrebbe circa %s: l\'unità del campo è probabilmente sbagliata (gauss, mT o tesla?). Fattore g e doppio integrale non sono affidabili. Correggi con la scala in «Dati dello spettro».' % t_fmt_n(g, 3))
    if it == 'nmr' and any(p.get('area') is not None for p in peaks):
        nx = an.get('nmrX')
        if nx is not None and not any(p.get('area') is not None and abs(p['x'] - nx) < 0.02 for p in peaks):
            add('warn', "Il picco di riferimento degli integrali (%s ppm) non è più nell'elenco: gli integrali sono riferiti al primo picco." % t_fmt_n(nx, 2))
        add('warn', 'Gli integrali sono calcolati picco per picco: un multipletto (doppietto, tripletto, quartetto…) risulta sottostimato del 10–20% perché le code delle righe vicine non sono contate. Per i rapporti tra gruppi integra regioni intere con la misura di banda in «Più campioni» (area), che su spettri simulati sbaglia meno dell\'1%.')
    if it == 'nmr' and not P.get('deriv') and P['kind'] != 'N' and len(P['xs']) >= 50:
        try:
            pos = find_peaks(P['xs'], P['ys'], 1, 1, 3)
            top = max(q['prom'] for q in pos) if pos else 0
            med = sorted(P['ys'])[len(P['ys']) >> 1]
            neg = [q for q in find_peaks(P['xs'], P['ys'], -1, 1, 6) if med - q['y'] >= 0.05 * top] if top > 0 else []
            if neg:
                seen = []
                for q in neg:
                    t = fp(q['x'])
                    if t not in seen:
                        seen.append(t)
                at = ', '.join(seen)
                pct = t_fmt_n(100 * max(med - q['y'] for q in neg) / top, 0)
                if len(neg) == 1:
                    add('warn', "Picco negativo a %s ppm (%s%% del picco più alto): di solito è la fase da correggere. Non è nell'elenco dei picchi né negli integrali." % (at, pct))
                else:
                    add('warn', "Picchi negativi a %s ppm (fino al %s%% del picco più alto): di solito è la fase da correggere. Non sono nell'elenco dei picchi né negli integrali." % (at, pct))
        except (ValueError, ZeroDivisionError, IndexError):
            pass
    ec = v.get('eprConv')
    if it == 'epr' and ec is not None and ec.get('by') == 'range' and ec.get('k') == 0.1:
        add('warn', 'Campo senza unità dichiarata: i valori oltre 1000 sono stati presi per gauss e divisi per 10 (ora in mT). Se erano già mT, i campi mostrati sono 10 volte troppo piccoli: correggi con la scala in «Dati dello spettro».')
    elif it == 'epr' and not (freq is not None and freq > 0) and _get(P['xs'], len(P['xs']) - 1) > 1000 and not (ec is not None and ec.get('k') != 1):
        add('warn', 'Campo oltre 1000 senza unità dichiarata e senza frequenza: potrebbe essere in gauss. Controlla l\'unità prima di confrontare doppi integrali.')
    stick = sticks_like(fxs, fys)
    if stick and not an.get('calc'):
        add('warn', 'Sembrano bastoncini di un calcolo (frequenze e intensità), non uno spettro misurato: il programma non li allarga in bande, quindi picchi, aree, rumore e ipotesi non valgono. Spunta «Dato calcolato» in «Dati dello spettro» e allarga lo spettro nel programma di calcolo prima di caricarlo.')
    if an.get('calc'):
        add('info', 'Dato calcolato: niente controlli di rumore, saturazione o ipotesi, che valgono per le misure; restano quelli su file, unità e asse.')
        if len(fxs) < 60:
            add('warn', 'Solo %d punti: se sono bastoncini (frequenze e intensità di un calcolo), il programma non li allarga in bande e i picchi non si trovano. Allarga lo spettro nel programma di calcolo prima di caricarlo.' % len(fxs))
        elif stick:
            add('warn', 'Sembrano bastoncini (frequenze e intensità del calcolo): il programma non li allarga in bande, quindi picchi e aree non valgono. Allarga lo spettro nel programma di calcolo prima di caricarlo.')
        return out
    if it == 'epr' and P['kind'] == 'E' and not P.get('deriv') and len(P['xs']) >= 20:
        Zs = epr_zones_of(an)
        ab = epr_is_absorption(P['xs'], P['ys'])
        ed = epr_edge_signal(P['xs'], P['ys'], Zs)
        di = None if ab else epr_double_integral(P['xs'], P['ys'], Zs)
        wg = None if ab else epr_wings(P['xs'], P['ys'], Zs)
        if wg and wg['warn'] and not (ed and ed['edge']):
            if Zs:
                add('warn', 'Le ali della riga (forma lorentziana) arrivano ancora nelle zone di fondo scelte: il doppio integrale risulta sottostimato (per una lorentziana di circa il %s%%). Scegli zone più lontane dalla riga o allarga la scansione.' % t_fmt_n(100 * wg['loss'], 0))
            else:
                add('warn', 'Le ali della riga (forma lorentziana) arrivano nelle finestre di base agli estremi: il doppio integrale risulta sottostimato (per una lorentziana di circa il %s%%). Allarga la scansione oppure scegli zone di fondo lontane dalla riga in «Doppio integrale».' % t_fmt_n(100 * wg['loss'], 0))
        if ed and ed['edge']:
            add('bad', 'Agli estremi dello spettro c\'è ancora segnale (riga vicina al bordo, troppo larga per la finestra, oppure linea di base curva): la linea di base dell\'integrale (doppio o singolo) lo contiene e il valore non è affidabile, anche di molte volte o di segno. Misura con la riga al centro di una finestra larga almeno 10 volte la riga.')
        elif di and di['di'] < 0:
            add('bad', 'Il doppio integrale è negativo: la fase del segnale è invertita o la linea di base è sbagliata. Il valore non è affidabile per confrontare quantità di spin: controlla fase e base.')
    if it == 'epr' and P['xs'] and epr_is_absorption(P['xs'], P['ys']):
        add('bad', 'Lo spettro EPR sembra in assorbimento (un solo segno), non in derivata come di solito: il doppio integrale non vale, per la quantità di spin uso l\'integrale singolo. Se invece è una derivata molto asimmetrica, controlla la linea di base.')
    if it == 'epr':
        va = sorted(abs(q) for q in fys)
        sg = noise_sigma(fys)
        if sg > 0 and va[-1] / sg < 200:
            km = 0
            for i in range(len(fys)):
                if abs(fys[i]) > abs(fys[km]):
                    km = i
            if (peak_fwhm_pts(P['xs'], [abs(q) for q in fys], _get(P['xs'], km)) or 0) < 0.1 * len(fys):
                add('warn', 'Rapporto picco/rumore basso: su spettri simulati sotto 200 il doppio integrale varia oltre il 10%, e anche il solo rumore dà un numero. Ripeti la misura o accumula di più.')
    sw = v.get('smooth') or 0
    if sw and peaks:
        up = t_up(P)
        w = sorted(q for q in (peak_fwhm_pts(P['xs'], up, p['x']) for p in peaks) if q > 0)
        if w and w[0] < sw:
            add('warn', 'Lo smoothing (%s punti) è più largo del picco più stretto (circa %s punti): altezze e aree si abbassano. Riducilo o scegline uno per questo spettro.' % (_s(sw), js_str(float(js_round(w[0])))))
    if it in ('hplc', 'raman', 'fluo', 'ftir', 'uv', 'xrf') and not P.get('deriv') and S.get('showPeaks') is not False:
        try:
            up = t_up(P)
            low = find_peaks(P['xs'], up, 1, 0.3, 200)
            st = abs(P['xs'][-1] - P['xs'][0]) / len(P['xs'])
            rem = v.get('removed') or []
            miss0 = [q for q in low if not any(abs(p['x'] - q['x']) <= 6 * st for p in peaks) and not any(abs(x - q['x']) <= 6 * st for x in rem)]
            cnt = it == 'xrf' and not uncal and is_counts(fys)
            if cnt:
                Cm = xrf_currie(fxs, fys, [q['x'] for q in miss0])
                miss = [q for i, q in enumerate(miss0) if Cm[i]]
            else:
                miss = miss0
            if len(miss) == 1:
                add('warn', "Un segnale sopra il rumore non è nell'elenco dei picchi perché più piccolo della soglia di sensibilità (a %s).%s Abbassa «Quanti picchi cerco» o aggiungilo con un clic." % (t_fmt_tick(miss[0]['x'], 2), ' Le percentuali di area non lo contano.' if it == 'hplc' else ''))
            elif miss:
                add('warn', "%d segnali sopra il rumore non sono nell'elenco dei picchi perché più piccoli della soglia di sensibilità (per esempio a %s).%s Abbassa «Quanti picchi cerco» o aggiungili con un clic." % (len(miss), ', '.join(t_fmt_tick(q['x'], 2) for q in miss[:3]), ' Le percentuali di area non li contano.' if it == 'hplc' else ''))
        except (ValueError, ZeroDivisionError, IndexError):
            pass
    auto = v.get('auto') or []
    if it == 'xrf' and not uncal and not v.get('ecal') and len(auto) >= 2:
        fit = xrf_align_fit([{'x': q['x'], 'w': q.get('prom') or 1} for q in auto], v.get('tube'))
        sh = fit['a'] + (fit['b'] - 1) * 8 if fit else 0
        if fit and abs(sh) > 0.025:
            add('warn', "La calibrazione in energia è spostata di circa %s eV (righe usate: %s). Con questo errore alcuni nomi suggeriti possono essere sbagliati, per esempio l'argon dell'aria scambiato per palladio." % (js_str(float(js_round(sh * 1000))), ', '.join(q['name'] for q in fit['pairs'][:4])))
    if it == 'xrf' and not uncal and (v.get('currieOut') or 0) > 0:
        add('info', '%s massimi del rumore sono sotto il limite di rivelabilità di Currie e non sono stati presi come righe: con pochi conteggi gli elementi in traccia non si possono affermare. Per vederli misura più a lungo.' % _s(v['currieOut']))
    if it == 'xrf' and uncal:
        add('bad', 'Il file XRF non contiene la calibrazione in energia: niente elementi né quantificazione. Esporta lo spettro calibrato dal software dello strumento.')
    if shape_ok and len(raw) >= 20:
        q = signal_quality(fxs, raw, 1, it == 'xrf' and not uncal and is_counts(raw))
        sgA = noise_sigma(raw) if (it == 'uv' and v.get('kind') != 'T' and v.get('kind') != 'N') else None
        snr = q['snr']
        if snr < 10 and sgA is not None and sgA < 0.002:
            add('info', 'Bande deboli rispetto al rumore (S/N ≈ %s), ma il rumore è basso (σ ≈ %s di assorbanza): i valori in un punto, come A a 420 nm, restano affidabili; posizioni e aree delle bande deboli no.' % (t_fmt_sn(snr), t_fmt_g(sgA, 2)))
        elif snr < 10 and it == 'hplc' and not peaks:
            add('info', 'Nessun picco sopra il rumore: se è un bianco va bene così; se aspettavi dei picchi, controlla iniezione e rivelatore.')
        elif snr < 10:
            add('bad', "Rapporto segnale/rumore basso (S/N ≈ %s): posizioni e soprattutto aree sono poco affidabili. Aumenta scansioni o tempo di integrazione; lo smoothing migliora solo la lettura, non l'informazione." % t_fmt_sn(snr))
        elif snr < 50:
            add('warn', "S/N ≈ %s: va bene per riconoscere i picchi, al limite per quantificare (qui S/N = altezza/σ del rumore; il criterio S/N ≥ 10 dell'ICH Q2 usa il rumore picco-picco e corrisponde a circa 30 su questa scala)." % t_fmt_sn(snr))
        else:
            add('ok', ('Buon rapporto segnale/rumore (S/N > %s).' % t_loc_int(1e5)) if (not math.isfinite(snr) or snr > 1e5) else ('Buon rapporto segnale/rumore (S/N ≈ %s).' % t_fmt_sn(snr)))
        fl = q['flat']
        if fl >= 3 and fl >= 0.5 * len(raw):
            add('bad', 'Segnale costante su %d punti: forse è stata letta la colonna sbagliata. Scegli la colonna Y in «Dati dello spettro».' % fl)
        elif fl >= 3 and it == 'ftir' and v.get('kind') != 'U':
            add('bad', "Il massimo è piatto su %d punti: banda satura (assorbanza troppo alta). Posizione e area delle bande tagliate non sono affidabili: usa un film più sottile, l'ATR invece della trasmissione, oppure diluisci il campione." % fl)
        elif fl >= 3 and it in ('raman', 'xrf', 'libs', 'fluo', 'hplc', 'uv', 'gen'):
            add('bad', "Il massimo è piatto su %d punti: probabile saturazione del rivelatore. L'intensità dei picchi più alti è sottostimata: riduci tempo, potenza o concentrazione." % fl)
        if q['bgRatio'] > 0.3 and (v.get('base') or 'none') == 'none' and it in ('raman', 'fluo', 'ftir', 'xrf', 'libs', 'gen'):
            m = 'snip' if it in ('xrf', 'libs') else 'arpls'
            bgp = js_str(float(js_round(q['bgRatio'] * 100)))
            cons = 'SNIP (Ryan 1988)' if m == 'snip' else 'arPLS (Baek 2015)'
            if it == 'raman':
                add('warn', 'Il fondo pesa circa il %s%% del segnale, come è tipico della fluorescenza: altezze e aree dipendono da dove metti la base. Consiglio la base %s.' % (bgp, cons))
            else:
                add('warn', 'Il fondo pesa circa il %s%% del segnale: altezze e aree dipendono da dove metti la base. Consiglio la base %s.' % (bgp, cons))
        if q['wPts'] < 4 and it not in ('libs', 'xrf'):
            add('info', 'Solo ≈%s punti per larghezza a metà altezza: con un campionamento così rado posizioni e aree hanno un errore digitale. Se puoi, misura con un passo più fine.' % t_fmt_g(q['wPts'], 2))
        if q['irregular'] > 0.05:
            add('info', 'Il passo dell\'asse X non è regolare (dati uniti o filtrati?): smoothing e derivate lo assumono costante.')
        spk = (S.get('spike') or {}).get(it)
        if it in ('raman', 'fluo', 'gen') and spk and peaks:
            try:
                ds = despike_at([-y for y in fys] if v.get('kind') == 'T' else fys)
                at = [fxs[k] for k in ds['at']]
                st = abs(fxs[-1] - fxs[0]) / len(fxs)
                hit = [p for p in peaks if any(abs(x - p['x']) <= 4 * st for x in at)]
                if hit:
                    add('warn', 'Un punto tolto come raggio cosmico cade sulla cima di %s (%s): se il picco è stretto e vero, altezza e forma sono state cambiate. Confronta con i raggi cosmici non tolti.' % ('un picco' if len(hit) == 1 else '%d picchi' % len(hit), ', '.join(fp(p['x']) for p in hit[:3])))
            except (ValueError, ZeroDivisionError, IndexError):
                pass
        if it in ('raman', 'fluo', 'gen') and not spk:
            ds = despike_at(raw)
            if ds['n']:
                add('warn', '%d punt%s con un salto stretto e isolato: sembrano raggi cosmici. Possono diventare falsi picchi.' % (ds['n'], 'o' if ds['n'] == 1 else 'i'))
    if it in ('uv', 'ftir') and v.get('kind') not in ('N', 'U'):
        amax, amin = -INF, INF
        for y in raw:
            if y > amax:
                amax = y
            if y < amin:
                amin = y
        if it == 'uv' and amax > 1.5:
            add('warn', 'Assorbanza massima %s: sopra ~1,5 la luce diffusa rende la risposta non lineare (Lambert–Beer). Per quantificare diluisci fino ad A ≈ 0,1–1.' % t_fmt_g(amax, 3))
        if it == 'ftir' and amax > 2:
            add('warn', 'Bande con assorbanza %s (T < 1%%): sono sature, la loro forma e intensità non sono affidabili. Campione più sottile, più diluito in KBr (meno campione nella pastiglia), oppure ATR.' % t_fmt_g(amax, 2))
        if amin < -0.05:
            add('info', 'Assorbanza negativa in alcuni tratti: il fondo (bianco) non è stato sottratto bene, oppure il campione era più sottile del riferimento.')
    if it == 'fluo':
        add('info', 'Per confronti quantitativi tieni l\'assorbanza all\'eccitazione sotto 0,1: sopra, l\'effetto filtro interno abbassa e deforma l\'emissione (Lakowicz).')
    if it == 'dsc' and not dsc_rate(v):
        add('warn', 'Velocità di scansione non trovata: ΔH non si può calcolare. Inseriscila in «Dati dello spettro».')
    if it == 'epr' and not (freq is not None and freq > 0):
        add('warn', 'Frequenza delle microonde mancante: senza, i fattori g non si calcolano. Inseriscila in «Dati dello spettro».')
    if it == 'tga' and P.get('mass') is not None:
        m, xs = P['mass'], P['xs']
        k = 0
        while k < len(xs) - 1 and xs[k] < 150:
            k += 1
        loss = m[0] - m[k]
        if xs[0] < 120 and loss > 1:
            add('info', 'Perdita di %s%% sotto i 150 °C: di solito acqua adsorbita o solvente. Per confrontare campioni conviene riferire le masse al secco (a 150 °C).' % t_fmt_g(loss, 2))
    if it == 'hplc':
        U = t_up(P)
        vv = sorted(U)
        med, top, n = vv[len(vv) >> 1], vv[-1], len(U)

        def edge(k):
            return (U[n - 1] + U[n - 2] + U[n - 3]) / 3 if k else (U[0] + U[1] + U[2]) / 3
        sgU = noise_sigma(U) or 0

        def hi(e):
            return (e - med) > 0.05 * (top - med) and (e - med) > 5 * sgU
        if top > med and (hi(edge(0)) or hi(edge(1))):
            add('warn', 'Il segnale è ancora alto al bordo del cromatogramma: un picco può essere tagliato e non viene contato. Controlla l\'inizio e la fine della corsa.')
    if it == 'hplc':
        vv = sorted(raw)
        med = vv[len(vv) >> 1]
        up_, dn = vv[-1] - med, med - vv[0]
        sg = noise_sigma(raw) or 0
        if dn > 2 * up_ and dn > 20 * sg:
            add('bad', 'Il segnale ha picchi negativi molto più grandi di quelli positivi: polarità invertita (per esempio rivelatore a indice di rifrazione)? I picchi trovati possono essere i fianchi. Inverti il segno del segnale prima di integrare.')
    n = len(fxs)
    if n > 20:
        st = [abs(fxs[i] - fxs[i - 1]) for i in range(1, n)]
        ms = sorted(st)[len(st) >> 1]
        gaps = [[fxs[i], fxs[i + 1]] for i, s in enumerate(st) if ms > 0 and s > 10 * ms]
        if gaps:
            ed = [p for p in peaks if any(min(abs(p['x'] - a), abs(p['x'] - b)) <= 3 * ms for a, b in gaps)]
            txt = "L'asse X ha %s (%s) senza dati." % ('un buco' if len(gaps) == 1 else '%d buchi' % len(gaps), ', '.join(t_fmt_tick(min(a, b), 2) + '–' + t_fmt_tick(max(a, b), 2) for a, b in gaps[:3]))
            txt += (' Il picco a %s cade sul bordo del buco: la sua posizione e la sua area non sono affidabili.' % ', '.join(fp(p['x']) for p in ed[:3])) if ed else ' Un picco dentro il buco non si vede.'
            add('bad' if ed else 'warn', txt)
    if it == 'hplc' and peaks:
        up = t_up(P)
        ft = [p for p in peaks if peak_shape(P['xs'], up, p['x']).get('flat')]
        asy = [p for p in peaks if peak_shape(P['xs'], up, p['x']).get('asym')]
        if asy:
            add('warn', "Picco asimmetrico a %s: coda o interferente non separato. L'area può comprendere un altro composto." % ', '.join(fp(p['x']) for p in asy[:4]))
        if ft:
            add('warn', "Cima piatta in %s (%s): possono essere due composti non separati o il rivelatore saturo. L'area non è di un solo composto." % ('un picco' if len(ft) == 1 else '%d picchi' % len(ft), ', '.join(fp(p['x']) for p in ft[:4])))
    if it == 'hplc' and peaks:
        up = t_up(P)
        cm = chrom_metrics(P['xs'], up, [{'x': p['x']} for p in peaks], None)
        noRs = len([c for k, c in enumerate(cm) if k > 0 and c.get('rs') is None])
        if noRs:
            add('warn', "Per %d pic%s la risoluzione non è calcolabile, spesso perché è ancora attaccato al vicino: l'area può essere molto sbagliata." % (noRs, 'co' if noRs == 1 else 'chi'))
        bad = len([c for c in cm if c.get('rs') is not None and c['rs'] < 1.5])
        tail = len([c for c in cm if c.get('tailing') is not None and c['tailing'] > 2])
        if bad:
            add('warn', '%d coppi%s di picchi con risoluzione Rs < 1,5 (non separati alla base): le aree si spartiscono in modo arbitrario. Prova la deconvoluzione o ottimizza il metodo.' % (bad, 'a' if bad == 1 else 'e'))
        if tail:
            add('warn', '%d pic%s con fattore di coda > 2 (limite usuale USP <621>): interazioni secondarie con la colonna o colonna degradata.' % (tail, 'co' if tail == 1 else 'chi'))
    if shape_ok and it not in ('xrf', 'libs') and not P.get('deriv') and P['kind'] != 'N':
        up = t_up(P)
        hb = cm_hidden_bands(P['xs'], up, None)
        pxs = [p['x'] for p in peaks]
        tol = (P['xs'][-1] - P['xs'][0]) * 0.006
        hid0 = [h for h in hb if not any(abs(x - h['x']) < tol for x in pxs)]
        hid = []
        seen = []
        for h in hid0:
            t = fp(h['x'])
            if t not in seen:
                seen.append(t)
                hid.append(h)
        sat_top = any(o['lv'] == 'bad' and o['t'].startswith('Il massimo è piatto') for o in out)
        if hid and not sat_top:
            one = len(hid) == 1
            add('warn' if it == 'hplc' else 'info', 'La derivata seconda mostra %s a %s%s: la deconvoluzione può separarl%s e misurarl%s.' % (
                'una banda nascosta (spalla)' if one else '%d bande nascoste (spalle)' % len(hid), ', '.join(fp(h['x']) for h in hid[:6]), '…' if len(hid) > 6 else '',
                'a' if one else 'e', 'a' if one else 'e'))
    return out


# ============================== tabelle di analysisFiles (index.html) ==============================
def _csep():
    return ',' if _en() else ';'


def raw_num(c):
    # index.html analysisFiles, rawNum: nel CSV i numeri senza separatore delle migliaia
    dec = _dec()
    ths = '.' if dec == ',' else ','
    c = re.sub(r'<[^>]+>', '', '' if c is None else str(c))
    if re.fullmatch(r'(>\s*)?-?\d{1,3}(\%s\d{3})+(\%s\d+)?' % (ths, dec), c):
        return ''.join(c.split(ths))
    return c


def controllo_qualita_csv(voci, ctx):
    """index.html analysisFiles: (nome, testo) di controllo_qualita.csv / quality_check.csv. voci: gli spettri inclusi, in ordine."""
    TEC_LANG[0] = ctx.get('lang') or 'it'
    en = _en()
    lv = {'ok': 'ok', 'info': 'note', 'warn': 'warning', 'bad': 'problem'} if en else {'ok': 'ok', 'info': 'nota', 'warn': 'attenzione', 'bad': 'problema'}
    q = [['File', 'Nome', 'Strumento', 'Livello', 'Messaggio']]
    for v in voci:
        for o in assess(v, ctx):
            q.append([v['nome'], v['titolo'], v['nomeIt'], lv[o['lv']], o['t']])
    return ('quality_check.csv' if en else 'controllo_qualita.csv', analysis_csv(q, _csep(), _dec()))


def parametri_per_tecnica_csv(voci, ctx):
    """index.html analysisFiles: (nome, testo) di parametri_per_tecnica.csv, oppure None se nessuna tecnica ha righe."""
    TEC_LANG[0] = ctx.get('lang') or 'it'
    en = _en()
    t = [['File', 'Nome', 'Strumento', 'Tabella']]
    for v in voci:
        o = tech_metrics(v, ctx)
        if o['title'] and o['rows']:
            t.append([v['nome'], v['titolo'], v['nomeIt'], re.sub(r'^\S+\s', '', o['title'], count=1)] + o['head'])
            for r in o['rows']:
                t.append(['', '', '', ''] + [raw_num(c) for c in r])
    if len(t) <= 1:
        return None
    return ('technique_parameters.csv' if en else 'parametri_per_tecnica.csv', analysis_csv(t, _csep(), _dec()))


# ============================== XRF: composizione con standard (index.html) ==============================
def xrf_main_line(el, others):
    # index.html xrfMainLine
    L = _cst('XRF_LINES').get(el) or []

    def get(n):
        r = next((q for q in L if q[0] == n), None)
        return {'name': el + ' ' + n, 'E': r[1]} if r else None
    if el == 'Pb' and 'As' in (others or []):
        return get('Lβ') or get('Lα')
    Ka = get('Kα')
    if Ka and Ka['E'] <= 27:
        return Ka
    return get('Lα') or Ka or None


def xrf_net(xs, ys, bkg, E):
    # index.html xrfNet
    w = xrf_fwhm(E)
    net = B = 0.0
    n = 0
    for i in range(len(xs)):
        if abs(xs[i] - E) > w:
            continue
        net += ys[i] - bkg[i]
        B += bkg[i]
        n += 1
    return {'net': max(0, net), 'B': B, 'n': n} if n else None


def xrf_intensities(xs, ys, els, opt):
    # index.html xrfIntensities: area netta ±1 FWHM sopra il fondo SNIP, normalizzata al Compton
    bkg = baseline_snip(ys, 0, True)
    out = {'I': {}, 'raw': {}, 'lines': {}}
    for el in els:
        L = xrf_main_line(el, els)
        if not L or L['E'] < xs[0] or L['E'] > xs[-1]:
            out['I'][el] = None
            continue
        r = xrf_net(xs, ys, bkg, L['E'])
        out['raw'][el] = r['net'] if r else None
        out['lines'][el] = L['name']
    norm = 1
    if opt.get('norm') != 'none':
        T = _cst('XRF_TUBES').get(opt.get('tube') or '')
        lo = T['C'][0] - 0.4 if (T and T.get('C')) else 16
        hi = T['C'][1] + 0.4 if (T and T.get('C')) else 21.5
        im = -1
        for i in range(len(xs)):
            if xs[i] >= lo and xs[i] <= hi and (im < 0 or ys[i] - bkg[i] > ys[im] - bkg[im]):
                im = i
        c = xrf_net(xs, ys, bkg, xs[im]) if im >= 0 else None
        out['compton'] = c['net'] if (c and c['net'] > 0) else None
        if out['compton']:
            norm = out['compton']
    for el in els:
        out['I'][el] = out['raw'][el] / norm if out['raw'].get(el) is not None else None
    return out


# solve_lin: quella di acch_chemometria.py (index.html solveLin)


def xrf_quant_fit(stds, els, model):
    # index.html xrfQuantFit: retta o Lucas-Tooth & Price per elemento, validazione leave-one-out
    res = {}
    for el in els:
        S = [s for s in stds if s['C'].get(el) is not None and s['I'].get(el) is not None]
        others = [e for e in els if e != el and all(s['I'].get(e) is not None for s in S)]
        want = 'linear' if model == 'linear' else ('ltp' if model == 'ltp' else ('ltp' if len(S) >= len(others) + 4 else 'linear'))

        def feats(s, kind, el=el, others=others):
            return [1, s['I'][el]] + [s['I'][el] * s['I'][e] for e in others] if kind == 'ltp' else [1, s['I'][el]]

        def fit_with(sset, kind, el=el, feats=feats):
            X = [feats(s, kind) for s in sset]
            y = [s['C'][el] for s in sset]
            p = len(X[0]) if X else 0
            if not X or len(sset) < p + 1:
                return None
            A = []
            for a in range(p):
                row = []
                for b in range(p):
                    t = 0
                    for r in X:
                        t = t + r[a] * r[b]
                    row.append(t)
                A.append(row)
            v = []
            for a in range(p):
                t = 0
                for i, r in enumerate(X):
                    t = t + r[a] * y[i]
                v.append(t)
            for a in range(p):
                A[a][a] *= 1 + 1e-9
            c = solve_lin(A, v)
            return {'c': c, 'kind': kind} if c else None
        if not S:
            raise NonTrascritto(tt('xrfQuantFit con nessuno standard utile per %s: nell\'app X[0] è indefinito e il calcolo si ferma con un errore', 'xrfQuantFit with no usable standard for %s: in the app X[0] is undefined and the calculation stops with an error') % el)
        kind = want
        F = fit_with(S, kind)
        if not F and kind == 'ltp':
            kind = 'linear'
            F = fit_with(S, kind)
        if not F:
            res[el] = {'n': len(S), 'ok': False}
            continue

        def pred_with(c, s, kind=kind, feats=feats):
            fs = feats(s, kind)
            t = 0
            for k, ck in enumerate(c):
                t = t + ck * fs[k]
            return t
        ss = cv = 0.0
        ncv = 0
        for s in S:
            d = pred_with(F['c'], s) - s['C'][el]
            ss += d * d
        for i, s in enumerate(S):
            Gf = fit_with([q for k, q in enumerate(S) if k != i], kind)
            if not Gf:
                continue
            d = pred_with(Gf['c'], s) - s['C'][el]
            cv += d * d
            ncv += 1

        def predict(s, el=el, others=others, c=F['c'], pw=pred_with):
            return pw(c, s) if (all(s['I'].get(e) is not None for e in others) and s['I'].get(el) is not None) else None
        res[el] = {'ok': True, 'n': len(S), 'kind': kind, 'coef': F['c'], 'others': others, 'rmse': math.sqrt(ss / len(S)),
                   'rmsecv': math.sqrt(cv / ncv) if ncv else None, 'predict': predict}
    return res


def xq_model(cfg, lista):
    # index.html xqModel (modello empirico; i parametri fondamentali sono in acch_xrf.py)
    els = cfg.get('qEls') or []
    if not els:
        return None
    if cfg.get('qModel') == 'fp':
        return xq_model_fp(cfg, lista, els)   # acch_xrf.py
    rows = []
    for v in lista:
        P = v['P']
        I = {}
        if P['kind'] == 'I' and not v.get('uncal'):
            I = xrf_intensities(P['xs'], P['ys'], els, {'tube': v.get('tube')})['I']   # index.html xqIntens
        rows.append({'v': v, 'I': I, 'C': (v.get('an') or {}).get('std') or {}})
    stds = [r for r in rows if any(r['C'].get(e) is not None for e in els)]
    fit = xrf_quant_fit([{'I': r['I'], 'C': {e: (r['C'][e] if r['C'].get(e) is not None else 0) for e in els}} for r in stds], els, cfg.get('qModel') or 'auto') if len(stds) >= 3 else None
    for r in rows:
        if not fit:
            continue
        p = {}
        tot = 0
        for e in els:
            x = fit[e]['predict'](r) if (fit.get(e) and fit[e]['ok']) else None
            p[e] = x
            if x is not None:
                tot += max(0, x)
        r['pred'], r['tot'] = p, tot
        if cfg.get('q100') is not False and tot > 0:
            for e in els:
                if p[e] is not None:
                    p[e] = max(0, p[e]) * 100 / tot
    return {'els': els, 'rows': rows, 'stds': stds, 'fit': fit}


def composizione_xrf_csv(cfg, lista, ctx):
    """index.html analysisFiles + xqCsvRows: (nome, testo) di composizione_xrf.csv, o None. cfg = mvCfg('xrf') {qEls, qModel, q100};
    lista = mvFiles('xrf', cfg), voci come per assess (servono P, an.std, tube, uncal, nome, titolo)."""
    TEC_LANG[0] = ctx.get('lang') or 'it'
    M = xq_model(cfg, lista)
    if not M or not M['fit']:
        return None

    def n(x):
        return '' if (x is None or not math.isfinite(x)) else num_prec(float(x), 5).replace('.', _dec(), 1)
    out = [['File', 'Nome', 'Tipo'] + [h for e in M['els'] for h in (e + ' %', e + ' ± (val. incrociata)', e + ' I/Compton')]]
    for r in M['rows']:
        std = any(r['C'].get(e) is not None for e in M['els'])
        cells = [r['v']['nome'], r['v']['titolo'], 'standard' if std else 'campione']
        for e in M['els']:
            F = M['fit'].get(e)
            cells += [n(r['C'][e] if (std and r['C'].get(e) is not None) else r['pred'].get(e)), n(F.get('rmsecv') if F else None), n(r['I'].get(e))]
        out.append(cells)
    if len(out) <= 1:
        return None
    return ('xrf_composition.csv' if _en() else 'composizione_xrf.csv', analysis_csv(out, _csep(), _dec()))
