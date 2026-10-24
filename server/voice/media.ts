import { stat,readFile,rm } from 'node:fs/promises';
import { ffmpeg,ffprobe,runProcess } from '../video/process.js';
export type AudioFormat='wav'|'mp3'|'webm';
const demuxer={wav:'wav',mp3:'mp3',webm:'matroska'};
const options=(format:AudioFormat)=>['-max_alloc','67108864','-threads','2','-protocol_whitelist','file,pipe','-f',demuxer[format]];
/** Full decode is bounded to max+1 seconds; reaching that sentinel rejects rather than truncates. */
export async function normalizeAudio(input:string,format:AudioFormat,output:string,signal?:AbortSignal,maxSeconds=60):Promise<number> {
 try {
  const info=await stat(input);if(info.size===0||info.size>32*1024**2)throw new Error('오디오 파일 크기 한도를 초과했습니다.');
  const raw=await runProcess(ffprobe(),['-v','error',...options(format),'-show_streams','-show_format','-of','json',input],signal,15000,true);
  const meta=JSON.parse(raw);const streams=meta.streams as {codec_type:string;codec_name:string;sample_rate:string;channels:number;duration?:string}[];
  if(streams.length!==1||streams[0].codec_type!=='audio'||!['pcm_s16le','pcm_s24le','pcm_s32le','pcm_f32le','pcm_u8','mp3','opus','vorbis'].includes(streams[0].codec_name))throw new Error('단일 WAV/MP3/WebM 오디오만 지원합니다.');
  const stream=streams[0],rate=Number(stream.sample_rate);if(!Number.isFinite(rate)||rate<8000||rate>48000||![1,2].includes(stream.channels))throw new Error('오디오는 8–48kHz, 모노 또는 스테레오여야 합니다.');
  for(const d of [stream.duration,meta.format?.duration])if(d!==undefined&&d!=='N/A'&&(!Number.isFinite(Number(d))||Number(d)>maxSeconds+0.1))throw new Error(`오디오는 최대 ${maxSeconds}초입니다.`);
  await runProcess(ffmpeg(),['-v','error','-xerror','-err_detect','explode','-nostdin',...options(format),'-i',input,'-map','0:a:0','-vn','-sn','-dn','-t',String(maxSeconds+1),'-ac','1','-ar','24000','-c:a','pcm_s16le','-map_metadata','-1','-f','wav',output],signal,120000,true);
  const duration=await validateWav(output,maxSeconds);
  return duration;
 }catch(error){await rm(output,{force:true});throw error;}
}
/** Validate actual PCM frames, not just container duration. */
export async function validateWav(path:string,maxSeconds=600):Promise<number>{
 const size=(await stat(path)).size;if(size>maxSeconds*48000+65536)throw new Error('오디오 디코드 크기 상한 초과');
 const b=await readFile(path);if(b.length<44||b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WAVE'||b.readUInt32LE(4)+8!==b.length)throw new Error('손상된 WAV 결과');
 let offset=12,frames=0,valid=false,found=false;
 while(offset+8<=b.length){const tag=b.toString('ascii',offset,offset+4),n=b.readUInt32LE(offset+4);offset+=8;if(offset+n>b.length)throw new Error('잘린 WAV');
  if(tag==='fmt '){if(valid||n<16||b.readUInt16LE(offset)!==1||b.readUInt16LE(offset+2)!==1||b.readUInt32LE(offset+4)!==24000||b.readUInt16LE(offset+14)!==16||b.readUInt16LE(offset+12)!==2)throw new Error('24kHz 모노 PCM16 WAV가 필요합니다.');valid=true;}
  if(tag==='data'){if(found||n%2)throw new Error('잘못된 PCM 데이터');found=true;frames=n/2;}
  offset+=n+(n%2);
 }
 const duration=frames/24000;if(!valid||!found||offset!==b.length||duration<0.1||duration>maxSeconds+0.01)throw new Error(`음성 길이는 0.1–${maxSeconds}초여야 합니다.`);return duration;
}
