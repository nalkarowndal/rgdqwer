// Real-model acceptance runner. No simulated speech or fallback implementation.
import { mkdtemp,readFile,writeFile,mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve,extname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../dist/server/app.js';
const options=Object.fromEntries(process.argv.slice(2).reduce((pairs,item,index,args)=>index%2===0?[...pairs,[item,args[index+1]]]:pairs,[]));
if(!options['--reference']||!options['--source']||!options['--out'])throw new Error('Usage: node scripts/smoke-voice.mjs --reference authorized.wav --source recorded.wav --out output-directory [--rvc-model catalog-id]');
const dataDir=await mkdtemp(join(tmpdir(),'rgdqwer-voice-acceptance-'));
const app=await createApp({dataDir});
try{
 const host={host:'127.0.0.1'};const token=(await app.inject({url:'/api/session',headers:host})).json().token;const headers={...host,authorization:`Bearer ${token}`};
 const request=async(method,url,payload,extra={})=>{const r=await app.inject({method,url,headers:{...headers,...extra},payload});if(r.statusCode>=400)throw new Error(r.body);return r.json();};
 const upload=async(path)=>request('POST',`/api/voice/audio/${extname(path).slice(1).toLowerCase()}`,await readFile(path),{'content-type':'application/octet-stream'});
 const reference=await upload(options['--reference']);const source=await upload(options['--source']);
 const engines=['chatterbox-tts','chatterbox-vc',...(options['--rvc-model']?['rvc']:[])];
 const status=await request('GET','/api/voice/status');for(const engine of engines)if(!status.engines.find(e=>e.id===engine)?.available)throw new Error(`Engine unavailable: ${engine}`);
 const profile=await request('POST','/api/voice/profiles',{name:'Actual model acceptance',referenceId:reference.id,languages:['ko','ja','en'],engines,rvcModel:options['--rvc-model'],permission:'Operator supplied authorized reference for local acceptance testing',authorized:true,defaults:{exaggeration:0.5,cfg:0.5,temperature:0.8,pitch:0}});
 const output=resolve(options['--out']);await mkdir(output,{recursive:true});const report=[];
 for(const engine of engines){
  const j=await request('POST','/api/jobs',{profile:'voice',engine,voiceProfileId:profile.id,sourceId:source.id,prompt:'안녕하세요. 로컬 음성 생성과 변환을 검증합니다.',language:'ko',seed:123,authorized:true,exaggeration:0.5,cfg:0.5,temperature:0.8,pitch:0});
  let result;const deadline=Date.now()+31*60*1000;
  do{await delay(1000);result=await request('GET',`/api/jobs/${j.id}`);}while(!['completed','failed','cancelled'].includes(result.state)&&Date.now()<deadline);
  if(result.state!=='completed')throw new Error(`${engine}: ${result.error??result.state}`);
  for(const artifact of result.artifacts){const r=await app.inject({url:`/api/artifacts/${artifact.id}`,headers});if(r.statusCode!==200)throw new Error('Artifact unavailable');await writeFile(join(output,`${engine}-${artifact.fileName}`),r.rawPayload);}
  report.push(result);console.log(`${engine}: actual inference and decoded WAV/MP3 export passed`);
 }
 await writeFile(join(output,'acceptance.json'),JSON.stringify({checkedAt:new Date().toISOString(),device:process.env.STUDIO_VOICE_DEVICE??'cpu',jobs:report,manualListeningRequired:true},null,2));
 console.log('Listen to every output and record pronunciation, speaker identity, artifacts and GPU memory. Automated export success alone is not quality acceptance.');
}finally{await app.close();console.log(`Acceptance data retained locally: ${dataDir}`);}
