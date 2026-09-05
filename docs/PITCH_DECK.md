# DepthWizard pitch deck brief (SIH 2026, PS 26175, ISRO)

This file is everything a designer needs to build the deck without reading any code. Every slide
below lists its exact title, the text to put on it, the visual it needs, the speaker line, and the
time it gets. Copy text verbatim; only the bracketed `[…]` fields need real numbers or names.

There are two decks:

1. **Idea deck** (6 slides): the official SIH idea-presentation format used at internal
   hackathons and for the online idea submission. Judges skim it in under two minutes.
2. **Grand Finale deck** (12 slides + live demo): the presentation for the finale jury, spoken in
   about 8 minutes with a 3-minute live demo and 5 minutes of questions.

Build the Idea deck first; the Finale deck reuses its material.

---

## 1. Canvas, grid and type

| Setting | Value |
|---|---|
| Slide size | 16:9, 13.333 in x 7.5 in (PowerPoint "Widescreen"), 1920 x 1080 px |
| Safe margins | 0.6 in on all sides; nothing but the footer goes outside it |
| Grid | 12 columns, 0.25 in gutter; text blocks span 6 to 8 columns, visuals 6 to 12 |
| Title | 36 pt, bold, one line, top-left, max 8 words |
| Body | 20 pt regular; 18 pt allowed only on the references slide; never below 16 pt |
| Bullets | max 5 per slide, max 12 words each, sentence case, no full stops |
| Words per slide | 40 to 70 (title excluded); a slide over 80 words gets split |
| Footer | 11 pt, right-aligned: `DepthWizard · SIH 2026 · PS 26175` and slide number |
| Headline face | Space Grotesk Bold (Google Fonts). Fallback: Segoe UI Bold / Helvetica Bold |
| Body face | Inter Regular (Google Fonts). Fallback: Segoe UI / Arial |
| Numbers | Inter with tabular figures (PowerPoint: Font > Advanced > Number spacing: Tabular) |

**Colours** (dark deck; the product UI is dark, so screenshots blend in):

| Role | Hex | Use |
|---|---|---|
| Background | `#0B1016` | every slide |
| Panel | `#141B24` | boxes, table rows |
| Text | `#E8EDF2` | body |
| Muted text | `#93A1B1` | captions, footer |
| Accent | `#22D3EE` (cyan) | one highlight per slide, arrows, the active step |
| Warm | `#F5A524` (amber) | numbers that matter, "metric DSM" |
| Danger | `#F26D6D` | only for the "without DepthWizard" contrast |

Rules the winning decks follow:

