// Culture v2 — converged design (iteration 3).
//
// Changes vs prev:
//  · Centered ordering driven by data order (AOS in the centre, then
//    Walkabout/Fight Club symmetrically out, then Ikiru/La Haine, etc.)
//  · Removed favourite red dots; instead, the dot is the *picked* mark
//    and persists for the session for any item the user picks via
//    "Pick one for me".
//  · The rank-0 (centre) item is gently lifted + given a thin accent
//    underline so it reads as the most important pick on the shelf.
//  · Covers mode: shelves are scroll-centred on rank-0. Spines mode:
//    shelves hug the left edge. Mix follows Covers.
//  · Spines now ship with a coloured "binding" (paper-tape head + foot),
//    deterministic by region or decade, plus a single-glyph medium chip
//    at the foot. The colour map lives in data.js so it's easy to tune.
//  · While the popup is open, body scroll is locked so the page can't
//    drift under the hover.
//  · Fan-out z-index now respects distance from the hovered item, so
//    expanded covers in Mix mode no longer hide behind their neighbours.

const cssCulture = `
:root {
  color-scheme: light dark;
  --bg: #14110d;
  --bg-2: #1c1813;
  --ink: #f3eee0;
  --ink-soft: #a89e87;
  --ink-faint: #6a6052;
  --rule: #2e2a23;
  --accent: #e96846;
  --paper: #f6f3ec;
  --paper-ink: #181410;
  --paper-rule: #cdc6b9;
  --serif: 'Source Serif 4', 'Source Serif Pro', Georgia, serif;
  --sans: 'Inter', -apple-system, system-ui, sans-serif;
  --mono: 'JetBrains Mono', ui-monospace, Menlo, monospace;
}

html, body { background: var(--bg); color: var(--ink); }
body { margin: 0; font-family: var(--sans); -webkit-font-smoothing: antialiased; }
* { box-sizing: border-box; }

.page { min-height: 100vh; padding: 0 0 96px; position: relative; overflow-x: hidden; }

/* ───── HEADER ───── */
.site-head {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 32px;
  align-items: end;
  padding: 56px 56px 22px;
  border-bottom: 1px solid var(--rule);
}
.site-head h1 {
  font-family: var(--serif);
  font-style: italic;
  font-weight: 400;
  font-size: clamp(48px, 7vw, 96px);
  letter-spacing: -0.025em;
  line-height: 0.95;
  margin: 0;
}
.site-head h1 .dot { font-style: normal; color: var(--accent); }
.site-head .meta {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-soft);
  margin-top: 14px;
}
.site-head .meta b { color: var(--ink); font-weight: 600; }
.site-head .meta .sep {
  display: inline-block;
  width: 16px; height: 1px;
  background: currentColor;
  vertical-align: middle;
  margin: 0 12px;
  opacity: .6;
}
.site-head .right { display: flex; flex-direction: column; align-items: flex-end; gap: 14px; }
.site-head .tagline {
  font-family: var(--serif);
  font-style: italic;
  font-size: 16px;
  color: var(--ink-soft);
  text-align: right;
  line-height: 1.45;
  max-width: 320px;
}
.btn-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
.btn-pick {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  background: var(--accent);
  color: #fff;
  border: 0;
  padding: 12px 18px;
  border-radius: 999px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  transition: filter .15s, transform .15s;
}
.btn-pick:hover { filter: brightness(1.1); transform: translateY(-1px); }
.btn-pick:active { transform: translateY(0); }
.btn-pick svg { transition: transform .35s; }
.btn-pick:hover svg { transform: rotate(180deg); }

/* mode toggle (segmented) */
.mode-toggle {
  display: inline-flex;
  border: 1px solid var(--rule);
  border-radius: 999px;
  padding: 3px;
  background: rgba(255,255,255,.02);
}
.mode-toggle button {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  background: transparent;
  border: 0;
  color: var(--ink-soft);
  padding: 8px 14px;
  border-radius: 999px;
  cursor: pointer;
  transition: background .15s, color .15s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.mode-toggle button:hover { color: var(--ink); }
.mode-toggle button[data-active="true"] { background: var(--ink); color: var(--bg); }
.mode-toggle button .reroll { transition: transform .4s cubic-bezier(.2,.7,.3,1); }
.mode-toggle button.spinning .reroll { transform: rotate(360deg); }

/* sort dropdown */
.sort-select {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  background-color: rgba(255,255,255,.02);
  color: var(--ink-soft);
  border: 1px solid var(--rule);
  border-radius: 999px;
  padding: 8px 30px 8px 14px;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'%3E%3Cpath d='M2 4l3 3 3-3' stroke='%23a89e87' fill='none' stroke-width='1.3' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  transition: color .15s, border-color .15s;
}
.sort-select:hover { color: var(--ink); border-color: var(--ink-faint); }
.sort-select option { background: var(--bg-2); color: var(--ink); }

/* search bar */
.search-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.search-icon {
  position: absolute;
  left: 13px;
  color: var(--ink-faint);
  pointer-events: none;
  flex-shrink: 0;
}
.search-input {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  background: rgba(255,255,255,.02);
  color: var(--ink);
  border: 1px solid var(--rule);
  border-radius: 999px;
  padding: 8px 30px 8px 32px;
  outline: none;
  width: 264px;
  transition: border-color .15s, color .15s;
}
.search-input::placeholder { color: var(--ink-faint); }
.search-input:focus { border-color: var(--ink-faint); }
.search-clear {
  position: absolute;
  right: 11px;
  background: none;
  border: none;
  color: var(--ink-faint);
  cursor: pointer;
  font-size: 15px;
  line-height: 1;
  padding: 0 2px;
  transition: color .12s;
}
.search-clear:hover { color: var(--ink); }
.search-results-msg {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--ink-soft);
  padding: 0 56px;
  margin-top: 18px;
}
.search-results-msg b { color: var(--ink); }
.search-results-msg button {
  background: none;
  border: none;
  color: var(--accent);
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  cursor: pointer;
  padding: 0;
  margin-left: 8px;
}
.search-results-msg button:hover { color: var(--ink); }
@media (max-width: 768px) {
  .search-input { width: 200px; }
  .search-results-msg { padding: 0 24px; }
}

/* ───── INTRO ───── */
.intro {
  padding: 28px 56px 6px;
  font-family: var(--serif);
  font-style: italic;
  font-size: 18px;
  line-height: 1.45;
  color: var(--ink-soft);
  max-width: 760px;
}
.intro b { color: var(--ink); font-style: normal; font-weight: 600; font-family: var(--sans); }

/* ───── SHELVES ───── */
.shelf { padding: 36px 0 0; position: relative; }
.shelf-head {
  padding: 0 56px 14px;
  display: flex;
  align-items: baseline;
  gap: 16px;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-faint);
}
.shelf-head .num { color: var(--ink-soft); font-variant-numeric: tabular-nums; }
.shelf-head .name { color: var(--ink); font-weight: 600; letter-spacing: 0.12em; }
.shelf-head .ct { color: var(--ink-soft); }
.shelf-head .pos {
  margin-left: auto;
  color: var(--ink-faint);
  font-variant-numeric: tabular-nums;
}

.shelf-rail { position: relative; overflow: visible; }
.shelf-scroll {
  display: flex;
  align-items: center;
  padding: 24px 56px 24px;
  overflow-x: auto;
  overflow-y: visible;
  scrollbar-width: none;
  -ms-overflow-style: none;
  cursor: grab;
  min-height: 220px;
  /* Default left-aligned (used for spines mode) */
  justify-content: flex-start;
}
.shelf-scroll::-webkit-scrollbar { display: none; }
.shelf-scroll.dragging { cursor: grabbing; user-select: none; }
.shelf-scroll.dragging * { pointer-events: none; }

/* sort/filter change — quick, GPU-cheap fade (animates the scroller, not the
   hundreds of items inside it) so large shelves re-order without popping. */
@keyframes sort-fade {
  0%   { opacity: .12; transform: translateY(6px); }
  100% { opacity: 1;   transform: translateY(0); }
}
.shelf.sorting .shelf-scroll { animation: sort-fade .4s cubic-bezier(.2,.7,.3,1); }

.shelf-rail::after,
.shelf-rail::before {
  content: '';
  position: absolute;
  top: 0; bottom: 0;
  width: 56px;
  pointer-events: none;
  z-index: 2;
}
.shelf-rail::before { left: 0;  background: linear-gradient(90deg,  var(--bg) 30%, transparent); }
.shelf-rail::after  { right: 0; background: linear-gradient(270deg, var(--bg) 30%, transparent); }

.shelf-thumb {
  position: absolute;
  bottom: 0;
  left: 56px; right: 56px;
  height: 1px;
  background: var(--rule);
  z-index: 1;
}
.shelf-thumb .bar {
  position: absolute;
  top: 0; bottom: 0;
  background: var(--ink-soft);
  opacity: 0;
  transition: opacity .2s, left .15s, width .15s;
}
.shelf:hover .shelf-thumb .bar { opacity: 1; }

/* ───── ITEM (cover or spine) ───── */
.item {
  position: relative;
  flex: 0 0 auto;
  height: 144px;
  cursor: pointer;
  border-radius: 2px;
  overflow: hidden;
  background: var(--spine-color, #2a2520);
  box-shadow: 0 1px 0 rgba(0,0,0,.4), 0 2px 8px rgba(0,0,0,.35);
  transition: width .55s cubic-bezier(.2,.7,.3,1),
              margin .55s cubic-bezier(.2,.7,.3,1),
              transform .35s cubic-bezier(.2,.7,.3,1),
              box-shadow .25s,
              filter .25s;
  --fan: 30px;
}
.item.as-cover { width: 96px; margin-right: -38px; }
.item.as-spine { width: var(--spine-w, 24px); margin-right: 0; --fan: 12px; }

.layer-img {
  position: absolute;
  inset: 0;
  width: 100%; height: 100%;
  object-fit: cover;
  pointer-events: none;
  user-select: none;
  display: block;
  transition: opacity .4s ease;
}
.as-spine .layer-img { opacity: 0; }

.layer-spine {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  opacity: 0;
  transition: opacity .4s ease;
}
.as-spine .layer-spine { opacity: 1; }

/* paper-tape head + foot bindings */
.spine-band {
  position: absolute;
  left: 0; right: 0;
  height: 18px;
  background: var(--spine-band, rgba(0,0,0,.32));
  pointer-events: none;
}
.spine-band.top    { top: 0;    box-shadow: inset 0 -1px 0 rgba(0,0,0,.18); }
.spine-band.bottom { bottom: 0; box-shadow: inset 0  1px 0 rgba(0,0,0,.18); }
/* a hairline at the inside edge of each band */
.spine-band.top::after, .spine-band.bottom::after {
  content: '';
  position: absolute;
  left: 6%; right: 6%;
  height: 1px;
  background: rgba(255,255,255,.10);
}
.spine-band.top::after    { bottom: 3px; }
.spine-band.bottom::after { top: 3px; }

.spine-glyph {
  position: absolute;
  bottom: 2px;
  left: 0; right: 0;
  text-align: center;
  font-family: var(--mono);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: rgba(255,255,255,.78);
  pointer-events: none;
  z-index: 2;
}

.spine-label {
  font-family: var(--serif);
  font-style: italic;
  font-weight: 500;
  font-size: 11px;
  line-height: 1;
  color: rgba(255,255,255,.94);
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  text-shadow: 0 1px 1px rgba(0,0,0,.4);
  letter-spacing: 0.02em;
  white-space: nowrap;
  max-height: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 4px 0;
}

/* PICKED state — a small accent dot lives in the corner.
   Visible for covers in both layouts; on spines it sits at the very top. */
.pick-dot {
  position: absolute;
  top: 5px; left: 5px; right: auto;
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 2px rgba(0,0,0,.35);
  z-index: 3;
  opacity: 0;
  transform: scale(.4);
  transition: opacity .25s, transform .35s cubic-bezier(.2,.7,.3,1);
}
.item.picked .pick-dot { opacity: 1; transform: scale(1); }
.as-spine .pick-dot {
  top: 3px;
  left: 50%; right: auto;
  margin-left: -3px; margin-right: 0;
  width: 6px; height: 6px;
  box-shadow: 0 0 0 1.5px rgba(0,0,0,.4);
}

/* CENTRE (rank-0) item — gently lifted with a small accent line below.
   We only show the accent line in COVERS / MIX mode; spine mode is
   left-aligned so the centre concept does not apply. */
.item[data-rank="0"][data-mode="covers"],
.item[data-rank="0"][data-mode="mix"] {
  transform: translateY(-6px);
  box-shadow: 0 1px 0 rgba(0,0,0,.4),
              0 18px 28px -10px rgba(0,0,0,.6),
              0 3px 10px rgba(0,0,0,.45);
}
.item[data-rank="0"][data-mode="covers"]::after,
.item[data-rank="0"][data-mode="mix"]::after {
  content: '';
  position: absolute;
  left: 18%; right: 18%;
  bottom: -10px;
  height: 2px;
  background: var(--accent);
  border-radius: 1px;
  opacity: .9;
}

/* Fan-out states — applied via JS by data-pos */
.item[data-pos="hovered"] {
  transform: translateY(-18px) scale(1.18) !important;
  box-shadow: 0 24px 50px -8px rgba(0,0,0,.7),
              0 4px 12px rgba(0,0,0,.5),
              0 0 0 1px rgba(255,255,255,.06) !important;
}
.item[data-pos="left"]  { transform: translateX(calc(-1 * var(--fan))) !important; }
.item[data-pos="right"] { transform: translateX(var(--fan)) !important; }
/* Just-picked lift — applies to all items for a clear, lasting highlight. */
.item[data-pos="just-picked"] {
  transform: translateY(-20px) scale(1.22) !important;
  box-shadow: 0 0 0 3px var(--accent),
              0 0 0 7px rgba(233,104,70,.25),
              0 28px 56px -8px rgba(0,0,0,.75) !important;
  animation: cover-glow 3s ease-out;
}
@keyframes cover-glow {
  0%   { box-shadow: 0 0 0 4px var(--accent), 0 0 24px 10px rgba(233,104,70,.55), 0 28px 56px -8px rgba(0,0,0,.75); }
  50%  { box-shadow: 0 0 0 3px var(--accent), 0 0 12px 5px rgba(233,104,70,.3),  0 28px 56px -8px rgba(0,0,0,.75); }
  100% { box-shadow: 0 0 0 3px var(--accent), 0 0 0   0   rgba(233,104,70,.0),  0 28px 56px -8px rgba(0,0,0,.75); }
}
.shelf.is-focused .item:not([data-pos="hovered"]) {
  filter: brightness(.5) saturate(.85);
}
/* While a "Pick one for me" result is highlighted, dim the rest of its row
   so the chosen item is the only thing lit. Clears with justPickedId. */
.shelf.is-picking .item:not([data-pos="just-picked"]) {
  filter: brightness(.4) saturate(.8);
  transition: filter .3s ease;
}

/* Mix-mode re-roll animation */
.item.reshuffling { animation: reshuffle .6s cubic-bezier(.2,.7,.3,1); }
@keyframes reshuffle {
  0%   { transform: scale(.85) rotate(-3deg); opacity: .3; }
  60%  { transform: scale(1.04) rotate(.5deg); opacity: 1; }
  100% { transform: scale(1) rotate(0); opacity: 1; }
}

/* ───── POPUP ───── */
.popup {
  position: fixed;
  top: 0; left: 0;
  width: 280px;
  background: var(--paper);
  color: var(--paper-ink);
  border-radius: 4px;
  padding: 16px 18px 18px;
  box-shadow: 0 24px 60px rgba(0,0,0,.5), 0 0 0 1px rgba(0,0,0,.08);
  z-index: 1000;
  pointer-events: auto;
  transform-origin: bottom center;
  opacity: 0;
  transform: translate(-50%, -100%) translateY(0) scale(.95);
  transition: opacity .18s, transform .22s cubic-bezier(.2,.7,.3,1);
  font-family: var(--sans);
  overflow: hidden;
}
.popup.on {
  opacity: 1;
  transform: translate(-50%, -100%) translateY(-14px) scale(1);
}
.popup.below {
  transform-origin: top center;
  transform: translate(-50%, 0) translateY(0) scale(.95);
}
.popup.below.on {
  transform: translate(-50%, 0) translateY(14px) scale(1);
}
.popup::after {
  content: '';
  position: absolute;
  bottom: -6px; left: 50%;
  transform: translateX(-50%) rotate(45deg);
  width: 12px; height: 12px;
  background: var(--paper);
  z-index: -1;
}
.popup.below::after { bottom: auto; top: -6px; }
/* Invisible hit-area bridging the gap between the item and the popup, so
   moving the cursor up into the popup doesn't trip the close timer. */
.popup-bridge {
  position: absolute;
  left: 0; right: 0;
  bottom: -22px;
  height: 24px;
  background: transparent;
}
.popup.below .popup-bridge { bottom: auto; top: -22px; }
.popup .meta {
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #8a8175;
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 6px;
}
.popup .meta .pip { width: 5px; height: 5px; border-radius: 50%; background: var(--accent); }
.popup .t {
  font-family: var(--serif);
  font-style: italic;
  font-size: 22px;
  line-height: 1.05;
  letter-spacing: -0.01em;
  color: var(--paper-ink);
}
.popup .t {
  overflow-wrap: break-word;
}
.popup .blurb {
  font-family: var(--serif);
  font-style: italic;
  font-size: 13px;
  line-height: 1.42;
  color: #4a443c;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--paper-rule);
  max-height: 8em;
  overflow: hidden;
  overflow-wrap: break-word;
}
.popup .blurb.empty { color: #98908a; font-size: 12px; }
.popup .hint {
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--accent);
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ───── READER MODAL ───── */
.reader-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(8, 6, 4, 0.72);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  z-index: 5000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  opacity: 0;
  transition: opacity .25s;
}
.reader-backdrop.on { opacity: 1; }
.reader {
  width: min(960px, 100%);
  max-height: calc(100vh - 80px);
  background: var(--paper);
  color: var(--paper-ink);
  border-radius: 6px;
  display: grid;
  grid-template-columns: 320px 1fr;
  overflow: hidden;
  box-shadow: 0 30px 80px rgba(0,0,0,.6);
  transform: translateY(20px) scale(.97);
  opacity: 0;
  transition: transform .3s cubic-bezier(.2,.7,.3,1), opacity .25s;
}
.reader-backdrop.on .reader { transform: translateY(0) scale(1); opacity: 1; }
.reader-poster { position: relative; background: #222; }
.reader-poster img { width: 100%; height: 100%; object-fit: cover; display: block; }
.poster-fallback {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 12px; padding: 28px; text-align: center;
  background:
    radial-gradient(120% 80% at 50% 0%, rgba(255,255,255,.10), transparent 60%),
    linear-gradient(160deg, color-mix(in oklab, var(--pf-bg, #2a2520) 82%, #ffffff 8%), var(--pf-bg, #2a2520));
}
.poster-fallback .pf-title {
  font-family: var(--serif); font-style: italic; font-weight: 500;
  font-size: 28px; line-height: 1.12; color: rgba(255,255,255,.94);
  text-shadow: 0 1px 3px rgba(0,0,0,.45); overflow-wrap: break-word;
}
.poster-fallback .pf-meta {
  font-family: var(--mono); font-size: 10px; letter-spacing: .2em;
  text-transform: uppercase; color: rgba(255,255,255,.62);
}
.reader-body {
  padding: 36px 38px 32px;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
}
.reader-close {
  position: absolute;
  top: 12px; right: 12px;
  width: 30px; height: 30px;
  border-radius: 50%;
  border: 1px solid rgba(0,0,0,.15);
  background: rgba(255,255,255,.7);
  backdrop-filter: blur(4px);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--paper-ink);
  z-index: 4;
  transition: background .15s, color .15s;
}
.reader-close:hover { background: var(--paper-ink); color: var(--paper); }
.reader-meta {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #6a6052;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  row-gap: 6px;
  align-items: center;
  margin-bottom: 16px;
}
.reader-meta .sep { width: 18px; height: 1px; background: currentColor; }
.reader-title {
  font-family: var(--serif);
  font-style: italic;
  font-size: 56px;
  font-weight: 400;
  line-height: 0.98;
  letter-spacing: -0.025em;
  margin: 0 0 6px;
  color: var(--paper-ink);
  text-wrap: pretty;
}
.reader-title .dot { font-style: normal; color: var(--accent); }
.reader-where {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #98908a;
  margin-bottom: 22px;
}
.reader-quote {
  font-family: var(--serif);
  font-style: italic;
  font-size: 18px;
  line-height: 1.45;
  color: var(--paper-ink);
  border-left: 2px solid var(--accent);
  padding: 4px 0 4px 18px;
  margin: 0 0 22px;
}
.reader-quote.empty { color: #98908a; font-size: 14px; }
.reader-actions {
  margin-top: auto;
  padding-top: 16px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.reader-btn {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  padding: 11px 16px;
  border: 1px solid var(--paper-ink);
  background: transparent;
  color: var(--paper-ink);
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 2px;
  transition: all .15s;
}
.reader-btn:hover { background: var(--paper-ink); color: var(--paper); }
.reader-btn.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.reader-btn.primary:hover { background: var(--paper-ink); border-color: var(--paper-ink); }
.reader-adjacent {
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid var(--paper-rule);
}
.reader-adjacent .lbl {
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #8a8175;
  margin-bottom: 10px;
}
.reader-adjacent .row { display: flex; gap: 6px; }
.reader-adjacent .row a {
  width: 56px;
  aspect-ratio: 2/3;
  flex-shrink: 0;
  background: #ccc;
  cursor: pointer;
  border-radius: 1px;
  overflow: hidden;
  transition: transform .15s;
  position: relative;
}
.reader-adjacent .row a:hover { transform: translateY(-3px); }
.reader-adjacent .row a img { width:100%; height:100%; object-fit:cover; display:block; }
.reader-adjacent .row a .thumb-fallback {
  width:100%; height:100%; display:flex; align-items:center; justify-content:center;
  font-family: var(--mono); font-size: 12px; font-weight: 600;
  color: rgba(255,255,255,.82); background: var(--pf-bg, #2a2520);
}

/* ───── FOOTER ───── */
.site-foot {
  margin-top: 64px;
  padding: 24px 56px 0;
  border-top: 1px solid var(--rule);
  display: flex;
  justify-content: space-between;
  gap: 24px;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-faint);
  flex-wrap: wrap;
}
.site-foot a { color: var(--accent); text-decoration: none; }
.site-foot a:hover { color: var(--ink); }
.site-foot .links { display: flex; gap: 20px; }

@media (max-width: 768px) {
  .site-head { padding: 32px 24px 18px; grid-template-columns: 1fr; }
  .site-head .right { align-items: flex-start; }
  .site-head .tagline { text-align: left; }
  .intro { padding: 24px 24px 0; font-size: 16px; }
  .shelf-head { padding: 0 24px 12px; }
  .shelf-scroll { padding: 18px 24px 18px; }
  .shelf-rail::before, .shelf-rail::after { width: 24px; }
  .shelf-thumb { left: 24px; right: 24px; }
  .site-foot { padding: 24px 24px 0; }
  .reader { grid-template-columns: 1fr; max-height: calc(100vh - 24px); }
  .reader-poster { aspect-ratio: 2/3; max-height: 320px; }
  .reader-title { font-size: 40px; }
}
`;

