
# ---------------------------------------------------------------------------------------------
# Modulo acch_libreria: concentrazioni HPLC dalla taratura salvata in libreria (tappa I4,
# docs/SPEC-TARATURA-SALVATA.md), trascritte da app/hplc-stored-cal.js, app/library.js e
# app/library-ui.js. Si concatena dopo acch_ricetta.py e ne usa gli aiuti (js_str, js_fixed,
# js_prec, num_prec, js_round, jdiv, RE_WSN, peak_areas, interp_y, mv_value, NonTrascritto).
# Ingresso unico: library_rows(input) → righe e testo di concentrazioni_da_libreria.csv.
# ---------------------------------------------------------------------------------------------
import unicodedata


# ============================== semantica di JavaScript usata qui ==============================
def js_truthy(v):
    # valore «vero» di JavaScript: 0, NaN, '', null e false sono falsi; oggetti e liste vuote sono veri
    if v is None or v is False:
        return False
    if v is True:
        return True
    if isinstance(v, (int, float)):
        return v == v and v != 0
    if isinstance(v, str):
        return len(v) > 0
    return True


def js_or(v, d):
    # v || d
    return v if js_truthy(v) else d


def js_isfinite(v):
    # isFinite() globale: converte prima in numero (null → 0)
    if v is None or isinstance(v, bool):
        return True
    if isinstance(v, (int, float)):
        return math.isfinite(v)
    raise NonTrascritto('isFinite non trascritto: valore di tipo ' + type(v).__name__)


def js_num0(v):
    # numero in un'operazione aritmetica: null → 0
    return 0.0 if v is None else v


def js_gt0(v):
    # v > 0 con la conversione di JavaScript (null → 0)
    if v is None:
        return False
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return v > 0
    raise NonTrascritto('confronto > 0 non trascritto: valore di tipo ' + type(v).__name__)


def js_sqrt(v):
    # Math.sqrt: NaN per i negativi invece di un errore
    return math.sqrt(v) if v >= 0 else NAN


def js_String(v):
    # String(v)
    if v is None:
        return 'null'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, float)):
        return js_str(v)
    if isinstance(v, list):
        return ','.join('' if x is None else js_String(x) for x in v)
    if isinstance(v, dict):
        return '[object Object]'
    return str(v)


def js_tpl(v):
    # valore in un modello `${v}` (undefined → 'undefined': qui null e undefined coincidono e danno 'null')
    return js_String(v)


def js_replace_first(s, pat, rep):
    # String.prototype.replace con un testo come modello: solo la prima occorrenza, con $$, $&, $` e $'
    i = s.find(pat)
    if i < 0:
        return s
    out, k = [], 0
    while k < len(rep):
        c = rep[k]
        if c == '$' and k + 1 < len(rep):
            n = rep[k + 1]
            if n == '$':
                out.append('$'); k += 2; continue
            if n == '&':
                out.append(pat); k += 2; continue
            if n == '`':
                out.append(s[:i]); k += 2; continue
            if n == "'":
                out.append(s[i + len(pat):]); k += 2; continue
        out.append(c)
        k += 1
    return s[:i] + ''.join(out) + s[i + len(pat):]


def u16_slice(s, n):
    # s.slice(0, n) di JavaScript: conta le unità UTF-16, non i caratteri
    b = s.encode('utf-16-le', 'surrogatepass')
    if len(b) <= 2 * n:
        return s
    return b[:2 * n].decode('utf-16-le', 'surrogatepass')


def js_lower(s):
    return s.lower()


def js_json(v):
    # JSON.stringify per i valori semplici del riferimento del canale ('off' o {wl, bw})
    if v is None or (isinstance(v, float) and not math.isfinite(v)):
        return 'null'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, float)):
        return js_str(v)
    if isinstance(v, str):
        return json.dumps(v, ensure_ascii=False)
    if isinstance(v, list):
        return '[' + ','.join(js_json(x) for x in v) + ']'
    if isinstance(v, dict):
        return '{' + ','.join(json.dumps(k, ensure_ascii=False) + ':' + js_json(x) for k, x in v.items()) + '}'
    raise NonTrascritto('JSON.stringify non trascritto per ' + type(v).__name__)


def js_sum(vals):
    # reduce((a,b)=>a+b, 0): somma da sinistra, senza la compensazione di sum() di Python 3.12+
    t = 0.0
    for v in vals:
        t = t + v
    return t


def _floats(v):
    # i numeri di JavaScript sono tutti double: gli interi del JSON diventano float
    if isinstance(v, bool) or v is None:
        return v
    if isinstance(v, int):
        return float(v)
    if isinstance(v, list):
        return [_floats(x) for x in v]
    if isinstance(v, dict):
        return {k: _floats(x) for k, x in v.items()}
    return v


# Date.parse di 'aaaa-mm-gg' (UTC): V8 accetta il giorno 1–31 in ogni mese e lo fa scorrere (30 febbraio → 2 marzo)
RE_ISO_DAY = re.compile(r'(\d{4})-(\d{2})-(\d{2})', re.A)


def _days_from_civil(y, m, d):
    y -= m <= 2
    era = (y if y >= 0 else y - 399) // 400
    yoe = y - era * 400
    doy = (153 * (m + (-3 if m > 2 else 9)) + 2) // 5 + d - 1
    doe = yoe * 365 + yoe // 4 - yoe // 100 + doy
    return era * 146097 + doe - 719468


def js_date_parse_day(s):
    if s == '':
        return NAN
    m = RE_ISO_DAY.fullmatch(s)
    if not m:
        raise NonTrascritto('Date.parse non trascritto per «' + s + '»: solo le date aaaa-mm-gg')
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if not (1 <= mo <= 12) or not (1 <= d <= 31):
        return NAN
    return float((_days_from_civil(y, mo, 1) + d - 1) * 86400000)


# ============================== app/hplc-stored-cal.js ==============================
SC_QUANT = {'ricerca': True, 'esplorativa': True, 'impurezze': 'rrf', 'dosaggio': False, 'tracce': False, 'bioanalisi': False}
SC_DEF = {'ricerca': {'dev': 10.0, 'diff': 5.0, 'drift': 5.0}, 'esplorativa': {'dev': 15.0, 'diff': 8.0, 'drift': None}}
SC_BETWEEN_DAYS = 0.05
SC_CHART_MIN, SC_CHART_ACTION = 10, 3.5
SC_T975 = [NAN, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.160, 2.145, 2.131, 2.120,
           2.110, 2.101, 2.093, 2.086, 2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042]


def sc_t975(df):
    # hplc-stored-cal.js t975
    if df is not None and df >= 1 and df <= 30:
        return SC_T975[int(js_round(df))]
    return 1.96


def sc_days(frm, to):
    # hplc-stored-cal.js days
    a = js_date_parse_day(u16_slice(js_String(frm), 10))
    b = js_date_parse_day(u16_slice(js_String(to), 10))
    return int(js_round((b - a) / 86400000)) if math.isfinite(a) and math.isfinite(b) else None


def sc_fmt_date(d):
    # hplc-stored-cal.js fmtDate
    m = re.match(r'(\d{4})-(\d{2})-(\d{2})', js_String(d) if js_truthy(d) else '', re.A)
    return m.group(3) + '/' + m.group(2) + '/' + m.group(1) if m else ''


RE_LIB0 = re.compile('[' + re.escape(JS_WS) + '·*×]+')


def _lib0(u):
    # hplc-stored-cal.js Lib0
    return RE_LIB0.sub('', js_lower(js_String(u) if js_truthy(u) else ''))


def area_factor(app_unit, entry_unit):
    # hplc-stored-cal.js areaFactor: fattore che porta l'area dell'app nell'unità della voce
    def t(u):
        s = RE_WSN.sub('', js_lower(js_String(u) if js_truthy(u) else ''))
        if not s:
            return None
        if re.search(r'(·|\*|×|x)?(s|sec)\Z', s) and not re.search(r'min\Z', s):
            return 's'
        if re.search(r'min\Z', s):
            return 'min'
        return None
    same = _lib0(app_unit) == _lib0(entry_unit) and _lib0(entry_unit) != ''
    a, e = t(app_unit), t(entry_unit)
    if same:
        return {'f': 1.0}
    if not e:
        return {'f': 1.0, 'assumed': True}
    if not a:
        return None
    if a == e:
        return {'f': 1.0}
    if a == 'min' and e == 's':
        return {'f': 60.0}
    if a == 's' and e == 'min':
        return {'f': 1 / 60}
    return None


