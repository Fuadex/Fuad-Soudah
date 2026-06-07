# Taste Profile overhaul — plan

## Why
The current Taste tab (contrarian picks · time-spent · growth · fingerprint) feels
scattered and flat. Meanwhile two of the most powerful signals — the **TMDb subtags**
(`item.tags`) and the **standout badges** (`item.highlights`) — are buried. They're
excellent filters; they should be the centrepiece.

## North star
Turn the Taste tab into a **living portrait + an interactive explorer**: read your
collection back to you, then let you *play* with it by combining badges + subtags.

## Sections (top → bottom)

### 1. Portrait (tighten existing)
One crisp line + a few superlatives: top decade · country · genre · director ·
"you rate ~N above the crowd." Already exists; just compress and restyle.

### 2. ✦ Palette — the badge × subtag explorer (NEW, the headline)
An aggressive, fun filter/map:
- A **badge rail** (all standout badges with counts) + a **subtag cloud** (tags sized
  by frequency; the surprising/rare ones highlighted).
- Click any combination → builds a live query (reuses the existing `highlight:` /
  `tag:` token grammar, AND/OR toggle) → the result renders as a **live cover wall**
  that animates/reflows as you refine, with a running count ("18 titles: 💀 horrifying
  + tag:dystopia").
- Click a cover → opens the Reader. "Apply to library" pushes the query to the shelf.
- Visual options to pick from: sized tag-cloud (simplest, fast), bubble pack, or a
  badge↔tag chord diagram (most "wow", more work). Recommend tag-cloud + cover-wall
  first, chord as a stretch.

### 3. Signature tags (NEW)
Surface subtags you're **over-indexed** on vs a flat baseline — "your fingerprint
tags" (e.g. you watch way more `bleak`, `existentialism`, `one-location` than average).
Turns the messy TMDb tag soup into a few genuine insights. Clickable → feeds the explorer.

### 4. Where your taste diverges (keep, polish)
Contrarian picks vs community — already good, just visual cleanup + sit it under the explorer.

### 5. Time spent + Growth (keep)
Fine as-is; group them into one compact "by the numbers" strip.

## Supporting changes
- **Make subtags first-class**: render `item.tags` as clickable chips in the Reader
  (they exist but are hidden), and add `tag:` to the search hint legend.
- **Badge vocabulary expansion** (ties into "funny is too broad"): subdivide funny
  beyond `bittersweet` 🥲 — candidates: `witty` (sharp/verbal), `absurdist`/`grotesque`,
  `satire`. Decide the set, then re-curate. Same discipline for visuals: keep
  `visuals` (gorgeous) vs `style` (bold/quirky) vs `cinematography` (lenswork) distinct
  and reserved for standouts, not blanket-applied.

## Build order (incremental, each shippable)
1. Restructure the tab into the 5 sections (low risk, immediate "less scattered").
2. Reader subtag chips + search-legend `tag:` (tiny, unlocks the data).
3. Palette explorer v1: tag-cloud + badge rail + live cover-wall (the big win).
4. Signature-tags insight.
5. (Stretch) chord/bubble visualisation; funny/visuals sub-badge re-curation.

## Open questions for you
- Explorer visual: tag-cloud+cover-wall (recommended) vs bubble vs chord?
- AND vs OR default when combining?
- Funny sub-badges: which labels/emoji do you want?
