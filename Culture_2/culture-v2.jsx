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
  if (item.medium === 'TV' || item.medium === 'Animated Series') {
    if (item.totalMinutes) return Math.max(18, Math.min(60, Math.round((Math.log(item.totalMinutes) * 18.7 - 64) / 1.5)));
    if (item.seasons) return Math.max(18, Math.min(60, Math.round((22 + (Math.max(1, item.seasons) - 1) * 4) / 1.5)));
    if (item.length === 3) return 32;
    if (item.length === 2) return 26;
    if (item.length === 1) return 20;
    return 24;
  }
  if (item.medium === 'Games') {
    if (item.playtime) return Math.max(16, Math.min(46, Math.round(16 + item.playtime * 1.4)));
    if (item.length === 3) return 32;
    if (item.length === 2) return 26;
    if (item.length === 1) return 20;
    return 22;
  }
  if (item.medium === 'Books') {
    if (item.pages) return Math.max(18, Math.min(50, Math.round(18 + item.pages / 20)));
    if (item.length === 3) return 32;
    if (item.length === 2) return 26;
    if (item.length === 1) return 20;
    return 24;
  }
  // Movies, Feature Animation, Shorts — runtime in minutes
  // Calibrated so 120min = 26px (same as length=2) and 180min = 32px (same as length=3)
  if (item.runtime) return Math.max(16, Math.min(40, Math.round(14 + item.runtime / 10)));
  if (item.length === 3) return 32;
  if (item.length === 2) return 26;
  if (item.length === 1) return 20;
  if (item.medium === 'Shorts') return 16;
  return 22;
}

function formatRuntime(minutes) {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
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
  hk:'Hong Kong', cn:'China', mx:'Mexico',
  tw:'Taiwan', ar:'Argentina', in:'India', lb:'Lebanon', eg:'Egypt', is:'Iceland', th:'Thailand', nz:'New Zealand',
  sg:'Singapore', ee:'Estonia', uy:'Uruguay', aq:'Antarctica', ge:'Georgia',
};
function regionName(code) { return REGION_NAMES[code] || null; }

// Parse search query: extract @YEAR / y:YEAR (release), in:YEAR (rated), r:N/r:N+/r:N-M (rating).
function parseQuery(raw) {
  const FIELD_MAP = {
    genre: 'genres', g: 'genres',
    actor: 'actors', cast: 'actors',
    director: 'directors', dir: 'directors',
    tag: 'tags',
    studio: 'studios',
    writer: 'writers', author: 'writers',
    dp: 'dps', cin: 'dps',
    region: 'regions', country: 'regions',
    highlight: 'highlights', badge: 'highlights',
    on: 'providers', provider: 'providers', watch: 'providers',
    title: 'title',
  };
  const result = {
    text: '', title: [], releaseYear: [], ratedYear: [], ratingFilter: [],
    genres: [], actors: [], directors: [], tags: [], studios: [],
    writers: [], dps: [], regions: [], highlights: [], providers: [],
  };
  const s = (raw || '').trim();
  if (!s) return result;

  // Find all field:value token starts (multi-word values are supported)
  const fieldRe = new RegExp(`\\b(${Object.keys(FIELD_MAP).join('|')}):`, 'gi');
  const tokens = [];
  let m;
  fieldRe.lastIndex = 0;
  while ((m = fieldRe.exec(s)) !== null) tokens.push({ start: m.index, prefixEnd: m.index + m[0].length, key: m[1].toLowerCase() });

  // Each token's value runs to the next token boundary
  for (let i = 0; i < tokens.length; i++) {
    const { prefixEnd, key } = tokens[i];
    const nextStart = i + 1 < tokens.length ? tokens[i + 1].start : s.length;
    const val = s.slice(prefixEnd, nextStart).trim();
    if (val) result[FIELD_MAP[key]].push(val.toLowerCase());
  }

  // Strip field:value spans from the string, then parse remaining for legacy tokens + plain text
  let rest = s;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const nextStart = i + 1 < tokens.length ? tokens[i + 1].start : s.length;
    rest = rest.slice(0, tokens[i].start) + ' ' + rest.slice(nextStart);
  }
  const parts = rest.trim().split(/\s+/);
  const text = [];
  for (const tok of parts) {
    if (!tok) continue;
    const colonT = tok.match(/^:(.+)$/);   // ":alien" → title-only search
    const atY = tok.match(/^@(\d{4})$/);
    const yY  = tok.match(/^y:(\d{4})$/i);
    const inY = tok.match(/^in:(\d{4})$/i);
    const rEx = tok.match(/^r:(\d+)(?:([+])|[-](\d+))?$/i);
    if      (colonT) result.title.push(colonT[1].toLowerCase());
    else if (atY) result.releaseYear.push(atY[1]);
    else if (yY)  result.releaseYear.push(yY[1]);
    else if (inY) result.ratedYear.push(inY[1]);
    else if (rEx) {
      const lo = parseInt(rEx[1], 10);
      if (rEx[2]) { for (let i = lo; i <= 10; i++) result.ratingFilter.push(String(i)); }
      else if (rEx[3]) { const hi = parseInt(rEx[3], 10); for (let i = lo; i <= hi; i++) result.ratingFilter.push(String(i)); }
      else result.ratingFilter.push(String(lo));
    } else text.push(tok);
  }
  result.text = text.join(' ');
  return result;
}

// ── Stats helpers ──
function getWeekStart(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return monday.toISOString().slice(0, 10);
}

function getWeekOfYear(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
}

function countBy(items, keyFn) {
  const map = {};
  items.forEach(it => {
    const k = keyFn(it);
    if (k != null && k !== '') map[k] = (map[k] || 0) + 1;
  });
  return map;
}

// ISO numeric → region code for world map
const ISO_TO_REGION = {
  840:'us', 826:'uk', 250:'fr', 276:'de', 392:'jp', 616:'pl', 380:'it',
  643:'ru',  // Russia – also displays su items
  410:'kr', 36:'au', 124:'ca', 372:'ie', 376:'il', 752:'se', 246:'fi',
  756:'ch', 724:'es', 528:'nl', 208:'dk', 203:'cz', 348:'hu', 100:'bg',
  191:'hr', 300:'gr', 76:'br',
  344:'hk', 156:'cn', 484:'mx',
  158:'tw', 32:'ar', 356:'in', 422:'lb', 818:'eg', 352:'is', 764:'th', 554:'nz',
  702:'sg', 233:'ee', 858:'uy',
  10:'aq',  // Antarctica — catch-all home for items of unknown origin
};

// Per-medium color hue for the choropleth + heatmap. Keys MUST match the actual
// medium strings (window.CULTURE.MEDIA) — 'Movies'/'Feature Animation', not
// 'Film'/'Animated Film' — or they silently fall back to the default orange.
const MEDIUM_MAP_HUE = {
  'All':'#e96846', 'Movies':'#e96846',
  'TV':'#fbbf24', 'Games':'#f472b6',
  'Animated Series':'#60a5fa', 'Feature Animation':'#c084fc',
  'Books':'#a3e635', 'Shorts':'#2dd4bf',
};

let _topoCache = null;

// ─────────── RatingHistogram ───────────
// Bins items into 1–10 by the chosen `source`:
//   'rating' → personal score (it.rating), 'fwAvg' → Filmweb avg (rounded).
// `onBar(n)` makes columns clickable (personal-rating mode); pass null for a
// display-only chart (Filmweb mode). `activeSet` = highlighted band strings.
// A 1–10 score for `it` from the chosen source (RT% → /10, Metacritic /100 → /10,
// IMDb rounded). Returns null when that source has no value for the item.
function scoreValue(it, source) {
  let v = null;
  if (source === 'rating')          v = it.rating != null ? parseFloat(it.rating) : null;
  else if (source === 'fwAvg')      v = it.fwAvg != null ? it.fwAvg : null;
  else if (source === 'imdb')       { const r = it.omdb && it.omdb.imdbRating; v = (r && r !== 'N/A') ? parseFloat(r) : null; }
  else if (source === 'rt')         { const r = omdbRating(it.omdb, 'Rotten Tomatoes'); v = r ? parseFloat(r) / 10 : null; }
  else if (source === 'metacritic') { const m = it.omdb && it.omdb.Metascore; v = (m && m !== 'N/A') ? parseFloat(m) / 10 : null; }
  return (v == null || isNaN(v)) ? null : Math.max(1, Math.min(10, Math.round(v)));
}

