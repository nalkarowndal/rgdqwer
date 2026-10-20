# 데이터베이스

SQLite 엔진: sql.js 1.15.1. 스키마 `PRAGMA user_version=1`.

| 테이블 | 현재 컬럼 | 사용 상태 |
|---|---|---|
| settings | id=1 PK, value JSON | 실제 설정 읽기/쓰기 |
| jobs | id PK, kind, state, settings_json, created_at, error | 스키마·조회만 구현 |
| artifacts | id PK, job_id FK, path, media_type, metadata_json | 스키마만 구현 |

설정 JSON은 엄격한 Zod 검증 후 저장한다. 잘못된 데이터는 저장하지 않는다.
쓰기 직전 SQLite 스냅샷을 보존하고, `.tmp`에 export한 뒤 같은 디렉터리에서 rename한다.
파일 쓰기 실패 시 메모리 상태도 이전 스냅샷으로 복구한다.
갑작스러운 전원 손실의 완전한 내구성을 보장하는 fsync/WAL 구현은 아니다.

현재는 단일 소유 프로세스용이다. Electron single-instance lock으로 중복 실행을 차단한다.
웹 모드에서는 동일 데이터 디렉터리의 동시 실행을 피해야 한다.
대량 기록과 동시 접근이 필요해지면 native SQLite/WAL로 전환한다.
손상된 DB는 자동 삭제하지 않고 시작 실패로 보존한다.

미디어는 파일 시스템에 보관하고 DB에는 메타데이터/참조만 저장할 예정이다.
M1 이후 작업 설정·시드·모델/워크플로 버전과 생성 결과를 원자적으로 연계한다.
