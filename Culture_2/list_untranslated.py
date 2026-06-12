#!/usr/bin/env python3
"""list_untranslated.py — list Polish notes (curated or Filmweb) that have no
English redraft in notes_en_source.json yet, in priority order
(data.js curated first, then imports by rating). Usage: python list_untranslated.py [N]
"""
import json, os, re, sys
try: sys.stdout.reconfigure(encoding='utf-8')
except Exception: pass

SD = os.path.dirname(os.path.abspath(__file__))
N = int(sys.argv[1]) if len(sys.argv) > 1 else 20

done = set(k for k in json.load(open(os.path.join(SD, 'notes_en_source.json'), encoding='utf-8'))
           if not k.startswith('_'))
fwtxt = open(os.path.join(SD, 'filmweb_notes.js'), encoding='utf-8').read()
fw = json.loads(re.search(r'window\.CULTURE_NOTES = (\{.*\});', fwtxt, re.S).group(1))

PL = re.compile(r'[ąćęłńóśźż'
                r'ĄĆĘŁŃÓŚŹŻ]'
                r'|\b(się|nie|jest|ale|tego|bardzo|które|który|jak|tym|coś)\b', re.I)

def parse(path, src):
    items = []
    for line in open(path, encoding='utf-8'):
        idm = re.search(r"""\bid"?\s*:\s*['"]([^'"]+)['"]""", line)
        if not idm:
            continue
        tm = (re.search(r"""\btitle"?\s*:\s*'((?:[^'\\]|\\.)*)'""", line)
              or re.search(r'"title":\s*"((?:[^"\\]|\\.)*)"', line))
        em = (re.search(r"""\benTitle"?\s*:\s*'((?:[^'\\]|\\.)*)'""", line)
              or re.search(r'"enTitle":\s*"((?:[^"\\]|\\.)*)"', line))
        nm = (re.search(r"""\bnote"?\s*:\s*'((?:[^'\\]|\\.)*)'""", line)
              or re.search(r'"note":\s*"((?:[^"\\]|\\.)*)"', line))
        lm = re.search(r"""\blink"?\s*:\s*['"]([^'"]+)['"]""", line)
        rm = re.search(r"""(?:"rating"|\brating)\s*:\s*['"]?(\d+(?:\.\d+)?)['"]?""", line)
        ym = re.search(r'"?year"?\s*:\s*(\d{4})', line)
        note = re.sub(r'\\(.)', r'\1', nm.group(1)) if nm else None
        if not note and lm:
            m = re.search(r'filmweb\.pl/(film|serial|videogame)/[^"\']*-(\d+)', lm.group(1))
            if m:
                note = fw.get(m.group(1) + '/' + m.group(2))
        if not note:
            continue
        items.append({
            'id':     idm.group(1),
            'title':  re.sub(r'\\(.)', r'\1', tm.group(1)) if tm else '?',
            'en':     re.sub(r'\\(.)', r'\1', em.group(1)) if em else None,
            'year':   ym.group(1) if ym else '',
            'rating': float(rm.group(1)) if rm else 0.0,
            'note':   note,
            'src':    src,
            'pl':     bool(PL.search(note)),
        })
    return items

allitems, seen = [], set()
for f, s in [('data.js', 0), ('imports.js', 1)]:
    p = os.path.join(SD, f)
    if not os.path.exists(p):
        continue
    for it in parse(p, s):
        if it['id'] in seen:
            continue
        seen.add(it['id'])
        allitems.append(it)

cand = [x for x in allitems if x['pl'] and x['id'] not in done]
cand.sort(key=lambda x: (x['src'], -x['rating'], x['title'].lower()))
print(f'Polish notes without EN redraft: {len(cand)}  (redrafts done: {len(done)})\n')
for it in cand[:N]:
    t = it['en'] or it['title']
    print(f"[{it['id']}] {t} ({it['year']})  *{it['rating']}  {'data.js' if it['src']==0 else 'imports'}")
    print(f"   PL: {it['note']}\n")
