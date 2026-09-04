from __future__ import annotations

import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration. Every field can be overridden with a DW_* environment variable."""

    model_config = SettingsConfigDict(env_prefix="DW_", env_file=".env", extra="ignore")

    # Depth backbone
    model_id: str = "depth-anything/Depth-Anything-V2-Small-hf"
    finetuned: Path | None = None  # optional state_dict fine-tuned on aerial height data
    device: str = "auto"  # auto | cuda | mps | cpu
    infer_res: int = 1036  # model input long side (multiple of 14)
    tile: int = 1036  # source pixels per tile
    overlap: int = 160  # source pixels of overlap between tiles
    max_dim: int = 6000  # inputs larger than this are downscaled before inference

    # Calibration
    dem_source: str = "glo_30"  # dem-stitcher name: glo_30 (Copernicus, no login) | srtm_v3 | nasadem
    calibration: str = "hybrid"  # hybrid | affine | prior
    prior_p95_height_m: float = 20.0  # scene prior: 95th percentile of structural height
    min_fit_r2: float = 0.3
    min_relief_m: float = 5.0

    # Outputs
    mesh_max_side: int = 512
    texture_max_side: int = 2048
    data_dir: Path = Path("data")
    static_dir: Path | None = None  # built frontend to serve from the API

    hf_token: str | None = None


settings = Settings()


def ensure_ca_bundle() -> None:
    """Some Python builds (notably python.org macOS installers) ship without a CA bundle, which
    breaks Hugging Face, DEM and GDAL downloads. Point the common variables at certifi."""
    if os.environ.get("SSL_CERT_FILE"):
        return
    try:
        import certifi

        ca = certifi.where()
    except Exception:  # pragma: no cover
        return
    for var in ("SSL_CERT_FILE", "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE"):
        os.environ.setdefault(var, ca)


ensure_ca_bundle()


def ensure_ca_bundle() -> None:
    """Some Python builds (notably python.org macOS installers) ship without a CA bundle, which
    breaks Hugging Face, DEM and GDAL downloads. Point the common variables at certifi."""
    if os.environ.get("SSL_CERT_FILE"):
        return
    try:
        import certifi

        ca = certifi.where()
    except Exception:  # pragma: no cover
        return
    for var in ("SSL_CERT_FILE", "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE"):
        os.environ.setdefault(var, ca)


ensure_ca_bundle()
