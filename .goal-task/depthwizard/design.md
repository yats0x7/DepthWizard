# DepthWizard - design decisions (rebuild, 2026-09-05)

## Layout (pnpm workspace + uv)
- `engine/` Python 3.13 package `depthwizard` (uv, hatchling). FastAPI API + Typer CLI. Data lives
  in `<repo>/data` (samples, jobs, dem_cache), overridable with `DW_DATA_DIR`.
- `apps/studio/` Vite + React 19 + TypeScript + Tailwind 4 + react-three-fiber 9 + drei 10 +
  @react-three/postprocessing + zustand + geotiff.js + three-mesh-bvh + recharts + motion + radix-ui.
- `apps/desktop/` Electron 38 (TypeScript main + preload, electron-builder). Spawns
  `uv run depthwizard serve` on a free port, waits for `/api/health`, loads the studio the engine
  serves from `apps/studio/dist`. `DW_DEV_URL` loads the Vite server instead. `DW_SCREENSHOT` /
  `DW_OPEN_JOB` capture the window for headless verification.
- `docker/engine.Dockerfile` builds the studio (node stage) and the engine (python stage) into one
  image; `docker-compose.yml` at the root.

## Pipeline
1. `raster.io.load_image`: PNG/JPG via Pillow, GeoTIFF via rasterio, downscale above `max_dim`.
2. `depth.backbone.DepthAnythingBackbone`: HF Depth Anything V2 presets small/base/large, fp16 on
   CUDA, flip TTA, tiled inference (`depth.tiling`) aligned to one global pass.
3. `calibrate.fit`: `ground_trend` (asymmetric Gaussian smoothing on a coarse grid, unbiased on
   slopes, ignores objects above ground), `clip_structure`, RANSAC affine trend-vs-DEM, modes
   hybrid / affine / prior, `apply_gcps` (1 = offset, 2+ = scale+offset).
4. `calibrate.dem`: cached fetch; `terrarium` (AWS Terrain Tiles, seconds) default, dem-stitcher
   sources optional.
5. `mesh.glb`: textured GLB, X east / Y up / Z south, centred, metres.
6. `analysis.terrain`: slope/aspect, histogram, surface statistics in meta.json.
7. `eval.metrics`: raw + aligned RMSE/MAE/bias/NMAD/r/p90/within-1m/3m, per-class, error map.
8. `pipeline.run/recalibrate/validate` with stage progress callbacks and cancellation.
9. `api`: JobManager (one worker, status.json, SSE event stream), samples and from-path endpoints
   for the desktop app, static studio serving.

## Studio
- One `Viewer` canvas; `Terrain` builds a regular grid of exact DSM samples (`meshDetail` sets the
  stride, never averaging), full-resolution float height texture for the fragment layers.
- `TerrainMaterial`: stock MeshStandardMaterial (Presentation) or MeshBasicMaterial (Analysis)
  extended with onBeforeCompile: hypsometric (turbo), slope (viridis), aspect (hue), hillshade,
  contours (minor/major), flood tint, analytic hillshade for Analysis. Colour only.
- Picking: coarse proxy grid with a three-mesh-bvh tree; hit gives x/z, every readout samples the
  DSM array bilinearly (`lib/terrain.sampleHeight`). In fly/walk the crosshair ray-marches the DSM.
- `CameraRig`: orbit (drei OrbitControls), fly and walk (pointer lock, WASD/QE, momentum, damped
  look, eye height clamped to the DSM, head-bob in Presentation only), eased viewpoint transitions,
  telemetry for the HUD. Tight near/far from scene size, no logarithmic depth buffer.
- `Atmosphere`: drei Sky sized below the far plane, warm low sun default, directional shadow map,
  hemisphere fill, fog matched to the horizon colour. Analysis: flat backdrop, no fog.
- `Effects` (Presentation only): N8AO, bloom, ACES tone mapping, vignette, SMAA.
- HUD: mode switch (Tab), exaggeration readout always visible (locked ×1.00 in Analysis),
  crosshair, compass + altitude, minimap from preview.png with view cone, height readout with source.
- Inspector: View / Analyse / Validate / Data panels. Sidebar: dropzone with run options, samples,
  live job list (SSE). Landing with stage stepper for running jobs.

## Invariants
- Geometry is sacred: vertex positions are DSM samples in both modes; exaggeration is a visible
  slider (default 1.0, locked in Analysis) applied as a group scale; no vertex-shader displacement.
- Output GeoTIFF Float32, nodata −9999, CRS/transform copied from input; relative DSM for
  ungeoreferenced input written as `rdsm.tif` plus 16-bit PNG.
- Never commit weights, job data, samples, node_modules or dist.

## Phase 2 decisions (2026-09-06)

### Imagery sources: what we may process
Only sources whose licence permits downloading and deriving products are used as pixels:
Sentinel-2 L2A through Earth Search (open, attribute "Contains modified Copernicus Sentinel data"),
OpenAerialMap (CC-BY 4.0, attribute the provider), and optionally ISRO Bhoonidhi open collections.
Google Maps and Earth tiles, Esri World Imagery and Mapbox Satellite are excluded: their terms bar
storing tiles, image analysis and derived 3D models, which is exactly what this product does. Any of
them may still appear as a display-only basemap. Attribution travels with the job into `meta.json`
and the job card.

### Fetch shape
Search returns candidates ranked sharpest first with coverage of the requested box; fetch reads only
the requested window from the remote cloud-optimised GeoTIFF rather than whole scenes, and writes a
local GeoTIFF in the source CRS. The existing pipeline is unchanged: a fetched area is an ordinary
georeferenced input.

### Benchmark: real reference only
Accuracy claims use independent height data, never the DEM the calibration itself consumed, because
that would be circular. Primary references are AHN (Netherlands, open LiDAR DSM) and USGS 3DEP
(United States LiDAR), each paired with high-resolution open imagery of the same footprint. Indian
scenes are included for relevance and are reported with whatever reference is genuinely available,
labelled as such. Every scene records its landscape class so the per-class table the evaluation
criteria ask for falls out of the existing `compare(..., classes=...)` path. Benchmark inputs stay
out of git; the manifest, results table and error maps are committed.

### Semantic priors
Added as a fourth calibration route beside hybrid, affine and prior, matching the wording of the
problem statement's scale-calibration milestone. Flat classes such as water and road surfaces are
pinned to a local ground plane so the structural scale is fitted against genuine relief rather than
texture noise. It is opt-in, never the default, and its measured effect on the benchmark is recorded
whether it helps or not.

### Additive-only invariant
Phase 1 behaviour, output file names, API response shapes and viewer semantics do not change. The
Phase 1 test suite passing unchanged is the regression proof; new behaviour arrives behind new
endpoints, new options defaulting to today's behaviour, and new UI surfaces.
