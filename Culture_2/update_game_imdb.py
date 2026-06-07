#!/usr/bin/env python3
"""update_game_imdb.py — find IMDb ids for Games via Wikidata, into game_imdb.js.

OMDb only covers film/TV, so games never got an `imdbUrl` and the Reader's
Filmweb⇄IMDb morph button couldn't appear on them. IMDb *does* list many games,
and Wikidata stores those ids (property P345) on entities typed as a video game
(P31 = Q7889). So per game we:
  1. wbsearchentities on the best name we have (the Filmweb link slug is usually
     the canonical English title; fall back to stored title / enTitle),
  2. one batched wbgetentities for the candidate QIDs,
  3. pick the candidate that IS a video game and has an IMDb id, preferring a
     close title match and (if present) a matching release year.

Output (own file, merged at runtime → item.imdbUrl):
  window.CULTURE_GAME_IMDB = { "<itemId>": "tt1234567" }

Resumable (game_imdb_cache.json). Run: python update_game_imdb.py [--dry-run] [--limit N] [--force]
"""
import json, os, re, sys, time, unicodedata, urllib.request, urllib.error
from urllib.parse import urlencode, unquote_plus
try: sys.stdout.reconfigure(encoding='utf-8')
except Exception: pass

SD    = os.path.dirname(os.path.abspath(__file__))
OUT   = os.path.join(SD, 'game_imdb.js')
CACHE = os.path.join(SD, 'game_imdb_cache.json')
FILES = ('data.js', 'imports.js', 'wishlist.js')

DRY   = '--dry-run' in sys.argv
FORCE = '--force' in sys.argv
LIMIT = next((int(sys.argv[i + 1]) for i, a in enumerate(sys.argv)
              if a == '--limit' and i + 1 < len(sys.argv)), None)

WD = 'https://www.wikidata.org/w/api.php?'
VIDEO_GAME_TYPES = {'Q7889', 'Q865493', 'Q61475894', 'Q4393107'}  # video game (+ variants)
UA = 'culture-app/1.0 (personal library enrichment)'


def http_json(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=25) as r:
                return json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code in (429, 503):
                time.sleep(2 + 3 * i); continue
            return None
        except Exception:
            time.sleep(1 + i); continue
    return None


def norm(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9 ]', ' ', s).strip()


def slug_from_link(link):
    """Filmweb /videogame/<Slug>-<year>-<id> → canonical title string."""
    m = re.search(r'/videogame/(.+?)-\d{4}-\d+', link or '')
    return unquote_plus(m.group(1)).replace('+', ' ') if m else None


def parse_games(path):
    out = []
    for line in open(path, encoding='utf-8'):
        if "'Games'" not in line and '"Games"' not in line:
            continue
        idm = re.search(r"""\bid"?\s*:\s*['"]([^'"]+)['"]""", line)
        if not idm:
            continue
        def grab(key):
            m = (re.search(key + r""""?\s*:\s*'((?:[^'\\]|\\.)*)'""", line)
                 or re.search('"' + key.strip('\\b') + r'":\s*"((?:[^"\\]|\\.)*)"', line))
            return re.sub(r'\\(.)', r'\1', m.group(1)) if m else None
        lm = re.search(r"""\blink"?\s*:\s*['"]([^'"]+)['"]""", line)
        ym = re.search(r"""\byear"?\s*:\s*(\d{4})""", line)
        out.append({
            'id': idm.group(1),
            'title': grab(r'\btitle'),
            'en': grab(r'\benTitle'),
            'slug': slug_from_link(lm.group(1) if lm else ''),
            'year': int(ym.group(1)) if ym else None,
        })
    return out


def imdb_id(item):
    """Return an IMDb tt-id for this game, or None."""
    terms, seen = [], set()
    for t in (item['slug'], item['en'], item['title']):
        if t and norm(t) not in seen:
            seen.add(norm(t)); terms.append(t)
    for term in terms:
        s = http_json(WD + urlencode({
            'action': 'wbsearchentities', 'search': term, 'language': 'en',
            'type': 'item', 'limit': 7, 'format': 'json'}))
        qids = [h['id'] for h in (s or {}).get('search', [])]
        if not qids:
            continue
        e = http_json(WD + urlencode({
            'action': 'wbgetentities', 'ids': '|'.join(qids[:7]),
            'props': 'claims|labels', 'languages': 'en', 'format': 'json'}))
        ents = (e or {}).get('entities', {})
        best, best_sc = None, -1
        nt = norm(term)
        for qid in qids:
            cl = ents.get(qid, {}).get('claims', {})
            p31 = {c['mainsnak'].get('datavalue', {}).get('value', {}).get('id')
                   for c in cl.get('P31', [])}
            if not (p31 & VIDEO_GAME_TYPES):
                continue
            p345 = cl.get('P345')
            ttid = p345[0]['mainsnak'].get('datavalue', {}).get('value') if p345 else None
            if not ttid:
                continue
            label = norm(ents[qid].get('labels', {}).get('en', {}).get('value', ''))
            sc = 3 if label == nt else (1 if (label and (label in nt or nt in label)) else 0)
            # year match (P577) bumps confidence
            for c in cl.get('P577', []):
                t = c['mainsnak'].get('datavalue', {}).get('value', {}).get('time', '')
                m = re.search(r'\+(\d{4})', t)
                if m and item['year'] and abs(int(m.group(1)) - item['year']) <= 1:
                    sc += 2
            if sc > best_sc:
                best, best_sc = ttid, sc
        if best:
            return best
    return None


def main():
    cache = json.load(open(CACHE, encoding='utf-8')) if os.path.exists(CACHE) else {}
    items, seen = [], set()
    for name in FILES:
        p = os.path.join(SD, name)
        if not os.path.exists(p):
            continue
        for it in parse_games(p):
            if it['id'] not in seen:
                seen.add(it['id']); items.append(it)

    todo = [x for x in items if FORCE or x['id'] not in cache]
    if LIMIT:
        todo = todo[:LIMIT]
    print(f'{"[DRY] " if DRY else ""}Games: {len(items)}  ·  to look up now: {len(todo)}')
    if DRY:
        for it in todo[:15]:
            print(f"  {it['id']}  search={it['slug'] or it['en'] or it['title']!r}")
        print('\n--dry-run: no calls, nothing written.')
        return

    found = 0
    for n, it in enumerate(todo, 1):
        ttid = imdb_id(it)
        cache[it['id']] = ttid  # None is cached too (don't re-query known misses)
        if ttid:
            found += 1
            print(f"  ✓ {it['slug'] or it['title']}  → {ttid}")
        if n % 20 == 0:
            json.dump(cache, open(CACHE, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
            print(f"  … {n}/{len(todo)} done, {found} matched")
        time.sleep(0.35)

    json.dump(cache, open(CACHE, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    good = {k: v for k, v in cache.items() if v}
    header = ('// game_imdb.js — generated by update_game_imdb.py (Wikidata P345).\n'
              '// Do not edit by hand. Re-run: python update_game_imdb.py\n'
              'window.CULTURE_GAME_IMDB = ')
    open(OUT, 'w', encoding='utf-8').write(header + json.dumps(good, ensure_ascii=False, indent=1) + ';\n')
    print(f'\nDone. matched {found} this run; game_imdb.js holds {len(good)} IMDb ids '
          f'(of {len(cache)} looked up).')


if __name__ == '__main__':
    main()
