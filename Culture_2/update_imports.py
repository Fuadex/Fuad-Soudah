#!/usr/bin/env python3
"""
update_imports.py
Cross-checks Filmweb_watched_film.csv against imports.js and updates it:
  - Adds fwAvg (Filmweb community average) to existing film entries
  - Adds proper filmweb links to existing film entries
  - Fills missing watchedDate
  - Adds new CSV entries that aren't already present
  - Also patches data.js favorites with fwAvg
"""

import csv, re, os, unicodedata
from urllib.parse import quote_plus

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH   = os.path.join(SCRIPT_DIR, 'Filmweb_watched_film.csv')
IMPORTS_JS = os.path.join(SCRIPT_DIR, 'imports.js')
DATA_JS    = os.path.join(SCRIPT_DIR, 'data.js')

# ── Classification tables (same as gen_imports_films.py) ─────────────────────

EARLY_CINEMA_YEAR = 1916

YEAR_SPECIFIC = {
    ('9', 2009): 'Feature Animation',
    ('9', 2005): 'Shorts',
    ('Alice in Wonderland', 2010): 'Movies',
    ('Alice in Wonderland', 1951): 'Feature Animation',
    ('Cargo', 2017): 'Movies',
    ('Cargo', 2013): 'Shorts',
    ('The Lion King', 1994): 'Feature Animation',
    ('The Lion King', 2019): 'Movies',
    ('Robin Hood', 1973): 'Feature Animation',
    ('Frankenweenie', 1984): 'Shorts',
    ('Frankenweenie', 2012): 'Feature Animation',
    ("It's Such a Beautiful Day", 2012): 'Feature Animation',
    ("It's Such a Beautiful Day", 2011): 'Shorts',
    ('Kotonoha no Niwa', 2013): 'Shorts',
    ('Hotarubi no Mori e', 2011): 'Shorts',
    ('Blade Runner: Black Out 2022', 2017): 'Shorts',
    ('Fantasia/2000', 1999): 'Feature Animation',
    ('Fantasia', 1940): 'Feature Animation',
    ('Animal Farm', 1954): 'Feature Animation',
    ('Animal Farm', 1999): 'Movies',
}

