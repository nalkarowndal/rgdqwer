"""Synthetic pixels/model outputs verify contracts, not AI quality."""
import base64
import io
import threading
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import pytest
from PIL import Image
from fastapi.testclient import TestClient
from worker.app import app


def encoded(image=None, format="PNG"):
    stream = io.BytesIO()
    (image or Image.new("RGB", (16, 8), "red")).save(stream, format=format)
    return base64.b64encode(stream.getvalue()).decode()


@pytest.fixture
def client(tmp_path, monkeypatch):
    token = tmp_path / "worker.token"
    token.write_text("a" * 64)
    monkeypatch.setenv("STUDIO_WORKER_TOKEN_FILE", str(token))
    monkeypatch.delenv("STUDIO_FLORENCE_DIR", raising=False)
    monkeypatch.delenv("STUDIO_WD14_DIR", raising=False)
    return TestClient(app, base_url="http://127.0.0.1", headers={"Authorization": "Bearer " + "a" * 64})


def test_analysis_auth_precedes_body_parsing(client):
    response = client.post("/analysis", content=b"not json", headers={"Authorization": "wrong"})
    assert response.status_code == 401
    assert client.get("/analysis/status", headers={"Origin": "http://evil.example"}).status_code == 403
    assert client.get("/analysis/status", headers={"Host": "evil.example"}).status_code == 403


def test_no_models_has_actionable_status_not_fake_result(client):
    status = client.get("/analysis/status")
    assert status.status_code == 200
    assert all(not model["available"] for model in status.json()["models"])
    response = client.post("/analysis", json={"image": encoded(), "model": "florence"})
    assert response.status_code == 503
    assert "caption" not in response.json()


def test_input_limits_and_unknown_fields(client):
    assert client.post("/analysis", content=b"x" * (7 * 1024 * 1024 + 1)).status_code == 413
    for body in [{"image": "bad", "model": "wd14"},
                 {"image": encoded(), "model": "remote"},
                 {"image": encoded(), "model": "wd14", "path": "/etc/passwd"},
                 {"image": base64.b64encode(b"<svg/>").decode(), "model": "wd14"}]:
        assert client.post("/analysis", json=body).status_code == 422


def test_image_decode_bounds_orientation_alpha_and_animation():
    from worker.analysis import decode_image
    image = decode_image(encoded(Image.new("RGBA", (2, 1), (255, 0, 0, 0))))
    assert image.getpixel((0, 0)) == (255, 255, 255)
    with pytest.raises(ValueError):
        decode_image(encoded(Image.new("RGB", (8193, 1))))
    with pytest.raises(ValueError):
        decode_image(encoded(Image.new("RGB", (4097, 4096))))
    with pytest.raises(ValueError):
        decode_image(base64.b64encode(b"a" * (5 * 1024 * 1024 + 1)).decode())
    original = Image.new("RGB", (2, 3)); exif = original.getexif(); exif[274] = 6
    stream = io.BytesIO(); original.save(stream, format="JPEG", exif=exif)
    assert decode_image(base64.b64encode(stream.getvalue()).decode()).size == (3, 2)
    stream = io.BytesIO(); original.save(stream, format="PNG", save_all=True, append_images=[Image.new("RGB", (2, 3), "red")])
    with pytest.raises(ValueError):
        decode_image(base64.b64encode(stream.getvalue()).decode())


def test_wd14_preprocess_matches_white_square_bgr_float32():
    from worker.adapters import prepare_wd14
    output = prepare_wd14(Image.new("RGB", (2, 1), (255, 0, 0)), 2)
    assert output.shape == (1, 2, 2, 3)
    assert output.dtype == np.float32
    assert output[0, 0, 0].tolist() == [0, 0, 255]
    assert output[0, 1, 0].tolist() == [255, 255, 255]


def test_wd14_scores_reject_mismatch_nan_and_exclude_rating():
    from worker.adapters import select_tags
    labels = [{"name": "safe", "category": "9"}, {"name": "blue_eyes", "category": "0"}, {"name": "character", "category": "4"}]
    assert select_tags(labels, [0.99, 0.8, 0.8]) == [{"name": "blue eyes", "score": 0.8, "category": "general"}]
    assert select_tags(labels, [0.99, 0.1, 0.9])[0]["category"] == "character"
    for scores in [[0.9], [0.8, float("nan"), 0.9], [0.9, 1.01, 0.9]]:
        with pytest.raises(ValueError):
            select_tags(labels, scores)


