# Cover-colour sort & adjacent palette features (parked for later)

Idea: a **"Color" sort** in cover mode that arranges covers into a gradient-like stack
by their dominant colour. Plus a family of adjacent palette features it unlocks.

## Feasibility

- **Sort plumbing = trivial.** `sortItems(list, sort, sortDir)` (culture-v2.jsx ~line 1066)
  is an if/else chain on a `sort` key. Add `else if (sort === 'color') list.sort(byHue)`
  + one entry in the sort menu. Cover mode uses `centerOrder` (centred rank-0); a gradient
  wants a **linear** left→right sweep, so color-sort should bypass `centerOrder` like spines
  mode does (one-line branch).
- **The real work = a colour per cover.** Two paths:
  - **A. Precompute overlay (recommended).** `update_cover_colors.py` reads each poster
    (URLs already in `cast_data`/`omdb`), extracts a dominant colour (PIL + median-cut /
    `colorthief`, ignoring near-black/white borders), writes `{id: "#rrggbb"}` to a
    `cover_colors.js` overlay merged at runtime; slot into `build_all.py`. Zero runtime
    cost, no CORS issues, robust. Enables the whole-library features below. ~half a day.
  - **B. Runtime canvas (the "on-demand" version).** On entering color-sort, load each
    visible cover `crossOrigin="anonymous"`, draw to a tiny offscreen canvas, sample
    dominant colour, cache by URL. Cover mode shows only ~169 favourites so it's cheap —
    **but CORS**: `image.tmdb.org` sends the headers; OMDb/`m.media-amazon.com` generally
    don't → those canvases taint and `getImageData` throws. Flakier, needs fallback.
- **Posterless items already have a colour**: `spineBodyColor(item)` (region/decade) is the
  natural fallback, so nothing is ever uncoloured.
- **Gradient quality**: raw HSL **hue** sort bands badly when lightness varies. Sort in
  perceptual **CIELAB**, or a greedy nearest-neighbour "colour walk" (O(n²), fine for ~169),
  for a visibly smoother sweep — the difference between "rainbow" and "silk".

**Recommendation:** path A (precompute overlay) + Lab/nearest-neighbour comparator +
`spineBodyColor` fallback. Sort still feels instant; only the data is precomputed, and it
unlocks the adjacent features (which need colours library-wide, not just on-screen).

## Adjacent features (value:effort)

1. **Tonal sort** (trivial) — order by lightness (noir→bright) or saturation (muted→vivid).
2. **Library colour-wheel stat** (moderate, high wow) — polar histogram of cover hues in the
   Stats section: "what my taste looks like."
3. **Ambient cover tint** (easy) — tint the Reader backdrop / spine band with the item's
   actual cover colour instead of region-derived `spineBodyColor`.
4. **Colour filter in the palette explorer** (moderate) — pick a swatch → covers within a hue
   range ("my blue films"); drops into `TagBadgeExplorer`.
5. **Palette-over-time strip** (moderate) — average cover colour per year/decade → a timeline
   colour band showing how the library's palette drifts.

## MVP if/when picked up
`update_cover_colors.py` + `cover_colors.js` overlay + "Color" sort option (Lab
nearest-neighbour) with `spineBodyColor` fallback, wired into `build_all.py`. The
colour-wheel stat and ambient tint then become small follow-ons.
