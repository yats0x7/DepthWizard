import numpy as np

from depthwizard.depth.tiling import tiled_predict


def test_tiles_align_to_global_pass():
    h, w = 700, 900
    yy, xx = np.mgrid[0:h, 0:w]
    truth = (np.sin(xx / 60) + np.cos(yy / 45) + xx / w).astype(np.float32)
    rgb = np.repeat(((truth - truth.min()) / np.ptp(truth) * 255).astype(np.uint8)[..., None], 3, 2)
    rng = np.random.default_rng(1)
    calls = []

    def infer(patch):  # each call returns truth with a random scale/shift, like a real model
        calls.append(patch.shape)
        t = patch[..., 0].astype(np.float32) / 255 * np.ptp(truth) + truth.min()
        return t * rng.uniform(0.5, 2.0) + rng.uniform(-3, 3)

    out = tiled_predict(infer, rgb, tile=400, overlap=100, global_max=400)
    assert out.shape == (h, w)
    assert len(calls) > 2
    r = np.corrcoef(out.ravel(), truth.ravel())[0, 1]
    assert r > 0.995


def test_small_image_single_pass():
    rgb = np.zeros((100, 120, 3), np.uint8)
    out = tiled_predict(lambda p: np.ones(p.shape[:2], np.float32), rgb, tile=512, global_max=512)
    assert out.shape == (100, 120) and np.allclose(out, 1)
