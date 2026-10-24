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


def test_segmentation_never_sends_blank_chunks_to_tts():
    chunks=split_text('첫 문장.'+' '*500+'마지막 문장.')
    assert all(part.strip() for part in chunks)


def test_rvc_adapter_uses_native_sample_rate_and_local_models(tmp_path, monkeypatch):
    import sys
    import types
    import numpy as np
    root=tmp_path/'rvc'
    (root/'base_model').mkdir(parents=True)
    for name in ('hubert_base.pt','rmvpe.pt'):
        (root/'base_model'/name).write_bytes(b'fixture')
    observed={}
    torch=types.ModuleType('torch')
    load_options=[]
    def torch_load(*args, **kwargs):
        load_options.append(kwargs)
        return {'config': [],'weight':{}}
    torch.load=torch_load
    torch.cuda=types.SimpleNamespace(is_available=lambda:False)
    torch.manual_seed=lambda seed: observed.update(seed=seed)
    scipy=types.ModuleType('scipy');scipy.__path__=[]
    scipy.signal=types.ModuleType('scipy.signal')
    scipy.io=types.ModuleType('scipy.io');scipy.io.__path__=[]
    scipy.io.wavfile=types.ModuleType('scipy.io.wavfile')
    class Converter:
        def __init__(self,**kwargs): observed.update(kwargs)
        def set_params(self,**kwargs): observed.update(kwargs)
        def infer_file(self,source,output):
            observed['source']=source
            # Native model rate must remain 40 kHz; parent normalizes this correctly.
            with wave.open(output,'wb') as f:
                f.setnchannels(1);f.setsampwidth(2);f.setframerate(40000);f.writeframes(np.zeros(4000,dtype='<i2').tobytes())
    infer=types.ModuleType('rvc_python.infer');infer.RVCInference=Converter
    modules=types.ModuleType('rvc_python.modules.vc.modules')
    for name,module in [('torch',torch),('scipy',scipy),('scipy.signal',scipy.signal),('scipy.io',scipy.io),('scipy.io.wavfile',scipy.io.wavfile),('rvc_python',types.ModuleType('rvc_python')),('rvc_python.infer',infer),('rvc_python.modules',types.ModuleType('rvc_python.modules')),('rvc_python.modules.vc',types.ModuleType('rvc_python.modules.vc')),('rvc_python.modules.vc.modules',modules)]:
        monkeypatch.setitem(sys.modules,name,module)
    from voice_worker.adapters import rvc
    out=tmp_path/'rvc.wav'
    rvc({'device':'cpu','source':'source.wav','pitch':-3,'seed':37},{'path':str(tmp_path/'speaker.pth'),'version':'v2'},root,str(out))
    assert observed.get('seed')==37
    assert observed['f0up_key']==-3
    assert observed['resample_sr']==0
    assert observed['index_rate']==0
    assert observed['model_path']==str(tmp_path/'speaker.pth')
    assert observed['source']=='source.wav'
    with wave.open(str(out)) as f:
        assert f.getframerate()==40000
    with (root/'base_model'/'hubert_base.pt').open('rb') as handle:
        torch.load(handle, map_location='cpu')
    assert load_options[-1]['weights_only'] is False
    torch.load(str(tmp_path/'speaker.pth'), weights_only=False)
    assert load_options[-1]['weights_only'] is True
    infer.download_rvc_models(str(root))
    (root/'base_model'/'rmvpe.pt').unlink()
    with pytest.raises(ValueError):
        infer.download_rvc_models(str(root))


def test_cli_emits_utf8_status_even_under_non_utf8_windows_style_stdio():
    import os
    import subprocess
    import sys
    import json
    result=subprocess.run([sys.executable,str(Path(__file__).resolve().parents[1]/'runner.py'),'status'],capture_output=True,env={**os.environ,'PYTHONIOENCODING':'ascii'},timeout=10)
    assert result.returncode==0, result.stderr.decode('utf-8',errors='replace')
    data=json.loads(result.stdout.decode('utf-8'))
    assert len(data['engines'])==3
    assert all(isinstance(e['message'],str) for e in data['engines'])
