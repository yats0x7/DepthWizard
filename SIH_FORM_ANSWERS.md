# SIH 2026 Idea Submission - Draft Answers

Copy-paste ready answers for the standard SIH idea-submission fields. Fill in team details at the bottom before submitting.

---

## Problem Statement ID
26175

## Problem Statement Title
DepthWizard - Single-View Height Estimation and 3D Flythrough

## Organization
Indian Space Research Organisation (ISRO), Department of Space

## Category / Theme
Software / Disaster Management

## Idea Title
DepthWizard: Metric DSM generation from a single satellite image with an interactive 3D flythrough

---

## Idea / Approach (abstract, ~250 words)

DepthWizard converts a single optical RGB satellite image into a Digital Surface Model (DSM) and a navigable 3D scene, removing the need for stereo pairs, LiDAR, or InSAR. The pipeline has three stages.

1. **Elevation extraction.** A pre-trained monocular depth foundation model (Depth Anything V2 / DPT-style backbone) produces a relative depth map. We fine-tune the decoder on open aerial DSM datasets (DFC2018/2019, Vaihingen, Potsdam, and the ISRO reference set) with tiled inference and overlap blending to close the nadir-view domain gap and handle large scenes.

2. **Scale calibration.** For GeoTIFF inputs we read the CRS and footprint with rasterio, fetch the matching SRTM 30 m tile, and fit a robust affine mapping (RANSAC least squares, optionally piecewise per tile) from relative depth to metric elevation. Semantic priors from a lightweight segmentation head (roads and water are flat, buildings sit above ground) regularise the fit, and optional Ground Control Points override it. For PNG/JPG inputs with no metadata, a normalised relative DSM (rDSM) is produced directly. Output is a GeoTIFF DSM plus an accuracy report (RMSE, MAE, Pearson r) against any reference raster the user supplies.

3. **Visualisation.** A Three.js web application builds a displaced terrain mesh from the DSM, drapes the original image as a texture, and provides first-person flythrough (WASD + mouse), a height probe, slope shading, cross-section profiles, and side-by-side comparison with reference data. It runs in the browser and is also packaged as a standalone desktop app via Electron/Tauri.

---

## Technical Approach / Technology Stack

- **Depth backbone:** Depth Anything V2 (ViT-L) or DPT-Hybrid, PyTorch, fine-tuned on aerial DSM data.
- **Geospatial processing:** rasterio, GDAL, pyproj, NumPy, OpenCV; SRTM 30 m tiles via public mirrors; optional GCP CSV.
- **Scale calibration:** RANSAC affine / piecewise-linear fit, semantic priors from a SegFormer-lite head, guided filtering for edge-preserving smoothing.
- **Backend / API:** FastAPI serving upload, inference, calibration, and validation endpoints; CUDA where available, CPU fallback with tiled inference.
- **Frontend / 3D:** React + Three.js (react-three-fiber), displaced plane mesh with LOD, texture draping, first-person camera controls, height probe and slope tools.
- **Deployment:** Docker for the pipeline, Electron/Tauri build for a standalone desktop app, static web build for browser use.

---

## Feasibility and Viability

- Foundation depth models already deliver strong relative structure on aerial imagery zero-shot; fine-tuning on public aerial DSM sets is a well-established path and fits within the hackathon timeline on a single GPU.
- SRTM 30 m is globally and freely available, so absolute scaling works for any georeferenced input without extra data collection.
- Three.js terrain rendering from a heightmap plus texture is a mature technique, so the visualisation layer carries low technical risk.
- All components are open source and run on commodity hardware, keeping the solution deployable on laptops and field machines.

**Challenges and mitigations**
- Domain gap between egocentric and nadir imagery: mitigated by decoder fine-tuning on aerial DSMs and tiled inference.
- Scale ambiguity and relief inversion: mitigated by robust fitting against SRTM plus flat-surface semantic constraints.
- Large image sizes: mitigated by tiling with overlap blending and mesh level-of-detail in the viewer.
- Forest and dense urban canopies where SRTM smooths detail: mitigated by piecewise calibration and reporting per-region uncertainty.

---

## Impact and Benefits

- **Disaster management:** rapid flood-inundation, landslide, and damage assessment from any single satellite pass, hours instead of days after an event.
- **Cost:** eliminates dependence on stereo acquisitions, LiDAR flights, or InSAR processing for first-response elevation products.
- **Urban planning and defence:** building-height and slope analysis and reconnaissance flythroughs from routine optical imagery.
- **Accessibility:** a browser-based and standalone tool that non-specialists can use with a drag-and-drop upload.

---

## Research and References

- Depth Anything V2 (Yang et al., 2024), DPT / MiDaS (Ranftl et al., 2021).
- IMG-PROCESS-SAC/SIH2026 reference dataset: https://github.com/IMG-PROCESS-SAC/SIH2026/
- IEEE GRSS Data Fusion Contest 2018/2019 (aerial RGB + DSM), ISPRS Vaihingen and Potsdam.
- SRTM 30 m Global DEM (NASA/USGS).
- Three.js documentation on displacement-mapped terrain and first-person controls.

---

## Team Details (fill before submitting)

| Field | Value |
|---|---|
| Team name | |
| Team leader | |
| Team members (6, at least one female) | |
| College / Institute | |
| Mentor | |
| Contact email / phone | |
