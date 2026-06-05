#!/usr/bin/env python3
"""
update_titles.py
Backfills an English display title (`enTitle`) across the whole library so foreign-
named titles show + search in English, with the original kept as a searchable alias.
  Films / TV -> TMDB search result's English `title`/`name`.
  Games       -> IGDB game name.
  Wishlist    -> also stores `polishTitle` from the CSV (extra search alias).
Only writes enTitle when it differs from the stored title. Idempotent (skips items
that already have enTitle), resumable via title_cache.json.

Run: python update_titles.py [--dry-run] [--limit N] [--force] [--no-games]
"""
import csv, json, os, re, sys, time
from urllib.parse import urlencode
try: sys.stdout.reconfigure(encoding='utf-8')
except Exception: pass
import update_cast as uc
import update_igdb as ug

SD = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(SD, 'title_cache.json')
DRY = '--dry-run' in sys.argv; FORCE = '--force' in sys.argv; NO_GAMES = '--no-games' in sys.argv
LIMIT = next((int(sys.argv[sys.argv.index(a)+1]) for a in sys.argv if a == '--limit'), None)

MOVIE = {'Movies','Feature Animation','Shorts'}
TV    = {'TV','Animated Series'}

def tmdb_best(kind, key, title, year):
    yp = 'year' if kind == 'movie' else 'first_air_date_year'
    data = uc.http_get(f'{uc.TMDB}/search/{kind}?' + urlencode({'api_key':key,'query':title,yp:year})) if year else None
    if not data or not data.get('results'):
        data = uc.http_get(f'{uc.TMDB}/search/{kind}?' + urlencode({'api_key':key,'query':title}))
    if not data or not data.get('results'): return None
    tf = ['title','original_title'] if kind=='movie' else ['name','original_name']
    best, bs = None, 0.42
    for r in data['results']:
        s = max((uc.match_score(title, r.get(f) or '') for f in tf), default=0)
        ry = (r.get('release_date') or r.get('first_air_date') or '')[:4]
        if ry and year and abs(int(ry)-int(year)) > 2: s *= 0.55
        if s > bs: best, bs = r, s
    if not best: return None
    return best.get('title') or best.get('name')

def igdb_name(token, cid, title, year):
    r = ug.igdb_search(token, cid, title, year)
    return (r or {}).get('name')

def wishlist_polish():
    out = {}
    for prefix, fn, col in (('wl-f-','Filmweb_watchlist_film.csv','movieId'),
                            ('wl-s-','Filmweb_watchlist_serial.csv','serialId'),
                            ('wl-g-','Filmweb_playlist_games.csv','gameId')):
        p = os.path.join(SD, fn)
        if not os.path.exists(p): continue
        for row in csv.DictReader(open(p, newline='', encoding='utf-8-sig')):
            fid = (row.get(col) or '').strip()
            if fid: out[prefix+fid] = (row.get('polishTitle') or '').strip()
    return out

def parse_items(path, json_style):
    out = []
    for line in open(path, encoding='utf-8'):
        if 'enTitle' in line: continue
        idm = re.search(r"""\bid"?\s*:\s*['"]([^'"]+)['"]""", line)
        tm  = re.search(r"""\btitle"?\s*:\s*'((?:[^'\\]|\\.)*)'""", line) or re.search(r'"title":\s*"((?:[^"\\]|\\.)*)"', line)
        ym  = re.search(r'"?year"?\s*:\s*(\d{4})', line)
        mm  = re.search(r"""\bmedium"?\s*:\s*['"]([^'"]+)['"]""", line)
        if idm and tm and mm:
            out.append((idm.group(1), re.sub(r'\\(.)', r'\1', tm.group(1)),
                        int(ym.group(1)) if ym else 0, mm.group(1)))
    return out

def main():
    env = uc.load_env(); key = env.get('TMDB_API_KEY','')
    cid, csec = env.get('TWITCH_CLIENT_ID',''), env.get('TWITCH_CLIENT_SECRET','')
    token = ug.get_token(cid, csec) if (cid and csec) else None
    cache = json.load(open(CACHE, encoding='utf-8')) if os.path.exists(CACHE) else {}
    polish = wishlist_polish()

    files = [('data.js', False), ('imports.js', False), ('wishlist.js', True)]
    items = []
    for path, js in files:
        for it in parse_items(os.path.join(SD, path), js):
            items.append((path, js, *it))
    todo = [x for x in items if FORCE or x[2] not in cache]
    if LIMIT: todo = todo[:LIMIT]
    print(f'Items needing enTitle lookup: {len(todo)} / {len(items)}')

    found = 0
    for n, (path, js, iid, title, year, medium) in enumerate(todo, 1):
        en = None
        try:
            if medium == 'Games':
                if token and not NO_GAMES: en = igdb_name(token, cid, title, year)
            elif medium in MOVIE: en = tmdb_best('movie', key, title, year)
            elif medium in TV:    en = tmdb_best('tv', key, title, year)
        except Exception as e:
            print(f'  ! {title}: {e}')
        cache[iid] = {'en': en if (en and en != title) else None}
        if cache[iid]['en']: found += 1
        if n % 50 == 0:
            print(f'    …{n}/{len(todo)} (new English titles {found})')
            if not DRY: json.dump(cache, open(CACHE,'w',encoding='utf-8'), ensure_ascii=False, indent=1)
        time.sleep(0.22)

    if DRY:
        print(f'\n--dry-run: would set enTitle on {found}. Nothing written.'); return
    json.dump(cache, open(CACHE,'w',encoding='utf-8'), ensure_ascii=False, indent=1)

    # write enTitle (+ polishTitle for wishlist) inline
    def esc(s, js): return s.replace('\\','\\\\').replace('"','\\"') if js else s.replace('\\','\\\\').replace("'","\\'")
    def patch(path, js):
        q = '"' if js else "'"
        lines = open(path, encoding='utf-8').readlines(); ch = 0
        for i, line in enumerate(lines):
            if 'enTitle' in line: continue
            idm = re.search(r"""\bid"?\s*:\s*['"]([^'"]+)['"]""", line)
            if not idm: continue
            iid = idm.group(1)
            adds = []
            en = (cache.get(iid) or {}).get('en')
            if en: adds.append((('"enTitle": ' if js else 'enTitle: ')) + q+esc(en,js)+q)
            if js and iid in polish and polish[iid]:
                if '"polishTitle"' not in line:
                    adds.append('"polishTitle": ' + q+esc(polish[iid],js)+q)
            if not adds: continue
            s = line.rstrip('\n')
            base, tail = (s[:s.rstrip().rindex('},')].rstrip(),'},') if s.rstrip().endswith('},') else (s[:s.rstrip().rindex('}')].rstrip(),'}')
            lines[i] = base + ', ' + ', '.join(adds) + ' ' + tail + '\n'; ch += 1
        open(path,'w',encoding='utf-8').writelines(lines)
        return ch
    for path, js in files:
        print(f'{path}: wrote enTitle/alias on {patch(os.path.join(SD,path), js)} lines')
    print(f'\nDone. English titles found for {found} items.')

if __name__ == '__main__':
    main()
