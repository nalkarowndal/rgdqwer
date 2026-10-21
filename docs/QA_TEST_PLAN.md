# QA 계획 및 실행 기록

검증일: 2026-10-21 (Asia/Seoul). 작업 환경: Linux, Node 24.19.0, Python 3.12.14.
모델/GPU 검증 결과와 애플리케이션 검증 결과를 구분한다.

## 최종 실행 결과

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
| Windows GitHub Actions | 설정만 작성 | 원격 실행 결과 아직 확인하지 않음 |
| 실제 ComfyUI/GPU 생성 | 미검증 | 엔진·모델·대상 GPU 없음 |

Python 테스트에 upstream Starlette TestClient의 httpx 사용 중단 예정 경고 1건이 있다.
테스트 실패는 아니다. Playwright 색상 환경 변수 경고도 있으며 브라우저 런타임 오류는 없었다.
Python 패키지 보안 감사는 수행하지 않았다. npm 결과를 Python 또는 전체 제품 안전성으로 확대하지 않는다.

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
- 위 검증 후 M0 전체 통과를 기록하고 M1 실제 생성으로 진행.

## M1 이후 공통 QA

모델 로딩, 생성 파일의 실제 존재/디코딩, VRAM peak, 취소 대상 격리, 재시도,
모델 교체, 앱 재시작 기록 복구를 검사한다. 영상은 재생/FPS/프레임/길이,
음성은 TTS 및 VC 각각 출력/재생/권한 확인을 추가한다.
장시간 작업·메모리 누수·Windows 신규 설치는 M8 필수 항목이다.
