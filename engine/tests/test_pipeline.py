import json

import numpy as np
import rasterio

from depthwizard.pipeline import RunOptions, recalibrate, run, validate


def test_png_relative_dsm(png_path, tmp_path, cfg):
    out = tmp_path / "out"
    meta = run(png_path, out, cfg)
    assert meta["units"] == "relative"
    assert (out / "rdsm.tif").exists() and (out / "heightmap.png").exists() and (out / "mesh.glb").exists()
    assert (out / "preview.png").exists() and (out / "texture.jpg").exists()
    with rasterio.open(out / "rdsm.tif") as ds:
        arr = ds.read(1)
        assert arr.dtype == np.float32
        assert 0 <= arr[arr != ds.nodata].max() <= 1
    assert meta["stats"]["valid_fraction"] > 0.99
    assert meta["view"]["vertical_scale"] > 1
    assert "histogram" in meta["stats"]


def test_geotiff_metric_dsm(geotiff_path, tmp_path, cfg, fake_dem):
    out = tmp_path / "out"
    stages = []
    meta = run(geotiff_path, out, cfg, progress=lambda s, f, m="": stages.append(s))
    assert meta["units"] == "m"
    assert meta["calibration"]["mode"] == "hybrid"
    assert meta["input"]["epsg"] == 32643 and meta["input"]["pixel_size_m"] == [5.0, 5.0]
    with rasterio.open(out / "dsm.tif") as ds:
        assert ds.crs.to_epsg() == 32643
        arr = ds.read(1)
        v = arr[arr != ds.nodata]
        assert 150 < v.mean() < 300
    assert "dem" in stages and stages[-1] == "done"
    assert (out / "dem.tif").exists()
    assert meta["stats"]["slope_mean_deg"] >= 0


def test_recalibrate_with_gcps(geotiff_path, tmp_path, cfg, fake_dem):
    out = tmp_path / "out"
    run(geotiff_path, out, cfg)
    from depthwizard.calibrate.fit import GCP

    meta = recalibrate(out, mode="affine", gcps=[GCP(10, 10, 500.0)], cfg=cfg)
    assert meta["calibration"]["mode"] == "gcp" and meta["calibration"]["gcp_count"] == 1
    assert (out / "dsm.tif").exists()


def test_validate_against_reference(geotiff_path, tmp_path, cfg, fake_dem):
    out = tmp_path / "out"
    run(geotiff_path, out, cfg)
    with rasterio.open(out / "dsm.tif") as ds:
        pred = ds.read(1)
        profile = ds.profile
    ref = pred + np.random.default_rng(0).normal(0, 0.5, pred.shape).astype(np.float32)
    ref_path = tmp_path / "ref.tif"
    with rasterio.open(ref_path, "w", **profile) as ds:
        ds.write(ref, 1)
    m = validate(out, ref_path)
    assert m["raw"]["rmse"] < 1.0 and m["raw"]["pearson_r"] > 0.99
    assert (out / "error_map.png").exists()
    assert json.loads((out / "meta.json").read_text())["metrics"]["raw"]["n"] > 1000


def test_cancel(png_path, tmp_path, cfg):
    import pytest

    from depthwizard.pipeline import JobCancelled

    with pytest.raises(JobCancelled):
        run(png_path, tmp_path / "out", cfg, RunOptions(), cancel=lambda: True)
