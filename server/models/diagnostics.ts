import {lstat} from 'node:fs/promises';import {join} from 'node:path';import {z} from 'zod';
import {modelFolders,type InstalledAsset,type AssetDiagnostics,type ModelKind} from '../../src/models.js';
import type {ModelStore} from './manager.js';import {ComfyClient} from '../generation/client.js';import {noSymlinks} from './files.js';
const loaders:Partial<Record<ModelKind,[string,string]>>={checkpoint:['CheckpointLoaderSimple','ckpt_name'],lora:['LoraLoader','lora_name'],vae:['VAELoader','vae_name'],text_encoder:['CLIPLoader','clip_name'],video:['UNETLoader','unet_name']};
export async function diagnoseAssets(store:ModelStore):Promise<AssetDiagnostics[]>{
 const assets=store.listAssets();let nodes:Record<string,unknown>|undefined;
 try{nodes=z.record(z.unknown()).parse(await new ComfyClient(store.getSettings().comfyUrl,AbortSignal.timeout(10000)).json('/object_info'));}catch{/* Availability unknown; never report compatibility success. */}
 return Promise.all(assets.map(async asset=>{const issues:string[]=[];try{const path=join(asset.root,asset.relativePath);await noSymlinks(path);const info=await lstat(path);if(!info.isFile()||info.size!==asset.bytes)issues.push('모델 파일 크기 또는 형식이 변경되었습니다.');}catch{issues.push('모델 파일이 없거나 경로를 읽을 수 없습니다.');}
 for(const id of asset.requiredAssets)if(!assets.some(a=>a.id===id))issues.push(`필수 모델 누락: ${id}`);
 if(nodes)for(const node of asset.requiredNodes)if(!nodes[node])issues.push(`필수 노드 누락: ${node}`);
 const loader=loaders[asset.kind];let engineVisible:boolean|null=null;
 if(nodes&&loader){const parsed=z.object({input:z.object({required:z.record(z.unknown())})}).safeParse(nodes[loader[0]]);const names=parsed.success?z.tuple([z.array(z.string())]).rest(z.unknown()).safeParse(parsed.data.input.required[loader[1]]):null;const name=asset.relativePath.replaceAll('\\','/').split('/').slice(1).join('/');engineVisible=!!names?.success&&names.data[0].some(n=>n.replaceAll('\\','/')===name);if(!engineVisible)issues.push('엔진 목록에 없습니다. 경로 설정과 ComfyUI 재시작을 확인하세요.');}
 if(!nodes)issues.push('엔진 연결 전: 노드·모델 호환성 미확인');if(asset.kind==='voice'||asset.kind==='analysis')issues.push('독립 Python Worker 모델 경로를 수동 설정하세요.');
 return {id:asset.id,issues,engineVisible,historicalJobs:store.modelReferences(asset),dependents:assets.filter(a=>a.requiredAssets.includes(asset.id)).map(a=>a.name)};
 }));
}
export function exportPaths(root:string,assets:InstalledAsset[],customNodes:string){
 const roots=[...new Set([root,...assets.map(a=>a.root)])];let result='# Save as rgdqwer-model-paths.yaml; merge existing config or pass --extra-model-paths-config; restart ComfyUI.\n';
 roots.forEach((path,index)=>{result+=`rgdqwer_${index}:\n  base_path: ${JSON.stringify(path.replaceAll('\\','/'))}\n`;for(const [kind,folder] of Object.entries(modelFolders))if(!['voice','analysis'].includes(kind))result+=`  ${folder}: ${JSON.stringify(folder)}\n`;});
 result+=`rgdqwer_extensions:\n  custom_nodes: ${JSON.stringify(customNodes.replaceAll('\\','/'))}\n`;return result;
}
