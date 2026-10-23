import { spawn } from 'node:child_process';
/** Reject only after close: callers can then safely remove partial files on Windows. */
export function runProcess(program:string,args:string[],signal?:AbortSignal,timeout=120000,failOnStderr=false):Promise<string> {
 return new Promise((resolve,reject)=>{
  if(signal?.aborted) {reject(new Error('미디어 처리가 취소되었습니다.'));return;}
  const child=spawn(program,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let failure:Error|undefined; let size=0; const chunks:Buffer[]=[]; const errors:Buffer[]=[];
  const stop=(message:string)=>{failure??=new Error(message);child.kill('SIGKILL');};
  const abort=()=>stop('미디어 처리가 취소되었습니다.');
  signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>stop('미디어 처리 시간이 초과되었습니다.'),timeout);
  child.stdout.on('data',(data:Buffer)=>{size+=data.length;if(size>1024**2)stop('미디어 출력 상한을 초과했습니다.');else chunks.push(data);});
  child.stderr.on('data',(data:Buffer)=>{size+=data.length;if(size>1024**2)stop('미디어 출력 상한을 초과했습니다.');else errors.push(data);});
  child.on('error',()=>{failure=new Error('FFmpeg/ffprobe를 실행할 수 없습니다. PATH 또는 STUDIO_FFMPEG / STUDIO_FFPROBE 설정을 확인하세요.');});
  child.on('close',code=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);if(failure)reject(failure);else if(code!==0||(failOnStderr&&errors.length>0))reject(new Error(`미디어 형식·디코드 검증 또는 변환 실패: ${Buffer.concat(errors).toString().slice(-1000)}`));else resolve(Buffer.concat(chunks).toString());});
 });
}
export const ffmpeg=()=>process.env.STUDIO_FFMPEG||'ffmpeg';
export const ffprobe=()=>process.env.STUDIO_FFPROBE||'ffprobe';
export async function mediaToolsStatus() {
 try {const versions=await Promise.all([runProcess(ffmpeg(),['-version'],undefined,5000),runProcess(ffprobe(),['-version'],undefined,5000)]);return {available:true,message:versions.map(v=>v.split('\n')[0]).join(' · ')};}
 catch(error){return {available:false,message:error instanceof Error?error.message:'FFmpeg 실행 실패'};}
}
