"""Command line: run a scene, validate a result, recalibrate, or serve the API + studio."""

from __future__ import annotations

import json
import logging
from pathlib import Path

import typer
from rich.console import Console
from rich.progress import BarColumn, Progress, TextColumn, TimeElapsedColumn

from . import __version__
from .calibrate.fit import GCP
from .config import settings

app = typer.Typer(add_completion=False, no_args_is_help=True, help="DepthWizard: single-image DSM engine")
benchmark_app = typer.Typer(add_completion=False, no_args_is_help=True, help="Run and report benchmark scenes")
app.add_typer(benchmark_app, name="benchmark")
console = Console()


def _gcps(path: Path | None) -> list[GCP]:
    if not path:
        return []
    rows = json.loads(Path(path).read_text())
    return [GCP(row=r["row"], col=r["col"], z=r["z"], label=r.get("label", "")) for r in rows]


@app.callback()
def _main(verbose: bool = typer.Option(False, "--verbose", "-v")) -> None:
    logging.basicConfig(
        level=logging.INFO if verbose else logging.WARNING, format="%(levelname)s %(name)s: %(message)s"
    )


@app.command()
def version() -> None:
    console.print(f"DepthWizard {__version__}")


@app.command()
def run(
    image: Path,
    out: Path = typer.Option(Path("out"), "--out", "-o"),
    model: str | None = typer.Option(None, help="small | base | large | HF id"),
    calibration: str | None = typer.Option(None, help="hybrid | affine | prior"),
    dem: str | None = typer.Option(None, "--dem", help="terrarium | glo_30 | srtm_v3 | nasadem"),
    gcps: Path | None = typer.Option(None, help="JSON list of {row, col, z}"),
    prior: float | None = typer.Option(None, help="scene prior: p95 structural height in metres"),
) -> None:
    """Image (PNG/JPG/GeoTIFF) -> DSM + heightmap + preview + GLB."""
    from .pipeline import RunOptions
    from .pipeline import run as run_pipeline

    opts = RunOptions(
        model=model, calibration=calibration, dem_source=dem, gcps=_gcps(gcps), prior_p95_m=prior
    )
    with Progress(
        TextColumn("{task.description}"),
        BarColumn(),
        TextColumn("{task.percentage:>3.0f}%"),
        TimeElapsedColumn(),
        console=console,
    ) as bar:
        task = bar.add_task("load", total=100)

        def progress(stage: str, frac: float, message: str = "") -> None:
            bar.update(task, description=f"{stage:10s} {message}", completed=round(frac * 100))

        meta = run_pipeline(image, out, settings, opts, progress=progress)
    s = meta["stats"]
    console.print(
        f"[bold]{meta['input']['name']}[/] -> {out}  units={meta['units']}  "
        f"range {s.get('min', 0):.2f}..{s.get('max', 0):.2f}  {meta['seconds']} s"
    )
    for note in meta["calibration"]["notes"]:
        console.print(f"  [dim]{note}[/]")


@app.command()
def validate(out: Path, reference: Path) -> None:
    """Compare a finished job directory with a reference DSM/LiDAR raster."""
    from .pipeline import validate as validate_job

    m = validate_job(out, reference)
    if "error" in m:
        console.print(f"[red]{m['error']}[/]")
        raise typer.Exit(1)
    for key in ("raw", "aligned"):
        r = m[key]
        console.print(
            f"[bold]{key:8s}[/] rmse {r['rmse']:.2f}  mae {r['mae']:.2f}  bias {r['bias']:+.2f}  "
            f"r {r['pearson_r']:.3f}  <1 m {r['within_1m'] * 100:.0f}%  <3 m {r['within_3m'] * 100:.0f}%"
        )


@app.command()
def recalibrate(
    out: Path, mode: str | None = None, gcps: Path | None = None, prior: float | None = None
) -> None:
    """Re-run calibration (mode / GCPs / prior) on a finished job without re-running the model."""
    from .pipeline import recalibrate as recal

    meta = recal(out, mode, _gcps(gcps), prior)
    console.print(json.dumps(meta["calibration"], indent=2))


@app.command()
def prefetch(models: list[str] = typer.Argument(None, help="presets to download, default: small")) -> None:
    """Download depth model weights now so later runs work offline."""
    from .config import MODEL_PRESETS
    from .depth.backbone import get_backbone

    for m in models or ["small"]:
        if m not in MODEL_PRESETS and "/" not in m:
            console.print(f"[red]unknown preset {m}; choose from {sorted(MODEL_PRESETS)}[/]")
            raise typer.Exit(1)
        b = get_backbone(settings, m)
        console.print(f"[green]ready[/] {b.name} on {b.device}")


@benchmark_app.command("run")
def benchmark_run_command(
    manifest: Path = typer.Option(Path("data/benchmark/manifest.json"), "--manifest"),
    out: Path = typer.Option(Path("data/benchmark"), "--out", "-o"),
    scene: str | None = typer.Option(None, "--scene", help="Run one scene id instead of the full manifest"),
) -> None:
    """Fetch cached scene pairs, run the normal pipeline, and save benchmark results."""
    from .benchmark.runner import benchmark_run

    results = benchmark_run(manifest, out, settings, scene_id=scene)
    for result in results:
        m = result["metrics"]
        raw = m.get("raw", {})
        console.print(
            f"[bold]{result['scene']['id']}[/] {result['scene']['landscape']} -> "
            f"rmse {raw.get('rmse', float('nan')):.2f} m ({raw.get('n', 0)} px)"
        )


@benchmark_app.command("report")
def benchmark_report_command(
    root: Path = typer.Option(Path("data/benchmark"), "--root", "-r"),
    output: Path = typer.Option(Path("docs/BENCHMARK.md"), "--output", "-o"),
) -> None:
    """Generate the per-scene and per-landscape benchmark Markdown table."""
    from .benchmark.runner import benchmark_report

    path = benchmark_report(root, output)
    console.print(f"[green]wrote[/] {path}")


@app.command()
def serve(host: str = "127.0.0.1", port: int = 8000, static: Path | None = None) -> None:
    """Serve the API and, when built, the studio UI."""
    import uvicorn

    if static:
        settings.static_dir = static
    from .api.app import create_app

    uvicorn.run(create_app(settings), host=host, port=port, log_level="info")


if __name__ == "__main__":  # pragma: no cover
    app()
