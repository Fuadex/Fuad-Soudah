#!/usr/bin/env python3
"""audit_omdb.py — health check on omdb_cache.json. Reports:
  - total cached, hits (Response True), misses (Response False)
  - short-plot (PlotShort) coverage among hits, and how many still need backfill
  - which extra fields are sparse (BoxOffice, totalSeasons, Ratings, etc.)
  - dumps the full miss list to omdb_review.txt (misses + the queries that found nothing)
"""
import json, os, sys
try: sys.stdout.reconfigure(encoding='utf-8')
except Exception: pass

SD = os.path.dirname(os.path.abspath(__file__))
cache = json.load(open(os.path.join(SD, 'omdb_cache.json'), encoding='utf-8'))

hits   = {k: v for k, v in cache.items() if isinstance(v, dict) and v.get('Response') == 'True'}
misses = {k: v for k, v in cache.items() if isinstance(v, dict) and v.get('Response') == 'False'}

have_short = sum(1 for v in hits.values() if v.get('PlotShort'))           # non-empty short plot
attempted  = sum(1 for v in hits.values() if 'PlotShort' in v)             # '' marks attempted-but-none
need_short = sum(1 for v in hits.values() if 'PlotShort' not in v)         # never attempted

def cov(field):
    return sum(1 for v in hits.values() if v.get(field) and v.get(field) != 'N/A')

print(f'cache entries : {len(cache)}')
print(f'  hits        : {len(hits)}')
print(f'  misses      : {len(misses)}')
print()
print('SHORT-PLOT (IMDb-style synopsis) backfill:')
print(f'  have short  : {have_short}')
print(f'  attempted, none returned : {attempted - have_short}')
print(f'  NOT yet attempted (need backfill) : {need_short}')
print()
print('Field coverage among hits (for "what else can we pull / process"):')
for f in ['Plot', 'PlotShort', 'imdbRating', 'imdbVotes', 'Metascore', 'BoxOffice',
          'Awards', 'Ratings', 'totalSeasons', 'Director', 'Writer', 'Country', 'Language', 'Poster']:
    print(f'  {f:<13} {cov(f):>5} / {len(hits)}')

# Full miss dump for review
lines = []
for k, v in sorted(misses.items()):
    lines.append(f"{k}\t{v.get('_q','?')} ({v.get('_y','?')})\tNO MATCH")
open(os.path.join(SD, 'omdb_review.txt'), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
print(f'\nWrote {len(lines)} misses to omdb_review.txt')
