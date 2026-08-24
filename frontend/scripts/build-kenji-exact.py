#!/usr/bin/env python3
"""Build local Kenji Endo mirror pages from captured original HTML snapshots.

The mirror is intentionally source-first: we preserve the original WordPress
markup and animation code and only rewrite URLs so pages/assets resolve from the
local vendored copy.  Pages are generated from the crawl manifest when present,
so news pagination and blog detail pages are mirrored too instead of just the
few top-level pages.
"""
from __future__ import annotations

from pathlib import Path
import json
import re
import urllib.parse
import urllib.request
from collections import Counter

ROOT = Path(__file__).resolve().parents[1]
PAGES_DIR = ROOT / "vendor" / "kenjiendo_live" / "pages"
MANIFEST = PAGES_DIR / "manifest.json"
BASE = "http://kenjiendo.com/"

FALLBACK_PAGES = {
    "http://kenjiendo.com/": {
        "file": "vendor/kenjiendo_live/kenjiendo.com.html",
        "local": "kenji-exact-home.html",
    },
    "http://kenjiendo.com/about/": {
        "file": "vendor/kenjiendo_live/about.html",
        "local": "kenji-exact-about.html",
    },
    "http://kenjiendo.com/album/": {
        "file": "vendor/kenjiendo_live/album.html",
        "local": "kenji-exact-album.html",
    },
    "http://kenjiendo.com/news/": {
        "file": "vendor/kenjiendo_live/news.html",
        "local": "kenji-exact-news.html",
    },
    "http://kenjiendo.com/contact/": {
        "file": "vendor/kenjiendo_original/contact.html",
        "local": "kenji-exact-contact.html",
    },
}

ASSET_REWRITES: list[tuple[bytes, bytes]] = [
    (b"http://kenjiendo.com/wp/wp-content/plugins/contact-form-7/includes/css/styles.css?ver=4.4.2", b"./vendor/kenjiendo_wp/contact-form-7/includes/css/styles.css?ver=4.4.2"),
    (b"http://kenjiendo.com/wp/wp-content/plugins/contact-form-7/includes/js/jquery.form.min.js?ver=3.51.0-2014.06.20", b"./vendor/kenjiendo_wp/contact-form-7/js/jquery.form.min.js?ver=3.51.0-2014.06.20"),
    (b"http://kenjiendo.com/wp/wp-content/plugins/contact-form-7/includes/js/scripts.js?ver=4.4.2", b"./vendor/kenjiendo_wp/contact-form-7/js/scripts.js?ver=4.4.2"),
    (b"http://kenjiendo.com/wp/wp-includes/js/jquery/jquery.js?ver=1.12.4", b"./vendor/kenjiendo_wp/jquery/jquery.js?ver=1.12.4"),
    (b"http://kenjiendo.com/wp/wp-includes/js/jquery/jquery-migrate.min.js?ver=1.4.1", b"./vendor/kenjiendo_wp/jquery/jquery-migrate.min.js?ver=1.4.1"),
    (b"http://kenjiendo.com/wp/wp-includes/js/wp-embed.min.js?ver=4.5.32", b"./vendor/kenjiendo_wp/wp-includes/js/wp-embed.min.js?ver=4.5.32"),
    (b"http://kenjiendo.com/wp/wp-content/themes/kenjiendo_v1/common/img/favicon.ico", b"./vendor/kenjiendo_v1/common/img/favicon.ico"),
    (b"http://kenjiendo.com/wp/wp-content/themes/kenjiendo_v2/css/style.css", b"./vendor/kenjiendo_v2/css/style.css"),
    # Use a localised copy only for path fixes. It is the original script plus
    # deterministic local URL rewrites; all animation algorithms are original.
    (b"http://kenjiendo.com/wp/wp-content/themes/kenjiendo_v2/js/script.js", b"./vendor/kenjiendo_v2/js/script-local.js"),
    (b"http://kenjiendo.com/wp/wp-content/themes/kenjiendo_v2", b"./vendor/kenjiendo_v2"),
    (b"http://kenjiendo.com/wp/wp-content/uploads", b"./vendor/kenjiendo_wp/uploads"),
    (b"http://kenjiendo.com/testsite/wp-content/themes/kenjiendo_v2", b"./vendor/kenjiendo_v2"),
    (b"http://kenjiendo.com/testsite/wp-content/uploads/sites/2", b"./vendor/kenjiendo_wp/uploads"),
    (b"http://kenjiendo.com/testsite/wp-content/uploads", b"./vendor/kenjiendo_wp/uploads"),
]

