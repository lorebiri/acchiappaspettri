# ---------------------------------------------------------------------------------------------
# Modulo acch_chemo: serie di spettri, MCR-ALS e cinetica globale, trascritti in Python (solo
# libreria standard) da app/mcr-core.js, app/kinetics-core.js e app/chemo-ui.js (analysisFiles).
# Va concatenato DOPO acch_ricetta.py: usa i suoi helper (fin, js_round, js_max, js_min, jdiv,
# js_str, js_fixed, js_prec, js_expo, num_prec, NonTrascritto, NAN, INF) e le Math.* di acch_math.py (m_exp, m_log,
# m_expm1, m_pow, m_hypot: il motore JavaScript si sceglie lì, con imposta_motore).
# I generatori dell'app (function*, yield) qui sono funzioni normali: i yield servono solo a
# cedere il passo all'interfaccia e non cambiano le operazioni né il loro ordine.
# Ingresso: chemo_tables(f, lingua), vedi in fondo al file.
# ---------------------------------------------------------------------------------------------
import functools


class ErrApp(Exception):
    """Errore che l'app solleva (throw) dentro il calcolo: resultFor lo intercetta e il file non c'è."""


# ============================== Math di JavaScript ==============================
def _sq(x):
    # Math.sqrt: NaN per i negativi invece di un errore
    if x != x or x < 0:
        return NAN
    return math.sqrt(x)


def _or(v, d):
    # (v||d) per un numero
    return v if (v == v and v != 0) else d


def _plus(v):
    # +v di JavaScript (numeri, null, booleani, testo numerico)
    if v is None:
        return NAN
    if isinstance(v, bool):
        return 1.0 if v else 0.0
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        s = v.strip()
        if s == '':
            return 0.0
        try:
            return float(s)
        except ValueError:
            return NAN
    return NAN


def _isint(v):
    # Number.isInteger
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) and float(v).is_integer()


def _truthy(v):
    if v is None or v is False:
        return False
    if isinstance(v, (int, float)):
        return v == v and v != 0
    if isinstance(v, str):
        return v != ''
    return True


def _cmp_sort(idx, key):
    # Array.prototype.sort((a,b)=>key(a)-key(b)): TimSort stabile; NaN conta come «non minore»
    def c(a, b):
        d = key(a) - key(b)
        return -1 if d < 0 else (1 if d > 0 else 0)
    return sorted(idx, key=functools.cmp_to_key(c))


class Mat:
    # McrCore mat(m,n,a): {m, n, a} con a per righe
    __slots__ = ('m', 'n', 'a')

    def __init__(self, m, n, a=None):
        self.m = m
        self.n = n
        self.a = a if a is not None else [0.0] * (m * n)


def mc_sumsq(a):
    # mcr-core.js sumSq
    s = 0.0
    for v in a:
        s += v * v
    return s


def mc_col(M, j):
    # mcr-core.js col
    return [M.a[i * M.n + j] for i in range(M.m)]


# ============================== mcr-core.js: algebra densa ==============================
def mc_chol(A, k):
    # mcr-core.js chol: Cholesky con regolarizzazione relativa minima
    L = [0.0] * (k * k)
    dmax = 0.0
    for i in range(k):
        dmax = js_max(dmax, A[i * k + i])
    eps = 1e-13 * _or(dmax, 1)
    for i in range(k):
        for j in range(i + 1):
            s = A[i * k + j]
            for q in range(j):
                s -= L[i * k + q] * L[j * k + q]
            if i == j:
                if not (s > eps):
                    s = js_max(s, eps) if s > 0 else eps
                L[i * k + i] = _sq(s)
            else:
                L[i * k + j] = jdiv(s, L[j * k + j])
    return L


def mc_chol_solve(L, k, b):
    # mcr-core.js cholSolve
    y = [0.0] * k
    for i in range(k):
        s = b[i]
        for q in range(i):
            s -= L[i * k + q] * y[q]
        y[i] = jdiv(s, L[i * k + i])
    for i in range(k - 1, -1, -1):
        s = y[i]
        for q in range(i + 1, k):
            s -= L[q * k + i] * y[q]
        y[i] = jdiv(s, L[i * k + i])
    return y


def mc_solve_spd(A, k, b):
    # mcr-core.js solveSPD
    return mc_chol_solve(mc_chol(A, k), k, b)


def mc_inverse(A, k):
    # mcr-core.js inverse: Gauss con pivot parziale
    M = list(A)
    I = [0.0] * (k * k)
    for i in range(k):
        I[i * k + i] = 1.0
    for c in range(k):
        p = c
        for r in range(c + 1, k):
            if abs(M[r * k + c]) > abs(M[p * k + c]):
                p = r
        piv = M[p * k + c]
        if not (abs(piv) > 1e-300):
            return None
        if p != c:
            for q in range(k):
                M[c * k + q], M[p * k + q] = M[p * k + q], M[c * k + q]
                I[c * k + q], I[p * k + q] = I[p * k + q], I[c * k + q]
        for q in range(k):
            M[c * k + q] /= piv
            I[c * k + q] /= piv
        M[c * k + c] = 1.0
        for r in range(k):
            if r == c:
                continue
            f = M[r * k + c]
            if _truthy(f):
                for q in range(k):
                    M[r * k + q] -= f * M[c * k + q]
                    I[r * k + q] -= f * I[c * k + q]
    return I


def mc_det(A, k):
    # mcr-core.js det
    M = list(A)
    d = 1.0
    for c in range(k):
        p = c
        for r in range(c + 1, k):
            if abs(M[r * k + c]) > abs(M[p * k + c]):
                p = r
        if M[p * k + c] == 0:
            return 0.0
        if p != c:
            d = -d
            for q in range(k):
                M[c * k + q], M[p * k + q] = M[p * k + q], M[c * k + q]
        d *= M[c * k + c]
        for r in range(c + 1, k):
            f = jdiv(M[r * k + c], M[c * k + c])
            for q in range(c, k):
                M[r * k + q] -= f * M[c * k + q]
    return d


# ============================== mcr-core.js: autovalori e SVD ==============================
def mc_eig_sym(A, n):
    # mcr-core.js eigSymGen: Householder + QL implicito (JAMA tred2/tql2)
    V = [list(A[i * n:(i + 1) * n]) for i in range(n)]
    d = [0.0] * n
    e = [0.0] * n
    for j in range(n):
        d[j] = V[n - 1][j]
    for i in range(n - 1, 0, -1):
        scale = 0.0
        h = 0.0
        for k in range(i):
            scale += abs(d[k])
        if scale == 0:
            e[i] = d[i - 1]
            for j in range(i):
                d[j] = V[i - 1][j]
                V[i][j] = 0.0
                V[j][i] = 0.0
        else:
            for k in range(i):
                d[k] /= scale
                h += d[k] * d[k]
            f = d[i - 1]
            g = _sq(h)
            if f > 0:
                g = -g
            e[i] = scale * g
            h -= f * g
            d[i - 1] = f - g
            for j in range(i):
                e[j] = 0.0
            for j in range(i):
                f = d[j]
                V[j][i] = f
                g = e[j] + V[j][j] * f
                for k in range(j + 1, i):
                    g += V[k][j] * d[k]
                    e[k] += V[k][j] * f
                e[j] = g
            f = 0.0
            for j in range(i):
                e[j] = jdiv(e[j], h)
                f += e[j] * d[j]
            hh = jdiv(f, h + h)
            for j in range(i):
                e[j] -= hh * d[j]
            for j in range(i):
                f = d[j]
                g = e[j]
                for k in range(j, i):
                    V[k][j] -= (f * e[k] + g * d[k])
                d[j] = V[i - 1][j]
                V[i][j] = 0.0
        d[i] = h
    for i in range(n - 1):
        V[n - 1][i] = V[i][i]
        V[i][i] = 1.0
        h = d[i + 1]
        if h != 0:
            for k in range(i + 1):
                d[k] = V[k][i + 1] / h
            for j in range(i + 1):
                g = 0.0
                for k in range(i + 1):
                    g += V[k][i + 1] * V[k][j]
                for k in range(i + 1):
                    V[k][j] -= g * d[k]
        for k in range(i + 1):
            V[k][i + 1] = 0.0
    for j in range(n):
        d[j] = V[n - 1][j]
        V[n - 1][j] = 0.0
    V[n - 1][n - 1] = 1.0
    e[0] = 0.0
    for i in range(1, n):
        e[i - 1] = e[i]
    e[n - 1] = 0.0
    f = 0.0
    tst1 = 0.0
    eps = 2.0 ** -52
    for l in range(n):
        tst1 = js_max(tst1, abs(d[l]) + abs(e[l]))
        m = l
        while m < n:
            if abs(e[m]) <= eps * tst1:
                break
            m += 1
        if m > l:
            it = 0
            while True:
                it += 1
                g = d[l]
                p = jdiv(d[l + 1] - g, 2 * e[l])
                r = m_hypot(p, 1.0)
                if p < 0:
                    r = -r
                d[l] = jdiv(e[l], p + r)
                d[l + 1] = e[l] * (p + r)
                dl1 = d[l + 1]
                h = g - d[l]
                for i in range(l + 2, n):
                    d[i] -= h
                f += h
                p = d[m]
                c = 1.0
                c2 = c
                c3 = c
                el1 = e[l + 1]
                s = 0.0
                s2 = 0.0
                for i in range(m - 1, l - 1, -1):
                    c3 = c2
                    c2 = c
                    s2 = s
                    g = c * e[i]
                    h = c * p
                    r = m_hypot(p, e[i])
                    e[i + 1] = s * r
                    s = jdiv(e[i], r)
                    c = jdiv(p, r)
                    p = c * d[i] - s * g
                    d[i + 1] = h + s * (c * g + s * d[i])
                    for k in range(n):
                        h = V[k][i + 1]
                        V[k][i + 1] = s * V[k][i] + c * h
                        V[k][i] = c * V[k][i] - s * h
                p = jdiv(-s * s2 * c3 * el1 * e[l], dl1)
                e[l] = s * p
                d[l] = c * p
                if not (abs(e[l]) > eps * tst1 and it < 80):
                    break
        d[l] += f
        e[l] = 0.0
    ordr = _cmp_sort(list(range(n)), lambda i: -d[i])
    vals = [d[i] for i in ordr]
    vecs = Mat(n, n)
    for i in range(n):
        for j in range(n):
            vecs.a[i * n + j] = V[i][ordr[j]]
    return vals, vecs


