# Scripts index

Every Python script: what it does, what it reads/writes, and its status. Status legend:
**core** = routine overlay generator · **lib** = imported by other scripts (don't relocate)
· **audit** = read-only report · **acquire** = data acquisition · **build-time** = bulk
ingest / one-off backfill (mutates hand-authored files; lives in `archive/`) · **diag** =
dev diagnostic (`archive/`).

## Core overlay generators (run routinely — see DATA_PIPELINE.md)

| Script | Writes | Source | Status |
|---|---|---|---|
| `update_omdb.py` | `omdb_data.js` | OMDb | core, **lib** (→ update_tmdb_overview) |
| `update_cast.py` | `cast_data.js` (cast, crew, tags, `tmdbPoster`) | TMDB | core, **lib** (→ 5 scripts). `--ids=a,b` targets specific items |
| `update_tmdb_overview.py` | `tmdb_data.js` | TMDB | core |
| `update_igdb.py` | `cast_data.js` (igdb fields) + patches `imports.js` | IGDB | core, **lib** (→ steam_tags, titles, wishlist_enrich) |
| `update_steam_tags.py` | `cast_data.js` + `wishlist_cast.js` (game tags) | IGDB/SteamSpy | core |
| `update_game_imdb.py` | `game_imdb.js` | Wikidata | core |
| `update_books.py` | `books_data.js` | OpenLibrary | core |
| `update_wishlist_enrich.py` | `wishlist_cast.js` | TMDB/IGDB | core |
| `build_badges.py` | `badges.js` ← `badges_source.json` | — | core |
| `build_notes_en.py` | `notes_en.js` ← `notes_en_source.json` | — | core |
| `build_filmweb_notes.py` | `filmweb_notes.js` ← scraped CSV | — | core |

## Shared lib that's also a backfiller (stays in root)

| Script | Does | Status |
|---|---|---|
| `update_regions.py` | backfills `region` in `imports.js` | **lib** (imported by `update_wishlist_enrich`) — must stay in root even though it's a backfiller |

## Audit / read-only

| Script | Does |
|---|---|
| `audit_enrich.py` | per-medium coverage of every enrichment cache vs the library |
| `audit_omdb.py` | OMDb cache health; dumps misses to `omdb_review.txt` |
| `audit_badges.py` | badge frequency + co-occurrence on `badges_source.json` |
| `propose_badges.py` | heuristic badge re-curation proposal → `badge_proposal.md` |
| `list_untranslated.py` | lists Polish notes lacking an EN redraft |

## Acquisition (kept in root)

| Script | Does |
|---|---|
| `scrape_filmweb_reviews.py` | scrapes Fuad's own Filmweb vote comments → CSV (feeds `build_filmweb_notes.py`). Public per-vote endpoint; no auth. |

## `archive/` — build-time / bulk-ingest / diagnostic (not part of the per-item loop)

⚠ The build-time ones **rewrite hand-authored files in place** — `--dry-run` first, review
`git diff`. They were path-shimmed to read data from the project root (`../`).

| Script | Does | Status |
|---|---|---|
| `update_imports.py` | reconciles `imports.js` (+ data.js favs) against Filmweb CSVs | build-time |
| `update_wishlist.py` | (re)builds `wishlist.js` from Filmweb watchlist CSVs (imports `update_imports`) | build-time |
| `update_directors.py` | backfills missing `director` in `imports.js` | build-time |
| `update_runtimes.py` | backfills `runtime`/length in `imports.js` + `data.js` | build-time |
| `update_titles.py` | backfills `enTitle` library-wide (imports `update_cast`, `update_igdb`) | build-time |
| `test_igdb.py` | IGDB credential/connectivity check | diag |

## Removed
`update_tmdb_meta.py` — a redundant parallel poster overlay; deleted. Posters come from
`cast_data.js` (`update_cast.py`) with an OMDb-poster fallback in `enrichExtras`.
