import re, unicodedata, sys
sys.stdout.reconfigure(encoding='utf-8')

def normalize(s):
    s = unicodedata.normalize('NFKD', s.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

dupes = {'hinterland', 'in the fall', 'la haine', 'pierwsza milosc',
         'premier automne', 'solo na ugorze', 'tori no uta', 'urzad'}

with open('imports.js', encoding='utf-8') as f:
    ilines = f.readlines()
with open('data.js', encoding='utf-8') as f:
    dlines = f.readlines()

print('=== imports.js ===')
for l in ilines:
    if 'imp-f-' not in l:
        continue
    # film entries use single-quoted JS object literal format
    m = (re.search(r"title\s*:\s*'((?:[^'\\]|\\.)*)'", l) or
         re.search(r'"title"\s*:\s*"([^"]+)"', l))
    y = (re.search(r'year\s*:\s*(\d{4})', l) or
         re.search(r'"year"\s*:\s*(\d{4})', l))
    if m and y and normalize(m.group(1)) in dupes:
        print(l.strip()[:400])

print()
print('=== data.js ===')
for l in dlines:
    # single-quoted JS object literal titles
    m = re.search(r"title\s*:\s*'((?:[^'\\]|\\.)*)'", l)
    y = re.search(r'year\s*:\s*(\d{4})', l)
    if m and y and normalize(m.group(1)) in dupes:
        print(l.strip()[:400])
