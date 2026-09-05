"""In-process job manager: one worker thread, status.json on disk, live event streams."""

from __future__ import annotations

import json
import logging
import queue
import shutil
import threading
import time
import uuid
from concurrent.futures import Future, ThreadPoolExecutor
from pathlib import Path

from ..calibrate.fit import GCP
from ..config import Settings
from ..config import settings as default_settings
from ..pipeline import JobCancelled, RunOptions, run

log = logging.getLogger(__name__)


class JobManager:
    def __init__(self, cfg: Settings = default_settings, workers: int = 1):
        self.cfg = cfg
        self.root = cfg.jobs_dir()
        self.root.mkdir(parents=True, exist_ok=True)
        self.pool = ThreadPoolExecutor(max_workers=workers, thread_name_prefix="dw-job")
        self.lock = threading.Lock()
        self.jobs: dict[str, dict] = {}
        self.futures: dict[str, Future] = {}
        self.cancel_flags: dict[str, threading.Event] = {}
        self.listeners: dict[str, list[queue.Queue]] = {}
        self._load()

    # persistence ---------------------------------------------------------------------------
    def _load(self) -> None:
        for d in sorted(self.root.iterdir()) if self.root.exists() else []:
            f = d / "status.json"
            if f.exists():
                try:
                    st = json.loads(f.read_text())
                except json.JSONDecodeError:
                    continue
                if st.get("status") in ("queued", "running"):
                    st.update(status="failed", error="interrupted by restart", message="interrupted")
                    f.write_text(json.dumps(st))
                self.jobs[st["id"]] = st

    def _save(self, st: dict) -> None:
        d = self.root / st["id"]
        if d.exists():
            (d / "status.json").write_text(json.dumps(st))

    def _emit(self, st: dict) -> None:
        for q in list(self.listeners.get(st["id"], [])):
            try:
                q.put_nowait(dict(st))
            except queue.Full:  # pragma: no cover
                pass

    def _update(self, jid: str, **fields) -> dict:
        with self.lock:
            st = self.jobs.get(jid)
            if st is None:  # deleted while running
                return {"id": jid, "status": "cancelled", **fields}
            st.update(fields, updated=time.time())
            self._save(st)
            self._emit(st)
            return dict(st)

    # public API ----------------------------------------------------------------------------
    def list(self) -> list[dict]:
        with self.lock:
            return sorted((dict(s) for s in self.jobs.values()), key=lambda s: s["created"], reverse=True)

    def get(self, jid: str) -> dict | None:
        with self.lock:
            st = self.jobs.get(jid)
            return dict(st) if st else None

    def dir(self, jid: str) -> Path:
        return self.root / jid

    def meta(self, jid: str) -> dict | None:
        f = self.dir(jid) / "meta.json"
        return json.loads(f.read_text()) if f.exists() else None

    def subscribe(self, jid: str) -> queue.Queue:
        q: queue.Queue = queue.Queue(maxsize=256)
        with self.lock:
            self.listeners.setdefault(jid, []).append(q)
        return q

    def unsubscribe(self, jid: str, q: queue.Queue) -> None:
        with self.lock:
            if q in self.listeners.get(jid, []):
                self.listeners[jid].remove(q)

    def submit(self, upload: Path, name: str, options: RunOptions) -> dict:
        jid = uuid.uuid4().hex[:12]
        d = self.dir(jid)
        d.mkdir(parents=True, exist_ok=True)
        dest = d / ("input" + Path(name).suffix.lower())
        shutil.move(str(upload), dest)
        shutil.rmtree(upload.parent, ignore_errors=True)
        now = time.time()
        st = {
            "id": jid,
            "name": name,
            "status": "queued",
            "stage": "queued",
            "progress": 0.0,
            "message": "waiting",
            "created": now,
            "updated": now,
            "model": options.model or self.cfg.model,
            "input": dest.name,
            "options": {
                "model": options.model,
                "calibration": options.calibration,
                "dem_source": options.dem_source,
                "prior_p95_m": options.prior_p95_m,
                "gcps": len(options.gcps),
            },
        }
        with self.lock:
            self.jobs[jid] = st
            self._save(st)
            self.cancel_flags[jid] = threading.Event()
            self.futures[jid] = self.pool.submit(self._run, jid, dest, options)
        return dict(st)

    def cancel(self, jid: str) -> dict | None:
        st = self.get(jid)
        if not st:
            return None
        flag = self.cancel_flags.get(jid)
        if flag:
            flag.set()
        fut = self.futures.get(jid)
        if fut and fut.cancel():
            return self._update(jid, status="cancelled", stage="cancelled", message="cancelled before start")
        return st

    def delete(self, jid: str) -> bool:
        self.cancel(jid)
        fut = self.futures.get(jid)
        if fut is not None and not fut.done():
            try:  # let the worker notice the cancel flag before its directory disappears
                fut.result(timeout=120)
            except Exception:  # noqa: BLE001
                pass
        with self.lock:
            st = self.jobs.pop(jid, None)
            self.futures.pop(jid, None)
            self.cancel_flags.pop(jid, None)
            self.listeners.pop(jid, None)
        if st is None:
            return False
        shutil.rmtree(self.dir(jid), ignore_errors=True)
        return True

    # worker --------------------------------------------------------------------------------
    def _run(self, jid: str, path: Path, options: RunOptions) -> None:
        flag = self.cancel_flags[jid]
        if flag.is_set():
            self._update(jid, status="cancelled", stage="cancelled", message="cancelled")
            return
        self._update(jid, status="running", stage="load", message="starting")
        last = [0.0]

        def progress(stage: str, frac: float, message: str = "") -> None:
            now = time.time()
            if stage == "done" or frac >= 1.0 or now - last[0] > 0.15:
                last[0] = now
                self._update(jid, stage=stage, progress=round(float(frac), 4), message=message)

        try:
            meta = run(path, self.dir(jid), self.cfg, options, progress=progress, cancel=flag.is_set)
            self._update(
                jid,
                status="done",
                stage="done",
                progress=1.0,
                message="finished",
                seconds=meta.get("seconds"),
                units=meta.get("units"),
                georeferenced=meta["input"]["georeferenced"],
                model=meta["model"]["id"],
            )
        except JobCancelled:
            self._update(jid, status="cancelled", stage="cancelled", message="cancelled")
        except Exception as exc:  # noqa: BLE001
            log.exception("job %s failed", jid)
            self._update(jid, status="failed", stage="failed", message=str(exc)[:300], error=str(exc)[:2000])


def parse_gcps(items) -> list[GCP]:
    return [GCP(row=g.row, col=g.col, z=g.z, label=getattr(g, "label", "")) for g in items]
