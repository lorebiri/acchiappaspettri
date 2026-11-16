# ---------------------------------------------------------------------------------------------
# Parte «lettori» di acch_ricetta: trascrizione in Python (solo libreria standard) dei lettori di
# Acchiappaspettri. Si concatena DOPO acch_ricetta.py: usa decode_buffer, split_line, to_num,
# parse_line, csv_split, js_trim, js_round, js_str, num_prec, NonTrascritto.
# Fonti: index.html (blocco CORE: parseText → parseText1 → xUnitFix → parseText0 e ciò che chiama,
# parseBinary con SPA e OPUS; fuori dal blocco: textChannels) e app/channels-core.js (AcchChannels).
# Ingressi: parse_text(text, opt), parse_bytes(raw, nome, opt), read_channels(raw, nome, opt).
# Le espressioni regolari sono quelle dell'app, tradotte da jsre() con la semantica di JavaScript
# (\d \w \b solo ASCII, \s con gli spazi di JS, «.» e «$» come in JS, /i senza il flag u).
# Non trascritto: i lettori delle isoterme e del chemisorbimento (sorpParse → SorpCore).
# ---------------------------------------------------------------------------------------------
import unicodedata

_JS_LT = '\n\r  '


class _RangeError(Exception):
    """Lettura fuori dal buffer: in JavaScript DataView lancia RangeError."""


# ============================== espressioni regolari di JavaScript ==============================
def _cesc(c):
    # carattere dentro una classe di Python
    return '\\' + c if c in '\\]^-[&~|' else c


_WORD = 'A-Za-z0-9_'
_WSCLS = ''.join(_cesc(c) for c in JS_WS)
_WB = '(?:(?<=[{0}])(?![{0}])|(?<![{0}])(?=[{0}]))'.format(_WORD)
_NWB = '(?:(?<=[{0}])(?=[{0}])|(?<![{0}])(?![{0}]))'.format(_WORD)
_CANON_EQ = None
_JSRE = {}


def _canon(c):
    # Canonicalize delle regex /i di JavaScript senza u (ECMA-262 22.2.2.7.3)
    u = c.upper()
    if len(u) != 1 or (ord(c) >= 128 and ord(u) < 128):
        return c
    return u


def _ieq(c):
    # caratteri equivalenti a c in una regex /i di JavaScript (c non ASCII)
    global _CANON_EQ
    if _CANON_EQ is None:
        d = {}
        for k in range(0x80, 0x10000):
            ch = chr(k)
            d.setdefault(_canon(ch), []).append(ch)
        _CANON_EQ = d
    s = set(_CANON_EQ.get(_canon(c), []))
    s.add(c)
    return sorted(s)


def jsre(src, flags=''):
    """Compila il sorgente di una regex di JavaScript con la stessa semantica (sottoinsieme usato dall'app)."""
    key = (src, flags)
    r = _JSRE.get(key)
    if r is not None:
        return r
    ic, ml, n = 'i' in flags, 'm' in flags, len(src)

    def esc(j):
        d = src[j + 1]
        if d == 'd':
            return 'cls', '0-9', j + 2
        if d == 'D':
            return 'ncls', '0-9', j + 2
        if d == 'w':
            return 'cls', _WORD, j + 2
        if d == 'W':
            return 'ncls', _WORD, j + 2
        if d == 's':
            return 'cls', _WSCLS, j + 2
        if d == 'S':
            return 'ncls', _WSCLS, j + 2
        simple = {'n': '\n', 'r': '\r', 't': '\t', 'f': '\f', 'v': '\v'}
        if d in simple:
            return 'ch', simple[d], j + 2
        if d == '0' and not (j + 2 < n and src[j + 2].isdigit()):
            return 'ch', '\0', j + 2
        if d == 'u':
            return 'ch', chr(int(src[j + 2:j + 6], 16)), j + 6
        if d == 'x':
            return 'ch', chr(int(src[j + 2:j + 4], 16)), j + 4
        if d.isalnum():
            raise ValueError('escape non gestito: \\' + d)
        return 'ch', d, j + 2

    def chars(c):
        return _ieq(c) if ic and ord(c) >= 128 else [c]

    def klass(j):
        j += 1
        neg = j < n and src[j] == '^'
        if neg:
            j += 1
        if src[j] == ']':
            raise ValueError('classe vuota')
        atoms = []

        def atom(j):
            if src[j] == '\\':
                if src[j + 1] == 'b':
                    return ('ch', '\b'), j + 2
                k, v, j = esc(j)
                if k == 'ncls':
                    raise ValueError('classe negata dentro una classe')
                return (k, v), j
            return ('ch', src[j]), j + 1
        while src[j] != ']':
            a, j = atom(j)
            if a[0] == 'ch' and src[j] == '-' and src[j + 1] != ']':
                b, j2 = atom(j + 1)
                if b[0] == 'ch':
                    atoms.append(('rng', a[1], b[1]))
                else:
                    atoms += [a, ('ch', '-'), b]
                j = j2
                continue
            atoms.append(a)
        parts = []
        for a in atoms:
            if a[0] == 'ch':
                parts += [_cesc(x) for x in chars(a[1])]
            elif a[0] == 'cls':
                parts.append(a[1])
            else:
                lo, hi = ord(a[1]), ord(a[2])
                if lo > hi:
                    raise ValueError('intervallo rovesciato')
                parts.append(_cesc(a[1]) + '-' + _cesc(a[2]))
                if ic and hi >= 128:
                    if hi - max(lo, 128) > 5000:
                        raise ValueError('intervallo /i troppo ampio')
                    for k in range(max(lo, 128), hi + 1):
                        parts += [_cesc(x) for x in _ieq(chr(k))]
        return '[' + ('^' if neg else '') + ''.join(parts) + ']', j + 1

    out, i = [], 0
    while i < n:
        c = src[i]
        if c == '\\':
            d = src[i + 1]
            if d == 'b':
                out.append(_WB)
                i += 2
                continue
            if d == 'B':
                out.append(_NWB)
                i += 2
                continue
            k, v, i = esc(i)
            if k == 'cls':
                out.append('[' + v + ']')
            elif k == 'ncls':
                out.append('[^' + v + ']')
            else:
                eq = chars(v)
                out.append('[' + ''.join(_cesc(x) for x in eq) + ']' if len(eq) > 1 else re.escape(v))
        elif c == '[':
            s, i = klass(i)
            out.append(s)
        elif c == '(':
            for g in ('(?<=', '(?<!', '(?:', '(?=', '(?!'):
                if src.startswith(g, i):
                    out.append(g)
                    i += len(g)
                    break
            else:
                if src.startswith('(?', i):
                    raise ValueError('gruppo non gestito')
                out.append('(')
                i += 1
        elif c == '.':
            out.append('[^\n\r  ]')
            i += 1
        elif c == '^':
            out.append('(?<![^\n\r  ])' if ml else '^')
            i += 1
        elif c == '$':
            out.append('(?![^\n\r  ])' if ml else '\\Z')
            i += 1
        elif c in '+*?|){}':
            out.append(c)
            i += 1
        else:
            eq = chars(c)
            out.append('[' + ''.join(_cesc(x) for x in eq) + ']' if len(eq) > 1 else re.escape(c))
            i += 1
    r = re.compile(''.join(out), re.A | (re.I if ic else 0))
    _JSRE[key] = r
    return r


def jt(src, s, flags=''):
    # re.test(s)
    return jsre(src, flags).search(s) is not None


def jx(src, s, flags=''):
    # re.exec(s): i gruppi che non partecipano valgono None (undefined)
    return jsre(src, flags).search(s)


def jsub(src, s, rep, flags=''):
    # s.replace(re, rep): con «g» tutte le occorrenze, altrimenti la prima
    return jsre(src, flags.replace('g', '')).sub(rep, s, count=0 if 'g' in flags else 1)


def jsplit(src, s, flags=''):
    return jsre(src, flags).split(s)


def jcount(src, s, flags=''):
    # (s.match(/…/g)||[]).length
    return sum(1 for _ in jsre(src, flags).finditer(s))