ANIMATED_FEATURES = {
    'Sen to Chihiro no Kamikakushi','Mononoke-hime','Tonari no Totoro',
    'Kaze no Tani no Nausicaä','Kaze tachinu','Kaguyahime no monogatari',
    'Hōhokekyo Tonari no Yamada-kun','Gake no ue no Ponyo','Kokuriko-zaka Kara',
    'Heisei tanuki gassen pompoko','Omohide Poro Poro','Neko no ongaeshi',
    'Karigurashi no Arrietty','Majo no Takkyūbin','Lupin III: Cagliostro no Shiro',
    'Umi ga kikoeru','Gedo senki','Mimi wo Sumaseba','Hauru no ugoku shiro',
    'Omoide no Marnie','Tenkū no Shiro Laputa','Kono Sekai no Katasumi ni','Āya to Majo',
    'Kimi no Na wa.','Tenki no Ko','Suzume no Tojimari',
    'Ōkami Kodomo no Ame to Yuki','Mirai no Mirai','Toki o Kakeru Shōjo',
    'Summer Wars','Belle: Ryū to Sobakasu no Hime',
    'Paprika','Perfect Blue','Manie-Manie: Meikyū Monogatari','Memories',
    'Sennen Joyū','Tokyo Godfathers',
    'Akira','Metropolis','Suchîmubôi','Short Peace',
    'The Animatrix','Robot Carnival','Genius Party','Redline','Mutafukaz',
    'Kanashimi no Beradona','La Planète sauvage','Heavy Metal',
    'Kōkaku Kidōtai','Kôkaku Kidôtai','Hotaru no Haka','Cowboy Bebop: Tengoku no Tobira',
    'Yōjū Toshi','Appleseed','Kite','Trigun: Badlands Rumble',
    'Shinseiki Evangelion Gekijōban: Shi to Shinsei',
    'Shin Seiki Evangelion Gekijōban: The End of Evangelion: Air/Magokoro o, Kimi ni',
    'Made in Abyss: Fukaki Tamashii no Reimei',
    'Hagane no Renkinjutsushi: Milos no Sei-Naru Hoshi',
    'Yoru wa Mijikashi Aruke yo Otome','Sarusuberi: Miss Hokusai',
    'Yoake Tsugeru Lu no Uta','Tatsumi','Koe no Katachi','Mary to Majo no Hana',
    'The Breadwinner','O Menino e o Mundo','Funan','Another Day of Life',
    'Les hirondelles de Kaboul','La tortue rouge','Vals im Bashir',
    'Loving Vincent','Persepolis','Felidae','The Plague Dogs','Watership Down',
    'Song of the Sea','Ma Vie de Courgette','Ernest & Célestine','Ernest et Célestine',
    'Les triplettes de Belleville','Coraline','Mary and Max',
    'Kurenai no buta','Avril et le monde truqué','Le Petit Prince',
    'Tom and Jerry: The Movie',"Astérix et Cléopâtre","Les douze travaux d'Astérix",
    'Tekkon Kinkreet','Promare','Jin-Rō',
    'Kokoro ga Sakebitagatterun Da','Hana to Alice Satsujin Jiken','Colorful',
    'Kono Subarashii Sekai ni Shukufuku o! Kurenai Densetsu',
    'Ginga tetsudô no yoru','Tenshi no tamago','Tout en Haut du Monde',
    'Le Tableau','Josep','Wolfwalkers','The Secret of Kells',
    'Batman: Mask of the Phantasm','All Dogs Go to Heaven',
    'Spirit: Stallion of the Cimarron','The Road to El Dorado',
    'Happy Feet','Happy Feet Two','Arrugas',
    'Abominable','Over the Moon','Klaus','Kubo and the Two Strings',
    "The Magician's Elephant",'The Amazing Maurice','The Bad Guys',
    "Ron's Gone Wrong",'DC League of Super-Pets',
    'Puss in Boots','Puss in Boots: The Last Wish',
    'Snow White and the Seven Dwarfs','Pinocchio','Bambi','Cinderella','Peter Pan',
    'Lady and the Tramp','Sleeping Beauty','One Hundred and One Dalmatians',
    'The Jungle Book','The Rescuers','The Rescuers Down Under','The Little Mermaid',
    'Beauty and the Beast','Aladdin','The Return of Jafar','Pocahontas','Hercules',
    'Mulan','Tarzan','Dinosaur',"The Emperor's New Groove",'Lilo & Stitch',
    'Treasure Planet','Brother Bear','Chicken Little','Meet the Robinsons','Bolt',
    'The Princess and the Frog','Tangled','Winnie the Pooh','Wreck-It Ralph',
    'Frozen','Big Hero 6','Zootopia','Moana','Ralph Breaks the Internet',
    'Frozen II','Raya and the Last Dragon','Encanto','Strange World',
    'Luca','Lightyear','Turning Red','Dumbo',
    "A Bug's Life",'Toy Story','Toy Story 2','Toy Story 3','Toy Story 4',
    'Monsters, Inc.','Finding Nemo','Finding Dory','The Incredibles',
    'Cars','Cars 2','Cars 3','Ratatouille','WALL·E','Up','Brave',
    'Monsters University','Inside Out','The Good Dinosaur','Coco',
    'Incredibles 2','Onward','Soul',
    'Antz','The Prince of Egypt','Chicken Run','Shrek','Shrek 2',
    'Shrek the Third','Shrek Forever After','Shark Tale',
    'Madagascar',"Madagascar: Escape 2 Africa","Madagascar 3: Europe's Most Wanted",
    'Over the Hedge','Flushed Away',"Surf's Up",
    'Kung Fu Panda','Kung Fu Panda 2',
    'How to Train Your Dragon','How to Train Your Dragon 2','Thumbelina',
    'The Nightmare Before Christmas','Corpse Bride','Isle of Dogs','Missing Link',
    'The Swan Princess','Anastasia','The Land Before Time','Balto','The Iron Giant',
    'Spider-Man: Into the Spider-Verse','Spider-Man: Across the Spider-Verse',
    'The Lego Movie','The Lego Batman Movie','The LEGO Movie 2: The Second Part',
    'TMNT','Rio','Cloudy with a Chance of Meatballs','Rango',
    'The Super Mario Bros. Movie','James and the Giant Peach','The Black Cauldron',
    'Atlantis: The Lost Empire','Quest for Camelot',
    "L.O.L. Surprise: The Movie",'The Mitchells vs. The Machines',
    'Hilda and the Mountain King',
}

