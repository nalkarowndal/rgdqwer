# 변경 기록

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
