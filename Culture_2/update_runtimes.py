#!/usr/bin/env python3
"""
update_runtimes.py
Fetches runtime / playtime / pages data from TMDB, IGDB, and OpenLibrary
and patches imports.js + data.js so spines can scale by actual content length.

Setup — create a .env file in this directory:
  TMDB_API_KEY=your_key_here           (free at themoviedb.org/settings/api)
  TWITCH_CLIENT_ID=your_id_here        (free at dev.twitch.tv — needed for IGDB)
  TWITCH_CLIENT_SECRET=your_secret_here

Fields added:
  Films / Feature Animation / Shorts  → runtime (minutes)
  TV / Animated Series                 → totalMinutes (all episodes combined)
  Games                                → playtime (hours, main story)
  Books                                → pages

Usage:
  python update_runtimes.py              patch everything
  python update_runtimes.py --dry-run    preview only, no writes
  python update_runtimes.py --type=films  only process films
  python update_runtimes.py --type=tv
  python update_runtimes.py --type=games
  python update_runtimes.py --type=books

Safe to re-run — entries that already have the field are skipped.
Results cached in runtimes_cache.json to avoid redundant API calls.
"""

import json, os, re, sys, time, unicodedata
from urllib.request import urlopen, Request
from urllib.parse import urlencode
from urllib.error import HTTPError, URLError

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
IMPORTS_JS  = os.path.join(SCRIPT_DIR, 'imports.js')
DATA_JS     = os.path.join(SCRIPT_DIR, 'data.js')
CACHE_FILE  = os.path.join(SCRIPT_DIR, 'runtimes_cache.json')
ENV_FILE    = os.path.join(SCRIPT_DIR, '.env')

DRY_RUN      = '--dry-run' in sys.argv
ONLY_TYPE    = next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--type=')), None)
CLEAR_GAMES  = '--clear-games-cache' in sys.argv

# ── .env loader ───────────────────────────────────────────────────────────────

def load_env():
    env = {}
    if os.path.exists(ENV_FILE):
        with open(ENV_FILE) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, _, v = line.partition('=')
                    env[k.strip()] = v.strip().strip('"').strip("'")
    for k in ('TMDB_API_KEY', 'TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET'):
        if k in os.environ and k not in env:
            env[k] = os.environ[k]
    return env

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

# ── HTTP helpers ──────────────────────────────────────────────────────────────

def http_get(url, headers=None):
    try:
        h = {'User-Agent': 'culture-app/1.0', 'Accept-Encoding': 'identity'}
        if headers:
            h.update(headers)
        req = Request(url, headers=h)
        with urlopen(req, timeout=12) as r:
            return json.loads(r.read().decode('utf-8'))
    except (HTTPError, URLError, json.JSONDecodeError):
        return None

def http_post(url, body, headers=None):
    try:
        h = {'Accept-Encoding': 'identity'}
        if headers:
            h.update(headers)
        data = body.encode('utf-8') if isinstance(body, str) else body
        req = Request(url, data=data, headers=h, method='POST')
        with urlopen(req, timeout=12) as r:
            return json.loads(r.read().decode('utf-8'))
    except (HTTPError, URLError, json.JSONDecodeError):
        return None

# ── Title normalisation ───────────────────────────────────────────────────────

