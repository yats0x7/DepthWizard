import numpy as np

from depthwizard.depth.tiling import align_affine, tiled_predict


def test_tiles_reconstruct_affine_consistent_field():
    h, w = 300, 420
    y, x = np.mgrid[0:h, 0:w]
    truth = (np.sin(x / 30) + np.cos(y / 25)).astype(np.float32)
    rgb = np.zeros((h, w, 3), np.uint8)
    tiles = []

    def infer2(patch):
        ph, pw = patch.shape[:2]
        if (ph, pw) == (h, w):
            return truth
        y0, x0 = tiles.pop(0)
        rng = np.random.default_rng(y0 * 1000 + x0)
        a, b = rng.uniform(0.5, 2.0), rng.uniform(-3, 3)
        return a * truth[y0 : y0 + ph, x0 : x0 + pw] + b

    from depthwizard.depth import tiling

    for y0 in tiling._starts(h, 160, 100):
        for x0 in tiling._starts(w, 160, 100):
            tiles.append((y0, x0))
    out = tiled_predict(infer2, rgb, tile=160, overlap=60, global_max=max(h, w))
    assert out.shape == (h, w)
    assert np.abs(out - truth).max() < 1e-3


def test_align_affine_recovers_parameters():
    rng = np.random.default_rng(0)
    src = rng.normal(size=(50, 50)).astype(np.float32)
    ref = 2.5 * src - 1.0
    ref[0, :5] += 100  # outliers
    a, b = align_affine(src, ref)
    assert abs(a - 2.5) < 0.05 and abs(b + 1.0) < 0.1
