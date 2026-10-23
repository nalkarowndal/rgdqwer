"""Adapters for pinned upstream APIs. Inputs and paths are provided by the local job owner."""
import wave
from pathlib import Path
from voice_worker.runner import split_text


def chatterbox(req, directory, output):
    import numpy as np
    import torch
    if req['device'] == 'cuda' and not torch.cuda.is_available():
        raise ValueError('CUDA를 사용할 수 없습니다. 장치 설정을 확인하세요.')
    torch.manual_seed(req['seed'])
    if req['engine'] == 'chatterbox-tts':
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
        model = ChatterboxMultilingualTTS.from_local(directory, device=req['device'])
        chunks = split_text(req['prompt'])
    else:
        from chatterbox.vc import ChatterboxVC
        model = ChatterboxVC.from_local(directory, device=req['device'])
        chunks = [None]
    if model.sr != 24000:
        raise ValueError('지원하지 않는 Chatterbox 샘플레이트')
    total = 0
    # Incremental write avoids holding every long-text chunk in GPU/CPU memory.
    with wave.open(output, 'wb') as dest:
        dest.setnchannels(1)
        dest.setsampwidth(2)
        dest.setframerate(24000)
        for text in chunks:
            if text is None:
                result = model.generate(req['source'], target_voice_path=req['reference'])
            else:
                result = model.generate(text, language_id=req['language'], audio_prompt_path=req['reference'], exaggeration=req['exaggeration'], cfg_weight=req['cfg'], temperature=req['temperature'])
            samples = np.asarray(result.detach().cpu().numpy()).reshape(-1)
            total += len(samples)
            if not len(samples) or not np.isfinite(samples).all() or total > 24000 * 600:
                raise ValueError('엔진 음성 출력이 비정상이거나 600초를 초과했습니다.')
            # Preserve the watermarked waveform returned by the engine.
            dest.writeframes((np.clip(samples, -1, 1) * 32767).astype('<i2').tobytes())


def rvc(req, model, root, output):
    import numpy as np
    import torch
    import scipy.signal
    import scipy.io.wavfile
    import rvc_python.infer as infer
    import rvc_python.modules.vc.modules as modules
    if req['device'] == 'cuda' and not torch.cuda.is_available():
        raise ValueError('CUDA를 사용할 수 없습니다.')
    # Upstream constructor otherwise downloads missing assets via requests.
    def local_assets_only(_directory):
        for name in ('hubert_base.pt', 'rmvpe.pt'):
            if not (Path(root) / 'base_model' / name).is_file():
                raise ValueError(f'필수 로컬 RVC 파일 없음: {name}')
    infer.download_rvc_models = local_assets_only
    # Avoid upstream shell-based FFmpeg decoding; Node already normalized this WAV.
    def load_owned_audio(path, target_rate):
        rate, audio = scipy.io.wavfile.read(path)
        if rate != 24000 or audio.dtype != np.int16 or audio.ndim != 1:
            raise ValueError('검증된 모노 PCM16 입력이 필요합니다.')
        from math import gcd
        divisor = gcd(rate, target_rate)
        return scipy.signal.resample_poly(audio.astype(np.float32) / 32768, target_rate // divisor, rate // divisor)
    modules.load_audio = load_owned_audio
    # All RVC assets are explicitly trusted operator-provisioned local files.
    # Speaker .pth is constrained to weights-only loading before upstream sees it.
    original_load = torch.load
    trusted_hubert = (Path(root) / 'base_model' / 'hubert_base.pt').resolve()
    def local_load(path, *args, **kwargs):
        # Fairseq HuBERT contains OmegaConf metadata; only this explicitly provisioned
        # base asset may deserialize metadata. Speaker/RMVPE checkpoints stay weights-only.
        filename = path if isinstance(path, (str, Path)) else getattr(path, 'name', None)
        kwargs['weights_only'] = not (isinstance(filename, (str, Path)) and Path(filename).resolve() == trusted_hubert)
        return original_load(path, *args, **kwargs)
    torch.load = local_load
    checkpoint = torch.load(model['path'], map_location='cpu', weights_only=True)
    if not isinstance(checkpoint, dict) or not {'config', 'weight'}.issubset(checkpoint):
        raise ValueError('RVC 화자 모델 형식 오류')
    del checkpoint
    converter = infer.RVCInference(models_dir=str(Path(model['path']).parent), device='cuda:0' if req['device']=='cuda' else 'cpu', model_path=model['path'], index_path=model.get('index', ''), version=model.get('version', 'v2'))
    converter.set_params(f0up_key=req['pitch'], f0method='rmvpe', index_rate=0.5 if model.get('index') else 0, resample_sr=0)
    converter.infer_file(req['source'], output)
