"""Coarse global DEM access (Copernicus GLO-30 by default, SRTM v3 / NASADEM optional)."""
from __future__ import annotations

import logging

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.transform import Affine
from rasterio.warp import Resampling, reproject

log = logging.getLogger(__name__)


def fetch_dem(bounds4326: tuple[float, float, float, float], source: str = "glo_30"):
    """Return (array, profile) of the DEM covering bounds (W, S, E, N in EPSG:4326)."""
    from dem_stitcher import stitch_dem

    w, s, e, n = bounds4326
    pad = 0.002  # ~200 m so bilinear resampling has support at the edges
    arr, profile = stitch_dem([w - pad, s - pad, e + pad, n + pad], dem_name=source,
                              dst_ellipsoidal_height=False, dst_area_or_point="Point")
    arr = arr.astype(np.float32)
    if profile.get("nodata") is not None:
        arr[arr == profile["nodata"]] = np.nan
    return arr, profile


def resample_to_grid(arr: np.ndarray, profile: dict, dst_crs: CRS, dst_transform: Affine,
                     dst_shape: tuple[int, int]) -> np.ndarray:
    out = np.full(dst_shape, np.nan, np.float32)
    src = np.where(np.isfinite(arr), arr, -32768).astype(np.float32)
    reproject(src, out, src_transform=profile["transform"], src_crs=profile["crs"],
              src_nodata=-32768, dst_transform=dst_transform, dst_crs=dst_crs, dst_nodata=np.nan,
              resampling=Resampling.bilinear)
    return out


def fetch_dem_on_grid(bounds4326, dst_crs: CRS, dst_transform: Affine, dst_shape: tuple[int, int],
                      source: str = "glo_30") -> tuple[np.ndarray, dict]:
    """DEM resampled onto the working image grid, plus metadata about the source."""
    arr, profile = fetch_dem(bounds4326, source)
    res = abs(profile["transform"].a)
    meta = {"source": source, "native_res_deg": res, "shape": list(arr.shape),
            "crs": str(profile["crs"])}
    return resample_to_grid(arr, profile, dst_crs, dst_transform, dst_shape), meta


def read_raster_on_grid(path, dst_crs: CRS | None, dst_transform: Affine | None,
                        dst_shape: tuple[int, int]) -> np.ndarray:
    """Read any raster (reference DSM/LiDAR) onto the working grid. Without georeferencing the
    raster is simply resized to the grid."""
    with rasterio.open(path) as ds:
        arr = ds.read(1).astype(np.float32)
        if ds.nodata is not None:
            arr[arr == ds.nodata] = np.nan
        if dst_crs is None or dst_transform is None or ds.crs is None or ds.transform.is_identity:
            import cv2

            src = np.where(np.isfinite(arr), arr, np.nan)
            return cv2.resize(src, (dst_shape[1], dst_shape[0]), interpolation=cv2.INTER_LINEAR)
        profile = {"transform": ds.transform, "crs": ds.crs}
    return resample_to_grid(arr, profile, dst_crs, dst_transform, dst_shape)
