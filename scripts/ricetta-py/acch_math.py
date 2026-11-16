# ---------------------------------------------------------------------------------------------
# Modulo acch_math: le funzioni Math.* del motore JavaScript che ha prodotto i numeri dell'app.
# Va concatenato SUBITO DOPO acch_ricetta.py e prima degli altri moduli: ridefinisce m_exp, m_log,
# m_log10, m_expm1, m_sin, m_cos, m_pow, m_hypot, che in acch_ricetta.py valgono quelle di math.
# Math.exp, log, log10, expm1, sin, cos, pow e hypot cambiano nell'ultima cifra da un motore all'altro,
# e nei fit (LM, arPLS, sezione aurea) quella cifra cresce fino a 1e-9 e oltre. Motori:
#   'v8-fma': V8 compilato con la contrazione a·b+c in FMA (Node su arm64, per esempio i Mac M):
#             fdlibm di src/base/ieee754.cc con le moltiplicazioni-somme fuse;
#   'v8':     V8 su x86-64: la stessa fdlibm senza FMA (NON VERIFICATO: qui non c'è una macchina x86);
#   'jsc':    JavaScriptCore (WKWebView del desktop Tauri su macOS, Safari): la libm del sistema, cioè
#             math.* di Python sulla stessa macchina; hypot a due argomenti dalla libm (ctypes), pow con
#             esponente intero ≥ 0 per quadrati successivi.
#   'v8-llvm': V8 recente (Chrome): exp, expm1, log, log10, sin e cos dalla libc di LLVM, arrotondate correttamente
#             (verificato su 6000 argomenti per funzione in Chrome); qui con decimal, più lente ma uguali bit per bit;
#             pow della libm e hypot di V8 come gli altri V8.
# Il motore si sceglie con imposta_motore(sonda): la sonda la registra l'app all'esportazione (SONDA_JS).
# Math.sqrt è corretta in ogni motore: resta math.sqrt.
# ---------------------------------------------------------------------------------------------
MOTORE = ['v8-fma']

try:
    _m_fma_true = math.fma
except AttributeError:
    from fractions import Fraction as _MFr

    def _m_fma_true(a, b, c):
        # a·b + c con un solo arrotondamento (Python < 3.13 non ha math.fma)
        if not (math.isfinite(a) and math.isfinite(b) and math.isfinite(c)):
            return a * b + c
        v = _MFr(a) * _MFr(b) + _MFr(c)
        if v == 0:
            return a * b + c
        try:
            return float(v)
        except OverflowError:
            return INF if v > 0 else -INF


def _m_fma_plain(a, b, c):
    return a * b + c


def _m_F():
    return _m_fma_true if MOTORE[0] == 'v8-fma' else _m_fma_plain


def _m_hi(x):
    # parola alta, con segno (int32)
    q = struct.unpack('<Q', struct.pack('<d', x))[0] >> 32
    return q - 0x100000000 if q & 0x80000000 else q


def _m_lo(x):
    return struct.unpack('<Q', struct.pack('<d', x))[0] & 0xffffffff


def _m_mk(hi, lo):
    return struct.unpack('<d', struct.pack('<Q', ((hi & 0xffffffff) << 32) | (lo & 0xffffffff)))[0]


_M_LN2HI = (6.93147180369123816490e-01, -6.93147180369123816490e-01)
_M_LN2LO = (1.90821492927058770002e-10, -1.90821492927058770002e-10)


