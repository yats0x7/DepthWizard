"""Runtime configuration. Every field can be overridden with a DW_* environment variable."""

from __future__ import annotations

import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

MODEL_PRESETS: dict[str, dict] = {
    "small": {"id": "depth-anything/Depth-Anything-V2-Small-hf", "params": "25M", "label": "Fast"},
    "base": {"id": "depth-anything/Depth-Anything-V2-Base-hf", "params": "98M", "label": "Balanced"},
    "large": {"id": "depth-anything/Depth-Anything-V2-Large-hf", "params": "335M", "label": "Best"},
}

DEM_SOURCES: dict[str, dict] = {
    "terrarium": {"label": "AWS Terrain Tiles", "res_m": 30, "note": "SRTM/NED/GMTED composite, seconds"},
    "glo_30": {"label": "Copernicus GLO-30", "res_m": 30, "note": "1-degree tiles, minutes"},
    "srtm_v3": {"label": "SRTM v3", "res_m": 30, "note": "1-degree tiles, minutes"},
    "nasadem": {"label": "NASADEM", "res_m": 30, "note": "1-degree tiles, minutes"},
}


def ensure_ca_bundle() -> None:
    """Point every HTTP stack at certifi when the interpreter ships without a CA bundle."""
    try:
        import certifi
    except ImportError:  # pragma: no cover
        return
    bundle = certifi.where()
    for var in ("SSL_CERT_FILE", "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE"):
        os.environ.setdefault(var, bundle)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="DW_", env_file=".env", extra="ignore")

    # depth backbone
    model: str = "small"  # preset name or a Hugging Face model id
    finetuned: Path | None = None  # optional state_dict fine-tuned on aerial height data
    device: str = "auto"  # auto | cuda | mps | cpu
    infer_res: int = 1036  # model input long side, multiple of 14
    tile: int = 1036  # working pixels per tile
    overlap: int = 160  # working pixels of overlap between tiles
    max_dim: int = 6000  # larger inputs are downscaled before inference
    tta: bool = True  # average with a horizontally flipped pass

    # calibration
    dem_source: str = "terrarium"
    calibration: str = "hybrid"  # hybrid | affine | prior
    prior_p95_height_m: float = 20.0
    min_fit_r2: float = 0.3
    min_relief_m: float = 5.0

    # outputs
    mesh_max_side: int = 768
    texture_max_side: int = 4096
    data_dir: Path = Path(__file__).resolve().parents[2] / "data"  # <repo>/data
    static_dir: Path | None = None  # built studio to serve from the API

    hf_token: str | None = None

    def model_id(self) -> str:
        return MODEL_PRESETS.get(self.model, {}).get("id", self.model)

    def jobs_dir(self) -> Path:
        return self.data_dir / "jobs"


ensure_ca_bundle()
settings = Settings()
