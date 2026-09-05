# DepthWizard

Single-view satellite and aerial imagery to a digital surface model, and from there to a 3D
scene you can fly through, measure and validate. Built for Smart India Hackathon 2026, problem
statement 26175 (Indian Space Research Organisation).

- **PNG / JPG** in, **relative DSM** out (rDSM, values 0 to 1). Ground control points turn it metric.
- **GeoTIFF** in, **metric DSM** out: the footprint pulls a coarse global DEM (AWS Terrain Tiles by
  default, Copernicus GLO-30 / SRTM / NASADEM optional), a robust ground-trend fit sets the scale,
  the depth model adds the structure, GCPs refine it.
- Outputs: Float32 GeoTIFF, 16-bit heightmap PNG, hillshaded preview, textured GLB, metadata JSON,
  validation metrics (RMSE, MAE, bias, NMAD, Pearson r, within 1 m / 3 m) and a signed error map.
- Studio: Presentation mode (sky, sun shadows, ambient occlusion, bloom, tone mapping, damped
  fly-through with head-bob in walk mode) and Analysis mode (flat light, exact heights, wireframe,
  contours, slope, aspect, flood level, cross-sections, GCPs, validation). One toggle, same geometry.
- Ships as an Electron desktop app, a Docker image, and a plain web app.

## Layout

```
engine/        Python package `depthwizard`: pipeline, calibration, exports, FastAPI, CLI (uv)
apps/studio/   React 19 + three.js studio (Vite, Tailwind 4, react-three-fiber)
apps/desktop/  Electron shell that starts the engine and opens the studio
docker/        Engine + studio image; docker-compose.yml at the root
docs/          Problem statement, form answers, open-source landscape, pitch-deck brief
data/          (git-ignored) samples/, jobs/, dem_cache/
```

## Run it

Prerequisites: [uv](https://docs.astral.sh/uv/), Node 22+, pnpm 11 (`corepack enable`).

```bash
pnpm install                       # studio + desktop dependencies
uv sync --directory engine --extra dev
pnpm engine                        # API on http://127.0.0.1:8000 (model downloads on first run)
pnpm studio                        # UI on http://127.0.0.1:5174 (proxies /api to the engine)
```

Desktop app (starts its own engine, serves the built studio):

```bash
pnpm studio:build && pnpm desktop
```

Docker:

```bash
docker compose up --build          # http://localhost:8000
```

Command line:

```bash
uv run --directory engine depthwizard run data/samples/oam_urban.tif --out data/out/urban
uv run --directory engine depthwizard validate data/out/urban reference.tif
uv run --directory engine depthwizard recalibrate data/out/urban --gcps gcps.json
```

Drop sample scenes into `data/samples/` and they appear in the studio under "Sample scenes".

## How it works

1. **Read** PNG/JPG (Pillow) or GeoTIFF (rasterio). Large inputs are downscaled to 6000 px; the
   georeferencing transform is scaled with them.
2. **Predict** relative depth with Depth Anything V2 (Small by default; Base and Large selectable
   per job) through Hugging Face transformers. Scenes larger than one tile are processed as
   overlapping tiles, each aligned to one global low-resolution pass with a trimmed least-squares
   affine fit and blended with a raised-cosine window. A horizontally flipped pass is averaged in.
3. **Calibrate.** The relative height map is split into a ground trend (asymmetric Gaussian
   smoothing that ignores objects above ground) and structure (everything above it). For
   georeferenced input the trend is fitted to the coarse DEM with RANSAC; the DSM is the filled DEM
   plus the scaled structure (`hybrid`). `affine` fits the whole map directly, `prior` uses a scene
   height prior when no DEM is available. Ground control points refit offset (1 point) or scale and
   offset (2+) on any result, including PNG inputs.
4. **Export** GeoTIFF (nodata −9999, deflate), 16-bit PNG, hillshaded preview, texture, GLB mesh
   (X east, Y up, Z south, metres), surface statistics and timings in `meta.json`.
5. **View.** The studio reads the GeoTIFF in the browser (geotiff.js), builds a regular grid whose
   vertices are exact DSM samples, drapes the image, and renders it with a stock three.js material
   extended by a fragment-shader layer system (hypsometric, slope, aspect, hillshade, contours,
   flood tint) computed from a full-resolution float height texture. Every readout samples the
   DSM array bilinearly; the mesh is never the source of a number.

## Configuration

Every setting is a `DW_*` environment variable (see `engine/depthwizard/config.py`): `DW_MODEL`
(small | base | large | any HF depth model id), `DW_DEVICE`, `DW_DEM_SOURCE`, `DW_CALIBRATION`,
`DW_PRIOR_P95_HEIGHT_M`, `DW_TTA`, `DW_MESH_MAX_SIDE`, `DW_DATA_DIR`, `DW_FINETUNED` (a state_dict
fine-tuned on aerial DSM data), `DW_HF_TOKEN`.

## API

`GET /api/system`, `GET /api/samples`, `POST /api/jobs` (multipart: file, model, calibration,
dem_source, prior_p95_m, gcps), `POST /api/jobs/from-sample`, `GET /api/jobs`, `GET /api/jobs/{id}`,
`GET /api/jobs/{id}/events` (server-sent progress), `POST /api/jobs/{id}/cancel`,
`DELETE /api/jobs/{id}`, `GET /api/jobs/{id}/files/{name}`, `POST /api/jobs/{id}/validate`
(multipart reference raster), `POST /api/jobs/{id}/recalibrate` (JSON: mode, gcps, prior_p95_m).
Interactive docs at `/docs`.

## Tests

```bash
pnpm test            # engine: pytest (tiling, calibration, pipeline, API, SSE)
pnpm typecheck       # studio + desktop
pnpm lint            # tsc + ruff
```

## Evaluation

Run a scene, then validate against a reference raster (LiDAR DSM, photogrammetric DSM, or the
reference set from the problem statement). `metrics.json` reports raw and scale/offset-aligned
metrics; `error_map.png` shows signed error. Per-landscape metrics come from passing class masks to
`depthwizard.eval.metrics.compare`.

## Packaging notes

The Electron app runs the engine through `uv` on the developer machine. For a self-contained
installer, freeze the engine (PyInstaller: `depthwizard.cli:app`) into `engine/build/depthwizard`
and run `pnpm desktop:dist`; electron-builder copies it next to the app resources.