KENJI_RE = re.compile(rb"http://kenjiendo\.com[^\s\"'<>)]*")
ABS_PAGE_RE = re.compile(rb"http://kenjiendo\.com/(?:news/page/\d+/|blog/[^\"'<>\s)]*/|about/|album/|news/)?")
HREF_SRC_RE = re.compile(rb"\b(href|src|data-src)=([\"'])(.*?)(\2)", re.I | re.S)
CF7_LOADER_ESCAPED = (
    b"http:\\/\\/kenjiendo.com\\/wp\\/wp-content\\/plugins\\/contact-form-7\\/images\\/ajax-loader.gif",
    b".\\/vendor\\/kenjiendo_wp\\/contact-form-7\\/images\\/ajax-loader.gif",
)
EMOJI_ESCAPED = (
    b"http:\\/\\/kenjiendo.com\\/wp\\/wp-includes\\/js\\/wp-emoji-release.min.js?ver=4.5.32",
    b".\\/vendor\\/kenjiendo_wp\\/wp-includes\\/js\\/wp-emoji-release.min.js?ver=4.5.32",
)


def canonical(url: str) -> str:
    p = urllib.parse.urlparse(urllib.parse.urljoin(BASE, url.replace("&#038;", "&")))
    path = p.path or "/"
    if not path.endswith("/") and "." not in path.rsplit("/", 1)[-1]:
        path += "/"
    return urllib.parse.urlunparse(("http", "kenjiendo.com", path, "", "", ""))


def load_manifest() -> dict[str, dict[str, str]]:
    pages = dict(FALLBACK_PAGES)
    if MANIFEST.exists():
        pages.update(json.loads(MANIFEST.read_text()))
    # The live /contact/ route is currently 404, but an older captured contact
    # page is present and useful for matching the original navigation/footer.
    pages.setdefault("http://kenjiendo.com/contact/", FALLBACK_PAGES["http://kenjiendo.com/contact/"])
    return {canonical(k): v for k, v in pages.items() if v.get("local") and v.get("file")}


def replace_count(data: bytes, old: bytes, new: bytes, counts: Counter[str]) -> bytes:
    n = data.count(old)
    if n:
        data = data.replace(old, new)
        counts[old.decode("utf-8", "replace")] += n
    return data


URL_END = rb"(?=$|[\"'<>\s)])"
ROUTE_ATTR_NAMES = {b"href", b"src", b"data-src"}
PRESERVE_REL_VALUES = {b"https://api.w.org/", b"shortlink"}


def replace_url_count(data: bytes, old: bytes, new: bytes, counts: Counter[str]) -> bytes:
    """Replace an exact HTML URL without matching path prefixes.

    A plain byte replace turns ``http://kenjiendo.com/wp-json/`` into
    ``./kenji-exact-home.htmlwp-json/`` because the home URL is a prefix of the
    API URL.  For page-route rewrites we only want complete URL tokens, not
    longer URLs that merely start with a captured route.
    """
    pattern = re.compile(re.escape(old) + URL_END)
    n = len(pattern.findall(data))
    if n:
        data = pattern.sub(new, data)
        counts[old.decode("utf-8", "replace")] += n
    return data


