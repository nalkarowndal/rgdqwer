# 음성 시스템

현재: 독립 FastAPI 진단 Worker만 구현. capabilities는 빈 배열이며 음성 추론은 없다.
ComfyUI venv와 별개인 Python 3.12 환경을 사용한다.

M6에서 Chatterbox Multilingual TTS/Voice Cloning, ChatterboxVC, RVC adapter를 분리한다.
모델별 Python/PyTorch/CUDA 버전은 M6 실험 시 별도 환경에서 결정한다.
한국어·일본어·영어, 긴 대사 분할, WAV/MP3, 결과 비교를 검증한다.
VC는 파일 업로드/마이크 입력, 참고 음성 또는 학습 모델, 피치 옵션, 전후 비교를 제공한다.

음성 프로필 계획: id, 이름, 참고 파일, 언어, 허용 엔진, RVC 모델 경로, 설정,
사용 권한 출처·확인 시점. 허가 없는 실존 인물 사칭·비동의 복제/배포 방지 안내와
사용 권한 확인을 엔진 실행 전에 적용한다.

RVC 학습은 기본 TTS/VC 안정화 이후 전처리 → 특징/피치 추출 → 학습 → 체크포인트 →
인덱스 → 검증 순서로 구현한다. 실시간 마이크 변환·립싱크는 이번 필수 범위에 없다.
통과: 실제 TTS 출력과 VC 변환 출력 각각 재생 및 비교 검증.
