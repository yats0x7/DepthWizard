"""Coarse global DEM access with an on-disk cache."""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.transform import Affine
from rasterio.warp import Resampling, reproject

log = logging.getLogger(__name__)
CACHE_NODATA = -32768.0


def cache_dir() -> Path:
    from ..config import settings

    d = Path(settings.data_dir) / "dem_cache"
    d.mkdir(parents=True, exist_ok=True)
    return d


def fetch_dem(bounds4326: tuple[float, float, float, float], source: str = "terrarium"):
    """Return (array, profile) of the DEM covering bounds (W, S, E, N in EPSG:4326).

    Results are cached per (source, bounds rounded to ~10 m) because fetching is the slowest step.
    """
    w, s, e, n = bounds4326
    pad = 0.002  # ~200 m so bilinear resampling has support at the edges
    box = [round(w - pad, 4), round(s - pad, 4), round(e + pad, 4), round(n + pad, 4)]
    key = hashlib.sha1(json.dumps([source, box]).encode()).hexdigest()[:16]
    cache = cache_dir() / f"{source}_{key}.tif"
    if cache.exists():
        with rasterio.open(cache) as ds:
            arr = ds.read(1).astype(np.float32)
            arr[arr == ds.nodata] = np.nan
            return arr, {"transform": ds.transform, "crs": ds.crs, "nodata": ds.nodata, "cached": True}

    if source == "terrarium":
        from .terrarium import fetch_terrarium

        arr, profile = fetch_terrarium(box)
    else:
        from dem_stitcher import stitch_dem

        arr, profile = stitch_dem(
            box, dem_name=source, dst_ellipsoidal_height=False, dst_area_or_point="Point"
        )
        arr = arr.astype(np.float32)
        if profile.get("nodata") is not None:
            arr[arr == profile["nodata"]] = np.nan
    try:
        with rasterio.open(
            cache,
            "w",
            driver="GTiff",
            height=arr.shape[0],
            width=arr.shape[1],
            count=1,
            dtype="float32",
            crs=profile["crs"],
            transform=profile["transform"],
            nodata=CACHE_NODATA,
            compress="deflate",
        ) as ds:
            ds.write(np.where(np.isfinite(arr), arr, CACHE_NODATA).astype(np.float32), 1)
    except Exception as exc:  # best effort
        log.warning("could not cache DEM: %s", exc)
    return arr, profile


def resample_to_grid(
    arr: np.ndarray, profile: dict, dst_crs: CRS, dst_transform: Affine, dst_shape: tuple[int, int]
) -> np.ndarray:
    out = np.full(dst_shape, np.nan, np.float32)
    src = np.where(np.isfinite(arr), arr, CACHE_NODATA).astype(np.float32)
    reproject(
        src,
        out,
        src_transform=profile["transform"],
        src_crs=profile["crs"],
        src_nodata=CACHE_NODATA,
        dst_transform=dst_transform,
        dst_crs=dst_crs,
        dst_nodata=np.nan,
        resampling=Resampling.bilinear,
    )
    return out


def fetch_dem_on_grid(
    bounds4326, dst_crs: CRS, dst_transform: Affine, dst_shape: tuple[int, int], source: str = "terrarium"
) -> tuple[np.ndarray, dict]:
    """DEM resampled onto the working grid plus metadata about the source."""
    arr, profile = fetch_dem(bounds4326, source)
    res = abs(profile["transform"].a)
    if profile["crs"] and profile["crs"].is_geographic:
        res *= 111_320
    meta = {
        "source": source,
        "native_res_m": round(float(res), 2),
        "shape": list(arr.shape),
        "crs": str(profile["crs"]),
        "cached": bool(profile.get("cached", False)),
    }
    return resample_to_grid(arr, profile, dst_crs, dst_transform, dst_shape), meta


def read_raster_on_grid(
    path, dst_crs: CRS | None, dst_transform: Affine | None, dst_shape: tuple[int, int]
) -> np.ndarray:
    """Read any raster (reference DSM / LiDAR) onto the working grid; plain resize when ungeoreferenced."""
    with rasterio.open(path) as ds:
        arr = ds.read(1).astype(np.float32)
        if ds.nodata is not None:
            arr[arr == ds.nodata] = np.nan
        if dst_crs is None or dst_transform is None or ds.crs is None or ds.transform.is_identity:
            import cv2

            return cv2.resize(arr, (dst_shape[1], dst_shape[0]), interpolation=cv2.INTER_LINEAR)
        profile = {"transform": ds.transform, "crs": ds.crs}
    return resample_to_grid(arr, profile, dst_crs, dst_transform, dst_shape)
