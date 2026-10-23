import { afterEach,it,expect,vi } from 'vitest';
import { VoiceRecorder } from '../src/recorder.js';
import { allowAudioPermission } from '../desktop/permissions.js';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
function fake(){
 const stop=vi.fn();const stream={getTracks:()=>[{stop}]};
 class Recorder {static isTypeSupported(){return true;}state='inactive';mimeType='audio/webm';ondataavailable:((e:{data:Blob})=>void)|null=null;onstop:(()=>void)|null=null;onerror:(()=>void)|null=null;start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['test'],{type:'audio/webm'})});this.onstop?.();}}
 vi.stubGlobal('MediaRecorder',Recorder);return {stream,stop};
}
it('stops a late microphone grant after disposal without starting recording',async()=>{
 const {stream,stop}=fake();let grant!:(s:unknown)=>void;vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:()=>new Promise(r=>{grant=r;})}});
 const recorder=new VoiceRecorder();const received=vi.fn();const pending=recorder.start(received,vi.fn(),vi.fn());recorder.dispose();grant(stream);await pending;expect(stop).toHaveBeenCalledOnce();expect(received).not.toHaveBeenCalled();
});
it('exports recorded audio on stop, auto-stops at 60s and discards on navigation',async()=>{
 vi.useFakeTimers();const {stream,stop}=fake();vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:async()=>stream}});const recorder=new VoiceRecorder();const received=vi.fn();await recorder.start(received,vi.fn(),vi.fn());await vi.advanceTimersByTimeAsync(60000);expect(received).toHaveBeenCalledOnce();expect(stop).toHaveBeenCalled();
 await recorder.start(received,vi.fn(),vi.fn());recorder.dispose();expect(received).toHaveBeenCalledOnce();
});
it('permits only same-app main-frame audio; denies camera, child frames and other origins',()=>{
 const input={permission:'media',origin:'http://127.0.0.1:4000',appOrigin:'http://127.0.0.1:4000',sameContents:true,mainFrame:true,mediaTypes:['audio']};expect(allowAudioPermission(input)).toBe(true);
 for(const patch of [{mediaTypes:['video']},{mediaTypes:['audio','video']},{mediaTypes:[]},{origin:'https://example.com'},{sameContents:false},{mainFrame:false},{permission:'notifications'}])expect(allowAudioPermission({...input,...patch})).toBe(false);
});
it('a stale stop event cannot stop a newer microphone stream',async()=>{
 const instances:Recorder[]=[];
 class Recorder {static isTypeSupported(){return true;}state='inactive';mimeType='audio/webm';ondataavailable:((e:{data:Blob})=>void)|null=null;onstop:(()=>void)|null=null;onerror:(()=>void)|null=null;constructor(){instances.push(this);}start(){this.state='recording';}stop(){this.state='inactive';}}
 const firstStop=vi.fn(),secondStop=vi.fn();let call=0;vi.stubGlobal('MediaRecorder',Recorder);vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop:call++===0?firstStop:secondStop}]})}});
 const recorder=new VoiceRecorder();await recorder.start(vi.fn(),vi.fn(),vi.fn());const old=instances[0];await recorder.start(vi.fn(),vi.fn(),vi.fn());old.onstop?.();expect(secondStop).not.toHaveBeenCalled();recorder.dispose();
});