def normalize(s):
    s = unicodedata.normalize('NFKD', s.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

def match_score(query, candidate):
    nq, nc = normalize(query), normalize(candidate)
    if nq == nc:
        return 1.0
    if nq in nc or nc in nq:
        return 0.8
    wq, wc = set(nq.split()), set(nc.split())
    if not wq or not wc:
        return 0.0
    return len(wq & wc) / max(len(wq), len(wc))

def best_result(results, title, year, title_fields, year_field=None, year_parse=None):
    """Return the result with the highest title match score, optionally penalising year mismatches."""
    best, best_score = None, 0.45
    for r in (results or []):
        s = max((match_score(title, r.get(f) or '') for f in title_fields), default=0)
        if year_field and year:
            raw = r.get(year_field) or ''
            r_year = year_parse(raw) if year_parse else raw[:4]
            if r_year and abs(int(r_year) - int(year)) > 2:
                s *= 0.5
        if s > best_score:
            best, best_score = r, s
    return best

# ── TMDB ──────────────────────────────────────────────────────────────────────

TMDB = 'https://api.themoviedb.org/3'

def tmdb_movie_runtime(key, title, year):
    params = urlencode({'api_key': key, 'query': title, 'year': year, 'include_adult': 'true'})
    data = http_get(f'{TMDB}/search/movie?{params}')
    hit = best_result(data and data.get('results'), title, year,
                      ['title', 'original_title'], 'release_date', lambda d: d[:4])
    if not hit:
        return None
    details = http_get(f"{TMDB}/movie/{hit['id']}?api_key={key}")
    rt = (details or {}).get('runtime')
    return rt if rt and rt > 0 else None

def tmdb_tv_total_minutes(key, title, year):
    params = urlencode({'api_key': key, 'query': title, 'first_air_date_year': year})
    data = http_get(f'{TMDB}/search/tv?{params}')
    # Retry without year if no results
    if not (data and data.get('results')):
        params2 = urlencode({'api_key': key, 'query': title})
        data = http_get(f'{TMDB}/search/tv?{params2}')
    hit = best_result(data and data.get('results'), title, year,
                      ['name', 'original_name'], 'first_air_date', lambda d: d[:4])
    if not hit:
        return None
    details = http_get(f"{TMDB}/tv/{hit['id']}?api_key={key}")
    if not details:
        return None
    n_eps = details.get('number_of_episodes') or 0
    runtimes = details.get('episode_run_time') or []
    avg_rt = runtimes[0] if runtimes else 0
    if not avg_rt:
        genres = {g.get('name', '') for g in details.get('genres', [])}
        if genres & {'Animation', 'Anime'}:
            avg_rt = 23
        elif 'Comedy' in genres:
            avg_rt = 22
        else:
            avg_rt = 45
    total = n_eps * avg_rt
    return total if total > 0 else None

def tmdb_tv_episodes(key, title, year):
    params = urlencode({'api_key': key, 'query': title, 'first_air_date_year': year})
    data = http_get(f'{TMDB}/search/tv?{params}')
    if not (data and data.get('results')):
        params2 = urlencode({'api_key': key, 'query': title})
        data = http_get(f'{TMDB}/search/tv?{params2}')
    hit = best_result(data and data.get('results'), title, year,
                      ['name', 'original_name'], 'first_air_date', lambda d: d[:4])
    if not hit:
        return None
    details = http_get(f"{TMDB}/tv/{hit['id']}?api_key={key}")
    if not details:
        return None
    n_eps = details.get('number_of_episodes') or 0
    return n_eps if n_eps > 0 else None

# ── IGDB ──────────────────────────────────────────────────────────────────────

IGDB = 'https://api.igdb.com/v4'

def igdb_auth(client_id, client_secret):
    url = (f'https://id.twitch.tv/oauth2/token'
           f'?client_id={client_id}&client_secret={client_secret}&grant_type=client_credentials')
    data = http_post(url, '')
    return (data or {}).get('access_token')

IGDB_GENRE_NAMES = {
    2: 'Point-and-click', 4: 'Fighting', 5: 'Shooter', 7: 'Music',
    8: 'Platform', 9: 'Puzzle', 10: 'Racing', 11: 'RTS',
    12: 'RPG', 13: 'Simulator', 14: 'Sport', 15: 'Strategy',
    16: 'Turn-based Strategy', 24: 'Hack and Slash', 28: 'Adventure',
    30: 'Indie', 31: 'Arcade', 32: 'Visual Novel', 33: 'Card & Board', 34: 'MOBA',
}

def _igdb_find_game(client_id, token, title, year):
    headers = {
        'Client-ID': client_id,
        'Authorization': f'Bearer {token}',
        'Content-Type': 'text/plain',
    }
    safe = title.replace('"', '\\"')
    query = f'search "{safe}"; fields id, name, first_release_date, total_rating, genres; limit 10;'
    results = http_post(f'{IGDB}/games', query, headers)
    return best_result(results, title, year, ['name'],
                       'first_release_date',
                       lambda ts: str(time.gmtime(int(ts)).tm_year) if ts else '')

def igdb_game_rating(client_id, token, title, year):
    hit = _igdb_find_game(client_id, token, title, year)
    if hit:
        r = hit.get('total_rating')
        if r and r > 0:
            return int(round(r))
    return None

def igdb_game_genres(client_id, token, title, year):
    hit = _igdb_find_game(client_id, token, title, year)
    if hit:
        ids = hit.get('genres') or []
        names = [IGDB_GENRE_NAMES[i] for i in ids if i in IGDB_GENRE_NAMES]
        if names:
            return ', '.join(names)
    return None

# ── OpenLibrary ───────────────────────────────────────────────────────────────

def openlibrary_pages(title, author=None):
    params = {'title': title, 'limit': '5',
              'fields': 'title,author_name,number_of_pages_median'}
    if author:
        params['author'] = author
    data = http_get(f'https://openlibrary.org/search.json?{urlencode(params)}')
    hit = best_result(data and data.get('docs'), title, None, ['title'])
    if hit:
        p = hit.get('number_of_pages_median')
        if p and p > 0:
            return p
    return None

# ── Field extraction from source lines ───────────────────────────────────────

def get_field_json(line, field):
    m = re.search(rf'"{re.escape(field)}"\s*:\s*"([^"]*)"', line)
    if m: return m.group(1)
    m = re.search(rf'"{re.escape(field)}"\s*:\s*(-?[0-9.]+)', line)
    if m: return m.group(1)
    return None

def get_field_js(line, field):
    m = re.search(rf"\b{re.escape(field)}\s*:\s*'((?:[^'\\]|\\.)*)'", line)
    if m: return re.sub(r"\\(.)", r"\1", m.group(1))
    m = re.search(rf'\b{re.escape(field)}\s*:\s*(-?[0-9.]+)', line)
    if m: return m.group(1)
    return None

def has_field_json(line, field):
    return bool(re.search(rf'"{re.escape(field)}"', line))

def has_field_js(line, field):
    return bool(re.search(rf'\b{re.escape(field)}\s*:', line))

# ── Line patching ─────────────────────────────────────────────────────────────

def patch_json_line(line, field, value):
    """Insert "field": value before the closing } of a JSON-format single-line entry."""
    stripped = line.rstrip('\n')
    # Entries end with  },  or  }  on the last line
    m = re.match(r'^(.*\S)\s*\},?\s*$', stripped)
    if not m:
        return line
    base = m.group(1)
    suffix = ',' if stripped.rstrip().endswith('},') else ''
    return f'{base}, "{field}": {value} }}{suffix}\n'

def patch_js_line(line, field, value):
    """Insert field: value before the closing } of a JS-object-literal single-line entry."""
    stripped = line.rstrip('\n')
    m = re.match(r'^(.*\S)\s*\},?\s*$', stripped)
    if not m:
        return line
    base = m.group(1)
    suffix = ',' if stripped.rstrip().endswith('},') else ''
    return f'{base}, {field}: {value} }}{suffix}\n'

# ── Core file processor ───────────────────────────────────────────────────────

MISS_SENTINEL = '__NOT_FOUND__'

def process_lines(lines, cache, fetch_map, stats):
    """
    fetch_map: list of dicts describing what to do per entry type:
      { 'id_pattern': regex, 'is_json': bool,
        'field': str, 'fetch': callable(title, year, author) → value|None }
    Each line is passed through ALL matching specs so multiple fields can be
    written in a single pass (e.g. totalMinutes + episodes for the same TV line).
    Returns new_lines (list), changed (bool).
    """
    new_lines = []
    changed = False

    for line in lines:
        current = line  # accumulates patches across multiple matching specs

        for spec in fetch_map:
            if not re.search(spec['id_pattern'], current):
                continue
            is_json = spec['is_json']
            field   = spec['field']
            get     = get_field_json if is_json else get_field_js
            has     = has_field_json if is_json else has_field_js

            # Skip if field already present in (possibly-already-patched) current line
            if has(current, field):
                continue

            title  = get(current, 'title')
            year   = get(current, 'year')
            author = get(current, 'director')
            if not title or not year:
                continue

            cache_key = f'{spec["id_pattern"]}|{field}|{normalize(title)}|{year}'
            if cache_key not in cache:
                print(f'  [{field.upper()}] {title} ({year})')
                val = spec['fetch'](title, year, author)
                cache[cache_key] = val if val is not None else MISS_SENTINEL
                time.sleep(0.28)
            else:
                val = cache[cache_key]

            if val and val != MISS_SENTINEL:
                patch = patch_json_line if is_json else patch_js_line
                current = patch(current, field, val)
                stats['patched'] += 1
                changed = True
            elif val == MISS_SENTINEL:
                stats['not_found'] += 1

        new_lines.append(current)

    return new_lines, changed

def write_file(path, new_lines):
    if not DRY_RUN:
        with open(path, 'w', encoding='utf-8') as f:
            f.writelines(new_lines)

# ── Build fetch map ───────────────────────────────────────────────────────────

def build_fetch_map(tmdb_key, igdb_token, twitch_id):
    """Returns fetch specs for imports.js (prefix-based IDs) and data.js (medium-based)."""

    def film_rt(t, y, a):         return tmdb_movie_runtime(tmdb_key, t, y)
    def tv_mins(t, y, a):         return tmdb_tv_total_minutes(tmdb_key, t, y)
    def tv_eps(t, y, a):          return tmdb_tv_episodes(tmdb_key, t, y)
    def game_rating(t, y, a):     return igdb_game_rating(twitch_id, igdb_token, t, y) if igdb_token else None
    def game_genres_json(t, y, a):
        g = igdb_game_genres(twitch_id, igdb_token, t, y) if igdb_token else None
        return f'"{g}"' if g else None
    def game_genres_js(t, y, a):
        g = igdb_game_genres(twitch_id, igdb_token, t, y) if igdb_token else None
        return f"'{g}'" if g else None
    def book_pg(t, y, a):         return openlibrary_pages(t, a)

    want_films  = not ONLY_TYPE or ONLY_TYPE in ('films', 'movies')
    want_tv     = not ONLY_TYPE or ONLY_TYPE in ('tv', 'shows')
    want_games  = not ONLY_TYPE or ONLY_TYPE in ('games',)
    want_books  = not ONLY_TYPE or ONLY_TYPE in ('books',)

    # imports.js specs — identified by ID prefix
    imports_specs = []
    if want_films:
        # Films use JS object literal (unquoted keys, single quotes)
        imports_specs.append({'id_pattern': r"\bid\s*:\s*'imp-f-",
                               'is_json': False, 'field': 'runtime', 'fetch': film_rt})
    if want_tv:
        imports_specs.append({'id_pattern': r'"id"\s*:\s*"imp-s-',
                               'is_json': True, 'field': 'totalMinutes', 'fetch': tv_mins})
        imports_specs.append({'id_pattern': r'"id"\s*:\s*"imp-s-',
                               'is_json': True, 'field': 'episodes', 'fetch': tv_eps})
    if want_games:
        imports_specs.append({'id_pattern': r'"id"\s*:\s*"imp-g-',
                               'is_json': True, 'field': 'igdbRating', 'fetch': game_rating})
        imports_specs.append({'id_pattern': r'"id"\s*:\s*"imp-g-',
                               'is_json': True, 'field': 'igdbGenres', 'fetch': game_genres_json})
    if want_books:
        imports_specs.append({'id_pattern': r'"id"\s*:\s*"imp-b-',
                               'is_json': True, 'field': 'pages', 'fetch': book_pg})

    # data.js specs — identified by medium field (JS object literal)
    MEDIUM_MAP = {}
    if want_films:
        for m in ('Movies', 'Feature Animation', 'Shorts'):
            MEDIUM_MAP[m] = ('runtime', film_rt)
    if want_tv:
        for m in ('TV', 'Animated Series'):
            MEDIUM_MAP[m] = ('totalMinutes', tv_mins)
    if want_games:
        MEDIUM_MAP['Games'] = ('igdbRating', game_rating)
    if want_books:
        MEDIUM_MAP['Books'] = ('pages', book_pg)

    datajs_specs = []
    for medium, (field, fetch_fn) in MEDIUM_MAP.items():
        datajs_specs.append({
            'id_pattern': rf"\bmedium\s*:\s*'{re.escape(medium)}'",
            'is_json': False, 'field': field, 'fetch': fetch_fn,
        })
    if want_games:
        datajs_specs.append({
            'id_pattern': r"\bmedium\s*:\s*'Games'",
            'is_json': False, 'field': 'igdbGenres', 'fetch': game_genres_js,
        })

    return imports_specs, datajs_specs

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    env = load_env()
    tmdb_key      = env.get('TMDB_API_KEY', '')
    twitch_id     = env.get('TWITCH_CLIENT_ID', '')
    twitch_secret = env.get('TWITCH_CLIENT_SECRET', '')

    if not tmdb_key:
        print('ERROR: TMDB_API_KEY not found.')
        print('  1. Get a free API key at https://www.themoviedb.org/settings/api')
        print('  2. Create a .env file in Culture_2/ with:  TMDB_API_KEY=your_key_here')
        sys.exit(1)

    igdb_token = None
    if twitch_id and twitch_secret:
        print('Authenticating with IGDB...', end=' ', flush=True)
        igdb_token = igdb_auth(twitch_id, twitch_secret)
        print('OK' if igdb_token else 'FAILED (games will be skipped)')
    else:
        print('No Twitch credentials — games will be skipped.')
        print('  Get free credentials at https://dev.twitch.tv/console/apps')

    cache = load_cache()

    if CLEAR_GAMES:
        sentinel = MISS_SENTINEL
        before = len(cache)
        cache = {k: v for k, v in cache.items()
                 if not ('playtime' in k and v == sentinel)}
        removed = before - len(cache)
        print(f'Cleared {removed} stale game cache entries.')
        save_cache(cache)

    stats = {'patched': 0, 'not_found': 0}

    print(f'\n{"[DRY RUN] " if DRY_RUN else ""}Processing...\n')

    imports_specs, datajs_specs = build_fetch_map(tmdb_key, igdb_token, twitch_id)

    print('=== imports.js ===')
    with open(IMPORTS_JS, encoding='utf-8') as f:
        lines = f.readlines()
    new_lines, changed = process_lines(lines, cache, imports_specs, stats)
    if changed:
        write_file(IMPORTS_JS, new_lines)
        print(f'  → imports.js updated')

    print('\n=== data.js ===')
    with open(DATA_JS, encoding='utf-8') as f:
        lines = f.readlines()
    new_lines, changed = process_lines(lines, cache, datajs_specs, stats)
    if changed:
        write_file(DATA_JS, new_lines)
        print(f'  → data.js updated')

    save_cache(cache)

    print(f'\nDone — patched: {stats["patched"]}, no match found: {stats["not_found"]}')
    if DRY_RUN:
        print('(dry run — no files written)')
    else:
        print('Run again at any time to fetch data for newly-added entries.')

if __name__ == '__main__':
    main()
