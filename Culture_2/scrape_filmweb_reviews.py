#!/usr/bin/env python3
"""Scrape the user's own Filmweb vote comments (short opinions) into a CSV.

Discovery (from a HAR capture of www.filmweb.pl/user/FuadSoudah):
  * The per-vote endpoint is PUBLIC (no cookie / no auth header):
        GET /api/v1/users/{userId}/votes/{medium}/{titleId}
        -> {"rate":7,"comment":"...","viewDate":20260430, ...}   (comment optional)
  * The bulk list endpoint (/votes/{medium}) is capped at 100 and 403s on ?page=2,
    so we DON'T paginate it. Instead we already have every title id the user rated
    in the Filmweb_export CSVs, and we hit the per-vote endpoint for each id.

Source ids come from the filmweb-export CSVs (in --csv-dir, default ~/Downloads):
    Filmweb_watched_film.csv     -> movieId   (medium=film)
    Filmweb_watched_serial.csv   -> serialId  (medium=serial)
    Filmweb_played_games.csv     -> gameId    (medium=videogame)

Output: filmweb_reviews.csv with columns
    medium,filmwebId,polishTitle,originalTitle,year,userRating,viewDate,comment
(only rows that actually have a comment).

Resumable via filmweb_reviews_cache.json. Flags: --dry-run, --limit N, --csv-dir DIR,
--user-id N, --force (re-fetch cached), --sleep SECONDS.
"""
import argparse
import csv
import json
import os
import sys
import time
import urllib.error
import urllib.request

USER_ID = 1881323  # FuadSoudah; override with --user-id
CACHE = "filmweb_reviews_cache.json"
OUT = "filmweb_reviews.csv"

# (csv filename, id column, medium for the API path)
SOURCES = [
    ("Filmweb_watched_film.csv", "movieId", "film"),
    ("Filmweb_watched_serial.csv", "serialId", "serial"),
    ("Filmweb_played_games.csv", "gameId", "videogame"),
]

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 culture-app/1.0"


def http_get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return {"_http_error": e.code}
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as e:
        return {"_error": str(e)}


def load_cache():
    if os.path.exists(CACHE):
        try:
            with open(CACHE, encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            pass
    return {}


def save_cache(c):
    tmp = CACHE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(c, f, ensure_ascii=False)
    os.replace(tmp, CACHE)


def read_sources(csv_dir):
    """Yield (medium, id, polishTitle, originalTitle, year, userRating) per CSV row."""
    for fname, idcol, medium in SOURCES:
        path = os.path.join(csv_dir, fname)
        if not os.path.exists(path):
            print(f"  (skip, not found: {path})")
            continue
        with open(path, encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                tid = (row.get(idcol) or "").strip()
                if not tid:
                    continue
                yield (
                    medium,
                    tid,
                    row.get("polishTitle", ""),
                    row.get("originalTitle", ""),
                    row.get("year", ""),
                    row.get("userRating", ""),
                )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv-dir", default=os.path.join(os.path.expanduser("~"), "Downloads"))
    ap.add_argument("--user-id", type=int, default=USER_ID)
    ap.add_argument("--limit", type=int, default=0, help="max API calls this run")
    ap.add_argument("--sleep", type=float, default=0.25, help="seconds between calls")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true", help="re-fetch cached ids")
    args = ap.parse_args()

    rows = list(read_sources(args.csv_dir))
    print(f"Source titles: {len(rows)} (csv-dir: {args.csv_dir})")
    by_medium = {}
    for r in rows:
        by_medium[r[0]] = by_medium.get(r[0], 0) + 1
    print("  by medium:", by_medium)

    if args.dry_run:
        print("DRY RUN — no calls. Would fetch up to",
              args.limit or len(rows), "vote details.")
        return

    cache = load_cache()
    calls = 0
    new_comments = 0
    for i, (medium, tid, ptitle, otitle, year, urating) in enumerate(rows):
        key = f"{medium}/{tid}"
        if key in cache and not args.force:
            continue
        if args.limit and calls >= args.limit:
            print(f"  hit --limit {args.limit}, stopping.")
            break
        url = f"https://www.filmweb.pl/api/v1/users/{args.user_id}/votes/{medium}/{tid}"
        data = http_get(url)
        calls += 1
        if "_http_error" in data or "_error" in data:
            # don't cache transient errors so they retry next run
            print(f"  ! {key}: {data}")
        else:
            comment = (data.get("comment") or "").strip()
            cache[key] = {
                "rate": data.get("rate"),
                "viewDate": data.get("viewDate"),
                "comment": comment,
            }
            if comment:
                new_comments += 1
                print(f"  + {key} ({otitle or ptitle}): {comment[:60]!r}")
        if calls % 25 == 0:
            save_cache(cache)
            print(f"  ... {calls} calls, {new_comments} new comments")
        time.sleep(args.sleep)

    save_cache(cache)

    # write CSV of everything cached that has a comment, joined to title metadata
    meta = {f"{r[0]}/{r[1]}": r for r in rows}
    out_rows = []
    for key, v in cache.items():
        if not v.get("comment"):
            continue
        m = meta.get(key)
        medium, tid = key.split("/", 1)
        out_rows.append({
            "medium": medium,
            "filmwebId": tid,
            "polishTitle": m[2] if m else "",
            "originalTitle": m[3] if m else "",
            "year": m[4] if m else "",
            "userRating": m[5] if m else (v.get("rate") or ""),
            "viewDate": v.get("viewDate") or "",
            "comment": v["comment"],
        })
    out_rows.sort(key=lambda r: (r["medium"], r["originalTitle"] or r["polishTitle"]))
    with open(OUT, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=[
            "medium", "filmwebId", "polishTitle", "originalTitle",
            "year", "userRating", "viewDate", "comment"])
        w.writeheader()
        w.writerows(out_rows)

    fetched = len([1 for v in cache.values()])
    print(f"\nDone. calls this run: {calls}; cached votes: {fetched}; "
          f"comments total: {len(out_rows)} -> {OUT}")
    if args.limit and calls >= args.limit:
        remaining = len(rows) - len([k for k in (f'{r[0]}/{r[1]}' for r in rows) if k in cache])
        print(f"~{remaining} titles still to fetch; rerun to continue (resumable).")


if __name__ == "__main__":
    main()
