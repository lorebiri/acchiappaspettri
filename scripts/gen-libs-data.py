#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Lorenzo Birindelli
# SPDX-License-Identifier: GPL-3.0-or-later
"""Genera app/libs-data.js, la banca dati atomica per la CF-LIBS (sperimentale), dal NIST Atomic Spectra Database.

Fonte: Kramida A., Ralchenko Yu., Reader J., NIST ASD Team, NIST Atomic Spectra Database (NIST Standard Reference
Database 78), versione dichiarata in ASD_VERSION, https://physics.nist.gov/asd, doi:10.18434/T4W30F.
Moduli usati: lines1.pl (righe, format=3 = TSV), energy1.pl (livelli, per le funzioni di partizione), ie.pl (energie di
ionizzazione). Masse atomiche: pesi atomici standard abbreviati IUPAC/CIAAW 2021 (scritti qui sotto, non scaricati).

Uso:   /opt/venv/bin/python scripts/gen-libs-data.py            (scarica e scrive app/libs-data.js)
       /opt/venv/bin/python scripts/gen-libs-data.py --offline  (riusa solo la cache)
Cache: scripts/.nist-cache/ (file TSV grezzi così come li dà il NIST; non è nel repository, vedi .gitignore).
Il file prodotto dipende solo dalla cache: con la stessa cache esce identico byte per byte (la data di scaricamento è
quella scritta nella cache, non quella del giorno in cui si rigenera).

Scelte (dichiarate anche nel file prodotto):
- righe E1 (dipolo elettrico; senza M1/E2) in aria tra 200 e 900 nm (il NIST dà λ in aria sopra 200 nm con show_av=2),
  con A_ki noto e accuratezza NIST AAA…C (cioè incertezza su A_ki ≤ 25 %), E_i, E_k, g_i, g_k definiti;
- se una specie ha meno di N_MIN righe così, si completa con righe di classe D+, D, E (incertezza su A_ki fino al 50 % e
  oltre), riconoscibili dalla classe: succede per Sn I, Ag I, Sb I, Pb II, K II, Cr II, Sr II, Au II;
- per ogni specie le N_PER_SPECIES righe con l'emissività LTE più alta a T_SEL (g_k·A_ki·exp(−E_k/kT)/λ): è una scelta
  per tenere il file piccolo, non un giudizio sulla qualità delle righe escluse;
- idrogeno: le componenti di struttura fine di una riga di Balmer sono sommate (g_k·A_ki totale, E_k medio pesato);
- funzioni di partizione U(T) = Σ g_k exp(−E_k/kT) sui livelli NIST sotto il limite di ionizzazione, senza
  abbassamento del potenziale di ionizzazione e senza livelli mancanti (il NIST è incompleto ad alta energia: U è
  sottostimata ad alta T, soprattutto per gli ioni). Il controllo a 1 eV con il calcolo del NIST stesso è nel file.
"""
import json, math, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'scripts', '.nist-cache')
OUT = os.path.join(ROOT, 'app', 'libs-data.js')
ASD_VERSION = '5.12'   # https://physics.nist.gov/PhysRefData/ASD/Html/verhist.shtml (7 novembre 2024), controllata al download
ELEMENTS = ['H', 'Li', 'C', 'N', 'O', 'Na', 'Mg', 'Al', 'Si', 'K', 'Ca', 'Ti', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn',
            'Sr', 'Ag', 'Sn', 'Sb', 'Ba', 'Au', 'Pb']
