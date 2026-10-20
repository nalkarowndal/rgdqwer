# M0 API

기본 웹 서버 `http://127.0.0.1:4310`. Electron은 OS가 배정한 loopback 포트를 사용한다.
JSON, 최대 요청 본문 32KiB, no-store. CORS 개방 없음.

| 메서드 / 경로 | 응답 / 동작 |
|---|---|
| GET /api/session | `{token}`. 같은 origin UI가 시작 시 호출 |
| GET /api/health | `{status:"ok",app:"rgdqwer",milestone:"M0"}` |
| GET /api/settings | Settings |
| PUT /api/settings | 검증된 Settings 전체 교체, 영속화 후 반환 |
| GET /api/engine/status | EngineStatus |
| GET /api/worker/status | WorkerStatus |
| GET /api/jobs | 최근 최대 100개 작업. M0는 생성 기능이 없어 빈 목록 |

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

생성 API, WebSocket 진행률 전달, 취소, 파일 다운로드는 M1 이후 별도 계약으로 추가한다.
