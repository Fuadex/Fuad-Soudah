#!/usr/bin/env python3
"""propose_badges.py — generate a REVIEWABLE badge re-curation proposal.

Reads the library (data.js favorites + imports.js), joins OMDb (genre/plot/rating)
and books overlay, and for the high-value set (favorites + high-rated seen) emits
`badge_proposal.md`: per title its current highlights vs heuristic ADD suggestions
with a one-line reason, plus dedicated candidate sections for the two new badges
(💀 horrifying, 🪞 cognitive). NOTHING is applied — the user reviews/edits, then we
apply approved changes (curated favorites inline in data.js; broader via an overlay).

Run: python propose_badges.py
"""
import json, os, re, sys
try: sys.stdout.reconfigure(encoding='utf-8')
except Exception: pass

SD = os.path.dirname(os.path.abspath(__file__))

def load_window(fname, var):
    p = os.path.join(SD, fname)
    if not os.path.exists(p):
        return {}
    s = open(p, encoding='utf-8').read()
    s = s[s.index('{'): s.rstrip().rstrip(';').rindex('}') + 1]
    try:
        return json.loads(s)
    except Exception:
        return {}

OMDB = load_window('omdb_data.js', 'CULTURE_OMDB')
BOOKS = load_window('books_data.js', 'CULTURE_BOOKS')

def load_badges():
    """badges.js has inline // comments → not strict JSON; regex the id:[tokens] pairs."""
    p = os.path.join(SD, 'badges.js')
    if not os.path.exists(p):
        return {}
    out = {}
    for m in re.finditer(r'"([\w\-]+)"\s*:\s*\[([^\]]*)\]', open(p, encoding='utf-8').read()):
        out[m.group(1)] = re.findall(r'"([^"]+)"', m.group(2))
    return out

BADGES = load_badges()

# Vocabulary of existing + new badge tokens (must match HIGHLIGHTS in culture-v2.jsx).
VOCAB = ['direction','writing','cinematography','visuals','acting','score','mindbending',
         'gem','devastating','impact','funny','cerebral','style','atmosphere','slowburn',
         'intense','horrifying','thrilling','ahead','singular','cognitive']

# Conservative heuristic: only fire on fairly specific, reliable signals (rarer
# words / genre terms), so the proposal is worth scanning rather than noise. The
# two new badges (horrifying, cognitive) are hand-curated in badges.js — NOT auto-
# suggested here. Generic 'animation -> visuals' etc. removed (too broad).
RULES = [
    ('funny',      ['comedy','hilarious','farce','screwball','mockumentary'], 'comedy'),
    ('thrilling',  ['heist','espionage','high-stakes','race against','manhunt'], 'thriller/tension'),
    ('cerebral',   ['documentary','philosoph','existential'], 'ideas-driven'),
    ('devastating',['grief','suicide','genocide','holocaust','terminal illness','bereave'], 'profound loss'),
    ('intense',    ['massacre','torture','relentless','brutal','harrowing'], 'brutal'),
    ('mindbending',['time loop','nonlinear','paradox','simulation','unreliable narrator','recursive'], 'structure play'),
    ('visuals',    ['animation','animated','anime','hand-drawn','stop-motion','visually stunning','painterly'], 'visual-forward (esp. animation)'),
]

# Cognitive-shift shortlist (Claude's judgment) — titles that tend to rewire how one
# thinks/perceives. Only those present in the library are surfaced, as CANDIDATES.
COGNITIVE_HINTS = {
    'spec ops','antichamber','the stanley parable','disco elysium','outer wilds','the witness',
    'braid','the beginner\'s guide','nier','nier:automata','undertale','primer','synecdoche',
    'stalker','waking life','eternal sunshine','memento','enemy','the act of killing',
    'serial experiments lain','neon genesis evangelion','perfect blue','paprika','mind game',
    'solaris','arrival','annihilation','i\'m thinking of ending things','mulholland',
    'the master','pi','being john malkovich','adaptation','inception','tenet','coherence',
    'predestination','the man from earth','12 monkeys','a scanner darkly','ghost in the shell',
}

