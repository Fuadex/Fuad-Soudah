import re, sys
sys.stdout.reconfigure(encoding='utf-8')
codes = set()
for fname in ['imports.js', 'data.js']:
    with open(fname, encoding='utf-8') as f:
        txt = f.read()
    for m in re.finditer(r'"region"\s*:\s*"([a-z]+)"', txt):
        codes.add(m.group(1))
    for m in re.finditer(r"'region'\s*:\s*'([a-z]+)'", txt):
        codes.add(m.group(1))
    for m in re.finditer(r'region\s*:\s*["\']([a-z]+)["\']', txt):
        codes.add(m.group(1))
print(sorted(codes))
