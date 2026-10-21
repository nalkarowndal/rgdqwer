# 이미지 시스템 — M1 구현

기존 ComfyUI Server API에 실제 API JSON을 제출한다. SD1.5, SDXL,
Illustrious/WAI-Illustrious 계열의 기본 Text to Image 그래프를 제공한다.
모델 파일명으로 계열을 추측하지 않으며 사용자가 모델 설명에 맞는 프로필을 선택한다.
현재 환경에는 모델/GPU가 없어 모델별 실기 적합성과 생성 품질은 미검증이다.
Anima, Krea, LoRA, img2img는 이 기본 그래프의 지원 범위가 아니다.

## 생성과 기록

`CheckpointLoaderSimple → CLIPTextEncode(positive/negative) → EmptyLatentImage →
KSampler → VAEDecode → SaveImage` 표준 노드, 그래프 버전 `sd-base-v1`.
샘플러 euler, 스케줄러 normal, batch 1을 사용한다.

- SD1.5 기본 512×512, 각 변 256–768px. SDXL/Illustrious 기본 1024×1024, 각 변 256–1024px.
- 크기는 64 배수, 스텝 1–80, CFG 1–30, 시드는 0–Number.MAX_SAFE_INTEGER 정수.
- 빈 시드는 UI에서 무작위 uint32로 결정하고 DB에 실제 값을 저장한다.
- 원문 positive/negative, 프로필, 모델 이름, 크기/시드/스텝/CFG, 그래프 버전,
  엔진 URL, prompt ID, 상태·로그 및 PNG 참조를 함께 보관한다.
- 한국어를 포함한 입력은 그대로 전달한다. 자동 번역/프롬프트 모드는 M2 범위다.

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