def mc_svd(D, q=None):
    # mcr-core.js svdGen: SVD dalla matrice di Gram del lato più piccolo
    m, n, a = D.m, D.n, D.a
    small = min(m, n)
    rows_side = m <= n
    G = [0.0] * (small * small)
    if rows_side:
        for i in range(m):
            ri = a[i * n:(i + 1) * n]
            for j in range(i + 1):
                rj = a[j * n:(j + 1) * n]
                s = 0.0
                for k in range(n):
                    s += ri[k] * rj[k]
                G[i * m + j] = s
                G[j * m + i] = s
    else:
        for k in range(m):
            rk = a[k * n:(k + 1) * n]
            for i in range(n):
                v = rk[i]
                if _truthy(v):
                    o = i * n
                    for j in range(i + 1):
                        G[o + j] += v * rk[j]
        for i in range(n):
            for j in range(i):
                G[j * n + i] = G[i * n + j]
    vals, vecs = mc_eig_sym(G, small)
    q = int(js_max(1, js_min(q if _truthy(q) else small, small)))
    s = [_sq(js_max(0, vals[i])) for i in range(small)]
    tol = s[0] * small * 2.2e-16 * 1e4
    U = Mat(m, q)
    V = Mat(n, q)
    for c in range(q):
        sc = s[c]
        if rows_side:
            for i in range(m):
                U.a[i * q + c] = vecs.a[i * small + c]
            if sc > tol:
                for j in range(n):
                    t = 0.0
                    for i in range(m):
                        t += a[i * n + j] * U.a[i * q + c]
                    V.a[j * q + c] = t / sc
        else:
            for j in range(n):
                V.a[j * q + c] = vecs.a[j * small + c]
            if sc > tol:
                for i in range(m):
                    t = 0.0
                    ri = i * n
                    for j in range(n):
                        t += a[ri + j] * V.a[j * q + c]
                    U.a[i * q + c] = t / sc
    return {'s': s, 'U': U, 'V': V, 'q': q}


def mc_suggest_rank(s, m, n):
    # mcr-core.js suggestRank: funzione IND di Malinowski
    r = min(m, n)
    lam = [v * v for v in s]
    best = 1
    bv = INF
    k = 1
    while k < r and k <= min(15, r - 1):
        rest = 0.0
        for j in range(k, r):
            rest += lam[j]
        RE = _sq(rest / (max(m, n) * (r - k)))
        IND = RE / ((r - k) * (r - k))
        if IND < bv:
            bv = IND
            best = k
        k += 1
    return best


def mc_lof_pca(s, k, sst):
    # mcr-core.js lofPca
    rest = 0.0
    for j in range(k, len(s)):
        rest += s[j] * s[j]
    return 100 * _sq(js_max(0, rest) / _or(sst, 1))


# ============================== mcr-core.js: NNLS, chiusura, unimodalità ==============================
def mc_fnnls(G, h, k):
    # mcr-core.js fnnls: Bro e De Jong (Lawson–Hanson sui prodotti incrociati)
    x = [0.0] * k
    P = [0] * k
    w = list(h)
    hmax = 0.0
    for i in range(k):
        hmax = js_max(hmax, abs(h[i]))
    tol = 1e-12 * js_max(hmax, 1e-300) * max(1, k)

    def solveP():
        idx = [i for i in range(k) if P[i]]
        p = len(idx)
        A = [0.0] * (p * p)
        b = [0.0] * p
        for i in range(p):
            b[i] = h[idx[i]]
            for j in range(p):
                A[i * p + j] = G[idx[i] * k + idx[j]]
        z = mc_solve_spd(A, p, b) if p else []
        s = [0.0] * k
        for i, q in enumerate(idx):
            s[q] = z[i]
        return s

    for _outer in range(3 * k + 10):
        t = -1
        wm = tol
        for i in range(k):
            if not P[i] and w[i] > wm:
                wm = w[i]
                t = i
        if t < 0:
            break
        P[t] = 1
        s = solveP()
        for _inner in range(3 * k + 10):
            neg = False
            for i in range(k):
                if P[i] and s[i] <= 0:
                    neg = True
                    break
            if not neg:
                break
            alpha = INF
            for i in range(k):
                if P[i] and s[i] <= 0:
                    a = jdiv(x[i], x[i] - s[i])
                    if a < alpha:
                        alpha = a
            if not fin(alpha):
                alpha = 0.0
            for i in range(k):
                x[i] += alpha * (s[i] - x[i])
                if P[i] and x[i] <= 1e-15 * js_max(1, abs(s[i])):
                    P[i] = 0
                    x[i] = 0.0
            s = solveP()
        for i in range(k):
            x[i] = s[i] if P[i] else 0.0
        for i in range(k):
            v = h[i]
            for j in range(k):
                v -= G[i * k + j] * x[j]
            w[i] = v
    return x


def mc_eqls(G, h, k, idx, t):
    # mcr-core.js eqLS: minimi quadrati con 1ᵀx = t (Lagrange)
    p = len(idx)
    A = [0.0] * (p * p)
    b = [0.0] * p
    one = [1.0] * p
    for i in range(p):
        b[i] = h[idx[i]]
        for j in range(p):
            A[i * p + j] = G[idx[i] * k + idx[j]]
    L = mc_chol(A, p)
    u = mc_chol_solve(L, p, b)
    v = mc_chol_solve(L, p, one)
    su = 0.0
    sv = 0.0
    for i in range(p):
        su += u[i]
        sv += v[i]
    mu = (su - t) / _or(sv, 1e-300)
    return [u[i] - mu * v[i] for i in range(p)]


def mc_closed_ls(G, h, k, t, nonneg):
    # mcr-core.js closedLS: chiusura esatta, con o senza non negatività
    x = [0.0] * k
    if not nonneg:
        z = mc_eqls(G, h, k, list(range(k)), t)
        return list(z)
    j0 = 0
    f0 = INF
    for j in range(k):
        f = 0.5 * t * t * G[j * k + j] - t * h[j]
        if f < f0:
            f0 = f
            j0 = j
    P = [0] * k
    P[j0] = 1
    x[j0] = t
    hmax = 0.0
    for i in range(k):
        hmax = js_max(hmax, abs(h[i]))
    tol = 1e-12 * js_max(hmax, 1e-300) * max(1, k)
    for _outer in range(3 * k + 10):
        idx = [i for i in range(k) if P[i]]
        mu = 0.0
        for i in idx:
            g = h[i]
            for j in range(k):
                g -= G[i * k + j] * x[j]
            mu += g
        mu /= len(idx)
        tt = -1
        wm = tol
        for i in range(k):
            if not P[i]:
                g = h[i]
                for j in range(k):
                    g -= G[i * k + j] * x[j]
                w = g - mu
                if w > wm:
                    wm = w
                    tt = i
        if tt < 0:
            break
        P[tt] = 1
        for _inner in range(3 * k + 10):
            id_ = [i for i in range(k) if P[i]]
            z = mc_eqls(G, h, k, id_, t)
            if all(v > 0 for v in z):
                for i, q in enumerate(id_):
                    x[q] = z[i]
                break
            alpha = 1.0
            for i, q in enumerate(id_):
                if z[i] <= 0:
                    a = x[q] / _or(x[q] - z[i], 1e-300)
                    if a < alpha:
                        alpha = a
            for i, q in enumerate(id_):
                x[q] += alpha * (z[i] - x[q])
                if x[q] <= 1e-15 * abs(t):
                    x[q] = 0.0
                    P[q] = 0
            if not any(P):
                P[j0] = 1
                x[j0] = t
                break
    return x


def mc_iso_errors(y):
    # mcr-core.js isoErrors (crescente)
    n = len(y)
    err = [0.0] * n
    val = []
    wt = []
    sse = []
    tot = 0.0
    for p in range(n):
        v = y[p]
        w = 1.0
        e = 0.0
        while val and val[-1] >= v:
            v0 = val.pop()
            w0 = wt.pop()
            e0 = sse.pop()
            tot -= e0
            nv = (v0 * w0 + v * w) / (w0 + w)
            e = e0 + e + w0 * (v0 - nv) * (v0 - nv) + w * (v - nv) * (v - nv)
            v = nv
            w += w0
        val.append(v)
        wt.append(w)
        sse.append(e)
        tot += e
        err[p] = tot
    return err


def mc_pava(y):
    # mcr-core.js pava (crescente)
    val = []
    wt = []
    ln = []
    for p in range(len(y)):
        v = y[p]
        w = 1.0
        l = 1
        while val and val[-1] >= v:
            v0 = val.pop()
            w0 = wt.pop()
            l0 = ln.pop()
            v = (v0 * w0 + v * w) / (w0 + w)
            w += w0
            l += l0
        val.append(v)
        wt.append(w)
        ln.append(l)
    out = []
    for b in range(len(val)):
        out.extend([val[b]] * ln[b])
    return out


def mc_unimodal(y):
    # mcr-core.js unimodal: minimi quadrati unimodali (Bro e Sidiropoulos)
    n = len(y)
    if n < 3:
        return list(y)
    L = mc_iso_errors(y)
    R = mc_iso_errors(list(reversed(y)))
    best = -2
    bv = INF
    for p in range(-1, n):
        e = (L[p] if p >= 0 else 0) + (R[n - 2 - p] if p < n - 1 else 0)
        if best < -1.5 or e < bv - 1e-15 * abs(bv):
            bv = e
            best = p
    out = [0.0] * n
    if best >= 0:
        out[0:best + 1] = mc_pava(list(y[0:best + 1]))
    if best < n - 1:
        tail = list(reversed(y[best + 1:]))
        out[best + 1:] = list(reversed(mc_pava(tail)))
    return out


# ============================== mcr-core.js: stime iniziali ==============================
def mc_simplisma(D, nc, mode, off):
    # mcr-core.js simplisma (Windig e Guilment)
    m, n, a = D.m, D.n, D.a
    if mode == 'rows':
        V, Rn = m, n
        at = lambda v, r: a[v * n + r]
    else:
        V, Rn = n, m
        at = lambda v, r: a[r * n + v]
    mu = [0.0] * V
    sd = [0.0] * V
    for v in range(V):
        s = 0.0
        for r in range(Rn):
            s += at(v, r)
        mm = s / Rn
        q = 0.0
        for r in range(Rn):
            d = at(v, r) - mm
            q += d * d
        mu[v] = mm
        sd[v] = _sq(q / Rn)
    mmax = 0.0
    for v in range(V):
        mmax = js_max(mmax, mu[v])
    alpha = off / 100 * mmax
    lam = [_or(_sq(mu[v] * mu[v] + (sd[v] + alpha) * (sd[v] + alpha)), 1e-300) for v in range(V)]
    purity = [sd[v] / _or(mu[v] + alpha, 1e-300) for v in range(V)]
    cache = {}

    def corr(u, v):
        # stessa funzione, stessi ingressi: il risultato si può riusare senza cambiarlo
        key = (u, v)
        if key in cache:
            return cache[key]
        s = 0.0
        for r in range(Rn):
            s += at(u, r) * at(v, r)
        res = jdiv(s, Rn * lam[u] * lam[v])
        cache[key] = res
        return res

    sel = []
    diag = [corr(v, v) for v in range(V)]
    for _k in range(min(nc, V)):
        cross = [[corr(v, p) for v in range(V)] for p in sel]
        best = -1
        bv = -INF
        pk = [0.0] * V
        for v in range(V):
            if v in sel:
                continue
            kk = len(sel) + 1
            Mx = [0.0] * (kk * kk)
            Mx[0] = diag[v]
            for i in range(len(sel)):
                Mx[i + 1] = Mx[(i + 1) * kk] = cross[i][v]
                for j in range(len(sel)):
                    Mx[(i + 1) * kk + j + 1] = corr(sel[i], sel[j])
            w = mc_det(Mx, kk)
            pk[v] = w * purity[v]
            if pk[v] > bv:
                bv = pk[v]
                best = v
        if best < 0:
            break
        sel.append(best)
    return sel


