# 기능별 모델 다운로드

**모델·확장 관리자 → 기능별 다운로드**에서 사용할 기능을 체크하고, 출처·이용 조건 확인 후 **선택 모델 다운로드**를 누릅니다. URL·SHA256·정확한 바이트 수를 직접 입력하지 않아도 됩니다. Windows 실행형 ZIP과 설치형 모두 같은 화면을 제공합니다.

| 기능 | 기본 구성 |
|---|---|
| 이미지 생성 | SDXL Base 1.0 단일 체크포인트 |
| Krea 2 Turbo / RAW | 해당 FP8 확산 모델 + 공통 Qwen3VL-4B 인코더 + Qwen Image VAE |
| 영상 생성 | Wan2.2 TI2V 5B FP16 + UMT5 FP8 인코더 + Wan2.2 VAE |
| 이미지 설명 | native Florence-2-base 가중치 + processor/tokenizer 설정 파일 |
| 이미지 태그 | WD14 ViT v2 ONNX + selected_tags.csv |
| 음성 합성 | 현재 어댑터용 Chatterbox Multilingual v2 파일 4개 |
| 음성 변환 | ChatterboxVC s3gen.safetensors |

Krea Turbo/RAW를 함께 선택하면 공통 인코더·VAE는 한 번만 받습니다. 이미 완료한 파일도 중복 다운로드하지 않습니다. RVC 개인 화자 모델, 추가 체크포인트/LoRA는 기존 **모델 추가**에서 가져옵니다. 이 목록은 현재 앱에서 구현한 기능용 기본 구성입니다.

## 진행·취소·재시도

- 선택 요약은 중복 파일을 제외한 **추가 다운로드 예상 용량**입니다. 정확한 크기는 공식 저장소 조회 후 설치 기록에 표시합니다. 파일 크기는 VRAM 요구량이 아닙니다.
- 설치 기록에서 현재 파일, 받은 용량/전체 용량과 진행률을 확인하고 취소할 수 있습니다. 한 번에 한 다운로드 묶음을 처리하며 생성·모델 삭제·경로 변경과 동시에 실행하지 않습니다.
- 취소/실패/앱 종료 전에 완료한 구성 파일은 유지합니다. 기능을 다시 선택해 시작하면 그 파일을 검증하고 누락분만 받습니다. **미완료 파일의 바이트 단위 이어받기는 하지 않으며 처음부터 받습니다.** 앱 재시작 후 자동 다운로드하지 않습니다.
- 재시도는 이미 받은 같은 저장소의 커밋을 사용해 서로 다른 버전을 섞지 않습니다. 다른 버전으로 바꾸려면 해당 묶음 파일을 설치 목록에서 제거한 뒤 다시 선택하세요. 공통 파일 제거 시 다른 기능의 파일 준비 상태도 낮아집니다.
- 디스크 부족/접근 불가/HTTP 오류는 설치 기록에 표시합니다. 기존 파일을 덮어쓰지 않습니다. 등록되지 않은 파일이나 변경된 파일이 같은 경로에 있다면 표시된 경로의 파일을 백업해 다른 위치로 옮긴 뒤 기능 다운로드를 다시 시작하세요. 변경된 파일을 앱의 모델 삭제로 지우려 하면 보호를 위해 거부됩니다. 파일이 없는 등록 항목은 재다운로드 시 같은 ID로 복구합니다.

## 파일 준비와 기능 실행 준비

상단 **모델 파일 준비**는 현재 관리 폴더의 등록 파일 존재·크기와 버전 일관성 기준입니다. 상태 확인마다 다GB 파일을 다시 해시하지 않으며 재사용 직전에 전체 SHA256을 확인합니다. 엔진 설치나 실제 추론 성공을 뜻하지 않습니다.

카드의 **파일·출처·연결 안내**를 펼치면 각 파일의 실제 저장 위치를 볼 수 있습니다.

- SDXL/Krea/Wan: **저장 경로·엔진 연결**에서 ComfyUI 경로 설정을 생성하고 적용한 다음 ComfyUI를 재시작합니다. 해당 스튜디오의 실제 모델 목록에서 `catalog-.../파일명`을 선택하세요.
- Florence/WD14: 별도 분석 Python 환경을 준비하고 Worker 실행 시 `--florence-dir`, `--wd14-dir`에 각각 `analysis/catalog-florence`, `analysis/catalog-wd14` 절대 경로를 지정합니다.
- Chatterbox: 별도 Python 환경·FFmpeg를 준비하고 `STUDIO_CHATTERBOX_DIR`에 `voice/catalog-chatterbox` 절대 경로를 지정합니다. 앱을 완전히 종료하고 환경 변수를 적용한 상태에서 다시 시작합니다.

관리 경로를 바꾸면 카탈로그의 준비 상태도 **새 관리 폴더 기준**으로 바뀝니다. 기존 파일은 옮기거나 삭제하지 않습니다. 기존 파일은 설치 목록에 남으며, 새 경로에 다운로드하면 별도 사본을 받습니다.

## 출처·검증 범위

내장 카탈로그는 아래 제공자/공식 ComfyUI 배포 파일 중 명시한 이름만 받습니다. 요청 시 Hugging Face 메타데이터의40자리 커밋으로 URL을 고정합니다. LFS 파일은 제공자 SHA256/크기와 대조하고, 작은 일반 Git 설정 파일은 Git blob SHA1 대조 후 SHA256을 계산합니다. 파일별 다운로드 역시 크기·SHA256을 검증한 뒤 등록합니다. 모델 파일을 앱 자체에 재배포하거나 저장소의 Python 코드를 실행하지 않습니다.

- https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0
- https://huggingface.co/Comfy-Org/Krea-2 · https://www.krea.ai/krea-2-licensing
- https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged
- https://huggingface.co/florence-community/Florence-2-base
- https://huggingface.co/SmilingWolf/wd-v1-4-vit-tagger-v2
- https://huggingface.co/ResembleAI/chatterbox

개별 이용 조건은 카드에 표시합니다. 인증/접근 승인이 필요한 제공자 상태나 HTTP 오류를 우회하지 않습니다. 기존 내장 다운로드와 동일하게 공개 HTTPS만 지원하며 프록시 환경에서는 브라우저 다운로드 후 수동 가져오기를 사용합니다. Python/ComfyUI/드라이버/FFmpeg 설치와 GPU·실제 모델 추론 검증은 별도입니다.

단위/통합 테스트는 작은 합성 응답으로 실제 파일·DB·해시·취소/재시도/재시작을 검사합니다. Windows 공개 카탈로그 검사는 실제 제공자 메타데이터와 작은 설정 파일을 확인하며 다GB 가중치나 실제 추론을 검사하지 않습니다.
