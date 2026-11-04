#!/usr/bin/env python3
"""Recover dead OneDrive-hosted images/files from the Wayback Machine.

The site's OneDrive embed URLs (files.1drv.com, storage.live.com,
livefilestore.com, onedrive.live.com) use a deprecated token scheme and are
permanently dead. The files may still be archived at web.archive.org this
script finds and downloads what it can.

Usage (from the repository root, needs normal internet access):

    python3 scripts/recover_onedrive.py            # scan, query, download
    python3 scripts/recover_onedrive.py --dry-run  # scan + query only

Output:
    recovered/              downloaded files, named by URL hash + extension
    recovery-map.csv        one row per unique URL: status, snapshot, local path

The run is resumable: URLs already present in recovery-map.csv are skipped,
so you can stop and restart it freely.
"""

import argparse
import csv
import hashlib
import json
import mimetypes
import os
import re
import sys
import time
import urllib.parse
import urllib.request

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RECOVERED_DIR = os.path.join(REPO_ROOT, "recovered")
MAP_PATH = os.path.join(REPO_ROOT, "recovery-map.csv")

URL_RE = re.compile(
    r"https?://[^\"'\s)<>]*(?:onedrive\.live|1drv|storage\.live|livefilestore)"
    r"[^\"'\s)<>]*"
)
# Plain-HTTP embeds are blocked as mixed content on the HTTPS site, and most
# of these hosts (peepproject.com, old blogspot CDNs, ...) are dead anyway,
# so recover them from the archive too. Known-alive hosts were already
# rewritten to https in the pages themselves.
HTTP_RE = re.compile(r"http://[^\"'\s)<>]+")
HTTP_SKIP_HOSTS = ("www.w3.org", "w3.org", "schema.org", "localhost", "127.0.0.1")
SCAN_EXTENSIONS = {".html", ".htm", ".js", ".css"}
SKIP_DIRS = {".git", "node_modules", "recovered"}

CDX_API = "https://web.archive.org/cdx/search/cdx"
USER_AGENT = "onedrive-link-recovery-script (personal website repair)"
FIELDNAMES = ["url", "status", "snapshot_timestamp", "local_path",
              "content_type", "bytes"]


def scan_repo_urls():
    """Collect every unique OneDrive-family URL in the site's source files."""
    urls = set()
    for dirpath, dirnames, filenames in os.walk(REPO_ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            if os.path.splitext(name)[1].lower() not in SCAN_EXTENSIONS:
                continue
            path = os.path.join(dirpath, name)
            try:
                with open(path, "r", encoding="utf-8", errors="ignore") as fh:
                    text = fh.read()
            except OSError:
                continue
            urls.update(URL_RE.findall(text))
            for u in HTTP_RE.findall(text):
                host = urllib.parse.urlsplit(u).netloc.lower()
                if host and host not in HTTP_SKIP_HOSTS:
                    urls.add(u)
    return sorted(urls)


def http_get(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    return urllib.request.urlopen(req, timeout=timeout)


def cdx_lookup(url):
    """Return (timestamp, original) of the best snapshot, or None.

    Tries the exact URL first, then a prefix match on host+path (the path
    token is unique per file, so query-string variants of the same file
    still match).
    """
    attempts = []
    attempts.append({"url": url, "matchType": "exact"})
    parsed = urllib.parse.urlsplit(url)
    if parsed.query:
        attempts.append({"url": f"{parsed.netloc}{parsed.path}",
                         "matchType": "prefix"})
    for params in attempts:
        params.update({
            "output": "json",
            "filter": "statuscode:200",
            "limit": "5",
            "fl": "timestamp,original",
        })
        query = urllib.parse.urlencode(params)
        try:
            with http_get(f"{CDX_API}?{query}") as resp:
                rows = json.loads(resp.read().decode("utf-8") or "[]")
        except Exception as exc:  # noqa: BLE001 - report and move on
            print(f"    CDX error: {exc}", file=sys.stderr)
            time.sleep(5)
            continue
        if len(rows) > 1:  # rows[0] is the header
            # Prefer the largest/last snapshot of the candidates.
            ts, original = rows[-1][0], rows[-1][1]
            return ts, original
        time.sleep(0.5)
    return None


def download_snapshot(timestamp, original_url):
    """Download the raw archived object; return (bytes, content_type)."""
    # 'id_' serves the original bytes without Wayback's HTML rewrapping.
    snap_url = f"https://web.archive.org/web/{timestamp}id_/{original_url}"
    with http_get(snap_url, timeout=120) as resp:
        return resp.read(), resp.headers.get("Content-Type", "")


def extension_for(content_type, data):
    if data[:3] == b"\xff\xd8\xff":
        return ".jpg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    if data[:4] == b"GIF8":
        return ".gif"
    if data[:5] == b"%PDF-":
        return ".pdf"
    guess = mimetypes.guess_extension((content_type or "").split(";")[0].strip())
    return guess or ".bin"


def load_done():
    done = {}
    if os.path.exists(MAP_PATH):
        with open(MAP_PATH, newline="", encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                done[row["url"]] = row
    return done


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true",
                        help="query the archive but download nothing")
    parser.add_argument("--delay", type=float, default=1.0,
                        help="seconds to sleep between URLs (be polite)")
    args = parser.parse_args()

    urls = scan_repo_urls()
    done = load_done()
    todo = [u for u in urls if u not in done]
    print(f"{len(urls)} unique OneDrive URLs in repo; "
          f"{len(done)} already processed; {len(todo)} to go.")

    os.makedirs(RECOVERED_DIR, exist_ok=True)
    new_file = not os.path.exists(MAP_PATH)
    with open(MAP_PATH, "a", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDNAMES)
        if new_file:
            writer.writeheader()
        recovered = 0
        for i, url in enumerate(todo, 1):
            print(f"[{i}/{len(todo)}] {url[:100]}...")
            row = {"url": url, "status": "not_found",
                   "snapshot_timestamp": "", "local_path": "",
                   "content_type": "", "bytes": ""}
            hit = cdx_lookup(url)
            if hit and not args.dry_run:
                ts, original = hit
                try:
                    data, ctype = download_snapshot(ts, original)
                    ext = extension_for(ctype, data)
                    name = hashlib.sha1(url.encode()).hexdigest()[:16] + ext
                    local = os.path.join(RECOVERED_DIR, name)
                    with open(local, "wb") as out:
                        out.write(data)
                    row.update(status="recovered", snapshot_timestamp=ts,
                               local_path=os.path.relpath(local, REPO_ROOT),
                               content_type=ctype, bytes=str(len(data)))
                    recovered += 1
                    print(f"    recovered {len(data)} bytes ({ctype})")
                except Exception as exc:  # noqa: BLE001
                    row["status"] = f"error: {exc}"
                    print(f"    download failed: {exc}", file=sys.stderr)
            elif hit:
                row.update(status="found_dry_run", snapshot_timestamp=hit[0])
                recovered += 1
            writer.writerow(row)
            fh.flush()
            time.sleep(args.delay)
    print(f"Done. {recovered} of {len(todo)} URLs had archived copies. "
          f"See {os.path.relpath(MAP_PATH, REPO_ROOT)}.")


if __name__ == "__main__":
    main()
