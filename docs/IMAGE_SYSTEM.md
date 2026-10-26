# 이미지 스튜디오 — SD · Anima · LoRA

기존 ComfyUI Server API에 실제 API JSON을 제출한다. SD1.5, SDXL,
Illustrious/WAI-Illustrious 계열의 기본 Text to Image 그래프를 제공한다.
모델 파일명으로 계열을 추측하지 않으며 사용자가 모델 설명에 맞는 프로필을 선택한다.
현재 환경에는 모델/GPU가 없어 모델별 실기 적합성과 생성 품질은 미검증이다.
Anima Base v1 전용 그래프와 프로필별 LoRA를 지원한다. Krea는 별도 스튜디오를 사용하며 img2img는 이 화면에서 지원하지 않는다.

## 생성과 기록

`CheckpointLoaderSimple → CLIPTextEncode(positive/negative) → EmptyLatentImage →
KSampler → VAEDecode → SaveImage` 표준 노드, 그래프 버전 `sd-lora-v2` (이전 기록 `sd-base-v1`도 재사용 가능).
샘플러 euler, 스케줄러 normal, batch 1을 사용한다.

- SD1.5 기본 512×512, 각 변 256–768px. SDXL/Illustrious 기본 1024×1024, 각 변 256–1024px.
- 크기는 64 배수, 스텝 1–80, CFG 1–30, 시드는 0–Number.MAX_SAFE_INTEGER 정수.
- 빈 시드는 UI에서 무작위 uint32로 결정하고 DB에 실제 값을 저장한다.
- 원문 positive/negative, 프로필, 모델 이름, 크기/시드/스텝/CFG, 그래프 버전,
  엔진 URL, prompt ID, 상태·로그 및 PNG 참조를 함께 보관한다.
- M2 편집기가 지원 키워드를 변환하고 최종 입력을 전달한다. 전문가 입력은 공백까지 그대로 보존한다.

## 실행·취소·복구

노드/모델/샘플러 존재와 외부 큐를 먼저 검사한다. 앱의 GPU 작업은 한 번에 1개이며
미확인 작업이 있어도 신규 제출을 차단한다. 외부 클라이언트와 큐를 원자적으로 잠그지는 못한다.
진행률은 해당 prompt ID의 WebSocket 샘플러 이벤트만 반영한다. 이는 전체 시간 비율이 아니다.
연결이 끊겨도 750ms 간격 history/queue 조회로 종료 상태를 확인한다.
요청 제한 10초, 결과 추적 제한 30분. 제한 초과 시 자동 재제출하지 않는다.

제출 전에 UUID를 저장하고 `prompt_id`/`client_id`로 전달한다. 앱 재시작 또는
'상태 추적 재개'는 저장한 ID를 조회할 뿐 생성 요청을 반복하지 않는다.
재개 후 엔진의 정상 응답에서 15초 이상 큐·기록 모두에 작업이 없으면 실패로 종료한다.
기록을 지운 엔진의 기존 PNG는 ComfyUI 출력 폴더에서 수동 확인해야 한다.
사용자 지정 prompt ID를 지원하는 최신 ComfyUI를 권장한다. 구버전이 ID를 무시하고
제출 응답까지 유실되면 원격 작업 식별/자동 복구를 보장할 수 없다.

취소는 작업별 원자적 `POST /api/jobs/{prompt_id}/cancel`만 사용한다.
404/405이면 업데이트 또는 ComfyUI에서 직접 취소하라는 안내를 표시하고 추적을 계속한다.
전역 interrupt, 전체 큐 삭제, 강제 VRAM 해제는 호출하지 않는다. 앱 종료도 원격 작업을 취소하지 않는다.

## 파일

SaveImage의 `rgdqwer/<job UUID>` 접두사로 생성한 PNG 1개만 수집한다.
허용한 subfolder/type/파일명, 20MiB 상한, PNG signature/IHDR/요청한 크기,
디코딩 및 CRC를 확인하고 앱 데이터의 `outputs/<UUID>.png`에 rename으로 저장한다.
이후 DB의 작업 완료와 artifact 메타데이터를 함께 저장한다.
PNG의 ComfyUI 메타데이터는 원본 바이트를 보존한다.
파일과 DB는 별도 저장이므로 정전/저장 실패 시 미참조 파일이 남을 수 있으나 완료로 표시하지 않는다.
결과 표시/다운로드는 Bearer 인증 fetch와 blob URL을 사용한다.

## 실기 게이트

