# DepthWizard TODO

## Phase 1 - scaffold
- [x] backend pyproject, package skeleton, config
- [x] frontend Vite scaffold with deps

## Phase 2 - backend pipeline
- [x] io: load PNG/JPG/GeoTIFF, write GeoTIFF/PNG
- [x] depth: HF Depth Anything V2 backbone, tiling, device auto
- [x] calibrate: relative height, SRTM fetch, RANSAC fit, GCP, priors
- [x] mesh: GLB export
- [x] eval: metrics
- [x] tests (synthetic rasters, backbone mocked)

## Phase 3 - API + CLI
- [x] FastAPI: POST /jobs, GET /jobs/{id}, GET files, POST /jobs/{id}/validate
- [x] Typer CLI: `depthwizard run image.tif --out dir`

## Phase 4 - frontend
- [x] upload + job status
- [x] viewer: geotiff -> martini mesh -> textured terrain
- [x] first-person controls, probe, slope, flood, profile, validation panel

## Phase 5 - packaging + docs
- [x] Dockerfiles + compose
- [ ] Electron desktop app (main process spawns API, loads UI, electron-builder config) replacing the Tauri draft
- [x] README

## Phase 6 - review
- [ ] 3 independent reviewers, fix findings, final commit

## Phase 5b - real-data verification
- [x] run real model on Landsat GeoTIFF (found and fixed calibration outliers)
- [ ] run real model on the urban aerial crop (data/samples/oam_urban.tif)
- [ ] drive the web app in the browser and fix UX issues
