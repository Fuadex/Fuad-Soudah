#!/usr/bin/env python3
"""
update_wishlist_enrich.py
Enriches the wishlist with metadata so "more like this", crossover, filtering and
Stats become meaningful. Reuses the existing TMDB/IGDB helper code and the same
.env keys, but writes EVERYTHING into wishlist_cast.js (window.CULTURE_WISHLIST_CAST)
keyed by id. wishlist.js itself is left untouched (importer-owned) — the app merges
the two with `{...item, ...cast[id]}` at load, so every enrichment field (region,
director, runtime, genres, cast, poster, even a Shorts medium-reclassification)
applies via the merge.

Films / TV  → TMDB  (region, director, runtime, genres, cast, crew, tmdbPoster)
Games       → IGDB  (igdbCover, igdbGenres, igdbRating, tags, studio, summary)

Posters are stored as tmdbPoster / igdbCover (never `poster`), so wishlist items
stay spines by default instead of becoming 1,000+ covers.

Setup — .env (same as the other scripts):
  TMDB_API_KEY=...
  TWITCH_CLIENT_ID=...        (games only)
  TWITCH_CLIENT_SECRET=...    (games only)

Run:
  python update_wishlist_enrich.py --dry-run        preview, no write
  python update_wishlist_enrich.py --limit 20       only first 20 unenriched (smoke test)
  python update_wishlist_enrich.py                  full run
  python update_wishlist_enrich.py --force          re-fetch even if cached
  python update_wishlist_enrich.py --games-only / --no-games
"""

import csv, json, os, re, sys, time

try:
    sys.stdout.reconfigure(encoding='utf-8')   # titles contain non-cp1252 chars
except Exception:
    pass

import update_cast as uc      # tmdb_search, http_get, _parse_tmdb, TMDB, load_env
import update_regions as ur   # ALPHA2_TO_REGION
import update_igdb as ug      # igdb_search, igdb_fetch_by_id, parse_igdb_result, get_token

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
WISHLIST_JS = os.path.join(SCRIPT_DIR, 'wishlist.js')
CAST_JS     = os.path.join(SCRIPT_DIR, 'wishlist_cast.js')
CACHE_FILE  = os.path.join(SCRIPT_DIR, 'wishlist_enrich_cache.json')

DRY_RUN    = '--dry-run' in sys.argv
FORCE      = '--force'   in sys.argv
GAMES_ONLY = '--games-only' in sys.argv
NO_GAMES   = '--no-games'   in sys.argv
ONLY_IDS   = next((set(a.split('=', 1)[1].split(',')) for a in sys.argv if a.startswith('--ids=')), None)
LIMIT = None
for a in sys.argv:
    if a.startswith('--limit'):
        m = re.search(r'\d+', a)
        if m:
            LIMIT = int(m.group())
        else:
            i = sys.argv.index(a)
            if i + 1 < len(sys.argv):
                LIMIT = int(sys.argv[i + 1])

MOVIE_MEDIA = {'Movies', 'Feature Animation', 'Shorts'}
TV_MEDIA    = {'TV', 'Animated Series'}

# Bump when the per-item fetch gains new fields so cached items are re-fetched
# once (resumable) without a blanket --force. v2 added tmdbRating + providers.
ENRICH_VERSION = 2
# Country (ISO-3166-1) to read TMDB watch-providers for, with fallback order.
PROVIDER_COUNTRIES = ['PL', 'US']

CSV_SOURCES = [
    ('wl-f-', os.path.join(SCRIPT_DIR, 'Filmweb_watchlist_film.csv'),   'movieId'),
    ('wl-s-', os.path.join(SCRIPT_DIR, 'Filmweb_watchlist_serial.csv'), 'serialId'),
    ('wl-g-', os.path.join(SCRIPT_DIR, 'Filmweb_playlist_games.csv'),   'gameId'),
]


def load_alt_titles():
    """id -> {orig, polish} so we can retry TMDB/IGDB matches under either name."""
    alt = {}
    for prefix, path, idcol in CSV_SOURCES:
        try:
            with open(path, newline='', encoding='utf-8-sig') as f:
                for row in csv.DictReader(f):
                    fid = (row.get(idcol) or '').strip()
                    if fid:
                        alt[prefix + fid] = {
                            'orig':   (row.get('originalTitle') or '').strip(),
                            'polish': (row.get('polishTitle') or '').strip(),
                        }
        except FileNotFoundError:
            pass
    return alt


