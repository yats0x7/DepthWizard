"""FastAPI application: jobs, files, validation, recalibration, live progress, static studio."""

from __future__ import annotations

import asyncio
import json
import logging
import math
import queue
import shutil
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sse_starlette.sse import EventSourceResponse

from .. import __version__
from ..config import DEM_SOURCES, MODEL_PRESETS, Settings
from ..config import settings as default_settings
from ..imagery.sources import ImageryItem, bbox_area_km2, canonicalize_item
from ..imagery.sources import search as search_imagery
from ..pipeline import OUTPUT_FILES, RunOptions, recalibrate, validate
from .jobs import JobManager, parse_gcps
from .schemas import AreaJobRequest, ImagerySearchRequest, PathRequest, RecalibrateRequest, SampleRequest

log = logging.getLogger(__name__)
ALLOWED = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff", ".geotiff", ".jp2", ".img"}
GEO_EXT = {".tif", ".tiff", ".geotiff", ".jp2", ".img"}
REFERENCE_ALLOWED = {".tif", ".tiff", ".geotiff", ".img", ".png"}
CALIBRATIONS = ("hybrid", "affine", "prior", "semantic")
MAX_UPLOAD = 1024 * 1024 * 1024  # 1 GB
MAX_IMAGERY_AREA_KM2 = 100.0
MAX_AREA_JOBS = 2
TERMINAL = ("done", "failed", "cancelled")


def _default_static() -> Path | None:
    here = Path(__file__).resolve()
    for candidate in (here.parents[2] / "static", here.parents[3] / "apps" / "studio" / "dist"):
        if (candidate / "index.html").exists():
            return candidate
    return None


