#!/usr/bin/env python3
"""
update_books.py
Enriches the Books shelf (currently rating/date/pages only) with covers,
descriptions, author and subject tags, into its own file books_data.js.

Sources, per book:
  Goodreads export (goodreads_library_export.csv)  → ISBN13/10, Author, My Review,
                                                      pages, original year, shelves
  Google Books (volumes?q=isbn:…)                  → description, categories, authors, cover
  Open Library covers (covers.openlibrary.org)     → higher-res cover (preferred when present)

Output (own file, merged at runtime as a spread overlay so it fills gaps):
  window.CULTURE_BOOKS = { "<id>": { bookCover, director(=author), summary,
                                     genres, tags, pages, note(=My Review) } }
`note` is only emitted for items that don't already have a hand-written note
(so curated data.js notes are never clobbered).

Book id → Goodreads id: `imp-b-<gid>` (imports.js) or the number in the goodreads.com
link (data.js favorites). No API key needed. Run is resumable (books_cache.json).
Run: python update_books.py [--dry-run] [--limit N] [--force]
"""
import csv, json, os, re, sys, time, unicodedata, urllib.request, urllib.error
from urllib.parse import urlencode, quote
try: sys.stdout.reconfigure(encoding='utf-8')
except Exception: pass
import update_cast as uc   # reuse http_get / match_score / normalize

SD     = os.path.dirname(os.path.abspath(__file__))
OUT    = os.path.join(SD, 'books_data.js')
CACHE  = os.path.join(SD, 'books_cache.json')
GR_CSV = os.path.join(SD, 'goodreads_library_export.csv')

DRY    = '--dry-run' in sys.argv
FORCE  = '--force' in sys.argv
GOOGLE = '--google' in sys.argv   # opt-in Google Books fallback (rate-limited; slow)
LIMIT = next((int(sys.argv[i + 1]) for i, a in enumerate(sys.argv)
              if a == '--limit' and i + 1 < len(sys.argv)), None)

GBOOKS = 'https://www.googleapis.com/books/v1/volumes'
# Goodreads "shelf" values that are status, not subjects — drop from tags.
SHELF_SKIP = {'read', 'to-read', 'currently-reading', 'owned', 'favorites', 'default'}


def parse_books(path):
    """Yield {id, gid, title, has_note} for Books-medium items in a data file."""
    out = []
    for line in open(path, encoding='utf-8'):
        if "'Books'" not in line and '"Books"' not in line:
            continue
        idm = re.search(r"""\bid"?\s*:\s*['"]([^'"]+)['"]""", line)
        if not idm:
            continue
        iid = idm.group(1)
        gm = re.search(r'goodreads\.com/book/show/(\d+)', line)
        gid = gm.group(1) if gm else None
        if not gid:
            m2 = re.match(r'imp-b-(\d+)', iid)
            gid = m2.group(1) if m2 else None
        tm = (re.search(r"""\btitle"?\s*:\s*'((?:[^'\\]|\\.)*)'""", line)
              or re.search(r'"title":\s*"((?:[^"\\]|\\.)*)"', line))
        out.append({
            'id': iid, 'gid': gid,
            'title': re.sub(r'\\(.)', r'\1', tm.group(1)) if tm else '',
            'has_note': bool(re.search(r'"?note"?\s*:', line)),
        })
    return out


def load_goodreads():
    m = {}
    if not os.path.exists(GR_CSV):
        return m
    for row in csv.DictReader(open(GR_CSV, newline='', encoding='utf-8-sig')):
        bid = (row.get('Book Id') or '').strip()
        if bid:
            m[bid] = row
    return m


def clean_isbn(v):
    return re.sub(r'[^0-9Xx]', '', v or '')  # unwraps Goodreads' ="..." formatting


SUBJECT_SKIP = {
    'fiction', 'nonfiction', 'non-fiction', 'large print', 'accessible book',
    'protected daisy', 'in library', 'overdrive', 'open library staff picks',
    'lending library', 'ebook', 'reading level', 'general', 'literature',
}


def http_json(url, tries=3):
    """GET JSON with a simple 429 backoff (Open Library / Google Books rate-limit)."""
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': 'culture-app/1.0 (personal library enrichment)'})
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(2 + 2 * i); continue
            return None
        except Exception:
            return None
    return None


def ol_search(params):
    return (http_json('https://openlibrary.org/search.json?' + urlencode(params)) or {}).get('docs') or []


