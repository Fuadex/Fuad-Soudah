#!/usr/bin/env python3
"""
update_omdb.py
Pulls the FULL OMDb payload for every film/TV title and writes it to its own file,
omdb_data.js, keyed by item id. Nothing is dropped — Plot (full), Genre, Director,
Writer, Actors, Language, Country, Awards, Ratings[] (IMDb / Rotten Tomatoes /
Metacritic), Metascore, imdbRating, imdbVotes, imdbID, BoxOffice, Production,
totalSeasons, etc. The app attaches this at runtime as a non-clobbering nested
`item.omdb` so it never overwrites existing data.js / imports.js fields.

One OMDb request per title (the whole payload comes back in that single call):
  GET https://www.omdbapi.com/?apikey=KEY&t={enTitle||title}&y={year}&type=movie|series&plot=full
A miss retries once without the year, then is logged (no extra calls burned).

Processing order (so the most-wanted data is filled first under the daily cap):
  data.js curated  →  imports.js highest-rated seen  →  rest seen  →  wishlist
Use --limit N to stay under OMDb's ~1000-calls/day free tier; the run is resumable
(omdb_cache.json), so trigger it again over the coming days to finish the rest.

.env needs:  OMDB_API_KEY=your_key   (free at omdbapi.com/apikey.aspx)
Run: python update_omdb.py [--dry-run] [--limit N] [--force]
"""
import json, os, re, sys, time
from urllib.parse import urlencode
try: sys.stdout.reconfigure(encoding='utf-8')
except Exception: pass
import update_cast as uc   # reuse load_env / http_get / match_score / normalize

SD     = os.path.dirname(os.path.abspath(__file__))
OUT    = os.path.join(SD, 'omdb_data.js')
CACHE  = os.path.join(SD, 'omdb_cache.json')
MISSES = os.path.join(SD, 'omdb_misses.txt')

DRY   = '--dry-run' in sys.argv
FORCE = '--force' in sys.argv
LIMIT = next((int(sys.argv[i + 1]) for i, a in enumerate(sys.argv)
              if a == '--limit' and i + 1 < len(sys.argv)), None)

OMDB   = 'https://www.omdbapi.com/'
MOVIE  = {'Movies', 'Feature Animation', 'Shorts'}
TV     = {'TV', 'Animated Series'}
FILES  = [('data.js', 0), ('imports.js', 1), ('wishlist.js', 2)]  # name, source-rank


def parse_items(path):
    """Yield film/TV item dicts {id,title,en,year,medium,rating,fav} from a data file.
    Handles both the JS object-literal style (data.js / imports.js films) and the
    strict-JSON-per-line style (imports.js TV, wishlist.js)."""
    out = []
    for line in open(path, encoding='utf-8'):
        idm = re.search(r"""\bid"?\s*:\s*['"]([^'"]+)['"]""", line)
        if not idm:
            continue
        mm = re.search(r"""\bmedium"?\s*:\s*['"]([^'"]+)['"]""", line)
        if not mm or (mm.group(1) not in MOVIE and mm.group(1) not in TV):
            continue
        tm = (re.search(r"""\btitle"?\s*:\s*'((?:[^'\\]|\\.)*)'""", line)
              or re.search(r'"title":\s*"((?:[^"\\]|\\.)*)"', line))
        if not tm:
            continue
        em = (re.search(r"""\benTitle"?\s*:\s*'((?:[^'\\]|\\.)*)'""", line)
              or re.search(r'"enTitle":\s*"((?:[^"\\]|\\.)*)"', line))
        ym = re.search(r'"?year"?\s*:\s*(\d{4})', line)
        rm = re.search(r"""(?:"rating"|\brating)\s*:\s*['"]?(\d+(?:\.\d+)?)['"]?""", line)
        out.append({
            'id':     idm.group(1),
            'title':  re.sub(r'\\(.)', r'\1', tm.group(1)),
            'en':     re.sub(r'\\(.)', r'\1', em.group(1)) if em else None,
            'year':   int(ym.group(1)) if ym else 0,
            'medium': mm.group(1),
            'rating': float(rm.group(1)) if rm else 0.0,
            'fav':    bool(re.search(r'"?favorite"?\s*:\s*true', line)),
        })
    return out


def omdb_fetch(key, item):
    """One primary call (whole payload). On a miss, one retry without the year."""
    typ = 'movie' if item['medium'] in MOVIE else 'series'
    title = item['en'] or item['title']
    base = {'apikey': key, 't': title, 'plot': 'full', 'type': typ}
    params = dict(base)
    if item['year']:
        params['y'] = item['year']
    data = uc.http_get(OMDB + '?' + urlencode(params))
    if data and data.get('Response') == 'True':
        return data, False
    if item['year']:
        data = uc.http_get(OMDB + '?' + urlencode(base))  # retry, no year
        if data and data.get('Response') == 'True':
            return data, True
    return None, False


