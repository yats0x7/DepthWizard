"""Accuracy metrics against a reference DSM / LiDAR raster."""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np


def _stats(pred: np.ndarray, ref: np.ndarray) -> dict:
    err = pred - ref
    ae = np.abs(err)
    r = float(np.corrcoef(pred, ref)[0, 1]) if pred.size > 2 and np.std(pred) > 0 and np.std(ref) > 0 else float("nan")
    med = float(np.median(err))
    return {
        "n": int(pred.size),
        "rmse": float(np.sqrt(np.mean(err ** 2))),
        "mae": float(np.mean(ae)),
        "bias": float(np.mean(err)),
        "median_error": med,
        "nmad": float(1.4826 * np.median(np.abs(err - med))),
        "pearson_r": r,
        "abs_error_p90": float(np.percentile(ae, 90)),
        "within_1m": float(np.mean(ae <= 1.0)),
        "within_3m": float(np.mean(ae <= 3.0)),
    }


def compare(pred: np.ndarray, ref: np.ndarray, mask: np.ndarray | None = None,
            classes: dict[str, np.ndarray] | None = None) -> dict:
    """Metrics for raw prediction and for the scale/offset-aligned prediction (scale invariant).

    `classes` maps a name to a boolean mask (urban, forest, ...) for a per-landscape breakdown.
    """
    ok = np.isfinite(pred) & np.isfinite(ref)
    if mask is not None:
        ok &= mask
    p, r = pred[ok].astype(np.float64), ref[ok].astype(np.float64)
    if p.size < 16:
        return {"n": int(p.size), "error": "not enough overlapping valid pixels"}
    raw = _stats(p, r)
    a, b = np.polyfit(p, r, 1) if np.ptp(p) > 1e-9 else (1.0, float(np.mean(r - p)))
    aligned = _stats(a * p + b, r)
    aligned.update({"scale": float(a), "offset": float(b)})
    out = {"raw": raw, "aligned": aligned}
    if classes:
        out["per_class"] = {}
        for name, m in classes.items():
            sel = ok & m
            if sel.sum() >= 16:
                out["per_class"][name] = _stats(pred[sel].astype(np.float64), ref[sel].astype(np.float64))
    return out


def error_map_png(pred: np.ndarray, ref: np.ndarray, path: str | Path, clip: float | None = None) -> Path:
    err = pred - ref
    ok = np.isfinite(err)
    if clip is None:
        clip = float(np.percentile(np.abs(err[ok]), 95)) if ok.any() else 1.0
    clip = max(clip, 1e-6)
    norm = np.zeros(err.shape, np.uint8)
    norm[ok] = np.clip((err[ok] / clip + 1) / 2 * 255, 0, 255).astype(np.uint8)
    color = cv2.applyColorMap(norm, cv2.COLORMAP_JET)
    color[~ok] = 0
    cv2.imwrite(str(path), color)
    return Path(path)
