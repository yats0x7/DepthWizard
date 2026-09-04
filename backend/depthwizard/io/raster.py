from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
import rasterio
from PIL import Image, ImageOps
from rasterio.crs import CRS
from rasterio.transform import Affine
from rasterio.warp import transform_bounds

NODATA = -9999.0
RASTER_EXT = {".tif", ".tiff", ".geotiff", ".jp2", ".img", ".vrt"}


@dataclass
class RasterInput:
    rgb: np.ndarray  # H x W x 3 uint8
    path: Path
    crs: CRS | None = None
    transform: Affine | None = None
    nodata_mask: np.ndarray | None = None  # True where source has no data
    downscale: float = 1.0  # source px / working px

    @property
    def georeferenced(self) -> bool:
        return self.crs is not None and self.transform is not None and not self.transform.is_identity

    @property
    def shape(self) -> tuple[int, int]:
        return self.rgb.shape[0], self.rgb.shape[1]

    @property
    def bounds(self) -> tuple[float, float, float, float] | None:
        if not self.georeferenced:
            return None
        h, w = self.shape
        return rasterio.transform.array_bounds(h, w, self.transform)

    @property
    def bounds4326(self) -> tuple[float, float, float, float] | None:
        if not self.georeferenced:
            return None
        return transform_bounds(self.crs, CRS.from_epsg(4326), *self.bounds, densify_pts=21)

    @property
    def pixel_size_m(self) -> tuple[float, float] | None:
        """Approximate (dx, dy) ground sample distance in metres."""
        if not self.georeferenced:
            return None
        dx, dy = abs(self.transform.a), abs(self.transform.e)
        if self.crs.is_geographic:
            w, s, e, n = self.bounds
            lat = math.radians((s + n) / 2)
            return dx * 111_320 * math.cos(lat), dy * 110_540
        factor = self.crs.linear_units_factor[1] if self.crs.linear_units_factor else 1.0
        return dx * factor, dy * factor


def _stretch_to_uint8(band: np.ndarray, nodata: np.ndarray | None) -> np.ndarray:
    if band.dtype == np.uint8:
        return band
    valid = band[~nodata] if nodata is not None else band.ravel()
    valid = valid[np.isfinite(valid)]
    if valid.size == 0:
        return np.zeros(band.shape, np.uint8)
    lo, hi = np.percentile(valid, [1, 99])
    if hi <= lo:
        hi = lo + 1
    return np.clip((band.astype(np.float32) - lo) / (hi - lo) * 255, 0, 255).astype(np.uint8)


def _downscale(rgb: np.ndarray, max_dim: int) -> tuple[np.ndarray, float]:
    h, w = rgb.shape[:2]
    if max(h, w) <= max_dim:
        return rgb, 1.0
    f = max(h, w) / max_dim
    out = cv2.resize(rgb, (round(w / f), round(h / f)), interpolation=cv2.INTER_AREA)
    return out, f


def load_image(path: str | Path, max_dim: int = 6000) -> RasterInput:
    """Load PNG/JPG (non-georeferenced) or GeoTIFF (georeferenced when CRS + transform exist)."""
    path = Path(path)
    if path.suffix.lower() in RASTER_EXT:
        with rasterio.open(path) as ds:
            count = ds.count
            idx = [1, 2, 3] if count >= 3 else [1]
            data = ds.read(idx)
            nodata_mask = None
            if ds.nodata is not None:
                nodata_mask = np.all(data == ds.nodata, axis=0)
            if count >= 4:
                alpha = ds.read(count)
                nodata_mask = (alpha == 0) if nodata_mask is None else nodata_mask | (alpha == 0)
            bands = [_stretch_to_uint8(b, nodata_mask) for b in data]
            if len(bands) == 1:
                bands = bands * 3
            rgb = np.stack(bands, axis=-1)
            crs = ds.crs
            transform = ds.transform
        rgb, f = _downscale(rgb, max_dim)
        if nodata_mask is not None and f != 1.0:
            nodata_mask = cv2.resize(nodata_mask.astype(np.uint8), (rgb.shape[1], rgb.shape[0]),
                                     interpolation=cv2.INTER_NEAREST).astype(bool)
        if transform is not None and f != 1.0:
            transform = transform * Affine.scale(f, f)
        if crs is None or transform is None or transform.is_identity:
            crs, transform = None, None
        return RasterInput(rgb=rgb, path=path, crs=crs, transform=transform,
                           nodata_mask=nodata_mask, downscale=f)

    img = ImageOps.exif_transpose(Image.open(path))
    alpha = None
    if img.mode in ("RGBA", "LA"):
        alpha = np.asarray(img.getchannel("A")) == 0
    rgb = np.asarray(img.convert("RGB"))
    rgb, f = _downscale(rgb, max_dim)
    if alpha is not None and f != 1.0:
        alpha = cv2.resize(alpha.astype(np.uint8), (rgb.shape[1], rgb.shape[0]),
                           interpolation=cv2.INTER_NEAREST).astype(bool)
    return RasterInput(rgb=rgb, path=path, nodata_mask=alpha, downscale=f)