def load_overrides():
    """Optional wishlist_overrides.json: { "<current title>": "<better search title>" }
    for stragglers TMDB/IGDB won't match under their romaji/Polish names."""
    p = os.path.join(SCRIPT_DIR, 'wishlist_overrides.json')
    if os.path.exists(p):
        try:
            return json.load(open(p, encoding='utf-8'))
        except json.JSONDecodeError:
            pass
    return {}


OVERRIDES = load_overrides()


def title_candidates(item, alt):
    """Ordered, de-duped title variants to try: a manual override first, then
    original, Polish, and the part before a ':' subtitle for each."""
    a = alt.get(item['id'], {})
    raw = [OVERRIDES.get(item.get('title', '')), item.get('title'), a.get('orig'), a.get('polish')]
    out = []
    for t in raw:
        if not t:
            continue
        for cand in (t, t.split(':')[0].strip()):
            if cand and cand not in out:
                out.append(cand)
    return out


def classify_medium(base, genres, runtime):
    """Reclassify by TMDB genres/runtime. base is the importer medium
    ('Movies' for films, 'TV' for serials). Returns the resolved medium."""
    is_anim = 'Animation' in (genres or [])
    if base in MOVIE_MEDIA or base == 'Movies':
        if runtime and 0 < runtime < 40:
            return 'Shorts'
        return 'Feature Animation' if is_anim else 'Movies'
    if base in TV_MEDIA or base == 'TV':
        return 'Animated Series' if is_anim else 'TV'
    return base


def load_wishlist():
    items = []
    with open(WISHLIST_JS, encoding='utf-8') as f:
        for line in f:
            s = line.strip().rstrip(',')
            if s.startswith('{') and s.endswith('}'):
                items.append(json.loads(s))
    return items


def load_cast():
    if os.path.exists(CAST_JS):
        m = re.search(r'window\.CULTURE_WISHLIST_CAST\s*=\s*(\{[\s\S]*\});',
                      open(CAST_JS, encoding='utf-8').read())
        if m:
            try:
                return json.loads(m.group(1))
            except json.JSONDecodeError:
                pass
    return {}


def save_cast(data):
    head = ('// Wishlist enrichment — machine-owned per-id cast / genres / poster / crew.\n'
            '// Generated by update_wishlist_enrich.py; do not hand-edit. Merged into\n'
            '// window.CULTURE_WISHLIST by id at load time.\n'
            'window.CULTURE_WISHLIST_CAST = ')
    with open(CAST_JS, 'w', encoding='utf-8') as f:
        f.write(head + json.dumps(data, indent=2, ensure_ascii=False) + ';\n')


def load_cache():
    if os.path.exists(CACHE_FILE):
        try:
            return json.load(open(CACHE_FILE, encoding='utf-8'))
        except json.JSONDecodeError:
            pass
    return {}


def save_cache(cache):
    with open(CACHE_FILE, 'w', encoding='utf-8') as f:
        json.dump(cache, f, indent=2, ensure_ascii=False)


def region_from(codes):
    for code in codes or []:
        c = code['iso_3166_1'] if isinstance(code, dict) else code
        r = ur.ALPHA2_TO_REGION.get((c or '').upper())
        if r:
            return r
    # an unmapped country still tells us it's not unknown → bucket as 'other'
    return 'other' if codes else None


def providers_from(data):
    """Streaming (flatrate) provider names from TMDB watch/providers, first
    available country in PROVIDER_COUNTRIES."""
    results = ((data.get('watch/providers') or {}).get('results') or {})
    for cc in PROVIDER_COUNTRIES:
        block = results.get(cc) or {}
        flat = block.get('flatrate') or []
        names = [p.get('provider_name') for p in flat if p.get('provider_name')]
        if names:
            # de-dupe preserving order, cap to keep the line short
            seen, out = set(), []
            for n in names:
                if n not in seen:
                    seen.add(n); out.append(n)
            return out[:6]
    return None


def tmdb_rating_from(data):
    """TMDB community average (0–10), only when it rests on a few votes."""
    va = data.get('vote_average')
    vc = data.get('vote_count') or 0
    if va and vc >= 10:
        return round(va, 1)
    return None