def rewrite_attrs(data: bytes, url_to_local: dict[str, str], counts: Counter[str]) -> bytes:
    def sub(m: re.Match[bytes]) -> bytes:
        name, quote, raw, endq = m.group(1), m.group(2), m.group(3), m.group(4)
        start = max(0, m.start() - 260)
        tag_prefix = data[start:m.start()]
        if name.lower() in ROUTE_ATTR_NAMES:
            current_tag = tag_prefix.rsplit(b"<", 1)[-1]
            if current_tag.lstrip().lower().startswith(b"link"):
                rel_match = re.search(rb"\brel=([\"'])(.*?)(\1)", current_tag, re.I | re.S)
                if rel_match and rel_match.group(2) in PRESERVE_REL_VALUES:
                    return m.group(0)
        value = raw.decode("utf-8", "replace")
        fixed = value.replace("&#038;", "&")
        local = None
        if fixed.startswith("http://kenjiendo.com"):
            parsed = urllib.parse.urlparse(fixed)
            path = parsed.path or "/"
            # WordPress shortlinks and in-content attachment links such as
            # http://kenjiendo.com/?p=585 are not captured page routes.  Keep
            # them verbatim for source fidelity instead of canonicalizing the
            # empty path to the home page and incorrectly rewriting them to
            # kenji-exact-home.html.
            if path == "/" and parsed.query.startswith("p="):
                return m.group(0)
            if path.startswith("/testsite/wp-content/uploads/sites/2/"):
                local = "./vendor/kenjiendo_wp/uploads/" + path.split("/testsite/wp-content/uploads/sites/2/", 1)[1]
            elif path.startswith("/testsite/wp-content/uploads/"):
                local = "./vendor/kenjiendo_wp/uploads/" + path.split("/testsite/wp-content/uploads/", 1)[1]
            elif path.startswith("/wp/wp-content/uploads/"):
                local = "./vendor/kenjiendo_wp/uploads/" + path.split("/wp/wp-content/uploads/", 1)[1]
            elif path.startswith("/wp/wp-content/themes/kenjiendo_v2/img/"):
                local = "./vendor/kenjiendo_v2/img/" + path.rsplit("/", 1)[-1]
            else:
                key = canonical(fixed)
                local = url_to_local.get(key)
        elif fixed.startswith("/") and not fixed.startswith("//"):
            key = canonical(fixed)
            local = url_to_local.get(key)
            if local is None and fixed.startswith("/wp/wp-content/themes/kenjiendo_v2/img/"):
                local = "./vendor/kenjiendo_v2/img/" + fixed.rsplit("/", 1)[-1]
            elif local is None and fixed.startswith("/wp/wp-content/uploads/"):
                local = "./vendor/kenjiendo_wp/uploads/" + fixed.split("/wp/wp-content/uploads/", 1)[1]
            elif local is None and fixed == "/img/kenjiendo2.png":
                local = "./vendor/kenjiendo_v2/img/kenjiendo2.png"
        if local is None:
            return m.group(0)
        counts[f"attr:{value}"] += 1
        return name + b"=" + quote + local.encode() + endq

    return HREF_SRC_RE.sub(sub, data)


def collect_missing_vendor_assets() -> list[str]:
    missing: set[str] = set()
    for path in ROOT.glob("kenji-exact-*.html"):
        html = path.read_bytes()
        for m in re.finditer(rb"(?:src|href|data-src)=[\"'](\./vendor/[^\"']+)[\"']", html):
            asset_url = m.group(1).decode("utf-8", "replace").split("?", 1)[0]
            if not (ROOT / asset_url[2:]).exists():
                missing.add(asset_url)
    return sorted(missing)


def source_urls_for_vendor_asset(asset_url: str) -> list[str]:
    rel = asset_url.removeprefix("./vendor/kenjiendo_wp/uploads/")
    if rel != asset_url:
        quoted = "/".join(urllib.parse.quote(part) for part in rel.split("/"))
        return [
            "http://kenjiendo.com/wp/wp-content/uploads/" + quoted,
            "http://kenjiendo.com/testsite/wp-content/uploads/sites/2/" + quoted,
            "http://kenjiendo.com/testsite/wp-content/uploads/" + quoted,
        ]
    rel = asset_url.removeprefix("./vendor/kenjiendo_v2/")
    if rel != asset_url:
        quoted = "/".join(urllib.parse.quote(part) for part in rel.split("/"))
        return ["http://kenjiendo.com/wp/wp-content/themes/kenjiendo_v2/" + quoted]
    return []


def fetch_missing_assets(missing: list[str], limit: int | None = None) -> list[str]:
    failed: list[str] = []
    headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125 Safari/537.36"}
    for index, asset_url in enumerate(missing):
        if limit is not None and index >= limit:
            break
        dest = ROOT / asset_url[2:]
        dest.parent.mkdir(parents=True, exist_ok=True)
        ok = False
        for source_url in source_urls_for_vendor_asset(asset_url):
            try:
                req = urllib.request.Request(source_url, headers=headers)
                with urllib.request.urlopen(req, timeout=20) as resp:
                    data = resp.read()
                    if len(data) < 32:
                        raise RuntimeError("too small")
                    dest.write_bytes(data)
                    print(f"FETCH {asset_url} <- {source_url} ({len(data)} bytes)")
                    ok = True
                    break
            except Exception as exc:  # noqa: BLE001 - downloader should try fallbacks
                last = f"{source_url}: {type(exc).__name__}: {exc}"
        if not ok:
            failed.append(f"{asset_url} ({last if 'last' in locals() else 'no source'})")
            print(f"MISS  {asset_url}")
    return failed


