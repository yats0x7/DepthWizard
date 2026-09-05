"""Relative depth -> relative height -> metric elevation.

Modes
- hybrid (default): low-frequency terrain from the coarse DEM, high-frequency structure from the
  model, structural scale fitted against the DEM relief with a scene-prior fallback.
- affine: DSM = a * rel + b fitted with RANSAC directly against the DEM.
- prior: no DEM; structural scale from a scene-level height prior only (offset unknown).
Ground control points refit (a, b) on the current DSM and work for every mode, including
non-georeferenced inputs, turning a relative DSM into metric heights.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

import cv2
import numpy as np
from scipy.ndimage import distance_transform_edt, gaussian_filter


def lowpass_nan(arr: np.ndarray, sigma: float) -> np.ndarray:
    """Gaussian low-pass that ignores NaN (normalised convolution) so nodata edges create no halos."""
    valid = np.isfinite(arr)
    num = gaussian_filter(np.where(valid, arr, 0.0).astype(np.float32), sigma, mode="mirror")
    den = gaussian_filter(valid.astype(np.float32), sigma, mode="mirror")
    out = np.full(arr.shape, np.nan, np.float32)
    ok = den > 1e-3
    out[ok] = num[ok] / den[ok]
    return out


def fill_nearest(arr: np.ndarray) -> np.ndarray:
    """Fill NaN with the nearest valid value (DEM gaps such as ocean or tile seams)."""
    valid = np.isfinite(arr)
    if valid.all():
        return arr
    if not valid.any():
        return np.zeros_like(arr)
    idx = distance_transform_edt(~valid, return_distances=False, return_indices=True)
    return arr[tuple(idx)]


def ground_trend(rel: np.ndarray, sigma: float, iters: int = 4, above_weight: float = 0.08) -> np.ndarray:
    """Robust low-frequency ground estimate by asymmetric Gaussian smoothing.

    Objects (buildings, trees) sit above the ground, so a plain Gaussian pulls the terrain trend up
    around them. Points above the current trend are down-weighted and the smoothing repeated, which
    converges on the ground while staying unbiased on sloped terrain (a percentile filter would be
    biased downhill). Computed on a coarse grid for speed and returned at full resolution.
    """
    h, w = rel.shape
    filled = fill_nearest(rel) if not np.isfinite(rel).all() else rel
    f = max(1, int(sigma / 2))
    ch, cw = max(2, int(round(h / f))), max(2, int(round(w / f)))
    coarse = cv2.resize(filled.astype(np.float32), (cw, ch), interpolation=cv2.INTER_AREA)
    s = max(sigma / f, 0.5)
    trend = gaussian_filter(coarse, s, mode="mirror")
    for _ in range(iters):
        wgt = np.where(coarse > trend + 1e-4, above_weight, 1.0).astype(np.float32)
        trend = gaussian_filter(wgt * coarse, s, mode="mirror") / np.maximum(
            gaussian_filter(wgt, s, mode="mirror"), 1e-3
        )
    out = cv2.resize(trend, (w, h), interpolation=cv2.INTER_CUBIC) if f > 1 else trend
    out = out.astype(np.float32)
    out[~np.isfinite(rel)] = np.nan
    return out


def clip_structure(structure: np.ndarray, lo_pct: float = 0.5, hi_pct: float = 99.8) -> np.ndarray:
    v = structure[np.isfinite(structure)]
    if v.size < 16:
        return structure
    lo, hi = np.percentile(v, [lo_pct, hi_pct])
    return np.clip(structure, lo, hi)


@dataclass
class GCP:
    row: float
    col: float
    z: float
    label: str = ""


@dataclass
class Calibration:
    mode: str  # relative | hybrid | affine | prior | semantic | gcp
    scale: float = 1.0
    offset: float = 0.0
    r2: float | None = None
    n: int = 0
    used_prior: bool = False
    gcp_count: int = 0
    gcp_rmse: float | None = None
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


def ransac_affine(x: np.ndarray, y: np.ndarray) -> tuple[float, float, float, int]:
    """(a, b, r2, inliers) for y ~= a*x + b with RANSAC on up to 100k samples."""
    from sklearn.linear_model import LinearRegression, RANSACRegressor

    ok = np.isfinite(x) & np.isfinite(y)
    x, y = x[ok], y[ok]
    if x.size < 32 or np.ptp(x) < 1e-6:
        return 1.0, float(np.mean(y)) if y.size else 0.0, 0.0, int(x.size)
    if x.size > 100_000:
        sel = np.random.default_rng(0).choice(x.size, 100_000, replace=False)
        x, y = x[sel], y[sel]
    resid = max(1.0, 0.5 * float(np.std(y)))
    r = RANSACRegressor(
        LinearRegression(), residual_threshold=resid, random_state=0, min_samples=max(32, int(0.05 * x.size))
    )
    r.fit(x[:, None], y)
    a = float(r.estimator_.coef_[0])
    b = float(r.estimator_.intercept_)
    inl = r.inlier_mask_
    pred = a * x[inl] + b
    ss_res = float(np.sum((y[inl] - pred) ** 2))
    ss_tot = float(np.sum((y[inl] - y[inl].mean()) ** 2)) or 1e-9
    return a, b, max(0.0, 1 - ss_res / ss_tot), int(inl.sum())


def prior_scale(structure: np.ndarray, p95_m: float) -> float:
    pos = structure[np.isfinite(structure) & (structure > 0)]
    if pos.size < 16:
        return 1.0
    p95 = float(np.percentile(pos, 95))
    return p95_m / p95 if p95 > 1e-6 else 1.0


def calibrate(
    rel: np.ndarray,
    dem: np.ndarray | None,
    pixel_size_m: tuple[float, float] | None,
    mode: str = "hybrid",
    prior_p95_m: float = 20.0,
    min_r2: float = 0.3,
    min_relief_m: float = 5.0,
    dem_res_m: float = 30.0,
    flat_mask: np.ndarray | None = None,
) -> tuple[np.ndarray, Calibration]:
    """Convert relative height to metric elevation. Returns (dsm, calibration)."""
    cal = Calibration(mode=mode)
    valid = np.isfinite(rel)
    px = pixel_size_m[0] if pixel_size_m else 1.0
    sigma = max(2.0, dem_res_m / px)  # one DEM cell expressed in working pixels

    if mode == "semantic":
        return _calibrate_semantic(
            rel,
            dem,
            pixel_size_m,
            flat_mask,
            prior_p95_m,
            min_r2,
            min_relief_m,
            dem_res_m,
        )

    if dem is None or mode == "prior":
        structure = clip_structure(rel - ground_trend(rel, sigma))
        a = prior_scale(structure, prior_p95_m)
        dsm = a * rel
        cal.mode, cal.scale, cal.used_prior, cal.n = "prior", a, True, int(valid.sum())
        cal.notes.append("no DEM: heights scaled with the scene prior, absolute offset unknown")
        dsm[~valid] = np.nan
        return dsm.astype(np.float32), cal

    valid &= np.isfinite(dem)
    rel_lp = ground_trend(rel, sigma)
    relief = float(np.nanpercentile(dem, 98) - np.nanpercentile(dem, 2))
    structure = clip_structure(rel - rel_lp)
    a, b, r2, n = ransac_affine(rel_lp[valid], dem[valid])
    cal.r2, cal.n = r2, n
    weak = a <= 0 or r2 < min_r2 or relief < min_relief_m

    if mode == "affine":
        if weak:
            a = prior_scale(structure, prior_p95_m)
            b = float(np.nanmean(dem[valid]) - a * np.nanmean(rel[valid]))
            cal.used_prior = True
            cal.notes.append(f"affine fit unreliable (r2={r2:.2f}, relief={relief:.1f} m); prior scale")
        dsm = a * rel + b
        cal.scale, cal.offset = a, b
        dsm[~np.isfinite(rel)] = np.nan
        return dsm.astype(np.float32), cal

    if weak:
        a = prior_scale(structure, prior_p95_m)
        cal.used_prior = True
        cal.notes.append(
            f"terrain fit weak (r2={r2:.2f}, relief={relief:.1f} m); structural scale from prior"
        )
    dsm = fill_nearest(dem) + a * structure
    cal.mode, cal.scale, cal.offset = "hybrid", a, 0.0
    cal.notes.append("hybrid: DEM terrain trend + model structure")
    dsm[~np.isfinite(rel)] = np.nan
    return dsm.astype(np.float32), cal


def _fit_ground_plane(dem: np.ndarray, flat: np.ndarray) -> np.ndarray | None:
    ys, xs = np.nonzero(flat & np.isfinite(dem))
    if len(xs) < 32:
        return None
    h, w = dem.shape
    x = (xs - (w - 1) / 2) / max(w, 1)
    y = (ys - (h - 1) / 2) / max(h, 1)
    design = np.column_stack((x, y, np.ones_like(x)))
    coef, *_ = np.linalg.lstsq(design, dem[ys, xs], rcond=None)
    yy, xx = np.mgrid[0:h, 0:w]
    return (
        coef[0] * ((xx - (w - 1) / 2) / max(w, 1))
        + coef[1] * ((yy - (h - 1) / 2) / max(h, 1))
        + coef[2]
    ).astype(np.float32)


def _calibrate_semantic(
    rel: np.ndarray,
    dem: np.ndarray | None,
    pixel_size_m: tuple[float, float] | None,
    flat_mask: np.ndarray | None,
    prior_p95_m: float,
    min_r2: float,
    min_relief_m: float,
    dem_res_m: float,
) -> tuple[np.ndarray, Calibration]:
    """Calibrate with flat-surface constraints while keeping the old routes untouched."""
    valid = np.isfinite(rel) & (np.isfinite(dem) if dem is not None else True)
    flat = np.asarray(flat_mask, dtype=bool) if flat_mask is not None else np.zeros(rel.shape, bool)
    if flat.shape != rel.shape:
        raise ValueError("flat_mask must have the same shape as rel")
    flat &= valid
    if int(flat.sum()) < 32:
        dsm, fallback = calibrate(
            rel,
            dem,
            pixel_size_m,
            mode="hybrid" if dem is not None else "prior",
            prior_p95_m=prior_p95_m,
            min_r2=min_r2,
            min_relief_m=min_relief_m,
            dem_res_m=dem_res_m,
        )
        fallback.mode = "semantic"
        fallback.notes.insert(0, f"semantic prior unavailable ({int(flat.sum())} flat pixels); used fallback route")
        return dsm, fallback

    px = pixel_size_m[0] if pixel_size_m else 1.0
    sigma = max(2.0, dem_res_m / px)
    trend = ground_trend(rel, sigma)
    structure = np.maximum(clip_structure(rel - trend), 0.0)
    structure[flat] = 0.0
    cal = Calibration(mode="semantic", n=int(valid.sum()))

    if dem is None:
        datum = float(np.nanmedian(rel[flat]))
        a = prior_scale(structure, prior_p95_m)
        dsm = a * (rel - datum)
        dsm[~valid] = np.nan
        cal.scale, cal.offset, cal.used_prior = a, -a * datum, True
        cal.notes.append("semantic prior: candidate flat surfaces define the local zero plane")
        cal.notes.append("no DEM: structural scale uses the scene prior, so absolute datum is unknown")
        return dsm.astype(np.float32), cal

    ground = _fit_ground_plane(dem, flat)
    if ground is None:
        # The count check above protects normal use; retain a defensive fallback for degenerate masks.
        return _calibrate_semantic(rel, dem, pixel_size_m, None, prior_p95_m, min_r2, min_relief_m, dem_res_m)
    residual = dem - ground
    fit = valid & ~flat & (structure > 1e-5) & np.isfinite(residual)
    a, _b, r2, n = ransac_affine(structure[fit], residual[fit]) if int(fit.sum()) >= 32 else (0.0, 0.0, 0.0, int(fit.sum()))
    relief = float(np.nanpercentile(dem[valid], 98) - np.nanpercentile(dem[valid], 2)) if valid.any() else 0.0
    if a <= 0 or r2 < min_r2 or relief < min_relief_m:
        a = prior_scale(structure, prior_p95_m)
        cal.used_prior = True
        cal.notes.append(f"semantic structure fit weak (r2={r2:.2f}, relief={relief:.1f} m); prior scale")
    cal.scale, cal.r2, cal.n = a, r2, n
    dsm = ground + a * structure
    dsm[~valid] = np.nan
    cal.notes.append(f"semantic prior: {int(flat.sum())} flat pixels pinned to a fitted local ground plane")
    cal.notes.append("positive model structure is retained above the constrained ground plane")
    return dsm.astype(np.float32), cal


def apply_gcps(dsm: np.ndarray, gcps: list[GCP], cal: Calibration) -> tuple[np.ndarray, Calibration]:
    """Refit the current DSM to ground control points: 1 GCP -> offset, 2+ -> scale and offset."""
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
    rmse = float(np.sqrt(np.mean((a * x + b - z) ** 2)))
    new = Calibration(
        mode="gcp",
        scale=cal.scale * a,
        offset=cal.offset * a + b,
        r2=cal.r2,
        n=cal.n,
        used_prior=False,
        gcp_count=len(x),
        gcp_rmse=rmse,
        dem=cal.dem,
        notes=cal.notes + [f"refit on {len(x)} GCP(s): z = {a:.4f}*h + {b:.2f}, rmse {rmse:.2f} m"],
    )
    return out, new
