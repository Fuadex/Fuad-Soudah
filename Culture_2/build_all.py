#!/usr/bin/env python3
"""build_all.py — one entrypoint to (re)build the generated overlays and bump the
browser cache version, so "I changed data, now refresh the site" is a single command.

Default (fast, no network): recompile the source-JSON overlays (badges, EN notes,
filmweb notes) and bump every ?v=N in index.html to N+1.

  python build_all.py

--fetch : also run the API enrichment fetchers FIRST (OMDb, TMDB cast + overview,
          game IMDb, books, IGDB, Steam tags, wishlist). Slower, needs .env keys,
          all resumable. Use after adding new items.

  python build_all.py --fetch
  python build_all.py --fetch --omdb-limit 200   # cap OMDb's daily-tier calls

Never touches data.js / imports.js / wishlist.js (those are hand-authored; the
in-place backfillers live in archive/). See docs/DATA_PIPELINE.md.
"""
import os, re, subprocess, sys

SD = os.path.dirname(os.path.abspath(__file__))
PY = sys.executable

# API fetchers, in dependency-friendly order (only run with --fetch)
FETCH = [
    ('update_omdb.py', []),            # --omdb-limit forwarded below
    ('update_cast.py', []),
    ('update_tmdb_overview.py', []),
    ('update_game_imdb.py', []),
    ('update_books.py', []),
    ('update_igdb.py', []),
    ('update_steam_tags.py', []),
    ('update_wishlist_enrich.py', []),
]
# Source-JSON compilers (always run; fast, deterministic, no network)
COMPILE = ['build_badges.py', 'build_notes_en.py', 'build_filmweb_notes.py']


def run(script, args):
    print(f'\n=== {script} {" ".join(args)} ===')
    r = subprocess.run([PY, os.path.join(SD, script), *args])
    if r.returncode != 0:
        print(f'  (warning: {script} exited {r.returncode} — continuing)')


def bump_cache():
    p = os.path.join(SD, 'index.html')
    s = open(p, encoding='utf-8').read()
    vers = [int(m) for m in re.findall(r'\?v=(\d+)', s)]
    if not vers:
        print('\ncache: no ?v= found in index.html'); return
    cur = max(vers); nxt = cur + 1
    s = re.sub(r'\?v=\d+', f'?v={nxt}', s)
    open(p, 'w', encoding='utf-8').write(s)
    print(f'\ncache: ?v={cur} -> ?v={nxt}  (all {len(vers)} refs)')


def main():
    if '--fetch' in sys.argv:
        limit = next((sys.argv[i + 1] for i, a in enumerate(sys.argv) if a == '--omdb-limit'), None)
        for script, args in FETCH:
            if script == 'update_omdb.py' and limit:
                args = args + ['--limit', limit]
            run(script, args)
    for script in COMPILE:
        run(script, [])
    bump_cache()
    print('\nDone. Review `git diff`, then commit + push.')


if __name__ == '__main__':
    main()
