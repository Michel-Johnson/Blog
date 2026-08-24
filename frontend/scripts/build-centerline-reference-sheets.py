#!/usr/bin/env python3
"""Build exact Caveat glyph sheets for image-guided centerline annotation."""

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTLINE_DATA = ROOT / "handwriting-outline-data.js"
OUTPUT_DIR = ROOT / "output" / "centerline-alphabet"
LETTERS = "abcdefghijklmnopqrstuvwxyz"
SHEET_GROUPS = (LETTERS[:9], LETTERS[9:18], LETTERS[18:])

SHEET_WIDTH = 1800
SHEET_HEIGHT = 1800
COLS = 3
ROWS = 3
CELL_WIDTH = SHEET_WIDTH / COLS
CELL_HEIGHT = SHEET_HEIGHT / ROWS


def load_outlines():
    source = OUTLINE_DATA.read_text(encoding="utf-8")
    match = re.search(r"window\.HANDWRITING_CAVEAT_OUTLINES = (.*);\s*$", source)
    if not match:
        raise RuntimeError(f"Could not parse {OUTLINE_DATA}")
    return json.loads(match.group(1))


def glyph_transform(glyph, col, row):
    x0, y0, x1, y1 = glyph["bounds"]
    width = max(1, x1 - x0)
    height = max(1, y1 - y0)
    usable_width = CELL_WIDTH * 0.6
    usable_height = CELL_HEIGHT * 0.64
    scale = min(usable_width / width, usable_height / height)
    target_x = col * CELL_WIDTH + CELL_WIDTH / 2
    target_y = row * CELL_HEIGHT + CELL_HEIGHT * 0.53
    tx = target_x - (x0 + x1) * scale / 2
    # Font coordinates point upward; SVG coordinates point downward.
    ty = target_y + (y0 + y1) * scale / 2
    return f"translate({tx:.3f} {ty:.3f}) scale({scale:.5f} {-scale:.5f})"


def build_sheet(index, letters, payload):
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{SHEET_WIDTH}" '
        f'height="{SHEET_HEIGHT}" viewBox="0 0 {SHEET_WIDTH} {SHEET_HEIGHT}">',
        '<rect width="100%" height="100%" fill="#fffdf8"/>',
        '<style>'
        '.cell{fill:none;stroke:#d7d0c2;stroke-width:2}'
        '.label{font:700 30px ui-monospace,monospace;fill:#746e64}'
        '.glyph{fill:#292826}'
        '</style>',
    ]
    manifest = []

    for position, letter in enumerate(letters):
        row, col = divmod(position, COLS)
        cell_x = col * CELL_WIDTH
        cell_y = row * CELL_HEIGHT
        glyph = payload["glyphs"][letter]
        transform = glyph_transform(glyph, col, row)
        parts.append(
            f'<rect class="cell" x="{cell_x + 10:.2f}" y="{cell_y + 10:.2f}" '
            f'width="{CELL_WIDTH - 20:.2f}" height="{CELL_HEIGHT - 20:.2f}" rx="14"/>'
        )
        parts.append(
            f'<text class="label" x="{cell_x + 28:.2f}" y="{cell_y + 48:.2f}">{letter}</text>'
        )
        parts.append(
            f'<path class="glyph" d="{glyph["path"]}" transform="{transform}"/>'
        )
        manifest.append({
            "letter": letter,
            "sheet": index,
            "cell": {
                "x": int(cell_x),
                "y": int(cell_y),
                "width": int(CELL_WIDTH),
                "height": int(CELL_HEIGHT),
            },
            "glyphTransform": transform,
        })

    parts.append("</svg>")
    svg_path = OUTPUT_DIR / f"alphabet-reference-{index}.svg"
    svg_path.write_text("\n".join(parts), encoding="utf-8")
    return svg_path, manifest


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    payload = load_outlines()
    manifest = []
    for index, letters in enumerate(SHEET_GROUPS, start=1):
        svg_path, sheet_manifest = build_sheet(index, letters, payload)
        manifest.extend(sheet_manifest)
        print(svg_path)
    (OUTPUT_DIR / "reference-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
