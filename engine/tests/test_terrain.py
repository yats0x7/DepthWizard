import numpy as np

from depthwizard.analysis.terrain import slope_aspect, surface_stats


def test_aspect_is_downslope_clockwise_from_north():
    y, x = np.mgrid[0:20, 0:20]
    east_down = (-1.0 * x).astype(np.float32)  # descends toward the east
    _, aspect = slope_aspect(east_down, 1.0, 1.0)
    assert abs(aspect[10, 10] - 90) < 1e-3
    north_down = (1.0 * y).astype(np.float32)  # rows go south, so it descends toward the north
    _, aspect = slope_aspect(north_down, 1.0, 1.0)
    assert abs(aspect[10, 10] - 0) < 1e-3 or abs(aspect[10, 10] - 360) < 1e-3


def test_slope_degrees():
    y, x = np.mgrid[0:20, 0:20]
    z = (1.0 * x).astype(np.float32)
    slope, _ = slope_aspect(z, 1.0, 1.0)
    assert abs(slope[10, 10] - 45) < 1e-3
    stats = surface_stats(z, (1.0, 1.0))
    assert stats["slope_mean_deg"] > 40
