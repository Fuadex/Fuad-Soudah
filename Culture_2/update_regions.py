#!/usr/bin/env python3
"""
update_regions.py
Fetches production country from TMDB for every film/TV/short/animation entry
in imports.js that is missing a `region` field, then patches the file.

Setup — .env must contain:
  TMDB_API_KEY=...

Run:
  python update_regions.py            full run
  python update_regions.py --dry-run  preview only
  python update_regions.py --force    re-fetch even if cached
"""

import json, os, re, sys, time, unicodedata
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
IMPORTS_JS = os.path.join(SCRIPT_DIR, 'imports.js')
CACHE_FILE = os.path.join(SCRIPT_DIR, 'region_cache.json')
ENV_FILE   = os.path.join(SCRIPT_DIR, '.env')

DRY_RUN = '--dry-run' in sys.argv
FORCE   = '--force'   in sys.argv

# Maps TMDB alpha-2 country codes → region strings used in the app.
# Matches the region codes in data.js REGION_COLORS and culture-v2.jsx ISO_TO_REGION.
ALPHA2_TO_REGION = {
    'US': 'us', 'GB': 'uk', 'FR': 'fr', 'DE': 'de', 'JP': 'jp', 'PL': 'pl',
    'IT': 'it', 'RU': 'ru', 'SU': 'su',  # SU = Soviet Union (historical)
    'KR': 'kr', 'AU': 'au', 'CA': 'ca', 'IE': 'ie', 'IL': 'il', 'SE': 'se',
    'FI': 'fi', 'CH': 'ch', 'ES': 'es', 'NL': 'nl', 'DK': 'dk', 'CZ': 'cz',
    'HU': 'hu', 'BG': 'bg', 'HR': 'hr', 'GR': 'gr', 'BR': 'br',
    # Extended — map to nearest existing region or 'eu'/'other'
    'HK': 'hk', 'TW': 'jp',  # HK/TW = new code; TW often grouped with JP aesthetically
    'CN': 'cn',
    'MX': 'mx', 'AR': 'other', 'CL': 'other', 'CO': 'other',
    'IN': 'in',
    'AT': 'eu', 'BE': 'eu', 'PT': 'eu', 'NO': 'eu', 'RO': 'eu',
    'SK': 'eu', 'SI': 'eu', 'RS': 'eu', 'BA': 'eu', 'MK': 'eu',
    'NZ': 'au', 'ZA': 'other', 'NG': 'other', 'IR': 'other',
    'TR': 'other', 'TH': 'other', 'ID': 'other', 'PH': 'other',
    'VN': 'other', 'MY': 'other', 'SG': 'other',
    'DZ': 'other', 'TN': 'other', 'MA': 'other', 'EG': 'other',
    'GH': 'other', 'KE': 'other', 'SN': 'other',
    'LT': 'eu', 'LV': 'eu', 'EE': 'eu', 'LU': 'eu',
    'IS': 'eu', 'CY': 'eu', 'MT': 'eu', 'AL': 'eu',
    'UA': 'eu', 'BY': 'eu', 'GE': 'eu', 'AM': 'other', 'AZ': 'other',
    'KZ': 'other', 'UZ': 'other',
    'CU': 'other', 'BO': 'other', 'VE': 'other', 'PE': 'other', 'EC': 'other',
    'UY': 'other', 'PY': 'other',
}

# New codes that need REGION_COLORS + ISO_TO_REGION entries if found in the data.
# Run this script first, then decide which new codes to add to data.js/culture-v2.jsx.
NEW_CODES_FOUND = {}

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

# ── TMDB ──────────────────────────────────────────────────────────────────────

TMDB = 'https://api.themoviedb.org/3'

