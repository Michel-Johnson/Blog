#!/usr/bin/env python3
"""Extract per-letter stroke centerlines from image-generated annotation sheets."""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt, label
from skimage.morphology import skeletonize


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "output" / "centerline-alphabet"
GENERATED_DIR = SOURCE_DIR / "generated"
MANIFEST_PATH = SOURCE_DIR / "reference-manifest.json"
OUTPUT_JSON = GENERATED_DIR / "imagegen-centerlines.json"
OUTPUT_JS = ROOT / "handwriting-imagegen-centerlines.js"

SHEET_FILES = {
    1: GENERATED_DIR / "annotated-a-i.png",
    2: GENERATED_DIR / "annotated-j-r.png",
    3: GENERATED_DIR / "annotated-s-z.png",
}
LETTER_SOURCE_OVERRIDES = {
    "a": GENERATED_DIR / "annotated-a-i-v2.png",
}
REFERENCE_FILES = {
    1: SOURCE_DIR / "alphabet-reference-1.png",
    2: SOURCE_DIR / "alphabet-reference-2.png",
    3: SOURCE_DIR / "alphabet-reference-3.png",
}
COLOR_RULES = (
    ("red", lambda r, g, b: (r > 145) & (r > g * 1.22) & (r > b * 1.18)),
    ("blue", lambda r, g, b: (b > 115) & (b > r * 1.12) & (b > g * 1.03)),
    ("green", lambda r, g, b: (g > 105) & (g > r * 1.10) & (g > b * 1.04)),
    ("purple", lambda r, g, b: (r > 100) & (b > 100) & (r > g * 1.12) & (b > g * 1.12)),
)
NEIGHBORS = tuple(
    (dy, dx)
    for dy in (-1, 0, 1)
    for dx in (-1, 0, 1)
    if not (dy == 0 and dx == 0)
)


def component_mask(mask: np.ndarray, minimum: int = 80) -> np.ndarray:
    groups, count = label(mask)
    keep = np.zeros_like(mask, dtype=bool)
    for index in range(1, count + 1):
        component = groups == index
        if int(component.sum()) >= minimum:
            keep |= component
    return keep


def ink_bbox(image: np.ndarray, include_color: bool) -> tuple[int, int, int, int]:
    r, g, b = [image[:, :, index].astype(float) for index in range(3)]
    dark = (r < 105) & (g < 105) & (b < 105)
    mask = component_mask(dark, 120)
    if include_color:
        colored = np.zeros_like(mask)
        for _, rule in COLOR_RULES:
            colored |= rule(r, g, b)
        mask |= component_mask(colored, 30)
    # Labels live near the upper-left edge; the actual glyph occupies the central field.
    mask[:34, :70] = False
    ys, xs = np.nonzero(mask)
    if not len(xs):
        raise ValueError("No glyph ink found")
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def graph_paths(component: np.ndarray) -> list[list[tuple[int, int]]]:
    points = set(map(tuple, np.argwhere(component)))
    if not points:
        return []

    def adjacent(point):
        y, x = point
        neighbors = []
        for dy, dx in NEIGHBORS:
            neighbor = (y + dy, x + dx)
            if neighbor not in points:
                continue
            # Suppress diagonal shortcuts around one-pixel corners. They create
            # artificial junctions in an otherwise continuous skeleton.
            if dy and dx and ((y + dy, x) in points or (y, x + dx) in points):
                continue
            neighbors.append(neighbor)
        return sorted(neighbors)

    graph = {point: adjacent(point) for point in points}
    visited_edges: set[tuple[tuple[int, int], tuple[int, int]]] = set()

    def edge_key(a, b):
        return (a, b) if a <= b else (b, a)

    def trace(start, neighbor):
        path = [start]
        previous, current = start, neighbor
        visited_edges.add(edge_key(previous, current))
        path.append(current)
        while len(graph[current]) == 2:
            candidates = [
                point
                for point in graph[current]
                if point != previous and edge_key(current, point) not in visited_edges
            ]
            if not candidates:
                break
            following = candidates[0]
            visited_edges.add(edge_key(current, following))
            previous, current = current, following
            path.append(current)
        return path

    paths = []
    anchors = sorted(point for point in points if len(graph[point]) != 2)
    for anchor in anchors:
        for neighbor in graph[anchor]:
            if edge_key(anchor, neighbor) in visited_edges:
                continue
            path = trace(anchor, neighbor)
            if len(path) >= 2:
                paths.append(path)

    # Components made entirely of degree-two nodes are closed loops. Trace
    # every remaining loop edge and explicitly return to the starting point.
    for start in sorted(points):
        for neighbor in graph[start]:
            if edge_key(start, neighbor) in visited_edges:
                continue
            path = [start]
            previous, current = start, neighbor
            visited_edges.add(edge_key(previous, current))
            path.append(current)
            while current != start:
                candidates = [
                    point
                    for point in graph[current]
                    if point != previous and edge_key(current, point) not in visited_edges
                ]
                if not candidates:
                    break
                following = candidates[0]
                visited_edges.add(edge_key(current, following))
                previous, current = current, following
                path.append(current)
            if len(path) >= 2:
                paths.append(path)

    return paths


