#!/usr/bin/env python3
"""
update_steam_tags.py
Pulls Steam's popular user tags for GAMES and adds them as searchable `tags`:
  IGDB (title -> Steam appid via external_games) -> SteamSpy (appid -> tags).
Seen games (imports.js + data.js favourites) -> cast_data.js
Wishlist games                                -> wishlist_cast.js
Console-only titles (no Steam appid) are skipped gracefully.

Also emits highlight HINTS (steam_highlight_hints.txt) — strong tags mapped to
standout-badge keys — for manual review. Highlights are NEVER auto-applied.

.env needs TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET (IGDB). SteamSpy needs no auth.
Run: python update_steam_tags.py [--dry-run] [--limit N] [--force]
"""
import json, os, re, sys, time, urllib.request
try: sys.stdout.reconfigure(encoding='utf-8')
except Exception: pass
import update_igdb as ug

SD = os.path.dirname(os.path.abspath(__file__))
CAST_JS      = os.path.join(SD, 'cast_data.js')
WL_CAST_JS   = os.path.join(SD, 'wishlist_cast.js')
CACHE_FILE   = os.path.join(SD, 'steam_cache.json')
HINTS_FILE   = os.path.join(SD, 'steam_highlight_hints.txt')
DRY = '--dry-run' in sys.argv
FORCE = '--force' in sys.argv
LIMIT = next((int(a.split('=')[-1]) if '=' in a else int(sys.argv[sys.argv.index(a)+1])
              for a in sys.argv if a.startswith('--limit')), None)

TAG_COUNT = 12
# Strong Steam tags -> standout-badge key (hints only).
TAG_TO_HL = {
  'great soundtrack':'score', 'story rich':'writing', 'atmospheric':'atmosphere',
  'beautiful':'visuals', 'masterpiece':'singular', 'psychological':'mindbending',
  'mind-bending':'mindbending', 'emotional':'devastating', 'tear jerker':'devastating',
  'funny':'funny', 'comedy':'funny', 'stylized':'style', 'great visuals':'visuals',
  'replay value':'rewatchable', "souls-like":'intense', 'difficult':'intense',
  'fast-paced':'thrilling', 'action':'thrilling', 'cinematic':'direction',
}


def parse_games(path, json_style):
    """Return [(id,title,year)] of Games-medium items + the raw lines for context."""
    out = []
    for line in open(path, encoding='utf-8'):
        if json_style:
            if '"medium": "Games"' not in line and '"medium":"Games"' not in line: continue
        else:
            if "medium: 'Games'" not in line and '"medium": "Games"' not in line: continue
        idm = re.search(r"""\bid"?\s*:\s*['"]([^'"]+)['"]""", line)
        tm  = re.search(r"""\btitle"?\s*:\s*'((?:[^'\\]|\\.)*)'""", line) or re.search(r'"title":\s*"((?:[^"\\]|\\.)*)"', line)
        ym  = re.search(r'"?year"?\s*:\s*(\d{4})', line)
        if idm and tm:
            out.append((idm.group(1), re.sub(r'\\(.)', r'\1', tm.group(1)), int(ym.group(1)) if ym else 0))
    return out


def load_castjs(path, var):
    if os.path.exists(path):
        m = re.search(re.escape(var) + r'\s*=\s*(\{[\s\S]*\});', open(path, encoding='utf-8').read())
        if m:
            try: return json.loads(m.group(1))
            except json.JSONDecodeError: pass
    return {}


def save_castjs(path, var, data, header):
    open(path, 'w', encoding='utf-8').write(header + var + ' = ' + json.dumps(data, indent=2, ensure_ascii=False) + ';\n')


STEAM_URL = re.compile(r'store\.steampowered\.com/app/(\d+)')

def igdb_steam_appid(token, cid, title, year):
    """Steam appid via the IGDB game's Steam website URL (external_games.category
    was deprecated by IGDB, so we read websites.url instead)."""
    headers = {'Client-ID': cid, 'Authorization': f'Bearer {token}'}
    esc = title.replace('"', '\\"')
    q = f'search "{esc}"; fields name,first_release_date,websites.url; limit 10;'
    res = ug.http_post(ug.IGDB_GAMES, q, headers) or []
    best, best_s = None, 0.4
    for r in res:
        s = ug.match_score(title, r.get('name') or '')
        ts = r.get('first_release_date')
        if ts and year and abs(time.gmtime(int(ts)).tm_year - year) > 2:
            s *= 0.5
        if s > best_s: best, best_s = r, s
    if not best: return None
    for w in (best.get('websites') or []):
        m = STEAM_URL.search((w or {}).get('url', '') or '')
        if m: return m.group(1)
    return None


