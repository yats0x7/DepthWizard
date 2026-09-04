"""End-to-end pipeline: image -> relative depth -> (metric) DSM -> outputs."""
from __future__ import annotations

import json
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.transform import Affine

from .calibrate import dem as demmod
from .calibrate.fit import GCP, Calibration, apply_gcps, calibrate, relative_height
from .config import Settings
from .config import settings as default_settings
from .depth.backbone import DepthBackbone, get_backbone
from .eval.metrics import compare, error_map_png
from .io.raster import (
    RasterInput,
    load_image,
    write_geotiff,
    write_png16,
    write_preview,
    write_texture,
)
from .mesh.glb import heightfield_to_glb

log = logging.getLogger(__name__)
Progress = Callable[[str, float], None]

OUTPUT_FILES = ("dsm.tif", "rdsm.tif", "rel.tif", "dem.tif", "heightmap.png", "preview.png",
                "texture.jpg", "mesh.glb", "meta.json", "metrics.json", "error_map.png",
                "reference.tif")


@dataclass
class RunOptions:
    calibration: str | None = None  # override settings.calibration
    dem_source: str | None = None
    gcps: list[GCP] = field(default_factory=list)
    prior_p95_m: float | None = None


def _noop(stage: str, frac: float) -> None:  # pragma: no cover
    pass


def _stats(arr: np.ndarray) -> dict:
    v = arr[np.isfinite(arr)]
    if v.size == 0:
        return {"min": None, "max": None, "mean": None, "p2": None, "p98": None}
    p2, p98 = np.percentile(v, [2, 98])
    return {"min": float(v.min()), "max": float(v.max()), "mean": float(v.mean()),
            "p2": float(p2), "p98": float(p98)}


def _view_scale(src_shape: tuple[int, int], georeferenced: bool) -> float:
    """Vertical scale for relative outputs so terrain looks plausible in the viewer."""
    return 1.0 if georeferenced else 0.12 * max(src_shape)


def _write_outputs(out: Path, dsm: np.ndarray, src: RasterInput, cal: Calibration, meta: dict,
                   cfg: Settings) -> dict:
    files = {}
    geo = src.georeferenced
    if geo:
        files["dsm"] = write_geotiff(out / "dsm.tif", dsm, src.crs, src.transform).name
    else:
        files["rdsm"] = write_geotiff(out / "rdsm.tif", dsm, None, None).name
    _, lo, hi = write_png16(out / "heightmap.png", dsm)
    files["heightmap"] = "heightmap.png"
    files["preview"] = write_preview(out / "preview.png", dsm).name
    px = src.pixel_size_m or (1.0, 1.0)
    vs = _view_scale(src.shape, geo)
    mesh_info = heightfield_to_glb(dsm * vs, src.rgb, out / "mesh.glb", pixel_size=px,
                                   max_side=cfg.mesh_max_side)
    files["mesh"] = "mesh.glb"
    meta.update({
        "units": "m" if geo else "relative",
        "calibration": cal.to_dict(),
        "stats": _stats(dsm),
        "heightmap": {"min": lo, "max": hi, "encoding": "uint16 linear"},
        "view": {"vertical_scale": vs, "pixel_size": list(px)},
        "mesh": mesh_info,
        "files": files,
    })
    (out / "meta.json").write_text(json.dumps(meta, indent=2))
    return meta


def run(input_path: str | Path, out_dir: str | Path, cfg: Settings = default_settings,
        backbone: DepthBackbone | None = None, options: RunOptions | None = None,
        progress: Progress = _noop) -> dict:
    """Run the full pipeline and return the meta dict written to out_dir/meta.json."""
    t0 = time.time()
    opts = options or RunOptions()
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    progress("loading", 0.0)
    src = load_image(input_path, max_dim=cfg.max_dim)
    files = {"texture": write_texture(out / "texture.jpg", src.rgb, cfg.texture_max_side).name}
    meta = {
        "input": {
            "name": Path(input_path).name, "shape": list(src.shape), "downscale": src.downscale,
            "georeferenced": src.georeferenced,
            "crs": src.crs.to_string() if src.crs else None,
            "epsg": src.crs.to_epsg() if src.crs else None,
            "transform": list(src.transform)[:6] if src.transform else None,
            "bounds": list(src.bounds) if src.bounds else None,
            "bounds4326": list(src.bounds4326) if src.bounds4326 else None,
            "pixel_size_m": list(src.pixel_size_m) if src.pixel_size_m else None,
        },
        "files": files,
    }

    progress("depth", 0.0)
    bb = backbone or get_backbone(cfg)
    t1 = time.time()
    disp = bb.predict(src.rgb, progress=lambda f: progress("depth", f))
    rel = relative_height(disp, src.nodata_mask)
    write_geotiff(out / "rel.tif", rel, src.crs, src.transform)
    meta["model"] = {"name": getattr(bb, "name", type(bb).__name__),
                     "device": getattr(bb, "device", "n/a"), "seconds": round(time.time() - t1, 2)}

    mode = opts.calibration or cfg.calibration
    prior = opts.prior_p95_m or cfg.prior_p95_height_m
    if src.georeferenced:
        progress("dem", 0.0)
        dem_src = opts.dem_source or cfg.dem_source
        try:
            dem, dem_meta = demmod.fetch_dem_on_grid(src.bounds4326, src.crs, src.transform,
                                                     src.shape, source=dem_src)
            write_geotiff(out / "dem.tif", dem, src.crs, src.transform)
        except Exception as exc:  # network / coverage failure: degrade gracefully
            log.warning("DEM fetch failed (%s); falling back to prior calibration", exc)
            dem, dem_meta = None, {"source": dem_src, "error": str(exc)}
        progress("calibrate", 0.0)
        dsm, cal = calibrate(rel, dem, src.pixel_size_m, mode=mode, prior_p95_m=prior,
                             min_r2=cfg.min_fit_r2, min_relief_m=cfg.min_relief_m)
        cal.dem = dem_meta
    else:
        dsm, cal = rel.copy(), Calibration(mode="relative", n=int(np.isfinite(rel).sum()),
                                           notes=["no georeferencing: relative DSM in [0, 1]"])
    if opts.gcps:
        dsm, cal = apply_gcps(dsm, opts.gcps, cal)
        if not src.georeferenced:
            cal.notes.append("metric heights from GCPs on a non-georeferenced image")

    progress("export", 0.0)
    meta = _write_outputs(out, dsm, src, cal, meta, cfg)
    meta["seconds"] = round(time.time() - t0, 2)
    (out / "meta.json").write_text(json.dumps(meta, indent=2))
    progress("done", 1.0)
    return meta


