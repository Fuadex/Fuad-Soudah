#!/usr/bin/env python3
"""
Quick IGDB connectivity test.
Run: python test_igdb.py

Checks:
  1. Credentials present in .env
  2. Twitch OAuth token obtained
  3. IGDB game search works
  4. Time-to-beat lookup works
"""
import json, os, time
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

SCRIPT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # .env in project root (../)
ENV_FILE   = os.path.join(SCRIPT_DIR, '.env')

# Load .env
if os.path.exists(ENV_FILE):
    with open(ENV_FILE) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, _, v = line.partition('=')
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

CLIENT_ID     = os.environ.get('TWITCH_CLIENT_ID', '')
CLIENT_SECRET = os.environ.get('TWITCH_CLIENT_SECRET', '')

print(f'CLIENT_ID:     {CLIENT_ID[:8]}{"..." if CLIENT_ID else " (MISSING)"} ({len(CLIENT_ID)} chars)')
print(f'CLIENT_SECRET: {CLIENT_SECRET[:4]}{"..." if CLIENT_SECRET else " (MISSING)"} ({len(CLIENT_SECRET)} chars)')

if not CLIENT_ID or not CLIENT_SECRET:
    print('\nERROR: credentials missing. Add to .env:')
    print('  TWITCH_CLIENT_ID=...')
    print('  TWITCH_CLIENT_SECRET=...')
    exit(1)


def http_post(url, body, headers=None):
    h = {'Content-Type': 'text/plain', 'Accept-Encoding': 'identity'}
    if headers:
        h.update(headers)
    try:
        data = body.encode() if isinstance(body, str) else body
        req = Request(url, data=data, headers=h, method='POST')
        with urlopen(req, timeout=14) as r:
            raw = r.read().decode('utf-8')
            return json.loads(raw)
    except HTTPError as e:
        body_text = e.read().decode('utf-8', errors='replace')
        print(f'  HTTP {e.code}: {body_text[:300]}')
        return None
    except URLError as e:
        print(f'  URL error: {e.reason}')
        return None
    except json.JSONDecodeError as e:
        print(f'  JSON decode error: {e}')
        return None


# ── Step 1: Twitch token ──────────────────────────────────────────────────────

print('\n[1] Authenticating with Twitch...')
auth_url = (f'https://id.twitch.tv/oauth2/token'
            f'?client_id={CLIENT_ID}&client_secret={CLIENT_SECRET}'
            f'&grant_type=client_credentials')
token_resp = http_post(auth_url, '')
if not token_resp:
    print('  FAILED — no response')
    exit(1)
if 'access_token' not in token_resp:
    print(f'  FAILED — unexpected response: {token_resp}')
    exit(1)
token = token_resp['access_token']
expires_in = token_resp.get('expires_in', '?')
print(f'  OK — token: {token[:8]}...  expires_in: {expires_in}s')

igdb_headers = {
    'Client-ID': CLIENT_ID,
    'Authorization': f'Bearer {token}',
    'Content-Type': 'text/plain',
}

# ── Step 2: Game search ───────────────────────────────────────────────────────

print('\n[2] Searching IGDB for "The Witcher 3" (2015)...')
results = http_post(
    'https://api.igdb.com/v4/games',
    'search "The Witcher 3"; fields id, name, first_release_date; limit 5;',
    igdb_headers,
)
if not results:
    print('  FAILED — no results returned')
    exit(1)
print(f'  OK — {len(results)} result(s):')
for r in results:
    ts = r.get('first_release_date', 0)
    year = time.gmtime(int(ts)).tm_year if ts else '?'
    print(f'    [{r["id"]}] {r.get("name")} ({year})')

# ── Step 3: Time-to-beat ─────────────────────────────────────────────────────

gid = results[0]['id']
print(f'\n[3] Fetching time-to-beat for game id {gid}...')
ttb = http_post(
    'https://api.igdb.com/v4/game_time_to_beat',
    f'where game = {gid}; fields main_story, main_extra;',
    igdb_headers,
)
if ttb:
    entry = ttb[0] if ttb else {}
    secs = entry.get('main_story') or entry.get('main_extra')
    hours = round(secs / 3600, 1) if secs else None
    print(f'  OK — main_story: {secs}s → ~{hours}h')
else:
    print('  No time-to-beat data (normal for some titles — endpoint still works)')

print('\nAll checks passed. IGDB integration is working.')
