# DepthWizard - design decisions

## Layout (monorepo)
- `backend/` Python 3.12 package `depthwizard` managed with uv. FastAPI API + Typer CLI.
- `frontend/` Vite + React 19 + TypeScript + Tailwind + react-three-fiber + drei + zustand + geotiff.js + @mapbox/martini.
- `desktop/` Tauri config wrapping the built frontend and spawning the backend.
- `docker/` Dockerfiles and compose.

## Pipeline
1. `io.load`: PIL/rasterio read; detect georeferencing (CRS + non-identity transform).
2. `depth.DepthAnythingBackbone`: HF transformers `depth-anything/Depth-Anything-V2-{Small,Base}-hf`, device auto (cuda > mps > cpu), tiled inference with overlap and cosine-window blending, optional fine-tuned weights path (`DW_FINETUNED`).
3. `calibrate`: relative depth -> relative height (invert, normalise). Georeferenced: fetch SRTM via `dem-stitcher`, downsample prediction to DEM grid, RANSAC affine fit (scale, offset) to metric elevation, optional GCP CSV refit, optional flat-surface priors mask. Output DSM = fitted surface.
4. `mesh`: heightfield -> indexed triangle mesh with UVs, texture = source image, export GLB via trimesh.
5. `eval`: RMSE, MAE, Pearson r, per-mask breakdown against a reference raster resampled with rasterio.
6. `api`: background jobs in-process (ThreadPool), results on disk under `data/jobs/<id>/`.

## Frontend
- Viewer loads `dsm.tif` with geotiff.js, builds mesh via martini (error-controlled LOD), drapes `texture.jpg`.
- Controls: orbit (default) and first-person (PointerLock, WASD + mouse, shift to sprint, Q/E vertical).
- Tools: height probe (raycast), slope shading toggle, flood level slider (water plane), cross-section profile (two clicks -> chart), validation panel (upload reference -> metrics), vertical exaggeration.
- State in zustand; API client with fetch; dark UI with Tailwind.

## Invariants
- Output GeoTIFF: Float32, nodata = -9999, CRS and transform copied from input; relative DSM for non-georeferenced input written as plain TIFF + 16-bit PNG.
- Never commit weights, job data, or node_modules.
