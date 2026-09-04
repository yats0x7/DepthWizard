# DepthWizard TODO

## Phase 1 - scaffold
- [ ] backend pyproject, package skeleton, config
- [ ] frontend Vite scaffold with deps

## Phase 2 - backend pipeline
- [ ] io: load PNG/JPG/GeoTIFF, write GeoTIFF/PNG
- [ ] depth: HF Depth Anything V2 backbone, tiling, device auto
- [ ] calibrate: relative height, SRTM fetch, RANSAC fit, GCP, priors
- [ ] mesh: GLB export
- [ ] eval: metrics
- [ ] tests (synthetic rasters, backbone mocked)

## Phase 3 - API + CLI
- [ ] FastAPI: POST /jobs, GET /jobs/{id}, GET files, POST /jobs/{id}/validate
- [ ] Typer CLI: `depthwizard run image.tif --out dir`

## Phase 4 - frontend
- [ ] upload + job status
- [ ] viewer: geotiff -> martini mesh -> textured terrain
- [ ] first-person controls, probe, slope, flood, profile, validation panel

## Phase 5 - packaging + docs
- [ ] Dockerfiles + compose
- [ ] Tauri desktop config
- [ ] README

## Phase 6 - review
- [ ] 3 independent reviewers, fix findings, final commit
