"""End-to-end pipeline: image -> relative depth -> (metric) DSM -> outputs on disk."""

from __future__ import annotations

import json
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.transform import Affine

from . import __version__
from .analysis.terrain import surface_stats
from .calibrate import dem as demmod
from .calibrate.fit import GCP, Calibration, apply_gcps, calibrate, relative_height
from .calibrate.priors import detect_flat_surfaces
from .config import DEM_SOURCES, Settings
from .config import settings as default_settings
from .depth.backbone import get_backbone
from .eval.metrics import compare, error_map_png
from .mesh.glb import heightfield_to_glb
from .raster.io import RasterInput, load_image, write_geotiff, write_png16, write_preview, write_texture

log = logging.getLogger(__name__)
Progress = Callable[[str, float, str], None]
Cancel = Callable[[], bool]

OUTPUT_FILES = (
    "dsm.tif",
    "rdsm.tif",
    "rel.tif",
    "dem.tif",
    "heightmap.png",
    "preview.png",
    "texture.jpg",
    "mesh.glb",
    "meta.json",
    "metrics.json",
    "error_map.png",
    "reference.tif",
    "classes.tif",
)
STAGES = ("load", "infer", "dem", "calibrate", "analyse", "export", "done")


class JobCancelled(RuntimeError):
    pass


@dataclass
class RunOptions:
    model: str | None = None  # preset (small | base | large) or HF id
    calibration: str | None = None  # hybrid | affine | prior | semantic
    dem_source: str | None = None
    gcps: list[GCP] = field(default_factory=list)
    prior_p95_m: float | None = None
    semantic_prior: bool = False


def _noop(stage: str, frac: float, message: str = "") -> None:  # pragma: no cover
    pass


def _never() -> bool:  # pragma: no cover
    return False


def _view_scale(shape: tuple[int, int], georeferenced: bool) -> float:
    """Display metres per unit of relative height for non-metric outputs."""
    return 1.0 if georeferenced else 0.12 * max(shape)


def _write_outputs(
    out: Path, dsm: np.ndarray, src: RasterInput, cal: Calibration, meta: dict, cfg: Settings
) -> dict:
    metric = cal.mode in ("hybrid", "affine", "prior", "semantic", "gcp")
    units = "m" if metric else "relative"
    files = dict(meta.get("files", {}))
    if src.georeferenced:
        files["dsm"] = "dsm.tif"
        write_geotiff(
            out / "dsm.tif", dsm, src.crs, src.transform, tags={"UNITS": units, "CALIBRATION": cal.mode}
        )
        files.pop("rdsm", None)
        (out / "rdsm.tif").unlink(missing_ok=True)
    else:
        name = "dsm.tif" if metric else "rdsm.tif"
        other = "rdsm.tif" if metric else "dsm.tif"
        files["dsm" if metric else "rdsm"] = name
        files.pop("rdsm" if metric else "dsm", None)
        (out / other).unlink(missing_ok=True)
        write_geotiff(out / name, dsm, None, None, tags={"UNITS": units, "CALIBRATION": cal.mode})
    _, lo, hi = write_png16(out / "heightmap.png", dsm)
    files["heightmap"] = "heightmap.png"
    write_preview(out / "preview.png", dsm, src.pixel_size_m)
    files["preview"] = "preview.png"
    px = src.pixel_size_m or (1.0, 1.0)
    mesh_info = heightfield_to_glb(
        dsm if metric else dsm * _view_scale(src.shape, False),
        src.rgb,
        out / "mesh.glb",
        pixel_size=px,
        max_side=cfg.mesh_max_side,
        texture_max=cfg.texture_max_side,
    )
    files["mesh"] = "mesh.glb"
    meta.update(
        {
            "units": units,
            "calibration": cal.to_dict(),
            "heightmap": {"min": lo, "max": hi, "encoding": "uint16 linear"},
            "stats": surface_stats(dsm, src.pixel_size_m),
            "mesh": mesh_info,
            "view": {
                "vertical_scale": _view_scale(src.shape, metric or src.georeferenced),
                "pixel_size": list(px),
                "up": "Y",
                "east": "+X",
                "south": "+Z",
            },
            "files": files,
        }
    )
    return meta


