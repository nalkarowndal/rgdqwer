# 이미지 시스템

현재 M0: ComfyUI 연결 및 CheckpointLoaderSimple 모델 목록 조회만 구현.
체크포인트 파일 이름만으로 SD1.5/SDXL/Illustrious/Anima 호환성을 추정하지 않는다.

M1: 검증한 모델 프로필별 API JSON 워크플로 → /prompt → /ws → /history → /view.
seed, positive/negative prompt, 모델 이름, 워크플로 버전, 결과 경로를 함께 저장한다.
실제 이미지 파일의 존재·디코딩·규격 확인 뒤 완료 상태로 전환한다.
잘못된 노드/모델 조합을 생성 전에 확인하고 오류를 사용자에게 반환한다.

후속: img2img, 마스크 기반 in/outpainting, ControlNet, 업스케일, LoRA, VAE,
배치 및 원본/결과 비교. 캐릭터/스타일 LoRA에 트리거·권장 가중치·호환 프로필을 기록.
영역별 다중 캐릭터 LoRA는 인터페이스 설계만 고려하며 필수 구현에서 제외한다.

M1 통과 조건: 설치된 검증 모델로 실제 이미지 생성·저장, 실패/재시도/취소 및 기록 검증.
이 환경에서 GPU 생성 검증은 수행하지 않았다.
