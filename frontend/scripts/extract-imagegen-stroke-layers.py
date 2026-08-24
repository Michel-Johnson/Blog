#!/usr/bin/env python3
"""Turn image-generated semantic stroke colors into exact Caveat glyph layers.

The generated sheets decide stroke ownership. The original reference sheets
remain the hard silhouette, so the exported layers are mutually exclusive and
their union is exactly the original glyph bitmap.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt, label


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "output" / "centerline-alphabet"
GENERATED = SOURCE / "generated-stroke-layers-v10"
OUTPUT = ROOT / "output" / "stroke-layers-v10"
MANIFEST = SOURCE / "reference-manifest.json"

SHEETS = {
    1: GENERATED / "segmented-a-i.png",
    2: GENERATED / "segmented-j-r.png",
    3: GENERATED / "segmented-s-z.png",
}
REFERENCES = {
    index: SOURCE / f"alphabet-reference-{index}.png"
    for index in (1, 2, 3)
}
PALETTE = np.asarray(
    [
        [255, 0, 0],
        [0, 102, 255],
        [0, 166, 81],
        [138, 43, 226],
    ],
    dtype=np.float32,
)


def keep_components(mask: np.ndarray, minimum: int) -> np.ndarray:
    groups, count = label(mask)
    output = np.zeros_like(mask, dtype=bool)
    for index in range(1, count + 1):
        component = groups == index
        if int(component.sum()) >= minimum:
            output |= component
    return output


def exact_ink(cell: np.ndarray) -> np.ndarray:
    rgb = cell[:, :, :3]
    mask = np.max(rgb, axis=2) < 112
    mask[:62, :105] = False
    return keep_components(mask, 100)


def colored_ink(cell: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    rgb = cell[:, :, :3].astype(np.float32)
    distances = np.linalg.norm(rgb[:, :, None, :] - PALETTE[None, None, :, :], axis=3)
    owners = np.argmin(distances, axis=2)
    saturation = np.max(rgb, axis=2) - np.min(rgb, axis=2)
    confidence = (np.min(distances, axis=2) < 155) & (saturation > 54)
    confidence[:62, :105] = False
    confidence = keep_components(confidence, 24)
    return owners, confidence


def bbox(mask: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.nonzero(mask)
    if not len(xs):
        raise ValueError("No foreground found")
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def normalized_owner_map(
    reference_mask: np.ndarray,
    generated_owners: np.ndarray,
    generated_mask: np.ndarray,
) -> np.ndarray:
    rx0, ry0, rx1, ry1 = bbox(reference_mask)
    gx0, gy0, gx1, gy1 = bbox(generated_mask)
    color_coords = np.argwhere(generated_mask)
    color_values = generated_owners[generated_mask]
    if not len(color_coords):
        raise ValueError("Generated sheet has no semantic colors")

    # Build a dense semantic field from the model-labelled pixels. This fills
    # only anti-aliased gaps; stroke identity still comes from image generation.
    dense_labels = np.full(generated_mask.shape, -1, dtype=np.int16)
    dense_labels[generated_mask] = generated_owners[generated_mask]
    nearest = distance_transform_edt(
        ~generated_mask,
        return_distances=False,
        return_indices=True,
    )
    dense_labels[~generated_mask] = dense_labels[
        nearest[0][~generated_mask], nearest[1][~generated_mask]
    ]

    ys, xs = np.nonzero(reference_mask)
    nx = (xs - rx0) / max(1, rx1 - rx0 - 1)
    ny = (ys - ry0) / max(1, ry1 - ry0 - 1)
    gx = np.clip(np.rint(gx0 + nx * (gx1 - gx0 - 1)).astype(int), 0, generated_mask.shape[1] - 1)
    gy = np.clip(np.rint(gy0 + ny * (gy1 - gy0 - 1)).astype(int), 0, generated_mask.shape[0] - 1)

    output = np.full(reference_mask.shape, -1, dtype=np.int16)
    output[ys, xs] = dense_labels[gy, gx]
    return output


def export_letter(letter: str, exact: np.ndarray, owners: np.ndarray) -> dict:
    x0, y0, x1, y1 = bbox(exact)
    crop_exact = exact[y0:y1, x0:x1]
    crop_owners = owners[y0:y1, x0:x1]
    letter_dir = OUTPUT / letter
    letter_dir.mkdir(parents=True, exist_ok=True)
    stroke_ids = sorted(int(value) for value in np.unique(crop_owners[crop_exact]) if value >= 0)
    strokes = []
    union = np.zeros_like(crop_exact, dtype=bool)

    for order, owner in enumerate(stroke_ids, start=1):
        layer = crop_exact & (crop_owners == owner)
        union |= layer
        rgba = np.zeros((*layer.shape, 4), dtype=np.uint8)
        rgba[:, :, :3] = 255
        rgba[:, :, 3] = layer.astype(np.uint8) * 255
        filename = f"stroke-{order:02d}.png"
        Image.fromarray(rgba, "RGBA").save(letter_dir / filename, optimize=True)
        strokes.append({
            "order": order,
            "sourceColor": ["red", "blue", "green", "purple"][owner],
            "src": f"./output/stroke-layers-v10/{letter}/{filename}",
            "pixels": int(layer.sum()),
        })

    missing = crop_exact & ~union
    overlap = np.zeros_like(crop_exact, dtype=np.uint8)
    for owner in stroke_ids:
        overlap += (crop_exact & (crop_owners == owner)).astype(np.uint8)
    return {
        "bounds": [x0, y0, x1, y1],
        "width": x1 - x0,
        "height": y1 - y0,
        "strokes": strokes,
        "quality": {
            "exactPixels": int(crop_exact.sum()),
            "unionPixels": int(union.sum()),
            "missingPixels": int(missing.sum()),
            "overlapPixels": int((overlap > 1).sum()),
            "coverage": round(float(union.sum() / max(1, crop_exact.sum())), 6),
        },
    }


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    references = {
        index: np.asarray(Image.open(path).convert("RGB"))
        for index, path in REFERENCES.items()
    }
    generated = {
        index: np.asarray(Image.open(path).convert("RGB"))
        for index, path in SHEETS.items()
    }
    payload = {
        "method": "imagegen-semantic-stroke-layers-clamped-to-exact-glyph",
        "glyphs": {},
    }

    for item in manifest:
        letter = item["letter"]
        sheet = item["sheet"]
        position = (ord(letter) - ord("a")) % 9
        row, col = divmod(position, 3)

        reference_cell = references[sheet][row * 600:(row + 1) * 600, col * 600:(col + 1) * 600]
        generated_sheet = generated[sheet]
        gh, gw = generated_sheet.shape[:2]
        generated_cell = generated_sheet[
            round(row * gh / 3):round((row + 1) * gh / 3),
            round(col * gw / 3):round((col + 1) * gw / 3),
        ]

        exact = exact_ink(reference_cell)
        raw_owners, color_mask = colored_ink(generated_cell)
        owners = normalized_owner_map(exact, raw_owners, color_mask)
        result = export_letter(letter, exact, owners)
        payload["glyphs"][letter] = result
        quality = result["quality"]
        print(letter, len(result["strokes"]), quality)

    json_path = OUTPUT / "stroke-layers.json"
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    (ROOT / "handwriting-imagegen-stroke-layers.js").write_text(
        "window.HANDWRITING_IMAGEGEN_STROKE_LAYERS = "
        + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote {json_path}")


if __name__ == "__main__":
    main()
