#!/usr/bin/env python3
"""
update_directors.py
Fetches director from TMDB for every film/TV entry in imports.js that is
missing a `director` field, then patches the file in-place.

Setup — .env must contain:
  TMDB_API_KEY=...

Run:
  python update_directors.py            full run
  python update_directors.py --dry-run  preview only, no writes
  python update_directors.py --force    re-fetch even if cached
"""

import json, os, re, sys, time, unicodedata
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode

SCRIPT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # data files in project root (../)
IMPORTS_JS  = os.path.join(SCRIPT_DIR, 'imports.js')
CACHE_FILE  = os.path.join(SCRIPT_DIR, 'director_cache.json')
ENV_FILE    = os.path.join(SCRIPT_DIR, '.env')

DRY_RUN = '--dry-run' in sys.argv
FORCE   = '--force'   in sys.argv

FILM_MEDIA = {'Movies', 'Feature Animation', 'Shorts', 'TV', 'Animated Series'}
TMDB = 'https://api.themoviedb.org/3'

# ── .env ──────────────────────────────────────────────────────────────────────

def load_env():
    env = {}
    if os.path.exists(ENV_FILE):
        with open(ENV_FILE) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, _, v = line.partition('=')
                    env[k.strip()] = v.strip().strip('"').strip("'")
    if 'TMDB_API_KEY' in os.environ:
        env.setdefault('TMDB_API_KEY', os.environ['TMDB_API_KEY'])
    return env

# ── HTTP ──────────────────────────────────────────────────────────────────────

def http_get(url):
    try:
        req = Request(url, headers={'User-Agent': 'culture-app/1.0',
                                     'Accept-Encoding': 'identity'})
        with urlopen(req, timeout=14) as r:
            return json.loads(r.read().decode('utf-8'))
    except (HTTPError, URLError, json.JSONDecodeError):
        return None

# ── TMDB lookup ───────────────────────────────────────────────────────────────

def normalize(s):
    s = unicodedata.normalize('NFKD', s.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

def find_tmdb_id(key, title, year, kind):
    year_param = 'year' if kind == 'movie' else 'first_air_date_year'
    for params in [
        urlencode({'api_key': key, 'query': title, year_param: year}),
        urlencode({'api_key': key, 'query': title}),
    ]:
        data = http_get(f'{TMDB}/search/{kind}?{params}')
        if data and data.get('results'):
            break
    else:
        return None

    title_fields = (['title', 'original_title'] if kind == 'movie'
                    else ['name', 'original_name'])
    best, best_score = None, 0.40
    norm_q = normalize(title).split()
    for r in data['results']:
        s = max(
            (len(set(norm_q) & set(normalize(r.get(f) or '').split())) /
             max(len(norm_q), len(normalize(r.get(f) or '').split() or [1]), 1)
             for f in title_fields),
            default=0,
        )
        r_year = (r.get('release_date') or r.get('first_air_date') or '')[:4]
        if r_year and abs(int(r_year) - year) > 2:
            s *= 0.5
        if s > best_score:
            best, best_score = r, s

    return best['id'] if best else None

def tmdb_director(key, title, year, kind):
    """Returns a director string (possibly 'A, B' for co-directors) or None."""
    tmdb_id = find_tmdb_id(key, title, year, kind)
    if not tmdb_id:
        return None

    if kind == 'movie':
        credits = http_get(f'{TMDB}/movie/{tmdb_id}/credits?api_key={key}')
        if not credits:
            return None
        directors = [m['name'] for m in credits.get('crew', [])
                     if m.get('job') == 'Director']
        return ', '.join(directors[:2]) if directors else None
    else:
        detail = http_get(f'{TMDB}/tv/{tmdb_id}?api_key={key}')
        if not detail:
            return None
        creators = [c['name'] for c in detail.get('created_by', [])]
        return ', '.join(creators[:2]) if creators else None

# ── imports.js parsing / patching ─────────────────────────────────────────────

def parse_entries(path):
    """Return (entries, lines) where entries are film/TV rows missing director."""
    with open(path, encoding='utf-8') as f:
        lines = f.readlines()

    entries = []
    for i, line in enumerate(lines):
        if 'imp-f-' not in line and 'imp-s-' not in line:
            continue
        if 'director' in line:
            continue

        id_m = (re.search(r"id\s*:\s*'([^']+)'", line) or
                re.search(r'"id"\s*:\s*"([^"]+)"', line))
        if not id_m:
            continue

        tm = (re.search(r"title\s*:\s*'((?:[^'\\]|\\.)*)'", line) or
              re.search(r'"title"\s*:\s*"([^"]+)"', line))
        ym = (re.search(r'"year"\s*:\s*(\d{4})', line) or
              re.search(r'year\s*:\s*(\d{4})', line))
        mm = (re.search(r'"medium"\s*:\s*"([^"]+)"', line) or
              re.search(r"medium\s*:\s*'([^']+)'", line))

        if not tm or not ym or not mm:
            continue
        if mm.group(1) not in FILM_MEDIA:
            continue

        entries.append({
            'i':      i,
            'id':     id_m.group(1),
            'title':  re.sub(r'\\(.)', r'\1', tm.group(1)),
            'year':   int(ym.group(1)),
            'medium': mm.group(1),
        })
    return entries, lines

def patch_line(line, director):
    stripped = line.rstrip()
    if stripped.endswith('},'):
        tail, base = '},', stripped[:-2]
    elif stripped.endswith('}'):
        tail, base = '}', stripped[:-1]
    else:
        return line
    esc = director.replace("'", "\\'")
    return base + f", director: '{esc}'" + tail + '\n'

# ── cache ─────────────────────────────────────────────────────────────────────

def load_cache():
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_cache(cache):
    if not DRY_RUN:
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(cache, f, indent=2, ensure_ascii=False)

# ── main ──────────────────────────────────────────────────────────────────────

def main():
    env = load_env()
    key = env.get('TMDB_API_KEY', '')
    if not key:
        print('ERROR: TMDB_API_KEY missing from .env')
        sys.exit(1)

    entries, lines = parse_entries(IMPORTS_JS)
    cache = load_cache()
    print(f'Entries missing director: {len(entries)}\n')

    patched, no_match = 0, []

    for entry in entries:
        item_id = entry['id']
        title   = entry['title']
        year    = entry['year']
        medium  = entry['medium']
        kind    = 'tv' if medium in ('TV', 'Animated Series') else 'movie'
        ckey    = f'{item_id}|{normalize(title)}|{year}'

        if ckey in cache and not FORCE:
            director = cache[ckey]
        else:
            print(f'  {title} ({year})', end='', flush=True)
            director = tmdb_director(key, title, year, kind)
            cache[ckey] = director
            time.sleep(0.35)
            print(f' → {director}' if director else ' — no match')

        if director:
            lines[entry['i']] = patch_line(lines[entry['i']], director)
            patched += 1
        else:
            no_match.append((title, year, medium))

    save_cache(cache)

    if not DRY_RUN:
        with open(IMPORTS_JS, 'w', encoding='utf-8') as f:
            f.writelines(lines)
        print(f'\nimports.js written.')

    print(f'\nResults:  patched {patched}  |  no match {len(no_match)}')

    if no_match:
        print(f'\nNo TMDB match ({len(no_match)}) — check titles manually:')
        for t, y, med in sorted(no_match):
            print(f'  {y}  [{med}]  {t}')

    if DRY_RUN:
        print('\n(dry run — no files written)')

if __name__ == '__main__':
    main()
