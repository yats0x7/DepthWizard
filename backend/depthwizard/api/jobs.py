from __future__ import annotations

import json
import logging
import shutil
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass, field
from pathlib import Path

from ..calibrate.fit import GCP
from ..config import Settings
from ..config import settings as default_settings
from ..pipeline import RunOptions, run

log = logging.getLogger(__name__)


@dataclass
class Job:
    id: str
    input_path: str
    input_name: str
    created: float = field(default_factory=time.time)
    status: str = "queued"
    stage: str = ""
    progress: float = 0.0
    error: str | None = None
    options: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)


class JobManager:
    """In-process job queue. One worker keeps GPU memory predictable on laptops."""

    def __init__(self, cfg: Settings = default_settings, workers: int = 1):
        self.cfg = cfg
        self.root = Path(cfg.data_dir) / "jobs"
        self.root.mkdir(parents=True, exist_ok=True)
        self.jobs: dict[str, Job] = {}
        self.lock = threading.Lock()
        self.pool = ThreadPoolExecutor(max_workers=workers, thread_name_prefix="dw-job")
        self._load_existing()

    def _load_existing(self) -> None:
        for d in sorted(self.root.iterdir()) if self.root.exists() else []:
            f = d / "status.json"
            if f.exists():
                try:
                    job = Job(**json.loads(f.read_text()))
                    if job.status in ("queued", "running"):
                        job.status, job.error = "error", "interrupted by restart"
                    self.jobs[job.id] = job
                except Exception:  # pragma: no cover
                    log.warning("could not load job %s", d)

    def dir(self, job_id: str) -> Path:
        return self.root / job_id

    def _save(self, job: Job) -> None:
        (self.dir(job.id) / "status.json").write_text(json.dumps(job.to_dict()))

    def create(self, data: bytes, filename: str, options: dict | None = None) -> Job:
        job_id = uuid.uuid4().hex[:12]
        d = self.dir(job_id)
        d.mkdir(parents=True)
        suffix = Path(filename).suffix.lower() or ".bin"
        inp = d / f"input{suffix}"
        inp.write_bytes(data)
        job = Job(id=job_id, input_path=str(inp), input_name=filename, options=options or {})
        with self.lock:
            self.jobs[job_id] = job
        self._save(job)
        self.pool.submit(self._execute, job_id)
        return job

    def _execute(self, job_id: str) -> None:
        job = self.jobs[job_id]
        job.status = "running"
        self._save(job)

        def progress(stage: str, frac: float) -> None:
            job.stage, job.progress = stage, float(frac)

        try:
            o = job.options
            gcps = [GCP(**g) for g in o.get("gcps", [])]
            run(job.input_path, self.dir(job_id), self.cfg,
                options=RunOptions(calibration=o.get("calibration"), dem_source=o.get("dem_source"),
                                   gcps=gcps, prior_p95_m=o.get("prior_p95_m")), progress=progress)
            job.status, job.stage, job.progress = "done", "done", 1.0
        except Exception as exc:
            log.exception("job %s failed", job_id)
            job.status, job.error = "error", f"{type(exc).__name__}: {exc}"
        self._save(job)

    def get(self, job_id: str) -> Job | None:
        return self.jobs.get(job_id)

    def meta(self, job_id: str) -> dict | None:
        f = self.dir(job_id) / "meta.json"
        return json.loads(f.read_text()) if f.exists() else None

    def list(self) -> list[Job]:
        return sorted(self.jobs.values(), key=lambda j: j.created, reverse=True)

    def delete(self, job_id: str) -> bool:
        with self.lock:
            job = self.jobs.pop(job_id, None)
        if job is None:
            return False
        shutil.rmtree(self.dir(job_id), ignore_errors=True)
        return True
