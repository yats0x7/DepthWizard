import numpy as np

from depthwizard.calibrate.fit import GCP, Calibration, apply_gcps, calibrate, lowpass_nan, relative_height


def test_relative_height_range_and_mask():
    d = np.random.default_rng(0).normal(size=(40, 40)).astype(np.float32)
    mask = np.zeros_like(d, bool)
    mask[:5] = True
    rel = relative_height(d, mask)
    assert np.isnan(rel[:5]).all()
    v = rel[5:]
    assert v.min() >= 0 and v.max() <= 1


def test_lowpass_nan_has_no_halo():
    a = np.ones((50, 50), np.float32) * 10
    a[:, :25] = np.nan
    lp = lowpass_nan(a, 4)
    assert np.allclose(lp[:, 30:], 10, atol=1e-4)


def test_hybrid_keeps_dem_trend_and_adds_structure():
    h, w = 80, 100
    y, x = np.mgrid[0:h, 0:w]
    dem = (300 + 0.5 * y).astype(np.float32)
    rel = (0.2 + 0.4 * y / h).astype(np.float32)
    rel[30:40, 40:60] += 0.3  # a building
    dsm, cal = calibrate(rel, dem, (2.0, 2.0), mode="hybrid", prior_p95_m=15)
    assert cal.mode == "hybrid"
    assert np.isfinite(dsm).all()
    assert dsm[35, 50] - dsm[35, 20] > 2  # building higher than surroundings
    assert abs(dsm[10, :].mean() - dem[10, :].mean()) < 3  # flat part follows DEM


def test_affine_fit_recovers_scale():
    h, w = 80, 100
    y, x = np.mgrid[0:h, 0:w]
    rel = (0.1 + 0.8 * y / h).astype(np.float32)
    dem = (100 + 50 * rel).astype(np.float32)
    dsm, cal = calibrate(rel, dem, (10.0, 10.0), mode="affine", min_relief_m=1)
    assert abs(cal.scale - 50) < 2 and abs(cal.offset - 100) < 2
    assert np.allclose(dsm, dem, atol=2)


def test_prior_mode_without_dem():
    rel = np.random.default_rng(0).uniform(0, 1, (60, 60)).astype(np.float32)
    dsm, cal = calibrate(rel, None, None, mode="hybrid", prior_p95_m=20)
    assert cal.mode == "prior" and cal.used_prior
    assert np.isfinite(dsm).all()


def test_gcps_refit():
    y, x = np.mgrid[0:60, 0:60]
    dsm = (5 + 0.1 * y + 0.05 * x).astype(np.float32)
    truth = 2 * dsm + 10
    gcps = [
        GCP(10, 10, float(truth[10, 10])),
        GCP(50, 50, float(truth[50, 50])),
        GCP(20, 45, float(truth[20, 45])),
    ]
    out, cal = apply_gcps(dsm, gcps, Calibration(mode="relative"))
    assert cal.mode == "gcp" and cal.gcp_count == 3
    assert np.allclose(out, truth, atol=0.5)
    assert cal.gcp_rmse is not None and cal.gcp_rmse < 0.5


def test_clamp_sea_level_keeps_land():
    from depthwizard.calibrate.dem import clamp_sea_level

    a = np.array([[-3000.0, -1.0, 0.0], [5.0, np.nan, 120.0]], np.float32)
    out = clamp_sea_level(a)
    assert out[0, 0] == 0 and out[0, 1] == 0 and out[1, 0] == 5 and out[1, 2] == 120
    assert np.isnan(out[1, 1])
