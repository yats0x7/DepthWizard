"""Terrain derivatives and summary statistics computed once per job."""

from __future__ import annotations

import numpy as np


def slope_aspect(z: np.ndarray, dx: float = 1.0, dy: float = 1.0) -> tuple[np.ndarray, np.ndarray]:
    """Slope in degrees and aspect in degrees clockwise from north. NaN where z is NaN."""
    valid = np.isfinite(z)
    fill = float(np.nanmean(z[valid])) if valid.any() else 0.0
    zz = np.where(valid, z, fill)
    gy, gx = np.gradient(zz, dy, dx)
    slope = np.degrees(np.arctan(np.hypot(gx, gy))).astype(np.float32)
    aspect = (np.degrees(np.arctan2(gx, -gy)) + 360.0) % 360.0
    slope[~valid] = np.nan
    aspect = aspect.astype(np.float32)
    aspect[~valid] = np.nan
    return slope, aspect


def histogram(z: np.ndarray, bins: int = 64) -> dict:
    v = z[np.isfinite(z)]
    if v.size == 0:
        return {"bins": [], "counts": []}
    counts, edges = np.histogram(v, bins=bins)
    return {"bins": [float(e) for e in edges], "counts": [int(c) for c in counts]}


def surface_stats(z: np.ndarray, pixel_size: tuple[float, float] | None) -> dict:
    v = z[np.isfinite(z)]
    if v.size == 0:
        return {"valid_fraction": 0.0}
    p = np.percentile(v, [2, 25, 50, 75, 98])
    out = {
        "valid_fraction": float(v.size / z.size),
        "min": float(v.min()),
        "max": float(v.max()),
        "mean": float(v.mean()),
        "std": float(v.std()),
        "p2": float(p[0]),
        "p25": float(p[1]),
        "median": float(p[2]),
        "p75": float(p[3]),
        "p98": float(p[4]),
        "relief": float(p[4] - p[0]),
    }
    if pixel_size:
        slope, _ = slope_aspect(z, *pixel_size)
        s = slope[np.isfinite(slope)]
        out["slope_mean_deg"] = float(s.mean())
        out["slope_p90_deg"] = float(np.percentile(s, 90))
        out["steep_fraction"] = float(np.mean(s > 30))
    out["histogram"] = histogram(z)
    return out