STAGES = ['I', 'II']
WL_MIN, WL_MAX = 200.0, 900.0
ACC_OK = ['AAA', 'AA', 'A+', 'A', 'B+', 'B', 'C+', 'C']
# incertezza relativa massima di A_ki per classe NIST (https://physics.nist.gov/PhysRefData/ASD/Html/lineshelp.html#OUTACC)
ACC_REL = {'AAA': 0.003, 'AA': 0.01, 'A+': 0.02, 'A': 0.03, 'B+': 0.07, 'B': 0.10, 'C+': 0.18, 'C': 0.25, 'D+': 0.40, 'D': 0.50, 'E': 1.0}
N_PER_SPECIES = 30
N_MIN = 10        # sotto questo numero di righe ≥ C si completano con le classi D+, D, E
ACC_WEAK = ['D+', 'D', 'E']
T_SEL = 10000.0
T_GRID = list(range(3000, 30001, 500))
KB = 8.617333262e-5   # eV/K (CODATA 2018, esatto dal 2019)
# pesi atomici standard abbreviati, IUPAC/CIAAW 2021 (Prohaska et al., Pure Appl. Chem. 94, 573, 2022, doi:10.1515/pac-2019-0603)
MASS = {'H': 1.008, 'Li': 6.94, 'C': 12.011, 'N': 14.007, 'O': 15.999, 'Na': 22.990, 'Mg': 24.305, 'Al': 26.982,
        'Si': 28.085, 'K': 39.098, 'Ca': 40.078, 'Ti': 47.867, 'Cr': 51.996, 'Mn': 54.938, 'Fe': 55.845, 'Co': 58.933,
        'Ni': 58.693, 'Cu': 63.546, 'Zn': 65.38, 'Sr': 87.62, 'Ag': 107.87, 'Sn': 118.71, 'Sb': 121.76, 'Ba': 137.33,
        'Au': 196.97, 'Pb': 207.2}
BASE = 'https://physics.nist.gov/cgi-bin/ASD/'
OFFLINE = '--offline' in sys.argv


def fetch(name, script, params, html=False):
    """scarica una volta e salva in cache; la prima riga del file in cache è la data UTC di scaricamento"""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if os.path.exists(path):
        with open(path, encoding='utf-8') as fh:
            stamp, body = fh.read().split('\n', 1)
        return stamp.replace('# scaricato ', ''), body
    if OFFLINE:
        raise SystemExit('manca in cache: ' + name)
    url = BASE + script + '?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={'User-Agent': 'gen-libs-data (scientific software; NIST ASD query)'})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                body = r.read().decode('utf-8', 'replace')
            break
        except Exception as e:   # rete lenta: riprova
            if attempt == 3:
                raise
            time.sleep(3 * (attempt + 1))
    if not html and ('<html' in body[:800].lower() or body.lstrip().startswith('<')):
        if 'No lines are available' in body or 'No levels' in body or 'Unrecognized' in body or 'not found' in body.lower():
            body = ''
        else:
            raise SystemExit('risposta HTML inattesa per ' + name + ': ' + re.sub(r'<[^>]+>', ' ', body)[:400])
    stamp = time.strftime('%Y-%m-%d', time.gmtime())
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write('# scaricato ' + stamp + '\n' + body)
    time.sleep(1.0)   # riguardo per il server del NIST
    return stamp, body


def num(s):
    """numero da un campo NIST: toglie virgolette, parentesi quadre/tonde (valori teorici o derivati) e '?'; None per '+x'"""
    s = (s or '').strip().strip('"').strip()
    if re.search(r'\+[a-z]', s):                  # «+x»: energia relativa a un livello ignoto, non utilizzabile
        return None
    s = re.sub(r'[\[\]()?*a-df-z]', '', s)        # parentesi, «?», asterischi e lettere, ma non l'esponente «e»
    try:
        return float(s)
    except ValueError:
        return None


def tsv(body):
    rows = [r.split('\t') for r in body.splitlines() if r.strip()]
    if not rows:
        return [], []
    head = [h.strip() for h in rows[0]]
    return head, [r for r in rows[1:] if len(r) >= len(head) - 1 and not r[0].startswith('obs_wl')]