def mc_efa(D, nc, sv):
    # mcr-core.js efaGen: EFA sulle prime q componenti principali
    m, n = D.m, D.n
    q = min(sv['q'], max(nc + 4, 12))
    Y = [0.0] * (m * q)
    for i in range(m):
        for c in range(q):
            s = 0.0
            for j in range(n):
                s += D.a[i * n + j] * sv['V'].a[j * sv['q'] + c]
            Y[i * q + c] = s

    def run(order):
        G = [0.0] * (q * q)
        out = [[0.0] * m for _ in range(nc)]
        for i in order:
            for aa in range(q):
                ya = Y[i * q + aa]
                if _truthy(ya):
                    for b in range(q):
                        G[aa * q + b] += ya * Y[i * q + b]
            ev = mc_eig_sym(G, q)[0]
            for k in range(nc):
                evk = ev[k] if k < len(ev) else 0.0
                out[k][i] = _sq(js_max(0, _or(evk, 0)))
        return out

    fw = run(list(range(m)))
    bw = run([m - 1 - i for i in range(m)])
    noise = sv['s'][nc] if nc < len(sv['s']) else 0.0
    noise = _or(noise, 0)
    C = Mat(m, nc)
    for k in range(nc):
        for i in range(m):
            v = js_min(fw[k][i], bw[nc - 1 - k][i]) - noise
            C.a[i * nc + k] = v if v > 0 else 0.0
    for k in range(nc):
        mx = 0.0
        for i in range(m):
            mx = js_max(mx, C.a[i * nc + k])
        if mx > 0:
            for i in range(m):
                C.a[i * nc + k] /= mx
        else:
            for i in range(m):
                C.a[i * nc + k] = 1 / m
    return C


# ============================== mcr-core.js: passi ALS ==============================
def mc_gram(M, rows_are_vectors):
    # mcr-core.js gram
    k = M.m if rows_are_vectors else M.n
    L = M.n if rows_are_vectors else M.m
    G = [0.0] * (k * k)
    if rows_are_vectors:
        for i in range(k):
            for j in range(i + 1):
                s = 0.0
                for t in range(L):
                    s += M.a[i * L + t] * M.a[j * L + t]
                G[i * k + j] = G[j * k + i] = s
    else:
        for t in range(L):
            for i in range(k):
                v = M.a[t * k + i]
                if _truthy(v):
                    for j in range(i + 1):
                        G[i * k + j] += v * M.a[t * k + j]
        for i in range(k):
            for j in range(i):
                G[j * k + i] = G[i * k + j]
    return G


def mc_solve_row(G, h, k, nonneg, closure):
    # mcr-core.js solveRow
    if closure is not None:
        return mc_closed_ls(G, h, k, closure, nonneg)
    if nonneg:
        return mc_fnnls(G, h, k)
    return mc_solve_spd(G, k, h)


def mc_step_c(D, S, o):
    # mcr-core.js stepC (pyMCR non serve: l'app non lo usa nelle esportazioni)
    m, n = D.m, D.n
    k = S.m
    G = mc_gram(S, True)
    C = Mat(m, k)
    h = [0.0] * k
    for i in range(m):
        ri = i * n
        for c in range(k):
            s = 0.0
            sc = c * n
            for j in range(n):
                s += D.a[ri + j] * S.a[sc + j]
            h[c] = s
        x = mc_solve_row(G, h, k, o['nonnegC'], o['closure'])
        C.a[i * k:(i + 1) * k] = x
    return C


def mc_step_s(D, C, o, known):
    # mcr-core.js stepS: spettri noti come uguaglianza
    m, n = D.m, D.n
    k = C.n
    G = mc_gram(C, False)
    S = Mat(k, n)
    h = [0.0] * k
    free = []
    fix = []
    for c in range(k):
        (fix if (known and c in known) else free).append(c)
    kf = len(free)
    Gf = [0.0] * (kf * kf)
    for i in range(kf):
        for j in range(kf):
            Gf[i * kf + j] = G[free[i] * k + free[j]]
    hf = [0.0] * kf
    CtD = [0.0] * (k * n)
    for i in range(m):
        ri = i * n
        for c in range(k):
            v = C.a[i * k + c]
            if _truthy(v):
                sc = c * n
                for j in range(n):
                    CtD[sc + j] += v * D.a[ri + j]
    for j in range(n):
        for c in range(k):
            h[c] = CtD[c * n + j]
        for c in fix:
            S.a[c * n + j] = known[c][j]
        for i in range(kf):
            v = h[free[i]]
            for c in fix:
                v -= G[free[i] * k + c] * known[c][j]
            hf[i] = v
        if kf:
            xf = mc_solve_row(Gf, hf, kf, o['nonnegS'], None)
            for i in range(kf):
                S.a[free[i] * n + j] = xf[i]
    return S


def mc_residual(D, C, S):
    # mcr-core.js residual
    m, n = D.m, D.n
    k = C.n
    E = Mat(m, n)
    for i in range(m):
        for j in range(n):
            s = D.a[i * n + j]
            for c in range(k):
                s -= C.a[i * k + c] * S.a[c * n + j]
            E.a[i * n + j] = s
    return E


def mc_options(o):
    # mcr-core.js options: opzioni di MCR-ALS ripulite
    o = o or {}
    nc = int(js_max(1, js_min(10, _or(js_round(_plus(o.get('nc'))), 2))))
    uni = []
    if isinstance(o.get('unimodal'), list):
        for k in o['unimodal']:
            if _isint(k) and k >= 0 and k < nc and int(k) not in uni:
                uni.append(int(k))
    off = o.get('offset')
    tol = o.get('tol')
    clo = o.get('closure')
    return {'nc': nc,
            'init': o.get('init') if o.get('init') in ('simplisma', 'efa', 'given') else 'simplisma',
            'initOn': 'C' if o.get('initOn') == 'C' else 'S',
            'offset': off if (fin(off) and off >= 0 and off <= 100) else 5,
            'nonnegC': o.get('nonnegC') is not False, 'nonnegS': o.get('nonnegS') is not False,
            'closure': clo if (fin(clo) and clo > 0) else None, 'unimodal': uni,
            'norm': o.get('norm') if o.get('norm') in ('norm', 'max', 'none') else 'norm',
            'maxIter': int(js_max(1, js_min(5000, _or(js_round(_plus(o.get('maxIter'))), 200)))),
            'tol': tol if (fin(tol) and tol > 0 and tol < 1) else 1e-3,
            'patience': int(js_max(1, js_min(50, _or(js_round(_plus(o.get('patience'))), 3)))),
            'pymcr': _truthy(o.get('pymcr'))}


def _loc_it(x):
    # Number.prototype.toLocaleString('it'): al più 3 decimali, metà verso l'alto, virgola decimale
    d = Decimal(repr(float(x))).quantize(Decimal('0.001'), rounding=ROUND_HALF_UP)
    s = format(d, 'f')
    if '.' in s:
        s = s.rstrip('0').rstrip('.')
    ip, _, fp = s.partition('.')
    neg = ip.startswith('-')
    ip = ip.lstrip('-')
    if len(ip) >= 5:
        g = []
        while len(ip) > 3:
            g.insert(0, ip[-3:])
            ip = ip[:-3]
        g.insert(0, ip)
        ip = '.'.join(g)
    if s in ('-0',):
        neg = False
    return ('-' if neg else '') + ip + (',' + fp if fp else '')


