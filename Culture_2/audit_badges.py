#!/usr/bin/env python3
"""audit_badges.py — frequency + co-occurrence stats on badges_source.json,
to inform badge-taxonomy tightening. Read-only; prints, writes nothing.
"""
import json, os, sys
from collections import Counter, defaultdict
from itertools import combinations
try: sys.stdout.reconfigure(encoding='utf-8')
except Exception: pass

SD = os.path.dirname(os.path.abspath(__file__))
src = json.load(open(os.path.join(SD, 'badges_source.json'), encoding='utf-8'))
src = {k: v for k, v in src.items() if not k.startswith('_') and v}

freq = Counter()
co = defaultdict(int)
for badges in src.values():
    bs = sorted(set(badges))
    freq.update(bs)
    for a, b in combinations(bs, 2):
        co[(a, b)] += 1

total = len(src)
print(f'{total} badged items\n')
print('FREQUENCY (badge : count : % of badged items):')
for b, n in freq.most_common():
    print(f'  {b:<15} {n:>4}   {100*n/total:4.0f}%')

def pair_report(label, members):
    print(f'\n{label} — co-occurrence within cluster:')
    for a, b in combinations(members, 2):
        n = co.get((a, b), 0) + co.get((b, a), 0)
        print(f'  {a:<14} + {b:<14} {n}')
    # how many items carry >=2 of the cluster
    multi = sum(1 for v in src.values() if len(set(v) & set(members)) >= 2)
    only = {m: sum(1 for v in src.values() if set(v) & set(members) == {m}) for m in members}
    print(f'  items with >=2 of cluster: {multi}')
    print(f'  items with exactly one: ' + ', '.join(f'{m}={only[m]}' for m in members))

pair_report('VISUAL trio', ['visuals', 'cinematography', 'style'])
pair_report('EMOTIONAL-FORCE trio', ['devastating', 'impact', 'horrifying'])
pair_report('CEREBRAL cluster', ['cerebral', 'mindbending', 'cognitive', 'ahead'])
