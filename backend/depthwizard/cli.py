from __future__ import annotations

import csv
import json
import logging
from pathlib import Path

import typer
from rich import print as rprint

from .calibrate.fit import GCP
from .config import settings

app = typer.Typer(help="DepthWizard: single-view satellite height estimation and 3D flythrough.")


def _read_gcps(path: Path | None) -> list[GCP]:
    if not path:
        return []
    with open(path) as f:
        rows = list(csv.DictReader(f))
    return [GCP(row=float(r["row"]), col=float(r["col"]), z=float(r["z"])) for r in rows]


@app.command()
def run(input: Path, out: Path = typer.Option(Path("data/out"), help="Output directory"),
        calibration: str = typer.Option(None, help="hybrid | affine | prior"),
        dem_source: str = typer.Option(None, help="glo_30 | srtm_v3 | nasadem"),
        gcp: Path = typer.Option(None, help="CSV with row,col,z columns"),
        verbose: bool = False):
    """Estimate a DSM from a single PNG/JPG/GeoTIFF and export GeoTIFF, PNG, GLB and preview."""
    logging.basicConfig(level=logging.INFO if verbose else logging.WARNING)
    from .pipeline import RunOptions
    from .pipeline import run as _run

    def progress(stage: str, frac: float) -> None:
        rprint(f"[cyan]{stage:<10}[/cyan] {frac * 100:5.1f}%", end="\r")

    meta = _run(input, out, settings, options=RunOptions(calibration=calibration,
                dem_source=dem_source, gcps=_read_gcps(gcp)), progress=progress)
    rprint()
    rprint({k: meta[k] for k in ("units", "calibration", "stats", "files", "seconds")})


@app.command()
def validate(job_dir: Path, reference: Path):
    """Compute RMSE / MAE / correlation of a job's DSM against a reference raster."""
    from .pipeline import validate as _validate

    rprint(json.dumps(_validate(job_dir, reference), indent=2))


@app.command()
def recalibrate(job_dir: Path, calibration: str = typer.Option(None), gcp: Path = typer.Option(None)):
    """Re-run calibration (mode change or GCPs) on a finished job without re-running the model."""
    from .pipeline import recalibrate as _recal

    meta = _recal(job_dir, mode=calibration, gcps=_read_gcps(gcp))
    rprint(meta["calibration"])


@app.command()
def serve(host: str = "127.0.0.1", port: int = 8000, reload: bool = False):
    """Start the HTTP API (and the built web app when DW_STATIC_DIR is set)."""
    import uvicorn

    uvicorn.run("depthwizard.api.app:app", host=host, port=port, reload=reload)


if __name__ == "__main__":
    app()