def mc_als(D, opt):
    # mcr-core.js alsGen: MCR-ALS (Tauler). opt come mcrInput di chemo-ui.js (known: spettri già interpolati)
    o = mc_options(opt)
    nc = o['nc']
    m, n = D.m, D.n
    warn = []
    sst = mc_sumsq(D.a)
    if not (sst > 0):
        raise ErrApp('matrice nulla')
    if nc > min(m, n):
        raise ErrApp('troppe componenti per le dimensioni dei dati')
    if o['pymcr']:
        raise NonTrascritto(tt('MCR-ALS con pymcr non trascritto: l\'app non lo usa nelle esportazioni', 'MCR-ALS with pymcr not transcribed: the app does not use it in exports'))
    known = {}
    kn_in = (opt or {}).get('known') or {}
    for kk in sorted(kn_in.keys(), key=lambda s: int(s)):
        v = kn_in[kk]
        c = int(kk)
        if 0 <= c < nc and v is not None and len(v) == n:
            known[c] = [float(x) for x in v]
    nKnown = len(known)
    if (opt or {}).get('S0') is not None or (opt or {}).get('C0') is not None:
        raise NonTrascritto(tt('MCR-ALS con partenza data (S0/C0) non trascritto: l\'app non la salva nel progetto', 'MCR-ALS with a given start (S0/C0) not transcribed: the app does not save it in the project'))
    S = None
    C = None
    sv = None
    info = {}
    if o['init'] == 'efa':
        sv = mc_svd(D)
        C = mc_efa(D, nc, sv)
        info['init'] = 'efa'
    else:
        idx = mc_simplisma(D, nc, 'cols' if o['initOn'] == 'C' else 'rows', o['offset'])
        info['init'] = 'simplisma'
        if len(idx) < nc:
            raise ErrApp('SIMPLISMA non trova abbastanza variabili pure')
        if o['initOn'] == 'C':
            C = Mat(m, nc)
            for k, j in enumerate(idx):
                for i in range(m):
                    C.a[i * nc + k] = D.a[i * n + j]
        else:
            S = Mat(nc, n)
            for k, i in enumerate(idx):
                S.a[k * n:(k + 1) * n] = D.a[i * n:(i + 1) * n]
    if S is not None and nKnown and info['init'] == 'simplisma':
        done = set()
        for k in list(known.keys()):
            best = -2
            bq = k
            for q in range(nc):
                if q in done or (q in known and q != k):
                    continue
                ab = 0.0
                aa = 0.0
                bb = 0.0
                for j in range(n):
                    av = S.a[q * n + j]
                    bv_ = known[k][j]
                    ab += av * bv_
                    aa += av * av
                    bb += bv_ * bv_
                r = ab / _sq(_or(aa * bb, 1e-300))
                if r > best:
                    best = r
                    bq = q
            if bq != k:
                tmp = S.a[k * n:(k + 1) * n]
                S.a[k * n:(k + 1) * n] = S.a[bq * n:(bq + 1) * n]
                S.a[bq * n:(bq + 1) * n] = tmp
            done.add(k)
    if S is not None:
        for k in known:
            S.a[k * n:(k + 1) * n] = list(known[k])
    if o['closure'] is not None and _truthy((opt or {}).get('norm')) and (opt or {}).get('norm') != 'none':
        warn.append({'it': 'Con la chiusura la scala è già fissata dalle concentrazioni: la normalizzazione degli spettri non si applica.',
                     'en': 'With closure the scale is already fixed by the concentrations: spectra normalisation is not applied.'})
    normS = o['closure'] is None and o['norm'] != 'none'

    def post_c(CC):
        for k in o['unimodal']:
            u = mc_unimodal(mc_col(CC, k))
            for i in range(m):
                CC.a[i * nc + k] = u[i]
        if o['closure'] is not None and o['unimodal']:
            for i in range(m):
                s = 0.0
                for k in range(nc):
                    s += CC.a[i * nc + k]
                if s > 0:
                    for k in range(nc):
                        CC.a[i * nc + k] *= o['closure'] / s

    def post_s(SS, CC):
        if not normS:
            return
        for k in range(nc):
            if k in known:
                continue
            f = 0.0
            if o['norm'] == 'max':
                for j in range(n):
                    f = js_max(f, abs(SS.a[k * n + j]))
            else:
                for j in range(n):
                    f += SS.a[k * n + j] * SS.a[k * n + j]
                f = _sq(f)
            if f > 0:
                for j in range(n):
                    SS.a[k * n + j] /= f
                if CC is not None:
                    for i in range(m):
                        CC.a[i * nc + k] *= f

    if S is not None and C is None:
        post_s(S, None)
    lofPrev = None
    calm = 0
    converged = False
    it = 1
    while it <= o['maxIter']:
        if S is not None or it > 1:
            C = mc_step_c(D, S, o)
            post_c(C)
        S = mc_step_s(D, C, o, known if nKnown else None)
        post_s(S, C)
        lof = 100 * _sq(mc_sumsq(mc_residual(D, C, S).a) / sst)
        if not fin(lof):
            break
        if lofPrev is not None:
            rel = abs(lofPrev - lof) / _or(lofPrev, 1)
            if rel < o['tol'] or lof < 1e-10:
                calm += 1
                if calm >= o['patience'] or lof < 1e-10:
                    converged = True
                    break
            else:
                calm = 0
        lofPrev = lof
        it += 1
    if it > o['maxIter']:
        it = o['maxIter']
    E = mc_residual(D, C, S)
    sse = mc_sumsq(E.a)
    lof = 100 * _sq(sse / sst)
    r2 = 100 * (1 - sse / sst)
    if sv is None:
        sv = mc_svd(D, min(m, n))
    lofP = mc_lof_pca(sv['s'], nc, sst)
    if not converged:
        warn.append({'it': 'Nessuna convergenza in %d iterazioni: la mancanza di adattamento cambia ancora più dello %s%% a ogni passo.' % (o['maxIter'], _loc_it(o['tol'] * 100)),
                     'en': 'No convergence in %d iterations: the lack of fit still changes by more than %s%% per step.' % (o['maxIter'], js_str(o['tol'] * 100))})
    if lof > lofP * 1.5 + 0.5:
        warn.append({'it': 'La mancanza di adattamento (%s%%) è molto più alta di quella della PCA con lo stesso numero di componenti (%s%%): vincoli troppo stretti o partenza sfavorevole.' % (js_fixed(lof, 2), js_fixed(lofP, 2)),
                     'en': 'The lack of fit (%s%%) is much higher than PCA with the same number of components (%s%%): constraints too strict or a poor start.' % (js_fixed(lof, 2), js_fixed(lofP, 2))})
    warn.append({'it': 'La soluzione MCR-ALS in generale non è unica (ambiguità rotazionale): altri profili, compatibili con gli stessi vincoli, descrivono i dati altrettanto bene. Usa «Intervalli MCR-BANDS» per vedere quanto.',
                 'en': 'The MCR-ALS solution is in general not unique (rotational ambiguity): other profiles, compatible with the same constraints, describe the data equally well. Use «MCR-BANDS ranges» to see how much.'})
    return {'opt': o, 'C': C, 'S': S, 'lof': lof, 'r2': r2, 'expVar': r2, 'lofPca': lofP, 'sigma': _sq(sse / (m * n)),
            'sse': sse, 'sst': sst, 'iter': it, 'converged': converged, 'warnings': warn, 'info': info,
            'singular': list(sv['s']), 'known': sorted(known.keys())}


# ============================== mcr-core.js: MCR-BANDS ==============================
def mc_nelder_mead(F, x0, max_eval, step):
    # mcr-core.js nelderMead
    n = len(x0)
    ev = 0
    P = [list(x0)]
    for i in range(n):
        p = list(x0)
        p[i] += step * (abs(p[i]) if abs(p[i]) > 0.5 else 1)
        P.append(p)
    V = []
    for p in P:
        ev += 1
        V.append(F(p))
    while ev < max_eval:
        ordr = _cmp_sort(list(range(len(V))), lambda i: V[i])
        Ps = [P[i] for i in ordr]
        Vs = [V[i] for i in ordr]
        for i in range(n + 1):
            P[i] = Ps[i]
            V[i] = Vs[i]
        if abs(V[n] - V[0]) <= 1e-13 * (abs(V[0]) + 1e-13):
            break
        cen = [0.0] * n
        for i in range(n):
            for j in range(n):
                cen[j] += P[i][j] / n

        def at(t):
            return [cen[j] + t * (P[n][j] - cen[j]) for j in range(n)]
        xr = at(-1)
        fr = F(xr)
        ev += 1
        if fr < V[0]:
            xe = at(-2)
            fe = F(xe)
            ev += 1
            if fe < fr:
                P[n] = xe
                V[n] = fe
            else:
                P[n] = xr
                V[n] = fr
        elif fr < V[n - 1]:
            P[n] = xr
            V[n] = fr
        else:
            xc = at(-0.5) if fr < V[n] else at(0.5)
            fc = F(xc)
            ev += 1
            if fc < js_min(fr, V[n]):
                P[n] = xc
                V[n] = fc
            else:
                for i in range(1, n + 1):
                    P[i] = [P[0][j] + 0.5 * (v - P[0][j]) for j, v in enumerate(P[i])]
                    V[i] = F(P[i])
                    ev += 1
    b = 0
    for i in range(1, n + 1):
        if V[i] < V[b]:
            b = i
    return P[b]


def mc_bands(res, max_eval=1500, feas_tol=1e-8):
    # mcr-core.js bandsGen: MCR-BANDS (Jaumot e Tauler), ottimizzatore locale
    C = res['C']
    S = res['S']
    o = res['opt']
    k = C.n
    m = C.m
    n = S.n
    known = list(res['known'])
    if k < 2:
        return {'f': [{'fopt': 1, 'fmin': 1, 'fmax': 1}], 'width': 0}
    R = [0.0] * (m * n)
    for i in range(m):
        for j in range(n):
            s = 0.0
            for c in range(k):
                s += C.a[i * k + c] * S.a[c * n + j]
            R[i * n + j] = s
    tot = _sq(mc_sumsq(R))
    cn = [0.0] * (m * k)
    sn = [0.0] * (k * n)
    nC = _or(_sq(mc_sumsq(C.a)), 1)
    nS = _or(_sq(mc_sumsq(S.a)), 1)
    closure = o['closure'] is not None
    np_ = k * (k - 1)

    def Tof(p):
        T = [0.0] * (k * k)
        q = 0
        for i in range(k):
            s = 0.0
            for j in range(k):
                if i != j:
                    T[i * k + j] = p[q]
                    q += 1
                    s += T[i * k + j]
            T[i * k + i] = 1 - s if closure else 1.0
        return T

    def evalT(p):
        T = Tof(p)
        Ti = mc_inverse(T, k)
        if Ti is None:
            return None
        for i in range(m):
            for c in range(k):
                s = 0.0
                for q in range(k):
                    s += C.a[i * k + q] * T[q * k + c]
                cn[i * k + c] = s
        for c in range(k):
            for j in range(n):
                s = 0.0
                for q in range(k):
                    s += Ti[c * k + q] * S.a[q * n + j]
                sn[c * n + j] = s
        pen = 0.0
        if o['nonnegC']:
            for i in range(m * k):
                if cn[i] < 0:
                    pen += cn[i] * cn[i] / (nC * nC)
        if o['nonnegS']:
            for i in range(k * n):
                if sn[i] < 0:
                    pen += sn[i] * sn[i] / (nS * nS)
        for c in known:
            for j in range(n):
                d = sn[c * n + j] - S.a[c * n + j]
                pen += d * d / (nS * nS)
        for c in o['unimodal']:
            v = [cn[i * k + c] for i in range(m)]
            u = mc_unimodal(v)
            for i in range(m):
                d = u[i] - v[i]
                pen += d * d / (nC * nC)
        f = [0.0] * k
        for c in range(k):
            a = 0.0
            b = 0.0
            for i in range(m):
                a += cn[i * k + c] * cn[i * k + c]
            for j in range(n):
                b += sn[c * n + j] * sn[c * n + j]
            f[c] = _sq(a * b) / _or(tot, 1)
        return f, pen

    p0 = [0.0] * np_
    base = evalT(p0)
    fopt = list(base[0])
    out = []
    for c in range(k):
        r = {'fopt': fopt[c], 'fmin': fopt[c], 'fmax': fopt[c]}
        for sgn in (1, -1):
            best = [fopt[c]]
            starts = [p0]
            for q in range(np_):
                s1 = list(p0)
                s1[q] += 0.05
                starts.append(s1)
                s2 = list(p0)
                s2[q] -= 0.05
                starts.append(s2)
            for st in starts[0:1 + min(2 * np_, 6)]:
                x = list(st)
                for mu in (1e2, 1e4, 1e6, 1e8):
                    def F(p, mu=mu):
                        e = evalT(p)
                        if e is None:
                            return INF
                        if e[1] <= feas_tol:
                            v = e[0][c]
                            if (v < best[0]) if sgn > 0 else (v > best[0]):
                                best[0] = v
                        return sgn * e[0][c] + mu * e[1]
                    x = mc_nelder_mead(F, x, js_round(max_eval / 4), 0.1)
            if sgn > 0:
                r['fmin'] = js_min(r['fmin'], best[0])
            else:
                r['fmax'] = js_max(r['fmax'], best[0])
        out.append(r)
    width = js_max(*[rr['fmax'] - rr['fmin'] for rr in out])
    return {'f': out, 'width': width}


