import {listPackage,extractFile} from '@electron/asar';
import {access,readFile,readdir,lstat,writeFile} from 'node:fs/promises';import {join,resolve,relative} from 'node:path';import {fileURLToPath} from 'node:url';
export function validateArchiveEntries(entries:string[]){
 const paths=entries.map(p=>p.replaceAll('\\','/').replace(/^\/?/,'/'));const required=['/package.json','/dist/desktop/main.js','/dist/server/app.js','/dist/ui/index.html','/node_modules/sql.js/dist/sql-wasm.wasm'];
 for(const path of required)if(!paths.includes(path))throw new Error(`missing packaged runtime: ${path}`);
 // Match complete nonruntime directory names, never runtime filenames such as test.js.
 for(const path of paths)if(/^\/node_modules\/.+\/(test|tests|__tests__|spec|fixtures|bench|benchmark|benchmarks)(\/|$)/.test(path))throw new Error(`forbidden dependency payload: ${path}`);
 for(const path of paths)if(/^\/(src|tests|e2e|scripts|worker|voice_worker|models|\.data|\.git|\.superpowers|\.venv)(\/|$)/.test(path)||/(^|\/)\.env(?:\.|\/|$)/.test(path)||/(^|\/)(worker\.token|studio\.sqlite)(\/|$)/.test(path)||/^\/node_modules\/(electron-builder|vitest|@playwright|typescript|tsx)(\/|$)/.test(path))throw new Error(`forbidden packaged entry: ${path}`);
}
export async function verifyPayload(resources:string){
 const archive=join(resources,'app.asar'),entries=listPackage(archive,{isPack:false});validateArchiveEntries(entries);const pkg=JSON.parse(extractFile(archive,'package.json').toString());if(pkg.name!=='rgdqwer'||pkg.main!=='dist/desktop/main.js')throw new Error('Packaged application identity mismatch');
 for(const file of ['python/worker/run.py','python/worker/requirements-lock.txt','python/voice_worker/runner.py','python/voice_worker/adapters.py','THIRD_PARTY_NOTICES.txt','dependencies.json','app.asar.unpacked/node_modules/sql.js/dist/sql-wasm.wasm'])await access(join(resources,file));
 async function inspect(directory:string){for(const entry of await readdir(directory,{withFileTypes:true})){const path=join(directory,entry.name);if((await lstat(path)).isSymbolicLink())throw new Error('Symlink in Python payload');if(/^(tests|__pycache__|\.env|models)$/.test(entry.name))throw new Error(`forbidden Python payload: ${relative(resources,path)}`);if(entry.isDirectory())await inspect(path);else if(!/\.py$|^requirements.*\.txt$/.test(entry.name))throw new Error(`Unexpected Python payload: ${entry.name}`);}}
 await inspect(join(resources,'python'));const notices=JSON.parse(await readFile(join(resources,'dependencies.json'),'utf8'));if(!notices.packages?.length)throw new Error('Production dependency notices missing');return {packaged:true,version:pkg.version,entries:entries.length,pythonOutsideAsar:true,dependencyNotices:notices.packages.length};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const resources=process.argv[2];if(!resources)throw new Error('Usage: verify-payload.ts <resources> [report.json]');const report=await verifyPayload(resolve(resources));if(process.argv[3])await writeFile(process.argv[3],JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
