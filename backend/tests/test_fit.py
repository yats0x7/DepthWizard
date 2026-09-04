import numpy as np
from scipy.ndimage import gaussian_filter

from depthwizard.calibrate.fit import GCP, apply_gcps, calibrate, relative_height


def _scene(h=200, w=240, seed=0):
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w]
    terrain = 100 + 60 * xx / w
    structure = np.zeros((h, w))
    for _ in range(15):
        y, x = rng.integers(0, h - 20), rng.integers(0, w - 20)
        structure[y:y + 15, x:x + 15] = rng.uniform(5, 30)
    truth = terrain + structure
    dem = gaussian_filter(truth, 15)  # coarse DEM
    return truth, dem


def test_relative_height_range():
    d = np.random.default_rng(0).normal(size=(50, 50)).astype(np.float32)
    r = relative_height(d)
    assert np.nanmin(r) >= 0 and np.nanmax(r) <= 1


def test_affine_recovers_scale():
    truth, dem = _scene()
    rel = ((truth - truth.min()) / np.ptp(truth)).astype(np.float32)
    dsm, cal = calibrate(rel, dem.astype(np.float32), (1.0, 1.0), mode="affine", min_relief_m=5)
    assert cal.mode == "affine" and not cal.used_prior
    assert abs(cal.scale - np.ptp(truth)) / np.ptp(truth) < 0.15
    assert np.sqrt(np.mean((dsm - truth) ** 2)) < 6


def test_hybrid_keeps_terrain_and_structure():
    truth, dem = _scene()
    rel = ((truth - truth.min()) / np.ptp(truth)).astype(np.float32)
    dsm, cal = calibrate(rel, dem.astype(np.float32), (1.0, 1.0), mode="hybrid")
    assert cal.mode == "hybrid"
    assert np.sqrt(np.mean((dsm - truth) ** 2)) < 6
    assert np.corrcoef(dsm.ravel(), truth.ravel())[0, 1] > 0.97


def test_prior_used_when_flat():
    truth, _ = _scene()
    rel = ((truth - truth.min()) / np.ptp(truth)).astype(np.float32)
    flat = np.full_like(rel, 50.0)
    dsm, cal = calibrate(rel, flat, (1.0, 1.0), mode="hybrid", prior_p95_m=25)
    assert cal.used_prior
    struct = dsm - 50
    assert 10 < np.percentile(struct[struct > 0], 95) < 40


def test_gcps_refit():
    yy, xx = np.mgrid[0:60, 0:60]
    dsm = ((xx + 0.5 * yy) / 90).astype(np.float32)  # smooth field
    from depthwizard.calibrate.fit import Calibration

    cal = Calibration(mode="relative")
    gcps = [GCP(10, 10, 3 * dsm[10, 10] + 50), GCP(40, 45, 3 * dsm[40, 45] + 50)]
    out, cal2 = apply_gcps(dsm, gcps, cal)
    assert cal2.mode == "gcp" and cal2.gcp_count == 2
    assert abs(out[10, 10] - gcps[0].z) < 2 and abs(out[40, 45] - gcps[1].z) < 2
