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
    semantic_prior: bool = False


class SampleRequest(RunOptionsIn):
    name: str


class PathRequest(RunOptionsIn):
    path: str


class ImageryItemIn(BaseModel):
    source: Literal["oam", "sentinel2"]
    id: str
    title: str
    url: str
    bbox: list[float]
    date: str | None = None
    gsd_m: float | None = None
    cloud: float | None = None
    thumbnail: str | None = None
    provider: str | None = None
    license: str = ""
    attribution: str = ""


class ImagerySearchRequest(BaseModel):
    bbox: list[float]
    sources: list[Literal["oam", "sentinel2"]] = Field(default_factory=lambda: ["oam", "sentinel2"])
    months: int = Field(default=18, ge=1, le=120)
    max_cloud: float = Field(default=20.0, ge=0, le=100)
    limit: int = Field(default=20, ge=1, le=50)


class AreaJobRequest(RunOptionsIn):
    bbox: list[float]
    item: ImageryItemIn
