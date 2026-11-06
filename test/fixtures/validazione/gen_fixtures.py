#!/usr/bin/env python3
"""Genera le fixture di riferimento per la validazione (R2, R3) di Acchiappaspettri.

Uso:  ~/build/venv-val/bin/python -I test/fixtures/validazione/gen_fixtures.py
Scrive accanto a questo file: quantili.json, wls.json, mandel.json, deconv.json.
Tutti i dati di taratura e di deconvoluzione sono SINTETICI (generatore con seme fisso), dichiarati come tali nei JSON.
I riferimenti sono calcolati in precisione estesa con mpmath (WLS, Mandel) o con scipy (quantili, curve_fit).
"""
import json, os, sys, platform, datetime
import numpy as np, scipy, mpmath
from scipy import stats
from scipy.optimize import curve_fit

HERE = os.path.dirname(os.path.abspath(__file__))
mpmath.mp.dps = 50
META = {
    "generato": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "python": sys.version.split()[0], "numpy": np.__version__, "scipy": scipy.__version__, "mpmath": mpmath.__version__,
    "piattaforma": platform.platform(), "script": "test/fixtures/validazione/gen_fixtures.py",
}

def dump(name, obj):
    obj = dict(meta=META, **obj)
    with open(os.path.join(HERE, name), "w") as fh:
        json.dump(obj, fh, indent=1, allow_nan=False)
        fh.write("\n")

# ---------------- quantili t e F ----------------
PS = [0.90, 0.95, 0.975, 0.99, 0.995]
t_rows = [[df, p, float(stats.t.ppf(p, df))] for df in range(1, 201) for p in PS]
D1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 24, 30, 40, 60, 120, 200]
f_rows = [[d1, d2, p, float(stats.f.ppf(p, d1, d2))] for d1 in D1 for d2 in range(1, 201) for p in PS]

# controllo indipendente di scipy con mpmath (radice della beta incompleta regolarizzata, 50 cifre) su un sottoinsieme
def t_mp(p, df):
    df = mpmath.mpf(df); p = mpmath.mpf(p)
    cdf = lambda t: 1 - mpmath.betainc(df/2, mpmath.mpf(1)/2, 0, df/(df+t*t), regularized=True)/2
    return mpmath.findroot(lambda t: cdf(t) - p, mpmath.mpf(stats.t.ppf(float(p), float(df))))
def f_mp(p, d1, d2):
    d1 = mpmath.mpf(d1); d2 = mpmath.mpf(d2); p = mpmath.mpf(p)
    cdf = lambda F: mpmath.betainc(d1/2, d2/2, 0, d1*F/(d1*F+d2), regularized=True)
    return mpmath.findroot(lambda F: cdf(F) - p, mpmath.mpf(stats.f.ppf(float(p), float(d1), float(d2))))
chk = []
for df in [1, 2, 3, 5, 10, 30, 100, 200]:
    for p in PS:
        ref = t_mp(p, df); chk.append(abs(float((mpmath.mpf(stats.t.ppf(p, df)) - ref)/ref)))
for d1, d2 in [(1, 1), (1, 3), (2, 2), (1, 37), (2, 100), (10, 10), (200, 200), (4, 1)]:
    for p in PS:
        ref = f_mp(p, d1, d2); chk.append(abs(float((mpmath.mpf(stats.f.ppf(p, d1, d2)) - ref)/ref)))
dump("quantili.json", {
    "descrizione": "Quantili della t di Student (df 1-200) e della F di Fisher (d1 in un elenco, d2 1-200) da scipy.stats.ppf",
    "controllo_mpmath": {"casi": len(chk), "max_errore_relativo_scipy": max(chk)},
    "p": PS, "t": t_rows, "f": f_rows,
})

# ---------------- retta pesata (1/x, 1/x²) ----------------
rng = np.random.default_rng(20261106)
def sig6(v):
    return float(f"{v:.6g}")
def make_cal(xs, a, b, rel, absn):
    return [{"x": float(x), "y": sig6(a + b*x + rng.normal()*(rel*b*x + absn))} for x in xs]
