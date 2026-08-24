#!/usr/bin/env python3
"""Fetch Kenji Endo HTML pages needed for a fuller local mirror.

Only crawls kenjiendo.com HTML pages that are part of the original site content
(top-level pages, news pagination, and blog detail pages). External music/social
links and WP API endpoints are intentionally excluded.
"""
from __future__ import annotations

import json
import hashlib
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path
from collections import deque

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "vendor" / "kenjiendo_live" / "pages"
MANIFEST = OUT / "manifest.json"
BASE = "http://kenjiendo.com/"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125 Safari/537.36"

SEEDS = [
    "http://kenjiendo.com/",
    "http://kenjiendo.com/about/",
    "http://kenjiendo.com/album/",
    "http://kenjiendo.com/news/",
    "http://kenjiendo.com/contact/",
]

HREF_RE = re.compile(rb'''href=["']([^"'#]+)(?:#[^"']*)?["']''', re.I)


def allowed(url: str) -> bool:
    p = urllib.parse.urlparse(url)
    if p.scheme not in ("http", "https") or p.netloc != "kenjiendo.com":
        return False
    path = p.path or "/"
    if path in ("/", "/about/", "/album/", "/news/", "/contact/"):
        return True
    if re.fullmatch(r"/news/page/\d+/", path):
        return True
    if path.startswith("/blog/") and path.endswith("/"):
        return True
    return False


def canonical(url: str) -> str:
    p = urllib.parse.urlparse(urllib.parse.urljoin(BASE, url))
    path = p.path or "/"
    if not path.endswith("/") and "." not in path.rsplit("/", 1)[-1]:
        path += "/"
    return urllib.parse.urlunparse(("http", "kenjiendo.com", path, "", "", ""))


def filename_for(url: str) -> str:
    path = urllib.parse.urlparse(url).path.strip("/")
    if not path:
        return "home.html"
    slug = re.sub(r"[^A-Za-z0-9._-]+", "__", path)
    # Some old Japanese WordPress slugs are percent-encoded and easily exceed
    # macOS' 255-byte filename limit after sanitising.  Keep a readable prefix
    # and append a deterministic URL hash so the crawl can continue without
    # changing the canonical URL stored in the manifest.
    if len(slug.encode("utf-8")) > 170:
        digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:16]
        slug = slug.encode("utf-8")[:150].decode("utf-8", "ignore").rstrip("._-") + "__" + digest
    return slug + ".html"


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,*/*"})
    with urllib.request.urlopen(req, timeout=25) as resp:
        ctype = resp.headers.get("content-type", "")
        if "text/html" not in ctype:
            raise RuntimeError(f"not html: {ctype}")
        return resp.read()


def links_from(html: bytes, base: str) -> list[str]:
    out = []
    for raw in HREF_RE.findall(html):
        href = raw.decode("utf-8", "ignore").replace("&#038;", "&")
        u = canonical(urllib.parse.urljoin(base, href))
        if allowed(u):
            out.append(u)
    return out


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, dict[str, str]] = {}
    if MANIFEST.exists():
        try:
            manifest = json.loads(MANIFEST.read_text())
        except Exception:
            manifest = {}

    q = deque(canonical(u) for u in SEEDS)
    seen = set(q)
    errors: dict[str, str] = {}

    try:
        while q:
            url = q.popleft()
            fn = filename_for(url)
            path = OUT / fn
            if path.exists() and path.stat().st_size > 1000:
                html = path.read_bytes()
                print(f"cached {url} -> {fn} ({len(html)} bytes)")
            else:
                try:
                    print(f"fetch  {url}")
                    html = fetch(url)
                    path.write_bytes(html)
                    time.sleep(0.5)
                except Exception as e:
                    errors[url] = f"{type(e).__name__}: {e}"
                    print(f"ERROR  {url}: {errors[url]}")
                    continue
            manifest[url] = {"file": str(path.relative_to(ROOT)), "local": ""}
            for link in links_from(html, url):
                if link not in seen:
                    seen.add(link)
                    q.append(link)
    finally:
        # Even when the remote site times out, keep the discovered/cached page
        # map.  The build step can then mirror every page we already have.
        pass

    # Assign stable local output names.  Keep top-level compatibility names.
    local_names = {
        "http://kenjiendo.com/": "kenji-exact-home.html",
        "http://kenjiendo.com/about/": "kenji-exact-about.html",
        "http://kenjiendo.com/album/": "kenji-exact-album.html",
        "http://kenjiendo.com/news/": "kenji-exact-news.html",
        "http://kenjiendo.com/contact/": "kenji-exact-contact.html",
    }
    for url, item in manifest.items():
        if url not in local_names:
            path = urllib.parse.urlparse(url).path.strip("/") or "home"
            local_names[url] = "kenji-exact-" + re.sub(r"[^A-Za-z0-9._-]+", "-", path).strip("-") + ".html"
        item["local"] = local_names[url]
    MANIFEST.write_text(json.dumps({k: manifest[k] for k in sorted(manifest)}, indent=2, ensure_ascii=False) + "\n")

    print(f"\nPages known: {len(manifest)}")
    if errors:
        print("Errors:")
        for u, e in errors.items():
            print(f"  - {u}: {e}")
    else:
        print("No fetch errors.")
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
