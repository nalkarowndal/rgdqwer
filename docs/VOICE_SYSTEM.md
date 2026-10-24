# AI 음성 스튜디오 — M6

Chatterbox Multilingual TTS(한국어·일본어·영어), ChatterboxVC, RVC를 독립 Python 프로세스로 호출합니다. 프로필·권한 확인·원본·생성 설정·WAV/MP3 결과를 로컬에 저장합니다. 실제 모델 추론, Windows 마이크, 8GB GPU 안정성은 아직 검증하지 않았습니다. **M6 통과 조건은 실제 TTS와 녹음 음성 변환이 모두 성공한 뒤에만 충족됩니다.**

## 설치: Windows PowerShell

FFmpeg/ffprobe를 PATH에 설치합니다. 기존 `.venv` 이미지 분석 환경과 ComfyUI에 음성 패키지를 설치하지 마세요. Chatterbox는 NumPy 1.x, RVC는 NumPy <=1.23.5/fairseq 0.12.2를 요구하므로 두 환경도 분리합니다. 아래 의존성 파일은 확인한 upstream 소스를 고정합니다. 전이 의존성 전체 잠금 및 Windows/GPU 설치 검증은 남아 있습니다.

```powershell
py -3.11 -m venv .venv-chatterbox
.\.venv-chatterbox\Scripts\python -m pip install -r voice_worker/requirements-chatterbox.txt
$env:STUDIO_CHATTERBOX_PYTHON = (Resolve-Path .venv-chatterbox\Scripts\python.exe).Path
$env:STUDIO_CHATTERBOX_DIR = 'D:\AI\models\chatterbox'
$env:STUDIO_VOICE_DEVICE = 'cpu' # CUDA 호환 Torch/드라이버를 준비한 뒤 'cuda'
```

