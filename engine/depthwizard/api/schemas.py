from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

JobStatus = Literal["queued", "running", "done", "failed", "cancelled"]


class GCPIn(BaseModel):
    row: float
    col: float
    z: float
    label: str = ""


class JobSummary(BaseModel):
    id: str
    name: str
    status: JobStatus
    stage: str = "queued"
    progress: float = 0.0
    message: str = ""
    created: float
    updated: float
    seconds: float | None = None
    units: str | None = None
    georeferenced: bool | None = None
    model: str | None = None
    error: str | None = None


class JobDetail(JobSummary):
    meta: dict[str, Any] | None = None


class RecalibrateRequest(BaseModel):
    mode: str | None = None
    gcps: list[GCPIn] = Field(default_factory=list)
    prior_p95_m: float | None = None


class SystemInfo(BaseModel):
    version: str
    device: str
    torch: str
    models: dict[str, Any]
    dem_sources: dict[str, Any]
    loaded_models: list[str]
    defaults: dict[str, Any]
    jobs: int


class RunOptionsIn(BaseModel):
    model: str | None = None
    calibration: str | None = None
    dem_source: str | None = None
    prior_p95_m: float | None = None


class SampleRequest(RunOptionsIn):
    name: str


class PathRequest(RunOptionsIn):
    path: str
