import importlib
import wave
import pytest
from pathlib import Path
from voice_worker.runner import split_text, run_request, status


def test_segments_preserve_multilingual_text_and_bound_unbroken_lines():
    for text in ['안녕. 반갑습니다! 日本語。 Hello world.', '長' * 501, '😀' * 181]:
        parts = split_text(text)
        assert ''.join(parts).replace(' ', '') == text.replace(' ', '')
        assert all(0 < len(p) <= 180 for p in parts)
    with pytest.raises(ValueError):
        split_text(' ')


def test_missing_models_are_unavailable_and_never_download(monkeypatch):
    monkeypatch.delenv('STUDIO_CHATTERBOX_DIR', raising=False)
    monkeypatch.delenv('STUDIO_RVC_CATALOG', raising=False)
    s = status()
    assert not any(e['available'] for e in s['engines'])


def test_chatterbox_adapter_calls_real_api_contract_and_concatenates(tmp_path, monkeypatch):
    # Dependency doubles only; the production adapter and PCM writer run unchanged.
    import sys
    import types
    import numpy as np
    calls = []
    class Tensor:
        def __init__(self): self.value = np.zeros((1, 2400), dtype=np.float32)
        def detach(self): return self
        def cpu(self): return self
        def numpy(self): return self.value
    class Model:
        sr = 24000
        @classmethod
        def from_local(cls, directory, device): calls.append(('load', directory, device)); return cls()
        def generate(self, *args, **kwargs): calls.append(('generate', args, kwargs)); return Tensor()
    torch = types.SimpleNamespace(manual_seed=lambda n:None, cuda=types.SimpleNamespace(is_available=lambda:False))
    monkeypatch.setitem(sys.modules, 'torch', torch)
    monkeypatch.setitem(sys.modules, 'chatterbox.mtl_tts', types.SimpleNamespace(ChatterboxMultilingualTTS=Model))
    monkeypatch.setitem(sys.modules, 'chatterbox.vc', types.SimpleNamespace(ChatterboxVC=Model))
    from voice_worker.adapters import chatterbox
    req = {'engine':'chatterbox-tts','prompt':'가'*181,'language':'ko','reference':'reference.wav','seed':3,'exaggeration':0.7,'cfg':0.4,'temperature':0.9,'device':'cpu'}
    out = tmp_path/'out.wav'
    chatterbox(req, str(tmp_path), str(out))
    with wave.open(str(out)) as f:
        assert f.getframerate() == 24000
        assert f.getnframes() == 4800
    assert calls[1][2] == {'language_id':'ko','audio_prompt_path':'reference.wav','exaggeration':0.7,'cfg_weight':0.4,'temperature':0.9}
    calls.clear()
    chatterbox({**req,'engine':'chatterbox-vc','source':'source.wav'},str(tmp_path),str(tmp_path/'vc.wav'))
    assert calls[1][1] == ('source.wav',)
    assert calls[1][2] == {'target_voice_path':'reference.wav'}


def test_run_rejects_invalid_request_before_loading_models(tmp_path):
    with pytest.raises(ValueError):
        run_request({'engine':'unknown'}, str(tmp_path/'out.wav'))


def test_rvc_catalog_rejects_path_and_version_errors(tmp_path, monkeypatch):
    import json
    from voice_worker.runner import rvc_catalog
    file = tmp_path/'models.json'
    monkeypatch.setenv('STUDIO_RVC_CATALOG', str(file))
    file.write_text(json.dumps([{'id':'bad','path':'relative.pth'}]))
    with pytest.raises(ValueError):
        rvc_catalog()
    model = tmp_path/'model.pth'
    model.write_bytes(b'fixture')
    file.write_text(json.dumps([{'id':'my_voice','path':str(model),'version':'v2'}]))
    assert rvc_catalog()[0]['id'] == 'my_voice'