def intercept_negligible(cal, yc):
    # hplc-stored-cal.js interceptNegligible
    a = js_or(cal.get('intercept'), 0.0)
    if a == 0:
        return True
    if yc is not None and abs(a) <= 0.02 * abs(yc):
        return True
    sa = cal.get('sa')
    if sa is not None and sa > 0:
        n = cal.get('n')
        t = sc_t975(js_or(cal.get('df'), (n - 2) if js_truthy(n) else 30.0))
        return abs(a) <= t * sa
    return False


def chart_check(ks, opt=None):
    # hplc-stored-cal.js chartCheck (Westgard: 1_3s a 3,5 s blocca, 2_2s avvisa)
    opt = opt or {}
    L = [k for k in (ks or []) if fin(k)]
    act = js_or(opt.get('action'), SC_CHART_ACTION)
    if len(L) <= SC_CHART_MIN:
        return {'active': False, 'n': len(L)}
    base = L[:SC_CHART_MIN]
    m = js_sum(base) / SC_CHART_MIN
    ss = 0.0
    for b in base:
        ss = ss + (b - m) * (b - m)
    s = js_sqrt(ss / (SC_CHART_MIN - 1))
    z = [((k - m) / s if s > 0 else 0.0) for k in L[SC_CHART_MIN:]]
    last = z[-1]
    prev = z[-2] if len(z) > 1 else None
    r13 = abs(last) > act
    r22 = prev is not None and ((last > 2 and prev > 2) or (last < -2 and prev < -2))
    return {'active': True, 'n': len(L), 'mean': m, 'sd': s, 'z': last, 'block': r13, 'warn': (not r13) and r22,
            'rule': '1_3s' if r13 else ('2_2s' if r22 else None)}


def sc_uncertainty(o):
    # hplc-stored-cal.js uncertainty: U = k·x·√(s_r²(1/m_c+1/m_k) + u_std² + (s_a/b)²(1/x−1/x_c)² [+ tra i giorni])
    x, b = o.get('x'), o.get('b')
    if not (x is not None and x > 0) or not js_truthy(b):
        return None
    terms = {}
    sr = o.get('sr')
    frm = js_or(o.get('srFrom'), 'given') if sr is not None else None
    y = o.get('y')
    if sr is None and o.get('syx') is not None and js_truthy(y):
        sr = abs(jdiv(o['syx'], y)); frm = 'syx'
    if sr is None and o.get('sb') is not None and js_truthy(b):
        sr = abs(jdiv(o['sb'], b)); frm = 'slope-sd'
    if sr is None:
        return None

    def inv(v):
        return 1 / v if (v is not None and v > 0 and math.isfinite(v)) else 0.0
    mc, mk = o.get('mc'), js_or(o.get('mk'), 1.0)
    terms['rep'] = sr * sr * (inv(mc) + inv(mk))
    u = js_or(o.get('uStd'), 0.0)
    terms['std'] = u * u
    xc = o.get('xc')
    if o.get('sa') is not None:
        q = jdiv(o['sa'], b)
        w = 1 / x - (1 / xc if (xc is not None and xc > 0) else 0.0)
        terms['int'] = q * q * (w * w)
    else:
        terms['int'] = 0.0
    bd = o.get('betweenDays')
    if js_truthy(o.get('noControl')):
        d = bd if bd is not None else SC_BETWEEN_DAYS
        terms['days'] = d * d
    else:
        terms['days'] = 0.0
    rel = js_sqrt(terms['rep'] + terms['std'] + terms['int'] + terms['days'])
    df0 = o.get('df')
    df = df0 if (df0 is not None and df0 >= 1 and math.isfinite(df0)) else None
    kU = sc_t975(df) if js_truthy(df) else 2.0
    us = o.get('uStd')
    return {'U': kU * x * rel, 'rel': rel, 'kU': kU, 'df': df, 'sr': sr, 'from': frm, 'terms': terms,
            'uStdMissing': not (us is not None and us > 0),
            'betweenDays': (bd if bd is not None else SC_BETWEEN_DAYS) if js_truthy(o.get('noControl')) else None}


def sc_pred_y(cal, x):
    # hplc-stored-cal.js predY
    return (0.0 if cal.get('kind') == 'rf' else js_or(cal.get('intercept'), 0.0)) + js_num0(cal.get('slope')) * x


def sc_to_x(cal, y, k):
    # hplc-stored-cal.js toX: x = (y/k − a)/b
    return jdiv(jdiv(js_num0(y), k) - (0.0 if cal.get('kind') == 'rf' else js_or(cal.get('intercept'), 0.0)), js_num0(cal.get('slope')))


def sc_chart_sd(chart):
    # hplc-stored-cal.js chartSd
    L = [p.get('k') for p in chart if fin(p.get('k'))][:SC_CHART_MIN]
    if len(L) < SC_CHART_MIN:
        return None
    m = js_sum(L) / len(L)
    ss = 0.0
    for b in L:
        ss = ss + (b - m) * (b - m)
    return jdiv(js_sqrt(ss / (len(L) - 1)), m)


RE_MAINT_KIND = re.compile(r'lamp|lampada|cella|cell|strument', re.I | re.A)


