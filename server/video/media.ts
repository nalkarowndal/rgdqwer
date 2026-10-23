import { readFile,stat,rm } from 'node:fs/promises';
import type { VideoInput } from '../../src/video.js';
import { runProcess,ffmpeg,ffprobe } from './process.js';
import { validatePng } from '../generation/output.js';
const runChecked=(program:string,args:string[],signal?:AbortSignal)=>runProcess(program,args,signal,120000,true);
const inputOptions=['-protocol_whitelist','file,pipe','-f','mov','-enable_drefs','0','-use_absolute_path','0'];
const decodeBounds=['-max_alloc','268435456','-threads','2','-max_pixels',String(1920*1080)];
const base=['-v','error','-nostdin',...decodeBounds];
export interface VideoMetadata {width:number;height:number;frames:number;fps:number;duration:number;presentationDuration:number;hasAudio:boolean}
export async function probeVideo(file:string,signal?:AbortSignal,maximum=32*1024**2,maximumDuration=30):Promise<VideoMetadata> {
 if((await stat(file)).size>maximum)throw new Error('영상 파일 크기 제한을 초과했습니다.');
 // Force MOV demuxing, then bound header dimensions before frame decoding allocates memory.
 const raw=JSON.parse(await runChecked(ffprobe(),['-v','error',...decodeBounds,...inputOptions,'-show_streams','-show_format','-of','json',file],signal));
 const streams=raw.streams as Array<Record<string,unknown>>;
 if(!Array.isArray(streams))throw new Error('영상 스트림이 없습니다.');
 const videos=streams.filter(v=>v.codec_type==='video');
 const v=videos[0]; const width=Number(v?.width),height=Number(v?.height),duration=Number(v?.duration??raw.format?.duration);
 const presentationDuration=Number(raw.format?.duration);
 const timelines=[{duration:presentationDuration,start:Number(raw.format?.start_time??0)},...streams.map(stream=>({duration:Number(stream.duration??presentationDuration),start:Number(stream.start_time??0)}))];
 const validTimeline=timelines.every(t=>Number.isFinite(t.duration)&&Number.isFinite(t.start)&&t.duration>0&&t.start>=-.1&&Math.max(t.duration,t.start+t.duration)<=maximumDuration+.1);
 const rate=String(v?.avg_frame_rate).split('/').map(Number);const fps=rate[0]/rate[1];
 if(videos.length!==1||v.codec_name!=='h264'||v.pix_fmt!=='yuv420p'||![width,height,duration,fps].every(Number.isFinite)||width<1||height<1||width>1920||height>1920||width*height>1920*1080||duration<=0||duration>maximumDuration+.1||!validTimeline||fps<=0||fps>60||streams.length>2||streams.some(s=>!['video','audio'].includes(String(s.codec_type))))throw new Error(`MP4 H264/yuv420p 단일 영상, 최대 1920×1080픽셀·${maximumDuration}초·60FPS만 지원합니다. 영상·오디오·컨테이너 길이를 확인하세요.`);
 await runChecked(ffmpeg(),[...base,'-xerror','-err_detect','explode',...inputOptions,'-i',file,'-map','0:v:0','-map','0:a:0?','-f','null','-'],signal);
 const decoded=JSON.parse(await runChecked(ffprobe(),['-v','error',...decodeBounds,...inputOptions,'-select_streams','v:0','-show_entries','frame=width,height','-of','json',file],signal));
 const frameList=decoded.frames as Array<{width:number;height:number}>;
 if(!Array.isArray(frameList)||!frameList.length||frameList.length>Math.ceil(maximumDuration*60)+6)throw new Error('영상 프레임 수가 허용 범위를 벗어났습니다.');
 const declaredFrames=Number(v.nb_frames);
 if(v.nb_frames!==undefined&&(!Number.isInteger(declaredFrames)||declaredFrames!==frameList.length))throw new Error('영상의 선언된 프레임 수와 실제 디코드 수가 다릅니다.');
 if(frameList.some(frame=>frame.width!==width||frame.height!==height))throw new Error('영상 중간에 해상도가 바뀌는 파일은 지원하지 않습니다.');
 return {width,height,frames:frameList.length,fps,duration,presentationDuration,hasAudio:streams.some(s=>s.codec_type==='audio')};
}
export async function processVideo(source:string,output:string,input:VideoInput,signal?:AbortSignal):Promise<string[]> {
 const metadata=await probeVideo(source,signal);
 if(input.startSeconds>=metadata.duration)throw new Error('시작 시간이 원본 영상 길이보다 깁니다.');
 const scale=input.fit==='contain'?`scale=${input.width}:${input.height}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${input.width}:${input.height}:(ow-iw)/2:(oh-ih)/2`:`scale=${input.width}:${input.height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${input.width}:${input.height}`;
 const rate=input.interpolation==='motion'?`minterpolate=fps=${input.fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1`:`fps=${input.fps}`;
 const filter=`${scale},setsar=1,tpad=stop_mode=clone:stop_duration=${input.frames/input.fps+1},${rate},format=yuv420p`;
 const extract=input.mode==='extract';const files=extract?Array.from({length:input.frames},(_,i)=>`${output}-${String(i+1).padStart(4,'0')}.png`):[output];
 try {
  await runChecked(ffmpeg(),[...base,...inputOptions,'-ss',String(input.startSeconds),'-i',source,'-map','0:v:0',...(input.includeAudio&&!extract?['-map','0:a:0?','-c:a','aac','-b:a','128k']:['-an']),'-vf',filter,'-frames:v',String(input.frames),'-t',String(input.frames/input.fps),'-filter_threads','1',...(extract?['-c:v','png']:['-c:v','libx264','-threads','2','-preset','fast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart','-fs',String(64*1024**2)]),'-n',extract?`${output}-%04d.png`:output],signal);
  if(extract) for(const file of files)validatePng(await readFile(file),input.width,input.height);
  else await validateVideoOutput(output,input,signal);
  return files;
 }catch(error){await Promise.all(files.map(file=>rm(file,{force:true})));throw error;}
}
export async function validateVideoOutput(file:string,input:VideoInput,signal?:AbortSignal) {
 const metadata=await probeVideo(file,signal,64*1024**2,input.frames/input.fps);
 if(metadata.width!==input.width||metadata.height!==input.height||metadata.frames!==input.frames||Math.abs(metadata.fps-input.fps)>.01||Math.abs(metadata.duration-input.frames/input.fps)>.1||Math.abs(metadata.presentationDuration-input.frames/input.fps)>.1||(!input.includeAudio&&metadata.hasAudio))throw new Error('영상 출력의 크기·FPS·프레임 수·재생 길이·오디오가 요청과 다릅니다.');
 return metadata;
}