def _fd_exp(x, F):
    # V8 base::ieee754::exp (fdlibm e_exp.c)
    twom1000 = 9.33263618503218878990e-302
    hi = 0.0
    lo = 0.0
    k = 0
    hx = _m_hi(x)
    xsb = 1 if hx < 0 else 0
    hx &= 0x7fffffff
    if hx >= 0x40862E42:
        if hx >= 0x7ff00000:
            if ((hx & 0xfffff) | _m_lo(x)) != 0:
                return x + x
            return x if xsb == 0 else 0.0
        if x > 7.09782712893383973096e+02:
            return INF
        if x < -7.45133219101941108420e+02:
            return twom1000 * twom1000
    if hx > 0x3fd62e42:
        if hx < 0x3FF0A2B2:
            if x == 1.0:
                return 2.718281828459045
            hi = x - _M_LN2HI[xsb]
            lo = _M_LN2LO[xsb]
            k = 1 - xsb - xsb
        else:
            k = int(F(1.44269504088896338700e+00, x, (0.5, -0.5)[xsb]))
            t = float(k)
            hi = F(-t, _M_LN2HI[0], x)
            lo = t * _M_LN2LO[0]
        x = hi - lo
    elif hx < 0x3e300000:
        if 1.0e+300 + x > 1.0:
            return 1.0 + x
    else:
        k = 0
    t = x * x
    if k >= -1021:
        twopk = _m_mk(0x3ff00000 + (k << 20), 0)
    else:
        twopk = _m_mk(0x3ff00000 + ((k + 1000) << 20), 0)
    c = F(-t, F(t, F(t, F(t, F(t, 4.13813679705723846039e-08, -1.65339022054652515390e-06), 6.61375632143793436117e-05), -2.77777777770155933842e-03), 1.66666666666666019037e-01), x)
    if k == 0:
        return 1.0 - ((x * c) / (c - 2.0) - x)
    y = 1.0 - ((lo - (x * c) / (2.0 - c)) - hi)
    if k >= -1021:
        if k == 1024:
            return y * 2.0 * 8.988465674311579539e307
        return y * twopk
    return y * twopk * twom1000


def _fd_expm1(x, F):
    # V8 base::ieee754::expm1 (fdlibm s_expm1.c)
    ln2_hi = 6.93147180369123816490e-01
    ln2_lo = 1.90821492927058770002e-10
    hx = _m_hi(x)
    xsb = hx < 0
    hx &= 0x7fffffff
    if hx >= 0x4043687A:
        if hx >= 0x40862E42:
            if hx >= 0x7ff00000:
                if ((hx & 0xfffff) | _m_lo(x)) != 0:
                    return x + x
                return x if not xsb else -1.0
            if x > 7.09782712893383973096e+02:
                return INF
        if xsb:
            if x + 1.0e-300 < 0.0:
                return 1.0e-300 - 1.0
    c = 0.0
    if hx > 0x3fd62e42:
        if hx < 0x3FF0A2B2:
            if not xsb:
                hi = x - ln2_hi
                lo = ln2_lo
                k = 1
            else:
                hi = x + ln2_hi
                lo = -ln2_lo
                k = -1
        else:
            k = int(F(1.44269504088896338700e+00, x, -0.5 if xsb else 0.5))
            t = float(k)
            hi = F(-t, ln2_hi, x)
            lo = t * ln2_lo
        x = hi - lo
        c = (hi - x) - lo
    elif hx < 0x3c900000:
        t = 1.0e+300 + x
        return x - (t - (1.0e+300 + x))
    else:
        k = 0
    hfx = 0.5 * x
    hxs = x * hfx
    r1 = F(hxs, F(hxs, F(hxs, F(hxs, F(hxs, -2.01099218183624371326e-07, 4.00821782732936239552e-06), -7.93650757867487942473e-05), 1.58730158725481460165e-03), -3.33333333333331316428e-02), 1.0)
    t = F(-r1, hfx, 3.0)
    e = hxs * ((r1 - t) / F(-x, t, 6.0))
    if k == 0:
        return x - F(x, e, -hxs)
    twopk = _m_mk(0x3ff00000 + (k << 20), 0)
    e = F(x, e - c, -c)
    e -= hxs
    if k == -1:
        return F(0.5, x - e, -0.5)
    if k == 1:
        if x < -0.25:
            return -2.0 * (e - (x + 0.5))
        return F(2.0, x - e, 1.0)
    if k <= -2 or k > 56:
        y = 1.0 - (e - x)
        y = y * 2.0 * 8.98846567431158e307 if k == 1024 else y * twopk
        return y - 1.0
    if k < 20:
        t = _m_mk(0x3ff00000 - (0x200000 >> k), 0)
        y = t - (e - x)
        return y * twopk
    t = _m_mk((0x3ff - k) << 20, 0)
    y = x - (e + t)
    y += 1.0
    return y * twopk


