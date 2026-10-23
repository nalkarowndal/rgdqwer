"""Protect analysis before reading JSON; no CORS or browser-to-worker API."""
import json
import os
import re
import secrets
from pathlib import Path

MAX_BODY = 7 * 1024 * 1024


class WorkerSecurity:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not scope["path"].startswith("/analysis"):
            return await self.app(scope, receive, send)
        headers = dict(scope["headers"])
        async def reject(code, message):
            body = json.dumps({"detail": message}).encode()
            await send({"type": "http.response.start", "status": code, "headers": [(b"content-type", b"application/json"), (b"cache-control", b"no-store")]})
            await send({"type": "http.response.body", "body": body})
        if not re.fullmatch(rb"(127\.0\.0\.1|localhost)(:\d+)?", headers.get(b"host", b"")) or b"origin" in headers:
            return await reject(403, "Worker는 같은 PC의 앱 서버에서 연결하세요.")
        try:
            token = Path(os.environ["STUDIO_WORKER_TOKEN_FILE"]).read_text().strip()
            if not re.fullmatch(r"[a-f0-9]{64}", token):
                raise ValueError()
        except (KeyError, OSError, ValueError):
            return await reject(503, "Worker 토큰 파일을 지정하세요.")
        if not secrets.compare_digest(headers.get(b"authorization", b""), f"Bearer {token}".encode()):
            return await reject(401, "Worker 인증 실패: 앱과 같은 토큰 파일을 지정하세요.")
        chunks, size = [], 0
        while True:
            event = await receive()
            if event["type"] == "http.disconnect":
                return
            chunk = event.get("body", b""); size += len(chunk)
            if size > MAX_BODY:
                return await reject(413, "업로드 용량 제한을 초과했습니다.")
            chunks.append(chunk)
            if not event.get("more_body", False):
                break
        delivered = False
        async def bounded_receive():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": b"".join(chunks), "more_body": False}
            return await receive()
        await self.app(scope, bounded_receive, send)
