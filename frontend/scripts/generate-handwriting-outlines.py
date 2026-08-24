#!/usr/bin/env python3
"""Export the local Caveat font as browser-ready SVG glyph outlines."""

import json
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont


ROOT = Path(__file__).resolve().parents[1]
FONT_PATH = ROOT / "assets/fonts/caveat-latin-wght-normal.woff2"
OUTPUT_PATH = ROOT / "handwriting-outline-data.js"
CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz."


def rounded(value):
    return round(value, 2)


font = TTFont(FONT_PATH)
font = instantiateVariableFont(font, {"wght": 700}, inplace=False)
glyph_set = font.getGlyphSet()
cmap = font.getBestCmap()
metrics = font["hmtx"].metrics

glyphs = {}
for character in CHARACTERS:
    glyph_name = cmap.get(ord(character))
    if not glyph_name:
        continue

    path_pen = SVGPathPen(glyph_set)
    bounds_pen = BoundsPen(glyph_set)
    glyph_set[glyph_name].draw(path_pen)
    glyph_set[glyph_name].draw(bounds_pen)

    bounds = bounds_pen.bounds or (0, 0, 0, 0)
    advance, left_side_bearing = metrics[glyph_name]
    glyphs[character] = {
        "advance": advance,
        "leftSideBearing": left_side_bearing,
        "bounds": [rounded(value) for value in bounds],
        "path": path_pen.getCommands(),
    }

payload = {
    "font": {
        "family": "Caveat",
        "weight": 700,
        "upm": font["head"].unitsPerEm,
        "asc": font["hhea"].ascent,
        "desc": font["hhea"].descent,
    },
    "glyphs": glyphs,
}

OUTPUT_PATH.write_text(
    "window.HANDWRITING_CAVEAT_OUTLINES = "
    + json.dumps(payload, ensure_ascii=True, separators=(",", ":"))
    + ";\n",
    encoding="ascii",
)
print(OUTPUT_PATH)