function RatingHistogram({ items, source, activeSet, onBar }) {
  const counts = React.useMemo(() => {
    const m = {};
    items.forEach(it => { const v = scoreValue(it, source); if (v != null) m[String(v)] = (m[String(v)] || 0) + 1; });
    return m;
  }, [items, source]);
  const max = Math.max(1, ...Object.values(counts));
  const SRC = { rating: '★', fwAvg: 'Filmweb ≈ ', imdb: 'IMDb ', rt: '🍅 ≈ ', metacritic: 'Metacritic ≈ ' }[source] || '';
  const clickable = !!onBar;
  return (
    <div className={`rating-hist${clickable ? '' : ' static'}`}>
      {[1,2,3,4,5,6,7,8,9,10].map(n => {
        const s = String(n);
        const c = counts[s] || 0;
        const active = activeSet.has(s);
        return (
          <div key={n} className={`rating-col${active ? ' active' : ''}`}
               onClick={clickable ? () => onBar(n) : undefined}
               title={`${c} ${c === 1 ? 'title' : 'titles'} · ${SRC}${n}`}>
            <div className="rating-cnt">{c || ''}</div>
            <div className="rating-bar" style={{ height: `${Math.max(3, (c/max)*80)}px` }}/>
            <div className="rating-lbl">{n}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────── HBarHistogram (directors / studios / actors / etc.) ───────────
// countFn: optional alternative to keyFn for multi-value fields (e.g. cast arrays).
//   countFn(items) => { [name]: count }
function HBarHistogram({ items, keyFn, countFn, selected, onToggle, limit = 19, labelFn }) {
  const counts = React.useMemo(() => {
    const raw = countFn ? countFn(items) : countBy(items, keyFn);
    return Object.entries(raw)
      .filter(([k]) => k && k !== 'unknown')
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);
  }, [items, keyFn, countFn, limit]);
  const max = counts.length ? counts[0][1] : 1;
  return (
    <div className="hbar-list">
      {counts.map(([name, count]) => {
        const active = selected.has(name);
        const label = labelFn ? labelFn(name) : name;
        return (
          <div key={name} className={`hbar-row${active ? ' active' : ''}`} onClick={() => onToggle(name)} title={label}>
            <div className="hbar-name">{label}</div>
            <div className="hbar-track">
              <div className="hbar-fill" style={{ width: `${(count/max)*100}%` }}/>
            </div>
            <div className="hbar-cnt">{count}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────── ActivityHeatmap ───────────
function ActivityHeatmap({ items, selectedWeeks, onToggleWeek, medium = 'All' }) {
  const [tip, setTip] = React.useState(null);
  const hue = MEDIUM_MAP_HUE[medium] || MEDIUM_MAP_HUE['All'];

  const { grid, years, maxCount } = React.useMemo(() => {
    const g = {};
    items.forEach(it => {
      if (!it.watchedDate) return;
      const y = it.watchedDate.slice(0, 4);
      const w = getWeekOfYear(it.watchedDate);
      if (!g[y]) g[y] = {};
      g[y][w] = (g[y][w] || 0) + 1;
    });
    const yrs = Object.keys(g).sort((a, b) => b - a);
    const mx = Math.max(1, ...yrs.flatMap(y => Object.values(g[y])));
    return { grid: g, years: yrs, maxCount: mx };
  }, [items]);

  const WEEKS = Array.from({ length: 53 }, (_, i) => i + 1);
  const WEEK_LABELS = (() => {
    const labels = Array(53).fill('');
    [1,5,9,13,18,22,26,31,35,40,44,48].forEach((w, i) => {
      labels[w - 1] = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][i];
    });
    return labels;
  })();

  return (
    <div className="heatmap-wrap">
      <div className="heatmap-inner">
        <div className="heatmap-month-row">
          {WEEK_LABELS.map((m, i) => (
            <div key={i} className="heatmap-month-cell">{m}</div>
          ))}
        </div>
        <div className="heatmap-rows">
          {years.map(yr => (
            <div key={yr} className="heatmap-row">
              <div className="heatmap-year-lbl">{yr}</div>
              {WEEKS.map(w => {
                const count = grid[yr]?.[w] || 0;
                const weekKey = `${yr}-W${String(w).padStart(2,'0')}`;
                const sel = selectedWeeks.has(weekKey);
                const alpha = count === 0 ? 0 : 0.12 + (count / maxCount) * 0.88;
                return (
                  <div
                    key={w}
                    className={`heatmap-cell${sel ? ' selected' : ''}`}
                    style={{ background: count ? `color-mix(in srgb, ${hue} ${Math.round(alpha*100)}%, transparent)` : undefined }}
                    title={`${yr} week ${w}: ${count} items`}
                    onMouseEnter={e => setTip({ x: e.clientX, y: e.clientY, text: `${yr} wk ${w} · ${count} item${count!==1?'s':''}` })}
                    onMouseLeave={() => setTip(null)}
                    onClick={() => onToggleWeek(weekKey)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {tip && <div className="heatmap-tooltip" style={{ left: tip.x + 12, top: tip.y + 12 }}>{tip.text}</div>}
    </div>
  );
}

// ─────────── WorldMap ───────────
function WorldMap({ items, selectedCountries, onToggleCountry, medium = 'All' }) {
  const [topo, setTopo] = React.useState(_topoCache);
  const [tip, setTip] = React.useState(null);

  React.useEffect(() => {
    if (_topoCache) return;
    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
      .then(r => r.json()).then(t => { _topoCache = t; setTopo(t); });
  }, []);

  const { regionCounts, maxCount } = React.useMemo(() => {
    const rc = countBy(items, it => it.region);
    // Russia slot also covers su
    if (rc['su'] || rc['ru']) rc['_ru_combined'] = (rc['su'] || 0) + (rc['ru'] || 0);
    const mx = Math.max(1, ...Object.values(rc));
    return { regionCounts: rc, maxCount: mx };
  }, [items]);

  // Flat, clickable country ranking beside the map — guarantees tiny countries
  // (Hong Kong, Singapore…) are reachable even when their map blob is un-clickable.
  const countryList = React.useMemo(() => {
    const rc = { ...regionCounts };
    delete rc['_ru_combined'];
    if (rc['su']) { rc['ru'] = (rc['ru'] || 0) + rc['su']; delete rc['su']; }
    return Object.entries(rc).filter(([k]) => k).sort((a, b) => b[1] - a[1]);
  }, [regionCounts]);

  const hue = MEDIUM_MAP_HUE[medium] || MEDIUM_MAP_HUE['All'];

  if (!topo) return <div style={{ height:300, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--ink-faint)', fontFamily:'var(--mono)', fontSize:11 }}>Loading map…</div>;

  const d3 = window.d3, tj = window.topojson;
  const W = 960, H = 500;
  const projection = d3.geoNaturalEarth1().scale(153).translate([W/2, H/2]);
  const pathGen = d3.geoPath().projection(projection);
  const countries = tj.feature(topo, topo.objects.countries);

  return (
   <div className="world-map-layout">
    <div className="world-map-wrap">
      <svg className="world-map-svg" viewBox={`0 0 ${W} ${H}`}>
        {countries.features.map(f => {
          const isoNum = Number(f.id);
          const region = ISO_TO_REGION[isoNum];
          const count = region === 'ru' || region === 'su'
            ? (regionCounts['_ru_combined'] || 0)
            : (region ? (regionCounts[region] || 0) : 0);
          const alpha = count === 0 ? 0 : 0.1 + (count / maxCount) * 0.9;
          const fill = count > 0
            ? `color-mix(in srgb, ${hue} ${Math.round(alpha*100)}%, #2a2520)`
            : '#221f1b';
          const sel = region && selectedCountries.has(region);
          const d = pathGen(f);
          if (!d) return null;
          return (
            <path
              key={f.id}
              d={d}
              className={`map-path${region ? ' clickable' : ''}${sel ? ' selected' : ''}`}
              fill={fill}
              stroke="#1a1714"
              strokeWidth="0.3"
              onMouseEnter={e => {
                if (!region) return;
                const name = REGION_NAMES[region] || region;
                setTip({ x: e.clientX, y: e.clientY, text: `${name} · ${count} item${count!==1?'s':''}` });
              }}
              onMouseLeave={() => setTip(null)}
              onClick={() => region && onToggleCountry(region)}
            />
          );
        })}
      </svg>
      {tip && <div className="map-tooltip" style={{ left: tip.x + 14, top: tip.y + 14 }}>{tip.text}</div>}
    </div>
    <div className="country-list">
      {countryList.map(([region, count]) => {
        const sel = selectedCountries.has(region);
        return (
          <div key={region} className={`country-row${sel ? ' active' : ''}`} onClick={() => onToggleCountry(region)}>
            <span className="country-name">{REGION_NAMES[region] || regionName(region) || region}</span>
            <span className="country-cnt">{count}</span>
          </div>
        );
      })}
    </div>
   </div>
  );
}

// ─────────── TasteProfile (Stats → "Taste" tab) ───────────
// Interprets the collection rather than just charting it: where your taste
// diverges from the crowd, how much time you've sunk in, your growth over time,
// and a one-line portrait. Pure reuse of existing + OMDb fields.
function communityScore(it, axis) {
  const o = it.omdb;
  if (axis === 'imdb')       { const v = o && o.imdbRating; return v && v !== 'N/A' ? parseFloat(v) : null; }
  if (axis === 'rt')         { const r = omdbRating(o, 'Rotten Tomatoes'); return r ? parseFloat(r) / 10 : null; }
  if (axis === 'metacritic') { const m = o && o.Metascore; return m && m !== 'N/A' ? parseFloat(m) / 10 : null; }
  return it.fwAvg != null ? parseFloat(it.fwAvg) : null;  // Filmweb
}

function formatSpan(minutes) {
  if (!minutes) return '0 h';
  if (minutes >= 1440) return `${(minutes / 1440).toFixed(1)} days`;
  return `${Math.round(minutes / 60)} h`;
}

// Distinctive subtag substrings worth surfacing even when rare — the gems buried
// in TMDb's long tail (structural / conceptual / formal hooks). Matched as substrings.
const NOTABLE_TAGS = ['fourth wall', 'nonlinear', 'unreliable narrator', 'time loop', 'time travel',
  'simulated reality', 'existential', 'surreal', 'absurdis', 'dystopia', 'post-apocalyptic', 'amnesia',
  'anthology', 'no dialogue', 'mockumentary', 'found footage', 'story within', 'flashback', 'rotoscop',
  'stop motion', 'psychedelic', 'rebellion', 'transhuman', 'body horror', 'cosmic horror', 'slow cinema',
  'one location', 'single location', 'real time', 'breaking the', 'metafiction', 'long take', 'one-shot',
  'black and white', 'silent film', 'minimalis', 'philosoph'];

// Palette explorer: combine standout badges + TMDb subtags into a live filter.
// Click a chip's LEFT half = AND, RIGHT half = OR (mobile taps land left → AND).
function TagBadgeExplorer({ items, onOpenItem }) {
  const [sel, setSel] = React.useState([]);   // [{kind:'badge'|'tag', value, op}]
  const MG = (window.CULTURE && window.CULTURE.MEDIA_GLYPH) || {};

  const { badges, tags, notableSet } = React.useMemo(() => {
    const b = {}, t = {};
    items.forEach(it => {
      (it.highlights || []).forEach(h => { if (HIGHLIGHTS[h]) b[h] = (b[h] || 0) + 1; });
      (it.tags || []).forEach(tag => { const k = String(tag).toLowerCase(); if (k) t[k] = (t[k] || 0) + 1; });
    });
    const popular = Object.entries(t).filter(([, c]) => c >= 3).sort((a, c) => c[1] - a[1]).slice(0, 55);
    const popKeys = new Set(popular.map(e => e[0]));
    const notable = Object.entries(t).filter(([tag]) => !popKeys.has(tag) && NOTABLE_TAGS.some(n => tag.includes(n)))
      .sort((a, c) => c[1] - a[1]);
    return {
      badges: Object.entries(b).sort((a, c) => c[1] - a[1]),
      tags: [...notable, ...popular],   // gems first, then the popular bulk
      notableSet: new Set(notable.map(e => e[0])),
    };
  }, [items]);

  const keyOf = (k, v) => k + ':' + v;
  const selMap = new Map(sel.map(c => [keyOf(c.kind, c.value), c.op]));
  const choose = (kind, value, op) => setSel(prev => {
    const k = keyOf(kind, value);
    const ex = prev.find(c => keyOf(c.kind, c.value) === k);
    if (ex) return ex.op === op ? prev.filter(c => keyOf(c.kind, c.value) !== k)
                                : prev.map(c => keyOf(c.kind, c.value) === k ? { ...c, op } : c);
    return [...prev, { kind, value, op }];
  });
  const click = (e, kind, value) => {
    const r = e.currentTarget.getBoundingClientRect();
    choose(kind, value, (e.clientX - r.left) > r.width / 2 ? 'OR' : 'AND');
  };

  const has = (it, c) => c.kind === 'badge'
    ? (it.highlights || []).includes(c.value)
    : (it.tags || []).some(t => String(t).toLowerCase() === c.value);
  const ands = sel.filter(c => c.op === 'AND'), ors = sel.filter(c => c.op === 'OR');
  const results = React.useMemo(() => sel.length
    ? items.filter(it => ands.every(c => has(it, c)) && (!ors.length || ors.some(c => has(it, c))))
    : [], [items, sel]);

  const cls = op => `xchip${op ? ' sel ' + op.toLowerCase() : ''}`;
  return (
    <div className="explorer">
      <div className="explorer-hint">Click a chip — <b>left = AND</b>, <b>right = OR</b>. Mix badges + subtags.</div>
      <div className="explorer-rail">
        {badges.map(([h, c]) => { const op = selMap.get('badge:' + h); return (
          <button key={h} className={cls(op) + ' badge'} onClick={e => click(e, 'badge', h)} title="Left half = AND · right half = OR">
            {op ? <span className="xop">{op === 'OR' ? '∨' : '∧'}</span> : null}{HIGHLIGHTS[h].emoji} {HIGHLIGHTS[h].label}<span className="xc">{c}</span>
          </button>
        ); })}
      </div>
      {tags.length > 0 && <div className="explorer-cloud">
        {tags.map(([t, c]) => { const op = selMap.get('tag:' + t); return (
          <button key={t} className={cls(op) + ' tag' + (notableSet.has(t) ? ' notable' : '')} onClick={e => click(e, 'tag', t)} title="Left half = AND · right half = OR">
            {op ? <span className="xop">{op === 'OR' ? '∨' : '∧'}</span> : null}{t}<span className="xc">{c}</span>
          </button>
        ); })}
      </div>}
      {sel.length > 0 && (
        <div className="explorer-results">
          <div className="explorer-query">
            {ands.length > 0 && <span><b>all of:</b> {ands.map(c => c.kind === 'badge' ? HIGHLIGHTS[c.value].label : c.value).join(' · ')}</span>}
            {ands.length > 0 && ors.length > 0 && <span className="qjoin">  and  </span>}
            {ors.length > 0 && <span><b>any of:</b> {ors.map(c => c.kind === 'badge' ? HIGHLIGHTS[c.value].label : c.value).join(' · ')}</span>}
          </div>
          <div className="explorer-count">{results.length} match{results.length !== 1 ? 'es' : ''}<button className="xclear" onClick={() => setSel([])}>clear</button></div>
          <div className="explorer-wall">
            {results.slice(0, 140).map(it => {
              const img = it.poster || it.tmdbPoster || it.igdbCover || it.bookCover;
              return (
                <a key={it.id} className="xcover" onClick={() => onOpenItem && onOpenItem(it)} title={`${displayTitle(it)} (${it.year || ''})`}>
                  {img ? <img src={img} alt="" loading="lazy" />
                       : <span className="xcover-fallback" style={{ '--pf-bg': spineBodyColor(it) }}>{MG[it.medium] || '•'}</span>}
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function TasteProfile({ items, onOpenItem }) {
  const [axis, setAxis] = React.useState('filmweb');   // community baseline
  const [hiddenMed, setHiddenMed] = React.useState(() => new Set());  // growth legend toggles

  const contrarian = React.useMemo(() => {
    const rows = [];
    items.forEach(it => {
      const me = parseFloat(it.rating);
      const them = communityScore(it, axis);
      if (!isNaN(me) && them != null && !isNaN(them))
        rows.push({ it, me, them, delta: +(me - them).toFixed(1) });
    });
    const higher = [...rows].sort((a, b) => b.delta - a.delta).filter(r => r.delta > 0).slice(0, 8);
    const lower  = [...rows].sort((a, b) => a.delta - b.delta).filter(r => r.delta < 0).slice(0, 8);
    return { higher, lower, n: rows.length };
  }, [items, axis]);

  const time = React.useMemo(() => {
    const by = {}; let total = 0;
    items.forEach(it => { const m = itemDurationMinutes(it); if (m > 0) { by[it.medium] = (by[it.medium] || 0) + m; total += m; } });
    return { by: Object.entries(by).sort((a, b) => b[1] - a[1]), total };
  }, [items]);

  const timeline = React.useMemo(() => {
    const dated = items.filter(i => i.watchedDate);
    const years = [...new Set(dated.map(i => i.watchedDate.slice(0, 4)))].sort();
    if (years.length < 2) return null;
    const yi = {}; years.forEach((y, i) => { yi[y] = i; });
    const series = {};                 // medium -> counts per year
    const totals = years.map(() => 0);
    dated.forEach(i => {
      const j = yi[i.watchedDate.slice(0, 4)];
      (series[i.medium] || (series[i.medium] = years.map(() => 0)))[j]++;
      totals[j]++;
    });
    const mediums = Object.keys(series).sort((a, b) =>
      series[b].reduce((x, y) => x + y, 0) - series[a].reduce((x, y) => x + y, 0));
    const peakIdx = totals.indexOf(Math.max(...totals));
    return { years, series, totals, mediums, total: dated.length, peak: totals[peakIdx], peakYear: years[peakIdx] };
  }, [items]);

  const fingerprint = React.useMemo(() => {
    const top = (map) => { const e = Object.entries(map).sort((a, b) => b[1] - a[1]); return e.length ? e[0] : null; };
    const decade = top(countBy(items, it => it.year ? `${Math.floor(it.year / 10) * 10}s` : null));
    const country = top(countBy(items, it => regionName(it.region)));
    const director = top(countBy(items, it => it.director));
    const gmap = {}; items.forEach(it => (it.genres || []).forEach(g => { gmap[g] = (gmap[g] || 0) + 1; }));
    const genre = top(gmap);
    const bmap = {}; items.forEach(it => (it.highlights || []).forEach(h => { if (HIGHLIGHTS[h]) bmap[h] = (bmap[h] || 0) + 1; }));
    const badge = top(bmap);
    const tmap = {}; items.forEach(it => (it.tags || []).forEach(t => { const k = String(t).toLowerCase(); if (k) tmap[k] = (tmap[k] || 0) + 1; }));
    const tag = top(tmap);
    const ymap = {}; items.forEach(it => { if (it.watchedDate) { const y = it.watchedDate.slice(0, 4); ymap[y] = (ymap[y] || 0) + 1; } });
    const busiest = top(ymap);
    const rated = items.map(it => parseFloat(it.rating)).filter(v => !isNaN(v));
    const avg = rated.length ? (rated.reduce((a, b) => a + b, 0) / rated.length).toFixed(1) : null;
    return { decade, country, director, genre, badge, tag, busiest, avg, rated: rated.length };
  }, [items]);

  const Row = ({ r }) => (
    <div className="taste-row" onClick={() => onOpenItem && onOpenItem(r.it)} title={`${displayTitle(r.it)} (${r.it.year})`}>
      <span className="taste-row-title">{displayTitle(r.it)}</span>
      <span className="taste-row-scores">
        <span className="me">★{r.me}</span>
        <span className="vs">vs {r.them}</span>
        <span className={`delta ${r.delta > 0 ? 'pos' : 'neg'}`}>{r.delta > 0 ? '+' : ''}{r.delta}</span>
      </span>
    </div>
  );

  return (
    <div className="taste">
      <div className="stats-section">
        <div className="stats-section-title">Palette — explore by badge × tag</div>
        <TagBadgeExplorer items={items} onOpenItem={onOpenItem} />
      </div>
      <div className="stats-section">
        <div className="stats-section-title-row">
          <div className="stats-section-title">Where your taste diverges{contrarian.n ? '' : ' — needs rated titles with a community score'}</div>
          <div className="rating-source-toggle">
            <button data-active={axis === 'filmweb'} onClick={() => setAxis('filmweb')}>vs Filmweb</button>
            <button data-active={axis === 'imdb'} onClick={() => setAxis('imdb')}>vs IMDb</button>
            <button data-active={axis === 'rt'} onClick={() => setAxis('rt')}>vs RT</button>
            <button data-active={axis === 'metacritic'} onClick={() => setAxis('metacritic')}>vs Metacritic</button>
          </div>
        </div>
        {contrarian.n > 0 && (
          <div className="taste-two">
            <div className="taste-col">
              <div className="taste-col-head">You rated higher</div>
              {contrarian.higher.length ? contrarian.higher.map(r => <Row key={r.it.id} r={r} />) : <div className="taste-empty">—</div>}
            </div>
            <div className="taste-col">
              <div className="taste-col-head">Lower than the crowd</div>
              {contrarian.lower.length ? contrarian.lower.map(r => <Row key={r.it.id} r={r} />) : <div className="taste-empty">—</div>}
            </div>
          </div>
        )}
      </div>

      <div className="stats-two-col">
        <div className="stats-section">
          <div className="stats-section-title">Time spent</div>
          <div className="taste-time-total">≈ {formatSpan(time.total)}</div>
          <div className="taste-time-list">
            {time.by.map(([m, mins]) => (
              <div key={m} className="taste-time-row"><span>{m}</span><span>{formatSpan(mins)}</span></div>
            ))}
            {!time.by.length && <div className="taste-empty">No duration data yet.</div>}
          </div>
        </div>

        <div className="stats-section">
          <div className="stats-section-title">Taste fingerprint</div>
          <div className="taste-fp">
            {fingerprint.decade   && <div><span className="k">Era</span><span className="v">{fingerprint.decade[0]} · {fingerprint.decade[1]} titles</span></div>}
            {fingerprint.country  && <div><span className="k">Home</span><span className="v">{fingerprint.country[0]} · {fingerprint.country[1]}</span></div>}
            {fingerprint.genre    && <div><span className="k">Genre</span><span className="v">{fingerprint.genre[0]} · {fingerprint.genre[1]}</span></div>}
            {fingerprint.director && <div><span className="k">Most-seen</span><span className="v">{fingerprint.director[0]} · {fingerprint.director[1]}</span></div>}
            {fingerprint.badge    && HIGHLIGHTS[fingerprint.badge[0]] && <div><span className="k">Signature badge</span><span className="v">{HIGHLIGHTS[fingerprint.badge[0]].emoji} {HIGHLIGHTS[fingerprint.badge[0]].label} · {fingerprint.badge[1]}</span></div>}
            {fingerprint.tag      && <div><span className="k">Signature tag</span><span className="v">{fingerprint.tag[0]} · {fingerprint.tag[1]}</span></div>}
            {fingerprint.busiest  && <div><span className="k">Busiest year</span><span className="v">{fingerprint.busiest[0]} · {fingerprint.busiest[1]} titles</span></div>}
            {fingerprint.avg      && <div><span className="k">Avg rating</span><span className="v">★ {fingerprint.avg} · {fingerprint.rated} rated</span></div>}
          </div>
        </div>
      </div>

      {timeline && (() => {
        const W = 320, H = 76, PAD = 6;
        const ys = timeline.years, n = ys.length;
        const vis = timeline.mediums.filter(m => !hiddenMed.has(m));
        const vmax = Math.max(1, ...vis.flatMap(m => timeline.series[m]));
        const X = i => n > 1 ? (i / (n - 1)) * W : 0;
        const Y = c => H - PAD - (c / vmax) * (H - PAD * 2);
        return (
          <div className="stats-section" style={{ marginBottom: 0 }}>
            <div className="stats-section-title">Titles seen per year — {timeline.total} dated · peak {timeline.peak} in {timeline.peakYear}</div>
            <div className="taste-growth-layout">
              <div className="taste-growth-chart">
                <svg className="taste-timeline" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
                  {vis.map(m => (
                    <polyline key={m} fill="none" stroke={MEDIUM_MAP_HUE[m] || 'var(--accent)'} strokeWidth="1.4" vectorEffect="non-scaling-stroke"
                      points={ys.map((_, i) => `${X(i).toFixed(1)},${Y(timeline.series[m][i]).toFixed(1)}`).join(' ')} />
                  ))}
                </svg>
                <div className="taste-timeline-labels">
                  {ys.map(y => <span key={y}>{"’" + y.slice(2)}</span>)}
                </div>
              </div>
              <div className="taste-growth-legend">
                {timeline.mediums.map(m => (
                  <div key={m} className={`growth-leg${hiddenMed.has(m) ? ' off' : ''}`}
                    onClick={() => setHiddenMed(p => { const s = new Set(p); s.has(m) ? s.delete(m) : s.add(m); return s; })}>
                    <span className="growth-swatch" style={{ background: MEDIUM_MAP_HUE[m] || 'var(--accent)' }} />
                    <span className="growth-leg-name">{m}</span>
                    <span className="growth-leg-cnt">{timeline.series[m].reduce((a, b) => a + b, 0)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─────────── WishlistPicker (Stats, wishlist only) — "what to watch next" ───────────
function wlScore(it) {
  const f = it.fwAvg != null ? parseFloat(it.fwAvg) : null;
  const i = it.omdb && it.omdb.imdbRating && it.omdb.imdbRating !== 'N/A' ? parseFloat(it.omdb.imdbRating) : null;
  return f != null ? f : i;
}
function WishlistPicker({ items, seenItems, onOpenItem }) {
  const [seed, setSeed] = React.useState(0);
  const MG = (window.CULTURE && window.CULTURE.MEDIA_GLYPH) || {};

  const acclaimed = React.useMemo(() => [...items]
    .filter(it => wlScore(it) != null && (it.voteCount == null || it.voteCount >= 1000))
    .sort((a, b) => wlScore(b) - wlScore(a)).slice(0, 18), [items]);

  const tasteMatch = React.useMemo(() => {
    const g = {}, d = {};
    seenItems.forEach(it => { (it.genres || []).forEach(x => g[x] = (g[x] || 0) + 1); if (it.director) d[it.director] = (d[it.director] || 0) + 1; });
    const topG = new Set(Object.entries(g).sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0]));
    const topD = new Set(Object.entries(d).sort((a, b) => b[1] - a[1]).slice(0, 40).map(e => e[0]));
    return items.map(it => {
      let s = 0; (it.genres || []).forEach(x => { if (topG.has(x)) s++; }); if (it.director && topD.has(it.director)) s += 2;
      return { it, s };
    }).filter(x => x.s > 0).sort((a, b) => b.s - a.s || (wlScore(b.it) || 0) - (wlScore(a.it) || 0)).slice(0, 18).map(x => x.it);
  }, [items, seenItems]);

  const surprise = React.useMemo(() => {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a.slice(0, 12);
  }, [items, seed]);

  const Row = ({ title, list, sub }) => list.length > 0 && (
    <div className="wl-pick-row">
      <div className="wl-pick-head"><span className="stats-section-title">{title}</span>{sub}</div>
      <div className="explorer-wall">
        {list.map(it => { const img = it.poster || it.tmdbPoster || it.igdbCover || it.bookCover; return (
          <a key={it.id} className="xcover" onClick={() => onOpenItem && onOpenItem(it)} title={`${displayTitle(it)} (${it.year || ''})${wlScore(it) ? ' · ⌀ ' + wlScore(it) : ''}`}>
            {img ? <img src={img} alt="" loading="lazy" /> : <span className="xcover-fallback" style={{ '--pf-bg': spineBodyColor(it) }}>{MG[it.medium] || '•'}</span>}
          </a>); })}
      </div>
    </div>
  );
  return (
    <div className="stats-section">
      <div className="stats-section-title" style={{ marginBottom: 10 }}>Pick your next watch — {items.length} on the list</div>
      <Row title="Acclaimed & unseen" list={acclaimed} sub={<span className="wl-pick-sub">highest community score</span>} />
      <Row title="More of what you love" list={tasteMatch} sub={<span className="wl-pick-sub">your top genres & directors</span>} />
      <Row title="Surprise me" list={surprise} sub={<button className="xclear" onClick={() => setSeed(s => s + 1)}>re-roll</button>} />
    </div>
  );
}

// ─────────── StatsModal ───────────
function StatsModal({ allItems, library, seenItemsForTaste, onClose, onOpenItem, selectedRatings, onToggleRating, selectedDirectors, onToggleDirector, selectedStudios, onToggleStudio, selectedWeeks, onToggleWeek, selectedCountries, onToggleCountry, selectedActors, onToggleActor, selectedWriters, onToggleWriter, selectedCinematographers, onToggleCinematographer, selectedHighlights, onToggleHighlight }) {
  const { MEDIA } = window.CULTURE;
  const LEFT_VIEW_LABELS  = { directors: 'Directors · Creators · Authors', actors: 'Actors', writers: 'Writers · Screenwriters', cinematographers: 'Cinematographers', animationDirectors: 'Animation Directors' };
  const RIGHT_VIEW_LABELS = { studios: 'Studios · Networks · Publishers', companies: 'Production Companies', composers: 'Composers', badges: 'Standout badges' };
  const [medium, setMedium] = React.useState('All');
  const [leftView, setLeftView] = React.useState('directors');
  const [rightView, setRightView] = React.useState('studios');
  // Rating distribution bins by personal score or Filmweb avg — whichever the
  // collection has. Wishlist has no personal score, so it opens on Filmweb.
  const ratingSources = [
    ['rating', 'Mine'], ['fwAvg', 'Filmweb'], ['imdb', 'IMDb'], ['rt', 'RT'], ['metacritic', 'Metacritic'],
  ].filter(([k]) => allItems.some(i => scoreValue(i, k) != null));
  const [ratingSource, setRatingSource] = React.useState(
    () => allItems.some(i => i.rating) ? 'rating' : 'fwAvg'
  );
  const [on, setOn] = React.useState(false);
  const [tab, setTab] = React.useState('charts');   // 'charts' | 'taste'
  React.useEffect(() => { requestAnimationFrame(() => setOn(true)); }, []);

  const statItems = React.useMemo(
    () => medium === 'All' ? allItems : allItems.filter(i => i.medium === medium),
    [allItems, medium]
  );

  const totalWithDate = statItems.filter(i => i.watchedDate).length;

  return (
    <div className={`stats-backdrop${on ? '' : ''}`} onClick={onClose}>
      <div className="stats-modal" onClick={e => e.stopPropagation()}>
        <button className="stats-close" onClick={onClose}>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeLinecap="round"/>
          </svg>
        </button>
        <div className="stats-head">
          <h2>Stats<span className="dot">.</span></h2>
          <div className="stats-subtitle">{allItems.length} entries &nbsp;·&nbsp; {totalWithDate} with date</div>
        </div>
        <div className="stats-tabs">
          <button className={`stats-tab${tab === 'charts' ? ' active' : ''}`} onClick={() => setTab('charts')}>Charts</button>
          <button className={`stats-tab${tab === 'taste' ? ' active' : ''}`} onClick={() => setTab('taste')}>Taste profile</button>
        </div>

        <div className="stats-medium-tabs">
          {['All', ...MEDIA].map(m => (
            <button key={m} className={`stats-medium-tab${medium === m ? ' active' : ''}`} onClick={() => setMedium(m)}>{m}</button>
          ))}
        </div>

        {tab === 'taste' && <TasteProfile items={statItems} onOpenItem={onOpenItem} />}

        {tab === 'charts' && <React.Fragment>
        {library === 'wishlist' && <WishlistPicker items={statItems} seenItems={seenItemsForTaste || []} onOpenItem={onOpenItem} />}
        <div className="stats-section">
          <div className="stats-section-title-row">
            <div className="stats-section-title">
              {'Rating distribution — ' + ({ rating: 'your score · click to filter', fwAvg: 'Filmweb community average', imdb: 'IMDb rating (→10)', rt: 'Rotten Tomatoes (→10)', metacritic: 'Metacritic (→10)' }[ratingSource] || ratingSource)}
            </div>
            {ratingSources.length > 1 && (
              <div className="rating-source-toggle">
                {ratingSources.map(([k, label]) => (
                  <button key={k} data-active={ratingSource === k} onClick={() => setRatingSource(k)}>{label}</button>
                ))}
              </div>
            )}
          </div>
          <RatingHistogram
            items={statItems}
            source={ratingSource}
            activeSet={ratingSource === 'rating' ? selectedRatings : new Set()}
            onBar={ratingSource === 'rating' ? (n => onToggleRating(String(n))) : null}
          />
        </div>

        <div className="stats-two-col">
          <div className="stats-section">
            <div className="stats-view-head">
              <span className="stats-section-title">{LEFT_VIEW_LABELS[leftView]}</span>
              <span className="stats-view-chevron">▾</span>
              <select value={leftView} onChange={e => setLeftView(e.target.value)} className="stats-view-select-overlay" aria-label="Choose people view">
                <option value="directors">Directors · Creators · Authors</option>
                <option value="actors">Actors</option>
                <option value="writers">Writers · Screenwriters</option>
                <option value="cinematographers">Cinematographers</option>
                <option value="animationDirectors">Animation Directors</option>
              </select>
            </div>
            {leftView === 'directors'  && <HBarHistogram items={statItems} keyFn={it => it.director} selected={selectedDirectors} onToggle={onToggleDirector} />}
            {leftView === 'actors'     && <HBarHistogram items={statItems}
                countFn={its => { const m = {}; its.forEach(it => (it.cast||[]).forEach(a => { m[a] = (m[a]||0)+1; })); return m; }}
                selected={selectedActors} onToggle={onToggleActor} />}
            {leftView === 'writers'    && <HBarHistogram items={statItems} keyFn={it => it.writer || null} selected={selectedWriters} onToggle={onToggleWriter} />}
            {leftView === 'cinematographers' && <HBarHistogram items={statItems} keyFn={it => it.cinematographer || null} selected={selectedCinematographers} onToggle={onToggleCinematographer} />}
            {leftView === 'animationDirectors' && <HBarHistogram items={statItems} keyFn={it => it.animationDirector || null} selected={new Set()} onToggle={() => {}} />}
          </div>

          <div className="stats-section">
            <div className="stats-view-head">
              <span className="stats-section-title">{RIGHT_VIEW_LABELS[rightView]}</span>
              <span className="stats-view-chevron">▾</span>
              <select value={rightView} onChange={e => setRightView(e.target.value)} className="stats-view-select-overlay" aria-label="Choose studio view">
                <option value="studios">Studios · Networks · Publishers</option>
                <option value="companies">Production Companies</option>
                <option value="composers">Composers</option>
                <option value="badges">Standout badges</option>
              </select>
            </div>
            {rightView === 'studios'   && <HBarHistogram items={statItems} keyFn={it => it.studio} selected={selectedStudios} onToggle={onToggleStudio} />}
            {rightView === 'companies' && <HBarHistogram items={statItems}
                countFn={its => { const m = {}; its.forEach(it => (it.productionCompanies||[]).forEach(c => { m[c] = (m[c]||0)+1; })); return m; }}
                selected={new Set()} onToggle={() => {}} />}
            {rightView === 'composers' && <HBarHistogram items={statItems} keyFn={it => it.composer || null} selected={new Set()} onToggle={() => {}} />}
            {rightView === 'badges'    && <HBarHistogram items={statItems}
                countFn={its => { const m = {}; its.forEach(it => (it.highlights||[]).forEach(h => { if (HIGHLIGHTS[h]) m[h] = (m[h]||0)+1; })); return m; }}
                labelFn={h => HIGHLIGHTS[h] ? `${HIGHLIGHTS[h].emoji} ${HIGHLIGHTS[h].label}` : h}
                selected={selectedHighlights} onToggle={onToggleHighlight} />}
          </div>
        </div>

        <div className="stats-section">
          <div className="stats-section-title">Activity heatmap — click weeks to filter library</div>
          <ActivityHeatmap items={statItems} selectedWeeks={selectedWeeks} onToggleWeek={onToggleWeek} medium={medium} />
        </div>

        <div className="stats-section" style={{ marginBottom: 0 }}>
          <div className="stats-section-title">Country breakdown — click to filter library</div>
          <WorldMap items={statItems} selectedCountries={selectedCountries} onToggleCountry={onToggleCountry} medium={medium} />
        </div>
        </React.Fragment>}
      </div>
    </div>
  );
}

// Release-year buckets for the Wishlist's bottom chips: 5-year blocks from 1980
// onward, whole decades before that.
function releaseBucketKey(y) {
  if (!y) return null;
  if (y >= 1980) { const s = y - (y % 5); return `${s}-${s + 4}`; }
  const s = y - (y % 10); return `${s}s`;
}
function releaseBucketLabel(key) {
  if (key.endsWith('s')) return key;                 // "1970s"
  const [a, b] = key.split('-'); return `${a}–${b.slice(2)}`;  // "1985–89"
}
function releaseBucketStart(key) {
  return parseInt(key, 10);
}

// Normalises content length to minutes for cross-media duration sort.
function itemDurationMinutes(item) {
  if (item.medium === 'TV' || item.medium === 'Animated Series') {
    if (item.totalMinutes) return item.totalMinutes;
    if (item.seasons) return item.seasons * 10 * 45;
    return 0;
  }
  if (item.medium === 'Games') return (item.playtime || 0) * 60;
  if (item.medium === 'Books') return (item.pages || 0) / 4;
  return item.runtime || 0; // Movies, Feature Animation, Shorts
}

// Sort a list by the chosen key. Stable-ish with title tiebreak.
// Maps a wishlist `priority` (number 1–5, or hi/med/lo string) to a sortable
// rank. Unset → 0 so un-prioritised items fall to fwAvg tiebreak.
function priorityRank(p) {
  if (p == null) return 0;
  if (typeof p === 'number') return p;
  const s = String(p).toLowerCase();
  if (s === 'high' || s === 'hi') return 3;
  if (s === 'med'  || s === 'medium') return 2;
  if (s === 'low'  || s === 'lo') return 1;
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// English display title, falling back to the stored (original) title.
function displayTitle(it) { return it.enTitle || it.title; }

// Attach the separate enrichment files (omdb_data.js / books_data.js) at runtime.
// OMDb is nested under `item.omdb` (NEVER spread — so it can't overwrite existing
// director/genres/etc.); the book overlay is spread (it's meant to fill gaps).
// Your scraped Filmweb opinion for this item, keyed "<kind>/<id>" off the link
// (film|serial|videogame) so film/serial numeric ids can't collide.
function filmwebNote(item) {
  const notes = window.CULTURE_NOTES;
  if (!notes || !item.link) return null;
  const m = item.link.match(/filmweb\.pl\/(film|serial|videogame)\/[^"']*-(\d+)/);
  return m ? notes[`${m[1]}/${m[2]}`] || null : null;
}

function enrichExtras(item) {
  const omdb = (window.CULTURE_OMDB || {})[item.id];
  const book = (window.CULTURE_BOOKS || {})[item.id];
  const gameTt = (window.CULTURE_GAME_IMDB || {})[item.id];  // IMDb id for games
  const fwNote = item.note ? null : filmwebNote(item);       // never clobber a curated note
  const noteEn = (window.CULTURE_NOTES_EN || {})[item.id];   // interpretive EN redraft
  const tmdb = (window.CULTURE_TMDB || {})[item.id];         // TMDB synopsis (toggle source)
  const addBadges = (window.CULTURE_BADGES || {})[item.id];  // curated badge additions
  if (!omdb && !book && !gameTt && !fwNote && !noteEn && !tmdb && !addBadges) return item;
  const out = book ? { ...item, ...book } : { ...item };
  if (omdb) {
    out.omdb = omdb;
    if (omdb.imdbID) out.imdbUrl = `https://www.imdb.com/title/${omdb.imdbID}/`;
  }
  if (gameTt && !out.imdbUrl) out.imdbUrl = `https://www.imdb.com/title/${gameTt}/`;
  if (fwNote && !out.note) out.note = fwNote;
  if (noteEn) out.noteEn = noteEn;
  if (tmdb && !out.summary) out.summary = tmdb;
  if (addBadges) out.highlights = [...new Set([...(out.highlights || []), ...addBadges])];
  // No hand-picked poster and cast_data had no TMDB art? Use OMDb's poster (already
  // downloaded) so the cover/Reader shows real art instead of the glyph fallback.
  if (!out.poster && !out.tmdbPoster && omdb && omdb.Poster && omdb.Poster !== 'N/A') out.tmdbPoster = omdb.Poster;
  return out;
}

// Pull a specific critic score out of OMDb's Ratings[] (e.g. 'Rotten Tomatoes').
function omdbRating(omdb, source) {
  if (!omdb || !omdb.Ratings) return null;
  const r = omdb.Ratings.find(x => x.Source === source);
  return r && r.Value && r.Value !== 'N/A' ? r.Value : null;
}

// OMDb only gives Awards as a generalized sentence ("Won 2 Primetime Emmys.
// Another 34 wins & 78 nominations total") — no per-award list exists. Parse it
// into a few short chips; the full original sentence shows on hover.
function parseAwards(str) {
  if (!str || str === 'N/A') return null;
  const n = re => { const m = str.match(re); return m ? parseInt(m[1], 10) : 0; };
  const oscarsWon = n(/Won (\d+) Oscar/i);
  const oscarNoms = n(/Nominated for (\d+) Oscar/i);
  const wins = n(/(\d+) wins?\b/i);
  const noms = n(/(\d+) nominations?\b/i);
  const named = str.match(/Won (\d+) ((?:Primetime |Daytime )?Emmys?|Golden Globes?|BAFTA(?:[^.]*?Awards?)?|Grand Prix|Palme d['’]Or|Golden Lions?|Golden Bears?)/i);
  const chips = [];
  if (oscarsWon) chips.push(`🥇 ${oscarsWon} Oscar${oscarsWon > 1 ? 's' : ''}`);
  else if (oscarNoms) chips.push(`🥇 ${oscarNoms} Oscar nom${oscarNoms > 1 ? 's' : ''}`);
  if (named) chips.push(`🏆 ${named[1]} ${named[2].trim()}`);
  if (wins) chips.push(`🏆 ${wins} win${wins > 1 ? 's' : ''}`);
  if (noms) chips.push(`✦ ${noms} nom${noms > 1 ? 's' : ''}`);
  return chips.length ? { chips, original: str } : { chips: [str], original: str };
}

// The external link to open, honouring the global Filmweb⇄IMDb preference.
// Falls back to the stored (Filmweb/Goodreads/…) link when there's no IMDb url.
function primaryLink(item, pref) {
  return (pref === 'imdb' && item.imdbUrl) ? item.imdbUrl : item.link;
}

function sortItems(arr, sort, dir) {
  const byTitle = (a, b) => displayTitle(a).localeCompare(displayTitle(b));
  const list = [...arr];
  if (sort === 'az')           list.sort(byTitle);
  else if (sort === 'priority') list.sort((a, b) => {
    const pa = priorityRank(a.priority), pb = priorityRank(b.priority);
    if (pa !== pb) return pb - pa;                                   // higher priority first
    if (!!a.shortlist !== !!b.shortlist) return a.shortlist ? -1 : 1; // pinned first
    return (parseFloat(b.fwAvg) || 0) - (parseFloat(a.fwAvg) || 0) || byTitle(a, b); // then community avg
  });
  else if (sort === 'year')    list.sort((a, b) => (b.year || 0) - (a.year || 0) || byTitle(a, b));
  else if (sort === 'rating')  list.sort((a, b) => (parseFloat(b.rating) || -1) - (parseFloat(a.rating) || -1) || byTitle(a, b));
  else if (sort === 'country')  list.sort((a, b) => (regionName(a.region) || '~').localeCompare(regionName(b.region) || '~') || byTitle(a, b));
  else if (sort === 'director') list.sort((a, b) => (a.director || '￿').localeCompare(b.director || '￿') || byTitle(a, b));
  else if (sort === 'studio')   list.sort((a, b) => (a.studio   || '￿').localeCompare(b.studio   || '￿') || byTitle(a, b));
  else if (sort === 'rated')    list.sort((a, b) => (b.watchedDate || '').localeCompare(a.watchedDate || '') || byTitle(a, b));
  else if (sort === 'duration') list.sort((a, b) => {
    const da = itemDurationMinutes(a), db = itemDurationMinutes(b);
    if (!da && !db) return byTitle(a, b);
    if (!da) return 1;
    if (!db) return -1;
    return db - da || byTitle(a, b);
  });
  if (dir === 'asc') list.reverse();
  return list;
}

// Sort-aware labels for the direction toggle [desc, asc]. The old tooltip was
// hardcoded to "Newest/Oldest first", which was wrong for most sort keys.
const SORT_DIR_LABEL = {
  priority: ['Most wanted first', 'Least wanted first'],
  year:     ['Newest first', 'Oldest first'],
  rated:    ['Most recent first', 'Earliest first'],
  rating:   ['Highest first', 'Lowest first'],
  duration: ['Longest first', 'Shortest first'],
  az:       ['A → Z', 'Z → A'],
  director: ['A → Z', 'Z → A'],
  studio:   ['A → Z', 'Z → A'],
  country:  ['A → Z', 'Z → A'],
};

// Standout "what makes it sublime" badges. Hand-assigned per item via a
// `highlights: ['direction', ...]` field; strictly, quality-based. Rendered as
// emoji at the spine top and as labelled chips in the Reader.
const HIGHLIGHTS = {
  direction:    { emoji: '🎬', label: 'Masterful direction' },
  writing:      { emoji: '✍️', label: 'Exceptional writing' },
  cinematography: { emoji: '📷', label: 'Masterful cinematography' },
  visuals:      { emoji: '🎨', label: 'Gorgeous visuals' },
  acting:       { emoji: '🎭', label: 'Powerhouse performances' },
  score:        { emoji: '🎵', label: 'Unforgettable score' },
  mindbending:  { emoji: '🌀', label: 'Mind-bending' },
  gem:          { emoji: '💎', label: 'Hidden gem — floored me' },
  devastating:  { emoji: '💔', label: 'Emotionally devastating' },
  impact:       { emoji: '💥', label: 'Impactful' },
  funny:        { emoji: '😂', label: 'Genuinely funny' },
  bittersweet:  { emoji: '🥲', label: 'Funny through tears' },
  satire:       { emoji: '🗯️', label: 'Satire' },
  absurdist:    { emoji: '🤪', label: 'Absurdist' },
  cerebral:     { emoji: '🧠', label: 'Thought-provoking' },
  style:        { emoji: '🕶️', label: 'Bold style' },
  atmosphere:   { emoji: '🌌', label: 'Immersive atmosphere' },
  slowburn:     { emoji: '⏳', label: 'Slow burn' },
  intense:      { emoji: '🩸', label: 'Brutal' },
  horrifying:   { emoji: '💀', label: 'Horrifying' },
  thrilling:    { emoji: '⚡', label: 'Pure adrenaline' },
  ahead:        { emoji: '🕰️', label: 'Ahead of its time' },
  singular:     { emoji: '🃏', label: 'One-of-a-kind' },
  cognitive:    { emoji: '🪞', label: 'A cognitive shift' },
  worldbuilding:{ emoji: '🗺️', label: 'A world unto itself' },
};
// One badge by default; only wide spines carry more (≥29px ≈ a movie ≥2.5h, or a
// thick TV/game) so narrow titles don't get busy. The Reader shows all of them.
function highlightCap(item) { return spineWidth(item) >= 29 ? 3 : 1; }

// ─────────── Shelf row ───────────
function ShelfRow({ medium, items, idx, mode, sort, sortDir, mixSeed, onOpenItem, justPickedId, pickedSet, spineValue = 'rating', linkPref = 'filmweb' }) {
  const { MEDIA_SHORT, MEDIA_GLYPH } = window.CULTURE;
  const [hoverIdx, setHoverIdx] = React.useState(-1);
  const [popupPos, setPopupPos] = React.useState(null);
  const [reshuffling, setReshuffling] = React.useState(false);
  const scrollerRef = React.useRef(null);
  const posRef = React.useRef(null);    // header "NN%" label — updated imperatively
  const thumbRef = React.useRef(null);  // scrollbar thumb — updated imperatively
  const popupTimer = React.useRef(null);
  const initializedRef = React.useRef(false);

  // Items rendered in display order. In covers/mix we centre-order them so
  // the rank-0 (most-important) data row sits visually in the middle of
  // the shelf with the rest fanning symmetrically outward.
  const ordered = React.useMemo(() => {
    // Covers shows favorites + anything with a hand-picked poster; spines / mix
    // show the whole library. An explicit `poster` promotes an item to a cover so
    // curated art shows even when the item isn't marked favorite.
    // If a shelf has no cover-worthy items at all, fall back to all items.
    const coverWorthy = i => i.favorite || i.poster;
    const base = mode === 'covers'
      ? (items.some(coverWorthy) ? items.filter(coverWorthy) : items)
      : items;
    const arr = base.map((it, i) => ({ ...it, _rank: i }));
    if (sort && sort !== 'curated') {
      // Explicit sort → linear, left-aligned, no centre piece.
      return sortItems(arr, sort, sortDir).map(it => ({ ...it, _rank: -1 }));
    }
    return mode === 'spines' ? arr : centerOrder(arr);
  }, [items, mode, sort, sortDir]);

  // For mix mode, decide cover vs spine deterministically per (id, seed).
  // The rank-0 item is always shown as a cover so the centre piece reads.
  const isSpineFor = React.useCallback((item) => {
    if (mode === 'spines') return true;
    if (!item.favorite && !item.poster) return true;  // no fav & no poster → spine
    if (mode === 'covers') return false;
    if (item._rank === 0) return false;
    return (hash(item.id, mixSeed) % 3) !== 0;
  }, [mode, mixSeed]);

  // ── Drag-scroll: window-tracked, with click suppression ──
  // Move/up live on `window` so a drag keeps going even when the cursor leaves
  // the row. No JS inertia on mouse-release: setting scrollLeft per rAF frame was
  // choppy on big rows. Touch is untouched (it uses the browser's native scroll +
  // native momentum, not this handler).
  const dragRef = React.useRef({ down: false, startX: 0, startSL: 0, moved: false });
  const momentumRaf = React.useRef(0);
  const DRAG_THRESHOLD = 5;

  const stopMomentum = React.useCallback(() => {
    if (momentumRaf.current) { cancelAnimationFrame(momentumRaf.current); momentumRaf.current = 0; }
  }, []);

  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    stopMomentum();
    const el = scrollerRef.current;
    if (!el) return;
    dragRef.current = { down: true, startX: e.clientX, startSL: el.scrollLeft, moved: false };
  };

  React.useEffect(() => {
    const onMove = (e) => {
      const d = dragRef.current;
      if (!d.down) return;
      const el = scrollerRef.current;
      if (!el) return;
      const dx = e.clientX - d.startX;
      if (!d.moved && Math.abs(dx) > DRAG_THRESHOLD) {
        d.moved = true;
        el.classList.add('dragging');
        setHoverIdx(-1); setPopupPos(null);
      }
      if (d.moved) el.scrollLeft = d.startSL - dx;
    };
    const onUp = () => {
      const d = dragRef.current;
      if (!d.down) return;
      const el = scrollerRef.current;
      const wasMoved = d.moved;
      el?.classList.remove('dragging');
      d.down = false;
      // suppress the click that would otherwise fire after a drag
      if (wasMoved) setTimeout(() => { dragRef.current.moved = false; }, 0);
      else d.moved = false;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      stopMomentum();
    };
  }, [stopMomentum]);

  // ── Scroll bookkeeping — writes the %-label and thumb straight to the DOM
  // (no setState) so dragging/momentum trigger ZERO React renders per frame.
  // This is the main reason mouse-drag now approaches native-touch smoothness. ──
  const recomputeScroll = React.useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const pct = max <= 0 ? 0 : el.scrollLeft / max;
    const visible = el.clientWidth / el.scrollWidth;
    const thumb = Math.max(8, visible * 100);
    if (posRef.current) posRef.current.textContent = String(Math.round(pct * 100)).padStart(2, '0') + '%';
    if (thumbRef.current) {
      thumbRef.current.style.left = (pct * (100 - thumb)) + '%';
      thumbRef.current.style.width = thumb + '%';
    }
  }, []);

  // Hover-arrow nudge: scroll ~one screenful via native smooth scroll (which is
  // compositor-driven and stays smooth even on big rows).
  const nudge = React.useCallback((dir) => {
    stopMomentum();
    const el = scrollerRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  }, [stopMomentum]);

  // ── Virtualization (SPINES mode only) ──
  // Spine rows can hold 600+ items; rendering them all makes a JS drag repaint
  // the whole strip each frame. We render only the visible window (+ a buffer)
  // between two spacer divs that preserve the true scroll width. Covers/Mix keep
  // a full render (covers are few; mix relies on cover-overlap layout math).
  const SCROLL_PAD = 56;  // matches .shelf-scroll horizontal padding
  const spineLayout = React.useMemo(() => {
    if (mode !== 'spines') return null;
    const offsets = new Array(ordered.length + 1);
    let acc = 0;
    for (let i = 0; i < ordered.length; i++) { offsets[i] = acc; acc += spineWidth(ordered[i]); }
    offsets[ordered.length] = acc;
    return { offsets, total: acc };
  }, [ordered, mode]);

  const [vrange, setVrange] = React.useState({ start: 0, end: 120 });
  const updateVRange = React.useCallback(() => {
    const el = scrollerRef.current;
    if (!el || !spineLayout) return;
    const { offsets } = spineLayout;
    const n = offsets.length - 1;
    const BUF = 500;
    const viewL = el.scrollLeft - SCROLL_PAD - BUF;
    const viewR = el.scrollLeft - SCROLL_PAD + el.clientWidth + BUF;
    let lo = 0, hi = n;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (offsets[m] <= viewL) lo = m; else hi = m - 1; }
    const start = Math.max(0, lo);
    lo = 0; hi = n;
    while (lo < hi) { const m = (lo + hi) >> 1; if (offsets[m] >= viewR) hi = m; else lo = m + 1; }
    const end = Math.min(n, lo);
    setVrange(prev => (prev.start === start && prev.end === end) ? prev : { start, end });
  }, [spineLayout]);

  const scrollRaf = React.useRef(0);
  React.useEffect(() => {
    recomputeScroll();
    updateVRange();
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      if (scrollRaf.current) return;
      scrollRaf.current = requestAnimationFrame(() => { scrollRaf.current = 0; recomputeScroll(); updateVRange(); });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current);
    };
  }, [recomputeScroll, updateVRange]);

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
    const idx = ordered.findIndex(i => i.id === justPickedId);
    if (idx < 0) return;
    // Spines may be virtualized (target not in the DOM) — scroll by computed offset.
    if (spineLayout) {
      const center = SCROLL_PAD + spineLayout.offsets[idx] + spineWidth(ordered[idx]) / 2;
      el.scrollTo({ left: center - el.clientWidth / 2, behavior: 'smooth' });
      return;
    }
    const target = el.querySelector(`[data-item-id="${justPickedId}"]`);
    if (!target) return;
    const elRect = el.getBoundingClientRect();
    const tRect = target.getBoundingClientRect();
    const offset = (tRect.left + tRect.width / 2) - (elRect.left + elRect.width / 2);
    el.scrollTo({ left: el.scrollLeft + offset, behavior: 'smooth' });
  }, [justPickedId, items, ordered, spineLayout]);

  // Subtle fade when the active sort changes — covers/mix only. In spines mode
  // the whole-row reset looks jarring, so we skip the animation there.
  const [sorting, setSorting] = React.useState(false);
  const prevSort = React.useRef(sort);
  React.useEffect(() => {
    if (prevSort.current === sort) return;
    prevSort.current = sort;
    if (mode !== 'spines') setSorting(true);
    const el = scrollerRef.current;
    if (el) { if (sort === 'curated') centerOnRankZero(false); else el.scrollTo({ left: 0 }); }
    const t = setTimeout(() => setSorting(false), 420);
    return () => clearTimeout(t);
  }, [sort, centerOnRankZero]);

  // Hover only drives the <Popup>; the per-item visuals are pure CSS (:hover),
  // so these are stable callbacks and the item list (below) never re-renders on
  // hover — critical for big spine rows with hundreds of items.
  const handleEnter = React.useCallback((i, el) => {
    if (dragRef.current.down) return;
    setHoverIdx(i);
    if (popupTimer.current) clearTimeout(popupTimer.current);
    const r = el.getBoundingClientRect();
    setPopupPos({ x: r.left + r.width / 2, y: r.top });
  }, []);
  const handleLeave = React.useCallback(() => {
    if (popupTimer.current) clearTimeout(popupTimer.current);
    popupTimer.current = setTimeout(() => {
      setHoverIdx(-1);
      setPopupPos(null);
    }, 140);
  }, []);
  // Cancel a pending close — used when the cursor enters the popup itself so
  // the popup stays open until the cursor leaves the popup.
  const cancelClose = () => {
    if (popupTimer.current) clearTimeout(popupTimer.current);
  };
  const handleClick = React.useCallback((item) => {
    if (dragRef.current.moved) return;
    setHoverIdx(-1);
    setPopupPos(null);
    onOpenItem(item);
  }, [onOpenItem]);
  // Middle mouse button → jump straight to the item's external page.
  const handleAuxClick = React.useCallback((e, item) => {
    if (e.button === 1) {
      e.preventDefault();
      setHoverIdx(-1);
      setPopupPos(null);
      const url = primaryLink(item, linkPref);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, [linkPref]);

  // True while a freshly-picked item in THIS row is highlighted (and nothing
  // is hovered). Drives the row-dim so only the pick stays lit for a beat.
  const isPicking = !!justPickedId && hoverIdx < 0 && items.some(i => i.id === justPickedId);

  // The rendered item list is intentionally independent of `hoverIdx`: hover
  // visuals (lift / fan-out / dim) are pure CSS, so this memo is NOT rebuilt on
  // hover. Only the <Popup> below reads `hoverIdx`. This keeps big spine rows
  // (hundreds of items) from reconciling every node on each mouse-move.
  const renderedItems = React.useMemo(() => ordered.map((item, i) => {
    const isSpine = isSpineFor(item);
    const isJustPicked = item.id === justPickedId;
    // Spines don't overlap, so they need no stacking order — leaving them at the
    // default z keeps long rows (where i+1 would climb past 1000) from covering
    // the hover arrows. Only covers overlap their neighbours and need i+1.
    const zIndex = isJustPicked ? 150 : (isSpine ? undefined : i + 1);
    const bodyColor = spineBodyColor(item);
    const isPicked = pickedSet.has(item.id);

    return (
      <div
        key={item.id}
        data-item-id={item.id}
        data-rank={item._rank}
        data-mode={mode}
        data-pos={isJustPicked ? 'just-picked' : 'idle'}
        className={`item ${isSpine ? 'as-spine' : 'as-cover'}${isPicked ? ' picked' : ''}${reshuffling ? ' reshuffling' : ''}`}
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
        <img className="layer-img" src={item.poster || item.tmdbPoster || item.igdbCover || item.bookCover} alt={item.title} loading="lazy"/>
        <div className="layer-spine">
          <span className="spine-band top"/>
          {item.highlights && item.highlights.length > 0 && (
            <span className="spine-highlights">
              {item.highlights.filter(h => HIGHLIGHTS[h]).slice(0, highlightCap(item)).map(h => (
                <span key={h} className="spine-highlight" title={HIGHLIGHTS[h].label}>{HIGHLIGHTS[h].emoji}</span>
              ))}
            </span>
          )}
          <span className="spine-label">{displayTitle(item)}</span>
          <span className="spine-band bottom"/>
          {(() => {
            const isAvg = spineValue !== 'rating';
            const raw = isAvg ? item[spineValue] : item.rating;
            if (raw == null) return null;
            const shown = isAvg ? Math.round(raw) : raw;
            return <span className={`spine-glyph spine-rating${isAvg ? ' is-avg' : ''}`}>{shown}</span>;
          })()}
        </div>
        <span className="pick-dot"/>
      </div>
    );
  }), [ordered, mode, justPickedId, pickedSet, reshuffling, isSpineFor, handleEnter, handleLeave, handleClick, handleAuxClick, spineValue]);

  return (
    <section className={`shelf${isPicking ? ' is-picking' : ''}${sorting ? ' sorting' : ''}`}>
      <div className="shelf-head">
        <span className="num">{String(idx + 1).padStart(2, '0')}</span>
        <span className="name">{medium}</span>
        <span className="ct">— {items.length} entries</span>
        <span className="pos" ref={posRef}>00%</span>
      </div>
      <div className="shelf-rail">
        <button className="shelf-arrow left" tabIndex={-1} aria-label="Scroll left" onClick={() => nudge(-1)}>‹</button>
        <div
          className="shelf-scroll"
          ref={scrollerRef}
          onMouseDown={onMouseDown}
          onMouseLeave={handleLeave}
        >
          {spineLayout ? (() => {
            const n = spineLayout.offsets.length - 1;
            const s = Math.min(vrange.start, n);
            const e = Math.min(vrange.end, n);
            return (
              <React.Fragment>
                <div key="vspacer-l" aria-hidden="true" style={{ flex: '0 0 auto', width: spineLayout.offsets[s] }} />
                {renderedItems.slice(s, e)}
                <div key="vspacer-r" aria-hidden="true" style={{ flex: '0 0 auto', width: spineLayout.total - spineLayout.offsets[e] }} />
              </React.Fragment>
            );
          })() : renderedItems}
        </div>
        <button className="shelf-arrow right" tabIndex={-1} aria-label="Scroll right" onClick={() => nudge(1)}>›</button>
        <div className="shelf-thumb">
          <div className="bar" ref={thumbRef} style={{ left: '0%', width: '30%' }}/>
        </div>
      </div>
      {hoverIdx >= 0 && ordered[hoverIdx] && popupPos && (
        <Popup
          item={ordered[hoverIdx]}
          x={popupPos.x}
          y={popupPos.y}
          linkPref={linkPref}
          onMouseEnter={cancelClose}
          onMouseLeave={handleLeave}
        />
      )}
    </section>
  );
}

// ─────────── Popup (hover) ───────────
function Popup({ item, x, y, linkPref = 'filmweb', onMouseEnter, onMouseLeave }) {
  const { MEDIA_SHORT } = window.CULTURE;
  const adjX = Math.min(Math.max(x, 160), window.innerWidth - 160);
  const flipBelow = y < 220;
  const service = externalServiceName(primaryLink(item, linkPref));
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
      <div className="t">{displayTitle(item)}</div>
      {(item.noteEn || item.note)
        ? <div className="blurb">{item.noteEn || item.note}</div>
        : <div className="blurb empty">No note yet — add one in <code style={{ fontFamily:'var(--mono)', fontSize:11, background:'#eee5d3', padding:'1px 4px' }}>data.js</code>.</div>}
      <div className="hint">Click to open ↗ · middle-click → {service}</div>
    </div>
  );
}

// ─────────── DragScroll ───────────
function DragScroll({ className, children }) {
  const ref = React.useRef(null);
  const drag = React.useRef({ down: false, x: 0, sl: 0, moved: false });
  const THRESH = 5;
  const onMouseDown = e => {
    if (e.button !== 0) return;
    drag.current = { down: true, x: e.clientX, sl: ref.current.scrollLeft, moved: false };
  };
  const onMouseMove = e => {
    if (!drag.current.down) return;
    const dx = e.clientX - drag.current.x;
    if (!drag.current.moved && Math.abs(dx) > THRESH) {
      drag.current.moved = true;
      ref.current.classList.add('dragging');
    }
    if (drag.current.moved) ref.current.scrollLeft = drag.current.sl - dx;
  };
  const onUp = () => {
    if (!drag.current.down) return;
    ref.current?.classList.remove('dragging');
    drag.current.down = false;
    drag.current.moved = false;
  };
  React.useEffect(() => {
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, []);
  return (
    <div ref={ref} className={className}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseLeave={onUp}>
      {children}
    </div>
  );
}

// The Reader's primary "Open on …" button. When the item has BOTH a stored
// (Filmweb/etc.) link and an IMDb link, it becomes one morphing button: it rests
// on IMDb, and hovering the right half slides it across to Filmweb — the label
// crosses and the href follows. Items with only one link render a plain button.
function ReaderSourceButton({ item }) {
  const primary = item.link;
  const imdb = item.imdbUrl;
  const [side, setSide] = React.useState('imdb');
  const arrow = (
    <svg className="ss-arrow" width="9" height="9" viewBox="0 0 12 12" fill="none">
      <path d="M3 3h6v6M3 9l6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
  // Only one (or no) link → plain button, no morph.
  if (!imdb || !primary) {
    const url = primary || imdb;
    if (!url) return null;
    return (
      <a className="reader-btn primary" href={url} target="_blank" rel="noopener noreferrer">
        Open on {externalServiceName(url)}{arrow}
      </a>
    );
  }
  const leftName = externalServiceName(primary);
  const href = side === 'imdb' ? imdb : primary;
  const handleMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setSide((e.clientX - r.left) > r.width / 2 ? 'primary' : 'imdb');
  };
  return (
    <a className="reader-btn primary source-switch" data-side={side}
       href={href} target="_blank" rel="noopener noreferrer"
       onMouseMove={handleMove} onMouseLeave={() => setSide('imdb')}
       title={`Hover left for IMDb, right for ${leftName}`}>
      <span className="ss-fill" aria-hidden="true" />
      <span className="ss-labels">
        <span className="ss-label ss-a">Open on {leftName}</span>
        <span className="ss-label ss-b">Open on IMDb</span>
      </span>
      {arrow}
    </a>
  );
}

// The Reader description, with a source toggle. Films/TV with OMDb get the
// IMDb plot first and a small IMDb·TMDB switch (the user finds TMDB synopses
// flat); books/games show their single source with no toggle. Mounted with a
// key={item.id} in the Reader so its active-source state resets per title.
function ReaderSummary({ item }) {
  const sources = [];
  const o = item.omdb;
  const imdbText = o && ((o.PlotShort && o.PlotShort !== 'N/A' && o.PlotShort)
                      || (o.Plot && o.Plot !== 'N/A' && o.Plot));
  if (imdbText) sources.push({ key: 'IMDb', text: imdbText });
  if (item.summary)
    sources.push({ key: item.medium === 'Books' ? 'Synopsis' : 'TMDB', text: item.summary });
  if (item.igdbSummary)
    sources.push({ key: 'IGDB', text: item.igdbSummary });
  const [idx, setIdx] = React.useState(0);
  if (!sources.length) return null;
  const i = Math.min(idx, sources.length - 1);
  const active = sources[i];
  return (
    <p className="reader-summary" key={active.key}>
      {active.text}
      {sources.length > 1 && (
        <span className="summary-flip" onClick={() => setIdx((i + 1) % sources.length)}
          title="Switch description source">{active.key} ⇄</span>
      )}
    </p>
  );
}

// The personal-note blockquote. When an English redraft exists (item.noteEn),
// clicking it toggles PL↔EN with a matrix-style vertical letter cascade.
function ReaderQuote({ item }) {
  const pl = item.note;
  const en = item.noteEn;
  const [showEn, setShowEn] = React.useState(!!en);  // approved English shows by default
  const [busy, setBusy] = React.useState(false);
  if (!pl) {
    return <blockquote className="reader-quote empty">{item.favorite
      ? 'A note for this one is on the to-write list.'
      : 'From the wider library — no personal note yet.'}</blockquote>;
  }
  const text = (showEn && en) ? en : pl;
  const toggle = () => {
    if (!en || busy) return;
    setBusy(true);
    setShowEn(v => !v);
    setTimeout(() => setBusy(false), 1400);
  };
  return (
    <blockquote
      className={`reader-quote${en ? ' translatable' : ''}${busy ? ' shifting' : ''}`}
      onClick={toggle}
      title={en ? (showEn ? 'Click for the original' : 'Click to translate') : undefined}>
      <span className="quote-text" key={showEn ? 'en' : 'pl'}>
        {busy
          ? text.split(/(\s+)/).map((seg, si) => (
              /^\s+$/.test(seg)
                ? seg   /* whitespace as plain text -> same wrap points + spacing as the final text */
                : <span className="qcw" key={si}>
                    {seg.split('').map((ch, i) => (
                      <span className="qc" key={i} style={{ animationDelay: `${(Math.random() * 0.55).toFixed(3)}s`, animationDuration: `${(0.45 + Math.random() * 0.5).toFixed(3)}s` }}>{ch}</span>
                    ))}
                  </span>))
          : text}
      </span>
      {en && <span className="quote-flip" aria-hidden="true">{showEn ? 'EN' : 'PL'} ⇄</span>}
    </blockquote>
  );
}

// ─────────── Reader Modal ───────────
function Reader({ item, onClose, onJump, allItems, otherItems, library, onFilter }) {
  const { ITEMS, MEDIA_SHORT, MEDIA_GLYPH } = window.CULTURE;
  const [on, setOn] = React.useState(false);
  React.useEffect(() => {
    requestAnimationFrame(() => setOn(true));
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Similarity by shared genre / tag / director / cast, with a small year-proximity
  // nudge. Same medium only. Used both within-pool ("More like this") and across
  // pools (the seen↔unseen crossover row).
  const scoreAgainst = React.useCallback((pool, { limit = 12, minScore = 0 } = {}) => {
    const genreSet = new Set(item.genres || []);
    const tagSet   = new Set(item.tags   || []);
    const castSet  = new Set(item.cast   || []);
    return (pool || [])
      .filter(i => i.medium === item.medium && i.id !== item.id)
      .map(i => {
        let score = 0;
        (i.genres || []).forEach(g => { if (genreSet.has(g)) score += 2; });
        (i.tags   || []).forEach(t => { if (tagSet.has(t))   score += 1.5; });
        if (item.director && i.director === item.director) score += 3;
        (i.cast   || []).forEach(c => { if (castSet.has(c))  score += 1; });
        const yr = Math.abs((i.year || 0) - (item.year || 0));
        score += yr <= 5 ? 1 : yr <= 10 ? 0.5 : 0;
        return { i, score, yr };
      })
      .filter(x => x.score >= minScore)
      .sort((a, b) => b.score - a.score || a.yr - b.yr)
      .slice(0, limit)
      .map(x => x.i);
  }, [item]);

  const adjacent = React.useMemo(() => scoreAgainst(allItems || ITEMS), [scoreAgainst, allItems]);

  // Crossover: items from the OPPOSITE collection that resemble this one. Requires
  // a real signal (≥1 shared genre / shared director / tags) so it stays empty and
  // unobtrusive until items are enriched, rather than showing year-only noise.
  const crossover = React.useMemo(
    () => scoreAgainst(otherItems, { limit: 12, minScore: 2 }),
    [scoreAgainst, otherItems]
  );
  // When viewing the seen Library, the crossover surfaces unseen wishlist picks;
  // when viewing the Wishlist, it surfaces things already seen & liked.
  const crossoverLabel = library === 'wishlist' ? "You've already seen — similar" : 'On your wishlist — similar';
  const crossoverBadge = library === 'wishlist' ? '✓' : '◷';

  const inMedium = (allItems || ITEMS).filter(i => i.medium === item.medium);
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
          {(item.poster || item.tmdbPoster || item.igdbCover || item.bookCover)
            ? <img src={item.poster || item.tmdbPoster || item.igdbCover || item.bookCover} alt={item.title}/>
            : <div className="poster-fallback" style={{ '--pf-bg': spineBodyColor(item) }}>
                <span className="pf-title">{displayTitle(item)}</span>
                <span className="pf-meta">{MEDIA_SHORT[item.medium]} · {item.year}</span>
              </div>}
        </div>
        <div className="reader-body">
          <div className="reader-meta">
            <span>{MEDIA_SHORT[item.medium]}</span>
            <span className="sep"/>
            <span>{item.year}</span>
            {regionName(item.region) ? <React.Fragment><span className="sep"/><span className="meta-link" onClick={() => onFilter && onFilter(`region:${item.region === 'su' ? 'ru' : item.region}`)}>{regionName(item.region)}</span></React.Fragment> : null}
            {item.runtime ? <React.Fragment><span className="sep"/><span>{formatRuntime(item.runtime)}</span></React.Fragment> : null}
            {item.pages ? <React.Fragment><span className="sep"/><span>{item.pages} pages · ~{formatRuntime(Math.round(item.pages * 1.5))} read</span></React.Fragment> : null}
            {item.igdbRating ? <React.Fragment><span className="sep"/><span>IGDB {item.igdbRating}/100</span></React.Fragment> : null}
            {item.igdbGenres ? <React.Fragment><span className="sep"/><span>{item.igdbGenres.split(', ').map((g, i) => <React.Fragment key={g}>{i > 0 && ' · '}<span className="meta-link" onClick={() => onFilter && onFilter(`genre:${g}`)}>{g}</span></React.Fragment>)}</span></React.Fragment> : null}
            {item.seasons ? <React.Fragment><span className="sep"/><span>{item.seasons} {item.seasons > 1 ? 'seasons' : 'season'}</span></React.Fragment> : null}
            {item.episodes ? <React.Fragment><span className="sep"/><span>{item.episodes} eps</span></React.Fragment> : null}
            {item.totalMinutes ? <React.Fragment><span className="sep"/><span>{formatRuntime(item.totalMinutes)} total</span></React.Fragment> : null}
            {item.rating ? <React.Fragment><span className="sep"/><span>★ {item.rating}/10</span></React.Fragment> : null}
            {item.genres && item.genres.length > 0 ? <React.Fragment><span className="sep"/><span>{item.genres.slice(0, 4).map((g, i) => <React.Fragment key={g}>{i > 0 && ' · '}<span className="meta-link" onClick={() => onFilter && onFilter(`genre:${g}`)}>{g}</span></React.Fragment>)}</span></React.Fragment> : null}
            {item.igdbFranchise ? <React.Fragment><span className="sep"/><span>Series: {item.igdbFranchise}</span></React.Fragment> : null}
            {item.watchedDate ? <React.Fragment><span className="sep"/><span>Rated {item.watchedDate}</span></React.Fragment> : null}
            <span className="sep"/>
            <span>№ {String(posInMedium).padStart(3,'0')} of {String(inMedium.length).padStart(3,'0')}</span>
          </div>
          {(item.director || item.writer || item.cinematographer || item.composer || item.animationDirector) && (
            <div className="reader-crew">
              {item.director        && <span><span className="crew-role">{directorLabel(item.medium)}</span> <span className="meta-link" onClick={() => onFilter && onFilter(`director:${item.director}`)}>{item.director}</span></span>}
              {item.writer          && <span><span className="crew-role">Script</span> <span className="meta-link" onClick={() => onFilter && onFilter(`writer:${item.writer}`)}>{item.writer}</span></span>}
              {item.cinematographer && <span><span className="crew-role">DP</span> <span className="meta-link" onClick={() => onFilter && onFilter(`dp:${item.cinematographer}`)}>{item.cinematographer}</span></span>}
              {item.animationDirector && <span><span className="crew-role">Anim.</span> {item.animationDirector}</span>}
            </div>
          )}
          {item.providers && item.providers.length > 0 && (
            <div className="reader-crew reader-providers">
              <span><span className="crew-role">Watch</span> {item.providers.map((p, i) => <React.Fragment key={p}>{i > 0 && ' · '}<span className="meta-link" onClick={() => onFilter && onFilter(`on:${p}`)}>{p}</span></React.Fragment>)}</span>
            </div>
          )}
          <h2 className="reader-title">{displayTitle(item)}<span className="dot">.</span></h2>
          {(() => {
            const main = displayTitle(item);
            const alts = [item.title, item.polishTitle].filter(a => a && a !== main);
            const uniq = [...new Set(alts)];
            return uniq.length ? <div className="reader-orig">{uniq.join(' · ')}</div> : null;
          })()}
          <div className="reader-where">Fuad's library &nbsp;/&nbsp; {item.medium}</div>
          <ReaderQuote key={'quote-' + item.id} item={item} />
          <ReaderSummary key={'summary-' + item.id} item={item} />
          {(() => {
            const imdb = item.omdb && item.omdb.imdbRating && item.omdb.imdbRating !== 'N/A' ? item.omdb.imdbRating : null;
            const rt = omdbRating(item.omdb, 'Rotten Tomatoes');
            const mc = omdbRating(item.omdb, 'Metacritic');
            const fw = item.fwAvg || null;
            const a = item.omdb && parseAwards(item.omdb.Awards);
            if (!imdb && !rt && !mc && !fw && !a) return null;
            return (
              <div className="reader-scores">
                {imdb && <span className="score" title={item.omdb.imdbVotes && item.omdb.imdbVotes !== 'N/A' ? `${item.omdb.imdbVotes} IMDb votes` : 'IMDb rating'}><b>IMDb</b> ⭐ {imdb}</span>}
                {rt && <span className="score" title="Rotten Tomatoes"><b>RT</b> 🍅 {rt}</span>}
                {mc && <span className="score" title="Metacritic"><b>Metacritic</b> {mc}</span>}
                {fw && <span className="score" title="Filmweb community average"><b>Filmweb</b> ⌀ {fw}</span>}
                {a && <span className="reader-awards" title={a.original}>{a.chips.map((c, i) => <span className="award-chip" key={i}>{c}</span>)}</span>}
              </div>
            );
          })()}
          {(item.composer || item.studio || (item.productionCompanies && item.productionCompanies.length > 0)) && (
            <div className="reader-crew reader-production">
              {item.studio   && <span><span className="crew-role">{studioLabel(item.medium)}</span> <span className="meta-link" onClick={() => onFilter && onFilter(`studio:${item.studio}`)}>{item.studio}</span></span>}
              {item.productionCompanies && item.productionCompanies.length > 0 && <span><span className="crew-role">Production</span> {item.productionCompanies.join(' · ')}</span>}
              {item.composer && <span><span className="crew-role">Score</span> {item.composer}</span>}
            </div>
          )}
          {item.cast && item.cast.length > 0 && (
            <div className="reader-cast">
              <span className="reader-cast-label">Cast</span>
              <span>{item.cast.map((a, i) => <React.Fragment key={a}>{i > 0 && ' · '}<span className="meta-link" onClick={() => onFilter && onFilter(`actor:${a}`)}>{a}</span></React.Fragment>)}</span>
            </div>
          )}
          {item.tags && item.tags.length > 0 && (
            <div className="reader-tags">
              {item.tags.map(t => <span key={t} className="reader-tag meta-link" onClick={() => onFilter && onFilter(`tag:${t}`)}>{t}</span>)}
            </div>
          )}
          {item.highlights && item.highlights.filter(h => HIGHLIGHTS[h]).length > 0 && (
            <div className="reader-highlights">
              {item.highlights.filter(h => HIGHLIGHTS[h]).map(h => (
                <span key={h} className="reader-highlight meta-link" onClick={() => onFilter && onFilter(`highlight:${h}`)}>
                  <span className="rh-emoji">{HIGHLIGHTS[h].emoji}</span>{HIGHLIGHTS[h].label}
                </span>
              ))}
            </div>
          )}
          <div className="reader-adjacent">
            <div className="lbl">More like this</div>
            <DragScroll className="row">
              {adjacent.map(a => (
                <a key={a.id} onClick={() => onJump(a)} title={`${displayTitle(a)} (${a.year})`}>
                  {(a.poster || a.tmdbPoster || a.igdbCover || a.bookCover)
                    ? <img src={a.poster || a.tmdbPoster || a.igdbCover || a.bookCover} alt=""/>
                    : <span className="thumb-fallback" style={{ '--pf-bg': spineBodyColor(a) }}>{MEDIA_GLYPH[a.medium]}</span>}
                </a>
              ))}
            </DragScroll>
          </div>
          {crossover.length > 0 && (
            <div className="reader-adjacent reader-crossover">
              <div className="lbl">{crossoverLabel}</div>
              <DragScroll className="row">
                {crossover.map(a => (
                  <a key={a.id} className="crossover-thumb" onClick={() => onJump(a)} title={`${displayTitle(a)} (${a.year})`}>
                    {(a.poster || a.tmdbPoster || a.igdbCover || a.bookCover)
                      ? <img src={a.poster || a.tmdbPoster || a.igdbCover || a.bookCover} alt=""/>
                      : <span className="thumb-fallback" style={{ '--pf-bg': spineBodyColor(a) }}>{MEDIA_GLYPH[a.medium]}</span>}
                    <span className="crossover-badge" title={library === 'wishlist' ? 'Already seen' : 'On your wishlist'}>{crossoverBadge}</span>
                  </a>
                ))}
              </DragScroll>
            </div>
          )}
          <div className="reader-actions">
            <ReaderSourceButton item={item} />
            <button className="reader-btn" onClick={close}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────── SearchPalette (summon with "/" or Cmd/Ctrl-K) ───────────
// A centered search/filter overlay you can pop from anywhere. Writes the same
// `search` state the header input uses, so the token grammar all works here too.
function SearchPalette({ initial, onApply, onClose }) {
  const [v, setV] = React.useState(initial || '');
  const ref = React.useRef(null);
  React.useEffect(() => { if (ref.current) ref.current.focus(); }, []);
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={(e) => { e.preventDefault(); onApply(v); }}>
          <input
            ref={ref}
            className="palette-input"
            value={v}
            onChange={(e) => setV(e.target.value)}
            placeholder="Search or filter…  e.g. genre:Horror dp:Deakins r:8+"
          />
        </form>
        <div className="palette-hints">
          <code>:title</code><code>genre:</code><code>director:</code><code>actor:</code><code>tag:</code>
          <code>highlight:</code><code>on:</code><code>@year</code><code>r:8+</code>
          <span className="palette-enter">↵ apply · esc close</span>
        </div>
      </div>
    </div>
  );
}

// ─────────── App ───────────
function App() {
  const { MEDIA, PICKABLE_IDS } = window.CULTURE;
  // The SEEN library: favourites (data.js) + imports, merged with cast/season data.
  const seenItems = React.useMemo(() => {
    const seasons  = window.CULTURE_SEASONS || {};
    const castData = window.CULTURE_CAST    || {};
    const favs = window.CULTURE.ITEMS.map(i => {
      if (seasons[i.id] && !i.seasons) return { ...i, seasons: seasons[i.id] };
      return i;
    });
    const all = favs.concat(window.CULTURE_IMPORTS || []);
    const hasCast = Object.keys(castData).length > 0;
    const merged = hasCast ? all.map(item => castData[item.id] ? { ...item, ...castData[item.id] } : item) : all;
    return merged.map(enrichExtras);
  }, []);
  // The WISHLIST (unseen) — wishlist.js merged with its own enrichment file.
  const wishlistItems = React.useMemo(() => {
    const list = window.CULTURE_WISHLIST      || [];
    const cast = window.CULTURE_WISHLIST_CAST || {};
    const hasCast = Object.keys(cast).length > 0;
    const merged = hasCast ? list.map(item => cast[item.id] ? { ...item, ...cast[item.id] } : item) : list;
    return merged.map(enrichExtras);
  }, []);
  // Which collection is on screen. 'library' = seen, 'wishlist' = to-consume.
  const [library, setLibrary] = React.useState('library');
  const ITEMS = library === 'wishlist' ? wishlistItems : seenItems;
  // Foot-of-spine number: personal score in the Library, rounded Filmweb avg in
  // the Wishlist (which has no personal scores). Not user-toggleable on the main page.
  const spineValue = library === 'wishlist' ? 'fwAvg' : 'rating';
  const [openItem, setOpenItem] = React.useState(null);
  const [justPickedId, setJustPickedId] = React.useState(null);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [pickedSet, setPickedSet] = React.useState(() => new Set());
  const [mode, setMode] = React.useState('covers');
  const [sort, setSort] = React.useState('curated');
  const [sortDir, setSortDir] = React.useState('desc');
  const [mixSeed, setMixSeed] = React.useState(1);
  const [spinning, setSpinning] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [selectedRatedYears, setSelectedRatedYears] = React.useState(() => new Set());
  const [showSearchHint, setShowSearchHint] = React.useState(false);
  const [statsOpen, setStatsOpen] = React.useState(false);
  const [selectedRatings, setSelectedRatings] = React.useState(() => new Set());
  const [selectedDirectors, setSelectedDirectors] = React.useState(() => new Set());
  const [selectedStudios, setSelectedStudios] = React.useState(() => new Set());
  const [selectedWeeks, setSelectedWeeks] = React.useState(() => new Set());
  const [selectedCountries, setSelectedCountries] = React.useState(() => new Set());
  const [selectedGenres, setSelectedGenres] = React.useState(() => new Set());
  const [selectedActors, setSelectedActors] = React.useState(() => new Set());
  const [selectedWriters, setSelectedWriters] = React.useState(() => new Set());
  const [selectedCinematographers, setSelectedCinematographers] = React.useState(() => new Set());
  // Wishlist bottom strip: filter by release-year bucket (5-yr blocks ≥1980, decades before).
  const [selectedReleaseBuckets, setSelectedReleaseBuckets] = React.useState(() => new Set());
  // Standout-badge filter (highlight keys).
  const [selectedHighlights, setSelectedHighlights] = React.useState(() => new Set());

  // Scroll lock for the Reader modal. (Popup lock is owned by Popup itself.)
  React.useEffect(() => {
    if (!openItem) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [openItem]);

  // ── Shareable URL state ── encode collection / search / open-item in the hash,
  // e.g.  #/wishlist?q=genre:Horror&open=imp-f-1234  — restore it on load.
  const didInitUrl = React.useRef(false);
  React.useEffect(() => {
    didInitUrl.current = true;
    const raw = window.location.hash.replace(/^#\/?/, '');
    if (!raw) return;
    const [path, query] = raw.split('?');
    const params = new URLSearchParams(query || '');
    const lib = path === 'wishlist' ? 'wishlist' : 'library';
    if (lib === 'wishlist') { setLibrary('wishlist'); setMode('spines'); setSort('priority'); }
    const q = params.get('q'); if (q) setSearch(q);
    const openId = params.get('open');
    if (openId) {
      const pool = lib === 'wishlist' ? wishlistItems : seenItems;
      const found = pool.find(i => i.id === openId);
      if (found) setOpenItem(found);
    }
  }, []);   // mount only
  const firstUrlWrite = React.useRef(true);
  React.useEffect(() => {
    if (firstUrlWrite.current) { firstUrlWrite.current = false; return; }  // don't clobber the restored hash
    const params = new URLSearchParams();
    if (search.trim()) params.set('q', search.trim());
    if (openItem) params.set('open', openItem.id);
    const qs = params.toString();
    const hash = `#/${library}${qs ? '?' + qs : ''}`;
    if (hash !== window.location.hash) history.replaceState(null, '', hash);
  }, [library, search, openItem]);

  // ── Summon search ── "/" or Cmd/Ctrl-K opens the palette from anywhere.
  React.useEffect(() => {
    const onKey = (e) => {
      const el = e.target;
      const typing = el && (/(input|textarea|select)/i.test(el.tagName || '') || el.isContentEditable);
      if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Clear the transient "just-picked" pose after a beat so the cover settles
  // back into the row. The persistent red dot is owned by `pickedSet`.
  React.useEffect(() => {
    if (!justPickedId) return;
    const t = setTimeout(() => setJustPickedId(null), 5000);
    return () => clearTimeout(t);
  }, [justPickedId]);

  const shelves = MEDIA.map(m => ({ medium: m, items: ITEMS.filter(i => i.medium === m) }));

  // Shelves after text / @year / y:year / in:year / r: filters — but NOT yet chip or stats filters.
  const preChipShelves = React.useMemo(() => {
    const { text, title, releaseYear, ratedYear, ratingFilter, genres, actors, directors, tags, studios, writers, dps, regions, highlights, providers } = parseQuery(search);
    const q = text.toLowerCase();
    const titleHit = (it, qq) => it.title.toLowerCase().includes(qq)
      || (it.enTitle && it.enTitle.toLowerCase().includes(qq))
      || (it.polishTitle && it.polishTitle.toLowerCase().includes(qq));
    return shelves.map(s => ({
      ...s,
      items: s.items.filter(it => {
        if (title.length && !title.every(qq => titleHit(it, qq))) return false;
        if (releaseYear.length && !releaseYear.includes(String(it.year))) return false;
        if (ratedYear.length   && (!it.watchedDate || !ratedYear.includes(it.watchedDate.slice(0, 4)))) return false;
        if (ratingFilter.length && !ratingFilter.includes(it.rating)) return false;
        if (genres.length    && !(it.genres    && genres.every(q    => it.genres.some(g => g.toLowerCase().includes(q))))) return false;
        if (actors.length    && !(it.cast      && actors.every(q    => it.cast.some(a => a.toLowerCase().includes(q))))) return false;
        if (directors.length && !(it.director  && directors.every(q => it.director.toLowerCase().includes(q)))) return false;
        if (tags.length      && !(it.tags      && tags.every(q      => it.tags.some(t => t.toLowerCase().includes(q))))) return false;
        if (studios.length   && !(it.studio    && studios.every(q   => it.studio.toLowerCase().includes(q)))) return false;
        if (writers.length   && !(it.writer    && writers.every(q   => it.writer.toLowerCase().includes(q)))) return false;
        if (dps.length       && !(it.cinematographer && dps.every(q => it.cinematographer.toLowerCase().includes(q)))) return false;
        if (regions.length   && !(regionName(it.region) && regions.every(q => regionName(it.region).toLowerCase().includes(q)))) return false;
        if (highlights.length && !(it.highlights && highlights.every(q => it.highlights.some(h => h === q || (HIGHLIGHTS[h] && HIGHLIGHTS[h].label.toLowerCase().includes(q)))))) return false;
        if (providers.length && !(it.providers && providers.every(q => it.providers.some(p => p.toLowerCase().includes(q))))) return false;
        if (!q) return true;
        return (
          it.title.toLowerCase().includes(q) ||
          (it.enTitle         && it.enTitle.toLowerCase().includes(q))         ||
          (it.polishTitle     && it.polishTitle.toLowerCase().includes(q))     ||
          (it.director        && it.director.toLowerCase().includes(q))        ||
          (it.studio          && it.studio.toLowerCase().includes(q))          ||
          (it.writer          && it.writer.toLowerCase().includes(q))          ||
          (it.cinematographer && it.cinematographer.toLowerCase().includes(q)) ||
          (it.composer        && it.composer.toLowerCase().includes(q))        ||
          (it.cast && it.cast.some(a => a.toLowerCase().includes(q)))          ||
          (it.tags && it.tags.some(t => t.toLowerCase().includes(q)))          ||
          (it.productionCompanies && it.productionCompanies.some(c => c.toLowerCase().includes(q))) ||
          (it.genres && it.genres.some(g => g.toLowerCase().includes(q)))      ||
          (it.igdbGenres && it.igdbGenres.toLowerCase().includes(q))           ||
          (regionName(it.region) && regionName(it.region).toLowerCase().includes(q))
        );
      }),
    }));
  }, [shelves, search]);

  // Apply chip + stats filters on top.
  const filteredShelves = React.useMemo(() => {
    let base = selectedRatedYears.size === 0
      ? preChipShelves
      : preChipShelves.map(s => ({
          ...s,
          items: s.items.filter(it => it.watchedDate && selectedRatedYears.has(it.watchedDate.slice(0, 4))),
        }));
    if (selectedReleaseBuckets.size) {
      base = base.map(s => ({
        ...s,
        items: s.items.filter(it => selectedReleaseBuckets.has(releaseBucketKey(it.year))),
      }));
    }
    const hasStats = selectedRatings.size || selectedDirectors.size || selectedStudios.size || selectedWeeks.size || selectedCountries.size
                   || selectedGenres.size || selectedActors.size || selectedWriters.size || selectedCinematographers.size
                   || selectedHighlights.size;
    if (!hasStats) return base.filter(s => s.items.length > 0);
    return base.map(s => ({
      ...s,
      items: s.items.filter(it => {
        if (selectedRatings.size   && !selectedRatings.has(it.rating))    return false;
        if (selectedDirectors.size && !selectedDirectors.has(it.director)) return false;
        if (selectedStudios.size   && !selectedStudios.has(it.studio))     return false;
        if (selectedCountries.size) {
          const eff = it.region === 'su' ? 'ru' : it.region;
          if (!selectedCountries.has(eff)) return false;
        }
        if (selectedWeeks.size) {
          if (!it.watchedDate) return false;
          const w = getWeekOfYear(it.watchedDate);
          const wk = `${it.watchedDate.slice(0,4)}-W${String(w).padStart(2,'0')}`;
          if (!selectedWeeks.has(wk)) return false;
        }
        if (selectedGenres.size) {
          const ig = it.igdbGenres ? it.igdbGenres.split(', ') : [];
          if (![...(it.genres || []), ...ig].some(g => selectedGenres.has(g))) return false;
        }
        if (selectedActors.size         && !(it.cast           && it.cast.some(a => selectedActors.has(a)))) return false;
        if (selectedWriters.size        && !(it.writer         && selectedWriters.has(it.writer))) return false;
        if (selectedCinematographers.size && !(it.cinematographer && selectedCinematographers.has(it.cinematographer))) return false;
        if (selectedHighlights.size && !(it.highlights && it.highlights.some(h => selectedHighlights.has(h)))) return false;
        return true;
      }),
    })).filter(s => s.items.length > 0);
  }, [preChipShelves, selectedRatedYears, selectedReleaseBuckets, selectedRatings, selectedDirectors, selectedStudios, selectedWeeks, selectedCountries,
      selectedGenres, selectedActors, selectedWriters, selectedCinematographers, selectedHighlights]);

  const totalSearchResults = React.useMemo(
    () => filteredShelves.reduce((n, s) => n + s.items.length, 0),
    [filteredShelves]
  );

  // All years that appear as watchedDate across the full library, newest first.
  const allRatedYears = React.useMemo(() => {
    const yrs = new Set();
    ITEMS.forEach(it => { if (it.watchedDate) yrs.add(it.watchedDate.slice(0, 4)); });
    return [...yrs].sort((a, b) => b.localeCompare(a));
  }, [ITEMS]);

  // Which of those years have matching items given the current preChip filters.
  const availableRatedYears = React.useMemo(() => {
    const yrs = new Set();
    preChipShelves.forEach(s => s.items.forEach(it => {
      if (it.watchedDate) yrs.add(it.watchedDate.slice(0, 4));
    }));
    return yrs;
  }, [preChipShelves]);

  const toggleRatedYear = (yr) => setSelectedRatedYears(prev => {
    const next = new Set(prev); next.has(yr) ? next.delete(yr) : next.add(yr); return next;
  });

  // Release-year buckets for the Wishlist bottom strip (newest-first).
  const allReleaseBuckets = React.useMemo(() => {
    const keys = new Set();
    ITEMS.forEach(it => { const k = releaseBucketKey(it.year); if (k) keys.add(k); });
    return [...keys].sort((a, b) => releaseBucketStart(b) - releaseBucketStart(a));
  }, [ITEMS]);
  const availableReleaseBuckets = React.useMemo(() => {
    const keys = new Set();
    preChipShelves.forEach(s => s.items.forEach(it => { const k = releaseBucketKey(it.year); if (k) keys.add(k); }));
    return keys;
  }, [preChipShelves]);
  const toggleReleaseBucket = (k) => setSelectedReleaseBuckets(prev => {
    const next = new Set(prev); next.has(k) ? next.delete(k) : next.add(k); return next;
  });
  const toggleRating    = r => setSelectedRatings(prev   => { const n = new Set(prev); n.has(r) ? n.delete(r) : n.add(r); return n; });
  const toggleDirector  = d => setSelectedDirectors(prev => { const n = new Set(prev); n.has(d) ? n.delete(d) : n.add(d); return n; });
  const toggleStudio    = s => setSelectedStudios(prev   => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });
  const toggleWeek      = w => setSelectedWeeks(prev     => { const n = new Set(prev); n.has(w) ? n.delete(w) : n.add(w); return n; });
  const toggleCountry   = c => setSelectedCountries(prev => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; });
  const toggleGenre     = g => setSelectedGenres(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });
  const toggleActor     = a => setSelectedActors(prev => { const n = new Set(prev); n.has(a) ? n.delete(a) : n.add(a); return n; });
  const toggleWriter    = w => setSelectedWriters(prev => { const n = new Set(prev); n.has(w) ? n.delete(w) : n.add(w); return n; });
  const toggleCinematographer = c => setSelectedCinematographers(prev => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; });
  const toggleHighlight = h => setSelectedHighlights(prev => { const n = new Set(prev); n.has(h) ? n.delete(h) : n.add(h); return n; });
  const clearStatsFilters = () => {
    setSelectedRatings(new Set()); setSelectedDirectors(new Set()); setSelectedStudios(new Set());
    setSelectedWeeks(new Set()); setSelectedCountries(new Set());
    setSelectedGenres(new Set()); setSelectedActors(new Set()); setSelectedWriters(new Set()); setSelectedCinematographers(new Set());
    setSelectedReleaseBuckets(new Set());
    setSelectedHighlights(new Set());
  };

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

  // Flick between the seen Library and the unseen Wishlist. The wishlist has no
  // curated cover art and no "curated" rank, so default it to Spines + Priority;
  // restore the Library's curated Covers view on the way back.
  const switchLibrary = (lib) => {
    if (lib === library) return;
    setLibrary(lib);
    clearStatsFilters();
    setSelectedRatedYears(new Set());
    if (lib === 'wishlist') { setMode('spines'); setSort('priority'); }
    else                    { setMode('covers'); setSort('curated'); }
  };

  // When a search/chip filter becomes active, collapse to Spines so the layout can't
  // hide matches (sort changes don't count). Fires only on the off→on edge, so a
  // manual mode switch while a filter is active is left alone. (Mix stays available.)
  const anyFilter = !!(search.trim() || selectedRatings.size || selectedDirectors.size ||
    selectedStudios.size || selectedWeeks.size || selectedCountries.size || selectedGenres.size ||
    selectedActors.size || selectedWriters.size || selectedCinematographers.size ||
    selectedHighlights.size || selectedRatedYears.size || selectedReleaseBuckets.size);
  const prevFilterRef = React.useRef(false);
  React.useEffect(() => {
    if (anyFilter && !prevFilterRef.current && mode === 'covers') setMode('spines');
    prevFilterRef.current = anyFilter;
  }, [anyFilter, mode]);

  return (
    <div className="page">
      <header className="site-head">
        <div>
          <h1>Culture<span className="dot">.</span></h1>
          <div className="meta">
            {library === 'wishlist' ? 'What I want to watch, play & read next' : 'A library of what shaped me'}
            <span className="sep"/>
            <b>{ITEMS.length}</b>&nbsp;entries
            <span className="sep"/>
            <b>{new Set(ITEMS.map(i => i.medium)).size}</b>&nbsp;shelves
            <span className="sep"/>
            {library === 'wishlist' ? 'most-wanted in the middle, outward by priority' : 'best in the middle, outward by rank'}
          </div>
        </div>
        <div className="right">
          <div className="tagline">
            {/*Things I watched, read and played.*/}
          </div>
          <div className="btn-row">
            <div className="library-toggle">
              <button data-active={library === 'library'}  onClick={() => switchLibrary('library')}>Library</button>
              <button data-active={library === 'wishlist'} onClick={() => switchLibrary('wishlist')}>Wishlist</button>
            </div>
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
              {library === 'wishlist' && <option value="priority">Priority</option>}
              <option value="curated">Curated</option>
              <option value="az">A–Z</option>
              <option value="year">Release date</option>
              <option value="rated">Date rated</option>
              <option value="director">Director / Creator</option>
              <option value="studio">Studio / Network</option>
              <option value="country">Country</option>
              <option value="rating">Rating</option>
              <option value="duration">Duration</option>
            </select>
            <button
              className="sort-dir-btn"
              disabled={sort === 'curated'}
              onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
              aria-label={(SORT_DIR_LABEL[sort] || ['Descending', 'Ascending'])[sortDir === 'desc' ? 0 : 1]}
              title={`${(SORT_DIR_LABEL[sort] || ['Descending', 'Ascending'])[sortDir === 'desc' ? 0 : 1]} — click to reverse`}
            >
              {sortDir === 'desc' ? '←' : '→'}
            </button>
            <button className="btn-stats" onClick={() => setStatsOpen(true)}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="8" width="3" height="8" rx="0.5" fill="currentColor"/>
                <rect x="6.5" y="5" width="3" height="11" rx="0.5" fill="currentColor"/>
                <rect x="12" y="2" width="3" height="14" rx="0.5" fill="currentColor"/>
              </svg>
              Stats
            </button>
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
          <div className="search-row">
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
            <button
              className="search-hint-btn"
              data-active={showSearchHint}
              onClick={() => setShowSearchHint(h => !h)}
              title="Search syntax"
            >?</button>
            {showSearchHint && (
              <div className="search-hint-popover">
                <div className="search-hint-row"><code>:alien</code> or <code>title:alien</code><span>— match the title only</span></div>
                <div className="search-hint-row"><code>genre:Thriller</code><span>— match by genre</span></div>
                <div className="search-hint-row"><code>actor:Name</code><span>— match by cast</span></div>
                <div className="search-hint-row"><code>director:Name</code> <code>writer:Name</code> <code>dp:Name</code><span>— crew</span></div>
                <div className="search-hint-row"><code>tag:Name</code> <code>studio:Name</code> <code>region:Poland</code><span>— other fields</span></div>
                <div className="search-hint-row"><code>highlight:Brutal</code> or <code>badge:gem</code><span>— standout badges</span></div>
                <div className="search-hint-row"><code>on:Netflix</code><span>— where to watch (wishlist)</span></div>
                <div className="search-hint-row"><code>@2023</code> or <code>y:2023</code><span>— filter by release year</span></div>
                <div className="search-hint-row"><code>in:2023</code><span>— filter by year rated</span></div>
                <div className="search-hint-row"><code>r:10</code> <code>r:8+</code> <code>r:7-9</code><span>— filter by rating</span></div>
                <div className="search-hint-row"><span>plain text — title, director, studio, genre wildcard</span></div>
                <div className="search-hint-row"><span style={{color:'var(--ink-faint)'}}>tokens stack: <code>genre:Horror dp:Deakins r:8+</code></span></div>
              </div>
            )}
          </div>
        </div>
      </header>

{/*      <div className="intro">
        Hover any item to fan a cover open and read its note. Click to open the full entry,
        drag the row sideways to browse the rest. Each shelf is curated <b>best-in-the-middle</b>
        — most-loved at the centre, descending outwards. The <b>Pick one for me</b> button taps
        a hand-picked pool; flipped items keep a small red mark.
      </div>*/}

      {search.trim() && (
        <div className="search-results-msg">
          <b>{totalSearchResults}</b> result{totalSearchResults !== 1 ? 's' : ''} for &ldquo;{search.trim()}&rdquo;
          <button onClick={() => setSearch('')}>clear</button>
        </div>
      )}

      {(selectedRatings.size > 0 || selectedDirectors.size > 0 || selectedStudios.size > 0 || selectedWeeks.size > 0 || selectedCountries.size > 0
        || selectedGenres.size > 0 || selectedActors.size > 0 || selectedWriters.size > 0 || selectedCinematographers.size > 0
        || selectedHighlights.size > 0) && (
        <div className="active-filters">
          {[...selectedRatings].sort().map(r => (
            <span key={r} className="filter-pill">★{r}<button onClick={() => toggleRating(r)}>×</button></span>
          ))}
          {[...selectedHighlights].map(h => (
            <span key={h} className="filter-pill">{HIGHLIGHTS[h] ? `${HIGHLIGHTS[h].emoji} ${HIGHLIGHTS[h].label}` : h}<button onClick={() => toggleHighlight(h)}>×</button></span>
          ))}
          {[...selectedDirectors].map(d => (
            <span key={d} className="filter-pill">{d}<button onClick={() => toggleDirector(d)}>×</button></span>
          ))}
          {[...selectedActors].map(a => (
            <span key={a} className="filter-pill">{a}<button onClick={() => toggleActor(a)}>×</button></span>
          ))}
          {[...selectedWriters].map(w => (
            <span key={w} className="filter-pill">{w}<button onClick={() => toggleWriter(w)}>×</button></span>
          ))}
          {[...selectedCinematographers].map(c => (
            <span key={c} className="filter-pill">{c}<button onClick={() => toggleCinematographer(c)}>×</button></span>
          ))}
          {[...selectedStudios].map(s => (
            <span key={s} className="filter-pill">{s}<button onClick={() => toggleStudio(s)}>×</button></span>
          ))}
          {[...selectedGenres].map(g => (
            <span key={g} className="filter-pill">{g}<button onClick={() => toggleGenre(g)}>×</button></span>
          ))}
          {[...selectedCountries].map(c => (
            <span key={c} className="filter-pill">{REGION_NAMES[c] || c}<button onClick={() => toggleCountry(c)}>×</button></span>
          ))}
          {[...selectedWeeks].sort().map(w => (
            <span key={w} className="filter-pill">{w}<button onClick={() => toggleWeek(w)}>×</button></span>
          ))}
          <button className="filter-pill-clear" onClick={clearStatsFilters}>clear all</button>
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
          sortDir={sortDir}
          mixSeed={mixSeed}
          onOpenItem={setOpenItem}
          justPickedId={justPickedId}
          pickedSet={pickedSet}
          spineValue={spineValue}
        />
      ))}

      {search.trim() && filteredShelves.length === 0 && (
        <div className="search-results-msg" style={{ marginTop: 48 }}>
          No results for &ldquo;{search.trim()}&rdquo;.
          <button onClick={() => setSearch('')}>clear</button>
        </div>
      )}

      {library === 'wishlist' ? (
        <div className="yr-chips-section">
          <div className="yr-chips-label">Released</div>
          <div className="yr-chips-scroll">
            {allReleaseBuckets.map(k => {
              const sel  = selectedReleaseBuckets.has(k);
              const avail = availableReleaseBuckets.has(k);
              return (
                <button
                  key={k}
                  className={`yr-chip${sel ? ' selected' : !avail ? ' unavailable' : ''}`}
                  onClick={() => toggleReleaseBucket(k)}
                >
                  {releaseBucketLabel(k)}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="yr-chips-section">
          <div className="yr-chips-label">Rated in</div>
          <div className="yr-chips-scroll">
            {allRatedYears.map(yr => {
              const sel  = selectedRatedYears.has(yr);
              const avail = availableRatedYears.has(yr);
              return (
                <button
                  key={yr}
                  className={`yr-chip${sel ? ' selected' : !avail ? ' unavailable' : ''}`}
                  onClick={() => toggleRatedYear(yr)}
                >
                  {yr}
                </button>
              );
            })}
          </div>
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
        <Reader item={openItem} onClose={() => setOpenItem(null)} onJump={(it) => setOpenItem(it)}
          allItems={ITEMS}
          otherItems={library === 'wishlist' ? seenItems : wishlistItems}
          library={library}
          onFilter={(val) => {
            const m = val.match(/^(\w+):(.+)$/i);
            if (m) {
              const type = m[1].toLowerCase(), value = m[2];
              if (type === 'genre')                                { toggleGenre(value); setOpenItem(null); return; }
              if (type === 'actor' || type === 'cast')             { toggleActor(value); setOpenItem(null); return; }
              if (type === 'director' || type === 'dir')           { toggleDirector(value); setOpenItem(null); return; }
              if (type === 'studio')                               { toggleStudio(value); setOpenItem(null); return; }
              if (type === 'writer' || type === 'author')          { toggleWriter(value); setOpenItem(null); return; }
              if (type === 'dp' || type === 'cin')                 { toggleCinematographer(value); setOpenItem(null); return; }
              if (type === 'region' || type === 'country')         { toggleCountry(value); setOpenItem(null); return; }
              if (type === 'highlight')                            { toggleHighlight(value); setOpenItem(null); return; }
            }
            setSearch(val); setOpenItem(null);
          }} />
      )}

      {statsOpen && (
        <StatsModal
          allItems={ITEMS}
          library={library}
          seenItemsForTaste={seenItems}
          onClose={() => setStatsOpen(false)}
          onOpenItem={(it) => { setStatsOpen(false); setOpenItem(it); }}
          selectedRatings={selectedRatings}             onToggleRating={toggleRating}
          selectedDirectors={selectedDirectors}         onToggleDirector={toggleDirector}
          selectedStudios={selectedStudios}             onToggleStudio={toggleStudio}
          selectedWeeks={selectedWeeks}                 onToggleWeek={toggleWeek}
          selectedCountries={selectedCountries}         onToggleCountry={toggleCountry}
          selectedActors={selectedActors}               onToggleActor={toggleActor}
          selectedWriters={selectedWriters}             onToggleWriter={toggleWriter}
          selectedCinematographers={selectedCinematographers} onToggleCinematographer={toggleCinematographer}
          selectedHighlights={selectedHighlights}       onToggleHighlight={toggleHighlight}
        />
      )}

      {paletteOpen && (
        <SearchPalette
          initial={search}
          onApply={(v) => { setSearch(v); setPaletteOpen(false); }}
          onClose={() => setPaletteOpen(false)}
        />
      )}
    </div>
  );
}

window.CultureApp = App;
