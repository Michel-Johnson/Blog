#!/usr/bin/env python3
"""Build the alphabet lab dataset from the current Hero handwriting source."""

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HERO_SOURCE = ROOT.parent / "ui.dev" / "hero-write.js"
OUTPUT = ROOT / "handwriting-alphabet-data.js"


# User-reviewed replacements. These paths encode writing order explicitly and
# override only the letters called out during alphabet calibration.
REVISIONS = {
    "e": [
        "M 82 190 C 130 194 213 205 281 222 C 271 285 215 322 157 307 "
        "C 91 290 55 227 66 158 C 79 78 155 36 235 55 "
        "C 273 64 302 83 320 109"
    ],
    "f": [
        "M 266 603 C 232 632 178 624 151 590 C 119 549 127 490 145 429 "
        "C 170 343 190 264 199 173 C 210 75 200 -28 158 -117",
        "M 64 340 C 129 349 220 348 286 335"
    ],
    "i": [
        "M 92 330 C 89 248 87 165 92 91 C 95 50 110 32 133 47",
        "M 100 492 C 105 498 111 498 116 492"
    ],
    "o": [
        "M 286 280 C 250 325 189 340 132 309 C 72 276 57 199 85 127 "
        "C 111 59 179 29 244 49 C 310 69 340 139 324 207 "
        "C 316 240 302 264 286 280"
    ],
    "t": [
        "M 207 540 C 194 446 181 348 173 248 C 165 155 166 80 181 39",
        "M 60 340 C 126 349 222 349 294 335"
    ],
    "u": [
        "M 88 330 C 84 259 76 167 87 100 C 97 42 145 26 180 58 "
        "C 224 99 231 217 227 326 C 225 247 223 157 236 91 "
        "C 248 36 294 34 331 91"
    ],
}


# Caveat-shaped provisional centerlines for letters absent from the current Hero.
# They are deliberately isolated here so a reviewed letter can be replaced alone.
PROVISIONAL = {
    "b": [
        "M 150 625 C 145 520 150 375 165 215 C 180 85 190 35 192 25",
        "M 164 225 C 205 300 292 325 350 270 C 397 225 386 145 329 91 "
        "C 273 37 208 58 185 112"
    ],
    "c": [
        "M 356 300 C 316 349 242 363 181 329 C 119 294 102 213 126 137 "
        "C 149 64 223 29 294 47 C 326 55 350 71 367 91"
    ],
    "d": [
        "M 330 286 C 293 342 218 360 157 318 C 99 278 99 190 132 116 "
        "C 166 42 250 35 309 82 C 346 112 349 174 330 230",
        "M 330 230 C 341 342 349 482 353 625 C 357 487 365 338 376 72"
    ],
    "j": [
        "M 255 335 C 261 250 270 158 272 71 C 273 -13 259 -91 220 -137 "
        "C 191 -171 150 -174 118 -153",
        "M 268 486 C 276 500 286 510 298 518"
    ],
    "p": [
        "M 153 338 C 154 235 158 117 164 2 C 168 -69 171 -133 174 -184",
        "M 160 265 C 207 329 289 343 347 294 C 399 251 396 174 350 118 "
        "C 306 63 227 56 178 104"
    ],
    "v": [
        "M 112 326 C 139 246 169 150 208 62 C 219 38 238 37 253 59 "
        "C 300 130 337 225 370 326"
    ],
    "w": [
        "M 70 321 C 91 239 112 147 143 66 C 152 42 169 42 183 65 "
        "C 212 112 232 191 249 266 C 263 210 281 137 309 70 "
        "C 321 42 340 42 354 67 C 390 131 414 226 438 321"
    ],
    "x": [
        "M 115 322 C 174 246 239 160 332 55",
        "M 319 322 C 271 246 217 160 132 61"
    ],
    "z": [
        "M 111 302 C 184 318 268 319 350 304 C 292 232 224 157 145 72 "
        "C 207 61 282 60 367 76"
    ],
}


def load_hero_data():
    source = HERO_SOURCE.read_text(encoding="utf-8")
    match = re.search(r"var HW_DATA = (\{.*?\});\n\n  var REDUCED", source, re.S)
    if not match:
        raise RuntimeError(f"Could not read HW_DATA from {HERO_SOURCE}")
    return json.loads(match.group(1))


def main():
    hero = load_hero_data()
    letters = {}
    for letter in "abcdefghijklmnopqrstuvwxyz":
        if letter in REVISIONS:
            letters[letter] = {
                "advance": hero["chars"][letter]["adv"],
                "strokes": REVISIONS[letter],
                "source": "revision",
            }
        elif letter in hero["chars"]:
            glyph = hero["chars"][letter]
            letters[letter] = {
                "advance": glyph["adv"],
                "strokes": glyph["s"],
                "source": "hero",
            }
        else:
            letters[letter] = {
                "advance": 430 if letter not in {"j", "v", "x", "z"} else 380,
                "strokes": PROVISIONAL[letter],
                "source": "candidate",
            }

    payload = {
        "font": {"upm": hero["upm"], "asc": hero["asc"], "desc": hero["desc"]},
        "letters": letters,
    }
    OUTPUT.write_text(
        "window.HANDWRITING_ALPHABET = "
        + json.dumps(payload, ensure_ascii=True, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUTPUT} with {len(letters)} letters")


if __name__ == "__main__":
    main()
