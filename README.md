# rgdqwer

ComfyUI를 연결해 사용하는 Windows 로컬 AI 스튜디오입니다.
**현재 v0.9.0 / M8 설치 패키징·안정성 QA와 모델 관리·라이브러리·음성·영상·Krea 2·이미지 분석·프롬프트·이미지 생성 구현 버전입니다. FFmpeg 실제 변환·재생을 검증했으며, Wan/Krea/SD/Anima 실제 모델·GPU 실행은 실기 검증 전입니다. 음성 엔진 연동의 실제 모델 추론도 검증 전입니다.**

## 현재 사용할 수 있는 기능

- 로컬 Florence-2 캡션/OCR·WD14 태그 어댑터, 이미지 업로드·필드 수정/잠금·생성 연결 (모델 별도 준비)

- 간편·상세·전문가 프롬프트 편집, 한국어 키워드 변환, 프리셋·기록 저장/재사용
- SD1.5 / SDXL / Illustrious 기본 Text to Image, 샘플러 진행률 및 작업별 취소
- PNG 미리보기·다운로드, 작업 기록, 설정/시드 재사용, 재시작 후 기존 작업 추적
- Electron 데스크톱 앱 및 동일한 React 브라우저 UI
- 한국어 대시보드, 10개 내비게이션, 명확한 단계별 제공 상태
- 기존 ComfyUI 연결 검사, GPU/VRAM 표시, RAM 정보 API 조회, SD 체크포인트 조회
- SQLite에 연결 주소와 참조 경로·저VRAM 선호값 저장
- 독립 Python Worker 연결 및 NVIDIA 장치 진단
- 세션 인증, loopback 제한, 연결 시간 초과 및 오류 안내
- API·Worker·브라우저 테스트와 Windows/Linux CI 설정

## 앱에서 모델 받기

**모델·확장 관리자 → 기능별 다운로드**에서 SDXL, Anima, Krea 2, Wan 영상, Florence/WD14 분석, Chatterbox 음성 기능을 선택하고 **선택 모델 다운로드**를 누르세요. 필요한 파일·공통 인코더를 함께 받고 진행률·취소·재시도를 지원합니다. [모델 다운로드와 엔진 연결 안내](docs/FEATURE_MODEL_DOWNLOADS.md) · [속도·연결 중단 복구](docs/model-downloads.md)

## Windows 실행 파일 다운로드

