# DepthWizard TODO

## Phase 1 - shipped
- [x] engine: raster IO, tiled inference, calibration, DEM cache, GLB, analysis, metrics, pipeline
- [x] api: jobs, SSE progress, samples, validate, recalibrate, files; CLI incl. prefetch
- [x] studio: Presentation/Analysis modes, cameras, layers, tools, panels, HUD
- [x] desktop Electron app, Docker image, README, pitch-deck brief
- [x] 3 independent reviews and fixes; 33 tests green; pushed to main

## Phase 2 - accuracy evidence (gate 1)
- [x] `data/benchmark/manifest.json`: scene id, bbox, imagery source + URL, reference source + URL,
      landscape class, licence, expected GSD
- [x] `engine/depthwizard/benchmark/` : fetch imagery + reference pair, run pipeline, validate,
      collect one row per scene; resumable, cached, never re-downloads
- [x] reference adapters: AHN WCS (Netherlands, 0.5 m LiDAR DSM), USGS 3DEP ImageServer (US LiDAR),
      plain local GeoTIFF for anything downloaded by hand
- [x] matching imagery: PDOK 8 cm aerial for AHN scenes, NAIP for 3DEP scenes, OpenAerialMap and
      Sentinel-2 elsewhere
- [x] at least 2 scenes per class: urban, sparse, hilly, forested
- [x] `depthwizard benchmark run` and `depthwizard benchmark report` commands
- [x] `docs/BENCHMARK.md`: per-scene and per-class table, method, licences, error maps, honest
      commentary on where it fails
- [x] feed the real numbers into `docs/PITCH_DECK.md` slide 7 and the README

## Phase 2 - semantic priors (gate 2)
- [x] segmentation of flat surfaces (water, roads, bare ground) from the RGB, no new heavy model
      unless a small one is justified; record the choice in design.md
- [x] constraint in `calibrate/fit.py` as a fourth route: flat classes pinned to a local ground
      plane, buildings kept above it; off by default, opt-in per job
- [x] unit tests on synthetic scenes; A/B on the benchmark, result recorded either way
- [x] expose as a run option in API, CLI and the studio run-options form

## Phase 2 - map-pick imagery (gate 3)
- [x] `engine/depthwizard/imagery/sources.py`: OpenAerialMap + Sentinel-2 search, windowed fetch
      to a georeferenced GeoTIFF, attribution captured
- [x] `POST /api/imagery/search` and `POST /api/jobs/from-area`, with a fetch stage in the pipeline
- [x] offline tests with recorded responses; no network in the test suite
- [x] studio Map tab: MapLibre + OpenFreeMap basemap, Photon place search, pasted coordinates,
      draggable box with area and expected-GSD readout, source list with thumbnails and dates
- [x] attribution and licence shown on the job card and in `meta.json`
- [ ] optional: ISRO Bhoonidhi source behind a user login, if the API proves workable

## Phase 2 - close out (gates 4, 5)
- [x] engine tests green (42) at the time of this commit
- [x] full regression: engine tests, typecheck, lint, three sample scenes re-run and compared
- [x] 3 independent reviewers, fix findings
- [x] README + pitch deck updated, local implementation commits made

## Phase 3 - judging edge (from SIH differentiation advice)
- [ ] `docs/PITCH_DECK.md`: add a "What Makes This Different?" slide in the form
      existing solution -> specific limitation -> our approach, sourced from
      `docs/OPEN_SOURCE_LANDSCAPE.md` section 8 (rival SIH repos) and section 10 (uncovered gaps)
- [ ] cite external sources for the cost and lead-time claim behind stereo, LiDAR and InSAR, so the
      problem framing rests on published figures rather than assertion
- [ ] raise benchmark resolution: add scenes with sub-metre imagery so the accuracy table is not
      bounded by Sentinel-2's 10 m pixels
