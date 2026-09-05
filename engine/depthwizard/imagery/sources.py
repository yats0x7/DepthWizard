"""Find and fetch georeferenced imagery for a place, so a scene can start from a map pin.

Sources are chosen for what their licences allow (download and process, with attribution):
- OpenAerialMap: drone and aerial imagery, CC-BY 4.0, often centimetre resolution, patchy coverage.
- Sentinel-2 L2A via Earth Search (AWS): 10 m true-colour, global, every 5 days, open licence.
Google, Esri and Mapbox tiles are display-only under their terms and are deliberately not used.
"""

from __future__ import annotations

import logging
import math
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse

import numpy as np
import rasterio
import requests
from rasterio.enums import ColorInterp
from rasterio.warp import transform_bounds
from rasterio.windows import Window, from_bounds

log = logging.getLogger(__name__)
OAM_URL = "https://api.openaerialmap.org/meta"
STAC_URL = "https://earth-search.aws.element84.com/v1/search"
UA = {"User-Agent": "DepthWizard/1.0 (+https://github.com/yats0x7/DepthWizard)"}

SOURCES = {
    "oam": {
        "label": "OpenAerialMap",
        "note": "drone and aerial, cm to dm, patchy coverage",
        "license": "CC-BY 4.0",
    },
    "sentinel2": {
        "label": "Sentinel-2 L2A",
        "note": "10 m true colour, global, 5-day revisit",
        "license": "Copernicus open",
    },
}
SOURCE_HOSTS = {
    "oam": {"oin-hotosm-temp.s3.amazonaws.com", "oin-hotosm.s3.amazonaws.com"},
    "sentinel2": {"sentinel-cogs.s3.us-west-2.amazonaws.com"},
}

BBox = tuple[float, float, float, float]  # west, south, east, north (EPSG:4326)


@dataclass
class ImageryItem:
    source: str
    id: str
    title: str
    url: str
    bbox: list[float]
    date: str | None = None
    gsd_m: float | None = None
    cloud: float | None = None
    thumbnail: str | None = None
    provider: str | None = None
    license: str = ""
    attribution: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


def validate_item(item: ImageryItem) -> None:
    """Reject untrusted area-job URLs before GDAL opens them (prevents arbitrary SSRF)."""
    hosts = SOURCE_HOSTS.get(item.source)
    parsed = urlparse(item.url)
    if hosts is None:
        raise ValueError(f"unsupported imagery source: {item.source}")
    if parsed.scheme != "https" or parsed.hostname not in hosts:
        raise ValueError(f"{item.source} imagery URL must be HTTPS on an approved source host")


def bbox_around(lon: float, lat: float, size_km: float) -> BBox:
    """Square box of `size_km` on a side centred on a point."""
    half_lat = size_km / 2 / 110.574
    half_lon = size_km / 2 / (111.320 * max(math.cos(math.radians(lat)), 1e-6))
    return (lon - half_lon, lat - half_lat, lon + half_lon, lat + half_lat)


def bbox_area_km2(b: BBox) -> float:
    w, s, e, n = b
    lat = math.radians((s + n) / 2)
    return abs(e - w) * 111.320 * math.cos(lat) * abs(n - s) * 110.574


def _overlap(a: BBox, b) -> float:
    """Fraction of `a` covered by `b`."""
    w = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    h = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    area = max((a[2] - a[0]) * (a[3] - a[1]), 1e-12)
    return w * h / area


def search_oam(
    bbox: BBox, limit: int = 20, gsd_to: float | None = 2.0, session: requests.Session | None = None
) -> list[ImageryItem]:
    s = session or requests.Session()
    params = {
        "bbox": ",".join(f"{v:.6f}" for v in bbox),
        "limit": limit,
        "order_by": "acquisition_end",
        "sort": "desc",
    }
    if gsd_to:
        params["gsd_to"] = gsd_to
    r = s.get(OAM_URL, params=params, headers=UA, timeout=30)
    r.raise_for_status()
    items = []
    for x in r.json().get("results", []):
        url = x.get("uuid")
        if not url:
            continue
        items.append(
            ImageryItem(
                source="oam",
                id=str(x.get("_id")),
                title=x.get("title") or "OpenAerialMap image",
                url=url,
                bbox=[float(v) for v in x.get("bbox", bbox)],
                date=(x.get("acquisition_end") or "")[:10] or None,
                gsd_m=float(x["gsd"]) if x.get("gsd") else None,
                thumbnail=(x.get("properties") or {}).get("thumbnail"),
                provider=x.get("provider"),
                license=x.get("license") or "CC-BY 4.0",
                attribution=f"© {x.get('provider') or 'OIN contributors'}, OpenAerialMap, CC-BY 4.0",
            )
        )
    return items


def search_sentinel2(
    bbox: BBox,
    months: int = 18,
    max_cloud: float = 20.0,
    limit: int = 10,
    session: requests.Session | None = None,
) -> list[ImageryItem]:
    s = session or requests.Session()
    end = datetime.now(UTC)
    start = end - timedelta(days=30 * months)
    body = {
        "collections": ["sentinel-2-l2a"],
        "bbox": list(bbox),
        "datetime": f"{start:%Y-%m-%dT00:00:00Z}/{end:%Y-%m-%dT23:59:59Z}",
        "query": {"eo:cloud_cover": {"lt": max_cloud}},
        "limit": limit,
        "sortby": [{"field": "properties.eo:cloud_cover", "direction": "asc"}],
    }
    r = s.post(STAC_URL, json=body, headers=UA, timeout=45)
    r.raise_for_status()
    items = []
    for f in r.json().get("features", []):
        p = f.get("properties", {})
        a = f.get("assets", {})
        visual = a.get("visual") or a.get("TCI") or {}
        if not visual.get("href"):
            continue
        items.append(
            ImageryItem(
                source="sentinel2",
                id=f["id"],
                title=f"Sentinel-2 {p.get('platform', '').upper()} tile {p.get('mgrs:utm_zone', '')}{p.get('mgrs:latitude_band', '')}{p.get('mgrs:grid_square', '')}",
                url=visual["href"],
                bbox=[float(v) for v in f.get("bbox", bbox)],
                date=(p.get("datetime") or "")[:10] or None,
                gsd_m=10.0,
                cloud=float(p["eo:cloud_cover"]) if p.get("eo:cloud_cover") is not None else None,
                thumbnail=(a.get("thumbnail") or {}).get("href"),
                provider="ESA / Copernicus via Earth Search",
                license="Copernicus Sentinel data, free and open",
                attribution=f"Contains modified Copernicus Sentinel data {(p.get('datetime') or '')[:4]}",
            )
        )
    return items


