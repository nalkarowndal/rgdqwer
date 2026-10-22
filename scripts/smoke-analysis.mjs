// Real Node -> HTTP -> Python auth/decode/missing-model smoke; no AI inference claim.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { createApp } from '../dist/server/app.js';
const dataDir = await mkdtemp(join(tmpdir(),'rgdqwer-worker-smoke-'));
const app = await createApp({dataDir});
let worker;
try {
  worker = spawn(process.env.STUDIO_PYTHON ?? 'python', ['-m','worker.run','--token-file',join(dataDir,'worker.token'),'--port','0'], {
    env:{...process.env,STUDIO_FLORENCE_DIR:'',STUDIO_WD14_DIR:''},stdio:['ignore','pipe','pipe'],
  });
  const url = await new Promise((resolve,reject)=> {
    let log = ''; const timer = setTimeout(()=>reject(new Error('Worker startup timed out')),15000);
    worker.once('error',error=>{clearTimeout(timer);reject(error);});
    worker.once('exit',()=>{clearTimeout(timer);reject(new Error('Worker exited before ready'));});
    worker.stderr.on('data',chunk=> { log+=chunk.toString(); const match=log.match(/Uvicorn running on (http:\/\/127\.0\.0\.1:\d+)/); if(match){clearTimeout(timer);resolve(match[1]);} });
  });
  const headers={host:'127.0.0.1',authorization:`Bearer ${(await app.inject({url:'/api/session',headers:{host:'127.0.0.1'}})).json().token}`};
  const settings=(await app.inject({url:'/api/settings',headers})).json();
  await app.inject({method:'PUT',url:'/api/settings',headers,payload:{...settings,workerUrl:url}});
  const status=await app.inject({url:'/api/analysis/status',headers});
  if(status.statusCode!==200 || status.json().models.some(model=>model.available)) throw new Error('Worker status contract failed');
  const image=new PNG({width:16,height:8});image.data.fill(255);
  const response=await app.inject({method:'POST',url:'/api/analysis',headers,payload:{image:PNG.sync.write(image).toString('base64'),model:'florence'}});
  if(response.statusCode!==503) throw new Error(`Expected missing model, got ${response.statusCode}`);
  const unauth=await fetch(`${url}/analysis/status`);
  if(unauth.status!==401) throw new Error('Direct Worker auth failed');
  console.log(JSON.stringify({realWorkerHttp:true,tokenAuth:true,imageDecoded:true,missingModel503:true,inferenceVerified:false}));
} finally {
  if(worker && worker.exitCode===null) { const exited=new Promise(resolve=>worker.once('exit',resolve));worker.kill();await exited; }
  await app.close();await rm(dataDir,{recursive:true,force:true});
}