def best_tmdb_id(kind, key, candidates, year):
    """Try each candidate title; return the highest-scoring tmdb id."""
    best_id, best_score = None, 0
    for t in candidates:
        tid, score = uc.tmdb_search(kind, key, t, year)
        if tid and score > best_score:
            best_id, best_score = tid, score
        if best_score >= 0.95:   # near-exact, stop early
            break
    return best_id


def tmdb_enrich(key, item, alt):
    """Returns an enrichment dict for a film/TV wishlist item, or None if no match."""
    kind = 'movie' if item['medium'] in MOVIE_MEDIA else 'tv'
    tmdb_id = best_tmdb_id(kind, key, title_candidates(item, alt), item.get('year') or 0)
    if not tmdb_id:
        return None
    if kind == 'movie':
        data = uc.http_get(f'{uc.TMDB}/movie/{tmdb_id}?append_to_response=credits,keywords,watch/providers&api_key={key}')
        if not data:
            return None
        credits  = data.get('credits') or {}
        keywords = {'keywords': (data.get('keywords') or {}).get('keywords') or []}
        rich = uc._parse_tmdb(credits, keywords, data, kind='movie')
        director = next((c.get('name') for c in (credits.get('crew') or [])
                         if c.get('job') == 'Director' and c.get('name')), None)
        runtime  = data.get('runtime') or None
        region   = region_from(data.get('production_countries'))
    else:
        data = uc.http_get(f'{uc.TMDB}/tv/{tmdb_id}?append_to_response=aggregate_credits,keywords,watch/providers&api_key={key}')
        if not data:
            return None
        credits  = data.get('aggregate_credits') or {}
        keywords = {'results': (data.get('keywords') or {}).get('results') or []}
        rich = uc._parse_tmdb(credits, keywords, data, kind='tv')
        created = [c.get('name') for c in (data.get('created_by') or []) if c.get('name')]
        director = ', '.join(created[:2]) if created else None
        ert = data.get('episode_run_time') or []
        runtime = ert[0] if ert else None
        region  = region_from(data.get('origin_country'))

    out = dict(rich)
    if region:
        out['region'] = region
    if director:
        out['director'] = director
    if runtime:
        out['runtime'] = runtime
    tmdb_rating = tmdb_rating_from(data)
    if tmdb_rating is not None:
        out['tmdbRating'] = tmdb_rating
    providers = providers_from(data)
    if providers:
        out['providers'] = providers
    # Reclassify Movies→Shorts (runtime) / Feature Animation, TV→Animated Series.
    resolved = classify_medium(item['medium'], rich.get('genres'), runtime)
    if resolved != item['medium']:
        out['medium'] = resolved
    out['_ev'] = ENRICH_VERSION
    return out


def game_enrich(token, client_id, item, alt):
    r = None
    for t in title_candidates(item, alt):
        r = ug.igdb_search(token, client_id, t, item.get('year') or 0)
        if r:
            break
    if not r:
        return None
    parsed = ug.parse_igdb_result(r)
    out = {}
    if parsed.get('igdbCover'):        out['igdbCover'] = parsed['igdbCover']
    if parsed.get('_genres'):          out['igdbGenres'] = parsed['_genres']
    if parsed.get('_rating') is not None: out['igdbRating'] = parsed['_rating']
    if parsed.get('tags'):             out['tags'] = parsed['tags']
    if parsed.get('igdbSummary'):      out['igdbSummary'] = parsed['igdbSummary']
    if parsed.get('igdbFranchise'):    out['igdbFranchise'] = parsed['igdbFranchise']
    # studio = lead developer, else publisher
    devs = parsed.get('productionCompanies') or []
    if devs:
        out['studio'] = devs[0]
        out['productionCompanies'] = devs
    elif parsed.get('igdbPublisher'):
        out['studio'] = parsed['igdbPublisher'].split(',')[0].strip()
    out['_ev'] = ENRICH_VERSION
    return out