def lines_of(el, st):
    q = {'spectra': el + ' ' + st, 'output_type': 0, 'limits_type': 0, 'low_w': WL_MIN, 'upp_w': WL_MAX, 'unit': 1,
         'submit': 'Retrieve Data', 'de': 0, 'I_scale_type': 1, 'format': 3, 'line_out': 0, 'remove_js': 'on',
         'en_unit': 1, 'output': 0, 'bibrefs': 1, 'page_size': 15, 'show_obs_wl': 1, 'show_calc_wl': 1, 'unc_out': 1,
         'order_out': 0, 'show_av': 2, 'tsb_value': 0, 'A_out': 0, 'intens_out': 'on', 'allowed_out': 1,
         'forbid_out': 1, 'conf_out': 'on', 'term_out': 'on', 'enrg_out': 'on', 'J_out': 'on', 'g_out': 'on'}
    stamp, body = fetch('lines_%s_%s.tsv' % (el, st), 'lines1.pl', q)
    head, rows = tsv(body)
    ix = {h: i for i, h in enumerate(head)}
    out = []
    for r in rows:
        g = lambda k: r[ix[k]] if k in ix and ix[k] < len(r) else ''
        wl = num(g('obs_wl_air(nm)')) or num(g('ritz_wl_air(nm)'))
        A = num(g('Aki(s^-1)'))
        acc = g('Acc').strip().strip('"')
        Ei, Ek = num(g('Ei(eV)')), num(g('Ek(eV)'))
        gi, gk = num(g('g_i')), num(g('g_k'))
        typ = g('Type').strip().strip('"')
        if None in (wl, A, Ei, Ek, gi, gk) or typ or not (WL_MIN <= wl <= WL_MAX) or A <= 0:
            continue
        out.append({'wl': wl, 'A': A, 'acc': acc, 'Ei': Ei, 'Ek': Ek, 'gi': int(gi), 'gk': int(gk),
                    'ci': g('conf_i').strip('"'), 'ck': g('conf_k').strip('"')})
    return stamp, out


def merge_hydrogen(L):
    """Balmer: somma delle componenti di struttura fine (stesso n inferiore e superiore)"""
    groups = {}
    for l in L:
        ni = int(re.match(r'(\d+)', l['ci']).group(1)); nk = int(re.match(r'(\d+)', l['ck']).group(1))
        groups.setdefault((ni, nk), []).append(l)
    out = []
    for (ni, nk), G in groups.items():
        gA = sum(l['gk'] * l['A'] for l in G)
        wl = sum(l['wl'] * l['gk'] * l['A'] for l in G) / gA
        Ek = sum(l['Ek'] * l['gk'] * l['A'] for l in G) / gA
        Ei = sum(l['Ei'] * l['gk'] * l['A'] for l in G) / gA
        acc = max((l['acc'] for l in G), key=lambda a: ACC_REL.get(a, 1))   # la classe peggiore
        gk, gi = 2 * nk * nk, 2 * ni * ni
        out.append({'wl': wl, 'A': gA / gk, 'acc': acc, 'Ei': Ei, 'Ek': Ek, 'gi': gi, 'gk': gk, 'ci': str(ni), 'ck': str(nk)})
    return out


def levels_of(el, st):
    q = {'de': 0, 'spectrum': el + ' ' + st, 'submit': 'Retrieve Data', 'units': 1, 'format': 3, 'output': 0,
         'page_size': 15, 'multiplet_ordered': 0, 'conf_out': 'on', 'term_out': 'on', 'level_out': 'on', 'unc_out': 1,
         'j_out': 'on', 'g_out': 'on', 'biblio': 'on', 'temp': ''}
    stamp, body = fetch('levels_%s_%s.tsv' % (el, st), 'energy1.pl', q)
    head, rows = tsv(body)
    ix = {h: i for i, h in enumerate(head)}
    lev, limit = [], None
    for r in rows:
        g = lambda k: r[ix[k]] if k in ix and ix[k] < len(r) else ''
        E = num(g('Level (eV)'))
        if g('Term').strip('"') == 'Limit':
            if E is not None and limit is None:
                limit = E
            continue
        gg = num(g('g'))
        if E is None or gg is None:
            continue
        lev.append((E, gg))
    return stamp, lev, limit