SHORTS_ORIGINALS = {
    'Tango','Lykantropia','Zbrodnia i kara','Blok','Gadające głowy','Fabryka',
    'Dworzec','Szpital','Zdjęcie','Murarz','Refren','Klaps','Prześwietlenie',
    'Między Wrocławiem a Zieloną Górą','Przed rajdem','Koncert życzeń',
    'Z miasta Łodzi','Tramwaj','Robotnicy 1971 - Nic o nas bez nas',
    'Siedem kobiet w różnym wieku','Byłem żołnierzem','Życiorys',
    'Z punktu widzenia nocnego portiera','Nie wiem','Pierwsza miłość',
    'Spokój','Krótki dzień pracy','Podstawy BHP w kopalni miedzi',
    'Strojenie instrumentów','Esperalia','Ręka','La jetée',
    "Mike's New Car",'Bao','Piper','For the Birds','Luxo Jr.',"Geri's Game",
    "Boundin'",'Lifted','Presto','Day & Night','La Luna','Lou','Lava',
    'Kitbull','Purl','Paperman','Feast','Destino',
    'The Grandmother','The Alphabet','Six Figures Getting Sick',
    'Vincent','Frankenweenie',  # 1984 short
    "Amblin'",'Iblard Jikan',
    'Dear Basketball','Duet','Weekends',
    'In the Fall','Hinterland','Back to the Moon',
    'World of Tomorrow','Canvas',
    'Das Rad','Koło',  # both names for Das Rad
    'Franz Kafka','Tuurngait',
    'Kyousogiga',
    "Kono Subarashī Sekai ni Shukufuku o! 2: Kono Subarashī Geijutsu ni Shukufuku o!",
    'Alien: Covenant - Prologue: The Crossing',
    'Doodlebug',
}