def steamspy_tags(appid):
    url = f'https://steamspy.com/api.php?request=appdetails&appid={appid}'
    try:
        with urllib.request.urlopen(url, timeout=25) as r:
            data = json.load(r)
    except Exception:
        return []
    tags = data.get('tags')
    if isinstance(tags, dict) and tags:
        return [k for k, _ in sorted(tags.items(), key=lambda x: -x[1])][:TAG_COUNT]
    return []


def main():
    env = ug.load_env()
    cid, csec = env.get('TWITCH_CLIENT_ID', ''), env.get('TWITCH_CLIENT_SECRET', '')
    if not (cid and csec):
        print('ERROR: TWITCH_CLIENT_ID/SECRET missing — needed for IGDB appid lookup.'); return
    token = ug.get_token(cid, csec)
    cache = json.load(open(CACHE_FILE, encoding='utf-8')) if os.path.exists(CACHE_FILE) else {}

    seen  = parse_games(os.path.join(SD,'imports.js'), False) + parse_games(os.path.join(SD,'data.js'), False)
    wish  = parse_games(os.path.join(SD,'wishlist.js'), True)
    print(f'Games — seen: {len(seen)}, wishlist: {len(wish)}')

    todo = [(g, False) for g in seen] + [(g, True) for g in wish]
    todo = [t for t in todo if FORCE or t[0][0] not in cache]
    if LIMIT: todo = todo[:LIMIT]
    print(f'To look up: {len(todo)} ({len(seen)+len(wish)-len(todo)} cached)')

    matched = no_steam = 0
    for n, ((iid, title, year), _) in enumerate(todo, 1):
        try:
            appid = igdb_steam_appid(token, cid, title, year)
            tags = steamspy_tags(appid) if appid else []
        except Exception as e:
            appid, tags = None, []
            print(f'  ! {title}: {e}')
        cache[iid] = {'appid': appid, 'tags': tags}
        if tags: matched += 1
        elif not appid: no_steam += 1
        if n % 20 == 0:
            print(f'    …{n}/{len(todo)} (with tags {matched}, no-steam {no_steam})')
            if not DRY: json.dump(cache, open(CACHE_FILE,'w',encoding='utf-8'), indent=2, ensure_ascii=False)
        time.sleep(0.3)

    if DRY:
        print(f'\n--dry-run: matched {matched}, no Steam {no_steam}. Nothing written.'); return
    json.dump(cache, open(CACHE_FILE,'w',encoding='utf-8'), indent=2, ensure_ascii=False)

    # merge tags into the two cast files
    def merge(path, var, header, games):
        cast = load_castjs(path, var)
        added = 0
        for iid, _, _ in games:
            tags = (cache.get(iid) or {}).get('tags') or []
            if not tags: continue
            cur = cast.get(iid, {})
            existing = cur.get('tags') or []
            merged = existing + [t for t in tags if t not in existing]
            cur['tags'] = merged
            cast[iid] = cur
            added += 1
        save_castjs(path, var, cast, header)
        print(f'{os.path.basename(path)}: tagged {added} games')

    merge(CAST_JS, 'window.CULTURE_CAST',
          '// Cast / crew / tags enrichment. Steam tags appended by update_steam_tags.py.\n', seen)
    merge(WL_CAST_JS, 'window.CULTURE_WISHLIST_CAST',
          '// Wishlist enrichment — machine-owned. Steam tags appended by update_steam_tags.py.\n', wish)

    # highlight hints
    lines = []
    for (iid, title, year), _ in [(g, w) for g, w in [( (i,t,y), False) for (i,t,y) in seen] + [((i,t,y), True) for (i,t,y) in wish]]:
        tags = (cache.get(iid) or {}).get('tags') or []
        hits = []
        for t in tags:
            k = TAG_TO_HL.get(t.lower())
            if k and k not in hits: hits.append(k)
        if hits:
            lines.append(f'{title} ({year}) [{iid}] -> {", ".join(hits)}   (tags: {", ".join(tags[:6])})')
    open(HINTS_FILE, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    print(f'\nMatched Steam tags: {matched}   No Steam page: {no_steam}')
    print(f'Highlight hints for {len(lines)} games written to {os.path.basename(HINTS_FILE)} (review, not applied).')


if __name__ == '__main__':
    main()