모델은 공식 [ResembleAI/chatterbox](https://huggingface.co/ResembleAI/chatterbox)의 이용 조건을 확인하고 위 폴더에 직접 준비합니다. 앱은 모델을 다운로드하지 않습니다.

| 기능 | 필수 파일 |
|---|---|
| Multilingual TTS v2 | `ve.pt`, `s3gen.pt`, `t3_mtl23ls_v2.safetensors`, `grapheme_mtl_merged_expanded_v1.json` |
| ChatterboxVC | `s3gen.safetensors` |

`conds.pt`는 선택 사항이며 프로필 참고 음성으로 조건을 생성합니다. 원본 엔진이 적용하는 Perth 워터마크는 유지합니다. 저장된 파일이 있다고 실제 추론 가능한 환경임을 보장하지 않습니다. 설치 오류·VRAM 부족은 작업 오류로 표시하며 임의의 합성음/CPU 대체 결과를 생성하지 않습니다. CPU는 명시적으로 선택한 실행 장치입니다.

### 선택: RVC

```powershell
py -3.10 -m venv .venv-rvc
.\.venv-rvc\Scripts\python -m pip install pip==24.0
.\.venv-rvc\Scripts\python -m pip install -r voice_worker/requirements-rvc.txt
$env:STUDIO_RVC_PYTHON = (Resolve-Path .venv-rvc\Scripts\python.exe).Path
$env:STUDIO_RVC_CATALOG = 'D:\AI\models\rvc-catalog.json'
```

RVC 환경의 `Lib\site-packages\rvc_python\base_model`에 신뢰하는 출처의 `hubert_base.pt`, `rmvpe.pt`를 직접 준비합니다. [rvc-python 소스](https://github.com/daswer123/rvc-python/tree/cff3ffbe99ce2e062831e4377f8cef587d0f38f9)를 기준으로 다운로드를 차단하고 로컬 파일만 검사합니다. 현재 어댑터는 RMVPE를 사용하므로 `rmvpe.onnx`는 필요 없습니다.

`rvc-catalog.json` 예시:

```json
[
  {"id":"my_voice","name":"내 목소리","path":"D:\\AI\\voices\\my_voice.pth","index":"D:\\AI\\voices\\my_voice.index","version":"v2"}
]
```

`index`는 선택, `version`은 v1/v2입니다. 모델 업로드나 임의 Python 코드를 UI에서 실행하지 않습니다. 화자/RMVPE 체크포인트는 weights-only로 읽습니다. Fairseq HuBERT 메타데이터는 pickle 로딩이 필요하므로 운영자가 신뢰한 `base_model/hubert_base.pt` 한 파일만 일반 로딩을 허용합니다. 출처가 불명확한 모델을 이 환경에 설치하지 마세요. 모델 카탈로그는 앱 시작/상태 확인/작업 실행 시 검증합니다.

RVC 원본 API는 리샘플된 데이터를 기존 샘플레이트로 기록하는 문제가 있어, 어댑터에서 원래 모델 샘플레이트로 출력한 뒤 Node의 FFmpeg로 24kHz에 맞춥니다. RVC 피치는 -12~12반음, Chatterbox는 피치 컨트롤을 지원하지 않습니다. 저장한 시드는 두 어댑터 모두 Torch RNG에 적용하지만 GPU·라이브러리·모델이 달라지면 비트 단위 동일성을 보장하지 않습니다.

환경 변수를 설정한 터미널에서 `npm run build`, `npm start`를 실행하고 **음성 엔진 상태와 설치 안내 → 음성 상태 새로 확인**을 선택합니다.

## 사용

1. 프로필 등록에서 3–30초 참고 음성, 이름, 언어, 사용할 엔진, 사용 허가 정보와 확인을 저장합니다. RVC는 설치된 화자 모델도 선택합니다. 현재 스타일 설정이 프로필 기본값으로 저장됩니다.
2. TTS는 대사를 입력합니다. 3000자까지, 문장 경계를 우선한 180자 이하 조각으로 생성해 순서대로 연결합니다. 강조·CFG·온도는 엔진이 실제 지원하는 값입니다.
3. VC/RVC는 파일 업로드 또는 마이크 녹음을 선택합니다. 녹음은 최대 60초이며 화면 이동/종료 시 트랙을 닫고 미완료 녹음을 폐기합니다. 마이크 권한이 거부되면 파일 업로드를 사용하세요.
4. 이번 작업의 사용 허가를 다시 확인한 뒤 생성합니다. 완료된 WAV·MP3와 변환 전 음성을 듣고 최대 4개 작업을 선택해 비교합니다. 작업 기록에서 설정을 재사용할 수 있습니다.
5. 프로필 삭제는 향후 사용 허가를 철회합니다. 이미 시작한 작업과 그 권한 스냅샷/결과는 보존됩니다. 기록에서 참조하는 원본은 삭제되지 않습니다.

허가 없는 실존 인물 사칭·비동의 복제/배포 금지 안내와 사용자 확인을 적용합니다. 자기 확인은 법적 권한을 자동으로 증명하지 않습니다.

## 처리 한도와 복구

- 업로드 WAV/MP3/WebM: 16MiB, 60초, 단일 오디오 트랙, 8–48kHz, 모노/스테레오. 참고 음성은 3–30초.
- 강제 디먹서/로컬 프로토콜만 사용하며 실제 PCM 디코드 길이도 검사합니다. 모든 입력은 모노 24kHz PCM16 WAV로 정규화합니다.
- TTS 결과 최대 600초, VC 결과 최대 65초. 최대 30분 실행, FFmpeg 처리 최대 2분. 부분 파일은 오류/취소 시 삭제합니다.
- 기존 이미지·영상과 음성은 단일 앱 작업 잠금을 공유합니다. 실행 전 연결 가능한 ComfyUI 큐도 확인합니다. 외부 앱의 GPU 사용이나 ComfyUI에 이미 상주한 모델은 앱이 통제하지 못하므로 VRAM 부족 시 다른 엔진을 종료하세요.
- 취소/정상 앱 종료는 현재 자식 프로세스를 종료한 뒤 잠금을 해제합니다. 재시작 시 중단된 로컬 작업은 실패 처리하고 자동 재제출하지 않습니다. OS 강제 종료 후 남은 엔진 프로세스는 작업 관리자에서 확인하세요.
- CPU/GPU 장치와 모델 경로는 운영자 환경 설정이며 UI 요청에서 받지 않습니다. GPU 미사용 가능 상태에서 자동 CPU 전환하지 않습니다.
- RVC 신규 학습은 기본 TTS/VC 안정화 이후 별도 작업 유형으로 추가합니다. 향후 단계: 권한 포함 데이터셋 → 전처리 → 특징/피치 추출 → 학습 체크포인트/진행률 → 인덱스 생성 → 고정 샘플 검증. 실행 잠금, 취소, 아티팩트와 승인 정보를 기존 작업 모델에 통합할 예정이며 현재 학습 버튼은 제공하지 않습니다.

## 검증

자동 테스트는 실제 FFmpeg 입력/출력 검사, 권한/프로필 보존, 자식 프로세스 종료/오류/복구, 외부 라이브러리 API 계약, 녹음 수명주기와 브라우저 업로드/재생을 확인합니다. 추론 테스트 대역은 테스트 폴더에만 있으며 실제 AI 음성 생성으로 간주하지 않습니다.

모델/장치를 준비한 PC에서 본인 또는 허가받은 참고 음성과 실제 녹음 파일로 실행합니다:

```powershell
npm run build
node scripts/smoke-voice.mjs --reference D:\audio\authorized.wav --source D:\audio\recorded.wav --out D:\audio\m6-acceptance
# RVC까지 검증하려면: --rvc-model my_voice
```

이 스크립트는 실제 API→선택한 Python→엔진→FFmpeg→WAV/MP3를 실행하며 엔진이 없으면 실패합니다. 출력과 `acceptance.json`을 보관합니다. 모든 음성을 직접 듣고 발음, 화자 유사도, 잡음, 긴 문장 경계, GPU 최고 메모리와 Windows 마이크 녹음을 별도로 기록하세요. 한국어/일본어/영어 각 대사와 최소 2개 시드로 UI에서도 확인해야 합니다.

현재 환경에는 모델/GPU가 없고 Hugging Face 호스트 접근이 제한되어 실제 추론은 실행하지 못했습니다. 이 상태를 M6 수용 테스트 통과로 표시하지 않습니다.

## 근거

Context7 및 Exa로 API를 확인하고 upstream 소스를 직접 대조했습니다:
- [Chatterbox 소스 고정본](https://github.com/resemble-ai/chatterbox/tree/5de7a54aa4e5e2baadb0182dde554908b48b85c2): `from_local`, Multilingual `generate(language_id, audio_prompt_path, exaggeration, cfg_weight, temperature)`, VC `generate(audio, target_voice_path)`.
- [RVC 소스 고정본](https://github.com/daswer123/rvc-python/tree/cff3ffbe99ce2e062831e4377f8cef587d0f38f9): `RVCInference`, `set_params(f0up_key, f0method)`, `infer_file`.
