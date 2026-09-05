"""Depth backbones. Depth Anything V2 through Hugging Face transformers by default."""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from pathlib import Path
from typing import Protocol

import numpy as np
from PIL import Image

from ..config import MODEL_PRESETS, Settings
from ..config import settings as default_settings
from .tiling import tiled_predict

log = logging.getLogger(__name__)


class DepthBackbone(Protocol):
    name: str
    device: str

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


def resolve_model_id(model: str) -> str:
    return MODEL_PRESETS.get(model, {}).get("id", model)


class DepthAnythingBackbone:
    """Depth Anything V2 (any HF depth-estimation checkpoint) with tiled, globally aligned inference."""

    def __init__(self, cfg: Settings = default_settings, model: str | None = None):
        import torch
        from transformers import AutoImageProcessor, AutoModelForDepthEstimation

        self.cfg = cfg
        self.device = pick_device(cfg.device)
        self.model_key = model or cfg.model
        self.name = resolve_model_id(self.model_key)
        kw = {"token": cfg.hf_token} if cfg.hf_token else {}
        try:
            self.processor = AutoImageProcessor.from_pretrained(self.name, **kw)
            self.model = AutoModelForDepthEstimation.from_pretrained(self.name, **kw)
        except Exception as exc:  # offline first run, gated repo, bad id
            raise RuntimeError(
                f"Depth model '{self.name}' is not on this machine and could not be downloaded "
                f"({type(exc).__name__}). Run `depthwizard prefetch` while online, or set DW_HF_TOKEN "
                "for gated models."
            ) from exc
        if cfg.finetuned and Path(cfg.finetuned).exists():
            state = torch.load(cfg.finetuned, map_location="cpu")
            state = state.get("state_dict", state)
            missing, unexpected = self.model.load_state_dict(state, strict=False)
            log.info(
                "fine-tuned weights %s (missing=%d unexpected=%d)",
                cfg.finetuned,
                len(missing),
                len(unexpected),
            )
            self.name += f"+{Path(cfg.finetuned).name}"
        self.dtype = torch.float16 if self.device == "cuda" else torch.float32
        self.model.to(self.device, dtype=self.dtype).eval()
        self.torch = torch
        self.lock = threading.Lock()

    def _forward(self, rgb: np.ndarray) -> np.ndarray:
        torch = self.torch
        h, w = rgb.shape[:2]
        f = self.cfg.infer_res / max(h, w)
        th = max(14, int(round(h * f / 14)) * 14)
        tw = max(14, int(round(w * f / 14)) * 14)
        inputs = self.processor(
            images=Image.fromarray(rgb),
            return_tensors="pt",
            size={"height": th, "width": tw},
            keep_aspect_ratio=False,
            do_resize=True,
        )
        pixel_values = inputs["pixel_values"].to(self.device, dtype=self.dtype)
        with torch.inference_mode():
            pred = self.model(pixel_values=pixel_values).predicted_depth
            if self.cfg.tta:
                flipped = self.model(pixel_values=torch.flip(pixel_values, dims=[3])).predicted_depth
                pred = 0.5 * (pred + torch.flip(flipped, dims=[2]))
            pred = torch.nn.functional.interpolate(
                pred[:, None].float(), size=(h, w), mode="bicubic", align_corners=False
            )[0, 0]
        return pred.cpu().numpy()

    def predict(self, rgb: np.ndarray, progress: Callable[[float], None] | None = None) -> np.ndarray:
        with self.lock:
            return tiled_predict(
                self._forward,
                rgb,
                tile=self.cfg.tile,
                overlap=self.cfg.overlap,
                global_max=self.cfg.infer_res,
                progress=progress,
            )


_backbones: dict[str, DepthBackbone] = {}
_injected: DepthBackbone | None = None
_lock = threading.Lock()


def get_backbone(cfg: Settings = default_settings, model: str | None = None) -> DepthBackbone:
    """Cached backbone per model preset. An injected backbone (tests) wins for every model."""
    if _injected is not None:
        return _injected
    name = model or cfg.model
    key = f"{name}|{cfg.device}|{cfg.infer_res}|{cfg.tile}|{cfg.overlap}|{cfg.tta}|{cfg.finetuned}"
    with _lock:
        if key not in _backbones:
            log.info("loading depth model %s", resolve_model_id(name))
            _backbones[key] = DepthAnythingBackbone(cfg, model=name)
        return _backbones[key]


def loaded_models() -> list[str]:
    return [b.name for b in _backbones.values()]


def set_backbone(backbone: DepthBackbone | None) -> None:
    """Inject a backbone for tests or alternative models."""
    global _injected
    _injected = backbone
