"""python -m worker.run --token-file <app data>/worker.token [model folders]"""
import argparse
import os
from pathlib import Path
import uvicorn


def main():
    parser = argparse.ArgumentParser(description="rgdqwer CPU 분석 Worker (모델 자동 다운로드 없음)")
    parser.add_argument("--token-file", required=True)
    parser.add_argument("--florence-dir")
    parser.add_argument("--wd14-dir")
    parser.add_argument("--port", type=int, default=8189)
    args = parser.parse_args()
    for value, env in [(args.token_file, "STUDIO_WORKER_TOKEN_FILE"), (args.florence_dir, "STUDIO_FLORENCE_DIR"), (args.wd14_dir, "STUDIO_WD14_DIR")]:
        if value:
            os.environ[env] = str(Path(value).resolve())
    os.environ["HF_HUB_OFFLINE"] = "1"
    uvicorn.run("worker.app:app", host="127.0.0.1", port=args.port, workers=1, access_log=False)


if __name__ == "__main__":
    main()