def js_slice(s, a, b=None):
    # String.prototype.slice: indici in unità UTF-16
    if s.isascii() or max(s) <= '￿':
        return s[a:b]
    e = s.encode('utf-16-le', 'surrogatepass')
    a2, b2, _ = slice(a, b).indices(len(e) // 2)
    return e[2 * a2:2 * b2].decode('utf-16-le', 'surrogatepass') if b2 > a2 else ''


def js_len(s):
    return len(s) if s.isascii() else len(s.encode('utf-16-le', 'surrogatepass')) // 2


_RE_PF = re.compile(r'[-+]?(Infinity|([0-9]+\.?[0-9]*|\.[0-9]+)([eE][-+]?[0-9]+)?)')


def js_parse_float(s):
    # parseFloat
    s = str(s).lstrip(JS_WS)
    m = _RE_PF.match(s)
    if not m:
        return NAN
    t = m.group(0)
    if t.lstrip('+-') == 'Infinity':
        return -INF if t[0] == '-' else INF
    return float(t)


def js_parse_int10(s):
    # parseInt(s, 10)
    m = re.match(r'([-+]?)([0-9]+)', str(s).lstrip(JS_WS))
    if not m:
        return NAN
    v = float(int(m.group(2)))
    return -v if m.group(1) == '-' else v


_RE_NUMSTR = re.compile(r'[-+]?(Infinity|([0-9]+\.?[0-9]*|\.[0-9]+)([eE][-+]?[0-9]+)?)\Z')


def js_number(s):
    # Number(stringa)
    s = js_trim(s)
    if s == '':
        return 0.0
    m = re.fullmatch(r'0([xXoObB])([0-9a-fA-F]+)', s)
    if m:
        base = {'x': 16, 'o': 8, 'b': 2}[m.group(1).lower()]
        try:
            return float(int(m.group(2), base))
        except ValueError:
            return NAN
    if not _RE_NUMSTR.match(s):
        return NAN
    if s.lstrip('+-') == 'Infinity':
        return -INF if s[0] == '-' else INF
    return float(s)


def js_sign(v):
    # Math.sign (NaN resta NaN, ±0 resta 0)
    return v if (v != v or v == 0) else (1.0 if v > 0 else -1.0)


def fin_n(v):
    # isFinite(v) su un numero (None = undefined → falso)
    return v is not None and not isinstance(v, str) and math.isfinite(v)


def arr_min(a):
    # index.html arrMin
    m = INF
    for v in a:
        if v < m:
            m = v
    return m


def arr_max(a):
    # index.html arrMax
    m = -INF
    for v in a:
        if v > m:
            m = v
    return m


def lines_of(text):
    # text.split(/\r\n|\n|\r/)
    return re.split(r'\r\n|\n|\r', text)


def _fl(a):
    return [float(v) for v in a]


def _empty_reject(reason, meta=None):
    return {'xs': [], 'ys': [], 'meta': meta if meta is not None else [], 'reject': reason}


# chiavi di XRF_TUBES e XRF_LINES (index.html): servono solo a dire se l'anodo letto è un elemento noto
XRF_TUBES_K = {'Rh', 'Ag', 'Mo', 'Pd', 'W'}
XRF_LINES_K = {'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se',
               'Br', 'Rb', 'Sr', 'Y', 'Zr', 'Nb', 'Mo', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn', 'Sb', 'Te', 'I', 'Cs', 'Ba', 'La', 'Ce', 'Nd', 'Hf',
               'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg', 'Tl', 'Pb', 'Bi', 'Th', 'U'}


# ============================== isoterme e chemisorbimento: non trascritti ==============================
def _sorp_norm(s):
    # app/sorption-core.js norm
    t = unicodedata.normalize('NFD', s)
    t = jsub('[̀-ͯ]', t, '', 'g').lower()
    return t.replace('₀', '0').replace('³', '3').replace('²', '2')


_CHEM_KW = (r'\b(TPR|TPO|TPD|TPSR)\b|temperature.?programmed|programmata in temperatura|pulse\s*(chemisorption|titration|no\.?|number)|'
            r'titolazione a impulsi|impulsi|chemisorption|chemisorbimento|chemisorbtion|combined isotherm|repeat isotherm|isoterma combinata|'
            r'isoterma ripetuta|acchiappaspettri chem')


def sorp_may_match(text):
    """Condizione necessaria perché index.html sorpParse dia un risultato (parseAIF, looksSorption, CHEM_KW di app/sorption-core.js)."""
    if js_len(text) < 20:
        return False
    if jt(r'_adsorp_pressure|_adsorp_amount', text):
        return True
    t = jsub(r'[\s_]+', _sorp_norm(js_slice(text, 0, 20000)), '', 'g')
    if jt(r'kaomi|asiqwin|quantachrome|autosorb|isotherm|isoterma|relativepressure|pressionerelativa|p\/p0|volume@stp|cm3stp\/g|amountadsorbed|quantitaadsorbita|_adsorp_pressure', t):
        return True
    return jt(_CHEM_KW, js_slice(text, 0, 6000), 'i')


# ============================== XRF ==============================
def parse_xrf(text):
    # index.html parseXRF (con la taratura canale → energia)
    lines = lines_of(text)
    ONE = r'^[-+]?\d+(?:[.,]\d+)?(?:[eE][-+]?\d+)?$'
    amptek = jt(r'<<\s*DATA\s*>>', text, 'i')
    spt = jt(r'^\s*\[DATA\]\s*$', text, 'mi')
    spe = jt(r'^\s*\$DATA:\s*$', text, 'm')
    hash_mca = jt(r'^#\s*(MCA Channels|Calibration\d|Tube Anode)\b', text, 'mi')
    meta, counts, cal = [], [], []
    poly, fmt, start, sec, bad_ch = None, '', 0.0, '', 0

    def pair(l):
        t = [to_num(x) for x in jsplit(r'[\s;\t]+', js_trim(l))]
        return [t[0], t[1]] if len(t) >= 2 and math.isfinite(t[0]) and math.isfinite(t[1]) else None
    if amptek:
        fmt = 'Amptek MCA'
        for raw in lines:
            l = js_trim(raw)
            if not l:
                continue
            m = jx(r'^<<\s*(.+?)\s*>>$', l)
            if m:
                sec = m.group(1).upper()
                continue
            if sec == 'DATA':
                if jt(ONE, l):
                    counts.append(to_num(l))
                else:
                    counts.append(None)
                    bad_ch += 1
            elif sec == 'CALIBRATION':
                q = pair(l)
                if q:
                    cal.append(q)
                else:
                    meta.append(l)
            elif len(meta) < 200:
                meta.append(l)
        for i in range(len(counts)):
            if counts[i] is None:
                a, b = i - 1, i + 1
                while b < len(counts) and counts[b] is None:
                    b += 1
                counts[i] = ((counts[a] if a >= 0 else 0) + (counts[b] if b < len(counts) else 0)) / 2
    elif spt:
        fmt = 'LIDAQ (.spt)'
        for raw in lines:
            l = js_trim(raw)
            if not l:
                continue
            m = jx(r'^\[(.+)\]$', l)
            if m:
                sec = m.group(1).upper()
                if len(meta) < 200:
                    meta.append(l)
                continue
            if sec == 'DATA':
                if jt(ONE, l):
                    counts.append(to_num(l))
            elif sec == 'CALIBRATION':
                c = jx(r'^Coefficients\s*=\s*(.+)$', l, 'i')
                if c:
                    v = [to_num(x) for x in jsplit(r'\s+', js_trim(c.group(1)))]
                    if all(math.isfinite(x) for x in v):
                        poly = v
                    continue
                q = pair(l)
                if q:
                    cal.append(q)
                else:
                    meta.append(l)
            elif len(meta) < 200:
                meta.append(l)
    elif spe:
        fmt = 'Maestro (.spe)'
        first = True
        for raw in lines:
            l = js_trim(raw)
            if not l:
                continue
            if jt(r'^\$[A-Z_]+:$', l):
                sec = l[1:-1]
                first = True
                if len(meta) < 200:
                    meta.append(l)
                continue
            if sec == 'DATA':
                if first:
                    first = False
                    q = pair(l)
                    if q:
                        start = q[0]
                        continue
                if jt(ONE, l):
                    counts.append(to_num(l))
            elif sec == 'ENER_FIT':
                v = [to_num(x) for x in jsplit(r'\s+', l)]
                if len(v) >= 2 and all(math.isfinite(x) for x in v):
                    poly = v
            elif sec == 'MCA_CAL':
                v = [x for x in (to_num(x) for x in jsplit(r'\s+', l)) if math.isfinite(x)]
                if len(v) >= 2 and not first:
                    poly = v
                first = False
            elif len(meta) < 200:
                meta.append(l)
    else:
        for raw in lines:
            l = js_trim(raw)
            if not l:
                continue
            if jt(ONE, l):
                counts.append(to_num(l))
                continue
            if counts:
                if len(meta) < 200:
                    meta.append(l)
                continue
            if jt(r'[\d.,]+\s*[\t;, ]\s*[-+]?\d', l) and not jt(r'^[#;!*%]', l) and not jt(r'[a-z]{2}', jsub(r'[eE][-+]?\d', l, '', 'g'), 'i'):
                return None
            c = jx(r'^#?\s*Calibration\d*\s*[:=]\s*([-+\d.,]+)\s+([-+\d.,]+)', l, 'i')
            if c:
                a, b = to_num(c.group(1)), to_num(c.group(2))
                if math.isfinite(a) and math.isfinite(b):
                    cal.append([a, b])
            meta.append(l)
        if not hash_mca and len(counts) < 256:
            return None
        if len(counts) < 16:
            return None
        fmt = 'MCA (.mca)' if hash_mca else 'MCA (una colonna)'
    if len(counts) < 16 or not all(math.isfinite(v) for v in counts):
        return None
    A, B, C2 = None, None, 0
    if poly and any(v != 0 for v in poly[:3]):
        g = lambda k: (poly[k] if k < len(poly) else 0) or 0
        A, B, C2 = g(0), g(1), g(2)
    else:
        pts = [q for q in cal if q[0] >= 0]
        if len(pts) >= 2:
            n = len(pts)
            t = 0
            for q in pts:
                t = t + q[0]
            mx = t / n
            t = 0
            for q in pts:
                t = t + q[1]
            my = t / n
            sxx = sxy = 0
            for q in pts:
                sxx += (q[0] - mx) ** 2
                sxy += (q[0] - mx) * (q[1] - my)
            if sxx > 0:
                B = sxy / sxx
                A = my - B * mx
        elif len(pts) == 1 and pts[0][0] > 0:
            A = 0
            B = pts[0][1] / pts[0][0]
    calibrated = A is not None and (B > 0 or C2 > 0)
    E = (lambda ch: A + B * ch + C2 * ch * ch) if calibrated else (lambda ch: ch)
    scale = 1
    if calibrated and E(start + len(counts) - 1) > 200:
        scale = 0.001
    lo, hi = 0, len(counts) - 1
    while lo < hi and counts[lo] == 0:
        lo += 1
    while hi > lo and counts[hi] == 0:
        hi -= 1
    xs, ys = [], []
    for i in range(lo, hi + 1):
        x = E(start + i) * scale
        if calibrated and x < 0:
            continue
        xs.append(x)
        ys.append(counts[i])

    def hv(src, fl='i'):
        for l in meta:
            m = jx(src, l, fl)
            if m:
                return js_trim(m.group(1))
        return ''
    info = {'fmt': fmt, 'calibrated': calibrated,
            'cal': {'a': A * scale, 'b': B * scale, 'c': C2 * scale} if calibrated else None,
            'tube': hv(r'Tube Anode\s*[:=]\s*([A-Z][a-z]?)\b') or hv(r'\bAnode\s*[:=]\s*([A-Z][a-z]?)\b'),
            'kv': hv(r'Tube Voltage\s*[:=]\s*([\d.,]+)') or hv(r'\bHV\s*[:=]\s*([\d.,]+)'), 'ua': hv(r'Tube Current\s*[:=]\s*([\d.,]+)'),
            'live': hv(r'Live[_ ]time\s*[:=\-]\s*([\d.,]+)'), 'liveMs': jt(r'Live Time\s*=\s*[\d.,]+\s*msec', '\n'.join(meta), 'i'),
            'psi1': hv(r'Incident beam angle\s*[:=]\s*([\d.,]+)') or hv(r'Incidence angle\s*[:=]\s*([\d.,]+)'),
            'psi2': hv(r'Fluorescence beam(?: angle)?\s*[:=]\s*([\d.,]+)') or hv(r'Take-?off angle\s*[:=]\s*([\d.,]+)'),
            'dist': hv(r'Sample to detector distance\s*[:=]\s*([\d.,]+)')}
    if info['tube'] and info['tube'] not in XRF_TUBES_K and info['tube'] not in XRF_LINES_K:
        info['tube'] = ''
    return {'xs': _fl(xs), 'ys': _fl(ys), 'meta': meta + ['XRF ' + fmt], 'pe': False, 'peX': '', 'peY': '', 'xrf': info,
            'importIssue': {'dropped': bad_ch, 'thou': 0, 'after': 0, 'total': len(counts)} if bad_ch else None}


# ============================== colonne con nome: TGA/DSC, EPR ==============================
def parse_named_columns(text):
    # index.html parseNamedColumns
    lines = lines_of(text)
    seps = [r'\t', r';', r',(?=\s*[-+]?\d)|,\s*(?=[A-Za-z"])', r'\s{2,}', r'\s+']
    for sep in seps:
        R = jsre(sep)
        start, ncol = -1, 0
        for i in range(len(lines)):
            t = js_trim(lines[i])
            if not t:
                continue
            v = [s for s in (js_trim(x) for x in R.split(t)) if s != '']
            if len(v) >= 2 and all(math.isfinite(to_num(s)) for s in v):
                ok = 0
                for j in range(i + 1, min(len(lines), i + 6)):
                    u = [s for s in (js_trim(x) for x in R.split(js_trim(lines[j]))) if s != '']
                    if len(u) == len(v) and all(math.isfinite(to_num(s)) for s in u):
                        ok += 1
                if ok >= 3:
                    start, ncol = i, len(v)
                    break
        if start < 0:
            continue
        names = units = None
        for j in range(start - 1, max(0, start - 4) - 1, -1):
            t = js_trim(lines[j])
            if not t:
                continue
            v = [s for s in (jsub(r'^"|"$', js_trim(x), '', 'g') for x in R.split(jsub(r'^#\s*', t, ''))) if s != '']
            if len(v) == ncol and any(jt(r'[a-zA-Zµ°%]', s) for s in v):
                if not names:
                    names = v
                    if all(jt(r'^[\[(]?[^\w]*[a-zµ°%/]{1,8}[\])]?$', s, 'i') for s in v) and j > 0:
                        units = v
                        names = None
                        continue
                    break
            elif names or units:
                break
        if units and not names:
            names, units = units, None
        if not names:
            continue
        if units:
            names = [nm + ' (' + jsub(r'^[\[(]|[\])]$', units[i], '', 'g') + ')' for i, nm in enumerate(names)]
        cols = [[] for _ in range(ncol)]
        meta = [x for x in (js_trim(l) for l in lines[:start]) if x][:200]
        for i in range(start, len(lines)):
            t = js_trim(lines[i])
            if not t:
                continue
            v = [s for s in (js_trim(x) for x in R.split(t)) if s != '']
            if len(v) != ncol:
                continue
            nums = [to_num(s) for s in v]
            if not all(math.isfinite(x) for x in nums):
                continue
            for k, x in enumerate(nums):
                cols[k].append(x)
        if len(cols[0]) < 5:
            continue
        return {'names': names, 'cols': cols, 'meta': meta}
    return None


def unit_of(name):
    # index.html unitOf
    m = jx(r'[\[(]([^\])]+)[\])]\s*$', name or '')
    return js_trim(m.group(1)) if m else ''


def thermal_segments(T):
    # index.html thermalSegments
    n = len(T)
    w = max(3, js_round(n / 300))
    d = []
    for i in range(n):
        a, b = max(0, i - w), min(n - 1, i + w)
        d.append((T[b] - T[a]) / ((b - a) or 1))
    s = sorted(abs(v) for v in d)
    k = math.floor(n * 0.75)
    md = (s[k] if k < len(s) else 0) or 0
    eps = max(md * 0.2, 1e-9)
    lab = [1 if v > eps else -1 if v < -eps else 0 for v in d]
    runs, a = [], 0
    for i in range(1, n + 1):
        if i == n or lab[i] != lab[a]:
            runs.append({'a': a, 'b': i - 1, 'dir': lab[a]})
            a = i
    mn = max(10, js_round(n * 0.03))
    segs = [r for r in runs if r['dir'] != 0 and r['b'] - r['a'] + 1 >= mn]
    out = []
    for r in segs:
        l = out[-1] if out else None
        if l and l['dir'] == r['dir'] and r['a'] - l['b'] < mn:
            l['b'] = r['b']
        else:
            out.append(dict(r))
    h = c = 0
    for r in out:
        if r['dir'] > 0:
            h += 1
            r['n'] = h
        else:
            c += 1
            r['n'] = c
    return out if out else [{'a': 0, 'b': n - 1, 'dir': 1, 'n': 1}]


def thermal_slice(raw, seg):
    # index.html thermalSlice
    segs = raw['segs']
    sg = segs[seg] if 0 <= seg < len(segs) else segs[0]
    idx = sorted(range(sg['a'], sg['b'] + 1), key=raw['T'].__getitem__)
    return {'xs': _fl(raw['T'][i] for i in idx), 'ys': _fl(raw['Y'][i] for i in idx),
            'ts': _fl(raw['t'][i] for i in idx) if raw['t'] is not None else None}


def _find(lst, pred):
    for i, v in enumerate(lst):
        if pred(i, v):
            return i
    return -1


def parse_thermal(nc):
    # index.html parseThermal
    low = [s.lower() for s in nc['names']]
    iT = _find(low, lambda i, n: jt(r'temp(?!o)|°\s*c\b|\(\s*°?c\s*\)|\[\s*°?c\s*\]|kelvin|\(k\)|\[k\]|\bts\b', n))
    if iT < 0:
        return None
    iHF = _find(low, lambda i, n: i != iT and jt(r'heat\s*-?flow|flusso|\bdsc\b|\bmw\b|mw\/mg|w\/g|µv|\buv\b|\bhf\b', n))
    iM = _find(low, lambda i, n: i != iT and i != iHF and jt(r'weight|mass|massa|peso|\btg\b|\btga\b|\bmg\b|%', n)
               and not jt(r'deriv|dtg|\/\s*min|\/\s*°?c|rate', n))
    if iHF < 0 and iM < 0:
        return None
    typ = 'tga' if iM >= 0 else 'dsc'
    iY = iM if typ == 'tga' else iHF
    iTime = _find(low, lambda i, n: i != iT and i != iY and jt(r'time|tempo|\bsec\b|\(s\)|\[s\]|\(min\)|\[min\]|^t\s*$', n))
    T = list(nc['cols'][iT])
    Y = list(nc['cols'][iY])
    if jt(r'kelvin|\(k\)|\[k\]', low[iT]):
        T = [v - 273.15 for v in T]
    t = None
    if iTime >= 0:
        tn, c = low[iTime], list(nc['cols'][iTime])
        span = abs(c[-1] - c[0])
        declared = 'min' if jt(r'min', tn) else 's' if jt(r'\bs\b|sec|\(s\)|\[s\]', tn) else None
        in_min = declared == 'min' or (not declared and span < 2000)
        if not declared and span > 0:
            dT = abs(T[-1] - T[0])
            as_min = dT / span
            as_sec = dT / span * 60
            if as_min < 0.5 and as_sec >= 0.5 and as_sec <= 200:
                in_min = False
            elif as_sec > 200 and as_min >= 0.5:
                in_min = True
        t = [v * 60 if in_min else v for v in c]
    y_unit = unit_of(nc['names'][iY]) or ('%' if typ == 'tga' and jt(r'%', low[iY]) else '')
    mass_mg, Yc = None, Y
    if typ == 'tga' and not jt(r'%', low[iY] + y_unit):
        k = max(1, js_round(len(Y) * 0.01))
        m0 = -INF
        for i in range(k):
            if Y[i] > m0:
                m0 = Y[i]
        if m0 > 0:
            mass_mg = m0
            Yc = [100 * v / m0 for v in Y]
    segs = thermal_segments(T)
    heats = [(s, i) for i, s in enumerate(segs) if s['dir'] > 0]
    seg = 0
    if typ == 'dsc' and len(heats) >= 2:
        seg = heats[-1][1]
    else:
        best = 0
        for i, s in enumerate(segs):
            if s['b'] - s['a'] > segs[best]['b'] - segs[best]['a']:
                best = i
        if heats:
            bo = heats[0]
            for o in heats[1:]:
                if o[0]['b'] - o[0]['a'] > bo[0]['b'] - bo[0]['a']:
                    bo = o
            seg = bo[1]
        else:
            seg = best
    raw = {'T': T, 'Y': Yc, 't': t, 'segs': segs}
    sl = thermal_slice(raw, seg)
    meta_txt = '\n'.join(nc['meta'])
    num = lambda v: to_num(str(v).replace(',', '.', 1))
    rate = None
    rm = jx(r'(?:heating|cooling|scan)?\s*rate[^0-9\n]{0,20}([\d.,]+)\s*(?:°\s*)?(?:c|k)\s*\/\s*min', meta_txt, 'i')
    if rm:
        rate = num(rm.group(1))
    mm = jx(r'(?:sample\s*(?:mass|weight|size)|massa(?:\s*del)?\s*campione|peso(?:\s*del)?\s*campione)[^0-9\n]{0,20}([\d.,]+)\s*mg', meta_txt, 'i')
    if mm and not mass_mg:
        mass_mg = num(mm.group(1))
    return {'xs': sl['xs'], 'ys': sl['ys'], 'meta': nc['meta'] + ['%s · colonne: %s' % (typ.upper(), ' | '.join(nc['names']))], 'pe': False, 'peX': '', 'peY': '',
            'thermal': {'type': typ, 'raw': raw, 'seg': seg, 'ts': sl['ts'], 'yName': nc['names'][iY], 'yUnit': y_unit, 'rate': rate, 'massMg': mass_mg, 'cols': nc['names']}}


def parse_epr_cols(nc):
    # index.html parseEPRCols
    low = [s.lower() for s in nc['names']]
    iB = _find(low, lambda i, n: jt(r'field|b_field|\bb\s*[\[(]\s*(g|gauss|mt|t)\s*[\])]|gauss|\[g\]|\(g\)|\[mt\]|\(mt\)|campo', n) and not jt(r'%', n))
    if iB < 0:
        return None
    iY = _find(low, lambda i, n: i != iB and jt(r'intens|signal|segnale|amplit|\bepr\b|\besr\b|value|\by\b', n))
    if iY < 0:
        iY = iB + 1 if iB + 1 < len(nc['cols']) else (0 if iB > 0 else -1)
    if iY < 0:
        return None
    u = low[iB]
    k = None
    if jt(r'gauss|\[g\]|\(g\)|\bg\s*$', u):
        k = 0.1
    elif jt(r'\[t\]|\(t\)|\/\s*t\s*$|tesla', u):
        k = 1000
    elif jt(r'\bmt\b', u):
        k = 1
    cb, cy = nc['cols'][iB], nc['cols'][iY]
    idx = sorted(range(len(cb)), key=cb.__getitem__)
    return {'xs': _fl(cb[i] * (k or 1) for i in idx), 'ys': _fl(cy[i] for i in idx), 'meta': nc['meta'] + ['EPR · colonne: ' + ' | '.join(nc['names'])],
            'pe': False, 'peX': '', 'peY': '', 'epr': {'unitK': k}}


# ============================== NMR TopSpin e JCAMP-DX ==============================
def parse_topspin(text):
    # index.html parseTopSpin
    L = jx(r'^#\s*LEFT\s*=\s*([-+\d.,eE]+)\s*ppm\.?\s*RIGHT\s*=\s*([-+\d.,eE]+)\s*ppm', text, 'mi')
    if not L:
        return None
    left, right = to_num(L.group(1)), to_num(L.group(2))
    if not math.isfinite(left) or not math.isfinite(right) or left == right:
        return None
    ys, meta = [], []
    for raw in lines_of(text):
        l = js_trim(raw)
        if not l:
            continue
        if l[0] == '#':
            if len(meta) < 200:
                meta.append(l)
            continue
        v = to_num(jsplit(r'\s+', l)[0])
        if math.isfinite(v):
            ys.append(v)
    if len(ys) < 16:
        return None
    n = len(ys)
    xs, Y = [0.0] * n, [0.0] * n
    for i in range(n):
        j = n - 1 - i
        xs[i] = left + (right - left) * j / (n - 1)
        Y[i] = ys[j]
    if xs[0] > xs[n - 1]:
        xs.reverse()
        Y.reverse()
    return {'xs': xs, 'ys': Y, 'meta': meta + ['NMR TopSpin (totxt)'], 'pe': False, 'peX': '', 'peY': '', 'nmr': {'fmt': 'TopSpin'}}


def jcamp_decode_line(line):
    # index.html jcampDecodeLine (AFFN, SQZ, DIF, DUP)
    SQZ, SQZn, DIF, DIFn, DUP = '@ABCDEFGHI', 'abcdefghi', '%JKLMNOPQR', 'jklmnopqr', 'STUVWXYZs'
    tk = []
    cur = [None]

    def push():
        c = cur[0]
        if c and c['s'] != '':
            c['v'] = js_parse_float(c['s'])
            if math.isfinite(c['v']):
                tk.append(c)
        cur[0] = None
    i, n = 0, len(line)
    while i < n:
        ch = line[i]
        if ch in SQZ:
            push()
            cur[0] = {'t': 'abs', 's': str(SQZ.index(ch))}
        elif ch in SQZn:
            push()
            cur[0] = {'t': 'abs', 's': '-' + str(SQZn.index(ch) + 1)}
        elif ch in DIF:
            push()
            cur[0] = {'t': 'dif', 's': str(DIF.index(ch))}
        elif ch in DIFn:
            push()
            cur[0] = {'t': 'dif', 's': '-' + str(DIFn.index(ch) + 1)}
        elif ch in DUP:
            push()
            cur[0] = {'t': 'dup', 's': str(DUP.index(ch) + 1)}
        elif ch in '0123456789.':
            if not cur[0]:
                cur[0] = {'t': 'abs', 's': ''}
            cur[0]['s'] += ch
        elif ch in 'Ee' and cur[0] and cur[0]['t'] == 'abs' and i + 1 < n and line[i + 1] in '+-0123456789':
            cur[0]['s'] += ch
            if line[i + 1] in '+-':
                i += 1
                cur[0]['s'] += line[i]
        elif ch in '+-':
            push()
            cur[0] = {'t': 'abs', 's': '-' if ch == '-' else ''}
        elif ch == '?':
            push()
            tk.append({'t': 'abs', 'v': NAN})
        else:
            push()
        i += 1
    push()
    if not tk:
        return None
    x, ys = tk[0]['v'], []
    last, last_t = None, 'abs'
    for t in tk[1:]:
        if t['t'] == 'abs':
            ys.append(t['v'])
            last, last_t = t['v'], 'abs'
        elif t['t'] == 'dif':
            ys.append((ys[-1] if ys else 0) + t['v'])
            last, last_t = t['v'], 'dif'
        elif t['t'] == 'dup' and last is not None:
            r = 1
            while r < t['v']:
                ys.append(ys[-1] + last if last_t == 'dif' else last)
                r += 1
    return {'x': x, 'ys': ys, 'endDif': last_t == 'dif'}


def parse_jcamp(text):
    # index.html parseJcamp
    if not jt(r'##\s*(TITLE|JCAMP)', js_slice(text, 0, 3000), 'i'):
        return None
    lines = lines_of(text)
    meta, H = [], {}
    mode, xs, ys, prev_dif, rows, y_bad = None, [], [], False, [], 0
    for i in range(len(lines)):
        l = lines[i]
        m = jx(r'^\s*##\s*([^=]+)=\s*(.*)$', l)
        if m:
            k = jsub(r'[\s_\-\/]', js_trim(m.group(1)).upper(), '', 'g')
            v = js_trim(m.group(2))
            if xs and (k == 'END' or jt(r'^(XYDATA|XYPOINTS|PEAKTABLE)$', k)):
                break
            if k == 'XYDATA' and jt(r'X\+\+\(Y\.\.Y\)', v, 'i'):
                mode = 'xyy'
                continue
            if (k == 'XYPOINTS' or k == 'PEAKTABLE') and jt(r'\(XY\.\.XY\)', v, 'i'):
                mode = 'xy'
                continue
            if k not in H:
                H[k] = v
            meta.append(js_trim(m.group(1)) + '=' + v)
            continue
        if not mode:
            continue
        t = js_trim(jsub(r'\$\$.*$', l, ''))
        if not t:
            continue
        if mode == 'xy':
            nums = [x for x in (js_number(s) for s in jsplit(r'[\s,;]+', t)) if math.isfinite(x)]
            q = 0
            while q + 1 < len(nums):
                xs.append(nums[q])
                ys.append(nums[q + 1])
                q += 2
            continue
        d = jcamp_decode_line(t)
        if not d:
            continue
        yy = d['ys']
        chk = prev_dif and len(yy) > 0
        if chk:
            pl = ys[-1] if ys else NAN
            if math.isfinite(pl) and math.isfinite(yy[0]) and abs(yy[0] - pl) > 1e-6 * max(1, abs(pl)):
                y_bad += 1
            yy = yy[1:]
        prev_dif = d['endDif']
        rows.append({'x': d['x'], 'n': len(yy), 'chk': chk})
        for v in yy:
            ys.append(v)
            xs.append(None)
    if not ys:
        return None

    def num(k):
        v = js_parse_float(str(H.get(k) or '').replace(',', '.', 1))
        return v if math.isfinite(v) else None
    xf = num('XFACTOR') or 1
    yf = num('YFACTOR') or 1
    jc_note, jc_bad = [], []
    Y = [v * yf for v in ys]
    if mode == 'xyy':
        n = len(Y)
        fx, lx, np0 = num('FIRSTX'), num('LASTX'), num('NPOINTS')
        np_ = np0 or n
        if fx is None or lx is None:
            return _empty_reject("File JCAMP senza ##FIRSTX o ##LASTX: non si può ricostruire l'asse X. Esporta di nuovo dallo strumento")
        step = (lx - fx) / ((np_ - 1) or 1)

        def k_of(r):
            # chiamata solo con step diverso da zero (come in JavaScript, dopo «step &&»)
            return js_round((r['x'] * xf - fx) / step) + (1 if r['chk'] else 0)
        line_x = bool(step) and bool(rows) and math.isfinite(rows[0]['x']) and k_of(rows[0]) == 0
        X, k, shifted = [], 0, 0
        for r in rows:
            at = k
            if line_x:
                kx = k_of(r)
                if math.isfinite(kx) and kx != k:
                    shifted += 1
                    at = kx
            for j in range(r['n']):
                X.append(fx + (at + j) * step)
            k = at + r['n']
        if shifted:
            jc_bad.append('JCAMP: in %s righe la X dichiarata non corrisponde al numero di punti letti (punti mancanti o in più nel file). Ho messo i valori alla X dichiarata da ogni riga: controlla il file' % js_str(shifted))
        if step and len(rows) > 1 and not line_x:
            jc_note.append("JCAMP: le X scritte all'inizio delle righe non corrispondono a ##FIRSTX; l'asse è ricostruito da FIRSTX, LASTX e dal numero di punti")
        if np0 and n != np0:
            jc_bad.append('JCAMP: il file dichiara %s punti (##NPOINTS) ma ne contiene %s: il file può essere troncato o rovinato' % (js_str(np0), js_str(n)))
    else:
        X = [v * xf for v in xs]
        np0 = num('NPOINTS')
        if np0 and len(X) != np0:
            jc_bad.append('JCAMP: il file dichiara %s punti (##NPOINTS) ma ne contiene %s: il file può essere troncato o rovinato' % (js_str(np0), js_str(len(X))))
    if y_bad:
        jc_bad.append('JCAMP: il controllo dei valori (ripetizione DIF) non torna in %s righe: il file è probabilmente rovinato e le intensità possono essere sbagliate' % js_str(y_bad))
    miss = sum(1 for v in Y if not math.isfinite(v))
    if miss:
        ok = [math.isfinite(v) and i < len(X) and math.isfinite(X[i]) for i, v in enumerate(Y)]
        X = [v for i, v in enumerate(X) if i < len(ok) and ok[i]]
        Y = [v for i, v in enumerate(Y) if ok[i]]
        jc_note.append('JCAMP: %s valori mancanti («?») tolti; gli altri punti restano alla loro X' % js_str(miss))
    jc_note += jc_bad
    xun = str(H.get('XUNITS') or '')
    sf = num('.OBSERVEFREQUENCY')
    dc = H.get('DATACLASS') or H.get('DATA CLASS')
    if not dc:
        mm = jx(r'##\s*DATA\s*CLASS\s*=\s*(\S+)', js_slice(text, 0, 2000), 'i')
        dc = mm.group(1) if mm else ''
    if jt(r'NTUPLES', str(dc or ''), 'i'):
        jc_note.append('JCAMP NTUPLES non è supportato: parte reale e immaginaria si mescolano e questi dati sono probabilmente sbagliati. Esporta lo spettro come testo o come JCAMP semplice')
    if jt(r'^\s*hz\s*$', xun, 'i'):
        if sf is not None and sf > 1 and sf < 3000:
            X = [v / sf for v in X]
            jc_note.append('Asse convertito da Hz a ppm con la frequenza di osservazione %s MHz' % js_str(sf))
        elif sf is not None:
            jc_note.append('Asse in Hz: frequenza di osservazione %s non plausibile in MHz, i valori non sono ppm' % js_str(sf))
        else:
            m = 'Asse in Hz senza la frequenza di osservazione (##.OBSERVE FREQUENCY): i valori non sono ppm e non si possono convertire. Riesporta lo spettro in ppm o con la frequenza'
            jc_note.append(m)
            jc_bad.append(m)
        if H.get('.SHIFTREFERENCE'):
            jc_note.append("Il file dichiara un riferimento dello spostamento chimico che non viene applicato: riferisci l'asse in «Dati dello spettro»")
    idx = sorted(range(len(X)), key=X.__getitem__)
    Xs = [float(X[k]) for k in idx]
    Ys = [float(Y[k]) if k < len(Y) else NAN for k in idx]
    meta += jc_note
    yu = str(H.get('YUNITS') or '')
    peY = 'T' if jt(r'transmit', yu, 'i') else 'A' if jt(r'absorb', yu, 'i') else ''
    meta.insert(0, '##JCAMP-DX file')
    return {'xs': Xs, 'ys': Ys, 'meta': meta, 'peY': peY, 'importNotes': jc_note, 'importBad': jc_bad}


# ============================== intestazioni ==============================
def header_field(meta, src, fl):
    # index.html headerField
    for l in meta:
        m = jx(src, l, fl)
        if m:
            return js_trim(m.group(1))
    return ''


def header_info(meta):
    # index.html headerInfo
    return {
        'type': header_field(meta, r'^#*\s*DATA\s*TYPE\s*[;:=,\t]\s*(.+)$', 'i'),
        'xu': header_field(meta, r'^#*\s*XUNITS\s*[;:=,\t]\s*(.+)$', 'i'),
        'yu': header_field(meta, r'^#*\s*YUNITS\s*[;:=,\t]\s*(.+)$', 'i') or header_field(meta, r'^(?:Photometric mode|Vertical axis)\s*[;:=,\t]\s*(.+)$', 'i'),
        'inst': header_field(meta, r'^(?:Instrument name|Model name|##?\s*SPECTROMETER\/DATA SYSTEM|Instrument)\s*[;:=,\t]\s*(.+)$', 'i'),
        'origin': header_field(meta, r'^#*\s*ORIGIN\s*[;:=,\t]\s*(.+)$', 'i')}


def header_cells(h):
    # index.html headerCells
    if '\t' in h:
        return [x for x in (js_trim(jsub(r'^"|"$', x, '', 'g')) for x in h.split('\t')) if x]
    if ';' in h:
        return [x for x in (js_trim(jsub(r'^"|"$', x, '', 'g')) for x in h.split(';')) if x]
    if ',' in h:
        out, cur, q = [], '', False
        for ch in h:
            if ch == '"':
                q = not q
                continue
            if ch == ',' and not q:
                out.append(js_trim(cur))
                cur = ''
            else:
                cur += ch
        out.append(js_trim(cur))
        return [x for x in out if x]
    return split_line(h) or []


def col_names_of(meta, n):
    # index.html colNamesOf
    for k in range(len(meta) - 1, max(0, len(meta) - 4) - 1, -1):
        h = jsub(r'^#\s*', str(meta[k]), '')
        t = header_cells(h)
        if len(t) == n and not any(math.isfinite(to_num(x)) for x in t):
            return [js_slice(x, 0, 30) for x in t]
    return None


def guess_ycol(meta, n_data):
    # index.html guessYCol
    for k in range(len(meta) - 1, max(0, len(meta) - 4) - 1, -1):
        h = jsub(r'^#\s*', meta[k], '')
        n = header_cells(h)
        if len(n) < 3 or (n_data and len(n) != n_data) or any(math.isfinite(to_num(t)) for t in n):
            continue
        j = _find(n, lambda i, t: i >= 1 and jt(r'^(value|signal|segnale|intensity|intensit|absorb|abs\b|mau|counts|y\b)', t, 'i'))
        if j > 1:
            return j
    return 1


# ============================== unità dell'asse X ==============================
def x_unit_fix(p):
    # index.html xUnitFix
    if (not p or p.get('xs') is None or len(p['xs']) < 5 or p.get('reject') or p.get('xrf') or p.get('nmr') or p.get('epr') or p.get('thermal')
            or p.get('pe') or p.get('iso') or p.get('chem')):
        return p
    meta = p.get('meta') or []
    head = '\n'.join(meta)
    cols = ''
    for l in reversed(meta[-4:]):
        if jt(r'[a-zµ]', l, 'i') and jt(r'[(\[]', l):
            cols = l
            break
    c0 = [t for t in (js_trim(t).lower() for t in jsplit(r'[\t;,]|\s{2,}', jsub(r'^#\s*', cols, ''))) if t]
    xh = (jsplit(r'[\t;,]|\s{2,}', jsub(r'^#\s*', cols, ''))[0] or '').lower()
    xu = str(header_info(meta)['xu'] or '').lower()
    if jt(r'[(\[]\s*ev\s*[)\]]', xh) or jt(r'^\s*ev\s*$', xu):
        unit = 'eV'
    elif jt(r'[(\[]\s*(µm|μm|um|micron[si]?)\s*[)\]]', xh) or jt(r'^\s*(µm|μm|um|microns?|micrometers?)\s*$', xu):
        unit = 'um'
    elif jt(r'[(\[]\s*nm\s*[)\]]', xh) or jt(r'^\s*(nm|nanometers?)\s*$', xu):
        unit = 'nm'
    else:
        unit = ''
    YR = r'absorb|assorb|transmit|trasmit|intens|counts|conteggi|mau|\bmv\b|signal|segnale|response|risposta'
    XR = r'wavenumber|numero d.onda|wavelength|lunghezza d.onda|\btime\b|\btempo\b|cm-1|cm\^-1|1\/cm|\bnm\b|\bmin\b|\bppm\b|\bkev\b|energy|energia|raman shift|shift'
    if len(c0) == 2 and jt(YR, c0[0]) and not jt(XR, c0[0]) and jt(XR, c0[1]):
        xs, ys = p['ys'], p['xs']
        idx = sorted(range(len(xs)), key=xs.__getitem__)
        p['xs'] = [xs[i] for i in idx]
        p['ys'] = [ys[i] for i in idx]
        p['importNotes'] = (p.get('importNotes') or []) + ['Le colonne erano invertite («%s» prima di «%s»): le ho scambiate' % (c0[0], c0[1])]
    if jt(r'2\s*-?\s*theta|2\s*θ|two.?theta|\bxrd\b|diffra', head, 'i'):
        n = 'Diffrattogramma di raggi X (2θ): la diffrazione non è tra le tecniche supportate. Grafico e posizioni dei picchi (in gradi) sono corretti, ma assegnazioni, ipotesi e controlli non valgono'
        p['unitInstr'] = 'gen'
        p['unitReason'] = 'diffrattogramma XRD (2θ): tecnica non supportata'
        p['importNotes'] = (p.get('importNotes') or []) + [n]
        p['importBad'] = (p.get('importBad') or []) + [n]
        return p
    if any(jt(r'^\W*(ret(ention)?\.?\s*time|time|tempo|rt|t_?r)\s*[(\[]\s*(s|sec|seconds?|secondi)\s*[)\]]', l, 'i')
           and (jt(r'^\W*(ret|rt\b|t_?r)', l, 'i') or jt(r'mau|\bmv\b|signal|segnale|response|value|intens|counts|dad|uv\b|fld|vwd', l, 'i')) for l in meta):
        p['xs'] = [v / 60 for v in p['xs']]
        p['unitInstr'] = 'hplc'
        p['unitReason'] = 'intestazione: tempo in secondi, convertito in minuti'
        p['importNotes'] = (p.get('importNotes') or []) + ["Tempo in secondi nell'intestazione: l'asse è stato convertito in minuti (÷ 60)"]
        return p
    cmU = jt(r'cm-1|cm\^-1|1\/cm|cm⁻¹|wavenumber', xh + ' ' + xu, 'i')
    if not unit and not cmU:
        return p
    lo, hi = INF, -INF
    for v in p['xs']:
        if v < lo:
            lo = v
        if v > hi:
            hi = v

    def conv(fn, instr, note, bad=False):
        X = [fn(v) for v in p['xs']]
        idx = sorted(range(len(X)), key=X.__getitem__)
        ys0 = p['ys']
        p['xs'] = [X[i] for i in idx]
        p['ys'] = [ys0[i] for i in idx]
        p['unitInstr'] = instr
        p['unitReason'] = note
        p['importNotes'] = (p.get('importNotes') or []) + [note]
        if bad:
            p['importBad'] = (p.get('importBad') or []) + [note]
        return p
    if cmU and lo >= 8000 and hi <= 100000 and not jt(r'raman|\bir\b|ftir|infrared', head, 'i'):
        return conv(lambda x: jdiv(1e7, x), 'uv', "Asse X in numeri d'onda oltre 8000 cm⁻¹ (UV-Vis): convertito in nm (λ = 10⁷ / ν̃)")
    if unit == 'eV' and lo > 0.3 and hi <= 15:
        return conv(lambda x: jdiv(1239.84, x), 'fluo' if jt(r'fluoresc|emission|emissione', head, 'i') else 'uv', 'Asse X in eV convertito in nm (λ = 1239,84 / E): i picchi sono in nm')
    if unit == 'um' and lo >= 1 and hi <= 60:
        return conv(lambda x: jdiv(1e4, x), 'raman' if jt(r'raman', head, 'i') else 'ftir', "Asse X in µm convertito in numero d'onda (cm⁻¹ = 10000 / λ)")
    if unit == 'nm' and jt(r'raman', head, 'i') and lo >= 200 and hi <= 1700:
        m = jx(r'(?:laser|excitation|eccitazione|λ0|lambda0)[^0-9\n]{0,25}(\d{3,4}(?:[.,]\d+)?)\s*nm', head, 'i')
        l0 = js_parse_float(m.group(1).replace(',', '.', 1)) if m else None
        if l0 and l0 == l0 and l0 < lo:
            return conv(lambda x: 1e7 / l0 - jdiv(1e7, x), 'raman', 'Asse Raman in nm assoluti convertito in spostamento Raman (cm⁻¹) con il laser a %s nm' % js_str(l0))
        p['unitInstr'] = 'gen'
        p['unitReason'] = 'Raman in nm assoluti'
        n = "Spettro Raman con l'asse in nm assoluti e senza la lunghezza d'onda del laser nell'intestazione (per esempio «Laser 785 nm»): non posso convertirlo in spostamento Raman (cm⁻¹). I numeri dei picchi sono lunghezze d'onda, non spostamenti"
        p['importNotes'] = (p.get('importNotes') or []) + [n]
        p['importBad'] = (p.get('importBad') or []) + [n]
        return p
    return p


# ============================== lettore dei file di testo ==============================
def parse_text(text, opt=None):
    """index.html parseText: tutto il lettore dei file di testo. opt: {ycol, keepOrder, keepLines} come nell'app.
    Restituisce il dict dell'app (xs, ys, meta, reject, …). Isoterme e chemisorbimento: NonTrascritto."""
    P = parse_text1(text, opt)
    if P and not P.get('reject') and P.get('xs') is not None and len(P['xs']) >= 2:
        lo, hi = INF, -INF
        for v in P['xs']:
            if v < lo:
                lo = v
            if v > hi:
                hi = v
        if not (hi > lo):
            return _empty_reject('La prima colonna (asse X) ha lo stesso valore in tutte le righe: non è un asse. Forse le colonne sono in un altro ordine o il file contiene una sola misura ripetuta', P.get('meta') or [])
    return P


def parse_text1(text, opt=None):
    # index.html parseText1: seconda colonna quasi costante → la terza
    P0 = x_unit_fix(parse_text0(text, opt))
    if not opt or opt.get('ycol') is None:
        try:
            if (P0 and (P0.get('nCols') or 0) > 2 and P0.get('ycol') == 1
                    and not (P0.get('colNames') and jt(r'mau|\bmv\b|signal|segnale|absorb|intens|counts|value', (P0['colNames'][1] if len(P0['colNames']) > 1 else None) or '', 'i'))
                    and len(P0['ys']) > 100 and len(set(P0['ys'])) <= 20):
                P1 = x_unit_fix(parse_text0(text, {'ycol': 2}))
                up = 0
                for i in range(1, len(P1['ys'])):
                    if P1['ys'][i] > P1['ys'][i - 1]:
                        up += 1
                if P1 and len(P1['ys']) >= 0.9 * len(P0['ys']) and len(set(P1['ys'])) > 50 and up < 0.95 * (len(P1['ys']) - 1):
                    P1['importNotes'] = (P1.get('importNotes') or []) + ['La seconda colonna è quasi costante: come Y ho usato la terza. Controlla in «Dati dello spettro»']
                    return P1
        except NonTrascritto:
            raise
        except Exception:
            pass
    return P0


def axis_step(xs, x):
    # index.html axisStep
    n = len(xs)
    span = xs[n - 1] - xs[0]
    d = js_sign(span)
    if not d or not math.isfinite(x):
        return 0
    a = abs(span)
    st = a / (n - 1)
    back = (xs[n - 1] - x) * d
    if back <= 0.5 * st:
        return 0
    return 2 if back > 10 * st and back > 0.2 * a else 1


def split_turn(xs):
    # index.html splitTurn
    n = len(xs)
    d0 = js_sign(xs[1] - xs[0]) or js_sign(xs[2] - xs[0])
    if not d0:
        return -1
    t = 1
    while t < n and (xs[t] - xs[t - 1]) * d0 >= 0:
        t += 1
    if t > 2 and xs[t - 1] == xs[t - 2] and (t >= n or xs[t] != xs[t - 1]):
        t -= 1
    if t < 10 or n - t < 10:
        return -1
    for i in range(t + 1, n):
        if (xs[i] - xs[i - 1]) * d0 > 0:
            return -1
    a0, a1 = min(xs[0], xs[t - 1]), max(xs[0], xs[t - 1])
    b0, b1 = min(xs[t], xs[n - 1]), max(xs[t], xs[n - 1])
    ov = min(a1, b1) - max(a0, b0)
    return t if ov > 0.5 * min(a1 - a0, b1 - b0) else -1


def one_way_axis(hdr):
    # index.html oneWayAxis
    xu = header_info(hdr)['xu']
    h = ''
    for l in reversed(hdr):
        if len(header_cells(jsub(r'^#\s*', str(l), ''))) >= 2:
            h = l
            break
    hc = header_cells(jsub(r'^#\s*', str(h), ''))
    x = (xu or (hc[0] if hc else '') or '').lower()
    if not x or jt(r'potential|potenzial|voltage|tensione|temperat|°c|\bk\b|field|campo|gauss|\bmt\b|\bv\b', x):
        return False
    return jt(r'time|tempo|\bmin|\bsec|\bs\b|\brt\b|retention|ritenzion|wavenumber|numero d.onda|cm-1|cm⁻¹|1\/cm|shift|spostamento|wavelength|lunghezza d.onda|\bnm\b|theta|θ|ppm|energ|kev|\bev\b', x)


def _new_b(h=None):
    return {'xs': [], 'ys': [], 'li': [], 'extra': 0, 'textBefore': 0, 'hdr': h if h is not None else [],
            'cols': [{'dot': 0, 'int': 0, 'other': 0}, {'dot': 0, 'int': 0, 'other': 0}]}


_THOU = jsre(r'^[-+]?(\d{1,3}(\.\d{3})+,\d+|\d{1,3}(\.\d{3}){2,}|\d{1,3}(,\d{3})+\.\d+)$')
_DOT3 = jsre(r'^[-+]?[1-9]\d{0,2}\.\d{3}$')
_COMMA3 = jsre(r'^[-+]?[1-9]\d{0,2},\d{3}$')
_COMMA = jsre(r'^[-+]?\d+,\d+$')
_NTUPLES = r'##\s*(NTUPLES|DATA\s*CLASS\s*=\s*NTUPLES)'


def _first_or(a, k, d):
    return a[k] if 0 <= k < len(a) else d


def parse_text0(text, opt=None):
    # index.html parseText0: JCAMP, TopSpin, isoterme, colonne con nome, XRF, poi blocchi di numeri
    opt = opt or {}
    if jt(_NTUPLES, js_slice(text, 0, 4000), 'i'):
        return _empty_reject('JCAMP NTUPLES non è supportato: esporta lo spettro come testo o come JCAMP semplice')
    jc = parse_jcamp(text)
    if jc:
        return jc
    ts = parse_topspin(text)
    if ts:
        return ts
    if sorp_may_match(text):
        raise NonTrascritto(tt('lettore delle isoterme e del chemisorbimento (sorpParse, app/sorption-core.js) non trascritto: il file potrebbe esserlo', 'reader of isotherms and chemisorption (sorpParse, app/sorption-core.js) not transcribed: the file may be one'))
    nc = parse_named_columns(text)
    if nc:
        th = parse_thermal(nc)
        if th:
            return th
        ep = parse_epr_cols(nc)
        if ep:
            return ep
    xr = parse_xrf(text)
    if xr:
        return xr
    lines = lines_of(text)
    meta = []
    start, pe, peX, peY = 0, False, '', ''
    first = js_trim(lines[0] if lines else '')
    iData = _find(lines, lambda i, l: js_trim(l) == '#DATA')
    peT = jx(r'^PE\s*(IR|UV|FL)', first, 'i')
    if peT or (iData >= 0 and any(js_trim(l) == '#GR' for l in lines)):
        pe = peT.group(1).upper() if peT else 'IR'
        gi = _find(lines, lambda i, l: js_trim(l) == '#GR')
        if gi >= 0:
            peX = js_trim(_first_or(lines, gi + 1, ''))
            peY = js_trim(_first_or(lines, gi + 2, ''))
        start = iData + 1 if iData >= 0 else 0
        for i in range(start):
            meta.append(lines[i])
    tail = []
    extra_cols = dropped = pending = head_bad = thou = after = 0
    mid_text = False
    first_data = None
    for l in lines[start:]:
        t = js_trim(l)
        if t and parse_line(t, 1):
            first_data = t
            break
    if opt.get('ycol'):
        ycol = opt['ycol']
    else:
        if first_data is None:
            end = -1
        else:
            tgt = next(l for l in lines[start:] if js_trim(l) == first_data)
            end = lines.index(tgt)
        hh = [x for x in (js_trim(l) for l in lines[start:end]) if x]
        ycol = guess_ycol(meta + hh, len(split_line(first_data) or []) if first_data is not None else 0)
    blocks = []
    cur = _new_b()

    def lead(r):
        return 1 if jt(r'^\t|^\s*[,;]', r) else 0

    def inner_empty(l):
        sep = '\t' if '\t' in l else ';' if ';' in l else ',' if (not RE_WS1.search(l) and ',' in l) else None
        if not sep:
            return 0
        q = csv_split(l) if sep == ',' and '"' in l else l.split(sep)
        n = 0
        for k in range(1, min(len(q) - 1, ycol + 1)):
            if not js_trim(q[k]):
                n += 1
        return n
    ntok0 = None
    cnt, nt = {}, {}
    i, n = start, 0
    while i < len(lines) and n < 400:
        l = js_trim(lines[i])
        if l and parse_line(l, ycol):
            g = inner_empty(l) + 10 * lead(lines[i])
            cnt[g] = cnt.get(g, 0) + 1
            if not jt(r'[\t;,]', l):
                k = len(split_line(l) or [])
                nt[k] = nt.get(k, 0) + 1
            n += 1
        i += 1
    # Object.entries con chiavi intere: in ordine crescente; sort stabile per conteggio decrescente
    e = sorted(sorted(cnt.items()), key=lambda kv: -kv[1])
    gap0 = e[0][0] if e else 0
    t2 = sorted(sorted(nt.items()), key=lambda kv: -kv[1])
    ntok0 = t2[0][0] if t2 else None

    def unq(s):
        return js_trim(str(s).replace('"', ''))
    for i in range(start, len(lines)):
        l = js_trim(lines[i])
        if not l:
            continue
        tk = split_line(l) or []
        p = parse_line(l, ycol)
        if p and inner_empty(l) + 10 * lead(lines[i]) != gap0:
            p = None
        if p and ntok0 and not jt(r'[\t;,]', l) and len(tk) < ntok0:
            p = None
        if not p and jt(r'^"?[^\d+\-.",;\t]', l):
            if len(cur['xs']) >= 3:
                blocks.append(cur)
                cur = _new_b()
            elif cur['xs']:
                if blocks:
                    after += len(cur['xs'])
                cur = _new_b(cur['hdr'])
            if len(cur['hdr']) < 60:
                cur['hdr'].append(l)
            if blocks:
                cur['textBefore'] += 1
                if len(tail) < 120:
                    tail.append(l)
            else:
                meta.append(l)
            pending = 0
            continue
        if len(cur['xs']) >= 3 and len(tk) > 1:
            if any(_THOU.search(t) for t in tk) or (any(_COMMA.search(t) for t in tk) and any(_DOT3.search(t) for t in tk)):
                thou += 1
            if not jt(r'[\t;\s]', l) and any(k >= 2 and jt(r'^\d{3}$', t) and jt(r'^\d{1,3}$', tk[k - 1]) for k, t in enumerate(tk)):
                thou += 1
        if len(cur['xs']) >= 3 and not p and (jt(r'^"?[-+]?\d', l) or jt(r'^[,;]\s*[-+]?\d', l)):
            pending += 1
        if p and len(cur['xs']) >= 2 and not cur.get('rev'):
            cx = cur['xs']
            last = cx[-1]
            st = abs(last - cx[0]) / (len(cx) - 1)

            def near(u, v, s):
                return abs(u - v) <= max(0.02 * max(abs(u), abs(v)), 2.5 * s)
            xt = unq(tk[0] if tk else '')
            th = lambda t: bool(_DOT3.search(t) or _COMMA3.search(t))
            r = axis_step(cx, p[0])
            if r == 2 and ((th(xt) and near(p[0] * 1000, last, st)) or (th(cur.get('lastXt') or '') and near(p[0], last * 1000, 1000 * st))):
                r = 1
            if r == 2 and len(cx) >= 3:
                blocks.append(cur)
                cur = _new_b()
            elif r:
                cur['rev'] = True
        if p:
            dropped += pending
            pending = 0
            if len(cur['xs']) == 2:
                dropped += head_bad
                head_bad = 0
            for k, c in enumerate([0, ycol]):
                t = unq(tk[c] if c < len(tk) else '')
                C = cur['cols'][k]
                if _DOT3.search(t):
                    C['dot'] += 1
                elif _COMMA3.search(t):
                    C['com'] = C.get('com', 0) + 1
                elif jt(r'^[-+]?\d{3,}$', t):
                    C['int'] += 1
                elif jt(r'[.,]', t):
                    C['other'] += 1
                    if '.' in t:
                        C['pd'] = C.get('pd', 0) + 1
                    if ',' in t:
                        C['pc'] = C.get('pc', 0) + 1
            cur['xs'].append(p[0])
            cur['ys'].append(p[1])
            cur['li'].append(i)
            cur['lastXt'] = unq(tk[0] if tk else '')
            if len(cur['xs']) == 3:
                cur['extra'] = max(0, sum(1 for t in tk if jt(r'^"?[-+]?[\d.,]+([eE][-+]?\d+)?"?$', t)) - 2)
        elif len(cur['xs']) < 3:
            if (jt(r'^"?[-+]?\d', l) and jt(r'[\t;,]', l) and not p
                    and jcount(r'(^|[\t;,\s"])[-+]?\d+([.,]\d+)?([eE][-+]?\d+)?(?=$|[\t;,\s"])', l) >= 2):
                head_bad += 1
            if cur['xs']:
                cur = _new_b()
            if blocks:
                if len(tail) < 120:
                    tail.append(l)
            else:
                meta.append(l)
        elif len(tail) < 120:
            tail.append(l)
    if len(cur['xs']) >= 3 or not blocks:
        blocks.append(cur)
    else:
        after += len(cur['xs'])
    k = 0
    while k < len(blocks):
        q = blocks[k]
        if not q.get('rev') or len(q['xs']) < 20:
            k += 1
            continue
        t = split_turn(q['xs'])
        if t < 0 or not one_way_axis(q['hdr'] if q['hdr'] else meta):
            k += 1
            continue
        r = _new_b(q['hdr'])
        r['xs'], q['xs'] = q['xs'][t:], q['xs'][:t]
        r['ys'], q['ys'] = q['ys'][t:], q['ys'][:t]
        r['li'], q['li'] = q['li'][t:], q['li'][:t]
        r['extra'] = q['extra']
        r['cols'] = [dict(c) for c in q['cols']]
        q['rev'] = False
        blocks.insert(k + 1, r)
        k += 2
    main_ix = 0
    for kk, q in enumerate(blocks):
        if len(q['xs']) > len(blocks[main_ix]['xs']):
            main_ix = kk
    M = blocks[main_ix]
    mx = M['xs']
    if mx:
        dir_ = js_sign(mx[-1] - mx[0]) or 1
        lo, hi = min(mx[0], mx[-1]), max(mx[0], mx[-1])
    else:
        dir_, lo, hi = 1, NAN, NAN
    xs, ys, lis = list(mx), list(M['ys']), list(M['li'])
    extra_cols = M['extra']
    step_m = (hi - lo) / max(1, len(mx) - 1)
    left = [kk for kk in range(len(blocks)) if kk != main_ix]
    grew = True
    while grew:
        grew = False
        t = 0
        while t < len(left):
            q = blocks[left[t]]
            if len(q['xs']) < 3:
                t += 1
                continue
            qlo, qhi = arr_min(q['xs']), arr_max(q['xs'])
            step_q = (qhi - qlo) / max(1, len(q['xs']) - 1)
            gap = qlo - hi if qlo > hi else lo - qhi if qhi < lo else -1
            if gap >= 0 and gap <= 4 * step_m and (q['xs'][-1] - q['xs'][0]) * dir_ > 0 and step_q < 3 * step_m and step_m < 3 * step_q:
                for u, v in enumerate(q['xs']):
                    xs.append(v)
                    ys.append(q['ys'][u])
                    lis.append(q['li'][u])
                lo, hi = min(lo, qlo), max(hi, qhi)
                mid_text = True
                for u, C in enumerate(M['cols']):
                    D = q['cols'][u]
                    C['dot'] += D['dot']
                    C['com'] = C.get('com', 0) + D.get('com', 0)
                    C['int'] += D['int']
                    C['other'] += D['other']
                    C['pd'] = C.get('pd', 0) + D.get('pd', 0)
                    C['pc'] = C.get('pc', 0) + D.get('pc', 0)
                del left[t]
                grew = True
                continue
            t += 1
    channel, after_ch = False, 0
    chK = [main_ix]
    for kk in left:
        q = blocks[kk]
        after += len(q['xs'])
        if len(q['xs']) >= 0.5 * len(xs) and arr_min(q['xs']) <= hi and arr_max(q['xs']) >= lo:
            channel = True
            after_ch += len(q['xs'])
            chK.append(kk)
    chK.sort()
    cols = M['cols']
    idx = sorted(range(len(xs)), key=xs.__getitem__)
    X = [float(xs[kk]) for kk in idx]
    Y = [float(ys[kk]) for kk in idx]
    for c in cols:
        if c['dot'] and c['int'] and not c['other']:
            thou += c['dot']
        if c.get('com') and c['int'] and not c['other']:
            thou += c['com']
    c, o = cols[0], cols[1]
    only = not c['int'] and not c['other']
    if only and c.get('com') and not c['dot'] and o.get('pd') and not o.get('pc') and not o.get('com'):
        thou += c['com']
    elif only and c['dot'] and not c.get('com') and o.get('pc') and not o.get('pd') and not o['dot']:
        thou += c['dot']
    R = {'xs': X, 'ys': Y, 'meta': meta + tail, 'pe': pe, 'peX': peX, 'peY': peY, 'extraCols': extra_cols,
         'importIssue': {'dropped': dropped, 'thou': thou, 'after': after, 'midText': mid_text, 'channel': channel, 'total': len(xs) + dropped}
         if (dropped or thou or after or mid_text) else None,
         'afterCh': after_ch, 'nCols': extra_cols + 2, 'ycol': ycol, 'colNames': col_names_of(meta, extra_cols + 2), 'blockHead': M['hdr'],
         'blockIx': main_ix, 'nBlocks': len(blocks), 'chIx': chK.index(main_ix), 'nChan': len(chK),
         'chSpans': [{'l0': blocks[kk]['li'][0], 'l1': blocks[kk]['li'][-1], 'hdr': blocks[kk]['hdr'][:60], 'n': len(blocks[kk]['xs'])} for kk in chK]
         if len(chK) > 1 and not mid_text else None}
    if opt.get('keepOrder'):
        R['order'] = idx
    if opt.get('keepLines'):
        R['lines'] = lis
    return R


# ============================== binari: Thermo OMNIC .spa e Bruker OPUS ==============================
class _DV:
    # DataView: letture con il controllo dei limiti di JavaScript
    def __init__(self, b):
        self.b = b
        self.n = len(b)

    def _g(self, fmt, off, size):
        if off < 0 or off + size > self.n:
            raise _RangeError('Offset is outside the bounds of the DataView')
        return struct.unpack_from(fmt, self.b, off)[0]

    def u8(self, o):
        return self._g('B', o, 1)

    def u16(self, o, le=True):
        return self._g('<H' if le else '>H', o, 2)

    def i16(self, o, le=True):
        return self._g('<h' if le else '>h', o, 2)

    def u32(self, o, le=True):
        return self._g('<I' if le else '>I', o, 4)

    def i32(self, o, le=True):
        return self._g('<i' if le else '>i', o, 4)

    def f32(self, o, le=True):
        return self._g('<f' if le else '>f', o, 4)

    def f64(self, o, le=True):
        return self._g('<d' if le else '>d', o, 8)


def parse_spa(buf):
    # index.html parseSPA
    dv, n = _DV(buf), len(buf)
    if n < 400:
        return None
    info = data = None
    title = ''
    i = 30
    while i < 286 and i < n:
        c = dv.u8(i)
        if not c:
            break
        title += chr(c)
        i += 1
    pos = 304
    while pos + 16 <= n and pos < 304 + 16 * 200:
        key = dv.u8(pos)
        if key == 2:
            info = dv.u32(pos + 2)
        elif key == 3:
            data = {'off': dv.u32(pos + 2), 'size': dv.u32(pos + 6)}
        elif key == 0 or key == 1:
            if info is not None and data:
                break
        pos += 16
    if info is None or not data or info + 24 > n or data['off'] + data['size'] > n:
        return None
    np_, xu, yu = dv.u32(info + 4), dv.u32(info + 8), dv.u32(info + 12)
    fx, lx = dv.f32(info + 16), dv.f32(info + 20)
    m = min(np_, data['size'] // 4)
    if not (m > 10) or not math.isfinite(fx) or not math.isfinite(lx) or fx == lx:
        return None
    xs, ys = [0.0] * m, [0.0] * m
    for i in range(m):
        xs[i] = fx + (lx - fx) * i / (m - 1)
        ys[i] = dv.f32(data['off'] + 4 * i)
    if not all(math.isfinite(v) for v in ys):
        return None
    if xs[0] > xs[m - 1]:
        xs.reverse()
        ys.reverse()
    ylab = {17: 'ABSORBANCE', 16: 'TRANSMITTANCE', 11: 'REFLECTANCE', 15: 'SINGLE BEAM', 31: 'KUBELKA-MUNK', 22: 'RAMAN INTENSITY'}.get(yu, '')
    meta = [x for x in ['Thermo OMNIC .spa', '##TITLE=' + title if title else '', '##XUNITS=1/CM' if xu == 1 else '', '##YUNITS=' + ylab if ylab else ''] if x]
    return {'xs': xs, 'ys': ys, 'meta': meta, 'peY': 'T' if ylab == 'TRANSMITTANCE' else 'A' if ylab == 'ABSORBANCE' else ''}


def parse_opus(buf):
    # index.html parseOPUS
    dv, n = _DV(buf), len(buf)
    if n < 600 or dv.u32(0) != 0xFEFE0A0A:
        return None
    blocks = []
    c = 24
    while c + 12 <= min(n, 504):
        off = dv.i32(c + 8)
        if off <= 0:
            break
        blocks.append({'type': dv.u8(c), 'chan': dv.u8(c + 1), 'text': dv.u8(c + 2), 'len': dv.i32(c + 4) * 4, 'off': off})
        c += 12

    def params(b):
        P = {}
        p = b['off']
        end = min(n, b['off'] + b['len'])
        while p + 8 <= end:
            name = chr(dv.u8(p)) + chr(dv.u8(p + 1)) + chr(dv.u8(p + 2))
            if name == 'END' or not jt(r'^[A-Z0-9]{3}$', name):
                break
            t, sz = dv.u16(p + 4), dv.u16(p + 6) * 2
            v = p + 8
            if v + sz > n:
                break
            if t == 0:
                P[name] = dv.i32(v)
            elif t == 1:
                P[name] = dv.f64(v)
            else:
                s = ''
                for k in range(sz):
                    ch = dv.u8(v + k)
                    if not ch:
                        break
                    s += chr(ch)
                P[name] = s
            p = v + sz
        return P
    for want in (15, 7, 11):
        d = next((b for b in blocks if b['type'] == want and b['len'] > 0), None)
        pb = d and next((b for b in blocks if b['type'] == want + 16 and b['chan'] == d['chan']), None)
        if not d or not pb:
            continue
        P = params(pb)
        np_, fx, lx = P.get('NPT'), P.get('FXV'), P.get('LXV')
        if any(isinstance(v, str) for v in (np_, fx, lx, P.get('CSF'))):
            raise NonTrascritto(tt('OPUS con NPT, FXV, LXV o CSF scritti come testo: JavaScript li convertirebbe in modo non trascritto', 'OPUS with NPT, FXV, LXV or CSF written as text: JavaScript would convert them in a way not transcribed'))
        csf = 1 if P.get('CSF') is None else js_or1(P['CSF'])
        if not (np_ is not None and np_ > 10) or not fin_n(fx) or not fin_n(lx) or d['off'] + 4 * np_ > n:
            continue
        if np_ != int(np_):
            raise NonTrascritto(tt('OPUS con NPT non intero non trascritto', 'OPUS with non-integer NPT not transcribed'))
        np_ = int(np_)
        xs, ys = [0.0] * np_, [0.0] * np_
        for i in range(np_):
            xs[i] = fx + (lx - fx) * i / (np_ - 1)
            ys[i] = dv.f32(d['off'] + 4 * i) * csf
        if not all(math.isfinite(v) for v in ys):
            continue
        if xs[0] > xs[np_ - 1]:
            xs.reverse()
            ys.reverse()
        dxu = P.get('DXU')
        dxu = '' if (dxu is None or dxu == '' or (not isinstance(dxu, str) and (dxu != dxu or dxu == 0))) else (dxu if isinstance(dxu, str) else js_str(dxu))
        meta = [x for x in ['Bruker OPUS', '##DATA TYPE=INFRARED SPECTRUM', '##XUNITS=1/CM' if (jt(r'WN', dxu, 'i') or not dxu) else '##XUNITS=' + dxu,
                            '' if want == 15 else '##YUNITS=SINGLE BEAM'] if x]
        return {'xs': [float(v) for v in xs], 'ys': [float(v) for v in ys], 'meta': meta, 'peY': ''}
    return None


def parse_binary(buf, name):
    # index.html parseBinary
    if jt(r'\.spa$', name, 'i'):
        return parse_spa(buf)
    if len(buf) > 4 and struct.unpack_from('<I', buf, 0)[0] == 0xFEFE0A0A:
        return parse_opus(buf)
    return None


def parse_bytes(raw, nome, opt=None):
    """Come il caricamento di un file a un solo spettro in index.html: parseBinary(buf, nome) || parseText(decodeBuffer(buf), opt).
    raw: bytes del file; nome: nome del file (serve l'estensione). Restituisce il dict dell'app."""
    raw = bytes(raw)
    if jt(r'\.xlsx$', nome, 'i'):
        raise NonTrascritto(tt('cartelle di Excel (.xlsx): l\'app le legge con xlsxParse e SorpCore (solo isoterme e chemisorbimento), non trascritto', 'Excel workbooks (.xlsx): the app reads them with xlsxParse and SorpCore (isotherms and chemisorption only), not transcribed'))
    if jt(r'\.opju?$', nome, 'i'):
        raise NonTrascritto(tt('progetti Origin (.opj, .opju): l\'app li legge con app/origin-core.js, non trascritto', 'Origin projects (.opj, .opju): the app reads them with app/origin-core.js, not transcribed'))
    p = parse_binary(raw, nome)
    if p is None:
        p = parse_text(decode_buffer(raw), opt)
    return p


# ============================== canali HPLC: app/channels-core.js (AcchChannels) ==============================
def _cnum(s):
    # channels-core num
    v = js_parse_float((s if isinstance(s, str) else ('undefined' if s is None else js_str(s))).replace(',', '.', 1))
    return v if math.isfinite(v) else None


def _ok_wl(v):
    return v is not None and v >= 190 and v <= 1100


def fmt_n(v):
    # channels-core fmtN: String(+(+v).toPrecision(6))
    return num_prec(float(v), 6)


def _ge0(v):
    # v>=0 di JavaScript: null vale 0
    return (0 if v is None else v) >= 0


def det_of(t):
    # channels-core detOf
    d, sc = '', 0
    for m in jsre(r'(?<![A-Za-z0-9])(DAD|MWD|VWD|FLD|RID|ELSD|PDA|ADC|CAD|TUV)(?:[\s_-]?(\d)(?!\d))?(?:[\s_-]?([A-H])(?![A-Za-z]))?', 'i').finditer(t):
        nx = t[m.end():]
        gen = not m.group(2) and not m.group(3)
        if jt(r'^[A-Za-z]', nx) and not jt(r'^Ch', nx, 'i'):
            continue
        if gen and jt(r'^\d', nx):
            continue
        if m.group(3) and not m.group(2) and jt(r'^\d', nx):
            continue
        k = (1 if m.group(2) else 0) + (1 if m.group(3) else 0) + 1
        if gen and jt(r'^(DAD|MWD|VWD|PDA|TUV)$', m.group(1), 'i'):
            k = 0
        if k > sc:
            sc = k
            d = (m.group(1) + (m.group(2) or '') + (m.group(3) or '')).upper()
    m = jx(r'(?<![A-Za-z0-9])(PDA|TUV|UV|2998|2996|2489|2487|W2489|W2998)\s*Ch(?:annel)?\s*([1-9A-D])(?![A-Za-z0-9])', t, 'i')
    if m:
        d = m.group(1).upper() + ' Ch' + m.group(2).upper()
    if not d:
        m = jx(r'(?<![A-Za-z0-9])UV[_ ]?VIS[_ ]?(\d)(?![0-9])', t, 'i')
        if m:
            d = 'UV_VIS_' + m.group(1)
    if not d:
        m = jx(r'(?<![A-Za-z])Det(?:ector)?\s+([A-Z])(?![a-z])(?:[\s_-]*Ch\s?(\d))?', t, 'i')
        if m:
            d = 'Det ' + m.group(1).upper() + ('-Ch' + m.group(2) if m.group(2) else '')
    if not d:
        m = jx(r'(?<![A-Za-z0-9])Ch(?:annel)?[\s_]?([A-D1-9])(?![A-Za-z0-9])', t, 'i')
        if m:
            d = 'Ch' + m.group(1).upper()
    if not d and jt(r'^\s*UV(?![A-Za-z])', t):
        d = 'UV'
    return d


def _wl_loose(s):
    # /(?<![\d.,]|\d\s*(?:[-–~]|to)\s*|(?:ex|em)\s*)(\d{3}(?:[.,]\d+)?)\s?nm(?![a-z])(?!\s*(?:[-–~]|to)\s*\d)/i
    # il lookbehind a lunghezza variabile si controlla a mano, posizione per posizione come fa JavaScript
    body = jsre(r'(\d{3}(?:[.,]\d+)?)\s?nm(?![a-z])(?!\s*(?:[-–~]|to)\s*\d)', 'i')
    lb1 = jsre(r'[\d.,]$')
    lb2 = jsre(r'\d\s*(?:[-–~]|to)\s*$', 'i')
    lb3 = jsre(r'(?:ex|em)\s*$', 'i')
    for p in range(len(s) + 1):
        m = body.match(s, p)
        if not m:
            continue
        pre = s[:p]
        if lb1.search(pre) or lb2.search(pre) or lb3.search(pre):
            continue
        return m
    return None


def ch_parse_channel(text):
    # channels-core parseChannel
    t = text if isinstance(text, str) else str(text or '')
    o = {'det': det_of(t), 'wl': None, 'bw': None, 'ref': None, 'ex': None, 'em': None, 'extracted': jt(r'\bextracted\b', t, 'i')}
    m = jx(r'Sig\s*=\s*(\d{3}(?:\.\d+)?)(?:\s*,\s*(\d+(?:\.\d+)?))?', t, 'i')
    if m:
        o['wl'] = _cnum(m.group(1))
        if m.group(2) is not None:
            o['bw'] = _cnum(m.group(2))
    m = jx(r'Ref\s*=\s*(off|(\d{3}(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?))', t, 'i')
    if m:
        o['ref'] = 'off' if jt(r'off', m.group(1), 'i') else {'wl': _cnum(m.group(2)), 'bw': _cnum(m.group(3))}
    m = jx(r'\bref\s+(off|(\d{3}(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*nm)', t, 'i')
    if m and not o['ref']:
        o['ref'] = 'off' if jt(r'off', m.group(1), 'i') else {'wl': _cnum(m.group(2)), 'bw': _cnum(m.group(3))}
    m = jx(r'\bEx(?:citation)?\s*[=:]?\s*(\d{3}(?:[.,]\d+)?)', t, 'i')
    if m:
        o['ex'] = _cnum(m.group(1))
    m = jx(r'\bEm(?:ission)?\s*[=:]?\s*(\d{3}(?:[.,]\d+)?)', t, 'i')
    if m:
        o['em'] = _cnum(m.group(1))
    if o['wl'] is None:
        m = jx(r'(\d{3}(?:\.\d+)?)\s*nm\s*@\s*(\d+(?:[.,]\d+)?)\s*nm', t, 'i')
        if m:
            o['wl'] = _cnum(m.group(1))
            o['bw'] = _cnum(m.group(2))
    if o['wl'] is None:
        no_ref = jsub(r'Ref\s*=\s*\d+\s*,\s*\d+', jsub(r'\bref\s+\d{3}(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?\s*nm', t, '', 'ig'), '', 'ig')
        m = jx(r'(?<![\d.,])(\d{3}(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*nm', no_ref, 'i')
        if m:
            o['wl'] = _cnum(m.group(1))
            o['bw'] = _cnum(m.group(2))
        else:
            m = jx(r'(?:Wavelength|Lambda|λ)\s*(?:\(nm\))?\s*[:=\t ]\s*(\d{3}(?:[.,]\d+)?)', no_ref, 'i')
            if m:
                o['wl'] = _cnum(m.group(1))
            else:
                m = _wl_loose(no_ref)
                if m:
                    o['wl'] = _cnum(m.group(1))
    if o['em'] is not None and o['ex'] is not None:
        o['wl'] = o['bw'] = None
    if not _ok_wl(o['wl']):
        o['wl'] = o['bw'] = None
    if o['bw'] is not None and not (o['bw'] >= 0 and o['bw'] <= 400):
        o['bw'] = None
    if o['ref'] and o['ref'] != 'off' and not (_ok_wl(o['ref']['wl']) and _ge0(o['ref']['bw'])):
        o['ref'] = None
    return o


def ch_format_channel(o):
    # channels-core formatChannel
    if not o:
        return ''
    p = []
    if o.get('det'):
        p.append(o['det'])
    if o.get('ex') is not None and o.get('em') is not None:
        p.append('ex %s nm em %s nm' % (fmt_n(o['ex']), fmt_n(o['em'])))
    elif o.get('wl') is not None:
        p.append(fmt_n(o['wl']) + ('/' + fmt_n(o['bw']) if o.get('bw') is not None else '') + ' nm')
    if o.get('ref') == 'off':
        p.append('ref off')
    elif o.get('ref'):
        p.append('ref %s/%s nm' % (fmt_n(o['ref']['wl']), fmt_n(o['ref']['bw'] if o['ref']['bw'] is not None else 0)))
    if o.get('extracted'):
        p.append('extracted')
    return ' '.join(p)


def short_label(o):
    # channels-core shortLabel
    if not o:
        return ''
    w = o['em'] if o.get('em') is not None else o.get('wl')
    return ' '.join(x for x in [o.get('det'), fmt_n(w) + ' nm' if w is not None else ''] if x)


def canon_channel(t):
    return ch_format_channel(ch_parse_channel(t))


def _latin1(u8, a, b):
    return ''.join(chr(c) for c in u8[a:min(b, len(u8))]) if b > a else ''


def _pstr(u8, off, wide):
    # channels-core pstr (stringa Pascal, UTF-16 o latin1)
    if off >= len(u8):
        return ''
    n = u8[off]
    if wide:
        s = ''
        for i in range(n):
            p = off + 1 + 2 * i
            if p + 1 >= len(u8):
                break
            s += chr(u8[p] | (u8[p + 1] << 8))
    else:
        s = _latin1(u8, off + 1, off + 1 + n)
    return js_trim(jsub(r'\0+$', s, ''))


def agilent_version(u8):
    # channels-core agilentVersion
    if len(u8) == 0:
        return ''
    n = u8[0]
    if not (1 <= n <= 3) or len(u8) < 0x200:
        return ''
    v = _latin1(u8, 1, 1 + n)
    return v if jt(r'^\d+$', v) else ''


_CH_S179 = [('sample', 0x35A), ('operator', 0x758), ('date', 0x957), ('method', 0xA0E), ('instrument', 0xC15), ('units', 0x104C), ('signal', 0x1075)]
_CH_S130 = [('sample', 0x18), ('operator', 0x94), ('date', 0xB2), ('method', 0xE4), ('units', 0x244), ('signal', 0x254)]
CH_LAYOUT = {'179': (True, 0x1800, 0x127C, _CH_S179), '181': (True, 0x1800, 0x127C, _CH_S179),
             '130': (False, 0x1000, 0x284, _CH_S130), '30': (False, 0x400, 0x284, _CH_S130)}


def _delta_decode(dv, off, end, le):
    # channels-core deltaDecode
    out, acc, p = [], 0, off
    while p + 2 <= end:
        head, cnt = dv.u8(p), dv.u8(p + 1)
        if head != 0x10:
            break
        p += 2
        for _ in range(cnt):
            if p + 2 > end:
                return out
            d = dv.i16(p, le)
            p += 2
            if d == -32768:
                if p + 4 > end:
                    return out
                acc = dv.i32(p, le)
                p += 4
            else:
                acc += d
            out.append(acc)
    return out


def _ch_times(dv, n):
    # channels-core chTimes
    a, b = dv.i32(0x11A, False), dv.i32(0x11E, False)
    t0, t1 = a / 60000, b / 60000
    if not (b > a and b - a < 1e9):
        fa, fb = dv.f32(0x11A, False), dv.f32(0x11E, False)
        if math.isfinite(fa) and math.isfinite(fb) and fb > fa:
            t0, t1 = fa / 60000, fb / 60000
        else:
            return None
    return [t0 + (t1 - t0) * i / (n - 1) if n > 1 else t0 for i in range(n)]


def read_ch(buf):
    # channels-core readCh: Agilent ChemStation / OpenLab .ch
    u8 = buf
    ver = agilent_version(u8)
    L = CH_LAYOUT.get(ver)
    if not L or len(u8) <= L[1]:
        return None
    wide, data, scale_off, S = L
    dv = _DV(buf)
    head = {k: _pstr(u8, o, wide) for k, o in S}
    if u8[data] == 0x10:
        raw = _delta_decode(dv, data, len(u8), False)
    else:
        n = (len(u8) - data) // 8
        raw = [dv.f64(data + 8 * i, True) for i in range(n)]
    if len(raw) < 5:
        return None
    k = dv.f64(scale_off, False) if len(u8) >= scale_off + 8 else 1
    if not math.isfinite(k) or k == 0 or abs(k) > 1e12:
        k = 1
    ys = [float(v) * k for v in raw]
    xs = _ch_times(dv, len(ys))
    if not xs or not all(math.isfinite(v) for v in ys):
        return None
    return {'format': 'agilent-ch', 'version': ver, 'head': head, 'xs': xs, 'ys': ys}


def read_uv(buf):
    # channels-core readUv: Agilent .uv, spettri del DAD nel tempo
    u8 = buf
    ver = agilent_version(u8)
    if ver != '131' and ver != '31':
        return None
    dv = _DV(buf)
    wide = ver == '131'
    n = dv.i32(0x116, False)
    start = 0x1002 if ver == '131' else 0x202
    if not (n > 0 and n < 1e7):
        return None
    times, scans = [0.0] * n, []
    pos, lo, hi, step = start, INF, -INF, INF
    for i in range(n):
        if pos + 20 > len(u8):
            return None
        ln = dv.u16(pos)
        if ln < 20:
            return None
        t = dv.u32(pos + 2) / 60000
        a, b, s = dv.u16(pos + 6) / 20, dv.u16(pos + 8) / 20, dv.u16(pos + 10) / 20
        if not (s > 0) or not (b >= a):
            return None
        v, p, acc = [], pos + 20, 0
        end = min(len(u8), pos + ln)
        while p + 2 <= end:
            d = dv.i16(p)
            p += 2
            if d == -32768:
                if p + 4 > end:
                    break
                acc = dv.i32(p)
                p += 4
            else:
                acc += d
            v.append(acc / 2000)
        times[i] = t
        scans.append({'a': a, 's': s, 'v': v})
        lo = js_min(lo, a)
        hi = js_max(hi, a + s * (len(v) - 1))
        step = js_min(step, s)
        pos += ln
    offs = {'sample': 0x35A, 'operator': 0x758, 'date': 0x957, 'method': 0xA0E}
    offs2 = {'sample': 0x18, 'operator': 0x94, 'date': 0xB2, 'method': 0xE4}
    head = {k: _pstr(u8, offs[k] if wide else offs2[k], wide) for k in offs}
    return {'format': 'agilent-uv', 'version': ver, 'head': head, 'times': times, 'scans': scans, 'wl': {'lo': lo, 'hi': hi, 'step': step}}


def uv_extract(uv, wl, bw):
    # channels-core uvExtract: media dei valori nella banda, banda 0 = λ più vicina
    half = (bw or 0) / 2
    ys = [0.0] * len(uv['times'])
    for i, q in enumerate(uv['scans']):
        s, c = 0, 0
        if half > 0:
            j0 = max(0, math.ceil((wl - half - q['a']) / q['s'] - 1e-9))
            j1 = min(len(q['v']) - 1, math.floor((wl + half - q['a']) / q['s'] + 1e-9))
            for j in range(j0, j1 + 1):
                s += q['v'][j]
                c += 1
        if not c:
            j = js_round((wl - q['a']) / q['s'])
            if 0 <= j < len(q['v']):
                s = q['v'][j]
                c = 1
        ys[i] = s / c if c else NAN
    return ys


def uv_suggest(uv):
    # channels-core uvSuggest
    if not uv['scans']:
        return []
    q0 = uv['scans'][0]
    acc = [0.0] * len(q0['v'])
    k = 0
    for q in uv['scans']:
        if q['a'] != q0['a'] or q['s'] != q0['s'] or len(q['v']) != len(q0['v']):
            continue
        for j in range(len(acc)):
            acc[j] += q['v'][j]
        k += 1
    if not k:
        return []
    jm = 0
    for j in range(1, len(acc)):
        if acc[j] > acc[jm]:
            jm = j
    return [js_round(q0['a'] + q0['s'] * jm)]


_NUMROW_SPLIT = r'\t|;|\s+(?=[-+\d.])'


def _num_row(l):
    # channels-core numRow
    t = js_trim(l)
    if not t or jt(r'^"', t):
        return None
    c = [x for x in jsplit(_NUMROW_SPLIT, t) if x]
    if len(c) < 2:
        return None
    a, b = _cnum(c[0]), _cnum(c[1])
    return [a, b] if a is not None and b is not None and jt(r'^[-+]?[\d.,]+(e[-+]?\d+)?$', js_trim(c[0]), 'i') else None


def _tsvq(l):
    return [js_trim(jsub(r'^"(.*)"$', js_trim(x), lambda m: m.group(1))) for x in l.split('\t')]


def read_arw(text):
    # channels-core readArw: Waters Empower .arw
    lines = lines_of(text)
    if not any(jt(r'^"', js_trim(l)) for l in lines[:3]):
        return None
    blocks, i = [], 0
    while i < len(lines):
        l = js_trim(lines[i])
        if not jt(r'^"', l):
            i += 1
            continue
        q = []
        while i < len(lines) and jt(r'^"', js_trim(lines[i])):
            q.append(_tsvq(lines[i]))
            i += 1
        rec = {}
        k = 0
        while k + 1 < len(q):
            for j, key in enumerate(q[k]):
                if key:
                    rec[key] = q[k + 1][j] if j < len(q[k + 1]) else ''
            k += 2
        xs, ys = [], []
        while i < len(lines) and not jt(r'^"', js_trim(lines[i])):
            r = _num_row(lines[i])
            if r:
                xs.append(r[0])
                ys.append(r[1])
            i += 1
        blocks.append({'rec': rec, 'meta': ['\t'.join(r) for r in q], 'xs': xs, 'ys': ys})
    if not blocks or not any(len(b['xs']) >= 5 for b in blocks):
        return None

    def pick(rec, src):
        for k in rec:
            if jt(src, k, 'i'):
                return rec[k]
        return ''
    samples = {}
    for b in blocks:
        sn = pick(b['rec'], r'^sample\s*name$') or pick(b['rec'], r'^sample')
        ch = pick(b['rec'], r'^channel(\s*(name|description))?$') or pick(b['rec'], r'^ch(annel)?')
        wl = pick(b['rec'], r'wavelength')
        det = pick(b['rec'], r'^detector')
        info = ch_parse_channel(' '.join(x for x in [ch, wl + ' nm' if (wl and not jt(r'nm', wl, 'i')) else wl, det] if x))
        if not info['det'] and not info['wl'] and ch:
            info['det'] = js_slice(str(ch), 0, 30)
        key = sn or ''
        if key not in samples:
            samples[key] = {'name': sn, 'channels': []}
        samples[key]['channels'].append({'info': info, 'raw': ch, 'xs': b['xs'], 'ys': b['ys'], 'meta': b['meta'] + ['Waters Empower .arw', 'Time (min)\tIntensity'],
                                         'units': pick(b['rec'], r'unit')})
    S = list(samples.values())
    return {'format': 'waters-arw', 'declared': len(blocks),
            'samples': [{'sampleKey': (s['name'] or None) if len(S) > 1 else None, 'name': s['name'], 'channels': s['channels']} for s in S]}


def read_shimadzu(text):
    # channels-core readShimadzu: LabSolutions, esportazione ASCII
    if not jt(r'^\[Header\]\s*$', js_slice(text, 0, 20000), 'm') or not jt(r'^\[[^\]\n]*Chromatogram[^\]\n]*\]\s*$', text, 'mi'):
        return None
    lines = lines_of(text)
    samples, notes, status = [], [], []
    cur = sec = None
    declared = 0

    def kv(l):
        c = jsplit(r'\t|,(?=\S)', l)
        return [js_trim(c[0]), js_trim(c[1] if len(c) > 1 and c[1] is not None else '')]
    for i in range(len(lines)):
        l = jsub(r'\s+$', lines[i], '')
        m = jx(r'^\[(.+)\]$', js_trim(l))
        if m:
            name = js_trim(m.group(1))
            if jt(r'^Header$', name, 'i') or not cur:
                cur = {'name': '', 'file': '', 'channels': []}
                samples.append(cur)
            if jt(r'Chromatogram', name, 'i') and not jt(r'Status\s*Trace', name, 'i'):
                declared += 1
                pm = jx(r'\((.*)\)', name)
                paren = (pm.group(1) if pm else None) or name
                sec = {'name': name, 'paren': paren, 'kv': {}, 'xs': [], 'ys': [], 'data': False, 'meta': [js_trim(l)]}
                cur['channels'].append(sec)
            else:
                if jt(r'Status\s*Trace', name, 'i'):
                    pm = jx(r'\((.*)\)', name)
                    status.append((pm.group(1) if pm else None) or name)
                sec = {'name': name, 'kv': {}, 'other': True}
            continue
        if not sec or not js_trim(l):
            continue
        if sec.get('other'):
            k, v = kv(l)
            if jt(r'^Sample\s*Name$', k, 'i'):
                cur['name'] = v
            if jt(r'^Data\s*File\s*Name$', k, 'i'):
                cur['file'] = jsplit(r'[\\/]', v)[-1]
            continue
        r = _num_row(l if '\t' in l else l.replace(',', '\t'))
        if sec['data'] and r:
            sec['xs'].append(r[0])
            sec['ys'].append(r[1])
            continue
        if jt(r'^R\.?\s*Time', js_trim(l), 'i'):
            sec['data'] = True
            sec['meta'].append(js_trim(l))
            continue
        if not sec['data']:
            k, v = kv(l)
            sec['kv'][k] = v
            sec['meta'].append(js_trim(l))
    out = []
    for s in samples:
        if not s['channels']:
            continue
        chs = []
        for c in s['channels']:
            kvd = c['kv']
            mult = _cnum(kvd.get('Intensity Multiplier'))
            k = mult if mult is not None and mult != 0 else 1
            wl = kvd.get('Wavelength(nm)') or kvd.get('Wavelength') or ''
            bw = kvd.get('Bandwidth(nm)') or kvd.get('Band Width(nm)') or ''
            info = ch_parse_channel(c['paren'] + ((' ' + wl + ('/' + bw if bw else '') + ' nm') if wl else ''))
            if not info['det']:
                info['det'] = js_slice(c['paren'], 0, 30)
            want = js_parse_int10(kvd.get('# of Points') if kvd.get('# of Points') is not None else 'undefined')
            if math.isfinite(want) and want != len(c['xs']):
                notes.append({'code': 'points', 'channel': ch_format_channel(info), 'sample': s['name'], 'declared': want, 'read': len(c['xs'])})
            chs.append({'info': info, 'raw': c['paren'], 'xs': c['xs'], 'ys': c['ys'] if k == 1 else [v * k for v in c['ys']],
                        'meta': c['meta'] + ['Shimadzu LabSolutions ASCII'], 'units': kvd.get('Intensity Units') or ''})
        out.append({'name': s['name'] or s['file'], 'channels': chs})
    if not any(len(c['xs']) >= 5 for s in out for c in s['channels']):
        return None
    if status:
        notes.append({'code': 'status', 'list': status})
    return {'format': 'shimadzu-ascii', 'declared': declared, 'notes': notes,
            'samples': [{'sampleKey': (s['name'] or None) if len(out) > 1 else None, 'name': s['name'], 'channels': s['channels']} for s in out]}


def ch_finish(r):
    # channels-core finish
    if not r:
        return None
    r['notes'] = r.get('notes') or []
    for s in r['samples']:
        s['channels'] = [c for c in s['channels'] if len(c['xs']) >= 5]
        for i, c in enumerate(s['channels']):
            c['channel'] = ch_format_channel(c['info'])
            c['label'] = short_label(c['info']) or c['channel']
            c['xs'] = _fl(c['xs'])
            c['ys'] = _fl(c['ys'])
            if not c['channel'] and len(s['channels']) > 1:
                c['channel'] = '#' + str(i + 1)
                c['label'] = c['channel']
    for s in r['samples']:
        seen = {}
        for c in s['channels']:
            k = c['channel']
            seen[k] = seen.get(k, 0) + 1
            if seen[k] > 1:
                c['channel'] = (k + ' ' if k else '') + '#' + str(seen[k])
                c['label'] = (c['label'] + ' ' if c['label'] else '') + '#' + str(seen[k])
    r['read'] = sum(len(s['channels']) for s in r['samples'])
    return r


def read_binary_ch(buf, name):
    # channels-core readBinary (.ch)
    nm = str(name or '')
    if jt(r'\.ch$', nm, 'i') or jt(r'^\.?(179|181|130|30)$', agilent_version(buf)):
        c = read_ch(buf)
        if not c:
            return None
        info = ch_parse_channel(c['head'].get('signal') or '')
        if not info['det'] and not info['wl']:
            fn = ch_parse_channel(jsub(r'\.ch$', nm, '', 'i'))
            info['det'] = fn['det']
            info['wl'] = fn['wl']
        h = c['head']
        meta = [x for x in ['Agilent ChemStation .ch (%s)' % c['version'], 'Sample Name: ' + h['sample'] if h['sample'] else '', 'Signal: ' + h['signal'] if h['signal'] else '',
                            'Method: ' + h['method'] if h['method'] else '', 'Units: ' + h['units'] if h['units'] else '', 'Time (min)'] if x]
        return ch_finish({'format': 'agilent-ch', 'declared': 1, 'samples': [{'sampleKey': None, 'name': h['sample'], 'channels': [
            {'info': info, 'raw': h['signal'], 'xs': c['xs'], 'ys': c['ys'], 'meta': meta, 'units': h['units']}]}]})
    return None


def read_uv_channels(uv, wls, bw):
    # channels-core readUvChannels
    chs = []
    for wl in wls:
        ys = uv_extract(uv, wl, bw)
        if not all(math.isfinite(v) for v in ys):
            continue
        chs.append({'info': {'det': 'UV', 'wl': wl, 'bw': bw or None, 'ref': None, 'ex': None, 'em': None, 'extracted': True}, 'xs': list(uv['times']), 'ys': ys,
                    'meta': [x for x in ['Agilent ChemStation .uv (' + uv['version'] + '): cromatogramma dagli spettri DAD',
                                         'Sample Name: ' + uv['head']['sample'] if uv['head']['sample'] else '', 'Time (min)'] if x]})
    return ch_finish({'format': 'agilent-uv', 'declared': len(wls), 'samples': [{'sampleKey': None, 'name': uv['head']['sample'], 'channels': chs}]})


def read_text_ch(text, name):
    # channels-core readText: Waters .arw, Shimadzu ASCII
    nm = str(name or '')
    if jt(r'\.arw$', nm, 'i') or jt(r'^"?Sample\s*Name"?\t', js_slice(text, 0, 200), 'i'):
        r = read_arw(text)
        if r:
            return ch_finish(r)
    s = read_shimadzu(text)
    if s:
        return ch_finish(s)
    return None


def header_names(lines, n_cols):
    # channels-core headerNames
    k = len(lines) - 1
    while k >= 0 and k >= len(lines) - 8:
        h = jsub(r'^#\s*', str(lines[k]), '')
        sep = '\t' if '\t' in h else ';' if ';' in h else ','
        out, cur, q = [], '', False
        for ch in h:
            if ch == '"':
                q = not q
                continue
            if ch == sep and not q:
                out.append(js_trim(cur))
                cur = ''
            else:
                cur += ch
        out.append(js_trim(cur))
        if len(out) == n_cols and not all(_cnum(x) is not None for x in out):
            return out
        k -= 1
    return None


def text_channels(text, p, name=''):
    # index.html textChannels: file di testo ChemStation/OpenLab con più segnali (colonne o blocchi). L'app lo usa solo per l'HPLC
    if not p or p.get('reject'):
        return None
    lines = lines_of(text)
    chs, notes, declared = [], [], 0
    if (p.get('nCols') or 2) > 2:
        k0 = _find(lines, lambda i, l: jt(r'^\s*"?[-+]?\d', l) and jcount(r'[-+]?\d+(?:[.,]\d+)?(?:e[-+]?\d+)?', l, 'i') >= 2)
        names = header_names(lines[max(0, k0 - 8):k0], p['nCols']) if k0 > 0 else None
        if names:
            cand = []
            for j in range(1, len(names)):
                info = ch_parse_channel(names[j])
                if info['det'] or info['wl'] is not None:
                    cand.append({'j': j, 'info': info, 'name': names[j]})
            if len(cand) >= 2 and len(set(ch_format_channel(c['info']) for c in cand)) >= 2:
                declared = len(cand)
                for c in cand:
                    q = parse_text(text, {'ycol': c['j']})
                    if q and not q.get('reject') and len(q['xs']) >= 5:
                        chs.append({'info': c['info'], 'raw': c['name'], 'xs': q['xs'], 'ys': q['ys'], 'meta': q['meta'], 'p': q, 'col': c['j']})
                other = [nm for j, nm in enumerate(names[1:]) if not any(c['j'] == j + 1 for c in cand)]
                if other:
                    notes.append({'code': 'cols-other', 'list': other})
    if not chs and p.get('chSpans') and len(p['chSpans']) > 1:
        declared = len(p['chSpans'])
        sig = set(x for x in (canon_channel(l) for l in lines if jt(r'\bSig\s*=|^\W*(Signal|Segnale)\s*\d+\s*[:=]', l, 'i')) if x)
        declared = max(declared, len(sig))
        for k, sp in enumerate(p['chSpans']):
            body = '\n'.join(sp['hdr'] + lines[sp['l0']:sp['l1'] + 1])
            q = parse_text(body)
            if not q or q.get('reject') or len(q['xs']) < 5:
                continue
            info = None
            for h in range(len(sp['hdr']) - 1, -1, -1):
                o = ch_parse_channel(sp['hdr'][h])
                if o['det'] or o['wl'] is not None:
                    info = o
                    break
            chs.append({'info': info or {'det': '', 'wl': None, 'bw': None, 'ref': None, 'ex': None, 'em': None, 'extracted': False}, 'raw': '',
                        'xs': q['xs'], 'ys': q['ys'], 'meta': q['meta'], 'p': q, 'block': k})
    if len(chs) < 2:
        return None
    q = p.get('importIssue')
    tab = q['after'] - (p.get('afterCh') or 0) if q and p.get('chSpans') else 0
    if tab > 0:
        notes.append({'code': 'tables', 'rows': tab})
    return ch_finish({'format': 'text', 'declared': declared, 'notes': notes, 'samples': [{'sampleKey': None, 'name': '', 'channels': chs}]})


def read_channels(raw, nome, opt=None):
    """Canali di un file HPLC come in index.html (caricamento dei file, I3) con app/channels-core.js:
    .uv → readUv + readUvChannels (opt.uvWl: elenco di λ, se manca uvSuggest; opt.uvBw: banda, 4 come nella finestra);
    .ch → readBinary; testo → readText (Waters .arw, Shimadzu), altrimenti textChannels sul testo letto da parseText.
    Restituisce il dict di AcchChannels.finish oppure None (file a un canale o illeggibile)."""
    opt = opt or {}
    raw = bytes(raw)
    if jt(r'\.(xlsx|opju?)$', nome, 'i'):
        return None   # Excel e Origin: altri lettori dell'app, mai canali HPLC
    if jt(r'\.uv$', nome, 'i'):
        uv = read_uv(raw)
        if not uv:
            return None
        wls = opt.get('uvWl') or uv_suggest(uv)
        return read_uv_channels(uv, wls, opt.get('uvBw', 4))
    mc = read_binary_ch(raw, nome)
    if mc:
        return mc
    if parse_binary(raw, nome):
        return None
    text = decode_buffer(raw)
    mc = read_text_ch(text, nome)
    if mc:
        return mc
    p = parse_text(text)
    if p.get('reject') or len(p['xs']) < 5:
        return None
    return text_channels(text, p, nome)
