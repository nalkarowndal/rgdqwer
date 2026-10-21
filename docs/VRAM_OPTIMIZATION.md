# 저VRAM 전략

현재: ComfyUI가 반환한 GPU/VRAM 정보 표시와 RAM 정보 API 조회. Worker는 nvidia-smi 장치/메모리 검사.
PyTorch를 설치하거나 CUDA 커널을 실행하지 않으므로 cuda_inference_verified=false.
GPU 정보가 없으면 '확인 전' 또는 unavailable이다. 8GB를 고정 표시하지 않는다.
lowVram 설정은 선호값만 저장되며 실행 옵션에 적용되지 않는다.

M1 이후: GPU 작업을 한 번에 하나로 제한하고 엔진 사이 리소스 소유권을 조정한다.
외부 ComfyUI 작업이 실행 중이면 앱이 메모리를 임의 해제하거나 interrupt하지 않는다.
배치 1부터 시작하고 모델 프로필별 해상도·예상 메모리·지원 dtype을 검증한다.
OOM은 해당 작업을 실패로 기록하고 프로세스 격리/언로드 후 사용자 설정 변경 재시도를 제공한다.

M4 Krea 2, M5 Wan, M6 음성 모델의 메모리·시스템 RAM·소요 시간은 각 실기에서 측정한다.
RTX 2060 SUPER의 미지원 연산 형식을 최신 GPU와 동일하게 가정하지 않는다.
[ComfyUI 플래그](https://docs.comfy.org/development/comfyui-server/startup-flags)의
lowvram/offload 동작은 버전에 따라 달라지므로 고정 플래그를 무조건 추가하지 않는다.

검증 기록: GPU/드라이버, ComfyUI commit, torch/CUDA, 모델 해시, 워크플로,
peak VRAM/RAM, 해상도/프레임/배치, 시간, 결과 무결성, OOM 복구.