def create_app(cfg: Settings = default_settings) -> FastAPI:
    app = FastAPI(title="DepthWizard", version=__version__)
    app.add_middleware(
        CORSMiddleware, allow_origins=list(cfg.cors_origins), allow_methods=["*"], allow_headers=["*"]
    )
    jobs = JobManager(cfg)
    app.state.jobs = jobs
    app.state.cfg = cfg

    async def save_upload(file: UploadFile, allowed: set[str]) -> Path:
        ext = Path(file.filename or "").suffix.lower()
        if ext not in allowed:
            raise HTTPException(415, f"unsupported file type {ext or '(none)'}; allowed: {sorted(allowed)}")
        tmp = Path(tempfile.mkdtemp(prefix="dw-upload-")) / (Path(file.filename).name or f"upload{ext}")
        size = 0
        with tmp.open("wb") as fh:
            while chunk := await file.read(8 * 1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD:
                    fh.close()
                    shutil.rmtree(tmp.parent, ignore_errors=True)
                    raise HTTPException(413, "upload larger than 1 GB")
                fh.write(chunk)
        return tmp

    def move_into(tmp: Path, dest: Path) -> Path:
        shutil.move(str(tmp), dest)
        shutil.rmtree(tmp.parent, ignore_errors=True)
        return dest

    def parse_options(
        model, calibration, dem_source, prior_p95_m, semantic_prior=False, gcps: str | None = None
    ) -> RunOptions:
        if model and model not in MODEL_PRESETS and model != cfg.model:
            raise HTTPException(422, f"unknown model preset {model}; choose one of {sorted(MODEL_PRESETS)}")
        if dem_source and dem_source not in DEM_SOURCES:
            raise HTTPException(422, f"unknown DEM source {dem_source}")
        if calibration and calibration not in CALIBRATIONS:
            raise HTTPException(422, f"unknown calibration mode {calibration}")
        parsed = []
        if gcps:
            from .schemas import GCPIn

            try:
                parsed = parse_gcps([GCPIn(**g) for g in json.loads(gcps)])
            except (ValueError, TypeError) as exc:
                raise HTTPException(422, f"gcps must be a JSON list of {{row, col, z}}: {exc}") from exc
        return RunOptions(
            model=model or None,
            calibration=calibration or None,
            dem_source=dem_source or None,
            prior_p95_m=prior_p95_m,
            semantic_prior=bool(semantic_prior),
            gcps=parsed,
        )

    def require_job(jid: str) -> dict:
        st = jobs.get(jid)
        if not st:
            raise HTTPException(404, "job not found")
        return st

    def require_done(jid: str) -> dict:
        st = require_job(jid)
        if st["status"] != "done":
            raise HTTPException(409, "job is not finished")
        return st

    def validate_bbox(bbox: list[float]) -> tuple[float, float, float, float]:
        if len(bbox) != 4 or not all(math.isfinite(v) for v in bbox):
            raise HTTPException(422, "bbox must contain four finite coordinates")
        west, south, east, north = bbox
        if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
            raise HTTPException(422, "bbox coordinates must be within EPSG:4326 bounds")
        if bbox_area_km2((west, south, east, north)) > MAX_IMAGERY_AREA_KM2:
            raise HTTPException(413, f"imagery box is limited to {MAX_IMAGERY_AREA_KM2:g} km²")
        return west, south, east, north

    @app.get("/api/health")
    def health() -> dict:
        return {"ok": True, "version": __version__}

    @app.get("/api/system")
    def system() -> dict:
        from ..depth.backbone import loaded_models, pick_device

        try:
            import torch

            torch_version, device = torch.__version__, pick_device(cfg.device)
        except Exception:  # pragma: no cover
            torch_version, device = "unavailable", "cpu"
        return {
            "version": __version__,
            "device": device,
            "torch": torch_version,
            "models": MODEL_PRESETS,
            "dem_sources": DEM_SOURCES,
            "loaded_models": loaded_models(),
            "jobs": len(jobs.list()),
            "defaults": {
                "model": cfg.model,
                "calibration": cfg.calibration,
                "dem_source": cfg.dem_source,
                "prior_p95_m": cfg.prior_p95_height_m,
                "tta": cfg.tta,
            },
        }

    @app.post("/api/warmup")
    def warmup(model: str | None = None) -> dict:
        from ..depth.backbone import get_backbone

        if model and model not in MODEL_PRESETS and model != cfg.model:
            raise HTTPException(422, f"unknown model preset {model}")
        b = get_backbone(cfg, model)
        return {"model": b.name, "device": b.device}

    @app.get("/api/jobs")
    def list_jobs() -> list[dict]:
        return jobs.list()

    @app.post("/api/jobs", status_code=202)
    async def create_job(
        file: UploadFile = File(...),
        model: str | None = Form(None),
        calibration: str | None = Form(None),
        dem_source: str | None = Form(None),
        prior_p95_m: float | None = Form(None),
        semantic_prior: bool = Form(False),
        gcps: str | None = Form(None),
    ) -> dict:
        opts = parse_options(model, calibration, dem_source, prior_p95_m, semantic_prior, gcps)
        tmp = await save_upload(file, ALLOWED)
        return jobs.submit(tmp, Path(file.filename).name, opts)

    def samples_dir() -> Path:
        return Path(cfg.data_dir) / "samples"

    @app.get("/api/samples")
    def list_samples() -> list[dict]:
        d = samples_dir()
        if not d.exists():
            return []
        return [
            {"name": p.name, "size": p.stat().st_size, "georeferenced": p.suffix.lower() in GEO_EXT}
            for p in sorted(d.iterdir())
            if p.is_file() and p.suffix.lower() in ALLOWED
        ]

    @app.post("/api/imagery/search")
    def imagery_search(req: ImagerySearchRequest) -> list[dict]:
        bbox = validate_bbox(req.bbox)
        try:
            return [
                item.to_dict()
                for item in search_imagery(
                    bbox, tuple(req.sources), req.months, req.max_cloud, req.limit
                )
            ]
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(502, f"imagery search failed: {exc}") from exc

    @app.post("/api/jobs/from-area", status_code=202)
    def create_from_area(req: AreaJobRequest) -> dict:
        bbox = validate_bbox(req.bbox)
        if sum(1 for job in jobs.list() if job.get("imagery") and job["status"] in ("queued", "running")) >= MAX_AREA_JOBS:
            raise HTTPException(429, "too many imagery jobs are running; wait for one to finish")
        try:
            item = ImageryItem(**req.item.model_dump())
            item = canonicalize_item(item)
        except (TypeError, ValueError) as exc:
            raise HTTPException(422, f"invalid imagery item: {exc}") from exc
        opts = parse_options(req.model, req.calibration, req.dem_source, req.prior_p95_m, req.semantic_prior)
        return jobs.submit_area(item, bbox, opts)

    @app.post("/api/jobs/from-sample", status_code=202)
    def create_from_sample(req: SampleRequest) -> dict:
        src = samples_dir() / Path(req.name).name
        if not src.is_file() or src.suffix.lower() not in ALLOWED:
            raise HTTPException(404, "sample not found")
        opts = parse_options(req.model, req.calibration, req.dem_source, req.prior_p95_m, req.semantic_prior)
        tmp = Path(tempfile.mkdtemp(prefix="dw-sample-")) / src.name
        shutil.copy2(src, tmp)
        return jobs.submit(tmp, src.name, opts)

    @app.post("/api/jobs/from-path", status_code=202)
    def create_from_path(req: PathRequest, x_dw_token: str | None = Header(default=None)) -> dict:
        """Desktop shell only: run a local file without uploading it. Needs the per-launch token."""
        if not cfg.desktop_token or x_dw_token != cfg.desktop_token:
            raise HTTPException(404, "not available")
        src = Path(req.path).expanduser()
        if not src.is_file() or src.suffix.lower() not in ALLOWED:
            raise HTTPException(404, "file not found or unsupported")
        opts = parse_options(req.model, req.calibration, req.dem_source, req.prior_p95_m, req.semantic_prior)
        tmp = Path(tempfile.mkdtemp(prefix="dw-path-")) / src.name
        shutil.copy2(src, tmp)
        return jobs.submit(tmp, src.name, opts)

    @app.get("/api/jobs/{jid}")
    def get_job(jid: str) -> dict:
        st = require_job(jid)
        st["meta"] = jobs.meta(jid)
        return st

    @app.get("/api/jobs/{jid}/events")
    async def job_events(jid: str):
        require_job(jid)
        q = jobs.subscribe(jid)

        async def gen():
            try:
                first = jobs.get(jid)
                yield {"event": "status", "data": json.dumps(first)}
                if not first or first["status"] in TERMINAL:
                    return
                while True:
                    try:
                        st = q.get_nowait()
                    except queue.Empty:
                        await asyncio.sleep(0.1)
                        continue
                    yield {"event": "status", "data": json.dumps(st)}
                    if st["status"] in TERMINAL:
                        break
            finally:
                jobs.unsubscribe(jid, q)

        return EventSourceResponse(gen())

    @app.post("/api/jobs/{jid}/cancel")
    def cancel_job(jid: str) -> dict:
        st = jobs.cancel(jid)
        if not st:
            raise HTTPException(404, "job not found")
        return st

    @app.delete("/api/jobs/{jid}")
    def delete_job(jid: str) -> dict:
        if not jobs.delete(jid):
            raise HTTPException(404, "job not found")
        return {"deleted": jid}

    @app.get("/api/jobs/{jid}/files/{name}")
    def job_file(jid: str, name: str):
        require_job(jid)
        safe_input = name.startswith("input.") and name[6:].isalnum()
        if name not in OUTPUT_FILES and not safe_input:
            raise HTTPException(404, "unknown file")
        root = jobs.dir(jid).resolve()
        path = (root / name).resolve()
        if not path.is_relative_to(root) or not path.is_file():
            raise HTTPException(404, "file not available")
        media = {
            ".tif": "image/tiff",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".glb": "model/gltf-binary",
            ".json": "application/json",
        }.get(path.suffix, "application/octet-stream")
        return FileResponse(
            path,
            media_type=media,
            filename=f"{jid}_{name}",
            headers={"Cache-Control": "no-cache", "Accept-Ranges": "bytes"},
        )

    @app.post("/api/jobs/{jid}/validate")
    async def validate_job(
        jid: str,
        file: UploadFile = File(...),
        classes: UploadFile | None = File(None),
        class_names: str | None = Form(None),
    ) -> dict:
        """Compare with a reference raster; an optional integer class raster gives per-landscape metrics."""
        require_done(jid)
        names = None
        if class_names:
            try:
                names = {str(k): str(v) for k, v in json.loads(class_names).items()}
            except (ValueError, AttributeError) as exc:
                raise HTTPException(422, f"class_names must be a JSON object of code -> name: {exc}") from exc
        dest = move_into(await save_upload(file, REFERENCE_ALLOWED), jobs.dir(jid) / "reference.tif")
        classes_path = None
        if classes is not None and classes.filename:
            classes_path = move_into(
                await save_upload(classes, REFERENCE_ALLOWED), jobs.dir(jid) / "classes.tif"
            )
        try:
            return await asyncio.to_thread(validate, jobs.dir(jid), dest, None, classes_path, names)
        except Exception as exc:
            raise HTTPException(422, f"validation failed: {exc}") from exc

    @app.post("/api/jobs/{jid}/recalibrate")
    async def recalibrate_job(jid: str, req: RecalibrateRequest) -> dict:
        require_done(jid)
        if req.mode and req.mode not in CALIBRATIONS:
            raise HTTPException(422, f"unknown calibration mode {req.mode}")
        try:
            return await asyncio.to_thread(
                recalibrate, jobs.dir(jid), req.mode, parse_gcps(req.gcps), req.prior_p95_m, cfg
            )
        except Exception as exc:
            raise HTTPException(422, f"recalibration failed: {exc}") from exc

    static = cfg.static_dir or _default_static()
    if static and (static / "index.html").exists():
        root_dir = static.resolve()
        app.mount("/assets", StaticFiles(directory=root_dir / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            target = (root_dir / path).resolve()
            if path and target.is_relative_to(root_dir) and target.is_file():
                return FileResponse(target)
            return FileResponse(root_dir / "index.html")

    else:

        @app.get("/", include_in_schema=False)
        def root() -> JSONResponse:
            return JSONResponse({"name": "DepthWizard engine", "version": __version__, "docs": "/docs"})

    return app


app = create_app()
