# Krea 2 스튜디오 (M4)

Krea 2는 선택형 로컬 ComfyUI 기능이다. SD 체크포인트나 Python 분석 Worker와 독립적으로 준비한다.
모델·확장 관리자의 기능별 다운로드에서 Turbo/RAW 기본 모델을 받을 수 있다. 앱에 가중치를 번들하거나 기존 ComfyUI 환경을 수정하지 않는다. 구현/모의 QA와 실제 모델 추론 검증을 구분한다.

## 사용

1. Krea 2를 지원하는 ComfyUI를 실행하고 앱 설정에서 연결한다. 공식 지원은 v0.26.0에 도입되었지만 앱은 버전 문자열 대신 실제 노드·콤보·파일 목록을 검사한다.
2. **Krea 2 스튜디오 → 실행 환경 진단**에서 GPU 전체/여유 VRAM과 시스템 RAM, 누락 항목을 확인한다.
3. [공식 안내](https://docs.comfy.org/tutorials/image/krea/krea-2)와 [라이선스](https://www.krea.ai/krea-2-licensing)를 확인하고 모델을 직접 준비한다.
4. RAW/Turbo와 해당 모델을 선택하고 장면 설명을 쓴다. 설명 적용 버튼 또는 확장 방식 변경으로 생성 프롬프트에 적용한 뒤 직접 수정할 수 있다.
5. 스타일 LoRA/트리거/강도, 화면 비율과 시드를 선택해 생성한다. 생성 결과를 검토한 뒤 PNG 다운로드 또는 라이브러리에서 설정 재사용을 누른다.
6. Image to Prompt의 **Krea 2 스튜디오에 적용**은 편집 결과를 그대로 전달하고 확장을 끈다. 생성은 별도 클릭한다. 미저장 초안은 페이지 이동 중 유지되지만 앱 재시작 시 초기화된다.

## 모델과 메모리

| 역할 | 공식 예시 | ComfyUI 폴더 |
|---|---|---|
| Turbo FP8 | krea2_turbo_fp8_scaled.safetensors | models/diffusion_models |
| RAW FP8 | krea2_raw_fp8_scaled.safetensors | models/diffusion_models |
| Qwen3VL-4B | qwen3vl_4b_fp8_scaled.safetensors | models/text_encoders |
| Qwen Image VAE | qwen_image_vae.safetensors | models/vae |
| Krea 2 스타일 | krea2_darkbrush.safetensors 등 | models/loras |

목록은 ComfyUI의 실제 loader 선택지를 읽는다. 파일명은 호환성 증거가 아니므로 모델 카드와 계열을 확인한다.
공식 FP8 확산 모델 파일 약13.1GB, 인코더 약5.2GB, VAE 약254MB(십진 GB; 공식 템플릿은 이진 단위에 가까운12.24/4.88/242로 표시).
파일 크기는 VRAM 요구량이 아니다. 런타임·activation·오프로딩·해상도에 따라 달라진다.

**RTX 2060 SUPER 8GB의 실행·속도·안정성은 보장하지 않는다.** 실기 없이 실행 불가라고 단정하지도 않는다.
GPU/메모리를 조회하지 못하면 미확인으로 표시한다. CPU-only도 추론 성공을 보장하지 않는다.
1024px, 배치1, 확장 끄기부터 시험하고 ComfyUI `--lowvram`/CPU text encoder 오프로딩을 검토한다.
앱의 저VRAM 선호값은 엔진에 적용되지 않는다. 더 높은 메모리가 필요한2K, BF16, 하드웨어별NVFP4/MXFP8/INT8은 별도 검증한다.

## 프롬프트와 LoRA

- 확장 끄기: 최종 입력 그대로. 공백과 사용자의 수정도 보존.
- 앱에서 정리: M2의 제한된 한국어 키워드 사전을 자연어 형식으로 조합. 4,000자 초과 또는 사전에 없는 한국어는 원문 유지와 안내. 전체 문장 번역/LLM 추론이 아니다.
- ComfyUI에서 확장: 공식 템플릿의 `TextGenerate`와 Qwen3VL을 사용하며 영어 출력 요청을 추가한다. 최대512tokens, thinking=false, sampling on, 입력 seed를 공유한다. 생성 시 확장되므로 생성 전 미리보기는 확장 전 문장이다. `PreviewAny`를 통해 확장+LoRA 트리거가 적용된 실제 문장을 Job.effectivePrompt에 저장하고 완료 카드에 표시한다.

하나의 enum만 허용하여 앱 정리와 엔진 확장을 동시에 실행하지 않는다. 방식을 변경하면 원문으로부터 다시 적용하므로 이전 확장문을 자동으로 중첩하지 않는다. 사용자가 직접 확장문을 입력하는 경우의 의미까지 자동 판별하지는 않는다.
공식 프롬프트 지침을 보존하며 모델의 안전 제한을 제거하지 않는다.

9종 공식 스타일 프리셋, 로컬 LoRA 선택/해제/강도(-2~2)/트리거 편집을 제공한다. 미설치 스타일은 선택할 수 없다.
`LoraLoaderModelOnly` 적용 후 필요 시 RAW sampling patch; 트리거는 텍스트 확장 **후** 결합한다.
LoRA 다운로드/삭제/학습과 범용 관리자는 후속 M7 범위다. Krea RAW에서 학습한 Krea LoRA를 Turbo에서 사용하는 것이 공식 권장 흐름이다.

## 워크플로 계약

공식 [Turbo 템플릿](https://github.com/Comfy-Org/workflow_templates/blob/main/templates/image_krea2_turbo_t2i.json)의 subgraph를 API graph로 평탄화했다. switch/선택 UI는 앱이 해결하고 실행에 필요한 노드만 제출한다.

| 프로필 | 스텝 | Comfy CFG | Negative | shift |
|---|---:|---:|---|---|
| Turbo | 8 | 1 | ConditioningZeroOut | Krea 모델 기본1.15 |
| RAW 어댑터 | 52 | 4.5 | 빈 문자열 CLIPTextEncode | 공식 해상도 보간 mu |

RAW 공식 CLI의 CFG3.5는 `cond + 3.5*(cond-uncond)`이다. Comfy는 `uncond + CFG*(cond-uncond)`이므로4.5가 대응한다. Turbo CLI0은 Comfy1에 대응한다.
RAW mu = `0.5 + 0.65 * (width*height/256 - 256) / (6400-256)`; 공식 minres256/maxres1280/16px patch에 맞춘다.
`ModelSamplingFlux`의 base/max_shift에 같은 mu를 넣어 고정한다. RAW는 공식 Turbo 템플릿을 기반으로 한 어댑터이며 별도 공식 RAW 템플릿이나 완전 동일 픽셀 출력이라는 주장을 하지 않는다.
샘플러 euler/simple, 배치1. 가로/세로64배수·최소512, 한 변1024이상; RAW최대1024,Turbo최대2048.

모델 UNETLoader/CLIPLoader(type=krea2)/VAELoader, EmptyLatentImage, CLIPTextEncode, KSampler, VAEDecode, SaveImage(id9)를 사용한다.
엔진 확장과 LoRA·RAW에 필요한 노드는 해당 기능 선택 시 검사한다. 제출 직전 목록을 다시 읽고 누락/외부 큐 점유 시 제출하지 않는다.
GPU 실기 성능은 사전 검사만으로 판정할 수 없다. 실제 런타임 오류는 실패로 표시하며 자동 재제출하지 않는다.

## 저장과 보안

SD와 같은 단일 GenerationManager, 소유 UUID, scoped cancel, 종료/재시작 추적, PNG 무결성·크기·파일 소유권 검사를 사용한다.
`/interrupt` 사용 없음. Krea Job은 kind=image, workflowVersion=krea2-v1, profile=krea-*로 구분한다.
SQLite v3 JSON에 원문/최종 입력/확장 방식/모델/LoRA/seed/결과를 보존한다. SD 전용 prompt_records와 섞지 않는다.
기록 재사용은 원래 설정을 복원하므로 engine 모드에서는 다시 확장한다. 새 엔진/모델 버전에서 동일한 픽셀을 보장하지 않는다.

가중치 라이선스는 코드 Apache2와 별개인 **Krea 2 Community License**다. 2026-10-23 확인한 §2.3은 관계사 포함 직전12개월 전체 매출 $1M 미만에 한해 약정 내 상업 사용을 허용하며 그 이상은 별도 enterprise license가 필요하다.
§4.2 필터/검토 의무와 원문 이용 제한을 준수해야 한다. 앱은 자동 게시하지 않으며 사용자가 결과를 직접 검토하고 다운로드한다. 배포자가 모델을 함께 제공할 경우 원문의 배포·고지 조건도 별도로 적용된다. 앱은 가중치를 번들하지 않는다.

## 검증 근거와 남은 게이트

소스 확인: ComfyUI `d07dff4565ea9804277fff8cdfa0c817e08c3d44`, Krea inference `db3984fbc6e13b34c0064990fc2d95ac64d00058`.
Context7 공식 Comfy 문서와 Exa 공식 모델/라이선스 자료를 교차 확인했다.
단위 테스트는 입력·CFG·shift·노드 연결, HTTP 테스트는 인증·준비 검사·동시 실행·저장/재오픈·확장문 기록을 검사한다.
브라우저 테스트는 편집·스타일·모바일·미리보기·재사용·분석 전달을 검사한다. 흰 PNG/확장문 fixture는 실제 모델 출력이 아니다.

실제 Windows ComfyUI RAW/Turbo 각각 실행, Korean→English 확장 품질,9종LoRA·2K,2060SUPER8GB의RAM/VRAM/시간/오류와 취소/복구는 수동 게이트다. 미지원 결과를 기록할 때에도 실제 노드/파일/오류 증거를 남긴다.
