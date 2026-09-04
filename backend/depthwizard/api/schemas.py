from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class GCPIn(BaseModel):
    row: float
    col: float
    z: float = Field(description="Known elevation or height in metres")


class RecalibrateIn(BaseModel):
    calibration: Literal["hybrid", "affine", "prior"] | None = None
    gcps: list[GCPIn] = []
    prior_p95_m: float | None = None


class JobOut(BaseModel):
    id: str
    status: Literal["queued", "running", "done", "error"]
    stage: str = ""
    progress: float = 0.0
    error: str | None = None
    created: float
    input_name: str
    meta: dict[str, Any] | None = None


class HealthOut(BaseModel):
    ok: bool = True
    version: str
    model: str
    device: str
    model_loaded: bool
    calibration: str
    dem_source: str