# ============================== kinetics-core.js ==============================
def kn_lm(res, p0, max_iter, h_rel, hmin):
    # kinetics-core.js lmGen: Levenberg–Marquardt con differenze centrali e scala di Moré
    np_ = len(p0)
    p = list(p0)
    r = res(p)
    if r is None:
        raise ErrApp('residui non calcolabili nel punto di partenza')
    f = mc_sumsq(r)
    nu = 2.0
    lam = None
    conv = False
    why = 'maxIter'
    dsc = [0.0] * np_

    def jac(p):
        N = len(r)
        J = [0.0] * (N * np_)
        for k in range(np_):
            h = h_rel * js_max(abs(p[k]), hmin)
            a = list(p)
            b = list(p)
            a[k] += h
            b[k] -= h
            ra = res(a)
            rb = res(b)
            if ra is None or rb is None:
                return None
            for i in range(N):
                J[i * np_ + k] = (ra[i] - rb[i]) / (2 * h)
        return J

    J = jac(p)
    it = 1
    while it <= max_iter:
        if J is None:
            why = 'jac'
            break
        N = len(r)
        A = [0.0] * (np_ * np_)
        g = [0.0] * np_
        for i in range(N):
            ri = r[i]
            o = i * np_
            for a in range(np_):
                ja = J[o + a]
                if not _truthy(ja):
                    continue
                g[a] += ja * ri
                for b in range(a + 1):
                    A[a * np_ + b] += ja * J[o + b]
        for a in range(np_):
            for b in range(a):
                A[b * np_ + a] = A[a * np_ + b]
        dmax = 0.0
        for a in range(np_):
            dmax = js_max(dmax, A[a * np_ + a])
        for a in range(np_):
            dsc[a] = js_max(dsc[a], A[a * np_ + a], 1e-12 * _or(dmax, 1))
        if lam is None:
            lam = 1e-3
        gmax = 0.0
        for a in range(np_):
            gmax = js_max(gmax, abs(g[a]) * _sq(1 / _or(A[a * np_ + a], 1e-300)))
        if gmax <= 1e-15 * _sq(_or(f, 1e-300)) or f == 0:
            conv = True
            why = 'grad'
            break
        accepted = False
        for _tries in range(60):
            B = list(A)
            for a in range(np_):
                B[a * np_ + a] += lam * dsc[a]
            ng = [-v for v in g]
            d = mc_solve_spd(B, np_, ng)
            pn = [p[i] + d[i] for i in range(np_)]
            rn = res(pn)
            fn = mc_sumsq(rn) if rn is not None else INF
            if fn < f:
                pred = 0.0
                for a in range(np_):
                    pred += d[a] * (lam * dsc[a] * d[a] - g[a])
                rho = (f - fn) / _or(pred, 1e-300)
                lam *= js_max(1 / 3, 1 - m_pow(2 * rho - 1, 3))
                nu = 2.0
                small = True
                for a in range(np_):
                    if abs(d[a]) > 1e-12 * (abs(p[a]) + 1e-12):
                        small = False
                df = (f - fn) / _or(f, 1e-300)
                p = pn
                r = rn
                f = fn
                accepted = True
                if small or df < 1e-16:
                    conv = True
                    why = 'step' if small else 'ssr'
                break
            lam *= nu
            nu *= 2
            if not fin(lam) or lam > 1e300:
                break
        if not accepted:
            conv = True
            why = 'nostep'
            break
        J = jac(p)
        if conv:
            break
        it += 1
    return {'p': p, 'r': r, 'ssr': f, 'J': J, 'iter': it, 'converged': conv, 'reason': why}


def kn_covariance(J, N, np_, s2):
    # kinetics-core.js covariance: s² (JᵀJ)⁻¹
    if J is None:
        raise ErrApp('Jacobiano mancante')
    A = [0.0] * (np_ * np_)
    for i in range(N):
        for a in range(np_):
            ja = J[i * np_ + a]
            if _truthy(ja):
                for b in range(np_):
                    A[a * np_ + b] += ja * J[i * np_ + b]
    Ai = mc_inverse(A, np_)
    if Ai is None:
        return None
    return [v * s2 for v in Ai]


def kn_plateau_cols(J, N, np_, p, log_scale):
    # kinetics-core.js plateauCols
    if J is None:
        raise ErrApp('Jacobiano mancante')
    nrm = [0.0] * np_
    for i in range(N):
        for k in range(np_):
            v = J[i * np_ + k]
            nrm[k] += v * v
    for k in range(np_):
        nrm[k] = _sq(nrm[k]) * (1 if log_scale else js_max(abs(p[k]), 1e-300))
    mx = js_max(*nrm)
    out = [k for k in range(np_) if not (nrm[k] > 1e-7 * mx)]
    return out if mx > 0 else []


def _ex(x):
    return m_exp(-x)


def _phi(x):
    # (1 − e^(−x))/x stabile per x → 0
    return 1 - x / 2 if abs(x) < 1e-8 else jdiv(-m_expm1(-x), x)


def _prof_ord0(t, k, o):
    a = js_max(0, 1 - k[0] * t)
    return [a, 1 - a]


def _prof_ord1(t, k, o):
    a = _ex(k[0] * t)
    return [a, 1 - a]


def _prof_ord2(t, k, o):
    a = jdiv(1, 1 + k[0] * t)
    return [a, 1 - a]


def _prof_consec(t, k, o):
    a = _ex(k[0] * t)
    d = k[1] - k[0]
    b = k[0] * t * _ex(k[0] * t) * _phi(d * t)
    return [a, b, js_max(-1, 1 - a - b)]


def _prof_rev(t, k, o):
    K = o.get('K') if (o and fin(o.get('K')) and o.get('K') > 0) else None
    e = _ex(k[0] * t)
    if K is None:
        return [1.0, e]
    kf = k[0] * K / (1 + K)
    kb = k[0] / (1 + K)
    a = jdiv(kb + kf * e, k[0])
    return [a, 1 - a]


def _prof_par(t, k, o):
    out = [_ex(v * t) for v in k]
    if o and o.get('offset'):
        out.append(1.0)
    return out


# kinetics-core.js MODELS: profili, specie, parametri, esponenziali (per l'annidamento)
KN_MODELS = {
    'ord0': {'species': ['A', 'P'], 'params': ['k'], 'exp': None, 'prof': _prof_ord0},
    'ord1': {'species': ['A', 'B'], 'params': ['k'], 'exp': [1, 1], 'prof': _prof_ord1},
    'ord2': {'species': ['A', 'P'], 'params': ['k'], 'exp': None, 'prof': _prof_ord2},
    'consec': {'species': ['A', 'B', 'C'], 'params': ['k1', 'k2'], 'exp': [2, 1], 'prof': _prof_consec},
    'rev': {'species': ['A', 'B'], 'params': ['kobs'], 'exp': [1, 1], 'prof': _prof_rev},
    'par': {'species': None, 'params': None, 'exp': 'par', 'prof': _prof_par},
}


def kn_model_info(mid, o):
    # kinetics-core.js modelInfo
    md = KN_MODELS.get(mid)
    if md is None:
        raise ErrApp('modello sconosciuto: ' + str(mid))
    o = o or {}
    if mid == 'par':
        nE = int(js_max(1, js_min(5, _or(js_round(_plus(o.get('nExp'))), 1))))
        sp = ['τ' + str(i + 1) for i in range(nE)]
        if o.get('offset'):
            sp.append('∞')
        return {'id': mid, 'species': sp, 'params': ['k' + str(i + 1) for i in range(nE)], 'exp': [nE, 1 if o.get('offset') else 0], 'das': True}
    if mid == 'rev' and not (fin(o.get('K')) and o.get('K') > 0):
        return {'id': mid, 'species': ['∞', 'τ1'], 'params': md['params'], 'exp': md['exp'], 'das': True, 'noK': True}
    return {'id': mid, 'species': md['species'], 'params': md['params'], 'exp': md['exp']}


def kn_qr(C, m, ns):
    # kinetics-core.js qr: Gram–Schmidt modificato con riortogonalizzazione
    Q = []
    keep = []
    cmax = 0.0
    cols = []
    for c in range(ns):
        v = [C[i * ns + c] for i in range(m)]
        cols.append(v)
        cmax = js_max(cmax, _sq(mc_sumsq(v)))
    for c in range(ns):
        v = list(cols[c])
        n0 = _sq(mc_sumsq(v))
        for _pass in range(2):
            for q in Q:
                d = 0.0
                for i in range(m):
                    d += q[i] * v[i]
                for i in range(m):
                    v[i] -= d * q[i]
        nv = _sq(mc_sumsq(v))
        if nv > 1e-10 * js_max(n0, cmax * 1e-3) and nv > 0:
            for i in range(m):
                v[i] /= nv
            Q.append(v)
            keep.append(c)
    return Q, keep


def kn_proj_resid(Q, Y, m, q):
    # kinetics-core.js projResid
    R = list(Y)
    for u in Q:
        for c in range(q):
            d = 0.0
            for i in range(m):
                d += u[i] * Y[i * q + c]
            for i in range(m):
                R[i * q + c] -= d * u[i]
    return R


def kn_profiles(md, info, t, k, t0, o):
    # kinetics-core.js profiles
    m = len(t)
    ns = len(info['species'])
    C = [0.0] * (m * ns)
    for i in range(m):
        tt = js_max(0, t[i] - _or(t0, 0))
        pr = md['prof'](tt, k, o)
        for c in range(ns):
            C[i * ns + c] = pr[c]
    return C


def kn_spectra_for(D, C, ns, nonneg):
    # kinetics-core.js spectraFor: minimi quadrati (o NNLS) per canale
    m, n, a = D.m, D.n, D.a
    G = [0.0] * (ns * ns)
    S = [0.0] * (ns * n)
    h = [0.0] * ns
    for i in range(m):
        for p in range(ns):
            v = C[i * ns + p]
            for q in range(ns):
                G[p * ns + q] += v * C[i * ns + q]
    CtD = [0.0] * (ns * n)
    for i in range(m):
        for p in range(ns):
            v = C[i * ns + p]
            if _truthy(v):
                o = p * n
                ro = i * n
                for j in range(n):
                    CtD[o + j] += v * a[ro + j]
    L = mc_chol(G, ns)
    for j in range(n):
        for p in range(ns):
            h[p] = CtD[p * n + j]
        s = mc_fnnls(G, h, ns) if nonneg else mc_chol_solve(L, ns, h)
        for p in range(ns):
            S[p * n + j] = s[p]
    return S


def kn_options(o):
    # kinetics-core.js options
    o = o or {}
    mid = o.get('model') if o.get('model') in KN_MODELS else 'ord1'
    t0 = o.get('t0')
    K = o.get('K')
    A0 = o.get('A0')
    rank = o.get('rank')
    k0 = o.get('k0')
    return {'model': mid, 'nExp': int(js_max(1, js_min(5, _or(js_round(_plus(o.get('nExp'))), 1)))),
            'offset': mid == 'par' and _truthy(o.get('offset')), 't0fit': _truthy(o.get('t0fit')),
            't0': t0 if fin(t0) else 0, 'K': K if (fin(K) and K > 0) else None, 'A0': A0 if (fin(A0) and A0 > 0) else None,
            'nonnegS': _truthy(o.get('nonnegS')), 'rank': int(rank) if (_isint(rank) and rank > 0) else None,
            'k0': [float(v) for v in k0 if fin(v) and v > 0] if isinstance(k0, list) else None,
            'maxIter': int(js_max(5, js_min(2000, _or(js_round(_plus(o.get('maxIter'))), 300))))}


