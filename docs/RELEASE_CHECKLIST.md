# M8 릴리스 검증 목록

현재 상태: v0.9.0 **unsigned 검증용 설치본**, 공개 릴리스/병합 없음. M8 전체 실기 수락 판정은 보류합니다.

## 자동 검증과 산출물

- `npm ci`, `npm run check`, `npm run build`, Python 테스트, Python HTTP smoke, 브라우저 QA.
- `npm run pack:dir`: 개발자가 현재 OS의 unpacked 앱을 만들고 `smoke:packaged`로 새 테스트 프로필 seed → verify를 실행합니다. 프로필 부모만 미리 만들며 seed 대상은 존재하면 안 됩니다.
- `npm run dist:win`: Windows x64 NSIS, `--publish never`. CI에서 기존 설치/기본 프로필이 있으면 거부하고, 고유 디렉터리에 설치 → 실제 설치 exe 실행 → 재설치 → 설정/파일 보존 확인 → 제거 → 격리 데이터와 기본 프로필 sentinel 보존을 검사합니다. `verify-installer.ps1`은 CI 전용이며 개인 PC에서 실행하지 않습니다.
- `verify-payload.ts`는 실제 ASAR와 외부 Python/WASM, 고지 파일을 검사합니다. 사용자 데이터·토큰·개발 도구를 패키지에 넣지 않습니다.
- Windows 성공 아티팩트: `rgdqwer-windows-x64-unsigned`, 설치 exe·blockmap·SHA256SUMS·설치 안내, 14일 보존. OS별 `qa-*` 아티팩트: 테스트 JSON·화면. 버전·커밋·실행 URL을 함께 기록합니다.

## 반복 작업과 메모리

```sh
npm run soak
npm run soak -- --duration-ms 20000 --cycles 20 --report test-results/m8-soak-ci.json
```

기본 최소 180초/100회, CI 최소 20초/20회. 실제 HTTP/API·SQLite·파일로 가져오기/해시/삭제, 생성 PNG 검사, 즐겨찾기, 10회마다 취소, 20회마다 앱 서버 닫기/재열기를 수행합니다. 엔진·모델은 테스트 대역이며 실제 GPU/모델 추론이 아닙니다. 기본 5회 준비 후 GC가 노출된 Node 프로세스의 heap/RSS, 활성 리소스와 마지막 엔진 연결을 기록합니다. 준비 후 최대 증가가 heap128MiB/RSS256MiB를 넘으면 실패합니다. 유한 시간의 이 기준 통과는 누수 부재·Electron 렌더러 안정성·GPU 메모리 안정성의 증명이 아닙니다. JSON의 실제 실행 시간/회수/성공 상태를 확인하세요.

## 실제 장치에서 완료할 항목

- [ ] 깨끗한 Windows 10/11 x64 일반 계정에서 설치·실행·한글/공백 경로·업그레이드·백업 복원·제거 후 데이터 보존.
- [ ] 게시자 서명/배포 정책 결정, 서명된 설치본 검증, SmartScreen 및 기업 정책 검토. 현재 체크섬을 게시자 인증으로 취급하지 않음.
- [ ] 각 실제 SD/Krea/Wan 모델로 생성·결과 열기·취소·실패 후 재시도·모델 전환·앱 재시작 복구.
- [ ] Florence-2/WD14 실제 모델의 Windows 의존성 설치와 분석 품질.
- [ ] 한국어/일본어/영어 TTS, 실제 녹음 VC/RVC, 마이크 권한·재생·청취 품질.
- [ ] 8GB GPU 및 더 큰 장치의 VRAM/RAM/디스크 사용, 수시간 작업, 저VRAM 모드의 실제 효과, ComfyUI 메모리 해제 측정.
- [ ] 고DPI·다중 모니터·키보드/스크린 리더·OS 권한 거부·오프라인/외장 드라이브 실패 복구.
- [ ] 실제 대용량 모델 다운로드와 필요한 확장 패키지 설치, 각 모델/의존성 이용 조건 확인.

ARM64·관리자용 전체 사용자 설치·자동 업데이트는 이 산출물 범위 밖입니다. 정확한 실행 증거는 [QA 기록](QA_TEST_PLAN.md)에 남깁니다.

M8 후속 패키지 보강: production 의존성 내부의 test/tests/__tests__/spec/fixtures/bench/benchmark/benchmarks 디렉터리를 제외하고 실제 ASAR에서도 거부한다. 런타임 JS/JSON/WASM와 고지는 유지한다. 향후 의존성이 이 디렉터리 이름을 런타임에 사용하면 내용을 검토하고 예외를 좁게 정의해야 한다. 설치 QA는 소유한 설치/프로필 경로에 한글과 공백을 넣어 실행한다. 이 경로 검사도 호스팅 Windows 범위이며 전체 실기 수락을 의미하지 않는다.
