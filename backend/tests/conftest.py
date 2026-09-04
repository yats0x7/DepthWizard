import numpy as np
import pytest
import rasterio
from PIL import Image
from rasterio.transform import from_origin
from scipy.ndimage import gaussian_filter


class FakeBackbone:
    """Deterministic stand-in: brightness-driven 'disparity' with a hill, no model download."""

    name = "fake"
    device = "cpu"

    def predict(self, rgb, progress=None):
        h, w = rgb.shape[:2]
        gray = rgb.mean(axis=2).astype(np.float32) / 255.0
        yy, xx = np.mgrid[0:h, 0:w]
        hill = np.exp(-(((yy - h / 2) / (h / 4)) ** 2 + ((xx - w / 2) / (w / 4)) ** 2))
        if progress:
            progress(1.0)
        return gaussian_filter(gray, 2) * 0.5 + hill


def synthetic_rgb(h=256, w=320, seed=0):
    rng = np.random.default_rng(seed)
    img = rng.integers(60, 120, (h, w, 3), dtype=np.uint8)
    for _ in range(12):  # bright "buildings"
        y, x = rng.integers(0, h - 30), rng.integers(0, w - 30)
        img[y:y + rng.integers(8, 30), x:x + rng.integers(8, 30)] = rng.integers(160, 250, 3)
    return img


@pytest.fixture
def fake_backbone():
    return FakeBackbone()


@pytest.fixture
def png_path(tmp_path):
    p = tmp_path / "scene.png"
    Image.fromarray(synthetic_rgb()).save(p)
    return p


@pytest.fixture
def geotiff_path(tmp_path):
    p = tmp_path / "scene.tif"
    rgb = synthetic_rgb()
    h, w = rgb.shape[:2]
    transform = from_origin(500_000, 1_500_000, 1.0, 1.0)  # 1 m pixels, UTM 43N
    with rasterio.open(p, "w", driver="GTiff", height=h, width=w, count=3, dtype="uint8",
                       crs="EPSG:32643", transform=transform) as ds:
        for i in range(3):
            ds.write(rgb[..., i], i + 1)
    return p


@pytest.fixture
def fake_dem(monkeypatch):
    """Replace the network DEM fetch with a sloped plane (100 m to 140 m)."""
    from depthwizard.calibrate import dem as demmod

    def fake(bounds4326, dst_crs, dst_transform, dst_shape, source="glo_30"):
        h, w = dst_shape
        yy, xx = np.mgrid[0:h, 0:w]
        dem = 100 + 40 * (xx / w) + 10 * (yy / h)
        return dem.astype(np.float32), {"source": "fake", "native_res_deg": 0.00027}

    monkeypatch.setattr(demmod, "fetch_dem_on_grid", fake)
    return fake