def ol_doc(isbn13, isbn10, title, author):
    """Best Open Library search doc: by ISBN first, else fuzzy title (+author)."""
    fields = 'key,title,author_name,cover_i,first_publish_year,subject'
    for isbn in (isbn13, isbn10):
        if isbn:
            docs = ol_search({'isbn': isbn, 'fields': fields})
            if docs:
                return docs[0]
    if title:
        params = {'title': title, 'limit': 5, 'fields': fields}
        if author:
            params['author'] = author
        best, bs = None, 0.5
        for d in ol_search(params):
            s = uc.match_score(title, d.get('title') or '')
            if s > bs:
                best, bs = d, s
        return best
    return None


def ol_books_api(isbn):
    """Open Library Books API (jscmd=data) — reliable cover + subjects per ISBN."""
    if not isbn:
        return None
    d = http_json(f'https://openlibrary.org/api/books?bibkeys=ISBN:{isbn}&format=json&jscmd=data')
    return (d or {}).get(f'ISBN:{isbn}')


def _accept_subject(name, tags):
    return (name and name.lower() not in SUBJECT_SKIP and name not in tags
            and len(name) < 32 and not any(ch.isdigit() for ch in name))


def ol_description(work_key):
    if not work_key:
        return None
    d = http_json(f'https://openlibrary.org{work_key}.json') or {}
    desc = d.get('description')
    if isinstance(desc, dict):
        desc = desc.get('value')
    if isinstance(desc, str):
        return re.sub(r'\s*\n?-{3,}.*$', '', desc, flags=re.S).strip()  # drop trailing source lines
    return None


def gbooks_volume(isbn13, isbn10, title, author):
    """Google Books fallback (description / cover) for what OL lacks."""
    queries = [f'isbn:{i}' for i in (isbn13, isbn10) if i]
    if title:
        queries.append('intitle:' + title + (f'+inauthor:{author}' if author else ''))
    for q in queries:
        data = http_json(f'{GBOOKS}?' + urlencode({'q': q, 'maxResults': 3}))
        for it in (data or {}).get('items') or []:
            vi = it.get('volumeInfo') or {}
            if 'isbn:' in q or uc.match_score(title, vi.get('title') or '') >= 0.5:
                return vi
    return None


# ── Wikipedia (Polish + English) — best source for the Polish school classics
# that Open Library barely covers: rich plot summaries + a cover thumbnail.
POLISH_CHARS = set('ąćęłńóśźżĄĆĘŁŃÓŚŹŻ')
# Words that mark a result as the *work* (keep) vs. an *author bio* (reject).
WIKI_LIT = ('powieść', 'powieści', 'dramat', 'tragedia', 'komedia', 'opowiadan',
            'nowel', 'wiersz', 'poemat', 'poezj', 'utwór', 'utwory', 'książk',
            'baśń', 'baśni', 'zbiór', 'epopej', 'satyr', 'manga', 'komiks',
            'novel', 'play', 'poem', 'book', 'story', 'stories', 'tale',
            'fiction', 'drama', 'novella', 'collection', 'memoir', 'comic')
WIKI_BIO = ('pisarz', 'pisarka', 'poeta', 'poetka', 'dramaturg', 'prozaik',
            'publicyst', 'tłumacz', 'reżyser', 'writer', 'novelist', 'poet',
            'playwright', 'author', 'filozof', 'philosopher', 'urodzon')
# Map a form word found in the summary → a clean English genre/form tag.
WIKI_FORM = [('tragedia', 'Tragedy'), ('komedia', 'Comedy'), ('dramat', 'Drama'),
             ('powieść', 'Novel'), ('opowiadan', 'Short Stories'),
             ('nowel', 'Short Stories'), ('poemat', 'Poetry'), ('wiersz', 'Poetry'),
             ('poezj', 'Poetry'), ('baśń', 'Fairy Tale'), ('baśni', 'Fairy Tale'),
             ('manga', 'Manga'), ('komiks', 'Comics'), ('epopej', 'Epic'),
             ('satyr', 'Satire'), ('tragedy', 'Tragedy'), ('comedy', 'Comedy'),
             ('novella', 'Novella'), ('novel', 'Novel'), ('short story', 'Short Stories'),
             ('short stories', 'Short Stories'), ('poem', 'Poetry'),
             ('play', 'Drama'), ('fairy tale', 'Fairy Tale'), ('comic', 'Comics')]


def _wnorm(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9 ]', '', s).strip()


