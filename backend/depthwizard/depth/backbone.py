from __future__ import annotations

import logging
from collections.abc import Callable
from pathlib import Path
from typing import Protocol

import numpy as np
from PIL import Image

from ..config import Settings
from ..config import settings as default_settings
from .tiling import tiled_predict

log = logging.getLogger(__name__)


class DepthBackbone(Protocol):
    name: str

    def predict(self, rgb: np.ndarray, progress: Callable[[float], None] | None = None) -> np.ndarray:
        """Return an H x W float32 map where larger values are closer to the camera (higher)."""


def pick_device(pref: str = "auto") -> str:
    import torch

    if pref != "auto":
        return pref
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


class DepthAnythingBackbone:
    """Depth Anything V2 (or any HF depth-estimation model) with tiled, globally aligned inference."""

    def __init__(self, cfg: Settings = default_settings):
        import torch
        from transformers import AutoImageProcessor, AutoModelForDepthEstimation

        self.cfg = cfg
        self.device = pick_device(cfg.device)
        self.name = cfg.model_id
        kw = {"token": cfg.hf_token} if cfg.hf_token else {}
        self.processor = AutoImageProcessor.from_pretrained(cfg.model_id, **kw)
        self.model = AutoModelForDepthEstimation.from_pretrained(cfg.model_id, **kw)
        if cfg.finetuned and Path(cfg.finetuned).exists():
            state = torch.load(cfg.finetuned, map_location="cpu")
            state = state.get("state_dict", state)
            missing, unexpected = self.model.load_state_dict(state, strict=False)
            log.info("loaded fine-tuned weights %s (missing=%d unexpected=%d)",
                     cfg.finetuned, len(missing), len(unexpected))
            self.name += f"+{Path(cfg.finetuned).name}"
        self.model.to(self.device).eval()
        self.torch = torch

    def _infer(self, rgb: np.ndarray) -> np.ndarray:
        torch = self.torch
        h, w = rgb.shape[:2]
        f = self.cfg.infer_res / max(h, w)
        th = max(14, int(round(h * f / 14)) * 14)
        tw = max(14, int(round(w * f / 14)) * 14)
        inputs = self.processor(images=Image.fromarray(rgb), return_tensors="pt",
                                size={"height": th, "width": tw}, keep_aspect_ratio=False,
                                do_resize=True)
        inputs = {k: v.to(self.device) for k, v in inputs.items()}
        with torch.inference_mode():
            pred = self.model(**inputs).predicted_depth  # (1, th, tw)
            pred = torch.nn.functional.interpolate(pred[:, None], size=(h, w), mode="bicubic",
                                                   align_corners=False)[0, 0]
        return pred.float().cpu().numpy()

    def predict(self, rgb: np.ndarray, progress: Callable[[float], None] | None = None) -> np.ndarray:
        return tiled_predict(self._infer, rgb, tile=self.cfg.tile, overlap=self.cfg.overlap,
                             global_max=self.cfg.infer_res, progress=progress)


_backbone: DepthBackbone | None = None


def get_backbone(cfg: Settings = default_settings) -> DepthBackbone:
    global _backbone
    if _backbone is None:
        _backbone = DepthAnythingBackbone(cfg)
    return _backbone


def set_backbone(backbone: DepthBackbone | None) -> None:
    """Inject a backbone (tests, alternative models)."""
    global _backbone
    _backbone = backbone
