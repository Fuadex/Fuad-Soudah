#!/usr/bin/env python3
"""
update_wishlist.py
Builds wishlist.js (window.CULTURE_WISHLIST) from the Filmweb "want to" exports:
  - Filmweb_watchlist_film.csv     → Movies / Feature Animation / Shorts
  - Filmweb_watchlist_serial.csv   → TV  (animated series refined later by hand/enrich)
  - Filmweb_playlist_games.csv     → Games

Behaviour:
  - Distinct ids (wl-f- / wl-s- / wl-g-) so the wishlist never collides with the
    seen pool (imp-* / data.js favourites).
  - Drops anything already SEEN (its Filmweb id appears in data.js or imports.js).
  - Re-run safe: PRESERVES every hand-added field (priority, providers, moodTags,
    addedDate, source, shortlist) and every enrichment field (region, director,
    runtime, genres, …) by merging on id; only fwAvg/voteCount are refreshed.

Output is strict JSON (one object per line) wrapped as a JS assignment, so it is
valid JS, round-trips via json, and is line-patchable by the enrichment scripts.

Run:
  python update_wishlist.py            full run (writes wishlist.js)
  python update_wishlist.py --dry-run  preview only
"""

import csv, json, os, re, sys

import update_imports as ui  # reuse classification tables + helpers

SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
WISHLIST_JS  = os.path.join(SCRIPT_DIR, 'wishlist.js')
DATA_JS      = os.path.join(SCRIPT_DIR, 'data.js')
IMPORTS_JS   = os.path.join(SCRIPT_DIR, 'imports.js')

CSV_FILM   = os.path.join(SCRIPT_DIR, 'Filmweb_watchlist_film.csv')
CSV_SERIAL = os.path.join(SCRIPT_DIR, 'Filmweb_watchlist_serial.csv')
CSV_GAME   = os.path.join(SCRIPT_DIR, 'Filmweb_playlist_games.csv')

DRY_RUN = '--dry-run' in sys.argv

# Filmweb URL path per kind.
KIND_PATH = {'film': 'film', 'serial': 'serial', 'game': 'videogame'}
KIND_PREFIX = {'film': 'wl-f-', 'serial': 'wl-s-', 'game': 'wl-g-'}

# Canonical key order for tidy output. Anything not listed is appended after.
KEY_ORDER = [
    'id', 'title', 'year', 'medium', 'link', 'fwAvg', 'voteCount',
    # enrichment (added later by the update_*.py scripts)
    'region', 'director', 'studio', 'runtime', 'genres', 'cast',
    'writer', 'cinematographer', 'composer', 'tmdbPoster', 'igdbCover',
    # hand-curated (preserved across re-runs)
    'priority', 'providers', 'moodTags', 'addedDate', 'source', 'shortlist',
]


def seen_filmweb_ids():
    """All Filmweb ids already in the SEEN library, bucketed by kind."""
    buckets = {'film': set(), 'serial': set(), 'game': set()}
    path_to_kind = {'film': 'film', 'serial': 'serial', 'videogame': 'game'}
    pat = re.compile(r"filmweb\.pl/(film|serial|videogame)/[^\"']*?-(\d+)[\"']")
    for path in (DATA_JS, IMPORTS_JS):
        try:
            with open(path, encoding='utf-8') as f:
                for m in pat.finditer(f.read()):
                    buckets[path_to_kind[m.group(1)]].add(m.group(2))
        except FileNotFoundError:
            pass
    return buckets


