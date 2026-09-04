from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .. import __version__
from ..calibrate.fit import GCP
from ..config import settings
from ..depth import backbone as bbmod
from ..pipeline import OUTPUT_FILES, recalibrate, validate
from .jobs import JobManager
from .schemas import HealthOut, JobOut, RecalibrateIn

log = logging.getLogger(__name__)
app = FastAPI(title="DepthWizard API", version=__version__,
              description="Single-view satellite height estimation and 3D flythrough (SIH 26175)")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
manager = JobManager(settings)

MAX_UPLOAD = 512 * 1024 * 1024
ALLOWED = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".geotiff", ".jp2", ".webp"}


def _job_out(job) -> JobOut:
    return JobOut(id=job.id, status=job.status, stage=job.stage, progress=job.progress,
                  error=job.error, created=job.created, input_name=job.input_name,
                  meta=manager.meta(job.id) if job.status == "done" else None)


@app.get("/api/health", response_model=HealthOut)
def health():
    bb = bbmod._backbone
    return HealthOut(version=__version__, model=settings.model_id,
                     device=getattr(bb, "device", bbmod.pick_device(settings.device)),
                     model_loaded=bb is not None, calibration=settings.calibration,
                     dem_source=settings.dem_source)


@app.post("/api/warmup")
def warmup():
    bbmod.get_backbone(settings)
    return {"ok": True}


@app.post("/api/jobs", response_model=JobOut, status_code=202)
async def create_job(file: UploadFile = File(...), calibration: str | None = Form(None),
                     dem_source: str | None = Form(None), prior_p95_m: float | None = Form(None)):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED:
        raise HTTPException(415, f"unsupported file type {suffix or '(none)'}")
    data = await file.read()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "file too large")
    if calibration and calibration not in ("hybrid", "affine", "prior"):
        raise HTTPException(422, "calibration must be hybrid | affine | prior")
    job = manager.create(data, file.filename or f"upload{suffix}",
                         {"calibration": calibration, "dem_source": dem_source,
                          "prior_p95_m": prior_p95_m})
    return _job_out(job)


@app.get("/api/jobs", response_model=list[JobOut])
def list_jobs():
    return [_job_out(j) for j in manager.list()]


@app.get("/api/jobs/{job_id}", response_model=JobOut)
def get_job(job_id: str):
    job = manager.get(job_id)
    if job is None:
        raise HTTPException(404, "job not found")
    return _job_out(job)


@app.delete("/api/jobs/{job_id}", status_code=204)
def delete_job(job_id: str):
    if not manager.delete(job_id):
        raise HTTPException(404, "job not found")


@app.get("/api/jobs/{job_id}/files/{name}")
def get_file(job_id: str, name: str):
    if name not in OUTPUT_FILES:
        raise HTTPException(404, "unknown file")
    path = manager.dir(job_id) / name
    if manager.get(job_id) is None or not path.exists():
        raise HTTPException(404, "file not found")
    media = {"glb": "model/gltf-binary", "png": "image/png", "jpg": "image/jpeg",
             "tif": "image/tiff", "json": "application/json"}[path.suffix[1:]]
    return FileResponse(path, media_type=media, filename=f"{job_id}_{name}")


@app.post("/api/jobs/{job_id}/validate")
async def validate_job(job_id: str, file: UploadFile = File(...)):
    job = manager.get(job_id)
    if job is None or job.status != "done":
        raise HTTPException(404, "finished job not found")
    ref = manager.dir(job_id) / "reference.tif"
    ref.write_bytes(await file.read())
    try:
        return validate(manager.dir(job_id), ref)
    except Exception as exc:
        raise HTTPException(422, f"could not validate: {exc}") from exc


@app.post("/api/jobs/{job_id}/recalibrate")
def recalibrate_job(job_id: str, body: RecalibrateIn):
    job = manager.get(job_id)
    if job is None or job.status != "done":
        raise HTTPException(404, "finished job not found")
    gcps = [GCP(g.row, g.col, g.z) for g in body.gcps]
    try:
        return recalibrate(manager.dir(job_id), mode=body.calibration, gcps=gcps,
                           prior_p95_m=body.prior_p95_m)
    except Exception as exc:
        raise HTTPException(422, f"could not recalibrate: {exc}") from exc


_static = settings.static_dir or (Path(__file__).resolve().parents[3] / "frontend" / "dist")
if _static.exists():
    app.mount("/", StaticFiles(directory=_static, html=True), name="app")