def kn_fit(se, opt):
    # kinetics-core.js fitGen: fit globale con proiezione variabile e LM in log k
    o = kn_options(opt)
    md = KN_MODELS[o['model']]
    info = kn_model_info(o['model'], o)
    D = series_matrix(se)
    m, n = D.m, D.n
    t = [float(v) for v in se['t']['values']]
    ns = len(info['species'])
    nk = len(info['params'])
    if m < nk + ns + 2:
        raise ErrApp('troppo pochi tempi per questo modello')
    if not all(fin(v) for v in t):
        raise ErrApp('tempi non validi')
    warn = []

    def W(it_, en_):
        warn.append({'it': it_, 'en': en_})
    sv = None
    if o['nonnegS']:
        Y = D.a
        q = n
    elif n > m or o['rank']:
        sv = mc_svd(D)
        q = min(o['rank'], sv['q']) if o['rank'] else sv['q']
        Y = [0.0] * (m * q)
        for i in range(m):
            for c in range(q):
                Y[i * q + c] = sv['U'].a[i * sv['q'] + c] * sv['s'][c]
    else:
        Y = D.a
        q = n
    useT0 = o['t0fit']
    np_ = nk + (1 if useT0 else 0)

    def unpack(p):
        return [m_exp(p[i]) for i in range(nk)], (p[nk] if useT0 else o['t0'])

    def resid_for(p):
        k, t0 = unpack(p)
        if not all(fin(v) and v > 0 and v < 1e300 for v in k):
            return None
        C = kn_profiles(md, info, t, k, t0, o)
        if not all(fin(v) for v in C):
            return None
        if o['nonnegS']:
            S = kn_spectra_for(D, C, ns, True)
            R = [0.0] * (m * n)
            for i in range(m):
                for j in range(n):
                    s = D.a[i * n + j]
                    for c in range(ns):
                        s -= C[i * ns + c] * S[c * n + j]
                    R[i * n + j] = s
            return R
        Q = kn_qr(C, m, ns)[0]
        return kn_proj_resid(Q, Y, m, q)

    def ssr_of(p):
        r = resid_for(p)
        return mc_sumsq(r) if r is not None else INF
    t0o = _or(o['t0'], 0)
    tpos = [v - t0o for v in t if v - t0o > 0]
    tmax = _or(js_max(*t) - js_min(0, *t), 1)
    tmin = js_min(*tpos) if tpos else tmax / m
    lo = m_log(0.05 / tmax)
    hi = m_log(20 / js_max(tmin, tmax / (10 * m)))
    p0 = None
    if o['k0'] and len(o['k0']) >= nk:
        p0 = [m_log(v) for v in o['k0'][:nk]] + ([o['t0']] if useT0 else [])
    else:
        G = 28 if nk == 1 else (14 if nk == 2 else 8)
        grid = [lo + (hi - lo) * i / (G - 1) for i in range(G)]
        best = [INF]
        p0box = [None]

        def tryP(ks):
            p = [float(v) for v in ks] + ([float(o['t0'])] if useT0 else [])
            f = ssr_of(p)
            if f < best[0]:
                best[0] = f
                p0box[0] = p
        if nk == 1:
            for i in range(G):
                tryP([grid[i]])
        elif nk == 2:
            for i in range(G):
                for j in range(G):
                    if (i != j) if o['model'] == 'consec' else (j < i):
                        tryP([grid[i], grid[j]])
        else:
            combos = []

            def rec(start, acc):
                if len(acc) == nk:
                    combos.append(list(acc))
                    return
                for i in range(start, G):
                    acc.append(grid[i])
                    rec(i + 1, acc)
                    acc.pop()
            rec(0, [])
            for cmb in combos:
                tryP(list(reversed(cmb)))
        p0 = p0box[0]
        if p0 is None:
            raise ErrApp('nessuna partenza valida')
    R = kn_lm(resid_for, p0, o['maxIter'], 1e-6, 1e-2)
    uk, ut0 = unpack(R['p'])
    C = kn_profiles(md, info, t, uk, ut0, o)
    S = kn_spectra_for(D, C, ns, o['nonnegS'])
    E = [0.0] * (m * n)
    sse = 0.0
    for i in range(m):
        for j in range(n):
            s = D.a[i * n + j]
            for c in range(ns):
                s -= C[i * ns + c] * S[c * n + j]
            E[i * n + j] = s
            sse += s * s
    rankC = len(kn_qr(C, m, ns)[1])
    N = m * n
    P = np_ + rankC * n
    dof = max(1, N - P)
    s2 = sse / dof
    NJ = len(R['r'])
    flat = kn_plateau_cols(R['J'], NJ, np_, R['p'], True)
    cov = None if flat else kn_covariance(R['J'], NJ, np_, s2)
    se_ = [_sq(js_max(0, cov[i * np_ + i])) for i in range(np_)] if cov else None
    corr = [[jdiv(cov[i * np_ + j], _sq(cov[i * np_ + i] * cov[j * np_ + j])) for j in range(np_)] for i in range(np_)] if cov else None
    params = []
    for i, nm in enumerate(info['params']):
        k = uk[i]
        sl = se_[i] if se_ else NAN
        params.append({'name': nm, 'value': k, 'se': k * sl, 'seLog': sl, 'lo95': k * m_exp(-1.96 * sl), 'hi95': k * m_exp(1.96 * sl), 'tau': jdiv(1, k)})
    if useT0:
        st0 = se_[nk] if se_ else NAN
        params.append({'name': 't0', 'value': ut0, 'se': st0, 'lo95': ut0 - 1.96 * st0, 'hi95': ut0 + 1.96 * st0})
    for i in flat:
        if i < len(params):
            params[i]['undetermined'] = True
    derived = []
    if o['model'] == 'rev' and o['K']:
        K = o['K']
        kf = uk[0] * K / (1 + K)
        kb = uk[0] / (1 + K)
        sl = se_[0] if se_ else NAN
        derived.append({'name': 'kf', 'value': kf, 'se': kf * sl})
        derived.append({'name': 'kb', 'value': kb, 'se': kb * sl})
    if o['model'] in ('ord2', 'ord0') and o['A0']:
        f = 1 / o['A0'] if o['model'] == 'ord2' else o['A0']
        derived.append({'name': 'k', 'value': uk[0] * f, 'se': params[0]['se'] * f, 'unit': '1/(conc·tempo)' if o['model'] == 'ord2' else 'conc/tempo'})
    pn = lambda i: info['params'][i] if i < nk else 't0'
    if rankC < ns:
        W('Le colonne delle concentrazioni sono quasi dipendenti (%d su %d): i SAS non sono determinati.' % (rankC, ns),
          'The concentration columns are nearly dependent (%d of %d): the SAS are not determined.' % (rankC, ns))
    if corr:
        for i in range(np_):
            for j in range(i):
                if abs(corr[i][j]) > 0.95:
                    W('Correlazione alta fra %s e %s (%s): i due parametri non si distinguono bene con questi dati.' % (pn(i), pn(j), js_fixed(corr[i][j], 3)),
                      'High correlation between %s and %s (%s): the two parameters are poorly distinguished by these data.' % (pn(i), pn(j), js_fixed(corr[i][j], 3)))
    if o['model'] == 'consec':
        d = abs(R['p'][0] - R['p'][1])
        sd = m_hypot(se_[0], se_[1]) if se_ else INF
        if d < 2 * sd or d < 0.05:
            W('k₁ e k₂ sono quasi uguali: il caso k₁ = k₂ è trattato a parte (limite di Bateman) e le incertezze sono grandi.',
              'k₁ and k₂ are nearly equal: the k₁ = k₂ case is handled separately (Bateman limit) and the uncertainties are large.')
        W('Con spettri liberi le soluzioni (k₁, k₂) e (k₂, k₁) descrivono i dati allo stesso modo: si sceglie quella con i SAS meno negativi, ma va confermata con la chimica.',
          'With free spectra the solutions (k₁, k₂) and (k₂, k₁) describe the data equally well: the one with the least negative SAS is chosen, but it must be confirmed by the chemistry.')
    if o['model'] == 'rev' and not o['K']:
        W('A ⇌ B senza costante di equilibrio: solo k_obs = k_f + k_b; gli spettri mostrati sono associati ai decadimenti (DAS), non alle specie.',
          'A ⇌ B without an equilibrium constant: only k_obs = k_f + k_b; the spectra shown are decay-associated (DAS), not species-associated.')
    if o['model'] == 'ord2' and not o['A0']:
        W('Secondo ordine: il valore stimato è k\' = k[A]₀ (1/tempo). Scrivi [A]₀ per avere k.',
          'Second order: the estimate is k\' = k[A]₀ (1/time). Enter [A]₀ to obtain k.')
    for pp in params[:nk]:
        if pp['value'] * tmax < 0.05:
            W('%s è troppo lenta per l\'intervallo dei tempi (k·t_max = %s): stima poco affidabile.' % (pp['name'], js_prec(pp['value'] * tmax, 2)),
              '%s is too slow for the time range (k·t_max = %s): unreliable estimate.' % (pp['name'], js_prec(pp['value'] * tmax, 2)))
        if pp['value'] * tmin > 20:
            W('%s è più veloce del primo intervallo di tempo: stima poco affidabile.' % pp['name'],
              '%s is faster than the first time interval: unreliable estimate.' % pp['name'])
    if o['model'] == 'ord0' and uk[0] * (js_max(*t) - ut0) < 1:
        W('Ordine 0: [A] non arriva a zero nell\'intervallo dei tempi, quindi il profilo è una retta e con spettri liberi k non si determina (qualunque k dà lo stesso fit). Serve uno spettro noto o un intervallo più lungo.',
          'Zero order: [A] does not reach zero within the time range, so the profile is a straight line and with free spectra k is not determined (any k gives the same fit). A known spectrum or a longer time range is needed.')
    if flat:
        nm = ', '.join(pn(i) for i in flat)
        W('%s: il parametro cresce o cala senza limite (pianoro: la somma dei quadrati non cambia più). Non ha un valore determinato da questi dati: niente numero e niente incertezze. Prova un altro modello o delle k di partenza.' % nm,
          '%s: the parameter grows or shrinks without limit (plateau: the sum of squares no longer changes). It has no value determined by these data: no number and no uncertainties. Try another model or starting k values.' % nm)
    if not R['converged']:
        W('Il fit non ha raggiunto la convergenza nel numero massimo di iterazioni.', 'The fit did not converge within the maximum number of iterations.')
    if sv is None:
        sv = mc_svd(D)
    svRest = 0.0
    for c in range(rankC, len(sv['s'])):
        svRest += sv['s'][c] * sv['s'][c]
    if svRest > 0 and sse > 2 * svRest and sse - svRest > 1e-12 * mc_sumsq(D.a):
        W('I residui sono %s volte quelli della SVD con %d componenti: il modello non descrive bene i dati (residui con struttura).' % (js_fixed(sse / svRest, 1), rankC),
          'The residuals are %s times those of the SVD with %d components: the model does not describe the data well (structured residuals).' % (js_fixed(sse / svRest, 1), rankC))
    swap = None
    if o['model'] == 'consec':
        k2 = [uk[1], uk[0]]
        C2 = kn_profiles(md, info, t, k2, ut0, o)
        S2 = kn_spectra_for(D, C2, ns, o['nonnegS'])

        def negS(SS):
            a = 0.0
            b = 0.0
            for v in SS:
                b += v * v
                if v < 0:
                    a += v * v
            return a / _or(b, 1)
        n1 = negS(S)
        n2 = negS(S2)
        swap = {'k': k2, 'neg': n2, 'negMain': n1}
        if n2 < n1 - 1e-9:
            params[0]['value'] = k2[0]
            params[1]['value'] = k2[1]
            se0 = params[1]['se'] * k2[0] / uk[1]
            se1 = params[0]['se'] * k2[1] / uk[0]
            params[0]['se'] = se0
            params[1]['se'] = se1
            for pp in params[:2]:
                pp['lo95'] = pp['value'] * m_exp(-1.96 * (pp['se'] / pp['value']))
                pp['hi95'] = pp['value'] * m_exp(1.96 * (pp['se'] / pp['value']))
                pp['tau'] = 1 / pp['value']
                pp['seLog'] = pp['se'] / pp['value']
            C = C2
            S = S2
            swap = {'k': list(uk), 'neg': n1, 'negMain': n2, 'swapped': True}
    lnN = m_log(N)
    aic = N * m_log(sse / N) + 2 * P
    bic = N * m_log(sse / N) + P * lnN
    return {'opt': o, 'model': o['model'], 'info': info, 'species': info['species'], 'params': params, 'derived': derived,
            'corr': corr, 'C': Mat(m, ns, C), 'S': Mat(ns, n, S), 'ssr': sse, 'sigma': _sq(s2), 'N': N, 'P': P, 'dof': dof,
            'aic': aic, 'bic': bic, 'iter': R['iter'], 'converged': R['converged'], 'rankC': rankC, 'swap': swap,
            'warnings': warn, 't': t}