// ─────────── helpers ───────────
function hash(str, seed = 0) {
  let h = seed | 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

// Spine body color = region or decade.
function spineBodyColor(item) {
  const { REGION_COLORS, DECADE_COLORS } = window.CULTURE;
  if (item.region && REGION_COLORS[item.region]) return REGION_COLORS[item.region];
  const decade = Math.floor((item.year || 1900) / 10) * 10;
  return DECADE_COLORS[decade] || DECADE_COLORS[1900];
}
// Band color = subtle darker derivative of body color (CSS color-mix).
function spineBandColor() {
  return 'color-mix(in oklab, currentColor 0%, rgba(0,0,0,.32))';
}

function spineWidth(item) {
  // Series thickness scales with the number of seasons released.
  if (item.medium === 'TV' || item.medium === 'Animated Series') {
    if (item.seasons) {
      const s = Math.max(1, item.seasons);
      return Math.max(18, Math.min(46, 18 + (s - 1) * 3));
    }
    if (item.length === 3) return 32;
    if (item.length === 2) return 26;
    if (item.length === 1) return 20;
    return 24;
  }
  if (item.length === 3) return 32;
  if (item.length === 2) return 26;
  if (item.length === 1) return 20;
  if (item.medium === 'Books') return 24;
  return 22;
}

// Centered visual order: [..., 5, 3, 1, 0, 2, 4, 6, ...] given data 0..N.
// The result is what gets rendered left-to-right in covers/mix mode.
function centerOrder(arr) {
  const out = [];
  arr.forEach((item, i) => {
    if (i % 2 === 0) out.push(item);
    else out.unshift(item);
  });
  return out;
}

function externalServiceName(link) {
  if (!link) return 'External';
  if (link.includes('goodreads')) return 'Goodreads';
  if (link.includes('imdb')) return 'IMDb';
  if (link.includes('last.fm')) return 'Last.fm';
  return 'Filmweb';
}

// Medium-aware labels for the "director" field.
function directorLabel(medium) {
  if (medium === 'Books') return 'Author';
  if (medium === 'TV')    return 'Creator';
  return 'Director';
}
function studioLabel(medium) {
  if (medium === 'TV')    return 'Network';
  if (medium === 'Games') return 'Studio';
  return 'Studio';
}

// Region code → display name (popup + sort).
const REGION_NAMES = {
  pl:'Poland', jp:'Japan', kr:'South Korea', us:'United States', uk:'United Kingdom',
  fr:'France', it:'Italy', de:'Germany', su:'Soviet Union', ru:'Russia', au:'Australia',
  ca:'Canada', ie:'Ireland', il:'Israel', se:'Sweden', fi:'Finland', ch:'Switzerland',
  eu:'Europe', other:'Other',
  es:'Spain', nl:'Netherlands', dk:'Denmark', cz:'Czechia', hu:'Hungary', bg:'Bulgaria', hr:'Croatia',
  gr:'Greece', br:'Brazil',
};
function regionName(code) { return REGION_NAMES[code] || null; }

// Sort a list by the chosen key. Stable-ish with title tiebreak.
function sortItems(arr, sort) {
  const byTitle = (a, b) => a.title.localeCompare(b.title);
  const list = [...arr];
  if (sort === 'az')           list.sort(byTitle);
  else if (sort === 'year')    list.sort((a, b) => (b.year || 0) - (a.year || 0) || byTitle(a, b));
  else if (sort === 'rating')  list.sort((a, b) => (parseFloat(b.rating) || -1) - (parseFloat(a.rating) || -1) || byTitle(a, b));
  else if (sort === 'country')  list.sort((a, b) => (regionName(a.region) || '~').localeCompare(regionName(b.region) || '~') || byTitle(a, b));
  else if (sort === 'director') list.sort((a, b) => (a.director || '￿').localeCompare(b.director || '￿') || byTitle(a, b));
  else if (sort === 'studio')   list.sort((a, b) => (a.studio   || '￿').localeCompare(b.studio   || '￿') || byTitle(a, b));
  return list;
}

// ─────────── Shelf row ───────────
function ShelfRow({ medium, items, idx, mode, sort, mixSeed, onOpenItem, justPickedId, pickedSet }) {
  const { MEDIA_SHORT, MEDIA_GLYPH } = window.CULTURE;
  const [hoverIdx, setHoverIdx] = React.useState(-1);
  const [popupPos, setPopupPos] = React.useState(null);
  const [scrollPct, setScrollPct] = React.useState(0);
  const [scrollSpan, setScrollSpan] = React.useState({ thumb: 30, left: 0 });
  const [reshuffling, setReshuffling] = React.useState(false);
  const scrollerRef = React.useRef(null);
  const popupTimer = React.useRef(null);
  const initializedRef = React.useRef(false);

  // Items rendered in display order. In covers/mix we centre-order them so
  // the rank-0 (most-important) data row sits visually in the middle of
  // the shelf with the rest fanning symmetrically outward.
  const ordered = React.useMemo(() => {
    // Covers shows only favorites; spines / mix show the whole library.
    const base = mode === 'covers' ? items.filter(i => i.favorite) : items;
    const arr = base.map((it, i) => ({ ...it, _rank: i }));
    if (sort && sort !== 'curated') {
      // Explicit sort → linear, left-aligned, no centre piece.
      return sortItems(arr, sort).map(it => ({ ...it, _rank: -1 }));
    }
    return mode === 'spines' ? arr : centerOrder(arr);
  }, [items, mode, sort]);

  // For mix mode, decide cover vs spine deterministically per (id, seed).
  // The rank-0 item is always shown as a cover so the centre piece reads.
  const isSpineFor = React.useCallback((item) => {
    if (mode === 'spines') return true;
    if (!item.favorite) return true;        // imports never expand into covers
    if (mode === 'covers') return false;
    if (item._rank === 0) return false;
    return (hash(item.id, mixSeed) % 3) !== 0;
  }, [mode, mixSeed]);

  // ── Drag-scroll w/ click suppression ──
  const dragRef = React.useRef({ down: false, x: 0, sl: 0, moved: false });
  const DRAG_THRESHOLD = 5;
  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    dragRef.current = {
      down: true,
      x: e.clientX,
      sl: scrollerRef.current.scrollLeft,
      moved: false,
    };
  };
  const onMouseMove = (e) => {
    if (!dragRef.current.down) return;
    const dx = e.clientX - dragRef.current.x;
    if (!dragRef.current.moved && Math.abs(dx) > DRAG_THRESHOLD) {
      dragRef.current.moved = true;
      scrollerRef.current.classList.add('dragging');
      setHoverIdx(-1); setPopupPos(null);
    }
    if (dragRef.current.moved) {
      scrollerRef.current.scrollLeft = dragRef.current.sl - dx;
    }
  };
  const onMouseUpOrLeave = () => {
    if (dragRef.current.down) {
      scrollerRef.current?.classList.remove('dragging');
      const wasMoved = dragRef.current.moved;
      dragRef.current.down = false;
      if (wasMoved) setTimeout(() => { dragRef.current.moved = false; }, 0);
      else          dragRef.current.moved = false;
    }
  };
  React.useEffect(() => {
    window.addEventListener('mouseup', onMouseUpOrLeave);
    return () => window.removeEventListener('mouseup', onMouseUpOrLeave);
  }, []);

  // ── Scroll bookkeeping ──
  const recomputeScroll = React.useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const pct = max <= 0 ? 0 : el.scrollLeft / max;
    setScrollPct(pct);
    const visible = el.clientWidth / el.scrollWidth;
    const thumb = Math.max(8, visible * 100);
    setScrollSpan({ thumb, left: pct * (100 - thumb) });
  }, []);
  React.useEffect(() => {
    recomputeScroll();
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener('scroll', recomputeScroll);
    window.addEventListener('resize', recomputeScroll);
    return () => {
      el.removeEventListener('scroll', recomputeScroll);
      window.removeEventListener('resize', recomputeScroll);
    };
  }, [recomputeScroll]);

  // Scroll to rank-0 (covers/mix) — spine mode stays left-aligned.
  const centerOnRankZero = React.useCallback((smooth = true) => {
    const el = scrollerRef.current;
    if (!el) return;
    if (mode === 'spines') {
      el.scrollTo({ left: 0, behavior: smooth ? 'smooth' : 'auto' });
      return;
    }
    const target = el.querySelector('[data-rank="0"]');
    if (!target) return;
    const elRect = el.getBoundingClientRect();
    const tRect = target.getBoundingClientRect();
    const offset = (tRect.left + tRect.width / 2) - (elRect.left + elRect.width / 2);
    el.scrollTo({ left: el.scrollLeft + offset, behavior: smooth ? 'smooth' : 'auto' });
  }, [mode]);

  React.useLayoutEffect(() => {
    if (initializedRef.current) return;
    centerOnRankZero(false);
    initializedRef.current = true;
  }, [centerOnRankZero]);

  React.useEffect(() => {
    if (!initializedRef.current) return;
    const t = setTimeout(() => centerOnRankZero(true), 80);
    return () => clearTimeout(t);
  }, [mode, mixSeed, centerOnRankZero]);

  // Reshuffle pop on mix re-roll
  React.useEffect(() => {
    if (mode !== 'mix' || !initializedRef.current) return;
    setReshuffling(true);
    const t = setTimeout(() => setReshuffling(false), 700);
    return () => clearTimeout(t);
  }, [mixSeed, mode]);

  // Scroll just-picked item into row view
  React.useEffect(() => {
    if (!justPickedId) return;
    const el = scrollerRef.current;
    if (!el) return;
    if (!items.find(i => i.id === justPickedId)) return;
    const target = el.querySelector(`[data-item-id="${justPickedId}"]`);
    if (!target) return;
    const elRect = el.getBoundingClientRect();
    const tRect = target.getBoundingClientRect();
    const offset = (tRect.left + tRect.width / 2) - (elRect.left + elRect.width / 2);
    el.scrollTo({ left: el.scrollLeft + offset, behavior: 'smooth' });
  }, [justPickedId, items]);

  // Subtle fade when the active sort changes; cheap because it animates the
  // scroller container, not each of the (potentially hundreds of) spines.
  const [sorting, setSorting] = React.useState(false);
  const prevSort = React.useRef(sort);
  React.useEffect(() => {
    if (prevSort.current === sort) return;
    prevSort.current = sort;
    setSorting(true);
    const el = scrollerRef.current;
    if (el) { if (sort === 'curated') centerOnRankZero(false); else el.scrollTo({ left: 0 }); }
    const t = setTimeout(() => setSorting(false), 420);
    return () => clearTimeout(t);
  }, [sort, centerOnRankZero]);

  const handleEnter = (i, el) => {
    if (dragRef.current.down) return;
    setHoverIdx(i);
    if (popupTimer.current) clearTimeout(popupTimer.current);
    const r = el.getBoundingClientRect();
    setPopupPos({ x: r.left + r.width / 2, y: r.top });
  };
  const handleLeave = () => {
    if (popupTimer.current) clearTimeout(popupTimer.current);
    popupTimer.current = setTimeout(() => {
      setHoverIdx(-1);
      setPopupPos(null);
    }, 140);
  };
  // Cancel a pending close — used when the cursor enters the popup itself so
  // the popup stays open until the cursor leaves the popup.
  const cancelClose = () => {
    if (popupTimer.current) clearTimeout(popupTimer.current);
  };
  const handleClick = (item) => {
    if (dragRef.current.moved) return;
    setHoverIdx(-1);
    setPopupPos(null);
    onOpenItem(item);
  };
  // Middle mouse button → jump straight to the item's external page.
  const handleAuxClick = (e, item) => {
    if (e.button === 1) {
      e.preventDefault();
      setHoverIdx(-1);
      setPopupPos(null);
      if (item.link) window.open(item.link, '_blank', 'noopener,noreferrer');
    }
  };

  const hovered = hoverIdx >= 0 ? ordered[hoverIdx] : null;

  // True while a freshly-picked item in THIS row is highlighted (and nothing
  // is hovered). Drives the row-dim so only the pick stays lit for a beat.
  const isPicking = !!justPickedId && hoverIdx < 0 && items.some(i => i.id === justPickedId);

  return (
    <section className={`shelf${hoverIdx >= 0 ? ' is-focused' : ''}${isPicking ? ' is-picking' : ''}${sorting ? ' sorting' : ''}`}>
      <div className="shelf-head">
        <span className="num">{String(idx + 1).padStart(2, '0')}</span>
        <span className="name">{medium}</span>
        <span className="ct">— {items.length} entries</span>
        <span className="pos">{Math.round(scrollPct * 100).toString().padStart(2,'0')}%</span>
      </div>
      <div className="shelf-rail">
        <div
          className="shelf-scroll"
          ref={scrollerRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseLeave={() => { onMouseUpOrLeave(); handleLeave(); }}
          onWheel={(e) => {
            const el = scrollerRef.current;
            if (!el) return;
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && e.deltaY !== 0) {
              el.scrollLeft += e.deltaY;
              e.preventDefault();
            }
          }}
        >
          {ordered.map((item, i) => {
            const isSpine = isSpineFor(item);
            let pos = 'idle';
            if (i === hoverIdx) pos = 'hovered';
            else if (hoverIdx >= 0 && i < hoverIdx) pos = 'left';
            else if (hoverIdx >= 0 && i > hoverIdx) pos = 'right';
            if (item.id === justPickedId && hoverIdx < 0) pos = 'just-picked';

            // Z-index: hovered on top of everything, then siblings fade by
            // distance, so a fanned-right cover never paints behind its
            // right neighbour. Default = ordered index so later-in-DOM
            // covers overlap earlier ones as usual.
            let zIndex;
            if (pos === 'hovered')     zIndex = 200;
            else if (pos === 'just-picked') zIndex = 150;
            else if (hoverIdx >= 0)    zIndex = Math.max(1, 60 - Math.abs(i - hoverIdx));
            else                       zIndex = i + 1;

            const bodyColor = spineBodyColor(item);
            const isPicked = pickedSet.has(item.id);

            return (
              <div
                key={item.id}
                data-item-id={item.id}
                data-rank={item._rank}
                data-mode={mode}
                className={`item ${isSpine ? 'as-spine' : 'as-cover'}${isPicked ? ' picked' : ''}${reshuffling ? ' reshuffling' : ''}`}
                data-pos={pos}
                style={{
                  '--spine-color': bodyColor,
                  '--spine-w': spineWidth(item) + 'px',
                  zIndex,
                  animationDelay: reshuffling ? (Math.random() * 0.18).toFixed(2) + 's' : undefined,
                }}
                onMouseEnter={(e) => handleEnter(i, e.currentTarget)}
                onMouseLeave={handleLeave}
                onClick={() => handleClick(item)}
                onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
                onAuxClick={(e) => handleAuxClick(e, item)}
                title={item.title}
              >
                <img className="layer-img" src={item.poster} alt={item.title} loading="lazy"/>
                <div className="layer-spine">
                  <span className="spine-band top"/>
                  <span className="spine-label">{item.title}</span>
                  <span className="spine-band bottom"/>
                  {item.rating
                    ? <span className="spine-glyph spine-rating">{item.rating}</span>
                    : null}
                </div>
                <span className="pick-dot"/>
              </div>
            );
          })}
        </div>
        <div className="shelf-thumb">
          <div className="bar" style={{ left: scrollSpan.left + '%', width: scrollSpan.thumb + '%' }}/>
        </div>
      </div>
      {hovered && popupPos && (
        <Popup
          item={hovered}
          x={popupPos.x}
          y={popupPos.y}
          onMouseEnter={cancelClose}
          onMouseLeave={handleLeave}
        />
      )}
    </section>
  );
}