def _trim_summary(text, limit=720):
    """Cap a Wikipedia intro at a sentence boundary near `limit` chars."""
    text = re.sub(r'\s+', ' ', text).strip()
    if len(text) <= limit:
        return text
    cut = text[:limit]
    dot = cut.rfind('. ')
    return (cut[:dot + 1] if dot > limit * 0.5 else cut).strip()


def wiki_lookup(title, author):
    """Search pl+en Wikipedia for the *book/play* page (not the author bio).
    Returns {'summary', 'cover', 'lang', 'page'} or None. ~2 calls per language."""
    langs = ('pl', 'en') if any(c in POLISH_CHARS for c in title) else ('en', 'pl')
    bt = _wnorm(re.sub(r'\s*\(.*?\)', '', title))
    an = _wnorm(author)
    if not bt:
        return None
    for lang in langs:
        api = f'https://{lang}.wikipedia.org/w/api.php?'
        d = http_json(api + urlencode({
            'action': 'query', 'list': 'search',
            'srsearch': f'{title} {author}'.strip(), 'srlimit': 6, 'format': 'json'}))
        best, bs = None, 2
        for h in (d or {}).get('query', {}).get('search', []):
            ti = h['title']
            snp = ' ' + re.sub(r'<[^>]+>', '', h.get('snippet', '')).lower() + ' '
            ht = _wnorm(re.sub(r'\s*\(.*?\)', '', ti))
            sc = 0
            if ht == an:                                       # the author's bio page
                sc -= 10
            if any(b in snp for b in WIKI_BIO) and not any(k in snp for k in WIKI_LIT):
                sc -= 5
            if ht == bt:
                sc += 4
            elif bt and (ht.startswith(bt) or bt.startswith(ht)):
                sc += 2
            if any(k in snp for k in WIKI_LIT):
                sc += 3
            if any(x in ti.lower() for x in
                   ('powieść', 'dramat', 'książk', 'novel', 'play', 'poem', 'manga')):
                sc += 2                                          # explicit work disambig
            if sc > bs:
                best, bs = ti, sc
        if not best:
            continue
        e = http_json(api + urlencode({
            'action': 'query', 'prop': 'extracts|pageimages', 'exintro': 1,
            'explaintext': 1, 'piprop': 'thumbnail', 'pithumbsize': 500,
            'titles': best, 'redirects': 1, 'format': 'json'}))
        pages = list((e or {}).get('query', {}).get('pages', {}).values())
        ex = (pages[0].get('extract') if pages else '') or ''
        if not ex.strip():
            continue
        thumb = (pages[0].get('thumbnail') or {}).get('source') if pages else None
        return {'summary': _trim_summary(ex), 'cover': thumb, 'lang': lang, 'page': best}
    return None


