# ---------------------------------------------------------------------------------------------
# Modulo acch_ricetta: trascrizione in Python (solo libreria standard) delle funzioni di
# Acchiappaspettri che la ricetta usa. Ogni funzione cita la funzione dell'app da cui deriva
# (index.html, blocco /*CORE-START*/…/*CORE-END*/, oppure il modulo app/*.js indicato).
# Regola: stesse operazioni nello stesso ordine dell'app, così i numeri in virgola mobile
# coincidono. Nessuna funzione di numpy o scipy: bordi e ordine delle somme cambierebbero i
# numeri. Un passo non trascritto si ferma con NonTrascritto, mai con un'approssimazione.
# ---------------------------------------------------------------------------------------------
import sys, os, re, json, math, struct, hashlib, argparse
from decimal import Decimal, ROUND_HALF_UP

NAN = float('nan')
INF = float('inf')


class NonTrascritto(Exception):
    """Parte della ricetta che lo script non sa rifare in modo identico all'app."""


class LetturaDiversa(Exception):
    """Il file letto non dà gli stessi numeri che l'app aveva letto."""


# ============================== semantica numerica di JavaScript ==============================
def fin(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def js_round(x):
    # Math.round: metà verso +∞ (round() di Python arrotonda al pari)
    if not math.isfinite(x):
        return x
    r = math.floor(x)
    return r + 1 if x - r >= 0.5 else r


def js_max(*a):
    # Math.max: NaN se un argomento è NaN
    m = -INF
    for v in a:
        if v != v:
            return NAN
        if v > m:
            m = v
    return m


def js_min(*a):
    m = INF
    for v in a:
        if v != v:
            return NAN
        if v < m:
            m = v
    return m


def js_or1(v):
    # (v||1): 0 e NaN diventano 1
    return v if (v == v and v != 0) else 1


def _digits(v):
    # cifre più brevi che rileggono lo stesso double (come Number.prototype.toString)
    d = Decimal(repr(abs(v)))
    t = d.as_tuple()
    dg = ''.join(str(c) for c in t.digits).rstrip('0') or '0'
    k = len(dg)
    n = t.exponent + len(t.digits)
    return dg, k, n


def js_str(v):
    """String(v) di JavaScript per un numero."""
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, int):
        v = float(v)
    if v != v:
        return 'NaN'
    if v == INF:
        return 'Infinity'
    if v == -INF:
        return '-Infinity'
    if v == 0:
        return '0'
    s = '-' if v < 0 else ''
    dg, k, n = _digits(v)
    if k <= n <= 21:
        return s + dg + '0' * (n - k)
    if 0 < n <= 21:
        return s + dg[:n] + '.' + dg[n:]
    if -6 < n <= 0:
        return s + '0.' + '0' * (-n) + dg
    e = n - 1
    es = ('+' if e >= 0 else '-') + str(abs(e))
    if k == 1:
        return s + dg + 'e' + es
    return s + dg[0] + '.' + dg[1:] + 'e' + es


def js_fixed(x, f):
    """Number.prototype.toFixed(f): metà verso l'alto in valore assoluto, sul valore binario esatto."""
    if x != x:
        return 'NaN'
    if abs(x) >= 1e21:
        return js_str(x)
    q = abs(Decimal(x)).quantize(Decimal(1).scaleb(-f), rounding=ROUND_HALF_UP)
    s = format(q, 'f')
    if f > 0 and '.' not in s:
        s += '.' + '0' * f
    return ('-' if x < 0 else '') + s


def _prec_parts(x, p):
    d = abs(Decimal(x))
    e = d.adjusted()
    n = int(d.scaleb(-(e - p + 1)).to_integral_value(rounding=ROUND_HALF_UP))
    if n >= 10 ** p:
        e += 1
        n = int(d.scaleb(-(e - p + 1)).to_integral_value(rounding=ROUND_HALF_UP))
    return n, e


def js_prec(x, p):
    """Number.prototype.toPrecision(p) come testo."""
    if not math.isfinite(x):
        return js_str(x)
    if x == 0:
        return '0' + ('.' + '0' * (p - 1) if p > 1 else '')
    s = '-' if x < 0 else ''
    n, e = _prec_parts(x, p)
    m = str(n)
    if e < -6 or e >= p:
        a = m[0] + ('.' + m[1:] if p > 1 else '')
        return s + a + 'e' + ('+' if e >= 0 else '-') + str(abs(e))
    if e == p - 1:
        return s + m
    if e >= 0:
        return s + m[:e + 1] + '.' + m[e + 1:]
    return s + '0.' + '0' * (-(e + 1)) + m


def js_expo(x, f):
    """Number.prototype.toExponential(f)."""
    if not math.isfinite(x):
        return js_str(x)
    s = '-' if x < 0 else ''
    if x == 0:
        n, e = 0, 0
        m = '0' * (f + 1)
    else:
        n, e = _prec_parts(x, f + 1)
        m = str(n)
    a = m[0] + ('.' + m[1:] if f > 0 else '')
    return s + a + 'e' + ('+' if e >= 0 else '-') + str(abs(e))


def num_prec(v, p):
    # String(+v.toPrecision(p))
    return js_str(float(js_prec(v, p)))


def num_fixed(v, f):
    # String(+v.toFixed(f))
    return js_str(float(js_fixed(v, f)))


# spazi di String.prototype.trim e di \s nelle espressioni regolari di JavaScript
JS_WS = '\t\n\x0b\x0c\r \xa0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'
RE_WS1 = re.compile('[' + re.escape(JS_WS) + ']')
RE_WSN = re.compile('[' + re.escape(JS_WS) + ']+')


def js_trim(s):
    return s.strip(JS_WS)


# ============================== lettura dei file di testo ==============================
_CP1252 = [chr(i) for i in range(256)]
for _i in range(0x80, 0xA0):
    try:
        _CP1252[_i] = bytes([_i]).decode('cp1252')
    except UnicodeDecodeError:
        pass   # come il decodificatore windows-1252 dei browser (WHATWG): i byte non assegnati restano U+0080–U+009F


def decode_buffer(b):
    """index.html decodeBuffer: UTF-16 con BOM o con molti zeri, altrimenti UTF-8, e windows-1252 se l'UTF-8 non regge."""
    if len(b) >= 2 and b[0] == 0xFF and b[1] == 0xFE:
        return b[2:].decode('utf-16-le', 'replace')
    if len(b) >= 2 and b[0] == 0xFE and b[1] == 0xFF:
        return b[2:].decode('utf-16-be', 'replace')
    n = min(len(b), 400)
    zeros = sum(1 for i in range(1, n, 2) if b[i] == 0)
    if n > 20 and zeros > n / 4:
        return b.decode('utf-16-le', 'replace')
    t = b.decode('utf-8', 'replace')
    if t[:1] == '\ufeff':
        t = t[1:]   # il decodificatore UTF-8 del browser toglie il BOM
    if t[:1] == '\ufeff':
        t = t[1:]
    if '\ufffd' in t:
        t = ''.join(_CP1252[c] for c in b)
    return t


def csv_split(l):
    # index.html csvSplit
    out, cur, q = [], '', False
    for ch in l:
        if ch == '"':
            q = not q
            cur += ch
        elif ch == ',' and not q:
            out.append(cur)
            cur = ''
        else:
            cur += ch
    out.append(cur)
    return out


def split_line(l):
    # index.html splitLine
    if '\t' in l:
        t = l.split('\t')
    elif ';' in l:
        t = l.split(';')
    elif RE_WS1.search(l):
        t = RE_WSN.split(l)
    elif ',' in l:
        t = csv_split(l) if '"' in l else l.split(',')
    else:
        return None
    return [js_trim(s) for s in t if js_trim(s) != '']


RE_COMMA_DEC = re.compile(r'[-+]?[0-9]+,[0-9]+([eE][-+]?[0-9]+)?')
RE_NUMBER = re.compile(r'[-+]?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][-+]?[0-9]+)?')


def to_num(s):
    # index.html toNum
    s = re.sub(r'^"|"\Z', '', js_trim(s))
    s = re.sub(r',\Z', '', s)
    if s == '':
        return NAN
    if RE_COMMA_DEC.fullmatch(s):
        s = s.replace(',', '.', 1)
    if not RE_NUMBER.fullmatch(s):
        return NAN
    return float(s)


def parse_line(l, yc):
    # index.html parseLine
    t = split_line(l)
    yc = yc or 1
    if not t or len(t) < 2 or len(t) <= yc:
        return None
    a, b = to_num(t[0]), to_num(t[yc])
    if not (math.isfinite(a) and math.isfinite(b)):
        return None
    return a, b


def sort_pairs(xs, ys):
    # riordino per x stabile, come idx.sort((a,b)=>xs[a]-xs[b]) di parseText0 e xUnitFix
    idx = sorted(range(len(xs)), key=xs.__getitem__)
    return [xs[k] for k in idx], [ys[k] for k in idx]


def apply_xform(xs, ys, ops):
    # index.html xUnitFix (colonne scambiate, conversioni di unità) e postDetect (campo EPR): nello stesso ordine
    for o in ops:
        k = o['op']
        if k == 'swap':
            xs, ys = sort_pairs(list(ys), list(xs))
        elif k == 'div60':
            xs = [v / 60 for v in xs]
        elif k == 'inv':
            c = o['c']
            xs, ys = sort_pairs([c / v for v in xs], ys)
        elif k == 'raman':
            l0 = o['l0']
            xs, ys = sort_pairs([1e7 / l0 - 1e7 / v for v in xs], ys)
        elif k == 'scale':
            c = o['k']
            xs = [v * c for v in xs]
        else:
            raise NonTrascritto('trasformazione dell\'asse sconosciuta: ' + k)
    return xs, ys


def read_text_lines(raw, lettura):
    """Rilegge dal file originale esattamente le righe che l'app aveva letto (parseText0 con keepLines)."""
    lines = re.split(r'\r\n|\n|\r', decode_buffer(raw))
    yc = lettura['ycol']
    xs, ys = [], []
    for a, cnt in lettura['righe']:
        for i in range(a, a + cnt):
            if i >= len(lines):
                raise LetturaDiversa('il file ha meno righe di quello del progetto')
            p = parse_line(js_trim(lines[i]), yc)
            if p is None:
                raise LetturaDiversa('riga %d non leggibile come nel progetto' % (i + 1))
            xs.append(p[0])
            ys.append(p[1])
    xs, ys = sort_pairs(xs, ys)
    return apply_xform(xs, ys, lettura.get('trasf') or [])


def read_simple_text(raw, ycol=1):
    """Lettura semplificata per file nuovi (opzione --file): righe con almeno due numeri, il blocco più lungo, riordinato per x.
    Non è il lettore completo dell'app (parseText0): l'identità con l'app vale solo per i file del progetto."""
    lines = re.split(r'\r\n|\n|\r', decode_buffer(raw))
    blocks, cur = [], ([], [])
    for l in lines:
        l = js_trim(l)
        if not l:
            continue
        p = parse_line(l, ycol)
        if p is None:
            if len(cur[0]) >= 3:
                blocks.append(cur)
            cur = ([], [])
            continue
        cur[0].append(p[0])
        cur[1].append(p[1])
    if len(cur[0]) >= 3:
        blocks.append(cur)
    if not blocks:
        raise LetturaDiversa('nessun blocco di numeri a due colonne')
    best = max(blocks, key=lambda b: len(b[0]))
    return sort_pairs(best[0], best[1])