def search(
    bbox: BBox,
    sources: tuple[str, ...] = ("oam", "sentinel2"),
    months: int = 18,
    max_cloud: float = 20.0,
    limit: int = 20,
) -> list[ImageryItem]:
    """All candidates for a box, sharpest first; each source failing on its own is logged, not fatal."""
    out: list[ImageryItem] = []
    with requests.Session() as s:
        if "oam" in sources:
            try:
                out += search_oam(bbox, limit=limit, session=s)
            except Exception as exc:  # noqa: BLE001
                log.warning("OpenAerialMap search failed: %s", exc)
        if "sentinel2" in sources:
            try:
                out += search_sentinel2(
                    bbox, months=months, max_cloud=max_cloud, limit=min(limit, 10), session=s
                )
            except Exception as exc:  # noqa: BLE001
                log.warning("Sentinel-2 search failed: %s", exc)
    for it in out:
        it.__dict__["coverage"] = round(_overlap(bbox, it.bbox), 3)
    out.sort(key=lambda i: (i.gsd_m or 1e9, -(i.__dict__.get("coverage", 0)), i.cloud or 0))
    return out


def fetch_area(
    item: ImageryItem, bbox: BBox, out_path: str | Path, max_px: int = 4096, min_px: int = 64
) -> dict:
    """Read only the requested box from the remote cloud-optimised GeoTIFF and write a local GeoTIFF."""
    out_path = Path(out_path)
    env = rasterio.Env(
        GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
        CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif,.tiff,.TIF",
        GDAL_HTTP_MULTIRANGE="YES",
    )
    with env, rasterio.open(item.url) as ds:
        wb = transform_bounds("EPSG:4326", ds.crs, *bbox, densify_pts=21)
        win = from_bounds(*wb, transform=ds.transform)
        full = Window(0, 0, ds.width, ds.height)
        win = win.intersection(full)
        if win.width < min_px or win.height < min_px:
            raise ValueError(
                "the image covers too little of the requested box; pick another image or a smaller box"
            )
        win = Window(int(win.col_off), int(win.row_off), int(round(win.width)), int(round(win.height)))
        f = max(1.0, max(win.width, win.height) / max_px)
        out_w, out_h = max(1, int(round(win.width / f))), max(1, int(round(win.height / f)))
        bands = [1, 2, 3] if ds.count >= 3 else [1]
        alpha = [i + 1 for i, ci in enumerate(ds.colorinterp) if ci == ColorInterp.alpha]
        data = ds.read(
            bands,
            window=win,
            out_shape=(len(bands), out_h, out_w),
            resampling=rasterio.enums.Resampling.average,
        )
        if len(bands) == 1:
            data = np.repeat(data, 3, axis=0)
        alpha_data = None
        if alpha:
            alpha_data = ds.read(
                alpha[0], window=win, out_shape=(out_h, out_w), resampling=rasterio.enums.Resampling.nearest
            )
        transform = ds.window_transform(win) * rasterio.Affine.scale(win.width / out_w, win.height / out_h)
        if data.dtype != np.uint8:
            lo, hi = np.percentile(data[data > 0], [1, 99]) if (data > 0).any() else (0, 1)
            data = np.clip((data.astype(np.float32) - lo) / max(hi - lo, 1e-6) * 255, 0, 255).astype(np.uint8)
        count = 4 if alpha_data is not None else 3
        profile = {
            "driver": "GTiff",
            "width": out_w,
            "height": out_h,
            "count": count,
            "dtype": "uint8",
            "crs": ds.crs,
            "transform": transform,
            "compress": "deflate",
            "tiled": True,
            "photometric": "RGB",
        }
        if alpha_data is not None:
            profile["alpha"] = "yes"
        else:
            profile["nodata"] = 0 if item.source == "sentinel2" else None
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with rasterio.open(out_path, "w", **profile) as dst:
            dst.write(data[:3], [1, 2, 3])
            if alpha_data is not None:
                dst.write(alpha_data, 4)
                dst.colorinterp = [ColorInterp.red, ColorInterp.green, ColorInterp.blue, ColorInterp.alpha]
            dst.update_tags(
                SOURCE=item.source, ITEM=item.id, ATTRIBUTION=item.attribution, DATE=item.date or ""
            )
        native = abs(ds.transform.a)
        if ds.crs.is_geographic:
            native *= 111_320 * math.cos(math.radians((bbox[1] + bbox[3]) / 2))
    return {
        "source": item.source,
        "id": item.id,
        "title": item.title,
        "date": item.date,
        "provider": item.provider,
        "license": item.license,
        "attribution": item.attribution,
        "url": item.url,
        "bbox": list(bbox),
        "gsd_m": round(native * f, 3),
        "native_gsd_m": round(native, 3),
        "shape": [out_h, out_w],
    }
