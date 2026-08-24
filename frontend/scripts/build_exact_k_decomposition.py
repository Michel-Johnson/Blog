#!/usr/bin/env python3
"""Split the generated reference k without redrawing a single glyph pixel."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import label


ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(
    "/Users/bytedance/.codex/generated_images/"
    "019f7b69-a0e0-7f63-a88b-25fe4925309c/"
    "exec-daef967e-c04b-4ebe-bb1d-36e1da349bb4.png"
)
OUT = ROOT / "assets" / "handwriting" / "k-exact-split"


def largest_component(mask: np.ndarray) -> np.ndarray:
    groups, count = label(mask)
    if not count:
        raise RuntimeError("No glyph component found")
    sizes = np.bincount(groups.ravel())
    sizes[0] = 0
    return groups == int(np.argmax(sizes))


def polyline(points: list[tuple[float, float]], samples: int = 180) -> np.ndarray:
    result: list[tuple[float, float]] = []
    for start, end in zip(points, points[1:]):
        for t in np.linspace(0.0, 1.0, samples, endpoint=False):
            result.append((start[0] * (1 - t) + end[0] * t, start[1] * (1 - t) + end[1] * t))
    result.append(points[-1])
    return np.asarray(result, dtype=np.float32)


def nearest_distance(xs: np.ndarray, ys: np.ndarray, path: np.ndarray) -> np.ndarray:
    best = np.full(xs.shape, np.inf, dtype=np.float32)
    for chunk in np.array_split(path, max(1, len(path) // 80)):
        dx = xs[:, None] - chunk[None, :, 0]
        dy = ys[:, None] - chunk[None, :, 1]
        best = np.minimum(best, np.min(dx * dx + dy * dy, axis=1))
    return best


def rgba_layer(source: np.ndarray, support: np.ndarray) -> Image.Image:
    rgba = np.zeros((*support.shape, 4), dtype=np.uint8)
    rgba[:, :, :3] = source
    rgba[:, :, 3] = support.astype(np.uint8) * 255
    return Image.fromarray(rgba, "RGBA")


def fit_panel(layer: Image.Image, size: tuple[int, int], margin: int = 72) -> tuple[Image.Image, tuple[int, int, int, int]]:
    # Every layer already uses the authoritative glyph crop. Never fit strokes
    # independently: doing so changes their scale and makes recomposition impossible.
    crop = layer
    available = (size[0] - margin * 2, size[1] - margin * 2)
    scale = min(available[0] / crop.width, available[1] / crop.height)
    target = (max(1, round(crop.width * scale)), max(1, round(crop.height * scale)))
    crop = crop.resize(target, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", size, (255, 255, 255, 255))
    offset = ((size[0] - target[0]) // 2, (size[1] - target[1]) // 2)
    canvas.alpha_composite(crop, offset)
    return canvas, (offset[0], offset[1], target[0], target[1])


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    image = np.asarray(Image.open(SOURCE).convert("RGB"))

    # The left panel contains the authoritative complete k. Everything else is ignored.
    panel = image[:, :585]
    dark = np.max(panel, axis=2) < 130
    glyph = largest_component(dark)
    ys, xs = np.nonzero(glyph)
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    crop_rgb = panel[y0:y1, x0:x1]
    crop_glyph = glyph[y0:y1, x0:x1]
    height, width = crop_glyph.shape

    # These paths describe writing order only. Pixel shape always comes from crop_rgb.
    stem = polyline([
        (0.48 * width, 0.03 * height),
        (0.40 * width, 0.25 * height),
        (0.29 * width, 0.55 * height),
        (0.18 * width, 0.78 * height),
        (0.10 * width, 0.96 * height),
    ])
    arms = polyline([
        (0.78 * width, 0.36 * height),
        (0.52 * width, 0.48 * height),
        (0.34 * width, 0.61 * height),
        (0.54 * width, 0.76 * height),
        (0.72 * width, 0.89 * height),
        (0.88 * width, 0.94 * height),
    ])

    gy, gx = np.nonzero(crop_glyph)
    d1 = nearest_distance(gx.astype(np.float32), gy.astype(np.float32), stem)
    d2 = nearest_distance(gx.astype(np.float32), gy.astype(np.float32), arms)
    owner2 = d2 < d1
    stroke1 = np.zeros_like(crop_glyph)
    stroke2 = np.zeros_like(crop_glyph)
    stroke1[gy[~owner2], gx[~owner2]] = True
    stroke2[gy[owner2], gx[owner2]] = True

    # Real pen strokes overlap at the join. Keeping the source pixels in both
    # layers avoids an artificial knife-cut while preserving an exact union.
    junction_x = 0.34 * width
    junction_y = 0.60 * height
    yy, xx = np.ogrid[:height, :width]
    shared = crop_glyph & (
        ((xx - junction_x) / (0.12 * width)) ** 2
        + ((yy - junction_y) / (0.13 * height)) ** 2
        <= 1.0
    )
    stroke1 |= shared
    stroke2 |= shared

    full = rgba_layer(crop_rgb, crop_glyph)
    first = rgba_layer(crop_rgb, stroke1)
    second = rgba_layer(crop_rgb, stroke2)
    full.save(OUT / "k-full.png", optimize=True)
    first.save(OUT / "k-stroke-1.png", optimize=True)
    second.save(OUT / "k-stroke-2.png", optimize=True)

    recomposed = stroke1 | stroke2
    missing = int(np.count_nonzero(crop_glyph & ~recomposed))
    extra = int(np.count_nonzero(recomposed & ~crop_glyph))
    if missing or extra:
        raise RuntimeError(f"Recomposition failed: missing={missing}, extra={extra}")

    panel_size = (520, 760)
    panels = [fit_panel(layer, panel_size) for layer in (full, first, second)]
    proof = Image.new("RGB", (panel_size[0] * 3, 870), "#fffefa")
    for index, (rendered, _) in enumerate(panels):
        proof.paste(rendered.convert("RGB"), (index * panel_size[0], 90))
    draw = ImageDraw.Draw(proof)
    font = ImageFont.load_default(size=34)
    labels = ["SOURCE", "STROKE 1", "STROKE 2"]
    for index, text in enumerate(labels):
        draw.text((index * panel_size[0] + 28, 26), text, fill="#242321", font=font)
    draw.line((panel_size[0], 0, panel_size[0], 850), fill="#d5d0c6", width=3)
    draw.line((panel_size[0] * 2, 0, panel_size[0] * 2, 850), fill="#d5d0c6", width=3)
    overlap = int(np.count_nonzero(stroke1 & stroke2))
    footer = f"PIXEL RECOMPOSITION: missing {missing} / extra {extra} / shared {overlap}"
    draw.text((28, 818), footer, fill="#1f6d42", font=font)
    proof.save(OUT / "k-exact-decomposition.png", optimize=True)
    print(f"source_box={x0,y0,x1,y1} glyph_pixels={int(crop_glyph.sum())}")
    print(footer)


if __name__ == "__main__":
    main()