CAL = {
    "sette_livelli": make_cal([0.5, 1, 2, 5, 10, 20, 50], 0.02, 1.5, 0.02, 0.005),
    "bianco_e_repliche": make_cal([0, 0.1, 0.1, 0.5, 0.5, 1, 1, 5, 5, 10, 10], 0.003, 0.82, 0.03, 0.002),
    "cinque_decadi": make_cal([1e-3, 3e-3, 1e-2, 3e-2, 0.1, 0.3, 1, 3, 10, 30, 100], 1e-4, 2.4e3, 0.015, 0.0),
}
def wls_ref(pts, kind):
    k = 2 if kind == "1/x2" else 1
    x = [mpmath.mpf(p["x"]) for p in pts]; y = [mpmath.mpf(p["y"]) for p in pts]; n = len(x)
    low = min(v for v in x if v > 0)
    raw = lambda v: 1/(v if v > 0 else low)**k
    w0 = [raw(v) for v in x]; norm = n/sum(w0); w = [v*norm for v in w0]; W = lambda v: raw(v)*norm
    sw = sum(w); xm = sum(wi*xi for wi, xi in zip(w, x))/sw; ym = sum(wi*yi for wi, yi in zip(w, y))/sw
    sxx = sum(wi*(xi-xm)**2 for wi, xi in zip(w, x)); sxy = sum(wi*(xi-xm)*(yi-ym) for wi, xi, yi in zip(w, x, y))
    b = sxy/sxx; a = ym - b*xm
    ssr = sum(wi*(yi-a-b*xi)**2 for wi, xi, yi in zip(w, x, y)); df = n-2; s = mpmath.sqrt(ssr/df)
    t = mpmath.mpf(stats.t.ppf(0.975, df))  # t in doppia precisione da scipy (errore relativo < 1e-14)
    sb = s/mpmath.sqrt(sxx); sa = s*mpmath.sqrt(1/sw + xm*xm/sxx); sLow = s/mpmath.sqrt(W(low))
    out = {"a": a, "b": b, "sa": sa, "sb": sb, "syx": s, "lod": 3.3*sLow/abs(b), "loq": 10*sLow/abs(b), "t": t,
           "ciA_lo": a-t*sa, "ciA_hi": a+t*sa, "ciB_lo": b-t*sb, "ciB_hi": b+t*sb, "df": df}
    preds = []
    ys = sorted(float(v) for v in y)
    for y0 in [ys[len(ys)//3], ys[2*len(ys)//3]]:
        y0m = mpmath.mpf(y0); x0 = (y0m-a)/b
        sx0 = s/abs(b)*mpmath.sqrt(1/(1*W(max(x0, low))) + 1/sw + (y0m-ym)**2/(b*b*sxx))
        preds.append({"y0": y0, "m": 1, "x": float(x0), "s": float(sx0), "ci": float(t*sx0)})
    return {kk: (float(v) if not isinstance(v, int) else v) for kk, v in out.items()} | {"predict": preds}
wls = []
for name, pts in CAL.items():
    for kind in ["1/x", "1/x2"]:
        wls.append({"nome": name, "peso": kind, "punti": pts, "rif": wls_ref(pts, kind)})
dump("wls.json", {"descrizione": "Rette pesate 1/x e 1/x² (Miller & Miller; pesi normalizzati a somma n; un punto a x=0 prende il peso dello standard più basso). Dati SINTETICI. Riferimento mpmath a 50 cifre.", "casi": wls})

# ---------------- Mandel ----------------
def ols_ssr(x, y, deg):
    X = mpmath.matrix([[xi**j for j in range(deg+1)] for xi in x]); Y = mpmath.matrix(y)
    beta = mpmath.lu_solve(X.T*X, X.T*Y)
    return sum((y[i] - sum(beta[j]*x[i]**j for j in range(deg+1)))**2 for i in range(len(x)))
def mandel_ref(pts):
    x = [mpmath.mpf(p["x"]) for p in pts]; y = [mpmath.mpf(p["y"]) for p in pts]; n = len(x)
    s1 = ols_ssr(x, y, 1); s2 = ols_ssr(x, y, 2)
    sq = s2/(n-3); PG = (s1 - s2)/sq
    return {"PG": float(PG), "F99": float(stats.f.ppf(0.99, 1, n-3)), "s_lin": float(mpmath.sqrt(s1/(n-2))), "s_quad": float(mpmath.sqrt(sq))}
def pontius():
    L = open(os.path.join(HERE, "..", "..", "strd", "Pontius.dat")).read().splitlines()
    rows = [l.split() for l in L[60:] if l.strip()]
    return [{"x": float(r[1]), "y": float(r[0])} for r in rows]
MAN = {
    "curva_di_saturazione": [{"x": float(x), "y": sig6(1.2*x/(1+0.04*x) + rng.normal()*0.01)} for x in [1, 2, 4, 6, 8, 10, 15, 20]],
    "quasi_lineare": [{"x": float(x), "y": sig6(0.05 + 0.9*x + rng.normal()*0.02)} for x in [0.5, 1, 2, 3, 4, 5, 6, 8, 10]],
    "pontius_nist": pontius(),
}
dump("mandel.json", {"descrizione": "Test di Mandel: PG = ((n-2)s_lin² - (n-3)s_quad²)/s_quad². Dati SINTETICI salvo Pontius (NIST). Riferimento mpmath a 50 cifre; F99 da scipy.", "casi": [{"nome": k, "punti": v, "rif": mandel_ref(v)} for k, v in MAN.items()]})

# ---------------- deconvoluzione con rumore: curve_fit sullo stesso modello dell'app ----------------
SQ = np.sqrt(np.log(2)/np.pi)
def pv(x, c, w, eta):
    t = (x-c)/w
    return eta*2/(np.pi*w)/(1+4*t*t) + (1-eta)*2*SQ/w*np.exp(-4*np.log(2)*t*t)
def model_factory(prof, k, xm, xr):
    def m(x, *q):
        u = (x-xm)/xr; v = q[0] + q[1]*u
        np_ = 4 if prof == "pv" else 3
        for j in range(k):
            o = 2 + j*np_; eta = q[o+3] if prof == "pv" else (1.0 if prof == "lor" else 0.0)
            v = v + q[o]*pv(x, q[o+1], q[o+2], eta)
        return v
    return m
DEC = [
    {"nome": "pv_2_rumore", "profilo": "pv", "x": [0, 100, 600], "picchi": [{"c": 40, "w": 6, "A": 300, "eta": 0.4}, {"c": 55, "w": 8, "A": 200, "eta": 0.6}], "sigma": 0.25},
    {"nome": "gauss_4_rumore", "profilo": "gauss", "x": [200, 400, 801], "picchi": [{"c": 250, "w": 10, "A": 500}, {"c": 275, "w": 12, "A": 300}, {"c": 320, "w": 9, "A": 400}, {"c": 345, "w": 15, "A": 600}], "sigma": 0.3},
    {"nome": "lor_2_rumore", "profilo": "lor", "x": [1000, 1200, 501], "picchi": [{"c": 1080, "w": 12, "A": 900}, {"c": 1110, "w": 10, "A": 700}], "sigma": 0.4},
]
dec_out = []
for D in DEC:
    x = np.linspace(D["x"][0], D["x"][1], D["x"][2]); prof = D["profilo"]; k = len(D["picchi"])
    xm = (x[0]+x[-1])/2; xr = abs(x[-1]-x[0])/2
    y = np.zeros_like(x)
    for p in D["picchi"]:
        eta = p.get("eta", 1.0 if prof == "lor" else 0.0)
        y += p["A"]*pv(x, p["c"], p["w"], eta)
    y = y + rng.normal(size=x.size)*D["sigma"]
    y = np.array([float(f"{v:.10g}") for v in y])
    p0 = [0.0, 0.0]
    for p in D["picchi"]:
        p0 += [p["A"], p["c"], p["w"]] + ([p["eta"]] if prof == "pv" else [])
    m = model_factory(prof, k, xm, xr)
    popt, pcov = curve_fit(m, x, y, p0=p0, method="lm", xtol=1e-15, ftol=1e-15, gtol=1e-15, maxfev=200000)
    perr = np.sqrt(np.diag(pcov)); np_ = 4 if prof == "pv" else 3
    comps = []
    for j in range(k):
        o = 2 + j*np_
        comps.append({"area": popt[o], "c": popt[o+1], "w": popt[o+2], "eta": popt[o+3] if prof == "pv" else None,
                      "s_area": perr[o], "s_c": perr[o+1], "s_w": perr[o+2], "s_eta": perr[o+3] if prof == "pv" else None})
    ssr = float(np.sum((y - m(x, *popt))**2))
    dec_out.append({"nome": D["nome"], "profilo": prof, "veri": D["picchi"], "sigma_rumore": D["sigma"], "x": x.tolist(), "y": y.tolist(),
                    "curve_fit": {"componenti": [{kk: (float(v) if v is not None else None) for kk, v in c.items()} for c in comps], "ssr": ssr, "base": [float(popt[0]), float(popt[1])]}})
dump("deconv.json", {"descrizione": "Dati SINTETICI con rumore gaussiano (seme fisso); modello identico a fitPeaks: somma di pseudo-Voigt ad area unitaria + base b0 + b1·u, u = (x − centro)/semiampiezza. curve_fit (Levenberg–Marquardt), covarianza = (JᵀJ)⁻¹·SSR/(n−p).", "casi": dec_out})
print("ok", len(t_rows), len(f_rows), len(wls), "max scipy vs mpmath", max(chk))
