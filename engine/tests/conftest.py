from __future__ import annotations

import numpy as np
import pytest
import rasterio
from PIL import Image
from rasterio.crs import CRS
from rasterio.transform import from_origin

from depthwizard.calibrate import dem as demmod
from depthwizard.config import Settings
from depthwizard.depth import backbone as bb


class FakeBackbone:
    """Deterministic 'depth': brightness + a smooth ramp, so tests are fast and reproducible."""

    name = "fake"
    device = "cpu"

    def predict(self, rgb, progress=None):
        g = rgb.astype(np.float32).mean(-1) / 255.0
        h, w = g.shape
        ramp = np.linspace(0, 1, h, dtype=np.float32)[:, None] * np.ones((1, w), np.float32)
        if progress:
            progress(1.0)
        return 0.6 * g + 0.4 * ramp


@pytest.fixture(autouse=True)
def fake_backbone():
    bb.set_backbone(FakeBackbone())
    yield
    bb.set_backbone(None)


@pytest.fixture
def cfg(tmp_path):
    return Settings(data_dir=tmp_path / "data", mesh_max_side=64, texture_max_side=256, tta=False)


def _scene(h=96, w=128):
    rng = np.random.default_rng(1)
    y, x = np.mgrid[0:h, 0:w]
    base = 90 + 60 * np.sin(x / 40.0) + 40 * (y / h)
    rgb = np.stack([np.clip(base + rng.normal(0, 8, (h, w)), 0, 255)] * 3, -1).astype(np.uint8)
    rgb[20:40, 30:60] = 230  # a bright block = a building
    return rgb


@pytest.fixture
def png_path(tmp_path):
    p = tmp_path / "scene.png"
    Image.fromarray(_scene()).save(p)
    return p


@pytest.fixture
def geotiff_path(tmp_path):
    p = tmp_path / "scene.tif"
    rgb = _scene()
    h, w = rgb.shape[:2]
    transform = from_origin(500_000, 1_500_000, 5.0, 5.0)  # 5 m pixels
    with rasterio.open(
        p,
        "w",
        driver="GTiff",
        height=h,
        width=w,
        count=3,
        dtype="uint8",
        crs=CRS.from_epsg(32643),
        transform=transform,
    ) as ds:
        for i in range(3):
            ds.write(rgb[..., i], i + 1)
    return p


@pytest.fixture
def fake_dem(monkeypatch):
    """A tilted plane DEM on the working grid so calibration has terrain to fit."""

    def fetch(bounds4326, dst_crs, dst_transform, dst_shape, source="terrarium"):
        h, w = dst_shape
        y, x = np.mgrid[0:h, 0:w]
        dem = 200 + 0.3 * y + 0.1 * x
        return dem.astype(np.float32), {
            "source": source,
            "native_res_m": 30.0,
            "shape": [h, w],
            "crs": "EPSG:4326",
        }

    monkeypatch.setattr(demmod, "fetch_dem_on_grid", fetch)
    return fetch
