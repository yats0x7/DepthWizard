"""Tiled inference with global-consistency alignment.

Monocular depth networks return each tile with its own unknown scale and shift. One low-resolution
pass over the whole image gives the global layout; every high-resolution tile is then aligned to
that map with a trimmed least-squares affine fit and blended with a raised-cosine window, so the
result keeps the global structure of the coarse pass and the detail of the tiles.
"""

from __future__ import annotations

from collections.abc import Callable

import cv2
import numpy as np

Infer = Callable[[np.ndarray], np.ndarray]


def _ramp(n: int, ramp: int, start: bool, end: bool) -> np.ndarray:
    w = np.ones(n, np.float32)
    r = min(ramp, n // 2)
    if r > 0:
        t = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, r, dtype=np.float32))
        if start:
            w[:r] = t
        if end:
            w[-r:] = t[::-1]
    return np.maximum(w, 1e-3)


def _starts(size: int, tile: int, step: int) -> list[int]:
    if size <= tile:
        return [0]
    s = list(range(0, size - tile, step))
    s.append(size - tile)
    return sorted(set(s))


def align_affine(src: np.ndarray, ref: np.ndarray) -> tuple[float, float]:
    """Robust (a, b) with a*src + b ~= ref using trimmed least squares."""
    x, y = src.ravel(), ref.ravel()
    ok = np.isfinite(x) & np.isfinite(y)
    if ok.sum() < 64:
        return 1.0, 0.0
    x, y = x[ok], y[ok]
    if x.size > 50_000:
        sel = np.random.default_rng(0).choice(x.size, 50_000, replace=False)
        x, y = x[sel], y[sel]
    if np.ptp(x) < 1e-9:
        return 1.0, float(np.mean(y) - np.mean(x))
    a, b = np.polyfit(x, y, 1)
    resid = np.abs(a * x + b - y)
    keep = resid <= np.percentile(resid, 80)
    if keep.sum() >= 64 and np.ptp(x[keep]) > 1e-9:
        a, b = np.polyfit(x[keep], y[keep], 1)
    if not np.isfinite(a) or a <= 0:
        return 1.0, float(np.mean(y) - np.mean(x))
    return float(a), float(b)


def tiled_predict(
    infer: Infer,
    rgb: np.ndarray,
    tile: int = 1036,
    overlap: int = 160,
    global_max: int = 1036,
    progress: Callable[[float], None] | None = None,
) -> np.ndarray:
    """Return an H x W float32 map in the global pass' units (larger = closer / higher)."""
    h, w = rgb.shape[:2]
    scale = min(1.0, global_max / max(h, w))
    small = (
        rgb
        if scale == 1.0
        else cv2.resize(rgb, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
    )
    g = infer(small).astype(np.float32)
    if g.shape != (h, w):
        g = cv2.resize(g, (w, h), interpolation=cv2.INTER_CUBIC)
    if max(h, w) <= tile:
        if progress:
            progress(1.0)
        return g

    step = max(tile - overlap, tile // 2)
    ys, xs = _starts(h, tile, step), _starts(w, tile, step)
    out = np.zeros((h, w), np.float32)
    wsum = np.zeros((h, w), np.float32)
    total, done = len(ys) * len(xs), 0
    for y0 in ys:
        for x0 in xs:
            y1, x1 = min(y0 + tile, h), min(x0 + tile, w)
            patch = rgb[y0:y1, x0:x1]
            d = infer(patch).astype(np.float32)
            if d.shape != patch.shape[:2]:
                d = cv2.resize(d, (patch.shape[1], patch.shape[0]), interpolation=cv2.INTER_CUBIC)
            a, b = align_affine(d, g[y0:y1, x0:x1])
            d = a * d + b
            wy = _ramp(y1 - y0, overlap, start=y0 > 0, end=y1 < h)
            wx = _ramp(x1 - x0, overlap, start=x0 > 0, end=x1 < w)
            win = wy[:, None] * wx[None, :]
            out[y0:y1, x0:x1] += d * win
            wsum[y0:y1, x0:x1] += win
            done += 1
            if progress:
                progress(done / total)
    return out / np.maximum(wsum, 1e-6)