def _fd_log(x, F):
    # V8 base::ieee754::log (fdlibm e_log.c)
    ln2_hi = 6.93147180369123816490e-01
    ln2_lo = 1.90821492927058770002e-10
    hx = _m_hi(x)
    lx = _m_lo(x)
    k = 0
    if hx < 0x00100000:
        if ((hx & 0x7fffffff) | lx) == 0:
            return -INF
        if hx < 0:
            return NAN
        k -= 54
        x *= 1.80143985094819840000e+16
        hx = _m_hi(x)
    if hx >= 0x7ff00000:
        return x + x
    k += (hx >> 20) - 1023
    hx &= 0x000fffff
    i = (hx + 0x95f64) & 0x100000
    x = _m_mk(hx | (i ^ 0x3ff00000), _m_lo(x))
    k += (i >> 20)
    f = x - 1.0
    if (0x000fffff & (2 + hx)) < 3:
        if f == 0:
            if k == 0:
                return 0.0
            dk = float(k)
            return F(dk, ln2_hi, dk * ln2_lo)
        R = f * f * F(-0.33333333333333333, f, 0.5)
        if k == 0:
            return f - R
        dk = float(k)
        return F(dk, ln2_hi, -(F(-dk, ln2_lo, R) - f))
    s = f / (2.0 + f)
    dk = float(k)
    z = s * s
    i = hx - 0x6147a
    w = z * z
    j = 0x6b851 - hx
    t1 = w * F(w, F(w, 1.531383769920937332e-01, 2.222219843214978396e-01), 3.999999999940941908e-01)
    t2 = z * F(w, F(w, F(w, 1.479819860511658591e-01, 1.818357216161805012e-01), 2.857142874366239149e-01), 6.666666666666735130e-01)
    i |= j
    R = t2 + t1
    if i > 0:
        hfsq = 0.5 * f * f
        if k == 0:
            return f - F(-s, hfsq + R, hfsq)
        return F(dk, ln2_hi, -((hfsq - F(s, hfsq + R, dk * ln2_lo)) - f))
    if k == 0:
        return F(-s, f - R, f)
    return F(dk, ln2_hi, -(F(s, f - R, -(dk * ln2_lo)) - f))


def _fd_log10(x, F):
    # V8 base::ieee754::log10 (fdlibm e_log10.c)
    hx = _m_hi(x)
    lx = _m_lo(x)
    k = 0
    if hx < 0x00100000:
        if ((hx & 0x7fffffff) | lx) == 0:
            return -INF
        if hx < 0:
            return NAN
        k -= 54
        x *= 1.80143985094819840000e+16
        hx = _m_hi(x)
        lx = _m_lo(x)
    if hx >= 0x7ff00000:
        return x + x
    if hx == 0x3ff00000 and lx == 0:
        return 0.0
    k += (hx >> 20) - 1023
    i = 1 if k < 0 else 0
    hx = (hx & 0x000fffff) | ((0x3ff - i) << 20)
    y = float(k + i)
    x = _m_mk(hx, lx)
    z = F(y, 3.69423907715893078616e-13, 4.34294481903251816668e-01 * _fd_log(x, F))
    return F(y, 3.01029995663611771306e-01, z)


def _k_sin(x, y, iy, F):
    # fdlibm k_sin.c
    ix = _m_hi(x) & 0x7fffffff
    if ix < 0x3e400000 and int(x) == 0:
        return x
    z = x * x
    v = z * x
    r = F(z, F(z, F(z, F(z, 1.58969099521155010221e-10, -2.50507602534068634195e-08), 2.75573137070700676789e-06), -1.98412698298579493134e-04), 8.33333333332248946124e-03)
    if iy == 0:
        return F(v, F(z, r, -1.66666666666666324348e-01), x)
    return x - F(-v, -1.66666666666666324348e-01, F(z, F(0.5, y, -(v * r)), -y))


