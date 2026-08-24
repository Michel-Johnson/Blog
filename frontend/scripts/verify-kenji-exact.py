#!/usr/bin/env python3
"""Verify the local Kenji Endo exact mirror stays source-first.

The goal of the exact mirror is to preserve the captured original WordPress
pages and the original theme animation code, allowing only deterministic local
URL rewrites in script-local.js.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
import urllib.request
from pathlib import Path

import importlib.util

_builder_path = Path(__file__).with_name("build-kenji-exact.py")
_spec = importlib.util.spec_from_file_location("build_kenji_exact", _builder_path)
assert _spec and _spec.loader
builder = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(builder)

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "vendor" / "kenjiendo_live" / "pages" / "manifest.json"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125 Safari/537.36"
REMOTE_THEME = "http://kenjiendo.com/wp/wp-content/themes/kenjiendo_v2"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fail(msg: str, failures: list[str]) -> None:
    failures.append(msg)
    print(f"FAIL {msg}")


def ok(msg: str) -> None:
    print(f"OK   {msg}")


def fetch_remote(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=25) as resp:
        return resp.read()


def expected_script_local() -> str:
    src = ROOT / "vendor" / "kenjiendo_v2" / "js" / "script.js"
    s = src.read_text(errors="ignore")
    s = s.replace("http://kenjiendo.com/testsite/wp-content/themes/kenjiendo_v2", "./vendor/kenjiendo_v2")
    s = s.replace("http://kenjiendo.com/wp/wp-content/themes/kenjiendo_v2", "./vendor/kenjiendo_v2")
    return s


def verify_remote_vendor_sources(failures: list[str]) -> None:
    """Confirm vendored theme CSS/JS still match the current original site."""
    checks = [
        (REMOTE_THEME + "/css/style.css", ROOT / "vendor" / "kenjiendo_v2" / "css" / "style.css"),
        (REMOTE_THEME + "/js/script.js", ROOT / "vendor" / "kenjiendo_v2" / "js" / "script.js"),
    ]
    for url, local in checks:
        if not local.exists():
            fail(f"missing local vendor source for remote check: {local.relative_to(ROOT)}", failures)
            continue
        try:
            remote = fetch_remote(url)
        except Exception as exc:  # noqa: BLE001 - verifier should report network failure clearly
            fail(f"could not fetch remote vendor source {url}: {type(exc).__name__}: {exc}", failures)
            continue
        local_bytes = local.read_bytes()
        if remote == local_bytes:
            ok(f"remote vendor matches local: {url}")
        else:
            fail(
                f"remote vendor differs: {url} local={hashlib.sha256(local_bytes).hexdigest()} remote={hashlib.sha256(remote).hexdigest()}",
                failures,
            )


def verify_pages(failures: list[str]) -> None:
    pages = builder.load_manifest()
    ok(f"manifest pages loaded: {len(pages)}")
    generated = 0
    for url, item in sorted(pages.items()):
        src = ROOT / item["file"]
        dst = ROOT / item["local"]
        if not src.exists():
            fail(f"missing captured source for {url}: {item['file']}", failures)
            continue
        if not dst.exists():
            fail(f"missing generated local page for {url}: {item['local']}", failures)
            continue
        expected, _counts = builder.rewrite(src.read_bytes(), {u: p["local"] for u, p in pages.items()})
        actual = dst.read_bytes()
        if actual != expected:
            fail(f"page differs from allowed rewrite: {item['local']}", failures)
        else:
            generated += 1
    ok(f"pages matching allowed rewrite: {generated}/{len(pages)}")

    alias = ROOT / "kenji-exact.html"
    home = ROOT / "kenji-exact-home.html"
    if alias.exists() and home.exists() and alias.read_bytes() == home.read_bytes():
        ok("kenji-exact.html alias matches home")
    else:
        fail("kenji-exact.html alias is missing or differs from home", failures)


def verify_no_local_visual_patches(failures: list[str]) -> None:
    refs = []
    patterns = [b"kenji-exact-local.css", b"mask-clean", b"title-particles", b"real-text", b"original-text"]
    for path in ROOT.glob("kenji-exact*.html"):
        data = path.read_bytes()
        for pat in patterns:
            if pat in data:
                refs.append(f"{path.name}: {pat.decode()}")
    if refs:
        fail("local visual patch markers found: " + "; ".join(refs[:10]), failures)
    else:
        ok("no local visual patch refs in exact pages")


def verify_vendor_code(failures: list[str]) -> None:
    css = ROOT / "vendor" / "kenjiendo_v2" / "css" / "style.css"
    js = ROOT / "vendor" / "kenjiendo_v2" / "js" / "script.js"
    jsl = ROOT / "vendor" / "kenjiendo_v2" / "js" / "script-local.js"
    for p in (css, js, jsl):
        if not p.exists():
            fail(f"missing vendor file: {p.relative_to(ROOT)}", failures)
            return
    print(f"INFO css sha256          {sha256(css)}")
    print(f"INFO original js sha256  {sha256(js)}")
    print(f"INFO local js sha256     {sha256(jsl)}")
    if jsl.read_text(errors="ignore") == expected_script_local():
        ok("script-local.js differs only by local path rewrites")
    else:
        fail("script-local.js contains changes beyond allowed path rewrites", failures)

    style = css.read_text(errors="ignore")
    for token in [".create_t", "#mask", ".gra", ".borders", ".btn_box"]:
        if token not in style:
            fail(f"theme css missing expected original selector {token}", failures)
        else:
            ok(f"theme css includes {token}")


def verify_assets(failures: list[str]) -> None:
    missing: set[str] = set()
    for path in ROOT.glob("kenji-exact*.html"):
        html = path.read_bytes()
        for m in re.finditer(rb"(?:src|href|data-src)=['\"](\./vendor/[^'\"]+)['\"]", html):
            asset = m.group(1).decode("utf-8", "replace").split("?", 1)[0]
            if not (ROOT / asset[2:]).exists():
                missing.add(f"{path.name}: {asset}")
    if missing:
        fail("missing vendored assets: " + "; ".join(sorted(missing)[:20]), failures)
    else:
        ok("all directly referenced vendored assets exist")


def verify_local_routing(failures: list[str]) -> None:
    """Confirm the isolated source mirror has stable local entry points.

    Michel's adapted homepage can keep its own Gallery theme without redirecting
    into the exact mirror.  The exact-fidelity contract for this verifier is the
    kenji-exact-* surface itself: those pages must remain reachable and must not
    be mixed with Michel's homepage shell, styles, or runtime.
    """
    theme = ROOT / "blog-theme.js"
    exact_home = ROOT / "kenji-exact-home.html"
    checks = [
        (theme, "./kenji-exact-home.html"),
        (exact_home, "./vendor/kenjiendo_v2/css/style.css"),
        (exact_home, "./vendor/kenjiendo_v2/js/script-local.js"),
        (exact_home, "<html data-dir=\"./vendor/kenjiendo_v2\" class=\"nowonhome\""),
    ]
    for path, token in checks:
        if not path.exists():
            fail(f"missing routing file: {path.relative_to(ROOT)}", failures)
            continue
        if token in path.read_text(errors="ignore"):
            ok(f"routing includes {token!r} in {path.relative_to(ROOT)}")
        else:
            fail(f"routing missing {token!r} in {path.relative_to(ROOT)}", failures)

    index = ROOT / "index.html"
    if index.exists() and "./kenji-exact-home.html" in index.read_text(errors="ignore"):
        ok("public Gallery entry routes into exact mirror before adapted homepage paints")
    else:
        fail("public Gallery entry does not route into exact mirror", failures)


def main() -> int:
    failures: list[str] = []
    remote_live = "--remote-live" in sys.argv[1:]
    if not MANIFEST.exists():
        fail("missing crawl manifest", failures)
    else:
        manifest = json.loads(MANIFEST.read_text())
        ok(f"crawl manifest exists: {len(manifest)} entries")
    if remote_live:
        verify_remote_vendor_sources(failures)
    else:
        ok("remote live vendor check skipped; run with --remote-live to compare current kenjiendo.com CSS/JS")
    verify_pages(failures)
    verify_no_local_visual_patches(failures)
    verify_vendor_code(failures)
    verify_assets(failures)
    verify_local_routing(failures)
    if failures:
        print("\nVerification failed:")
        for item in failures:
            print(f"  - {item}")
        return 1
    print("\nVerification passed: local exact mirror matches captured sources under allowed rewrites.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
