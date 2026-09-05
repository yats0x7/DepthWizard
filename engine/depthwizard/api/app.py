"""FastAPI application: jobs, files, validation, recalibration, live progress, static studio."""

from __future__ import annotations

import asyncio
import json
import logging
import queue
import shutil
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sse_starlette.sse import EventSourceResponse

from .. import __version__
from ..config import DEM_SOURCES, MODEL_PRESETS, Settings
from ..config import settings as default_settings
from ..pipeline import OUTPUT_FILES, RunOptions, recalibrate, validate
from .jobs import JobManager, parse_gcps
from .schemas import PathRequest, RecalibrateRequest, SampleRequest

log = logging.getLogger(__name__)
ALLOWED = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff", ".geotiff", ".jp2", ".img"}
REFERENCE_ALLOWED = {".tif", ".tiff", ".geotiff", ".img", ".png"}
MAX_UPLOAD = 1024 * 1024 * 1024  # 1 GB


def _default_static() -> Path | None:
    here = Path(__file__).resolve()
    for candidate in (here.parents[2] / "static", here.parents[3] / "apps" / "studio" / "dist"):
        if (candidate / "index.html").exists():
            return candidate
    return None


def create_app(cfg: Settings = default_settings) -> FastAPI:
    app = FastAPI(title="DepthWizard", version=__version__)
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
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
        gcps: str | None = Form(None),
    ) -> dict:
        tmp = await save_upload(file, ALLOWED)
        if model and model not in MODEL_PRESETS and "/" not in model:
            raise HTTPException(422, f"unknown model preset {model}")
        if dem_source and dem_source not in DEM_SOURCES:
            raise HTTPException(422, f"unknown DEM source {dem_source}")
        if calibration and calibration not in ("hybrid", "affine", "prior"):
            raise HTTPException(422, f"unknown calibration mode {calibration}")
        parsed = []
        if gcps:
            from .schemas import GCPIn

            parsed = parse_gcps([GCPIn(**g) for g in json.loads(gcps)])
        opts = RunOptions(
            model=model or None,
            calibration=calibration or None,
            dem_source=dem_source or None,
            prior_p95_m=prior_p95_m,
            gcps=parsed,
        )
        return jobs.submit(tmp, Path(file.filename).name, opts)

    def samples_dir() -> Path:
        return Path(cfg.data_dir) / "samples"

    @app.get("/api/samples")
    def list_samples() -> list[dict]:
        d = samples_dir()
        if not d.exists():
            return []
        out = []
        for p in sorted(d.iterdir()):
            if p.suffix.lower() in ALLOWED and p.is_file():
                out.append(
                    {
                        "name": p.name,
                        "size": p.stat().st_size,
                        "georeferenced": p.suffix.lower() in {".tif", ".tiff", ".geotiff", ".jp2", ".img"},
                    }
                )
        return out

    @app.post("/api/jobs/from-sample", status_code=202)
    def create_from_sample(req: SampleRequest) -> dict:
        src = samples_dir() / Path(req.name).name
        if not src.is_file() or src.suffix.lower() not in ALLOWED:
            raise HTTPException(404, "sample not found")
        tmp = Path(tempfile.mkdtemp(prefix="dw-sample-")) / src.name
        shutil.copy2(src, tmp)
        opts = RunOptions(
            model=req.model or None,
            calibration=req.calibration or None,
            dem_source=req.dem_source or None,
            prior_p95_m=req.prior_p95_m,
        )
        return jobs.submit(tmp, src.name, opts)

    @app.post("/api/jobs/from-path", status_code=202)
    def create_from_path(req: PathRequest) -> dict:
        """Desktop app: run a local file without uploading it through the browser."""
        src = Path(req.path).expanduser()
        if not src.is_file() or src.suffix.lower() not in ALLOWED:
            raise HTTPException(404, "file not found or unsupported")
        tmp = Path(tempfile.mkdtemp(prefix="dw-path-")) / src.name
        shutil.copy2(src, tmp)
        opts = RunOptions(
            model=req.model or None,
            calibration=req.calibration or None,
            dem_source=req.dem_source or None,
            prior_p95_m=req.prior_p95_m,
        )
        return jobs.submit(tmp, src.name, opts)

    @app.get("/api/jobs/{jid}")
    def get_job(jid: str) -> dict:
        st = jobs.get(jid)
        if not st:
            raise HTTPException(404, "job not found")
        st["meta"] = jobs.meta(jid)
        return st

    @app.get("/api/jobs/{jid}/events")
    async def job_events(jid: str):
        if not jobs.get(jid):
            raise HTTPException(404, "job not found")
        q = jobs.subscribe(jid)

        async def gen():
            try:
                yield {"event": "status", "data": json.dumps(jobs.get(jid))}
                while True:
                    try:
                        st = q.get_nowait()
                    except queue.Empty:
                        await asyncio.sleep(0.1)
                        continue
                    yield {"event": "status", "data": json.dumps(st)}
                    if st["status"] in ("done", "failed", "cancelled"):
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
        if name not in OUTPUT_FILES and not name.startswith("input."):
            raise HTTPException(404, "unknown file")
        path = jobs.dir(jid) / name
        if not path.exists():
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
    async def validate_job(jid: str, file: UploadFile = File(...)) -> dict:
        st = jobs.get(jid)
        if not st or st["status"] != "done":
            raise HTTPException(409, "job is not finished")
        tmp = await save_upload(file, REFERENCE_ALLOWED)
        dest = jobs.dir(jid) / "reference.tif"
        shutil.move(str(tmp), dest)
        try:
            return await asyncio.to_thread(validate, jobs.dir(jid), dest)
        except Exception as exc:
            raise HTTPException(422, f"validation failed: {exc}") from exc

    @app.post("/api/jobs/{jid}/recalibrate")
    async def recalibrate_job(jid: str, req: RecalibrateRequest) -> dict:
        st = jobs.get(jid)
        if not st or st["status"] != "done":
            raise HTTPException(409, "job is not finished")
        if req.mode and req.mode not in ("hybrid", "affine", "prior"):
            raise HTTPException(422, f"unknown calibration mode {req.mode}")
        try:
            return await asyncio.to_thread(
                recalibrate, jobs.dir(jid), req.mode, parse_gcps(req.gcps), req.prior_p95_m, cfg
            )
        except Exception as exc:
            raise HTTPException(422, f"recalibration failed: {exc}") from exc

    static = cfg.static_dir or _default_static()
    if static and (static / "index.html").exists():
        app.mount("/assets", StaticFiles(directory=static / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            target = static / path
            if path and target.is_file():
                return FileResponse(target)
            return FileResponse(static / "index.html")
    else:

        @app.get("/", include_in_schema=False)
        def root() -> JSONResponse:
            return JSONResponse({"name": "DepthWizard engine", "version": __version__, "docs": "/docs"})

    return app


app = create_app()
