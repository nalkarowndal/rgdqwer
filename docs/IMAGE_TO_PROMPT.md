# Image to Prompt (M3)

이미지를 분석해 프롬프트를 재구성한다. 원본 프롬프트 복원이 아니며 오류/누락이 가능하다.
현재 로컬 CPU 경로를 제공한다. 실제 Florence/WD14 가중치 품질 및 Windows/RTX2060SUPER 실기는 검증 보류다.

## 준비 (Windows PowerShell)

ComfyUI 환경을 수정하지 말고 저장소 루트의 별도 Python3.12 venv를 사용한다.
앱을 먼저 실행한다. Image to Prompt → **분석 상태 확인**에 표시되는 토큰 파일 경로를 복사한다.
웹 앱 기본값은 `<저장소>/.data/worker.token`, Electron은 사용자 데이터 폴더의 `studio/worker.token`이다.
앱마다 데이터 폴더/토큰이 다를 수 있으므로 화면의 경로를 사용한다. 토큰 내용은 공유하지 않는다.

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install -r worker/requirements-lock.txt
# 아래 선택형 추론 패키지는 설치할 때만 인터넷을 사용한다. 모델 가중치는 포함하지 않는다.
.\.venv\Scripts\python -m pip install torch==2.10.0 torchvision==0.25.0 --index-url https://download.pytorch.org/whl/cpu
.\.venv\Scripts\python -m pip install -r worker/requirements-analysis-lock.txt
.\.venv\Scripts\python -m worker.run --token-file "앱에 표시된 경로" --florence-dir "D:\AI\Florence-2-base" --wd14-dir "D:\AI\wd14"
```

Linux에서는 `.venv/bin/python`을 사용한다. `--port` 기본값은 8189이며 앱 설정의 Worker 주소와 맞춘다.
단일 프로세스로 실행한다. `uvicorn --workers`를 늘리면 단일 분석 제한이 프로세스별로 분리된다.
선택하지 않은 모델의 `--florence-dir`/`--wd14-dir`은 생략할 수 있다.
패키지 전체 잠금은 Linux에서 설치/불러오기 및 pip check로 검사했다. Windows optional inference 패키지 설치는 실기 게이트다.

## 로컬 모델

모델은 사용자가 라이선스/용량/출처를 확인하고 별도로 준비한다. 자동 다운로드 기능은 M7 범위다.

- **Florence-2:** [native 변환 Florence-2-base](https://huggingface.co/florence-community/Florence-2-base)를 기준으로 한다.
  config.json, preprocessor_config.json, tokenizer_config.json, tokenizer 파일들과 safetensors 가중치가 필요하다.
  분할 가중치는 index JSON과 모든 shard가 필요하다. 원래 Microsoft remote-code 체크포인트를 그대로 넣으면 호환되지 않을 수 있다.
  Transformers5.20.2 `Florence2ForConditionalGeneration`/`AutoProcessor`, local_files_only, safetensors만 사용한다.
  `trust_remote_code=False`, hub offline/telemetry off. CPU float32; CUDA/BF16/자동 오프로딩은 제공하지 않는다.
  `<MORE_DETAILED_CAPTION>` 및 `<OCR>`를 각각 최대512토큰/beam3으로 실행한다. 출력 문자열은 각각 최대4000자다.
- **WD14:** [SmilingWolf wd-v1-4-vit-tagger-v2](https://huggingface.co/SmilingWolf/wd-v1-4-vit-tagger-v2)의
  같은 revision에 속한 model.onnx 및 selected_tags.csv를 한 폴더에 둔다.
  float32 NHWC 정사각 입력 모델(32–1024), 출력1×태그 수를 검증한다. CPUExecutionProvider, telemetry off.
  투명 영역 흰 배경 → 정사각 padding → bicubic → BGR float32(0–255), [공식 demo](https://huggingface.co/spaces/SmilingWolf/wd-tagger/blob/main/app.py) 기준.
  일반 태그0.35, 캐릭터0.85 이상 중 상위100개; rating을 제외한다. 점수는 보정된 정확도/확률이 아니다.

파일·패키지가 발견돼도 실제 추론 호환성이 보장되지 않는다. 불완전/잘못된 체크포인트는 분석 시 오류를 표시한다.
추가 어댑터는 `worker/adapters.py`의 Adapter 프로토콜/레지스트리와 공통 결과 계약을 사용하며 임의 플러그인 코드를 실행하지 않는다.

## 사용

1. PNG/JPEG/WebP 단일 이미지(최대5MiB, 16×1024²픽셀, 한 변8192)를 선택한다. EXIF 방향과 투명 배경을 처리한다.
2. 준비된 분석 모델을 선택하고 **이미지 분석**을 누른다. 업로드/결과는 외부로 전송하거나 디스크에 저장하지 않는다.
3. 전체 설명, 10개 필드, 미분류 태그, OCR을 수정한다. 알려진 WD14 태그만 사전으로 분류한다. 의미 분해 VLM이나 완전한 한국어 번역 기능이 아니다.
4. 재분석 시 유지할 필드를 잠근다. 잠긴 값 및 요청 시작 이후 바뀐 값은 결과가 덮어쓰지 않는다. 잠금은 새 이미지에도 유지한다.
5. 생성 모델 프로필을 선택한다. 원래 캡션이 수정한 필드와 모순되면 캡션도 수정하거나 **전체 설명 포함**을 해제한다.
   OCR 포함은 기본 해제다. 8000자를 초과하면 전송할 수 없다.
6. **이미지 스튜디오에 적용** 또는 **프롬프트 스튜디오에 적용**을 누른다. 대상의 현재 문서를 교체하며 자동 생성하지 않는다.
   최종 문장 편집/프리셋/생성 기록은 M2 기능을 사용한다. 상세 필드의 긴 원문은 최대600자, 최종 문장은 별도 override로 보존한다.

분석 초안은 앱 내부 이동에 유지되지만 새로고침/종료 시 사라진다. 원시 caption/OCR/tags/score/models는 현재 분석 화면에서 확인한다.
생성/프리셋 기록에는 전달된 프롬프트가 남고 원본 업로드와 원시 분석 결과는 저장하지 않는다.
Krea/영상 연결은 M4/M5 후속 작업이다.

## 실패와 복구

- 401/503: 앱이 생성한 토큰 파일 경로와 Worker 시작 옵션, 패키지/모델 파일을 확인한다.
- 409: 같은 Worker에서 이미 분석 중. 종료 후 상태 확인을 누른다.
- 422: 이미지 형식/크기/손상을 확인한다. SVG/GIF/다중 프레임은 거부한다.
- 모델 오류: 불완전한 파일, native Florence 버전, WD14 ONNX/CSV 쌍과 메모리를 확인한다.
- 300초 응답 제한: 추론이 취소된 것은 아니다. Worker가 완료할 때까지 기다리거나 별도 터미널에서 종료 후 다시 시작한다. 자동 재시도/중복 실행은 하지 않는다.
- 실패는 이전 편집 결과를 지우지 않는다. 이미지 변경 후 새 분석 전에는 이전 결과가 남으며 안내문이 표시된다.

## 확인한 범위

테스트 픽셀·고정 모델 출력은 명시적 fixture다. 실제 Node→HTTP→Python 통신, 인증/디코딩/모델 미설치 오류는 `scripts/smoke-analysis.mjs`로 검사한다.
자동 QA는 업로드→편집·잠금→재분석→실제 ComfyUI API 형태의 모의 서버 제출을 검사한다.
실제 모델 분석과 실제 생성 결과/품질을 확인하기 전 M3 통과로 표시하지 않는다.

M4 추가: 분석 편집 결과를 Krea 2 스튜디오에 적용할 수 있다. 표시된 재구성 프롬프트를 그대로 전달하고 확장을 끈다. Krea 프로필/모델 선택과 생성은 사용자가 별도로 수행한다.

M5 추가: 재구성된 최종 문장을 영상 스튜디오에 그대로 전달한다. 모델·모드·원본 선택과 생성은 사용자가 수행하며 자동 생성하지 않는다.
