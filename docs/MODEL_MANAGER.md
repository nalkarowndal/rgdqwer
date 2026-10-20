# 모델·확장 관리자

현재: ComfyUI SD 체크포인트 목록 읽기 전용 조회. 다운로드/삭제/이동/커스텀 노드 설치 없음.
참조 모델 경로 저장은 ComfyUI 경로 설정과 별개다.

M7 manifest 계획: id, source URL, revision, checksum, format, size, license,
family, compatibleAdapters, requiredNodes, vramEstimate, systemRamEstimate, verificationStatus.
추정 메모리와 실측값은 구분한다. checkpoint, LoRA, VAE, text encoder, VLM, video,
voice 및 node pack을 구별한다.

사용자가 설치/제거를 명시적으로 선택해야 작업한다. 다운로드는 임시 파일·용량 확인·해시 검증 후 이동.
삭제는 참조 중인 작업/의존성을 경고하고 사용자 파일을 자동 정리하지 않는다.
노드는 임의 Python 실행이 가능하므로 출처·버전·의존성·위험 확인을 거쳐 opt-in 설치한다.

선택형 서드파티 모델은 해당 라이선스·사용 조건과 필요한 연령/권한 확인을 따른다.
안전 장치 제거 또는 서비스 제한 우회 기능은 제공하지 않는다.
미성년자 성적 콘텐츠, 비동의 친밀 이미지, 실존 인물 사칭 방지 정책을 유지한다.
