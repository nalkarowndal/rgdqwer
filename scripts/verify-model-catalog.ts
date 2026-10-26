import {mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {catalogFiles} from '../src/model-catalog.js';
import {resolveCatalogFiles} from '../server/models/catalog.js';
import {downloadAsset} from '../server/models/download.js';
import {httpsResponse} from '../server/models/network.js';
// Resolve all metadata, then exercise real redirects/stream storage with two small components.
// Never download a multi-GB model or run inference.
console.log(`Checking ${catalogFiles.length} curated model files against public provider metadata`);
const signal=AbortSignal.timeout(240000);
const files=await resolveCatalogFiles(catalogFiles,{},signal);
const directory=await mkdtemp(join(tmpdir(),'rgdqwer-catalog-live-'));const downloaded:{id:string;bytes:number;sha256:string;rangeRequests:number;partialResponses:number}[]=[];
try{
 for(const id of ['wd14-tags','tts-ve']){
  const item=files.find(f=>f.file.id===id)!;if(item.input.bytes>8*1024**2)throw new Error('Live smoke refuses downloads larger than 8 MiB per component');
  let rangeRequests=0,partialResponses=0;
  const saved=await downloadAsset(item.input.manifest.sourceUrl,directory,item.input.manifest.fileName,item.input.bytes,item.input.sha256,signal,()=>{},randomUUID(),async(url,requestSignal,options)=>{if(options?.range)rangeRequests++;const response=await httpsResponse(url,requestSignal,options);if(response.status===206)partialResponses++;return response;});
  downloaded.push({id,bytes:saved.bytes,sha256:saved.sha256,rangeRequests,partialResponses});
 }
}finally{await rm(directory,{recursive:true,force:true});}
await mkdir('test-results',{recursive:true});
const report={checkedAt:new Date().toISOString(),publicMetadataVerified:true,largeWeightDownloads:false,realInferenceVerified:false,downloaded,files:files.map(({file,input})=>({id:file.id,repo:file.repo,path:file.path,revision:input.manifest.revision,bytes:input.bytes,sha256:input.sha256,sourceUrl:input.manifest.sourceUrl}))};
await writeFile('test-results/model-catalog-live.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({files:files.length,repositories:new Set(files.map(f=>f.file.repo)).size,downloaded,largeWeightDownloads:false}));
