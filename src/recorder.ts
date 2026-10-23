/** Owns all microphone tracks, including permission grants arriving after navigation. */
export class VoiceRecorder {
 private generation=0;private recorder?:MediaRecorder;private stream?:MediaStream;private timer?:ReturnType<typeof setTimeout>;
 async start(onBlob:(blob:Blob)=>void,onError:(message:string)=>void,onRecording:(active:boolean)=>void){
  this.dispose();const generation=this.generation;
  try{
   if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw new Error('이 환경에서 마이크 녹음을 사용할 수 없습니다. WAV/MP3를 업로드하세요.');
   const mimeType=['audio/webm;codecs=opus','audio/webm'].find(type=>MediaRecorder.isTypeSupported(type));if(!mimeType)throw new Error('WebM 녹음을 지원하는 브라우저 또는 데스크톱 앱을 사용하세요.');
   const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
   if(this.generation!==generation){stream.getTracks().forEach(t=>t.stop());return;}
   this.stream=stream;const recorder=new MediaRecorder(stream,{mimeType});this.recorder=recorder;const chunks:Blob[]=[];let size=0;let failed=false;
   recorder.ondataavailable=event=>{if(this.generation!==generation)return;size+=event.data.size;if(size>16*1024**2){failed=true;this.stop();onError('녹음이 16MiB를 초과했습니다. 짧게 다시 녹음하세요.');}else if(event.data.size)chunks.push(event.data);};
   recorder.onerror=()=>{if(this.generation!==generation)return;failed=true;this.stop();if(this.generation===generation)onError('마이크 녹음에 실패했습니다.');};
   recorder.onstop=()=>{if(this.generation!==generation)return;this.release();onRecording(false);if(!failed&&chunks.length)onBlob(new Blob(chunks,{type:recorder.mimeType}));};
   recorder.start(1000);onRecording(true);this.timer=setTimeout(()=>this.stop(),60000);
  }catch(error){this.release();if(this.generation===generation){onRecording(false);onError(error instanceof Error?error.message:'마이크 권한을 확인하세요.');}}
 }
 private release(){if(this.timer)clearTimeout(this.timer);this.timer=undefined;this.stream?.getTracks().forEach(t=>t.stop());this.stream=undefined;}
 stop(){this.release();if(this.recorder?.state==='recording')this.recorder.stop();}
 dispose(){this.generation++;this.stop();this.recorder=undefined;}
}
