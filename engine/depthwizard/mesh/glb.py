"""Heightfield + texture -> textured glTF binary. X east, Y up, Z south, centred on the origin."""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import trimesh
from PIL import Image


def heightfield_to_glb(
    height: np.ndarray,
    rgb: np.ndarray,
    out: str | Path,
    pixel_size: tuple[float, float] = (1.0, 1.0),
    max_side: int = 768,
    z_offset: float | None = None,
    texture_max: int = 4096,
) -> dict:
    h, w = height.shape
    f = max(1.0, max(h, w) / max_side)
    mh, mw = max(2, int(round(h / f))), max(2, int(round(w / f)))
    z = np.where(np.isfinite(height), height, np.nan).astype(np.float32)
    fill = float(np.nanmin(z)) if np.isfinite(z).any() else 0.0
    z = np.nan_to_num(z, nan=fill)
    if f != 1.0:
        z = cv2.resize(z, (mw, mh), interpolation=cv2.INTER_AREA)
    if z_offset is None:
        z_offset = float(z.min())
    z = z - z_offset

    dx, dy = pixel_size[0] * f, pixel_size[1] * f
    jj, ii = np.meshgrid(np.arange(mw, dtype=np.float32), np.arange(mh, dtype=np.float32))
    x = (jj - (mw - 1) / 2) * dx
    zz = (ii - (mh - 1) / 2) * dy
    verts = np.stack([x.ravel(), z.ravel(), zz.ravel()], axis=1)

    idx = np.arange(mh * mw).reshape(mh, mw)
    a, b, c, d = idx[:-1, :-1], idx[:-1, 1:], idx[1:, :-1], idx[1:, 1:]
    faces = np.concatenate([np.stack([a, c, b], -1).reshape(-1, 3), np.stack([b, c, d], -1).reshape(-1, 3)])
    uv = np.stack([jj.ravel() / max(mw - 1, 1), 1 - ii.ravel() / max(mh - 1, 1)], axis=1)

    tex = rgb
    if max(tex.shape[:2]) > texture_max:
        s = texture_max / max(tex.shape[:2])
        tex = cv2.resize(
            tex, (round(tex.shape[1] * s), round(tex.shape[0] * s)), interpolation=cv2.INTER_AREA
        )
    material = trimesh.visual.material.PBRMaterial(
        baseColorTexture=Image.fromarray(tex), metallicFactor=0.0, roughnessFactor=1.0, doubleSided=True
    )
    mesh = trimesh.Trimesh(
        vertices=verts,
        faces=faces,
        visual=trimesh.visual.TextureVisuals(uv=uv, material=material),
        process=False,
    )
    mesh.export(str(out), file_type="glb")
    return {
        "vertices": int(verts.shape[0]),
        "faces": int(faces.shape[0]),
        "grid": [mh, mw],
        "pixel_size": [dx, dy],
        "z_offset": z_offset,
    }
