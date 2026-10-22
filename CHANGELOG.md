# 변경 기록

## 0.4.0 — M3 Image to Prompt

- 로컬 Florence-2 캡션/OCR, WD14 ONNX 태그 CPU 어댑터와 선택형 패키지 잠금.
- 인증 Worker 프록시, bounded 이미지 디코딩, 한 번에 하나의 분석, 미설치/실패 안내.
- 업로드, 출처/불확실성 표시, 필드 수정/잠금, 진행 중 수정 보존, 생성/프리셋 연계.
- 원문 캡션/OCR 포함 선택, 페이지 이동 초안 보존, Node↔Python HTTP smoke 및 E2E.

실제 모델 추론 품질/Windows 데스크톱/RTX 실기는 미검증이며 자동 다운로드하지 않는다.

## 0.3.0 — M2 프롬프트 스튜디오

- 이미지/프롬프트 공통 간편·상세·전문가 편집기, 한국어 키워드 매핑, 태그/문장형 템플릿.
- 미지원 한국어와 수동 수정 결과 보존, 검색 자동완성·Negative 추천·복사.
- 프리셋/프롬프트 기록 snapshot, v2→v3 DB 보존, 생성 요청과 원문 기록의 동시 저장.
- 저장 결과 불러오기와 이미지 생성 연결; M1 원문 작업 재사용 호환.
- 연속 생성 시 이전 카드 상태가 새 Job에 남아 화면이 중단되는 오류 수정.

규칙 변환은 완전한 문장 번역이 아니다. 실제 모델/GPU 검증은 계속 보류다.

## 0.2.0 — M1 이미지 생성 구현

- SD1.5/SDXL/Illustrious 기본 T2I 그래프, 명시적 모델 프로필과 입력 검증.
- 실제 HTTP/WS 제출·샘플러 진행률·history/queue 추적 및 작업별 안전 취소.
- PNG 크기/디코딩/CRC 검증, 인증된 미리보기·다운로드, 설정·시드 재사용.
- SQLite 작업/결과 저장과 재시작 복구. 응답 유실 시 자동 중복 제출 방지.
- 모의 ComfyUI HTTP/WS 통합 테스트 및 생성→다운로드→기록 브라우저 테스트.

실제 ComfyUI/GPU 및 Windows Electron 실기 게이트는 보류 중이다.
Anima/Krea/LoRA와 영상·음성 생성은 이 버전에 포함하지 않는다.

## 0.1.0 — M0 기반

- 빈 rgdqwer 저장소에 기존 이름을 유지해 구현.
- Electron/React/Vite/TypeScript/Tailwind 한국어 UI.
- Fastify 제어 API, 세션/Origin/Host 보호, SQLite 설정 저장.
- ComfyUI stats 및 SD 체크포인트 조회 어댑터와 오류 안내.
- 독립 FastAPI 하드웨어 진단 Worker.
- API/Worker/Playwright 테스트 및 Windows/Linux CI 설정.
- 마스터 요구사항과 M0–M8 설계·완료 조건 문서화.

실제 GPU 생성, Windows 설치 프로그램, 모델 관리 쓰기 기능은 포함하지 않는다.
