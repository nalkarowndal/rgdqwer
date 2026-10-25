# Windows 설치와 복구 — v0.9.0

이 설치본은 **서명되지 않은 M8 검증용 Windows x64 빌드**입니다. 의도한 대상은 Windows 10/11 x64입니다. 호스팅 Windows CI와 실제 사용자 PC 검증은 다르며, 깨끗한 Windows 클라이언트·GPU·실제 모델 검증은 아직 필요합니다. 자동 업데이트와 공개 릴리스는 제공하지 않습니다.

## 설치

검증된 빌드: [CI #43](https://github.com/nalkarowndal/rgdqwer/actions/runs/40153440698), 구현 커밋 `f31dece`. [Windows x64 설치본 받기](https://github.com/nalkarowndal/rgdqwer/actions/runs/40153440698/artifacts/12583985492)에서 설치 exe와 체크섬을 함께 받습니다. GitHub 로그인 및 저장소 접근 권한이 필요하며 아티팩트는 보존 기간 후 만료됩니다.

1. 해당 PR의 **Studio validation** Actions 실행에서 Windows 검사가 성공했는지 확인합니다. 로그인 후 `rgdqwer-windows-x64-unsigned` 아티팩트를 내려받아 압축을 풉니다. 아티팩트 보존 기간은 14일입니다.
2. `rgdqwer-0.9.0-windows-x64-unsigned-setup.exe`와 `SHA256SUMS.txt`를 함께 확인합니다. PowerShell `Get-FileHash .\rgdqwer-0.9.0-windows-x64-unsigned-setup.exe -Algorithm SHA256`의 값이 목록과 같아야 합니다. 체크섬은 파일 일치 검사이며 게시자 서명을 대신하지 않습니다.
3. 출처와 검증 상태를 확인한 뒤 설치 파일을 실행합니다. 현재 사용자 계정에 설치하며 관리자 권한을 요청하지 않습니다. 서명이 없어 Windows가 알 수 없는 게시자/SmartScreen 경고를 표시할 수 있습니다. 조직의 실행 정책은 따르며 보안 기능을 해제하지 마세요.
4. 시작 메뉴의 **rgdqwer**를 실행합니다. 기본 설치 위치는 `%LOCALAPPDATA%\Programs\rgdqwer`, 데이터는 `%APPDATA%\rgdqwer\studio`입니다. 설치 직후 자동 실행하지 않습니다.

앱 실행에는 Node.js 개발 환경이 필요하지 않습니다. 설치본에는 Electron·UI·로컬 API·Python Worker **소스**와 안내가 포함됩니다. Python 실행기, AI 모델, ComfyUI, FFmpeg, Git은 포함하지 않습니다. 엔진이 없어도 앱·설정·프롬프트 편집·기록 화면을 사용할 수 있습니다. 생성 기능은 아래 준비가 필요합니다.

## 기능별 준비

| 기능 | 별도 준비 |
|---|---|
| 이미지·Krea·Wan 생성 | 해당 모델/노드를 설치한 ComfyUI, GPU 호환 드라이버·Torch, `http://127.0.0.1:8188` 연결 |
| 영상 변환·음성 처리 | FFmpeg와 ffprobe를 PATH에 설치; 또는 `STUDIO_FFMPEG`, `STUDIO_FFPROBE`에 실행 파일 절대 경로 |
| 이미지 분석 | 독립 Python 3.12 환경, 분석 패키지와 로컬 Florence-2/WD14 모델, 인증된 Worker 실행 |
| 음성 | Chatterbox용 Python 3.11 / RVC용 Python 3.10 별도 환경, 로컬 모델·카탈로그; 아래 음성 안내 참조 |
| 확장 소스 가져오기 | Git; 노드 의존성 설치·코드 검토는 수동 |

모델은 제공자의 조건을 확인하고 별도로 준비합니다. 모델 관리자에서 로컬 파일을 가져오거나 확인된 원격 다운로드 정보를 입력합니다. [모델 관리자](MODEL_MANAGER.md), [이미지](IMAGE_SYSTEM.md), [Krea](KREA_SYSTEM.md), [영상](VIDEO_SYSTEM.md)을 참고하세요. VRAM 표시나 저VRAM 선호 설정이 8GB에서의 실행 성공을 보증하지 않습니다.

### 설치본에서 이미지 분석 Worker 실행

앱을 한 번 실행해 토큰 파일을 만든 뒤, 앱과 다른 PowerShell에서 다음을 실행합니다. 가상환경은 설치 폴더 밖에 두어 업그레이드 시 보존합니다.

```powershell
$studioInstall = Join-Path $env:LOCALAPPDATA 'Programs\rgdqwer'
$studioPythonSources = Join-Path $studioInstall 'resources\python'
$studioEnv = Join-Path $env:LOCALAPPDATA 'rgdqwer-analysis-env'
py -3.12 -m venv $studioEnv
& "$studioEnv\Scripts\python.exe" -m pip install -r "$studioPythonSources\worker\requirements-lock.txt"
# 실제 모델 분석 패키지·Torch 설치는 IMAGE_TO_PROMPT.md의 환경별 안내를 따릅니다.
Push-Location $studioPythonSources
& "$studioEnv\Scripts\python.exe" -B -m worker.run --token-file "$env:APPDATA\rgdqwer\studio\worker.token" --florence-dir 'D:\AI\Florence-2-base' --wd14-dir 'D:\AI\wd14'
Pop-Location
```

기본 Worker 주소는 `http://127.0.0.1:8189`입니다. [이미지 분석 환경](IMAGE_TO_PROMPT.md)의 `worker/...` 경로는 설치본에서 `$studioPythonSources\worker\...`로 바꿉니다. 토큰 파일 내용은 공유하지 마세요. Worker 토큰은 재시작 후에도 보존됩니다. 프로필을 바꾸거나 토큰을 재생성했다면 올바른 토큰 파일로 Worker를 다시 시작합니다. Worker는 앱이 자동 시작하지 않습니다.

### 설치본에서 음성 실행

[음성 환경 안내](VOICE_SYSTEM.md)의 의존성 파일은 `resources\python\voice_worker\requirements-chatterbox.txt` 및 `requirements-rvc.txt`에 있습니다. 두 가상환경과 모델은 설치 폴더 밖에 준비하고, `STUDIO_CHATTERBOX_PYTHON`, `STUDIO_CHATTERBOX_DIR`, `STUDIO_RVC_PYTHON`, `STUDIO_RVC_CATALOG`, `STUDIO_VOICE_DEVICE`를 해당 안내에 맞게 지정합니다. 환경 변수를 설정한 PowerShell에서 `& "$studioInstall\rgdqwer.exe"`로 실행합니다. 이미 실행 중인 앱은 먼저 종료해야 새 환경 변수가 적용됩니다. 실제 추론 의존성의 Windows 설치·음질·마이크·GPU 검증은 별도입니다.

## 백업·업그레이드·제거

- 앱과 진행 중인 Worker 작업을 종료한 뒤 `%APPDATA%\rgdqwer\studio` **전체**를 복사합니다. SQLite, 결과, 원본 미디어, 프로필, 모델 메타데이터를 함께 보존합니다. 모델 관리 경로를 바꿨다면 외부 모델 루트도 별도 백업합니다.
- 복원은 앱을 닫은 상태에서 전체 폴더를 복원합니다. DB만 옮기면 미디어/모델 경로가 어긋날 수 있습니다. 외부 절대 경로는 같은 위치로 복구하거나 모델 관리 화면에서 재설정합니다. 백업에는 목소리·이미지 등 개인 파일이 있으므로 접근을 제한합니다.
- 같은 앱 ID의 새 설치본을 실행하면 업그레이드합니다. 설치 폴더에 사용자 파일·가상환경·모델을 넣지 마세요. 설치 리소스는 교체됩니다. 이전 버전으로의 DB 역이행은 지원하지 않습니다.
- Windows 설정 → 설치된 앱 → rgdqwer 제거로 앱을 지웁니다. 사용자 데이터·외부 모델은 보존합니다. 완전 삭제가 필요하면 백업 후 본인이 해당 폴더를 별도로 삭제합니다.
- 독립 프로필은 `rgdqwer.exe --user-data-dir="D:\AI\studio-profile"`처럼 **절대 경로**로 지정합니다. 그 안의 `studio`를 백업하고 Worker 토큰 경로도 변경합니다. 같은 프로필을 여러 앱에서 동시에 쓰지 마세요.

## 문제 해결

| 증상 | 확인 |
|---|---|
| 엔진 연결 실패 | ComfyUI/Worker를 직접 시작하고 loopback 주소·포트 확인 |
| 모델/노드 없음 | 선택 모델의 필수 파일·노드·ComfyUI 추가 경로와 재시작 확인 |
| Python/FFmpeg 없음 | 독립 환경의 실행기 절대 경로, PATH, 새 환경 변수로 앱 재시작 |
| 저장/가져오기 실패 | 여유 디스크·권한·외부 드라이브 연결 확인; 미완료 삭제는 같은 작업 재시도/재시작 |
| 앱 시작 실패 | 오류 창 내용 기록, 데이터 백업 후 새 절대 경로 프로필로 진단; 원래 DB를 임의 삭제하지 않기 |
| 생성 상태 불명 | ComfyUI 큐/기록 확인 후 추적 재개; 자동 재제출하지 않음 |

패키지 내 `resources\THIRD_PARTY_NOTICES.txt`, `dependencies.json` 및 Electron의 `LICENSE.electron.txt`/`LICENSES.chromium.html`에 제3자 고지가 있습니다. 앱의 오픈소스 라이선스 부여를 뜻하지 않습니다. [릴리스 검증 목록](RELEASE_CHECKLIST.md)에 실기 검증과 남은 제한을 기록합니다.