def _k_cos(x, y, F):
    # fdlibm k_cos.c
    ix = _m_hi(x) & 0x7fffffff
    if ix < 0x3e400000 and int(x) == 0:
        return 1.0
    z = x * x
    r = z * F(z, F(z, F(z, F(z, F(z, -1.13596475577881948265e-11, 2.08757232129817482790e-09), -2.75573143513906633035e-07), 2.48015872894767294178e-05), -1.38888888888741095749e-03), 4.16666666666666019037e-02)
    if ix < 0x3FD33333:
        return 1.0 - F(0.5, z, -F(z, r, -(x * y)))
    qx = 0.28125 if ix > 0x3fe90000 else _m_mk(ix - 0x00200000, 0)
    hz = F(0.5, z, -qx)
    a = 1.0 - qx
    return a - (hz - F(z, r, -(x * y)))


_M_NPIO2_HW = [0x3FF921FB, 0x400921FB, 0x4012D97C, 0x401921FB, 0x401F6A7A, 0x4022D97C, 0x4025FDBB, 0x402921FB, 0x402C463A, 0x402F6A7A, 0x4031475C, 0x4032D97C,
               0x40346B9C, 0x4035FDBB, 0x40378FDB, 0x403921FB, 0x403AB41B, 0x403C463A, 0x403DD85A, 0x403F6A7A, 0x40407E4C, 0x4041475C, 0x4042106C, 0x4042D97C,
               0x4043A28C, 0x40446B9C, 0x404534AC, 0x4045FDBB, 0x4046C6CB, 0x40478FDB, 0x404858EB, 0x404921FB]


def _rem_pio2(x, F):
    # fdlibm e_rem_pio2.c, argomenti fino a 2^19·π/2 (oltre: __kernel_rem_pio2, non trascritto)
    pio2_1, pio2_1t = 1.57079632673412561417e+00, 6.07710050650619224932e-11
    pio2_2, pio2_2t = 6.07710050630396597660e-11, 2.02226624879595063154e-21
    pio2_3, pio2_3t = 2.02226624871116645580e-21, 8.47842766036889956997e-32
    hx = _m_hi(x)
    ix = hx & 0x7fffffff
    if ix < 0x4002d97c:
        if hx > 0:
            z = x - pio2_1
            if ix != 0x3ff921fb:
                y0 = z - pio2_1t
                return 1, y0, (z - y0) - pio2_1t
            z -= pio2_2
            y0 = z - pio2_2t
            return 1, y0, (z - y0) - pio2_2t
        z = x + pio2_1
        if ix != 0x3ff921fb:
            y0 = z + pio2_1t
            return -1, y0, (z - y0) + pio2_1t
        z += pio2_2
        y0 = z + pio2_2t
        return -1, y0, (z - y0) + pio2_2t
    if ix > 0x413921fb:
        raise NonTrascritto('seno e coseno di argomenti oltre 2^19·π/2 non trascritti')
    t = abs(x)
    n = int(F(t, 6.36619772367581382433e-01, 0.5))
    fn = float(n)
    r = F(-fn, pio2_1, t)
    w = fn * pio2_1t
    if n < 32 and ix != _M_NPIO2_HW[n - 1]:
        y0 = r - w
    else:
        j = ix >> 20
        y0 = r - w
        i = j - ((_m_hi(y0) >> 20) & 0x7ff)
        if i > 16:
            t = r
            w = fn * pio2_2
            r = t - w
            w = F(fn, pio2_2t, -((t - r) - w))
            y0 = r - w
            i = j - ((_m_hi(y0) >> 20) & 0x7ff)
            if i > 49:
                t = r
                w = fn * pio2_3
                r = t - w
                w = F(fn, pio2_3t, -((t - r) - w))
                y0 = r - w
    y1 = (r - y0) - w
    if hx < 0:
        return -n, -y0, -y1
    return n, y0, y1


