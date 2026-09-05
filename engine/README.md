# DepthWizard engine

Python package that turns one optical image into a digital surface model.

```
depthwizard run scene.tif --out out/scene        # GeoTIFF -> metric DSM
depthwizard run photo.png --out out/photo        # PNG/JPG -> relative DSM
depthwizard validate out/scene reference.tif     # RMSE / MAE / r against a reference
depthwizard recalibrate out/scene --gcps g.json  # refit heights on ground control points
depthwizard serve --port 8000                    # API + studio UI
```

Modules: `raster` (I/O), `depth` (Depth Anything V2, tiled inference), `calibrate` (DEM fetch and
height calibration), `mesh` (GLB export), `analysis` (slope, statistics), `eval` (metrics), `api`
(FastAPI jobs), `cli`.
