"""Independent diagnostics and optional local image analysis worker."""
import csv
import io
import platform
import subprocess

from fastapi import FastAPI
from .analysis import router
from .security import WorkerSecurity

app = FastAPI(title="rgdqwer worker", version="0.4.0", docs_url=None, redoc_url=None)

app.add_middleware(WorkerSecurity)
app.include_router(router)


def detect_hardware() -> dict:
    result = {
        "platform": platform.system(),
        "python": platform.python_version(),
        "gpu_status": "unavailable",
        "cuda_inference_verified": False,
        "gpus": [],
    }
    try:
        process = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total,memory.free,driver_version",
             "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=3, check=True,
        )
        for row in csv.reader(io.StringIO(process.stdout)):
            if not row:
                continue
            if len(row) != 4:
                raise ValueError("Unexpected GPU response")
            total, free = int(row[1].strip()), int(row[2].strip())
            if not 0 <= free <= total:
                raise ValueError("Invalid GPU memory")
            result["gpus"].append({
                "name": row[0].strip(), "memory_total_mib": total,
                "memory_free_mib": free, "driver": row[3].strip(),
            })
        result["gpu_status"] = "detected" if result["gpus"] else "unavailable"
    except FileNotFoundError:
        pass
    except (subprocess.SubprocessError, ValueError, OSError):
        result["gpu_status"] = "error"
        result["gpus"] = []
    return result


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok", "engine": "rgdqwer-worker",
        "capabilities": [], "hardware": detect_hardware(),
    }