def _fd_sin(x, F):
    # V8 base::ieee754::sin (fdlibm s_sin.c)
    if (_m_hi(x) & 0x7fffffff) <= 0x3fe921fb:
        return _k_sin(x, 0.0, 0, F)
    if not math.isfinite(x):
        return NAN
    n, a, b = _rem_pio2(x, F)
    n &= 3
    if n == 0:
        return _k_sin(a, b, 1, F)
    if n == 1:
        return _k_cos(a, b, F)
    if n == 2:
        return -_k_sin(a, b, 1, F)
    return -_k_cos(a, b, F)


def _fd_cos(x, F):
    # V8 base::ieee754::cos (fdlibm s_cos.c)
    if (_m_hi(x) & 0x7fffffff) <= 0x3fe921fb:
        return _k_cos(x, 0.0, F)
    if not math.isfinite(x):
        return NAN
    n, a, b = _rem_pio2(x, F)
    n &= 3
    if n == 0:
        return _k_cos(a, b, F)
    if n == 1:
        return -_k_sin(a, b, 1, F)
    if n == 2:
        return -_k_cos(a, b, F)
    return _k_sin(a, b, 1, F)


def _libm1(fn, x):
    # una funzione della libm con la semantica di JavaScript (niente eccezioni)
    if x != x:
        return NAN
    try:
        return fn(x)
    except OverflowError:
        return INF
    except ValueError:
        if fn in (math.log, math.log10):
            return -INF if x == 0 else NAN
        return NAN


def m_exp(x):
    # Math.exp
    x = float(x)
    if MOTORE[0] == 'v8-llvm':
        return _cr('exp', x)
    return _libm1(math.exp, x) if MOTORE[0] == 'jsc' else _fd_exp(x, _m_F())


def m_expm1(x):
    # Math.expm1
    x = float(x)
    if MOTORE[0] == 'v8-llvm':
        return _cr('expm1', x)
    return _libm1(math.expm1, x) if MOTORE[0] == 'jsc' else _fd_expm1(x, _m_F())


def m_log(x):
    # Math.log
    x = float(x)
    if MOTORE[0] == 'v8-llvm':
        return _cr('log', x)
    return _libm1(math.log, x) if MOTORE[0] == 'jsc' else _fd_log(x, _m_F())


def m_log10(x):
    # Math.log10
    x = float(x)
    if MOTORE[0] == 'v8-llvm':
        return _cr('log10', x)
    return _libm1(math.log10, x) if MOTORE[0] == 'jsc' else _fd_log10(x, _m_F())


import decimal as _mdec

_M_PI = [None, 0]


def _cr_pi(prec):
    # π con prec cifre (formula di Machin), per la riduzione dell'argomento di sin e cos
    if _M_PI[1] >= prec:
        return _M_PI[0]
    with _mdec.localcontext() as c:
        c.prec = prec + 10
        D = _mdec.Decimal

        def atan_inv(n):
            x = D(1) / n
            x2, s, t, k, eps = x * x, x, x, 1, D(10) ** (-(prec + 8))
            while True:
                t *= -x2
                k += 2
                term = t / k
                if abs(term) < eps:
                    break
                s += term
            return s
        p = 16 * atan_inv(5) - 4 * atan_inv(239)
    _M_PI[0], _M_PI[1] = p, prec
    return p


