#!/usr/bin/env python3
"""Extract ordered handwriting centerlines from a color-annotated glyph image."""

from __future__ import annotations

import argparse
import heapq
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.interpolate import splprep, splev
from skimage.morphology import binary_closing, disk, skeletonize


NEIGHBORS = [
    (-1, -1), (-1, 0), (-1, 1),
    (0, -1),           (0, 1),
    (1, -1),  (1, 0),  (1, 1),
]


def color_mask(rgb: np.ndarray, color: str) -> np.ndarray:
    r, g, b = (rgb[..., i].astype(np.int16) for i in range(3))
    if color == "red":
        return (r > 170) & (r > g + 65) & (r > b + 65)
    return (b > 135) & (b > r + 25) & (b > g + 20)


def pixel_graph(skeleton: np.ndarray):
    points = {tuple(point) for point in np.argwhere(skeleton)}
    graph = {}
    for point in points:
        graph[point] = [
            (point[0] + dy, point[1] + dx)
            for dy, dx in NEIGHBORS
            if (point[0] + dy, point[1] + dx) in points
        ]
    return graph


def shortest_paths(graph, start):
    queue = [(0.0, start)]
    distance = {start: 0.0}
    parent = {start: None}
    while queue:
        dist, point = heapq.heappop(queue)
        if dist > distance[point]:
            continue
        for nxt in graph[point]:
            step = 1.4142 if nxt[0] != point[0] and nxt[1] != point[1] else 1.0
            candidate = dist + step
            if candidate < distance.get(nxt, float("inf")):
                distance[nxt] = candidate
                parent[nxt] = point
                heapq.heappush(queue, (candidate, nxt))
    return parent, distance


def longest_path(skeleton: np.ndarray) -> np.ndarray:
    graph = pixel_graph(skeleton)
    if not graph:
        raise ValueError("No centerline pixels found")
    endpoints = [point for point, links in graph.items() if len(links) == 1]
    seed = endpoints[0] if endpoints else next(iter(graph))
    _, first_distances = shortest_paths(graph, seed)
    candidates = endpoints or list(graph)
    first = max(candidates, key=lambda point: first_distances.get(point, -1))
    parent, second_distances = shortest_paths(graph, first)
    second = max(candidates, key=lambda point: second_distances.get(point, -1))
    path = []
    cursor = second
    while cursor is not None:
        path.append(cursor)
        cursor = parent.get(cursor)
    return np.asarray(path[::-1], dtype=float)


def smooth_resample(points: np.ndarray, count: int = 90) -> np.ndarray:
    # Convert row/column to x/y before fitting.
    xy = points[:, [1, 0]]
    keep = np.r_[True, np.linalg.norm(np.diff(xy, axis=0), axis=1) > 0]
    xy = xy[keep]
    if len(xy) < 4:
        return xy
    distances = np.r_[0.0, np.cumsum(np.linalg.norm(np.diff(xy, axis=0), axis=1))]
    u = distances / distances[-1]
    smoothing = max(2.0, len(xy) * 0.12)
    tck, _ = splprep([xy[:, 0], xy[:, 1]], u=u, s=smoothing, k=3)
    sample_u = np.linspace(0, 1, count)
    x, y = splev(sample_u, tck)
    return np.column_stack([x, y])


def orient(points: np.ndarray, color: str) -> np.ndarray:
    if color == "red":
        # Stroke 1 starts at the upper hook and finishes at the bottom terminal.
        return points if points[0, 1] < points[-1, 1] else points[::-1]
    # Stroke 2 is written left-to-right.
    return points if points[0, 0] < points[-1, 0] else points[::-1]


def svg_path(points: np.ndarray) -> str:
    if len(points) == 0:
        return ""
    commands = [f"M {points[0, 0]:.2f} {points[0, 1]:.2f}"]
    commands.extend(f"L {x:.2f} {y:.2f}" for x, y in points[1:])
    return " ".join(commands)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("image", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--target-width", type=float, default=1158)
    parser.add_argument("--target-height", type=float, default=1866)
    args = parser.parse_args()

    image = Image.open(args.image).convert("RGB")
    rgb = np.asarray(image)
    height, width = rgb.shape[:2]
    result = {
        "source": str(args.image),
        "sourceSize": {"width": width, "height": height},
        "targetSize": {"width": args.target_width, "height": args.target_height},
        "strokes": [],
    }

    for index, color in enumerate(("red", "blue"), start=1):
        mask = color_mask(rgb, color)
        # The later blue stroke visually crosses and overwrites a short section of
        # the red stroke. Close that annotation-only gap before skeletonization.
        if color == "red":
            mask = binary_closing(mask, disk(max(3, round(width * 0.014))))
        skeleton = skeletonize(mask)
        raw = longest_path(skeleton)
        smooth = orient(smooth_resample(raw), color)
        smooth[:, 0] *= args.target_width / width
        smooth[:, 1] *= args.target_height / height
        result["strokes"].append({
            "order": index,
            "color": color,
            "path": svg_path(smooth),
            "points": np.round(smooth, 2).tolist(),
            "sourcePixels": int(mask.sum()),
        })

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {args.output}")
    for stroke in result["strokes"]:
        print(f"stroke {stroke['order']} ({stroke['color']}): {len(stroke['points'])} points")


if __name__ == "__main__":
    main()
