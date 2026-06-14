#!/usr/bin/env python3
"""audit_enrich.py — coverage of each enrichment cache vs the library.
Counts, per medium, how many items have: TMDB overview, cast, runtime/length,
OMDb payload. Shows where a parallel enrichment run would actually add data.
"""
import json, os, re, sys
try: sys.stdout.reconfigure(encoding='utf-8')
except Exception: pass

SD = os.path.dirname(os.path.abspath(__file__))

def load_win(path, var):
    if not os.path.exists(path): return {}
    txt = open(path, encoding='utf-8').read()
    m = re.search(r'window\.' + var + r'\s*=\s*(\{.*\});', txt, re.S)
    return json.loads(m.group(1)) if m else {}

omdb = load_win(os.path.join(SD, 'omdb_data.js'), 'CULTURE_OMDB')
tmdb = load_win(os.path.join(SD, 'tmdb_data.js'), 'CULTURE_TMDB')
cast = load_win(os.path.join(SD, 'cast_data.js'), 'CULTURE_CAST')

MOVIE = {'Movies', 'Feature Animation', 'Shorts'}
TV    = {'TV', 'Animated Series'}
GAME  = {'Games'}
BOOK  = {'Books'}

def parse(path):
    out = []
    for line in open(path, encoding='utf-8'):
        idm = re.search(r"""\bid"?\s*:\s*['"]([^'"]+)['"]""", line)
        mm  = re.search(r"""\bmedium"?\s*:\s*['"]([^'"]+)['"]""", line)
        if not idm or not mm: continue
        has_rt = bool(re.search(r'"?(runtime|totalMinutes|playtime|pages)"?\s*:', line))
        out.append((idm.group(1), mm.group(1), has_rt))
    return out

items, seen = [], set()
for f in ('data.js', 'imports.js', 'wishlist.js'):
    p = os.path.join(SD, f)
    if not os.path.exists(p): continue
    for iid, med, has_rt in parse(p):
        if iid in seen: continue
        seen.add(iid); items.append((iid, med, has_rt))

def bucket(med):
    if med in MOVIE: return 'film'
    if med in TV: return 'tv'
    if med in GAME: return 'game'
    if med in BOOK: return 'book'
    return 'other'

groups = {}
for iid, med, has_rt in items:
    g = bucket(med)
    d = groups.setdefault(g, {'n':0,'omdb':0,'tmdb':0,'cast':0,'rt':0})
    d['n']  += 1
    d['omdb'] += iid in omdb
    d['tmdb'] += iid in tmdb
    d['cast'] += iid in cast
    d['rt']   += has_rt

print(f"{'medium':<7}{'count':>7}{'omdb':>8}{'tmdbOv':>8}{'cast':>8}{'runtime':>9}")
for g in ('film','tv','game','book','other'):
    if g not in groups: continue
    d = groups[g]
    print(f"{g:<7}{d['n']:>7}{d['omdb']:>8}{d['tmdb']:>8}{d['cast']:>8}{d['rt']:>9}")
print(f"\ncaches: omdb={len(omdb)} tmdbOverview={len(tmdb)} cast={len(cast)}")