def simplify(points: list[tuple[float, float]], spacing: float = 4.0):
    if len(points) < 3:
        return points
    sampled = [points[0]]
    carried = 0.0
    previous = points[0]
    for point in points[1:]:
        carried += math.dist(previous, point)
        if carried >= spacing:
            sampled.append(point)
            carried = 0.0
        previous = point
    if sampled[-1] != points[-1]:
        sampled.append(points[-1])
    return sampled


def orient(points: list[tuple[float, float]]):
    if len(points) < 2:
        return points
    first, last = points[0], points[-1]
    # Conventional default: top-to-bottom; nearly horizontal strokes run left-to-right.
    if abs(last[1] - first[1]) > abs(last[0] - first[0]):
        return points if first[1] <= last[1] else list(reversed(points))
    return points if first[0] <= last[0] else list(reversed(points))


def merge_semantic_paths(
    letter: str,
    color_name: str,
    candidates: list[tuple[int, int, list[tuple[int, int]]]],
):
    """Join graph segments that belong to one intentional pen stroke."""
    if letter != "a" or color_name != "red" or len(candidates) != 2:
        return candidates

    loop_item = next(
        (item for item in candidates if item[2][0] == item[2][-1]),
        None,
    )
    tail_item = next(
        (item for item in candidates if item[2][0] != item[2][-1]),
        None,
    )
    if loop_item is None or tail_item is None:
        return candidates

    loop = loop_item[2]
    tail = tail_item[2]
    join = loop[0]
    if tail[-1] == join:
        tail = list(reversed(tail))
    if tail[0] != join:
        return candidates

    # Lowercase a is one continuous action: leave the upper-right join toward
    # the top of the bowl, close the bowl, then continue into the right tail.
    if len(loop) > 2:
        forward_next = loop[1]
        reverse_next = loop[-2]
        if reverse_next[0] < forward_next[0]:
            loop = [loop[0], *reversed(loop[1:-1]), loop[-1]]
    return [(loop_item[0], 0, loop + tail[1:])]


def exact_glyph_mask(cell: np.ndarray) -> np.ndarray:
    r, g, b = [cell[:, :, index] for index in range(3)]
    dark = (r < 105) & (g < 105) & (b < 105)
    dark[:42, :85] = False
    return component_mask(dark, 100)


