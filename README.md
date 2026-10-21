# rgdqwer

ComfyUI를 연결해 사용하는 Windows 로컬 AI 스튜디오입니다.
**현재는 M0 기반 구현 버전입니다. 이미지·영상·음성 생성 기능은 아직 제공하지 않습니다.**

## 현재 사용할 수 있는 기능

- Electron 데스크톱 앱 및 동일한 React 브라우저 UI
- 한국어 대시보드, 10개 내비게이션, 명확한 단계별 제공 상태
- 기존 ComfyUI 연결 검사, GPU/VRAM 표시, RAM 정보 API 조회, SD 체크포인트 조회
- SQLite에 연결 주소와 참조 경로·저VRAM 선호값 저장
- 독립 Python Worker 연결 및 NVIDIA 장치 진단
- 세션 인증, loopback 제한, 연결 시간 초과 및 오류 안내
- API·Worker·브라우저 테스트와 Windows/Linux CI 설정

## 빠른 시작 (Windows PowerShell)

Node.js **24 LTS**와 Python **3.12**를 권장합니다. Node 22.12+도 허용하지만 이 작업에서
실행 검증한 Node는 24.19.0입니다. GPU용 PyTorch는 M0 의존성에 포함되지 않습니다.

```powershell
git clone https://github.com/nalkarowndal/rgdqwer.git
cd rgdqwer
# 작업 브랜치가 원격에 있는 경우:
git switch codex/m0-foundation
npm ci
npm run setup:desktop
npm run build
npm start
```

Electron 실행 파일을 별도로 설치하는 `setup:desktop`은 최초 1회 인터넷을 사용합니다.
ComfyUI 및 모델은 별도로 준비해야 합니다. 정상 설치 이후 앱의 M0 기능은 인터넷을 요구하지 않습니다.
Windows 설치 프로그램은 M8 범위이며 아직 없습니다.

### Python Worker (선택)

ComfyUI의 Python 환경과 섞지 않습니다. 프로젝트 루트에서 별도 터미널로 실행합니다.

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install -r worker/requirements-lock.txt
.\.venv\Scripts\python -m uvicorn worker.app:app --host 127.0.0.1 --port 8189
```

Worker는 M0에서 진단만 제공합니다. CUDA 추론 검증 여부는 항상 false입니다.
Worker가 없어도 ComfyUI 연결 검사는 가능합니다.

### ComfyUI 연결

기존 설치를 평소 방식으로 실행한 후 앱의 **설정**에 주소를 저장합니다.
기본값은 `http://127.0.0.1:8188`입니다. 원격 서버, API 키, API Proxy는 M0에서 지원하지 않습니다.
체크포인트 목록은 `CheckpointLoaderSimple` 기준이며 모든 모델 종류의 인벤토리는 아닙니다.
설치·모델 경로 및 저VRAM 선택값은 현재 **참조용 저장값**입니다. ComfyUI 설정을 바꾸지 않습니다.

### 웹 실행 / 개발

```powershell
npm run build
npm run start:web
# http://127.0.0.1:4310
```

```powershell
npm run dev
# http://127.0.0.1:5173 (Vite → Node API 4310)
```

데스크톱 데이터는 Electron userData 아래 `studio/studio.sqlite`, 웹 데이터는 `.data/studio.sqlite`입니다.
웹 포트와 데이터 경로는 `STUDIO_PORT`, `STUDIO_DATA_DIR`로 지정합니다.
동일 데이터 폴더를 여러 서버에서 동시에 열지 마세요.

## 검증

```powershell
npm run check
npm run build
npx playwright install chromium
npm run test:e2e
.\.venv\Scripts\python -m pytest worker/tests -q
```

Linux에서 이미 설치된 Chromium을 사용하려면
`PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e`로 실행합니다.
자동 QA와 실제 모델/GPU 테스트는 별개입니다. 상세 결과는 [QA 기록](docs/QA_TEST_PLAN.md)을 확인하세요.

## 다음 단계

M0의 Windows 및 실제 ComfyUI 연결 검증 후 M1에서 SD 계열 Text to Image 실행·저장·진행률을
연결합니다. [전체 로드맵](docs/DEVELOPMENT_PHASES.md), [구조](docs/ARCHITECTURE.md),
[요구사항 원문](docs/REQUIREMENTS.md), [보안](docs/SECURITY.md)을 참고하세요.
