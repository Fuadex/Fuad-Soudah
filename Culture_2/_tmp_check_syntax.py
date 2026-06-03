import re, sys
sys.stdout.reconfigure(encoding='utf-8')
with open('imports.js', encoding='utf-8') as f:
    lines = f.readlines()

problems = []
for i, line in enumerate(lines, 1):
    # Detect lines with an unescaped apostrophe INSIDE a single-quoted JS string
    # Pattern: 'any chars, then an apostrophe not preceded by backslash, then more chars'
    # Simplest heuristic: find 'word's (letter-apostrophe-letter)
    if re.search(r"'[^'\\n\\\\]*[^\\\\]'[a-zA-Z]", line):
        problems.append((i, line.rstrip()[:150]))

print(f"Checking {len(lines)} lines...")
if problems:
    print("Possible syntax issues:")
    for ln, txt in problems:
        print(f"  line {ln}: {txt}")
else:
    print("No obvious apostrophe issues found")
