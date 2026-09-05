"""Coarse DEM from AWS Terrain Tiles (Mapzen 'terrarium' PNG tiles, public, no login).

The tiles are a global composite of SRTM, NED, GMTED and others at up to ~30 m. Only the tiles
covering the scene are fetched (a few KB each) so a scene takes seconds instead of the minutes
needed for the 1-degree GeoTIFF tiles behind Copernicus / SRTM downloads.
"""

from __future__ import annotations

import io
import logging
import math
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import requests
from PIL import Image
from rasterio.crs import CRS
from rasterio.transform import Affine

log = logging.getLogger(__name__)
URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
R_EARTH = 6378137.0
MAX_TILES = 64


def lonlat_to_tile(lon: float, lat: float, z: int) -> tuple[float, float]:
    n = 2**z
    x = (lon + 180.0) / 360.0 * n
    lat_r = math.radians(max(-85.05, min(85.05, lat)))
    y = (1.0 - math.log(math.tan(lat_r) + 1 / math.cos(lat_r)) / math.pi) / 2.0 * n
    return x, y


def pick_zoom(bounds4326, target_res_m: float = 30.0) -> int:
    w, s, e, n = bounds4326
    lat = math.radians((s + n) / 2)
    for z in range(14, 0, -1):
        res = 2 * math.pi * R_EARTH * math.cos(lat) / (256 * 2**z)
        x0, y0 = lonlat_to_tile(w, n, z)
        x1, y1 = lonlat_to_tile(e, s, z)
        ntiles = (int(x1) - int(x0) + 1) * (int(y1) - int(y0) + 1)
        if res >= target_res_m * 0.8 and ntiles <= MAX_TILES:
            return z
    return 1


def decode(png_bytes: bytes) -> np.ndarray:
    img = np.asarray(Image.open(io.BytesIO(png_bytes)).convert("RGB")).astype(np.float32)
    return img[..., 0] * 256 + img[..., 1] + img[..., 2] / 256 - 32768


def _fetch(z: int, x: int, y: int, session: requests.Session) -> np.ndarray:
    r = session.get(URL.format(z=z, x=x, y=y), timeout=30)
    r.raise_for_status()
    return decode(r.content)


def fetch_terrarium(bounds4326, target_res_m: float = 30.0, pad_tiles: int = 1):
    """Return (array, profile) in EPSG:3857 covering the bounds."""
    w, s, e, n = bounds4326
    z = pick_zoom(bounds4326, target_res_m)
    x0, y0 = lonlat_to_tile(w, n, z)
    x1, y1 = lonlat_to_tile(e, s, z)
    tx0, ty0 = max(0, int(x0) - pad_tiles), max(0, int(y0) - pad_tiles)
    tx1, ty1 = min(2**z - 1, int(x1) + pad_tiles), min(2**z - 1, int(y1) + pad_tiles)
    tiles = [(tx, ty) for ty in range(ty0, ty1 + 1) for tx in range(tx0, tx1 + 1)]
    mosaic = np.full(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256), np.nan, np.float32)
    with requests.Session() as session, ThreadPoolExecutor(8) as pool:
        arrays = pool.map(lambda t: _fetch(z, t[0], t[1], session), tiles)
        for (tx, ty), arr in zip(tiles, arrays, strict=True):
            mosaic[(ty - ty0) * 256 : (ty - ty0 + 1) * 256, (tx - tx0) * 256 : (tx - tx0 + 1) * 256] = arr
    world = 2 * math.pi * R_EARTH
    res = world / (256 * 2**z)
    left = tx0 * 256 * res - world / 2
    top = world / 2 - ty0 * 256 * res
    profile = {
        "crs": CRS.from_epsg(3857),
        "transform": Affine(res, 0, left, 0, -res, top),
        "nodata": None,
        "zoom": z,
        "tiles": len(tiles),
        "res_m": res,
    }
    log.info("terrarium z%d, %d tiles, %.1f m", z, len(tiles), res)
    return mosaic, profile
