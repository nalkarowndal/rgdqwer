import { _electron as electron,expect } from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ownProfile,parseSmokeArgs} from './package-checks.js';
import {verifyPayload} from './verify-payload.js';
import {simulatedComfy} from '../tests/fixtures/comfy.js';
import type {Settings} from '../src/contracts.js';
import type {InstalledAsset,ModelTask} from '../src/models.js';

const options=parseSmokeArgs(process.argv.slice(2));await ownProfile(options.profile,options.mode);
await mkdir('test-results',{recursive:true});
const engine=await simulatedComfy();
let instance:Awaited<ReturnType<typeof electron.launch>>|undefined;
try{
 instance=await electron.launch({executablePath:options.executable,args:[`--user-data-dir=${options.profile}`,...(process.platform==='linux'?['--no-sandbox','--ozone-platform=headless']:[])],timeout:30000});
 const page=await instance.firstWindow();await page.getByRole('heading',{name:'당신의 아이디어, 당신의 컴퓨터에서.'}).waitFor();
 const runtime=await instance.evaluate(({app,BrowserWindow})=>{const contents=BrowserWindow.getAllWindows()[0].webContents as unknown as {getLastWebPreferences():{sandbox:boolean;contextIsolation:boolean;nodeIntegration:boolean;webSecurity:boolean}};const prefs=contents.getLastWebPreferences();return {packaged:app.isPackaged,appPath:app.getAppPath(),profile:app.getPath('userData'),resources:process.resourcesPath,security:{sandbox:prefs.sandbox,contextIsolation:prefs.contextIsolation,nodeIntegration:prefs.nodeIntegration,webSecurity:prefs.webSecurity}};});
 expect(runtime.packaged).toBe(true);expect(runtime.appPath.endsWith('app.asar')).toBe(true);expect(resolve(runtime.profile)).toBe(resolve(options.profile));
 expect(runtime.security).toEqual({sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true});
 const payload=await verifyPayload(runtime.resources);
 async function api<T>(path:string,method='GET',body?:unknown):Promise<T>{return page.evaluate(async({path,method,body})=>{const {token}=await fetch('/api/session').then(r=>r.json());const response=await fetch(path,{method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});if(!response.ok)throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);return response.json();},{path,method,body});}
 const bytes='QA fixture only; not an inference model\n';
 if(options.mode==='seed'){
  const settings=await api<Settings>('/api/settings');await api('/api/settings','PUT',{...settings,comfyUrl:engine.url,workerUrl:'http://127.0.0.1:65534',modelPath:'QA_PROFILE_SENTINEL',lowVram:false});
  const sourcePath=join(options.profile,'fixture.safetensors');await writeFile(sourcePath,bytes);
  const task=await api<ModelTask>('/api/models/import','POST',{sourcePath,confirmed:true,manifest:{name:'Packaged QA fixture',kind:'checkpoint',family:'sd15',fileName:'fixture.safetensors',bundle:'',sourceUrl:'https://example.com/qa',revision:'qa',license:'CC0',requiredAssets:[],requiredNodes:[],vramGiB:null}});
  await expect.poll(async()=>{const result=await api<{tasks:ModelTask[]}>('/api/models');return result.tasks.find(t=>t.id===task.id)?.state;},{timeout:15000}).toBe('completed');
 }
 const settings=await api<Settings>('/api/settings');expect(settings.modelPath).toBe('QA_PROFILE_SENTINEL');expect(settings.lowVram).toBe(false);
 const inventory=await api<{assets:InstalledAsset[]}>('/api/models');expect(inventory.assets).toHaveLength(1);const asset=inventory.assets[0];const modelFile=join(asset.root,asset.relativePath);expect(await readFile(modelFile,'utf8')).toBe(bytes);
 const result=await promisify(execFile)(process.env.STUDIO_PYTHON??'python',['-B',join(runtime.resources,'python/voice_worker/runner.py'),'status'],{timeout:30000,maxBuffer:1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});const pythonStatus=JSON.parse(result.stdout);
 await page.screenshot({path:`test-results/m8-packaged-${process.platform}-${options.mode}.png`});
 await instance.close();instance=undefined;
 const report={mode:options.mode,platform:process.platform,...runtime,payload,profileIsolated:true,settingsPersisted:true,modelPersisted:true,modelFile,pythonStatus,inferenceVerified:false,testOnlyLinuxSandboxOverride:process.platform==='linux'};
 await writeFile(options.report??`test-results/m8-packaged-${process.platform}-${options.mode}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{try{await instance?.close();}finally{await engine.close();}}
