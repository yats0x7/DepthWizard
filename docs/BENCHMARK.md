# DepthWizard benchmark

This report is generated from the cached scene results with `depthwizard benchmark report`. Each prediction is calibrated with the normal pipeline; the reference raster is an independent height product and is never the DEM consumed by calibration.

Scenes: **8** | Classes: **forested, hilly, sparse, urban**

## Per-scene results

| Scene | Class | Reference | Raw RMSE | Raw MAE | Raw bias | Raw NMAD | Raw r | Raw ≤1 m | Raw ≤3 m | Aligned RMSE | Aligned MAE | Aligned bias | Aligned NMAD | Aligned r | Aligned ≤1 m | Aligned ≤3 m |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 3dep-forested-portland | forested | USGS 3DEP | 8.587 | 6.219 | 4.755 | 6.112 | 0.946 | 14.7% | 39.2% | 6.616 | 5.086 | 0.000 | 5.808 | 0.946 | 13.7% | 39.0% |
| 3dep-hilly-seattle | hilly | USGS 3DEP | 2.683 | 1.421 | 0.783 | 0.950 | 0.991 | 66.7% | 87.7% | 2.502 | 1.424 | -0.000 | 0.992 | 0.991 | 58.2% | 88.9% |
| 3dep-sparse-kansas | sparse | USGS 3DEP | 10.106 | 7.303 | 1.820 | 6.809 | 0.579 | 12.0% | 32.1% | 6.305 | 5.056 | -0.000 | 6.218 | 0.579 | 12.9% | 38.0% |
| 3dep-urban-denver | urban | USGS 3DEP | 9.564 | 7.344 | 1.619 | 8.298 | 0.585 | 9.7% | 27.7% | 6.586 | 5.278 | 0.000 | 6.290 | 0.585 | 11.0% | 34.0% |
| ahn-forested-veluwe | forested | AHN4 DSM 0.5m | 2.697 | 2.136 | -0.613 | 2.430 | 0.659 | 26.9% | 76.2% | 2.573 | 2.043 | -0.000 | 2.449 | 0.659 | 30.4% | 75.1% |
| ahn-hilly-limburg | hilly | AHN4 DSM 0.5m | 4.177 | 2.869 | 0.362 | 2.784 | 0.992 | 29.4% | 68.0% | 4.161 | 2.899 | 0.000 | 2.764 | 0.992 | 27.3% | 67.4% |
| ahn-sparse-flevoland | sparse | AHN4 DSM 0.5m | 11.006 | 8.981 | 8.465 | 7.075 | 0.018 | 6.3% | 19.7% | 2.084 | 1.577 | 0.000 | 1.706 | 0.018 | 36.5% | 90.6% |
| ahn-urban-amsterdam | urban | AHN4 DSM 0.5m | 5.305 | 4.185 | -0.694 | 5.365 | 0.232 | 13.3% | 40.5% | 5.255 | 4.231 | -0.000 | 5.410 | 0.232 | 12.4% | 38.2% |

## Scene provenance

The URLs below are the manifest's declared sources. They are included here so the result table remains auditable without treating downloaded inputs as source files.

