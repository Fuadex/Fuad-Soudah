# Culture — backlog / not-yet-done (as of v=59)

## Content / data passes
- **Translations** — only 30 notes redrafted to English so far. Remaining: ~17 curated
  Polish favourites, plus the ~960 imported (seen-library) Polish Filmweb comments. English
  now shows by default on hover + in the Reader; Polish is one click away.
- **Wishlist badge pass** — wishlist items are essentially un-badged; do a knowledge pass
  (and surface them in the Explorer).
- **OMDb coverage** — ~2,106 film/TV still un-fetched. Rerun `python update_omdb.py --limit N`
  over days. Also ~97 cached "misses" may include false-misses from hitting the daily cap —
  worth a targeted `--force` re-check.
- **OMDb short plots** — `PlotShort` backfill never ran (0). Once pulled, the Reader's IMDb
  source reads crisp/short instead of the long plot.
- **Books gaps** — some Polish titles still lack summary / tags / cover.

## Badges / curation
- **Worldbuilding** — only the confirmed set applied; ~rest of the 31 candidates unpruned.
- **Visuals re-curation** — kept visuals/style/cinematography strict & mostly skipped the
  wide heuristic list; could do a careful standouts-only pass.
- **funny_taxonomy.md** — satire/absurdist/bittersweet/drop-funny applied; visuals/
  cinematography shortlist only partly confirmed.

## Features (bigger)
- **Explorer/Taste polish** — optional: faint total line on the growth chart; the
  "Signature tags" insight section; chord/bubble visualisation (stretch from
  `taste_profile_plan.md`).
- **Outward Discovery** — a 3rd top tab (Library / Wishlist / Discover) from TMDB
  recommendations/similar, minus dupes → a review file. Deferred until enrichment + manual
  filtering settle.
- **Last.fm music variation** — separate site variation (top albums by lifetime playtime,
  ~12–15 macro-genre rows). Wants its own design pass; you're keen eventually.

## Resilience / housekeeping
- **Self-host React/Babel/d3** instead of CDN, for offline/longevity (images can stay
  hotlinked — TMDb CDN is fine).
- **Wikidata structured awards** — optional richer awards (real per-award lists) vs the
  current parsed-sentence chips.
- **Directory cleanup** — old audit (dead files, fragmented CSS) never executed.
- **Fluid-distort WebGL effect** — parked (script commented out, file kept).