def _cr(fn, x):
    """Math.* di V8 con la libc di LLVM (Chrome): exp, expm1, log, log10, sin e cos ARROTONDATE CORRETTAMENTE, cioè il double più
    vicino al valore esatto. Qui il valore si calcola con decimal a 40 cifre o più (ln, exp e log10 di decimal sono arrotondati
    correttamente alla precisione scelta) e float() sceglie il double più vicino: lo stesso numero di qualunque libreria corretta."""
    D = _mdec.Decimal
    if x != x:
        return NAN
    if fn in ('log', 'log10'):
        if x < 0:
            return NAN
        if x == 0:
            return -INF
        if x == INF:
            return INF
        with _mdec.localcontext() as c:
            c.prec = 40
            return float(D(x).ln() if fn == 'log' else D(x).log10())
    if fn == 'exp':
        if x == INF:
            return INF
        if x == -INF:
            return 0.0
        if x > 710:
            return INF
        if x < -746:
            return 0.0
        with _mdec.localcontext() as c:
            c.prec = 40
            return float(D(x).exp())
    if fn == 'expm1':
        if x == 0 or x == INF:
            return x
        if x == -INF:
            return -1.0
        if x > 710:
            return INF
        if x < -40:
            return -1.0 if x < -40 else NAN
        with _mdec.localcontext() as c:
            c.prec = 50
            X = D(x)
            if abs(x) < 1e-3:   # serie: niente cancellazione con exp(x) − 1
                t, s, k = X, X, 1
                while True:
                    k += 1
                    t = t * X / k
                    if abs(t) < abs(s) * D(10) ** -48:
                        break
                    s += t
                return float(s)
            return float(X.exp() - 1)
    # sin e cos
    if x == INF or x == -INF:
        return NAN
    if x == 0:
        return x if fn == 'sin' else 1.0
    prec = 60 + int(max(0, math.frexp(x)[1]) * 0.302)
    with _mdec.localcontext() as c:
        c.prec = prec
        X = D(x)
        h = _cr_pi(prec) / 2
        k = (X / h).to_integral_value(rounding=_mdec.ROUND_HALF_EVEN)
        r = X - k * h
        q = (int(k) + (1 if fn == 'cos' else 0)) % 4
        r2, eps = r * r, D(10) ** (-prec)
        if q % 2 == 0:   # seno di r
            t, sm, n = r, r, 1
        else:            # coseno di r
            t, sm, n = D(1), D(1), 0
        while True:
            t = -t * r2 / ((n + 1) * (n + 2))
            n += 2
            if t == 0 or abs(t) < eps * abs(sm):
                break
            sm += t
        return float(sm if q < 2 else -sm)


def m_sin(x):
    # Math.sin
    x = float(x)
    if MOTORE[0] == 'v8-llvm':
        return _cr('sin', x)
    return _libm1(math.sin, x) if MOTORE[0] == 'jsc' else _fd_sin(x, _m_F())


def m_cos(x):
    # Math.cos
    x = float(x)
    if MOTORE[0] == 'v8-llvm':
        return _cr('cos', x)
    return _libm1(math.cos, x) if MOTORE[0] == 'jsc' else _fd_cos(x, _m_F())


def _libm_pow(x, y):
    # pow della libm, con i casi speciali di JavaScript
    if y != y:
        return NAN
    if y == 0:
        return 1.0
    if x != x:
        return NAN
    if abs(x) == 1 and math.isinf(y):
        return NAN
    try:
        return math.pow(x, y)
    except OverflowError:
        if x < 0 and float(y).is_integer() and int(y) % 2 == 1:
            return -INF
        return INF
    except ValueError:
        if x == 0:
            return -INF if (math.copysign(1, x) < 0 and float(y).is_integer() and int(y) % 2 == 1) else INF
        return NAN


def m_pow(x, y):
    # Math.pow e **: V8 usa la pow della libm; JavaScriptCore con esponente intero in [0, 2^31) moltiplica
    # per quadrati successivi (operationMathPow)
    x = float(x)
    y = float(y)
    if MOTORE[0] == 'jsc' and y == y and y == int(y) and 0 <= y < 2 ** 31 and x == x:
        r = 1.0
        k = int(y)
        while k:
            if k & 1:
                r *= x
            x *= x
            k >>= 1
        return r
    return _libm_pow(x, y)


_M_LIBM = [None]


def _m_libm_hypot(a, b):
    # JavaScriptCore: Math.hypot a due argomenti è la hypot della libm (ctypes, libreria standard)
    if _M_LIBM[0] is None:
        try:
            import ctypes
            import ctypes.util
            lm = ctypes.CDLL(ctypes.util.find_library('m') or ctypes.util.find_library('c'))
            lm.hypot.restype = ctypes.c_double
            lm.hypot.argtypes = [ctypes.c_double, ctypes.c_double]
            _M_LIBM[0] = lm.hypot
        except Exception:
            raise NonTrascritto('Math.hypot di JavaScriptCore non trascritto: la hypot della libm non si carica')
    return _M_LIBM[0](a, b)


