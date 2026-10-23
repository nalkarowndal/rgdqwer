import { readFile,stat,rm } from 'node:fs/promises';
import type { VideoInput } from '../../src/video.js';
import { runProcess,ffmpeg,ffprobe } from './process.js';
import { validatePng } from '../generation/output.js';
const inputOptions=['-protocol_whitelist','file,pipe','-f','mov','-enable_drefs','0','-use_absolute_path','0'];
const base=['-v','error','-nostdin','-max_alloc','268435456','-threads','2'];
export interface VideoMetadata {width:number;height:number;frames:number;fps:number;duration:number}
export async function probeVideo(file:string,signal?:AbortSignal,maximum=32*1024**2):Promise<VideoMetadata> {
 if((await stat(file)).size>maximum)throw new Error('영상 파일 크기 제한을 초과했습니다.');
 // Force MOV demuxing, then bound header dimensions before frame decoding allocates memory.
 const raw=JSON.parse(await runProcess(ffprobe(),['-v','error','-max_alloc','268435456',...inputOptions,'-show_streams','-show_format','-of','json',file],signal));
 const streams=raw.streams as Array<Record<string,unknown>>;
 if(!Array.isArray(streams))throw new Error('영상 스트림이 없습니다.');
 const videos=streams.filter(v=>v.codec_type==='video');
 const v=videos[0]; const width=Number(v?.width),height=Number(v?.height),duration=Number(v?.duration??raw.format?.duration);
 const rate=String(v?.avg_frame_rate).split('/').map(Number);const fps=rate[0]/rate[1];
 if(videos.length!==1||v.codec_name!=='h264'||v.pix_fmt!=='yuv420p'||![width,height,duration,fps].every(Number.isFinite)||width<1||height<1||width>1920||height>1920||width*height>1920*1080||duration<=0||duration>30.1||fps<=0||fps>60||streams.length>2||streams.some(s=>!['video','audio'].includes(String(s.codec_type))))throw new Error('MP4 H264/yuv420p 단일 영상, 최대 1920×1080픽셀·30초·60FPS만 지원합니다.');
 await runProcess(ffmpeg(),[...base,'-xerror','-err_detect','explode',...inputOptions,'-i',file,'-map','0:v:0','-an','-f','null','-'],signal);
 const counted=JSON.parse(await runProcess(ffprobe(),['-v','error',...inputOptions,'-count_frames','-select_streams','v:0','-show_entries','stream=nb_read_frames','-of','json',file],signal));
 const frames=Number(counted.streams?.[0]?.nb_read_frames);
 if(!Number.isInteger(frames)||frames<1||frames>1806)throw new Error('영상 프레임 수가 허용 범위를 벗어났습니다.');
 return {width,height,frames,fps,duration};
}
export async function processVideo(source:string,output:string,input:VideoInput,signal?:AbortSignal):Promise<string[]> {
 const metadata=await probeVideo(source,signal);
 if(input.startSeconds>=metadata.duration)throw new Error('시작 시간이 원본 영상 길이보다 깁니다.');
 const scale=input.fit==='contain'?`scale=${input.width}:${input.height}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${input.width}:${input.height}:(ow-iw)/2:(oh-ih)/2`:`scale=${input.width}:${input.height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${input.width}:${input.height}`;
 const rate=input.interpolation==='motion'?`minterpolate=fps=${input.fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1`:`fps=${input.fps}`;
 const filter=`${scale},setsar=1,tpad=stop_mode=clone:stop_duration=10,${rate},format=yuv420p`;
 const extract=input.mode==='extract';const files=extract?Array.from({length:input.frames},(_,i)=>`${output}-${String(i+1).padStart(4,'0')}.png`):[output];
 try {
  await runProcess(ffmpeg(),[...base,...inputOptions,'-ss',String(input.startSeconds),'-i',source,'-map','0:v:0',...(input.includeAudio&&!extract?['-map','0:a:0?','-c:a','aac','-b:a','128k']:['-an']),'-vf',filter,'-frames:v',String(input.frames),'-t',String(input.frames/input.fps),'-filter_threads','1',...(extract?['-c:v','png']:['-c:v','libx264','-threads','2','-preset','fast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart','-fs',String(64*1024**2)]),'-n',extract?`${output}-%04d.png`:output],signal);
  if(extract) for(const file of files)validatePng(await readFile(file),input.width,input.height);
  else await validateVideoOutput(output,input,signal);
  return files;
 }catch(error){await Promise.all(files.map(file=>rm(file,{force:true})));throw error;}
}
export async function validateVideoOutput(file:string,input:VideoInput,signal?:AbortSignal) {
 const metadata=await probeVideo(file,signal,64*1024**2);
 if(metadata.width!==input.width||metadata.height!==input.height||metadata.frames!==input.frames||Math.abs(metadata.fps-input.fps)>.01)throw new Error('영상 출력의 크기·FPS·프레임 수가 요청과 다릅니다.');
 return metadata;
}