def run(
    input_path: str | Path,
    out_dir: str | Path,
    cfg: Settings = default_settings,
    options: RunOptions | None = None,
    progress: Progress = _noop,
    cancel: Cancel = _never,
    source_metadata: dict | None = None,
) -> dict:
    options = options or RunOptions()
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    timings: dict[str, float] = {}

    def check() -> None:
        if cancel():
            raise JobCancelled("cancelled")

    progress("load", 0.0, "reading image")
    src = load_image(input_path, cfg.max_dim)
    timings["load"] = round(time.time() - t0, 2)
    h, w = src.shape
    meta: dict = {
        "version": __version__,
        "input": {
            "name": Path(input_path).name,
            "shape": [h, w],
            "source_shape": list(src.source_shape or (h, w)),
            "downscale": src.downscale,
            "georeferenced": src.georeferenced,
            "crs": src.crs.to_string() if src.crs else None,
            "epsg": src.crs.to_epsg() if src.crs else None,
            "transform": list(src.transform)[:6] if src.transform else None,
            "bounds": list(src.bounds) if src.bounds else None,
            "bounds4326": list(src.bounds4326) if src.bounds4326 else None,
            "centre4326": list(src.centre4326) if src.centre4326 else None,
            "pixel_size_m": list(src.pixel_size_m) if src.pixel_size_m else None,
            "nodata_fraction": float(src.nodata_mask.mean()) if src.nodata_mask is not None else 0.0,
            "warnings": list(src.warnings),
        },
    }
    if source_metadata:
        meta["imagery"] = source_metadata
    write_texture(out / "texture.jpg", src.rgb, cfg.texture_max_side)
    meta["files"] = {"texture": "texture.jpg"}
    check()

    progress("infer", 0.0, "loading depth model")
    t = time.time()
    backbone = get_backbone(cfg, options.model)
    meta["model"] = {
        "id": backbone.name,
        "preset": options.model or cfg.model,
        "device": backbone.device,
        "tta": cfg.tta,
        "infer_res": cfg.infer_res,
        "tile": cfg.tile,
    }
    disparity = backbone.predict(
        src.rgb, progress=lambda f: (check(), progress("infer", f, "predicting depth"))[1]
    )
    rel = relative_height(disparity, src.nodata_mask)
    timings["infer"] = round(time.time() - t, 2)
    write_geotiff(out / "rel.tif", rel, src.crs, src.transform, tags={"UNITS": "relative"})
    meta["files"]["rel"] = "rel.tif"
    check()

    dem = None
    dem_meta: dict = {}
    if src.georeferenced:
        source = options.dem_source or cfg.dem_source
        progress("dem", 0.0, f"fetching {DEM_SOURCES.get(source, {}).get('label', source)}")
        t = time.time()
        try:
            dem, dem_meta = demmod.fetch_dem_on_grid(
                src.bounds4326, src.crs, src.transform, src.shape, source
            )
            write_geotiff(out / "dem.tif", dem, src.crs, src.transform, tags={"SOURCE": source})
            meta["files"]["dem"] = "dem.tif"
        except Exception as exc:  # network / coverage failures degrade to the prior
            log.warning("DEM fetch failed: %s", exc)
            dem_meta = {"source": source, "error": str(exc)}
        timings["dem"] = round(time.time() - t, 2)
    check()

    progress("calibrate", 0.0, "fitting heights")
    t = time.time()
    prior = options.prior_p95_m or cfg.prior_p95_height_m
    if src.georeferenced:
        calibration_mode = "semantic" if options.semantic_prior else (options.calibration or cfg.calibration)
        dsm, cal = calibrate(
            rel,
            dem,
            src.pixel_size_m,
            mode=calibration_mode,
            prior_p95_m=prior,
            min_r2=cfg.min_fit_r2,
            min_relief_m=cfg.min_relief_m,
            dem_res_m=dem_meta.get("native_res_m", 30.0),
            flat_mask=detect_flat_surfaces(src.rgb) if calibration_mode == "semantic" else None,
        )
        cal.dem = dem_meta
    else:
        dsm, cal = rel.copy(), Calibration(mode="relative", n=int(np.isfinite(rel).sum()))
        cal.notes.append("no georeferencing: relative DSM in [0, 1]; add GCPs for metric heights")
    if options.gcps:
        dsm, cal = apply_gcps(dsm, options.gcps, cal)
        if not src.georeferenced:
            cal.notes.append("metric heights from GCPs on a non-georeferenced image")
    timings["calibrate"] = round(time.time() - t, 2)
    check()

    progress("analyse", 0.0, "terrain statistics")
    progress("export", 0.0, "writing GeoTIFF, heightmap, preview and GLB")
    t = time.time()
    meta = _write_outputs(out, dsm, src, cal, meta, cfg)
    timings["export"] = round(time.time() - t, 2)
    timings["total"] = round(time.time() - t0, 2)
    meta["timings"] = timings
    meta["seconds"] = timings["total"]
    (out / "meta.json").write_text(json.dumps(meta, indent=2))
    progress("done", 1.0, "finished")
    return meta


