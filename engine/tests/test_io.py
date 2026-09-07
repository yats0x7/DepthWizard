import io

import numpy as np
import rasterio
from PIL import Image
from rasterio.crs import CRS
from rasterio.enums import ColorInterp
from rasterio.transform import from_origin

from depthwizard.calibrate.fit import GCP, Calibration, apply_gcps
from depthwizard.calibrate.terrarium import decode, lonlat_to_tile, pick_zoom
from depthwizard.raster.io import hillshade, load_image, write_png16


def test_hillshade_lights_slopes_facing_the_sun():
    y, x = np.mgrid[0:40, 0:40]
    z = (-(x + y) * 0.5).astype(np.float32)  # descends toward the south-east, so it faces SE
    se = hillshade(z, azimuth=135, altitude=45)[20, 20]
    nw = hillshade(z, azimuth=315, altitude=45)[20, 20]
    assert se > 0.9 and nw < 0.3


def test_rgb_nir_geotiff_is_not_treated_as_rgba(tmp_path):
    p = tmp_path / "nir.tif"
    h, w = 16, 16
    data = np.full((4, h, w), 100, np.uint8)
    data[3, :, :8] = 0  # NIR zeros must not become nodata
    base = dict(
        driver="GTiff",
        height=h,
        width=w,
        count=4,
        dtype="uint8",
        crs=CRS.from_epsg(32643),
        transform=from_origin(500000, 1500000, 1, 1),
    )
    with rasterio.open(p, "w", **base, alpha="unspecified") as ds:  # RGB + NIR, no alpha
        ds.write(data)
    with rasterio.open(p) as ds:
        assert ColorInterp.alpha not in ds.colorinterp
    assert load_image(p).nodata_mask is None
    with rasterio.open(p, "w", **base, alpha="yes") as ds:  # a real RGBA file
        ds.write(data)
    mask = load_image(p).nodata_mask
    assert mask is not None and mask[:, :8].all() and not mask[:, 8:].any()


def test_png16_roundtrip(tmp_path):
    z = np.linspace(-5, 120, 64 * 64, dtype=np.float32).reshape(64, 64)
    z[0, 0] = np.nan
    path, lo, hi = write_png16(tmp_path / "h.png", z)
    q = np.asarray(Image.open(path)).astype(np.float32)
    back = lo + q / 65535 * (hi - lo)
    assert abs(back[10, 10] - z[10, 10]) < (hi - lo) / 65535 * 1.01


def test_terrarium_maths():
    img = np.zeros((2, 2, 3), np.uint8)
    img[..., 0], img[..., 1], img[..., 2] = 128, 10, 0  # 128*256 + 10 - 32768 = 10 m
    buf = io.BytesIO()
    Image.fromarray(img).save(buf, format="PNG")
    assert np.allclose(decode(buf.getvalue()), 10.0)
    assert lonlat_to_tile(0.0, 0.0, 1) == (1.0, 1.0)
    assert 8 <= pick_zoom((77.5, 12.9, 77.6, 13.0), 30) <= 12


def test_gcps_ignore_out_of_range_and_use_neighbours_for_nan():
    dsm = np.full((10, 10), 5.0, np.float32)
    dsm[2, 2] = np.nan
    out, cal = apply_gcps(dsm, [GCP(2, 2, 50.0), GCP(50, 50, 9.0)], Calibration(mode="relative"))
    assert cal.gcp_count == 1 and abs(out[5, 5] - 50.0) < 1e-4


def test_warns_when_geotiff_lost_its_coordinates(tmp_path):
    """An image editor re-saving a GeoTIFF strips the CRS; the user must be told why it went relative."""
    p = tmp_path / "stripped.tif"
    rgb = np.full((3, 32, 32), 120, np.uint8)
    with rasterio.open(p, "w", driver="GTiff", height=32, width=32, count=3, dtype="uint8") as ds:
        ds.write(rgb)
    src = load_image(p)
    assert not src.georeferenced
    assert any("no coordinate system" in w for w in src.warnings)


def test_warns_when_an_elevation_raster_is_uploaded_as_imagery(tmp_path):
    p = tmp_path / "exportImage.tiff"
    y, x = np.mgrid[0:32, 0:32]
    dem = (68 + y * 3.5).astype(np.float32)
    with rasterio.open(
        p,
        "w",
        driver="GTiff",
        height=32,
        width=32,
        count=1,
        dtype="float32",
        nodata=-9999.0,
        crs=CRS.from_epsg(4326),
        transform=from_origin(-104.99, 39.75, 1e-4, 1e-4),
    ) as ds:
        ds.write(dem, 1)
    src = load_image(p)
    assert any("looks like an elevation raster" in w for w in src.warnings)


def test_a_normal_rgb_geotiff_warns_about_nothing(tmp_path):
    p = tmp_path / "clean.tif"
    rgb = np.full((3, 32, 32), 120, np.uint8)
    with rasterio.open(
        p,
        "w",
        driver="GTiff",
        height=32,
        width=32,
        count=3,
        dtype="uint8",
        crs=CRS.from_epsg(32643),
        transform=from_origin(500000, 1500000, 5, 5),
    ) as ds:
        ds.write(rgb)
    assert load_image(p).warnings == []
