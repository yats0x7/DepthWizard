"""Manifest schema for benchmark scenes.

The manifest deliberately stores URLs and provenance, not downloaded imagery or height rasters.
Those inputs can be large and are kept in the ignored benchmark data directory.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

LANDSCAPE_CLASSES = ("urban", "sparse", "hilly", "forested")


@dataclass(frozen=True)
class BenchmarkAsset:
    kind: str
    source: str
    url: str | None = None
    license: str = ""
    attribution: str = ""
    path: str | None = None
    params: dict[str, Any] | None = None


@dataclass(frozen=True)
class BenchmarkScene:
    id: str
    landscape: str
    bbox: tuple[float, float, float, float]
    imagery: BenchmarkAsset
    reference: BenchmarkAsset
    expected_gsd_m: float | None = None
    notes: str = ""


@dataclass(frozen=True)
class BenchmarkManifest:
    version: int
    scenes: tuple[BenchmarkScene, ...]
    path: Path


def _asset(raw: dict[str, Any], label: str) -> BenchmarkAsset:
    if not isinstance(raw, dict):
        raise ValueError(f"{label} must be an object")
    kind = str(raw.get("kind", "url"))
    source = str(raw.get("source", ""))
    if not source:
        raise ValueError(f"{label}.source is required")
    if kind not in {"local", "url", "imagery"}:
        raise ValueError(f"{label}.kind must be local, url, or imagery")
    if kind == "local" and not raw.get("path"):
        raise ValueError(f"{label}.path is required for local assets")
    if kind != "local" and not raw.get("url"):
        raise ValueError(f"{label}.url is required for remote assets")
    return BenchmarkAsset(
        kind=kind,
        source=source,
        url=str(raw["url"]) if raw.get("url") else None,
        license=str(raw.get("license", "")),
        attribution=str(raw.get("attribution", "")),
        path=str(raw["path"]) if raw.get("path") else None,
        params=dict(raw.get("params", {})) if raw.get("params") else None,
    )


def load_manifest(path: str | Path) -> BenchmarkManifest:
    path = Path(path).resolve()
    raw = json.loads(path.read_text())
    if not isinstance(raw, dict) or not isinstance(raw.get("scenes"), list):
        raise ValueError("manifest must be an object with a scenes list")
    scenes: list[BenchmarkScene] = []
    seen: set[str] = set()
    for i, item in enumerate(raw["scenes"]):
        if not isinstance(item, dict):
            raise ValueError(f"scenes[{i}] must be an object")
        scene_id = str(item.get("id", ""))
        if not scene_id or scene_id in seen or "/" in scene_id or "\\" in scene_id:
            raise ValueError(f"scenes[{i}].id must be unique and path-safe")
        seen.add(scene_id)
        landscape = str(item.get("landscape", ""))
        if landscape not in LANDSCAPE_CLASSES:
            raise ValueError(
                f"scenes[{i}].landscape must be one of {', '.join(LANDSCAPE_CLASSES)}"
            )
        bbox = item.get("bbox")
        if not isinstance(bbox, list | tuple) or len(bbox) != 4:
            raise ValueError(f"scenes[{i}].bbox must be [west, south, east, north]")
        bbox_f = tuple(float(v) for v in bbox)
        if not (bbox_f[0] < bbox_f[2] and bbox_f[1] < bbox_f[3]):
            raise ValueError(f"scenes[{i}].bbox must have positive area")
        scenes.append(
            BenchmarkScene(
                id=scene_id,
                landscape=landscape,
                bbox=bbox_f,
                imagery=_asset(item.get("imagery", {}), f"scenes[{i}].imagery"),
                reference=_asset(item.get("reference", {}), f"scenes[{i}].reference"),
                expected_gsd_m=(float(item["expected_gsd_m"]) if item.get("expected_gsd_m") else None),
                notes=str(item.get("notes", "")),
            )
        )
    if not scenes:
        raise ValueError("manifest must contain at least one scene")
    return BenchmarkManifest(version=int(raw.get("version", 1)), scenes=tuple(scenes), path=path)
