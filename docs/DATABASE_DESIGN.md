# 데이터베이스

SQLite 엔진: sql.js 1.15.1. 스키마 `PRAGMA user_version=3`.

| 테이블 | 현재 컬럼 | 사용 상태 |
|---|---|---|
| settings | id=1 PK, value JSON | 실제 설정 읽기/쓰기 |
| jobs | id PK, kind, state, settings_json, created_at, error | 작업 전체 JSON 및 조회/저장 |
| artifacts | id PK, job_id FK, path, media_type, metadata_json | 검증된 PNG 메타데이터/파일명 |

설정 JSON은 엄격한 Zod 검증 후 저장한다. 잘못된 데이터는 저장하지 않는다.
쓰기 직전 SQLite 스냅샷을 보존하고, `.tmp`에 export한 뒤 같은 디렉터리에서 rename한다.
파일 쓰기 실패 시 메모리 상태도 이전 스냅샷으로 복구한다.
갑작스러운 전원 손실의 완전한 내구성을 보장하는 fsync/WAL 구현은 아니다.

현재는 단일 소유 프로세스용이다. Electron single-instance lock으로 중복 실행을 차단한다.
웹 모드에서는 동일 데이터 디렉터리의 동시 실행을 피해야 한다.
대량 기록과 동시 접근이 필요해지면 native SQLite/WAL로 전환한다.
손상된 DB는 자동 삭제하지 않고 시작 실패로 보존한다.

M0 DB의 테이블/설정을 보존하며 버전 3으로 갱신한다. 미래 버전은 덮어쓰지 않고 시작을 거부한다.
`jobs.settings_json`은 현재 Job 전체를 담는다. 입력, 엔진 URL, prompt ID, 그래프 버전,
로그(최대 50행), PNG 메타데이터를 보존한다. artifacts.path에는 UUID.png 파일명만 저장한다.

미디어는 `outputs/`에 먼저 저장하고 작업 완료와 artifact 행을 같은 DB 쓰기로 반영한다.
파일+DB 전체가 하나의 트랜잭션은 아니다. 중간 실패 시 미참조 PNG가 남을 수 있다.
DB 백업/이동에는 outputs 폴더도 포함해야 한다. 아직 기록/파일 삭제 UI는 없다.
재시작 시 최근 미완료 작업을 찾아 기존 prompt ID를 추적하며 재제출하지 않는다.

## M2 프롬프트 기록

`prompt_records(id PK,kind,created_at,value JSON)`을 추가한다. 기존 v2 jobs/settings/artifacts는 보존한다.
value는 PromptRecord 전체 snapshot이며 문서 버전과 변환 엔진 버전을 포함한다.
프리셋 100개 상한은 새 저장을 거절한다. history는 새 저장과 같은 mutate에서 오래된 항목을 제거해100개를 유지한다.
동일 시각에는 rowid로 삽입 순서를 유지한다. 최초 Job 저장에 원문 문서가 있으면 history를 함께 저장한다.
쓰기 실패 시 Job와 history 모두 롤백한다. 화면 초안은 자동 저장하지 않는다.
