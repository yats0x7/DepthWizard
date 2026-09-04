"""Relative depth -> height, and height -> metric elevation.

Modes
- hybrid  (default): low-frequency terrain from the coarse DEM, high-frequency structure from
           the model, structural scale fitted against the DEM relief with a scene prior fallback.
- affine : DSM = a * rel + b fitted with RANSAC directly against the DEM.
- prior  : no DEM; structural scale from a scene-level height prior only.
Ground Control Points refit (a, b) on the current DSM and work for every mode, including
non-georeferenced inputs (turning an rDSM into metric heights).
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field

import numpy as np
from scipy.ndimage import gaussian_filter


@dataclass
class GCP:
    row: float
    col: float
    z: float


@dataclass
class Calibration:
    mode: str  # relative | hybrid | affine | prior | gcp
    scale: float = 1.0
    offset: float = 0.0
    r2: float | None = None
    n: int = 0
    used_prior: bool = False
    gcp_count: int = 0
    dem: dict = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def relative_height(disparity: np.ndarray, mask: np.ndarray | None = None) -> np.ndarray:
    """Robustly normalise a closer-is-larger map to [0, 1] relative height."""
    valid = np.isfinite(disparity)
    if mask is not None:
        valid &= ~mask
    if not valid.any():
        return np.zeros_like(disparity, np.float32)
    lo, hi = np.percentile(disparity[valid], [0.5, 99.5])
    if hi <= lo:
        hi = lo + 1e-6
    rel = np.clip((disparity - lo) / (hi - lo), 0, 1).astype(np.float32)
    rel[~valid] = np.nan
    return rel


def _ransac_affine(x: np.ndarray, y: np.ndarray) -> tuple[float, float, float, int]:
    from sklearn.linear_model import LinearRegression, RANSACRegressor

    ok = np.isfinite(x) & np.isfinite(y)
    x, y = x[ok], y[ok]
    if x.size < 32 or np.ptp(x) < 1e-6:
        return 1.0, float(np.nanmean(y)) if y.size else 0.0, 0.0, int(x.size)
    if x.size > 100_000:
        sel = np.random.default_rng(0).choice(x.size, 100_000, replace=False)
        x, y = x[sel], y[sel]
    resid = max(1.0, 0.5 * float(np.std(y)))
    r = RANSACRegressor(LinearRegression(), residual_threshold=resid, random_state=0,
                        min_samples=max(32, int(0.05 * x.size)))
    r.fit(x[:, None], y)
    a = float(r.estimator_.coef_[0])
    b = float(r.estimator_.intercept_)
    inl = r.inlier_mask_
    pred = a * x[inl] + b
    ss_res = float(np.sum((y[inl] - pred) ** 2))
    ss_tot = float(np.sum((y[inl] - y[inl].mean()) ** 2)) or 1e-9
    return a, b, max(0.0, 1 - ss_res / ss_tot), int(inl.sum())


def _prior_scale(structure: np.ndarray, p95_m: float) -> float:
    pos = structure[np.isfinite(structure) & (structure > 0)]
    if pos.size < 16:
        return 1.0
    p95 = float(np.percentile(pos, 95))
    return p95_m / p95 if p95 > 1e-6 else 1.0


def calibrate(rel: np.ndarray, dem: np.ndarray | None, pixel_size_m: tuple[float, float] | None,
              mode: str = "hybrid", prior_p95_m: float = 20.0, min_r2: float = 0.3,
              min_relief_m: float = 5.0, dem_res_m: float = 30.0) -> tuple[np.ndarray, Calibration]:
    """Convert relative height to metric elevation. Returns (dsm, calibration)."""
    cal = Calibration(mode=mode)
    valid = np.isfinite(rel)
    if dem is None or mode == "prior":
        px = pixel_size_m[0] if pixel_size_m else 1.0
        sigma = max(2.0, dem_res_m / px)
        base = gaussian_filter(np.nan_to_num(rel, nan=float(np.nanmean(rel))), sigma)
        structure = rel - base
        a = _prior_scale(structure, prior_p95_m)
        dsm = a * rel
        cal.mode, cal.scale, cal.used_prior, cal.n = "prior", a, True, int(valid.sum())
        cal.notes.append("no DEM available: heights scaled with scene prior, offset unknown")
        dsm[~valid] = np.nan
        return dsm.astype(np.float32), cal

    valid &= np.isfinite(dem)
    px = pixel_size_m[0] if pixel_size_m else 1.0
    sigma = max(2.0, dem_res_m / px)  # DEM cell size in working pixels
    filled = np.nan_to_num(rel, nan=float(np.nanmean(rel[np.isfinite(rel)])))
    rel_lp = gaussian_filter(filled, sigma)
    relief = float(np.nanpercentile(dem, 98) - np.nanpercentile(dem, 2))

    if mode == "affine":
        a, b, r2, n = _ransac_affine(rel_lp[valid], dem[valid])
        cal.r2, cal.n = r2, n
        if a <= 0 or r2 < min_r2 or relief < min_relief_m:
            a = _prior_scale(rel - rel_lp, prior_p95_m)
            b = float(np.nanmean(dem[valid]) - a * np.nanmean(rel[valid]))
            cal.used_prior = True
            cal.notes.append(f"affine fit unreliable (r2={r2:.2f}, relief={relief:.1f} m); prior scale")
        dsm = a * rel + b
        cal.scale, cal.offset = a, b
        dsm[~np.isfinite(rel)] = np.nan
        return dsm.astype(np.float32), cal

    # hybrid
    a, b, r2, n = _ransac_affine(rel_lp[valid], dem[valid])
    cal.r2, cal.n = r2, n
    structure = rel - rel_lp
    if a <= 0 or r2 < min_r2 or relief < min_relief_m:
        a = _prior_scale(structure, prior_p95_m)
        cal.used_prior = True
        cal.notes.append(f"terrain fit weak (r2={r2:.2f}, relief={relief:.1f} m); structural scale from prior")
    dem_filled = np.where(np.isfinite(dem), dem, np.nanmean(dem))
    dsm = dem_filled + a * structure
    cal.scale, cal.offset = a, 0.0
    cal.notes.append("hybrid: DEM terrain + model structure")
    dsm[~np.isfinite(rel)] = np.nan
    return dsm.astype(np.float32), cal


def apply_gcps(dsm: np.ndarray, gcps: list[GCP], cal: Calibration) -> tuple[np.ndarray, Calibration]:
    """Refit the current DSM to ground control points. 1 GCP -> offset, 2+ -> scale and offset."""
    if not gcps:
        return dsm, cal
    h, w = dsm.shape
    xs, zs = [], []
    for g in gcps:
        r, c = int(round(g.row)), int(round(g.col))
        if 0 <= r < h and 0 <= c < w:
            r0, r1, c0, c1 = max(0, r - 1), min(h, r + 2), max(0, c - 1), min(w, c + 2)
            v = np.nanmedian(dsm[r0:r1, c0:c1])
            if np.isfinite(v):
                xs.append(v)
                zs.append(g.z)
    if not xs:
        return dsm, cal
    x, z = np.array(xs), np.array(zs)
    if len(x) >= 2 and np.ptp(x) > 1e-6:
        a, b = np.polyfit(x, z, 1)
        if a <= 0:
            a, b = 1.0, float(np.mean(z - x))
    else:
        a, b = 1.0, float(np.mean(z - x))
    out = (a * dsm + b).astype(np.float32)
    new = Calibration(mode="gcp", scale=cal.scale * a, offset=cal.offset * a + b, r2=cal.r2,
                      n=cal.n, used_prior=False, gcp_count=len(x), dem=cal.dem,
                      notes=cal.notes + [f"refit on {len(x)} GCP(s): z = {a:.4f}*h + {b:.2f}"])
    return out, new