def confidence(item, data):
    """Rough flag for review: title similarity + year proximity."""
    ts = uc.match_score(item['en'] or item['title'], data.get('Title', ''))
    dy = (data.get('Year') or '')[:4]
    yok = (not item['year'] or not dy.isdigit() or abs(int(dy) - item['year']) <= 2)
    return ts, yok


def main():
    env = uc.load_env()
    key = env.get('OMDB_API_KEY', '')
    if not key:
        print('ERROR: OMDB_API_KEY not found in .env (get a free key at omdbapi.com/apikey.aspx).')
        sys.exit(1)

    cache = json.load(open(CACHE, encoding='utf-8')) if os.path.exists(CACHE) else {}

    items, seen_ids = [], set()
    for name, rank in FILES:
        p = os.path.join(SD, name)
        if not os.path.exists(p):
            continue
        for it in parse_items(p):
            if it['id'] in seen_ids:
                continue
            seen_ids.add(it['id'])
            it['_rank'] = rank
            items.append(it)

    # Order: data.js curated → imports highest-rated → rest seen → wishlist.
    items.sort(key=lambda x: (x['_rank'], -x['rating'], x['title'].lower()))

    todo = [x for x in items if FORCE or x['id'] not in cache]
    if LIMIT:
        todo = todo[:LIMIT]
    cached_n = len([x for x in items if x['id'] in cache])
    print(f'{"[DRY] " if DRY else ""}Film/TV items: {len(items)}  ·  '
          f'cached: {cached_n}  ·  to fetch now: {len(todo)}')

    if DRY:
        # No API calls in a dry run — just preview the order/plan.
        print('\nNext up (in processing order):')
        for it in todo[:15]:
            src = FILES[it['_rank']][0]
            print(f"  {src:<11} {it['year']}  ★{it['rating'] or '-':<4} {it['en'] or it['title']}")
        if len(todo) > 15:
            print(f'  … and {len(todo) - 15} more')
        print('\n--dry-run: no OMDb calls made, nothing written.')
        return

    found = misses = low = 0
    review = []
    for n, it in enumerate(todo, 1):
        data, no_year = omdb_fetch(key, it)
        if data:
            cache[it['id']] = data
            found += 1
            ts, yok = confidence(it, data)
            flag = '' if (ts >= 0.5 and yok) else '  ⚠ review'
            if flag:
                low += 1
                review.append(f"{it['id']}\t{it['title']} ({it['year']})\t→ {data.get('Title')} ({data.get('Year')})\tscore {ts:.2f}{' year?' if not yok else ''}")
            print(f"  ✓ {it['title']} ({it['year']}) → {data.get('Title')} [{data.get('imdbID')}]{flag}")
        else:
            cache[it['id']] = {'Response': 'False', '_q': it['en'] or it['title'], '_y': it['year']}
            misses += 1
            review.append(f"{it['id']}\t{it['title']} ({it['year']})\tNO MATCH")
            print(f"  ✗ {it['title']} ({it['year']}) — no match")
        if n % 25 == 0 and not DRY:
            json.dump(cache, open(CACHE, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
            print(f"    …{n}/{len(todo)} (found {found}, misses {misses})")
        time.sleep(0.12)

    if DRY:
        print(f'\n--dry-run: would fetch {len(todo)} (found {found}, misses {misses}). Nothing written.')
        return

    json.dump(cache, open(CACHE, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    good = {iid: v for iid, v in cache.items()
            if isinstance(v, dict) and v.get('Response') == 'True'}
    header = ('// omdb_data.js — generated by update_omdb.py. FULL OMDb payload per item id.\n'
              '// Do not edit by hand. Re-run: python update_omdb.py [--limit N]\n'
              'window.CULTURE_OMDB = ')
    open(OUT, 'w', encoding='utf-8').write(header + json.dumps(good, ensure_ascii=False, indent=1) + ';\n')

    if review:
        open(MISSES, 'w', encoding='utf-8').write('\n'.join(review) + '\n')

    total = len([x for x in items if x['id'] in good])
    print(f'\nDone. This run: found {found}, misses {misses}, low-confidence {low}.')
    print(f'omdb_data.js now holds {len(good)} payloads ({total}/{len(items)} of the library).')
    if review:
        print(f'Review {len(review)} flagged/missed in omdb_misses.txt.')
    remaining = len([x for x in items if x['id'] not in cache])
    if remaining:
        print(f'{remaining} still un-fetched — re-run `python update_omdb.py --limit N` another day.')
    print('Add  <script src="omdb_data.js"></script>  to index.html if not already there.')


if __name__ == '__main__':
    main()