def sc_quantify(o):
    # hplc-stored-cal.js quantify: concentrazione, incertezza, modo e provenienza, oppure il motivo del blocco
    e = o.get('entry') or {}
    cal = e.get('cal')
    lib = o.get('lib') or {}
    profile = js_or(o.get('profile'), js_or(e.get('profile'), js_or(lib.get('profile'), 'ricerca')))
    thr = dict(SC_DEF.get(profile) or SC_DEF['ricerca'])
    thr.update(lib.get('thresholds') or {})
    today = o.get('today')
    if not js_truthy(today):
        raise NonTrascritto('quantify senza «today»: la data di oggi va passata')
    age = sc_days(cal.get('date'), today) if (js_truthy(cal) and js_truthy(cal.get('date'))) else None
    rem = js_or(lib.get('reminderDays'), 180.0)
    prov = {'library': js_or(lib.get('name'), ''), 'libraryId': js_or(lib.get('id'), ''), 'revision': js_or(lib.get('revision'), None),
            'entry': js_or(e.get('name'), ''), 'entryId': js_or(e.get('id'), ''), 'entryRev': js_or(e.get('rev'), None),
            'calDate': js_or(cal.get('date'), '') if js_truthy(cal) else '', 'age': age, 'profile': profile,
            'standardLot': js_or(cal.get('standardLot'), '') if js_truthy(cal) else '', 'source': js_or(cal.get('source'), '') if js_truthy(cal) else ''}
    res = {'ok': False, 'x': None, 'U': None, 'mode': None, 'k': None, 'devs': [], 'drift': None, 'age': age, 'provenance': prov,
           'warnings': [], 'profile': profile, 'thresholds': thr}

    def block(code, detail=None):
        res.update({'ok': False, 'code': code, 'detail': detail if js_truthy(detail) else None})
        return res
    if not js_truthy(cal) or not (js_truthy(cal.get('slope')) or js_truthy(cal.get('rrf'))):
        return block('no-calibration')
    q = SC_QUANT.get(profile)
    if q is False:
        return block('profile')
    if js_truthy(o.get('normalized')) or js_truthy(cal.get('normalized')):
        return block('normalized')
    ck = o.get('check') or {}
    for k in ('channel', 'method', 'instrument', 'column'):
        if js_truthy(ck.get(k)) and ck[k].get('ok') is False:
            return block(k, js_or(ck[k].get('detail'), None))
    if js_truthy(ck.get('channel')) and js_truthy(ck['channel'].get('unverified')) and len(ck['channel']['unverified']):
        res['warnings'].append({'code': 'channel-unverified', 'detail': ck['channel']['unverified']})
    for k in ('method', 'column'):
        if js_truthy(ck.get(k)) and js_truthy(ck[k].get('unverified')):
            res['warnings'].append({'code': k + '-unverified'})
    if js_truthy(o.get('areaUnitAssumed')):
        res['warnings'].append({'code': 'area-unit-assumed', 'detail': js_or(cal.get('areaUnit'), '')})
    # manutenzione registrata dopo la taratura
    mt = None
    for m in (lib.get('maintenance') or []):
        if js_truthy(cal.get('date')) and m.get('date') is not None and js_String(m['date']) > js_String(cal['date']) and (
                not js_truthy(m.get('target')) or not js_truthy(e.get('column')) or m.get('target') == e.get('column')
                or RE_MAINT_KIND.search(js_String(js_or(m.get('kind'), ''))) is not None):
            mt = m
            break
    if mt is not None:
        return block('maintenance', mt.get('date'))
    suit = o.get('suitability')
    if suit is None:
        L = [r for r in (lib.get('suitability') or []) if r.get('date') == today]
        suit = L[-1].get('ok') if L else None
    if suit is False:
        return block('suitability')
    if age is not None and age > rem:
        res['warnings'].append({'code': 'reminder', 'detail': rem})
    if profile == 'esplorativa':
        res['warnings'].append({'code': 'exploratory'})
    y = o.get('y')
    if not js_isfinite(y):
        return block('no-response')
    yv = js_num0(y)
    ctr = [c for c in (o.get('controls') or []) if js_truthy(c) and js_gt0(c.get('nominal')) and js_isfinite(c.get('y'))]
    for c in ctr:
        if c.get('tR') is not None and e.get('x') is not None and e.get('window') is not None and abs(c['tR'] - e['x']) > e['window']:
            return block('ctrl-window', c['tR'])

    if q == 'rrf':
        rrf = cal.get('rrf')
        if not js_gt0(rrf):
            return block('no-rrf')
        arf = o.get('activeRF')
        if not js_gt0(arf):
            return block('no-active-rf')
        ist = o.get('impurityStd')
        if js_truthy(ist) and js_gt0(ist.get('nominal')) and js_isfinite(ist.get('y')):
            dv = 100 * (jdiv(js_num0(ist['y']), rrf * arf * ist['nominal']) - 1)
            res['devs'].append(dv)
            if abs(dv) > 10:
                return block('ctrl-dev', {'dev': dv, 'thr': 10.0})
        res['x'] = jdiv(yv, rrf * arf)
        res['mode'] = 'rrf'; res['k'] = None; res['ok'] = True; res['code'] = 'ok'
        U = sc_uncertainty({'x': res['x'], 'b': rrf * arf, 'y': y, 'syx': cal.get('syx'), 'sr': o.get('sr'), 'mc': 1.0, 'mk': 1.0,
                            'uStd': js_or(o.get('uStd'), cal.get('uStd')), 'noControl': False})
        res['U'] = U['U'] if U else None
        res['u'] = U
        return res

    xs = []
    k, mode, drift = 1.0, 'nocontrol', None
    if not ctr:
        if profile != 'ricerca':
            return block('no-control')
        mode = 'nocontrol'
    else:
        R = []
        for c in ctr:
            yp = sc_pred_y(cal, c['nominal'])
            d = dict(c); d['yp'] = yp; d['k'] = jdiv(c['y'], yp)
            R.append(d)
        for c in R:
            dv = 100 * (c['k'] - 1)
            res['devs'].append(dv)
            if abs(dv) > js_num0(thr.get('dev')):
                return block('ctrl-dev', {'dev': dv, 'thr': thr.get('dev')})
        op = [c for c in R if c.get('pos') == 'open']
        cl = [c for c in R if c.get('pos') == 'close']
        if op and cl:
            ko = js_sum(c['k'] for c in op) / len(op)
            kc = js_sum(c['k'] for c in cl) / len(cl)
            drift = 100 * (jdiv(kc, ko) - 1)
            res['drift'] = drift
            if thr.get('drift') is not None and abs(drift) > thr['drift']:
                return block('drift', {'drift': drift, 'thr': thr['drift']})
        ordered = [c for c in R if fin(c.get('order'))]
        so = o.get('sampleOrder')
        if ordered and fin(so):
            allo = sorted([c['order'] for c in ordered] + [so])
            for i in range(1, len(allo)):
                if allo[i] - allo[i - 1] > 20:
                    return block('frequency')
        lv = []
        for c in R:
            v = float(js_prec(c['nominal'], 6))
            if v not in lv:
                lv.append(v)
        if len(lv) == 1:
            c = R[0]
            need = []
            if not intercept_negligible(cal, c['yp']):
                need.append('intercept')
            sy = o.get('sampleYs')
            Ys = [v for v in (sy if (sy and len(sy)) else [y]) if fin(v)]
            if any(v < 0.5 * c['y'] or v > 2 * c['y'] for v in Ys):
                need.append('span-control')
            for v in Ys:
                xs.append(sc_to_x(cal, v, c['k']))
            rg = cal.get('range')
            if len(xs) > 1:
                mx, mn = js_max(*xs), js_min(*xs)
                if mn > 0 and mx / mn > 5:
                    need.append('span5')
            if js_truthy(rg) and any(v < rg[0] + 0.25 * (rg[1] - rg[0]) for v in xs):
                need.append('low25')
            if need:
                return block('need-two', need)
            k = js_sum(c['k'] for c in R) / len(R)
            mode = '1ctrl'
        else:
            nmin = js_min(*[c['nominal'] for c in R])
            nmax = js_max(*[c['nominal'] for c in R])
            lo = [c for c in R if c['nominal'] == nmin]
            hi = [c for c in R if c['nominal'] == nmax]
            kl = js_sum(c['k'] for c in lo) / len(lo)
            kh = js_sum(c['k'] for c in hi) / len(hi)
            diff = jdiv(100 * abs(kh - kl), (kh + kl) / 2)
            res['ctrlDiff'] = diff
            if diff > js_num0(thr.get('diff')):
                return block('incoherent', {'diff': diff, 'thr': thr.get('diff')})
            k = (kl + kh) / 2
            mode = '2ctrl'
        if op and cl and fin(so) and all(fin(c.get('order')) for c in op) and all(fin(c.get('order')) for c in cl):
            to = js_sum(c['order'] for c in op) / len(op)
            tc = js_sum(c['order'] for c in cl) / len(cl)
            ko = js_sum(c['k'] for c in op) / len(op)
            kc = js_sum(c['k'] for c in cl) / len(cl)
            if tc > to:
                k = ko + (kc - ko) * js_min(1, js_max(0, (so - to) / (tc - to)))
        ch = chart_check([p.get('k') for p in (e.get('chart') or [])] + [k])
        res['chart'] = ch
        if ch['active'] and ch['block']:
            return block('chart', {'z': ch['z']})
        if ch['active'] and ch['warn']:
            res['warnings'].append({'code': 'chart-warn'})
        res['nCtrl'] = len(R)
        res['xc'] = R[0]['nominal'] if (len(R) == 1 or len(lv) == 1) else None
    x = sc_to_x(cal, y, k)
    res['k'] = None if mode == 'nocontrol' else k
    res['mode'] = mode
    rg = cal.get('range')
    if js_truthy(rg):
        tol = 1e-9 * js_max(1, abs(rg[1]))
        if x < rg[0] - tol or x > rg[1] + tol:
            return block('range', {'x': x, 'range': rg})
    else:
        res['warnings'].append({'code': 'range-unknown'})
    if cal.get('lod') is not None and x < cal['lod']:
        res['belowLod'] = True
    elif cal.get('loq') is not None and x < cal['loq']:
        res['belowLoq'] = True
    res['x'] = x; res['ok'] = True; res['code'] = 'ok'
    chart = e.get('chart')
    csd = sc_chart_sd(chart) if (js_truthy(chart) and len(chart) >= SC_CHART_MIN) else None
    noc = mode == 'nocontrol'
    if o.get('sr') is not None:
        sr = o['sr']
    elif not noc and csd is not None:
        sr = csd
    else:
        sr = cal.get('srel') if cal.get('srel') is not None else None
    if o.get('sr') is not None:
        sr_from = 'given'
    elif not noc and csd is not None:
        sr_from = 'chart'
    elif cal.get('srel') is not None:
        sr_from = 'srel'
    elif cal.get('syx') is not None:
        sr_from = 'syx'
    else:
        sr_from = 'slope-sd'
    if sr_from == 'given':
        df_u = o.get('srDf')
    elif sr_from == 'chart':
        df_u = float(SC_CHART_MIN - 1)
    elif sr_from == 'srel':
        df_u = cal.get('srelDf')
    elif sr_from == 'syx':
        n = cal.get('n')
        df_u = js_or(cal.get('df'), (n - 2) if js_truthy(n) else None)
    else:
        df_u = None
    U = sc_uncertainty({'x': x, 'b': cal.get('slope'), 'sb': cal.get('sb'), 'y': jdiv(yv, k), 'syx': cal.get('syx'), 'sr': sr, 'srFrom': sr_from,
                        'df': df_u, 'sa': None if cal.get('kind') == 'rf' else cal.get('sa'), 'xc': res.get('xc'),
                        'mc': INF if noc else js_or(res.get('nCtrl'), 1.0), 'mk': js_or(o.get('mk'), 1.0),
                        'uStd': o['uStd'] if o.get('uStd') is not None else cal.get('uStd'), 'noControl': noc,
                        'betweenDays': csd if (noc and csd is not None) else None})
    res['u'] = U
    res['U'] = U['U'] if U else None
    if not U:
        res['warnings'].append({'code': 'no-uncertainty'})
    elif U['from'] == 'slope-sd':
        res['warnings'].append({'code': 'u-slope-sd'})
    if U and U['uStdMissing']:
        res['uStdMissing'] = True
    if U:
        res['warnings'].append({'code': 'coverage', 'detail': {'kU': U['kU'], 'df': U['df']}})
    return res


