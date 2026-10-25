# QA 계획 및 실행 기록

검증일: 2026-10-21 (Asia/Seoul). 작업 환경: Linux, Node 24.19.0, Python 3.12.14.
모델/GPU 검증 결과와 애플리케이션 검증 결과를 구분한다.

## M5 실행 기록 — 2026-10-23

| 검증 | 결과 | 범위 |
|---|---|---|
| 타입 / lint / build | 통과 | v0.6.0 |
| Vitest | 100개 통과 | 기존82 + 영상 계약5/실제미디어9/HTTP·lifecycle4 |
| Python | 14개 통과 | 기존 분석 어댑터 회귀 |
| Playwright | 10개 통과 | 기존8 + 실제 MP4 업로드/변환/재생/다운로드/재사용/추출/390px + 분석 전달 |
| 실제 FFmpeg | 통과 | 합성 testsrc2 MP4, Lanczos 확대/minterpolate/PNG추출, ffprobe와 전체디코드 |
| Node/Python HTTP smoke | 통과 | 실제 로컬서버, 세션인증, PNG디코드, 모델없음503 |
| Electron Linux smoke | 통과 | sandbox/contextIsolation true, nodeIntegration false; 테스트전용Linux sandbox override |
| npm audit production | 0건 | 실제 모델/FFmpeg 외부 설치파일은 별도 |
| Windows/Linux CI | 최종 코드 양쪽 통과 | cb102f7, [run39990976111](https://github.com/nalkarowndal/rgdqwer/actions/runs/39990976111), 100JS/14Python/10E2E 및 Worker HTTP smoke |
| 실제 Wan/Krea/SD GPU 추론 | 미검증 | Comfy/모델/GPU가 없는 환경; 모의 엔진은 그래프/상태검증만 |

영상 검증물은 **합성 테스트 패턴**이며 AI 영상으로 표시하지 않는다. M5의 실제 변환/MP4재생 경로를 검증했다. Wan AI V2V는 실험적이며 품질/시간적일관성/8GB VRAM은 별도실기게이트. 화면: `docs/qa/m5-video.png`, `m5-video-mobile.png`.

RED→GREEN: 영상계약/미디어모듈 부재, 업로드API404, jobs400, 전용UI부재를 확인 후 구현. 연속업로드409는응답전cleanup완료로수정했고, dynamic codec의설명문자열오인검사는실제nested옵션검사로수정했다. 제한sandbox의자식Node eval무출력은network권한이포함된표준테스트환경에서재검증했다. 존재하지않는smoke.mjs호출은실제Node HTTP스크립트로대체했다.

2026-10-24 독립리뷰 Important3건(프레임해상도변경,오디오/컨테이너길이,저FPS출력/V2V패딩)을 실제파일 RED→GREEN으로 수정했다. [리뷰와 판단 기록](superpowers/reviews/2026-10-24-m5-review.md). 새Minor없음.

## M4 실행 기록 — 2026-10-23

| 검사 | 결과 | 범위 |
|---|---|---|
| 타입 / lint / build | 통과 | v0.5.0 |
| Vitest | 82개 통과 | 기존69 + Krea 계약/그래프7 + HTTP/lifecycle6 |
| Python | 14개 통과 | 기존 Worker 회귀 |
| Playwright | 8개 통과 | 기존6 + Krea 설정/스타일/생성/재사용/390px + 분석 전달 |
| 실제 Node↔Python HTTP smoke | 통과 | 인증/디코딩/미설치503 회귀, inferenceVerified=false |
| Linux Electron smoke | 통과 | 제품 sandbox/contextIsolation=true,nodeIntegration=false, 테스트 전용 Linux sandbox override |
| npm audit | 0건 | moderate 이상 포함 |
| Windows / Linux CI | 양쪽 통과 | 코드24515638,82JS/14Python/8E2E 및 실제 Worker HTTP smoke |
| 실제 Krea RAW/Turbo / Qwen3VL 확장 / LoRA | 미검증 | 로컬 가중치와 GPU 없음 |
| Windows 데스크톱 / RTX2060SUPER8GB | 미검증 | CI와 사용자의 실기 구분 |

Krea 신규 계약/경로의 RED→GREEN, 확장문 저장 누락 회귀 RED→GREEN을 기록했다.
브라우저 초기 실패: Krea 미구현 화면, 잘못된 분석 캡션 label을 실제 label로 수정, 기존8GB 안내 유지 후 전체8개 통과.
새Job 생성 시 모델 목록을 재검사하고 SD와 한 작업 잠금을 공유하며 Krea 설정/PNG/확장문을 저장한다.
캡처: [Krea 화면](qa/m4-krea.png), [390px 화면](qa/m4-krea-mobile.png). 목록·GPU 없음·흰PNG는 모의fixture로 실제 추론 증거가 아니다.

[CI #39904204443](https://github.com/nalkarowndal/rgdqwer/actions/runs/39904204443)는 코드 커밋 `245156383da5f3f42ca4fcf13e1731609aabc1c0`에서 양쪽 OS 모두 성공했다. 이후 커밋은 검증 문서만 갱신했다.

독립 리뷰: Critical/Important 없음, RAW에서 사용하지 않는 ConditioningZeroOut까지 요구하는 경미한 과잉 검사1건 유예. [상세 리뷰·결정](superpowers/reviews/2026-10-23-m4-review.md).

남은 실기 게이트: 공식 모델 RAW/Turbo 각각 생성/저장/취소/재시작, 한국어 확장 품질, LoRA9종 및2K,
8GB에서 RAM/VRAM/시간/실패 원인 기록. RAW 어댑터와 CFG/shift 근거는 [Krea 시스템](KREA_SYSTEM.md).

## M3 실행 기록 — 2026-10-22

| 검사 | 결과 | 범위 |
|---|---|---|
| 타입 / lint / build | 통과 | v0.4.0, 가상환경 vendor 코드는 lint 제외 |
| Vitest | 69개 통과 | 기존58 + 분석 계약/잠금5 + 인증 프록시6 (큰 PNG/종료 회귀 포함) |
| Python | 14개 통과 | 기존5 + 보안/디코딩/동시 실행/전처리/adapter seam9 |
| Playwright | 6개 통과 | 기존4 + 업로드/재분석/잠금/진행 중 수정/페이지 이동/실패 보존/생성 요청 + 미설치 안내 |
| 실제 Node↔Python HTTP smoke | 통과 | token 인증, PNG 디코딩, 미설치503, 직접 미인증401 |
| Linux Electron smoke | 통과 | 테스트 전용 sandbox override 사용, 제품 sandbox 설정 true |
| 선택형 CPU 패키지 | 설치/import/pip check 통과 | torch2.10.0+cpu / torchvision0.25.0+cpu / Transformers5.20.2 / ONNX Runtime1.31.0 |
| npm audit | 0건 | moderate 이상 포함 |
| 실제 Florence/WD14 가중치 / 품질 | 미검증 | 로컬 가중치 없음; fixture를 실추론으로 주장하지 않음 |
| Windows optional 추론 / Electron / RTX2060SUPER | 미검증 | CI와 사용자의 실제 데스크톱 검증은 구분 |

M3 초기 API/UI 테스트는 미구현 경로에서 실패 후 통과했다. Worker 초기 실패 실행은 socket sandbox로 정지해,
별도 M2 기준 복사본에서 새7개 테스트의 실패를 확인한 뒤 현재14개 통과를 확인했다.
추가2개 adapter seam은 synthetic dependency 출력 계약 테스트다. 원래 캡션 제외 회귀는 RED→GREEN.
캡션과 수정 필드의 모순을 자동으로 해결한다고 주장하지 않으며 포함 스위치와 안내를 제공한다.

캡처: [분석 화면](qa/m3-analysis.png), [390px 화면](qa/m3-analysis-mobile.png).
흰색 업로드/캡션/태그/생성 이미지는 명시적 모의 fixture다. 실제 분석 결과가 아니다.

남은 M3 통과 조건: Windows에서 선택형 패키지 설치 및 로컬 Florence/WD14 실제 추론,
잠금/수정 후 실제 ComfyUI 생성, CPU 시간/RAM/분석 품질 기록. 이후 GPU 경로를 별도 설계/검증한다.
2026-10-23 (Asia/Seoul) 후속: 독립 리뷰가 허용 크기 PNG의 base64 정규식 stack overflow를 발견했고,
실제4.2MiB PNG API 회귀의 500→200으로 수정했다. 추가로 분석 중 앱 종료가 요청 종료를 기다리는 문제를
preClose abort와 실제 HTTP 종료 회귀로 수정했다. 다른 주요 리뷰 결함/유예 minor는 없었다.
수정 전 76e8406의 [Windows/Linux CI](https://github.com/nalkarowndal/rgdqwer/actions/runs/39762147368)는 모두 통과했다.
수정 후 전체 타입/lint/build, Vitest69, Python14 및 Node→Python smoke를 다시 통과했다.
최종 수정 코드 `782cc13`의 [Windows/Linux CI #39875093552](https://github.com/nalkarowndal/rgdqwer/actions/runs/39875093552)도 모두 통과했다.
각 OS의69개 JS·14개 Python·6개 E2E와 실제 Worker HTTP smoke를 포함한다. 이후 커밋은 검증 기록 문서만 갱신했다.
[독립 리뷰·수정·실행 결정 기록](superpowers/reviews/2026-10-23-m3-review.md).

## M2 실행 기록 — 2026-10-22 (Asia/Seoul)

M2는 실제 GPU를 제공받지 않은 동일한 Linux 개발 환경에서 검증했다.

| 검사 | 결과 | 범위 |
|---|---|---|
| TypeScript / ESLint / 프로덕션 빌드 | 통과 | 기존 앱과 공통 프롬프트 편집기 |
| Vitest | 58개 통과 | 기존43 + 프롬프트 규칙9 + 저장/생성 API6 |
| Python Worker | 5개 통과 | 기존 진단 회귀 |
| Playwright | 4개 통과 | 모드/페이지 이동 수정 보존, preset 복원, 생성 문자열 일치, 연속 생성,390px 및 M0/M1 회귀 |
| Electron smoke | 통과 (기존 Linux 제한 동일) | 실제 창/격리 설정 |
| npm audit | 보고된 취약점 0 | 테스트용 Vitest4.1.12 패치 후 전체 검증 |
| Windows / Linux CI | 양쪽 모두 통과 | 설치, 타입/lint/58개 테스트, 빌드, Python, 브라우저4개 |
| 실제 모델/GPU | 미검증 | 전체 문장 번역 또는 생성 품질 증거로 해석하지 않음 |

원격 검증: [Studio validation #39699683006](https://github.com/nalkarowndal/rgdqwer/actions/runs/39699683006),
코드 커밋 `6d79b3f565d9cfa36af8358ba8daeb255748b77d`. 이후 QA 결과 문서만 갱신했다.

사전의 정확한 키워드만 변환하고 부정/미지원 한국어 구절은 그대로 보존한다.
공백·가중치·빈 negative를 유지하며 수동 결과가 원문/모드 변경으로 덮어써지지 않는지 검사했다.
v2 DB migration, 재오픈, preset/history 각각100개, 실패한 DB 쓰기에서 Job+history 동시 롤백,
잘못된 문서/인증/최종 문자열 불일치 거절을 확인했다. 독립 리뷰도 prompt/API15개 테스트를 실행했다.

브라우저 통합 중 연속 생성에서 이전 결과 이미지 상태가 새 Job에 남아 화면이 중단되는
M1 문제를 발견했다. trace의 artifact.fileName TypeError를 확인하고 Job ID별 컴포넌트로 분리했다.
반복 생성과 브라우저 런타임 오류0을 포함해 재검증했다.

M2 캡처: [프롬프트 스튜디오](qa/m2-prompt-studio.png), [390px 화면](qa/m2-prompt-mobile.png).
원문/편집/저장/생성 연결 테스트의 ComfyUI 및 출력 PNG는 명시적인 fixture다.
한국어 자유 문장 번역, 모델별 프롬프트 품질과 실제 GPU 검증은 별도다.

## M1 실행 기록 — 2026-10-21 UTC

| 검사 | 결과 | 범위 |
|---|---|---|
| 타입 / lint / 프로덕션 빌드 | 통과 | React, Node, Electron |
| `npm test` | 43개 통과 | M0 회귀 19, 그래프/입력 9, 생성 통합 15 |
| Worker pytest | 5개 통과 | 기존 진단 기능 회귀 |
| Playwright | 3개 통과 | 생성→PNG 다운로드→기록→설정/시드 재사용, M0 UI 회귀 |
| Electron smoke | 통과 (아래 제한 적용) | 실제 창·UI 로딩, 격리 설정 |
| npm audit | 보고된 취약점 0 | 테스트용 ws를 8.22.0으로 갱신 |
| Windows / Linux CI | 양쪽 모두 통과 | 설치, 타입/lint/43개 테스트, 빌드, Python, 브라우저 E2E |
| 실제 모델/GPU, Windows Electron | 미검증 | M0/M1 실기 게이트 유지 |

원격 검증: [Studio validation #39608518693](https://github.com/nalkarowndal/rgdqwer/actions/runs/39608518693),
코드 커밋 `425673a90c687b3fae4251f7a9ab671396d85555`. Ubuntu 및 Windows 모두 성공했다.
이후 QA 결과 문서만 갱신했으며 실행 코드는 같다.

모의 엔진은 실제 HTTP와 WebSocket 서버이며, 생성 결과로 알려진 512px 흰색 PNG를 반환한다.
이미지 품질·GPU 추론을 검증하는 테스트가 아니다. API payload, 큐 소유권, 진행률, PNG 파일 및 DB
저장·인증, 외부 큐, 손상 PNG/잘못된 경로, 실행 실패/재시도, 작업별 취소 미지원 동작을 검증했다.
응답을 받기 전 앱 종료 후 재시작해도 제출 횟수가 1회임을 확인했다.
엔진 기록이 사라졌을 때 재개 후 15초간 부재 확인을 거쳐 새 생성이 가능함도 검사했다.

독립 코드 리뷰에서 아래 두 문제를 재현하고 회귀 테스트 4개 RED→GREEN으로 수정했다.

1. 늦은 취소 응답이 종료/재개된 작업 상태를 덮어씀: 현재 추적 인스턴스의 소유권을 다시 확인한다.
2. 중복 IHDR 및 ancillary 청크 CRC 오류가 PNG 디코더를 통과함: 디코딩 전 청크 구조/전체 CRC를
   검사하고 디코딩 후 크기도 재확인한다. 잘못된 파일은 완료로 기록하지 않는다.

M1 캡처: [생성 폼](qa/m1-image-form.png), [작업 기록](qa/m1-library.png).
기록 화면의 흰 이미지는 모의 fixture이며 AI가 만든 작품이 아니다.

### M1 실기 체크리스트

- Windows에서 최신 ComfyUI와 설치한 모델의 정확한 버전을 기록한다.
- SD1.5 512px부터 실제 생성/디코딩/PNG 메타데이터/다운로드를 확인한다.
- SDXL 및 Illustrious는 각각 검증한다. 1024px 실패 시 768/512px로 낮춰 VRAM peak를 기록한다.
- 실제 작업별 취소, 엔진 오류 뒤 재시도, 앱 종료·재시작, 모델 교체를 확인한다.
- 구버전 ComfyUI는 취소 API 및 사용자 지정 prompt ID를 지원하지 않을 수 있다.
- 실기 통과 전 M1 전체 완료 또는 8GB 호환 보장으로 발표하지 않는다.

## M0 실행 기록 (이전 버전)

| 검사 | 결과 | 범위 |
|---|---|---|
| `npm run typecheck` | 통과 | React/Node/Electron TypeScript |
| `npm run lint` | 통과 | ESLint 및 React Hook 규칙 |
| `npm test` | 19개 통과 | SQLite, 인증, 주소 검증, 모의 ComfyUI HTTP |
| `npm run build` | 통과 | Node/Electron JS + 프로덕션 React 번들 |
| `python -m pytest worker/tests -q` | 5개 통과 | Worker 상태, GPU 없음/정상/손상/시간 초과 |
| `npm run test:e2e` | 2개 통과 | 설치된 Chromium, 실제 Node/React, 모의 ComfyUI |
| `node scripts/smoke-desktop.mjs` | 통과 (제한 있음) | Electron 창 생성 및 실제 UI 로딩 |
| 실제 Uvicorn → Node Worker adapter | 통과 | 진단 서버 연결, GPU unavailable, CUDA 검증 false |
| `npm audit --audit-level=low` | 보고된 취약점 0 | 고정된 npm 의존성 트리 |
| Linux / Windows GitHub Actions | 양쪽 모두 통과 | 설치, 타입/린트/API, 빌드, Python, 브라우저 E2E |
| 실제 ComfyUI/GPU 생성 | 미검증 | 엔진·모델·대상 GPU 없음 |

Python 테스트에 upstream Starlette TestClient의 httpx 사용 중단 예정 경고 1건이 있다.
테스트 실패는 아니다. Playwright 색상 환경 변수 경고도 있으며 브라우저 런타임 오류는 없었다.
Python 패키지 보안 감사는 수행하지 않았다. npm 결과를 Python 또는 전체 제품 안전성으로 확대하지 않는다.

원격 검증: [M0 validation #39519083630](https://github.com/nalkarowndal/rgdqwer/actions/runs/39519083630),
코드 커밋 `dc745541d1fb7b357d2d391300cec13e6a6c1b8d`에서 Ubuntu 및 Windows runner 모두 성공.
Windows CI는 웹 환경에서 테스트하며 Windows Electron 창 실행이나 실제 NVIDIA GPU 테스트를 포함하지 않는다.

## UI 검수

- 한국어 대시보드, 10개 카테고리, 설정 입력/저장/새로고침 후 복구.
- 허용하지 않는 LAN URL 안내, 연결 실패 복구 안내.
- 미구현 생성 버튼 비활성화 및 Krea 8GB 실기 검증 전 표시.
- 모의 ComfyUI → Node adapter → React까지 실제 HTTP 경로로 GPU/모델 표시.
- CPU 모드에서 시스템 메모리를 GPU 메모리로 표시하지 않음.
- 1440px 및 390px 레이아웃과 문서 전체 가로 넘침 없음 확인.
- form label, 상태/오류 role, 포커스 및 내비게이션 상태를 구현했다.
  전문 스크린리더·WCAG 전 항목 감사는 수행하지 않았다.

캡처: [데스크톱](qa/dashboard-desktop.png), [좁은 화면](qa/dashboard-mobile.png),
[Electron smoke](qa/electron-smoke.png). 모의 GPU 값은 실제 장치 검증이 아니다.

## Electron 검증의 한계

이 Linux 컨테이너는 일반 Chromium sandbox 실행에 필요한 구성이 없어 기본 실행은 실패했다.
테스트 스크립트에서만 `--no-sandbox --ozone-platform=headless`를 사용해 창·UI 로딩을 확인했다.
제품 BrowserWindow 설정은 sandbox=true, contextIsolation=true, nodeIntegration=false를 유지한다.
이 결과는 Windows sandbox 또는 실제 GPU 렌더링 통과를 의미하지 않는다.
headless 디스플레이 크기 때문에 Electron 캡처는 좁은 레이아웃으로 표시된다.

## 발견 및 수정

1. raw URL 기준 인증 검사가 `/%61pi/settings`를 놓침: GET/PUT 실패 테스트 4개 작성 후
   Fastify가 매칭한 route 기준으로 검사해 통과 확인.
2. 빈 `{system:{},devices:[]}`를 연결 성공으로 오판: 실패 테스트 후 os/python_version 필수 검사.
3. CPU 장치 메모리를 GPU로 표시: 브라우저 실패 테스트 후 GPU 타입 선택 및 CPU 안내 추가.
4. RAM UI 표시라는 문구를 실제 구현인 RAM API 조회로 정정.
5. 저장 실패 시 메모리/디스크 설정 보존을 임시 파일 쓰기 실패 테스트로 확인.
6. 초기 npm 후보 의존성의 보안 항목을 수정 버전으로 해결하고 전체 검사 재수행.

첫 로컬 소켓 테스트는 실행 환경 권한 부족(EPERM)으로 실패했다. 허용된 네트워크 권한으로
다시 실행해 통과했다. Playwright CDN 다운로드는 정책상 차단되어 설치된 Chromium을 사용했다.

## 남은 M0 통과 조건

- Windows 10/11에서 `npm ci`, `npm run setup:desktop`, 빌드, 기본 sandbox 상태의 앱 실행.
- 실제 ComfyUI 설치에 연결해 버전/장치/체크포인트 응답 확인.
- 사용자 경로(한글 포함), 앱 종료·재시작, 데이터 저장 및 접근 실패 확인.
- 위 검증 후 M0 전체 통과를 기록한다. M1 구현과 별개로 실기 게이트를 유지한다.

## M1 이후 공통 QA

모델 로딩, 생성 파일의 실제 존재/디코딩, VRAM peak, 취소 대상 격리, 재시도,
모델 교체, 앱 재시작 기록 복구를 검사한다. 영상은 재생/FPS/프레임/길이,
음성은 TTS 및 VC 각각 출력/재생/권한 확인을 추가한다.
장시간 작업·메모리 누수·Windows 신규 설치는 M8 필수 항목이다.

## M6 실행 기록 — 2026-10-24

- `npm run check`: 타입·lint 및 JS 111개 통과. 프로필 권한/음성 입력, 공유 작업 잠금, 프로세스 취소/실패/복구, 손상 출력 거부, 녹음 지연 이벤트 검증 포함.
- Python: 기존 14 + 음성 7 = 21개 통과. Chatterbox/RVC 외부 API 계약 대역은 실제 추론으로 간주하지 않는다.
- 전체 기존 브라우저 10 + 음성 프로필/업로드 1 통과. 추가 비교/재사용 및 Chromium 가상 마이크로 실제 WebM 녹음·WAV 정규화 검사 통과(음성 브라우저 3개, 기존 10개).
- 실제 FFmpeg PCM/MP3 정규화, 오디오 재생과 390px 화면을 확인. `docs/qa/m6-voice.png`, `m6-voice-mobile.png`.
- Linux Electron sandbox/contextIsolation 스모크 및 실제 Python HTTP 인증/이미지 디코드/모델 누락 503 스모크 통과.
- 음성 모델/GPU 없음: 실제 TTS/ChatterboxVC/RVC, 다국어 품질, 8GB 최고 VRAM, Windows 마이크 검증 보류. `scripts/smoke-voice.mjs`로 실제 모델을 검증해야 M6 통과를 선언할 수 있다.

M6 리뷰 수정 후: 마이크 권한 지연 실패 경합·비UTF8 CLI·RVC 시드 누락을 RED→GREEN으로 수정했습니다. 최종 로컬 타입/lint/build, JS112, Python22, 브라우저13 통과. [리뷰 및 판단 기록](superpowers/reviews/2026-10-24-m6-review.md).

최종 코드 `b87d0ec`의 [Windows/Linux CI 40048032479](https://github.com/nalkarowndal/rgdqwer/actions/runs/40048032479)가 모두 성공했습니다. 각 OS에서 JS112, Python22, 브라우저13, 타입/lint/build와 실제 Python HTTP smoke를 확인했습니다. 이후 커밋은 검증 문서만 갱신합니다.

## M7 실행 기록 — 2026-10-24

리뷰 전 코드: 타입/lint/build, JS131, Python22, 브라우저14 통과. 실제 파일 복사·SHA256·삭제 보호·소스 보존·루트 변경·중단 복구·디스크 오류·심볼릭 링크 거부, 공개 주소/리디렉션/크기/해시/취소, 로컬 Git 고정 checkout·정적 소스 검토·노드 활성화/변경 보호·Python 캐시를 검증했다. DB v5 이행, 105개 작업의 검색/페이지/즐겨찾기 저장과 인증된 M7 경로도 확인했다.

브라우저에서 권한 확인→실제 로컬 가져오기→모의 ComfyUI 생성→검색/즐겨찾기/비교→경로 YAML 생성→비동기 /free→참조 확인 후 삭제를 통과했다. desktop/mobile 스크린샷은 test-results/models-*.png다. 기존 음성 fixture는 새 /api/library 응답 계약을 사용한다. Linux Electron(테스트 전용 sandbox override), 실제 Python HTTP 인증/디코드/미설치 모델503 smoke 통과.

실서비스 대용량 다운로드, 실제 ComfyUI 확장 패키지/의존성 설치, Windows 데스크톱·실제 모델/GPU·VRAM 해제 실측·8GB 장시간 안정성은 검증 전이다. 모의 엔진/스트림을 실제 추론이나 실서비스 다운로드로 주장하지 않는다. M7 실기 통과 판정은 보류한다.

M7 리뷰 수정 후 — 2026-10-25 (KST): 루트 Git 기록 보호, 삭제/비활성화의 내구성 있는 복구 의도, 사용 불가 모델 경로에서도 앱 시작, 다른 페이지에서 선택한 비교 작업 갱신을 RED→GREEN으로 수정했다. 최종 로컬 타입/lint/build, JS136, Python22(변경 없음), 브라우저15 통과. Linux Electron smoke 재실행 통과. 실제 DB 닫기/재열기 후 삭제 기록 복구도 확인했다. [리뷰·등급 판단·검토 제외 항목 기록](superpowers/reviews/2026-10-25-m7-review.md).

M7 최종 코드 `09cebcdedccb0b0e69ac2a96772d34ca70ee89b8`의 [Windows/Ubuntu CI](https://github.com/nalkarowndal/rgdqwer/actions/runs/40108216342)가 모두 성공했다. 두 플랫폼에서 타입/lint/build, JS136, Python22, 브라우저15, Python HTTP smoke를 통과했다. 이후 검증 기록 커밋은 문서만 변경한다. [초안 PR #7](https://github.com/nalkarowndal/rgdqwer/pull/7), base `codex/m6-voice-studio`; 병합하지 않았다.

## M8 실행 기록 — 2026-10-25 (KST)

v0.9.0의 per-user Windows x64 NSIS 패키징, 외부 Python 소스 경로, ASAR/리소스 검사, 설치본 실행·재시작 검사와 반복 작업 QA를 추가했다. 서명·공개 릴리스·병합은 하지 않는다.

로컬 Linux: 타입/lint/build, JS144, Python22, 브라우저16 통과. 10개 화면의 키보드 진입과 1440/760px 레이아웃 검사, 기존 390px 및 음성·영상·모델 UI 검사를 포함한다. Python HTTP 인증/이미지 디코드/모델 부재 503 smoke 통과. 실제 Linux unpacked Electron을 ASAR에서 실행하고, 격리된 userData 경로·보안 설정·설정/가져온 모델 파일의 재시작 보존·외부 Python status 호출을 확인했다. Linux headless 실행의 `--no-sandbox`는 테스트 전용이며 제품의 sandbox 설정은 true다.

패키지 검사: ASAR5727 entries, 설치된 production dependency82개 고지, 외부 Python/WASM을 확인했다. 모델·토큰·DB·개발 의존성은 포함하지 않는다. Python 실행기·ComfyUI·FFmpeg·Git·모델은 별도 설치다.

초기 반복 검사: 21.384초/20회, 재시작1·취소2, 마지막 엔진 WebSocket0, 임시 데이터 삭제 성공. 최종 확장 검사: 180.007초/100회, 재시작5·취소10, 생성 중 유지보수409 확인. 준비 후 최대 heap 증가 2.39MiB, RSS 증가 22.22MiB로 진단 기준 이내였고 최종 엔진 연결0·임시 데이터 삭제 성공. [전체 측정 JSON](qa/m8-soak-linux.json)을 보존한다. 엔진은 명시적 테스트 대역이고 파일/HTTP/SQLite는 실제 구현이다. Electron 렌더러·GPU·실제 모델의 장시간 안정성으로 간주하지 않는다.

Windows 설치/재설치/제거 및 보존 검사는 CI에서 실제 NSIS와 설치된 exe로 수행하며 실행 URL·결과를 최종 기록에 추가한다. [설치 안내](INSTALLATION.md), [실기 수락 조건](RELEASE_CHECKLIST.md) 참조. 깨끗한 Windows10/11 일반 계정·실제 모델/GPU·음질/마이크·8GB 수시간 실행·서명 게이트가 남아 있으므로 M8 전체 수락 판정은 보류한다.

최종 리뷰 후: 저장소 cwd 상속에 의존하지 않도록 설치본 QA의 실행 디렉터리를 소유한 프로필로 지정했다. 실제 프로세스 cwd 검사 RED→GREEN, 저장소 밖의 신규 프로필 생성/재시작·외부 Python status 통과, 타입/lint·JS144 재검증 통과. 독립 리뷰의 유일한 Minor는 production 의존성 안의 테스트/fixture/benchmark 파일224개(약1.04MB) 잔존이며 사용자 데이터 노출은 발견하지 않았다. 용량/allowlist 정리는 보류한다. [전체 리뷰·판단 기록](superpowers/reviews/2026-10-25-m8-review.md).

M8 최종 구현 코드 `3ab21de3d3cf97a27117dac146bd487a676eb511`의 [Windows/Ubuntu CI #39](https://github.com/nalkarowndal/rgdqwer/actions/runs/40132233958)가 모두 성공했다. 두 OS에서 타입/lint/build, JS144, Python22, 브라우저16, Python HTTP smoke, 20회 반복 검사 통과. Windows 반복 검사는20.900초, 재시작1·취소2·마지막 엔진 연결0이었다.

Windows에서 실제 unsigned NSIS 설치 → 저장소 밖 cwd의 설치된 ASAR exe 실행 → 재설치 → 설정/가져온 모델 파일 보존 → 제거 → 격리 DB/모델 및 기본 프로필 sentinel 보존을 통과했다. 제품 sandbox/contextIsolation/webSecurity=true, nodeIntegration=false였고 Windows에는 Linux 테스트용 sandbox override를 적용하지 않았다. 외부 Python status와 ASAR5727 entries/82개 의존성 고지도 확인했다. [Windows 설치 수명주기 JSON](qa/m8-installer-windows.json), [Windows 반복 검사 JSON](qa/m8-soak-windows-ci.json)은 CI 아티팩트 ZIP의 SHA256 일치를 확인한 뒤 보존했다.

[Windows x64 검증용 설치본 아티팩트](https://github.com/nalkarowndal/rgdqwer/actions/runs/40132233958/artifacts/12575940897): `rgdqwer-windows-x64-unsigned`,127,903,291 bytes, 설치 exe·blockmap·SHA256SUMS·설치 안내 포함,14일 보존. 아티팩트 ZIP digest는 `f2350fe4312ac3abc8786f1144412951a118c08ec34bfda3d61ef8dc3437f232`이며 설치 exe 자체의 해시와 구분한다. exe 검증에는 ZIP 안의 `release/SHA256SUMS.txt`를 사용한다.

[초안 PR #8](https://github.com/nalkarowndal/rgdqwer/pull/8), base `codex/m7-model-manager`; 병합·공개 릴리스 없음. 이후 최종 기록 커밋은 문서/검증 JSON만 변경한다. 호스팅 Windows CI 성공은 깨끗한 Windows10/11 PC·실제 GPU/모델·서명 수락을 대신하지 않는다.

## M8 후속 패키지 보강 — 2026-10-25 (KST)

PR8에서 보류한 production 의존성 테스트/fixture/benchmark224개(내용1,036,889 bytes)를 제외했다. 폴더/헤더를 포함한 Linux ASAR는72,077,484→70,975,174 bytes로1,102,310 bytes 감소했고, 항목 수는5727→5473이다. 실제 ASAR 검사에서 필수 런타임/WASM·외부 Python·82개 의존성 고지를 확인했다. 중첩·스코프·Windows 구분자 경로의 거부와 runtime test.js/specification.json 등 파일 보존 테스트 RED→GREEN, 타입/lint·JS146 통과.

Linux 실제 설치본을 한글·공백이 포함된 설치 경로로 복사하고 한글·공백 프로필을 사용해 seed/restart, 실제 cwd/profile 일치, 설정·모델 보존과 외부 Python status를 확인했다. Windows CI의 설치/재설치/제거 경로도 같은 문자 조건으로 확장했다. Windows 실행 결과는 후속 기록한다. 기존 M8 측정 JSON과 이전 검증 링크는 해당 커밋의 역사적 기록으로 유지한다.

후속 최종 구현 코드 `f31decee8634f720b1cb1ac95537a5e103532f0d`의 [Windows/Ubuntu CI #43](https://github.com/nalkarowndal/rgdqwer/actions/runs/40153440698)가 모두 성공했다. 두 플랫폼에서 타입/lint/build, JS146, Python22, 브라우저16, 실제 Python HTTP smoke와20회 반복 검사 통과. Windows의 `rgdqwer 한글 QA <UUID>` 설치 디렉터리와 `프로필 data`에서 실제 ASAR exe를 실행하고 재설치/제거 후 격리 DB/모델·기본 프로필 sentinel 보존을 확인했다. 실제 패키지5473항목/82개 의존성 고지, 외부 Python 및 sandbox 설정을 확인했다. [설치 검사 JSON](qa/m8-hardening-installer-windows.json)은 QA ZIP SHA256 일치를 확인한 뒤 보존했다.

[새 Windows 설치본·체크섬 아티팩트](https://github.com/nalkarowndal/rgdqwer/actions/runs/40153440698/artifacts/12583985492)는127,763,756 bytes,14일 보존이다. ZIP digest `2d2beea9ca7c4e468fb9112e5221094c888d1c537d5f1a1ab1a98cae749d34e1`과 설치 exe용 `release/SHA256SUMS.txt`를 구분한다. [초안 PR #9](https://github.com/nalkarowndal/rgdqwer/pull/9)는 #8 위에 쌓았으며 병합하지 않았다. 최종 후속 커밋은 문서/검증 JSON만 변경한다. 기존 패키지 파일224개 잔존 Minor는 이번 변경으로 해소됐다. 클린 Windows·실제 모델/GPU·서명·접근성 수락은 계속 보류한다.