def parse_items(path):
    out = []
    for line in open(path, encoding='utf-8'):
        if "medium" not in line or "id" not in line:
            continue
        idm = re.search(r"""\bid"?\s*:\s*['"]([^'"]+)['"]""", line)
        if not idm:
            continue
        def g(key):
            m = (re.search(key + r"""\s*:\s*['"]((?:[^'"\\]|\\.)*)['"]""", line))
            return re.sub(r'\\(.)', r'\1', m.group(1)) if m else None
        hl = re.search(r'highlights"?\s*:\s*\[([^\]]*)\]', line)
        highlights = re.findall(r"['\"]([^'\"]+)['\"]", hl.group(1)) if hl else []
        gen = re.search(r'\bgenres"?\s*:\s*\[([^\]]*)\]', line)
        genres = re.findall(r"['\"]([^'\"]+)['\"]", gen.group(1)) if gen else []
        fav = bool(re.search(r'favorite"?\s*:\s*true', line))
        rat = g(r'"?rating"?')
        out.append({
            'id': idm.group(1),
            'title': g(r'"?title"?') or idm.group(1),
            'medium': g(r'"?medium"?') or '?',
            'favorite': fav,
            'rating': float(rat) if rat and re.match(r'^\d', rat) else None,
            'highlights': highlights,
            'genres': genres + (g(r'"?igdbGenres"?').split(', ') if g(r'"?igdbGenres"?') else []),
        })
    return out

def main():
    items, seen = [], set()
    for f in ('data.js', 'imports.js'):
        p = os.path.join(SD, f)
        if os.path.exists(p):
            for it in parse_items(p):
                if it['id'] not in seen:
                    seen.add(it['id']); items.append(it)

    # high-value set: favorites + high-rated seen
    pool = [x for x in items if x['favorite'] or (x['rating'] and x['rating'] >= 8)]

    def signals(it):
        omdb = OMDB.get(it['id'], {})
        text = ' '.join(filter(None, [
            ' '.join(it['genres']), omdb.get('Genre', ''), (omdb.get('Plot') or '')[:600],
            ' '.join((BOOKS.get(it['id'], {}) or {}).get('tags', [])),
        ])).lower()
        return text, omdb

    # Titles already rejected for a given badge (so they stop reappearing).
    REJECT = {b.strip() for b in []}  # (no per-badge rejects yet beyond cognitive, which isn't auto-suggested)

    from collections import defaultdict
    by_badge = defaultdict(list)
    for it in sorted(pool, key=lambda x: (not x['favorite'], x['medium'], x['title'])):
        text, _ = signals(it)
        current = set(it['highlights']) | set(BADGES.get(it['id'], []))  # inline + applied overlay
        for badge, needles, reason in RULES:
            if badge in current:                       # already has it (applied / curated) → skip
                continue
            if any(nd in text for nd in needles):
                by_badge[badge].append((it['title'], it['medium'], it['favorite'], sorted(current)))

    LABEL = {'funny': '😂 funny', 'visuals': '🎨 visuals', 'cerebral': '🧠 cerebral (thought-provoking)',
             'thrilling': '⚡ thrilling', 'devastating': '💔 devastating', 'intense': '🩸 intense / brutal',
             'mindbending': '🌀 mindbending'}
    out = ['# Badge proposal — grouped by badge', '',
           'Candidate titles for each badge. Already-applied / curated badges are excluded,',
           'so this is just the open questions. Tell me which to keep per badge.',
           '', '_🪞 cognitive & 💀 horrifying are hand-curated in `badges_source.json` — not listed here._', '']
    total = 0
    for badge in ['cerebral', 'visuals', 'funny', 'mindbending', 'devastating', 'intense', 'thrilling']:
        rows = [r for r in by_badge.get(badge, []) if r[0].lower() not in REJECT]
        if not rows:
            continue
        total += len(rows)
        out.append(f'## {LABEL.get(badge, badge)}  ({len(rows)})')
        for title, med, fav, cur in sorted(rows):
            out.append(f"- {title} ({med}){' ★' if fav else ''}  ·  has: {' '.join(cur) or '—'}")
        out.append('')

    open(os.path.join(SD, 'badge_proposal.md'), 'w', encoding='utf-8').write('\n'.join(out) + '\n')
    print(f'badge_proposal.md written (grouped by badge). pool={len(pool)}, {total} open suggestions.')

if __name__ == '__main__':
    main()
