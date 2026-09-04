import json

import numpy as np
import rasterio

from depthwizard.calibrate.fit import GCP
from depthwizard.config import Settings
from depthwizard.pipeline import RunOptions, recalibrate, run, validate

cfg = Settings(mesh_max_side=64, texture_max_side=256)


def test_png_relative(png_path, tmp_path, fake_backbone):
    out = tmp_path / "out"
    meta = run(png_path, out, cfg, backbone=fake_backbone)
    assert meta["units"] == "relative" and meta["calibration"]["mode"] == "relative"
    for f in ("rdsm.tif", "heightmap.png", "preview.png", "texture.jpg", "mesh.glb", "meta.json"):
        assert (out / f).exists(), f
    with rasterio.open(out / "rdsm.tif") as ds:
        arr = ds.read(1)
        assert ds.crs is None and 0 <= arr[arr != ds.nodata].max() <= 1


def test_png_with_gcps_becomes_metric(png_path, tmp_path, fake_backbone):
    out = tmp_path / "out"
    meta = run(png_path, out, cfg, backbone=fake_backbone,
               options=RunOptions(gcps=[GCP(128, 160, 120.0), GCP(5, 5, 100.0)]))
    assert meta["calibration"]["mode"] == "gcp" and meta["calibration"]["gcp_count"] == 2


def test_geotiff_metric(geotiff_path, tmp_path, fake_backbone, fake_dem):
    out = tmp_path / "out"
    stages = []
    meta = run(geotiff_path, out, cfg, backbone=fake_backbone,
               progress=lambda s, f: stages.append(s))
    assert meta["units"] == "m" and meta["input"]["georeferenced"]
    assert meta["input"]["epsg"] == 32643 and meta["input"]["pixel_size_m"] == [1.0, 1.0]
    assert "dem" in stages and "calibrate" in stages
    with rasterio.open(out / "dsm.tif") as ds:
        assert ds.crs.to_epsg() == 32643
        arr = ds.read(1)
        v = arr[arr != ds.nodata]
        assert 80 < v.mean() < 200  # anchored to the fake DEM (100..150 m)
    assert (out / "dem.tif").exists()


def test_recalibrate_and_validate(geotiff_path, tmp_path, fake_backbone, fake_dem):
    out = tmp_path / "out"
    run(geotiff_path, out, cfg, backbone=fake_backbone)
    meta = recalibrate(out, mode="affine")
    assert meta["calibration"]["mode"] in ("affine",)
    meta = recalibrate(out, gcps=[GCP(100, 100, 130.0)])
    assert meta["calibration"]["mode"] == "gcp"

    # reference = our own DSM plus noise -> small RMSE, high correlation
    with rasterio.open(out / "dsm.tif") as ds:
        prof = ds.profile
        dsm = ds.read(1)
    noisy = dsm + np.random.default_rng(0).normal(0, 0.5, dsm.shape).astype(np.float32)
    ref = tmp_path / "ref.tif"
    with rasterio.open(ref, "w", **prof) as ds:
        ds.write(noisy, 1)
    m = validate(out, ref)
    assert m["raw"]["rmse"] < 1.0 and m["raw"]["pearson_r"] > 0.99
    assert (out / "error_map.png").exists()
    assert json.loads((out / "meta.json").read_text())["metrics"]["raw"]["n"] > 1000