# ---------- testi (SPEC «Messaggi»), in italiano e in inglese ----------
def sc_N(v, d, en):
    # hplc-stored-cal.js N: toFixed con la virgola in italiano
    if v is None or not js_isfinite(v):
        return ''
    s = js_fixed(float(v), d)
    return s if en else s.replace('.', ',', 1)


def sc_sgn(v, en):
    return ('+' if v > 0 else ('−' if v < 0 else '')) + sc_N(abs(v), 1, en) + '%'


SC_REASON = {
    'no-control': ['controllo assente', 'no control'], 'ctrl-dev': ['controllo fuori soglia', 'control outside the limit'], 'drift': ['deriva', 'drift'], 'incoherent': ['controlli non coerenti', 'inconsistent controls'],
    'channel': ['canale diverso da quello della taratura', 'channel different from the calibration'], 'method': ['metodo diverso da quello della taratura', 'method different from the calibration'], 'instrument': ['strumento diverso da quello della taratura', 'instrument different from the calibration'], 'column': ['colonna diversa da quella della taratura', 'column different from the calibration'],
    'range': ['fuori intervallo', 'outside the range'], 'profile': ['profilo che non ammette tarature salvate', 'profile that does not allow saved calibrations'], 'chart': ['carta di controllo: limite di azione superato', 'control chart: action limit exceeded'],
    'maintenance': ['manutenzione registrata dopo la taratura', 'maintenance recorded after the calibration'], 'normalized': ['dati normalizzati o in derivata', 'normalised or derivative data'], 'suitability': ['idoneità del sistema non superata', 'system suitability failed'],
    'need-two': ['servono due controlli (basso e alto)', 'two controls are needed (low and high)'], 'frequency': ['controlli troppo radi (almeno uno ogni 20 campioni)', 'controls too sparse (at least one every 20 samples)'], 'ctrl-window': ['tR del controllo fuori dalla finestra della voce', 'control tR outside the entry window'],
    'no-calibration': ['la voce non ha una taratura salvata', 'the entry has no saved calibration'], 'no-response': ['picco non trovato nella finestra di tR', 'peak not found in the tR window'], 'no-rrf': ['la voce non ha un RRF salvato', 'the entry has no saved RRF'], 'no-active-rf': ['manca il fattore di risposta del principio attivo misurato oggi', 'the response factor of the active ingredient measured today is missing'],
    'area-unit': ["unità dell'area diversa da quella della taratura", 'area unit different from the calibration']}
SC_NEED = {'intercept': ['intercetta significativa', 'significant intercept'], 'span-control': ['campioni fuori da 0,5–2 volte la risposta del controllo', 'samples outside 0.5–2 times the control response'], 'span5': ['campioni che coprono più di un fattore 5', 'samples spanning more than a factor of 5'], 'low25': ["campioni sotto il 25% dell'intervallo", 'samples below 25% of the range']}


def sc_reason_text(r, en):
    # hplc-stored-cal.js reasonText
    i = 1 if en else 0
    d = r.get('detail')
    code = r.get('code')
    base = (SC_REASON.get(code) or [js_String(code), js_String(code)])[i]
    su = 'on' if en else 'su'
    if code == 'ctrl-dev' and js_truthy(d):
        return base + ' (' + sc_sgn(d['dev'], en) + ' ' + su + ' ±' + sc_N(d['thr'], 0, en) + '%)'
    if code == 'drift' and js_truthy(d):
        return base + ' ' + sc_N(abs(d['drift']), 1, en) + '% ' + su + ' ' + sc_N(d['thr'], 0, en) + '%'
    if code == 'incoherent' and js_truthy(d):
        return base + ' (' + sc_N(d['diff'], 1, en) + '% ' + su + ' ' + sc_N(d['thr'], 0, en) + '%)'
    if code == 'need-two' and isinstance(d, list):
        return base + ': ' + ', '.join((SC_NEED.get(k) or [k, k])[i] for k in d)
    if code == 'range' and js_truthy(d):
        return base + ' (' + sc_N(d['x'], 3, en) + ' ' + ('outside' if en else 'fuori da') + ' ' + sc_N(d['range'][0], 3, en) + '–' + sc_N(d['range'][1], 3, en) + ')'
    if code == 'maintenance' and js_truthy(d):
        return base + ' (' + sc_fmt_date(d) + ')'
    if isinstance(d, str) and d and code in ('channel', 'method', 'instrument', 'column'):
        return base + ': ' + d
    return base


SC_MODE = {'nocontrol': ['salvata senza controllo', 'saved without control'], '1ctrl': ['salvata + 1 controllo', 'saved + 1 control'], '2ctrl': ['salvata + 2 controlli', 'saved + 2 controls'], 'rrf': ['RRF', 'RRF']}
SC_MARK = ['senza controllo del giorno', 'without a same-day control']


def sc_status_text(r, lang):
    # hplc-stored-cal.js statusText: frase di stato accanto al numero (schermo, CSV, PDF)
    en = lang == 'en'
    p = r.get('provenance') or {}
    dt = sc_fmt_date(p.get('calDate'))
    age = p.get('age')
    ag = (('age ' + js_str(age) + ' days') if en else ('età ' + js_str(age) + ' giorni')) if age is not None else ('age unknown' if en else 'età non nota')
    if not r.get('ok'):
        if r.get('code') == 'profile':
            pr = js_tpl(p.get('profile'))
            return ('Saved calibration not used: the ' + pr + ' profile requires a same-day line (for comparison only).') if en else \
                ('Taratura salvata non usata: il profilo ' + pr + ' richiede la retta del giorno (solo confronto).')
        return ('Calibration not verified today: ' + sc_reason_text(r, True) + '. Measure a same-day line.') if en else \
            ('Taratura non verificata oggi: ' + sc_reason_text(r, False) + '. Misura una retta del giorno.')
    mode = r.get('mode')
    if mode == 'nocontrol':
        return ('Saved calibration of ' + dt + ' (' + ag + '), without a same-day control: an instrument drift would not be seen. A control is recommended.') if en else \
            ('Taratura salvata del ' + dt + ' (' + ag + '), senza controllo del giorno: una deriva dello strumento non verrebbe vista. Consigliato un controllo.')
    if mode == 'rrf':
        return ('Saved RRF of ' + dt + ' (' + ag + ') on the response factor of the active ingredient measured today.') if en else \
            ('RRF salvato del ' + dt + ' (' + ag + ') sul fattore di risposta del principio attivo misurato oggi.')
    n = 2 if mode == '2ctrl' else 1
    dv = ' / '.join(sc_sgn(v, en) for v in r.get('devs') or [])
    if en:
        s = 'Saved calibration of ' + dt + ' (' + ag + '), updated today with ' + str(n) + ' control' + ('s' if n > 1 else '') + '; deviations ' + dv
    else:
        s = 'Taratura salvata del ' + dt + ' (' + ag + '), aggiornata oggi con ' + str(n) + ' controll' + ('i' if n > 1 else 'o') + '; scostamenti ' + dv
    if r.get('drift') is not None:
        s += ('; drift ' + sc_N(abs(r['drift']), 1, True) + '%') if en else ('; deriva ' + sc_N(abs(r['drift']), 1, False) + '%')
    return s + '.'


