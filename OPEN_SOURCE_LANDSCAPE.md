# DepthWizard (SIH 26175) - Open-Source Landscape and Glue Plan

Research date: 2026-09-05. Sources: GitHub (search + REST metadata), Hugging Face API, the
"Awesome Monocular Height Estimation" list, the ISRO reference repo, and the Depth2Elevation paper.
Star counts and last-push dates are as of the research date.

## TL;DR - the recommended glue stack

| Milestone | Primary component | Backup / alternative |
|---|---|---|
| Elevation extraction | **Depth Anything V2** (Apache-2.0) fine-tuned on **GAMUS**, using the **depth-any-canopy** fine-tuning recipe | Depth Anything 3 Mono/Metric, Depth Pro, MoGe |
| Relative-to-absolute mapping | **RDAH-Net** (MIT, official code + checkpoints) as a learned depth-to-height head | HTC-DC Net, TSE-Net, own RANSAC affine fit |
| Absolute scale (GeoTIFF) | **SRTM 30 m** via `elevation` / `dem-stitcher`, coregistration with **xDEM** | Ground Control Points CSV |
| Semantic priors | **segment-geospatial** (SAM), **GlobalBuildingAtlas** heights, Microsoft building footprints | OpenEarthMap land-cover |
| Mesh + export | **trimesh** / **PyVista** to glTF/GLB, rasterio to GeoTIFF DSM | Open3D |
| Web 3D flythrough | **three.js** + **react-three-fiber**, **geotiff.js** for in-browser GeoTIFF, **martini** for RTIN LOD meshes | CesiumJS, Babylon.js DynamicTerrain |
| Standalone app | Electron or Tauri wrapper around the web viewer | Godot Terrain3D, Unity + cesium-unity |
| Validation | **xDEM** (coregistration, RMSE, MAE, slope), torchmetrics | own numpy metrics |

---

## 1. Monocular depth backbones (pre-trained, general purpose)