def read_csv_xy(path):
    """CSV scritto dall'app accanto allo script (dati/…csv): x,y a piena precisione, separatore «,» e punto decimale."""
    with open(path, 'r', encoding='utf-8-sig', newline='') as fh:
        rows = fh.read().splitlines()
    xs, ys = [], []
    for r in rows[1:]:
        if not r.strip():
            continue
        a, b = r.split(',')[:2]
        xs.append(float(a))
        ys.append(float(b))
    return xs, ys


def fingerprint(xs, ys):
    # SHA-256 dei double little-endian, come l'impronta calcolata dall'app su Float64Array
    h = hashlib.sha256()
    h.update(struct.pack('<%dd' % len(xs), *xs))
    h.update(struct.pack('<%dd' % len(ys), *ys))
    return h.hexdigest()


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        for blk in iter(lambda: fh.read(1 << 20), b''):
            h.update(blk)
    return h.hexdigest()


# ============================== trattamento del segnale ==============================
def nums_ok(a):
    # index.html numsOk
    mx = 0.0
    for v in a:
        if not math.isfinite(v) or abs(v) > 1e150:
            return False
        if abs(v) > mx:
            mx = abs(v)
    return len(a) == 0 or mx == 0 or mx > 1e-150


def transform_y(ys, kind, conv):
    # index.html transformY
    n = len(ys)
    if conv == 'A' and kind == 'T':
        return [2 - math.log10(max(v, 1e-4)) for v in ys], 'A'
    if conv == 'T' and kind == 'A':
        return [100 * math.pow(10, -v) for v in ys], 'T'
    if conv == 'norm':
        mn, mx = INF, -INF
        for v in ys:
            if v < mn:
                mn = v
            if v > mx:
                mx = v
        r = js_or1(mx - mn)
        return [(ys[i] - mn) / r for i in range(n)], 'N'
    return ys, kind


def sg_smooth(ys, win):
    # index.html sgSmooth: Savitzky–Golay di 2° grado, i bordi restano i dati
    n = len(ys)
    if not win or win < 5 or n < win + 2:
        return ys
    m = (win - 1) >> 1
    den = (2 * m + 3) * (2 * m + 1) * (2 * m - 1)
    c = [float(3 * (3 * m * m + 3 * m - 1 - 5 * i * i)) / den for i in range(-m, m + 1)]
    out = list(ys)
    for i in range(m, n - m):
        s = 0.0
        for j in range(-m, m + 1):
            s += c[j + m] * ys[i + j]
        out[i] = s
    return out


def sg_noise_gain(m):
    # index.html sgNoiseGain
    den = (2 * m + 3) * (2 * m + 1) * (2 * m - 1)
    c2 = 0.0
    for i in range(-m, m + 1):
        c = float(3 * (3 * m * m + 3 * m - 1 - 5 * i * i)) / den
        c2 += c * c
    return math.sqrt(c2)


def baseline_of(xs, ys, method, upper):
    # index.html baselineOf: retta tra gli estremi o inviluppo convesso inferiore («rubber band»)
    n = len(ys)
    y = [-v for v in ys] if upper else ys
    b = [0.0] * n
    if method == 'linear':
        k = max(1, js_round(n * 0.01))
        a = c = 0.0
        for i in range(k):
            a += y[i]
            c += y[n - 1 - i]
        a /= k
        c /= k
        x0, x1 = xs[0], xs[n - 1]
        for i in range(n):
            b[i] = a + (c - a) * (xs[i] - x0) / js_or1(x1 - x0)
    else:
        h = []
        for i in range(n):
            while len(h) >= 2:
                p, q = h[-2], h[-1]
                cross = (xs[q] - xs[p]) * (y[i] - y[p]) - (y[q] - y[p]) * (xs[i] - xs[p])
                if cross <= 0:
                    h.pop()
                else:
                    break
            h.append(i)
        for s in range(len(h) - 1):
            p, q = h[s], h[s + 1]
            for i in range(p, q + 1):
                b[i] = y[p] + (y[q] - y[p]) * (xs[i] - xs[p]) / js_or1(xs[q] - xs[p])
    if upper:
        b = [-v for v in b]
    return b


def smooth_ma(ys, w):
    # index.html smoothMA
    n = len(ys)
    if w < 1:
        return ys
    ps = [0.0] * (n + 1)
    for i in range(n):
        ps[i + 1] = ps[i] + ys[i]
    out = [0.0] * n
    for i in range(n):
        a, b = max(0, i - w), min(n - 1, i + w)
        out[i] = (ps[b + 1] - ps[a]) / (b - a + 1)
    return out


def noise_sigma(ys):
    # index.html noiseSigma: MAD delle differenze seconde
    n = len(ys)
    if n < 4:
        return 0.0
    a = sorted(abs(ys[i + 1] - 2 * ys[i] + ys[i - 1]) for i in range(1, n - 1))
    return a[len(a) >> 1] / 0.6745 / math.sqrt(6)


