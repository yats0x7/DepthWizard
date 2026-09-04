# DepthWizard

**Single-view height estimation and 3D flythrough** for Smart India Hackathon 2026, problem statement **26175** (ISRO, Department of Space).

Upload one optical satellite image. DepthWizard turns it into a Digital Surface Model and an interactive 3D scene you can fly through, probe, slice and validate.

- **PNG / JPG** (no spatial metadata) → relative DSM (rDSM), normalised 0..1, optionally made metric with a couple of ground control points.
- **GeoTIFF** (CRS + geotransform) → **metric DSM** in the image's CRS, calibrated against a global 30 m DEM (Copernicus GLO-30 by default, SRTM v3 / NASADEM optional) and written as a standard GeoTIFF.
- Outputs: `dsm.tif`, 16-bit `heightmap.png`, hillshaded `preview.png`, textured `mesh.glb`, `meta.json`, and `metrics.json` after validation.

## Architecture

```
image ─► load (rasterio / PIL) ─► Depth Anything V2, tiled + globally aligned ─► relative height
      ─► calibration ─────────────────────────────────────────────────────────► metric DSM
            hybrid : DEM terrain trend + model structure (default)
            affine : RANSAC a·h + b against the DEM
            prior  : scene-level structural height prior (no DEM)
            GCPs   : refit scale/offset on user points (any mode, any input)
      ─► exports (GeoTIFF, PNG16, GLB via trimesh) ─► FastAPI job API ─► React + three.js viewer
```

| Layer | Choice | Why |
|---|---|---|
| Depth backbone | `depth-anything/Depth-Anything-V2-Small-hf` (swap to Base/Large with `DW_MODEL_ID`, or load fine-tuned weights with `DW_FINETUNED`) | Strongest open relative-depth foundation model; Apache-2.0 |
| Tiling | Global low-res pass + per-tile affine alignment + cosine blending | Removes per-tile scale/shift seams on large scenes |
| DEM | `dem-stitcher` (Copernicus GLO-30, no login) | Pure Python, global coverage |
| Calibration | `scikit-learn` RANSAC + scene prior fallback + GCPs | Robust when terrain is flat and the DEM carries no relief signal |
| Viewer | React 19, react-three-fiber, custom GLSL terrain shader, `@mapbox/martini` RTIN LOD, `geotiff.js` | 60 fps on large DSMs, reads the GeoTIFF directly in the browser |
| Validation | RMSE, MAE, bias, NMAD, Pearson r, within-1 m/3 m, raw and scale-aligned, error map | Matches the evaluation criteria |

## Quick start

Requirements: Python 3.12/3.13 with [uv](https://docs.astral.sh/uv/), Node 20+ with pnpm. GPU optional (CUDA, Apple MPS or CPU are picked automatically).

```bash
# backend API on :8000 (first run downloads ~100 MB of model weights from Hugging Face)
cd backend
uv sync --extra dev
uv run depthwizard serve --reload

# frontend on :5173 (proxies /api to the backend)
cd ../frontend
pnpm install
pnpm dev
```

Open http://localhost:5173, drop an image, wait for the job, then explore.

### CLI

```bash
cd backend
uv run depthwizard run path/to/scene.tif --out data/out/scene            # GeoTIFF -> metric DSM
uv run depthwizard run photo.png --out data/out/photo --gcp gcps.csv     # PNG + GCPs (row,col,z)
uv run depthwizard validate data/out/scene reference_lidar_dsm.tif      # RMSE / MAE / r
uv run depthwizard recalibrate data/out/scene --calibration affine       # no model re-run
uv run pytest                                                           # 14 tests, no model download
```

macOS note: if Python reports `CERTIFICATE_VERIFY_FAILED`, export `SSL_CERT_FILE=$(uv run python -c "import certifi;print(certifi.where())")` before running.

### Viewer tools

- **Orbit / Fly** (`F`): first-person flythrough with `W A S D`, `Q`/`E` down/up, `Shift` sprint, mouse look.
- **Layers**: image drape, hypsometric tint, slope, aspect, wireframe, contour lines, movable sun, vertical exaggeration, mesh detail.
- **Probe** (`1`): hover readout of height, slope, pixel and map coordinates; click to pin.
- **Profile** (`2`): two clicks draw a cross-section chart.
- **GCP** (`3`): click a point, type its known height, apply to recalibrate live.
- **Flood**: water-level slider tints inundated terrain (Disaster Management use case).
- **Validate**: upload a reference DSM / LiDAR GeoTIFF for metrics and an error map.
- **Info / Downloads**: calibration report, statistics, all output files.

## Configuration

Every setting is an environment variable with the `DW_` prefix (see `backend/depthwizard/config.py`):

| Variable | Default | Meaning |
|---|---|---|
| `DW_MODEL_ID` | `depth-anything/Depth-Anything-V2-Small-hf` | Any HF depth-estimation model |
| `DW_FINETUNED` | unset | Path to a state dict fine-tuned on aerial nDSMs (e.g. GAMUS) |
| `DW_DEVICE` | `auto` | `cuda`, `mps`, `cpu` |
| `DW_INFER_RES` / `DW_TILE` / `DW_OVERLAP` | 1036 / 1036 / 160 | Inference resolution and tiling |
| `DW_DEM_SOURCE` | `glo_30` | `glo_30`, `srtm_v3`, `nasadem` |
| `DW_CALIBRATION` | `hybrid` | `hybrid`, `affine`, `prior` |
| `DW_PRIOR_P95_HEIGHT_M` | 20 | Scene prior for structural heights |
| `DW_DATA_DIR` | `data` | Jobs and outputs |
| `DW_STATIC_DIR` | `../frontend/dist` | Built web app served by the API |

## Packaging

- **Docker**: `docker/build.sh` builds the web bundle and an API image that serves it on port 8000, then `docker compose up`.
- **Desktop**: `desktop/` holds a Tauri 2 configuration that wraps the web app and launches the API as a sidecar; see `desktop/README.md`.

## Evaluation

`depthwizard validate <job_dir> <reference.tif>` reprojects the reference onto the prediction grid and reports raw and scale-aligned RMSE, MAE, bias, NMAD, Pearson r and the share of pixels within 1 m and 3 m, plus an error map. The same runs from the **Validate** tab in the app. Per-landscape breakdowns are supported through class masks in `depthwizard.eval.compare`.

## Fine-tuning on GAMUS (recommended follow-up)

The problem statement recommends the GAMUS dataset. Fine-tune the Depth Anything V2 decoder on GAMUS nDSM labels following the `depth-any-canopy` recipe, save the state dict, and point `DW_FINETUNED` at it. Everything else stays the same.

## Repository layout

```
backend/     Python package `depthwizard` (pipeline, API, CLI, tests)
frontend/    Vite + React + three.js web app
desktop/     Tauri 2 desktop wrapper
docker/      Dockerfiles and build script
PROBLEM_STATEMENT.md, OPEN_SOURCE_LANDSCAPE.md, SIH_FORM_ANSWERS.md
```

## License

MIT for this repository. Third-party components keep their own licenses (Depth Anything V2 Apache-2.0, three.js MIT, etc.).
