#!/usr/bin/env python3
"""Render complete handwritten glyphs with centerline-driven Manim reveals.

The centerlines define stroke order and timing. Exact raster stroke layers define
the visible silhouette, so the animation never substitutes a thin line for the
real glyph and never needs a final-frame swap.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.spatial import cKDTree

from manim import (
    DOWN,
    FadeIn,
    ImageMobject,
    Line,
    RoundedRectangle,
    Scene,
    Text,
    UpdateFromAlphaFunc,
    VGroup,
    WHITE,
    config,
    linear,
)


ROOT = Path(__file__).resolve().parents[1]
CENTERLINE_FILE = ROOT / "handwriting-imagegen-centerlines.js"
LAYER_FILE = ROOT / "handwriting-imagegen-stroke-layers.js"
LETTERS = "abcdefghijklmnopqrstuvwxyz"
INK = np.array([41, 40, 39], dtype=np.uint8)
INK_HEX = "#292827"
MUTED = "#7f796f"
ACCENT = "#ff5454"
PAPER = "#fffdfa"
RULE = "#ded8cc"

config.frame_width = 16
config.frame_height = 12
config.frame_rate = 24


def load_js_json(path: Path, prefix: str) -> dict:
    source = path.read_text(encoding="utf-8").strip()
    if not source.startswith(prefix):
        raise RuntimeError(f"Unexpected data format in {path}")
    return json.loads(source[len(prefix) :].rstrip(";"))


def resample_polyline(points: np.ndarray, spacing: float = 2.0) -> np.ndarray:
    if len(points) < 2:
        return points
    segments = np.linalg.norm(np.diff(points, axis=0), axis=1)
    distance = np.concatenate(([0.0], np.cumsum(segments)))
    if distance[-1] <= 0:
        return points[:1]
    samples = np.linspace(0, distance[-1], max(2, int(distance[-1] / spacing) + 1))
    return np.column_stack(
        (np.interp(samples, distance, points[:, 0]), np.interp(samples, distance, points[:, 1]))
    )


def make_glyph_frames(letter: str, centerline: dict, layers: dict, frame_count: int = 42):
    glyph_layers = layers[letter]
    bounds = np.asarray(glyph_layers["bounds"], dtype=float)
    width, height = glyph_layers["width"], glyph_layers["height"]

    exact_alpha = np.zeros((height, width), dtype=np.uint8)
    for stroke in glyph_layers["strokes"]:
        image = np.asarray(Image.open(ROOT / stroke["src"]).convert("RGBA"))
        exact_alpha = np.maximum(exact_alpha, image[:, :, 3])

    samples = []
    sample_times = []
    strokes = sorted(centerline[letter]["strokes"], key=lambda item: item["order"])
    lengths = []
    prepared = []
    for stroke in strokes:
        points = np.asarray(stroke["points"], dtype=float) - bounds[:2]
        points = resample_polyline(points)
        prepared.append(points)
        lengths.append(max(1.0, np.linalg.norm(np.diff(points, axis=0), axis=1).sum()))

    total_length = sum(lengths)
    elapsed = 0.0
    for points, length in zip(prepared, lengths):
        local = np.linspace(0.0, length / total_length, len(points), endpoint=True)
        samples.append(points)
        sample_times.append(elapsed + local)
        elapsed += length / total_length

    all_samples = np.vstack(samples)
    all_times = np.concatenate(sample_times)
    ink_y, ink_x = np.nonzero(exact_alpha)
    _, nearest = cKDTree(all_samples).query(np.column_stack((ink_x, ink_y)), workers=-1)
    reveal_time = np.ones((height, width), dtype=np.float32)
    reveal_time[ink_y, ink_x] = all_times[nearest]

    # A short feather gives the front edge the continuous spread of a wet nib,
    # while exact_alpha guarantees the completed frame matches the real glyph.
    feather = 0.045
    frames = []
    for index in range(frame_count):
        progress = index / (frame_count - 1)
        amount = np.clip((progress - reveal_time + feather) / feather, 0.0, 1.0)
        amount = amount * amount * (3.0 - 2.0 * amount)
        rgba = np.zeros((height, width, 4), dtype=np.uint8)
        rgba[:, :, :3] = INK
        rgba[:, :, 3] = (exact_alpha.astype(np.float32) * amount).astype(np.uint8)
        frames.append(rgba)
    frames[-1][:, :, 3] = exact_alpha
    return frames


class GlyphReveal(ImageMobject):
    def __init__(self, frames: list[np.ndarray], **kwargs):
        self.frames = frames
        super().__init__(frames[0], **kwargs)

    def set_progress(self, alpha: float):
        index = min(len(self.frames) - 1, round(alpha * (len(self.frames) - 1)))
        self.pixel_array[:] = self.frames[index]
        return self


class ManimAlphabet(Scene):
    def construct(self):
        self.camera.background_color = PAPER
        centerline = load_js_json(
            CENTERLINE_FILE, "window.HANDWRITING_IMAGEGEN_CENTERLINES = "
        )["glyphs"]
        layers = load_js_json(
            LAYER_FILE, "window.HANDWRITING_IMAGEGEN_STROKE_LAYERS = "
        )["glyphs"]

        title = Text(
            "MANIM / FULL-GLYPH STROKE REVEAL",
            font="Menlo",
            weight="BOLD",
            font_size=27,
            color=INK_HEX,
        ).move_to([0, 5.34, 0])
        subtitle = Text(
            "centerlines control timing - exact silhouettes control appearance",
            font="Menlo",
            font_size=15,
            color=MUTED,
        ).next_to(title, direction=DOWN, buff=0.17)
        self.add(title, subtitle)

        cols = 7
        cell_w = 2.08
        cell_h = 2.25
        start_x = -6.45
        start_y = 3.45
        reveals = []

        for index, letter in enumerate(LETTERS):
            row, col = divmod(index, cols)
            x = start_x + col * cell_w
            y = start_y - row * cell_h
            card = RoundedRectangle(
                width=1.78,
                height=1.98,
                corner_radius=0.12,
                stroke_color=INK_HEX,
                stroke_width=2.1,
                fill_color=WHITE,
                fill_opacity=1,
            ).move_to([x, y, 0])
            shadow = card.copy().set_fill(INK_HEX, opacity=1).set_stroke(opacity=0)
            shadow.shift([0.08, -0.09, 0]).set_z_index(-2)
            rule = Line(
                [x - 0.72, y - 0.70, 0], [x + 0.72, y - 0.70, 0],
                color=RULE, stroke_width=1.2,
            )
            label = Text(
                letter, font="Menlo", weight="BOLD", font_size=22, color=ACCENT
            ).move_to([x - 0.65, y + 0.73, 0])

            frames = make_glyph_frames(letter, centerline, layers)
            reveal = GlyphReveal(frames)
            reveal.height = 1.38
            if reveal.width > 1.34:
                reveal.width = 1.34
            reveal.move_to([x, y - 0.05, 0])
            reveals.append(reveal)
            self.add(shadow, card, rule, label, reveal)

        self.play(
            *[
                UpdateFromAlphaFunc(
                    reveal,
                    lambda mob, alpha: mob.set_progress(alpha),
                    run_time=2.8,
                    rate_func=linear,
                )
                for reveal in reveals
            ]
        )
        self.wait(1.5)
