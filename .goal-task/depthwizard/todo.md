# DepthWizard TODO (rebuild)

## Engine
- [x] package, config (presets, DEM sources), raster I/O, tiling, backbone (TTA, fp16)
- [x] calibration with robust ground trend, DEM cache + terrarium, GLB, analysis, metrics
- [x] pipeline with progress/cancel, JobManager with SSE, API (jobs, samples, from-path,
      validate, recalibrate, files), CLI
- [x] 19 tests green, ruff clean; real run on oam_urban.tif (metric DSM 21-49 m, 35 s on MPS)

## Studio
- [x] theme, API client, terrain math, store, UI primitives, HUD, panels, landing, jobs
- [x] viewer: terrain material layers, proxy picking, camera rig, atmosphere, effects
- [x] verify Presentation lighting/sky on a real GPU (Electron screenshot, own sky dome shader)
- [x] verify walk, probe, profile, flood, GCP recalibrate, validation, PNG path end to end
- [x] design pass at desktop + narrow widths (Impeccable craft floor)

## Desktop / packaging
- [x] Electron main + preload, screenshot mode, builder config
- [x] Electron smoke test (dev URL + built studio, 60 fps on Apple GPU)
- [x] Dockerfile + compose, README

## Docs / process
- [x] docs/PITCH_DECK.md
- [x] commit milestone, push to yats0x7/DepthWizard main
- [x] 3 independent reviews (correctness, design, security) and fixes: aspect convention, hillshade
      azimuth, RGB+NIR alpha, sea-level clamp, job delete/switch races, SSE end, traversal, CORS,
      desktop token for local paths, Electron sandbox/navigation guard, class-mask validation,
      legend, prior datum labelling, picking refinement, offline model message + prefetch
- [ ] final commit + push