def read_csv(path, id_col):
    rows = []
    with open(path, newline='', encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            fid = (row.get(id_col) or '').strip()
            if fid:
                rows.append((fid, row))
    return rows


def parse_existing(path):
    """id -> full item dict, from a previously generated wishlist.js."""
    out = {}
    try:
        with open(path, encoding='utf-8') as f:
            for line in f:
                line = line.strip().rstrip(',')
                if line.startswith('{') and line.endswith('}'):
                    try:
                        obj = json.loads(line)
                        if 'id' in obj:
                            out[obj['id']] = obj
                    except json.JSONDecodeError:
                        pass
    except FileNotFoundError:
        pass
    return out


def medium_for(kind, orig, polish, year):
    if kind == 'serial':
        return 'TV'           # animated series refined by hand/enrichment later
    if kind == 'game':
        return 'Games'
    return ui.get_medium(orig, year, polish)   # Movies / Feature Animation / Shorts


def to_int(raw):
    try:
        return int(float((raw or '').strip()))
    except (TypeError, ValueError):
        return None


def order_keys(obj):
    rank = {k: i for i, k in enumerate(KEY_ORDER)}
    return {k: obj[k] for k in sorted(obj, key=lambda k: (rank.get(k, 999), k))}


def main():
    seen = seen_filmweb_ids()
    existing = parse_existing(WISHLIST_JS)

    sources = [
        ('film',   CSV_FILM,   'movieId'),
        ('serial', CSV_SERIAL, 'serialId'),
        ('game',   CSV_GAME,   'gameId'),
    ]

    items = []
    counts = {'film': 0, 'serial': 0, 'game': 0}
    dropped_seen = {'film': 0, 'serial': 0, 'game': 0}
    preserved = 0
    medium_stats = {}

    for kind, path, id_col in sources:
        for fid, row in read_csv(path, id_col):
            if fid in seen[kind]:
                dropped_seen[kind] += 1
                continue
            orig   = (row.get('originalTitle') or '').strip()
            polish = (row.get('polishTitle')   or '').strip()
            year   = to_int(row.get('year')) or 0
            title  = orig or polish
            link   = (f"https://www.filmweb.pl/{KIND_PATH[kind]}/"
                      f"{ui.quote_plus(polish, safe='', encoding='utf-8')}-{year}-{fid}")
            core = {
                'id':        KIND_PREFIX[kind] + fid,
                'title':     title,
                'year':      year,
                'medium':    medium_for(kind, orig, polish, year),
                'link':      link,
                'fwAvg':     ui.parse_fw_avg(row.get('fullRating') or ''),
                'voteCount': to_int(row.get('voteCount')),
            }
            core = {k: v for k, v in core.items() if v is not None}

            prev = existing.get(core['id'])
            if prev:
                # Preserve enrichment + hand fields; refresh community signal only.
                merged = {**core, **prev}
                merged['fwAvg']     = core.get('fwAvg', prev.get('fwAvg'))
                merged['voteCount'] = core.get('voteCount', prev.get('voteCount'))
                merged = {k: v for k, v in merged.items() if v is not None}
                items.append(order_keys(merged))
                preserved += 1
            else:
                items.append(order_keys(core))
            counts[kind] += 1
            medium_stats[core['medium']] = medium_stats.get(core['medium'], 0) + 1

    # ── report ──────────────────────────────────────────────────────────────
    total = len(items)
    print(f'Wishlist items: {total}')
    print(f'  films:   {counts["film"]:>4}   (dropped already-seen: {dropped_seen["film"]})')
    print(f'  serials: {counts["serial"]:>4}   (dropped already-seen: {dropped_seen["serial"]})')
    print(f'  games:   {counts["game"]:>4}   (dropped already-seen: {dropped_seen["game"]})')
    print(f'  preserved enrichment/user fields on {preserved} existing ids')
    print('Medium breakdown:')
    for k, v in sorted(medium_stats.items()):
        print(f'  {k}: {v}')

    # sanity: no id collision with the seen pool prefix
    bad = [it['id'] for it in items if it['id'].startswith('imp-')]
    if bad:
        print(f'WARNING: {len(bad)} ids collide with imp- prefix')

    if DRY_RUN:
        print('\n--dry-run: wishlist.js NOT written.')
        return

    lines = ['// Wishlist — things Fuad wants to watch / play / read (unseen).',
             '// Generated by update_wishlist.py; enrichment fields added by update_*.py.',
             '// Hand-edit priority / providers / moodTags / addedDate / source / shortlist;',
             '// they are preserved on re-import.',
             'window.CULTURE_WISHLIST = [']
    for it in items:
        lines.append(json.dumps(it, ensure_ascii=False) + ',')
    lines.append('];')
    with open(WISHLIST_JS, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')
    print(f'\nwishlist.js written ({total} items)')


if __name__ == '__main__':
    main()