def normalize(s):
    s = unicodedata.normalize('NFKD', s.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

def tmdb_region(key, title, year, kind='movie'):
    year_param = 'year' if kind == 'movie' else 'first_air_date_year'
    params = urlencode({'api_key': key, 'query': title, year_param: year})
    data = http_get(f'{TMDB}/search/{kind}?{params}')
    if not data or not data.get('results'):
        params2 = urlencode({'api_key': key, 'query': title})
        data = http_get(f'{TMDB}/search/{kind}?{params2}')
    if not data or not data.get('results'):
        return None

    title_fields = ['title', 'original_title'] if kind == 'movie' else ['name', 'original_name']
    best, best_score = None, 0.40
    for r in data['results']:
        s = max((len(set(normalize(title).split()) & set(normalize(r.get(f) or '').split())) /
                 max(len(normalize(title).split()), len(normalize(r.get(f) or '').split() or [1]), 1)
                 for f in title_fields), default=0)
        r_year = (r.get('release_date') or r.get('first_air_date') or '')[:4]
        if r_year and abs(int(r_year) - int(year)) > 2:
            s *= 0.5
        if s > best_score:
            best, best_score = r, s

    if not best:
        return None

    detail = http_get(f'{TMDB}/{kind}/{best["id"]}?api_key={key}')
    if not detail:
        return None
    countries = detail.get('production_countries') or detail.get('origin_country') or []
    # production_countries is list of {'iso_3166_1': 'US', 'name': '...'} for movies
    # origin_country is list of alpha-2 strings for TV
    for c in countries:
        code = (c.get('iso_3166_1') if isinstance(c, dict) else c) or ''
        region = ALPHA2_TO_REGION.get(code.upper())
        if region:
            return region
        if code:
            NEW_CODES_FOUND[code] = NEW_CODES_FOUND.get(code, 0) + 1
    return None

# ── imports.js parsing / patching ─────────────────────────────────────────────

FILM_MEDIA = {'Movies', 'Feature Animation', 'Shorts', 'TV', 'Animated Series'}

def parse_missing_region_entries(path):
    entries = []
    with open(path, encoding='utf-8') as f:
        lines = f.readlines()
    for i, line in enumerate(lines):
        if 'imp-f-' not in line and 'imp-s-' not in line:
            continue
        if 'region' in line:
            continue

        # Parse id
        id_m = (re.search(r"id\s*:\s*'([^']+)'", line) or
                re.search(r'"id"\s*:\s*"([^"]+)"', line))
        if not id_m:
            continue
        item_id = id_m.group(1)

        # Parse title
        tm = (re.search(r"title\s*:\s*'((?:[^'\\]|\\.)*)'", line) or
              re.search(r'"title"\s*:\s*"([^"]+)"', line))
        ym = (re.search(r'year\s*:\s*(\d{4})', line) or
              re.search(r'"year"\s*:\s*(\d{4})', line))
        mm = (re.search(r"medium\s*:\s*'([^']+)'", line) or
              re.search(r'"medium"\s*:\s*"([^"]+)"', line))
        if not tm or not ym:
            continue

        title  = re.sub(r'\\(.)', r'\1', tm.group(1))
        year   = int(ym.group(1))
        medium = mm.group(1) if mm else ''
        if medium not in FILM_MEDIA:
            continue

        entries.append({'i': i, 'id': item_id, 'title': title,
                        'year': year, 'medium': medium})
    return entries, lines

def patch_region(line, region):
    stripped = line.rstrip()
    if stripped.endswith('},'):
        tail, base = '},', stripped[:-2]
    elif stripped.endswith('}'):
        tail, base = '}', stripped[:-1]
    else:
        return line
    return base + f', "region": "{region}"' + tail + '\n'

# ── Cache ─────────────────────────────────────────────────────────────────────

def load_cache():
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_cache(cache):
    if not DRY_RUN:
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(cache, f, indent=2, ensure_ascii=False)

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    env = load_env()
    key = env.get('TMDB_API_KEY', '')
    if not key:
        print('ERROR: TMDB_API_KEY missing from .env')
        sys.exit(1)

    entries, lines = parse_missing_region_entries(IMPORTS_JS)
    cache = load_cache()

    print(f'Entries missing region: {len(entries)}\n')

    stats = {'patched': 0, 'no_match': 0, 'skipped': 0}
    no_match = []

    for entry in entries:
        item_id = entry['id']
        title   = entry['title']
        year    = entry['year']
        medium  = entry['medium']
        cache_key = f'{item_id}|{normalize(title)}|{year}'

        kind = 'tv' if medium in ('TV', 'Animated Series') else 'movie'

        if cache_key in cache and not FORCE:
            region = cache[cache_key]
        else:
            print(f'  {title} ({year})', end='', flush=True)
            region = tmdb_region(key, title, year, kind)
            cache[cache_key] = region
            time.sleep(0.35)

        if region:
            lines[entry['i']] = patch_region(lines[entry['i']], region)
            stats['patched'] += 1
            if cache_key not in cache or FORCE:
                print(f' → {region}')
        else:
            stats['no_match'] += 1
            no_match.append((title, year, medium))
            if cache_key not in cache or FORCE:
                print(' — no match')

    save_cache(cache)

    if not DRY_RUN:
        with open(IMPORTS_JS, 'w', encoding='utf-8') as f:
            f.writelines(lines)
        print(f'\nimports.js written')

    print(f'\nResults:')
    print(f'  Patched:   {stats["patched"]}')
    print(f'  No match:  {stats["no_match"]}')

    if NEW_CODES_FOUND:
        print(f'\nNew country codes not in ALPHA2_TO_REGION (add these to the map):')
        for code, count in sorted(NEW_CODES_FOUND.items(), key=lambda x: -x[1]):
            print(f'  {code}: {count} entries')

    if no_match:
        print(f'\nUnmatched ({len(no_match)}) — may need manual region or tmdb_overrides.json:')
        for t, y, med in sorted(no_match):
            print(f'  {y}  [{med}]  {t}')

    if DRY_RUN:
        print('\n(dry run — no files written)')

if __name__ == '__main__':
    main()
