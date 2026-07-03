# Culture — backlog / roadmap (as of v=83)

Open threads and future work. See `CLAUDE.md` for architecture, `docs/` for the pipeline
+ scripts, and the thematic docs (`badge_proposal.md`, `funny_taxonomy.md`,
`color_sort_ideas.md`, `taste_profile_plan.md`) for deep dives.

## Open badge-taxonomy decisions (NOT yet applied — need Fuad's call)

**Split `gem` into two axes.** 💎 currently means "Hidden gem — floored me", which conflates
two things. Plan:
- **New `floored` badge** = the *in-the-moment knockout* (awe at how good/bold it is, the
  "during"). Emoji still UNDECIDED — rejected ⭐/😮/🏆/💫; open candidates 🤩 / 😲 / 😵 / 🎆 / 👏.
- **Relabel 💎 `gem` → "Hidden gem"** (drop "floored me"); then walk the ~36 current gems and
  sort each into *hidden* / *floored* / *both* / *neither*. Famous titles (Fight Club, Se7en,
  The Wire, Black Mirror, …) move off `gem` → `floored`; obscure discoveries stay `gem`.
- Done already: removed `gem` from Memento + Gone Girl (neither).

**The "impact family" model** (agreed in principle, labels pending):
- ⭐ `floored` (up/awe, during) · 💔 `devastating` (grief, during) · 💥 `impact` (lingering,
  after). `devastating` tentatively confirmed as the grief-twin of `floored`.
- **Relabel 💥 `impact`** from "Impactful" to a *lingering* word (e.g. "Stays with you" /
  "Lingers") so it reads as the after-axis. UNDECIDED.
- `bittersweet` 🥲 moved OUT of this family → it's a *tone* (with funny/horrifying/satire).

**Settled (for reference):** `cognitive` 🪞 kept its "A cognitive shift" label; the cluster
is fully curated (~19 seen + wishlist bench). GitS:SAC kept, Antichamber kept, Arrival/
Memento deliberately left as `mindbending`.

## Translations (PL → EN Reader-note redrafts)
- **Status: 260 redrafted, ~723 remaining.** Style: plain register, faithful wording, keep
  emoticons. Workflow: `python list_untranslated.py 50` → review PL/EN pairs → on approval,
  add to `notes_en_source.json` → `python build_notes_en.py` → bump `?v=`.
- Batches so far worked through data.js favourites then imports by rating (currently in the
  8/10 tier).

## Content / data passes
- **OMDb coverage** — many film/TV still un-fetched (older bulk imports). Rerun
  `python update_omdb.py --limit N` over days. Cached "misses" may include false-misses from
  the daily cap — worth a targeted `--force` re-check. (`build_all.py --fetch` chains this.)
- **Poster gap** — ~291 items still show the glyph fallback (niche early-cinema shorts +
  obscure bulk movies TMDB/OMDb don't index). Everything with an OMDb/TMDB poster now renders.
- **Wishlist badge pass** — wishlist items largely un-badged; a knowledge pass would surface
  them in the Explorer. (Enrichment/posters now done via `update_wishlist_enrich.py`.)
- **OMDb short plots** — `PlotShort` backfill for the Reader's crisp IMDb synopsis.
- **Books gaps** — some Polish titles lack summary / tags / cover.
- **Worldbuilding / visuals re-curation** — standouts-only passes still partly unconfirmed
  (see funny_taxonomy.md).

## Features (bigger)
- **Cover-colour sort + palette features** — full proposal parked in `color_sort_ideas.md`
  (gradient stack, colour-wheel stat, ambient tint, colour filter). MVP = precompute overlay.
- **Outward Discovery tab** — Library / Wishlist / Discover, from TMDB recommendations minus
  dupes → review file. Deferred until enrichment settles.
- **Explorer / Taste polish** — faint total line on growth chart; "Signature tags" insight;
  chord/bubble viz (stretch from `taste_profile_plan.md`).
- **Last.fm music variation** — separate site variation (top albums by lifetime playtime).

## Housekeeping / future
- **Script naming pass** — standardize `fetch_*` (external→overlay) / `build_*` (source-json→
  overlay) / `edit_*` (mutates hand-authored files) / `audit_*` (read-only). Update SCRIPTS.md.
- **De-dup the TMDB resolver** — `update_cast.py` + `update_tmdb_overview.py` both resolve the
  same TMDB id per title; could share one resolver/cache.
- **Self-host React/Babel/d3** instead of CDN, for offline/longevity.
- **Wikidata structured awards** — richer per-award lists vs the current parsed-sentence chips.

## Done (recent)
- Directory cleanup: `archive/` for build-time/diagnostic scripts, `docs/`, `CLAUDE.md`.
- `build_all.py` orchestrator with **automatic `?v=` cache-bump** (kills the forgot-to-bump bug).
- `--ids=` filter added to `update_cast.py` and `update_wishlist_enrich.py`.
- OMDb poster wired into the cover/Reader fallback chain (fixed ~1,245 glyph items).
- Mobile Reader fallback + PL↔EN translate-transition reflow fixes.
