"""Optional, local-only CPU adapters. No hub downloads or remote Python code."""
import csv
import gc
import importlib.util
import math
import os
from pathlib import Path
from typing import Protocol

import numpy as np
from PIL import Image


class Adapter(Protocol):
    def analyze(self, image: Image.Image) -> dict: ...


def model_status() -> list[dict]:
    result = []
    for name, env, files, packages in [
        ("florence", "STUDIO_FLORENCE_DIR", ["config.json", "tokenizer_config.json", "preprocessor_config.json"], ["torch", "transformers"]),
        ("wd14", "STUDIO_WD14_DIR", ["model.onnx", "selected_tags.csv"], ["onnxruntime"]),
    ]:
        root = Path(os.environ.get(env, ""))
        configured = bool(os.environ.get(env)) and root.is_dir() and all((root / file).is_file() for file in files)
        if name == "florence":
            configured = configured and bool(list(root.glob("*.safetensors")))
        dependencies = all(importlib.util.find_spec(package) is not None for package in packages)
        available = configured and dependencies
        result.append({"id": name, "available": available, "reason":
                       "파일·패키지 발견 · 추론 호환성 미검증" if available else
                       "로컬 모델 폴더와 필수 파일을 지정하세요." if not configured else "선택형 분석 패키지를 설치하세요."})
    return result


def prepare_wd14(image: Image.Image, size: int) -> np.ndarray:
    rgba = image.convert("RGBA")
    canvas = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
    canvas.alpha_composite(rgba)
    side = max(canvas.size)
    square = Image.new("RGB", (side, side), "white")
    square.paste(canvas.convert("RGB"), ((side - canvas.width) // 2, (side - canvas.height) // 2))
    square = square.resize((size, size), Image.Resampling.BICUBIC)
    return np.asarray(square, dtype=np.float32)[None, :, :, ::-1].copy()


def select_tags(labels: list[dict], scores) -> list[dict]:
    if len(labels) != len(scores) or not all(math.isfinite(float(s)) and 0 <= float(s) <= 1 for s in scores):
        raise ValueError("태그 사전과 모델 출력이 호환되지 않습니다.")
    result = []
    for row, score in zip(labels, scores):
        category = row["category"]
        if category not in ("0", "4") or float(score) < (0.85 if category == "4" else 0.35):
            continue
        name = row["name"]
        # Preserve kaomoji; replace underscores only in ordinary word tags.
        if len(name) > 3 and name[0].isalnum():
            name = name.replace("_", " ")
        if not name or len(name) > 200:
            raise ValueError("태그 이름 길이를 확인하세요.")
        result.append({"name": name, "score": float(score), "category": "character" if category == "4" else "general"})
    return sorted(result, key=lambda item: item["score"], reverse=True)[:100]


class WD14Adapter:
    def __init__(self, root: Path):
        self.root = root

    def analyze(self, image: Image.Image) -> dict:
        import onnxruntime as ort
        ort.disable_telemetry_events()
        session = ort.InferenceSession(str(self.root / "model.onnx"), providers=["CPUExecutionProvider"])
        inputs = session.get_inputs()
        if len(inputs) != 1 or inputs[0].type != "tensor(float)":
            raise ValueError("WD14 float32 입력 모델이 필요합니다.")
        shape = inputs[0].shape
        if len(shape) != 4 or shape[0] not in (1, None, "batch_size", "N") or shape[3] != 3 or not isinstance(shape[1], int) or shape[1] != shape[2] or not 32 <= shape[1] <= 1024:
            raise ValueError("WD14 NHWC 정사각 모델이 필요합니다.")
        with (self.root / "selected_tags.csv").open(encoding="utf-8-sig", newline="") as stream:
            labels = list(csv.DictReader(stream))
        if not 1 <= len(labels) <= 100000 or any(not {"name", "category"} <= row.keys() for row in labels):
            raise ValueError("태그 사전을 확인하세요.")
        scores = session.run(None, {inputs[0].name: prepare_wd14(image, shape[1])})[0]
        if scores.ndim != 2 or scores.shape[0] != 1:
            raise ValueError("WD14 출력 형식을 확인하세요.")
        return {"tags": select_tags(labels, scores[0])}


class FlorenceAdapter:
    def __init__(self, root: Path):
        self.root = root

    def analyze(self, image: Image.Image) -> dict:
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
        import torch
        from transformers import AutoProcessor, Florence2ForConditionalGeneration
        path = str(self.root.resolve())
        processor = AutoProcessor.from_pretrained(path, local_files_only=True, trust_remote_code=False)
        model = Florence2ForConditionalGeneration.from_pretrained(
            path, local_files_only=True, use_safetensors=True, dtype=torch.float32,
        ).to("cpu").eval()
        result = {}
        with torch.inference_mode():
            for task, key in [("<MORE_DETAILED_CAPTION>", "caption"), ("<OCR>", "ocr")]:
                inputs = processor(text=task, images=image, return_tensors="pt").to("cpu")
                output = model.generate(**inputs, max_new_tokens=512, num_beams=3, do_sample=False)
                decoded = processor.batch_decode(output, skip_special_tokens=False)[0]
                parsed = processor.post_process_generation(decoded, task=task, image_size=image.size)[task]
                if not isinstance(parsed, str):
                    raise ValueError("Florence 출력 형식을 확인하세요.")
                result[key] = parsed[:4000]
        return result


ADAPTERS = {"florence": (FlorenceAdapter, "STUDIO_FLORENCE_DIR"), "wd14": (WD14Adapter, "STUDIO_WD14_DIR")}


def infer(image: Image.Image, model: str) -> dict:
    names = ["florence", "wd14"] if model == "both" else [model]
    status = {item["id"]: item for item in model_status()}
    if any(not status[name]["available"] for name in names):
        raise FileNotFoundError("모델/패키지를 준비하세요.")
    result = {"caption": "", "ocr": "", "tags": [], "models": names}
    try:
        for name in names:
            adapter, env = ADAPTERS[name]
            result.update(adapter(Path(os.environ[env])).analyze(image))
            gc.collect()
    finally:
        gc.collect()
    return result