| Scene | Class | Imagery source | Imagery URL | Imagery licence | Reference source | Reference URL | Reference licence | Expected GSD | Error map |
|---|---|---|---|---|---|---|---|---:|---|
| 3dep-forested-portland | forested | sentinel2 | https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/10/T/ER/2026/7/S2B_10TER_20260713_0_L2A/TCI.tif | Copernicus Sentinel data, free and open | USGS 3DEP | https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage?bbox=-122.75%2C45.48%2C-122.73%2C45.50&bboxSR=4326&imageSR=4326&size=256%2C256&format=tiff&pixelType=F32&noData=-9999&interpolation=RSP_Bilinear&f=image | USGS public domain | 10.0 m | `benchmark/errors/3dep-forested-portland.png` |
| 3dep-hilly-seattle | hilly | sentinel2 | https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/10/T/ET/2025/6/S2B_10TET_20250608_0_L2A/TCI.tif | Copernicus Sentinel data, free and open | USGS 3DEP | https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage?bbox=-122.35%2C47.60%2C-122.33%2C47.62&bboxSR=4326&imageSR=4326&size=256%2C256&format=tiff&pixelType=F32&noData=-9999&interpolation=RSP_Bilinear&f=image | USGS public domain | 10.0 m | `benchmark/errors/3dep-hilly-seattle.png` |
| 3dep-sparse-kansas | sparse | sentinel2 | https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/14/S/PJ/2024/9/S2A_14SPJ_20240903_0_L2A/TCI.tif | Copernicus Sentinel data, free and open | USGS 3DEP | https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage?bbox=-97.35%2C38.95%2C-97.33%2C38.97&bboxSR=4326&imageSR=4326&size=256%2C256&format=tiff&pixelType=F32&noData=-9999&interpolation=RSP_Bilinear&f=image | USGS public domain | 10.0 m | `benchmark/errors/3dep-sparse-kansas.png` |
| 3dep-urban-denver | urban | sentinel2 | https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/13/S/ED/2023/10/S2A_13SED_20231015_0_L2A/TCI.tif | Copernicus Sentinel data, free and open | USGS 3DEP | https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage?bbox=-104.99%2C39.73%2C-104.97%2C39.75&bboxSR=4326&imageSR=4326&size=256%2C256&format=tiff&pixelType=F32&noData=-9999&interpolation=RSP_Bilinear&f=image | USGS public domain | 10.0 m | `benchmark/errors/3dep-urban-denver.png` |
| ahn-forested-veluwe | forested | sentinel2 | https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/31/U/FT/2024/8/S2B_31UFT_20240812_0_L2A/TCI.tif | Copernicus Sentinel data, free and open | AHN4 DSM 0.5m | https://service.pdok.nl/rws/ahn/wcs/v1_0?service=WCS&version=1.0.0&request=GetCoverage&coverage=dsm_05m&bbox=181841.54224490697%2C470285.54382521904%2C183195.55074949798%2C472518.34878073295&crs=EPSG:28992&response_crs=EPSG:28992&format=GeoTIFF&width=256&height=256 | Open Government Licence, Netherlands | 10.0 m | `benchmark/errors/ahn-forested-veluwe.png` |
| ahn-hilly-limburg | hilly | sentinel2 | https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/31/U/GS/2025/8/S2A_31UGS_20250811_1_L2A/TCI.tif | Copernicus Sentinel data, free and open | AHN4 DSM 0.5m | https://service.pdok.nl/rws/ahn/wcs/v1_0?service=WCS&version=1.0.0&request=GetCoverage&coverage=dsm_05m&bbox=186191.5919060125%2C316777.89899028884%2C187586.33801488715%2C319011.583464665&crs=EPSG:28992&response_crs=EPSG:28992&format=GeoTIFF&width=256&height=256 | Open Government Licence, Netherlands | 10.0 m | `benchmark/errors/ahn-hilly-limburg.png` |
| ahn-sparse-flevoland | sparse | sentinel2 | https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/31/U/FU/2024/8/S2B_31UFU_20240812_0_L2A/TCI.tif | Copernicus Sentinel data, free and open | AHN4 DSM 0.5m | https://service.pdok.nl/rws/ahn/wcs/v1_0?service=WCS&version=1.0.0&request=GetCoverage&coverage=dsm_05m&bbox=159264.09392781305%2C501368.7526144833%2C160619.63820567797%2C503595.4830800416&crs=EPSG:28992&response_crs=EPSG:28992&format=GeoTIFF&width=256&height=256 | Open Government Licence, Netherlands | 10.0 m | `benchmark/errors/ahn-sparse-flevoland.png` |
| ahn-urban-amsterdam | urban | sentinel2 | https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/31/U/FU/2024/8/S2B_31UFU_20240812_0_L2A/TCI.tif | Copernicus Sentinel data, free and open | AHN4 DSM 0.5m | https://service.pdok.nl/rws/ahn/wcs/v1_0?service=WCS&version=1.0.0&request=GetCoverage&coverage=dsm_05m&bbox=120441.72476158502%2C484797.8524855851%2C121819.36516274624%2C487013.7615222193&crs=EPSG:28992&response_crs=EPSG:28992&format=GeoTIFF&width=256&height=256 | Open Government Licence, Netherlands | 10.0 m | `benchmark/errors/ahn-urban-amsterdam.png` |

## Per-class weighted results

| Class | Scenes | Raw RMSE | Raw MAE | Raw bias | Raw NMAD | Raw r | Raw ≤1 m | Raw ≤3 m | Aligned RMSE | Aligned MAE | Aligned bias | Aligned NMAD | Aligned r | Aligned ≤1 m | Aligned ≤3 m |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| forested | 2 | 5.846 | 4.319 | 2.257 | 4.398 | 0.813 | 20.4% | 56.4% | 4.735 | 3.670 | 0.000 | 4.245 | 0.813 | 21.5% | 55.8% |
| hilly | 2 | 3.130 | 1.854 | 0.657 | 1.498 | 0.991 | 55.5% | 81.8% | 2.998 | 1.865 | -0.000 | 1.522 | 0.991 | 48.9% | 82.5% |
| sparse | 2 | 10.497 | 8.032 | 4.707 | 6.925 | 0.335 | 9.5% | 26.7% | 4.471 | 3.544 | -0.000 | 4.257 | 0.335 | 23.1% | 60.8% |
| urban | 2 | 7.692 | 5.956 | 0.602 | 7.009 | 0.430 | 11.3% | 33.3% | 6.001 | 4.818 | 0.000 | 5.903 | 0.430 | 11.6% | 35.8% |

## Semantic-prior A/B

The semantic route is opt-in. This comparison uses the same eight image/reference pairs as the baseline and reports the change in raw and aligned RMSE; negative is better. The route is retained because it is a measured option, not claimed as a universal gain.

| Scene | Class | Baseline raw RMSE | Semantic raw RMSE | Δ raw | Baseline aligned RMSE | Semantic aligned RMSE | Δ aligned |
|---|---|---:|---:|---:|---:|---:|---:|
| 3dep-forested-portland | forested | 8.587 | 14.772 | +6.185 | 6.616 | 14.733 | +8.117 |
| 3dep-hilly-seattle | hilly | 2.683 | 11.564 | +8.881 | 2.502 | 11.526 | +9.024 |
| 3dep-sparse-kansas | sparse | 10.106 | 7.525 | -2.581 | 6.305 | 5.802 | -0.503 |
| 3dep-urban-denver | urban | 9.564 | 5.650 | -3.915 | 6.586 | 5.040 | -1.546 |
| ahn-forested-veluwe | forested | 2.697 | 6.053 | +3.356 | 2.573 | 3.268 | +0.694 |
| ahn-hilly-limburg | hilly | 4.177 | 17.266 | +13.088 | 4.161 | 13.258 | +9.098 |
| ahn-sparse-flevoland | sparse | 11.006 | 7.253 | -3.752 | 2.084 | 2.084 | -0.000 |
| ahn-urban-amsterdam | urban | 5.305 | 6.612 | +1.307 | 5.255 | 5.391 | +0.136 |
