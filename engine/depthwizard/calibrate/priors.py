"""Lightweight semantic priors derived from RGB appearance.

This is intentionally a conservative heuristic rather than a second learned model. It identifies
candidate flat surfaces for calibration only; it is not exposed as a land-cover classifier.
"""

from __future__ import annotations

import cv2
import numpy as np


def detect_flat_surfaces(rgb: np.ndarray) -> np.ndarray:
    """Return candidate water/road/bare-ground pixels from an RGB image.

    The thresholds favour precision over recall and are used only when the semantic calibration
    route is explicitly selected. Vegetated and strongly textured pixels remain unconstrained.
    """
    if rgb.ndim != 3 or rgb.shape[-1] < 3:
        raise ValueError("rgb must be an H x W x 3 array")
    hsv = cv2.cvtColor(rgb[..., :3].astype(np.uint8), cv2.COLOR_RGB2HSV)
    r, g, b = rgb[..., 0].astype(np.float32), rgb[..., 1].astype(np.float32), rgb[..., 2].astype(np.float32)
    h, saturation, value = hsv[..., 0], hsv[..., 1].astype(np.float32), hsv[..., 2].astype(np.float32)

    # Water: blue/cyan hue or dark, blue-dominant low-texture pixels.
    water = (((h >= 80) & (h <= 135) & (saturation >= 45)) | ((b > r * 1.08) & (b > g * 1.02) & (value < 180)))
    # Roads: neutral mid-tone surfaces. Exclude very dark shadows and bright roofs/clouds.
    neutral = np.maximum.reduce((r, g, b)) - np.minimum.reduce((r, g, b))
    road = (neutral < 22) & (value >= 45) & (value <= 205)
    # Bare soil/sand: warm, moderately bright pixels with limited saturation.
    bare = (r >= g * 1.02) & (g >= b * 1.03) & (value >= 70) & (saturation <= 135)
    mask = water | road | bare
    # Remove isolated one-pixel decisions; retain broad surfaces only.
    mask = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    return mask.astype(bool)
