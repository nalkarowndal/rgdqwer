# 영상 스튜디오 M5 · v0.6.0

## 실행

1. FFmpeg와 ffprobe를 직접 설치하고 PATH에 추가한다. 앱 실행 계정에서 `ffmpeg -version`, `ffprobe -version`을 확인한다. 대체 경로는 운영자 환경변수 `STUDIO_FFMPEG`, `STUDIO_FFPROBE`로 지정한다. UI는 실행 파일 경로를 받지 않는다. Windows는 FFmpeg 공식 다운로드 페이지의 Windows 빌드를 사용한다. 자동 다운로드·설치는 없다.
2. 영상 스튜디오에서 FFmpeg 변환 또는 PNG 추출을 선택하고 H264/yuv420p MP4를 업로드한다. 가로/세로 32배수, FPS, 프레임 수, 시작 시간을 지정한다. 최대10초/300프레임, 비율 보존 여백 또는 중앙 crop. 짧은 원본은 마지막 프레임으로 채운다. Lanczos와 minterpolate는 AI 초해상도/RIFE가 아니다.
3. 완료 후 인증된 blob 플레이어에서 재생·다운로드한다. 추출은 프레임 선택기로 각 PNG를 저장한다. 기록에서 설정 재사용하면 원본 UUID도 복원한다. 원본 파일이 이동되면 다시 업로드한다.

## Wan 2.2 TI2V 5B

ComfyUI 최신 버전을 별도로 실행한다. 아래 파일을 설치하고 앱 진단에서 실제 loader 목록을 확인한다. 앱은 모델을 다운로드하지 않는다.

| 모델 | ComfyUI 폴더 |
|---|---|
| wan2.2_ti2v_5B_fp16.safetensors | models/diffusion_models |
| umt5_xxl_fp8_e4m3fn_scaled.safetensors | models/text_encoders |
| wan2.2_vae.safetensors | models/vae |

T2V는 Wan22ImageToVideoLatent, I2V는 PNG LoadImage/start_image를 추가한다. 20steps/CFG5/uni_pc/simple, ModelSamplingSD3 shift8, 640×384/33frames/24FPS가 초기값이다. 크기는32배수, 프레임5..121의4n+1, 최대1280×704픽셀, FPS1..30. 저FPS에서는 출력이30초를넘을수있고최대121초지만원본MP4의30초제한은유지한다. CPU 인코더 옵션은 실제 CLIPLoader device=cpu를 사용한다. `--lowvram` 등의 Comfy 실행 옵션은 사용자가 엔진 환경에 맞춰 설정한다. 앱은 서버 실행 플래그를 변경하지 않는다.

AI V2V는 **실험적**이다. 업로드한 MP4를 크기/FPS/프레임 수로 정규화한 뒤 LoadVideo/GetVideoComponents/VAEEncode→KSampler(denoise .05..95)로 재생성한다. 공식5B 템플릿의 T2V/I2V와 구별한다. 실제 품질·시간적 일관성·GPU 추론은 미검증이다. Wan 출력은 무음이며, 오디오 보존은 FFmpeg 변환 모드에서만 선택할 수 있다.

SaveVideo의 구형 format/codec combo와 최신 dynamic format.codec를 `/object_info`로 판별한다. 출력9의 images 메타데이터에서 소유한 MP4만 받는다. 필수노드/모델이 없으면 제출 전 실패하고 원인을 표시한다. 기록이나 큐가 불확실하면 자동 재제출하지 않는다. 취소는 작업별 Comfy API만 사용한다. 서버가 지원하지 않으면 ComfyUI에서 직접 취소한다.

## 메모리·검증 범위

Comfy 문서는 native offloading의8GB 가능성을 안내하지만 독립 Wan CLI 예시는720P/24FPS에24GB이상을 명시한다. 서로 다른 실행 환경이다. **RTX2060SUPER8GB 지원·속도·안정성을 보장하지 않는다.** 해상도/프레임 수를 낮추고 CPU 인코더, 충분한 RAM, 다른GPU작업종료를 시도한다. 실제 장비에서 RAM/VRAM피크/소요시간을 측정해야 한다. 14B·AI 초해상도·RIFE는 범위 밖이다.

현재 검증: 실제 FFmpeg 합성 testsrc2 클립→업로드→변환/보간/Lanczos 확대→전체 디코드/ffprobe→브라우저 재생. PNG 여러 프레임 추출, 기록 복원, scoped lifecycle은 자동 테스트. Comfy 워크플로는 공식 소스 계약과 모의 HTTP 서버를 사용했다. 합성 클립을 AI 생성 결과로 주장하지 않는다. Windows Electron/실제 모델 추론은 별도 게이트다.

## 저장·보안·정리

로컬 bearer 인증, Host/Origin 검사 유지. PNG≤5MiB/4096px/16MP, MP4≤32MiB/H264/yuv420p/최대30초/60FPS/1920×1080픽셀. 서버UUID만 경로에 사용한다. 원본은 dataDir/inputs, 출력은 outputs, 메타데이터는 SQLite v4. 이전이미지 기록은 호환되며 이전v3앱은 새DB를 열지 않는다. 작업이 참조하는 원본은 삭제 API로 지울 수 없다. 추출 PNG는 최대300개이므로 디스크 여유 공간을 확인한다.

FFmpeg는 shell=false, MOV demux 강제, protocol file/pipe만, external data reference/absolute path비활성화, 스레드/시간/프로세스출력/최대할당 제한. 디코더 max_pixels 제한과 모든 디코드 프레임의 크기 일치 검사, 영상·오디오 전체디코드와실제프레임수 검증. 영상·오디오·컨테이너 시간축 모두 원본30초 제한을 적용한다. 출력은 원본제한과 분리해 요청한 frames/fps 재생 길이(0.1초 허용오차)와 오디오 포함 정책을 검사한다. MP4출력≤64MiB 및 요청한크기/FPS/프레임 일치 후 atomic rename. 취소/종료 시 subprocess종료와부분파일정리. 여러미디어검사는동시실행하지않는다.

Comfy input에 `rgdqwer_<job UUID>.png|mp4`가 남는다. 앱은 이 폴더를 직접 삭제하지 않는다. 완료·실패·취소가 확정되고 해당 작업을 Comfy에서 재실행할 필요가 없을 때 사용자가 해당 파일만 수동 정리할 수 있다. 앱 inputs 원본은 따로 보존되므로 재사용 시 새 UUID로 다시 업로드한다. 크래시의 고아 tmp 파일은 앱/엔진이 정지한 상태에서 수동 정리한다.

## 근거·라이선스

- https://docs.comfy.org/tutorials/video/wan/wan2_2
- https://github.com/Comfy-Org/workflow_templates/blob/main/templates/video_wan2_2_5B_ti2v.json
- https://github.com/Wan-Video/Wan2.2
- https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B (Apache2)
- https://ffmpeg.org/ffmpeg-all.html / https://ffmpeg.org/download.html

FFmpeg는 빌드구성에 따라 LGPL/GPL 등의 조건이 달라진다. 앱에 번들하지 않으며 재배포 시 빌드/codec 조건을 별도로 확인한다. 조사에는 Context7/Exa와 공식 Comfy 소스를 사용했다.
