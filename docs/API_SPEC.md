# M2 API

기본 웹 서버 `http://127.0.0.1:4310`. Electron은 OS가 배정한 loopback 포트를 사용한다.
JSON, 최대 요청 본문 128KiB, no-store. CORS 개방 없음.

| 메서드 / 경로 | 응답 / 동작 |
|---|---|
| GET /api/session | `{token}`. 같은 origin UI가 시작 시 호출 |
| GET /api/health | `{status:"ok",app:"rgdqwer",milestone:"M2"}` |
| GET /api/settings | Settings |
| PUT /api/settings | 검증된 Settings 전체 교체, 영속화 후 반환 |
| GET /api/engine/status | EngineStatus |
| GET /api/worker/status | WorkerStatus |
| POST /api/jobs | ImageInput → 202 Job. 잘못된 입력 400, 기존 작업 추적 중 409 |
| GET /api/jobs/:id | Job 또는 404 |
| POST /api/jobs/:id/cancel | 해당 작업 취소 요청. 종료 확인 전 완료로 간주하지 않음 |
| POST /api/jobs/:id/resume | 기존 prompt ID 추적만 재개. 생성 재제출 없음 |
| GET /api/artifacts/:id | 인증된 image/png 스트림. 파일 없음 404 |
| GET /api/prompt-records | 프리셋/기록 snapshot, 생성 시각 내림차순 |
| POST /api/prompt-records | `{kind,name,profile,document}` → 201 PromptRecord. 잘못된 문서 400, 프리셋 100개 상한 409 |
| DELETE /api/prompt-records/:id | `{deleted:true}` 또는 404. 이미지/Job 보존 |
| GET /api/jobs | 최근 최대 100개 Job (생성 시각 내림차순) |

세션 경로 이외에는 `Authorization: Bearer <token>`이 필요하다.
Host는 127.0.0.1/localhost만 허용한다. 외부 Origin, cross-site 요청은 403.
개발 서버 origin은 127.0.0.1:5173만 허용한다.
401은 세션 새로고침, 400은 입력 수정, 500은 로컬 데이터 경로/디스크 확인으로 안내한다.

Settings: comfyUrl, workerUrl, comfyPath, modelPath 문자열과 lowVram boolean.
URL은 http://127.0.0.1[:port] 루트만 허용. 경로/질의/해시/사용자 인증정보 금지.

EngineStatus: state(connected/disconnected/error), message, checkedAt(ISO),
devices[{name,type,vramTotal,vramFree}], ramTotal, checkpoints[], version.
메모리는 bytes이며 미측정값은 null이다. ComfyUI stats 3초, 모델 조회 3초 제한.
모델 목록 조회 실패는 연결 상태와 분리해 message로 표시한다.

WorkerStatus: state, message, capabilities[], 선택 hardware.
Worker GET /health는 `{status:"ok",engine:"rgdqwer-worker",capabilities:[],hardware}`.
GPU 메모리는 명시적으로 MiB를 사용한다. Node 조회 제한 4.5초, nvidia-smi 3초.
M0에는 파일 변경/모델 실행 Worker API가 없다. 추가 전 인증 계약을 설계해야 한다.

ImageInput: profile(sd15/sdxl/illustrious), checkpoint, prompt, negative,
width, height, seed, steps, cfg. 상세 상한은 [이미지 시스템](IMAGE_SYSTEM.md) 참고.

Job: id, kind=image, state, createdAt, updatedAt, input, workflowVersion,
engineUrl, promptId, progress(샘플러 0–100 또는 null), error, artifacts[], log[], cancelRequested.
상태: preparing → queued/running → postprocessing → completed.
추가 상태 failed/cancelled/cancelling/interrupted/unknown. unknown/interrupted는 신규 생성을 막는다.
Artifact: id, fileName(UUID.png), width, height. 절대 파일 경로는 노출하지 않는다.
UI는 1초 간격 Job API를 조회한다. ComfyUI WebSocket은 Node가 구독하며 브라우저 WS API는 없다.
취소 API가 없는 구버전 엔진은 409, 취소 결과 미확인은 502로 안내한다.

ImageInput은 optional promptDocument(v1)를 받는다. 있으면 컴파일 결과와 prompt/negative의 정확한 일치를 요구한다.
PromptRecord는 id,createdAt,kind(preset/history),name,profile,document,result를 포함한다.
result에는 positive,negative,style,unresolved,warnings,engineVersion,valid가 있다. 모든 새 API도 인증이 필요하다.
