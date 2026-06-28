# Data pipeline & update runbook

How the generated overlays are produced, and the exact order to run things when you
add or change library data. See `../CLAUDE.md` for the data model and `SCRIPTS.md` for
per-script detail.

## Overlay map (generated `.js` ← script ← source)

| Overlay `.js` (`window.` global) | Built by | External source | Cache / source file |
|---|---|---|---|
| `cast_data.js` (`CULTURE_CAST`) | `update_cast.py` | TMDB | `cast_cache.json` |
| `cast_data.js` (igdb fields) | `update_igdb.py`, `update_steam_tags.py` | IGDB / SteamSpy | — |
| `wishlist_cast.js` (`CULTURE_WISHLIST_CAST`) | `update_wishlist_enrich.py` | TMDB / IGDB | — |
| `omdb_data.js` (`CULTURE_OMDB`) | `update_omdb.py` | OMDb | `omdb_cache.json` (committed) |
| `tmdb_data.js` (`CULTURE_TMDB`) | `update_tmdb_overview.py` | TMDB | `tmdb_cache.json` |
| `books_data.js` (`CULTURE_BOOKS`) | `update_books.py` | OpenLibrary | — |
| `game_imdb.js` (`CULTURE_GAME_IMDB`) | `update_game_imdb.py` | Wikidata | — |
| `filmweb_notes.js` (`CULTURE_FILMWEB_NOTES`) | `build_filmweb_notes.py` | scraped CSV (`scrape_filmweb_reviews.py`) | — |
| `notes_en.js` (`CULTURE_NOTES_EN`) | `build_notes_en.py` | `notes_en_source.json` | — |
| `badges.js` (`CULTURE_BADGES`) | `build_badges.py` | `badges_source.json` | — |

Keys (`.env`): `OMDB_API_KEY`, `TMDB_API_KEY`, `TWITCH_CLIENT_ID`/`TWITCH_CLIENT_SECRET`
(IGDB), `LASTFM_API_KEY`. Never commit `.env`.

## Runbook — I added/edited a SEEN item (data.js or imports.js)

Run only what's relevant to the new item's medium. All are resumable (skip cached) and
safe to re-run.

1. **`python update_omdb.py --limit N`** — OMDb payload (plot, cast, ratings, sometimes
   poster) for films/TV. (`--limit` to respect the ~1000/day free tier.)
2. **`python update_cast.py [--ids=a,b,c]`** — TMDB cast/crew/tags **and `tmdbPoster`**
   for films/TV. `--ids=` targets specific ids (e.g. just-added titles).
3. **`python update_tmdb_overview.py`** — TMDB synopsis (the Reader's IMDb⇄TMDB toggle).
4. Games only: **`python update_igdb.py`** (cover, tags) and/or **`update_game_imdb.py`**
   (IMDb id), **`update_steam_tags.py`** (Steam tags).
5. Books only: **`python update_books.py`**.
6. Badges: edit `badges_source.json` → **`python build_badges.py`**. (Or set base
   highlights inline in the data file — no build needed for inline.)
7. EN notes: edit `notes_en_source.json` → **`python build_notes_en.py`**.
8. **Bump `?v=` in `index.html`** (every `?v=N` → `N+1`). REQUIRED or the change won't show.
9. Commit + push.

## Runbook — I added/edited a WISHLIST item

1. **`python update_wishlist_enrich.py`** — writes region/director/runtime/genres/cast/
   `tmdbPoster` into `wishlist_cast.js` (wishlist.js itself stays importer-owned).
2. Bump `?v=`, commit.

## ⚠ Source-mutator scripts (rewrite hand-authored files in place — review the diff)

These do NOT emit an overlay; they patch `data.js` / `imports.js` / `wishlist.js`
directly. Always `--dry-run` first and inspect `git diff` after.

- `update_imports.py` — reconciles `imports.js` (+ data.js favorites) against Filmweb CSVs.
- `update_wishlist.py` — (re)builds `wishlist.js` from Filmweb watchlist CSVs.
- `update_directors.py` — backfills missing `director` in `imports.js`.
- `update_regions.py` — backfills missing `region` in `imports.js`.
- `update_runtimes.py` — backfills `runtime`/length in `imports.js` + `data.js`.
- `update_titles.py` — backfills `enTitle` across the library.

These are **build-time / bulk-ingest** tools (run when importing a fresh Filmweb dump or
backfilling a field), not part of the routine per-item loop. They live in `archive/`.

## Quick "is anything missing data?" check
`python audit_enrich.py` (coverage per medium) · `python audit_omdb.py` (OMDb health) ·
`python audit_badges.py` (badge frequency/co-occurrence).