def test_analysis_lock_preserves_first_request_and_sanitizes_errors(client, monkeypatch):
    from worker import analysis
    entered, release = threading.Event(), threading.Event()
    def infer(_image, _model):
        entered.set(); release.wait(3)
        return {"caption": "Synthetic fixture", "ocr": "", "tags": [], "models": ["fixture"]}
    monkeypatch.setattr(analysis, "infer", infer)
    with ThreadPoolExecutor() as pool:
        first = pool.submit(client.post, "/analysis", json={"image": encoded(), "model": "florence"})
        assert entered.wait(2)
        try:
            assert client.get("/analysis/status").json()["busy"] is True
            assert client.post("/analysis", json={"image": encoded(), "model": "florence"}).status_code == 409
        finally:
            release.set()
        assert first.result().json()["caption"] == "Synthetic fixture"
    def fail(*_args):
        raise RuntimeError("secret path /private/model")
    monkeypatch.setattr(analysis, "infer", fail)
    response = client.post("/analysis", json={"image": encoded(), "model": "florence"})
    assert response.status_code == 500
    assert "private" not in response.text
    assert client.get("/analysis/status").json()["busy"] is False


def test_florence_adapter_uses_local_native_cpu_and_preserves_task_output(tmp_path, monkeypatch):
    """Dependency seam fixture, not actual model inference."""
    import sys
    from contextlib import nullcontext
    from types import SimpleNamespace
    from worker.adapters import FlorenceAdapter
    calls = []
    class Inputs(dict):
        def to(self, device):
            assert device == "cpu"
            return self
    class Processor:
        def __call__(self, **kwargs):
            return Inputs(task=kwargs["text"])
        def batch_decode(self, output, **kwargs):
            return output
        def post_process_generation(self, text, task, image_size):
            assert image_size == (16, 8)
            return {task: text}
    class Model:
        def to(self, device):
            assert device == "cpu"
            return self
        def eval(self):
            return self
        def generate(self, task, **kwargs):
            assert kwargs == {"max_new_tokens": 512, "num_beams": 3, "do_sample": False}
            return ["Synthetic caption" if task == "<MORE_DETAILED_CAPTION>" else "Synthetic OCR"]
    def load_processor(path, **kwargs):
        calls.append(kwargs)
        assert path == str(tmp_path.resolve())
        return Processor()
    def load_model(path, **kwargs):
        calls.append(kwargs)
        return Model()
    monkeypatch.setitem(sys.modules, "torch", SimpleNamespace(float32="float32", inference_mode=nullcontext))
    monkeypatch.setitem(sys.modules, "transformers", SimpleNamespace(AutoProcessor=SimpleNamespace(from_pretrained=load_processor), Florence2ForConditionalGeneration=SimpleNamespace(from_pretrained=load_model)))
    result = FlorenceAdapter(tmp_path).analyze(Image.new("RGB", (16, 8)))
    assert result == {"caption": "Synthetic caption", "ocr": "Synthetic OCR"}
    assert calls[0] == {"local_files_only": True, "trust_remote_code": False}
    assert calls[1] == {"local_files_only": True, "use_safetensors": True, "dtype": "float32"}


def test_wd14_adapter_validates_runtime_shape_and_dictionary(tmp_path, monkeypatch):
    import sys
    from types import SimpleNamespace
    from worker.adapters import WD14Adapter
    (tmp_path / "selected_tags.csv").write_text("name,category\nblue_eyes,0\n", encoding="utf-8")
    shape = [1, 448, 448, 3]
    output = np.array([[0.8]], dtype=np.float32)
    class Session:
        def __init__(self, path, providers):
            assert providers == ["CPUExecutionProvider"]
        def get_inputs(self):
            return [SimpleNamespace(name="input", shape=shape, type="tensor(float)")]
        def run(self, _names, values):
            assert values["input"].shape == (1, 448, 448, 3)
            return [output]
    monkeypatch.setitem(sys.modules, "onnxruntime", SimpleNamespace(InferenceSession=Session, disable_telemetry_events=lambda: None))
    assert WD14Adapter(tmp_path).analyze(Image.new("RGB", (16, 8)))["tags"][0]["name"] == "blue eyes"
    shape[:] = [1, 3, 448, 448]
    with pytest.raises(ValueError):
        WD14Adapter(tmp_path).analyze(Image.new("RGB", (16, 8)))
    shape[:] = [1, 448, 448, 3]
    output = np.array([[0.8, 0.4]], dtype=np.float32)
    with pytest.raises(ValueError):
        WD14Adapter(tmp_path).analyze(Image.new("RGB", (16, 8)))
