import {existsSync} from 'node:fs';
import {dirname,isAbsolute,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
let resources:string|undefined;
/** Electron sets this explicitly; external Python cannot read files inside app.asar. */
export function configureResources(directory?:string){if(directory!==undefined&&!isAbsolute(directory))throw new Error('리소스 절대 경로가 필요합니다.');resources=directory;}
export function voiceRunnerPath(){
 const here=dirname(fileURLToPath(import.meta.url));const candidates=resources?[join(resources,'python','voice_worker','runner.py')]:[resolve(here,'../voice_worker/runner.py'),resolve(here,'../../voice_worker/runner.py')];
 const path=candidates.find(existsSync);if(!path)throw new Error('음성 Worker 파일이 없습니다. 설치본을 복구하거나 소스 경로를 확인하세요.');return path;
}