def m_hypot(*a):
    # Math.hypot: in V8 (src/builtins/math.tq) normalizza sul massimo e somma con Kahan (codice di V8, senza FMA)
    a = [float(v) for v in a]
    if MOTORE[0] == 'jsc':
        if len(a) == 2:
            return _m_libm_hypot(a[0], a[1])
        raise NonTrascritto('Math.hypot di JavaScriptCore con %d argomenti non trascritto' % len(a))
    if not a:
        return 0.0
    vals = []
    nan = False
    mx = 0.0
    for v in a:
        if v != v:
            nan = True
            vals.append(0.0)
        else:
            av = abs(v)
            vals.append(av)
            if av > mx:
                mx = av
    if mx == INF:
        return INF
    if nan:
        return NAN
    if mx == 0:
        return 0.0
    s = 0.0
    comp = 0.0
    for av in vals:
        n = av / mx
        summand = n * n - comp
        prel = s + summand
        comp = (prel - s) - summand
        s = prel
    return math.sqrt(s) * mx


# ============================== sonda del motore ==============================
# Punti fissi (stessi double in JavaScript e in Python, vedi SONDA_JS) e, per ognuno, i valori registrati dall'app:
# [Math.exp(x), Math.log(x), Math.log10(x), Math.expm1(x), Math.sin(x), Math.cos(x), Math.pow(x, 3), Math.pow(|x|, 0.37), Math.hypot(x, 0.7)]
# (JSON.stringify scrive null per NaN e ±Infinity).
def sonda_x():
    return [0.0371 + i * 0.1373 for i in range(64)] + [-(0.0213 + i * 0.4111) for i in range(64)]


SONDA_JS = r'''function acchSondaMath(){ // punti e valori come acch_math.sonda_x / imposta_motore (ricetta Python)
  const X=Array.from({length:64},(_,i)=>0.0371+i*0.1373).concat(Array.from({length:64},(_,i)=>-(0.0213+i*0.4111)));
  return {versione:1, valori:X.map(x=>[Math.exp(x), Math.log(x), Math.log10(x), Math.expm1(x), Math.sin(x), Math.cos(x), Math.pow(x,3), Math.pow(Math.abs(x),0.37), Math.hypot(x,0.7)])}; }'''


def _m_vals(x):
    return [m_exp(x), m_log(x), m_log10(x), m_expm1(x), m_sin(x), m_cos(x), m_pow(x, 3), m_pow(abs(x), 0.37), m_hypot(x, 0.7)]


def _m_uguale(a, r):
    if r is None:
        return not math.isfinite(a)
    return a == float(r)


def usa_motore(nome):
    # sceglie il motore per nome: 'v8-fma', 'v8' o 'jsc'
    if nome not in ('v8-fma', 'v8', 'jsc', 'v8-llvm'):
        raise ValueError('motore: v8-fma, v8, jsc o v8-llvm')
    MOTORE[0] = nome
    return nome


def imposta_motore(sonda):
    """Sceglie il motore JavaScript dalla sonda registrata dall'app (SONDA_JS: {versione: 1, valori: [...]},
    oppure direttamente la lista dei valori). Solleva NonTrascritto se nessun motore coincide bit per bit."""
    val = sonda.get('valori') if isinstance(sonda, dict) else sonda
    X = sonda_x()
    if not isinstance(val, list) or len(val) != len(X):
        raise NonTrascritto('sonda del motore JavaScript mancante o di formato sconosciuto')
    vecchio = MOTORE[0]
    for nome in ('v8-fma', 'v8', 'jsc', 'v8-llvm'):
        MOTORE[0] = nome
        try:
            if all(len(r) == 9 and all(_m_uguale(a, b) for a, b in zip(_m_vals(x), r)) for x, r in zip(X, val)):
                return nome
        except NonTrascritto:
            pass
    MOTORE[0] = vecchio
    raise NonTrascritto('Math.exp/log/sin/cos/pow/hypot del motore JavaScript che ha esportato non coincidono con nessuno dei '
                        'motori trascritti (V8 con e senza FMA, JavaScriptCore con la libm di questa macchina)')
