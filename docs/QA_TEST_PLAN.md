# QA 계획 및 실행 기록

검증일: 2026-10-21 (Asia/Seoul). 작업 환경: Linux, Node 24.19.0, Python 3.12.14.
모델/GPU 검증 결과와 애플리케이션 검증 결과를 구분한다.

## M1 실행 기록 — 2026-10-21 UTC

| 검사 | 결과 | 범위 |
|---|---|---|
| 타입 / lint / 프로덕션 빌드 | 통과 | React, Node, Electron |
| `npm test` | 43개 통과 | M0 회귀 19, 그래프/입력 9, 생성 통합 15 |
| Worker pytest | 5개 통과 | 기존 진단 기능 회귀 |
| Playwright | 3개 통과 | 생성→PNG 다운로드→기록→설정/시드 재사용, M0 UI 회귀 |
| Electron smoke | 통과 (아래 제한 적용) | 실제 창·UI 로딩, 격리 설정 |
| npm audit | 보고된 취약점 0 | 테스트용 ws를 8.22.0으로 갱신 |
| Windows / Linux CI | 원격 결과 확인 중 | 아래에 실행 링크 기록 예정 |
| 실제 모델/GPU, Windows Electron | 미검증 | M0/M1 실기 게이트 유지 |

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
