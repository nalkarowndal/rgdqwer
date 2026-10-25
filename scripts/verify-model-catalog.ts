import {mkdir,writeFile} from 'node:fs/promises';
import {catalogFiles} from '../src/model-catalog.js';
import {resolveCatalogFiles} from '../server/models/catalog.js';
// Live metadata + bounded small Git data files only. Never request LFS model weights.
console.log(`Checking ${catalogFiles.length} curated model files against public provider metadata`);
const files=await resolveCatalogFiles(catalogFiles,{},AbortSignal.timeout(180000));
await mkdir('test-results',{recursive:true});
const report={checkedAt:new Date().toISOString(),publicMetadataVerified:true,weightDownloads:false,realInferenceVerified:false,files:files.map(({file,input})=>({id:file.id,repo:file.repo,path:file.path,revision:input.manifest.revision,bytes:input.bytes,sha256:input.sha256,sourceUrl:input.manifest.sourceUrl}))};
await writeFile('test-results/model-catalog-live.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({files:files.length,repositories:new Set(files.map(f=>f.file.repo)).size,weightDownloads:false}));