SC_WARN = {'reminder': ['Promemoria: taratura di oltre {0} giorni.', 'Reminder: calibration older than {0} days.'], 'exploratory': ['Stima esplorativa.', 'Exploratory estimate.'], 'chart-warn': ["Carta di controllo: regola 2_2s, da tenere d'occhio.", 'Control chart: 2_2s rule, keep an eye on it.'],
           'channel-unverified': ['Ampiezza di banda o riferimento non dichiarati nel file: non verificati.', 'Bandwidth or reference not stated in the file: not verified.'], 'method-unverified': ['Metodo non dichiarato nel file: non verificato.', 'Method not stated in the file: not verified.'], 'column-unverified': ['Colonna non dichiarata nel file: non verificata.', 'Column not stated in the file: not verified.'],
           'range-unknown': ["Intervallo della taratura non dichiarato: un'estrapolazione non si può escludere.", 'Calibration range not stated: extrapolation cannot be ruled out.'], 'area-unit-assumed': ["Unità dell'area della voce assunta: {0}.", 'Entry area unit assumed: {0}.'], 'coverage': ['U con fattore di copertura {0}.', 'U with coverage factor {0}.'], 'u-slope-sd': ['Incertezza dalla deviazione standard della pendenza della fonte (s_y/x non dichiarato) più il 5% tra i giorni.', 'Uncertainty from the source slope standard deviation (s_y/x not stated) plus 5% between days.'], 'no-uncertainty': ['Incertezza non calcolabile: la voce non ha s_y/x né una carta di controllo.', 'Uncertainty not computable: the entry has neither s_y/x nor a control chart.']}


def sc_warning_texts(r, lang):
    # hplc-stored-cal.js warningTexts
    i = 1 if lang == 'en' else 0
    en = lang == 'en'
    out = []
    for w in r.get('warnings') or []:
        code = w.get('code')
        t = (SC_WARN.get(code) or [js_String(code), js_String(code)])[i]
        d = w.get('detail')
        if code == 'coverage' and js_truthy(d):
            if js_truthy(d.get('df')):
                rep = sc_N(d['kU'], 2, en) + ' (t, ' + js_str(d['df']) + ' ' + ('degrees of freedom' if en else 'gradi di libertà') + ')'
            else:
                rep = '2 (degrees of freedom not known)' if en else '2 (gradi di libertà non noti)'
            out.append(js_replace_first(t, '{0}', rep))
            continue
        out.append(js_replace_first(t, '{0}', js_String(d) if d is not None else ''))
    return out


def sc_mode_text(r, lang):
    # hplc-stored-cal.js modeText
    if r.get('ok'):
        return (SC_MODE.get(r.get('mode')) or ['', ''])[1 if lang == 'en' else 0]
    return 'not verified' if lang == 'en' else 'non verificata'


def sc_mark_text(lang):
    # hplc-stored-cal.js markText
    return SC_MARK[1 if lang == 'en' else 0]


def sc_provenance_text(r, lang):
    # hplc-stored-cal.js provenanceText: libreria, voce, data della taratura
    p = r.get('provenance') or {}
    en = lang == 'en'
    s = ('library' if en else 'libreria') + ' «' + js_tpl(p.get('library')) + '»'
    if js_truthy(p.get('revision')):
        s += ' rev. ' + js_tpl(p['revision'])
    s += ' · ' + ('entry' if en else 'voce') + ' «' + js_tpl(p.get('entry')) + '»'
    if js_truthy(p.get('entryRev')):
        s += ' rev. ' + js_tpl(p['entryRev'])
    s += ' · ' + ('calibration of' if en else 'taratura del') + ' ' + js_or(sc_fmt_date(p.get('calDate')), 'unknown date' if en else 'data non nota')
    if p.get('source') == 'letteratura':
        s += ' (literature)' if en else ' (letteratura)'
    return s


# ============================== app/library.js ==============================
def lib_str(v, mx=4000):
    # library.js str: testi limitati, numeri finiti come testo
    if isinstance(v, str):
        return u16_slice(v, mx)
    if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v):
        return js_str(v)
    return ''


def norm_txt(s):
    # library.js normTxt: minuscole, senza accenti, solo lettere e cifre
    t = unicodedata.normalize('NFD', js_lower(js_String(s) if js_truthy(s) else ''))
    t = re.sub('[̀-ͯ]', '', t)
    return re.sub(r'[^a-z0-9]+', ' ', t).strip(' ')


def clean_instrument(i):
    # library.js cleanInstrument
    i = i if isinstance(i, dict) else {}
    return {'brand': js_trim(lib_str(i.get('brand'), 80)), 'model': js_trim(lib_str(i.get('model'), 120)),
            'detector': js_trim(lib_str(i.get('detector'), 120)), 'serial': js_trim(lib_str(i.get('serial'), 80))}


def instrument_text(i):
    # library.js instrumentText
    i = clean_instrument(i)
    head = ' '.join(v for v in (i['brand'], i['model']) if v)
    return ' · '.join(v for v in (head, i['detector']) if v) + ((' (S/N ' + i['serial'] + ')') if i['serial'] else '')


def instrument_compare(a, b):
    # library.js instrumentCompare: 'same', 'compatible', 'different' o 'unknown'
    a, b = clean_instrument(a), clean_instrument(b)
    why = []

    def nums(s):
        return re.findall(r'\d{3,4}', norm_txt(s), re.A)

    def gen(s):
        return re.search(r'\b(iii|ii)\b', norm_txt(s), re.A)

    def mod_code(s):
        m = re.search(r'G[1-7]\d{3}[A-F]', s or '', re.I | re.A)
        return m.group(0).upper() if m else ''

    def typ(s):
        m = re.search(r'\b(DAD|VWD|MWD|FLD|RID|ELSD|PDA|UV|MS|ATR|DTGS|MCT|CCD|SDD)\b', s or '', re.I | re.A)
        return m.group(1).upper() if m else ''
    if not a['model'] and not a['detector'] and not b['model'] and not b['detector']:
        return {'level': 'unknown', 'why': []}
    if a['brand'] and b['brand'] and norm_txt(a['brand']) != norm_txt(b['brand']):
        why.append('brand')
    if a['model'] and b['model']:
        na, nb = nums(a['model']), nums(b['model'])
        if (na and nb and na[0] != nb[0]) or (not na and not nb and norm_txt(a['model']) != norm_txt(b['model'])):
            why.append('model')
        else:
            ga, gb = gen(a['model']), gen(b['model'])
            if (ga.group(1) if ga else '') != (gb.group(1) if gb else '') and (ga or gb):
                why.append('model')
    if a['detector'] and b['detector']:
        ca, cb = mod_code(a['detector']), mod_code(b['detector'])
        if (ca != cb) if (ca and cb) else (typ(a['detector']) and typ(b['detector']) and typ(a['detector']) != typ(b['detector'])):
            why.append('detector')
    if a['serial'] and b['serial'] and norm_txt(a['serial']) != norm_txt(b['serial']):
        why.append('serial')
    if why:
        return {'level': 'different', 'why': why}

    def full(x):
        return x['model'] and x['detector']
    return {'level': 'same' if (full(a) and full(b)) else 'compatible', 'why': []}


# ---------- canale del rivelatore ----------
# AcchChannels.parseChannel (app/channels-core.js) usa lookbehind di lunghezza variabile che il modulo re di Python
# non ammette: la lettura del testo del canale la fa l'app e arriva nella tabella input['channels'] (testo → oggetto).
def ch_fmt_n(v):
    # channels-core.js fmtN
    return num_prec(v, 6)


def format_channel(o):
    # channels-core.js formatChannel
    if not o:
        return ''
    p = []
    if js_truthy(o.get('det')):
        p.append(o['det'])
    if o.get('ex') is not None and o.get('em') is not None:
        p.append('ex ' + ch_fmt_n(o['ex']) + ' nm em ' + ch_fmt_n(o['em']) + ' nm')
    elif o.get('wl') is not None:
        p.append(ch_fmt_n(o['wl']) + (('/' + ch_fmt_n(o['bw'])) if o.get('bw') is not None else '') + ' nm')
    ref = o.get('ref')
    if ref == 'off':
        p.append('ref off')
    elif js_truthy(ref):
        p.append('ref ' + ch_fmt_n(ref['wl']) + '/' + ch_fmt_n(ref['bw']) + ' nm')
    if js_truthy(o.get('extracted')):
        p.append('extracted')
    return ' '.join(p)


def parse_channel(c, tab):
    # library.js parseChannel; la lettura del testo è quella dell'app (tabella)
    if not js_truthy(c):
        return None
    if isinstance(c, dict):
        if 'det' in c or 'wl' in c:
            return c
        def n(v):
            if v is None or v == '':
                return None
            x = to_js_number(v)
            return x if math.isfinite(x) else None
        L, B = n(c.get('lambda')), n(c.get('bandwidth'))
        if c.get('reference') == 'off':
            R = 'ref off'
        elif n(c.get('reference')) is not None:
            rb = n(c.get('refBandwidth'))
            R = 'ref ' + js_str(n(c['reference'])) + '/' + js_str(rb if rb is not None else 0) + ' nm'
        else:
            R = ''
        parts = [lib_str(c.get('detector'), 40), (js_str(L) + (('/' + js_str(B)) if B is not None else '') + ' nm') if L is not None else '', R]
        c = ' '.join(x for x in parts if x)
    t = js_String(c)
    if t not in tab:
        raise NonTrascritto('parseChannel non trascritto: il testo del canale «' + t + '» non è nella tabella input["channels"] (lookbehind variabili di channels-core.js)')
    return tab[t]