def main():
    env = uc.load_env()
    tmdb_key = env.get('TMDB_API_KEY', '')
    items = load_wishlist()
    cast  = load_cast()
    cache = load_cache()
    alt   = load_alt_titles()
    base_medium = {it['id']: it['medium'] for it in items}

    films = [it for it in items if it['medium'] in MOVIE_MEDIA or it['medium'] in TV_MEDIA]
    games = [it for it in items if it['medium'] == 'Games']

    def needs(it):
        if ONLY_IDS is not None:
            return it['id'] in ONLY_IDS   # targeted re-fetch of specific ids
        if FORCE:
            return True
        c = cache.get(it['id'])
        if c is None:
            return True                       # never matched yet → keep trying
        return c.get('_ev', 0) < ENRICH_VERSION  # older schema → refetch once

    matched = unmatched = skipped = 0
    no_match_titles = []

    # ── Films / TV via TMDB ──────────────────────────────────────────────────
    if not GAMES_ONLY:
        if not tmdb_key:
            print('ERROR: TMDB_API_KEY missing from .env — cannot enrich films/TV.')
        else:
            todo = [it for it in films if needs(it)]
            if LIMIT:
                todo = todo[:LIMIT]
            print(f'TMDB: {len(todo)} of {len(films)} film/TV items to enrich '
                  f'({len(films) - len(todo)} cached/skipped)')
            for n, it in enumerate(todo, 1):
                try:
                    res = tmdb_enrich(tmdb_key, it, alt)
                except Exception as e:
                    res = None
                    print(f'  ! {it["title"]}: {e}')
                if res:
                    cache[it['id']] = res
                    matched += 1
                else:
                    unmatched += 1
                    no_match_titles.append(f'{it["title"]} ({it.get("year")})')
                if n % 25 == 0:
                    print(f'    …{n}/{len(todo)} (matched {matched}, no-match {unmatched})')
                    if not DRY_RUN:
                        save_cache(cache)
                time.sleep(0.28)

    # ── Games via IGDB ───────────────────────────────────────────────────────
    if not NO_GAMES:
        cid = env.get('TWITCH_CLIENT_ID', '')
        csec = env.get('TWITCH_CLIENT_SECRET', '')
        if not (cid and csec):
            print('Note: TWITCH_CLIENT_ID/SECRET missing — skipping game enrichment.')
        else:
            token = ug.get_token(cid, csec)
            todo = [it for it in games if needs(it)]
            if LIMIT:
                todo = todo[:LIMIT]
            print(f'IGDB: {len(todo)} of {len(games)} games to enrich')
            for n, it in enumerate(todo, 1):
                try:
                    res = game_enrich(token, cid, it, alt)
                except Exception as e:
                    res = None
                    print(f'  ! {it["title"]}: {e}')
                if res:
                    cache[it['id']] = res
                    matched += 1
                else:
                    unmatched += 1
                    no_match_titles.append(f'{it["title"]} ({it.get("year")}) [game]')
                time.sleep(0.28)

    # ── reclassify medium across the WHOLE cache (no refetch needed) so the
    #    Movies→Feature Animation / TV→Animated Series / Shorts split applies to
    #    items enriched in earlier runs too. ──
    reclassed = {}
    for iid, data in cache.items():
        if not data:
            continue
        base = base_medium.get(iid)
        if base not in ('Movies', 'TV'):
            continue
        resolved = classify_medium(base, data.get('genres'), data.get('runtime'))
        if resolved != base:
            data['medium'] = resolved
            reclassed[resolved] = reclassed.get(resolved, 0) + 1
        elif 'medium' in data:
            del data['medium']  # clear stale override if it now matches base
    if reclassed:
        print('Reclassified medium:', ', '.join(f'{k}: {v}' for k, v in sorted(reclassed.items())))

    # ── merge cache → cast file (drop internal _underscore keys) ──────────────
    for iid, data in cache.items():
        if data:
            cast[iid] = {k: v for k, v in data.items() if not k.startswith('_')}

    print(f'\nMatched/enriched: {matched}   No match: {unmatched}')
    if no_match_titles:
        print('No TMDB/IGDB match (first 30):')
        for t in no_match_titles[:30]:
            print(f'  - {t}')

    if DRY_RUN:
        print('\n--dry-run: nothing written.')
        return
    save_cache(cache)
    save_cast(cast)
    print(f'wishlist_cast.js written ({len(cast)} enriched ids)')


if __name__ == '__main__':
    main()