def nist_partition(el, st, T_eV):
    """funzione di partizione calcolata dal NIST (energy1.pl con temp in eV), per controllo"""
    q = {'de': 0, 'spectrum': el + ' ' + st, 'submit': 'Retrieve Data', 'units': 1, 'format': 0, 'output': 0,
         'page_size': 15, 'multiplet_ordered': 0, 'level_out': 'on', 'g_out': 'on', 'temp': T_eV}
    stamp, body = fetch('pf_%s_%s_%g.html' % (el, st, T_eV), 'energy1.pl', q, html=True)
    body = re.sub(r'(?s)<script.*?</script>', ' ', body)
    m = re.search(r'Partition\s+function[^:]*:\s*Z\s*=\s*([0-9.eE+-]+)', re.sub(r'<[^>]+>', ' ', body))
    return float(m.group(1)) if m else None


def ion_energies():
    """energie di ionizzazione degli stadi I e II, una richiesta per elemento (l'elenco lungo in una richiesta sola dà errore SQL)"""
    out, stamps = {}, set()
    for el in ELEMENTS:
        q = {'spectra': el + ' I-II', 'submit': 'Retrieve Data', 'units': 1, 'format': 3, 'order': 0,
             'at_num_out': 'on', 'sp_name_out': 'on', 'ion_charge_out': 'on', 'el_name_out': 'on', 'seq_out': 'on',
             'shells_out': 'on', 'level_out': 'on', 'ion_conf_out': 'on', 'e_out': 0, 'unc_out': 'on', 'biblio': 'on'}
        stamp, body = fetch('ie_%s.tsv' % el, 'ie.pl', q); stamps.add(stamp)
        head, rows = tsv(body)
        ix = {h: i for i, h in enumerate(head)}
        for r in rows:
            sp = r[ix['Sp. Name']].strip('"')
            E = num(r[ix['Ionization Energy (eV)']])
            if E is not None:
                out[sp] = E
    return sorted(stamps)[-1], out