| Repo | Stars | License | Last push | Why it matters |
|---|---|---|---|---|
| [DepthAnything/Depth-Anything-V2](https://github.com/DepthAnything/Depth-Anything-V2) | 8.8k | Apache-2.0 | 2026-03 | Best-supported backbone. Has a `metric_depth` folder with fine-tuning code and metric checkpoints. HF weights: `depth-anything/Depth-Anything-V2-*-hf`. The problem statement explicitly asks for this class of model. |
| [ByteDance-Seed/Depth-Anything-3](https://github.com/ByteDance-Seed/Depth-Anything-3) | 6.3k | Apache-2.0 | 2026-07 | Newer. `DA3Mono-Large` predicts true depth (not disparity), `DA3Metric-Large` is metric. Ships a CLI, Gradio UI, and exports GLB/PLY directly, which is useful for a fast demo. |
| [apple/ml-depth-pro](https://github.com/apple/ml-depth-pro) | 5.7k | Apple (non-commercial-ish) | 2025-04 | Sharp metric depth in under a second. License needs checking before shipping. |
| [microsoft/MoGe](https://github.com/microsoft/MoGe) | 2.9k | MIT-style (check) | 2026-08 | Monocular geometry, outputs point maps. Good for mesh directly. |
| [YvanYin/Metric3D](https://github.com/YvanYin/Metric3D) | 2.3k | BSD-2 | 2025-03 | Zero-shot metric depth v2. |
| [lpiccinelli-eth/UniDepth](https://github.com/lpiccinelli-eth/UniDepth) | 1.3k | custom | 2025-05 | Universal metric depth. |
| [prs-eth/Marigold](https://github.com/prs-eth/Marigold) | 3.2k | Apache-2.0 | 2025-12 | Diffusion-based depth. Used by DSM_Diffusion for DSM generation. |
| [isl-org/MiDaS](https://github.com/isl-org/MiDaS), [isl-org/ZoeDepth](https://github.com/isl-org/ZoeDepth) | 5.4k / 2.8k | MIT | archived | Older baselines, both archived. Use only for comparison. |

Metric-outdoor checkpoints (`Depth-Anything-V2-Metric-Outdoor-*-hf`) are trained on driving scenes and will not be
metric on nadir imagery, so treat them as relative and calibrate anyway.

## 2. Remote-sensing height estimation (single view, with code)

| Repo | Stars | License | Last push | What to take |
|---|---|---|---|---|
| [Elenairene/RDAH-Net](https://github.com/Elenairene/RDAH-Net) | 2 | MIT | 2026-04 | **Closest match to the problem statement.** "Bridging Relative Depth and Absolute Height" (Remote Sensing 2026). Uses monocular depth as a prior and learns terrain-dependent absolute height. Official code, checkpoints and datasets on Figshare. Lightweight MobileNetV2 + CBAM, so it runs on a laptop GPU. |
| [DarthReca/depth-any-canopy](https://github.com/DarthReca/depth-any-canopy) | 26 | Apache-2.0 | 2025-05 | The cleanest **fine-tuning recipe for Depth Anything V2 on aerial height labels** (ECCV 2024 workshop). HF-transformers based (`AutoModelForDepthEstimation`), config-driven, trained for under 2 USD of compute. Swap canopy height for GAMUS nDSM and you have milestone 1. |
| [zhu-xlab/HTC-DC-Net](https://github.com/zhu-xlab/HTC-DC-Net) | 38 | none stated | 2025-04 | TGRS 2023 monocular nDSM network from TUM. Uses `_IMG.tif` / `_AGL.tif` / `_BLG.tif` data layout that matches DFC datasets. Good strong baseline for the accuracy table. Needs PyTorch3D. |
| [zhu-xlab/tse-net](https://github.com/zhu-xlab/tse-net) | 8 | none stated | 2025-10 | Semi-supervised height estimation (2025). Useful if labelled Indian imagery is scarce: train on GAMUS plus unlabelled ISRO tiles. Same data layout as HTC-DC. |
| [songtaowhu/HeightCLIP](https://github.com/songtaowhu/HeightCLIP) | 0 | none stated | 2026-05 | Vision-language height estimation, official implementation, README is minimal. |
| [Furkangultekin/FusedHE](https://github.com/Furkangultekin/FusedHE) | 7 | custom | 2026-01 | CNN + ViT fused encoder for satellite height (ICCVW 2025). |
| [ahmad-naghavi-ozu/IM2ELEVATION](https://github.com/ahmad-naghavi-ozu/IM2ELEVATION) | 1 | none stated | 2025-11 | Maintained re-implementation of IM2ELEVATION (SENet-154 encoder, gradient + normal loss). Weights and Dublin dataset links. |
| [facebookresearch/HighResCanopyHeight](https://github.com/facebookresearch/HighResCanopyHeight) | 364 | Apache-2.0 | 2025-04 | DINOv2 backbone pre-trained on 18M satellite images plus canopy-height head. Best option for the **forested** landscape case in the evaluation. |
| [nikhilmakkar/DSM_Diffusion](https://github.com/nikhilmakkar/DSM_Diffusion) | 1 | none | 2024-12 | Marigold conditioned to generate DSM from orthoimagery. Interesting alternative, low maturity. |
| [Panagiotou/ImageToDEM](https://github.com/Panagiotou/ImageToDEM) | 94 | MIT | 2021 | cGAN (pix2pix) from Sentinel-2 RGB to ALOS DEM, TF2. Includes a Google Earth Engine script that pairs DEMs with RGB, handy for building your own terrain dataset. Relative only. |
| [melhousni/DSMNet](https://github.com/melhousni/DSMNet), [mhaut/UIMG2DSM](https://github.com/mhaut/UIMG2DSM), [lauraset/BuildingHeightModel](https://github.com/lauraset/BuildingHeightModel) | 10 / 16 / 96 | mixed | 2020-2024 | Older CNN and GAN baselines. Reference only. |
| [AICyberTeam/DFC2023-baseline](https://github.com/AICyberTeam/DFC2023-baseline) | 87 | none | 2023 | IEEE DFC2023 Track 2: joint building extraction and height estimation baseline and data description. |

Research with no released code but worth reproducing:

- **Depth2Elevation** (IEEE TGRS 2025, DOI 10.1109/TGRS.2025.3564820). Scale modulation on top of Depth Anything.
  Reported on GAMUS at 1024 px: MAE 1.99 m, RMSE 3.49 m versus HTC-DC's MAE 2.67 m, RMSE 5.20 m. This is the
  accuracy bar to aim for, and the design (Depth Anything encoder + scale-modulation head) is what the glue stack
  above reproduces.
- **HeightFormer**, **LUMNet**, **Morphological-priors network**, listed in the awesome list without code.

Curated index: [osherr1996/awesome-monocular-height-estimation](https://github.com/osherr1996/awesome-monocular-height-estimation).

## 3. Scale calibration, DEM and GIS tooling

| Repo | Stars | License | Use |
|---|---|---|---|
| [GlacioHack/xdem](https://github.com/GlacioHack/xdem) | 215 | Apache-2.0 | DEM coregistration (Nuth and Kaab, ICP), vertical referencing, slope/aspect, uncertainty. Use it both to align predicted DSM to SRTM and to compute the evaluation metrics. |
| [GlacioHack/geoutils](https://github.com/GlacioHack/geoutils) | 130 | Apache-2.0 | Raster/vector helpers underneath xDEM. |
| [bopen/elevation](https://github.com/bopen/elevation) | 329 | Apache-2.0 | `eio clip --bounds ...` downloads and clips SRTM 30 m / 90 m. Needs GDAL CLI. |
| [ACCESS-Cloud-Based-InSAR/dem-stitcher](https://github.com/ACCESS-Cloud-Based-InSAR/dem-stitcher) | 63 | Apache-2.0 | Pure-Python SRTM / Copernicus / NASADEM tile download and merge, actively maintained. Better fit than `elevation` for a packaged app. |
| [tkrajina/srtm.py](https://github.com/tkrajina/srtm.py) | 263 | Apache-2.0 | Point elevation lookup from SRTM HGT files. |
| [rasterio/rasterio](https://github.com/rasterio/rasterio) | 2.6k | BSD | GeoTIFF I/O, CRS, affine transforms, writing the output DSM. |
| [r-barnes/richdem](https://github.com/r-barnes/richdem) | 324 | GPL-3.0 | Fast terrain attributes and depression filling. GPL, so keep it optional. |
| [opengeos/segment-geospatial](https://github.com/opengeos/segment-geospatial) | 4.1k | MIT | SAM on geospatial rasters. Use to get road, water and roof masks as flat-surface priors for the calibration fit. |
| [opengeos/geoai](https://github.com/opengeos/geoai) | 3.3k | MIT | Higher-level geospatial AI helpers, building footprint extraction. |
| [zhu-xlab/GlobalBuildingAtlas](https://github.com/zhu-xlab/GlobalBuildingAtlas) | 2.2k | ODbL / CC-BY-NC | Global building polygons, heights and LoD1 models (GBA.Height raster). Use as sparse pseudo Ground Control Points for building heights in Indian cities. Non-commercial licence on the height part. |
| [microsoft/GlobalMLBuildingFootprints](https://github.com/microsoft/GlobalMLBuildingFootprints) | 1.9k | ODbL | Footprints for India, usable as building masks. |

## 4. Datasets

| Dataset | Where | Notes |
|---|---|---|
| **GAMUS** (recommended by ISRO) | [huggingface.co/datasets/earthflow/GAMUS](https://huggingface.co/datasets/earthflow/GAMUS), CC-BY-4.0 | RGB + nDSM + semantic labels from DFC2019 US3D. PyTorch loader in [EarthNets/RSI-MMSegmentation](https://github.com/EarthNets/RSI-MMSegmentation). Also `earthflow/EarthNets_GAMUS`. |
| DFC2019 (US3D) | IEEE DataPort | Source of GAMUS. Satellite RGB with LiDAR-derived DSM. |
| DFC2023 Track 2 | IEEE DataPort / CodaLab | 17 cities, optical + SAR + nDSM. TSE-Net configs target it. |
| ISPRS Vaihingen / Potsdam | ISPRS | Aerial RGB(IR) + DSM. One SIH team already validated on Potsdam. |
| Depth Any Canopy / NEON | via the repo | Canopy height labels for the forest case. |
| SRTM 30 m, Copernicus DEM 30 m, NASADEM | AWS Open Data | Coarse absolute elevation for scaling. |
| GBA.Height | mediaTUM | Global 3 m building-height raster. |
| Depth Anything pretrained weights | HF `depth-anything/*` | Relative and metric checkpoints. |

## 5. 3D visualisation and flythrough

Web (three.js family):

| Repo | Stars | License | Use |
|---|---|---|---|
| [mrdoob/three.js](https://github.com/mrdoob/three.js) | 115k | MIT | Core renderer. `PointerLockControls` / `FirstPersonControls` give WASD + mouse flythrough out of the box. |
| [pmndrs/react-three-fiber](https://github.com/pmndrs/react-three-fiber) | 32k | MIT | React binding; pairs with drei for controls, sky, GLB loading. |
| [geotiffjs/geotiff.js](https://github.com/geotiffjs/geotiff.js) | 1.0k | MIT | Read the DSM GeoTIFF directly in the browser, no server round trip for visualisation. |
| [mapbox/martini](https://github.com/mapbox/martini) | 656 | ISC | Real-time RTIN mesh from a heightmap with error-controlled LOD. Exactly what a large DSM needs to stay at 60 fps. |
| [do-me/threejs-dem-viewer](https://github.com/do-me/threejs-dem-viewer) | 0 | MIT | Tiny upload-a-heightmap viewer with texture drape and wireframe. Good starting scaffold. |
| [Luis-avalos1/geospatial-terrain-importer](https://github.com/Luis-avalos1/geospatial-terrain-importer) | 0 | MIT | GeoTIFF upload, hillshade, elevation colormap, LOD stepping, vertical exaggeration, sun control in a three.js showcase, plus a C++/Qt desktop engine. Feature checklist to copy. |
| [w3reality/three-geo](https://github.com/w3reality/three-geo) | 1.4k | MIT | Satellite-textured terrain from Mapbox RGB DEM tiles, laser-pointer measurement and distance tools. Reuse the measurement UX; the tile source is Mapbox. |
| [tentone/geo-three](https://github.com/tentone/geo-three) | 950 | MIT | Tiled map providers in three.js, useful for a basemap around the uploaded scene. |
| [kenjinp/hello-terrain](https://github.com/kenjinp/hello-terrain) | 41 | MIT | Real-time terrain engine for three.js / r3f, actively developed. |
| [IceCreamYou/THREE.Terrain](https://github.com/IceCreamYou/THREE.Terrain) | 892 | MIT | Heightmap-to-mesh utilities and materials. |
| [jonathanlurie/ThreejsDEM](https://github.com/jonathanlurie/ThreejsDEM) | 76 | MIT | Minimal SRTM to three.js mesh reference code. |
| [orabazu/threejs-dem-visualizer](https://github.com/orabazu/threejs-dem-visualizer) | 85 | MIT | ASTER + Landsat texture drape example (used by ImageToDEM). |
| [BrokenSource/DepthFlow](https://github.com/BrokenSource/DepthFlow) | 1.5k | AGPL-3.0 | Image + depth to parallax video. AGPL, so only for generating demo videos, not for shipping. |

Globe-scale and engine options:

| Repo | Stars | License | Use |
|---|---|---|---|
| [CesiumGS/cesium](https://github.com/CesiumGS/cesium) | 15.7k | Apache-2.0 | Georeferenced globe, quantized-mesh terrain, first-person camera. Heavier but shows the DSM in true geographic context. [cesium-terrain-builder](https://github.com/geo-data/cesium-terrain-builder) converts GeoTIFF to terrain tiles. |
| [NASA-AMMOS/3DTilesRendererJS](https://github.com/NASA-AMMOS/3DTilesRendererJS) | 2.5k | Apache-2.0 | 3D Tiles in three.js for very large scenes. |
| [visgl/deck.gl](https://github.com/visgl/deck.gl) | 14.6k | MIT | `TerrainLayer` drapes an image over a heightmap in a few lines. |
| [BabylonJS/Extensions](https://github.com/BabylonJS/Extensions) DynamicTerrain, [djzielin/babylonjs-mapping](https://github.com/djzielin/babylonjs-mapping) | 190 / 35 | mixed | Babylon.js path if the team prefers it. |
| [TokisanGames/Terrain3D](https://github.com/TokisanGames/Terrain3D) | 4.2k | MIT | Godot 4 terrain; native standalone executables for Windows/Linux/macOS. |
| [CesiumGS/cesium-unity](https://github.com/CesiumGS/cesium-unity) | 534 | Apache-2.0 | Unity route with georeferencing. |
| [minorua/Qgis2threejs](https://github.com/minorua/Qgis2threejs) | 601 | GPL-3.0 | QGIS plugin that exports DEM + image to a three.js web scene and glTF. Use as a validation tool and a reference for the export format. |
| [domlysz/BlenderGIS](https://github.com/domlysz/BlenderGIS) | 9.3k | GPL-3.0 | Import GeoTIFF DSM into Blender for renders and videos. |

## 6. Mesh generation and export (Python side)

| Repo | Stars | License | Use |
|---|---|---|---|
| [mikedh/trimesh](https://github.com/mikedh/trimesh) | 3.7k | MIT | Heightfield to indexed mesh, UV texture, export GLB/OBJ/PLY. |
| [pyvista/pyvista](https://github.com/pyvista/pyvista) | 3.8k | MIT | `StructuredGrid` from DSM, decimation, quick desktop preview. |
| [isl-org/Open3D](https://github.com/isl-org/Open3D) | 13.9k | MIT | Point cloud and mesh processing, Poisson reconstruction. |
| [hssnadr/depth-pro-web](https://github.com/hssnadr/depth-pro-web) | 0 | none | Small script pipeline: Depth Pro to 16-bit displacement PNG and textured GLB for three.js. Direct template for the export step. |

## 7. Geospatial foundation-model toolkits (optional upgrade path)

| Repo | Stars | License | Use |
|---|---|---|---|
| [torchgeo/torchgeo](https://github.com/torchgeo/torchgeo) | 4.2k | MIT | Datasets, samplers and pretrained Earth-observation backbones. |
| [torchgeo/terratorch](https://github.com/torchgeo/terratorch) | 855 | Apache-2.0 | Fine-tune geospatial foundation models such as Prithvi with a config file; supports regression heads. |
| [NASA-IMPACT/Prithvi-EO-2.0](https://github.com/NASA-IMPACT/Prithvi-EO-2.0) | 305 | MIT | NASA/IBM EO foundation model. |
| HF `ibm-granite/granite-geospatial-canopyheight` | - | Apache-2.0 | Ready canopy-height model from IBM. |

## 8. Other SIH teams on the same problem statement (public repos)

These are public and show the competition's current level. Do not copy code, but note what they claim.

| Repo | State |
|---|---|
| [abxijth/Lorem-Ipsum-SIH26175](https://github.com/abxijth/Lorem-Ipsum-SIH26175) | Most advanced found. Depth Anything V2 Small fine-tuned on GAMUS, tiled inference, RANSAC calibration, GCP refit, SRTM baseline from the AWS skadi bucket, GeoTIFF export, validation harness with RMSE/MAE/Pearson. Backend only, no viewer yet. |
| [CodyRohith7/Depthwizard-SIH26175](https://github.com/CodyRohith7/Depthwizard-SIH26175) | Relative DSM only, hole-aware mesh, embedded three.js viewer with orbit and scripted flythrough, 68 tests. No metric calibration. |
| [Samir291833/DepthWizard](https://github.com/Samir291833/DepthWizard) | Depth Anything V2 Base pipeline validated on ISPRS Potsdam, GLB export with texture, FastAPI planned. |
| About 15 more `DepthWizard` / `SIH26175` repos | Mostly empty or landing pages. |

Takeaway: nobody found has both a calibrated metric DSM and a real first-person flythrough with validation UI.
Doing both well, plus the differentiators below, is the winning gap.

## 9. Proposed glue architecture

```
input (PNG/JPG/GeoTIFF)
  -> rasterio: read CRS, transform, bounds (None for PNG/JPG)
  -> tiled inference: Depth Anything V2 (GAMUS fine-tuned via depth-any-canopy recipe), overlap blending
  -> RDAH-Net head (or own scale-modulation head): relative depth -> nDSM (structural height)
  -> if georeferenced:
       dem-stitcher: fetch SRTM/Copernicus 30 m for bounds
       xdem: coregister, robust affine fit (RANSAC) relative -> metric, optional GCP override
       segment-geospatial masks: force roads/water flat, enforce building > ground
       DSM = calibrated terrain (SRTM upsampled) + nDSM
     else:
       rDSM = normalised relative height
  -> rasterio: write GeoTIFF (Float32, COG) + PNG 16-bit heightmap + JSON metadata
  -> trimesh: heightfield mesh + UV drape of source image -> GLB
  -> web viewer (three.js + r3f): geotiff.js loads DSM, martini builds LOD mesh, PointerLockControls flythrough
  -> validation panel: upload reference DSM/LiDAR -> xdem metrics (RMSE, MAE, r, per-landcover breakdown)
  -> Electron/Tauri build for standalone deployment
```

## 10. New-feature ideas that no found project has

1. **Per-landscape confidence map.** Train on GAMUS with land-cover labels and output an uncertainty raster;
   shade the 3D mesh by confidence so evaluators see where the model is trustworthy.
2. **Interactive GCP calibration inside the viewer.** Click a point in the 3D scene, type a known height, refit
   the scale live, and watch RMSE update against the reference layer.
3. **Slope and flood analysis tools.** Slope, aspect and a water-level slider that floods the DSM, which ties
   directly to the Disaster Management theme.
4. **Cross-section profile tool.** Draw a line, get an elevation profile with predicted versus reference DSM.
5. **Semantic flattening toggle.** Show the DSM before and after semantic priors so the calibration is explainable.
6. **Multi-model ensemble switch.** Run Depth Anything V2, DA3 and HighResCanopyHeight and let the user pick or
   blend per land-cover class (forest from the canopy model, urban from the GAMUS model).
7. **Time-series change detection.** Two images of the same area produce two DSMs; visualise height differences
   for damage assessment.
8. **Export to Cesium 3D Tiles and glTF** for downstream GIS use, plus a QGIS-compatible GeoTIFF with proper
   nodata and vertical datum tags.
9. **Offline-first packaging.** Bundle SRTM tiles for a region and the ONNX-exported model so the standalone app
   works without internet, which matters for field and defence use.
10. **Self-supervised adaptation on the evaluation imagery.** Use TSE-Net's pseudo-labelling idea to adapt to
    ISRO's own optical imagery at test time without labels.

## 11. Licence summary

Everything in the primary stack is MIT, Apache-2.0, BSD or ISC and safe to ship. Keep these optional or demo-only:
AGPL (DepthFlow, ODM/WebODM), GPL (richdem, Qgis2threejs, BlenderGIS), Apple's Depth Pro licence, and the
CC-BY-NC height rasters from GlobalBuildingAtlas.
