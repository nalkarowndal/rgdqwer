import subprocess
from fastapi.testclient import TestClient
from worker.app import app, detect_hardware


def test_health_does_not_claim_generation_support():
    result = TestClient(app).get("/health")
    assert result.status_code == 200
    assert result.json()["engine"] == "rgdqwer-worker"
    assert result.json()["capabilities"] == []
    assert result.json()["hardware"]["cuda_inference_verified"] is False


def test_missing_driver_is_not_reported_as_cuda_ready(monkeypatch):
    def missing(*_args, **_kwargs):
        raise FileNotFoundError()
    monkeypatch.setattr(subprocess, "run", missing)
    assert detect_hardware()["gpu_status"] == "unavailable"


def test_driver_output_reports_mib_without_claiming_inference(monkeypatch):
    monkeypatch.setattr(subprocess, "run", lambda *_a, **_k: subprocess.CompletedProcess(
        [], 0, stdout="NVIDIA GeForce RTX 2060 SUPER, 8192, 7000, 580.0\n", stderr=""
    ))
    result = detect_hardware()
    assert result["gpus"][0]["memory_total_mib"] == 8192
    assert result["cuda_inference_verified"] is False


def test_malformed_driver_output_is_an_error(monkeypatch):
    monkeypatch.setattr(subprocess, "run", lambda *_a, **_k: subprocess.CompletedProcess(
        [], 0, stdout="unexpected\n", stderr=""
    ))
    assert detect_hardware()["gpu_status"] == "error"


def test_gpu_probe_timeout_is_recoverable(monkeypatch):
    def timeout(*_args, **_kwargs):
        raise subprocess.TimeoutExpired("nvidia-smi", 3)
    monkeypatch.setattr(subprocess, "run", timeout)
    assert detect_hardware()["gpu_status"] == "error"