def normalize(s):
    """Lowercase + strip accents for fuzzy matching."""
    s = s.lower().strip()
    nfkd = unicodedata.normalize('NFKD', s)
    s = ''.join(c for c in nfkd if not unicodedata.combining(c))
    s = re.sub(r'[^\w\s]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def get_medium(orig_title, year, polish_title=None):
    for title in ([orig_title] + ([polish_title] if polish_title else [])):
        key = (title, year)
        if key in YEAR_SPECIFIC:
            return YEAR_SPECIFIC[key]
    if year <= EARLY_CINEMA_YEAR:
        return 'Shorts'
    for title in ([orig_title] + ([polish_title] if polish_title else [])):
        if title in ANIMATED_FEATURES:
            return 'Feature Animation'
    for title in ([orig_title] + ([polish_title] if polish_title else [])):
        if title in SHORTS_ORIGINALS:
            return 'Shorts'
    return 'Movies'


def filmweb_url(polish_title, year, movie_id):
    encoded = quote_plus(polish_title, safe='', encoding='utf-8')
    return f"https://www.filmweb.pl/film/{encoded}-{year}-{movie_id}"


def parse_fw_avg(raw):
    try:
        v = float(raw.strip())
        return round(v, 1)
    except Exception:
        return None


def parse_rating(raw):
    try:
        v = int(float(raw.strip()))
        if 1 <= v <= 10:
            return str(v)
    except Exception:
        pass
    return None


# ── Extract data.js filmweb IDs ────────────────────────────────────────────────

def get_datajs_filmweb_ids(path):
    ids = set()
    try:
        with open(path, encoding='utf-8') as f:
            for m in re.finditer(r'filmweb\.pl/film/[^"\']+?-(\d+)["\']', f.read()):
                ids.add(m.group(1))
    except Exception:
        pass
    return ids


# ── Read CSV ───────────────────────────────────────────────────────────────────

def read_csv(path):
    """Returns list of dicts keyed by movieId."""
    entries = {}
    with open(path, newline='', encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            mid = row['movieId'].strip()
            if mid:
                entries[mid] = row
    return entries


# ── Parse existing imp-f- entries from imports.js ─────────────────────────────

def parse_existing_film_entries(path):
    """
    Returns dict: norm_key → {line_idx, id, title, year, has_link, has_fwAvg, has_watchedDate, line}
    norm_key = (normalize(title), year)
    """
    entries = {}
    with open(path, encoding='utf-8') as f:
        lines = f.readlines()

    for i, line in enumerate(lines):
        if 'imp-f-' not in line:
            continue

        # Extract id — handles both quoted keys ("id":) and unquoted (id:)
        id_m = re.search(r"""\bid\s*:\s*['"]([^'"]+)['"]""", line)
        if not id_m:
            continue
        entry_id = id_m.group(1)
        if not entry_id.startswith('imp-f-'):
            continue

        # Extract title — handles escaped quotes (e.g. Schindler\'s List)
        title_m = (re.search(r"""\btitle\s*:\s*'((?:[^'\\]|\\.)*)'""", line) or
                   re.search(r"""\btitle\s*:\s*"((?:[^"\\]|\\.)*)"[,\s]""", line))
        if not title_m:
            continue
        # Unescape JS escape sequences for matching
        title = re.sub(r"\\(.)", r"\1", title_m.group(1))

        # Extract year — handles both quoted and unquoted keys
        year_m = re.search(r"""\byear\s*:\s*(\d{4})""", line)
        if not year_m:
            continue
        year = int(year_m.group(1))

        has_link        = 'filmweb.pl/film/' in line
        has_fwAvg       = 'fwAvg' in line
        has_watchedDate = bool(re.search(r"""watchedDate\s*:\s*['"](\d{4}-\d{2}-\d{2})['"]""", line))

        key = (normalize(title), year)
        entries[key] = {
            'line_idx':      i,
            'id':            entry_id,
            'title':         title,
            'year':          year,
            'has_link':      has_link,
            'has_fwAvg':     has_fwAvg,
            'has_watchedDate': has_watchedDate,
            'line':          line,
        }

    return entries, lines


# ── Build update patches ────────────────────────────────────────────────────────

def patch_line(line, fwAvg=None, link=None, watched_date=None, rating=None):
    """
    Insert missing fields into an existing JS object literal line.
    We insert just before the closing `},` or `}` at the end of the line.
    """
    # Determine closing pattern
    stripped = line.rstrip()
    if stripped.endswith('},'):
        tail = '},'
        base = stripped[:-2]
    elif stripped.endswith('}'):
        tail = '}'
        base = stripped[:-1]
    else:
        return line  # unexpected

    additions = []

    if link and 'link' not in line:
        escaped = link.replace('"', '\\"').replace("'", "\\'")
        additions.append(f" link: '{escaped}'")

    if fwAvg is not None and 'fwAvg' not in line:
        additions.append(f' fwAvg: {fwAvg}')

    if rating and 'rating' not in line:
        additions.append(f" rating: '{rating}'")

    if watched_date and 'watchedDate' not in line:
        additions.append(f" watchedDate: '{watched_date}'")

    if not additions:
        return line

    # Append additions before the closing brace
    add_str = ',' + ','.join(additions)
    return base + add_str + tail + '\n'


def js_escape_title(s):
    """Escape single quotes for JS single-quoted string."""
    return s.replace('\\', '\\\\').replace("'", "\\'")


def make_new_entry(movie_id, orig_title, year, medium, link, fw_avg, rating, watched_date, favorite):
    """Build a new JS object line in the same style as existing film entries."""
    fav_str = 'true' if favorite else 'false'
    parts = [
        f"  {{ id: 'imp-f-{movie_id}'",
        f" title: '{js_escape_title(orig_title)}'",
        f" year: {year}",
        f" medium: '{medium}'",
        f" link: '{link}'",
        f" favorite: {fav_str}",
    ]
    if rating:
        parts.append(f" rating: '{rating}'")
    if fw_avg is not None:
        parts.append(f" fwAvg: {fw_avg}")
    if watched_date:
        parts.append(f" watchedDate: '{watched_date}'")
    return ', '.join(parts) + ' },\n'


# ── Patch data.js with fwAvg ───────────────────────────────────────────────────

def patch_datajs(data_js_path, csv_entries):
    """Add fwAvg to data.js entries that have a filmweb link and matching CSV row."""
    with open(data_js_path, encoding='utf-8') as f:
        content = f.read()

    patched = 0
    for movie_id, row in csv_entries.items():
        fw_avg = parse_fw_avg(row['fullRating'])
        if fw_avg is None:
            continue

        # Find the line in data.js that has this movieId in a filmweb URL
        pattern = rf"(filmweb\.pl/film/[^'\"]+?-{re.escape(movie_id)}['\"])([^\n]*\n)"
        def replacer(m):
            nonlocal patched
            rest = m.group(2)
            # Find the full object that contains this URL
            return m.group(0)  # we'll do a broader approach

        # Better: find the line containing this filmweb ID
        line_pat = re.compile(
            rf"^(.*filmweb\.pl/film/[^'\"]+?-{re.escape(movie_id)}['\"].*)$",
            re.MULTILINE
        )
        match = line_pat.search(content)
        if not match:
            continue

        line = match.group(0)
        if 'fwAvg' in line:
            continue  # already has it

        # Add fwAvg at end of object on this line
        new_line = re.sub(
            r'(\s*\}\s*,?\s*)$',
            f', fwAvg: {fw_avg}\\1',
            line
        )
        if new_line != line:
            content = content.replace(line, new_line, 1)
            patched += 1

    with open(data_js_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f'data.js: patched {patched} entries with fwAvg')


# ── Main ────────────────────────────────────────────────────────────────────────

def main():
    print('Reading CSV...')
    csv_entries = read_csv(CSV_PATH)
    print(f'  {len(csv_entries)} entries')

    print('Reading data.js favorites...')
    datajs_ids = get_datajs_filmweb_ids(DATA_JS)
    print(f'  {len(datajs_ids)} filmweb IDs in data.js')

    print('Reading imports.js film entries...')
    existing, lines = parse_existing_film_entries(IMPORTS_JS)
    print(f'  {len(existing)} existing imp-f- entries')

    # Build lookup from normalised key → CSV row
    # We need to find imp-f- entries that correspond to CSV entries
    # Match by: (normalize(originalTitle), year) OR (normalize(polishTitle), year)

    updates = 0
    new_entries = []
    already_covered = set()  # movie_ids handled (either in data.js or existing entries)

    # Mark data.js movies as already covered
    already_covered.update(datajs_ids)

    # Build reverse map from norm_key → movieId for CSV
    csv_by_norm = {}
    for movie_id, row in csv_entries.items():
        orig  = row['originalTitle'].strip()
        pol   = row['polishTitle'].strip()
        year  = int(row['year'])
        for t in [orig, pol]:
            if t:
                csv_by_norm[(normalize(t), year)] = movie_id

    # Process each CSV entry
    for movie_id, row in csv_entries.items():
        if movie_id in already_covered:
            continue

        orig_title   = row['originalTitle'].strip()
        polish_title = row['polishTitle'].strip()
        year         = int(row['year'])
        full_rating  = row['fullRating'].strip()
        vote_date    = row['voteDate'].strip()
        user_rating  = row['userRating'].strip()
        favorite_raw = row['favorite'].strip().lower()

        fw_avg   = parse_fw_avg(full_rating)
        rating   = parse_rating(user_rating)
        watched  = vote_date if vote_date else None
        favorite = (favorite_raw == 'tak')
        display  = orig_title if orig_title else polish_title
        medium   = get_medium(orig_title, year, polish_title)
        link     = filmweb_url(polish_title, year, movie_id)

        # Try to find existing entry
        matched_key = None
        for t in [orig_title, polish_title]:
            if not t:
                continue
            k = (normalize(t), year)
            if k in existing:
                matched_key = k
                break

        if matched_key:
            entry = existing[matched_key]
            idx   = entry['line_idx']
            old_line = lines[idx]

            add_link    = link    if not entry['has_link']        else None
            add_fwAvg   = fw_avg  if not entry['has_fwAvg']       else None
            add_watched = watched if not entry['has_watchedDate'] else None
            add_rating  = rating  if ('rating' not in old_line)   else None

            new_line = patch_line(old_line, add_fwAvg, add_link, add_watched, add_rating)
            if new_line != old_line:
                lines[idx] = new_line
                updates += 1

            already_covered.add(movie_id)
        else:
            # New entry
            new_line = make_new_entry(
                movie_id, display, year, medium, link,
                fw_avg, rating, watched, favorite
            )
            new_entries.append(new_line)
            already_covered.add(movie_id)

    print(f'Updates to existing entries: {updates}')
    print(f'New entries to add: {len(new_entries)}')

    # Insert new entries before the closing `];`
    # Find the last `];` in lines
    closing_idx = None
    for i in range(len(lines) - 1, -1, -1):
        if lines[i].strip() == '];':
            closing_idx = i
            break

    if closing_idx is None:
        print('ERROR: could not find closing ]; in imports.js')
        return

    if new_entries:
        lines = lines[:closing_idx] + new_entries + lines[closing_idx:]

    with open(IMPORTS_JS, 'w', encoding='utf-8') as f:
        f.writelines(lines)
    print(f'imports.js written ({len(lines)} lines)')

    # Also patch data.js with fwAvg
    print('Patching data.js with fwAvg...')
    patch_datajs(DATA_JS, csv_entries)

    # Print medium stats for new entries
    stats = {}
    for l in new_entries:
        m = re.search(r"medium: '([^']+)'", l)
        if m:
            k = m.group(1)
            stats[k] = stats.get(k, 0) + 1
    if stats:
        print('New entry medium breakdown:')
        for k, v in sorted(stats.items()):
            print(f'  {k}: {v}')


if __name__ == '__main__':
    main()
