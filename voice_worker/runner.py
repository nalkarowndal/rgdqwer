"""Isolated local inference CLI. No HTTP service, shell commands or automatic downloads."""
import json
import os
import re
import sys
from pathlib import Path
from importlib.util import find_spec

# This entry point also works when launched as an absolute script from Electron.
if __package__ in (None, ''):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'


def split_text(text):
    text = text.strip()
    if not text or len(text) > 3000:
        raise ValueError('대사는 1–3000자여야 합니다.')
    parts = []
    while text:
        limit = min(180, len(text))
        if len(text) > limit:
            candidates = [m.end() for m in re.finditer(r'[.!?。！？\n\s]', text[:limit]) if m.end() >= 60]
            if candidates:
                limit = candidates[-1]
        if text[:limit].strip():
            parts.append(text[:limit])
        text = text[limit:]
    return parts


def chatterbox_dir(engine):
    root = os.environ.get('STUDIO_CHATTERBOX_DIR', '')
    if not root:
        raise ValueError('STUDIO_CHATTERBOX_DIR에 로컬 모델 폴더를 지정하세요.')
    required = ['s3gen.safetensors'] if engine == 'chatterbox-vc' else ['ve.pt', 's3gen.pt', 't3_mtl23ls_v2.safetensors', 'grapheme_mtl_merged_expanded_v1.json']
    for name in required:
        if not (Path(root) / name).is_file():
            raise ValueError(f'로컬 모델 파일이 없습니다: {name}')
    return root


def rvc_catalog():
    path = os.environ.get('STUDIO_RVC_CATALOG')
    if not path:
        raise ValueError('STUDIO_RVC_CATALOG에 신뢰하는 모델 목록 JSON을 지정하세요.')
    if Path(path).stat().st_size > 65536:
        raise ValueError('RVC 모델 목록이 너무 큽니다.')
    rows = json.loads(Path(path).read_text(encoding='utf-8'))
    if not isinstance(rows, list) or len(rows) > 100:
        raise ValueError('RVC 모델 목록 형식 오류')
    for row in rows:
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,80}', row['id']) or not Path(row['path']).is_absolute() or not Path(row['path']).is_file() or row.get('version', 'v2') not in ('v1', 'v2'):
            raise ValueError('RVC 모델 ID/절대 경로/버전을 확인하세요.')
        if row.get('index') and (not Path(row['index']).is_absolute() or not Path(row['index']).is_file()):
            raise ValueError('RVC 인덱스 파일이 없습니다.')
    return rows


def rvc_assets():
    spec = find_spec('rvc_python')
    if spec is None or not spec.origin:
        raise ValueError('독립 RVC 환경을 설치하세요.')
    root = Path(spec.origin).parent
    for name in ('hubert_base.pt', 'rmvpe.pt'):
        if not (root / 'base_model' / name).is_file():
            raise ValueError(f'RVC base_model/{name} 파일이 없습니다. 자동 다운로드하지 않습니다.')
    return root


def status():
    engines = []
    for engine in ('chatterbox-tts', 'chatterbox-vc', 'rvc'):
        try:
            if engine == 'rvc':
                rvc_assets()
                rvc_catalog()
            else:
                if find_spec('chatterbox') is None:
                    raise ValueError('독립 Chatterbox 환경을 설치하세요.')
                chatterbox_dir(engine)
            engines.append(dict(id=engine, available=True, message='로컬 파일 확인 완료 · 실제 추론은 실행 시 검증'))
        except (ValueError, OSError, ImportError, KeyError, TypeError) as exc:
            engines.append(dict(id=engine, available=False, message=str(exc)))
    return dict(engines=engines)


def run_request(req, output):
    engine = req.get('engine')
    if engine not in ('chatterbox-tts', 'chatterbox-vc', 'rvc'):
        raise ValueError('지원하지 않는 음성 엔진')
    if req.get('authorized') is not True or req.get('language') not in ('ko', 'ja', 'en'):
        raise ValueError('언어 또는 사용 허가를 확인하세요.')
    for name, low, high in [('exaggeration', 0, 2), ('cfg', 0, 1), ('temperature', .1, 1.5), ('pitch', -12, 12), ('seed', 0, 4294967295)]:
        value = req.get(name)
        if not isinstance(value, (int, float)) or not low <= value <= high:
            raise ValueError(f'음성 설정 범위 오류: {name}')
    if req['pitch'] != int(req['pitch']) or (engine != 'rvc' and req['pitch'] != 0):
        raise ValueError('피치 조정은 RVC에서만 지원합니다.')
    device = os.environ.get('STUDIO_VOICE_DEVICE', 'cpu')
    if device not in ('cpu', 'cuda'):
        raise ValueError('STUDIO_VOICE_DEVICE는 cpu 또는 cuda여야 합니다.')
    req = {**req, 'device': device}
    if engine == 'chatterbox-tts':
        split_text(req.get('prompt', ''))
    for field in (['reference'] if engine == 'chatterbox-tts' else ['source', 'reference'] if engine == 'chatterbox-vc' else ['source']):
        if not Path(req.get(field, '')).is_file():
            raise ValueError('음성 원본 또는 참고 파일이 없습니다.')
    if engine == 'rvc':
        root = rvc_assets()
        model = next((m for m in rvc_catalog() if m['id'] == req.get('rvcModel')), None)
        if model is None:
            raise ValueError('등록된 RVC 모델이 없습니다.')
        from voice_worker.adapters import rvc
        rvc(req, model, root, output)
    else:
        root = chatterbox_dir(engine)
        from voice_worker.adapters import chatterbox
        chatterbox(req, root, output)


def main():
    try:
        if len(sys.argv) == 2 and sys.argv[1] == 'status':
            print(json.dumps(status(), ensure_ascii=False))
        elif len(sys.argv) == 4 and sys.argv[1] == 'run':
            request = Path(sys.argv[2])
            if request.stat().st_size > 65536:
                raise ValueError('요청 크기 상한 초과')
            run_request(json.loads(request.read_text(encoding='utf-8')), sys.argv[3])
        else:
            raise ValueError('Usage: runner.py status | run request.json output.wav')
    except Exception as exc:
        print(f'음성 엔진 실패: {exc}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