// ─────────── Popup (hover) ───────────
function Popup({ item, x, y, onMouseEnter, onMouseLeave }) {
  const { MEDIA_SHORT } = window.CULTURE;
  const adjX = Math.min(Math.max(x, 160), window.innerWidth - 160);
  const flipBelow = y < 220;
  const service = externalServiceName(item.link);
  return (
    <div
      className={`popup on${flipBelow ? ' below' : ''}`}
      style={{ left: adjX, top: flipBelow ? y + 160 : y }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <span className="popup-bridge"/>
      <div className="meta">
        <span>{MEDIA_SHORT[item.medium]}</span>
        <span>·</span>
        <span>{item.year}</span>
        {item.rating ? <span>·</span> : null}
        {item.rating ? <span>★ {item.rating}/10</span> : null}
        {regionName(item.region) ? <span>·</span> : null}
        {regionName(item.region) ? <span>{regionName(item.region)}</span> : null}
        {item.seasons ? <span>·</span> : null}
        {item.seasons ? <span>{item.seasons} {item.seasons > 1 ? 'seasons' : 'season'}</span> : null}
      </div>
      {(item.director || item.studio) && (
        <div className="meta" style={{ marginTop: 3 }}>
          {item.director && <span>{directorLabel(item.medium)}: {item.director}</span>}
          {item.director && item.studio && <span>·</span>}
          {item.studio && <span>{item.studio}</span>}
        </div>
      )}
      <div className="t">{item.title}</div>
      {item.note
        ? <div className="blurb">{item.note}</div>
        : <div className="blurb empty">No note yet — add one in <code style={{ fontFamily:'var(--mono)', fontSize:11, background:'#eee5d3', padding:'1px 4px' }}>data.js</code>.</div>}
      <div className="hint">Click to open ↗ · middle-click → {service}</div>
    </div>
  );
}

// ─────────── Reader Modal ───────────
function Reader({ item, onClose, onJump }) {
  const { ITEMS, MEDIA_SHORT, MEDIA_GLYPH } = window.CULTURE;
  const [on, setOn] = React.useState(false);
  React.useEffect(() => {
    requestAnimationFrame(() => setOn(true));
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const adjacent = React.useMemo(() => {
    return ITEMS
      .filter(i => i.medium === item.medium && i.id !== item.id)
      .sort((a, b) => Math.abs((a.year || 0) - (item.year || 0)) - Math.abs((b.year || 0) - (item.year || 0)))
      .slice(0, 10);
  }, [item]);

  const inMedium = ITEMS.filter(i => i.medium === item.medium);
  const posInMedium = inMedium.findIndex(i => i.id === item.id) + 1;
  const close = () => { setOn(false); setTimeout(onClose, 240); };

  return (
    <div className={`reader-backdrop${on ? ' on' : ''}`} onClick={close}>
      <div className="reader" onClick={(e) => e.stopPropagation()}>
        <button className="reader-close" onClick={close} title="Close (Esc)">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeLinecap="round"/>
          </svg>
        </button>
        <div className="reader-poster">
          {item.poster
            ? <img src={item.poster} alt={item.title}/>
            : <div className="poster-fallback" style={{ '--pf-bg': spineBodyColor(item) }}>
                <span className="pf-title">{item.title}</span>
                <span className="pf-meta">{MEDIA_SHORT[item.medium]} · {item.year}</span>
              </div>}
        </div>
        <div className="reader-body">
          <div className="reader-meta">
            <span>{MEDIA_SHORT[item.medium]}</span>
            <span className="sep"/>
            <span>{item.year}</span>
            {regionName(item.region) ? <React.Fragment><span className="sep"/><span>{regionName(item.region)}</span></React.Fragment> : null}
            {item.seasons ? <React.Fragment><span className="sep"/><span>{item.seasons} {item.seasons > 1 ? 'seasons' : 'season'}</span></React.Fragment> : null}
            {item.rating ? <React.Fragment><span className="sep"/><span>★ {item.rating}/10</span></React.Fragment> : null}
            {item.director ? <React.Fragment><span className="sep"/><span>{directorLabel(item.medium)}: {item.director}</span></React.Fragment> : null}
            {item.studio   ? <React.Fragment><span className="sep"/><span>{studioLabel(item.medium)}: {item.studio}</span></React.Fragment> : null}
            <span className="sep"/>
            <span>№ {String(posInMedium).padStart(3,'0')} of {String(inMedium.length).padStart(3,'0')}</span>
          </div>
          <h2 className="reader-title">{item.title}<span className="dot">.</span></h2>
          <div className="reader-where">Fuad's library &nbsp;/&nbsp; {item.medium}</div>
          {item.note
            ? <blockquote className="reader-quote">{item.note}</blockquote>
            : <blockquote className="reader-quote empty">{item.favorite ? 'A note for this one is on the to-write list.' : 'From the wider library — no personal note yet.'}</blockquote>}
          <div className="reader-adjacent">
            <div className="lbl">Nearby on the same shelf</div>
            <div className="row">
              {adjacent.map(a => (
                <a key={a.id} onClick={() => onJump(a)} title={`${a.title} (${a.year})`}>
                  {a.poster
                    ? <img src={a.poster} alt=""/>
                    : <span className="thumb-fallback" style={{ '--pf-bg': spineBodyColor(a) }}>{MEDIA_GLYPH[a.medium]}</span>}
                </a>
              ))}
            </div>
          </div>
          <div className="reader-actions">
            <a className="reader-btn primary" href={item.link} target="_blank" rel="noopener noreferrer">
              Open on {externalServiceName(item.link)}
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                <path d="M3 3h6v6M3 9l6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
            <button className="reader-btn" onClick={close}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────── App ───────────
function App() {
  const { MEDIA, PICKABLE_IDS } = window.CULTURE;
  const ITEMS = React.useMemo(() => {
    const seasons  = window.CULTURE_SEASONS || {};
    const creators = window.CULTURE.CREATORS || {};
    const favs = window.CULTURE.ITEMS.map(i => {
      let m = i;
      if (seasons[i.id] && !i.seasons)  m = { ...m, seasons: seasons[i.id] };
      if (creators[i.id])               m = { ...m, ...creators[i.id] };
      return m;
    });
    const imports = (window.CULTURE_IMPORTS || []).map(i =>
      creators[i.id] ? { ...i, ...creators[i.id] } : i
    );
    const filmImports = (window.CULTURE_FILM_IMPORTS || []).map(i =>
      creators[i.id] ? { ...i, ...creators[i.id] } : i
    );
    return favs.concat(imports).concat(filmImports);
  }, []);
  const [openItem, setOpenItem] = React.useState(null);
  const [justPickedId, setJustPickedId] = React.useState(null);
  const [pickedSet, setPickedSet] = React.useState(() => new Set());
  const [mode, setMode] = React.useState('covers');
  const [sort, setSort] = React.useState('curated');
  const [mixSeed, setMixSeed] = React.useState(1);
  const [spinning, setSpinning] = React.useState(false);
  const [search, setSearch] = React.useState('');

  // Scroll lock for the Reader modal. (Popup lock is owned by Popup itself.)
  React.useEffect(() => {
    if (!openItem) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [openItem]);

  // Clear the transient "just-picked" pose after a beat so the cover settles
  // back into the row. The persistent red dot is owned by `pickedSet`.
  React.useEffect(() => {
    if (!justPickedId) return;
    const t = setTimeout(() => setJustPickedId(null), 5000);
    return () => clearTimeout(t);
  }, [justPickedId]);

  const shelves = MEDIA.map(m => ({ medium: m, items: ITEMS.filter(i => i.medium === m) }));

  const filteredShelves = React.useMemo(() => {
    if (!search.trim()) return shelves;
    const q = search.trim().toLowerCase();
    return shelves
      .map(s => ({
        ...s,
        items: s.items.filter(it =>
          it.title.toLowerCase().includes(q) ||
          (it.director && it.director.toLowerCase().includes(q)) ||
          (it.studio   && it.studio.toLowerCase().includes(q))
        ),
      }))
      .filter(s => s.items.length > 0);
  }, [shelves, search]);

  const totalSearchResults = React.useMemo(
    () => filteredShelves.reduce((n, s) => n + s.items.length, 0),
    [filteredShelves]
  );

  // Pool for Pick One — anything in PICKABLE_IDS that exists, or items with notes as fallback.
  const pickPool = React.useMemo(() => {
    const ids = new Set(PICKABLE_IDS);
    const fromIds = ITEMS.filter(it => ids.has(it.id));
    if (fromIds.length > 1) return fromIds;
    return ITEMS.filter(it => it.note);
  }, []);

  const pickOne = () => {
    if (!pickPool.length) return;
    let pick = pickPool[Math.floor(Math.random() * pickPool.length)];
    if (pick.id === justPickedId && pickPool.length > 1) {
      pick = pickPool[(pickPool.indexOf(pick) + 1) % pickPool.length];
    }
    setJustPickedId(pick.id);
    setPickedSet(prev => {
      const next = new Set(prev);
      next.add(pick.id);
      return next;
    });
    // Also nudge the page vertically to the right shelf
    setTimeout(() => {
      const shelf = document.querySelector(`[data-item-id="${pick.id}"]`)?.closest('.shelf');
      if (shelf) {
        const r = shelf.getBoundingClientRect();
        const top = window.scrollY + r.top - 120;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    }, 80);
  };

  const setModeAndAnimate = (m) => {
    if (m === 'mix') {
      setMixSeed(s => s + 1);
      setSpinning(true);
      setTimeout(() => setSpinning(false), 420);
    }
    setMode(m);
  };

  return (
    <div className="page">
      <style dangerouslySetInnerHTML={{ __html: cssCulture }} />

      <header className="site-head">
        <div>
          <h1>Culture<span className="dot">.</span></h1>
          <div className="meta">
            A library of what shaped me
            <span className="sep"/>
            <b>{ITEMS.length}</b>&nbsp;entries
            <span className="sep"/>
            <b>{MEDIA.length}</b>&nbsp;shelves
            <span className="sep"/>
            best in the middle, outward by rank
          </div>
        </div>
        <div className="right">
          <div className="tagline">
            Things I watched, read, played, and could not stop thinking about afterward.
          </div>
          <div className="btn-row">
            <div className="mode-toggle">
              <button data-active={mode === 'covers'} onClick={() => setModeAndAnimate('covers')}>Covers</button>
              <button data-active={mode === 'spines'} onClick={() => setModeAndAnimate('spines')}>Spines</button>
              <button
                data-active={mode === 'mix'}
                className={spinning ? 'spinning' : ''}
                onClick={() => setModeAndAnimate('mix')}
                title={mode === 'mix' ? 'Re-roll the mix' : 'Mix covers & spines'}
              >
                Mix
                <svg className="reroll" width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <path d="M2 8a6 6 0 0 1 10.5-4M14 8a6 6 0 0 1-10.5 4" stroke="currentColor" strokeLinecap="round"/>
                  <path d="M11 2v3h3M5 14v-3H2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
            <select className="sort-select" value={sort} onChange={(e) => setSort(e.target.value)} title="Sort titles">
              <option value="curated">Curated</option>
              <option value="az">A–Z</option>
              <option value="year">Release date</option>
              <option value="director">Director / Creator</option>
              <option value="studio">Studio / Network</option>
              <option value="country">Country</option>
              <option value="rating">Rating</option>
            </select>
            <button className="btn-pick" onClick={pickOne}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="1" width="9" height="9" rx="1.5" stroke="currentColor"/>
                <rect x="6" y="6" width="9" height="9" rx="1.5" stroke="currentColor"/>
                <circle cx="3.5" cy="3.5" r="1" fill="currentColor"/>
                <circle cx="8.5" cy="8.5" r="1" fill="currentColor"/>
                <circle cx="12.5" cy="12.5" r="1" fill="currentColor"/>
              </svg>
              Pick one for me
            </button>
          </div>
          <div className="search-wrap">
            <svg className="search-icon" width="12" height="12" viewBox="0 0 16 16" fill="none">
              <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M10 10l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <input
              className="search-input"
              type="text"
              placeholder="Search title, director, studio…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="search-clear" onClick={() => setSearch('')} title="Clear search">×</button>
            )}
          </div>
        </div>
      </header>

      <div className="intro">
        Hover any item to fan a cover open and read its note. Click to open the full entry,
        drag the row sideways to browse the rest. Each shelf is curated <b>best-in-the-middle</b>
        — most-loved at the centre, descending outwards. The <b>Pick one for me</b> button taps
        a hand-picked pool; flipped items keep a small red mark.
      </div>

      {search.trim() && (
        <div className="search-results-msg">
          <b>{totalSearchResults}</b> result{totalSearchResults !== 1 ? 's' : ''} for &ldquo;{search.trim()}&rdquo;
          <button onClick={() => setSearch('')}>clear</button>
        </div>
      )}

      {filteredShelves.map((s, i) => (
        <ShelfRow
          key={s.medium}
          medium={s.medium}
          items={s.items}
          idx={i}
          mode={mode}
          sort={sort}
          mixSeed={mixSeed}
          onOpenItem={setOpenItem}
          justPickedId={justPickedId}
          pickedSet={pickedSet}
        />
      ))}

      {search.trim() && filteredShelves.length === 0 && (
        <div className="search-results-msg" style={{ marginTop: 48 }}>
          No results for &ldquo;{search.trim()}&rdquo;.
          <button onClick={() => setSearch('')}>clear</button>
        </div>
      )}

      <footer className="site-foot">
        <div>fuad.design &nbsp;/&nbsp; Culture &nbsp;/&nbsp; 2026</div>
        <div className="links">
          <a href="https://www.filmweb.pl/user/FuadSoudah" target="_blank" rel="noopener noreferrer">Filmweb</a>
          <a href="https://www.goodreads.com/user/show/88387351-fuad-soudah" target="_blank" rel="noopener noreferrer">Goodreads</a>
          <a href="https://www.last.fm/user/Fuadex" target="_blank" rel="noopener noreferrer">Last.fm</a>
        </div>
      </footer>

      {openItem && (
        <Reader item={openItem} onClose={() => setOpenItem(null)} onJump={(it) => setOpenItem(it)} />
      )}
    </div>
  );
}

window.CultureApp = App;