**[설치 없이 실행하는 Windows ZIP 받기](https://github.com/nalkarowndal/rgdqwer/actions/runs/40316979809/artifacts/12648120760)** — GitHub 아티팩트를 받은 뒤 안쪽 `*-standalone.zip`을 새 폴더에 모두 풀고 **`rgdqwer.exe`를 더블클릭**하세요. DLL·`resources` 등 전체 폴더가 필요하며 Node.js 개발 환경은 필요하지 않습니다. 같은 Windows 계정의 설정/기록은 `%APPDATA%\rgdqwer\studio`에 저장됩니다.

[설치형 Setup 받기](https://github.com/nalkarowndal/rgdqwer/actions/runs/40316979809/artifacts/12647447548)도 제공됩니다. 두 파일은 [Windows/Ubuntu CI #67](https://github.com/nalkarowndal/rgdqwer/actions/runs/40316979809)를 통과한 x64/unsigned 검증용이며, 아티팩트는 14일 보존됩니다. GitHub 로그인과 저장소 접근 권한이 필요합니다. [실행·설치·엔진 준비·백업 안내](docs/INSTALLATION.md), [실기 검증 목록](docs/RELEASE_CHECKLIST.md)을 확인하세요. 자동 업데이트·공개 릴리스는 없습니다.

## 소스에서 빠른 시작 (Windows PowerShell)

Node.js **24 LTS**와 Python **3.12**를 권장합니다. Node 22.12+도 허용하지만 이 작업에서
실행 검증한 Node는 24.19.0입니다. GPU용 PyTorch와 모델은 앱 의존성에 포함되지 않습니다.

```powershell
git clone https://github.com/nalkarowndal/rgdqwer.git
cd rgdqwer
# 작업 브랜치가 원격에 있는 경우:
git switch codex/m3-image-to-prompt
npm ci
npm run setup:desktop
npm run build
npm start
```

Electron 실행 파일을 별도로 설치하는 `setup:desktop`은 최초 1회 인터넷을 사용합니다.
ComfyUI 및 모델은 별도로 준비해야 합니다. 정상 설치 이후 앱의 구현된 기능은 인터넷을 요구하지 않습니다.
Windows 실행형 ZIP과 설치 프로그램은 위 다운로드에서 제공합니다.

### Python Worker (선택)

ComfyUI의 Python 환경과 섞지 않습니다. 프로젝트 루트에서 별도 터미널로 실행합니다.

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install -r worker/requirements-lock.txt
.\.venv\Scripts\python -m uvicorn worker.app:app --host 127.0.0.1 --port 8189
```

위 명령은 하드웨어 진단용입니다. M3 이미지 분석에는 인증 토큰과 선택형 CPU 패키지/로컬 모델이 필요합니다.
[Image to Prompt 설치·사용법](docs/IMAGE_TO_PROMPT.md)을 따라 `python -m worker.run --token-file ...`로 실행하세요.
CUDA 추론 검증 여부는 항상 false입니다.
Worker가 없어도 ComfyUI 연결 검사는 가능합니다.

### ComfyUI 연결

기존 설치를 평소 방식으로 실행한 후 앱의 **설정**에 주소를 저장합니다.
기본값은 `http://127.0.0.1:8188`입니다. 원격 서버, API 키, API Proxy는 현재 지원하지 않습니다.
체크포인트 목록은 `CheckpointLoaderSimple` 기준이며 모든 모델 종류의 인벤토리는 아닙니다.
설치·모델 경로 및 저VRAM 선택값은 현재 **참조용 저장값**입니다. ComfyUI 설정을 바꾸지 않습니다.

### 이미지 생성

1. ComfyUI에 호환 체크포인트를 준비하고 서버를 실행합니다. 안전한 작업별 취소와
   제출 응답 유실 시 복구를 위해 최신 ComfyUI를 권장합니다.
2. 앱의 **설정**에서 연결한 후 **이미지 스튜디오**에서 모델 계열과 체크포인트를 선택합니다.
3. 프롬프트를 입력하고 필요하면 상세 설정에서 크기/스텝/CFG/시드를 조정한 후 생성합니다.
4. 결과를 PNG로 다운로드하거나 **작업 기록 / 라이브러리**에서 설정을 재사용합니다.

한 번에 이미지 1개를 생성합니다. 간편 모드는 지원 한국어 키워드를 변환하며, 최종 입력은 직접 편집할 수 있습니다.
자유 문장 전체를 번역하지 않습니다. 정확한 원문 전달은 전문가 모드를 사용하세요.
SD1.5는 512px, SDXL/Illustrious는 1024px가 기본이며 8GB 안정성은 실기 검증 전입니다.
이미지 스튜디오는 Anima Base v1과 최대4개 LoRA 파일의 강도·개별 활성/비활성 설정을 지원합니다. 꺼진 설정도 보존하며 작업 기록에서 재사용합니다. Anima 모델은 기능별 다운로드에서 받을 수 있습니다. [설정 안내](docs/IMAGE_SYSTEM.md) · Krea는 별도 Krea 2 스튜디오를 사용하세요.
상태 미확인 시 **상태 추적 재개**로 기존 작업부터 확인합니다. 자동 재제출하지 않습니다.
구버전 ComfyUI가 안전 취소를 지원하지 않으면 ComfyUI에서 직접 취소해야 합니다.
자세한 제한과 복구 동작은 [이미지 시스템](docs/IMAGE_SYSTEM.md)을 참고하세요.

### 프롬프트 스튜디오

간편 모드에서 `고양이, 숲, 부드러운 조명`을 입력하거나 상세 모드의 항목을 채웁니다.
최종 프롬프트를 직접 수정하면 모드/프로필을 바꿔도 그 값을 유지합니다.
추천을 다시 쓰려면 **수정값 지우고 추천 재적용**을 선택합니다.
프리셋을 저장하고 **이미지 스튜디오로 보내기**로 생성에 연결할 수 있습니다.
미지원 한국어 구절은 원문 그대로 남기며, LLM이나 외부 번역 서비스를 사용하지 않습니다.
미저장 초안은 새로고침 시 초기화됩니다. 자세한 동작은 [프롬프트 시스템](docs/PROMPT_SYSTEM.md)을 참고하세요.

### Krea 2 생성

Krea 2 스튜디오에서 RAW/Turbo 모델·인코더·VAE와 필수 노드를 진단하고 자연어 프롬프트, 로컬 확장, 스타일 LoRA, 화면 비율을 설정합니다. Image to Prompt 결과도 바로 전달할 수 있습니다.
모델은 공식 이용 조건에 따라 직접 준비하세요. 설치·호환성 확인·8GB 제한·실기 게이트는 [Krea 안내](docs/KREA_SYSTEM.md)를 참고하세요.

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
생성 PNG는 같은 데이터 폴더의 `outputs/`에 저장합니다.
웹 포트와 데이터 경로는 `STUDIO_PORT`, `STUDIO_DATA_DIR`로 지정합니다.
동일 데이터 폴더를 여러 서버에서 동시에 열지 마세요.

## 검증

```powershell
npm run check
npm run build
npx playwright install chromium
npm run test:e2e
.\.venv\Scripts\python -m pytest worker/tests voice_worker/tests -q
```

Linux에서 이미 설치된 Chromium을 사용하려면
`PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e`로 실행합니다.
자동 QA와 실제 모델/GPU 테스트는 별개입니다. 상세 결과는 [QA 기록](docs/QA_TEST_PLAN.md)을 확인하세요.

## 다음 단계

M8 설치 패키징과 반복 작업 QA를 구현했습니다. M0–M8의 깨끗한 Windows 클라이언트·실제 모델/GPU·수시간 안정성·서명 검증 게이트를 유지합니다. [전체 로드맵](docs/DEVELOPMENT_PHASES.md), [구조](docs/ARCHITECTURE.md),
[요구사항 원문](docs/REQUIREMENTS.md), [보안](docs/SECURITY.md)을 참고하세요.

## 영상 스튜디오 (M5)

Wan 2.2 TI2V 5B의 T2V/I2V와 실험적 V2V, FFmpeg MP4 변환·프레임 추출을 제공합니다. FFmpeg와 ffprobe를 직접 설치해 PATH에 등록하세요. 앱에서 자동 설치하지 않습니다. 원본 PNG/MP4 업로드, 영상 프롬프트 8개 항목, 프레임/FPS/크기 조절, MP4 재생·다운로드, 설정 재사용을 지원합니다.

실제 CPU 변환·보간·프레임 추출은 합성 테스트 클립으로 검증했습니다. Wan 영상 생성과 8GB GPU 안정성은 검증 전입니다. [설치·모델·제한·검증 가이드](docs/VIDEO_SYSTEM.md)를 확인하세요.

## 음성 스튜디오 (M6)

Chatterbox Multilingual TTS, ChatterboxVC, RVC 연동, 권한을 기록하는 음성 프로필, 마이크/파일 입력, 긴 대사 분할, WAV·MP3 저장과 전후/다중 결과 비교를 제공합니다. 음성 엔진은 별도 Python 환경과 로컬 모델이 필요합니다. 실제 모델 추론과 Windows 마이크·8GB GPU 검증은 남아 있으며, M6 통과 판정은 보류합니다. [설치·사용·실제 모델 검증 안내](docs/VOICE_SYSTEM.md)를 확인하세요.

## 모델·확장 관리자 (M7)

권한 확인 후 모델을 가져오거나 SHA256/크기를 검증해 다운로드하고, 관리 파일만 삭제합니다. 고정 커밋의 커스텀 노드를 별도 검토한 뒤 활성화하며 pip 설치는 자동 실행하지 않습니다. 전체 작업 검색·즐겨찾기·비교, ComfyUI 경로 설정 생성과 유휴 VRAM 해제 요청을 제공합니다. [설정·제한·검증 범위](docs/MODEL_MANAGER.md)를 확인하세요.
