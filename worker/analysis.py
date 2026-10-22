"""Bounded image input and one CPU inference at a time."""
import base64
import binascii
import io
import threading
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from PIL import Image, ImageOps, UnidentifiedImageError
from .adapters import infer, model_status

router = APIRouter()
lock = threading.Lock()
MAX_IMAGE = 5 * 1024 * 1024


class AnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    image: str = Field(min_length=1, max_length=6990508)
    model: Literal["florence", "wd14", "both"]


def decode_image(value: str) -> Image.Image:
    try:
        raw = base64.b64decode(value, validate=True)
        if len(raw) > MAX_IMAGE:
            raise ValueError("파일은 5 MiB 이하여야 합니다.")
        with Image.open(io.BytesIO(raw)) as source:
            if source.format not in ("PNG", "JPEG", "WEBP") or getattr(source, "n_frames", 1) != 1:
                raise ValueError("PNG/JPEG/WebP 단일 이미지가 필요합니다.")
            if max(source.size) > 8192 or source.width * source.height > 16 * 1024 * 1024:
                raise ValueError("이미지는 16 MP, 한 변 8192 픽셀 이하여야 합니다.")
            source.verify()
        with Image.open(io.BytesIO(raw)) as source:
            oriented = ImageOps.exif_transpose(source).convert("RGBA")
            canvas = Image.new("RGBA", oriented.size, (255, 255, 255, 255))
            canvas.alpha_composite(oriented)
            return canvas.convert("RGB")
    except (binascii.Error, UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise ValueError("이미지 파일이 손상되었거나 지원하지 않는 형식입니다.") from error


@router.get("/analysis/status")
def status():
    return {"busy": lock.locked(), "device": "cpu", "models": model_status()}


@router.post("/analysis")
def analyze(request: AnalysisRequest):
    if not lock.acquire(blocking=False):
        raise HTTPException(409, "이미 분석 중입니다. 종료 후 다시 시도하세요.")
    try:
        try:
            image = decode_image(request.image)
        except ValueError as error:
            raise HTTPException(422, str(error)) from error
        try:
            result = infer(image, request.model)
            return {**result, "width": image.width, "height": image.height}
        except FileNotFoundError as error:
            raise HTTPException(503, "로컬 분석 모델과 선택형 패키지를 준비하세요.") from error
        except Exception as error:
            raise HTTPException(500, "분석에 실패했습니다. 모델 호환성과 메모리를 확인하세요.") from error
    finally:
        lock.release()