def to_js_number(v):
    # +v di library.js num (testo con la virgola → punto)
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v)
    if isinstance(v, str):
        s = js_trim(v.replace(',', '.', 1))
        if s == '':
            return 0.0
        try:
            if re.fullmatch(r'[-+]?(Infinity|(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?)', s, re.A):
                return float(s.replace('Infinity', 'inf'))
            if re.fullmatch(r'0[xX][0-9a-fA-F]+', s):
                return float(int(s, 16))
        except ValueError:
            pass
        return NAN
    raise NonTrascritto('conversione in numero non trascritta per ' + type(v).__name__)


def channel_text(c, tab):
    # library.js channelText
    o = parse_channel(c, tab)
    return format_channel(o) if o else ''


def det_type(d):
    # library.js detType
    m = re.match(r'(DAD|MWD|VWD|FLD|RID|ELSD|PDA|UV|TUV)', js_String(d) if js_truthy(d) else '', re.I | re.A)
    return m.group(1).upper() if m else ''


def channel_compare(saved, seen, tab):
    # library.js channelCompare: rivelatore e λ obbligatori, banda e riferimento solo se presenti in entrambi
    a, b = parse_channel(saved, tab), parse_channel(seen, tab)
    out = {'ok': True, 'unverified': [], 'diff': []}
    if not a:
        return out
    if js_truthy(a.get('det')):
        generic = not re.search(r'\d', a['det'], re.A)
        if not b or not js_truthy(b.get('det')):
            out['ok'] = False; out['diff'].append('det'); out['missing'] = True
        elif (det_type(a['det']) != det_type(b['det'])) if generic else (RE_WSN.sub('', a['det']).upper() != RE_WSN.sub('', b['det']).upper()):
            out['ok'] = False; out['diff'].append('det')
    for k in ('wl', 'ex', 'em'):
        if a.get(k) is None:
            continue
        if not b or b.get(k) is None:
            out['ok'] = False; out['diff'].append(k); out['missing'] = True
        elif abs(a[k] - b[k]) > 0.5:
            out['ok'] = False; out['diff'].append(k)
    if a.get('bw') is not None:
        if not b or b.get('bw') is None:
            out['unverified'].append('bw')
        elif abs(a['bw'] - b['bw']) > 1e-9:
            out['ok'] = False; out['diff'].append('bw')
    if a.get('ref') is not None:
        if not b or b.get('ref') is None:
            out['unverified'].append('ref')
        elif js_json(a['ref']) != js_json(b['ref']):
            out['ok'] = False; out['diff'].append('ref')
    if b:
        ae = a['extracted'] if 'extracted' in a else None
        be = bool(js_truthy(b.get('extracted')))
        if not (isinstance(ae, bool) and ae == be):
            out['ok'] = False; out['diff'].append('extracted')
    return out


def live_entries(lib):
    # library.js liveEntries
    return [e for e in lib.get('entries') or [] if not js_truthy(e.get('deleted'))]


def match_entries(lib, peaks, opt=None):
    # library.js matchEntries: ogni picco a una sola voce, la più vicina in unità di finestra; RRT se c'è il riferimento
    opt = opt or {}
    xs = [(p if not isinstance(p, dict) else p.get('x')) for p in (peaks or [])]
    xs = [x for x in xs if fin(x)]
    live = live_entries(lib)
    def_w = js_or(opt.get('defaultWindow'), 0.1)
    ref_shift = {}
    for e in live:
        if not js_truthy(e.get('rrt')) or not js_truthy(e.get('rrtRef')):
            continue
        r = next((q for q in live if q.get('id') == e['rrtRef']), None)
        if r is None or r.get('x') is None:
            continue
        w = js_or(r.get('window'), def_w)
        hits = sorted([x for x in xs if abs(x - r['x']) <= w], key=lambda x: abs(x - r['x']))
        if hits:
            ref_shift[e['id']] = e['rrt'] * hits[0]
    cand = []
    for e in live:
        if e.get('x') is None:
            continue
        w = js_or(e.get('window'), def_w)
        x0 = ref_shift[e['id']] if ref_shift.get(e['id']) is not None else e['x']
        for x in xs:
            if abs(x - x0) <= w:
                cand.append({'e': e, 'x': x, 'x0': x0, 'd': abs(x - x0) / w})
    cand.sort(key=lambda c: c['d'])
    used_e, used_x, hit = set(), set(), {}
    for c in cand:
        if c['e']['id'] in used_e or c['x'] in used_x:
            continue
        used_e.add(c['e']['id']); used_x.add(c['x']); hit[c['e']['id']] = c['x']
    out = []
    for e in live:
        if e.get('x') is None:
            continue
        x0 = ref_shift[e['id']] if ref_shift.get(e['id']) is not None else e['x']
        h = hit[e['id']] if e['id'] in hit else None
        out.append({'entry': e, 'x': h, 'expected': x0, 'found': h is not None, 'byRrt': ref_shift.get(e['id']) is not None})
    return out


# ============================== app/library-ui.js ==============================
LIB_TECHS = ['hplc', 'ftir', 'raman', 'xrf', 'uv']
# index.html INSTR[...].xPdf e SNAP_TOL (copiati: servono ad appAreaUnit e alla finestra predefinita di matchEntries)
X_PDF = {'ftir': 'cm-1', 'raman': 'cm-1', 'uv': 'nm', 'fluo': 'nm', 'hplc': 'min', 'xrf': 'keV', 'libs': 'nm', 'tga': '°C', 'dsc': '°C',
         'nmr': 'ppm', 'epr': 'mT', 'sorp': 'p/p₀', 'chem': '°C', 'gen': ''}
SNAP_TOL = {'ftir': 3, 'raman': 3, 'uv': 2, 'fluo': 3, 'hplc': 0, 'xrf': 0.06, 'libs': 0.15, 'tga': 6, 'dsc': 3, 'nmr': 1, 'epr': 0.0008, 'sorp': 0, 'chem': 0, 'gen': 0}
LIB_PROF_NAME = {'ricerca': ['Ricerca', 'Research'], 'esplorativa': ['Esplorativa', 'Exploratory'], 'impurezze': ['Impurezze', 'Impurities'],
                 'dosaggio': ['Dosaggio', 'Assay'], 'tracce': ['Tracce e residui', 'Traces and residues'], 'bioanalisi': ['Bioanalisi', 'Bioanalysis']}


class _Ctx:
    def __init__(self, inp):
        self.lang = 'en' if inp.get('lang') == 'en' else 'it'          # LANG: documenti (CSV)
        self.ui_lang = 'en' if js_or(inp.get('ui_lang'), self.lang) == 'en' else 'it'   # AcchI18n.lang: testi di quantRows
        self.today = inp.get('today')
        self.libs = inp.get('libraries') or {}
        self.tab = inp.get('channels') or {}
        self.day_line = inp.get('day_line') or {}
        self.files = inp.get('files') or []
        for i, f in enumerate(self.files):
            f['_i'] = i
            if not isinstance(f.get('an'), dict):
                f['an'] = {}
        self.cache = {}

    def T(self, it, en):
        return en if self.ui_lang == 'en' else it

    def TD(self, it, en):
        return en if self.lang == 'en' else it


def lib_supports(f):
    # library-ui.js supports
    return f.get('instr') in LIB_TECHS and not js_truthy(f.get('uncal'))


def lib_prof_name(ctx, p):
    # library-ui.js profName(p, true): nella lingua dei documenti
    return (LIB_PROF_NAME.get(p) or [js_String(p), js_String(p)])[1 if ctx.lang == 'en' else 0]


def lib_ND(ctx, v, d=None):
    # library-ui.js ND: 7 cifre significative, virgola in italiano
    if v is None or not js_isfinite(v):
        return ''
    return js_replace_first(num_prec(float(v), d or 7), '.', ctx.TD(',', '.'))