def kn_lgamma(x):
    # kinetics-core.js lgamma (Lanczos, g = 7)
    g = 7
    c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
         12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]
    if x < 0.5:
        return m_log(math.pi / abs(m_sin(math.pi * x))) - kn_lgamma(1 - x)
    x -= 1
    a = c[0]
    t = x + g + 0.5
    for i in range(1, 9):
        a += c[i] / (x + i)
    return 0.5 * m_log(2 * math.pi) + (x + 0.5) * m_log(t) - t + m_log(a)


def kn_betacf(a, b, x):
    # kinetics-core.js betacf
    FPMIN = 1e-300
    qab = a + b
    qap = a + 1
    qam = a - 1
    c = 1.0
    d = 1 - qab * x / qap
    if abs(d) < FPMIN:
        d = FPMIN
    d = 1 / d
    h = d
    for m in range(1, 501):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1 + aa * d
        if abs(d) < FPMIN:
            d = FPMIN
        c = 1 + aa / c
        if abs(c) < FPMIN:
            c = FPMIN
        d = 1 / d
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1 + aa * d
        if abs(d) < FPMIN:
            d = FPMIN
        c = 1 + aa / c
        if abs(c) < FPMIN:
            c = FPMIN
        d = 1 / d
        dl = d * c
        h *= dl
        if abs(dl - 1) < 3e-16:
            break
    return h


def kn_betainc(a, b, x):
    # kinetics-core.js betainc
    if x <= 0:
        return 0.0
    if x >= 1:
        return 1.0
    bt = m_exp(kn_lgamma(a + b) - kn_lgamma(a) - kn_lgamma(b) + a * m_log(x) + b * m_log(1 - x))
    return bt * kn_betacf(a, b, x) / a if x < (a + 1) / (a + b + 2) else 1 - bt * kn_betacf(b, a, 1 - x) / b


def kn_f_survival(f, d1, d2):
    # kinetics-core.js fSurvival: P(F > f)
    if not (f > 0):
        return 1.0
    return kn_betainc(d2 / 2, d1 / 2, d2 / (d2 + d1 * f))


def kn_nested(a, b):
    # kinetics-core.js nested
    ea = a['info']['exp']
    eb = b['info']['exp']
    if not ea or not eb:
        return False
    return ea[0] <= eb[0] and ea[1] <= eb[1] and a['P'] < b['P']


def kn_compare(results):
    # kinetics-core.js compare: AIC, BIC, pesi di Akaike e test F fra modelli annidati
    ok = [r for r in results if r and fin(r['ssr'])]
    if not ok:
        return {'rows': [], 'tests': []}
    amin = js_min(*[r['aic'] for r in ok])
    bmin = js_min(*[r['bic'] for r in ok])
    rows = [{'model': r['model'], 'label': r.get('label') or r['model'], 'ssr': r['ssr'], 'P': r['P'], 'aic': r['aic'], 'bic': r['bic'],
             'dAIC': r['aic'] - amin, 'dBIC': r['bic'] - bmin, 'wAIC': 0} for r in ok]
    z = 0
    for r in rows:
        z = z + m_exp(-r['dAIC'] / 2)
    for r in rows:
        r['wAIC'] = jdiv(m_exp(-r['dAIC'] / 2), z)
    tests = []
    for a in ok:
        for b in ok:
            if a is not b and kn_nested(a, b):
                d1 = b['P'] - a['P']
                d2 = b['N'] - b['P']
                F = jdiv((a['ssr'] - b['ssr']) / d1, jdiv(b['ssr'], d2))
                tests.append({'simple': a.get('label') or a['model'], 'complex': b.get('label') or b['model'], 'F': F, 'd1': d1, 'd2': d2, 'p': kn_f_survival(F, d1, d2)})
    return {'rows': rows, 'tests': tests}


# chemo-ui.js CMP_SET e cmpGen: i modelli del confronto
KN_CMP_SET = [('ord0', {'model': 'ord0'}), ('ord1', {'model': 'ord1'}), ('ord2', {'model': 'ord2'}), ('consec', {'model': 'consec'}),
              ('par2', {'model': 'par', 'nExp': 2}), ('par2c', {'model': 'par', 'nExp': 2, 'offset': True}),
              ('par3c', {'model': 'par', 'nExp': 3, 'offset': True})]


def kn_cmp(se):
    # chemo-ui.js cmpGen: un modello non applicabile ai dati si salta
    out = []
    for mid, o in KN_CMP_SET:
        try:
            r = kn_fit(se, o)
        except ErrApp:
            continue
        r['label'] = mid
        out.append(r)
    return kn_compare(out)


# ============================== mcr-core.js: serie ==============================
def series_matrix(se):
    # mcr-core.js seriesMatrix
    m, n = se['shape']
    return Mat(int(m), int(n), [float(v) for v in se['data']])


def valid_series(se):
    # mcr-core.js validSeries
    try:
        if not se or not isinstance(se.get('shape'), list) or len(se['shape']) != 2:
            return False
        m, n = se['shape']
        tv = (se.get('t') or {}).get('values')
        xv = (se.get('x') or {}).get('values')
        return (_isint(m) and _isint(n) and m >= 2 and n >= 2 and tv is not None and xv is not None and len(tv) == m and len(xv) == n
                and se.get('data') is not None and len(se['data']) == m * n and all(fin(v) for v in tv) and all(fin(v) for v in xv))
    except Exception:
        return False


def ch_interp(xs, ys, X):
    # chemo-ui.js interp: spettro noto portato sull'asse della serie
    up = xs[0] <= xs[-1]
    N = len(xs)
    out = [0.0] * len(X)
    for j in range(len(X)):
        x = X[j]
        lo = 0
        hi = N - 1
        while hi - lo > 1:
            mid = (lo + hi) >> 1
            if (xs[mid] <= x) == up:
                lo = mid
            else:
                hi = mid
        w = 0 if xs[hi] == xs[lo] else (x - xs[lo]) / (xs[hi] - xs[lo])
        out[j] = ys[lo] + (ys[hi] - ys[lo]) * js_min(1, js_max(0, w))
    return out


# ============================== chemo-ui.js: tabelle CSV ==============================
# index.html INSTR[...].xPdf (per xLab di chemo-ui.js)
CH_XPDF = {'ftir': 'cm-1', 'raman': 'cm-1', 'uv': 'nm', 'fluo': 'nm', 'hplc': 'min', 'xrf': 'keV', 'libs': 'nm', 'tga': '°C',
           'dsc': '°C', 'nmr': 'ppm', 'epr': 'mT', 'sorp': 'p/p₀', 'chem': '°C', 'gen': ''}


def _ch_g(v, d, en):
    # chemo-ui.js g: numero con d cifre significative, esponenziale fuori da [1e-3, 1e5)
    if v is None or not fin(float(v)):
        return '—'
    v = float(v)
    dc = '.' if en else ','
    if abs(v) >= 1e5 or (abs(v) < 1e-3 and v != 0):
        return js_expo(v, (d or 4) - 1).replace('.', dc, 1)
    return num_prec(v, d or 4).replace('.', dc, 1)


def _ch_cell(c, en):
    # chemo-ui.js csvText, cella
    sep = ',' if en else ';'
    if isinstance(c, (int, float)) and not isinstance(c, bool):
        s = js_str(float(c)).replace('.', '.' if en else ',', 1) if math.isfinite(c) else ''
    else:
        s = '' if c is None else str(c)
    if re.match(r'[=+\-@]', s) and not re.match(r'[-+]?\d', s):
        s = "'" + s
    if sep in s or re.search(r'["\n\r]', s):
        return '"' + s.replace('"', '""') + '"'
    return s


def ch_csv_text(rows, en):
    # chemo-ui.js csvText: BOM, separatore ; (IT) o , (EN), righe CRLF
    sep = ',' if en else ';'
    return '﻿' + '\r\n'.join(sep.join(_ch_cell(c, en) for c in r) for r in rows) + '\r\n'


def _utf16_slice(s, n):
    # String.prototype.slice(0, n) conta le unità UTF-16
    b = s.encode('utf-16-le', 'surrogatepass')
    return b[:2 * n].decode('utf-16-le', 'surrogatepass')


def ch_safe(s):
    # chemo-ui.js safe: nome del file
    s = re.sub(r'\.[^.]{1,7}\Z', '', str(s), count=1)
    s = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', '_', s)
    return _utf16_slice(s, 80)


def _q_name(q, T):
    # chemo-ui.js qName
    tab = {'tempo': T('tempo', 'time'), 'dose': 'dose', 'temperatura': T('temperatura', 'temperature'), 'altro': T('valore', 'value')}
    return tab.get(q) or q or T('valore', 'value')


def _t_lab(se, T):
    # chemo-ui.js tLab
    u = se['t'].get('unit')
    return _q_name(se['t'].get('quantity'), T) + (' (' + str(u) + ')' if u else '')


def _x_lab(f):
    # chemo-ui.js xLab
    return CH_XPDF.get(f.get('instr')) or 'x'