def main():
    stamps = set()
    stamp, IE = ion_energies(); stamps.add(stamp)
    species, checks = {}, []
    for el in ELEMENTS:
        for st in STAGES:
            name = el + ' ' + st
            if el == 'H' and st == 'II':
                continue   # protone: U = 1, nessuna riga
            s1, L = lines_of(el, st); stamps.add(s1)
            s2, lev, limit = levels_of(el, st); stamps.add(s2)
            if not lev:
                continue
            Eion = IE.get(name)
            if el == 'H':
                L = merge_hydrogen(L)
            good = [l for l in L if l['acc'] in ACC_OK]
            emis = lambda l: l['gk'] * l['A'] * math.exp(-l['Ek'] / (KB * T_SEL)) / l['wl']
            good.sort(key=emis, reverse=True)
            sel = good[:N_PER_SPECIES]
            if len(sel) < N_MIN:   # poche righe di classe ≥ C (Sn I, Ag I, Sb, Pb II…): si aggiungono D+, D, E, segnate dalla classe
                weak = sorted([l for l in L if l['acc'] in ACC_WEAK], key=emis, reverse=True)
                sel = sel + weak[:N_MIN - len(sel)]
            sel = sorted(sel, key=lambda l: l['wl'])
            lim = Eion if Eion is not None else (limit if limit is not None else float('inf'))
            lv = sorted([(E, g) for (E, g) in lev if E < lim])
            U = [sum(g * math.exp(-E / (KB * T)) for (E, g) in lv) for T in T_GRID]
            Es = sorted(set(round(E, 4) for (E, g) in lv))
            dE = max((b - a for a, b in zip(Es, Es[1:])), default=0.0)   # gap massimo fra livelli adiacenti (McWhirter)
            U1 = sum(g * math.exp(-E / 1.0) for (E, g) in lv)
            Un = nist_partition(el, st, 1)
            checks.append([name, round(U1, 4), Un])
            species[name] = {
                'el': el, 'st': st, 'Eion': Eion, 'dEmax': round(dE, 4), 'nLev': len(lv), 'nAll': len(L), 'nOk': len(good),
                'U': [float('%.6g' % u) for u in U],
                'lines': [[round(l['wl'], 4), float('%.4g' % l['A']), l['acc'], round(l['Ei'], 4), round(l['Ek'], 4), l['gi'], l['gk']] for l in sel]}
            print('%-6s righe %4d, con A e acc≥C %4d, tenute %2d; livelli %4d; U(1 eV) %.4g (NIST %s)' %
                  (name, len(L), len(good), len(sel), len(lv), U1, Un), file=sys.stderr)
    data = {
        'version': 'libs-data-1',
        'source': 'Kramida A., Ralchenko Yu., Reader J., NIST ASD Team (2024). NIST Atomic Spectra Database (version ' + ASD_VERSION +
                  '), NIST Standard Reference Database 78, https://physics.nist.gov/asd, doi:10.18434/T4W30F',
        'downloaded': sorted(stamps)[-1] if stamps else None, 'downloadedFirst': sorted(stamps)[0] if stamps else None,
        'copyright': 'Dati NIST SRD 78: copyright U.S. Secretary of Commerce on behalf of the United States of America (15 U.S.C. 290e). '
                     'Estratto selezionato e trasformato da Acchiappaspettri (scripts/gen-libs-data.py): righe scelte, funzioni di partizione calcolate dai livelli. '
                     'Vedi THIRD-PARTY-NOTICES.md.',
        'masses': 'IUPAC/CIAAW 2021, pesi atomici standard abbreviati (doi:10.1515/pac-2019-0603)',
        'selection': {'wl_nm': [WL_MIN, WL_MAX], 'air': True, 'acc': ACC_OK, 'fillTo': N_MIN, 'fillAcc': ACC_WEAK, 'perSpecies': N_PER_SPECIES, 'Tsel_K': T_SEL, 'type': 'E1'},
        'accRel': ACC_REL,
        'lineFields': ['wl_nm_air', 'Aki_s-1', 'acc', 'Ei_eV', 'Ek_eV', 'gi', 'gk'],
        'Tgrid': T_GRID,
        'mass': {el: MASS[el] for el in ELEMENTS},
        'pfCheck1eV': checks,
        'species': species,
    }
    js = ('// SPDX-FileCopyrightText: 2026 Lorenzo Birindelli (selezione e calcolo); dati: NIST ASD (SRD 78), vedi sotto\n'
          '// SPDX-License-Identifier: GPL-3.0-or-later\n'
          '/* GENERATO da scripts/gen-libs-data.py: non modificare a mano.\n'
          '   Banca dati atomica per la CF-LIBS (sperimentale). Fonte: Kramida A., Ralchenko Yu., Reader J., NIST ASD Team,\n'
          '   NIST Atomic Spectra Database, versione ' + ASD_VERSION + ', doi:10.18434/T4W30F, scaricata il ' + str(data['downloaded']) + '.\n'
          '   I dati del NIST ASD sono Standard Reference Data: copyright del Segretario al Commercio degli USA (15 U.S.C. 290e).\n'
          '   Condizioni d\'uso e stato della redistribuzione: THIRD-PARTY-NOTICES.md (voce «NIST ASD»).\n'
          '   Righe: [λ in aria (nm), A_ki (1/s), accuratezza NIST, E_i (eV), E_k (eV), g_i, g_k]; U(T) sulla griglia Tgrid (K). */\n'
          '(function(root, D){ if (typeof module===\'object\' && module.exports) module.exports=D; else root.LIBS_DATA=D; })'
          '(typeof globalThis!==\'undefined\' ? globalThis : this, ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ');\n')
    with open(OUT, 'w', encoding='utf-8') as fh:
        fh.write(js)
    print('scritto %s: %d specie, %d righe, %.1f kB' % (OUT, len(species), sum(len(s['lines']) for s in species.values()), len(js.encode()) / 1024), file=sys.stderr)


if __name__ == '__main__':
    main()