def file_channel(ctx, f):
    # library-ui.js fileChannel: f.channel, altrimenti chanOf(f) o l'intestazione se dice lo stesso canale con più dettagli
    if 'channel' in f and 'channel_src' not in f:
        return f['channel']
    src = f.get('channel_src') or {}
    if js_truthy(src.get('channel')):
        c = parse_channel(src['channel'], ctx.tab)
        if c:
            return channel_text(c, ctx.tab)
    c2 = parse_channel(js_or(src.get('chan_of'), ''), ctx.tab)
    c3 = parse_channel((f.get('rec') or {}).get('channel'), ctx.tab)
    if c2 and c3 and (c2.get('wl') == c3.get('wl') or c2.get('wl') is None) and (not js_truthy(c2.get('det')) or not js_truthy(c3.get('det')) or c2.get('det') == c3.get('det')):
        return channel_text(c3, ctx.tab)
    return js_or(channel_text(c2 or c3, ctx.tab), None)


def app_area_unit(f):
    # library-ui.js appAreaUnit
    if js_truthy(f.get('area_unit_app')):
        return f['area_unit_app']
    P = f.get('proc')
    if not P:
        raise NonTrascritto('appAreaUnit: mancano proc.kind o area_unit_app per «' + js_String(f.get('name')) + '»')
    yu = {'A': 'A', 'mAU': 'mAU', 'I': 'counts'}.get(P.get('kind')) or 'u'
    xu = X_PDF.get(f.get('instr')) or 'x'
    return yu + '·' + xu


def method_check(lib, e, seen):
    # library-ui.js methodCheck
    m = js_or(e.get('method'), '')
    if not m:
        return None
    if not js_truthy(seen):
        return {'ok': True, 'unverified': True}

    def n(s):
        return norm_txt(re.sub(r'\.m\Z', '', js_String(s), flags=re.I))
    d = next((x for x in (lib.get('methods') or []) if x.get('id') == m), None)
    ok = n(seen) == n(m) or (d is not None and any(n(a) == n(seen) for a in (d.get('aliases') or [])))
    return {'ok': True} if ok else {'ok': False, 'detail': js_String(seen) + ' / ' + js_String(m), 'seen': seen}


def response_of(g, e, at):
    # library-ui.js responseOf: area (o altezza) del picco nei dati elaborati
    P = g.get('proc')
    if P is None:
        R = g.get('responses')
        if R is None or e['id'] not in R:
            raise NonTrascritto('responseOf: mancano proc o responses[' + js_String(e.get('id')) + '] per «' + js_String(g.get('name')) + '»')
        return R[e['id']]
    xs, ys = P.get('xs'), P.get('ys')
    if not xs or len(xs) < 9:
        return None
    if any(v is None for v in xs) or any(v is None for v in ys):
        raise NonTrascritto('responseOf: dati elaborati con valori non finiti (null nel JSON)')
    cal = e.get('cal')
    meas_h = js_truthy(cal) and cal.get('measure') == 'height'
    integ = e.get('integration')
    if js_truthy(integ):
        sh = at - e['x'] if (at is not None and e.get('x') is not None) else 0.0
        v = mv_value(P, integ['a'] + sh, integ['b'] + sh, 'height' if meas_h else 'area')
        return None if (v is None or not math.isfinite(v)) else v
    if meas_h:
        y = interp_y(xs, ys, at)
        return y if math.isfinite(y) else None
    dr = P.get('dir')
    a = peak_areas(xs, [-v for v in ys] if (dr is not None and dr < 0) else ys, [at])
    a = a[0] if a else None
    return a['area'] if (a and math.isfinite(a['area'])) else None


def day_compare(ctx, f, e, fac):
    # library-ui.js dayCompare: retta del giorno di «Più campioni» sulla stessa banda contro la pendenza salvata
    if f.get('instr') not in ctx.day_line:
        raise NonTrascritto('dayCompare: manca input["day_line"]["' + js_String(f.get('instr')) + '"] (mvCfg e mvCalib dell\'app)')
    dl = ctx.day_line[f['instr']]
    if not dl:
        return {'none': True}
    c = dl.get('cfg') or {}
    if c.get('model') in ('pls', 'trend') or c.get('a') is None or c.get('b') is None or (c.get('c') is not None and c.get('d') is not None):
        return {'none': True}
    x0 = e.get('x')
    if x0 is None or x0 < min(c['a'], c['b']) or x0 > max(c['a'], c['b']):
        return {'none': True}
    cal = dl.get('cal')
    if not cal or cal.get('b') is None or js_truthy(cal.get('few')):
        return {'none': True}
    b_day = cal['b'] * fac
    return {'diff': 100 * (jdiv(b_day, e['cal']['slope']) - 1), 'bDay': b_day, 'bSaved': e['cal']['slope']}


def compare_text(r, lg):
    # library-ui.js compareText
    c = r.get('compare') if r else None
    en = lg == 'en'
    if not c:
        return ''
    if js_truthy(c.get('none')):
        return 'No same-day line on this band yet: measure the standards in «Multiple samples» to see the comparison.' if en else \
            'Manca ancora la retta del giorno su questa banda: misura gli standard in «Più campioni» per vedere il confronto.'
    d = c['diff']
    v = ('+' if d > 0 else ('−' if d < 0 else '')) + js_fixed(abs(d), 1).replace('.', '.' if en else ',', 1)
    return ('Same-day line: slope ' + v + '% from the saved one.') if en else ('Retta del giorno: pendenza ' + v + '% rispetto a quella salvata.')


def quant_rows(ctx, f):
    # library-ui.js quantRows: per ogni voce della libreria scelta, picco trovato, risposta ed esito del calcolo
    lid = f.get('lib_id')
    if not js_truthy(lid):
        return {'rows': []}
    if lid not in ctx.libs:
        raise NonTrascritto('quantRows: la libreria «' + js_String(lid) + '» non è in input["libraries"]')
    lib = ctx.libs[lid]
    rec = f.get('rec') or {}
    ins_f = clean_instrument(f.get('instrument'))
    ins_cmp = instrument_compare(lib.get('instrument'), ins_f)
    chan = file_channel(ctx, f)
    norm = js_truthy(f.get('normalized'))
    files = ctx.files
    others = [g for g in files if g is not f and g.get('instr') == f.get('instr') and g.get('lib_id') == lid]
    dw = 0.1 if f.get('instr') == 'hplc' else js_or(SNAP_TOL.get(f.get('instr')), 2.0)
    mcache = {}

    def match_of(g):
        if g['_i'] not in mcache:
            mcache[g['_i']] = {q['entry']['id']: q for q in match_entries(lib, g.get('peaks') or [], {'defaultWindow': dw})}
        return mcache[g['_i']]
    ctrl_files = [g for g in files if g.get('instr') == f.get('instr') and g['an'].get('role') == 'qc' and js_truthy(g['an'].get('libCtrl'))
                  and (g is f or g in others)]
    rows = []
    for m in list(match_of(f).values()):
        e = m['entry']
        cal = e.get('cal')
        row = {'entry': e, 'found': m['found'], 'x': m['x'], 'expected': m['expected'], 'y': None, 'res': None}
        if not m['found'] or not js_truthy(cal):
            rows.append(row)
            continue
        raw = response_of(f, e, m['x'])
        unit = app_area_unit(f)
        af = area_factor(unit, cal.get('areaUnit'))
        row['yApp'] = raw
        row['y'] = raw * af['f'] if (raw is not None and af) else None
        row['unitApp'] = unit
        check = {'channel': None, 'method': None, 'instrument': None, 'column': None}
        if js_truthy(e.get('channel')):
            cc = channel_compare(e['channel'], chan, ctx.tab)
            check['channel'] = {'ok': cc['ok'], 'unverified': cc['unverified'],
                                'detail': None if cc['ok'] else (js_or(channel_text(chan, ctx.tab), ctx.T('non dichiarato', 'not stated')) + ' / ' + channel_text(e['channel'], ctx.tab))}
        check['method'] = method_check(lib, e, rec.get('method'))
        if ins_cmp['level'] == 'different':
            check['instrument'] = {'ok': False, 'detail': js_or(instrument_text(ins_f), '?') + ' / ' + instrument_text(lib.get('instrument'))}
        if js_truthy(e.get('column')) and js_truthy(rec.get('column')) and norm_txt(e['column']) != norm_txt(rec['column']):
            check['column'] = {'ok': False, 'detail': js_String(rec['column']) + ' / ' + js_String(e['column'])}
        elif js_truthy(e.get('column')) and not js_truthy(rec.get('column')):
            check['column'] = {'ok': True, 'unverified': True}
        fac = af['f'] if af else 1.0
        controls = []
        for g in ctrl_files:
            if g is f:
                continue
            nom = g['an']['libCtrl'].get(e['id'])
            if not js_gt0(nom):
                continue
            mg = match_of(g).get(e['id'])
            yy = response_of(g, e, mg['x']) if (mg and mg['found']) else None
            if yy is None:
                continue
            controls.append({'nominal': nom, 'y': yy * fac, 'tR': mg['x'], 'order': g['_i'], 'pos': js_or(g['an'].get('libPos'), None), 'name': g.get('name')})
        sample_ys = []
        for g in [f] + [g for g in others if g['an'].get('role') != 'qc']:
            mg = m if g is f else match_of(g).get(e['id'])
            yy = response_of(g, e, mg['x']) if (mg and mg['found']) else None
            if yy is not None:
                sample_ys.append(yy * fac)
        is_ctrl = f['an'].get('role') == 'qc'
        if af:
            row['res'] = sc_quantify({'entry': e, 'lib': lib, 'today': ctx.today, 'y': row['y'], 'controls': controls, 'sampleYs': sample_ys,
                                      'check': check, 'normalized': norm, 'sampleOrder': f['_i'], 'areaUnitAssumed': bool(af.get('assumed'))})
        else:
            row['res'] = {'ok': False, 'code': 'area-unit', 'provenance': {'library': lib.get('name'), 'entry': e.get('name'), 'calDate': cal.get('date'),
                          'revision': lib.get('revision'), 'entryRev': e.get('rev'), 'profile': lib.get('profile')}, 'warnings': [], 'devs': []}
        if row['res'] and row['res'].get('code') == 'profile' and af:
            row['res']['compare'] = day_compare(ctx, f, e, af['f'])
        row['controls'] = controls
        row['isCtrl'] = is_ctrl
        rows.append(row)
    return {'rows': rows, 'lib': lib, 'insCmp': ins_cmp}