실제 Windows/ComfyUI에서 프로필별 이미지 생성·저장·디코딩, 실패 후 재시도,
취소, 엔진 재시작, 모델 교체와 VRAM peak를 검증해야 M1 전체 통과다.
8GB는 목표 사양이며 검증된 보장이 아니다. 메모리 부족 시 해상도를 낮춘다.
저VRAM 저장값은 ComfyUI 실행 옵션을 바꾸지 않는다.

근거: [공식 API 예제](https://docs.comfy.org/development/comfyui-server/api-examples),
[ComfyUI server.py](https://github.com/Comfy-Org/ComfyUI/blob/master/server.py).


## LoRA 파일 설정과 활성화

1. **모델·확장 관리자 → 모델 추가**에서 종류를 LoRA로 선택하고 로컬 파일을 가져온다. 관리 폴더의 ComfyUI 경로 설정을 적용하고 ComfyUI를 재시작한다. 이미 ComfyUI `models/loras`에 설치한 파일도 사용할 수 있다.
2. **이미지 스튜디오 → 모델·LoRA 목록 새로고침 → LoRA 추가**를 누른다.
3. 파일과 강도(-2~2)를 설정하고 각 행의 스위치를 클릭해 활성/비활성으로 전환한다. 키보드 Space도 지원한다. 최대4개를 위에서 아래 순서로 적용한다.
4. 끄면 파일·강도는 남지만 해당 LoRA 노드를 생성하지 않는다. 꺼진 파일이 없어도 생성을 막지 않는다. 제거는 목록 설정만 지우며 디스크 파일은 삭제하지 않는다.
5. 생성한 작업에는 꺼진 항목을 포함한 설정을 저장한다. **설정 재사용**으로 복원할 수 있다. 생성하지 않은 초안은 현재 앱 세션에서만 유지된다.

프로필을 바꾸면 기존 LoRA는 모두 비활성화된다. 각 행의 원래 계열로 돌아간 뒤 다시 켤 수 있다. 파일명만으로 가중치 호환성을 검증할 수 없으므로 SD1.5/SDXL/Illustrious/Anima에 맞는 LoRA를 선택한다. 필요한 트리거는 프롬프트에 직접 입력한다. SD에서는 모델·CLIP에 같은 강도를, Anima에서는 모델에만 강도를 적용한다. 다른 계열이나 같은 파일의 중복 활성화, 없는 활성 파일은 제출 전에 차단한다.

## Anima Base v1

**모델·확장 관리자 → 기능별 다운로드 → 이미지 생성 · Anima**에서 다음3개 파일을 받는다.

- `diffusion_models/catalog-anima/anima-base-v1.0.safetensors`
- `text_encoders/catalog-anima/qwen_3_06b_base.safetensors`
- `vae/catalog-anima/qwen_image_vae.safetensors`

ComfyUI를 업데이트하고 관리 폴더 경로 설정을 적용·재시작한 뒤 이미지 스튜디오의 **Anima Base v1**을 선택한다. 해당 확산 모델·텍스트 인코더·VAE를 지정한다. 목록 새로고침은 설치/업데이트 자체를 수행하지 않는다.

공식 Base v1 구성: `UNETLoader(default)` + `CLIPLoader(stable_diffusion, default)` + `VAELoader` → positive/negative CLIPTextEncode → EmptyLatentImage → KSampler(er_sde/simple) → VAEDecode → SaveImage. 기본1024×1024, 30스텝, CFG4, 배치1. 앱 해상도 범위는 최대1024이며 실제8GB 안정성은 미검증이다. 선택한 Anima LoRA는 `LoraLoaderModelOnly`로 샘플러 앞에 연결한다. 그래프 버전은 `anima-base-v1`.

[공식 ComfyUI 안내](https://docs.comfy.org/tutorials/image/anima/anima), [모델 제공자·이용 조건](https://huggingface.co/circlestone-labs/Anima), [공식 Base v1 템플릿](https://github.com/Comfy-Org/workflow_templates/blob/main/blueprints/text_to_image_anima_base_1_0.json)을 참고한다. 모델은 CircleStone Labs Non-Commercial License와 NVIDIA 파생 모델 조건을 확인해야 한다. 모델 이용과 생성 이미지의 이용 조건은 다를 수 있으므로 제공자 설명을 따른다.

테스트는 합성 ComfyUI HTTP/PNG로 그래프·설정 보존·실패 처리를 확인한다. 실제 Anima/LoRA 가중치 로드, 이미지 품질, GPU/VRAM은 별도 실기 검증 대상이다.