def rewrite(data: bytes, url_to_local: dict[str, str]) -> tuple[bytes, Counter[str]]:
    counts: Counter[str] = Counter()
    out = data
    for old, new in ASSET_REWRITES:
        out = replace_count(out, old, new, counts)

    # Route every captured internal page to its generated local counterpart.
    for url, local in sorted(url_to_local.items(), key=lambda kv: len(kv[0]), reverse=True):
        out = replace_url_count(out, url.encode(), ("./" + local).encode(), counts)
        # WordPress sometimes HTML-escapes query separators in generated attrs.
        out = replace_url_count(out, url.replace("&", "&#038;").encode(), ("./" + local).encode(), counts)

    out = rewrite_attrs(out, url_to_local, counts)

    # Preserve original WordPress metadata/emoji/analytics blocks for source
    # fidelity.  Only localize escaped runtime asset URLs that would otherwise
    # fail or hit the network from the mirrored page.
    out = replace_count(out, *CF7_LOADER_ESCAPED, counts)
    out = replace_count(out, *EMOJI_ESCAPED, counts)

    # Keep Google Fonts as-is because it affects visual fidelity; leave external
    # social/music links as-is because they are intentional outbound links.
    return out, counts


def build_script_local() -> None:
    src = ROOT / "vendor" / "kenjiendo_v2" / "js" / "script.js"
    dst = ROOT / "vendor" / "kenjiendo_v2" / "js" / "script-local.js"
    if not src.exists():
        return
    s = src.read_text(errors="ignore")
    s = s.replace("http://kenjiendo.com/testsite/wp-content/themes/kenjiendo_v2", "./vendor/kenjiendo_v2")
    dst.write_text(s)


def main() -> int:
    pages = load_manifest()
    url_to_local = {url: item["local"] for url, item in pages.items()}
    build_script_local()

    all_remaining: dict[str, list[str]] = {}
    generated = 0
    print(f"Building Kenji exact local pages from {len(pages)} captured snapshots...\n")
    for url, item in sorted(pages.items()):
        src_path = ROOT / item["file"]
        dest = item["local"]
        dest_path = ROOT / dest
        if not src_path.exists():
            print(f"SKIP missing source for {url}: {item['file']}")
            continue
        original = src_path.read_bytes()
        local, counts = rewrite(original, url_to_local)
        dest_path.write_bytes(local)
        generated += 1
        remaining = sorted(set(m.group(0).decode("utf-8", "replace") for m in KENJI_RE.finditer(local)))
        # Ignore intentional external-ish metadata/social endpoints in summary.
        visible_remaining = [r for r in remaining if not any(x in r for x in ("wp-json", "?p=", "xmlrpc.php"))]
        all_remaining[dest] = visible_remaining
        print(f"{dest}")
        print(f"  url: {url}")
        print(f"  source: {item['file']}")
        print(f"  bytes: {len(original)} -> {len(local)}")
        print(f"  rewrites: {sum(counts.values())}")
        for key, value in counts.most_common(8):
            print(f"    {value:3d}  {key}")
        print(f"  remaining visible kenjiendo.com refs: {len(visible_remaining)}")
        for ref in visible_remaining[:8]:
            print(f"    - {ref}")
        if len(visible_remaining) > 8:
            print(f"    ... {len(visible_remaining) - 8} more")
        print()

    (ROOT / "kenji-exact.html").write_bytes((ROOT / "kenji-exact-home.html").read_bytes())

    missing_assets: list[str] = []
    for item in sorted(url_to_local.values()):
        path = ROOT / item
        if not path.exists():
            continue
        html = path.read_bytes()
        for m in re.finditer(rb"(?:src|href|data-src)=[\"'](\./vendor/[^\"']+)[\"']", html):
            asset_url = m.group(1).decode("utf-8", "replace").split("?", 1)[0]
            if not (ROOT / asset_url[2:]).exists():
                missing_assets.append(f"{item}: {asset_url}")
    if missing_assets:
        print("Missing local vendored assets:")
        for item in missing_assets[:80]:
            print(f"  - {item}")
        if len(missing_assets) > 80:
            print(f"  ... {len(missing_assets) - 80} more")
    else:
        print("All directly referenced ./vendor assets exist.")

    total_remaining = sum(len(v) for v in all_remaining.values())
    print(f"\nGenerated pages: {generated}")
    print(f"Remaining visible kenjiendo.com refs across generated pages: {total_remaining}")
    return 0 if not missing_assets else 1


if __name__ == "__main__":
    raise SystemExit(main())