def export_rows(ctx, inc):
    # library-ui.js exportRows
    out = []
    for f in inc or []:
        if not lib_supports(f):
            continue
        q = quant_rows(ctx, f)
        for w in q['rows']:
            if not js_truthy(w['entry'].get('cal')) or not js_truthy(w['res']):
                continue
            out.append({'f': f, 'w': w, 'lib': q['lib']})
    return out


LIB_CSV_HEAD = (['File', 'Nome', 'Analita', 'tR atteso', 'tR trovato', 'Area', 'Unità area', 'Concentrazione', 'U', 'Fattore di copertura', 'Unità', 'Stato', 'Segno', 'Messaggio', 'Avvisi', 'Profilo', 'Metodo di taratura', 'k', 'Livelli dei controlli', 'Scostamenti %', 'Deriva %', 'Stato della carta', 'Età (giorni)', 'Data taratura', 'Lotto standard', 'Libreria', 'Id libreria', 'Revisione libreria', 'Voce', 'Id voce', 'Revisione voce', 'Strumento della libreria', 'Tipo di campione', 'Fonte', 'Motivazione soglie allargate'],
                ['File', 'Name', 'Analyte', 'Expected tR', 'Found tR', 'Area', 'Area unit', 'Concentration', 'U', 'Coverage factor', 'Unit', 'Status', 'Mark', 'Message', 'Warnings', 'Profile', 'Calibration method', 'k', 'Control levels', 'Deviations %', 'Drift %', 'Chart status', 'Age (days)', 'Calibration date', 'Standard lot', 'Library', 'Library id', 'Library revision', 'Entry', 'Entry id', 'Entry revision', 'Library instrument', 'Sample type', 'Source', 'Reason for widened limits'])


def csv_rows(ctx, R):
    # library-ui.js csvRows: le 35 colonne di concentrazioni_da_libreria.csv
    lg = ctx.TD('it', 'en')
    if not R:
        return None
    rows = [list(LIB_CSV_HEAD[1 if lg == 'en' else 0])]
    for it in R:
        f, w, lib = it['f'], it['w'], it['lib']
        r, e = w['res'], w['entry']
        p = r.get('provenance') or {}
        cal = e['cal']
        ok = bool(r.get('ok'))
        if 'title' not in f:
            raise NonTrascritto('csvRows: manca «title» (dispTitle) per «' + js_String(f.get('name')) + '»')
        if cal.get('source') == 'letteratura':
            src = e.get('source')
            fonte = js_or(js_or(src.get('doi'), src.get('citation')) if js_truthy(src) else None, ctx.TD('letteratura', 'literature'))
        else:
            fonte = ctx.TD("taratura dell'utente", 'user calibration')
        ch = r.get('chart')
        rows.append([
            f.get('name'), f['title'], e.get('name'), lib_ND(ctx, w['expected']), lib_ND(ctx, w['x']), lib_ND(ctx, w['y']), js_or(cal.get('areaUnit'), ''),
            lib_ND(ctx, r.get('x')) if ok else '', lib_ND(ctx, r['U'], 4) if (ok and r.get('U') is not None) else '',
            lib_ND(ctx, r['u']['kU'], 4) if (ok and js_truthy(r.get('u'))) else '', js_or(cal.get('concUnit'), ''),
            ctx.TD('ok', 'ok') if ok else ctx.TD('non verificata', 'not verified'),
            sc_mark_text(lg) if (ok and r.get('mode') == 'nocontrol') else '',
            ' '.join(s for s in (sc_status_text(r, lg), compare_text(r, lg)) if s),
            ' '.join(sc_warning_texts(r, lg)), lib_prof_name(ctx, js_or(p.get('profile'), lib.get('profile'))), sc_mode_text(r, lg),
            lib_ND(ctx, r['k'], 6) if r.get('k') is not None else '',
            ' '.join(lib_ND(ctx, c['nominal']) for c in (w.get('controls') or [])),
            ' '.join(lib_ND(ctx, v, 3) for v in (r.get('devs') or [])),
            lib_ND(ctx, r['drift'], 3) if r.get('drift') is not None else '',
            ((js_or(ch.get('rule'), 'ok')) if ch.get('active') else ctx.TD('non attiva', 'not active')) if js_truthy(ch) else '',
            p['age'] if p.get('age') is not None else '', js_or(p.get('calDate'), ''), js_or(p.get('standardLot'), ''), js_or(p.get('library'), ''),
            js_or(p.get('libraryId'), ''), js_or(p.get('revision'), ''), js_or(p.get('entry'), ''), js_or(p.get('entryId'), ''), js_or(p.get('entryRev'), ''),
            instrument_text(lib.get('instrument')), js_or(lib.get('sampleType'), ''), fonte, js_or(lib.get('thresholdReason'), '')])
    return rows


def export_text(ctx, rows):
    # library-ui.js exportFiles: nome del file e testo (BOM, separatore ; o , e righe CRLF)
    csep = ctx.TD(';', ',')

    def cell(v):
        s = '' if v is None else js_String(v)
        if re.search(r'[";\r\n]', s) or csep in s:
            return '"' + s.replace('"', '""') + '"'
        return s
    name = ctx.TD('concentrazioni_da_libreria.csv', 'concentrations_from_library.csv')
    return name, '﻿' + '\r\n'.join(csep.join(cell(v) for v in r) for r in rows)


def library_rows(inp):
    """Ingresso: dizionario (o testo JSON) descritto nel rapporto I12-libreria. Uscita: {'name', 'rows', 'text', 'results'};
    rows e text sono None quando l'app non scriverebbe il file (nessuna voce con taratura e picco)."""
    if isinstance(inp, (str, bytes)):
        inp = json.loads(inp)
    inp = _floats(inp)
    ctx = _Ctx(inp)
    inc = inp.get('inc')
    sel = ctx.files if inc is None else [ctx.files[int(i)] for i in inc]
    R = export_rows(ctx, sel)
    rows = csv_rows(ctx, R)
    results = []
    for it in R:
        r = it['w']['res']
        results.append({'file': it['f'].get('name'), 'entry': it['w']['entry'].get('id'), 'ok': bool(r.get('ok')), 'code': r.get('code'), 'mode': r.get('mode'),
                        'y': it['w'].get('y'), 'x': r.get('x'), 'U': r.get('U'), 'kU': (r.get('u') or {}).get('kU'), 'k': r.get('k'),
                        'devs': r.get('devs') or [], 'drift': r.get('drift'), 'age': (r.get('provenance') or {}).get('age')})
    name = ctx.TD('concentrazioni_da_libreria.csv', 'concentrations_from_library.csv')
    if rows is None:
        return {'name': name, 'rows': None, 'text': None, 'results': results}
    name, text = export_text(ctx, rows)
    return {'name': name, 'rows': [[('' if v is None else js_String(v)) for v in r] for r in rows], 'text': text, 'results': results}
