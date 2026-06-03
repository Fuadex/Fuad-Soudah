#!/usr/bin/env python3
"""
update_igdb.py
Fetches IGDB data for every game entry and writes enrichment to cast_data.js
(igdbCover, tags, productionCompanies, igdbPublisher, igdbSummary, igdbFranchise)
and patches imports.js inline (igdbGenres, igdbRating).

Setup — .env in this directory:
  TWITCH_CLIENT_ID=...
  TWITCH_CLIENT_SECRET=...

Overrides — igdb_overrides.json (optional):
  { "imp-g-XXXXXXX": 12345 }   map entry ID → IGDB game ID
  OR
  { "normalized title|year": 12345 }   map search key → IGDB game ID

Run:
  python update_igdb.py            full run
  python update_igdb.py --dry-run  preview, no writes
  python update_igdb.py --force    re-fetch even if cached
"""

import json, os, re, sys, time, unicodedata
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError

SCRIPT_DIR     = os.path.dirname(os.path.abspath(__file__))
IMPORTS_JS     = os.path.join(SCRIPT_DIR, 'imports.js')
CAST_JS        = os.path.join(SCRIPT_DIR, 'cast_data.js')
CACHE_FILE     = os.path.join(SCRIPT_DIR, 'igdb_cache.json')
OVERRIDES_FILE = os.path.join(SCRIPT_DIR, 'igdb_overrides.json')
ENV_FILE       = os.path.join(SCRIPT_DIR, '.env')

DRY_RUN = '--dry-run' in sys.argv
FORCE   = '--force'   in sys.argv

# ── Title aliases — Filmweb stores non-English / localised titles ─────────────
# Maps (original_title, year) → search string sent to IGDB

TITLE_SEARCH_ALIASES = {
    ("Wander to Kyozou",                            2005): "Shadow of the Colossus",
    ("Wiedźmin 3: Dziki Gon - Serca z kamienia",    2015): "The Witcher 3 Hearts of Stone",
    ("Wiedźmin 3: Dziki Gon - Krew i wino",         2016): "The Witcher 3 Blood and Wine",
    ("Wiedźmin 3: Dziki Gon",                       2015): "The Witcher 3 Wild Hunt",
    ("Wiedźmin 2: Zabójcy królów",                  2011): "The Witcher 2 Assassins of Kings",
    ("Alpha Protocol: The Espionage RPG",            2010): "Alpha Protocol",
    ("Gothic II: Die Nacht des Raben",              2003): "Gothic II Night of the Raven",
    ("Die Stämme",                                  2003): "Tribal Wars",
    ("Half-Life: Counter-Strike",                   2000): "Counter-Strike",
    ("Böse Nachbarn",                               2003): "Bad Neighbours",
    ("Pocket Monsters Blue",                        1996): "Pokemon Blue Version",
    ("Kurka Wodna 3: Popłoch w kurniku",            2003): "Moorhen 3",
    ("Legaia Densetsu",                             1998): "Legend of Legaia",
    ("Biohazard: Gun Survivor",                     2000): "Resident Evil Survivor",
    ("Croc 2: Kingdom of the Gobbo's",              1999): "Croc 2",
}

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
    for k in ('TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET'):
        if k in os.environ and k not in env:
            env[k] = os.environ[k]
    return env

def load_overrides():
    if os.path.exists(OVERRIDES_FILE):
        with open(OVERRIDES_FILE, encoding='utf-8') as f:
            try:
                return json.load(f)
            except json.JSONDecodeError:
                pass
    return {}

# ── HTTP ──────────────────────────────────────────────────────────────────────

def http_post(url, body, headers=None):
    h = {'Content-Type': 'text/plain', 'Accept-Encoding': 'identity',
         'User-Agent': 'culture-app/1.0'}
    if headers:
        h.update(headers)
    try:
        data = body.encode('utf-8') if isinstance(body, str) else body
        req = Request(url, data=data, headers=h, method='POST')
        with urlopen(req, timeout=14) as r:
            return json.loads(r.read().decode('utf-8'))
    except HTTPError as e:
        body_text = e.read().decode('utf-8', errors='replace')
        if e.code == 429:
            print('  Rate limited — sleeping 3s')
            time.sleep(3)
        else:
            print(f'  HTTP {e.code}: {body_text[:200]}')
        return None
    except (URLError, json.JSONDecodeError) as e:
        print(f'  Error: {e}')
        return None

