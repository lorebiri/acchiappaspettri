# SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
# SPDX-License-Identifier: GPL-3.0-or-later
# I10, R12: valori di riferimento dei file di mappa PUBBLICI (non nel repository), letti con un lettore indipendente scritto qui con il
# solo modulo struct (nessun codice esterno eseguito). .wdf: struttura documentata da py-wdf-reader (MIT); gli spettri si prendono
# nell'ordine di acquisizione e si mettono nella griglia come fa py-wdf-reader (righe: h × w × punti) se WMAP ha flags 0, per colonne
# se flags ha il bit 2 (scansione StreamLine per colonne, coordinate ORGN). ENVI: campioni GDAL (MIT), con la regola di ENVI.
# Uso: python3 -I rif_pubblici.py <cartella con wdf/ e gdal-envi/>  → mappe/pubblici.json (JSON congelato)
import json, os, struct, sys
root = sys.argv[1]
out = {}
def blocks(b):
    p, d = 0, {}
    while p + 16 <= len(b):
        name = b[p:p+4].decode('latin1'); size = struct.unpack_from('<Q', b, p+8)[0]
        if size < 16: break
        d.setdefault(name, p); p += size
    return d
def wdf(path):
    b = open(path, 'rb').read(); d = blocks(b)
    pps, cap, cnt = struct.unpack_from('<iQQ', b, 0x3c)
    x = struct.unpack_from('<%df' % pps, b, d['XLST'] + 24)
    data = d['DATA'] + 16
    spec = lambda k: struct.unpack_from('<%df' % pps, b, data + 4 * k * pps)
    w = h = None; flags = 0
    if 'WMAP' in d:
        flags = struct.unpack_from('<I', b, d['WMAP'] + 16)[0]; w, h = struct.unpack_from('<ii', b, d['WMAP'] + 0x30)
    grid = w and h and w > 1 and h > 1 and w * h == cap
    nx, ny = (w, h) if grid else (cap, 1)
    at = (lambda ix, iy: ix * h + iy) if (grid and flags & 2) else (lambda ix, iy: iy * nx + ix)
    pts = [(0, 0), (nx - 1, 0), (0, ny - 1), (nx - 1, ny - 1), (nx // 2, ny // 2), (nx // 3, (2 * ny) // 3)]
    samples = []
    for ix, iy in pts:
        k = at(ix, iy)
        if k < cnt:
            s = spec(k); samples.append({'ix': ix, 'iy': iy, 'c': [0, pps // 2, pps - 1], 'v': [s[0], s[pps // 2], s[pps - 1]], 'sum': sum(s)})
    return {'nx': nx, 'ny': ny, 'nc': pps, 'x0': x[0], 'x1': x[-1], 'spectra': cnt, 'samples': samples}
def envi(hdrp, binp):
    t = open(hdrp, encoding='latin1').read(); H = {}
    import re
    for m in re.finditer(r'^\s*([^=\n\r{}]+?)\s*=\s*(\{[\s\S]*?\}|[^\r\n]*)', t, re.M): H[m.group(1).strip().lower()] = m.group(2).strip()
    S, L, B, dt = int(H['samples']), int(H['lines']), int(H['bands']), int(H['data type']); il = H.get('interleave', 'bsq').lower(); bo = int(H.get('byte order', '0'))
    fmt = {1: 'B', 2: 'h', 4: 'f', 5: 'd', 12: 'H'}[dt]; sz = struct.calcsize(fmt); raw = open(binp, 'rb').read(); off = int(H.get('header offset', '0'))
    v = lambda i: struct.unpack_from(('>' if bo == 1 else '<') + fmt, raw, off + i * sz)[0]
    at = {'bsq': lambda s, l, b: (b * L + l) * S + s, 'bil': lambda s, l, b: (l * B + b) * S + s, 'bip': lambda s, l, b: (l * S + s) * B + b}[il]
    samples = []
    for s, l in [(0, 0), (S - 1, 0), (0, L - 1), (S - 1, L - 1), (S // 2, L // 2)]:
        vals = [v(at(s, l, b)) for b in range(B)]; samples.append({'ix': s, 'iy': l, 'c': list(range(B)), 'v': vals, 'sum': sum(vals)})
    tot = sum(v(i) for i in range(S * L * B))
    return {'nx': S, 'ny': L, 'nc': B, 'samples': samples, 'total': tot}
for n in sorted(os.listdir(os.path.join(root, 'wdf'))):
    if n.endswith('.wdf'): out['wdf/' + n] = wdf(os.path.join(root, 'wdf', n))
for n in ['envi_rgbsmall_bil', 'envi_rgbsmall_bip', 'envi_rgbsmall_bsq', 'uint16_envi_bigendian', 'aea']:
    d = os.path.join(root, 'gdal-envi'); binp = os.path.join(d, n + ('.img' if n.startswith('envi') else '.dat'))
    out['gdal-envi/' + n] = envi(os.path.join(d, n + '.hdr'), binp)
json.dump(out, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pubblici.json'), 'w'), indent=1)
print(len(out), 'file')