def _load_src_from_job(out: Path) -> tuple[RasterInput, dict]:
    meta = json.loads((out / "meta.json").read_text())
    import cv2

    rgb = cv2.cvtColor(cv2.imread(str(out / "texture.jpg")), cv2.COLOR_BGR2RGB)
    h, w = meta["input"]["shape"]
    if rgb.shape[:2] != (h, w):
        rgb = cv2.resize(rgb, (w, h), interpolation=cv2.INTER_LINEAR)
    crs = CRS.from_string(meta["input"]["crs"]) if meta["input"]["crs"] else None
    tr = Affine(*meta["input"]["transform"]) if meta["input"]["transform"] else None
    src = RasterInput(rgb=rgb, path=out / meta["input"]["name"], crs=crs, transform=tr)
    return src, meta


def recalibrate(out_dir: str | Path, mode: str | None = None, gcps: list[GCP] | None = None,
                prior_p95_m: float | None = None, cfg: Settings = default_settings) -> dict:
    """Re-run calibration on a finished job using stored rel.tif / dem.tif."""
    out = Path(out_dir)
    src, meta = _load_src_from_job(out)
    with rasterio.open(out / "rel.tif") as ds:
        rel = ds.read(1).astype(np.float32)
        rel[rel == ds.nodata] = np.nan
    dem = None
    if (out / "dem.tif").exists():
        with rasterio.open(out / "dem.tif") as ds:
            dem = ds.read(1).astype(np.float32)
            dem[dem == ds.nodata] = np.nan
    prior = prior_p95_m or cfg.prior_p95_height_m
    if src.georeferenced:
        dsm, cal = calibrate(rel, dem, src.pixel_size_m, mode=mode or cfg.calibration,
                             prior_p95_m=prior, min_r2=cfg.min_fit_r2,
                             min_relief_m=cfg.min_relief_m)
        cal.dem = meta.get("calibration", {}).get("dem", {})
    else:
        dsm, cal = rel.copy(), Calibration(mode="relative", n=int(np.isfinite(rel).sum()))
    if gcps:
        dsm, cal = apply_gcps(dsm, gcps, cal)
    meta = _write_outputs(out, dsm, src, cal, meta, cfg)
    meta.pop("metrics", None)
    (out / "meta.json").write_text(json.dumps(meta, indent=2))
    return meta


def validate(out_dir: str | Path, reference_path: str | Path,
             classes: dict[str, np.ndarray] | None = None) -> dict:
    """Compare the job's DSM with a reference raster; writes metrics.json and error_map.png."""
    out = Path(out_dir)
    meta = json.loads((out / "meta.json").read_text())
    name = meta["files"].get("dsm") or meta["files"].get("rdsm")
    with rasterio.open(out / name) as ds:
        pred = ds.read(1).astype(np.float32)
        pred[pred == ds.nodata] = np.nan
        crs, tr = ds.crs, ds.transform
    if crs is None or tr.is_identity:
        crs, tr = None, None
    ref = demmod.read_raster_on_grid(reference_path, crs, tr, pred.shape)
    metrics = compare(pred, ref, classes=classes)
    metrics["reference"] = Path(reference_path).name
    metrics["units"] = meta.get("units")
    if "error" not in metrics:
        error_map_png(pred if meta.get("units") == "m" else
                      metrics["aligned"]["scale"] * pred + metrics["aligned"]["offset"],
                      ref, out / "error_map.png")
        metrics["error_map"] = "error_map.png"
    (out / "metrics.json").write_text(json.dumps(metrics, indent=2))
    meta["metrics"] = metrics
    (out / "meta.json").write_text(json.dumps(meta, indent=2))
    return metrics
