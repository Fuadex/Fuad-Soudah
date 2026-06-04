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
  };
  const result = {
    text: '', releaseYear: [], ratedYear: [], ratingFilter: [],
    genres: [], actors: [], directors: [], tags: [], studios: [],
    writers: [], dps: [], regions: [],
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
    const atY = tok.match(/^@(\d{4})$/);
    const yY  = tok.match(/^y:(\d{4})$/i);
    const inY = tok.match(/^in:(\d{4})$/i);
    const rEx = tok.match(/^r:(\d+)(?:([+])|[-](\d+))?$/i);
    if      (atY) result.releaseYear.push(atY[1]);
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
  344:'hk', 156:'cn',
};

// Per-medium color hue for the choropleth
const MEDIUM_MAP_HUE = {
  'All':'#e96846', 'Film':'#e96846', 'Animated Film':'#c084fc',
  'Animated Series':'#60a5fa', 'Shorts':'#34d399',
  'TV':'#fbbf24', 'Games':'#f472b6', 'Books':'#86efac',
};

let _topoCache = null;

// ─────────── RatingHistogram ───────────
function RatingHistogram({ items, selectedRatings, onToggle }) {
  const counts = React.useMemo(() => countBy(items, it => it.rating), [items]);
  const max = Math.max(1, ...Object.values(counts));
  return (
    <div className="rating-hist">
      {[1,2,3,4,5,6,7,8,9,10].map(n => {
        const s = String(n);
        const c = counts[s] || 0;
        const active = selectedRatings.has(s);
        return (
          <div key={n} className={`rating-col${active ? ' active' : ''}`} onClick={() => onToggle(s)} title={`${c} items`}>
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
function HBarHistogram({ items, keyFn, countFn, selected, onToggle, limit = 25 }) {
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
        return (
          <div key={name} className={`hbar-row${active ? ' active' : ''}`} onClick={() => onToggle(name)} title={name}>
            <div className="hbar-name">{name}</div>
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
function ActivityHeatmap({ items, selectedWeeks, onToggleWeek }) {
  const [tip, setTip] = React.useState(null);

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
        <div style={{ display:'flex', gap:'2px', marginBottom:'4px', paddingLeft:'36px' }}>
          {WEEK_LABELS.map((m, i) => (
            <div key={i} style={{ width:'11px', flexShrink:0, fontFamily:'var(--mono)', fontSize:'8px', color:'var(--ink-faint)', textAlign:'center' }}>{m}</div>
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
                    style={{ background: count ? `rgba(233,104,70,${alpha})` : undefined }}
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

  const hue = MEDIUM_MAP_HUE[medium] || MEDIUM_MAP_HUE['All'];

  if (!topo) return <div style={{ height:300, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--ink-faint)', fontFamily:'var(--mono)', fontSize:11 }}>Loading map…</div>;

  const d3 = window.d3, tj = window.topojson;
  const W = 960, H = 500;
  const projection = d3.geoNaturalEarth1().scale(153).translate([W/2, H/2]);
  const pathGen = d3.geoPath().projection(projection);
  const countries = tj.feature(topo, topo.objects.countries);

  return (
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
          if (isoNum === 10) return null;
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
  );
}

// ─────────── StatsModal ───────────
function StatsModal({ allItems, onClose, selectedRatings, onToggleRating, selectedDirectors, onToggleDirector, selectedStudios, onToggleStudio, selectedWeeks, onToggleWeek, selectedCountries, onToggleCountry, selectedActors, onToggleActor, selectedWriters, onToggleWriter, selectedCinematographers, onToggleCinematographer }) {
  const { MEDIA } = window.CULTURE;
  const LEFT_VIEW_LABELS  = { directors: 'Directors', actors: 'Actors', writers: 'Writers', cinematographers: 'Cinematographers', animationDirectors: 'Animation Directors' };
  const RIGHT_VIEW_LABELS = { studios: 'Studios', companies: 'Production Companies', composers: 'Composers' };
  const [medium, setMedium] = React.useState('All');
  const [leftView, setLeftView] = React.useState('directors');
  const [rightView, setRightView] = React.useState('studios');
  const [on, setOn] = React.useState(false);
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
        <div className="stats-medium-tabs">
          {['All', ...MEDIA].map(m => (
            <button key={m} className={`stats-medium-tab${medium === m ? ' active' : ''}`} onClick={() => setMedium(m)}>{m}</button>
          ))}
        </div>

        <div className="stats-section">
          <div className="stats-section-title">Rating distribution — click bars to filter library</div>
          <RatingHistogram items={statItems} selectedRatings={selectedRatings} onToggle={onToggleRating} />
        </div>

        <div className="stats-two-col">
          <div className="stats-section">
            <div className="stats-view-head">
              <div className="stats-section-title">{LEFT_VIEW_LABELS[leftView]}</div>
              <label className="stats-view-chevron">▾<select value={leftView} onChange={e => setLeftView(e.target.value)} className="stats-view-select-overlay">
                <option value="directors">Directors · Creators · Authors</option>
                <option value="actors">Actors</option>
                <option value="writers">Writers · Screenwriters</option>
                <option value="cinematographers">Cinematographers</option>
                <option value="animationDirectors">Animation Directors</option>
              </select></label>
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
              <div className="stats-section-title">{RIGHT_VIEW_LABELS[rightView]}</div>
              <label className="stats-view-chevron">▾<select value={rightView} onChange={e => setRightView(e.target.value)} className="stats-view-select-overlay">
                <option value="studios">Studios · Networks · Publishers</option>
                <option value="companies">Production Companies</option>
                <option value="composers">Composers</option>
              </select></label>
            </div>
            {rightView === 'studios'   && <HBarHistogram items={statItems} keyFn={it => it.studio} selected={selectedStudios} onToggle={onToggleStudio} />}
            {rightView === 'companies' && <HBarHistogram items={statItems}
                countFn={its => { const m = {}; its.forEach(it => (it.productionCompanies||[]).forEach(c => { m[c] = (m[c]||0)+1; })); return m; }}
                selected={new Set()} onToggle={() => {}} />}
            {rightView === 'composers' && <HBarHistogram items={statItems} keyFn={it => it.composer || null} selected={new Set()} onToggle={() => {}} />}
          </div>
        </div>

        <div className="stats-section">
          <div className="stats-section-title">Activity heatmap — click weeks to filter library</div>
          <ActivityHeatmap items={statItems} selectedWeeks={selectedWeeks} onToggleWeek={onToggleWeek} />
        </div>

        <div className="stats-section" style={{ marginBottom: 0 }}>
          <div className="stats-section-title">Country breakdown — click to filter library</div>
          <WorldMap items={statItems} selectedCountries={selectedCountries} onToggleCountry={onToggleCountry} medium={medium} />
        </div>
      </div>
    </div>
  );
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
function sortItems(arr, sort, dir) {
  const byTitle = (a, b) => a.title.localeCompare(b.title);
  const list = [...arr];
  if (sort === 'az')           list.sort(byTitle);
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

// ─────────── Shelf row ───────────
function ShelfRow({ medium, items, idx, mode, sort, sortDir, mixSeed, onOpenItem, justPickedId, pickedSet }) {
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
    // Covers shows only favorites; spines / mix show the whole library.
    // If a shelf has no favorites at all, fall back to all items (rendered as spines).
    const base = mode === 'covers'
      ? (items.some(i => i.favorite) ? items.filter(i => i.favorite) : items)
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
    if (!item.favorite) return true;        // imports never expand into covers
    if (mode === 'covers') return false;
    if (item._rank === 0) return false;
    return (hash(item.id, mixSeed) % 3) !== 0;
  }, [mode, mixSeed]);

  // ── Drag-scroll: window-tracked, with click suppression + inertial flick ──
  // Move/up live on `window` so a drag keeps going even when the cursor leaves
  // the row, and a fast release coasts to a stop instead of stopping dead.
  const dragRef = React.useRef({ down: false, startX: 0, startSL: 0, moved: false, lastX: 0, lastT: 0, vx: 0 });
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
    dragRef.current = { down: true, startX: e.clientX, startSL: el.scrollLeft, moved: false,
                        lastX: e.clientX, lastT: performance.now(), vx: 0 };
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
      if (d.moved) {
        el.scrollLeft = d.startSL - dx;
        const now = performance.now();
        const dt = now - d.lastT;
        if (dt > 0) {
          // scrollLeft velocity (px/ms); scroll moves opposite to the cursor
          const inst = -(e.clientX - d.lastX) / dt;
          d.vx = 0.8 * inst + 0.2 * d.vx;   // smoothed so a jittery last frame doesn't dominate
          d.lastX = e.clientX;
          d.lastT = now;
        }
      }
    };
    const onUp = () => {
      const d = dragRef.current;
      if (!d.down) return;
      const el = scrollerRef.current;
      const wasMoved = d.moved;
      el?.classList.remove('dragging');
      d.down = false;
      if (!wasMoved) { d.moved = false; return; }
      // suppress the click that would otherwise fire after a drag
      setTimeout(() => { dragRef.current.moved = false; }, 0);
      // inertial coast in the flick's direction, decaying by friction each frame
      let v = d.vx;
      if (el && Math.abs(v) > 0.03) {
        const FRICTION = 0.94;
        const step = () => {
          v *= FRICTION;
          el.scrollLeft += v * 16;            // ~16ms per frame
          if (Math.abs(v) > 0.01) momentumRaf.current = requestAnimationFrame(step);
          else momentumRaf.current = 0;
        };
        momentumRaf.current = requestAnimationFrame(step);
      }
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
  const scrollRaf = React.useRef(0);
  React.useEffect(() => {
    recomputeScroll();
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      if (scrollRaf.current) return;
      scrollRaf.current = requestAnimationFrame(() => { scrollRaf.current = 0; recomputeScroll(); });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current);
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
      if (item.link) window.open(item.link, '_blank', 'noopener,noreferrer');
    }
  }, []);

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
    const zIndex = isJustPicked ? 150 : i + 1;   // hovered item lifts via CSS z-index
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
        <img className="layer-img" src={item.poster || item.tmdbPoster || item.igdbCover} alt={item.title} loading="lazy"/>
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
  }), [ordered, mode, justPickedId, pickedSet, reshuffling, isSpineFor, handleEnter, handleLeave, handleClick, handleAuxClick]);

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
          {renderedItems}
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

// ─────────── Reader Modal ───────────
function Reader({ item, onClose, onJump, allItems, onFilter }) {
  const { ITEMS, MEDIA_SHORT, MEDIA_GLYPH } = window.CULTURE;
  const [on, setOn] = React.useState(false);
  React.useEffect(() => {
    requestAnimationFrame(() => setOn(true));
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const adjacent = React.useMemo(() => {
    const genreSet = new Set(item.genres || []);
    const tagSet   = new Set(item.tags   || []);
    const castSet  = new Set(item.cast   || []);
    return (allItems || ITEMS)
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
      .sort((a, b) => b.score - a.score || a.yr - b.yr)
      .slice(0, 12)
      .map(x => x.i);
  }, [item, allItems]);

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
          {(item.poster || item.tmdbPoster || item.igdbCover)
            ? <img src={item.poster || item.tmdbPoster || item.igdbCover} alt={item.title}/>
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
            {regionName(item.region) ? <React.Fragment><span className="sep"/><span className="meta-link" onClick={() => onFilter && onFilter(`region:${item.region === 'su' ? 'ru' : item.region}`)}>{regionName(item.region)}</span></React.Fragment> : null}
            {item.runtime ? <React.Fragment><span className="sep"/><span>{formatRuntime(item.runtime)}</span></React.Fragment> : null}
            {item.pages ? <React.Fragment><span className="sep"/><span>{item.pages} pages · ~{formatRuntime(Math.round(item.pages * 1.5))} read</span></React.Fragment> : null}
            {item.igdbRating ? <React.Fragment><span className="sep"/><span>IGDB {item.igdbRating}/100</span></React.Fragment> : null}
            {item.igdbGenres ? <React.Fragment><span className="sep"/><span>{item.igdbGenres.split(', ').map((g, i) => <React.Fragment key={g}>{i > 0 && ' · '}<span className="meta-link" onClick={() => onFilter && onFilter(`genre:${g}`)}>{g}</span></React.Fragment>)}</span></React.Fragment> : null}
            {item.seasons ? <React.Fragment><span className="sep"/><span>{item.seasons} {item.seasons > 1 ? 'seasons' : 'season'}</span></React.Fragment> : null}
            {item.episodes ? <React.Fragment><span className="sep"/><span>{item.episodes} eps</span></React.Fragment> : null}
            {item.totalMinutes ? <React.Fragment><span className="sep"/><span>{formatRuntime(item.totalMinutes)} total</span></React.Fragment> : null}
            {item.rating ? <React.Fragment><span className="sep"/><span>★ {item.rating}/10</span></React.Fragment> : null}
            {item.fwAvg ? <React.Fragment><span className="sep"/><span title="Filmweb community average">Filmweb avg ⌀ {item.fwAvg}</span></React.Fragment> : null}
            {item.genres && item.genres.length > 0 ? <React.Fragment><span className="sep"/><span>{item.genres.slice(0, 4).map((g, i) => <React.Fragment key={g}>{i > 0 && ' · '}<span className="meta-link" onClick={() => onFilter && onFilter(`genre:${g}`)}>{g}</span></React.Fragment>)}</span></React.Fragment> : null}
            {item.director ? <React.Fragment><span className="sep"/><span>{directorLabel(item.medium)}: <span className="meta-link" onClick={() => onFilter && onFilter(`director:${item.director}`)}>{item.director}</span></span></React.Fragment> : null}
            {item.studio   ? <React.Fragment><span className="sep"/><span>{studioLabel(item.medium)}: <span className="meta-link" onClick={() => onFilter && onFilter(`studio:${item.studio}`)}>{item.studio}</span></span></React.Fragment> : null}
            {item.igdbFranchise ? <React.Fragment><span className="sep"/><span>Series: {item.igdbFranchise}</span></React.Fragment> : null}
            {item.watchedDate ? <React.Fragment><span className="sep"/><span>Rated {item.watchedDate}</span></React.Fragment> : null}
            <span className="sep"/>
            <span>№ {String(posInMedium).padStart(3,'0')} of {String(inMedium.length).padStart(3,'0')}</span>
          </div>
          {(item.writer || item.cinematographer || item.composer || item.animationDirector) && (
            <div className="reader-crew">
              {item.writer          && <span><span className="crew-role">Script</span> <span className="meta-link" onClick={() => onFilter && onFilter(`writer:${item.writer}`)}>{item.writer}</span></span>}
              {item.cinematographer && <span><span className="crew-role">DP</span> <span className="meta-link" onClick={() => onFilter && onFilter(`dp:${item.cinematographer}`)}>{item.cinematographer}</span></span>}
              {item.composer        && <span><span className="crew-role">Score</span> {item.composer}</span>}
              {item.animationDirector && <span><span className="crew-role">Anim.</span> {item.animationDirector}</span>}
            </div>
          )}
          <h2 className="reader-title">{item.title}<span className="dot">.</span></h2>
          <div className="reader-where">Fuad's library &nbsp;/&nbsp; {item.medium}</div>
          {item.note
            ? <blockquote className="reader-quote">{item.note}</blockquote>
            : <blockquote className="reader-quote empty">{item.favorite ? 'A note for this one is on the to-write list.' : 'From the wider library — no personal note yet.'}</blockquote>}
          {item.igdbSummary && (
            <p className="reader-summary">{item.igdbSummary}</p>
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
          <div className="reader-adjacent">
            <div className="lbl">More like this</div>
            <DragScroll className="row">
              {adjacent.map(a => (
                <a key={a.id} onClick={() => onJump(a)} title={`${a.title} (${a.year})`}>
                  {(a.poster || a.tmdbPoster || a.igdbCover)
                    ? <img src={a.poster || a.tmdbPoster || a.igdbCover} alt=""/>
                    : <span className="thumb-fallback" style={{ '--pf-bg': spineBodyColor(a) }}>{MEDIA_GLYPH[a.medium]}</span>}
                </a>
              ))}
            </DragScroll>
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
    const castData = window.CULTURE_CAST    || {};
    const favs = window.CULTURE.ITEMS.map(i => {
      if (seasons[i.id] && !i.seasons) return { ...i, seasons: seasons[i.id] };
      return i;
    });
    const all = favs.concat(window.CULTURE_IMPORTS || [], window.CULTURE_FILM_IMPORTS || []);
    const hasCast = Object.keys(castData).length > 0;
    return hasCast ? all.map(item => castData[item.id] ? { ...item, ...castData[item.id] } : item) : all;
  }, []);
  const [openItem, setOpenItem] = React.useState(null);
  const [justPickedId, setJustPickedId] = React.useState(null);
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

  // Shelves after text / @year / y:year / in:year / r: filters — but NOT yet chip or stats filters.
  const preChipShelves = React.useMemo(() => {
    const { text, releaseYear, ratedYear, ratingFilter, genres, actors, directors, tags, studios, writers, dps, regions } = parseQuery(search);
    const q = text.toLowerCase();
    return shelves.map(s => ({
      ...s,
      items: s.items.filter(it => {
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
        if (!q) return true;
        return (
          it.title.toLowerCase().includes(q) ||
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
    const base = selectedRatedYears.size === 0
      ? preChipShelves
      : preChipShelves.map(s => ({
          ...s,
          items: s.items.filter(it => it.watchedDate && selectedRatedYears.has(it.watchedDate.slice(0, 4))),
        }));
    const hasStats = selectedRatings.size || selectedDirectors.size || selectedStudios.size || selectedWeeks.size || selectedCountries.size
                   || selectedGenres.size || selectedActors.size || selectedWriters.size || selectedCinematographers.size;
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
        return true;
      }),
    })).filter(s => s.items.length > 0);
  }, [preChipShelves, selectedRatedYears, selectedRatings, selectedDirectors, selectedStudios, selectedWeeks, selectedCountries,
      selectedGenres, selectedActors, selectedWriters, selectedCinematographers]);

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
  const toggleRating    = r => setSelectedRatings(prev   => { const n = new Set(prev); n.has(r) ? n.delete(r) : n.add(r); return n; });
  const toggleDirector  = d => setSelectedDirectors(prev => { const n = new Set(prev); n.has(d) ? n.delete(d) : n.add(d); return n; });
  const toggleStudio    = s => setSelectedStudios(prev   => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });
  const toggleWeek      = w => setSelectedWeeks(prev     => { const n = new Set(prev); n.has(w) ? n.delete(w) : n.add(w); return n; });
  const toggleCountry   = c => setSelectedCountries(prev => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; });
  const toggleGenre     = g => setSelectedGenres(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });
  const toggleActor     = a => setSelectedActors(prev => { const n = new Set(prev); n.has(a) ? n.delete(a) : n.add(a); return n; });
  const toggleWriter    = w => setSelectedWriters(prev => { const n = new Set(prev); n.has(w) ? n.delete(w) : n.add(w); return n; });
  const toggleCinematographer = c => setSelectedCinematographers(prev => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; });
  const clearStatsFilters = () => {
    setSelectedRatings(new Set()); setSelectedDirectors(new Set()); setSelectedStudios(new Set());
    setSelectedWeeks(new Set()); setSelectedCountries(new Set());
    setSelectedGenres(new Set()); setSelectedActors(new Set()); setSelectedWriters(new Set()); setSelectedCinematographers(new Set());
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

  return (
    <div className="page">
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
              title={sortDir === 'desc' ? 'Newest first — click to reverse' : 'Oldest first — click to reverse'}
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
                <div className="search-hint-row"><code>genre:Thriller</code><span>— match by genre</span></div>
                <div className="search-hint-row"><code>actor:Name</code><span>— match by cast</span></div>
                <div className="search-hint-row"><code>director:Name</code> <code>writer:Name</code> <code>dp:Name</code><span>— crew</span></div>
                <div className="search-hint-row"><code>tag:Name</code> <code>studio:Name</code> <code>region:Poland</code><span>— other fields</span></div>
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

      {(selectedRatings.size > 0 || selectedDirectors.size > 0 || selectedStudios.size > 0 || selectedWeeks.size > 0 || selectedCountries.size > 0
        || selectedGenres.size > 0 || selectedActors.size > 0 || selectedWriters.size > 0 || selectedCinematographers.size > 0) && (
        <div className="active-filters">
          {[...selectedRatings].sort().map(r => (
            <span key={r} className="filter-pill">★{r}<button onClick={() => toggleRating(r)}>×</button></span>
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
        />
      ))}

      {search.trim() && filteredShelves.length === 0 && (
        <div className="search-results-msg" style={{ marginTop: 48 }}>
          No results for &ldquo;{search.trim()}&rdquo;.
          <button onClick={() => setSearch('')}>clear</button>
        </div>
      )}

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
            }
            setSearch(val); setOpenItem(null);
          }} />
      )}

      {statsOpen && (
        <StatsModal
          allItems={ITEMS}
          onClose={() => setStatsOpen(false)}
          selectedRatings={selectedRatings}             onToggleRating={toggleRating}
          selectedDirectors={selectedDirectors}         onToggleDirector={toggleDirector}
          selectedStudios={selectedStudios}             onToggleStudio={toggleStudio}
          selectedWeeks={selectedWeeks}                 onToggleWeek={toggleWeek}
          selectedCountries={selectedCountries}         onToggleCountry={toggleCountry}
          selectedActors={selectedActors}               onToggleActor={toggleActor}
          selectedWriters={selectedWriters}             onToggleWriter={toggleWriter}
          selectedCinematographers={selectedCinematographers} onToggleCinematographer={toggleCinematographer}
        />
      )}
    </div>
  );
}

window.CultureApp = App;