# ── Auth ──────────────────────────────────────────────────────────────────────

def get_token(client_id, client_secret):
    url = (f'https://id.twitch.tv/oauth2/token'
           f'?client_id={client_id}&client_secret={client_secret}'
           f'&grant_type=client_credentials')
    resp = http_post(url, '')
    if not resp or 'access_token' not in resp:
        print(f'ERROR: could not get Twitch token: {resp}')
        sys.exit(1)
    return resp['access_token']

# ── String utils ──────────────────────────────────────────────────────────────

def normalize(s):
    s = unicodedata.normalize('NFKD', s.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

def match_score(a, b):
    na, nb = normalize(a), normalize(b)
    if na == nb: return 1.0
    if na in nb or nb in na: return 0.85
    wa, wb = set(na.split()), set(nb.split())
    if not wa or not wb: return 0.0
    return len(wa & wb) / max(len(wa), len(wb))

# ── IGDB ──────────────────────────────────────────────────────────────────────

IGDB_GAMES = 'https://api.igdb.com/v4/games'
IGDB_COVER = 'https://images.igdb.com/igdb/image/upload/t_cover_big/{}.jpg'

IGDB_FIELDS = (
    'id, name, first_release_date, '
    'cover.image_id, '
    'genres.name, '
    'themes.name, '
    'keywords.name, '
    'involved_companies.company.name, involved_companies.developer, involved_companies.publisher, '
    'total_rating, total_rating_count, '
    'summary, '
    'franchises.name, collections.name'
)

def igdb_fetch_by_id(token, client_id, igdb_id):
    headers = {'Client-ID': client_id, 'Authorization': f'Bearer {token}'}
    query = f'where id = {igdb_id}; fields {IGDB_FIELDS}; limit 1;'
    results = http_post(IGDB_GAMES, query, headers)
    return results[0] if results else None

def igdb_search(token, client_id, search_title, year):
    headers = {'Client-ID': client_id, 'Authorization': f'Bearer {token}'}
    escaped = search_title.replace('"', '\\"')
    query = f'search "{escaped}"; fields {IGDB_FIELDS}; limit 10;'
    results = http_post(IGDB_GAMES, query, headers)
    if not results:
        return None

    best, best_score = None, 0.40
    for r in results:
        score = match_score(search_title, r.get('name') or '')
        ts = r.get('first_release_date')
        if ts:
            r_year = time.gmtime(int(ts)).tm_year
            if abs(r_year - int(year)) > 2:
                score *= 0.5
        if score > best_score:
            best, best_score = r, score
    return best

def parse_igdb_result(r):
    """Extract enrichment fields from an IGDB game object."""
    out = {}

    # Cover
    cover_obj = r.get('cover') or {}
    image_id  = cover_obj.get('image_id') if isinstance(cover_obj, dict) else None
    if image_id:
        out['igdbCover'] = IGDB_COVER.format(image_id)

    # Genres (inline patch target — returned here for completeness)
    genres_raw = r.get('genres') or []
    out['_genres'] = ', '.join(g['name'] for g in genres_raw if isinstance(g, dict) and g.get('name'))

    # Rating
    total = r.get('total_rating')
    count = r.get('total_rating_count') or 0
    if total is not None and count >= 5:
        out['_rating'] = round(total)

    # Tags = themes + keywords (limited to 25 total)
    themes = [t['name'] for t in (r.get('themes') or []) if isinstance(t, dict) and t.get('name')]
    keywords = [k['name'] for k in (r.get('keywords') or []) if isinstance(k, dict) and k.get('name')]
    tags = themes + [k for k in keywords if k not in themes]
    if tags:
        out['tags'] = tags[:25]

    # Involved companies
    developers  = []
    publishers  = []
    for ic in (r.get('involved_companies') or []):
        if not isinstance(ic, dict):
            continue
        co = ic.get('company') or {}
        name = co.get('name') if isinstance(co, dict) else None
        if not name:
            continue
        if ic.get('developer'):
            developers.append(name)
        if ic.get('publisher'):
            publishers.append(name)
    if developers:
        out['productionCompanies'] = developers
    if publishers:
        out['igdbPublisher'] = ', '.join(publishers[:2])

    # Summary
    summary = (r.get('summary') or '').strip()
    if summary:
        out['igdbSummary'] = summary

    # Franchise / collection
    names = ([f['name'] for f in (r.get('franchises') or []) if isinstance(f, dict) and f.get('name')] +
             [c['name'] for c in (r.get('collections') or []) if isinstance(c, dict) and c.get('name')])
    if names:
        out['igdbFranchise'] = names[0]

    return out

# ── cast_data.js ──────────────────────────────────────────────────────────────

def load_cast_data():
    if os.path.exists(CAST_JS):
        content = open(CAST_JS, encoding='utf-8').read()
        m = re.search(r'window\.CULTURE_CAST\s*=\s*(\{[\s\S]*\});', content)
        if m:
            try:
                return json.loads(m.group(1))
            except json.JSONDecodeError:
                pass
    return {}

def save_cast_data(data):
    if DRY_RUN:
        return
    with open(CAST_JS, 'w', encoding='utf-8') as f:
        f.write('// cast_data.js — generated by update_cast.py / update_igdb.py. Do not edit by hand.\n')
        f.write('// Re-run: python update_cast.py  /  python update_igdb.py\n')
        f.write('window.CULTURE_CAST = ')
        f.write(json.dumps(data, indent=2, ensure_ascii=False))
        f.write(';\n')

# ── imports.js game parsing / inline patching ─────────────────────────────────

def parse_game_entries(path):
    entries = []
    with open(path, encoding='utf-8') as f:
        lines = f.readlines()
    for i, line in enumerate(lines):
        if '"imp-g-' not in line:
            continue
        m = re.search(r'"id"\s*:\s*"(imp-g-[^"]+)"', line)
        if not m:
            continue
        item_id = m.group(1)
        tm = re.search(r'"title"\s*:\s*"((?:[^"\\]|\\.)*)"', line)
        ym = re.search(r'"year"\s*:\s*(\d{4})', line)
        if not tm or not ym:
            continue
        title = re.sub(r'\\(.)', r'\1', tm.group(1))
        year  = int(ym.group(1))
        entries.append({
            'line_idx':   i,
            'id':         item_id,
            'title':      title,
            'year':       year,
            'has_genres': 'igdbGenres' in line,
            'has_rating': 'igdbRating' in line,
        })
    return entries, lines

def patch_game_line(line, genres=None, rating=None):
    stripped = line.rstrip()
    if stripped.endswith('},'):
        tail, base = '},', stripped[:-2]
    elif stripped.endswith('}'):
        tail, base = '}', stripped[:-1]
    else:
        return line
    additions = []
    if genres and 'igdbGenres' not in line:
        escaped = genres.replace('"', '\\"')
        additions.append(f' "igdbGenres": "{escaped}"')
    if rating is not None and 'igdbRating' not in line:
        additions.append(f' "igdbRating": {rating}')
    if not additions:
        return line
    return base + ',' + ','.join(additions) + tail + '\n'

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
    client_id     = env.get('TWITCH_CLIENT_ID', '')
    client_secret = env.get('TWITCH_CLIENT_SECRET', '')
    if not client_id or not client_secret:
        print('ERROR: TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET missing from .env')
        sys.exit(1)

    overrides = load_overrides()

    print('Authenticating with Twitch...')
    token = get_token(client_id, client_secret)
    print(f'  OK — token {token[:8]}...\n')

    game_entries, lines = parse_game_entries(IMPORTS_JS)
    cast_data = load_cast_data()
    cache     = load_cache()

    print(f'Games in imports.js:   {len(game_entries)}')
    print(f'Existing cast entries: {len(cast_data)}')
    print()

    stats = {'covers': 0, 'tags': 0, 'companies': 0, 'summaries': 0,
             'genres_patched': 0, 'ratings_patched': 0, 'no_match': 0, 'skipped': 0}
    no_match_list = []

    for entry in game_entries:
        item_id = entry['id']
        title   = entry['title']
        year    = entry['year']

        existing_cd  = cast_data.get(item_id, {})
        needs_cover  = 'igdbCover' not in existing_cd
        needs_genres = not entry['has_genres']
        needs_rating = not entry['has_rating']
        needs_tags   = 'tags' not in existing_cd
        needs_co     = 'productionCompanies' not in existing_cd

        if not FORCE and not any([needs_cover, needs_genres, needs_rating, needs_tags, needs_co]):
            stats['skipped'] += 1
            continue

        # Check overrides (by entry ID first, then by normalize(title)|year)
        override_key_id    = item_id
        override_key_title = f'{normalize(title)}|{year}'
        igdb_id_override   = overrides.get(override_key_id) or overrides.get(override_key_title)

        # Search title — use alias if one is defined
        search_title = TITLE_SEARCH_ALIASES.get((title, year), title)

        cache_key = f'{item_id}|{normalize(search_title)}|{year}'

        print(f'  {title} ({year})', end='', flush=True)
        if search_title != title:
            print(f' → searching "{search_title}"', end='', flush=True)

        if cache_key not in cache or FORCE:
            if igdb_id_override:
                result = igdb_fetch_by_id(token, client_id, igdb_id_override)
            else:
                result = igdb_search(token, client_id, search_title, year)
            cache[cache_key] = result
            time.sleep(0.26)
        else:
            result = cache[cache_key]

        if not result:
            print(' — no IGDB match')
            no_match_list.append((title, year))
            stats['no_match'] += 1
            continue

        enrichment = parse_igdb_result(result)
        notes = []

        # — cast_data.js fields —
        updated_cd = dict(existing_cd)

        if 'igdbCover' in enrichment and (needs_cover or FORCE):
            updated_cd['igdbCover'] = enrichment['igdbCover']
            stats['covers'] += 1
            notes.append('cover')

        if 'tags' in enrichment and (needs_tags or FORCE):
            updated_cd['tags'] = enrichment['tags']
            stats['tags'] += 1
            notes.append(f'{len(enrichment["tags"])} tags')

        if 'productionCompanies' in enrichment and (needs_co or FORCE):
            updated_cd['productionCompanies'] = enrichment['productionCompanies']
            stats['companies'] += 1
            notes.append(f'dev: {enrichment["productionCompanies"][0][:20]}')

        for field in ('igdbPublisher', 'igdbSummary', 'igdbFranchise'):
            if field in enrichment and (field not in existing_cd or FORCE):
                updated_cd[field] = enrichment[field]
                if field == 'igdbSummary':
                    stats['summaries'] += 1
                    notes.append('summary')
                elif field == 'igdbFranchise':
                    notes.append(f'franchise: {enrichment[field][:20]}')

        if updated_cd != existing_cd:
            cast_data[item_id] = updated_cd

        # — imports.js inline patches —
        genres = enrichment.get('_genres', '')
        rating = enrichment.get('_rating')

        if genres and needs_genres:
            lines[entry['line_idx']] = patch_game_line(lines[entry['line_idx']], genres=genres)
            stats['genres_patched'] += 1
            notes.append(f'genres({genres[:25]})')

        if rating is not None and needs_rating:
            lines[entry['line_idx']] = patch_game_line(lines[entry['line_idx']], rating=rating)
            stats['ratings_patched'] += 1
            notes.append(f'rating({rating})')

        print(f' — {", ".join(notes) if notes else "already complete"}')

    # Write
    if not DRY_RUN:
        with open(IMPORTS_JS, 'w', encoding='utf-8') as f:
            f.writelines(lines)
        print(f'\nimports.js written ({len(lines)} lines)')

        save_cast_data(cast_data)
        print(f'cast_data.js written ({len(cast_data)} entries)')

    save_cache(cache)
    print(f'igdb_cache.json saved ({len(cache)} entries)')

    print(f'\nResults:')
    print(f'  Covers:            {stats["covers"]}')
    print(f'  Tags sets:         {stats["tags"]}')
    print(f'  Developer entries: {stats["companies"]}')
    print(f'  Summaries:         {stats["summaries"]}')
    print(f'  Genres patched:    {stats["genres_patched"]}')
    print(f'  Ratings patched:   {stats["ratings_patched"]}')
    print(f'  No IGDB match:     {stats["no_match"]}')
    print(f'  Skipped (done):    {stats["skipped"]}')

    if no_match_list:
        print(f'\nStill unmatched ({len(no_match_list)}) — add to igdb_overrides.json:')
        print('  Format: { "imp-g-XXXXXXX": <igdb_game_id> }')
        print('  Find IDs at: https://www.igdb.com\n')
        for t, y in sorted(no_match_list):
            print(f'  {y}  {t}')

    if DRY_RUN:
        print('\n(dry run — no files written)')

if __name__ == '__main__':
    main()
