#!/usr/bin/env python3
"""Build a self-contained handwriting alphabet lab HTML file."""

from __future__ import annotations

import base64
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SOURCE_HTML = ROOT / "handwriting-alphabet-lab.html"
SOURCE_CSS = ROOT / "handwriting-alphabet-lab.css"
SOURCE_DATA = ROOT / "handwriting-alphabet-data.js"
SOURCE_JS = ROOT / "handwriting-alphabet-lab.js"
SOURCE_FONT = ROOT / "assets/fonts/caveat-latin-wght-normal.woff2"
OUTPUT = ROOT / "handwriting-alphabet-updated.html"


def main() -> None:
    html = SOURCE_HTML.read_text(encoding="utf-8")
    css = SOURCE_CSS.read_text(encoding="utf-8")
    data = SOURCE_DATA.read_text(encoding="utf-8")
    script = SOURCE_JS.read_text(encoding="utf-8")
    font_data = base64.b64encode(SOURCE_FONT.read_bytes()).decode("ascii")

    css = css.replace(
        'url("assets/fonts/caveat-latin-wght-normal.woff2")',
        f'url("data:font/woff2;base64,{font_data}")',
    )
    html = html.replace(
        '  <link rel="preload" href="assets/fonts/caveat-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>\n',
        "",
    )
    html = html.replace(
        '  <link rel="stylesheet" href="handwriting-alphabet-lab.css?v=3">',
        f"  <style>\n{css}\n  </style>",
    )
    html = html.replace(
        '  <script src="handwriting-alphabet-data.js?v=3"></script>',
        f"  <script>\n{data}\n  </script>",
    )
    html = html.replace(
        '  <script src="handwriting-alphabet-lab.js?v=3"></script>',
        f"  <script>\n{script}\n  </script>",
    )
    html = html.replace(
        "<!doctype html>",
        "<!doctype html>\n<!-- Self-contained export: font, paths, styles, and animation are embedded. -->",
        1,
    )

    unresolved = (
        "handwriting-alphabet-lab.css",
        "handwriting-alphabet-data.js",
        "handwriting-alphabet-lab.js",
        "assets/fonts/caveat-latin-wght-normal.woff2",
    )
    if any(reference in html for reference in unresolved):
        raise RuntimeError("Standalone export still contains external asset references")

    OUTPUT.write_text(html, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