def _load_src_from_job(out: Path) -> tuple[RasterInput, dict]:
    meta = json.loads((out / "meta.json").read_text())
    rgb = cv2.cvtColor(cv2.imread(str(out / "texture.jpg")), cv2.COLOR_BGR2RGB)
    h, w = meta["input"]["shape"]
    if rgb.shape[:2] != (h, w):
        rgb = cv2.resize(rgb, (w, h), interpolation=cv2.INTER_LINEAR)
    crs = CRS.from_string(meta["input"]["crs"]) if meta["input"]["crs"] else None
    tr = Affine(*meta["input"]["transform"]) if meta["input"]["transform"] else None
    src = RasterInput(rgb=rgb, path=out / meta["input"]["name"], crs=crs, transform=tr)
    return src, meta


def _read(path: Path) -> np.ndarray:
    with rasterio.open(path) as ds:
        arr = ds.read(1).astype(np.float32)
        if ds.nodata is not None:
            arr[arr == ds.nodata] = np.nan
    return arr


def recalibrate(
    out_dir: str | Path,
    mode: str | None = None,
    gcps: list[GCP] | None = None,
    prior_p95_m: float | None = None,
    cfg: Settings = default_settings,
) -> dict:
    """Re-run calibration on a finished job from the stored rel.tif / dem.tif (no model rerun)."""
    out = Path(out_dir)
    src, meta = _load_src_from_job(out)
    rel = _read(out / "rel.tif")
    dem = _read(out / "dem.tif") if (out / "dem.tif").exists() else None
    prior = prior_p95_m or cfg.prior_p95_height_m
    dem_meta = meta.get("calibration", {}).get("dem", {})
    if src.georeferenced:
        calibration_mode = mode or cfg.calibration
        dsm, cal = calibrate(
            rel,
            dem,
            src.pixel_size_m,
            mode=calibration_mode,
            prior_p95_m=prior,
            min_r2=cfg.min_fit_r2,
            min_relief_m=cfg.min_relief_m,
            dem_res_m=dem_meta.get("native_res_m", 30.0),
            flat_mask=detect_flat_surfaces(src.rgb) if calibration_mode == "semantic" else None,
        )
        cal.dem = dem_meta
    else:
        dsm, cal = rel.copy(), Calibration(mode="relative", n=int(np.isfinite(rel).sum()))
        cal.notes.append("no georeferencing: relative DSM in [0, 1]; add GCPs for metric heights")
    if gcps:
        dsm, cal = apply_gcps(dsm, gcps, cal)
    meta = _write_outputs(out, dsm, src, cal, meta, cfg)
    meta.pop("metrics", None)
    (out / "metrics.json").unlink(missing_ok=True)
    meta["recalibrated_at"] = time.time()
    (out / "meta.json").write_text(json.dumps(meta, indent=2))
    return meta


def validate(
    out_dir: str | Path,
    reference_path: str | Path,
    classes: dict[str, np.ndarray] | None = None,
    classes_path: str | Path | None = None,
    class_names: dict[str, str] | None = None,
) -> dict:
    """Compare the job's DSM with a reference raster; writes metrics.json and error_map.png.

    `classes_path` is an optional raster of integer landscape codes on any grid; `class_names` maps
    codes (as strings) to names for the per-class breakdown, e.g. {"1": "urban", "2": "forest"}.
    """
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
    if classes_path is not None:
        codes = demmod.read_raster_on_grid(classes_path, crs, tr, pred.shape, nearest=True)
        classes = dict(classes or {})
        present = [int(c) for c in np.unique(codes[np.isfinite(codes)])]
        for code in present:
            label = (class_names or {}).get(str(code), f"class {code}")
            classes[label] = codes == code
    metrics = compare(pred, ref, classes=classes)
    metrics["reference"] = Path(reference_path).name
    metrics["units"] = meta.get("units")
    if "error" not in metrics:
        shown = (
            pred
            if meta.get("units") == "m"
            else metrics["aligned"]["scale"] * pred + metrics["aligned"]["offset"]
        )
        _, clip = error_map_png(shown, ref, out / "error_map.png")
        metrics["error_map"] = "error_map.png"
        metrics["error_map_clip_m"] = clip
    (out / "metrics.json").write_text(json.dumps(metrics, indent=2))
    meta["metrics"] = metrics
    meta["files"]["metrics"] = "metrics.json"
    (out / "meta.json").write_text(json.dumps(meta, indent=2))
    return metrics
