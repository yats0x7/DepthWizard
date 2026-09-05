"""Cached benchmark execution and Markdown report generation."""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
import requests

from ..calibrate.dem import read_raster_on_grid
from ..config import Settings
from ..eval.metrics import compare
from ..imagery.sources import ImageryItem, fetch_area
from ..pipeline import RunOptions, run, validate
from .manifest import BenchmarkScene, load_manifest


def _safe_json(value: Any) -> Any:
    if isinstance(value, float) and not np.isfinite(value):
        return None
    if isinstance(value, dict):
        return {str(k): _safe_json(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_safe_json(v) for v in value]
    return value


def _download(url: str, path: Path, params: dict[str, Any] | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".part")
    with requests.get(url, params=params, timeout=120, stream=True, headers={"User-Agent": "DepthWizard/1.0"}) as r:
        r.raise_for_status()
        with tmp.open("wb") as fh:
            for chunk in r.iter_content(1024 * 1024):
                if chunk:
                    fh.write(chunk)
    tmp.replace(path)


def _asset_path(asset, scene: BenchmarkScene, root: Path, role: str, manifest_dir: Path) -> Path:
    suffix = ".tif"
    if asset.path:
        suffix = Path(asset.path).suffix or suffix
    path = root / "inputs" / f"{scene.id}-{role}{suffix}"
    if path.exists():
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    if asset.kind == "local":
        source = (Path(asset.path) if Path(asset.path).is_absolute() else manifest_dir / asset.path).resolve()
        if not source.is_file():
            raise FileNotFoundError(f"{role} asset not found: {asset.path}")
        shutil.copy2(source, path)
    elif role == "imagery" and asset.kind == "imagery":
        item = ImageryItem(
            source=asset.source,
            id=f"benchmark-{scene.id}",
            title=scene.id,
            url=asset.url or "",
            bbox=list(scene.bbox),
            license=asset.license,
            attribution=asset.attribution,
        )
        fetch_area(item, scene.bbox, path)
    else:
        _download(asset.url or "", path, asset.params)
    return path


def _read_prediction_and_reference(out: Path, reference: Path) -> tuple[np.ndarray, np.ndarray]:
    meta = json.loads((out / "meta.json").read_text())
    name = meta["files"].get("dsm") or meta["files"].get("rdsm")
    with rasterio.open(out / name) as ds:
        pred = ds.read(1).astype(np.float32)
        if ds.nodata is not None:
            pred[pred == ds.nodata] = np.nan
        crs, transform = ds.crs, ds.transform
    if crs is None or transform.is_identity:
        crs, transform = None, None
    ref = read_raster_on_grid(reference, crs, transform, pred.shape)
    return pred, ref


def _class_metrics(pred: np.ndarray, ref: np.ndarray, landscape: str) -> dict[str, dict]:
    """Return the same metric fields for both raw and aligned class results."""
    mask = np.isfinite(pred) & np.isfinite(ref)
    if mask.sum() < 16:
        return {}
    result = compare(pred[mask], ref[mask])
    return {landscape: {"raw": result["raw"], "aligned": result["aligned"]}}


def run_scene(
    scene: BenchmarkScene,
    root: str | Path,
    cfg: Settings,
    options: RunOptions | None = None,
    manifest_dir: Path | None = None,
) -> dict:
    root = Path(root)
    scene_root = root / "runs" / scene.id
    result_path = scene_root / "benchmark.json"
    if result_path.exists():
        return json.loads(result_path.read_text())
    scene_root.mkdir(parents=True, exist_ok=True)
    imagery = _asset_path(scene.imagery, scene, root, "imagery", manifest_dir or Path.cwd())
    reference = _asset_path(scene.reference, scene, root, "reference", manifest_dir or Path.cwd())
    run(imagery, scene_root, cfg, options or RunOptions())
    metrics = validate(scene_root, reference)
    pred, ref = _read_prediction_and_reference(scene_root, reference)
    metrics["per_class"] = _class_metrics(pred, ref, scene.landscape)
    result = {
        "scene": {
            "id": scene.id,
            "landscape": scene.landscape,
            "bbox": list(scene.bbox),
            "expected_gsd_m": scene.expected_gsd_m,
            "imagery": {
                "source": scene.imagery.source,
                "url": scene.imagery.url,
                "license": scene.imagery.license,
                "attribution": scene.imagery.attribution,
            },
            "reference": {
                "source": scene.reference.source,
                "url": scene.reference.url,
                "license": scene.reference.license,
            },
            "notes": scene.notes,
        },
        "metrics": _safe_json(metrics),
        "output": str(scene_root),
    }
    result_path.write_text(json.dumps(result, indent=2, allow_nan=False))
    return result


def benchmark_run(
    manifest: str | Path,
    root: str | Path,
    cfg: Settings,
    options: RunOptions | None = None,
    scene_id: str | None = None,
) -> list[dict]:
    manifest_obj = load_manifest(manifest)
    root = Path(root)
    selected = [s for s in manifest_obj.scenes if scene_id is None or s.id == scene_id]
    if not selected:
        raise ValueError(f"scene not found: {scene_id}")
    results = []
    for scene in selected:
        results.append(run_scene(scene, root, cfg, options, manifest_obj.path.parent))
    return results


def benchmark_report(root: str | Path, output: str | Path) -> Path:
    root = Path(root)
    rows = [json.loads(p.read_text()) for p in sorted((root / "runs").glob("*/benchmark.json"))]
    if not rows:
        raise ValueError(f"no benchmark results under {root / 'runs'}")
    by_class: dict[str, list[dict]] = {}
    for row in rows:
        by_class.setdefault(row["scene"]["landscape"], []).append(row)
    lines = [
        "# DepthWizard benchmark",
        "",
        "This report is generated from the cached scene results with `depthwizard benchmark report`. "
        "Each prediction is calibrated with the normal pipeline; the reference raster is an "
        "independent height product and is never the DEM consumed by calibration.",
        "",
        f"Scenes: **{len(rows)}** | Classes: **{', '.join(sorted(by_class))}**",
        "",
        "## Per-scene results",
        "",
        "| Scene | Class | Reference | Raw RMSE | Raw MAE | Raw bias | Raw NMAD | Raw r | Raw ≤1 m | Raw ≤3 m | Aligned RMSE | Aligned MAE | Aligned bias | Aligned NMAD | Aligned r | Aligned ≤1 m | Aligned ≤3 m |",
        "|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for row in rows:
        m = row["metrics"]
        raw, aligned = m.get("raw", {}), m.get("aligned", {})
        s = row["scene"]
        def f(block, name, pct=False):
            value = block.get(name)
            return "—" if value is None else (f"{value * 100:.1f}%" if pct else f"{value:.3f}")
        lines.append(
            f"| {s['id']} | {s['landscape']} | {s['reference']['source']} | {f(raw, 'rmse')} | {f(raw, 'mae')} | {f(raw, 'bias')} | {f(raw, 'nmad')} | {f(raw, 'pearson_r')} | {f(raw, 'within_1m', True)} | {f(raw, 'within_3m', True)} | {f(aligned, 'rmse')} | {f(aligned, 'mae')} | {f(aligned, 'bias')} | {f(aligned, 'nmad')} | {f(aligned, 'pearson_r')} | {f(aligned, 'within_1m', True)} | {f(aligned, 'within_3m', True)} |"
        )
    lines += [
        "",
        "## Scene provenance",
        "",
        "The URLs below are the manifest's declared sources. They are included here so the result "
        "table remains auditable without treating downloaded inputs as source files.",
        "",
        "| Scene | Class | Imagery source | Imagery licence | Reference source | Reference licence | Expected GSD | Error map |",
        "|---|---|---|---|---|---|---:|---|",
    ]
    for row in rows:
        s = row["scene"]
        error_map = row["metrics"].get("error_map", "—")
        lines.append(
            f"| {s['id']} | {s['landscape']} | {s['imagery']['source']} | {s['imagery']['license']} | "
            f"{s['reference']['source']} | {s['reference']['license']} | "
            f"{s.get('expected_gsd_m') or '—'} m | `{error_map}` |"
        )
    lines += [
        "",
        "## Per-class weighted results",
        "",
        "| Class | Scenes | Raw RMSE | Raw MAE | Raw bias | Raw NMAD | Raw r | Raw ≤1 m | Raw ≤3 m | Aligned RMSE | Aligned MAE | Aligned bias | Aligned NMAD | Aligned r | Aligned ≤1 m | Aligned ≤3 m |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for name, class_rows in sorted(by_class.items()):
        raw = _weighted_blocks(class_rows, name, "raw")
        aligned = _weighted_blocks(class_rows, name, "aligned")
        def f(block, field, pct=False):
            value = block.get(field)
            return "—" if value is None else (f"{value * 100:.1f}%" if pct else f"{value:.3f}")
        lines.append(f"| {name} | {len(class_rows)} | {f(raw, 'rmse')} | {f(raw, 'mae')} | {f(raw, 'bias')} | {f(raw, 'nmad')} | {f(raw, 'pearson_r')} | {f(raw, 'within_1m', True)} | {f(raw, 'within_3m', True)} | {f(aligned, 'rmse')} | {f(aligned, 'mae')} | {f(aligned, 'bias')} | {f(aligned, 'nmad')} | {f(aligned, 'pearson_r')} | {f(aligned, 'within_1m', True)} | {f(aligned, 'within_3m', True)} |")
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("\n".join(lines) + "\n")
    return output


def _weighted_blocks(rows: list[dict], class_name: str, block: str) -> dict:
    values = []
    weights = []
    for row in rows:
        metrics = row["metrics"].get("per_class", {}).get(class_name, {}).get(block, {})
        if metrics:
            values.append(metrics)
            weights.append(metrics.get("n", 1))
    if not values:
        return {}
    fields = ("rmse", "mae", "bias", "median_error", "nmad", "pearson_r", "abs_error_p90", "within_1m", "within_3m")
    return {field: float(np.average([v[field] for v in values if field in v], weights=[w for v, w in zip(values, weights, strict=True) if field in v])) for field in fields if any(field in v for v in values)}