def median(a):
    # index.html median
    s = sorted(a)
    n = len(s)
    if not n:
        return 0.0
    return s[n >> 1] if n % 2 else 0.5 * (s[n // 2 - 1] + s[n // 2])


def peak_candidates(sm):
    # index.html peakCandidates
    n = len(sm)
    out = []
    for i in range(1, n - 1):
        if not (sm[i] > sm[i - 1] and sm[i] >= sm[i + 1]):
            continue
        lmin = sm[i]
        j = i - 1
        while j >= 0 and sm[j] <= sm[i]:
            if sm[j] < lmin:
                lmin = sm[j]
            j -= 1
        rmin = sm[i]
        j = i + 1
        while j < n and sm[j] <= sm[i]:
            if sm[j] < rmin:
                rmin = sm[j]
            j += 1
        out.append((i, sm[i] - max(lmin, rmin)))
    return out


def half_width_pts(sm, c):
    # index.html halfWidthPts
    i, prom = c
    half = sm[i] - prom / 2
    a = b = i
    while a > 0 and sm[a] > half:
        a -= 1
    while b < len(sm) - 1 and sm[b] > half:
        b += 1
    return b - a


def nearest_idx(xs, x):
    # index.html nearestIdx
    lo, hi = 0, len(xs) - 1
    while hi - lo > 1:
        m = (lo + hi) >> 1
        if xs[m] <= x:
            lo = m
        else:
            hi = m
    return lo if abs(xs[lo] - x) <= abs(xs[hi] - x) else hi


def interp_y(xs, ys, x):
    # index.html interpY
    lo, hi = 0, len(xs) - 1
    if x <= xs[0]:
        return ys[0]
    if x >= xs[hi]:
        return ys[hi]
    while hi - lo > 1:
        m = (lo + hi) >> 1
        if xs[m] <= x:
            lo = m
        else:
            hi = m
    t = (x - xs[lo]) / js_or1(xs[hi] - xs[lo])
    return ys[lo] + t * (ys[hi] - ys[lo])


def _strong_width(sm1, sig_raw, n):
    strong = [c for c in peak_candidates(sm1) if c[1] > 10 * sig_raw * sg_noise_gain(2)]
    strong = sorted(strong, key=lambda c: c[1], reverse=True)[:8]
    return min(half_width_pts(sm1, c) for c in strong) if strong else js_round(n / 200)


def find_peaks(xs, ys, dir_, sens, max_n):
    # index.html findPeaks
    if not nums_ok(xs) or not nums_ok(ys):
        return []
    n = len(ys)
    if n < 9 or max_n <= 0:
        return []
    s0 = [v * dir_ for v in ys]
    sig_raw = noise_sigma(s0)
    sm1 = sg_smooth(s0, 5)
    wch = _strong_width(sm1, sig_raw, n)
    m = max(2, min(js_round(0.6 * wch / 2), js_round(n / 40)))
    sm = sg_smooth(s0, 2 * m + 1)
    sig = sig_raw * sg_noise_gain(m)
    edge = max(m, 3)
    cand = [c for c in peak_candidates(sm) if c[0] >= edge and c[0] < n - edge]
    if not cand:
        return []
    max_prom = max(c[1] for c in cand)
    thr = js_max(8 * sig, (sens / 100) * max_prom)
    sel = sorted([c for c in cand if c[1] >= thr], key=lambda c: c[1], reverse=True)[:max_n]
    out = []
    for i, prom in sel:
        x = xs[i]
        a, b, d = sm[i - 1], sm[i], sm[i + 1]
        q = a - 2 * b + d
        if q < 0:
            off = 0.5 * (a - d) / q
            if abs(off) < 1:
                x = xs[i] + off * (xs[i + 1] - xs[i - 1]) / 2
        out.append({'x': x, 'y': interp_y(xs, ys, x), 'prom': prom})
    return sorted(out, key=lambda p: p['x'])


def peak_areas(xs, ys, pks):
    # index.html peakAreas: limiti automatici, base valle-valle sotto il segnale, trapezi sui dati
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
        out[o['k']] = {'ia': L, 'ib': R, 'xa': xs[L], 'xb': xs[R], 'area': max(0.0, A)}
    return out


def deriv_ls(xs, ys, m):
    # index.html derivLS: pendenza della retta dei minimi quadrati su ±m punti
    n = len(ys)
    out = [0.0] * n
    for i in range(n):
        a, b = max(0, i - m), min(n - 1, i + m)
        sx = sy = 0.0
        c = 0
        for k in range(a, b + 1):
            sx += xs[k]
            sy += ys[k]
            c += 1
        mx, my = sx / c, sy / c
        sxx = sxy = 0.0
        for k in range(a, b + 1):
            dx = xs[k] - mx
            sxx += dx * dx
            sxy += dx * (ys[k] - my)
        out[i] = sxy / sxx if sxx > 0 else 0.0
    return out


def whittaker(y, w, lam):
    # index.html whittaker: sistema pentadiagonale con LDLᵀ
    n = len(y)
    if n < 4:
        return list(y)
    a0 = [w[i] + lam * (1 if (i == 0 or i == n - 1) else (5 if (i == 1 or i == n - 2) else 6)) for i in range(n)]
    a1 = [lam * (-2 if (i == 0 or i == n - 2) else -4) for i in range(n - 1)] + [0.0]
    a2 = [lam for _ in range(n - 2)] + [0.0, 0.0]
    D, l1, l2 = [0.0] * n, [0.0] * n, [0.0] * n
    for i in range(n):
        L2 = a2[i - 2] / D[i - 2] if i >= 2 else 0
        L1 = (a1[i - 1] - (L2 * D[i - 2] * l1[i - 1] if i >= 2 else 0)) / D[i - 1] if i >= 1 else 0
        D[i] = a0[i] - (L2 * L2 * D[i - 2] if i >= 2 else 0) - (L1 * L1 * D[i - 1] if i >= 1 else 0)
        l1[i] = L1
        l2[i] = L2
    z = [0.0] * n
    for i in range(n):
        z[i] = w[i] * y[i] - (l1[i] * z[i - 1] if i >= 1 else 0) - (l2[i] * z[i - 2] if i >= 2 else 0)
    for i in range(n):
        z[i] /= D[i]
    for i in range(n - 1, -1, -1):
        z[i] -= (l1[i + 1] * z[i + 1] if i + 1 < n else 0) + (l2[i + 2] * z[i + 2] if i + 2 < n else 0)
    return z


def bin_down(xs, ys, max_n):
    # index.html binDown
    n = len(ys)
    if n <= max_n:
        return xs, ys, 1
    k = -(-n // max_n)
    m = n // k
    bx, by = [0.0] * m, [0.0] * m
    for j in range(m):
        sx = sy = 0.0
        for q in range(k):
            sx += xs[j * k + q]
            sy += ys[j * k + q]
        bx[j] = sx / k
        by[j] = sy / k
    return bx, by, k


def baseline_arpls(xs, ys, stiff=None):
    # index.html baselineArPLS (Baek et al. 2015)
    bx, y, kk = bin_down(xs, ys, 1500)
    n = len(y)
    if n < 8:
        return list(ys)
    lam = math.pow(n / (2 * math.pi * (stiff or 8)), 4)
    w = [1.0] * n
    z = y
    for it in range(60):
        z = whittaker(y, w, lam)
        sm = 0.0
        c = 0
        for i in range(n):
            d = y[i] - z[i]
            if d < 0:
                sm += d
                c += 1
        if c < 2:
            break
        m = sm / c
        sv = 0.0
        for i in range(n):
            d = y[i] - z[i]
            if d < 0:
                sv += (d - m) * (d - m)
        s = math.sqrt(sv / (c - 1)) or 1e-30
        wn = [0.0] * n
        num = den = 0.0
        for i in range(n):
            d = y[i] - z[i]
            e = min(60, 2 * (d - (2 * s - m)) / s)
            wn[i] = 1 / (1 + math.exp(e))
            num += (w[i] - wn[i]) * (w[i] - wn[i])
            den += w[i] * w[i]
        w = wn
        if math.sqrt(num / den) < 1e-3:
            break
    if kk == 1:
        return z
    return [interp_y(bx, z, xs[i]) for i in range(len(ys))]


def peak_width_pts(ys):
    # index.html peakWidthPts
    sig = noise_sigma(ys)
    sm = sg_smooth(list(ys), 5)
    st = [c for c in peak_candidates(sm) if c[1] > 10 * sig * sg_noise_gain(2)]
    st = sorted(st, key=lambda c: c[1], reverse=True)[:8]
    return median([half_width_pts(sm, c) for c in st]) if st else max(3, js_round(len(ys) / 100))


def baseline_snip(ys, m=0, counts=False):
    # index.html baselineSNIP (Ryan et al. 1988; Morháč et al. 1997)
    n = len(ys)
    if n < 8:
        return list(ys)
    wp = peak_width_pts(ys)
    if not m:
        ys = smooth_ma(ys, max(1, js_round(0.4 * wp)))
    m = max(2, min(n // 4, js_round(m or 1.2 * wp)))
    mn = INF
    for v in ys:
        if v < mn:
            mn = v
    sh = 0 if counts else -mn
    if counts:
        v = [math.log(math.log(math.sqrt(max(q, 0) + 1) + 1) + 1) for q in ys]
    else:
        v = [q + sh for q in ys]
    t = [0.0] * n
    for p in range(m, 0, -1):
        for i in range(n):
            if i < p or i >= n - p:
                t[i] = v[i]
                continue
            a = (v[i - p] + v[i + p]) / 2
            t[i] = a if a < v[i] else v[i]
        v = list(t)
    if counts:
        return [math.pow(math.exp(math.exp(q) - 1) - 1, 2) - 1 for q in v]
    return [q - sh for q in v]


def despike(ys, thr=7, max_w=3):
    # index.html despike (Whitaker & Hayes 2018)
    n = len(ys)
    out = list(ys)
    if n < 10:
        return out, 0
    d = [ys[i] - ys[i - 1] for i in range(1, n)]
    med = median(d)
    mad = median([abs(v - med) for v in d]) or 1e-30

    def z(i):
        return 0.6745 * (d[i - 1] - med) / mad if 1 <= i < n else 0

    flag = [0] * n
    for i in range(1, n - 1):
        if abs(z(i)) > thr or abs(z(i + 1)) > thr:
            flag[i] = 1
    at = 0
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
            dev = 0.0
            for k in range(i, j + 1):
                ln = ys[a] + (ys[b] - ys[a]) * (k - a) / (b - a)
                dev = max(dev, abs(ys[k] - ln))
            top = i
            for k in range(i, j + 1):
                if abs(ys[k] - ys[a] - (ys[b] - ys[a]) * (k - a) / (b - a)) > abs(ys[top] - ys[a] - (ys[b] - ys[a]) * (top - a) / (b - a)):
                    top = k
            base = min(ys[max(0, i - 6)], ys[min(n - 1, j + 6)])
            half = (ys[top] - base) / 2
            hw = 1
            sgn = 1 if half > 0 else (-1 if half < 0 else 1)   # Math.sign(half)||1
            k = top - 1
            while k >= max(0, top - 6) and sgn * (ys[k] - base) > sgn * half:
                hw += 1
                k -= 1
            k = top + 1
            while k <= min(n - 1, top + 6) and sgn * (ys[k] - base) > sgn * half:
                hw += 1
                k += 1
            if hw <= max_w and dev > thr * mad / 0.6745 / math.sqrt(2):
                for k in range(i, j + 1):
                    out[k] = ys[a] + (ys[b] - ys[a]) * (k - a) / (b - a)
                at += 1
        i = j + 1
    return out, at


def processed(sp, xs, ys, ref=None):
    """index.html processed(f): la catena di elaborazioni dello spettro, con i parametri della ricetta."""
    i = sp['tecnica']
    pr = sp['elab']
    conv = pr['conv']
    y0 = ys
    kind0 = sp['kind']
    spikes = 0
    if pr.get('spike') and i in ('raman', 'fluo', 'gen'):
        dy, spikes = despike([-v for v in ys] if kind0 == 'T' else ys)
        y0 = [-v for v in dy] if kind0 == 'T' else dy
    y, kind = transform_y(y0, kind0, conv if conv in ('A', 'T') else 'orig')
    diff = None
    if ref is not None:
        # spettro differenza: campione − k × riferimento (in assorbanza se uno dei due è in %T)
        rxs, rys, rkind = ref
        to_a = kind == 'T' or rkind == 'T'
        if to_a and kind == 'T':
            y, kind = transform_y(y, 'T', 'A')
        ry = rys
        if to_a and rkind == 'T':
            ry, _ = transform_y(ry, 'T', 'A')
        lo, hi = max(xs[0], rxs[0]), min(xs[-1], rxs[-1])
        a = 0
        while a < len(xs) and xs[a] < lo:
            a += 1
        b = len(xs) - 1
        while b >= 0 and xs[b] > hi:
            b -= 1
        if b - a >= 8:
            xs = xs[a:b + 1]
            k = float(pr['sub_k'] or 0)
            y = [y[a + q] - k * interp_y(rxs, ry, xs[q]) for q in range(b - a + 1)]
            diff = k
    if pr.get('xr'):
        a, b = min(pr['xr']), max(pr['xr'])
        lo = 0
        while lo < len(xs) and xs[lo] < a:
            lo += 1
        hi = len(xs) - 1
        while hi >= 0 and xs[hi] > b:
            hi -= 1
        if hi - lo >= 4:
            xs = xs[lo:hi + 1]
            y = y[lo:hi + 1]
    sw = pr['smooth']
    if sw:
        y = sg_smooth(y, sw)
    bm = pr['base']
    if bm != 'none' and i != 'tga':
        upper = kind == 'T'
        if bm == 'arpls':
            bl = [-v for v in baseline_arpls(xs, [-v for v in y])] if upper else baseline_arpls(xs, y)
        elif bm == 'snip':
            bl = [-v for v in baseline_snip([-v for v in y])] if upper else baseline_snip(y, 0, i == 'xrf' and kind == 'I')
        else:
            bl = baseline_of(xs, y, bm, upper)
        y = [y[k] / js_or1(bl[k]) * 100 if upper else y[k] - bl[k] for k in range(len(y))]
    dir_ = -1 if kind == 'T' else 1
    mass = dtg = y2 = None
    if i == 'tga' and kind == 'W':
        # DTG = −dm/dT, lisciata
        mass = y
        dtg = [-v for v in deriv_ls(xs, y, max(3, js_round(len(y) / 150)))]
        if conv == 'dtg':
            y, kind = dtg, 'DTG'
        elif conv == 'both':
            y2 = dtg
    if i == 'dsc' and conv == 'flip':
        y = [-v for v in y]
    dv = int(pr.get('deriv') or 0)
    if dv and i != 'tga' and i != 'epr':
        m = max(3, sw >> 1, js_round(len(y) / 600))
        y = deriv_ls(xs, y, m)
        if dv == 2:
            y = deriv_ls(xs, y, m)
        dir_ = -dir_ if dv == 2 else 1
        kind = 'D2' if dv == 2 else 'D1'
    if conv == 'norm':
        y, kind = transform_y(y, kind, 'norm')
        kind = 'N'
    return {'xs': xs, 'ys': y, 'kind': kind, 'dir': dir_, 'diff': diff, 'mass': mass, 'dtg': dtg, 'y2': y2,
            'spikes': spikes, 'deriv': dv if (dv and i != 'tga' and i != 'epr') else 0}


# ============================== picchi ==============================
def epr_lines(xs, ys, sens, max_n):
    # index.html eprLines: coppie lobo positivo / lobo negativo, centro dove la derivata passa per lo zero
    pos = find_peaks(xs, ys, 1, sens, max_n * 3)
    neg = find_peaks(xs, ys, -1, sens, max_n * 3)

    def pair(A, B, s):
        used = set()
        res = []
        for p in A:
            q = None
            for ci, c in enumerate(B):
                if ci in used or c['x'] <= p['x']:
                    continue
                if q is None or c['x'] < B[q]['x']:
                    q = ci
            if q is None or any(r is not p and r['x'] > p['x'] and r['x'] < B[q]['x'] for r in A):
                continue
            qq = B[q]
            ra = abs(p['y']) / (abs(qq['y']) or 1e-30)
            if ra < 0.2 or ra > 5:
                continue
            used.add(q)
            i, j = nearest_idx(xs, p['x']), nearest_idx(xs, qq['x'])
            x0 = (p['x'] + qq['x']) / 2
            for k in range(i, j):
                if ys[k] * s >= 0 and ys[k + 1] * s < 0:
                    t = ys[k] / ((ys[k] - ys[k + 1]) or 1e-30)
                    x0 = xs[k] + t * (xs[k + 1] - xs[k])
                    break
            res.append({'x': x0, 'y': interp_y(xs, ys, x0), 'prom': (p['prom'] + qq['prom']) / 2, 'xa': p['x'], 'xb': qq['x']})
        return res

    lines = pair(pos, neg, 1)
    if not lines:
        lines = pair(neg, pos, -1)
    lines = sorted(lines, key=lambda q: q['prom'], reverse=True)[:max_n]
    return sorted(lines, key=lambda q: q['x'])


def xrf_fwhm(E):
    # index.html xrfFWHM (keV)
    f0 = math.sqrt(max(0, 0.140 * 0.140 - 2.355 * 2.355 * 3.85e-3 * 0.114 * 5.895))
    return math.sqrt(f0 * f0 + 2.355 * 2.355 * 3.85e-3 * 0.114 * E)


def is_counts(ys):
    # index.html isCounts
    n = len(ys)
    if n < 20:
        return False
    st = max(1, n >> 10)
    for i in range(0, n, st):
        v = ys[i]
        if not (v >= 0) or v != js_round(v):
            return False
    return True


def xrf_currie(xs, ys, pxs):
    # index.html xrfCurrie e currie (Currie 1968)
    n = len(ys)
    dx = abs(xs[n - 1] - xs[0]) / (n - 1) or 1
    k = max(1, js_round(xrf_fwhm(10) / dx))
    bg = baseline_snip(smooth_ma(ys, k), js_round(2.2 * xrf_fwhm(10) / dx), True)
    out = []
    for x in pxs:
        w = xrf_fwhm(max(1, x))
        net = B = 0.0
        for i in range(n):
            if abs(xs[i] - x) <= w:
                net += ys[i] - bg[i]
                B += bg[i]
        Bp = max(0, B)
        LD = 2.71 + 4.65 * math.sqrt(Bp)
        out.append(net > LD)
    return out


def auto_peaks(sp, P, xs_file, ys_file, sens, max_peaks):
    # index.html autoPeaks
    n = max_peaks
    i = sp['tecnica']
    if i == 'xrf' and P['kind'] == 'I':
        yA = [2 * math.sqrt(max(v, 0) + 0.375) for v in P['ys']]
        N = js_round(n * 1.7)
        cnt = not sp.get('uncal') and is_counts(ys_file)
        pk = find_peaks(P['xs'], yA, 1, sens, 4 * N if cnt else N)
        if cnt and pk:
            det = xrf_currie(xs_file, ys_file, [q['x'] for q in pk])
            pk = [q for q, d in zip(pk, det) if d]
            if len(pk) > N:
                pk = sorted(sorted(pk, key=lambda q: q['prom'], reverse=True)[:N], key=lambda q: q['x'])
        return [{'x': q['x'], 'y': interp_y(P['xs'], P['ys'], q['x']), 'prom': q['prom']} for q in pk]
    if i == 'libs' and not P['deriv']:
        return find_peaks(P['xs'], P['ys'], 1, sens, js_round(n * 2))
    if i == 'tga' and P['dtg'] is not None:
        return [{'x': q['x'], 'y': interp_y(P['xs'], P['ys'], q['x']), 'prom': q['prom']} for q in find_peaks(P['xs'], P['dtg'], 1, sens, n)]
    if i == 'epr' and P['kind'] != 'N':
        return epr_lines(P['xs'], P['ys'], sens, n)
    if i == 'dsc' and not P['deriv']:
        h = max(1, math.ceil(n / 2))
        up = [dict(q, side=1) for q in find_peaks(P['xs'], P['ys'], 1, sens, h)]
        dn = [dict(q, side=-1) for q in find_peaks(P['xs'], P['ys'], -1, sens, h)]
        al = up + dn
        mx = max(0, max((q['prom'] for q in al), default=-INF))
        thr = mx * max(sens / 100, 0.08)
        return sorted([q for q in al if q['prom'] >= thr], key=lambda q: q['x'])
    return find_peaks(P['xs'], P['ys'], P['dir'], sens, n)


def local_base(P, x):
    # index.html localBase
    xs, ys = P['xs'], P['ys']
    i = nearest_idx(xs, x)
    w = max(5, js_round(len(xs) / 40))
    a, b = max(0, i - w), min(len(xs) - 1, i + w)
    return (ys[a] + ys[b]) / 2


def view_peaks(sp, P, xs_file, ys_file, ric):
    """index.html viewOf0, parte dei picchi: automatici meno i tolti, più quelli aggiunti, nomi e aree."""
    pk = sp['picchi']
    i = sp['tecnica']
    auto = auto_peaks(sp, P, xs_file, ys_file, ric['sens'], ric['maxPeaks'])
    xs = P['xs']
    rng = js_or1(xs[-1] - xs[0])
    tol = rng * 0.004
    peaks = []
    for p in auto:
        if not any(abs(r - p['x']) <= tol for r in pk['tolti']):
            q = dict(p)
            q['manual'] = False
            peaks.append(q)
    for x in pk['aggiunti']:
        if xs[0] <= x <= xs[-1]:
            y = interp_y(xs, P['ys'], x)
            side = None
            if i == 'dsc' and not P['deriv']:
                side = 1 if y >= local_base(P, x) else -1
            peaks.append({'x': x, 'y': y, 'manual': True, 'side': side})
    peaks = sorted(peaks, key=lambda p: p['x'])
    for p in peaks:
        lab = pk['nomi'].get(js_fixed(p['x'], 4))
        p['name'] = lab[0] if lab else ''
        p['origin'] = lab[1] if lab else ''
        p['custom'] = bool(p['name'])
    need = (ric['showArea'] or i in ('dsc', 'tga')) and peaks and not P['deriv']
    if need:
        if i == 'tga' and P['dtg'] is not None:
            areas = peak_areas(xs, P['dtg'], [p['x'] for p in peaks])
        elif i == 'dsc':
            areas = []
            for p in peaks:
                s = p.get('side') or 1
                a = peak_areas(xs, [v * s for v in P['ys']], [p['x']])
                areas.append(a[0] if a else None)
        else:
            if P['kind'] == 'T':
                yA = [2 - math.log10(max(v, 1e-4)) for v in P['ys']]
            elif P['dir'] < 0:
                yA = [-v for v in P['ys']]
            else:
                yA = P['ys']
            areas = peak_areas(xs, yA, [p['x'] for p in peaks])
        tot = 0.0
        for a in areas:
            tot = tot + (a['area'] if a else 0)
        tot = js_or1(tot)
        net_k = 1 / max(1e-12, abs((xs[-1] - xs[0]) / (len(xs) - 1))) if (i == 'xrf' and P['kind'] == 'I') else 1
        for k, p in enumerate(peaks):
            a = areas[k] if k < len(areas) else None
            if a:
                p['area'] = a['area'] * net_k
                p['areaPct'] = 100 * a['area'] / tot
                p['xa'] = a['xa']
                p['xb'] = a['xb']
        if i == 'tga' and P['mass'] is not None:
            for p in peaks:
                if p.get('xa') is not None:
                    p['area'] = max(0, interp_y(xs, P['mass'], p['xa']) - interp_y(xs, P['mass'], p['xb']))
        if i == 'dsc':
            # index.html dscEnthalpy: area (Y × °C) / velocità (°C/s)
            dsc = sp.get('dsc') or {}
            if dsc.get('k') is not None and P['kind'] != 'N':
                for p in peaks:
                    if p.get('area') is not None:
                        p['area'] = p['area'] * dsc['k']
    return peaks


# ============================== tarature (misure di banda) ==============================
def band_measure(xs, ys, a, b):
    # index.html bandMeasure: altezza, area, baricentro e FWHM sopra la retta tra i bordi
    if not nums_ok(xs) or not nums_ok(ys):
        return None
    lo, hi = min(a, b), max(a, b)
    i0 = 0
    while i0 < len(xs) and xs[i0] < lo:
        i0 += 1
    i1 = len(xs) - 1
    while i1 >= 0 and xs[i1] > hi:
        i1 -= 1
    if i1 - i0 < 3:
        return None
    e = max(1, min(3, (i1 - i0) // 8))
    ya = yb = xa = xb = 0.0
    for k in range(e):
        ya += ys[i0 + k]
        xa += xs[i0 + k]
        yb += ys[i1 - k]
        xb += xs[i1 - k]
    ya /= e
    yb /= e
    xa /= e
    xb /= e

    def base(x):
        return ya + (yb - ya) * (x - xa) / js_or1(xb - xa)

    area = mom = 0.0
    im, hm = i0, -INF
    for k in range(i0, i1 + 1):
        v = ys[k] - base(xs[k])
        if v > hm:
            hm = v
            im = k
        if k < i1:
            v2 = ys[k + 1] - base(xs[k + 1])
            dxk = xs[k + 1] - xs[k]
            area += 0.5 * (v + v2) * dxk
            mom += 0.5 * (v * xs[k] + v2 * xs[k + 1]) * dxk
    half = hm / 2
    l = r = im
    while l > i0 and ys[l] - base(xs[l]) > half:
        l -= 1
    while r < i1 and ys[r] - base(xs[r]) > half:
        r += 1

    def cross(k1, k2):
        v1, v2 = ys[k1] - base(xs[k1]), ys[k2] - base(xs[k2])
        return xs[k1] + (half - v1) / ((v2 - v1) or 1e-30) * (xs[k2] - xs[k1])

    fwhm = abs(cross(r - 1, r) - cross(l, l + 1)) if (l > i0 and r < i1) else None
    return {'height': hm, 'area': area, 'centroid': mom / area if area != 0 else None, 'fwhm': fwhm}


def up_data(P):
    # index.html upData: picchi in su (%T → assorbanza)
    if P['kind'] == 'T':
        return [2 - math.log10(max(v, 1e-4)) for v in P['ys']]
    if P['dir'] < 0:
        return [-v for v in P['ys']]
    return P['ys']


def mv_value(P, a, b, meas):
    # index.html mvValue
    U = up_data(P)
    xs = P['xs']
    if meas == 'value' or a == b:
        n = len(xs)
        lo, hi = min(xs[0], xs[n - 1]), max(xs[0], xs[n - 1])
        return interp_y(xs, U, a) if (n and lo <= a <= hi) else None
    m = band_measure(xs, U, a, b)
    if not m:
        return None
    return {'area': m['area'], 'centroid': m['centroid'], 'fwhm': m['fwhm']}.get(meas, m['height'])


def ln_gamma(x):
    # index.html lnGamma
    c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]
    y = x
    t = x + 5.5
    t -= (x + 0.5) * math.log(t)
    s = 1.000000000190015
    for q in c:
        y += 1
        s += q / y
    return -t + math.log(2.5066282746310005 * s / x)


def betacf(a, b, x):
    # index.html betacf
    qab, qap, qam, c = a + b, a + 1, a - 1, 1.0
    d = 1 - qab * x / qap
    if abs(d) < 1e-300:
        d = 1e-300
    d = 1 / d
    h = d
    for m in range(1, 301):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1 + aa * d
        if abs(d) < 1e-300:
            d = 1e-300
        c = 1 + aa / c
        if abs(c) < 1e-300:
            c = 1e-300
        d = 1 / d
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1 + aa * d
        if abs(d) < 1e-300:
            d = 1e-300
        c = 1 + aa / c
        if abs(c) < 1e-300:
            c = 1e-300
        d = 1 / d
        de = d * c
        h *= de
        if abs(de - 1) < 3e-14:
            break
    return h


def betai(a, b, x):
    # index.html betai
    if x <= 0:
        return 0.0
    if x >= 1:
        return 1.0
    bt = math.exp(ln_gamma(a + b) - ln_gamma(a) - ln_gamma(b) + a * math.log(x) + b * math.log(1 - x))
    return bt * betacf(a, b, x) / a if x < (a + 1) / (a + b + 2) else 1 - bt * betacf(b, a, 1 - x) / b


def t_cdf(t, df):
    p = 0.5 * betai(df / 2, 0.5, df / (df + t * t))
    return 1 - p if t > 0 else p


def f_cdf(F, d1, d2):
    return 0.0 if F <= 0 else betai(d1 / 2, d2 / 2, d1 * F / (d1 * F + d2))


def inv_cdf(cdf, p, lo, hi):
    # index.html invCDF: bisezione
    for _ in range(200):
        m = (lo + hi) / 2
        if cdf(m) < p:
            lo = m
        else:
            hi = m
        if hi - lo < 1e-10 * max(1, abs(m)):
            break
    return (lo + hi) / 2


def t_inv(p, df):
    return inv_cdf(lambda t: t_cdf(t, df), p, -1e3, 1e3)


def f_inv(p, d1, d2):
    hi = 10.0
    while f_cdf(hi, d1, d2) < p and hi < 1e8:
        hi *= 10
    return inv_cdf(lambda F: f_cdf(F, d1, d2), p, 0.0, hi)


def chol(A):
    # index.html chol
    p = len(A)
    L = [[0.0] * p for _ in range(p)]
    for j in range(p):
        s = A[j][j]
        for k in range(j):
            s -= L[j][k] * L[j][k]
        if not (s > 0) or not math.isfinite(s):
            return None
        L[j][j] = math.sqrt(s)
        for i in range(j + 1, p):
            t = A[i][j]
            for k in range(j):
                t -= L[i][k] * L[j][k]
            L[i][j] = t / L[j][j]
    return L


def chol_solve(L, b):
    p = len(b)
    y, x = [0.0] * p, [0.0] * p
    for i in range(p):
        t = b[i]
        for k in range(i):
            t -= L[i][k] * y[k]
        y[i] = t / L[i][i]
    for i in range(p - 1, -1, -1):
        t = y[i]
        for k in range(i + 1, p):
            t -= L[k][i] * x[k]
        x[i] = t / L[i][i]
    return x


def lin_reg(x, y):
    # index.html linReg
    n = len(x)
    if n < 2 or not nums_ok(x) or not nums_ok(y):
        return None
    xm = ym = 0.0
    for i in range(n):
        xm += x[i]
        ym += y[i]
    xm /= n
    ym /= n
    sxx = sxy = syy = sx2 = 0.0
    for i in range(n):
        sxx += (x[i] - xm) ** 2
        sxy += (x[i] - xm) * (y[i] - ym)
        syy += (y[i] - ym) ** 2
        sx2 += x[i] * x[i]
    if not (sxx > 0) or not (syy > 0):
        return None
    b = sxy / sxx
    a = ym - b * xm
    ssr = 0.0
    res = []
    for i in range(n):
        r = y[i] - (a + b * x[i])
        res.append(r)
        ssr += r * r
    syx = math.sqrt(ssr / (n - 2)) if n > 2 else 0.0
    return {'n': n, 'a': a, 'b': b, 'xm': xm, 'ym': ym, 'sxx': sxx, 'syx': syx, 'sb': syx / math.sqrt(sxx),
            'sa': syx * math.sqrt(sx2 / (n * sxx)), 'r2': 1 - ssr / syy if syy > 0 else 1, 'res': res, 'ssr': ssr}


def quad_reg(x, y):
    # index.html quadReg (test di Mandel)
    n = len(x)
    if n < 4 or not nums_ok(x) or not nums_ok(y):
        return None
    M = [[0.0] * 3 for _ in range(3)]
    v = [0.0] * 3
    for i in range(n):
        r = [1, x[i], x[i] * x[i]]
        for a in range(3):
            v[a] += r[a] * y[i]
            for b in range(3):
                M[a][b] += r[a] * r[b]
    sc = [1, math.sqrt(M[1][1] / n) or 1, (M[2][2] / n) ** 0.5 or 1]
    Ms = [[q / (sc[a] * sc[b]) for b, q in enumerate(row)] for a, row in enumerate(M)]
    L = chol(Ms)
    if not L:
        return None
    c = [q / sc[a] for a, q in enumerate(chol_solve(L, [q / sc[a] for a, q in enumerate(v)]))]
    ssr = 0.0
    for i in range(n):
        ssr += (y[i] - (c[0] + c[1] * x[i] + c[2] * x[i] * x[i])) ** 2
    return {'c': c, 'ssr': ssr, 's': math.sqrt(ssr / (n - 3))}


def calibrate_w(pts, kind):
    # index.html calibrateW: retta pesata 1/x o 1/x²
    k = 2 if kind == '1/x2' else 1
    x = [p[0] for p in pts]
    y = [p[1] for p in pts]
    n = len(x)
    pos = [v for v in x if v > 0]
    if n < 3 or not pos or not nums_ok(x) or not nums_ok(y):
        return None
    low = min(pos)

    def raw_w(v):
        return 1 / math.pow(v if v > 0 else low, k)

    w0 = [raw_w(v) for v in x]
    s0 = 0.0
    for v in w0:
        s0 += v
    norm = n / s0

    def W(v):
        return raw_w(v) * norm

    w = [v * norm for v in w0]
    sw = 0.0
    for v in w:
        sw += v
    t1 = 0.0
    for i, v in enumerate(w):
        t1 += v * x[i]
    xm = t1 / sw
    t2 = 0.0
    for i, v in enumerate(w):
        t2 += v * y[i]
    ym = t2 / sw
    sxx = sxy = syy = 0.0
    for i in range(n):
        sxx += w[i] * (x[i] - xm) ** 2
        sxy += w[i] * (x[i] - xm) * (y[i] - ym)
        syy += w[i] * (y[i] - ym) ** 2
    if not (sxx > 0) or not (syy > 0):
        return None
    b = sxy / sxx
    a = ym - b * xm
    res = [y[i] - (a + b * v) for i, v in enumerate(x)]
    ssr = 0.0
    for i, r in enumerate(res):
        ssr += w[i] * r * r
    df = n - 2
    s = math.sqrt(ssr / df)
    t = t_inv(0.975, df)
    sb = s / math.sqrt(sxx)
    sa = s * math.sqrt(1 / sw + xm * xm / sxx)
    s_low = s / math.sqrt(W(low))
    out = {'a': a, 'b': b, 'sa': sa, 'sb': sb, 'n': n, 'df': df, 't': t, 'r2': 1 - ssr / syy if syy > 0 else 1, 'syx': s,
           'ym': ym, 'xm': xm, 'sxx': sxx, 'weight': kind, 'ciA': [a - t * sa, a + t * sa], 'ciB': [b - t * sb, b + t * sb],
           'lod': 3.3 * s_low / abs(b), 'loq': 10 * s_low / abs(b)}

    def predict(y0, m=1):
        m = m or 1
        x0 = (y0 - a) / b
        sx0 = s / abs(b) * math.sqrt(1 / (m * W(max(x0, low))) + 1 / sw + (y0 - ym) ** 2 / (b * b * sxx))
        mn, mx = min(x), max(x)
        tl = 1e-3 * (mx - mn)
        return {'x': x0, 's': sx0, 'ci': t * sx0, 'inRange': mn - tl <= x0 <= mx + tl, 'belowLoq': x0 < out['loq'], 'belowLod': x0 < out['lod']}

    out['predict'] = predict
    return out


def calibrate(pts, weight=None):
    # index.html calibrate: retta di taratura con IC, LOD/LOQ (ICH Q2) e test di Mandel
    if weight in ('1/x', '1/x2') and len(pts) >= 3:
        Wc = calibrate_w(pts, weight)
        if Wc:
            return Wc
    x = [p[0] for p in pts]
    y = [p[1] for p in pts]
    R = lin_reg(x, y)
    if not R or R['n'] < 3:
        if R:
            R['few'] = True
        return R
    df = R['n'] - 2
    t = t_inv(0.975, df)
    out = dict(R)
    out['df'] = df
    out['t'] = t
    out['ciB'] = [R['b'] - t * R['sb'], R['b'] + t * R['sb']]
    out['ciA'] = [R['a'] - t * R['sa'], R['a'] + t * R['sa']]
    out['lod'] = 3.3 * R['syx'] / abs(R['b'])
    out['loq'] = 10 * R['syx'] / abs(R['b'])
    Q = quad_reg(x, y)
    if Q and R['n'] >= 5:
        ds2 = (R['n'] - 2) * R['syx'] * R['syx'] - (R['n'] - 3) * Q['s'] * Q['s']
        PG = ds2 / (Q['s'] * Q['s']) if Q['s'] > 0 else 0
        Fc = f_inv(0.99, 1, R['n'] - 3)
        out['mandel'] = {'PG': PG, 'F': Fc, 'nonlinear': PG > Fc}

    def predict(y0, m=1):
        m = m or 1
        x0 = (y0 - R['a']) / R['b']
        sx0 = R['syx'] / abs(R['b']) * math.sqrt(1 / m + 1 / R['n'] + (y0 - R['ym']) ** 2 / (R['b'] * R['b'] * R['sxx']))
        lo, hi = min(x), max(x)
        tl = 1e-3 * (hi - lo)
        return {'x': x0, 's': sx0, 'ci': t * sx0, 'inRange': lo - tl <= x0 <= hi + tl, 'belowLoq': x0 < out['loq'], 'belowLod': x0 < out['lod']}

    out['predict'] = predict
    return out


RE_NO_EST = re.compile(r'area negativa|nessun picco|fuori dallo spettro|trasmittanza letta')
RE_SAT = re.compile(r'cima tagliata|cima piatta|rivelatore saturo')


def mv_calib(rows, weight):
    # index.html mvCalib: retta dai soli standard con concentrazione, senza saturi né misure impossibili
    ok = [o for o in rows if o['conc'] is not None and o['y'] is not None and math.isfinite(o['y']) and o['role'] == 'std' and not RE_NO_EST.search(o['flag'] or '')]
    pts = [(o['conc'], o['y']) for o in ok if not RE_SAT.search(o['flag'] or '')]
    if len(pts) < 3:
        return None
    cal = calibrate(pts, weight) or {}
    try:
        if cal.get('b') is not None and len(pts) >= 6:
            r = sorted([(p[0], abs(p[1] - (cal['a'] + cal['b'] * p[0]))) for p in pts], key=lambda q: q[0])
            t = len(r) // 3
            lo, hi = r[:t], r[-t:]

            def mq(a):
                s = 0.0
                for p in a:
                    s += p[1] * p[1]
                return s / len(a)
            cal['hetero'] = mq(hi) / mq(lo) > 9 if mq(lo) > 0 else mq(hi) > 0
    except ZeroDivisionError:
        pass
    xs = [p[0] for p in pts]
    rg = max(xs) - min(xs)
    cal['perfect'] = cal.get('b') is not None and cal['b'] != 0 and rg > 0 and fin(cal.get('lod', NAN)) and cal['lod'] <= 1e-6 * rg
    return cal


# ============================== fisisorbimento: BET e BJH/DH (app/sorption-core.js) ==============================
SORP_NA, SORP_R, VMOL_STP = 6.02214076e23, 8.314462618, 22414.0


def jdiv(a, b):
    # divisione di JavaScript: per zero dà ±Infinity o NaN invece di un errore
    if b == 0:
        if a == 0 or a != a:
            return NAN
        return math.copysign(INF, a) * math.copysign(1, b)
    return a / b


def sorp_linfit(X, Y):
    # sorption-core.js linfit: somme centrate
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
    r = sxy / math.sqrt(sxx * syy) if syy > 0 else 1
    return {'slope': slope, 'icpt': icpt, 'r': r}


def sorp_rel(iso):
    # sorption-core.js relOf: p/p₀ di ogni punto
    rel = str((iso.get('unit') or {}).get('p') or '') == 'p/p0'
    p0 = iso.get('p0')
    out = []
    for i, v in enumerate(iso['p']):
        if rel:
            out.append(v)
        elif p0 and fin(p0[i]) and p0[i] > 0:
            out.append(v / p0[i])
        else:
            out.append(NAN)
    return out


def sorp_branch(iso, which):
    # sorption-core.js branchOf
    r = (iso.get('branches') or {}).get(which)
    idx = list(range(r[0], r[1])) if isinstance(r, list) else []
    x = sorp_rel(iso)
    return [x[i] for i in idx], [iso['n'][i] for i in idx]


def bet_fit(x, n, i0, i1):
    # sorption-core.js betFit: retta BET x/(n(1−x)) contro x
    X, Y = [], []
    for i in range(i0, i1 + 1):
        X.append(x[i])
        Y.append(jdiv(x[i], n[i] * (1 - x[i])))
    L = sorp_linfit(X, Y)
    if not L:
        return None
    nm = jdiv(1, L['slope'] + L['icpt'])
    C = 1 + jdiv(L['slope'], L['icpt'])
    return {'i0': i0, 'i1': i1, 'npts': i1 - i0 + 1, 'x0': x[i0], 'x1': x[i1], 'slope': L['slope'], 'icpt': L['icpt'], 'r': L['r'], 'nm': nm, 'C': C,
            'xm': 1 / (math.sqrt(C) + 1) if C > 0 else NAN}


def bet_area(nm, P):
    return nm / P['vmol'] * SORP_NA * P['sigma'] * 1e-18 if P.get('sigma') else NAN


def x_at_n(x, n, target):
    for i in range(1, len(n)):
        if (n[i - 1] - target) * (n[i] - target) <= 0 and n[i] != n[i - 1]:
            return x[i - 1] + (target - n[i - 1]) * (x[i] - x[i - 1]) / (n[i] - n[i - 1])
    return NAN


def rouquerol(fit, x, n):
    # sorption-core.js rouquerolCheck: i quattro criteri di Rouquerol
    c = {}
    mono = True
    for i in range(fit['i0'] + 1, fit['i1'] + 1):
        if n[i] * (1 - x[i]) <= n[i - 1] * (1 - x[i - 1]):
            mono = False
    c['a'] = mono
    c['b'] = fit['C'] > 0 and fit['icpt'] > 0
    c['c'] = c['b'] and fit['x0'] <= fit['xm'] <= fit['x1']
    xn = x_at_n(x, n, fit['nm']) if c['b'] else NAN
    c['d'] = c['b'] and fin(xn) and abs(xn - fit['xm']) <= 0.1 * fit['xm']
    c['ok'] = c['a'] and c['b'] and c['c'] and c['d']
    return c


def bet_auto(iso, min_p=3):
    # sorption-core.js betAuto: la finestra valida più ampia, poi r maggiore, poi x₀ minore
    ax, an = sorp_branch(iso, 'ads')
    idx = [i for i in range(len(ax)) if 0 < ax[i] < 1 and an[i] > 0]
    if len(idx) < min_p:
        return None
    x = [ax[i] for i in idx]
    n = [an[i] for i in idx]
    valid = []
    for i0 in range(len(x)):
        for i1 in range(i0 + min_p - 1, len(x)):
            F = bet_fit(x, n, i0, i1)
            if not F:
                continue
            F['crit'] = rouquerol(F, x, n)
            if F['crit']['ok']:
                valid.append(F)
    valid.sort(key=lambda F: (-F['npts'], -F['r'], F['x0']))
    return valid[0] if valid else None


def bet_at(iso, x0, x1, P):
    # sorption-core.js betAt: BET su un intervallo dato
    ax, an = sorp_branch(iso, 'ads')
    idx = [i for i in range(len(ax)) if ax[i] >= x0 - 1e-9 and ax[i] <= x1 + 1e-9 and an[i] > 0]
    if len(idx) < 2:
        return None
    x = [ax[i] for i in idx]
    n = [an[i] for i in idx]
    F = bet_fit(x, n, 0, len(x) - 1)
    if not F:
        return None
    F['crit'] = rouquerol(F, x, n)
    F['area'] = bet_area(F['nm'], P)
    return F


def sorp_sorted(x, y):
    idx = sorted([i for i in range(len(x)) if fin(x[i]) and fin(y[i])], key=lambda i: x[i])
    return [x[i] for i in idx], [y[i] for i in idx]


def sorp_interp(xs, ys, x):
    # sorption-core.js interp: NaN fuori dall'intervallo
    n = len(xs)
    if not n:
        return NAN
    if x <= xs[0]:
        return NAN if (n > 1 and x < xs[0]) else ys[0]
    if x >= xs[n - 1]:
        return NAN if x > xs[n - 1] else ys[n - 1]
    a, b = 0, n - 1
    while b - a > 1:
        m = (a + b) >> 1
        if xs[m] <= x:
            a = m
        else:
            b = m
    t = jdiv(x - xs[a], xs[b] - xs[a])
    return ys[a] + t * (ys[b] - ys[a])


def hysteresis_close(iso):
    # sorption-core.js hysteresis: p/p₀ di chiusura dell'isteresi (solo per scegliere il ramo BJH)
    ax, an = sorp_branch(iso, 'ads')
    dx, dn = sorp_branch(iso, 'des')
    if len(dx) < 3:
        return NAN
    sax, say = sorp_sorted(ax, an)
    sdx, sdy = sorp_sorted(dx, dn)
    n_max = max(an)
    grid = []
    x = max(sax[0], sdx[0])
    while x <= min(sax[-1], sdx[-1]):
        grid.append(x)
        x += 0.005
    gap = [sorp_interp(sdx, sdy, g) - sorp_interp(sax, say, g) for g in grid]
    max_gap = 0.0
    for g in gap:
        if g > max_gap:
            max_gap = g
    thr = 0.02 * n_max
    thr_c = max(thr, 0.05 * max_gap)
    for i in range(len(grid)):
        if gap[i] > thr_c:
            return grid[i]
    return NAN


THICK = {
    'harkins-jura': lambda x: math.sqrt(13.99 / (0.034 - math.log10(x))),
    'de-boer': lambda x: math.sqrt(13.99 / (0.034 - math.log10(x))),
    'halsey': lambda x: 3.54 * math.pow(5 / math.log(1 / x), 1 / 3),
    'carbon-black': lambda x: 0.88 * x * x + 6.45 * x + 2.98,
    'kjs': lambda x: math.pow(60.65 / (0.03071 - math.log10(x)), 0.3968),
}


def kelvin_r(x, P):
    # sorption-core.js kelvinR: raggio di Kelvin in Å, menisco emisferico
    k = 2 * P['gamma'] * 1e-3 * P['Vm'] * 1e-6 * math.cos((P.get('theta') or 0) * math.pi / 180) / (SORP_R * P['T'] * math.log(1 / x))
    return k * 1e10


def bjh(iso, P, which, method, thick):
    # sorption-core.js bjh: BJH (Barrett–Joyner–Halenda) e DH (Dollimore–Heal)
    lo, hi = 0.35, 1
    if not P.get('liqPerStp') or not P.get('gamma'):
        return None
    bx, bn = sorp_branch(iso, which)
    pts = [(x, bn[i] * P['liqPerStp']) for i, x in enumerate(bx)]
    pts = [o for o in pts if o[0] >= lo and o[0] < hi and fin(o[1])]
    if which == 'ads':
        pts = sorted(pts, key=lambda o: o[0], reverse=True)
    if len(pts) < 3:
        return None
    key = thick or P['thick']
    tf = THICK.get(key, THICK['harkins-jura'])
    rk = [kelvin_r(o[0], P) for o in pts]
    t = [tf(o[0]) for o in pts]
    rp = [v + t[i] for i, v in enumerate(rk)]
    out = []
    sumA = sumL = 0.0
    for j in range(1, len(pts)):
        dV = pts[j - 1][1] - pts[j][1]
        dt = t[j - 1] - t[j]
        rpm = (rp[j - 1] + rp[j]) / 2
        rkm = (rk[j - 1] + rk[j]) / 2
        tm = (t[j - 1] + t[j]) / 2
        if method == 'dh':
            Rf = (rpm / (rkm + dt)) ** 2
            Vp = Rf * (dV - dt * sumA * 1e-4 + 2 * math.pi * tm * dt * sumL * 1e-4)
        else:
            sc = 0.0
            for o in out:
                if o['Vp'] > 0:
                    sc += (o['rp'] - t[j]) / o['rp'] * o['A']
            Rf = (rpm / (rkm + dt / 2)) ** 2
            Vp = Rf * (dV - dt * sc * 1e-4)
        if not (Vp > 0):
            Vp = 0.0
        A = 2e4 * Vp / rpm
        d0, d1 = 2 * rp[j - 1], 2 * rp[j]
        sumA += A
        sumL += A / (2 * math.pi * rpm)
        out.append({'d': 2 * rpm, 'rp': rpm, 'Vp': Vp, 'A': A, 'dVdd': jdiv(Vp, d0 - d1)})
    asc = out[::-1]
    cv = ca = 0.0
    for o in asc:
        cv += o['Vp']
        ca += o['A']
    mode = asc[0]
    for o in asc:
        if o['dVdd'] > mode['dVdd']:
            mode = o
    return {'branch': which, 'Vtot': cv, 'Atot': ca, 'mode': mode['d']}


def sorp_rows(iso, so, en):
    """sorption-core.js csvRows, solo le righe BET e BJH/DH e i dati dei rami (le altre sezioni non sono trascritte)."""
    def T(it, e):
        return e if en else it

    def g(v):
        return '' if v is None or not fin(v) else float(js_prec(v, 8))

    P = so['P']
    rows = [[T('Sezione', 'Section'), T('Grandezza', 'Quantity'), T('Valore', 'Value'), T('Unità', 'Unit'), T('Fonte o nota', 'Source or note')]]
    au = bet_auto(iso)
    if au:
        au['area'] = bet_area(au['nm'], P)
    rng = so['opt'].get('betRange')
    user = bet_at(iso, rng[0], rng[1], P) if rng else None
    ib = so.get('instrBET')
    instr = bet_at(iso, ib['x0'], ib['x1'], P) if (ib and fin(ib.get('x0')) and fin(ib.get('x1'))) else None
    B = user or au
    diff = 100 * (B['area'] - instr['area']) / instr['area'] if (B and instr and instr['area'] > 0) else None

    def s(v):
        return js_str(v) if isinstance(v, float) else v

    if B:
        crit = B['crit']
        rows += [['BET', T('Area specifica', 'Specific surface area'), g(B['area']), 'm²/g', 'p/p₀ %s–%s, %d %s' % (s(g(B['x0'])), s(g(B['x1'])), B['npts'], T('punti', 'points'))],
                 ['BET', 'C', g(B['C']), '', ''], ['BET', 'nₘ', g(B['nm']), 'cm³ STP/g', ''], ['BET', T('Pendenza', 'Slope'), g(B['slope']), '', ''],
                 ['BET', T('Intercetta', 'Intercept'), g(B['icpt']), '', ''],
                 ['BET', 'r', g(B['r']), '', T('criteri di Rouquerol', 'Rouquerol criteria') + ': ' + ' '.join(k + ('✓' if crit.get(k) else '✗') for k in 'abcd')]]
    if instr:
        rows.append(['BET', T('Area con l\'intervallo dello strumento', 'Area with the instrument range'), g(instr['area']), 'm²/g',
                     'p/p₀ %s–%s; %s %s %%' % (s(g(instr['x0'])), s(g(instr['x1'])), T('differenza', 'difference'), s(g(diff)))])
    close = hysteresis_close(iso)
    dx, _ = sorp_branch(iso, 'des')
    which = so['opt'].get('bjhBranch') or ('ads' if (P.get('gas') == 'N2' and fin(close) and 0.40 <= close <= 0.50) else ('des' if len(dx) >= 3 else 'ads'))
    for k, lab in (('bjh', 'BJH'), ('dh', 'DH')):
        b = bjh(iso, P, which, k, so['opt'].get('bjhThick'))
        if b:
            rows += [[lab, T('Volume cumulato', 'Cumulative volume'), g(b['Vtot']), 'cm³/g', T('ramo', 'branch') + ' ' + b['branch']],
                     [lab, T('Area cumulata', 'Cumulative area'), g(b['Atot']), 'm²/g', ''], [lab, T('Moda dV(d)', 'Mode dV(d)'), g(b['mode']), 'Å', '']]
    rows.append([])
    rows.append([T('Ramo', 'Branch'), 'p/p₀', T('Quantità', 'Amount'), 'cm³ STP/g', 'mmol/g'])
    for br in ('ads', 'des'):
        bx, bn = sorp_branch(iso, br)
        for i, x in enumerate(bx):
            rows.append([br, g(x), g(bn[i]), g(bn[i]), g(bn[i] / VMOL_STP * 1000)])
    return rows


def sorp_csv(rows, en):
    # sorption-ui.js csvText: i numeri con la virgola decimale in italiano
    sep, d = (',', '.') if en else (';', ',')

    def cell(c):
        s = js_str(c).replace('.', d, 1) if isinstance(c, float) else str('' if c is None else c)
        if re.match(r'[=+\-@]', s) and not re.match(r'[-+]?[0-9]', s):
            s = "'" + s
        return '"' + s.replace('"', '""') + '"' if (sep in s or re.search(r'["\n\r]', s)) else s
    return '﻿' + '\r\n'.join(sep.join(cell(c) for c in r) for r in rows) + '\r\n'


# ============================== CSV come l'app ==============================
CSV_NUM = re.compile(r'[-+]?([0-9][0-9.,]*|[.,][0-9]+)([eE][-+]?[0-9]+)?%?')


TRAD = {}   # in inglese: le traduzioni che l'app applica alle celle di testo (i18n.js, avvolge csvCell), registrate all'esportazione


def csv_cell(c, sep):
    # index.html csvCell: protezione delle formule di Excel e virgolette
    c = str(c)
    c = TRAD.get(c, c)
    if re.match(r'[=+\-@\t\r]', c) and c != '-' and not CSV_NUM.fullmatch(c):
        c = "'" + c
    if sep in c or re.search(r'["\n\r]', c):
        return '"' + c.replace('"', '""') + '"'
    return c


def csv_text(rows, sep):
    return '\ufeff' + '\r\n'.join(sep.join(csv_cell('' if c is None else c, sep) for c in r) for r in rows)


class Uscita:
    """Scrive solo dentro la cartella di uscita: ogni percorso relativo viene controllato."""

    def __init__(self, root):
        self.root = os.path.realpath(root)
        self.scritti = []

    def path(self, rel):
        p = os.path.realpath(os.path.join(self.root, rel))
        if os.path.commonpath([p, self.root]) != self.root:
            raise PermissionError('percorso fuori dalla cartella di uscita: ' + rel)
        return p

    def write(self, rel, text):
        p = self.path(rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, 'wb') as fh:
            fh.write(text.encode('utf-8'))
        self.scritti.append(rel)


def dec_num(s, dec):
    return s.replace('.', dec, 1)


def peaks_rows(sp, P, peaks, ric):
    # index.html exportEntries, voce «Elenco dei picchi»: una riga per picco
    dsep = ric['dec']
    T = ric['testi']
    out = []
    if not ric['showPeaks']:
        return out
    U = None
    absl = sp['tecnica'] == 'ftir' and P['kind'] in ('A', 'T') and not P['deriv']
    flat = sp['picchi'].get('piatto')
    if peaks:
        U = up_data(P)
        u_max = max(U)
    for p in peaks:
        row = [sp['nome'], sp['titolo'], sp['nomeTecnica'], sp['unitaX'], dec_num(num_fixed(p['x'], 4), dsep), dec_num(num_prec(p['y'], 6), dsep),
               p['name'] if p['custom'] else '', T['auto'] if not p['manual'] else T['man'], p['origin'] if p['custom'] else '']
        if ric['showArea']:
            xa, xb = p.get('xa'), p.get('xb')
            row += [dec_num(num_prec(p['area'], 6), dsep) if p.get('area') is not None else '', sp['unitaArea'].replace('⁻¹', '-1'),
                    dec_num(js_fixed(p['areaPct'], 2), dsep) if p.get('areaPct') is not None else '',
                    dec_num(num_prec(min(xa, xb), 8), dsep) if xa is not None else '', dec_num(num_prec(max(xa, xb), 8), dsep) if xb is not None else '']
        sat = False
        if U is not None:
            u = interp_y(P['xs'], U, p['x'])
            sat = (absl and u > 2) or (bool(flat) and u >= u_max - abs(u_max) * 0.005)
        row.append(T['sat'] if sat else '')
        out.append(row)
    return out


def data_csv(sp, P, ric):
    # index.html exportEntries, voce «Dati elaborati»
    dsep, csep = ric['dec'], ric['csep']
    extra = P['y2'] if P['y2'] is not None else (P['dtg'] if (sp['tecnica'] == 'tga' and P['kind'] == 'W') else None)
    head = [sp['intestDati'][0], sp['intestDati'][1]] + ([ric['testi']['dtg']] if extra is not None else [])
    lines = [csep.join(csv_cell(c.replace('−', '-'), csep) for c in head)]
    xs, ys = P['xs'], P['ys']
    for k in range(len(xs)):
        lines.append(dec_num(num_prec(xs[k], 10), dsep) + csep + dec_num(num_prec(ys[k], 8), dsep) +
                     (csep + dec_num(num_prec(extra[k], 8), dsep) if extra is not None else ''))
    return '\ufeff' + '\r\n'.join(lines)


def mv_rows(tab, results, ric):
    """index.html mvCsvRows: tabella delle misure di banda e retta di taratura (come in analisi/misure_bande_<tecnica>.csv)."""
    E = ric['lingua'] == 'en'
    dec = ric['dec']

    def L(it, en):
        return en if E else it

    def n(v):
        return '' if v is None or not fin(v) else dec_num(num_prec(float(v), 7), dec)

    def fmt_n(v, d):
        return dec_num(js_fixed(float(v), d), dec)

    def fmt_g(v, d):
        if v is None or not fin(v):
            return '—'
        if abs(v) >= 1e5 or (abs(v) < 1e-3 and v != 0):
            return dec_num(js_expo(v, (3 if d is None else d - 1)), dec)
        return dec_num(num_prec(v, d or 4), dec)

    c = tab['cfg']
    rows = []
    for r in tab['righe']:
        P = results[r['i']]
        v = mv_value(P, c['a'], c['b'], c['meas'])
        rr = None
        if c.get('c') is not None and c.get('d') is not None:
            rr = mv_value(P, c['c'], c['d'], 'value' if c['meas'] == 'value' else ('area' if c['meas'] == 'area' else 'height'))
        has_r = c.get('c') is not None and c.get('d') is not None
        y = None if (v is None or r.get('yNullo')) else ((v / rr if rr else None) if has_r else v)
        rows.append({'r': r, 'v': v, 'y': y, 'conc': r['conc'], 'role': r['ruolo'], 'flag': r['flag'] or ''})
    H0 = tab['testa']
    out = []
    if c['model'] == 'trend':
        out.append(H0 + [L('x', 'x'), L('Unità di x', 'Unit of x'), L('Stato', 'Status')])
        for o in rows:
            out.append([o['r']['nome'], o['r']['titolo'], tab['nomeTecnica'], n(c['a']), n(c['b']), tab['nomeMisura'], n(c.get('c')), n(c.get('d')), n(o['y']), n(o['conc']), c.get('unit') or '', o['flag']])
        pts = [o for o in rows if o['conc'] is not None and o['y'] is not None and math.isfinite(o['y'])]
        if len(pts) >= 3:
            R = lin_reg([o['conc'] for o in pts], [o['y'] for o in pts])
            if R:
                out.append([])
                out.append([L('Andamento', 'Trend'), L('pendenza', 'slope'), n(R['b']), '±', n(R['sb']), (L('per ', 'per ') + c['unit']) if c.get('unit') else L('per unità di x', 'per unit of x'), 'R²', n(R['r2']), L('solo descrittiva', 'descriptive only')])
        return out
    cal = mv_calib(rows, c.get('weight'))
    out.append(H0 + [L('Concentrazione nota', 'Known concentration'), L('Concentrazione stimata', 'Estimated concentration'), L('IC 95%', '95% CI'), L('Unità', 'Unit'), L('Stato', 'Status')])
    for o in rows:
        est = cal is not None and 'predict' in cal and o['y'] is not None and not RE_NO_EST.search(o['flag'])
        pr = cal['predict'](o['y'], 1) if est and ((o['role'] == 'std' and o['conc'] is None) or o['role'] == 'qc') else None
        rq = 100 * pr['x'] / o['conc'] if (o['role'] == 'qc' and pr and o['conc'] is not None and o['conc'] > 0) else None
        ps = cal['predict'](o['y'], 1) if (est and o['role'] == 'std' and o['conc'] is not None and o['conc'] > 0) else None
        rs = 100 * ps['x'] / o['conc'] if ps else None
        if rq is not None:
            rec = L('recupero', 'recovery') + ' ' + fmt_n(rq, 1) + '%' + (L(' (fuori 80–120%)', ' (outside 80–120%)') if (rq < 80 or rq > 120) else '')
        elif rs is not None:
            rec = L('recupero', 'recovery') + ' ' + fmt_n(rs, 1) + '%'
        else:
            rec = ''
        pb = cal['predict'](o['y'], 1) if (o['role'] == 'blank' and cal is not None and 'predict' in cal and o['y'] is not None and not RE_NO_EST.search(o['flag'])) else None
        if pb:
            blk = L('sopra il LOD (%s)' % fmt_g(pb['x'], 3), 'above LOD (%s)' % fmt_g(pb['x'], 3)) if pb['x'] > cal['lod'] else L('stima del bianco %s, sotto il LOD' % fmt_g(pb['x'], 3), 'blank estimate %s, below LOD' % fmt_g(pb['x'], 3))
        else:
            blk = ''
        cv = ('< LOD' if pr['belowLod'] else n(pr['x'])) if pr else ''
        status = [s for s in [('' if not pr or pr['inRange'] else 'estrapolato'), ('< LOD' if (pr and pr['belowLod']) else ('< LOQ' if (pr and pr['belowLoq']) else '')),
                              o['flag'], ('normalizzato' if tab['normalizzato'] else ''), ('unità mancante' if (pr and not c.get('unit')) else '')] if s]
        parts = [s for s in [(tab['ruoli'][o['role']] if o['role'] != 'std' else ''), rec, blk,
                             (L('stima %s sotto il LOD' % fmt_g(pr['x'], 3), 'estimate %s below LOD' % fmt_g(pr['x'], 3)) if (pr and pr['belowLod']) else ''), '; '.join(status)] if s]
        out.append([o['r']['nome'], o['r']['titolo'], tab['nomeTecnica'], n(c['a']), n(c['b']), tab['nomeMisura'], n(c.get('c')), n(c.get('d')), n(o['y']), n(o['conc']),
                    cv, n(pr['ci']) if (pr and not pr['belowLod']) else '', c.get('unit') or '', '; '.join(parts)])
    if cal and cal.get('b') is not None:
        st = [o for o in rows if o['role'] == 'std' and o['conc'] is not None and o['y'] is not None]
        cs = [o['conc'] for o in st]
        lv = len(set(float(js_prec(v, 6)) for v in cs))
        out.append([])
        out.append([L('Retta', 'Line'), L('pesi', 'weights'), cal.get('weight') or L('nessuno', 'none'), 'n', js_str(cal['n']), L('IC95 di a (intercetta)', '95% CI of a (intercept)'),
                    n(cal['ciA'][0] if cal.get('ciA') else None), n(cal['ciA'][1] if cal.get('ciA') else None), L('IC95 di b (pendenza)', '95% CI of b (slope)'),
                    n(cal['ciB'][0] if cal.get('ciB') else None), n(cal['ciB'][1] if cal.get('ciB') else None), L('a (intercetta)', 'a (intercept)'), n(cal['a']),
                    L('b (pendenza)', 'b (slope)'), n(cal['b']), 'R²', n(cal['r2']), 's(y/x)', n(cal['syx']), 'LOD', n(cal['lod']), 'LOQ', n(cal['loq'])])
        if cal.get('perfect'):
            out.append([L('Avviso', 'Warning'), re.sub(r'^⚠️\s*', '', tab['avvisoPerfetto'])])
        if tab.get('canale'):
            out.append([L('Canale', 'Channel'), tab['canale'], L('altri canali esclusi dalla retta', 'other channels excluded from the line')])
        if cs:
            out.append([L('Intervallo di taratura', 'Calibration range'), n(min(cs)), n(max(cs)), c.get('unit') or '', L('livelli', 'levels'), js_str(lv), L('standard', 'standards'), js_str(len(cs))])
        if cal.get('mandel'):
            md = cal['mandel']
            out.append(['Mandel', 'PG', n(md['PG']), 'F99', n(md['F']), L('non lineare', 'non-linear'), L('sì', 'yes') if md['nonlinear'] else L('no', 'no')])
    return out


def analysis_csv(rows, sep, dec):
    # index.html analysisFiles: csv() toglie i tag HTML prima di csvCell
    return '\ufeff' + '\r\n'.join(sep.join(csv_cell(re.sub(r'<[^>]+>', '', '' if c is None else str(c)), sep) for c in r) for r in rows)


# ============================== esecuzione della ricetta ==============================
def load_spectrum(sp, dati):
    """Lettura di uno spettro: dal file originale (testo) o dal CSV scritto dall'app (formati binari e casi non ricostruibili)."""
    le = sp['lettura']
    if le['modo'] == 'testo':
        path = os.path.join(dati, le['file'])
        if not os.path.isfile(path):
            raise LetturaDiversa('file originale non trovato: ' + path)
        h = sha256_file(path)
        if h != le['sha256']:
            raise LetturaDiversa('il file %s non è quello del progetto (SHA-256 %s invece di %s)' % (le['file'], h, le['sha256']))
        with open(path, 'rb') as fh:
            xs0, ys = read_text_lines(fh.read(), le)
    elif le['modo'] == 'csv':
        path = os.path.join(dati, le['file'])
        if not os.path.isfile(path):
            raise LetturaDiversa('CSV dei dati letti non trovato: ' + path)
        xs0, ys = read_csv_xy(path)
    else:
        raise NonTrascritto('modo di lettura sconosciuto: ' + str(le['modo']))
    fp = fingerprint(xs0, ys)
    if fp != le['impronta']:
        raise LetturaDiversa('i numeri letti da %s non coincidono con quelli del progetto (impronta %s invece di %s)' % (le['file'], fp[:12], le['impronta'][:12]))
    ec = sp.get('ecal')
    xs = [ec['a'] + ec['b'] * x for x in xs0] if ec else xs0   # index.html setEcal: x nuovo = a + b·x del file
    return xs, ys


def run_project(ric, dati, out, log):
    """Rifà lettura, elaborazioni, picchi, aree e tarature dello spettro come nell'app; scrive i CSV con gli stessi nomi."""
    spettri = ric['spettri']
    loaded = [None] * len(spettri)
    results = [None] * len(spettri)
    errori = []
    for k, sp in enumerate(spettri):
        try:
            loaded[k] = load_spectrum(sp, dati)
        except (LetturaDiversa, NonTrascritto, OSError, ValueError) as e:
            errori.append('%s: %s' % (sp['nome'], e))
    for k, sp in enumerate(spettri):
        if loaded[k] is None:
            continue
        ref = None
        r = sp['elab'].get('sub_rif')
        if r is not None:
            if loaded[r] is None:
                errori.append('%s: manca lo spettro di riferimento da sottrarre' % sp['nome'])
                continue
            ref = (loaded[r][0], loaded[r][1], spettri[r]['kind'])
        results[k] = processed(sp, loaded[k][0], loaded[k][1], ref)
    rows = [list(ric['testaPicchi'])]
    for k, sp in enumerate(spettri):
        if not sp.get('incluso') or results[k] is None:
            continue
        P = results[k]
        peaks = view_peaks(sp, P, loaded[k][0], loaded[k][1], ric)
        rows += peaks_rows(sp, P, peaks, ric)
        out.write(sp['fileDati'], data_csv(sp, P, ric))
        log('  %-40s %6d punti, %d picchi' % (sp['nome'][:40], len(P['xs']), len(peaks)))
    out.write(ric['filePicchi'], csv_text(rows, ric['csep']))
    for so in ric.get('fisisorbimento') or []:
        try:
            path = os.path.join(dati, so['file'])
            with open(path, 'rb') as fh:
                b = fh.read()
            if hashlib.sha256(b).hexdigest() != so['sha256']:
                raise LetturaDiversa('isoterma diversa da quella del progetto: ' + so['file'])
            iso = json.loads(b.decode('utf-8'))
            out.write(so['uscita'], sorp_csv(sorp_rows(iso, so, ric['lingua'] == 'en'), ric['lingua'] == 'en'))
        except (LetturaDiversa, OSError, ValueError) as e:
            errori.append('%s: %s' % (so['file'], e))
    for tab in ric.get('tarature') or []:
        if any(results[r['i']] is None for r in tab['righe']):
            errori.append('%s: manca uno spettro della taratura' % tab['file'])
            continue
        out.write(tab['file'], analysis_csv(mv_rows(tab, results, ric), ric['csep'], ric['dec']))
    return errori


def run_new_files(ric, files, tecnica, out, log):
    """Applica le impostazioni per tecnica della ricetta a file nuovi (lettura semplificata, solo picchi automatici)."""
    modello = next((sp for sp in ric['spettri'] if sp['tecnica'] == tecnica), None)
    if modello is None:
        raise NonTrascritto('nessuno spettro della ricetta ha la tecnica ' + tecnica)
    rows = [list(ric['testaPicchi'])]
    for path in files:
        with open(path, 'rb') as fh:
            xs, ys = read_simple_text(fh.read(), modello['lettura'].get('ycol', 1))
        sp = dict(modello)
        nome = os.path.basename(path)
        sp.update({'nome': nome, 'titolo': nome, 'uncal': False, 'ecal': None,
                   'picchi': {'tolti': [], 'aggiunti': [], 'nomi': {}, 'piatto': False}})
        sp['elab'] = dict(modello['elab'], xr=None, sub_rif=None)
        P = processed(sp, xs, ys)
        peaks = view_peaks(sp, P, xs, ys, ric)
        rows += peaks_rows(sp, P, peaks, ric)
        base = re.sub(r'\.[^.]{1,4}$', '', nome)
        out.write(os.path.join(os.path.dirname(ric['spettri'][0]['fileDati']), base + '.csv'), data_csv(sp, P, ric))
        log('  %-40s %6d punti, %d picchi' % (nome[:40], len(P['xs']), len(peaks)))
    out.write(ric['filePicchi'], csv_text(rows, ric['csep']))


def _num_cells(text):
    rows = []
    for line in text.lstrip('\ufeff').split('\r\n'):
        rows.append(line)
    return rows


def compare_expected(ric, out, log):
    """Confronta i CSV scritti con i risultati attesi dell'app (impronte e campioni di valori)."""
    diffs = []
    for rel, att in sorted((ric.get('attesi') or {}).items()):
        p = out.path(rel)
        if not os.path.isfile(p):
            diffs.append('%s: non scritto' % rel)
            continue
        with open(p, 'rb') as fh:
            b = fh.read()
        h = hashlib.sha256(b).hexdigest()
        if h == att['sha256']:
            continue
        got = b.decode('utf-8').lstrip('\ufeff').split('\r\n')
        exp = att.get('righe') or {}
        shown = 0
        for k, line in sorted(exp.items(), key=lambda q: int(q[0])):
            k = int(k)
            g = got[k] if k < len(got) else '(manca)'
            if g != line:
                diffs.append('%s, riga %d: «%s» invece di «%s»' % (rel, k + 1, g, line))
                shown += 1
                if shown >= 5:
                    break
        if not shown:
            diffs.append('%s: contenuto diverso da quello dell\'app (SHA-256 %s)' % (rel, h[:12]))
    return diffs


def main(argv=None):
    ric = RICETTA
    T = ric['testi']
    TRAD.update(ric.get('traduzioni') or {})
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description=T['descrizione'])
    ap.add_argument('--dati', default=os.path.join(here, 'dati'), help=T['aiutoDati'])
    ap.add_argument('--uscita', default=os.path.join(here, 'risultati'), help=T['aiutoUscita'])
    ap.add_argument('--file', nargs='*', default=None, help=T['aiutoFile'])
    ap.add_argument('--tecnica', default=None, help=T['aiutoTecnica'])
    a = ap.parse_args(argv)
    out = Uscita(a.uscita)
    log = print
    log('Acchiappaspettri %s · %s' % (ric['versione'], T['titolo']))
    if a.file:
        tec = a.tecnica or ric['spettri'][0]['tecnica']
        run_new_files(ric, a.file, tec, out, log)
        log(T['nuoviFile'])
        return 0
    errori = run_project(ric, a.dati, out, log)
    nt = ric.get('nonTrascritte') or []
    for e in errori:
        log('ERRORE: ' + e)
    for e in nt:
        log(T['nonTrascritta'] + ': ' + e)
    if errori:
        return 2
    diffs = compare_expected(ric, out, log)
    if diffs:
        log(T['verificaDiversa'])
        for d in diffs:
            log('  ' + d)
        return 1
    log(T['verificaIdentica'])
    return 3 if nt else 0
