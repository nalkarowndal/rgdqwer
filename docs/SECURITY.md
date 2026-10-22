# 보안 및 사용 권한

## 구현

- Node 기본 바인딩 127.0.0.1. ComfyUI/Worker 연결도 같은 PC의 HTTP 주소만 허용.
- 세션당 임의 256-bit 토큰, timing-safe 비교, 외부 Host/Origin/cross-site 차단, no-store.
- Electron sandbox/contextIsolation=true, nodeIntegration=false, webSecurity=true.
- 새 창·외부 탐색·권한 요청 거부. renderer에 파일 시스템/프로세스 실행 API 미노출.
- 생산 UI CSP 적용. 외부 폰트/CDN/분석·원격 AI API 호출 없음.
- JSON 스키마 검증, 본문 크기 제한, redirect 금지, 요청 시간 제한.
- 생성/취소/결과 API에도 동일 인증 적용. 결과 파일은 작업별 접두사와 PNG 청크 구조·전체 CRC·크기를 검증.
- 전역 interrupt 대신 작업별 원자적 취소만 호출. 엔진 응답 유실 시 자동 재제출 금지.
- GPU 진단은 고정 인자 배열로 nvidia-smi 실행. shell=True 사용 안 함.

loopback과 브라우저 방어는 동일 사용자 권한의 악성 로컬 프로그램을 막는 경계가 아니다.
Worker의 읽기 전용 /health 진단은 인증을 요구하지 않는다. M3 /analysis 및 /analysis/status는
앱 데이터 폴더의 별도 256-bit worker.token으로 인증한다. 파일은 POSIX0600, Windows는 사용자 데이터 폴더 ACL에 의존한다.
Worker Host/Origin/본문 크기를 JSON 파싱 전에 검사한다. 모델 실행은 로컬 CPU·safetensors/native Transformers·ONNX만 사용한다.
원격 Python 코드/모델 자동 다운로드를 허용하지 않으며 Hugging Face/ONNX telemetry를 비활성화한다.
모델/사용자 파일, 음성 프로필은 외부로 업로드하지 않는다.

## 후속 필수 조건

모델/노드 다운로드·삭제는 사용자 opt-in. 다운로드 checksum/license/source 확인.
외부 경로 및 파일명은 정규화하고 결과 경로 이탈을 차단한다.
커스텀 노드는 코드 실행 권한을 가진다는 점을 알리고 자동 실행하지 않는다.
음성 복제는 권한 정보와 동의 확인, 실존 인물 사칭·비동의 복제 방지 절차를 갖춘다.
안전 장치 우회 기능을 만들지 않는다.

Windows 배포 전에 서명/업데이트 출처·최소 권한·백신 검사·장시간 실행을 검증한다.
실험을 위한 Linux 테스트 플래그를 제품의 보안 기본값으로 반영하지 않는다.