def write_geotiff(path: str | Path, arr: np.ndarray, crs: CRS | None, transform: Affine | None,
                  nodata: float = NODATA) -> Path:
    path = Path(path)
    data = np.where(np.isfinite(arr), arr, nodata).astype(np.float32)
    profile = {
        "driver": "GTiff", "height": data.shape[0], "width": data.shape[1], "count": 1,
        "dtype": "float32", "nodata": nodata, "compress": "deflate", "predictor": 3,
        "tiled": True, "blockxsize": 256, "blockysize": 256,
    }
    if crs is not None and transform is not None:
        profile.update(crs=crs, transform=transform)
    with rasterio.open(path, "w", **profile) as ds:
        ds.write(data, 1)
        ds.update_tags(AREA_OR_POINT="Area", SOFTWARE="DepthWizard")
    return path


def write_png16(path: str | Path, arr: np.ndarray) -> tuple[Path, float, float]:
    """16-bit heightmap PNG. Returns (path, min, max) so the scale can be recovered."""
    valid = np.isfinite(arr)
    lo, hi = (float(arr[valid].min()), float(arr[valid].max())) if valid.any() else (0.0, 1.0)
    span = hi - lo if hi > lo else 1.0
    q = np.zeros(arr.shape, np.uint16)
    q[valid] = np.round((arr[valid] - lo) / span * 65535).astype(np.uint16)
    Image.fromarray(q).save(path)
    return Path(path), lo, hi


def write_preview(path: str | Path, arr: np.ndarray, hillshade: bool = True) -> Path:
    valid = np.isfinite(arr)
    lo, hi = (np.percentile(arr[valid], [1, 99]) if valid.any() else (0.0, 1.0))
    norm = np.zeros(arr.shape, np.uint8)
    if hi > lo:
        norm[valid] = np.clip((arr[valid] - lo) / (hi - lo) * 255, 0, 255).astype(np.uint8)
    color = cv2.applyColorMap(norm, cv2.COLORMAP_TURBO)
    if hillshade and valid.any():
        z = np.where(valid, arr, np.nanmean(arr[valid]))
        gy, gx = np.gradient(z)
        slope = np.pi / 2 - np.arctan(np.hypot(gx, gy) * 2 / max(hi - lo, 1e-6) * 50)
        aspect = np.arctan2(-gx, gy)
        az, alt = np.radians(315), np.radians(45)
        shade = np.sin(alt) * np.sin(slope) + np.cos(alt) * np.cos(slope) * np.cos(az - aspect)
        shade = np.clip((shade + 1) / 2, 0.35, 1.0)[..., None]
        color = (color * shade).astype(np.uint8)
    color[~valid] = 0
    cv2.imwrite(str(path), color)
    return Path(path)


def write_texture(path: str | Path, rgb: np.ndarray, max_side: int = 2048) -> Path:
    h, w = rgb.shape[:2]
    if max(h, w) > max_side:
        f = max(h, w) / max_side
        rgb = cv2.resize(rgb, (round(w / f), round(h / f)), interpolation=cv2.INTER_AREA)
    Image.fromarray(rgb).save(path, quality=92)
    return Path(path)
