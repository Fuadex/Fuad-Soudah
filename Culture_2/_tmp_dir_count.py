import re, sys
sys.stdout.reconfigure(encoding='utf-8')
FILM_MEDIA = {'Movies', 'Feature Animation', 'Shorts', 'TV', 'Animated Series'}
with open('imports.js', encoding='utf-8') as f:
    lines = f.readlines()
total, no_dir = 0, 0
for line in lines:
    mm = re.search(r'"medium"\s*:\s*"([^"]+)"', line) or re.search(r"medium\s*:\s*'([^']+)'", line)
    if not mm or mm.group(1) not in FILM_MEDIA:
        continue
    total += 1
    has_dir = bool(re.search(r'director\s*:', line))
    if not has_dir:
        no_dir += 1
print(f'Total film/TV entries: {total}')
print(f'Missing director:      {no_dir}')
print(f'Have director:         {total - no_dir}')