def main():
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    generated_images = {
        index: np.asarray(Image.open(path).convert("RGB"))
        for index, path in SHEET_FILES.items()
    }
    generated_overrides = {
        letter: np.asarray(Image.open(path).convert("RGB"))
        for letter, path in LETTER_SOURCE_OVERRIDES.items()
    }
    reference_images = {
        index: np.asarray(Image.open(path).convert("RGB"))
        for index, path in REFERENCE_FILES.items()
    }
    output = {
        "method": "image-generation-color-centerline-extraction",
        "provenance": {
            "generatedSheets": {str(k): str(v.relative_to(ROOT)) for k, v in SHEET_FILES.items()},
            "letterSourceOverrides": {
                letter: str(path.relative_to(ROOT))
                for letter, path in LETTER_SOURCE_OVERRIDES.items()
            },
            "referenceSheets": {str(k): str(v.relative_to(ROOT)) for k, v in REFERENCE_FILES.items()},
            "registration": "per-letter ink bounding-box affine registration",
        },
        "glyphs": {},
    }

    for item in manifest:
        letter = item["letter"]
        sheet = item["sheet"]
        position = (ord(letter) - ord("a")) % 9
        row, col = divmod(position, 3)
        generated = generated_overrides.get(letter, generated_images[sheet])
        gh, gw = generated.shape[:2]
        gx0, gx1 = round(col * gw / 3), round((col + 1) * gw / 3)
        gy0, gy1 = round(row * gh / 3), round((row + 1) * gh / 3)
        generated_cell = generated[gy0:gy1, gx0:gx1]

        ref_cell_info = item["cell"]
        rx0, ry0 = ref_cell_info["x"], ref_cell_info["y"]
        reference_cell = reference_images[sheet][ry0:ry0 + 600, rx0:rx0 + 600]
        generated_bbox = ink_bbox(generated_cell, True)
        reference_bbox = ink_bbox(reference_cell, False)
        exact_mask = exact_glyph_mask(reference_cell)
        nearest = distance_transform_edt(~exact_mask, return_distances=False, return_indices=True)

        r, g, b = [
            generated_cell[:, :, index].astype(float)
            for index in range(3)
        ]
        strokes = []
        corrections = []
        source_skeleton_pixels = 0
        covered_skeleton_pixels: set[tuple[int, int, int, int]] = set()
        semantic_topology_ok = letter != "a"
        for color_index, (color_name, rule) in enumerate(COLOR_RULES):
            color_mask = component_mask(rule(r, g, b), 18)
            components, count = label(color_mask)
            candidates = []
            for component_index in range(1, count + 1):
                component = components == component_index
                if int(component.sum()) < 18:
                    continue
                skeleton = skeletonize(component)
                source_skeleton_pixels += int(skeleton.sum())
                for path_index, path in enumerate(graph_paths(skeleton)):
                    if len(path) < 2:
                        continue
                    for y, x in path:
                        covered_skeleton_pixels.add(
                            (color_index, component_index, int(y), int(x))
                        )
                    candidates.append((component_index, path_index, path))
            candidates.sort(key=lambda item: (item[0], item[1]))
            if letter == "a" and color_name == "red":
                semantic_topology_ok = (
                    any(path[0] == path[-1] for _, _, path in candidates)
                    and any(path[0] != path[-1] for _, _, path in candidates)
                )
            candidates = merge_semantic_paths(letter, color_name, candidates)

            for candidate_index, (_, path_index, path) in enumerate(candidates):
                mapped = []
                gx_min, gy_min, gx_max, gy_max = generated_bbox
                rx_min, ry_min, rx_max, ry_max = reference_bbox
                for y, x in path:
                    nx = (x - gx_min) / max(1, gx_max - gx_min)
                    ny = (y - gy_min) / max(1, gy_max - gy_min)
                    px = int(round(rx_min + nx * (rx_max - rx_min)))
                    py = int(round(ry_min + ny * (ry_max - ry_min)))
                    px = int(np.clip(px, 0, 599))
                    py = int(np.clip(py, 0, 599))
                    projected_y = int(nearest[0, py, px])
                    projected_x = int(nearest[1, py, px])
                    corrections.append(math.hypot(projected_x - px, projected_y - py))
                    mapped.append((float(projected_x), float(projected_y)))
                mapped = orient(simplify(mapped))
                strokes.append({
                    "order": color_index + 1,
                    "color": color_name,
                    "component": candidate_index,
                    "segment": path_index,
                    "points": [[round(x, 2), round(y, 2)] for x, y in mapped],
                })

        strokes.sort(
            key=lambda stroke: (
                stroke["order"],
                stroke["component"],
                stroke["segment"],
            )
        )
        coverage_ratio = (
            len(covered_skeleton_pixels) / source_skeleton_pixels
            if source_skeleton_pixels
            else 0.0
        )
        output["glyphs"][letter] = {
            "sheet": sheet,
            "cell": position,
            "inkBounds": list(reference_bbox),
            "strokes": strokes,
            "quality": {
                "strokeCount": len(strokes),
                "meanProjectionPx": round(float(np.mean(corrections)), 2) if corrections else None,
                "maxProjectionPx": round(float(np.max(corrections)), 2) if corrections else None,
                "sourceSkeletonPixels": source_skeleton_pixels,
                "coveredSkeletonPixels": len(covered_skeleton_pixels),
                "coverageRatio": round(coverage_ratio, 4),
                "semanticPass": (
                    semantic_topology_ok
                    and
                    len(strokes) == 1
                    and len(strokes[0]["points"]) >= 40
                    if letter == "a"
                    else True
                ),
            },
        }
        print(letter, len(strokes), output["glyphs"][letter]["quality"])

    OUTPUT_JSON.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    OUTPUT_JS.write_text(
        "window.HANDWRITING_IMAGEGEN_CENTERLINES = "
        + json.dumps(output, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUTPUT_JSON}")
    print(f"Wrote {OUTPUT_JS}")


if __name__ == "__main__":
    main()