def _mcr_metrics(res, T, en):
    # chemo-ui.js mcrMetrics
    g = lambda v, d: _ch_g(v, d, en)
    return [[T('Mancanza di adattamento', 'Lack of fit'), g(res['lof'], 4) + ' %'],
            [T('Mancanza di adattamento minima (PCA, stesse componenti)', 'Minimum lack of fit (PCA, same components)'), g(res['lofPca'], 4) + ' %'],
            [T('Varianza spiegata', 'Explained variance'), g(res['expVar'], 6) + ' %'],
            [T('Scarto quadratico medio dei residui', 'Residual root mean square'), g(res['sigma'], 4)],
            [T('Iterazioni', 'Iterations'), str(res['iter'])],
            [T('Convergenza', 'Convergence'), T('sì', 'yes') if res['converged'] else T('no', 'no')]]


def ch_mcr_rows(f, res, B, T, en):
    # chemo-ui.js mcrRows
    se = f['series']
    k = res['C'].n
    rows = [[T('MCR-ALS', 'MCR-ALS'), f.get('title') or f.get('name')], [T('Algoritmo', 'Algorithm'), 'mcr-1 · ' + (res['info'].get('init') or '')]]
    o = res['opt']
    parts = [T('C ≥ 0', 'C ≥ 0') if o['nonnegC'] else '', T('S ≥ 0', 'S ≥ 0') if o['nonnegS'] else '',
             T('chiusura ', 'closure ') + js_str(float(o['closure'])) if o['closure'] is not None else '',
             T('unimodalità ', 'unimodality ') + ' '.join(str(u + 1) for u in o['unimodal']) if o['unimodal'] else '',
             T('spettri noti ', 'known spectra ') + ' '.join(str(u + 1) for u in res['known']) if res['known'] else '',
             T('normalizzazione ', 'normalisation ') + ('—' if o['closure'] is not None else o['norm'])]
    rows.append([T('Vincoli', 'Constraints'), '; '.join(p for p in parts if p)])
    for r in _mcr_metrics(res, T, en):
        rows.append(r)
    for w in res['warnings']:
        rows.append([T('Avviso', 'Warning'), w['en'] if en else w['it']])
    if B:
        for i, b in enumerate(B['f']):
            rows.append(['MCR-BANDS ' + str(i + 1), b['fmin'], b['fopt'], b['fmax']])
    rows.append([])
    rows.append([_t_lab(se, T)] + ['C' + str(c + 1) for c in range(k)])
    tv = se['t']['values']
    for i in range(res['C'].m):
        rows.append([float(tv[i])] + res['C'].a[i * k:(i + 1) * k])
    rows.append([])
    rows.append([_x_lab(f)] + ['S' + str(c + 1) for c in range(k)])
    n = res['S'].n
    xv = se['x']['values']
    for j in range(n):
        rows.append([float(xv[j])] + [res['S'].a[c * n + j] for c in range(k)])
    return rows


def _model_names(T):
    # chemo-ui.js MODEL_NAMES
    return {'ord0': T('ordine 0 (A → P)', 'zero order (A → P)'), 'ord1': T('primo ordine (A → B)', 'first order (A → B)'),
            'ord2': T('secondo ordine (2A → P, A + B → P)', 'second order (2A → P, A + B → P)'),
            'consec': T('consecutive (A → B → C)', 'consecutive (A → B → C)'), 'rev': T('equilibrio (A ⇌ B)', 'equilibrium (A ⇌ B)'),
            'par': T('paralleli (somma di esponenziali, DAS)', 'parallel (sum of exponentials, DAS)')}


def _cmp_label(mid, T):
    # chemo-ui.js cmpLabel
    lab = {'par2': T('2 esponenziali', '2 exponentials'), 'par2c': T('2 esponenziali + costante', '2 exponentials + constant'),
           'par3c': T('3 esponenziali + costante', '3 exponentials + constant')}
    return lab.get(mid) or _model_names(T).get(mid) or mid


def ch_kin_rows(f, res, T, en):
    # chemo-ui.js kinRows
    g = lambda v, d: _ch_g(v, d, en)
    u = f['series']['t'].get('unit') or T('unità dell\'asse', 'axis unit')
    out = []
    for p in res['params']:
        unit = u if p['name'] == 't0' else '1/' + u
        if p.get('undetermined'):
            out.append([p['name'], T('non determinato (pianoro)', 'not determined (plateau)'), '—', '—', unit, ''])
        else:
            tau = g(p['tau'], 4) + ' ' + u if (p.get('tau') is not None and p['name'] != 't0') else ''
            out.append([p['name'], g(p['value'], 6), g(p['se'], 3), '%s – %s' % (g(p['lo95'], 4), g(p['hi95'], 4)), unit, tau])
    for d in res['derived']:
        out.append([d['name'], g(d['value'], 6), g(d['se'], 3), '', d.get('unit') or '1/' + u, ''])
    return out


def ch_kin_rows_csv(f, res, cmp, T, en):
    # chemo-ui.js kinRowsCsv
    se = f['series']
    ns = len(res['species'])
    rows = [[T('Cinetica globale', 'Global kinetics'), f.get('title') or f.get('name')], [T('Modello', 'Model'), _model_names(T)[res['model']]],
            [T('Parametro', 'Parameter'), T('Valore', 'Value'), T('Errore standard', 'Standard error'), T('IC 95%', '95% CI'), T('Unità', 'Unit'), 'τ']]
    rows.extend(ch_kin_rows(f, res, T, en))
    rows.extend([[T('Somma dei quadrati', 'Sum of squares'), res['ssr']], ['σ', res['sigma']], ['N', res['N']], [T('Parametri', 'Parameters'), res['P']],
                 ['AIC', res['aic']], ['BIC', res['bic']]])
    if res['corr']:
        for i, r in enumerate(res['corr']):
            rows.append([T('correlazione ', 'correlation ') + res['params'][i]['name']] + list(r))
    for w in res['warnings']:
        rows.append([T('Avviso', 'Warning'), w['en'] if en else w['it']])
    if cmp:
        rows.append([])
        rows.append([T('Modello', 'Model'), T('Somma dei quadrati', 'Sum of squares'), T('Parametri', 'Parameters'), 'AIC', 'BIC', 'ΔAIC', 'ΔBIC'])
        for r in cmp['rows']:
            rows.append([_cmp_label(r['label'], T), r['ssr'], r['P'], r['aic'], r['bic'], r['dAIC'], r['dBIC']])
        for t in cmp['tests']:
            rows.append(['F', _cmp_label(t['simple'], T) + ' → ' + _cmp_label(t['complex'], T), t['F'], t['d1'], t['d2'], t['p']])
    rows.append([])
    rows.append([_t_lab(se, T)] + ['C ' + s for s in res['species']])
    for i in range(res['C'].m):
        rows.append([res['t'][i]] + res['C'].a[i * ns:(i + 1) * ns])
    rows.append([])
    rows.append([_x_lab(f)] + [('DAS ' if res['info'].get('das') else 'SAS ') + s for s in res['species']])
    n = res['S'].n
    xv = se['x']['values']
    for j in range(n):
        rows.append([float(xv[j])] + [res['S'].a[c * n + j] for c in range(ns)])
    return rows


def ch_mcr_input(f):
    # chemo-ui.js mcrOpts + knownFor + mcrInput: opzioni effettive di MCR-ALS per la serie
    se = f['series']
    m, n = int(se['shape'][0]), int(se['shape'][1])
    o = dict(f.get('mcr') or {})
    if not o.get('nc'):
        if f.get('mcr_nc'):
            o['nc'] = int(f['mcr_nc'])
        else:
            # mcrOpts: senza nc salvato vale l'indicazione IND dai valori singolari (scheda MCR aperta), altrimenti 2
            lim = min(8, m, n)
            if f.get('mcr_svd_visto', True):
                sv = mc_svd(series_matrix(se), min(m, n, 30))
                o['nc'] = min(lim, max(1, mc_suggest_rank(sv['s'], m, n)))
            else:
                o['nc'] = min(lim, 2)
    known = {}
    kxy = f.get('mcr_known_xy') or {}
    if o.get('known'):
        xv = [float(v) for v in se['x']['values']]
        for k in o['known']:
            if k in kxy and kxy[k]:
                P = kxy[k]
                known[k] = ch_interp([float(v) for v in P['xs']], [float(v) for v in P['ys']], xv)
    o['known'] = known
    o['svd'] = None
    return o


def chemo_tables(f, lingua='it'):
    """chemo-ui.js analysisFiles([f]): [(nome_file, testo)] per una serie.
    f (dizionario, dal file di progetto e dallo stato dell'app):
      name, title        nome e titolo dello spettro derivato (f.name, f.title)
      instr              tecnica (f.instr), per l'etichetta dell'asse x
      series             f.series: {t:{values, quantity, unit}, x:{values}, shape:[m,n], data:[m·n numeri per righe]}
      mcr                opzioni MCR-ALS (f.an.mcr), {} se il risultato c'è senza opzioni salvate, None se non c'è
      mcr_nc             numero di componenti effettivo (res.opt.nc), facoltativo
      mcr_svd_visto      senza nc: True se la scheda MCR era aperta (indicazione IND), False se no (2)
      mcr_known_xy       {'k': {xs, ys}} spettri noti: processed() del file indicato in f.an.mcr.known[k]
      mcr_bands          True se l'app ha l'esito di MCR-BANDS per queste opzioni (si ricalcola)
      kin                opzioni della cinetica: Object.assign({model:'ord1'}, f.an.kin), None se non c'è
      kin_cmp            True se l'app ha il confronto dei modelli per questa serie (si ricalcola)
      sonda              facoltativa: la sonda di acch_math (SONDA_JS); di solito il motore lo sceglie una volta sola
                         lo script con imposta_motore, e qui non serve
      motore             facoltativo: 'v8-fma' | 'v8' | 'jsc' (senza sonda né motore resta quello già scelto)
    """
    en = lingua == 'en'
    T = (lambda a, b: b) if en else (lambda a, b: a)
    se = f.get('series')
    if not valid_series(se):
        return []
    vecchio = MOTORE[0]
    if f.get('sonda') is not None:
        imposta_motore(f['sonda'])
    elif f.get('motore'):
        usa_motore(f['motore'])
    try:
        return _chemo_tables(f, se, en, T)
    finally:
        MOTORE[0] = vecchio


def _chemo_tables(f, se, en, T):
    # chemo-ui.js analysisFiles, con il motore già scelto
    out = []
    name = ch_safe(f.get('title') or f.get('name'))
    res_m = None
    if f.get('mcr') is not None:
        try:
            res_m = mc_als(series_matrix(se), ch_mcr_input(f))
        except ErrApp:
            res_m = None
    res_k = None
    if f.get('kin') is not None:
        try:
            res_k = kn_fit(se, dict({'model': 'ord1'}, **f['kin']))
        except ErrApp:
            res_k = None
    if res_m:
        B = mc_bands(res_m) if f.get('mcr_bands') else None
        out.append(('mcr_als_' + name + '.csv', ch_csv_text(ch_mcr_rows(f, res_m, B, T, en), en)))
    if res_k:
        cmp = kn_cmp(se) if f.get('kin_cmp') else None
        out.append((('global_kinetics_' if en else 'cinetica_globale_') + name + '.csv', ch_csv_text(ch_kin_rows_csv(f, res_k, cmp, T, en), en)))
    return out