def build(item, gr, cache):
    row = gr.get(item['gid'] or '', {})
    isbn13 = clean_isbn(row.get('ISBN13'))
    isbn10 = clean_isbn(row.get('ISBN'))
    author = (row.get('Author') or '').strip()
    review = (row.get('My Review') or '').strip()
    pages  = (row.get('Number of Pages') or '').strip()

    doc = ol_doc(isbn13, isbn10, item['title'], author)
    out, cover, summary, tags = {}, None, None, []

    if doc:
        if doc.get('cover_i'):
            cover = f"https://covers.openlibrary.org/b/id/{doc['cover_i']}-L.jpg"
        summary = ol_description(doc.get('key'))
        for s in (doc.get('subject') or []):
            if _accept_subject(s, tags):
                tags.append(s)
            if len(tags) >= 15:
                break
        if not author and doc.get('author_name'):
            author = ', '.join(doc['author_name'][:2])

    # Open Library Books API (jscmd=data) — reliable cover + subjects per ISBN,
    # fills what the search doc missed (work-level cover_i is often null).
    if not cover or not tags:
        for isbn in (isbn13, isbn10):
            info = ol_books_api(isbn) if isbn else None
            if not info:
                continue
            if not cover:
                cv = info.get('cover') or {}
                cover = cv.get('large') or cv.get('medium') or cv.get('small')
            if not tags:
                for s in (info.get('subjects') or []):
                    name = s.get('name') if isinstance(s, dict) else s
                    if _accept_subject(name, tags):
                        tags.append(name)
                    if len(tags) >= 15:
                        break
            if not author and info.get('authors'):
                author = ', '.join(a.get('name', '') for a in info['authors'][:2] if a.get('name'))
            if cover and tags:
                break

    # Wikipedia (pl + en) — primary description source for literary titles, esp.
    # the Polish classics Open Library lacks; also a cover-of-last-resort.
    wiki_form = None
    if not summary or not cover:
        wl = wiki_lookup(item['title'], author)
        if wl:
            if not summary and wl.get('summary'):
                summary = wl['summary']
            if not cover and wl.get('cover'):
                cover = wl['cover']
            wiki_form = wl.get('summary')

    # Derive a clean English form/genre tag from the summary when none were found
    # (so the Polish school texts at least get a "Novel" / "Drama" / "Poetry" tag).
    if not tags:
        probe = (wiki_form or summary or '').lower()
        for needle, label in WIKI_FORM:
            if needle in probe:
                tags.append(label)
                break

    # Google Books only fills remaining gaps, and only when opted in (--google).
    if GOOGLE and (not summary or not cover):
        vi = gbooks_volume(isbn13, isbn10, item['title'], author)
        if vi:
            if not summary and vi.get('description'):
                summary = re.sub(r'<[^>]+>', '', vi['description']).strip()
            if not cover:
                links = vi.get('imageLinks') or {}
                thumb = links.get('thumbnail') or links.get('smallThumbnail')
                if thumb:
                    cover = thumb.replace('http://', 'https://').replace('&edge=curl', '')
            if not tags:
                for c in vi.get('categories') or []:
                    for part in re.split(r'\s*/\s*|\s*,\s*', c):
                        part = part.strip()
                        if part and part not in tags:
                            tags.append(part)
            if not author and vi.get('authors'):
                author = ', '.join(vi['authors'][:2])

    # personal Goodreads shelves → tags (status shelves dropped)
    for sh in re.split(r'\s*,\s*', row.get('Bookshelves') or ''):
        sh = sh.strip()
        if sh and sh.lower() not in SHELF_SKIP and sh not in tags:
            tags.append(sh)

    if cover:   out['bookCover'] = cover
    if summary: out['summary'] = summary
    if tags:    out['genres'] = tags[:4]; out['tags'] = tags
    if author:  out['director'] = author
    if pages.isdigit(): out['pages'] = int(pages)
    if review and not item['has_note']: out['note'] = review
    return out


def main():
    gr = load_goodreads()
    cache = json.load(open(CACHE, encoding='utf-8')) if os.path.exists(CACHE) else {}

    items, seen = [], set()
    for name in ('imports.js', 'data.js'):
        p = os.path.join(SD, name)
        if not os.path.exists(p):
            continue
        for it in parse_books(p):
            if it['id'] not in seen:
                seen.add(it['id']); items.append(it)

    todo = [x for x in items if FORCE or x['id'] not in cache]
    if LIMIT:
        todo = todo[:LIMIT]
    print(f'{"[DRY] " if DRY else ""}Books: {len(items)}  ·  with Goodreads CSV row: '
          f'{len([x for x in items if (x["gid"] or "") in gr])}  ·  to fetch now: {len(todo)}')

    if DRY:
        for it in todo[:15]:
            has = 'csv' if (it['gid'] or '') in gr else 'NO-csv'
            print(f"  [{has:>6}] {it['id']}  {it['title']}")
        if len(todo) > 15:
            print(f'  … and {len(todo) - 15} more')
        print('\n--dry-run: no API calls made, nothing written.')
        return

    with_cover = with_desc = 0
    for n, it in enumerate(todo, 1):
        data = build(it, gr, cache)
        cache[it['id']] = data
        if data.get('bookCover'): with_cover += 1
        if data.get('summary'):   with_desc += 1
        bits = [k for k in ('bookCover', 'summary', 'director', 'note') if k in data]
        print(f"  {'✓' if data else '·'} {it['title']}  ({', '.join(bits) or 'nothing found'})")
        if n % 20 == 0 and not DRY:
            json.dump(cache, open(CACHE, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        time.sleep(0.4)

    json.dump(cache, open(CACHE, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    good = {iid: v for iid, v in cache.items() if v}
    header = ('// books_data.js — generated by update_books.py. Book enrichment overlay.\n'
              '// Do not edit by hand. Re-run: python update_books.py\n'
              'window.CULTURE_BOOKS = ')
    open(OUT, 'w', encoding='utf-8').write(header + json.dumps(good, ensure_ascii=False, indent=1) + ';\n')

    print(f'\nDone. covers {with_cover}, descriptions {with_desc} (this run).')
    print(f'books_data.js now holds {len(good)} books.')
    print('Add  <script src="books_data.js"></script>  to index.html if not already there.')


if __name__ == '__main__':
    main()