- One idea per slide, stated in the title as a claim, not a topic ("Heights from a single image
  in 12 seconds", not "Technical approach").
- Every slide has one visual that carries the point; text explains the visual, never repeats it.
- Real screenshots of the running product beat diagrams; diagrams beat stock icons; never clip art.
- Numbers are shown large, with their source in a caption ("RMSE 1.9 m on Potsdam tile 7").
- Read the problem statement's own words back to the jury: rDSM, metric DSM, SRTM, GCP,
  first-person flythrough, standalone deployment. Judges check boxes.
- No animation except a single appear-on-click on the pipeline slide. No transitions.
- Dark background, high-contrast text, 4.5:1 minimum. Check with the PowerPoint accessibility tool.
- Export a PDF as well; venues often lose fonts.

Assets to take from the product (all produced by the app, drop them in `docs/deck-assets/`):

- `hero.png`: the 3D viewer in Presentation mode, camera low over the urban sample, sun raking.
- `analysis.png`: the same scene in Analysis mode with the height probe open, showing a value.
- `pipeline.svg`: three-box pipeline drawn in the deck's colours (specification in slide 3).
- `preview.png`: the hillshaded DSM preview the engine writes for every job.
- `error_map.png`: validation error map from a run against a reference DSM.
- `metrics.png`: the validation panel showing RMSE / MAE / r.
- Team photo, institute logo, ISRO and SIH logos (official versions only).

---

## 2. Idea deck (6 slides, SIH template order)

The SIH idea template fixes the order and the headings. Keep its headings as small muted labels
(14 pt, top-left, e.g. "Proposed solution") and put our claim as the real title under them.

### Slide 1: Title

- Template label: none
- Title: **DepthWizard**
- Subtitle (24 pt): Single-image satellite height estimation and 3D flythrough
- Line 3 (18 pt, muted): Problem Statement 26175 · Indian Space Research Organisation · Theme: Disaster Management · Category: Software
- Bottom-left block (18 pt): Team `[name]` · `[institute]` · Leader `[name]` · Members `[6 names]` · Mentor `[name]`
- Visual: `hero.png` full-bleed on the right 7 columns with a soft dark gradient on its left edge so the text stays readable.
- Speaker (10 s): "We turn one ordinary satellite picture into a height map you can fly through."

### Slide 2: Proposed solution

- Template label: Proposed solution
- Title: **One optical image in, a metric surface model and a flythrough out**
- Body (left 5 columns):
  - Upload a PNG, JPG or GeoTIFF; nothing else is needed
  - A monocular depth foundation model recovers structure from a single view
  - GeoTIFF inputs are calibrated to metres with SRTM-class terrain or ground control points
  - PNG and JPG inputs give a relative DSM, ready for GCP calibration
  - Outputs: GeoTIFF DSM, 16-bit heightmap, textured 3D mesh, accuracy report
- Visual (right 7 columns): three thumbnails in a row with arrows: source image → `preview.png` → `hero.png`. Captions: "Input", "DSM", "Flythrough".
- Speaker (30 s): the problem sentence (stereo, LiDAR and InSAR are expensive and sensor-bound), then the one-line answer.

### Slide 3: Technical approach

- Template label: Technical approach
- Title: **Three stages, each one measurable**
- Visual (full width, top half): pipeline diagram, three boxes with the accent colour on the box borders and the stage number inside a small circle:
  1. **Elevation extraction**: Depth Anything V2 (ViT), tiled inference with global alignment and blended overlaps
  2. **Scale calibration**: robust ground-trend fit against SRTM-class DEM, RANSAC affine, GCP refit, scene priors
  3. **Visualisation**: GeoTIFF read in the browser, exact-height terrain mesh, Presentation and Analysis modes
  Under the boxes, one line of technology each: `PyTorch · transformers · rasterio` / `NumPy · SciPy · scikit-learn` / `React · three.js · Electron`.
- Body (bottom half, two columns of 3 bullets):
  - Tiles are aligned to one low-resolution pass, so large scenes stay globally consistent
  - Terrain trend comes from the DEM, structure from the model; the two are fused, not averaged
  - A 1-point GCP fixes the offset, 2 or more fix scale and offset, also for PNG inputs
  - Every height shown in the viewer is read from the DSM array, not from the rendered mesh
  - Runs on CPU, Apple GPU or CUDA; a 2500 x 2500 scene takes `[N]` s on `[hardware]`
  - Packaged as an Electron desktop app and as Docker images; no cloud dependency
- Speaker (60 s): walk the three boxes, one sentence each, then the "fused, not averaged" line.

### Slide 4: Feasibility and viability

- Template label: Feasibility and viability
- Title: **Built and running on open data and commodity hardware**
- Left column, heading "What already works" (5 bullets):
  - End-to-end pipeline runs on the reference dataset and on open drone imagery
  - Metric DSM from GeoTIFF with SRTM-class terrain in one click
  - Validation against any reference raster: RMSE, MAE, bias, NMAD, Pearson r
  - Desktop app launches the engine and the viewer with no setup
  - `[N]` automated tests cover tiling, calibration, API and exports
- Right column, heading "Risks and how we handle them" (table, 3 rows, 2 columns):
  | Risk | Mitigation |
  | Nadir imagery differs from the model's training data | Tiled inference with global alignment; optional fine-tuned decoder weights on aerial DSM sets |
  | Relative depth has no scale | DEM ground-trend fit with prior fallback; GCPs override everything |
  | Large scenes and weak machines | Tiling, on-disk caching, CPU fallback, mesh resolution cap |
- Visual: `metrics.png` small in the lower right, captioned "Validation panel on `[dataset]`".
- Speaker (45 s): lead with "this is not a plan, it runs today", then the risk table.

### Slide 5: Impact and benefits

- Template label: Impact and benefits
- Title: **Elevation in hours after any satellite pass, not weeks**
- Body (4 bullets, left 6 columns):
  - Disaster response: flood extent, landslide slopes and damage from the first clear image
  - Cost: no stereo tasking, LiDAR flight or InSAR processing for a first elevation product
  - Planning and reconnaissance: building heights, slopes and viewpoints from routine imagery
  - Access: drag-and-drop desktop or browser tool usable by non-specialists
- Visual (right 6 columns): `analysis.png` with the flood-level tool active, caption "Flood level at `[value]` m on the `[scene]` scene".
- Speaker (30 s): one concrete scenario (a cyclone-hit coastal town, first cloud-free pass, height map by the afternoon).

### Slide 6: Research and references

- Template label: Research and references
- Title: **Standing on published work and open data**
- Body (18 pt, two columns, no bullets, one reference per line):
  - Yang et al., Depth Anything V2, NeurIPS 2024
  - Ranftl et al., Vision Transformers for Dense Prediction (DPT), ICCV 2021
  - Ranftl et al., MiDaS: Towards Robust Monocular Depth Estimation, TPAMI 2022
  - ISRO reference dataset: github.com/IMG-PROCESS-SAC/SIH2026
  - IEEE GRSS Data Fusion Contest 2018 / 2019 (aerial RGB with DSM)
  - ISPRS Vaihingen and Potsdam benchmarks
  - NASA / USGS SRTM 30 m; Copernicus GLO-30; AWS Terrain Tiles
  - OpenAerialMap open drone imagery
  - three.js and react-three-fiber documentation
- Visual: none; keep it quiet. Small `[institute]` and SIH logos bottom-right.
- Speaker (10 s): "Everything we build on is public and cited."

---

## 3. Grand Finale deck (12 slides + demo)

Time plan: 8 minutes speaking, 3 minutes demo, 5 minutes questions. Speaker times below add up
to 8 minutes. Slides 1 to 6 of the Idea deck are reused where noted.

| # | Title (exact) | Visual | Time |
|---|---|---|---|
| 1 | DepthWizard | Idea slide 1 | 0:10 |
| 2 | Elevation data is expensive, slow and sensor-bound | Three photos: stereo satellite, LiDAR aircraft, InSAR pair, each with its cost or lead time under it in amber | 0:35 |
| 3 | One optical image in, a metric surface model and a flythrough out | Idea slide 2 | 0:35 |
| 4 | Live: from upload to flythrough | Screenshot of the upload screen with the job progressing; this is where the live demo starts | 3:00 demo |
| 5 | Three stages, each one measurable | Idea slide 3 | 1:00 |
| 6 | Relative depth becomes metres with terrain we already have | Diagram: DEM (smooth) + model structure (sharp) = DSM; small equation `DSM = DEM + a · structure` in amber; GCP inset "1 point fixes offset, 2 fix scale" | 0:45 |
| 7 | Accuracy on `[dataset]`: RMSE `[x]` m, MAE `[y]` m, r `[z]` | Table of raw vs aligned metrics for 3 or 4 scenes (urban, sparse, hilly, forested) and `error_map.png`; every number from `metrics.json` | 1:00 |
| 8 | Every height you read is the DSM, not the render | `analysis.png`; callouts: "probe reads the array", "exaggeration locked at 1.0 in Analysis", "wireframe shows exact vertices" | 0:35 |
| 9 | Presentation mode makes the same data legible | `hero.png` next to `analysis.png`, the toggle circled; caption "same geometry, different lighting" | 0:25 |
| 10 | Ships as a desktop app and as containers | Screenshot of the Electron app window with the macOS/Windows/Linux icons and `docker compose up` in a small code box | 0:25 |
| 11 | Elevation in hours after any satellite pass, not weeks | Idea slide 5 | 0:30 |
| 12 | What we would do with three more months | 4 bullets: fine-tuned decoder on aerial DSM sets; semantic priors (roads and water flat); uncertainty maps per pixel; batch mode for whole scenes | 0:20 |
| 13 | Thank you, questions | Team photo, GitHub link, QR code to the repo | — |

Slide 7 is the slide the jury remembers: 50% of the score is accuracy. Put the metric numbers at
54 pt amber, the dataset name and tile id at 14 pt muted right under them. If a landscape class is
weak, show it anyway and say why; hiding it costs more than showing it.

### Live demo script (3 minutes, slide 4 on screen behind the app)

1. Drag `oam_urban.tif` onto the upload area. Say the file has a CRS, so we will get metres.
2. While it runs (under 30 s), point at the stage indicator: model, terrain fetch, calibration, export.
3. When it opens in Presentation mode, fly once around a building with the mouse and WASD. Say "same mesh you are about to measure".
4. Press the mode toggle. Click a roof: read the height and the source label ("metric DSM, hybrid calibration").
5. Open the profile tool, draw a line across a street, show the cross-section.
6. Open Validate, drop the reference raster, read RMSE and r out loud.
7. Click Export, show the GeoTIFF and GLB in the file list.

Have the result pre-computed on a second job in case the network or the model is slow; switch
to it without comment.

### Questions the jury asks and the answers

- "Why not fine-tune the whole model?" We fuse a foundation model with terrain data so the method works on scenes it has never seen; fine-tuned decoder weights are a drop-in option (`DW_FINETUNED`).
- "How does it behave without SRTM?" Scene-prior scaling with the offset reported as unknown; one GCP fixes the offset.
- "What about forests where SRTM is smooth?" The DEM sets the trend, the model adds the canopy structure; we report per-class metrics so the jury sees the forest number separately.
- "Is the 3D view exaggerated?" The exaggeration multiplier is always on screen, defaults to 1.0 and is locked in Analysis mode.
- "Can it run offline?" Yes for PNG/JPG and for GeoTIFF with a cached DEM; the model weights are cached after the first run.

---

## 4. Checklist before sending the deck

- Fonts embedded (PowerPoint: File > Options > Save > Embed fonts) and a PDF exported
- Every `[…]` replaced with a real value, and every number traceable to a `metrics.json` or `meta.json`
- Every screenshot from the current build, 1920 x 1080, no browser chrome
- Slide titles read as claims; no slide over 80 words; nothing below 16 pt except the footer
- Problem-statement vocabulary present: rDSM, DSM, SRTM, GCP, first-person flythrough, standalone
- Team, institute, mentor and PS ID on slide 1; logos are official files, not screenshots
- Contrast checked on a projector-like setting (turn screen brightness down and read it from 3 m)
